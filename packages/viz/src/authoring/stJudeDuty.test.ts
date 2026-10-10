/**
 * **St Jude's bed lift makes the player's duty dial live there, and nowhere else** — GitHub issue
 * #561, [§ D1290](../../../../DECISIONS.md), wave AN lane AP-1.
 *
 * `dutyMismatch` was dead two ways: no building declared a duty, and no profile weighted the term.
 * The decision swarm ruled one half: car E of `st-jude-hospital` declares a bed duty, drafted for the
 * owner's approval, and no shipped profile weights the term. So the run a player meets under any
 * shipped dispatcher is the one they met before, and the weight a player gives the term on their own
 * copy now reaches a run there. This file holds the three claims the ruling names, compared on the
 * legs as `CLAUDE.md`'s standing requirement asks:
 *
 * 1. **The refusal is the building's.** `inertTerms` and `dimensionIdsLiveOn` speak on every shipped
 *    building that declares no duty, and not on St Jude. The predicate did not change; the data did.
 * 2. **The declaration alone moves nothing.** Under an unweighted dispatcher, St Jude as shipped and
 *    St Jude with the declaration stripped (the tree before this commit) record the same run, byte
 *    for byte.
 * 3. **The declaration and a weight move the legs**, on every seed tried, and the same weight on the
 *    stripped building moves nothing, which is the "before" half: the dial was refused there and a
 *    weighted run equalled the baseline.
 *
 * Which way the wait moves is not asserted, and no claim is made that the weighted term is better:
 * the issue's own five seeds moved the mean wait both ways, and this repository orders two
 * dispatchers only on a paired-t interval at 50 to 200 replications.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildingDeclaresDuty,
  loadConfig,
  type DispatcherProfile,
  type LoadedConfig,
  type ResolvedBuilding,
  type SimulationConfig,
} from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { dimensionIdsLiveOn, inertTerms, profileFromSpec, specFromProfile } from './dispatcherSpec.js';

/** The issue's own measurement window: St Jude at its authored demand for half an hour. */
const DURATION_S = 1800;
const SEEDS: readonly bigint[] = [1n, 2n, 3n, 4n, 5n];

let config: LoadedConfig;
let stJude: ResolvedBuilding;
let collective: DispatcherProfile;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  stJude = requireBuilding(config, 'st-jude-hospital');
  const found = config.dispatcherProfilesById.get('collective');
  if (found === undefined) throw new Error('no profile "collective"');
  collective = found;
}, 120_000);

/** St Jude as it was before the declaration: every car's duty removed. */
function undeclared(building: ResolvedBuilding): ResolvedBuilding {
  return {
    ...building,
    banks: building.banks.map((bank) => ({
      ...bank,
      cars: bank.cars.map((car) => {
        if (car.duty === undefined) return car;
        const { duty: _declared, ...rest } = car;
        return rest;
      }),
    })),
  };
}

/** `collective` as the editor writes it back with the duty term weighted at `position` of 100. */
function weighted(position: number): DispatcherProfile {
  const spec = specFromProfile(collective, 'My dispatcher');
  return profileFromSpec(
    { ...spec, weights: { ...spec.weights, dutyMismatch: position } },
    { id: 'my-dispatcher', base: collective },
  );
}

function runOf(building: ResolvedBuilding, profile: DispatcherProfile, seed: bigint) {
  const run: SimulationConfig = {
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
    seed,
    durationS: DURATION_S,
    onTimeout: 'report',
  };
  return recordRun(run, { recordDecisions: false }).recording;
}

function legsOf(recording: ReturnType<typeof runOf>): string {
  return JSON.stringify(
    recording.legs.map((leg) => [leg.passengerId, leg.carId ?? null, leg.boardedAt ?? null, leg.alightedAt ?? null]),
  );
}

describe('the duty refusal is the building’s, and St Jude no longer earns it — #561', () => {
  it('declares exactly one duty in data/, on St Jude’s car E', () => {
    const declaring = [...config.buildingsById.values()].filter((building) => buildingDeclaresDuty(building));
    expect(declaring.map((building) => building.id)).toEqual(['st-jude-hospital']);
    const cars = stJude.banks.flatMap((bank) =>
      bank.cars.filter((car) => car.duty !== undefined).map((car) => `${car.id}:${String(car.duty)}`),
    );
    expect(cars).toEqual(['E:bed']);
    /* Drafted for approval, and it says so where the figure lives. */
    const authored = JSON.parse(readFileSync(join(DATA_DIR, 'buildings', 'st-jude-hospital.json'), 'utf8')) as {
      readonly banks: readonly { readonly cars: readonly { readonly id: string; readonly $comment?: string }[] }[];
    };
    const comment = authored.banks.flatMap((bank) => bank.cars).find((car) => car.id === 'E')?.$comment ?? '';
    expect(comment).toContain("AN AGENT'S PROPOSAL");
  });

  it('refuses the weighted term on every shipped building that declares no duty, and not on St Jude', () => {
    const spec = specFromProfile(collective, 'x');
    const weightedSpec = { ...spec, weights: { ...spec.weights, dutyMismatch: 50 } };
    const ids = collectSearchSpace().ids;
    expect(ids).toContain('weights.dutyMismatch');
    const refusing: string[] = [];
    for (const building of config.buildingsById.values()) {
      const refused = inertTerms(weightedSpec, building).some((entry) => entry.termId === 'dutyMismatch');
      const offered = dimensionIdsLiveOn(ids, building).includes('weights.dutyMismatch');
      expect(offered, `${building.id}: the dial is offered exactly where it is not refused`).toBe(!refused);
      if (refused) refusing.push(building.id);
    }
    expect(refusing).not.toContain('st-jude-hospital');
    expect(refusing.length, 'the refusal still speaks on every other shipped building').toBe(
      config.buildingsById.size - 1,
    );
    /* The tree before this commit: St Jude stripped of its declaration is refused like the rest. */
    expect(inertTerms(weightedSpec, undeclared(stJude)).map((entry) => entry.termId)).toEqual(['dutyMismatch']);
  });
});

describe('the bed duty moves St Jude’s legs only under a weight a player gives it — #561', () => {
  it('records the same run with or without the declaration under an unweighted dispatcher', () => {
    for (const seed of SEEDS) {
      const before = runOf(undeclared(stJude), collective, seed);
      expect(before.legs.length, `seed ${String(seed)}: the run carried people`).toBeGreaterThan(10);
      expect(JSON.stringify(runOf(stJude, collective, seed)), `seed ${String(seed)}`).toBe(JSON.stringify(before));
    }
  });

  it('moves the legs on every seed once the term is weighted, and moves nothing without the declaration', () => {
    const player = weighted(50);
    expect(player.weights['dutyMismatch']).toBe(0.5);
    for (const seed of SEEDS) {
      const baseline = legsOf(runOf(stJude, collective, seed));
      expect(legsOf(runOf(undeclared(stJude), player, seed)), `seed ${String(seed)}: before, nothing to price`).toBe(
        baseline,
      );
      expect(legsOf(runOf(stJude, player, seed)), `seed ${String(seed)}: the weight reaches the run`).not.toBe(baseline);
    }
  });
});
