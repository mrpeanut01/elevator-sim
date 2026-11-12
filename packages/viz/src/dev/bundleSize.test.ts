/**
 * **`charter S9`'s B2 bundle budget, checked without a browser, so CI reports it in a minute.**
 *
 * `everyday/builtBundle.browser.test.ts` asserts the budget on the `dist-web/` the browser tier
 * serves, and that tier is the slowest leg in `ci.yml`. Twice in the week to 2026-11-12 a pull
 * request learned it had grown the bundle past the 90 % line only after about twenty minutes of
 * browser tests (runs 43162630596 and 43164763071). The measurement needs no browser: it is gzip
 * over what `vite build` emits. So this file builds the same `vite.config.ts` into a directory of
 * its own and holds it to the same assertion, `expectWithinBundleBudget`, and the `guards` job
 * names it.
 *
 * **A directory of its own, never `dist-web/`.** `vite.config.ts` sets `emptyOutDir`, and a local
 * `npm test` runs this project beside `viz-browser`, whose files serve `dist-web/` from a
 * `globalSetup` build. Building over it would empty the directory under a page that is loading it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { BUNDLE_BUDGET_KB, expectWithinBundleBudget } from './bundleSize.test-helper.js';

const VIZ_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VITE_CONFIG = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

let outDir = '';

describe('the shipped bundle, built without a browser (charter S9 B2)', () => {
  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'elevator-sim-bundle-budget-'));
    const { build } = await import('vite');
    await build({
      configFile: VITE_CONFIG,
      root: VIZ_ROOT,
      logLevel: 'error',
      build: { outDir, emptyOutDir: true },
    });
  });

  afterAll(() => {
    if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
  });

  it(`ships no more than ${String(BUNDLE_BUDGET_KB)} kB gzipped, and is not in the last tenth of it`, () => {
    expectWithinBundleBudget(outDir);
  });
});
