/**
 * **The rush setup's *your furthest* survives a reload, and its figure is a replay** — wave AQ, lane
 * AQ-3, [§ D1515](../../../../DECISIONS.md), the post-AP playtest's first rush finding.
 *
 * Red on the base: `EverydayHost.rushFurthest` did not exist, the host held the furthest round in
 * memory only, and a fresh host over the same storage (a reload) drew *"no round has finished since
 * this page opened"* after rounds had finished.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { SessionStore } from '../persist/types.js';
import { createEverydayHost, type EverydayHostBindings } from './host.js';
import { RUSH_SEED } from './rush.js';
import {
  RUSH_DEVICE_FURTHEST_KEY,
  decodeRushDeviceFurthest,
  emptyRushDeviceFurthest,
  encodeRushDeviceFurthest,
  rushDeviceFurthestOf,
  withRushDeviceFurthest,
  type RushDeviceFurthest,
} from './rushDeviceFurthest.js';
import { createRushDeviceStore } from './rushDeviceStore.js';
import { RUSH_FURTHEST_COPY, RUSH_UNFINISHED_COPY, rushFactViews, type RushBest } from './rushScreenModel.js';
import { browserResourcesFrom } from './rushHouse.test-helper.js';

let config: LoadedConfig;
let resources: BrowserResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = browserResourcesFrom(config);
}, 120_000);

const BUILDING = 'garden-apartments';

function mapBacking(): { readonly backing: SessionStore; readonly slots: Map<string, string> } {
  const slots = new Map<string, string>();
  return {
    slots,
    backing: {
      read: (key) => slots.get(key) ?? null,
      write: (key, value) => {
        slots.set(key, value);
      },
      remove: (key) => {
        slots.delete(key);
      },
    },
  };
}

/** A host over `store`, on the rush tower, with a run that simulates synchronously. */
function hostOver(store: ReturnType<typeof createRushDeviceStore>) {
  let state: ViewerState = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, BUILDING), resources, 'collective');
  const bindings = {
    resources,
    state: () => state,
    rushDeviceBest: store,
    applyPatch: (patch: Partial<ViewerState>) => {
      state = { ...state, ...patch };
    },
    startRun: () => undefined,
    playheadS: () => 0,
    dayClosed: () => false,
    runIsOwn: () => false,
    playerHasChosen: () => false,
    dayStartS: () => undefined,
    intervene: () => undefined,
    closeDay: () => undefined,
    openRunTab: () => undefined,
    bankCompletion: undefined,
    onChange: () => () => undefined,
    simulateRecord: (cfg: Parameters<EverydayHostBindings['simulateRecord']>[0], done: (recording: never) => void, _failed: unknown, out: readonly string[]) => {
      done(recordRun(cfg, { recordDecisions: false, outOfServiceCarIds: out }).recording as never);
    },
  } as unknown as EverydayHostBindings;
  const host = createEverydayHost(bindings);
  return {
    host,
    /** Press *Start the rush*, land its run, and end it by hand `afterS` into the round. */
    playByHand(afterS: number): void {
      const refusal = host.startRush();
      if (refusal !== undefined) throw new Error(refusal);
      const run = shiftRunConfigOf(resources, state);
      const { recording } = recordRun(run.config, { recordDecisions: false, outOfServiceCarIds: run.outOfServiceCarIds });
      state = { ...state, recording };
      host.endRush(recording.startedAt + afterS);
      host.rush();
    },
  };
}

