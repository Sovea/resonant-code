import { parseYaml } from "../utils/yaml.mjs";
//#region src/io/parse-rccl.ts
const ID_PATTERN = /^obs-[a-z0-9-]+$/;
const VALID_CATEGORIES = new Set([
	"style",
	"architecture",
	"pattern",
	"constraint",
	"legacy",
	"anti-pattern",
	"migration"
]);
const VALID_ADHERENCE = new Set([
	"good",
	"inconsistent",
	"poor"
]);
const VALID_SCOPE_BASES = new Set([
	"single-file",
	"directory-cluster",
	"module-cluster",
	"cross-root"
]);
const REQUIRED_VERIFICATION_FIELDS = [
	"evidence_status",
	"evidence_verified_count",
	"evidence_confidence",
	"induction_status",
	"induction_confidence",
	"checked_at",
	"disposition"
];
function parseRccl(yamlText, options = {}) {
	options.allowVerifiedFields;
	const parsed = parseRcclCandidates(yamlText, options);
	if (!parsed.valid || !parsed.data) return {
		valid: false,
		errors: parsed.errors
	};
	const observations = parsed.data.observations.map((candidate, index) => normalizeObservation({
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
			scope_basis: candidate.support_hint?.scope_basis
		},
		verification: emptyVerification()
	}));
	return {
		valid: true,
		data: {
			version: parsed.data.version,
			generated_at: parsed.data.generated_at,
			git_ref: parsed.data.git_ref,
			observations
		}
	};
}
function parseRcclCandidates(yamlText, options = {}) {
	const allowVerifiedFields = options.allowVerifiedFields === true;
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
	if (!doc || typeof doc !== "object") return {
		valid: false,
		errors: ["Document must be a YAML object"]
	};
	const errors = [];
	if (doc.version !== "1.0" && doc.version !== 1) errors.push(`'version' must be "1.0", got "${doc.version}"`);
	if (!Array.isArray(doc.observations) || doc.observations.length === 0) {
		errors.push("'observations' must be a non-empty array");
		return {
			valid: false,
			errors
		};
	}
	const ids = /* @__PURE__ */ new Set();
	for (let i = 0; i < doc.observations.length; i += 1) {
		const obs = doc.observations[i];
		const rawId = String(obs.id ?? obs.provisional_id ?? "");
		if (rawId) {
			if (ids.has(rawId)) errors.push(`Duplicate observation id: "${rawId}"`);
			ids.add(rawId);
		}
		errors.push(...validateObservation(obs, i, allowVerifiedFields));
	}
	if (errors.length > 0) return {
		valid: false,
		errors
	};
	return {
		valid: true,
		data: normalizeCandidateDocument(doc)
	};
}
function validateObservation(obs, index, allowVerifiedFields) {
	const errors = [];
	const prefix = `observations[${index}]`;
	const id = obs.id ?? obs.provisional_id;
	if (!id || typeof id !== "string") errors.push(`${prefix}: missing or invalid 'id'`);
	else if (!ID_PATTERN.test(String(id))) errors.push(`${prefix}: 'id' "${id}" does not match /^obs-[a-z0-9-]+$/`);
	if (!VALID_CATEGORIES.has(String(obs.category))) errors.push(`${prefix}: 'category' is invalid`);
	if (!obs.semantic_key || typeof obs.semantic_key !== "string") errors.push(`${prefix}: missing or invalid 'semantic_key'`);
	const scopeValue = obs.scope ?? obs.scope_hint;
	if (!scopeValue || typeof scopeValue !== "string") errors.push(`${prefix}: missing or invalid 'scope'`);
	if (!obs.pattern || typeof obs.pattern !== "string") errors.push(`${prefix}: missing or invalid 'pattern'`);
	if (typeof obs.confidence !== "number" || Number.isNaN(obs.confidence) || obs.confidence < 0 || obs.confidence > 1) errors.push(`${prefix}: 'confidence' must be a number between 0 and 1, got ${obs.confidence}`);
	if (!VALID_ADHERENCE.has(String(obs.adherence_quality))) errors.push(`${prefix}: 'adherence_quality' is invalid`);
	if (!Array.isArray(obs.evidence) || obs.evidence.length === 0) errors.push(`${prefix}: 'evidence' must be a non-empty array`);
	else for (let i = 0; i < obs.evidence.length; i += 1) {
		const evidence = obs.evidence[i];
		if (!evidence.file || typeof evidence.file !== "string") errors.push(`${prefix}.evidence[${i}]: missing or invalid 'file'`);
		if (!Array.isArray(evidence.line_range) || evidence.line_range.length !== 2) errors.push(`${prefix}.evidence[${i}]: invalid 'line_range'`);
		if (!evidence.snippet || typeof evidence.snippet !== "string") errors.push(`${prefix}.evidence[${i}]: missing or invalid 'snippet'`);
	}
	const support = obs.support ?? {};
	const sourceSlices = obs.source_slice_ids ?? support.source_slices;
	if (sourceSlices != null && !Array.isArray(sourceSlices)) errors.push(`${prefix}.source_slice_ids: must be an array`);
	if (obs.support != null) {
		if (support.file_count != null && typeof support.file_count !== "number") errors.push(`${prefix}.support.file_count: must be a number`);
		if (support.cluster_count != null && typeof support.cluster_count !== "number") errors.push(`${prefix}.support.cluster_count: must be a number`);
		if (support.scope_basis != null && !VALID_SCOPE_BASES.has(String(support.scope_basis))) errors.push(`${prefix}.support.scope_basis: invalid value`);
	}
	const verification = obs.verification ?? {};
	if (Object.keys(verification).length > 0) {
		for (const field of REQUIRED_VERIFICATION_FIELDS) if (!(field in verification)) errors.push(`${prefix}.verification.${field}: missing required field`);
		if (!allowVerifiedFields) {
			for (const field of REQUIRED_VERIFICATION_FIELDS) if (verification[field] !== null && verification[field] !== void 0) errors.push(`${prefix}.verification.${field}: must be null (runtime fills this), got "${verification[field]}"`);
		}
	}
	return errors;
}
function normalizeCandidateDocument(input) {
	return {
		version: "1.0",
		generated_at: typeof input.generated_at === "string" ? input.generated_at : null,
		git_ref: typeof input.git_ref === "string" ? input.git_ref : null,
		observations: Array.isArray(input.observations) ? input.observations.map(normalizeCandidateObservation) : []
	};
}
function normalizeCandidateObservation(input) {
	const item = input;
	const support = item.support;
	const sourceSlices = Array.isArray(item.source_slice_ids) ? item.source_slice_ids : Array.isArray(support?.source_slices) ? support?.source_slices : [];
	return {
		provisional_id: String(item.provisional_id ?? item.id),
		semantic_key: normalizeSemanticKey(String(item.semantic_key ?? item.id ?? "")),
		category: item.category,
		scope_hint: normalizeScope(String(item.scope_hint ?? item.scope ?? "**")),
		pattern: String(item.pattern),
		confidence: Number(item.confidence ?? 0),
		adherence_quality: item.adherence_quality,
		evidence: Array.isArray(item.evidence) ? item.evidence.map(normalizeEvidence) : [],
		source_slice_ids: Array.from(new Set(sourceSlices.map(String))).sort(),
		support_hint: support == null ? null : {
			scope_basis: support.scope_basis == null ? null : normalizeScopeBasis(String(support.scope_basis)),
			file_count: support.file_count == null ? null : Number(support.file_count),
			cluster_count: support.cluster_count == null ? null : Number(support.cluster_count)
		}
	};
}
function normalizeDocument(input) {
	return {
		version: "1.0",
		generated_at: typeof input.generated_at === "string" ? input.generated_at : null,
		git_ref: typeof input.git_ref === "string" ? input.git_ref : null,
		observations: Array.isArray(input.observations) ? input.observations.map(normalizeObservation) : []
	};
}
function normalizeObservation(input) {
	const item = input;
	const verification = normalizeVerification(item.verification);
	const support = normalizeSupport(item.support, item.evidence, normalizeScope(String(item.scope ?? "**")));
	return {
		id: String(item.id),
		semantic_key: normalizeSemanticKey(String(item.semantic_key ?? item.id ?? "")),
		category: item.category,
		scope: normalizeScope(String(item.scope ?? "**")),
		pattern: String(item.pattern),
		confidence: Number(item.confidence ?? 0),
		adherence_quality: item.adherence_quality,
		evidence: Array.isArray(item.evidence) ? item.evidence.map(normalizeEvidence) : [],
		support,
		verification
	};
}
function normalizeEvidence(input) {
	const value = input;
	const lineRange = value.line_range ?? [1, 1];
	return {
		file: normalizePath(String(value.file)),
		line_range: [Number(lineRange[0]), Number(lineRange[1])],
		snippet: String(value.snippet ?? "")
	};
}
function normalizeSupport(input, evidence, scope) {
	const evidenceFiles = Array.from(new Set((evidence ?? []).map((item) => normalizePath(String(item.file ?? ""))).filter(Boolean)));
	const fileCount = input?.file_count == null ? Math.max(1, evidenceFiles.length) : Number(input.file_count);
	return {
		source_slices: Array.isArray(input?.source_slices) ? Array.from(new Set(input?.source_slices.map(String))).sort() : [],
		file_count: fileCount,
		cluster_count: input?.cluster_count == null ? inferClusterCount(scope, evidenceFiles) : Number(input.cluster_count),
		scope_basis: normalizeScopeBasis(String(input?.scope_basis ?? inferScopeBasis(scope, fileCount, evidenceFiles)))
	};
}
function normalizeVerification(input) {
	const verification = input ?? {};
	return {
		evidence_status: verification.evidence_status ?? null,
		evidence_verified_count: verification.evidence_verified_count == null ? null : Number(verification.evidence_verified_count),
		evidence_confidence: verification.evidence_confidence == null ? null : Number(verification.evidence_confidence),
		induction_status: verification.induction_status ?? null,
		induction_confidence: verification.induction_confidence == null ? null : Number(verification.induction_confidence),
		checked_at: typeof verification.checked_at === "string" ? verification.checked_at : null,
		disposition: verification.disposition ?? null
	};
}
function inferClusterCount(scope, evidenceFiles) {
	if (scope === "**") return Math.max(2, new Set(evidenceFiles.map(rootFromPath)).size);
	if (scope.includes("/**")) return 1;
	if (evidenceFiles.length <= 1) return 1;
	return new Set(evidenceFiles.map(directoryFromPath)).size;
}
function inferScopeBasis(scope, fileCount, evidenceFiles) {
	const roots = new Set(evidenceFiles.map(rootFromPath).filter(Boolean));
	if (scope === "**" || roots.size > 1) return "cross-root";
	if (fileCount <= 1 && !scope.includes("*")) return "single-file";
	if (scope.includes("/**")) return "directory-cluster";
	return "module-cluster";
}
function normalizeScopeBasis(value) {
	if (value === "single-file" || value === "directory-cluster" || value === "module-cluster" || value === "cross-root") return value;
	return "module-cluster";
}
function normalizeObservationId(id, semanticKey, category, index) {
	if (ID_PATTERN.test(id)) return id;
	return `obs-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pattern"}-${normalizeSemanticKey(semanticKey).slice(0, 48) || `candidate-${index + 1}`}`;
}
function normalizeScope(scope) {
	const trimmed = scope.trim();
	return trimmed.length > 0 ? trimmed : "**";
}
function normalizePath(filePath) {
	return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}
function normalizeSemanticKey(value) {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}
function rootFromPath(filePath) {
	const normalized = normalizePath(filePath);
	const [root] = normalized.split("/");
	return root || normalized;
}
function directoryFromPath(filePath) {
	const normalized = normalizePath(filePath);
	const segments = normalized.split("/").filter(Boolean);
	if (segments.length <= 1) return normalized;
	return segments.slice(0, -1).join("/");
}
function emptyVerification() {
	return {
		evidence_status: null,
		evidence_verified_count: null,
		evidence_confidence: null,
		induction_status: null,
		induction_confidence: null,
		checked_at: null,
		disposition: null
	};
}
//#endregion
export { normalizeDocument, normalizeObservation, parseRccl, parseRcclCandidates };
