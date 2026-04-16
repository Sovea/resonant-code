import { buildContextProfile, parseIntent } from "../intent/parse-intent.mjs";
//#region src/interpret/deterministic-extractor.ts
var DeterministicInterpretationProvider = class {
	source = "deterministic";
	interpret(task) {
		const intent = parseIntent(task);
		const context = buildContextProfile(task, intent);
		return {
			intent: {
				task_kind: toField(intent.task_kind, task.taskKind ? "explicit" : "deterministic", task.taskKind ? 1 : .85, task.taskKind ? "provided directly via task input" : "derived from operation and task shape"),
				operation: toField(intent.operation, task.operation ? "explicit" : "deterministic", task.operation ? 1 : .5, task.operation ? "provided directly via task input" : "neutral deterministic default applied because no explicit operation was provided"),
				target_layer: toField(intent.target_layer, task.targetFile ? "explicit" : "deterministic", task.targetFile ? 1 : .6, task.targetFile ? "derived from explicit target file path" : "fallback module-level layer because no target file was provided"),
				tech_stack: toListField(intent.tech_stack, task.techStack?.length ? "explicit" : "deterministic", task.techStack?.length ? 1 : intent.tech_stack.length ? .55 : .2, task.techStack?.length ? "provided directly via task input" : "derived from explicit target file extension when available"),
				target_file: intent.target_file ? toField(intent.target_file, task.targetFile ? "explicit" : "deterministic", task.targetFile ? 1 : .65, task.targetFile ? "provided directly via task input" : "derived from normalized target file input") : unresolvedField("deterministic", "target file not explicitly provided"),
				changed_files: toListField(intent.changed_files, task.changedFiles?.length ? "explicit" : "deterministic", intent.changed_files.length ? 1 : .2, "derived from explicit changed files when available"),
				tags: toListField(intent.tags, task.tags?.length ? "explicit" : "deterministic", task.tags?.length ? 1 : intent.tags.length ? .55 : .2, task.tags?.length ? "provided directly via task input" : "derived from target file and changed-file test path signals")
			},
			context: {
				project_stage: context.project_stage ? toField(context.project_stage, task.projectStage ? "explicit" : "deterministic", task.projectStage ? 1 : .5, task.projectStage ? "provided directly via task input" : "not inferred strongly; carried through when available") : unresolvedField(task.projectStage ? "explicit" : "deterministic", "project stage not resolved"),
				change_type: toField(context.change_type, task.operation ? "explicit" : "deterministic", task.operation ? 1 : .5, task.operation ? "provided directly via task input" : "mirrors the neutral deterministic operation default"),
				optimization_target: toField(context.optimization_target, task.optimizationTarget ? "explicit" : "deterministic", task.optimizationTarget ? 1 : .55, task.optimizationTarget ? "provided directly via task input" : "stable fallback derived from resolved operation, not free-text policy extraction"),
				hard_constraints: toListField(context.hard_constraints, task.hardConstraints?.length ? "explicit" : "deterministic", task.hardConstraints?.length ? 1 : 0, task.hardConstraints?.length ? "provided directly via task input" : "left unresolved unless explicit constraints are provided"),
				allowed_tradeoffs: toListField(context.allowed_tradeoffs, task.allowedTradeoffs?.length ? "explicit" : "deterministic", task.allowedTradeoffs?.length ? 1 : 0, task.allowedTradeoffs?.length ? "provided directly via task input" : "left unresolved unless explicit tradeoffs are provided"),
				avoid: toListField(context.avoid, task.avoid?.length ? "explicit" : "deterministic", task.avoid?.length ? 1 : 0, task.avoid?.length ? "provided directly via task input" : "left unresolved unless explicit avoid guidance is provided")
			},
			uncertainties: [...context.project_stage ? [] : ["project_stage unresolved"], ...intent.target_file ? [] : ["target_file unresolved"]]
		};
	}
};
function toField(value, source, confidence, rationale) {
	return {
		value,
		source,
		confidence,
		status: "resolved",
		rationale
	};
}
function unresolvedField(source, rationale) {
	return {
		source,
		confidence: 0,
		status: "unresolved",
		rationale
	};
}
function toListField(values, source, confidence, rationale) {
	return {
		values,
		source,
		confidence,
		status: values.length ? "resolved" : "unresolved",
		rationale
	};
}
//#endregion
export { DeterministicInterpretationProvider };
