/**
 * **Phase 6a's gate, as DECISIONS.md § D27 raised it.**
 *
 * > Beat the baseline on **TTD** with a paired-t interval excluding zero, **and** report AWT and
 * > WT95 with explicit BETTER / WORSE / INDISTINGUISHABLE / IDENTICAL verdicts. A WORSE verdict on
 * > AWT does not fail the phase; **omitting it does.**
 *
 * The verdict is **MET, and it is met with a sign flip in public.** At Midtown Office
 * interfloor-mix, n = 150 under common random numbers, `destination-eta` with `weights.rideTime: 1`
 * against `eta`, from the same runs:
 *
 * | metric | difference | verdict |
 * |---|---|---|
 * | **TTD** | **−1.562 [−1.916, −1.208] s** | **BETTER** — the gate |
 * | in-car time | **−2.076 [−2.406, −1.746] s** | BETTER — the mechanism check |
 * | AWT | **+0.514 [+0.344, +0.684] s** | **WORSE** — reported, not hidden |
 * | WT95 | **+1.010 [+0.292, +1.729] s** | **WORSE** — reported, not hidden |
 *
 * A study that reported AWT and stopped would have said this change is significantly worse. A study
 * that reported TTD and stopped would have said it is significantly better and nothing else. Both
 * would be quoting the same 150 replications. That is why the criterion was raised rather than
 * swapped.
 *
 * ## The effect is the *pricing*, not the call type, and the study separates them
 *
 * The shipped `destination-eta` — `mobile-credential`, no `rideTime` weight — is **bit-identical to
 * `eta`** on this building, 150 of 150 paired differences exactly zero, on every metric. Midtown
 * Office declares no `accessZones`, so disclosing the destination changes nothing that nothing
 * prices. Moving the information earlier is worth **exactly zero** until something reads it, and the
 * arm that reads it is worth −1.562 s. Two arms, one variable, and the decomposition is not an
 * inference.
 *
 * ## The cost destination dispatch is supposed to pay is negative here (OQ-4)
 *
 * A destination dispatcher cannot defer assignment: the passenger must be told which car to walk to
 * immediately, and `dispatch/policy.ts` refuses `destination-entry` with a defer window outright.
 * That is written up as a documented cost of the approach. **Measured, it is not a cost.** The same
 * `eta` deferring 1.5 s is WORSE on TTD by **+1.123 [+0.848, +1.397] s**, WORSE on AWT by
 * **+1.081 [+0.952, +1.209] s** and WORSE on WT95 by **+1.895 [+1.443, +2.346] s**, with 0 of 150
 * replications identical. So the constraint destination dispatch is forced to accept removes a
 * liability at this operating point with this weight vector. It does not follow that deferral is
 * useless in general — `predictive-balanced` is the profile that defers and it has ten weights, not
 * one — and that is the half of OQ-4 this suite does **not** answer.
 */

import { describe, expect, it } from 'vitest';

import {
  DISCLOSURE_METRICS,
  DISCLOSURE_PROFILE,
  DEFERRED_ARM,
  RIDE_TIME_WEIGHTS,
  disclosureArm,
  formatDisclosureStudy,
  rideArmId,
  runDestinationDisclosureStudy,
  type DisclosureStudy,
} from './destinationDisclosure.js';
import { checkPinned, describeMismatches, disclosureFigures } from './published.js';

const TIMEOUT_MS = 900_000;

let cached: DisclosureStudy | undefined;

/** The whole study, once per worker. Every test below reads the same measurement. */
async function study(): Promise<DisclosureStudy> {
  cached ??= await runDestinationDisclosureStudy({});
  return cached;
}

const HEADLINE = rideArmId(1);

