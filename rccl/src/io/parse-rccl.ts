import type {
  CandidateObservation,
  CandidateRcclDocument,
  ParsedCandidateRcclResult,
  ParsedRcclResult,
  RcclDocument,
  RcclEvidence,
  RcclObservation,
  RcclSupport,
  RcclVerification,
} from '../types.ts';
import { parseYaml } from '../utils/yaml.ts';

const ID_PATTERN = /^obs-[a-z0-9-]+$/;
const VALID_CATEGORIES = new Set(['style', 'architecture', 'pattern', 'constraint', 'legacy', 'anti-pattern', 'migration']);
const VALID_ADHERENCE = new Set(['good', 'inconsistent', 'poor']);
const VALID_SCOPE_BASES = new Set(['single-file', 'directory-cluster', 'module-cluster', 'cross-root']);
const REQUIRED_VERIFICATION_FIELDS = ['evidence_status', 'evidence_verified_count', 'evidence_confidence', 'induction_status', 'induction_confidence', 'checked_at', 'disposition'];

export function parseRccl(yamlText: string, options: { allowVerifiedFields?: boolean } = {}): ParsedRcclResult {
  const allowVerifiedFields = options.allowVerifiedFields === true;
  const parsed = parseRcclCandidates(yamlText, options);
  if (!parsed.valid || !parsed.data) return { valid: false, errors: parsed.errors };

  const observations = parsed.data.observations.map((candidate, index) =>
    normalizeObservation({
      id: normalizeObservationId(candidate.provisional_id, candidate.semantic_key, candidate.category, index),
      semantic_key: candidate.semantic_key,
      category: candidate.category,
      scope: normalizeScope(candidate.scope_hint),
      pattern: candidate.pattern,
      confidence: candidate.confidence,
      adherence_quality: candidate.adherence_quality,
      evidence: candidate.evidence,
      support: {
        source_slices: candidate.source_slice_ids,
        file_count: candidate.support_hint?.file_count,
        cluster_count: candidate.support_hint?.cluster_count,
        scope_basis: candidate.support_hint?.scope_basis,
      },
      verification: emptyVerification(),
    }),
  );

  return {
    valid: true,
    data: {
      version: parsed.data.version,
      generated_at: parsed.data.generated_at,
      git_ref: parsed.data.git_ref,
      observations,
    },
  };
}

