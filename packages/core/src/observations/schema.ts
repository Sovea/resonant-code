import { z } from 'zod';
import { Argv, Digest, Id, Path, RecordHeader, Text } from '../schemas/primitives.ts';
import { RepositorySelectorSchema, VerifierRefSchema } from '../intent/schema.ts';

const Mode = z.string().regex(/^[0-7]{6}$/);
export const FileContentSchema = z.strictObject({
  kind: z.enum(['file', 'symlink', 'gitlink']), contentDigest: Digest, mode: Mode,
});
export const WorktreeSnapshotSchema = z.strictObject({
  source: z.literal('git-worktree-tree'), head: Text.nullable(),
  treeId: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
  entries: z.array(FileContentSchema.extend({ path: Path })), fingerprint: Digest,
});
export const ChangedFileSchema = z.strictObject({
  id: Id, path: Path, operation: z.enum(['added', 'modified', 'deleted', 'renamed']),
  previousPath: Path.optional(), before: FileContentSchema.optional(), after: FileContentSchema.optional(),
  representation: z.enum(['text', 'binary', 'metadata-only', 'unrepresentable']), patchDigest: Digest.optional(),
}).refine((file) => Boolean(file.previousPath) === (file.operation === 'renamed')
  && Boolean(file.before) === (file.operation !== 'added')
  && Boolean(file.after) === (file.operation !== 'deleted'), 'file operation must match before/after sides');
export const StreamSchema = z.strictObject({
  digest: Digest, byteLength: z.number().int().nonnegative(), persistedBytes: z.number().int().nonnegative(),
  truncated: z.boolean(), logPath: Path.optional(),
}).refine((s) => s.persistedBytes <= s.byteLength && s.truncated === (s.persistedBytes < s.byteLength)
  && Boolean(s.logPath) === (s.persistedBytes > 0), 'stream lengths and persisted log must agree');
const InputEntry = z.strictObject({
  path: Path, kind: z.enum(['file', 'symlink']), contentDigest: Digest, mode: Mode,
  byteLength: z.number().int().nonnegative(),
});
export const InputSelectorSchema = z.strictObject({
  selector: RepositorySelectorSchema, state: z.enum(['missing', 'present']),
  entries: z.array(InputEntry), fingerprint: Digest,
});
export const InputSnapshotSchema = z.strictObject({
  definitionId: Id, inputs: z.array(InputSelectorSchema), fingerprint: Digest,
});
export const TerminationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('exit'), exitCode: z.number().int() }),
  z.strictObject({ kind: z.literal('signal'), signal: Text }),
  z.strictObject({ kind: z.literal('timeout'), signal: Text.optional() }),
  z.strictObject({ kind: z.literal('spawn-error'), code: Text.optional() }),
]);
const Outcome = {
  durationMs: z.number().int().nonnegative(), timeoutMs: z.number().int().positive(),
  status: z.enum(['passed', 'failed', 'unavailable']), termination: TerminationSchema,
  outcomeFingerprint: Digest, stdout: StreamSchema, stderr: StreamSchema, reason: Text.optional(),
};
export const StepSchema = z.strictObject({
  ...Outcome, stepId: Id, role: z.enum(['preparation', 'assertion']), key: Text.optional(), argv: Argv,
});
export const AttemptSchema = z.strictObject({
  ...Outcome, attempt: z.number().int().positive(), observedPhase: z.enum(['preparation', 'assertion']),
  steps: z.array(StepSchema).min(1), executionInputs: z.strictObject({
    beforePreparation: InputSnapshotSchema, readyForAssertion: InputSnapshotSchema, afterAssertion: InputSnapshotSchema,
  }),
});
export const CheckFactSchema = z.strictObject({
  verifierId: Id, definitionId: Id, assertionArgv: Argv, definitionFingerprint: Digest,
  attempts: z.array(AttemptSchema).min(1),
});
export const VerifierMutationSchema = z.strictObject({
  verifierId: Id, definitionId: Id, selector: VerifierRefSchema,
  changedFileId: Id, changedPath: Path, matchedBy: z.enum(['current-path', 'previous-path']),
});
export const EnvironmentSchema = z.strictObject({
  platform: Text, architecture: Text,
  executables: z.array(z.strictObject({ command: Text, resolvedPath: Text.nullable() })),
});
export const ObservationDataSchema = z.strictObject({
  baselineFingerprint: Digest, preCheck: WorktreeSnapshotSchema, current: WorktreeSnapshotSchema,
  preCheckExecutionInputs: z.array(InputSnapshotSchema), currentExecutionInputs: z.array(InputSnapshotSchema),
  changeFingerprint: Digest, changedFiles: z.array(ChangedFileSchema), checkInducedChanges: z.array(ChangedFileSchema),
  checks: z.array(CheckFactSchema), verifierMutations: z.array(VerifierMutationSchema), environment: EnvironmentSchema,
  patch: z.strictObject({ path: Path, digest: Digest, byteLength: z.number().int().positive() }).optional(),
  refresh: z.strictObject({ priorObservationId: Id, authority: z.literal('agent-judgment'), reason: Text }).optional(),
  retry: z.strictObject({ priorObservationId: Id, checkKey: Text }).optional(),
  provenance: z.strictObject({ collector: z.literal('stetra-cli'), cliVersion: Text, coreVersion: Text }),
});
export const ObservationSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('observation'), planId: Id,
  attemptNumber: z.number().int().positive(), data: ObservationDataSchema,
});
export const BaselineSchema = z.strictObject({
  ...RecordHeader, kind: z.literal('baseline'), snapshot: WorktreeSnapshotSchema,
});

export type WorktreeSnapshot = z.infer<typeof WorktreeSnapshotSchema>;
export type WorktreeSummary = { head: string | null; fingerprint: string; entryCount: number };
export type FileContentFact = z.infer<typeof FileContentSchema>;
export type FileKind = FileContentFact['kind'];
export type ChangedFileFact = z.infer<typeof ChangedFileSchema>;
export type CheckStreamFact = z.infer<typeof StreamSchema>;
export type VerificationInputEntryFact = z.infer<typeof InputEntry>;
export type VerificationInputSelectorFact = z.infer<typeof InputSelectorSchema>;
export type VerificationInputSnapshot = z.infer<typeof InputSnapshotSchema>;
export type CheckTermination = z.infer<typeof TerminationSchema>;
export type CheckStepAttemptFact = z.infer<typeof StepSchema>;
export type CheckAttemptFact = z.infer<typeof AttemptSchema>;
export type CheckFact = z.infer<typeof CheckFactSchema>;
export type VerifierMutation = z.infer<typeof VerifierMutationSchema>;
export type ExecutionEnvironment = z.infer<typeof EnvironmentSchema>;
export type ExecutableEnvironmentFact = ExecutionEnvironment['executables'][number];
export type ObservationData = z.infer<typeof ObservationDataSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
