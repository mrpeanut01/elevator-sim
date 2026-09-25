/**
 * The budget arithmetic and the four outcomes — ENGINE_CONTRACT § 9 and GAMEPLAY § 10.4, driven.
 *
 * Everything here is pure, so the suite is exhaustive where the contract is numeric: the editor
 * prices, the affordability gate with its short-by wording, and a classification that must be
 * total over states the shipped panel cannot even produce (over budget is § 10.4's third outcome
 * and § 10.2 makes it unreachable through the toggles — both facts are asserted).
 */

import { describe, expect, it } from 'vitest';

import { PARKING_STRATEGIES } from '@elevator-sim/core/browser';

import { priceOf, purchaseUnits } from '../pricing/parse.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PricedChange, PriceSchedule } from '../pricing/types.js';

import {
  BASIS_LINE,
  COMPLAINT_GONE_PCT,
  editorPricingFrom,
  REST_DROP_LIMIT_POINTS,
  standingExtrasFrom,
  affordabilityOf,
  budgetNoteOf,
  classifyOutcome,
  emptyFixitState,
  fixedBadgeAfter,
  spendOf,
  editorPathsOf,
  parkingPriceUnits,
  setParkingStrategy,
  stepCapacity,
  stepSpeed,
  stepTopFloorRaise,
  stepZoneOverlap,
  topFloorRaisePriceUnits,
  zonePriceUnits,
  toggleRepair,
  type FixitMeasurement,
  type FixitSpend,
  DEMAND_BASIS_LINE,
  repairChangesTheCrowd,
  selectionKeepsTheCrowd,
} from './engine.js';
import { EDITOR_PARKING_STRATEGIES } from './types.js';
import type { FixitCase, FixitState } from './types.js';

const PATCH = { dispatcher: { idle: { parkingStrategy: 'stay' } } };

/**
 * A new-shaft repair's patch, and it has to be a real one — GitHub issue **#568**.
 *
 * Every repair below used to carry {@link PATCH}, including the one whose role is `new-shaft`, and
 * that was harmless only while `machineryUnits` read the **role**. It reads the **patch** now, so a
 * shaft that adds no car buys no machinery and correctly reports none. The fixture is corrected
 * rather than the rule relaxed: a `new-shaft` repair that adds no car is not a thing
 * `data/fixit-cases.json` can express, and `fixit/parse.ts` refuses one.
 */
const SHAFT_PATCH = { building: { addCars: [{ bankId: 'main', copyCarId: 'A', id: 'B' }] } };

const CASE: FixitCase = {
  id: 'test-case',
  name: 'The test case',
  buildingId: 'tower',
  dispatcherProfileId: 'order',
  run: { seed: '1', durationS: 900, arrivalRatePctPop5min: null },
  asBuilt: { note: 'As it stands.', patch: {} },
  complaint: {
    text: 'The wait is long.',
    complainer: 'tenant',
    measure: {
      kind: 'long-waits',
      label: 'waits over a minute',
      thresholdS: 60,
      scope: { mode: 'origin', floorIds: ['3'] },
    },
  },
  symptom: 'waits',
  figures: [],
  diagnosis: { text: 'Parked wrong.', reasoning: 'Measured.' },
  budgetUnits: 12,
  repairs: [
    { id: 'free-fix', role: 'diagnosed', name: 'Spread the fleet', costUnits: 0, effect: 'target', patch: PATCH },
    { id: 'dear-fix', role: 'costly-fix', name: 'Re-gear', costUnits: 10, effect: 'worst', patch: PATCH },
    { id: 'small-fix', role: 'cheap-fix', name: 'Trim dwell', costUnits: 2, effect: 'mean', patch: PATCH },
    { id: 'shaft', role: 'new-shaft', name: 'A new shaft', costUnits: 34, effect: 'capital', patch: SHAFT_PATCH },
  ],
  result: { head: 'Fixed head.', body: 'Fixed body.' },
};

const MEASURED: FixitMeasurement = {
  complaintBefore: 10,
  complaintAfter: 1,
  scopeBoardedBefore: 40,
  scopeBoardedAfter: 41,
  complaintGonePct: 90,
  restAwayBeforePct: 96,
  restAwayAfterPct: 95,
  restBoardedBefore: 100,
  restBoardedAfter: 100,
  restDeltaPoints: -1,
  sameCrowd: true,
};

