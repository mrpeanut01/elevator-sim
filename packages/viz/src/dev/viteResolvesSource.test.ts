/**
 * **The viewer's bundle is built from the workspace's source, never from a `dist/` on disk** — wave
 * AN, lane AN-5, [§ D1317](../../../../DECISIONS.md).
 *
 * The post-AM panel played a bundle made from wave AM's tree beside a `packages/core/dist` last
 * compiled three weeks earlier. Vite resolved `@elevator-sim/core` through the package's `browser`
 * condition to that `dist/browser.js`, so the viewer's own code was current and the simulator under
 * it was not: tenancy repairs faulted because the stale `core` ignored `crowdThinning`, and every
 * handover failed because it had never heard of `adopt-dispatcher`. Nothing in the repository
 * compared `dist/` with `src/`, and the browser tier's own global setup builds the bundle the same
 * way, so a local run of that tier could test a stale simulator too.
 *
 * This resolves every workspace specifier the viewer imports through `vite.config.ts` itself, with
 * Vite's own resolver, and requires a file under the package's `src/`. It reads the specifiers off
 * the viewer's sources rather than listing them, so a new one (`@elevator-sim/server/browser`, say)
 * is checked the day it is first imported. Red before the alias: each resolved to `dist/browser.js`.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VIZ_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(VIZ_ROOT, 'src');
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

/** The members of a Vite dev server this file uses: one resolver call, and a close. */
interface ResolvingServer {
  readonly environments: {
    readonly client: {
      readonly pluginContainer: {
        resolveId(id: string, importer?: string): Promise<{ readonly id: string } | null>;
      };
    };
  };
  close(): Promise<void>;
}

let server: ResolvingServer | undefined;

beforeAll(async () => {
  const { createServer } = (await import('vite')) as unknown as {
    createServer(options: object): Promise<ResolvingServer>;
  };
  server = await createServer({
    configFile: join(VIZ_ROOT, 'vite.config.ts'),
    root: VIZ_ROOT,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });
}, 60_000);

afterAll(async () => {
  await server?.close();
});

/** Every `.ts` file under the viewer's `src/`, tests excluded: what the bundle can reach. */
async function shippedSources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await shippedSources(path)));
    else if (entry.name.endsWith('.ts') && !/\.test(-helper)?\.ts$/u.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(path);
    }
  }
  return out;
}

describe('the bundle resolves the workspace to source — § D1317', () => {
  it('sends every @elevator-sim specifier the viewer imports to a file under that package’s src/', async () => {
    const importers = new Map<string, string>();
    for (const file of await shippedSources(SRC)) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(/from '(@elevator-sim\/[a-z-]+(?:\/[a-z-]+)?)'/gu)) {
        const specifier = match[1];
        if (specifier !== undefined && !importers.has(specifier)) importers.set(specifier, file);
      }
    }
    /* The two the viewer imports today; a third is checked the same way the day it appears. */
    expect([...importers.keys()].sort()).toEqual(
      expect.arrayContaining(['@elevator-sim/core/browser', '@elevator-sim/experiments/browser']),
    );
    /*
     * And the plain forms, from inside the bundle: `experiments`' browser barrel reaches modules
     * that import `@elevator-sim/core` without the subpath, which the `browser` condition used to
     * send to `core/dist/browser.js` as well.
     */
    const barrel = join(REPO, 'packages', 'experiments', 'src', 'browser.ts');
    for (const plain of ['@elevator-sim/core', '@elevator-sim/experiments']) importers.set(plain, barrel);
    const resolved: Record<string, string> = {};
    for (const [specifier, importer] of importers) {
      const answer = await server!.environments.client.pluginContainer.resolveId(specifier, importer);
      resolved[specifier] = answer === null ? '(unresolved)' : relative(REPO, answer.id).split(sep).join('/');
    }
    for (const [specifier, path] of Object.entries(resolved)) {
      const pkg = specifier.split('/')[1];
      expect(path, `${specifier} resolved to ${path}`).toBe(`packages/${String(pkg)}/src/browser.ts`);
    }
  }, 60_000);
});
