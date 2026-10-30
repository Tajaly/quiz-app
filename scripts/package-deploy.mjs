import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Assembles the self-contained deployable app in .deploy/ (bundled server + built SPA).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDist = path.join(root, 'apps', 'server', 'dist');
const webDist = path.join(root, 'apps', 'web', 'dist');
const out = path.join(root, '.deploy');

for (const required of [path.join(serverDist, 'server.mjs'), path.join(webDist, 'index.html')]) {
  if (!existsSync(required)) {
    console.error(
      `Missing build output: ${path.relative(root, required)}. Run "npm run build" from the repo root.`,
    );
    process.exit(1);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// Source maps stay in the local dist folders; the deployed app does not need them.
const withoutSourceMaps = (source) => !source.endsWith('.map');
await cp(serverDist, out, { recursive: true, filter: withoutSourceMaps });
await cp(webDist, path.join(out, 'public'), { recursive: true, filter: withoutSourceMaps });
await writeFile(
  path.join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: 'power-quiz-app',
      private: true,
      type: 'module',
      scripts: { start: 'node server.mjs' },
      engines: { node: '>=24' },
    },
    null,
    2,
  )}\n`,
);
console.log(`Deployable app written to ${path.relative(root, out)}/`);