describe('spend and the editor prices', () => {
  /**
   * **The editor's three prices, and the one that moved** — GitHub issue **#366**.
   *
   * This read *shaft 34, speed 6 per half-metre, capacity 8 per two places* and two of those are
   * unchanged. The middle one is the conflict the schedule was written to end: the fix cases
   * charge 8, 9 or 10 units for the same 0.5 m/s bump, so a player buying one metre per second
   * paid **6** in the editor and **10** as a repair depending on which screen they were standing
   * on. The schedule prices it once, at the cases' own mode, and the editor now reads that.
   *
   * The figures are asserted as literals rather than read back off the schedule, deliberately: a
   * test that compared the schedule with itself would pass whatever the file said. This is the
   * place a price change has to be looked at by a person.
   */
  it('prices the contract: shaft 34, speed 10 per half-metre, capacity 8 per two places', () => {
    expect(editorPricingFrom(shippedPriceSchedule())).toEqual({
      shaftUnits: 34,
      speedUnitsPerHalfMps: 10,
      capacityUnitsPerTwoPlaces: 8,
    });
  });

  /**
   * The three sums, on a selection that lands **exactly** on this 12 u case's budget.
   *
   * It used to add a 1 u extra as well, and that no longer fits: #366 moved the editor's speed step
   * from 6 u to 10, so a repair, an extra and a step come to 13 and the reducer correctly refuses
   * the step. The extra is dropped rather than the budget raised — this file's other cases are
   * written against 12 — and landing on the budget exactly is the more interesting arithmetic
   * anyway, because it is the boundary `affordabilityOf` is about.
   */
  it('sums repairs, extras and editor machinery, and counts the steel', () => {
    let state = toggleRepair(CASE, emptyFixitState(), 'small-fix', shippedPriceSchedule());
    state = stepSpeed(CASE, state, 1, shippedPriceSchedule());
    const spend = spendOf(CASE, state, shippedPriceSchedule());
    expect(spend).toEqual({
      repairUnits: 2,
      extraUnits: 0,
      editorUnits: 10,
      totalUnits: 12,
      machineryUnits: 10,
    });

    /* And one more step on top of that is refused, which is the boundary the sum just reached. */
    expect(stepSpeed(CASE, state, 1, shippedPriceSchedule())).toBe(state);
  });

  /**
   * A shaft is machinery **because of what its patch buys**, not because of its role — GitHub issue
   * **#568**. The assertion is unchanged; what moved underneath it is that `spendOf` now reaches the
   * same 34 through `building.addCars[]` → the schedule's `new-car` row, which is the same row the
   * editor's own shaft price is read from.
   */
  it('counts a selected new shaft as machinery — § 10.4 asks how much of the spend was steel', () => {
    const state: FixitState = { ...emptyFixitState(), selectedRepairIds: ['shaft'] };
    expect(spendOf(CASE, state, shippedPriceSchedule()).machineryUnits).toBe(34);
  });

  /**
   * **A repair that buys nothing but machinery reports all of it** — GitHub issue **#568**, the
   * defect this file could not see before.
   *
   * The fixture's `dear-fix` is priced 10 u and its patch is a parking rule, so it reports **0** —
   * correctly, and that is the control. Re-pointed at `faster-machines`, the **same schedule row
   * the editor's own speed stepper buys at the same 10 u**, it must report 10. The shipped case
   * that produced the issue is `sleeping-sky-lobby`'s *Re-gear the shuttles*: eight re-geared
   * machines at 10 u, drawn as *"10 u, of which 0 u is machinery"* beside a stepper drawing *"10 u,
   * of which 10 u is machinery"*.
   *
   * Both arms are asserted, because a rule that answered *machinery* to everything would pass the
   * second alone.
   */
  it('counts machinery bought through a repair patch, and only where the patch buys it', () => {
    const schedule = shippedPriceSchedule();
    const parkingRepair: FixitState = { ...emptyFixitState(), selectedRepairIds: ['dear-fix'] };
    expect(spendOf(CASE, parkingRepair, schedule).machineryUnits).toBe(0);

    const regeared: FixitCase = {
      ...CASE,
      repairs: CASE.repairs.map((repair) =>
        repair.id === 'dear-fix'
          ? {
              ...repair,
              patch: { building: { cars: [{ carIds: ['A'], set: { ratedSpeedDeltaMps: 0.5 } }] } },
            }
          : repair,
      ),
    };
    const spend = spendOf(regeared, parkingRepair, schedule);
    expect(spend.repairUnits).toBe(10);
    expect(spend.machineryUnits).toBe(10);
    expect(budgetNoteOf(regeared, spend)).toBe(
      'You are buying machinery — compare it against the free change first.',
    );
  });

  it('offers the five standing extras at the contract prices, none with a patch', () => {
    expect(standingExtrasFrom(shippedPriceSchedule()).map((extra) => [extra.id, extra.costUnits])).toEqual([
      ['traffic-survey', 3],
      ['landing-indicators', 4],
      ['car-interiors', 5],
      ['call-out-cover', 6],
      ['tenant-notices', 1],
    ]);
  });
});

