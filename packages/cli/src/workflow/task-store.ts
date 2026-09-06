import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { planTransition, reduceTaskEvent, schemas, type RuntimeInputs, type TaskCommand,
  type TaskEvent, type TaskState, type TransitionResult } from '@sovea/stetra-core';
import { inputError, usageError } from '../errors.ts';
import { sha256 } from '../protocol.ts';
import { acquireLock, assertOwnedLock, canonicalProjectRoot, confirmedDead, flushDirectory, newOwner,
  readJson, readOwner, releaseLock, safeStoragePath, writeImmutableJson, type OwnedLock } from './storage-io.ts';

export { canonicalProjectRoot, projectRelativePath, writeImmutableBuffer, writeImmutableJson } from './storage-io.ts';
export const taskArtifactPath = safeStoragePath;

const StoredEventSchema = z.strictObject({
  event: schemas.event, occurredAt: z.iso.datetime(),
  beginFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
});
export type StoredEvent = z.infer<typeof StoredEventSchema>;
export interface LoadedTask {
  projectRoot: string; taskId: string; taskDirectory: string;
  state: TaskState; events: StoredEvent[]; beginFingerprint: string;
}
type Planned = Extract<TransitionResult, { status: 'transition' }>;

export function taskDirectory(projectRoot: string, taskId: string): string {
  z.uuid().parse(taskId);
  return safeStoragePath(projectRoot, `.stetra/tasks/${taskId}`);
}

export function artifactPath(directory: string, id: string): string {
  schemas.id.parse(id);
  return safeStoragePath(directory, `artifacts/${sha256(id).slice(7)}.json`);
}

function eventPath(directory: string, sequence: number): string {
  return safeStoragePath(directory, `events/${String(sequence).padStart(12, '0')}.json`);
}

/** Reads immutable records only. Cache repair never runs on the inspection path. */
export function loadTask(projectRootInput: string, taskId: string): LoadedTask {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const directory = taskDirectory(projectRoot, taskId);
  const eventsDirectory = safeStoragePath(directory, 'events');
  if (!existsSync(eventsDirectory)) throw usageError(`Task ${taskId} does not exist.`);
  const names = readdirSync(eventsDirectory).filter((name) => /^\d{12}\.json$/.test(name)).sort();
  if (!names.length) throw inputError(`Task ${taskId} has no committed events.`);
  let state: TaskState | null = null;
  const events: StoredEvent[] = [];
  for (const [index, name] of names.entries()) {
    if (name !== `${String(index + 1).padStart(12, '0')}.json`) throw inputError('Task event journal has a missing sequence.');
    const stored = StoredEventSchema.parse(readJson(safeStoragePath(eventsDirectory, name)));
    if (stored.event.taskId !== taskId || stored.event.sequence !== index + 1) throw inputError('Task event identity differs from its journal path.');
    const artifacts = stored.event.artifactIds.map((id) => {
      const artifact = schemas.artifact.parse(readJson(artifactPath(directory, id)));
      if (artifact.id !== id) throw inputError('Artifact identity differs from its journal reference.');
      return artifact;
    });
    state = reduceTaskEvent(state, stored.event, artifacts);
    events.push(stored);
  }
  if (!events[0].beginFingerprint) throw inputError('Task admission fingerprint is absent.');
  return { projectRoot, taskId, taskDirectory: directory, state: state!, events, beginFingerprint: events[0].beginFingerprint };
}

export function createTaskWorkspace(projectRoot: string, taskId: string) {
  const finalTaskDirectory = taskDirectory(projectRoot, taskId);
  if (existsSync(finalTaskDirectory)) throw usageError(`Task ${taskId} already exists.`);
  const directory = createStaging(projectRoot, 'begin');
  const objectDirectory = safeStoragePath(directory, 'worktree-objects');
  mkdirSync(objectDirectory);
  return { taskDirectory: directory, finalTaskDirectory, objectDirectory };
}

export function createStaging(projectRoot: string, operation: 'begin' | 'collect'): string {
  const root = safeStoragePath(projectRoot, '.stetra/staging');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, `${operation}-`));
  writeImmutableJson(join(directory, 'owner.json'), newOwner(operation));
  return directory;
}

