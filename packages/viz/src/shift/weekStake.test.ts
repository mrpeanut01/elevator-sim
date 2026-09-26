/**
 * `weekStake.ts` — swarm DL's Q2 ruling: only contested days count, the target is derived, the week
 * closes on a sheet beside the house and rolls, and a newcomer's first week is a tower whose week
 * the census admits ([§ D1176](../../../../DECISIONS.md)–[§ D1178](../../../../DECISIONS.md)).
 *
 * Every tower's figures are read off the shipped census here, and two are pinned as literals
 * because the ruling names them: Midtown's week as dealt, *2 of 3*, and its unwrinkled week, *4 of
 * 5* (S3). A census that moves moves them, and this file says so on the commit that moves it.
 */

import { describe, expect, it } from 'vitest';

import { CONTRACTS, contractById } from './contracts.js';
import { goalsForDay, readGoals } from './goals.js';
import { closeDay, nextDay, openWeek, outcomeOf } from './week.js';
import {
  countedCleanOf,
  DAY_COUNTS_SENTENCE,
  daysWerePlayedOn,
  dayCountsToward,
  houseNeedOf,
  houseRecordOf,
  houseStandingOrder,
  weekAdmitsANewcomer,
  weekDealOf,
  weekHasClosed,
  weekNeedOf,
  weekRollsOver,
  weekSheetOf,
  weekStakeLineOf,
  weekTargetFor,
  WEEK_LENGTH,
  WEEK_SHEET_NOTE,
  WEEK_WITHOUT_COUNTED_DAYS,
  type HouseReading,
} from './weekStake.js';
import { dc10Of, WEEK_WAY } from './weekWay.js';
import { isFirstDayOnALegibleTower } from './firstSession.js';
import { filedDaysOf, tutorialIsDue } from '../everyday/tutorialModel.js';
import { scheduledEventFor } from './calendar.js';
import type { DayOutcome, GoalReading, WeekState } from './types.js';
import type { WatchRecord } from '../watch/types.js';

function readings(day: number, met: boolean): readonly GoalReading[] {
  return readGoals(
    goalsForDay(day),
    met
      ? {
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
        }
      : {
          arrived: 400,
          carryPct: 10,
          minutePct: 10,
          peakQueue: 99,
          abandoned: 9,
          abandonedCarried: 0,
          horizonS: 900,
          worstWaitS: 940,
          worstWaitIsCensored: false,
          workPerServedLegKJ: 260.5,
        },
  );
}

function record(day: number, overrides: Partial<WatchRecord> = {}): WatchRecord {
  return {
    version: 3,
    seed: String(20_261_001 + day),
    buildingId: 'midtown-office',
    dispatcherId: houseStandingOrder(),
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
    ...overrides,
  } as unknown as WatchRecord;
}

/** A closed day on `week`, drawing the wrinkle the day is dealt unless told otherwise. */
function dayOn(
  week: WeekState,
  met: boolean,
  options: { readonly eventId?: string; readonly record?: WatchRecord | null } = {},
): DayOutcome {
  return outcomeOf({
    day: week.day,
    dayIdx: week.dayIdx,
    eventId: options.eventId ?? scheduledEventFor(null, week.day, week.dayIdx, 'whole-day').id,
    arrived: 400,
    carried: 380,
    minutePct: met ? 90 : 40,
    readings: readings(week.day, met),
    record: options.record === undefined ? record(week.day) : options.record,
    recordRefusal: null,
  });
}

/** Play a whole week on `contractId`, clean on the days in `clean`, closing day 7 and not opening day 8. */
function playWeek(
  contractId: string,
  clean: readonly number[],
  recordOf: (day: number) => WatchRecord | null = (day) => record(day),
): WeekState {
  let week = openWeek(contractId);
  for (let day = 1; day <= WEEK_LENGTH; day += 1) {
    week = closeDay(week, dayOn(week, clean.includes(day), { record: recordOf(day) }));
    if (day < WEEK_LENGTH) week = nextDay(week);
  }
  return week;
}

