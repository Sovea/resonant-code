//#region src/intent/parse-intent.ts
/**
* Produces a deterministic task intent from user task input without using an LLM.
*/
function parseIntent(task) {
	const description = task.description.toLowerCase();
	const targetFile = task.targetFile?.replace(/\\/g, "/");
	const changedFiles = (task.changedFiles ?? []).map((file) => file.replace(/\\/g, "/"));
	const techStack = [...new Set([
		...task.techStack ?? [],
		...targetFile?.endsWith(".ts") || targetFile?.endsWith(".tsx") ? ["typescript"] : [],
		...description.includes("react") || targetFile?.endsWith(".tsx") ? ["react"] : []
	])];
	const operation = task.operation ?? inferOperation(description);
	return {
		task_kind: task.taskKind ?? "code",
		operation,
		target_layer: inferTargetLayer(targetFile, description),
		tech_stack: techStack,
		target_file: targetFile,
		changed_files: changedFiles,
		tags: [...new Set(task.tags ?? inferTags(description, targetFile))]
	};
}
/**
* Builds the contextual priorities and constraints used alongside task intent.
*/
function buildContextProfile(task, intent) {
	const description = task.description.toLowerCase();
	return {
		project_stage: task.projectStage,
		change_type: intent.operation,
		optimization_target: task.optimizationTarget ?? inferOptimizationTarget(description, intent.operation),
		hard_constraints: [...new Set(task.hardConstraints ?? inferHardConstraints(description))],
		allowed_tradeoffs: [...new Set(task.allowedTradeoffs ?? inferAllowedTradeoffs(description, intent.operation))],
		avoid: [...new Set(task.avoid ?? inferAvoid(description))]
	};
}
function inferOptimizationTarget(description, operation) {
	if (/(secure|safety|risk|regression|correctness)/.test(description)) return "safety";
	if (/(review|easy to review|readable)/.test(description)) return "reviewability";
	if (/(simple|minimal|smallest)/.test(description)) return "simplicity";
	if (/(performance|fast|speed)/.test(description)) return "speed";
	if (operation === "refactor") return "maintainability";
	if (operation === "bugfix") return "safety";
	return "maintainability";
}
function inferHardConstraints(description) {
	const constraints = [];
	if (/(backward compatible|compatibility)/.test(description)) constraints.push("preserve compatibility");
	if (/(no breaking change|don't break|do not break)/.test(description)) constraints.push("avoid breaking changes");
	if (/(keep api|preserve api)/.test(description)) constraints.push("preserve public api");
	return constraints;
}
function inferAllowedTradeoffs(description, operation) {
	const tradeoffs = [];
	if (/(minimal|minimize|smallest)/.test(description)) tradeoffs.push("prefer narrow change scope");
	if (/(temporary|tactical)/.test(description)) tradeoffs.push("allow tactical compromise");
	if (operation === "bugfix") tradeoffs.push("prefer local fix over broad refactor");
	return tradeoffs;
}
function inferAvoid(description) {
	const avoid = [];
	if (/(rewrite|large refactor|big refactor)/.test(description)) avoid.push("broad rewrites");
	if (/(overengineer|over-engineer)/.test(description)) avoid.push("overengineering");
	return avoid;
}
/**
* Infers the primary operation when the task does not specify one explicitly.
*/
function inferOperation(description) {
	if (/(review|audit|inspect)/.test(description)) return "review";
	if (/(bug|fix|regression|broken)/.test(description)) return "bugfix";
	if (/(refactor|cleanup|restructure)/.test(description)) return "refactor";
	if (/(create|add|implement|build|new)/.test(description)) return "create";
	return "modify";
}
function inferTargetLayer(targetFile, description) {
	const input = `${targetFile ?? ""} ${description}`;
	if (/(test|spec)/.test(input)) return "test";
	if (/(api|route|handler|endpoint)/.test(input)) return "api";
	if (/(store|state|slice)/.test(input)) return "store";
	if (/(component|tsx|view|page)/.test(input)) return "component";
	if (/(util|helper|lib)/.test(input)) return "util";
	return "module";
}
function inferTags(description, targetFile) {
	const value = `${description} ${targetFile ?? ""}`;
	const tags = [];
	if (/async|promise|await/.test(value)) tags.push("async");
	if (/form/.test(value)) tags.push("form");
	if (/fetch|query|api/.test(value)) tags.push("data-fetching");
	if (/test|spec/.test(value)) tags.push("test");
	return tags;
}
//#endregion
export { buildContextProfile, inferOperation, parseIntent };
