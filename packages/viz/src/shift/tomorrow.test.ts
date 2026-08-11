/**
 * The between-day beat — GitHub issue #91.
 *
 * Two kinds of assertion, and the split is deliberate. Most of this file drives
 * {@link tomorrowBriefingOf} directly, because it is pure and every decision it makes is reachable
 * that way. The last suite does something else: it builds **two real runs** through
 * `dev/state.ts#shiftRunConfigOf`, one for today and one for tomorrow, and requires the number the
 * beat prints to be the number the next run actually has — compared on the legs, not on the
 * caption. That is § D177's standing requirement pointed at a reveal instead of at a slider, and it
 * is the only assertion here that would have caught the failure this feature is most likely to
 * have: a growth figure that agrees with the run until a calendar period is open, and then quietly
 * does not.
 */

import { describe, expect, it } from 'vitest';

import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { initialState, shiftRunConfigOf, tomorrowFactsOf, type ViewerState } from '../dev/state.js';

import { CALENDAR_PERIODS, periodOnDays } from './calendar.js';
import { contractById } from './contracts.js';
import { goalsForDay, readGoals } from './goals.js';
import { growthFactor } from './growth.js';
import { tomorrowBriefingOf, type TomorrowBriefing, type TomorrowInput } from './tomorrow.js';
import type { GoalObservations, GoalReading, WeekState } from './types.js';
import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

/*
 * `RESOURCES` and `legsOf` are `scope/probes.test-helper.ts`'s, imported rather than rebuilt.
 * `legsOf` states why that matters: it assembles the run **the way `runShift` assembles it**,
 * including the held cars that travel beside the config rather than inside it, and an instrument
 * that does not reproduce the shipped call path measures the instrument. Two buildings, for the
 * bound that file argues: Garden Apartments simulates in milliseconds and Midtown Office is the
 * arm any question about a *populated* building needs — Garden's whole tower is 120 people and a
 * growth delta rounds to a handful there.
 */

/** Observations good enough to read every goal as met. Values, never a simulation. */
const CLEAN: GoalObservations = {
  arrived: 180,
  carryPct: 98,
  minutePct: 96,
  peakQueue: 3,
  abandoned: 0,
  worstWaitS: 45,
  worstWaitIsCensored: false,
};

const POOR: GoalObservations = {
  ...CLEAN,
  carryPct: 41,
  minutePct: 22,
  peakQueue: 31,
  worstWaitS: 620,
};

/** A day nobody looked at: below `WAKE_UP_ARRIVALS`, so every reading is `pending`. */
const QUIET: GoalObservations = {
  arrived: 6,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 1,
  abandoned: 0,
  worstWaitS: 15,
  worstWaitIsCensored: false,
};

/** Legs carried, per fixture — `GoalObservations` does not carry it, and `outcomeOf` wants it. */
const CARRIED: ReadonlyMap<GoalObservations, number> = new Map([
  [CLEAN, 176],
  [POOR, 74],
  [QUIET, 6],
]);

function readingsFor(day: number, observations: GoalObservations): readonly GoalReading[] {
  return readGoals(goalsForDay(day), observations);
}

/** A week that has just closed `day`, exactly the way `main.ts#closeShift` closes one. */
function closedWeek(day: number, observations: GoalObservations, contractId = 'c1'): WeekState {
  const dayIdx = (day - 1) % 7;
  const readings = readingsFor(day, observations);
  return closeDay(
    { ...openWeek(contractId), day, dayIdx },
    outcomeOf({
      record: null,
      day,
      dayIdx,
      eventId: 'ordinary',
      arrived: observations.arrived,
      carried: CARRIED.get(observations) ?? 0,
      minutePct: observations.minutePct,
      readings,
    }),
  );
}

function briefing(overrides: Partial<TomorrowInput> = {}): TomorrowBriefing {
  const week = overrides.week ?? closedWeek(1, CLEAN);
  return tomorrowBriefingOf({
    closed: week.history.at(-1) ?? null,
    week,
    contract: contractById(week.contractId),
    verdict: 'cleared',
    populationToday: 1710,
    populationTomorrow: 1898,
    calendarLineTomorrow: '',
    withheldTomorrow: [],
    ...overrides,
  });
}

