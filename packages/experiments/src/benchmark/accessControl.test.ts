/**
 * **Phase 6a, unit C2a — the roadmap's access-control sentence, tested and half of it refuted.**
 *
 * `docs/05-roadmap.md` and `packages/core/src/dispatch/lifecycle.ts` both assert, as fact, that
 * destination dispatch does better under access control *"because authorization and optimization
 * happen in the same step."* This suite splits that into the two claims it actually contains and
 * returns **one confirmation and one refutation**.
 *
 * ---
 *
 * # H-ACCESS-1 — coverage. **CONFIRMED, categorically, with no interval.**
 *
 * On Secure Tower at the interfloor-mix operating point, over 30 replications — `accessControl.ts`
 * at its own budget, seed 20 260 726, re-run 2026-07-28 on the tree carrying § T50-D1 and pinned in
 * {@link PINNED_COVERAGE}:
 *
 * | arm | replications with a quotable AWT | undelivered journeys per run | unserved |
 * |---|---|---|---|
 * | `eta`, `up-down-buttons` — conventional | **0 of 30** | 18.2 | 33.5 % |
 * | `eta`, `destination-entry`, no credential | **0 of 30** | **52.2** | **100.0 %** |
 * | `destination-eta`, `mobile-credential` | **30 of 30** | **0.0** | **0.00 %** |
 *
 * **The middle row used to read `27.6` and `51.7 %`**, measured before § T50-D1 made a
 * credential-less kiosk refuse the *passenger* rather than the whole landing call. It moved in the
 * direction that makes its own claim *more* true — a bare kiosk on Secure Tower now serves **nobody
 * at all**, which is § D30's qualitative ruling arriving literally — so no verdict moved and every
 * inequality below held throughout. That is precisely why it had to be re-pinned rather than left:
 * a number that still supports its sentence is the only kind nobody re-checks.
 *
 * Conventional dispatch does not perform *worse* on this building — **it does not perform.** An
 * access-restricted pickup carries no credential under `up-down-buttons`, so every car in the bank
 * answers `accessDenied` and the call is permanently unassignable. `destinationLiveness.ts` counts
 * that one level down: **307 of 331 decisions have every candidate refused**, all 921 verdicts for
 * `accessDenied`, against **0** under the credential. The failure is structural, not load-driven, so
 * no arrival rate rescues it and **no operating point exists at which the two arms could be given a
 * paired interval**. Reported as counts, which is what a categorical outcome gets.
 *
 * And the null half holds exactly: on Midtown Office, which declares no `accessZones`, the
 * credential arm is **bit-identical** to the conventional one on all 30 replications.
 *
 * ## DECISIONS.md § D30's premise, measured rather than cited
 *
 * The middle row is the one that decides what a shipped destination profile may author. A kiosk that
 * takes a destination and *not* a credential makes the building **worse than conventional** — 52.2
 * undelivered journeys against 18.2, and **100 % of journeys unserved against 33.5 %** — because
 * `costRequestFor` forwards the destination and drops the credential, so `estimateCost` is asked
 * whether an unbadged passenger may reach a zoned floor and answers no for every car. On Secure
 * Tower that is *every* journey: every up trip's destination is zoned and every down trip's origin
 * is, so the building is not partly served, it is not served. That is why
 * `data/dispatcher-profiles.json` ships
 * `mobile-credential` and not `destination-entry`, and why panel-stage authorization is Phase 6b's
 * work rather than a footnote.
 *
 * ---
 *
 * # H-ACCESS-2 — optimization. **REFUTED.**
 *
 * `Δ = TTD(credential + destination priced) − TTD(credential alone)`, per building, n = 150 under
 * common random numbers:
 *
 * | building | Δ absolute | Δ relative to its own baseline |
 * |---|---|---|
 * | Secure Tower (5 access zones) | **−0.580 [−0.764, −0.396] s** | −0.011 [−0.015, −0.008] |
 * | Midtown Office (no access zones) | **−1.562 [−1.916, −1.208] s** | −0.029 [−0.035, −0.022] |
 * | **Δ_secure − Δ_midtown** | **+0.982 [+0.584, +1.380] s** | **+0.017 [+0.010, +0.024]** |
 *
 * Both buildings gain, both gains exclude zero, and **the difference-of-differences excludes zero on
 * the positive side in both the absolute and the baseline-relative form.** Given the credential,
 * pricing the destination buys *less* where access is controlled, not more. The roadmap's stated
 * mechanism is not what produces the saving; the saving is in the credential, and that is
 * H-ACCESS-1.
 *
 * The mechanism of the refutation is legible, which is what makes it credible rather than a fluke:
 * once the credential is present the access check has **already passed**, so the destination has
 * nothing further to contribute to authorization and all it can do is ordinary ride-time
 * optimization — and Secure Tower's banks are three identical cars over fifteen floors against
 * Midtown's four cars over twenty-one. There is simply less for a destination to differentiate.
 *
 * ## The trap this suite is built to fail, and the assertion that proves it was not fallen into
 *
 * **Secure Tower alone excludes zero and reads as confirmation.** −0.580 s with an interval clear of
 * zero is a real gain on the access-controlled building, and quoted alone it looks exactly like the
 * roadmap's sentence coming true. It is only against Midtown's *larger* −1.562 s that it reads as
 * refutation. docs/09 § 8 names this as the most likely way Phase 6 publishes a wrong conclusion,
 * *because the wrong answer is the comfortable one* — so the test below asserts the trap explicitly:
 * the single-building interval **does** exclude zero on the confirming side, and the
 * difference-of-differences **does not**.
 *
 * ## What this suite hands back
 *
 * `docs/05-roadmap.md`, `packages/core/src/dispatch/lifecycle.ts` and
 * `docs/06-parameterization-and-tuning.md` each assert the mechanism as fact in prose this
 * measurement contradicts. None of them is this task's to edit; the corrections are listed in
 * `the root DECISIONS.md` § T15-5.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { intervalExcludesZero } from '../validation/harness.js';

import {
  BARE_KIOSK_ARM,
  CREDENTIAL_ARM,
  PINNED_COVERAGE,
  coverageKey,
  coveragePinOf,
  derivedCoverageForms,
  formatAccessControlStudy,
  publishedCoverageRow,
  runAccessControlStudy,
  type AccessControlStudy,
  type CoverageRow,
  type PinnedCoverage,
} from './accessControl.js';
import { DISCLOSURE_BASELINE } from './destinationDisclosure.js';
import { accessControlFigures, checkPinned, describeMismatches, pinMatches } from './published.js';

const TIMEOUT_MS = 900_000;

let cached: AccessControlStudy | undefined;

async function study(): Promise<AccessControlStudy> {
  cached ??= await runAccessControlStudy({});
  return cached;
}

function row(result: AccessControlStudy, building: string, armId: string): CoverageRow {
  const found = result.coverage.rows.find(
    (entry) => entry.building === building && entry.armId === armId,
  );
  if (found === undefined) throw new Error(`no coverage row for ${building}/${armId}`);
  return found;
}

describe('H-ACCESS-1 — coverage, and it is not a confidence interval', () => {
  it('prints the whole report', async () => {
    console.log(formatAccessControlStudy(await study()));
  }, TIMEOUT_MS);

  it('finds conventional dispatch cannot serve the access-controlled building at all', async () => {
    const result = await study();
    const conventional = row(result, 'secure-tower', DISCLOSURE_BASELINE);
    const credential = row(result, 'secure-tower', CREDENTIAL_ARM);

    // Not "worse". Absent. Every replication loses its AWT and a double-digit number of journeys
    // per run is never delivered, so there is no mean to quote and `arms.ts`'s all-arms-valid rule
    // keeps the conventional arm out of any interval table on this building.
    expect(conventional.withoutQuotableAwt).toBe(conventional.replications);
    expect(conventional.quotable).toBe(false);
    expect(conventional.meanUndelivered).toBeGreaterThan(15);

    // …and the credential arm serves it completely.
    expect(credential.withoutQuotableAwt).toBe(0);
    expect(credential.quotable).toBe(true);
    expect(credential.meanUndelivered).toBe(0);
    expect(credential.meanUnservedFraction).toBe(0);
  }, TIMEOUT_MS);

  it('finds the two identical on the building with no access zones — the null half', async () => {
    // A claim of the form "X helps where Y is present" is only half tested by showing it helps.
    // Bit-identity rather than an interval, because that is what was measured: the same argmin over
    // the same cost function on a building where the credential answers a question nobody asks.
    const result = await study();
    expect(result.coverage.midtownDifferingReplications).toBe(0);
    expect(result.coverage.midtownNullIsIdentical).toBe(true);
    for (const armId of [DISCLOSURE_BASELINE, CREDENTIAL_ARM, BARE_KIOSK_ARM]) {
      const midtown = row(result, 'midtown-office', armId);
      expect(midtown.quotable, armId).toBe(true);
      expect(midtown.meanUndelivered, armId).toBe(0);
    }
    expect(result.coverage.verdict).toBe('CONFIRMED');
  }, TIMEOUT_MS);

  it('measures D30’s premise: a kiosk without a credential is worse than no kiosk', async () => {
    // The measurement that decides what `data/dispatcher-profiles.json` is allowed to author. It is
    // not that `destination-entry` fails to help on an access-controlled building — it is that it
    // breaks the building harder than the conventional arm does, because every zoned destination
    // comes back `destinationAccessDenied` on every car.
    const result = await study();
    const bare = row(result, 'secure-tower', BARE_KIOSK_ARM);
    const conventional = row(result, 'secure-tower', DISCLOSURE_BASELINE);
    expect(bare.quotable).toBe(false);
    expect(bare.meanUndelivered).toBeGreaterThan(conventional.meanUndelivered);
    expect(bare.meanUnservedFraction).toBeGreaterThan(conventional.meanUnservedFraction);
    console.log(
      `D30 premise: destination-entry without a credential leaves ${bare.meanUndelivered.toFixed(1)} ` +
        `journeys/run undelivered on secure-tower against conventional's ${conventional.meanUndelivered.toFixed(1)}`,
    );
  }, TIMEOUT_MS);
});

describe('H-ACCESS-2 — the optimization claim, as a difference-of-differences', () => {
  it('REFUTES the roadmap’s mechanism: the destination buys LESS where access is controlled', async () => {
    const { optimization } = await study();

    // Both buildings gain — the destination is worth something everywhere, which is precisely why a
    // single-building interval cannot answer the question.
    expect(optimization.secure.absolute.significant).toBe(true);
    expect(optimization.midtown.absolute.significant).toBe(true);
    expect(optimization.secure.absolute.estimate.mean).toBeLessThan(0);
    expect(optimization.midtown.absolute.estimate.mean).toBeLessThan(0);

    // The difference-of-differences is positive and excludes zero, in **both** forms. Reporting one
    // form alone would be reporting a statement partly about the two buildings' baselines.
    for (const [name, estimate] of [
      ['absolute', optimization.absolute],
      ['relative', optimization.relative],
    ] as const) {
      expect(intervalExcludesZero(estimate), `DoD (${name}) contains zero`).toBe(true);
      expect(estimate.lower, `DoD (${name}) is not positive`).toBeGreaterThan(0);
    }
    expect(optimization.verdict).toBe('REFUTED');
    console.log(`H-ACCESS-2 verdict: ${optimization.verdict} — ${optimization.verdictReason}`);
  }, TIMEOUT_MS);

  it('demonstrates the trap: Secure Tower alone reads as confirmation', async () => {
    // The assertion this whole module exists for. If the study had been run on the access-controlled
    // building alone — the obvious design, and the one the hypothesis's wording invites — it would
    // have produced an interval excluding zero on the confirming side and the phase would have
    // published the roadmap's sentence as measured fact.
    const { optimization } = await study();
    expect(optimization.secure.absolute.estimate.upper).toBeLessThan(0);
    // And the thing that turns that confirmation into a refutation is a *comparison of two gains*,
    // not a better interval on one of them.
    expect(Math.abs(optimization.midtown.absolute.estimate.mean)).toBeGreaterThan(
      Math.abs(optimization.secure.absolute.estimate.mean),
    );
    expect(Math.abs(optimization.midtown.relative.mean)).toBeGreaterThan(
      Math.abs(optimization.secure.relative.mean),
    );
  }, TIMEOUT_MS);

  it('combines the two buildings without pretending they are paired', async () => {
    // Within a building the arms share populations; across buildings nothing is shared, so the two
    // difference series are two independent samples and the interval is Welch's. A paired-t across
    // buildings would be pairing on nothing and would understate the width.
    const { optimization, replications } = await study();
    expect(optimization.secure.n).toBe(replications);
    expect(optimization.midtown.n).toBe(replications);
    expect(Number.isFinite(optimization.absolute.degreesOfFreedom)).toBe(true);
    // Welch's df sits strictly below the pooled `2n − 2` whenever the variances differ, which is
    // the concession that keeps the interval honest.
    expect(optimization.absolute.degreesOfFreedom).toBeLessThan(2 * replications - 2);
    // The correlation CRN bought *within* each building, reported rather than assumed.
    console.log(
      `within-building rho: secure ${optimization.secure.absolute.correlation.toFixed(3)}, ` +
        `midtown ${optimization.midtown.absolute.correlation.toFixed(3)}; ` +
        `Welch df ${optimization.absolute.degreesOfFreedom.toFixed(1)}`,
    );
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * Layer A of the publication guard — see published.ts
 * -------------------------------------------------------------------------- */

