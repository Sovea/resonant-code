import type { CompileTaskInput, ContextProfile, Operation, TaskIntent } from '../types.ts';
import {
  COMPATIBILITY_REQUIREMENTS,
  INTERFACE_SENSITIVITIES,
  MIGRATION_PHASES,
  OPERATIONS,
  OPTIMIZATION_TARGETS,
  PROJECT_STAGES,
  REFACTOR_TOLERANCES,
  REVIEW_GOALS,
  RISK_LEVELS,
  SCOPE_SIZES,
  TASK_KINDS,
  enumValue,
} from './schema.ts';

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

  const operation = enumValue(task.operation, OPERATIONS) ?? 'modify';
  return {
    task_kind: enumValue(task.taskKind, TASK_KINDS) ?? 'code',
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
    project_stage: enumValue(task.projectStage, PROJECT_STAGES),
    change_type: intent.operation,
    optimization_target: enumValue(task.optimizationTarget, OPTIMIZATION_TARGETS) ?? inferOptimizationTarget(intent.operation),
    hard_constraints: [...new Set(task.hardConstraints ?? inferHardConstraints())],
    allowed_tradeoffs: [...new Set(task.allowedTradeoffs ?? inferAllowedTradeoffs())],
    avoid: [...new Set(task.avoid ?? inferAvoid())],
    risk_level: enumValue(task.riskLevel, RISK_LEVELS) ?? inferRiskLevel(task, intent),
    scope_size: enumValue(task.scopeSize, SCOPE_SIZES) ?? inferScopeSize(intent),
    compatibility_requirement: enumValue(task.compatibilityRequirement, COMPATIBILITY_REQUIREMENTS) ?? inferCompatibilityRequirement(task),
    interface_sensitivity: enumValue(task.interfaceSensitivity, INTERFACE_SENSITIVITIES) ?? inferInterfaceSensitivity(intent),
    refactor_tolerance: enumValue(task.refactorTolerance, REFACTOR_TOLERANCES) ?? inferRefactorTolerance(task, intent),
    migration_phase: enumValue(task.migrationPhase, MIGRATION_PHASES) ?? inferMigrationPhase(task),
    review_goal: enumValue(task.reviewGoal, REVIEW_GOALS) ?? inferReviewGoal(task, intent),
  };
}

function inferRiskLevel(task: CompileTaskInput, intent: TaskIntent): ContextProfile['risk_level'] {
  const text = searchableTaskText(task);
  if (task.projectStage === 'critical' || /critical|security|auth|payment|data loss|breaking/i.test(text)) return 'critical';
  if (task.optimizationTarget === 'safety' || /public api|preserve api|migration|regression|compat/i.test(text)) return 'high';
  if (intent.operation === 'create' && intent.changed_files.length <= 1) return 'low';
  return 'medium';
}

function inferScopeSize(intent: TaskIntent): ContextProfile['scope_size'] {
  const files = [...new Set([intent.target_file, ...intent.changed_files].filter(Boolean) as string[])];
  if (!files.length) return 'unknown';
  if (files.length === 1) return 'single-file';
  const roots = new Set(files.map((file) => file.split('/').slice(0, 2).join('/')));
  return roots.size <= 1 ? 'module' : 'cross-cutting';
}

function inferCompatibilityRequirement(task: CompileTaskInput): ContextProfile['compatibility_requirement'] {
  const text = searchableTaskText(task);
  if (/breaking allowed|allow breaking|breaking change allowed/i.test(text)) return 'breaking-allowed';
  if (/preserve public api|preserve api|public api|api compatibility/i.test(text)) return 'preserve-api';
  if (/migration compatible|dual run|cutover/i.test(text)) return 'migration-compatible';
  if (/preserve behavior|avoid breaking|backward compatible|compatibility/i.test(text)) return 'preserve-behavior';
  return 'none';
}

function inferInterfaceSensitivity(intent: TaskIntent): ContextProfile['interface_sensitivity'] {
  const inputs = [intent.target_file, ...intent.changed_files, ...intent.tags, ...intent.tech_stack].filter(Boolean).join(' ');
  if (/(^|\/)(auth|security)(\/|$)|token|permission|credential/i.test(inputs)) return 'auth-security';
  if (/(^|\/)(db|database|schema|migrations?|models?)(\/|$)|persistence|storage/i.test(inputs)) return 'persistence';
  if (/(^|\/)(api|routes|controllers?|handlers?)(\/|$)|public-api|endpoint/i.test(inputs)) return 'public-api';
  if (/(^|\/)(integrations?|webhooks?|clients?)(\/|$)|external/i.test(inputs)) return 'external-integration';
  return inputs ? 'internal' : 'unknown';
}

function inferRefactorTolerance(task: CompileTaskInput, intent: TaskIntent): ContextProfile['refactor_tolerance'] {
  const text = searchableTaskText(task);
  if (/no refactor|avoid refactor|do not refactor/i.test(text)) return 'none';
  if (/local only|narrow change|minimal change|avoid broad|broad rewrites|overengineering/i.test(text)) return 'local-only';
  if (intent.operation === 'refactor') return 'bounded';
  return 'local-only';
}

function inferMigrationPhase(task: CompileTaskInput): ContextProfile['migration_phase'] {
  const text = searchableTaskText(task);
  if (/dual run|dual-run|parallel run/i.test(text)) return 'dual-run';
  if (/cutover|switch over/i.test(text)) return 'cutover';
  if (/cleanup|remove legacy|delete legacy/i.test(text)) return 'cleanup';
  if (/prepare migration|migration prep|preparation/i.test(text)) return 'preparation';
  return 'none';
}

function inferReviewGoal(task: CompileTaskInput, intent: TaskIntent): ContextProfile['review_goal'] {
  const text = searchableTaskText(task);
  if (/security|auth|permission|credential/i.test(text)) return 'security';
  if (/performance|latency|throughput|memory/i.test(text)) return 'performance';
  if (/architecture|design|fit/i.test(text)) return 'architecture-fit';
  if (intent.operation === 'bugfix' || task.optimizationTarget === 'safety') return 'regression-risk';
  if (intent.operation === 'review') return 'correctness';
  return 'maintainability';
}

function searchableTaskText(task: CompileTaskInput): string {
  return [
    task.description,
    task.targetFile,
    ...(task.changedFiles ?? []),
    ...(task.tags ?? []),
    ...(task.hardConstraints ?? []),
    ...(task.allowedTradeoffs ?? []),
    ...(task.avoid ?? []),
  ].filter(Boolean).join(' ');
}