/** Every string the beat would put on screen, joined — for *does this word appear anywhere* tests. */
function allText(beat: TomorrowBriefing): string {
  return [
    beat.headline,
    ...beat.groups.flatMap((group) => [
      group.caption,
      ...group.rows.flatMap((row) => [row.label, row.value, row.note]),
    ]),
    ...beat.withheld,
  ].join(' ⏎ ');
}

function rowIn(beat: TomorrowBriefing, id: string): { value: string; note: string } {
  const found = beat.groups.flatMap((group) => group.rows).find((row) => row.id === id);
  expect(found, `no row ${id} in the beat`).toBeDefined();
  return { value: found?.value ?? '', note: found?.note ?? '' };
}

/* -------------------------------------------------------------------------- *
 * The shape
 * -------------------------------------------------------------------------- */

describe('the beat answers three questions and keeps them apart', () => {
  it('names the day that closed and the day that opens', () => {
    // Day 1 is Monday, so tomorrow is Tuesday. The headline claims nothing about how either went.
    expect(briefing().headline).toBe('Monday is banked. Tuesday opens.');
  });

  it('wraps the weekday through week.ts rather than off the end of a list', () => {
    // Day 7 is Sunday; day 8 is Monday again. A second array of names would get this wrong once.
    expect(briefing({ week: closedWeek(7, CLEAN) }).headline).toContain('Monday opens');
  });

  it('drops a question it has no answer to instead of drawing an empty caption', () => {
    // The sandbox: no contract, no calendar period. *What tomorrow is under* has nothing to say,
    // and the group is absent rather than a heading over a hole — `docs/10` R3.
    const week = closedWeek(1, CLEAN, 'no-such-contract');
    const beat = briefing({ week, contract: undefined });
    expect(beat.groups.map((group) => group.id)).toEqual(['closed', 'changed']);
  });

  it('has nothing at all to say before a day has closed', () => {
    const beat = briefing({ closed: null, verdict: null });
    expect(beat.groups).toEqual([]);
    expect(beat.headline).toContain('No day has closed yet');
  });

  it('never leaves a row with an empty value or an empty note', () => {
    // Every value on this surface is a claim and every claim carries its basis. A blank in either
    // slot is the defect `ReportFigure.note` is non-optional for, one layer up.
    for (const week of [closedWeek(1, CLEAN), closedWeek(4, POOR), closedWeek(6, QUIET)]) {
      for (const verdict of ['cleared', 'missed', 'ungraded'] as const) {
        const beat = briefing({ week, verdict });
        for (const row of beat.groups.flatMap((group) => group.rows)) {
          expect(row.value.trim(), `${row.id}.value`).not.toBe('');
          expect(row.note.trim(), `${row.id}.note`).not.toBe('');
          expect(row.label.trim(), `${row.id}.label`).not.toBe('');
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The four outcomes stay four — § D266
 * -------------------------------------------------------------------------- */

describe('the day’s counts are counts, and nothing is folded into anything', () => {
  it('prints legs offered and legs carried, and never subtracts them', () => {
    const beat = briefing({ week: closedWeek(1, POOR) });
    const row = rowIn(beat, 'carried');
    expect(row.value).toBe('74 of 180 carried');
    // The difference is 106. It must not appear as a figure anywhere, because this layer cannot see
    // whether those 106 abandoned, were turned away by a badge, or are still waiting —
    // `describeSummary` copies three of five conservation fields (ledger finding N-2).
    expect(allText(beat)).not.toContain('106');
  });

  it('says outright that it is not naming an outcome', () => {
    // The refusal is on the surface rather than only in a docstring: a reader who sees 176 of 180
    // will subtract, and what stops them concluding *four abandoned* is a sentence.
    const note = rowIn(briefing(), 'carried').note;
    expect(note).toContain('Waiting, abandoned and turned away are four different outcomes');
  });

  it('publishes no mean, no percentile and no time-to-destination', () => {
    // Structural, not stylistic: nothing on this beat comes from `VizSummary`, so there is no
    // figure `awtIsValid` could have suppressed and no path to publishing one. A word test is the
    // cheapest guard that stays true when somebody adds a row.
    for (const week of [closedWeek(1, CLEAN), closedWeek(9, POOR)]) {
      const text = allText(briefing({ week })).toLowerCase();
      for (const banned of ['average wait', 'mean wait', 'wt95', '95th', 'seconds on average']) {
        expect(text, banned).not.toContain(banned);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * A streak is a claim — the three arms `closeDay` actually has
 * -------------------------------------------------------------------------- */

describe('the streak is the one the week holds', () => {
  it('counts a clean day', () => {
    const week = closedWeek(1, CLEAN);
    expect(week.streak).toBe(1);
    expect(rowIn(briefing({ week, verdict: 'cleared' }), 'streak').value).toBe('1 clean day');
  });

  it('resets on a graded day that missed, and says what survives', () => {
    const week = closedWeek(1, POOR);
    expect(week.streak).toBe(0);
    const row = rowIn(briefing({ week, verdict: 'missed' }), 'streak');
    expect(row.value).toBe('none');
    // `cleanRun` does **not** move on a missed day (`week.ts` rule 1) and the note says so, because
    // a reader told only *"streak: none"* concludes they lost the assignment as well.
    expect(row.note).toContain('What is banked stays banked');
  });

  it('leaves an ungraded day alone, and does not say a streak was reset — § D234', () => {
    /*
     * The sentence this pins is the one issue #27 removed from the report: a play-tester who
     * carried 18 of 18 with 100 % away inside a minute was told *"Shift missed. Streak reset."*
     * about a day nobody looked at. A beat that re-introduced the wording would re-ship the
     * defect on a new surface, which is exactly how a corrected claim goes stale.
     */
    const week = closedWeek(3, QUIET);
    const row = rowIn(briefing({ week, verdict: 'ungraded' }), 'streak');
    expect(row.note).toContain('never graded');
    expect(row.note.toLowerCase()).not.toContain('reset');
    expect(row.note).toContain('Unjudged is not passed, and it is not failed either.');
  });

  it('never reads “0 clean days”, which is a quantity nobody had', () => {
    expect(rowIn(briefing({ week: closedWeek(1, POOR), verdict: 'missed' }), 'streak').value).toBe(
      'none',
    );
  });

  it('takes the verdict rather than re-deriving one — issue #53', () => {
    /*
     * The guard on *carried from the report rather than recomputed*. Handing the beat a verdict
     * that disagrees with `allMet` must produce the **verdict's** sentence, because the sheet's
     * judgement is the product's one judgement. A beat that quietly preferred `allMet` would be a
     * second computation of it, and two computations of one judgement is the defect that put
     * *"A day it could handle"* over *"Shift missed"* on one screen.
     */
    const week = closedWeek(1, CLEAN);
    expect(week.history.at(-1)?.allMet).toBe(true);
    expect(rowIn(briefing({ week, verdict: 'missed' }), 'streak').note).toContain('missed a goal');
  });
});

/* -------------------------------------------------------------------------- *
 * The reveal
 * -------------------------------------------------------------------------- */

describe('growth is shown as people, measured, and never as a constant', () => {
  it('prints both counts and the delta between them', () => {
    const row = rowIn(briefing({ populationToday: 1710, populationTomorrow: 1898 }), 'tenants');
    expect(row.value).toBe('1,710 → 1,898');
    expect(row.note).toContain('188 people move in overnight');
    expect(row.note).toContain('11.0 % of today');
  });

  it('states the share of *today*, which is not 11 % after day 1', () => {
    // Growth is linear — `1 + 0.11 × (day − 1)` — so day 5 → day 6 is 7.6 % of day 5, not 11 %.
    // The figure comes from the two counts, so this is true without the module knowing the rule.
    const today = Math.round(1710 * growthFactor(5));
    const tomorrow = Math.round(1710 * growthFactor(6));
    const row = rowIn(briefing({ populationToday: today, populationTomorrow: tomorrow }), 'tenants');
    expect(row.note).toContain('7.7 % of today');
    expect(row.note).not.toContain('11.0 %');
  });

  it('says so when nobody moves in, rather than dropping the row', () => {
    const row = rowIn(briefing({ populationToday: 1710, populationTomorrow: 1710 }), 'tenants');
    expect(row.value).toBe('1,710 → 1,710');
    expect(row.note).toContain('Nobody moves in overnight');
  });

  it('handles a building emptying, which a calendar period can do', () => {
    // A vacation scales the same floors down. *move out* is a direction, not a failure, and the
    // share is the absolute one — a negative percentage in a caption reads as an error.
    const row = rowIn(briefing({ populationToday: 1000, populationTomorrow: 600 }), 'tenants');
    expect(row.note).toContain('400 people move out overnight');
    expect(row.note).toContain('40.0 % of today');
  });

  it('offers no share of an empty building', () => {
    const row = rowIn(briefing({ populationToday: 0, populationTomorrow: 12 }), 'tenants');
    expect(row.note).toContain('12 people move in overnight');
    expect(row.note).not.toContain('%');
  });

  it('says the two counts are measured rather than multiplied', () => {
    expect(rowIn(briefing(), 'tenants').note).toContain(
      'Measured on the two buildings the two runs resolve to',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * What tomorrow is under
 * -------------------------------------------------------------------------- */

describe('what tomorrow is under', () => {
  it('names the calendar period when the week is in one', () => {
    const beat = briefing({ calendarLineTomorrow: 'Vacation week · Tuesday · 1 026 in the building' });
    expect(rowIn(beat, 'calendar').value).toContain('Vacation week');
  });

  it('has no calendar row on an ordinary week', () => {
    const ids = briefing().groups.flatMap((group) => group.rows).map((row) => row.id);
    expect(ids).not.toContain('calendar');
  });

  it('clamps the banked count the way the sheet clamps it — SC-05/DR-09', () => {
    // `cleanRun` keeps counting past `needClean`, so the raw figure can read *3 of 2*. Two surfaces
    // printing one figure two ways is how the sheet and the rail came to disagree once already.
    const contract = contractById('c1');
    const week = { ...closedWeek(1, CLEAN), cleanRun: 9 };
    const beat = briefing({ week, contract });
    expect(rowIn(beat, 'contract').value).toBe(
      `${String(contract?.needClean ?? 0)} of ${String(contract?.needClean ?? 0)} clean shifts banked`,
    );
  });

  it('carries tomorrow’s refusals rather than swallowing them', () => {
    const beat = briefing({ withheldTomorrow: ['the period’s template needs 30 minutes'] });
    expect(beat.withheld).toEqual(['the period’s template needs 30 minutes']);
  });

  it('does not restate tomorrow’s event, which the sheet’s own Tomorrow card names', () => {
    /*
     * Two names for one event on one screen would be the two-answers defect (§ D223, issue #53).
     * The card's name is `eventFor`'s **unpatched** schedule and is wrong under a calendar period
     * that overrides the event — that is pre-existing, is not fixed here, and is recorded in
     * `nextRowsOf`'s docstring so the omission cannot be read as an oversight.
     */
    const beat = briefing();
    expect(allText(beat)).not.toContain('Move-in day');
    expect(allText(beat)).not.toContain('Fire drill');
  });
});

/* -------------------------------------------------------------------------- *
 * The standing requirement, pointed at the reveal — § D177
 * -------------------------------------------------------------------------- */

describe('the number on the beat is the number the next run has', () => {
  /**
   * The state a shift is planned from: a real building, a real week, everything else shipped.
   *
   * `initialState` rather than a literal, so a field added to `ViewerState` reaches this plan the
   * way it reaches `runShift`'s. An object literal here would be a second answer to *what is the
   * viewer configured as*, which is the shape this repository counts.
   */
  function stateOn(
    buildingId: string,
    day: number,
    calendar: ViewerState['calendar'] = null,
  ): ViewerState {
    return {
      ...initialState(RESOURCES, 20260908n),
      buildingId,
      shiftLengthS: 900,
      week: { ...openWeek('c1'), day, dayIdx: (day - 1) % 7 },
      calendar,
    };
  }

  it('predicts tomorrow\u2019s population exactly, on the shipped chain', () => {
    /*
     * The assertion the whole feature stands on. `tomorrowFactsOf` is asked what tomorrow's
     * building holds, and then tomorrow's run is actually planned and its resolved building read.
     * They must be the same integer.
     *
     * A `growthFactor`-based caption passes a weaker version of this and fails here as soon as
     * rounding is per floor \u2014 which it is (`growth.ts`: *"rounding happens per floor and per
     * range"*), so a whole-building multiply is off by up to half a person per floor.
     */
    for (const buildingId of ['garden-apartments', 'midtown-office']) {
      for (const day of [1, 4, 9]) {
        const today = stateOn(buildingId, day);
        const predicted = tomorrowFactsOf(RESOURCES, today).population;
        const actual = shiftRunConfigOf(RESOURCES, {
          ...today,
          week: nextDay(today.week),
        }).building.totalPopulation;
        expect(predicted, `${buildingId} day ${String(day)}`).toBe(actual);
      }
    }
  });

  it('is not the same number a whole-building multiply would have given', () => {
    // The negative control on the case above: if per-floor rounding never mattered, that test
    // would pass against the caption this feature exists to refuse, and prove nothing.
    const today = stateOn('midtown-office', 4);
    const todayPopulation = shiftRunConfigOf(RESOURCES, today).building.totalPopulation;
    const multiplied = Math.round(
      (todayPopulation * growthFactor(today.week.day + 1)) / growthFactor(today.week.day),
    );
    expect(tomorrowFactsOf(RESOURCES, today).population).not.toBe(multiplied);
  });

  it('predicts it under a calendar period too, where a growth constant would be wrong', () => {
    /*
     * The case that separates *measured* from *multiplied*. A period scales the same floors, so a
     * beat that printed `1 + 0.11 \u00d7 day` would disagree with the run for the whole period and
     * nothing would say so \u2014 the caption-that-does-not-describe-the-picture defect `growth.ts`
     * names, arriving through a feature written to prevent it.
     */
    const period = periodOnDays(CALENDAR_PERIODS.vacation, 1, 7);
    const today = stateOn('midtown-office', 3, period);
    const predicted = tomorrowFactsOf(RESOURCES, today).population;
    const actual = shiftRunConfigOf(RESOURCES, {
      ...today,
      week: nextDay(today.week),
    }).building.totalPopulation;
    expect(predicted).toBe(actual);
    // And it is genuinely a different number from the ordinary week's, so the case has teeth.
    expect(predicted).not.toBe(tomorrowFactsOf(RESOURCES, stateOn('midtown-office', 3)).population);
  });

  it('the day the button advances is a different run, compared on the legs', () => {
    /*
     * \u00a7 D177's rule applied to *Open the doors on <weekday>*: the press writes `nextDay(week)`
     * and calls `runShift`, so what must be true is that the next day is **a different run** \u2014
     * not that a counter moved. `legsOf` is the shipped comparison: `(passengerId, carId,
     * boardedAt)` per leg, because a mean can be unchanged for a run that is entirely different,
     * and a mean can move because the window moved.
     */
    const today = { ...baseState(), week: { ...openWeek('c1'), day: 4, dayIdx: 3 } };
    expect(legsOf({ ...today, week: nextDay(today.week) })).not.toBe(legsOf(today));
  });

  it('and the beat drawn beside that press describes that run, not the one before it', () => {
    /*
     * The join. A beat can be internally consistent and still be about the wrong day \u2014 that is
     * exactly what a *"+11 % more tenants"* caption is. So the population the beat prints for
     * tomorrow is compared against the building the **next press** produces, on the same state.
     */
    const today = { ...baseState(), buildingId: 'midtown-office', week: { ...openWeek('c1'), day: 2, dayIdx: 1 } };
    const week = closedWeek(2, CLEAN);
    const beat = tomorrowBriefingOf({
      closed: week.history.at(-1) ?? null,
      week,
      contract: contractById('c1'),
      verdict: 'cleared',
      populationToday: shiftRunConfigOf(RESOURCES, today).building.totalPopulation,
      populationTomorrow: tomorrowFactsOf(RESOURCES, today).population,
      calendarLineTomorrow: '',
      withheldTomorrow: [],
    });
    const afterThePress = shiftRunConfigOf(RESOURCES, {
      ...today,
      week: nextDay(today.week),
    }).building.totalPopulation;
    const tenants = beat.groups.flatMap((group) => group.rows).find((row) => row.id === 'tenants');
    expect(tenants?.value).toContain(afterThePress.toLocaleString('en-GB'));
  });
});
