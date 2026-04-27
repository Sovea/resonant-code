import type { SemanticMergeDirectiveLink } from '../../types.ts';
import type { ExecutionDecisionIR } from '../types.ts';

const MAX_DRIFT_DETAILS = 5;

export interface ExecutionShadowDriftDetail {
  directiveId: string;
  legacyMode?: SemanticMergeDirectiveLink['execution_mode'];
  irMode?: ExecutionDecisionIR['mode'];
  legacyDefaultMode?: SemanticMergeDirectiveLink['default_execution_mode'];
  irDefaultMode?: ExecutionDecisionIR['defaultMode'];
  legacyBasis?: ExecutionDecisionIR['basis'];
  irBasis?: ExecutionDecisionIR['basis'];
  legacyContextApplied: string[];
  irContextApplied: string[];
  reason: string;
}

export interface ExecutionShadowComparison {
  legacyCount: number;
  irCount: number;
  matchedDirectives: number;
  missingInIR: number;
  extraInIR: number;
  modeMismatches: number;
  defaultModeMismatches: number;
  basisMismatches: number;
  contextMismatches: number;
  legacyModeCounts: Record<string, number>;
  irModeCounts: Record<string, number>;
  driftDetails: ExecutionShadowDriftDetail[];
}

export function compareExecutionDecisions(
  legacyDecisions: SemanticMergeDirectiveLink[],
  irDecisions: ExecutionDecisionIR[],
): ExecutionShadowComparison {
  const legacyByDirective = new Map(legacyDecisions.map((decision) => [decision.directive_id, decision]));
  const irByDirective = new Map(irDecisions.map((decision) => [decision.directiveId, decision]));
  const allDirectives = new Set([...legacyByDirective.keys(), ...irByDirective.keys()]);
  const driftDetails: ExecutionShadowDriftDetail[] = [];

  let matchedDirectives = 0;
  let missingInIR = 0;
  let extraInIR = 0;
  let modeMismatches = 0;
  let defaultModeMismatches = 0;
  let basisMismatches = 0;
  let contextMismatches = 0;

  for (const directiveId of allDirectives) {
    const legacy = legacyByDirective.get(directiveId);
    const ir = irByDirective.get(directiveId);
    if (!legacy) {
      extraInIR += 1;
      pushDriftDetail(driftDetails, buildExecutionDriftDetail(directiveId, legacy, ir, 'extra IR execution decision without a legacy counterpart'));
      continue;
    }
    if (!ir) {
      missingInIR += 1;
      pushDriftDetail(driftDetails, buildExecutionDriftDetail(directiveId, legacy, ir, 'legacy execution decision missing from IR decisions'));
      continue;
    }

    matchedDirectives += 1;
    const legacyMappedBasis = legacyBasis(legacy.decision_basis);
    const modeMismatch = legacy.execution_mode !== ir.mode;
    const defaultModeMismatch = legacy.default_execution_mode !== ir.defaultMode;
    const basisMismatch = legacyMappedBasis !== ir.basis;
    const contextMismatch = formatList(legacy.context_applied) !== formatList(ir.contextApplied);

    if (modeMismatch) modeMismatches += 1;
    if (defaultModeMismatch) defaultModeMismatches += 1;
    if (basisMismatch) basisMismatches += 1;
    if (contextMismatch) contextMismatches += 1;
    if (modeMismatch || defaultModeMismatch || basisMismatch || contextMismatch) {
      pushDriftDetail(driftDetails, buildExecutionDriftDetail(directiveId, legacy, ir, ir.reason));
    }
  }

  return {
    legacyCount: legacyDecisions.length,
    irCount: irDecisions.length,
    matchedDirectives,
    missingInIR,
    extraInIR,
    modeMismatches,
    defaultModeMismatches,
    basisMismatches,
    contextMismatches,
    legacyModeCounts: countLegacyModes(legacyDecisions),
    irModeCounts: countIRModes(irDecisions),
    driftDetails,
  };
}

