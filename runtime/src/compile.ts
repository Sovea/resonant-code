import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContextProfile, parseIntent } from './intent/parse-intent.ts';
import { semanticMerge } from './merge/semantic-merge.ts';
import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from './load/load-playbook.ts';
import { loadRccl } from './load/load-rccl.ts';
import { verifyRcclDocument } from './verify/verify-rccl.ts';
import { minimatch } from './utils/glob.ts';
import { stableHash } from './utils/hash.ts';
import type {
  ChangeDecisionPacket,
  CompileInput,
  CompileOutput,
  DecisionTrace,
  Directive,
  EffectiveGuidanceObject,
  RcclObservation,
  SemanticMergeResult,
  TraceStep,
} from './types.ts';

/**
 * Runs the deterministic playbook pipeline and produces a change decision packet.
 */
export async function compile(input: CompileInput): Promise<CompileOutput> {
  const traceSteps: TraceStep[] = [];
  const intent = parseIntent(input.task);
  const contextProfile = buildContextProfile(input.task, intent);
  traceSteps.push({
    stage: 'Intent Parse',
    lines: [
      `operation: ${intent.operation}`,
      `target_layer: ${intent.target_layer}`,
      `tech_stack: ${intent.tech_stack.join(', ') || '(none)'}`,
      `target_file: ${intent.target_file ?? '(none)'}`,
      `optimization_target: ${contextProfile.optimization_target}`,
      `hard_constraints: ${contextProfile.hard_constraints.join(', ') || '(none)'}`,
      `allowed_tradeoffs: ${contextProfile.allowed_tradeoffs.join(', ') || '(none)'}`,
      `avoid: ${contextProfile.avoid.join(', ') || '(none)'}`,
      `project_stage: ${contextProfile.project_stage ?? '(none)'}`,
    ],
  });

  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const local = loadLocalPlaybook(input.localAugmentPath);
  const selectedLayerIds = local?.meta.extends.length
    ? resolveExtendedLayers(local.meta.extends, builtinLayers)
    : ['builtin/core'];
  traceSteps.push({
    stage: 'Layer Filter',
    lines: selectedLayerIds.length ? selectedLayerIds.map((layerId) => `applied ${layerId}`) : ['applied builtin/core'],
  });

  const directives = selectedLayerIds.flatMap((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return filePath ? loadDirectiveFile(filePath, layerId) : [];
  });
  const mergedDirectives = applyLocalAugment(directives, local);
  const filteredDirectives = mergedDirectives
    .filter((directive) => layerMatchesIntent(directive, intent))
    .filter((directive) => scopeMatchesIntent(directive.scope.path, intent.target_file, intent.changed_files));

  const loadedRccl = loadRccl(input.rcclPath);
  const rccl = loadedRccl ? verifyRcclDocument(loadedRccl, input.projectRoot) : null;
  traceSteps.push({
    stage: 'RCCL Verify Gate',
    lines: rccl?.observations.length
      ? rccl.observations.map((observation) => `${observation.id}: ${observation.verification.status}/${observation.verification.disposition}`)
      : ['no rccl loaded'],
  });

  const semanticMergeResult = semanticMerge(filteredDirectives, rccl?.observations ?? [], intent, contextProfile);
  traceSteps.push({
    stage: 'Semantic Merge',
    lines: [
      `activated_directives: ${semanticMergeResult.activated_directives.length}`,
      `suppressed_directives: ${semanticMergeResult.suppressed_directives.length}`,
      `context_tensions: ${semanticMergeResult.context_tensions.length}`,
      `context_influences: ${semanticMergeResult.context_influences.length}`,
    ],
  });

  const ego = assembleEgo(filteredDirectives, rccl?.observations ?? [], intent, contextProfile, semanticMergeResult);
  traceSteps.push({
    stage: 'EGO Assembly',
    lines: [
      `must_follow: ${ego.guidance.must_follow.length}`,
      `avoid: ${ego.guidance.avoid.length}`,
      `context_tensions: ${ego.guidance.context_tensions.length}`,
      `ambient: ${ego.guidance.ambient.length}`,
    ],
  });

  const trace: DecisionTrace = {
    task: intent,
    steps: traceSteps,
    activated_directives: semanticMergeResult.activated_directives,
    suppressed_directives: semanticMergeResult.suppressed_directives,
    directive_decisions: semanticMergeResult.directive_modes,
    observation_links: semanticMergeResult.observation_links,
    context_influences: semanticMergeResult.context_influences,
  };
  const cache = buildCacheKeys(input, selectedLayerIds, rccl);
  const packet: ChangeDecisionPacket = {
    version: 1,
    task_intent: intent,
    context_profile: contextProfile,
    semantic_merge: semanticMergeResult,
    ego,
    trace,
    cache,
  };
  return { packet, ego: packet.ego, trace: packet.trace, cache: packet.cache };
}

