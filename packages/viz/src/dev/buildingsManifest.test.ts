/**
 * The `/__buildings.json` seam, run in both directions.
 *
 * ## What this is guarding
 *
 * `loadBrowserResources()` fetches four documents. Three are files. The fourth is generated, and
 * until `docs/16-static-site-deployment.md` it was generated **only by a `vite dev` middleware** —
 * so `vite build` produced an output in which every asset was present, every building was present,
 * and the one document tying them together was not. The viewer boots, fetches, gets the host's
 * SPA fallback, and dies in `fetchJson` with *"did not parse as JSON"*. Nothing else is wrong.
 *
 * That is this repository's standing defect wearing hosting configuration as a hat: a behaviour
 * that is unit-tested in isolation and produced by nothing on the shipped path. The roadmap's
 * standing requirement asks for the **non-test caller**, and there are now two — both Vite plugins
 * in `buildingsManifest.mjs`, both registered by `vite.config.ts`, both going through one
 * serializer.
 *
 * ## Why this drives the plugins rather than asserting about them
 *
 * A test that re-implemented the manifest and checked it matched would be a second copy of the
 * thing it is checking, and would pass with the emitter deleted. So the test **invokes the two
 * plugin hooks** — `configureServer` for dev, `generateBundle` for build — captures what each one
 * actually produces, and compares those two strings. Changing either serializer, or letting the
 * two drift by a space, fails here.
 *
 * Registration is checked separately, and by reading `vite.config.ts` as **text**. Importing it
 * would pull the config into this package's compilation, which is the one property its own
 * docstring claims it has (`tsc -b` says TS6059 and TS6307 if you try). Reading a config file this
 * package cannot import is the move `elementMap.test.ts` makes against `index.html` and
 * `infra/checks/workflowMatrix.mjs` makes against `ci.yml`.
 *
 * `docs/12` § the standing rule — *move the control and require the run to change* — pointed at a
 * slider. This is the same rule pointed at a bundler hook.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { parseBuilding } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  buildingsManifestPlugin,
  emitStaticDataPlugin,
  HOST_CONFIG_FILE_NAME,
  MANIFEST_FILE_NAME,
  MANIFEST_PATH,
  readBuildingsManifest,
  serializeManifest,
  type BuildingsManifest,
} from '../../buildingsManifest.mjs';

const VIZ_DIR = fileURLToPath(new URL('../../', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const HOST_CONFIG = `${VIZ_DIR}${HOST_CONFIG_FILE_NAME}`;

/* -------------------------------------------------------------------------- *
 * Running the two hooks
 * -------------------------------------------------------------------------- */

/** The Connect-style handler the dev plugin mounts. Named so the capture below reads plainly. */
type Middleware = (
  request: unknown,
  response: {
    statusCode: number;
    setHeader: (key: string, value: string) => void;
    end: (body: string) => void;
  },
) => void;

/** What the dev server writes for a GET of {@link MANIFEST_PATH}. */
async function devServerBody(): Promise<string> {
  const plugin = buildingsManifestPlugin(DATA_DIR);
  expect(plugin.apply, 'the middleware is a dev-server plugin').toBe('serve');

  let mounted: string | undefined;
  let handler: Middleware | undefined;

  plugin.configureServer?.({
    middlewares: {
      use(path, fn) {
        mounted = path;
        handler = fn;
      },
    },
  });

  expect(mounted, 'mounted on the path data.ts fetches').toBe(MANIFEST_PATH);
  if (handler === undefined) throw new Error('configureServer registered no middleware');
  const registered = handler;

  return await new Promise<string>((resolve, reject) => {
    const headers = new Map<string, string>();
    let status = 200;
    registered(
      {},
      {
        get statusCode() {
          return status;
        },
        set statusCode(value: number) {
          status = value;
        },
        setHeader: (key: string, value: string) => headers.set(key.toLowerCase(), value),
        end: (body: string) => {
          // The error path also answers with JSON, so the status is checked before the bytes are
          // trusted — otherwise a 500 whose body happens to parse would read as a pass.
          if (status !== 200) {
            reject(new Error(`dev middleware answered ${String(status)}: ${body}`));
            return;
          }
          expect(headers.get('content-type')).toBe('application/json');
          resolve(body);
        },
      },
    );
  });
}

