import type { CalibrationSlice, RcclCalibrationStats, RcclWorkflowDiscoveryDocument } from '../types.ts';

const CRITIQUE_SCHEMA = `
version: "1.0"
stage: critique
generated_at: <auto-filled-or-null>
scope: "<scope>"

reviews:
  - seed_id: "obs-<seed-id-from-discovery>"
    disposition: <keep|revise|drop>
    reasons:
      - "<reason>"
    issues:
      - "<optional-issue>"
    counter_evidence:
      - file: "<relative-path>"
        line_range: [<start>, <end>]
        snippet: "<code>"
    recommended_scope_hint: "<optional-narrower-scope-or-null>"
`.trim();

export function buildCritiquePrompt(input: {
  scope: string;
  discovery: RcclWorkflowDiscoveryDocument;
  slices: CalibrationSlice[];
  contextMeta?: { raw: string } | null;
  stats: RcclCalibrationStats;
}): string {
  const lines: string[] = [];
  lines.push('# RCCL Calibration Workflow - Critique');
  lines.push('');
  lines.push('You are reviewing discovery-stage calibration seeds before synthesis.');
  lines.push('Your job is to find weak evidence, overgeneralization, duplicate meanings, missing counterexamples, and unclear decision impact.');
  lines.push('Do not write final RCCL observations or candidate RCCL YAML. Produce critique reviews only.');
  lines.push('');
  lines.push('## Output schema');
  lines.push('```yaml');
  lines.push(CRITIQUE_SCHEMA);
  lines.push('```');
  lines.push('');
  lines.push('## Hard rules');
  lines.push('1. Review every discovery seed exactly once using its seed_id.');
  lines.push('2. Use disposition keep only when evidence, scope, and decision impact are all strong.');
  lines.push('3. Use revise when the signal is useful but scope, wording, evidence, or duplication needs correction.');
  lines.push('4. Use drop when evidence is weak, redundant, summary-like, or not decision-impacting.');
  lines.push('5. Include counter_evidence only when you can cite a concrete provided window.');
  lines.push('6. Prefer narrowing scope over preserving broad claims.');
  lines.push('7. Return only the YAML document. Do not add explanation before or after it.');
  lines.push('');
  appendContext(lines, input.contextMeta);
  lines.push('## Discovery artifact');
  lines.push('```yaml');
  lines.push(serializeDiscovery(input.discovery));
  lines.push('```');
  lines.push('');
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

function serializeDiscovery(discovery: RcclWorkflowDiscoveryDocument): string {
  return JSON.stringify(discovery, null, 2);
}
