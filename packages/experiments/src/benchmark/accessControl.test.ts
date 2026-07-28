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
 * On Secure Tower at the interfloor-mix operating point, over 30 replications:
 *
 * | arm | replications with a quotable AWT | undelivered journeys per run | unserved |
 * |---|---|---|---|
 * | `eta`, `up-down-buttons` — conventional | **0 of 30** | 18.2 | 33.5 % |
 * | `eta`, `destination-entry`, no credential | **0 of 30** | **27.6** | **51.7 %** |
 * | `destination-eta`, `mobile-credential` | **30 of 30** | **0.0** | **0.00 %** |
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
 * takes a destination and *not* a credential makes the building **worse than conventional** — 27.6
 * undelivered journeys against 18.2 — because `costRequestFor` forwards the destination and drops
 * the credential, so `estimateCost` is asked whether an unbadged passenger may reach a zoned floor
 * and answers no for every car. That is why `data/dispatcher-profiles.json` ships
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
 * `DECISIONS-T15.md` § T15-5.
 */

import { describe, expect, it } from 'vitest';

import { intervalExcludesZero } from '../validation/harness.js';

import {
  BARE_KIOSK_ARM,
  CREDENTIAL_ARM,
  formatAccessControlStudy,
  runAccessControlStudy,
  type AccessControlStudy,
  type CoverageRow,
} from './accessControl.js';
import { DISCLOSURE_BASELINE } from './destinationDisclosure.js';
import { accessControlFigures, checkPinned, describeMismatches } from './published.js';

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