/**
 * Applies local suppressions, overrides, augments, and additions to built-in directives.
 */
function applyLocalAugment(directives: Directive[], local: ReturnType<typeof loadLocalPlaybook>): Directive[] {
  if (!local) return directives;
  const suppressed = new Set(local.suppresses.map((item) => item.id));
  const overrideById = new Map(local.overrides.map((item) => [item.id, item]));
  const augmentById = new Map(local.augments.map((item) => [item.id, item]));

  const result = directives
    .filter((directive) => !suppressed.has(directive.id))
    .map((directive) => {
      const override = overrideById.get(directive.id);
      const augment = augmentById.get(directive.id);
      return {
        ...directive,
        prescription: override?.prescription ?? directive.prescription,
        weight: override?.weight ?? directive.weight,
        rationale: override?.rationale ?? directive.rationale,
        exceptions: override?.exceptions ?? directive.exceptions,
        examples: augment ? [...directive.examples, ...augment.examples] : directive.examples,
      };
    });
  return [...result, ...local.additions];
}

function layerMatchesIntent(directive: Directive, intent: CompileOutput['ego']['taskIntent']): boolean {
  const sourceLayer = directive.source.layerId;
  if (sourceLayer === 'builtin/core' || directive.layer.startsWith('local')) return true;
  if (sourceLayer.startsWith('builtin/task-types/')) {
    return sourceLayer.endsWith(`/${intent.operation}`);
  }
  if (sourceLayer.startsWith('builtin/languages/')) {
    return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
  }
  if (sourceLayer.startsWith('builtin/frameworks/')) {
    return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
  }
  return true;
}

function scopeMatchesIntent(scope: string, targetFile: string | undefined, changedFiles: string[]): boolean {
  if (!targetFile && changedFiles.length === 0) return true;
  if (targetFile && minimatch(targetFile, scope)) return true;
  return changedFiles.some((file) => minimatch(file, scope));
}

/**
 * Assembles the final agent-facing guidance object from filtered directives and observations.
 */
function assembleEgo(
  directives: Directive[],
  observations: RcclObservation[],
  intent: CompileOutput['ego']['taskIntent'],
  contextProfile: ChangeDecisionPacket['context_profile'],
  semanticMergeResult: SemanticMergeResult,
): EffectiveGuidanceObject {
  const modeByDirectiveId = new Map(
    semanticMergeResult.directive_modes.map((item) => [item.directive_id, item.execution_mode]),
  );
  const decisionByDirectiveId = new Map(
    semanticMergeResult.directive_modes.map((item) => [item.directive_id, item]),
  );

  const must_follow = directives
    .filter((directive) => directive.type !== 'anti-pattern')
    .sort((a, b) => compareDirectives(a, b, contextProfile, decisionByDirectiveId))
    .map((directive) => ({
      id: directive.id,
      statement: directive.description,
      rationale: directive.rationale,
      prescription: directive.prescription,
      exceptions: directive.exceptions ?? [],
      examples: directive.examples,
      execution_mode: modeByDirectiveId.get(directive.id) ?? 'ambient',
    }));

  const avoid = observations
    .filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files))
    .filter((observation) => observation.category === 'anti-pattern')
    .filter((observation) => observation.verification.disposition !== 'demote-to-ambient')
    .map((observation) => ({
      statement: observation.pattern,
      trigger: `anti-pattern:${observation.id}`,
    }));

  const context_tensions = semanticMergeResult.context_tensions;

  const ambient = observations
    .filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files))
    .filter((observation) => observation.category !== 'anti-pattern')
    .map((observation) => {
      const status = observation.verification.disposition === 'demote-to-ambient' ? 'demoted' : 'observed';
      return `${status}: ${observation.pattern}`;
    });

  return {
    taskIntent: intent,
    guidance: {
      must_follow,
      avoid,
      context_tensions,
      ambient,
    },
  };
}


