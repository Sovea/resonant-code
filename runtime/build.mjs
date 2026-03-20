import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (stat.isFile() && extname(full) === '.ts') {
      files.push(full);
    }
  }
  return files;
}

function rewriteImports(code) {
  return code.replace(/(from\s+['"])(.+?)\.ts(['"])/g, '$1$2.mjs$3')
    .replace(/(import\s*\(\s*['"])(.+?)\.ts(['"]\s*\))/g, '$1$2.mjs$3');
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const file of walk(srcDir)) {
  const rel = relative(srcDir, file).replace(/\\/g, '/');
  const outFile = join(distDir, rel.replace(/\.ts$/, '.mjs'));
  const code = readFileSync(file, 'utf-8');
  const stripped = stripTypeScriptTypes(code, { mode: 'strip' });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, rewriteImports(stripped), 'utf-8');
}
