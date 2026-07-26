/**
 * The Phase 5 benchmark's arms: which buildings, at which operating point, against which baseline,
 * with which replication budget — and why each of those numbers is the one it is.
 *
 * Everything here is **data** (CLAUDE.md invariant 7). A building is an id, an operating point is a
 * `TrafficArmSpec`, a dispatcher is a profile id out of `data/dispatcher-profiles.json`. Nothing in
 * this directory branches on any of them.
 *
 * ## The operating point is not a free choice, and it is not a loosened tolerance
 *
 * docs/03-traffic-and-statistics.md § Part 3 and `CellAggregate.awtIsValid`: **any** replication
 * whose queue diverged, whose window was empty, or whose AWT was censored invalidates the whole
 * cell's AWT, and a cell with no valid AWT has no interval to quote. A Phase 5 comparison needs a
 * quotable AWT on *both* sides, so the admissible operating points are exactly those where the
 * baseline and every arm come back clean. {@link BENCHMARK_CASES} records the census that fixed
 * each one, and `saturationCensus.test.ts` re-measures it rather than trusting this comment.
 *
 * Two consequences that shaped every number below.
 *
 * **1. `nearest-car` is the binding constraint, on two of the three buildings.** It is the *only*
 * profile in the shipped library that saturates anywhere in this study: measured over 1000
 * replications per cell, `nearest-car` diverges once on Midtown Office up-peak (first at
 * replication index 287) and once on Secure Tower up-peak (index 190), and no other profile
 * diverges once on any of the three buildings. So the **replication budget has a ceiling set by
 * the baseline**, not by patience:
 *
 * | Building | operating point | baseline's first invalid replication | budget used |
 * |---|---|---|---|
 * | Midtown Office | up-peak, 1 % pop/5 min, 900 s, peak-5min | 287 | **250** |
 * | Garden Apartments | residential, 2 % pop/5 min, 3600 s, full-run | none in 1000 | **500** |
 * | Secure Tower | up-peak, 2 % pop/5 min, 900 s, peak-5min | 190 | **150** |
 *
 * That ceiling is the single most consequential fact about this phase's resolution. Phase 3
 * measured a 1.33 s paired half-width at n = 100 on Midtown and observed that the detectable
 * effect falls as `1/sqrt(n)`; on this building it stops falling at n = 287, so **~0.8 s (≈5 % of
 * `eta`'s AWT) is the floor of what any budget can resolve here**, and raising `n` further is not
 * available as a remedy. A dispatcher whose gain is below it is indistinguishable *permanently* at
 * this operating point, not merely at this budget.
 *
 * **2. Garden Apartments needs the full-run window, not peak-5min.** At the sparse rates where
 * parking policy actually dominates — the whole reason the roadmap names this building — the
 * peak-5-minute window contains **1 to 11 arrivals**, and a window with none has no AWT at all.
 * Measured: at 1 % the peak-5min cell is invalid on 54 replications in 100, at 2 % on 20, at 4 % on
 * 11, at 6 % on 1, and only at 8 % is it clean. Reporting the peak-5min window would therefore
 * have forced Garden to 8 % of population per 5 minutes — four times the rate at which the parking
 * effect is largest — so the horizon is lengthened to 3600 s and the window is the whole run
 * instead. That trades a *peak* statistic for a *day* statistic and says so; it does not trade a
 * valid interval for an invalid one.
 *
 * ## The baseline, and why the arm list is the whole shipped library
 *
 * The criterion names `NearestCarDispatcher`, which in this codebase is the `nearest-car` weight
 * vector. Every other profile in `data/dispatcher-profiles.json` is an arm — including `eta`, which
 * the profile file labels a baseline, because a criterion that each dispatcher beat `nearest-car`
 * is a claim about `eta` too, and because `eta` turns out to be the yardstick the interesting arms
 * fail against.
 *
 * `data/dispatcher-profiles.json` ships **two** auction profiles, and that is why {@link ARM_PROFILES}
 * has nine entries rather than eight. `config/schema.ts` carries an `auction` section and
 * `dispatch/policies/registry.ts` selects the policy factory from `auction.aggregation`, so the
 * aggregation is a profile field: `auction` is sealed bid at one round (provably the centralized
 * argmin) and `auction-multi-round` is three rounds with a 25 s reserve, identical everywhere else.
 * The pair therefore yields a paired-t interval **on the aggregation**, which is what the previous
 * design — both arms built from one profile through an options object, because the config layer
 * could not carry the section — could not produce at all. See `auctionAggregation.ts` for the
 * equivalence proof and for the decision-level divergence rate.
 */

import type { TrafficArmSpec } from '../runner/types.js';

import type { ReplicationMetric } from '../runner/metrics.js';

/* -------------------------------------------------------------------------- *
 * The baseline and the arms
 * -------------------------------------------------------------------------- */

/** The profile the roadmap's criterion names. */
export const BASELINE_PROFILE = 'nearest-car';

/**
 * Every other profile in `data/dispatcher-profiles.json`, in file order.
 *
 * Not filtered, not reordered, and nothing dropped for losing. A profile that fails to beat the
 * baseline is a result about that profile.
 */
export const ARM_PROFILES: readonly string[] = Object.freeze([
  'eta',
  'collective',
  'energy-aware',
  'fairness-first',
  'capacity-aware',
  'predictive-balanced',
  'auction',
  'auction-multi-round',
  'zoned-uppeak',
]);

/* -------------------------------------------------------------------------- *
 * The metrics
 * -------------------------------------------------------------------------- */

