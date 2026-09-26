/**
 * `dayClose.ts` — every day ends pointing at tomorrow: swarm DO's § 1 ruling, wave AM, lane AM-C
 * ([§ D1246](../../../../DECISIONS.md) to [§ D1249](../../../../DECISIONS.md)).
 *
 * The close leads with four things in a fixed order, and each is pinned here in each of its states:
 * today against the house (the house pending, clean, missed, not runnable, and a day that ran the
 * standing order untouched), the tally, the call that decided it (one did, none did, none was
 * raised, a pinned call), the week's arithmetic (target open, met, out of reach) and tomorrow whole.
 * Midtown Office is the tower throughout, because it is the one whose week the census contests.
 */

import { describe, expect, it } from 'vitest';

import type { Observations, WeekState, DayOutcome, GoalReading } from './types.js';
import { goalsForDay, readGoals } from './goals.js';
import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';
import { scheduledEventFor } from './calendar.js';
import {
  DAY_CLOSE_WEEKEND_LINE,
  NO_CALL_DECIDED_LINE,
  NO_CALL_RAISED_LINE,
  dayCloseOf,
  decidingCallLineOf,
  type CloseVerdict,
  type DayCloseInput,
} from './dayClose.js';
import type { DayCallRecord } from './dayCalls.js';
import type { ReportOnward, WeekDayReport } from './report.js';
import { DAY_COUNTS_SENTENCE, houseStandingOrder, weekDealOf, weekSheetOf, type HouseReading } from './weekStake.js';
import { clearsIn } from './weekWay.js';
import type { WatchRecord } from '../watch/types.js';

const MET = {
  arrived: 400,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 0,
  abandoned: 0,
  abandonedCarried: 0,
  horizonS: 900,
  worstWaitS: 40,
  worstWaitIsCensored: false,
  workPerServedLegKJ: 41.2,
};
const MISSED = { ...MET, carryPct: 10, minutePct: 10, peakQueue: 99, abandoned: 9, worstWaitS: 940, workPerServedLegKJ: 260.5 };

function readings(day: number, met: boolean): readonly GoalReading[] {
  return readGoals(goalsForDay(day), met ? MET : MISSED);
}

function record(day: number, dispatcherId = houseStandingOrder()): WatchRecord {
  return {
    version: 3,
    seed: String(20_261_001 + day),
    buildingId: 'midtown-office',
    dispatcherId,
    pattern: 'building',
    demandTemplateId: null,
    arrivalRatePctPop5min: null,
    shiftLengthS: 36_000,
    windowStartS: null,
    day,
    dayIdx: (day - 1) % 7,
    outOfServiceCarIds: [],
    interventions: [],
    ruleRows: [],
    rungContractId: null,
  } as unknown as WatchRecord;
}

/** Midtown's week closed through `days.length` days, clean where `days[i]` is true. */
function weekThrough(days: readonly boolean[], recordOf: (day: number) => WatchRecord | null = (day) => record(day, 'eta')): WeekState {
  let week = openWeek('c2');
  days.forEach((met, index) => {
    if (index > 0) week = nextDay(week);
    const outcome: DayOutcome = outcomeOf({
      day: week.day,
      dayIdx: week.dayIdx,
      eventId: scheduledEventFor(null, week.day, week.dayIdx, 'whole-day').id,
      arrived: 400,
      carried: 380,
      minutePct: met ? 90 : 40,
      readings: readings(week.day, met),
      record: recordOf(week.day),
      recordRefusal: null,
    });
    week = closeDay(week, outcome);
  });
  return week;
}

/** The report fields the close reads — `report.ts` builds them; this is their shape, not a second derivation. */
function sheet(overrides: Partial<WeekDayReport> & { onward?: ReportOnward } = {}): WeekDayReport {
  return {
    of: 'week-day',
    forecast: { name: 'Fire drill', note: 'The note.', demand: '+2.0% more tenants than today' },
    ...overrides,
  } as unknown as WeekDayReport;
}

function onwardAfter(week: WeekState, newWeek = false): ReportOnward {
  const day = newWeek ? 1 : week.day + 1;
  const dayIdx = (day - 1) % 7;
  const event = scheduledEventFor(null, day, dayIdx, 'whole-day');
  return {
    day,
    dayIdx,
    weekday: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayIdx] ?? '',
    eventId: event.id,
    name: event.name,
    note: event.note,
    demand: newWeek ? 'A new week: the tower as handed, 8.0% fewer tenants than today' : '+2.0% more tenants than today',
    newWeek,
  };
}

function closeOf(week: WeekState, houseOf: (day: number) => HouseReading | undefined, extra: Partial<DayCloseInput> = {}) {
  const newWeek = week.day >= 5;
  return dayCloseOf({
    week,
    report: sheet({ onward: onwardAfter(week, newWeek) }),
    houseOf,
    ...extra,
  });
}

