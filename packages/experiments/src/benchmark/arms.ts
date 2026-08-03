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
 * `data/dispatcher-profiles.json` ships **two** auction profiles, and that is one of the two
 * reasons {@link ARM_PROFILES} has twelve entries rather than nine — the third is
 * `collective-enroute`, `collective` plus `eligibility.enRouteDiversion` (`DECISIONS.md` § D205),
 * which is a *mechanism* rather than a weight and so cannot be an arm by weight vector alone — the
 * other being that it ships
 * **two** destination profiles, Phase 6a's Level-0 `destination-eta` and Phase 6b's Level-1
 * `destination-panel`, which are different *systems* rather than different weights (docs/09 § 1.1).
 * `config/schema.ts` carries an `auction` section and
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
 * Phase 6b's shipped profile — Level 1, `mobile-credential` + `passengerAssignment: 'panel'`.
 *
 * Named `destination-panel` rather than `destination-dispatch`, which is what
 * `the root DECISIONS.md` § T16-D7 handed back, and the reason is a guard rather than a
 * preference: `core/src/dispatch/policies/policies.test.ts` asserts that `sim/simulation.ts`
 * contains no shipped profile id as a string literal (invariant 7), and `simulation.ts`
 * legitimately contains the `PassengerModel` literal `'destination-dispatch'`. A profile id that
 * collides with a passenger-model name leaves that guard unable to tell a name clash from a real
 * branch. Renaming the profile costs a word; relaxing the guard costs the invariant.
 */
export const DESTINATION_DISPATCH_PROFILE = 'destination-panel';

/**
 * Every other profile in `data/dispatcher-profiles.json`, in file order.
 *
 * Not filtered, not reordered, and nothing dropped for losing. A profile that fails to beat the
 * baseline is a result about that profile.
 */
/*
 * **This comment used to say `collective-enroute` is bit-identical to `collective` at the two
 * up-peak cells, and that every pinned figure for the two arms matches to the last digit. That was
 * false, and `published.ts` had said so since the arm landed** — six of the eight pinned figures at
 * those cells differ. Nothing could fail on it: the claim was prose about numbers, and no test read
 * the numbers. `DECISIONS.md` § D210 is the correction, and `collectiveAdoption.test.ts` now asserts
 * the pins in both directions so it cannot go stale again.
 *
 * What was right was the *mechanism* half. `midtown-up-peak` and `secure-up-peak` are pure up-peak:
 * cars run to the lobby empty and climb full, so there is almost nothing to divert for — and § D210
 * proves it in the strongest available form rather than calling it rare. Under common random
 * numbers, holding `detourPenalty` fixed and flipping only the setting gives a paired difference of
 * **exactly `[0.000, 0.000]`** on both metrics at both cells and both seeds, and
 * `stageActivity.diversions` is **0**. The mechanism is not merely quiet here; it is inert.
 *
 * What did not follow is the conclusion. The two arms differ by `detourPenalty: 0.2` **as well as**
 * by the setting, and a weight does not need a diversion to fire in order to re-order which car
 * takes a call. The whole of the separation at these cells is the weight: `collective` −6.8148
 * against `collective-enroute` −6.7504 on `midtown-up-peak` AWT, −5.7661 against −5.5767 on
 * `secure-up-peak`. `pctOverLongWait` does match to the last digit at both, which is where the
 * impression came from. `garden-residential` has mixed traffic and separates there too — pinned
 * ΔAWT −1.3572 against `collective`'s −1.2689, both relative to `nearest-car`.
 *
 * So this gate does not measure what the arm is for. `benchmark/enRouteDiversion.ts` does, on
 * down-peak, where § D205 measured 58.2 % of down-travelling legs being driven past. The arm is
 * here because every shipped profile must face the gate, not because the gate is where its case is
 * made — and § D210 is why that distinction has teeth: the gate is exactly where adoption was
 * refused, on a cost the down-peak study could not see.
 */
