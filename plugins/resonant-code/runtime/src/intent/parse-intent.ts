import type { CompileTaskInput, Operation, TaskIntent } from '../types.ts';

/**
 * Produces a deterministic task intent from user task input without using an LLM.
 */
export function parseIntent(task: CompileTaskInput): TaskIntent {
  const description = task.description.toLowerCase();
  const targetFile = task.targetFile?.replace(/\\/g, '/');
  const changedFiles = (task.changedFiles ?? []).map((file) => file.replace(/\\/g, '/'));
  const techStack = [...new Set([
    ...(task.techStack ?? []),
    ...(targetFile?.endsWith('.ts') || targetFile?.endsWith('.tsx') ? ['typescript'] : []),
    ...(description.includes('react') || targetFile?.endsWith('.tsx') ? ['react'] : []),
  ])];

  const operation = task.operation ?? inferOperation(description);
  return {
    operation,
    target_layer: inferTargetLayer(targetFile, description),
    tech_stack: techStack,
    target_file: targetFile,
    changed_files: changedFiles,
    tags: [...new Set(task.tags ?? inferTags(description, targetFile))],
  };
}

function inferOperation(description: string): Operation {
  if (/(review|audit|inspect)/.test(description)) return 'review';
  if (/(bug|fix|regression|broken)/.test(description)) return 'bugfix';
  if (/(refactor|cleanup|restructure)/.test(description)) return 'refactor';
  if (/(create|add|implement|build|new)/.test(description)) return 'create';
  return 'modify';
}

function inferTargetLayer(targetFile: string | undefined, description: string): string {
  const input = `${targetFile ?? ''} ${description}`;
  if (/(test|spec)/.test(input)) return 'test';
  if (/(api|route|handler|endpoint)/.test(input)) return 'api';
  if (/(store|state|slice)/.test(input)) return 'store';
  if (/(component|tsx|view|page)/.test(input)) return 'component';
  if (/(util|helper|lib)/.test(input)) return 'util';
  return 'module';
}

function inferTags(description: string, targetFile: string | undefined): string[] {
  const value = `${description} ${targetFile ?? ''}`;
  const tags: string[] = [];
  if (/async|promise|await/.test(value)) tags.push('async');
  if (/form/.test(value)) tags.push('form');
  if (/fetch|query|api/.test(value)) tags.push('data-fetching');
  if (/test|spec/.test(value)) tags.push('test');
  return tags;
}
