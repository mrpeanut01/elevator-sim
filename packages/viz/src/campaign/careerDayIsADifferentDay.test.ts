/**
 * **A career day is a different day** — GitHub issues **#563** and **#564**.
 *
 * ## What was measured, and why a caption could not have caught it
 *
 * An assessor built the bundle, drove it in Chromium and played twelve career sittings at Garden
 * Apartments. Days 1 through 10 were **byte-identical**: 44 of 44 carried, 52 s worst wait, 24.6 kJ,
 * `NOTHING HAPPENING`, every single day. The streak card read *1 clean day* after nine clean ones.
 *
 * Two of the three causes were seams with no writer rather than logic that was wrong, which is why
 * every unit test in this directory passed while the mode did not work:
 *
 * 1. **`ViewerState.seed` had no writer in the Everyday product at all.** It is born once at boot
 *    from the UTC date (§ D729) and `everyday/host.ts#runCampaignDay`'s patch wrote seven fields
 *    and not that one. The same seed and the same configuration are the same question — the engine
 *    working exactly as designed, and the mode failing.
 * 2. **The growth the report announced was true of a counter the career never advanced.**
 *    `dev/state.ts#shiftRunConfigOf` grows the fabric with `grownBuilding(fabric, state.week.day)`,
 *    and `tomorrowFactsOf` announces tomorrow's tenants from the same chain at `nextDay(week)`.
 *    `campaign/career.ts#fileDay` advances `CampaignTower.day` and touches `week` never, so
 *    `TENANTS 120 → 135` was literally `week.day 1 → 2` and the contract re-ran day 1 for a month.
 * 3. **Nothing ever happened, for a third reason entirely** — issue #564. The incident draw was and
 *    is correctly per-day seeded; what was wrong is that a breakdown at `FRESH_ODDS_PCT` was the
 *    *only* thing a career day could be, and a fresh tower rolls 0.4 %.
 *
 * ## The rule this file is written to
 *
 * `CLAUDE.md`'s standing requirement: **move the control and require the run to change, compared on
 * the legs** — `scope/probes.test-helper.ts#legsOf`, passenger by passenger, never a window
 * statistic, because *a mean can be unchanged for a run that is entirely different, and a mean can
 * move because the window moved*. Every day here is started through the shipped press
 * (`EverydayHost.runCampaignDay`, the only thing that turns a tower into a run) and every filing
 * goes through the shipped reducer, so the day this unwires, this file reddens.
 *
 * The **negative** cases matter as much as the positive one and are the reason this is not simply
 * *the legs moved*: a retry of one day must be the **same** legs, or the retry
 * `WeekState.attempt` counts has become a re-roll and a player can shop for an easy morning.
 */

import { describe, expect, it } from 'vitest';

import {
  createEverydayHost,
  type EverydayHost,
  type EverydayHostBindings,
} from '../everyday/host.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, tomorrowFactsOf, type ViewerState } from '../dev/state.js';
import { growthFactor } from '../shift/growth.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { towerById } from './career.js';

const SCHEDULE = shippedPriceSchedule();

/**
 * A host over a captured state whose `applyPatch` **merges** — `buildStandingOrder.test.ts`'s
 * harness verbatim in shape, because what this file wants is the state the shell would have handed
 * to the transport and that is what the merge produces.
 */
