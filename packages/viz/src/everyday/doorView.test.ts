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
import { closeDay, HISTORY_DAYS, openWeek, outcomeOf } from '../shift/week.js';

import { GLOSSARY_TERMS } from '../mode/glossary.js';
import { DAY_OFFSET_MIN, doorScreenViewOf, DOOR_STEPS, RUN_TODAY_AGAIN_NOTE, sameForEveryoneLine } from './doorView.js';
import { PRESS_DAY_CHOICE_COPY } from './towerChoice.js';
import { EM_DASH } from './figures.js';
import type { TodayRecord } from './today.js';

/** A day that met every bar, so its outcome is a real closed day with a real score. */
const MET: GoalObservations = {
  arrived: 400,
  carryPct: 100,
  minutePct: 84,
  peakQueue: 3,
  abandoned: 0,
  // The overlap and the run's own horizon that § D417 binds every publisher of
  // `abandoned` to carry, and `goals.ts#gaveUpBesideOf` reads (GitHub issue #456).
  abandonedCarried: 0,
  horizonS: 900,
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
  /* § D871's whole-day holds; this fixture's day holds no car. */
  heldCarIds: [],
  dayLabel: 'FRIDAY · DAY 5',
  towerName: 'Chancery House',
  lede: 'Fourteen floors and three lifts.',
  wrinkle: { id: 'ordinary', name: 'An ordinary day', note: 'Nothing booked.' } as TodayRecord['wrinkle'],
  wrinkleName: 'An ordinary day',
  wrinkleNote: 'Nothing booked.',
  outOfService: undefined,
  facts: [],
  load: undefined,
  asks: [],
  seedLine: 'tower chancery-house · crowd 424242 · today’s date, so everyone playing today meets this crowd',
  crowdIsToday: true,
  crowdIsPinned: false,
  firstSessionLine: undefined,
  dayLength: undefined,
  driver: 'Steady hand',
  driverHeld: undefined,
  wayThrough: undefined,
};

/** Building names by id, as the shipped documents carry them — the fixture for `nameOf` (GitHub issue #599). */
const NAMES: Readonly<Record<string, string>> = {
  'garden-apartments': 'Garden Apartments',
  'crown-hotel': 'Crown Hotel',
  'chancery-house': 'Chancery House',
  'midtown-office': 'Midtown Office',
};
const NAME_OF = (buildingId: string): string | undefined => NAMES[buildingId];

