import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FALLBACK_GUIDANCE = [
  'Preserve correctness before optimization or broad cleanup.',
  'Prefer clear, legible code over compressed or clever code.',
  'Match established local conventions at the touched boundary.',
  'Make the smallest reasonable change that fully solves the task.',
];

export async function prepareCodeTask(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const task = normalizeTaskInput(options, paths.projectRoot);
  const sessionPath = buildSessionPath(paths.projectRoot, task);
  const warnings = [];

  if (!paths.localAugmentPath) warnings.push('Local augment not found; using built-in playbook layers only.');
  if (!paths.rcclPath) warnings.push('RCCL not found; proceeding without repository calibration signals.');

  try {
    const runtime = await loadRuntime(paths.runtimeEntry);
    const compileInput = {
      builtinRoot: paths.builtinRoot,
      localAugmentPath: paths.localAugmentPath,
      rcclPath: paths.rcclPath,
      lockfilePath: paths.lockfilePath,
      projectRoot: paths.projectRoot,
      task,
    };
    const output = await runtime.compile(compileInput);
    const session = {
      version: 2,
      status: 'ok',
      createdAt: new Date().toISOString(),
      paths,
      compileInput,
      compileOutput: output,
      fallbackGuidance: FALLBACK_GUIDANCE,
      warnings,
    };
    writeSession(sessionPath, session);
    return {
      status: 'ok',
      sessionPath,
      paths,
      packet: output.packet,
      ego: output.ego,
      trace: output.trace,
      warnings,
    };
  } catch (error) {
    const message = formatError(error);
    const session = {
      version: 2,
      status: 'degraded',
      createdAt: new Date().toISOString(),
      paths,
      compileInput: {
        builtinRoot: paths.builtinRoot,
        localAugmentPath: paths.localAugmentPath,
        rcclPath: paths.rcclPath,
        lockfilePath: paths.lockfilePath,
        projectRoot: paths.projectRoot,
        task,
      },
      compileOutput: null,
      fallbackGuidance: FALLBACK_GUIDANCE,
      warnings: [...warnings, `Runtime compile failed: ${message}`],
      error: message,
    };
    writeSession(sessionPath, session);
    return {
      status: 'degraded',
      sessionPath,
      paths,
      ego: null,
      trace: null,
      fallbackGuidance: FALLBACK_GUIDANCE,
      warnings: session.warnings,
      error: message,
    };
  }
}

export async function completeCodeTask(options) {
  const session = JSON.parse(readFileSync(resolve(options.sessionPath), 'utf-8'));
  if (session.status !== 'ok' || !session.compileOutput?.packet?.ego) {
    return {
      status: 'skipped',
      sessionPath: resolve(options.sessionPath),
      lockfilePath: session.paths?.lockfilePath ?? null,
      reason: 'Runtime guidance was unavailable during prepare; lockfile update skipped.',
    };
  }

  try {
    const runtime = await loadRuntime(session.paths.runtimeEntry);
    const packet = session.compileOutput.packet;
    const followedDirectiveIds = options.followedDirectiveIds?.length
      ? unique(options.followedDirectiveIds)
      : packet.ego.guidance.must_follow.map((directive) => directive.id);
    const ignoredDirectiveIds = unique(options.ignoredDirectiveIds ?? []);
    runtime.evaluateGuidance({
      ego: packet.ego,
      packet,
      lockfilePath: session.paths.lockfilePath,
      followedDirectiveIds,
      ignoredDirectiveIds,
    });
    return {
      status: 'updated',
      sessionPath: resolve(options.sessionPath),
      lockfilePath: session.paths.lockfilePath,
      followedDirectiveIds,
      ignoredDirectiveIds,
    };
  } catch (error) {
    return {
      status: 'skipped',
      sessionPath: resolve(options.sessionPath),
      lockfilePath: session.paths.lockfilePath,
      reason: `Lockfile update failed: ${formatError(error)}`,
    };
  }
}

async function loadRuntime(runtimeEntry) {
  return import(pathToFileURL(runtimeEntry).href);
}

