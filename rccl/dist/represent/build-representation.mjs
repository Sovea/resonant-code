//#region src/represent/build-representation.ts
function buildRepresentation(indexedFiles) {
	return {
		roots: buildRoots(indexedFiles),
		modules: buildModules(indexedFiles),
		boundaries: buildBoundaries(indexedFiles),
		migrations: buildMigrations(indexedFiles),
		style_clusters: buildStyleClusters(indexedFiles)
	};
}
function buildRoots(indexedFiles) {
	const grouped = /* @__PURE__ */ new Map();
	for (const file of indexedFiles) {
		const list = grouped.get(file.package_root) ?? [];
		list.push(file);
		grouped.set(file.package_root, list);
	}
	return [...grouped.entries()].map(([root, files]) => ({
		root,
		file_count: files.length,
		languages: [...new Set(files.map((file) => file.language))].sort()
	})).sort((a, b) => b.file_count - a.file_count || a.root.localeCompare(b.root));
}
function buildModules(indexedFiles) {
	const grouped = /* @__PURE__ */ new Map();
	for (const file of indexedFiles) {
		const basePath = inferBasePath(file.path);
		const list = grouped.get(basePath) ?? [];
		list.push(file);
		grouped.set(basePath, list);
	}
	return [...grouped.entries()].map(([base_path, files]) => ({
		id: `module:${base_path.replace(/[^a-zA-Z0-9]+/g, "-")}`,
		base_path,
		file_paths: files.map((file) => file.path).sort(),
		dominant_language: dominant(files.map((file) => file.language))
	})).sort((a, b) => b.file_paths.length - a.file_paths.length || a.base_path.localeCompare(b.base_path));
}
function buildBoundaries(indexedFiles) {
	const files = indexedFiles.filter((file) => file.role_hints.includes("observed-boundary-file") || file.role_hints.includes("observed-adapter-file"));
	if (files.length === 0) return [];
	return [{
		id: "boundary:observed-file-hints",
		file_paths: files.map((file) => file.path).sort(),
		reason: "Observed file-path hints suggest boundary or adapter responsibilities"
	}];
}
function buildMigrations(indexedFiles) {
	const files = indexedFiles.filter((file) => file.role_hints.includes("observed-legacy-signal"));
	if (files.length === 0) return [];
	return [{
		id: "migration:observed-legacy-signals",
		file_paths: files.map((file) => file.path).sort(),
		reason: "Observed file contents include legacy, deprecated, or TODO/FIXME signals"
	}];
}
function buildStyleClusters(indexedFiles) {
	const highImport = indexedFiles.filter((file) => file.imports_count >= 8);
	const interfaceHeavy = indexedFiles.filter((file) => file.role_hints.includes("observed-interface-heavy"));
	const result = [];
	if (highImport.length > 0) result.push({
		id: "style:observed-high-import-density",
		file_paths: highImport.map((file) => file.path).sort(),
		reason: "Observed import density is comparatively high in these files"
	});
	if (interfaceHeavy.length > 0) result.push({
		id: "style:observed-interface-heavy",
		file_paths: interfaceHeavy.map((file) => file.path).sort(),
		reason: "Observed interface, protocol, trait, or exported-type signals cluster in these files"
	});
	return result;
}
function inferBasePath(filePath) {
	const segments = filePath.split("/").filter(Boolean);
	if (segments.length === 0) return filePath;
	if (segments.length === 1) return segments[0];
	return segments.slice(0, Math.min(2, segments.length)).join("/");
}
function dominant(values) {
	const counts = /* @__PURE__ */ new Map();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "unknown";
}
//#endregion
export { buildRepresentation };
