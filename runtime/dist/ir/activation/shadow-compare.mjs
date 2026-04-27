//#region src/ir/activation/shadow-compare.ts
const MAX_DRIFT_DETAILS = 5;
function compareActivationPipelines(legacyPlan, irDecisions) {
	const legacyByDirective = buildLegacyMap(legacyPlan);
	const irByDirective = new Map(irDecisions.map((decision) => [decision.directiveId, decision]));
	const allDirectives = new Set([...legacyByDirective.keys(), ...irByDirective.keys()]);
	const driftDetails = [];
	let matchedDirectives = 0;
	let missingInIR = 0;
	let extraInIR = 0;
	let statusMismatches = 0;
	let reasonMismatches = 0;
	for (const directiveId of allDirectives) {
		const legacy = legacyByDirective.get(directiveId);
		const ir = irByDirective.get(directiveId);
		if (!legacy) {
			extraInIR += 1;
			pushDriftDetail(driftDetails, buildDriftDetail(directiveId, legacy, ir, "extra IR activation decision without a legacy counterpart"));
			continue;
		}
		if (!ir) {
			missingInIR += 1;
			pushDriftDetail(driftDetails, buildDriftDetail(directiveId, legacy, ir, "legacy activation decision missing from IR decisions"));
			continue;
		}
		matchedDirectives += 1;
		const statusMismatch = legacy.status !== ir.status;
		const reasonMismatch = legacyNormalizedReason(legacy) !== irNormalizedReason(ir);
		if (statusMismatch) statusMismatches += 1;
		if (reasonMismatch) reasonMismatches += 1;
		if (statusMismatch || reasonMismatch) pushDriftDetail(driftDetails, buildDriftDetail(directiveId, legacy, ir, statusMismatch ? "activation status mismatch" : "activation reason mismatch"));
	}
	return {
		legacyActivated: legacyPlan.activated.length,
		irActivated: irDecisions.filter((decision) => decision.status === "activated").length,
		legacySkipped: legacyPlan.skipped.length,
		irSkipped: irDecisions.filter((decision) => decision.status === "skipped").length,
		matchedDirectives,
		missingInIR,
		extraInIR,
		statusMismatches,
		reasonMismatches,
		legacyStatusCounts: countLegacyStatuses(legacyPlan),
		irStatusCounts: countIRStatuses(irDecisions),
		driftDetails
	};
}
function summarizeActivationShadowComparison(comparison) {
	return [
		`legacy_activated: ${comparison.legacyActivated}`,
		`ir_activated: ${comparison.irActivated}`,
		`legacy_skipped: ${comparison.legacySkipped}`,
		`ir_skipped: ${comparison.irSkipped}`,
		`matched_directives: ${comparison.matchedDirectives}`,
		`missing_in_ir: ${comparison.missingInIR}`,
		`extra_in_ir: ${comparison.extraInIR}`,
		`status_mismatches: ${comparison.statusMismatches}`,
		`reason_mismatches: ${comparison.reasonMismatches}`,
		`legacy_status_distribution: ${formatRecord(comparison.legacyStatusCounts)}`,
		`ir_status_distribution: ${formatRecord(comparison.irStatusCounts)}`,
		...comparison.driftDetails.map(formatDriftDetail)
	];
}
function buildLegacyMap(plan) {
	return new Map([...plan.activated.map((item) => [item.directive_id, {
		directiveId: item.directive_id,
		layerId: item.layer_id,
		status: "activated",
		reason: item.activation_reason
	}]), ...plan.skipped.map((item) => [item.directive_id, {
		directiveId: item.directive_id,
		layerId: item.layer_id,
		status: "skipped",
		reason: item.reason
	}])]);
}
function buildDriftDetail(directiveId, legacy, ir, reason) {
	return {
		directiveId,
		legacyStatus: legacy?.status,
		irStatus: ir?.status,
		legacyReason: legacy?.reason,
		irReason: ir?.reason,
		legacyLayerId: legacy?.layerId,
		irLayerId: ir?.layerId,
		reason
	};
}
function legacyNormalizedReason(decision) {
	return decision.status === "activated" ? "matched" : decision.reason;
}
function irNormalizedReason(decision) {
	return decision.reason;
}
function pushDriftDetail(details, detail) {
	if (details.length >= MAX_DRIFT_DETAILS) return;
	details.push(detail);
}
function countLegacyStatuses(plan) {
	return {
		activated: plan.activated.length,
		skipped: plan.skipped.length
	};
}
function countIRStatuses(decisions) {
	const counts = {};
	for (const decision of decisions) counts[decision.status] = (counts[decision.status] ?? 0) + 1;
	return counts;
}
function formatDriftDetail(detail, index) {
	return `drift_${index + 1}: directive=${detail.directiveId} legacy=${detail.legacyStatus ?? "(missing)"}/${detail.legacyReason ?? "(missing)"} ir=${detail.irStatus ?? "(missing)"}/${detail.irReason ?? "(missing)"} layer=${detail.legacyLayerId ?? "(missing)"}->${detail.irLayerId ?? "(missing)"} reason=${detail.reason}`;
}
function formatRecord(record) {
	const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
	if (!entries.length) return "(none)";
	return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}
//#endregion
export { compareActivationPipelines, summarizeActivationShadowComparison };
