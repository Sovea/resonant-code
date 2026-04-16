import { inferTargetLayer } from '../intent/parse-intent.ts';
import type { CompileTaskInput, ContextProfile, Operation, ResolveTaskRequest, ResolvedTaskOutput, TaskIntent, TaskKind } from '../types.ts';
import { DeterministicInterpretationProvider } from './deterministic-extractor.ts';
import type {
  CandidateField,
  CandidateListField,
  CandidateSummary,
  InputProvenance,
  InterpretationConflict,
  ParsedTaskCandidate,
  ResolveTaskInput,
  RuntimeDiagnostics,
  TaskInterpretationTrace,
} from './types.ts';

const deterministicProvider = new DeterministicInterpretationProvider();

export function resolveTask(input: ResolveTaskRequest): ResolvedTaskOutput {
  const deterministicCandidate = deterministicProvider.interpret(input.task);
  const candidates = [...(input.candidates ?? []), deterministicCandidate];
  const conflicts: InterpretationConflict[] = [];

  const taskKindResolution = resolveField<TaskKind>({
    field: 'intent.task_kind',
    explicitValue: input.taskKind ?? input.task.taskKind,
    candidates: candidates.map((candidate) => candidate.intent.task_kind),
    fallbackValue: deterministicCandidate.intent.task_kind?.value ?? 'code',
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.intent.task_kind?.confidence ?? 0.85,
    conflicts,
  });

  const operationResolution = resolveField<Operation>({
    field: 'intent.operation',
    explicitValue: input.task.operation,
    candidates: candidates.map((candidate) => candidate.intent.operation),
    fallbackValue: deterministicCandidate.intent.operation?.value ?? 'modify',
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.intent.operation?.confidence ?? 0.5,
    conflicts,
  });

  const targetFileResolution = resolveField<string>({
    field: 'intent.target_file',
    explicitValue: input.task.targetFile,
    candidates: candidates.map((candidate) => candidate.intent.target_file),
    fallbackValue: deterministicCandidate.intent.target_file?.value,
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.intent.target_file?.confidence ?? 0.65,
    conflicts,
  });

  const changedFilesResolution = resolveListField<string>({
    field: 'intent.changed_files',
    explicitValues: input.task.changedFiles,
    candidates: candidates.map((candidate) => candidate.intent.changed_files),
    fallbackValues: deterministicCandidate.intent.changed_files?.values ?? [],
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.intent.changed_files?.confidence ?? 0.2,
    conflicts,
  });

  const techStackResolution = resolveListField<string>({
    field: 'intent.tech_stack',
    explicitValues: input.task.techStack,
    candidates: candidates.map((candidate) => candidate.intent.tech_stack),
    fallbackValues: deterministicCandidate.intent.tech_stack?.values ?? [],
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.intent.tech_stack?.confidence ?? 0.3,
    conflicts,
  });

  const tagsResolution = resolveListField<string>({
    field: 'intent.tags',
    explicitValues: input.task.tags,
    candidates: candidates.map((candidate) => candidate.intent.tags),
    fallbackValues: deterministicCandidate.intent.tags?.values ?? [],
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.intent.tags?.confidence ?? 0.3,
    conflicts,
  });

  const projectStageResolution = resolveField<ContextProfile['project_stage']>({
    field: 'context.project_stage',
    explicitValue: input.task.projectStage,
    candidates: candidates.map((candidate) => candidate.context.project_stage),
    fallbackValue: deterministicCandidate.context.project_stage?.value,
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.context.project_stage?.confidence ?? 0.5,
    conflicts,
  });

  const optimizationTargetResolution = resolveField<ContextProfile['optimization_target']>({
    field: 'context.optimization_target',
    explicitValue: input.task.optimizationTarget,
    candidates: candidates.map((candidate) => candidate.context.optimization_target),
    fallbackValue: deterministicCandidate.context.optimization_target?.value,
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.context.optimization_target?.confidence ?? 0.55,
    conflicts,
  });

  const hardConstraintsResolution = resolveListField<string>({
    field: 'context.hard_constraints',
    explicitValues: input.task.hardConstraints,
    candidates: candidates.map((candidate) => candidate.context.hard_constraints),
    fallbackValues: deterministicCandidate.context.hard_constraints?.values ?? [],
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.context.hard_constraints?.confidence ?? 0.2,
    conflicts,
  });

  const allowedTradeoffsResolution = resolveListField<string>({
    field: 'context.allowed_tradeoffs',
    explicitValues: input.task.allowedTradeoffs,
    candidates: candidates.map((candidate) => candidate.context.allowed_tradeoffs),
    fallbackValues: deterministicCandidate.context.allowed_tradeoffs?.values ?? [],
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.context.allowed_tradeoffs?.confidence ?? 0.2,
    conflicts,
  });

  const avoidResolution = resolveListField<string>({
    field: 'context.avoid',
    explicitValues: input.task.avoid,
    candidates: candidates.map((candidate) => candidate.context.avoid),
    fallbackValues: deterministicCandidate.context.avoid?.values ?? [],
    defaultSource: 'deterministic',
    defaultConfidence: deterministicCandidate.context.avoid?.confidence ?? 0.2,
    conflicts,
  });

  const task: CompileTaskInput = {
    description: input.task.description,
    taskKind: taskKindResolution.value,
    operation: operationResolution.value,
    targetFile: targetFileResolution.value,
    changedFiles: changedFilesResolution.values,
    techStack: techStackResolution.values,
    tags: tagsResolution.values,
    projectStage: projectStageResolution.value,
    optimizationTarget: optimizationTargetResolution.value,
    hardConstraints: hardConstraintsResolution.values,
    allowedTradeoffs: allowedTradeoffsResolution.values,
    avoid: avoidResolution.values,
  };

  const resolvedTargetFile = targetFileResolution.value;
  const intent: TaskIntent = {
    task_kind: taskKindResolution.value,
    operation: operationResolution.value,
    target_layer: inferTargetLayer(resolvedTargetFile),
    tech_stack: unique(techStackResolution.values),
    target_file: resolvedTargetFile,
    changed_files: unique(changedFilesResolution.values),
    tags: unique(tagsResolution.values),
  };

  const contextProfile: ContextProfile = {
    project_stage: projectStageResolution.value,
    change_type: operationResolution.value,
    optimization_target: optimizationTargetResolution.value,
    hard_constraints: unique(hardConstraintsResolution.values),
    allowed_tradeoffs: unique(allowedTradeoffsResolution.values),
    avoid: unique(avoidResolution.values),
  };

  const provenance = buildProvenance(input, {
    task_kind: taskKindResolution,
    operation: operationResolution,
    target_file: targetFileResolution,
    changed_files: changedFilesResolution,
    tech_stack: techStackResolution,
    tags: tagsResolution,
    project_stage: projectStageResolution,
    optimization_target: optimizationTargetResolution,
    hard_constraints: hardConstraintsResolution,
    allowed_tradeoffs: allowedTradeoffsResolution,
    avoid: avoidResolution,
  });
  const trace = buildTrace(input, candidates, provenance, conflicts);
  const diagnostics = buildDiagnostics(input, candidates, provenance, conflicts);

  return {
    task,
    taskKind: taskKindResolution.value,
    candidates,
    task_intent: intent,
    context_profile: contextProfile,
    input_provenance: provenance,
    diagnostics,
    trace,
  };
}

