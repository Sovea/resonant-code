import { PROTOCOL, SCHEMA_VERSION } from '../protocol.ts';
import { HumanInput, Id, Key, Path } from './primitives.ts';
import { CheckDefinitionInputSchema, ExecutionPolicySchema, VerificationInputSchema, VerificationSelectionSchema } from '../intent/schema.ts';
import { ObservationDataSchema, WorktreeSnapshotSchema } from '../observations/schema.ts';
import { ArtifactSchema, EventSchema, ProjectionSchema, commandSchemas } from '../task/schema.ts';
import { RuntimeInputsSchema } from '../task/transition.ts';

export const schemas = {
  protocol: PROTOCOL, schemaVersion: SCHEMA_VERSION,
  commands: commandSchemas, artifact: ArtifactSchema, event: EventSchema, projection: ProjectionSchema,
  runtimeInputs: RuntimeInputsSchema, id: Id, key: Key, repositoryPath: Path, humanInput: HumanInput,
  checkDefinitionInput: CheckDefinitionInputSchema, executionPolicy: ExecutionPolicySchema,
  verification: VerificationInputSchema, verificationSelection: VerificationSelectionSchema,
  worktreeSnapshot: WorktreeSnapshotSchema, observationData: ObservationDataSchema,
  defaults: { executionPolicy: { checkTimeoutMs: 300_000, maxTimeoutMs: 900_000, maxTimeoutRetriesPerCheck: 1 } },
} as const;
