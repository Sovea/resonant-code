import { minimatch } from "../../utils/glob.mjs";
import { stableHash } from "../../utils/hash.mjs";
//#region src/ir/relations/propose-relations.ts
const MINIMUM_HOST_CONFIDENCE = .5;
const REVIEW_PRIORITIES = [
	"low",
	"normal",
	"high",
	"critical"
];
const CONFLICT_CLASSES = new Set([
	"compatibility-boundary",
	"migration-tension",
	"local-deviation",
	"legacy-interface",
	"anti-pattern",
	"scope-mismatch",
	"style-drift",
	"architecture-drift"
]);
const RELATION_IMPACTS = new Set([
	"execution-mode",
	"review-focus",
	"ambient-context",
	"no-effect"
]);
function proposeSemanticRelations(bundle) {
	return [...proposeRuntimeStructuralRelations(bundle), ...proposeHostSemanticRelations(bundle)];
}
function proposeRuntimeStructuralRelations(bundle) {
	return bundle.directives.flatMap((directive) => bundle.observations.flatMap((observation) => {
		const relation = proposeRuntimeStructuralRelation(directive, observation, bundle.task);
		return relation ? [relation] : [];
	}));
}
function proposeRuntimeStructuralRelation(directive, observation, task) {
	if (observation.lifecycle.status === "superseded") return null;
	const taskScoped = scopeMatchesTask(directive.scope.path, task) && scopeMatchesTask(observation.scope.path, task);
	const semanticKey = semanticKeysOverlap(directive.semanticKey, observation.semanticKey);
	const category = categoryRelated(directive, observation);
	if (!(semanticKey || category)) return null;
	const evidence = hasVerifiedEvidence(observation);
	const lifecycleAmbientOnly = observation.lifecycle.status === "stale";
	const verificationAmbientOnly = observation.verification.disposition === "demote-to-ambient";
	const relation = inferRuntimeRelation(directive, observation, {
		taskScoped,
		semanticKey,
		category,
		evidence,
		ambientOnly: lifecycleAmbientOnly || verificationAmbientOnly
	});
	if (!relation) return null;
	const signals = buildRuntimeSignals(directive, observation, taskScoped, semanticKey, category, relation);
	const conflictClass = inferConflictClass(directive, observation, relation);
	return {
		irVersion: "governance-ir/v1",
		id: stableHash([
			"semantic-relation-ir",
			"runtime-structural",
			directive.id,
			observation.id,
			relation,
			signals
		]),
		directiveId: directive.id,
		observationId: observation.id,
		proposedBy: "runtime-structural",
		relation,
		...conflictClass ? { conflictClass } : {},
		confidence: runtimeRelationConfidence(observation, semanticKey, category, relation),
		basis: {
			scope: taskScoped,
			semanticKey,
			category,
			evidence,
			hostReasoning: false,
			feedback: false
		},
		signals,
		evidenceRefs: observationEvidenceRefs(observation),
		reasoningSummary: summarizeRuntimeProposal(directive, observation, relation, {
			semanticKey,
			category
		}),
		impact: defaultImpact(relation),
		reviewPriority: defaultReviewPriority(directive, relation),
		adjudication: {
			status: "accepted",
			finalRelation: relation,
			reason: "initial runtime structural relation proposal before adjudication"
		}
	};
}
function inferRuntimeRelation(directive, observation, basis) {
	if (basis.ambientOnly) return "ambient-only";
	if (!basis.taskScoped || !basis.evidence) return null;
	if (isAntiPatternRelationCandidate(directive, observation, basis)) return "suppress";
	if (isCompatibilityTensionCandidate(directive, observation)) return "tension";
	if (basis.semanticKey || basis.category) return observation.adherence.quality === "good" ? "reinforce" : "tension";
	return null;
}
function isAntiPatternRelationCandidate(directive, observation, basis) {
	if (!observation.traits.antiPattern && directive.kind !== "anti-pattern") return false;
	return basis.semanticKey || basis.category || observation.traits.antiPattern;
}
function isCompatibilityTensionCandidate(directive, observation) {
	return (directive.traits.compatibilitySensitive || directive.traits.migrationSensitive) && (observation.traits.compatibilityBoundary || observation.traits.legacy || observation.traits.migrationBoundary);
}
function proposeHostSemanticRelations(bundle) {
	const directiveIds = new Set(bundle.directives.map((directive) => directive.id));
	const observationIds = new Set(bundle.observations.map((observation) => observation.id));
	return bundle.hostProposals.flatMap((proposal) => {
		if (proposal.kind !== "semantic-relation") return [];
		return semanticRelationPayload(proposal).relations.flatMap((relation) => {
			if (!directiveIds.has(relation.directive_id) || !observationIds.has(relation.observation_id)) return [];
			if (!Number.isFinite(relation.confidence) || relation.confidence < MINIMUM_HOST_CONFIDENCE) return [];
			return [toHostSemanticRelationIR(proposal, relation, bundle)];
		});
	});
}
function semanticRelationPayload(proposal) {
	const payload = proposal.payload;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { relations: [] };
	const relations = payload.relations;
	if (!Array.isArray(relations)) return { relations: [] };
	return { relations: relations.filter(isHostSemanticRelationProposal) };
}
function isHostSemanticRelationProposal(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value;
	return typeof candidate.directive_id === "string" && typeof candidate.observation_id === "string" && isRelation(candidate.relation) && typeof candidate.confidence === "number" && typeof candidate.reason === "string";
}
function isRelation(value) {
	return value === "reinforce" || value === "tension" || value === "suppress" || value === "ambient-only" || value === "unrelated";
}
function toHostSemanticRelationIR(proposal, relation, bundle) {
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
		irVersion: "governance-ir/v1",
		id: stableHash([
			"semantic-relation-ir",
			proposal.source.id,
			relation.directive_id,
			relation.observation_id,
			relation.relation,
			relation.reason,
			signals,
			impact,
			reviewPriority,
			mergeIntent,
			groupId
		]),
		directiveId: relation.directive_id,
		observationId: relation.observation_id,
		proposedBy: "host-agent",
		relation: relation.relation,
		...conflictClass ? { conflictClass } : {},
		confidence: clampConfidence(relation.confidence),
		basis: {
			scope: taskScoped,
			semanticKey: signals.some((signal) => signal.kind === "semantic-key"),
			category: false,
			evidence: hasVerifiedEvidence(observation),
			hostReasoning: true,
			feedback: signals.some((signal) => signal.kind === "feedback")
		},
		signals,
		evidenceRefs,
		reasoningSummary: relation.reason.trim(),
		...impact ? { impact } : {},
		...reviewPriority ? { reviewPriority } : {},
		...mergeIntent ? { mergeIntent } : {},
		...groupId ? { groupId } : {},
		adjudication: {
			status: "accepted",
			finalRelation: relation.relation,
			reason: "initial host semantic relation proposal before adjudication"
		}
	};
}
function requiredDirective(directives, id) {
	const directive = directives.find((item) => item.id === id);
	if (!directive) throw new Error(`Missing directive for semantic relation proposal: ${id}`);
	return directive;
}
function requiredObservation(observations, id) {
	const observation = observations.find((item) => item.id === id);
	if (!observation) throw new Error(`Missing observation for semantic relation proposal: ${id}`);
	return observation;
}
function normalizedEvidenceRefs(relation, observation) {
	const allowed = new Set(observationEvidenceRefs(observation));
	if (Array.isArray(relation.evidence_refs)) {
		const filtered = unique(relation.evidence_refs.filter((reference) => typeof reference === "string").map((reference) => reference.trim()).filter((reference) => allowed.has(reference)));
		if (filtered.length) return filtered;
	}
	return [...allowed];
}
function normalizedConflictClass(value) {
	return value && CONFLICT_CLASSES.has(value) ? value : void 0;
}
function normalizedImpact(value) {
	return typeof value === "string" && RELATION_IMPACTS.has(value) ? value : void 0;
}
function normalizedReviewPriority(value) {
	return typeof value === "string" && REVIEW_PRIORITIES.includes(value) ? value : void 0;
}
function normalizedOptionalString(value, maxLength) {
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, maxLength) : void 0;
}
function normalizeSignals(relation, observation, taskScoped) {
	const hostSignals = Array.isArray(relation.signals) ? relation.signals.filter(isSemanticRelationSignal) : [];
	return [
		{
			kind: "host-proposal",
			strength: relation.confidence >= .8 ? "strong" : "moderate",
			direction: relationToSignalDirection(relation.relation),
			reason: relation.reason.trim()
		},
		{
			kind: "scope",
			strength: taskScoped ? "strong" : "weak",
			direction: taskScoped ? "neutral" : "ambient",
			reason: taskScoped ? "host proposal matches task-scoped directive and observation" : "host proposal is outside the concrete task scope"
		},
		{
			kind: "verification",
			strength: verificationStrength(observation),
			direction: observation.verification.disposition === "demote-to-ambient" ? "ambient" : "neutral",
			reason: `RCCL verification disposition is ${observation.verification.disposition}`
		},
		{
			kind: "lifecycle",
			strength: observation.lifecycle.status === "active" ? "strong" : "weak",
			direction: observation.lifecycle.status === "superseded" || observation.lifecycle.status === "stale" ? "ambient" : "neutral",
			reason: `RCCL lifecycle status is ${observation.lifecycle.status}`
		},
		...hostSignals
	];
}
function buildRuntimeSignals(directive, observation, taskScoped, semanticKey, category, relation) {
	return [
		{
			kind: "scope",
			strength: taskScoped ? "strong" : "weak",
			direction: taskScoped ? "neutral" : "ambient",
			reason: taskScoped ? "directive and observation scopes match the resolved task" : "directive or observation is outside the resolved task scope"
		},
		{
			kind: "verification",
			strength: verificationStrength(observation),
			direction: observation.verification.disposition === "demote-to-ambient" ? "ambient" : "neutral",
			reason: `RCCL verification disposition is ${observation.verification.disposition}`
		},
		{
			kind: "lifecycle",
			strength: observation.lifecycle.status === "active" ? "strong" : "weak",
			direction: observation.lifecycle.status === "superseded" || observation.lifecycle.status === "stale" ? "ambient" : "neutral",
			reason: `RCCL lifecycle status is ${observation.lifecycle.status}`
		},
		...semanticKey ? [{
			kind: "semantic-key",
			strength: "moderate",
			direction: relationToSignalDirection(relation),
			reason: "directive and observation semantic keys overlap"
		}] : [],
		...category ? [{
			kind: "category",
			strength: "weak",
			direction: relationToSignalDirection(relation),
			reason: `directive traits match observation category or traits for ${directive.id}/${observation.id}`
		}] : []
	];
}
function isSemanticRelationSignal(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value;
	return isSignalKind(candidate.kind) && isSignalStrength(candidate.strength) && isSignalDirection(candidate.direction) && typeof candidate.reason === "string";
}
function isSignalKind(value) {
	return value === "semantic-key" || value === "category" || value === "scope" || value === "verification" || value === "lifecycle" || value === "feedback" || value === "host-proposal";
}
function isSignalStrength(value) {
	return value === "weak" || value === "moderate" || value === "strong";
}
function isSignalDirection(value) {
	return value === "reinforce" || value === "tension" || value === "suppress" || value === "ambient" || value === "neutral";
}
function relationToSignalDirection(relation) {
	if (relation === "ambient-only" || relation === "unrelated") return "ambient";
	return relation;
}
function verificationStrength(observation) {
	if (observation.verification.evidenceStatus === "verified" || observation.verification.evidenceConfidence >= .8) return "strong";
	if (observation.verification.evidenceStatus === "partial" || observation.verification.evidenceConfidence >= .5) return "moderate";
	return "weak";
}
function hasVerifiedEvidence(observation) {
	return observation.verification.evidenceVerifiedCount > 0 || observation.verification.evidenceStatus === "verified" || observation.verification.evidenceStatus === "partial";
}
function runtimeRelationConfidence(observation, semanticKey, category, relation) {
	const verificationConfidence = Math.max(observation.verification.evidenceConfidence, observation.verification.inductionConfidence, observation.adherence.confidence);
	return Number(Math.min(1, Math.max(verificationConfidence, relation === "suppress" ? .8 : semanticKey ? .75 : category ? .65 : .35)).toFixed(2));
}
function inferConflictClass(directive, observation, relation) {
	if (relation === "unrelated" || relation === "reinforce" || relation === "ambient-only") return void 0;
	if (directive.kind === "anti-pattern" || observation.traits.antiPattern) return "anti-pattern";
	if (directive.traits.migrationSensitive || observation.traits.migrationBoundary) return "migration-tension";
	if (directive.traits.compatibilitySensitive || observation.traits.compatibilityBoundary) return "compatibility-boundary";
	if (observation.traits.legacy) return "legacy-interface";
	if (observation.category === "style") return "style-drift";
	if (observation.category === "architecture") return "architecture-drift";
	return "local-deviation";
}
function summarizeRuntimeProposal(directive, observation, relation, basis) {
	if (relation === "ambient-only") return "runtime structural proposal kept this observation ambient because lifecycle or verification prevents execution influence";
	return `${relation} proposed by deterministic structural signals from ${[basis.semanticKey ? "semantic-key overlap" : "", basis.category ? "category/trait match" : ""].filter(Boolean).join(" and ") || "verified repository context"} between ${directive.id} and ${observation.id}`;
}
function defaultImpact(relation) {
	if (relation === "tension" || relation === "suppress") return "execution-mode";
	if (relation === "reinforce") return "review-focus";
	if (relation === "ambient-only") return "ambient-context";
	return "no-effect";
}
function defaultReviewPriority(directive, relation) {
	if (relation === "suppress") return "critical";
	if (relation === "tension" && (directive.prescription === "must" || directive.weight === "critical")) return "critical";
	if (relation === "tension") return "high";
	if (directive.weight === "critical") return "high";
	return "normal";
}
function semanticKeysOverlap(left, right) {
	const leftTokens = tokenSet(left);
	const rightTokens = tokenSet(right);
	for (const token of leftTokens) if (rightTokens.has(token)) return true;
	return false;
}
function tokenSet(value) {
	return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
}
function categoryRelated(directive, observation) {
	if (directive.traits.compatibilitySensitive && observation.traits.compatibilityBoundary) return true;
	if (directive.traits.migrationSensitive && (observation.traits.migrationBoundary || observation.traits.legacy)) return true;
	if (directive.traits.safetyCritical && observation.category === "constraint") return true;
	if (directive.traits.broadScope && (observation.category === "architecture" || observation.category === "pattern")) return true;
	if (directive.kind === "anti-pattern" && observation.traits.antiPattern) return true;
	if (directive.kind === "architecture" && observation.category === "architecture") return true;
	if (directive.kind === "constraint" && observation.category === "constraint") return true;
	if ((directive.kind === "convention" || directive.kind === "preference") && (observation.category === "style" || observation.category === "pattern")) return true;
	return false;
}
function observationEvidenceRefs(observation) {
	return observation.evidence.map((evidence) => `${evidence.file}:${evidence.line_range[0]}-${evidence.line_range[1]}`);
}
function clampConfidence(value) {
	return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}
function scopeMatchesTask(scope, task) {
	if (task.targets.length === 0) return true;
	return task.targets.some((target) => pathMatchesScope(target.path, scope));
}
function pathMatchesScope(path, scope) {
	if (scope === "*" || scope === "**/*") return true;
	if (scope.includes("*") || scope.includes("?") || scope.includes("{")) return minimatch(path, scope);
	return path === scope || path.startsWith(`${scope}/`);
}
function unique(values) {
	return [...new Set(values.filter(Boolean))];
}
//#endregion
export { proposeSemanticRelations };
