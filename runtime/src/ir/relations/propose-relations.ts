import { stableHash } from '../../utils/hash.ts';
import { minimatch } from '../../utils/glob.ts';
import type {
  DirectiveIR,
  GovernanceIRBundle,
  HostProposalIR,
  HostSemanticCandidateProposal,
  HostSemanticCandidateProposalPayload,
  HostSemanticRelationProposal,
  HostSemanticRelationProposalPayload,
  ObservationIR,
  SemanticRelationIR,
  SemanticRelationImpactIR,
  SemanticRelationReviewPriorityIR,
  SemanticRelationSignalIR,
  TaskIR,
} from '../types.ts';
import { proposeFeedbackRelations } from './propose-feedback-relations.ts';
import { SEMANTIC_RELATION_POLICY } from './policy.ts';

const MINIMUM_HOST_CONFIDENCE = 0.5;
const REVIEW_PRIORITIES: SemanticRelationReviewPriorityIR[] = ['low', 'normal', 'high', 'critical'];

const CONFLICT_CLASSES = new Set<NonNullable<HostSemanticRelationProposal['conflict_class']>>([
  'compatibility-boundary',
  'migration-tension',
  'local-deviation',
  'legacy-interface',
  'anti-pattern',
  'scope-mismatch',
  'style-drift',
  'architecture-drift',
]);

const RELATION_IMPACTS = new Set<SemanticRelationImpactIR>([
  'execution-mode',
  'review-focus',
  'ambient-context',
  'no-effect',
]);

export function proposeSemanticRelations(bundle: GovernanceIRBundle): SemanticRelationIR[] {
  return [
    ...proposeRuntimeStructuralRelations(bundle),
    ...proposeHostSemanticRelations(bundle),
    ...proposeHostSemanticCandidateRelations(bundle),
    ...proposeFeedbackRelations(bundle),
  ];
}

function proposeRuntimeStructuralRelations(bundle: GovernanceIRBundle): SemanticRelationIR[] {
  return bundle.directives.flatMap((directive) => bundle.observations.flatMap((observation) => {
    const relation = proposeRuntimeStructuralRelation(directive, observation, bundle.task);
    return relation ? [relation] : [];
  }));
}

function proposeRuntimeStructuralRelation(
  directive: DirectiveIR,
  observation: ObservationIR,
  task: TaskIR,
): SemanticRelationIR | null {
  if (observation.lifecycle.status === 'superseded') return null;

  const taskScoped = scopeMatchesTask(directive.scope.path, task) && scopeMatchesTask(observation.scope.path, task);
  const semanticKey = semanticKeysOverlap(directive.semanticKey, observation.semanticKey);
  const category = categoryRelated(directive, observation);
  const related = semanticKey || category;
  if (!related) return null;

  const evidence = hasVerifiedEvidence(observation);
  const lifecycleAmbientOnly = observation.lifecycle.status === 'stale';
  const verificationAmbientOnly = observation.verification.disposition === 'demote-to-ambient';
  const relation = inferRuntimeRelation(directive, observation, {
    taskScoped,
    semanticKey,
    category,
    evidence,
    ambientOnly: lifecycleAmbientOnly || verificationAmbientOnly,
  });
  if (!relation) return null;

  const signals = buildRuntimeSignals(directive, observation, taskScoped, semanticKey, category, relation);
  const conflictClass = inferConflictClass(directive, observation, relation);

  return {
    irVersion: 'governance-ir/v1',
    id: stableHash(['semantic-relation-ir', 'runtime-structural', directive.id, observation.id, relation, signals]),
    directiveId: directive.id,
    observationId: observation.id,
    proposedBy: 'runtime-structural',
    relation,
    ...(conflictClass ? { conflictClass } : {}),
    confidence: runtimeRelationConfidence(observation, semanticKey, category, relation),
    basis: {
      scope: taskScoped,
      semanticKey,
      category,
      evidence,
      hostReasoning: false,
      feedback: false,
    },
    signals,
    evidenceRefs: observationEvidenceRefs(observation),
    reasoningSummary: summarizeRuntimeProposal(directive, observation, relation, { semanticKey, category }),
    impact: defaultImpact(relation),
    reviewPriority: defaultReviewPriority(directive, relation),
    adjudication: {
      status: 'accepted',
      finalRelation: relation,
      reason: 'initial runtime structural relation proposal before adjudication',
    },
  };
}

