import { schemas } from '@sovea/stetra-core';
import type { HostAdapter } from '../adapters/definition.ts';
import { inputError } from '../errors.ts';
import { sha256, stableFingerprint } from '../protocol.ts';
import { readProjectConfig } from '../schemas/config.ts';
import { parseArtifact } from '../validation.ts';
import { taskResult } from '../workflow/common.ts';
import { submitAssessment } from '../workflow/assessment.ts';
import { loadTask } from '../workflow/task-store.ts';
import { bindAnalysisAgent, readAnalysisBinding } from './analysis-binding.ts';
import { CodexHookInput } from './codex.ts';
import { ClaudeHookInput } from './claude.ts';
import { claimDirective, ensureHostSession, readHostSession, resolveInstalledProjectRoot, type HostSession } from './session.ts';

export type HostHookEvent = 'session-start' | 'subagent-start' | 'subagent-stop' | 'stop';
const EVENTS = { 'session-start': 'SessionStart', 'subagent-start': 'SubagentStart', 'subagent-stop': 'SubagentStop', stop: 'Stop' } as const;
const MAX_RESULT_BYTES = 256 * 1024;

/** Bounded local ingestion only: no Git observation, checks, transcript reads, or model calls. */
export async function handleHostHook(input: { adapter: HostAdapter; event: HostHookEvent; payload: unknown }): Promise<Record<string, unknown>> {
  const payload = input.adapter === 'codex'
    ? parseArtifact(CodexHookInput, input.payload, 'Codex Hook input')
    : parseArtifact(ClaudeHookInput, input.payload, 'Claude Code Hook input');
  const expected = EVENTS[input.event];
  if (payload.hook_event_name !== expected) throw inputError(`Host Hook input event must be ${expected}.`);
  const projectRoot = resolveInstalledProjectRoot(payload.cwd);
  if (!projectRoot) return {};
  // Child events never establish parent admission or create a task.
  if (input.event === 'subagent-start' || input.event === 'subagent-stop') {
    if (payload.agent_type !== 'stetra-analyzer') return {};
    const session = readHostSession({ projectRoot, adapter: input.adapter, sessionId: payload.session_id });
    if (!session?.taskId || !payload.agent_id) return fallback('Native Analyzer identity or parent binding is unavailable.');
    const turnId = 'turn_id' in payload && typeof payload.turn_id === 'string' ? payload.turn_id : undefined;
    if (input.event === 'subagent-start') {
      try {
        const binding = bindAnalysisAgent({ projectRoot, session, agentId: payload.agent_id, turnId });
        if (!binding) return fallback('No current Analysis Request was reserved for this Analyzer.');
        return additionalContext('SubagentStart', [
          `Stetra Analyzer scope: task ${binding.taskId}, request ${binding.requestId}.`,
          'Analyze only this frozen request. Return the exact JSON result as your final message. Do not submit or modify task state.',
          `From the project root, read: stetra task inspect . --task ${binding.taskId} --section analysis --request ${binding.requestId} --json`,
          'Use the parent-supplied frozen input and schema when the Host does not grant command access. Disclose missing source evidence.',
          'Do not start another Stetra task or Analyzer. Native event identity does not attest fresh-context isolation.',
        ].join('\n'));
      } catch (error) { return fallback(message(error)); }
    }
    try {
      const binding = readAnalysisBinding(projectRoot, session, payload.agent_id);
      if (!binding) return fallback('No exact Analysis Request is bound to this native agent.');
      const raw = payload.last_assistant_message;
      try {
        if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_RESULT_BYTES) throw inputError('Analyzer final output is missing or exceeds 262144 bytes.');
        const source = schemas.commands.assess.parse(JSON.parse(raw));
        if (source.requestId !== binding.requestId) throw inputError('Analyzer result must name its bound requestId.');
        const result = submitAssessment({ projectRoot, taskId: binding.taskId, source,
          origin: { transport: 'host-hook', host: input.adapter, sessionHash: 'sha256:' + session.sessionKeyHash,
            agentId: payload.agent_id, agentType: 'stetra-analyzer', ...(turnId ? { turnId } : {}), outputDigest: sha256(raw) } });
        return { systemMessage: `Stetra ${result.status}; ${result.assessmentCurrent ? 'bound to the current request' : 'retained as historical evidence; current work needs its own Assessment'}.` };
      } catch (error) {
        const first = claimDirective({ projectRoot, session, fingerprint: stableFingerprint({ formatRepair: binding.requestId }) });
        const reason = `Stetra could not record this Assessment: ${message(error)} Return one raw JSON object for request ${binding.requestId}; use assessment submit --input-schema --json or the parent-supplied schema. Do not write task files.`;
        return first && !payload.stop_hook_active ? { decision: 'block', reason } : fallback(reason);
      }
    } catch (error) { return fallback(message(error)); }
  }
  // A Host that includes child identity on a common event must not route it as the implementer.
  if (payload.agent_id || payload.agent_type) return {};
  const session = input.event === 'session-start'
    ? ensureHostSession({ projectRoot, adapter: input.adapter, sessionId: payload.session_id })
    : readHostSession({ projectRoot, adapter: input.adapter, sessionId: payload.session_id });
  if (!session) return {};
  const task = session.taskId ? loadTask(projectRoot, session.taskId) : undefined;
  if (input.event === 'session-start') return additionalContext('SessionStart', task && !task.state.closed
    ? boundContext(projectRoot, session, taskResult(task, 'task-context')) : admissionContext(projectRoot, session.bindingToken));
  if (!task || task.state.closed) return {};
  const context = taskResult(task, 'task-context'), content = boundContext(projectRoot, session, context);
  if (['await-human-decision', 'resolve-decision'].includes(context.directive.kind)) return { systemMessage: content };
  const first = claimDirective({ projectRoot, session, fingerprint: stableFingerprint({ taskId: task.taskId,
    revision: task.state.revision, directive: context.directive.kind }) });
  return first && !payload.stop_hook_active ? { decision: 'block', reason: content }
    : { systemMessage: `Stetra has surfaced this unchanged state; stopping is allowed with the unfinished work disclosed.\n${content}` };
}

