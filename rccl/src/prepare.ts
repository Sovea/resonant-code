import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { buildRepoIndex } from './indexing/build-repo-index.ts';
import { buildRepresentation } from './represent/build-representation.ts';
import { planSlices } from './slicing/plan-slices.ts';
import { RCCL_CANDIDATE_SCHEMA, buildSlicePrompt } from './prompt/build-slice-prompt.ts';
import { buildDiscoveryPrompt } from './prompt/build-discovery-prompt.ts';
import { buildCritiquePrompt } from './prompt/build-critique-prompt.ts';
import { buildSynthesisPrompt } from './prompt/build-synthesis-prompt.ts';
import type {
  CalibrationSlice,
  PrepareRcclResult,
  PrepareRcclWorkflowStageResult,
  RcclCalibrationStats,
  RcclWorkflowCritiqueDocument,
  RcclWorkflowDiscoveryDocument,
  RcclWorkflowStageName,
  RepoRepresentation,
} from './types.ts';

const FALSEY_FLAG_VALUES = new Set(['0', 'false', 'no', 'off']);

interface PreparationContext {
  projectRoot: string;
  scope: string;
  representation: RepoRepresentation;
  slices: CalibrationSlice[];
  contextMeta: { raw: string } | null;
  stats: RcclCalibrationStats;
}

export function prepareRccl(projectRootInput: string, options: { scope?: string; debugArtifacts?: boolean } = {}): PrepareRcclResult {
  const context = buildPreparationContext(projectRootInput, options.scope);
  const prompt = buildSlicePrompt({
    scope: context.scope,
    slices: context.slices,
    contextMeta: context.contextMeta,
    stats: context.stats,
  });

  const candidateArtifact = buildObservationGenerationArtifact(context.projectRoot, context.scope);
  const contract = buildObservationGenerationContract(context, prompt, candidateArtifact);
  const debugArtifacts = buildDebugArtifacts(context, prompt, 'calibration-prompts', options.debugArtifacts);

  return {
    prompt,
    contract,
    candidateArtifact,
    metadata: {
      scope: context.scope,
      stats: context.stats,
    },
    debugArtifacts,
  };
}

export function prepareRcclWorkflowStage(projectRootInput: string, options: {
  stage: RcclWorkflowStageName;
  scope?: string;
  discovery?: RcclWorkflowDiscoveryDocument;
  critique?: RcclWorkflowCritiqueDocument;
  debugArtifacts?: boolean;
}): PrepareRcclWorkflowStageResult {
  const context = buildPreparationContext(projectRootInput, options.scope);
  const prompt = buildWorkflowPrompt(context, options);
  const debugArtifacts = buildDebugArtifacts(context, prompt, 'rccl-workflow-prompts', options.debugArtifacts, { stage: options.stage });

  return {
    stage: options.stage,
    prompt,
    suggestedArtifactPath: suggestedWorkflowArtifactPath(context.projectRoot, options.stage, context.scope),
    metadata: {
      scope: context.scope,
      stats: context.stats,
    },
    debugArtifacts,
  };
}

function buildPreparationContext(projectRootInput: string, scopeInput?: string): PreparationContext {
  const projectRoot = resolve(projectRootInput);
  const scope = scopeInput || 'auto';
  const indexedFiles = buildRepoIndex(projectRoot, scope);
  const representation = buildRepresentation(indexedFiles);
  const slices = planSlices(projectRoot, indexedFiles, representation);
  const windows = slices.flatMap((slice) => slice.windows);
  const contextMeta = loadContextMeta(projectRoot);
  const stats = {
    total_files: indexedFiles.length,
    indexed_files: indexedFiles.length,
    selected_slices: slices.length,
    windows: windows.length,
  };
  return { projectRoot, scope, representation, slices, contextMeta, stats };
}

function buildWorkflowPrompt(context: PreparationContext, options: {
  stage: RcclWorkflowStageName;
  discovery?: RcclWorkflowDiscoveryDocument;
  critique?: RcclWorkflowCritiqueDocument;
}): string {
  if (options.stage === 'discover') {
    return buildDiscoveryPrompt({
      scope: context.scope,
      slices: context.slices,
      contextMeta: context.contextMeta,
      stats: context.stats,
    });
  }

  if (options.stage === 'critique') {
    if (!options.discovery) throw new Error('prepare-stage critique requires a parsed discovery artifact');
    return buildCritiquePrompt({
      scope: context.scope,
      discovery: options.discovery,
      slices: context.slices,
      contextMeta: context.contextMeta,
      stats: context.stats,
    });
  }

  if (!options.discovery) throw new Error('prepare-stage synthesize requires a parsed discovery artifact');
  if (!options.critique) throw new Error('prepare-stage synthesize requires a parsed critique artifact');
  return buildSynthesisPrompt({
    scope: context.scope,
    discovery: options.discovery,
    critique: options.critique,
    slices: context.slices,
    contextMeta: context.contextMeta,
    stats: context.stats,
  });
}

