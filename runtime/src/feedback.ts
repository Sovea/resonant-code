import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseYaml, toYaml } from './utils/yaml.ts';
import type { EvaluateInput, ExecutionMode, LockfileDirectiveEntry, LockfileDocument, LockfileObservationEntry, LockfileTensionEntry } from './types.ts';

export function evaluateGuidance(input: EvaluateInput): LockfileDocument {
  const existing = loadLockfile(input.lockfilePath);
  const trackedDirectiveIds = getTrackedDirectiveIds(input);
  const followed = new Set(input.followedDirectiveIds ?? trackedDirectiveIds);
  const ignored = new Set(input.ignoredDirectiveIds ?? []);
  const taskType = input.ego.taskIntent.operation;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const modeCounts = summarizeExecutionModes(input);
  const tensionCount = input.packet.governance.semantic_merge.context_tensions.length;
  const observedRccl = getObservedRccl(input);

  existing.governance_summary.total_tasks += 1;
  existing.governance_summary.by_task_type[taskType] = (existing.governance_summary.by_task_type[taskType] ?? 0) + 1;
  existing.governance_summary.last_execution_modes = modeCounts;
  existing.governance_summary.last_tension_count = tensionCount;
  existing.governance_summary.last_observation_count = observedRccl.size;
  existing.governance_summary.last_updated_at = now;

  updateObservationFeedback(existing, observedRccl, input, now);
  updateTensionFeedback(existing, input, now);

  for (const directiveId of trackedDirectiveIds) {
    const entry = existing.directives[directiveId] ?? createEntry();
    const counts = entry.quality_signal.by_task_type[taskType] ?? { followed: 0, ignored: 0 };
    if (ignored.has(directiveId)) {
      entry.quality_signal.overall.ignored += 1;
      counts.ignored += 1;
    } else if (followed.has(directiveId)) {
      entry.quality_signal.overall.followed += 1;
      counts.followed += 1;
    }
    entry.quality_signal.by_task_type[taskType] = counts;
    entry.quality_signal.overall.follow_rate = computeFollowRate(entry);
    entry.quality_signal.overall.trend = computeTrend(entry);
    entry.quality_signal.last_seen = today;
    entry.governance = {
      outcomes: {
        total_tasks: (entry.governance?.outcomes.total_tasks ?? 0) + 1,
        with_tensions: (entry.governance?.outcomes.with_tensions ?? 0) + (tensionCount > 0 ? 1 : 0),
        last_execution_modes: modeCounts,
        last_tension_count: tensionCount,
        last_updated_at: now,
      },
    };
    existing.directives[directiveId] = entry;
  }

  writeFileSync(input.lockfilePath, toYaml(existing as never), 'utf-8');
  return existing;
}

function loadLockfile(filePath: string): LockfileDocument {
  if (!existsSync(filePath)) return createDocument();
  const parsed = parseYaml(readFileSync(filePath, 'utf-8')) as unknown;
  if (!isLockfileDocument(parsed)) return createDocument();
  return {
    version: '1.0',
    directives: parsed.directives,
    observations: normalizeObservationEntries(parsed.observations),
    tensions: parsed.tensions,
    governance_summary: parsed.governance_summary,
  };
}

function isLockfileDocument(value: unknown): value is LockfileDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<LockfileDocument>;
  return candidate.version === '1.0'
    && isRecord(candidate.directives)
    && isRecord(candidate.observations)
    && isRecord(candidate.tensions)
    && Boolean(candidate.governance_summary)
    && typeof candidate.governance_summary === 'object';
}

function isRecord(value: unknown): value is Record<string, never> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeObservationEntries(entries: Record<string, LockfileObservationEntry>): Record<string, LockfileObservationEntry> {
  return Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, {
    ...createObservationEntry(),
    ...entry,
    last_content_fingerprint: entry.last_content_fingerprint ?? null,
  }]));
}

function updateObservationFeedback(existing: LockfileDocument, observations: Map<string, number>, input: EvaluateInput, now: string): void {
  const observationStates = new Map(input.packet.governance.semantic_merge.observation_states.map((state) => [state.observation_id, state]));
  for (const [observationId, relationCount] of observations) {
    const entry = existing.observations[observationId] ?? createObservationEntry();
    const state = observationStates.get(observationId);
    entry.seen_count += 1;
    entry.relation_count += relationCount;
    if (state?.lifecycle_status === 'active') entry.active_seen_count += 1;
    if (state?.lifecycle_status === 'stale') entry.stale_seen_count += 1;
    if (state?.lifecycle_status === 'superseded') entry.superseded_seen_count += 1;
    entry.last_disposition = state?.disposition ?? 'pending';
    entry.last_lifecycle_status = state?.lifecycle_status ?? 'unknown';
    entry.last_content_fingerprint = state?.content_fingerprint ?? null;
    entry.last_seen = now;
    existing.observations[observationId] = entry;
  }
}

