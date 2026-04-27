import type { DirectiveObservationRelation, RelationKind } from '../../types.ts';
import type { SemanticRelationIR } from '../types.ts';

export function semanticRelationIRToLegacy(relation: SemanticRelationIR): DirectiveObservationRelation {
  return {
    directive_id: relation.directiveId,
    observation_id: relation.observationId,
    relation: legacyRelationKind(relation.adjudication.finalRelation),
    confidence: relation.confidence,
    basis: legacyBasis(relation),
    reason: relation.adjudication.reason,
  };
}

export function semanticRelationsIRToLegacy(relations: SemanticRelationIR[]): DirectiveObservationRelation[] {
  return relations.map(semanticRelationIRToLegacy);
}

function legacyRelationKind(relation: SemanticRelationIR['adjudication']['finalRelation']): RelationKind {
  switch (relation) {
    case 'reinforce':
    case 'tension':
    case 'ambient-only':
      return relation;
    case 'suppress':
      return 'anti-pattern-suppress';
    case 'unrelated':
      return 'none';
  }
}

function legacyBasis(relation: SemanticRelationIR): DirectiveObservationRelation['basis'] {
  const basis: DirectiveObservationRelation['basis'] = [];
  if (relation.basis.scope) basis.push('scope');
  if (relation.basis.evidence) basis.push('verification');
  if (relation.basis.category || relation.basis.semanticKey) basis.push('category');
  if (relation.basis.hostReasoning || relation.basis.feedback) basis.push('context');
  return basis.length ? basis : ['context'];
}
