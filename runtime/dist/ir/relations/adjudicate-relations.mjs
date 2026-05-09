//#region src/ir/relations/adjudicate-relations.ts
function adjudicateSemanticRelations(relations, bundle) {
	const directiveById = new Map(bundle.directives.map((directive) => [directive.id, directive]));
	const observationById = new Map(bundle.observations.map((observation) => [observation.id, observation]));
	return relations.map((relation) => {
		const directive = directiveById.get(relation.directiveId);
		const observation = observationById.get(relation.observationId);
		if (!directive) return rejectRelation(relation, "directive is missing from the IR bundle");
		if (!observation) return rejectRelation(relation, "observation is missing from the IR bundle");
		if (observation.lifecycle.status === "superseded") return rejectRelation(relation, "observation lifecycle is superseded and must not influence current execution");
		if (observation.lifecycle.status === "stale") return downgradeRelation(relation, "observation lifecycle is stale, so it can only provide ambient context");
		if (observation.verification.disposition === "demote-to-ambient") return downgradeRelation(relation, "verify gate demoted the observation, so it can only provide ambient context");
		switch (relation.relation) {
			case "suppress": return adjudicateSuppressRelation(relation, {
				directiveKind: directive.kind,
				observationAntiPattern: observation.traits.antiPattern
			});
			case "tension":
			case "reinforce": return adjudicateDirectionalRelation(relation);
			case "ambient-only": return acceptRelation(relation, "ambient-only relation is valid contextual input");
			case "unrelated": return rejectRelation(relation, "proposal did not establish a semantic relation");
		}
	});
}
function adjudicateSuppressRelation(relation, context) {
	if (!relation.basis.scope) return rejectRelation(relation, "suppression is outside the task scope");
	if (!hasSemanticBasis(relation)) return rejectRelation(relation, "suppression lacks semantic basis");
	if (!hasAntiPatternBasis(relation, context)) return rejectRelation(relation, "suppression requires an anti-pattern directive, anti-pattern observation, or anti-pattern conflict class");
	if (!relation.basis.evidence) return downgradeRelation(relation, "suppression lacks verified observation evidence");
	return acceptRelation(relation, acceptedReason(relation, "suppression"));
}
function adjudicateDirectionalRelation(relation) {
	if (!relation.basis.scope) return rejectRelation(relation, "directional relation is outside the task scope");
	if (!hasSemanticBasis(relation)) return rejectRelation(relation, "directional relation lacks semantic basis");
	if (!relation.basis.evidence) return downgradeRelation(relation, "directional relation lacks verified observation evidence");
	return acceptRelation(relation, acceptedReason(relation, relation.relation));
}
function hasSemanticBasis(relation) {
	return relation.basis.hostReasoning || relation.basis.feedback || relation.basis.semanticKey || relation.basis.category || relation.signals.some((signal) => signal.kind === "host-proposal" || signal.kind === "semantic-key");
}
function hasAntiPatternBasis(relation, context) {
	return context.directiveKind === "anti-pattern" || context.observationAntiPattern || relation.conflictClass === "anti-pattern";
}
function acceptedReason(relation, label) {
	return `${label} relation accepted from ${relation.proposedBy === "multi-source" ? "merged semantic relation sources" : relation.proposedBy} after scope, lifecycle, and verification adjudication`;
}
function acceptRelation(relation, reason) {
	return {
		...relation,
		adjudication: {
			status: "accepted",
			finalRelation: relation.relation,
			reason
		}
	};
}
function downgradeRelation(relation, reason) {
	return {
		...relation,
		adjudication: {
			status: "downgraded",
			finalRelation: "ambient-only",
			reason
		}
	};
}
function rejectRelation(relation, reason) {
	return {
		...relation,
		adjudication: {
			status: "rejected",
			finalRelation: "unrelated",
			reason
		}
	};
}
//#endregion
export { adjudicateSemanticRelations };
