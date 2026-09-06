/** Git-backed baseline and actual-change collection for the Cognitive Adoption protocol. */
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';

import { schemas } from '@sovea/stetra-core';
import type {
  ChangedFileFact,
  FileContentFact,
  WorktreeSnapshot,
} from '@sovea/stetra-core';

import { runBufferedCommand } from '../infrastructure/process.ts';
import { compareText, sha256, stableFingerprint } from '../protocol.ts';

const WORKFLOW_OUTPUT_PREFIXES = [
  '.stetra/tasks/',
  '.stetra/staging/',
  '.stetra/host-sessions/',
] as const;
const WORKFLOW_OUTPUT_FILES = new Set(['.stetra/worktree-operation.lock']);
const GIT_OUTPUT_LIMIT = 256 * 1024 * 1024;
const GITLINK_MODE = '160000';
const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export type { WorktreeSnapshot } from '@sovea/stetra-core';
type WorktreeEntry = WorktreeSnapshot['entries'][number];

export interface CollectedWorktreeChange {
  current: WorktreeSnapshot;
  changedFiles: ChangedFileFact[];
  changeFingerprint: string;
  patch: Buffer;
}

export interface WorktreeCaptureOptions {
  objectDirectory?: string;
  alternateObjectDirectories?: string[];
}

export async function captureGitWorktree(
  projectRootInput: string,
  options: WorktreeCaptureOptions = {},
): Promise<WorktreeSnapshot> {
  const projectRoot = realpathSync(resolve(projectRootInput));
  await assertGitRoot(projectRoot);
  const ephemeralRoot = options.objectDirectory
    ? undefined
    : mkdtempSync(join(tmpdir(), 'stetra-objects-'));
  const objectDirectory = realpathOrResolved(options.objectDirectory ?? ephemeralRoot!);
  mkdirSync(objectDirectory, { recursive: true });
  try {
    const objectEnv = await gitObjectEnvironment(
      projectRoot,
      objectDirectory,
      options.alternateObjectDirectories,
    );
    const head = await readHead(projectRoot);
    const { treeId, entries } = await createWorktreeTree(projectRoot, objectEnv);
    const projection = { head, treeId, entries };
    return {
      source: 'git-worktree-tree',
      ...projection,
      fingerprint: stableFingerprint(projection),
    };
  } finally {
    if (ephemeralRoot) rmSync(ephemeralRoot, { recursive: true, force: true });
  }
}

export async function collectGitWorktreeChange(
  projectRoot: string,
  baseline: WorktreeSnapshot,
  options: { objectDirectory: string; alternateObjectDirectories?: string[] },
): Promise<CollectedWorktreeChange> {
  assertWorktreeSnapshot(baseline, 'prepared baseline');
  const current = await captureGitWorktree(projectRoot, options);
  const objectEnv = await gitObjectEnvironment(
    projectRoot,
    options.objectDirectory,
    options.alternateObjectDirectories,
  );
  const binaryPaths = await collectBinaryPaths(
    projectRoot,
    baseline.treeId,
    current.treeId,
    objectEnv,
  );
  const changedFiles = compareGitWorktrees(baseline, current, binaryPaths);
  const patch = await collectPatch(projectRoot, baseline.treeId, current.treeId, objectEnv);
  return {
    current,
    changedFiles,
    changeFingerprint: stableFingerprint(changedFiles),
    patch,
  };
}

