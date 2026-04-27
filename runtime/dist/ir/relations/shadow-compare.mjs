import { semanticRelationsIRToLegacy } from "./legacy-mapping.mjs";
//#region src/ir/relations/shadow-compare.ts
const MAX_DRIFT_DETAILS = 5;
const PAIR_SEPARATOR = "::relation-pair::";
function compareRelationPipelines(legacyRelations, irRelations) {
	const projectedIR = semanticRelationsIRToLegacy(irRelations);
	const legacyByPair = relationMap(legacyRelations);
	const irByPair = relationMap(projectedIR);
	const allPairs = new Set([...legacyByPair.keys(), ...irByPair.keys()]);
	const driftDetails = [];
	let matchedPairs = 0;
	let missingInIR = 0;
	let extraInIR = 0;
	let relationMismatches = 0;
	let confidenceDrift = 0;
	for (const pair of allPairs) {
		const legacy = legacyByPair.get(pair);
		const ir = irByPair.get(pair);
		if (!legacy) {
			extraInIR += 1;
			pushDriftDetail(driftDetails, buildRelationDriftDetail(pair, legacy, ir, "extra IR relation without a legacy counterpart"));
			continue;
		}
		if (!ir) {
			missingInIR += 1;
			pushDriftDetail(driftDetails, buildRelationDriftDetail(pair, legacy, ir, "legacy relation missing from IR projection"));
			continue;
		}
		matchedPairs += 1;
		const relationMismatch = legacy.relation !== ir.relation;
		const confidenceMismatch = Math.abs(legacy.confidence - ir.confidence) >= .2;
		if (relationMismatch) relationMismatches += 1;
		if (confidenceMismatch) confidenceDrift += 1;
		if (relationMismatch || confidenceMismatch) pushDriftDetail(driftDetails, buildRelationDriftDetail(pair, legacy, ir, relationMismatch ? ir.reason : "relation confidence drift exceeded threshold"));
	}
	return {
		legacyCount: legacyRelations.length,
		irCount: projectedIR.length,
		matchedPairs,
		missingInIR,
		extraInIR,
		relationMismatches,
		confidenceDrift,
		legacyRelationCounts: countRelations(legacyRelations),
		irRelationCounts: countRelations(projectedIR),
		driftDetails
	};
}
function summarizeRelationShadowComparison(comparison) {
	return [
		`legacy_relations: ${comparison.legacyCount}`,
		`ir_projected_relations: ${comparison.irCount}`,
		`matched_pairs: ${comparison.matchedPairs}`,
		`missing_in_ir: ${comparison.missingInIR}`,
		`extra_in_ir: ${comparison.extraInIR}`,
		`relation_mismatches: ${comparison.relationMismatches}`,
		`confidence_drift: ${comparison.confidenceDrift}`,
		`legacy_distribution: ${formatRecord(comparison.legacyRelationCounts)}`,
		`ir_distribution: ${formatRecord(comparison.irRelationCounts)}`,
		...comparison.driftDetails.map(formatDriftDetail)
	];
}
function relationMap(relations) {
	return new Map(relations.map((relation) => [relationPairKey(relation.directive_id, relation.observation_id), relation]));
}
function relationPairKey(directiveId, observationId) {
	return `${directiveId}${PAIR_SEPARATOR}${observationId}`;
}
function parseRelationPairKey(pair) {
	const [directiveId, observationId] = pair.split(PAIR_SEPARATOR);
	return {
		directiveId,
		observationId
	};
}
function buildRelationDriftDetail(pair, legacy, ir, reason) {
	const { directiveId, observationId } = parseRelationPairKey(pair);
	const legacyConfidence = legacy?.confidence;
	const irConfidence = ir?.confidence;
	return {
		directiveId,
		observationId,
		legacyRelation: legacy?.relation,
		irRelation: ir?.relation,
		legacyConfidence,
		irConfidence,
		confidenceDelta: legacyConfidence === void 0 || irConfidence === void 0 ? void 0 : roundConfidence(irConfidence - legacyConfidence),
		reason
	};
}
function pushDriftDetail(details, detail) {
	if (details.length >= MAX_DRIFT_DETAILS) return;
	details.push(detail);
}
function countRelations(relations) {
	const counts = {};
	for (const relation of relations) counts[relation.relation] = (counts[relation.relation] ?? 0) + 1;
	return counts;
}
function formatDriftDetail(detail, index) {
	return `drift_${index + 1}: directive=${detail.directiveId} observation=${detail.observationId} legacy=${detail.legacyRelation ?? "(missing)"} ir=${detail.irRelation ?? "(missing)"} confidence_delta=${formatNumber(detail.confidenceDelta)} reason=${truncate(detail.reason)}`;
}
function formatRecord(record) {
	const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
	if (!entries.length) return "(none)";
	return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}
function formatNumber(value) {
	return value === void 0 ? "(n/a)" : value.toFixed(2);
}
function roundConfidence(value) {
	return Math.round(value * 100) / 100;
}
function truncate(value) {
	return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}
//#endregion
export { compareRelationPipelines, summarizeRelationShadowComparison };
