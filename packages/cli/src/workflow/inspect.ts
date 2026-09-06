import { readFileSync } from 'node:fs';
import { schemas, type CheckStreamFact } from '@sovea/stetra-core';
import { usageError } from '../errors.ts';
import { sha256 } from '../protocol.ts';
import { readSnapshotSource } from '../facts/worktree.ts';
import { artifact, artifacts, adoptionBrief, decisionView, observeCurrency, observationSummary, taskResult } from './common.ts';
import { loadTask, taskArtifactPath, type LoadedTask } from './task-store.ts';

export interface InspectOptions {
  projectRoot: string; taskId: string; section?: string; requestId?: string; observationId?: string;
  packageId?: string; path?: string; snapshot?: 'baseline' | 'current'; checkKey?: string;
  attempt?: number; stream?: 'stdout' | 'stderr'; offset?: number; maxBytes?: number; live?: boolean;
}
export async function inspectTask(options: InspectOptions) {
  const task = loadTask(options.projectRoot, options.taskId), state = task.state;
  const section = options.section ?? 'summary';
  if (options.live && !['summary', 'adoption'].includes(section)) throw usageError('Live currency is available only for summary and adoption inspection.');
  const currency = options.live ? await observeCurrency(task) : undefined;
  const base = taskResult(task, 'task-inspected', currency);
  switch (section) {
    case 'summary': return base;
    case 'intent': return { ...base, intent: artifact(state, 'intent', state.intentId), humanEvents: artifacts(state, 'human-event') };
    case 'decisions': return { ...base, decisions: decisionView(state) };
    case 'baseline': return { ...base, baseline: artifact(state, 'baseline', state.baselineId) };
    case 'verification': return { ...base, verification: artifact(state, 'verification-plan', state.planId) };
    case 'observations': return { ...base, observations: artifacts(state, 'observation').map((item) => observationSummary(state, item.id)) };
    case 'observation': return { ...base, observation: artifact(state, 'observation', options.observationId ?? state.observationId) };
    case 'report': return { ...base, report: artifact(state, 'report', state.reportId) };
    case 'analysis': {
      const analysis = analysisInput(task, options.requestId ?? state.requestId);
      const bytes = Buffer.from(JSON.stringify(analysis));
      const page = boundedBytes(bytes, options.offset, options.maxBytes);
      const identity = { status: 'analysis-inspected', taskId: task.taskId, requestId: analysis.request.id };
      return !page.truncated ? { ...identity, analysis }
        : { ...identity, analysisDocument: { digest: sha256(bytes), ...page } };
    }
    case 'assessment': return { ...base, assessments: artifacts(state, 'assessment'), currentAssessmentId: state.assessmentId };
    case 'adoption': return { ...base, adoptionBrief: adoptionBrief(task, options.packageId ?? state.packageId!, currency) };
    case 'history': return { ...base, events: task.events, records: state.records };
    case 'source': {
      if (!options.requestId || !options.path || !options.snapshot) throw usageError('Source inspection requires --request, --snapshot baseline|current, and --path.');
      const request = artifact(state, 'analysis-request', options.requestId);
      const snapshot = options.snapshot === 'baseline' ? artifact(state, 'baseline', state.baselineId).snapshot
        : artifact(state, 'observation', request.basis.observationId).data.current;
      const bytes = await readSnapshotSource(task.projectRoot, snapshot, taskArtifactPath(task.taskDirectory, 'worktree-objects'), options.path);
      return { status: 'source-inspected', taskId: task.taskId, requestId: request.id, snapshot: options.snapshot,
        path: options.path, digest: snapshot.entries.find((entry) => entry.path === options.path)!.contentDigest,
        ...boundedBytes(bytes, options.offset, options.maxBytes) };
    }
    case 'patch': {
      const observation = artifact(state, 'observation', options.observationId ?? state.observationId);
      const patch = observation.data.patch;
      return { status: 'patch-inspected', taskId: task.taskId, observationId: observation.id,
        patch: patch ? { ...patch, ...boundedBytes(readTaskFile(task, patch.path), options.offset, options.maxBytes) } : null };
    }
    case 'check': case 'log': {
      if (!options.checkKey) throw usageError('Check/log inspection requires --check.');
      const observation = artifact(state, 'observation', options.observationId ?? state.observationId);
      const plan = artifact(state, 'verification-plan', observation.planId);
      const definition = plan.definitions.find((item) => item.key === options.checkKey);
      const check = observation.data.checks.find((item) => item.definitionId === definition?.definitionId);
      if (!check) throw usageError('The selected Observation has no such check.');
      const attempt = options.attempt === undefined ? check.attempts.at(-1)! : check.attempts.find((item) => item.attempt === options.attempt);
      if (!attempt) throw usageError('The selected Check Attempt does not exist.');
      if (section === 'check') return { status: 'check-inspected', taskId: task.taskId, observationId: observation.id, definition, check, selectedAttempt: attempt };
      if (!options.stream) throw usageError('Log inspection requires --stream stdout|stderr.');
      const stream: CheckStreamFact = attempt[options.stream];
      return { status: 'log-inspected', taskId: task.taskId, observationId: observation.id, checkKey: definition!.key,
        attempt: attempt.attempt, log: { ...stream, ...boundedBytes(stream.logPath ? readTaskFile(task, stream.logPath) : Buffer.alloc(0), options.offset, options.maxBytes) } };
    }
    default: throw usageError('Unknown inspection section. Use stetra task inspect --help.');
  }
}

