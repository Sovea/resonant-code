import { schemas, type AnalysisOrigin } from '@sovea/stetra-core';
import type { z } from 'zod';
import { commitTaskCommand } from './task-store.ts';
import { taskResult } from './common.ts';

export function submitAssessment(options: { projectRoot: string; taskId: string;
  source: z.input<typeof schemas.commands.assess>; origin?: AnalysisOrigin }) {
  const result = commitTaskCommand({ ...options, command: { type: 'assess', input: options.source },
    runtime: { analysisOrigin: options.origin } });
  const current = result.task.state.requestId === options.source.requestId
    && result.task.state.assessmentId !== undefined;
  return { ...taskResult(result.task, result.changed ? 'assessment-recorded' : 'assessment-reused'),
    assessmentCurrent: current };
}
