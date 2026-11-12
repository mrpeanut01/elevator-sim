/**
 * **`charter S9`'s bundle budget, B2 — GitHub issue #238, `docs/31` § 3**, shared by the two places
 * that assert it.
 *
 * `everyday/builtBundle.browser.test.ts` asserts it on the `dist-web/` the browser tier serves, and
 * `dev/bundleSize.test.ts` asserts it on a build of its own in the `viz` project, which the CI
 * `guards` job runs. The second exists to fail fast: the browser tier is the slowest leg, and in the
 * week to 2026-11-12 two pull requests learned of a bundle past the 90 % line only after about
 * twenty minutes of browser tests. One number and one assertion, here, so the two cannot disagree.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect } from 'vitest';

/**
 * **B2, in kilobytes of gzip.**
 *
 * `docs/31` § 3 gives 1 200 and then says, in bold, not to adopt it: *"Set it to the measured value
 * plus 25 % on the first run and tighten it, rather than adopting this figure unmeasured."*
 * Measured on `3404649`, 2026-09-07: **930.0 kB**. Plus 25 % is 1 162.5, so the budget is **1 160**
 * — tighter than the unmeasured ceiling, which is the direction that document asked for.
 *
 * **Raised to 1 240 on 2026-09-11, by the product owner.** GitHub PR #532's CI measured the bundle at
 * **1 046.9 kB** against the 90 % line at 1 044, and a local build of `main` at `099140c5` put it at
 * about 1 043 kB before that PR: the week's merges had grown it from 930.0 kB, and #532 adds about
 * 4 kB gzipped, because `core` ships in the page bundle and in both workers (+1.3 kB each). The owner
 * chose to raise the budget rather than hold #532 for a trim. 1 240 is above the 1 200 `docs/31` § 3
 * named unmeasured, and it is stated here and in `docs/41` § 4.1 so that is visible; the 90 % line
 * was 1 116 kB.
 *
 * **Raised to 1 800 on 2026-09-16, by the product owner, deliberately generous.** CI on the PR
 * merging three lanes (#422 fix-a-building elevation control, #437 destination panels priced per
 * landing, #412 TWIN shafts) MEASURED the bundle at **1 121.534 kB**, past the then-90 % line of
 * 1 116. Isolated by building the pre-wave base (`5a52354`) in its own worktree with the identical
 * toolchain: base total **≈ 1 108.8 kB** gzip (JS 905.97 kB across the page bundle and both
 * workers, data+HTML 202.8 kB) — already within about 7 kB of the old soft line before any of this
 * wave's work — and the three lanes together added **≈ 13–15 kB**, split roughly 13 kB of `core`
 * (present in all three JS bundles: page, `shiftWorker`, `batchWorker` — TWIN's shaft model,
 * separation math and deadlock gate run unconditionally for every car, so none of it is
 * TWIN-building-conditional and none of it can be deferred behind a dynamic import) and 2 kB of
 * `data/price-schedule.json` (`raise-a-floor`, `landing-panels`). Not an accidental dependency: a
 * simulation-kernel feature that runs for every car in every building. The owner chose 1 800 over a
 * tighter figure precisely tracking this wave's measured growth, on the same reasoning as the
 * 2026-09-11 raise: repeatedly relitigating this gate one small increment at a time costs more than
 * headroom does, and the deterministic hard-cap-plus-90%-line shape still catches an accidental
 * dependency long before 1 800 kB. The 90 % line was then 1 620 kB.
 *
 * **Raised to 2 000 kB by the product owner on 2026-11-12 ([§ D1633](../../../../DECISIONS.md)).**
 * GitHub PR #668 (escalator carrying capacity, § D1632) MEASURED **1 628.741 kB** in CI, past the
 * 1 620 kB line. A local build of the base and of that head differed by **≈ 13.2 kB**, almost all
 * of it `core`'s new escalator-queue code paid four times (the page bundle and the `batch`,
 * `morning` and `shift` workers), so the base already stood at ≈ 1 615.5 kB, within 5 kB of the
 * line. Not an accidental dependency. The owner chose a raise over the shared-`core` trim below,
 * which stays the follow-up. The 90 % line is now 1 800 kB.
 *
 * **Worth a note for whoever next measures this**: `core` is bundled separately into all three JS
 * entry points rather than shared, so every byte `core` gains is paid once per bundle (four times
 * since the `morning` worker); splitting it into a shared chunk
 * (`build.rolldownOptions.output.manualChunks` or equivalent) would very likely buy back real headroom, and is the trim `docs/31` § 3 names as the alternative to raising
 * the number — left as a follow-up because it changes how three separate entry points load rather
 * than one number, not because generous headroom makes it unnecessary.
 *
 * Tighten it when the bundle shrinks. Raising it is a visible edit a reviewer can refuse, which is
 * the mechanism `docs/31` asks for in place of a vendor metric whose definition can move underneath
 * the number.
 */
