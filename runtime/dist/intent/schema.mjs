//#region src/intent/schema.ts
const TASK_KINDS = [
	"code",
	"review",
	"analysis",
	"migration"
];
const OPERATIONS = [
	"create",
	"modify",
	"review",
	"refactor",
	"bugfix"
];
const PROJECT_STAGES = [
	"prototype",
	"growth",
	"stable",
	"critical"
];
const OPTIMIZATION_TARGETS = [
	"speed",
	"maintainability",
	"safety",
	"simplicity",
	"reviewability"
];
const RISK_LEVELS = [
	"low",
	"medium",
	"high",
	"critical"
];
const SCOPE_SIZES = [
	"single-file",
	"module",
	"cross-cutting",
	"unknown"
];
const COMPATIBILITY_REQUIREMENTS = [
	"none",
	"preserve-behavior",
	"preserve-api",
	"migration-compatible",
	"breaking-allowed"
];
const INTERFACE_SENSITIVITIES = [
	"internal",
	"public-api",
	"persistence",
	"external-integration",
	"auth-security",
	"unknown"
];
const REFACTOR_TOLERANCES = [
	"none",
	"local-only",
	"bounded",
	"broad"
];
const MIGRATION_PHASES = [
	"none",
	"preparation",
	"dual-run",
	"cutover",
	"cleanup"
];
const REVIEW_GOALS = [
	"correctness",
	"regression-risk",
	"architecture-fit",
	"maintainability",
	"security",
	"performance"
];
const TASK_INTERPRETATION_SOURCES = ["host-agent", "assistive-ai"];
const TASK_INTERPRETATION_ENUMS = {
	intent: {
		task_kind: TASK_KINDS,
		operation: OPERATIONS
	},
	context: {
		project_stage: PROJECT_STAGES,
		change_type: OPERATIONS,
		optimization_target: OPTIMIZATION_TARGETS,
		risk_level: RISK_LEVELS,
		scope_size: SCOPE_SIZES,
		compatibility_requirement: COMPATIBILITY_REQUIREMENTS,
		interface_sensitivity: INTERFACE_SENSITIVITIES,
		refactor_tolerance: REFACTOR_TOLERANCES,
		migration_phase: MIGRATION_PHASES,
		review_goal: REVIEW_GOALS
	}
};
const TASK_INPUT_ENUMS = {
	operation: OPERATIONS,
	taskKind: TASK_KINDS,
	projectStage: PROJECT_STAGES,
	optimizationTarget: OPTIMIZATION_TARGETS,
	riskLevel: RISK_LEVELS,
	scopeSize: SCOPE_SIZES,
	compatibilityRequirement: COMPATIBILITY_REQUIREMENTS,
	interfaceSensitivity: INTERFACE_SENSITIVITIES,
	refactorTolerance: REFACTOR_TOLERANCES,
	migrationPhase: MIGRATION_PHASES,
	reviewGoal: REVIEW_GOALS
};
function enumValue(value, allowedValues) {
	return typeof value === "string" && allowedValues.includes(value) ? value : void 0;
}
function hasEnumValue(value, allowedValues) {
	return enumValue(value, allowedValues) !== void 0;
}
//#endregion
export { COMPATIBILITY_REQUIREMENTS, INTERFACE_SENSITIVITIES, MIGRATION_PHASES, OPERATIONS, OPTIMIZATION_TARGETS, PROJECT_STAGES, REFACTOR_TOLERANCES, REVIEW_GOALS, RISK_LEVELS, SCOPE_SIZES, TASK_INPUT_ENUMS, TASK_INTERPRETATION_ENUMS, TASK_INTERPRETATION_SOURCES, TASK_KINDS, enumValue, hasEnumValue };
