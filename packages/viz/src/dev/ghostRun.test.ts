/**
 * The ghost's second request — slice 4d's config half, held to the moved-control rule.
 *
 * § D177 (move the control and require the run to change, compared on the legs), applied to the
 * picker **before** the panel per § D219's lesson: picking a different ghost must change the
 * second recording's dispatcher on the legs, and picking *nobody* must issue no second request
 * at all. Plus the two facts the race depends on — the crowd is the same crowd (CRN), and the
 * rival's recording can never bank a day.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { bankingRefusalFor } from '../shift/banking.js';

import type { BrowserResources } from './data.js';
import { NO_SAVED_DISPATCHER, ghostPlanOf } from './ghostRun.js';
import { initialState, shiftRunConfigOf, type SavedDispatcher, type ViewerState } from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/** The smallest shipped building only — this suite runs real replications and pays per leg. */
function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const config = parseBuilding(read('buildings/garden-apartments.json'));
  const entries = [
    {
      file: 'garden-apartments.json',
      config,
      resolved: resolveBuilding(config, elevatorSpecs),
    },
  ];
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();
const base = (): ViewerState => ({
  ...initialState(resources, 20260811n),
  shiftLengthS: 900,
});

/** A profile the reader "saved": the shipped `nearest-car`, re-labelled the way the editor saves. */
function savedNearestCar(): SavedDispatcher {
  const profile = resources.dispatcherProfiles.profiles.find((entry) => entry.id === 'nearest-car');
  if (profile === undefined) throw new Error('data/ no longer ships nearest-car');
  return { id: 'saved-1', profile };
}

describe('ghostPlanOf', () => {
  it('nobody issues no second request — none is free by construction', () => {
    const plan = shiftRunConfigOf(resources, base());
    expect(ghostPlanOf(resources, [], plan.config, 'none')).toEqual({ kind: 'none' });
  });

  it('the plain baseline is the profile a fresh shift opens on — § D134’s list, not a literal', () => {
    const plan = shiftRunConfigOf(resources, base());
    const ghost = ghostPlanOf(resources, [], plan.config, 'plain-baseline');
    expect(ghost.kind).toBe('run');
    if (ghost.kind !== 'run') return;
    expect(ghost.dispatcherProfileId).toBe('collective');
  });

  it('your latest saved is the most recent save, and refuses in words when nothing is saved', () => {
    const plan = shiftRunConfigOf(resources, base());
    expect(ghostPlanOf(resources, [], plan.config, 'latest-saved')).toEqual({
      kind: 'refused',
      reason: NO_SAVED_DISPATCHER,
    });
    const older: SavedDispatcher = { id: 'saved-0', profile: resources.dispatcherProfiles.profiles[0] as SavedDispatcher['profile'] };
    const ghost = ghostPlanOf(resources, [older, savedNearestCar()], plan.config, 'latest-saved');
    expect(ghost.kind).toBe('run');
    if (ghost.kind !== 'run') return;
    expect(ghost.dispatcherProfileId).toBe('nearest-car');
  });

  it('swaps exactly one thing: the dispatcher — same building, demand, seed, by identity', () => {
    const plan = shiftRunConfigOf(resources, base());
    const ghost = ghostPlanOf(resources, [savedNearestCar()], plan.config, 'latest-saved');
    expect(ghost.kind).toBe('run');
    if (ghost.kind !== 'run') return;
    expect(ghost.config.building).toBe(plan.config.building);
    expect(ghost.config.trafficProfiles).toBe(plan.config.trafficProfiles);
    expect(ghost.config.seed).toBe(plan.config.seed);
    expect(ghost.config.demand).toBe(plan.config.demand);
    expect(ghost.config.durationS).toBe(plan.config.durationS);
    expect(ghost.config.dispatcherProfile).not.toBe(plan.config.dispatcherProfile);
  });

  it('drops the player’s interventions as no key at all — the rival is not partly the player', () => {
    const plan = shiftRunConfigOf(resources, {
      ...base(),
      interventions: [{ atS: 100, change: { kind: 'park-cars-lobby' } }],
    });
    expect('interventions' in plan.config).toBe(true);
    const ghost = ghostPlanOf(resources, [], plan.config, 'plain-baseline');
    expect(ghost.kind).toBe('run');
    if (ghost.kind !== 'run') return;
    expect('interventions' in ghost.config).toBe(false);
  });
});

describe('the second recording, run for real', () => {
  const plan = shiftRunConfigOf(resources, base());
  const plain = ghostPlanOf(resources, [savedNearestCar()], plan.config, 'plain-baseline');
  const saved = ghostPlanOf(resources, [savedNearestCar()], plan.config, 'latest-saved');
  if (plain.kind !== 'run' || saved.kind !== 'run') throw new Error('both picks must run');

  it('moved control: a different pick changes the second recording’s dispatcher, on the legs', () => {
    const plainRun = recordRun(plain.config, { recordDecisions: false }).recording;
    const savedRun = recordRun(saved.config, { recordDecisions: false }).recording;
    expect(plainRun.dispatcherProfileId).toBe('collective');
    expect(savedRun.dispatcherProfileId).toBe('nearest-car');
    // Compared on the legs, not on a window statistic — § D177's own comparison.
    expect(JSON.stringify(plainRun.legs)).not.toBe(JSON.stringify(savedRun.legs));
  }, 300_000);

  it('same picks, same seed: the ghost recording is fingerprint-identical across two runs', () => {
    const first = recordRun(plain.config, { recordDecisions: false }).recording;
    const second = recordRun(structuredClone(plain.config), { recordDecisions: false }).recording;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  }, 300_000);

  it('races the same crowd: every arrival matches the primary’s, leg for leg', () => {
    const primary = recordRun(plan.config, { recordDecisions: false }).recording;
    const rival = recordRun(saved.config, { recordDecisions: false }).recording;
    const crowdOf = (legs: readonly { passengerId: string; arrivedAt: number; originFloorId: string; destinationFloorId: string }[]): string =>
      JSON.stringify(
        legs.map((leg) => [leg.passengerId, leg.arrivedAt, leg.originFloorId, leg.destinationFloorId]),
      );
    expect(crowdOf(rival.legs)).toBe(crowdOf(primary.legs));
    // …while the service of that crowd differs, which is the race being real.
    expect(JSON.stringify(rival.legs)).not.toBe(JSON.stringify(primary.legs));
  }, 300_000);

  it('can never bank a day: the banking gate refuses it by identity', () => {
    const primary = recordRun(plan.config, { recordDecisions: false }).recording;
    const rival = recordRun(plain.config, { recordDecisions: false }).recording;
    // The shell adopts the rival beside the primary and never writes `simulatedRecording`, so
    // the gate sees two different objects — refused, in issue #136's own sentence.
    expect(bankingRefusalFor(rival, primary)).not.toBeNull();
    // Control: the primary is its own simulated recording and passes.
    expect(bankingRefusalFor(primary, primary)).toBeNull();
  }, 300_000);
});
