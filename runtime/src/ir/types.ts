import type {
  AdherenceQuality,
  ContextProfile,
  DirectiveExample,
  DirectiveType,
  ExecutionMode,
  Operation,
  Prescription,
  RcclEvidence,
  RcclObservation,
  ScopeBasis,
  TaskKind,
  VerificationDisposition,
  VerificationStatus,
  Weight,
} from '../types.ts';

export type GovernanceIRVersion = 'governance-ir/v1';

export interface SourceRefIR {
  kind: 'builtin-playbook' | 'local-playbook' | 'rccl' | 'task-input' | 'lockfile' | 'host-proposal' | 'runtime';
  id: string;
  path?: string;
  version?: string;
}

export interface SourceManifestIR {
  builtinRoot: string;
  selectedLayers: string[];
  localAugmentPath?: string;
  rcclPath?: string;
  lockfilePath?: string;
  projectRoot: string;
}

export interface IRFingerprintSet {
  task: string;
  directives: string;
  observations: string;
  feedback: string;
  hostProposals: string;
  bundle: string;
}

export interface ScopeIR {
  path: string;
}

export interface LayerIR {
  id: string;
  rank: number;
}

export interface DirectivePriorityIR {
  layerRank: number;
  prescriptionRank: number;
  weightRank: number;
  localOverrideRank: number;
}

export interface DirectiveTraitsIR {
  rcclImmune: boolean;
  safetyCritical: boolean;
  broadScope: boolean;
  compatibilitySensitive: boolean;
  migrationSensitive: boolean;
}

export interface DirectiveLocalStateIR {
  overrideApplied: boolean;
  augmentApplied: boolean;
  suppressed: boolean;
  suppressionReason?: string;
}

export interface DirectiveIR {
  irVersion: GovernanceIRVersion;
  id: string;
  semanticKey: string;
  source: SourceRefIR;
  layer: LayerIR;
  scope: ScopeIR;
  kind: DirectiveType;
  prescription: Prescription;
  weight: Weight;
  priority: DirectivePriorityIR;
  body: {
    description: string;
    rationale: string;
    exceptions: string[];
    examples: DirectiveExample[];
  };
  traits: DirectiveTraitsIR;
  local: DirectiveLocalStateIR;
}

export interface EvidenceIR extends RcclEvidence {}

export interface ObservationTraitsIR {
  legacy: boolean;
  migrationBoundary: boolean;
  antiPattern: boolean;
  compatibilityBoundary: boolean;
}

export interface ObservationIR {
  irVersion: GovernanceIRVersion;
  id: string;
  semanticKey: string;
  source: SourceRefIR;
  category: RcclObservation['category'];
  scope: ScopeIR;
  pattern: string;
  adherence: {
    quality: AdherenceQuality;
    confidence: number;
  };
  evidence: EvidenceIR[];
  support: {
    sourceSlices: string[];
    fileCount: number;
    clusterCount: number;
    scopeBasis: ScopeBasis;
  };
  verification: {
    evidenceStatus: VerificationStatus | 'pending';
    evidenceVerifiedCount: number;
    evidenceConfidence: number;
    inductionStatus: NonNullable<RcclObservation['verification']['induction_status']> | 'pending';
    inductionConfidence: number;
    checkedAt: string | null;
    disposition: VerificationDisposition;
  };
  traits: ObservationTraitsIR;
}

export interface TargetIR {
  path: string;
  role: 'target' | 'changed';
}

export interface FieldProvenanceIR {
  field: string;
  source: string;
  confidence: number;
}

export interface TaskIR {
  irVersion: GovernanceIRVersion;
  id: string;
  kind: TaskKind;
  operation: Operation;
  targetLayer: string;
  targets: TargetIR[];
  techStack: string[];
  tags: string[];
  context: ContextProfile;
  provenance: FieldProvenanceIR[];
  unresolved: string[];
  diagnostics: {
    clarificationRecommended: boolean;
    ambiguityReasons: string[];
  };
}

export interface DirectiveFeedbackSignalIR {
  directiveId: string;
  followed: number;
  ignored: number;
  followRate: number;
  trend: 'improving' | 'stable' | 'degrading';
  signalConfidence: 'implicit' | 'explicit' | 'review-confirmed' | 'user-corrected';
  lastSeen: string;
}

export interface FeedbackIR {
  irVersion: GovernanceIRVersion;
  source: SourceRefIR;
  directiveSignals: DirectiveFeedbackSignalIR[];
  globalSummary: {
    totalTasks: number;
    byTaskType: Record<string, number>;
    noisyDirectiveIds: string[];
    frequentlyIgnoredDirectiveIds: string[];
    recurringTensionKeys: string[];
  };
}

export interface SemanticRelationIR {
  irVersion: GovernanceIRVersion;
  id: string;
  directiveId: string;
  observationId: string;
  proposedBy: 'runtime-structural' | 'semantic-key' | 'host-agent' | 'feedback';
  relation: 'reinforce' | 'tension' | 'suppress' | 'ambient-only' | 'unrelated';
  conflictClass?: 'compatibility-boundary' | 'migration-tension' | 'local-deviation' | 'legacy-interface' | 'anti-pattern' | 'scope-mismatch' | 'style-drift' | 'architecture-drift';
  confidence: number;
  basis: {
    scope: boolean;
    semanticKey: boolean;
    category: boolean;
    evidence: boolean;
    hostReasoning: boolean;
    feedback: boolean;
  };
  evidenceRefs: string[];
  reasoningSummary: string;
  adjudication: {
    status: 'accepted' | 'rejected' | 'downgraded';
    finalRelation: SemanticRelationIR['relation'];
    reason: string;
  };
}

export interface ActivationDecisionIR {
  directiveId: string;
  layerId: string;
  sourcePath?: string;
  status: 'activated' | 'skipped';
  reason: 'matched' | 'suppressed-by-local' | 'layer-mismatch' | 'scope-mismatch';
  note: string;
  effectivePrescription: Prescription;
  effectiveWeight: Weight;
  priority: DirectivePriorityIR;
  localState: DirectiveLocalStateIR;
}

export interface HostProposalIR {
  irVersion: GovernanceIRVersion;
  source: SourceRefIR;
  kind: 'task-interpretation' | 'semantic-relation' | 'review-outcome';
  payload: unknown;
}

export interface GovernanceIRBundle {
  irVersion: GovernanceIRVersion;
  task: TaskIR;
  directives: DirectiveIR[];
  observations: ObservationIR[];
  feedback: FeedbackIR;
  hostProposals: HostProposalIR[];
  sourceManifest: SourceManifestIR;
  fingerprints: IRFingerprintSet;
}

export interface ExecutionDecisionIR {
  directiveId: string;
  mode: ExecutionMode;
  defaultMode: ExecutionMode;
  basis: 'prescription' | 'semantic-relation' | 'verification' | 'task-context' | 'feedback' | 'anti-pattern';
  relationIds: string[];
  contextApplied: string[];
  feedbackApplied: string[];
  reason: string;
}
