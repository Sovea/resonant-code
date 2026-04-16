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

const TASK_CANDIDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_kind: fieldSchema(['code', 'review', 'analysis', 'migration']),
        operation: fieldSchema(['create', 'modify', 'review', 'refactor', 'bugfix']),
        target_layer: fieldSchema(),
        tech_stack: listFieldSchema(),
        target_file: fieldSchema(),
        changed_files: listFieldSchema(),
        tags: listFieldSchema(),
      },
    },
    context: {
      type: 'object',
      additionalProperties: false,
      properties: {
        project_stage: fieldSchema(['prototype', 'growth', 'stable', 'critical']),
        change_type: fieldSchema(['create', 'modify', 'review', 'refactor', 'bugfix']),
        optimization_target: fieldSchema(['speed', 'maintainability', 'safety', 'simplicity', 'reviewability']),
        hard_constraints: listFieldSchema(),
        allowed_tradeoffs: listFieldSchema(),
        avoid: listFieldSchema(),
      },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['intent', 'context', 'uncertainties'],
};

function fieldSchema(enumValues) {
  const value = enumValues ? { enum: enumValues } : { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      value,
      source: { const: 'assistive-ai' },
      confidence: { type: 'number' },
      status: { enum: ['resolved', 'unresolved'] },
      rationale: { type: 'string' },
    },
    required: ['source', 'confidence', 'status'],
  };
}

function listFieldSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      values: {
        type: 'array',
        items: { type: 'string' },
      },
      source: { const: 'assistive-ai' },
      confidence: { type: 'number' },
      status: { enum: ['resolved', 'unresolved'] },
      rationale: { type: 'string' },
    },
    required: ['values', 'source', 'confidence', 'status'],
  };
}

export async function prepareInterpretation(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const task = normalizeTaskInput(options, paths.projectRoot);
  const candidatePath = buildCandidatePath(paths.projectRoot, task);
  const ambiguityHints = buildAmbiguityHints(task);
  const recommendation = buildInterpretationRecommendation(task, ambiguityHints, candidatePath);
  return {
    task,
    interpretationPrompt: buildInterpretationPrompt(task),
    taskSchema: JSON.stringify(TASK_CANDIDATE_SCHEMA, null, 2),
    ambiguityHints,
    recommendation,
    candidateArtifact: {
      suggestedPath: candidatePath,
      format: 'json',
      usage: `Write a single candidate object or an array of candidates to ${candidatePath}, then pass --candidate-file ${candidatePath} to prepare.`,
    },
    clarificationHints: buildClarificationHints(task, ambiguityHints),
  };
}

function buildInterpretationRecommendation(task, ambiguityHints, candidatePath) {
  const shouldUseAiCandidate = ambiguityHints.length > 0;
  return {
    shouldUseAiCandidate,
    reason: shouldUseAiCandidate
      ? `AI-assisted candidate recommended because ${ambiguityHints.join('; ')}.`
      : 'AI-assisted candidate is optional because the task already carries concrete operational signals.',
    nextStep: shouldUseAiCandidate
      ? `Generate a candidate JSON file at ${candidatePath} before running prepare.`
      : 'You can run prepare directly, or still provide a candidate file if you want richer task interpretation.',
  };
}

function buildClarificationHints(task, ambiguityHints) {
  const hints = [];
  if (ambiguityHints.includes('operation is not explicit')) {
    hints.push('Clarify whether this is create, modify, bugfix, refactor, or review work.');
  }
  if (ambiguityHints.includes('no concrete target files are specified')) {
    hints.push('Name the target file or likely changed files if they are known.');
  }
  if (ambiguityHints.includes('tech stack is implicit')) {
    hints.push('State the relevant language, framework, or subsystem when it is not obvious from the file path.');
  }
  if (ambiguityHints.includes('project stage is not specified')) {
    hints.push('State whether the project area is prototype, growth, stable, or critical if that affects tradeoffs.');
  }
  if (!task.optimizationTarget) {
    hints.push('Specify the optimization target when the tradeoff matters, such as safety, simplicity, or reviewability.');
  }
  return hints;
}

