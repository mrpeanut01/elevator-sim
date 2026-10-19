/**
 * **The two shipped-run measurements behind `DECISIONS.md` § D1591, as runs rather than as prose.**
 *
 * § D1591 fixed one path by which a stationary car is left pointing at a call that no longer exists
 * (`Car.withdrawHallCall`, used by `Simulation.#withdrawCall`) and held the same gap in
 * `Car.releaseHallCall`, because closing it there would re-point cars in shipped runs. Both halves of
 * that decision rest on a count over shipped runs, and CLAUDE.md's rule is that a published number
 * is pinned to the run that produced it. These are those runs.
 *
 * - **The fix moves no shipped run.** Ten shipped buildings, every shipped profile, two seeds, a
 *   900 s horizon and the demand template's own (bar `vertical-city`'s, the costliest), each run
 *   with `withdrawHallCall` and again with the old release swapped back onto the prototype, compared
 *   on the legs. `sim/serviceRange.test.ts` holds six of these comparisons on every run; this holds
 *   all of them.
 * - **The gap it leaves is real.** Seven shipped buildings, seven profiles, three seeds, 900 s:
 *   every time `releaseHallCall` or `releaseAllHallCalls` hands a call back from a car that is
 *   standing still, the car's direction is read. It is **stale** when it is set and no committed stop
 *   lies ahead in it (a re-settle would change it), and it points **at nothing** when the car has no
 *   committed stop at all. Each stale release is attributed to the `Simulation` method that made it,
 *   read off the stack, because the held decision is argued per path.
 *
 * Opt-in, behind the deep fuzz tier's own switch (`ELEVATOR_SIM_FUZZ=deep`), so the always-on suite
 * pays nothing for them:
 *
 * ```bash
 * ELEVATOR_SIM_FUZZ=deep npx vitest run --project experiments packages/experiments/src/fuzz/releaseDirection.test.ts
 * ```
 *
 * Both swap a method on `Car.prototype` for the length of one run and restore it in a `finally`, the
 * shape `core/src/sim/serviceRange.test.ts` uses for the same comparison.
 */

import { Simulation, loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { deepCampaignRequested } from './campaign.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  if (!deepCampaignRequested()) return;
  config = await loadConfig(DATA_DIR);
}, 60_000);

/** The prototype every car of a run shares, reached through a car rather than by importing `Car`. */
interface CarPrototype {
  withdrawHallCall: (...args: unknown[]) => unknown;
  releaseHallCall: (...args: unknown[]) => unknown;
  releaseAllHallCalls: (...args: unknown[]) => unknown;
}

/** A releasing car's state, as the probe reads it. Public getters only. */
interface ReleasingCar {
  readonly isMoving: boolean;
  readonly direction: 'up' | 'down' | undefined;
  readonly floorIndex: number;
  committedStops(): readonly { readonly floorIndex: number }[];
}

function simulationFor(buildingId: string, profileId: string, seed: number, durationS: number | undefined): Simulation {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined || dispatcherProfile === undefined) throw new Error(`${buildingId}/${profileId} is not shipped`);
  const runConfig: SimulationConfig = {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
    seed,
    ...(durationS === undefined ? {} : { durationS }),
    onTimeout: 'report',
  };
  return new Simulation(runConfig);
}

function prototypeOf(sim: Simulation): CarPrototype {
  const car = sim.building.banks[0]?.cars[0];
  if (car === undefined) throw new Error('the bank has no car');
  return Object.getPrototypeOf(car) as CarPrototype;
}

