import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { evaluateAdoption, planTransition, reduceTaskEvent, schemas,
  type RuntimeInputs, type TaskCommand, type TaskState, type TaskArtifact, type WorktreeSnapshot } from '../src/index.ts';
import { fingerprint } from '../src/protocol.ts';

const taskId = '00000000-0000-4000-8000-000000000001';
const interpretation = { desiredOutcome: 'Implement the requested behavior.', constraints: [], nonGoals: [] };
const report = { behavior: 'The current behavior is explained.', mechanism: ['Read the declared source.'] };
const verification = { mode: 'no-command' as const, rationale: 'No executable check is applicable to this fixture.' };
const digest = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
function snapshot(content = 'baseline'): WorktreeSnapshot {
  const data = { head: null, treeId: createHash('sha1').update(content).digest('hex'),
    entries: [{ path: 'file.txt', kind: 'file' as const, mode: '100644', contentDigest: digest(content) }] };
  return { source: 'git-worktree-tree', ...data, fingerprint: fingerprint(data) };
}
const baseline = snapshot();
const currency = { worktreeFingerprint: baseline.fingerprint, executionInputsFingerprint: fingerprint([]) };
type SemanticInput = Extract<Extract<TaskCommand, { type: 'assess' }>['input'], { kind: 'assessment' }>;
function harness() {
  let state: TaskState | null = null;
  let operation = 100;
  const inputs = (extra: Partial<RuntimeInputs> = {}): RuntimeInputs => ({ taskId,
    operationId: `00000000-0000-4000-8000-${String(operation++).padStart(12, '0')}`, currency, ...extra });
  const execute = (command: TaskCommand, extra: Partial<RuntimeInputs> = {}) => {
    const before = state;
    const context = inputs(extra);
    const result = planTransition(state, command, context);
    if (result.status === 'invalid') assert.fail(JSON.stringify(result.issues));
    assert.deepEqual(planTransition(before, command, context), result, 'identical inputs are deterministic');
    if (result.status === 'transition') assert.deepEqual(reduceTaskEvent(before, result.event, result.artifacts), result.state);
    state = result.state;
    return result;
  };
  const fail = (command: TaskCommand, code: string, extra: Partial<RuntimeInputs> = {}) => {
    const result = planTransition(state, command, inputs(extra));
    assert.equal(result.status, 'invalid');
    if (result.status === 'invalid') assert.ok(result.issues.some((issue) => issue.code === code), JSON.stringify(result.issues));
  };
  const begin = (content = '  Implement this exact request.\n') => execute({ type: 'begin', input: {
    humanEvent: { content }, interpretation, verification,
  } }, { baseline, verification, executionPolicy: schemas.defaults.executionPolicy });
  const collect = () => execute({ type: 'collect', input: {} }, { observation: {
    baselineFingerprint: baseline.fingerprint, preCheck: baseline, current: baseline,
    preCheckExecutionInputs: [], currentExecutionInputs: [], changeFingerprint: fingerprint([]),
    changedFiles: [], checkInducedChanges: [], checks: [], verifierMutations: [],
    environment: { platform: 'test', architecture: 'test', executables: [] },
    provenance: { collector: 'stetra-cli', cliVersion: '0.0.1', coreVersion: '0.0.1' },
  } });
  const assess = (findings: SemanticInput['findings'] = []) => execute({ type: 'assess', input: {
    kind: 'assessment', requestId: state!.requestId!, context: 'separate-context', summary: 'Observed the bound implementation.',
    claims: [{ key: 'behavior', before: 'Original behavior.', after: 'Current behavior.', mechanism: 'Source implementation.',
      evidence: [{ kind: 'source', snapshot: 'current', path: 'file.txt' }] }],
    relations: [{ claimKey: 'behavior', basis: { kind: 'request' }, explanation: 'The request already authorizes this behavior.' }],
    findings,
  } }, { analysisOrigin: { transport: 'host-hook', host: 'codex',
    sessionHash: digest('session'), agentId: 'child', agentType: 'stetra-analyzer', outputDigest: digest('result') } });
  const delivered = () => { begin(); collect(); execute({ type: 'report', input: { report } }); assess(); };
  return { get state() { return state!; }, inputs, execute, fail, begin, collect, assess, delivered };
}
const proposal = {
  key: 'storage', question: 'Where should this result live?', requiresHuman: true,
  options: [{ key: 'local', description: 'Local storage.', consequences: ['Local visibility.'] },
    { key: 'shared', description: 'Shared storage.', consequences: ['Shared visibility.'] }],
  waitingWork: ['Implement the selected persistence behavior.'],
};
const get = <K extends TaskArtifact['kind']>(state: TaskState, kind: K) =>
  state.records.filter((item): item is Extract<TaskArtifact, { kind: K }> => item.kind === kind).at(-1)!;

