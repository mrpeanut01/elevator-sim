/**
 * The test-cost census, its ratchet, and the machine-swing properties of the instrument —
 * GitHub issue #344, [`DECISIONS.md`](../../../DECISIONS.md) § D492.
 *
 * ## The division of labour, which is the whole design
 *
 * **This file gates what is static and publishes what is measured.** `testCost.test-helper.ts`
 * derives both. A census of timeout annotations is a property of the code and can be asserted on
 * every run; an attribution of wall clock is a property of a machine on a day, and § D483 measured
 * that machine moving by 1.82× on identical work. So the second half is a deriver behind an
 * environment gate, on `honesty/measure.corpus.test.ts`'s precedent, and the numbers it produces
 * are published as dated records rather than pinned.
 *
 * ## What is gated, and what that cannot catch
 *
 * Gated: the **count** of annotations above each project's own ceiling, and their **sum**, both as
 * ratchets that may only fall. That is #344's fourth criterion — *no case may be annotated upward* —
 * mechanised rather than promised, and it holds under any machine swing because it reads no clock.
 *
 * Not gated, and not catchable by anything in this file:
 *
 * - **A case getting slower without its annotation changing.** Nothing static can see it, and no
 *   test inside the leg can time the leg. The deriver below is the instrument; running it is a
 *   person's decision.
 * - **The suite growing uniformly.** Every share-based statistic is blind to it *by construction*,
 *   which the case named *is blind to uniform growth* asserts rather than asserts around — a
 *   limitation nobody mechanised is § D227's stale refusal waiting to happen. `cohortRatio` is the
 *   one statistic that sees it, and § D492 measures its resolution at about **15 %**, because a real
 *   contention swing is not uniform: over runs 2.79× apart the pinned cohort moved 2.42×.
 * - **Anything at all when nobody runs it.** No workflow calls the deriver; `.github/` was out of
 *   this lane's scope. Wiring it into CI as an artifact is follow-up work, and it is named as owed
 *   rather than implied to exist.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  annotationCosts,
  attributionOf,
  censusOf,
  ceilingsFrom,
  cohortRatio,
  driftBetween,
  filesCovering,
  formatAttribution,
  formatCensus,
  REPO_ROOT,
  VITEST_CONFIG,
  type Attribution,
  type Census,
} from './testCost.test-helper.js';

const census: Census = censusOf();
const config = readFileSync(VITEST_CONFIG, 'utf8');

/**
 * The above-ceiling population, pinned as a ratchet that may only fall.
 *
 * Derived on `8ff0215`, and derived again on `13e7b93` — the tree #344's own census was taken on —
 * where this scanner reproduces the issue's three published figures exactly (555 numeric
 * annotations, 182 at exactly 300 000 ms, 93 above it) and adds the two the issue's method could not
 * see, because they are written as file-local constants rather than literals.
 *
 * **Raising a number here is a decision, not a fix.** The friction is the point: an annotation above
 * a project's own ceiling is a site saying it knows it costs more than the project budgets for, and
 * #344 exists because ninety-three of those accumulated without anyone measuring one. If a new case
 * genuinely needs one, raise the entry and say why in the same commit — what may not happen is a
 * case being annotated upward to make some *other* check pass, which is that issue's fourth
 * criterion.
 *
 * Only the two `viz` projects are gated, and that is scope rather than judgement: this lane measured
 * the `viz` leg. `experiments` carries **168** above-ceiling annotations of which **123** are named
 * constants, `core` 5, `cli` 2 and `server` 1 — counted by the same scanner, published by the
 * deriver, and gated by nothing here.
 */
const ABOVE_CEILING: ReadonlyMap<string, { readonly count: number; readonly totalMs: number }> =
  new Map([
    ['viz', { count: 89, totalMs: 68_700_000 }],
    ['viz-browser', { count: 63, totalMs: 15_660_000 }],
  ]);

/**
 * Trailing numeric arguments that are **not** annotations, registered so the census can say so.
 *
 * `annotationsIn` declines any trailing argument it cannot attribute to a vitest opener, and the
 * check below asserts that the set of numeric ones is exactly this. Both directions matter: a new
 * entry means the scanner has met a shape it cannot read, and an entry that stops reproducing means
 * a site moved and the registry is decoration. Today there is one, and it is a `setTimeout` inside
 * a helper — a socket that must not hang, closed `}, 2_000);` exactly as a test would be.
 */
