//#region src/ir/execution/resolve-execution.ts
function resolveExecutionDecisionsIR(bundle, relations) {
	const relationsByDirective = groupEffectiveRelations(relations);
	return bundle.directives.map((directive) => {
		const linkedRelations = relationsByDirective.get(directive.id) ?? [];
		const defaultDecision = deriveDirectiveDecision(directive, linkedRelations);
		const decision = applyContextAdjustments(directive, linkedRelations, defaultDecision, bundle.task.context);
		return {
			directiveId: directive.id,
			mode: decision.mode,
			defaultMode: defaultDecision.mode,
			basis: decision.basis,
			relationIds: linkedRelations.map((relation) => relation.id),
			contextApplied: decision.contextApplied,
			feedbackApplied: feedbackSignalsForDirective(bundle, directive.id),
			reason: decision.reason
		};
	});
}
function groupEffectiveRelations(relations) {
	const grouped = /* @__PURE__ */ new Map();
	for (const relation of relations) {
		if (relation.adjudication.status === "rejected") continue;
		if (relation.adjudication.finalRelation === "unrelated") continue;
		const current = grouped.get(relation.directiveId) ?? [];
		current.push(relation);
		grouped.set(relation.directiveId, current);
	}
	return grouped;
}
function deriveDirectiveDecision(directive, relations) {
	if (directive.kind === "anti-pattern") return {
		mode: "suppress",
		reason: "directive is classified as an anti-pattern and should suppress matching behavior",
		basis: "anti-pattern",
		contextApplied: []
	};
	if (directive.traits.rcclImmune) return {
		mode: "enforce",
		reason: "directive is marked rccl_immune and should not be downgraded by repository observations",
		basis: "verification",
		contextApplied: []
	};
	const hasTension = relations.some((relation) => relation.adjudication.finalRelation === "tension");
	if (relations.some((relation) => relation.adjudication.finalRelation === "suppress")) return {
		mode: "suppress",
		reason: "anti-pattern observations materially overlap this directive and should suppress matching behavior",
		basis: "anti-pattern",
		contextApplied: []
	};
	if (!hasTension) return {
		mode: directive.prescription === "must" ? "enforce" : "ambient",
		reason: "no strong repository tension matched this directive, so default execution behavior applies",
		basis: "prescription",
		contextApplied: []
	};
	return {
		mode: directive.prescription === "must" ? "deviation-noted" : "ambient",
		reason: "repository observations materially overlap this directive, so execution is adjusted to reflect current repository reality",
		basis: "semantic-relation",
		contextApplied: []
	};
}
function applyContextAdjustments(directive, relations, defaultDecision, context) {
	let decision = {
		...defaultDecision,
		contextApplied: [...defaultDecision.contextApplied]
	};
	const hasTension = relations.some((relation) => relation.adjudication.finalRelation === "tension");
	if (context.optimization_target === "safety" && directive.prescription === "should" && defaultDecision.mode === "ambient" && hasTension && isCompatibilitySensitiveDirective(directive)) decision = {
		mode: "deviation-noted",
		reason: `${defaultDecision.reason} Safety-focused context promotes compatibility-sensitive guidance from ambient to deviation-noted when repository reality conflicts with it.`,
		basis: "task-context",
		contextApplied: [...decision.contextApplied, "optimization_target:safety"]
	};
	else if (context.optimization_target === "safety" && directive.prescription === "must" && defaultDecision.mode === "deviation-noted") decision = {
		...decision,
		reason: `${defaultDecision.reason} Safety-focused context preserves stricter enforcement intent even though repository compatibility still requires a deviation-noted posture.`,
		basis: "task-context",
		contextApplied: [...decision.contextApplied, "optimization_target:safety"]
	};
	if (hasConstraint(context.hard_constraints, [
		"preserve compatibility",
		"avoid breaking changes",
		"preserve public api"
	]) && directive.prescription === "must" && decision.mode === "enforce" && hasTension) decision = {
		mode: "deviation-noted",
		reason: `${decision.reason} Explicit compatibility constraints shift execution to deviation-noted because legacy or migration realities must be preserved at touched interfaces.`,
		basis: "task-context",
		contextApplied: [...decision.contextApplied, "hard_constraints:compatibility"]
	};
	if (hasConstraint(context.allowed_tradeoffs, ["prefer narrow change scope"]) && directive.prescription === "should" && directive.traits.broadScope) decision = {
		...decision,
		mode: "ambient",
		reason: `${decision.reason} Narrow-scope tradeoff guidance keeps broad architectural guidance ambient for this task.`,
		basis: "task-context",
		contextApplied: [...decision.contextApplied, "allowed_tradeoffs:prefer narrow change scope"]
	};
	if (hasConstraint(context.avoid, ["broad rewrites", "overengineering"]) && directive.prescription === "should" && directive.traits.broadScope) decision = {
		...decision,
		mode: "ambient",
		reason: `${decision.reason} Avoiding broad rewrites or overengineering keeps expansive guidance ambient unless it is already a must-level requirement.`,
		basis: "task-context",
		contextApplied: [...decision.contextApplied, "avoid:broad rewrites"]
	};
	return decision;
}
function isCompatibilitySensitiveDirective(directive) {
	return directive.traits.compatibilitySensitive || directive.traits.rcclImmune || directive.prescription === "must";
}
function hasConstraint(values, expected) {
	return expected.some((item) => values.includes(item));
}
function feedbackSignalsForDirective(bundle, directiveId) {
	return bundle.feedback.directiveSignals.filter((signal) => signal.directiveId === directiveId).flatMap((signal) => {
		const effects = [];
		if (signal.followRate < .5) effects.push("feedback:frequently-ignored");
		if (signal.trend === "degrading") effects.push("feedback:degrading");
		return effects;
	});
}
//#endregion
export { resolveExecutionDecisionsIR };