describe('the figures this study publishes still come out of it', () => {
  it('reproduces every pinned estimate, at full precision', async () => {
    const mismatches = checkPinned('access-control', accessControlFigures(await study()));
    expect(
      describeMismatches('access-control', mismatches),
      describeMismatches('access-control', mismatches),
    ).toBe('');
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * The same guard for H-ACCESS-1, which is counts and was therefore unguarded
 * -------------------------------------------------------------------------- */

/** This file's own source, so the table above is checked rather than trusted. */
const SOURCE = readFileSync(fileURLToPath(import.meta.url), 'utf8');

/** The module docstring with its comment furniture removed, so a line wrap cannot hide a claim. */
const PROSE = (SOURCE.split('*/')[0] ?? '').replace(/\n\s*\*\s?/g, ' ');

describe('the counts this study publishes still come out of it', () => {
  it('reproduces every pinned coverage row, field for field', async () => {
    // Layer A for a categorical. `checkPinned` cannot hold these — they have no standard error —
    // and until § T50-D1 moved two of them nothing in the suite re-derived them at all. The
    // assertions below this file's table are *inequalities*, and every one of them held while the
    // published figures went stale, which is the whole reason this test exists.
    const measured = (await study()).coverage.rows;
    const mismatches: string[] = [];
    for (const row of measured) {
      const key = coverageKey(row);
      const expected = PINNED_COVERAGE[key];
      if (expected === undefined) {
        mismatches.push(`${key}: measured, but PINNED_COVERAGE does not hold it`);
        continue;
      }
      const actual = coveragePinOf(row);
      for (const field of [
        'replications',
        'notCompleted',
        'withoutQuotableAwt',
        'meanUndelivered',
        'meanUnservedFraction',
      ] as const) {
        if (!pinMatches(expected[field], actual[field])) {
          mismatches.push(
            `${key}.${field}: pinned ${String(expected[field])}, measured ${String(actual[field])}`,
          );
        }
      }
      if (expected.quotable !== actual.quotable) {
        mismatches.push(
          `${key}.quotable: pinned ${String(expected.quotable)}, measured ${String(actual.quotable)}`,
        );
      }
    }
    // Both directions, as `published.test.ts` insists for the intervals: a pin for a row nobody
    // measures any more is as stale as a row nobody pinned.
    for (const key of Object.keys(PINNED_COVERAGE)) {
      if (!measured.some((row) => coverageKey(row) === key)) {
        mismatches.push(`${key}: pinned, but this study no longer produces the row`);
      }
    }
    expect(mismatches.join('\n'), mismatches.join('\n')).toBe('');
  }, TIMEOUT_MS);

  it('publishes no coverage row this file cannot re-derive from a pin', () => {
    // Layer B for a categorical, scoped to the file that prints the table. `published.test.ts`
    // scans `benchmark/` for interval-shaped literals and `51.7 %` is not interval-shaped, so the
    // H-ACCESS-1 table sat outside the publication guard entirely — printed, quoted in six other
    // places, and re-derived by nothing.
    const derivable = derivedCoverageForms();
    const rows: string[] = [];
    for (const line of SOURCE.split('\n')) {
      const trimmed = line.replace(/^\s*\*\s?/, '');
      if (!trimmed.startsWith('|') || !/\bof \d+\b/.test(trimmed)) continue;
      const cells = trimmed
        .split('|')
        .map((cell) => cell.replaceAll('*', '').trim())
        .filter((cell) => cell.length > 0);
      rows.push(cells.slice(-3).join(' | '));
    }
    expect(rows.length, 'the H-ACCESS-1 table is gone, so this guard is checking nothing').toBe(3);
    for (const row of rows) {
      expect(
        derivable.has(row),
        `this file publishes the coverage row "${row}", which no entry of PINNED_COVERAGE renders. ` +
          `Legal renderings: ${[...derivable].join(' / ')}`,
      ).toBe(true);
    }
  });

  it('states D30’s premise in prose the pins render', () => {
    // The table is not the only place a count is published — the paragraph under it quotes two of
    // them as the measurement that decides what `data/dispatcher-profiles.json` may author. A guard
    // that checked only the table would let the sentence drift on its own.
    const bare = PINNED_COVERAGE['secure-tower/destination-entry-bare'] as PinnedCoverage;
    const conventional = PINNED_COVERAGE['secure-tower/eta'] as PinnedCoverage;
    const claim =
      `${bare.meanUndelivered.toFixed(1)} undelivered journeys against ` +
      `${conventional.meanUndelivered.toFixed(1)}, and **${(bare.meanUnservedFraction * 100).toFixed(0)} % ` +
      `of journeys unserved against ${(conventional.meanUnservedFraction * 100).toFixed(1)} %**`;
    expect(PROSE, `the D30-premise sentence no longer states "${claim}"`).toContain(claim);
    // …and the figures it replaced are named as history rather than silently deleted, so a reader
    // who finds `51.7 %` in an older document learns which run superseded it.
    expect(PROSE).toContain('used to read `27.6` and `51.7 %`');
  });

  it('renders the credential row as the zero it is, at both published precisions', () => {
    // The null half of H-ACCESS-1, and the one figure in the table that is *supposed* to be a
    // constant. Pinned so that a regression which started leaving journeys undelivered under the
    // credential would fail here rather than be read as a rounding change.
    const credential = PINNED_COVERAGE['secure-tower/destination-eta-unpriced'] as PinnedCoverage;
    expect(publishedCoverageRow(credential, 1)).toBe('30 of 30 | 0.0 | 0.0 %');
    expect(publishedCoverageRow(credential, 2)).toBe('30 of 30 | 0.0 | 0.00 %');
  });
});