describe('affordability — § 10.2', () => {
  it('refuses a selection that would go over budget, and says what it is short by', () => {
    const state = toggleRepair(CASE, emptyFixitState(), 'dear-fix', shippedPriceSchedule()); // 10 of 12 spent
    const affordability = affordabilityOf(CASE, state, 34, shippedPriceSchedule());
    expect(affordability.selectable).toBe(false);
    expect(affordability.shortByUnits).toBe(32);
  });

  it('the new shaft is never affordable, even with nothing else selected', () => {
    const shaft = CASE.repairs[3] as FixitCase['repairs'][number];
    expect(affordabilityOf(CASE, emptyFixitState(), shaft.costUnits, shippedPriceSchedule()).selectable).toBe(false);
  });

  it('a reducer refuses what the panel could not offer, so the gate holds without the panel', () => {
    const state = toggleRepair(CASE, emptyFixitState(), 'dear-fix', shippedPriceSchedule());
    expect(toggleRepair(CASE, state, 'shaft', shippedPriceSchedule())).toBe(state);
    // 10 spent, a speed step (10) does not fit; a return below zero is refused too.
    expect(stepSpeed(CASE, state, 1, shippedPriceSchedule())).toBe(state);
    const empty = emptyFixitState();
    expect(stepCapacity(CASE, empty, -1, shippedPriceSchedule())).toBe(empty);
  });

  /**
   * The arithmetic here moved with the schedule (#366): a speed step is 10 u rather than 6, so on
   * this 12 u case one step fits and a second does not, where two used to fit exactly. The claim is
   * unchanged — the stepper caps live at what the budget has left — and the numbers are spelled out
   * so the next price change has to be looked at rather than absorbed.
   */
  it('caps the steppers live at the remaining budget', () => {
    let state = emptyFixitState();
    state = stepSpeed(CASE, state, 1, shippedPriceSchedule()); // 10 of 12
    expect(state.speedSteps).toBe(1);
    expect(stepCapacity(CASE, state, 1, shippedPriceSchedule())).toBe(state); // 10 + 8 > 12
    expect(stepSpeed(CASE, state, 1, shippedPriceSchedule())).toBe(state); // 10 + 10 > 12
  });
});

