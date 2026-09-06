import { z } from 'zod';
import { Digest, Id, Key, Path, RecordHeader, Text } from '../schemas/primitives.ts';

export const EvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('source'), snapshot: z.enum(['baseline', 'current']), path: Path,
    digest: Digest.optional(), lines: z.strictObject({ start: z.number().int().positive(),
      end: z.number().int().positive() }).refine((v) => v.end >= v.start).optional() }),
  z.strictObject({ kind: z.literal('changed-file'), path: Path }),
  z.strictObject({ kind: z.literal('check'), checkKey: Key, attempt: z.number().int().positive().optional() }),
  z.strictObject({ kind: z.literal('patch') }),
]);
export const FindingReferenceSchema = z.strictObject({ assessmentId: Id, key: Key });
export const ResponseSchema = z.strictObject({
  finding: FindingReferenceSchema, response: Text, evidence: z.array(EvidenceSchema).default([]),
});
const Dimensions = {
  ownership: z.array(Text).optional(), invariants: z.array(Text).optional(),
  failureAndRecovery: z.array(Text).optional(), effects: z.array(Text).optional(), tradeoffs: z.array(Text).optional(),
};
export const ReportInputSchema = z.strictObject({
  behavior: Text, mechanism: z.array(Text).min(1), ...Dimensions,
  evidence: z.array(EvidenceSchema).default([]), decisions: z.array(Key).default([]),
  responses: z.array(ResponseSchema).default([]), unknowns: z.array(Text).default([]),
});
export const BasisSchema = z.strictObject({
  intentId: Id, decisionDigest: Digest, observationId: Id, planId: Id, reportId: Id,
});
export const ReportSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('report'), intentId: Id, decisionDigest: Digest,
  observationId: Id, planId: Id, input: ReportInputSchema,
});
export const AnalysisRequestSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('analysis-request'), basis: BasisSchema,
  decisionRefs: z.array(z.strictObject({ proposalId: Id, resolutionId: Id.optional() })),
  priorFindings: z.array(FindingReferenceSchema), reason: Text,
});
const RelationBasis = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('request') }),
  z.strictObject({ kind: z.literal('human-event'), id: Id }),
  z.strictObject({ kind: z.literal('decision'), key: Key }),
  z.strictObject({ kind: z.literal('report') }),
  z.strictObject({ kind: z.literal('unexplained') }),
]);
export const AssessmentInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('assessment'), requestId: Id, context: z.enum(['separate-context', 'same-context']),
    summary: Text,
    claims: z.array(z.strictObject({ key: Key, before: Text, after: Text, mechanism: Text,
      ...Dimensions, evidence: z.array(EvidenceSchema) })),
    relations: z.array(z.strictObject({ claimKey: Key, basis: RelationBasis, explanation: Text })),
    findings: z.array(z.strictObject({ key: Key,
      kind: z.enum(['unexplained-change', 'direction-conflict', 'evidence-contradiction', 'insufficient-evidence']),
      claimKeys: z.array(Key).default([]), statement: Text, consequence: Text,
      evidence: z.array(EvidenceSchema), nextAction: Text.optional(),
    })),
    dispositions: z.array(z.strictObject({ finding: FindingReferenceSchema,
      outcome: z.enum(['addressed', 'retracted', 'disputed']), rationale: Text,
      evidence: z.array(EvidenceSchema),
    })).default([]),
    unknowns: z.array(Text).default([]), reviewFocus: z.array(Text).default([]),
  }),
  z.strictObject({ kind: z.literal('unavailable'), requestId: Id, reason: Text }),
]);
export const AnalysisOriginSchema = z.discriminatedUnion('transport', [
  z.strictObject({ transport: z.literal('agent-relay') }),
  z.strictObject({ transport: z.literal('host-hook'), host: z.enum(['codex', 'claude']),
    sessionHash: Digest, agentId: Text, agentType: z.literal('stetra-analyzer'),
    turnId: Text.optional(), outputDigest: Digest }),
]);
export const AssessmentSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('assessment'), input: AssessmentInputSchema, origin: AnalysisOriginSchema,
  currentAtSubmission: z.boolean(),
});
export type EvidenceReference = z.infer<typeof EvidenceSchema>;
export type FindingReference = z.infer<typeof FindingReferenceSchema>;
export type FindingResponse = z.infer<typeof ResponseSchema>;
export type ImplementationReport = z.infer<typeof ReportSchema>;
export type AnalysisBasis = z.infer<typeof BasisSchema>;
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type AnalysisOrigin = z.infer<typeof AnalysisOriginSchema>;
