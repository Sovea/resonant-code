import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILES = 30;
const MAX_LINES_PER_FILE = 100;

/** Files matching these patterns are sampled first (higher priority). */
const PRIORITY_PATTERNS = [
  /index\.[^/]+$/,              // entry points
  /^src\/[^/]+\.[^/]+$/,       // top-level src files
  /\/(api|routes|handlers?)\//,  // API layer
  /\/(hooks?|composables?)\//,   // framework hooks
  /\/(store|state)\//,           // state management
  /\/(utils?|helpers?|lib)\//,   // utilities
];

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Assigns a deterministic sampling priority based on path-level heuristics.
 *
 * @param {string} filepath
 * @returns {number}
 */
function priorityScore(filepath) {
  for (let i = 0; i < PRIORITY_PATTERNS.length; i++) {
    if (PRIORITY_PATTERNS[i].test(filepath)) return PRIORITY_PATTERNS.length - i;
  }
  return 0;
}

/**
 * Reads only the leading lines of a file so prompt size stays bounded.
 *
 * @param {string} projectRoot
 * @param {string} file
 * @param {number} maxLines
 * @returns {{ content: string, totalLines: number, truncated: boolean } | null}
 */
function readHead(projectRoot, file, maxLines) {
  try {
    const content = readFileSync(join(projectRoot, file), 'utf-8');
    const lines = content.split('\n');
    const truncated = lines.length > maxLines;
    return {
      content: lines.slice(0, maxLines).join('\n'),
      totalLines: lines.length,
      truncated,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * Sample relevant source files, prioritizing high-signal files.
 *
 * @param {string} projectRoot
 * @param {string[]} files — relative paths from collectScope
 * @param {{ maxFiles?: number, maxLines?: number }} opts
 * @returns {{
 *   samples: Array<{ file: string, totalLines: number, content: string, truncated: boolean }>,
 *   stats: { total: number, sampled: number, truncated: number }
 * }}
 */
export function sampleFiles(projectRoot, files, opts = {}) {
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const maxLines = opts.maxLines ?? MAX_LINES_PER_FILE;

  // Sort by priority score (desc), then alphabetically for stability
  const sorted = [...files].sort((a, b) => {
    const pa = priorityScore(a);
    const pb = priorityScore(b);
    if (pa !== pb) return pb - pa;
    return a.localeCompare(b);
  });

  const selected = sorted.slice(0, maxFiles);
  const samples = [];
  let truncated = 0;

  for (const file of selected) {
    const result = readHead(projectRoot, file, maxLines);
    if (!result) continue;
    if (result.truncated) truncated++;
    samples.push({ file, ...result });
  }

  return {
    samples,
    stats: {
      total: files.length,
      sampled: samples.length,
      truncated,
    },
  };
}
