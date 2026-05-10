//#region src/ai-contracts/diagnostics.ts
function buildContractPayloadDiagnostics(kind, entries, source) {
	const summary = {
		total: entries.length,
		accepted: 0,
		rejected: 0,
		downgraded: 0,
		unused: 0
	};
	for (const entry of entries) summary[entry.status] += 1;
	return {
		kind,
		...source ? { source } : {},
		summary,
		entries
	};
}
//#endregion
export { buildContractPayloadDiagnostics };
