import { minimatch } from '../utils/glob.ts';
import type {
  ContextInfluenceRecord,
  ContextProfile,
  ContextTension,
  Directive,
  ExecutionMode,
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
  const scopedObservations = observations.filter((observation) =>
    scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files),
  );
  const contextInfluences: ContextInfluenceRecord[] = [];

  const directiveModes = directives.map((directive) => {
    const linkedObservations = scopedObservations
      .filter((observation) => observation.verification.disposition !== 'demote-to-ambient')
      .filter((observation) => lexicalSimilarity(directive.description, observation.pattern) >= 0.2);

    const defaultDecision = deriveDirectiveDecision(directive, linkedObservations);
    const decision = applyContextAdjustments(
      directive,
      linkedObservations,
      defaultDecision,
      contextProfile,
      contextInfluences,
    );
    return {
      directive_id: directive.id,
      observation_ids: linkedObservations.map((observation) => observation.id),
      execution_mode: decision.execution_mode,
      default_execution_mode: defaultDecision.execution_mode,
      reason: decision.reason,
      decision_basis: decision.decision_basis,
      context_applied: decision.context_applied,
    };
  });

  const contextTensions = scopedObservations.flatMap((observation) =>
    buildTensions(observation, directives, contextProfile),
  );

  return {
    activated_directives: directiveModes
      .filter((item) => item.execution_mode !== 'suppress')
      .map((item) => item.directive_id),
    suppressed_directives: directiveModes
      .filter((item) => item.execution_mode === 'suppress')
      .map((item) => item.directive_id),
    context_tensions: contextTensions,
    directive_modes: directiveModes,
    observation_links: scopedObservations.map((observation) => ({
      observation_id: observation.id,
      directive_ids: directiveModes
        .filter((item) => item.observation_ids.includes(observation.id))
        .map((item) => item.directive_id),
    })),
    context_influences: contextInfluences,
  };
}

interface DirectiveDecision {
  execution_mode: ExecutionMode;
  reason: string;
  decision_basis: 'default' | 'observed-conflict' | 'anti-pattern' | 'rccl-immune' | 'context-adjusted';
  context_applied: string[];
}

function applyContextAdjustments(
  directive: Directive,
  observations: RcclObservation[],
  defaultDecision: DirectiveDecision,
  contextProfile: ContextProfile,
  contextInfluences: ContextInfluenceRecord[],
): DirectiveDecision {
  let decision = { ...defaultDecision, context_applied: [...defaultDecision.context_applied] };

  if (
    contextProfile.optimization_target === 'safety'
    && directive.prescription === 'should'
    && defaultDecision.execution_mode === 'ambient'
    && observations.length > 0
    && isSafetyRelevantDirective(directive)
  ) {
    decision = {
      execution_mode: 'deviation-noted',
      reason: `${defaultDecision.reason} Safety-focused context promotes this guidance from ambient to deviation-noted when repository reality conflicts with correctness- or compatibility-sensitive guidance.`,
      decision_basis: 'context-adjusted',
      context_applied: [...decision.context_applied, 'optimization_target:safety'],
    };
    contextInfluences.push({
      field: 'optimization_target',
      value: contextProfile.optimization_target,
      directive_id: directive.id,
      effect: 'promoted directive from ambient to deviation-noted for safety-sensitive guidance under observed conflict',
    });
  } else if (
    contextProfile.optimization_target === 'safety'
    && directive.prescription === 'must'
    && defaultDecision.execution_mode === 'deviation-noted'
  ) {
    decision = {
      ...decision,
      reason: `${defaultDecision.reason} Safety-focused context preserves stricter enforcement intent even though repository compatibility still requires a deviation-noted posture.`,
      decision_basis: 'context-adjusted',
      context_applied: [...decision.context_applied, 'optimization_target:safety'],
    };
    contextInfluences.push({
      field: 'optimization_target',
      value: contextProfile.optimization_target,
      directive_id: directive.id,
      effect: 'reinforced stricter enforcement intent for a must directive already in deviation-noted mode',
    });
  }

  if (
    hasConstraint(contextProfile.hard_constraints, ['preserve compatibility', 'avoid breaking changes', 'preserve public api'])
    && directive.prescription === 'must'
    && decision.execution_mode === 'enforce'
    && observations.some((observation) => ['legacy', 'constraint', 'migration'].includes(observation.category))
  ) {
    decision = {
      execution_mode: 'deviation-noted',
      reason: `${decision.reason} Explicit compatibility constraints shift execution to deviation-noted because legacy or migration realities must be preserved at touched interfaces.`,
      decision_basis: 'context-adjusted',
      context_applied: [...decision.context_applied, 'hard_constraints:compatibility'],
    };
    contextInfluences.push({
      field: 'hard_constraints',
      value: 'preserve compatibility',
      directive_id: directive.id,
      effect: 'changed execution from enforce to deviation-noted to respect compatibility-sensitive repository observations',
    });
  }

  if (
    hasConstraint(contextProfile.allowed_tradeoffs, ['prefer narrow change scope'])
    && directive.prescription === 'should'
    && isBroadDirective(directive)
  ) {
    decision = {
      ...decision,
      execution_mode: 'ambient',
      reason: `${decision.reason} Narrow-scope tradeoff guidance keeps broad architectural or refactor-oriented guidance ambient for this task.`,
      decision_basis: 'context-adjusted',
      context_applied: [...decision.context_applied, 'allowed_tradeoffs:prefer narrow change scope'],
    };
    contextInfluences.push({
      field: 'allowed_tradeoffs',
      value: 'prefer narrow change scope',
      directive_id: directive.id,
      effect: 'kept broad should-level guidance ambient to avoid widening the change scope',
    });
  }

  if (
    hasConstraint(contextProfile.avoid, ['broad rewrites', 'overengineering'])
    && directive.prescription === 'should'
    && isBroadDirective(directive)
  ) {
    decision = {
      ...decision,
      execution_mode: 'ambient',
      reason: `${decision.reason} Avoiding broad rewrites or overengineering keeps expansive guidance ambient unless it is already a must-level requirement.`,
      decision_basis: 'context-adjusted',
      context_applied: [...decision.context_applied, 'avoid:broad rewrites'],
    };
    contextInfluences.push({
      field: 'avoid',
      value: 'broad rewrites',
      directive_id: directive.id,
      effect: 'prevented broad should-level guidance from becoming more assertive in a narrowly scoped task',
    });
  }

  return decision;
}

