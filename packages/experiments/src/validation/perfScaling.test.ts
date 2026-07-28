/**
 * **Phase 8 § Scale & performance** — how run time scales with floors, cars and demand, and which
 * term dominates.
 *
 * ## What already existed
 *
 * Nothing. No suite in this repository times anything, and none may: `CLAUDE.md` invariant 3 bars
 * `core` from reading a clock at all. `fuzz/deep.test.ts` and `oracle/deepCampaign.test.ts`
 * establish the opt-in convention this file follows, and `benchmark/*` runs large replication
 * counts, but neither measures cost. This is the whole of the project's performance evidence.
 *
 * ## The measurement, and the one confound that had to be designed out
 *
 * Population is held **constant** across the floor sweep. That is not a detail: a synthetic
 * building with `populationPerFloor` fixed has twice the occupants at twice the floors, so a naive
 * floor sweep measures floors *and* demand together and reports their product as "the cost of
 * floors". Here `populationPerFloor = TOTAL / floors`, so the same people are distributed over
 * more levels and the floor count is the only thing that moves.
 *
 * ## Exponents, not milliseconds
 *
 * No assertion anywhere in this file is on an elapsed time. A millisecond threshold is a claim
 * about the machine that ran it; an exponent is a claim about the code, and survives being read on
 * a different box. `validation/perfInstrument.ts` says more about why. The absolute timings *are*
 * printed, labelled with what produced them, because a reader needs the constant as well as the
 * shape — they are simply never asserted.
 *
 * ## An exponent fitted through a clock is still a clock — the split, and why it moved
 *
 * The first two versions of this file asserted **timed** fits in the always-on tier, and both had
 * to be loosened after a flake: demand-vs-rate `R²` went 0.9 → 0.75 and the exponent floor 0.6 →
 * 0.5, each time because another build was running on the same machine. It flaked a third time
 * anyway — `expected 0.887 to be greater than 0.9` on a contended box, passing 5/5 in isolation.
 *
 * A threshold loosened three times asserts nothing, and a gate that goes red under normal load
 * trains everyone to ignore red, which is worse than not having the gate. So the split is no
 * longer by grid size alone. It is by **what the number is made of**:
 *
 * | tier | asserts | why it cannot flake |
 * |---|---|---|
 * | **always-on** | legs and **events** — simulation outputs, per axis and against each other | deterministic: the same seed gives the same counts on any machine, under any load |
 * | **`ELEVATOR_SIM_DEEP=1`** | the wall-clock fits: cost ratios per axis, `R²` and exponent of seconds against rate and against legs | only runs where the machine is expected to be quiet |
 *
 * The always-on tier still **prints** every timing. It simply cannot fail on one.
 *
 * ### What that costs, stated rather than glossed
 *
 * Event count is the kernel's unit of work, so it catches a regression that creates more work —
 * an extra dispatch pass, a re-offer storm, a duplicated stop. It does **not** catch a regression
 * that makes each unit of work more expensive: a per-floor scan inside the per-event path would
 * leave every count below identical and only the milliseconds would move. That guard is real and
 * it now lives in the deep tier. The trade is deliberate: a guard that runs on request and means
 * something beats one that runs always and gets ignored.
 *
 * ## Always-on versus opt-in — stated exactly, with no silent caps
 *
 * **Always-on** (measured at 4.3 s): sweeps over floors {10, 20, 40}, cars {2, 4, 8} and demand
 * {1, 2, 4, 8} % of population per 5 minutes, all at a 2400 s horizon over a fixed population of
 * 4000, each fitted, printed, and asserted **on its deterministic counts**; plus a single
 * **100-floor, 8-car** build-and-run measurement, so the tall-building path is exercised on every
 * commit rather than only on request.
 *
 * **`ELEVATOR_SIM_DEEP=1`** (measured at 11 s for this file): the floor sweep extends to
 * {10, 20, 40, 80, 100} and the car sweep to 16, at 3600 s horizons — a decade of floors rather
 * than a factor of four, which is what makes the fitted exponent worth quoting — **and** the
 * wall-clock gates above are asserted rather than only printed.
 *
 * Every grid point is sized so the simulation dominates the measurement: the first draft ran
 * 900 s horizons over a population of 1200, produced ~55 legs and 6–16 ms per run, and fitted a
 * **negative** exponent for car count out of pure JIT and scheduler noise. Points that small do
 * not measure the simulator, and no threshold set on them would have meant anything.
 */

