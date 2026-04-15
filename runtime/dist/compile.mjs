import { resolveTask } from "./interpret/normalize-candidate.mjs";
import { minimatch } from "./utils/glob.mjs";
import { semanticMerge } from "./merge/semantic-merge.mjs";
import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from "./load/load-playbook.mjs";
import { loadRccl } from "./load/load-rccl.mjs";
import { verifyRcclDocument } from "./verify/verify-rccl.mjs";
import { stableHash } from "./utils/hash.mjs";
import { readFileSync } from "node:fs";
//#region src/compile.ts
function hasResolvedTask(input) {
	return "resolvedTask" in input;
}
function toResolvedCompileInput(input) {
	if (hasResolvedTask(input)) return input;
	return {
		builtinRoot: input.builtinRoot,
		localAugmentPath: input.localAugmentPath,
		rcclPath: input.rcclPath,
		projectRoot: input.projectRoot,
		lockfilePath: input.lockfilePath,
		resolvedTask: resolveTask({
			task: input.task,
			candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
			interpretationMode: input.interpretationMode
		})
	};
}
function buildInterpretationPacket(resolved) {
	return {
		candidates: resolved.candidates,
		input_provenance: resolved.input_provenance,
		diagnostics: resolved.diagnostics,
		trace: resolved.trace,
		resolved: {
			task_intent: resolved.task_intent,
			context_profile: resolved.context_profile
		}
	};
}
function buildGovernancePacket(semantic_merge, ego, trace) {
	return {
		semantic_merge,
		ego,
		trace
	};
}
function compileResolvedOutput(packet, resolvedTask) {
	return {
		packet,
		resolvedTask,
		ego: packet.governance.ego,
		trace: packet.governance.trace,
		cache: packet.cache
	};
}
/**
* Runs the deterministic playbook pipeline and produces a change decision packet.
*/
async function compile(input) {
	const normalizedInput = toResolvedCompileInput(input);
	const resolved = normalizedInput.resolvedTask;
	const traceSteps = [];
	const intent = resolved.task_intent;
	const contextProfile = resolved.context_profile;
	traceSteps.push({
		stage: "Intent Parse",
		lines: [
			`interpretation_mode: ${resolved.input_provenance.interpretation_mode}`,
			`resolved_fields: ${resolved.input_provenance.resolved_fields.length}`,
			`unresolved_fields: ${resolved.input_provenance.unresolved_fields.join(", ") || "(none)"}`,
			`operation: ${intent.operation}`,
			`target_layer: ${intent.target_layer}`,
			`tech_stack: ${intent.tech_stack.join(", ") || "(none)"}`,
			`target_file: ${intent.target_file ?? "(none)"}`,
			`optimization_target: ${contextProfile.optimization_target}`,
			`hard_constraints: ${contextProfile.hard_constraints.join(", ") || "(none)"}`,
			`allowed_tradeoffs: ${contextProfile.allowed_tradeoffs.join(", ") || "(none)"}`,
			`avoid: ${contextProfile.avoid.join(", ") || "(none)"}`,
			`project_stage: ${contextProfile.project_stage ?? "(none)"}`
		]
	});
	const builtinLayers = discoverBuiltinLayers(normalizedInput.builtinRoot);
	const local = loadLocalPlaybook(normalizedInput.localAugmentPath);
	const selectedLayerIds = local?.meta.extends.length ? resolveExtendedLayers(local.meta.extends, builtinLayers) : ["builtin/core"];
	traceSteps.push({
		stage: "Layer Filter",
		lines: selectedLayerIds.length ? selectedLayerIds.map((layerId) => `applied ${layerId}`) : ["applied builtin/core"]
	});
	const filteredDirectives = applyLocalAugment(selectedLayerIds.flatMap((layerId) => {
		const filePath = builtinLayers.get(layerId);
		return filePath ? loadDirectiveFile(filePath, layerId) : [];
	}), local).filter((directive) => layerMatchesIntent(directive, intent)).filter((directive) => scopeMatchesIntent(directive.scope.path, intent.target_file, intent.changed_files));
	const loadedRccl = loadRccl(normalizedInput.rcclPath);
	const rccl = loadedRccl ? verifyRcclDocument(loadedRccl, normalizedInput.projectRoot) : null;
	traceSteps.push({
		stage: "RCCL Verify Gate",
		lines: rccl?.observations.length ? rccl.observations.map((observation) => `${observation.id}: ${observation.verification.status}/${observation.verification.disposition}`) : ["no rccl loaded"]
	});
	const semanticMergeResult = semanticMerge(filteredDirectives, rccl?.observations ?? [], intent, contextProfile);
	traceSteps.push({
		stage: "Semantic Merge",
		lines: [
			`activated_directives: ${semanticMergeResult.activated_directives.length}`,
			`suppressed_directives: ${semanticMergeResult.suppressed_directives.length}`,
			`context_tensions: ${semanticMergeResult.context_tensions.length}`,
			`context_influences: ${semanticMergeResult.context_influences.length}`
		]
	});
	const ego = assembleEgo(filteredDirectives, rccl?.observations ?? [], intent, contextProfile, semanticMergeResult);
	traceSteps.push({
		stage: "EGO Assembly",
		lines: [
			`must_follow: ${ego.guidance.must_follow.length}`,
			`avoid: ${ego.guidance.avoid.length}`,
			`context_tensions: ${ego.guidance.context_tensions.length}`,
			`ambient: ${ego.guidance.ambient.length}`
		]
	});
	const trace = {
		task: intent,
		steps: traceSteps,
		activated_directives: semanticMergeResult.activated_directives,
		suppressed_directives: semanticMergeResult.suppressed_directives,
		directive_decisions: semanticMergeResult.directive_modes,
		observation_links: semanticMergeResult.observation_links,
		context_influences: semanticMergeResult.context_influences
	};
	const cache = buildCacheKeys({
		builtinRoot: normalizedInput.builtinRoot,
		localAugmentPath: normalizedInput.localAugmentPath,
		rcclPath: normalizedInput.rcclPath,
		task: resolved.task
	}, selectedLayerIds, rccl);
	return compileResolvedOutput({
		version: 2,
		task: {
			task_kind: resolved.taskKind,
			input: resolved.task
		},
		interpretation: buildInterpretationPacket(resolved),
		governance: buildGovernancePacket(semanticMergeResult, ego, trace),
		cache
	}, resolved);
}
/**
* Applies local suppressions, overrides, augments, and additions to built-in directives.
*/
function applyLocalAugment(directives, local) {
	if (!local) return directives;
	const suppressed = new Set(local.suppresses.map((item) => item.id));
	const overrideById = new Map(local.overrides.map((item) => [item.id, item]));
	const augmentById = new Map(local.augments.map((item) => [item.id, item]));
	return [...directives.filter((directive) => !suppressed.has(directive.id)).map((directive) => {
		const override = overrideById.get(directive.id);
		const augment = augmentById.get(directive.id);
		return {
			...directive,
			prescription: override?.prescription ?? directive.prescription,
			weight: override?.weight ?? directive.weight,
			rationale: override?.rationale ?? directive.rationale,
			exceptions: override?.exceptions ?? directive.exceptions,
			examples: augment ? [...directive.examples, ...augment.examples] : directive.examples
		};
	}), ...local.additions];
}
function layerMatchesIntent(directive, intent) {
	const sourceLayer = directive.source.layerId;
	if (sourceLayer === "builtin/core" || directive.layer.startsWith("local")) return true;
	if (sourceLayer.startsWith("builtin/task-types/")) return sourceLayer.endsWith(`/${intent.operation}`);
	if (sourceLayer.startsWith("builtin/languages/")) return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
	if (sourceLayer.startsWith("builtin/frameworks/")) return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
	return true;
}
function scopeMatchesIntent(scope, targetFile, changedFiles) {
	if (!targetFile && changedFiles.length === 0) return true;
	if (targetFile && minimatch(targetFile, scope)) return true;
	return changedFiles.some((file) => minimatch(file, scope));
}
/**
* Assembles the final agent-facing guidance object from filtered directives and observations.
*/
function assembleEgo(directives, observations, intent, contextProfile, semanticMergeResult) {
	const modeByDirectiveId = new Map(semanticMergeResult.directive_modes.map((item) => [item.directive_id, item.execution_mode]));
	const decisionByDirectiveId = new Map(semanticMergeResult.directive_modes.map((item) => [item.directive_id, item]));
	return {
		taskIntent: intent,
		guidance: {
			must_follow: directives.filter((directive) => directive.type !== "anti-pattern").sort((a, b) => compareDirectives(a, b, contextProfile, decisionByDirectiveId)).map((directive) => ({
				id: directive.id,
				statement: directive.description,
				rationale: directive.rationale,
				prescription: directive.prescription,
				exceptions: directive.exceptions ?? [],
				examples: directive.examples,
				execution_mode: modeByDirectiveId.get(directive.id) ?? "ambient"
			})),
			avoid: observations.filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files)).filter((observation) => observation.category === "anti-pattern").filter((observation) => observation.verification.disposition !== "demote-to-ambient").map((observation) => ({
				statement: observation.pattern,
				trigger: `anti-pattern:${observation.id}`
			})),
			context_tensions: semanticMergeResult.context_tensions,
			ambient: observations.filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files)).filter((observation) => observation.category !== "anti-pattern").map((observation) => {
				return `${observation.verification.disposition === "demote-to-ambient" ? "demoted" : "observed"}: ${observation.pattern}`;
			})
		}
	};
}
function compareDirectives(a, b, contextProfile, decisionByDirectiveId) {
	const prescriptionScore = a.prescription === b.prescription ? 0 : a.prescription === "must" ? -1 : 1;
	if (prescriptionScore !== 0) return prescriptionScore;
	const weights = {
		low: 0,
		normal: 1,
		high: 2,
		critical: 3
	};
	const weightScore = weights[b.weight] - weights[a.weight];
	if (weightScore !== 0) return weightScore;
	const contextAppliedScore = (decisionByDirectiveId.get(b.id)?.context_applied.length ?? 0) - (decisionByDirectiveId.get(a.id)?.context_applied.length ?? 0);
	if (contextAppliedScore !== 0) return contextAppliedScore;
	const alignmentScore = scoreDirectiveContextAlignment(b, contextProfile) - scoreDirectiveContextAlignment(a, contextProfile);
	if (alignmentScore !== 0) return alignmentScore;
	return a.id.localeCompare(b.id);
}
function scoreDirectiveContextAlignment(directive, contextProfile) {
	const text = `${directive.description} ${directive.rationale}`.toLowerCase();
	let score = 0;
	if (contextProfile.optimization_target === "safety" && /(safe|safety|correct|compatib|regression|constraint|migration)/.test(text)) score += 2;
	if (contextProfile.optimization_target === "reviewability" && /(readable|review|clear|legible|simple)/.test(text)) score += 2;
	if (contextProfile.optimization_target === "simplicity" && /(simple|minimal|small|narrow|focused)/.test(text)) score += 2;
	if (contextProfile.optimization_target === "maintainability" && /(maintain|structure|refactor|module|boundary)/.test(text)) score += 2;
	if (contextProfile.allowed_tradeoffs.includes("prefer narrow change scope") && /(narrow|local|boundary|focused)/.test(text)) score += 1;
	if (contextProfile.hard_constraints.includes("preserve compatibility") && /(compatib|public api|interface)/.test(text)) score += 1;
	return score;
}
/**
* Derives stable cache keys for layered inputs and the concrete task payload.
*/
function buildCacheKeys(input, selectedLayerIds, rccl) {
	const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
	const builtinFingerprints = selectedLayerIds.map((layerId) => {
		const filePath = builtinLayers.get(layerId);
		return `${layerId}:${filePath ? readFileSync(filePath, "utf-8").length : 0}`;
	});
	const localSource = input.localAugmentPath ? readFileSync(input.localAugmentPath, "utf-8") : "";
	const rcclSource = input.rcclPath && rccl ? JSON.stringify(rccl.observations.map((item) => [
		item.id,
		item.verification.status,
		item.verification.disposition
	])) : "";
	const l1Key = stableHash(builtinFingerprints);
	const l2Key = stableHash([
		l1Key,
		localSource,
		rcclSource
	]);
	return {
		l1Key,
		l2Key,
		l3Key: stableHash([l2Key, input.task])
	};
}
//#endregion
export { compile, resolveTask };
