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
 * # H-ACCESS-1 — coverage. **REFUTED, categorically, with no interval.**
 *
 * On Secure Tower at the interfloor-mix operating point, over 30 replications — `accessControl.ts`
 * at its own budget, seed 20 260 726, re-run **2026-08-06** on the tree carrying § D254 and § D265,
 * and pinned in {@link PINNED_COVERAGE}:
 *
 * | arm | replications with a quotable AWT | undelivered journeys per run | unserved | legs refused at the kiosk, per run |
 * |---|---|---|---|---|
 * | `eta`, `up-down-buttons` — conventional | 19 of 30 | **0.0** | 4.1 % | **0.0** |
 * | `eta`, `destination-entry`, no credential | **0 of 30** | **34.1** | **61.2 %** | **34.1** |
 * | `destination-eta`, `mobile-credential` | 19 of 30 | **0.0** | 4.1 % | **0.0** |
 *
 * **The first and third rows are equal, field for field, and that equality is the refutation.**
 * The hypothesis was that conventional dispatch cannot serve this building and the credential can.
 * Measured at the study's own full budget the two arms are **bit-identical on 150 of 150
 * replications** across all seven of `accessControl.ts`'s identity metrics — the same equality that
 * holds on Midtown Office, which declares no access zones at all. Under conventional dispatch the
 * credential buys *nothing*, on either building. `study.coverage.verdict` returns `'REFUTED'`, and
 * `DECISIONS.md` § D254 is the modelling error it was measuring: `estimateCost` asked the access
 * question about a hall call's **pickup** floor, and a credential governs where you may go rather
 * than where you may be collected.
 *
 * **The two rows that lose their AWT lose it for different reasons, and the grounds are different
 * in kind.** Conventional and credential are **censored** — 3 to 5 of a 50-to-75-person reporting
 * window never served, over the 5 % limit, on 11 of 30 draws, which is § D265's credential gap and
 * not a dispatch failure. The bare kiosk is **saturated** — the queue rises 0.8 to 1.8 persons per
 * minute against a 0.5/min threshold, on 30 of 30. A ragged 11-of-30 is a knife-edge and is
 * reported as one: the count belongs to this seed, the equality of the two arms belongs to the
 * model, and only the second is asserted as a property below.
 *
 * **The last column is what says the two failures are not the same failure.** The column is
 * `StageActivity.kioskRefusedLegs`, which DECISIONS.md § D137 item 2 and § D149 item 2 both record
 * as having no reader in `benchmark/`; it reaches here through `ReplicationRecord`.
 *
 * **The middle row used to read `27.6` and `51.7 %`**, measured before § T50-D1 made a
 * credential-less kiosk refuse the *passenger* rather than the whole landing call; **then `52.2`
 * and `100.0 %`** until § D254 stopped stranding the collateral riders a pickup refusal was
 * costing it. Each move made its own claim look *more* true while the sentence beside it was
 * getting further from the code, which is why the row is pinned rather than argued: a number that
 * still supports its sentence is the only kind nobody re-checks.
 *
 * ## DECISIONS.md § D30's premise, measured rather than cited — **and this half survives**
 *
 * The middle row is the one that decides what a shipped destination profile may author, and it is
 * the one clause of H-ACCESS-1 that § D254 left standing. A kiosk that takes a destination and
 * *not* a credential makes the building **worse than conventional** — 34.1 undelivered journeys
 * against 0.0, and **61 % of journeys unserved against 4.1 %** — because `costRequestFor` forwards
 * the destination and drops the credential, so `estimateCost` is asked whether an unbadged
 * passenger may reach a zoned floor and answers `destinationAccessDenied` for every car. That is
 * authorization of a *destination*, which is the only access question a lift is asked. It is why
 * `data/dispatcher-profiles.json` ships `mobile-credential` and not `destination-entry`, why
 * panel-stage authorization is Phase 6b's work rather than a footnote, and why `arms.ts` keeps
 * `admissibleReplications: 0` on this cell (§ D261).
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
 * | Secure Tower (5 access zones) | **−0.542 [−0.718, −0.366] s** | −0.011 [−0.014, −0.007] |
 * | Midtown Office (no access zones) | **−1.562 [−1.916, −1.208] s** | −0.029 [−0.035, −0.022] |
 * | **Δ_secure − Δ_midtown** | **+1.020 [+0.625, +1.414] s** | **+0.018 [+0.011, +0.025]** |
 *
 * Both buildings gain, both gains exclude zero, and **the difference-of-differences excludes zero on
 * the positive side in both the absolute and the baseline-relative form.** Given the credential,
 * pricing the destination buys *less* where access is controlled, not more. The roadmap's stated
 * mechanism is not what produces the saving.
 *
 * **Where the saving is instead is now an open question rather than an answer, and saying so is
 * § D279's business.** This table used to end *"the saving is in the credential, and that is
 * H-ACCESS-1"*, and H-ACCESS-1 is refuted: the credential buys nothing at all under conventional
 * dispatch. What remains measured is the negative — the same-step mechanism is not what produces
 * the saving — and that is what the seven corrected sites rest on. A positive account of where the
 * −0.542 s and −1.562 s come from is unmeasured, and this suite does not supply one.
 *
 * **The Secure Tower row moved and the Midtown row did not** — `−0.580 → −0.542` against
 * `−1.562 [−1.916, −1.208]` reproducing to the last digit. That is the same control split § D254
 * found on its 60-cell matrix and § D262 on the goal table, arriving on this study: the building
 * that declares `accessZones` moves and the building that declares none does not. The verdict is
 * unchanged in sign, magnitude and word.
 *
 * The mechanism of the refutation is legible, which is what makes it credible rather than a fluke:
 * once the credential is present the access check has **already passed**, so the destination has
 * nothing further to contribute to authorization and all it can do is ordinary ride-time
 * optimization — and Secure Tower's banks are three identical cars over fifteen floors against
 * Midtown's four cars over twenty-one. There is simply less for a destination to differentiate.
 *
 * ## The trap this suite is built to fail, and the assertion that proves it was not fallen into
 *
 * **Secure Tower alone excludes zero and reads as confirmation.** −0.542 s with an interval clear of
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
  WITHDRAWN_COVERAGE,
  coverageKey,
  coveragePinOf,
  derivedCoverageForms,
  formatAccessControlStudy,
  publishedCoverageRow,
  runAccessControlStudy,
  withdrawnCoverageForms,
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

  /*
   * **This case asserted the hypothesis and now asserts its refutation, and the inversion is an
   * equality rather than a negation.**
   *
   * It used to require the conventional arm to lose its AWT on every replication with a
   * double-digit undelivered count, and the credential arm to serve the building completely. Both
   * halves were measuring `estimateCost`'s pickup check (§ D254). The bare negation — *"the
   * conventional arm no longer fails"* — would be a weaker assertion than the one it replaced and
   * would pass against a great many broken simulators. So what is asserted instead is the
   * strongest true statement available: the two arms are **the same run**, on the building whose
   * five access zones were supposed to separate them, at the study's full budget.
   */
  it('finds the credential buying nothing on the access-controlled building — H-ACCESS-1 refuted', async () => {
    const result = await study();
    const conventional = row(result, 'secure-tower', DISCLOSURE_BASELINE);
    const credential = row(result, 'secure-tower', CREDENTIAL_ARM);

    // Conventional dispatch serves this building: nobody undelivered, every run reaching the end of
    // its horizon. That is the clause H-ACCESS-1 got wrong, asserted in the direction it is wrong.
    expect(conventional.meanUndelivered).toBe(0);
    expect(conventional.notCompleted).toBe(0);

    // And the credential arm does not do better, because it does not do anything: bit-identical on
    // every replication the study ran, across all seven identity metrics.
    expect(result.coverage.secureDifferingReplications).toBe(0);
    expect(result.coverage.secureNullIsIdentical).toBe(true);

    // Field for field, on the coverage slice, so the identity is visible in the published counts
    // and not only in the metric samples underneath them.
    for (const field of [
      'notCompleted',
      'withoutQuotableAwt',
      'meanUndelivered',
      'meanUnservedFraction',
      'meanKioskRefusedLegs',
      'quotable',
    ] as const) {
      expect(credential[field], `${field} differs between the two arms on secure-tower`).toBe(
        conventional[field],
      );
    }

    /*
     * The guard that stops the identity above from passing vacuously, and it is on this building
     * rather than on Midtown. A comparison that returned "identical" because the metrics were all
     * NaN, or because both arms had silently become the same profile, would satisfy every
     * assertion so far. The bare kiosk is the same building, the same traffic and the same seed,
     * and it is emphatically not identical to either of them — so the apparatus can tell arms
     * apart here when there is something to tell apart.
     */
    const bare = row(result, 'secure-tower', BARE_KIOSK_ARM);
    expect(bare.meanUndelivered).toBeGreaterThan(0);
    expect(bare.meanUnservedFraction).toBeGreaterThan(conventional.meanUnservedFraction);

    console.log(
      `H-ACCESS-1: conventional and credential are bit-identical on ${result.replications} of ` +
        `${result.replications} secure-tower replications; the bare kiosk leaves ` +
        `${bare.meanUndelivered.toFixed(1)} journeys/run undelivered against their ${conventional.meanUndelivered.toFixed(1)}`,
    );
  }, TIMEOUT_MS);

  it('finds the two identical on the building with no access zones — the half that survived', async () => {
    // A claim of the form "X helps where Y is present" is only half tested by showing it helps.
    // Bit-identity rather than an interval, because that is what was measured: the same argmin over
    // the same cost function on a building where the credential answers a question nobody asks.
    //
    // **This half of H-ACCESS-1 is the one § D254 did not touch, and it is unchanged.** Midtown
    // declares no `accessZones`, so it was never running the defective check; § D254's 60-cell
    // matrix reports it byte-identical before and after, and so does this.
    const result = await study();
    expect(result.coverage.midtownDifferingReplications).toBe(0);
    expect(result.coverage.midtownNullIsIdentical).toBe(true);
    for (const armId of [DISCLOSURE_BASELINE, CREDENTIAL_ARM, BARE_KIOSK_ARM]) {
      const midtown = row(result, 'midtown-office', armId);
      expect(midtown.quotable, armId).toBe(true);
      expect(midtown.meanUndelivered, armId).toBe(0);
      // Including the bare kiosk, and that is the point of listing it: with nothing zoned there is
      // no destination for a credential-less terminal to be refused, so the arm that breaks Secure
      // Tower is inert here. A counter that fired on the call type alone would not be.
      expect(midtown.meanKioskRefusedLegs, armId).toBe(0);
    }

    /*
     * The verdict, asserted as the word the study's own derivation produces.
     *
     * `REFUTED` rather than `CONFIRMED`, and the reason is asserted beside it rather than the word
     * alone: `coverageOf` returns `REFUTED` the moment *any* clause fails, so the word by itself
     * would go on being satisfied by a tree in which the credential arm had broken instead. The
     * reason names the equality, which only one state of the world produces.
     */
    expect(result.coverage.verdict).toBe('REFUTED');
    expect(result.coverage.verdictReason).toMatch(/credential buys nothing/u);
    expect(result.coverage.verdictReason).toContain('secure-tower');
    expect(result.coverage.verdictReason).toContain('midtown-office');
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

  /*
   * The column DECISIONS.md § D137 item 2 and § D149 item 2 record as missing, asserted for the
   * property that makes it worth having rather than for being non-zero somewhere.
   *
   * A test that only said `bare.meanKioskRefusedLegs > 0` would pass just as well if the counter
   * were wired to the unserved count, which is the thing it must not be. So both directions are
   * asserted at the same operating point, on the same 30 replications: **two arms that are both
   * unserved, one of which is refused at the kiosk and one of which is not.**
   *
   * **What the two ways *are* has changed, and the old answer was the defect.** This block used to
   * say the conventional arm's legs die at the pickup for want of a credential on a zoned origin.
   * § D254 deleted that check and the `accessDenied` reason with it. Measured now, the conventional
   * and credential arms are **censored** — a handful of § D265 credential-gap riders in a thin
   * reporting window — and the bare kiosk is **saturated**. The column still separates them and it
   * separates a different pair.
   */
  it('separates the two ways this building goes unserved, which the unserved fraction cannot', async () => {
    const result = await study();
    const conventional = row(result, 'secure-tower', DISCLOSURE_BASELINE);
    const bare = row(result, 'secure-tower', BARE_KIOSK_ARM);
    const credential = row(result, 'secure-tower', CREDENTIAL_ARM);

    // Both arms leave somebody unserved, and the kiosk leaves far more — the premise above, restated
    // so this assertion cannot pass on a building where only one arm is in trouble.
    expect(conventional.meanUnservedFraction).toBeGreaterThan(0);
    expect(bare.meanUnservedFraction).toBeGreaterThan(conventional.meanUnservedFraction);

    // …and only one of them is refused at the interface. This is the discriminating pair.
    expect(conventional.meanKioskRefusedLegs, 'up-down-buttons refuses nothing at a kiosk').toBe(0);
    expect(credential.meanKioskRefusedLegs, 'a credential is not refused at a kiosk').toBe(0);
    expect(bare.meanKioskRefusedLegs).toBeGreaterThan(0);

    // The null half, and it is not a formality: Midtown declares no `accessZones`, so a kiosk with
    // no credential has nothing to refuse there. A counter that fired on call type alone rather
    // than on `(call type, floor)` would be non-zero here, and § D137 § *Why this is narrow* is
    // precisely the claim that it is not.
    expect(row(result, 'midtown-office', BARE_KIOSK_ARM).meanKioskRefusedLegs).toBe(0);

    console.log(
      `kiosk refusals per run on secure-tower: conventional ${conventional.meanKioskRefusedLegs.toFixed(1)}, ` +
        `bare kiosk ${bare.meanKioskRefusedLegs.toFixed(1)}, credential ${credential.meanKioskRefusedLegs.toFixed(1)}`,
    );
  }, TIMEOUT_MS);

  /*
   * The guard that goes red if the column stops being *reported*.
   *
   * The assertion above reads the study object, which is a field; this reads the rendered report,
   * which is what a human sees. They are different failures — a formatter that dropped the column
   * would leave every field assertion in this file green — and the whole of § D137 item 2 is that
   * a value on a result object nobody prints is not a consumer.
   */
  it('prints the kiosk column in the report, at the value pinned for it', async () => {
    const text = formatAccessControlStudy(await study());
    expect(text).toContain('kiosk-refused/run');

    /*
     * **Derived from the pin rather than transcribed beside it**, which is a change § D279 made
     * after this case failed on a literal `29.0` that three other places had already moved past.
     * The literal was a fourth copy of a published number, and a fourth copy is a fourth thing to
     * forget. It is not circular: the pin itself is compared against a fresh run by
     * *"reproduces every pinned coverage row"* below, so this case tests the **formatter** — that
     * the value on the result object reaches the page a human reads — which is the whole of
     * § D137 item 2.
     */
    const pinned = PINNED_COVERAGE['secure-tower/destination-entry-bare'] as PinnedCoverage;
    const line = text
      .split('\n')
      .find((row) => row.includes('secure-tower') && row.includes(BARE_KIOSK_ARM));
    expect(line, 'no secure-tower bare-kiosk row in the printed report').toBeDefined();
    expect(line).toContain(`kiosk-refused/run ${pinned.meanKioskRefusedLegs.toFixed(1).padStart(6)}`);
    // Non-vacuous: the pinned figure has to be a real refusal count, or the assertion above would
    // hold just as well against a formatter printing nothing at all.
    expect(pinned.meanKioskRefusedLegs).toBeGreaterThan(0);

    // And the negative control on the same rendering, so this cannot pass by printing a constant.
    const conventionalLine = text
      .split('\n')
      .find((row) => row.includes('secure-tower') && row.includes(`${DISCLOSURE_BASELINE} `));
    expect(conventionalLine).toMatch(/kiosk-refused\/run\s+0\.0\b/u);
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
      /*
       * Every cell after the arm label, which is `documentation.test.ts`'s rule for the same table
       * in `docs/05-roadmap.md`. **This used to be `slice(-3)`, and it was the weaker of the two:**
       * on a three-column row the last three cells happen to be all of them, but on the four-column
       * row this table now carries it would have silently dropped `0 of 30` — the denominator — and
       * checked the three numbers to its right instead. A guard that reads a fixed number of
       * columns stops reading the first one the moment a column is added, which is the shape of
       * quiet loosening this whole layer exists to prevent.
       */
      rows.push(cells.slice(1).join(' | '));
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
    /*
     * …and every figure this row has ever published is named as history rather than silently
     * deleted, so a reader who finds one in an older document learns which run superseded it.
     *
     * **Both moves are required, not just the latest.** The row has now moved twice — `27.6 |
     * 51.7 %` → `52.2 | 100.0 %` at § T50-D1, and → `34.1 | 61.2 %` at § D254 — and a guard that
     * only demanded the most recent history clause would let the first one be quietly dropped the
     * next time this number moves. `51.7 %` is the figure that survived a fix in three documents;
     * it is the last one this repository should let go of.
     */
    expect(PROSE).toContain('used to read `27.6` and `51.7 %`');
    expect(PROSE).toContain('`52.2`');
  });

  it('renders the two secure-tower credentialled rows identically, and Midtown’s as the zero it is', () => {
    /*
     * **This case is H-ACCESS-1's refutation in the vocabulary the documents print in**, and it
     * used to be the opposite claim: *"the credential row is the one figure in the table that is
     * supposed to be a constant"*, pinned at `30 of 30 | 0.0 | 0.00 %` on Secure Tower. It is not a
     * constant and never was one — it was the reflection of a defect in the conventional arm it was
     * being contrasted against.
     *
     * What replaces it is the same guard pointed at what is true: on the access-zoned building the
     * conventional and credentialled rows render to the **same string** at both published
     * precisions, and on the building with no access zones the credentialled row is still all
     * zeros. A regression that started leaving journeys undelivered under the credential alone
     * would break the first; one that broke both arms together would break the second.
     */
    const conventional = PINNED_COVERAGE['secure-tower/eta'] as PinnedCoverage;
    const credential = PINNED_COVERAGE['secure-tower/destination-eta-unpriced'] as PinnedCoverage;
    for (const places of [1, 2]) {
      for (const kiosk of [false, true]) {
        expect(publishedCoverageRow(credential, places, kiosk)).toBe(
          publishedCoverageRow(conventional, places, kiosk),
        );
      }
    }
    // Non-vacuous in the direction that matters: the shared rendering is a real row rather than an
    // empty one, and the bare kiosk on the same building renders to something else entirely.
    expect(publishedCoverageRow(credential, 1, true)).toBe('19 of 30 | 0.0 | 4.1 % | 0.0');
    expect(
      publishedCoverageRow(PINNED_COVERAGE['secure-tower/destination-entry-bare'] as PinnedCoverage, 1, true),
    ).toBe('0 of 30 | 34.1 | 61.2 % | 34.1');

    // The half of H-ACCESS-1 that survived, at both published precisions.
    const midtown = PINNED_COVERAGE['midtown-office/destination-eta-unpriced'] as PinnedCoverage;
    expect(publishedCoverageRow(midtown, 1)).toBe('30 of 30 | 0.0 | 0.0 %');
    expect(publishedCoverageRow(midtown, 2)).toBe('30 of 30 | 0.0 | 0.00 %');
  });

  it('keeps the withdrawn rows renderable, and out of the live vocabulary', () => {
    /*
     * {@link WITHDRAWN_COVERAGE} is a record rather than a pin, and this is what stops it becoming
     * an allowlist. The two vocabularies must be **disjoint on the rows that moved** — if a
     * withdrawn rendering were also a live one, a document quoting the defect's numbers would pass
     * the live guard and nobody would learn anything.
     */
    const live = derivedCoverageForms();
    const withdrawn = withdrawnCoverageForms();
    expect(withdrawn.size).toBeGreaterThan(0);
    for (const key of Object.keys(WITHDRAWN_COVERAGE)) {
      expect(PINNED_COVERAGE[key], `${key} is withdrawn but no longer measured`).toBeDefined();
    }
    // `secure-tower/destination-eta-unpriced` withdrew as `30 of 30 | 0.0 | 0.0 %`, which is also
    // how Midtown's live credential row renders — so exact disjointness is the wrong test and would
    // be a false alarm. What must be true is that the two rows this study *reports* as moved are
    // not renderable from the live pins at their withdrawn values.
    for (const key of ['secure-tower/eta', 'secure-tower/destination-entry-bare']) {
      const gone = WITHDRAWN_COVERAGE[key] as PinnedCoverage;
      expect(
        live.has(publishedCoverageRow(gone, 1, true)),
        `${key}'s withdrawn rendering is still derivable from PINNED_COVERAGE, so the re-pin did ` +
          'not take and this guard cannot tell a withdrawn figure from a live one',
      ).toBe(false);
      expect(withdrawn.has(publishedCoverageRow(gone, 1, true))).toBe(true);
    }
  });
});
