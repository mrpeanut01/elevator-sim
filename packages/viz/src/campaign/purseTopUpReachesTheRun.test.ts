/**
 * **A chime top-up reaches a run, compared on the legs** — GitHub issue #557,
 * [§ D738](../../../../DECISIONS.md), § D177's rule and § D427's shape.
 *
 * The issue is the standing requirement pointed at a purchase: `data/chime-ledger.json` priced
 * `career-purse-top-up` at 10 chimes for 6 units, the server charged it and answered it, and
 * **nothing in the tree could record a granted unit** — `CampaignAction` had ten arms and none
 * wrote a grant, `spends` was only ever a debit, and `purseOf` summed three derived terms. It would
 * have been the first dead seam in this repository a player *paid for*, which is why the criterion
 * the issue writes for closing it is a run rather than a wiring diagram.
 *
 * ## What is proved here, and why nothing weaker would do
 *
 * *A tower that bought a top-up and one that did not, same seed, compared on the legs.* The
 * comparison string is `scope/probes.test-helper.ts#legsOf` — passenger, car, boarding instant, in
 * the recording's own order — never a mean, for § D177's reason: *a mean can be unchanged for a run
 * that is entirely different, and a mean can move because the window moved.*
 *
 * **Every step goes through the shipped press.** `everyday/host.ts#spendChime` is what a player's
 * press on the Settings spend panel calls, `campaignAct` is the only writer of the career, and
 * `runCampaignDay` is the only thing that turns a tower into a run. Nothing here hand-writes a
 * `grants` row or a `fitted` map. So the day somebody unwires any link in that chain, this file
 * reddens rather than a screen quietly going back to selling nothing.
 *
 * ## The chain the grant travels, which is the whole design in one sentence
 *
 * A top-up writes a {@link PurseGrant} row → `economy.ts#grantedUnits` sums it into `purseOf` →
 * `career.ts#pressTier`'s `purseOf(tower) < units` gate stops refusing a tier the tower could not
 * afford → the booking fits → `fitOutOf` carries the kit onto the run `runCampaignDay` starts.
 * **Units are money and nothing else**, so the grant moves no leg by itself; it moves the legs by
 * buying something that does, and the third arm below is that distinction as a case.
 *
 * ## The cell, and why this pair of tiers
 *
 * `garden-apartments` at the length `shift/contracts.ts` declares for `c1` — the campaign's own
 * cell, for `fitOut.test.ts`'s reason: `openingCareer` holds `c1` and nothing else, and
 * `runCampaignDay` writes that contract's length itself, so a proof taken anywhere else would be a
 * proof about a day the campaign never runs.
 *
 * The purchase the grant unlocks is **`tenants` L1, queue marshalling** — 5 units, no nights — and
 * it is chosen because `fitOut.test.ts` independently measures that tier moving the legs at this
 * exact cell (`garden-apartments` is residential, so the shipped 1.2 s transfer ceiling bites),
 * while three of the sixteen shop tiers move nothing here for physical reasons. A leg comparison at
 * an empty cell reports nothing, and picking a tier whose emptiness is measured elsewhere is how
 * this file avoids proving the opposite of what it claims.
 *
 * Both arms first buy **`doors` L1** (4 units, no nights) out of the standard difficulty's opening
 * purse of 8. That is not scene-setting: it is what makes the arms differ by the grant alone. With
 * 4 units left, queue marshalling is short by exactly one unit, so the un-granted tower's press is
 * *refused by the shipped reducer* and the granted tower's is not. A player meets this as the shop
 * row turning from *Short by 1 chime's worth* into a tier they can press.
 */

import { describe, expect, it } from 'vitest';

import { chimeGrantUnits } from '@elevator-sim/core/browser';

import {
  createEverydayHost,
  type EverydayChimeSpend,
  type EverydayHost,
  type EverydayHostBindings,
} from '../everyday/host.js';
import { CAREER_TOP_UP_NO_TOWER } from '../everyday/host.js';
import { CHIME_PRICES } from '../everyday/chimesPanel.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftLengthForContract, type ViewerState } from '../dev/state.js';

import { applyCampaignAction, openingCareer, towerById, type CampaignCareer } from './career.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { CareerStore } from '../everyday/careerStore.js';
import {
  CAREER_PURSE_TOP_UP_SINK_ID,
  carriedIn,
  contractIsLost,
  fittedLevel,
  committedUnits,
  earnedSoFar,
  grantedUnits,
  purseOf,
  standingOf,
} from './economy.js';

/** The shipped price schedule, because a reducer that prices anything is given the real one. */
const SCHEDULE = shippedPriceSchedule();

/** The shipped sink, from `data/chime-ledger.json` rather than from a literal here. */
const SINK = CHIME_PRICES.sinks.find((sink) => sink.id === CAREER_PURSE_TOP_UP_SINK_ID);

