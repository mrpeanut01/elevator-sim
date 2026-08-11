/**
 * The budget arithmetic and the four outcomes — ENGINE_CONTRACT § 9 and GAMEPLAY § 10.4, driven.
 *
 * Everything here is pure, so the suite is exhaustive where the contract is numeric: the editor
 * prices, the affordability gate with its short-by wording, and a classification that must be
 * total over states the shipped panel cannot even produce (over budget is § 10.4's third outcome
 * and § 10.2 makes it unreachable through the toggles — both facts are asserted).
 */

import { describe, expect, it } from 'vitest';

import {
  BASIS_LINE,
  COMPLAINT_GONE_PCT,
  EDITOR_PRICING,
  REST_DROP_LIMIT_POINTS,
  STANDING_EXTRAS,
  affordabilityOf,
  budgetNoteOf,
  classifyOutcome,
  emptyFixitState,
  repairRowOf,
  spendOf,
  stepCapacity,
  stepSpeed,
  toggleExtra,
  toggleRepair,
  type FixitMeasurement,
  type FixitSpend,
} from './engine.js';
import type { FixitCase, FixitState } from './types.js';

const PATCH = { dispatcher: { idle: { parkingStrategy: 'stay' } } };

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
    { id: 'shaft', role: 'new-shaft', name: 'A new shaft', costUnits: 34, effect: 'capital', patch: PATCH },
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
};

describe('spend and the editor prices', () => {
  it('prices the contract: shaft 34, speed 6 per half-metre, capacity 8 per two places', () => {
    expect(EDITOR_PRICING).toEqual({ shaftUnits: 34, speedUnitsPerHalfMps: 6, capacityUnitsPerTwoPlaces: 8 });
  });

  it('sums repairs, extras and editor machinery, and counts the steel', () => {
    let state = toggleRepair(CASE, emptyFixitState(), 'small-fix');
    state = toggleExtra(CASE, state, 'tenant-notices');
    state = stepSpeed(CASE, state, 1);
    const spend = spendOf(CASE, state);
    expect(spend).toEqual({ repairUnits: 2, extraUnits: 1, editorUnits: 6, totalUnits: 9, machineryUnits: 6 });
  });

  it('counts a selected new shaft as machinery — § 10.4 asks how much of the spend was steel', () => {
    const state: FixitState = { ...emptyFixitState(), selectedRepairIds: ['shaft'] };
    expect(spendOf(CASE, state).machineryUnits).toBe(34);
  });

  it('offers the five standing extras at the contract prices, none with a patch', () => {
    expect(STANDING_EXTRAS.map((extra) => [extra.id, extra.costUnits])).toEqual([
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
    const state = toggleRepair(CASE, emptyFixitState(), 'dear-fix'); // 10 of 12 spent
    const affordability = affordabilityOf(CASE, state, 34);
    expect(affordability.selectable).toBe(false);
    expect(affordability.shortByUnits).toBe(32);
    const row = repairRowOf(CASE, state, CASE.repairs[3] as FixitCase['repairs'][number]);
    expect(row.refusal).toBe('short by 32 u — beyond a repair budget');
  });

  it('the new shaft is visible and never affordable, even with nothing else selected', () => {
    const row = repairRowOf(CASE, emptyFixitState(), CASE.repairs[3] as FixitCase['repairs'][number]);
    expect(row.selectable).toBe(false);
    expect(row.refusal).toContain('beyond a repair budget');
  });

  it('a reducer refuses what the panel could not offer, so the gate holds without the panel', () => {
    const state = toggleRepair(CASE, emptyFixitState(), 'dear-fix');
    expect(toggleRepair(CASE, state, 'shaft')).toBe(state);
    expect(toggleExtra(CASE, state, 'car-interiors').selectedExtraIds).toEqual([]);
    // 10 spent, a speed step (6) does not fit; a return below zero is refused too.
    expect(stepSpeed(CASE, state, 1)).toBe(state);
    const empty = emptyFixitState();
    expect(stepCapacity(CASE, empty, -1)).toBe(empty);
  });

  it('caps the steppers live at the remaining budget', () => {
    let state = emptyFixitState();
    state = stepSpeed(CASE, state, 1); // 6
    expect(stepCapacity(CASE, state, 1)).toBe(state); // 6 + 8 > 12
    state = stepSpeed(CASE, state, 1); // would be 12
    expect(state.speedSteps).toBe(2);
    expect(stepSpeed(CASE, state, 1)).toBe(state);
  });
});

describe('the four outcomes — § 10.4, copy verbatim', () => {
  it('all three bars held: the authored result, and the case reads FIXED', () => {
    const outcome = classifyOutcome(CASE, MEASURED, spendOf(CASE, emptyFixitState()));
    expect(outcome.kind).toBe('fixed');
    expect(outcome.head).toBe('Fixed head.');
    expect(outcome.rows.map((row) => row.passed)).toEqual([true, true, true]);
    expect(outcome.basis).toBe(BASIS_LINE);
    expect(outcome.basis).toBe(
      'one run before, one run after — enough to see a repair this size; not enough to split hairs.',
    );
  });

  it('complaint fixed, building worse — somebody else is paying for it', () => {
    const outcome = classifyOutcome(
      CASE,
      { ...MEASURED, restAwayAfterPct: 90, restDeltaPoints: -6 },
      spendOf(CASE, emptyFixitState()),
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
      spendOf(CASE, emptyFixitState()),
    );
    expect(outcome.kind).toBe('not-enough');
    expect(outcome.head).toBe('Better, and the complaint still stands.');
    expect(outcome.body).toBe('Change something else and run it again.');
  });

  it('a run showing none of the complaint fails the bar honestly rather than passing vacuously', () => {
    const outcome = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: null },
      spendOf(CASE, emptyFixitState()),
    );
    expect(outcome.kind).toBe('not-enough');
    expect(outcome.rows[0]?.verdict).toContain('nothing to remove');
  });

  it('a scoped mean travels with the count it was taken over — issue #137\'s rule', () => {
    const meanCase: FixitCase = {
      ...CASE,
      complaint: { ...CASE.complaint, measure: { ...CASE.complaint.measure, kind: 'mean-wait' } },
    };
    const outcome = classifyOutcome(meanCase, MEASURED, spendOf(CASE, emptyFixitState()));
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
    expect(budgetNoteOf(CASE, spendOf(CASE, emptyFixitState()))).toContain('settings are free');
    const machinery = spendOf(CASE, { ...emptyFixitState(), speedSteps: 1 });
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
      spendOf(CASE, emptyFixitState()),
    );
    expect(better.head).toBe('Better, and the complaint still stands.');
  });

  it('says No change at 0 %, which is the state the audit bought two repairs to reach', () => {
    const nothing = classifyOutcome(
      CASE,
      { ...MEASURED, complaintGonePct: 0 },
      spendOf(CASE, emptyFixitState()),
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
      spendOf(CASE, emptyFixitState()),
    );
    expect(none.head).toBe('No change, and the complaint still stands.');
  });

  it('leaves the authored “nothing was bought” punchline alone when nothing was bought', () => {
    const outcome = classifyOutcome(CASE, MEASURED, spendOf(CASE, emptyFixitState()));
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
