/**
 * The front door's words — GAMEPLAY § 6.1.
 *
 * Three properties carry this file, and each is a state a screen can only get wrong silently:
 *
 * 1. **an unfinished day shows `—`** (§ 16 rule 1). Today's chip has no score until the day is
 *    closed, and `dayClosed` is set by *Close the day* alone;
 * 2. **the chips are matched to the week by day number**, so a week with a gap in it does not
 *    slide every chip one slot left and label somebody's Wednesday as their Tuesday;
 * 3. **the replay refuses, in words**. The § 3.3 primary for a past day is inert and its note says
 *    why — § 16 rule 6 rather than rule 4's defect.
 */

import { describe, expect, it } from 'vitest';

import { goalsForDay, readGoals } from '../shift/goals.js';
import type { DayOutcome, GoalObservations, WeekState } from '../shift/types.js';
import type { WatchRecord } from '../watch/types.js';
import { HISTORY_DAYS, openWeek, outcomeOf } from '../shift/week.js';

import { DAY_OFFSET_MIN, doorScreenViewOf, DOOR_STEPS } from './doorView.js';
import { EM_DASH } from './figures.js';
import type { TodayRecord } from './today.js';

/** A day that met every bar, so its outcome is a real closed day with a real score. */
const MET: GoalObservations = {
  arrived: 400,
  carryPct: 100,
  minutePct: 84,
  peakQueue: 3,
  abandoned: 0,
  worstWaitS: 40,
  worstWaitIsCensored: false,
};

const recordOn = (buildingId: string): WatchRecord =>
  ({ buildingId }) as unknown as WatchRecord;

function closedDay(day: number, buildingId = 'chancery-house'): DayOutcome {
  return outcomeOf({
    day,
    dayIdx: (day - 1) % 7,
    eventId: 'ordinary',
    arrived: MET.arrived,
    carried: MET.arrived,
    minutePct: MET.minutePct,
    readings: readGoals(goalsForDay(day), MET),
    record: recordOn(buildingId),
    recordRefusal: null,
  });
}

/** A week standing on `day`, carrying the closed days named. */
function weekWith(day: number, history: readonly DayOutcome[]): WeekState {
  return { ...openWeek(), day, dayIdx: (day - 1) % 7, history };
}

const TODAY: TodayRecord = {
  day: 5,
  weekday: 'Friday',
  dayLabel: 'FRIDAY · DAY 5',
  towerName: 'Chancery House',
  lede: 'Fourteen floors and three lifts.',
  wrinkle: { id: 'ordinary', name: 'An ordinary day', note: 'Nothing booked.' } as TodayRecord['wrinkle'],
  outOfService: undefined,
  facts: [],
  load: undefined,
  asks: [],
  seedLine: 'tower chancery-house · crowd 424242 · everyone identical',
  driver: 'Steady hand',
};

const viewAt = (
  dayOffset: number,
  dayClosed: boolean,
  week: WeekState = weekWith(5, [closedDay(1), closedDay(2), closedDay(3), closedDay(4)]),
): ReturnType<typeof doorScreenViewOf> =>
  doorScreenViewOf({ week, today: { ...TODAY, day: week.day }, dayOffset, dayClosed });

describe('§ 16 rule 1 — an unfinished day shows the em dash', () => {
  it('withholds today’s score until the day is closed, and never draws a zero', () => {
    const open = viewAt(0, false);
    const today = open.chips.at(-1);
    expect(today?.offset).toBe(0);
    expect(today?.score).toBe(EM_DASH);
    expect(today?.note).toBe('today · not closed yet');
  });

  it('shows it once the week carries today as a closed day', () => {
    const week = weekWith(5, [closedDay(1), closedDay(2), closedDay(3), closedDay(4), closedDay(5)]);
    const today = viewAt(0, true, week).chips.at(-1);
    expect(today?.score).toBe('84%');
    expect(today?.note).toBe('today');
  });
});

