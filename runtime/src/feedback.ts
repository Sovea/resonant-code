import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseYaml, toYaml } from './utils/yaml.ts';
import type { EvaluateInput, ExecutionMode, LockfileDirectiveEntry, LockfileDocument } from './types.ts';

/**
 * Updates the runtime lockfile with per-directive quality signals.
 */
export function evaluateGuidance(input: EvaluateInput): LockfileDocument {
  const existing = loadLockfile(input.lockfilePath);
  const followed = new Set(input.followedDirectiveIds ?? input.ego.guidance.must_follow.map((item) => item.id));
  const ignored = new Set(input.ignoredDirectiveIds ?? []);
  const taskType = input.ego.taskIntent.operation;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const modeCounts = summarizeExecutionModes(input);
  const tensionCount = input.packet?.governance.semantic_merge.context_tensions.length ?? input.ego.guidance.context_tensions.length;

  existing.governance_summary.total_tasks += 1;
  existing.governance_summary.by_task_type[taskType] = (existing.governance_summary.by_task_type[taskType] ?? 0) + 1;
  existing.governance_summary.last_execution_modes = modeCounts;
  existing.governance_summary.last_tension_count = tensionCount;
  existing.governance_summary.last_updated_at = now;

  for (const directive of input.ego.guidance.must_follow) {
    const entry = existing.directives[directive.id] ?? createEntry();
    const counts = entry.quality_signal.by_task_type[taskType] ?? { followed: 0, ignored: 0 };
    if (ignored.has(directive.id)) {
      entry.quality_signal.overall.ignored += 1;
      counts.ignored += 1;
    } else if (followed.has(directive.id)) {
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
    existing.directives[directive.id] = entry;
  }

  writeFileSync(input.lockfilePath, toYaml(existing as never), 'utf-8');
  return existing;
}

function loadLockfile(filePath: string): LockfileDocument {
  if (!existsSync(filePath)) return createDocument();
  const parsed = parseYaml(readFileSync(filePath, 'utf-8')) as unknown;
  if (isLockfileDocument(parsed)) {
    return {
      version: 2,
      directives: parsed.directives,
      governance_summary: parsed.governance_summary,
    };
  }
  if (isDirectiveRecord(parsed)) {
    return {
      version: 2,
      directives: parsed,
      governance_summary: {
        total_tasks: 0,
        by_task_type: {},
        last_execution_modes: emptyModeCounts(),
        last_tension_count: 0,
        last_updated_at: '',
      },
    };
  }
  return createDocument();
}

function isLockfileDocument(value: unknown): value is LockfileDocument & { version?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'directives' in value && 'governance_summary' in value;
}

function isDirectiveRecord(value: unknown): value is Record<string, LockfileDirectiveEntry> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createDocument(): LockfileDocument {
  return {
    version: 2,
    directives: {},
    governance_summary: {
      total_tasks: 0,
      by_task_type: {},
      last_execution_modes: emptyModeCounts(),
      last_tension_count: 0,
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

function summarizeExecutionModes(input: EvaluateInput): Record<ExecutionMode, number> {
  const counts = emptyModeCounts();
  const directives = input.packet?.governance.semantic_merge.directive_modes ?? input.ego.guidance.must_follow.map((directive) => ({
    directive_id: directive.id,
    observation_ids: [],
    execution_mode: directive.execution_mode,
    reason: 'derived from effective guidance fallback',
    decision_basis: 'default' as const,
  }));
  for (const directive of directives) {
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
