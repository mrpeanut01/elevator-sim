/**
 * The week is a pure state machine — asserted, not claimed.
 *
 * The purity suite deep-freezes the input before every transition. That is stronger than comparing
 * a snapshot afterwards: a mutation of a frozen object throws in strict mode (which every ES module
 * is), so the test fails at the write rather than at the comparison, and it fails even for a
 * mutation that happened to write the same value back.
 *
 * The behaviour suites pin the two rules `week.ts` copies from the design deliberately — the banked
 * count surviving a missed day, and taking an assignment restarting the week — because both look
 * like bugs and neither is.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTRACTS } from './contracts.js';
import { readGoals } from './goals.js';
import { goalsForDay } from './goals.js';
import {
  FREE_PLAY_CONTRACT_ID,
  HISTORY_DAYS,
  PARKED_WEEKS_MAX,
  SANDBOX_CONTRACT_ID,
  WEEK_CONTRACT_SENTINELS,
  closeDay,
  nextDay,
  openWeek,
  outcomeOf,
  switchWeek,
  takeContract,
  withContract,
} from './week.js';
import type { DayOutcome, GoalReading, WeekState } from './types.js';

/** Readings that are all `met`, or all `missed`, or all `pending` — whatever the day asks. */
function readings(day: number, kind: 'met' | 'missed' | 'pending'): readonly GoalReading[] {
  const observations =
    kind === 'pending'
      ? {
          arrived: 3,
          carryPct: 100,
          minutePct: 100,
          peakQueue: 0,
          abandoned: 0,
          worstWaitS: 20,
          worstWaitIsCensored: false,
        }
      : kind === 'met'
        ? {
            arrived: 400,
            carryPct: 100,
            minutePct: 100,
            peakQueue: 0,
            abandoned: 0,
            worstWaitS: 40,
            worstWaitIsCensored: false,
          }
        : {
            arrived: 400,
            carryPct: 10,
            minutePct: 10,
            peakQueue: 99,
            abandoned: 9,
            worstWaitS: 940,
            worstWaitIsCensored: false,
          };
  return readGoals(goalsForDay(day), observations);
}

function day(
  week: WeekState,
  kind: 'met' | 'missed' | 'pending',
  minutePct = kind === 'met' ? 90 : 40,
): DayOutcome {
  return outcomeOf({
    record: null,
    recordRefusal: null,
    day: week.day,
    dayIdx: week.dayIdx,
    eventId: 'ordinary',
    arrived: 400,
    carried: 380,
    minutePct,
    readings: readings(week.day, kind),
  });
}

/** Freeze a week and everything reachable from it, so a mutation throws where it happens. */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  return Object.freeze(value);
}

describe('opening a week', () => {
  it('starts at day 1 with nothing banked and nothing cleared', () => {
    const week = openWeek('c2');
    expect(week).toEqual({
      contractId: 'c2',
      day: 1,
      dayIdx: 0,
      streak: 0,
      bestMinutePct: 0,
      cleanRun: 0,
      completed: [],
      history: [],
      cleared: null,
      attempt: 0,
      closedDay: null,
      banked: null,
    });
  });
});

describe('unjudged is not passed', () => {
  it('does not call a day clean when a goal never woke up', () => {
    const week = openWeek('c1');
    const outcome = day(week, 'pending');
    expect(outcome.readings.every((reading) => reading.state === 'pending')).toBe(true);
    expect(outcome.allMet).toBe(false);
    expect(closeDay(week, outcome).cleanRun).toBe(0);
  });

  it('does not call a day with no goals clean', () => {
    // `every` over an empty array is `true`, which would make a shift with nothing to prove
    // indistinguishable from one that proved everything.
    const outcome = outcomeOf({
      record: null,
      recordRefusal: null,
      day: 1,
      dayIdx: 0,
      eventId: 'ordinary',
      arrived: 400,
      carried: 400,
      minutePct: 100,
      readings: [],
    });
    expect(outcome.allMet).toBe(false);
  });
});

