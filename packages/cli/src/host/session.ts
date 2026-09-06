import { randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

import { z } from 'zod';

import type { HostAdapter } from '../adapters/definition.ts';
import { inputError, usageError } from '../errors.ts';
import { sha256 } from '../protocol.ts';
import { HostAdapterSchema } from '../schemas/project.ts';
import { parseArtifact } from '../validation.ts';
import { loadTask, type LoadedTask } from '../workflow/task-store.ts';
import { safeStoragePath, writeImmutableJson, writeJsonAtomic } from '../workflow/storage-io.ts';

const HEX_64 = /^[a-f0-9]{64}$/;
const BINDING_TOKEN = /^(codex|claude)\.([a-f0-9]{64})\.([a-f0-9]{32})$/;

const SessionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapter: HostAdapterSchema,
  sessionKeyHash: z.string().regex(HEX_64),
  bindingToken: z.string().regex(BINDING_TOKEN),
  taskId: z.uuid().optional(),
  pendingBegin: z.strictObject({
    taskId: z.uuid(),
    beginFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).optional(),
});

export type HostSession = z.infer<typeof SessionSchema>;

export function resolveInstalledProjectRoot(startInput: string): string | undefined {
  let current = resolve(startInput);
  if (!existsSync(current) || !statSync(current).isDirectory()) return undefined;
  current = realpathSync(current);
  const filesystemRoot = parse(current).root;
  while (true) {
    const manifest = safeStoragePath(current, '.stetra/manifest.json');
    if (existsSync(manifest)) {
      if (lstatSync(manifest).isSymbolicLink() || !statSync(manifest).isFile()) {
        throw usageError('The Stetra manifest must be a regular non-symbolic-link file.');
      }
      return current;
    }
    if (current === filesystemRoot) return undefined;
    current = dirname(current);
  }
}

export function ensureHostSession(input: {
  projectRoot: string;
  adapter: HostAdapter;
  sessionId: string;
}): HostSession {
  const sessionKeyHash = hostSessionKey(input.adapter, input.sessionId);
  const existing = readSession(input.projectRoot, input.adapter, sessionKeyHash);
  if (existing) return recoverPublishedBinding(input.projectRoot, existing);
  const session: HostSession = {
    schemaVersion: 1,
    adapter: input.adapter,
    sessionKeyHash,
    bindingToken: `${input.adapter}.${sessionKeyHash}.${randomBytes(16).toString('hex')}`,
  };
  writeSession(input.projectRoot, session, true);
  return recoverPublishedBinding(input.projectRoot,
    readSession(input.projectRoot, input.adapter, sessionKeyHash) ?? session);
}

export function readHostSession(input: {
  projectRoot: string;
  adapter: HostAdapter;
  sessionId: string;
}): HostSession | undefined {
  const session = readSession(
    input.projectRoot,
    input.adapter,
    hostSessionKey(input.adapter, input.sessionId),
  );
  return session ? recoverPublishedBinding(input.projectRoot, session) : undefined;
}

/** Called only under the worktree Begin lease, before baseline or task publication. */
export function prepareHostBegin(input: {
  projectRoot: string;
  bindingToken: string;
  beginFingerprint: string;
}): { taskId: string; published?: LoadedTask } {
  const session = sessionForToken(input.projectRoot, input.bindingToken);
  const recovered = recoverPublishedBinding(input.projectRoot, session);
  if (recovered.taskId) {
    const task = loadTask(input.projectRoot, recovered.taskId);
    if (!task.state.closed) {
      if (task.beginFingerprint !== input.beginFingerprint) {
        throw usageError(`Host session is already bound to unfinished task ${task.taskId}. Resume that task before admitting another.`);
      }
      return { taskId: task.taskId, published: task };
    }
  }
  const taskId = session.pendingBegin && !publishedBegin(input.projectRoot, session)
    ? session.pendingBegin.taskId : randomUUID();
  writeSession(input.projectRoot, {
    ...session,
    pendingBegin: { taskId, beginFingerprint: input.beginFingerprint },
  }, false);
  return { taskId };
}

/** A handled pre-publication failure can release its recovery association. */
export function cancelHostBegin(projectRoot: string, bindingToken: string, taskId: string): void {
  const session = sessionForToken(projectRoot, bindingToken);
  if (session.pendingBegin?.taskId !== taskId || publishedBegin(projectRoot, session)) return;
  const { pendingBegin: _ignored, ...rest } = session;
  writeSession(projectRoot, rest, false);
}

