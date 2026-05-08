import { parseYaml } from "../../utils/yaml.mjs";
import { existsSync, readFileSync } from "node:fs";
//#region src/ir/adapters/feedback.ts
function feedbackToIR(lockfilePath) {
	const parsed = loadLockfile(lockfilePath);
	const directiveSignals = Object.entries(parsed.directives ?? {}).map(([directiveId, entry]) => directiveSignalToIR(directiveId, entry));
	const observationSignals = Object.entries(parsed.observations ?? {}).map(([observationId, entry]) => observationSignalToIR(observationId, entry));
	const tensionSignals = Object.entries(parsed.tensions ?? {}).map(([tensionKey, entry]) => tensionSignalToIR(tensionKey, entry));
	return {
		irVersion: "governance-ir/v1",
		source: {
			kind: "lockfile",
			id: "playbook.lock",
			path: lockfilePath
		},
		directiveSignals,
		observationSignals,
		tensionSignals,
		globalSummary: {
			totalTasks: parsed.governance_summary?.total_tasks ?? 0,
			byTaskType: parsed.governance_summary?.by_task_type ?? {},
			noisyDirectiveIds: [],
			frequentlyIgnoredDirectiveIds: directiveSignals.filter((signal) => signal.ignored >= 2 && signal.followRate < .75).map((signal) => signal.directiveId),
			recurringTensionKeys: tensionSignals.filter((signal) => signal.seenCount >= 2).map((signal) => signal.tensionKey)
		}
	};
}
function loadLockfile(lockfilePath) {
	if (!lockfilePath || !existsSync(lockfilePath)) return {};
	const parsed = parseYaml(readFileSync(lockfilePath, "utf-8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	if ("directives" in parsed || "governance_summary" in parsed) return parsed;
	const directives = {};
	for (const [id, entry] of Object.entries(parsed)) if (isDirectiveEntry(entry)) directives[id] = entry;
	return { directives };
}
function isDirectiveEntry(value) {
	return value != null && typeof value === "object" && !Array.isArray(value) && "quality_signal" in value;
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
function observationSignalToIR(observationId, entry) {
	return {
		observationId,
		seenCount: entry.seen_count ?? 0,
		relationCount: entry.relation_count ?? 0,
		activeSeenCount: entry.active_seen_count ?? 0,
		staleSeenCount: entry.stale_seen_count ?? 0,
		supersededSeenCount: entry.superseded_seen_count ?? 0,
		lastDisposition: entry.last_disposition ?? "pending",
		lastLifecycleStatus: entry.last_lifecycle_status ?? "unknown",
		lastContentFingerprint: entry.last_content_fingerprint ?? null,
		lastSeen: entry.last_seen ?? ""
	};
}
function tensionSignalToIR(tensionKey, entry) {
	return {
		tensionKey,
		seenCount: entry.seen_count ?? 0,
		directiveId: entry.directive_id ?? "",
		observationId: entry.observation_id ?? "",
		lastExecutionMode: entry.last_execution_mode ?? "ambient",
		lastSeen: entry.last_seen ?? ""
	};
}
//#endregion
export { feedbackToIR };
