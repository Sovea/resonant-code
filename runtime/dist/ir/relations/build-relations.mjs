import { adjudicateSemanticRelations } from "./adjudicate-relations.mjs";
import { proposeSemanticRelations } from "./propose-relations.mjs";
//#region src/ir/relations/build-relations.ts
function buildSemanticRelationsIR(bundle) {
	return adjudicateSemanticRelations(proposeSemanticRelations(bundle.directives, bundle.observations, bundle.task), bundle);
}
//#endregion
export { buildSemanticRelationsIR };
