/**
 * Bundler configuration — the dev server, and the static production build.
 *
 * Vite is a **devDependency and nothing else**: the package's own build is `tsc -b`, the tests
 * run under vitest against source, and nothing in `dist/` depends on a bundler. This file
 * exists so `npm run dev -w @elevator-sim/viz` opens a browser on a real building, which is how
 * a human checks the renderer — and, since `docs/16-static-site-deployment.md`, so that
 * `npm run build:web` produces the artifact that gets hosted.
 *
 * It is deliberately outside the TypeScript project (`tsconfig.json` includes `src/**` only), so
 * `tsc -b` never compiles it and the shipped surface cannot come to depend on it.
 *
 * Three things it does, and it implements none of them:
 *
 * 1. Serves the repository's `data/` at the web root, so `dev/data.ts` can fetch the three
 *    top-level JSON files by name. On `vite build` the same setting copies them into the output.
 * 2. Registers `buildingsManifestPlugin`, which serves a manifest of `data/buildings/*.json` at
 *    `/__buildings.json` — HTTP has no directory listing, and hard-coding the building ids would
 *    make the viewer disagree with `data/` the moment somebody adds a building.
 * 3. Registers `emitStaticDataPlugin`, which **writes that same manifest into the build output**,
 *    because a production host has no middleware and (2) would otherwise be the one document the
 *    viewer needs and the build does not contain.
 *
 * Both plugins live in `buildingsManifest.mjs` rather than here, and that is not a matter of file
 * size: a test cannot `import` this file without compiling it into the package, which would cost
 * the property the paragraph above claims. Keeping the plugins in an importable module lets
 * `src/dev/buildingsManifest.test.ts` drive both hooks directly, and it checks *this* file — the
 * registration below — by reading it as text. See `docs/16` § 4.
 *
 * ## The production build is static, and that is a property of the app rather than a choice here
 *
 * There is no server half. `core` publishes an fs-free `browser` export condition, the simulation
 * runs in the page (and in `dev/batchWorker.ts`), and the reference data is five JSON files. The
 * output of `vite build` is therefore the whole product, which is what makes a static host the
 * correct target — see `docs/16-static-site-deployment.md` § 1.
 */

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { buildingsManifestPlugin, emitStaticDataPlugin } from './buildingsManifest.mjs';

const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));

/** The hosting rules that travel with the artifact. See `docs/16` § 4. */
const HOST_CONFIG = fileURLToPath(new URL('./staticwebapp.config.json', import.meta.url));

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
  // The reference data is the viewer's static content. In dev it is served from `data/`; on
  // build Vite copies the whole directory into the output, which is why the deployed site reads
  // the same five buildings the repository holds rather than a snapshot taken by hand.
  //
  // One consequence worth stating: `data/buildings/README.md` is copied too. It is 4 kB of
  // documentation on a public URL, which is harmless, and filtering it would mean maintaining an
  // exclusion list that has to stay in step with `data/`. Copying the directory whole is the
  // behaviour that cannot silently drop a building.
  publicDir: DATA_DIR,
  build: {
    // Not `dist/`. That is `tsc -b`'s output for this package and the two must not share a
    // directory — a bundle written over the compiled surface is exactly the stale-`dist/`
    // confusion `.gitignore` line 54 and the § D201 investigation already paid for once.
    outDir: 'dist-web',
    emptyOutDir: true,
    // The viewer is one page that mounts everything; it is not code-split by route because it has
    // no routes. `index-*.js` is ~780 kB raw / ~244 kB gzipped, which is the simulator plus the
    // schema-generated editors, and Vite's 500 kB advisory would otherwise fail nothing while
    // printing on every build. Raised deliberately, with the number recorded here so a genuine
    // regression still has a threshold to cross.
    chunkSizeWarningLimit: 900,
  },
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
  plugins: [buildingsManifestPlugin(DATA_DIR), emitStaticDataPlugin(DATA_DIR, HOST_CONFIG)],
});
