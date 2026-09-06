import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { runCli, formatCliOutput, formatCliError } from '../src/cli.ts';
import { CliError } from '../src/errors.ts';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { loadTask } from '../src/workflow/task-store.ts';
import { beginInput, configure, repository } from './fixtures/task.ts';

test('collect streams progress before its JSON result and preserves failure, timeout, and spawn outcomes as facts', async () => {
  const projectRoot = repository();
  try {
    configure(projectRoot, (config) => { config.executionPolicy.checkTimeoutMs = 500; });
    const source = beginInput();
    source.verification = { mode: 'checks', checks: [
      { key: 'fails', argv: [process.execPath, '-e', 'process.exit(3)'] },
      { key: 'times-out', argv: [process.execPath, '-e', 'setInterval(()=>{},10000)'] },
      { key: 'cannot-start', argv: ['stetra-test-absent-executable'] },
    ] };
    const began = await beginTask({ projectRoot, source });
    const progress: Array<Record<string, unknown>> = [];
    let settled = false;
    const errorOutput = new Writable({ write(chunk, _encoding, callback) {
      assert.equal(settled, false);
      progress.push(JSON.parse(String(chunk))); callback();
    } });
    const result = await runCli(['task', 'collect', projectRoot, '--task', began.taskId, '--json'], { errorOutput });
    settled = true;
    const output = JSON.parse(formatCliOutput(result));
    assert.equal(output.status, 'observations-collected');
    assert.deepEqual(progress.map((item) => item.event), Array.from({ length: 3 }, () => ['step-started', 'step-finished']).flat());
    assert.deepEqual(output.summary.observations.checks.map((check: { termination: { kind: string } }) => check.termination.kind), ['exit', 'timeout', 'spawn-error']);
    assert.ok(progress.every((item) => item.taskId === began.taskId));
    assert.ok(!JSON.stringify(loadTask(projectRoot, began.taskId).events).includes('step-started'));
  } finally { rmSync(projectRoot, { recursive: true, force: true }); }
});

test('IO failure after execution reports possible check effects and preserves recoverable task history', async () => {
  const projectRoot = repository();
  try {
    const source = beginInput();
    source.verification = { mode: 'checks', checks: [{ key: 'effect', argv: [process.execPath, '-e',
      "require('node:fs').writeFileSync('app.txt','new\\n')"] }] };
    const began = await beginTask({ projectRoot, source });
    const blockedPath = join(projectRoot, '.stetra/tasks', began.taskId, 'collections');
    await assert.rejects(() => collectTask({ projectRoot, taskId: began.taskId, onProgress(progress) {
      if (progress.event === 'step-finished') writeFileSync(blockedPath, 'owner data blocks publication');
    } }), (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, 'IO_ERROR');
      // POSIX detects a non-directory parent while resolving the destination;
      // Windows can defer that error until publication creates the directory.
      assert.ok(['capture-after-checks', 'publish-observation'].includes(error.issues?.at(-1)?.path ?? ''));
      assert.match(formatCliError(error, false, false), /inspect|Inspect/);
      assert.match(JSON.stringify(error.issues), /may have executed/);
      return true;
    });
    assert.equal(readFileSync(join(projectRoot, 'app.txt'), 'utf8'), 'new\n');
    assert.equal(loadTask(projectRoot, began.taskId).state.revision, 1);
    assert.equal(readFileSync(blockedPath, 'utf8'), 'owner data blocks publication');
    rmSync(blockedPath);
    const recovered = await collectTask({ projectRoot, taskId: began.taskId });
    assert.equal(recovered.status, 'observations-collected');
    assert.equal(recovered.summary.observations!.checks[0].status, 'passed');
  } finally { rmSync(projectRoot, { recursive: true, force: true }); }
});
