import { z } from 'zod';

/** Codex native wire fields. Unknown Host fields are never persisted. */
export const CodexHookInput = z.object({
  session_id: z.string().min(1).max(1024), cwd: z.string().min(1),
  hook_event_name: z.enum(['SessionStart', 'SubagentStart', 'SubagentStop', 'Stop']),
  agent_id: z.string().min(1).max(1024).optional(), agent_type: z.string().min(1).max(1024).optional(),
  turn_id: z.string().min(1).max(1024).optional(), stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().nullable().optional(),
}).strip();