export const resolveTaskInput = resolveTask;

type ScalarResolution<T> = {
  value: T;
  source: CandidateField<T>['source'];
  confidence: number;
  status: 'resolved';
};

type ListResolution<T> = {
  values: T[];
  source: CandidateListField<T>['source'];
  confidence: number;
  status: 'resolved' | 'unresolved';
};

function resolveField<T>({
  field,
  explicitValue,
  candidates,
  fallbackValue,
  defaultSource,
  defaultConfidence,
  conflicts,
}: {
  field: string;
  explicitValue: T | undefined;
  candidates: Array<CandidateField<T> | undefined>;
  fallbackValue: T | undefined;
  defaultSource: CandidateField<T>['source'];
  defaultConfidence: number;
  conflicts: InterpretationConflict[];
}): ScalarResolution<T> {
  const resolvedCandidates = candidates.filter((candidate): candidate is CandidateField<T> => candidate !== undefined && candidate.status === 'resolved' && candidate.value !== undefined);
  if (explicitValue !== undefined) {
    registerConflict(field, 'explicit', resolvedCandidates.map((candidate) => candidate.source), conflicts, 'explicit task input takes precedence');
    return { value: explicitValue, source: 'explicit', confidence: 1, status: 'resolved' };
  }
  if (resolvedCandidates.length > 0) {
    const winner = resolvedCandidates[0];
    registerConflict(field, winner.source, resolvedCandidates.slice(1).map((candidate) => candidate.source), conflicts, 'first resolved candidate wins based on provider ordering');
    return { value: winner.value as T, source: winner.source, confidence: winner.confidence, status: 'resolved' };
  }
  return { value: fallbackValue as T, source: defaultSource, confidence: defaultConfidence, status: 'resolved' };
}

