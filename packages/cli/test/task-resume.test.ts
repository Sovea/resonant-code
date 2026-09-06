import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.ts';
import { ensureHostSession, readHostSession } from '../src/host/session.ts';
import { handleHostHook } from '../src/host/hook.ts';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { decideAdoption } from '../src/workflow/adoption.ts';
import { inspectUnfinishedTasks, resumeTask } from '../src/workflow/resume.ts';
import { loadTask } from '../src/workflow/task-store.ts';
import { beginInput, prepare, repository } from './fixtures/task.ts';

test('new session resumes an explicit task without new admission, attempts, checks, or automatic selection', async () => {
  const root = repository();
  try {
    const first = await beginTask({ projectRoot: root, source: beginInput() });
    const second = await beginTask({ projectRoot: root, source: { ...beginInput(), humanEvent: { content: 'Another admitted task.' } } });
    const session = ensureHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'resumed-session' });
    assert.equal(session.taskId, undefined);
    const before = loadTask(root, first.taskId);
    const status = await runCli(['status', root, '--json']);
    assert.deepEqual((status.output as { unfinishedTasks: Array<{ taskId: string }> }).unfinishedTasks.map((item) => item.taskId).sort(), [first.taskId, second.taskId].sort());
    assert.equal(readHostSession({ projectRoot: root, adapter: 'codex', sessionId: 'resumed-session' })!.taskId, undefined);
    const result = await runCli(['task', 'resume', root, '--task', first.taskId, '--binding-token', session.bindingToken, '--json']);
    assert.equal((result.output as { status: string }).status, 'task-resumed');
    const options = { projectRoot: root, taskId: first.taskId, bindingToken: session.bindingToken };
    assert.equal((await resumeTask(options)).status, 'task-already-bound');
    assert.deepEqual(loadTask(root, first.taskId), before);
    await assert.rejects(() => resumeTask({ ...options, taskId: second.taskId }), /already bound/);
    const context = await handleHostHook({ adapter: 'codex', event: 'session-start', payload: {
      hook_event_name: 'SessionStart', session_id: 'resumed-session', cwd: root,
    } });
    assert.match(JSON.stringify(context), new RegExp(first.taskId));
    assert.doesNotMatch(JSON.stringify(context), new RegExp(second.taskId));
    await collectTask({ projectRoot: root, taskId: first.taskId });
    const packet = await prepare({ projectRoot: root, taskId: first.taskId });
    await decideAdoption({ projectRoot: root, taskId: first.taskId, source: {
      packageId: packet.current.packageId!, action: 'rejected', humanEvent: { content: 'Reject this test delivery.' }, reason: 'Test choice.',
    } });
    await assert.rejects(() => resumeTask(options), /closed/);
    assert.deepEqual(inspectUnfinishedTasks(root).tasks.map((item) => item.taskId), [second.taskId]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('task discovery exposes corrupt admitted storage and resume rejects a foreign session token', async () => {
  const root = repository(), other = repository();
  try {
    const task = await beginTask({ projectRoot: root, source: beginInput() });
    const id = randomUUID(); mkdirSync(join(root, '.stetra/tasks', id));
    const state = inspectUnfinishedTasks(root);
    assert.equal(state.tasks[0]!.taskId, task.taskId);
    assert.equal(state.issues[0]!.taskId, id);
    const session = ensureHostSession({ projectRoot: other, adapter: 'codex', sessionId: 'foreign' });
    await assert.rejects(() => resumeTask({ projectRoot: root, taskId: task.taskId, bindingToken: session.bindingToken }), /missing|another session/);
    const status = await runCli(['status', root, '--json']);
    assert.equal((status.output as { status: string }).status, 'needs-attention');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }); }
});
