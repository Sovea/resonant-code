import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test, { type TestContext } from 'node:test';
import { stripVTControlCharacters } from 'node:util';

import { hostAdapterDefinition, type HostAdapter } from '../src/adapters/definition.ts';
import { formatCliOutput, runCli } from '../src/cli.ts';
import { CliError } from '../src/errors.ts';
import { initializeProject } from '../src/project/init.ts';
import type { RunCliOptions } from '../src/runtime-context.ts';

const noPrompt = { selectAdapters: async (): Promise<HostAdapter[]> => assert.fail('Unexpected prompt') };

for (const { keys, adapters } of [
  { keys: '\r', adapters: ['codex'] },
  { keys: 'i\r', adapters: ['claude'] },
  { keys: 'a\r', adapters: ['claude', 'codex'] },
]) test(`interactive init installs the selected coding agents: ${adapters.join(', ')}`, async (t) => {
  const root = project(t);
  const before = snapshot(root);
  const prompt = startInit(t, root);
  await prompt.waitFor(/Claude Code/);
  assert.match(prompt.text(), /Codex/);
  assert.deepEqual(snapshot(root), before, 'Selection must precede all writes');
  prompt.input.write(keys);
  const result = await prompt.result;
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.stetra/manifest.json'), 'utf8')).adapters, adapters);
  assert.equal(readFileSync(join(root, 'owner.txt'), 'utf8'), 'Keep this file.\n');
  for (const adapter of adapters as HostAdapter[]) {
    assert.match(formatCliOutput(result), new RegExp(hostAdapterDefinition(adapter).displayName));
  }
});

test('interactive init requires a selection and allows recovery without defaulting an empty answer', async (t) => {
  const root = project(t);
  const before = snapshot(root);
  const prompt = startInit(t, root);
  await prompt.waitFor(/Claude Code/);
  prompt.input.write(' \r');
  await prompt.waitFor(/At least one choice must be selected/);
  assert.deepEqual(snapshot(root), before);
  prompt.input.write('i\r');
  const result = await prompt.result;
  assert.deepEqual((result.output as { adapters: string[] }).adapters, ['claude', 'codex']);
});

test('repeated interactive init preserves enabled choices and adds the other coding agent', async (t) => {
  for (const adapter of ['codex', 'claude'] as const) {
    const root = project(t);
    initializeProject({ projectRoot: root, adapters: [adapter] });
    const before = snapshot(root);
    const prompt = startInit(t, root);
    await prompt.waitFor(/already enabled/);
    assert.match(prompt.text(), new RegExp(`${hostAdapterDefinition(adapter).displayName} \\(already enabled\\)`));
    // Inverting the menu must not deselect the disabled, already enabled item.
    prompt.input.write('i\r');
    const result = await prompt.result;
    assert.deepEqual((result.output as { adapters: string[] }).adapters, ['claude', 'codex']);
    const after = snapshot(root);
    for (const [path, content] of Object.entries(before)) {
      if (path !== '.stetra/manifest.json') assert.equal(after[path], content, path);
    }
    const refreshed = await runCli(['init', root], { interactive: true, prompts: noPrompt });
    assert.equal(refreshed.exitCode, 0);
    assert.deepEqual(snapshot(root), after, 'Fully enabled setup must be an idempotent refresh');
  }
});

test('repeated interactive init can keep the current selection without adding an adapter', async (t) => {
  const root = project(t);
  initializeProject({ projectRoot: root, adapters: ['claude'] });
  const before = snapshot(root);
  const prompt = startInit(t, root);
  await prompt.waitFor(/already enabled/);
  prompt.input.write('\r');
  const result = await prompt.result;
  assert.deepEqual((result.output as { adapters: string[] }).adapters, ['claude']);
  assert.deepEqual(snapshot(root), before);
});

test('interactive dry-run and cancellation preserve new and existing projects', async (t) => {
  for (const existing of [false, true]) {
    for (const dryRun of [false, true]) {
      const root = project(t);
      if (existing) initializeProject({ projectRoot: root, adapters: ['claude'] });
      const before = snapshot(root);
      const prompt = startInit(t, root, dryRun ? ['--dry-run'] : []);
      await prompt.waitFor(/Claude Code/);
      if (dryRun) {
        prompt.input.write('a\r');
        const result = await prompt.result;
        assert.equal((result.output as { status: string }).status, 'planned');
        assert.deepEqual((result.output as { adapters: string[] }).adapters, ['claude', 'codex']);
      } else {
        prompt.input.write('\x03');
        await assert.rejects(prompt.result, (error: unknown) => {
          assert.ok(error instanceof CliError);
          assert.equal(error.code, 'PROMPT_CANCELLED');
          assert.equal(error.exitCode, 130);
          return true;
        });
      }
      assert.deepEqual(snapshot(root), before);
    }
  }
});

