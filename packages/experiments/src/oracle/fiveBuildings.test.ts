/**
 * **Phase 8, analytical track, part 2 — the correctness oracle on all five shipped buildings.**
 *
 * `CLAUDE.md` § Correctness oracle: *"Under pure up-peak, simulated interval and handling capacity
 * must match the closed-form Barney/CIBSE round-trip-time calculation within a few percent.
 * Implement that calculation as a test. If simulation and closed form diverge, assume the
 * simulation is wrong until proven otherwise."* `docs/07-handoff.md` § 7 makes the scope explicit
 * for Phase 8: *all five buildings, not just the two done*.
 *
 * ## The verdict
 *
 * **Read literally, the criterion is met on none of the five, and that is the correct answer.**
 * A simulator that reproduced `RTT = 2(H·tv + tx) + (S+1)·ts + 2·P·tp` would be a simulator that
 * had stopped modelling acceleration and stopped holding its doors, because that expression
 * charges neither. Read as the roadmap intends — *does the simulator reproduce the physical system
 * the formula describes* — it **is** met on all five that can be measured at all, because charging
 * the two omissions `CLOSED_FORM_ASSUMPTIONS` enumerates in advance as `bias: 'under'` closes
 * every one of the five gaps to under 1.2 %, with no fitted constant anywhere.
 *
 * Three of the fourteen shipped banks cannot be measured this way at all, and one of those is the
 * only bank of its kind. Those are recorded below as findings **about the buildings**, with the
 * mechanism, rather than as failures of the oracle — see § "What is not reconciled, and why".
 *
 * ## How this file differs from the Phase 2 gate it extends
 *
 * `packages/core/src/analytical/validation.test.ts` reconciles Midtown Office and Garden
 * Apartments. It reaches them with two hand-written `Case` literals and a hard-coded
 * `bankId: 'main'`. `upPeakCase.ts` replaces both with rules over the resolved configuration, so
 * the same measurement reaches all fourteen banks; `bankCensus.test.ts` checks those rules.
 *
 * The **check that the extension did not change the question** is that the two known answers come
 * back. `docs/07-handoff.md` § 5 records Midtown at +27.5 % interval / −23.2 % capacity raw and
 * 0.001 % after charging, Garden at +7.5 % / −7.1 % and 0.69 %. Those were measured at n = 128 on
 * the whole building; this file measures them at a different `n`, through a different code path,
 * with departures reconstructed at a per-bank threshold, and reproduces both signs, both
 * magnitudes and both residuals. That is the load-bearing assertion in this file. If the three new
 * buildings agreed and these two did not, the agreement would be an artefact of the new apparatus.
 *
 * ## Every run here saturates, on purpose, and no waiting time is reported
 *
 * The closed form describes a group that is the constraint: cars leaving the terminal at design
 * load, back to back. Demand is therefore offered at {@link OVERLOAD_FACTOR} × the closed form's
 * own `%POP`, every replication comes back `saturated`, and that is asserted rather than tolerated.
 * `CLAUDE.md` § Statistical discipline forbids publishing a mean waiting time for a system whose
 * queues grow without bound — so this file publishes none. Round-trip time, achieved interval and
 * handling capacity are exactly the quantities that stay well-defined when the queue does not.
 *
 * ## Runtime
 *
 * Always-on, five buildings, {@link REPLICATIONS} replications each. The deep campaign — every
 * measurable bank, at the full 128 — is `deepCampaign.test.ts`, which is skipped unless
 * `ELEVATOR_SIM_DEEP=1`. Both budgets are stated in the constants below and neither is capped
 * silently.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  CLOSED_FORM_ASSUMPTIONS,
  CLOSED_FORM_COMPARISON_RULE,
  loadConfig,
  travelTime,
} from '@elevator-sim/core';
import type { LoadedConfig } from '@elevator-sim/core';

import { DEFAULT_RESIDUAL_TOLERANCE, reconcileRoundTrip, relativeDivergence } from './reconcile.js';
import type { RoundTripReconciliation } from './types.js';
import { OVERLOAD_FACTOR, completedOf, deriveUpPeakCase, measureUpPeak } from './upPeakCase.js';
import type { UpPeakMeasurement } from './upPeakCase.js';
import { DATA_DIR } from '../validation/harness.js';

/* -------------------------------------------------------------------------- *
 * Experiment design
 * -------------------------------------------------------------------------- */

