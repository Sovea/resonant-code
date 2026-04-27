import { stableHash } from "../../utils/hash.mjs";
//#region src/ir/relations/propose-relations.ts
const STRONG_CONFIDENCE = .8;
const MODERATE_CONFIDENCE = .6;
function proposeSemanticRelations(directives, observations, task) {
	const scopedObservations = observations.filter((observation) => scopeMatchesTask(observation.scope.path, task));
	return directives.flatMap((directive) => scopedObservations.map((observation) => {
		const basis = buildBasis(directive, observation, task);
		const relation = proposeRelation(directive, observation, basis);
		const confidence = relationConfidence(observation, basis);
		return {
			irVersion: "governance-ir/v1",
			id: stableHash([
				"semantic-relation-ir",
				directive.id,
				observation.id,
				relation,
				basis
			]),
			directiveId: directive.id,
			observationId: observation.id,
			proposedBy: basis.semanticKey ? "semantic-key" : "runtime-structural",
			relation,
			conflictClass: inferConflictClass(directive, observation, relation),
			confidence,
			basis,
			evidenceRefs: observation.evidence.map((evidence) => `${evidence.file}:${evidence.line_range[0]}-${evidence.line_range[1]}`),
			reasoningSummary: summarizeProposal(directive, observation, relation, basis),
			adjudication: {
				status: "accepted",
				finalRelation: relation,
				reason: "initial runtime proposal before adjudication"
			}
		};
	}));
}
function buildBasis(directive, observation, task) {
	return {
		scope: scopeMatchesTask(directive.scope.path, task) && scopeMatchesTask(observation.scope.path, task),
		semanticKey: semanticKeysOverlap(directive.semanticKey, observation.semanticKey),
		category: categoryRelated(directive, observation),
		evidence: observation.verification.evidenceVerifiedCount > 0 || observation.verification.evidenceStatus === "verified",
		hostReasoning: false,
		feedback: false
	};
}
function proposeRelation(directive, observation, basis) {
	if (observation.verification.disposition === "demote-to-ambient") return "ambient-only";
	if (!basis.scope) return "unrelated";
	if (!(basis.semanticKey || basis.category)) return "unrelated";
	if (directive.kind === "anti-pattern" || observation.traits.antiPattern) return "suppress";
	return observation.adherence.quality === "good" ? "reinforce" : "tension";
}
function relationConfidence(observation, basis) {
	const verificationConfidence = Math.max(observation.verification.evidenceConfidence, observation.verification.inductionConfidence, observation.adherence.confidence);
	const basisConfidence = basis.semanticKey ? STRONG_CONFIDENCE : basis.category ? MODERATE_CONFIDENCE : 0;
	return Number(Math.max(verificationConfidence, basisConfidence).toFixed(2));
}
function inferConflictClass(directive, observation, relation) {
	if (relation === "unrelated" || relation === "reinforce") return void 0;
	if (directive.kind === "anti-pattern" || observation.traits.antiPattern) return "anti-pattern";
	if (directive.traits.migrationSensitive || observation.traits.migrationBoundary) return "migration-tension";
	if (directive.traits.compatibilitySensitive || observation.traits.compatibilityBoundary) return "compatibility-boundary";
	if (observation.traits.legacy) return "legacy-interface";
	if (observation.category === "style") return "style-drift";
	if (observation.category === "architecture") return "architecture-drift";
	return "local-deviation";
}
function summarizeProposal(directive, observation, relation, basis) {
	if (relation === "ambient-only") return "verify gate demotion limits this observation to ambient context";
	if (relation === "unrelated") return "scope matched the task, but no semantic or category relation was proposed";
	return `${relation} proposed from ${[
		basis.semanticKey ? "semantic-key" : "",
		basis.category ? "category/trait" : "",
		basis.evidence ? "verified-evidence" : ""
	].filter(Boolean).join(", ") || "runtime structural basis"} between ${directive.id} and ${observation.id}`;
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
	if (directive.kind === "anti-pattern" || observation.traits.antiPattern) return true;
	if (directive.kind === "architecture" && observation.category === "architecture") return true;
	if (directive.kind === "constraint" && observation.category === "constraint") return true;
	if ((directive.kind === "convention" || directive.kind === "preference") && (observation.category === "style" || observation.category === "pattern")) return true;
	return false;
}
function scopeMatchesTask(scope, task) {
	if (task.targets.length === 0) return true;
	return task.targets.some((target) => pathMatchesScope(target.path, scope));
}
function pathMatchesScope(path, scope) {
	if (scope === "*" || scope === "**/*") return true;
	if (scope.endsWith("/**")) return path.startsWith(scope.slice(0, -3));
	if (scope.endsWith("/**/*")) return path.startsWith(scope.slice(0, -5));
	if (scope.includes("*")) {
		const pattern = scope.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
		return new RegExp(`^${pattern}$`).test(path);
	}
	return path === scope || path.startsWith(`${scope}/`);
}
//#endregion
export { proposeSemanticRelations };
