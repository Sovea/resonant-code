import { minimatch } from "../utils/glob.mjs";
//#region src/select/activation-plan.ts
const LAYER_RANKS = {
	core: 5,
	languages: 4,
	frameworks: 3,
	domains: 2,
	local: 1
};
function getDirectiveLayerRank(layerId) {
	if (layerId === "local" || layerId.startsWith("local")) return LAYER_RANKS.local;
	if (layerId.includes("/domains/")) return LAYER_RANKS.domains;
	if (layerId.includes("/frameworks/")) return LAYER_RANKS.frameworks;
	if (layerId.includes("/languages/")) return LAYER_RANKS.languages;
	return LAYER_RANKS.core;
}
function scopeMatchesIntent(scope, targetFile, changedFiles) {
	if (!targetFile && changedFiles.length === 0) return true;
	if (targetFile && minimatch(targetFile, scope)) return true;
	return changedFiles.some((file) => minimatch(file, scope));
}
const WEIGHT_RANKS = {
	low: 0,
	normal: 1,
	high: 2,
	critical: 3
};
const PRESCRIPTION_RANKS = {
	should: 0,
	must: 1
};
function buildActivationPlan(directives, local, selectedLayerIds, intent) {
	const suppressed = new Set(local?.suppresses.map((item) => item.id) ?? []);
	const overrideById = new Map(local?.overrides.map((item) => [item.id, item]) ?? []);
	const augmentById = new Map(local?.augments.map((item) => [item.id, item]) ?? []);
	const candidates = [...directives, ...local?.additions ?? []];
	const activated = [];
	const skipped = [];
	for (const directive of candidates) {
		if (suppressed.has(directive.id)) {
			skipped.push({
				directive_id: directive.id,
				layer_id: directive.source.layerId,
				reason: "suppressed-by-local",
				note: "directive suppressed by local playbook"
			});
			continue;
		}
		if (!layerMatchesIntent(directive, intent)) {
			skipped.push({
				directive_id: directive.id,
				layer_id: directive.source.layerId,
				reason: "layer-mismatch",
				note: "directive layer does not match resolved task intent"
			});
			continue;
		}
		if (!scopeMatchesIntent(directive.scope.path, intent.target_file, intent.changed_files)) {
			skipped.push({
				directive_id: directive.id,
				layer_id: directive.source.layerId,
				reason: "scope-mismatch",
				note: "directive scope does not match target or changed files"
			});
			continue;
		}
		const effective_prescription = overrideById.get(directive.id)?.prescription ?? directive.prescription;
		const effective_weight = overrideById.get(directive.id)?.weight ?? directive.weight;
		activated.push({
			directive_id: directive.id,
			layer_id: directive.source.layerId,
			source_file: directive.source.filePath,
			effective_prescription,
			effective_weight,
			effective_priority: buildPriorityRecord(directive.source.layerId, effective_prescription, effective_weight, overrideById.has(directive.id)),
			activation_reason: buildActivationReason(directive, intent, overrideById.has(directive.id), augmentById.has(directive.id)),
			override_applied: overrideById.has(directive.id),
			augment_applied: augmentById.has(directive.id)
		});
	}
	return {
		selected_layers: selectedLayerIds,
		activated: sortActivated(activated),
		skipped
	};
}
function sortActivated(items) {
	return [...items].sort((a, b) => {
		if (a.effective_priority.layer_rank !== b.effective_priority.layer_rank) return b.effective_priority.layer_rank - a.effective_priority.layer_rank;
		if (a.effective_priority.prescription_rank !== b.effective_priority.prescription_rank) return b.effective_priority.prescription_rank - a.effective_priority.prescription_rank;
		if (a.effective_priority.weight_rank !== b.effective_priority.weight_rank) return b.effective_priority.weight_rank - a.effective_priority.weight_rank;
		if (a.effective_priority.context_rank !== b.effective_priority.context_rank) return b.effective_priority.context_rank - a.effective_priority.context_rank;
		return a.directive_id.localeCompare(b.directive_id);
	});
}
function buildPriorityRecord(layerId, prescription, weight, overrideApplied) {
	return {
		layer_rank: getDirectiveLayerRank(layerId),
		prescription_rank: PRESCRIPTION_RANKS[prescription],
		weight_rank: WEIGHT_RANKS[weight],
		context_rank: overrideApplied ? 1 : 0
	};
}
function buildActivationReason(directive, intent, overrideApplied, augmentApplied) {
	const reasons = [`directive matched task intent for ${intent.operation}`];
	if (directive.source.kind === "local-addition") reasons.push("local directive addition applied");
	if (overrideApplied) reasons.push("local override applied");
	if (augmentApplied) reasons.push("local examples augment applied");
	if (directive.source.layerId === "builtin/core") reasons.push("core guidance always eligible");
	return reasons.join("; ");
}
function layerMatchesIntent(directive, intent) {
	const sourceLayer = directive.source.layerId;
	if (sourceLayer === "builtin/core" || directive.layer.startsWith("local")) return true;
	if (sourceLayer.startsWith("builtin/task-types/")) return sourceLayer.endsWith(`/${intent.operation}`);
	if (sourceLayer.startsWith("builtin/languages/")) return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
	if (sourceLayer.startsWith("builtin/frameworks/")) return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
	return true;
}
//#endregion
export { buildActivationPlan, getDirectiveLayerRank, scopeMatchesIntent };
