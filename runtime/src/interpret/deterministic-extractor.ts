import { buildContextProfile, parseIntent } from '../intent/parse-intent.ts';
import type { CompileTaskInput } from '../types.ts';
import type { TaskInterpretationProvider } from './provider.ts';
import type { ParsedTaskCandidate } from './types.ts';

export class DeterministicInterpretationProvider implements TaskInterpretationProvider {
  readonly source = 'deterministic' as const;

  interpret(task: CompileTaskInput): ParsedTaskCandidate {
    const intent = parseIntent(task);
    const context = buildContextProfile(task, intent);

    return {
      intent: {
        task_kind: toField(intent.task_kind, task.taskKind ? 'explicit' : 'deterministic', task.taskKind ? 1 : 0.85, task.taskKind ? 'provided directly via task input' : 'derived from operation and task shape'),
        operation: toField(intent.operation, task.operation ? 'explicit' : 'deterministic', task.operation ? 1 : 0.8, 'derived from task description and optional explicit operation'),
        target_layer: toField(intent.target_layer, 'deterministic', 0.7, 'derived from target file and task description'),
        tech_stack: toListField(intent.tech_stack, task.techStack?.length ? 'explicit' : 'deterministic', intent.tech_stack.length ? 0.75 : 0.3, 'derived from file extensions and task description'),
        target_file: intent.target_file
          ? toField(intent.target_file, task.targetFile ? 'explicit' : 'deterministic', task.targetFile ? 1 : 0.65, task.targetFile ? 'provided directly via task input' : 'derived from task description and file hints')
          : unresolvedField('deterministic', 'target file not explicitly provided'),
        changed_files: toListField(intent.changed_files, task.changedFiles?.length ? 'explicit' : 'deterministic', intent.changed_files.length ? 1 : 0.2, 'derived from explicit changed files when available'),
        tags: toListField(intent.tags, task.tags?.length ? 'explicit' : 'deterministic', intent.tags.length ? 0.7 : 0.3, 'derived from task description and target file'),
      },
      context: {
        project_stage: context.project_stage
          ? toField(context.project_stage, task.projectStage ? 'explicit' : 'deterministic', task.projectStage ? 1 : 0.5, task.projectStage ? 'provided directly via task input' : 'not inferred strongly; carried through when available')
          : unresolvedField(task.projectStage ? 'explicit' : 'deterministic', 'project stage not resolved'),
        change_type: toField(context.change_type, task.operation ? 'explicit' : 'deterministic', task.operation ? 1 : 0.8, 'resolved from explicit operation or deterministic operation inference'),
        optimization_target: toField(context.optimization_target, task.optimizationTarget ? 'explicit' : 'deterministic', task.optimizationTarget ? 1 : 0.75, 'derived from task description and operation'),
        hard_constraints: toListField(context.hard_constraints, task.hardConstraints?.length ? 'explicit' : 'deterministic', context.hard_constraints.length ? 0.75 : 0.2, 'derived from explicit constraints or task wording'),
        allowed_tradeoffs: toListField(context.allowed_tradeoffs, task.allowedTradeoffs?.length ? 'explicit' : 'deterministic', context.allowed_tradeoffs.length ? 0.75 : 0.2, 'derived from explicit tradeoffs or task wording'),
        avoid: toListField(context.avoid, task.avoid?.length ? 'explicit' : 'deterministic', context.avoid.length ? 0.75 : 0.2, 'derived from explicit avoid fields or task wording'),
      },
      uncertainties: [
        ...(context.project_stage ? [] : ['project_stage unresolved']),
        ...(intent.target_file ? [] : ['target_file unresolved']),
      ],
    };
  }
}

function toField<T>(value: T, source: 'explicit' | 'deterministic', confidence: number, rationale: string) {
  return { value, source, confidence, status: 'resolved' as const, rationale };
}

function unresolvedField(source: 'explicit' | 'deterministic', rationale: string) {
  return { source, confidence: 0, status: 'unresolved' as const, rationale };
}

function toListField<T>(values: T[], source: 'explicit' | 'deterministic', confidence: number, rationale: string) {
  return {
    values,
    source,
    confidence,
    status: values.length ? 'resolved' as const : 'unresolved' as const,
    rationale,
  };
}