/**
 * Replications per building, always-on.
 *
 * `docs/03-traffic-and-statistics.md` § Part 3 budgets 50–200 and is explicit that ten is not
 * enough. 64 is inside that budget at its economical end, and it is where it is for a stated
 * reason rather than a silent one: five buildings at 64 costs the measured runtime printed by the
 * last test in this file, and the Phase 2 gate already runs the two known-answer buildings at 128
 * inside the same suite. The three **new** buildings are the marginal cost, and they are what the
 * budget was chosen to afford. `deepCampaign.test.ts` runs every measurable bank at 128.
 *
 * The seeds are fixed rather than drawn, so the numbers asserted below are reproducible rather
 * than resampled on every CI run.
 */
export const REPLICATIONS = 64;
const FIRST_SEED = 810_000;
const SEEDS = Array.from({ length: REPLICATIONS }, (_, index) => FIRST_SEED + index);

/**
 * One building's principal bank — the one the reconciliation table reports, and why it is the one.
 *
 * A building has one row in the table and up to seven banks. The principal bank is the group that
 * carries that building's up-peak from its street entrance: it is the bank a reader means when
 * they ask whether the building agrees with the closed form. Every other bank is measured in the
 * deep campaign, and the ones that cannot be measured at all are named in the last describe block.
 */
interface PrincipalBank {
  readonly buildingId: string;
  readonly bankId: string;
  /**
   * Length of the peak plateau, which is also the reported window.
   *
   * Sized so each car completes several round trips inside it — the interval is estimated from
   * the gaps between departures, and a window holding six departures estimates it far more
   * coarsely than one holding thirty. It changes the sample size, not the system. Garden
   * Apartments gets twice as long because it has two cars rather than four or more.
   */
  readonly peakWindowS: number;
  /** What makes this the bank the building's row is about. */
  readonly rationale: string;
}

const PRINCIPAL_BANKS: readonly PrincipalBank[] = [
  {
    buildingId: 'midtown-office',
    bankId: 'main',
    peakWindowS: 900,
    rationale: 'the only bank; the building docs/05-roadmap.md § Phase 2 names',
  },
  {
    buildingId: 'garden-apartments',
    bankId: 'main',
    peakWindowS: 1800,
    rationale: 'the only bank; two hydraulic cars, the speed negative control',
  },
  {
    buildingId: 'secure-tower',
    bankId: 'low',
    peakWindowS: 900,
    rationale: 'the larger of two lobby banks by served population (546 against 446)',
  },
  {
    buildingId: 'mixed-use-high-rise',
    bankId: 'office-local',
    peakWindowS: 900,
    rationale:
      'the only bank of the three that both starts at the street entrance and has a measurable ' +
      'departure bracket; residential-local has neither, the shuttle serves one floor',
  },
  {
    buildingId: 'vertical-city',
    bankId: 'zone-1-local',
    peakWindowS: 900,
    rationale:
      'the lowest bank that starts at the street entrance; the shuttle is double-deck hardware ' +
      'the runtime does not model and has no measurable bracket either',
  },
];

let config: LoadedConfig;
const measurements = new Map<string, UpPeakMeasurement>();
const reconciliations = new Map<string, RoundTripReconciliation>();
let elapsedMs = 0;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const startedAt = Date.now();
  for (const bank of PRINCIPAL_BANKS) {
    const measurement = measureUpPeak({
      config,
      buildingId: bank.buildingId,
      bankId: bank.bankId,
      seeds: SEEDS,
      peakWindowS: bank.peakWindowS,
    });
    measurements.set(bank.buildingId, measurement);
    reconciliations.set(
      bank.buildingId,
      reconcileRoundTrip({
        // The closed form re-evaluated at the load the simulator actually carried.
        // `CLOSED_FORM_COMPARISON_RULE.precondition` is exactly this trap, stated in advance: a
        // comparison made at 0.8 × capacity against a simulator that carried less reports a
        // defect that is not there.
        closedForm: measurement.matched.result,
        completed: completedOf(measurement),
        measured: measurement.measured,
      }),
    );
  }
  elapsedMs = Date.now() - startedAt;
}, 600_000);

function measurementOf(buildingId: string): UpPeakMeasurement {
  const measurement = measurements.get(buildingId);
  if (measurement === undefined) throw new Error(`no measurement for "${buildingId}"`);
  return measurement;
}

function reconciliationOf(buildingId: string): RoundTripReconciliation {
  const reconciliation = reconciliations.get(buildingId);
  if (reconciliation === undefined) throw new Error(`no reconciliation for "${buildingId}"`);
  return reconciliation;
}

