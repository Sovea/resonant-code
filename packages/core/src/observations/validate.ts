import { fingerprint, requireCondition } from '../protocol.ts';
import { unique } from '../intent/compile.ts';
import type { VerificationDefinition, VerificationPlan } from '../intent/schema.ts';
import type { CheckAttemptFact, CheckStepAttemptFact, ObservationData, VerificationInputSnapshot, WorktreeSnapshot } from './schema.ts';

export function validateSnapshot(snapshot: WorktreeSnapshot): void {
  const { source: _source, fingerprint: digest, ...content } = snapshot;
  unique(snapshot.entries.map((entry) => entry.path), 'snapshot paths');
  requireCondition(digest === fingerprint(content), 'SNAPSHOT_INVALID', 'Snapshot digest does not match its contents.');
}

export function validateObservation(data: ObservationData, baseline: WorktreeSnapshot, plan: VerificationPlan): void {
  validateSnapshot(data.preCheck);
  validateSnapshot(data.current);
  requireCondition(data.baselineFingerprint === baseline.fingerprint, 'BASELINE_MISMATCH', 'Observation must retain the admitted baseline.');
  requireCondition(data.changeFingerprint === fingerprint(data.changedFiles), 'CHANGE_INVALID', 'Change digest does not match the files.');
  unique(data.changedFiles.map((file) => file.id), 'changed file identities');
  unique(data.checkInducedChanges.map((file) => file.id), 'check-induced file identities');
  for (const [files, before, after] of [
    [data.changedFiles, baseline, data.current], [data.checkInducedChanges, data.preCheck, data.current],
  ] as const) {
    const beforePaths = new Map(before.entries.map((item) => [item.path, item]));
    const afterPaths = new Map(after.entries.map((item) => [item.path, item]));
    const changedPaths = [...new Set([...beforePaths.keys(), ...afterPaths.keys()])].filter((path) =>
      fingerprint(beforePaths.get(path) ?? null) !== fingerprint(afterPaths.get(path) ?? null));
    const representedPaths = files.flatMap((file) => file.previousPath ? [file.previousPath, file.path] : [file.path]);
    unique(representedPaths, 'represented change paths');
    requireCondition(fingerprint([...changedPaths].sort()) === fingerprint([...representedPaths].sort()),
      'CHANGE_INCOMPLETE', 'Every actual snapshot change must be represented exactly once.');
    for (const file of files) {
      for (const [side, snapshot, path] of [[file.before, before, file.previousPath ?? file.path],
        [file.after, after, file.path]] as const) {
        const entry = snapshot.entries.find((item) => item.path === path);
        const content = entry && { kind: entry.kind, contentDigest: entry.contentDigest, mode: entry.mode };
        requireCondition(fingerprint(side ?? null) === fingerprint(content ?? null), 'CHANGE_INVALID', `Change side differs from snapshot: ${path}.`);
      }
    }
  }
  requireCondition(!data.changedFiles.some((file) => file.representation === 'text') || data.patch,
    'PATCH_REQUIRED', 'Text changes require an inspectable patch.');
  const definitions = plan.definitions;
  requireCondition(data.checks.length === definitions.length, 'CHECKS_INCOMPLETE', 'Observe every frozen check exactly once.');
  unique(data.checks.map((check) => check.definitionId), 'observed checks');
  for (const snapshots of [data.preCheckExecutionInputs, data.currentExecutionInputs]) {
    requireCondition(snapshots.length === definitions.length, 'INPUTS_INCOMPLETE', 'Observe declared inputs for every check.');
    unique(snapshots.map((snapshot) => snapshot.definitionId), 'check input snapshots');
    for (const definition of definitions) {
      const snapshot = snapshots.find((item) => item.definitionId === definition.definitionId);
      requireCondition(snapshot, 'INPUTS_INCOMPLETE', `Missing inputs for ${definition.key}.`);
      validateInputs(snapshot, definition);
    }
  }
  for (const definition of definitions) {
    const check = data.checks.find((item) => item.definitionId === definition.definitionId);
    requireCondition(check && check.verifierId === definition.verifierId
      && check.definitionFingerprint === fingerprint(definition)
      && fingerprint(check.assertionArgv) === fingerprint(definition.execution.assertion.argv),
    'CHECK_DEFINITION_MISMATCH', `Check ${definition.key} does not match its frozen definition.`);
    for (const [index, attempt] of check.attempts.entries()) {
      requireCondition(attempt.attempt === index + 1, 'ATTEMPT_ORDER_INVALID', 'Check attempts must be ordered.');
      validateAttempt(attempt, definition);
    }
  }
  for (const mutation of data.verifierMutations) {
    const definition = definitions.find((item) => item.definitionId === mutation.definitionId);
    const file = data.changedFiles.find((item) => item.id === mutation.changedFileId);
    requireCondition(definition && file && definition.verifierId === mutation.verifierId
      && definition.verifierRefs.some((ref) => fingerprint(ref) === fingerprint(mutation.selector)),
    'VERIFIER_MUTATION_INVALID', 'Verifier mutation must reference a declared selector and actual change.');
    const path = mutation.matchedBy === 'current-path' ? file.path : file.previousPath;
    requireCondition(path === mutation.changedPath && (path === mutation.selector.path
      || (mutation.selector.kind === 'tree' && path.startsWith(`${mutation.selector.path}/`))),
    'VERIFIER_MUTATION_INVALID', 'Verifier mutation path must match its explicit selector.');
  }
}