export async function withWorktreeLease<T>(input: { projectRoot: string; operation: string; taskId?: string },
  work: (lease: OwnedLock) => Promise<T>): Promise<T> {
  const root = canonicalProjectRoot(input.projectRoot);
  const lock = acquireLock(safeStoragePath(root, '.stetra/worktree-operation.lock'), input.operation);
  try {
    const staging = safeStoragePath(root, '.stetra/staging');
    if (existsSync(staging)) for (const entry of readdirSync(staging, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = safeStoragePath(staging, entry.name);
      const owner = readOwner(safeStoragePath(path, 'owner.json'));
      if (owner && ['begin', 'collect'].includes(owner.operation) && confirmedDead(owner)) rmSync(path, { recursive: true });
    }
    return await work(lock);
  } finally { releaseLock(lock); }
}

export function initializeTask(input: {
  projectRoot: string; taskId: string; stagingDirectory: string; transition: Planned; beginFingerprint: string;
}): LoadedTask {
  const final = taskDirectory(input.projectRoot, input.taskId);
  if (existsSync(final)) throw usageError('Task publication would overwrite an existing task.');
  publishTransition(input.stagingDirectory, input.transition, input.beginFingerprint);
  mkdirSync(dirname(final), { recursive: true });
  renameSync(input.stagingDirectory, final);
  flushDirectory(dirname(final));
  rmSync(join(final, 'owner.json'));
  return loadTask(input.projectRoot, input.taskId);
}

export function requireTransition(result: TransitionResult): Exclude<TransitionResult, { status: 'invalid' }> {
  if (result.status === 'invalid') throw inputError(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'), undefined, result.issues);
  return result;
}

export function commitTaskCommand(input: {
  projectRoot: string; taskId: string; command: TaskCommand; runtime?: Partial<RuntimeInputs>;
  expectedRevision?: number; stagedFiles?: string;
}): { task: LoadedTask; changed: boolean; event?: TaskEvent } {
  const projectRoot = canonicalProjectRoot(input.projectRoot);
  const directory = taskDirectory(projectRoot, input.taskId);
  const lock = acquireLock(safeStoragePath(directory, 'operation.lock'), 'task-transition');
  try {
    const current = loadTask(projectRoot, input.taskId);
    if (input.expectedRevision !== undefined && current.state.revision !== input.expectedRevision) {
      throw usageError('Task advanced during this operation. Inspect the current task and retry.');
    }
    const result = requireTransition(planTransition(current.state, input.command, {
      ...input.runtime, taskId: input.taskId, operationId: input.runtime?.operationId ?? randomUUID(),
    }));
    if (result.status === 'unchanged') return { task: current, changed: false };
    assertOwnedLock(lock);
    if (input.stagedFiles) publishFiles(input.stagedFiles, directory);
    publishTransition(directory, result);
    return { task: loadTask(projectRoot, input.taskId), changed: true, event: result.event };
  } finally { releaseLock(lock); }
}

function publishTransition(directory: string, transition: Planned, beginFingerprint?: string): void {
  for (const artifact of transition.artifacts) writeImmutableJson(artifactPath(directory, artifact.id), artifact);
  const event: StoredEvent = { event: transition.event, occurredAt: new Date().toISOString(),
    ...(beginFingerprint ? { beginFingerprint } : {}) };
  writeImmutableJson(eventPath(directory, transition.event.sequence), StoredEventSchema.parse(event));
  // Replay is the current projection consumer. Do not persist a redundant cache.
}

function publishFiles(source: string, destination: string): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = safeStoragePath(source, entry.name), to = safeStoragePath(destination, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true }); publishFiles(from, to);
    } else {
      if (!entry.isFile()) throw usageError(`Cannot publish collection artifact: ${to}`);
      if (existsSync(to)) {
        if (readFileSync(from).equals(readFileSync(to))) continue;
        throw usageError(`Cannot replace a different collection artifact: ${to}`);
      }
      renameSync(from, to); flushDirectory(dirname(to));
    }
  }
}
