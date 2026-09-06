import { schemas, type TaskCommand } from '@sovea/stetra-core';
import { readProjectConfig } from '../schemas/config.ts';
import { commitTaskCommand, loadTask } from './task-store.ts';
import { resolveVerification, taskResult } from './common.ts';

type AuthorCommand = Extract<TaskCommand, { type: 'amend' | 'propose' | 'resolve' | 'verification-revise' }>;
export function authorTask(options: { projectRoot: string; taskId: string; command: AuthorCommand }) {
  const task = loadTask(options.projectRoot, options.taskId);
  const verification = options.command.type === 'verification-revise'
    ? resolveVerification(schemas.commands['verification-revise'].parse(options.command.input).verification, readProjectConfig(task.projectRoot))
    : undefined;
  const result = commitTaskCommand({ ...options, expectedRevision: task.state.revision, runtime: { verification } });
  return taskResult(result.task, result.changed ? 'task-updated' : 'task-unchanged');
}
