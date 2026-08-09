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
import { withBuilding, type ViewerState } from '../dev/state.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { CALENDAR_PERIODS, periodOnDays } from '../shift/calendar.js';
import { contractForBuilding } from '../shift/contracts.js';
import { FREE_PLAY_CONTRACT_ID, nextDay } from '../shift/week.js';

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
  // `null` — the whole of `rise-and-fall`'s period, which is the only part a shape template has.
  // § D286.
  windowStartS: null,
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

  it('drops the calendar period and the commissioned fabric the campaign was under', () => {
    /*
     * The same clause as the held car above, two fields over — and they were missed until GitHub
     * issue #93 needed a board row to run the configuration it named. Neither is an axis this menu
     * offers: the calendar select is on *Scenarios* and the fabric has its own screen, so a run that
     * inherited either would not be the run this screen described.
     *
     * The legs half of this is `menu/boardRun.test.ts`, on `midtown-office` at 1 800 s, because
     * Garden Apartments at 900 s answers every call with two cars and a commissioned shaft cannot
     * show. This is the field assertion, next to the fields.
     */
    const under: ViewerState = {
      ...deepInAWeek(),
      calendar: periodOnDays(CALENDAR_PERIODS['quarter-end'], 1, 7),
      commissioning: [{ bankId: 'main', shafts: 9, machineClassId: 'geared-traction', ratedSpeedMps: 1.6 }],
    };
    const entered = enterFreePlay(under, RESOURCES, SELECTION, CATALOGUE);
    expect(entered?.calendar).toBeNull();
    expect(entered?.commissioning).toEqual([]);
    // Not vacuous: the state it was entered from carried both.
    expect(under.calendar).not.toBeNull();
    expect(under.commissioning.length).toBeGreaterThan(0);
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

/* -------------------------------------------------------------------------- *
 * The week it displaced is put down, not thrown away — GitHub issue #125
 * -------------------------------------------------------------------------- */

/**
 * The reporter's own state: the campaign on Midtown Office, four days in.
 *
 * Midtown rather than Garden Apartments, and 1 800 s rather than 900, for the reason
 * `probes.test-helper.ts` records and `state.test.ts`'s resumed-week test repeats: Garden is six
 * floors and two hydraulic cars at a residential trickle, where a third of a building's population
 * can arrive and be answered identically — so a legs comparison there can come back equal for a run
 * that really is different.
 *
 * Written rather than played out over four days, because what is under test is the *transition*.
 * `closeDay`'s arithmetic has its own suite, and a fixture that ran it here would make this fail for
 * two unrelated reasons.
 */
function campaignOnMidtownDayFour(): ViewerState {
  const midtown = withBuilding(baseState(), RESOURCES, 'midtown-office');
  return {
    ...midtown,
    playMode: 'shift-week',
    shiftLengthS: 1800,
    week: { ...midtown.week, day: 4, dayIdx: 3, streak: 4, cleanRun: 2 },
  };
}

describe('starting free play on the campaign’s own building', () => {
  it('parks the campaign week rather than overwriting it', () => {
    /*
     * The defect, driven on the shipped code before anything changed: `withBuilding` short-circuits
     * because the building has not moved, so the departing week was never parked, and the spread
     * that followed replaced `c2` day 4 with `openWeek('c2')` — day 1, wearing the same id.
     * `weeksForSession` kept the disk copy, so the loss was invisible until the player looked, and
     * recoverable only by reloading the page.
     */
    const played = campaignOnMidtownDayFour();
    const entered = enterFreePlay(played, RESOURCES, SELECTION, CATALOGUE);
    expect(entered).toBeDefined();
    if (entered === undefined) return;

    // Not vacuous: the fixture really is on the building the selection names.
    expect(played.buildingId).toBe(SELECTION.buildingId);
    expect(played.week.contractId).toBe(contractForBuilding(SELECTION.buildingId)?.id);

    expect(entered.week.contractId).toBe(FREE_PLAY_CONTRACT_ID);
    expect(entered.week.day).toBe(1);
    expect(entered.parkedWeeks.map((week) => week.contractId)).toContain(played.week.contractId);
    expect(entered.parkedWeeks.find((week) => week.contractId === played.week.contractId)).toEqual(
      played.week,
    );
    // § D312's invariant survives, which is the half a hand-rolled park would have broken: the week
    // on screen may never also be in the list.
    expect(entered.parkedWeeks.some((week) => week.contractId === entered.week.contractId)).toBe(
      false,
    );
  });

  it('hands the week back through the building select, compared on the legs', () => {
    /*
     * **The acceptance, and it is on the legs rather than on `week.day`** — the standing
     * requirement. A `WeekState` nothing read would satisfy every assertion above while the player's
     * four days changed nothing on screen.
     *
     * `week.day` drives `grownBuilding`'s `1 + 0.11 × (day − 1)` — `shift/growth.ts`, and the
     * constant is `GROWTH_PER_DAY = 0.11` in `shift/types.ts` rather than the issue's word for it —
     * so day 4 is a building carrying 1.33× the tenants of day 1, and the two produce different
     * legs by construction. Both halves are required: the resumed run must **differ** from a fresh
     * day 1 (the fix does something) and must **equal** the run the player left (it does the right
     * thing).
     *
     * The way back is the control the player is already looking at. On the campaign's own building
     * the building select is a re-pick — which used to be a no-op on the week, and is a real
     * `switchWeek` now that the free-play week is on an id of its own. `dev/main.ts`'s Start arm
     * prints `weekKeptLine`'s *"pick that building again and it carries on from there"*, and this is
     * that sentence being true.
     */
    const played = campaignOnMidtownDayFour();
    const entered = enterFreePlay(played, RESOURCES, SELECTION, CATALOGUE);
    expect(entered).toBeDefined();
    if (entered === undefined) return;
    const back = withBuilding(entered, RESOURCES, SELECTION.buildingId);

    /*
     * The week is put back into the state the player left, and only the week. `enterFreePlay` also
     * moved the dispatcher, the seed, the demand and the levers — those are the selection and they
     * are supposed to have moved — so comparing `back` whole would be comparing six controls and
     * calling the answer *the week*.
     */
    const resumed: ViewerState = { ...played, week: back.week };
    const freshDayOne: ViewerState = { ...played, week: { ...back.week, day: 1, dayIdx: 0 } };

    expect(
      legsOf(resumed),
      'the resumed week produced the legs of a fresh day 1 — the four days came back on the ribbon ' +
        'and nowhere the simulator can see them',
    ).not.toBe(legsOf(freshDayOne));
    expect(legsOf(resumed), 'the resumed run is not the run the player left').toBe(legsOf(played));
  }, 300_000);

  it('keeps a week that was parked under the destination, when free play moves building', () => {
    /*
     * The same overwrite through the other door, and it is the one nobody reported. `withBuilding`
     * **resumes** a parked destination week into the live slot — that is § D312 working — and the
     * spread underneath then discarded it. So a player on Midtown with Garden Apartments parked on
     * day 6 who started free play on Garden lost the Garden week, while the Midtown week they had
     * just left was parked safely.
     *
     * Both weeks now survive, which is the property rather than the mechanism: after the start,
     * every week the player had is in the list, and neither is the one on screen.
     */
    const played = campaignOnMidtownDayFour();
    const parkedGarden = { ...played.week, contractId: 'c1', day: 6, dayIdx: 5, streak: 1, cleanRun: 1 };
    const withParked: ViewerState = { ...played, parkedWeeks: [parkedGarden] };
    const entered = enterFreePlay(
      withParked,
      RESOURCES,
      { ...SELECTION, buildingId: 'garden-apartments' },
      CATALOGUE,
    );
    expect(entered).toBeDefined();
    if (entered === undefined) return;

    expect(entered.week.contractId).toBe(FREE_PLAY_CONTRACT_ID);
    expect([...entered.parkedWeeks.map((week) => week.contractId)].sort()).toEqual(['c1', 'c2']);
    expect(entered.parkedWeeks.find((week) => week.contractId === 'c1')?.day).toBe(6);
    expect(entered.parkedWeeks.find((week) => week.contractId === 'c2')?.day).toBe(4);
  });

  it('carries what has been cleared into the free-play week, and back out', () => {
    /*
     * A second loss this closes, and it was found by the change rather than reported. The old line
     * was `openWeek(...)`, which empties `completed` — every scenario the player has ever cleared.
     * `takeContract` carries it, and it has to: `closeDay`'s `!completed.includes(contract.id)` is
     * what stops a contract clearing and being awarded twice, so a player who entered free play and
     * then took a scenario card off the board had that record wiped in memory.
     */
    const played = campaignOnMidtownDayFour();
    const cleared: ViewerState = { ...played, week: { ...played.week, completed: ['c1'] } };
    expect(enterFreePlay(cleared, RESOURCES, SELECTION, CATALOGUE)?.week.completed).toEqual(['c1']);
  });
});
