export default {
  entry: ['./src/index.ts'],
  format: 'esm',
  outDir: 'dist',
  platform: 'node',
  target: 'node22',
  clean: true,
  // Emit the whole TypeScript project before bundling its declarations.
  // Per-file lazy emission can reorder inferred unions between builds.
  dts: { build: true, incremental: false, tsconfig: './tsconfig.build.json' },
  sourcemap: false,
  fixedExtension: true,
  tsconfig: './tsconfig.json',
  hash: false,
};
