import { requireCondition } from '../protocol.ts';
import { unique } from '../intent/compile.ts';
import { allFindings, findingId, record } from '../task/state.ts';
import type { TaskState } from '../task/schema.ts';
import type { AnalysisRequest, EvidenceReference, FindingResponse } from './schema.ts';
import { AssessmentInputSchema } from './schema.ts';

export function bindEvidence(state: TaskState, observationId: string, references: EvidenceReference[]): EvidenceReference[] {
  const observation = record(state, 'observation', observationId);
  const baseline = record(state, 'baseline', state.baselineId).snapshot;
  const plan = record(state, 'verification-plan', observation.planId);
  return references.map((reference) => {
    if (reference.kind === 'source') {
      const snapshot = reference.snapshot === 'baseline' ? baseline : observation.data.current;
      const entry = snapshot.entries.find((item) => item.path === reference.path);
      requireCondition(entry && (!reference.digest || reference.digest === entry.contentDigest),
        'EVIDENCE_INVALID', `Source reference does not match ${reference.snapshot}: ${reference.path}.`);
      return { ...reference, digest: entry.contentDigest };
    }
    if (reference.kind === 'changed-file') {
      requireCondition(observation.data.changedFiles.some((file) => file.path === reference.path || file.previousPath === reference.path),
        'EVIDENCE_INVALID', `No observed change at ${reference.path}.`);
    } else if (reference.kind === 'check') {
      const definition = plan.definitions.find((item) => item.key === reference.checkKey);
      const fact = observation.data.checks.find((item) => item.definitionId === definition?.definitionId);
      const attempt = reference.attempt ?? fact?.attempts.at(-1)?.attempt;
      requireCondition(fact && fact.attempts.some((item) => item.attempt === attempt),
        'EVIDENCE_INVALID', `No observed attempt for ${reference.checkKey}.`);
      return { ...reference, attempt };
    } else {
      requireCondition(observation.data.patch, 'EVIDENCE_INVALID', 'This observation has no patch.');
    }
    return reference;
  });
}

export function bindResponses(state: TaskState, observationId: string, responses: FindingResponse[]): FindingResponse[] {
  const findings = new Set(allFindings(state).map(({ reference }) => findingId(reference)));
  unique(responses.map((response) => findingId(response.finding)), 'finding responses');
  return responses.map((response) => {
    requireCondition(findings.has(findingId(response.finding)), 'FINDING_INVALID', 'Response must reference an existing finding.');
    return { ...response, evidence: bindEvidence(state, observationId, response.evidence) };
  });
}

export function bindAssessment(state: TaskState, request: AnalysisRequest, source: unknown) {
  const input = AssessmentInputSchema.parse(source);
  requireCondition(input.requestId === request.id, 'REQUEST_MISMATCH', 'Assessment belongs to another request.');
  if (input.kind === 'unavailable') return input;
  unique(input.claims.map((claim) => claim.key), 'assessment claim keys');
  unique(input.findings.map((finding) => finding.key), 'assessment finding keys');
  const claims = new Set(input.claims.map((claim) => claim.key));
  // Use the historical request basis even when a late assessment is no longer current.
  const intent = record(state, 'intent', request.basis.intentId);
  const historicalDecisions = request.decisionRefs.map((item) => record(state, 'decision-proposal', item.proposalId));
  const humanIds = new Set([...intent.humanEventIds, ...request.decisionRefs.flatMap((item) => item.resolutionId
    ? record(state, 'decision-resolution', item.resolutionId).authorityEventIds : [])]);
  for (const relation of input.relations) {
    requireCondition(claims.has(relation.claimKey), 'CLAIM_INVALID', 'Relation references an absent claim.');
    if (relation.basis.kind === 'human-event') requireCondition(humanIds.has(relation.basis.id),
      'AUTHORITY_INVALID', 'Relation must reference direction supplied to this analysis.');
    if (relation.basis.kind === 'decision') {
      const key = relation.basis.key;
      requireCondition(historicalDecisions.some((item) => item.input.key === key),
        'DECISION_INVALID', 'Relation references an absent engineering decision.');
    }
  }
  requireCondition(input.claims.every((claim) => input.relations.some((relation) => relation.claimKey === claim.key)),
    'RELATION_REQUIRED', 'Each claim needs an explicit relation, including unexplained when appropriate.');
  const evidence = (refs: EvidenceReference[]) => bindEvidence(state, request.basis.observationId, refs);
  const prior = new Set(request.priorFindings.map(findingId));
  unique(input.dispositions.map((item) => findingId(item.finding)), 'finding dispositions');
  return { ...input,
    claims: input.claims.map((claim) => ({ ...claim, evidence: evidence(claim.evidence) })),
    findings: input.findings.map((finding) => {
      requireCondition(finding.claimKeys.every((key) => claims.has(key)), 'CLAIM_INVALID', 'Finding references an absent claim.');
      return { ...finding, evidence: evidence(finding.evidence) };
    }),
    dispositions: input.dispositions.map((disposition) => {
      requireCondition(prior.has(findingId(disposition.finding)), 'FINDING_INVALID', 'Disposition must address a finding supplied to this request.');
      return { ...disposition, evidence: evidence(disposition.evidence) };
    }),
  };
}
