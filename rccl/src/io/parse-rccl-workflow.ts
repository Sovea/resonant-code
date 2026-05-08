import type {
  ParsedRcclWorkflowCritiqueResult,
  ParsedRcclWorkflowDiscoveryResult,
  RcclEvidence,
  RcclSchemaVersion,
  RcclWorkflowCritiqueDocument,
  RcclWorkflowCritiqueDisposition,
  RcclWorkflowDiscoveryDocument,
} from '../types.ts';
import { parseYaml } from '../utils/yaml.ts';

const RCCL_VERSION: RcclSchemaVersion = '1.0';
const ID_PATTERN = /^obs-[a-z0-9-]+$/;

function isRcclVersion(value: unknown): boolean {
  return value === RCCL_VERSION || value === 1;
}
const VALID_CATEGORIES = new Set(['style', 'architecture', 'pattern', 'constraint', 'legacy', 'anti-pattern', 'migration']);
const VALID_CRITIQUE_DISPOSITIONS = new Set<RcclWorkflowCritiqueDisposition>(['keep', 'revise', 'drop']);

export function parseRcclDiscoveryArtifact(yamlText: string): ParsedRcclWorkflowDiscoveryResult {
  const parsed = parseRawWorkflowDocument(yamlText);
  if (!parsed.valid || !parsed.doc) return { valid: false, errors: parsed.errors };

  const errors = validateDiscoveryDocument(parsed.doc);
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: normalizeDiscoveryDocument(parsed.doc) };
}

export function parseRcclCritiqueArtifact(yamlText: string): ParsedRcclWorkflowCritiqueResult {
  const parsed = parseRawWorkflowDocument(yamlText);
  if (!parsed.valid || !parsed.doc) return { valid: false, errors: parsed.errors };

  const errors = validateCritiqueDocument(parsed.doc);
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: normalizeCritiqueDocument(parsed.doc) };
}

