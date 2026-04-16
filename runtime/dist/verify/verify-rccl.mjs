import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
//#region src/verify/verify-rccl.ts
/**
* Verifies RCCL evidence statically when verification fields are missing, and always reruns induction verification.
*/
async function verifyRcclDocument(rccl, projectRoot, now = /* @__PURE__ */ new Date()) {
	const checkedAt = now.toISOString();
	const rcclModule = await loadRcclModule();
	return {
		...rccl,
		observations: rccl.observations.map((observation) => needsVerification(observation) ? rcclModule.verifyObservationInduction(rcclModule.verifyObservationEvidence(observation, projectRoot, checkedAt)) : rcclModule.verifyObservationInduction(observation))
	};
}
function needsVerification(observation) {
	return !observation.verification.evidence_status || !observation.verification.checked_at;
}
async function loadRcclModule() {
	return import(pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "rccl", "dist", "index.mjs")).href);
}
//#endregion
export { verifyRcclDocument };
