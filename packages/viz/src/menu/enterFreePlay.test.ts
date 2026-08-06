/**
 * Start starts, and the run is the run the menu described — `docs/16` § 5 clauses 2 and 3.
 *
 * The load-bearing test is *"the entered state's legs are byte-identical to a state built from the
 * selection alone"*. Everything else here is a way of making that one mean something:
 *
 * - the **negative control** shows the two arms are not trivially equal, by running the same
 *   selection over an un-reset week and requiring the legs to *differ*. Without it, a bug that made
 *   every arm produce an empty leg set would pass;
 * - the **postability** assertion connects the fix to the reason it matters, which is not tidiness:
 *   `packages/server` verifies a submission by re-running its selection on its own `data/`, so a
 *   run carrying growth or a scheduled event could never reproduce, and an honest submission would
 *   have been rejected as a forgery.
 *
 * Compared on the legs, per § D177 — a mean can be unchanged for a run that is entirely different.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import type { ViewerState } from '../dev/state.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { nextDay } from '../shift/week.js';

import { catalogueOf } from './catalogue.js';
import { enterFreePlay } from './enterFreePlay.js';
import type { FreePlaySelection } from './types.js';

const CATALOGUE = catalogueOf(RESOURCES);

const SELECTION: FreePlaySelection = Object.freeze({
  buildingId: 'midtown-office',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 3,
  // 1 800 s and not 900: rise-and-fall declares a thirty-minute period, and freePlayIssues
  // refuses the combination in words rather than letting the kernel throw at Start.
  durationS: 1800,
  seed: '20260804',
});

/** A week seven days in, with a car held and a lever moved — the state Start used to inherit. */
function deepInAWeek(): ViewerState {
  const base = baseState();
  let week = base.week;
  for (let day = 1; day < 7; day += 1) week = nextDay(week);
  return {
    ...base,
    week,
    outOfServiceCarIds: ['main-D'],
    levers: { ...DEFAULT_LEVERS, express: true },
  };
}

describe('entering free play', () => {
  it('opens on day one whatever week it was entered from', () => {
    const entered = enterFreePlay(deepInAWeek(), RESOURCES, SELECTION, CATALOGUE);
    expect(entered?.week.day).toBe(1);
    expect(entered?.week.dayIdx).toBe(0);
    // A fresh week, not the old one rewound: the streak, the banked count and the seven-day history
    // belong to the campaign week and would put somebody else's sparkline under this run.
    expect(entered?.week.streak).toBe(0);
    expect(entered?.week.history).toEqual([]);
  });

  it('drops the cars the campaign week was holding', () => {
    expect(enterFreePlay(deepInAWeek(), RESOURCES, SELECTION, CATALOGUE)?.outOfServiceCarIds).toEqual([]);
  });

  it('applies every axis the menu offered', () => {
    const entered = enterFreePlay(baseState(), RESOURCES, SELECTION, CATALOGUE);
    expect(entered?.buildingId).toBe(SELECTION.buildingId);
    expect(entered?.dispatcherId).toBe(SELECTION.dispatcherProfileId);
    expect(entered?.shiftLengthS).toBe(SELECTION.durationS);
    expect(entered?.seed).toBe(BigInt(SELECTION.seed));
    expect(entered?.freePlay).toEqual({
      demandTemplateId: SELECTION.demandTemplateId,
      arrivalRatePctPop5min: SELECTION.arrivalRatePctPop5min,
    });
  });

  it('refuses a selection that cannot start, rather than running something else', () => {
    const broken = { ...SELECTION, buildingId: 'demolished' };
    expect(enterFreePlay(baseState(), RESOURCES, broken, CATALOGUE)).toBeUndefined();
  });
});

describe('the run is the run the menu described', () => {
  it('produces the same legs whatever week it was entered from', () => {
    // The clause. Entering from day 1 and from day 7 must give the same run, because the selection
    // is the same and free play has no week.
    const fromDayOne = enterFreePlay(baseState(), RESOURCES, SELECTION, CATALOGUE);
    const fromDaySeven = enterFreePlay(deepInAWeek(), RESOURCES, SELECTION, CATALOGUE);
    expect(fromDayOne).toBeDefined();
    expect(fromDaySeven).toBeDefined();
    if (fromDayOne === undefined || fromDaySeven === undefined) return;
    expect(legsOf(fromDaySeven)).toBe(legsOf(fromDayOne));
  });

  it('would have differed without the reset — the negative control', () => {
    /*
     * What the old `start` did: apply the selection and leave `week`, `outOfServiceCarIds` and the
     * levers exactly as the campaign left them.
     *
     * At day 7 `grownBuilding` is ×1.66 and `eventFor` schedules a twist, so this is a materially
     * different run wearing the menu's description. If this assertion ever fails, the reset above
     * has stopped doing anything and the two clauses have quietly reopened.
     */
    const deep = deepInAWeek();
    const unreset: ViewerState = {
      ...deep,
      buildingId: SELECTION.buildingId,
      dispatcherId: SELECTION.dispatcherProfileId,
      shiftLengthS: SELECTION.durationS,
      seed: BigInt(SELECTION.seed),
      freePlay: {
        demandTemplateId: SELECTION.demandTemplateId,
        arrivalRatePctPop5min: SELECTION.arrivalRatePctPop5min,
      },
    };
    const entered = enterFreePlay(deep, RESOURCES, SELECTION, CATALOGUE);
    if (entered === undefined) return;
    expect(legsOf(unreset)).not.toBe(legsOf(entered));
  });

  it('is a run the leaderboard could actually verify', () => {
    /*
     * The reason the reset is not tidiness. `packages/server` re-runs a submission from its ids on
     * its own `data/` and accepts the score only if it reproduces — so a run carrying day 7's growth
     * or a held car is one the server cannot reproduce, and an honest submission of it would come
     * back rejected as a forgery.
     */
    const entered = enterFreePlay(deepInAWeek(), RESOURCES, SELECTION, CATALOGUE);
    if (entered === undefined) return;
    expect(runIdentityIssues(entered, RESOURCES, 'ranked')).toEqual([]);
  });

  it('is not vacuously postable — the state it was entered from is not', () => {
    // Without this, the assertion above would pass on a predicate that accepted everything.
    expect(runIdentityIssues(deepInAWeek(), RESOURCES, 'ranked').length).toBeGreaterThan(0);
  });

  it('lands the shell on the simulation — GitHub issue #23', () => {
    /*
     * `closeMenu` hides the overlay and selects nothing, so Start left the player on whatever tab
     * the shell happened to be on. Reaching Free Play from the Day report therefore hid the menu and
     * left `panel-run` hidden: the reporter pressed *Start*, the screen went back to a sheet about
     * the **previous** run, and the shift they had just configured played on a canvas nobody could
     * see.
     *
     * Entered from `report` on purpose. Asserting it from a state already on `run` would pass on a
     * function that writes nothing at all, which is the vacuity every check in this file is written
     * against.
     */
    const onTheSheet: ViewerState = { ...deepInAWeek(), tab: 'report' };
    expect(enterFreePlay(onTheSheet, RESOURCES, SELECTION, CATALOGUE)?.tab).toBe('run');
  });
});
