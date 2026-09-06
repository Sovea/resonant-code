import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { initializeProject, inspectProjectInstallation } from '../src/project/init.ts';

test('init generates one compact embedded Host surface and initial schema project configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'stetra-init-'));
  try {
    const initialized = initializeProject({ projectRoot: root, adapters: ['codex'] });
    assert.equal(initialized.status, 'initialized');
    assert.equal(initialized.schemaVersion, '1');
    const skillPath = join(root, '.agents', 'skills', 'stetra', 'SKILL.md');
    const skill = readFileSync(skillPath, 'utf8');
    assert.match(skill, /normal engineering loop and conversation/);
    assert.match(skill, /stetra task begin/);
    assert.match(skill, /stetra task\s+collect/);
    assert.match(skill, /stetra task report/);
    assert.match(skill, /stetra adoption/);
    assert.match(skill, /fork_turns none/);
    assert.match(skill, /parent runtime permissions can override it/);
    assert.match(skill, /Host establishes effective read-only permissions/);
    assert.doesNotMatch(skill, /hostAction|input reserve|task diagnose|revise-verification|Challenge command/);
    assert.ok(Buffer.byteLength(skill) < 7_000);
    assert.equal(existsSync(join(root, '.agents', 'skills', 'stetra', 'references')), false);

    const config = JSON.parse(readFileSync(join(root, '.stetra', 'config.json'), 'utf8'));
    assert.deepEqual(config, {
      protocol: 'cognitive-adoption',
      schemaVersion: '1',
      admission: 'ask',
      defaultVerificationProfile: null,
      verificationProfiles: {},
      executionPolicy: {
        checkTimeoutMs: 300_000,
        maxTimeoutMs: 900_000,
        maxTimeoutRetriesPerCheck: 1,
      },
    });
    const manifest = JSON.parse(readFileSync(join(root, '.stetra', 'manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, '1');
    assert.deepEqual(manifest.artifacts.map((item: { path: string }) => item.path), [
      '.agents/skills/stetra/SKILL.md',
      '.codex/agents/stetra-analyzer.toml',
      '.codex/hooks.json',
      '.gitignore',
      'AGENTS.md',
    ]);
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    assert.match(gitignore, /\.stetra\/tasks\//);
    assert.match(gitignore, /\.stetra\/host-sessions\//);
    assert.doesNotMatch(gitignore, /inbox/);
    assert.equal(inspectProjectInstallation(root).status, 'current');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('init preserves owner configuration and protects only managed content', () => {
  const root = mkdtempSync(join(tmpdir(), 'stetra-init-ownership-'));
  try {
    initializeProject({ projectRoot: root, adapters: ['codex'] });
    const configPath = join(root, '.stetra', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.admission = 'required';
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    initializeProject({ projectRoot: root, adapters: ['codex'] });
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).admission, 'required');

    const skillPath = join(root, '.agents', 'skills', 'stetra', 'SKILL.md');
    writeFileSync(skillPath, `${readFileSync(skillPath, 'utf8')}owner edit\n`, 'utf8');
    const blocked = initializeProject({ projectRoot: root, adapters: ['codex'] });
    assert.equal(blocked.status, 'blocked');
    assert.match(readFileSync(skillPath, 'utf8'), /owner edit/);
    const forced = initializeProject({ projectRoot: root, adapters: ['codex'], force: true });
    assert.equal(forced.status, 'initialized');
    assert.doesNotMatch(readFileSync(skillPath, 'utf8'), /owner edit/);
    assert.equal(JSON.parse(readFileSync(configPath, 'utf8')).admission, 'required');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated Hooks coexist with unrelated project Hooks and agents', () => {
  const root = mkdtempSync(join(tmpdir(), 'stetra-hook-coexistence-'));
  try {
    mkdirSync(join(root, '.codex', 'agents'), { recursive: true });
    writeFileSync(join(root, '.codex', 'hooks.json'), '{\n  "hooks": { "PreToolUse": [] }\n}\n', 'utf8');
    writeFileSync(join(root, '.codex', 'agents', 'owner.toml'), 'name = "owner"\n', 'utf8');
    initializeProject({ projectRoot: root, adapters: ['codex'] });
    const hooks = JSON.parse(readFileSync(join(root, '.codex', 'hooks.json'), 'utf8'));
    assert.deepEqual(hooks.hooks.PreToolUse, []);
    assert.match(hooks.hooks.SessionStart[0].hooks[0].command, /stetra host hook --adapter codex/);
    assert.match(hooks.hooks.Stop[0].hooks[0].command, /stetra host hook --adapter codex/);
    assert.equal(readFileSync(join(root, '.codex', 'agents', 'owner.toml'), 'utf8'), 'name = "owner"\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dry-run writes nothing and unsupported manifest versions fail', () => {
  const root = mkdtempSync(join(tmpdir(), 'stetra-init-schema-'));
  try {
    writeFileSync(join(root, 'AGENTS.md'), 'Owner instructions\n', 'utf8');
    const planned = initializeProject({ projectRoot: root, adapters: ['claude'], dryRun: true });
    assert.equal(planned.status, 'planned');
    assert.equal(existsSync(join(root, '.stetra')), false);
    assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'Owner instructions\n');

    initializeProject({ projectRoot: root, adapters: ['claude'] });
    const manifestPath = join(root, '.stetra', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, schemaVersion: 'unsupported' })}\n`, 'utf8');
    assert.throws(() => initializeProject({ projectRoot: root }), /UNSUPPORTED_SCHEMA_VERSION/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
