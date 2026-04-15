import { minimatch } from '../utils/glob.ts';
import type {
  ActivationPlan,
  ActivatedDirective,
  Directive,
  DirectivePriorityRecord,
  LocalPlaybook,
  SkippedDirective,
  TaskIntent,
} from '../types.ts';

const LAYER_RANKS: Record<string, number> = {
  core: 5,
  languages: 4,
  frameworks: 3,
  domains: 2,
  local: 1,
};

const WEIGHT_RANKS = { low: 0, normal: 1, high: 2, critical: 3 } as const;
const PRESCRIPTION_RANKS = { should: 0, must: 1 } as const;

export function buildActivationPlan(
  directives: Directive[],
  local: LocalPlaybook | null,
  selectedLayerIds: string[],
  intent: TaskIntent,
): ActivationPlan {
  const suppressed = new Set(local?.suppresses.map((item) => item.id) ?? []);
  const overrideById = new Map(local?.overrides.map((item) => [item.id, item]) ?? []);
  const augmentById = new Map(local?.augments.map((item) => [item.id, item]) ?? []);
  const candidates = [...directives, ...(local?.additions ?? [])];

  const activated: ActivatedDirective[] = [];
  const skipped: SkippedDirective[] = [];

  for (const directive of candidates) {
    if (suppressed.has(directive.id)) {
      skipped.push({
        directive_id: directive.id,
        layer_id: directive.source.layerId,
        reason: 'suppressed-by-local',
        note: 'directive suppressed by local playbook',
      });
      continue;
    }

    if (!layerMatchesIntent(directive, intent)) {
      skipped.push({
        directive_id: directive.id,
        layer_id: directive.source.layerId,
        reason: 'layer-mismatch',
        note: 'directive layer does not match resolved task intent',
      });
      continue;
    }

    if (!scopeMatchesIntent(directive.scope.path, intent.target_file, intent.changed_files)) {
      skipped.push({
        directive_id: directive.id,
        layer_id: directive.source.layerId,
        reason: 'scope-mismatch',
        note: 'directive scope does not match target or changed files',
      });
      continue;
    }

    const effective_prescription = overrideById.get(directive.id)?.prescription ?? directive.prescription;
    const effective_weight = overrideById.get(directive.id)?.weight ?? directive.weight;

    activated.push({
      directive_id: directive.id,
      layer_id: directive.source.layerId,
      source_file: directive.source.filePath,
      effective_prescription,
      effective_weight,
      effective_priority: buildPriorityRecord(directive.source.layerId, effective_prescription, effective_weight, overrideById.has(directive.id)),
      activation_reason: buildActivationReason(directive, intent, overrideById.has(directive.id), augmentById.has(directive.id)),
      override_applied: overrideById.has(directive.id),
      augment_applied: augmentById.has(directive.id),
    });
  }

  return {
    selected_layers: selectedLayerIds,
    activated: sortActivated(activated),
    skipped,
  };
}

function sortActivated(items: ActivatedDirective[]): ActivatedDirective[] {
  return [...items].sort((a, b) => {
    if (a.effective_priority.layer_rank !== b.effective_priority.layer_rank) {
      return b.effective_priority.layer_rank - a.effective_priority.layer_rank;
    }
    if (a.effective_priority.prescription_rank !== b.effective_priority.prescription_rank) {
      return b.effective_priority.prescription_rank - a.effective_priority.prescription_rank;
    }
    if (a.effective_priority.weight_rank !== b.effective_priority.weight_rank) {
      return b.effective_priority.weight_rank - a.effective_priority.weight_rank;
    }
    if (a.effective_priority.context_rank !== b.effective_priority.context_rank) {
      return b.effective_priority.context_rank - a.effective_priority.context_rank;
    }
    return a.directive_id.localeCompare(b.directive_id);
  });
}

function buildPriorityRecord(
  layerId: string,
  prescription: Directive['prescription'],
  weight: Directive['weight'],
  overrideApplied: boolean,
): DirectivePriorityRecord {
  return {
    layer_rank: inferLayerRank(layerId),
    prescription_rank: PRESCRIPTION_RANKS[prescription],
    weight_rank: WEIGHT_RANKS[weight],
    context_rank: overrideApplied ? 1 : 0,
  };
}

function buildActivationReason(
  directive: Directive,
  intent: TaskIntent,
  overrideApplied: boolean,
  augmentApplied: boolean,
): string {
  const reasons = [`directive matched task intent for ${intent.operation}`];
  if (directive.source.kind === 'local-addition') reasons.push('local directive addition applied');
  if (overrideApplied) reasons.push('local override applied');
  if (augmentApplied) reasons.push('local examples augment applied');
  if (directive.source.layerId === 'builtin/core') reasons.push('core guidance always eligible');
  return reasons.join('; ');
}

function inferLayerRank(layerId: string): number {
  if (layerId === 'local' || layerId.startsWith('local')) return LAYER_RANKS.local;
  if (layerId.includes('/domains/')) return LAYER_RANKS.domains;
  if (layerId.includes('/frameworks/')) return LAYER_RANKS.frameworks;
  if (layerId.includes('/languages/')) return LAYER_RANKS.languages;
  return LAYER_RANKS.core;
}

function layerMatchesIntent(directive: Directive, intent: TaskIntent): boolean {
  const sourceLayer = directive.source.layerId;
  if (sourceLayer === 'builtin/core' || directive.layer.startsWith('local')) return true;
  if (sourceLayer.startsWith('builtin/task-types/')) {
    return sourceLayer.endsWith(`/${intent.operation}`);
  }
  if (sourceLayer.startsWith('builtin/languages/')) {
    return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
  }
  if (sourceLayer.startsWith('builtin/frameworks/')) {
    return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
  }
  return true;
}

function scopeMatchesIntent(scope: string, targetFile: string | undefined, changedFiles: string[]): boolean {
  if (!targetFile && changedFiles.length === 0) return true;
  if (targetFile && minimatch(targetFile, scope)) return true;
  return changedFiles.some((file) => minimatch(file, scope));
}
