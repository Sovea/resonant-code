import { z } from 'zod';
import { BasisSchema, ResponseSchema } from '../assessments/schema.ts';
import { Digest, HumanInput, Id, Interpretation, Key, RecordHeader, Text } from '../schemas/primitives.ts';

export const RecommendationSchema = z.strictObject({
  action: z.enum(['accept', 'accept-with-limitations', 'request-correction', 'reject', 'defer']),
  rationale: Text, caveats: z.array(Text).default([]),
});
export const PrepareInputSchema = z.strictObject({
  recommendation: RecommendationSchema, responses: z.array(ResponseSchema).default([]),
  concernFindings: z.array(z.strictObject({ concernKey: Key,
    status: z.enum(['supported', 'partial', 'contradicted', 'unknown']), explanation: Text,
  })).default([]),
});
export const AttentionSchema = z.strictObject({
  id: Id, code: Key, message: Text, sourceId: Id.optional(),
});
export const AdoptionPackageSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('adoption-package'), basis: BasisSchema,
  requestId: Id, assessmentId: Id, findingDigest: Digest,
  input: PrepareInputSchema, attention: z.array(AttentionSchema),
  pendingDecisions: z.array(Key),
});
export const AdoptionInputSchema = z.strictObject({
  packageId: Id, humanEvent: HumanInput,
  action: z.enum(['accepted', 'correction-requested', 'rejected', 'deferred']), reason: Text,
  acknowledge: z.array(Id).default([]), correction: Interpretation.optional(),
}).refine((value) => (value.action === 'correction-requested') === Boolean(value.correction),
  'a correction request requires a new interpretation; other decisions do not revise it');
export const AdoptionDecisionSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('adoption-decision'), packageId: Id, humanEventId: Id,
  action: z.enum(['accepted', 'correction-requested', 'rejected', 'deferred']), reason: Text,
  acknowledge: z.array(Id),
});
export type Attention = z.infer<typeof AttentionSchema>;
export type AdoptionPackage = z.infer<typeof AdoptionPackageSchema>;
export type AdoptionDecision = z.infer<typeof AdoptionDecisionSchema>;
