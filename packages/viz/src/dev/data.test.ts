/**
 * Which documents the viewer fetches by name, and why the list is pinned rather than described.
 *
 * These seven paths are a **cross-package contract with the server**, and until this file existed
 * only one end of it was written down. `server/src/http/static.ts` decides `cache-control` per
 * asset, and a document the viewer re-fetches under a fixed name must never be `immutable`: the
 * name does not change when the bytes do, so a cached copy is never superseded and a reload
 * re-reads it.
 *
 * That went wrong in production. `traffic-profiles.json` matched the server's Vite-hash pattern —
 * `-profiles.json`, and `profiles` is eight characters — so it shipped `max-age=31536000,
 * immutable`. The deploy that added `credentialGap` and the `office-day` template then reached
 * every returning player as a **new bundle reading a year-old payload**: `parseTrafficProfiles`
 * refused the cached file for a missing block, and the viewer showed *"could not load data/"* with
 * no run available at all.
 *
 * `server/src/http/static.test.ts` holds the same seven and asserts none of them is cached. It
 * cannot import this list — invariant 6 keeps `server` and `core` building with `viz` absent — so
 * the two are kept in step from this end: **add a seventh fetch and this test fails**, naming the
 * file that has to learn about it. The assertion is on the requests `loadBrowserResources` really
 * makes rather than on a constant, so a path that moves is caught by the same failure.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

import { loadBrowserResources, loadCampaign, loadFixitCases } from './data.js';

/**
 * The contract, and the reason each entry is on it.
 *
 * Every one is fetched under a name that survives a deploy, so every one must be `no-cache` on the
 * server. `__buildings.json` is Vite's generated manifest of `data/buildings/`; the other five are
 * copies of the files beside them in `data/`.
 */
const EXPECTED_FETCHES = [
  '/__buildings.json',
  '/campaign.json',
  '/dispatcher-profiles.json',
  '/elevator-specs.json',
  '/fixit-cases.json',
  '/scenario-goals.json',
  '/traffic-profiles.json',
] as const;

/** The real shipped bytes, so a stub cannot pass by serving something the parsers would refuse. */
async function serve(path: string): Promise<string> {
  if (path === '/__buildings.json') {
    const { readdir } = await import('node:fs/promises');
    const dir = join(DATA_DIR, 'buildings');
    const names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
    const files = await Promise.all(
      names.map(async (name) => ({
        name,
        data: JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown,
      })),
    );
    return JSON.stringify({ files });
  }
  return readFile(join(DATA_DIR, path.slice(1)), 'utf8');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the documents the viewer fetches by a fixed name', () => {
  it('is exactly the set the server is told not to cache', async () => {
    const requested: string[] = [];
    const modes: (string | undefined)[] = [];
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      requested.push(input);
      modes.push(init?.cache);
      return new Response(await serve(input), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    // All three loaders, because the split is deliberate and none alone is the contract.
    // `loadBrowserResources` is what `dev/batchWorker.ts` runs on every worker start and fetches
    // four; `loadCampaign` is the Campaign panel's only call and fetches two more; `loadFixitCases`
    // is the Fix-a-building panel's only call and fetches the seventh. A test that drove one would
    // leave documents unpinned — which is how `campaign.json` and `scenario-goals.json` came to be
    // absent from the first draft of this list.
    const resources = await loadBrowserResources();
    await loadCampaign(resources);
    await loadFixitCases(resources);

    // Non-vacuous first: a stub that fetched nothing would satisfy a set comparison against an
    // empty list, and every assertion below it would be true of a viewer that loads no data.
    expect(resources.buildings.length).toBeGreaterThan(0);
    expect(resources.trafficProfiles.profiles.length).toBeGreaterThan(0);

    expect([...new Set(requested)].sort()).toEqual([...EXPECTED_FETCHES]);

    // Every one of them revalidated, which is the half of the cache repair a response header
    // cannot do. The clients poisoned by the old `immutable` will not revalidate on their own —
    // that is what `immutable` means — so the request has to ask. Asserted for all seven rather
    // than for the one that broke, because the next stale document will be a different one.
    expect(modes).toEqual(EXPECTED_FETCHES.map(() => 'no-cache'));
  });

  it('includes names a Vite-hash pattern misreads, which is why the server may not go by name', () => {
    // Asserted in the direction that is *true*, and the first draft of this test had it backwards
    // — it required none of these to look hashed, and failed, because two of them do. That is not
    // a flaw in the list, it is the defect: `-profiles.json` puts eight characters of
    // `[A-Za-z0-9_-]` after a hyphen, so Vite's shape matches an ordinary English word.
    //
    // Pinned so that the trap cannot quietly disappear. If someone renames these files and this
    // goes red, the directory rule in `server/src/http/static.ts` is no longer load-bearing for
    // *these* paths and its docstring is telling a story that no longer happens — rewrite it
    // rather than deleting this.
    const VITE_HASH = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/u;
    const misread = EXPECTED_FETCHES.filter((path) => VITE_HASH.test(path));
    expect(misread).toEqual(['/dispatcher-profiles.json', '/traffic-profiles.json']);

    // And every one of them is a fixed path with nothing to bust a cache with — no hash that
    // changes with the bytes, no query string. That is the property that makes `immutable` wrong.
    for (const path of EXPECTED_FETCHES) {
      expect(path, path).not.toContain('?');
    }
  });

  it('fetches traffic-profiles.json, the file the cache defect was found on', async () => {
    // Named on its own because the set assertion above would still pass if this entry were dropped
    // and another added. This is the path that broke the live deploy.
    expect(EXPECTED_FETCHES).toContain('/traffic-profiles.json');
    const raw = JSON.parse(await serve('/traffic-profiles.json')) as { credentialGap?: unknown };
    // And the block whose absence in the cached copy is what the parser refused. If this ever goes
    // away the story above is stale and should be rewritten rather than left to read as current.
    expect(raw.credentialGap).toBeDefined();
  });
});