describe('the four outcomes — § 10.4, copy verbatim', () => {
  it('all three bars held: the authored result, and the case reads FIXED', () => {
    const outcome = classifyOutcome(CASE, MEASURED, spendOf(CASE, emptyFixitState(), shippedPriceSchedule()));
    expect(outcome.kind).toBe('fixed');
    expect(outcome.head).toBe('Fixed head.');
    expect(outcome.rows.map((row) => row.passed)).toEqual([true, true, true]);
    expect(outcome.basis).toBe(BASIS_LINE);
    expect(outcome.basis).toBe(
      'one run before, one run after — enough to see a repair this size; not enough to split hairs.',
    );
  });

  /*
   * GitHub issues #349 and #350: the basis follows the **measured** crowd, so a pair whose repair
   * changed who arrives never prints the same-crowd sentence, whatever the outcome kind.
   */
  it('prints the demand basis when the legs say the crowd changed, on every outcome kind', () => {
    const changed = { ...MEASURED, sameCrowd: false };
    expect(classifyOutcome(CASE, changed, spendOf(CASE, emptyFixitState(), shippedPriceSchedule())).basis).toBe(DEMAND_BASIS_LINE);
    expect(
      classifyOutcome(CASE, { ...changed, restAwayAfterPct: 90, restDeltaPoints: -6 }, spendOf(CASE, emptyFixitState(), shippedPriceSchedule())).basis,
    ).toBe(DEMAND_BASIS_LINE);
    expect(DEMAND_BASIS_LINE).toContain('changed who arrives');
    expect(DEMAND_BASIS_LINE).not.toBe(BASIS_LINE);
  });

  it('reads a crowd-changing repair off its patch, and a selection off its repairs', () => {
    const population = { building: { floorPopulations: [{ floorIds: ['3'], population: 10 }] } };
    const demand: FixitCase = {
      ...CASE,
      repairs: [{ ...(CASE.repairs[0] as FixitCase['repairs'][number]), patch: population }, ...CASE.repairs.slice(1)],
    };
    expect(repairChangesTheCrowd(demand.repairs[0] as FixitCase['repairs'][number])).toBe(true);
    expect(repairChangesTheCrowd(CASE.repairs[0] as FixitCase['repairs'][number])).toBe(false);
    expect(selectionKeepsTheCrowd(demand, emptyFixitState())).toBe(true);
    expect(selectionKeepsTheCrowd(demand, { ...emptyFixitState(), selectedRepairIds: ['free-fix'] })).toBe(false);
    expect(selectionKeepsTheCrowd(demand, { ...emptyFixitState(), selectedRepairIds: ['dear-fix'] })).toBe(true);
  });

  it('complaint fixed, building worse — somebody else is paying for it', () => {
    const outcome = classifyOutcome(
      CASE,
      { ...MEASURED, restAwayAfterPct: 90, restDeltaPoints: -6 },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(outcome.kind).toBe('building-worse');
    expect(outcome.head).toBe('The complaint is gone, and somebody else is paying for it.');
    expect(outcome.body).toBe(
      'Everyone else waits longer than they did this morning, which is a second letter you have not received yet.',
    );
  });

  it('over budget — the owner has said no, and it outranks both measured rows', () => {
    const outcome = classifyOutcome(CASE, MEASURED, {
      repairUnits: 34,
      extraUnits: 0,
      editorUnits: 0,
      totalUnits: 34,
      machineryUnits: 34,
    });
    expect(outcome.kind).toBe('over-budget');
    expect(outcome.head).toBe('Over the budget, and the owner has said no.');
    expect(outcome.body).toBe(
      'This is a repair budget. What you have specified is a capital project, and the owner will ' +
        'want a business case rather than a work order.',
    );
    expect(outcome.rows[2]?.verdict).toBe('over by 22 u');
  });

  it('not enough — better, and the complaint still stands', () => {
    const outcome = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: 40 },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(outcome.kind).toBe('not-enough');
    expect(outcome.head).toBe('Better, and the complaint still stands.');
    expect(outcome.body).toBe('Change something else and run it again.');
  });

  it('a run showing none of the complaint fails the bar honestly rather than passing vacuously', () => {
    const outcome = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: null },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(outcome.kind).toBe('not-enough');
    expect(outcome.rows[0]?.verdict).toContain('nothing to remove');
  });

  it('a scoped mean travels with the count it was taken over — issue #137\'s rule', () => {
    const meanCase: FixitCase = {
      ...CASE,
      complaint: { ...CASE.complaint, measure: { ...CASE.complaint.measure, kind: 'mean-wait' } },
    };
    const outcome = classifyOutcome(meanCase, MEASURED, spendOf(CASE, emptyFixitState(), shippedPriceSchedule()));
    expect(outcome.rows[0]?.before).toBe('10.0 s over 40 boarded journeys');
    expect(outcome.rows[0]?.after).toBe('1.0 s over 41 boarded journeys');
  });

  it('holds the two thresholds the contract names', () => {
    expect(COMPLAINT_GONE_PCT).toBe(80);
    expect(REST_DROP_LIMIT_POINTS).toBe(2);
  });

  /**
   * `docs/20` defect 8. The fourth branch is the one this test exists for: the panel drew
   * *"11 of 12 u committed, 0 u of it machinery — Everything you changed is a setting, and settings
   * are free"*, keying *free* on machinery spend rather than on spend.
   */
  it('the four budget notes are decided by the spend, not by the panel', () => {
    expect(budgetNoteOf(CASE, spendOf(CASE, emptyFixitState(), shippedPriceSchedule()))).toContain('settings are free');
    const machinery = spendOf(CASE, { ...emptyFixitState(), speedSteps: 1 }, shippedPriceSchedule());
    expect(budgetNoteOf(CASE, machinery)).toContain('buying machinery');
    expect(
      budgetNoteOf(CASE, { repairUnits: 34, extraUnits: 0, editorUnits: 0, totalUnits: 34, machineryUnits: 34 }),
    ).toContain('Over the budget');

    // Committed, inside the budget, and not one unit of it machinery — the audit's own state.
    const settingsThatCost: FixitSpend = {
      repairUnits: 11,
      extraUnits: 0,
      editorUnits: 0,
      totalUnits: 11,
      machineryUnits: 0,
    };
    const note = budgetNoteOf(CASE, settingsThatCost);
    expect(note).not.toContain('settings are free');
    expect(note).toContain('committed budget is committed');
  });
});

/**
 * The three copy faults `docs/20` defect 8 found on one screen.
 *
 * Each is a sentence that stopped describing the numbers beside it, which is why they are asserted
 * against the *measurement* and the *spend* rather than against a snapshot of the words.
 */
