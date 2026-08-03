/**
 * **The two traffic-variance controls reach a shipped run, and each one moves it on the legs.**
 * Step 3 of the building-behaviour program (`docs/14` §§ 2.1–2.2).
 *
 * `docs/14` § 5 criterion 2 is the bar every knob here is held to — *move the control and require
 * the run to change, compared on the legs rather than on a window statistic* — and criterion 1 is
 * the one that outranks it: with the fields absent the run must be the run that was always there.
 * Both are asserted against `runSimulation`, not against the generator, because a curve that is
 * schema-valid, unit-tested and consulted by no shipped path is the defect this repository has
 * shipped eleven times.
 *
 * ## What each control is required to prove
 *
 * **Group size (§ 2.2).** The interesting claim is not *"a bigger mean changes the run"* — that was
 * already true and `sim/trafficModelSeam.test.ts` measures it. It is that **shape** is separable
 * from **rate**: `batchesPerSecond = passengerRate / meanBatchSize`, so two curves with the same
 * mean produce the same batch arrival process, and any difference in the run is the *shape* of the
 * groups and nothing else. That is the split assertion below — instants byte-identical, sizes and
 * legs different — and it is what makes "this hotel arrives in fours" a question this simulator can
 * answer rather than a demand level in disguise.
 *
 * **Body mass (§ 2.1).** Mass is drawn in trace order from its own stream, so a mass change is the
 * mirror image: the crowd that turns up is *the same crowd* — same instants, same group sizes, same
 * routes — and only what the cars can do with it changes. The mechanism is asserted rather than
 * asserted-about: `#boardFrom` boards while the car is below **design load in kilograms**, and
 * there is no head-count clause anywhere in the loop, so a heavier population reaches the same
 * ceiling with fewer people in the car. That is read off the run's own `loadSamples`, which count
 * occupants and mass at the same instant.
 *
 * ## Draw discipline
 *
 * `DECISIONS.md` § D203 records that `drawGeometricBatchSize` consumes exactly one draw per call
 * for every mean, deliberately, and that a sampler whose draw count depends on its parameters
 * desynchronizes common random numbers. Every sampler added here keeps that property — asserted
 * directly in `poissonBatch.test.ts` — which is why the new families are available under `v1` as
 * well as `v2` rather than gated behind the flag.
 */

import { describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { drawPassengerMass } from '../model/passenger.js';
import { StreamSet } from '../random/index.js';
import { load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';
import type { SimulationDemandOptions, SimulationResult } from '../sim/types.js';

import { generateTrace, planDemand } from './generator.js';

const SEED = 20_260_731;
const BUILDING_ID = 'midtown-office';
const TIMEOUT_MS = 300_000;

/** Office Standard's own group-size curve, as `data/traffic-profiles.json` authors it. */
const OFFICE_STANDARD_CURVE = { distribution: 'geometric', mean: 1.4 } as const;

/**
 * The shipped body-mass block, restated as an override with the upper bound made explicit.
 *
 * `data/traffic-profiles.json` declares no `maxKg`, which `drawMass` reads as `+Infinity`; the
 * override type requires both bounds (§ 2.1: *bounds are required, not optional*), so the
 * equivalent override names one high enough never to bind. If these two produced different runs,
 * the override would be applying something the data does not say.
 */
const SHIPPED_MASS = {
  distribution: 'normal',
  meanKg: 75,
  stdDevKg: 15,
  minKg: 20,
  maxKg: 1e9,
} as const;

/** A population half as heavy again. Same spread, same bounds arithmetic, different people. */
const HEAVY_MASS = {
  distribution: 'normal',
  meanKg: 110,
  stdDevKg: 15,
  minKg: 40,
  maxKg: 200,
} as const;

/** Every batch instant in the run, in trace order. */
const instantsOf = (result: SimulationResult): string =>
  result.trace.arrivals.map((arrival) => arrival.timeS.toFixed(9)).join('|');

/** Every batch's size — what `drawBatchSize` alone decides. */
const sizesOf = (result: SimulationResult): string =>
  result.trace.arrivals.map((arrival) => String(arrival.passengers.length)).join(',');

/** The planned legs: who travels where, and when they start waiting. */
const plannedLegsOf = (result: SimulationResult): string =>
  result.trace.passengers
    .map((p) => `${p.originFloorId}>${p.finalDestinationFloorId}@${p.arrivalTimeS.toFixed(3)}`)
    .join('|');

/** The **served** legs: which car took each leg, and when it boarded and alighted. */
const servedLegsOf = (result: SimulationResult): string =>
  result.record.passengers
    .map(
      (p) =>
        `${p.passengerId}:${p.carId ?? '-'}@${p.boardedAt?.toFixed(3) ?? '-'}>${p.alightedAt?.toFixed(3) ?? '-'}`,
    )
    .join('|');

/** The masses the trace drew, to nine places. */
const massesOf = (result: SimulationResult): string =>
  result.trace.passengers.map((p) => p.massKg.toFixed(9)).join(',');

/** The most people any car held at once, read off the load cell rather than inferred. */
const peakOccupants = (result: SimulationResult): number =>
  result.record.loadSamples.reduce((most, sample) => Math.max(most, sample.occupants), 0);

/** The heaviest load any car reported, as a fraction of rated. */
const peakLoadFactor = (result: SimulationResult): number =>
  result.record.loadSamples.reduce((most, sample) => Math.max(most, sample.loadFactor), 0);

describe('the traffic-variance controls reach a run', () => {
  const run = async (
    options: { demand?: SimulationDemandOptions; trafficModel?: 'v1' | 'v2' } = {},
  ): Promise<SimulationResult> => {
    const config: LoadedConfig = await load();
    const building = config.buildingsById.get(BUILDING_ID);
    const dispatcherProfile = config.dispatcherProfilesById.get('eta');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
    return runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      ...(options.trafficModel === undefined ? {} : { trafficModel: options.trafficModel }),
      ...(options.demand === undefined ? {} : { demand: options.demand }),
    });
  };

  /* ---------------------------------------------------------------------- *
   * Criterion 1 — byte-identity when unused
   * ---------------------------------------------------------------------- */

  /**
   * The blocking criterion, at the seam rather than at the digest.
   *
   * `transportIdentity.test.ts` holds the whole `SimulationResult` to a digest and would catch a
   * key appearing on the default path; this catches the other half — a *value* appearing there,
   * which a digest over the default run cannot see because the default run is the one it pins.
   * Both overrides are set to the configuration the data already declares, so a resolver that
   * quietly substituted a default of its own would show up here as a moved leg.
   */
  it('changes nothing when it is absent, and nothing when it restates the data', async () => {
    const absent = await run();
    expect(plannedLegsOf(await run({ demand: {} }))).toBe(plannedLegsOf(absent));
    expect(
      plannedLegsOf(await run({ demand: { batchSize: OFFICE_STANDARD_CURVE } })),
      'the profile’s own curve, supplied explicitly',
    ).toBe(plannedLegsOf(absent));
    expect(
      massesOf(await run({ demand: { passengerMass: SHIPPED_MASS } })),
      'the shipped mass block, supplied explicitly',
    ).toBe(massesOf(absent));
    expect(servedLegsOf(await run({ demand: { passengerMass: SHIPPED_MASS } }))).toBe(
      servedLegsOf(absent),
    );
  }, TIMEOUT_MS);

  /**
   * **The default path resolves to the reference data itself, key for key — and this is asserted
   * rather than left to the digests, because the digests measurably cannot see all of it.**
   *
   * Measured while mutation-testing this change: giving the unused path an invented
   * `maxKg: 140` — a bound the shipped `normal(75, 15)` clears about seven times in a million —
   * passed **all 53** tests in the two identity files and this one. The same mutation at
   * `maxKg: 100` failed ten of them. So a digest over a default run catches an invented bound only
   * once it binds *in that run*, which is the worst possible detector: silent until the first
   * heavier passenger, then a pin that is correct on one tree and wrong on another. That is
   * `DECISIONS.md` § D196/§ D201's failure exactly.
   *
   * It is also the reason `data/traffic-profiles.json` still declares no `maxKg` and was not
   * touched by this step. The truncation bounds § 2.1 requires are required on the **override**,
   * where a caller is asking for a different population anyway; adding one to the reference block
   * would clamp a tail nobody has measured and would move published figures on a schedule set by
   * chance.
   */
  it('resolves the default body-mass block to the reference data, bound for bound', async () => {
    const config = await load();
    const building = config.buildingsById.get(BUILDING_ID);
    if (building === undefined) throw new Error('fixtures');
    const plan = planDemand({ building, profiles: config.trafficProfiles });
    expect(plan.passengerMass).toBe(config.trafficProfiles.passengerMass);
    expect(plan.passengerMass.maxKg).toBeUndefined();
  }, TIMEOUT_MS);

  /**
   * **The other half of the same hole: what an absent `maxKg` is allowed to mean.**
   *
   * The guard above pins the resolved *block*. It does not pin what the samplers do with a block
   * whose upper bound is absent — and adversarial review showed that mattered: moving the invented
   * bound one line down, from `resolvePassengerMass` into `drawMass`'s
   * `config.maxKg ?? Number.POSITIVE_INFINITY`, passed all 686 tests in `traffic`, `config` and
   * `model`. The identified hole had been narrowed, not closed.
   *
   * Closed here, and deliberately **not** by sampling the shipped 75/15 block and hoping for a
   * heavy passenger — `normal(75, 15)` clears 140 kg about seven times in a million, so that test
   * would be a coin toss dressed as an assertion. Instead the distribution is placed where any
   * finite invented bound must show: a population at 5 000 kg with a spread of 1. Nobody weighs
   * that, which is the point — it is a probe of the *semantics of an absent bound*, not of a
   * plausible building. Under `?? Number.POSITIVE_INFINITY` every draw is ~5 000; under any
   * invented ceiling every draw is that ceiling.
   *
   * Both samplers are checked, because the clamping rule is deliberately duplicated across them.
   */
  it('treats an absent upper bound as unbounded, in both samplers', async () => {
    const UNBOUNDED = { distribution: 'normal', meanKg: 5000, stdDevKg: 1, minKg: 1 } as const;
    const config = await load();
    const building = config.buildingsById.get(BUILDING_ID);
    if (building === undefined) throw new Error('fixtures');

    // `traffic/generator.ts`'s `drawMass`, reached the only way an absent `maxKg` can be: through
    // the profiles block, since the run-level override requires both bounds.
    const trace = generateTrace({
      building,
      profiles: { ...config.trafficProfiles, passengerMass: UNBOUNDED },
      streams: new StreamSet(SEED),
    });
    expect(trace.passengers.length).toBeGreaterThan(0);
    for (const passenger of trace.passengers) {
      expect(passenger.massKg).toBeGreaterThan(4900);
    }

    // `model/passenger.ts`'s `drawPassengerMass`, which carries the same `?? POSITIVE_INFINITY`.
    const stream = new StreamSet(SEED).passengerMass;
    for (let i = 0; i < 200; i += 1) {
      expect(drawPassengerMass(stream, UNBOUNDED)).toBeGreaterThan(4900);
    }
  }, TIMEOUT_MS);

  /* ---------------------------------------------------------------------- *
   * § 2.2 — the group-size curve
   * ---------------------------------------------------------------------- */

  /**
   * **Shape, separated from rate.** The two arms have the same mean group size — 1.4, by
   * construction: `0.6 · 1 + 0.4 · 2` — so `batchesPerSecond` is the same number and the batch
   * arrival process is untouched. What differs is the *distribution* of group sizes: the geometric
   * has an unbounded tail, the authored vector has nothing above two.
   *
   * Split deliberately, in the shape `viz`'s `'the building editor is not decoration'` block uses:
   * one thing required to be unchanged, another required to have moved. An implementation that
   * accepted the vector and drew from the geometric anyway passes the first clause and fails the
   * second; one that changed the arrival rate fails the first.
   *
   * Asserted under both draw orderings because it must hold under both: the new samplers consume
   * exactly one draw per call, so the group-size draws sit at the same positions in whichever
   * stream they come from.
   */
  it('separates the shape of the groups from the rate they arrive at', async () => {
    for (const trafficModel of ['v1', 'v2'] as const) {
      const geometric = await run({
        trafficModel,
        demand: { batchSize: { distribution: 'geometric', mean: 1.4 } },
      });
      const authored = await run({
        trafficModel,
        demand: { batchSize: { distribution: 'explicit', weights: [0.6, 0.4] } },
      });

      expect(instantsOf(authored), `${trafficModel}: the batch rate is a function of the mean alone`)
        .toBe(instantsOf(geometric));
      expect(sizesOf(authored), `${trafficModel}: the groups`).not.toBe(sizesOf(geometric));
      expect(plannedLegsOf(authored), `${trafficModel}: the legs`).not.toBe(
        plannedLegsOf(geometric),
      );
      // Nothing above two can be drawn from a two-element vector, and the geometric's tail is why
      // the two are different buildings at the same headcount.
      const authoredSizes = new Set(authored.trace.arrivals.map((a) => a.passengers.length));
      expect(Math.max(...authoredSizes)).toBe(2);
      expect(
        Math.max(...geometric.trace.arrivals.map((a) => a.passengers.length)),
      ).toBeGreaterThan(2);
    }
  }, TIMEOUT_MS);

  /**
   * **"This hotel arrives in fours."** The authored case § 2.2 says is the one worth having, and
   * the one no mean can express: every group is exactly four, at the same passenger rate.
   *
   * The rate coupling is the trap named in the contract — a family that failed to expose a mean
   * would silently change total demand — so the expected passenger count is derived from the
   * *plan's* own analytic expectation rather than from the run, and the two arms are required to
   * agree on it while disagreeing on everything else.
   */
  it('honours an authored weight vector, and derives the batch rate from it', async () => {
    const base = await run();
    const fours = await run({
      demand: { batchSize: { distribution: 'explicit', weights: [0, 0, 0, 1] } },
    });

    expect(new Set(fours.trace.arrivals.map((a) => a.passengers.length))).toEqual(new Set([4]));

    // **The rate coupling, measured on the sampled trace rather than on the plan.** Total
    // *passenger* demand is held fixed: four times the group size, so `passengerRate / meanBatchSize`
    // must produce a quarter as many batches. A source that drew from the new curve but kept the
    // profile's 1.4 in its rate would deliver nearly three times the headcount and every group would
    // still look exactly as authored — which is the way this feature silently invalidates a study.
    // Exact form first: **every** source's rate divides by the override's derived mean, not just
    // the ones that happen to dominate the building. Midtown Office's twenty sources are one
    // entrance and nineteen residents, and the entrance carries most of the demand — so a resident
    // source left on the profile's own mean moves the totals below by only a few percent and would
    // be an easy thing to miss statistically. It cannot be missed here.
    expect(new Set(fours.trace.sources.map((source) => source.meanBatchSize))).toEqual(new Set([4]));
    expect(new Set(base.trace.sources.map((source) => source.meanBatchSize))).toEqual(new Set([1.4]));

    /*
     * **And the rate is checked against the mean, not merely beside it.**
     *
     * The assertion above reads `meanBatchSize`, which is what a source *reports*.
     * `peakBatchesPerSecond` is what it is actually sampled at, and the two used to be two
     * expressions — so a rate left on the profile's own mean passed the reported-mean check
     * completely and survived on a 1.7 % margin in the ratio bands below. Adversarial review
     * found that; this is the assertion that closes it.
     *
     * `batchesPerSecond` is defined as `passengerRate / E[B]`, so `batches · E[B] === passengers`
     * is an identity every source must satisfy whatever curve it is running. A rate computed from
     * a different mean than the one reported breaks it by exactly the ratio of the two.
     */
    for (const result of [base, fours]) {
      for (const source of result.trace.sources) {
        expect(
          source.peakBatchesPerSecond * source.meanBatchSize,
          `${source.id}: batch rate must divide the passenger rate by the mean it reports`,
        ).toBeCloseTo(source.peakPassengersPerSecond, 12);
      }
    }

    expect(fours.trace.expectedPassengers).toBeCloseTo(base.trace.expectedPassengers, 6);
    expect(fours.trace.passengerCount / base.trace.passengerCount).toBeGreaterThan(0.85);
    expect(fours.trace.passengerCount / base.trace.passengerCount).toBeLessThan(1.15);
    // office-standard's own mean is 1.4, so the batch count falls by 1.4/4.
    const batchRatio = fours.trace.arrivals.length / base.trace.arrivals.length;
    expect(batchRatio).toBeGreaterThan((1.4 / 4) * 0.85);
    expect(batchRatio).toBeLessThan((1.4 / 4) * 1.15);

    expect(servedLegsOf(fours)).not.toBe(servedLegsOf(base));
  }, TIMEOUT_MS);

  /* ---------------------------------------------------------------------- *
   * § 2.1 — body mass
   * ---------------------------------------------------------------------- */

  /**
   * **A heavier population fills its cars by weight, and the crowd is the same crowd.**
   *
   * The split assertion in its strongest form here, because mass is drawn from its own stream in
   * final trace order: the arrival instants, the group sizes and the planned legs are required to
   * be *byte-identical* — nobody arrived differently — while the served legs are required to have
   * moved.
   *
   * The mechanism is then named and measured. `Simulation.#boardFrom` boards while
   * `loadSensor.massKg < designLoadKg` and applies **no head-count clause at all**, so the ceiling
   * a car hits is a mass and the number of people that reaches it falls as the population gets
   * heavier.
   *
   * An earlier version of this docstring added *"`capacityPersons` — the count axis — does not
   * move"*. Nothing below asserted it, and adversarial review was right to call it: the cars are
   * the same `ResolvedCar` objects in both arms, so asserting it would have been true by identity
   * and worth nothing. The claim is dropped rather than dressed up. What **is** measured is the
   * pair below — peak occupants down, and both arms still crossing the design-load line — which
   * is the whole of what "it binds on mass, not on headcount" can be shown to mean here.
   */
  it('makes a heavier population fill cars by weight, without changing who turned up', async () => {
    const light = await run();
    const heavy = await run({ demand: { passengerMass: HEAVY_MASS } });

    // Unchanged: the crowd.
    expect(instantsOf(heavy)).toBe(instantsOf(light));
    expect(sizesOf(heavy)).toBe(sizesOf(light));
    expect(plannedLegsOf(heavy)).toBe(plannedLegsOf(light));
    // Changed: the masses, and therefore the service.
    expect(massesOf(heavy)).not.toBe(massesOf(light));
    expect(servedLegsOf(heavy)).not.toBe(servedLegsOf(light));

    // The mechanism, on the load cell's own samples.
    expect(peakOccupants(heavy)).toBeLessThan(peakOccupants(light));

    /*
     * Both arms cross the same design-load **line** — 0.8 of rated — which is the rule that did
     * not move. They do **not** land on the same load factor, and an earlier comment here said
     * they did: measured, `light` peaks at 0.877 and `heavy` at 0.919.
     *
     * The gap is not noise, it is the boarding rule. `#boardFrom` stops *after* somebody steps in
     * — its own docstring calls crossing by one person deliberate, because that is what a real car
     * does — so the overshoot past 0.8 is the mass of whoever boarded last. A heavier population
     * overshoots further, necessarily. Asserted in that direction rather than pinned to the two
     * measured numbers, which would be a pin on this seed rather than on the mechanism.
     */
    expect(peakLoadFactor(heavy)).toBeGreaterThan(0.8);
    expect(peakLoadFactor(light)).toBeGreaterThan(0.8);
    expect(peakLoadFactor(heavy)).toBeGreaterThan(peakLoadFactor(light));
  }, TIMEOUT_MS);

  /**
   * The family is read, not just the moments.
   *
   * A lognormal population with the same mean and standard deviation as a normal one is a
   * different population — right-skewed, strictly positive — and an implementation that stored the
   * family and sampled a normal anyway would pass every moment-based check. The masses are
   * required to differ, and the legs with them.
   */
  it('draws a different population under lognormal than under normal', async () => {
    const normal = await run({ demand: { passengerMass: { ...HEAVY_MASS } } });
    const lognormal = await run({
      demand: { passengerMass: { ...HEAVY_MASS, distribution: 'lognormal' } },
    });

    expect(massesOf(lognormal)).not.toBe(massesOf(normal));
    expect(servedLegsOf(lognormal)).not.toBe(servedLegsOf(normal));
    // Truncation is required, and it is honoured: no passenger sits outside the declared bounds.
    for (const passenger of lognormal.trace.passengers) {
      expect(passenger.massKg).toBeGreaterThanOrEqual(HEAVY_MASS.minKg);
      expect(passenger.massKg).toBeLessThanOrEqual(HEAVY_MASS.maxKg);
    }
  }, TIMEOUT_MS);

  /**
   * **The duplicated sampler cannot drift into two different populations.**
   *
   * `traffic/generator.ts` mirrors `model/passenger.ts`'s `drawPassengerMass` rather than importing
   * it, deliberately — the generator's own docstring gives the reason, and it is a good one. What a
   * deliberate duplication needs is a test that fails when the two diverge, or the second copy of a
   * clamping rule is just a place for a bug to hide.
   *
   * Asserted at the sequence level rather than clause by clause: the trace's masses, in trace
   * order, must be exactly what `drawPassengerMass` produces from a fresh `passengerMass` stream at
   * the same seed. That covers the family, both moments, both truncations and — because the whole
   * sequence has to line up — the draw count.
   */
  it('draws the same masses the model’s own sampler would, for both families', async () => {
    for (const distribution of ['normal', 'lognormal'] as const) {
      const result = await run({ demand: { passengerMass: { ...HEAVY_MASS, distribution } } });
      const stream = new StreamSet(SEED).passengerMass;
      const mirrored = result.trace.passengers.map(() =>
        drawPassengerMass(stream, { ...HEAVY_MASS, distribution }),
      );
      expect(result.trace.passengers.map((p) => p.massKg), distribution).toEqual(mirrored);
    }
  }, TIMEOUT_MS);
});