function compareDirectives(
  a: Directive,
  b: Directive,
  contextProfile: ChangeDecisionPacket['context_profile'],
  decisionByDirectiveId: Map<string, SemanticMergeResult['directive_modes'][number]>,
): number {
  const prescriptionScore = a.prescription === b.prescription ? 0 : a.prescription === 'must' ? -1 : 1;
  if (prescriptionScore !== 0) return prescriptionScore;
  const weights = { low: 0, normal: 1, high: 2, critical: 3 };
  const weightScore = weights[b.weight] - weights[a.weight];
  if (weightScore !== 0) return weightScore;

  const contextAppliedScore = (decisionByDirectiveId.get(b.id)?.context_applied.length ?? 0)
    - (decisionByDirectiveId.get(a.id)?.context_applied.length ?? 0);
  if (contextAppliedScore !== 0) return contextAppliedScore;

  const alignmentScore = scoreDirectiveContextAlignment(b, contextProfile) - scoreDirectiveContextAlignment(a, contextProfile);
  if (alignmentScore !== 0) return alignmentScore;

  return a.id.localeCompare(b.id);
}

function scoreDirectiveContextAlignment(
  directive: Directive,
  contextProfile: ChangeDecisionPacket['context_profile'],
): number {
  const text = `${directive.description} ${directive.rationale}`.toLowerCase();
  let score = 0;
  if (contextProfile.optimization_target === 'safety' && /(safe|safety|correct|compatib|regression|constraint|migration)/.test(text)) {
    score += 2;
  }
  if (contextProfile.optimization_target === 'reviewability' && /(readable|review|clear|legible|simple)/.test(text)) {
    score += 2;
  }
  if (contextProfile.optimization_target === 'simplicity' && /(simple|minimal|small|narrow|focused)/.test(text)) {
    score += 2;
  }
  if (contextProfile.optimization_target === 'maintainability' && /(maintain|structure|refactor|module|boundary)/.test(text)) {
    score += 2;
  }
  if (contextProfile.allowed_tradeoffs.includes('prefer narrow change scope') && /(narrow|local|boundary|focused)/.test(text)) {
    score += 1;
  }
  if (contextProfile.hard_constraints.includes('preserve compatibility') && /(compatib|public api|interface)/.test(text)) {
    score += 1;
  }
  return score;
}

/**
 * Derives stable cache keys for layered inputs and the concrete task payload.
 */
function buildCacheKeys(
  input: CompileInput,
  selectedLayerIds: string[],
  rccl: ReturnType<typeof loadRccl>,
): CompileOutput['cache'] {
  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const builtinFingerprints = selectedLayerIds.map((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return `${layerId}:${filePath ? readFileSync(filePath, 'utf-8').length : 0}`;
  });
  const localSource = input.localAugmentPath ? readFileSync(input.localAugmentPath, 'utf-8') : '';
  const rcclSource = input.rcclPath && rccl
    ? JSON.stringify(rccl.observations.map((item) => [item.id, item.verification.status, item.verification.disposition]))
    : '';
  const l1Key = stableHash(builtinFingerprints);
  const l2Key = stableHash([l1Key, localSource, rcclSource]);
  const l3Key = stableHash([l2Key, input.task]);
  return { l1Key, l2Key, l3Key };
}