describe('the streak and the banked count part company', () => {
  it('advances both on a clean day', () => {
    const after = closeDay(openWeek('c2'), day(openWeek('c2'), 'met'));
    expect(after.streak).toBe(1);
    expect(after.cleanRun).toBe(1);
  });

  it('resets the streak on a missed day and keeps the banked count', () => {
    // `design.html` :1955 and :1957, ported verbatim. The streak is the thing you can lose; the
    // assignment is the thing you cannot. Named in `week.ts` so nobody "fixes" it.
    let week = openWeek('c2');
    week = closeDay(week, day(week, 'met'));
    week = nextDay(week);
    week = closeDay(week, day(week, 'missed'));
    expect(week.streak).toBe(0);
    expect(week.cleanRun).toBe(1);
  });

  it('keeps the best day even after a bad one', () => {
    let week = openWeek('c1');
    week = closeDay(week, day(week, 'met', 91));
    week = nextDay(week);
    week = closeDay(week, day(week, 'missed', 12));
    expect(week.bestMinutePct).toBe(91);
  });
});

describe('banking a scenario', () => {
  it('clears the first contract on one clean shift and names the next', () => {
    const week = closeDay(openWeek('c1'), day(openWeek('c1'), 'met'));
    expect(week.completed).toEqual(['c1']);
    expect(week.cleared).not.toBeNull();
    expect(week.cleared?.nextContractId).toBe('c2');
    expect(week.cleared?.nextTitle).toBe('Scenario 2 — The morning rush');
    expect(week.cleared?.reward).toBe(
      'Minimum estimated wait · Energy aware · one spare shaft',
    );
  });

  it('does not clear a two-shift contract on one clean day', () => {
    const week = closeDay(openWeek('c2'), day(openWeek('c2'), 'met'));
    expect(week.completed).toEqual([]);
    expect(week.cleared).toBeNull();
  });

  it('awards a contract once, however many clean days follow', () => {
    let week = openWeek('c1');
    week = closeDay(week, day(week, 'met'));
    expect(week.cleared).not.toBeNull();
    week = nextDay(week);
    week = closeDay(week, day(week, 'met'));
    expect(week.completed).toEqual(['c1']);
    expect(week.cleared).toBeNull();
  });

  it('says so, rather than promising another scenario, at the end of the list', () => {
    // The LAST contract, derived — the campaign grew from five to eight and this had pinned `c5`,
    // which is now the middle of it.
    const last = CONTRACTS[CONTRACTS.length - 1]?.id ?? '';
    let week = { ...openWeek(last), cleanRun: 2 };
    week = closeDay(week, day(week, 'met'));
    expect(week.cleared?.nextContractId).toBeNull();
    expect(week.cleared?.nextTitle).toBe('any scenario you like — they are all open');
  });

  it('banks the day rather than throwing when the contract id names nothing', () => {
    // Restored state from an older build, or a scenario since renamed. Losing the day to an
    // exception would be worse than losing the banner.
    const week = closeDay(openWeek('nope'), day(openWeek('nope'), 'met'));
    expect(week.cleanRun).toBe(1);
    expect(week.cleared).toBeNull();
  });
});

describe('the day boundary', () => {
  it('advances the day and wraps the weekday', () => {
    let week = openWeek('c1');
    for (let i = 0; i < 7; i += 1) week = nextDay(week);
    expect(week.day).toBe(8);
    expect(week.dayIdx).toBe(0);
  });

  it('clears the award, so a banner belongs to one report', () => {
    const cleared = closeDay(openWeek('c1'), day(openWeek('c1'), 'met'));
    expect(cleared.cleared).not.toBeNull();
    expect(nextDay(cleared).cleared).toBeNull();
  });

  it('keeps seven days of history, oldest falling off', () => {
    let week = openWeek('c1');
    for (let i = 0; i < 10; i += 1) {
      week = closeDay(week, day(week, 'met'));
      week = nextDay(week);
    }
    expect(week.history).toHaveLength(HISTORY_DAYS);
    expect(week.history[0]?.day).toBe(4);
    expect(week.history.at(-1)?.day).toBe(10);
  });
});

