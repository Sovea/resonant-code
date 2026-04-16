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
	writeFileSync(outputPath, serializeRccl({
		version: "1.0",
		generated_at: (/* @__PURE__ */ new Date()).toISOString(),
		git_ref: getGitRef(projectRoot),
		observations: rccl.observations.slice().sort((a, b) => a.id.localeCompare(b.id))
	}), "utf-8");
	return {
		written: ".resonant-code/rccl.yaml",
		stats: {
			added,
			updated,
			preserved
		}
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
	const demotions = finalDocument.observations.filter((item) => item.verification.disposition === "demote-to-ambient" || item.verification.disposition === "keep-with-reduced-confidence").map((item) => ({
		id: item.id,
		disposition: item.verification.disposition,
		evidence_status: item.verification.evidence_status,
		induction_status: item.verification.induction_status
	}));
	return writeContextArtifact(projectRoot, "rccl-consolidation", "json", JSON.stringify({
		...consolidation.report,
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
			timeout: 5e3
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
export { emitRccl, serializeRccl, writeCandidateArtifact, writeConsolidationArtifact };
