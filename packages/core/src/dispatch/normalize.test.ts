import { describe, expect, it } from 'vitest';

import { estimateCost } from '../model/car/estimateCost.js';
import type { CarSnapshot } from '../model/car/types.js';
import type { Car } from '../model/car/car.js';
import { hallCallId, type Direction } from '../model/types.js';
import { Simulation, runSimulation } from '../sim/simulation.js';
import { DATA_DIR } from '../sim/fixtures.test-helper.js';
import { loadConfig } from '../config/loader.js';

import { costRequestFor, observationFor } from './lifecycle.js';
import {
  NORMALIZATION_DEFAULTS,
  TERM_SCALE_NOTES,
  boundedNormalize,
  normalizeTerm,
  resolveNormalization,
  saturatingNormalize,
  termReferenceScale,
} from './normalize.js';
import { resolveDispatchConfig } from './policy.js';
import { COST_TERMS } from './terms/index.js';
import {
  DispatchError,
  type CostTermDefinition,
  type DispatchCall,
  type DispatchObservation,
  type ResolvedNormalization,
  type TermContext,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The saturating map
 * -------------------------------------------------------------------------- */

describe('saturatingNormalize', () => {
  it('lands in [0, 1) for every non-negative input, however large', () => {
    for (const raw of [0, 0.001, 1, 10, 60, 120, 600, 3600, 1e6, 1e12]) {
      const value = saturatingNormalize(raw, 60);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('puts the reference scale at exactly the half-cost point', () => {
    expect(saturatingNormalize(60, 60)).toBeCloseTo(0.5, 12);
    expect(saturatingNormalize(30, 30)).toBeCloseTo(0.5, 12);
  });

  it('is strictly increasing everywhere, so ordering survives at any magnitude', () => {
    // The property a hard clamp would destroy: two cars 200 s and 400 s away are still
    // ranked, instead of both pinning at 1.0 exactly when the choice matters most.
    const samples = [0, 1, 5, 20, 60, 100, 200, 400, 1000, 5000];
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1] as number;
      const current = samples[i] as number;
      expect(saturatingNormalize(current, 60)).toBeGreaterThan(saturatingNormalize(previous, 60));
    }
  });

  it('is near-linear for values well below the reference', () => {
    // x/(1+x) ≈ x for x << 1, so small differences behave the way an author expects.
    const scaled = saturatingNormalize(0.6, 60);
    expect(scaled).toBeCloseTo(0.01, 3);
  });

  it('maps an infinite raw value to 1 rather than NaN', () => {
    // Stage 2 filters infeasible cars, but a NaN would compare false against everything and
    // silently make an infeasible car the winner.
    expect(saturatingNormalize(Number.POSITIVE_INFINITY, 60)).toBe(1);
  });

  it('clamps a negative raw value to zero', () => {
    expect(saturatingNormalize(-5, 60)).toBe(0);
  });

  it('rejects a non-positive reference, which would delete the term', () => {
    expect(() => saturatingNormalize(1, 0)).toThrow(DispatchError);
    expect(() => saturatingNormalize(1, -1)).toThrow(DispatchError);
    expect(() => saturatingNormalize(1, Number.POSITIVE_INFINITY)).toThrow(DispatchError);
  });

  it('rejects NaN from a term', () => {
    expect(() => saturatingNormalize(Number.NaN, 60)).toThrow(DispatchError);
  });
});

/* -------------------------------------------------------------------------- *
 * The bounded map
 * -------------------------------------------------------------------------- */

describe('boundedNormalize', () => {
  it('is linear inside the range and clamps outside it', () => {
    expect(boundedNormalize(0, 2)).toBe(0);
    expect(boundedNormalize(1, 2)).toBe(0.5);
    expect(boundedNormalize(2, 2)).toBe(1);
    expect(boundedNormalize(3, 2)).toBe(1);
    expect(boundedNormalize(-1, 2)).toBe(0);
  });

  it('rejects a non-positive full scale', () => {
    expect(() => boundedNormalize(1, 0)).toThrow(DispatchError);
  });

  it('rejects NaN from a term', () => {
    expect(() => boundedNormalize(Number.NaN, 2)).toThrow(DispatchError);
  });
});

/* -------------------------------------------------------------------------- *
 * Comparability — the reason this module exists
 * -------------------------------------------------------------------------- */

describe('normalization keeps every term comparable', () => {
  const scales: ResolvedNormalization = resolveNormalization();

  it('maps every term into [0, 1] across its whole plausible raw range', () => {
    // CLAUDE.md: raw waitTime (0-120 s) and stopCount (0-20) on one scale make weights
    // uninterpretable. This is the assertion that they are not on one scale any more.
    const rawByUnit: Readonly<Record<string, readonly number[]>> = {
      s: [0, 1, 15, 30, 60, 120, 300, 1200, 1e6],
      'passenger·s': [0, 2, 30, 60, 200, 900, 5000],
      m: [0, 0.5, 4, 12, 30, 80, 200, 600],
      '': [0, 0.25, 0.5, 1, 1.5, 2, 20],
    };

    for (const term of COST_TERMS) {
      const raws = rawByUnit[term.unit];
      expect(raws, `no probe values for unit "${term.unit}"`).toBeDefined();
      for (const raw of raws ?? []) {
        const value = normalizeTerm(term, raw, scales);
        expect(value, `${term.id} at raw ${raw}`).toBeGreaterThanOrEqual(0);
        expect(value, `${term.id} at raw ${raw}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts a typical value of every term within an order of magnitude of every other', () => {
    // The operational form of "comparable": a 60 s wait, 30 m of extra travel, one direction
    // reversal, a car at 60% of rated and a landing half left behind are all mid-scale, so
    // weights read as preferences rather than as unit conversions. Raw, these numbers span
    // more than a hundredfold.
    const typical = new Map<string, number>([
      ['waitTime', 60],
      ['rideTime', 45],
      ['detourPenalty', 40],
      ['diversionDetour', 40],
      ['existingCallDelay', 30],
      ['directionReversal', 1],
      ['loadFactor', 0.6],
      ['stopCount', 1],
      ['distanceTravelled', 30],
      ['starvation', 60],
      ['zoneAffinity', 20],
      ['predictedDemand', 25],
      ['crowding', 0.5],
    ]);

    for (const term of COST_TERMS) {
      const raw = typical.get(term.id);
      expect(raw, `no typical value for ${term.id}`).toBeDefined();
      const value = normalizeTerm(term, raw ?? 0, scales);
      expect(value, term.id).toBeGreaterThan(0.1);
      expect(value, term.id).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonic per term, so a one-term weight vector is invariant to its reference scale', () => {
    // Why nearest-car picks the same car whatever `normalization.distanceM` is set to: the
    // map is monotonic, so it cannot reorder a single-term ranking. Phase 7 can therefore
    // tune the reference for the terms that trade against each other without accidentally
    // retuning the baselines.
    const near = 0.4;
    const far = 25;
    for (const reference of [5, 30, 200]) {
      const scaled: ResolvedNormalization = { waitTimeS: reference, distanceM: reference };
      for (const term of COST_TERMS) {
        expect(normalizeTerm(term, near, scaled), term.id).toBeLessThanOrEqual(
          normalizeTerm(term, far, scaled),
        );
      }
    }
  });

  it('routes each term through the map it declares', () => {
    const saturating = COST_TERMS.filter((term) => term.normalization.mode === 'saturating');
    const bounded = COST_TERMS.filter((term) => term.normalization.mode === 'bounded');

    expect(saturating.map((term) => term.id)).toEqual([
      'waitTime',
      'rideTime',
      'detourPenalty',
      'diversionDetour',
      'existingCallDelay',
      'distanceTravelled',
      'starvation',
      'zoneAffinity',
      'predictedDemand',
    ]);
    expect(bounded.map((term) => term.id)).toEqual([
      'directionReversal',
      'loadFactor',
      'stopCount',
      'crowding',
    ]);

    // A bounded term reaches exactly 1 at its full scale; a saturating one never does.
    for (const term of bounded) {
      const fullScale = (term.normalization as { readonly fullScale: number }).fullScale;
      expect(normalizeTerm(term, fullScale, scales), term.id).toBe(1);
      expect(normalizeTerm(term, fullScale * 100, scales), term.id).toBe(1);
    }
    for (const term of saturating) {
      expect(normalizeTerm(term, 1e9, scales), term.id).toBeLessThan(1);
      expect(normalizeTerm(term, 1e9, scales), term.id).toBeGreaterThan(0.99);
    }
  });

  it('gives only the four genuinely bounded terms a linear map', () => {
    // The distinction the whole scheme rests on: `bounded` is for a raw value with a **known
    // finite maximum**, because a clamp destroys ordering above it. Two direction changes, two
    // stops, rated load and a whole landing left behind are all real ceilings; a wait, a ride, a
    // delay and a distance are not, and clamping one would stop distinguishing two distant cars
    // exactly when the choice matters most.
    for (const term of COST_TERMS) {
      if (term.normalization.mode !== 'bounded') continue;
      expect(['directionReversal', 'loadFactor', 'stopCount', 'crowding'], term.id).toContain(
        term.id,
      );
      expect(term.normalization.fullScale, term.id).toBeGreaterThan(0);
      expect(Number.isFinite(term.normalization.fullScale), term.id).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Documented reference scales
 * -------------------------------------------------------------------------- */

describe('every term documents the reference scale it is normalized on', () => {
  it('has a note for each of the twelve, and no note for a term that does not exist', () => {
    // A documented reference that is only a comment rots. This is the executable form: a term
    // landing without a stated reference scale fails here.
    const ids = COST_TERMS.map((term) => term.id).sort();
    expect(Object.keys(TERM_SCALE_NOTES).sort()).toEqual(ids);
    for (const note of Object.values(TERM_SCALE_NOTES)) {
      expect(note.length).toBeGreaterThan(40);
    }
  });

  it('reports the half-cost point the module’s table claims', () => {
    const expected = new Map<string, number>([
      ['waitTime', 60],
      ['rideTime', 60],
      ['detourPenalty', 60],
      ['diversionDetour', 60],
      ['existingCallDelay', 60],
      ['directionReversal', 1],
      ['loadFactor', 0.5],
      ['stopCount', 1],
      ['distanceTravelled', 30],
      ['starvation', 60],
      ['zoneAffinity', 30],
      ['predictedDemand', 30],
      ['crowding', 0.5],
    ]);

    for (const term of COST_TERMS) {
      const scale = termReferenceScale(term);
      expect(scale.termId).toBe(term.id);
      expect(scale.halfCostRaw, term.id).toBe(expected.get(term.id));
      expect(normalizeTerm(term, scale.halfCostRaw, NORMALIZATION_DEFAULTS), term.id).toBeCloseTo(
        0.5,
        12,
      );
      expect(scale.note, term.id).not.toBe('');
    }
  });

  it('follows the tuned reference rather than the default', () => {
    const tuned = resolveNormalization({ waitTimeS: 20, distanceM: 100 });
    for (const term of COST_TERMS) {
      const scale = termReferenceScale(term, tuned);
      if (scale.mode === 'bounded') {
        expect(scale.scale, term.id).toBeUndefined();
        continue;
      }
      expect(scale.halfCostRaw, term.id).toBe(scale.scale === 'waitTimeS' ? 20 : 100);
      expect(scale.fullCostRaw, term.id).toBe(Number.POSITIVE_INFINITY);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Bounded on real snapshots — the assertion that matters
 * -------------------------------------------------------------------------- */

describe('every term is bounded on snapshots from a real simulation', () => {
  /** All twelve terms weighted, so a real run exercises every one of them. */
  const ALL_TWELVE: Readonly<Record<string, number>> = {
    waitTime: 1.0,
    rideTime: 0.3,
    detourPenalty: 0.4,
    existingCallDelay: 0.5,
    directionReversal: 0.8,
    loadFactor: 0.6,
    stopCount: 0.2,
    distanceTravelled: 0.1,
    starvation: 0.7,
    zoneAffinity: 0.2,
    predictedDemand: 0.4,
    crowding: 0.3,
  };

  it('runs a real building end to end with every term weighted', async () => {
    // The strongest boundedness assertion available, because it is enforced from the inside:
    // `scoreCar` throws `DispatchError` on any raw that is non-finite or negative, and
    // `normalizeTerm` throws on a NaN. A full replication of Midtown Office is tens of thousands
    // of (car, call) evaluations, and every one of them passed through both guards.
    const config = await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('midtown-office');
    const profile = config.dispatcherProfilesById.get('predictive-balanced');
    expect(building).toBeDefined();
    expect(profile).toBeDefined();

    const result = runSimulation({
      building: building!,
      dispatcherProfile: profile!,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherOptions: { weights: ALL_TWELVE },
      seed: 20260726,
    });

    expect(result.status).toBe('completed');
    expect(result.conservation.balanced).toBe(true);
    expect(result.summary.waiting.meanS).toBeGreaterThan(0);
    expect(Number.isFinite(result.summary.waiting.meanS)).toBe(true);
  }, 60_000);

  it('normalizes into [0, 1] on every car of a run stopped mid-flight', async () => {
    // Mid-run rather than end-of-run: at the end of a replication every car is idle and empty,
    // which is the one state that exercises nothing. Truncating the event budget leaves the cars
    // wherever they were — carrying passengers, holding landing calls, some in flight — which is
    // the population the terms actually see. Four truncation points, so the sample spans the
    // fill, the peak and the drain rather than one instant that happened to be benign.
    const config = await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('midtown-office');
    const profile = config.dispatcherProfilesById.get('predictive-balanced');
    expect(building).toBeDefined();
    expect(profile).toBeDefined();

    const dispatchConfig = resolveDispatchConfig(profile!, { weights: ALL_TWELVE });
    const scales = dispatchConfig.normalization;

    let evaluated = 0;
    let feasibleEvaluations = 0;
    let carsCarryingPassengers = 0;
    let carsInFlight = 0;

    for (const maxEvents of [400, 1000, 1500, 2500]) {
      const simulation = new Simulation({
        building: building!,
        dispatcherProfile: profile!,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        dispatcherOptions: { weights: ALL_TWELVE },
        seed: 20260726,
        maxEvents,
        onTimeout: 'report',
      });
      try {
        simulation.run();
      } catch {
        // A truncated run is the point. The conservation audit fails on one by design — a
        // half-finished replication must never produce statistics — and the cars are what this
        // test is after, not the numbers.
      }

      const cars: readonly Car[] = simulation.building.cars;
      const at = Math.max(...cars.map((car) => car.snapshot().at));
      const snapshots = cars.map((car) => car.snapshot(at));

      expect(snapshots.length, `maxEvents=${maxEvents}`).toBeGreaterThan(1);
      expect(
        snapshots.some((snapshot) => snapshot.stops.length > 0),
        `maxEvents=${maxEvents}`,
      ).toBe(true);
      carsCarryingPassengers += snapshots.filter((s) => s.load.occupants > 0).length;
      carsInFlight += snapshots.filter((s) => s.motion !== undefined).length;

      const zones = zonesFor(snapshots);
      const forecast = forecastFor(snapshots);

      for (const snapshot of snapshots) {
        for (const floor of snapshot.shaft.floors) {
          for (const direction of ['up', 'down'] as const) {
            for (const waitingPassengers of [0, 3, 25]) {
              const context = contextFor(snapshot, floor.id, direction, at, {
                waitingPassengers,
                zoneFloorIdsByCarId: zones,
                demandForecast: forecast,
              });

              for (const term of COST_TERMS) {
                const raw = term.evaluate(context);

                // Normalization is bounded for **every** car, feasible or not. An infeasible car
                // reports `etaSeconds: Infinity`, and the saturating map takes it to exactly 1 —
                // ranked last rather than poisoning the sum with a NaN that compares false
                // against everything.
                const normalized = normalizeTerm(term, raw, scales);
                expect(normalized, `${term.id} normalized=${normalized}`).toBeGreaterThanOrEqual(0);
                expect(normalized, `${term.id} normalized=${normalized}`).toBeLessThanOrEqual(1);

                // The raw contract — finite and non-negative, which `scoreCar` enforces by
                // throwing — is asserted on the cars the engine would actually score. Stage 2
                // filters the rest before a term ever sees them.
                if (context.estimate.feasible) {
                  expect(Number.isFinite(raw), `${term.id} raw=${raw}`).toBe(true);
                  expect(raw, term.id).toBeGreaterThanOrEqual(0);
                  feasibleEvaluations += 1;
                }
                evaluated += 1;
              }
            }
          }
        }
      }
    }

    // Guards against the test silently sampling nothing interesting: loaded cars and cars in
    // flight are the two states that make the route comparison non-trivial.
    expect(evaluated).toBeGreaterThan(10_000);
    expect(feasibleEvaluations).toBeGreaterThan(5_000);
    expect(carsCarryingPassengers).toBeGreaterThan(4);
    expect(carsInFlight).toBeGreaterThan(2);
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

describe('resolveNormalization', () => {
  it('applies the declared defaults', () => {
    expect(resolveNormalization()).toEqual(NORMALIZATION_DEFAULTS);
    expect(NORMALIZATION_DEFAULTS.waitTimeS).toBe(60);
    expect(NORMALIZATION_DEFAULTS.distanceM).toBe(30);
  });

  it('overrides one scale without disturbing the other', () => {
    const resolved = resolveNormalization({ distanceM: 12 });
    expect(resolved.distanceM).toBe(12);
    expect(resolved.waitTimeS).toBe(NORMALIZATION_DEFAULTS.waitTimeS);
  });

  it('rejects a non-positive scale eagerly', () => {
    expect(() => resolveNormalization({ waitTimeS: 0 })).toThrow(/normalization\.waitTimeS/);
    expect(() => resolveNormalization({ distanceM: -3 })).toThrow(/normalization\.distanceM/);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(resolveNormalization())).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Helpers
 * -------------------------------------------------------------------------- */

/** One contiguous band of the shaft per car, as an operational-zone stand-in. */
function zonesFor(snapshots: readonly CarSnapshot[]): ReadonlyMap<string, readonly string[]> {
  const zones = new Map<string, readonly string[]>();
  snapshots.forEach((snapshot, index) => {
    const floors = snapshot.shaft.floors;
    const width = Math.max(1, Math.ceil(floors.length / snapshots.length));
    zones.set(
      snapshot.carId,
      floors.slice(index * width, (index + 1) * width).map((floor) => floor.id),
    );
  });
  return zones;
}

/** A forecast weighted towards the bottom of the shaft, the way an up-peak one would be. */
function forecastFor(snapshots: readonly CarSnapshot[]): ReadonlyMap<string, number> {
  const forecast = new Map<string, number>();
  const first = snapshots[0];
  if (first === undefined) return forecast;
  first.shaft.floors.forEach((floor, index) => {
    forecast.set(floor.id, index === 0 ? 20 : 1);
  });
  return forecast;
}

interface ObservationOptions {
  readonly waitingPassengers: number;
  readonly zoneFloorIdsByCarId: ReadonlyMap<string, readonly string[]>;
  readonly demandForecast: ReadonlyMap<string, number>;
}

/** A `TermContext` built exactly as `lifecycle.ts` builds one, with the Phase 5 facts attached. */
function contextFor(
  car: CarSnapshot,
  floorId: string,
  direction: Direction,
  at: number,
  options: ObservationOptions,
): TermContext {
  const floor = car.shaft.floorsById.get(floorId);
  const subject: DispatchCall = {
    id: hallCallId(floorId, direction),
    floorId,
    floorIndex: floor?.index ?? 0,
    direction,
    registeredAt: Math.max(0, at - 75),
  };
  const config = resolveDispatchConfig({ id: 'probe', name: 'Probe', weights: {} });
  // Through the real `observationFor`, group facts included — a hand-built observation is how the
  // three inert terms stayed invisible for a whole phase.
  const observation: DispatchObservation = observationFor(subject, options.waitingPassengers, undefined, {
    zoneFloorIdsByCarId: options.zoneFloorIdsByCarId,
    demandForecast: options.demandForecast,
  });
  const request = costRequestFor(subject, config, observation);
  return {
    car,
    call: subject,
    request,
    estimate: estimateCost(car, request),
    at,
    observation,
  };
}

/** Type-level guard: `termReferenceScale` really does describe a `CostTermDefinition`. */
const _describes: (term: CostTermDefinition) => void = (term) => {
  void termReferenceScale(term).mode;
};
void _describes;
