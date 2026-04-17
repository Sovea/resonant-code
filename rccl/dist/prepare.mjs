import { buildRepoIndex } from "./indexing/build-repo-index.mjs";
import { buildRepresentation } from "./represent/build-representation.mjs";
import { planSlices } from "./slicing/plan-slices.mjs";
import { buildSlicePrompt } from "./prompt/build-slice-prompt.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
//#region src/prepare.ts
const FALSEY_FLAG_VALUES = new Set([
	"0",
	"false",
	"no",
	"off"
]);
function prepareRccl(projectRootInput, options = {}) {
	const projectRoot = resolve(projectRootInput);
	const scope = options.scope || "auto";
	const indexedFiles = buildRepoIndex(projectRoot, scope);
	const representation = buildRepresentation(indexedFiles);
	const slices = planSlices(projectRoot, indexedFiles, representation);
	const windows = slices.flatMap((slice) => slice.windows);
	const prompt = buildSlicePrompt({
		scope,
		slices,
		contextMeta: loadContextMeta(projectRoot),
		stats: {
			total_files: indexedFiles.length,
			indexed_files: indexedFiles.length,
			selected_slices: slices.length,
			windows: windows.length
		}
	});
	const debugArtifacts = shouldEmitDebugArtifacts(options.debugArtifacts) ? {
		enabled: true,
		promptPath: writeArtifact(projectRoot, "calibration-prompts", "md", prompt, {
			scope,
			promptLength: prompt.length
		}),
		slicePlanPath: writeArtifact(projectRoot, "rccl-slice-plans", "json", JSON.stringify({
			scope,
			representation,
			slices
		}, null, 2), {
			scope,
			slices: slices.length
		}),
		reportPath: writeArtifact(projectRoot, "rccl-reports", "json", JSON.stringify({
			scope,
			stats: {
				total_files: indexedFiles.length,
				indexed_files: indexedFiles.length,
				selected_slices: slices.length,
				windows: windows.length
			},
			roots: representation.roots,
			modules: representation.modules.slice(0, 5),
			boundaries: representation.boundaries,
			migrations: representation.migrations,
			style_clusters: representation.style_clusters
		}, null, 2), {
			scope,
			report: "summary"
		})
	} : { enabled: false };
	return {
		prompt,
		metadata: {
			scope,
			stats: {
				total_files: indexedFiles.length,
				indexed_files: indexedFiles.length,
				selected_slices: slices.length,
				windows: windows.length
			}
		},
		debugArtifacts
	};
}
function shouldEmitDebugArtifacts(explicit) {
	if (explicit !== void 0) return explicit;
	const value = process.env.RESONANT_CODE_DEBUG_ARTIFACTS;
	if (!value) return false;
	return !FALSEY_FLAG_VALUES.has(String(value).trim().toLowerCase());
}
function writeArtifact(projectRoot, folder, extension, content, seed) {
	const digest = createHash("sha1").update(JSON.stringify(seed)).digest("hex").slice(0, 10);
	const path = join(projectRoot, ".resonant-code", "context", folder, `${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${digest}.${extension}`);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf-8");
	return path;
}
function loadContextMeta(projectRoot) {
	try {
		return { raw: readFileSync(join(projectRoot, ".resonant-code", "context", "global.yaml"), "utf-8").slice(0, 1200) };
	} catch {
		return null;
	}
}
//#endregion
export { prepareRccl };
