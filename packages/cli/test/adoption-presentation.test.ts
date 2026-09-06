import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { runCli, formatCliOutput } from '../src/cli.ts';
import { assessmentInput, beginInput, reportInput, repository } from './fixtures/task.ts';

test('CLI decision, correction, revised verification, analysis, and Human view preserve distinct authority and findings', async () => {
  const root = repository();
  try {
    const begin = await runCli(['task', 'begin', root], { input: Readable.from([JSON.stringify(beginInput())]) });
    const taskId = (begin.output as { taskId: string }).taskId;
    const call = (group: string, command: string, source?: unknown, options: string[] = []) => runCli([group, command, root, '--task', taskId, ...options],
      { input: Readable.from(source === undefined ? [] : [JSON.stringify(source)]), color: false });
    const proposal = await call('decision', 'propose', { key: 'scope', question: 'Should the output format change?', requiresHuman: true,
      proposedOption: 'plain', waitingWork: ['Changing the consumer format.'], options: [
        { key: 'plain', description: 'Keep plain text.', consequences: ['The current reader still works.'] },
        { key: 'json', description: 'Use JSON.', consequences: ['The reader needs a parser.'] },
      ] });
    assert.match(formatCliOutput(proposal), /resolve-decision/);
    const decisions = await call('task', 'inspect', undefined, ['--section', 'decisions']);
    const decision = (decisions.output as { decisions: Array<{ proposal: { id: string } }> }).decisions[0];
    await call('decision', 'resolve', { decisionKey: 'scope', proposalId: decision.proposal.id, option: 'plain',
      authority: { kind: 'human', humanEvent: { content: 'Keep plain text.' } } });
    await call('task', 'amend', { kind: 'interpretation', interpretation: beginInput().interpretation, reason: 'Reaffirm the requested literal.' });
    const currentDecisions = await call('task', 'inspect', undefined, ['--section', 'decisions']);
    assert.match(formatCliOutput(currentDecisions), /Keep plain text/);
    await call('verification', 'revise', { verification: { mode: 'no-command', rationale: 'Read the retained literal source.' },
      authority: { kind: 'existing-authority', basis: ['request'], rationale: 'The authorized literal replacement is directly inspectable.' } });
    // Reaffirm a proposal under its preserved exact Human choice after interpretation revision.
    const history = await call('task', 'inspect', undefined, ['--section', 'history']);
    const human = (history.output as { records: Array<{ kind: string; purpose?: string; id: string }> }).records.find((r) => r.kind === 'human-event' && r.purpose === 'decision')!;
    await call('decision', 'resolve', { decisionKey: 'scope', proposalId: decision.proposal.id, option: 'plain',
      authority: { kind: 'existing-authority', basis: [human.id], rationale: 'The exact earlier Human choice remains effective.' } });
    writeFileSync(join(root, 'app.txt'), 'new\n'); await call('task', 'collect');
    const report = await call('task', 'report', { report: { ...reportInput().report, decisions: ['scope'],
      ownership: ['The repository owns the literal.'], invariants: ['The path is stable.'],
      failureAndRecovery: ['Restore the previous literal to revert.'], effects: ['Readers see new.'], tradeoffs: ['No format migration.'], unknowns: ['Consumer usage is not inspected.'] } });
    const requestId = (report.output as { current: { requestId: string } }).current.requestId;
    const assessment = assessmentInput(requestId);
    if (assessment.kind !== 'assessment') assert.fail('expected analysis');
    assessment.context = 'same-context'; assessment.unknowns = ['Consumer behavior is unverified.']; assessment.reviewFocus = ['Inspect the downstream reader.'];
    assessment.findings = [{ key: 'reader', kind: 'insufficient-evidence', claimKeys: ['text'], statement: 'Reader compatibility lacks evidence.',
      consequence: 'The adoption decision retains a reader compatibility gap.', evidence: [{ kind: 'source', snapshot: 'current', path: 'app.txt' }], nextAction: 'Inspect the reader before adoption.' }];
    const assessed = await call('assessment', 'submit', assessment);
    const assessmentId = (assessed.output as { current: { assessmentId: string } }).current.assessmentId;
    const prepared = await call('adoption', 'prepare', { recommendation: { action: 'defer', rationale: 'Review the downstream reader.', caveats: ['No compatibility check.'] },
      responses: [{ finding: { assessmentId, key: 'reader' }, response: 'The limitation is disclosed; no claim of resolution.', evidence: [] }] });
    const output = formatCliOutput(prepared);
    for (const phrase of ['Agent recommendation: defer', 'Human adoption: pending', 'Runtime observations', 'Analyzer judgment',
      'Reader compatibility lacks evidence', 'The limitation is disclosed', 'Inspect the downstream reader', 'same-context', 'Attention ID:']) assert.ok(output.includes(phrase), phrase);
    const packet = (prepared.output as { current: { packageId: string } }).current.packageId;
    const deferred = await call('adoption', 'decide', { packageId: packet, action: 'deferred', humanEvent: { content: 'Defer until reader review.' }, reason: 'Need evidence.' });
    assert.match(formatCliOutput(deferred), /Human adoption: deferred/);
    const source = await call('task', 'inspect', undefined, ['--section', 'source', '--request', requestId, '--snapshot', 'baseline', '--path', 'app.txt']);
    assert.match(formatCliOutput(source), /old/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
