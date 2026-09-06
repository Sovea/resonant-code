import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { planTransition, type ObservationData } from '@sovea/stetra-core';
import { captureGitWorktree, collectGitWorktreeChange, readSnapshotSource } from '../src/facts/worktree.ts';
import { sha256 } from '../src/protocol.ts';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { loadTask } from '../src/workflow/task-store.ts';
import { artifact } from '../src/workflow/common.ts';
import { beginInput, git, repository } from './fixtures/task.ts';

test('baseline captures dirty and untracked raw bytes without clean filters, EOL conversion, or index mutation', async () => {
  const root = repository();
  try {
    git(root, ['config', 'filter.erase.clean', 'printf erased']);
    git(root, ['config', 'core.autocrlf', 'true']);
    writeFileSync(join(root, '.gitattributes'), 'app.txt filter=erase text\n');
    writeFileSync(join(root, 'app.txt'), 'dirty\r\n'); writeFileSync(join(root, 'untracked.txt'), 'untracked\n');
    for (const name of ['Z.txt', 'a.txt', 'é.txt', '中文.txt']) writeFileSync(join(root, name), name);
    const index = readFileSync(join(root, '.git/index'));
    const began = await beginTask({ projectRoot: root, source: beginInput() });
    const task = loadTask(root, began.taskId), baseline = artifact(task.state, 'baseline', task.state.baselineId).snapshot;
    assert.deepEqual(baseline.entries.map((entry) => entry.path), baseline.entries.map((entry) => entry.path).sort());
    assert.equal(baseline.entries.find((f) => f.path === 'app.txt')!.contentDigest, sha256('dirty\r\n'));
    assert.equal(baseline.entries.find((f) => f.path === 'untracked.txt')!.contentDigest, sha256('untracked\n'));
    assert.equal((await readSnapshotSource(root, baseline, join(task.taskDirectory, 'worktree-objects'), 'app.txt')).toString(), 'dirty\r\n');
    assert.deepEqual(readFileSync(join(root, '.git/index')), index);
    writeFileSync(join(root, 'app.txt'), 'new\r\n');
    const collected = await collectTask({ projectRoot: root, taskId: began.taskId });
    assert.deepEqual(collected.summary.observations!.changedFiles.map((f) => f.path), ['app.txt']);
    assert.deepEqual(readFileSync(join(root, '.git/index')), index);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('actual changes retain renames, deletions, modes, symlink bytes, binary markers, and unusual paths', { skip: process.platform === 'win32' }, async () => {
  const root = repository();
  try {
    writeFileSync(join(root, 'binary.bin'), Buffer.from([0, 1, 2])); writeFileSync(join(root, 'gone.txt'), 'remove\n');
    const objects = join(root, '.stetra/staging/objects'); mkdirSync(objects, { recursive: true });
    const baseline = await captureGitWorktree(root, { objectDirectory: objects });
    renameSync(join(root, 'notes.md'), join(root, 'renamed.md')); rmSync(join(root, 'gone.txt')); chmodSync(join(root, 'app.txt'), 0o755);
    writeFileSync(join(root, 'binary.bin'), Buffer.from([0, 3, 4])); symlinkSync('app.txt', join(root, 'alias'));
    writeFileSync(join(root, 'tab\tand\nnewline.txt'), 'literal path\n');
    const change = await collectGitWorktreeChange(root, baseline, { objectDirectory: objects });
    assert.equal(change.changedFiles.find((f) => f.path === 'renamed.md')!.previousPath, 'notes.md');
    assert.equal(change.changedFiles.find((f) => f.path === 'gone.txt')!.operation, 'deleted');
    assert.equal(change.changedFiles.find((f) => f.path === 'app.txt')!.after!.mode, '100755');
    assert.equal(change.changedFiles.find((f) => f.path === 'binary.bin')!.representation, 'binary');
    assert.equal(change.current.entries.find((f) => f.path === 'alias')!.kind, 'symlink');
    assert.equal((await readSnapshotSource(root, change.current, objects, 'alias')).toString(), 'app.txt');
    assert.equal((await readSnapshotSource(root, change.current, objects, 'tab\tand\nnewline.txt')).toString(), 'literal path\n');
    assert.match(change.patch.toString(), /GIT binary patch/);
    await assert.rejects(() => readSnapshotSource(root, baseline, objects, 'missing'), /absent/);
    await assert.rejects(() => readSnapshotSource(root, { ...baseline, fingerprint: sha256('wrong') }, objects, 'app.txt'), /fingerprint/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('check-induced edits and declared verifier changes retain pre-check and post-check evidence', async () => {
  const root = repository();
  try {
    const source = beginInput();
    source.verification = { mode: 'checks', checks: [{ key: 'rewrite', argv: [process.execPath, '-e', "require('node:fs').writeFileSync('app.txt','checked\\n')"],
      verifierSelectors: [{ kind: 'file', path: 'app.txt', role: 'acceptance-surface' }] }] };
    const began = await beginTask({ projectRoot: root, source }); writeFileSync(join(root, 'app.txt'), 'agent edit\n');
    const beforeCollection = loadTask(root, began.taskId).state;
    const collected = await collectTask({ projectRoot: root, taskId: began.taskId });
    assert.equal(collected.summary.observations!.verifierMutations.length, 1);
    assert.equal(collected.summary.observations!.checkInducedChanges[0].path, 'app.txt');
    const state = loadTask(root, began.taskId).state, observation = artifact(state, 'observation', state.observationId);
    assert.equal(observation.data.preCheck.entries.find((f) => f.path === 'app.txt')!.contentDigest, sha256('agent edit\n'));
    assert.equal(observation.data.current.entries.find((f) => f.path === 'app.txt')!.contentDigest, sha256('checked\n'));
    for (const [mutate, expected] of [
      [(data: ObservationData) => { data.verifierMutations = []; }, 'VERIFIER_MUTATION_INCOMPLETE'],
      [(data: ObservationData) => { data.checks = []; }, 'CHECKS_INCOMPLETE'],
      [(data: ObservationData) => { data.checkInducedChanges = []; }, 'CHANGE_INCOMPLETE'],
      [(data: ObservationData) => { data.checks[0].assertionArgv = ['echo', 'fake']; }, 'CHECK_DEFINITION_MISMATCH'],
    ] as const) {
      const data = structuredClone(observation.data); mutate(data);
      const invalid = planTransition(beforeCollection, { type: 'collect', input: {} }, { taskId: began.taskId, operationId: randomUUID(), observation: data });
      assert.equal(invalid.status, 'invalid');
      if (invalid.status === 'invalid') assert.ok(invalid.issues.some((issue) => issue.code === expected), JSON.stringify(invalid.issues));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
