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
	const allowVerifiedFields = options.allowVerifiedFields === true;
	const parsed = parseRawRcclDocument(yamlText);
	if (!parsed.valid || !parsed.doc) return {
		valid: false,
		errors: parsed.errors
	};
	const errors = validateRcclDocument(parsed.doc, allowVerifiedFields);
	if (errors.length > 0) return {
		valid: false,
		errors
	};
	return {
		valid: true,
		data: normalizeDocument(parsed.doc)
	};
}
function parseRcclCandidates(yamlText, options = {}) {
	const allowVerifiedFields = options.allowVerifiedFields === true;
	const parsed = parseRawRcclDocument(yamlText);
	if (!parsed.valid || !parsed.doc) return {
		valid: false,
		errors: parsed.errors
	};
	const errors = validateRcclDocument(parsed.doc, allowVerifiedFields);
	if (errors.length > 0) return {
		valid: false,
		errors
	};
	return {
		valid: true,
		data: normalizeCandidateDocument(parsed.doc)
	};
}
function parseRawRcclDocument(yamlText) {
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
function validateRcclDocument(doc, allowVerifiedFields) {
	const errors = [];
	if (!isSupportedRcclVersion(doc.version)) errors.push(`'version' must be "1.0" or "2.0", got "${doc.version}"`);
	if (!Array.isArray(doc.observations) || doc.observations.length === 0) {
		errors.push("'observations' must be a non-empty array");
		return errors;
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
	return errors;
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
		else {
			const snippetErrors = validateEvidenceSnippet(evidence.snippet, prefix, i);
			errors.push(...snippetErrors);
		}
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
	errors.push(...validateLifecycle(obs.lifecycle, prefix));
	return errors;
}
function validateLifecycle(lifecycle, prefix) {
	if (lifecycle == null) return [];
	const errors = [];
	if (lifecycle.status != null && lifecycle.status !== "active" && lifecycle.status !== "stale" && lifecycle.status !== "superseded") errors.push(`${prefix}.lifecycle.status: invalid value`);
	if (lifecycle.content_fingerprint != null && typeof lifecycle.content_fingerprint !== "string") errors.push(`${prefix}.lifecycle.content_fingerprint: must be a string`);
	if (lifecycle.supersedes != null) {
		if (!Array.isArray(lifecycle.supersedes)) errors.push(`${prefix}.lifecycle.supersedes: must be an array`);
		else for (const id of lifecycle.supersedes) if (typeof id !== "string" || !ID_PATTERN.test(id)) errors.push(`${prefix}.lifecycle.supersedes: contains invalid observation id`);
	}
	if (lifecycle.superseded_by != null && (typeof lifecycle.superseded_by !== "string" || !ID_PATTERN.test(lifecycle.superseded_by))) errors.push(`${prefix}.lifecycle.superseded_by: must be a valid observation id`);
	return errors;
}
function validateEvidenceSnippet(snippet, prefix, index) {
	if (typeof snippet !== "string") return [];
	const normalized = snippet.replace(/\r\n/g, "\n").trim();
	if (!normalized) return [`${prefix}.evidence[${index}]: snippet must not be empty`];
	const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
	const tokenMatches = normalized.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|==|!=|<=|>=|=>|&&|\|\||[()[\]{}.,;:+\-*/%<>!=?]/g) ?? [];
	const identifierCount = tokenMatches.filter((token) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)).length;
	const punctuationCount = tokenMatches.length - identifierCount;
	const hasDistinctiveStructure = /[{}();=>]|\b(import|export|return|const|let|var|function|class|interface|type|if|for|while|switch|case|await|async)\b/.test(normalized);
	if (lines.length >= 2 || hasDistinctiveStructure) return [];
	if (tokenMatches.length < 4) return [`${prefix}.evidence[${index}]: snippet is too short to verify reliably; include at least a distinctive statement or 2+ lines of code`];
	if (identifierCount <= 2 && punctuationCount === 0) return [`${prefix}.evidence[${index}]: snippet looks like an identifier or label, not a verifiable code fragment`];
	return [];
}
function normalizeCandidateDocument(input) {
	return {
		version: normalizeRcclVersion(input.version),
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
		version: normalizeRcclVersion(input.version),
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
		verification,
		lifecycle: normalizeLifecycle(item.lifecycle)
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
	const clusterCount = input?.cluster_count == null ? inferFallbackClusterCount(scope, evidenceFiles) : Number(input.cluster_count);
	const scopeBasis = input?.scope_basis == null ? inferFallbackScopeBasis(scope, fileCount, evidenceFiles) : normalizeScopeBasis(String(input.scope_basis));
	return {
		source_slices: Array.isArray(input?.source_slices) ? Array.from(new Set(input?.source_slices.map(String))).sort() : [],
		file_count: fileCount,
		cluster_count: clusterCount,
		scope_basis: scopeBasis
	};
}
function inferFallbackClusterCount(scope, evidenceFiles) {
	return inferClusterCount(scope, evidenceFiles);
}
function inferFallbackScopeBasis(scope, fileCount, evidenceFiles) {
	return normalizeScopeBasis(inferScopeBasis(scope, fileCount, evidenceFiles));
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
function normalizeLifecycle(input) {
	if (!input) return void 0;
	const status = input.status === "stale" || input.status === "superseded" ? input.status : "active";
	return {
		first_seen_git_ref: typeof input.first_seen_git_ref === "string" ? input.first_seen_git_ref : null,
		last_seen_git_ref: typeof input.last_seen_git_ref === "string" ? input.last_seen_git_ref : null,
		last_verified_at: typeof input.last_verified_at === "string" ? input.last_verified_at : null,
		content_fingerprint: typeof input.content_fingerprint === "string" ? input.content_fingerprint : "",
		status,
		supersedes: Array.isArray(input.supersedes) ? input.supersedes.map(String).sort() : void 0,
		superseded_by: typeof input.superseded_by === "string" ? input.superseded_by : void 0,
		stale_since_git_ref: typeof input.stale_since_git_ref === "string" ? input.stale_since_git_ref : null,
		superseded_at_git_ref: typeof input.superseded_at_git_ref === "string" ? input.superseded_at_git_ref : null
	};
}
function isSupportedRcclVersion(value) {
	return value === "1.0" || value === 1 || value === "2.0" || value === 2;
}
function normalizeRcclVersion(value) {
	return value === "2.0" || value === 2 ? "2.0" : "1.0";
}
function normalizeScopeBasis(value) {
	if (value === "single-file" || value === "directory-cluster" || value === "module-cluster" || value === "cross-root") return value;
	return "module-cluster";
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
//#endregion
export { normalizeDocument, normalizeObservation, parseRccl, parseRcclCandidates };
