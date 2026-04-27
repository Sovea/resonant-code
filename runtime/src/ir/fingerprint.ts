import { stableHash } from '../utils/hash.ts';
import type { GovernanceIRBundle, IRFingerprintSet } from './types.ts';

export function fingerprintPart(value: unknown): string {
  return stableHash([canonicalize(value)]);
}

export function buildIRFingerprints(input: Omit<GovernanceIRBundle, 'fingerprints'>): IRFingerprintSet {
  const task = fingerprintPart(input.task);
  const directives = fingerprintPart(input.directives);
  const observations = fingerprintPart(input.observations);
  const feedback = fingerprintPart(input.feedback);
  const hostProposals = fingerprintPart(input.hostProposals);
  return {
    task,
    directives,
    observations,
    feedback,
    hostProposals,
    bundle: fingerprintPart({
      irVersion: input.irVersion,
      sourceManifest: input.sourceManifest,
      task,
      directives,
      observations,
      feedback,
      hostProposals,
    }),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}
