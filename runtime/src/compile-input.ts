import { resolveTask } from './interpret/normalize-candidate.ts';
import type { CompileInput, ResolvedCompileInput, ResolvedTaskOutput } from './types.ts';

export function hasResolvedTask(input: CompileInput): input is ResolvedCompileInput {
  return 'resolvedTask' in input;
}

export function resolveCompileTask(input: CompileInput): ResolvedTaskOutput {
  if (hasResolvedTask(input)) return input.resolvedTask;
  return resolveTask({
    task: input.task,
    candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
    interpretationMode: input.interpretationMode,
  });
}

export function toResolvedCompileInput(input: CompileInput): ResolvedCompileInput {
  if (hasResolvedTask(input)) return input;
  const { task: _task, parsedTaskCandidate: _parsedTaskCandidate, interpretationMode: _interpretationMode, ...base } = input;
  return {
    ...base,
    resolvedTask: resolveCompileTask(input),
  };
}
