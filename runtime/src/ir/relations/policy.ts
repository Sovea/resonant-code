export const SEMANTIC_RELATION_POLICY = {
  hostSemantic: {
    minConfidence: 0.72,
    maxCandidatesPerDirective: 5,
  },
  feedback: {
    frequentlyIgnoredFollowRate: 0.5,
    frequentlyIgnoredMinIgnored: 2,
    recurringTensionSeenCount: 2,
    noisyObservationRelationCount: 3,
  },
} as const;

export function semanticRelationPolicyTraceRecord(): {
  host_semantic: {
    min_confidence: number;
    max_candidates_per_directive: number;
  };
  feedback: {
    frequently_ignored_follow_rate: number;
    frequently_ignored_min_ignored: number;
    recurring_tension_seen_count: number;
    noisy_observation_relation_count: number;
  };
} {
  return {
    host_semantic: {
      min_confidence: SEMANTIC_RELATION_POLICY.hostSemantic.minConfidence,
      max_candidates_per_directive: SEMANTIC_RELATION_POLICY.hostSemantic.maxCandidatesPerDirective,
    },
    feedback: {
      frequently_ignored_follow_rate: SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredFollowRate,
      frequently_ignored_min_ignored: SEMANTIC_RELATION_POLICY.feedback.frequentlyIgnoredMinIgnored,
      recurring_tension_seen_count: SEMANTIC_RELATION_POLICY.feedback.recurringTensionSeenCount,
      noisy_observation_relation_count: SEMANTIC_RELATION_POLICY.feedback.noisyObservationRelationCount,
    },
  };
}
