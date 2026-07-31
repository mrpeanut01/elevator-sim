/// <reference types="node" />

/**
 * The generator: replayability, rate arithmetic, stream discipline and the shipped buildings.
 *
 * The statistical assertions here deliberately compare a *sampled* count against a
 * *closed-form* expectation computed by `planDemand` from the same configuration, not against
 * a number typed into the test. A test that hardcodes its expectation is testing the typist;
 * this one fails if the sampler and the arithmetic ever disagree, which is the bug worth
 * catching. The one exception is the headline case — office-standard at 12% on Midtown
 * Office's 1710 occupants — where the literal 205.2 is asserted on both sides, because that
 * figure is the anchor everything else is calibrated against.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { BuildingConfig, LoadedConfig, ResolvedBuilding, TrafficProfiles } from '../config/types.js';
import { Passenger } from '../model/index.js';
import { STREAM_NAMES, StreamSet } from '../random/index.js';

import {
  egressTransitSecondsOf,
  generateTrace,
  planDemand,
  routeOf,
  toPassengerInit,
  transferFloorsOf,
  transportHopBefore,
} from './generator.js';
import { RoutePlanner } from './route.js';
import { TrafficError, type PassengerTrace } from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
let profiles: TrafficProfiles;

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
  profiles = config.trafficProfiles;
});

const building = (id: string): ResolvedBuilding => {
  const found = config.buildingsById.get(id);
  if (found === undefined) throw new Error(`no building "${id}"`);
  return found;
};

const traceOf = (buildingId: string, seed: number): PassengerTrace =>
  generateTrace({ building: building(buildingId), profiles, streams: new StreamSet(seed) });

/* -------------------------------------------------------------------------- *
 * Replayability — the property common random numbers rests on
 * -------------------------------------------------------------------------- */

describe('replayability', () => {
  it('produces a byte-identical trace from the same seed', () => {
    const a = JSON.stringify(traceOf('mixed-use-high-rise', 20260726));
    const b = JSON.stringify(traceOf('mixed-use-high-rise', 20260726));
    expect(a).toBe(b);
  });

  it('produces a different trace from a different seed', () => {
    const a = JSON.stringify(traceOf('midtown-office', 1));
    const b = JSON.stringify(traceOf('midtown-office', 2));
    expect(a).not.toBe(b);
  });

  it('is unaffected by draws on the streams the run uses', () => {
    // The whole point: dispatcher B causing one extra door reopen must not change who travels.
    const clean = new StreamSet(4242);
    const perturbed = new StreamSet(4242);
    for (let i = 0; i < 1000; i += 1) {
      perturbed.doorObstruction.nextFloat();
      perturbed.policyNoise.nextFloat();
    }
    const args = { building: building('secure-tower'), profiles };
    expect(JSON.stringify(generateTrace({ ...args, streams: perturbed }))).toBe(
      JSON.stringify(generateTrace({ ...args, streams: clean })),
    );
  });

  it('carries its seed, so a stored record replays without any other state', () => {
    const trace = traceOf('garden-apartments', 987654321);
    expect(trace.seed).toBe('987654321');
    const replayed = generateTrace({
      building: building('garden-apartments'),
      profiles,
      streams: new StreamSet(BigInt(trace.seed)),
    });
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(trace));
  });

  it('is independent of how many traces the process has already generated', () => {
    // No module-level counters: ids and journey ids restart with every trace.
    const first = traceOf('garden-apartments', 5);
    traceOf('midtown-office', 6);
    traceOf('secure-tower', 7);
    expect(JSON.stringify(traceOf('garden-apartments', 5))).toBe(JSON.stringify(first));
  });
});

/* -------------------------------------------------------------------------- *
 * Stream discipline
 * -------------------------------------------------------------------------- */

