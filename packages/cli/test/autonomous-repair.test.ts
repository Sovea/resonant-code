import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { beginTask } from '../src/workflow/begin.ts';
import { collectTask } from '../src/workflow/collect.ts';
import { reportTask } from '../src/workflow/report.ts';
import { submitAssessment } from '../src/workflow/assessment.ts';
import { prepareAdoption, decideAdoption } from '../src/workflow/adoption.ts';
import { inspectTask } from '../src/workflow/inspect.ts';
import { loadTask } from '../src/workflow/task-store.ts';
import { artifacts } from '../src/workflow/common.ts';
import { assessmentInput, beginInput, reportInput, repository } from './fixtures/task.ts';

test('finding repair and reassessment retain authorization and require explicit Analyzer closure before Human adoption', async () => {
  const projectRoot = repository();
  try {
    const began = await beginTask({ projectRoot, source: beginInput(true) });
    const input = { projectRoot, taskId: began.taskId };
    writeFileSync(join(projectRoot, 'app.txt'), 'wrong\n');
    await collectTask(input);
    const first = await reportTask({ ...input, source: reportInput() });
    const analysis = assessmentInput(first.current.requestId!);
    if (analysis.kind !== 'assessment') assert.fail();
    analysis.findings = [{ key: 'literal', kind: 'direction-conflict', statement: 'The requested literal is absent.',
      consequence: 'The requested behavior is missing.', evidence: [{ kind: 'check', checkKey: 'content' }], claimKeys: ['text'] }];
    const assessed = submitAssessment({ ...input, source: analysis });
    assert.deepEqual(assessed.relatedOperations.map((op) => op.argv.slice(1, 3).join(' ')),
      ['task inspect', 'task collect', 'task report', 'adoption prepare']);
    assert.match(assessed.directive.message, /repair, and reassess within existing authority/);
    const finding = { assessmentId: assessed.current.assessmentId!, key: 'literal' };
    writeFileSync(join(projectRoot, 'app.txt'), 'new\n');
    await collectTask(input);
    const repaired = await reportTask({ ...input, source: reportInput() });
    const second = assessmentInput(repaired.current.requestId!);
    submitAssessment({ ...input, source: second });
    const stillOpen = await prepareAdoption({ ...input, source: {
      recommendation: { action: 'defer', rationale: 'The Analyzer must explicitly reconcile the earlier finding.' } } });
    assert.deepEqual(stillOpen.adoptionBrief!.openFindings.map((item) => item.reference), [finding]);
    const reassessed = await reportTask({ ...input, reassessReason: 'Reconcile the retained finding against the repaired source.' });
    const final = assessmentInput(reassessed.current.requestId!);
    if (final.kind !== 'assessment') assert.fail();
    final.dispositions = [{ finding, outcome: 'addressed', rationale: 'The retained source and passing check show the requested literal.',
      evidence: [{ kind: 'check', checkKey: 'content' }] }];
    submitAssessment({ ...input, source: final });
    const packet = await prepareAdoption({ ...input, source: { recommendation: {
      action: 'accept-with-limitations', rationale: 'The repair is verified; this test relays Analyzer output.' } } });
    assert.deepEqual(packet.adoptionBrief!.openFindings, []);
    const beforeHuman = loadTask(projectRoot, began.taskId).state;
    assert.equal(beforeHuman.attemptNumber, 1);
    assert.equal(artifacts(beforeHuman, 'human-event').length, 1);
    const summary = await inspectTask(input);
    assert.ok(!('adoptionBrief' in summary));
    const frozen = await inspectTask({ ...input, section: 'report', requestId: first.current.requestId });
    assert.ok(!('summary' in frozen));
    assert.ok('selection' in frozen);
    assert.equal(frozen.selection?.requestId, first.current.requestId);
    const accepted = await decideAdoption({ ...input, source: { packageId: packet.current.packageId!, action: 'accepted',
      humanEvent: { content: 'Accept the repaired literal, including relayed analysis.' }, reason: 'Reviewed the final result.',
      acknowledge: packet.adoptionBrief!.attention.map((attention) => attention.id) } });
    assert.equal(accepted.phase, 'complete');
    assert.equal(artifacts(loadTask(projectRoot, began.taskId).state, 'human-event').length, 2);
  } finally { rmSync(projectRoot, { recursive: true, force: true }); }
});
