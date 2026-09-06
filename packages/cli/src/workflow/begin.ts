import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { planTransition, schemas } from '@sovea/stetra-core';
import type { z } from 'zod';
import { captureGitWorktree } from '../facts/worktree.ts';
import { bindHostSession, cancelHostBegin, prepareHostBegin } from '../host/session.ts';
import { stableFingerprint } from '../protocol.ts';
import { readProjectConfig } from '../schemas/config.ts';
import { canonicalProjectRoot, createTaskWorkspace, initializeTask, requireTransition, withWorktreeLease, type LoadedTask } from './task-store.ts';
import { resolveVerification, taskResult } from './common.ts';

export async function beginTask(options: { projectRoot: string; source: z.input<typeof schemas.commands.begin>; bindingToken?: string }) {
  const projectRoot = canonicalProjectRoot(options.projectRoot);
  const source = schemas.commands.begin.parse(options.source);
  const config = readProjectConfig(projectRoot);
  const verification = resolveVerification(source.verification, config);
  const beginFingerprint = stableFingerprint({ ...source, verification, executionPolicy: config.executionPolicy });
  let task: LoadedTask | undefined, resumed = false;
  await withWorktreeLease({ projectRoot, operation: 'begin' }, async () => {
    let taskId: string = randomUUID();
    if (options.bindingToken) {
      const binding = prepareHostBegin({ projectRoot, bindingToken: options.bindingToken, beginFingerprint });
      taskId = binding.taskId;
      if (binding.published) {
        task = binding.published; resumed = true;
        bindHostSession({ projectRoot, bindingToken: options.bindingToken, taskId }); return;
      }
    }
    const workspace = createTaskWorkspace(projectRoot, taskId);
    try {
      const baseline = await captureGitWorktree(projectRoot, { objectDirectory: workspace.objectDirectory });
      const transition = requireTransition(planTransition(null, { type: 'begin', input: source }, {
        taskId, operationId: taskId, baseline, verification, executionPolicy: config.executionPolicy,
      }));
      if (transition.status !== 'transition') throw new Error('Begin must publish its admitted task.');
      task = initializeTask({ projectRoot, taskId, stagingDirectory: workspace.taskDirectory, transition, beginFingerprint });
    } catch (error) {
      rmSync(workspace.taskDirectory, { recursive: true, force: true });
      if (options.bindingToken) cancelHostBegin(projectRoot, options.bindingToken, taskId);
      throw error;
    }
    if (options.bindingToken) bindHostSession({ projectRoot, bindingToken: options.bindingToken, taskId });
  });
  if (!task) throw new Error('Begin completed without a task.');
  return taskResult(task, resumed ? 'task-resumed' : 'task-begun');
}