function buildDebugArtifacts(
  context: PreparationContext,
  prompt: string,
  promptFolder: string,
  debugArtifacts?: boolean,
  seed: Record<string, unknown> = {},
): PrepareRcclResult['debugArtifacts'] {
  const debugArtifactsEnabled = shouldEmitDebugArtifacts(debugArtifacts);
  return debugArtifactsEnabled
    ? {
      enabled: true,
      promptPath: writeArtifact(context.projectRoot, promptFolder, 'md', prompt, { scope: context.scope, promptLength: prompt.length, ...seed }),
      slicePlanPath: writeArtifact(context.projectRoot, 'rccl-slice-plans', 'json', JSON.stringify({ scope: context.scope, representation: context.representation, slices: context.slices }, null, 2), { scope: context.scope, slices: context.slices.length, ...seed }),
      reportPath: writeArtifact(context.projectRoot, 'rccl-reports', 'json', JSON.stringify({
        scope: context.scope,
        stage: seed.stage,
        stats: context.stats,
        roots: context.representation.roots,
        modules: context.representation.modules.slice(0, 5),
        boundaries: context.representation.boundaries,
        migrations: context.representation.migrations,
        style_clusters: context.representation.style_clusters,
      }, null, 2), { scope: context.scope, report: 'summary', ...seed }),
    }
    : { enabled: false };
}

function buildObservationGenerationArtifact(projectRoot: string, scope: string) {
  return {
    suggestedPath: suggestedObservationCandidatePath(projectRoot, scope),
    format: 'yaml' as const,
    usage: 'Write candidate RCCL observations to this YAML path, then pass it to calibrate-repo-context commit with --input.',
  };
}

function buildObservationGenerationContract(
  context: PreparationContext,
  prompt: string,
  artifact: ReturnType<typeof buildObservationGenerationArtifact>,
) {
  return {
    contractVersion: 'ai-contract/v1' as const,
    kind: 'rccl-observation-generation' as const,
    schemaId: 'rccl.observation-generation-candidate',
    schemaVersion: '1.0' as const,
    prompt,
    schema: RCCL_CANDIDATE_SCHEMA,
    artifact,
    provenance: {
      owner: 'rccl' as const,
      deterministic: true,
    },
    cacheKeyMaterial: {
      scope: context.scope,
      stats: context.stats,
      slices: context.slices.map((slice) => ({
        id: slice.id,
        files: slice.files,
        windows: slice.windows.map((window) => ({
          file: window.file,
          start_line: window.start_line,
          end_line: window.end_line,
          purpose: window.purpose,
        })),
      })),
    },
  };
}

function suggestedObservationCandidatePath(projectRoot: string, scope: string): string {
  const digest = createHash('sha1').update(JSON.stringify({ kind: 'rccl-observation-generation', scope })).digest('hex').slice(0, 10);
  return join(projectRoot, '.resonant-code', 'context', 'rccl-candidates', `${digest}.yaml`);
}

function suggestedWorkflowArtifactPath(projectRoot: string, stage: RcclWorkflowStageName, scope: string): string {
  const digest = createHash('sha1').update(JSON.stringify({ stage, scope })).digest('hex').slice(0, 10);
  return join(projectRoot, '.resonant-code', 'context', 'rccl-workflow', `${stage}-${digest}.yaml`);
}

function shouldEmitDebugArtifacts(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const value = process.env.RESONANT_CODE_DEBUG_ARTIFACTS;
  if (!value) return false;
  return !FALSEY_FLAG_VALUES.has(String(value).trim().toLowerCase());
}

function writeArtifact(projectRoot: string, folder: string, extension: string, content: string, seed: Record<string, unknown>): string {
  const digest = createHash('sha1').update(JSON.stringify(seed)).digest('hex').slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const path = join(projectRoot, '.resonant-code', 'context', folder, `${stamp}-${digest}.${extension}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  return path;
}

function loadContextMeta(projectRoot: string): { raw: string } | null {
  try {
    const raw = readFileSync(join(projectRoot, '.resonant-code', 'context', 'global.yaml'), 'utf-8');
    return { raw: raw.slice(0, 1200) };
  } catch {
    return null;
  }
}
