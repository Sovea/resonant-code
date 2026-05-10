import { TASK_INTERPRETATION_ENUMS, TASK_INTERPRETATION_SOURCES } from "../intent/schema.mjs";
import { buildContractPayloadDiagnostics } from "./diagnostics.mjs";
//#region src/ai-contracts/task-interpretation.ts
function prepareTaskInterpretationContract(input) {
	const { task, candidatePath } = input;
	const schema = buildTaskCandidateSchema();
	const prompt = buildInterpretationPrompt(task);
	const ambiguityHints = buildAmbiguityHints(task);
	const recommendation = buildInterpretationRecommendation(ambiguityHints, candidatePath);
	const candidateArtifact = {
		suggestedPath: candidatePath,
		format: "json",
		usage: `Write a single candidate object or an array of candidates to ${candidatePath}, then pass --candidate-file ${candidatePath} to prepare.`
	};
	return {
		task,
		interpretationPrompt: prompt,
		taskSchema: JSON.stringify(schema, null, 2),
		ambiguityHints,
		recommendation,
		candidateArtifact,
		clarificationHints: buildClarificationHints(task, ambiguityHints),
		contract: {
			contractVersion: "ai-contract/v1",
			kind: "task-interpretation",
			schemaId: "runtime.task-interpretation-candidate",
			schemaVersion: "1.0",
			prompt,
			schema,
			artifact: candidateArtifact,
			provenance: {
				owner: "runtime",
				deterministic: true
			},
			cacheKeyMaterial: {
				task,
				schemaId: "runtime.task-interpretation-candidate"
			}
		}
	};
}
function parseTaskInterpretationCandidatePayloadWithDiagnostics(raw) {
	const values = raw === void 0 || raw === null ? [] : Array.isArray(raw) ? raw : [raw];
	const entries = [];
	const candidates = [];
	values.forEach((value, index) => {
		const path = Array.isArray(raw) ? `candidates[${index}]` : "candidate";
		if (!isParsedTaskCandidate(value)) {
			entries.push({
				status: "rejected",
				reason: value === void 0 || value === null ? "empty-payload" : "malformed-payload",
				path,
				message: "Task interpretation candidate must include intent, context, and uncertainties fields."
			});
			return;
		}
		candidates.push(value);
		entries.push({
			status: "accepted",
			reason: "accepted",
			path,
			message: "Task interpretation candidate accepted for Runtime adjudication."
		});
	});
	if (!values.length) entries.push({
		status: "unused",
		reason: "empty-payload",
		path: "candidate",
		message: "No task interpretation candidate payload was provided."
	});
	return {
		candidates,
		diagnostics: buildContractPayloadDiagnostics("task-interpretation", entries)
	};
}
function parseTaskInterpretationCandidatePayload(raw) {
	return parseTaskInterpretationCandidatePayloadWithDiagnostics(raw).candidates;
}
function isParsedTaskCandidate(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value;
	return isRecord(candidate.intent) && isRecord(candidate.context) && Array.isArray(candidate.uncertainties) && candidate.uncertainties.every((item) => typeof item === "string");
}
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function buildTaskCandidateSchema() {
	const candidateSchema = buildSingleTaskCandidateSchema();
	return { anyOf: [candidateSchema, {
		type: "array",
		items: candidateSchema
	}] };
}
function buildSingleTaskCandidateSchema() {
	return {
		type: "object",
		additionalProperties: false,
		properties: {
			intent: {
				type: "object",
				additionalProperties: false,
				properties: {
					task_kind: fieldSchema(TASK_INTERPRETATION_ENUMS.intent.task_kind),
					operation: fieldSchema(TASK_INTERPRETATION_ENUMS.intent.operation),
					target_layer: fieldSchema(),
					tech_stack: listFieldSchema(),
					target_file: fieldSchema(),
					changed_files: listFieldSchema(),
					tags: listFieldSchema()
				}
			},
			context: {
				type: "object",
				additionalProperties: false,
				properties: {
					project_stage: fieldSchema(TASK_INTERPRETATION_ENUMS.context.project_stage),
					change_type: fieldSchema(TASK_INTERPRETATION_ENUMS.context.change_type),
					optimization_target: fieldSchema(TASK_INTERPRETATION_ENUMS.context.optimization_target),
					hard_constraints: listFieldSchema(),
					allowed_tradeoffs: listFieldSchema(),
					avoid: listFieldSchema(),
					risk_level: fieldSchema(TASK_INTERPRETATION_ENUMS.context.risk_level),
					scope_size: fieldSchema(TASK_INTERPRETATION_ENUMS.context.scope_size),
					compatibility_requirement: fieldSchema(TASK_INTERPRETATION_ENUMS.context.compatibility_requirement),
					interface_sensitivity: fieldSchema(TASK_INTERPRETATION_ENUMS.context.interface_sensitivity),
					refactor_tolerance: fieldSchema(TASK_INTERPRETATION_ENUMS.context.refactor_tolerance),
					migration_phase: fieldSchema(TASK_INTERPRETATION_ENUMS.context.migration_phase),
					review_goal: fieldSchema(TASK_INTERPRETATION_ENUMS.context.review_goal)
				}
			},
			uncertainties: {
				type: "array",
				items: { type: "string" }
			}
		},
		required: [
			"intent",
			"context",
			"uncertainties"
		]
	};
}
function fieldSchema(enumValues) {
	return {
		type: "object",
		additionalProperties: false,
		properties: {
			value: enumValues ? { enum: Array.from(enumValues) } : { type: "string" },
			source: { enum: Array.from(TASK_INTERPRETATION_SOURCES) },
			confidence: { type: "number" },
			status: { enum: ["resolved", "unresolved"] },
			rationale: { type: "string" }
		},
		required: [
			"source",
			"confidence",
			"status"
		]
	};
}
function listFieldSchema() {
	return {
		type: "object",
		additionalProperties: false,
		properties: {
			values: {
				type: "array",
				items: { type: "string" }
			},
			source: { enum: Array.from(TASK_INTERPRETATION_SOURCES) },
			confidence: { type: "number" },
			status: { enum: ["resolved", "unresolved"] },
			rationale: { type: "string" }
		},
		required: [
			"values",
			"source",
			"confidence",
			"status"
		]
	};
}
function buildInterpretationRecommendation(ambiguityHints, candidatePath) {
	const shouldUseHostCandidate = ambiguityHints.length > 0;
	return {
		shouldUseHostCandidate,
		reason: shouldUseHostCandidate ? `Host-agent candidate recommended because ${ambiguityHints.join("; ")}.` : "Host-agent candidate is optional because the task already carries concrete operational signals.",
		nextStep: shouldUseHostCandidate ? `Generate a candidate JSON file at ${candidatePath} before running prepare.` : "You can run prepare directly, or still provide a candidate file if you want richer task interpretation."
	};
}
function buildClarificationHints(task, ambiguityHints) {
	const hints = [];
	if (ambiguityHints.includes("operation is not explicit")) hints.push("Clarify whether this is create, modify, bugfix, refactor, or review work.");
	if (ambiguityHints.includes("no concrete target files are specified")) hints.push("Name the target file or likely changed files if they are known.");
	if (ambiguityHints.includes("tech stack is implicit")) hints.push("State the relevant language, framework, or subsystem when it is not obvious from the file path.");
	if (ambiguityHints.includes("project stage is not specified")) hints.push("State whether the project area is prototype, growth, stable, or critical if that affects tradeoffs.");
	if (!task.optimizationTarget) hints.push("Specify the optimization target when the tradeoff matters, such as safety, simplicity, or reviewability.");
	return hints;
}
function buildInterpretationPrompt(task) {
	return [
		"Produce a structured task interpretation candidate for Runtime.",
		"Only resolve fields when the task gives enough evidence; otherwise mark them unresolved.",
		"Use source=\"host-agent\" for every resolved or unresolved field you return.",
		"Do not invent target files, changed files, or tech stack without evidence.",
		"Prefer semantic task understanding for risk_level, compatibility_requirement, interface_sensitivity, migration_phase, and review_goal; Runtime will validate and adjudicate the result.",
		`Task description: ${task.description}`,
		`Explicit operation: ${task.operation ?? "(none)"}`,
		`Explicit target file: ${task.targetFile ?? "(none)"}`,
		`Explicit changed files: ${task.changedFiles?.join(", ") || "(none)"}`,
		`Explicit tech stack: ${task.techStack?.join(", ") || "(none)"}`,
		`Explicit tags: ${task.tags?.join(", ") || "(none)"}`,
		`Explicit project stage: ${task.projectStage ?? "(none)"}`,
		`Explicit optimization target: ${task.optimizationTarget ?? "(none)"}`,
		`Explicit hard constraints: ${task.hardConstraints?.join(", ") || "(none)"}`,
		`Explicit allowed tradeoffs: ${task.allowedTradeoffs?.join(", ") || "(none)"}`,
		`Explicit avoid: ${task.avoid?.join(", ") || "(none)"}`,
		`Explicit risk level: ${task.riskLevel ?? "(none)"}`,
		`Explicit scope size: ${task.scopeSize ?? "(none)"}`,
		`Explicit compatibility requirement: ${task.compatibilityRequirement ?? "(none)"}`,
		`Explicit interface sensitivity: ${task.interfaceSensitivity ?? "(none)"}`,
		`Explicit refactor tolerance: ${task.refactorTolerance ?? "(none)"}`,
		`Explicit migration phase: ${task.migrationPhase ?? "(none)"}`,
		`Explicit review goal: ${task.reviewGoal ?? "(none)"}`
	].join("\n");
}
function buildAmbiguityHints(task) {
	const hints = [];
	if (!task.operation) hints.push("operation is not explicit");
	if (!task.targetFile && !task.changedFiles?.length) hints.push("no concrete target files are specified");
	if (!task.techStack?.length) hints.push("tech stack is implicit");
	if (!task.projectStage) hints.push("project stage is not specified");
	return hints;
}
//#endregion
export { parseTaskInterpretationCandidatePayload, parseTaskInterpretationCandidatePayloadWithDiagnostics, prepareTaskInterpretationContract };
