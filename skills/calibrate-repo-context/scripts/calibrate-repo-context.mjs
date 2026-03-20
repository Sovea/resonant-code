#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectScope } from './lib/collect-scope.mjs';
import { sampleFiles } from './lib/sample-files.mjs';
import { buildPrompt } from './lib/build-prompt.mjs';
import { parseRccl } from './lib/parse-rccl.mjs';
import { emitRccl } from './lib/emit-rccl.mjs';
import { verifyRcclDocument } from './lib/verify-rccl.mjs';

const args = process.argv.slice(2);
const command = args[0];
const projectRoot = resolve(args[1] || '.');

function runPrepare(options = {}) {
  const scopeGlob = options.scope || 'src/**';
  const { files, contextMeta } = collectScope(projectRoot, scopeGlob);
  const sampleResult = sampleFiles(projectRoot, files, { maxFiles: 30, maxLines: 100 });
  // The LLM only sees a prompt assembled from deterministic repo sampling.
  const prompt = buildPrompt(sampleResult, scopeGlob, contextMeta);

  process.stdout.write(JSON.stringify({
    prompt,
    metadata: {
      scope: scopeGlob,
      stats: sampleResult.stats,
    },
  }, null, 2) + '\n');
  process.exit(0);
}

function runCommit(options = {}) {
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

  const { valid, data, errors } = parseRccl(yamlText);
  if (!valid) {
    process.stderr.write('? Validation failed for RCCL generation:\n');
    for (const err of errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(1);
  }

  // Verification is purely static: no second LLM pass is involved here.
  const verified = verifyRcclDocument(data, projectRoot);
  const result = emitRccl(verified, projectRoot);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

function parseArgs(argsArray) {
  const opts = {};
  for (let i = 0; i < argsArray.length; i++) {
    if (argsArray[i] === '--scope') {
      opts.scope = argsArray[++i];
    } else if (argsArray[i] === '--input') {
      opts.input = argsArray[++i];
    }
  }
  return opts;
}

const opts = parseArgs(args);

if (command === 'prepare') {
  runPrepare(opts);
} else if (command === 'commit') {
  runCommit(opts);
} else {
  process.stderr.write('Usage: calibrate-repo-context.mjs <prepare|commit> <project-root> [opts...]\n');
  process.stderr.write('  prepare <project-root> [--scope <glob>]\n');
  process.stderr.write('  commit <project-root> --input <path-to-yaml>\n');
  process.exit(1);
}