describe('the seven chips are matched to the week by day number', () => {
  it('draws seven, oldest first, ending on today', () => {
    const chips = viewAt(0, false).chips;
    expect(chips).toHaveLength(HISTORY_DAYS);
    expect(chips.map((chip) => chip.offset)).toEqual([-6, -5, -4, -3, -2, -1, 0]);
    expect(chips.at(-1)?.day).toBe(5);
  });

  it('leaves a gap where a day was never closed, rather than sliding the later ones into it', () => {
    // Day 3 was never closed. Day 4 must stay on day 4's chip.
    const week = weekWith(5, [closedDay(1), closedDay(2), closedDay(4)]);
    const byDay = new Map(viewAt(0, false, week).chips.map((chip) => [chip.day, chip]));
    expect(byDay.get(3)?.score).toBe(EM_DASH);
    expect(byDay.get(3)?.note).toBe('not played');
    expect(byDay.get(4)?.score).toBe('84%');
  });

  it('says *before this week* for a slot earlier than day 1, rather than inventing a day', () => {
    const early = viewAt(0, false, weekWith(2, [closedDay(1)]));
    expect(early.chips[0]?.day).toBeUndefined();
    expect(early.chips[0]?.note).toBe('before this week');
    expect(early.chips[0]?.score).toBe(EM_DASH);
  });

  it('names the tower each day was **played on**, from that day’s own record', () => {
    const week = weekWith(3, [closedDay(1, 'garden-apartments'), closedDay(2, 'crown-hotel')]);
    const byDay = new Map(viewAt(0, false, week).chips.map((chip) => [chip.day, chip]));
    // Not the building standing selected now — two different claims on a week that changed tower.
    expect(byDay.get(1)?.tower).toBe('garden-apartments');
    expect(byDay.get(2)?.tower).toBe('crown-hotel');
    expect(byDay.get(3)?.tower).toBe('Chancery House');
  });
});

describe('the stepper', () => {
  it('dims the forward arrow at 0 and the back arrow at the far end — § 6.1', () => {
    expect(viewAt(0, false).stepper.forwardEnabled).toBe(false);
    expect(viewAt(0, false).stepper.backEnabled).toBe(true);
    expect(viewAt(DAY_OFFSET_MIN, false).stepper.backEnabled).toBe(false);
    expect(viewAt(DAY_OFFSET_MIN, false).stepper.forwardEnabled).toBe(true);
  });

  it('clamps an offset off the strip rather than selecting a chip that is not drawn', () => {
    for (const offset of [-40, 12]) {
      const view = viewAt(offset, false);
      expect(view.chips.filter((chip) => chip.selected)).toHaveLength(1);
    }
  });

  it('flips the kind pill on any past day — § 6.1 item 2', () => {
    expect(viewAt(0, false).kindPill).toBe('TODAY’S TOWER');
    expect(viewAt(0, false).isReplay).toBe(false);
    expect(viewAt(-2, false).kindPill).toBe('REPLAY · DOES NOT COUNT');
    expect(viewAt(-2, false).isReplay).toBe(true);
  });
});

describe('the § 3.3 primary, and the replay this build refuses', () => {
  it('is pressable at today and carries § 3.3’s own note', () => {
    const view = viewAt(0, false);
    expect(view.primary.label).toBe('Set up today');
    expect(view.primary.inert).toBe(false);
    expect(view.primary.note).toBe('Pick who drives, then run it.');
  });

  it('says what a second run of a closed day does to the week, rather than nothing', () => {
    const view = viewAt(0, true);
    expect(view.primary.inert).toBe(false);
    expect(view.primary.note).toMatch(/another attempt/);
  });

  it('is inert on every past day, and names the day it cannot re-open', () => {
    const view = viewAt(-2, false);
    expect(view.primary.label).toBe('Set up the replay');
    expect(view.primary.inert).toBe(true);
    // § 16 rule 6: it always says what it is short by, and names the day rather than gesturing.
    expect(view.primary.note).toContain('Day 3');
    expect(view.primary.note).toMatch(/cannot be re-opened/);
  });
});

describe('the world figures degrade to one labelled band — § 16 rule 15', () => {
  it('names what is missing and never renders a zero', () => {
    const { world } = viewAt(0, false);
    expect(world.label).toBe('WORLD FIGURES UNAVAILABLE');
    expect(world.absent.length).toBeGreaterThan(3);
    for (const entry of [world.reason, ...world.absent]) {
      expect(entry).not.toMatch(/\b0\b/);
    }
  });

  it('is the same band whether the day is closed or not — it is not about your run', () => {
    expect(viewAt(0, true).world).toEqual(viewAt(0, false).world);
  });
});

describe('the rest of § 6.1', () => {
  it('numbers the three steps, and each one says something', () => {
    expect(DOOR_STEPS.map((step) => step.n)).toEqual(['1', '2', '3']);
    for (const step of DOOR_STEPS) expect(step.body.length).toBeGreaterThan(30);
  });

  it('carries the day record’s own lede and seed line, unedited', () => {
    const view = viewAt(0, false);
    expect(view.lede).toBe(TODAY.lede);
    expect(view.seedLine).toBe(TODAY.seedLine);
    expect(view.driver.name).toBe('Steady hand');
  });
});