/** `(measured − closed form) / closed form` on the interval, at the closed form's own design load. */
function intervalDivergenceOf(buildingId: string): number {
  const m = measurementOf(buildingId);
  return relativeDivergence(m.measured.intervalS.mean, m.analysis.result.intervalS);
}

/** The same on achieved handling capacity as a percentage of population. */
function capacityDivergenceOf(buildingId: string): number {
  const m = measurementOf(buildingId);
  return relativeDivergence(
    m.measured.percentPopulation5Min.mean,
    m.analysis.result.percentPopulation5Min,
  );
}

/* ========================================================================== *
 * The preconditions. Nothing below means anything without these.
 * ========================================================================== */

describe('the five measurements are of the system the closed form describes', () => {
  it('ran the intended number of replications, lost nobody, and saturated every time', () => {
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      expect(m.replications).toBe(REPLICATIONS);
      // Saturation is the closed form's own operating point, offered deliberately. A replication
      // that did **not** saturate would be one whose achieved interval is set by the arrival rate
      // rather than by the round trip, and agreement would be an artefact of the demand knob.
      //
      // At this seed set all 64 do, on all five, and that is asserted exactly rather than as a
      // fraction. It is **not** guaranteed: 1.3× is a mean over a Poisson arrival process, and at
      // n = 128 on a different seed base `deepCampaign.test.ts` measures Midtown Office at
      // 127/128. The count is carried on the measurement so a suite can say which it got rather
      // than only whether it got all of them.
      expect({
        id: bank.buildingId,
        saturated: `${m.saturatedReplications}/${m.replications}`,
      }).toEqual({ id: bank.buildingId, saturated: `${REPLICATIONS}/${REPLICATIONS}` });
      expect(m.allSaturated).toBe(true);
      // Enough trips for the means to be means. The interval is estimated from the gaps between
      // in-window departures; a run holding six of them estimates it far more coarsely.
      expect(m.tripCountAll).toBeGreaterThan(REPLICATIONS * 8);
    }
  });

  it('reports how many departures left full, which is not the same fraction on every building', () => {
    // `CLOSED_FORM_COMPARISON_RULE.matchedLoadGuidance`: the round trip is compared over trips
    // that left at the largest integer load the simulator can board, because a part-full trip is
    // a legitimately shorter round trip the closed form does not describe.
    //
    // On Midtown Office 97 % of departures qualify and the Phase 2 gate could treat "full" and
    // "all" as interchangeable. **That does not generalise.** Mixed-Use High-Rise's office-local
    // bank has eight cars against 29 floors, so its cars leave part-full far more often, and only
    // ~23 % of its departures clear the bar. The comparison is still exact — it is made at the
    // *observed* mean load of the qualifying trips, not at 0.8 × capacity — but the sample it is
    // made over is a tail rather than the bulk, and the count is what says whether that tail is
    // large enough to mean anything. It is: several hundred trips on every building.
    const rows: string[] = [];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      const fraction = m.tripCountFull / m.tripCountAll;
      rows.push(
        `${bank.buildingId.padEnd(20)} ${m.tripCountFull} full of ${m.tripCountAll} in-window ` +
          `departures (${(fraction * 100).toFixed(1)} %)`,
      );
      // Not a tolerance on agreement — a floor on sample size. Below this the full-trip mean is
      // an extreme-value statistic and the matched-load comparison stops being one.
      expect({ id: bank.buildingId, enough: m.tripCountFull > 200 }).toEqual({
        id: bank.buildingId,
        enough: true,
      });
      expect({ id: bank.buildingId, someFull: fraction > 0.15 }).toEqual({
        id: bank.buildingId,
        someFull: true,
      });
    }
    // eslint-disable-next-line no-console
    console.log(`\nfull departures, per building:\n${rows.join('\n')}\n`);
  });

  it('carries the load and makes the stops the closed form prices', () => {
    // The precondition on everything downstream. `S = N(1 − ((N−1)/N)^P)` is the whole
    // combinatorial content of the formula; if the simulator is not making that many stops, the
    // two sides are not describing the same trip and no timing correction explains anything.
    const rows: string[] = [];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      const loadDivergence = relativeDivergence(
        m.measured.passengersPerTrip.mean,
        m.analysis.roundTripTerms.passengersPerTrip,
      );
      const stopDivergence = reconciliationOf(bank.buildingId).stopDivergence;
      rows.push(
        `${bank.buildingId.padEnd(20)} P ${m.measured.passengersPerTrip.mean.toFixed(2)} vs ` +
          `${m.analysis.roundTripTerms.passengersPerTrip.toFixed(2)} (${(loadDivergence * 100).toFixed(1)} %)  ` +
          `S ${m.measured.stopsPerTrip.mean.toFixed(2)} vs ` +
          `${m.matched.result.expectedStops.toFixed(2)} (${(stopDivergence * 100).toFixed(1)} %)`,
      );
      // The load cell is mass-based against a N(75, 15) mass distribution, so the simulator is
      // not obliged to land on 0.8 × capacity persons. 5 % is the band inside which the rest of
      // the comparison is a statement about time rather than about load.
      expect({ id: bank.buildingId, within: Math.abs(loadDivergence) < 0.05 }).toEqual({
        id: bank.buildingId,
        within: true,
      });
      // `reconcileRoundTrip` applies its own 3 % band to this and warns when it is breached; the
      // warning list is asserted empty below, so this is the same check stated where it is read.
      expect({ id: bank.buildingId, within: Math.abs(stopDivergence) < 0.03 }).toEqual({
        id: bank.buildingId,
        within: true,
      });
    }
    // eslint-disable-next-line no-console
    console.log(`\nload and stops, measured against the closed form:\n${rows.join('\n')}\n`);
  });

  it('reproduces Barney’s population model in the corrected round trip, not a similar one', () => {
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      // The Monte Carlo draws destinations exactly the way `S` and `H` are derived from. That it
      // reproduces `S` is what makes it the same model with different physics rather than a
      // different model that happens to give a similar number.
      expect({
        id: bank.buildingId,
        agrees: Math.abs(relativeDivergence(m.corrected.stops, m.matched.result.expectedStops)) < 0.01,
      }).toEqual({ id: bank.buildingId, agrees: true });
      // And the per-stop fixed cost is untouched: both sides charge `(S+1)·(open + close + start
      // + level)`. A divergence here would invalidate the other two corrections rather than add
      // to them, which is why `reconcileRoundTrip` reports it as an uncited term.
      expect({
        id: bank.buildingId,
        agrees: Math.abs(relativeDivergence(m.corrected.fixedS, m.matched.result.stopTimeS)) < 0.02,
      }).toEqual({ id: bank.buildingId, agrees: true });
    }
  });
});

