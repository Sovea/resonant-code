import { existsSync, readFileSync } from 'node:fs';
import { parseYaml } from '../../utils/yaml.ts';
import type { DirectiveFeedbackSignalIR, FeedbackIR } from '../types.ts';

interface LockfileDirectiveLike {
  quality_signal?: {
    overall?: {
      followed?: number;
      ignored?: number;
      follow_rate?: number;
      trend?: 'improving' | 'stable' | 'degrading';
    };
    last_seen?: string;
  };
}

interface LockfileLike {
  governance_summary?: {
    total_tasks?: number;
    by_task_type?: Record<string, number>;
  };
  directives?: Record<string, LockfileDirectiveLike>;
}

export function feedbackToIR(lockfilePath?: string): FeedbackIR {
  const parsed = loadLockfile(lockfilePath);
  const directiveSignals = Object.entries(parsed.directives ?? {}).map(([directiveId, entry]) => directiveSignalToIR(directiveId, entry));
  return {
    irVersion: 'governance-ir/v1',
    source: {
      kind: 'lockfile',
      id: 'playbook.lock',
      path: lockfilePath,
    },
    directiveSignals,
    globalSummary: {
      totalTasks: parsed.governance_summary?.total_tasks ?? 0,
      byTaskType: parsed.governance_summary?.by_task_type ?? {},
      noisyDirectiveIds: [],
      frequentlyIgnoredDirectiveIds: directiveSignals
        .filter((signal) => signal.ignored >= 2 && signal.followRate < 0.75)
        .map((signal) => signal.directiveId),
      recurringTensionKeys: [],
    },
  };
}

function loadLockfile(lockfilePath: string | undefined): LockfileLike {
  if (!lockfilePath || !existsSync(lockfilePath)) return {};
  const parsed = parseYaml(readFileSync(lockfilePath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  if ('directives' in parsed || 'governance_summary' in parsed) return parsed as LockfileLike;
  return { directives: Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, entry]) => isDirectiveEntry(entry))) };
}

function isDirectiveEntry(value: unknown): value is LockfileDirectiveLike {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && 'quality_signal' in value;
}

function directiveSignalToIR(directiveId: string, entry: LockfileDirectiveLike): DirectiveFeedbackSignalIR {
  const overall = entry.quality_signal?.overall;
  return {
    directiveId,
    followed: overall?.followed ?? 0,
    ignored: overall?.ignored ?? 0,
    followRate: overall?.follow_rate ?? 0,
    trend: overall?.trend ?? 'stable',
    signalConfidence: 'implicit',
    lastSeen: entry.quality_signal?.last_seen ?? '',
  };
}
