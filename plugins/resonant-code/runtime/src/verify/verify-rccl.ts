import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RcclDocument, RcclEvidence, RcclObservation, VerificationDisposition, VerificationStatus } from '../types.ts';

/**
 * Verifies RCCL evidence statically when verification fields are missing or stale.
 */
export function verifyRcclDocument(rccl: RcclDocument, projectRoot: string, now = new Date()): RcclDocument {
  return {
    ...rccl,
    observations: rccl.observations.map((observation) => needsVerification(observation)
      ? verifyObservation(observation, projectRoot, now.toISOString())
      : observation),
  };
}

function needsVerification(observation: RcclObservation): boolean {
  return !observation.verification.status || !observation.verification.checked_at;
}

function verifyObservation(observation: RcclObservation, projectRoot: string, checkedAt: string): RcclObservation {
  if (observation.evidence.length === 0) {
    return withVerification(observation, 'unverifiable', 0, 0, checkedAt, 'demote-to-ambient');
  }
  const results = observation.evidence.map((item) => verifyEvidence(item, projectRoot));
  const verifiedCount = results.filter((result) => result.status === 'match').length;
  const ratio = verifiedCount / results.length;
  if (verifiedCount === results.length) {
    return withVerification(observation, 'verified', verifiedCount, observation.confidence, checkedAt, 'keep');
  }
  if (verifiedCount > 0) {
    const confidence = Math.max(observation.confidence * ratio, 0.3);
    const disposition: VerificationDisposition = confidence < 0.7 ? 'keep-with-reduced-confidence' : 'keep';
    return withVerification(observation, 'partial', verifiedCount, confidence, checkedAt, disposition);
  }
  return withVerification(observation, 'failed', 0, 0, checkedAt, 'demote-to-ambient');
}

function withVerification(
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
      status,
      verified_count: verifiedCount,
      verified_confidence: Number(verifiedConfidence.toFixed(2)),
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
