//#region src/ir/relations/legacy-mapping.ts
function semanticRelationIRToLegacy(relation) {
	return {
		directive_id: relation.directiveId,
		observation_id: relation.observationId,
		relation: legacyRelationKind(relation.adjudication.finalRelation),
		confidence: relation.confidence,
		basis: legacyBasis(relation),
		reason: relation.adjudication.reason
	};
}
function semanticRelationsIRToLegacy(relations) {
	return relations.map(semanticRelationIRToLegacy);
}
function legacyRelationKind(relation) {
	switch (relation) {
		case "reinforce":
		case "tension":
		case "ambient-only": return relation;
		case "suppress": return "anti-pattern-suppress";
		case "unrelated": return "none";
	}
}
function legacyBasis(relation) {
	const basis = [];
	if (relation.basis.scope) basis.push("scope");
	if (relation.basis.evidence) basis.push("verification");
	if (relation.basis.category || relation.basis.semanticKey) basis.push("category");
	if (relation.basis.hostReasoning || relation.basis.feedback) basis.push("context");
	return basis.length ? basis : ["context"];
}
//#endregion
export { semanticRelationIRToLegacy, semanticRelationsIRToLegacy };