describe('taking an assignment restarts the week and keeps what was cleared', () => {
  it('resets the streak, the banked count, the day and the history', () => {
    let week = openWeek('c1');
    week = closeDay(week, day(week, 'met'));
    week = nextDay(week);
    const taken = takeContract(week, 'c4');
    expect(taken.contractId).toBe('c4');
    expect(taken.day).toBe(1);
    expect(taken.dayIdx).toBe(0);
    expect(taken.streak).toBe(0);
    expect(taken.cleanRun).toBe(0);
    expect(taken.history).toEqual([]);
    // …and the scenario already cleared stays cleared.
    expect(taken.completed).toEqual(['c1']);
  });
});

/* -------------------------------------------------------------------------- *
 * A week per assignment — GitHub issue #107
 * -------------------------------------------------------------------------- */

describe('switching assignment parks the week rather than destroying it', () => {
  /**
   * The parked week for an assignment, read the way a caller would.
   *
   * Written here rather than imported: `week.ts` keeps its own reader private, because an exported
   * one would have had this file as its only reference outside its own module — the shape the
   * standing requirement is about, at three lines.
   */
  const parkedWeekFor = (
    parked: readonly WeekState[],
    contractId: string,
  ): WeekState | undefined => parked.find((entry) => entry.contractId === contractId);

  /** A week four days in, with a streak and a banked shift — something there is to lose. */
  function played(contractId: string): WeekState {
    let week = openWeek(contractId);
    for (let d = 1; d <= 3; d += 1) {
      week = nextDay(closeDay(week, day(week, 'met')));
    }
    return week;
  }

  it('opens a fresh week on the first visit, exactly as it always did', () => {
    // The rule that was *not* broken: taking an assignment restarts the week (`design.html` :1643).
    const from = played('c1');
    const { week } = switchWeek(from, [], 'c4', 'resume');
    expect(week).toEqual(takeContract(from, 'c4'));
  });

  it('hands back the same week on the second visit — the whole of issue #107', () => {
    /*
     * Reproduced from the shipped code before this function existed: Garden Apartments day 4 with a
     * streak, switch to Midtown Office, switch straight back, and the week read **day 1, streak 0,
     * nothing banked**. `withBuilding` called `takeContract` on every change of contract, and a
     * `takeContract` is a fresh week by construction.
     */
    const from = played('c1');
    const away = switchWeek(from, [], 'c2', 'resume');
    const back = switchWeek(away.week, away.parked, 'c1', 'resume');
    expect(back.week.day).toBe(from.day);
    expect(back.week.streak).toBe(from.streak);
    expect(back.week.cleanRun).toBe(from.cleanRun);
    expect(back.week.history).toEqual(from.history);
  });

  it('does nothing at all when the destination is the week already on screen', () => {
    // By identity, because the coach select fires `change` on a re-pick of the running building and
    // a re-pick that reshuffled the week would be the control moving on its own.
    const from = played('c1');
    const parked = [openWeek('c2')];
    const same = switchWeek(from, parked, 'c1', 'resume');
    expect(same.week).toBe(from);
    expect(same.parked).toBe(parked);
  });

  it('keeps one week per assignment, and never the one being played', () => {
    let state = { week: played('c1'), parked: [] as readonly WeekState[] };
    for (const id of ['c2', 'c3', 'c1', 'c2']) {
      state = switchWeek(state.week, state.parked, id, 'resume');
      const ids = state.parked.map((entry) => entry.contractId);
      expect(new Set(ids).size, 'one entry per assignment').toBe(ids.length);
      expect(ids, 'the live week may not also be parked').not.toContain(state.week.contractId);
    }
    // …and the third visit to `c1` is still a resume rather than a restart.
    const back = switchWeek(state.week, state.parked, 'c1', 'resume');
    expect(back.week.day).toBeGreaterThan(1);
  });

  it('merges what has been cleared, so a resumed week cannot clear a scenario twice', () => {
    /*
     * `closeDay`'s `!base.completed.includes(contract.id)` guard is what stops a contract clearing
     * and awarding a second time. A parked week's `completed` is a snapshot from the moment it was
     * parked, so resuming one verbatim would forget a scenario cleared while it was away — and then
     * that scenario could clear again, on a week the player had already been rewarded for.
     */
    const away = switchWeek(played('c1'), [], 'c2', 'resume');
    const cleared = { ...away.week, completed: ['c7'] };
    const back = switchWeek(cleared, away.parked, 'c1', 'resume');
    expect(back.week.completed).toContain('c7');
    // The union, not a replacement: an id only the parked side knows about survives too.
    const parkedKnows = switchWeek(
      { ...cleared, completed: ['c7'] },
      [{ ...(parkedWeekFor(away.parked, 'c1') as WeekState), completed: ['c6'] }],
      'c1',
      'resume',
    );
    expect([...parkedKnows.week.completed].sort()).toEqual(['c6', 'c7']);
  });

  it('carries the week into the sandbox and parks the scenario at the same time', () => {
    /*
     * `withContract`'s documented decision is unchanged: moving to a building no scenario runs is
     * not a new week, and restarting there *"would confiscate a week for opening the editor"*. That
     * was written when there was one slot, so the week could only be carried **or** kept, never
     * both. It can now be both, which is why the decision did not have to be reversed to close this
     * issue.
     */
    const from = played('c1');
    const sandbox = switchWeek(from, [], SANDBOX_CONTRACT_ID, 'resume');
    expect(sandbox.week.contractId).toBe(SANDBOX_CONTRACT_ID);
    expect(sandbox.week.day).toBe(from.day);
    expect(sandbox.week.streak).toBe(from.streak);
    expect(parkedWeekFor(sandbox.parked, 'c1')).toEqual(from);
  });

  it('bounds the list, and the bound covers every id it can be asked for', () => {
    /*
     * One per contract plus the three sentinels, so nothing a player can reach evicts anything else.
     * The third is `FREE_PLAY_CONTRACT_ID` — GitHub issue #125 — and it is walked here rather than
     * asserted about, because the property is *the whole set fits*, not *the constant went up*.
     */
    expect(PARKED_WEEKS_MAX).toBe(CONTRACTS.length + 3);
    let state = { week: openWeek(CONTRACTS[0]?.id), parked: [] as readonly WeekState[] };
    for (const contract of CONTRACTS) state = switchWeek(state.week, state.parked, contract.id, 'resume');
    state = switchWeek(state.week, state.parked, SANDBOX_CONTRACT_ID, 'resume');
    state = switchWeek(state.week, state.parked, FREE_PLAY_CONTRACT_ID, 'restart');
    expect(state.parked.length).toBeLessThan(PARKED_WEEKS_MAX);
    expect(state.parked.length).toBe(CONTRACTS.length + 1);
    // Nothing was evicted: every id walked above is still in the list, or is the one on screen.
    expect(new Set([...state.parked.map((week) => week.contractId), state.week.contractId])).toEqual(
      new Set([...CONTRACTS.map((contract) => contract.id), SANDBOX_CONTRACT_ID, FREE_PLAY_CONTRACT_ID]),
    );
  });

  it('mutates neither the week nor the list it is handed', () => {
    const from = deepFreeze(played('c1'));
    const parked = deepFreeze([openWeek('c2')]);
    expect(() => switchWeek(from, parked, 'c2', 'resume')).not.toThrow();
    expect(() => switchWeek(from, parked, 'c5', 'resume')).not.toThrow();
    expect(parked.length).toBe(1);
  });

  /* ------------------------------------------------------------------ *
   * `restart` — the surfaces whose own copy promises one
   * ------------------------------------------------------------------ */

  it('restarts the destination under `restart`, and still parks what is left', () => {
    /*
     * The scenario card's `title` says *"taking this assignment restarts the week on Garden
     * Apartments"*, so the destination half of what it does is not this issue's business. The
     * departure half was: it called `takeContract` and threw the week the player was on away.
     */
    const from = played('c1');
    const taken = switchWeek(from, [], 'c2', 'restart');
    expect(taken.week).toEqual(takeContract(from, 'c2'));
    expect(parkedWeekFor(taken.parked, 'c1')).toEqual(from);
  });

  it('drops the destination’s parked week under `restart`, because that is what restart means', () => {
    // The two arrivals genuinely differ, and this is where. A card that said *restarts* and quietly
    // resumed would be copy describing a behaviour the code no longer has.
    const from = played('c1');
    const away = switchWeek(from, [], 'c2', 'resume');
    const restarted = switchWeek(away.week, away.parked, 'c1', 'restart');
    expect(restarted.week.day).toBe(1);
    expect(restarted.week.history).toEqual([]);
    expect(parkedWeekFor(restarted.parked, 'c1')).toBeUndefined();
    // …and the week it just left is parked, which is the half that is the same on both arrivals.
    expect(parkedWeekFor(restarted.parked, 'c2')).toEqual(away.week);
  });

  it('keeps what has been cleared across a restart, exactly as `takeContract` always did', () => {
    const from = { ...played('c1'), completed: ['c7'] };
    expect(switchWeek(from, [], 'c2', 'restart').week.completed).toEqual(['c7']);
  });
});

