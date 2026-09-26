/**
 * `weekStake.ts` — swarm DL's Q2 ruling: only contested days count, the target is derived, the week
 * closes on a sheet beside the house and rolls, and a newcomer's first week is a tower whose week
 * the census admits ([§ D1176](../../../../DECISIONS.md)–[§ D1178](../../../../DECISIONS.md)).
 *
 * Every tower's figures are read off the shipped census here, and two are pinned as literals
 * because the rulings name them: Midtown's week as dealt and its unwrinkled week, both *4 of 5*
 * since swarm DM's ruling (b) moved Tuesday's and Friday's wrinkle windows off the lunch peak and
 * the census admitted both days ([§ D1180](../../../../DECISIONS.md); it read *2 of 3* as dealt at
 * § D1176). A census that moves moves them, and this file says so on the commit that moves it.
 *
 * Swarm DM's ruling (a) is here too ([§ D1179](../../../../DECISIONS.md)): a week that counts no
 * day holds its scenario's clear, with a reason that tells a day measured and refused from a day
 * not yet measured as dealt, and the hold is derived, so a census row that admits a day lifts it.
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
  weekHeldReasonOf,
  weekOfferOf,
  weekTargetFor,
  WEEK_HELD_NOTE,
  WEEK_LENGTH,
  WEEK_SHEET_NOTE,
  type DealtDay,
  type HouseReading,
  type WeekDeal,
} from './weekStake.js';
import { dc10Of, WEEK_WAY, type WeekWay } from './weekWay.js';
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
  it('reads Midtown’s week as dealt as five counted days, Monday to Friday — § D1180', () => {
    const deal = weekDealOf('c2');
    expect(deal).toBeDefined();
    expect(deal?.days.filter((day) => day.counts).map((day) => day.day)).toEqual([1, 2, 3, 4, 5]);
    // Tuesday's move-in and Friday's shaft-out, moved off the lunch peak, are contested now; the
    // weekend is still a weekend no play decides.
    expect(deal?.days.map((day) => day.reason)).toEqual([
      'contested',
      'contested',
      'contested',
      'contested',
      'contested',
      'untouched',
      'untouched',
    ]);
    expect(deal?.days.slice(1, 5).map((day) => day.eventId)).toEqual([
      'move-in:past-halfway',
      'fire-drill:full',
      'conference:full-floor',
      'shaft-out:before-halfway',
    ]);
  });

  it('reads the two moved days’ verdicts the same as the plain day’s, crowd for crowd, and their notes claim no harder day', () => {
    /*
     * Swarm DM's ruling (b) clause 3, S3's finding, re-measured by this commit's census (§ D1180):
     * on Tuesday's move-in and Friday's shaft-out, moved off the lunch peak, the chosen play and the
     * standing order clear exactly the held-out crowds they clear on the plain day. So nothing drawn
     * about either wrinkle may say it makes the day harder; `events.test.ts` holds that it still
     * changes the run, on the legs.
     */
    for (const day of [2, 5]) {
      const dealt = weekDealOf('c2')?.days[day - 1];
      const plain = WEEK_WAY.rows.find((row) => row.contractId === 'c2' && row.day === day && row.eventId === 'ordinary');
      expect(dealt?.row?.eventId, `day ${String(day)}`).toBe(dealt?.eventId);
      expect(dealt?.row?.chosenVerdicts, `day ${String(day)}`).toBe(plain?.chosenVerdicts);
      expect(dealt?.row?.standingVerdicts, `day ${String(day)}`).toBe(plain?.standingVerdicts);
      const note = scheduledEventFor(null, day, day - 1, 'whole-day').note;
      expect(note).not.toMatch(/\b(harder|tougher|worse|busier|slower)\b/iu);
      expect(note).toContain('waits for the cars that are left');
    }
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
    expect(dayCountsToward('c2', { day: 2, eventId: 'move-in:past-halfway' })).toBe(true);
    // Monday under some other wrinkle — a calendar period, say — is not the day the census measured.
    expect(dayCountsToward('c2', { day: 1, eventId: 'move-in:past-halfway' })).toBe(false);
    // Nor is Tuesday without its wrinkle, nor under the window § D1180 retired.
    expect(dayCountsToward('c2', { day: 2, eventId: 'ordinary' })).toBe(false);
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

  it('reads 4 of 5 on Midtown’s week as it is dealt — § D1180', () => {
    const deal = weekDealOf('c2');
    expect([deal?.target, deal?.counted]).toEqual([4, 5]);
    expect(weekStakeLineOf(openWeek('c2'))).toBe('This week’s target: 4 of 5 counted days clean. 0 so far.');
  });

  it('reads 4 of 5 on Midtown’s unwrinkled week too, S3’s figure, on the same five days', () => {
    const plain = weekDealOf('c2', WEEK_WAY, (day, dayIdx, census) =>
      day <= 5 ? 'ordinary' : scheduledEventFor(null, day, dayIdx, census.protocol.horizon).id,
    );
    expect([plain?.target, plain?.counted]).toEqual([4, 5]);
    expect(plain?.days.map((day) => day.counts)).toEqual(weekDealOf('c2')?.days.map((day) => day.counts));
  });

  it('gives Secure Tower no target, because its week counts no day, and says why in true words', () => {
    expect(weekDealOf('c3')?.counted).toBe(0);
    const secure = contractById('c3');
    expect(secure === undefined ? -1 : weekNeedOf(secure)).toBe(0);
    expect(weekStakeLineOf(openWeek('c3'))).toBe(
      'No day of this week counts toward a target yet, so its scenario is held back. Monday was ' +
        'measured as it is dealt and does not count, and the other six days have not been measured ' +
        'as they are dealt.',
    );
  });

  it('names Harbour Point’s one counting day beside its 1 of 1', () => {
    expect(weekStakeLineOf(openWeek('c9'))).toBe(
      'This week’s target: 1 of 1 counted day clean, and the one day that counts is Monday. 0 so far.',
    );
  });

  it('counts clean counted days off the history, and nothing else', () => {
    let week = openWeek('c2');
    week = closeDay(week, dayOn(week, true)); // Monday: counts
    week = nextDay(week);
    week = closeDay(week, dayOn(week, true)); // Tuesday's move-in: counts since § D1180
    week = nextDay(week);
    week = closeDay(week, dayOn(week, true, { eventId: 'ordinary' })); // Wednesday not as dealt: does not
    expect(countedCleanOf(week)).toBe(2);
    expect(weekStakeLineOf(week)).toBe('This week’s target: 4 of 5 counted days clean. 2 so far.');
  });

  it('cannot be met before Thursday on any tower a newcomer is dealt — § D1180, S1’s derived check', () => {
    /*
     * The earliest day a week's target can be met is the day of its target-th counted day, with
     * every counted day before it clean. Swarm DM's ruling (b): a target met by Wednesday is the
     * post-AJ panel's seat A complaint, so no tower § D1178 admits may allow it.
     */
    const admitted = CONTRACTS.filter((contract) => weekAdmitsANewcomer(contract.id));
    expect(admitted.map((contract) => contract.id)).toContain('c2');
    for (const contract of admitted) {
      const deal = weekDealOf(contract.id);
      const counted = deal?.days.filter((day) => day.counts) ?? [];
      const earliest = counted[(deal?.target ?? 0) - 1]?.day ?? Number.POSITIVE_INFINITY;
      expect(earliest, contract.id).toBeGreaterThanOrEqual(4);
    }
    const midtown = weekDealOf('c2');
    expect(midtown?.days.filter((day) => day.counts)[(midtown.target) - 1]?.day).toBe(4);
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
      ['TUE', true, 'missed', 'missed'],
      ['WED', true, 'cleared', 'missed'],
      ['THU', true, 'missed', 'missed'],
      ['FRI', true, 'missed', 'missed'],
      ['SAT', false, 'cleared', undefined],
      ['SUN', false, 'missed', undefined],
    ]);
    expect(sheet?.yoursLine).toBe('Your week: 2 of the 5 counted days clean.');
    expect(sheet?.houseLine).toBe(
      'The tower’s standing order, left alone on the same crowds, cleared 1.',
    );
    expect(sheet?.targetLine).toBe('Target 4: not met.');
    expect(sheet?.note).toBe(WEEK_SHEET_NOTE);
    expect(sheet?.note).toContain('not a ranking of dispatchers');
    expect([sheet?.yours, sheet?.house, sheet?.counted, sheet?.target]).toEqual([2, 1, 5, 4]);
  });

  it('meets the target on four clean counted days and not on three', () => {
    const met = weekSheetOf(playWeek('c2', [1, 2, 3, 4]), () => 'missed');
    expect(met?.targetLine).toBe('Target 4: met.');
    const short = weekSheetOf(playWeek('c2', [1, 2, 3, 6, 7]), () => 'missed');
    expect(short?.targetLine).toBe('Target 4: not met.');
  });

  it('says the house is still being run rather than counting a run that has not answered', () => {
    const week = playWeek('c2', [1], (day) => record(day, { dispatcherId: 'eta' }));
    const sheet = weekSheetOf(week, () => undefined);
    expect(sheet?.houseLine).toBe('The tower’s standing order, left alone on the same crowds: still being run.');
    expect(sheet?.targetLine).toBe('Target 4: not met.');
  });

  it('names the counted days that kept no record of their crowd rather than guessing them', () => {
    const week = playWeek('c2', [1, 3, 4], (day) => (day === 4 ? null : record(day)));
    const sheet = weekSheetOf(week, () => undefined);
    expect(sheet?.houseLine).toBe(
      'The tower’s standing order, left alone on the same crowds, cleared 2 of the 4 it could be run on; ' +
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

describe('a week that counts no day holds its scenario — § D1179, swarm DM’s ruling (a)', () => {
  const BANNED = /\b(cannot|unwinnable)\b|found none/iu;

  it('holds exactly the census towers whose week counts no day, derived both ways: Secure Tower today', () => {
    const held: string[] = [];
    for (const contract of CONTRACTS) {
      const deal = weekDealOf(contract.id);
      const offer = weekOfferOf(contract.id);
      if (deal === undefined) {
        expect(offer, contract.id).toBeUndefined();
        continue;
      }
      expect(offer?.offer === 'held', contract.id).toBe(deal.counted === 0);
      if (offer?.offer === 'held') held.push(contract.id);
    }
    expect(held).toEqual(['c3']);
  });

  it('gives the reason a day measured and refused apart from a day not yet measured as dealt', () => {
    const line = weekOfferOf('c3')?.line ?? '';
    expect(line.startsWith(weekHeldReasonOf(weekDealOf('c3') as WeekDeal))).toBe(true);
    expect(line).toContain('Monday was measured as it is dealt and does not count');
    expect(line).toContain('the other six days have not been measured as they are dealt');
    expect(line).toContain(WEEK_HELD_NOTE);
    expect(line).not.toMatch(BANNED);
  });

  it('says none of the banned words on any sentence a measured tower draws while a day is unmeasured', () => {
    for (const contract of CONTRACTS) {
      const deal = weekDealOf(contract.id);
      if (deal === undefined) continue;
      if (!deal.days.some((day) => day.reason === 'unmeasured')) continue;
      const said = [
        weekStakeLineOf(openWeek(contract.id)) ?? '',
        weekOfferOf(contract.id)?.line ?? '',
        ...deal.days.map((day) => day.sentence),
      ];
      for (const text of said) expect(text, `${contract.id}: ${text}`).not.toMatch(BANNED);
    }
  });

  it('words every arm of the reason: all measured, none measured, and more than one measured', () => {
    const template = weekDealOf('c3') as WeekDeal;
    const shaped = (reasonOf: (day: DealtDay) => DealtDay['reason']): WeekDeal => ({
      ...template,
      days: template.days.map((day) => ({ ...day, counts: false, reason: reasonOf(day) })),
    });
    expect(weekHeldReasonOf(shaped(() => 'queue'))).toBe(
      'No day of this week counts toward a target, so its scenario is held back: all seven days ' +
        'were measured as they are dealt, and none of them counts.',
    );
    expect(weekHeldReasonOf(shaped(() => 'unmeasured'))).toBe(
      'No day of this week counts toward a target yet, so its scenario is held back: none of its ' +
        'seven days has been measured as it is dealt.',
    );
    expect(weekHeldReasonOf(shaped((day) => (day.day <= 3 ? 'no-way-through' : 'unmeasured')))).toBe(
      'No day of this week counts toward a target yet, so its scenario is held back. Monday, ' +
        'Tuesday and Wednesday were measured as they are dealt and do not count, and the other four ' +
        'days have not been measured as they are dealt.',
    );
    for (const text of [
      weekHeldReasonOf(shaped(() => 'unmeasured')),
      weekHeldReasonOf(shaped((day) => (day.day === 1 ? 'queue' : 'unmeasured'))),
    ]) {
      expect(text).not.toMatch(BANNED);
    }
  });

  it('lifts itself when a census row admits a day, with no edit anywhere but the census', () => {
    const admitting: WeekWay = {
      ...WEEK_WAY,
      rows: WEEK_WAY.rows.map((row) =>
        row.contractId === 'c3' && row.day === 1
          ? { ...row, chosenVerdicts: 'C'.repeat(20), standingVerdicts: 'm'.repeat(20), lowestPeakQueue: 0 }
          : row,
      ),
    };
    expect(weekOfferOf('c3')?.offer).toBe('held');
    expect(weekOfferOf('c3', admitting)?.offer).toBe('offered');
    expect(weekDealOf('c3', admitting)?.target).toBe(1);
    expect(weekOfferOf('c3', admitting)?.line).toBe(
      'One day of this week counts toward its target, Monday, so the target is one clean Monday.',
    );
  });

  it('keeps Harbour Point offered at 1 of 1, and its line names the day', () => {
    expect(weekOfferOf('c9')).toEqual({
      offer: 'offered',
      line: 'One day of this week counts toward its target, Monday, so the target is one clean Monday.',
    });
    expect(weekOfferOf('c2')).toEqual({ offer: 'offered', line: undefined });
    expect(weekOfferOf('c1')).toBeUndefined();
  });

  it('locks nothing: the held tower’s week is dealt, played, closed on its sheet and rolled', () => {
    const week = playWeek('c3', [1, 2, 3, 4, 5, 6, 7]);
    expect(week.history).toHaveLength(WEEK_LENGTH);
    expect(week.completed).not.toContain('c3');
    const sheet = weekSheetOf(week, () => 'missed');
    expect(sheet?.targetLine).toBe('This week had no target.');
    expect(sheet?.yoursLine).toBe('Your week: no day of it counted toward a target.');
    expect(sheet?.rollLine).toContain('Nothing is locked');
    const rolled = nextDay(week);
    expect([rolled.contractId, rolled.day]).toEqual(['c3', 1]);
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
