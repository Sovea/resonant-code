import { schemas } from '@sovea/stetra-core';
import type { z } from 'zod';
import { commitTaskCommand, loadTask, withWorktreeLease } from './task-store.ts';
import { observeCurrency, taskResult } from './common.ts';
import { reserveAnalysis } from '../host/analysis-binding.ts';
import { sessionForToken } from '../host/session.ts';
import { usageError } from '../errors.ts';

export async function reportTask(options: { projectRoot: string; taskId: string;
  source: z.input<typeof schemas.commands.report>; bindingToken?: string }) {
  return withWorktreeLease({ ...options, operation: 'report' }, async () => {
    const task = loadTask(options.projectRoot, options.taskId);
    const session = options.bindingToken ? sessionForToken(task.projectRoot, options.bindingToken) : undefined;
    if (session && session.taskId !== task.taskId) throw usageError('Analysis must use the parent session bound to this task.');
    const currency = await observeCurrency(task);
    const result = commitTaskCommand({ ...options, command: { type: 'report', input: options.source },
      expectedRevision: task.state.revision, runtime: { currency } });
    if (session) reserveAnalysis(result.task, session);
    return taskResult(result.task, result.changed ? 'report-recorded' : 'report-reused', currency);
  });
}
