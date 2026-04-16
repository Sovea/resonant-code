import type { RcclDocument, RcclObservation, VerificationDisposition, VerificationPolicy } from '../types.ts';
import { DEFAULT_VERIFICATION_POLICY } from '../policies.ts';

export function verifyInductionForDocument(
  rccl: RcclDocument,
  policy: VerificationPolicy = DEFAULT_VERIFICATION_POLICY,
): RcclDocument {
  return {
    ...rccl,
    observations: rccl.observations.map((observation) => verifyObservationInduction(observation, policy)),
  };
}

export function verifyObservationInduction(
  observation: RcclObservation,
  policy: VerificationPolicy = DEFAULT_VERIFICATION_POLICY,
): RcclObservation {
  const evidenceCount = observation.verification.evidence_verified_count ?? 0;
  const minRequired = minimumEvidence(observation, policy);
  let induction_status: RcclObservation['verification']['induction_status'] = 'well-supported';
  let induction_confidence = observation.verification.evidence_confidence ?? 0;

  if (observation.support.scope_basis === 'cross-root' && evidenceCount < policy.min_evidence_for_cross_root_scope) {
    induction_status = 'overgeneralized';
    induction_confidence = Math.min(induction_confidence, 0.35);
  } else if (observation.support.scope_basis === 'directory-cluster' && evidenceCount < policy.min_evidence_for_directory_scope) {
    induction_status = 'narrowly-supported';
    induction_confidence = Math.min(induction_confidence, 0.5);
  } else if (evidenceCount < minRequired) {
    induction_status = 'narrowly-supported';
    induction_confidence = Math.min(induction_confidence, 0.55);
  }

  let disposition: VerificationDisposition = observation.verification.disposition ?? 'keep';
  if (induction_status === 'overgeneralized') disposition = 'demote-to-ambient';
  else if (induction_status === 'narrowly-supported' && disposition === 'keep') disposition = 'keep-with-reduced-confidence';

  return {
    ...observation,
    verification: {
      ...observation.verification,
      induction_status,
      induction_confidence: Number(induction_confidence.toFixed(2)),
      disposition,
    },
  };
}

function minimumEvidence(observation: RcclObservation, policy: VerificationPolicy): number {
  if (observation.category === 'anti-pattern') return policy.anti_pattern_min_evidence;
  if (observation.category === 'migration') return policy.migration_min_evidence;
  return 1;
}