/** What one step of it grants, by the ledger's own arithmetic. */
const GRANT_UNITS = SINK === undefined ? 0 : chimeGrantUnits(SINK, 1);

/**
 * A host over a captured state whose `applyPatch` **merges** — `buildStandingOrder.test.ts`'s
 * harness, extended by the one binding this subject needs.
 *
 * `spendChime` stands in for `packages/server`'s ledger and for nothing else: it answers `bought`
 * with the **ledger's** own grant figure, because that is what the server answers with and because
 * a figure invented here would be this file agreeing with itself. It also **counts its calls**, so
 * the two refusal cases below can assert that nothing was sent rather than that nothing was
 * recorded — a player charged for a grant that landed nowhere is issue #557's own defect with their
 * chimes attached to it.
 */
function harness(saved?: CampaignCareer): {
  readonly host: EverydayHost;
  state: () => ViewerState;
  readonly ledgerCalls: () => number;
} {
  let state: ViewerState = { ...baseState(), buildingId: 'garden-apartments' };
  let calls = 0;
  /*
   * A store rather than a mutated field, because `createEverydayHost` restores its career from one
   * and holds it in a closure afterwards. `saved` is how the two states below are reached: a desk
   * handed back, and a contract lost. Both are states a player reaches by playing — `answerNeed`
   * clears `openTowerId` and § 8.10 ends a month — and neither is reachable through an action this
   * fixture could post, which is why they arrive as a saved career instead.
   */
  let held: CampaignCareer | undefined = saved;
  const store: CareerStore = {
    load: () =>
      held === undefined
        ? { career: undefined, refusal: undefined, notice: undefined }
        : { career: held, refusal: undefined, notice: undefined },
    save: (career) => {
      held = career;
    },
    clear: () => {
      held = undefined;
    },
  };
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
    spendChime: (_sinkId, steps) => {
      calls += 1;
      return Promise.resolve<EverydayChimeSpend>({
        kind: 'bought',
        chimes: 30,
        grantUnits: SINK === undefined ? 0 : chimeGrantUnits(SINK, steps),
      });
    },
    dailyBoard: undefined,
    onChange: () => () => {},
  };
  return {
    host: createEverydayHost(bindings, store),
    state: () => state,
    ledgerCalls: () => calls,
  };
}

/** The purse on `c1`, read through the shipped derivation. */
function purse(h: ReturnType<typeof harness>): number {
  const tower = towerById(h.host.campaign(), 'c1');
  if (tower === undefined) throw new Error('the opening career has no c1');
  return purseOf(tower);
}

/**
 * A category's fitted level, **derived** — `economy.ts#fittedLevel` rather than `tower.fitted`.
 *
 * The distinction is § 8.2's and it caught this file out: a zero-night tier writes a *booking*
 * whose nights are already behind today, and `fitted` is the carried map a renewal leaves behind.
 * Reading the raw field would have asserted about the wrong record and passed for the wrong reason.
 */
function fittedLevelOf(h: ReturnType<typeof harness>, categoryId: string): number {
  const tower = towerById(h.host.campaign(), 'c1');
  if (tower === undefined) throw new Error('the opening career has no c1');
  return fittedLevel(tower, categoryId);
}

/** Buy the doors both arms buy, leaving one unit less than queue marshalling costs. */
function buyDoors(h: ReturnType<typeof harness>): void {
  h.host.campaignAct({ kind: 'press-tier', towerId: 'c1', categoryId: 'doors', level: 1 });
}

/** Press the tier the grant is what pays for. Refused, or fitted — the arm decides which. */
function pressMarshal(h: ReturnType<typeof harness>): void {
  h.host.campaignAct({ kind: 'press-tier', towerId: 'c1', categoryId: 'tenants', level: 1 });
}

describe('the ledger sells a sink that grants units — issue #557’s premise', () => {
  it('is priced, sells units, and grants a whole number of them above zero', () => {
    expect(SINK, CAREER_PURSE_TOP_UP_SINK_ID).toBeDefined();
    expect(SINK?.modifier.kind).toBe('purse-units');
    expect(GRANT_UNITS).toBeGreaterThan(0);
    expect(Number.isInteger(GRANT_UNITS)).toBe(true);
  });
});

describe('the opening purse is one unit short, which is what makes the arms differ by the grant', () => {
  it('affords the doors and then refuses the marshal, through the shipped reducer', () => {
    const h = harness();
    expect(purse(h)).toBe(8);
    buyDoors(h);
    expect(purse(h)).toBe(4);
    pressMarshal(h);
    /* Refused: the reducer returns the record it was given, so nothing is booked and nothing fits. */
    expect(towerById(h.host.campaign(), 'c1')?.bookings.map((b) => b.categoryId)).toEqual(['doors']);
    /* And the shortfall is one unit, so a grant of any size at all closes it. */
    expect(GRANT_UNITS).toBeGreaterThanOrEqual(1);
  });

  it('runs the day at the campaign’s own cell, which is where the comparison is taken', () => {
    const h = harness();
    h.host.runCampaignDay('c1');
    expect(h.state().buildingId).toBe('garden-apartments');
    expect(h.state().shiftLengthS).toBe(shiftLengthForContract('c1'));
  });
});

