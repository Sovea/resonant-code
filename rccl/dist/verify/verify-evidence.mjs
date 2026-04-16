import { DEFAULT_VERIFICATION_POLICY } from "../policies.mjs";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
//#region src/verify/verify-evidence.ts
function verifyEvidenceForDocument(rccl, projectRoot, now = /* @__PURE__ */ new Date(), policy = DEFAULT_VERIFICATION_POLICY) {
	return {
		...rccl,
		observations: rccl.observations.map((observation) => verifyObservationEvidence(observation, projectRoot, now.toISOString(), policy))
	};
}
function verifyObservationEvidence(observation, projectRoot, checkedAt, policy = DEFAULT_VERIFICATION_POLICY) {
	if (observation.evidence.length === 0) return applyEvidenceVerification(observation, "unverifiable", 0, 0, checkedAt, "demote-to-ambient");
	const results = observation.evidence.map((item) => verifyEvidence(item, projectRoot, policy));
	const verifiedCount = results.filter((result) => result.status === "match").length;
	const ratio = verifiedCount / results.length;
	if (verifiedCount === results.length) return applyEvidenceVerification(observation, "verified", verifiedCount, observation.confidence, checkedAt, "keep");
	if (verifiedCount > 0) {
		const confidence = Math.max(observation.confidence * ratio, .3);
		return applyEvidenceVerification(observation, "partial", verifiedCount, confidence, checkedAt, confidence < .7 ? "keep-with-reduced-confidence" : "keep");
	}
	return applyEvidenceVerification(observation, "failed", 0, 0, checkedAt, "demote-to-ambient");
}
function applyEvidenceVerification(observation, status, verifiedCount, evidenceConfidence, checkedAt, disposition) {
	return {
		...observation,
		verification: {
			...observation.verification,
			evidence_status: status,
			evidence_verified_count: verifiedCount,
			evidence_confidence: Number(evidenceConfidence.toFixed(2)),
			checked_at: checkedAt,
			disposition
		}
	};
}
function verifyEvidence(evidence, projectRoot, policy = DEFAULT_VERIFICATION_POLICY) {
	const fullPath = join(projectRoot, evidence.file);
	if (!existsSync(fullPath)) return { status: "file-not-found" };
	const lines = readFileSync(fullPath, "utf-8").replace(/\r\n/g, "\n").split("\n");
	const [start, end] = evidence.line_range;
	if (start < 1 || end < start || end > lines.length) return { status: "range-out-of-bounds" };
	return tokenOverlapSimilarity(lines.slice(start - 1, end).join("\n"), evidence.snippet) >= policy.snippet_similarity_threshold ? { status: "match" } : { status: "mismatch" };
}
function tokenOverlapSimilarity(a, b) {
	const aTokens = tokenize(a);
	const bTokens = tokenize(b);
	if (aTokens.length === 0 || bTokens.length === 0) return 0;
	const counts = /* @__PURE__ */ new Map();
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
function tokenize(text) {
	return text.replace(/\r\n/g, "\n").replace(/['"`]/g, "\"").replace(/\s+/g, " ").trim().match(/[A-Za-z_][A-Za-z0-9_]*|\d+|==|!=|<=|>=|=>|&&|\|\||[()[\]{}.,;:+\-*/%<>!=?]/g) ?? [];
}
//#endregion
export { verifyEvidence, verifyEvidenceForDocument, verifyObservationEvidence };