const viewAt = (
  dayOffset: number,
  dayClosed: boolean,
  week: WeekState = weekWith(5, [closedDay(1), closedDay(2), closedDay(3), closedDay(4)]),
): ReturnType<typeof doorScreenViewOf> =>
  doorScreenViewOf({ week, today: { ...TODAY, day: week.day }, dayOffset, dayClosed, nameOf: NAME_OF });

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
    expect(byDay.get(1)?.tower).toBe('Garden Apartments');
    expect(byDay.get(2)?.tower).toBe('Crown Hotel');
    expect(byDay.get(3)?.tower).toBe('Chancery House');
  });

  it('names a closed day and today the same way — GitHub issue #599', () => {
    /*
     * The closed chip printed `record.buildingId` and today's printed the document's name, so one
     * strip named one tower two ways: *midtown-office* on Thursday, *Midtown Office* beside it.
     * Today closed on the same tower as yesterday is the case, and the id may appear on neither.
     */
    const week = weekWith(4, [closedDay(3, 'midtown-office'), closedDay(4, 'midtown-office')]);
    const today: TodayRecord = { ...TODAY, day: 4, towerName: 'Midtown Office' };
    const chips = doorScreenViewOf({ week, today, dayOffset: 0, dayClosed: true, nameOf: NAME_OF }).chips;
    const byDay = new Map(chips.map((chip) => [chip.day, chip]));
    expect(byDay.get(3)?.tower).toBe('Midtown Office');
    expect(byDay.get(4)?.tower).toBe('Midtown Office');
    expect(chips.map((chip) => chip.tower)).not.toContain('midtown-office');
    /* An id this build has no document for is printed as itself, `todayOf`'s own fallback. */
    const unknown = weekWith(2, [closedDay(1, 'no-such-tower')]);
    expect(viewAt(0, false, unknown).chips.find((chip) => chip.day === 1)?.tower).toBe('no-such-tower');
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

describe('the § 3.3 primary, and the replay a past day earns — § D517', () => {
  it('is pressable at today and carries § 3.3’s own note', () => {
    const view = viewAt(0, false);
    expect(view.primary.label).toBe('Set up today');
    expect(view.primary.inert).toBe(false);
    expect(view.primary.note).toBe('Pick who drives, then run it.');
  });

  it('opens tomorrow once today is closed, and keeps today’s second attempt beside it — § D1004', () => {
    /*
     * The post-AH panel's *no route to tomorrow from the front door*: a closed Monday left from its
     * report came back here as *Set up today* over a disabled `›`, and the press re-ran Monday.
     */
    const view = viewAt(0, true);
    expect(view.primary.inert).toBe(false);
    expect(view.primary.goes).toBe('tomorrow');
    // Day 5 of this fixture is a Friday, so the doors open on Saturday.
    expect(view.primary.label).toBe('Open the doors on Saturday');
    expect(view.primary.note).toMatch(/closed and banked/);
    // The retry is not taken off the door: it is drawn beside the primary and says what it does.
    expect(view.primary.again?.label).toBe('Run today again');
    expect(view.primary.again?.note).toMatch(/another attempt/iu);
    expect(view.primary.again?.note).toMatch(/no presses carried over/);
  });

  it('says which attempt the week keeps, and it is the one closeDay keeps (wave AJ, § D1098)', () => {
    /*
     * The post-AI panel's seat A: *Run today again* said *the week keeps the better one*, and Friday
     * kept 35 % over 36 %. The week is asked rather than described: close a day at a better figure,
     * re-close it at a worse one, and read what the history holds.
     */
    const better = { ...closedDay(5), minutePct: 36 };
    const worse = { ...closedDay(5), minutePct: 35 };
    const week = closeDay(closeDay(weekWith(5, []), better), worse);
    expect(week.history.at(-1)?.minutePct, 'closeDay kept the better attempt, so the note must say so').toBe(35);

    const note = viewAt(0, true).primary.again?.note ?? '';
    expect(note).toBe(RUN_TODAY_AGAIN_NOTE);
    expect(note).not.toMatch(/better one/u);
    expect(note).toMatch(/close last/u);
    expect(note).toMatch(/even when it reads worse/u);
  });

  it('reads a closed today off the week as well as off the sitting — a reload keeps the day, not the run', () => {
    const banked = weekWith(5, [closedDay(1), closedDay(2), closedDay(3), closedDay(4), closedDay(5)]);
    const view = viewAt(0, false, banked);
    expect(view.primary.goes).toBe('tomorrow');
    // And an open today is still today, with no second button.
    expect(viewAt(0, false).primary.goes).toBe('today');
    expect(viewAt(0, false).primary.again).toBeUndefined();
  });

  it('never offers tomorrow from a past chip — the replay is the only thing a past day hands back', () => {
    const view = viewAt(-2, true);
    expect(view.primary.goes).toBe('replay');
    expect(view.primary.again).toBeUndefined();
  });

  it('is pressable on a past day inside the week, names the day, and says it never counts', () => {
    const view = viewAt(-2, false);
    expect(view.primary.label).toBe('Set up the replay');
    expect(view.primary.inert).toBe(false);
    // § 16 rule 6: it names the day rather than gesturing, and § 6.1: the note says what a replay does to the record.
    expect(view.primary.note).toContain('Day 3');
    expect(view.primary.note).toMatch(/never counts/);
  });

  it('is inert on a chip from before this week began, and says so', () => {
    const view = viewAt(-6, false);
    expect(view.chips.find((chip) => chip.selected)?.day).toBeUndefined();
    expect(view.primary.label).toBe('Set up the replay');
    expect(view.primary.inert).toBe(true);
    expect(view.primary.note).toMatch(/before this week/);
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

  it('promises no duration the run does not have — § D733', () => {
    /*
     * Step 2 read *“The whole shift in a couple of minutes”*. Ten of the eleven contracts a first
     * session can open on run a 36 000 s authored day (`shift/dayLength.ts#wholeDayFor` over
     * `data/`), and at the opening stage speed — `4×`, § D641 — that is two and a half real
     * hours. The step names the day and leaves the length to the speed the player sets, which is
     * the only thing on this screen that actually controls it.
     */
    const watch = DOOR_STEPS.find((step) => step.head === 'Watch the day');
    /*
     * And no length at all since the post-AH panel's H13: *a whole working day* was false on the
     * two towers whose day is a slice, and *not steer it* on every day, beside three live presses.
     */
    expect(watch?.body).not.toMatch(/whole working day|not steer/u);
    expect(watch?.body).toContain('park the cars');
    expect(DOOR_STEPS.map((step) => step.body).join(' ')).not.toMatch(/only thing you choose/u);
    expect(watch?.body).not.toMatch(/couple of minutes|\bminutes?\b/);
    for (const step of DOOR_STEPS) expect(step.body).not.toMatch(/\d/);
  });

  it('states the rule as one crowd a day, because one tower a day is not what this build does', () => {
    // § D730: a week runs one contract, so the tower turns over when a contract does. The crowd
    // is what turns over daily, and it is the thing the rule can honestly promise.
    const rule = viewAt(0, false).rule;
    expect(rule).toContain('One crowd a day, the same for everybody');
    expect(rule).not.toContain('One tower a day');
  });

  it('claims a shared crowd only on a run that has one', () => {
    /*
     * § D729 and § D730 together, at the one sentence that used to carry the whole false claim.
     * The two arms are the two states that reach this screen: the day's crowd, and a crowd of the
     * run's own — a `?seed=` deep link, or a session left open past UTC midnight.
     */
    const shared = sameForEveryoneLine(true, false);
    const own = sameForEveryoneLine(false, false);
    expect(shared).toContain('Everyone playing today meets the same crowd');
    expect(shared).toContain('today’s date');
    expect(own).toContain('nobody else is playing it');
    expect(own).not.toContain('Everyone');
    /*
     * **The pinned arm — § D1047.** A pinned day's crowd is shared by everybody who opens that
     * tower's pinned day, so *nobody else is playing it* was false of it; and the brief holds the
     * standing order until the call is answered, so *the dispatcher is yours to bring* was too.
     */
    const pinned = sameForEveryoneLine(false, true);
    expect(pinned).toContain('the crowd its day was measured on rather than the day’s');
    expect(pinned).not.toContain('nobody else');
    expect(pinned).not.toContain('yours to bring');
    // No arm says the tower is shared, because it is not — on any of them.
    for (const line of [shared, own, pinned]) {
      expect(line).toContain('The tower is the one your week is on');
      expect(line).not.toContain('the same tower');
    }
    expect(viewAt(0, false).sameForEveryone).toBe(shared);
    expect(
      doorScreenViewOf({
        week: weekWith(1, []),
        today: { ...TODAY, day: 1, crowdIsToday: false, crowdIsPinned: true },
        dayOffset: 0,
        dayClosed: false,
        nameOf: NAME_OF,
      }).sameForEveryone,
    ).toBe(pinned);
  });

  it('names the pinned days as a crowd a player is on, not only one they choose — § D1047', () => {
    /* A newcomer is dealt a pinned day without choosing it, so the rule's exception says *are on*. */
    const rule = viewAt(0, false).rule;
    expect(rule).toContain('unless you are on one of the days a press decides');
    expect(rule).not.toContain('unless you choose');
  });

  /*
   * The post-AI playability panel's newcomer seat met *a press*, *standing order* and *pinned
   * crowd* on this screen with nothing saying what they were. The door now defines each under its
   * rule, from `mode/glossary.ts` by reference, and only the ones it prints.
   */
  it('defines the day’s own words it prints, by the glossary’s own sentence, and no others', () => {
    const plainOf = (id: string): string => {
      const found = GLOSSARY_TERMS.find((entry) => entry.id === id);
      if (found === undefined) throw new Error(`no glossary term ${id}`);
      return found.plain;
    };
    /* An ordinary door prints *a press decides* in its rule and nothing about a pinned crowd. */
    const ordinary = viewAt(0, false).words;
    expect(ordinary[0]).toBe(plainOf('press'));
    expect(ordinary).not.toContain(plainOf('pinned-crowd'));
    expect(ordinary).not.toContain(plainOf('standing-order'));

    /* A pinned day's door names its pinned day, and the press-day card names the standing order. */
    const pinned = doorScreenViewOf({
      week: weekWith(1, []),
      today: { ...TODAY, day: 1, crowdIsToday: false, crowdIsPinned: true },
      dayOffset: 0,
      dayClosed: false,
      nameOf: NAME_OF,
      alsoOnScreen: [PRESS_DAY_CHOICE_COPY.heading, PRESS_DAY_CHOICE_COPY.ledeBefore],
    }).words;
    expect(pinned).toEqual([plainOf('press'), plainOf('standing-order'), plainOf('pinned-crowd')]);
    /* Each definition names the word it defines, so a line read alone still says what it is about. */
    expect(pinned[0]).toMatch(/^A press is/u);
    expect(pinned[1]).toMatch(/^A standing order is/u);
    expect(pinned[2]).toMatch(/^A pinned crowd is/u);
  });
});

