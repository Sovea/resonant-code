import type { EffectiveGuidanceObject, SemanticMergeResult, TaskIntent } from '../../types.ts';
import { getDirectiveLayerRank } from '../../select/activation-plan.ts';
import type { DirectiveIR, GovernanceIRBundle } from '../types.ts';

export function projectIREgoToPublic(
  activatedBundle: GovernanceIRBundle,
  semanticMergeResult: SemanticMergeResult,
  taskIntent: TaskIntent,
): EffectiveGuidanceObject {
  const modeByDirectiveId = new Map(
    semanticMergeResult.directive_modes.map((item) => [item.directive_id, item.execution_mode]),
  );
  const decisionByDirectiveId = new Map(
    semanticMergeResult.directive_modes.map((item) => [item.directive_id, item]),
  );

  const must_follow = activatedBundle.directives
    .filter((directive) => directive.kind !== 'anti-pattern')
    .sort((a, b) => compareDirectives(a, b, decisionByDirectiveId))
    .map((directive) => ({
      id: directive.id,
      statement: directive.body.description,
      rationale: directive.body.rationale,
      prescription: directive.prescription,
      exceptions: directive.body.exceptions,
      examples: directive.body.examples,
      execution_mode: modeByDirectiveId.get(directive.id) ?? 'ambient',
    }));

  const avoid = activatedBundle.observations
    .filter((observation) => observation.category === 'anti-pattern')
    .filter((observation) => observation.verification.disposition !== 'demote-to-ambient')
    .map((observation) => ({
      statement: observation.pattern,
      trigger: `anti-pattern:${observation.id}`,
    }));

  const ambient = activatedBundle.observations
    .filter((observation) => observation.category !== 'anti-pattern')
    .map((observation) => {
      const status = observation.verification.disposition === 'demote-to-ambient' ? 'demoted' : 'observed';
      return `${status}: ${observation.pattern}`;
    });

  return {
    taskIntent,
    guidance: {
      must_follow,
      avoid,
      context_tensions: semanticMergeResult.context_tensions,
      ambient,
    },
  };
}

function compareDirectives(
  a: DirectiveIR,
  b: DirectiveIR,
  decisionByDirectiveId: Map<string, SemanticMergeResult['directive_modes'][number]>,
): number {
  const layerScore = getDirectiveLayerRank(b.layer.id) - getDirectiveLayerRank(a.layer.id);
  if (layerScore !== 0) return layerScore;

  const prescriptionScore = a.prescription === b.prescription ? 0 : a.prescription === 'must' ? -1 : 1;
  if (prescriptionScore !== 0) return prescriptionScore;

  const weights = { low: 0, normal: 1, high: 2, critical: 3 };
  const weightScore = weights[b.weight] - weights[a.weight];
  if (weightScore !== 0) return weightScore;

  const contextAppliedScore = (decisionByDirectiveId.get(b.id)?.context_applied.length ?? 0)
    - (decisionByDirectiveId.get(a.id)?.context_applied.length ?? 0);
  if (contextAppliedScore !== 0) return contextAppliedScore;

  return a.id.localeCompare(b.id);
}
