import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateAdoption, type ChangedFileFact, type CheckFact, type Observation, type ObservationData,
  type VerificationDefinition, type VerifierMutation } from '@sovea/stetra-core';
import { CliError, inputError, normalizeCliError, usageError } from '../errors.ts';
import { runFrozenChecks, type ProgressObserver } from '../facts/checks.ts';
import { collectExecutionEnvironment } from '../facts/environment.ts';
import { captureVerificationInputs, verificationInputSetFingerprint } from '../facts/execution-inputs.ts';
import { captureGitWorktree, collectGitWorktreeChange, compareGitWorktrees } from '../facts/worktree.ts';
import { sha256, stableFingerprint } from '../protocol.ts';
import { PRODUCT_VERSION } from '../version.ts';
import { artifact, artifacts, observeCurrency, taskResult } from './common.ts';
import { commitTaskCommand, createStaging, loadTask, projectRelativePath,
  taskArtifactPath, withWorktreeLease, writeImmutableBuffer, type LoadedTask } from './task-store.ts';

export interface CollectOptions {
  projectRoot: string; taskId: string;
  retryTimeout?: { checkKey: string; timeoutMs: number }; refreshReason?: string;
  onProgress?: ProgressObserver;
}

export async function collectTask(options: CollectOptions) {
  if (options.retryTimeout && options.refreshReason !== undefined) throw inputError('Use timeout retry or failure refresh, not both.');
  return withWorktreeLease({ ...options, operation: 'collect' }, async () => {
    const task = loadTask(options.projectRoot, options.taskId);
    if (task.state.closed) throw usageError('This task is closed.');
    const plan = artifact(task.state, 'verification-plan', task.state.planId);
    const baseline = artifact(task.state, 'baseline', task.state.baselineId).snapshot;
    const previous = task.state.observationId ? artifact(task.state, 'observation', task.state.observationId) : undefined;
    const currency = await observeCurrency(task);
    const current = evaluateAdoption(task.state, currency).factsCurrency === 'current';
    if (current && previous && !options.retryTimeout && options.refreshReason === undefined) return taskResult(task, 'observations-reused', currency);
    validateReexecution(task, previous, current, options);
    const operationId = randomUUID();
    const staging = createStaging(task.projectRoot, 'collect');
    const payload = join(staging, 'payload');
    const objects = join(payload, 'worktree-objects');
    const durableObjects = taskArtifactPath(task.taskDirectory, 'worktree-objects');
    mkdirSync(objects, { recursive: true });
    let stage = 'capture-before-checks';
    try {
      const captureOptions = { objectDirectory: objects, alternateObjectDirectories: [durableObjects] };
      const preCheck = await captureGitWorktree(task.projectRoot, captureOptions);
      const preCheckExecutionInputs = captureVerificationInputs(task.projectRoot, plan.definitions);
      if ((options.retryTimeout || options.refreshReason !== undefined) && previous
        && (preCheck.fingerprint !== previous.data.current.fingerprint
          || verificationInputSetFingerprint(preCheckExecutionInputs) !== verificationInputSetFingerprint(previous.data.currentExecutionInputs))) {
        throw usageError('The worktree or declared inputs changed before re-execution. Collect current facts instead.');
      }
      const files = 'collections/' + operationId;
      stage = 'execute-checks';
      const checks = await executeChecks(task, plan.definitions, previous, options,
        taskArtifactPath(payload, files + '/checks'), taskArtifactPath(task.taskDirectory, files + '/checks'));
      stage = 'capture-after-checks';
      const change = await collectGitWorktreeChange(task.projectRoot, baseline, captureOptions);
      const currentExecutionInputs = captureVerificationInputs(task.projectRoot, plan.definitions);
      const patch = change.patch.length ? {
        path: projectRelativePath(task.projectRoot, taskArtifactPath(task.taskDirectory, files + '/change.patch')),
        digest: sha256(change.patch), byteLength: change.patch.length,
      } : undefined;
      if (patch) writeImmutableBuffer(taskArtifactPath(payload, files + '/change.patch'), change.patch);
      const data: ObservationData = {
        baselineFingerprint: baseline.fingerprint, preCheck, current: change.current,
        preCheckExecutionInputs, currentExecutionInputs,
        changeFingerprint: change.changeFingerprint, changedFiles: change.changedFiles,
        checkInducedChanges: compareGitWorktrees(preCheck, change.current), checks,
        verifierMutations: verifierMutations(plan.definitions, change.changedFiles),
        environment: collectExecutionEnvironment(task.projectRoot, plan.definitions),
        ...(patch ? { patch } : {}),
        ...(options.refreshReason !== undefined ? { refresh: { priorObservationId: previous!.id,
          authority: 'agent-judgment' as const, reason: options.refreshReason } } : {}),
        ...(options.retryTimeout ? { retry: { priorObservationId: previous!.id, checkKey: options.retryTimeout.checkKey } } : {}),
        provenance: { collector: 'stetra-cli', cliVersion: PRODUCT_VERSION, coreVersion: PRODUCT_VERSION },
      };
      stage = 'publish-observation';
      const result = commitTaskCommand({ projectRoot: task.projectRoot, taskId: task.taskId,
        command: { type: 'collect', input: {} }, runtime: { operationId, observation: data },
        expectedRevision: task.state.revision, stagedFiles: payload });
      return taskResult(result.task, 'observations-collected', {
        worktreeFingerprint: change.current.fingerprint,
        executionInputsFingerprint: verificationInputSetFingerprint(currentExecutionInputs),
      });
    } catch (cause) {
      const error = normalizeCliError(cause);
      throw new CliError(error.code, error.message, error.exitCode, { cause, issues: [
        ...(error.issues ?? []), { code: 'COLLECTION_INTERRUPTED', path: stage,
          message: stage === 'capture-before-checks' ? 'This collection did not start checks.'
            : 'Checks may have executed or changed files. Only published Observations are retained evidence.',
          remediation: `Inspect task ${task.taskId} history and live summary before collecting again. Repair the reported operational failure; do not assume re-execution has no effects.` },
      ] });
    } finally { rmSync(staging, { recursive: true, force: true }); }
  });
}

