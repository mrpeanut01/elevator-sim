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

import { EDITOR_PRICING, emptyFixitState, spendOf } from '../fixit/engine.js';
import type { FixitCase, FixitState } from '../fixit/types.js';
import { actionBarFor } from './actionBar.js';
import {
  buildingLineOf,
  FIXIT_SCREEN_COPY as COPY,
  fixitBarModel,
  fixitCaseRailModel,
  fixitMachineryRows,
  fixitRepairStateLine,
  fixitSpendSummary,
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
    const [speed, capacity] = fixitMachineryRows(emptyFixitState(), true, true);
    expect(speed.priced).toBe(
      `${String(EDITOR_PRICING.speedUnitsPerHalfMps)} u per half a metre per second`,
    );
    expect(capacity.priced).toBe(
      `${String(EDITOR_PRICING.capacityUnitsPerTwoPlaces)} u per two places`,
    );
  });

  it('reads out what the steps bought and appends § 10.3’s cap while the budget refuses', () => {
    const state: FixitState = { ...emptyFixitState(), speedSteps: 2, capacitySteps: 1 };
    const [speed, capacity] = fixitMachineryRows(state, false, false);
    expect(speed.readout).toBe('+1.0 m/s');
    expect(capacity.readout).toBe('+2 places');
    for (const row of [speed, capacity]) {
      expect(row.atBudget).toBe(true);
      expect(row.priced.endsWith(` · ${COPY.atBudget}`)).toBe(true);
      expect(row.canStepDown).toBe(true);
    }
    expect(fixitMachineryRows(emptyFixitState(), true, true)[0].canStepDown).toBe(false);
  });
});

describe('the running total', () => {
  it('splits spent from committed the way the prototype does, on the engine’s arithmetic', () => {
    const entry = caseOf('spend', 14);
    const spend = spendOf(entry, { ...emptyFixitState(), speedSteps: 1 });
    const summary = fixitSpendSummary(entry, spend);
    // Toggles only on the strip; the whole order on the card — both sums the engine's.
    expect(summary.spentLine).toBe(
      `${String(spend.repairUnits + spend.extraUnits)} of 14 units spent`,
    );
    expect(summary.committedLine).toBe(`${String(spend.totalUnits)} of 14 u committed`);
    expect(summary.capitalLine).toBe(`${String(spend.machineryUnits)} u of steel`);
    expect(summary.overBudget).toBe(false);
  });

  it('names a steel-free order in the prototype’s own words', () => {
    const entry = caseOf('free');
    const summary = fixitSpendSummary(entry, spendOf(entry, emptyFixitState()));
    expect(summary.capitalLine).toBe(COPY.noCapital);
  });
});

describe('the repair state line', () => {
  it('marks a selected row visibly, passes the engine’s refusal through, and defaults to within budget', () => {
    expect(fixitRepairStateLine({ selected: true, refusal: undefined })).toBe(COPY.stateSelected);
    expect(fixitRepairStateLine({ selected: true, refusal: undefined })).toContain('✓');
    expect(
      fixitRepairStateLine({ selected: false, refusal: 'short by 22 u — beyond a repair budget' }),
    ).toBe('short by 22 u — beyond a repair budget');
    expect(fixitRepairStateLine({ selected: false, refusal: undefined })).toBe(
      COPY.stateAffordable,
    );
  });
});
