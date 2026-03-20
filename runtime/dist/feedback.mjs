import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseYaml, toYaml } from './utils/yaml.mjs';
                                                                        

/**
 * Updates the runtime lockfile with per-directive quality signals.
 */
export function evaluateGuidance(input               )                                         {
  const existing = loadLockfile(input.lockfilePath);
  const followed = new Set(input.followedDirectiveIds ?? input.ego.guidance.must_follow.map((item) => item.id));
  const ignored = new Set(input.ignoredDirectiveIds ?? []);
  const taskType = input.ego.taskIntent.operation;
  const today = new Date().toISOString().slice(0, 10);

  for (const directive of input.ego.guidance.must_follow) {
    const entry = existing[directive.id] ?? createEntry();
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
    existing[directive.id] = entry;
  }

  writeFileSync(input.lockfilePath, toYaml(existing), 'utf-8');
  return existing;
}

function loadLockfile(filePath        )                                         {
  if (!existsSync(filePath)) return {};
  return parseYaml(readFileSync(filePath, 'utf-8'))                                          ;
}

function createEntry()                         {
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
  };
}

function computeFollowRate(entry                        )         {
  const total = entry.quality_signal.overall.followed + entry.quality_signal.overall.ignored;
  return total === 0 ? 0 : Number((entry.quality_signal.overall.followed / total).toFixed(2));
}

function computeTrend(entry                        )                                       {
  const rate = entry.quality_signal.overall.follow_rate;
  if (rate >= 0.9) return 'stable';
  if (rate >= 0.75) return 'improving';
  return 'degrading';
}