describe('today against the house — § D1247', () => {
  it('says the house is still being run until its run answers, and never guesses it', () => {
    const close = closeOf(weekThrough([true]), () => undefined);
    expect(close?.house).toBe(
      'Today against the house: you cleared it; the tower’s standing order, left alone on the same crowd, is still being run.',
    );
    expect(close?.tally).toBe(
      'This week so far: you 1, the house 0, clean over the same 1 counted day. The house is still being run on one of them.',
    );
  });

  it('states the house’s answer once it has one, and tallies it', () => {
    const close = closeOf(weekThrough([true, false, true]), (day) => (day === 2 ? 'cleared' : 'missed'));
    expect(close?.house).toBe(
      'Today against the house: you cleared it; the tower’s standing order, left alone on the same crowd, missed it.',
    );
    expect(close?.tally).toBe('This week so far: you 2, the house 1, clean over the same 3 counted days.');
  });

  it('reads a day that ran the standing order untouched off the day itself', () => {
    const close = closeOf(weekThrough([false], (day) => record(day)), () => 'cleared');
    expect(close?.house).toBe(
      'Today against the house: you ran the tower’s standing order with nothing pressed, so your day is the house’s, and it missed.',
    );
  });

  it('says so where the day kept no record of its crowd', () => {
    const close = closeOf(weekThrough([true], () => null), () => undefined);
    expect(close?.house).toContain('could not be run on it');
    expect(close?.tally).toContain('It could not be run on one of them.');
  });

  it('agrees with the week sheet’s cell for the same day — the declared pair’s rule', () => {
    const week = weekThrough([true, false, true, true, false]);
    const houseOf = (day: number): HouseReading => (day % 2 === 0 ? 'cleared' : 'missed');
    const close = closeOf(week, houseOf);
    const row = weekSheetOf(week, houseOf)?.rows.find((entry) => entry.day === week.day);
    expect(row?.yours).toBe('missed');
    expect(row?.house).toBe('missed');
    expect(close?.house).toContain('you missed it');
    expect(close?.house).toContain('left alone on the same crowd, missed it');
  });
});

