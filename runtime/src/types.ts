export type Operation = 'create' | 'modify' | 'review' | 'refactor' | 'bugfix';
export type Prescription = 'must' | 'should';
export type Weight = 'low' | 'normal' | 'high' | 'critical';
export type DirectiveType = 'constraint' | 'preference' | 'convention' | 'architecture' | 'anti-pattern';
export type AdherenceQuality = 'good' | 'inconsistent' | 'poor';
export type VerificationStatus = 'pending' | 'verified' | 'partial' | 'failed' | 'unverifiable';
export type VerificationDisposition = 'keep' | 'keep-with-reduced-confidence' | 'demote-to-ambient';
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

/**
 * Represents one prescriptive rule compiled from the playbook.
 */
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

/**
 * Represents one verified or pending repository observation from RCCL.
 */
export interface RcclObservation {
  id: string;
  category: 'style' | 'architecture' | 'pattern' | 'constraint' | 'legacy' | 'anti-pattern' | 'migration';
  scope: string;
  pattern: string;
  confidence: number;
  adherence_quality: AdherenceQuality;
  evidence: RcclEvidence[];
  verification: RcclVerification;
}

/**
 * Represents the loaded RCCL document consumed by the Runtime.
 */
export interface RcclDocument {
  version: string;
  generated_at: string | null;
  git_ref: string | null;
  observations: RcclObservation[];
}

/**
 * Captures the normalized task intent used by the Runtime pipeline.
 */
export interface TaskIntent {
  operation: Operation;
  target_layer: string;
  tech_stack: string[];
  target_file?: string;
  changed_files: string[];
  tags: string[];
}

/**
 * Captures contextual priorities and constraints inferred for the task.
 */
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

export interface RcclVerification {
  status: VerificationStatus | null;
  verified_count: number | null;
  verified_confidence: number | null;
  checked_at: string | null;
  disposition: VerificationDisposition | null;
}


export interface CompileTaskInput {
  description: string;
  operation?: Operation;
  targetFile?: string;
  changedFiles?: string[];
  techStack?: string[];
  tags?: string[];
  projectStage?: ContextProfile['project_stage'];
  optimizationTarget?: ContextProfile['optimization_target'];
  hardConstraints?: string[];
  allowedTradeoffs?: string[];
  avoid?: string[];
}

/**
 * Describes the inputs required to compile one Runtime packet.
 */
export interface CompileInput {
  builtinRoot: string;
  localAugmentPath?: string;
  rcclPath?: string;
  task: CompileTaskInput;
  projectRoot: string;
  lockfilePath?: string;
}

/**
 * Represents one agent-facing directive after Runtime compilation.
 */
export interface GuidanceDirective {
  id: string;
  statement: string;
  rationale: string;
  prescription: Prescription;
  exceptions: string[];
  examples: DirectiveExample[];
  execution_mode: ExecutionMode;
}

/**
 * Represents one anti-pattern warning surfaced to the agent.
 */
export interface AvoidEntry {
  statement: string;
  trigger: string;
}

/**
 * Describes a repository-pattern tension that should shape implementation behavior.
 */
export interface ContextTension {
  directive_id: string;
  execution_mode: ExecutionMode;
  conflict: string;
  resolution: string;
  rccl_confidence: number;
}

/**
 * Packages the final executable guidance that an agent should follow.
 */
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

/**
 * Records the developer-facing explanation of how the Runtime reached its output.
 */
export interface DecisionTrace {
  task: TaskIntent;
  steps: TraceStep[];
  activated_directives: string[];
  suppressed_directives: string[];
  directive_decisions: SemanticMergeDirectiveLink[];
  observation_links: Array<{
    observation_id: string;
    directive_ids: string[];
  }>;
  context_influences: ContextInfluenceRecord[];
}

export interface ContextInfluenceRecord {
  field: 'optimization_target' | 'hard_constraints' | 'allowed_tradeoffs' | 'avoid' | 'project_stage';
  value: string;
  directive_id?: string;
  effect: string;
}

/**
 * Captures the execution decision for one directive during semantic merge.
 */
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

/**
 * Summarizes which directives were activated, suppressed, or adjusted by repository context.
 */
export interface SemanticMergeResult {
  activated_directives: string[];
  suppressed_directives: string[];
  context_tensions: ContextTension[];
  directive_modes: SemanticMergeDirectiveLink[];
  observation_links: SemanticMergeObservationLink[];
  context_influences: ContextInfluenceRecord[];
}

/**
 * Represents the full task-level Runtime artifact for one code change.
 */
export interface ChangeDecisionPacket {
  version: 1;
  task_intent: TaskIntent;
  context_profile: ContextProfile;
  semantic_merge: SemanticMergeResult;
  ego: EffectiveGuidanceObject;
  trace: DecisionTrace;
  cache: {
    l1Key: string;
    l2Key: string;
    l3Key: string;
  };
}

/**
 * Returns the packet plus the most commonly consumed Runtime views.
 */
export interface CompileOutput {
  packet: ChangeDecisionPacket;
  ego: EffectiveGuidanceObject;
  trace: DecisionTrace;
  cache: {
    l1Key: string;
    l2Key: string;
    l3Key: string;
  };
}

/**
 * Describes the feedback payload used to update lockfile quality signals.
 */
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

/**
 * Stores accumulated quality and governance outcomes for one directive.
 */
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

/**
 * Represents the versioned Runtime lockfile document written after task execution.
 */
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



