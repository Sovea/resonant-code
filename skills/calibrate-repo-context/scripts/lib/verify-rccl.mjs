import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Normalizes small formatting differences before evidence comparison.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeCode(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/['"`]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits code into comparison-friendly tokens for loose evidence matching.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const matches = normalizeCode(text).match(/[A-Za-z_][A-Za-z0-9_]*|\d+|==|!=|<=|>=|=>|&&|\|\||[()[\]{}.,;:+\-*/%<>!=?]/g);
  return matches ?? [];
}

/**
 * Computes multiset token overlap between an actual snippet and claimed evidence.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function tokenOverlapSimilarity(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }

  // Multiset overlap is loose enough to survive formatting drift but still reject bad evidence.
  const aCounts = new Map();
  for (const token of aTokens) {
    aCounts.set(token, (aCounts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of bTokens) {
    const count = aCounts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      aCounts.set(token, count - 1);
    }
  }

  return overlap / Math.max(aTokens.length, bTokens.length);
}

/**
 * Verifies one evidence item against the repository without using an LLM.
 *
 * @param {{ file: string, line_range: number[], snippet: string }} evidence
 * @param {string} projectRoot
 * @returns {{ status: string, similarity?: number }}
 */
function verifyEvidenceItem(evidence, projectRoot) {
  const fullPath = join(projectRoot, evidence.file);
  if (!existsSync(fullPath)) {
    return { status: 'file-not-found' };
  }

  let lines;
  try {
    lines = readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n').split('\n');
  } catch {
    return { status: 'read-failed' };
  }

  const [start, end] = evidence.line_range;
  if (start < 1 || end < start || end > lines.length) {
    return { status: 'range-out-of-bounds' };
  }

  // Verification is anchored to the claimed line range before similarity is computed.
  const actual = lines.slice(start - 1, end).join('\n');
  const similarity = tokenOverlapSimilarity(actual, evidence.snippet);
  if (similarity >= 0.75) {
    return { status: 'match', similarity };
  }

  return { status: 'mismatch', similarity };
}

/**
 * Maps verification outcome to how downstream runtime should treat the observation.
 *
 * @param {string} verificationStatus
 * @param {number} verifiedConfidence
 * @returns {string}
 */
function computeDisposition(verificationStatus, verifiedConfidence) {
  if (verificationStatus === 'failed' || verificationStatus === 'unverifiable') {
    return 'demote-to-ambient';
  }
  if (verificationStatus === 'partial' && verifiedConfidence < 0.7) {
    return 'keep-with-reduced-confidence';
  }
  return 'keep';
}

/**
 * Rewrites one observation with runtime-filled verification fields.
 *
 * @param {object} observation
 * @param {string} projectRoot
 * @param {string} checkedAt
 * @returns {object}
 */
function summarizeObservation(observation, projectRoot, checkedAt) {
  if (!Array.isArray(observation.evidence) || observation.evidence.length === 0) {
    return {
      ...observation,
      verification: {
        status: 'unverifiable',
        verified_count: 0,
        verified_confidence: 0,
        checked_at: checkedAt,
        disposition: 'demote-to-ambient',
      },
    };
  }

  const evidenceResults = observation.evidence.map(item => verifyEvidenceItem(item, projectRoot));
  const verifiedCount = evidenceResults.filter(result => result.status === 'match').length;
  const total = evidenceResults.length;
  const ratio = total === 0 ? 0 : verifiedCount / total;

  let status;
  let verifiedConfidence;

  if (verifiedCount === total) {
    status = 'verified';
    verifiedConfidence = observation.confidence;
  } else if (verifiedCount > 0) {
    status = 'partial';
    verifiedConfidence = Math.max(observation.confidence * ratio, 0.3);
  } else {
    status = 'failed';
    verifiedConfidence = 0;
  }

  // Failed observations are preserved with an explicit downgrade instead of being silently dropped.
  return {
    ...observation,
    verification: {
      status,
      verified_count: verifiedCount,
      verified_confidence: Number(verifiedConfidence.toFixed(2)),
      checked_at: checkedAt,
      disposition: computeDisposition(status, verifiedConfidence),
    },
  };
}

export function verifyRcclDocument(rccl, projectRoot, now = new Date()) {
  const checkedAt = now.toISOString();
  // Sort after verification so identical inputs produce stable output ordering.
  const observations = (rccl.observations ?? [])
    .map(observation => summarizeObservation(observation, projectRoot, checkedAt))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...rccl,
    observations,
  };
}