describe.skipIf(!deepCampaignRequested())('§ D1591, measured on shipped runs', () => {
  it('re-pointing a car on a withdrawal moves no shipped run: 494 runs, identical legs with and without it', () => {
    const buildings = [
      'ashgate',
      'chancery-house',
      'crown-hotel',
      'garden-apartments',
      'harbour-point',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'st-jude-hospital',
      'vertical-city',
    ];
    const profiles = config.dispatcherProfiles.profiles.map((profile) => profile.id);
    let runs = 0;
    const differing: string[] = [];
    for (const buildingId of buildings) {
      for (const profileId of profiles) {
        for (const seed of [11, 12]) {
          for (const durationS of [900, undefined]) {
            if (buildingId === 'vertical-city' && durationS === undefined) continue;
            const legsOf = (old: boolean): string => {
              const sim = simulationFor(buildingId, profileId, seed, durationS);
              const proto = prototypeOf(sim);
              const fixed = proto.withdrawHallCall;
              if (old) proto.withdrawHallCall = proto.releaseHallCall;
              try {
                const result = sim.run();
                return `${JSON.stringify(result.record.passengers)}|${result.status}`;
              } finally {
                proto.withdrawHallCall = fixed;
              }
            };
            runs += 1;
            if (legsOf(true) !== legsOf(false)) differing.push(`${buildingId}/${profileId}/${String(seed)}/${String(durationS)}`);
          }
        }
      }
    }
    console.log(`\n§ D1591 A/B: ${String(runs)} shipped runs, ${String(differing.length)} differ on the legs\n`);
    expect(profiles).toHaveLength(13);
    expect(runs).toBe(494);
    expect(differing).toEqual([]);
  }, 3_600_000);

  it('releaseHallCall leaves a stationary car pointing past its work 88 times in 147 shipped runs, 7 at nothing', () => {
    const buildings = [
      'garden-apartments',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'chancery-house',
      'crown-hotel',
      'st-jude-hospital',
    ];
    const profiles = ['collective', 'eta', 'nearest-car', 'fairness-first', 'destination-panel', 'zoned-uppeak', 'auction'];
    let runs = 0;
    let stale = 0;
    let atNothing = 0;
    const byPath: Record<string, number> = {};

    /** Which `Simulation` path released the call: the first two private frames below the release. */
    const pathOf = (stack: string): string => {
      const frames = stack
        .split('\n')
        .slice(2)
        .map((line) => /#(\w+)/u.exec(line)?.[1])
        .filter((name): name is string => name !== undefined);
      const [caller, callersCaller] = frames;
      if (caller === 'reofferCall') return 're-offer';
      if (caller === 'completeCall') return 'completion';
      if (caller === 'applyDecision' && callersCaller === 'reassignOnLoad') return 'reassignment on load';
      if (caller === 'applyDecision' && callersCaller === 'dispatchBank') return 'dispatch decision';
      return `other: ${String(caller)} < ${String(callersCaller)}`;
    };

    for (const buildingId of buildings) {
      for (const profileId of profiles) {
        for (const seed of [1, 2, 3]) {
          const sim = simulationFor(buildingId, profileId, seed, 900);
          const proto = prototypeOf(sim);
          const release = proto.releaseHallCall;
          const releaseAll = proto.releaseAllHallCalls;
          const read = (car: ReleasingCar, released: boolean, stack: string): void => {
            if (!released || car.isMoving || car.direction === undefined) return;
            const sign = car.direction === 'up' ? 1 : -1;
            const stops = car.committedStops();
            if (stops.some((stop) => sign * (stop.floorIndex - car.floorIndex) > 0)) return;
            stale += 1;
            if (stops.length === 0) atNothing += 1;
            const path = pathOf(stack);
            byPath[path] = (byPath[path] ?? 0) + 1;
          };
          proto.releaseHallCall = function (this: ReleasingCar, ...args: unknown[]): unknown {
            const out = release.apply(this, args);
            read(this, out === true, new Error().stack ?? '');
            return out;
          };
          proto.releaseAllHallCalls = function (this: ReleasingCar, ...args: unknown[]): unknown {
            const out = releaseAll.apply(this, args);
            read(this, Array.isArray(out) && out.length > 0, new Error().stack ?? '');
            return out;
          };
          try {
            sim.run();
          } finally {
            proto.releaseHallCall = release;
            proto.releaseAllHallCalls = releaseAll;
          }
          runs += 1;
        }
      }
    }
    console.log(
      `\n§ D1591 held gap: ${String(runs)} shipped runs, ${String(stale)} stale releases, ${String(atNothing)} at nothing, by path ${JSON.stringify(byPath)}\n`,
    );
    expect(runs).toBe(147);
    expect(stale).toBe(88);
    expect(atNothing).toBe(7);
    expect(byPath).toEqual({
      'reassignment on load': 28,
      're-offer': 32,
      'dispatch decision': 18,
      completion: 10,
    });
  }, 3_600_000);
});
