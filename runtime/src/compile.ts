import { readFileSync } from 'node:fs';
import { resolveTask } from './interpret/normalize-candidate.ts';
import { semanticMerge } from './merge/semantic-merge.ts';
import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from './load/load-playbook.ts';
import { loadRccl } from './load/load-rccl.ts';
import { buildActivationPlan, getDirectiveLayerRank, scopeMatchesIntent } from './select/activation-plan.ts';
import { verifyRcclDocument } from './verify/verify-rccl.ts';
import { stableHash } from './utils/hash.ts';
import type {
  ChangeDecisionPacket,
  CompileInput,
  CompileOutput,
  ContextProfile,
  DecisionTrace,
  Directive,
  EffectiveGuidanceObject,
  FocusView,
  GovernancePacket,
  InterpretationPacket,
  RcclDocument,
  RcclObservation,
  ResolvedCompileInput,
  ResolvedTaskOutput,
  ReviewFocusItem,
  SemanticMergeResult,
  TaskIntent,
  TensionView,
  TraceStep,
} from './types.ts';

function hasResolvedTask(input: CompileInput): input is ResolvedCompileInput {
  return 'resolvedTask' in input;
}

function toResolvedCompileInput(input: CompileInput): ResolvedCompileInput {
  if (hasResolvedTask(input)) return input;
  return {
    builtinRoot: input.builtinRoot,
    localAugmentPath: input.localAugmentPath,
    rcclPath: input.rcclPath,
    projectRoot: input.projectRoot,
    lockfilePath: input.lockfilePath,
    resolvedTask: resolveTask({
      task: input.task,
      candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
      interpretationMode: input.interpretationMode,
    }),
  };
}

function buildInterpretationPacket(resolved: ResolvedTaskOutput): InterpretationPacket {
  return {
    candidates: resolved.candidates,
    input_provenance: resolved.input_provenance,
    diagnostics: resolved.diagnostics,
    trace: resolved.trace,
    resolved: {
      task_intent: resolved.task_intent,
      context_profile: resolved.context_profile,
    },
  };
}

function buildGovernancePacket(
  activation: DecisionTrace['activation'],
  tensions: TensionView,
  focus: FocusView,
  semantic_merge: SemanticMergeResult,
  ego: EffectiveGuidanceObject,
  trace: DecisionTrace,
): GovernancePacket {
  return { activation, tensions, focus, semantic_merge, ego, trace };
}

function compileResolvedOutput(packet: ChangeDecisionPacket, resolvedTask: ResolvedTaskOutput): CompileOutput {
  return {
    packet,
    resolvedTask,
    ego: packet.governance.ego,
    trace: packet.governance.trace,
    cache: packet.cache,
  };
}

/**
 * Runs the deterministic playbook pipeline and produces a change decision packet.
 */
