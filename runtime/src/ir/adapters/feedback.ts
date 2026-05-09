import { existsSync, readFileSync } from 'node:fs';
import { parseYaml } from '../../utils/yaml.ts';
import type { DirectiveFeedbackSignalIR, FeedbackIR, ObservationFeedbackSignalIR, TensionFeedbackSignalIR } from '../types.ts';
import type { FeedbackSignalConfidence, IgnoredReason } from '../../types.ts';
import { SEMANTIC_RELATION_POLICY } from '../relations/policy.ts';

interface LockfileDirectiveLike {
  quality_signal?: {
    overall?: {
      followed?: number;
      ignored?: number;
      follow_rate?: number;
      trend?: 'improving' | 'stable' | 'degrading';
    };
    ignored_reasons?: Partial<Record<IgnoredReason, number>>;
    last_ignored_reason?: IgnoredReason;
    signal_confidence?: FeedbackSignalConfidence;
    last_seen?: string;
  };
}

interface LockfileObservationLike {
  seen_count?: number;
  relation_count?: number;
  active_seen_count?: number;
  stale_seen_count?: number;
  superseded_seen_count?: number;
  last_disposition?: 'keep' | 'keep-with-reduced-confidence' | 'demote-to-ambient' | 'pending';
  last_lifecycle_status?: 'active' | 'stale' | 'superseded' | 'unknown';
  last_content_fingerprint?: string | null;
  last_seen?: string;
}

interface LockfileTensionLike {
  seen_count?: number;
  directive_id?: string;
  observation_id?: string;
  last_execution_mode?: 'enforce' | 'deviation-noted' | 'ambient' | 'suppress';
  last_seen?: string;
}

interface LockfileLike {
  governance_summary?: {
    total_tasks?: number;
    by_task_type?: Record<string, number>;
  };
  directives?: Record<string, LockfileDirectiveLike>;
  observations?: Record<string, LockfileObservationLike>;
  tensions?: Record<string, LockfileTensionLike>;
}

export function feedbackToIR(lockfilePath?: string): FeedbackIR {
  const parsed = loadLockfile(lockfilePath);
  const directiveSignals = Object.entries(parsed.directives ?? {}).map(([directiveId, entry]) => directiveSignalToIR(directiveId, entry));
  const observationSignals = Object.entries(parsed.observations ?? {}).map(([observationId, entry]) => observationSignalToIR(observationId, entry));
  const tensionSignals = Object.entries(parsed.tensions ?? {}).map(([tensionKey, entry]) => tensionSignalToIR(tensionKey, entry));
  return {
    irVersion: 'governance-ir/v1',
    source: {
      kind: 'lockfile',
      id: 'playbook.lock',
      path: lockfilePath,
    },
    directiveSignals,
    observationSignals,
    tensionSignals,
    globalSummary: {
      totalTasks: parsed.governance_summary?.total_tasks ?? 0,
      byTaskType: parsed.governance_summary?.by_task_type ?? {},
      noisyDirectiveIds: [],
      frequentlyIgnoredDirectiveIds: directiveSignals
        .filter((signal) =>
          signal.ignored >= SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredMinIgnored
          && signal.followRate < SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredFollowRate)
        .map((signal) => signal.directiveId),
      recurringTensionKeys: tensionSignals
        .filter((signal) => signal.seenCount >= SEMANTIC_RELATION_POLICY.feedback.recurringTensionSeenCount)
        .map((signal) => signal.tensionKey),
    },
  };
}

function loadLockfile(lockfilePath: string | undefined): LockfileLike {
  if (!lockfilePath || !existsSync(lockfilePath)) return {};
  const parsed = parseYaml(readFileSync(lockfilePath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  if ('directives' in parsed || 'governance_summary' in parsed) return parsed as LockfileLike;
  const directives: Record<string, LockfileDirectiveLike> = {};
  for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (isDirectiveEntry(entry)) directives[id] = entry;
  }
  return { directives };
}

function isDirectiveEntry(value: unknown): value is LockfileDirectiveLike {
  return value != null && typeof value === 'object' && !Array.isArray(value) && 'quality_signal' in value;
}

function directiveSignalToIR(directiveId: string, entry: LockfileDirectiveLike): DirectiveFeedbackSignalIR {
  const overall = entry.quality_signal?.overall;
  return {
    directiveId,
    followed: overall?.followed ?? 0,
    ignored: overall?.ignored ?? 0,
    followRate: overall?.follow_rate ?? 0,
    trend: overall?.trend ?? 'stable',
    signalConfidence: validSignalConfidence(entry.quality_signal?.signal_confidence)
      ? entry.quality_signal.signal_confidence
      : 'implicit',
    ignoredReasons: normalizeIgnoredReasons(entry.quality_signal?.ignored_reasons),
    ...(validIgnoredReason(entry.quality_signal?.last_ignored_reason)
      ? { lastIgnoredReason: entry.quality_signal.last_ignored_reason }
      : {}),
    lastSeen: entry.quality_signal?.last_seen ?? '',
  };
}

function normalizeIgnoredReasons(value: unknown): Partial<Record<IgnoredReason, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Partial<Record<IgnoredReason, number>> = {};
  for (const [reason, count] of Object.entries(value)) {
    if (!validIgnoredReason(reason) || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
    result[reason] = count;
  }
  return result;
}

function validIgnoredReason(value: unknown): value is IgnoredReason {
  return value === 'not-applicable'
    || value === 'conflicts-with-task'
    || value === 'too-broad'
    || value === 'repo-reality'
    || value === 'false-positive'
    || value === 'user-corrected'
    || value === 'other';
}

function validSignalConfidence(value: unknown): value is FeedbackSignalConfidence {
  return value === 'implicit'
    || value === 'explicit'
    || value === 'review-confirmed'
    || value === 'user-corrected';
}

function observationSignalToIR(observationId: string, entry: LockfileObservationLike): ObservationFeedbackSignalIR {
  return {
    observationId,
    seenCount: entry.seen_count ?? 0,
    relationCount: entry.relation_count ?? 0,
    activeSeenCount: entry.active_seen_count ?? 0,
    staleSeenCount: entry.stale_seen_count ?? 0,
    supersededSeenCount: entry.superseded_seen_count ?? 0,
    lastDisposition: entry.last_disposition ?? 'pending',
    lastLifecycleStatus: entry.last_lifecycle_status ?? 'unknown',
    lastContentFingerprint: entry.last_content_fingerprint ?? null,
    lastSeen: entry.last_seen ?? '',
  };
}

function tensionSignalToIR(tensionKey: string, entry: LockfileTensionLike): TensionFeedbackSignalIR {
  return {
    tensionKey,
    seenCount: entry.seen_count ?? 0,
    directiveId: entry.directive_id ?? '',
    observationId: entry.observation_id ?? '',
    lastExecutionMode: entry.last_execution_mode ?? 'ambient',
    lastSeen: entry.last_seen ?? '',
  };
}
