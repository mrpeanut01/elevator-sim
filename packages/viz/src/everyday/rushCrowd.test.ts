/**
 * **A rush's crowd is the building's alone, whichever standing the press came from** — the viewer
 * defect PR #513's review found (finding 1), extracted to land on its own, and PR #517's review's
 * follow-up: a campaign day's state reached the rush too.
 *
 * `EverydayHost.startRush` sized the stream from `dev/state.ts#resolvedBuildingOf` on the state the
 * player pressed from — their own week, grown to its day and handed over by its contract — while the
 * run it started was the rush's own week on the building as authored. So the crowd was a function of
 * the player as well as the tower. A rush board is keyed on the building, and a row on it means
 * everybody on that building met the same crowd; a stream that moves with a player's week breaks
 * that. And a rush patched only the week's fields, so a campaign day's fit-out, event and works-held
 * car rode into it through `shiftRunConfigOf` — the same defect one seam over (§ D548 clause 5).
 *
 * Four halves. The first presses *Start the rush* on every shipped building from the standings a
 * player can be in, and reads the rate the press writes, with no simulation. The second plays those
 * presses on Midtown Office and compares the runs on the legs: the stream's size and the moment the
 * hold line is crossed — from the week, from Free Play, from a campaign day pressed through
 * `runCampaignDay`, and from each of the campaign day's three fields alone. The third is the crash a
 * leaked event could cause: Crown Hotel's calendared coach party fixes the directional mix, which the
 * rush's template refuses. The fourth is the way back: leaving the rush hands the campaign day back.
 * And one structural check with no simulation: every field the run reads under a rush is one the press
 * writes, or the building or the dispatcher the player brings — `rush.ts#RUSH_FIELD_ROLES`' other half.
 *
 * The press goes through `createEverydayHost` exactly as `rushScreen.ts` presses it, so this reads
 * what a player's press writes rather than what `rushPatchOf` is handed. The first half is PR #513's
 * `rushHoldAgreement.test.ts`'s first `describe`; that file's second half replays a table that lives
 * in `packages/server` and stays with it.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { freshTower, openingCareer, type CampaignCareer, type CampaignTower } from '../campaign/career.js';
import { fitOutOf } from '../campaign/fitOut.js';
import { campaignEventFor } from '../campaign/incidents.js';
import { worksHeldCarsOf } from '../campaign/works.js';
import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { SHIFT_EVENTS } from '../shift/events.js';

import { createCareerStore } from './careerStore.js';
import { createEverydayHost, type EverydayHost, type EverydayHostBindings } from './host.js';
import { RUSH_SEED, rushHoldAt, rushPatchOf, rushTopRatePctPop5min } from './rush.js';
import { browserResourcesFrom } from './rushHouse.test-helper.js';

let config: LoadedConfig;
let resources: BrowserResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = browserResourcesFrom(config);
});

/** A fresh session standing on the building and the dispatcher, through the two setters the pickers call. */
function ownStanding(buildingId: string, dispatcherId = 'collective'): ViewerState {
  return withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
}

/**
 * A tower a campaign has run for a while: the shaft and tenant kit bought, a works night booked on
 * today — so one car is held — and wear past its service point, so a breakdown is a draw the day can
 * make. Every field is one `runCampaignDay` reads; nothing here is written onto the viewer directly.
 */
function wornTower(contractId: string, buildingId: string): CampaignTower {
  const fresh = freshTower({ contractId, buildingId, dispatcherId: 'collective', rate: 3 });
  const day = 3;
  return {
    ...fresh,
    day,
    trips: Math.round(fresh.serviceAt * 1.3),
    fitted: { shafts: 1, tenants: 2 },
    bookings: [{ categoryId: 'shafts', level: 1, startIdx: day - 1, nights: 1, units: 0 }],
  };
}

/** A campaign day's three fields, as `runCampaignDay` would write them for {@link wornTower} on this building. */
function campaignFieldsOn(buildingId: string, contractId: string): Pick<ViewerState, 'campaignFitOut' | 'campaignEventId' | 'outOfServiceCarIds'> {
  const tower = wornTower(contractId, buildingId);
  const building = resources.buildings.find((entry) => entry.id === buildingId);
  if (building === undefined) throw new Error(buildingId);
  return { campaignFitOut: fitOutOf(tower), campaignEventId: SHIFT_EVENTS.breakdown.id, outOfServiceCarIds: worksHeldCarsOf(tower, building) };
}

