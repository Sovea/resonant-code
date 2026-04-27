//#region src/ir/adapters/rccl.ts
function observationsToIR(observations, rcclPath) {
	return observations.map((observation) => ({
		irVersion: "governance-ir/v1",
		id: observation.id,
		semanticKey: observation.semantic_key,
		source: {
			kind: "rccl",
			id: observation.id,
			path: rcclPath
		},
		category: observation.category,
		scope: { path: observation.scope },
		pattern: observation.pattern,
		adherence: {
			quality: observation.adherence_quality,
			confidence: observation.confidence
		},
		evidence: observation.evidence,
		support: {
			sourceSlices: observation.support.source_slices,
			fileCount: observation.support.file_count,
			clusterCount: observation.support.cluster_count,
			scopeBasis: observation.support.scope_basis
		},
		verification: {
			evidenceStatus: observation.verification.evidence_status ?? "pending",
			evidenceVerifiedCount: observation.verification.evidence_verified_count ?? 0,
			evidenceConfidence: observation.verification.evidence_confidence ?? 0,
			inductionStatus: observation.verification.induction_status ?? "pending",
			inductionConfidence: observation.verification.induction_confidence ?? 0,
			checkedAt: observation.verification.checked_at,
			disposition: observation.verification.disposition ?? "demote-to-ambient"
		},
		traits: buildTraits(observation)
	}));
}
function buildTraits(observation) {
	const text = `${observation.semantic_key} ${observation.category} ${observation.pattern}`.toLowerCase();
	return {
		legacy: observation.category === "legacy" || /legacy|backward|compatib/.test(text),
		migrationBoundary: observation.category === "migration" || /migration|transition|incremental/.test(text),
		antiPattern: observation.category === "anti-pattern",
		compatibilityBoundary: /compatib|public api|breaking|legacy|interface|contract/.test(text)
	};
}
//#endregion
export { observationsToIR };
