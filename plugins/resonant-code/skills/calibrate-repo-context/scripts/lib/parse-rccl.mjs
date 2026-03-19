import { parse as parseYaml } from './yaml-parse.mjs';

const ID_PATTERN = /^obs-[a-z0-9-]+$/;
const VALID_CATEGORIES = new Set(['style', 'architecture', 'pattern', 'constraint', 'legacy', 'anti-pattern', 'migration']);
const VALID_ADHERENCE = new Set(['good', 'inconsistent', 'poor']);
const VERIFICATION_FIELDS = ['status', 'verified_count', 'verified_confidence', 'checked_at', 'disposition'];

/**
 * Validates one observation node against the RCCL schema.
 *
 * @param {object} obs
 * @param {number} index
 * @returns {string[]}
 */
function validateObservation(obs, index) {
  const errors = [];
  const prefix = `observations[${index}]`;

  if (!obs.id || typeof obs.id !== 'string') {
    errors.push(`${prefix}: missing or invalid 'id'`);
  } else if (!ID_PATTERN.test(obs.id)) {
    errors.push(`${prefix}: 'id' "${obs.id}" does not match /^obs-[a-z0-9-]+$/`);
  }

  if (!VALID_CATEGORIES.has(obs.category)) {
    errors.push(`${prefix}: 'category' must be one of [${[...VALID_CATEGORIES].join(', ')}], got "${obs.category}"`);
  }

  if (!obs.scope || typeof obs.scope !== 'string') {
    errors.push(`${prefix}: missing or invalid 'scope'`);
  }

  if (!obs.pattern || typeof obs.pattern !== 'string') {
    errors.push(`${prefix}: missing or invalid 'pattern'`);
  }

  if (typeof obs.confidence !== 'number' || Number.isNaN(obs.confidence) || obs.confidence < 0 || obs.confidence > 1) {
    errors.push(`${prefix}: 'confidence' must be a number between 0 and 1, got ${obs.confidence}`);
  }

  if (!VALID_ADHERENCE.has(obs.adherence_quality)) {
    errors.push(`${prefix}: 'adherence_quality' must be one of [${[...VALID_ADHERENCE].join(', ')}], got "${obs.adherence_quality}"`);
  }

  if (!Array.isArray(obs.evidence) || obs.evidence.length === 0) {
    errors.push(`${prefix}: 'evidence' must be a non-empty array`);
  } else {
    for (let i = 0; i < obs.evidence.length; i++) {
      const ev = obs.evidence[i];
      const evPrefix = `${prefix}.evidence[${i}]`;
      if (!ev.file || typeof ev.file !== 'string') {
        errors.push(`${evPrefix}: missing or invalid 'file'`);
      }
      if (!Array.isArray(ev.line_range) || ev.line_range.length !== 2 ||
          typeof ev.line_range[0] !== 'number' || typeof ev.line_range[1] !== 'number') {
        errors.push(`${evPrefix}: 'line_range' must be a two-element number array`);
      }
      if (!ev.snippet || typeof ev.snippet !== 'string') {
        errors.push(`${evPrefix}: missing or invalid 'snippet'`);
      }
    }
  }

  const verification = obs.verification ?? {};
  for (const field of VERIFICATION_FIELDS) {
    if (!(field in verification)) {
      errors.push(`${prefix}.verification.${field}: missing required field`);
    }
  }

  return errors;
}

export function parseRccl(yamlText, options = {}) {
  const allowVerifiedFields = options.allowVerifiedFields === true;

  let cleaned = yamlText.trim();
  if (cleaned.startsWith('```')) {
    // LLM output may still be wrapped in markdown fences.
    cleaned = cleaned.replace(/^```(?:yaml|yml)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let doc;
  try {
    doc = parseYaml(cleaned);
  } catch (err) {
    return { valid: false, errors: [`YAML parse error: ${err.message}`] };
  }

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Document must be a YAML object'] };
  }

  const errors = [];

  if (doc.version !== '1.0' && doc.version !== 1) {
    errors.push(`'version' must be "1.0", got "${doc.version}"`);
  }

  if (!Array.isArray(doc.observations) || doc.observations.length === 0) {
    errors.push("'observations' must be a non-empty array");
    return { valid: false, errors };
  }

  const ids = new Set();
  for (const obs of doc.observations) {
    if (obs.id && ids.has(obs.id)) {
      errors.push(`Duplicate observation id: "${obs.id}"`);
    }
    ids.add(obs.id);
  }

  for (let i = 0; i < doc.observations.length; i++) {
    errors.push(...validateObservation(doc.observations[i], i));
  }

  if (!allowVerifiedFields) {
    // Fresh LLM output must leave verification empty so the runtime is the source of truth.
    for (let i = 0; i < doc.observations.length; i++) {
      const verification = doc.observations[i].verification ?? {};
      for (const field of VERIFICATION_FIELDS) {
        if (verification[field] !== null && verification[field] !== undefined) {
          errors.push(`observations[${i}].verification.${field}: must be null (runtime fills this), got "${verification[field]}"`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  doc.version = '1.0';
  doc.generated_at = doc.generated_at ?? null;
  doc.git_ref = doc.git_ref ?? null;

  for (const obs of doc.observations) {
    // Normalize shape so downstream code can treat verification as always-present.
    obs.verification = {
      status: obs.verification?.status ?? null,
      verified_count: obs.verification?.verified_count ?? null,
      verified_confidence: obs.verification?.verified_confidence ?? null,
      checked_at: obs.verification?.checked_at ?? null,
      disposition: obs.verification?.disposition ?? null,
    };
  }

  return { valid: true, data: doc };
}
