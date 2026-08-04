/**
 * The `/__buildings.json` manifest — one implementation, two consumers.
 *
 * ## Why this file exists
 *
 * `src/dev/data.ts` fetches four documents to boot the viewer. Three of them are files in `data/`
 * and are fetched by name. The fourth is `/__buildings.json`, which is **not a file**: HTTP has no
 * directory listing, so the set of `data/buildings/*.json` has to be served as a document, and
 * until this file existed that document was produced by a middleware in `vite.config.ts` that runs
 * **only under `vite dev`**.
 *
 * That was correct while the package had no production build. It stops being correct the moment one
 * exists: `vite build` copies `publicDir` — so all five buildings land in the output — and then the
 * viewer asks for a manifest that no longer has anything to produce it, gets the host's 404, and
 * dies during `loadBrowserResources()`. Every other asset is present. The page is blank.
 *
 * The failure is not that the manifest was missing from the build. It is that the *only* statement
 * of what the manifest contains lived inside a dev-server hook, where a production build could not
 * reach it. So the statement moved here, and both consumers call it:
 *
 * | Plugin | When | How |
 * |---|---|---|
 * | {@link buildingsManifestPlugin} | `vite dev` | middleware on `/__buildings.json` |
 * | {@link emitStaticDataPlugin} | `vite build` | emits `__buildings.json` into the output |
 *
 * Both live here rather than in `vite.config.ts` so that a test can drive them without importing
 * the config — see below. Neither may format the document itself: {@link serializeManifest} is the
 * only serializer, so the two paths are byte-identical by construction rather than by review.
 *
 * `src/dev/buildingsManifest.test.ts` is the guard. It invokes both hooks and compares their
 * output, and reads `vite.config.ts` as text to assert both are actually registered.
 *
 * ## Why `.mjs` with a hand-written `.d.mts`, outside the TypeScript project
 *
 * Same reason `vite.config.ts` is outside it (`tsconfig.json` includes `src/**` only): this is
 * bundler configuration, and nothing in the shipped surface may come to depend on it.
 *
 * The first draft put the plugins in `vite.config.ts` and had the test `import()` it. That
 * typechecks the config into the project — `tsc -b` reported TS6059 *"not under rootDir"* and
 * TS6307 *"not listed within the file list"* — which is precisely the property the config's own
 * docstring says it has. The subject of a test may not be dragged into a compilation by the act
 * of testing it. So the plugins moved to a module that is `import`able on its own, the config
 * became a consumer, and the *wiring* is checked the way this repository already checks a config
 * file it cannot import: as text, like `elementMap.test.ts` reads `index.html` and
 * `infra/checks/workflowMatrix.mjs` reads `ci.yml`.
 */

import { copyFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** The path `src/dev/data.ts` fetches. The leading `__` marks it as generated, not authored. */
export const MANIFEST_PATH = '/__buildings.json';

/** Its name in a build output directory. */
export const MANIFEST_FILE_NAME = '__buildings.json';

/**
 * Every `data/buildings/*.json`, parsed, sorted by file name.
 *
 * Sorted because the viewer's building selector is populated in manifest order, and a directory
 * read is not ordered. An unsorted manifest would reorder the dropdown between two builds of the
 * same commit — a difference with no cause, which is the kind this repository spends waves on.
 *
 * `README.md` lives in that directory and is filtered by the `.json` test, not by name.
 *
 * @param dataDir Absolute path of the repository's `data/`.
 * @returns `{ files: [{ name, data }] }` — the shape `loadBrowserResources()` destructures.
 */
export async function readBuildingsManifest(dataDir) {
  const dir = join(dataDir, 'buildings');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      data: JSON.parse(await readFile(join(dir, name), 'utf8')),
    })),
  );
  return { files };
}

/**
 * The one serializer.
 *
 * Compact rather than pretty-printed: the document is generated, never read by a human, and
 * inlines five building configs. Pretty-printing it costs bandwidth on every cold load to format
 * something nobody opens.
 */
export function serializeManifest(manifest) {
  return JSON.stringify(manifest);
}

/* -------------------------------------------------------------------------- *
 * The two Vite plugins
 * -------------------------------------------------------------------------- */

/**
 * Dev-server half: serves the manifest at {@link MANIFEST_PATH}.
 *
 * `apply: 'serve'` is load-bearing rather than tidy — without it this plugin is also constructed
 * during a build, where `configureServer` never fires, and the pair would look symmetrical while
 * only one of them did anything.
 *
 * @param dataDir Absolute path of the repository's `data/`.
 */
export function buildingsManifestPlugin(dataDir) {
  return {
    name: 'elevator-sim-buildings-manifest',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(MANIFEST_PATH, (_request, response) => {
        void (async () => {
          try {
            const manifest = await readBuildingsManifest(dataDir);
            response.setHeader('content-type', 'application/json');
            response.end(serializeManifest(manifest));
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

/**
 * Build half: writes the manifest into the output, and the hosting rules beside it.
 *
 * `publicDir` already copies the three top-level JSON files and `buildings/`, so the manifest is
 * the only part of `data/` a plain `vite build` cannot produce — and `staticwebapp.config.json`,
 * which lives beside the config rather than in `data/` because it is hosting configuration and
 * `data/` is the simulator's reference data.
 *
 * Copying the config rather than inlining it keeps it a plain authored file that a reviewer can
 * read and a schema can check, instead of a string inside a bundler plugin. Emitting it into the
 * output keeps the artifact self-describing: `swa deploy`, the GitHub Action and a local
 * `vite preview` all see the same tree.
 *
 * @param dataDir Absolute path of the repository's `data/`.
 * @param hostConfigPath Absolute path of the `staticwebapp.config.json` to ship.
 */
export function emitStaticDataPlugin(dataDir, hostConfigPath) {
  return {
    name: 'elevator-sim-emit-static-data',
    apply: 'build',
    async generateBundle() {
      const manifest = await readBuildingsManifest(dataDir);
      this.emitFile({
        type: 'asset',
        fileName: MANIFEST_FILE_NAME,
        source: serializeManifest(manifest),
      });
    },
    async writeBundle(options) {
      if (options.dir !== undefined && options.dir !== null) {
        await copyFile(hostConfigPath, join(options.dir, HOST_CONFIG_FILE_NAME));
      }
    },
  };
}

/** The hosting rules that travel with the artifact. See `docs/16` § 4. */
export const HOST_CONFIG_FILE_NAME = 'staticwebapp.config.json';
