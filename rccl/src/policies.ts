import type { SamplingPolicy, VerificationPolicy } from './types.ts';

export const DEFAULT_SAMPLING_POLICY: SamplingPolicy = {
  max_slices: 8,
  max_files_per_slice: 4,
  max_windows_per_file: 3,
  target_coverage: {
    roots: true,
    modules: true,
    boundaries: true,
    migrations: true,
    style_clusters: true,
  },
};

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  snippet_similarity_threshold: 0.75,
  min_evidence_for_directory_scope: 2,
  min_evidence_for_cross_root_scope: 3,
  anti_pattern_min_evidence: 2,
  migration_min_evidence: 2,
};
