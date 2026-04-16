import { minimatch } from '../utils/glob.ts';
import type { Directive, DirectiveObservationRelation, RcclObservation, TaskIntent } from '../types.ts';

export function buildRelations(
  directives: Directive[],
  observations: RcclObservation[],
  intent: TaskIntent,
): DirectiveObservationRelation[] {
  const scopedObservations = observations.filter((observation) =>
    scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files),
  );

  return directives.flatMap((directive) => scopedObservations.map((observation) => {
    const similarity = lexicalSimilarity(directive.description, observation.pattern);
    const verificationConfidence = observation.verification.induction_confidence
      ?? observation.verification.evidence_confidence
      ?? 0;
    const isDemoted = observation.verification.disposition === 'demote-to-ambient';
    const isWeakBroadScope = observation.support.scope_basis === 'cross-root' && verificationConfidence < 0.7;

    if (isDemoted || isWeakBroadScope) {
      return {
        directive_id: directive.id,
        observation_id: observation.id,
        relation: 'ambient-only' as const,
        confidence: verificationConfidence,
        basis: ['scope', 'verification'],
        reason: isDemoted
          ? 'observation was demoted by verify gate and can only contribute ambient context'
          : 'weak broad-scope observation stays ambient-only until evidence support is stronger',
      };
    }

    if (directive.type === 'anti-pattern' || observation.category === 'anti-pattern') {
      return {
        directive_id: directive.id,
        observation_id: observation.id,
        relation: similarity >= 0.2 ? 'anti-pattern-suppress' : 'none',
        confidence: similarity,
        basis: similarity >= 0.2 ? ['scope', 'category', 'lexical'] : ['scope', 'category'],
        reason: similarity >= 0.2
          ? 'anti-pattern classification indicates suppression-worthy overlap'
          : 'anti-pattern observation did not materially overlap this directive',
      };
    }

    if (similarity < 0.2) {
      return {
        directive_id: directive.id,
        observation_id: observation.id,
        relation: 'none',
        confidence: similarity,
        basis: ['scope', 'lexical'],
        reason: 'no material semantic overlap found using current deterministic lexical baseline',
      };
    }

    const relation = observation.adherence_quality === 'good' ? 'reinforce' : 'tension';
    return {
      directive_id: directive.id,
      observation_id: observation.id,
      relation,
      confidence: Math.max(similarity, verificationConfidence),
      basis: ['scope', 'verification', 'category', 'lexical'],
      reason: relation === 'reinforce'
        ? 'verified observation reinforces this directive in the current repository context'
        : 'verified observation creates tension with this directive in the current repository context',
    };
  }));
}

function lexicalSimilarity(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of bTokens) {
    if (aTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z][a-z0-9-]+/g)?.filter((token) => token.length > 2) ?? []);
}

function scopeMatchesIntent(scope: string, targetFile: string | undefined, changedFiles: string[]): boolean {
  if (!targetFile && changedFiles.length === 0) return true;
  if (targetFile && minimatch(targetFile, scope)) return true;
  return changedFiles.some((file) => minimatch(file, scope));
}