function inferRuntimeRelation(
  directive: DirectiveIR,
  observation: ObservationIR,
  basis: {
    taskScoped: boolean;
    semanticKey: boolean;
    category: boolean;
    evidence: boolean;
    ambientOnly: boolean;
  },
): SemanticRelationIR['relation'] | null {
  if (basis.ambientOnly) return 'ambient-only';
  if (!basis.taskScoped || !basis.evidence) return null;
  if (isAntiPatternRelationCandidate(directive, observation, basis)) return 'suppress';
  if (isCompatibilityTensionCandidate(directive, observation)) return 'tension';
  if (basis.semanticKey || basis.category) {
    return observation.adherence.quality === 'good' ? 'reinforce' : 'tension';
  }
  return null;
}

function isAntiPatternRelationCandidate(
  directive: DirectiveIR,
  observation: ObservationIR,
  basis: { semanticKey: boolean; category: boolean },
): boolean {
  if (!observation.traits.antiPattern && directive.kind !== 'anti-pattern') return false;
  return basis.semanticKey || basis.category || observation.traits.antiPattern;
}

function isCompatibilityTensionCandidate(directive: DirectiveIR, observation: ObservationIR): boolean {
  return (directive.traits.compatibilitySensitive || directive.traits.migrationSensitive)
    && (observation.traits.compatibilityBoundary || observation.traits.legacy || observation.traits.migrationBoundary);
}

function proposeHostSemanticRelations(bundle: GovernanceIRBundle): SemanticRelationIR[] {
  const directiveIds = new Set(bundle.directives.map((directive) => directive.id));
  const observationIds = new Set(bundle.observations.map((observation) => observation.id));

  return bundle.hostProposals.flatMap((proposal) => {
    if (proposal.kind !== 'semantic-relation') return [];
    return semanticRelationPayload(proposal).relations.flatMap((relation) => {
      if (!directiveIds.has(relation.directive_id) || !observationIds.has(relation.observation_id)) return [];
      if (!Number.isFinite(relation.confidence) || relation.confidence < MINIMUM_HOST_CONFIDENCE) return [];
      return [toHostSemanticRelationIR(proposal, relation, bundle)];
    });
  });
}

function proposeHostSemanticCandidateRelations(bundle: GovernanceIRBundle): SemanticRelationIR[] {
  const directiveIds = new Set(bundle.directives.map((directive) => directive.id));
  const observationIds = new Set(bundle.observations.map((observation) => observation.id));
  const byDirective = new Map<string, Array<{ proposal: HostProposalIR; candidate: HostSemanticCandidateProposal }>>();

  for (const proposal of bundle.hostProposals) {
    if (proposal.kind !== 'semantic-candidate') continue;
    for (const candidate of semanticCandidatePayload(proposal).candidates) {
      if (!directiveIds.has(candidate.directive_id) || !observationIds.has(candidate.observation_id)) continue;
      if (!Number.isFinite(candidate.confidence) || candidate.confidence < SEMANTIC_RELATION_POLICY.hostSemantic.minConfidence) continue;
      const current = byDirective.get(candidate.directive_id) ?? [];
      current.push({ proposal, candidate });
      byDirective.set(candidate.directive_id, current);
    }
  }

  return [...byDirective.values()].flatMap((items) => items
    .sort((left, right) => right.candidate.confidence - left.candidate.confidence)
    .slice(0, SEMANTIC_RELATION_POLICY.hostSemantic.maxCandidatesPerDirective)
    .map(({ proposal, candidate }) => toHostSemanticCandidateRelationIR(proposal, candidate, bundle)));
}

