import type { DirectiveObservationRelation } from '../../types.ts';
import type { SemanticRelationIR } from '../types.ts';
import { semanticRelationsIRToLegacy } from './legacy-mapping.ts';

const MAX_DRIFT_DETAILS = 5;
const PAIR_SEPARATOR = '::relation-pair::';

export interface RelationShadowDriftDetail {
  directiveId: string;
  observationId: string;
  legacyRelation?: DirectiveObservationRelation['relation'];
  irRelation?: DirectiveObservationRelation['relation'];
  legacyConfidence?: number;
  irConfidence?: number;
  confidenceDelta?: number;
  reason: string;
}

export interface RelationShadowComparison {
  legacyCount: number;
  irCount: number;
  matchedPairs: number;
  missingInIR: number;
  extraInIR: number;
  relationMismatches: number;
  confidenceDrift: number;
  legacyRelationCounts: Record<string, number>;
  irRelationCounts: Record<string, number>;
  driftDetails: RelationShadowDriftDetail[];
}

export function compareRelationPipelines(
  legacyRelations: DirectiveObservationRelation[],
  irRelations: SemanticRelationIR[],
): RelationShadowComparison {
  const projectedIR = semanticRelationsIRToLegacy(irRelations);
  const legacyByPair = relationMap(legacyRelations);
  const irByPair = relationMap(projectedIR);
  const allPairs = new Set([...legacyByPair.keys(), ...irByPair.keys()]);
  const driftDetails: RelationShadowDriftDetail[] = [];

  let matchedPairs = 0;
  let missingInIR = 0;
  let extraInIR = 0;
  let relationMismatches = 0;
  let confidenceDrift = 0;

  for (const pair of allPairs) {
    const legacy = legacyByPair.get(pair);
    const ir = irByPair.get(pair);
    if (!legacy) {
      extraInIR += 1;
      pushDriftDetail(driftDetails, buildRelationDriftDetail(pair, legacy, ir, 'extra IR relation without a legacy counterpart'));
      continue;
    }
    if (!ir) {
      missingInIR += 1;
      pushDriftDetail(driftDetails, buildRelationDriftDetail(pair, legacy, ir, 'legacy relation missing from IR projection'));
      continue;
    }
    matchedPairs += 1;

    const relationMismatch = legacy.relation !== ir.relation;
    const confidenceMismatch = Math.abs(legacy.confidence - ir.confidence) >= 0.2;
    if (relationMismatch) relationMismatches += 1;
    if (confidenceMismatch) confidenceDrift += 1;
    if (relationMismatch || confidenceMismatch) {
      pushDriftDetail(
        driftDetails,
        buildRelationDriftDetail(pair, legacy, ir, relationMismatch ? ir.reason : 'relation confidence drift exceeded threshold'),
      );
    }
  }

  return {
    legacyCount: legacyRelations.length,
    irCount: projectedIR.length,
    matchedPairs,
    missingInIR,
    extraInIR,
    relationMismatches,
    confidenceDrift,
    legacyRelationCounts: countRelations(legacyRelations),
    irRelationCounts: countRelations(projectedIR),
    driftDetails,
  };
}

export function summarizeRelationShadowComparison(comparison: RelationShadowComparison): string[] {
  return [
    `legacy_relations: ${comparison.legacyCount}`,
    `ir_projected_relations: ${comparison.irCount}`,
    `matched_pairs: ${comparison.matchedPairs}`,
    `missing_in_ir: ${comparison.missingInIR}`,
    `extra_in_ir: ${comparison.extraInIR}`,
    `relation_mismatches: ${comparison.relationMismatches}`,
    `confidence_drift: ${comparison.confidenceDrift}`,
    `legacy_distribution: ${formatRecord(comparison.legacyRelationCounts)}`,
    `ir_distribution: ${formatRecord(comparison.irRelationCounts)}`,
    ...comparison.driftDetails.map(formatDriftDetail),
  ];
}

function relationMap(relations: DirectiveObservationRelation[]): Map<string, DirectiveObservationRelation> {
  return new Map(relations.map((relation) => [relationPairKey(relation.directive_id, relation.observation_id), relation]));
}

function relationPairKey(directiveId: string, observationId: string): string {
  return `${directiveId}${PAIR_SEPARATOR}${observationId}`;
}

function parseRelationPairKey(pair: string): { directiveId: string; observationId: string } {
  const [directiveId, observationId] = pair.split(PAIR_SEPARATOR);
  return { directiveId, observationId };
}

function buildRelationDriftDetail(
  pair: string,
  legacy: DirectiveObservationRelation | undefined,
  ir: DirectiveObservationRelation | undefined,
  reason: string,
): RelationShadowDriftDetail {
  const { directiveId, observationId } = parseRelationPairKey(pair);
  const legacyConfidence = legacy?.confidence;
  const irConfidence = ir?.confidence;
  return {
    directiveId,
    observationId,
    legacyRelation: legacy?.relation,
    irRelation: ir?.relation,
    legacyConfidence,
    irConfidence,
    confidenceDelta: legacyConfidence === undefined || irConfidence === undefined
      ? undefined
      : roundConfidence(irConfidence - legacyConfidence),
    reason,
  };
}

function pushDriftDetail(details: RelationShadowDriftDetail[], detail: RelationShadowDriftDetail): void {
  if (details.length >= MAX_DRIFT_DETAILS) return;
  details.push(detail);
}

function countRelations(relations: DirectiveObservationRelation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const relation of relations) {
    counts[relation.relation] = (counts[relation.relation] ?? 0) + 1;
  }
  return counts;
}

function formatDriftDetail(detail: RelationShadowDriftDetail, index: number): string {
  return `drift_${index + 1}: directive=${detail.directiveId} observation=${detail.observationId} legacy=${detail.legacyRelation ?? '(missing)'} ir=${detail.irRelation ?? '(missing)'} confidence_delta=${formatNumber(detail.confidenceDelta)} reason=${truncate(detail.reason)}`;
}

function formatRecord(record: Record<string, number>): string {
  const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return '(none)';
  return entries.map(([key, count]) => `${key}=${count}`).join(', ');
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '(n/a)' : value.toFixed(2);
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function truncate(value: string): string {
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}