const DECLINED_NUMERIC: readonly string[] = ['packages/server/src/http/serve.test.ts:142'];

/**
 * A pinned set of files that stands in for *one unit of this machine* — see `cohortRatio`.
 *
 * Chosen mechanically rather than by taste: every `viz` file whose wall clock sat between 0.5 s and
 * 3 s in the run of 2026-09-05, which is 32 files and 48.0 s, 5.7 % of that run's serial cost. Small
 * files are import-dominated and noisy one at a time; thirty-two of them together are not, and none
 * of them is a simulation sweep whose own cost could drift for reasons that are not the machine.
 *
 * It is a *baseline*, so its own staleness is the hazard: `cohortRatio` returns `present` beside
 * `pinned` and a reader who sees them diverge should re-pin rather than believe the ratio.
 */
const REFERENCE_COHORT: readonly string[] = [
  'packages/viz/src/authoring/roundTrip.test.ts',
  'packages/viz/src/campaign/fitOut.test.ts',
  'packages/viz/src/campaign/reportWindow.test.ts',
  'packages/viz/src/campaign/stageOneParking.test.ts',
  'packages/viz/src/dev/browserTier.test.ts',
  'packages/viz/src/dev/defaults.test.ts',
  'packages/viz/src/dev/dispatcherEditor.test.ts',
  'packages/viz/src/dev/leftRail.test.ts',
  'packages/viz/src/dev/menuPanel.test.ts',
  'packages/viz/src/dev/rightRail.test.ts',
  'packages/viz/src/dev/trafficEditor.test.ts',
  'packages/viz/src/dev/viewerSelector.test.ts',
  'packages/viz/src/editor/editorPreview.test.ts',
  'packages/viz/src/everyday/stageHandover.test.ts',
  'packages/viz/src/frame/frameAt.test.ts',
  'packages/viz/src/honesty/agreement.test.ts',
  'packages/viz/src/live/bands.test.ts',
  'packages/viz/src/menu/boardRun.test.ts',
  'packages/viz/src/menu/howToPlay.test.ts',
  'packages/viz/src/menu/menu.test.ts',
  'packages/viz/src/menu/screens.test.ts',
  'packages/viz/src/mode/glossary.test.ts',
  'packages/viz/src/record/decisionLog.test.ts',
  'packages/viz/src/record/document.test.ts',
  'packages/viz/src/render/runSummary.test.ts',
  'packages/viz/src/shift/banking.test.ts',
  'packages/viz/src/shift/dayLength.test.ts',
  'packages/viz/src/shift/events.test.ts',
  'packages/viz/src/shift/incidents.test.ts',
  'packages/viz/src/shift/reportWindow.test.ts',
  'packages/viz/src/watch/record.test.ts',
  'packages/viz/src/watch/reference.test.ts',
];