/** What the build emits as {@link MANIFEST_FILE_NAME}. */
async function builtBody(): Promise<string> {
  const plugin = emitStaticDataPlugin(DATA_DIR, HOST_CONFIG);
  expect(plugin.apply, 'the emitter is a build plugin').toBe('build');

  const emitted: { type: string; fileName: string; source: string }[] = [];
  await plugin.generateBundle?.call({ emitFile: (file) => emitted.push(file) });

  const manifest = emitted.find((file) => file.fileName === MANIFEST_FILE_NAME);
  if (manifest === undefined) {
    throw new Error(
      `the build plugin emitted no ${MANIFEST_FILE_NAME}. ` +
        `Emitted: ${emitted.map((file) => file.fileName).join(', ') || '(nothing)'}`,
    );
  }
  expect(manifest.type).toBe('asset');
  return manifest.source;
}

/* -------------------------------------------------------------------------- *
 * The tests
 * -------------------------------------------------------------------------- */

describe('the buildings manifest', () => {
  it('is the same document in dev and in a production build', async () => {
    // The claim the whole file exists for. Not "both call the same helper" — the two hooks are
    // invoked and their output compared, so a divergence introduced in either one fails here.
    expect(await builtBody()).toBe(await devServerBody());
  });

  it('names exactly the buildings on disk, sorted', async () => {
    const onDisk = (await readdir(`${DATA_DIR}/buildings`)).filter((n) => n.endsWith('.json'));
    const manifest = JSON.parse(await builtBody()) as BuildingsManifest;
    const named = manifest.files.map((file) => file.name);

    expect(named).toEqual([...onDisk].sort());
    // Asserted both ways: a manifest naming a building `data/` does not hold would 404 the fetch,
    // and one that dropped a building would silently shrink the viewer's selector.
    expect(new Set(named)).toEqual(new Set(onDisk));
    expect(named).toEqual([...named].sort());
    expect(named.length).toBeGreaterThan(0);
  });

  it('carries each building verbatim, and every entry parses', async () => {
    const manifest = JSON.parse(await builtBody()) as BuildingsManifest;
    for (const entry of manifest.files) {
      const source: unknown = JSON.parse(
        await readFile(`${DATA_DIR}/buildings/${entry.name}`, 'utf8'),
      );
      expect(entry.data, `${entry.name} is inlined unchanged`).toEqual(source);
      // The manifest is the *only* path by which a building reaches a deployed viewer, so one that
      // does not parse has to fail here rather than in a browser console.
      expect(() => parseBuilding(entry.data, entry.name)).not.toThrow();
    }
  });

  it('is serialized once, by the function both plugins call', async () => {
    expect(await builtBody()).toBe(serializeManifest(await readBuildingsManifest(DATA_DIR)));
  });
});

describe('the bundler config', () => {
  it('registers both plugins, so neither half can be quietly dropped', async () => {
    // Text, not an import — see this file's header. The failure being prevented is real and has a
    // name: with only the dev plugin registered, every test above still passes (they construct the
    // plugins themselves) and the shipped build has no manifest.
    const config = await readFile(`${VIZ_DIR}vite.config.ts`, 'utf8');
    const registered = /plugins:\s*\[([^\]]*)\]/.exec(config)?.[1];

    expect(registered, 'vite.config.ts has a `plugins:` array').toBeDefined();
    expect(registered).toContain('buildingsManifestPlugin(');
    expect(registered).toContain('emitStaticDataPlugin(');
  });
});

describe('the hosting configuration that ships with the artifact', () => {
  it('does not let the SPA fallback swallow the data fetches', async () => {
    // The specific defect: `navigationFallback` rewrites unmatched paths to `/index.html`, so a
    // config without these exclusions answers every `fetchJson` with HTML and a 200. The viewer
    // then fails in `fetchJson` with "did not parse as JSON" — which `data.ts` already has a
    // branch and a comment for, because a dev server did it first.
    const config = JSON.parse(await readFile(HOST_CONFIG, 'utf8')) as {
      navigationFallback: { rewrite: string; exclude: string[] };
    };

    expect(config.navigationFallback.rewrite).toBe('/index.html');
    const exclude = config.navigationFallback.exclude;
    expect(exclude, 'every top-level .json — the manifest and the reference data').toContain(
      '/*.json',
    );
    expect(exclude, 'the hashed bundle and worker chunks').toContain('/assets/*');
    expect(exclude, 'data/buildings/, copied wholesale by publicDir').toContain('/buildings/*');
  });
});