function semanticRelationPayload(proposal: HostProposalIR): HostSemanticRelationProposalPayload {
  const payload = proposal.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { relations: [] };
  const relations = (payload as Partial<HostSemanticRelationProposalPayload>).relations;
  if (!Array.isArray(relations)) return { relations: [] };
  return { relations: relations.filter(isHostSemanticRelationProposal) };
}

function semanticCandidatePayload(proposal: HostProposalIR): HostSemanticCandidateProposalPayload {
  const payload = proposal.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { candidates: [] };
  const candidates = (payload as Partial<HostSemanticCandidateProposalPayload>).candidates;
  if (!Array.isArray(candidates)) return { candidates: [] };
  return { candidates: candidates.filter(isHostSemanticCandidateProposal) };
}

function isHostSemanticRelationProposal(value: unknown): value is HostSemanticRelationProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<HostSemanticRelationProposal>;
  return typeof candidate.directive_id === 'string'
    && typeof candidate.observation_id === 'string'
    && isRelation(candidate.relation)
    && typeof candidate.confidence === 'number'
    && typeof candidate.reason === 'string';
}

function isHostSemanticCandidateProposal(value: unknown): value is HostSemanticCandidateProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<HostSemanticCandidateProposal>;
  return typeof candidate.directive_id === 'string'
    && typeof candidate.observation_id === 'string'
    && isCandidateHint(candidate.relation_hint)
    && typeof candidate.confidence === 'number'
    && typeof candidate.reason === 'string';
}

function isRelation(value: unknown): value is HostSemanticRelationProposal['relation'] {
  return value === 'reinforce'
    || value === 'tension'
    || value === 'suppress'
    || value === 'ambient-only'
    || value === 'unrelated';
}

function isCandidateHint(value: unknown): value is HostSemanticCandidateProposal['relation_hint'] {
  return value === 'reinforce'
    || value === 'tension'
    || value === 'ambient-only'
    || value === 'unknown';
}

function toHostSemanticRelationIR(
  proposal: HostProposalIR,
  relation: HostSemanticRelationProposal,
  bundle: GovernanceIRBundle,
): SemanticRelationIR {
  const directive = requiredDirective(bundle.directives, relation.directive_id);
  const observation = requiredObservation(bundle.observations, relation.observation_id);
  const taskScoped = scopeMatchesTask(directive.scope.path, bundle.task) && scopeMatchesTask(observation.scope.path, bundle.task);
  const evidenceRefs = normalizedEvidenceRefs(relation, observation);
  const signals = normalizeSignals(relation, observation, taskScoped);
  const conflictClass = normalizedConflictClass(relation.conflict_class);
  const impact = normalizedImpact(relation.impact);
  const reviewPriority = normalizedReviewPriority(relation.review_priority);
  const mergeIntent = normalizedOptionalString(relation.merge_intent, 360);
  const groupId = normalizedOptionalString(relation.group_id, 120);

  return {
    irVersion: 'governance-ir/v1',
    id: stableHash(['semantic-relation-ir', proposal.source.id, relation.directive_id, relation.observation_id, relation.relation, relation.reason, signals, impact, reviewPriority, mergeIntent, groupId]),
    directiveId: relation.directive_id,
    observationId: relation.observation_id,
    proposedBy: 'host-agent',
    relation: relation.relation,
    ...(conflictClass ? { conflictClass } : {}),
    confidence: clampConfidence(relation.confidence),
    basis: {
      scope: taskScoped,
      semanticKey: signals.some((signal) => signal.kind === 'semantic-key'),
      category: false,
      evidence: hasVerifiedEvidence(observation),
      hostReasoning: true,
      feedback: signals.some((signal) => signal.kind === 'feedback'),
    },
    signals,
    evidenceRefs,
    reasoningSummary: relation.reason.trim(),
    ...(impact ? { impact } : {}),
    ...(reviewPriority ? { reviewPriority } : {}),
    ...(mergeIntent ? { mergeIntent } : {}),
    ...(groupId ? { groupId } : {}),
    adjudication: {
      status: 'accepted',
      finalRelation: relation.relation,
      reason: 'initial host semantic relation proposal before adjudication',
    },
  };
}