import { runSimulation, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadResources } from './harness.js';
import { syntheticBuilding } from './syntheticBuilding.js';
import { fitPowerLaw, formatFit, medianSeconds, type PowerLawFit } from './perfInstrument.js';

const DEEP = process.env['ELEVATOR_SIM_DEEP'] === '1';

/** Occupants, held constant across every floor count. See the module docstring. */
const TOTAL_POPULATION = 4000;

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 120_000);

interface Point {
  readonly floors: number;
  readonly cars: number;
  readonly ratePctPop5min: number;
  readonly durationS: number;
}

function configFor(point: Point, seed: number): SimulationConfig {
  const building = syntheticBuilding(
    {
      id: `perf-f${String(point.floors)}-c${String(point.cars)}`,
      floors: point.floors,
      carsPerBank: point.cars,
      banks: 1,
      populationPerFloor: Math.max(1, Math.round(TOTAL_POPULATION / point.floors)),
    },
    config.elevatorSpecs,
    config.trafficProfiles.profiles.map((profile) => profile.id),
  );
  return {
    building,
    dispatcherProfile: config.dispatcherProfilesById.get('eta') as never,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    /* `rise-and-fall` rather than `constant-iso`: the ISO template discards its first 15
       minutes and last 5 as warm-up and cool-down, so a 900 s point would have no measurement
       window at all and the always-on grid would have to be four times longer for no gain in
       what it measures. The shape is identical at every grid point, which is all a cost
       comparison needs. */
    demandTemplate: 'rise-and-fall',
    durationS: point.durationS,
    demand: { arrivalRatePctPop5min: point.ratePctPop5min, peakWindowS: 300 },
    reportWindow: 'full-run',
    drainGraceS: 600,
    onTimeout: 'report',
    runId: `perf-${String(point.floors)}-${String(point.cars)}-${String(point.ratePctPop5min)}`,
  };
}

interface Measured {
  readonly point: Point;
  readonly seconds: number;
  readonly legs: number;
  readonly events: number;
}

function measure(point: Point, repeats = 3): Measured {
  const simConfig = configFor(point, 20260728);
  const probe = runSimulation(simConfig);
  const seconds = medianSeconds(() => runSimulation(simConfig), repeats);
  return {
    point,
    seconds,
    legs: probe.record.passengers.length,
    events: probe.events,
  };
}

/* -------------------------------------------------------------------------- *
 * The three axes
 * -------------------------------------------------------------------------- */

/**
 * What one axis measured.
 *
 * Two families, kept apart on purpose. `eventFit` / `eventRatio` / `legRatio` come from
 * simulation **outputs** and are identical on every machine at every load; `fit` and `costRatio`
 * come from a clock. Only the first family is asserted in the always-on tier — see the module
 * docstring's table.
 */
interface AxisResult {
  /** Seconds against the axis. Printed always, asserted only under `ELEVATOR_SIM_DEEP=1`. */
  readonly fit: PowerLawFit;
  /** Kernel **events** against the axis. Deterministic; this is the always-on cost model. */
  readonly eventFit: PowerLawFit;
  readonly axisRatio: number;
  readonly costRatio: number;
  readonly eventRatio: number;
  readonly legRatio: number;
  readonly measured: readonly Measured[];
}

/**
 * Every axis swept, by key, so the dominance test and the deep tier read recorded numbers rather
 * than re-running the grid. Module scope, because the deep block is a sibling `describe`.
 */
const axes = new Map<string, AxisResult>();

function report(label: string, measured: readonly Measured[], axis: (point: Point) => number): AxisResult {
  const fit = fitPowerLaw(measured.map((entry) => [axis(entry.point), entry.seconds] as const));
  const eventFit = fitPowerLaw(measured.map((entry) => [axis(entry.point), entry.events] as const));
  const first = measured[0] as Measured;
  const last = measured[measured.length - 1] as Measured;
  const axisRatio = axis(last.point) / axis(first.point);
  const costRatio = last.seconds / first.seconds;
  const eventRatio = last.events / first.events;
  const legRatio = last.legs / first.legs;
  console.log(
    `\n[perf] ${label}\n` +
      measured
        .map(
          (entry) =>
            `    ${String(axis(entry.point)).padStart(4)} → ${(entry.seconds * 1000).toFixed(1).padStart(8)} ms` +
            `  (${String(entry.legs)} legs, ${String(entry.events)} events)`,
        )
        .join('\n') +
      `\n    ${formatFit(`${label} — seconds${DEEP ? '' : ', printed only'}`, fit)}` +
      `\n    ${formatFit(`${label} — events (deterministic)`, eventFit)}` +
      `\n    over the range swept: ${axisRatio.toFixed(1)}× the axis → ${eventRatio.toFixed(2)}× the events, ` +
      `${legRatio.toFixed(2)}× the legs, ${costRatio.toFixed(2)}× the wall clock`,
  );
  return { fit, eventFit, axisRatio, costRatio, eventRatio, legRatio, measured };
}

