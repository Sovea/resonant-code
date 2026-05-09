import type { CompileTaskInput, ResolvedTaskOutput } from '../types.ts';
import type { HostProposalIR } from '../ir/types.ts';

export type AIContractVersion = 'ai-contract/v1';
export type AIContractKind = 'task-interpretation' | 'semantic-relation' | 'semantic-candidate' | 'rccl-observation-generation';
export type AIContractSchemaVersion = '1.0';

export interface AIContractArtifact {
  suggestedPath: string;
  format: 'json' | 'yaml';
  usage: string;
}

export interface AIContractEnvelope<TSchema = unknown> {
  contractVersion: AIContractVersion;
  kind: AIContractKind;
  schemaId: string;
  schemaVersion: AIContractSchemaVersion;
  prompt: string;
  schema: TSchema;
  artifact: AIContractArtifact;
  allowedIds?: {
    directiveIds?: string[];
    observationIds?: string[];
  };
  provenance: {
    owner: 'runtime';
    deterministic: true;
  };
  cacheKeyMaterial?: unknown;
}

export interface TaskInterpretationContractInput {
  task: CompileTaskInput;
  candidatePath: string;
}

export interface TaskInterpretationRecommendation {
  shouldUseHostCandidate: boolean;
  reason: string;
  nextStep: string;
}

export interface TaskInterpretationContractOutput {
  task: CompileTaskInput;
  interpretationPrompt: string;
  taskSchema: string;
  ambiguityHints: string[];
  recommendation: TaskInterpretationRecommendation;
  candidateArtifact: AIContractArtifact;
  clarificationHints: string[];
  contract: AIContractEnvelope;
}

export interface SemanticProposalDirectiveSummary {
  id: string;
  semanticKey: string;
  kind: string;
  prescription: string;
  weight: string;
  layer: string;
  scope: string;
  description: string;
  rationale: string;
  traits: unknown;
}

export interface SemanticProposalObservationSummary {
  id: string;
  semanticKey: string;
  category: string;
  scope: string;
  pattern: string;
  adherence: unknown;
  verification: unknown;
  lifecycle: unknown;
  traits: unknown;
  evidenceRefs: string[];
  evidence: Array<{
    file: string;
    line_range: [number, number];
    snippet: string;
  }>;
}

export interface SemanticContractInput {
  resolvedTask: ResolvedTaskOutput;
  directives: SemanticProposalDirectiveSummary[];
  observations: SemanticProposalObservationSummary[];
  artifactPath: string;
}

export interface SemanticRelationContractOutput {
  proposalPrompt: string;
  proposalSchema: string;
  proposalArtifact: AIContractArtifact;
  contract: AIContractEnvelope;
}

export interface SemanticCandidateContractOutput {
  candidatePrompt: string;
  candidateSchema: string;
  candidateArtifact: AIContractArtifact;
  contract: AIContractEnvelope;
}

export interface HostProposalSourceInput {
  id: string;
  path?: string;
}

export type HostProposalNormalizer = (raw: unknown, source: HostProposalSourceInput) => HostProposalIR;
