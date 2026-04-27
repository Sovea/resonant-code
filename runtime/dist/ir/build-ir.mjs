import { resolveTask } from "../interpret/normalize-candidate.mjs";
import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from "../load/load-playbook.mjs";
import { loadRccl } from "../load/load-rccl.mjs";
import { verifyRcclDocument } from "../verify/verify-rccl.mjs";
import { feedbackToIR } from "./adapters/feedback.mjs";
import { directivesToIR } from "./adapters/playbook.mjs";
import { observationsToIR } from "./adapters/rccl.mjs";
import { taskToIR } from "./adapters/task.mjs";
import { buildIRFingerprints } from "./fingerprint.mjs";
//#region src/ir/build-ir.ts
function hasResolvedTask(input) {
	return "resolvedTask" in input;
}
async function buildGovernanceIR(input) {
	const resolvedTask = hasResolvedTask(input) ? input.resolvedTask : resolveTask({
		task: input.task,
		candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
		interpretationMode: input.interpretationMode
	});
	const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
	const local = loadLocalPlaybook(input.localAugmentPath);
	const selectedLayers = local?.meta.extends.length ? resolveExtendedLayers(local.meta.extends, builtinLayers) : ["builtin/core"];
	const directives = [...selectedLayers.flatMap((layerId) => {
		const filePath = builtinLayers.get(layerId);
		return filePath ? loadDirectiveFile(filePath, layerId) : [];
	}), ...local?.additions ?? []];
	const loadedRccl = await loadRccl(input.rcclPath);
	const verifiedRccl = loadedRccl ? await verifyRcclDocument(loadedRccl, input.projectRoot) : null;
	const bundleWithoutFingerprints = {
		irVersion: "governance-ir/v1",
		task: taskToIR(resolvedTask),
		directives: directivesToIR(directives, local),
		observations: observationsToIR(verifiedRccl?.observations ?? [], input.rcclPath),
		feedback: feedbackToIR(input.lockfilePath),
		hostProposals: [],
		sourceManifest: {
			builtinRoot: input.builtinRoot,
			selectedLayers,
			localAugmentPath: input.localAugmentPath,
			rcclPath: input.rcclPath,
			lockfilePath: input.lockfilePath,
			projectRoot: input.projectRoot
		}
	};
	return {
		...bundleWithoutFingerprints,
		fingerprints: buildIRFingerprints(bundleWithoutFingerprints)
	};
}
//#endregion
export { buildGovernanceIR };
