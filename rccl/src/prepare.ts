import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { buildRepoIndex } from './indexing/build-repo-index.ts';
import { buildRepresentation } from './represent/build-representation.ts';
import { planSlices } from './slicing/plan-slices.ts';
import { buildSlicePrompt } from './prompt/build-slice-prompt.ts';
import type { PrepareRcclResult } from './types.ts';

export function prepareRccl(projectRootInput: string, options: { scope?: string } = {}): PrepareRcclResult {
  const projectRoot = resolve(projectRootInput);
  const scope = options.scope || 'auto';
  const indexedFiles = buildRepoIndex(projectRoot, scope);
  const representation = buildRepresentation(indexedFiles);
  const slices = planSlices(projectRoot, indexedFiles, representation);
  const windows = slices.flatMap((slice) => slice.windows);
  const contextMeta = loadContextMeta(projectRoot);
  const prompt = buildSlicePrompt({
    scope,
    slices,
    contextMeta,
    stats: {
      total_files: indexedFiles.length,
      indexed_files: indexedFiles.length,
      selected_slices: slices.length,
      windows: windows.length,
    },
  });

  const promptPath = writeArtifact(projectRoot, 'calibration-prompts', 'md', prompt, { scope, promptLength: prompt.length });
  const slicePlanPath = writeArtifact(projectRoot, 'rccl-slice-plans', 'json', JSON.stringify({ scope, representation, slices }, null, 2), { scope, slices: slices.length });
  const reportPath = writeArtifact(projectRoot, 'rccl-reports', 'json', JSON.stringify({
    scope,
    stats: {
      total_files: indexedFiles.length,
      indexed_files: indexedFiles.length,
      selected_slices: slices.length,
      windows: windows.length,
    },
    roots: representation.roots,
    modules: representation.modules.slice(0, 5),
    boundaries: representation.boundaries,
    migrations: representation.migrations,
    style_clusters: representation.style_clusters,
  }, null, 2), { scope, report: 'summary' });

  return {
    promptPath,
    metadata: {
      scope,
      stats: {
        total_files: indexedFiles.length,
        indexed_files: indexedFiles.length,
        selected_slices: slices.length,
        windows: windows.length,
      },
      reportPath,
      slicePlanPath,
    },
  };
}

function writeArtifact(projectRoot: string, folder: string, extension: string, content: string, seed: Record<string, unknown>): string {
  const digest = createHash('sha1').update(JSON.stringify(seed)).digest('hex').slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const path = join(projectRoot, '.resonant-code', 'context', folder, `${stamp}-${digest}.${extension}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  return path;
}

function loadContextMeta(projectRoot: string): { raw: string } | null {
  try {
    const raw = readFileSync(join(projectRoot, '.resonant-code', 'context', 'global.yaml'), 'utf-8');
    return { raw: raw.slice(0, 1200) };
  } catch {
    return null;
  }
}
