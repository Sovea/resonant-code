import { resolveTask } from '../interpret/normalize-candidate.ts';
import { loadCompileSources } from '../load/compile-sources.ts';
import type { CompileInput, ResolvedCompileInput } from '../types.ts';
import type { CompileSources } from '../load/compile-sources.ts';
import { feedbackToIR } from './adapters/feedback.ts';
import { directivesToIR } from './adapters/playbook.ts';
import { observationsToIR } from './adapters/rccl.ts';
import { taskToIR } from './adapters/task.ts';
import { buildIRFingerprints } from './fingerprint.ts';
import type { GovernanceIRBundle } from './types.ts';

function hasResolvedTask(input: CompileInput): input is ResolvedCompileInput {
  return 'resolvedTask' in input;
}

export async function buildGovernanceIR(input: CompileInput, sources?: CompileSources): Promise<GovernanceIRBundle> {
  const resolvedTask = hasResolvedTask(input)
    ? input.resolvedTask
    : resolveTask({
        task: input.task,
        candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
        interpretationMode: input.interpretationMode,
      });

  const loadedSources = sources ?? await loadCompileSources(input);

  const bundleWithoutFingerprints: Omit<GovernanceIRBundle, 'fingerprints'> = {
    irVersion: 'governance-ir/v1',
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
      projectRoot: input.projectRoot,
    },
  };

  return {
    ...bundleWithoutFingerprints,
    fingerprints: buildIRFingerprints(bundleWithoutFingerprints),
  };
}
