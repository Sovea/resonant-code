import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { verifyReleaseInstallation } from '../scripts/verify-release-install.mjs';

const workspace = resolve(import.meta.dirname, '..');
const sourceCoreManifest = JSON.parse(readFileSync(resolve(workspace, 'packages/core/package.json'), 'utf8'));
const sourceCliManifest = JSON.parse(readFileSync(resolve(workspace, 'packages/cli/package.json'), 'utf8'));
assert.equal(sourceCoreManifest.version, sourceCliManifest.version);
const expectedVersion = sourceCoreManifest.version;
const temporary = mkdtempSync(join(tmpdir(), 'stetra-cli-release-'));

try {
  const packDirectory = join(temporary, 'pack');
  const consumer = join(temporary, 'consumer');
  const project = join(temporary, 'project');
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'package.json'), '{"name":"packed-cli-smoke","type":"module"}\n', 'utf8');
  writeFileSync(join(project, 'src/example.ts'), 'export const value = 1;\n', 'utf8');

  const coreTarball = packPackage(join(workspace, 'packages/core'), packDirectory);
  const cliTarball = packPackage(join(workspace, 'packages/cli'), packDirectory);
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
    private: true,
    dependencies: {
      '@sovea/stetra-core': `file:${coreTarball.replace(/\\/g, '/')}`,
      '@sovea/stetra': `file:${cliTarball.replace(/\\/g, '/')}`,
    },
  }, null, 2)}\n`, 'utf8');
  run(npmCommand(), ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
  await verifyReleaseInstallation(consumer, expectedVersion);

  const installedCli = join(consumer, 'node_modules/@sovea/stetra');
  const cliManifest = JSON.parse(readFileSync(join(installedCli, 'package.json'), 'utf8'));
  assert.equal(cliManifest.version, expectedVersion);
  assert.equal(cliManifest.dependencies['@sovea/stetra-core'], expectedVersion);
  const entrypoint = resolve(installedCli, cliManifest.bin.stetra);
  const binary = join(consumer, 'node_modules/.bin', process.platform === 'win32' ? 'stetra.cmd' : 'stetra');
  assert.equal(run(binary, ['--version'], consumer).stdout.trim(), expectedVersion);
  const setupProject = join(temporary, 'agent-setup');
  mkdirSync(setupProject);
  const setup = (...args) => runJson(entrypoint, ['--json', 'init', setupProject, ...args], consumer);
  assert.deepEqual(setup('--adapter', 'claude').adapters, ['claude']);
  const claudeAnalyzer = join(setupProject, '.claude/agents/stetra-analyzer.md');
  const originalAnalyzer = readFileSync(claudeAnalyzer, 'utf8');
  assert.deepEqual(setup('--yes').adapters, ['claude']);
  const planned = setup('--adapter', 'codex', '--dry-run');
  assert.equal(planned.status, 'planned');
  assert.deepEqual(planned.adapters, ['claude', 'codex']);
  assert.equal(existsSync(join(setupProject, '.codex')), false);
  assert.deepEqual(setup('--adapter', 'codex').adapters, ['claude', 'codex']);
  assert.ok(existsSync(join(setupProject, '.codex/agents/stetra-analyzer.toml')));
  assert.equal(readFileSync(claudeAnalyzer, 'utf8'), originalAnalyzer);
  for (const argv of [['task', 'begin'], ['task', 'report'], ['decision', 'propose'], ['assessment', 'submit'], ['adoption', 'prepare'], ['adoption', 'decide']]) {
    const schema = runJson(entrypoint, ['--json', ...argv, '--input-schema'], consumer);
    assert.equal(schema.status, 'input-schema'); assert.ok(schema.inputSchema); assert.ok(schema.example);
  }
  const initialized = runJson(entrypoint, ['--json', 'init', project], consumer);
  assert.equal(initialized.status, 'initialized'); assert.equal(initialized.schemaVersion, '1');
  assert.deepEqual(initialized.adapters, ['codex']);
  assert.match(readFileSync(join(project, '.codex/agents/stetra-analyzer.toml'), 'utf8'), /sandbox_mode = "read-only"/);
  const installedSkill = readFileSync(join(project, '.agents/skills/stetra/SKILL.md'), 'utf8');
  assert.match(installedSkill, /fork_turns none/);
  assert.match(installedSkill, /parent runtime permissions can override it/);
  git(project, ['init', '--quiet']); git(project, ['config', 'user.email', 'release@example.invalid']);
  git(project, ['config', 'user.name', 'CLI Release Smoke']); git(project, ['add', '-A']); git(project, ['commit', '--quiet', '-m', 'initial']);
  const native = (event, extra = {}) => runJson(entrypoint, ['--json', 'host', 'hook', '--adapter', 'codex', '--event', event], consumer,
    JSON.stringify({ session_id: 'packed-session', cwd: project, hook_event_name:
      { 'session-start': 'SessionStart', 'subagent-start': 'SubagentStart', 'subagent-stop': 'SubagentStop', stop: 'Stop' }[event], ...extra }));
  const context = native('session-start').hookSpecificOutput.additionalContext;
  const bindingToken = context.match(/--binding-token ([a-z]+\.[a-f0-9]{64}\.[a-f0-9]{32})/)?.[1];
  assert.ok(bindingToken);
  const beginInput = {
    humanEvent: { content: 'Change the packed fixture value to 2.' },
    interpretation: { desiredOutcome: 'The fixture exports 2.', constraints: ['Keep the export name.'], nonGoals: [] },
    verification: { mode: 'checks', checks: [{
      key: 'fixture-check', argv: [process.execPath, '-e',
        "const ok=require('node:fs').readFileSync('src/example.ts','utf8').includes('value = 2');process.stdout.write('fixture-out\\n');process.stderr.write('fixture-err\\n');process.exit(ok?0:1)"],
      executionInputs: [{ kind: 'file', path: 'src/example.ts' }],
      verifierSelectors: [{ kind: 'file', path: 'src/example.ts', role: 'acceptance-surface' }],
    }] },
  };
  const began = runJson(entrypoint, ['--json', 'task', 'begin', project, '--binding-token', bindingToken], consumer, JSON.stringify(beginInput));
  assert.equal(began.phase, 'work');
  const call = (group, operation, input, options = []) => runJson(entrypoint,
    ['--json', group, operation, project, '--task', began.taskId, ...options], consumer, input && JSON.stringify(input));
  const proposal = call('decision', 'propose', {
    key: 'format', question: 'Which value representation should be retained?', proposedOption: 'literal', requiresHuman: false,
    options: [{ key: 'literal', description: 'Keep the number literal.', consequences: ['Existing readers keep working.'] },
      { key: 'string', description: 'Export a string.', consequences: ['Readers need conversion.'] }],
    selection: { option: 'literal', authority: { kind: 'existing-authority', basis: ['request'], rationale: 'The request changes the numeric value.' } },
  });
  assert.deepEqual(proposal.summary.pendingDecisions, []);
  writeFileSync(join(project, 'src/example.ts'), 'export const value = 2;\n');
  const collected = call('task', 'collect');
  assert.equal(collected.status, 'observations-collected');
  assert.deepEqual(collected.summary.observations.checks.map((check) => [check.key, check.status]), [['fixture-check', 'passed']]);
  const observation = call('task', 'inspect', undefined, ['--section', 'observation']).observation;
  assert.equal(observation.data.checks[0].attempts[0].stdout.byteLength, 12);
  assert.equal(observation.data.checks[0].attempts[0].stderr.byteLength, 12);
  assert.equal(existsSync(join(project, observation.data.patch.path)), true);
  const report = call('task', 'report', { report: {
    behavior: 'The fixture exports the number 2.', mechanism: ['The source literal changed.'], decisions: ['format'],
    evidence: [{ kind: 'source', snapshot: 'current', path: 'src/example.ts' }, { kind: 'check', checkKey: 'fixture-check' }],
  } }, ['--binding-token', bindingToken]);
  const reassessed = call('task', 'report', undefined,
    ['--reassess', '--reason', 'Retry interrupted packed Host analysis.', '--binding-token', bindingToken]);
  assert.equal(reassessed.current.reportId, report.current.reportId);
  assert.equal(reassessed.current.observationId, report.current.observationId);
  assert.notEqual(reassessed.current.requestId, report.current.requestId);
  const requestId = reassessed.current.requestId;
  assert.equal(call('task', 'inspect', undefined, ['--section', 'source', '--request', requestId,
    '--snapshot', 'baseline', '--path', 'src/example.ts']).content, 'export const value = 1;\n');
  const child = { agent_id: 'packed-analyzer', agent_type: 'stetra-analyzer', turn_id: 'packed-turn' };
  assert.match(native('subagent-start', child).hookSpecificOutput.additionalContext, new RegExp(requestId));
  const assessment = { kind: 'assessment', requestId, context: 'separate-context',
    summary: 'The numeric literal change preserves the public export.',
    claims: [{ key: 'value', before: 'The export is 1.', after: 'The export is 2.', mechanism: 'The number literal changed.',
      invariants: ['The export name remains value.'],
      evidence: [{ kind: 'source', snapshot: 'baseline', path: 'src/example.ts' }, { kind: 'source', snapshot: 'current', path: 'src/example.ts' }] }],
    relations: [{ claimKey: 'value', basis: { kind: 'decision', key: 'format' }, explanation: 'The existing-authority choice preserves the numeric representation.' }],
    findings: [], reviewFocus: ['Check that consumers still import value.'],
  };
  assert.match(native('subagent-stop', { ...child, last_assistant_message: JSON.stringify(assessment) }).systemMessage, /assessment-recorded/);
  const prepared = call('adoption', 'prepare', { recommendation: { action: 'accept-with-limitations', rationale: 'The frozen check passes; the declared verifier surface changed.' } });
  assert.deepEqual(prepared.adoptionBrief.attention.map((item) => item.code), ['verifier-changed']);
  assert.equal(prepared.adoptionBrief.humanChoice, 'pending');
  const restored = call('task', 'inspect', undefined, ['--section', 'adoption', '--live']);
  assert.deepEqual(restored.adoptionBrief, prepared.adoptionBrief);
  const human = run(process.execPath, [entrypoint, 'task', 'inspect', project, '--task', began.taskId, '--section', 'adoption', '--live'], consumer).stdout;
  assert.match(human, /Agent recommendation/); assert.match(human, /Check that consumers still import value/);
  assert.match(human, /Human adoption: pending/);
  const adopted = call('adoption', 'decide', {
    packageId: prepared.current.packageId, action: 'accepted', humanEvent: { content: 'Accept, including the disclosed verifier change.' },
    reason: 'The source and changed verifier surface were reviewed.', acknowledge: prepared.adoptionBrief.attention.map((item) => item.id),
  });
  assert.equal(adopted.phase, 'complete'); assert.deepEqual(native('stop'), {});
  const history = call('task', 'inspect', undefined, ['--section', 'history']);
  assert.deepEqual(history.events.map((item) => item.event.type), ['begin', 'propose', 'collect', 'report', 'report', 'assess', 'prepare', 'decide']);
  const next = runJson(entrypoint, ['--json', 'task', 'begin', project, '--binding-token', bindingToken], consumer, JSON.stringify(beginInput));
  assert.notEqual(next.taskId, began.taskId);
  const resumed = runJson(entrypoint, ['--json', 'task', 'begin', project, '--binding-token', bindingToken], consumer, JSON.stringify(beginInput));
  assert.equal(resumed.taskId, next.taskId); assert.equal(resumed.status, 'task-resumed');
  assert.equal(runJson(entrypoint, ['--json', 'status', project], consumer).status, 'ready');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function runJson(entrypoint, args, cwd, input) {
  return JSON.parse(run(process.execPath, [entrypoint, ...args], cwd, {
    shell: false,
    ...(input === undefined ? {} : { input }),
  }).stdout);
}

function run(command, args, cwd, {
  shell = process.platform === 'win32',
  expectStatus = 0,
  input,
} = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell,
    input,
  });
  assert.equal(result.status, expectStatus, [
    `Command returned unexpected status: ${command} ${args.join(' ')}`,
    result.stdout,
    result.stderr,
  ].join('\n'));
  return result;
}

function git(projectRoot, args) {
  execFileSync('git', ['-C', projectRoot, ...args], { stdio: 'ignore' });
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function packPackage(packageDirectory, destination) {
  const before = new Set(readdirSync(destination));
  run('corepack', ['pnpm', 'pack', '--pack-destination', destination], packageDirectory);
  const created = readdirSync(destination).filter((name) => name.endsWith('.tgz') && !before.has(name));
  assert.equal(created.length, 1, `Expected one tarball from ${packageDirectory}.`);
  return join(destination, created[0]);
}
