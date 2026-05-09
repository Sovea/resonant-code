import type { ExecutionMode } from '../../types.ts';
import type { ExecutionDecisionIR, GovernanceIRBundle, SemanticRelationIR, DirectiveIR } from '../types.ts';
import { SEMANTIC_RELATION_POLICY } from '../relations/policy.ts';

interface DirectiveDecision {
  mode: ExecutionMode;
  reason: string;
  basis: ExecutionDecisionIR['basis'];
  contextApplied: string[];
}

interface FeedbackEffects {
  labels: string[];
  frequentlyIgnored: boolean;
  frequentlyIgnoredMust: boolean;
  recurringTension: boolean;
  noisyObservation: boolean;
}

export function resolveExecutionDecisionsIR(
  bundle: GovernanceIRBundle,
  relations: SemanticRelationIR[],
): ExecutionDecisionIR[] {
  const relationsByDirective = groupEffectiveRelations(relations);

  return bundle.directives.map((directive) => {
    const linkedRelations = relationsByDirective.get(directive.id) ?? [];
    const defaultDecision = deriveDirectiveDecision(directive, linkedRelations);
    const contextDecision = applyContextAdjustments(directive, linkedRelations, defaultDecision, bundle.task.context);
    const feedbackEffects = feedbackSignalsForDirective(bundle, directive, linkedRelations);
    const decision = applyFeedbackAdjustments(directive, contextDecision, feedbackEffects);

    return {
      directiveId: directive.id,
      mode: decision.mode,
      defaultMode: defaultDecision.mode,
      basis: decision.basis,
      relationIds: linkedRelations.map((relation) => relation.id),
      contextApplied: decision.contextApplied,
      feedbackApplied: feedbackEffects.labels,
      reason: decision.reason,
    };
  });
}

function groupEffectiveRelations(relations: SemanticRelationIR[]): Map<string, SemanticRelationIR[]> {
  const grouped = new Map<string, SemanticRelationIR[]>();
  for (const relation of relations) {
    if (relation.adjudication.status === 'rejected') continue;
    if (relation.adjudication.finalRelation === 'unrelated') continue;
    const current = grouped.get(relation.directiveId) ?? [];
    current.push(relation);
    grouped.set(relation.directiveId, current);
  }
  return grouped;
}

function deriveDirectiveDecision(
  directive: DirectiveIR,
  relations: SemanticRelationIR[],
): DirectiveDecision {
  if (directive.kind === 'anti-pattern') {
    return {
      mode: 'suppress',
      reason: 'directive is classified as an anti-pattern and should suppress matching behavior',
      basis: 'anti-pattern',
      contextApplied: [],
    };
  }
  if (directive.traits.rcclImmune) {
    return {
      mode: 'enforce',
      reason: 'directive is marked rccl_immune and should not be downgraded by repository observations',
      basis: 'verification',
      contextApplied: [],
    };
  }

  const hasTension = relations.some((relation) => relation.adjudication.finalRelation === 'tension');
  const hasSuppress = relations.some((relation) => relation.adjudication.finalRelation === 'suppress');
  if (hasSuppress) {
    return {
      mode: 'suppress',
      reason: 'anti-pattern observations materially overlap this directive and should suppress matching behavior',
      basis: 'anti-pattern',
      contextApplied: [],
    };
  }
  if (!hasTension) {
    return {
      mode: directive.prescription === 'must' ? 'enforce' : 'ambient',
      reason: 'no strong repository tension matched this directive, so default execution behavior applies',
      basis: 'prescription',
      contextApplied: [],
    };
  }
  return {
    mode: directive.prescription === 'must' ? 'deviation-noted' : 'ambient',
    reason: 'repository observations materially overlap this directive, so execution is adjusted to reflect current repository reality',
    basis: 'semantic-relation',
    contextApplied: [],
  };
}

