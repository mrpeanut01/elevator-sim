import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Workspace-aware test config.
 *
 * Tests colocate with source as `*.test.ts`. Cross-package imports are aliased to
 * package *source* so `vitest run` works without a prior `tsc -b`; type resolution for
 * the same specifiers goes through project references and `dist/index.d.ts`.
 */
const src = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

const alias = {
  // Longest first: these are prefix matches, so `@elevator-sim/core` would otherwise swallow
  // `@elevator-sim/core/browser` and resolve it to `…/core/src/index.ts/browser`. The same holds
  // for `@elevator-sim/experiments/browser`, which is that package's environment-free entry point
  // (`packages/experiments/src/browser.ts`) and is the specifier browser-only code should use,
  // because TypeScript does not apply the `browser` export condition.
  '@elevator-sim/core/browser': fileURLToPath(
    new URL('./packages/core/src/browser.ts', import.meta.url),
  ),
  '@elevator-sim/core': src('core'),
  '@elevator-sim/experiments/browser': fileURLToPath(
    new URL('./packages/experiments/src/browser.ts', import.meta.url),
  ),
  '@elevator-sim/experiments': src('experiments'),
  '@elevator-sim/server': src('server'),
  '@elevator-sim/cli': src('cli'),
  '@elevator-sim/viz': src('viz'),
};

const project = (name: string) => ({
  resolve: { alias },
  test: {
    name,
    root: fileURLToPath(new URL(`./packages/${name}`, import.meta.url)),
    include: ['src/**/*.test.ts'],
    // The browser tier is opted into by name — see the `viz-browser` project below.
    exclude: ['src/**/*.browser.test.ts'],
    environment: 'node' as const,
    // Packages legitimately have no tests until their phase lands.
    passWithNoTests: true,
  },
});

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    projects: [
      project('core'),
      project('experiments'),
      project('server'),
      project('cli'),
      project('viz'),
      /*
       * The browser tier — `DECISIONS.md` § D220, and the only project here that is not hermetic.
       *
       * A **separate project** rather than a widening of `viz`, for two reasons. It launches a real
       * Chromium and a real Vite server, so it is seconds rather than milliseconds and must not sit
       * in the loop somebody runs on every save. And it is the one tier that can fail for reasons
       * that are not about this repository — a missing browser, a busy port — so `npm test` staying
       * green without it is a property worth keeping rather than an oversight.
       *
       * It is `environment: 'node'` like every other project, which is not a contradiction: the
       * browser is driven **out of process**. § D220 § 3's boundary is about the *document* tier,
       * which does not exist yet; this one asserts only that the shipped page loads and draws.
       */
      {
        resolve: { alias },
        test: {
          name: 'viz-browser',
          root: fileURLToPath(new URL('./packages/viz', import.meta.url)),
          include: ['src/**/*.browser.test.ts'],
          environment: 'node' as const,
          testTimeout: 120_000,
          hookTimeout: 120_000,
          passWithNoTests: true,
        },
      },
    ],
  },
});