describe('a granted unit reaches the run — the legs, same seed', () => {
  /** Doors bought, marshal refused for want of a unit, day run. */
  function legsWithoutTopUp(): string {
    const h = harness();
    buyDoors(h);
    pressMarshal(h);
    h.host.runCampaignDay('c1');
    return legsOf(h.state());
  }

  /** The same, with a top-up bought through the shipped press between the two. */
  async function legsWithTopUp(): Promise<string> {
    const h = harness();
    buyDoors(h);
    const outcome = await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    expect(outcome.kind).toBe('bought');
    pressMarshal(h);
    h.host.runCampaignDay('c1');
    return legsOf(h.state());
  }

  it('moves the legs, and moves them only by what the units bought', async () => {
    const asBuilt = legsWithoutTopUp();
    /* Non-vacuity: an empty comparison string would make every case here pass. */
    expect(asBuilt.length).toBeGreaterThan(100);

    const toppedUp = await legsWithTopUp();
    expect(toppedUp).not.toBe(asBuilt);

    /*
     * **The control, and it is the one that says what kind of thing a unit is.** A tower that
     * bought the same top-up and pressed nothing runs the *identical* day — so the grant is money
     * rather than a modifier, `docs/32` GD11 and GD13 discharged by a run rather than by a
     * promise. It is also what stops this file mistaking a purchase that perturbs the seed for a
     * purchase that reaches the fabric.
     */
    const h = harness();
    buyDoors(h);
    await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    h.host.runCampaignDay('c1');
    expect(legsOf(h.state())).toBe(asBuilt);
  });

  it('and the purse is what changed: the same press is refused before and taken after', async () => {
    const h = harness();
    buyDoors(h);
    const before = purse(h);
    pressMarshal(h);
    expect(fittedLevelOf(h, 'tenants')).toBe(0);

    await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    expect(purse(h)).toBe(before + GRANT_UNITS);
    pressMarshal(h);
    expect(fittedLevelOf(h, 'tenants')).toBe(1);
    /* And the day the run is started with carries it — `fitOutOf`'s answer, not a second reading. */
    h.host.runCampaignDay('c1');
    expect(h.state().campaignFitOut?.transferCeilingS).toBeDefined();
  });
});

describe('what the record keeps — § D526, and a purse that stays derived', () => {
  it('records the spend against the tower and the day it modified', async () => {
    const h = harness();
    h.host.runCampaignDay('c1');
    await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    const tower = towerById(h.host.campaign(), 'c1');
    expect(tower?.grants).toEqual([
      { day: tower?.day, units: GRANT_UNITS, sinkId: CAREER_PURSE_TOP_UP_SINK_ID },
    ]);
  });

  it('keeps `purseOf` a sum over the record rather than a stored balance', async () => {
    const h = harness();
    await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    const tower = towerById(h.host.campaign(), 'c1');
    if (tower === undefined) throw new Error('the opening career has no c1');
    /*
     * The four terms, summed here from the same record the function reads. The second assertion is
     * the one that would catch a latch: delete the grant row and the purse goes back to what it
     * was, which is only true of a derivation.
     */
    expect(purseOf(tower)).toBe(
      Math.max(0, carriedIn(tower) + earnedSoFar(tower) + grantedUnits(tower) - committedUnits(tower)),
    );
    expect(purseOf({ ...tower, grants: [] })).toBe(purseOf(tower) - GRANT_UNITS);
  });

  it('buys no standing, no day back and no night — GD11, GD13 and GD14', async () => {
    const h = harness();
    const before = h.host.campaign();
    const towerBefore = towerById(before, 'c1');
    await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    const after = h.host.campaign();
    const towerAfter = towerById(after, 'c1');
    if (towerBefore === undefined || towerAfter === undefined) throw new Error('no c1');
    expect(standingOf(after.carry, after.towers)).toBe(standingOf(before.carry, before.towers));
    expect(towerAfter.missed).toBe(towerBefore.missed);
    expect(towerAfter.day).toBe(towerBefore.day);
    expect(towerAfter.bookings).toEqual(towerBefore.bookings);
  });

  it('survives a fresh month started by changing the difficulty, and is not minted by it', async () => {
    /*
     * § 8.3 hands back this month's bookings and answers; a top-up was paid for out of an account
     * ledger this action cannot refund, so it stays (§ D526 clause 4). And pressing it twice mints
     * nothing: the row is written per purchase and this action writes none.
     */
    const h = harness();
    await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    h.host.campaignAct({ kind: 'set-difficulty', towerId: 'c1', difficultyId: 'easy' });
    h.host.campaignAct({ kind: 'set-difficulty', towerId: 'c1', difficultyId: 'standard' });
    expect(towerById(h.host.campaign(), 'c1')?.grants).toHaveLength(1);
  });
});

