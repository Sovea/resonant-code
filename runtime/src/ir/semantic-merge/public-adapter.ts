import type {
  ContextInfluenceRecord,
  ContextProfile,
  Directive,
  ExecutionMode,
  RcclObservation,
  ReviewFocusSeed,
  SemanticMergeDirectiveLink,
  SemanticMergeResult,
  SemanticMergeTensionRecord,
} from '../../types.ts';
import type { ExecutionDecisionIR, SemanticRelationIR } from '../types.ts';
import { semanticRelationsIRToPublic } from '../relations/public-mapping.ts';

export function projectIRSemanticMergeToPublic(
  directives: Directive[],
  observations: RcclObservation[],
  relationsIR: SemanticRelationIR[],
  executionDecisionsIR: ExecutionDecisionIR[],
  contextProfile: ContextProfile,
): SemanticMergeResult {
  const directiveById = new Map(directives.map((directive) => [directive.id, directive]));
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));
  const effectiveRelations = relationsIR.filter(isEffectiveRelation);
  const observationIdsByDirective = groupObservationIdsByDirective(effectiveRelations);
  const directiveModes = executionDecisionsIR.map((decision) => projectExecutionDecision(
    decision,
    observationIdsByDirective.get(decision.directiveId) ?? [],
  ));
  const contextTensions = buildContextTensions(effectiveRelations, directiveById, observationById, contextProfile);
  const contextInfluences = buildContextInfluences(executionDecisionsIR);
  const reviewFocus = buildReviewFocus(directiveModes, effectiveRelations, directiveById, contextTensions);

  return {
    activated_directives: directiveModes
      .filter((item) => item.execution_mode !== 'suppress')
      .map((item) => item.directive_id),
    suppressed_directives: directiveModes
      .filter((item) => item.execution_mode === 'suppress')
      .map((item) => item.directive_id),
    context_tensions: contextTensions,
    directive_modes: directiveModes,
    observation_links: observations.map((observation) => ({
      observation_id: observation.id,
      directive_ids: directiveModes
        .filter((item) => item.observation_ids.includes(observation.id))
        .map((item) => item.directive_id),
    })),
    relations: semanticRelationsIRToPublic(relationsIR),
    focus: {
      review_focus: uniqueFocus(reviewFocus),
    },
    context_influences: contextInfluences,
  };
}

function isEffectiveRelation(relation: SemanticRelationIR): boolean {
  return relation.adjudication.status !== 'rejected' && relation.adjudication.finalRelation !== 'unrelated';
}

function groupObservationIdsByDirective(relations: SemanticRelationIR[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const relation of relations) {
    const current = grouped.get(relation.directiveId) ?? [];
    if (!current.includes(relation.observationId)) current.push(relation.observationId);
    grouped.set(relation.directiveId, current);
  }
  return grouped;
}

function projectExecutionDecision(
  decision: ExecutionDecisionIR,
  observationIds: string[],
): SemanticMergeDirectiveLink {
  return {
    directive_id: decision.directiveId,
    observation_ids: observationIds,
    execution_mode: decision.mode,
    default_execution_mode: decision.defaultMode,
    reason: decision.reason,
    decision_basis: publicDecisionBasis(decision.basis),
    context_applied: decision.contextApplied,
  };
}

function publicDecisionBasis(basis: ExecutionDecisionIR['basis']): SemanticMergeDirectiveLink['decision_basis'] {
  switch (basis) {
    case 'prescription':
      return 'default';
    case 'semantic-relation':
      return 'observed-conflict';
    case 'verification':
      return 'rccl-immune';
    case 'task-context':
    case 'feedback':
      return 'context-adjusted';
    case 'anti-pattern':
      return 'anti-pattern';
  }
}

function buildContextTensions(
  relations: SemanticRelationIR[],
  directiveById: Map<string, Directive>,
  observationById: Map<string, RcclObservation>,
  contextProfile: ContextProfile,
): SemanticMergeTensionRecord[] {
  return relations.flatMap((relation) => {
    if (relation.adjudication.finalRelation !== 'tension') return [];
    const directive = directiveById.get(relation.directiveId);
    const observation = observationById.get(relation.observationId);
    if (!directive || !observation || directive.prescription !== 'must') return [];
    return [{
      directive_id: directive.id,
      observation_id: observation.id,
      category: observation.category,
      execution_mode: 'deviation-noted' as ExecutionMode,
      conflict: `${directive.description} conflicts with observed local pattern: ${observation.pattern}`,
      resolution: buildTensionResolution(directive.id, contextProfile, observation),
      rccl_confidence: observation.verification.induction_confidence ?? observation.verification.evidence_confidence ?? relation.confidence,
    }];
  });
}