function resolveRuntimePaths(projectRoot, pluginRoot) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedPluginRoot = pluginRoot
    ? resolve(pluginRoot)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const builtinRoot = join(resolvedPluginRoot, 'playbook');
  const runtimeEntry = join(resolvedPluginRoot, 'runtime', 'dist', 'index.mjs');
  const localAugmentPath = resolveOptionalFile(resolvedProjectRoot, '.resonant-code', 'playbook', 'local-augment.yaml');
  const rcclPath = resolveOptionalFile(resolvedProjectRoot, '.resonant-code', 'rccl.yaml');
  return {
    projectRoot: resolvedProjectRoot,
    pluginRoot: resolvedPluginRoot,
    builtinRoot,
    runtimeEntry,
    localAugmentPath,
    rcclPath,
    lockfilePath: join(resolvedProjectRoot, '.resonant-code', 'playbook.lock.yaml'),
  };
}

function resolveOptionalFile(root, ...parts) {
  const filePath = join(root, ...parts);
  return existsSync(filePath) ? filePath : undefined;
}

function normalizeTaskInput(options, projectRoot) {
  const changedFiles = unique((options.changedFiles ?? []).map((file) => normalizeProjectFile(file, projectRoot)).filter(Boolean));
  const targetFile = options.targetFile ? normalizeProjectFile(options.targetFile, projectRoot) : undefined;
  return {
    description: options.taskDescription,
    operation: options.operation,
    targetFile,
    changedFiles,
    techStack: unique(options.techStack ?? []),
    tags: unique(options.tags ?? []),
    projectStage: options.projectStage,
    optimizationTarget: options.optimizationTarget,
    hardConstraints: unique(options.hardConstraints ?? []),
    allowedTradeoffs: unique(options.allowedTradeoffs ?? []),
    avoid: unique(options.avoid ?? []),
  };
}

function normalizeProjectFile(filePath, projectRoot) {
  const absolute = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
  const rel = relative(projectRoot, absolute).replace(/\\/g, '/');
  if (!rel || rel === '.') return '';
  return rel.startsWith('..') ? filePath.replace(/\\/g, '/') : rel;
}

function buildSessionPath(projectRoot, task) {
  const digest = createHash('sha1')
    .update(JSON.stringify({
      description: task.description,
      targetFile: task.targetFile ?? '',
      changedFiles: task.changedFiles,
      techStack: task.techStack,
      operation: task.operation ?? '',
    }))
    .digest('hex')
    .slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return join(projectRoot, '.resonant-code', 'context', 'cache', 'code-skill', `${stamp}-${digest}.json`);
}

function writeSession(sessionPath, session) {
  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (!command) {
    throw new Error('Expected a command: prepare or complete.');
  }

  if (command === 'prepare') {
    const { positionals, flags } = parseFlags(rest);
    const projectRoot = positionals[0];
    const taskDescription = readSingleFlag(flags, 'task');
    if (!projectRoot) throw new Error('prepare requires <project-root>.');
    if (!taskDescription) throw new Error('prepare requires --task "<description>".');
    return {
      command,
      options: {
        projectRoot,
        pluginRoot: readSingleFlag(flags, 'plugin-root'),
        taskDescription,
        targetFile: readSingleFlag(flags, 'target-file'),
        changedFiles: readMultiFlag(flags, 'changed-file'),
        techStack: readMultiFlag(flags, 'tech'),
        tags: readMultiFlag(flags, 'tag'),
        operation: readSingleFlag(flags, 'operation'),
        projectStage: readSingleFlag(flags, 'project-stage'),
        optimizationTarget: readSingleFlag(flags, 'optimization-target'),
        hardConstraints: readMultiFlag(flags, 'hard-constraint'),
        allowedTradeoffs: readMultiFlag(flags, 'allowed-tradeoff'),
        avoid: readMultiFlag(flags, 'avoid'),
      },
    };
  }

  if (command === 'complete') {
    const { flags } = parseFlags(rest);
    const sessionPath = readSingleFlag(flags, 'session');
    if (!sessionPath) throw new Error('complete requires --session <path>.');
    return {
      command,
      options: {
        sessionPath,
        followedDirectiveIds: readMultiFlag(flags, 'followed'),
        ignoredDirectiveIds: readMultiFlag(flags, 'ignored'),
      },
    };
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseFlags(argv) {
  const positionals = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Flag ${token} requires a value.`);
    }
    const values = flags.get(key) ?? [];
    values.push(next);
    flags.set(key, values);
    index += 1;
  }
  return { positionals, flags };
}

function readSingleFlag(flags, key) {
  return flags.get(key)?.[0];
}

function readMultiFlag(flags, key) {
  return flags.get(key) ?? [];
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  const result = parsed.command === 'prepare'
    ? await prepareCodeTask(parsed.options)
    : await completeCodeTask(parsed.options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
