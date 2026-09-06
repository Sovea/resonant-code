/** Owned task storage, atomic publication, and recoverable process locks. */
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { schemas } from '@sovea/stetra-core';
import { inputError, usageError } from '../errors.ts';

export function canonicalProjectRoot(input: string): string {
  const path = resolve(input);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw usageError(`Project root is not a directory: ${path}`);
  return realpathSync(path);
}

export function safeStoragePath(root: string, path: string): string {
  schemas.repositoryPath.parse(path);
  let cursor = root;
  for (const part of path.split('/')) {
    cursor = resolve(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw usageError(`Refusing storage through a symlink: ${path}`);
  }
  return cursor;
}

export function projectRelativePath(root: string, path: string): string {
  const value = relative(root, path).replace(/\\/g, '/');
  if (isAbsolute(value)) throw usageError('Artifact must remain inside its project.');
  return schemas.repositoryPath.parse(value);
}

export function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw inputError(`Cannot read JSON at ${path}.`, error); }
}

function flushedWrite(path: string, bytes: string | Buffer): void {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

export function flushDirectory(path: string): void {
  // Directory flush is supported by the POSIX filesystems used by the Runtime.
  // Windows does not expose equivalent directory descriptors through this API.
  if (process.platform === 'win32') return;
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function writeImmutableBuffer(path: string, value: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  flushedWrite(temporary, value);
  try {
    // A hard-link publication is atomic and cannot replace an existing owner file.
    linkSync(temporary, path);
    flushDirectory(dirname(path));
  } finally { rmSync(temporary, { force: true }); }
}

export function writeImmutableJson(path: string, value: unknown): void {
  writeImmutableBuffer(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  flushedWrite(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try { renameSync(temporary, path); flushDirectory(dirname(path)); }
  finally { rmSync(temporary, { force: true }); }
}

export const LockOwnerSchema = z.strictObject({
  owner: z.uuid(), pid: z.number().int().positive(), processIdentity: z.string().optional(), operation: z.string(),
});
export type LockOwner = z.infer<typeof LockOwnerSchema>;
export interface OwnedLock { path: string; owner: string }

export function newOwner(operation: string): LockOwner {
  return { owner: randomUUID(), pid: process.pid, processIdentity: processIdentity(process.pid), operation };
}

export function acquireLock(path: string, operation: string): OwnedLock {
  mkdirSync(dirname(path), { recursive: true });
  const owner = newOwner(operation);
  for (let attempt = 0; attempt < 2; attempt++) {
    try { writeFileSync(path, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); return { path, owner: owner.owner }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const prior = readOwner(path);
      if (attempt === 0 && prior && confirmedDead(prior) && readOwner(path)?.owner === prior.owner) {
        rmSync(path); continue;
      }
      throw usageError(`Another Runtime operation owns ${path}.`);
    }
  }
  throw usageError(`Cannot acquire Runtime lock: ${path}`);
}

export function assertOwnedLock(lock: OwnedLock): void {
  if (readOwner(lock.path)?.owner !== lock.owner) throw usageError('Runtime lock ownership changed before publication.');
}

export function releaseLock(lock: OwnedLock): void {
  if (readOwner(lock.path)?.owner === lock.owner) rmSync(lock.path);
}

export function readOwner(path: string): LockOwner | undefined {
  try { const result = LockOwnerSchema.safeParse(JSON.parse(readFileSync(path, 'utf8'))); return result.success ? result.data : undefined; }
  catch { return undefined; }
}

export function confirmedDead(owner: LockOwner): boolean {
  try { process.kill(owner.pid, 0); }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
  const current = processIdentity(owner.pid);
  return Boolean(owner.processIdentity && current && owner.processIdentity !== current);
}

function processIdentity(pid: number): string | undefined {
  if (process.platform !== 'linux') return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
    return fields[19] ? `linux-proc-start:${fields[19]}` : undefined;
  } catch { return undefined; }
}