export function summarizeExecutionShadowComparison(comparison: ExecutionShadowComparison): string[] {
  return [
    `legacy_decisions: ${comparison.legacyCount}`,
    `ir_decisions: ${comparison.irCount}`,
    `matched_directives: ${comparison.matchedDirectives}`,
    `missing_in_ir: ${comparison.missingInIR}`,
    `extra_in_ir: ${comparison.extraInIR}`,
    `mode_mismatches: ${comparison.modeMismatches}`,
    `default_mode_mismatches: ${comparison.defaultModeMismatches}`,
    `basis_mismatches: ${comparison.basisMismatches}`,
    `context_mismatches: ${comparison.contextMismatches}`,
    `legacy_mode_distribution: ${formatRecord(comparison.legacyModeCounts)}`,
    `ir_mode_distribution: ${formatRecord(comparison.irModeCounts)}`,
    ...comparison.driftDetails.map(formatDriftDetail),
  ];
}

function buildExecutionDriftDetail(
  directiveId: string,
  legacy: SemanticMergeDirectiveLink | undefined,
  ir: ExecutionDecisionIR | undefined,
  reason: string,
): ExecutionShadowDriftDetail {
  return {
    directiveId,
    legacyMode: legacy?.execution_mode,
    irMode: ir?.mode,
    legacyDefaultMode: legacy?.default_execution_mode,
    irDefaultMode: ir?.defaultMode,
    legacyBasis: legacy ? legacyBasis(legacy.decision_basis) : undefined,
    irBasis: ir?.basis,
    legacyContextApplied: legacy?.context_applied ?? [],
    irContextApplied: ir?.contextApplied ?? [],
    reason,
  };
}

function legacyBasis(decisionBasis: SemanticMergeDirectiveLink['decision_basis']): ExecutionDecisionIR['basis'] {
  switch (decisionBasis) {
    case 'default':
      return 'prescription';
    case 'observed-conflict':
      return 'semantic-relation';
    case 'anti-pattern':
      return 'anti-pattern';
    case 'rccl-immune':
      return 'verification';
    case 'context-adjusted':
      return 'task-context';
  }
}

function pushDriftDetail(details: ExecutionShadowDriftDetail[], detail: ExecutionShadowDriftDetail): void {
  if (details.length >= MAX_DRIFT_DETAILS) return;
  details.push(detail);
}

function countLegacyModes(decisions: SemanticMergeDirectiveLink[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    counts[decision.execution_mode] = (counts[decision.execution_mode] ?? 0) + 1;
  }
  return counts;
}

function countIRModes(decisions: ExecutionDecisionIR[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    counts[decision.mode] = (counts[decision.mode] ?? 0) + 1;
  }
  return counts;
}

function formatDriftDetail(detail: ExecutionShadowDriftDetail, index: number): string {
  return `drift_${index + 1}: directive=${detail.directiveId} legacy=${detail.legacyMode ?? '(missing)'}/${detail.legacyDefaultMode ?? '(missing)'}/${detail.legacyBasis ?? '(missing)'} ir=${detail.irMode ?? '(missing)'}/${detail.irDefaultMode ?? '(missing)'}/${detail.irBasis ?? '(missing)'} context=${formatContextDiff(detail)} reason=${truncate(detail.reason)}`;
}

function formatContextDiff(detail: ExecutionShadowDriftDetail): string {
  const legacy = formatList(detail.legacyContextApplied) || '(none)';
  const ir = formatList(detail.irContextApplied) || '(none)';
  return legacy === ir ? legacy : `${legacy}->${ir}`;
}

function formatList(values: string[]): string {
  return [...values].sort().join('|');
}

function formatRecord(record: Record<string, number>): string {
  const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return '(none)';
  return entries.map(([key, count]) => `${key}=${count}`).join(', ');
}

function truncate(value: string): string {
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}