export function analysisInput(task: LoadedTask, requestId: string | undefined) {
  const state = task.state, request = artifact(state, 'analysis-request', requestId);
  const intent = artifact(state, 'intent', request.basis.intentId);
  const humanIds = new Set(intent.humanEventIds);
  const decisions = request.decisionRefs.map((item) => {
    const resolution = item.resolutionId ? artifact(state, 'decision-resolution', item.resolutionId) : null;
    resolution?.authorityEventIds.forEach((id) => humanIds.add(id));
    return { proposal: artifact(state, 'decision-proposal', item.proposalId), resolution };
  });
  return { request, intent, humanEvents: [...humanIds].map((id) => artifact(state, 'human-event', id)), decisions,
    observation: observationSummary(state, request.basis.observationId),
    verification: artifact(state, 'verification-plan', request.basis.planId),
    report: artifact(state, 'report', request.basis.reportId),
    priorFindings: request.priorFindings.map((reference) => {
      const assessment = artifact(state, 'assessment', reference.assessmentId);
      if (assessment.input.kind !== 'assessment') throw usageError('Prior finding has no semantic Assessment.');
      return { reference, finding: assessment.input.findings.find((item) => item.key === reference.key) };
    }),
    inspection: { taskId: task.taskId, requestId: request.id, observationId: request.basis.observationId,
      source: 'task inspect --section source --request <requestId> --snapshot baseline|current --path <path>',
      resultSchema: 'assessment submit --input-schema --json' },
  };
}

function readTaskFile(task: LoadedTask, path: string): Buffer {
  const prefix = '.stetra/tasks/' + task.taskId + '/';
  if (!path.startsWith(prefix)) throw usageError('Stored file reference escapes its task.');
  return readFileSync(taskArtifactPath(task.taskDirectory, path.slice(prefix.length)));
}

function boundedBytes(bytes: Buffer, offset = 0, maxBytes = 16_384) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65_536) {
    throw usageError('Inspection offset must be nonnegative and max bytes must be from 1 through 65536.');
  }
  const slice = bytes.subarray(offset, offset + maxBytes);
  const text = slice.toString('utf8'), utf8 = Buffer.from(text).equals(slice) && !slice.includes(0);
  return { offset, returnedBytes: slice.length, totalBytes: bytes.length,
    truncated: offset > 0 || offset + slice.length < bytes.length, encoding: utf8 ? 'utf8' : 'base64',
    content: utf8 ? text : slice.toString('base64'),
    nextOffset: offset + slice.length < bytes.length ? offset + slice.length : null };
}