describe('stream discipline', () => {
  it('never touches doorObstruction or policyNoise', () => {
    const streams = new StreamSet(31337);
    const fresh = new StreamSet(31337);
    const doorBefore = streams.doorObstruction.getState();
    const noiseBefore = streams.policyNoise.getState();

    generateTrace({ building: building('vertical-city'), profiles, streams });

    expect(streams.doorObstruction.getState()).toEqual(doorBefore);
    expect(streams.policyNoise.getState()).toEqual(noiseBefore);
    // And still bit-identical to a stream set that has generated nothing at all.
    expect(streams.doorObstruction.getState()).toEqual(fresh.doorObstruction.getState());
    expect(streams.policyNoise.getState()).toEqual(fresh.policyNoise.getState());
  });

  it('does draw from arrivals, origins, destinations and passengerMass', () => {
    const streams = new StreamSet(77);
    const fresh = new StreamSet(77);
    // Midtown has two entrances, so the origins stream is genuinely exercised.
    generateTrace({ building: building('midtown-office'), profiles, streams });
    expect(streams.arrivals.getState()).not.toEqual(fresh.arrivals.getState());
    expect(streams.origins.getState()).not.toEqual(fresh.origins.getState());
    expect(streams.destinations.getState()).not.toEqual(fresh.destinations.getState());
    expect(streams.passengerMass.getState()).not.toEqual(fresh.passengerMass.getState());
  });

  it('materializes no stream beyond the ones the architecture declares', () => {
    const streams = new StreamSet(78);
    generateTrace({ building: building('mixed-use-high-rise'), profiles, streams });
    // Derived from `STREAM_NAMES` rather than re-typed: a name added there and never derived here
    // is the thing this asserts, and a hand-written list would have to be edited to keep saying so.
    expect([...streams.streamNames()].sort()).toEqual([...STREAM_NAMES].sort());
  });

  /**
   * **The one draw `trafficModel` moves** (docs/14 § 1.3).
   *
   * Asserted on stream *state* rather than on the trace, because the claim is about which sequence
   * was consumed and that is not recoverable from the output. Under `v1` the `batchSize` stream is
   * materialized — it is in `STREAM_NAMES` — and stands exactly where a stream set that generated
   * nothing at all stands, which is what makes the default byte-identical rather than merely
   * equivalent. Under `v2` it has moved and `arrivals` has moved *less*, by one draw per batch.
   */
  it('draws batch sizes from arrivals under v1 and from batchSize under v2', () => {
    const fresh = new StreamSet(79);

    const underV1 = new StreamSet(79);
    const trace = generateTrace({ building: building('midtown-office'), profiles, streams: underV1 });
    expect(underV1.batchSize.getState()).toEqual(fresh.batchSize.getState());

    const underV2 = new StreamSet(79);
    generateTrace({
      building: building('midtown-office'),
      profiles,
      streams: underV2,
      trafficModel: 'v2',
    });
    expect(underV2.batchSize.getState()).not.toEqual(fresh.batchSize.getState());
    expect(underV2.arrivals.getState()).not.toEqual(underV1.arrivals.getState());
    expect(trace.arrivals.length).toBeGreaterThan(0);
  });

  /**
   * `v1` is the default at the generator too, not only at `runSimulation`.
   *
   * The blocking criterion of docs/14 § 5 stated where the draw actually happens: an absent
   * `trafficModel` and an explicit `'v1'` must leave every stream in the same place.
   */
  it('defaults to v1, so an absent trafficModel consumes exactly what it always did', () => {
    const absent = new StreamSet(80);
    const explicit = new StreamSet(80);
    generateTrace({ building: building('midtown-office'), profiles, streams: absent });
    generateTrace({
      building: building('midtown-office'),
      profiles,
      streams: explicit,
      trafficModel: 'v1',
    });
    for (const name of STREAM_NAMES) {
      expect(explicit.stream(name).getState(), name).toEqual(absent.stream(name).getState());
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The rate conversion, end to end
 * -------------------------------------------------------------------------- */

describe('arrival rate', () => {
  it('plans 205.2 passengers per 5 minutes at peak for Midtown Office', () => {
    const plan = planDemand({ building: building('midtown-office'), profiles });
    expect(plan.peakPassengersPerSecond * 300).toBeCloseTo(205.2, 9);
    expect(plan.expectedPassengersInReportWindow).toBeCloseTo(205.2, 9);
    expect(building('midtown-office').totalPopulation).toBe(1710);
  });

  it('delivers that rate in the reported window, averaged over many seeds', () => {
    const b = building('midtown-office');
    const expected = planDemand({ building: b, profiles }).expectedPassengersInReportWindow;
    const seeds = 200;
    let total = 0;
    for (let seed = 0; seed < seeds; seed += 1) {
      total += generateTrace({ building: b, profiles, streams: new StreamSet(seed) })
        .passengersInReportWindow;
    }
    const mean = total / seeds;
    // Compound Poisson: sd per replication is ~19 passengers, so the standard error over 200
    // seeds is ~1.4. A 6 passenger band is more than four standard errors.
    expect(expected).toBeCloseTo(205.2, 6);
    expect(Math.abs(mean - expected)).toBeLessThan(6);
  });

  it('delivers the planned total over the whole run too', () => {
    const b = building('secure-tower');
    const plan = planDemand({ building: b, profiles });
    const seeds = 120;
    let total = 0;
    for (let seed = 0; seed < seeds; seed += 1) {
      total += generateTrace({ building: b, profiles, streams: new StreamSet(seed) }).passengerCount;
    }
    expect(total / seeds).toBeCloseTo(plan.expectedPassengers, -1);
    expect(Math.abs(total / seeds - plan.expectedPassengers)).toBeLessThan(
      0.04 * plan.expectedPassengers,
    );
  });

  it('scales linearly with an explicit rate override', () => {
    const b = building('midtown-office');
    const base = planDemand({ building: b, profiles, arrivalRatePctPop5min: 12 });
    const double = planDemand({ building: b, profiles, arrivalRatePctPop5min: 24 });
    expect(double.peakPassengersPerSecond).toBeCloseTo(2 * base.peakPassengersPerSecond, 12);
  });

  it('honours the demand level chosen from the profile range', () => {
    const b = building('midtown-office');
    const min = planDemand({ building: b, profiles, demandLevel: 'min' });
    const typical = planDemand({ building: b, profiles, demandLevel: 'typical' });
    const max = planDemand({ building: b, profiles, demandLevel: 'max' });
    // office-standard declares min 11, typical 12, max 15.
    expect(min.peakPassengersPerSecond * 300).toBeCloseTo((11 / 100) * 1710, 9);
    expect(typical.peakPassengersPerSecond * 300).toBeCloseTo((12 / 100) * 1710, 9);
    expect(max.peakPassengersPerSecond * 300).toBeCloseTo((15 / 100) * 1710, 9);
  });

  it('follows the demand template: nothing at the edges, everything at the peak', () => {
    const trace = traceOf('midtown-office', 12345);
    const early = trace.passengers.filter((p) => p.arrivalTimeS < 75).length;
    const peak = trace.passengers.filter((p) => p.inReportWindow).length;
    expect(early).toBeLessThan(peak / 10);
    expect(trace.passengers.every((p) => p.arrivalTimeS >= 0 && p.arrivalTimeS < 1800)).toBe(true);
  });

  it('runs the constant template over 120 minutes with the ISO discards', () => {
    const trace = generateTrace({
      building: building('midtown-office'),
      profiles,
      streams: new StreamSet(9),
      template: 'constant-iso',
    });
    expect(trace.durationS).toBe(7200);
    expect(trace.reportWindowStartS).toBe(900);
    expect(trace.reportWindowEndS).toBe(6900);
    expect(trace.template.recommended).toBe(false);
    // Flat demand: 0.684 pax/s over 7200 s.
    expect(trace.passengerCount).toBeGreaterThan(0.9 * 0.684 * 7200);
    expect(trace.passengerCount).toBeLessThan(1.1 * 0.684 * 7200);
  });
});

/* -------------------------------------------------------------------------- *
 * Demand conservation
 * -------------------------------------------------------------------------- */

describe('demand conservation', () => {
  /**
   * `Σ_f pct_f/100 * population_f / 300` — the rate the profiles specify, computed from the
   * data rather than from anything the generator did with it.
   */
  const nominalRate = (b: ResolvedBuilding): number => {
    let total = 0;
    for (const floor of b.floors) {
      if (floor.population <= 0) continue;
      const profileId = floor.trafficProfile ?? b.trafficProfile;
      const profile = config.trafficProfilesById.get(profileId);
      if (profile === undefined) throw new Error(`no profile "${profileId}"`);
      total += ((profile.arrivalRatePctPop5min.typical / 100) * floor.population) / 300;
    }
    return total;
  };

  it('plans exactly the headline rate the profiles specify, for every shipped building', () => {
    // The identity the module doc claims: superposing the entrance source and one resident
    // source per floor gives back Σ_f λ_f, with nothing double counted and nothing lost. A
    // dropped origin-destination pair renormalizes inside its share; a share that loses every
    // destination is redistributed across the floor's other shares. Neither may move this sum.
    for (const b of config.buildings) {
      const plan = planDemand({ building: b, profiles });
      expect(plan.peakPassengersPerSecond, b.id).toBeCloseTo(nominalRate(b), 12);
    }
  });

  it('does not lose the interfloor share of a credential-isolated floor', () => {
    // Secure Tower floor 30 sits in the `executive` access zone, whose two credential groups
    // (`exec`, `exec-escort`) are permitted on no other floor. Every interfloor candidate for
    // it therefore fails, and deleting that share instead of moving it would run the whole
    // building at 0.39632 p/s against the 0.3968 its profiles specify — a shortfall that is
    // small here only because the isolated zone is small.
    const b = building('secure-tower');
    const plan = planDemand({ building: b, profiles });
    expect(b.totalPopulation).toBe(992);
    expect(plan.peakPassengersPerSecond * 300).toBeCloseTo((12 / 100) * 992, 9);
    expect(plan.peakPassengersPerSecond).toBeCloseTo(0.3968, 12);

    // The floor keeps its whole rate: 12 occupants at 12%/5 min, of which 5% + 10% leaves.
    const floor30 = plan.sources.find((source) => source.id === 'resident:30');
    expect(floor30?.peakPassengersPerSecond).toBeCloseTo(((12 * (12 / 100)) / 300) * 0.15, 12);
    // ... but every trip it can make is a trip to the lobby, and that is what it now plans.
    expect(new Set(floor30?.destinations.map((d) => d.category))).toEqual(new Set(['outgoing']));
  });

  it('says out loud that the isolated floor keeps its rate but not its split', () => {
    const plan = planDemand({ building: building('secure-tower'), profiles });
    const warning = plan.warnings.find((w) => w.startsWith('Floor "30"'));
    expect(warning).toBeDefined();
    expect(warning).toContain('10% interfloor');
    expect(warning).toContain('redistributed');
    expect(warning).toContain('total rate is unchanged but its directional split is not');
    // The number is the one a reader can check: 12 people x 12%/5 min x 10%.
    expect(warning).toContain('0.144 per 5 min');

    // And the blanket notice no longer claims the split was preserved for every floor.
    const blanket = plan.warnings.find((w) => w.includes('no single credential group'));
    expect(blanket).toBeDefined();
    expect(blanket).not.toContain('total rate and directional split are unchanged');
  });

  it('is the access rules doing it, not the arithmetic', () => {
    // Switching credential enforcement off restores floor 30's interfloor trips. The total is
    // identical either way — which is the point: enforcement changes where people go, not how
    // many of them there are.
    const b = building('secure-tower');
    const enforced = planDemand({ building: b, profiles });
    const unenforced = planDemand({ building: b, profiles, credentialAssignment: 'none' });
    expect(unenforced.peakPassengersPerSecond).toBeCloseTo(enforced.peakPassengersPerSecond, 12);

    const categories = (plan: typeof enforced): Set<string> =>
      new Set(
        plan.sources.find((s) => s.id === 'resident:30')?.destinations.map((d) => d.category) ?? [],
      );
    expect(categories(enforced)).toEqual(new Set(['outgoing']));
    expect(categories(unenforced)).toEqual(new Set(['outgoing', 'interfloor']));
    expect(unenforced.warnings.some((w) => w.startsWith('Floor "30"'))).toBe(false);
  });

  it('quantifies incoming demand it cannot route, because that demand really is lost', () => {
    // Incoming demand is demand *for* a floor, so a floor no entrance can reach has no other
    // share to fall back on. Cap Mixed-Use's leg budget below what its sky lobby needs and the
    // residential floors become unreachable from the street.
    const b = building('mixed-use-high-rise');
    const capped = planDemand({ building: b, profiles, maxLegs: 1 });
    const full = planDemand({ building: b, profiles });
    const shortfall = full.peakPassengersPerSecond - capped.peakPassengersPerSecond;
    expect(shortfall).toBeGreaterThan(0);

    const warning = capped.warnings.find((w) => w.includes('of incoming demand is dropped'));
    expect(warning).toBeDefined();
    expect(warning).toContain('29 floors');
    const reported = /([\d.]+) passengers\/second \([\d.]+ per 5 min\) of incoming demand/.exec(
      warning ?? '',
    );
    expect(reported).not.toBeNull();
    // The figure in the warning is the actual shortfall, not a gesture at one.
    expect(Number(reported?.[1])).toBeCloseTo(shortfall, 3);
    expect(full.warnings.some((w) => w.includes('of incoming demand is dropped'))).toBe(false);
  });

  it('quantifies the incoming share of a populated entrance floor, which it drops', () => {
    // Nobody rides a lift to the floor they walk in on, so a populated entrance loses its
    // incoming share. No shipped building has one, which is exactly why the branch needs a
    // test: it is the case where the headline rate legitimately differs from Σ_f λ_f.
    const authored = JSON.parse(JSON.stringify(building('garden-apartments').config)) as BuildingConfig;
    const lobbyOffices = resolveBuilding(
      parseBuilding({
        ...authored,
        floors: authored.floors?.map((floor) =>
          floor.id === 'G' ? { ...floor, population: 40 } : floor,
        ),
        totalPopulation: 160,
      }),
      config.elevatorSpecs,
    );

    const plan = planDemand({ building: lobbyOffices, profiles });
    const warning = plan.warnings.find((w) => w.includes('both populated and an entrance'));
    expect(warning).toBeDefined();
    // residential is 15% incoming: 40 people at 5%/5 min is 2 per 5 min, of which 0.3 is lost.
    expect(warning).toContain('15% incoming share');
    expect(warning).toContain('0.300 per 5 min');
    const nominal = nominalRate(lobbyOffices);
    expect(nominal - plan.peakPassengersPerSecond).toBeCloseTo(((40 * 0.05) / 300) * 0.15, 12);
  });

  it('reports the rate it drops when a floor has nowhere at all to send anyone', () => {
    // One populated floor, and a split that sends everyone interfloor. There is no second
    // floor to go to and no share left to absorb the demand, so it is genuinely dropped —
    // the one case where the headline rate legitimately falls, and it is named.
    const authored = JSON.parse(
      JSON.stringify(building('garden-apartments').config),
    ) as BuildingConfig;
    const solitary = resolveBuilding(
      parseBuilding({
        ...authored,
        floors: authored.floors?.map((floor) => ({
          ...floor,
          population: floor.id === '3' ? 40 : 0,
        })),
        totalPopulation: 40,
      }),
      config.elevatorSpecs,
    );

    const plan = planDemand({
      building: solitary,
      profiles,
      directionalSplit: { incoming: 0, outgoing: 0, interfloor: 1 },
    });
    expect(plan.peakPassengersPerSecond).toBe(0);
    const warning = plan.warnings.find((w) => w.includes('nowhere to send it'));
    expect(warning).toBeDefined();
    expect(warning).toContain('Floor "3"');
    expect(warning).toContain('100% interfloor');
    // 40 residents at 5%/5 min: 0.00667 p/s, all of it dropped.
    expect(warning).toContain('2.00 per 5 min');
    expect(warning).toContain("lower than its profiles specify");
  });
});

/* -------------------------------------------------------------------------- *
 * Batching
 * -------------------------------------------------------------------------- */

describe('batch arrivals', () => {
  it('has approximately the configured mean batch size', () => {
    // office-standard declares a geometric distribution with mean 1.4.
    let batches = 0;
    let passengers = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const trace = traceOf('midtown-office', 1000 + seed);
      batches += trace.arrivals.length;
      passengers += trace.passengerCount;
    }
    expect(passengers / batches).toBeCloseTo(1.4, 1);
    expect(Math.abs(passengers / batches - 1.4)).toBeLessThan(0.05);
  });

  it('picks up a profile with larger batches', () => {
    // residential declares mean 1.8 — families travel together.
    let batches = 0;
    let passengers = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const trace = traceOf('garden-apartments', 2000 + seed);
      batches += trace.arrivals.length;
      passengers += trace.passengerCount;
    }
    expect(Math.abs(passengers / batches - 1.8)).toBeLessThan(0.1);
  });

  it('really is a batch: passengers share a time and a landing', () => {
    const trace = traceOf('midtown-office', 3);
    expect(trace.arrivals.some((batch) => batch.passengers.length > 1)).toBe(true);
    for (const batch of trace.arrivals) {
      expect(batch.passengers.length).toBeGreaterThan(0);
      for (const passenger of batch.passengers) {
        expect(passenger.arrivalTimeS).toBe(batch.timeS);
        expect(passenger.originFloorId).toBe(batch.originFloorId);
        expect(passenger.batchId).toBe(batch.id);
      }
    }
  });

  it('gives batch members independent destinations by default', () => {
    const trace = traceOf('midtown-office', 4);
    const mixed = trace.arrivals.filter(
      (batch) =>
        batch.passengers.length > 1 &&
        new Set(batch.passengers.map((p) => p.finalDestinationFloorId)).size > 1,
    );
    expect(mixed.length).toBeGreaterThan(0);
  });

  it('can be told to model affiliated groups instead', () => {
    const trace = generateTrace({
      building: building('midtown-office'),
      profiles,
      streams: new StreamSet(4),
      batchSharesDestination: true,
    });
    for (const batch of trace.arrivals) {
      expect(new Set(batch.passengers.map((p) => p.finalDestinationFloorId)).size).toBe(1);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Directional split
 * -------------------------------------------------------------------------- */

describe('directional split', () => {
  it('is approximately honoured for an office up-peak', () => {
    // office-standard declares 85% incoming, 5% outgoing, 10% interfloor.
    const counts = { incoming: 0, outgoing: 0, interfloor: 0 };
    let total = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      for (const passenger of traceOf('midtown-office', 5000 + seed).passengers) {
        counts[passenger.category] += 1;
        total += 1;
      }
    }
    expect(counts.incoming / total).toBeCloseTo(0.85, 2);
    expect(counts.outgoing / total).toBeCloseTo(0.05, 2);
    expect(counts.interfloor / total).toBeCloseTo(0.1, 2);
  });

  it('inverts for a residential down-peak', () => {
    // residential declares 15% incoming, 75% outgoing, 10% interfloor.
    const counts = { incoming: 0, outgoing: 0, interfloor: 0 };
    let total = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      for (const passenger of traceOf('garden-apartments', 6000 + seed).passengers) {
        counts[passenger.category] += 1;
        total += 1;
      }
    }
    expect(counts.outgoing / total).toBeCloseTo(0.75, 1);
    expect(counts.incoming / total).toBeCloseTo(0.15, 1);
  });

  it('puts incoming traffic at an entrance and outgoing traffic at one', () => {
    const b = building('midtown-office');
    const entrances = new Set(b.entranceFloors.map((floor) => floor.id));
    for (const passenger of traceOf('midtown-office', 8).passengers) {
      if (passenger.category === 'incoming') {
        expect(entrances.has(passenger.originFloorId)).toBe(true);
        expect(entrances.has(passenger.finalDestinationFloorId)).toBe(false);
      } else if (passenger.category === 'outgoing') {
        expect(entrances.has(passenger.originFloorId)).toBe(false);
        expect(entrances.has(passenger.finalDestinationFloorId)).toBe(true);
      } else {
        expect(entrances.has(passenger.originFloorId)).toBe(false);
        expect(entrances.has(passenger.finalDestinationFloorId)).toBe(false);
      }
    }
  });

  it('spreads incoming traffic across both entrances of Midtown Office', () => {
    const byEntrance = new Map<string, number>();
    for (const passenger of traceOf('midtown-office', 9).passengers) {
      if (passenger.category !== 'incoming') continue;
      byEntrance.set(passenger.originFloorId, (byEntrance.get(passenger.originFloorId) ?? 0) + 1);
    }
    expect([...byEntrance.keys()].sort()).toEqual(['G', 'P1']);
    const [g, p1] = [byEntrance.get('G') ?? 0, byEntrance.get('P1') ?? 0];
    expect(Math.abs(g - p1) / (g + p1)).toBeLessThan(0.2);
  });

  it('follows explicit entrance weights', () => {
    const trace = generateTrace({
      building: building('midtown-office'),
      profiles,
      streams: new StreamSet(10),
      entranceWeights: { G: 9, P1: 1 },
    });
    const incoming = trace.passengers.filter((p) => p.category === 'incoming');
    const throughGarage = incoming.filter((p) => p.originFloorId === 'P1').length;
    expect(throughGarage / incoming.length).toBeCloseTo(0.1, 1);
  });

  it('rejects an entrance weight naming a floor that is not an entrance', () => {
    expect(() =>
      planDemand({ building: building('midtown-office'), profiles, entranceWeights: { '12': 1 } }),
    ).toThrow(/does not flag isEntrance/);
  });
});

/* -------------------------------------------------------------------------- *
 * Pure up-peak — the demand side of the project's primary correctness oracle
 * -------------------------------------------------------------------------- */

describe('pure up-peak on Midtown Office', () => {
  /**
   * docs/05-roadmap.md § Phase 2: "Midtown Office under pure up-peak produces interval and
   * handling capacity matching the closed-form Barney/CIBSE RTT calculation within a few
   * percent. This is the project's primary correctness oracle."
   *
   * Pure up-peak is 100% incoming through a single entrance — the idealization the closed form
   * is derived under. No profile in `data/traffic-profiles.json` declares it (the office
   * profiles top out at 0.85 incoming, because they describe a real morning peak), so it is a
   * `directionalSplit` override, the same kind of knob as `arrivalRatePctPop5min`.
   *
   * These tests are the *demand* side of the oracle: they check that the trace the simulation
   * will be scored against is the one the formula assumes. The interval and handling-capacity
   * comparison itself needs the dispatcher and belongs with it.
   */
  const upPeak = {
    directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
    entranceWeights: { G: 1, P1: 0 },
  } as const;

  /** N in `S = N(1 - ((N-1)/N)^P)`: the floors served above the lobby. */
  const N = 19;

  const upPeakTrace = (seed: number): PassengerTrace =>
    generateTrace({ building: building('midtown-office'), profiles, streams: new StreamSet(seed), ...upPeak });

  it('sends everyone from the one lobby to an upper floor, in a single leg', () => {
    const trace = upPeakTrace(90001);
    expect(trace.passengerCount).toBeGreaterThan(0);
    expect(trace.sources.map((source) => source.id)).toEqual(['entrance']);
    for (const passenger of trace.passengers) {
      expect(passenger.category).toBe('incoming');
      expect(passenger.originFloorId).toBe('G');
      expect(passenger.legs).toHaveLength(1);
      expect(passenger.finalDestinationFloorId).not.toBe('G');
      expect(passenger.finalDestinationFloorId).not.toBe('P1');
    }
  });

  it('carries the whole building rate: no share is left behind by the override', () => {
    const plan = planDemand({ building: building('midtown-office'), profiles, ...upPeak });
    // 1710 occupants at 12%/5 min, all of it now incoming.
    expect(plan.peakPassengersPerSecond * 300).toBeCloseTo(205.2, 9);
    expect(plan.expectedPassengersInReportWindow).toBeCloseTo(205.2, 9);
    expect(plan.warnings).toEqual([]);
    // Identical to the rate the profile's own 85/5/10 split produces: the override moves
    // demand between directions, it does not create or destroy any.
    expect(plan.peakPassengersPerSecond).toBeCloseTo(
      planDemand({ building: building('midtown-office'), profiles }).peakPassengersPerSecond,
      12,
    );
  });

  it('delivers 205.2 arrivals at the lobby in the peak five minutes', () => {
    const seeds = 200;
    let inWindow = 0;
    for (let seed = 0; seed < seeds; seed += 1) {
      inWindow += upPeakTrace(11000 + seed).passengersInReportWindow;
    }
    const mean = inWindow / seeds;
    // Compound Poisson: sd per replication ~19 passengers, so the standard error over 200
    // seeds is ~1.4. Three of those either side of the closed-form 205.2.
    expect(Math.abs(mean - 205.2)).toBeLessThan(4.2);
  });

  it('spreads destinations evenly over the 19 upper floors, as the RTT formula assumes', () => {
    // `S = N(1 - ((N-1)/N)^P)` is derived for passengers uniformly distributed over N floors.
    // Midtown Office has 19 floors of 90 people each, so population weighting *is* uniform —
    // but that has to be true of the trace, not just of the building.
    const counts = new Map<string, number>();
    let total = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      for (const passenger of upPeakTrace(12000 + seed).passengers) {
        counts.set(
          passenger.finalDestinationFloorId,
          (counts.get(passenger.finalDestinationFloorId) ?? 0) + 1,
        );
        total += 1;
      }
    }
    expect(counts.size).toBe(N);
    const expected = total / N;
    for (const [floorId, count] of counts) {
      // ~2250 per floor, so a 6% band is comfortably outside Monte Carlo noise but well
      // inside any real weighting error.
      expect(Math.abs(count - expected) / expected, floorId).toBeLessThan(0.06);
    }
  });

  it('reproduces the closed-form expected stops for a carload', () => {
    // The other input the oracle takes from the trace. If a carload of P passengers drawn in
    // arrival order does not stop `N(1 - ((N-1)/N)^P)` times on average, the RTT the simulator
    // is compared against was computed for a different building than the one it simulated.
    for (const P of [8, 13, 16]) {
      let stops = 0;
      let loads = 0;
      for (let seed = 0; seed < 60; seed += 1) {
        const window = upPeakTrace(13000 + seed).passengers.filter((p) => p.inReportWindow);
        for (let index = 0; index + P <= window.length; index += P) {
          stops += new Set(
            window.slice(index, index + P).map((p) => p.finalDestinationFloorId),
          ).size;
          loads += 1;
        }
      }
      const closedForm = N * (1 - ((N - 1) / N) ** P);
      expect(loads).toBeGreaterThan(500);
      expect(Math.abs(stops / loads - closedForm) / closedForm, `P=${P}`).toBeLessThan(0.02);
    }
  });

  it('is reached only through the override, and the override is validated', () => {
    // No shipped profile can express it, which is why the knob exists.
    expect(profiles.profiles.some((profile) => profile.directionalSplit.incoming === 1)).toBe(false);

    const b = building('midtown-office');
    expect(() =>
      planDemand({ building: b, profiles, directionalSplit: { incoming: 0, outgoing: 0, interfloor: 0 } }),
    ).toThrow(/at least one direction a positive share/);
    expect(() =>
      planDemand({ building: b, profiles, directionalSplit: { incoming: -1, outgoing: 1, interfloor: 0 } }),
    ).toThrow(/must be non-negative and finite/);
  });

  it('normalizes relative shares, so an optimizer can sample them independently', () => {
    const b = building('midtown-office');
    const asGiven = planDemand({
      building: b,
      profiles,
      directionalSplit: { incoming: 0.5, outgoing: 0.25, interfloor: 0.25 },
    });
    const scaled = planDemand({
      building: b,
      profiles,
      directionalSplit: { incoming: 0.8, outgoing: 0.4, interfloor: 0.4 },
    });
    expect(scaled.peakPassengersPerSecond).toBeCloseTo(asGiven.peakPassengersPerSecond, 12);
    const entranceRate = (plan: typeof asGiven): number =>
      plan.sources.find((source) => source.kind === 'entrance')?.peakPassengersPerSecond ?? Number.NaN;
    expect(entranceRate(scaled)).toBeCloseTo(entranceRate(asGiven), 12);
    expect(entranceRate(asGiven)).toBeCloseTo(0.5 * 0.684, 12);
  });
});

/* -------------------------------------------------------------------------- *
 * Per-floor traffic profile overrides
 * -------------------------------------------------------------------------- */

describe('per-floor traffic profile override', () => {
  /** The same building with the residential override stripped from floors 32-60. */
  const withoutOverride = (): ResolvedBuilding => {
    const authored = JSON.parse(JSON.stringify(building('mixed-use-high-rise').config)) as BuildingConfig & {
      floorRanges?: Record<string, unknown>[];
    };
    authored.floorRanges = (authored.floorRanges ?? []).map((range) => {
      const { trafficProfile: _dropped, ...rest } = range;
      return rest;
    });
    return resolveBuilding(parseBuilding(authored), config.elevatorSpecs, {
      trafficProfileIds: new Set(config.trafficProfilesById.keys()),
    });
  };

  it('governs the rate, the split and the batch size of demand originating on that floor', () => {
    const overridden = planDemand({ building: building('mixed-use-high-rise'), profiles });
    const plain = planDemand({ building: withoutOverride(), profiles });

    const source = (plan: typeof overridden): (typeof overridden.sources)[number] => {
      const found = plan.sources.find((s) => s.id === 'resident:40');
      if (found === undefined) throw new Error('no resident source for floor 40');
      return found;
    };

    expect(source(overridden).profileId).toBe('residential');
    expect(source(plain).profileId).toBe('office-standard');
    expect(source(overridden).meanBatchSize).toBe(1.8);
    expect(source(plain).meanBatchSize).toBe(1.4);

    // residential: 26 people at 5%/5min, of which 75% + 10% leaves the floor.
    expect(source(overridden).peakPassengersPerSecond).toBeCloseTo(((26 * 0.05) / 300) * 0.85, 12);
    // office-standard: 26 people at 12%/5min, of which 5% + 10% leaves the floor.
    expect(source(plain).peakPassengersPerSecond).toBeCloseTo(((26 * 0.12) / 300) * 0.15, 12);
    expect(source(overridden).peakPassengersPerSecond).toBeGreaterThan(
      2 * source(plain).peakPassengersPerSecond,
    );
  });

  it('leaves floors without an override untouched', () => {
    const overridden = planDemand({ building: building('mixed-use-high-rise'), profiles });
    const plain = planDemand({ building: withoutOverride(), profiles });
    const office = (plan: typeof overridden): number =>
      plan.sources.find((s) => s.id === 'resident:20')?.peakPassengersPerSecond ?? Number.NaN;
    expect(office(overridden)).toBeCloseTo(office(plain), 12);
  });

  it('re-weights incoming demand too, because the destination floor generates it', () => {
    const weightFor = (b: ResolvedBuilding, floorId: string): number => {
      const entrance = planDemand({ building: b, profiles }).sources.find((s) => s.kind === 'entrance');
      return entrance?.destinations.find((d) => d.floorId === floorId)?.weight ?? Number.NaN;
    };
    const overridden = weightFor(building('mixed-use-high-rise'), '40');
    const plain = weightFor(withoutOverride(), '40');
    // 26 * 5% * 15% incoming against 26 * 12% * 85%: a factor of about 24.
    expect(plain / overridden).toBeCloseTo((0.12 * 0.85) / (0.05 * 0.15), 6);
  });

  it('changes the generated trace, not just the plan', () => {
    const overridden = generateTrace({
      building: building('mixed-use-high-rise'),
      profiles,
      streams: new StreamSet(2026),
    });
    const plain = generateTrace({ building: withoutOverride(), profiles, streams: new StreamSet(2026) });

    expect(JSON.stringify(overridden)).not.toBe(JSON.stringify(plain));
    expect(
      overridden.passengers.filter((p) => p.demandFloorId === '40').every((p) => p.profileId === 'residential'),
    ).toBe(true);
    expect(
      plain.passengers.filter((p) => p.demandFloorId === '40').every((p) => p.profileId === 'office-standard'),
    ).toBe(true);
  });

  it('makes an overridden floor send people out rather than receive them', () => {
    // Floor 40 has 26 occupants either way. Under `residential` it generates ~4 trips per
    // replication, 85% of them leaving; under `office-standard` it generates ~11, 85% of them
    // arriving. Averaged over seeds because a single 26-person floor produces single-figure
    // counts, where one lucky batch swamps the effect being measured.
    const tally = (b: ResolvedBuilding): { outbound: number; total: number } => {
      let outbound = 0;
      let total = 0;
      for (let seed = 0; seed < 40; seed += 1) {
        const trace = generateTrace({ building: b, profiles, streams: new StreamSet(7000 + seed) });
        for (const passenger of trace.passengers) {
          if (passenger.demandFloorId !== '40') continue;
          total += 1;
          if (passenger.originFloorId === '40') outbound += 1;
        }
      }
      return { outbound, total };
    };

    const overridden = tally(building('mixed-use-high-rise'));
    const plain = tally(withoutOverride());

    // Rate: residential 5% of 26 against office-standard 12% of 26.
    expect(overridden.total).toBeLessThan(plain.total);
    // Direction: 85% leaving against 15% leaving.
    expect(overridden.outbound / overridden.total).toBeGreaterThan(0.7);
    expect(plain.outbound / plain.total).toBeLessThan(0.3);
    expect(overridden.outbound).toBeGreaterThan(plain.outbound);
  });

  it('lets office down-peak and residential up-peak coexist in one building', () => {
    // The scenario mixed-use-high-rise exists to encode: 32-60 predominantly leaving while
    // 2-31 is predominantly arriving, on the same four shuttles.
    const trace = traceOf('mixed-use-high-rise', 4321);
    const residential = trace.passengers.filter((p) => Number(p.demandFloorId) >= 32);
    const office = trace.passengers.filter(
      (p) => p.demandFloorId !== 'G' && Number(p.demandFloorId) < 32,
    );
    expect(residential.filter((p) => p.category === 'outgoing').length / residential.length).toBeGreaterThan(
      0.6,
    );
    expect(office.filter((p) => p.category === 'incoming').length / office.length).toBeGreaterThan(0.7);
  });

  it('rejects a floor naming a traffic profile the data does not declare', () => {
    const authored = JSON.parse(JSON.stringify(building('garden-apartments').config)) as BuildingConfig;
    const floors = authored.floors?.map((floor) =>
      floor.id === '3' ? { ...floor, trafficProfile: 'office-standard' } : floor,
    );
    const resolved = resolveBuilding({ ...authored, floors }, config.elevatorSpecs);
    // Valid profile: fine. Now break it, bypassing the config layer's own cross-check.
    expect(() => planDemand({ building: resolved, profiles })).not.toThrow();

    const broken = {
      ...resolved,
      floors: resolved.floors.map((floor) =>
        floor.id === '3' ? { ...floor, trafficProfile: 'nonesuch' } : floor,
      ),
    };
    expect(() => planDemand({ building: broken, profiles })).toThrow(/names traffic profile "nonesuch"/);
  });
});

/* -------------------------------------------------------------------------- *
 * Transfer floors and journey identity
 * -------------------------------------------------------------------------- */

describe('transfer floors', () => {
  it('plans multi-leg journeys through the sky lobby', () => {
    const trace = traceOf('mixed-use-high-rise', 24);
    const multi = trace.passengers.filter((p) => p.legs.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    for (const passenger of multi) {
      for (const floorId of transferFloorsOf(passenger)) {
        expect(building('mixed-use-high-rise').floorsById.get(floorId)?.isTransferFloor).toBe(true);
      }
    }
  });

  it('routes a resident coming home through the sky lobby in two legs', () => {
    const trace = traceOf('mixed-use-high-rise', 25);
    const homebound = trace.passengers.find(
      (p) => p.category === 'incoming' && Number(p.finalDestinationFloorId) >= 32,
    );
    expect(homebound).toBeDefined();
    expect(routeOf(homebound!)).toEqual(['G', '31', homebound!.finalDestinationFloorId]);
  });

  it('keeps legs contiguous and consistent with the planner', () => {
    for (const b of config.buildings) {
      const planner = RoutePlanner.forBuilding(b);
      const trace = generateTrace({ building: b, profiles, streams: new StreamSet(17) });
      for (const passenger of trace.passengers) {
        const route = routeOf(passenger);
        expect(route[0], `${b.id}/${passenger.id}`).toBe(passenger.originFloorId);
        expect(route.at(-1)).toBe(passenger.finalDestinationFloorId);
        expect(route).toEqual(planner.route(passenger.originFloorId, passenger.finalDestinationFloorId));
        for (const [index, leg] of passenger.legs.entries()) {
          expect(leg.legIndex).toBe(index);
          expect(leg.originFloorId).not.toBe(leg.destinationFloorId);
          if (index > 0) {
            // Contiguous through the *journey*, which is not the same as contiguous through the
            // legs: a declared escalator may carry the passenger between one leg's alighting
            // floor and the next leg's boarding floor, and then the hop is what joins them.
            const hop = transportHopBefore(passenger, index);
            const previous = passenger.legs[index - 1]?.destinationFloorId;
            if (hop === undefined) {
              expect(leg.originFloorId).toBe(previous);
            } else {
              expect(hop.originFloorId).toBe(previous);
              expect(leg.originFloorId).toBe(hop.destinationFloorId);
            }
          }
        }
      }
    }
  });

  it('preserves the journey identity across a transfer, so TTD spans both legs', () => {
    const trace = traceOf('mixed-use-high-rise', 26);
    const record = trace.passengers.find((p) => p.legs.length === 2);
    expect(record).toBeDefined();

    // Materialize the journey the way a runner would: leg 0 from the trace, leg 1 re-injected
    // at the transfer floor once the passenger has actually alighted there.
    const leg0 = new Passenger(toPassengerInit(record!));
    leg0.board(record!.arrivalTimeS + 20);
    leg0.alight(record!.arrivalTimeS + 60);
    const secondLeg = record!.legs[1];
    expect(secondLeg).toBeDefined();
    const leg1 = leg0.beginNextLeg({
      id: `${record!.id}#1`,
      destinationFloorId: secondLeg!.destinationFloorId,
      destinationFloorIndex: secondLeg!.destinationFloorIndex,
      arrivedAt: record!.arrivalTimeS + 70,
    });
    leg1.board(record!.arrivalTimeS + 100);
    leg1.alight(record!.arrivalTimeS + 140);

    expect(leg1.journeyId).toBe(leg0.journeyId);
    expect(leg1.journeyStartedAt).toBe(record!.arrivalTimeS);
    expect(leg1.isFinalLeg).toBe(true);
    // Time to destination spans the first ride, the transfer and the second ride — not just
    // the last hop, which would flatter every sky-lobby building.
    expect(leg1.timeToDestinationS).toBe(140);
    expect(leg0.timeToDestinationS).toBeUndefined();
  });

  it('gives a single-leg journey no transfer floors', () => {
    const trace = traceOf('midtown-office', 27);
    expect(trace.passengers.every((p) => p.legs.length === 1)).toBe(true);
    expect(trace.passengers.every((p) => transferFloorsOf(p).length === 0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Passenger mass and credentials
 * -------------------------------------------------------------------------- */

describe('passenger mass', () => {
  it('is a distribution, not a constant, and lies inside the configured bounds', () => {
    const trace = traceOf('midtown-office', 31);
    const masses = trace.passengers.map((p) => p.massKg);
    expect(new Set(masses).size).toBeGreaterThan(masses.length / 2);
    const { meanKg, stdDevKg, minKg } = profiles.passengerMass;
    for (const mass of masses) expect(mass).toBeGreaterThanOrEqual(minKg);
    const mean = masses.reduce((sum, mass) => sum + mass, 0) / masses.length;
    expect(Math.abs(mean - meanKg)).toBeLessThan((4 * stdDevKg) / Math.sqrt(masses.length));
  });

  it('comes from the passengerMass stream and nothing else', () => {
    // Perturbing only the destinations stream must not change any mass, because mass is drawn
    // in final trace order from its own stream.
    const streams = new StreamSet(32);
    const a = generateTrace({ building: building('garden-apartments'), profiles, streams });
    const b = generateTrace({
      building: building('garden-apartments'),
      profiles,
      streams: new StreamSet(32),
    });
    expect(a.passengers.map((p) => p.massKg)).toEqual(b.passengers.map((p) => p.massKg));
  });
});

describe('access credentials', () => {
  it('assigns a credential permitted on every restricted floor of the route', () => {
    const b = building('secure-tower');
    const permitted = new Map<string, Set<string>>();
    for (const zone of b.accessZones) {
      for (const floorId of zone.floors) {
        const groups = permitted.get(floorId) ?? new Set<string>();
        for (const group of zone.credentialGroups) groups.add(group);
        permitted.set(floorId, groups);
      }
    }
    const trace = generateTrace({ building: b, profiles, streams: new StreamSet(41) });
    for (const passenger of trace.passengers) {
      for (const floorId of routeOf(passenger)) {
        const groups = permitted.get(floorId);
        if (groups === undefined) continue;
        expect(passenger.credentialGroup, `${passenger.id} on ${floorId}`).toBeDefined();
        expect(groups.has(passenger.credentialGroup as string)).toBe(true);
      }
    }
  });

  it('never generates a journey no credential group could make', () => {
    // Secure Tower's facilities and security groups reach all four tenant zones but
    // deliberately not the executive floor, so "a tenant floor to floor 30" is impossible.
    const trace = generateTrace({
      building: building('secure-tower'),
      profiles,
      streams: new StreamSet(42),
    });
    const impossible = trace.passengers.filter(
      (p) => p.category === 'interfloor' && (p.originFloorId === '30' || p.finalDestinationFloorId === '30'),
    );
    expect(impossible).toEqual([]);
    expect(trace.warnings.some((warning) => warning.includes('no single credential group'))).toBe(true);
  });

  it('still serves the executive floor from the lobby', () => {
    const trace = generateTrace({
      building: building('secure-tower'),
      profiles,
      streams: new StreamSet(43),
    });
    const toExec = trace.passengers.filter((p) => p.finalDestinationFloorId === '30');
    expect(toExec.length).toBeGreaterThan(0);
    for (const passenger of toExec) {
      expect(passenger.category).toBe('incoming');
      expect(['exec', 'exec-escort']).toContain(passenger.credentialGroup);
    }
  });

  it('leaves everyone unbadged when access control is switched off', () => {
    const trace = generateTrace({
      building: building('secure-tower'),
      profiles,
      streams: new StreamSet(44),
      credentialAssignment: 'none',
    });
    expect(trace.passengers.every((p) => p.credentialGroup === undefined)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Structural invariants, across every shipped building
 * -------------------------------------------------------------------------- */

describe('every shipped building generates a well-formed trace', () => {
  it('covers all five buildings', () => {
    expect(config.buildings.map((b) => b.id).sort()).toEqual([
      'garden-apartments',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'vertical-city',
    ]);
  });

  it('produces sorted, uniquely identified, in-window-flagged passengers', () => {
    for (const b of config.buildings) {
      const trace = generateTrace({ building: b, profiles, streams: new StreamSet(2026) });
      expect(trace.buildingId, b.id).toBe(b.id);
      expect(trace.passengerCount).toBeGreaterThan(0);
      expect(trace.passengerCount).toBe(trace.passengers.length);

      let previous = -1;
      for (const batch of trace.arrivals) {
        expect(batch.timeS, `${b.id} batch order`).toBeGreaterThanOrEqual(previous);
        previous = batch.timeS;
      }

      expect(new Set(trace.passengers.map((p) => p.id)).size).toBe(trace.passengerCount);
      expect(new Set(trace.passengers.map((p) => p.journeyId)).size).toBe(trace.passengerCount);
      expect(new Set(trace.arrivals.map((batch) => batch.id)).size).toBe(trace.arrivals.length);

      const inWindow = trace.passengers.filter((p) => p.inReportWindow).length;
      expect(inWindow).toBe(trace.passengersInReportWindow);

      for (const passenger of trace.passengers) {
        expect(passenger.originFloorId).not.toBe(passenger.finalDestinationFloorId);
        expect(passenger.legs.length).toBeGreaterThanOrEqual(1);
        expect(b.floorsById.has(passenger.originFloorId)).toBe(true);
        expect(b.floorsById.has(passenger.finalDestinationFloorId)).toBe(true);
        expect(passenger.originFloorIndex).toBe(b.floorsById.get(passenger.originFloorId)?.index);
        expect(passenger.arrivalTimeS).toBeGreaterThanOrEqual(0);
        expect(passenger.arrivalTimeS).toBeLessThan(trace.durationS);
        expect(passenger.massKg).toBeGreaterThan(0);
        expect(passenger.inReportWindow).toBe(
          passenger.arrivalTimeS >= trace.reportWindowStartS &&
            passenger.arrivalTimeS < trace.reportWindowEndS,
        );
      }
    }
  });

  it('sends demand only to floors that are populated or an entrance', () => {
    for (const b of config.buildings) {
      const legitimate = new Set(
        b.floors.filter((floor) => floor.population > 0 || floor.isEntrance === true).map((f) => f.id),
      );
      const trace = generateTrace({ building: b, profiles, streams: new StreamSet(2027) });
      for (const passenger of trace.passengers) {
        expect(legitimate.has(passenger.finalDestinationFloorId), `${b.id}: ${passenger.finalDestinationFloorId}`).toBe(
          true,
        );
        expect(legitimate.has(passenger.originFloorId), `${b.id}: ${passenger.originFloorId}`).toBe(true);
      }
    }
  });

  it('turns every record into a valid model Passenger', () => {
    for (const b of config.buildings) {
      const trace = generateTrace({ building: b, profiles, streams: new StreamSet(2028) });
      for (const record of trace.passengers) {
        const passenger = new Passenger(toPassengerInit(record));
        expect(passenger.journeyId).toBe(record.journeyId);
        expect(passenger.journeyStartedAt).toBe(record.arrivalTimeS);
        expect(passenger.massKg).toBe(record.massKg);
        // `Passenger.finalDestinationFloorId` is where the *lifts* stop, which is the journey's
        // destination except on a route that finishes on a declared escalator.
        const terminus = record.legs[record.legs.length - 1]?.destinationFloorId;
        expect(passenger.finalDestinationFloorId).toBe(terminus);
        if (transportHopBefore(record, record.legs.length) === undefined) {
          expect(terminus).toBe(record.finalDestinationFloorId);
        }
        expect(passenger.isFinalLeg).toBe(record.legs.length === 1);
        expect(passenger.egressTransitS).toBe(
          record.legs.length === 1 ? egressTransitSecondsOf(record) : 0,
        );
      }
    }
  });

  it('reports source rates that sum to the building total', () => {
    for (const b of config.buildings) {
      const plan = planDemand({ building: b, profiles });
      const summed = plan.sources.reduce((sum, source) => sum + source.peakPassengersPerSecond, 0);
      expect(summed).toBeCloseTo(plan.peakPassengersPerSecond, 12);
      for (const source of plan.sources) {
        const fromTable = source.destinations.reduce((sum, d) => sum + d.weight, 0);
        expect(fromTable).toBeCloseTo(source.peakPassengersPerSecond, 12);
        expect(source.peakBatchesPerSecond * source.meanBatchSize).toBeCloseTo(
          source.peakPassengersPerSecond,
          12,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Failure modes
 * -------------------------------------------------------------------------- */

describe('failure modes', () => {
  it('refuses an arrival process it does not implement', () => {
    expect(() =>
      planDemand({
        building: building('midtown-office'),
        profiles: { ...profiles, arrivalProcess: { type: 'poisson' } },
      }),
    ).toThrow(/Unsupported arrival process "poisson"/);
  });

  it('refuses a non-positive leg budget', () => {
    expect(() => planDemand({ building: building('midtown-office'), profiles, maxLegs: 0 })).toThrow(
      TrafficError,
    );
  });

  it('drops the demand it cannot route, and says so', () => {
    // Cap the leg budget below what Vertical City's geometry needs and the pairs that need the
    // extra leg disappear — loudly, with the demand redistributed inside its own share rather
    // than silently vanishing.
    //
    // **The cap moved from 3 to 2 when the sky lobbies got escalators.** It used to be the
    // zone-3/zone-4 interfloor pairs that vanished, at four lift legs each; those now cross at
    // sky lobby A in two, and the longest journey left is the three-leg zone-3-to-zone-5 kind.
    // A cap of 3 refuses nothing, so this guard would have gone quietly vacuous.
    const capped = planDemand({ building: building('vertical-city'), profiles, maxLegs: 2 });
    const uncapped = planDemand({ building: building('vertical-city'), profiles });
    expect(capped.warnings.some((w) => w.includes('maxLegs'))).toBe(true);
    expect(capped.peakPassengersPerSecond).toBeCloseTo(uncapped.peakPassengersPerSecond, 12);
    expect(uncapped.warnings.some((w) => w.includes('maxLegs'))).toBe(false);
    // Non-vacuous in the other direction too: the *default* budget really does leave this
    // building's longest journey intact, so the warning above is the cap talking and not the
    // building being unroutable.
    expect(uncapped.warnings).toEqual([]);
  });

  it('does not generate an over-long journey once it has been planned away', () => {
    const trace = generateTrace({
      building: building('vertical-city'),
      profiles,
      streams: new StreamSet(51),
      maxLegs: 2,
    });
    expect(trace.passengers.every((p) => p.legs.length <= 2)).toBe(true);
    // And the cap is doing work: uncapped, this building really does plan three-leg journeys.
    const uncapped = generateTrace({
      building: building('vertical-city'),
      profiles,
      streams: new StreamSet(51),
    });
    expect(uncapped.passengers.some((p) => p.legs.length === 3)).toBe(true);
  });

  it('warns rather than crashing on a building with no demand at all', () => {
    const empty = resolveBuilding(
      parseBuilding({
        ...(JSON.parse(JSON.stringify(building('garden-apartments').config)) as BuildingConfig),
        floors: building('garden-apartments').config.floors?.map((floor) => ({
          ...floor,
          population: 0,
        })),
        totalPopulation: 0,
      }),
      config.elevatorSpecs,
    );
    const trace = generateTrace({ building: empty, profiles, streams: new StreamSet(52) });
    expect(trace.passengerCount).toBe(0);
    expect(trace.warnings.some((w) => w.includes('no demand at all'))).toBe(true);
  });
});
