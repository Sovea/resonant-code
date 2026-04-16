import { existsSync, readFileSync } from 'node:fs';
import { parseYaml } from '../utils/yaml.ts';
import type { RcclDocument, RcclObservation, RcclSupport, RcclVerification } from '../types.ts';

/**
 * Loads RCCL from disk and normalizes verification fields.
 */
export function loadRccl(filePath?: string): RcclDocument | null {
  if (!filePath || !existsSync(filePath)) return null;
  const parsed = parseYaml(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  const observations = Array.isArray(parsed.observations)
    ? parsed.observations.map(normalizeObservation)
    : [];
  return {
    version: String(parsed.version ?? '1.0'),
    generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : null,
    git_ref: typeof parsed.git_ref === 'string' ? parsed.git_ref : null,
    observations,
  };
}

function normalizeObservation(input: unknown): RcclObservation {
  const item = input as Record<string, unknown>;
  return {
    id: String(item.id),
    semantic_key: normalizeSemanticKey(String(item.semantic_key ?? item.id ?? '')),
    category: item.category as RcclObservation['category'],
    scope: normalizeScope(String(item.scope ?? '**')),
    pattern: String(item.pattern),
    confidence: Number(item.confidence ?? 0),
    adherence_quality: item.adherence_quality as RcclObservation['adherence_quality'],
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((evidence) => {
          const value = evidence as Record<string, unknown>;
          const lineRange = (value.line_range as unknown[]) ?? [1, 1];
          return {
            file: normalizePath(String(value.file)),
            line_range: [Number(lineRange[0]), Number(lineRange[1])] as [number, number],
            snippet: String(value.snippet ?? ''),
          };
        })
      : [],
    support: normalizeSupport(item.support as Record<string, unknown> | undefined, item.evidence as unknown[] | undefined, normalizeScope(String(item.scope ?? '**'))),
    verification: normalizeVerification(item.verification as Record<string, unknown> | undefined),
  };
}

function normalizeSupport(input: Record<string, unknown> | undefined, evidence: unknown[] | undefined, scope: string): RcclSupport {
  const evidenceFiles = Array.from(new Set((evidence ?? []).map((item) => normalizePath(String((item as Record<string, unknown>).file ?? ''))).filter(Boolean)));
  const fileCount = input?.file_count == null ? Math.max(1, evidenceFiles.length) : Number(input.file_count);
  return {
    source_slices: Array.isArray(input?.source_slices) ? Array.from(new Set(input?.source_slices.map(String))).sort() : [],
    file_count: fileCount,
    cluster_count: input?.cluster_count == null ? inferClusterCount(scope, evidenceFiles) : Number(input.cluster_count),
    scope_basis: normalizeScopeBasis(String(input?.scope_basis ?? inferScopeBasis(scope, fileCount, evidenceFiles))),
  };
}

function normalizeVerification(input: Record<string, unknown> | undefined): RcclVerification {
  const verification = input ?? {};
  return {
    evidence_status: (verification.evidence_status ?? null) as RcclVerification['evidence_status'],
    evidence_verified_count: verification.evidence_verified_count == null ? null : Number(verification.evidence_verified_count),
    evidence_confidence: verification.evidence_confidence == null ? null : Number(verification.evidence_confidence),
    induction_status: (verification.induction_status ?? null) as RcclVerification['induction_status'],
    induction_confidence: verification.induction_confidence == null ? null : Number(verification.induction_confidence),
    checked_at: typeof verification.checked_at === 'string' ? verification.checked_at : null,
    disposition: (verification.disposition ?? null) as RcclVerification['disposition'],
  };
}

function inferClusterCount(scope: string, evidenceFiles: string[]): number {
  if (scope === '**') return Math.max(2, new Set(evidenceFiles.map(rootFromPath).filter(Boolean)).size);
  if (scope.includes('/**')) return 1;
  if (evidenceFiles.length <= 1) return 1;
  return new Set(evidenceFiles.map(directoryFromPath).filter(Boolean)).size;
}

function inferScopeBasis(scope: string, fileCount: number, evidenceFiles: string[]): string {
  const roots = new Set(evidenceFiles.map(rootFromPath).filter(Boolean));
  if (scope === '**' || roots.size > 1) return 'cross-root';
  if (fileCount <= 1 && !scope.includes('*')) return 'single-file';
  if (scope.includes('/**')) return 'directory-cluster';
  return 'module-cluster';
}

function normalizeScopeBasis(value: string): RcclSupport['scope_basis'] {
  if (value === 'single-file' || value === 'directory-cluster' || value === 'module-cluster' || value === 'cross-root') return value;
  return 'module-cluster';
}

function normalizeScope(scope: string): string {
  const trimmed = scope.trim();
  return trimmed.length > 0 ? trimmed : '**';
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeSemanticKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'unknown';
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
