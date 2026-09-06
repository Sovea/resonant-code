import { evaluateAdoption, schemas } from '@sovea/stetra-core';
import type { z } from 'zod';
import { commitTaskCommand, loadTask, withWorktreeLease } from './task-store.ts';
import { artifact, observeCurrency, taskResult } from './common.ts';
import { reserveAnalysis } from '../host/analysis-binding.ts';
import { sessionForToken } from '../host/session.ts';
import { usageError } from '../errors.ts';

type ReportOptions = { projectRoot: string; taskId: string; bindingToken?: string } & (
  { source: z.input<typeof schemas.commands.report>; reassessReason?: never }
  | { source?: never; reassessReason: string }
);

export async function reportTask(options: ReportOptions) {
  return withWorktreeLease({ ...options, operation: 'report' }, async () => {
    const task = loadTask(options.projectRoot, options.taskId);
    const session = options.bindingToken ? sessionForToken(task.projectRoot, options.bindingToken) : undefined;
    if (session && session.taskId !== task.taskId) throw usageError('Analysis must use the parent session bound to this task.');
    const currency = await observeCurrency(task);
    if (!options.source && !evaluateAdoption(task.state).reportCurrent) {
      throw usageError('Reassessment requires a current Report. Collect and report changed inputs first.');
    }
    const source = options.source ?? { report: artifact(task.state, 'report', task.state.reportId).input,
      reassessReason: options.reassessReason };
    const result = commitTaskCommand({ ...options, command: { type: 'report', input: source },
      expectedRevision: task.state.revision, runtime: { currency } });
    if (session) reserveAnalysis(result.task, session);
    return taskResult(result.task, result.changed ? 'report-recorded' : 'report-reused', currency);
  });
}
