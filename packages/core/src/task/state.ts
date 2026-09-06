import { fingerprint, requireCondition } from '../protocol.ts';
import type { Assessment, FindingReference } from '../assessments/schema.ts';
import type { DecisionProposal, DecisionResolution } from '../decisions/schema.ts';
import type { TaskArtifact, TaskState } from './schema.ts';

export function record<K extends TaskArtifact['kind']>(state: TaskState, kind: K, id: string | undefined): Extract<TaskArtifact, { kind: K }> {
  const found = state.records.find((item) => item.id === id);
  requireCondition(found?.kind === kind, 'REFERENCE_INVALID', `Missing ${kind} record: ${id ?? '(none)'}.`);
  return found as Extract<TaskArtifact, { kind: K }>;
}

export function records<K extends TaskArtifact['kind']>(state: TaskState, kind: K): Extract<TaskArtifact, { kind: K }>[] {
  return state.records.filter((item): item is Extract<TaskArtifact, { kind: K }> => item.kind === kind);
}

export function decisions(state: TaskState): Array<{ proposal: DecisionProposal; resolution?: DecisionResolution }> {
  const latest = new Map<string, DecisionProposal>();
  for (const proposal of records(state, 'decision-proposal')) latest.set(proposal.input.key, proposal);
  return [...latest.values()].map((proposal) => ({ proposal,
    resolution: records(state, 'decision-resolution').reverse().find((r) => r.proposalId === proposal.id && r.intentId === state.intentId),
  }));
}

export function decisionDigest(state: TaskState): string {
  return fingerprint(decisions(state).map(({ proposal, resolution }) => ({
    proposalId: proposal.id, resolutionId: resolution?.id ?? null,
  })));
}

export function currentBasis(state: TaskState) {
  requireCondition(state.observationId && state.reportId, 'REPORT_REQUIRED', 'Collect facts and author the current report first.');
  return { intentId: state.intentId, decisionDigest: decisionDigest(state),
    observationId: state.observationId, planId: state.planId, reportId: state.reportId };
}

export function findingId(ref: FindingReference): string { return `${ref.assessmentId}:${ref.key}`; }

export function allFindings(state: TaskState) {
  return records(state, 'assessment').flatMap((assessment) => assessment.input.kind === 'assessment'
    ? assessment.input.findings.map((finding) => ({ reference: { assessmentId: assessment.id, key: finding.key }, finding })) : []);
}

export function openFindings(state: TaskState) {
  const dispositions = new Map<string, string>();
  for (const assessment of records(state, 'assessment')) {
    if (assessment.input.kind !== 'assessment' || !assessment.currentAtSubmission) continue;
    for (const disposition of assessment.input.dispositions) {
      dispositions.set(findingId(disposition.finding), disposition.outcome);
    }
  }
  return allFindings(state).filter(({ reference }) => !['addressed', 'retracted'].includes(dispositions.get(findingId(reference)) ?? ''));
}

export function findingDigest(state: TaskState): string {
  return fingerprint(records(state, 'assessment').map((item) => item.id));
}

export function assessmentIsCurrent(state: TaskState, assessment: Assessment): boolean {
  const request = record(state, 'analysis-request', assessment.input.requestId);
  return request.id === state.requestId && Boolean(state.reportId && state.observationId)
    && fingerprint(request.basis) === fingerprint(currentBasis(state));
}