describe('purity', () => {
  it('mutates nothing it is given', () => {
    const week = deepFreeze(openWeek('c1'));
    const outcome = deepFreeze(day(week, 'met'));
    expect(() => closeDay(week, outcome)).not.toThrow();
    expect(() => nextDay(week)).not.toThrow();
    expect(() => takeContract(week, 'c3')).not.toThrow();
  });

  it('returns the same value for the same inputs', () => {
    const week = openWeek('c2');
    const outcome = day(week, 'met');
    expect(closeDay(week, outcome)).toEqual(closeDay(week, outcome));
    expect(nextDay(week)).toEqual(nextDay(week));
  });

  it('leaves the input observably unchanged', () => {
    const week = openWeek('c1');
    const before = JSON.stringify(week);
    closeDay(week, day(week, 'met'));
    nextDay(week);
    takeContract(week, 'c5');
    expect(JSON.stringify(week)).toBe(before);
  });
});

/* -------------------------------------------------------------------------- *
 * A day banks once — `docs/16` § 5 clause 1
 * -------------------------------------------------------------------------- */

describe('re-closing the same day replays it rather than adding to it', () => {
  const cleanDay = (day: number): DayOutcome =>
    outcomeOf({
      record: null,
      recordRefusal: null,
      day,
      dayIdx: 0,
      eventId: 'ordinary',
      readings: readings(day, 'met'),
      minutePct: 90,
      carried: 100,
      arrived: 100,
    });
  const missedDay = (day: number): DayOutcome =>
    outcomeOf({
      record: null,
      recordRefusal: null,
      day,
      dayIdx: 0,
      eventId: 'ordinary',
      readings: readings(day, 'missed'),
      minutePct: 40,
      carried: 60,
      arrived: 100,
    });

  it('does not bank a second clean shift for the same day — the exploit', () => {
    /*
     * The whole finding. Every control in the shell re-runs the day when it is moved, and a re-run
     * has a new recording id, which is the only thing `closeShift` was guarding on. So this was
     * reachable by moving a slider three times: `needClean` 3 cleared on Monday.
     */
    let week = openWeek('c1');
    week = closeDay(week, cleanDay(1));
    expect(week.cleanRun).toBe(1);
    week = closeDay(week, cleanDay(1));
    week = closeDay(week, cleanDay(1));
    expect(week.cleanRun).toBe(1);
    expect(week.streak).toBe(1);
    expect(week.attempt).toBe(3);
  });

  it('shows the day once in the history however many times it was run', () => {
    // Otherwise the seven-day sparkline draws Monday three times and the week looks a day longer
    // than it is.
    let week = openWeek('c1');
    for (let attempt = 0; attempt < 3; attempt += 1) week = closeDay(week, cleanDay(1));
    expect(week.history.length).toBe(1);
    expect(week.history[0]?.day).toBe(1);
  });

  it('still lets a missed day be recovered — the design’s “nothing here is a game over”', () => {
    let week = openWeek('c1');
    week = closeDay(week, missedDay(1));
    expect(week.cleanRun).toBe(0);
    expect(week.streak).toBe(0);
    week = closeDay(week, cleanDay(1));
    expect(week.cleanRun).toBe(1);
    expect(week.streak).toBe(1);
  });

  it('takes the credit back when a re-run turns a clean day into a missed one', () => {
    // The row that needs the snapshot to exist. A rule that could only ever add would let a player
    // bank a clean run and keep the credit while re-running until the picture was prettier.
    let week = openWeek('c1');
    week = closeDay(week, cleanDay(1));
    expect(week.cleanRun).toBe(1);
    week = closeDay(week, missedDay(1));
    expect(week.cleanRun).toBe(0);
    expect(week.streak).toBe(0);
  });

  it('keeps the best day as a high-water mark across attempts', () => {
    // An observation about what the building has been seen to do, not a reward for this attempt.
    let week = openWeek('c1');
    week = closeDay(week, cleanDay(1));
    week = closeDay(week, missedDay(1));
    expect(week.bestMinutePct).toBe(90);
  });

  it('banks for good once the doors open on tomorrow', () => {
    let week = openWeek('c1');
    week = closeDay(week, cleanDay(1));
    week = nextDay(week);
    expect(week.attempt).toBe(0);
    expect(week.closedDay).toBeNull();
    week = closeDay(week, cleanDay(2));
    expect(week.cleanRun).toBe(2);
  });

  it('does not clear a contract on one day, however many times it is run', () => {
    // `c1` needs one clean shift, so the check that matters is a contract needing more than one.
    const needsThree = CONTRACTS.find((entry) => entry.needClean >= 3);
    expect(needsThree).toBeDefined();
    if (needsThree === undefined) return;
    let week = openWeek(needsThree.id);
    for (let attempt = 0; attempt < 5; attempt += 1) week = closeDay(week, cleanDay(1));
    expect(week.completed).toEqual([]);
    expect(week.cleared).toBeNull();
  });

  /*
   * ## An intervention re-close is the same attempt continuing — `docs/20` defect 17
   *
   * ENGINE_CONTRACT § 1.4: an intervention is the same run's record growing, re-simulated from
   * t = 0 — never a new run. The sheet read *"attempt 2 at this day"* to a player who pressed
   * *Run* once and parked once, because the re-simulation re-filed through the ordinary gate and
   * `closeDay` counted every re-close as a retry. `recordGrew` is the caller's testimony that this
   * close replaced the run's own record rather than re-running the day; it gates the attempt count
   * and deliberately nothing else.
   */
  it('does not count an attempt for a re-close whose cause is the record growing', () => {
    let week = openWeek('c1');
    week = closeDay(week, cleanDay(1));
    expect(week.attempt).toBe(1);
    week = closeDay(week, cleanDay(1), true);
    expect(week.attempt).toBe(1);
    // The negative control: the same second close without the testimony is a retry, and counts.
    expect(closeDay(week, cleanDay(1)).attempt).toBe(2);
  });

  it('still replaces the day’s effect on a record-grown re-close — only the attempt is gated', () => {
    // An intervention that turns a clean day into a missed one must still un-bank it: the flag is
    // about *why the close happened*, never about what the day turned out to be.
    let week = openWeek('c1');
    week = closeDay(week, cleanDay(1));
    expect(week.cleanRun).toBe(1);
    week = closeDay(week, missedDay(1), true);
    expect(week.cleanRun).toBe(0);
    expect(week.streak).toBe(0);
    expect(week.attempt).toBe(1);
    expect(week.history.length).toBe(1);
  });

  it('a first close is attempt 1 whether or not the record grew on the way there', () => {
    // Parking mid-run before the day ever filed: the re-simulated day is the day's first close.
    const week = closeDay(openWeek('c1'), cleanDay(1), true);
    expect(week.attempt).toBe(1);
  });
});

