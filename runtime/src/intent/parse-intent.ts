import type { CompileTaskInput, ContextProfile, Operation, TaskIntent } from '../types.ts';

const DEFAULT_OPTIMIZATION_TARGET: Record<Operation, ContextProfile['optimization_target']> = {
  create: 'maintainability',
  modify: 'maintainability',
  review: 'reviewability',
  refactor: 'maintainability',
  bugfix: 'safety',
};

/**
 * Produces a deterministic task intent from user task input without using an LLM.
 */
export function parseIntent(task: CompileTaskInput): TaskIntent {
  const targetFile = task.targetFile?.replace(/\\/g, '/');
  const changedFiles = (task.changedFiles ?? []).map((file) => file.replace(/\\/g, '/'));
  const techStack = [...new Set([
    ...(task.techStack ?? []),
    ...inferTechStackFromFile(targetFile),
  ])];

  const operation = task.operation ?? 'modify';
  return {
    task_kind: task.taskKind ?? 'code',
    operation,
    target_layer: inferTargetLayer(targetFile),
    tech_stack: techStack,
    target_file: targetFile,
    changed_files: changedFiles,
    tags: [...new Set(task.tags ?? inferTags(targetFile, changedFiles))],
  };
}

function inferTechStackFromFile(targetFile: string | undefined): string[] {
  if (!targetFile) return [];
  if (targetFile.endsWith('.tsx')) return ['typescript', 'react'];
  if (targetFile.endsWith('.ts')) return ['typescript'];
  return [];
}

export function inferTargetLayer(targetFile: string | undefined): string {
  if (!targetFile) return 'module';
  if (/(^|\/)(test|tests|spec|specs)(\/|$)|\.(test|spec)\./.test(targetFile)) return 'test';
  if (/(^|\/)(api|routes)(\/|$)|\b(handler|endpoint)\b/.test(targetFile)) return 'api';
  if (/(^|\/)(store|state)(\/|$)|\.slice\./.test(targetFile)) return 'store';
  if (/(^|\/)(components?|views?|pages?)(\/|$)|\.tsx$/.test(targetFile)) return 'component';
  if (/(^|\/)(utils?|helpers?|lib)(\/|$)/.test(targetFile)) return 'util';
  return 'module';
}

function inferTags(targetFile: string | undefined, changedFiles: string[]): string[] {
  const inputs = [targetFile, ...changedFiles].filter(Boolean).join(' ');
  const tags: string[] = [];
  if (/(^|\/)(test|tests|spec|specs)(\/|$)|\.(test|spec)\./.test(inputs)) tags.push('test');
  return tags;
}

function inferOptimizationTarget(operation: Operation): ContextProfile['optimization_target'] {
  return DEFAULT_OPTIMIZATION_TARGET[operation];
}

function inferHardConstraints(): string[] {
  return [];
}

function inferAllowedTradeoffs(): string[] {
  return [];
}

function inferAvoid(): string[] {
  return [];
}

/**
 * Builds the contextual priorities and constraints used alongside task intent.
 */
export function buildContextProfile(task: CompileTaskInput, intent: TaskIntent): ContextProfile {
  return {
    project_stage: task.projectStage,
    change_type: intent.operation,
    optimization_target: task.optimizationTarget ?? inferOptimizationTarget(intent.operation),
    hard_constraints: [...new Set(task.hardConstraints ?? inferHardConstraints())],
    allowed_tradeoffs: [...new Set(task.allowedTradeoffs ?? inferAllowedTradeoffs())],
    avoid: [...new Set(task.avoid ?? inferAvoid())],
  };
}