/** The standings a press can come from on one building: its own week on day 1 and day 5, Free Play, and a campaign day's state. */
function standingsOn(buildingId: string, dispatcherId = 'collective'): readonly (readonly [string, ViewerState])[] {
  const own = ownStanding(buildingId, dispatcherId);
  return [
    [`its own week (${own.week.contractId}) on day 1`, own],
    [`its own week (${own.week.contractId}) on day 5`, { ...own, week: { ...own.week, day: 5 } }],
    ['Free Play', { ...own, playMode: 'free-play' }],
    ['a campaign day’s fit-out, event and held car', { ...own, ...campaignFieldsOn(buildingId, own.week.contractId) }],
  ];
}

interface Pressable {
  readonly host: EverydayHost;
  readonly state: () => ViewerState;
}

/** A host over `standing`, bound the way `rushScreen.ts`'s page binds it, with its own career store. */
function hostOn(standing: ViewerState, career?: CampaignCareer): Pressable {
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
  /* Its own store: under node the page's store is a singleton, and a second host would read this one's career (#375). */
  const store = createCareerStore(undefined);
  if (career !== undefined) store.save(career);
  return { host: createEverydayHost(bindings, store), state: () => state };
}

/** *Start the rush*, pressed through `EverydayHost` exactly as `rushScreen.ts` presses it. */
function pressedRush(standing: ViewerState): ViewerState {
  const pressable = hostOn(standing);
  const refusal = pressable.host.startRush();
  if (refusal !== undefined) throw new Error(`the rush would not start: ${refusal}`);
  return pressable.state();
}

/**
 * A campaign day on the building, pressed through `runCampaignDay` on a career holding
 * {@link wornTower} — on the first seed whose draw is a breakdown, found rather than assumed, so the
 * day carries all three fields. The seed is the day's; the rush writes its own.
 */
function campaignDayOn(buildingId: string): Pressable {
  const own = ownStanding(buildingId);
  const tower = wornTower(own.week.contractId, buildingId);
  let seed = 1n;
  while (campaignEventFor({ tower, seed }).id !== SHIFT_EVENTS.breakdown.id) {
    seed += 1n;
    if (seed > 500n) throw new Error(`no seed under 500 draws a breakdown on ${tower.id}`);
  }
  const pressable = hostOn({ ...own, seed }, { ...openingCareer('collective'), towers: [tower], openTowerId: tower.id });
  pressable.host.runCampaignDay(tower.id);
  return pressable;
}

interface Measured {
  readonly legs: number;
  readonly holdAtS: number | null;
}

/** The rush a pressed state runs, played through the shipped path and read on the legs. */
function measuredRush(pressed: ViewerState): Measured {
  const plan = shiftRunConfigOf(resources, pressed);
  const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
  return { legs: recording.legs.length, holdAtS: rushHoldAt(recording) ?? null };
}

const cleanRuns = new Map<string, Measured>();

/** The rush pressed from a fresh day-1 week on the building — the clean standing — measured once per building. */
function cleanRushOn(buildingId: string): Measured {
  const known = cleanRuns.get(buildingId);
  if (known !== undefined) return known;
  const measured = measuredRush(pressedRush(ownStanding(buildingId)));
  /* Non-vacuity: a hold moment that is `null` everywhere would agree without saying anything. */
  expect(measured.holdAtS).not.toBeNull();
  cleanRuns.set(buildingId, measured);
  return measured;
}

describe('the press writes the building’s rate, from any standing — PR #513, finding 1', () => {
  it('on every shipped tower, from a day-1 week, a day-5 week, Free Play and a campaign day', () => {
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
    const measured: Record<string, Measured> = {};
    for (const [label, standing] of standingsOn('midtown-office')) measured[label] = measuredRush(pressedRush(standing));
    const labels = Object.keys(measured);
    expect(labels).toHaveLength(4);
    const clean = cleanRushOn('midtown-office');
    expect(measured).toEqual(Object.fromEntries(labels.map((label) => [label, clean])));
  });
});

