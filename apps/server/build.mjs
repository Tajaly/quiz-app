import { build } from 'esbuild';

// Bundles the server and all of its dependencies into one ESM file for App Service.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  // Optional native accelerators of `ws` and the dev-only log prettifier are not needed at runtime.
  external: ['bufferutil', 'utf-8-validate', 'pino-pretty'],
  banner: {
    js: [
      "import { createRequire as __pqCreateRequire } from 'node:module';",
      "import { fileURLToPath as __pqFileURLToPath } from 'node:url';",
      "import { dirname as __pqDirname } from 'node:path';",
      'const require = __pqCreateRequire(import.meta.url);',
      'const __filename = __pqFileURLToPath(import.meta.url);',
      'const __dirname = __pqDirname(__filename);',
    ].join('\n'),
  },
});
