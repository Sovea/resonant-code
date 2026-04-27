//#region src/ir/relations/public-mapping.ts
function semanticRelationIRToPublic(relation) {
	return {
		directive_id: relation.directiveId,
		observation_id: relation.observationId,
		relation: publicRelationKind(relation.adjudication.finalRelation),
		confidence: relation.confidence,
		basis: publicBasis(relation),
		reason: relation.adjudication.reason
	};
}
function semanticRelationsIRToPublic(relations) {
	return relations.map(semanticRelationIRToPublic);
}
function publicRelationKind(relation) {
	switch (relation) {
		case "reinforce":
		case "tension":
		case "ambient-only": return relation;
		case "suppress": return "anti-pattern-suppress";
		case "unrelated": return "none";
	}
}
function publicBasis(relation) {
	const basis = [];
	if (relation.basis.scope) basis.push("scope");
	if (relation.basis.evidence) basis.push("verification");
	if (relation.basis.category || relation.basis.semanticKey) basis.push("category");
	if (relation.basis.hostReasoning || relation.basis.feedback) basis.push("context");
	return basis.length ? basis : ["context"];
}
//#endregion
export { semanticRelationIRToPublic, semanticRelationsIRToPublic };
