import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleHostHook, type HostHookEvent } from '../src/host/hook.ts';
import { ensureHostSession } from '../src/host/session.ts';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { reportTask } from '../src/workflow/report.ts';
import { prepareAdoption, decideAdoption } from '../src/workflow/adoption.ts';
import { authorTask } from '../src/workflow/author.ts';
import { artifacts } from '../src/workflow/common.ts';
import { loadTask } from '../src/workflow/task-store.ts';
import { assessmentInput, beginInput, reportInput, repository } from './fixtures/task.ts';

for (const adapter of ['codex', 'claude'] as const) test(`${adapter} native event fixtures bind one Analyzer, record its result once, and await Human adoption`, async () => {
  const root = repository();
  const hook = (event: HostHookEvent, extra: Record<string, unknown> = {}) => handleHostHook({ adapter, event,
    payload: { session_id: 'native-session', cwd: root, hook_event_name: events[event], ...extra } });
  try {
    const started = await hook('session-start'); assert.match(JSON.stringify(started), /admission: ask/);
    assert.equal(readdirSync(join(root, '.stetra')).includes('tasks'), false);
    const session = ensureHostSession({ projectRoot: root, adapter, sessionId: 'native-session' });
    const began = await beginTask({ projectRoot: root, source: beginInput(), bindingToken: session.bindingToken });
    const input = { projectRoot: root, taskId: began.taskId, bindingToken: session.bindingToken };
    assert.equal((await hook('stop')).decision, 'block');
    assert.equal('decision' in await hook('stop'), false);
    assert.match(JSON.stringify(await hook('session-start')), new RegExp(began.taskId));
    writeFileSync(join(root, 'app.txt'), 'new\n'); await collectTask(input);
    const report = await reportTask({ ...input, source: reportInput() });
    const child = { agent_id: 'analyzer-1', agent_type: 'stetra-analyzer', turn_id: 'turn-1' };
    const childContext = await hook('subagent-start', child);
    assert.match(JSON.stringify(childContext), new RegExp(report.current.requestId!));
    assert.deepEqual(await hook('stop', child), {});
    const result = { ...child, last_assistant_message: JSON.stringify(assessmentInput(report.current.requestId!)) };
    assert.match(String((await hook('subagent-stop', result)).systemMessage), /assessment-recorded/);
    assert.match(String((await hook('subagent-stop', result)).systemMessage), /assessment-reused/);
    const state = loadTask(root, began.taskId).state;
    assert.equal(artifacts(state, 'assessment').length, 1);
    const origin = artifacts(state, 'assessment')[0].origin;
    assert.equal(origin.transport, 'host-hook');
    if (origin.transport !== 'host-hook') assert.fail('missing native receipt');
    assert.equal(origin.host, adapter); assert.equal(origin.turnId, adapter === 'codex' ? 'turn-1' : undefined);
    const packet = await prepareAdoption({ ...input, source: { recommendation: { action: 'accept', rationale: 'The retained sources match the request.' } } });
    assert.deepEqual(packet.adoptionBrief!.attention, []);
    const stop = await hook('stop'); assert.equal('decision' in stop, false); assert.match(String(stop.systemMessage), /--section adoption --live/);
    await decideAdoption({ ...input, source: { packageId: packet.current.packageId!, action: 'accepted',
      humanEvent: { content: 'I accept this exact result.' }, reason: 'Reviewed the explanation and sources.' } });
    assert.deepEqual(await hook('stop'), {});
    const redelivered = await hook('subagent-stop', result);
    assert.equal('decision' in redelivered, false);
    assert.match(String(redelivered.systemMessage), /assessment-reused/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid native result gets one repair continuation and an explicit portable fallback', async () => {
  const root = repository();
  try {
    const session = ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'format' });
    const began = await beginTask({ projectRoot: root, source: beginInput(), bindingToken: session.bindingToken });
    const input = { projectRoot: root, taskId: began.taskId, bindingToken: session.bindingToken };
    await collectTask(input); const report = await reportTask({ ...input, source: reportInput() });
    const payload = { session_id: 'format', cwd: root, agent_id: 'child', agent_type: 'stetra-analyzer' };
    const hook = (event: 'subagent-start' | 'subagent-stop', output?: string) => handleHostHook({ adapter: 'codex', event,
      payload: { ...payload, hook_event_name: events[event], last_assistant_message: output } });
    await hook('subagent-start');
    assert.equal((await hook('subagent-stop', 'not JSON')).decision, 'block');
    const repeated = await hook('subagent-stop', '{"different":"invalid"}');
    assert.equal('decision' in repeated, false); assert.match(String(repeated.systemMessage), /permits stop/);
    assert.equal(artifacts(loadTask(root, began.taskId).state, 'assessment').length, 0);
    const repaired = await hook('subagent-stop', JSON.stringify(assessmentInput(report.current.requestId!)));
    assert.match(String(repaired.systemMessage), /assessment-recorded/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('late native result remains historical, and native agent identity cannot bind a different request', async () => {
  const root = repository();
  try {
    const session = ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'late' });
    const began = await beginTask({ projectRoot: root, source: beginInput(), bindingToken: session.bindingToken });
    const input = { projectRoot: root, taskId: began.taskId, bindingToken: session.bindingToken };
    await collectTask(input); const report = await reportTask({ ...input, source: reportInput() });
    const child = { session_id: 'late', cwd: root, agent_id: 'child-1', agent_type: 'stetra-analyzer' };
    await handleHostHook({ adapter: 'codex', event: 'subagent-start', payload: { ...child, hook_event_name: 'SubagentStart' } });
    authorTask({ ...input, command: { type: 'amend', input: { kind: 'interpretation', interpretation: beginInput().interpretation, reason: 'Clarified evidence needs.' } } });
    // Force an explicit new assessment even if the interpretation's semantic projection is unchanged.
    const next = await reportTask({ ...input, source: { ...reportInput(), reassessReason: 'Reconsider the source evidence.' } });
    const rebound = await handleHostHook({ adapter: 'codex', event: 'subagent-start', payload: { ...child, hook_event_name: 'SubagentStart' } });
    assert.match(String(rebound.systemMessage), /another analysis request/);
    const late = await handleHostHook({ adapter: 'codex', event: 'subagent-stop', payload: { ...child, hook_event_name: 'SubagentStop',
      last_assistant_message: JSON.stringify(assessmentInput(report.current.requestId!)) } });
    assert.match(String(late.systemMessage), /historical/);
    const state = loadTask(root, began.taskId).state;
    assert.equal(state.requestId, next.current.requestId); assert.equal(state.assessmentId, undefined);
    assert.equal(artifacts(state, 'assessment')[0].currentAtSubmission, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('child routing creates no task, unrelated profiles are inert, and payload mismatches are rejected', async () => {
  const root = repository(), absent = mkdtempSync(join(tmpdir(), 'stetra-no-install-'));
  try {
    const payload = { session_id: 'unbound', cwd: root, hook_event_name: 'SubagentStart', agent_id: 'child', agent_type: 'stetra-analyzer' };
    assert.match(JSON.stringify(await handleHostHook({ adapter: 'claude', event: 'subagent-start', payload })), /unavailable/);
    assert.equal(readdirSync(join(root, '.stetra')).includes('tasks'), false);
    assert.deepEqual(await handleHostHook({ adapter: 'claude', event: 'subagent-start', payload: { ...payload, agent_type: 'owner-agent' } }), {});
    assert.deepEqual(await handleHostHook({ adapter: 'codex', event: 'session-start', payload: { session_id: 'none', cwd: absent, hook_event_name: 'SessionStart' } }), {});
    await assert.rejects(() => handleHostHook({ adapter: 'codex', event: 'stop', payload }), /must be Stop/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(absent, { recursive: true, force: true }); }
});

const events = { 'session-start': 'SessionStart', 'subagent-start': 'SubagentStart', 'subagent-stop': 'SubagentStop', stop: 'Stop' } as const;
