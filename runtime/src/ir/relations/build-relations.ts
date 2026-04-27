import type { GovernanceIRBundle, SemanticRelationIR } from '../types.ts';
import { adjudicateSemanticRelations } from './adjudicate-relations.ts';
import { proposeSemanticRelations } from './propose-relations.ts';

export function buildSemanticRelationsIR(bundle: GovernanceIRBundle): SemanticRelationIR[] {
  const proposals = proposeSemanticRelations(bundle.directives, bundle.observations, bundle.task);
  return adjudicateSemanticRelations(proposals, bundle);
}