describe('the annotation census is derived from the tree, not transcribed', () => {
  it('reads every project ceiling out of vitest.config.ts', () => {
    const ceilings = ceilingsFrom(config);
    // The six the config registers, and the two values it sets.
    expect([...ceilings.keys()].sort()).toStrictEqual([
      'cli',
      'core',
      'experiments',
      'server',
      'viz',
      'viz-browser',
    ]);
    expect(ceilings.get('viz')?.ceilingMs).toBe(300_000);
    expect(ceilings.get('viz-browser')?.ceilingMs).toBe(120_000);
    // Nothing is left on vitest's own default today; the day one is, this says so rather than
    // silently censusing it against 5 000 ms.
    expect([...ceilings.values()].filter((one) => one.isDefault)).toStrictEqual([]);
  });

  it('counts nothing it cannot attribute, and says so where it declines', () => {
    // A numeric trailing argument that reached no opener is either a shape this scanner cannot read
    // or a call that is not a test. Every one is registered with which, and the register is
    // asserted in both directions so it cannot become decoration.
    const missedNumeric = census.unattributed
      .filter((one) => /^[0-9_]+$/u.test(one.argument))
      .map((one) => `${one.file}:${one.line}`);
    expect(missedNumeric).toStrictEqual([...DECLINED_NUMERIC]);

    // An identifier the scanner cannot resolve would be an annotation it cannot price. There are
    // none of those either; what it declines are calls that are not tests at all —
    // `page.evaluate(fn, selector)` and friends — and those are correctly not annotations.
    const unresolved = census.unattributed.filter((one) => one.reason === 'unresolved constant');
    expect(unresolved).toStrictEqual([]);
    expect(census.unattributed.every((one) => one.reason === 'no opener')).toBe(true);
  });

  it('finds the annotations the issue could not, because they are constants rather than literals', () => {
    // The correction #344's census needs: a numeric-literal scan sees 45 above-ceiling annotations
    // in `experiments`, and the population is 168. Named here as a fact about the scanner's reach,
    // and gated nowhere — see ABOVE_CEILING's note on scope.
    const experiments = census.byProject.get('experiments');
    const byConstant = census.annotations.filter(
      (one) => one.project === 'experiments' && one.via === 'constant' && one.ms > 300_000,
    );
    expect(experiments).toBeDefined();
    expect(byConstant.length).toBeGreaterThan(100);
  });

  it('holds the above-ceiling population as a ratchet that may only fall', () => {
    for (const [project, pinned] of ABOVE_CEILING) {
      const measured = census.byProject.get(project);
      expect(measured, `${project} is registered in vitest.config.ts`).toBeDefined();
      const above = measured?.aboveSites ?? [];
      const totalMs = above.reduce((sum, one) => sum + one.ms, 0);
      expect(
        above.length,
        `${project} carries ${above.length} annotations above its own ${measured?.ceilingMs} ms ` +
          `ceiling, and ${pinned.count} were registered. A case may not be annotated upward to ` +
          'satisfy a budget (#344, criterion 4). If this one earns its annotation, raise the ' +
          'entry in ABOVE_CEILING and say why in the same commit.',
      ).toBeLessThanOrEqual(pinned.count);
      expect(
        totalMs,
        `${project}'s above-ceiling annotations now sum to ${totalMs} ms against ${pinned.totalMs} ` +
          'registered. The count can stay level while a value is raised, which is why the sum is ' +
          'here as well as the count.',
      ).toBeLessThanOrEqual(pinned.totalMs);
    }
  });

  it('holds the census vitest.config.ts states to what the tree says', () => {
    // R38, and the reason #344 exists at all: the paragraph this replaces was typed once and
    // checked never — twice, a day apart, on the same docstring. Every count the docstring states
    // is rebuilt here from the tree, so the prose cannot drift without this going red.
    const viz = census.byProject.get('viz');
    const browser = census.byProject.get('viz-browser');
    expect(viz).toBeDefined();
    expect(browser).toBeDefined();

    // `packages/viz` the directory, which is the population the older sentence counts and is not
    // the same population as the `viz` project — the difference is the whole of the correction.
    const directory = census.annotations.filter((one) => one.file.startsWith('packages/viz/'));
    const atSimulatingCeiling = directory.filter((one) => one.ms === 300_000).length;

    for (const claim of [
      `| annotations | ${viz?.total ?? 0} | ${browser?.total ?? 0} |`,
      `| above its own ceiling | **${viz?.above ?? 0}** | **${browser?.above ?? 0}** |`,
      `| at its own ceiling | ${viz?.at ?? 0} | ${browser?.at ?? 0} |`,
      `**${directory.length}** timeout annotations in all, of which **${atSimulatingCeiling}**`,
    ]) {
      expect(
        config,
        `vitest.config.ts no longer states, and the tree now says: ${claim}`,
      ).toContain(claim);
    }
  });
});

/**
 * A minimal report in the reporter's own shape, so the properties below are about the arithmetic
 * rather than about a fixture the arithmetic was written around.
 */
function reportOf(files: readonly (readonly [string, readonly number[]])[], scale = 1): unknown {
  let clock = 1_000_000;
  const testResults = files.map(([name, durations]) => {
    const start = clock;
    const wall = durations.reduce((sum, one) => sum + one, 0) * scale;
    clock += wall;
    return {
      name: `${REPO_ROOT}packages/viz/src/${name}`,
      startTime: start,
      endTime: start + wall,
      status: 'passed',
      assertionResults: durations.map((ms, index) => ({
        title: `case ${index}`,
        fullName: `${name} case ${index}`,
        duration: ms * scale,
        status: 'passed',
      })),
    };
  });
  return { startTime: 1_000_000, testResults };
}

