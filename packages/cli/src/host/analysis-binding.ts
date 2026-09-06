/** Operational correlation of one requested semantic role with native Host identity. */
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { schemas } from '@sovea/stetra-core';
import { inputError, usageError } from '../errors.ts';
import { sha256 } from '../protocol.ts';
import { loadTask, type LoadedTask } from '../workflow/task-store.ts';
import { acquireLock, readJson, releaseLock, safeStoragePath, writeJsonAtomic } from '../workflow/storage-io.ts';
import type { HostSession } from './session.ts';

const BindingSchema = z.strictObject({
  schemaVersion: z.literal(1), taskId: z.uuid(), requestId: schemas.id,
  agentId: z.string().min(1).max(1024).optional(), turnId: z.string().min(1).max(1024).optional(),
});
const AgentIndexSchema = z.strictObject({ taskId: z.uuid(), requestId: schemas.id, agentId: z.string().min(1).max(1024) });
export type AnalysisBinding = z.infer<typeof BindingSchema>;

function directory(projectRoot: string, session: HostSession): string {
  return safeStoragePath(projectRoot, '.stetra/host-sessions/' + session.adapter + '/' + session.sessionKeyHash);
}
function bindingPath(root: string, requestId: string): string {
  return safeStoragePath(root, 'analyses/' + sha256(requestId).slice(7) + '.json');
}

export function reserveAnalysis(task: LoadedTask, session: HostSession): void {
  if (session.taskId !== task.taskId || !task.state.requestId) throw usageError('Analysis requires the exact bound task and a frozen request.');
  const root = directory(task.projectRoot, session), lock = acquireLock(safeStoragePath(root, 'analysis.lock'), 'reserve-analysis');
  try {
    const path = bindingPath(root, task.state.requestId);
    if (!existsSync(path)) writeJsonAtomic(path, { schemaVersion: 1, taskId: task.taskId, requestId: task.state.requestId });
    const binding = BindingSchema.parse(readJson(path));
    if (binding.taskId !== task.taskId || binding.requestId !== task.state.requestId) throw inputError('Analysis binding identity mismatch.');
    writeJsonAtomic(safeStoragePath(root, 'analysis-request.json'), { requestId: binding.requestId });
  } finally { releaseLock(lock); }
}

export function bindAnalysisAgent(input: { projectRoot: string; session: HostSession; agentId: string; turnId?: string }): AnalysisBinding | undefined {
  const root = directory(input.projectRoot, input.session);
  const pointer = safeStoragePath(root, 'analysis-request.json');
  if (!existsSync(pointer)) return undefined;
  const lock = acquireLock(safeStoragePath(root, 'analysis.lock'), 'bind-analysis');
  try {
    const { requestId } = z.strictObject({ requestId: schemas.id }).parse(readJson(pointer));
    const path = bindingPath(root, requestId), binding = BindingSchema.parse(readJson(path));
    const task = loadTask(input.projectRoot, binding.taskId);
    if (task.state.closed || task.state.requestId !== binding.requestId || task.state.assessmentId) return undefined;
    if (input.session.taskId !== binding.taskId) throw inputError('Analysis parent session no longer matches the task.');
    if (binding.agentId && binding.agentId !== input.agentId) throw inputError('This request is already bound to another Analyzer.');
    const agentPath = safeStoragePath(root, 'agent-bindings/' + sha256(input.agentId).slice(7) + '.json');
    const index = { taskId: binding.taskId, requestId: binding.requestId, agentId: input.agentId };
    if (existsSync(agentPath)) {
      const prior = AgentIndexSchema.parse(readJson(agentPath));
      if (prior.requestId !== binding.requestId || prior.taskId !== binding.taskId) throw inputError('Native agent identity is already associated with another analysis request.');
    }
    writeJsonAtomic(agentPath, index);
    const next = BindingSchema.parse({ ...binding, agentId: input.agentId,
      ...(input.turnId ? { turnId: input.turnId } : {}) });
    writeJsonAtomic(path, next);
    return next;
  } finally { releaseLock(lock); }
}

export function readAnalysisBinding(projectRoot: string, session: HostSession, agentId: string): AnalysisBinding | undefined {
  const root = directory(projectRoot, session);
  const path = safeStoragePath(root, 'agent-bindings/' + sha256(agentId).slice(7) + '.json');
  if (!existsSync(path)) return undefined;
  const index = AgentIndexSchema.parse(readJson(path));
  const binding = BindingSchema.parse(readJson(bindingPath(root, index.requestId)));
  if (index.agentId !== agentId || binding.agentId !== agentId || binding.taskId !== index.taskId
    || binding.requestId !== index.requestId || binding.taskId !== session.taskId) throw inputError('Native analysis identity does not match its saved request binding.');
  return binding;
}