describe('Phase 6a — destination disclosure at the primary operating point', () => {
  it('prints the whole table, including the arms that lose', async () => {
    console.log(formatDisclosureStudy(await study()));
  }, TIMEOUT_MS);

  it('runs every arm on the same passenger populations as the baseline', async () => {
    // Without this the paired intervals below are not paired and nothing else in the suite means
    // anything. Audited from the runner's own per-replication trace digests, not from the design.
    // Level 0 makes this unqualified: `StreamSet` derives arrivals, origins, destinations and
    // passenger mass from the master seed independently of anything the dispatcher does.
    expect((await study()).crnAligned).toBe(true);
  }, TIMEOUT_MS);

  it('quotes an interval for every cell — nothing saturated at this operating point', async () => {
    const result = await study();
    expect(result.baselineQuotable).toBe(true);
    expect(result.baselineSaturatedCount).toBe(0);
    for (const arm of result.arms) {
      expect(arm.quotable, `${arm.armId}: ${arm.quotabilityReason ?? 'unquotable'}`).toBe(true);
      expect(arm.saturatedCount, arm.armId).toBe(0);
    }
    // And the ceiling is genuinely absent rather than merely unmeasured: `saturationCensus.test.ts`
    // re-runs 1000 replications here and finds no arm losing its AWT, which is why this is
    // `undefined` rather than one of Phase 5's 287 / 190.
    expect(result.budget.admissibleReplications).toBeUndefined();
  }, TIMEOUT_MS);

  it('MEETS the raised gate: BETTER on TTD, with AWT and WT95 given explicit verdicts', async () => {
    const arm = disclosureArm(await study(), HEADLINE);

    // The gate itself.
    const ttd = arm.cell('ttdMeanS');
    expect(ttd.verdict).toBe('BETTER');
    expect(ttd.estimate.upper).toBeLessThan(0);

    // D27's second half, and the reason it is a *raising* rather than a swap: both of these must be
    // present with a verdict, and a WORSE verdict does not fail the phase. Asserted as membership in
    // the verdict vocabulary rather than as a specific word, so the assertion cannot be satisfied by
    // an arm that silently stopped reporting one.
    for (const metric of ['awtS', 'wt95S'] as const) {
      const cell = arm.cell(metric);
      expect(['BETTER', 'WORSE', 'INDISTINGUISHABLE', 'IDENTICAL'], metric).toContain(cell.verdict);
      expect(cell.verdict, `${metric} has no interval at all`).not.toBe('UNQUOTABLE');
    }
    // Every metric the study declares is reported for every arm — a gate that could be met by
    // dropping a metric is not a gate.
    for (const candidate of (await study()).arms) {
      expect(candidate.cells.map((cell) => cell.metric)).toEqual([...DISCLOSURE_METRICS]);
    }
  }, TIMEOUT_MS);

  it('measures the sign flip: TTD better and AWT worse, from the same 150 replications', async () => {
    const arm = disclosureArm(await study(), HEADLINE);
    const ttd = arm.cell('ttdMeanS');
    const awt = arm.cell('awtS');

    expect(ttd.verdict).toBe('BETTER');
    expect(awt.verdict).toBe('WORSE');
    // Same n, same seed, same experiment — which is what makes this a flip rather than two studies
    // disagreeing.
    expect(awt.comparison.n).toBe(ttd.comparison.n);
    console.log(
      `sign flip at n = ${ttd.comparison.n}: ΔTTD ${ttd.estimate.mean.toFixed(3)} ` +
        `[${ttd.estimate.lower.toFixed(3)}, ${ttd.estimate.upper.toFixed(3)}] against ` +
        `ΔAWT ${awt.estimate.mean.toFixed(3)} ` +
        `[${awt.estimate.lower.toFixed(3)}, ${awt.estimate.upper.toFixed(3)}]`,
    );
  }, TIMEOUT_MS);

  it('finds the mechanism where the theory says it is: in-car time, not wait', async () => {
    // The check that makes the sign flip legible rather than lucky. Destination grouping is supposed
    // to buy in-car seconds; if the TTD gain were not at least the size of the ride gain, the number
    // would be coming from somewhere the mechanism does not predict and the result would need a
    // different explanation.
    const arm = disclosureArm(await study(), HEADLINE);
    const ride = arm.cell('rideMeanS');
    expect(ride.verdict).toBe('BETTER');
    expect(Math.abs(ride.estimate.mean)).toBeGreaterThan(Math.abs(arm.cell('ttdMeanS').estimate.mean));
  }, TIMEOUT_MS);

  it('separates the call type from the weight: disclosure alone is worth exactly zero here', async () => {
    // The decomposition, and the reason the shipped profile is in the study as an arm rather than as
    // a footnote. Midtown Office declares no `accessZones`, so `mobile-credential` moves information
    // that nothing on this building reads — and an argmin over an unchanged cost function is an
    // unchanged argmin. 150 of 150 paired differences exactly zero, on every metric.
    const arm = disclosureArm(await study(), DISCLOSURE_PROFILE);
    for (const cell of arm.cells) {
      expect(cell.verdict, cell.metric).toBe('IDENTICAL');
      expect(cell.comparison.exactZeroCount, cell.metric).toBe(cell.comparison.n);
    }
    expect(
      (await study()).identityClasses.some(
        (members) => members.includes('eta') && members.includes(DISCLOSURE_PROFILE),
      ),
    ).toBe(true);
    // …and the same profile with the ride priced is identical to nothing.
    const priced = disclosureArm(await study(), HEADLINE);
    expect(priced.cell('ttdMeanS').verdict).not.toBe('IDENTICAL');
  }, TIMEOUT_MS);

  it('finds the trade monotone in the weight, in both directions', async () => {
    // Not a tuning result and not offered as one: it is what stops a single weight being mistaken
    // for the effect. TTD improves and AWT degrades as `rideTime` rises, over the whole bracket, so
    // the 1.0 the profile would ship at is an operating point on a curve rather than a discovery.
    const result = await study();
    const ttd = RIDE_TIME_WEIGHTS.map((w) => disclosureArm(result, rideArmId(w)).cell('ttdMeanS').estimate.mean);
    const awt = RIDE_TIME_WEIGHTS.map((w) => disclosureArm(result, rideArmId(w)).cell('awtS').estimate.mean);
    for (let index = 1; index < ttd.length; index += 1) {
      expect(ttd[index] as number, `TTD at rideTime ${RIDE_TIME_WEIGHTS[index]}`).toBeLessThan(
        ttd[index - 1] as number,
      );
      expect(awt[index] as number, `AWT at rideTime ${RIDE_TIME_WEIGHTS[index]}`).toBeGreaterThan(
        awt[index - 1] as number,
      );
    }
    // Every one of them is a real effect, not just an ordering.
    for (const weight of RIDE_TIME_WEIGHTS) {
      expect(disclosureArm(result, rideArmId(weight)).cell('ttdMeanS').verdict, `rideTime ${weight}`).toBe(
        'BETTER',
      );
    }
  }, TIMEOUT_MS);

  it('prices the constraint destination dispatch cannot avoid, and finds it negative (OQ-4)', async () => {
    const arm = disclosureArm(await study(), DEFERRED_ARM);
    for (const metric of ['ttdMeanS', 'awtS', 'wt95S'] as const) {
      expect(arm.cell(metric).verdict, metric).toBe('WORSE');
    }
    // Reported as a measurement rather than assumed as a handicap. docs/09 § 2.3 measured the same
    // sign on a different seed set; this is the confirmation at a real budget, and it is the whole
    // of the answer to *"what does it cost that a destination dispatcher may not defer?"* — with
    // this weight vector, at this operating point, it pays.
    expect(arm.cell('ttdMeanS').comparison.exactZeroCount).toBe(0);
  }, TIMEOUT_MS);
});

