import { buildRelations } from './build-relations.ts';
import { resolveExecutionModes } from './resolve-execution-modes.ts';
import type {
  ContextProfile,
  Directive,
  RcclObservation,
  SemanticMergeResult,
  TaskIntent,
} from '../types.ts';

/**
 * Merges prescriptive directives with repository observations into execution decisions.
 */
export function semanticMerge(
  directives: Directive[],
  observations: RcclObservation[],
  intent: TaskIntent,
  contextProfile: ContextProfile,
): SemanticMergeResult {
  const relations = buildRelations(directives, observations, intent);
  const resolved = resolveExecutionModes(directives, observations, relations, contextProfile);

  return {
    activated_directives: resolved.directive_modes
      .filter((item) => item.execution_mode !== 'suppress')
      .map((item) => item.directive_id),
    suppressed_directives: resolved.directive_modes
      .filter((item) => item.execution_mode === 'suppress')
      .map((item) => item.directive_id),
    context_tensions: resolved.context_tensions,
    directive_modes: resolved.directive_modes,
    observation_links: resolved.observation_links,
    relations,
    focus: {
      review_focus: resolved.review_focus,
    },
    context_influences: resolved.context_influences,
  };
}