function toHostSemanticCandidateRelationIR(
  proposal: HostProposalIR,
  candidate: HostSemanticCandidateProposal,
  bundle: GovernanceIRBundle,
): SemanticRelationIR {
  const directive = requiredDirective(bundle.directives, candidate.directive_id);
  const observation = requiredObservation(bundle.observations, candidate.observation_id);
  const relation = candidate.relation_hint === 'unknown' ? 'ambient-only' : candidate.relation_hint;
  const taskScoped = scopeMatchesTask(directive.scope.path, bundle.task) && scopeMatchesTask(observation.scope.path, bundle.task);
  const evidenceRefs = normalizedCandidateEvidenceRefs(candidate, observation);
  const signals = normalizeCandidateSignals(candidate, observation, taskScoped, relation);
  const impact = normalizedImpact(candidate.impact) ?? defaultImpact(relation);
  const reviewPriority = normalizedReviewPriority(candidate.review_priority) ?? defaultReviewPriority(directive, relation);
  const mergeIntent = normalizedOptionalString(candidate.merge_intent, 360);
  const groupId = normalizedOptionalString(candidate.group_id, 120);
  const conflictClass = inferConflictClass(directive, observation, relation);

  return {
    irVersion: 'governance-ir/v1',
    id: stableHash(['semantic-relation-ir', proposal.source.id, 'candidate', candidate.directive_id, candidate.observation_id, candidate.relation_hint, candidate.reason, signals, impact, reviewPriority, mergeIntent, groupId]),
    directiveId: candidate.directive_id,
    observationId: candidate.observation_id,
    proposedBy: 'host-semantic-candidate',
    relation,
    ...(conflictClass ? { conflictClass } : {}),
    confidence: clampConfidence(candidate.confidence),
    basis: {
      scope: taskScoped,
      semanticKey: false,
      category: false,
      evidence: hasVerifiedEvidence(observation),
      hostReasoning: true,
      feedback: false,
    },
    signals,
    evidenceRefs,
    reasoningSummary: candidate.reason.trim(),
    impact,
    reviewPriority,
    ...(mergeIntent ? { mergeIntent } : {}),
    ...(groupId ? { groupId } : {}),
    adjudication: {
      status: 'accepted',
      finalRelation: relation,
      reason: 'initial host semantic candidate before adjudication',
    },
  };
}

function requiredDirective(directives: DirectiveIR[], id: string): DirectiveIR {
  const directive = directives.find((item) => item.id === id);
  if (!directive) throw new Error(`Missing directive for semantic relation proposal: ${id}`);
  return directive;
}

function requiredObservation(observations: ObservationIR[], id: string): ObservationIR {
  const observation = observations.find((item) => item.id === id);
  if (!observation) throw new Error(`Missing observation for semantic relation proposal: ${id}`);
  return observation;
}

function normalizedEvidenceRefs(relation: HostSemanticRelationProposal, observation: ObservationIR): string[] {
  const allowed = new Set(observationEvidenceRefs(observation));
  if (Array.isArray(relation.evidence_refs)) {
    const filtered = unique(relation.evidence_refs
      .filter((reference): reference is string => typeof reference === 'string')
      .map((reference) => reference.trim())
      .filter((reference) => allowed.has(reference)));
    if (filtered.length) return filtered;
  }
  return [...allowed];
}

function normalizedCandidateEvidenceRefs(candidate: HostSemanticCandidateProposal, observation: ObservationIR): string[] {
  const allowed = new Set(observationEvidenceRefs(observation));
  if (Array.isArray(candidate.evidence_refs)) {
    const filtered = unique(candidate.evidence_refs
      .filter((reference): reference is string => typeof reference === 'string')
      .map((reference) => reference.trim())
      .filter((reference) => allowed.has(reference)));
    if (filtered.length) return filtered;
  }
  return [...allowed];
}

