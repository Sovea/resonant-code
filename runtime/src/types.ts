import type {
  InputProvenance,
  ParsedTaskCandidate,
  ResolveTaskInput as RuntimeResolveTaskInput,
  RuntimeDiagnostics,
  TaskInterpretationTrace,
} from './interpret/types.ts';

export type TaskKind = 'code' | 'review' | 'analysis' | 'migration';
export type Operation = 'create' | 'modify' | 'review' | 'refactor' | 'bugfix';
export type Prescription = 'must' | 'should';
export type Weight = 'low' | 'normal' | 'high' | 'critical';
export type DirectiveType = 'constraint' | 'preference' | 'convention' | 'architecture' | 'anti-pattern';
export type AdherenceQuality = 'good' | 'inconsistent' | 'poor';
export type VerificationStatus = 'pending' | 'verified' | 'partial' | 'failed' | 'unverifiable';
export type VerificationDisposition = 'keep' | 'keep-with-reduced-confidence' | 'demote-to-ambient';
export type InductionStatus = 'well-supported' | 'narrowly-supported' | 'overgeneralized' | 'ambiguous';
export type ScopeBasis = 'single-file' | 'directory-cluster' | 'module-cluster' | 'cross-root';
export type ExecutionMode = 'enforce' | 'deviation-noted' | 'ambient' | 'suppress';

export interface DirectiveExampleSide {
  code: string;
}

export interface DirectiveExample {
  avoid?: DirectiveExampleSide;
  good?: DirectiveExampleSide;
  note: string;
}

export interface DirectiveScope {
  path: string;
}

export interface Directive {
  id: string;
  type: DirectiveType;
  layer: string;
  scope: DirectiveScope;
  prescription: Prescription;
  weight: Weight;
  description: string;
  rationale: string;
  exceptions?: string[];
  examples: DirectiveExample[];
  rccl_immune?: boolean;
  source: {
    kind: 'builtin' | 'local-addition';
    layerId: string;
    filePath: string;
  };
}

export interface RcclObservation {
  id: string;
  semantic_key: string;
  category: 'style' | 'architecture' | 'pattern' | 'constraint' | 'legacy' | 'anti-pattern' | 'migration';
  scope: string;
  pattern: string;
  confidence: number;
  adherence_quality: AdherenceQuality;
  evidence: RcclEvidence[];
  support: RcclSupport;
  verification: RcclVerification;
}

export interface RcclDocument {
  version: string;
  generated_at: string | null;
  git_ref: string | null;
  observations: RcclObservation[];
}

export interface TaskIntent {
  task_kind: TaskKind;
  operation: Operation;
  target_layer: string;
  tech_stack: string[];
  target_file?: string;
  changed_files: string[];
  tags: string[];
}

export interface ContextProfile {
  project_stage?: 'prototype' | 'growth' | 'stable' | 'critical';
  change_type: Operation;
  optimization_target: 'speed' | 'maintainability' | 'safety' | 'simplicity' | 'reviewability';
  hard_constraints: string[];
  allowed_tradeoffs: string[];
  avoid: string[];
}

export interface LocalOverride {
  id: string;
  prescription?: Prescription;
  weight?: Weight;
  rationale?: string;
  exceptions?: string[];
}

export interface LocalAugment {
  id: string;
  examples: DirectiveExample[];
}

export interface LocalSuppress {
  id: string;
  reason: string;
}

export interface LocalPlaybook {
  version: string;
  meta: {
    name?: string;
    extends: string[];
  };
  overrides: LocalOverride[];
  augments: LocalAugment[];
  suppresses: LocalSuppress[];
  additions: Directive[];
}

export interface RcclEvidence {
  file: string;
  line_range: [number, number];
  snippet: string;
}

export interface RcclSupport {
  source_slices: string[];
  file_count: number;
  cluster_count: number;
  scope_basis: ScopeBasis;
}

export interface RcclVerification {
  evidence_status: VerificationStatus | null;
  evidence_verified_count: number | null;
  evidence_confidence: number | null;
  induction_status: InductionStatus | null;
  induction_confidence: number | null;
  checked_at: string | null;
  disposition: VerificationDisposition | null;
}

export interface BaseTaskInput {
  description: string;
  taskKind?: TaskKind;
  tags?: string[];
  projectStage?: ContextProfile['project_stage'];
  optimizationTarget?: ContextProfile['optimization_target'];
  hardConstraints?: string[];
  allowedTradeoffs?: string[];
  avoid?: string[];
}

export interface CompileTaskInput extends BaseTaskInput {
  operation?: Operation;
  targetFile?: string;
  changedFiles?: string[];
  techStack?: string[];
}

export interface ReviewTaskInput extends BaseTaskInput {
  reviewScope?: string;
  diffPaths?: string[];
  focusAreas?: string[];
  riskProfile?: 'low' | 'medium' | 'high';
}

export interface ResolveTaskInput extends RuntimeResolveTaskInput {}

export interface CompileInputBase {
  builtinRoot: string;
  localAugmentPath?: string;
  rcclPath?: string;
  projectRoot: string;
  lockfilePath?: string;
}

