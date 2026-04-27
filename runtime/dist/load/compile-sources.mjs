import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from "./load-playbook.mjs";
import { loadRccl } from "./load-rccl.mjs";
import { verifyRcclDocument } from "../verify/verify-rccl.mjs";
//#region src/load/compile-sources.ts
async function loadCompileSources(input) {
	const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
	const local = loadLocalPlaybook(input.localAugmentPath);
	const selectedLayerIds = local?.meta.extends.length ? resolveExtendedLayers(local.meta.extends, builtinLayers) : ["builtin/core"];
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
		allDirectives: [...builtinDirectives, ...local?.additions ?? []],
		rccl
	};
}
//#endregion
export { loadCompileSources };