describe('the sentinel registry is the sweep, in both directions (issue #145)', () => {
  /*
   * `honesty/surfaces.ts` maps `WEEK_CONTRACT_SENTINELS` to build its `coachWeekLines` cases, so
   * anything in that record is swept. This closes the other direction, which is the half that makes
   * the ask's wording true: a sentinel **declared and not registered** would ship a `weekLabel.ts`
   * branch nothing drives, and before this the corpus covered all four branches by coincidence.
   *
   * Read from **disk** rather than from the module's exports, on `deadCode.test.ts`'s own ground:
   * a set derived from the source text sees a declaration the moment it is written, where a set
   * derived from imports can only see what somebody remembered to import.
   */
  const source = readFileSync(fileURLToPath(new URL('./week.ts', import.meta.url)), 'utf8');
  const declared: readonly { readonly name: string; readonly value: string }[] = [
    ...source.matchAll(/^export const (\w+_CONTRACT_ID) = '([^']+)';/gmu),
  ].map((match) => ({ name: match[1] ?? '', value: match[2] ?? '' }));

  it('finds the declarations it is about, so the match cannot pass by matching nothing', () => {
    // The guard `deadCode.test.ts` learned the hard way: a regex that stops matching turns a
    // both-directions assertion into two empty sets agreeing with each other.
    expect(declared.length).toBeGreaterThanOrEqual(3);
    expect(declared.map((entry) => entry.name)).toContain('ENDLESS_CONTRACT_ID');
  });

  it('registers every declared sentinel, so one cannot ship a branch the corpus never drives', () => {
    const registered = new Set(Object.values(WEEK_CONTRACT_SENTINELS));
    const missing = declared
      .filter((entry) => !registered.has(entry.value))
      .map((entry) => entry.name);
    expect(
      missing,
      'declared in week.ts and absent from WEEK_CONTRACT_SENTINELS — add it there, or the honesty ' +
        'corpus will not sweep the weekLabel.ts branch it buys (GitHub issue #145)',
    ).toEqual([]);
  });

  it('registers nothing that is not declared, so a deleted sentinel cannot linger', () => {
    const declaredValues = new Set(declared.map((entry) => entry.value));
    const stale = Object.entries(WEEK_CONTRACT_SENTINELS).filter(
      ([, value]) => !declaredValues.has(value),
    );
    expect(stale, 'registered in WEEK_CONTRACT_SENTINELS and declared nowhere in week.ts').toEqual(
      [],
    );
  });

  it('registers no id a contract answers to — a sentinel that resolves is a scenario', () => {
    for (const [name, id] of Object.entries(WEEK_CONTRACT_SENTINELS)) {
      expect(
        CONTRACTS.some((contract) => contract.id === id),
        `${name} (${id}) resolves to a shipped contract, so it reaches coachWeekLines' first branch`,
      ).toBe(false);
    }
  });
});

