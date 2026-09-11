/**
 * **A rush's crowd is the building's alone, whichever standing the press came from** — the viewer
 * defect PR #513's review found (finding 1), extracted to land on its own.
 *
 * `EverydayHost.startRush` sized the stream from `dev/state.ts#resolvedBuildingOf` on the state the
 * player pressed from — their own week, grown to its day and handed over by its contract — while the
 * run it started was the rush's own week on the building as authored. So the crowd was a function of
 * the player as well as the tower. A rush board is keyed on the building, and a row on it means
 * everybody on that building met the same crowd; a stream that moves with a player's week breaks
 * that.
 *
 * Two halves. The first presses *Start the rush* on every shipped building from three standings a
 * player can be in, and reads the rate the press writes, with no simulation. The second plays the
 * three presses on Midtown Office and compares the runs on the legs: the stream's size and the moment
 * the hold line is crossed.
 *
 * The press goes through `createEverydayHost` exactly as `rushScreen.ts` presses it, so this reads
 * what a player's press writes rather than what `rushPatchOf` is handed. The first half is PR #513's
 * `rushHoldAgreement.test.ts`'s first `describe`; that file's second half replays a table that lives
 * in `packages/server` and stays with it.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { createEverydayHost, type EverydayHostBindings } from './host.js';
import { RUSH_SEED, rushHoldAt, rushTopRatePctPop5min } from './rush.js';
import { browserResourcesFrom } from './rushHouse.test-helper.js';

let config: LoadedConfig;
let resources: BrowserResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = browserResourcesFrom(config);
});

/** The three standings a press can come from on one building: its own week on day 1 and day 5, and Free Play. */
function standingsOn(buildingId: string, dispatcherId = 'collective'): readonly (readonly [string, ViewerState])[] {
  const own = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
  return [
    [`its own week (${own.week.contractId}) on day 1`, own],
    [`its own week (${own.week.contractId}) on day 5`, { ...own, week: { ...own.week, day: 5 } }],
    ['Free Play', { ...own, playMode: 'free-play' }],
  ];
}

/** *Start the rush*, pressed through `EverydayHost` exactly as `rushScreen.ts` presses it. */
function pressedRush(standing: ViewerState): ViewerState {
  let state = standing;
  const bindings = {
    resources,
    state: () => state,
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
    ghostRace: () => ({ pick: 'none', rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: () => undefined,
    loadReferenceRuns: () => Promise.resolve([]),
    simulateRecord: () => {
      throw new Error('the rush press asks for no simulation of its own');
    },
    enterWatch: () => undefined,
    stopWatching: () => undefined,
    playThisCrowd: () => undefined,
    watching: () => undefined,
    dailyBoard: undefined,
    bankCompletion: () => undefined,
    onChange: () => () => undefined,
  } as unknown as EverydayHostBindings;
  const refusal = createEverydayHost(bindings).startRush();
  if (refusal !== undefined) throw new Error(`the rush would not start: ${refusal}`);
  return state;
}

describe('the press writes the building’s rate, from any standing — PR #513, finding 1', () => {
  it('on every shipped tower, from a day-1 week, a day-5 week and Free Play', () => {
    const mismatches: string[] = [];
    for (const shipped of config.buildings) {
      const expected = rushTopRatePctPop5min(shipped.totalPopulation);
      for (const [label, standing] of standingsOn(shipped.id)) {
        const rate = pressedRush(standing).freePlay?.arrivalRatePctPop5min;
        if (rate !== expected) mismatches.push(`${shipped.id} from ${label}: ${String(rate)} where the building says ${String(expected)}`);
      }
    }
    expect(config.buildings.length).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});

describe('one building, one crowd: the runs agree on the legs — PR #513, finding 1', () => {
  it('Midtown Office under collective sends the same stream and holds to the same second from every standing', () => {
    const measured: Record<string, { readonly legs: number; readonly holdAtS: number | null }> = {};
    for (const [label, standing] of standingsOn('midtown-office')) {
      const plan = shiftRunConfigOf(resources, pressedRush(standing));
      const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
      measured[label] = { legs: recording.legs.length, holdAtS: rushHoldAt(recording) ?? null };
    }
    const labels = Object.keys(measured);
    expect(labels).toHaveLength(3);
    const freePlay = measured['Free Play'];
    /* Non-vacuity: a hold moment that is `null` everywhere would agree without saying anything. */
    expect(freePlay?.holdAtS ?? null).not.toBeNull();
    expect(measured).toEqual(Object.fromEntries(labels.map((label) => [label, freePlay])));
  });
});
