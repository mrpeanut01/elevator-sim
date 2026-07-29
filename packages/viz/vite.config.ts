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

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // No `resolve.alias`. There used to be one: `@elevator-sim/core` published a single entry
  // point that re-exported `loadConfig`, so importing the package pulled `node:fs/promises` and
  // `node:path` into the browser graph, and Vite's externalisation stub for a Node builtin throws
  // at module *evaluation* — the viewer died before running a line. The two builtins were aliased
  // to a throwing shim in `dev-shims/`. Both are deleted: `core` now publishes a `browser` export
  // condition that resolves the plain specifier to its fs-free barrel (`core/src/browser.ts`),
  // which Vite selects on its own for a browser build. `core/src/browser.test.ts` walks that
  // barrel's transitive import graph and fails if a `node:` import returns to it, so the shim
  // cannot become necessary again without a red test first.
  //
  // The reference data is the viewer's static content in dev. Nothing is copied on build,
  // because there is no production build of this package.
  publicDir: DATA_DIR,
  // docs/10 § 2.10 **M16** and § 14 item 6: `.claude/launch.json` declared 5173 and this file
  // declared 5174, so the preview tooling pointed at a port the server does not use. Reconciled
  // on **5174**, because that is the port the server was actually serving and the one any bookmark
  // or driven session already had.
  //
  // `strictPort` is now `true`, which is the half of the fix that stops the disagreement coming
  // back: under `false` a busy 5174 silently becomes 5175 and the tooling is wrong again with
  // nothing said. Failing to start is the honest outcome — it names the conflict instead of
  // hiding it.
  server: { port: 5174, strictPort: true },
  plugins: [buildingsManifest()],
});
