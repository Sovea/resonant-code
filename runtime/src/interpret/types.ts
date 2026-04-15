import type { CompileTaskInput, ContextProfile, Operation, TaskIntent, TaskKind } from '../types.ts';

export type InterpretationSource = 'explicit' | 'deterministic' | 'assistive-ai' | 'repo-default' | 'derived';
export type ResolutionStatus = 'resolved' | 'unresolved';
export type InterpretationMode = 'explicit-only' | 'deterministic-only' | 'assistive-ai' | 'clarified-retry';
export type ResolutionQuality = 'explicit' | 'ai-assisted' | 'deterministic' | 'degraded';

export interface CandidateField<T> {
  value?: T;
  source: InterpretationSource;
  confidence: number;
  status: ResolutionStatus;
  rationale?: string;
}

export interface CandidateListField<T> {
  values: T[];
  source: InterpretationSource;
  confidence: number;
  status: ResolutionStatus;
  rationale?: string;
}

export interface ParsedTaskCandidate {
  intent: {
    task_kind?: CandidateField<TaskKind>;
    operation?: CandidateField<Operation>;
    target_layer?: CandidateField<string>;
    tech_stack?: CandidateListField<string>;
    target_file?: CandidateField<string>;
    changed_files?: CandidateListField<string>;
    tags?: CandidateListField<string>;
  };
  context: {
    project_stage?: CandidateField<ContextProfile['project_stage']>;
    change_type?: CandidateField<Operation>;
    optimization_target?: CandidateField<ContextProfile['optimization_target']>;
    hard_constraints?: CandidateListField<string>;
    allowed_tradeoffs?: CandidateListField<string>;
    avoid?: CandidateListField<string>;
  };
  uncertainties: string[];
}

export interface ResolvedField<T> {
  value?: T;
  source: InterpretationSource;
  confidence: number;
  status: ResolutionStatus;
}

export interface InterpretationConflict {
  field: string;
  winner: InterpretationSource;
  discarded: InterpretationSource[];
  rationale: string;
}

export interface InputProvenance {
  resolved_fields: Array<{
    field: string;
    source: InterpretationSource;
    confidence: number;
  }>;
  unresolved_fields: string[];
  interpretation_mode: InterpretationMode;
  resolution_quality: ResolutionQuality;
}

export interface RuntimeDiagnostics {
  warnings: string[];
  fallback_usage: {
    used_deterministic_interpretation: boolean;
    used_candidate_normalization: boolean;
  };
  clarification_recommended: boolean;
  ambiguity_reasons: string[];
}

export interface CandidateSummary {
  source: InterpretationSource;
  confidence: number;
  resolved_fields: string[];
  unresolved_fields: string[];
}

export interface TaskInterpretationTrace {
  mode: InterpretationMode;
  candidate_summaries: CandidateSummary[];
  conflicts: InterpretationConflict[];
  selected_sources: Array<{
    field: string;
    source: InterpretationSource;
    confidence: number;
  }>;
}

export interface ResolvedTaskInput {
  task: CompileTaskInput;
  taskKind: TaskKind;
  intent: TaskIntent;
  contextProfile: ContextProfile;
  provenance: InputProvenance;
  diagnostics: RuntimeDiagnostics;
  trace: TaskInterpretationTrace;
}

export interface ResolveTaskInput {
  task: CompileTaskInput;
  candidates?: ParsedTaskCandidate[];
  interpretationMode?: InterpretationMode;
}