function buildCandidatePath(projectRoot, task) {
  const digest = createHash('sha1')
    .update(JSON.stringify({
      description: task.description,
      targetFile: task.targetFile ?? '',
      changedFiles: task.changedFiles,
      techStack: task.techStack,
      operation: task.operation ?? '',
      type: 'candidate',
    }))
    .digest('hex')
    .slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return join(projectRoot, '.resonant-code', 'context', 'task-candidates', 'code', `${stamp}-${digest}.json`);
}

function summarizeInterpretationFlow(mode, candidateFile, diagnostics, candidateCount) {
  const steps = [];
  steps.push(candidateFile
    ? `Using candidate file ${resolve(candidateFile)} as assistive input.`
    : 'No candidate file provided; Runtime will rely on deterministic interpretation only.');
  steps.push(`Interpretation mode: ${mode}.`);
  steps.push(`Candidate count: ${candidateCount}.`);
  if (diagnostics?.clarification_recommended) {
    steps.push(`Clarification recommended: ${diagnostics.ambiguity_reasons.join('; ') || 'additional ambiguity detected'}.`);
  }
  return steps;
}

function buildPrepareNextStep(mode, candidateFile, diagnostics, recommendationPath) {
  if (candidateFile) {
    return 'Proceed with the compiled packet and use interpretation provenance if you need to explain how fields were resolved.';
  }
  if (mode === 'deterministic-only' && diagnostics?.clarification_recommended) {
    return `If the deterministic interpretation looks too weak, generate a candidate file at ${recommendationPath} and re-run prepare with --candidate-file.`;
  }
  return 'Proceed with the compiled packet.';
}