/** The axis that was swept but not yet recorded — a guard against a renamed key. */
function recorded(key: string): AxisResult {
  const result = axes.get(key);
  if (result === undefined) throw new Error(`axis "${key}" was never swept`);
  return result;
}

describe('how run time scales', () => {
  function sweep(
    key: string,
    label: string,
    points: readonly Point[],
    axis: (point: Point) => number,
  ): AxisResult {
    const result = report(label, points.map((point) => measure(point)), axis);
    axes.set(key, result);
    return result;
  }

  /**
   * ## Why the assertions are on ratios and not on `R²` for every axis
   *
   * Only one of the three relationships turns out to be a power law worth fitting. Demand is:
   * the fit is tight and the exponent is meaningful. Floor count, at constant population and
   * constant demand, is very nearly **flat** — and a log-log regression through nearly constant
   * data has almost no variance to explain, so its `R²` is low *because the answer is "no
   * relationship"*, not because the measurement is bad. Demanding `R² > 0.8` there would be
   * demanding that floor count be expensive.
   *
   * So each axis asserts the claim its data actually supports: a bound on how much the **work**
   * moved over the range swept, which is model-free, and `R²` only where an exponent is quoted as
   * a finding. Every bound is mechanically motivated and none is set near the observed value.
   */

  it('scales with floor count, at constant population and constant demand', () => {
    const durationS = DEEP ? 3600 : 2400;
    const floors = DEEP ? [10, 20, 40, 80, 100] : [10, 20, 40];
    const result = sweep(
      'floors',
      'floors (population fixed at 4000, 6 cars, 3 %)',
      floors.map((count) => ({ floors: count, cars: 6, ratePctPop5min: 3, durationS })),
      (point) => point.floors,
    );

    /* **Sub-linear in floors, in work done.** The mechanical claim: the kernel's work is per
       *event*, and at constant population and constant demand the number of arrivals, boardings
       and alightings does not change when the same people are spread over more levels — only the
       route projection gets longer. Measured, the event count is almost exactly flat (about
       1.04× over a 4× range) while the legs carried do not move at all. An event count that grew
       at least as fast as the floor count would mean the *simulation* had acquired per-floor work
       it did not have, which is the shape that makes a 100-floor building impractical. */
    expect(result.eventRatio).toBeLessThan(result.axisRatio);
    /* And it is not negative: a taller building does not do *less* work. Below 0.5 over a 4×
       range would mean the grid is measuring something other than what it says. */
    expect(result.eventRatio).toBeGreaterThan(0.5);
    /* The confound the module docstring designed out, asserted rather than assumed: the same
       people, redistributed. If this moved, the sweep would be measuring demand as well. */
    expect(result.legRatio).toBeGreaterThan(0.9);
    expect(result.legRatio).toBeLessThan(1.1);
  }, 900_000);

  it('scales with car count, at constant floors and constant demand', () => {
    const durationS = DEEP ? 3600 : 2400;
    const cars = DEEP ? [2, 4, 8, 16] : [2, 4, 8];
    const result = sweep(
      'cars',
      'cars (20 floors, population 4000, 3 %)',
      cars.map((count) => ({ floors: 20, cars: count, ratePctPop5min: 3, durationS })),
      (point) => point.cars,
    );

    /* **At worst linear in cars.** More cars means more car events — each one moves, opens and
       closes on its own — so growth is expected and is fine. Super-linear *event* growth is the
       alarm: it would mean the fleet had started generating work about itself, the shape a
       reconsider stage or an auction round can introduce without anyone noticing, because it is
       invisible at four cars and fatal at forty. Measured at about 1.66× over a 4× range. */
    expect(result.eventRatio).toBeLessThan(result.axisRatio);
    expect(result.eventRatio).toBeGreaterThan(1);
    /* Adding cars must not change who is carried — same population, same demand. */
    expect(result.legRatio).toBeGreaterThan(0.9);
    expect(result.legRatio).toBeLessThan(1.1);
  }, 900_000);

  it('scales with demand, at constant floors and constant cars', () => {
    const durationS = DEEP ? 3600 : 2400;
    const result = sweep(
      'demand',
      'demand (20 floors, 6 cars, population 4000)',
      [1, 2, 4, 8].map((rate) => ({ floors: 20, cars: 6, ratePctPop5min: rate, durationS })),
      (point) => point.ratePctPop5min,
    );

    /* ## The regressor that actually carries the mechanism
     *
     * The *arrival rate* is the knob an operator turns, but it is not the quantity the kernel
     * does work proportional to, and the two come apart exactly where this track cares: eight
     * times the rate produces about **seven** times the legs, because at the top of the sweep the
     * building cannot clear its queue inside the horizon and the extra demand is truncated rather
     * than served. Asserting "at least linear in the rate" would therefore fail for a reason that
     * is about the building rather than about the code.
     *
     * Both relationships below are between simulation outputs, so both hold exactly on any
     * machine under any load. */
    const legsVsRate = fitPowerLaw(
      result.measured.map((entry) => [entry.point.ratePctPop5min, entry.legs] as const),
    );
    const eventsVsLegs = fitPowerLaw(
      result.measured.map((entry) => [entry.legs, entry.events] as const),
    );
    console.log(
      `    ${formatFit('legs carried, regressed on arrival rate', legsVsRate)}\n` +
        `    ${formatFit('kernel events, regressed on legs carried', eventsVsLegs)}`,
    );

    /* Legs grow with the rate, very nearly proportionally — sub-linear only by the truncation
       above, and never super-linear, which would mean demand was being invented. */
    expect(legsVsRate.rSquared).toBeGreaterThan(0.95);
    expect(legsVsRate.exponent).toBeGreaterThan(0.7);
    expect(legsVsRate.exponent).toBeLessThan(1.2);

    /* And the kernel's work grows with the work there is to do, no faster than linearly in it.
       Super-linear here is the real alarm: it is what a per-passenger scan inside the
       per-passenger loop looks like, and it is invisible at 200 legs and fatal at 20 000. It
       lands near 0.66 — sublinear, because a busier run amortises the fixed per-stop cost (door
       cycle, route projection, dispatch pass) over more boarding passengers. */
    expect(eventsVsLegs.rSquared).toBeGreaterThan(0.9);
    expect(eventsVsLegs.exponent).toBeGreaterThan(0.4);
    expect(eventsVsLegs.exponent).toBeLessThan(1.2);
  }, 900_000);

  it('names the dominant term', () => {
    expect(axes.size).toBe(3);
    /* Ranked by **exponent**, because that is the range-normalised quantity: demand is swept over
       8× and the others over 4×, so comparing raw ratios would let the widest sweep win by
       construction.
       Ranked on the **event** exponent rather than the timed one, for the reason the module
       docstring gives: the ordering is the finding, and a finding that inverts because another
       build was running is not a finding. Both rankings are printed, and on this machine they
       agree — demand 0.62, cars 0.36, floors 0.03 on events, against 0.83 / 0.46 / 0.32 on
       seconds. The deep tier asserts that they still agree. */
    const rank = (of: (result: AxisResult) => PowerLawFit): readonly (readonly [string, AxisResult])[] =>
      [...axes.entries()].sort(([, a], [, b]) => of(b).exponent - of(a).exponent);
    const byEvents = rank((result) => result.eventFit);
    const bySeconds = rank((result) => result.fit);
    console.log(
      `\n[perf] dominant term:\n` +
        byEvents
          .map(
            ([axis, result]) =>
              `    ${axis.padEnd(8)} events exponent ${result.eventFit.exponent.toFixed(2).padStart(6)} ` +
              `(R² ${result.eventFit.rSquared.toFixed(3)}), ` +
              `${result.axisRatio.toFixed(0)}× axis → ${result.eventRatio.toFixed(2)}× events` +
              `   [seconds exponent ${result.fit.exponent.toFixed(2)}, ${result.costRatio.toFixed(2)}× cost]`,
          )
          .join('\n') +
        `\n    → ${(byEvents[0] as readonly [string, AxisResult])[0]} dominates (on events); ` +
        `${(bySeconds[0] as readonly [string, AxisResult])[0]} dominates (on the clock, not asserted here)`,
    );
    for (const [, result] of byEvents) expect(Number.isFinite(result.eventFit.exponent)).toBe(true);
    /* The finding, asserted rather than only printed: demand is the dominant term. If a change
       ever made floors or cars dominate, that is a structural change to the cost model and this
       test should be the thing that says so. */
    expect((byEvents[0] as readonly [string, AxisResult])[0]).toBe('demand');
  });
});

