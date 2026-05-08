import { parseYaml } from "../utils/yaml.mjs";
//#region src/io/parse-rccl-workflow.ts
const RCCL_VERSION = "1.0";
const ID_PATTERN = /^obs-[a-z0-9-]+$/;
function isRcclVersion(value) {
	return value === RCCL_VERSION || value === 1;
}
const VALID_CATEGORIES = new Set([
	"style",
	"architecture",
	"pattern",
	"constraint",
	"legacy",
	"anti-pattern",
	"migration"
]);
const VALID_CRITIQUE_DISPOSITIONS = new Set([
	"keep",
	"revise",
	"drop"
]);
function parseRcclDiscoveryArtifact(yamlText) {
	const parsed = parseRawWorkflowDocument(yamlText);
	if (!parsed.valid || !parsed.doc) return {
		valid: false,
		errors: parsed.errors
	};
	const errors = validateDiscoveryDocument(parsed.doc);
	if (errors.length > 0) return {
		valid: false,
		errors
	};
	return {
		valid: true,
		data: normalizeDiscoveryDocument(parsed.doc)
	};
}
function parseRcclCritiqueArtifact(yamlText) {
	const parsed = parseRawWorkflowDocument(yamlText);
	if (!parsed.valid || !parsed.doc) return {
		valid: false,
		errors: parsed.errors
	};
	const errors = validateCritiqueDocument(parsed.doc);
	if (errors.length > 0) return {
		valid: false,
		errors
	};
	return {
		valid: true,
		data: normalizeCritiqueDocument(parsed.doc)
	};
}
function parseRawWorkflowDocument(yamlText) {
	let cleaned = yamlText.trim();
	if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:yaml|yml)?\s*\n?/, "").replace(/\n?```\s*$/, "");
	let doc;
	try {
		doc = parseYaml(cleaned);
	} catch (err) {
		return {
			valid: false,
			errors: [`YAML parse error: ${err instanceof Error ? err.message : String(err)}`]
		};
	}
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) return {
		valid: false,
		errors: ["Document must be a YAML object"]
	};
	return {
		valid: true,
		doc
	};
}
function validateEnvelope(doc, stage, collectionField) {
	const errors = [];
	if (!isRcclVersion(doc.version)) errors.push(`'version' must be "${RCCL_VERSION}", got "${doc.version}"`);
	if (doc.stage !== stage) errors.push(`'stage' must be "${stage}", got "${doc.stage}"`);
	if (doc.generated_at !== null && typeof doc.generated_at !== "string") errors.push("'generated_at' must be null or a string");
	if (!doc.scope || typeof doc.scope !== "string") errors.push("missing or invalid 'scope'");
	if (!Array.isArray(doc[collectionField]) || doc[collectionField].length === 0) errors.push(`'${collectionField}' must be a non-empty array`);
	return errors;
}
function validateDiscoveryDocument(doc) {
	const errors = validateEnvelope(doc, "discover", "seeds");
	if (errors.length > 0) return errors;
	const ids = /* @__PURE__ */ new Set();
	for (let i = 0; i < doc.seeds.length; i += 1) {
		const seed = doc.seeds[i];
		const prefix = `seeds[${i}]`;
		const seedId = String(seed.seed_id ?? "");
		if (!seedId || typeof seed.seed_id !== "string") errors.push(`${prefix}: missing or invalid 'seed_id'`);
		else if (!ID_PATTERN.test(seedId)) errors.push(`${prefix}: 'seed_id' "${seedId}" does not match /^obs-[a-z0-9-]+$/`);
		else if (ids.has(seedId)) errors.push(`Duplicate discovery seed id: "${seedId}"`);
		ids.add(seedId);
		if (!seed.semantic_key || typeof seed.semantic_key !== "string") errors.push(`${prefix}: missing or invalid 'semantic_key'`);
		if (!VALID_CATEGORIES.has(String(seed.category))) errors.push(`${prefix}: 'category' is invalid`);
		if (!seed.scope_hint || typeof seed.scope_hint !== "string") errors.push(`${prefix}: missing or invalid 'scope_hint'`);
		if (!seed.pattern || typeof seed.pattern !== "string") errors.push(`${prefix}: missing or invalid 'pattern'`);
		if (!seed.decision_impact || typeof seed.decision_impact !== "string") errors.push(`${prefix}: missing or invalid 'decision_impact'`);
		if (!Array.isArray(seed.source_slice_ids) || seed.source_slice_ids.length === 0) errors.push(`${prefix}: missing or invalid 'source_slice_ids'`);
		errors.push(...validateEvidenceList(seed.evidence, `${prefix}.evidence`));
		if (seed.uncertainty != null && typeof seed.uncertainty !== "string") errors.push(`${prefix}.uncertainty: must be null or a string`);
	}
	return errors;
}
function validateCritiqueDocument(doc) {
	const errors = validateEnvelope(doc, "critique", "reviews");
	if (errors.length > 0) return errors;
	const ids = /* @__PURE__ */ new Set();
	for (let i = 0; i < doc.reviews.length; i += 1) {
		const review = doc.reviews[i];
		const prefix = `reviews[${i}]`;
		const seedId = String(review.seed_id ?? "");
		if (!seedId || typeof review.seed_id !== "string") errors.push(`${prefix}: missing or invalid 'seed_id'`);
		else if (!ID_PATTERN.test(seedId)) errors.push(`${prefix}: 'seed_id' "${seedId}" does not match /^obs-[a-z0-9-]+$/`);
		else if (ids.has(seedId)) errors.push(`Duplicate critique seed id: "${seedId}"`);
		ids.add(seedId);
		if (!VALID_CRITIQUE_DISPOSITIONS.has(review.disposition)) errors.push(`${prefix}: 'disposition' is invalid`);
		if (!Array.isArray(review.reasons) || review.reasons.length === 0) errors.push(`${prefix}: missing or invalid 'reasons'`);
		if (review.issues != null && !Array.isArray(review.issues)) errors.push(`${prefix}.issues: must be an array when present`);
		if (review.counter_evidence != null) errors.push(...validateEvidenceList(review.counter_evidence, `${prefix}.counter_evidence`));
		if (review.recommended_scope_hint != null && typeof review.recommended_scope_hint !== "string") errors.push(`${prefix}.recommended_scope_hint: must be null or a string`);
	}
	return errors;
}
function validateEvidenceList(value, prefix) {
	const errors = [];
	if (!Array.isArray(value) || value.length === 0) return [`${prefix}: must be a non-empty array`];
	for (let i = 0; i < value.length; i += 1) {
		const evidence = value[i];
		if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
			errors.push(`${prefix}[${i}]: must be an object`);
			continue;
		}
		if (!evidence.file || typeof evidence.file !== "string") errors.push(`${prefix}[${i}]: missing or invalid 'file'`);
		if (!Array.isArray(evidence.line_range) || evidence.line_range.length !== 2) errors.push(`${prefix}[${i}]: invalid 'line_range'`);
		if (!evidence.snippet || typeof evidence.snippet !== "string") errors.push(`${prefix}[${i}]: missing or invalid 'snippet'`);
	}
	return errors;
}
function normalizeEvidenceList(value) {
	return value.map((evidence) => ({
		file: String(evidence.file),
		line_range: [Number(evidence.line_range[0]), Number(evidence.line_range[1])],
		snippet: String(evidence.snippet)
	}));
}
function normalizeDiscoveryDocument(doc) {
	return {
		version: RCCL_VERSION,
		stage: "discover",
		generated_at: doc.generated_at == null ? null : String(doc.generated_at),
		scope: String(doc.scope),
		seeds: doc.seeds.map((seed) => ({
			seed_id: String(seed.seed_id),
			semantic_key: String(seed.semantic_key),
			category: seed.category,
			scope_hint: String(seed.scope_hint),
			pattern: String(seed.pattern),
			decision_impact: String(seed.decision_impact),
			evidence: normalizeEvidenceList(seed.evidence),
			source_slice_ids: seed.source_slice_ids.map(String),
			uncertainty: seed.uncertainty == null ? null : String(seed.uncertainty)
		}))
	};
}
function normalizeCritiqueDocument(doc) {
	return {
		version: RCCL_VERSION,
		stage: "critique",
		generated_at: doc.generated_at == null ? null : String(doc.generated_at),
		scope: String(doc.scope),
		reviews: doc.reviews.map((review) => ({
			seed_id: String(review.seed_id),
			disposition: review.disposition,
			reasons: review.reasons.map(String),
			issues: review.issues == null ? void 0 : review.issues.map(String),
			counter_evidence: review.counter_evidence == null ? void 0 : normalizeEvidenceList(review.counter_evidence),
			recommended_scope_hint: review.recommended_scope_hint == null ? null : String(review.recommended_scope_hint)
		}))
	};
}
//#endregion
export { parseRcclCritiqueArtifact, parseRcclDiscoveryArtifact };