describe('only contested days count — § D1176 clause 1', () => {
  it('reads Midtown’s week as dealt as three counted days, Monday, Wednesday and Thursday', () => {
    const deal = weekDealOf('c2');
    expect(deal).toBeDefined();
    expect(deal?.days.filter((day) => day.counts).map((day) => day.day)).toEqual([1, 3, 4]);
    // The two days the queue gate refuses, and the weekend no play decides.
    expect(deal?.days.map((day) => day.reason)).toEqual([
      'contested',
      'queue',
      'contested',
      'contested',
      'queue',
      'untouched',
      'untouched',
    ]);
  });

  it('does not count a declared breather: DC-10 admits Saturday, and nothing a player does decides it', () => {
    const saturday = weekDealOf('c2')?.days[5];
    const row = saturday?.row;
    expect(row?.breather).toBe(true);
    expect(row === undefined ? false : dc10Of(row, WEEK_WAY.protocol).admitted).toBe(true);
    expect(saturday?.counts).toBe(false);
    expect(saturday?.sentence).toContain('left alone, cleared it on 20 of 20 crowds');
  });

  it('agrees with the census on every measured tower, derived rather than typed', () => {
    for (const contract of CONTRACTS) {
      const deal = weekDealOf(contract.id);
      if (deal === undefined) continue;
      for (const day of deal.days) {
        const row = day.row;
        const expected =
          row !== undefined &&
          row.eventId === day.eventId &&
          dc10Of(row, WEEK_WAY.protocol).admitted &&
          dc10Of(row, WEEK_WAY.protocol).standingMisses / row.standingVerdicts.length >=
            WEEK_WAY.protocol.standingMissAtLeast;
        expect(day.counts, `${contract.id} day ${String(day.day)}`).toBe(expected);
        expect(day.sentence.startsWith('This day')).toBe(true);
      }
      expect(deal.counted).toBe(deal.days.filter((day) => day.counts).length);
      expect(deal.target).toBe(weekTargetFor(deal.counted));
    }
  });

  it('counts a closed day only when it drew the wrinkle the day is dealt', () => {
    expect(dayCountsToward('c2', { day: 1, eventId: 'ordinary' })).toBe(true);
    // Monday under some other wrinkle — a calendar period, say — is not the day the census measured.
    expect(dayCountsToward('c2', { day: 1, eventId: 'move-in:middle' })).toBe(false);
    expect(dayCountsToward('c2', { day: 2, eventId: 'move-in:middle' })).toBe(false);
    expect(dayCountsToward('c2', { day: 9, eventId: 'ordinary' })).toBe(false);
  });

  it('changes nothing where the census does not speak: every clean day counts, toward the authored target', () => {
    for (const id of ['c1', 'c8', 'c7']) {
      expect(weekDealOf(id), id).toBeUndefined();
      expect(dayCountsToward(id, { day: 2, eventId: 'anything' }), id).toBe(true);
      const contract = contractById(id);
      expect(contract === undefined ? -1 : weekNeedOf(contract), id).toBe(contract?.needClean);
      expect(weekStakeLineOf(openWeek(id)), id).toBeUndefined();
    }
  });

  it('says why a day does not count in one sentence and gives no advice', () => {
    for (const contract of CONTRACTS) {
      for (const day of weekDealOf(contract.id)?.days ?? []) {
        if (day.counts) {
          expect(day.sentence).toBe(DAY_COUNTS_SENTENCE);
          continue;
        }
        expect(day.sentence).toMatch(/^This day does not count toward the week: [^.]+\.$/u);
        expect(day.sentence).not.toMatch(/\b(try|should|instead|next time|you could)\b/iu);
      }
    }
  });
});

describe('the target is derived — § D1176 clause 2', () => {
  it('is counted days minus one, at least one, and none for none', () => {
    expect([0, 1, 2, 3, 5].map(weekTargetFor)).toEqual([0, 1, 1, 2, 4]);
  });

  it('reads 2 of 3 on Midtown’s week as it is dealt', () => {
    const deal = weekDealOf('c2');
    expect([deal?.target, deal?.counted]).toEqual([2, 3]);
    expect(weekStakeLineOf(openWeek('c2'))).toBe('This week’s target: 2 of 3 counted days clean. 0 so far.');
  });

  it('reads 4 of 5 on Midtown’s unwrinkled week, S3’s figure', () => {
    const plain = weekDealOf('c2', WEEK_WAY, (day, dayIdx, census) =>
      day <= 5 ? 'ordinary' : scheduledEventFor(null, day, dayIdx, census.protocol.horizon).id,
    );
    expect([plain?.target, plain?.counted]).toEqual([4, 5]);
  });

  it('gives Secure Tower no target, because its week counts no day, and says so', () => {
    expect(weekDealOf('c3')?.counted).toBe(0);
    const secure = contractById('c3');
    expect(secure === undefined ? -1 : weekNeedOf(secure)).toBe(0);
    expect(weekStakeLineOf(openWeek('c3'))).toBe(WEEK_WITHOUT_COUNTED_DAYS);
  });

  it('counts clean counted days off the history, and nothing else', () => {
    let week = openWeek('c2');
    week = closeDay(week, dayOn(week, true)); // Monday: counts
    week = nextDay(week);
    week = closeDay(week, dayOn(week, true)); // Tuesday's move-in: does not
    expect(countedCleanOf(week)).toBe(1);
    expect(weekStakeLineOf(week)).toBe('This week’s target: 2 of 3 counted days clean. 1 so far.');
  });
});

