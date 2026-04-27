import { stableHash } from "../utils/hash.mjs";
//#region src/ir/fingerprint.ts
function fingerprintPart(value) {
	return stableHash([canonicalize(value)]);
}
function buildIRFingerprints(input) {
	const task = fingerprintPart(input.task);
	const directives = fingerprintPart(input.directives);
	const observations = fingerprintPart(input.observations);
	const feedback = fingerprintPart(input.feedback);
	const hostProposals = fingerprintPart(input.hostProposals);
	return {
		task,
		directives,
		observations,
		feedback,
		hostProposals,
		bundle: fingerprintPart({
			irVersion: input.irVersion,
			sourceManifest: input.sourceManifest,
			task,
			directives,
			observations,
			feedback,
			hostProposals
		})
	};
}
function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
}
//#endregion
export { buildIRFingerprints, fingerprintPart };
