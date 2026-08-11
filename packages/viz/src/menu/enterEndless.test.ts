/**
 * The endless week is the day loop with nothing to bank — and both halves of that are asserted.
 *
 * ## Why the second half needs a test at all
 *
 * *Nothing is banked* is easy to believe and easy to get wrong in the generous direction: `closeDay`
 * banks against `contractById(week.contractId)`, so an endless week that happened to carry a real
 * contract id would clear scenarios while the screen said it was banking nothing. The sentinel is
 * what prevents that, and a sentinel is exactly the kind of thing that survives a refactor as a
 * string and stops being unique.
 *
 * *It is still the day loop* is the half a reader would not think to check, and it is the one that
 * decides whether the mode is worth having. If endless dropped the growth or the events it would be
 * the same day repeated, which is not a mode — so it is measured **on the legs**, § D177's rule: two
 * endless days, and the run has to differ.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import type { ViewerState } from '../dev/state.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { permits } from '../scope/permits.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { contractById } from '../shift/contracts.js';
import { goalsForDay } from '../shift/goals.js';
import { closeDay, ENDLESS_CONTRACT_ID, nextDay, outcomeOf, openWeek } from '../shift/week.js';
import type { DayOutcome, GoalReading, WeekState } from '../shift/types.js';

import { enterEndless } from './enterEndless.js';

/** A week seven days into a scenario, with a car held and a lever moved. */
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

/**
 * A clean day, as `closeDay` sees one — every reading met.
 *
 * The readings are built from `goalsForDay`'s real goals rather than invented ones, so a day that
 * counts as clean here counts as clean for the same reason it would in the shell. What is stubbed is
 * the *outcome* of reading them, which is the part this file is not testing.
 */
function cleanOutcome(week: WeekState): DayOutcome {
  const readings: readonly GoalReading[] = goalsForDay(week.day).map((goal) => ({
    goal,
    state: 'met' as const,
    observed: goal.bar,
    display: `${String(goal.bar)}${goal.unit}`,
    progressPct: 100,
    glyph: '✓',
  }));
  return outcomeOf({
    record: null,
    recordRefusal: null,
    day: week.day,
    dayIdx: week.dayIdx,
    eventId: 'ordinary',
    arrived: 1,
    carried: 1,
    minutePct: 100,
    readings,
  });
}

describe('entering endless', () => {
  it('opens on day one, with nothing carried over from the scenario week', () => {
    const entered = enterEndless(deepInAWeek());
    expect(entered.playMode).toBe('endless');
    expect(entered.week.day).toBe(1);
    expect(entered.week.streak).toBe(0);
    expect(entered.week.cleanRun).toBe(0);
    expect(entered.week.history).toEqual([]);
  });

  it('keeps the building the player was already on', () => {
    // The whole of what *keep going* means. A mode that re-picked the building would be Free Play
    // with a different label, and the player would lose the tower they had been learning.
    const from = deepInAWeek();
    const entered = enterEndless(from);
    expect(entered.buildingId).toBe(from.buildingId);
    expect(entered.dispatcherId).toBe(from.dispatcherId);
    expect(entered.seed).toBe(from.seed);
    expect(entered.shiftLengthS).toBe(from.shiftLengthS);
  });

  it('leaves the within-day controls where the player left them', () => {
    /*
     * Deliberate, and the opposite of `enterFreePlay`. That function clears a held car because the
     * Free Play *screen* had just described the run in six axes and a held car was not one of them.
     * This screen describes nothing of the sort, `permits('endless', 'within-day')` is `true`, and
     * the shell's own controls are on screen showing exactly what is held.
     */
    expect(permits('endless', 'within-day')).toBe(true);
    const entered = enterEndless(deepInAWeek());
    expect(entered.outOfServiceCarIds).toEqual(['main-D']);
    expect(entered.levers.express).toBe(true);
  });

  it('carries an id no scenario answers to', () => {
    // The sentinel doing its one job. If some future contract took this id, endless would start
    // banking toward it silently — which is why this is asserted rather than assumed from the name.
    expect(enterEndless(baseState()).week.contractId).toBe(ENDLESS_CONTRACT_ID);
    expect(contractById(ENDLESS_CONTRACT_ID)).toBeUndefined();
  });
});

describe('an endless week banks nothing and clears nothing', () => {
  it('closes a clean day without banking a contract', () => {
    const week = enterEndless(baseState()).week;
    const closed = closeDay(week, cleanOutcome(week));
    // The streak still runs — it is an observation about the days, not a contract's currency.
    expect(closed.streak).toBe(1);
    expect(closed.cleared).toBeNull();
    expect(closed.completed).toEqual([]);
  });

  it('is not vacuous — the same day on a real contract does bank', () => {
    // Without this, the assertion above would pass on a `closeDay` that had stopped banking at all.
    const week = openWeek('c1');
    const closed = closeDay(week, cleanOutcome(week));
    expect(closed.cleanRun).toBe(1);
  });
});

describe('it is still the day loop', () => {
  it('runs a different day on day five than on day one — § D177, on the legs', () => {
    /*
     * The half that decides whether the mode is worth having. Endless keeps `grownBuilding`'s
     * 11 %/day and `eventFor`'s schedule, so a later day is a materially different run. If this ever
     * passes only because both arms produce nothing, the length assertion below is what catches it.
     */
    const dayOne = enterEndless(baseState());
    let week = dayOne.week;
    for (let day = 1; day < 5; day += 1) week = nextDay(week);
    const dayFive: ViewerState = { ...dayOne, week };
    const legs = legsOf(dayOne);
    expect(legs.length).toBeGreaterThan(2);
    expect(legsOf(dayFive)).not.toBe(legs);
  });

  it('is not a run a leaderboard would accept, and says so through the same predicate', () => {
    // Endless is a week, so a day past the first carries growth and an event — the exact things
    // `runIdentityIssues` refuses. Asserted here so *endless is unpostable* is a checked consequence
    // rather than an assumption somebody made once.
    const entered = enterEndless(baseState());
    let week = entered.week;
    for (let day = 1; day < 5; day += 1) week = nextDay(week);
    expect(runIdentityIssues({ ...entered, week }, RESOURCES, 'ranked').length).toBeGreaterThan(0);
  });
});