test('initial protocol and exact schemas preserve Human text and reject invented fields', () => {
  const h = harness(); h.begin();
  assert.equal(schemas.schemaVersion, '1');
  assert.equal(get(h.state, 'human-event').content, '  Implement this exact request.\n');
  assert.equal(get(h.state, 'human-event').provenance, 'unattested-input');
  assert.equal(get(h.state, 'intent').assurance.mode, 'routine');
  assert.equal(h.state.observationId, undefined);
  assert.throws(() => schemas.commands.begin.parse({ humanEvent: { content: 'x' }, interpretation, riskScore: 1 }));
  assert.throws(() => schemas.checkDefinitionInput.parse({ key: 'test', argv: [''] }));
  assert.deepEqual(schemas.checkDefinitionInput.parse({ key: 'test', argv: ['node', '', ' x '] }).argv, ['node', '', ' x ']);
  assert.throws(() => schemas.repositoryPath.parse('../outside'));
});

test('a normal delivery separates report, assessment, recommendation and exact later adoption', () => {
  const h = harness(); h.delivered();
  h.execute({ type: 'prepare', input: { recommendation: { action: 'accept', rationale: 'The evidence supports this result.' } } });
  assert.equal(evaluateAdoption(h.state, currency).next, 'await-human-decision');
  assert.equal(h.state.closed, false);
  assert.equal(h.state.records.some((item) => item.kind === 'adoption-decision'), false);
  h.execute({ type: 'decide', input: { packageId: h.state.packageId!, humanEvent: { content: ' Accept this result.\n' },
    action: 'accepted', reason: 'Exact developer adoption.' } });
  assert.equal(h.state.closed, true);
  assert.equal(get(h.state, 'human-event').content, ' Accept this result.\n');
  h.fail({ type: 'report', input: { report } }, 'TASK_CLOSED');
});

test('existing authority records autonomous decisions without a Human interruption', () => {
  const h = harness(); h.begin();
  h.execute({ type: 'propose', input: { ...proposal, requiresHuman: false,
    selection: { option: 'local', authority: { kind: 'existing-authority', basis: ['request'], rationale: 'The request permits local storage.' } } } });
  assert.equal(get(h.state, 'decision-resolution').actor, 'agent');
  assert.deepEqual(evaluateAdoption(h.state).pendingDecisions, []);
  h.fail({ type: 'propose', input: { ...proposal, key: 'other', requiresHuman: false,
    selection: { option: 'local', authority: { kind: 'existing-authority', basis: ['invented'], rationale: 'Claim.' } } } }, 'REFERENCE_INVALID');
});

