import { z } from 'zod';
import { Envelope, Id, RecordHeader, Text } from '../schemas/primitives.ts';
import { AmendInputSchema, BeginInputSchema, ExecutionPolicySchema, HumanEventSchema, IntentSchema,
  ReviseVerificationInputSchema, VerificationPlanSchema } from '../intent/schema.ts';
import { ProposalInputSchema, ProposalSchema, ResolutionInputSchema, ResolutionSchema } from '../decisions/schema.ts';
import { BaselineSchema, ObservationSchema } from '../observations/schema.ts';
import { AnalysisRequestSchema, AssessmentInputSchema, AssessmentSchema, ReportInputSchema, ReportSchema } from '../assessments/schema.ts';
import { AdoptionDecisionSchema, AdoptionInputSchema, AdoptionPackageSchema, PrepareInputSchema } from '../adoption/schema.ts';

export const commandSchemas = {
  begin: BeginInputSchema, amend: AmendInputSchema, propose: ProposalInputSchema,
  resolve: ResolutionInputSchema, 'verification-revise': ReviseVerificationInputSchema,
  collect: z.strictObject({}),
  report: z.strictObject({ report: ReportInputSchema, reassessReason: Text.optional() }),
  assess: AssessmentInputSchema, prepare: PrepareInputSchema, decide: AdoptionInputSchema,
};
export type TaskCommand = { [K in keyof typeof commandSchemas]: {
  type: K; input: z.input<(typeof commandSchemas)[K]>;
} }[keyof typeof commandSchemas];
export const ArtifactSchema = z.discriminatedUnion('kind', [
  HumanEventSchema, IntentSchema, VerificationPlanSchema, ProposalSchema, ResolutionSchema,
  BaselineSchema, ObservationSchema, ReportSchema, AnalysisRequestSchema,
  AssessmentSchema, AdoptionPackageSchema, AdoptionDecisionSchema,
]);
export const EventSchema = z.strictObject({
  ...Envelope, ...RecordHeader, sequence: z.number().int().positive(),
  type: z.enum(['begin', 'amend', 'propose', 'resolve', 'verification-revise', 'collect', 'report', 'assess', 'prepare', 'decide']),
  artifactIds: z.array(Id).min(1),
});
export const ProjectionSchema = z.strictObject({
  ...Envelope, taskId: z.uuid(), revision: z.number().int().positive(),
  attemptNumber: z.number().int().positive(), closed: z.boolean(),
  baselineId: Id, intentId: Id, planId: Id, executionPolicy: ExecutionPolicySchema,
  observationId: Id.optional(), reportId: Id.optional(), requestId: Id.optional(),
  assessmentId: Id.optional(), packageId: Id.optional(), adoptionId: Id.optional(),
});
export type TaskArtifact = z.infer<typeof ArtifactSchema>;
export type TaskEvent = z.infer<typeof EventSchema>;
export type TaskProjection = z.infer<typeof ProjectionSchema>;
export type TaskState = TaskProjection & { records: TaskArtifact[] };
