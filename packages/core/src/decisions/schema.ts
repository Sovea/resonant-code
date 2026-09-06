import { z } from 'zod';
import { Authority, ExistingAuthority, Id, Key, RecordHeader, Text } from '../schemas/primitives.ts';

export const ProposalInputSchema = z.strictObject({
  key: Key, question: Text,
  options: z.array(z.strictObject({ key: Key, description: Text, consequences: z.array(Text) })).min(2),
  proposedOption: Key.optional(), waitingWork: z.array(Text).default([]),
  requiresHuman: z.boolean(),
  selection: z.strictObject({ option: Key, authority: ExistingAuthority }).optional(),
});
export const ResolutionInputSchema = z.strictObject({
  decisionKey: Key, proposalId: Id, option: Key, authority: Authority,
});
export const ProposalSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('decision-proposal'), intentId: Id,
  previousId: Id.optional(), input: ProposalInputSchema,
});
export const ResolutionSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('decision-resolution'), intentId: Id,
  proposalId: Id, decisionKey: Key, option: Key,
  actor: z.enum(['human', 'agent']), authorityEventIds: z.array(Id).min(1), rationale: Text,
});
export type DecisionProposal = z.infer<typeof ProposalSchema>;
export type DecisionResolution = z.infer<typeof ResolutionSchema>;
