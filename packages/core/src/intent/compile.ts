import { fingerprint, requireCondition } from '../protocol.ts';
import { VerificationInputSchema, type ExecutionPolicy, type VerificationInput, type VerificationPlan } from './schema.ts';

export function compileVerification(input: VerificationInput, header: { id: string; taskId: string },
  policy: ExecutionPolicy, authorityEventIds: string[], rationale: string, previousId?: string): VerificationPlan {
  const source = VerificationInputSchema.parse(input);
  const checks = source.mode === 'checks' ? source.checks : [];
  unique(checks.map((item) => item.key), 'check keys');
  return {
    ...header, kind: 'verification-plan', ...(previousId ? { previousId } : {}), mode: source.mode,
    rationale: source.mode === 'no-command' ? source.rationale : rationale,
    authorityEventIds, executionPolicy: policy,
    definitions: checks.map((check) => {
      unique(check.preparation.map((step) => step.key), `preparation keys for ${check.key}`);
      unique(check.executionInputs.map(fingerprint), `execution inputs for ${check.key}`);
      unique(check.verifierSelectors.map(fingerprint), `verifier selectors for ${check.key}`);
      const { rationale: explanation, ...definition } = check;
      const definitionId = fingerprint(definition);
      return {
        verifierId: fingerprint({ key: check.key }), definitionId, key: check.key,
        rationale: explanation ?? 'Observe the explicitly declared check.',
        execution: {
          preparation: check.preparation.map((step, index) => ({
            stepId: fingerprint({ definitionId, index }), key: step.key, argv: step.argv,
          })),
          assertion: { stepId: fingerprint({ definitionId, index: check.preparation.length }), argv: check.argv },
        },
        executionInputs: check.executionInputs, verifierRefs: check.verifierSelectors,
      };
    }),
  };
}

export function unique(values: string[], label: string): void {
  requireCondition(new Set(values).size === values.length, 'DUPLICATE_REFERENCE', `Duplicate ${label}.`);
}
