import { resolveTask } from '../interpret/normalize-candidate.ts';
import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from '../load/load-playbook.ts';
import { loadRccl } from '../load/load-rccl.ts';
import { verifyRcclDocument } from '../verify/verify-rccl.ts';
import type { CompileInput, ResolvedCompileInput } from '../types.ts';
import { feedbackToIR } from './adapters/feedback.ts';
import { directivesToIR } from './adapters/playbook.ts';
import { observationsToIR } from './adapters/rccl.ts';
import { taskToIR } from './adapters/task.ts';
import { buildIRFingerprints } from './fingerprint.ts';
import type { GovernanceIRBundle } from './types.ts';

function hasResolvedTask(input: CompileInput): input is ResolvedCompileInput {
  return 'resolvedTask' in input;
}

export async function buildGovernanceIR(input: CompileInput): Promise<GovernanceIRBundle> {
  const resolvedTask = hasResolvedTask(input)
    ? input.resolvedTask
    : resolveTask({
        task: input.task,
        candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
        interpretationMode: input.interpretationMode,
      });

  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const local = loadLocalPlaybook(input.localAugmentPath);
  const selectedLayers = local?.meta.extends.length
    ? resolveExtendedLayers(local.meta.extends, builtinLayers)
    : ['builtin/core'];
  const builtinDirectives = selectedLayers.flatMap((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return filePath ? loadDirectiveFile(filePath, layerId) : [];
  });
  const directives = [...builtinDirectives, ...(local?.additions ?? [])];
  const loadedRccl = await loadRccl(input.rcclPath);
  const verifiedRccl = loadedRccl ? await verifyRcclDocument(loadedRccl, input.projectRoot) : null;

  const bundleWithoutFingerprints: Omit<GovernanceIRBundle, 'fingerprints'> = {
    irVersion: 'governance-ir/v1',
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
      projectRoot: input.projectRoot,
    },
  };

  return {
    ...bundleWithoutFingerprints,
    fingerprints: buildIRFingerprints(bundleWithoutFingerprints),
  };
}
