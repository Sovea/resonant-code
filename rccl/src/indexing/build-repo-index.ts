import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { IndexedFile } from '../types.ts';

const SOURCE_EXTENSIONS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.js', 'javascript'], ['.jsx', 'javascript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
  ['.py', 'python'], ['.go', 'go'], ['.rs', 'rust'], ['.java', 'java'], ['.kt', 'kotlin'], ['.swift', 'swift'], ['.vue', 'vue'], ['.svelte', 'svelte'], ['.astro', 'astro'],
]);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '__pycache__', '.resonant-code', '.playbook', 'vendor', 'target']);

export function buildRepoIndex(projectRoot: string, scopeGlob = 'auto'): IndexedFile[] {
  const allFiles = walkDir(projectRoot, projectRoot);
  const filtered = scopeGlob === 'auto' ? autoScope(allFiles) : allFiles.filter((file) => matchScope(file, scopeGlob));
  return filtered.map((file) => indexFile(projectRoot, file)).filter((value): value is IndexedFile => Boolean(value));
}

function walkDir(dir: string, projectRoot: string): string[] {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full, projectRoot));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) results.push(relative(projectRoot, full).replace(/\\/g, '/'));
  }
  return results;
}

function autoScope(files: string[]): string[] {
  const preferredRoots = ['src/', 'lib/', 'app/', 'packages/', 'plugins/', 'cmd/', 'internal/'];
  const preferred = files.filter((file) => preferredRoots.some((root) => file.startsWith(root)));
  return preferred.length > 0 ? preferred : files;
}

function matchScope(file: string, scopeGlob: string): boolean {
  if (scopeGlob === '**' || scopeGlob === '**/*') return true;
  if (scopeGlob.endsWith('/**')) return file.startsWith(scopeGlob.slice(0, -3));
  if (scopeGlob.includes('*')) {
    const escaped = scopeGlob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`).test(file);
  }
  return file === scopeGlob || file.startsWith(`${scopeGlob}/`);
}

function indexFile(projectRoot: string, file: string): IndexedFile | null {
  try {
    const content = readFileSync(join(projectRoot, file), 'utf-8').replace(/\r\n/g, '\n');
    const lines = content.split('\n');
    const language = SOURCE_EXTENSIONS.get(extname(file)) ?? 'unknown';
    const imports = content.match(/\b(import|require|from)\b/g)?.length ?? 0;
    const exports = content.match(/\b(export|module\.exports|pub\s+|func\s+[A-Z]|class\s+)\b/g)?.length ?? 0;
    const symbolMatches = content.match(/\b(function|class|interface|type|const|let|var|def|fn|struct|enum|trait)\b/g)?.length ?? 0;
    const packageRoot = inferPackageRoot(file);
    return {
      path: file,
      language,
      lines: lines.length,
      is_test: /(test|spec)\./.test(file) || file.includes('__tests__'),
      is_generated: /generated|gen\./.test(file),
      package_root: packageRoot,
      imports_count: imports,
      exports_count: exports,
      symbol_density: lines.length === 0 ? 0 : Number((symbolMatches / lines.length).toFixed(3)),
      role_hints: inferRoleHints(file, content),
    };
  } catch {
    return null;
  }
}

function inferPackageRoot(file: string): string {
  const segments = file.split('/');
  if (segments[0] === 'packages' && segments[1]) return `packages/${segments[1]}`;
  if (segments[0] === 'plugins' && segments[1]) return `plugins/${segments[1]}`;
  return segments[0] ?? '.';
}

function inferRoleHints(file: string, content: string): string[] {
  const hints = new Set<string>();
  if (/index\.[^.]+$/.test(file)) hints.add('entry');
  if (/config|settings/.test(file)) hints.add('config');
  if (/cli|command|cmd/.test(file)) hints.add('cli');
  if (/api|route|handler|controller/.test(file)) hints.add('boundary');
  if (/adapter|bridge|gateway/.test(file)) hints.add('adapter');
  if (/interface|type\s+|trait|protocol/.test(content)) hints.add('interface');
  if (/TODO|FIXME|legacy|deprecated/i.test(content)) hints.add('legacy-signal');
  return [...hints];
}
