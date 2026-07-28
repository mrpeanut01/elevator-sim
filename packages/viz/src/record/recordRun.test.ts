/**
 * What a recording is, and — the load-bearing part — what recording one costs.
 *
 * The instrumentation in `instrument.ts` wraps five methods on every car. That is only
 * acceptable if it demonstrably changes nothing, so the first suite here runs the *same*
 * configuration twice, once through `runSimulation` (untouched) and once through `recordRun`
 * (instrumented), and requires the two `RunRecord`s to be identical. If a wrapper ever moved a
 * decision, consumed a random draw or shifted a timestamp, that comparison fails — which is
 * stronger than any amount of reading the wrappers.
 *
 * ## The start-position guard, and why it is here rather than in the frame producer
 *
 * `VizShaft.startFloorId` / `startHeightM` are where a car is drawn for every instant before its
 * first commanded move. They were read from the live `Car` objects **after** `simulation.run()`
 * returned, so a recording described every car at its *final* position and the viewer parked it
 * there — 77 m out on Midtown Office's `main-A`, whose cars start in the basement. Every other
 * check in this package passed: the frame was still a pure function of the recording, so it
 * still replayed identically. **"Replays identically" is strictly weaker than "renders
 * correctly"**, and the guard below is the difference.
 *
 * It is stated against the motions rather than against the `Car`: `motions[0].fromHeightM` is
 * where the kernel says the car was when it first moved, so a start that disagrees with it is
 * wrong by the run's own account and needs no second source of truth. It runs on **every shipped
 * building**, because the one building the suite used to pin — Garden Apartments — is the one
 * whose cars start where they end, and is therefore the single configuration that cannot tell
 * the defect from correct behaviour.
 */

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  BUILDING_IDS,
  DATA_DIR,
  FIXTURE_DISPATCHER_ID,
  FIXTURE_SEED,
  PANEL_DISPATCHER_ID,
  breadthConfig,
  fixtureConfig,
  requireBuilding,
  shippedBuildingIds,
} from '../fixtures.test-helper.js';
import { stepValueAt } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION } from '../contract/types.js';
import { recordRun } from './recordRun.js';
import { shortCarLabel } from './instrument.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

describe('instrumentation is neutral', () => {
  it('produces the same RunRecord as an uninstrumented run of the same config', () => {
    const simulationConfig = fixtureConfig(config);
    const plain = runSimulation(simulationConfig);
    const recorded = recordRun(simulationConfig);

    expect(JSON.stringify(recorded.result.record)).toBe(JSON.stringify(plain.record));
    expect(recorded.result.conservation).toEqual(plain.conservation);
    expect(recorded.result.summary.waiting.meanS).toBe(plain.summary.waiting.meanS);
    expect(recorded.result.events).toBe(plain.events);
  }, 120_000);

  it('leaves the streams where an uninstrumented run leaves them', () => {
    // A wrapper that drew a random number would desynchronize common random numbers and
    // silently destroy every paired comparison made against a recorded run. The trace is
    // generated from the `arrivals`/`origins`/`destinations`/`passengerMass` streams, so an
    // identical trace is direct evidence that no extra draw happened before or during it.
    const simulationConfig = fixtureConfig(config);
    const plain = runSimulation(simulationConfig);
    const recorded = recordRun(simulationConfig);
    expect(JSON.stringify(recorded.result.trace)).toBe(JSON.stringify(plain.trace));
  }, 120_000);
});

