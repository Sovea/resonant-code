//#region src/ai-contracts/semantic-relations.ts
const HOST_SEMANTIC_RELATION_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: { relations: {
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			properties: {
				directive_id: { type: "string" },
				observation_id: { type: "string" },
				relation: { enum: [
					"reinforce",
					"tension",
					"suppress",
					"ambient-only",
					"unrelated"
				] },
				confidence: {
					type: "number",
					minimum: 0,
					maximum: 1
				},
				reason: { type: "string" },
				conflict_class: { enum: [
					"compatibility-boundary",
					"migration-tension",
					"local-deviation",
					"legacy-interface",
					"anti-pattern",
					"scope-mismatch",
					"style-drift",
					"architecture-drift"
				] },
				impact: { enum: [
					"execution-mode",
					"review-focus",
					"ambient-context",
					"no-effect"
				] },
				review_priority: { enum: [
					"low",
					"normal",
					"high",
					"critical"
				] },
				merge_intent: { type: "string" },
				group_id: { type: "string" },
				evidence_refs: {
					type: "array",
					items: { type: "string" }
				},
				signals: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { enum: [
								"semantic-key",
								"category",
								"scope",
								"verification",
								"lifecycle",
								"feedback",
								"host-proposal"
							] },
							strength: { enum: [
								"weak",
								"moderate",
								"strong"
							] },
							direction: { enum: [
								"reinforce",
								"tension",
								"suppress",
								"ambient",
								"neutral"
							] },
							reason: { type: "string" }
						},
						required: [
							"kind",
							"strength",
							"direction",
							"reason"
						]
					}
				}
			},
			required: [
				"directive_id",
				"observation_id",
				"relation",
				"confidence",
				"reason"
			]
		}
	} },
	required: ["relations"]
};
const HOST_SEMANTIC_CANDIDATE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: { candidates: {
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			properties: {
				directive_id: { type: "string" },
				observation_id: { type: "string" },
				relation_hint: { enum: [
					"reinforce",
					"tension",
					"ambient-only",
					"unknown"
				] },
				confidence: {
					type: "number",
					minimum: 0,
					maximum: 1
				},
				reason: { type: "string" },
				impact: { enum: [
					"execution-mode",
					"review-focus",
					"ambient-context",
					"no-effect"
				] },
				review_priority: { enum: [
					"low",
					"normal",
					"high",
					"critical"
				] },
				merge_intent: { type: "string" },
				group_id: { type: "string" },
				evidence_refs: {
					type: "array",
					items: { type: "string" }
				}
			},
			required: [
				"directive_id",
				"observation_id",
				"relation_hint",
				"confidence",
				"reason"
			]
		}
	} },
	required: ["candidates"]
};
function prepareSemanticRelationContract(input) {
	const prompt = buildRelationProposalPrompt(input);
	const artifact = {
		suggestedPath: input.artifactPath,
		format: "json",
		usage: `Write the semantic relation proposal payload to ${input.artifactPath}, then pass --host-proposal-file ${input.artifactPath} to prepare.`
	};
	return {
		proposalPrompt: prompt,
		proposalSchema: JSON.stringify(HOST_SEMANTIC_RELATION_SCHEMA, null, 2),
		proposalArtifact: artifact,
		contract: {
			contractVersion: "ai-contract/v1",
			kind: "semantic-relation",
			schemaId: "runtime.host-semantic-relation-proposal",
			schemaVersion: "1.0",
			prompt,
			schema: HOST_SEMANTIC_RELATION_SCHEMA,
			artifact,
			allowedIds: allowedIds(input),
			provenance: {
				owner: "runtime",
				deterministic: true
			},
			cacheKeyMaterial: semanticCacheKeyMaterial(input, "semantic-relation")
		}
	};
}
function prepareSemanticCandidateContract(input) {
	const prompt = buildSemanticCandidatePrompt(input);
	const artifact = {
		suggestedPath: input.artifactPath,
		format: "json",
		usage: `Write the semantic candidate payload to ${input.artifactPath}, then pass --semantic-proposal-file ${input.artifactPath} to prepare.`
	};
	return {
		candidatePrompt: prompt,
		candidateSchema: JSON.stringify(HOST_SEMANTIC_CANDIDATE_SCHEMA, null, 2),
		candidateArtifact: artifact,
		contract: {
			contractVersion: "ai-contract/v1",
			kind: "semantic-candidate",
			schemaId: "runtime.host-semantic-candidate-proposal",
			schemaVersion: "1.0",
			prompt,
			schema: HOST_SEMANTIC_CANDIDATE_SCHEMA,
			artifact,
			allowedIds: allowedIds(input),
			provenance: {
				owner: "runtime",
				deterministic: true
			},
			cacheKeyMaterial: semanticCacheKeyMaterial(input, "semantic-candidate")
		}
	};
}
function loadSemanticRelationProposalPayload(raw, source) {
	return {
		irVersion: "governance-ir/v1",
		source: {
			kind: "host-proposal",
			id: source.id,
			...source.path ? { path: source.path } : {}
		},
		kind: "semantic-relation",
		payload: Array.isArray(raw) ? { relations: raw } : raw
	};
}
function loadSemanticCandidateProposalPayload(raw, source) {
	return {
		irVersion: "governance-ir/v1",
		source: {
			kind: "host-proposal",
			id: source.id,
			...source.path ? { path: source.path } : {}
		},
		kind: "semantic-candidate",
		payload: Array.isArray(raw) ? { candidates: raw } : raw
	};
}
function buildRelationProposalPrompt(input) {
	return [
		"Produce a HostSemanticRelationProposalPayload JSON object for Runtime.",
		"Use only directive_id values and observation_id values listed in this prepare-relations output.",
		"Propose a relation only when the observation materially affects how the directive should execute for this task.",
		"Use relation=\"reinforce\" when repository reality supports following the directive.",
		"Use relation=\"tension\" when repository reality conflicts with the directive but new work should still account for both.",
		"Use relation=\"suppress\" only when an anti-pattern observation should suppress a directive in this task scope.",
		"Use relation=\"ambient-only\" for relevant background that should not change execution mode.",
		"Use relation=\"unrelated\" sparingly; omit weak pairs instead of listing them as unrelated.",
		"When useful, set impact to execution-mode, review-focus, ambient-context, or no-effect.",
		"When useful, set review_priority to low, normal, high, or critical based on review risk; this does not decide execution mode.",
		"When useful, include merge_intent as one short sentence explaining how Runtime should consider the relation.",
		"Use group_id only to connect closely related relations from the same task-level judgment.",
		"Do not infer relations from ids alone; base every relation on the task, directive description, observation pattern, verification, lifecycle, and evidence refs.",
		"Return only JSON matching proposalSchema.",
		`Resolved task intent: ${JSON.stringify(input.resolvedTask.task_intent)}`,
		`Resolved context profile: ${JSON.stringify(input.resolvedTask.context_profile)}`,
		`Directive count: ${input.directives.length}`,
		`Observation count: ${input.observations.length}`
	].join("\n");
}
function buildSemanticCandidatePrompt(input) {
	return [
		"Produce a HostSemanticCandidateProposalPayload JSON object for Runtime.",
		"This is a semantic proposer artifact: use host-agent semantic judgment to shortlist likely directive/observation pairs, but do not decide final execution.",
		"Runtime will validate IDs, confidence, scope, RCCL verification, lifecycle, feedback policy, and final adjudication deterministically.",
		"Use only directive_id values and observation_id values listed in this output.",
		"Use relation_hint=\"reinforce\" when the observation likely supports the directive.",
		"Use relation_hint=\"tension\" when the observation likely conflicts with the directive or requires deviation-noted handling.",
		"Use relation_hint=\"ambient-only\" when the observation is relevant background but should not change execution mode.",
		"Use relation_hint=\"unknown\" when the semantic relation is plausible but impact is not clear; Runtime will keep it ambient.",
		"Do not propose suppress here; use prepare-relations only for an explicit anti-pattern suppress proposal.",
		"Use confidence >= 0.72 only when the task, directive, observation pattern, verification/lifecycle, and evidence refs support the candidate.",
		"When useful, set impact, review_priority, merge_intent, and group_id. These are advisory fields and Runtime may ignore malformed values.",
		"Return only JSON matching candidateSchema.",
		`Resolved task intent: ${JSON.stringify(input.resolvedTask.task_intent)}`,
		`Resolved context profile: ${JSON.stringify(input.resolvedTask.context_profile)}`,
		`Directive count: ${input.directives.length}`,
		`Observation count: ${input.observations.length}`
	].join("\n");
}
function allowedIds(input) {
	return {
		directiveIds: input.directives.map((directive) => directive.id),
		observationIds: input.observations.map((observation) => observation.id)
	};
}
function semanticCacheKeyMaterial(input, kind) {
	return {
		kind,
		taskIntent: input.resolvedTask.task_intent,
		contextProfile: input.resolvedTask.context_profile,
		directiveIds: input.directives.map((directive) => directive.id),
		observationIds: input.observations.map((observation) => observation.id)
	};
}
//#endregion
export { loadSemanticCandidateProposalPayload, loadSemanticRelationProposalPayload, prepareSemanticCandidateContract, prepareSemanticRelationContract };