describe('a campaign day does not reach the rush — PR #517’s review, § D548 clause 5', () => {
  it('after a campaign day with a fit-out, an event and a held car, the rush on the same building is the clean one', () => {
    const day = campaignDayOn('midtown-office');
    /* Non-vacuity: the day carries all three, or the comparison below proves nothing. */
    expect(day.state().campaignFitOut?.extraShafts).toBe(1);
    expect(day.state().campaignFitOut?.arrivalRateFactor).toBeCloseTo(2 / 3, 12);
    expect(day.state().campaignEventId).toBe(SHIFT_EVENTS.breakdown.id);
    expect(day.state().outOfServiceCarIds).toHaveLength(1);
    expect(day.host.startRush()).toBeUndefined();
    expect(measuredRush(day.state())).toEqual(cleanRushOn('midtown-office'));
  });

  it('and from each of the campaign day’s three fields alone', () => {
    const own = ownStanding('midtown-office');
    const fields = campaignFieldsOn('midtown-office', own.week.contractId);
    /*
     * The event alone is the calendared coach party, not the day's breakdown: measured on `6a4a845f`,
     * a breakdown alone left this rush where the clean one is (1 640 s on 3 584 legs), so it would
     * cover the field without testing it. The coach party is an event a campaign day draws, and alone
     * it does not leave the rush where it was — it throws.
     */
    const measured = {
      campaignFitOut: measuredRush(pressedRush({ ...own, campaignFitOut: fields.campaignFitOut })),
      campaignEventId: measuredRush(pressedRush({ ...own, campaignEventId: SHIFT_EVENTS['coach-party'].id })),
      outOfServiceCarIds: measuredRush(pressedRush({ ...own, outOfServiceCarIds: fields.outOfServiceCarIds })),
    };
    const clean = cleanRushOn('midtown-office');
    expect(measured).toEqual({ campaignFitOut: clean, campaignEventId: clean, outOfServiceCarIds: clean });
  });

  it('a calendared event that fixes the directional mix — Crown Hotel’s coach party, c7 day 5 — does not throw in the rush after it', () => {
    const own = ownStanding('crown-hotel');
    expect(own.week.contractId).toBe('c7');
    const tower = { ...freshTower({ contractId: 'c7', buildingId: 'crown-hotel', dispatcherId: 'collective', rate: 3 }), day: 5 };
    const day = hostOn(own, { ...openingCareer('collective'), towers: [tower], openTowerId: tower.id });
    day.host.runCampaignDay(tower.id);
    /* Non-vacuity: the day drew the calendared event, and that event fixes the mix `endless-rush` varies. */
    expect(day.state().campaignEventId).toBe(SHIFT_EVENTS['coach-party'].id);
    expect(SHIFT_EVENTS['coach-party'].effect.directionalSplit).not.toBeNull();
    expect(day.host.startRush()).toBeUndefined();
    expect(measuredRush(day.state())).toEqual(cleanRushOn('crown-hotel'));
  });

  it('leaving the rush hands the campaign day back as the day had it', () => {
    const day = campaignDayOn('midtown-office');
    const fieldsOf = (state: ViewerState) => ({
      campaignFitOut: state.campaignFitOut,
      campaignEventId: state.campaignEventId,
      outOfServiceCarIds: state.outOfServiceCarIds,
    });
    const before = fieldsOf(day.state());
    const tower = day.host.campaignDay()?.tower.id;
    expect(tower).toBeDefined();
    expect(day.host.startRush()).toBeUndefined();
    expect(fieldsOf(day.state())).toEqual({ campaignFitOut: undefined, campaignEventId: undefined, outOfServiceCarIds: [] });
    day.host.leaveRush();
    expect(fieldsOf(day.state())).toEqual(before);
    expect(day.host.campaignDay()?.tower.id).toBe(tower);
  });
});

describe('what reaches a rush is a whitelist — § D548 clause 5', () => {
  /**
   * The fields the player brings into a rush: the building they stand on and the dispatcher they test —
   * `rush.ts#RUSH_FIELD_ROLES`' `building` and `dispatcher` rows, named here rather than imported so
   * that the table and this list have to agree by being read, not by being the same object.
   */
  const BROUGHT: readonly string[] = ['buildingId', 'savedBuildings', 'savedClasses', 'dispatcherId', 'savedDispatchers', 'ruleRows', 'selectorSpec', 'levers'];

  it('every field the run reads under a rush is one the press writes, or the building or the dispatcher the player brings', () => {
    const read = new Set<string>();
    const written = new Set<string>();
    for (const [, standing] of standingsOn('midtown-office')) {
      const patch = rushPatchOf(resources, standing);
      if (patch === undefined) throw new Error('no building is standing on midtown-office');
      for (const field of Object.keys(patch)) written.add(field);
      const watched = new Proxy(pressedRush(standing), {
        get: (target, field, receiver) => {
          if (typeof field === 'string') read.add(field);
          return Reflect.get(target, field, receiver) as unknown;
        },
      });
      shiftRunConfigOf(resources, watched);
    }
    /* Non-vacuity: the run reads a campaign field, the press writes it, and every brought field is read. */
    expect(read).toContain('campaignFitOut');
    expect(written).toContain('campaignFitOut');
    expect(BROUGHT.filter((field) => !read.has(field))).toEqual([]);
    expect([...read].filter((field) => !written.has(field) && !BROUGHT.includes(field)).sort()).toEqual([]);
  });
});
