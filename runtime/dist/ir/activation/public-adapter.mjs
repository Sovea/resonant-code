//#region src/ir/activation/public-adapter.ts
function projectIRActivationToPublic(bundle, decisions) {
	const directiveById = new Map(bundle.directives.map((directive) => [directive.id, directive]));
	const activatedDecisions = decisions.filter((decision) => decision.status === "activated");
	return {
		activationView: {
			selected_layers: bundle.sourceManifest.selectedLayers,
			activated: activatedDecisions.map(activationDecisionIRToPublicActivated),
			skipped: decisions.filter((decision) => decision.status === "skipped").map(activationDecisionIRToPublicSkipped)
		},
		activeDirectives: activatedDecisions.map((decision) => {
			const directive = directiveById.get(decision.directiveId);
			if (!directive) throw new Error(`Activated IR directive ${decision.directiveId} is missing from governance bundle`);
			return directiveIRToPublicDirective(directive);
		})
	};
}
function activationDecisionIRToPublicActivated(decision) {
	return {
		directive_id: decision.directiveId,
		layer_id: decision.layerId,
		source_file: decision.sourcePath ?? "",
		effective_prescription: decision.effectivePrescription,
		effective_weight: decision.effectiveWeight,
		effective_priority: {
			layer_rank: decision.priority.layerRank,
			prescription_rank: decision.priority.prescriptionRank,
			weight_rank: decision.priority.weightRank,
			context_rank: decision.priority.localOverrideRank
		},
		activation_reason: decision.note,
		override_applied: decision.localState.overrideApplied,
		augment_applied: decision.localState.augmentApplied
	};
}
function activationDecisionIRToPublicSkipped(decision) {
	return {
		directive_id: decision.directiveId,
		layer_id: decision.layerId,
		reason: toPublicSkippedReason(decision),
		note: decision.note
	};
}
function toPublicSkippedReason(decision) {
	if (decision.reason === "matched") throw new Error(`Activated IR directive ${decision.directiveId} cannot be projected as skipped`);
	return decision.reason;
}
function directiveIRToPublicDirective(directive) {
	return {
		id: directive.id,
		type: directive.kind,
		layer: directive.layer.id,
		scope: directive.scope,
		prescription: directive.prescription,
		weight: directive.weight,
		description: directive.body.description,
		rationale: directive.body.rationale,
		exceptions: directive.body.exceptions,
		examples: directive.body.examples,
		rccl_immune: directive.traits.rcclImmune,
		source: {
			kind: directive.source.kind === "local-playbook" ? "local-addition" : "builtin",
			layerId: directive.layer.id,
			filePath: directive.source.path ?? ""
		}
	};
}
//#endregion
export { projectIRActivationToPublic };