describe('the week closes and rolls — § D1177', () => {
  it('has closed once its last dealt day is filed, and not before', () => {
    let week = openWeek('c2');
    for (let day = 1; day < WEEK_LENGTH; day += 1) {
      week = nextDay(closeDay(week, dayOn(week, true)));
      expect(weekHasClosed(week)).toBe(false);
    }
    expect(weekRollsOver(week)).toBe(true);
    expect(weekHasClosed(week)).toBe(false);
    week = closeDay(week, dayOn(week, true));
    expect(weekHasClosed(week)).toBe(true);
  });

  it('never closes a week the census does not speak for', () => {
    const week = { ...openWeek('c1'), day: 7, dayIdx: 6, closedDay: 7 };
    expect(weekHasClosed(week)).toBe(false);
    expect(weekRollsOver(week)).toBe(false);
  });
});

describe('the house — § D1177', () => {
  it('reads a day that ran the standing order untouched off the day itself', () => {
    expect(houseNeedOf({ record: record(1) })).toBe('own');
  });

  it('needs a run for any other driver, any press, any rule and any held car', () => {
    expect(houseNeedOf({ record: record(1, { dispatcherId: 'eta' }) })).toBe('run');
    expect(
      houseNeedOf({
        record: record(1, { interventions: [{ atS: 60, change: { kind: 'spread-cars' } }] as never }),
      }),
    ).toBe('run');
    expect(houseNeedOf({ record: record(1, { ruleRows: [{}] as never }) })).toBe('run');
    expect(houseNeedOf({ record: record(1, { outOfServiceCarIds: ['A1'] }) })).toBe('run');
    expect(houseNeedOf({ record: null })).toBe('unrecorded');
  });

  it('runs the day’s own crowd, building and day under the standing order with nothing pressed', () => {
    const played = record(3, {
      dispatcherId: 'eta',
      interventions: [{ atS: 60, change: { kind: 'spread-cars' } }] as never,
      outOfServiceCarIds: ['A1'],
    });
    const house = houseRecordOf(played);
    expect(house).toEqual({
      ...played,
      dispatcherId: houseStandingOrder(),
      interventions: [],
      ruleRows: [],
      outOfServiceCarIds: [],
    });
    expect([house.seed, house.buildingId, house.day, house.dayIdx]).toEqual([
      played.seed,
      played.buildingId,
      played.day,
      played.dayIdx,
    ]);
  });
});