function normalizedConflictClass(value: HostSemanticRelationProposal['conflict_class']): HostSemanticRelationProposal['conflict_class'] | undefined {
  return value && CONFLICT_CLASSES.has(value) ? value : undefined;
}

function normalizedImpact(value: unknown): SemanticRelationImpactIR | undefined {
  return typeof value === 'string' && RELATION_IMPACTS.has(value as SemanticRelationImpactIR)
    ? value as SemanticRelationImpactIR
    : undefined;
}

function normalizedReviewPriority(value: unknown): SemanticRelationReviewPriorityIR | undefined {
  return typeof value === 'string' && REVIEW_PRIORITIES.includes(value as SemanticRelationReviewPriorityIR)
    ? value as SemanticRelationReviewPriorityIR
    : undefined;
}

function normalizedOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeSignals(
  relation: HostSemanticRelationProposal,
  observation: ObservationIR,
  taskScoped: boolean,
): SemanticRelationSignalIR[] {
  const hostSignals = Array.isArray(relation.signals) ? relation.signals.filter(isSemanticRelationSignal) : [];
  return [
    {
      kind: 'host-proposal',
      strength: relation.confidence >= 0.8 ? 'strong' : 'moderate',
      direction: relationToSignalDirection(relation.relation),
      reason: relation.reason.trim(),
    },
    {
      kind: 'scope',
      strength: taskScoped ? 'strong' : 'weak',
      direction: taskScoped ? 'neutral' : 'ambient',
      reason: taskScoped ? 'host proposal matches task-scoped directive and observation' : 'host proposal is outside the concrete task scope',
    },
    {
      kind: 'verification',
      strength: verificationStrength(observation),
      direction: observation.verification.disposition === 'demote-to-ambient' ? 'ambient' : 'neutral',
      reason: `RCCL verification disposition is ${observation.verification.disposition}`,
    },
    {
      kind: 'lifecycle',
      strength: observation.lifecycle.status === 'active' ? 'strong' : 'weak',
      direction: observation.lifecycle.status === 'superseded' || observation.lifecycle.status === 'stale' ? 'ambient' : 'neutral',
      reason: `RCCL lifecycle status is ${observation.lifecycle.status}`,
    },
    ...hostSignals,
  ];
}

function normalizeCandidateSignals(
  candidate: HostSemanticCandidateProposal,
  observation: ObservationIR,
  taskScoped: boolean,
  relation: SemanticRelationIR['relation'],
): SemanticRelationSignalIR[] {
  return [
    {
      kind: 'host-proposal',
      strength: candidate.confidence >= 0.85 ? 'strong' : 'moderate',
      direction: relationToSignalDirection(relation),
      reason: `host semantic candidate: ${candidate.reason.trim()}`,
    },
    {
      kind: 'scope',
      strength: taskScoped ? 'strong' : 'weak',
      direction: taskScoped ? 'neutral' : 'ambient',
      reason: taskScoped ? 'host semantic candidate matches task-scoped directive and observation' : 'host semantic candidate is outside the concrete task scope',
    },
    {
      kind: 'verification',
      strength: verificationStrength(observation),
      direction: observation.verification.disposition === 'demote-to-ambient' ? 'ambient' : 'neutral',
      reason: `RCCL verification disposition is ${observation.verification.disposition}`,
    },
    {
      kind: 'lifecycle',
      strength: observation.lifecycle.status === 'active' ? 'strong' : 'weak',
      direction: observation.lifecycle.status === 'superseded' || observation.lifecycle.status === 'stale' ? 'ambient' : 'neutral',
      reason: `RCCL lifecycle status is ${observation.lifecycle.status}`,
    },
  ];
}