describe('the week’s arithmetic — § D1247', () => {
  it('says what the target still needs of the counted days left', () => {
    expect(closeOf(weekThrough([true, false]), () => 'missed')?.arithmetic).toBe(
      'The week needs 3 of the 3 counted days left: 1 clean so far, and the target asks for 4 of 5.',
    );
  });

  it('says the target is met, and that the days left still count against the house', () => {
    expect(closeOf(weekThrough([true, true, true, true]), () => 'missed')?.arithmetic).toBe(
      'Target met: 4 clean, and the target asks for 4 of 5. The 1 counted day left still counts against the house.',
    );
  });

  it('keeps a stake once the target is out of reach: the tally against the house', () => {
    expect(closeOf(weekThrough([false, false, true]), () => 'missed')?.arithmetic).toBe(
      'The target is out of reach: the target asks for 4 of 5, you have 1 clean, and 2 counted days are left. The tally against the house is still open.',
    );
  });

  it('draws nothing of the house or the target where the census does not speak for the tower', () => {
    let week = openWeek('c1');
    week = closeDay(
      week,
      outcomeOf({
        day: 1,
        dayIdx: 0,
        eventId: 'ordinary',
        arrived: 10,
        carried: 10,
        minutePct: 100,
        readings: readings(1, true),
        record: null,
        recordRefusal: null,
      }),
    );
    const close = dayCloseOf({ week, report: sheet({ onward: onwardAfter(week) }), houseOf: () => 'cleared' });
    expect([close?.house, close?.tally, close?.arithmetic, close?.tomorrow.counts, close?.tomorrow.census]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(close?.tomorrow.heading).toBe('TOMORROW · TUESDAY, DAY 2');
  });
});

describe('tomorrow in full — § D1249', () => {
  it('names the wrinkle and its note, the move-ins, whether it counts and the census’s count', () => {
    const week = weekThrough([true]);
    const close = closeOf(week, () => 'missed', { population: { today: 589, tomorrow: 608 } });
    const tuesday = weekDealOf('c2')?.days[1];
    const onward = onwardAfter(week);
    expect(close?.tomorrow.heading).toBe('TOMORROW · TUESDAY, DAY 2');
    expect(close?.tomorrow.wrinkle).toBe(`${onward.name}: ${onward.note}`);
    expect(close?.tomorrow.moveIns).toBe('19 people move in overnight: 589 → 608 tenants.');
    expect(close?.tomorrow.counts).toBe(DAY_COUNTS_SENTENCE);
    const row = tuesday?.row;
    expect(row).toBeDefined();
    expect(close?.tomorrow.census).toBe(
      `The census ran Tuesday on ${String(row?.standingVerdicts.length)} crowds: left alone, the tower’s standing order cleared it on ${String(clearsIn(row?.standingVerdicts ?? ''))} of them.`,
    );
    expect(close?.tomorrow.weekend).toBeUndefined();
  });

  it('points at the next week’s Monday on Friday’s close, and says the weekend is off the path', () => {
    const close = closeOf(weekThrough([true, true, true, true, true]), () => 'missed');
    expect(close?.tomorrow.heading).toBe('NEXT · MONDAY, DAY 1 OF A NEW WEEK');
    expect(close?.tomorrow.moveIns).toBe('A new week: the tower as handed, 8.0% fewer tenants than today.');
    expect(close?.tomorrow.weekend).toBe(DAY_CLOSE_WEEKEND_LINE);
  });

  it('forecasts nothing: no word of how the player’s day will go', () => {
    const close = closeOf(weekThrough([true]), () => 'missed', { population: { today: 589, tomorrow: 608 } });
    const text = Object.values(close?.tomorrow ?? {}).join(' ').toLowerCase();
    for (const banned of ['harder', 'easier', 'will clear', 'will miss', 'likely', 'chance', 'expect']) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it('draws no lead on a practice close, whose week stays on the day it did not bank', () => {
    const week = weekThrough([true]);
    expect(dayCloseOf({ week, report: sheet({ practiceNote: 'Practice.' }), houseOf: () => undefined })).toBeUndefined();
    expect(dayCloseOf({ week: nextDay(week), report: sheet(), houseOf: () => undefined })).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The call that decided it — § D1248
 * -------------------------------------------------------------------------- */

const CLEARS = { tag: 'clears' } as unknown as Observations;
const MISSES = { tag: 'misses' } as unknown as Observations;
const verdictOf = (observations: Observations): CloseVerdict =>
  observations === CLEARS ? 'cleared' : observations === MISSES ? 'missed' : 'ungraded';
const lineOf = (verdict: CloseVerdict): string =>
  verdict === 'cleared' ? 'Shift cleared' : verdict === 'missed' ? 'Shift missed' : 'Too quiet to grade';
const clockOf = (atS: number): string => `${String(8 + Math.floor(atS / 3600)).padStart(2, '0')}:00`;

function call(atS: number, answer: DayCallRecord['answer'], reads: Partial<Record<string, Observations>>): DayCallRecord {
  return { atS, windowEndS: atS + 600, answer, counts: {}, observations: reads } as DayCallRecord;
}

describe('the call that decided today — § D1248', () => {
  it('names the call whose other answer, run on this crowd, reads the other verdict', () => {
    const line = decidingCallLineOf({
      verdict: 'cleared',
      records: [
        call(0, 'park-cars-lobby', { 'park-cars-lobby': CLEARS, 'spread-cars': CLEARS, leave: CLEARS }),
        call(3600, 'spread-cars', { 'park-cars-lobby': MISSES, 'spread-cars': CLEARS, leave: CLEARS }),
      ],
      verdictOf,
      lineOf,
      clockOf,
    });
    expect(line).toBe(
      'The call that decided today came at 09:00, where you chose spread the cars across the tower: on this crowd, ' +
        'the day run from 09:00 with park the cars in the lobby and nothing pressed after it read Shift missed.',
    );
  });

  it('names the latest when several did, and counts the rest', () => {
    const line = decidingCallLineOf({
      verdict: 'missed',
      records: [
        call(0, 'leave', { 'park-cars-lobby': CLEARS, 'spread-cars': MISSES, leave: MISSES }),
        call(7200, 'skipped', { 'park-cars-lobby': MISSES, 'spread-cars': CLEARS, leave: MISSES }),
      ],
      verdictOf,
      lineOf,
      clockOf,
    });
    expect(line).toContain('came at 10:00, where the day was skipped past the call');
    expect(line).toContain('read Shift cleared.');
    expect(line).toContain('1 earlier call today could have turned it too.');
  });

  it('says plainly that none did, and that none was raised', () => {
    const base = { verdict: 'cleared' as const, verdictOf, lineOf, clockOf };
    expect(decidingCallLineOf({ ...base, records: [call(0, 'leave', { 'park-cars-lobby': CLEARS, leave: CLEARS })] })).toBe(
      NO_CALL_DECIDED_LINE,
    );
    expect(decidingCallLineOf({ ...base, records: [] })).toBe(NO_CALL_RAISED_LINE);
  });

  it('says nothing on a day nobody graded, which has no verdict to decide', () => {
    expect(decidingCallLineOf({ verdict: 'ungraded', records: [], verdictOf, lineOf, clockOf })).toBeUndefined();
  });

  it('reads a pinned call played as measured: its other press is the one measured to read the other way', () => {
    const pinned = { atS: 3600, clearedBy: 'park-cars-lobby', missedBy: 'spread-cars' };
    expect(
      decidingCallLineOf({ verdict: 'cleared', records: [], pinned: { ...pinned, answered: 'park-cars-lobby' }, verdictOf, lineOf, clockOf }),
    ).toContain('where you chose park the cars in the lobby: on this crowd, the day run from 09:00 with spread the cars');
    expect(
      decidingCallLineOf({ verdict: 'missed', records: [], pinned: { ...pinned, answered: undefined }, verdictOf, lineOf, clockOf }),
    ).toContain('where nothing was pressed');
  });
});
