import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.ts';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { reportTask } from '../src/workflow/report.ts';
import { submitAssessment } from '../src/workflow/assessment.ts';
import { authorTask } from '../src/workflow/author.ts';
import { inspectTask } from '../src/workflow/inspect.ts';
import { assessmentInput, beginInput, reportInput, repository } from './fixtures/task.ts';

test('all request-selected evidence remains bound after a correction and another collection', async () => {
  const root = repository();
  try {
    const began = await beginTask({ projectRoot: root, source: beginInput(true) });
    const task = { projectRoot: root, taskId: began.taskId };
    writeFileSync(join(root, 'app.txt'), 'wrong\n');
    const first = await collectTask(task);
    const reported = await reportTask({ ...task, source: reportInput() });
    const requestId = reported.current.requestId!;
    submitAssessment({ ...task, source: assessmentInput(requestId) });
    const sections = ['intent', 'decisions', 'verification', 'observation', 'report', 'assessment', 'patch', 'check', 'log', 'source'] as const;
    const read = (section: typeof sections[number]) => inspectTask({ ...task, section, requestId,
      ...(['check', 'log'].includes(section) ? { checkKey: 'content' } : {}),
      ...(section === 'log' ? { stream: 'stderr' as const } : {}),
      ...(section === 'source' ? { snapshot: 'current' as const, path: 'app.txt' } : {}),
    });
    const before = await Promise.all(sections.map(read));
    const log = before[8]; assert.ok('log' in log); assert.match(log.log!.content, /expected new/);
    const patch = before[6]; assert.ok('patch' in patch); assert.match(patch.patch!.content, /\+wrong/);
    authorTask({ ...task, command: { type: 'amend', input: { kind: 'human-correction',
      humanEvent: { content: 'Keep the note too.' }, interpretation: { desiredOutcome: 'New text and the note.', constraints: [], nonGoals: [] } } } });
    writeFileSync(join(root, 'app.txt'), 'new\n');
    const second = await collectTask(task);
    const next = await reportTask({ ...task, source: reportInput() });
    submitAssessment({ ...task, source: assessmentInput(next.current.requestId!) });
    assert.notEqual(second.current.observationId, first.current.observationId);
    const after = await Promise.all(sections.map(read));
    for (let i = 0; i < sections.length; i++) {
      const key = ({ decisions: 'decisions', assessment: 'assessments', check: 'selectedAttempt', source: 'content' } as Record<string, string>)[sections[i]!] ?? sections[i]!;
      assert.deepEqual((after[i] as Record<string, unknown>)[key], (before[i] as Record<string, unknown>)[key], sections[i]);
    }
    const current = await inspectTask({ ...task, section: 'assessment' });
    assert.ok('assessments' in current); assert.equal(current.assessments.length, 1);
    assert.equal(current.assessments[0]!.input.requestId, next.current.requestId);
    const cli = await runCli(['task', 'inspect', root, '--task', task.taskId, '--section', 'check', '--request', requestId, '--check', 'content', '--json']);
    assert.equal((cli.output as { observationId: string }).observationId, first.current.observationId);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('inspection rejects ignored, missing, conflicting, and invalid selectors before repository access', async () => {
  const task = { projectRoot: '/missing-inspection-project', taskId: 'missing' };
  for (const selectors of [
    { section: 'unknown' }, { section: 'patch', live: true }, { section: 'summary', requestId: 'request' },
    { section: 'source', path: 'app.txt' }, { section: 'check', checkKey: 'test', offset: 0 },
    { section: 'log', checkKey: 'test' }, { section: 'patch', requestId: 'request', observationId: 'observation' },
    { section: 'patch', packageId: 'package' }, { section: 'patch', maxBytes: 65_537 },
    { section: 'patch', offset: -1 }, { section: 'check', checkKey: 'test', attempt: 0 },
  ]) await assert.rejects(() => inspectTask({ ...task, ...selectors }), /Inspection selectors/);
  await assert.rejects(() => runCli(['task', 'inspect', task.projectRoot, '--task', task.taskId,
    '--section', 'summary', '--max-bytes', '100']), /Inspection selectors/);
});