export interface LegacyCompileInput extends CompileInputBase {
  task: CompileTaskInput;
  parsedTaskCandidate?: ParsedTaskCandidate;
  interpretationMode?: InputProvenance['interpretation_mode'];
}

export interface ResolveTaskRequest {
  task: CompileTaskInput;
  taskKind?: TaskKind;
  candidates?: ParsedTaskCandidate[];
  interpretationMode?: InputProvenance['interpretation_mode'];
}

export interface ResolvedCompileInput extends CompileInputBase {
  resolvedTask: ResolvedTaskOutput;
}

export type CompileInput = LegacyCompileInput | ResolvedCompileInput;

export interface InterpretationPacket {
  candidates?: ParsedTaskCandidate[];
  input_provenance: InputProvenance;
  diagnostics: RuntimeDiagnostics;
  trace: TaskInterpretationTrace;
  resolved: {
    task_intent: TaskIntent;
    context_profile: ContextProfile;
  };
}

export interface GovernancePacket {
  activation: ActivationView;
  tensions: TensionView;
  focus: FocusView;
  semantic_merge: SemanticMergeResult;
  ego: EffectiveGuidanceObject;
  trace: DecisionTrace;
}

export interface DirectivePriorityRecord {
  layer_rank: number;
  prescription_rank: number;
  weight_rank: number;
  context_rank: number;
}

export interface ActivatedDirective {
  directive_id: string;
  layer_id: string;
  source_file: string;
  effective_prescription: Prescription;
  effective_weight: Weight;
  effective_priority: DirectivePriorityRecord;
  activation_reason: string;
  override_applied: boolean;
  augment_applied: boolean;
}

export interface SkippedDirective {
  directive_id: string;
  layer_id: string;
  reason: 'suppressed-by-local' | 'layer-mismatch' | 'scope-mismatch';
  note: string;
}

export interface ActivationPlan {
  selected_layers: string[];
  activated: ActivatedDirective[];
  skipped: SkippedDirective[];
}

export interface ActivationView {
  selected_layers: string[];
  activated: ActivatedDirective[];
  skipped: SkippedDirective[];
}

export interface TensionRecord extends ContextTension {
  observation_id?: string;
  category?: RcclObservation['category'];
}

export interface TensionView {
  records: TensionRecord[];
}

export interface ReviewFocusItem {
  kind: 'tension' | 'anti-pattern' | 'high-priority-directive' | 'compatibility-boundary';
  title: string;
  reason: string;
  directive_id?: string;
  observation_id?: string;
}

export interface FocusView {
  review_focus: ReviewFocusItem[];
}

export interface GuidanceDirective {
  id: string;
  statement: string;
  rationale: string;
  prescription: Prescription;
  exceptions: string[];
  examples: DirectiveExample[];
  execution_mode: ExecutionMode;
}

export interface AvoidEntry {
  statement: string;
  trigger: string;
}

export interface ContextTension {
  directive_id: string;
  execution_mode: ExecutionMode;
  conflict: string;
  resolution: string;
  rccl_confidence: number;
}

export interface EffectiveGuidanceObject {
  taskIntent: TaskIntent;
  guidance: {
    must_follow: GuidanceDirective[];
    avoid: AvoidEntry[];
    context_tensions: ContextTension[];
    ambient: string[];
  };
}

export interface TraceStep {
  stage: string;
  lines: string[];
}

export interface DecisionTrace {
  task: TaskIntent;
  steps: TraceStep[];
  activated_directives: string[];
  suppressed_directives: string[];
  activation: ActivationView;
  tensions: TensionView;
  review_focus: ReviewFocusItem[];
  directive_decisions: SemanticMergeDirectiveLink[];
  observation_links: Array<{
    observation_id: string;
    directive_ids: string[];
  }>;
  context_influences: ContextInfluenceRecord[];
}

export type RelationKind = 'reinforce' | 'tension' | 'anti-pattern-suppress' | 'ambient-only' | 'none';

export interface DirectiveObservationRelation {
  directive_id: string;
  observation_id: string;
  relation: RelationKind;
  confidence: number;
  basis: Array<'scope' | 'verification' | 'category' | 'lexical' | 'context'>;
  reason: string;
}

export interface ReviewFocusSeed {
  kind: ReviewFocusItem['kind'];
  directive_id?: string;
  observation_id?: string;
  reason: string;
}

export interface SemanticMergeContextFocus {
  review_focus: ReviewFocusSeed[];
}

export interface SemanticMergeTensionRecord extends TensionRecord {}

export interface ContextInfluenceRecord {
  field: 'optimization_target' | 'hard_constraints' | 'allowed_tradeoffs' | 'avoid' | 'project_stage';
  value: string;
  directive_id?: string;
  effect: string;
}

export interface SemanticMergeDirectiveLink {
  directive_id: string;
  observation_ids: string[];
  execution_mode: ExecutionMode;
  default_execution_mode: ExecutionMode;
  reason: string;
  decision_basis: 'default' | 'observed-conflict' | 'anti-pattern' | 'rccl-immune' | 'context-adjusted';
  context_applied: string[];
}