describe('the week sheet — § D1177', () => {
  it('draws nothing before the week has closed', () => {
    expect(weekSheetOf(openWeek('c2'), () => undefined)).toBeUndefined();
  });

  it('tallies your clean counted days beside the house’s, on the same crowds', () => {
    // Clean on Monday, Wednesday and Saturday; Saturday does not count. Every day untouched but
    // Wednesday, which drove `eta` and so needed a house run.
    const week = playWeek('c2', [1, 3, 6], (day) =>
      day === 3 ? record(day, { dispatcherId: 'eta' }) : record(day),
    );
    const asked: number[] = [];
    const sheet = weekSheetOf(week, (day): HouseReading => {
      asked.push(day);
      return 'missed';
    });
    expect(asked).toEqual([3]);
    expect(sheet?.rows.map((row) => [row.weekday, row.counts, row.yours, row.house])).toEqual([
      ['MON', true, 'cleared', 'cleared'],
      ['TUE', false, 'missed', undefined],
      ['WED', true, 'cleared', 'missed'],
      ['THU', true, 'missed', 'missed'],
      ['FRI', false, 'missed', undefined],
      ['SAT', false, 'cleared', undefined],
      ['SUN', false, 'missed', undefined],
    ]);
    expect(sheet?.yoursLine).toBe('Your week: 2 of the 3 counted days clean.');
    expect(sheet?.houseLine).toBe(
      'The tower’s standing order, left alone on the same crowds, cleared 1.',
    );
    expect(sheet?.targetLine).toBe('Target 2: met.');
    expect(sheet?.note).toBe(WEEK_SHEET_NOTE);
    expect(sheet?.note).toContain('not a ranking of dispatchers');
    expect([sheet?.yours, sheet?.house, sheet?.counted, sheet?.target]).toEqual([2, 1, 3, 2]);
  });

  it('says the house is still being run rather than counting a run that has not answered', () => {
    const week = playWeek('c2', [1], (day) => record(day, { dispatcherId: 'eta' }));
    const sheet = weekSheetOf(week, () => undefined);
    expect(sheet?.houseLine).toBe('The tower’s standing order, left alone on the same crowds: still being run.');
    expect(sheet?.targetLine).toBe('Target 2: not met.');
  });

  it('names the counted days that kept no record of their crowd rather than guessing them', () => {
    const week = playWeek('c2', [1, 3, 4], (day) => (day === 4 ? null : record(day)));
    const sheet = weekSheetOf(week, () => undefined);
    expect(sheet?.houseLine).toBe(
      'The tower’s standing order, left alone on the same crowds, cleared 2 of the 2 it could be run on; ' +
        '1 could not be run on its own crowd.',
    );
  });

  it('agrees with the strip about your count on every closed week, the pair the corpus cannot reach', () => {
    /*
     * The sheet counts its rows; the strip’s stake line counts the history through
     * `countedCleanOf`. Two derivations of one figure, held equal over every subset of Midtown’s
     * seven days played clean. Not a declared honesty pair only because no corpus view stands on a
     * closed census week (`honesty/agreement.ts`’s views are day 1 and day 4 of a case’s week).
     */
    for (let mask = 0; mask < 1 << WEEK_LENGTH; mask += 1) {
      const clean = Array.from({ length: WEEK_LENGTH }, (_, index) => index + 1).filter(
        (day) => (mask & (1 << (day - 1))) !== 0,
      );
      const week = playWeek('c2', clean);
      const sheet = weekSheetOf(week, () => 'missed');
      expect(sheet?.yours).toBe(countedCleanOf(week));
      expect(weekStakeLineOf(week)).toContain(`${String(sheet?.yours)} so far.`);
    }
  });

  it('rolls into a fresh week on the same tower, keeping what the player has', () => {
    const closed = { ...playWeek('c2', [1, 3]), completed: ['c1', 'c2'] };
    expect(closed.completed).toContain('c2');
    const rolled = nextDay(closed);
    expect([rolled.contractId, rolled.day, rolled.dayIdx, rolled.cleanRun]).toEqual(['c2', 1, 0, 0]);
    expect(rolled.history).toEqual([]);
    expect(rolled.completed).toEqual(closed.completed);
    expect(rolled.streak).toBe(closed.streak);
    expect(rolled.bestMinutePct).toBe(closed.bestMinutePct);
    expect(weekSheetOf(rolled, () => undefined)).toBeUndefined();
  });

  it('is not read as a newcomer’s first day after the roll, by the door or by the landing gate', () => {
    const rolled = nextDay(playWeek('c2', [1, 3]));
    expect(rolled.history).toEqual([]);
    expect(daysWerePlayedOn(rolled)).toBe(true);
    expect(daysWerePlayedOn(openWeek('c2'))).toBe(false);
    expect(isFirstDayOnALegibleTower(rolled)).toBe(false);
    expect(isFirstDayOnALegibleTower(openWeek('c2'))).toBe(true);
    expect(filedDaysOf([rolled])).toBe(1);
    expect(tutorialIsDue({ filedDays: filedDaysOf([rolled]), solvedCases: 0, ratings: 0, careerDays: 0 })).toBe(false);
  });
});

describe('a newcomer’s first week — § D1178', () => {
  it('admits a tower whose day 1 counts and whose week can survive a miss: Midtown, and not the other two', () => {
    expect(weekAdmitsANewcomer('c2')).toBe(true);
    // Harbour Point counts day 1 and nothing else, so its target is one of one.
    expect([weekDealOf('c9')?.target, weekDealOf('c9')?.counted]).toEqual([1, 1]);
    expect(weekAdmitsANewcomer('c9')).toBe(false);
    expect(weekAdmitsANewcomer('c3')).toBe(false);
    // A tower the census has not measured is not admitted by default.
    expect(weekAdmitsANewcomer('c8')).toBe(false);
  });
});