export async function prepareCodeTask(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const task = normalizeTaskInput(options, paths.projectRoot);
  const sessionPath = buildSessionPath(paths.projectRoot, task);
  const warnings = [];

  if (!paths.localAugmentPath) warnings.push('Local augment not found; using built-in playbook layers only.');
  if (!paths.rcclPath) warnings.push('RCCL not found; proceeding without repository calibration signals.');

  try {
    const runtime = await loadRuntime(paths.runtimeEntry);
    const candidates = loadCandidateFile(options.candidateFile);
    const interpretationMode = candidates.length ? 'assistive-ai' : 'deterministic-only';
    const resolvedTask = runtime.resolveTask({
      task,
      candidates,
      interpretationMode,
    });
    const compileInput = {
      builtinRoot: paths.builtinRoot,
      localAugmentPath: paths.localAugmentPath,
      rcclPath: paths.rcclPath,
      lockfilePath: paths.lockfilePath,
      projectRoot: paths.projectRoot,
      resolvedTask,
    };
    const output = await runtime.compile(compileInput);
    const interpretationSummary = summarizeInterpretationFlow(
      interpretationMode,
      options.candidateFile,
      output.packet.interpretation.diagnostics,
      resolvedTask.candidates?.length ?? 0,
    );
    const suggestedCandidatePath = buildCandidatePath(paths.projectRoot, task);
    const session = {
      version: 3,
      status: 'ok',
      createdAt: new Date().toISOString(),
      paths,
      taskInput: task,
      interpretation: {
        mode: interpretationMode,
        candidates: resolvedTask.candidates,
        provenance: output.packet.interpretation.input_provenance,
        diagnostics: output.packet.interpretation.diagnostics,
        trace: output.packet.interpretation.trace,
      },
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
      interpretation: {
        mode: interpretationMode,
        candidateFile: options.candidateFile ? resolve(options.candidateFile) : null,
        provenance: output.packet.interpretation.input_provenance,
        diagnostics: output.packet.interpretation.diagnostics,
        summary: interpretationSummary,
        nextStep: buildPrepareNextStep(interpretationMode, options.candidateFile, output.packet.interpretation.diagnostics, suggestedCandidatePath),
      },
    };
  } catch (error) {
    const message = formatError(error);
    const interpretationMode = options.candidateFile ? 'assistive-ai' : 'deterministic-only';
    const candidateSnapshot = loadCandidateFile(options.candidateFile);
    const suggestedCandidatePath = buildCandidatePath(paths.projectRoot, task);
    const degradedDiagnostics = {
      clarification_recommended: !options.candidateFile,
      ambiguity_reasons: buildAmbiguityHints(task),
    };
    const session = {
      version: 3,
      status: 'degraded',
      createdAt: new Date().toISOString(),
      paths,
      taskInput: task,
      interpretation: {
        mode: interpretationMode,
        candidates: candidateSnapshot,
      },
      compileInput: {
        builtinRoot: paths.builtinRoot,
        localAugmentPath: paths.localAugmentPath,
        rcclPath: paths.rcclPath,
        lockfilePath: paths.lockfilePath,
        projectRoot: paths.projectRoot,
        task,
        interpretationMode,
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
      interpretation: {
        mode: interpretationMode,
        candidateFile: options.candidateFile ? resolve(options.candidateFile) : null,
        diagnostics: degradedDiagnostics,
        summary: summarizeInterpretationFlow(interpretationMode, options.candidateFile, degradedDiagnostics, candidateSnapshot.length),
        nextStep: buildPrepareNextStep(interpretationMode, options.candidateFile, degradedDiagnostics, suggestedCandidatePath),
      },
    };
  }
}

export async function completeCodeTask(options) {
  const session = JSON.parse(readFileSync(resolve(options.sessionPath), 'utf-8'));
  if (session.status !== 'ok' || !session.compileOutput?.packet?.governance?.ego) {
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
      : packet.governance.semantic_merge.directive_modes
          .filter((directive) => directive.execution_mode !== 'suppress')
          .map((directive) => directive.directive_id);
    const ignoredDirectiveIds = unique(options.ignoredDirectiveIds ?? []);
    runtime.evaluateGuidance({
      ego: packet.governance.ego,
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

export function resolveRuntimePaths(projectRoot, pluginRoot) {
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

function loadCandidateFile(candidateFile) {
  if (!candidateFile) return [];
  const payload = JSON.parse(readFileSync(resolve(candidateFile), 'utf-8'));
  return Array.isArray(payload) ? payload : [payload];
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
  return join(projectRoot, '.resonant-code', 'context', 'runtime-sessions', 'code', `${stamp}-${digest}.json`);
}

function writeSession(sessionPath, session) {
  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

function buildInterpretationPrompt(task) {
  return [
    'Produce a structured task interpretation candidate for Runtime.',
    'Only resolve fields when the task gives enough evidence; otherwise mark them unresolved.',
    'Use source="assistive-ai" for every resolved or unresolved field you return.',
    'Do not invent target files, changed files, or tech stack without evidence.',
    `Task description: ${task.description}`,
    `Explicit operation: ${task.operation ?? '(none)'}`,
    `Explicit target file: ${task.targetFile ?? '(none)'}`,
    `Explicit changed files: ${task.changedFiles?.join(', ') || '(none)'}`,
    `Explicit tech stack: ${task.techStack?.join(', ') || '(none)'}`,
    `Explicit tags: ${task.tags?.join(', ') || '(none)'}`,
    `Explicit project stage: ${task.projectStage ?? '(none)'}`,
    `Explicit optimization target: ${task.optimizationTarget ?? '(none)'}`,
    `Explicit hard constraints: ${task.hardConstraints?.join(', ') || '(none)'}`,
    `Explicit allowed tradeoffs: ${task.allowedTradeoffs?.join(', ') || '(none)'}`,
    `Explicit avoid: ${task.avoid?.join(', ') || '(none)'}`,
  ].join('\n');
}

function buildAmbiguityHints(task) {
  const hints = [];
  if (!task.operation) hints.push('operation is not explicit');
  if (!task.targetFile && !task.changedFiles?.length) hints.push('no concrete target files are specified');
  if (!task.techStack?.length) hints.push('tech stack is implicit');
  if (!task.projectStage) hints.push('project stage is not specified');
  return hints;
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
    throw new Error('Expected a command: prepare-interpretation, prepare, or complete.');
  }

  if (command === 'prepare-interpretation' || command === 'prepare') {
    const { positionals, flags } = parseFlags(rest);
    const projectRoot = positionals[0];
    const taskDescription = readSingleFlag(flags, 'task');
    if (!projectRoot) throw new Error(`${command} requires <project-root>.`);
    if (!taskDescription) throw new Error(`${command} requires --task "<description>".`);
    return {
      command,
      options: {
        projectRoot,
        pluginRoot: readSingleFlag(flags, 'plugin-root'),
        taskDescription,
        candidateFile: readSingleFlag(flags, 'candidate-file'),
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
  const result = parsed.command === 'prepare-interpretation'
    ? await prepareInterpretation(parsed.options)
    : parsed.command === 'prepare'
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
