import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { Command } from 'commander';
import type { z } from 'zod';
import { schemas } from '@sovea/stetra-core';
import { CliError, inputError, usageError } from '../errors.ts';
import { describeTaskInput, inputCommandNames, type InputKind } from '../schemas/task-input.ts';
import { parseArtifact } from '../validation.ts';
import { beginTask } from '../workflow/begin.ts';
import { collectTask } from '../workflow/collect.ts';
import { authorTask } from '../workflow/author.ts';
import { reportTask } from '../workflow/report.ts';
import { submitAssessment } from '../workflow/assessment.ts';
import { prepareAdoption, decideAdoption } from '../workflow/adoption.ts';
import { inspectTask } from '../workflow/inspect.ts';
import type { CommandEnvironment } from './shared.ts';

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
interface InputOptions { input: string; inputSchema?: boolean; task?: string; bindingToken?: string; package?: string; reassess?: boolean; reason?: string }

export function registerTaskCommands(program: Command, environment: CommandEnvironment): void {
  const task = program.command('task').description('Manage one admitted coding task');
  const decision = program.command('decision').description('Record concrete engineering choices and their authority');
  const verification = program.command('verification').description('Revise explicit verification without erasing earlier attempts');
  const assessment = program.command('assessment').description('Submit attributed semantic analysis');
  const adoption = program.command('adoption').description('Prepare a result for an exact Human adoption decision');
  const commands: Array<[Command, string, InputKind, string]> = [
    [task, 'begin', 'begin', 'Admit exact direction and capture the full dirty Git baseline'],
    [task, 'amend', 'amend', 'Preserve an in-work correction or attributed interpretation revision'],
    [decision, 'propose', 'propose', 'Present a concrete choice or record an authorized autonomous selection'],
    [decision, 'resolve', 'resolve', 'Bind a resolution to the exact current proposal'],
    [verification, 'revise', 'verification-revise', 'Freeze a revised check plan and its authority'],
    [task, 'report', 'report', 'Freeze an implementation report and analysis inputs'],
    [assessment, 'submit', 'assess', 'Submit an Assessment for an exact Runtime request'],
    [adoption, 'prepare', 'prepare', 'Respond to assessment and prepare a current Adoption Package'],
    [adoption, 'decide', 'decide', 'Record the later exact Human response to a presented Package'],
  ];
  for (const [parent, name, kind, description] of commands) {
    const command = parent.command(name).description(description).argument('[project-root]', 'Git worktree root', '.')
      .option('--task <id>', 'task ID; required except begin or input-schema discovery')
      .option('--input <path>', 'authoring JSON path outside the worktree, or - for stdin', '-')
      .option('--input-schema', 'show the actual input schema and validated example without reading a task');
    if (kind === 'begin' || kind === 'report') command.option('--binding-token <token>', 'opaque parent Host-session binding');
    if (kind === 'decide') command.option('--package <id>', 'presented Package ID; must agree with the input');
    if (kind === 'report') command.option('--reassess', 'reuse the current Report for another analysis without reading stdin')
      .option('--reason <text>', 'Agent-authored reason for --reassess');
    command.action(async (root: string, options: InputOptions, source: Command) => {
      if (options.inputSchema) { environment.emit(inputCommandNames[kind], describeTaskInput(kind), source); return; }
      if (kind !== 'begin' && !options.task) throw usageError('This command requires --task <id>.');
      if (kind === 'report') {
        if (Boolean(options.reassess) !== Boolean(options.reason)) throw inputError('--reassess requires --reason, and --reason requires --reassess.');
        if (options.reassess) {
          if (source.getOptionValueSource('input') === 'cli') throw inputError('--reassess reuses the current Report; omit --input.');
          environment.emit(inputCommandNames[kind], await reportTask({ projectRoot: root, taskId: options.task!,
            reassessReason: options.reason!, bindingToken: options.bindingToken }), source);
          return;
        }
      }
      const document = await readDocument(root, options.input, environment.runtime.input);
      const result = await executeInput(kind, root, options, document);
      environment.emit(inputCommandNames[kind], result, source);
    });
  }
  task.command('collect').description('Observe the actual Git change and execute all frozen checks')
    .argument('[project-root]', 'Git worktree root', '.')
    .requiredOption('--task <id>', 'admitted task ID')
    .option('--retry-timeout <check-key>', 'retry one currently timed-out check')
    .option('--timeout-ms <milliseconds>', 'larger bounded timeout for the actual timeout retry')
    .option('--refresh-reason <text>', 'one explicit recheck after a non-timeout failure')
    .action(async (root: string, options: { task: string; retryTimeout?: string; timeoutMs?: string; refreshReason?: string }, source: Command) => {
      if (Boolean(options.retryTimeout) !== Boolean(options.timeoutMs)) throw inputError('Supply --retry-timeout and --timeout-ms together.');
      environment.emit('task collect', await collectTask({ projectRoot: root, taskId: options.task,
        refreshReason: options.refreshReason, ...(options.retryTimeout ? { retryTimeout: {
          checkKey: options.retryTimeout, timeoutMs: positiveInteger(options.timeoutMs!, '--timeout-ms'),
        } } : {}) }), source);
    });
  task.command('inspect').description('Read bounded task, source, and evidence views')
    .argument('[project-root]', 'Git worktree root', '.').requiredOption('--task <id>', 'admitted task ID')
    .option('--section <name>', 'summary, intent, decisions, baseline, verification, observations, observation, report, analysis, assessment, adoption, source, patch, check, log, history', 'summary')
    .option('--request <id>', 'exact analysis request for frozen input/source inspection')
    .option('--observation <id>', 'Observation to inspect; defaults to latest')
    .option('--package <id>', 'Adoption Package; defaults to latest')
    .option('--snapshot <side>', 'baseline or current source snapshot')
    .option('--path <path>', 'safe repository-relative source path')
    .option('--check <key>', 'readable check key').option('--attempt <number>', 'Check Attempt number')
    .option('--stream <name>', 'stdout or stderr').option('--offset <bytes>', 'byte offset', '0')
    .option('--max-bytes <bytes>', 'maximum source, patch, or log bytes; at most 65536', '16384')
    .option('--live', 're-observe currency for summary/adoption; frozen Analyzer reads omit this option')
    .action(async (root: string, options: { task: string; section: string; request?: string; observation?: string; package?: string;
      snapshot?: string; path?: string; check?: string; attempt?: string; stream?: string; offset: string; maxBytes: string; live?: boolean }, source: Command) => {
      if (options.snapshot && !['baseline', 'current'].includes(options.snapshot)) throw inputError('--snapshot must be baseline or current.');
      if (options.stream && !['stdout', 'stderr'].includes(options.stream)) throw inputError('--stream must be stdout or stderr.');
      environment.emit('task inspect', await inspectTask({ projectRoot: root, taskId: options.task, section: options.section,
        requestId: options.request, observationId: options.observation, packageId: options.package,
        snapshot: options.snapshot as 'baseline' | 'current' | undefined, path: options.path, checkKey: options.check,
        attempt: options.attempt ? positiveInteger(options.attempt, '--attempt') : undefined,
        stream: options.stream as 'stdout' | 'stderr' | undefined,
        offset: Number(options.offset), maxBytes: Number(options.maxBytes), live: options.live }), source);
    });
}