function applyContextAdjustments(
  directive: DirectiveIR,
  relations: SemanticRelationIR[],
  defaultDecision: DirectiveDecision,
  context: GovernanceIRBundle['task']['context'],
): DirectiveDecision {
  let decision = { ...defaultDecision, contextApplied: [...defaultDecision.contextApplied] };
  const hasTension = relations.some((relation) => relation.adjudication.finalRelation === 'tension');

  if (
    context.optimization_target === 'safety'
    && directive.prescription === 'should'
    && defaultDecision.mode === 'ambient'
    && hasTension
    && isCompatibilitySensitiveDirective(directive)
  ) {
    decision = {
      mode: 'deviation-noted',
      reason: `${defaultDecision.reason} Safety-focused context promotes compatibility-sensitive guidance from ambient to deviation-noted when repository reality conflicts with it.`,
      basis: 'task-context',
      contextApplied: [...decision.contextApplied, 'optimization_target:safety'],
    };
  } else if (
    context.optimization_target === 'safety'
    && directive.prescription === 'must'
    && defaultDecision.mode === 'deviation-noted'
  ) {
    decision = {
      ...decision,
      reason: `${defaultDecision.reason} Safety-focused context preserves stricter enforcement intent even though repository compatibility still requires a deviation-noted posture.`,
      basis: 'task-context',
      contextApplied: [...decision.contextApplied, 'optimization_target:safety'],
    };
  }

  if (
    hasConstraint(context.hard_constraints, ['preserve compatibility', 'avoid breaking changes', 'preserve public api'])
    && directive.prescription === 'must'
    && decision.mode === 'enforce'
    && hasTension
  ) {
    decision = {
      mode: 'deviation-noted',
      reason: `${decision.reason} Explicit compatibility constraints shift execution to deviation-noted because legacy or migration realities must be preserved at touched interfaces.`,
      basis: 'task-context',
      contextApplied: [...decision.contextApplied, 'hard_constraints:compatibility'],
    };
  }

  if (
    hasConstraint(context.allowed_tradeoffs, ['prefer narrow change scope'])
    && directive.prescription === 'should'
    && directive.traits.broadScope
  ) {
    decision = {
      ...decision,
      mode: 'ambient',
      reason: `${decision.reason} Narrow-scope tradeoff guidance keeps broad architectural guidance ambient for this task.`,
      basis: 'task-context',
      contextApplied: [...decision.contextApplied, 'allowed_tradeoffs:prefer narrow change scope'],
    };
  }

  if (
    hasConstraint(context.avoid, ['broad rewrites', 'overengineering'])
    && directive.prescription === 'should'
    && directive.traits.broadScope
  ) {
    decision = {
      ...decision,
      mode: 'ambient',
      reason: `${decision.reason} Avoiding broad rewrites or overengineering keeps expansive guidance ambient unless it is already a must-level requirement.`,
      basis: 'task-context',
      contextApplied: [...decision.contextApplied, 'avoid:broad rewrites'],
    };
  }

  return decision;
}

function applyFeedbackAdjustments(
  directive: DirectiveIR,
  decision: DirectiveDecision,
  effects: FeedbackEffects,
): DirectiveDecision {
  let result = { ...decision, contextApplied: [...decision.contextApplied] };

  if (effects.recurringTension && directive.prescription === 'must') {
    result = {
      ...result,
      mode: result.mode === 'suppress' ? result.mode : 'deviation-noted',
      basis: 'feedback',
      reason: `${result.reason} Recurring lockfile tension keeps this must-level directive reviewable as deviation-noted instead of silently treating the repository reality as unrelated.`,
    };
  }

  if (effects.frequentlyIgnored && directive.prescription === 'should') {
    result = {
      ...result,
      mode: 'ambient',
      basis: 'feedback',
      reason: `${result.reason} Lockfile feedback shows this should-level directive is frequently ignored, so it remains ambient unless stronger verified relations require attention.`,
    };
  }

  if (effects.frequentlyIgnoredMust) {
    result = {
      ...result,
      basis: result.basis === 'prescription' ? 'feedback' : result.basis,
      reason: `${result.reason} Lockfile feedback shows a must-level directive was frequently ignored; execution is not weakened, but review focus should verify the outcome.`,
    };
  }

  if (effects.noisyObservation) {
    result = {
      ...result,
      reason: `${result.reason} Feedback marks one linked observation as noisy, so Runtime keeps the relation reviewable and still relies on RCCL verification before changing execution.`,
    };
  }

  return result;
}

function isCompatibilitySensitiveDirective(directive: DirectiveIR): boolean {
  return directive.traits.compatibilitySensitive || directive.traits.rcclImmune || directive.prescription === 'must';
}

function hasConstraint(values: string[], expected: string[]): boolean {
  return expected.some((item) => values.includes(item));
}

function feedbackSignalsForDirective(
  bundle: GovernanceIRBundle,
  directive: DirectiveIR,
  relations: SemanticRelationIR[],
): FeedbackEffects {
  const labels: string[] = [];
  const directiveSignal = bundle.feedback.directiveSignals.find((signal) => signal.directiveId === directive.id);
  const frequentlyIgnored = Boolean(directiveSignal)
    && directiveSignal.ignored >= SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredMinIgnored
    && directiveSignal.followRate < SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredFollowRate;
  const recurringTension = relations.some((relation) =>
    relation.basis.feedback
    && relation.adjudication.status !== 'rejected'
    && relation.adjudication.finalRelation === 'tension');
  const noisyObservation = relations.some((relation) => {
    const signal = bundle.feedback.observationSignals.find((item) => item.observationId === relation.observationId);
    return Boolean(signal)
      && signal.relationCount >= SEMANTIC_RELATION_POLICY.feedback.noisyObservationRelationCount
      && signal.lastDisposition === 'demote-to-ambient';
  });

  if (frequentlyIgnored) labels.push('feedback:frequently-ignored');
  if (frequentlyIgnored && directive.prescription === 'must') labels.push('feedback:frequently-ignored-must-review');
  if (directiveSignal?.trend === 'degrading') labels.push('feedback:degrading');
  if (directiveSignal?.signalConfidence === 'user-corrected') labels.push('feedback:user-corrected');
  if (recurringTension) labels.push('feedback:recurring-tension');
  if (noisyObservation) labels.push('feedback:noisy-observation');

  return {
    labels: unique(labels),
    frequentlyIgnored,
    frequentlyIgnoredMust: frequentlyIgnored && directive.prescription === 'must',
    recurringTension,
    noisyObservation,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