/* ========================================================================== *
 * The table.
 * ========================================================================== */

describe('the five-building reconciliation', () => {
  it('is out against the textbook expression on every one of the five, in the same direction', () => {
    // The honest headline, asserted rather than footnoted so nobody can quote the reconciled
    // figures below without meeting this one first. A simulator reading *faster* than the closed
    // form would be the alarming case: everything the formula omits only ever adds seconds, so
    // `CLOSED_FORM_COMPARISON_RULE` predicts one sign and only one.
    const rows: string[] = [];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      const interval = intervalDivergenceOf(bank.buildingId);
      const capacity = capacityDivergenceOf(bank.buildingId);
      rows.push(
        `${bank.buildingId.padEnd(20)} INT ${(interval * 100).toFixed(1).padStart(6)} %   ` +
          `%POP ${(capacity * 100).toFixed(1).padStart(6)} %   ` +
          `RTT ${(relativeDivergence(m.measured.roundTripS.mean, m.analysis.result.roundTripTimeS) * 100).toFixed(1).padStart(6)} %`,
      );
      // Longer round trip, therefore longer interval and lower achieved capacity. Both signs, on
      // all five.
      expect({ id: bank.buildingId, intervalLong: interval > 0, capacityLow: capacity < 0 }).toEqual(
        { id: bank.buildingId, intervalLong: true, capacityLow: true },
      );
      expect(m.measured.roundTripS.mean).toBeGreaterThan(m.matched.result.roundTripTimeS);
      // And the two are the same finding seen twice: `%POP = 300·P·L / (RTT·U)`, so once the load
      // is matched the two divergences must be near mirror images. If they stopped being, one of
      // the two metrics would be wrong.
      expect({ id: bank.buildingId, mirrored: Math.abs(interval + capacity) < 0.09 }).toEqual({
        id: bank.buildingId,
        mirrored: true,
      });
    }
    // eslint-disable-next-line no-console
    console.log(`\nraw divergence against the textbook closed form:\n${rows.join('\n')}\n`);
  });

  it('is out by exactly the documented simplifications, on all five, and by nothing else', () => {
    // The measurement the roadmap's criterion actually means. Each gap is re-costed by running
    // the closed form's own population model with this project's jerk-limited `travelTime` and
    // real `dwellSecondsFor`, and the residual is what no documented simplification explains.
    //
    // The band is `DEFAULT_RESIDUAL_TOLERANCE` — 4 %, "a few percent" as the roadmap words it —
    // and it is not slack for a bug: the corrections carry no free parameter that could absorb
    // one. They are computed from the reference data and the shipped physics.
    const rows: string[] = [];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      const r = reconciliationOf(bank.buildingId);
      const terms = r.terms
        .map(
          (term) =>
            `${term.assumptionIds.join('+') || '(uncited)'} ${term.secondsS >= 0 ? '+' : ''}${term.secondsS.toFixed(1)} s`,
        )
        .join(', ');
      rows.push(
        `${bank.buildingId.padEnd(20)} raw ${(r.rawDivergence * 100).toFixed(1).padStart(6)} %  ` +
          `-> residual ${(r.residual * 100).toFixed(3).padStart(7)} %   ` +
          `[${m.measured.roundTripS.mean.toFixed(2)} s vs ${r.correctedRoundTripS.toFixed(2)} s]   ${terms}`,
      );

      // No warnings. `reconcileRoundTrip` raises one when the closed form's terms do not
      // partition its own total, when a `bias: 'under'` correction comes out negative, or when
      // the stop counts disagree — each of which would make the residual meaningless rather than
      // merely large.
      expect({ id: bank.buildingId, warnings: r.warnings }).toEqual({
        id: bank.buildingId,
        warnings: [],
      });
      expect({ id: bank.buildingId, explained: r.explained }).toEqual({
        id: bank.buildingId,
        explained: true,
      });
      expect(Math.abs(r.residual)).toBeLessThan(DEFAULT_RESIDUAL_TOLERANCE);

      // Both corrections are `bias: 'under'`, so both can only add seconds. The closed form
      // cannot be rescued by one offsetting the other, which is what makes this an accounting
      // rather than a fit.
      for (const term of r.terms) {
        if (term.assumptionIds.length === 0) continue;
        for (const id of term.assumptionIds) {
          expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === id)?.bias).toBe('under');
          expect(CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain(id);
        }
        expect(term.secondsS).toBeGreaterThan(0);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nafter charging the documented simplifications:\n${rows.join('\n')}\n`);
  });

  it('reproduces the two residuals docs/07-handoff.md § 5 already records', () => {
    // **The load-bearing check on the apparatus.** These two buildings were measured at n = 128
    // on the whole building through the Phase 2 gate's own code. This file measures them at
    // n = 64, through the generic derivation, with departures reconstructed at a per-bank
    // threshold. Reproducing them is what makes the three new buildings' agreement evidence
    // about the simulator rather than about the new apparatus.
    //
    // | | handoff § 5 | measured here |
    // |---|---|---|
    // | Midtown Office | +27.5 % INT / −23.2 % %POP, 0.001 % residual | printed above |
    // | Garden Apartments | +7.5 % / −7.1 %, 0.69 % residual | printed above |
    //
    // The bands below bracket the recorded figures with room for the change in `n` and in
    // window, and no more. They are not the place to absorb a regression: a shift past them is a
    // change in the simulator, and the residual assertion in the previous test is what would
    // catch it if it were a large one.
    const midtownInterval = intervalDivergenceOf('midtown-office');
    const midtownCapacity = capacityDivergenceOf('midtown-office');
    expect(midtownInterval).toBeGreaterThan(0.20);
    expect(midtownInterval).toBeLessThan(0.35);
    expect(midtownCapacity).toBeLessThan(-0.18);
    expect(midtownCapacity).toBeGreaterThan(-0.30);
    expect(Math.abs(reconciliationOf('midtown-office').residual)).toBeLessThan(0.02);

    const gardenInterval = intervalDivergenceOf('garden-apartments');
    const gardenCapacity = capacityDivergenceOf('garden-apartments');
    expect(gardenInterval).toBeGreaterThan(0.03);
    expect(gardenInterval).toBeLessThan(0.13);
    expect(gardenCapacity).toBeLessThan(-0.03);
    expect(gardenCapacity).toBeGreaterThan(-0.13);
    expect(Math.abs(reconciliationOf('garden-apartments').residual)).toBeLessThan(0.02);

    // And the ordering the handoff explains: Garden, the *short* building with the *slow* cars,
    // agrees with the textbook expression better than Midtown. The next test says why.
    expect(Math.abs(gardenInterval)).toBeLessThan(Math.abs(midtownInterval));
  });

  it('orders the five by acceleration distance against floor pitch, which is the mechanism', () => {
    // `docs/07-handoff.md` § 5: the governing quantity is floor pitch relative to the distance
    // the car needs to reach rated speed. A jerk-limited flight that *does* reach rated speed
    // costs `d/v + v/a + a/j`; the loss term is a property of the machine and does not shrink
    // with the distance flown, so the closed form's error per stop is worst where that loss is
    // large relative to `tv = df/v`.
    //
    // This is stated in the handoff for two buildings. Here it is measured on five, and the
    // prediction it makes — that the ranking by `real one-floor flight / tv` is the ranking by
    // raw round-trip divergence — is checked rather than asserted in prose.
    const rows: { id: string; ratio: number; rawRtt: number; reaches: boolean }[] = [];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      const df = m.analysis.interfloorDistanceM;
      const tv = m.analysis.roundTripTerms.singleFloorTransitS;
      const realHopS = travelTime(df, m.car.constraints);
      rows.push({
        id: bank.buildingId,
        ratio: realHopS / tv,
        rawRtt: relativeDivergence(m.measured.roundTripS.mean, m.analysis.result.roundTripTimeS),
        // `v²/a` is the handoff's figure for the acceleration distance. It ignores the jerk
        // ramps, so it *understates* the true distance to rated speed; the honest comparison is
        // against the profile the simulator actually flies, which is what `travelTime` builds.
        reaches: m.car.constraints.ratedSpeedMps ** 2 / m.car.spec.acceleration <= df,
      });
    }
    // eslint-disable-next-line no-console
    console.log(
      `\nconstant-speed penalty against raw divergence:\n${rows
        .map(
          (row) =>
            `${row.id.padEnd(20)} real hop / tv = ${row.ratio.toFixed(2).padStart(5)}   ` +
            `raw RTT ${(row.rawRtt * 100).toFixed(1).padStart(6)} %   ` +
            `reaches rated speed in one floor: ${row.reaches ? 'yes' : 'NO'}`,
        )
        .join('\n')}\n`,
    );

    // Midtown Office is the genuine speed negative control: `v²/a` is 6.25 m against a 3.8 m
    // pitch, so its car never reaches rated speed on a one-floor hop and `tv = df/v` is not an
    // approximation of the flight time so much as a fiction.
    const midtown = rows.find((row) => row.id === 'midtown-office');
    expect(midtown?.reaches).toBe(false);
    expect(midtown?.ratio).toBeGreaterThan(2.5);

    // Garden Apartments is the counter-case `docs/04-test-buildings.md` once got backwards: its
    // 0.63 m/s hydraulic needs 0.66 m against a 3.0 m pitch and spends most of a hop at rated
    // speed. A slow hydraulic is **closer** to the constant-velocity idealisation than a fast
    // traction car, which is why the short building agrees better.
    const garden = rows.find((row) => row.id === 'garden-apartments');
    expect(garden?.reaches).toBe(true);
    expect(garden?.ratio).toBeLessThan(1.5);

    // The prediction, on all five: rank by penalty, rank by divergence, and check the two
    // rankings agree. Spearman on five points is a weak instrument, so the claim asserted is the
    // strong and simple one — the largest penalty is the largest divergence, and the smallest is
    // the smallest.
    const byPenalty = [...rows].sort((a, b) => a.ratio - b.ratio);
    const byDivergence = [...rows].sort((a, b) => a.rawRtt - b.rawRtt);
    expect(byPenalty.at(0)?.id).toBe(byDivergence.at(0)?.id);
    expect(byPenalty.at(-1)?.id).toBe(byDivergence.at(-1)?.id);
  });

  it('bunches on all five, which the closed form has no way to express', () => {
    // `no-dispatcher`, `bias: 'none'`: the closed form assumes departures exactly `INT` apart and
    // therefore has no variance at all. A matching mean interval says nothing about spacing, and
    // spacing is what a waiting passenger experiences. Reported as a separate finding from the
    // mean, on every building, because it is one.
    const rows: string[] = [];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      rows.push(`${bank.buildingId.padEnd(20)} interval CoV ${m.intervalCoV.mean.toFixed(3)}`);
      expect({ id: bank.buildingId, bunches: m.intervalCoV.mean > 0.2 }).toEqual({
        id: bank.buildingId,
        bunches: true,
      });
    }
    expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === 'no-dispatcher')?.bias).toBe('none');
    // eslint-disable-next-line no-console
    console.log(`\ndeparture bunching the closed form assumes away:\n${rows.join('\n')}\n`);
  });

  it('prints the five-building reconciliation table', () => {
    const header =
      '| building | bank | raw INT | raw %POP | raw RTT | residual after charging | verdict |';
    const lines = [header, '|---|---|---|---|---|---|---|'];
    for (const bank of PRINCIPAL_BANKS) {
      const m = measurementOf(bank.buildingId);
      const r = reconciliationOf(bank.buildingId);
      lines.push(
        `| ${m.isolated.name.split(' — ')[0]} | ${bank.bankId} | ` +
          `${(intervalDivergenceOf(bank.buildingId) * 100).toFixed(1)} % | ` +
          `${(capacityDivergenceOf(bank.buildingId) * 100).toFixed(1)} % | ` +
          `${(relativeDivergence(m.measured.roundTripS.mean, m.analysis.result.roundTripTimeS) * 100).toFixed(1)} % | ` +
          `**${(r.residual * 100).toFixed(3)} %** | ` +
          `${r.explained ? 'RECONCILED' : 'UNEXPLAINED'} |`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `\nPhase 8 five-building reconciliation (n = ${REPLICATIONS}, demand ${OVERLOAD_FACTOR}× closed-form %POP):\n` +
        `${lines.join('\n')}\n\n` +
        `all five measurements: ${(elapsedMs / 1000).toFixed(1)} s\n`,
    );
    for (const bank of PRINCIPAL_BANKS) {
      expect(reconciliationOf(bank.buildingId).explained).toBe(true);
    }
  });
});

/* ========================================================================== *
 * What is not reconciled, and why. Findings about buildings, not failures.
 * ========================================================================== */

describe('the banks that cannot be reconciled, and the mechanism for each', () => {
  it('Vertical City’s shuttle is blocked four separate ways, and none is a tolerance', () => {
    const vertical = config.buildingsById.get('vertical-city');
    if (vertical === undefined) throw new Error('missing vertical-city');
    const shuttle = vertical.banks.find((bank) => bank.id === 'shuttle');
    if (shuttle === undefined) throw new Error('missing shuttle');

    // **(1) The hardware is not the hardware.** Eight double-deck cars, and double-deck operation
    // is not simulated: each runs as a single-deck car of the same whole-car capacity, so it makes
    // up to twice the stops the declared machine would. `loadConfig` raises
    // `double-deck-not-simulated` and the disclaimer travels in `RunRecord.warnings` — the
    // mechanism that exists precisely so a figure cannot be published without it.
    expect(shuttle.cars.every((car) => car.doubleDeck)).toBe(true);
    const disclaimers = vertical.warnings.map((warning) => warning.code);
    expect(disclaimers).toContain('double-deck-not-simulated');

    // **(2) It has no population of its own to drive.** Every one of its eight served floors
    // declares `population: 0` — two ground-lobby levels and six sky lobbies — because the people
    // it lifts live on floors it does not open onto. `U` is therefore *entirely* onward traffic
    // (2872 occupants of zones 3–6), and a bank isolated from its onward banks has nobody in it.
    // The measurement refuses rather than simulating an empty building, which is the right
    // failure: a `%POP` computed against a population of zero is not a small number, it is not a
    // number.
    expect(() =>
      measureUpPeak({
        config,
        buildingId: 'vertical-city',
        bankId: 'shuttle',
        seeds: [1],
        peakWindowS: 300,
      }),
    ).toThrow(/population \(U\) must be a finite, positive number/i);
    for (const id of shuttle.servesFloors) {
      expect(vertical.floorsById.get(id)?.population).toBe(0);
    }
    expect(deriveUpPeakCase(vertical, 'shuttle', config.elevatorSpecs).servedPopulation).toBe(2872);

    // **(3) Departures could not be reconstructed even so.** A 26-person car at the residential
    // 1.75 s holds its doors 41.20 s; its nearest served floor is the upper ground lobby 4.5 m
    // up, so the shortest possible round trip is 30.03 s. No clustering threshold separates a
    // reopen from a return. Measured in `bankCensus.test.ts` against the same reference data.
    const car = shuttle.cars[0];
    if (car === undefined) throw new Error('shuttle has no cars');
    const fullLoadTransferS = 0.8 * car.capacityPersons * (car.passengerTransferS ?? 0);
    const maxReopenS =
      car.doorOpenS + Math.max(car.dwellHallCallS, car.dwellCarCallS, fullLoadTransferS) + car.doorCloseS;
    const legS =
      car.doorCloseS +
      car.motorStartDelayS +
      travelTime(4.5, { ratedSpeedMps: car.ratedSpeedMps, acceleration: car.acceleration, jerk: car.jerk }) +
      car.levelingSettleS +
      car.doorOpenS;
    const minRoundTripS = 2 * legS + car.dwellHallCallS + car.dwellCarCallS;
    expect(maxReopenS).toBeCloseTo(41.2, 1);
    expect(maxReopenS).toBeGreaterThan(minRoundTripS);

    // **(4) `N` is not the number of destination floors the model means.** Its eight served
    // floors are four *pairs* 4.5 m apart — a lower and an upper boarding level of the same lobby
    // — and deck assignment at sky lobby A is binding: zone 3 boards only at 26, zone 4 only at
    // 27. A single-deck round trip over seven "destinations" is not the round trip this bank
    // makes, whatever the timings say.
    expect(shuttle.servesFloorPairs).toHaveLength(4);
    for (const pair of shuttle.servesFloorPairs ?? []) {
      const [lower, upper] = pair;
      const rise =
        (vertical.floorsById.get(upper)?.heightM ?? 0) - (vertical.floorsById.get(lower)?.heightM ?? 0);
      expect(rise).toBeCloseTo(shuttle.cars[0]?.deckSeparationM ?? 0, 6);
    }

    // Any figure published for this bank — and `bankCensus.test.ts` publishes its closed form —
    // is a single-deck figure for double-deck hardware. Restated here so the two files cannot
    // drift apart on it.
    const derived = deriveUpPeakCase(vertical, 'shuttle', config.elevatorSpecs);
    expect(derived.terminalProvenance).toBe('fallback');
    expect(derived.destinationProvenance).toBe('fallback');
  });

  it('Mixed-Use High-Rise’s residential-local cannot be measured from boarding times either', () => {
    // A 20-person car at the residential 1.75 s: `16 × 1.75 = 28.0 s` of transfer sets the dwell,
    // and `1.8 + 28.0 + 3.0 = 32.8 s` of reopen is longer than the 31.3 s it takes to go one
    // 3.2 m floor up and come back. The building's *terminal* is unmeasurable for a second and
    // independent reason `metrics/summarize.ts` records — at the ground lobby a shuttle holding
    // its doors 41.2 s shares the floor with an office-local car whose whole round trip is 31.3 s
    // — but this bank's terminal is the sky lobby at 31, and it is unmeasurable on its own
    // timings alone.
    //
    // That is a limit of reconstructing departures from boarding times. It is not a defect in the
    // simulator, and it is not a tolerance: the fix is a car-position series, which no run record
    // carries. Mixed-Use High-Rise is reconciled through `office-local` instead, which is the
    // bank that carries its street-entrance up-peak.
    expect(() =>
      measureUpPeak({
        config,
        buildingId: 'mixed-use-high-rise',
        bankId: 'residential-local',
        seeds: [1],
        peakWindowS: 300,
      }),
    ).toThrow(/no clustering threshold|not shorter than/i);
  });

  it('names every bank the table does not cover, so the gap is stated rather than implied', () => {
    const covered = new Set(PRINCIPAL_BANKS.map((bank) => `${bank.buildingId}/${bank.bankId}`));
    const all = [...config.buildingsById.values()]
      .filter((building) => PRINCIPAL_BANKS.some((bank) => bank.buildingId === building.id))
      .flatMap((building) => building.banks.map((bank) => `${building.id}/${bank.id}`));
    const uncovered = all.filter((id) => !covered.has(id)).sort();
    expect(uncovered).toEqual([
      'mixed-use-high-rise/residential-local',
      'mixed-use-high-rise/shuttle',
      'secure-tower/high',
      'vertical-city/shuttle',
      'vertical-city/zone-2-local',
      'vertical-city/zone-3-local',
      'vertical-city/zone-4-local',
      'vertical-city/zone-5-local',
      'vertical-city/zone-6-local',
    ]);
    // Of those nine: three cannot be measured at all (the two asserted above and
    // `vertical-city/zone-6-local`, whose bracket is empty for the same reason), and six are
    // measurable and covered by `deepCampaign.test.ts` rather than by the always-on budget.
    // eslint-disable-next-line no-console
    console.log(
      `\nbanks outside the always-on table (${uncovered.length}):\n  ${uncovered.join('\n  ')}\n` +
        '  3 unmeasurable (empty departure bracket); 6 measurable, in deepCampaign.test.ts\n',
    );
  });
});
