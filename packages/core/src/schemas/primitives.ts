import { z } from 'zod';
import { PROTOCOL, SCHEMA_VERSION } from '../protocol.ts';

export const Text = z.string().regex(/\S/, 'must contain non-whitespace text');
export const Key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
export const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const Path = z.string().min(1).refine((value) => !value.startsWith('/')
  && !/^[A-Za-z]:/.test(value) && !value.includes('\\') && !value.includes('\0')
  && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
'must be a safe repository-relative path');
const Argument = z.string().refine((value) => !value.includes('\0'), 'must not contain NUL');
export const Argv = z.tuple([Argument.refine((value) => /\S/.test(value),
  'executable must be non-empty')]).rest(Argument);
export const Envelope = { protocol: z.literal(PROTOCOL), schemaVersion: z.literal(SCHEMA_VERSION) };
export const HumanInput = z.strictObject({ content: Text });
export const Interpretation = z.strictObject({
  desiredOutcome: Text, constraints: z.array(Text), nonGoals: z.array(Text),
});
export const ExistingAuthority = z.strictObject({
  kind: z.literal('existing-authority'), basis: z.array(Id).min(1), rationale: Text,
});
export const Authority = z.discriminatedUnion('kind', [
  ExistingAuthority,
  z.strictObject({ kind: z.literal('human'), humanEvent: HumanInput }),
]);
export const RecordHeader = { id: Id, taskId: z.uuid() };
