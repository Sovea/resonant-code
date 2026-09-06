import { existsSync } from 'node:fs';
import { z } from 'zod';
import { schemas } from '@sovea/stetra-core';
import { PROTOCOL, SCHEMA_VERSION } from '../protocol.ts';
import { readJson, safeStoragePath } from '../workflow/storage-io.ts';

export const DEFAULT_EXECUTION_POLICY = schemas.defaults.executionPolicy;
export const ProjectConfigSchema = z.strictObject({
  protocol: z.literal(PROTOCOL), schemaVersion: z.literal(SCHEMA_VERSION),
  admission: z.enum(['explicit', 'ask', 'required']).default('ask'),
  defaultVerificationProfile: schemas.key.nullable().default(null),
  verificationProfiles: z.record(schemas.key, z.strictObject({
    checks: z.array(schemas.checkDefinitionInput).min(1),
  })).default({}),
  executionPolicy: schemas.executionPolicy.default(DEFAULT_EXECUTION_POLICY),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = ProjectConfigSchema.parse({ protocol: PROTOCOL, schemaVersion: SCHEMA_VERSION });

export function readProjectConfig(projectRoot: string): ProjectConfig {
  const path = safeStoragePath(projectRoot, '.stetra/config.json');
  return existsSync(path) ? ProjectConfigSchema.parse(readJson(path)) : structuredClone(DEFAULT_PROJECT_CONFIG);
}
