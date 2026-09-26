/**
 * **The fixit screen's pure decisions, held without a document.**
 *
 * Three claims worth holding, each the § 10 rule it enforces:
 *
 * 1. **The rail's `{fixed}/{total}` is derived from the rendered rows** — counted from the same
 *    array the list draws, so the line cannot disagree with the list under it, and nothing here
 *    knows how many cases the file ships (three today, eighteen when the catalogue lands — the
 *    suite runs the same either way, which is why it builds its lists).
 * 2. **The § 3.3 substitutions come from the row's own variants, by index** — `fixitBarModel`
 *    never restates a § 3.3 string, so this suite resolves the real fixit row through
 *    `actionBarFor` and checks the picks against that row's own cells.
 * 3. **Every numeral is the engine's** — the price lines are composed from `EDITOR_PRICING` and
 *    the spend lines from `spendOf`'s arithmetic, and the expectations here are built from those
 *    same constants rather than from literals, so a re-priced § 9 moves this suite on the same
 *    commit.
 */

import { describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import {
  editorPricingFrom,
  emptyFixitState,
  parkingPriceUnits,
  spendOf,
  topFloorRaisePriceUnits,
  zonePriceUnits,
} from '../fixit/engine.js';
import { EDITOR_PARKING_STRATEGIES, EVERY_CAR, OUT_OF_SERVICE } from '../fixit/types.js';
import type { FixitCase, FixitState } from '../fixit/types.js';
import { actionBarFor } from './actionBar.js';
import {
  buildingLineOf,
  checkStoppedLineOf,
  diagnosisHintTextOf,
  diagnosisOpenedBecauseOf,
  fixitDiagnosisView,
  FIXIT_SCREEN_COPY as COPY,
  decodeFamilyValue,
  encodeFamilyValue,
  fixitDialGroupsView,
  fixitDoorView,
  fixitRezoneView,
  fixitBarModel,
  fixitBudgetRungRow,
  fixitCaseRailModel,
  fixitElevationRow,
  fixitMachineryRows,
  fixitParkingRow,
  fixitSpendSummary,
  fixitZoneRow,
  pairStageNoteOf,
} from './fixitScreenModel.js';

/** A minimal case — enough shape for the model, no claim about any shipped file. */
function caseOf(id: string, budgetUnits = 12): FixitCase {
  return {
    id,
    name: `Case ${id}`,
    buildingId: 'a-building',
    dispatcherProfileId: 'a-profile',
    run: { seed: '1', durationS: 60, arrivalRatePctPop5min: null },
    asBuilt: { note: 'As built.', patch: {} },
    complaint: {
      text: 'The wait is long.',
      complainer: 'tenant',
      measure: {
        kind: 'long-waits',
        label: 'waits over a minute',
        thresholdS: 60,
        scope: { mode: 'origin', floorIds: ['f1'] },
      },
    },
    symptom: 'long waits',
    figures: [],
    diagnosis: { text: 'The cause.', reasoning: 'The reasoning.' },
    budgetUnits,
    repairs: [],
    result: { head: 'Fixed.', body: 'Done.' },
  };
}

const FIXIT_BAR = actionBarFor({ screen: 'fixit', ctx: 'daily' });

describe('the case rail model', () => {
  it('derives {fixed}/{total} from the rendered rows, whatever the file ships', () => {
    for (const total of [1, 3, 18]) {
      const cases = Array.from({ length: total }, (_, i) => caseOf(`c${String(i)}`));
      const solved = new Set(cases.slice(0, Math.floor(total / 2)).map((entry) => entry.id));
      const model = fixitCaseRailModel(cases, solved, cases[0]?.id, (entry) => entry.buildingId);
      expect(model.rows).toHaveLength(total);
      const fixed = model.rows.filter((row) => row.solved).length;
      // The count line is the rows' own arithmetic — asserted against the rendered list, not
      // against the inputs, so a row dropped in rendering would move both sides together.
      expect(model.count).toBe(`${String(fixed)}/${String(model.rows.length)} fixed`);
      expect(fixed).toBe(solved.size);
    }
  });

  it('tags a solved row FIXED and an open one OPEN, and marks only the selected row active', () => {
    const cases = [caseOf('a'), caseOf('b')];
    const model = fixitCaseRailModel(cases, new Set(['a']), 'b', (entry) => entry.buildingId);
    expect(model.rows.map((row) => row.tag)).toEqual([COPY.solvedTag, COPY.openTag]);
    expect(model.rows.map((row) => row.active)).toEqual([false, true]);
    expect(model.heading).toBe(COPY.railHeading);
    expect(model.hint).toBe(COPY.railHint);
  });

  /*
   * [§ D1020](../../../../DECISIONS.md): a held case is a row with its reason and the HELD tag, never
   * solved even if a stale solved set names it, and out of the count's denominator — the count is of
   * the cases a player can fix.
   */
  it('draws a held case with its reason and leaves it out of {fixed}/{total}', () => {
    const cases = [caseOf('a'), caseOf('b'), caseOf('c')];
    const model = fixitCaseRailModel(
      cases,
      new Set(['a', 'b']),
      'a',
      (entry) => entry.buildingId,
      (id) => (id === 'b' ? 'Held back. A reason.' : undefined),
    );
    expect(model.rows.map((row) => row.tag)).toEqual([COPY.solvedTag, COPY.heldTag, COPY.openTag]);
    expect(model.rows.map((row) => row.heldReason)).toEqual([undefined, 'Held back. A reason.', undefined]);
    expect(model.rows[1]?.solved).toBe(false);
    expect(model.count).toBe('1/2 fixed');
  });

  it('words the tower line from the building, floors counted rather than authored', () => {
    expect(buildingLineOf('Vertical City', 101)).toBe('Vertical City · 101 floors');
  });
});

describe('the § 3.3 refinement', () => {
  const view = (
    over: Partial<Parameters<typeof fixitBarModel>[1]>,
  ): Parameters<typeof fixitBarModel>[1] => ({
    ready: true,
    running: false,
    ran: false,
    solved: false,
    ...over,
  });

  it('starts from the fixit row and picks the primary among that row’s own variants', () => {
    // The three § 3.3 states, each label the row's own cell — never a string of this module's.
    const [ready, ran, solved] = FIXIT_BAR.primary.variants;
    expect(fixitBarModel(FIXIT_BAR, view({})).primary.label).toBe(ready);
    expect(fixitBarModel(FIXIT_BAR, view({ ran: true })).primary.label).toBe(ran);
    expect(fixitBarModel(FIXIT_BAR, view({ solved: true })).primary.label).toBe(solved);
    /* § D1020: while the other forty-nine mornings run, the relabel says so and the press waits. */
    const checking = fixitBarModel(FIXIT_BAR, view({ running: true, checking: true }));
    expect(checking.primary.label).toBe(COPY.checkingLabel);
    expect(checking.primary.inert).toBe(COPY.checkingWhy);
    expect(fixitBarModel(FIXIT_BAR, view({ running: true })).primary.label).toBe(COPY.runningLabel);
    // The left button is untouched: leaving is the shell's, and the row already names it.
    expect(fixitBarModel(FIXIT_BAR, view({})).leave).toEqual(FIXIT_BAR.leave);
  });

  it('substitutes the ⟨what the run will measure⟩ cell and never leaks a placeholder', () => {
    for (const state of [view({}), view({ ran: true }), view({ solved: true }), view({ running: true })]) {
      const model = fixitBarModel(FIXIT_BAR, state);
      expect(model.note).toBeDefined();
      expect(model.note).not.toContain('⟨');
      expect(model.primary.label).not.toContain('⟨');
    }
    expect(fixitBarModel(FIXIT_BAR, view({})).note).toBe(COPY.noteReady);
  });

  it('puts the par on a fixed row and on no open one (lane AL-B, seat C D5)', () => {
    const cases = [caseOf('a'), caseOf('b')];
    const rail = fixitCaseRailModel(cases, new Set(['a']), 'a', () => 'tower', undefined, undefined, (id) => `par for ${id}`);
    expect(rail.rows.find((r) => r.id === 'a')?.par).toBe('par for a');
    expect(rail.rows.find((r) => r.id === 'b')?.par).toBeUndefined();
  });

  it('does not promise a mark on a case that is already fixed (lane AL-B, seat C D5)', () => {
    const entry = caseOf('a');
    const schedule = shippedPriceSchedule();
    const open = fixitDiagnosisView({ entry, schedule, asked: false, census: undefined, explained: false });
    expect(open.note).toBe(COPY.diagnosisWithheld);
    const fixed = fixitDiagnosisView({ entry, schedule, asked: false, census: undefined, explained: false, fixed: true });
    expect(fixed.state).toBe('withheld');
    expect(fixed.note).toBe(COPY.diagnosisWithheldFixed);
    expect(fixed.note).not.toMatch(/marked as fixed with the diagnosis/);
  });

  it('names the crowd the pair actually met, one note per basis (lane AL-B, seat D H4)', () => {
    expect(pairStageNoteOf({ sameCrowd: true })).toBe(COPY.pairStageNote);
    expect(pairStageNoteOf({ sameCrowd: false, crowdRedrawn: false })).toBe(COPY.pairStageNoteThinned);
    expect(pairStageNoteOf({ sameCrowd: false, crowdRedrawn: true })).toBe(COPY.pairStageNoteRedrawn);
    expect(COPY.pairStageNote).toContain('the same crowd');
    for (const note of [COPY.pairStageNoteThinned, COPY.pairStageNoteRedrawn]) {
      expect(note).not.toMatch(/same morning and the same crowd/);
    }
    expect(COPY.pairStageNoteThinned).toContain('the same crowd less the people it moved');
    expect(COPY.pairStageNoteRedrawn).toContain('not the same crowd twice');
    // Before the run nothing is known about the crowd, so the note claims only the morning.
    expect(COPY.noteReady).not.toMatch(/crowd/);
  });

  it('applies the § 3.3 solved inversion the row ships uninverted, with the row’s own way out', () => {
    const solved = fixitBarModel(FIXIT_BAR, view({ solved: true }));
    expect(solved.inverted).toBe(true);
    expect(solved.wayOut).toBe(FIXIT_BAR.wayOut);
    expect(solved.note).toBe(COPY.noteSolved);
    // And an unsolved case stays uninverted, exactly as the table ships it.
    expect(fixitBarModel(FIXIT_BAR, view({ ran: true })).inverted).toBe(false);
  });

  it('relabels and inerts the primary while the pair computes, and inerts it before the file loads', () => {
    const running = fixitBarModel(FIXIT_BAR, view({ running: true }));
    expect(running.primary.label).toBe(COPY.runningLabel);
    /*
     * The reason, not a bit — `BarPrimary.inert` carries the sentence the shell draws in the bar
     * and binds to the button (GitHub issue #262). The relabel and the reason are asserted as two
     * different strings on purpose: *Running the day…* says what is happening, and a player
     * looking at a control that will not press is asking why it will not.
     */
    expect(running.primary.inert).toBe(COPY.runningWhy);
    expect(running.primary.inert).not.toBe(running.primary.label);
    const unready = fixitBarModel(FIXIT_BAR, view({ ready: false }));
    expect(unready.primary.inert).toBe(COPY.loading);
    // A pressable state carries no inert cell at all — absent means pressable.
    expect(fixitBarModel(FIXIT_BAR, view({})).primary.inert).toBeUndefined();
  });
});

describe('the machinery rows', () => {
  it('prices from § 9’s constants, never from a literal', () => {
    const [speed, capacity] = fixitMachineryRows(emptyFixitState(), true, true, editorPricingFrom(shippedPriceSchedule()));
    expect(speed.priced).toBe(
      `${String(editorPricingFrom(shippedPriceSchedule()).speedUnitsPerHalfMps)} u per half a metre per second`,
    );
    expect(capacity.priced).toBe(
      `${String(editorPricingFrom(shippedPriceSchedule()).capacityUnitsPerTwoPlaces)} u per two places`,
    );
  });

  it('reads out what the steps bought and appends § 10.3’s cap while the budget refuses', () => {
    const state: FixitState = { ...emptyFixitState(), speedSteps: 2, capacitySteps: 1 };
    const [speed, capacity] = fixitMachineryRows(state, false, false, editorPricingFrom(shippedPriceSchedule()));
    expect(speed.readout).toBe('+1.0 m/s');
    expect(capacity.readout).toBe('+2 places');
    for (const row of [speed, capacity]) {
      expect(row.atBudget).toBe(true);
      expect(row.priced.endsWith(` · ${COPY.atBudget}`)).toBe(true);
      expect(row.canStepDown).toBe(true);
    }
    expect(fixitMachineryRows(emptyFixitState(), true, true, editorPricingFrom(shippedPriceSchedule()))[0].canStepDown).toBe(false);
  });
});

describe('the running total', () => {
  it('states what the whole order committed, on the engine’s arithmetic', () => {
    const entry = caseOf('spend', 14);
    const spend = spendOf(entry, { ...emptyFixitState(), speedSteps: 1 }, shippedPriceSchedule());
    const summary = fixitSpendSummary(entry, spend);
    // The repairs strip's spent line retired with the menu (§ D1020); the card's total stays.
    expect(summary).not.toHaveProperty('spentLine');
    expect(summary.committedLine).toBe(`${String(spend.totalUnits)} of 14 u committed`);
    expect(summary.capitalLine).toBe(`${String(spend.machineryUnits)} u of steel`);
    expect(summary.overBudget).toBe(false);
  });

  it('names a steel-free order in the prototype’s own words', () => {
    const entry = caseOf('free');
    const summary = fixitSpendSummary(entry, spendOf(entry, emptyFixitState(), shippedPriceSchedule()));
    expect(summary.capitalLine).toBe(COPY.noCapital);
  });
});

/*
 * **The repair menu's words retired with the menu** — [§ D1020](../../../../DECISIONS.md), § D706
 * clause 6. Held both ways: none of the four keys comes back, and the diagnosis's eyebrow — which
 * § D706 clause 5 keeps — stays.
 */
describe('the retired menu', () => {
  it('carries none of the menu’s four keys, and keeps the diagnosis', () => {
    for (const key of ['repairsEyebrow', 'repairsHint', 'stateSelected', 'stateAffordable']) {
      expect(Object.hasOwn(COPY, key), key).toBe(false);
    }
    expect(COPY.diagnosisEyebrow).toBe('THE DIAGNOSIS');
  });
});

/* -------------------------------------------------------------------------- *
 * Section 10.3's zones and parking — issue #422
 * -------------------------------------------------------------------------- */

describe('the zoning row', () => {
  const price = zonePriceUnits(shippedPriceSchedule());

  /**
   * **A building whose banks cannot overlap gets no row**, which is the § D219 half a screen owes:
   * eight of the eighteen shipped cases are single-bank, and a stepper there would write a field and
   * move no leg. `fixit/cases.test.ts` proves the ceiling is a fact about the fabric rather than a
   * guess; this proves the model acts on it.
   */
  it('is absent entirely where the building has no ceiling', () => {
    expect(fixitZoneRow(emptyFixitState(), 0, true, price)).toBeNull();
    expect(fixitZoneRow(emptyFixitState(), 1, true, price)).not.toBeNull();
  });

  /**
   * **The two refusals are two different sentences**, and this is the assertion that says so. A
   * stepper at its building's ceiling with budget still in hand must not answer *at the budget*: it
   * is the tower that has run out, not the money. `docs/20` defect 8 is that confusion made once.
   */
  it('tells the building’s ceiling apart from the budget’s', () => {
    const atCeiling = fixitZoneRow({ ...emptyFixitState(), zoneOverlapFloors: 2 }, 2, true, price);
    expect(atCeiling?.stepUpRefusal).toBe(COPY.zonesAtCeiling);
    expect(atCeiling?.priced).not.toContain(COPY.atBudget);

    const atBudget = fixitZoneRow(emptyFixitState(), 2, false, price);
    expect(atBudget?.stepUpRefusal).toBe(COPY.noBudgetLeft);
    expect(atBudget?.priced).toContain(COPY.atBudget);

    const live = fixitZoneRow({ ...emptyFixitState(), zoneOverlapFloors: 1 }, 2, true, price);
    expect(live?.stepUpRefusal).toBeUndefined();
    expect(live?.canStepDown).toBe(true);
  });

  it('reads back the overlap in floors, and says the boundaries are as drawn at zero', () => {
    expect(fixitZoneRow(emptyFixitState(), 3, true, price)?.readout).toBe(COPY.zonesNone);
    expect(fixitZoneRow({ ...emptyFixitState(), zoneOverlapFloors: 1 }, 3, true, price)?.readout).toContain(
      '+1 floor',
    );
    expect(fixitZoneRow({ ...emptyFixitState(), zoneOverlapFloors: 2 }, 3, true, price)?.readout).toContain(
      '+2 floors',
    );
    /* The price is the schedule's and is stated once, whatever the step. */
    expect(fixitZoneRow(emptyFixitState(), 3, true, price)?.priced).toBe(
      `${String(price)} u ${COPY.zonesPriced}`,
    );
  });
});

describe('the elevation row', () => {
  const price = topFloorRaisePriceUnits(shippedPriceSchedule());

  /**
   * **A building whose topmost floor cannot take it gets no row** — `fixitZoneRow`'s own rule,
   * pointed at `fixit/run.ts#topFloorRaiseCeilingOf`. `fixit/cases.test.ts` proves the ceiling is a
   * fact about the fabric (unserved, double-deck-paired, or declared only by a `floorRanges`
   * entry); this proves the model acts on it.
   */
  it('is absent entirely where the building has no ceiling', () => {
    expect(fixitElevationRow(emptyFixitState(), 0, true, price)).toBeNull();
    expect(fixitElevationRow(emptyFixitState(), 1, true, price)).not.toBeNull();
  });

  /** The two refusals are two different sentences — `docs/20` defect 8, on this row too. */
  it('tells the building’s ceiling apart from the budget’s', () => {
    const atCeiling = fixitElevationRow({ ...emptyFixitState(), topFloorRaiseM: 2 }, 2, true, price);
    expect(atCeiling?.stepUpRefusal).toBe(COPY.elevationAtCeiling);
    expect(atCeiling?.priced).not.toContain(COPY.atBudget);

    const atBudget = fixitElevationRow(emptyFixitState(), 2, false, price);
    expect(atBudget?.stepUpRefusal).toBe(COPY.noBudgetLeft);
    expect(atBudget?.priced).toContain(COPY.atBudget);

    const live = fixitElevationRow({ ...emptyFixitState(), topFloorRaiseM: 1 }, 2, true, price);
    expect(live?.stepUpRefusal).toBeUndefined();
    expect(live?.canStepDown).toBe(true);
  });

  it('reads back the raise in metres, and says it is as the building draws it at zero', () => {
    expect(fixitElevationRow(emptyFixitState(), 5, true, price)?.readout).toBe(COPY.elevationNone);
    expect(fixitElevationRow({ ...emptyFixitState(), topFloorRaiseM: 1 }, 5, true, price)?.readout).toContain(
      '+1 metre',
    );
    expect(fixitElevationRow({ ...emptyFixitState(), topFloorRaiseM: 2 }, 5, true, price)?.readout).toContain(
      '+2 metres',
    );
    /* The price is the schedule's and is stated once, whatever the step. */
    expect(fixitElevationRow(emptyFixitState(), 5, true, price)?.priced).toBe(
      `${String(price)} u ${COPY.elevationPriced}`,
    );
  });
});

describe('the parking row', () => {
  const price = parkingPriceUnits(shippedPriceSchedule());

  /**
   * **The strategy the case already runs is not offered.** Measured in `fixit/cases.test.ts`:
   * writing the standing order back moves not one leg, so offering it would be the inert control
   * § D219 names. The `null` choice already says *leave it alone*.
   */
  it('drops the standing order from the choices, whichever one it is', () => {
    for (const standing of EDITOR_PARKING_STRATEGIES) {
      const row = fixitParkingRow(emptyFixitState(), standing, price);
      expect(row.options.map((option) => option.value)).not.toContain(standing);
      /* The absence is still offered, and it is the one selected on an untouched editor. */
      expect(row.options[0]?.value).toBeNull();
      expect(row.options[0]?.selected).toBe(true);
      expect(row.options.length).toBe(EDITOR_PARKING_STRATEGIES.length);
    }
    /*
     * There is no longer a standing order outside the offered list — § D1000 offers all five — so a
     * case that parks at a fixed floor loses that one option like any other.
     */
    const whole = fixitParkingRow(emptyFixitState(), 'fixed-floor', price);
    expect(whole.options.map((option) => option.value)).not.toContain('fixed-floor');
    expect(whole.options.length).toBe(EDITOR_PARKING_STRATEGIES.length);
  });

  /**
   * GAMEPLAY § 16 rule 11: no engine identifier reaches a player.
   *
   * **Stated as *is not the identifier* rather than *does not contain it*, and the difference is a
   * finding rather than a convenience.** A containment check written first went red on *back down at
   * the lobby*, because `lobby` is an ordinary English word that the phrase for `lobby` is bound to
   * use. What the rule forbids is a config value **standing in for** copy — the label being the id,
   * or carrying a hyphenated one like `zone-center`, which no sentence would contain by accident.
   * A check that also refuses the English word would push the copy away from the plainest wording
   * available, which is the opposite of what § 16 is for.
   */
  it('draws every strategy in words rather than by its config value', () => {
    const row = fixitParkingRow(emptyFixitState(), 'fixed-floor', price);
    for (const option of row.options) {
      for (const identifier of EDITOR_PARKING_STRATEGIES) {
        expect(option.label, `${option.value ?? 'standing'} is an engine id`).not.toBe(identifier);
        if (identifier.includes('-')) {
          expect(option.label, `${option.value ?? 'standing'} shows an engine id`).not.toContain(
            identifier,
          );
        }
      }
      /* And no label is a bare token at all — every one is a phrase. */
      expect(option.label.split(' ').length).toBeGreaterThan(1);
    }
    expect(row.options.map((option) => option.label)).toEqual([
      /* § D1020: the standing strategy, named — the one a diagnosis about parking quotes. */
      `${COPY.dialStanding} — ${COPY.parkingFixedFloor}`,
      COPY.parkingStay,
      COPY.parkingLobby,
      COPY.parkingZone,
      COPY.parkingForecast,
    ]);
  });

  it('marks the chosen strategy and says the schedule’s price', () => {
    const row = fixitParkingRow({ ...emptyFixitState(), parkingStrategy: 'lobby' }, 'stay', price);
    expect(row.options.find((option) => option.value === 'lobby')?.selected).toBe(true);
    expect(row.options.find((option) => option.value === null)?.selected).toBe(false);
    expect(price).toBe(0);
    expect(row.priced).toBe(COPY.parkingFree);
  });
});

describe('the wider budget, priced in chimes — GitHub issue #579', () => {
  const currency = { one: 'chime', many: 'chimes' };
  const row = (over: Partial<Parameters<typeof fixitBudgetRungRow>[0]>) =>
    fixitBudgetRungRow({
      unitsNow: 12,
      nextChimes: 6,
      balanceChimes: 6,
      laddered: true,
      currency,
      ...over,
    });

  it('draws nothing at all where the case file authors no rung', () => {
    /*
     * `fixitZoneRow`'s precedent: a control over a ladder that does not exist is a press that
     * writes nothing, and an empty `budgetSteps` is a statement rather than an omission.
     */
    expect(row({ laddered: false })).toBeNull();
  });

  it('offers the press where the tally covers it, and says what it does before it is pressed', () => {
    const offered = row({});
    expect(offered?.offer).toBe('buy');
    expect(offered?.note).toBe(COPY.budgetRungOffer);
    expect(offered?.priced).toBe('6 chimes');
    expect(offered?.readout).toBe('12 u');
  });

  it('picks the singular out of the currency rather than spelling one', () => {
    /*
     * § D530 authors `one` and `many` in `data/chime-ledger.json`, and a screen that spelled either
     * would be a second authority for the name the owner ruled. Driven with a currency this test
     * invents, so a pass cannot come from the shipped words happening to match.
     */
    expect(row({ nextChimes: 1, currency: { one: 'bell', many: 'bells' } })?.priced).toBe('1 bell');
    expect(row({ nextChimes: 2, currency: { one: 'bell', many: 'bells' } })?.priced).toBe('2 bells');
  });

  it('separates *you have nothing yet* from *you are short*, because they are different sentences', () => {
    const nothing = row({ balanceChimes: 0 });
    expect(nothing?.offer).toBe('none');
    expect(nothing?.note).toBe(COPY.budgetRungNone);
    const short = row({ balanceChimes: 2 });
    expect(short?.offer).toBe('short');
    expect(short?.note).toBe(`${COPY.budgetRungShortLead} 4 chimes.`);
    expect(row({ balanceChimes: 5 })?.note).toBe(`${COPY.budgetRungShortLead} 1 chime.`);
  });

  it('says *bought* whatever the tally holds, once there is no rung above', () => {
    /*
     * The order of the tests is the decision: *there is no rung above this* is true of the case
     * rather than of the player, so it outranks both the shortfall and the empty tally.
     */
    for (const balanceChimes of [0, 2, 40]) {
      const owned = row({ nextChimes: undefined, balanceChimes, unitsNow: 18 });
      expect(owned?.offer).toBe('owned');
      expect(owned?.note).toBe(COPY.budgetRungOwned);
      expect(owned?.priced).toBeUndefined();
      expect(owned?.readout).toBe('18 u');
    }
  });

  it('never leaves a row without a sentence, on any arm', () => {
    for (const arm of [row({}), row({ balanceChimes: 0 }), row({ balanceChimes: 1 }), row({ nextChimes: undefined })]) {
      expect(arm?.note.length ?? 0).toBeGreaterThan(0);
    }
  });
});

/**
 * § D1000's five families, worded. The decisions behind every row — which dials are live, what a
 * select offers, what a rezone may move — are `fixit/`'s and are proved on the legs in
 * `fixit/families.test.ts`; what is held here is that the words are this module's and never an
 * engine identifier, and that a select's value survives the trip through a string.
 */
describe('the five families, worded', () => {
  const row = (affordable: boolean, bought = false) => ({
    changeId: 'dispatch-rules',
    name: 'How calls are assigned',
    units: 2,
    bought,
    affordable,
  });

  it('carries a dial value through a select and back as what it was', () => {
    for (const value of [0.1, 7, 'single-car', true, false]) {
      expect(decodeFamilyValue(encodeFamilyValue(value))).toEqual(value);
    }
    expect(decodeFamilyValue(encodeFamilyValue(undefined))).toBeNull();
  });

  it('says a group’s price once, and says so when the budget refuses the group', () => {
    const open = fixitDialGroupsView([{ row: row(true), dials: [] }])[0]!;
    expect(open.header.heading).toBe('How calls are assigned');
    expect(open.header.priced).toBe(`2 u ${COPY.groupPricedOnce}`);
    expect(open.header.atBudget).toBe(false);
    const refused = fixitDialGroupsView([{ row: row(false), dials: [] }])[0]!;
    expect(refused.header.atBudget).toBe(true);
    expect(refused.header.priced).toContain(COPY.groupAtBudget);
  });

  it('opens a dial on its standing value, says what that is, and words a switch as yes or no', () => {
    const view = fixitDialGroupsView([
      {
        row: row(true),
        dials: [
          {
            id: 'eligibility.enRouteDiversion',
            name: 'divert a car already moving',
            effect: 'a car on its way somewhere may be sent to a call on a floor it has not yet passed',
            standingText: 'off',
            options: [{ value: true, text: 'on' }],
            selected: undefined,
          },
        ],
      },
    ])[0]!;
    const dial = view.dials[0]!;
    expect(dial.options.map((option) => option.label)).toEqual([`${COPY.dialStanding} — ${COPY.dialOff}`, COPY.dialOn]);
    expect(dial.options[0]!.selected).toBe(true);
  });

  it('offers a car every other bank, a bank of its own and out of service, and never its own bank', () => {
    const view = fixitRezoneView({
      row: row(true),
      boughtByZoneStep: false,
      boughtByBanks: true,
      floorOrder: ['G', '2', '3'],
      cars: [
        { id: 'A', standingBankId: 'low', doubleDeck: false, homeFloors: ['G', '2'], target: 'low' },
        { id: 'E', standingBankId: OUT_OF_SERVICE, doubleDeck: false, homeFloors: ['G', '3'], target: OUT_OF_SERVICE },
      ],
      banks: [
        { id: 'low', name: 'Low bank', servesFloors: ['G', '2'], paired: false, offPlate: false, standingFloors: ['G', '2'], floors: ['G', '2'], keyed: false, plated: false },
        { id: 'high', name: 'High bank', servesFloors: ['G', '3'], paired: false, offPlate: true, standingFloors: ['G', '3'], floors: ['G', '3'], keyed: false, plated: true },
      ],
    });
    const [a, e] = view.cars;
    expect(a!.options.map((option) => option.label)).toEqual([
      `${COPY.dialStanding} — Low bank`,
      'High bank',
      COPY.rezoneKeyed,
      COPY.rezoneOut,
    ]);
    expect(e!.options.map((option) => option.label)).toEqual([
      `${COPY.dialStanding} — ${COPY.rezoneOutForWorks}`,
      'Low bank',
      'High bank',
      COPY.rezoneKeyed,
    ]);
    const high = view.banks.find((bank) => bank.key === 'high')!;
    expect(high.floors?.map((floor) => floor.served)).toEqual([true, false, true]);
    expect(high.plate?.options.find((option) => option.selected)?.label).toBe(COPY.platePlate);
    expect(view.banks.find((bank) => bank.key === 'low')!.plate).toBeUndefined();
  });

  it('words the door hold per target, in seconds, opening on the car as it is', () => {
    const view = fixitDoorView(
      {
        row: row(true),
        targets: [
          { key: EVERY_CAR, carId: undefined, bankName: undefined },
          { key: 'D', carId: 'D', bankName: 'Main bank' },
        ],
        hallOptions: [4, 5],
        carOptions: [2, 3],
        standing: { [EVERY_CAR]: { hall: undefined, car: 3 }, D: { hall: 11, car: 3 } },
      },
      { D: { hallCallS: 5 } },
      'D',
    );
    expect(view.targets.map((option) => option.label)).toEqual([COPY.doorEveryCar, 'Car D · Main bank']);
    const [hall, car] = view.sides;
    expect(hall!.options.find((option) => option.selected)?.label).toBe('5.0 s');
    /* § D1020: *as it stands* prints the as-built hold — the eleven seconds a diagnosis quotes. */
    expect(car!.options.find((option) => option.selected)?.label).toBe(`${COPY.dialStanding} — 3.0 s`);
    expect(hall!.options[0]?.label).toBe(`${COPY.dialStanding} — 11.0 s`);
  });

  it('keeps the unfigured word where the cars disagree, because one figure would be false of some', () => {
    const view = fixitDoorView(
      {
        row: row(true),
        targets: [{ key: EVERY_CAR, carId: undefined, bankName: undefined }],
        hallOptions: [4, 5],
        carOptions: [2, 3],
        standing: { [EVERY_CAR]: { hall: undefined, car: 3 } },
      },
      {},
      EVERY_CAR,
    );
    expect(view.sides[0]!.options[0]?.label).toBe(COPY.doorStanding);
    expect(view.sides[1]!.options[0]?.label).toBe(`${COPY.dialStanding} — 3.0 s`);
  });
});

/* -------------------------------------------------------------------------- *
 * [§ D1120](../../../../DECISIONS.md) — the diagnosis withheld until asked, the row's mark, and the
 * press that stops a check
 * -------------------------------------------------------------------------- */

/** A case whose diagnosed repair moves idle parking — priced under *Where idle cars wait*. */
function diagnosedCase(id: string): FixitCase {
  return {
    ...caseOf(id),
    repairs: [
      {
        id: 'spread',
        role: 'diagnosed',
        name: 'Spread the idle cars',
        costUnits: 0,
        effect: 'The cars wait apart.',
        patch: { dispatcher: { idle: { parkingStrategy: 'zone-center' } } },
      },
    ],
  };
}

describe('the diagnosis card — § D1120 clause 1', () => {
  const schedule = shippedPriceSchedule();

  it('withholds the diagnosis on a case’s first render: a free press, and no word of the cause', () => {
    const entry = diagnosedCase('a');
    const view = fixitDiagnosisView({ entry, schedule, asked: false, census: { routes: 20, clearing: 5 }, explained: false });
    expect(view.state).toBe('withheld');
    expect(view.press).toBe(COPY.diagnosisShow);
    expect(view.text).toBeUndefined();
    expect(view.because).toBeUndefined();
    const drawn = [view.eyebrow, view.note, view.press].join(' ');
    expect(drawn).not.toContain(entry.diagnosis.text);
    expect(drawn).not.toContain(entry.diagnosis.reasoning);
    expect(drawn).not.toContain('Where idle cars wait');
    /* Free, and said to be free — `docs/38` § 2.4: chimes buy modifiers, never access. */
    expect(COPY.diagnosisWithheld).toContain('costs nothing');
    expect(COPY.diagnosisWithheld).not.toMatch(/chime/i);
  });

  it('shows, when asked, the measured witness — the priced row its diagnosed repair buys — and no mechanism', () => {
    const entry = diagnosedCase('a');
    const view = fixitDiagnosisView({ entry, schedule, asked: true, census: { routes: 20, clearing: 5 }, explained: false });
    expect(view.state).toBe('shown');
    expect(view.text).toBe(`${COPY.diagnosisHintLead} “Where idle cars wait”.`);
    expect(diagnosisHintTextOf(entry, schedule)).toBe(view.text);
    expect(view.note).toBe(COPY.diagnosisHintNote);
    expect(`${view.text ?? ''} ${view.note}`).not.toContain(entry.diagnosis.text);
    expect(`${view.text ?? ''} ${view.note}`).not.toContain(entry.diagnosis.reasoning);
    expect(view.press).toBeUndefined();
    expect(view.because).toBeUndefined();
  });

  it('opens a case whose census shows fewer than two clearing routes, and says why with the census’s counts', () => {
    const entry = diagnosedCase('a');
    const view = fixitDiagnosisView({ entry, schedule, asked: false, census: { routes: 34, clearing: 1 }, explained: false });
    expect(view.state).toBe('shown');
    expect(view.because).toBe(diagnosisOpenedBecauseOf({ routes: 34, clearing: 1 }));
    expect(view.because).toContain('34 single changes tried');
    expect(view.because).toContain('only one');
    /* Two is a search, and stays withheld. */
    expect(fixitDiagnosisView({ entry, schedule, asked: false, census: { routes: 34, clearing: 2 }, explained: false }).state).toBe(
      'withheld',
    );
    /* A case the census does not cover is withheld like any other. */
    expect(fixitDiagnosisView({ entry, schedule, asked: false, census: undefined, explained: false }).state).toBe('withheld');
  });

  it('prints the authored diagnosis only once a fixed verdict stands on the diagnosed repair’s own run', () => {
    const entry = diagnosedCase('a');
    const view = fixitDiagnosisView({ entry, schedule, asked: false, census: undefined, explained: true });
    expect(view.state).toBe('explained');
    expect(view.text).toBe(entry.diagnosis.text);
    expect(view.note).toBe(entry.diagnosis.reasoning);
  });

  it('marks the row: on your own, with the diagnosis, or diagnosis shown — and nothing on a held or untouched case', () => {
    const cases = [caseOf('own'), caseOf('helped'), caseOf('asked'), caseOf('untouched'), caseOf('held')];
    const model = fixitCaseRailModel(
      cases,
      new Set(['own', 'helped', 'held']),
      'own',
      (entry) => entry.buildingId,
      (id) => (id === 'held' ? 'Held back.' : undefined),
      (id) => id === 'helped' || id === 'asked' || id === 'held',
    );
    expect(model.rows.map((row) => row.mark)).toEqual([
      COPY.markOnOwn,
      COPY.markWithDiagnosis,
      COPY.markDiagnosisShown,
      undefined,
      undefined,
    ]);
  });

  it('no longer promises a diagnosis on every case in the rail’s hint', () => {
    expect(COPY.railHint).not.toContain('already diagnosed');
  });
});

describe('the press that stops a check — § D1120 clause 4', () => {
  it('gives the press back with a note saying it stops the check on the last order', () => {
    const row = fixitBarModel(FIXIT_BAR, { ready: true, running: false, ran: true, solved: false, supersedes: true });
    expect(row.primary.inert).toBeUndefined();
    expect(row.note).toBe(COPY.noteSupersedes);
    expect(fixitBarModel(FIXIT_BAR, { ready: true, running: false, ran: true, solved: false }).note).toBe(COPY.noteReady);
  });

  it('says where a stopped check stopped, and that it has no verdict', () => {
    expect(checkStoppedLineOf(23, 49)).toBe(
      'The check on your last order stopped at 23 of 49 mornings when you ran this one, and it has no verdict.',
    );
  });
});
