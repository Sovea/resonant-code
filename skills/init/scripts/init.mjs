// scripts/init.mjs
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Args & config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const forceFlag = args.includes('--force');
const positional = args.filter(a => !a.startsWith('--'));

const projectRoot   = resolve(positional[0] ?? '.');
const builtinRoot   = resolve(positional[1]);   // required: <plugin-dir>/playbook/builtin

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const exists    = (rel) => existsSync(join(projectRoot, rel));
const existsAny = (rels) => rels.some(exists);

const GITIGNORE_BLOCK_START = '# resonant-code: generated runtime artifacts';
const GITIGNORE_BLOCK_END = '# /resonant-code';
const GENERATED_GITIGNORE_RULES = [
  '.resonant-code/context/cache/'
];

function readJsonField(rel, field) {
  try {
    const obj = JSON.parse(readFileSync(join(projectRoot, rel), 'utf-8'));
    return obj[field];
  } catch { return undefined; }
}

function ensureRuntimeArtifactsIgnored() {
  const gitignorePath = join(projectRoot, '.gitignore');
  const managedBlock = [
    GITIGNORE_BLOCK_START,
    ...GENERATED_GITIGNORE_RULES,
    GITIGNORE_BLOCK_END,
  ].join('\n');

  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8').replace(/\r\n/g, '\n')
    : '';

  const blockPattern = new RegExp(
    `${escapeForRegex(GITIGNORE_BLOCK_START)}[\\s\\S]*?${escapeForRegex(GITIGNORE_BLOCK_END)}\\n?`,
    'g',
  );
  const withoutManagedBlock = existing.replace(blockPattern, '').trimEnd();
  const next = withoutManagedBlock
    ? `${withoutManagedBlock}\n\n${managedBlock}\n`
    : `${managedBlock}\n`;

  writeFileSync(gitignorePath, next, 'utf-8');
  return relative(projectRoot, gitignorePath).replace(/\\/g, '/');
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Step 1 — Discover available built-in layers by scanning the directory
// ---------------------------------------------------------------------------

/**
 * Recursively collect all valid layer paths under builtinRoot.
 * A "layer" is either:
 *   - a .yaml file           → "builtin/languages/typescript"
 *   - a directory with yamls → "builtin/frameworks/react"
 *
 * Returns a Set of canonical layer strings like "builtin/core",
 * "builtin/languages/typescript", "builtin/task-types/feature", etc.
 */
function discoverBuiltinLayers(root) {
  const layers = new Set();

  function walk(dir, prefix) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);

      if (stat.isDirectory()) {
        const layerPath = `${prefix}/${entry}`;
        // Check if the directory itself contains yaml files (leaf layer)
        const hasYamls = readdirSync(full).some(f => f.endsWith('.yaml'));
        if (hasYamls) layers.add(layerPath);
        // Always recurse — a directory may contain both yaml files and subdirs
        walk(full, layerPath);
      } else if (entry.endsWith('.yaml')) {
        // Single-file layer: strip .yaml extension
        layers.add(`${prefix}/${entry.replace(/\.yaml$/, '')}`);
      }
    }
  }

  walk(root, 'builtin');
  return layers;
}

// ---------------------------------------------------------------------------
// Step 2 — Detect project signals (language + frameworks only)
// Only strong signal files are used — no dependency scanning, no guessing.
// ---------------------------------------------------------------------------

/**
 * Signal rules: each rule maps one or more file existence checks
 * to a { language?, frameworks? } result.
 * Rules are evaluated in order; first match wins for language.
 * All matching framework rules are collected.
 */
const LANGUAGE_SIGNALS = [
  { files: ['tsconfig.json', 'tsconfig.build.json', 'tsconfig.app.json'], language: 'typescript' },
  { files: ['package.json'],                                               language: 'javascript' },
  { files: ['pyproject.toml', 'setup.py', 'setup.cfg'],                   language: 'python'     },
  { files: ['go.mod'],                                                     language: 'go'         },
  { files: ['Cargo.toml'],                                                 language: 'rust'       },
  { files: ['build.gradle', 'build.gradle.kts', 'pom.xml'],               language: 'java'       },
];

const FRAMEWORK_SIGNALS = [
  // JavaScript / TypeScript
  { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],  framework: 'nextjs'  },
  { files: ['nuxt.config.js', 'nuxt.config.ts'],                      framework: 'nuxtjs'  },
  { files: ['remix.config.js', 'remix.config.ts'],                    framework: 'remix'   },
  { files: ['svelte.config.js', 'svelte.config.ts'],                  framework: 'svelte'  },
  { files: ['angular.json'],                                           framework: 'angular' },
  { files: ['nest-cli.json'],                                          framework: 'nestjs'  },
  { files: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'],   framework: 'vite'    },

  // Python
  { files: ['manage.py'],                                              framework: 'django'  },

  // Java
  { files: ['gradlew', 'mvnw'],                                        framework: 'spring'  },
];