function updateTensionFeedback(existing: LockfileDocument, input: EvaluateInput, now: string): void {
  for (const tension of input.packet.governance.semantic_merge.context_tensions) {
    if (!tension.observation_id) continue;
    const key = `${tension.directive_id}::${tension.observation_id}`;
    const entry = existing.tensions[key] ?? createTensionEntry(tension.directive_id, tension.observation_id, tension.execution_mode);
    entry.seen_count += 1;
    entry.last_execution_mode = tension.execution_mode;
    entry.last_seen = now;
    existing.tensions[key] = entry;
  }
}

function getObservedRccl(input: EvaluateInput): Map<string, number> {
  const counts = new Map<string, number>();
  for (const relation of input.packet.governance.semantic_merge.relations) {
    if (!relation.observation_id) continue;
    counts.set(relation.observation_id, (counts.get(relation.observation_id) ?? 0) + 1);
  }
  for (const link of input.packet.governance.semantic_merge.observation_links) {
    if (!counts.has(link.observation_id)) counts.set(link.observation_id, link.directive_ids.length);
  }
  return counts;
}

function createObservationEntry(): LockfileObservationEntry {
  return {
    seen_count: 0,
    relation_count: 0,
    active_seen_count: 0,
    stale_seen_count: 0,
    superseded_seen_count: 0,
    last_disposition: 'pending',
    last_lifecycle_status: 'unknown',
    last_content_fingerprint: null,
    last_seen: '',
  };
}

function createTensionEntry(directiveId: string, observationId: string, executionMode: ExecutionMode): LockfileTensionEntry {
  return {
    seen_count: 0,
    directive_id: directiveId,
    observation_id: observationId,
    last_execution_mode: executionMode,
    last_seen: '',
  };
}

function createDocument(): LockfileDocument {
  return {
    version: '1.0',
    directives: {},
    observations: {},
    tensions: {},
    governance_summary: {
      total_tasks: 0,
      by_task_type: {},
      last_execution_modes: emptyModeCounts(),
      last_tension_count: 0,
      last_observation_count: 0,
      last_updated_at: '',
    },
  };
}

function createEntry(): LockfileDirectiveEntry {
  return {
    quality_signal: {
      overall: {
        followed: 0,
        ignored: 0,
        follow_rate: 0,
        trend: 'stable',
      },
      by_task_type: {},
      last_seen: '',
    },
    governance: {
      outcomes: {
        total_tasks: 0,
        with_tensions: 0,
        last_execution_modes: emptyModeCounts(),
        last_tension_count: 0,
        last_updated_at: '',
      },
    },
  };
}

function emptyModeCounts(): Record<ExecutionMode, number> {
  return {
    enforce: 0,
    'deviation-noted': 0,
    ambient: 0,
    suppress: 0,
  };
}

function getTrackedDirectiveIds(input: EvaluateInput): string[] {
  return input.packet.governance.semantic_merge.directive_modes
    .filter((directive) => directive.execution_mode !== 'suppress')
    .map((directive) => directive.directive_id);
}

function summarizeExecutionModes(input: EvaluateInput): Record<ExecutionMode, number> {
  const counts = emptyModeCounts();
  for (const directive of input.packet.governance.semantic_merge.directive_modes) {
    counts[directive.execution_mode] += 1;
  }
  return counts;
}

function computeFollowRate(entry: LockfileDirectiveEntry): number {
  const total = entry.quality_signal.overall.followed + entry.quality_signal.overall.ignored;
  return total === 0 ? 0 : Number((entry.quality_signal.overall.followed / total).toFixed(2));
}

function computeTrend(entry: LockfileDirectiveEntry): 'improving' | 'stable' | 'degrading' {
  const rate = entry.quality_signal.overall.follow_rate;
  if (rate >= 0.9) return 'stable';
  if (rate >= 0.75) return 'improving';
  return 'degrading';
}
