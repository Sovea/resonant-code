import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemas } from '@sovea/stetra-core';
import type { z } from 'zod';
import { initializeProject } from '../../src/project/init.ts';
import { readProjectConfig, type ProjectConfig } from '../../src/schemas/config.ts';
import { reportTask } from '../../src/workflow/report.ts';
import { submitAssessment } from '../../src/workflow/assessment.ts';
import { prepareAdoption } from '../../src/workflow/adoption.ts';

export function git(root: string, args: string[]): Buffer { return execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' }); }
export function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'stetra-runtime-'));
  for (const args of [['init', '--quiet'], ['config', 'user.name', 'Stetra Test'], ['config', 'user.email', 'stetra@example.test']]) git(root, args);
  writeFileSync(join(root, 'app.txt'), 'old\n');
  writeFileSync(join(root, 'notes.md'), 'An old note.\n');
  initializeProject({ projectRoot: root, adapters: ['codex', 'claude'] });
  git(root, ['add', '-A']); git(root, ['commit', '--quiet', '-m', 'fixture']);
  return root;
}
export function configure(root: string, change: (config: ProjectConfig) => void): void {
  const path = join(root, '.stetra/config.json');
  const config = readProjectConfig(root); change(config); writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
}
export function beginInput(checks = false): z.input<typeof schemas.commands.begin> {
  return { humanEvent: { content: '  Change app.txt from old to new.\n' },
    interpretation: { desiredOutcome: 'The requested text is present.', constraints: ['Keep the file name.'], nonGoals: [] },
    verification: checks ? { mode: 'checks', checks: [{ key: 'content',
      argv: [process.execPath, '-e', "const fs=require('node:fs');if(fs.readFileSync('app.txt','utf8')!=='new\\n'){process.stderr.write('expected new\\n');process.exit(1)}"],
      executionInputs: [{ kind: 'file', path: 'app.txt' }] }] }
      : { mode: 'no-command', rationale: 'Review the literal wording in the retained source.' } };
}
export function reportInput(): z.input<typeof schemas.commands.report> {
  return { report: { behavior: 'The text now contains the requested value.', mechanism: ['The literal value was replaced.'],
    evidence: [{ kind: 'source', snapshot: 'current', path: 'app.txt' }] } };
}
export function assessmentInput(requestId: string): z.output<typeof schemas.commands.assess> {
  return { kind: 'assessment', requestId, context: 'separate-context', summary: 'The literal change matches the request.',
    claims: [{ key: 'text', before: 'The literal reads old.', after: 'The literal reads new.', mechanism: 'The stored bytes changed.',
      evidence: [{ kind: 'source', snapshot: 'baseline', path: 'app.txt' }, { kind: 'source', snapshot: 'current', path: 'app.txt' }] }],
    relations: [{ claimKey: 'text', basis: { kind: 'request' }, explanation: 'This is the requested text replacement.' }],
    findings: [], dispositions: [], unknowns: [], reviewFocus: [] };
}
export async function prepare(input: { projectRoot: string; taskId: string; bindingToken?: string }) {
  const report = await reportTask({ ...input, source: reportInput() });
  submitAssessment({ ...input, source: assessmentInput(report.current.requestId!) });
  return prepareAdoption({ ...input, source: { recommendation: { action: 'accept-with-limitations',
    rationale: 'The literal change is explained; analysis provenance is relayed.' } } });
}
