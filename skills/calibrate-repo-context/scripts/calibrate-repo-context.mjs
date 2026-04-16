#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const command = args[0];
const projectRoot = resolve(args[1] || '.');
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDirectory, '..', '..', '..');
const rcclEntry = pathToFileURL(resolve(pluginRoot, 'rccl', 'dist', 'index.mjs')).href;

async function loadRccl() {
  return import(rcclEntry);
}

async function runPrepare(options = {}) {
  const rccl = await loadRccl();
  const result = rccl.prepareRccl(projectRoot, { scope: options.scope });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

async function runCommit(options = {}) {
  if (!options.input) {
    process.stderr.write('? Missing --input argument for commit phase.\n');
    process.exit(1);
  }

  let yamlText;
  try {
    yamlText = readFileSync(options.input, 'utf-8');
  } catch (err) {
    process.stderr.write(`? Failed to read input file: ${err.message}\n`);
    process.exit(1);
  }

  const rccl = await loadRccl();
  const parsedCandidates = rccl.parseRcclCandidates(yamlText);
  if (!parsedCandidates.valid) {
    process.stderr.write('? Validation failed for RCCL generation:\n');
    for (const err of parsedCandidates.errors ?? []) process.stderr.write(`  - ${err}\n`);
    process.exit(1);
  }

  const candidateArtifactPath = rccl.writeCandidateArtifact(projectRoot, parsedCandidates.data);
  const consolidation = rccl.consolidateObservations(parsedCandidates.data.observations);
  const draftDocument = {
    version: parsedCandidates.data.version,
    generated_at: parsedCandidates.data.generated_at,
    git_ref: parsedCandidates.data.git_ref,
    observations: rccl.materializeRcclObservations(consolidation.observations),
  };
  const evidenceVerified = rccl.verifyEvidenceForDocument(draftDocument, projectRoot);
  const verified = rccl.verifyInductionForDocument(evidenceVerified);
  const consolidationArtifactPath = rccl.writeConsolidationArtifact(projectRoot, consolidation, verified);
  const result = rccl.emitRccl(verified, projectRoot);
  process.stdout.write(JSON.stringify({
    ...result,
    artifacts: {
      candidates: candidateArtifactPath,
      consolidation: consolidationArtifactPath,
    },
  }, null, 2) + '\n');

  if (result.verification_summary.demoted_count > 0 || result.verification_summary.reduced_confidence_count > 0) {
    process.stderr.write('Verification summary:\n');
    process.stderr.write(`  kept: ${result.verification_summary.kept_count}\n`);
    process.stderr.write(`  reduced-confidence: ${result.verification_summary.reduced_confidence_count}\n`);
    process.stderr.write(`  demoted: ${result.verification_summary.demoted_count}\n`);
    for (const observation of result.verification_summary.observations) {
      if (observation.disposition === 'keep') continue;
      process.stderr.write(`  - ${observation.id}: disposition=${observation.disposition} evidence=${observation.evidence_status ?? 'pending'} induction=${observation.induction_status ?? 'pending'} verified=${observation.evidence_verified_count ?? 0}/${observation.evidence_total_count}\n`);
    }
  }
  process.exit(0);
}

function parseArgs(argsArray) {
  const opts = {};
  for (let i = 0; i < argsArray.length; i += 1) {
    if (argsArray[i] === '--scope') opts.scope = argsArray[++i];
    else if (argsArray[i] === '--input') opts.input = argsArray[++i];
  }
  return opts;
}

const opts = parseArgs(args);
if (command === 'prepare') {
  runPrepare(opts).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
} else if (command === 'commit') {
  runCommit(opts).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
} else {
  process.stderr.write('Usage: calibrate-repo-context.mjs <prepare|commit> <project-root> [opts...]\n');
  process.stderr.write('  prepare <project-root> [--scope <glob>]\n');
  process.stderr.write('  commit <project-root> --input <path-to-yaml>\n');
  process.exit(1);
}
