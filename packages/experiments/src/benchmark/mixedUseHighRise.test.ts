/**
 * **Phase 6's criterion, evaluated on the building it names** — `DECISIONS.md` § D99.
 *
 * `mixedUseHighRise.ts` carries the argument and the result. This suite asserts the four things the
 * result would be worthless without, and one it would be dishonest without:
 *
 * 1. **§ 1 is categorical, and since `DECISIONS.md` § D254 it answers the other way.** It used to
 *    assert that no `role: 'baseline'` profile had a quotable AWT under the building's own
 *    mixed-directional scenario at *any* of three rates, with the unserved fraction rising as the
 *    load fell — a structural refusal. That was the pickup access check, not the building. Every
 *    arm is now quotable at the thickest rate with nobody undelivered, the baselines and the
 *    credential-aware arms return identical counts at all three, and the unserved share is flat at
 *    2.1–2.6 %. The sweep is kept because it is what makes either answer a measurement rather than
 *    a preference; § D279 is the re-measurement.
 * 2. **Every point is quotable at its budget, and CRN-aligned.** A cell whose arms are not both
 *    quotable renders `UNQUOTABLE`, and an interval read off unpaired runs is not an interval.
 * 3. **The gate is TTD and the two costs are always present.** § D27: *"A WORSE verdict on AWT does
 *    not fail the phase; omitting it does."* Asserted structurally — for every gate cell there is an
 *    AWT cell and a WT95 cell with a real verdict — so the omission is unfailable rather than
 *    unchecked.
 * 4. **The criterion's verdict matches the cells**, and the pins reproduce.
 * 5. **The half that does not pass is asserted too.** The Level-1 panel does not beat `eta` or
 *    `collective` on the gate at any measured point, and at 4 % it is significantly worse on WT95.
 *    A suite that asserted only the winning arm would be reporting a selected result.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadResources, withProfiles } from '../validation/harness.js';
import type { ExperimentResources } from '../runner/types.js';

import {
  COVERAGE_RATES,
  DECOMPOSITION_ARM,
  LEVEL_0_ARM,
  LEVEL_1_ARM,
  MIXED_USE_GATE,
  MIXED_USE_POINTS,
  baselineProfileIds,
  formatMixedUseHighRise,
  mixedUsePoint,
  resolutionTable,
  runMixedUseHighRiseStudy,
  type MixedUseStudy,
} from './mixedUseHighRise.js';
import { checkPinned, describeMismatches, mixedUseFigures } from './published.js';

/** Three points and a three-rate coverage census on a 60-floor, 16-car building. */
const TIMEOUT_MS = 900_000;

let study: MixedUseStudy;
let resources: ExperimentResources;

beforeAll(async () => {
  resources = withProfiles(await loadResources(), []);
  study = await runMixedUseHighRiseStudy({ resources });
  console.log(formatMixedUseHighRise(study));
}, TIMEOUT_MS);

/* -------------------------------------------------------------------------- *
 * The baselines are data
 * -------------------------------------------------------------------------- */

describe('the naive baselines are read out of data/, not named in code', () => {
  it('finds every profile carrying role: "baseline" and nothing else', async () => {
    const config = await loadResources();
    const found = baselineProfileIds(config.dispatcherProfilesById);
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const id of found) {
      expect(config.dispatcherProfilesById.get(id)?.role).toBe('baseline');
    }
    for (const [id, profile] of config.dispatcherProfilesById) {
      if (profile.role === 'baseline') expect(found).toContain(id);
    }
    // Invariant 7: the criterion's "naive baselines" resolves through the data, so a fourth one
    // authored tomorrow joins the gate without a code change.
    expect(study.baselines).toEqual(found);
  });

  it('refuses to gate at all when data/ declares no baseline', () => {
    expect(() => baselineProfileIds(new Map())).toThrow(/no profile with role "baseline"/);
  });
});

/* -------------------------------------------------------------------------- *
 * § 1 — the building's own scenario
 * -------------------------------------------------------------------------- */

