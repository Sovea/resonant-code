import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RcclDocument, RcclObservation } from '../types.ts';

interface RcclModule {
  verifyObservationEvidence: (observation: RcclObservation, projectRoot: string, checkedAt: string) => RcclObservation;
  verifyObservationInduction: (observation: RcclObservation) => RcclObservation;
}

/**
 * Verifies RCCL evidence statically when verification fields are missing, and always reruns induction verification.
 */
export async function verifyRcclDocument(rccl: RcclDocument, projectRoot: string, now = new Date()): Promise<RcclDocument> {
  const checkedAt = now.toISOString();
  const rcclModule = await loadRcclModule();
  return {
    ...rccl,
    observations: rccl.observations.map((observation) => needsVerification(observation)
      ? rcclModule.verifyObservationInduction(rcclModule.verifyObservationEvidence(observation, projectRoot, checkedAt))
      : rcclModule.verifyObservationInduction(observation)),
  };
}

function needsVerification(observation: RcclObservation): boolean {
  return !observation.verification.evidence_status || !observation.verification.checked_at;
}

async function loadRcclModule(): Promise<RcclModule> {
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'rccl', 'dist', 'index.mjs');
  return import(pathToFileURL(entry).href) as Promise<RcclModule>;
}