describe('the furthest round is kept on this device and drawn after a reload — § D1515', () => {
  it('a round ended by hand is kept, and a fresh host over the same storage draws its replayed figures', async () => {
    const { backing, slots } = mapBacking();
    const first = hostOver(createRushDeviceStore(backing));
    first.playByHand(650);
    const played = first.host.rushBest();
    expect(played?.wave).toBe(4);
    expect(slots.has(RUSH_DEVICE_FURTHEST_KEY)).toBe(true);

    /* The reload: a new host, a new store, the same storage. Nothing of this visit is in memory. */
    const reloaded = hostOver(createRushDeviceStore(backing));
    expect(reloaded.host.rushBest()).toBeUndefined();
    const answer = await reloaded.host.rushFurthest(BUILDING);
    expect(answer).toEqual({ kind: 'row', best: played });

    const [furthest, held] = rushFactViews(reloaded.host.rushBest(), answer);
    expect(furthest?.value).toBe(`wave ${String(played?.wave)}`);
    expect(furthest?.label).toBe(RUSH_FURTHEST_COPY.kept('Conventional collective'));
    expect(held?.value).toBe(played?.held);
    expect(furthest?.label).not.toMatch(/no round has finished/u);
  }, 120_000);

  it('a hand-edited kept figure moves nothing drawn', async () => {
    const { backing, slots } = mapBacking();
    hostOver(createRushDeviceStore(backing)).playByHand(650);
    const honest = await hostOver(createRushDeviceStore(backing)).host.rushFurthest(BUILDING);
    const raw = decodeRushDeviceFurthest(slots.get(RUSH_DEVICE_FURTHEST_KEY) ?? null).record;
    const edited = { ...raw, rounds: raw.rounds.map((round) => ({ ...round, keptWave: 99, keptHeldS: 99_999 })) };
    slots.set(RUSH_DEVICE_FURTHEST_KEY, encodeRushDeviceFurthest(edited));
    expect(await hostOver(createRushDeviceStore(backing)).host.rushFurthest(BUILDING)).toEqual(honest);
  }, 120_000);

  it('answers none with nothing kept, and the facts say so in words a player can act on', async () => {
    expect(await hostOver(createRushDeviceStore(undefined)).host.rushFurthest(BUILDING)).toEqual({ kind: 'none' });
    const [furthest] = rushFactViews(undefined, { kind: 'none' });
    expect(furthest?.label).toBe(RUSH_FURTHEST_COPY.none);
    expect(furthest?.label).not.toMatch(/this page opened/u);
  }, 120_000);
});

describe('the record keeps the further round per tower', () => {
  const entry = (keptWave: number, keptHeldS: number): RushDeviceFurthest => ({
    buildingId: BUILDING,
    body: { buildingId: BUILDING, rounds: [{ dispatcherProfileId: 'collective', claimedHeldS: null }] },
    endedAfterS: keptHeldS,
    keptWave,
    keptHeldS,
  });

  it('keeps a later wave, or the same wave held longer, and leaves a shorter round alone by identity', () => {
    const first = withRushDeviceFurthest(emptyRushDeviceFurthest(), entry(4, 650));
    expect(withRushDeviceFurthest(first, entry(3, 900))).toBe(first);
    expect(withRushDeviceFurthest(first, entry(4, 600))).toBe(first);
    expect(rushDeviceFurthestOf(withRushDeviceFurthest(first, entry(4, 700)), BUILDING)?.keptHeldS).toBe(700);
    expect(rushDeviceFurthestOf(withRushDeviceFurthest(first, entry(5, 800)), BUILDING)?.keptWave).toBe(5);
    expect(decodeRushDeviceFurthest(encodeRushDeviceFurthest(first))).toEqual({ record: first, refused: false });
    for (const bad of ['{', '[]', '{"version":2,"rounds":[]}', '{"version":1,"rounds":[{"buildingId":"x"}]}']) {
      expect(decodeRushDeviceFurthest(bad).refused, bad).toBe(true);
    }
  });

  it('draws this visit’s round, labelled as this visit’s, only when it went further than the kept one', () => {
    const kept: RushBest = { wave: 4, heldS: 650, held: '10:50', driverName: 'A' };
    const visit: RushBest = { wave: 6, heldS: 1000, held: '16:40', driverName: 'B' };
    expect(rushFactViews(visit, { kind: 'row', best: kept })[0]?.label).toBe(RUSH_FURTHEST_COPY.visit('B'));
    expect(rushFactViews(kept, { kind: 'row', best: kept })[0]?.label).toBe(RUSH_FURTHEST_COPY.kept('A'));
  });
});

describe('a round the page closed on is said once on the way back — wave AQ, lane AQ-3', () => {
  it('a host started over a marked store says so once, and clears the mark', () => {
    const { backing } = mapBacking();
    createRushDeviceStore(backing).markUnfinished(BUILDING);
    const store = createRushDeviceStore(backing);
    const { host } = hostOver(store);
    expect(host.rushUnfinished()).toBe(RUSH_UNFINISHED_COPY);
    expect(host.rushUnfinished()).toBeUndefined();
    expect(store.unfinished()).toBeUndefined();
    expect(hostOver(createRushDeviceStore(backing)).host.rushUnfinished()).toBeUndefined();
  });
});
