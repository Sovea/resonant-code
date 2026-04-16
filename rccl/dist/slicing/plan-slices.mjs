import { DEFAULT_SAMPLING_POLICY } from "../policies.mjs";
import { extractWindowsForFiles } from "./extract-windows.mjs";
//#region src/slicing/plan-slices.ts
function planSlices(projectRoot, indexedFiles, representation, policy = DEFAULT_SAMPLING_POLICY) {
	const fileMap = new Map(indexedFiles.map((file) => [file.path, file]));
	const slices = [];
	if (policy.target_coverage.roots) for (const root of representation.roots.slice(0, 2)) {
		const files = indexedFiles.filter((file) => file.package_root === root.root).slice(0, policy.max_files_per_slice);
		slices.push(makeSlice(projectRoot, `root:${root.root}`, "root", files, `Representative files from root ${root.root}`, 1, policy));
	}
	if (policy.target_coverage.modules) for (const module of representation.modules.slice(0, 3)) {
		const files = module.file_paths.map((path) => fileMap.get(path)).filter((value) => Boolean(value)).slice(0, policy.max_files_per_slice);
		slices.push(makeSlice(projectRoot, module.id, "module", files, `Representative files from module cluster ${module.base_path}`, .9, policy));
	}
	if (policy.target_coverage.boundaries) for (const boundary of representation.boundaries.slice(0, 1)) {
		const files = boundary.file_paths.map((path) => fileMap.get(path)).filter((value) => Boolean(value)).slice(0, policy.max_files_per_slice);
		slices.push(makeSlice(projectRoot, boundary.id, "boundary", files, boundary.reason, .85, policy));
	}
	if (policy.target_coverage.migrations) for (const migration of representation.migrations.slice(0, 1)) {
		const files = migration.file_paths.map((path) => fileMap.get(path)).filter((value) => Boolean(value)).slice(0, policy.max_files_per_slice);
		slices.push(makeSlice(projectRoot, migration.id, "migration", files, migration.reason, .8, policy));
	}
	if (policy.target_coverage.style_clusters) for (const cluster of representation.style_clusters.slice(0, 1)) {
		const files = cluster.file_paths.map((path) => fileMap.get(path)).filter((value) => Boolean(value)).slice(0, policy.max_files_per_slice);
		slices.push(makeSlice(projectRoot, cluster.id, "style-cluster", files, cluster.reason, .75, policy));
	}
	return slices.filter((slice) => slice.files.length > 0 && slice.windows.length > 0).slice(0, policy.max_slices);
}
function makeSlice(projectRoot, id, kind, files, rationale, coverage_weight, policy) {
	return {
		id,
		kind,
		files: files.map((file) => file.path),
		rationale,
		coverage_weight,
		windows: extractWindowsForFiles(projectRoot, files, policy)
	};
}
//#endregion
export { planSlices };
