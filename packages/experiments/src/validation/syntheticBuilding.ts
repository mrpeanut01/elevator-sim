/**
 * Parametric buildings, built through the real schema.
 *
 * Two Phase 8 tracks need configurations `data/` does not ship: the scale track needs a
 * 100-floor building and a grid of (floors × cars) points to fit a curve through, and the
 * adversarial track needs corners nobody would author — one car, one bank, no interfloor demand
 * at all.
 *
 * ## Through `parseBuilding`, always
 *
 * Every building this module produces goes out as a `BuildingConfig` and is resolved with
 * `resolveBuilding`, which is the same `buildingConfigSchema` and the same cross-reference pass
 * `loadConfig` applies to `data/buildings/*.json`. `fuzz/generate.ts` states the reason and it is
 * worth repeating: a generator that emits configurations the loader would reject is testing the
 * validator, not the simulator. So the constructor here can produce nothing the repository could
 * not also have on disk — which is exactly what makes the *unreachable* cases in
 * `adversarial.test.ts` unreachable. A service mode cannot be set here because
 * `carConfigSchema` has no field for one, and this module is not permitted to route around that.
 *
 * ## Why not reuse `fuzz/generate.ts`
 *
 * That module generates buildings from a *seed*, which is right for random search and wrong for
 * both callers here. A scaling curve needs the floor count to be the only thing that moves
 * between two points, and an adversarial corner needs to be the corner rather than a draw that
 * happens to land near it. The two modules answer different questions with the same schema.
 */

import {
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type BuildingType,
  type ElevatorSpecs,
  type ResolvedBuilding,
} from '@elevator-sim/core';

/** How to shape a synthetic building. Every field has an explicit default; nothing is random. */
export interface SyntheticBuildingSpec {
  readonly id: string;
  /** Floors above the lobby. The building has `floors + 1` levels including the lobby. */
  readonly floors: number;
  /** Cars in each bank. */
  readonly carsPerBank: number;
  /** Banks, each serving the lobby plus a contiguous slice of the upper floors. Default 1. */
  readonly banks?: number;
  /** Occupants per upper floor. Default 60. */
  readonly populationPerFloor?: number;
  /** Floor-to-floor pitch, metres. Default 3.8 — Midtown Office's. */
  readonly pitchM?: number;
  /** Elevator class from `data/elevator-specs.json`. Default `gearless-traction`. */
  readonly spec?: string;
  readonly type?: BuildingType;
  readonly trafficProfile?: string;
}

/**
 * A building config of the requested shape.
 *
 * Banks each serve the lobby and a contiguous slice of the upper floors, so a multi-bank building
 * is connected through the lobby by construction and `RoutePlanner.requireRoute` has a route for
 * every pair. Floor indices run `0` (lobby, the only entrance) then `2 …`, skipping 1 the way
 * every shipped building does.
 */
export function syntheticBuildingConfig(spec: SyntheticBuildingSpec): BuildingConfig {
  const pitchM = spec.pitchM ?? 3.8;
  const population = spec.populationPerFloor ?? 60;
  const banks = spec.banks ?? 1;
  const elevatorSpec = spec.spec ?? 'gearless-traction';

  if (spec.floors < 1) throw new Error('a synthetic building needs at least one upper floor');
  if (banks > spec.floors) {
    throw new Error(`${String(banks)} banks cannot each take a slice of ${String(spec.floors)} floors`);
  }

  const upper = Array.from({ length: spec.floors }, (_unused, index) => {
    const level = index + 2;
    return {
      id: String(level),
      index: level,
      heightM: Number(((index + 1) * pitchM).toFixed(4)),
      population,
    };
  });

  const perBank = Math.ceil(spec.floors / banks);
  const bankConfigs = Array.from({ length: banks }, (_unused, bankIndex) => {
    const slice = upper.slice(bankIndex * perBank, (bankIndex + 1) * perBank);
    return {
      id: `bank-${String(bankIndex + 1)}`,
      name: `Bank ${String(bankIndex + 1)}`,
      servesFloors: ['G', ...slice.map((floor) => floor.id)],
      cars: Array.from({ length: spec.carsPerBank }, (_ignored, carIndex) => ({
        id: `${String(bankIndex + 1)}-${String(carIndex + 1)}`,
        spec: elevatorSpec,
      })),
    };
  }).filter((bank) => bank.servesFloors.length > 1);

  const config = {
    $comment: `Synthetic: ${String(spec.floors)} upper floors, ${String(banks)} bank(s) of ${String(spec.carsPerBank)}. Built by validation/syntheticBuilding.ts for the Phase 8 scale and adversarial tracks; not a reference building and not in data/.`,
    id: spec.id,
    name: spec.id,
    type: spec.type ?? 'office',
    trafficProfile: spec.trafficProfile ?? 'office-standard',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, label: 'Lobby' },
      ...upper,
    ],
    totalPopulation: spec.floors * population,
    banks: bankConfigs,
    accessZones: [],
  };

  return parseBuilding(config, `${spec.id}.synthetic.json`);
}

/** {@link syntheticBuildingConfig}, resolved against the real elevator specs. */
export function syntheticBuilding(
  spec: SyntheticBuildingSpec,
  specs: ElevatorSpecs,
  trafficProfileIds: Iterable<string>,
): ResolvedBuilding {
  return resolveBuilding(syntheticBuildingConfig(spec), specs, {
    file: `${spec.id}.synthetic.json`,
    trafficProfileIds: new Set(trafficProfileIds),
  });
}