function message(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 1200); }
function fallback(reason: string): Record<string, unknown> {
  return { systemMessage: `${reason}\nStetra permits stop. The parent can relay the exact result with assessment submit (Agent-relayed provenance), or record analysis as unavailable. Do not represent a failed transport as completed review.` };
}
function admissionContext(projectRoot: string, bindingToken: string): string {
  const config = readProjectConfig(projectRoot);
  const admission = config.admission === 'ask'
    ? 'For a coding task, ask once unless the developer has already admitted it. Conversation-only work creates no task.'
    : config.admission === 'required' ? 'Project policy admits coding tasks into Stetra. Conversation-only work creates no task.'
      : 'Start Stetra only for an explicitly admitted coding task.';
  return [`Stetra admission: ${config.admission}.`, admission,
    'Use the generated Stetra skill. Begin before editing; preserve the exact Human request and existing authority.',
    `Pass --binding-token ${bindingToken} to task begin and task report. The token establishes continuity, not Human authority.`].join('\n');
}
function boundContext(projectRoot: string, session: HostSession, context: ReturnType<typeof taskResult>): string {
  const command = `stetra task inspect . --task ${context.taskId}`;
  return [`Stetra task ${context.taskId}: ${context.phase}; next ${context.directive.kind}.`, context.directive.message,
    `Run these commands from the project root: ${JSON.stringify(projectRoot)}.`,
    'This Hook has not re-observed the worktree. Inspect with --live before presenting a Package as current.',
    `Current state: ${command} --section summary --live --json`,
    ...(context.directive.kind === 'await-human-decision' ? [`Adoption Package: ${command} --section adoption --live --json. Present its recommendation, facts, findings, and limitations; wait for the exact Human choice, then stop.`] : []),
    ...(context.directive.kind === 'resolve-decision' ? [`Concrete proposals: ${command} --section decisions --json. Existing authorization remains effective; only dependent work awaits new authority.`] : []),
    `Pass --binding-token ${session.bindingToken} when reporting for native Analyzer routing.`].join('\n');
}
function additionalContext(hookEventName: 'SessionStart' | 'SubagentStart', content: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName, additionalContext: content } };
}
