import { z } from 'zod';

const identity = { projectRoot: z.string().min(1), taskId: z.string().min(1) };
const request = { requestId: z.string().min(1).optional() };
const observation = { ...request, observationId: z.string().min(1).optional() };
const page = {
  offset: z.number().int().nonnegative().optional(),
  maxBytes: z.number().int().min(1).max(65_536).optional(),
};
const check = { ...observation, checkKey: z.string().min(1), attempt: z.number().int().positive().optional() };

/** The selected section owns its exact selectors; unused flags are errors. */
export const InspectionSchema = z.discriminatedUnion('section', [
  z.strictObject({ ...identity, section: z.literal('summary'), live: z.boolean().optional() }),
  z.strictObject({ ...identity, section: z.literal('intent'), ...request }),
  z.strictObject({ ...identity, section: z.literal('decisions'), ...request }),
  z.strictObject({ ...identity, section: z.literal('baseline') }),
  z.strictObject({ ...identity, section: z.literal('verification'), ...request }),
  z.strictObject({ ...identity, section: z.literal('observations') }),
  z.strictObject({ ...identity, section: z.literal('observation'), ...observation }),
  z.strictObject({ ...identity, section: z.literal('report'), ...request }),
  z.strictObject({ ...identity, section: z.literal('analysis'), ...request, ...page }),
  z.strictObject({ ...identity, section: z.literal('assessment'), ...request }),
  z.strictObject({ ...identity, section: z.literal('adoption'), packageId: z.string().min(1).optional(), live: z.boolean().optional() }),
  z.strictObject({ ...identity, section: z.literal('history') }),
  z.strictObject({ ...identity, section: z.literal('source'), requestId: z.string().min(1),
    snapshot: z.enum(['baseline', 'current']), path: z.string().min(1), ...page }),
  z.strictObject({ ...identity, section: z.literal('patch'), ...observation, ...page }),
  z.strictObject({ ...identity, section: z.literal('check'), ...check }),
  z.strictObject({ ...identity, section: z.literal('log'), ...check, stream: z.enum(['stdout', 'stderr']), ...page }),
]).refine((input) => !('requestId' in input && input.requestId && 'observationId' in input && input.observationId),
  'Select --request or --observation, not both.');

export const inspectionSections = InspectionSchema.options.map((schema) => schema.shape.section.value);