export const ARM_PROFILES: readonly string[] = Object.freeze([
  'eta',
  'collective',
  'collective-enroute',
  'energy-aware',
  'fairness-first',
  'capacity-aware',
  'predictive-balanced',
  'auction',
  'auction-multi-round',
  'zoned-uppeak',
  'destination-eta',
  'destination-panel',
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
export const MIDTOWN_UP_PEAK_1PCT: TrafficArmSpec = Object.freeze({
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
export const GARDEN_RESIDENTIAL_2PCT: TrafficArmSpec = Object.freeze({
  id: 'residential-2pct-fullrun',
  durationS: 3600,
  reportWindow: 'full-run',
  demand: Object.freeze({ arrivalRatePctPop5min: 2, peakWindowS: 300 }),
});

/** Secure Tower up-peak. No `entranceWeights`: this building has one entrance. */
export const SECURE_UP_PEAK_2PCT: TrafficArmSpec = Object.freeze({
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

/* -------------------------------------------------------------------------- *
 * Phase 6a — the destination-disclosure operating points
 * -------------------------------------------------------------------------- */

/**
 * **Why Phase 6a needs its own operating points, and why they are not in {@link BENCHMARK_CASES}.**
 *
 * The three cases above are up-peak or sparse-residential, and all three are close to **blind** to
 * destination information. That is not a guess: it is measured, and it is the single most
 * consequential fact about this phase's design.
 *
 * | shipped operating point | what a destination arm does there |
 * |---|---|
 * | Garden Apartments, residential 2 % | **nothing.** One bank, two cars, six floors — an argmin over two candidates almost never flips on a ride-time tiebreak |
 * | Midtown Office, down-peak | **nothing.** Every down trip ends at the lobby, so the destination carries no information the direction button did not already carry |
 * | Midtown Office, up-peak 1 % | almost nothing, and what it does is dominated by the lobby plateau |
 * | Secure Tower, up-peak 2 % | almost nothing: three identical cars per bank serving one unrestricted lobby have nothing for a destination to differentiate |
 * | **Midtown Office, interfloor-mix** | the effect, at full size |
 *
 * A phase that measured destination dispatch at the shipped up-peak points would report *no effect*
 * and would be **wrong about why** — it would read as the ninth instance of the standing
 * requirement's dead seam when it is the information genuinely being absent. So the negative
 * controls are predicted in advance and measured as counts
 * (`destinationDisclosure.ts` `negativeControls`), and the treatment is measured here.
 *
 * These are **not** added to {@link BENCHMARK_CASES} for two reasons, both load-bearing:
 *
 * 1. `BENCHMARK_CASES` is *Phase 5's* gate — "the three cases the acceptance criterion is argued
 *    on". Adding a fourth silently changes what that criterion was argued on.
 * 2. Its baseline is `nearest-car`, and Phase 6a's reference arm is `eta`
 *    (docs/09 § 2.3: `nearest-car` is the only profile that saturates anywhere and it caps the
 *    budget). On {@link SECURE_INTERFLOOR_MIX} **both** conventional profiles are unquotable on
 *    every replication — measured below — so a Phase 5-shaped table there would have no cells at
 *    all rather than the categorical result that is the actual finding.
 *
 * `saturationCensus.test.ts` censuses these two points exactly as it censuses the three above.
 */

/**
 * Midtown Office, mixed directional traffic over half an hour, reported over the whole run.
 *
 * 40/30/30 incoming/outgoing/interfloor at 1.5 % of population per 5 minutes. Interfloor traffic is
 * what makes a destination informative: an up call from floor 9 may be going to 10 or to 20, and
 * only under a destination call type does the dispatcher know which.
 *
 * Full-run rather than peak-5min for the same reason Garden is: this is a *pattern* rather than a
 * peak, and a 300 s window of it is a sample of the pattern rather than the thing itself.
 */
export const MIDTOWN_INTERFLOOR_MIX: TrafficArmSpec = Object.freeze({
  id: 'interfloor-mix',
  durationS: 1800,
  reportWindow: 'full-run',
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

/** The same pattern on Secure Tower. No `entranceWeights`: this building has one entrance. */
export const SECURE_INTERFLOOR_MIX: TrafficArmSpec = Object.freeze({
  id: 'interfloor-mix',
  durationS: 1800,
  reportWindow: 'full-run',
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

/**
 * Phase 6a's two operating points, censused by `saturationCensus.test.ts`.
 *
 * **OQ-5 is settled here and the answer is that `arms.ts`'s existing ceilings do not transfer.**
 * `nearest-car` first loses its AWT at replication 287 on Midtown up-peak and 190 on Secure Tower
 * up-peak; neither number applies to either row below, and the census re-measures rather than
 * reusing them.
 */
export const DESTINATION_CASES: readonly BenchmarkCase[] = Object.freeze([
  Object.freeze({
    id: 'midtown-interfloor-mix',
    label: 'Midtown Office, interfloor-mix 1.5 %, full run',
    building: 'midtown-office',
    traffic: MIDTOWN_INTERFLOOR_MIX,
    replications: 150,
    admissibleReplications: undefined,
    rationale:
      'The primary point, chosen because it is the only shipped-building configuration where destination information exists to be used: 40/30/30 directional traffic means an up call does not determine its own destination. 1.5 % of population per 5 minutes over 1800 s is measured clean — over 1000 replications at seed 20260726 no arm loses its AWT, not even nearest-car, so unlike every Phase 5 case there is no saturation ceiling and n is a choice rather than a limit. n = 150 is re-derived from the measured sd of the paired difference at this point (2.83 s on TTD at rideTime 1.0), which puts the 95 % half-width at 0.45 s against a 1.65 s effect.',
  }),
  Object.freeze({
    id: 'secure-interfloor-mix',
    label: 'Secure Tower, interfloor-mix 1.5 %, full run',
    building: 'secure-tower',
    traffic: SECURE_INTERFLOOR_MIX,
    replications: 150,
    admissibleReplications: 0,
    rationale:
      'The access-control half. The same pattern on the building with five access zones, and the point of it is that the CONVENTIONAL arms cannot serve it: measured over 300 replications at seed 20260726, eta loses its AWT on 259 and nearest-car on 263, both from replication index 0, with 34 % of journeys unserved. The failure is structural rather than load-driven — an access-restricted pickup carries no credential under up-down-buttons, so every car returns accessDenied and the call is permanently unassignable — so lowering the rate does not rescue it. admissibleReplications is 0 for exactly that reason: there is no budget at which a conventional arm has a quotable AWT here, which is why H-ACCESS-1 is reported as counts and not as an interval. The credential-aware arms complete 300 of 300 with 0 unserved.',
  }),
]);

/* -------------------------------------------------------------------------- *
 * The lunch two-way operating point
 * -------------------------------------------------------------------------- */

/**
 * **Midtown Office at lunch: the building's second design case, and the first shipped operating
 * point whose directional mix moves inside the measured window.**
 *
 * ## Why this building, and why for its own reasons
 *
 * `docs/03` § Demand targets has named two-way traffic a *governing peak* since it was written,
 * and the lift literature is blunter than that: the lunch period can be 20–30 % more demanding
 * than the up-peak handling capacity, so a system tuned only for the morning can disappoint at
 * midday. This repository shipped **no** two-way operating point on any office building.
 * Midtown Office is the project's primary office building and its Phase 2 validation case, it
 * already ships an up-peak point and an interfloor-mix point, and it shipped no lunch point at
 * all. That gap is the reason this exists, and it would be worth closing if no dispatcher were
 * ever measured here.
 *
 * The interfloor-mix point is the instructive comparison. Its 40/30/30 split is an **authored**
 * mix with no source cited anywhere in this repository; the lunch template's 45/45/10 period mean
 * is CIBSE Guide D's own figure for exactly this condition (see `data/traffic-profiles.json`).
 * So the newer point is the better-cited of the two.
 *
 * ## Everything except the template is copied from {@link MIDTOWN_INTERFLOOR_MIX}, deliberately
 *
 * Same building, same 1.5 % of population per 5 minutes, same 1800 s, same single-lobby entrance
 * weights, same full-run window. **The only difference between the two points is where the
 * directional mix comes from**, which is what makes them a controlled pair rather than two
 * unrelated cells. It also means the rate is not a free choice made here: it is the rate a
 * censused, shipped Midtown point already runs at (`DESTINATION_CASES`, measured clean over 1000
 * replications at seed 20260726).
 *
 * The rate is emphatically **not** the 13 %/5 min the BCO pairs with this mix in a design
 * calculation. `nearest-car` loses its AWT on Midtown at 2 % (§ {@link BENCHMARK_CASES}); 13 %
 * would saturate the building many times over and produce no quotable interval for anybody. The
 * cited number is a *design* demand for sizing a system; this is a *measurement* point on a
 * system that is already sized, and conflating the two would be the more expensive error.
 *
 * ## No `replications` and no `BenchmarkCase`
 *
 * Deliberately. A budget is a claim about a cell's measured spread, and no arm has been run here.
 * `DECISIONS.md` § D162 condition 3 forbids the commit that adds this template from also adding a
 * selector result, so the operating point ships with its traffic characterized (`lunchTwoWay.ts`)
 * and its dispatcher arms unmeasured, and whoever measures them derives the budget from their own
 * census the way `matrix.ts` § 2 requires.
 */
export const MIDTOWN_LUNCH_TWO_WAY: TrafficArmSpec = Object.freeze({
  id: 'lunch-two-way-1.5pct',
  demandTemplate: 'lunch-two-way',
  durationS: 1800,
  reportWindow: 'full-run',
  demand: Object.freeze({
    // No `directionalSplit`: the template states the mix, and setting both is refused by name.
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

/**
 * The same point with the mix arc collapsed and the total demand held equal — the negative control
 * `DECISIONS.md` § D162 condition 5 requires beside any result measured under a varying mix.
 *
 * `mixAmplitude: 0` holds the mix flat at the period's **own** 45/45/10 mean rather than returning
 * the building to `office-standard`'s 85/5/10, so the control differs from the treatment in the
 * variation of the mix and in nothing else. `core/src/traffic/mixIdentity.test.ts` asserts that it
 * is the ordinary fixed-split code path, passenger for passenger.
 */
export const MIDTOWN_LUNCH_FLAT_CONTROL: TrafficArmSpec = Object.freeze({
  id: 'lunch-two-way-1.5pct-flat',
  demandTemplate: 'lunch-two-way',
  durationS: 1800,
  reportWindow: 'full-run',
  demand: Object.freeze({
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
    mixAmplitude: 0,
  }),
});

/** The destination case of this id. @throws Error when there is none. */
export function destinationCase(id: string): BenchmarkCase {
  const found = DESTINATION_CASES.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(
      `No destination case "${id}". Known: ${DESTINATION_CASES.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return found;
}
