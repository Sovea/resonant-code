import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
import { pathToFileURL } from 'node:url';

const workspace = resolve(import.meta.dirname, '..');
const expectedVersion = JSON.parse(
  readFileSync(resolve(workspace, 'packages', 'core', 'package.json'), 'utf8'),
).version;
const temporary = mkdtempSync(join(tmpdir(), 'stetra-core-release-'));

try {
  const packDirectory = join(temporary, 'pack');
  const consumer = join(temporary, 'consumer');
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), '{"private":true}\n', 'utf8');
  const coreTarball = packPackage(join(workspace, 'packages', 'core'), packDirectory);
  run(npmCommand(), ['install', coreTarball, '--ignore-scripts', '--no-audit', '--no-fund'], consumer);

  const installedCore = join(consumer, 'node_modules', '@sovea', 'stetra-core');
  const manifest = JSON.parse(readFileSync(join(installedCore, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@sovea/stetra-core');
  assert.equal(manifest.version, expectedVersion);
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './package.json']);
  assert.equal(existsSync(join(installedCore, 'assets')), false);

  const core = await import(pathToFileURL(join(installedCore, 'dist', 'index.mjs')).href);
  assert.deepEqual(Object.keys(core).sort(), ['evaluateAdoption', 'planTransition', 'reduceTaskEvent', 'schemas']);
  assert.equal(core.schemas.schemaVersion, '1');
  const taskId = '00000000-0000-4000-8000-000000000001';
  const projection = { head: null, treeId: 'a'.repeat(40), entries: [] };
  const snapshot = { source: 'git-worktree-tree', ...projection, fingerprint: stableFingerprint(projection) };
  const currency = { worktreeFingerprint: snapshot.fingerprint, executionInputsFingerprint: stableFingerprint([]) };
  let state = null, sequence = 0;
  const transition = (command, extra = {}) => {
    const planned = core.planTransition(state, command, { taskId,
      operationId: '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0'), ...extra });
    assert.equal(planned.status, 'transition', JSON.stringify(planned.issues));
    assert.deepEqual(core.reduceTaskEvent(state, planned.event, planned.artifacts), planned.state);
    state = planned.state;
  };
  transition({ type: 'begin', input: {
    humanEvent: { content: 'Exercise the isolated installed task kernel.' },
    interpretation: { desiredOutcome: 'Keep adoption explicit.', constraints: [], nonGoals: [] },
    verification: { mode: 'no-command', rationale: 'This pure domain fixture has no executable worktree.' },
  } }, { baseline: snapshot, executionPolicy: core.schemas.defaults.executionPolicy,
    verification: { mode: 'no-command', rationale: 'This pure domain fixture has no executable worktree.' } });
  transition({ type: 'collect', input: {} }, { observation: {
    baselineFingerprint: snapshot.fingerprint, preCheck: snapshot, current: snapshot,
    preCheckExecutionInputs: [], currentExecutionInputs: [], changeFingerprint: stableFingerprint([]),
    changedFiles: [], checkInducedChanges: [], checks: [], verifierMutations: [],
    environment: { platform: process.platform, architecture: process.arch, executables: [] },
    provenance: { collector: 'stetra-cli', cliVersion: expectedVersion, coreVersion: expectedVersion },
  } });
  transition({ type: 'report', input: { report: {
    behavior: 'No source change is part of this domain fixture.', mechanism: ['The public transition API preserves explicit authority.'],
  } } }, { currency });
  transition({ type: 'assess', input: { kind: 'assessment', requestId: state.requestId,
    context: 'same-context', summary: 'This smoke fixture only checks distributability.',
    claims: [], relations: [], findings: [],
  } });
  transition({ type: 'prepare', input: { recommendation: {
    action: 'accept-with-limitations', rationale: 'The domain fixture is internally consistent; it is not product evidence.',
  } } }, { currency });
  const view = core.evaluateAdoption(state, currency);
  assert.equal(view.next, 'await-human-decision');
  assert.equal(state.closed, false);
  assert.equal(core.evaluateAdoption(state).packageCurrent, false);
  transition({ type: 'decide', input: { packageId: state.packageId, action: 'accepted',
    humanEvent: { content: 'Accept this smoke fixture and its disclosed same-context relayed analysis.' },
    reason: 'Fixture decision.', acknowledge: view.attention.map((item) => item.id),
  } }, { currency });
  assert.equal(core.evaluateAdoption(state, currency).next, 'complete');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableFingerprint(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function packPackage(packageDirectory, destination) {
  const before = new Set(readdirSync(destination));
  run('corepack', ['pnpm', 'pack', '--pack-destination', destination], packageDirectory);
  const created = readdirSync(destination).filter((name) => name.endsWith('.tgz') && !before.has(name));
  assert.equal(created.length, 1, `Expected one tarball from ${packageDirectory}.`);
  return join(destination, created[0]);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  assert.equal(result.status, 0, [
    `Command failed: ${command} ${args.join(' ')}`,
    result.stdout,
    result.stderr,
  ].join('\n'));
  return result;
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
