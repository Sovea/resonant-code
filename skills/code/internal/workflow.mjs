import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function prepareInterpretation(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const runtime = await loadRuntime(paths.runtimeEntry);
  const task = normalizeTaskInput(options, paths.projectRoot, runtime);
  const candidatePath = buildCandidatePath(paths.projectRoot, task);
  return runtime.prepareTaskInterpretationContract({ task, candidatePath });
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
    ? `Using candidate file ${resolve(candidateFile)} as host-agent input.`
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
    return `If the deterministic interpretation looks too weak, generate a host-agent candidate file at ${recommendationPath} and re-run prepare with --candidate-file.`;
  }
  return 'Proceed with the compiled packet.';
}

export async function prepareRelations(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const runtime = await loadRuntime(paths.runtimeEntry);
  const task = normalizeTaskInput(options, paths.projectRoot, runtime);
  const candidates = loadCandidateFile(options.candidateFile, runtime);
  const interpretationMode = candidates.length ? 'host-agent' : 'deterministic-only';
  const resolvedTask = runtime.resolveTask({
    task,
    candidates,
    interpretationMode,
  });
  const {
    directiveSummaries,
    observationSummaries,
  } = await prepareSemanticProposalContext(paths, runtime, resolvedTask);
  const artifactPath = buildRelationProposalPath(paths.projectRoot, task);
  const contractOutput = runtime.prepareSemanticRelationContract({
    resolvedTask,
    directives: directiveSummaries,
    observations: observationSummaries,
    artifactPath,
  });

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
    ...contractOutput,
  };
}

export async function prepareSemanticCandidates(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const runtime = await loadRuntime(paths.runtimeEntry);
  const task = normalizeTaskInput(options, paths.projectRoot, runtime);
  const candidates = loadCandidateFile(options.candidateFile, runtime);
  const interpretationMode = candidates.length ? 'host-agent' : 'deterministic-only';
  const resolvedTask = runtime.resolveTask({
    task,
    candidates,
    interpretationMode,
  });
  const {
    directiveSummaries,
    observationSummaries,
  } = await prepareSemanticProposalContext(paths, runtime, resolvedTask);
  const artifactPath = buildSemanticCandidatePath(paths.projectRoot, task);
  const contractOutput = runtime.prepareSemanticCandidateContract({
    resolvedTask,
    directives: directiveSummaries,
    observations: observationSummaries,
    artifactPath,
  });

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
    ...contractOutput,
  };
}

async function prepareSemanticProposalContext(paths, runtime, resolvedTask) {
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
  return {
    directiveSummaries: activeDirectives.map(summarizeDirectiveForProposal),
    observationSummaries: governanceIR.observations.map(summarizeObservationForProposal),
  };
}

export async function prepareCodeTask(options) {
  const paths = resolveRuntimePaths(options.projectRoot, options.pluginRoot);
  const runtime = await loadRuntime(paths.runtimeEntry);
  const task = normalizeTaskInput(options, paths.projectRoot, runtime);
  const sessionPath = buildSessionPath(paths.projectRoot, task);
  const warnings = [];

  if (!paths.localAugmentPath) warnings.push('Local augment not found; using built-in playbook layers only.');
  if (!paths.rcclPath) warnings.push('RCCL not found; proceeding without repository calibration signals.');

  try {
    const candidates = loadCandidateFile(options.candidateFile, runtime);
    const hostProposals = [
      ...loadHostProposalFile(options.hostProposalFile, 'code-skill-semantic-relations', runtime),
      ...loadHostSemanticCandidateFile(options.semanticProposalFile, 'code-skill-semantic-candidates', runtime),
    ];
    const interpretationMode = candidates.length ? 'host-agent' : 'deterministic-only';
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
    const interpretationMode = options.candidateFile ? 'host-agent' : 'deterministic-only';
    const candidateSnapshot = loadCandidateFile(options.candidateFile, runtime);
    const suggestedCandidatePath = buildCandidatePath(paths.projectRoot, task);
    const interpretationContract = runtime.prepareTaskInterpretationContract({
      task,
      candidatePath: suggestedCandidatePath,
    });
    const failureDiagnostics = {
      clarification_recommended: !options.candidateFile,
      ambiguity_reasons: interpretationContract.ambiguityHints,
      discarded_inputs: [],
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

function normalizeTaskInput(options, projectRoot, runtime) {
  const changedFiles = unique((options.changedFiles ?? []).map((file) => normalizeProjectFile(file, projectRoot)).filter(Boolean));
  const targetFile = options.targetFile ? normalizeProjectFile(options.targetFile, projectRoot) : undefined;
  const task = {
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
    riskLevel: options.riskLevel,
    scopeSize: options.scopeSize,
    compatibilityRequirement: options.compatibilityRequirement,
    interfaceSensitivity: options.interfaceSensitivity,
    refactorTolerance: options.refactorTolerance,
    migrationPhase: options.migrationPhase,
    reviewGoal: options.reviewGoal,
  };
  validateTaskInputEnums(task, runtime?.TASK_INPUT_ENUMS);
  return task;
}

function validateTaskInputEnums(task, enumSchema) {
  if (!enumSchema) return;
  const fields = [
    ['operation', 'operation'],
    ['taskKind', 'task-kind'],
    ['projectStage', 'project-stage'],
    ['optimizationTarget', 'optimization-target'],
    ['riskLevel', 'risk-level'],
    ['scopeSize', 'scope-size'],
    ['compatibilityRequirement', 'compatibility-requirement'],
    ['interfaceSensitivity', 'interface-sensitivity'],
    ['refactorTolerance', 'refactor-tolerance'],
    ['migrationPhase', 'migration-phase'],
    ['reviewGoal', 'review-goal'],
  ];
  for (const [field, flag] of fields) {
    const value = task[field];
    if (value === undefined) continue;
    const allowed = Array.from(enumSchema[field] ?? []);
    if (!allowed.includes(value)) {
      throw new Error(`Invalid --${flag} value "${value}". Expected one of: ${allowed.join(', ')}.`);
    }
  }
}

function normalizeProjectFile(filePath, projectRoot) {
  const absolute = isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath);
  const rel = relative(projectRoot, absolute).replace(/\\/g, '/');
  if (!rel || rel === '.') return '';
  return rel.startsWith('..') ? filePath.replace(/\\/g, '/') : rel;
}

function loadCandidateFile(candidateFile, runtime) {
  if (!candidateFile) return [];
  const payload = JSON.parse(readFileSync(resolve(candidateFile), 'utf-8'));
  return runtime.parseTaskInterpretationCandidatePayload(payload);
}

function loadHostProposalFile(hostProposalFile, sourceId, runtime) {
  if (!hostProposalFile) return [];
  const payload = JSON.parse(readFileSync(resolve(hostProposalFile), 'utf-8'));
  return [
    runtime.loadSemanticRelationProposalPayload(payload, {
      id: sourceId,
      path: resolve(hostProposalFile),
    }),
  ];
}

function loadHostSemanticCandidateFile(semanticProposalFile, sourceId, runtime) {
  if (!semanticProposalFile) return [];
  const payload = JSON.parse(readFileSync(resolve(semanticProposalFile), 'utf-8'));
  return [
    runtime.loadSemanticCandidateProposalPayload(payload, {
      id: sourceId,
      path: resolve(semanticProposalFile),
    }),
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

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
