const RCCL_SCHEMA = `
version: "1.0"
generated_at: <auto-filled>
git_ref: <auto-filled>

observations:
  - id: "obs-<kebab-case-name>"
    category: <category>
    scope: "<glob>"
    pattern: "<description>"
    confidence: <0.0-1.0>
    adherence_quality: <quality>

    evidence:
      - file: "<relative-path>"
        line_range: [<start>, <end>]
        snippet: "<code>"

    verification:
      status: null
      verified_count: null
      verified_confidence: null
      checked_at: null
      disposition: null
`.trim();

const CATEGORY_HINTS = [
  { category: 'style', hint: 'Coding style patterns such as naming, formatting, or async style choices.' },
  { category: 'architecture', hint: 'Structural patterns such as module layout, layering, or dependency direction.' },
  { category: 'pattern', hint: 'Dominant reusable implementation patterns or composition strategies.' },
  { category: 'constraint', hint: 'Hard constraints visible in code such as export conventions or strict runtime boundaries.' },
  { category: 'legacy', hint: 'Legacy approaches still active in this area.' },
  { category: 'anti-pattern', hint: 'Patterns that clearly reduce code quality or safety.' },
  { category: 'migration', hint: 'Areas where old and new approaches are visibly mixed.' },
];

export function buildPrompt(sampleResult, scopeGlob, contextMeta) {
  const { samples, stats } = sampleResult;
  const lines = [];

  lines.push('# Repository Context Calibration');
  lines.push('');
  lines.push('You are generating RCCL observations for a coding agent.');
  lines.push('Extract only local signals that would materially affect code generation, modification, or review decisions.');
  lines.push('');
  lines.push('## What counts as a good observation');
  lines.push('');
  for (const { category, hint } of CATEGORY_HINTS) {
    lines.push(`- **${category}**: ${hint}`);
  }
  lines.push('');
  lines.push('Do not produce a repo summary, framework inventory, or generic documentation.');
  lines.push('Do not infer patterns that are not supported by the sampled code.');
  lines.push('');
  lines.push('## Output schema');
  lines.push('');
  lines.push('Return YAML that strictly follows this schema:');
  lines.push('');
  lines.push('```yaml');
  lines.push(RCCL_SCHEMA);
  lines.push('```');
  lines.push('');
  lines.push('## Hard rules');
  lines.push('');
  lines.push('1. Every observation must include non-empty `evidence` with real file paths, line ranges, and exact snippets copied from samples.');
  lines.push('2. `verification` must be present and every field inside it must be `null`.');
  lines.push('3. `id` must match `/^obs-[a-z0-9-]+$/`.');
  lines.push('4. `confidence` must reflect how likely the pattern is real in this scope, not how important it is.');
  lines.push('5. `adherence_quality` must be one of `good`, `inconsistent`, or `poor`.');
  lines.push('6. Prefer 5 to 12 observations. Skip weak or redundant signals.');
  lines.push('7. Split observations by meaning, not by file. Merge multiple evidence entries when they support the same pattern.');
  lines.push('8. Choose stable, semantic IDs. Prefer names like `obs-promise-chain` or `obs-feature-folder-structure`, not file-specific names.');
  lines.push('');

  if (contextMeta?.raw) {
    lines.push('## Repository context');
    lines.push('');
    lines.push('```yaml');
    lines.push(contextMeta.raw);
    lines.push('```');
    lines.push('');
  }

  lines.push(`## Scope: \`${scopeGlob}\``);
  lines.push(`Files in scope: ${stats.total} | Sampled: ${stats.sampled} | Truncated: ${stats.truncated}`);
  lines.push('');
  lines.push('## Code samples');
  lines.push('');

  for (const sample of samples) {
    lines.push(`### ${sample.file} (${sample.totalLines} lines${sample.truncated ? ', truncated' : ''})`);
    lines.push('```');
    lines.push(sample.content);
    lines.push('```');
    lines.push('');
  }

  lines.push('Return only the RCCL YAML. Do not add explanation before or after it.');
  return lines.join('\n');
}
