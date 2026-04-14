import { parseYaml } from "../utils/yaml.mjs";
import { existsSync, readFileSync } from "node:fs";
//#region src/load/load-rccl.ts
/**
* Loads RCCL from disk and normalizes verification fields.
*/
function loadRccl(filePath) {
	if (!filePath || !existsSync(filePath)) return null;
	const parsed = parseYaml(readFileSync(filePath, "utf-8"));
	const observations = Array.isArray(parsed.observations) ? parsed.observations.map(normalizeObservation) : [];
	return {
		version: String(parsed.version ?? "1.0"),
		generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
		git_ref: typeof parsed.git_ref === "string" ? parsed.git_ref : null,
		observations
	};
}
function normalizeObservation(input) {
	const item = input;
	const verification = item.verification ?? {};
	return {
		id: String(item.id),
		category: item.category,
		scope: String(item.scope),
		pattern: String(item.pattern),
		confidence: Number(item.confidence ?? 0),
		adherence_quality: item.adherence_quality,
		evidence: Array.isArray(item.evidence) ? item.evidence.map((evidence) => {
			const value = evidence;
			const lineRange = value.line_range ?? [1, 1];
			return {
				file: String(value.file),
				line_range: [Number(lineRange[0]), Number(lineRange[1])],
				snippet: String(value.snippet ?? "")
			};
		}) : [],
		verification: {
			status: verification.status ?? null,
			verified_count: verification.verified_count == null ? null : Number(verification.verified_count),
			verified_confidence: verification.verified_confidence == null ? null : Number(verification.verified_confidence),
			checked_at: typeof verification.checked_at === "string" ? verification.checked_at : null,
			disposition: verification.disposition ?? null
		}
	};
}
//#endregion
export { loadRccl };
