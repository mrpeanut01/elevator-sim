/**
 * The energy axis, proven live rather than declared live.
 *
 * Three suites, in increasing order of how much they would have caught:
 *
 * 1. **The arithmetic**, against the formula in `core`'s own `TravelSample` docstring, including the
 *    sign-free convention and the balance point where the work is zero.
 * 2. **The accounting**, on a real run: sample count against the fleet's own `departures`, sample
 *    metres against the fleet's own odometers, and the count of samples outside the record's own
 *    window — which is the check that the recorder's deliberate refusal to advance `lastEventAt`
 *    costs nothing.
 * 3. **The separation**, on two configurations whose energy must differ and in which direction.
 */

import { describe, expect, it, beforeAll } from 'vitest';

import {
  COUNTERWEIGHT_BALANCE_RATIO,
  STANDARD_GRAVITY_MPS2,
  Simulation,
  fullRunWindow,
  outOfBalanceWorkJ,
  parseRunRecord,
  serializeRunRecord,
  summarizeRun,
  windowContains,
  type LoadedConfig,
  type RunRecord,
} from '@elevator-sim/core';

import { loadResources } from '../validation/harness.js';

import {
  LIVENESS_STRATEGIES,
  atStrategy,
  measureEnergyLiveness,
  strategyArmId,
  type EnergyLivenessStudy,
} from './energyLiveness.js';

/* -------------------------------------------------------------------------- *
 * 1. The arithmetic
 * -------------------------------------------------------------------------- */

describe('the out-of-balance work formula', () => {
  it('is zero exactly at the counterweight balance point, and symmetric about it', () => {
    const ratedLoadKg = 1000;
    const balanced = COUNTERWEIGHT_BALANCE_RATIO * ratedLoadKg;
    const base = { distanceM: 10, direction: 'up' as const, ratedLoadKg };

    expect(outOfBalanceWorkJ({ ...base, loadKg: balanced })).toBe(0);

    // Symmetric: a car 200 kg under the balance point costs exactly what one 200 kg over it does.
    // This is the property that makes the axis a statement about how far cars drove out of balance
    // rather than about a particular machine's counterweight order.
    expect(outOfBalanceWorkJ({ ...base, loadKg: balanced - 200 })).toBeCloseTo(
      outOfBalanceWorkJ({ ...base, loadKg: balanced + 200 }),
      9,
    );
    expect(outOfBalanceWorkJ({ ...base, loadKg: balanced + 200 })).toBeCloseTo(
      200 * STANDARD_GRAVITY_MPS2 * 10,
      9,
    );
  });

  it('charges both directions — the non-regenerative convention, stated and enforced', () => {
    // ISO 25745-2 measures a non-regenerative unit this way: the overhauling direction is
    // dissipated in a brake resistor rather than returned. A regenerative drive's real figure is
    // bounded above by this one, which is why the conservative choice is the defensible one.
    const up = { distanceM: 12, direction: 'up' as const, loadKg: 0, ratedLoadKg: 1600 };
    const down = { ...up, direction: 'down' as const };
    expect(outOfBalanceWorkJ(down)).toBe(outOfBalanceWorkJ(up));
    expect(outOfBalanceWorkJ(up)).toBeGreaterThan(0);
  });

  it('prices an empty car exactly as it prices a full one — the deadheading the axis exists for', () => {
    const ratedLoadKg = 1600;
    const empty = { distanceM: 20, direction: 'up' as const, loadKg: 0, ratedLoadKg };
    const full = { ...empty, loadKg: ratedLoadKg };
    expect(outOfBalanceWorkJ(empty)).toBeCloseTo(outOfBalanceWorkJ(full), 9);
  });
});

/* -------------------------------------------------------------------------- *
 * 2. The accounting, on a real run
 * -------------------------------------------------------------------------- */

