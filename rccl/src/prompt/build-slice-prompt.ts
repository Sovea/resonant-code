import type { CalibrationSlice } from '../types.ts';

const RCCL_SCHEMA = `
version: "1.0"
generated_at: <auto-filled>
git_ref: <auto-filled>

observations:
  - id: "obs-<kebab-case-name>"
    semantic_key: "<stable-kebab-case-semantic-identity>"
    category: <category>
    scope: "<glob>"
    pattern: "<human-readable-description>"
    confidence: <0.0-1.0>
    adherence_quality: <quality>

    evidence:
      - file: "<relative-path>"
        line_range: [<start>, <end>]
        snippet: "<code>"

    support:
      source_slices: []
      file_count: <number>
      cluster_count: <number>
      scope_basis: <single-file|directory-cluster|module-cluster|cross-root>

    verification:
      evidence_status: null
      evidence_verified_count: null
      evidence_confidence: null
      induction_status: null
      induction_confidence: null
      checked_at: null
      disposition: null
`.trim();

export function buildSlicePrompt(input: {
  scope: string;
  slices: CalibrationSlice[];
  contextMeta?: { raw: string } | null;
  stats: { total_files: number; indexed_files: number; selected_slices: number; windows: number };
}): string {
  const lines: string[] = [];
  lines.push('# Repository Context Calibration');
  lines.push('');
  lines.push('You are generating RCCL observations for a coding agent.');
  lines.push('Extract only local signals that materially affect code generation, modification, or review decisions.');
  lines.push('Work from the repository slices below. Prefer observations supported across multiple slices when possible.');
  lines.push('Do not write a repo summary or framework inventory.');
  lines.push('');
  lines.push('## Output schema');
  lines.push('```yaml');
  lines.push(RCCL_SCHEMA);
  lines.push('```');
  lines.push('');
  lines.push('## Hard rules');
  lines.push('1. Every observation must include non-empty evidence with exact file paths, line ranges, and snippets from the provided windows.');
  lines.push('2. Evidence snippets are verification anchors, not labels: include the smallest self-contained code fragment that proves the observation, usually at least 2 lines or a distinctive full statement/block.');
  lines.push('3. Do not use single identifiers, isolated keywords, or paraphrased summaries as snippets unless the provided window itself is only that small.');
  lines.push('4. Leave every verification field null.');
  lines.push('5. semantic_key is required and must stay stable across synonymous phrasings and repeated calibrations.');
  lines.push('6. pattern should stay human-readable and descriptive, but semantic_key is the primary identity.');
  lines.push('7. Scope should be no broader than the evidence supports.');
  lines.push('8. Use support metadata to reflect where the observation came from.');
  lines.push('9. Prefer 5 to 12 observations and skip weak or redundant signals.');
  lines.push('10. If you cannot supply a verifiable snippet for an observation, omit that observation instead of guessing.');
  lines.push('');
  if (input.contextMeta?.raw) {
    lines.push('## Repository context');
    lines.push('```yaml');
    lines.push(input.contextMeta.raw);
    lines.push('```');
    lines.push('');
  }
  lines.push(`## Scope: \`${input.scope}\``);
  lines.push(`Indexed files: ${input.stats.indexed_files}/${input.stats.total_files} | Selected slices: ${input.stats.selected_slices} | Windows: ${input.stats.windows}`);
  lines.push('');
  lines.push('## Calibration slices');
  lines.push('');
  for (const slice of input.slices) {
    lines.push(`### ${slice.id} (${slice.kind})`);
    lines.push(`Rationale: ${slice.rationale}`);
    lines.push(`Files: ${slice.files.join(', ')}`);
    for (const window of slice.windows) {
      lines.push(`#### ${window.file}:${window.start_line}-${window.end_line} [${window.purpose}]`);
      lines.push('```');
      lines.push(window.snippet);
      lines.push('```');
    }
    lines.push('');
  }
  lines.push('Return only the RCCL YAML. Do not add explanation before or after it.');
  return lines.join('\n');
}
