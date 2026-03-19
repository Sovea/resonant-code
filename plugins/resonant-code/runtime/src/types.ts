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

export interface RcclDocument {
  version: string;
  generated_at: string | null;
  git_ref: string | null;
  observations: RcclObservation[];
}

export interface TaskIntent {
  operation: Operation;
  target_layer: string;
  tech_stack: string[];
  target_file?: string;
  changed_files: string[];
  tags: string[];
}

export interface CompileTaskInput {
  description: string;
  operation?: Operation;
  targetFile?: string;
  changedFiles?: string[];
  techStack?: string[];
  tags?: string[];
}

export interface CompileInput {
  builtinRoot: string;
  localAugmentPath?: string;
  rcclPath?: string;
  task: CompileTaskInput;
  projectRoot: string;
  lockfilePath?: string;
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
}

export interface CompileOutput {
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

export interface LockfileDirectiveEntry {
  quality_signal: {
    overall: LockfileSignal;
    by_task_type: Record<string, { followed: number; ignored: number }>;
    last_seen: string;
  };
}
