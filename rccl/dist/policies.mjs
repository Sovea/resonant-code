//#region src/policies.ts
const DEFAULT_SAMPLING_POLICY = {
	max_slices: 8,
	max_files_per_slice: 4,
	max_windows_per_file: 3,
	target_coverage: {
		roots: true,
		modules: true,
		boundaries: true,
		migrations: true,
		style_clusters: true
	}
};
const DEFAULT_VERIFICATION_POLICY = {
	snippet_similarity_threshold: .75,
	min_evidence_for_directory_scope: 2,
	min_evidence_for_cross_root_scope: 3,
	anti_pattern_min_evidence: 2,
	migration_min_evidence: 2
};
//#endregion
export { DEFAULT_SAMPLING_POLICY, DEFAULT_VERIFICATION_POLICY };
