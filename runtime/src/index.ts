export { compile, resolveTask } from './compile.ts';
export { evaluateGuidance } from './feedback.ts';
export {
  parseTaskInterpretationCandidatePayload,
  prepareTaskInterpretationContract,
} from './ai-contracts/task-interpretation.ts';
export {
  loadSemanticCandidateProposalPayload,
  loadSemanticRelationProposalPayload,
  prepareSemanticCandidateContract,
  prepareSemanticRelationContract,
} from './ai-contracts/semantic-relations.ts';
export { resolveActivationDecisionsIR, activatedDirectiveIdsIR } from './ir/activation/resolve-activation.ts';
export { buildGovernanceIR } from './ir/build-ir.ts';
export { resolveExecutionDecisionsIR } from './ir/execution/resolve-execution.ts';
export { buildSemanticRelationsIR } from './ir/relations/build-relations.ts';
export { adjudicateSemanticRelations } from './ir/relations/adjudicate-relations.ts';
export { semanticRelationIRToPublic, semanticRelationsIRToPublic } from './ir/relations/public-mapping.ts';
export { proposeSemanticRelations } from './ir/relations/propose-relations.ts';
export { DeterministicInterpretationProvider } from './interpret/deterministic-extractor.ts';
export { resolveTaskInput } from './interpret/normalize-candidate.ts';
export {
  TASK_INPUT_ENUMS,
  TASK_INTERPRETATION_ENUMS,
  TASK_INTERPRETATION_SOURCES,
} from './intent/schema.ts';
export type { TaskInterpretationProvider } from './interpret/provider.ts';
export type {
  AIContractArtifact,
  AIContractEnvelope,
  AIContractKind,
  AIContractSchemaVersion,
  AIContractVersion,
  HostProposalNormalizer,
  HostProposalSourceInput,
  SemanticCandidateContractOutput,
  SemanticContractInput,
  SemanticProposalDirectiveSummary,
  SemanticProposalObservationSummary,
  SemanticRelationContractOutput,
  TaskInterpretationContractInput,
  TaskInterpretationContractOutput,
  TaskInterpretationRecommendation,
} from './ai-contracts/types.ts';
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
  HostSemanticCandidateHintIR,
  HostSemanticCandidateProposal,
  HostSemanticCandidateProposalPayload,
  HostSemanticRelationProposal,
  HostSemanticRelationProposalPayload,
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
  DiscardedInterpretationInput,
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
  CompatibilityRequirement,
  CompleteCodeTaskResult,
  ContextProfile,
  DecisionTrace,
  EffectiveGuidanceObject,
  EvaluateInput,
  FeedbackSignalConfidence,
  GovernancePacket,
  IgnoredReason,
  InterpretationPacket,
  InterfaceSensitivity,
  MigrationPhase,
  Operation,
  PrepareCodeTaskInput,
  PrepareCodeTaskResult,
  RefactorTolerance,
  PrepareInterpretationOutput,
  ResolveTaskRequest,
  ResolveTaskResult,
  ResolvedTaskOutput,
  ReviewTaskInput,
  ReviewGoal,
  RiskLevel,
  RuntimeSessionRecord,
  ScopeSize,
  SemanticMergeResult,
  TaskIntent,
  TaskKind,
} from './types.ts';