export function bindHostSession(input: {
  projectRoot: string;
  bindingToken: string;
  taskId: string;
}): void {
  const session = sessionForToken(input.projectRoot, input.bindingToken);
  if (session.pendingBegin && session.pendingBegin.taskId !== input.taskId) {
    throw usageError('Host binding must finish the pending Begin operation.');
  }
  const target = loadTask(input.projectRoot, input.taskId);
  if (session.pendingBegin && target.beginFingerprint !== session.pendingBegin.beginFingerprint) {
    throw usageError('Published task does not match its pending Begin association.');
  }
  if (session.taskId && session.taskId !== input.taskId
    && !loadTask(input.projectRoot, session.taskId).state.closed) {
    throw usageError(`Host session is already bound to task ${session.taskId}.`);
  }
  const { pendingBegin: _ignored, ...rest } = session;
  writeSession(input.projectRoot, { ...rest, taskId: input.taskId }, false);
}

export function sessionForToken(projectRoot: string, bindingToken: string): HostSession {
  const match = BINDING_TOKEN.exec(bindingToken);
  if (!match) throw inputError('Host binding token is invalid.');
  const adapter = match[1] as HostAdapter;
  const sessionKeyHash = match[2];
  const session = readSession(projectRoot, adapter, sessionKeyHash);
  if (!session || session.bindingToken !== bindingToken) {
    throw usageError('Host binding token is missing or belongs to another session.');
  }
  return recoverPublishedBinding(projectRoot, session);
}

function publishedBegin(projectRoot: string, session: HostSession): LoadedTask | undefined {
  const pending = session.pendingBegin;
  if (!pending || !existsSync(join(projectRoot, '.stetra', 'tasks', pending.taskId))) return undefined;
  const task = loadTask(projectRoot, pending.taskId);
  if (task.beginFingerprint !== pending.beginFingerprint) {
    throw usageError('Published task does not match its pending Begin association.');
  }
  return task;
}

/** Recovery is a read projection: Hooks never create or rewrite a task. */
function recoverPublishedBinding(projectRoot: string, session: HostSession): HostSession {
  const task = publishedBegin(projectRoot, session);
  return task ? { ...session, taskId: task.taskId } : session;
}

export function claimDirective(input: {
  projectRoot: string;
  session: HostSession;
  fingerprint: string;
}): boolean {
  const digest = input.fingerprint.startsWith('sha256:')
    ? input.fingerprint.slice('sha256:'.length) : input.fingerprint;
  if (!HEX_64.test(digest)) throw inputError('Host directive fingerprint is invalid.');
  const directory = safeStoragePath(sessionDirectory(
    input.projectRoot,
    input.session.adapter,
    input.session.sessionKeyHash,
  ), 'delivered');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = safeStoragePath(directory, `${digest}.json`);
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  writeFileSync(descriptor, `${JSON.stringify({ fingerprint: `sha256:${digest}` })}\n`);
  closeSync(descriptor);
  return true;
}

function hostSessionKey(adapter: HostAdapter, sessionId: string): string {
  if (!sessionId || sessionId.length > 1024) throw inputError('Host session ID is invalid.');
  return sha256(`host-session:${adapter}:${sessionId}`).slice('sha256:'.length);
}

function readSession(
  projectRootInput: string,
  adapter: HostAdapter,
  sessionKeyHash: string,
): HostSession | undefined {
  const projectRoot = realpathSync(resolve(projectRootInput));
  const path = sessionPath(projectRoot, adapter, sessionKeyHash);
  if (!existsSync(path)) return undefined;
  const session = parseArtifact(SessionSchema, JSON.parse(readFileSync(path, 'utf8')), 'Host session');
  if (session.adapter !== adapter || session.sessionKeyHash !== sessionKeyHash) {
    throw new Error('Host session identity does not match its storage path.');
  }
  return session;
}

function writeSession(projectRootInput: string, session: HostSession, exclusive: boolean): void {
  const projectRoot = realpathSync(resolve(projectRootInput));
  const path = sessionPath(projectRoot, session.adapter, session.sessionKeyHash);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (exclusive) {
    try {
      writeImmutableJson(path, session);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return;
  }
  writeJsonAtomic(path, session);
}

function sessionPath(projectRoot: string, adapter: HostAdapter, hash: string): string {
  return safeStoragePath(sessionDirectory(projectRoot, adapter, hash), 'binding.json');
}

function sessionDirectory(projectRoot: string, adapter: HostAdapter, hash: string): string {
  return safeStoragePath(projectRoot, '.stetra/host-sessions/' + adapter + '/' + hash);
}