describe('the reducer is the lock, and it refuses on its own side', () => {
  /*
   * `applyCampaignAction` directly here rather than through the host, because these are the arms
   * the host's gate is supposed to make unreachable — and a lock that is only ever tested through
   * the key is a lock nobody has tried. `applyCampaignAction`'s convention is that a refusal
   * returns the record it was given, which is what each case asserts.
   */
  const act = (career: CampaignCareer, action: Parameters<typeof applyCampaignAction>[1]): CampaignCareer =>
    applyCampaignAction(career, action, SCHEDULE);

  it('refuses a tower the career does not hold', () => {
    const career = openingCareer('collective');
    expect(
      act(career, { kind: 'grant-units', towerId: 'nope', units: 6, sinkId: CAREER_PURSE_TOP_UP_SINK_ID }),
    ).toBe(career);
  });

  it('refuses units that are not a whole number above zero', () => {
    const career = openingCareer('collective');
    for (const units of [0, -6, 2.5, Number.NaN]) {
      expect(
        act(career, { kind: 'grant-units', towerId: 'c1', units, sinkId: CAREER_PURSE_TOP_UP_SINK_ID }),
        `units ${String(units)}`,
      ).toBe(career);
    }
  });

  it('refuses a contract already lost, because a purse nothing can spend is not one', () => {
    const opening = openingCareer('collective');
    const career: CampaignCareer = {
      ...opening,
      towers: opening.towers.map((tower) => ({ ...tower, missed: 4 })),
    };
    expect(
      act(career, { kind: 'grant-units', towerId: 'c1', units: 6, sinkId: CAREER_PURSE_TOP_UP_SINK_ID }),
    ).toBe(career);
  });

  it('takes a well-formed grant, so the three refusals above are refusals rather than a dead arm', () => {
    const career = openingCareer('collective');
    const next = act(career, {
      kind: 'grant-units',
      towerId: 'c1',
      units: 6,
      sinkId: CAREER_PURSE_TOP_UP_SINK_ID,
    });
    expect(next).not.toBe(career);
    expect(towerById(next, 'c1')?.grants).toEqual([
      { day: 1, units: 6, sinkId: CAREER_PURSE_TOP_UP_SINK_ID },
    ]);
  });
});

describe('a top-up with nowhere to land is refused before the chimes are taken', () => {
  /** A career whose desk has been handed back — `answerNeed`'s own end state. */
  function deskClosed(): CampaignCareer {
    return { ...openingCareer('collective'), openTowerId: undefined };
  }

  /** A career whose month is over — § 8.10, more missed days than the difficulty allows. */
  function contractLost(): CampaignCareer {
    const opening = openingCareer('collective');
    return {
      ...opening,
      towers: opening.towers.map((tower) => ({ ...tower, missed: 4 })),
    };
  }

  it('refuses a closed desk with the host\u2019s own sentence, and sends nothing to the ledger', async () => {
    const h = harness(deskClosed());
    const outcome = await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    expect(outcome).toEqual({ kind: 'refused', detail: CAREER_TOP_UP_NO_TOWER });
    expect(h.ledgerCalls()).toBe(0);
    expect(towerById(h.host.campaign(), 'c1')?.grants).toEqual([]);
  });

  it('refuses a lost contract too, because a purse nothing can spend is not one', async () => {
    const h = harness(contractLost());
    const tower = towerById(h.host.campaign(), 'c1');
    if (tower === undefined) throw new Error('no c1');
    /* The premise, asserted rather than assumed: this is § 8.10's end of the month. */
    expect(contractIsLost(tower)).toBe(true);
    const outcome = await h.host.spendChime(CAREER_PURSE_TOP_UP_SINK_ID, 1);
    expect(outcome.kind).toBe('refused');
    expect(h.ledgerCalls()).toBe(0);
  });

  it('and the sentence says nothing was spent, because nothing was', () => {
    expect(CAREER_TOP_UP_NO_TOWER).toContain('Nothing was spent');
  });

  it('leaves the other sinks alone: a rush pre-fit is not gated on a career desk', async () => {
    const h = harness(deskClosed());
    const outcome = await h.host.spendChime('rush-prefit', 1);
    expect(outcome.kind).toBe('bought');
    expect(h.ledgerCalls()).toBe(1);
    /* And a sink that grants no units writes no grant row, whatever the server answers. */
    expect(towerById(h.host.campaign(), 'c1')?.grants).toEqual([]);
  });
});