function buildRuntimeSignals(
  directive: DirectiveIR,
  observation: ObservationIR,
  taskScoped: boolean,
  semanticKey: boolean,
  category: boolean,
  relation: SemanticRelationIR['relation'],
): SemanticRelationSignalIR[] {
  return [
    {
      kind: 'scope',
      strength: taskScoped ? 'strong' : 'weak',
      direction: taskScoped ? 'neutral' : 'ambient',
      reason: taskScoped ? 'directive and observation scopes match the resolved task' : 'directive or observation is outside the resolved task scope',
    },
    {
      kind: 'verification',
      strength: verificationStrength(observation),
      direction: observation.verification.disposition === 'demote-to-ambient' ? 'ambient' : 'neutral',
      reason: `RCCL verification disposition is ${observation.verification.disposition}`,
    },
    {
      kind: 'lifecycle',
      strength: observation.lifecycle.status === 'active' ? 'strong' : 'weak',
      direction: observation.lifecycle.status === 'superseded' || observation.lifecycle.status === 'stale' ? 'ambient' : 'neutral',
      reason: `RCCL lifecycle status is ${observation.lifecycle.status}`,
    },
    ...(semanticKey ? [{
      kind: 'semantic-key' as const,
      strength: 'moderate' as const,
      direction: relationToSignalDirection(relation),
      reason: 'directive and observation semantic keys overlap',
    }] : []),
    ...(category ? [{
      kind: 'category' as const,
      strength: 'weak' as const,
      direction: relationToSignalDirection(relation),
      reason: `directive traits match observation category or traits for ${directive.id}/${observation.id}`,
    }] : []),
  ];
}

function isSemanticRelationSignal(value: unknown): value is SemanticRelationSignalIR {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<SemanticRelationSignalIR>;
  return isSignalKind(candidate.kind)
    && isSignalStrength(candidate.strength)
    && isSignalDirection(candidate.direction)
    && typeof candidate.reason === 'string';
}

function isSignalKind(value: unknown): value is SemanticRelationSignalIR['kind'] {
  return value === 'semantic-key'
    || value === 'category'
    || value === 'scope'
    || value === 'verification'
    || value === 'lifecycle'
    || value === 'feedback'
    || value === 'host-proposal';
}

function isSignalStrength(value: unknown): value is SemanticRelationSignalIR['strength'] {
  return value === 'weak' || value === 'moderate' || value === 'strong';
}

function isSignalDirection(value: unknown): value is SemanticRelationSignalIR['direction'] {
  return value === 'reinforce' || value === 'tension' || value === 'suppress' || value === 'ambient' || value === 'neutral';
}

function relationToSignalDirection(relation: SemanticRelationIR['relation']): SemanticRelationSignalIR['direction'] {
  if (relation === 'ambient-only' || relation === 'unrelated') return 'ambient';
  return relation;
}

function verificationStrength(observation: ObservationIR): SemanticRelationSignalIR['strength'] {
  if (observation.verification.evidenceStatus === 'verified' || observation.verification.evidenceConfidence >= 0.8) return 'strong';
  if (observation.verification.evidenceStatus === 'partial' || observation.verification.evidenceConfidence >= 0.5) return 'moderate';
  return 'weak';
}

function hasVerifiedEvidence(observation: ObservationIR): boolean {
  return observation.verification.evidenceVerifiedCount > 0
    || observation.verification.evidenceStatus === 'verified'
    || observation.verification.evidenceStatus === 'partial';
}

function runtimeRelationConfidence(
  observation: ObservationIR,
  semanticKey: boolean,
  category: boolean,
  relation: SemanticRelationIR['relation'],
): number {
  const verificationConfidence = Math.max(
    observation.verification.evidenceConfidence,
    observation.verification.inductionConfidence,
    observation.adherence.confidence,
  );
  const basisConfidence = relation === 'suppress'
    ? 0.8
    : semanticKey
      ? 0.75
      : category
        ? 0.65
        : 0.35;
  return Number(Math.min(1, Math.max(verificationConfidence, basisConfidence)).toFixed(2));
}

