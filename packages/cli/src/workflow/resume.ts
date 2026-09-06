import { existsSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { evaluateAdoption } from '@sovea/stetra-core';
import { usageError } from '../errors.ts';
import { bindHostSession, sessionForToken } from '../host/session.ts';
import { artifact, taskResult } from './common.ts';
import { canonicalProjectRoot, loadTask, taskArtifactPath, withWorktreeLease } from './task-store.ts';

/** A read projection of admitted tasks, with no latest-task selection or registry. */
export function inspectUnfinishedTasks(projectRoot: string) {
  const directory = taskArtifactPath(projectRoot, '.stetra/tasks');
  const tasks: Array<{ taskId: string; revision: number; phase: string; outcome: string }> = [];
  const issues: Array<{ code: string; taskId: string; message: string }> = [];
  if (existsSync(directory)) for (const name of readdirSync(directory).sort()) {
    if (!z.uuid().safeParse(name).success) continue;
    try {
      const { state } = loadTask(projectRoot, name);
      if (!state.closed) tasks.push({ taskId: name, revision: state.revision, phase: evaluateAdoption(state).phase,
        outcome: artifact(state, 'intent', state.intentId).interpretation.desiredOutcome });
    } catch (error) {
      issues.push({ code: 'task-unreadable', taskId: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { tasks, issues };
}

/** Resume only the explicitly selected task's Host binding; it neither admits nor executes work. */
export async function resumeTask(input: { projectRoot: string; taskId: string; bindingToken: string }) {
  const projectRoot = canonicalProjectRoot(input.projectRoot);
  return withWorktreeLease({ ...input, projectRoot, operation: 'resume' }, async () => {
    const task = loadTask(projectRoot, input.taskId);
    if (task.state.closed) throw usageError('This task is closed. Inspect its history or admit a new coding task.');
    const session = sessionForToken(projectRoot, input.bindingToken);
    bindHostSession({ ...input, projectRoot });
    return { ...taskResult(task, session.taskId === task.taskId ? 'task-already-bound' : 'task-resumed'),
      recovery: 'Host binding restored. Inspect current facts before delivery. If previous Host analysis cannot be resumed, explicitly reassess the current Report using this session binding token.' };
  });
}
