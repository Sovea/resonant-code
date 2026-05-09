//#region src/ir/relations/policy.ts
const SEMANTIC_RELATION_POLICY = {
	hostSemantic: {
		minConfidence: .72,
		maxCandidatesPerDirective: 5
	},
	feedback: {
		frequentlyIgnoredFollowRate: .5,
		frequentlyIgnoredMinIgnored: 2,
		recurringTensionSeenCount: 2,
		noisyObservationRelationCount: 3
	}
};
function semanticRelationPolicyTraceRecord() {
	return {
		host_semantic: {
			min_confidence: SEMANTIC_RELATION_POLICY.hostSemantic.minConfidence,
			max_candidates_per_directive: SEMANTIC_RELATION_POLICY.hostSemantic.maxCandidatesPerDirective
		},
		feedback: {
			frequently_ignored_follow_rate: SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredFollowRate,
			frequently_ignored_min_ignored: SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredMinIgnored,
			recurring_tension_seen_count: SEMANTIC_RELATION_POLICY.feedback.recurringTensionSeenCount,
			noisy_observation_relation_count: SEMANTIC_RELATION_POLICY.feedback.noisyObservationRelationCount
		}
	};
}
//#endregion
export { SEMANTIC_RELATION_POLICY, semanticRelationPolicyTraceRecord };
