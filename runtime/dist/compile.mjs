import { projectIRActivationToPublic } from "./ir/activation/public-adapter.mjs";
import { activatedDirectiveIdsIR, resolveActivationDecisionsIR } from "./ir/activation/resolve-activation.mjs";
import { resolveTask } from "./interpret/normalize-candidate.mjs";
import { loadCompileSources } from "./load/compile-sources.mjs";
import { stableHash } from "./utils/hash.mjs";
import { buildGovernanceIR } from "./ir/build-ir.mjs";
import { projectIREgoToPublic } from "./ir/ego/public-adapter.mjs";
import { resolveExecutionDecisionsIR } from "./ir/execution/resolve-execution.mjs";
import { buildSemanticRelationsIR } from "./ir/relations/build-relations.mjs";
import { projectIRSemanticMergeToPublic } from "./ir/semantic-merge/public-adapter.mjs";
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
function buildGovernancePacket(activation, tensions, focus, semantic_merge, ego, trace) {
	return {
		activation,
		tensions,
		focus,
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
	const sources = await loadCompileSources(normalizedInput);
	const governanceIR = await buildGovernanceIR(normalizedInput, sources);
	traceSteps.push({
		stage: "Governance IR",
		lines: [
			`ir_version: ${governanceIR.irVersion}`,
			`bundle_fingerprint: ${governanceIR.fingerprints.bundle}`,
			`task_fingerprint: ${governanceIR.fingerprints.task}`,
			`directives_fingerprint: ${governanceIR.fingerprints.directives}`,
			`observations_fingerprint: ${governanceIR.fingerprints.observations}`,
			`feedback_fingerprint: ${governanceIR.fingerprints.feedback}`,
			`host_proposals_fingerprint: ${governanceIR.fingerprints.hostProposals}`,
			`selected_layers: ${governanceIR.sourceManifest.selectedLayers.join(", ") || "(none)"}`
		]
	});
	const activationDecisionsIR = resolveActivationDecisionsIR(governanceIR);
	const irActivatedDirectiveIds = activatedDirectiveIdsIR(activationDecisionsIR);
	const activatedGovernanceIR = {
		...governanceIR,
		directives: governanceIR.directives.filter((directive) => irActivatedDirectiveIds.has(directive.id))
	};
	const semanticRelationsIR = buildSemanticRelationsIR(activatedGovernanceIR);
	traceSteps.push({
		stage: "IR Semantic Relations",
		lines: summarizeSemanticRelationsIR(semanticRelationsIR)
	});
	const { activationView, activeDirectives } = projectIRActivationToPublic(governanceIR, activationDecisionsIR);
	const selectedLayerIds = sources.selectedLayerIds;
	traceSteps.push({
		stage: "Layer Filter",
		lines: [
			...activationView.selected_layers.length ? activationView.selected_layers.map((layerId) => `applied ${layerId}`) : ["applied builtin/core"],
			`activated: ${activationView.activated.length}`,
			`skipped: ${activationView.skipped.length}`
		]
	});
	const rccl = sources.rccl;
	traceSteps.push({
		stage: "RCCL Verify Gate",
		lines: rccl?.observations.length ? rccl.observations.map((observation) => {
			const evidenceStatus = observation.verification.evidence_status ?? "pending";
			const inductionStatus = observation.verification.induction_status ?? "pending";
			const disposition = observation.verification.disposition ?? "pending";
			return `${observation.id}: evidence=${evidenceStatus} induction=${inductionStatus} disposition=${disposition} support=${observation.support.scope_basis}/${observation.support.file_count}f/${observation.support.cluster_count}c`;
		}) : ["no rccl loaded"]
	});
	const executionDecisionsIR = resolveExecutionDecisionsIR(activatedGovernanceIR, semanticRelationsIR);
	const semanticMergeResult = projectIRSemanticMergeToPublic(activeDirectives, rccl?.observations ?? [], semanticRelationsIR, executionDecisionsIR, contextProfile);
	const tensions = { records: semanticMergeResult.context_tensions };
	const focus = buildFocusView(semanticMergeResult, activeDirectives);
	traceSteps.push({
		stage: "Semantic Merge",
		lines: [
			`activated_directives: ${semanticMergeResult.activated_directives.length}`,
			`suppressed_directives: ${semanticMergeResult.suppressed_directives.length}`,
			`relations: ${semanticMergeResult.relations.length}`,
			`context_tensions: ${semanticMergeResult.context_tensions.length}`,
			`review_focus: ${focus.review_focus.length}`,
			`context_influences: ${semanticMergeResult.context_influences.length}`
		]
	});
	const ego = projectIREgoToPublic(activatedGovernanceIR, semanticMergeResult, intent);
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
		activation: activationView,
		tensions,
		review_focus: focus.review_focus,
		directive_decisions: semanticMergeResult.directive_modes,
		observation_links: semanticMergeResult.observation_links,
		context_influences: semanticMergeResult.context_influences
	};
	const cache = buildCacheKeys({
		builtinRoot: normalizedInput.builtinRoot,
		localAugmentPath: normalizedInput.localAugmentPath,
		rcclPath: normalizedInput.rcclPath,
		task: resolved.task,
		builtinLayers: sources.builtinLayers
	}, selectedLayerIds, rccl);
	return compileResolvedOutput({
		version: 2,
		task: {
			task_kind: resolved.taskKind,
			input: resolved.task
		},
		interpretation: buildInterpretationPacket(resolved),
		governance: buildGovernancePacket(activationView, tensions, focus, semanticMergeResult, ego, trace),
		cache
	}, resolved);
}
function summarizeSemanticRelationsIR(relations) {
	const statusCounts = countBy(relations, (relation) => relation.adjudication.status);
	const finalRelationCounts = countBy(relations, (relation) => relation.adjudication.finalRelation);
	const proposedRelationCounts = countBy(relations, (relation) => relation.relation);
	return [
		`proposed: ${relations.length}`,
		`accepted: ${statusCounts.get("accepted") ?? 0}`,
		`downgraded: ${statusCounts.get("downgraded") ?? 0}`,
		`rejected: ${statusCounts.get("rejected") ?? 0}`,
		`proposed_relations: ${formatCounts(proposedRelationCounts)}`,
		`final_relations: ${formatCounts(finalRelationCounts)}`
	];
}
function countBy(items, key) {
	const counts = /* @__PURE__ */ new Map();
	for (const item of items) {
		const value = key(item);
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}
function formatCounts(counts) {
	if (counts.size === 0) return "(none)";
	return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => `${key}=${count}`).join(", ");
}
function buildFocusView(semanticMergeResult, directives) {
	const directiveById = new Map(directives.map((directive) => [directive.id, directive]));
	return { review_focus: semanticMergeResult.focus.review_focus.map((item) => {
		const directive = item.directive_id ? directiveById.get(item.directive_id) : void 0;
		return {
			kind: item.kind,
			title: buildFocusTitle(item.kind, directive?.description, item.directive_id, item.observation_id),
			reason: item.reason,
			directive_id: item.directive_id,
			observation_id: item.observation_id
		};
	}) };
}
function buildFocusTitle(kind, directiveDescription, directiveId, observationId) {
	const directiveLabel = directiveDescription ?? directiveId ?? "directive";
	switch (kind) {
		case "tension": return `Review tension around ${directiveLabel}`;
		case "anti-pattern": return `Check anti-pattern suppression for ${observationId ?? directiveLabel}`;
		case "high-priority-directive": return `Confirm high-priority guidance for ${directiveLabel}`;
		case "compatibility-boundary": return `Inspect compatibility boundary for ${directiveLabel}`;
	}
}
/**
* Derives stable cache keys for layered inputs and the concrete task payload.
*/
function buildCacheKeys(input, selectedLayerIds, rccl) {
	const builtinFingerprints = selectedLayerIds.map((layerId) => {
		const filePath = input.builtinLayers.get(layerId);
		return `${layerId}:${filePath ? stableHash([readFileSync(filePath, "utf-8")]) : stableHash(["missing"])}`;
	});
	const localSource = input.localAugmentPath ? readFileSync(input.localAugmentPath, "utf-8") : "";
	const rcclSource = input.rcclPath && rccl ? JSON.stringify(rccl.observations.map((item) => [
		item.id,
		item.verification.evidence_status,
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