export function parseRcclCandidates(yamlText: string, options: { allowVerifiedFields?: boolean } = {}): ParsedCandidateRcclResult {
  const allowVerifiedFields = options.allowVerifiedFields === true;
  let cleaned = yamlText.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:yaml|yml)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  let doc: any;
  try {
    doc = parseYaml(cleaned);
  } catch (err) {
    return { valid: false, errors: [`YAML parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (!doc || typeof doc !== 'object') return { valid: false, errors: ['Document must be a YAML object'] };

  const errors: string[] = [];
  if (doc.version !== '1.0' && doc.version !== 1) errors.push(`'version' must be "1.0", got "${doc.version}"`);
  if (!Array.isArray(doc.observations) || doc.observations.length === 0) {
    errors.push("'observations' must be a non-empty array");
    return { valid: false, errors };
  }

  const ids = new Set<string>();
  for (let i = 0; i < doc.observations.length; i += 1) {
    const obs = doc.observations[i] as Record<string, unknown>;
    const rawId = String(obs.id ?? obs.provisional_id ?? '');
    if (rawId) {
      if (ids.has(rawId)) errors.push(`Duplicate observation id: "${rawId}"`);
      ids.add(rawId);
    }
    errors.push(...validateObservation(obs, i, allowVerifiedFields));
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: normalizeCandidateDocument(doc as Record<string, unknown>) };
}

function validateObservation(obs: Record<string, unknown>, index: number, allowVerifiedFields: boolean): string[] {
  const errors: string[] = [];
  const prefix = `observations[${index}]`;
  const id = obs.id ?? obs.provisional_id;

  if (!id || typeof id !== 'string') errors.push(`${prefix}: missing or invalid 'id'`);
  else if (!ID_PATTERN.test(String(id))) errors.push(`${prefix}: 'id' "${id}" does not match /^obs-[a-z0-9-]+$/`);

  if (!VALID_CATEGORIES.has(String(obs.category))) errors.push(`${prefix}: 'category' is invalid`);
  if (!obs.semantic_key || typeof obs.semantic_key !== 'string') errors.push(`${prefix}: missing or invalid 'semantic_key'`);
  const scopeValue = obs.scope ?? obs.scope_hint;
  if (!scopeValue || typeof scopeValue !== 'string') errors.push(`${prefix}: missing or invalid 'scope'`);
  if (!obs.pattern || typeof obs.pattern !== 'string') errors.push(`${prefix}: missing or invalid 'pattern'`);
  if (typeof obs.confidence !== 'number' || Number.isNaN(obs.confidence) || obs.confidence < 0 || obs.confidence > 1) {
    errors.push(`${prefix}: 'confidence' must be a number between 0 and 1, got ${obs.confidence}`);
  }
  if (!VALID_ADHERENCE.has(String(obs.adherence_quality))) errors.push(`${prefix}: 'adherence_quality' is invalid`);

  if (!Array.isArray(obs.evidence) || obs.evidence.length === 0) {
    errors.push(`${prefix}: 'evidence' must be a non-empty array`);
  } else {
    for (let i = 0; i < obs.evidence.length; i += 1) {
      const evidence = obs.evidence[i] as Record<string, unknown>;
      if (!evidence.file || typeof evidence.file !== 'string') errors.push(`${prefix}.evidence[${i}]: missing or invalid 'file'`);
      if (!Array.isArray(evidence.line_range) || evidence.line_range.length !== 2) errors.push(`${prefix}.evidence[${i}]: invalid 'line_range'`);
      if (!evidence.snippet || typeof evidence.snippet !== 'string') {
        errors.push(`${prefix}.evidence[${i}]: missing or invalid 'snippet'`);
      } else {
        const snippetErrors = validateEvidenceSnippet(evidence.snippet, prefix, i);
        errors.push(...snippetErrors);
      }
    }
  }

  const support = (obs.support ?? {}) as Record<string, unknown>;
  const sourceSlices = obs.source_slice_ids ?? support.source_slices;
  if (sourceSlices != null && !Array.isArray(sourceSlices)) errors.push(`${prefix}.source_slice_ids: must be an array`);
  if (obs.support != null) {
    if (support.file_count != null && typeof support.file_count !== 'number') errors.push(`${prefix}.support.file_count: must be a number`);
    if (support.cluster_count != null && typeof support.cluster_count !== 'number') errors.push(`${prefix}.support.cluster_count: must be a number`);
    if (support.scope_basis != null && !VALID_SCOPE_BASES.has(String(support.scope_basis))) {
      errors.push(`${prefix}.support.scope_basis: invalid value`);
    }
  }

  const verification = (obs.verification ?? {}) as Record<string, unknown>;
  const hasVerification = Object.keys(verification).length > 0;
  if (hasVerification) {
    for (const field of REQUIRED_VERIFICATION_FIELDS) {
      if (!(field in verification)) errors.push(`${prefix}.verification.${field}: missing required field`);
    }

    if (!allowVerifiedFields) {
      for (const field of REQUIRED_VERIFICATION_FIELDS) {
        if (verification[field] !== null && verification[field] !== undefined) {
          errors.push(`${prefix}.verification.${field}: must be null (runtime fills this), got "${verification[field]}"`);
        }
      }
    }
  }

  return errors;
}

function validateEvidenceSnippet(snippet: unknown, prefix: string, index: number): string[] {
  if (typeof snippet !== 'string') return [];
  const normalized = snippet.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [`${prefix}.evidence[${index}]: snippet must not be empty`];

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const tokenMatches = normalized.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|==|!=|<=|>=|=>|&&|\|\||[()[\]{}.,;:+\-*/%<>!=?]/g) ?? [];
  const identifierCount = tokenMatches.filter((token) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)).length;
  const punctuationCount = tokenMatches.length - identifierCount;
  const hasDistinctiveStructure = /[{}();=>]|\b(import|export|return|const|let|var|function|class|interface|type|if|for|while|switch|case|await|async)\b/.test(normalized);

  if (lines.length >= 2 || hasDistinctiveStructure) return [];
  if (tokenMatches.length < 4) {
    return [`${prefix}.evidence[${index}]: snippet is too short to verify reliably; include at least a distinctive statement or 2+ lines of code`];
  }
  if (identifierCount <= 2 && punctuationCount === 0) {
    return [`${prefix}.evidence[${index}]: snippet looks like an identifier or label, not a verifiable code fragment`];
  }
  return [];
}

function normalizeCandidateDocument(input: Record<string, unknown>): CandidateRcclDocument {
  return {
    version: '1.0',
    generated_at: typeof input.generated_at === 'string' ? input.generated_at : null,
    git_ref: typeof input.git_ref === 'string' ? input.git_ref : null,
    observations: Array.isArray(input.observations) ? input.observations.map(normalizeCandidateObservation) : [],
  };
}

function normalizeCandidateObservation(input: unknown): CandidateObservation {
  const item = input as Record<string, unknown>;
  const support = item.support as Record<string, unknown> | undefined;
  const sourceSlices = Array.isArray(item.source_slice_ids)
    ? item.source_slice_ids
    : Array.isArray(support?.source_slices)
      ? support?.source_slices
      : [];

  return {
    provisional_id: String(item.provisional_id ?? item.id),
    semantic_key: normalizeSemanticKey(String(item.semantic_key ?? item.id ?? '')),
    category: item.category as CandidateObservation['category'],
    scope_hint: normalizeScope(String(item.scope_hint ?? item.scope ?? '**')),
    pattern: String(item.pattern),
    confidence: Number(item.confidence ?? 0),
    adherence_quality: item.adherence_quality as CandidateObservation['adherence_quality'],
    evidence: Array.isArray(item.evidence) ? item.evidence.map(normalizeEvidence) : [],
    source_slice_ids: Array.from(new Set(sourceSlices.map(String))).sort(),
    support_hint: support == null
      ? null
      : {
          scope_basis: support.scope_basis == null ? null : normalizeScopeBasis(String(support.scope_basis)),
          file_count: support.file_count == null ? null : Number(support.file_count),
          cluster_count: support.cluster_count == null ? null : Number(support.cluster_count),
        },
  };
}

function normalizeDocument(input: Record<string, unknown>): RcclDocument {
  return {
    version: '1.0',
    generated_at: typeof input.generated_at === 'string' ? input.generated_at : null,
    git_ref: typeof input.git_ref === 'string' ? input.git_ref : null,
    observations: Array.isArray(input.observations) ? input.observations.map(normalizeObservation) : [],
  };
}

export function normalizeObservation(input: unknown): RcclObservation {
  const item = input as Record<string, unknown>;
  const verification = normalizeVerification(item.verification as Record<string, unknown> | undefined);
  const support = normalizeSupport(item.support as Record<string, unknown> | undefined, item.evidence as unknown[] | undefined, normalizeScope(String(item.scope ?? '**')));
  return {
    id: String(item.id),
    semantic_key: normalizeSemanticKey(String(item.semantic_key ?? item.id ?? '')),
    category: item.category as RcclObservation['category'],
    scope: normalizeScope(String(item.scope ?? '**')),
    pattern: String(item.pattern),
    confidence: Number(item.confidence ?? 0),
    adherence_quality: item.adherence_quality as RcclObservation['adherence_quality'],
    evidence: Array.isArray(item.evidence) ? item.evidence.map(normalizeEvidence) : [],
    support,
    verification,
  };
}

function normalizeEvidence(input: unknown): RcclEvidence {
  const value = input as Record<string, unknown>;
  const lineRange = (value.line_range as unknown[]) ?? [1, 1];
  return {
    file: normalizePath(String(value.file)),
    line_range: [Number(lineRange[0]), Number(lineRange[1])] as [number, number],
    snippet: String(value.snippet ?? ''),
  };
}

function normalizeSupport(input: Record<string, unknown> | undefined, evidence: unknown[] | undefined, scope: string): RcclSupport {
  const evidenceFiles = Array.from(new Set((evidence ?? []).map((item) => normalizePath(String((item as Record<string, unknown>).file ?? ''))).filter(Boolean)));
  const fileCount = input?.file_count == null ? Math.max(1, evidenceFiles.length) : Number(input.file_count);
  const clusterCount = input?.cluster_count == null
    ? inferFallbackClusterCount(scope, evidenceFiles)
    : Number(input.cluster_count);
  const scopeBasis = input?.scope_basis == null
    ? inferFallbackScopeBasis(scope, fileCount, evidenceFiles)
    : normalizeScopeBasis(String(input.scope_basis));
  return {
    source_slices: Array.isArray(input?.source_slices) ? Array.from(new Set(input?.source_slices.map(String))).sort() : [],
    file_count: fileCount,
    cluster_count: clusterCount,
    scope_basis: scopeBasis,
  };
}

function inferFallbackClusterCount(scope: string, evidenceFiles: string[]): number {
  return inferClusterCount(scope, evidenceFiles);
}

function inferFallbackScopeBasis(scope: string, fileCount: number, evidenceFiles: string[]): RcclSupport['scope_basis'] {
  return normalizeScopeBasis(inferScopeBasis(scope, fileCount, evidenceFiles));
}

function inferClusterCount(scope: string, evidenceFiles: string[]): number {
  if (scope === '**') return Math.max(2, new Set(evidenceFiles.map(rootFromPath)).size);
  if (scope.includes('/**')) return 1;
  if (evidenceFiles.length <= 1) return 1;
  return new Set(evidenceFiles.map(directoryFromPath)).size;
}

function inferScopeBasis(scope: string, fileCount: number, evidenceFiles: string[]): string {
  const roots = new Set(evidenceFiles.map(rootFromPath).filter(Boolean));
  if (scope === '**' || roots.size > 1) return 'cross-root';
  if (fileCount <= 1 && !scope.includes('*')) return 'single-file';
  if (scope.includes('/**')) return 'directory-cluster';
  return 'module-cluster';
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

function normalizeScopeBasis(value: string): RcclSupport['scope_basis'] {
  if (value === 'single-file' || value === 'directory-cluster' || value === 'module-cluster' || value === 'cross-root') return value;
  return 'module-cluster';
}

function normalizeObservationId(id: string, semanticKey: string, category: string, index: number): string {
  if (ID_PATTERN.test(id)) return id;
  const normalizedCategory = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pattern';
  const normalizedSemanticKey = normalizeSemanticKey(semanticKey).slice(0, 48) || `candidate-${index + 1}`;
  return `obs-${normalizedCategory}-${normalizedSemanticKey}`;
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

function emptyVerification(): RcclVerification {
  return {
    evidence_status: null,
    evidence_verified_count: null,
    evidence_confidence: null,
    induction_status: null,
    induction_confidence: null,
    checked_at: null,
    disposition: null,
  };
}

export { normalizeDocument };
