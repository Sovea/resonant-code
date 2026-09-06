import { z } from 'zod';
import { Argv, Authority, HumanInput, Id, Interpretation, Key, Path, RecordHeader, Text } from '../schemas/primitives.ts';

export const RepositorySelectorSchema = z.strictObject({ kind: z.enum(['file', 'tree']), path: Path });
export const VerifierRefSchema = RepositorySelectorSchema.extend({
  role: z.enum(['command-definition', 'acceptance-surface']),
});
export const CheckDefinitionInputSchema = z.strictObject({
  key: Key, argv: Argv, rationale: Text.optional(),
  preparation: z.array(z.strictObject({ key: Key, argv: Argv })).default([]),
  executionInputs: z.array(RepositorySelectorSchema).default([]),
  verifierSelectors: z.array(VerifierRefSchema).default([]),
});
export const VerificationInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('checks'), checks: z.array(CheckDefinitionInputSchema).min(1) }),
  z.strictObject({ mode: z.literal('no-command'), rationale: Text }),
]);
export const VerificationSelectionSchema = z.union([
  VerificationInputSchema, z.strictObject({ mode: z.literal('profile'), name: Key }),
]);
export const VerificationDefinitionSchema = z.strictObject({
  verifierId: Id, definitionId: Id, key: Key, rationale: Text,
  execution: z.strictObject({
    preparation: z.array(z.strictObject({ stepId: Id, key: Key, argv: Argv })),
    assertion: z.strictObject({ stepId: Id, argv: Argv }),
  }),
  executionInputs: z.array(RepositorySelectorSchema), verifierRefs: z.array(VerifierRefSchema),
});
export const ExecutionPolicySchema = z.strictObject({
  checkTimeoutMs: z.number().int().positive(), maxTimeoutMs: z.number().int().positive(),
  maxTimeoutRetriesPerCheck: z.number().int().min(0).max(1),
}).refine((value) => value.maxTimeoutMs >= value.checkTimeoutMs,
  'maximum timeout must be at least the initial timeout');
const ConcernSchema = z.strictObject({
  key: Key, statement: Text, adoptionImpact: Text,
  evidenceRequirements: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('check'), checkKey: Key }),
    z.strictObject({ kind: z.literal('human-review'), question: Text }),
  ])).min(1),
});
export const AssuranceSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('routine') }),
  z.strictObject({ mode: z.literal('consequential'), concerns: z.array(ConcernSchema).min(1) }),
]);
export const BeginInputSchema = z.strictObject({
  humanEvent: HumanInput, interpretation: Interpretation,
  assurance: AssuranceSchema.default({ mode: 'routine' }),
  verification: VerificationSelectionSchema.optional(),
});
export const AmendInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('human-correction'), humanEvent: HumanInput,
    interpretation: Interpretation, assurance: AssuranceSchema.optional() }),
  z.strictObject({ kind: z.literal('interpretation'), interpretation: Interpretation, reason: Text }),
]);
export const ReviseVerificationInputSchema = z.strictObject({
  verification: VerificationSelectionSchema, authority: Authority,
});
export const HumanEventSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('human-event'),
  purpose: z.enum(['request', 'correction', 'decision', 'adoption']),
  content: Text, provenance: z.literal('unattested-input'),
});
export const IntentSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('intent'), previousId: Id.optional(),
  humanEventIds: z.array(Id).min(1), interpretation: Interpretation,
  assurance: AssuranceSchema,
  concernChecks: z.array(z.strictObject({ concernKey: Key, checkKey: Key, definitionId: Id })),
  reason: Text,
});
export const VerificationPlanSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('verification-plan'), previousId: Id.optional(),
  mode: z.enum(['checks', 'no-command']), definitions: z.array(VerificationDefinitionSchema),
  rationale: Text, authorityEventIds: z.array(Id), executionPolicy: ExecutionPolicySchema,
});

export type VerificationDefinition = z.infer<typeof VerificationDefinitionSchema>;
export type CheckDefinitionInput = z.input<typeof CheckDefinitionInputSchema>;
export type VerificationInput = z.infer<typeof VerificationInputSchema>;
export type RepositorySelector = z.infer<typeof RepositorySelectorSchema>;
export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type VerificationPlan = z.infer<typeof VerificationPlanSchema>;
export type HumanEvent = z.infer<typeof HumanEventSchema>;
