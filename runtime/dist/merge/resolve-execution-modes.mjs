//#region src/merge/resolve-execution-modes.ts
function resolveExecutionModes(directives, observations, relations, contextProfile) {
	const observationById = new Map(observations.map((observation) => [observation.id, observation]));
	const contextInfluences = [];
	const reviewFocus = [];
	const directiveModes = directives.map((directive) => {
		const linkedRelations = relations.filter((relation) => relation.directive_id === directive.id && relation.relation !== "none");
		const defaultDecision = deriveDirectiveDecision(directive, linkedRelations);
		const decision = applyContextAdjustments(directive, linkedRelations, defaultDecision, contextProfile, contextInfluences);
		if (decision.execution_mode === "deviation-noted") reviewFocus.push({
			kind: "compatibility-boundary",
			directive_id: directive.id,
			reason: decision.reason
		});
		if (directive.prescription === "must" || decision.execution_mode === "deviation-noted" || directive.weight === "critical" && decision.execution_mode === "enforce") reviewFocus.push({
			kind: "high-priority-directive",
			directive_id: directive.id,
			reason: `Review whether ${directive.id} was respected under ${decision.execution_mode} execution mode.`
		});
		return {
			directive_id: directive.id,
			observation_ids: linkedRelations.map((relation) => relation.observation_id),
			execution_mode: decision.execution_mode,
			default_execution_mode: defaultDecision.execution_mode,
			reason: decision.reason,
			decision_basis: decision.decision_basis,
			context_applied: decision.context_applied
		};
	});
	const contextTensions = relations.filter((relation) => relation.relation === "tension").flatMap((relation) => {
		const observation = observationById.get(relation.observation_id);
		const directive = directives.find((item) => item.id === relation.directive_id);
		if (!observation || !directive || directive.prescription !== "must") return [];
		const record = {
			directive_id: directive.id,
			observation_id: observation.id,
			category: observation.category,
			execution_mode: "deviation-noted",
			conflict: `${directive.description} conflicts with observed local pattern: ${observation.pattern}`,
			resolution: buildTensionResolution(directive.id, contextProfile, observation),
			rccl_confidence: observation.verification.induction_confidence ?? observation.verification.evidence_confidence ?? relation.confidence
		};
		reviewFocus.push({
			kind: "tension",
			directive_id: directive.id,
			observation_id: observation.id,
			reason: record.resolution
		});
		return [record];
	});
	for (const relation of relations.filter((item) => item.relation === "anti-pattern-suppress")) reviewFocus.push({
		kind: "anti-pattern",
		directive_id: relation.directive_id,
		observation_id: relation.observation_id,
		reason: relation.reason
	});
	return {
		directive_modes: directiveModes,
		observation_links: observations.map((observation) => ({
			observation_id: observation.id,
			directive_ids: directiveModes.filter((item) => item.observation_ids.includes(observation.id)).map((item) => item.directive_id)
		})),
		context_tensions: contextTensions,
		context_influences: contextInfluences,
		review_focus: uniqueFocus(reviewFocus)
	};
}
function deriveDirectiveDecision(directive, relations) {
	if (directive.type === "anti-pattern") return {
		execution_mode: "suppress",
		reason: "directive is classified as an anti-pattern and should suppress matching behavior",
		decision_basis: "anti-pattern",
		context_applied: []
	};
	if (directive.rccl_immune) return {
		execution_mode: "enforce",
		reason: "directive is marked rccl_immune and should not be downgraded by repository observations",
		decision_basis: "rccl-immune",
		context_applied: []
	};
	const hasTension = relations.some((relation) => relation.relation === "tension");
	if (relations.some((relation) => relation.relation === "anti-pattern-suppress")) return {
		execution_mode: "suppress",
		reason: "anti-pattern observations materially overlap this directive and should suppress matching behavior",
		decision_basis: "anti-pattern",
		context_applied: []
	};
	if (!hasTension) return {
		execution_mode: directive.prescription === "must" ? "enforce" : "ambient",
		reason: "no strong repository tension matched this directive, so default execution behavior applies",
		decision_basis: "default",
		context_applied: []
	};
	return {
		execution_mode: directive.prescription === "must" ? "deviation-noted" : "ambient",
		reason: "repository observations materially overlap this directive, so execution is adjusted to reflect current repository reality",
		decision_basis: "observed-conflict",
		context_applied: []
	};
}
function applyContextAdjustments(directive, relations, defaultDecision, contextProfile, contextInfluences) {
	let decision = {
		...defaultDecision,
		context_applied: [...defaultDecision.context_applied]
	};
	if (contextProfile.optimization_target === "safety" && directive.prescription === "should" && defaultDecision.execution_mode === "ambient" && relations.some((relation) => relation.relation === "tension") && isSafetyRelevantDirective(directive)) {
		decision = {
			execution_mode: "deviation-noted",
			reason: `${defaultDecision.reason} Safety-focused context promotes this guidance from ambient to deviation-noted when repository reality conflicts with correctness- or compatibility-sensitive guidance.`,
			decision_basis: "context-adjusted",
			context_applied: [...decision.context_applied, "optimization_target:safety"]
		};
		contextInfluences.push({
			field: "optimization_target",
			value: contextProfile.optimization_target,
			directive_id: directive.id,
			effect: "promoted directive from ambient to deviation-noted for safety-sensitive guidance under observed conflict"
		});
	} else if (contextProfile.optimization_target === "safety" && directive.prescription === "must" && defaultDecision.execution_mode === "deviation-noted") {
		decision = {
			...decision,
			reason: `${defaultDecision.reason} Safety-focused context preserves stricter enforcement intent even though repository compatibility still requires a deviation-noted posture.`,
			decision_basis: "context-adjusted",
			context_applied: [...decision.context_applied, "optimization_target:safety"]
		};
		contextInfluences.push({
			field: "optimization_target",
			value: contextProfile.optimization_target,
			directive_id: directive.id,
			effect: "reinforced stricter enforcement intent for a must directive already in deviation-noted mode"
		});
	}
	if (hasConstraint(contextProfile.hard_constraints, [
		"preserve compatibility",
		"avoid breaking changes",
		"preserve public api"
	]) && directive.prescription === "must" && decision.execution_mode === "enforce" && relations.some((relation) => relation.relation === "tension")) {
		decision = {
			execution_mode: "deviation-noted",
			reason: `${decision.reason} Explicit compatibility constraints shift execution to deviation-noted because legacy or migration realities must be preserved at touched interfaces.`,
			decision_basis: "context-adjusted",
			context_applied: [...decision.context_applied, "hard_constraints:compatibility"]
		};
		contextInfluences.push({
			field: "hard_constraints",
			value: "preserve compatibility",
			directive_id: directive.id,
			effect: "changed execution from enforce to deviation-noted to respect compatibility-sensitive repository observations"
		});
	}
	if (hasConstraint(contextProfile.allowed_tradeoffs, ["prefer narrow change scope"]) && directive.prescription === "should" && isBroadDirective(directive)) {
		decision = {
			...decision,
			execution_mode: "ambient",
			reason: `${decision.reason} Narrow-scope tradeoff guidance keeps broad architectural or refactor-oriented guidance ambient for this task.`,
			decision_basis: "context-adjusted",
			context_applied: [...decision.context_applied, "allowed_tradeoffs:prefer narrow change scope"]
		};
		contextInfluences.push({
			field: "allowed_tradeoffs",
			value: "prefer narrow change scope",
			directive_id: directive.id,
			effect: "kept broad should-level guidance ambient to avoid widening the change scope"
		});
	}
	if (hasConstraint(contextProfile.avoid, ["broad rewrites", "overengineering"]) && directive.prescription === "should" && isBroadDirective(directive)) {
		decision = {
			...decision,
			execution_mode: "ambient",
			reason: `${decision.reason} Avoiding broad rewrites or overengineering keeps expansive guidance ambient unless it is already a must-level requirement.`,
			decision_basis: "context-adjusted",
			context_applied: [...decision.context_applied, "avoid:broad rewrites"]
		};
		contextInfluences.push({
			field: "avoid",
			value: "broad rewrites",
			directive_id: directive.id,
			effect: "prevented broad should-level guidance from becoming more assertive in a narrowly scoped task"
		});
	}
	return decision;
}
function buildTensionResolution(directiveId, contextProfile, observation) {
	if (hasConstraint(contextProfile.hard_constraints, [
		"preserve compatibility",
		"avoid breaking changes",
		"preserve public api"
	])) return `Follow ${directiveId} for new code, but preserve compatibility with the observed ${observation.category} repository pattern at touched interfaces.`;
	if (hasConstraint(contextProfile.allowed_tradeoffs, ["prefer narrow change scope"])) return `Follow ${directiveId} for the touched code, but contain the change to the local boundary instead of broad cleanup around the observed repository pattern.`;
	if (hasConstraint(contextProfile.avoid, ["broad rewrites", "overengineering"])) return `Follow ${directiveId} in the local change, but avoid turning this tension into a broad rewrite of the observed repository pattern.`;
	return `Follow ${directiveId} for new code, but preserve compatibility with the observed repository pattern where interfaces depend on it.`;
}
function hasConstraint(values, expected) {
	return expected.some((item) => values.includes(item));
}
function isSafetyRelevantDirective(directive) {
	return /(safe|safety|correct|correctness|compatib|breaking|public api|regression|constraint|migration)/i.test(`${directive.description} ${directive.rationale}`);
}
function isBroadDirective(directive) {
	if (directive.type === "architecture") return true;
	return /(architecture|restructure|rewrite|broad|cross-cutting|shared abstraction|generalize|framework)/i.test(`${directive.description} ${directive.rationale}`);
}
function uniqueFocus(items) {
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	for (const item of items) {
		const key = `${item.kind}:${item.directive_id ?? ""}:${item.observation_id ?? ""}:${item.reason}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(item);
	}
	return result;
}
//#endregion
export { resolveExecutionModes };
