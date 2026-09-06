import { fingerprint } from '../protocol.ts';
import { assessmentIsCurrent, currentBasis, decisionDigest, decisions, findingDigest, findingId, openFindings, record } from '../task/state.ts';
import type { TaskState } from '../task/schema.ts';
import type { Attention } from './schema.ts';

export interface Currency { worktreeFingerprint: string; executionInputsFingerprint: string }

export function evaluateAdoption(state: TaskState, currency?: Currency) {
  const observation = state.observationId ? record(state, 'observation', state.observationId) : undefined;
  const intent = record(state, 'intent', state.intentId);
  const plan = record(state, 'verification-plan', state.planId);
  const report = state.reportId ? record(state, 'report', state.reportId) : undefined;
  const assessment = state.assessmentId ? record(state, 'assessment', state.assessmentId) : undefined;
  const packet = state.packageId ? record(state, 'adoption-package', state.packageId) : undefined;
  const factsCurrency = !observation ? 'absent' : observation.planId !== state.planId ? 'stale'
    : !currency ? 'unobserved'
    : currency.worktreeFingerprint === observation.data.current.fingerprint
      && currency.executionInputsFingerprint === fingerprint(observation.data.currentExecutionInputs.map((input) => ({
        definitionId: input.definitionId, fingerprint: input.fingerprint,
      }))) ? 'current' : 'stale';
  const reportCurrent = Boolean(report && report.intentId === state.intentId && report.planId === state.planId
    && report.observationId === state.observationId && report.decisionDigest === decisionDigest(state));
  const assessmentCurrent = Boolean(reportCurrent && assessment && assessmentIsCurrent(state, assessment));
  const pendingDecisions = decisions(state).filter(({ resolution }) => !resolution).map(({ proposal }) => proposal.input.key);
  const packageBindingsCurrent = Boolean(packet && assessmentCurrent
    && packet.requestId === state.requestId && packet.assessmentId === state.assessmentId
    && fingerprint(packet.basis) === fingerprint(currentBasis(state)) && packet.findingDigest === findingDigest(state));
  const packageCurrent = packageBindingsCurrent && factsCurrency === 'current';
  const attention: Attention[] = [];
  const add = (code: string, message: string, sourceId?: string) => {
    attention.push({ id: fingerprint({ code, message, sourceId }), code, message, ...(sourceId ? { sourceId } : {}) });
  };
  if (factsCurrency === 'stale') add('stale-facts', 'The worktree, declared inputs, or verification plan changed.', observation?.id);
  if (observation) {
    for (const check of observation.data.checks) {
      const latest = check.attempts.at(-1)!;
      if (latest.status !== 'passed') add('check-not-passing',
        `${plan.definitions.find((d) => d.definitionId === check.definitionId)?.key ?? check.definitionId}: ${latest.status}.`, observation.id);
    }
    if (observation.data.verifierMutations.length) add('verifier-changed', 'Declared verifier surfaces changed.', observation.id);
    if (observation.data.checkInducedChanges.length) add('check-induced-change', 'Checks changed the worktree.', observation.id);
    if (observation.data.changedFiles.some((file) => ['binary', 'unrepresentable'].includes(file.representation))) {
      add('unrepresentable-change', 'Some changes cannot be reviewed as a text patch.', observation.id);
    }
  }
  if (!assessmentCurrent || !assessment) add('analysis-missing', 'A current semantic Assessment is required.', state.requestId);
  else if (assessment.input.kind === 'unavailable') add('analysis-unavailable', assessment.input.reason, assessment.id);
  else {
    if (assessment.origin.transport === 'agent-relay') add('analysis-relayed', 'Assessment provenance is Agent-relayed; Host isolation is not attested.', assessment.id);
    if (assessment.input.context === 'same-context') add('analysis-same-context', 'Assessment used the implementation context.', assessment.id);
    for (const unknown of assessment.input.unknowns) add('assessment-unknown', unknown, assessment.id);
  }
  for (const unknown of report?.input.unknowns ?? []) add('report-unknown', unknown, report?.id);
  for (const item of openFindings(state)) add('open-finding', `${item.finding.statement} ${item.finding.consequence}`, findingId(item.reference));
  if (intent.assurance.mode === 'consequential') {
    for (const concern of intent.assurance.concerns) {
      const requirements = intent.concernChecks.filter((item) => item.concernKey === concern.key);
      const passing = requirements.every((required) => observation?.data.checks.some((check) =>
        check.definitionId === required.definitionId && check.attempts.at(-1)?.status === 'passed'));
      if (!passing) add('concern-check-gap', `${concern.key}: declared check evidence is missing or not passing.`, intent.id);
      for (const requirement of concern.evidenceRequirements) {
        if (requirement.kind === 'human-review') add('human-review', `${concern.key}: ${requirement.question}`, intent.id);
      }
    }
  }
  const next = state.closed ? 'complete' : pendingDecisions.length ? 'resolve-decision'
    : factsCurrency === 'absent' ? 'implement' : factsCurrency === 'stale' ? 'collect'
    : !reportCurrent ? 'report' : !assessmentCurrent ? 'assess' : !packageBindingsCurrent ? 'prepare' : 'await-human-decision';
  const phase = state.closed ? 'complete' : pendingDecisions.length ? 'align' : packageBindingsCurrent && factsCurrency !== 'stale' ? 'decide' : 'work';
  return {
    phase, next, factsCurrency, reportCurrent, assessmentCurrent, packageCurrent, packageBindingsCurrent, pendingDecisions, attention,
    acceptanceStructurallyPossible: packageCurrent && factsCurrency === 'current' && pendingDecisions.length === 0,
  } as const;
}