test('interactive additions preserve managed-file conflicts and recover with explicit force', async (t) => {
  const root = project(t);
  initializeProject({ projectRoot: root, adapters: ['codex'] });
  const analyzer = join(root, '.codex/agents/stetra-analyzer.toml');
  writeFileSync(analyzer, readFileSync(analyzer, 'utf8') + '# owner edit\n');
  const before = snapshot(root);
  const blocked = startInit(t, root);
  await blocked.waitFor(/already enabled/);
  blocked.input.write('a\r');
  const result = await blocked.result;
  assert.equal(result.exitCode, 2);
  assert.match(formatCliOutput(result), /--force/);
  assert.deepEqual(snapshot(root), before, 'A conflict must block every planned write');

  const retry = startInit(t, root, ['--force']);
  await retry.waitFor(/already enabled/);
  retry.input.write('a\r');
  assert.equal((await retry.result).exitCode, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.stetra/manifest.json'), 'utf8')).adapters, ['claude', 'codex']);
});

test('explicit adapter arguments bypass interaction, deduplicate, and reject invalid choices before writing', async (t) => {
  for (const adapters of [['claude'], ['codex', 'claude', 'codex']]) {
    const root = project(t);
    const result = await runCli(['init', root, ...adapters.flatMap((adapter) => ['--adapter', adapter])],
      { interactive: true, prompts: noPrompt });
    assert.deepEqual((result.output as { adapters: string[] }).adapters, [...new Set(adapters)].sort());
  }
  const root = project(t);
  const before = snapshot(root);
  await assert.rejects(runCli(['init', root, '--adapter', 'unsupported'], { interactive: true, prompts: noPrompt }),
    (error: unknown) => error instanceof CliError && error.code === 'INVALID_INPUT');
  assert.deepEqual(snapshot(root), before);
});

test('unattended init uses Codex for new projects and preserves existing adapters', async (t) => {
  const scenarios: Array<{ args: string[]; options: RunCliOptions }> = [
    { args: ['--yes'], options: { interactive: true } },
    { args: ['--json'], options: { interactive: true } },
    { args: ['--no-interactive'], options: { interactive: true } },
    { args: [], options: { input: new PassThrough(), output: new PassThrough() } },
  ];
  for (const { args, options } of scenarios) {
    for (const existing of [false, true]) {
      const root = project(t);
      if (existing) initializeProject({ projectRoot: root, adapters: ['claude'] });
      const result = await runCli(['init', root, ...args], { ...options, prompts: noPrompt });
      assert.deepEqual((result.output as { adapters: string[] }).adapters, [existing ? 'claude' : 'codex']);
      if (args.includes('--json')) assert.deepEqual(JSON.parse(formatCliOutput(result)), result.output);
    }
  }
});

test('CI disables selection even when both streams are terminals', async (t) => {
  const priorCI = process.env.CI;
  process.env.CI = 'true';
  try {
    const root = project(t);
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    const result = await runCli(['init', root], { input, output, prompts: noPrompt });
    assert.deepEqual((result.output as { adapters: string[] }).adapters, ['codex']);
    input.destroy(); output.destroy();
  } finally {
    if (priorCI === undefined) delete process.env.CI;
    else process.env.CI = priorCI;
  }
});

function project(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), 'stetra-init-command-'));
  writeFileSync(join(root, 'owner.txt'), 'Keep this file.\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function snapshot(root: string, prefix = ''): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = prefix + entry.name;
    entries[path] = entry.isDirectory() ? 'directory' : readFileSync(join(root, entry.name)).toString('base64');
    if (entry.isDirectory()) Object.assign(entries, snapshot(join(root, entry.name), path + '/'));
  }
  return entries;
}

function startInit(t: TestContext, root: string, args: string[] = []) {
  const input = new PassThrough();
  const events = new EventEmitter();
  let rendered = '';
  const output = new Writable({ write(chunk, _encoding, callback) {
    rendered += String(chunk); callback(); events.emit('render');
  } });
  const result = runCli(['init', root, ...args], { input, output, interactive: true, color: false });
  let settled = false;
  void result.then(() => { settled = true; }, () => { settled = true; });
  t.after(async () => {
    if (!settled) input.write('\x03');
    await result.catch(() => undefined);
    input.destroy(); output.destroy();
  });
  const text = () => stripVTControlCharacters(rendered);
  return { input, result, text, async waitFor(pattern: RegExp) {
    const signal = AbortSignal.timeout(30_000);
    while (!pattern.test(text())) await once(events, 'render', { signal });
  } };
}
