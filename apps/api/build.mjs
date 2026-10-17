// Сборка для сервера: один бандл на входную точку, better-sqlite3 — нативный модуль, ставится рядом через npm
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts', 'src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['better-sqlite3'],
  // CJS-зависимости внутри ESM-бандла зовут require
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  sourcemap: true,
  logLevel: 'info',
});
