import { schemas } from '@sovea/stetra-core';
import type { z } from 'zod';
import { commitTaskCommand, loadTask, withWorktreeLease } from './task-store.ts';
import { observeCurrency, taskResult } from './common.ts';

export async function prepareAdoption(options: { projectRoot: string; taskId: string; source: z.input<typeof schemas.commands.prepare> }) {
  return withWorktreeLease({ ...options, operation: 'prepare' }, async () => {
    const task = loadTask(options.projectRoot, options.taskId), currency = await observeCurrency(task);
    const result = commitTaskCommand({ ...options, command: { type: 'prepare', input: options.source },
      expectedRevision: task.state.revision, runtime: { currency } });
    return taskResult(result.task, result.changed ? 'adoption-prepared' : 'adoption-unchanged', currency);
  });
}

export async function decideAdoption(options: { projectRoot: string; taskId: string; source: z.input<typeof schemas.commands.decide> }) {
  return withWorktreeLease({ ...options, operation: 'decide' }, async () => {
    const task = loadTask(options.projectRoot, options.taskId);
    const currency = options.source.action === 'accepted' ? await observeCurrency(task) : undefined;
    const result = commitTaskCommand({ ...options, command: { type: 'decide', input: options.source },
      expectedRevision: task.state.revision, runtime: { currency } });
    return taskResult(result.task, 'adoption-recorded', currency);
  });
}
