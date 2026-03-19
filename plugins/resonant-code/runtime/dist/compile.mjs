import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIntent } from './intent/parse-intent.mjs';
import { discoverBuiltinLayers, loadDirectiveFile, loadLocalPlaybook, resolveExtendedLayers } from './load/load-playbook.mjs';
import { loadRccl } from './load/load-rccl.mjs';
import { verifyRcclDocument } from './verify/verify-rccl.mjs';
import { minimatch } from './utils/glob.mjs';
import { stableHash } from './utils/hash.mjs';
             
               
                
                 
                
            
                          
                
                  
            
                    

/**
 * Runs the deterministic playbook pipeline and produces EGO plus decision trace.
 */
export async function compile(input              )                         {
  const traceSteps              = [];
  const intent = parseIntent(input.task);
  traceSteps.push({
    stage: 'Intent Parse',
    lines: [
      `operation: ${intent.operation}`,
      `target_layer: ${intent.target_layer}`,
      `tech_stack: ${intent.tech_stack.join(', ') || '(none)'}`,
      `target_file: ${intent.target_file ?? '(none)'}`,
    ],
  });

  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const local = loadLocalPlaybook(input.localAugmentPath);
  const selectedLayerIds = local?.meta.extends.length
    ? resolveExtendedLayers(local.meta.extends, builtinLayers)
    : ['builtin/core'];
  traceSteps.push({
    stage: 'Layer Filter',
    lines: selectedLayerIds.length ? selectedLayerIds.map((layerId) => `applied ${layerId}`) : ['applied builtin/core'],
  });

  const directives = selectedLayerIds.flatMap((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return filePath ? loadDirectiveFile(filePath, layerId) : [];
  });
  const mergedDirectives = applyLocalAugment(directives, local);
  const filteredDirectives = mergedDirectives
    .filter((directive) => layerMatchesIntent(directive, intent))
    .filter((directive) => scopeMatchesIntent(directive.scope.path, intent.target_file, intent.changed_files));

  const loadedRccl = loadRccl(input.rcclPath);
  const rccl = loadedRccl ? verifyRcclDocument(loadedRccl, input.projectRoot) : null;
  traceSteps.push({
    stage: 'RCCL Verify Gate',
    lines: rccl?.observations.length
      ? rccl.observations.map((observation) => `${observation.id}: ${observation.verification.status}/${observation.verification.disposition}`)
      : ['no rccl loaded'],
  });

  const ego = assembleEgo(filteredDirectives, rccl?.observations ?? [], intent);
  traceSteps.push({
    stage: 'EGO Assembly',
    lines: [
      `must_follow: ${ego.guidance.must_follow.length}`,
      `avoid: ${ego.guidance.avoid.length}`,
      `context_tensions: ${ego.guidance.context_tensions.length}`,
      `ambient: ${ego.guidance.ambient.length}`,
    ],
  });

  const trace                = { task: intent, steps: traceSteps };
  const cache = buildCacheKeys(input, selectedLayerIds, rccl);
  return { ego, trace, cache };
}

function applyLocalAugment(directives             , local                                      )              {
  if (!local) return directives;
  const suppressed = new Set(local.suppresses.map((item) => item.id));
  const overrideById = new Map(local.overrides.map((item) => [item.id, item]));
  const augmentById = new Map(local.augments.map((item) => [item.id, item]));

  const result = directives
    .filter((directive) => !suppressed.has(directive.id))
    .map((directive) => {
      const override = overrideById.get(directive.id);
      const augment = augmentById.get(directive.id);
      return {
        ...directive,
        prescription: override?.prescription ?? directive.prescription,
        weight: override?.weight ?? directive.weight,
        rationale: override?.rationale ?? directive.rationale,
        exceptions: override?.exceptions ?? directive.exceptions,
        examples: augment ? [...directive.examples, ...augment.examples] : directive.examples,
      };
    });
  return [...result, ...local.additions];
}

function layerMatchesIntent(directive           , intent                                    )          {
  const sourceLayer = directive.source.layerId;
  if (sourceLayer === 'builtin/core' || directive.layer.startsWith('local')) return true;
  if (sourceLayer.startsWith('builtin/task-types/')) {
    return sourceLayer.endsWith(`/${intent.operation}`);
  }
  if (sourceLayer.startsWith('builtin/languages/')) {
    return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
  }
  if (sourceLayer.startsWith('builtin/frameworks/')) {
    return intent.tech_stack.some((tech) => sourceLayer.endsWith(`/${tech}`));
  }
  return true;
}

function scopeMatchesIntent(scope        , targetFile                    , changedFiles          )          {
  if (!targetFile && changedFiles.length === 0) return true;
  if (targetFile && minimatch(targetFile, scope)) return true;
  return changedFiles.some((file) => minimatch(file, scope));
}

