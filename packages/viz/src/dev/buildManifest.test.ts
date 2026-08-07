/**
 * The build hook that produces everything the viewer fetches — driven, not described.
 *
 * ## The defect this exists to catch
 *
 * `loadBrowserResources` and `loadCampaign` fetch six documents by fixed name. One of them,
 * `/__buildings.json`, does not exist in `data/` at all — it is **generated**, because HTTP has no
 * directory listing. The other five are copies of files in `data/`, and `copyPublicDir` is off, so
 * every one of the six reaches the artifact through exactly one place: `vite.config.ts`'s
 * `generateBundle` hook.
 *
 * `boot.browser.test.ts` boots a real browser against a real server and would catch any of them
 * going missing — but it calls `createServer`, so it exercises the **dev middleware**. The hook
 * that fills the deployed artifact has, until this file, been tested by nothing. That is the
 * asymmetry worth stating plainly: the path every test uses is guarded, and the path every *player*
 * uses is not. A `generateBundle` that stopped emitting would leave the whole suite green, the dev
 * server perfect, and the deployed viewer showing no buildings — which is § D289's shape exactly,
 * and § D289 was found in production rather than here.
 *
 * ## Why it drives the hook instead of reading the file
 *
 * A test that re-derived the manifest and compared would be a second copy of the thing it checks,
 * and would pass with the emitter deleted. So this **calls the hook** with a recording `emitFile`
 * and asserts what it actually produced. Delete the emit and this goes red.
 *
 * The config is loaded through a runtime URL rather than a static import, deliberately: importing
 * `vite.config.ts` by path would pull it into this package's compilation, which `tsc -b` refuses
 * (TS6059/TS6307). Reading a config this package cannot import is the move `elementMap.test.ts`
 * makes against `index.html`.
 */

import { readdir } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

/** What a Vite plugin looks like to this test — only the hook it drives. */
interface EmittedAsset {
  readonly type: string;
  readonly fileName: string;
  readonly source: string;
}

interface BundlePlugin {
  readonly name?: string;
  generateBundle?: (this: { emitFile: (asset: EmittedAsset) => void }) => Promise<void> | void;
}

let emitted: EmittedAsset[];

beforeAll(async () => {
  const configUrl = new URL('../../vite.config.ts', import.meta.url).href;
  const module = (await import(configUrl)) as { default: { plugins?: unknown[] } };
  const plugins = (module.default.plugins ?? []).flat() as BundlePlugin[];

  emitted = [];
  const recorder = {
    emitFile: (asset: EmittedAsset): void => {
      emitted.push(asset);
    },
  };
  for (const plugin of plugins) {
    if (typeof plugin?.generateBundle !== 'function') continue;
    await plugin.generateBundle.call(recorder);
  }
}, 60_000);

/**
 * Every document the viewer fetches by a fixed name.
 *
 * The same six `dev/data.test.ts` pins from the other end — it asserts these are what
 * `loadBrowserResources` and `loadCampaign` request, this asserts the build emits them. A seventh
 * fetch added there without a line in `vite.config.ts` fails here, which is the 404 it would
 * otherwise become only once deployed.
 */
const FETCHED = [
  '__buildings.json',
  'campaign.json',
  'dispatcher-profiles.json',
  'elevator-specs.json',
  'scenario-goals.json',
  'traffic-profiles.json',
] as const;

describe('the build emits everything the viewer fetches', () => {
  it('runs the hook at all, or every assertion below is vacuous', () => {
    // A config whose plugin list moved, or a hook that stopped being a function, would leave this
    // empty and quietly satisfy a `toContain` on nothing.
    expect(emitted.length).toBeGreaterThanOrEqual(FETCHED.length);
  });

  it('emits every fetched document by name', () => {
    const names = emitted.map((asset) => asset.fileName);
    for (const name of FETCHED) expect(names, name).toContain(name);
  });

  it('emits the hosting rules, which no test can see from the dev server', () => {
    // `staticwebapp.config.json` is what sets `cache-control` on the static lane — the header
    // whose server-side twin shipped `traffic-profiles.json` immutable for a year (§ D289). It
    // exists only in the built artifact.
    expect(emitted.map((asset) => asset.fileName)).toContain('staticwebapp.config.json');
  });

  it('emits a manifest naming every building on disk, not a stale list', () => {
    // The generated one, and the reason it is generated: a manifest that had drifted from
    // `data/buildings/` would leave a shipped building unreachable with nothing to notice it.
    const manifest = emitted.find((asset) => asset.fileName === '__buildings.json');
    expect(manifest).toBeDefined();
    const parsed = JSON.parse(manifest?.source ?? '{}') as {
      files?: { name: string; data: unknown }[];
    };
    expect(parsed.files?.length ?? 0).toBeGreaterThan(0);
    return readdir(new URL('buildings/', `file://${DATA_DIR}/`).pathname).then((entries) => {
      const onDisk = entries.filter((name) => name.endsWith('.json')).sort();
      expect((parsed.files ?? []).map((file) => file.name).sort()).toEqual(onDisk);
    });
  });

  it('emits every document as a real body rather than an empty asset', () => {
    // An emit that produced the right names and no bytes would satisfy every assertion above and
    // ship a viewer that parses `''` as JSON and dies in `fetchJson`.
    for (const name of FETCHED) {
      const asset = emitted.find((entry) => entry.fileName === name);
      expect(typeof asset?.source, name).toBe('string');
      expect((asset?.source ?? '').length, name).toBeGreaterThan(2);
    }
  });
});
