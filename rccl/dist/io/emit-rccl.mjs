import { toYaml } from "../utils/yaml.mjs";
import { parseRccl } from "./parse-rccl.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
//#region src/io/emit-rccl.ts
function emitRccl(rccl, projectRoot) {
	const outputDir = join(projectRoot, ".resonant-code");
	const outputPath = join(outputDir, "rccl.yaml");
	if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
	const existing = loadExistingRccl(outputPath);
	const existingIds = new Set(existing?.observations.map((observation) => observation.id) ?? []);
	const added = rccl.observations.filter((observation) => !existingIds.has(observation.id)).length;
	const updated = rccl.observations.filter((observation) => existingIds.has(observation.id)).length;
	const preserved = 0;
	const finalDoc = {
		version: "1.0",
		generated_at: (/* @__PURE__ */ new Date()).toISOString(),
		git_ref: getGitRef(projectRoot),
		observations: rccl.observations.slice().sort((a, b) => a.id.localeCompare(b.id))
	};
	const verificationSummary = summarizeVerification(finalDoc);
	writeFileSync(outputPath, serializeRccl(finalDoc), "utf-8");
	return {
		written: ".resonant-code/rccl.yaml",
		stats: {
			added,
			updated,
			preserved
		},
		verification_summary: verificationSummary
	};
}
function summarizeVerification(rccl) {
	const observations = rccl.observations.map((item) => ({
		id: item.id,
		disposition: item.verification.disposition,
		evidence_status: item.verification.evidence_status,
		induction_status: item.verification.induction_status,
		evidence_verified_count: item.verification.evidence_verified_count,
		evidence_total_count: item.evidence.length,
		support: item.support
	}));
	const evidenceStatusCounts = {
		pending: 0,
		verified: 0,
		partial: 0,
		failed: 0,
		unverifiable: 0
	};
	const inductionStatusCounts = {
		pending: 0,
		"well-supported": 0,
		"narrowly-supported": 0,
		overgeneralized: 0,
		ambiguous: 0
	};
	for (const item of observations) {
		evidenceStatusCounts[item.evidence_status ?? "pending"] += 1;
		inductionStatusCounts[item.induction_status ?? "pending"] += 1;
	}
	return {
		total_observations: observations.length,
		kept_count: observations.filter((item) => item.disposition === "keep").length,
		reduced_confidence_count: observations.filter((item) => item.disposition === "keep-with-reduced-confidence").length,
		demoted_count: observations.filter((item) => item.disposition === "demote-to-ambient").length,
		evidence_status_counts: evidenceStatusCounts,
		induction_status_counts: inductionStatusCounts,
		observations
	};
}
function writeCandidateArtifact(projectRoot, candidates) {
	return writeContextArtifact(projectRoot, "rccl-candidates", "json", JSON.stringify(candidates, null, 2), {
		kind: "candidates",
		observations: candidates.observations.length,
		ids: candidates.observations.map((item) => item.provisional_id)
	});
}
function writeConsolidationArtifact(projectRoot, consolidation, finalDocument) {
	const verificationSummary = summarizeVerification(finalDocument);
	const demotions = verificationSummary.observations.filter((item) => item.disposition === "demote-to-ambient" || item.disposition === "keep-with-reduced-confidence").map((item) => ({
		...item,
		failure_reason: describeVerificationFailure(item)
	}));
	return writeContextArtifact(projectRoot, "rccl-consolidation", "json", JSON.stringify({
		...consolidation.report,
		verification_summary: verificationSummary,
		verification_demotion_summary: {
			demotion_count: demotions.filter((item) => item.disposition === "demote-to-ambient").length,
			reduced_confidence_count: demotions.filter((item) => item.disposition === "keep-with-reduced-confidence").length,
			observations: demotions
		},
		final_observations: finalDocument.observations.map((item) => ({
			id: item.id,
			scope: item.scope,
			pattern: item.pattern,
			support: item.support,
			verification: item.verification
		}))
	}, null, 2), {
		kind: "consolidation",
		groups: consolidation.report.merged_group_count,
		finals: finalDocument.observations.length,
		ids: finalDocument.observations.map((item) => item.id)
	});
}
function describeVerificationFailure(item) {
	if (item.disposition === "demote-to-ambient") {
		if (item.evidence_status === "failed") return "all evidence snippets failed static verification against current source";
		if (item.evidence_status === "unverifiable") return "evidence could not be verified statically";
		if (item.induction_status === "overgeneralized") return `scope basis ${item.support.scope_basis} is broader than the verified evidence supports`;
		return "verification demoted this observation to ambient";
	}
	if (item.disposition === "keep-with-reduced-confidence") {
		if (item.evidence_status === "partial") return `only ${item.evidence_verified_count ?? 0}/${item.evidence_total_count} evidence snippets verified statically`;
		if (item.induction_status === "narrowly-supported") return `support basis ${item.support.scope_basis} is valid but only narrowly supported by verified evidence`;
		return "verification reduced confidence for this observation";
	}
	return "verification kept this observation";
}
function serializeRccl(rccl) {
	return toYaml({
		version: rccl.version,
		generated_at: rccl.generated_at,
		git_ref: rccl.git_ref,
		observations: rccl.observations.map((observation) => ({
			id: observation.id,
			semantic_key: observation.semantic_key,
			category: observation.category,
			scope: observation.scope,
			pattern: observation.pattern,
			confidence: observation.confidence,
			adherence_quality: observation.adherence_quality,
			evidence: observation.evidence,
			support: observation.support,
			verification: {
				evidence_status: observation.verification.evidence_status,
				evidence_verified_count: observation.verification.evidence_verified_count,
				evidence_confidence: observation.verification.evidence_confidence,
				induction_status: observation.verification.induction_status,
				induction_confidence: observation.verification.induction_confidence,
				checked_at: observation.verification.checked_at,
				disposition: observation.verification.disposition
			}
		}))
	});
}
function loadExistingRccl(outputPath) {
	try {
		const parsed = parseRccl(readFileSync(outputPath, "utf-8"), { allowVerifiedFields: true });
		return parsed.valid ? parsed.data ?? null : null;
	} catch {
		return null;
	}
}
function getGitRef(projectRoot) {
	try {
		return execSync("git rev-parse --short HEAD", {
			cwd: projectRoot,
			encoding: "utf-8",
			timeout: 5e3,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
	} catch {
		return "unknown";
	}
}
function writeContextArtifact(projectRoot, folder, extension, content, seed) {
	const digest = createHash("sha1").update(JSON.stringify(seed)).digest("hex").slice(0, 10);
	const path = join(projectRoot, ".resonant-code", "context", folder, `${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${digest}.${extension}`);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf-8");
	return path;
}
//#endregion
export { emitRccl, serializeRccl, summarizeVerification, writeCandidateArtifact, writeConsolidationArtifact };