async function executeInput(kind: InputKind, projectRoot: string, options: InputOptions, document: unknown) {
  const parse = <K extends InputKind>(key: K) => {
    try { return parseArtifact(schemas.commands[key], document, inputCommandNames[key]) as z.output<(typeof schemas.commands)[K]>; }
    catch (error) {
      if (!(error instanceof CliError)) throw error;
      throw new CliError(error.code, error.message + '\nInput reference: stetra ' + inputCommandNames[key] + ' --input-schema --json', error.exitCode, { cause: error, issues: error.issues });
    }
  };
  const taskId = options.task!;
  switch (kind) {
    case 'begin': return beginTask({ projectRoot, source: parse('begin'), bindingToken: options.bindingToken });
    case 'amend': return authorTask({ projectRoot, taskId, command: { type: 'amend', input: parse('amend') } });
    case 'propose': return authorTask({ projectRoot, taskId, command: { type: 'propose', input: parse('propose') } });
    case 'resolve': return authorTask({ projectRoot, taskId, command: { type: 'resolve', input: parse('resolve') } });
    case 'verification-revise': return authorTask({ projectRoot, taskId, command: { type: 'verification-revise', input: parse('verification-revise') } });
    case 'report': {
      const input = parse('report');
      return reportTask({ projectRoot, taskId, source: input, bindingToken: options.bindingToken });
    }
    case 'assess': return submitAssessment({ projectRoot, taskId, source: parse('assess') });
    case 'prepare': return prepareAdoption({ projectRoot, taskId, source: parse('prepare') });
    case 'decide': {
      const input = parse('decide');
      if (options.package && options.package !== input.packageId) throw inputError('--package differs from the presented Package in the input.');
      return decideAdoption({ projectRoot, taskId, source: input });
    }
    default: throw usageError('This operation does not accept an authoring document.');
  }
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw inputError(option + ' must be a positive safe integer.');
  return parsed;
}

async function readDocument(projectRootInput: string, path: string, input: Readable): Promise<unknown> {
  let text: string;
  if (path === '-') {
    const chunks: Buffer[] = []; let count = 0;
    for await (const chunk of input) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)); count += bytes.length;
      if (count > MAX_INPUT_BYTES) throw inputError('Task input exceeds its byte budget.');
      chunks.push(bytes);
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    const projectRoot = realpathSync(resolve(projectRootInput)), candidate = resolve(path);
    if (!existsSync(candidate)) throw inputError('Input file does not exist: ' + candidate);
    const canonical = realpathSync(candidate), rel = relative(projectRoot, canonical);
    if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)) throw inputError('Task input must use stdin or a file outside the project worktree.');
    const bytes = readFileSync(canonical);
    if (bytes.length > MAX_INPUT_BYTES) throw inputError('Task input exceeds its byte budget.');
    text = bytes.toString('utf8');
  }
  if (!text.trim()) throw inputError('Task input is empty. Pipe JSON to --input - or use an input file outside the worktree.');
  try { return JSON.parse(text); } catch (error) { throw inputError('Task input is not valid JSON.', error); }
}
