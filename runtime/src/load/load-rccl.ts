import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RcclDocument } from '../types.ts';

interface RcclModule {
  parseRccl: (yamlText: string, options?: { allowVerifiedFields?: boolean }) => {
    valid: boolean;
    data?: RcclDocument;
    errors?: string[];
  };
}

/**
 * Loads RCCL from disk via the RCCL package's canonical parser/normalizer.
 */
export async function loadRccl(filePath?: string): Promise<RcclDocument | null> {
  if (!filePath || !existsSync(filePath)) return null;
  const rccl = await loadRcclModule();
  const parsed = rccl.parseRccl(readFileSync(filePath, 'utf-8'), { allowVerifiedFields: true });
  if (!parsed.valid || !parsed.data) {
    throw new Error(`Failed to parse RCCL document: ${parsed.errors?.join('; ') || 'unknown parse error'}`);
  }
  return parsed.data;
}

async function loadRcclModule(): Promise<RcclModule> {
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'rccl', 'dist', 'index.mjs');
  return import(pathToFileURL(entry).href) as Promise<RcclModule>;
}