function detectLanguage() {
  for (const rule of LANGUAGE_SIGNALS) {
    if (existsAny(rule.files)) return rule.language;
  }
  return null;
}

function detectFrameworks() {
  return FRAMEWORK_SIGNALS
    .filter(rule => existsAny(rule.files))
    .map(rule => rule.framework);
}

function detectPackageManager() {
  const pmField = readJsonField('package.json', 'packageManager');
  if (typeof pmField === 'string') {
    for (const pm of ['pnpm', 'yarn', 'bun', 'npm']) {
      if (pmField.startsWith(pm)) return pm;
    }
  }
  if (exists('pnpm-lock.yaml'))             return 'pnpm';
  if (existsAny(['bun.lockb', 'bun.lock'])) return 'bun';
  if (exists('yarn.lock'))                  return 'yarn';
  if (exists('package-lock.json'))          return 'npm';
  return null;
}

function detectProjectName() {
  return (
    readJsonField('package.json', 'name') ??
    resolve(projectRoot).split('/').at(-1) ??
    'my-project'
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Resolve extends array against discovered layers
// ---------------------------------------------------------------------------

function resolveExtends(language, frameworks, knownLayers) {
  const included    = [];
  const unavailable = [];

  const tryAdd = (layer) => {
    if (knownLayers.has(layer)) {
      included.push(layer);
    } else {
      unavailable.push(layer);
    }
  };

  // core — always first
  tryAdd('builtin/core');

  // language
  if (language) tryAdd(`builtin/languages/${language}`);

  // frameworks — in detection order
  for (const fw of frameworks) tryAdd(`builtin/frameworks/${fw}`);

  // task-types — wildcard, migration excluded by default
  // (wildcard is valid because task-types are stable across tech stacks)
  included.push('builtin/task-types/*');

  return { included, unavailable };
}

// ---------------------------------------------------------------------------
// Step 4 — Generate local-augment.yaml
// ---------------------------------------------------------------------------

function generateLocalAugment(projectName, extendsEntries) {
  const extendsLines = extendsEntries
    .map(e => `    - "${e}"`)
    .join('\n');

  return `# .resonant-code/playbook/local-augment.yaml
# resonant-code · local playbook for this project
#
# Quick start:
#   /rc playbook augment   — add an example to an existing built-in rule
#   /rc playbook add       — add a new project-specific rule
#   /rc playbook status    — see which rules are working
#
# Full format reference: .resonant-code/playbook/directive.template.yaml

version: "1.0"

meta:
  name: "${projectName}"
  extends:
${extendsLines}
  # To load additional layers or switch to multi-file layout, see:
  # https://resonant-code.dev/docs/playbook#local-layers

# Override a built-in rule's prescription, weight, rationale, or exceptions.
# overrides: []

# Add examples to a built-in rule — the lowest-effort way to teach
# resonant-code what good and bad code looks like in this codebase.
# augments: []

# Disable a built-in rule that doesn't apply to this project.
# suppresses: []

# Add rules that don't exist in the built-in playbook.
# additions: []
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!builtinRoot || !existsSync(builtinRoot)) {
    process.stderr.write(`Error: built-in playbook root not found: ${builtinRoot}\n`);
    process.exit(2);
  }

  const playbookDir = join(projectRoot, '.resonant-code', 'playbook');
  const augmentFile = join(playbookDir, 'local-augment.yaml');

  if (!forceFlag && existsSync(augmentFile)) {
    process.stdout.write(JSON.stringify({
      status: 'exists',
      augmentPath: '.resonant-code/playbook/local-augment.yaml',
    }, null, 2) + '\n');
    process.exit(1);
  }

  // Discover, detect, resolve
  const knownLayers    = discoverBuiltinLayers(builtinRoot);
  const language       = detectLanguage();
  const frameworks     = detectFrameworks();
  const packageManager = detectPackageManager();
  const projectName    = detectProjectName();
  const { included, unavailable } = resolveExtends(language, frameworks, knownLayers);

  // Write
  mkdirSync(playbookDir, { recursive: true });
  writeFileSync(augmentFile, generateLocalAugment(projectName, included), 'utf-8');
  const gitignorePath = ensureRuntimeArtifactsIgnored();

  process.stdout.write(JSON.stringify({
    status: 'created',
    detected: { language, frameworks, packageManager },
    extends: { included, unavailable },
    augmentPath: '.resonant-code/playbook/local-augment.yaml',
    gitignore: {
      path: gitignorePath,
      ignored: GENERATED_GITIGNORE_RULES,
    },
  }, null, 2) + '\n');
}

main();
