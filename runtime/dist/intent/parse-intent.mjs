//#region src/intent/parse-intent.ts
const DEFAULT_OPTIMIZATION_TARGET = {
	create: "maintainability",
	modify: "maintainability",
	review: "reviewability",
	refactor: "maintainability",
	bugfix: "safety"
};
/**
* Produces a deterministic task intent from user task input without using an LLM.
*/
function parseIntent(task) {
	const targetFile = task.targetFile?.replace(/\\/g, "/");
	const changedFiles = (task.changedFiles ?? []).map((file) => file.replace(/\\/g, "/"));
	const techStack = [...new Set([...task.techStack ?? [], ...inferTechStackFromFile(targetFile)])];
	const operation = task.operation ?? "modify";
	return {
		task_kind: task.taskKind ?? "code",
		operation,
		target_layer: inferTargetLayer(targetFile),
		tech_stack: techStack,
		target_file: targetFile,
		changed_files: changedFiles,
		tags: [...new Set(task.tags ?? inferTags(targetFile, changedFiles))]
	};
}
function inferTechStackFromFile(targetFile) {
	if (!targetFile) return [];
	if (targetFile.endsWith(".tsx")) return ["typescript", "react"];
	if (targetFile.endsWith(".ts")) return ["typescript"];
	return [];
}
function inferTargetLayer(targetFile) {
	if (!targetFile) return "module";
	if (/(^|\/)(test|tests|spec|specs)(\/|$)|\.(test|spec)\./.test(targetFile)) return "test";
	if (/(^|\/)(api|routes)(\/|$)|\b(handler|endpoint)\b/.test(targetFile)) return "api";
	if (/(^|\/)(store|state)(\/|$)|\.slice\./.test(targetFile)) return "store";
	if (/(^|\/)(components?|views?|pages?)(\/|$)|\.tsx$/.test(targetFile)) return "component";
	if (/(^|\/)(utils?|helpers?|lib)(\/|$)/.test(targetFile)) return "util";
	return "module";
}
function inferTags(targetFile, changedFiles) {
	const inputs = [targetFile, ...changedFiles].filter(Boolean).join(" ");
	const tags = [];
	if (/(^|\/)(test|tests|spec|specs)(\/|$)|\.(test|spec)\./.test(inputs)) tags.push("test");
	return tags;
}
function inferOptimizationTarget(operation) {
	return DEFAULT_OPTIMIZATION_TARGET[operation];
}
function inferHardConstraints() {
	return [];
}
function inferAllowedTradeoffs() {
	return [];
}
function inferAvoid() {
	return [];
}
/**
* Builds the contextual priorities and constraints used alongside task intent.
*/
function buildContextProfile(task, intent) {
	return {
		project_stage: task.projectStage,
		change_type: intent.operation,
		optimization_target: task.optimizationTarget ?? inferOptimizationTarget(intent.operation),
		hard_constraints: [...new Set(task.hardConstraints ?? inferHardConstraints())],
		allowed_tradeoffs: [...new Set(task.allowedTradeoffs ?? inferAllowedTradeoffs())],
		avoid: [...new Set(task.avoid ?? inferAvoid())]
	};
}
//#endregion
export { buildContextProfile, inferTargetLayer, parseIntent };
