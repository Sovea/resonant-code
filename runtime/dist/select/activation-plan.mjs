//#region src/select/activation-plan.ts
const LAYER_RANKS = {
	core: 5,
	languages: 4,
	frameworks: 3,
	domains: 2,
	local: 1
};
function getDirectiveLayerRank(layerId) {
	if (layerId === "local" || layerId.startsWith("local")) return LAYER_RANKS.local;
	if (layerId.includes("/domains/")) return LAYER_RANKS.domains;
	if (layerId.includes("/frameworks/")) return LAYER_RANKS.frameworks;
	if (layerId.includes("/languages/")) return LAYER_RANKS.languages;
	return LAYER_RANKS.core;
}
//#endregion
export { getDirectiveLayerRank };