/**
 * **A sandbox day leaves the scoreboard where it found it** — GitHub issue #290.
 *
 * `closeDay`'s guard carries the argument. These cases pin the shape of it, and in particular pin
 * the two halves that are easy to get backwards: the mark must not *rise* on a sandbox day, and it
 * must not *fall* either — the sandbox week is the player's own week wearing a different label, so
 * the figure it carries in is their real best and rolling it back would be the loss the high-water
 * rule was written to prevent, arriving from the other side.
 */
describe('a sandbox day leaves the scoreboard where it found it — GitHub issue #290', () => {
  /** A week with a real scoreboard on it: one clean day banked at 74 %, now on day 2. */
  const scored = (): WeekState => nextDay(closeDay(openWeek('c1'), day(openWeek('c1'), 'met', 74)));

  /**
   * That same week relabelled — which is what a drawn tower actually produces.
   *
   * `withBuilding` reaches the sandbox through `switchWeek(week, parked, SANDBOX_CONTRACT_ID,
   * 'resume')`, and with nothing parked under that id its answer is `withContract(week, …)`: the
   * player has not left their week, they have changed what it is *of*. So the contract is the only
   * variable between the arms below, which is what makes the comparison a measurement of the guard
   * rather than of two different weeks.
   */
  const relabelled = (contractId: string): WeekState => withContract(scored(), contractId);

  it('raises the best on every week except the sandbox', () => {
    for (const [name, id] of Object.entries(WEEK_CONTRACT_SENTINELS)) {
      const week = relabelled(id);
      expect(week.bestMinutePct, name).toBe(74);
      const after = closeDay(week, day(week, 'met', 97));
      expect(after.bestMinutePct, name).toBe(id === SANDBOX_CONTRACT_ID ? 74 : 97);
    }
    // The scored arm, so *does not move* is read beside a *does*: the guard is the sentinel, not
    // the arithmetic having quietly stopped working.
    const week = scored();
    expect(closeDay(week, day(week, 'met', 97)).bestMinutePct).toBe(97);
  });

  it('does not move the streak or the banked count either', () => {
    /*
     * The issue reported only `bestMinutePct`, and read the day counter staying at `0` as a guard
     * working. It was not: that day was *missed*, so `wasGraded` reset the streak. On a **clean**
     * sandbox day the counter moved too — measured, the rail published `1 day running · best 97%` —
     * which is why the guard covers all three and not the one field that was noticed.
     */
    const week = relabelled(SANDBOX_CONTRACT_ID);
    const after = closeDay(week, day(week, 'met', 97));
    expect(after.streak).toBe(week.streak);
    expect(after.cleanRun).toBe(week.cleanRun);
    expect(week.streak).toBeGreaterThan(0);

    // And a missed sandbox day does not take the streak away, which is the same rule's other side.
    const missed = closeDay(week, day(week, 'missed', 12));
    expect(missed.streak).toBe(week.streak);
    expect(missed.cleanRun).toBe(week.cleanRun);
  });

  it('never lowers the mark either, on a sandbox week or a scored one', () => {
    const sandbox = relabelled(SANDBOX_CONTRACT_ID);
    expect(closeDay(sandbox, day(sandbox, 'missed', 3)).bestMinutePct).toBe(74);
    const week = scored();
    expect(closeDay(week, day(week, 'missed', 3)).bestMinutePct).toBe(74);
  });

  it('keeps the day itself — the run happened, and the week screen draws it', () => {
    /*
     * *Nothing counts* is a claim about the score, never a claim that the run did not occur.
     * `dev/main.ts` reads `history.at(-1)` for the sheet it has just filed and `watch/library.ts`
     * counts these among the days this device filed, so a day dropped here would take the report's
     * own *yesterday* with it.
     */
    const week = relabelled(SANDBOX_CONTRACT_ID);
    const after = closeDay(week, day(week, 'met', 97));
    expect(after.history).toHaveLength(week.history.length + 1);
    expect(after.history.at(-1)?.minutePct).toBe(97);
    expect(after.closedDay).toBe(week.day);
    expect(after.attempt).toBe(1);
  });

  it('clears nothing, which it did not before either — the guard adds no accident', () => {
    const week = relabelled(SANDBOX_CONTRACT_ID);
    const after = closeDay(week, day(week, 'met', 100));
    expect(after.cleared).toBeNull();
    expect(after.completed).toEqual(week.completed);
  });
});