test('Human choices bind to exact proposals; a new proposal cannot reuse approval', () => {
  const h = harness(); h.begin(); h.execute({ type: 'propose', input: proposal });
  const proposalId = get(h.state, 'decision-proposal').id;
  h.fail({ type: 'resolve', input: { decisionKey: 'storage', proposalId, option: 'local',
    authority: { kind: 'existing-authority', basis: ['request'], rationale: 'I prefer this.' } } }, 'HUMAN_RESOLUTION_REQUIRED');
  h.execute({ type: 'resolve', input: { decisionKey: 'storage', proposalId, option: 'local',
    authority: { kind: 'human', humanEvent: { content: 'Choose local storage.' } } } });
  h.execute({ type: 'propose', input: { ...proposal, question: 'A different persistence choice.' } });
  h.fail({ type: 'resolve', input: { decisionKey: 'storage', proposalId, option: 'local',
    authority: { kind: 'human', humanEvent: { content: 'Yes.' } } } }, 'PROPOSAL_SUPERSEDED');
  assert.deepEqual(evaluateAdoption(h.state).pendingDecisions, ['storage']);
});

test('Intent revisions preserve baseline/facts and require explicit applicability revalidation', () => {
  const h = harness(); h.begin(); h.execute({ type: 'propose', input: proposal });
  const proposalId = get(h.state, 'decision-proposal').id;
  h.execute({ type: 'resolve', input: { decisionKey: 'storage', proposalId, option: 'local',
    authority: { kind: 'human', humanEvent: { content: 'Choose local storage.' } } } });
  const authorityId = get(h.state, 'human-event').id;
  h.collect(); h.execute({ type: 'report', input: { report } }); h.assess();
  const baselineId = h.state.baselineId, observationId = h.state.observationId;
  h.execute({ type: 'amend', input: { kind: 'human-correction', humanEvent: { content: 'Also explain restart behavior.' },
    interpretation: { ...interpretation, desiredOutcome: 'Explain restart behavior too.' } } });
  assert.equal(h.state.baselineId, baselineId); assert.equal(h.state.observationId, observationId);
  assert.equal(evaluateAdoption(h.state, currency).factsCurrency, 'current');
  assert.equal(evaluateAdoption(h.state, currency).assessmentCurrent, false);
  h.execute({ type: 'resolve', input: { decisionKey: 'storage', proposalId, option: 'local',
    authority: { kind: 'existing-authority', basis: [authorityId], rationale: 'The same selected option still applies.' } } });
  assert.deepEqual(evaluateAdoption(h.state).pendingDecisions, []);
});

test('late assessment remains inspectable without becoming the current delivery basis', () => {
  const h = harness(); h.begin(); h.collect(); h.execute({ type: 'report', input: { report } });
  const requestId = h.state.requestId!;
  h.execute({ type: 'amend', input: { kind: 'interpretation', reason: 'Clarify the mechanism.',
    interpretation: { ...interpretation, desiredOutcome: 'A clarified outcome.' } } });
  h.execute({ type: 'assess', input: { kind: 'unavailable', requestId, reason: 'Analysis was interrupted.' } });
  assert.equal(h.state.assessmentId, undefined);
  assert.equal(get(h.state, 'assessment').input.requestId, requestId);
  h.fail({ type: 'prepare', input: { recommendation: { action: 'defer', rationale: 'Wait.' } } }, 'ASSESSMENT_REQUIRED');
});

test('an identical report or assessment is idempotent and conflicting result needs a new request', () => {
  const h = harness(); h.delivered();
  const revision = h.state.revision;
  h.execute({ type: 'report', input: { report } }); h.assess();
  assert.equal(h.state.revision, revision);
  h.fail({ type: 'assess', input: { kind: 'unavailable', requestId: h.state.requestId!, reason: 'Overwrite the result.' } }, 'ASSESSMENT_EXISTS');
  const reportId = h.state.reportId;
  h.execute({ type: 'report', input: { report, reassessReason: 'Review the unresolved behavior again.' } });
  assert.equal(h.state.reportId, reportId); assert.equal(h.state.assessmentId, undefined);
});

