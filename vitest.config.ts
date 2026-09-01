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
 *
 * ## It is three projects now, and the name is kept on purpose — § D394, GitHub issue #149
 *
 * `core` and `server` take the same constant. The name still says *simulating* because § D331 and
 * § D361 both cite it by that name and those are dated records, not prose to be rewritten; and
 * because it is still what the majority of the covered tests do. The one place the name is narrower
 * than the property is worth knowing rather than renaming around: `packages/server/src/store/
 * store.test.ts` boots a whole PostgreSQL-in-WebAssembly per fixture and **references no simulation
 * entry point at all**, yet it is the file whose three `accounts` cases were reported timing out at
 * 5 000 ms under load. The property this constant serves is *does not fit vitest's default on a
 * loaded machine*; simulating is its commonest cause and not its only one.
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
       * `core` and `server` take the same constant as `viz` — GitHub issue #149, § D394.
       *
       * The comment that used to stand here said `core` was left on vitest's default *deliberately
       * and not by oversight*, because the survey justifying the number above was taken over
       * `packages/viz/src` and widening on the strength of a measurement taken for a different
       * question would be evidence-free. That was the right call in § D331 and the evidence has
       * since arrived, so the omission is closed rather than restated.
       *
       * Re-derived on this tree rather than inherited: **43 of `core`'s 112 test files reference a
       * simulation entry point, holding 628 `it()` openers**, which is materially larger than the
       * ~82 across 23 files the `viz` survey found. `server` is the sharper case — four of its
       * thirteen test files simulate, and the file that actually failed is not one of them.
       *
       * Both projects were confirmed on this tree to resolve to the 5 000 ms default empirically,
       * by running an unannotated six-second case in each and reading vitest's own
       * `Test timed out in 5000ms`, rather than by reading this object back.
       *
       * `experiments` joined third — GitHub issue #310, § D418 — and the sentence that used to
       * stand here is why it is worth spelling out rather than just editing. It read:
       * *"`experiments` and `cli` are left alone, and that is a measurement rather than an
       * omission: **neither has been reported failing at the default**"*. That was true when it
       * was written and stopped being true the moment one was reported, which makes it § D227's
       * stale refusal — a sentence telling the next reader not to look, on the file that decides
       * whether they need to.
       *
       * The report: `validation/shippedRunConfig.test.ts`'s whole-tree importer scan failing at
       * **5 454 ms** inside `--project experiments src/validation/` while two deep tiers ran in
       * the background at load average ~12, and passing alone under that same background load.
       *
       * **The case is not intrinsically near its ceiling, and that is the finding.** Surveyed on
       * this tree with the ceiling lifted to 900 000 ms so the numbers are costs rather than
       * truncations, that case costs **0.60 s** and its whole 24-case file costs **1.04 s**. Load
       * amplified it about ninefold. So annotating it would fix the one case that happened to be
       * observed under load and none of the others sitting in the same place, which is this
       * section's own rejected argument for `viz` reaching `experiments` unchanged.
       *
       * **It is a class, and the class is measured.** Of 1 361 tests, **1 314 finish inside
       * 2.4 s** and **20 sit between 1.5 s and the 5 000 ms ceiling**. At the amplification that
       * produced the report, every one of those twenty exceeds the default.
       *
       * **The number means something different here than it does for `viz`, and reusing its
       * justification would be wrong.** For `viz`, 300 000 ms is about six times the observed
       * maximum. `experiments`' slowest test is `benchmark/selectionSweep.test.ts` at **1 017 s**,
       * so 300 000 ms is a third of *its* maximum. What makes the constant right anyway is that
       * the population relying on the default is not the whole population: every test above
       * 5 000 ms that is green in CI today is **necessarily** annotated already, or the default
       * would be failing it. The slowest test that actually depends on this line is therefore
       * under 5 s, and 300 000 ms is roughly sixty times it. The three tests past the constant —
       * 1 017 s, 559 s and 393 s — keep their own `TIMEOUT_MS`, which still wins.
       *
       * **No case is annotated to close this.** `shippedRunConfig.test.ts` already declares
       * `const TIMEOUT_MS = 300_000` and already applies it at three sites; the two whole-tree
       * scans are simply not among them. Adding a fourth would fix today's case and leave the
       * other nineteen, so the mechanism is the default and the file's constant is left as the
       * corroboration it is — that file had independently decided on this same number.
       *
       * Confirmed empirically in both directions rather than by reading this object back, as
       * `core` and `server` were: an unannotated six-second case in `experiments` reported
       * vitest's own `Test timed out in 5000ms` before this line (exit 1), and passes after it
       * (6.01 s, exit 0).
       *
       * **The original red was not reproduced here, and that is said rather than glossed.** On a
       * 4-core container with twelve spinners the load average reached ~6.7 and the reported
       * file's test time went 1.56 s → 4.79 s: amplified, under the ceiling, and passing with and
       * without this line. The 5 454 ms failure stands as measured under load ~12 with two deep
       * tiers running. This line rests on the survey above and on the probe, not on a red anybody
       * re-ran.
       *
       * `cli` is still left alone, and now that is the whole of the claim: it has not been
       * reported failing at the default and no survey has been taken over it.
       */
      project('core', SIMULATING_TIMEOUT_MS),
      project('experiments', SIMULATING_TIMEOUT_MS),
      project('server', SIMULATING_TIMEOUT_MS),
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
          /*
           * **The tier serves the artifact players load, and this line is what makes that
           * affordable** — GitHub issue #281, § D425.
           *
           * Until wave I, 32 of the tier's 33 files started a `vite dev` server while `dist-web/` is
           * what ships. This global setup runs `vite build` **once**, before any file is collected;
           * each file then serves that one output with `preview()` and keeps its own port. A build
           * per file was measured and rejected — 4.5 s × 32 against 4.5 s × 1 for the same artifact.
           *
           * It is a `*.test-helper.ts` under `src/dev/` rather than a loose script beside
           * `vite.config.ts` on purpose: that path is inside `packages/viz/tsconfig.json`'s
           * `include`, so `npm run build` typechecks it, and `deadCode.test-helper.ts#isTest`
           * classifies it honestly instead of reporting its exports as a dead seam.
           *
           * The build is skipped when there is no Chromium, because the tier is skipped then too.
           * That is the one place the gate is read outside a test, and it is read from the module
           * that owns it rather than from a second copy of `existsSync`.
           */
          globalSetup: ['./src/dev/browserTierSite.test-helper.ts'],
        },
      },
    ],
  },
});