function resolveListField<T>({
  field,
  explicitValues,
  candidates,
  fallbackValues,
  defaultSource,
  defaultConfidence,
  conflicts,
}: {
  field: string;
  explicitValues: T[] | undefined;
  candidates: Array<CandidateListField<T> | undefined>;
  fallbackValues: T[];
  defaultSource: CandidateListField<T>['source'];
  defaultConfidence: number;
  conflicts: InterpretationConflict[];
}): ListResolution<T> {
  if (explicitValues?.length) {
    registerConflict(field, 'explicit', candidates.filter(Boolean).map((candidate) => candidate?.source ?? 'deterministic'), conflicts, 'explicit task input takes precedence');
    return { values: unique(explicitValues), source: 'explicit', confidence: 1, status: 'resolved' };
  }
  const resolvedCandidates = candidates.filter((candidate): candidate is CandidateListField<T> => candidate !== undefined && candidate.status === 'resolved' && candidate.values.length > 0);
  if (resolvedCandidates.length > 0) {
    const winner = resolvedCandidates[0];
    registerConflict(field, winner.source, resolvedCandidates.slice(1).map((candidate) => candidate.source), conflicts, 'first resolved candidate wins based on provider ordering');
    return { values: unique(winner.values), source: winner.source, confidence: winner.confidence, status: 'resolved' };
  }
  const fallback = unique(fallbackValues);
  return {
    values: fallback,
    source: defaultSource,
    confidence: defaultConfidence,
    status: fallback.length ? 'resolved' : 'unresolved',
  };
}