test('final recommendations can change without invalidating the Assessment; old Package cannot receive acceptance', () => {
  const h = harness(); h.delivered();
  h.execute({ type: 'prepare', input: { recommendation: { action: 'defer', rationale: 'Consider this result.' } } });
  const packageId = h.state.packageId!, assessmentId = h.state.assessmentId;
  h.execute({ type: 'prepare', input: { recommendation: { action: 'accept', rationale: 'Recommend adopting the current result.' } } });
  assert.equal(h.state.assessmentId, assessmentId);
  h.fail({ type: 'decide', input: { packageId, action: 'accepted', humanEvent: { content: 'Accept.' }, reason: 'Old view.' } }, 'PACKAGE_STALE');
});

test('unavailable and relayed analysis remain disclosed and require exact limitation acknowledgment', () => {
  const h = harness(); h.begin(); h.collect(); h.execute({ type: 'report', input: { report } });
  h.execute({ type: 'assess', input: { kind: 'unavailable', requestId: h.state.requestId!, reason: 'Host analysis could not run.' } });
  h.fail({ type: 'prepare', input: { recommendation: { action: 'accept', rationale: 'Everything passed.' } } }, 'RECOMMENDATION_EXCEEDS_EVIDENCE');
  h.execute({ type: 'prepare', input: { recommendation: { action: 'accept-with-limitations', rationale: 'Disclose the missing analysis.' } } });
  const packet = get(h.state, 'adoption-package');
  h.fail({ type: 'decide', input: { packageId: packet.id, humanEvent: { content: 'Accept.' }, action: 'accepted', reason: 'Accept.' } }, 'ACKNOWLEDGMENT_REQUIRED');
  h.execute({ type: 'decide', input: { packageId: packet.id, humanEvent: { content: 'Accept with the displayed missing analysis.' },
    action: 'accepted', reason: 'Accept with the disclosed limitation.', acknowledge: packet.attention.map((item) => item.id) } });
});

test('findings survive implementer disagreement and omission in later analysis', () => {
  const h = harness(); h.begin(); h.collect(); h.execute({ type: 'report', input: { report } });
  h.assess([{ key: 'fallback', kind: 'unexplained-change', claimKeys: ['behavior'],
    statement: 'The fallback behavior is unexplained.', consequence: 'Maintainers cannot predict recovery.', evidence: [] }]);
  const reference = { assessmentId: h.state.assessmentId!, key: 'fallback' };
  h.execute({ type: 'prepare', input: { recommendation: { action: 'request-correction', rationale: 'Investigate recovery.' },
    responses: [{ finding: reference, response: 'I think this is already resolved.' }] } });
  assert.ok(get(h.state, 'adoption-package').attention.some((item) => item.code === 'open-finding'));
  h.execute({ type: 'report', input: { report, reassessReason: 'Investigate again.' } });
  assert.deepEqual(get(h.state, 'analysis-request').priorFindings, [reference]);
  h.assess();
  assert.ok(evaluateAdoption(h.state, currency).attention.some((item) => item.code === 'open-finding'));
});

test('source evidence binds immutable snapshot digests and refuses absent source and checks', () => {
  const h = harness(); h.begin(); h.collect();
  h.fail({ type: 'report', input: { report: { ...report, evidence: [{ kind: 'source', snapshot: 'baseline', path: 'absent.txt' }] } } }, 'EVIDENCE_INVALID');
  h.fail({ type: 'report', input: { report: { ...report, evidence: [{ kind: 'check', checkKey: 'invented' }] } } }, 'EVIDENCE_INVALID');
  h.execute({ type: 'report', input: { report: { ...report, evidence: [{ kind: 'source', snapshot: 'baseline', path: 'file.txt' }] } } });
  assert.equal(get(h.state, 'report').input.evidence[0].kind, 'source');
  assert.equal((get(h.state, 'report').input.evidence[0] as { digest: string }).digest, baseline.entries[0].contentDigest);
});