/* -------------------------------------------------------------------------- *
 * The wall clock — opt-in, because a busy machine must not be able to fail it
 * -------------------------------------------------------------------------- */

/**
 * The timed gates, moved here rather than loosened again.
 *
 * These are the assertions that flaked: an `R²` on seconds-against-rate that was 0.9, then 0.75,
 * and still produced `expected 0.887 to be greater than 0.9` under concurrent load while passing
 * 5/5 in isolation. Nothing about them is wrong — they are the only guard in the repository
 * against a change that makes each unit of work more expensive without changing how much work
 * there is. They simply cannot be trusted on a contended machine, and a gate nobody can trust is
 * a gate everybody overrides.
 *
 * They read the grid the always-on sweeps already ran, so enabling them costs nothing beyond the
 * assertions themselves. `ELEVATOR_SIM_DEEP=1` also widens that grid, which is the point: a
 * decade of floors and a quiet box is where a timing claim is worth making.
 */
describe.skipIf(!DEEP)('the wall clock, on a machine that is expected to be quiet', () => {
  it('is sub-linear in floors and does not run backwards', () => {
    const result = recorded('floors');
    expect(result.costRatio).toBeLessThan(result.axisRatio);
    expect(result.costRatio).toBeGreaterThan(0.5);
  });

  it('is at worst linear in cars', () => {
    /* Quadratic is the alarm: a car loop nested inside a car loop. The bound is on **seconds**
       rather than events because that is the shape this catches and the always-on tier cannot —
       pricing every car against every car adds no kernel events at all. */
    const result = recorded('cars');
    expect(result.costRatio).toBeLessThan(result.axisRatio ** 1.5);
    expect(result.costRatio).toBeGreaterThan(0.5);
  });

  it('fits demand as a power law, on the rate and on the legs processed', () => {
    const result = recorded('demand');
    expect(result.fit.rSquared).toBeGreaterThan(0.75);
    expect(result.fit.exponent).toBeGreaterThan(0.5);
    expect(result.fit.exponent).toBeLessThan(2);

    const perLeg = fitPowerLaw(result.measured.map((entry) => [entry.legs, entry.seconds] as const));
    console.log(`    ${formatFit('seconds, regressed on legs processed', perLeg)}`);
    expect(perLeg.rSquared).toBeGreaterThan(0.9);
    expect(perLeg.exponent).toBeGreaterThan(0.5);
    expect(perLeg.exponent).toBeLessThan(1.8);
  });

  it('agrees with the deterministic ranking about which term dominates', () => {
    /* The cross-check the always-on tier cannot make. If the two orderings ever disagreed, the
       event ranking is the one to believe — but the disagreement itself would be the finding,
       because it would mean cost per event had become axis-dependent. */
    const ranked = [...axes.entries()].sort(([, a], [, b]) => b.fit.exponent - a.fit.exponent);
    expect((ranked[0] as [string, AxisResult])[0]).toBe('demand');
  });
});