const SHAPE: readonly (readonly [string, readonly number[]])[] = [
  ['heavy.test.ts', [100_000, 40_000, 900]],
  ['middling.test.ts', [20_000, 5_000]],
  ['light.test.ts', [400, 300, 120]],
  ['tiny.test.ts', [30, 20]],
];

describe('the instrument survives a machine swing, and is blind to exactly one thing', () => {
  const base = attributionOf(reportOf(SHAPE));

  it('reports a share and a critical path that do not move when every duration does', () => {
    // § D483's model: one factor, applied to everything. 1.82 is the measured factor.
    const swung = attributionOf(reportOf(SHAPE, 1.82));
    const drift = driftBetween(base, swung);

    expect(drift.scale).toBeCloseTo(1.82, 6);
    expect(drift.totalAbsShareDelta).toBeCloseTo(0, 12);
    expect(drift.criticalPathShareDelta).toBeCloseTo(0, 12);
    expect(drift.rankMoves).toStrictEqual([]);
    expect(swung.criticalPathShare).toBeCloseTo(base.criticalPathShare, 12);
    // And the seconds, which are what a budget would have been written in, move by the whole 1.82.
    expect(swung.serialMs / base.serialMs).toBeCloseTo(1.82, 6);
  });

  it('is blind to uniform growth, which is the limitation stated as a test', () => {
    // A suite where every file got 20 % more expensive for real reasons is arithmetically
    // indistinguishable, in shares, from a machine 20 % slower. Nothing in `driftBetween` can tell
    // them apart, and this asserts that rather than leaving it as a sentence in a docstring.
    const grown = attributionOf(reportOf(SHAPE, 1.2));
    const drift = driftBetween(base, grown);
    expect(drift.totalAbsShareDelta).toBeCloseTo(0, 12);
    expect(drift.worstShareMove?.delta ?? 0).toBeCloseTo(0, 12);
  });

  it('sees one file growing, which is what a share is for', () => {
    // Eight-fold, which is what it takes to pass `heavy.test.ts` — so the rank moves as well as the
    // share, and the two halves of the instrument are both exercised.
    const changed = SHAPE.map(([name, durations]) =>
      name === 'middling.test.ts'
        ? ([name, durations.map((one) => one * 8)] as const)
        : ([name, durations] as const),
    );
    const drift = driftBetween(base, attributionOf(reportOf(changed)));
    expect(drift.worstShareMove?.file).toBe('packages/viz/src/middling.test.ts');
    expect(drift.worstShareMove?.delta ?? 0).toBeGreaterThan(0.1);
    expect(drift.rankMoves.map((one) => `${one.file} ${one.from}->${one.to}`)).toStrictEqual([
      'packages/viz/src/heavy.test.ts 1->2',
      'packages/viz/src/middling.test.ts 2->1',
    ]);
  });

  it('sees absolute growth through a same-run baseline, and reports its own staleness', () => {
    const cohort = ['packages/viz/src/light.test.ts', 'packages/viz/src/tiny.test.ts'];
    const swung = attributionOf(reportOf(SHAPE, 1.82));
    // The machine moves and the ratio does not.
    expect(cohortRatio(swung, cohort).ratio).toBeCloseTo(cohortRatio(base, cohort).ratio, 9);
    // One file grows and the ratio does.
    const grown = SHAPE.map(([name, durations]) =>
      name === 'heavy.test.ts'
        ? ([name, durations.map((one) => one * 2)] as const)
        : ([name, durations] as const),
    );
    expect(cohortRatio(attributionOf(reportOf(grown)), cohort).ratio).toBeGreaterThan(
      cohortRatio(base, cohort).ratio * 1.3,
    );
    // A pinned member that is no longer in the tree is visible rather than silent.
    const stale = cohortRatio(base, [...cohort, 'packages/viz/src/renamed.test.ts']);
    expect(stale.present).toBe(2);
    expect(stale.pinned).toBe(3);
  });

  it('attributes the leg to files and cases, and names the floor concurrency cannot cross', () => {
    expect(filesCovering(base, 0.5)).toBe(1);
    expect(base.criticalPathShare).toBeGreaterThan(0.5);
    expect(base.files[0]?.file).toBe('packages/viz/src/heavy.test.ts');
    expect(base.cases[0]?.ms).toBe(100_000);
    // Everything a file's wall clock is not spent inside a case — imports, collection, hooks.
    expect(base.files.every((one) => one.outsideMs >= 0)).toBe(true);
  });

  it('refuses a report with no clock in it rather than attributing zeroes', () => {
    expect(() => attributionOf({ testResults: [] })).toThrow(/no `testResults`/u);
    expect(() =>
      attributionOf({ startTime: 1, testResults: [{ name: 'x.test.ts', assertionResults: [] }] }),
    ).toThrow(/no clock/u);
  });

  it('prices an annotation against the case it governs, and says when it cannot', () => {
    const attribution = attributionOf(reportOf(SHAPE));
    const [first] = attribution.files;
    expect(first).toBeDefined();
    const priced = annotationCosts(
      [
        {
          file: 'packages/viz/src/heavy.test.ts',
          line: 1,
          opener: 'it',
          name: 'case 0',
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
        {
          file: 'packages/viz/src/heavy.test.ts',
          line: 2,
          opener: 'beforeAll',
          name: undefined,
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
        {
          file: 'packages/viz/src/gone.test.ts',
          line: 3,
          opener: 'it',
          name: 'case 0',
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
        {
          file: 'packages/viz/src/heavy.test.ts',
          line: 4,
          opener: 'it',
          name: 'partitions the legs, on %s',
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
      ],
      attribution,
    );
    expect(priced.map((one) => one.verdict.kind)).toStrictEqual([
      'case',
      'hook',
      'file did not run',
      'name not matched',
    ]);
    const [governed] = priced;
    expect(governed?.verdict.kind === 'case' ? governed.verdict.measuredMs : 0).toBe(100_000);
    expect(governed?.verdict.kind === 'case' ? governed.verdict.headroom : 0).toBeCloseTo(6, 9);
  });
});

/**
 * The deriver: skipped unless asked for, on `honesty/measure.corpus.test.ts`'s precedent.
 *
 * ```
 * npx vitest run --project viz --reporter=json --outputFile=/tmp/vizA.json
 * TEST_COST_REPORT=/tmp/vizA.json TEST_COST_OUT=/tmp/cost.txt \
 *   npx vitest run --project viz packages/viz/src/testCost.test.ts
 * ```
 *
 * `TEST_COST_OUT` alone opens the gate and writes the census; `TEST_COST_REPORT` adds the
 * attribution, `TEST_COST_REPORT_B` adds the drift between two runs — which is the only honest way
 * to say anything about a machine swing, because both readings have to exist before either means
 * anything — and `TEST_COST_ROOT` points the census at another checkout, which is how a published
 * count is shown to have moved or not.
 *
 * It asserts nothing about the figures. R38's remedy is a ratchet or a derivation and never a pin,
 * and a pinned second count is precisely what § D483 refuted.
 */
const reportPath = process.env['TEST_COST_REPORT'];
const secondPath = process.env['TEST_COST_REPORT_B'];
const outPath = process.env['TEST_COST_OUT'];
const rootOverride = process.env['TEST_COST_ROOT'];

describe.skipIf(outPath === undefined)('the test-cost figures, derived rather than transcribed', () => {
  it('writes the census and the attribution where a reporter cannot swallow them', () => {
    /*
     * **The census half needs no report, and that is what makes a base tree measurable.** #344's
     * own figures were taken on `13e7b93` and this file's are taken on the wave branch; the only
     * way to say whether a count *moved* is to run the same scanner over both, which
     * `TEST_COST_ROOT` allows:
     *
     * ```
     * git archive 13e7b93 packages | tar -x -C /tmp/base
     * TEST_COST_ROOT=/tmp/base TEST_COST_OUT=/tmp/base-census.txt \
     *   npx vitest run --project viz packages/viz/src/testCost.test.ts
     * ```
     *
     * The ceilings still come from *this* tree's `vitest.config.ts`, deliberately: a census of an
     * old tree against a moved ceiling would answer a question nobody asked.
     */
    const measured =
      rootOverride === undefined ? census : censusOf(join(rootOverride, 'packages'), VITEST_CONFIG);
    const lines = [
      `# test cost, derived ${new Date().toISOString().slice(0, 10)}`,
      `# tree: ${rootOverride ?? 'this worktree'}`,
      `# report: ${reportPath ?? 'none — census only'}`,
      '',
      formatCensus(measured),
    ];

    if (reportPath !== undefined) {
      const read = (path: string): Attribution =>
        attributionOf(JSON.parse(readFileSync(path, 'utf8')) as unknown);
      const attribution = read(reportPath);
      lines.push(
        '',
        formatAttribution(attribution),
        '',
        `cohort: ${JSON.stringify(cohortRatio(attribution, REFERENCE_COHORT))}`,
      );

      const above = [...(measured.byProject.get('viz')?.aboveSites ?? [])];
      const priced = annotationCosts(above, attribution);
      const cases = priced.filter((one) => one.verdict.kind === 'case');
      const costs = cases
        .map((one) => (one.verdict.kind === 'case' ? one.verdict.measuredMs : 0))
        .sort((a, b) => b - a);
      lines.push(
        '',
        'above-ceiling annotations in the viz project, priced against this run',
        `  joined to a case: ${cases.length}   hooks: ${priced.filter((one) => one.verdict.kind === 'hook').length}` +
          `   file did not run: ${priced.filter((one) => one.verdict.kind === 'file did not run').length}` +
          `   name not matched: ${priced.filter((one) => one.verdict.kind === 'name not matched').length}`,
        `  measured: max ${((costs[0] ?? 0) / 1000).toFixed(1)} s, median ${((costs[Math.floor(costs.length / 2)] ?? 0) / 1000).toFixed(2)} s`,
      );
      for (const amplification of [1, 1.82, 4.5, 9]) {
        lines.push(
          `  past the 300 s ceiling at ${amplification}×: ${costs.filter((one) => one * amplification > 300_000).length}` +
            `   past their own annotation: ${
              cases.filter(
                (one) =>
                  one.verdict.kind === 'case' &&
                  one.verdict.measuredMs * amplification > one.annotation.ms,
              ).length
            }`,
        );
      }
      for (const one of priced
        .filter((entry) => entry.verdict.kind === 'case')
        .sort(
          (a, b) =>
            (b.verdict.kind === 'case' ? b.verdict.measuredMs : 0) -
            (a.verdict.kind === 'case' ? a.verdict.measuredMs : 0),
        )
        .slice(0, 12)) {
        const ms = one.verdict.kind === 'case' ? one.verdict.measuredMs : 0;
        lines.push(
          `  ${(ms / 1000).toFixed(1).padStart(7)} s  annotated ${(one.annotation.ms / 1000).toFixed(0)} s  ${one.annotation.file}:${one.annotation.line}`,
        );
      }

      if (secondPath !== undefined) {
        const drift = driftBetween(attribution, read(secondPath));
        lines.push(
          '',
          `drift against ${secondPath}`,
          `  scale (serial): ${drift.scale.toFixed(4)}`,
          `  Σ|Δshare|: ${drift.totalAbsShareDelta.toFixed(5)}   worst: ${drift.worstShareMove?.file ?? '—'} ${(drift.worstShareMove?.delta ?? 0).toFixed(5)}`,
          `  Δcritical path share: ${drift.criticalPathShareDelta.toFixed(5)}`,
          `  rank moves in the top ten: ${drift.rankMoves.map((one) => `${one.file} ${one.from}->${one.to}`).join(', ') || 'none'}`,
          `  only in one run: ${[...drift.onlyInA, ...drift.onlyInB].join(', ') || 'none'}`,
          `  cohort ratio: ${cohortRatio(attribution, REFERENCE_COHORT).ratio.toFixed(4)} vs ${cohortRatio(read(secondPath), REFERENCE_COHORT).ratio.toFixed(4)}`,
        );
      }
    }

    writeFileSync(outPath as string, `${lines.join('\n')}\n`, 'utf8');
  });
});
