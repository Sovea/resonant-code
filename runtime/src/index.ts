export { compile, resolveTask } from './compile.ts';
export { evaluateGuidance } from './feedback.ts';
export { resolveActivationDecisionsIR, activatedDirectiveIdsIR } from './ir/activation/resolve-activation.ts';
export { compareActivationPipelines, summarizeActivationShadowComparison } from './ir/activation/shadow-compare.ts';
export { buildGovernanceIR } from './ir/build-ir.ts';
export { resolveExecutionDecisionsIR } from './ir/execution/resolve-execution.ts';
export { compareExecutionDecisions, summarizeExecutionShadowComparison } from './ir/execution/shadow-compare.ts';
export { buildSemanticRelationsIR } from './ir/relations/build-relations.ts';
export { adjudicateSemanticRelations } from './ir/relations/adjudicate-relations.ts';
export { semanticRelationIRToLegacy, semanticRelationsIRToLegacy } from './ir/relations/legacy-mapping.ts';
export { proposeSemanticRelations } from './ir/relations/propose-relations.ts';
export { compareRelationPipelines, summarizeRelationShadowComparison } from './ir/relations/shadow-compare.ts';
export { DeterministicInterpretationProvider } from './interpret/deterministic-extractor.ts';
export { resolveTaskInput } from './interpret/normalize-candidate.ts';
export type { TaskInterpretationProvider } from './interpret/provider.ts';
export type { ActivationShadowComparison } from './ir/activation/shadow-compare.ts';
export type { ExecutionShadowComparison } from './ir/execution/shadow-compare.ts';
export type { RelationShadowComparison } from './ir/relations/shadow-compare.ts';
export type {
  ActivationDecisionIR,
  DirectiveFeedbackSignalIR,
  DirectiveIR,
  DirectiveLocalStateIR,
  DirectivePriorityIR,
  DirectiveTraitsIR,
  ExecutionDecisionIR,
  FeedbackIR,
  FieldProvenanceIR,
  GovernanceIRBundle,
  GovernanceIRVersion,
  HostProposalIR,
  IRFingerprintSet,
  LayerIR,
  ObservationIR,
  ObservationTraitsIR,
  ScopeIR,
  SemanticRelationIR,
  SourceManifestIR,
  SourceRefIR,
  TargetIR,
  TaskIR,
} from './ir/types.ts';
export type {
  CandidateField,
  CandidateListField,
  InputProvenance,
  InterpretationConflict,
  ParsedTaskCandidate,
  ResolvedField,
  ResolvedTaskInput,
  RuntimeDiagnostics,
  TaskInterpretationTrace,
} from './interpret/types.ts';
export type {
  ChangeDecisionPacket,
  CompileInput,
  CompileOutput,
  CompileTaskInput,
  CompleteCodeTaskResult,
  ContextProfile,
  DecisionTrace,
  EffectiveGuidanceObject,
  EvaluateInput,
  GovernancePacket,
  InterpretationPacket,
  Operation,
  PrepareCodeTaskInput,
  PrepareCodeTaskResult,
  PrepareInterpretationOutput,
  ResolveTaskRequest,
  ResolveTaskResult,
  ResolvedTaskOutput,
  ReviewTaskInput,
  RuntimeSessionRecord,
  SemanticMergeResult,
  TaskIntent,
  TaskKind,
} from './types.ts';