describe('a recording', () => {
  it('carries its seed, its identity and the run window', () => {
    const { recording, result } = recordRun(fixtureConfig(config));
    expect(recording.schemaVersion).toBe(VIZ_SCHEMA_VERSION);
    expect(recording.seed).toBe(FIXTURE_SEED.toString());
    expect(recording.seed).toBe(result.record.seed);
    expect(recording.runId).toBe(result.runId);
    expect(recording.buildingId).toBe('garden-apartments');
    expect(recording.startedAt).toBe(result.record.startedAt);
    expect(recording.endedAt).toBe(result.record.endedAt);
    expect(recording.endedAt).toBeGreaterThan(recording.startedAt);
  }, 120_000);

  it('describes every floor and every car in the building', () => {
    const { recording } = recordRun(fixtureConfig(config));
    const building = config.buildingsById.get('garden-apartments');
    if (building === undefined) throw new Error('fixture building missing');
    expect(recording.floors.map((floor) => floor.id)).toEqual(building.floors.map((f) => f.id));
    const carCount = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
    expect(recording.shafts).toHaveLength(carCount);
    for (const shaft of recording.shafts) {
      expect(shaft.servedFloorIds.length).toBeGreaterThan(0);
      expect(shaft.capacityPersons).toBeGreaterThan(0);
      expect(shaft.doorConfig.openS).toBeGreaterThan(0);
    }
  }, 120_000);

  it('records real movement and real door cycles', () => {
    const { recording } = recordRun(fixtureConfig(config));
    const totalMotions = recording.shafts.reduce((n, shaft) => n + shaft.motions.length, 0);
    const totalDoorMarks = recording.shafts.reduce((n, shaft) => n + shaft.doorMarks.length, 0);
    expect(totalMotions).toBeGreaterThan(0);
    expect(totalDoorMarks).toBeGreaterThan(0);
    for (const shaft of recording.shafts) {
      for (const motion of shaft.motions) {
        expect(motion.arrivesAt).toBeGreaterThan(motion.commandedAt);
        expect(motion.startedAt).toBeGreaterThanOrEqual(motion.commandedAt);
      }
    }
  }, 120_000);

  it('folds landing queues that start empty and never go negative', () => {
    const { recording } = recordRun(fixtureConfig(config));
    expect(recording.landings.length).toBeGreaterThan(0);
    for (const landing of recording.landings) {
      expect(landing.waiting.before).toBe(0);
      for (const value of landing.waiting.values) expect(value).toBeGreaterThanOrEqual(0);
    }
  }, 120_000);

  it('ends with every passenger the record accounts for reflected in the counters', () => {
    const { recording, result } = recordRun(fixtureConfig(config));
    const end = recording.endedAt;
    const boardedLegs = stepValueAt(recording.progress.boardedLegs, end);
    const waiting = stepValueAt(recording.progress.waiting, end);
    const boarded = result.record.passengers.filter((p) => p.boardedAt !== undefined).length;
    expect(boardedLegs).toBe(boarded);
    expect(waiting).toBe(result.record.passengers.length - boarded);
    expect(recording.summary.generated).toBe(result.conservation.generated);
  }, 120_000);

  it('copies the summary’s own suppression verdict rather than recomputing one', () => {
    const { recording, result } = recordRun(fixtureConfig(config));
    expect(recording.summary.awtIsValid).toBe(result.summary.awtIsValid);
    expect(recording.summary.saturated).toBe(result.summary.saturation.saturated);
  }, 120_000);

  it('orders the landings deterministically, not by Map insertion', () => {
    const first = recordRun(fixtureConfig(config)).recording;
    const second = recordRun(fixtureConfig(config)).recording;
    const key = (r: typeof first): string =>
      r.landings.map((l) => `${l.floorId}/${l.direction}`).join(',');
    expect(key(second)).toBe(key(first));
    const sorted = [...first.landings]
      .map((l) => `${l.floorId}/${l.direction}`)
      .sort((a, b) => a.localeCompare(b));
    expect(key(first)).toBe(sorted.join(','));
  }, 240_000);

  it('survives a JSON round trip unchanged', () => {
    const { recording } = recordRun(fixtureConfig(config));
    const roundTripped: unknown = JSON.parse(JSON.stringify(recording));
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(recording));
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * Breadth: every shipped building, not the one that hides the defect
 * -------------------------------------------------------------------------- */

describe('the fixture list covers every building the project ships', () => {
  it('matches `data/buildings/` exactly, so a new building cannot arrive uncovered', () => {
    expect(shippedBuildingIds(config)).toEqual([...BUILDING_IDS].sort((a, b) => a.localeCompare(b)));
  });
});

describe.each(BUILDING_IDS)('%s — a recording describes where the cars actually started', (buildingId) => {
  it('gives every shaft the start the run itself reports, not the position it ended at', () => {
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const building = requireBuilding(config, buildingId);
    const heightByFloor = new Map(building.floors.map((floor) => [floor.id, floor.heightM]));

    const mismatches: string[] = [];
    let checked = 0;
    for (const shaft of recording.shafts) {
      const first = shaft.motions[0];
      if (first === undefined) continue;
      checked += 1;
      if (shaft.startHeightM !== first.fromHeightM || shaft.startFloorId !== first.fromFloorId) {
        mismatches.push(
          `${shaft.carId}: recorded start ${String(shaft.startHeightM)} m / ${shaft.startFloorId}, ` +
            `first move departs ${String(first.fromHeightM)} m / ${first.fromFloorId}`,
        );
      }
      /* And the start must be a floor of this building at that floor's height — a start read
         from the wrong instant can still be self-consistent, so this is the second, independent
         statement. */
      expect(heightByFloor.get(shaft.startFloorId)).toBe(shaft.startHeightM);
    }
    expect(mismatches).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  }, 300_000);

  it('keeps motions and door marks in the time order the binary searches assume', () => {
    // `frameAt.motionAt` and `series.lastAtOrBefore` binary-search these arrays. Nothing sorted
    // them and nothing checked them, in contrast to `loadSeries` (which sorts) and
    // `StepSeriesBuilder.push` (which throws on a decreasing time). `recordRun` now validates;
    // this is the behavioural half of that.
    const { recording } = recordRun(breadthConfig(config, buildingId));
    for (const shaft of recording.shafts) {
      const commanded = shaft.motions.map((motion) => motion.commandedAt);
      expect(commanded).toEqual([...commanded].sort((a, b) => a - b));
      const marks = shaft.doorMarks.map((mark) => mark.at);
      expect(marks).toEqual([...marks].sort((a, b) => a - b));
    }
  }, 300_000);
});

describe.each(BUILDING_IDS)('%s — the per-leg array (schema 3)', (buildingId) => {
  it('carries exactly the run’s own legs, sorted, with the fields its consumers read', () => {
    const { recording, result } = recordRun(breadthConfig(config, buildingId));
    const passengers = result.record.passengers;
    expect(recording.legs).toHaveLength(passengers.length);
    expect(recording.legs.length).toBeGreaterThan(0);

    const byId = new Map(passengers.map((passenger) => [passenger.passengerId, passenger]));
    for (const leg of recording.legs) {
      const source = byId.get(leg.passengerId);
      expect(source).toBeDefined();
      expect(leg.originFloorId).toBe(source?.originFloorId);
      expect(leg.direction).toBe(source?.direction);
      expect(leg.arrivedAt).toBe(source?.arrivedAt);
      expect(leg.boardedAt).toBe(source?.boardedAt);
      expect(leg.carId).toBe(source?.carId);
      expect(leg.bankId).toBe(source?.bankId);
    }

    // Sorted by `(arrivedAt, passengerId)`. `overlayAt` breaks out of its scan on the first leg
    // that has not arrived, so an unsorted array would silently under-count rather than fail.
    // Compared pairwise rather than by sorting stringified keys: `arrivedAt` is a float, and
    // string order puts "1016.6" before "9.5".
    const outOfOrder: string[] = [];
    for (let i = 1; i < recording.legs.length; i += 1) {
      const previous = recording.legs[i - 1];
      const current = recording.legs[i];
      if (previous === undefined || current === undefined) continue;
      const ordered =
        previous.arrivedAt < current.arrivedAt ||
        (previous.arrivedAt === current.arrivedAt &&
          previous.passengerId.localeCompare(current.passengerId) <= 0);
      if (!ordered) {
        outOfOrder.push(
          `${previous.passengerId}@${String(previous.arrivedAt)} before ${current.passengerId}@${String(current.arrivedAt)}`,
        );
      }
    }
    expect(outOfOrder).toEqual([]);
  }, 300_000);

  it('agrees with the fold it did not replace', () => {
    // Two independent projections of the same passengers: the step-series fold and the leg
    // array. They are built by different code, so agreement is evidence.
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const boarded = recording.legs.filter((leg) => leg.boardedAt !== undefined).length;
    expect(stepValueAt(recording.progress.boardedLegs, recording.endedAt)).toBe(boarded);
    expect(stepValueAt(recording.progress.waiting, recording.endedAt)).toBe(
      recording.legs.length - boarded,
    );
  }, 300_000);

  it('survives a JSON round trip — no explicit `undefined` on an unserved leg', () => {
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const roundTripped = JSON.parse(JSON.stringify(recording)) as typeof recording;
    expect(JSON.stringify(roundTripped.legs)).toBe(JSON.stringify(recording.legs));
  }, 300_000);
});

describe('shortCarLabel', () => {
  it('drops the redundant bank prefix and leaves anything else alone', () => {
    expect(shortCarLabel('main-A', 'main')).toBe('A');
    expect(shortCarLabel('A', 'main')).toBe('A');
    expect(shortCarLabel('shuttle-1', 'main')).toBe('shuttle-1');
  });
});

/* -------------------------------------------------------------------------- *
 * Version 4 — a Level-1 run is recorded as the thing it is
 * -------------------------------------------------------------------------- */

/**
 * The three fields version 4 added, each asserted against the source it was copied from.
 *
 * Written as equality against `result.record` rather than against a literal, for the reason
 * `frameAt.test.ts` gives at length: a field pinned to a constant survives every test that only
 * checks a shape. Each suite below also carries its **witness** — the run must be seen to
 * exhibit the value, or a constant equal to what a quiet run happens to hold would pass.
 */
describe('the passenger model reaches the recording', () => {
  it.each(BUILDING_IDS)('stamps what core computed, on %s', (buildingId) => {
    const conventional = recordRun(breadthConfig(config, buildingId));
    const panel = recordRun(
      breadthConfig(config, buildingId, { dispatcherId: PANEL_DISPATCHER_ID }),
    );

    /* Equality: copied from the record, never re-derived from the profile. */
    expect(conventional.recording.passengerModel).toBe(
      conventional.result.record.passengerModel ?? 'conventional',
    );
    expect(panel.recording.passengerModel).toBe(panel.result.record.passengerModel ?? 'conventional');

    /* Witness: the two models are actually both reachable from `data/`, so a constant fails. */
    expect(conventional.recording.passengerModel).toBe('conventional');
    expect(panel.recording.passengerModel).toBe('destination-dispatch');
  }, 300_000);

  it.each(BUILDING_IDS)('copies every leg’s destination and promise, on %s', (buildingId) => {
    for (const dispatcherId of [FIXTURE_DISPATCHER_ID, PANEL_DISPATCHER_ID]) {
      const { recording, result } = recordRun(
        breadthConfig(config, buildingId, { dispatcherId }),
      );
      const byId = new Map(result.record.passengers.map((p) => [p.passengerId, p]));

      let promised = 0;
      let wrongCar = 0;
      const destinationsPerLanding = new Map<string, Set<string>>();
      for (const leg of recording.legs) {
        const source = byId.get(leg.passengerId);
        expect(source, leg.passengerId).toBeDefined();
        expect(leg.destinationFloorId).toBe(source?.destinationFloorId);
        expect(leg.assignedCarId).toBe(source?.assignedCarId);
        expect(leg.destinationFloorId).not.toBe(leg.originFloorId);

        if (leg.assignedCarId !== undefined) {
          promised += 1;
          if (leg.carId !== undefined && leg.carId !== leg.assignedCarId) wrongCar += 1;
        }
        const key = `${leg.originFloorId} ${leg.direction}`;
        const seen = destinationsPerLanding.get(key) ?? new Set<string>();
        seen.add(leg.destinationFloorId);
        destinationsPerLanding.set(key, seen);
      }

      /* Witnesses. `destinationFloorId` is present under both models — it is a fact about the
         passenger — and the promise is present under exactly one of them. */
      if (dispatcherId === PANEL_DISPATCHER_ID) {
        expect(promised, 'every leg of a Level-1 run is promised a car').toBe(
          recording.legs.length,
        );
      } else {
        expect(promised, 'a conventional run promises nobody').toBe(0);
      }
      expect(wrongCar, 'a promised passenger boarded a car they were not promised').toBe(0);
    }
  }, 300_000);

  it('the direction bucket a version-3 recording drew is a collapse of several calls', () => {
    /*
     * The measurement that decided the bump, restated as a test rather than as a docstring.
     *
     * Not run over every building: Garden Apartments has six floors and two cars, and its five
     * landings really are five origin-destination pairs — measured, 0 landings there carry more
     * than one destination. So the collapse is asserted where it exists and the small building
     * is left alone rather than the assertion being weakened to `>= 0`.
     */
    for (const buildingId of ['midtown-office', 'mixed-use-high-rise', 'secure-tower']) {
      const { recording } = recordRun(
        breadthConfig(config, buildingId, { dispatcherId: PANEL_DISPATCHER_ID }),
      );
      const landings = new Set<string>();
      const calls = new Set<string>();
      const promises = new Set<string>();
      for (const leg of recording.legs) {
        landings.add(`${leg.originFloorId} ${leg.direction}`);
        calls.add(`${leg.originFloorId}->${leg.destinationFloorId}`);
        promises.add(`${leg.originFloorId}->${leg.destinationFloorId}@${String(leg.assignedCarId)}`);
      }
      expect(calls.size, `${buildingId}: calls vs landings`).toBeGreaterThan(landings.size);
      expect(promises.size, `${buildingId}: promises vs calls`).toBeGreaterThan(calls.size);
      // …and the landings the fold produced are exactly the direction buckets, which is the
      // collapse: `recording.landings` cannot represent any of the extra rows.
      expect(recording.landings.length).toBe(landings.size);
    }
  }, 300_000);

  it('a Level-1 recording still survives a JSON round trip', () => {
    // `assignedCarId` is written as *absent* under the conventional model. The round-trip rule
    // the wave-2 legs were added under applies to it too.
    const { recording } = recordRun(
      breadthConfig(config, 'midtown-office', { dispatcherId: PANEL_DISPATCHER_ID }),
    );
    const roundTripped = JSON.parse(JSON.stringify(recording)) as typeof recording;
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(recording));
    expect(roundTripped.passengerModel).toBe('destination-dispatch');
  }, 300_000);
});
