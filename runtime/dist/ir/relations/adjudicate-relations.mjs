//#region src/ir/relations/adjudicate-relations.ts
const SUPPRESS_CONFIDENCE_THRESHOLD = .75;
const BROAD_SCOPE_CONFIDENCE_THRESHOLD = .7;
function adjudicateSemanticRelations(relations, bundle) {
	const observationById = new Map(bundle.observations.map((observation) => [observation.id, observation]));
	return relations.map((relation) => {
		const observation = observationById.get(relation.observationId);
		if (!observation) return rejectRelation(relation, "observation is missing from the IR bundle");
		if (observation.verification.disposition === "demote-to-ambient") return downgradeRelation(relation, "verify gate demoted the observation, so it can only provide ambient context");
		if (isWeakBroadScope(observation)) return downgradeRelation(relation, "broad-scope observation lacks enough verification confidence for directive execution");
		switch (relation.relation) {
			case "suppress": return adjudicateSuppressRelation(relation, observation);
			case "tension":
			case "reinforce": return adjudicateDirectionalRelation(relation);
			case "ambient-only": return acceptRelation(relation, "ambient-only relation is valid contextual input");
			case "unrelated": return rejectRelation(relation, "proposal did not establish a semantic relation");
		}
	});
}
function adjudicateSuppressRelation(relation, observation) {
	if (!observation.traits.antiPattern && relation.conflictClass !== "anti-pattern") return rejectRelation(relation, "suppression requires an anti-pattern observation or conflict class");
	if (relation.confidence < SUPPRESS_CONFIDENCE_THRESHOLD) return downgradeRelation(relation, "anti-pattern suppression requires stronger verification confidence");
	if (!relation.basis.scope || !relation.basis.semanticKey && !relation.basis.category) return rejectRelation(relation, "suppression requires task scope plus semantic or category basis");
	return acceptRelation(relation, "anti-pattern suppression accepted after verification and scope checks");
}
function adjudicateDirectionalRelation(relation) {
	if (!relation.basis.scope) return rejectRelation(relation, "directional relation is outside the task scope");
	if (!relation.basis.semanticKey && !relation.basis.category) return rejectRelation(relation, "directional relation lacks semantic-key or trait/category basis");
	if (!relation.basis.evidence && relation.confidence < BROAD_SCOPE_CONFIDENCE_THRESHOLD) return downgradeRelation(relation, "directional relation lacks verified evidence and sufficient confidence");
	return acceptRelation(relation, `${relation.relation} relation accepted by deterministic Runtime adjudication`);
}
function isWeakBroadScope(observation) {
	const confidence = Math.max(observation.verification.evidenceConfidence, observation.verification.inductionConfidence);
	return observation.support.scopeBasis === "cross-root" && confidence < BROAD_SCOPE_CONFIDENCE_THRESHOLD;
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