function parseRawWorkflowDocument(yamlText: string): { valid: true; doc: Record<string, unknown> } | { valid: false; errors: string[]; doc?: never } {
  let cleaned = yamlText.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:yaml|yml)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  let doc: unknown;
  try {
    doc = parseYaml(cleaned);
  } catch (err) {
    return { valid: false, errors: [`YAML parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { valid: false, errors: ['Document must be a YAML object'] };
  return { valid: true, doc: doc as Record<string, unknown> };
}

function validateEnvelope(doc: Record<string, unknown>, stage: 'discover' | 'critique', collectionField: 'seeds' | 'reviews'): string[] {
  const errors: string[] = [];
  if (!isRcclVersion(doc.version)) errors.push(`'version' must be "${RCCL_VERSION}", got "${doc.version}"`);
  if (doc.stage !== stage) errors.push(`'stage' must be "${stage}", got "${doc.stage}"`);
  if (doc.generated_at !== null && typeof doc.generated_at !== 'string') errors.push("'generated_at' must be null or a string");
  if (!doc.scope || typeof doc.scope !== 'string') errors.push("missing or invalid 'scope'");
  if (!Array.isArray(doc[collectionField]) || doc[collectionField].length === 0) {
    errors.push(`'${collectionField}' must be a non-empty array`);
  }
  return errors;
}

function validateDiscoveryDocument(doc: Record<string, unknown>): string[] {
  const errors = validateEnvelope(doc, 'discover', 'seeds');
  if (errors.length > 0) return errors;

  const ids = new Set<string>();
  for (let i = 0; i < (doc.seeds as unknown[]).length; i += 1) {
    const seed = (doc.seeds as unknown[])[i] as Record<string, unknown>;
    const prefix = `seeds[${i}]`;
    const seedId = String(seed.seed_id ?? '');
    if (!seedId || typeof seed.seed_id !== 'string') errors.push(`${prefix}: missing or invalid 'seed_id'`);
    else if (!ID_PATTERN.test(seedId)) errors.push(`${prefix}: 'seed_id' "${seedId}" does not match /^obs-[a-z0-9-]+$/`);
    else if (ids.has(seedId)) errors.push(`Duplicate discovery seed id: "${seedId}"`);
    ids.add(seedId);

    if (!seed.semantic_key || typeof seed.semantic_key !== 'string') errors.push(`${prefix}: missing or invalid 'semantic_key'`);
    if (!VALID_CATEGORIES.has(String(seed.category))) errors.push(`${prefix}: 'category' is invalid`);
    if (!seed.scope_hint || typeof seed.scope_hint !== 'string') errors.push(`${prefix}: missing or invalid 'scope_hint'`);
    if (!seed.pattern || typeof seed.pattern !== 'string') errors.push(`${prefix}: missing or invalid 'pattern'`);
    if (!seed.decision_impact || typeof seed.decision_impact !== 'string') errors.push(`${prefix}: missing or invalid 'decision_impact'`);
    if (!Array.isArray(seed.source_slice_ids) || seed.source_slice_ids.length === 0) errors.push(`${prefix}: missing or invalid 'source_slice_ids'`);
    errors.push(...validateEvidenceList(seed.evidence, `${prefix}.evidence`));
    if (seed.uncertainty != null && typeof seed.uncertainty !== 'string') errors.push(`${prefix}.uncertainty: must be null or a string`);
  }
  return errors;
}

function validateCritiqueDocument(doc: Record<string, unknown>): string[] {
  const errors = validateEnvelope(doc, 'critique', 'reviews');
  if (errors.length > 0) return errors;

  const ids = new Set<string>();
  for (let i = 0; i < (doc.reviews as unknown[]).length; i += 1) {
    const review = (doc.reviews as unknown[])[i] as Record<string, unknown>;
    const prefix = `reviews[${i}]`;
    const seedId = String(review.seed_id ?? '');
    if (!seedId || typeof review.seed_id !== 'string') errors.push(`${prefix}: missing or invalid 'seed_id'`);
    else if (!ID_PATTERN.test(seedId)) errors.push(`${prefix}: 'seed_id' "${seedId}" does not match /^obs-[a-z0-9-]+$/`);
    else if (ids.has(seedId)) errors.push(`Duplicate critique seed id: "${seedId}"`);
    ids.add(seedId);

    if (!VALID_CRITIQUE_DISPOSITIONS.has(review.disposition as RcclWorkflowCritiqueDisposition)) errors.push(`${prefix}: 'disposition' is invalid`);
    if (!Array.isArray(review.reasons) || review.reasons.length === 0) errors.push(`${prefix}: missing or invalid 'reasons'`);
    if (review.issues != null && !Array.isArray(review.issues)) errors.push(`${prefix}.issues: must be an array when present`);
    if (review.counter_evidence != null) errors.push(...validateEvidenceList(review.counter_evidence, `${prefix}.counter_evidence`));
    if (review.recommended_scope_hint != null && typeof review.recommended_scope_hint !== 'string') {
      errors.push(`${prefix}.recommended_scope_hint: must be null or a string`);
    }
  }
  return errors;
}

function validateEvidenceList(value: unknown, prefix: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value) || value.length === 0) return [`${prefix}: must be a non-empty array`];
  for (let i = 0; i < value.length; i += 1) {
    const evidence = value[i] as Record<string, unknown>;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      errors.push(`${prefix}[${i}]: must be an object`);
      continue;
    }
    if (!evidence.file || typeof evidence.file !== 'string') errors.push(`${prefix}[${i}]: missing or invalid 'file'`);
    if (!Array.isArray(evidence.line_range) || evidence.line_range.length !== 2) errors.push(`${prefix}[${i}]: invalid 'line_range'`);
    if (!evidence.snippet || typeof evidence.snippet !== 'string') errors.push(`${prefix}[${i}]: missing or invalid 'snippet'`);
  }
  return errors;
}

function normalizeEvidenceList(value: unknown): RcclEvidence[] {
  return (value as Record<string, unknown>[]).map((evidence) => ({
    file: String(evidence.file),
    line_range: [Number((evidence.line_range as unknown[])[0]), Number((evidence.line_range as unknown[])[1])],
    snippet: String(evidence.snippet),
  }));
}

function normalizeDiscoveryDocument(doc: Record<string, unknown>): RcclWorkflowDiscoveryDocument {
  return {
    version: RCCL_VERSION,
    stage: 'discover',
    generated_at: doc.generated_at == null ? null : String(doc.generated_at),
    scope: String(doc.scope),
    seeds: (doc.seeds as Record<string, unknown>[]).map((seed) => ({
      seed_id: String(seed.seed_id),
      semantic_key: String(seed.semantic_key),
      category: seed.category as RcclWorkflowDiscoveryDocument['seeds'][number]['category'],
      scope_hint: String(seed.scope_hint),
      pattern: String(seed.pattern),
      decision_impact: String(seed.decision_impact),
      evidence: normalizeEvidenceList(seed.evidence),
      source_slice_ids: (seed.source_slice_ids as unknown[]).map(String),
      uncertainty: seed.uncertainty == null ? null : String(seed.uncertainty),
    })),
  };
}

function normalizeCritiqueDocument(doc: Record<string, unknown>): RcclWorkflowCritiqueDocument {
  return {
    version: RCCL_VERSION,
    stage: 'critique',
    generated_at: doc.generated_at == null ? null : String(doc.generated_at),
    scope: String(doc.scope),
    reviews: (doc.reviews as Record<string, unknown>[]).map((review) => ({
      seed_id: String(review.seed_id),
      disposition: review.disposition as RcclWorkflowCritiqueDisposition,
      reasons: (review.reasons as unknown[]).map(String),
      issues: review.issues == null ? undefined : (review.issues as unknown[]).map(String),
      counter_evidence: review.counter_evidence == null ? undefined : normalizeEvidenceList(review.counter_evidence),
      recommended_scope_hint: review.recommended_scope_hint == null ? null : String(review.recommended_scope_hint),
    })),
  };
}