function assembleEgo(
  directives             ,
  observations                   ,
  intent                                    ,
)                          {
  const must_follow = directives
    .filter((directive) => directive.type !== 'anti-pattern')
    .sort(compareDirectives)
    .map((directive) => ({
      id: directive.id,
      statement: directive.description,
      rationale: directive.rationale,
      prescription: directive.prescription,
      exceptions: directive.exceptions ?? [],
      examples: directive.examples,
      execution_mode: deriveDirectiveMode(directive, observations),
    }));

  const avoid = observations
    .filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files))
    .filter((observation) => observation.category === 'anti-pattern')
    .filter((observation) => observation.verification.disposition !== 'demote-to-ambient')
    .map((observation) => ({
      statement: observation.pattern,
      trigger: `anti-pattern:${observation.id}`,
    }));

  const context_tensions = observations
    .filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files))
    .flatMap((observation) => buildTensions(observation, directives));

  const ambient = observations
    .filter((observation) => scopeMatchesIntent(observation.scope, intent.target_file, intent.changed_files))
    .filter((observation) => observation.category !== 'anti-pattern')
    .map((observation) => {
      const status = observation.verification.disposition === 'demote-to-ambient' ? 'demoted' : 'observed';
      return `${status}: ${observation.pattern}`;
    });

  return {
    taskIntent: intent,
    guidance: {
      must_follow,
      avoid,
      context_tensions,
      ambient,
    },
  };
}

function buildTensions(observation                 , directives             )                   {
  if (observation.verification.disposition === 'demote-to-ambient') return [];
  if (observation.adherence_quality === 'good') return [];
  const candidates = directives
    .map((directive) => ({ directive, score: lexicalSimilarity(directive.description, observation.pattern) }))
    .filter((item) => item.score >= 0.2)
    .sort((a, b) => b.score - a.score);
  const match = candidates[0]?.directive;
  if (!match || match.prescription !== 'must') return [];
  const execution_mode                = 'deviation-noted';
  return [{
    directive_id: match.id,
    execution_mode,
    conflict: `${match.description} conflicts with observed local pattern: ${observation.pattern}`,
    resolution: `Follow ${match.id} for new code, but preserve compatibility with the observed repository pattern where interfaces depend on it.`,
    rccl_confidence: observation.verification.verified_confidence ?? 0,
  }];
}

function deriveDirectiveMode(directive           , observations                   )                {
  if (directive.type === 'anti-pattern') return 'suppress';
  if (directive.rccl_immune) return 'enforce';
  const relevantScore = observations
    .filter((observation) => observation.verification.disposition !== 'demote-to-ambient')
    .map((observation) => lexicalSimilarity(directive.description, observation.pattern))
    .sort((a, b) => b - a)[0] ?? 0;
  if (relevantScore < 0.2) return directive.prescription === 'must' ? 'enforce' : 'ambient';
  return directive.prescription === 'must' ? 'deviation-noted' : 'ambient';
}

function lexicalSimilarity(a        , b        )         {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of bTokens) {
    if (aTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function tokenize(text        )              {
  return new Set(text.toLowerCase().match(/[a-z][a-z0-9-]+/g)?.filter((token) => token.length > 2) ?? []);
}

function compareDirectives(a           , b           )         {
  const prescriptionScore = a.prescription === b.prescription ? 0 : a.prescription === 'must' ? -1 : 1;
  if (prescriptionScore !== 0) return prescriptionScore;
  const weights = { low: 0, normal: 1, high: 2, critical: 3 };
  const weightScore = weights[b.weight] - weights[a.weight];
  if (weightScore !== 0) return weightScore;
  return a.id.localeCompare(b.id);
}

function buildCacheKeys(
  input              ,
  selectedLayerIds          ,
  rccl                             ,
)                         {
  const builtinLayers = discoverBuiltinLayers(input.builtinRoot);
  const builtinFingerprints = selectedLayerIds.map((layerId) => {
    const filePath = builtinLayers.get(layerId);
    return `${layerId}:${filePath ? readFileSync(filePath, 'utf-8').length : 0}`;
  });
  const localSource = input.localAugmentPath ? readFileSync(input.localAugmentPath, 'utf-8') : '';
  const rcclSource = input.rcclPath && rccl
    ? JSON.stringify(rccl.observations.map((item) => [item.id, item.verification.status, item.verification.disposition]))
    : '';
  const l1Key = stableHash(builtinFingerprints);
  const l2Key = stableHash([l1Key, localSource, rcclSource]);
  const l3Key = stableHash([l2Key, input.task]);
  return { l1Key, l2Key, l3Key };
}
