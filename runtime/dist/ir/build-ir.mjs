import { resolveTask } from "../interpret/normalize-candidate.mjs";
import { loadCompileSources } from "../load/compile-sources.mjs";
import { feedbackToIR } from "./adapters/feedback.mjs";
import { directivesToIR } from "./adapters/playbook.mjs";
import { observationsToIR } from "./adapters/rccl.mjs";
import { taskToIR } from "./adapters/task.mjs";
import { buildIRFingerprints } from "./fingerprint.mjs";
//#region src/ir/build-ir.ts
function hasResolvedTask(input) {
	return "resolvedTask" in input;
}
async function buildGovernanceIR(input, sources) {
	const resolvedTask = hasResolvedTask(input) ? input.resolvedTask : resolveTask({
		task: input.task,
		candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
		interpretationMode: input.interpretationMode
	});
	const loadedSources = sources ?? await loadCompileSources(input);
	const bundleWithoutFingerprints = {
		irVersion: "governance-ir/v1",
		task: taskToIR(resolvedTask),
		directives: directivesToIR(loadedSources.allDirectives, loadedSources.local),
		observations: observationsToIR(loadedSources.rccl?.observations ?? [], input.rcclPath),
		feedback: feedbackToIR(input.lockfilePath),
		hostProposals: [],
		sourceManifest: {
			builtinRoot: input.builtinRoot,
			selectedLayers: loadedSources.selectedLayerIds,
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
