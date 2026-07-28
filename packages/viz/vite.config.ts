/**
 * Dev-only bundler configuration.
 *
 * Vite is a **devDependency and nothing else**: the package's own build is `tsc -b`, the tests
 * run under vitest against source, and nothing in `dist/` depends on a bundler. This file
 * exists so `npm run dev -w @elevator-sim/viz` opens a browser on a real building, which is how
 * a human checks the renderer.
 *
 * It is deliberately outside the TypeScript project (`tsconfig.json` includes `src/**` only), so
 * `tsc -b` never compiles it and the shipped surface cannot come to depend on it.
 *
 * Two things it does:
 *
 * 1. Serves the repository's `data/` at the web root, so `dev/data.ts` can fetch the three
 *    top-level JSON files by name.
 * 2. Serves a manifest of `data/buildings/*.json` at `/__buildings.json`, because HTTP has no
 *    directory listing and hard-coding the building ids would make the viewer disagree with
 *    `data/` the moment somebody adds a building.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { defineConfig } from 'vite';

const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));

/** Serves `data/buildings/*.json` as one document. Dev server only; never in a build. */
function buildingsManifest() {
  return {
    name: 'elevator-sim-buildings-manifest',
    configureServer(server) {
      server.middlewares.use('/__buildings.json', (_request, response) => {
        void (async () => {
          try {
            const dir = join(DATA_DIR, 'buildings');
            const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
            const files = await Promise.all(
              names.map(async (name) => ({
                name,
                data: JSON.parse(await readFile(join(dir, name), 'utf8')),
              })),
            );
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ files }));
          } catch (error) {
            response.statusCode = 500;
            response.end(
              JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            );
          }
        })();
      });
    },
  };
}

const NODE_SHIM = fileURLToPath(new URL('./dev-shims/node-builtins.js', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    // `@elevator-sim/core`'s single entry point re-exports `loadConfig`, which imports
    // `node:fs/promises` and `node:path`. Vite's default externalisation stub throws at module
    // *evaluation*, so the whole viewer fails to boot before it runs a line. `viz` may not edit
    // `core`, so the two builtins are aliased to a shim that throws only if actually called —
    // which the browser path never does. See `dev-shims/node-builtins.js` for the proper fix.
    alias: [
      { find: /^node:fs\/promises$/, replacement: NODE_SHIM },
      { find: /^node:path$/, replacement: NODE_SHIM },
    ],
  },
  // The reference data is the viewer's static content in dev. Nothing is copied on build,
  // because there is no production build of this package.
  publicDir: DATA_DIR,
  server: { port: 5174, strictPort: false },
  plugins: [buildingsManifest()],
});