export const BUNDLE_BUDGET_KB = 2_000;

/** One shipped file and what it costs on the wire. */
export interface ShippedFile {
  readonly path: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
}

/**
 * Every file the build emits, gzipped, source maps excluded.
 *
 * `docs/31` defines B2 as *"total transferred bytes for the first load"* and then asks for
 * something the wire cannot quite give: *"B2 is exact and deterministic. Bytes do not vary with
 * runner load."* Collecting responses until interactive is truer to *first load* and is **not**
 * deterministic — which reference documents and which worker have been fetched by that instant is a
 * race, and a budget that moves under load is the flaky gate that section spends four paragraphs
 * warning about, and which `BLOCKED_FRAME_GAP_MS` became (issue #335).
 *
 * So this is a strict **superset** of any first load: it counts both workers and all nine reference
 * documents, some of which boot never fetches. A superset can only fail early, never late — it
 * cannot let a regression through — and it is exactly deterministic, which is what B2 was
 * specified for.
 */
export function shippedFiles(root: string, dir: string = root): readonly ShippedFile[] {
  const out: ShippedFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...shippedFiles(root, full));
      continue;
    }
    /* Excluded by `docs/31`'s own words, and never served to a player. */
    if (entry.endsWith('.map')) continue;
    const raw = readFileSync(full);
    out.push({
      path: relative(root, full),
      rawBytes: raw.byteLength,
      /* Level 9: the CDN compresses, and a budget must not be beaten by a weaker setting. */
      gzipBytes: gzipSync(raw, { level: 9 }).byteLength,
    });
  }
  return out;
}

/** B2's two assertions — the budget and the 90 % line — over the build in `dir`. */
export function expectWithinBundleBudget(dir: string): void {
  const files = [...shippedFiles(dir)].sort((a, b) => b.gzipBytes - a.gzipBytes);

  /*
   * The control, and not ceremony: this reads a directory, and a directory that was not built
   * reads as zero bytes and passes a budget gloriously. That is issue #281 one level down — a
   * tier that served an empty site and stayed green.
   */
  expect(files.length).toBeGreaterThan(5);
  expect(files.some((file) => file.path === 'index.html')).toBe(true);
  expect(files.some((file) => file.path.endsWith('.js'))).toBe(true);

  const totalKb = files.reduce((sum, file) => sum + file.gzipBytes, 0) / 1000;

  /*
   * The table goes in the failure message rather than to `console.log`, because vitest 4
   * intercepts the latter — the trap that made `honesty/measure.corpus.test.ts` necessary. A
   * failure reading only *1 240 > 1 160* sends the next reader off to reproduce a measurement
   * this run already has in hand.
   */
  const table = files
    .map(
      (file) =>
        `  ${file.path.padEnd(40)}${(file.gzipBytes / 1000).toFixed(1).padStart(8)} kB gzip` +
        `${(file.rawBytes / 1000).toFixed(1).padStart(10)} kB raw`,
    )
    .join('\n');

  expect(
    totalKb,
    `the shipped bundle is ${totalKb.toFixed(1)} kB gzipped against a ` +
      `${String(BUNDLE_BUDGET_KB)} kB budget (charter S9 B2, docs/31 § 3). What is in it:\n` +
      `${table}\n` +
      'If this is a dependency that arrived by accident, that is what B2 is for. If it is work ' +
      'the product needs, raising the number is the visible edit docs/31 asks for — and docs/22 ' +
      '§ 6 refuses meeting the budget by cutting a figure the run produced.',
  ).toBeLessThanOrEqual(BUNDLE_BUDGET_KB);

  /*
   * **A ceiling with headroom, not a line the tree sits on.** A gate whose measurement equals its
   * budget is red on the next commit whatever that commit does, and then gets an exemption —
   * which `ci.yml`'s own words call *"where this class of problem goes to be forgotten"*. At
   * 930 kB against 1 160 there is room; this goes red while there is still some.
   */
  expect(
    totalKb,
    `the bundle is inside its budget and has grown into the last tenth of it (${totalKb.toFixed(
      1,
    )} of ${String(BUNDLE_BUDGET_KB)} kB). Look at the growth rather than at the number.`,
  ).toBeLessThanOrEqual(BUNDLE_BUDGET_KB * 0.9);
}
