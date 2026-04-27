import { parseYaml } from "../../utils/yaml.mjs";
import { existsSync, readFileSync } from "node:fs";
//#region src/ir/adapters/feedback.ts
function feedbackToIR(lockfilePath) {
	const parsed = loadLockfile(lockfilePath);
	const directiveSignals = Object.entries(parsed.directives ?? {}).map(([directiveId, entry]) => directiveSignalToIR(directiveId, entry));
	return {
		irVersion: "governance-ir/v1",
		source: {
			kind: "lockfile",
			id: "playbook.lock",
			path: lockfilePath
		},
		directiveSignals,
		globalSummary: {
			totalTasks: parsed.governance_summary?.total_tasks ?? 0,
			byTaskType: parsed.governance_summary?.by_task_type ?? {},
			noisyDirectiveIds: [],
			frequentlyIgnoredDirectiveIds: directiveSignals.filter((signal) => signal.ignored >= 2 && signal.followRate < .75).map((signal) => signal.directiveId),
			recurringTensionKeys: []
		}
	};
}
function loadLockfile(lockfilePath) {
	if (!lockfilePath || !existsSync(lockfilePath)) return {};
	const parsed = parseYaml(readFileSync(lockfilePath, "utf-8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	if ("directives" in parsed || "governance_summary" in parsed) return parsed;
	return { directives: Object.fromEntries(Object.entries(parsed).filter(([, entry]) => isDirectiveEntry(entry))) };
}
function isDirectiveEntry(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value) && "quality_signal" in value;
}
function directiveSignalToIR(directiveId, entry) {
	const overall = entry.quality_signal?.overall;
	return {
		directiveId,
		followed: overall?.followed ?? 0,
		ignored: overall?.ignored ?? 0,
		followRate: overall?.follow_rate ?? 0,
		trend: overall?.trend ?? "stable",
		signalConfidence: "implicit",
		lastSeen: entry.quality_signal?.last_seen ?? ""
	};
}
//#endregion
export { feedbackToIR };