describe('a verdict may not claim more than the run measured — docs/20 defect 8', () => {
  it('says Better only when some of the complaint measurably went away', () => {
    const better = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: 40 },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(better.head).toBe('Better, and the complaint still stands.');
  });

  it('says No change at 0 %, which is the state the audit bought two repairs to reach', () => {
    const nothing = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: 0 },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(nothing.kind).toBe('not-enough');
    expect(nothing.head).toBe('No change, and the complaint still stands.');
    expect(nothing.head).not.toContain('Better');
    expect(nothing.rows[0]?.verdict).toContain('0 % of it went away');
  });

  it('says No change when the run showed none of the complaint to remove', () => {
    /*
     * `null` is *this run shows none of it*. A complaint that was never there cannot have been
     * improved, and the row already says so — the head now agrees with the row rather than
     * contradicting it.
     */
    const none = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: null },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(none.head).toBe('No change, and the complaint still stands.');
  });

  it('leaves the authored “nothing was bought” punchline alone when nothing was bought', () => {
    const outcome = classifyOutcome(CASE, MEASURED, spendOf(CASE, emptyFixitState(), shippedPriceSchedule()));
    expect(outcome.body).toBe('Fixed body.');
  });

  it('corrects it when the player did buy, naming the committed total', () => {
    const outcome = classifyOutcome(CASE, MEASURED, {
      repairUnits: 11,
      extraUnits: 0,
      editorUnits: 0,
      totalUnits: 11,
      machineryUnits: 0,
    });
    expect(outcome.kind).toBe('fixed');
    // The authored sentence survives; what follows it is the fact it is silent about.
    expect(outcome.body.startsWith('Fixed body.')).toBe(true);
    expect(outcome.body).toContain('about the repair, not about your order');
    expect(outcome.body).toContain('11 of 12 u');
    expect(outcome.body).toContain('none of it machinery');
  });
});

