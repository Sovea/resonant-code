import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from './load-playbook.ts';
import { loadRccl } from './load-rccl.ts';
import { verifyRcclDocument } from '../verify/verify-rccl.ts';
import type { CompileInputBase, Directive, LocalPlaybook, RcclDocument } from '../types.ts';

export interface CompileSources {
  builtinLayers: Map<string, string>;
  local: LocalPlaybook | null;
  selectedLayerIds: string[];
  builtinDirectives: Directive[];
  allDirectives: Directive[];
  rccl: RcclDocument | null;
}

export async function loadCompileSources(input: CompileInputBase): Promise<CompileSources> {
  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const local = loadLocalPlaybook(input.localAugmentPath);
  const selectedLayerIds = local?.meta.extends.length
    ? resolveExtendedLayers(local.meta.extends, builtinLayers)
    : ['builtin/core'];
  const builtinDirectives = selectedLayerIds.flatMap((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return filePath ? loadDirectiveFile(filePath, layerId) : [];
  });
  const loadedRccl = await loadRccl(input.rcclPath);
  const rccl = loadedRccl ? await verifyRcclDocument(loadedRccl, input.projectRoot) : null;

  return {
    builtinLayers,
    local,
    selectedLayerIds,
    builtinDirectives,
    allDirectives: [...builtinDirectives, ...(local?.additions ?? [])],
    rccl,
  };
}