function inferConflictClass(
  directive: DirectiveIR,
  observation: ObservationIR,
  relation: SemanticRelationIR['relation'],
): SemanticRelationIR['conflictClass'] | undefined {
  if (relation === 'unrelated' || relation === 'reinforce' || relation === 'ambient-only') return undefined;
  if (directive.kind === 'anti-pattern' || observation.traits.antiPattern) return 'anti-pattern';
  if (directive.traits.migrationSensitive || observation.traits.migrationBoundary) return 'migration-tension';
  if (directive.traits.compatibilitySensitive || observation.traits.compatibilityBoundary) return 'compatibility-boundary';
  if (observation.traits.legacy) return 'legacy-interface';
  if (observation.category === 'style') return 'style-drift';
  if (observation.category === 'architecture') return 'architecture-drift';
  return 'local-deviation';
}

function summarizeRuntimeProposal(
  directive: DirectiveIR,
  observation: ObservationIR,
  relation: SemanticRelationIR['relation'],
  basis: { semanticKey: boolean; category: boolean },
): string {
  if (relation === 'ambient-only') return 'runtime structural proposal kept this observation ambient because lifecycle or verification prevents execution influence';
  const basisText = [
    basis.semanticKey ? 'semantic-key overlap' : '',
    basis.category ? 'category/trait match' : '',
  ].filter(Boolean).join(' and ');
  return `${relation} proposed by deterministic structural signals from ${basisText || 'verified repository context'} between ${directive.id} and ${observation.id}`;
}

function defaultImpact(relation: SemanticRelationIR['relation']): SemanticRelationImpactIR {
  if (relation === 'tension' || relation === 'suppress') return 'execution-mode';
  if (relation === 'reinforce') return 'review-focus';
  if (relation === 'ambient-only') return 'ambient-context';
  return 'no-effect';
}

function defaultReviewPriority(directive: DirectiveIR, relation: SemanticRelationIR['relation']): SemanticRelationReviewPriorityIR {
  if (relation === 'suppress') return 'critical';
  if (relation === 'tension' && (directive.prescription === 'must' || directive.weight === 'critical')) return 'critical';
  if (relation === 'tension') return 'high';
  if (directive.weight === 'critical') return 'high';
  return 'normal';
}

function semanticKeysOverlap(left: string, right: string): boolean {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  for (const token of leftTokens) {
    if (rightTokens.has(token)) return true;
  }
  return false;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
}

function categoryRelated(directive: DirectiveIR, observation: ObservationIR): boolean {
  if (directive.traits.compatibilitySensitive && observation.traits.compatibilityBoundary) return true;
  if (directive.traits.migrationSensitive && (observation.traits.migrationBoundary || observation.traits.legacy)) return true;
  if (directive.traits.safetyCritical && observation.category === 'constraint') return true;
  if (directive.traits.broadScope && (observation.category === 'architecture' || observation.category === 'pattern')) return true;
  if (directive.kind === 'anti-pattern' && observation.traits.antiPattern) return true;
  if (directive.kind === 'architecture' && observation.category === 'architecture') return true;
  if (directive.kind === 'constraint' && observation.category === 'constraint') return true;
  if ((directive.kind === 'convention' || directive.kind === 'preference') && (observation.category === 'style' || observation.category === 'pattern')) return true;
  return false;
}

function observationEvidenceRefs(observation: ObservationIR): string[] {
  return observation.evidence.map((evidence) => `${evidence.file}:${evidence.line_range[0]}-${evidence.line_range[1]}`);
}

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function scopeMatchesTask(scope: string, task: TaskIR): boolean {
  if (task.targets.length === 0) return true;
  return task.targets.some((target) => pathMatchesScope(target.path, scope));
}

function pathMatchesScope(path: string, scope: string): boolean {
  if (scope === '*' || scope === '**/*') return true;
  if (scope.includes('*') || scope.includes('?') || scope.includes('{')) return minimatch(path, scope);
  return path === scope || path.startsWith(`${scope}/`);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