/**
 * The four metrics every cell is reported on, and the direction that counts as better.
 *
 * `wt95S` and `pctOverLongWait` are here on equal footing with `awtS`, not as decoration. A
 * fairness term exists to pull the **tail** in, and docs/03-traffic-and-statistics.md § Part 5 is
 * explicit that means hide tails; a report of `awtS` alone would be unable to see the only thing
 * `fairness-first` is for. `ttdMeanS` is the passenger's whole journey, which is the quantity a
 * `rideTime` or `detourPenalty` weight trades against wait.
 *
 * Every one is *lower-is-better*, which is why {@link classify} can compare a signed difference
 * against zero without a per-metric branch. Declared rather than assumed: a metric added here whose
 * direction ran the other way would silently invert eight verdicts.
 */
export const BENCHMARK_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'pctOverLongWait',
  'ttdMeanS',
]);

/** Human labels, for the report table only. Feeds no decision. */
export const METRIC_LABELS: Readonly<Record<string, string>> = Object.freeze({
  awtS: 'AWT (s)',
  wt95S: 'WT95 (s)',
  pctOverLongWait: '% > 60 s',
  ttdMeanS: 'TTD (s)',
});

/* -------------------------------------------------------------------------- *
 * The cases
 * -------------------------------------------------------------------------- */

/** One (building, operating point, budget) the whole arm list is measured at. */
export interface BenchmarkCase {
  readonly id: string;
  readonly label: string;
  readonly building: string;
  readonly traffic: TrafficArmSpec;
  /** Replications per arm, under CRN. Bounded above by {@link admissibleReplications}. */
  readonly replications: number;
  /**
   * Largest budget at which **every** arm including the baseline still has a valid AWT, measured
   * over 1000 replications. `undefined` means none of the 1000 was invalid.
   *
   * This is the ceiling `1/sqrt(n)` stops at. `saturationCensus.test.ts` re-measures it.
   */
  readonly admissibleReplications: number | undefined;
  /** Why this rate and this window. Prose, so a reader can argue with the choice. */
  readonly rationale: string;
}

/** Midtown Office under the closed form's own conditions: everything in through the main entrance. */
const MIDTOWN_UP_PEAK_1PCT: TrafficArmSpec = Object.freeze({
  id: 'up-peak-1pct',
  durationS: 900,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1,
    peakWindowS: 300,
  }),
});

/** Garden Apartments over a full hour, reported over the whole run. See the module doc. */
const GARDEN_RESIDENTIAL_2PCT: TrafficArmSpec = Object.freeze({
  id: 'residential-2pct-fullrun',
  durationS: 3600,
  reportWindow: 'full-run',
  demand: Object.freeze({ arrivalRatePctPop5min: 2, peakWindowS: 300 }),
});

/** Secure Tower up-peak. No `entranceWeights`: this building has one entrance. */
const SECURE_UP_PEAK_2PCT: TrafficArmSpec = Object.freeze({
  id: 'up-peak-2pct',
  durationS: 900,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
    arrivalRatePctPop5min: 2,
    peakWindowS: 300,
  }),
});

/**
 * The three cases the acceptance criterion is argued on.
 *
 * Midtown Office because it is the roadmap's own up-peak building and the Phase 2 oracle's
 * validation case. Garden Apartments because the criterion's second sentence names it. Secure Tower
 * as the third, because the criterion says *at least one building* and a claim that holds on one
 * building and evaporates on the next two is worth knowing about.
 */
export const BENCHMARK_CASES: readonly BenchmarkCase[] = Object.freeze([
  Object.freeze({
    id: 'midtown-up-peak',
    label: 'Midtown Office, up-peak 1 %',
    building: 'midtown-office',
    traffic: MIDTOWN_UP_PEAK_1PCT,
    replications: 250,
    admissibleReplications: 287,
    rationale:
      '1 % of population per 5 minutes is the highest rate at which the baseline returns a valid AWT: at 2 % nearest-car saturates 7 replications in 100 and at 4 % it saturates 52, and a saturated cell has no quotable mean. n = 250 because nearest-car diverges on replication index 287 at this rate, so 287 is the ceiling on any budget here.',
  }),
  Object.freeze({
    id: 'garden-residential',
    label: 'Garden Apartments, residential 2 %, full run',
    building: 'garden-apartments',
    traffic: GARDEN_RESIDENTIAL_2PCT,
    replications: 500,
    admissibleReplications: undefined,
    rationale:
      'The building the criterion names for pre-positioning, at a rate sparse enough that idle car position dominates. Reported over the full run rather than the peak 5 minutes because at 2 % the peak window holds a handful of arrivals and is empty often enough to invalidate the cell (20 replications in 100 at peak-5min). Nothing saturates in 1000 replications, so the budget is a choice rather than a ceiling.',
  }),
  Object.freeze({
    id: 'secure-up-peak',
    label: 'Secure Tower, up-peak 2 %',
    building: 'secure-tower',
    traffic: SECURE_UP_PEAK_2PCT,
    replications: 150,
    admissibleReplications: 190,
    rationale:
      'The access-control building, where the eligibility filter intersects service and access zoning on every call. n = 150 because nearest-car diverges on replication index 190 at this rate.',
  }),
]);

/** The case of this id. @throws Error when there is none. */
export function benchmarkCase(id: string): BenchmarkCase {
  const found = BENCHMARK_CASES.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(
      `No benchmark case "${id}". Known: ${BENCHMARK_CASES.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return found;
}
