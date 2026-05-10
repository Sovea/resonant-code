import type { ContractPayloadDiagnosticEntry, ContractPayloadDiagnostics, HostProposalSourceInput } from './types.ts';

export function buildContractPayloadDiagnostics(
  kind: ContractPayloadDiagnostics['kind'],
  entries: ContractPayloadDiagnosticEntry[],
  source?: HostProposalSourceInput,
): ContractPayloadDiagnostics {
  const summary = {
    total: entries.length,
    accepted: 0,
    rejected: 0,
    downgraded: 0,
    unused: 0,
  };

  for (const entry of entries) summary[entry.status] += 1;

  return {
    kind,
    ...(source ? { source } : {}),
    summary,
    entries,
  };
}