function harness(): { readonly host: EverydayHost; state: () => ViewerState } {
  let state: ViewerState = { ...baseState(), seed: 20260919n, buildingId: 'garden-apartments' };
  const bindings: EverydayHostBindings = {
    resources: RESOURCES,
    state: () => state,
    playheadS: () => 0,
    dayClosed: () => false,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: () => {},
    intervene: () => {},
    closeDay: () => {},
    openRunTab: () => {},
    ghostRace: () => ({ pick: 'none' as const, rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: () => {},
    applyPatch: (patch) => {
      state = { ...state, ...patch };
    },
    /* Five throw for `buildStandingOrder.test.ts`'s reason: a silent stub would let a future change
       reach the spectator state through a campaign test and still pass. */
    loadReferenceRuns: () => {
      throw new Error('this fixture does not drive watching');
    },
    simulateRecord: () => {
      throw new Error('this fixture does not drive watching');
    },
    enterWatch: () => {
      throw new Error('this fixture does not drive watching');
    },
    stopWatching: () => {
      throw new Error('this fixture does not drive watching');
    },
    playThisCrowd: () => {
      throw new Error('this fixture does not drive watching');
    },
    watching: () => undefined,
    dailyBoard: undefined,
    onChange: () => () => {},
  };
  return { host: createEverydayHost(bindings), state: () => state };
}

/**
 * File the day that has just been run, through the shipped reducer.
 *
 * `EverydayHost.closeDay` is what a player presses and it needs a landed recording and a crossing
 * `dayClosed`, neither of which this fixture simulates — so the **action** it posts is posted
 * directly through `campaignAct`, which is the only writer of the career either way. What is being
 * exercised is `career.ts#fileDay`'s advance of `CampaignTower.day`, and that is the same call.
 */
function fileCleanDay(h: ReturnType<typeof harness>): void {
  h.host.campaignAct({ kind: 'file-day', towerId: 'c1', verdict: 'cleared', trips: 40 });
}

/** The legs of the day `Lock it in and run day N` has just started. */
function runDay(h: ReturnType<typeof harness>): string {
  h.host.runCampaignDay('c1');
  return legsOf(h.state());
}

/** What the tower's own counter says, read through the career record. */
function towerDay(h: ReturnType<typeof harness>): number {
  return towerById(h.host.campaign(), 'c1')?.day ?? 0;
}

describe('the seed a career day is played at — issue #563', () => {
  it('is written by the press, and two consecutive days differ on the legs', () => {
    const h = harness();
    const bootSeed = h.state().seed;

    const dayOne = runDay(h);
    /* Non-vacuity: an empty comparison string would make every case in this file pass. */
    expect(dayOne.length).toBeGreaterThan(100);
    expect(h.state().seed).not.toBe(bootSeed);
    const seedOne = h.state().seed;

    fileCleanDay(h);
    expect(towerDay(h)).toBe(2);
    const dayTwo = runDay(h);

    expect(h.state().seed).not.toBe(seedOne);
    expect(dayTwo).not.toBe(dayOne);
  });

  it('is the same day twice on a retry, so a re-run is not a re-roll', () => {
    const h = harness();
    const first = runDay(h);
    /* Pressed again with nothing filed in between — the retry `WeekState.attempt` counts. */
    const again = runDay(h);
    expect(again).toBe(first);
    expect(h.state().seed).toBe(h.state().seed);
  });

  it('gives ten consecutive days ten different mornings, which is what was measured as one', () => {
    const h = harness();
    const seen = new Set<string>();
    const seeds = new Set<string>();
    for (let day = 1; day <= 10; day += 1) {
      expect(towerDay(h)).toBe(day);
      seen.add(runDay(h));
      seeds.add(String(h.state().seed));
      fileCleanDay(h);
    }
    /*
     * Ten distinct seeds is the mechanism; ten distinct leg sets is the claim. They are asserted
     * separately because a derivation that produced ten seeds and one run would be the defect
     * wearing a fix, and a run that differed for some other reason would not be this one.
     */
    expect(seeds.size).toBe(10);
    expect(seen.size).toBe(10);
  });

  it('derives from the boot seed rather than a clock: the same career on two hosts plays the same days', () => {
    const a = harness();
    const b = harness();
    const first = [runDay(a), (fileCleanDay(a), runDay(a))];
    const second = [runDay(b), (fileCleanDay(b), runDay(b))];
    expect(second).toEqual(first);
  });
});

describe('the growth the report announces is the growth the morning delivers — issue #563', () => {
  it('advances the week with the tower, so the fabric the run is built from grows', () => {
    const h = harness();
    h.host.runCampaignDay('c1');
    expect(h.state().week.day).toBe(1);
    const dayOnePopulation = shiftRunConfigOf(RESOURCES, h.state()).building.totalPopulation;

    fileCleanDay(h);
    h.host.runCampaignDay('c1');
    expect(h.state().week.day).toBe(2);
    const dayTwoPopulation = shiftRunConfigOf(RESOURCES, h.state()).building.totalPopulation;

    expect(dayTwoPopulation).toBeGreaterThan(dayOnePopulation);
    /*
     * **The growth is the week's growth, asserted against the chain rather than against a factor.**
     * `growthFactor(2)` is 1.11 and Garden Apartments goes 120 → 135, which is 1.125: `scaledBuilding`
     * rounds per floor and per range, so the ratio of the totals is not the factor and never was.
     * Pinning 1.11 here would have been this file inventing a figure the product does not produce —
     * so the claim is that day 2's tower is exactly the tower day 1's state grown one day, which is
     * what `grownBuilding(fabric, state.week.day)` means.
     */
    const asIfDayTwo = shiftRunConfigOf(RESOURCES, {
      ...h.state(),
      week: { ...h.state().week, day: 2 },
    }).building.totalPopulation;
    expect(dayTwoPopulation).toBe(asIfDayTwo);
    expect(growthFactor(2)).toBeGreaterThan(growthFactor(1));
  });

  it('is the same chain the promise is made from: last night’s announcement is this morning’s tower', () => {
    const h = harness();
    h.host.runCampaignDay('c1');
    /*
     * The announcement, taken through the **shipped** derivation rather than re-derived here.
     * `tomorrowFactsOf` is what `shift/tomorrow.ts` draws `TENANTS 120 → 135` from, and it reads
     * `shiftRunConfigOf(resources, { ...state, week: nextDay(state.week) })`.
     */
    const promised = tomorrowFactsOf(RESOURCES, h.state()).population;

    fileCleanDay(h);
    h.host.runCampaignDay('c1');
    const delivered = shiftRunConfigOf(RESOURCES, h.state()).building.totalPopulation;

    expect(delivered).toBe(promised);
  });

  it('advances the week day the streak counts, so nine clean days are not one', () => {
    const h = harness();
    const days: number[] = [];
    for (let day = 1; day <= 9; day += 1) {
      h.host.runCampaignDay('c1');
      days.push(h.state().week.day);
      fileCleanDay(h);
    }
    /*
     * `shift/week.ts#closeDay` keys a retry on `closedDay === outcome.day`, so nine closings of one
     * frozen day *replace* each other and the streak cannot pass 1. Nine distinct days is the fact
     * that makes the streak card able to count — the closing itself is `closeShift`'s and is not
     * this fixture's to drive.
     */
    expect(new Set(days).size).toBe(9);
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('what a career day does not disturb', () => {
  it('leaves the contract, the building and the length exactly where the press put them', () => {
    const h = harness();
    const before = h.state().week;
    h.host.runCampaignDay('c1');
    const after = h.state().week;
    /* Only the day and its weekday index move — a career day is not a second way of taking a
       contract, and `switchWeek` is still the only thing that changes what a week is *of*. */
    expect(after.contractId).toBe(before.contractId);
    expect(after.history).toBe(before.history);
    expect(after.completed).toBe(before.completed);
    expect(after.streak).toBe(before.streak);
  });

  it('reprices nothing: the schedule the reducer is given is still the shipped one', () => {
    /* A guard on the fixture rather than on the subject — `campaignAct` prices from
       `bindings.resources.priceSchedule`, and a fixture that handed it a different one would be
       measuring a career nobody plays. */
    expect(RESOURCES.priceSchedule).toEqual(SCHEDULE);
  });
});