export async function compile(input: CompileInput): Promise<CompileOutput> {
  const normalizedInput = toResolvedCompileInput(input);
  const resolved = normalizedInput.resolvedTask;
  const traceSteps: TraceStep[] = [];
  const intent = resolved.task_intent;
  const contextProfile = resolved.context_profile;

  traceSteps.push({
    stage: 'Intent Parse',
    lines: [
      `interpretation_mode: ${resolved.input_provenance.interpretation_mode}`,
      `resolved_fields: ${resolved.input_provenance.resolved_fields.length}`,
      `unresolved_fields: ${resolved.input_provenance.unresolved_fields.join(', ') || '(none)'}`,
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

  const builtinLayers = discoverBuiltinLayers(normalizedInput.builtinRoot);
  const local = loadLocalPlaybook(normalizedInput.localAugmentPath);
  const selectedLayerIds = local?.meta.extends.length
    ? resolveExtendedLayers(local.meta.extends, builtinLayers)
    : ['builtin/core'];

  const directives = selectedLayerIds.flatMap((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return filePath ? loadDirectiveFile(filePath, layerId) : [];
  });
  const activationPlan = buildActivationPlan(directives, local, selectedLayerIds, intent);
  const activeDirectives = materializeActivatedDirectives(directives, local, activationPlan);

  traceSteps.push({
    stage: 'Layer Filter',
    lines: [
      ...(activationPlan.selected_layers.length
        ? activationPlan.selected_layers.map((layerId) => `applied ${layerId}`)
        : ['applied builtin/core']),
      `activated: ${activationPlan.activated.length}`,
      `skipped: ${activationPlan.skipped.length}`,
    ],
  });

  const loadedRccl = await loadRccl(normalizedInput.rcclPath);
  const rccl = loadedRccl ? await verifyRcclDocument(loadedRccl, normalizedInput.projectRoot) : null;
  traceSteps.push({
    stage: 'RCCL Verify Gate',
    lines: rccl?.observations.length
      ? rccl.observations.map((observation) => {
          const evidenceStatus = observation.verification.evidence_status ?? 'pending';
          const inductionStatus = observation.verification.induction_status ?? 'pending';
          const disposition = observation.verification.disposition ?? 'pending';
          return `${observation.id}: evidence=${evidenceStatus} induction=${inductionStatus} disposition=${disposition} support=${observation.support.scope_basis}/${observation.support.file_count}f/${observation.support.cluster_count}c`;
        })
      : ['no rccl loaded'],
  });

  const semanticMergeResult = semanticMerge(activeDirectives, rccl?.observations ?? [], intent, contextProfile);
  const tensions: TensionView = { records: semanticMergeResult.context_tensions };
  const focus = buildFocusView(semanticMergeResult, activeDirectives);

  traceSteps.push({
    stage: 'Semantic Merge',
    lines: [
      `activated_directives: ${semanticMergeResult.activated_directives.length}`,
      `suppressed_directives: ${semanticMergeResult.suppressed_directives.length}`,
      `relations: ${semanticMergeResult.relations.length}`,
      `context_tensions: ${semanticMergeResult.context_tensions.length}`,
      `review_focus: ${focus.review_focus.length}`,
      `context_influences: ${semanticMergeResult.context_influences.length}`,
    ],
  });

  const ego = assembleEgo(activeDirectives, rccl?.observations ?? [], intent, contextProfile, semanticMergeResult);
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
    activation: activationPlan,
    tensions,
    review_focus: focus.review_focus,
    directive_decisions: semanticMergeResult.directive_modes,
    observation_links: semanticMergeResult.observation_links,
    context_influences: semanticMergeResult.context_influences,
  };

  const cache = buildCacheKeys({
    builtinRoot: normalizedInput.builtinRoot,
    localAugmentPath: normalizedInput.localAugmentPath,
    rcclPath: normalizedInput.rcclPath,
    task: resolved.task,
  }, selectedLayerIds, rccl);

  const packet: ChangeDecisionPacket = {
    version: 2,
    task: {
      task_kind: resolved.taskKind,
      input: resolved.task,
    },
    interpretation: buildInterpretationPacket(resolved),
    governance: buildGovernancePacket(activationPlan, tensions, focus, semanticMergeResult, ego, trace),
    cache,
  };

  return compileResolvedOutput(packet, resolved);
}

function materializeActivatedDirectives(
  builtinDirectives: Directive[],
  local: ReturnType<typeof loadLocalPlaybook>,
  activationPlan: DecisionTrace['activation'],
): Directive[] {
  const directiveById = new Map([...builtinDirectives, ...(local?.additions ?? [])].map((directive) => [directive.id, directive]));
  const overrideById = new Map(local?.overrides.map((item) => [item.id, item]) ?? []);
  const augmentById = new Map(local?.augments.map((item) => [item.id, item]) ?? []);

  return activationPlan.activated.flatMap((item) => {
    const directive = directiveById.get(item.directive_id);
    if (!directive) return [];
    const override = overrideById.get(directive.id);
    const augment = augmentById.get(directive.id);
    return [{
      ...directive,
      prescription: override?.prescription ?? directive.prescription,
      weight: override?.weight ?? directive.weight,
      rationale: override?.rationale ?? directive.rationale,
      exceptions: override?.exceptions ?? directive.exceptions,
      examples: augment ? [...directive.examples, ...augment.examples] : directive.examples,
    }];
  });
}

function buildFocusView(semanticMergeResult: SemanticMergeResult, directives: Directive[]): FocusView {
  const directiveById = new Map(directives.map((directive) => [directive.id, directive]));
  const review_focus: ReviewFocusItem[] = semanticMergeResult.focus.review_focus.map((item) => {
    const directive = item.directive_id ? directiveById.get(item.directive_id) : undefined;
    return {
      kind: item.kind,
      title: buildFocusTitle(item.kind, directive?.description, item.directive_id, item.observation_id),
      reason: item.reason,
      directive_id: item.directive_id,
      observation_id: item.observation_id,
    };
  });
  return { review_focus };
}

function buildFocusTitle(
  kind: ReviewFocusItem['kind'],
  directiveDescription: string | undefined,
  directiveId: string | undefined,
  observationId: string | undefined,
): string {
  const directiveLabel = directiveDescription ?? directiveId ?? 'directive';
  switch (kind) {
    case 'tension':
      return `Review tension around ${directiveLabel}`;
    case 'anti-pattern':
      return `Check anti-pattern suppression for ${observationId ?? directiveLabel}`;
    case 'high-priority-directive':
      return `Confirm high-priority guidance for ${directiveLabel}`;
    case 'compatibility-boundary':
      return `Inspect compatibility boundary for ${directiveLabel}`;
  }
}

/**
 * Assembles the final agent-facing guidance object from filtered directives and observations.
 */
function assembleEgo(
  directives: Directive[],
  observations: RcclObservation[],
  intent: TaskIntent,
  contextProfile: ContextProfile,
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
  _contextProfile: ContextProfile,
  decisionByDirectiveId: Map<string, SemanticMergeResult['directive_modes'][number]>,
): number {
  const layerScore = getDirectiveLayerRank(b.source.layerId) - getDirectiveLayerRank(a.source.layerId);
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

/**
 * Derives stable cache keys for layered inputs and the concrete task payload.
 */
function buildCacheKeys(
  input: Pick<ResolvedCompileInput, 'builtinRoot' | 'localAugmentPath' | 'rcclPath'> & { task: ResolvedTaskOutput['task'] },
  selectedLayerIds: string[],
  rccl: RcclDocument | null,
): CompileOutput['cache'] {
  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const builtinFingerprints = selectedLayerIds.map((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return `${layerId}:${filePath ? readFileSync(filePath, 'utf-8').length : 0}`;
  });
  const localSource = input.localAugmentPath ? readFileSync(input.localAugmentPath, 'utf-8') : '';
  const rcclSource = input.rcclPath && rccl
    ? JSON.stringify(rccl.observations.map((item) => [item.id, item.verification.evidence_status, item.verification.disposition]))
    : '';
  const l1Key = stableHash(builtinFingerprints);
  const l2Key = stableHash([l1Key, localSource, rcclSource]);
  const l3Key = stableHash([l2Key, input.task]);
  return { l1Key, l2Key, l3Key };
}

export { resolveTask } from './interpret/normalize-candidate.ts';