/**
 * Converts conflicting repository observations into explicit context tensions.
 */
function buildTensions(
  observation: RcclObservation,
  directives: Directive[],
  contextProfile: ContextProfile,
): ContextTension[] {
  if (observation.verification.disposition === 'demote-to-ambient') return [];
  if (observation.adherence_quality === 'good') return [];
  const candidates = directives
    .map((directive) => ({ directive, score: lexicalSimilarity(directive.description, observation.pattern) }))
    .filter((item) => item.score >= 0.2)
    .sort((a, b) => b.score - a.score);
  const match = candidates[0]?.directive;
  if (!match || match.prescription !== 'must') return [];
  const execution_mode: ExecutionMode = 'deviation-noted';
  return [{
    directive_id: match.id,
    execution_mode,
    conflict: `${match.description} conflicts with observed local pattern: ${observation.pattern}`,
    resolution: buildTensionResolution(match.id, contextProfile, observation),
    rccl_confidence: observation.verification.verified_confidence ?? 0,
  }];
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

/**
 * Chooses how a directive should execute in the presence of repository observations.
 */
function deriveDirectiveDecision(
  directive: Directive,
  observations: RcclObservation[],
): DirectiveDecision {
  if (directive.type === 'anti-pattern') {
    return {
      execution_mode: 'suppress',
      reason: 'directive is classified as an anti-pattern and should suppress matching behavior',
      decision_basis: 'anti-pattern',
      context_applied: [],
    };
  }
  if (directive.rccl_immune) {
    return {
      execution_mode: 'enforce',
      reason: 'directive is marked rccl_immune and should not be downgraded by repository observations',
      decision_basis: 'rccl-immune',
      context_applied: [],
    };
  }
  const relevantScore = observations
    .map((observation) => lexicalSimilarity(directive.description, observation.pattern))
    .sort((a, b) => b - a)[0] ?? 0;
  if (relevantScore < 0.2) {
    return {
      execution_mode: directive.prescription === 'must' ? 'enforce' : 'ambient',
      reason: 'no strong repository observation matched this directive, so default execution behavior applies',
      decision_basis: 'default',
      context_applied: [],
    };
  }
  return {
    execution_mode: directive.prescription === 'must' ? 'deviation-noted' : 'ambient',
    reason: 'repository observations materially overlap this directive, so execution is adjusted to reflect current repository reality',
    decision_basis: 'observed-conflict',
    context_applied: [],
  };
}

function hasConstraint(values: string[], expected: string[]): boolean {
  return expected.some((item) => values.includes(item));
}

function isSafetyRelevantDirective(directive: Directive): boolean {
  return /(safe|safety|correct|correctness|compatib|breaking|public api|regression|constraint|migration)/i.test(
    `${directive.description} ${directive.rationale}`,
  );
}

function isBroadDirective(directive: Directive): boolean {
  if (directive.type === 'architecture') return true;
  return /(architecture|restructure|rewrite|broad|cross-cutting|shared abstraction|generalize|framework)/i.test(
    `${directive.description} ${directive.rationale}`,
  );
}

function lexicalSimilarity(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of bTokens) {
    if (aTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z][a-z0-9-]+/g)?.filter((token) => token.length > 2) ?? []);
}

function scopeMatchesIntent(scope: string, targetFile: string | undefined, changedFiles: string[]): boolean {
  if (!targetFile && changedFiles.length === 0) return true;
  if (targetFile && minimatch(targetFile, scope)) return true;
  return changedFiles.some((file) => minimatch(file, scope));
}
