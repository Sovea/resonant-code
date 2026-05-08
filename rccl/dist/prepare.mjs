import { buildRepoIndex } from "./indexing/build-repo-index.mjs";
import { buildRepresentation } from "./represent/build-representation.mjs";
import { planSlices } from "./slicing/plan-slices.mjs";
import { buildSlicePrompt } from "./prompt/build-slice-prompt.mjs";
import { buildDiscoveryPrompt } from "./prompt/build-discovery-prompt.mjs";
import { buildCritiquePrompt } from "./prompt/build-critique-prompt.mjs";
import { buildSynthesisPrompt } from "./prompt/build-synthesis-prompt.mjs";
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
	const context = buildPreparationContext(projectRootInput, options.scope);
	const prompt = buildSlicePrompt({
		scope: context.scope,
		slices: context.slices,
		contextMeta: context.contextMeta,
		stats: context.stats
	});
	const debugArtifacts = buildDebugArtifacts(context, prompt, "calibration-prompts", options.debugArtifacts);
	return {
		prompt,
		metadata: {
			scope: context.scope,
			stats: context.stats
		},
		debugArtifacts
	};
}
function prepareRcclWorkflowStage(projectRootInput, options) {
	const context = buildPreparationContext(projectRootInput, options.scope);
	const prompt = buildWorkflowPrompt(context, options);
	const debugArtifacts = buildDebugArtifacts(context, prompt, "rccl-workflow-prompts", options.debugArtifacts, { stage: options.stage });
	return {
		stage: options.stage,
		prompt,
		suggestedArtifactPath: suggestedWorkflowArtifactPath(context.projectRoot, options.stage, context.scope),
		metadata: {
			scope: context.scope,
			stats: context.stats
		},
		debugArtifacts
	};
}
function buildPreparationContext(projectRootInput, scopeInput) {
	const projectRoot = resolve(projectRootInput);
	const scope = scopeInput || "auto";
	const indexedFiles = buildRepoIndex(projectRoot, scope);
	const representation = buildRepresentation(indexedFiles);
	const slices = planSlices(projectRoot, indexedFiles, representation);
	const windows = slices.flatMap((slice) => slice.windows);
	return {
		projectRoot,
		scope,
		representation,
		slices,
		contextMeta: loadContextMeta(projectRoot),
		stats: {
			total_files: indexedFiles.length,
			indexed_files: indexedFiles.length,
			selected_slices: slices.length,
			windows: windows.length
		}
	};
}
function buildWorkflowPrompt(context, options) {
	if (options.stage === "discover") return buildDiscoveryPrompt({
		scope: context.scope,
		slices: context.slices,
		contextMeta: context.contextMeta,
		stats: context.stats
	});
	if (options.stage === "critique") {
		if (!options.discovery) throw new Error("prepare-stage critique requires a parsed discovery artifact");
		return buildCritiquePrompt({
			scope: context.scope,
			discovery: options.discovery,
			slices: context.slices,
			contextMeta: context.contextMeta,
			stats: context.stats
		});
	}
	if (!options.discovery) throw new Error("prepare-stage synthesize requires a parsed discovery artifact");
	if (!options.critique) throw new Error("prepare-stage synthesize requires a parsed critique artifact");
	return buildSynthesisPrompt({
		scope: context.scope,
		discovery: options.discovery,
		critique: options.critique,
		slices: context.slices,
		contextMeta: context.contextMeta,
		stats: context.stats
	});
}
function buildDebugArtifacts(context, prompt, promptFolder, debugArtifacts, seed = {}) {
	return shouldEmitDebugArtifacts(debugArtifacts) ? {
		enabled: true,
		promptPath: writeArtifact(context.projectRoot, promptFolder, "md", prompt, {
			scope: context.scope,
			promptLength: prompt.length,
			...seed
		}),
		slicePlanPath: writeArtifact(context.projectRoot, "rccl-slice-plans", "json", JSON.stringify({
			scope: context.scope,
			representation: context.representation,
			slices: context.slices
		}, null, 2), {
			scope: context.scope,
			slices: context.slices.length,
			...seed
		}),
		reportPath: writeArtifact(context.projectRoot, "rccl-reports", "json", JSON.stringify({
			scope: context.scope,
			stage: seed.stage,
			stats: context.stats,
			roots: context.representation.roots,
			modules: context.representation.modules.slice(0, 5),
			boundaries: context.representation.boundaries,
			migrations: context.representation.migrations,
			style_clusters: context.representation.style_clusters
		}, null, 2), {
			scope: context.scope,
			report: "summary",
			...seed
		})
	} : { enabled: false };
}
function suggestedWorkflowArtifactPath(projectRoot, stage, scope) {
	return join(projectRoot, ".resonant-code", "context", "rccl-workflow", `${stage}-${createHash("sha1").update(JSON.stringify({
		stage,
		scope
	})).digest("hex").slice(0, 10)}.yaml`);
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
export { prepareRccl, prepareRcclWorkflowStage };
