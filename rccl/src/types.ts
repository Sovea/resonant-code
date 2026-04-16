export type RcclCategory = 'style' | 'architecture' | 'pattern' | 'constraint' | 'legacy' | 'anti-pattern' | 'migration';
export type AdherenceQuality = 'good' | 'inconsistent' | 'poor';
export type VerificationDisposition = 'keep' | 'keep-with-reduced-confidence' | 'demote-to-ambient';
export type VerificationStatus = 'verified' | 'partial' | 'failed' | 'unverifiable';
export type InductionStatus = 'well-supported' | 'narrowly-supported' | 'overgeneralized' | 'ambiguous';
export type ScopeBasis = 'single-file' | 'directory-cluster' | 'module-cluster' | 'cross-root';

export interface RcclEvidence {
  file: string;
  line_range: [number, number];
  snippet: string;
}

export interface RcclSupport {
  source_slices: string[];
  file_count: number;
  cluster_count: number;
  scope_basis: ScopeBasis;
}

export interface RcclVerification {
  evidence_status: VerificationStatus | null;
  evidence_verified_count: number | null;
  evidence_confidence: number | null;
  induction_status: InductionStatus | null;
  induction_confidence: number | null;
  checked_at: string | null;
  disposition: VerificationDisposition | null;
}

export interface RcclObservation {
  id: string;
  semantic_key: string;
  category: RcclCategory;
  scope: string;
  pattern: string;
  confidence: number;
  adherence_quality: AdherenceQuality;
  evidence: RcclEvidence[];
  support: RcclSupport;
  verification: RcclVerification;
}

export interface RcclDocument {
  version: string;
  generated_at: string | null;
  git_ref: string | null;
  observations: RcclObservation[];
}

export interface ParsedRcclResult {
  valid: boolean;
  data?: RcclDocument;
  errors?: string[];
}

export interface CandidateSupportHint {
  scope_basis?: ScopeBasis | null;
  file_count?: number | null;
  cluster_count?: number | null;
}

export interface CandidateObservation {
  provisional_id: string;
  semantic_key: string;
  category: RcclCategory;
  scope_hint: string;
  pattern: string;
  confidence: number;
  adherence_quality: AdherenceQuality;
  evidence: RcclEvidence[];
  source_slice_ids: string[];
  support_hint?: CandidateSupportHint | null;
}

export interface CandidateRcclDocument {
  version: string;
  generated_at: string | null;
  git_ref: string | null;
  observations: CandidateObservation[];
}

export interface ParsedCandidateRcclResult {
  valid: boolean;
  data?: CandidateRcclDocument;
  errors?: string[];
}

export interface ConsolidatedObservation {
  id: string;
  semantic_key: string;
  candidate_ids: string[];
  category: RcclCategory;
  scope_hint: string;
  pattern: string;
  confidence: number;
  adherence_quality: AdherenceQuality;
  evidence: RcclEvidence[];
  source_slice_ids: string[];
  support: RcclSupport;
}

export interface ConsolidationGroupReport {
  id: string;
  semantic_key: string;
  candidate_ids: string[];
  category: RcclCategory;
  pattern: string;
  source_slice_ids: string[];
  evidence_files: string[];
  merge_basis: string;
  support_derivation_reason: string;
  scope_derivation_reason: string;
  derived_support: RcclSupport;
  final_scope: string;
}

export interface ConsolidationResult {
  observations: ConsolidatedObservation[];
  report: {
    candidate_count: number;
    merged_group_count: number;
    final_observation_count: number;
    groups: ConsolidationGroupReport[];
  };
}

export interface EmitRcclResult {
  written: string;
  stats: {
    added: number;
    updated: number;
    preserved: number;
  };
}

export interface IndexedFile {
  path: string;
  language: string;
  lines: number;
  is_test: boolean;
  is_generated: boolean;
  package_root: string;
  imports_count: number;
  exports_count: number;
  symbol_density: number;
  role_hints: string[];
}

export interface RepoRootSummary {
  root: string;
  file_count: number;
  languages: string[];
}

export interface ModuleCluster {
  id: string;
  base_path: string;
  file_paths: string[];
  dominant_language: string;
}

export interface BoundaryZone {
  id: string;
  file_paths: string[];
  reason: string;
}

export interface MigrationZone {
  id: string;
  file_paths: string[];
  reason: string;
}

export interface StyleCluster {
  id: string;
  file_paths: string[];
  reason: string;
}

export interface RepoRepresentation {
  roots: RepoRootSummary[];
  modules: ModuleCluster[];
  boundaries: BoundaryZone[];
  migrations: MigrationZone[];
  style_clusters: StyleCluster[];
}

export interface CalibrationWindow {
  file: string;
  start_line: number;
  end_line: number;
  purpose: 'header' | 'structure' | 'implementation';
  snippet: string;
}

export interface CalibrationSlice {
  id: string;
  kind: 'root' | 'module' | 'boundary' | 'migration' | 'style-cluster';
  files: string[];
  rationale: string;
  coverage_weight: number;
  windows: CalibrationWindow[];
}

export interface SamplingPolicy {
  max_slices: number;
  max_files_per_slice: number;
  max_windows_per_file: number;
  target_coverage: {
    roots: boolean;
    modules: boolean;
    boundaries: boolean;
    migrations: boolean;
    style_clusters: boolean;
  };
}

export interface VerificationPolicy {
  snippet_similarity_threshold: number;
  min_evidence_for_directory_scope: number;
  min_evidence_for_cross_root_scope: number;
  anti_pattern_min_evidence: number;
  migration_min_evidence: number;
}

export interface PrepareRcclResult {
  promptPath: string;
  metadata: {
    scope: string;
    stats: {
      total_files: number;
      indexed_files: number;
      selected_slices: number;
      windows: number;
    };
    reportPath: string;
    slicePlanPath: string;
  };
}