export interface SemanticMergeObservationLink {
  observation_id: string;
  directive_ids: string[];
}

export interface SemanticMergeResult {
  activated_directives: string[];
  suppressed_directives: string[];
  context_tensions: SemanticMergeTensionRecord[];
  directive_modes: SemanticMergeDirectiveLink[];
  observation_links: SemanticMergeObservationLink[];
  relations: DirectiveObservationRelation[];
  focus: SemanticMergeContextFocus;
  context_influences: ContextInfluenceRecord[];
}

export interface ResolvedTaskOutput {
  task: CompileTaskInput;
  taskKind: TaskKind;
  candidates?: ParsedTaskCandidate[];
  task_intent: TaskIntent;
  context_profile: ContextProfile;
  input_provenance: InputProvenance;
  diagnostics: RuntimeDiagnostics;
  trace: TaskInterpretationTrace;
}

export interface ChangeDecisionPacket {
  version: 2;
  task: {
    task_kind: TaskKind;
    input: CompileTaskInput;
  };
  interpretation: InterpretationPacket;
  governance: GovernancePacket;
  cache: {
    l1Key: string;
    l2Key: string;
    l3Key: string;
  };
}

export interface PrepareInterpretationOutput {
  task: CompileTaskInput;
  interpretationPrompt: string;
  taskSchema: string;
  ambiguityHints: string[];
}

export interface RuntimeSessionRecord {
  version: 3;
  status: 'ok' | 'degraded';
  createdAt: string;
  paths: {
    projectRoot: string;
    pluginRoot: string;
    builtinRoot: string;
    runtimeEntry: string;
    localAugmentPath?: string;
    rcclPath?: string;
    lockfilePath: string;
  };
  taskInput: CompileTaskInput;
  interpretation: {
    mode: InputProvenance['interpretation_mode'];
    candidates?: ParsedTaskCandidate[];
    provenance?: InputProvenance;
    diagnostics?: RuntimeDiagnostics;
    trace?: TaskInterpretationTrace;
  };
  compileInput: {
    builtinRoot: string;
    localAugmentPath?: string;
    rcclPath?: string;
    lockfilePath?: string;
    projectRoot: string;
    resolvedTask?: ResolvedTaskOutput;
    task?: CompileTaskInput;
    parsedTaskCandidate?: ParsedTaskCandidate;
    interpretationMode?: InputProvenance['interpretation_mode'];
  };
  compileOutput: CompileOutput | null;
  fallbackGuidance: string[];
  warnings: string[];
  error?: string;
}

export interface PrepareCodeTaskResult {
  status: 'ok' | 'degraded';
  sessionPath: string;
  paths: RuntimeSessionRecord['paths'];
  packet?: ChangeDecisionPacket;
  ego: EffectiveGuidanceObject | null;
  trace: DecisionTrace | null;
  warnings: string[];
  fallbackGuidance?: string[];
  error?: string;
}

export interface CompleteCodeTaskResult {
  status: 'updated' | 'skipped';
  sessionPath: string;
  lockfilePath: string | null;
  followedDirectiveIds?: string[];
  ignoredDirectiveIds?: string[];
  reason?: string;
}

export interface ResolveTaskResult extends ResolvedTaskOutput {}

export interface PrepareCodeTaskInput extends CompileTaskInput {
  projectRoot: string;
  pluginRoot?: string;
  taskDescription: string;
  candidateFile?: string;
}

export interface CompileOutput {
  packet: ChangeDecisionPacket;
  resolvedTask: ResolvedTaskOutput;
  ego: EffectiveGuidanceObject;
  trace: DecisionTrace;
  cache: {
    l1Key: string;
    l2Key: string;
    l3Key: string;
  };
}

export interface EvaluateInput {
  ego: EffectiveGuidanceObject;
  packet?: ChangeDecisionPacket;
  lockfilePath: string;
  followedDirectiveIds?: string[];
  ignoredDirectiveIds?: string[];
}

export interface LockfileSignal {
  followed: number;
  ignored: number;
  follow_rate: number;
  trend: 'improving' | 'stable' | 'degrading';
}

export interface LockfileTaskOutcome {
  total_tasks: number;
  with_tensions: number;
  last_execution_modes: Record<ExecutionMode, number>;
  last_tension_count: number;
  last_updated_at: string;
}

export interface LockfileDirectiveEntry {
  quality_signal: {
    overall: LockfileSignal;
    by_task_type: Record<string, { followed: number; ignored: number }>;
    last_seen: string;
  };
  governance?: {
    outcomes: LockfileTaskOutcome;
  };
}

export interface LockfileDocument {
  version: 2;
  directives: Record<string, LockfileDirectiveEntry>;
  governance_summary: {
    total_tasks: number;
    by_task_type: Record<string, number>;
    last_execution_modes: Record<ExecutionMode, number>;
    last_tension_count: number;
    last_updated_at: string;
  };
}
