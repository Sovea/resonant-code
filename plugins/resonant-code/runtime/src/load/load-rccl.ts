import { existsSync, readFileSync } from 'node:fs';
import { parseYaml } from '../utils/yaml.ts';
import type { RcclDocument, RcclObservation } from '../types.ts';

/**
 * Loads RCCL from disk and normalizes verification fields.
 */
export function loadRccl(filePath?: string): RcclDocument | null {
  if (!filePath || !existsSync(filePath)) return null;
  const parsed = parseYaml(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  const observations = Array.isArray(parsed.observations)
    ? parsed.observations.map(normalizeObservation)
    : [];
  return {
    version: String(parsed.version ?? '1.0'),
    generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : null,
    git_ref: typeof parsed.git_ref === 'string' ? parsed.git_ref : null,
    observations,
  };
}

function normalizeObservation(input: unknown): RcclObservation {
  const item = input as Record<string, unknown>;
  const verification = (item.verification ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id),
    category: item.category as RcclObservation['category'],
    scope: String(item.scope),
    pattern: String(item.pattern),
    confidence: Number(item.confidence ?? 0),
    adherence_quality: item.adherence_quality as RcclObservation['adherence_quality'],
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((evidence) => {
          const value = evidence as Record<string, unknown>;
          const lineRange = (value.line_range as unknown[]) ?? [1, 1];
          return {
            file: String(value.file),
            line_range: [Number(lineRange[0]), Number(lineRange[1])] as [number, number],
            snippet: String(value.snippet ?? ''),
          };
        })
      : [],
    verification: {
      status: (verification.status ?? null) as any,
      verified_count: verification.verified_count == null ? null : Number(verification.verified_count),
      verified_confidence: verification.verified_confidence == null ? null : Number(verification.verified_confidence),
      checked_at: typeof verification.checked_at === 'string' ? verification.checked_at : null,
      disposition: (verification.disposition ?? null) as any,
    },
  };
}
