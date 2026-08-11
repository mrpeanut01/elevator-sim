/**
 * The viewer's bundler configuration — for the dev server **and**, since the app acquired somewhere
 * to be deployed, for a production build.
 *
 * Vite remains a **devDependency**: the package's own library build is `tsc -b` into `dist/`, the
 * tests run under vitest against source, and nothing in `dist/` depends on a bundler. What is new
 * is `npm run build:web`, which bundles `index.html` into `dist-web/` for a web server to hand out.
 * That is a separate output directory on purpose — `dist/` is `tsc`'s, and pointing a bundler at it
 * would have the two build systems overwrite each other's work depending on which ran last.
 *
 * This file is deliberately outside the TypeScript project (`tsconfig.json` includes `src/**` only),
 * so `tsc -b` never compiles it and the shipped library surface cannot come to depend on it.
 *
 * ## The reference data, and why the build does not simply copy `data/`
 *
 * `publicDir` is the repository's `data/`, which serves the whole directory at the web root in dev.
 * On **build**, `copyPublicDir` is `false` and the six documents the viewer actually fetches are
 * emitted explicitly instead.
 *
 * That is not a size optimisation. Copying `data/` wholesale published `data/buildings/README.md`
 * — repository documentation, on the public web, inside the app — and `citations.test.ts` caught it
 * by resolving the README's `../../docs/…` links from their new location and finding six of them
 * pointing at nothing. The test was right twice over: the links were broken *and* the file should
 * never have been there. **The bundle now contains what the viewer requests and nothing else**, and
 * {@link WEB_DATA_FILES} is that list.
 *
 * The buildings are not on it, because the viewer never fetches one: HTTP has no directory listing
 * and hard-coding the ids would make the viewer disagree with `data/` the moment somebody adds a
 * building. So `/__buildings.json` is one document assembled from `data/buildings/*.json`, and
 * {@link buildingsManifest} produces it **twice over**: as dev-server middleware, and as an emitted
 * asset at build time. Both halves call the same {@link readBuildings}, because a manifest that was
 * built one way for the developer and another way for the deployment is two implementations of one
 * contract, and the one nobody looks at is the one that rots.
 *
 * ## Since § D257 the build can also be told where the API is
 *
 * Nothing here decides that; `apiOrigin.mjs` does, and this file registers it. Two things follow
 * from `ELEVATOR_SIM_API_ORIGIN` being set, and they are deliberately one decision rather than two:
 * `index.html` gains `<meta name="elevator-sim-api">`, and `staticwebapp.config.json`'s
 * `connect-src` is widened to permit that origin. A page told where its API is, by a CSP that
 * forbids reaching it, is a site that loads perfectly and cannot do anything — so the two may not
 * be settable apart.
 *
 * **Unset is the shipped state**, and it is what `vite dev` and the `Dockerfile` both build with:
 * no tag is emitted, and the server's own § D243 injection of `"/"` still applies to the bundle it
 * serves. See `apiOrigin.mjs` for the table of which producer fires when.
 *
 * ## The hosting rules travel with the artifact
 *
 * `staticwebapp.config.json` is emitted into the build output so routing, caching and the CSP are
 * versioned beside the code that needs them rather than typed into a portal where no reviewer ever
 * sees them. It declares **no `navigationFallback`**, which is a deviation from the usual
 * single-page-app template and matches `packages/server/src/http/static.ts`'s `assetFor` exactly:
 * the viewer has no client-side router, every real request names a file, and a catch-all rewrite
 * turns a mistyped asset URL into a 200 carrying HTML — a failure that surfaces as a syntax error
 * inside what the browser was told was JavaScript. Two hosts, one 404 policy.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { defineConfig } from 'vite';

import { apiOriginFrom, apiOriginPlugin, hostConfigWithApiOrigin } from './apiOrigin.mjs';

const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));

/** The hosting rules that travel with the artifact — see the header. */
const HOST_CONFIG = fileURLToPath(new URL('./staticwebapp.config.json', import.meta.url));

/**
 * Every file from `data/` that the built viewer serves — derived from the `fetchJson` calls in
 * `src/dev/data.ts`, and deliberately a list rather than a directory copy.
 *
 * If the viewer starts fetching a seventh document, it 404s until that name is added here. That is
 * the intended failure: a missing entry breaks one screen loudly, where copying the directory
 * wholesale silently published everything else in it.
 */
const WEB_DATA_FILES: readonly string[] = Object.freeze([
  'elevator-specs.json',
  'traffic-profiles.json',
  'dispatcher-profiles.json',
  'campaign.json',
  'scenario-goals.json',
  'fixit-cases.json',
]);

/** The manifest body: every `data/buildings/*.json`, by name, sorted so the output is stable. */
async function readBuildings(): Promise<string> {
  const dir = join(DATA_DIR, 'buildings');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      data: JSON.parse(await readFile(join(dir, name), 'utf8')),
    })),
  );
  return JSON.stringify({ files });
}

/** Serves `data/buildings/*.json` as one document — from the dev server, and into the bundle. */
function buildingsManifest() {
  return {
    name: 'elevator-sim-buildings-manifest',
    configureServer(server) {
      server.middlewares.use('/__buildings.json', (_request, response) => {
        void (async () => {
          try {
            response.setHeader('content-type', 'application/json');
            response.end(await readBuildings());
          } catch (error) {
            response.statusCode = 500;
            response.end(
              JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            );
          }
        })();
      });
    },
    /**
     * The same document, as a real file in the output.
     *
     * Without this the built viewer would 404 on `/__buildings.json` and show no buildings at all —
     * and it would do so only once deployed, because the dev server answers the request from
     * middleware that never ships.
     */
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: '__buildings.json', source: await readBuildings() });
      // And the reference data, by name. `copyPublicDir` is off, so this is the only route from
      // `data/` into the bundle — which is what keeps the repository's own documentation out of it.
      for (const name of WEB_DATA_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: await readFile(join(DATA_DIR, name), 'utf8'),
        });
      }
      // The hosting rules, with `connect-src` widened to whatever origin the document was told
      // about — one decision, so a page that knows where its API is is never served by a policy
      // that forbids reaching it. `hostConfigWithApiOrigin` throws rather than silently returning
      // the input when there is no `connect-src 'self'` to widen.
      this.emitFile({
        type: 'asset',
        fileName: 'staticwebapp.config.json',
        source: hostConfigWithApiOrigin(await readFile(HOST_CONFIG, 'utf8'), apiOriginFrom(process.env)),
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
  // The reference data is the viewer's static content in dev. On build it is emitted file by file
  // instead — see the header and `copyPublicDir` below.
  publicDir: DATA_DIR,
  build: {
    // The whole of `data/` is the dev server's to serve and **not** the bundle's to publish. With
    // this on, `data/buildings/README.md` shipped to the web with six broken links in it.
    copyPublicDir: false,
    // Not `dist/`: that is `tsc -b`'s output for the library build, and two build systems writing
    // one directory is a race decided by whichever ran last.
    outDir: 'dist-web',
    emptyOutDir: true,
    // The viewer is a simulator, and a stack trace from minified code in a bug report is worth
    // less than the bytes cost.
    sourcemap: true,
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
  plugins: [buildingsManifest(), apiOriginPlugin(process.env)],
});