describe('every completed move reaches the record — the seam, counted not read', () => {
  let config: LoadedConfig;
  let record: RunRecord;
  let fleetDepartures: number;
  let fleetDistanceM: number;

  beforeAll(async () => {
    config = await loadResources();
    const base = config.dispatcherProfilesById.get('predictive-balanced');
    if (base === undefined) throw new Error('data/ has no profile "predictive-balanced"');
    // `new Simulation(...)` rather than `runSimulation(...)`, for the one reason this suite exists:
    // `SimulationResult` carries the record and not the fleet, and the whole point of the
    // accounting below is to check the record against a counter **nothing in `metrics/` touches**.
    // `simulation.building.cars` is that counter.
    const simulation = new Simulation({
      building: config.buildingsById.get('garden-apartments') as never,
      dispatcherProfile: atStrategy(base, 'lobby'),
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20_260_728n,
      durationS: 3600,
      demandTemplate: 'rise-and-fall',
      demand: { arrivalRatePctPop5min: 2, peakWindowS: 300 },
    } as never);
    record = simulation.run().record;
    const cars = simulation.building.cars;
    fleetDepartures = cars.reduce((total, car) => total + car.departures, 0);
    fleetDistanceM = cars.reduce((total, car) => total + car.distanceTravelledM, 0);
  });

  it('records one sample per commanded move, and the fleet odometers agree to the last double', () => {
    const samples = record.travelSamples ?? [];
    expect(samples.length, 'the run moved no car at all; this proves nothing').toBeGreaterThan(0);
    // The check a "fires on most arrivals" bug fails and a unit test cannot: the count and the
    // summed distance both come from the cars' own counters, which nothing in metrics/ touches.
    expect(samples.length).toBe(fleetDepartures);
    expect(samples.reduce((total, sample) => total + sample.distanceM, 0)).toBeCloseTo(
      fleetDistanceM,
      9,
    );
  });

  it('leaves no sample outside the record it emitted — the price of not advancing lastEventAt', () => {
    // `MetricsRecorder.sampleTravel` deliberately does not call `#observe`, because `Simulation`
    // derives the run horizon from `lastEventAt` and an instrument must not lengthen the window it
    // measures. That is only free if no sample lands past `endedAt`, which is asserted rather than
    // argued: a car arrival is always followed within the same stop by an alighting that IS
    // observed.
    const outside = (record.travelSamples ?? []).filter(
      (sample) => sample.at < record.startedAt || sample.at >= record.endedAt,
    );
    expect(outside.length, `${outside.length} travel samples fell outside [startedAt, endedAt)`).toBe(0);
  });

  it('carries empty-car travel — what a proxy reconstructed from passenger records cannot see', () => {
    const empty = (record.travelSamples ?? []).filter((sample) => sample.loadKg === 0);
    expect(
      empty.length,
      'no empty-car move was recorded, so the proxy could not price the deadheading stage 7 spends',
    ).toBeGreaterThan(0);
  });

  it('survives the record round-trip, work and all', () => {
    const window = fullRunWindow(record);
    const before = summarizeRun(record, { window });
    const after = summarizeRun(parseRunRecord(serializeRunRecord(record)), { window });
    expect(after.energy).toEqual(before.energy);
    expect(before.energy.measured).toBe(true);
    expect(before.energy.workKJ).toBeGreaterThan(0);
  });

  it('sums exactly the samples inside the reporting window, and no others', () => {
    // The windowing claim, checked against a hand sum rather than against itself: a peak-5min
    // window on this record must charge strictly fewer joules than the full run, and exactly the
    // joules of the samples inside it.
    const window = fullRunWindow(record);
    const inside = (record.travelSamples ?? []).filter((sample) => windowContains(window, sample.at));
    const summary = summarizeRun(record, { window });
    expect(summary.energy.workKJ).toBeCloseTo(
      inside.reduce((total, sample) => total + sample.workJ, 0) / 1000,
      9,
    );
    expect(summary.energy.starts).toBe(inside.length);
  });

  it('reports NaN and measured:false for a record that carries no travel at all', () => {
    // Not zero. "The cars did not move" and "nobody wrote down how far the cars moved" are
    // different facts, and zeroing the second makes every arm tie on energy and silently restores
    // a two-axis front under a three-axis name.
    const { travelSamples: _dropped, ...withoutTravel } = record;
    const summary = summarizeRun(withoutTravel as RunRecord, { window: fullRunWindow(record) });
    expect(summary.energy.measured).toBe(false);
    expect(Number.isNaN(summary.energy.workKJ)).toBe(true);
    expect(Number.isNaN(summary.energy.distanceM)).toBe(true);
    expect(summary.energy.workKJ).not.toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * 3. The separation
 * -------------------------------------------------------------------------- */

describe('the axis separates two configurations whose energy must differ', () => {
  let study: EnergyLivenessStudy;

  beforeAll(async () => {
    study = await measureEnergyLiveness();
  });

  it('measures energy on every replication of both arms', () => {
    expect(study.arms.map((arm) => arm.armId)).toEqual(
      LIVENESS_STRATEGIES.map((strategy) => strategyArmId(strategy)),
    );
    for (const arm of study.arms) {
      expect(arm.replications).toBe(study.replications);
      expect(
        arm.unmeasuredReplications,
        `${arm.armId} produced ${arm.unmeasuredReplications} replications with no travel record`,
      ).toBe(0);
      expect(arm.meanWorkKJ).toBeGreaterThan(0);
      expect(arm.meanStarts).toBeGreaterThan(0);
    }
  });

  it('costs strictly more energy to park at the lobby than to stay put', () => {
    // The known answer, in advance: `lobby` returns every idle car to the terminal and `stay` never
    // moves one, so more metres are driven and the extra metres are driven empty — the most
    // expensive kind under a counterweight balanced at half load. An instrument that cannot see
    // this is not measuring movement, whatever its unit test says.
    expect(study.separates, 'the two arms produced bit-identical energy series').toBe(true);
    expect(study.workDifferenceKJ).toBeGreaterThan(0);

    const [stay, lobby] = study.arms;
    expect(lobby?.meanDistanceM).toBeGreaterThan(stay?.meanDistanceM ?? Number.POSITIVE_INFINITY);
    expect(lobby?.meanStarts).toBeGreaterThan(stay?.meanStarts ?? Number.POSITIVE_INFINITY);
  });
});
