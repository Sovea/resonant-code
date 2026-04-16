import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RcclDocument, RcclEvidence, RcclObservation, VerificationDisposition, VerificationStatus } from '../types.ts';

/**
 * Verifies RCCL evidence statically when verification fields are missing or stale.
 */
export function verifyRcclDocument(rccl: RcclDocument, projectRoot: string, now = new Date()): RcclDocument {
  const checkedAt = now.toISOString();
  return {
    ...rccl,
    observations: rccl.observations.map((observation) => needsVerification(observation)
      ? verifyObservationInduction(verifyObservationEvidence(observation, projectRoot, checkedAt))
      : verifyObservationInduction(observation)),
  };
}

function needsVerification(observation: RcclObservation): boolean {
  return !observation.verification.evidence_status || !observation.verification.checked_at;
}

function verifyObservationEvidence(observation: RcclObservation, projectRoot: string, checkedAt: string): RcclObservation {
  if (observation.evidence.length === 0) {
    return withEvidenceVerification(observation, 'unverifiable', 0, 0, checkedAt, 'demote-to-ambient');
  }
  const results = observation.evidence.map((item) => verifyEvidence(item, projectRoot));
  const verifiedCount = results.filter((result) => result.status === 'match').length;
  const ratio = verifiedCount / results.length;
  if (verifiedCount === results.length) {
    return withEvidenceVerification(observation, 'verified', verifiedCount, observation.confidence, checkedAt, 'keep');
  }
  if (verifiedCount > 0) {
    const confidence = Math.max(observation.confidence * ratio, 0.3);
    const disposition: VerificationDisposition = confidence < 0.7 ? 'keep-with-reduced-confidence' : 'keep';
    return withEvidenceVerification(observation, 'partial', verifiedCount, confidence, checkedAt, disposition);
  }
  return withEvidenceVerification(observation, 'failed', 0, 0, checkedAt, 'demote-to-ambient');
}

function verifyObservationInduction(observation: RcclObservation): RcclObservation {
  const evidenceCount = observation.verification.evidence_verified_count ?? 0;
  const evidenceConfidence = observation.verification.evidence_confidence ?? 0;
  let induction_status: RcclObservation['verification']['induction_status'] = 'well-supported';
  let induction_confidence = evidenceConfidence;
  let disposition = observation.verification.disposition ?? 'keep';

  if (observation.support.scope_basis === 'cross-root' && evidenceCount < 3) {
    induction_status = 'overgeneralized';
    induction_confidence = Math.min(induction_confidence, 0.35);
    disposition = 'demote-to-ambient';
  } else if (observation.support.scope_basis === 'directory-cluster' && evidenceCount < 2) {
    induction_status = 'narrowly-supported';
    induction_confidence = Math.min(induction_confidence, 0.5);
    if (disposition === 'keep') disposition = 'keep-with-reduced-confidence';
  } else if ((observation.category === 'anti-pattern' || observation.category === 'migration') && evidenceCount < 2) {
    induction_status = 'narrowly-supported';
    induction_confidence = Math.min(induction_confidence, 0.55);
    if (disposition === 'keep') disposition = 'keep-with-reduced-confidence';
  } else if (observation.support.scope_basis === 'module-cluster' && observation.support.file_count <= 1) {
    induction_status = 'ambiguous';
    induction_confidence = Math.min(induction_confidence, 0.6);
    if (disposition === 'keep') disposition = 'keep-with-reduced-confidence';
  }

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

function withEvidenceVerification(
  observation: RcclObservation,
  status: VerificationStatus,
  verifiedCount: number,
  verifiedConfidence: number,
  checkedAt: string,
  disposition: VerificationDisposition,
): RcclObservation {
  return {
    ...observation,
    verification: {
      ...observation.verification,
      evidence_status: status,
      evidence_verified_count: verifiedCount,
      evidence_confidence: Number(verifiedConfidence.toFixed(2)),
      checked_at: checkedAt,
      disposition,
    },
  };
}

function verifyEvidence(evidence: RcclEvidence, projectRoot: string): { status: 'match' | 'mismatch' | 'file-not-found' | 'range-out-of-bounds' } {
  const fullPath = join(projectRoot, evidence.file);
  if (!existsSync(fullPath)) return { status: 'file-not-found' };
  const lines = readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n').split('\n');
  const [start, end] = evidence.line_range;
  if (start < 1 || end < start || end > lines.length) return { status: 'range-out-of-bounds' };
  const actual = lines.slice(start - 1, end).join('\n');
  return tokenOverlapSimilarity(actual, evidence.snippet) >= 0.75 ? { status: 'match' } : { status: 'mismatch' };
}

function tokenOverlapSimilarity(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const token of aTokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let overlap = 0;
  for (const token of bTokens) {
    const count = counts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(token, count - 1);
    }
  }
  return overlap / Math.max(aTokens.length, bTokens.length);
}

function tokenize(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/['"`]/g, '"').replace(/\s+/g, ' ').trim()
    .match(/[A-Za-z_][A-Za-z0-9_]*|\d+|==|!=|<=|>=|=>|&&|\|\||[()[\]{}.,;:+\-*/%<>!=?]/g) ?? [];
}
