import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { reportTask } from '../src/workflow/report.ts';
import { decideAdoption, prepareAdoption } from '../src/workflow/adoption.ts';
import { submitAssessment } from '../src/workflow/assessment.ts';
import { authorTask } from '../src/workflow/author.ts';
import { inspectTask } from '../src/workflow/inspect.ts';
import { loadTask } from '../src/workflow/task-store.ts';
import { artifact, artifacts } from '../src/workflow/common.ts';
import { assessmentInput, beginInput, configure, prepare, reportInput, repository } from './fixtures/task.ts';

test('routine task preserves exact direction, observed checks, separate analysis, and later adoption', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput(true) });
    const input = { projectRoot: root, taskId: began.taskId };
    assert.equal(began.phase, 'work');
    assert.equal(artifacts(loadTask(root, began.taskId).state, 'human-event')[0].content, beginInput().humanEvent.content);
    writeFileSync(join(root, 'app.txt'), 'new\n');
    const observed = await collectTask(input);
    assert.equal(observed.summary.observations!.checks[0].status, 'passed');
    assert.deepEqual(observed.summary.observations!.changedFiles.map((f) => f.path), ['app.txt']);
    assert.equal((await collectTask(input)).status, 'observations-reused');
    const packet = await prepare(input);
    assert.equal(packet.adoptionBrief!.current, true);
    assert.equal(packet.adoptionBrief!.humanChoice, 'pending');
    assert.deepEqual(packet.adoptionBrief!.attention.map((a) => a.code), ['analysis-relayed']);
    await assert.rejects(() => decideAdoption({ ...input, source: { packageId: packet.current.packageId!,
      action: 'accepted', humanEvent: { content: 'Accept.' }, reason: 'Reviewed.' } }), /acknowledg/i);
    const result = await decideAdoption({ ...input, source: { packageId: packet.current.packageId!,
      action: 'accepted', humanEvent: { content: 'Accept, including the relayed analysis limitation.' }, reason: 'Reviewed.',
      acknowledge: packet.adoptionBrief!.attention.map((a) => a.id) } });
    assert.equal(result.phase, 'complete');
    assert.deepEqual(loadTask(root, began.taskId).events.map((e) => e.event.type), ['begin', 'collect', 'report', 'assess', 'prepare', 'decide']);
    await assert.rejects(() => collectTask(input), /closed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed check is inspectable, repair preserves prior observation, and correction keeps the original baseline', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput(true) });
    const input = { projectRoot: root, taskId: began.taskId };
    const original = loadTask(root, began.taskId).state.baselineId;
    writeFileSync(join(root, 'app.txt'), 'wrong\n');
    const failed = await collectTask(input);
    assert.equal(failed.summary.observations!.checks[0].status, 'failed');
    const log = await inspectTask({ ...input, section: 'log', checkKey: 'content', stream: 'stderr', maxBytes: 64 });
    assert.ok('log' in log); assert.match(log.log!.content, /expected new/);
    writeFileSync(join(root, 'app.txt'), 'new\n');
    await collectTask(input);
    const prior = await inspectTask({ ...input, section: 'check', checkKey: 'content', observationId: failed.current.observationId });
    assert.ok('selectedAttempt' in prior); assert.equal(prior.selectedAttempt!.status, 'failed');
    const packet = await prepare(input);
    const correction = await decideAdoption({ ...input, source: { packageId: packet.current.packageId!, action: 'correction-requested',
      humanEvent: { content: 'Also preserve the trailing marker.' }, reason: 'Clarify the requirement.',
      correction: { desiredOutcome: 'New text with marker.', constraints: ['Keep the file name.'], nonGoals: [] } } });
    const state = loadTask(root, began.taskId).state;
    assert.equal(state.attemptNumber, 2); assert.equal(state.baselineId, original);
    assert.equal(artifacts(state, 'observation').length, 2);
    assert.equal(correction.directive.kind, 'report');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('edits invalidate report and acceptance; historical source and patch stay frozen and bounded', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput() });
    const input = { projectRoot: root, taskId: began.taskId };
    writeFileSync(join(root, 'app.txt'), 'new\n'); await collectTask(input);
    const packet = await prepare(input);
    writeFileSync(join(root, 'app.txt'), 'later\n');
    const frozen = await inspectTask({ ...input, section: 'source', requestId: packet.current.requestId, snapshot: 'current', path: 'app.txt', maxBytes: 2 });
    assert.ok('content' in frozen); assert.equal(frozen.content, 'ne'); assert.equal(frozen.nextOffset, 2);
    const baseline = await inspectTask({ ...input, section: 'source', requestId: packet.current.requestId, snapshot: 'baseline', path: 'app.txt' });
    assert.ok('content' in baseline); assert.equal(baseline.content, 'old\n');
    const patch = await inspectTask({ ...input, section: 'patch', maxBytes: 8 });
    assert.ok('patch' in patch); assert.equal(patch.patch!.returnedBytes, 8);
    const readOnly = await inspectTask({ ...input, section: 'adoption' });
    assert.ok('adoptionBrief' in readOnly); assert.equal(readOnly.adoptionBrief!.current, false);
    assert.equal(readOnly.adoptionBrief!.factsCurrency, 'unobserved');
    const live = await inspectTask({ ...input, section: 'adoption', live: true });
    assert.ok('adoptionBrief' in live); assert.equal(live.adoptionBrief!.factsCurrency, 'stale');
    const revision = loadTask(root, began.taskId).state.revision;
    await assert.rejects(() => reportTask({ ...input, source: reportInput() }), /current|stale/i);
    await assert.rejects(() => decideAdoption({ ...input, source: { packageId: packet.current.packageId!, action: 'accepted',
      humanEvent: { content: 'Accept.' }, reason: 'Reviewed.', acknowledge: packet.adoptionBrief!.attention.map((a) => a.id) } }), /current|stale/i);
    assert.equal(loadTask(root, began.taskId).state.revision, revision);
    await assert.rejects(() => inspectTask({ ...input, section: 'source', requestId: packet.current.requestId, snapshot: 'current', path: '../outside' }));
    await assert.rejects(() => inspectTask({ ...input, section: 'source', requestId: packet.current.requestId, snapshot: 'current', path: 'app.txt', maxBytes: 65537 }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('timeout retry preserves both attempts and cannot change non-timeout checks or exceed its bound', async () => {
  const root = repository();
  try {
    configure(root, (config) => { config.executionPolicy = { checkTimeoutMs: 25, maxTimeoutMs: 2000, maxTimeoutRetriesPerCheck: 1 }; });
    const source = beginInput();
    source.verification = { mode: 'checks', checks: [{ key: 'slow', argv: [process.execPath, '-e', 'setTimeout(()=>process.exit(0),120)'] }] };
    const began = await beginTask({ projectRoot: root, source }), input = { projectRoot: root, taskId: began.taskId };
    const first = await collectTask(input);
    assert.equal(first.summary.observations!.checks[0].termination.kind, 'timeout');
    await assert.rejects(() => collectTask({ ...input, retryTimeout: { checkKey: 'slow', timeoutMs: 25 } }), /larger bounded/);
    await assert.rejects(() => collectTask({ ...input, retryTimeout: { checkKey: 'slow', timeoutMs: 2001 } }), /larger bounded/);
    await assert.rejects(() => collectTask({ ...input, refreshReason: 'Try again.' }), /non-timeout/);
    const retried = await collectTask({ ...input, retryTimeout: { checkKey: 'slow', timeoutMs: 1800 } });
    assert.equal(retried.summary.observations!.checks[0].status, 'passed');
    const check = await inspectTask({ ...input, section: 'check', checkKey: 'slow' });
    assert.ok('selectedAttempt' in check); assert.deepEqual(check.check!.attempts.map((a) => a.termination.kind), ['timeout', 'exit']);
    await assert.rejects(() => collectTask({ ...input, retryTimeout: { checkKey: 'slow', timeoutMs: 1900 } }), /actual timeout/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('in-work decisions and intent changes invalidate semantics without replacing useful collected facts', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput() }), input = { projectRoot: root, taskId: began.taskId };
    writeFileSync(join(root, 'app.txt'), 'new\n'); await collectTask(input);
    const first = await reportTask({ ...input, source: reportInput() });
    authorTask({ ...input, command: { type: 'propose', input: {
      key: 'format', question: 'How should the literal be stored?', proposedOption: 'plain', requiresHuman: false,
      options: [{ key: 'plain', description: 'Plain text', consequences: ['Existing readers remain valid.'] },
        { key: 'json', description: 'JSON string', consequences: ['Readers require a parser.'] }],
      selection: { option: 'plain', authority: { kind: 'existing-authority', basis: ['request'], rationale: 'The requested literal replacement is authorized.' } },
    } } });
    submitAssessment({ ...input, source: assessmentInput(first.current.requestId!) });
    const state = loadTask(root, began.taskId).state;
    assert.equal(state.assessmentId, undefined); assert.equal(artifacts(state, 'assessment')[0].currentAtSubmission, false);
    assert.equal(state.observationId, first.current.observationId);
    authorTask({ ...input, command: { type: 'amend', input: { kind: 'interpretation',
      interpretation: { desiredOutcome: 'The literal replacement preserves the reader format.', constraints: [], nonGoals: [] }, reason: 'Clarified the existing request.' } } });
    const next = await reportTask({ ...input, source: reportInput() });
    assert.notEqual(next.current.requestId, first.current.requestId);
    const analysis = await inspectTask({ ...input, section: 'analysis', requestId: first.current.requestId });
    assert.ok('analysis' in analysis); assert.deepEqual(analysis.analysis.decisions, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unavailable analysis is an explicit adoption limitation and never becomes a clean assessment', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput() }), input = { projectRoot: root, taskId: began.taskId };
    await collectTask(input); const report = await reportTask({ ...input, source: reportInput() });
    submitAssessment({ ...input, source: { kind: 'unavailable', requestId: report.current.requestId!, reason: 'Host does not expose a separate analysis context.' } });
    await assert.rejects(() => prepareAdoption({ ...input, source: { recommendation: { action: 'accept', rationale: 'No findings.' } } }), /accept|Attention|attention/i);
    const packet = await prepareAdoption({ ...input, source: { recommendation: { action: 'defer', rationale: 'Analysis is unavailable.' } } });
    assert.ok(packet.adoptionBrief!.attention.some((a) => a.code === 'analysis-unavailable'));
    assert.deepEqual(packet.summary.pendingDecisions, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