describe('the budget is re-derived here rather than quoted from the contract', () => {
  it('resolves the effect it reports, and says what it would take to resolve less', async () => {
    const result = await study();
    const ttd = result.budget.rows.find((row) => row.metric === 'ttdMeanS');
    expect(ttd).toBeDefined();
    // The budget is defensible against the data it was spent on: the achieved half-width is a real
    // fraction of the effect rather than a hope.
    expect((ttd as NonNullable<typeof ttd>).halfWidth).toBeLessThan(
      Math.abs((ttd as NonNullable<typeof ttd>).effect) / 3,
    );
    // …and `n` is inside CLAUDE.md § Statistical discipline's 50–200 band, without a ceiling
    // forcing it there.
    expect(result.replications).toBeGreaterThanOrEqual(50);
    expect(result.replications).toBeLessThanOrEqual(200);
    for (const row of result.budget.rows) {
      console.log(
        `${row.metric}: sd ${row.sdOfDifference.toFixed(3)}, half-width ${row.halfWidth.toFixed(3)}, ` +
          `n for ±0.5 s ≈ ${row.replicationsForHalfWidth}`,
      );
    }
  }, TIMEOUT_MS);
});

describe('the shipped operating points are blind to this effect, and it is predicted in advance', () => {
  it('separates an expected zero from a wiring zero, by measuring both on the same code', async () => {
    const result = await study();
    expect(result.negativeControls.length).toBeGreaterThan(0);

    for (const control of result.negativeControls) {
      // Not asserted to be exactly zero. docs/09 § 2.2 measured Garden 30/30 bit-identical at
      // `rideTime` 0.3, and at 1.0 one replication of thirty does flip — a *count* of differing
      // replications is not an effect size and must not be read as one. What is asserted is the
      // claim the study actually makes: at these points the difference is not resolvable, at a
      // budget where the primary point's is resolved several times over.
      expect(['INDISTINGUISHABLE', 'IDENTICAL'], `${control.label} is no longer blind`).toContain(
        control.ttd.verdict,
      );
      console.log(
        `${control.label}: ${control.differing}/${control.replications} replications differ, ` +
          `ΔTTD ${control.ttd.estimate.mean.toFixed(3)} ` +
          `[${control.ttd.estimate.lower.toFixed(3)}, ${control.ttd.estimate.upper.toFixed(3)}] ` +
          `→ ${control.ttd.verdict}`,
      );
    }

    // The contrast that makes the paragraph above a measurement rather than an excuse: the same two
    // profiles, the same commit, the same seed — resolved at the primary point and unresolved at
    // every shipped one. A phase that measured only at the shipped points would have reported "no
    // effect" and been wrong about why.
    expect(disclosureArm(result, HEADLINE).cell('ttdMeanS').verdict).toBe('BETTER');
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * Layer A of the publication guard — see published.ts
 * -------------------------------------------------------------------------- */

describe('the figures this study publishes still come out of it', () => {
  it('reproduces every pinned estimate, at full precision', async () => {
    const mismatches = checkPinned('destination-disclosure', disclosureFigures(await study()));
    expect(
      describeMismatches('destination-disclosure', mismatches),
      describeMismatches('destination-disclosure', mismatches),
    ).toBe('');
  }, TIMEOUT_MS);
});
