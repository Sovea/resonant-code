import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const HOST_SEMANTIC_RELATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    relations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          directive_id: { type: 'string' },
          observation_id: { type: 'string' },
          relation: { enum: ['reinforce', 'tension', 'suppress', 'ambient-only', 'unrelated'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
          conflict_class: {
            enum: ['compatibility-boundary', 'migration-tension', 'local-deviation', 'legacy-interface', 'anti-pattern', 'scope-mismatch', 'style-drift', 'architecture-drift'],
          },
          impact: { enum: ['execution-mode', 'review-focus', 'ambient-context', 'no-effect'] },
          review_priority: { enum: ['low', 'normal', 'high', 'critical'] },
          merge_intent: { type: 'string' },
          group_id: { type: 'string' },
          evidence_refs: {
            type: 'array',
            items: { type: 'string' },
          },
          signals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { enum: ['semantic-key', 'category', 'scope', 'verification', 'lifecycle', 'feedback', 'host-proposal'] },
                strength: { enum: ['weak', 'moderate', 'strong'] },
                direction: { enum: ['reinforce', 'tension', 'suppress', 'ambient', 'neutral'] },
                reason: { type: 'string' },
              },
              required: ['kind', 'strength', 'direction', 'reason'],
            },
          },
        },
        required: ['directive_id', 'observation_id', 'relation', 'confidence', 'reason'],
      },
    },
  },
  required: ['relations'],
};

const HOST_SEMANTIC_CANDIDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          directive_id: { type: 'string' },
          observation_id: { type: 'string' },
          relation_hint: { enum: ['reinforce', 'tension', 'ambient-only', 'unknown'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
          impact: { enum: ['execution-mode', 'review-focus', 'ambient-context', 'no-effect'] },
          review_priority: { enum: ['low', 'normal', 'high', 'critical'] },
          merge_intent: { type: 'string' },
          group_id: { type: 'string' },
          evidence_refs: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['directive_id', 'observation_id', 'relation_hint', 'confidence', 'reason'],
      },
    },
  },
  required: ['candidates'],
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

export async function prepareRelations(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const task = normalizeTaskInput(options, paths.projectRoot);
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
  const governanceIR = await runtime.buildGovernanceIR(compileInput);
  const activationDecisions = runtime.resolveActivationDecisionsIR(governanceIR);
  const activatedDirectiveIds = runtime.activatedDirectiveIdsIR(activationDecisions);
  const activeDirectives = governanceIR.directives.filter((directive) => activatedDirectiveIds.has(directive.id));
  const artifactPath = buildRelationProposalPath(paths.projectRoot, task);
  const directiveSummaries = activeDirectives.map(summarizeDirectiveForProposal);
  const observationSummaries = governanceIR.observations.map(summarizeObservationForProposal);

  return {
    task: {
      input: task,
      resolved: {
        task_intent: resolvedTask.task_intent,
        context_profile: resolvedTask.context_profile,
      },
      interpretation: {
        mode: interpretationMode,
        diagnostics: resolvedTask.diagnostics,
      },
    },
    directives: directiveSummaries,
    observations: observationSummaries,
    proposalPrompt: buildRelationProposalPrompt(resolvedTask, directiveSummaries, observationSummaries),
    proposalSchema: JSON.stringify(HOST_SEMANTIC_RELATION_SCHEMA, null, 2),
    proposalArtifact: {
      suggestedPath: artifactPath,
      format: 'json',
      usage: `Write the semantic relation proposal payload to ${artifactPath}, then pass --host-proposal-file ${artifactPath} to prepare.`,
    },
  };
}

