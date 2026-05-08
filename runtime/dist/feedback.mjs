import { parseYaml, toYaml } from "./utils/yaml.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
//#region src/feedback.ts
/**
* Updates the runtime lockfile with per-directive quality signals.
*/
function evaluateGuidance(input) {
	const existing = loadLockfile(input.lockfilePath);
	const trackedDirectiveIds = getTrackedDirectiveIds(input);
	const followed = new Set(input.followedDirectiveIds ?? trackedDirectiveIds);
	const ignored = new Set(input.ignoredDirectiveIds ?? []);
	const taskType = input.ego.taskIntent.operation;
	const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const modeCounts = summarizeExecutionModes(input);
	const tensionCount = input.packet?.governance.semantic_merge.context_tensions.length ?? input.ego.guidance.context_tensions.length;
	const observedRccl = getObservedRccl(input);
	existing.governance_summary.total_tasks += 1;
	existing.governance_summary.by_task_type[taskType] = (existing.governance_summary.by_task_type[taskType] ?? 0) + 1;
	existing.governance_summary.last_execution_modes = modeCounts;
	existing.governance_summary.last_tension_count = tensionCount;
	existing.governance_summary.last_observation_count = observedRccl.size;
	existing.governance_summary.last_updated_at = now;
	updateObservationFeedback(existing, observedRccl, input, now);
	updateTensionFeedback(existing, input, now);
	for (const directiveId of trackedDirectiveIds) {
		const entry = existing.directives[directiveId] ?? createEntry();
		const counts = entry.quality_signal.by_task_type[taskType] ?? {
			followed: 0,
			ignored: 0
		};
		if (ignored.has(directiveId)) {
			entry.quality_signal.overall.ignored += 1;
			counts.ignored += 1;
		} else if (followed.has(directiveId)) {
			entry.quality_signal.overall.followed += 1;
			counts.followed += 1;
		}
		entry.quality_signal.by_task_type[taskType] = counts;
		entry.quality_signal.overall.follow_rate = computeFollowRate(entry);
		entry.quality_signal.overall.trend = computeTrend(entry);
		entry.quality_signal.last_seen = today;
		entry.governance = { outcomes: {
			total_tasks: (entry.governance?.outcomes.total_tasks ?? 0) + 1,
			with_tensions: (entry.governance?.outcomes.with_tensions ?? 0) + (tensionCount > 0 ? 1 : 0),
			last_execution_modes: modeCounts,
			last_tension_count: tensionCount,
			last_updated_at: now
		} };
		existing.directives[directiveId] = entry;
	}
	writeFileSync(input.lockfilePath, toYaml(existing), "utf-8");
	return existing;
}
function loadLockfile(filePath) {
	if (!existsSync(filePath)) return createDocument();
	const parsed = parseYaml(readFileSync(filePath, "utf-8"));
	if (isLockfileDocument(parsed)) return {
		version: 2,
		directives: parsed.directives,
		observations: normalizeObservationEntries(parsed.observations ?? {}),
		tensions: parsed.tensions ?? {},
		governance_summary: {
			...parsed.governance_summary,
			last_observation_count: parsed.governance_summary.last_observation_count ?? 0
		}
	};
	if (isDirectiveRecord(parsed)) return {
		version: 2,
		directives: parsed,
		observations: {},
		tensions: {},
		governance_summary: {
			total_tasks: 0,
			by_task_type: {},
			last_execution_modes: emptyModeCounts(),
			last_tension_count: 0,
			last_observation_count: 0,
			last_updated_at: ""
		}
	};
	return createDocument();
}
function isLockfileDocument(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return "directives" in value && "governance_summary" in value;
}
function isDirectiveRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeObservationEntries(entries) {
	return Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, {
		...createObservationEntry(),
		...entry,
		last_content_fingerprint: entry.last_content_fingerprint ?? null
	}]));
}
function updateObservationFeedback(existing, observations, input, now) {
	const observationStates = new Map((input.packet?.governance.semantic_merge.observation_states ?? []).map((state) => [state.observation_id, state]));
	for (const [observationId, relationCount] of observations) {
		const entry = existing.observations[observationId] ?? createObservationEntry();
		const state = observationStates.get(observationId);
		entry.seen_count += 1;
		entry.relation_count += relationCount;
		if (state?.lifecycle_status === "active") entry.active_seen_count += 1;
		if (state?.lifecycle_status === "stale") entry.stale_seen_count += 1;
		if (state?.lifecycle_status === "superseded") entry.superseded_seen_count += 1;
		entry.last_disposition = state?.disposition ?? "pending";
		entry.last_lifecycle_status = state?.lifecycle_status ?? "unknown";
		entry.last_content_fingerprint = state?.content_fingerprint ?? null;
		entry.last_seen = now;
		existing.observations[observationId] = entry;
	}
}
function updateTensionFeedback(existing, input, now) {
	const tensions = input.packet?.governance.semantic_merge.context_tensions ?? [];
	for (const tension of tensions) {
		if (!tension.observation_id) continue;
		const key = `${tension.directive_id}::${tension.observation_id}`;
		const entry = existing.tensions[key] ?? createTensionEntry(tension.directive_id, tension.observation_id, tension.execution_mode);
		entry.seen_count += 1;
		entry.last_execution_mode = tension.execution_mode;
		entry.last_seen = now;
		existing.tensions[key] = entry;
	}
}
function getObservedRccl(input) {
	const counts = /* @__PURE__ */ new Map();
	const relations = input.packet?.governance.semantic_merge.relations ?? [];
	for (const relation of relations) {
		if (!relation.observation_id) continue;
		counts.set(relation.observation_id, (counts.get(relation.observation_id) ?? 0) + 1);
	}
	for (const link of input.packet?.governance.semantic_merge.observation_links ?? []) if (!counts.has(link.observation_id)) counts.set(link.observation_id, link.directive_ids.length);
	return counts;
}
function createObservationEntry() {
	return {
		seen_count: 0,
		relation_count: 0,
		active_seen_count: 0,
		stale_seen_count: 0,
		superseded_seen_count: 0,
		last_disposition: "pending",
		last_lifecycle_status: "unknown",
		last_content_fingerprint: null,
		last_seen: ""
	};
}
function createTensionEntry(directiveId, observationId, executionMode) {
	return {
		seen_count: 0,
		directive_id: directiveId,
		observation_id: observationId,
		last_execution_mode: executionMode,
		last_seen: ""
	};
}
function createDocument() {
	return {
		version: 2,
		directives: {},
		observations: {},
		tensions: {},
		governance_summary: {
			total_tasks: 0,
			by_task_type: {},
			last_execution_modes: emptyModeCounts(),
			last_tension_count: 0,
			last_observation_count: 0,
			last_updated_at: ""
		}
	};
}
function createEntry() {
	return {
		quality_signal: {
			overall: {
				followed: 0,
				ignored: 0,
				follow_rate: 0,
				trend: "stable"
			},
			by_task_type: {},
			last_seen: ""
		},
		governance: { outcomes: {
			total_tasks: 0,
			with_tensions: 0,
			last_execution_modes: emptyModeCounts(),
			last_tension_count: 0,
			last_updated_at: ""
		} }
	};
}
function emptyModeCounts() {
	return {
		enforce: 0,
		"deviation-noted": 0,
		ambient: 0,
		suppress: 0
	};
}
function getTrackedDirectiveIds(input) {
	if (input.packet) return input.packet.governance.semantic_merge.directive_modes.filter((directive) => directive.execution_mode !== "suppress").map((directive) => directive.directive_id);
	return input.ego.guidance.must_follow.map((directive) => directive.id);
}
function summarizeExecutionModes(input) {
	const counts = emptyModeCounts();
	const directives = input.packet?.governance.semantic_merge.directive_modes ?? input.ego.guidance.must_follow.map((directive) => ({
		directive_id: directive.id,
		observation_ids: [],
		execution_mode: directive.execution_mode,
		reason: "derived from effective guidance fallback",
		decision_basis: "default"
	}));
	for (const directive of directives) counts[directive.execution_mode] += 1;
	return counts;
}
function computeFollowRate(entry) {
	const total = entry.quality_signal.overall.followed + entry.quality_signal.overall.ignored;
	return total === 0 ? 0 : Number((entry.quality_signal.overall.followed / total).toFixed(2));
}
function computeTrend(entry) {
	const rate = entry.quality_signal.overall.follow_rate;
	if (rate >= .9) return "stable";
	if (rate >= .75) return "improving";
	return "degrading";
}
//#endregion
export { evaluateGuidance };
