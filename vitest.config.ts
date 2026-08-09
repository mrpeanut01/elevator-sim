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

/**
 * How long a test in a simulating project may take — GitHub issue #144.
 *
 * **A default rather than an annotation, because the annotation is a list and the list is the
 * defect.** Vitest's own default is 5 000 ms, and a test that runs a real simulation does not fit
 * in it under load: two were reported flaking, a third with identical exposure sat twelve lines
 * from one of them, and a static survey found roughly **82 more** across 23 files that call
 * `recordRun`, `runSimulation` or `legsOf` and pass no timeout. Annotating all of them is total by
 * *inspection* — it fixes today's 82 and not the 83rd, which is written tomorrow by somebody who
 * has never read this paragraph.
 *
 * **The number is measured, not chosen.** Over a full `--project viz` run, 3 193 of 3 213 tests
 * finish inside 2.4 s and only ten exceed the old 5 s default at all; the slowest legitimate test
 * is **49.4 s**. So 300 000 ms is about six times the observed maximum, which is the headroom this
 * suite actually needs — it runs on a machine hosting several parallel worktrees by design, so
 * *under load* is the normal condition here rather than the exceptional one. It is also the value
 * **113 sites in `packages/viz` had already converged on** independently, so the default is what
 * the suite was telling us it wanted, rather than a new opinion.
 *
 * **What it costs, stated rather than glossed.** A genuinely hung pure-function test now takes five
 * minutes to fail instead of five seconds. That is the real price and it is worth paying: a hang is
 * a bug you find once and fix, while a 5 s ceiling under load is a false red that recurs forever and
 * trains people to re-run the suite instead of reading it.
 *
 * **The 113 explicit annotations are deliberately left in place.** They are now redundant, and
 * removing them would be 113 edits whose only effect is to make those sites depend silently on a
 * line in another file. A site that knows it runs a simulation is allowed to say so.
 *
 * A per-test static check was **considered and rejected as the mechanism** — see § D331. A
 * name-level call graph produced 1 881 false positives, and even a correct one cannot tell a test
 * that runs a simulation from one that reads a recording module scope already ran.
 */
const SIMULATING_TIMEOUT_MS = 300_000;

const project = (name: string, timeoutMs?: number) => ({
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
    ...(timeoutMs === undefined ? {} : { testTimeout: timeoutMs, hookTimeout: timeoutMs }),
  },
});

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    projects: [
      /*
       * `core` measures the same way `viz` does — 8 tests over 5 s, slowest **39.2 s** — so it has
       * the same exposure and is covered today only by its own explicit annotations. It is left on
       * vitest's default **deliberately and not by oversight**: issue #144 reported flakes in `viz`
       * and the survey that justified the number above was taken over `packages/viz/src`, so
       * widening to `core` here would be a change nobody has evidence for yet. Filed rather than
       * done, so the next person meets a decision instead of a divergence.
       */
      project('core'),
      project('experiments'),
      project('server'),
      project('cli'),
      project('viz', SIMULATING_TIMEOUT_MS),
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
