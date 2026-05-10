import { resolveTask } from "./interpret/normalize-candidate.mjs";
//#region src/compile-input.ts
function hasResolvedTask(input) {
	return "resolvedTask" in input;
}
function resolveCompileTask(input) {
	if (hasResolvedTask(input)) return input.resolvedTask;
	return resolveTask({
		task: input.task,
		candidates: input.parsedTaskCandidate ? [input.parsedTaskCandidate] : [],
		interpretationMode: input.interpretationMode
	});
}
function toResolvedCompileInput(input) {
	if (hasResolvedTask(input)) return input;
	const { task: _task, parsedTaskCandidate: _parsedTaskCandidate, interpretationMode: _interpretationMode, ...base } = input;
	return {
		...base,
		resolvedTask: resolveCompileTask(input)
	};
}
//#endregion
export { hasResolvedTask, resolveCompileTask, toResolvedCompileInput };