function buildReviewFocus(
  directiveModes: SemanticMergeDirectiveLink[],
  relations: SemanticRelationIR[],
  directiveById: Map<string, Directive>,
  contextTensions: SemanticMergeTensionRecord[],
): ReviewFocusSeed[] {
  const reviewFocus: ReviewFocusSeed[] = [];

  for (const decision of directiveModes) {
    const directive = directiveById.get(decision.directive_id);
    if (!directive) continue;
    if (decision.execution_mode === 'deviation-noted') {
      reviewFocus.push({
        kind: 'compatibility-boundary',
        directive_id: directive.id,
        reason: decision.reason,
      });
    }
    if (
      directive.prescription === 'must'
      || decision.execution_mode === 'deviation-noted'
      || (directive.weight === 'critical' && decision.execution_mode === 'enforce')
    ) {
      reviewFocus.push({
        kind: 'high-priority-directive',
        directive_id: directive.id,
        reason: `Review whether ${directive.id} was respected under ${decision.execution_mode} execution mode.`,
      });
    }
  }

  for (const tension of contextTensions) {
    reviewFocus.push({
      kind: 'tension',
      directive_id: tension.directive_id,
      observation_id: tension.observation_id,
      reason: tension.resolution,
    });
  }

  for (const relation of relations.filter((item) => item.adjudication.finalRelation === 'suppress')) {
    reviewFocus.push({
      kind: 'anti-pattern',
      directive_id: relation.directiveId,
      observation_id: relation.observationId,
      reason: relation.adjudication.reason,
    });
  }

  return reviewFocus;
}

function buildContextInfluences(decisions: ExecutionDecisionIR[]): ContextInfluenceRecord[] {
  return decisions.flatMap((decision) => decision.contextApplied.map((context) => {
    const [field, value] = context.split(':');
    return {
      field: publicContextField(field),
      value: value ?? '',
      directive_id: decision.directiveId,
      effect: contextInfluenceEffect(context, decision.mode),
    };
  }));
}

function publicContextField(field: string): ContextInfluenceRecord['field'] {
  switch (field) {
    case 'optimization_target':
    case 'hard_constraints':
    case 'allowed_tradeoffs':
    case 'avoid':
      return field;
    default:
      return 'project_stage';
  }
}

function contextInfluenceEffect(context: string, mode: ExecutionMode): string {
  if (context.startsWith('optimization_target:')) {
    return `adjusted execution to ${mode} for the task optimization target`;
  }
  if (context.startsWith('hard_constraints:')) {
    return `adjusted execution to ${mode} for explicit task constraints`;
  }
  if (context.startsWith('allowed_tradeoffs:')) {
    return `adjusted execution to ${mode} for allowed task tradeoffs`;
  }
  if (context.startsWith('avoid:')) {
    return `adjusted execution to ${mode} for task avoidance guidance`;
  }
  return `adjusted execution to ${mode} for task context`;
}

function buildTensionResolution(
  directiveId: string,
  contextProfile: ContextProfile,
  observation: RcclObservation,
): string {
  if (hasConstraint(contextProfile.hard_constraints, ['preserve compatibility', 'avoid breaking changes', 'preserve public api'])) {
    return `Follow ${directiveId} for new code, but preserve compatibility with the observed ${observation.category} repository pattern at touched interfaces.`;
  }
  if (hasConstraint(contextProfile.allowed_tradeoffs, ['prefer narrow change scope'])) {
    return `Follow ${directiveId} for the touched code, but contain the change to the local boundary instead of broad cleanup around the observed repository pattern.`;
  }
  if (hasConstraint(contextProfile.avoid, ['broad rewrites', 'overengineering'])) {
    return `Follow ${directiveId} in the local change, but avoid turning this tension into a broad rewrite of the observed repository pattern.`;
  }
  return `Follow ${directiveId} for new code, but preserve compatibility with the observed repository pattern where interfaces depend on it.`;
}

function hasConstraint(values: string[], expected: string[]): boolean {
  return expected.some((item) => values.includes(item));
}

function uniqueFocus(items: ReviewFocusSeed[]): ReviewFocusSeed[] {
  const seen = new Set<string>();
  const result: ReviewFocusSeed[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.directive_id ?? ''}:${item.observation_id ?? ''}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
