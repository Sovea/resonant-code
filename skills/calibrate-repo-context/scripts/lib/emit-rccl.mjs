import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { toYaml } from './to-yaml.mjs';
import { parseRccl } from './parse-rccl.mjs';

/**
 * Reads the current git ref for provenance metadata.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
function getGitRef(projectRoot) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Loads a previously written RCCL file, including runtime-filled verification fields.
 *
 * @param {string} outputPath
 * @returns {object | null}
 */
function loadExistingRccl(outputPath) {
  try {
    const raw = readFileSync(outputPath, 'utf-8');
    // Existing RCCL already contains runtime-filled verification fields.
    const parsed = parseRccl(raw, { allowVerifiedFields: true });
    return parsed.valid ? parsed.data : null;
  } catch {
    return null;
  }
}

export function emitRccl(rccl, projectRoot) {
  const outputDir = join(projectRoot, '.resonant-code');
  const outputPath = join(outputDir, 'rccl.yaml');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const existing = loadExistingRccl(outputPath);
  let added = 0;
  let updated = 0;
  let preserved = 0;

  const newIds = new Set(rccl.observations.map(observation => observation.id));
  const mergedObservations = [];

  if (existing?.observations) {
    const existingById = new Map(existing.observations.map(observation => [observation.id, observation]));

    // New observations replace same-id entries; unmatched older entries stay as history.
    for (const observation of rccl.observations) {
      if (existingById.has(observation.id)) {
        updated += 1;
      } else {
        added += 1;
      }
      mergedObservations.push(observation);
    }

    for (const observation of existing.observations) {
      if (!newIds.has(observation.id)) {
        preserved += 1;
        mergedObservations.push(observation);
      }
    }
  } else {
    added = rccl.observations.length;
    mergedObservations.push(...rccl.observations);
  }

  const finalDoc = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    git_ref: getGitRef(projectRoot),
    // Stable ordering keeps diffs reviewable and makes repeated commits predictable.
    observations: mergedObservations.sort((a, b) => a.id.localeCompare(b.id)),
  };

  writeFileSync(outputPath, toYaml(finalDoc), 'utf-8');

  return {
    written: '.resonant-code/rccl.yaml',
    stats: { added, updated, preserved },
  };
}