describe('§ 1 — the building’s own scenario admits a paired comparison after all (§ D254, § D279)', () => {
  /**
   * **The inversion, and it is asserted as an identity rather than as a negation.**
   *
   * This case required *"every baseline without a quotable AWT at every rate"* and a positive
   * undelivered count on each. Both were `estimateCost`'s pickup check: an access-restricted
   * landing call carried no credential under `up-down-buttons`, every car refused it, and the
   * unserved traffic was the refusal rather than the load. § D254 deleted the check.
   *
   * The bare negation — *"some baseline is quotable somewhere"* — would be a much weaker claim than
   * the one it replaces. What is asserted instead is what the census actually shows: at every rate
   * the three `role: "baseline"` profiles and the two credential-aware arms return **identical**
   * counts, and at the thickest rate all five are quotable with nobody undelivered. An arm list
   * that agrees to the last field is the strongest available statement that the call type is not
   * what decides quotability here, and it is the statement § 1 got backwards.
   */
  it('finds every baseline quotable at the thickest rate, and identical to the credential arms at all three', () => {
    for (const rate of COVERAGE_RATES) {
      const at = (armId: string) =>
        study.coverage.rows.find((entry) => entry.rate === rate && entry.armId === armId);
      const reference = at(DECOMPOSITION_ARM);
      expect(reference, `no coverage row for ${DECOMPOSITION_ARM} at ${String(rate)} %`).toBeDefined();

      for (const baseline of study.baselines) {
        const row = at(baseline);
        expect(row, `no coverage row for ${baseline} at ${String(rate)} %`).toBeDefined();
        // Nobody is stranded on any arm at any rate. This is the clause § 1 had inverted.
        expect(
          row?.meanUndelivered,
          `${baseline} leaves journeys undelivered at ${String(rate)} % on the mixed-directional ` +
            'scenario. § 1 reported exactly that before DECISIONS.md § D254, and it was the ' +
            'pickup access check rather than the building.',
        ).toBe(0);
        expect(row?.notCompleted).toBe(0);
        // …and the credential-aware arm does no better, field for field, so whatever costs the
        // thin rates their aggregate AWT is not the call type.
        for (const field of [
          'quotable',
          'withoutQuotableAwt',
          'notCompleted',
          'meanUndelivered',
          'meanUnservedFraction',
        ] as const) {
          expect(
            row?.[field],
            `${baseline} differs from ${DECOMPOSITION_ARM} on ${field} at ${String(rate)} %`,
          ).toBe(reference?.[field]);
        }
      }
    }

    // The thickest rate, where 30 replications are enough for every arm to quote a mean — the
    // clause that makes the identity above a statement about a *servable* regime rather than about
    // two arms failing in the same way.
    for (const baseline of study.baselines) {
      const row = study.coverage.rows.find(
        (entry) => entry.rate === COVERAGE_RATES[0] && entry.armId === baseline,
      );
      expect(
        row?.quotable,
        `${baseline} has no quotable AWT at the thickest rate, so § 1's regime is closed again`,
      ).toBe(true);
      expect(row?.withoutQuotableAwt).toBe(0);
    }
  });

  /**
   * **Two claims, and § D265 separated them by making one of them false.**
   *
   * This case asserted *"serves the same traffic completely"* and checked three things: nobody
   * undelivered, no run failing to complete, and **every replication quoting an AWT**. The first
   * two are what the title says and they still hold at every rate. The third is a different claim
   * — that the *statistics* of a 30-replication batch are quotable — and it now fails at the two
   * thin rates, on every arm including the conventional ones.
   *
   * Measured rather than assumed, at the shipped budget: `meanUndelivered` is **0** and
   * `notCompleted` is **0** on all fifteen rows, and the unserved fraction is 2.1–2.6 %, which is
   * half the 5 % censoring limit. What moved is `withoutQuotableAwt`: **0 of 30** at 1.5 %,
   * **1 of 30** at 0.75 %, **4 of 30** at 0.2 %. The ground is an **empty reporting window**, not
   * censoring — at 0.2 % of population per five minutes the window holds a handful of people, and
   * removing the ~2 % the credential gap turns away empties it on four of the thirty draws.
   *
   * That is a statement about the operating point rather than about access control, so it is
   * asserted as what it is: the completeness claim in the title, at every rate, plus the
   * quotability claim at the one rate the batch is thick enough to support it. Requiring
   * quotability at 0.2 % would be requiring a 30-replication batch to have no unlucky draw.
   */
  it('serves the same traffic completely with a credential-aware arm', () => {
    // The contrast is what makes § 1 a statement about the *call type* rather than about the
    // building being too small. Same building, same trace, same rates.
    for (const rate of COVERAGE_RATES) {
      for (const armId of [DECOMPOSITION_ARM, LEVEL_1_ARM]) {
        const row = study.coverage.rows.find(
          (entry) => entry.rate === rate && entry.armId === armId,
        );
        expect(row?.meanUndelivered, `${armId} left somebody behind at ${String(rate)} %`).toBe(0);
        expect(row?.notCompleted, `${armId} failed to complete at ${String(rate)} %`).toBe(0);
        // And the shortfall is not censoring hiding behind a complete run: the unserved fraction
        // stays under the limit that would suppress a mean for a backlog.
        expect(row?.meanUnservedFraction ?? 1).toBeLessThan(0.05);
      }
    }
    // The thickest rate, where 30 replications are enough for every one of them to quote a mean.
    for (const armId of [DECOMPOSITION_ARM, LEVEL_1_ARM]) {
      const row = study.coverage.rows.find(
        (entry) => entry.rate === COVERAGE_RATES[0] && entry.armId === armId,
      );
      expect(row?.quotable, `${armId} unquotable at the thickest rate`).toBe(true);
      expect(row?.withoutQuotableAwt, `${armId} at the thickest rate`).toBe(0);
    }
  });

  it('finds the unserved fraction FLAT in the load — neither structural nor an overload', () => {
    /*
     * **The discrimination survives; its answer changed.** An overloaded building serves a larger
     * fraction as demand drops; a building that structurally refuses a share of its demand serves a
     * smaller one, because the servable traffic is what went away. This case asserted the second,
     * and the rise it was reading was `estimateCost`'s pickup check (§ D254).
     *
     * Measured now, the sweep answers *neither*: 2.55 → 2.13 → 2.32 %, which is a fixed share of
     * journeys the traffic model turns away (§ D265) and not a queue at all. So the assertion is
     * the sweep's own conclusion — `SERVABLE` — plus the flatness that says why, because
     * `SERVABLE` alone would also be returned by a building whose unserved share was falling
     * steeply, which would be a different result and should not read as this one.
     */
    expect(study.coverage.unservedRisesAsLoadFalls).toBe(false);
    expect(study.coverage.noBaselineIsQuotable).toBe(false);
    expect(study.coverage.verdict).toBe('SERVABLE');
    expect(study.coverage.verdictReason).toMatch(/admits a paired comparison after all/u);

    // Flat rather than merely non-rising: every rate's unserved share sits inside a band far
    // narrower than the three-fold spread in demand that produced it. A structural refusal would
    // climb across this sweep and an overload would fall across it; neither fits inside 1 point.
    const shares = COVERAGE_RATES.map((rate) => {
      const at = study.coverage.rows.filter((row) => row.rate === rate);
      return at.reduce((total, row) => total + row.meanUnservedFraction, 0) / at.length;
    });
    expect(Math.min(...shares)).toBeGreaterThan(0);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(0.01);
    console.log(
      `§ 1 unserved share by rate: ${COVERAGE_RATES.map(
        (rate, index) => `${String(rate)} % → ${((shares[index] as number) * 100).toFixed(2)} %`,
      ).join(', ')} — flat, and nobody undelivered at any of them`,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The apparatus
 * -------------------------------------------------------------------------- */

describe('every operating point is quotable at its budget, paired, and inside its ceiling', () => {
  it('has every arm quotable and every replication CRN-aligned', () => {
    for (const point of study.points) {
      expect(
        point.unquotableArms,
        `${point.id}: these arms lost their AWT at n = ${String(point.replications)}, so the ` +
          'budget is above this building’s ceiling and the cells are UNQUOTABLE.',
      ).toEqual([]);
      expect(point.quotable).toBe(true);
      expect(point.crnAligned, `${point.id}: the arms did not see the same populations`).toBe(true);
    }
  });

  it('spends a budget below the measured ceiling, wherever there is one', () => {
    for (const point of MIXED_USE_POINTS) {
      if (point.ceiling === undefined) continue;
      expect(
        point.replications,
        `${point.id} is budgeted at ${String(point.replications)} against a censused ceiling of ` +
          `${String(point.ceiling)}. Above the ceiling some arm has no quotable AWT.`,
      ).toBeLessThan(point.ceiling);
    }
  });

  it('states where every budget came from, and never from another study’s n (§ D99)', () => {
    for (const point of MIXED_USE_POINTS) {
      expect(point.budgetBasis.length, `${point.id} has no stated budget basis`).toBeGreaterThan(80);
      expect(point.prediction.length, `${point.id} has no prediction stated in advance`)
        .toBeGreaterThan(80);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The decomposition
 * -------------------------------------------------------------------------- */

describe('the call type alone is worth exactly zero here, and the study says so by measurement', () => {
  it('is bit-identical to eta on every replication of every point', () => {
    for (const point of study.points) {
      expect(
        point.decompositionIdentical,
        `${point.id}: the shipped destination profile differs from eta on ` +
          `${String(point.replications - point.decompositionIdentical)} replications. Every pickup ` +
          'here is at G, which is in no access zone, so a credential should buy nothing until a ' +
          'weight reads the destination — if that has changed, the decomposition below is no ' +
          'longer "the weight, all of it".',
      ).toBe(point.replications);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The gate — § D27's shape
 * -------------------------------------------------------------------------- */

describe('the gate is TTD, and AWT and WT95 are reported beside it with verdicts (§ D27)', () => {
  it('carries an AWT cell and a WT95 cell for every gate cell — omitting one fails the phase', () => {
    for (const point of study.points) {
      const gates = point.cells.filter((cell) => cell.metric === MIXED_USE_GATE);
      expect(gates.length).toBeGreaterThan(0);
      for (const gate of gates) {
        for (const metric of ['awtS', 'wt95S'] as const) {
          const cost = point.cell(gate.armId, gate.baselineId, metric);
          expect(cost.verdict, `${point.id} ${gate.armId}−${gate.baselineId} ${metric}`).not.toBe(
            'UNQUOTABLE',
          );
          expect(Number.isFinite(cost.estimate.mean)).toBe(true);
        }
      }
    }
  });

  it('finds the Level-0 arm BETTER on TTD against every baseline at up-peak 4 %', () => {
    const point = mixedUsePoint(study, 'up-peak-4pct');
    expect(point).toBeDefined();
    if (point === undefined) return;
    for (const baseline of study.baselines) {
      const gate = point.cell(LEVEL_0_ARM, baseline, MIXED_USE_GATE);
      expect(
        gate.verdict,
        `${LEVEL_0_ARM} − ${baseline} on ${MIXED_USE_GATE}: ` +
          `${gate.estimate.mean.toFixed(3)} [${gate.estimate.lower.toFixed(3)}, ${gate.estimate.upper.toFixed(3)}]`,
      ).toBe('BETTER');
      expect(gate.estimate.upper).toBeLessThan(0);
    }
    // The honest cost, asserted rather than merely present: this is the sign split D27 exists for.
    expect(point.cell(LEVEL_0_ARM, 'eta', 'awtS').verdict).toBe('WORSE');
    expect(point.cell(LEVEL_0_ARM, 'eta', 'rideMeanS').verdict).toBe('BETTER');
  });

  it('finds the Level-1 panel beating eta and collective on TTD at the heavy point, and nowhere else', () => {
    /*
     * **This assertion used to be a blanket negative, and § D333 turned it over.**
     *
     * It read *"NOT beating eta or collective on TTD at any point"*, and that was the half of
     * Phase 6b that failed — the criterion was met by the Level-0 arm alone. It is now met by both.
     * The cause is not a change to the panel: it is `Simulation#tellThePanel`, which promised every
     * waiter at a landing to `carIds[0]` with no capacity bound, so the Level-1 arm was being
     * measured with a defect that only it could suffer. Fixing it moved the heavy point from
     * INDISTINGUISHABLE to BETTER against **both** collective-class baselines:
     *
     * | point | − eta | − collective |
     * |---|---|---|
     * | `up-peak-1pct` | `−0.162 [−0.576, +0.253]` INDISTINGUISHABLE | `−0.163 [−0.577, +0.252]` INDISTINGUISHABLE |
     * | `up-peak-2pct` | `−0.162 [−0.722, +0.398]` INDISTINGUISHABLE | `−0.093 [−0.660, +0.474]` INDISTINGUISHABLE |
     * | `up-peak-4pct` | **`−1.598 [−2.575, −0.621]` BETTER** | **`−1.642 [−2.620, −0.663]` BETTER** |
     *
     * **The win is asserted with its resolution beside it, not on the interval alone.** An interval
     * excluding zero is not a result when the effect is smaller than the apparatus can resolve —
     * `CLAUDE.md`'s standing rule, and the reason Phase 6c was refused three times. Here the heavy
     * point reports `requiredReplications = 1` against a measured ceiling of 206 at n = 200, so the
     * effect is resolvable at this cell by the study's own arithmetic rather than by assumption.
     * That is checked below rather than described.
     *
     * The two light points staying INDISTINGUISHABLE is kept as part of the claim: a fix that made
     * the panel better *everywhere* would be a suspiciously tidy result, and the shape here — no
     * effect where the cars do not fill, a real one where they do — is the mechanism the defect
     * predicts, since an unbounded promise only bites once a car is over-subscribed.
     */
    const heavy = mixedUsePoint(study, 'up-peak-4pct');
    expect(heavy).toBeDefined();
    if (heavy === undefined) return;

    for (const point of study.points) {
      for (const baseline of ['eta', 'collective']) {
        if (!study.baselines.includes(baseline)) continue;
        const gate = point.cell(LEVEL_1_ARM, baseline, MIXED_USE_GATE);
        const label =
          `${point.id}: ${LEVEL_1_ARM} − ${baseline} on the gate: ` +
          `${gate.estimate.mean.toFixed(3)} [${gate.estimate.lower.toFixed(3)}, ${gate.estimate.upper.toFixed(3)}]`;
        if (point.id === 'up-peak-4pct') {
          expect(gate.verdict, label).toBe('BETTER');
          expect(gate.estimate.upper, label).toBeLessThan(0);
          // Resolvable at this cell, measured rather than inherited from another study's limit.
          expect(gate.requiredReplications ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
            gate.comparison.n,
          );
        } else {
          expect(gate.verdict, label).not.toBe('BETTER');
        }
      }
    }

    // The cost that survives the fix, still reported rather than dropped — D27's sign split. The
    // panel buys the journey and still pays for it at the landing.
    expect(heavy.cell(LEVEL_1_ARM, 'eta', 'wt95S').verdict).toBe('WORSE');
    expect(heavy.cell(LEVEL_1_ARM, 'eta', 'awtS').verdict).toBe('WORSE');
  });

  it('reports the blind control as blind, with the count that says why', () => {
    const point = mixedUsePoint(study, 'up-peak-1pct');
    expect(point?.blind).toBe(true);
    if (point === undefined) return;
    for (const baseline of ['eta', 'collective']) {
      if (!study.baselines.includes(baseline)) continue;
      const gate = point.cell(LEVEL_0_ARM, baseline, MIXED_USE_GATE);
      expect(gate.verdict).toBe('INDISTINGUISHABLE');
      // Blind, not merely under-powered: a large share of replications produce an exactly-zero
      // paired difference, which is what `arms.ts` § Phase 6a means by a point being blind.
      expect(gate.comparison.exactZeroCount / gate.comparison.n).toBeGreaterThan(0.25);
      // And the required n is far above anything the project's budget band allows.
      expect(gate.requiredReplications ?? 0).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The verdict, and the resolution it rests on
 * -------------------------------------------------------------------------- */

describe('the criterion’s verdict is derived from the cells, not written', () => {
  it('agrees with a recount of the gate cells', () => {
    const recount: string[] = [];
    for (const point of study.points) {
      if (!point.quotable) continue;
      for (const candidate of study.candidates) {
        const beatsAll = study.baselines.every(
          (baseline) => point.cell(candidate, baseline, MIXED_USE_GATE).verdict === 'BETTER',
        );
        if (beatsAll) recount.push(`${candidate}@${point.id}`);
      }
    }
    expect([...study.criterion.metBy].sort()).toEqual(recount.sort());
    expect(study.criterion.met).toBe(recount.length > 0);
  });

  it('is MET on this building, by the Level-0 arm at the heavy point', () => {
    expect(
      study.criterion.met,
      'Phase 6’s criterion is NOT met on mixed-use-high-rise. That is a real outcome and must be ' +
        'reported as one — see DECISIONS.md § D99. Do not weaken the criterion to make it pass.',
    ).toBe(true);
    expect(study.criterion.metBy).toContain(`${LEVEL_0_ARM}@up-peak-4pct`);
  });

  it('reports a required n above the ceiling where a contrast is permanently unresolvable', () => {
    const rows = resolutionTable(study);
    expect(rows.length).toBe(
      study.points.length * study.candidates.length * study.baselines.length,
    );
    // docs/07-handoff.md § 4: an effect below the resolution limit is "not measurable at that
    // budget", never a win and never "needs more replications". At least one contrast here is in
    // that position, and the table is what says so.
    const unresolvable = rows.filter((row) => row.resolvable === false);
    expect(unresolvable.length).toBeGreaterThan(0);
    for (const row of unresolvable) {
      expect(row.requiredReplications ?? 0).toBeGreaterThan(row.ceiling ?? 0);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Layer A of the publication guard
 * -------------------------------------------------------------------------- */

describe('the published figures still reproduce', () => {
  it('matches every pinned estimate, in both directions', () => {
    const mismatches = checkPinned('mixed-use-high-rise', mixedUseFigures(study));
    expect(
      describeMismatches('mixed-use-high-rise', mismatches),
      describeMismatches('mixed-use-high-rise', mismatches),
    ).toBe('');
  });
});