function buildProvenance(
  input: ResolveTaskInput,
  resolved: {
    task_kind: ScalarResolution<TaskKind>;
    operation: ScalarResolution<Operation>;
    target_file: ScalarResolution<string | undefined>;
    changed_files: ListResolution<string>;
    tech_stack: ListResolution<string>;
    tags: ListResolution<string>;
    project_stage: ScalarResolution<ContextProfile['project_stage'] | undefined>;
    optimization_target: ScalarResolution<ContextProfile['optimization_target']>;
    hard_constraints: ListResolution<string>;
    allowed_tradeoffs: ListResolution<string>;
    avoid: ListResolution<string>;
  },
): InputProvenance {
  const resolved_fields = [
    summarizeScalarField('intent.task_kind', resolved.task_kind),
    summarizeScalarField('intent.operation', resolved.operation),
    summarizeScalarField('intent.target_file', resolved.target_file),
    summarizeListField('intent.changed_files', resolved.changed_files),
    summarizeListField('intent.tech_stack', resolved.tech_stack),
    summarizeListField('intent.tags', resolved.tags),
    summarizeScalarField('context.project_stage', resolved.project_stage),
    summarizeScalarField('context.optimization_target', resolved.optimization_target),
    summarizeListField('context.hard_constraints', resolved.hard_constraints),
    summarizeListField('context.allowed_tradeoffs', resolved.allowed_tradeoffs),
    summarizeListField('context.avoid', resolved.avoid),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const unresolved_fields = [
    ...(resolved.target_file.value ? [] : ['intent.target_file']),
    ...(resolved.project_stage.value ? [] : ['context.project_stage']),
  ];

  return {
    resolved_fields,
    unresolved_fields,
    interpretation_mode: input.interpretationMode ?? (input.candidates?.length ? 'assistive-ai' : 'deterministic-only'),
    resolution_quality: determineResolutionQuality(resolved_fields),
  };
}

function buildTrace(
  input: ResolveTaskInput,
  candidates: ParsedTaskCandidate[],
  provenance: InputProvenance,
  conflicts: InterpretationConflict[],
): TaskInterpretationTrace {
  const candidate_summaries: CandidateSummary[] = candidates.map((candidate) => summarizeCandidate(candidate));
  return {
    mode: provenance.interpretation_mode,
    candidate_summaries,
    conflicts,
    selected_sources: provenance.resolved_fields.map((field) => ({
      field: field.field,
      source: field.source,
      confidence: field.confidence,
    })),
  };
}

function buildDiagnostics(
  input: ResolveTaskInput,
  candidates: ParsedTaskCandidate[],
  provenance: InputProvenance,
  conflicts: InterpretationConflict[],
): RuntimeDiagnostics {
  const ambiguity_reasons = [
    ...candidates.flatMap((candidate) => candidate.uncertainties ?? []),
    ...provenance.unresolved_fields.map((item) => `${item} unresolved`),
    ...conflicts.map((conflict) => `conflicting candidates for ${conflict.field}`),
  ];

  return {
    warnings: ambiguity_reasons.map((item) => `interpretation warning: ${item}`),
    fallback_usage: {
      used_deterministic_interpretation: provenance.resolved_fields.some((field) => field.source === 'deterministic'),
      used_candidate_normalization: Boolean(input.candidates?.length),
    },
    clarification_recommended: ambiguity_reasons.length > 0 && (!input.candidates?.length || conflicts.length > 0),
    ambiguity_reasons,
  };
}

function summarizeCandidate(candidate: ParsedTaskCandidate): CandidateSummary {
  const scalarFields = [
    ['intent.task_kind', candidate.intent.task_kind],
    ['intent.operation', candidate.intent.operation],
    ['intent.target_layer', candidate.intent.target_layer],
    ['intent.target_file', candidate.intent.target_file],
    ['context.project_stage', candidate.context.project_stage],
    ['context.change_type', candidate.context.change_type],
    ['context.optimization_target', candidate.context.optimization_target],
  ] as const;
  const listFields = [
    ['intent.tech_stack', candidate.intent.tech_stack],
    ['intent.changed_files', candidate.intent.changed_files],
    ['intent.tags', candidate.intent.tags],
    ['context.hard_constraints', candidate.context.hard_constraints],
    ['context.allowed_tradeoffs', candidate.context.allowed_tradeoffs],
    ['context.avoid', candidate.context.avoid],
  ] as const;

  const resolved_fields = [
    ...scalarFields.filter(([, field]) => field?.status === 'resolved').map(([name]) => name),
    ...listFields.filter(([, field]) => field?.status === 'resolved' && field.values.length > 0).map(([name]) => name),
  ];
  const unresolved_fields = [
    ...scalarFields.filter(([, field]) => !field || field.status !== 'resolved').map(([name]) => name),
    ...listFields.filter(([, field]) => !field || field.status !== 'resolved' || field.values.length === 0).map(([name]) => name),
  ];
  const source = candidate.intent.task_kind?.source
    ?? candidate.intent.operation?.source
    ?? candidate.intent.target_file?.source
    ?? candidate.context.optimization_target?.source
    ?? 'deterministic';
  const confidenceValues = [
    candidate.intent.task_kind?.confidence,
    candidate.intent.operation?.confidence,
    candidate.intent.target_layer?.confidence,
    candidate.intent.target_file?.confidence,
    candidate.intent.tech_stack?.confidence,
    candidate.intent.changed_files?.confidence,
    candidate.intent.tags?.confidence,
    candidate.context.project_stage?.confidence,
    candidate.context.change_type?.confidence,
    candidate.context.optimization_target?.confidence,
    candidate.context.hard_constraints?.confidence,
    candidate.context.allowed_tradeoffs?.confidence,
    candidate.context.avoid?.confidence,
  ].filter((value): value is number => typeof value === 'number');
  const confidence = confidenceValues.length
    ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2))
    : 0;

  return {
    source,
    confidence,
    resolved_fields,
    unresolved_fields,
  };
}

function summarizeScalarField<T>(field: string, resolved: ScalarResolution<T | undefined>) {
  if (resolved.value === undefined) return null;
  return { field, source: resolved.source, confidence: resolved.confidence };
}

function summarizeListField<T>(field: string, resolved: ListResolution<T>) {
  if (!resolved.values.length) return null;
  return { field, source: resolved.source, confidence: resolved.confidence };
}

function determineResolutionQuality(resolvedFields: InputProvenance['resolved_fields']): InputProvenance['resolution_quality'] {
  if (resolvedFields.every((field) => field.source === 'explicit')) return 'explicit';
  if (resolvedFields.some((field) => field.source === 'assistive-ai')) return 'ai-assisted';
  if (resolvedFields.some((field) => field.source === 'deterministic')) return 'deterministic';
  return 'degraded';
}

function registerConflict(
  field: string,
  winner: CandidateField<unknown>['source'] | CandidateListField<unknown>['source'],
  discarded: Array<CandidateField<unknown>['source'] | CandidateListField<unknown>['source']>,
  conflicts: InterpretationConflict[],
  rationale: string,
) {
  const uniqueDiscarded = [...new Set(discarded.filter((source) => source !== winner))];
  if (!uniqueDiscarded.length) return;
  conflicts.push({ field, winner, discarded: uniqueDiscarded, rationale });
}

function unique<T>(values: T[]): T[] {
  return [...new Set((values ?? []).filter((value) => value !== undefined && value !== null))];
}