describe('the FIXED badge follows the latest run — docs/20 defect 16', () => {
  /*
   * The audit's repro: fix the case (badge FIXED), then buy the do-nothing pair and run again to
   * "9 waits → 9 waits · 0 % of it went away" — and the rail still read FIXED beside it. The badge
   * is the rail's summary of where the case *stands*, not an observation about its history (that
   * contrast — `WeekState.bestMinutePct` is a high-water mark on purpose — is argued on
   * `fixedBadgeAfter` itself), so a later run of the same case decides it in both directions.
   */
  it('is true exactly for a fixed outcome, and false for each of the other three kinds', () => {
    const fixed = classifyOutcome(CASE, MEASURED, spendOf(CASE, emptyFixitState(), shippedPriceSchedule()));
    expect(fixed.kind).toBe('fixed');
    expect(fixedBadgeAfter(fixed)).toBe(true);

    const notEnough = classifyOutcome(
      CASE,
      { ...MEASURED, complaintAfter: 10, complaintGonePct: 0 },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(notEnough.kind).toBe('not-enough');
    expect(fixedBadgeAfter(notEnough)).toBe(false);

    const worse = classifyOutcome(
      CASE,
      { ...MEASURED, restAwayAfterPct: 80, restDeltaPoints: -16 },
      spendOf(CASE, emptyFixitState(), shippedPriceSchedule()),
    );
    expect(worse.kind).toBe('building-worse');
    expect(fixedBadgeAfter(worse)).toBe(false);

    const refused = classifyOutcome(CASE, MEASURED, {
      repairUnits: 99,
      extraUnits: 0,
      editorUnits: 0,
      totalUnits: 99,
      machineryUnits: 0,
    });
    expect(refused.kind).toBe('over-budget');
    expect(fixedBadgeAfter(refused)).toBe(false);
  });

  it('is what the panel assigns — no one-way latch survives in the mount', async () => {
    /*
     * The wiring pin, `reportPanel.test.ts`'s binding-site idiom: the rule being right is
     * worthless if `dev/fixitPanel.ts` still latches. The defect's exact line is asserted absent
     * and the assignment through the rule asserted present.
     */
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const panel = await readFile(
      fileURLToPath(new URL('../dev/fixitPanel.ts', import.meta.url)),
      'utf8',
    );
    expect(panel).toContain('session.fixed = fixedBadgeAfter(outcome);');
    expect(panel).not.toContain("if (outcome.kind === 'fixed') session.fixed = true;");
  });
});

/* -------------------------------------------------------------------------- *
 * Section 10.3's zones and parking — issue #422
 * -------------------------------------------------------------------------- */

describe("the editor's zoning and parking are priced by the rows a repair already pays", () => {
  /**
   * **The whole design in one assertion.** `pricing/schedule.test.ts` refuses a second row covering
   * a field already claimed, so an editor control that writes `building.banks[]` cannot have a price
   * of its own — it pays `rezone-bank`, the row twelve shipped repairs buy. This is that constraint
   * read forwards: the paths the editor names are the paths the schedule already prices.
   */
  it('names only paths the shipped schedule already covers', () => {
    const schedule = shippedPriceSchedule();
    const paths = editorPathsOf({
      ...emptyFixitState(),
      zoneOverlapFloors: 2,
      parkingStrategy: 'lobby',
    });
    expect(paths).toEqual(['building.banks[]', 'dispatcher.idle.parkingStrategy']);
    expect(zonePriceUnits(schedule)).toBe(6);
    expect(parkingPriceUnits(schedule)).toBe(0);
    /* And nothing is named while nothing is selected, or an untouched editor would be billed. */
    expect(editorPathsOf(emptyFixitState())).toEqual([]);
  });

  /**
   * A rezone is charged **once**, which is the schedule's own finding rather than this reducer's
   * preference: *"twelve fix repairs buy it between 0 and 12 units with no rule relating the price
   * to how much is rezoned"*. So the second floor of overlap is free and the first is not.
   *
   * **Where the *once* is actually enforced was found by watching this fail, and it is not where it
   * looks.** The first positive control run against it pushed `building.banks[]` onto
   * `editorPathsOf`'s list once per floor — and the test **stayed green**, because
   * `pricing/repairPrice.ts#changesAtPaths` keys its results by change id and a duplicated path
   * collapses. That dedupe is the same rule that stops a patch trimming both dwells paying for the
   * doors twice, and the editor inherits it by going through the same function rather than counting
   * units of its own. The control that does fire multiplies the summed price, which is the shape a
   * real per-floor defect would take.
   */
  it('charges the rezone once however many floors it moves', () => {
    const schedule = shippedPriceSchedule();
    const one = spendOf(CASE, { ...emptyFixitState(), zoneOverlapFloors: 1 }, schedule);
    const three = spendOf(CASE, { ...emptyFixitState(), zoneOverlapFloors: 3 }, schedule);
    expect(one.totalUnits).toBe(6);
    expect(three.totalUnits).toBe(6);
  });

  /**
   * **Neither setting is machinery**, and `budgetNoteOf` is the reason it matters. § 10.4's spent row
   * asks how much of the order was steel; a redrawn boundary and a parking rule are neither, so a
   * player who bought only those must not be told they are buying machinery. `docs/20` defect 8 read
   * the other way round.
   */
  it('keeps a rezone and a parking rule out of the machinery split', () => {
    const schedule = shippedPriceSchedule();
    const settings = spendOf(
      CASE,
      { ...emptyFixitState(), zoneOverlapFloors: 1, parkingStrategy: 'lobby' },
      schedule,
    );
    expect(settings.editorUnits).toBe(6);
    expect(settings.machineryUnits).toBe(0);
    expect(budgetNoteOf(CASE, settings)).toContain('committed budget is committed');
    expect(budgetNoteOf(CASE, settings)).not.toContain('buying machinery');

    /* The machinery arm is unmoved: a speed step still reads as steel beside a free parking rule. */
    const withSteel = spendOf(
      CASE,
      { ...emptyFixitState(), speedSteps: 1, parkingStrategy: 'lobby' },
      schedule,
    );
    expect(withSteel.machineryUnits).toBe(10);
    expect(budgetNoteOf(CASE, withSteel)).toContain('buying machinery');
  });

  it('steps the overlap up to the building ceiling and no further, and back down again', () => {
    const schedule = shippedPriceSchedule();
    let state = emptyFixitState();
    state = stepZoneOverlap(CASE, state, 1, 2, schedule);
    expect(state.zoneOverlapFloors).toBe(1);
    state = stepZoneOverlap(CASE, state, 1, 2, schedule);
    expect(state.zoneOverlapFloors).toBe(2);
    /* The building's ceiling, not the budget's: 6 of 12 u committed and the press is still refused. */
    expect(spendOf(CASE, state, schedule).totalUnits).toBe(6);
    expect(stepZoneOverlap(CASE, state, 1, 2, schedule)).toBe(state);
    state = stepZoneOverlap(CASE, state, -1, 2, schedule);
    expect(state.zoneOverlapFloors).toBe(1);
    state = stepZoneOverlap(CASE, state, -1, 2, schedule);
    expect(state.zoneOverlapFloors).toBe(0);
    expect(stepZoneOverlap(CASE, state, -1, 2, schedule)).toBe(state);
    /* A ceiling of zero refuses the first press outright — the single-bank buildings' answer. */
    const untouched = emptyFixitState();
    expect(stepZoneOverlap(CASE, untouched, 1, 0, schedule)).toBe(untouched);
  });

  it('refuses the first floor of overlap when the budget cannot take the rezone', () => {
    const schedule = shippedPriceSchedule();
    /* One speed step is 10 of this case's 12 u, so the 6 u rezone no longer fits. */
    const spent = stepSpeed(CASE, emptyFixitState(), 1, schedule);
    expect(spendOf(CASE, spent, schedule).totalUnits).toBe(10);
    expect(affordabilityOf(CASE, spent, zonePriceUnits(schedule), schedule)).toEqual({
      selectable: false,
      shortByUnits: 4,
    });
    expect(stepZoneOverlap(CASE, spent, 1, 3, schedule)).toBe(spent);
  });

  it('sets and clears the parking strategy, and treats null as leaving it alone', () => {
    const schedule = shippedPriceSchedule();
    const empty = emptyFixitState();
    expect(empty.parkingStrategy).toBeNull();
    const parked = setParkingStrategy(CASE, empty, 'lobby', schedule);
    expect(parked.parkingStrategy).toBe('lobby');
    /* Free, so nothing else about the order moves. */
    expect(spendOf(CASE, parked, schedule).totalUnits).toBe(0);
    expect(setParkingStrategy(CASE, parked, 'lobby', schedule)).toBe(parked);
    expect(setParkingStrategy(CASE, parked, null, schedule).parkingStrategy).toBeNull();
  });

  /**
   * The offered list is checked against core's own vocabulary rather than against a copy of it. A
   * strategy that left `PARKING_STRATEGIES` would otherwise go on being written into a config the
   * schema refuses, and the first sign would be a run that throws on a player's press.
   *
   * **It is the whole vocabulary now**, § D1000: the two strategies that were withheld were withheld
   * on reasons that stopped being true, and `families.test.ts` proves each one moves the legs.
   */
  it('offers exactly the strategies the core declares', () => {
    expect([...EDITOR_PARKING_STRATEGIES]).toEqual([...PARKING_STRATEGIES]);
  });
});

/**
 * **The elevation control** — GitHub issue **#422**. The same shape as the zoning block above,
 * because `stepTopFloorRaise` is `stepZoneOverlap` pointed at one floor rather than at a bank's
 * served range: a flat price, charged once regardless of how far the metre moves, refused by
 * either the building's ceiling or the case's budget.
 */
describe("the editor's elevation control is priced by the row a repair already pays", () => {
  it('names its path only once bought, at the schedule figure `raise-a-floor` holds', () => {
    const schedule = shippedPriceSchedule();
    expect(editorPathsOf({ ...emptyFixitState(), topFloorRaiseM: 2 })).toEqual([
      'building.floors[].heightM',
    ]);
    expect(topFloorRaisePriceUnits(schedule)).toBe(10);
    expect(editorPathsOf(emptyFixitState())).toEqual([]);
  });

  /** Only the first metre is charged — `raise-a-floor`'s own note, on `rezone-bank`'s precedent. */
  it('charges the raise once however many metres it moves', () => {
    const schedule = shippedPriceSchedule();
    const one = spendOf(CASE, { ...emptyFixitState(), topFloorRaiseM: 1 }, schedule);
    const five = spendOf(CASE, { ...emptyFixitState(), topFloorRaiseM: 5 }, schedule);
    expect(one.totalUnits).toBe(10);
    expect(five.totalUnits).toBe(10);
  });

  /** A moved floor is a setting rather than steel — `docs/20` defect 8's rule, applied a third time. */
  it('keeps the elevation control out of the machinery split', () => {
    const schedule = shippedPriceSchedule();
    const settings = spendOf(CASE, { ...emptyFixitState(), topFloorRaiseM: 3 }, schedule);
    expect(settings.editorUnits).toBe(10);
    expect(settings.machineryUnits).toBe(0);
  });

  it('steps the raise up to the building ceiling and no further, and back down again', () => {
    const schedule = shippedPriceSchedule();
    let state = emptyFixitState();
    state = stepTopFloorRaise(CASE, state, 1, 2, schedule);
    expect(state.topFloorRaiseM).toBe(1);
    state = stepTopFloorRaise(CASE, state, 1, 2, schedule);
    expect(state.topFloorRaiseM).toBe(2);
    /* The building's ceiling, not the budget's: 10 of 12 u committed and the press is still refused. */
    expect(spendOf(CASE, state, schedule).totalUnits).toBe(10);
    expect(stepTopFloorRaise(CASE, state, 1, 2, schedule)).toBe(state);
    state = stepTopFloorRaise(CASE, state, -1, 2, schedule);
    expect(state.topFloorRaiseM).toBe(1);
    state = stepTopFloorRaise(CASE, state, -1, 2, schedule);
    expect(state.topFloorRaiseM).toBe(0);
    expect(stepTopFloorRaise(CASE, state, -1, 2, schedule)).toBe(state);
    /* A ceiling of zero refuses the first press outright — the unserved/double-deck answer. */
    const untouched = emptyFixitState();
    expect(stepTopFloorRaise(CASE, untouched, 1, 0, schedule)).toBe(untouched);
  });

  it('refuses the first metre of raise when the budget cannot take it', () => {
    const schedule = shippedPriceSchedule();
    /* One speed step is 10 of this case's 12 u, so the 10 u raise no longer fits. */
    const spent = stepSpeed(CASE, emptyFixitState(), 1, schedule);
    expect(spendOf(CASE, spent, schedule).totalUnits).toBe(10);
    expect(affordabilityOf(CASE, spent, topFloorRaisePriceUnits(schedule), schedule)).toEqual({
      selectable: false,
      shortByUnits: 8,
    });
    expect(stepTopFloorRaise(CASE, spent, 1, 5, schedule)).toBe(spent);
  });
});

/**
 * **The block that replaces § D552 clause 2's known exception** — GitHub issue **#528**,
 * [§ D560](../../../../DECISIONS.md).
 *
 * What it said: the editor reads `faster-machines` and `larger-car-step` as flat figures and
 * {@link spendOf} multiplies each by a step count, in code rather than through `pricing/`, so turning
 * either row into a rated one made both throw. Two things are true now instead, and the second is the
 * one worth having — **the data decides, with no code change at all**: give either row a `rate` in
 * `data/price-schedule.json` and the editor charges `unitsPer × steps` through
 * `pricing/parse.ts#steppedPurchaseUnits`. At the same per-unit figure that is the arithmetic the
 * editor already did, so the switch is free of price movement, which is what makes it a data decision
 * rather than a re-pricing.
 *
 * The prices themselves are pinned in `editorPricesThroughTheSchedule.test.ts`, before the seam moved
 * and after.
 */
describe('a rated row reaches the editor through the schedule — GitHub issue #528, § D560', () => {
  const STEPS = 6;
  const withRated = (schedule: PriceSchedule, id: string): PriceSchedule => ({
    ...schedule,
    changes: schedule.changes.map((change): PricedChange => {
      if (change.id !== id || change.rate !== undefined) return change;
      const { priceUnits, ...fields } = change;
      return {
        ...fields,
        rate: {
          unitsPer: priceUnits,
          quantity: { type: 'integer', unit: 'step', min: 0, max: STEPS, default: 0 },
        },
      };
    }),
  });

  it('charges each step exactly what the seam charges a rated row at the same price', () => {
    const schedule = shippedPriceSchedule();
    const speedTwin = priceOf(withRated(schedule, 'faster-machines'), 'faster-machines');
    const placeTwin = priceOf(withRated(schedule, 'larger-car-step'), 'larger-car-step');
    const none = spendOf(CASE, emptyFixitState(), schedule).editorUnits;
    for (let steps = 0; steps <= STEPS; steps += 1) {
      const speed = spendOf(CASE, { ...emptyFixitState(), speedSteps: steps }, schedule).editorUnits;
      const places = spendOf(CASE, { ...emptyFixitState(), capacitySteps: steps }, schedule).editorUnits;
      expect(speed - none, `speed × ${String(steps)}`).toBe(purchaseUnits(speedTwin, steps));
      expect(places - none, `capacity × ${String(steps)}`).toBe(purchaseUnits(placeTwin, steps));
    }
  });

  it('charges the same units once either row carries a rate at the same figure', () => {
    for (const id of ['faster-machines', 'larger-car-step']) {
      const flat = shippedPriceSchedule();
      const rated = withRated(flat, id);
      expect(editorPricingFrom(rated), id).toEqual(editorPricingFrom(flat));
      for (let steps = 0; steps <= STEPS; steps += 1) {
        const state = { ...emptyFixitState(), speedSteps: steps, capacitySteps: steps };
        expect(spendOf(CASE, state, rated).editorUnits, `${id} × ${String(steps)}`).toBe(
          spendOf(CASE, state, flat).editorUnits,
        );
      }
    }
  });

  /**
   * **The shaft is not a stepper, and it still refuses.** A `new-car` given a rate would have to be
   * bought with a quantity {@link editorPricingFrom} does not hold, and one unit is a quantity chosen
   * for the player — § D552's refusal, unweakened by § D560, which moved the *steppers* and nothing
   * else.
   *
   * **One refusal did move, and it was incidental rather than load-bearing.** {@link spendOf} used to
   * throw on a rated `new-car` too, because it called {@link editorPricingFrom} for all three figures
   * and used two. It reads the two rows it charges now, so a rated shaft is refused where the shaft
   * price is actually read — by the panel drawing it — and not by an arithmetic that never spends it.
   * A selected new shaft is charged from its own repair's units, which the case below holds.
   */
  it('still refuses a rated shaft, which no step count sizes', () => {
    const schedule = withRated(shippedPriceSchedule(), 'new-car');
    expect(() => editorPricingFrom(schedule)).toThrow(/without a quantity/);
    expect(spendOf(CASE, { ...emptyFixitState(), selectedRepairIds: ['shaft'] }, schedule)).toEqual(
      spendOf(CASE, { ...emptyFixitState(), selectedRepairIds: ['shaft'] }, shippedPriceSchedule()),
    );
  });
});
