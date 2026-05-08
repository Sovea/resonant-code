import type { CalibrationSlice, RcclCalibrationStats } from '../types.ts';

const DISCOVERY_SCHEMA = `
version: "1.0"
stage: discover
generated_at: <auto-filled-or-null>
scope: "<scope>"

seeds:
  - seed_id: "obs-<kebab-case-name>"
    semantic_key: "<stable-kebab-case-semantic-identity>"
    category: <category>
    scope_hint: "<glob>"
    pattern: "<human-readable-observed-pattern>"
    decision_impact: "<how-this-would-change-code-generation-or-review>"

    evidence:
      - file: "<relative-path>"
        line_range: [<start>, <end>]
        snippet: "<code>"

    source_slice_ids: ["<slice-id>"]
    uncertainty: "<optional-limit-or-null>"
`.trim();

export function buildDiscoveryPrompt(input: {
  scope: string;
  slices: CalibrationSlice[];
  contextMeta?: { raw: string } | null;
  stats: RcclCalibrationStats;
}): string {
  const lines: string[] = [];
  lines.push('# RCCL Calibration Workflow - Discover');
  lines.push('');
  lines.push('You are performing the discovery stage for repository context calibration.');
  lines.push('Find only observational signals that would materially affect future code generation, modification, or review decisions.');
  lines.push('Do not write final RCCL observations. Produce discovery seeds only.');
  lines.push('Prefer fewer, stronger seeds over broad repository summaries.');
  lines.push('');
  lines.push('## Output schema');
  lines.push('```yaml');
  lines.push(DISCOVERY_SCHEMA);
  lines.push('```');
  lines.push('');
  lines.push('## Hard rules');
  lines.push('1. Every seed must include non-empty evidence copied from the provided windows.');
  lines.push('2. Evidence snippets must be the smallest self-contained code fragment that proves the seed.');
  lines.push('3. Do not use single identifiers, isolated keywords, or paraphrases as evidence snippets.');
  lines.push('4. scope_hint must be no broader than the cited evidence supports.');
  lines.push('5. decision_impact must explain why this signal would matter to a coding agent.');
  lines.push('6. Record uncertainty instead of inflating confidence or generalizing beyond evidence.');
  lines.push('7. Return 5 to 12 seeds unless the provided windows support fewer.');
  lines.push('8. Return only the YAML document. Do not add explanation before or after it.');
  lines.push('');
  appendContext(lines, input.contextMeta);
  appendSlices(lines, input.scope, input.stats, input.slices);
  return lines.join('\n');
}

function appendContext(lines: string[], contextMeta?: { raw: string } | null): void {
  if (!contextMeta?.raw) return;
  lines.push('## Repository context');
  lines.push('```yaml');
  lines.push(contextMeta.raw);
  lines.push('```');
  lines.push('');
}

function appendSlices(lines: string[], scope: string, stats: RcclCalibrationStats, slices: CalibrationSlice[]): void {
  lines.push(`## Scope: \`${scope}\``);
  lines.push(`Indexed files: ${stats.indexed_files}/${stats.total_files} | Selected slices: ${stats.selected_slices} | Windows: ${stats.windows}`);
  lines.push('');
  lines.push('## Calibration slices');
  lines.push('');
  for (const slice of slices) {
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
}