function validateReexecution(task: LoadedTask, previous: Observation | undefined, current: boolean, options: CollectOptions): void {
  if (!options.retryTimeout && options.refreshReason === undefined) return;
  if (!current || !previous) throw inputError('Re-execution requires an unchanged current Observation.');
  if (options.refreshReason !== undefined) {
    if (!/\S/.test(options.refreshReason)) throw inputError('Failure refresh requires an Agent-authored reason.');
    if (!previous.data.checks.some((check) => check.attempts.at(-1)!.status !== 'passed'
      && check.attempts.at(-1)!.termination.kind !== 'timeout')) throw inputError('Failure refresh requires an actual non-timeout failure.');
    if (artifacts(task.state, 'observation').some((observation) => observation.attemptNumber === task.state.attemptNumber
      && observation.planId === task.state.planId && observation.data.refresh
      && observation.data.preCheck.fingerprint === previous.data.current.fingerprint
      && verificationInputSetFingerprint(observation.data.preCheckExecutionInputs) === verificationInputSetFingerprint(previous.data.currentExecutionInputs))) {
      throw inputError('Failure refresh was already used for this unchanged delivery Attempt.');
    }
  }
  if (options.retryTimeout) {
    const definition = artifact(task.state, 'verification-plan', task.state.planId).definitions.find((item) => item.key === options.retryTimeout!.checkKey);
    const check = previous.data.checks.find((item) => item.definitionId === definition?.definitionId);
    const prior = check?.attempts.at(-1);
    if (!prior || prior.termination.kind !== 'timeout') throw inputError('Timeout retry requires an actual timeout for that check.');
    if (check!.attempts.length > task.state.executionPolicy.maxTimeoutRetriesPerCheck) throw inputError('Timeout retry budget is exhausted.');
    if (!Number.isSafeInteger(options.retryTimeout.timeoutMs) || options.retryTimeout.timeoutMs <= prior.timeoutMs
      || options.retryTimeout.timeoutMs > task.state.executionPolicy.maxTimeoutMs) throw inputError('Retry requires a larger bounded timeout.');
  }
}

async function executeChecks(task: LoadedTask, definitions: VerificationDefinition[], previous: Observation | undefined,
  options: CollectOptions, outputDirectory: string, recordedOutputDirectory: string): Promise<CheckFact[]> {
  if (options.retryTimeout) {
    const definition = definitions.find((item) => item.key === options.retryTimeout!.checkKey)!;
    const prior = previous!.data.checks.find((item) => item.definitionId === definition.definitionId)!;
    const [retried] = await runFrozenChecks({ projectRoot: task.projectRoot, outputDirectory, recordedOutputDirectory,
      onProgress: options.onProgress,
      executions: [{ definition, timeoutMs: options.retryTimeout.timeoutMs, previousAttempts: prior.attempts }] });
    return previous!.data.checks.map((check) => check.definitionId === definition.definitionId ? retried : check);
  }
  return runFrozenChecks({ projectRoot: task.projectRoot, outputDirectory, recordedOutputDirectory,
    onProgress: options.onProgress,
    executions: definitions.map((definition) => ({ definition,
      timeoutMs: options.refreshReason !== undefined
        ? previous!.data.checks.find((check) => check.definitionId === definition.definitionId)!.attempts.at(-1)!.timeoutMs
        : task.state.executionPolicy.checkTimeoutMs,
    })) });
}

function verifierMutations(definitions: VerificationDefinition[], files: ChangedFileFact[]): VerifierMutation[] {
  const mutations: VerifierMutation[] = [];
  for (const definition of definitions) for (const selector of definition.verifierRefs) for (const file of files) {
    for (const [path, matchedBy] of [[file.path, 'current-path'], [file.previousPath, 'previous-path']] as const) {
      if (path && (path === selector.path || (selector.kind === 'tree' && path.startsWith(selector.path + '/')))) {
        mutations.push({ verifierId: definition.verifierId, definitionId: definition.definitionId,
          selector, changedFileId: file.id, changedPath: path, matchedBy });
      }
    }
  }
  return mutations;
}
