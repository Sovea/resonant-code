import { scopeMatchesIntent } from "../select/activation-plan.mjs";
//#region src/merge/build-relations.ts
const STRONG_STRUCTURAL_CONFIDENCE = .8;
const MODERATE_STRUCTURAL_CONFIDENCE = .6;
const ANTI_PATTERN_VERIFICATION_THRESHOLD = .75;
function buildRelations(directives, observations, intent) {
	const scopedObservations = observations.filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files));
	return directives.flatMap((directive) => scopedObservations.map((observation) => {
		const verificationConfidence = observation.verification.induction_confidence ?? observation.verification.evidence_confidence ?? 0;
		const structuralTier = structuralMatchTier(directive, observation);
		const structuralConfidence = structuralTierToConfidence(structuralTier);
		const confidence = Math.max(structuralConfidence, verificationConfidence);
		const isDemoted = observation.verification.disposition === "demote-to-ambient";
		const isWeakBroadScope = observation.support.scope_basis === "cross-root" && verificationConfidence < .7;
		if (isDemoted || isWeakBroadScope) return {
			directive_id: directive.id,
			observation_id: observation.id,
			relation: "ambient-only",
			confidence: verificationConfidence,
			basis: ["scope", "verification"],
			reason: isDemoted ? "observation was demoted by verify gate and can only contribute ambient context" : "weak broad-scope observation stays ambient-only until evidence support is stronger"
		};
		if (directive.type === "anti-pattern" || observation.category === "anti-pattern") {
			const suppresses = supportsAntiPatternSuppression(directive, observation, verificationConfidence, structuralTier);
			return {
				directive_id: directive.id,
				observation_id: observation.id,
				relation: suppresses ? "anti-pattern-suppress" : "none",
				confidence,
				basis: suppresses ? [
					"scope",
					"verification",
					"category"
				] : ["scope", "category"],
				reason: suppresses ? "verified anti-pattern structure indicates suppression-worthy overlap for this directive category" : "anti-pattern structure did not satisfy the stronger suppression gate"
			};
		}
		if (structuralTier === "none") return {
			directive_id: directive.id,
			observation_id: observation.id,
			relation: "none",
			confidence: verificationConfidence,
			basis: ["scope", "category"],
			reason: "no structural directive-observation overlap was found in the deterministic baseline"
		};
		const relation = observation.adherence_quality === "good" ? "reinforce" : "tension";
		return {
			directive_id: directive.id,
			observation_id: observation.id,
			relation,
			confidence,
			basis: [
				"scope",
				"verification",
				"category"
			],
			reason: relation === "reinforce" ? "verified observation structurally reinforces this directive in the current repository context" : "verified observation structurally creates tension with this directive in the current repository context"
		};
	}));
}
function structuralMatchTier(directive, observation) {
	switch (`${directive.type}:${observation.category}`) {
		case "architecture:architecture":
		case "constraint:constraint":
		case "architecture:migration":
		case "architecture:legacy":
		case "constraint:legacy":
		case "constraint:migration": return "strong";
		case "convention:style":
		case "convention:pattern":
		case "preference:style":
		case "preference:pattern":
		case "architecture:pattern":
		case "constraint:pattern":
		case "preference:constraint":
		case "convention:constraint": return "moderate";
		default: return "none";
	}
}
function structuralTierToConfidence(tier) {
	switch (tier) {
		case "strong": return STRONG_STRUCTURAL_CONFIDENCE;
		case "moderate": return MODERATE_STRUCTURAL_CONFIDENCE;
		default: return 0;
	}
}
function supportsAntiPatternSuppression(directive, observation, verificationConfidence, structuralTier) {
	if (directive.type === "anti-pattern") return true;
	if (observation.category !== "anti-pattern") return false;
	if (verificationConfidence < ANTI_PATTERN_VERIFICATION_THRESHOLD) return false;
	if (structuralTier === "none") return false;
	return directive.type === "convention" || directive.type === "preference" || directive.type === "architecture" || directive.type === "constraint";
}
//#endregion
export { buildRelations };