/* -------------------------------------------------------------------------- *
 * The tall building
 * -------------------------------------------------------------------------- */

describe('a 100-floor building', () => {
  it('builds through the real schema and runs to completion', () => {
    const point: Point = { floors: 100, cars: 8, ratePctPop5min: 3, durationS: 2400 };
    const simConfig = configFor(point, 100100);
    expect(simConfig.building.floors).toHaveLength(101);
    expect(simConfig.building.banks[0]?.cars).toHaveLength(8);

    const measured = measure(point, 1);
    const result = runSimulation(simConfig);
    console.log(
      `[perf] 100 floors, 8 cars, 2400 s: ${(measured.seconds * 1000).toFixed(1)} ms, ` +
        `${String(result.trace.passengerCount)} journeys, ${String(result.events)} events, ` +
        `status ${result.status}, ${String(result.undelivered.length)} undelivered`,
    );

    /* Mechanical, not temporal: a hundred-storey shaft must actually be traversed. The tallest
       reachable floor has to appear as somebody's destination, or the run is a ten-floor run
       wearing a hundred-floor config. */
    const destinations = new Set(
      result.trace.passengers.map((passenger) => passenger.finalDestinationFloorId),
    );
    expect(destinations.size).toBeGreaterThan(20);
    expect(result.conservation.balanced).toBe(true);
  }, 900_000);
});
