import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { runCli, formatCliOutput } from '../src/cli.ts';
import { ensureHostSession } from '../src/host/session.ts';
import { describeTaskInput, inputCommandNames, taskInputExamples, type InputKind } from '../src/schemas/task-input.ts';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { decideAdoption } from '../src/workflow/adoption.ts';
import { inspectTask } from '../src/workflow/inspect.ts';
import { commitTaskCommand, loadTask, withWorktreeLease } from '../src/workflow/task-store.ts';
import { acquireLock, releaseLock, writeImmutableJson } from '../src/workflow/storage-io.ts';
import { beginInput, prepare, repository } from './fixtures/task.ts';

test('CLI preserves exact Human text and assertion/preparation argv, including empty arguments', async () => {
  const root = repository();
  try {
    const source = beginInput();
    const argv: [string, ...string[]] = [process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '  padded  ', ''];
    source.verification = { mode: 'checks', checks: [{ key: 'args', argv, preparation: [{ key: 'prepare', argv }] }] };
    const result = await runCli(['--json', 'task', 'begin', root], { input: Readable.from([JSON.stringify(source)]) });
    const taskId = (result.output as { taskId: string }).taskId, input = { projectRoot: root, taskId };
    const intent = await inspectTask({ ...input, section: 'intent' });
    assert.ok('humanEvents' in intent); assert.equal(intent.humanEvents[0].content, source.humanEvent.content);
    await collectTask(input);
    const check = await inspectTask({ ...input, section: 'check', checkKey: 'args' });
    assert.ok('selectedAttempt' in check); assert.deepEqual(check.selectedAttempt!.steps.map((step) => step.argv), [argv, argv]);
    const log = await inspectTask({ ...input, section: 'log', checkKey: 'args', stream: 'stdout' });
    assert.ok('log' in log); assert.equal(log.log!.content, '["  padded  ",""]');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('all input schemas are discoverable without a repository and input errors identify the current schema', async () => {
  for (const stage of Object.keys(inputCommandNames) as InputKind[]) {
    if (stage === 'collect') continue;
    const result = await runCli(['--json', ...inputCommandNames[stage].split(' '), join(tmpdir(), 'stetra-absent'), '--input-schema']);
    assert.deepEqual(result.output, describeTaskInput(stage));
    assert.deepEqual((result.output as { example: unknown }).example, JSON.parse(JSON.stringify(taskInputExamples[stage])));
    assert.match(formatCliOutput(result), /additionalProperties/);
  }
  await assert.rejects(() => runCli(['task', 'report', '--task', 'fixture'], { input: Readable.from(['{"report":{}}']) }), /task report --input-schema --json/);
  await assert.rejects(() => runCli(['adoption', 'decide']), /requires --task/);
  await assert.rejects(() => runCli(['task', 'begin'], { input: Readable.from([]) }), /empty/i);
});

test('same-session Begin is idempotent; a later admitted task follows an exact closed task', async () => {
  const root = repository();
  try {
    const { bindingToken } = ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'continuity' });
    const begin = { projectRoot: root, source: beginInput(), bindingToken };
    const first = await beginTask(begin), input = { projectRoot: root, taskId: first.taskId };
    assert.equal((await beginTask(begin)).taskId, first.taskId);
    await assert.rejects(() => beginTask({ ...begin, source: { ...beginInput(), humanEvent: { content: 'A different task.' } } }), /unfinished task/);
    await collectTask(input); const packet = await prepare(input);
    await decideAdoption({ ...input, source: { packageId: packet.current.packageId!, action: 'rejected', humanEvent: { content: 'Reject this result.' }, reason: 'Different wording is needed.' } });
    const next = await beginTask(begin); assert.notEqual(next.taskId, first.taskId); assert.equal(taskCount(root), 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const phase of ['before', 'after']) test(`Begin recovers exact admission after process death ${phase} publication`, async () => {
  const root = repository();
  try {
    const { bindingToken } = ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'crash' });
    const interrupted = spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'fixtures/interrupted-begin.mjs'), phase, root, bindingToken],
      { input: JSON.stringify(beginInput()), encoding: 'utf8' });
    assert.equal(interrupted.status, phase === 'before' ? 71 : 72, interrupted.stderr);
    const session = ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'crash' });
    assert.ok(session.pendingBegin); assert.equal(taskCount(root), phase === 'before' ? 0 : 1);
    const resumed = await beginTask({ projectRoot: root, source: beginInput(), bindingToken });
    assert.equal(resumed.taskId, session.pendingBegin.taskId); assert.equal(taskCount(root), 1);
    assert.equal(ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'crash' }).pendingBegin, undefined);
    assert.equal(readdirSync(join(root, '.stetra/staging')).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('non-timeout refresh records external recovery, retains failure, and cannot loop on unchanged inputs', async () => {
  const root = repository(), external = mkdtempSync(join(tmpdir(), 'stetra-external-'));
  try {
    const flag = join(external, 'available'), source = beginInput();
    source.verification = { mode: 'checks', checks: [{ key: 'service', argv: [process.execPath, '-e',
      `process.exit(require('node:fs').existsSync(${JSON.stringify(flag)})?0:1)`] }] };
    const began = await beginTask({ projectRoot: root, source }), input = { projectRoot: root, taskId: began.taskId };
    const first = await collectTask(input); assert.equal(first.summary.observations!.checks[0].status, 'failed');
    assert.equal((await collectTask(input)).status, 'observations-reused');
    await assert.rejects(() => collectTask({ ...input, refreshReason: ' ' }), /reason/);
    writeFileSync(flag, 'available');
    const refreshed = await collectTask({ ...input, refreshReason: 'The external fixture service recovered.' });
    assert.equal(refreshed.summary.observations!.checks[0].status, 'passed');
    assert.equal(refreshed.summary.observations!.refresh!.priorObservationId, first.current.observationId);
    const prior = await inspectTask({ ...input, section: 'check', observationId: first.current.observationId, checkKey: 'service' });
    assert.ok('selectedAttempt' in prior); assert.equal(prior.selectedAttempt!.status, 'failed');
    await assert.rejects(() => collectTask({ ...input, refreshReason: 'Again.' }), /non-timeout|already used/);
    rmSync(flag); writeFileSync(join(root, 'notes.md'), 'A distinct state.\n'); await collectTask(input);
    await collectTask({ ...input, refreshReason: 'Explicit recheck.' });
    await assert.rejects(() => collectTask({ ...input, refreshReason: 'Repeat unchanged.' }), /already used/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});

test('immutable journal recovers without its projection and read-only inspection does not repair files', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput() }), input = { projectRoot: root, taskId: began.taskId };
    await collectTask(input); const task = loadTask(root, began.taskId);
    writeFileSync(join(task.taskDirectory, 'task.json'), 'corrupt cache');
    const before = treeBytes(task.taskDirectory);
    await inspectTask({ ...input, section: 'history' }); await inspectTask({ ...input, section: 'baseline' });
    assert.deepEqual(treeBytes(task.taskDirectory), before);
    assert.throws(() => commitTaskCommand({ ...input, expectedRevision: 0, command: { type: 'amend', input: {
      kind: 'interpretation', interpretation: beginInput().interpretation, reason: 'Outdated writer.' } } }), /advanced/);
    assert.equal(loadTask(root, began.taskId).state.revision, task.state.revision);
    const event = join(task.taskDirectory, 'events/000000000002.json'); rmSync(event);
    assert.equal(loadTask(root, began.taskId).state.revision, 1);
    assert.equal(loadTask(root, began.taskId).state.observationId, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('storage rejects symlink redirection, concurrent writers, immutable replacement, and unknown cleanup targets', async () => {
  const root = repository(), external = mkdtempSync(join(tmpdir(), 'stetra-owner-'));
  try {
    const lockPath = join(root, '.stetra/worktree-operation.lock'), lock = acquireLock(lockPath, 'fixture');
    await assert.rejects(() => beginTask({ projectRoot: root, source: beginInput() }), /owns/); releaseLock(lock);
    const owner = join(root, '.stetra/staging/owner-directory'); mkdirSync(owner, { recursive: true }); writeFileSync(join(owner, 'note'), 'owner bytes');
    await withWorktreeLease({ projectRoot: root, operation: 'fixture' }, async () => {});
    assert.equal(readFileSync(join(owner, 'note'), 'utf8'), 'owner bytes');
    writeImmutableJson(join(root, 'immutable.json'), { value: 1 });
    assert.throws(() => writeImmutableJson(join(root, 'immutable.json'), { value: 2 }));
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'immutable.json'), 'utf8')), { value: 1 });
    symlinkSync(external, join(root, '.stetra/tasks'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => beginTask({ projectRoot: root, source: beginInput() }), /symlink/);
    assert.deepEqual(readdirSync(external), []);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});

function taskCount(root: string): number { const directory = join(root, '.stetra/tasks'); return existsSync(directory) ? readdirSync(directory).length : 0; }
function treeBytes(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) if (entry.isFile()) {
    const path = join(entry.parentPath, entry.name); result[path] = readFileSync(path).toString('base64');
  }
  return result;
}