test('edits after presentation prevent adoption while deferral and correction preserve history', () => {
  const h = harness(); h.delivered();
  h.execute({ type: 'prepare', input: { recommendation: { action: 'accept', rationale: 'Current evidence.' } } });
  const packageId = h.state.packageId!;
  h.fail({ type: 'decide', input: { packageId, humanEvent: { content: 'Accept.' }, action: 'accepted', reason: 'Accept.' } }, 'FACTS_STALE',
    { currency: { ...currency, worktreeFingerprint: snapshot('edited').fingerprint } });
  h.execute({ type: 'decide', input: { packageId, humanEvent: { content: 'Defer.' }, action: 'deferred', reason: 'Wait.' } });
  assert.equal(h.state.closed, false);
  const baselineId = h.state.baselineId;
  h.execute({ type: 'decide', input: { packageId, humanEvent: { content: 'Change the recovery behavior.' },
    action: 'correction-requested', reason: 'Revise recovery.', correction: interpretation } });
  assert.equal(h.state.attemptNumber, 2); assert.equal(h.state.baselineId, baselineId);
  assert.equal(h.state.records.filter((item) => item.kind === 'adoption-decision').length, 2);
});

test('a changed verification plan freezes a new definition and keeps earlier observations', () => {
  const h = harness(); h.begin(); h.collect();
  const observationId = h.state.observationId, planId = h.state.planId;
  const verification = { mode: 'checks' as const, checks: [{ key: 'check', argv: ['node', '-e', 'process.exit(0)'],
    preparation: [], executionInputs: [], verifierSelectors: [] }] };
  h.execute({ type: 'verification-revise', input: { verification,
    authority: { kind: 'existing-authority', basis: ['request'], rationale: 'Add a concrete check.' } } }, { verification });
  assert.notEqual(h.state.planId, planId); assert.equal(h.state.observationId, observationId);
  assert.equal(evaluateAdoption(h.state, currency).factsCurrency, 'stale');
  assert.deepEqual(get(h.state, 'verification-plan').definitions[0].execution.assertion.argv, ['node', '-e', 'process.exit(0)']);
});

test('event replay rejects ordering, mismatched ownership and duplicate artifact publication', () => {
  const h = harness();
  const result = h.begin(); assert.equal(result.status, 'transition');
  if (result.status !== 'transition') return;
  assert.throws(() => reduceTaskEvent(null, { ...result.event, sequence: 2 }, result.artifacts));
  assert.throws(() => reduceTaskEvent(null, result.event, result.artifacts.slice(1)));
  assert.throws(() => reduceTaskEvent(result.state, result.event, result.artifacts));
});

test('saved Package bindings do not assert live currency without a new Runtime observation', () => {
  const h = harness(); h.delivered();
  h.execute({ type: 'prepare', input: { recommendation: { action: 'accept', rationale: 'The current result is explained.' } } });
  const saved = evaluateAdoption(h.state);
  assert.equal(saved.packageBindingsCurrent, true);
  assert.equal(saved.factsCurrency, 'unobserved');
  assert.equal(saved.packageCurrent, false);
  assert.equal(saved.acceptanceStructurallyPossible, false);
  assert.equal(evaluateAdoption(h.state, currency).packageCurrent, true);
});

test('an exact Assessment redelivery after adoption is a read-only reuse, while a replacement is rejected', () => {
  const h = harness(); h.delivered();
  const assessment = get(h.state, 'assessment');
  h.execute({ type: 'prepare', input: { recommendation: { action: 'accept', rationale: 'Reviewed the current result.' } } });
  h.execute({ type: 'decide', input: { packageId: h.state.packageId!, action: 'accepted',
    humanEvent: { content: 'Accept this result.' }, reason: 'Reviewed.' } });
  const revision = h.state.revision;
  assert.equal(h.execute({ type: 'assess', input: assessment.input }).status, 'unchanged');
  assert.equal(h.state.revision, revision);
  h.fail({ type: 'assess', input: { kind: 'unavailable', requestId: assessment.input.requestId,
    reason: 'A replacement result.' } }, 'ASSESSMENT_EXISTS');
});
