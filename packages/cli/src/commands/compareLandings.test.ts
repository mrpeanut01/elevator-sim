/**
 * **`elevator-sim compare` refuses the pairing `core` refuses, landing by landing** — GitHub issue
 * #437, `DECISIONS.md` § D553.
 *
 * `crossModelNotice` is the shipped caller of `comparabilityBetween`: it is what decides, before a
 * single replication runs, whether the verdict is taken on AWT or on TTD and whether the arms table
 * carries the warning that nine of its rows do not pair. It used to read each arm's model off the
 * profile alone, which cannot see a panel installed on one landing. These cases hold the new reading
 * to the old one on every building that declares nothing, and to `core`'s rule on one that does.
 */

import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MODEL_SENSITIVE_METRIC_IDS,
  loadConfig,
  type CallType,
  type DispatcherProfile,
  type FloorConfig,
  type LoadedConfig,
} from '@elevator-sim/core';

import { crossModelNotice, gateMetricFor } from './compare.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

function profile(id: string): DispatcherProfile {
  const found = config.dispatcherProfilesById.get(id);
  if (found === undefined) throw new Error(`missing dispatcher fixture "${id}"`);
  return found;
}

function floorsOf(buildingId: string): readonly FloorConfig[] {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`missing building fixture "${buildingId}"`);
  return building.floors;
}

/** midtown-office's landings with every floor but `panelled` declaring up/down buttons. */
function panelsOnlyAt(...panelled: readonly string[]): readonly FloorConfig[] {
  return floorsOf('midtown-office').map((floor) =>
    panelled.includes(floor.id)
      ? floor
      : { ...floor, landingCallType: 'up-down-buttons' as CallType },
  );
}

describe('crossModelNotice, landing by landing', () => {
  it('raises exactly the notice it always raised on every shipped building, all of which declare nothing', () => {
    const pairs = [
      ['eta', 'destination-panel'],
      ['destination-panel', 'collective'],
      ['eta', 'collective'],
      ['destination-eta', 'destination-panel'],
      ['destination-panel', 'destination-panel'],
    ] as const;
    for (const building of config.buildingsById.keys()) {
      for (const [a, b] of pairs) {
        expect(crossModelNotice(profile(a), profile(b), floorsOf(building))).toStrictEqual(
          crossModelNotice(profile(a), profile(b)),
        );
      }
    }
    expect(crossModelNotice(profile('eta'), profile('destination-panel'))?.notComparable).toEqual(
      MODEL_SENSITIVE_METRIC_IDS,
    );
    expect(crossModelNotice(profile('eta'), profile('collective'))).toBeUndefined();
  });

  it('names a panel arm hybrid on a building with a panel at the lobby alone, and gates on TTD', () => {
    const notice = crossModelNotice(profile('eta'), profile('destination-panel'), panelsOnlyAt('G'));
    expect(notice).toBeDefined();
    expect(notice?.aModel).toBe('conventional');
    expect(notice?.bModel).toBe('hybrid');
    expect(notice?.notComparable).toEqual(MODEL_SENSITIVE_METRIC_IDS);
    expect(gateMetricFor(notice).metric).toBe('ttdMeanS');
  });

  it('pairs two panel arms on the same hybrid building on all twenty-three', () => {
    // The same landings assign under both arms, so each passenger is measured in the same construct.
    expect(
      crossModelNotice(profile('destination-panel'), profile('destination-panel'), panelsOnlyAt('G')),
    ).toBeUndefined();
  });

  it('stops refusing a panel dispatcher on a building with no panel on any landing', () => {
    const none = floorsOf('midtown-office').map((floor) => ({
      ...floor,
      landingCallType: 'up-down-buttons' as CallType,
    }));
    expect(crossModelNotice(profile('eta'), profile('destination-panel'), none)).toBeUndefined();
    expect(gateMetricFor(crossModelNotice(profile('eta'), profile('destination-panel'), none)).metric).toBe(
      'awtS',
    );
  });
});
