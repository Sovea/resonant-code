import { buildContextProfile, inferTargetLayer, parseIntent } from '../intent/parse-intent.ts';
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
        operation: toField(intent.operation, task.operation ? 'explicit' : 'deterministic', task.operation ? 1 : 0.5, task.operation ? 'provided directly via task input' : 'neutral deterministic default applied because no explicit operation was provided'),
        target_layer: toField(intent.target_layer, task.targetFile ? 'explicit' : 'deterministic', task.targetFile ? 1 : 0.6, task.targetFile ? 'derived from explicit target file path' : 'fallback module-level layer because no target file was provided'),
        tech_stack: toListField(intent.tech_stack, task.techStack?.length ? 'explicit' : 'deterministic', task.techStack?.length ? 1 : intent.tech_stack.length ? 0.55 : 0.2, task.techStack?.length ? 'provided directly via task input' : 'derived from explicit target file extension when available'),
        target_file: intent.target_file
          ? toField(intent.target_file, task.targetFile ? 'explicit' : 'deterministic', task.targetFile ? 1 : 0.65, task.targetFile ? 'provided directly via task input' : 'derived from normalized target file input')
          : unresolvedField('deterministic', 'target file not explicitly provided'),
        changed_files: toListField(intent.changed_files, task.changedFiles?.length ? 'explicit' : 'deterministic', intent.changed_files.length ? 1 : 0.2, 'derived from explicit changed files when available'),
        tags: toListField(intent.tags, task.tags?.length ? 'explicit' : 'deterministic', task.tags?.length ? 1 : intent.tags.length ? 0.55 : 0.2, task.tags?.length ? 'provided directly via task input' : 'derived from target file and changed-file test path signals'),
      },
      context: {
        project_stage: context.project_stage
          ? toField(context.project_stage, task.projectStage ? 'explicit' : 'deterministic', task.projectStage ? 1 : 0.5, task.projectStage ? 'provided directly via task input' : 'not inferred strongly; carried through when available')
          : unresolvedField(task.projectStage ? 'explicit' : 'deterministic', 'project stage not resolved'),
        change_type: toField(context.change_type, task.operation ? 'explicit' : 'deterministic', task.operation ? 1 : 0.5, task.operation ? 'provided directly via task input' : 'mirrors the neutral deterministic operation default'),
        optimization_target: toField(context.optimization_target, task.optimizationTarget ? 'explicit' : 'deterministic', task.optimizationTarget ? 1 : 0.55, task.optimizationTarget ? 'provided directly via task input' : 'stable fallback derived from resolved operation, not free-text policy extraction'),
        hard_constraints: toListField(context.hard_constraints, task.hardConstraints?.length ? 'explicit' : 'deterministic', task.hardConstraints?.length ? 1 : 0, task.hardConstraints?.length ? 'provided directly via task input' : 'left unresolved unless explicit constraints are provided'),
        allowed_tradeoffs: toListField(context.allowed_tradeoffs, task.allowedTradeoffs?.length ? 'explicit' : 'deterministic', task.allowedTradeoffs?.length ? 1 : 0, task.allowedTradeoffs?.length ? 'provided directly via task input' : 'left unresolved unless explicit tradeoffs are provided'),
        avoid: toListField(context.avoid, task.avoid?.length ? 'explicit' : 'deterministic', task.avoid?.length ? 1 : 0, task.avoid?.length ? 'provided directly via task input' : 'left unresolved unless explicit avoid guidance is provided'),
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