export async function prepareSemanticCandidates(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const task = normalizeTaskInput(options, paths.projectRoot);
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
  const governanceIR = await runtime.buildGovernanceIR(compileInput);
  const activationDecisions = runtime.resolveActivationDecisionsIR(governanceIR);
  const activatedDirectiveIds = runtime.activatedDirectiveIdsIR(activationDecisions);
  const activeDirectives = governanceIR.directives.filter((directive) => activatedDirectiveIds.has(directive.id));
  const artifactPath = buildSemanticCandidatePath(paths.projectRoot, task);
  const directiveSummaries = activeDirectives.map(summarizeDirectiveForProposal);
  const observationSummaries = governanceIR.observations.map(summarizeObservationForProposal);

  return {
    task: {
      input: task,
      resolved: {
        task_intent: resolvedTask.task_intent,
        context_profile: resolvedTask.context_profile,
      },
      interpretation: {
        mode: interpretationMode,
        diagnostics: resolvedTask.diagnostics,
      },
    },
    directives: directiveSummaries,
    observations: observationSummaries,
    candidatePrompt: buildSemanticCandidatePrompt(resolvedTask, directiveSummaries, observationSummaries),
    candidateSchema: JSON.stringify(HOST_SEMANTIC_CANDIDATE_SCHEMA, null, 2),
    candidateArtifact: {
      suggestedPath: artifactPath,
      format: 'json',
      usage: `Write the semantic candidate payload to ${artifactPath}, then pass --semantic-proposal-file ${artifactPath} to prepare.`,
    },
  };
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
    const hostProposals = [
      ...loadHostProposalFile(options.hostProposalFile, 'code-skill-semantic-relations'),
      ...loadHostSemanticCandidateFile(options.semanticProposalFile, 'code-skill-semantic-candidates'),
    ];
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
      ...(hostProposals.length ? { hostProposals } : {}),
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
      version: '1.0',
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
      hostProposals: summarizeHostProposals(hostProposals),
    };
  } catch (error) {
    const message = formatError(error);
    const interpretationMode = options.candidateFile ? 'assistive-ai' : 'deterministic-only';
    const candidateSnapshot = loadCandidateFile(options.candidateFile);
    const failureDiagnostics = {
      clarification_recommended: !options.candidateFile,
      ambiguity_reasons: buildAmbiguityHints(task),
    };
    const session = {
      version: '1.0',
      status: 'failed',
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
        ...(options.hostProposalFile ? { hostProposalFile: resolve(options.hostProposalFile) } : {}),
        ...(options.semanticProposalFile ? { semanticProposalFile: resolve(options.semanticProposalFile) } : {}),
      },
      compileOutput: null,
      warnings: [...warnings, `Runtime compile failed: ${message}`],
      error: message,
    };
    writeSession(sessionPath, session);
    return {
      status: 'failed',
      sessionPath,
      paths,
      ego: null,
      trace: null,
      warnings: session.warnings,
      error: message,
      interpretation: {
        mode: interpretationMode,
        candidateFile: options.candidateFile ? resolve(options.candidateFile) : null,
        diagnostics: failureDiagnostics,
        summary: summarizeInterpretationFlow(interpretationMode, options.candidateFile, failureDiagnostics, candidateSnapshot.length),
        nextStep: 'Fix the Runtime compile error and re-run prepare.',
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
      ignoredDirectiveReasons: options.ignoredDirectiveReasons,
      signalConfidence: options.signalConfidence,
    });
    return {
      status: 'updated',
      sessionPath: resolve(options.sessionPath),
      lockfilePath: session.paths.lockfilePath,
      followedDirectiveIds,
      ignoredDirectiveIds,
      ignoredDirectiveReasons: options.ignoredDirectiveReasons,
      signalConfidence: options.signalConfidence,
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

function loadHostProposalFile(hostProposalFile, sourceId) {
  if (!hostProposalFile) return [];
  const payload = JSON.parse(readFileSync(resolve(hostProposalFile), 'utf-8'));
  return [
    {
      irVersion: 'governance-ir/v1',
      source: {
        kind: 'host-proposal',
        id: sourceId,
        path: resolve(hostProposalFile),
      },
      kind: 'semantic-relation',
      payload: Array.isArray(payload) ? { relations: payload } : payload,
    },
  ];
}

function loadHostSemanticCandidateFile(semanticProposalFile, sourceId) {
  if (!semanticProposalFile) return [];
  const payload = JSON.parse(readFileSync(resolve(semanticProposalFile), 'utf-8'));
  return [
    {
      irVersion: 'governance-ir/v1',
      source: {
        kind: 'host-proposal',
        id: sourceId,
        path: resolve(semanticProposalFile),
      },
      kind: 'semantic-candidate',
      payload: Array.isArray(payload) ? { candidates: payload } : payload,
    },
  ];
}

function summarizeHostProposals(hostProposals) {
  const proposal = hostProposals[0];
  const relationCount = hostProposals.reduce((count, item) => count + (Array.isArray(item.payload?.relations) ? item.payload.relations.length : 0), 0);
  const candidateCount = hostProposals.reduce((count, item) => count + (Array.isArray(item.payload?.candidates) ? item.payload.candidates.length : 0), 0);
  return {
    provided: hostProposals.length > 0,
    file: proposal?.source?.path ?? null,
    files: hostProposals.map((item) => item.source?.path).filter(Boolean),
    proposalCount: hostProposals.length,
    relationCount,
    candidateCount,
  };
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

function buildRelationProposalPath(projectRoot, task) {
  const digest = createHash('sha1')
    .update(JSON.stringify({
      description: task.description,
      targetFile: task.targetFile ?? '',
      changedFiles: task.changedFiles,
      techStack: task.techStack,
      operation: task.operation ?? '',
      type: 'semantic-relations',
    }))
    .digest('hex')
    .slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return join(projectRoot, '.resonant-code', 'context', 'semantic-relations', 'code', `${stamp}-${digest}.json`);
}

function buildSemanticCandidatePath(projectRoot, task) {
  const digest = createHash('sha1')
    .update(JSON.stringify({
      description: task.description,
      targetFile: task.targetFile ?? '',
      changedFiles: task.changedFiles,
      techStack: task.techStack,
      operation: task.operation ?? '',
      type: 'semantic-candidates',
    }))
    .digest('hex')
    .slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return join(projectRoot, '.resonant-code', 'context', 'semantic-candidates', 'code', `${stamp}-${digest}.json`);
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

function buildRelationProposalPrompt(resolvedTask, directives, observations) {
  return [
    'Produce a HostSemanticRelationProposalPayload JSON object for Runtime.',
    'Use only directive_id values and observation_id values listed in this prepare-relations output.',
    'Propose a relation only when the observation materially affects how the directive should execute for this task.',
    'Use relation="reinforce" when repository reality supports following the directive.',
    'Use relation="tension" when repository reality conflicts with the directive but new work should still account for both.',
    'Use relation="suppress" only when an anti-pattern observation should suppress a directive in this task scope.',
    'Use relation="ambient-only" for relevant background that should not change execution mode.',
    'Use relation="unrelated" sparingly; omit weak pairs instead of listing them as unrelated.',
    'When useful, set impact to execution-mode, review-focus, ambient-context, or no-effect.',
    'When useful, set review_priority to low, normal, high, or critical based on review risk; this does not decide execution mode.',
    'When useful, include merge_intent as one short sentence explaining how Runtime should consider the relation.',
    'Use group_id only to connect closely related relations from the same task-level judgment.',
    'Do not infer relations from ids alone; base every relation on the task, directive description, observation pattern, verification, lifecycle, and evidence refs.',
    'Return only JSON matching proposalSchema.',
    `Resolved task intent: ${JSON.stringify(resolvedTask.task_intent)}`,
    `Resolved context profile: ${JSON.stringify(resolvedTask.context_profile)}`,
    `Directive count: ${directives.length}`,
    `Observation count: ${observations.length}`,
  ].join('\n');
}

function buildSemanticCandidatePrompt(resolvedTask, directives, observations) {
  return [
    'Produce a HostSemanticCandidateProposalPayload JSON object for Runtime.',
    'This is a semantic proposer artifact: use host-agent semantic judgment to shortlist likely directive/observation pairs, but do not decide final execution.',
    'Runtime will validate IDs, confidence, scope, RCCL verification, lifecycle, feedback policy, and final adjudication deterministically.',
    'Use only directive_id values and observation_id values listed in this output.',
    'Use relation_hint="reinforce" when the observation likely supports the directive.',
    'Use relation_hint="tension" when the observation likely conflicts with the directive or requires deviation-noted handling.',
    'Use relation_hint="ambient-only" when the observation is relevant background but should not change execution mode.',
    'Use relation_hint="unknown" when the semantic relation is plausible but impact is not clear; Runtime will keep it ambient.',
    'Do not propose suppress here; use prepare-relations only for an explicit anti-pattern suppress proposal.',
    'Use confidence >= 0.72 only when the task, directive, observation pattern, verification/lifecycle, and evidence refs support the candidate.',
    'When useful, set impact, review_priority, merge_intent, and group_id. These are advisory fields and Runtime may ignore malformed values.',
    'Return only JSON matching candidateSchema.',
    `Resolved task intent: ${JSON.stringify(resolvedTask.task_intent)}`,
    `Resolved context profile: ${JSON.stringify(resolvedTask.context_profile)}`,
    `Directive count: ${directives.length}`,
    `Observation count: ${observations.length}`,
  ].join('\n');
}

function summarizeDirectiveForProposal(directive) {
  return {
    id: directive.id,
    semanticKey: directive.semanticKey,
    kind: directive.kind,
    prescription: directive.prescription,
    weight: directive.weight,
    layer: directive.layer.id,
    scope: directive.scope.path,
    description: directive.body.description,
    rationale: directive.body.rationale,
    traits: directive.traits,
  };
}

function summarizeObservationForProposal(observation) {
  return {
    id: observation.id,
    semanticKey: observation.semanticKey,
    category: observation.category,
    scope: observation.scope.path,
    pattern: observation.pattern,
    adherence: observation.adherence,
    verification: observation.verification,
    lifecycle: observation.lifecycle,
    traits: observation.traits,
    evidenceRefs: observation.evidence.map((evidence) => `${evidence.file}:${evidence.line_range[0]}-${evidence.line_range[1]}`),
    evidence: observation.evidence.map((evidence) => ({
      file: evidence.file,
      line_range: evidence.line_range,
      snippet: evidence.snippet,
    })),
  };
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
    throw new Error('Expected a command: prepare-interpretation, prepare-relations, prepare-semantic-candidates, prepare, or complete.');
  }

  if (command === 'prepare-interpretation' || command === 'prepare-relations' || command === 'prepare-semantic-candidates' || command === 'prepare') {
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
        hostProposalFile: readSingleFlag(flags, 'host-proposal-file'),
        semanticProposalFile: readSingleFlag(flags, 'semantic-proposal-file'),
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
        ignoredDirectiveReasons: readIgnoredReasonMap(readMultiFlag(flags, 'ignored-reason')),
        signalConfidence: readSingleFlag(flags, 'signal-confidence'),
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

function readIgnoredReasonMap(values) {
  const result = {};
  for (const value of values) {
    const separator = value.indexOf(':');
    if (separator <= 0) {
      throw new Error(`Invalid --ignored-reason value "${value}"; expected <directive-id>:<reason>.`);
    }
    const directiveId = value.slice(0, separator);
    const reason = value.slice(separator + 1);
    if (!isIgnoredReason(reason)) {
      throw new Error(`Invalid ignored reason "${reason}" for ${directiveId}.`);
    }
    result[directiveId] = reason;
  }
  return result;
}

function isIgnoredReason(value) {
  return value === 'not-applicable'
    || value === 'conflicts-with-task'
    || value === 'too-broad'
    || value === 'repo-reality'
    || value === 'false-positive'
    || value === 'user-corrected'
    || value === 'other';
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));
  const result = parsed.command === 'prepare-interpretation'
    ? await prepareInterpretation(parsed.options)
    : parsed.command === 'prepare-relations'
      ? await prepareRelations(parsed.options)
      : parsed.command === 'prepare-semantic-candidates'
        ? await prepareSemanticCandidates(parsed.options)
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
