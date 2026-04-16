import type { CandidateObservation, RcclEvidence, RcclSupport } from '../types.ts';

export function deriveSupport(candidate: Pick<CandidateObservation, 'scope_hint' | 'source_slice_ids' | 'support_hint'>, evidence: RcclEvidence[]): RcclSupport {
  const evidenceFiles = Array.from(new Set(evidence.map((item) => normalizePath(item.file)).filter(Boolean))).sort();
  const rootCount = new Set(evidenceFiles.map(rootFromPath).filter(Boolean)).size;
  const directoryCount = new Set(evidenceFiles.map(directoryFromPath).filter(Boolean)).size;
  const hintedFileCount = candidate.support_hint?.file_count ?? null;
  const hintedClusterCount = candidate.support_hint?.cluster_count ?? null;
  const file_count = hintedFileCount == null ? Math.max(1, evidenceFiles.length) : Math.max(1, hintedFileCount);
  const scope_basis = candidate.support_hint?.scope_basis ?? inferScopeBasis(candidate.scope_hint, file_count, rootCount, directoryCount);
  const cluster_count = hintedClusterCount == null ? inferClusterCount(scope_basis, rootCount, directoryCount) : Math.max(1, hintedClusterCount);

  return {
    source_slices: Array.from(new Set(candidate.source_slice_ids)).sort(),
    file_count,
    cluster_count,
    scope_basis,
  };
}

export function deriveScope(scopeHint: string, support: RcclSupport, evidence: RcclEvidence[]): string {
  const normalizedHint = normalizeScope(scopeHint);
  if (support.scope_basis === 'cross-root') return '**';
  if (normalizedHint !== '**' && !normalizedHint.includes('*')) return normalizedHint;

  const evidenceFiles = Array.from(new Set(evidence.map((item) => normalizePath(item.file)).filter(Boolean))).sort();
  if (support.scope_basis === 'single-file' && evidenceFiles.length > 0) return evidenceFiles[0];

  const directories = Array.from(new Set(evidenceFiles.map(directoryFromPath).filter(Boolean)));
  if (support.scope_basis === 'directory-cluster' && directories.length === 1) return `${directories[0]}/**`;

  const roots = Array.from(new Set(evidenceFiles.map(rootFromPath).filter(Boolean)));
  if (support.scope_basis === 'module-cluster' && roots.length === 1) return `${roots[0]}/**`;

  return normalizedHint;
}

function inferScopeBasis(scopeHint: string, fileCount: number, rootCount: number, directoryCount: number): RcclSupport['scope_basis'] {
  if (rootCount > 1 || normalizeScope(scopeHint) === '**') return 'cross-root';
  if (fileCount <= 1) return 'single-file';
  if (directoryCount <= 1) return 'directory-cluster';
  return 'module-cluster';
}

function inferClusterCount(scopeBasis: RcclSupport['scope_basis'], rootCount: number, directoryCount: number): number {
  if (scopeBasis === 'cross-root') return Math.max(2, rootCount);
  if (scopeBasis === 'directory-cluster') return 1;
  if (scopeBasis === 'single-file') return 1;
  return Math.max(1, directoryCount);
}

function normalizeScope(scope: string): string {
  const trimmed = scope.trim();
  return trimmed.length > 0 ? trimmed : '**';
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function rootFromPath(filePath: string): string {
  const normalized = normalizePath(filePath);
  const [root] = normalized.split('/');
  return root || normalized;
}

function directoryFromPath(filePath: string): string {
  const normalized = normalizePath(filePath);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 1) return normalized;
  return segments.slice(0, -1).join('/');
}