function validateInputs(snapshot: VerificationInputSnapshot, definition: VerificationDefinition): void {
  requireCondition(snapshot.definitionId === definition.definitionId
    && snapshot.fingerprint === fingerprint({ definitionId: snapshot.definitionId, inputs: snapshot.inputs })
    && fingerprint(snapshot.inputs.map((item) => item.selector)) === fingerprint(definition.executionInputs),
  'INPUTS_INVALID', 'Check inputs must match the frozen selectors and digest.');
  for (const input of snapshot.inputs) {
    const { fingerprint: digest, ...content } = input;
    requireCondition(digest === fingerprint(content), 'INPUTS_INVALID', 'Input selector digest mismatch.');
  }
}

function validateAttempt(attempt: CheckAttemptFact, definition: VerificationDefinition): void {
  const expected = [...definition.execution.preparation, definition.execution.assertion];
  requireCondition(attempt.steps.length <= expected.length, 'STEP_INVALID', 'Unexpected check execution step.');
  for (const [index, step] of attempt.steps.entries()) {
    requireCondition(step.stepId === expected[index].stepId && fingerprint(step.argv) === fingerprint(expected[index].argv)
      && step.role === (index < expected.length - 1 ? 'preparation' : 'assertion'),
    'STEP_INVALID', 'Check step differs from its frozen argv or role.');
    requireCondition(index === attempt.steps.length - 1 || step.status === 'passed',
      'STEP_INVALID', 'Execution cannot continue after failed preparation.');
    validateStep(step);
  }
  const terminal = attempt.steps.at(-1)!;
  requireCondition(attempt.observedPhase === terminal.role
    && attempt.status === (terminal.role === 'preparation' ? 'unavailable' : terminal.status)
    && fingerprint(attempt.termination) === fingerprint(terminal.termination)
    && fingerprint(attempt.stdout) === fingerprint(terminal.stdout)
    && fingerprint(attempt.stderr) === fingerprint(terminal.stderr),
  'ATTEMPT_INVALID', 'Attempt outcome must match the final observed step.');
  for (const snapshot of Object.values(attempt.executionInputs)) validateInputs(snapshot, definition);
  requireCondition(attempt.outcomeFingerprint === fingerprint({
    attempt: attempt.attempt, timeoutMs: attempt.timeoutMs, status: attempt.status,
    observedPhase: attempt.observedPhase, termination: attempt.termination,
    steps: attempt.steps.map((step) => step.outcomeFingerprint),
    executionInputs: Object.fromEntries(Object.entries(attempt.executionInputs).map(([key, value]) => [key, value.fingerprint])),
  }), 'ATTEMPT_INVALID', 'Attempt digest does not match its outcome.');
}

function validateStep(step: CheckStepAttemptFact): void {
  const status = step.termination.kind !== 'exit' ? 'unavailable'
    : step.termination.exitCode === 0 ? 'passed' : 'failed';
  requireCondition(step.status === status && step.outcomeFingerprint === fingerprint({
    stepId: step.stepId, role: step.role, timeoutMs: step.timeoutMs, status: step.status,
    termination: step.termination, stdoutDigest: step.stdout.digest, stderrDigest: step.stderr.digest,
  }), 'STEP_INVALID', 'Step status or digest contradicts its execution outcome.');
}