export function compareGitWorktrees(
  baseline: WorktreeSnapshot,
  current: WorktreeSnapshot,
  binaryPaths: Set<string> = new Set(),
): ChangedFileFact[] {
  assertWorktreeSnapshot(baseline, 'baseline');
  assertWorktreeSnapshot(current, 'current');
  const beforeByPath = new Map(baseline.entries.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(current.entries.map((entry) => [entry.path, entry]));
  const deleted: Array<{ path: string; fact: FileContentFact }> = [];
  const added: Array<{ path: string; fact: FileContentFact }> = [];
  const modified: ChangedFileFact[] = [];

  for (const [path, before] of beforeByPath) {
    const after = afterByPath.get(path);
    if (!after) {
      deleted.push({ path, fact: fileFact(before) });
    } else if (!sameFact(before, after)) {
      modified.push(changedFile({
        path,
        operation: 'modified',
        before: fileFact(before),
        after: fileFact(after),
        representation: representation(before, after, binaryPaths.has(path)),
      }));
    }
  }
  for (const [path, after] of afterByPath) {
    if (!beforeByPath.has(path)) added.push({ path, fact: fileFact(after) });
  }

  const deletedByContent = groupByContent(deleted);
  const addedByContent = groupByContent(added);
  const renamedDeleted = new Set<string>();
  const renamedAdded = new Set<string>();
  const renamed: ChangedFileFact[] = [];
  for (const [key, deletedMatches] of deletedByContent) {
    const addedMatches = addedByContent.get(key) ?? [];
    if (deletedMatches.length !== 1 || addedMatches.length !== 1) continue;
    const prior = deletedMatches[0];
    const next = addedMatches[0];
    renamedDeleted.add(prior.path);
    renamedAdded.add(next.path);
    renamed.push(changedFile({
      path: next.path,
      operation: 'renamed',
      previousPath: prior.path,
      before: prior.fact,
      after: next.fact,
      representation: representation(
        prior.fact,
        next.fact,
        binaryPaths.has(prior.path) || binaryPaths.has(next.path),
      ),
    }));
  }

  return [
    ...modified,
    ...renamed,
    ...deleted
      .filter((item) => !renamedDeleted.has(item.path))
      .map((item) => changedFile({
        path: item.path,
        operation: 'deleted',
        before: item.fact,
        representation: representation(item.fact, undefined, binaryPaths.has(item.path)),
      })),
    ...added
      .filter((item) => !renamedAdded.has(item.path))
      .map((item) => changedFile({
        path: item.path,
        operation: 'added',
        after: item.fact,
        representation: representation(undefined, item.fact, binaryPaths.has(item.path)),
      })),
  ].sort((left, right) => compareText(left.path, right.path));
}

export function assertWorktreeSnapshot(value: unknown, label: string): asserts value is WorktreeSnapshot {
  const parsed = schemas.worktreeSnapshot.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ${label} worktree snapshot: ${parsed.error.message}`);
  const snapshot = parsed.data;
  const ordered = [...snapshot.entries].sort((left, right) => compareText(left.path, right.path));
  if (JSON.stringify(ordered) !== JSON.stringify(snapshot.entries)
    || snapshot.fingerprint !== stableFingerprint({
      head: snapshot.head,
      treeId: snapshot.treeId,
      entries: snapshot.entries,
    })) {
    throw new Error(`Invalid ${label} worktree snapshot fingerprint; collect the task again.`);
  }
}

async function createWorktreeTree(
  projectRoot: string,
  objectEnv: NodeJS.ProcessEnv,
): Promise<{ treeId: string; entries: WorktreeEntry[] }> {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'stetra-index-'));
  const env = { ...objectEnv, GIT_INDEX_FILE: join(temporaryRoot, 'index') };
  try {
    const [listed, staged] = await Promise.all([
      runGitBuffer(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], repositoryGitEnvironment()),
      runGitBuffer(projectRoot, ['ls-files', '-z', '--stage'], repositoryGitEnvironment()),
    ]);
    const indexEntries = parseIndexEntries(staged);
    const captured: Array<{ path: string; mode: string; kind: WorktreeEntry['kind']; objectId: string }> = [];
    const regular: Array<{ path: string; mode: string }> = [];
    for (const path of parseNullSeparatedPaths(listed).filter((path) => !isWorkflowOutput(path)).sort()) {
      const prior = indexEntries.get(path);
      const absolute = resolve(projectRoot, path);
      const stat = lstatSync(absolute, { throwIfNoEntry: false });
      if (prior?.mode === GITLINK_MODE && (!stat || stat.isDirectory())) {
        captured.push({ path, mode: GITLINK_MODE, kind: 'gitlink',
          objectId: await readGitlinkObjectId(projectRoot, path, prior.objectId) });
      } else if (stat?.isSymbolicLink()) {
        const bytes = Buffer.from(readlinkSync(absolute));
        const objectId = (await runGitBuffer(projectRoot, ['hash-object', '-w', '--no-filters', '--stdin'], env, bytes)).toString('ascii').trim();
        captured.push({ path, mode: '120000', kind: 'symlink', objectId });
      } else if (stat?.isFile()) {
        regular.push({ path, mode: stat.mode & 0o111 ? '100755' : '100644' });
      } else if (stat && !stat.isDirectory()) {
        throw new Error('Unsupported worktree entry: ' + path);
      }
    }
    // Batch by argv bytes, an OS transport budget rather than a semantic classifier.
    for (let offset = 0; offset < regular.length;) {
      let end = offset, bytes = 0;
      while (end < regular.length && (end === offset || bytes + Buffer.byteLength(resolve(projectRoot, regular[end].path)) < 16_384)) {
        bytes += Buffer.byteLength(resolve(projectRoot, regular[end].path)) + 1; end++;
      }
      const batch = regular.slice(offset, end);
      const ids = (await runGitBuffer(projectRoot, ['hash-object', '-w', '--no-filters', '--',
        ...batch.map((item) => resolve(projectRoot, item.path))], env)).toString('ascii').trim().split('\n');
      if (ids.length !== batch.length || ids.some((id) => !GIT_OBJECT_ID_PATTERN.test(id))) {
        throw new Error('Git returned invalid raw blob identities.');
      }
      captured.push(...batch.map((item, index) => ({ ...item, kind: 'file' as const, objectId: ids[index] })));
      offset = end;
    }
    captured.sort((left, right) => compareText(left.path, right.path));
    const entries: WorktreeEntry[] = [];
    for (let offset = 0; offset < captured.length; offset += 64) {
      const batch = captured.slice(offset, offset + 64);
      const ids = [...new Set(batch.filter((item) => item.kind !== 'gitlink').map((item) => item.objectId))];
      const digests = ids.length ? await blobDigests(projectRoot, ids, env) : new Map<string, string>();
      entries.push(...batch.map((item) => ({ path: item.path, kind: item.kind, mode: item.mode,
        contentDigest: item.kind === 'gitlink' ? sha256(item.objectId) : digests.get(item.objectId)! })));
    }
    await runGitBuffer(projectRoot, ['read-tree', '--empty'], env);
    if (captured.length) await runGitBuffer(projectRoot, ['update-index', '-z', '--index-info'], env,
      Buffer.from(captured.map((item) => item.mode + ' ' + item.objectId + '\t' + item.path + '\0').join('')));
    const treeId = (await runGitBuffer(projectRoot, ['write-tree'], env)).toString('ascii').trim();
    if (!GIT_OBJECT_ID_PATTERN.test(treeId)) throw new Error('Git returned an invalid snapshot tree.');
    return { treeId, entries };
  } finally { rmSync(temporaryRoot, { recursive: true, force: true }); }
}

async function blobDigests(projectRoot: string, ids: string[], env: NodeJS.ProcessEnv): Promise<Map<string, string>> {
  const output = await runGitBuffer(projectRoot, ['cat-file', '--batch'], env, ids.join('\n') + '\n');
  const result = new Map<string, string>();
  let offset = 0;
  for (const expected of ids) {
    const end = output.indexOf(10, offset);
    const header = output.subarray(offset, end).toString('ascii').split(' ');
    const size = Number(header[2]);
    if (end < 0 || header[0] !== expected || header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0
      || end + 1 + size >= output.length || output[end + 1 + size] !== 10) throw new Error('Invalid Git blob batch output.');
    const bytes = output.subarray(end + 1, end + 1 + size);
    result.set(expected, sha256(bytes)); offset = end + 2 + size;
  }
  if (offset !== output.length) throw new Error('Unexpected trailing Git blob output.');
  return result;
}

/** Immutable source read: no index creation, cache repair, filters, or repository edits. */
export async function readSnapshotSource(projectRoot: string, snapshot: WorktreeSnapshot, objectDirectory: string, path: string): Promise<Buffer> {
  schemas.repositoryPath.parse(path);
  assertWorktreeSnapshot(snapshot, 'source');
  const entry = snapshot.entries.find((item) => item.path === path);
  if (!entry) throw new Error('Path is absent from the requested snapshot: ' + path);
  if (entry.kind === 'gitlink') throw new Error('A Git link is an object reference, not a source blob.');
  const env = await gitObjectEnvironment(projectRoot, objectDirectory, [], false);
  const bytes = await runGitBuffer(projectRoot, ['cat-file', 'blob', snapshot.treeId + ':' + path], env);
  if (sha256(bytes) !== entry.contentDigest) throw new Error('Snapshot source digest differs from its retained entry.');
  return bytes;
}

function isWorkflowOutput(path: string): boolean {
  return WORKFLOW_OUTPUT_FILES.has(path)
    || WORKFLOW_OUTPUT_PREFIXES.some((prefix) =>
      path === prefix.slice(0, -1) || path.startsWith(prefix));
}

async function collectPatch(
  projectRoot: string,
  beforeTree: string,
  afterTree: string,
  env: NodeJS.ProcessEnv,
): Promise<Buffer> {
  return runGitBuffer(projectRoot, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-renames',
    beforeTree,
    afterTree,
    '--',
  ], env);
}

async function collectBinaryPaths(
  projectRoot: string,
  beforeTree: string,
  afterTree: string,
  env: NodeJS.ProcessEnv,
): Promise<Set<string>> {
  const output = await runGitBuffer(projectRoot, [
    'diff',
    '--numstat',
    '-z',
    '--no-renames',
    beforeTree,
    afterTree,
    '--',
  ], env);
  const binaryPaths = new Set<string>();
  for (const record of splitNullRecords(output)) {
    const firstTab = record.indexOf(9);
    const secondTab = firstTab < 0 ? -1 : record.indexOf(9, firstTab + 1);
    if (firstTab < 0 || secondTab < 0) throw new Error('Git returned malformed binary change metadata.');
    const added = record.subarray(0, firstTab).toString('ascii');
    const deleted = record.subarray(firstTab + 1, secondTab).toString('ascii');
    const pathBytes = record.subarray(secondTab + 1);
    const path = utf8GitPath(pathBytes);
    if (added === '-' && deleted === '-') binaryPaths.add(path);
  }
  return binaryPaths;
}

async function gitObjectEnvironment(
  projectRoot: string,
  objectDirectoryInput: string,
  additionalAlternates: string[] = [],
  create = true,
): Promise<NodeJS.ProcessEnv> {
  const objectDirectory = realpathOrResolved(objectDirectoryInput);
  if (create) mkdirSync(objectDirectory, { recursive: true });
  const commonDirectoryValue = (await runGitBuffer(
    projectRoot,
    ['rev-parse', '--git-common-dir'],
    repositoryGitEnvironment(),
  )).toString('utf8').trim();
  if (!commonDirectoryValue) {
    throw new Error('Git did not return a common metadata directory.');
  }
  const commonDirectory = isAbsolute(commonDirectoryValue)
    ? commonDirectoryValue
    : resolve(projectRoot, commonDirectoryValue);
  const repositoryObjects = resolve(commonDirectory, 'objects');
  const inheritedAlternates = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_OBJECT_DIRECTORY: objectDirectory,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: [
      repositoryObjects,
      ...additionalAlternates.map((path) => realpathOrResolved(path)),
      inheritedAlternates,
    ]
      .filter((value): value is string => Boolean(value))
      .join(delimiter),
  };
}

function repositoryGitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  return env;
}

function realpathOrResolved(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

async function assertGitRoot(projectRoot: string): Promise<void> {
  const prefix = (await runGitBuffer(projectRoot, ['rev-parse', '--show-prefix'])).toString('utf8').trim();
  if (!prefix) return;
  const expected = (await runGitBuffer(projectRoot, ['rev-parse', '--show-toplevel'])).toString('utf8').trim();
  throw new Error(`Project root must equal the Git worktree root. Expected ${expected}, received ${projectRoot}.`);
}

async function readHead(projectRoot: string): Promise<string | null> {
  const result = await runBufferedCommand({
    file: 'git',
    args: ['-C', projectRoot, 'rev-parse', '--verify', 'HEAD'],
    cwd: projectRoot,
    maxBuffer: 1024,
  });
  if (result.failed) return null;
  const head = result.stdout.toString('ascii').trim();
  return GIT_OBJECT_ID_PATTERN.test(head) ? head : null;
}

async function readGitlinkObjectId(
  projectRoot: string,
  path: string,
  indexObjectId: string,
): Promise<string> {
  const absolutePath = resolve(projectRoot, path);
  const stat = lstatSync(absolutePath, { throwIfNoEntry: false });
  const gitDirectory = lstatSync(resolve(absolutePath, '.git'), { throwIfNoEntry: false });
  if (!stat?.isDirectory() || !gitDirectory) return indexObjectId;
  const result = await runBufferedCommand({
    file: 'git',
    args: ['-C', absolutePath, 'rev-parse', '--verify', 'HEAD^{commit}'],
    cwd: projectRoot,
    maxBuffer: 1024,
  });
  if (result.failed) return indexObjectId;
  const objectId = result.stdout.toString('ascii').trim();
  return GIT_OBJECT_ID_PATTERN.test(objectId) ? objectId : indexObjectId;
}

async function runGitBuffer(
  projectRoot: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  stdin?: Buffer | string,
): Promise<Buffer> {
  const result = await runBufferedCommand({
    file: 'git',
    args: ['-C', projectRoot, ...args],
    cwd: projectRoot,
    env,
    maxBuffer: GIT_OUTPUT_LIMIT,
    stdin,
  });
  if (result.failed) {
    const stderr = result.stderr.toString('utf8').trim();
    throw new Error(
      `Failed to collect Git worktree facts (${args.join(' ')}): `
      + `${stderr || result.message || result.exitCode || result.signal || 'unknown failure'}`,
    );
  }
  return result.stdout;
}

function parseNullSeparatedPaths(value: Buffer): string[] {
  return [...new Set(splitNullRecords(value).map(utf8GitPath))];
}

function splitNullRecords(value: Buffer): Buffer[] {
  const records: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    if (index > start) records.push(value.subarray(start, index));
    start = index + 1;
  }
  if (start !== value.length) throw new Error('Git returned malformed NUL-separated output.');
  return records;
}

function parseIndexEntries(value: Buffer): Map<string, { mode: string; objectId: string }> {
  const entries = new Map<string, { mode: string; objectId: string }>();
  for (const record of splitNullRecords(value)) {
    const separator = record.indexOf(9);
    if (separator < 0) throw new Error('Git returned a malformed stage entry.');
    const header = record.subarray(0, separator).toString('ascii');
    const match = /^([0-7]{6}) ([0-9a-f]{40}(?:[0-9a-f]{24})?) ([0-3])$/.exec(header);
    if (!match) throw new Error('Git returned a malformed stage entry header.');
    if (match[3] !== '0') continue;
    const path = utf8GitPath(record.subarray(separator + 1));
    entries.set(path, { mode: match[1], objectId: match[2] });
  }
  return entries;
}

function utf8GitPath(bytes: Buffer): string {
  const path = bytes.toString('utf8');
  if (!Buffer.from(path, 'utf8').equals(bytes)
    || !path
    || path.startsWith('/')
    || /^[A-Za-z]:\//.test(path)
    || path.split('/').some((segment) => !segment || segment === '..')
    || path.includes('\0')) {
    throw new Error(`Git returned an unsafe or non-UTF-8 repository path: ${JSON.stringify(path)}.`);
  }
  return path;
}

function groupByContent(
  items: Array<{ path: string; fact: FileContentFact }>,
): Map<string, Array<{ path: string; fact: FileContentFact }>> {
  const groups = new Map<string, Array<{ path: string; fact: FileContentFact }>>();
  for (const item of items) {
    const key = JSON.stringify([item.fact.kind, item.fact.contentDigest, item.fact.mode]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function fileFact(entry: WorktreeEntry): FileContentFact {
  return {
    kind: entry.kind,
    contentDigest: entry.contentDigest,
    mode: entry.mode,
  };
}

function sameFact(left: WorktreeEntry, right: WorktreeEntry): boolean {
  return left.kind === right.kind
    && left.contentDigest === right.contentDigest
    && left.mode === right.mode;
}

function representation(
  before: FileContentFact | undefined,
  after: FileContentFact | undefined,
  binary: boolean,
): ChangedFileFact['representation'] {
  if (binary) return 'binary';
  const kind = after?.kind ?? before?.kind;
  if (kind !== 'file') return 'metadata-only';
  if (before && after && before.contentDigest === after.contentDigest) return 'metadata-only';
  return 'text';
}

function changedFile(
  value: Omit<ChangedFileFact, 'id'>,
): ChangedFileFact {
  const identity = stableFingerprint([
    value.operation,
    value.previousPath ?? null,
    value.path,
  ]).slice('sha256:'.length);
  return { id: `file:${identity}`, ...value };
}
