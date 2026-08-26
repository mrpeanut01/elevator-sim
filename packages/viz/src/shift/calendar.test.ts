/**
 * A period reaches the simulation — measured on the legs, once per period, both ways.
 *
 * ## The bar
 *
 * § D177: **move the control and require the run to change, compared on the legs, never on a window
 * statistic.** A mean can be unchanged for a run that is entirely different, and a mean can move
 * because the window moved; the legs are the run. Every shipped period is put against *the same day
 * with no period* and required to differ — including `public-holiday`, which is designed to make the
 * day **quieter** and therefore has to move the legs in the other direction, with fewer of them.
 *
 * And the inverse, which is the assertion that matters most: a period whose window does not contain
 * today, or whose weekdays do not include today's, changes **nothing, byte-identically**. A calendar
 * that leaked outside its own dates would be the worst version of this feature — every figure
 * measured on an ordinary day would have quietly moved.
 *
 * ## Why this file builds the run itself, and how that is kept honest
 *
 * `dev/state.ts#shiftRunConfigOf` is the single answer to *what is the simulator being asked for*,
 * and the calendar's call into it lands in a different lane than this module. Until it does, this
 * file performs the documented sequence itself — which is exactly the reconstruction
 * `scope/probes.test-helper.ts` warns about: *"an instrument that does not reproduce the shipped
 * call path measures the instrument."*
 *
 * So the reconstruction is **checked rather than trusted**. {@link planWith} with no period must
 * produce legs byte-identical to `shiftRunConfigOf`'s own, on the same state — the first test below —
 * and every other run in this file is built by the same function. If the harness drifts from the
 * shipped builder, that one assertion fails and takes the whole file with it rather than letting the
 * period tests quietly measure something else.
 *
 * The sequence {@link planWith} performs is the one `calendarPatch`'s docstring instructs a caller
 * to perform, in the same order, and when the wiring lands this harness is what it replaces.
 *
 * ## Why every run is Midtown Office
 *
 * `probes.test-helper.ts` measured the reason on a different control and it applies here without
 * change: Garden Apartments is six floors and two hydraulic cars at a residential trickle, and at
 * that demand **`main-A` answers everything on its own** — holding a car there produces a
 * byte-identical set of legs. A goods car reserved on that building would report a live control
 * dead. Midtown Office is four cars and 1 710 people, and it is the building `incidents.test.ts`
 * chose for the same reason.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBuilding, resolveBuilding, type BuildingConfig, type DemandTemplateId } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { asBuiltChoices, withBankChoice } from '../commissioning/choices.js';
import { commissionedBuilding } from '../commissioning/building.js';
import { commissionableClasses } from '../commissioning/types.js';
import { recordRun } from '../record/recordRun.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';

import {
  CALENDAR_PERIODS,
  CALENDAR_PERIOD_IDS,
  calendarAsks,
  calendarDayFor,
  calendarLine,
  calendarPatch,
  periodOnDays,
  scheduledEventFor,
  type CalendarPeriod,
} from './calendar.js';
import { SHIFT_EVENTS, baseDemandOf, eventFor, shiftRunPatch } from './events.js';
import { grownBuilding } from './growth.js';
import { withIncidents } from './incidents.js';

/* -------------------------------------------------------------------------- *
 * The harness — the documented sequence, and nothing else
 * -------------------------------------------------------------------------- */

/**
 * Midtown Office on day 1 — a Monday, whose scheduled event is asserted below to be ordinary — at the
 * **standard 30-minute shift**.
 *
 * 1 800 s rather than the 900 s the cheaper probes use, and the reason is a period rather than a
 * preference: `quarter-end` and `rota-week` impose a demand template, `office-down-peak` and
 * `shift-change` each declare a 30-minute period of their own, and `calendarPatch` refuses a
 * template the shift is too short for — in the same words `menu.ts` refuses one to a free-play run.
 * Measured at 900 s those two periods would still move the legs, and would move them **without the
 * template**, so the test would be quietly measuring half of what it claims. 1 800 s is
 * `DEFAULT_SHIFT_LENGTH_S`, so this is the shift a player is actually standing in.
 */
const monday = (): ViewerState => {
  const state = baseState();
  return {
    ...state,
    buildingId: 'midtown-office',
    shiftLengthS: 1800,
    week: { ...state.week, day: 1, dayIdx: 0 },
  };
};

/** The same building on a Saturday, for the weekday-gate arm. */
const saturday = (): ViewerState => {
  const state = monday();
  return { ...state, week: { ...state.week, day: 6, dayIdx: 5 } };
};

function authoredConfig(buildingId: string): BuildingConfig {
  const entry = RESOURCES.entries.find((candidate) => candidate.config.id === buildingId);
  if (entry === undefined) throw new Error(`no authored building "${buildingId}" in the probe resources`);
  return entry.config;
}

interface Plan {
  readonly config: Parameters<typeof recordRun>[0];
  readonly outOfServiceCarIds: readonly string[];
  readonly calendar: ReturnType<typeof calendarPatch>;
  /** The grown building the calendar was handed, so *it changed nothing* can be an identity test. */
  readonly grown: BuildingConfig;
}

/**
 * Build the run the way `shiftRunConfigOf` will once the calendar is wired into it.
 *
 * The order is the one `calendarPatch` documents: grow, resolve, take the day's event (which the
 * period may override), patch the demand, **then** the calendar, then the incidents, then one parse
 * and one resolve for both building edits at once.
 *
 * Everything the calendar cannot touch — the dispatcher, the selector, the seed, the traffic
 * profiles, the pattern's own demand — is taken from the shipped plan rather than rebuilt, so this
 * harness reconstructs the *sequence* and not the whole builder.
 */
function planWith(state: ViewerState, period: CalendarPeriod | null): Plan {
  const shipped = shiftRunConfigOf(RESOURCES, state);
  const authored = authoredConfig(state.buildingId);
  const specs = RESOURCES.elevatorSpecs;

  const grown = grownBuilding(authored, state.week.day);
  const grownResolved = resolveBuilding(parseBuilding(grown as unknown), specs);

  const calendarDay = calendarDayFor(period, state.week.day, state.week.dayIdx);
  // Through the shipped composition rather than a copy of it — GitHub issue #135. This harness
  // held its own ternary, which made it a **sixth** site deriving the day's event: a harness that
  // re-implements the thing it is standing in for can only ever agree with itself.
  const event = scheduledEventFor(period, state.week.day, state.week.dayIdx);

  const profile = RESOURCES.trafficProfiles.profiles.find(
    (candidate) => candidate.id === authored.trafficProfile,
  );
  if (profile === undefined) throw new Error(`no traffic profile "${authored.trafficProfile ?? ''}"`);
  const base = baseDemandOf(profile);

  const template = (shipped.config.demandTemplate ?? 'rise-and-fall') as DemandTemplateId;
  const patch = shiftRunPatch({
    event,
    building: grownResolved,
    base,
    templateVariesMix: template === 'lunch-two-way',
  });

  /*
   * **The event and the player's holds, exactly as `shiftRunConfigOf` passes them — GitHub issue
   * #272.** This harness used to build the spoken-for list itself, out of three spread elements, and
   * the list it built was **correct** while `shiftRunConfigOf`'s was not. A harness that builds a
   * better input than the product does is not a stricter test, it is a test of something else — and
   * the one assertion that would have caught it ran only with no period at all. Neither builds a
   * list now; `calendarPatch` derives it.
   */
  const calendar = calendarPatch({
    day: calendarDay,
    building: grown,
    split: patch.demand.directionalSplit ?? base.split,
    demandTemplateId: template,
    demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
    runLengthS: state.shiftLengthS,
    event,
    playerHeldCarIds: state.outOfServiceCarIds,
  });

  const withEvents = withIncidents(calendar.building, patch.incidents, state.shiftLengthS);
  const building =
    withEvents === grown ? grownResolved : resolveBuilding(parseBuilding(withEvents as unknown), specs);

  const outOfServiceCarIds = [
    ...new Set([...state.outOfServiceCarIds, ...patch.outOfServiceCarIds, ...calendar.outOfServiceCarIds]),
  ].sort((a, b) => a.localeCompare(b));

  return {
    calendar,
    grown,
    outOfServiceCarIds,
    config: {
      ...shipped.config,
      building,
      demandTemplate: calendar.demandTemplateId ?? template,
      demand: { ...shipped.config.demand, ...patch.demand, ...calendar.demand },
    },
  };
}

function runOf(plan: Plan): ReturnType<typeof recordRun> {
  return recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
}

/** The legs, as a comparable string. Never a window statistic — § D177. */
const legsOfRun = (run: ReturnType<typeof recordRun>): string =>
  JSON.stringify(run.recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]));

const legsWith = (state: ViewerState, period: CalendarPeriod | null): string =>
  legsOfRun(runOf(planWith(state, period)));

/** One control run per state, kept because every period test compares against it. */
const CONTROL = new Map<string, string>();
function controlLegs(state: ViewerState): string {
  // Every field the control depends on is in the key. The shift length was missing from a first
  // draft, and the 300 s arm silently compared itself against the 1 800 s control — a cache that
  // makes a test pass by answering a different question.
  const key = [
    state.buildingId,
    state.week.day,
    state.week.dayIdx,
    state.shiftLengthS,
    state.seed,
  ].join(':');
  const cached = CONTROL.get(key);
  if (cached !== undefined) return cached;
  const legs = legsWith(state, null);
  CONTROL.set(key, legs);
  return legs;
}

/* -------------------------------------------------------------------------- *
 * The harness is the shipped path
 * -------------------------------------------------------------------------- */

describe('the instrument reproduces the builder it stands in for', () => {
  it('with no period, produces exactly the run shiftRunConfigOf produces', () => {
    /*
     * The assertion the rest of this file rests on. If it fails, the harness has drifted from
     * `shiftRunConfigOf` and every period result below is measuring the harness.
     */
    const state = monday();
    const shipped = shiftRunConfigOf(RESOURCES, state);
    const direct = legsOfRun(
      recordRun(shipped.config, { recordDecisions: false, outOfServiceCarIds: shipped.outOfServiceCarIds }),
    );
    expect(controlLegs(state)).toBe(direct);
  });

  /**
   * **The same assertion with a period on the state, over every shipped period — GitHub issue #272.**
   *
   * The one above is the only place the harness and `shiftRunConfigOf` were ever compared, and it
   * ran with `state.calendar === null`. So it compared the two builders on the one input for which
   * the calendar contributes nothing, and every period below was measured by the harness alone.
   * `RISKS.md` R26 in one sentence: a suite built from fixtures cannot tell *the mechanism is
   * correct* from *the mechanism is reached*.
   *
   * What it missed was a whole ask. `shiftRunConfigOf` handed `calendarPatch`
   * `spokenForCarIds: patch.outOfServiceCarIds` — always `[]`, because every shipped event declares
   * `carsOutOfService: 0` — while {@link planWith} built the set the field's own docstring
   * describes, the whole-shift holds **and** the incident cars. On `moving-week` day 1 the two
   * therefore reserved different cars: the harness reserved `main-C`, the product reserved `main-D`,
   * which is the very car `move-in`'s derate stands down and hands back at 1 200 s of an 1 800 s
   * shift.
   *
   * The period goes on the **state** here rather than only into the harness, because that is the
   * only way the shipped builder ever sees one: `planWith` reads `shiftRunConfigOf` for everything
   * the calendar cannot touch and applies the period itself, so a period passed to it alone never
   * reaches the code under test.
   */
  it('with a period on the state, produces exactly the run shiftRunConfigOf produces', () => {
    for (const id of CALENDAR_PERIOD_IDS) {
      const period = periodOnDays(CALENDAR_PERIODS[id], 1, 7);
      const state = monday();
      const shipped = shiftRunConfigOf(RESOURCES, { ...state, calendar: period });
      const direct = legsOfRun(
        recordRun(shipped.config, {
          recordDecisions: false,
          outOfServiceCarIds: shipped.outOfServiceCarIds,
        }),
      );
      // The cars first, because that is the axis that drifted and a leg diff does not name it.
      expect(planWith(state, period).outOfServiceCarIds, `${id}: cars`).toEqual(
        shipped.outOfServiceCarIds,
      );
      expect(legsWith(state, period), `${id}: legs`).toBe(direct);
    }
  });

  it('measures a day whose own scheduled event changes nothing', () => {
    // Derived rather than assumed. Day 1 is an ordinary Monday today; if `eventFor`'s arithmetic
    // moves, this says so rather than letting a period's result be an event's.
    expect(SHIFT_EVENTS[eventFor(1, 0).id].effect.changesNothing).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Resolving a day — the cheap half
 * -------------------------------------------------------------------------- */

describe('a period resolves to a day, or to nothing at all', () => {
  it('is null outside its own window, at both ends', () => {
    const period = periodOnDays(CALENDAR_PERIODS.vacation, 3, 5);
    expect(calendarDayFor(period, 2, 1)).toBeNull();
    expect(calendarDayFor(period, 6, 5)).toBeNull();
    expect(calendarDayFor(period, 3, 2)).not.toBeNull();
    expect(calendarDayFor(period, 5, 4)).not.toBeNull();
  });

  it('is null on a weekday the period does not touch', () => {
    // `quarter-end` is a business-week period. A quarter does not end on a Saturday, and the
    // weekday — not the day number — is what says so.
    const period = periodOnDays(CALENDAR_PERIODS['quarter-end'], 1, 7);
    expect(calendarDayFor(period, 5, 4)?.weekday).toBe('Friday');
    expect(calendarDayFor(period, 6, 5)).toBeNull();
    expect(calendarDayFor(period, 7, 6)).toBeNull();
  });

  it('is null when there is no period at all', () => {
    expect(calendarDayFor(null, 1, 0)).toBeNull();
  });

  it('merges a weekday override over the period’s own shift, keeping the rest', () => {
    const moving = CALENDAR_PERIODS['moving-week'];
    const saturdayShift = calendarDayFor(moving, 6, 5);
    const sundayShift = calendarDayFor(moving, 7, 6);
    expect(saturdayShift?.overridden).toBe(true);
    expect(saturdayShift?.shift.goodsCars).toBe(2);
    // Inherited, not restated: Saturday says nothing about the event and keeps the period's.
    expect(saturdayShift?.shift.eventId).toBe('move-in');
    // And an explicit null is *not today* rather than *inherit* — the movers do not work Sunday.
    expect(sundayShift?.shift.eventId).toBeNull();
    expect(sundayShift?.shift.goodsCars).toBe(0);
  });

  it('re-windows without touching the period it was given', () => {
    const shipped = CALENDAR_PERIODS.vacation;
    const moved = periodOnDays(shipped, 8, 14);
    expect(moved.fromDay).toBe(8);
    expect(shipped.fromDay).toBe(1);
    expect(moved.shift).toBe(shipped.shift);
  });

  it('declares a shift for every id, so a sixth period cannot arrive without one', () => {
    for (const id of CALENDAR_PERIOD_IDS) {
      const period = CALENDAR_PERIODS[id];
      expect(period.id, id).toBe(id);
      expect(period.shift.populationFactor, id).toBeGreaterThan(0);
      expect(period.note.length, id).toBeGreaterThan(0);
      expect(period.fromDay, id).toBeLessThanOrEqual(period.toDay);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The event a day is under — GitHub issue #135
 * -------------------------------------------------------------------------- */

describe('one answer to what event a day is under — issue #135', () => {
  it('is the ordinary schedule when there is no period', () => {
    // `null` has to be byte-identical to `eventFor`, because *no calendar* is the shipped week and
    // any drift here would move every day of it.
    for (let day = 1; day <= 14; day += 1) {
      const dayIdx = (day - 1) % 7;
      expect(scheduledEventFor(null, day, dayIdx), `day ${String(day)}`).toBe(
        eventFor(day, dayIdx),
      );
    }
  });

  it('is the period’s event where the period names one, and it differs from the schedule', () => {
    const moving = CALENDAR_PERIODS['moving-week'];
    /*
     * Every day of `moving-week`, with the schedule's own answer beside it. Five of the seven
     * differ — day 3 is a move-in on the schedule anyway, and Sunday is handed back — so this both
     * asserts the override and measures how often it bites. A period that overrode nothing would
     * pass a test that only checked *equals the period's event*.
     */
    const differ: number[] = [];
    for (let day = 1; day <= 7; day += 1) {
      const dayIdx = (day - 1) % 7;
      const booked = scheduledEventFor(moving, day, dayIdx);
      const schedule = eventFor(day, dayIdx);
      const named = calendarDayFor(moving, day, dayIdx)?.shift.eventId;
      expect(booked.id, `day ${String(day)}`).toBe(named ?? schedule.id);
      if (booked.id !== schedule.id) differ.push(day);
    }
    expect(differ).toEqual([1, 2, 4, 5, 6]);
  });

  it('hands the day back when a period names no event, rather than inventing a quiet one', () => {
    const moving = CALENDAR_PERIODS['moving-week'];
    // Sunday's override is an explicit `null` — the movers do not work Sunday — and `vacation`
    // names no event at all. Both are *the ordinary day*, and a caller that distinguished them
    // would be inventing a state the product does not have.
    expect(scheduledEventFor(moving, 7, 6).id).toBe(eventFor(7, 6).id);
    expect(scheduledEventFor(CALENDAR_PERIODS.vacation, 3, 2).id).toBe(eventFor(3, 2).id);
  });

  it('is outside a period’s window exactly as far as the period is', () => {
    // The window is `calendarDayFor`'s and is not re-implemented here. Driven at both edges so a
    // future off-by-one in either function shows up as a day the run and the sheet disagree on.
    const period = periodOnDays(CALENDAR_PERIODS['moving-week'], 3, 4);
    expect(scheduledEventFor(period, 2, 1).id).toBe(eventFor(2, 1).id);
    expect(scheduledEventFor(period, 3, 2).id).toBe('move-in');
    expect(scheduledEventFor(period, 4, 3).id).toBe('move-in');
    expect(scheduledEventFor(period, 5, 4).id).toBe(eventFor(5, 4).id);
  });

  it('is what the shipped builder runs, compared on the legs rather than on a name', () => {
    /*
     * The standing requirement, pointed at the seam rather than at a control — and driven through
     * `shiftRunConfigOf` itself rather than through this file's harness, because the whole issue is
     * that the *description* and the *run* were two expressions and a harness is a third.
     *
     * Day 5 on the ordinary schedule is a fire drill; `moving-week` books a move-in. Two different
     * events, so two different runs. A `scheduledEventFor` that fell back to the schedule, or a
     * `shiftRunConfigOf` that stopped consulting it, would make these identical.
     */
    const friday = { ...monday(), week: { ...monday().week, day: 5, dayIdx: 4 } };
    expect(eventFor(5, 4).id).toBe('fire-drill');
    expect(scheduledEventFor(CALENDAR_PERIODS['moving-week'], 5, 4).id).toBe('move-in');

    const legs = (state: ViewerState): string => {
      const plan = shiftRunConfigOf(RESOURCES, state);
      return legsOfRun(
        recordRun(plan.config, {
          recordDecisions: false,
          outOfServiceCarIds: plan.outOfServiceCarIds,
        }),
      );
    };
    expect(legs({ ...friday, calendar: CALENDAR_PERIODS['moving-week'] })).not.toBe(legs(friday));
    /*
     * `300_000`, the figure every other legs case in this repository passes — GitHub issue #144.
     *
     * This case and one in `menu/screens.test.ts` were the only two that ran real simulations at
     * vitest's default **5 000 ms**. Two runs of `garden-apartments` take about 3.5 s standalone, so
     * the margin was 1.5 s; both timed out during a full-suite run on a machine that was also
     * carrying four other agents, and both passed on a clean run of the same tree. This project runs
     * waves of parallel agents in worktrees on one machine **by design**, so *under load* is the
     * normal condition here rather than the exceptional one.
     *
     * Worth the line rather than tolerated because of what the failure *says*. A legs comparison is
     * the standing requirement's prescribed evidence; when one goes red it should be read as *the
     * control stopped moving the run*, and `Test timed out in 5000ms` reads instead as an
     * infrastructure hiccup — which is the message most likely to be dismissed, and the true
     * positive is the one that gets dismissed with it.
     */
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * § D177 — every period moves the legs
 * -------------------------------------------------------------------------- */

describe('§ D177 — the period reaches the simulation', () => {
  it('vacation: fewer people, and a flatter mix', () => {
    const state = monday();
    const plan = planWith(state, CALENDAR_PERIODS.vacation);
    expect(legsOfRun(runOf(plan))).not.toBe(controlLegs(state));

    // The fabric edit is real: the building the kernel was handed carries fewer people.
    expect(plan.calendar.population?.after ?? 0).toBeLessThan(plan.calendar.population?.before ?? 0);

    // And *flatter* is measured rather than claimed: every share is closer to a third than the
    // office profile's own 85/5/10 was.
    const split = plan.calendar.demand.directionalSplit;
    expect(split).toBeDefined();
    if (split === undefined) return;
    const office = { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 };
    for (const key of ['incoming', 'outgoing', 'interfloor'] as const) {
      expect(Math.abs(split[key] - 1 / 3), key).toBeLessThan(Math.abs(office[key] - 1 / 3));
    }
  });

  it('public holiday: quieter, and quiet still moves the legs', () => {
    /*
     * The § D177 rule pointed at the period designed to make a day *easier*. A quiet day is the one
     * most likely to be implemented as a caption, and the requirement is the same: the legs move,
     * and here they move in the other direction — there are fewer of them, because a quarter of the
     * building generates a quarter of the arrivals at the same declared rate.
     */
    const state = monday();
    const plan = planWith(state, CALENDAR_PERIODS['public-holiday']);
    const quiet = runOf(plan);
    expect(legsOfRun(quiet)).not.toBe(controlLegs(state));

    const busy = runOf(planWith(state, null));
    expect(quiet.recording.legs.length).toBeLessThan(busy.recording.legs.length / 2);
    expect(quiet.recording.legs.length).toBeGreaterThan(0);
  });

  it('moving week: the movers’ car carries nobody, and it is not the mover’s van', () => {
    const state = monday();
    const plan = planWith(state, CALENDAR_PERIODS['moving-week']);
    const run = runOf(plan);
    expect(legsOfRun(run)).not.toBe(controlLegs(state));

    /*
     * The specific claim, which *"the legs differ"* would pass without: the reserved car serves
     * nobody all day. And it is a **different** car from the one the day's move-in event stands
     * down for two thirds of the shift — the reservation steps down the same total order rather
     * than double-booking, because an incident's return-to-service event would otherwise hand the
     * movers' car back to passengers halfway through.
     */
    const reserved = plan.calendar.outOfServiceCarIds;
    expect(reserved.length).toBe(1);
    const events = plan.config.building.serviceEvents ?? [];
    const derated = events.map((event) => `${event.bankId ?? ''}-${event.carId}`);
    expect(derated.length).toBeGreaterThan(0);
    expect(derated).not.toContain(reserved[0]);

    const carried = run.recording.legs.filter((leg) => leg.carId === reserved[0]);
    expect(carried.length, `${reserved[0] ?? ''} carried passengers on a day it was reserved`).toBe(0);
  });

  it('quarter end: a fuller building, on the template it was authored for', () => {
    const state = monday();
    const plan = planWith(state, CALENDAR_PERIODS['quarter-end']);
    expect(legsOfRun(runOf(plan))).not.toBe(controlLegs(state));

    /*
     * `office-down-peak`, not `evening-egress`, since `DECISIONS.md` § D263. This period is an
     * office end of day and `evening-egress` is a ballroom emptying — one record was doing both
     * jobs, and § D244's one-hour-per-template made that impossible to keep honest.
     */
    expect(plan.config.demandTemplate).toBe('office-down-peak');
    expect(plan.calendar.population?.after ?? 0).toBeGreaterThan(plan.calendar.population?.before ?? 0);
    // The mix is pulled toward the lobby, not replaced by it: an 0.5 blend off an 85/5/10 office
    // profile leaves incoming the larger share, and the period says so rather than claiming a
    // down-peak it did not run.
    const split = plan.calendar.demand.directionalSplit;
    expect(split?.outgoing ?? 0).toBeGreaterThan(0.05);
  });

  it('rota week: the shift-change template finally has a caller', () => {
    const state = monday();
    const plan = planWith(state, CALENDAR_PERIODS['rota-week']);
    expect(legsOfRun(runOf(plan))).not.toBe(controlLegs(state));

    expect(plan.config.demandTemplate).toBe('shift-change');
    // Two-way: the CIBSE 45/45/10 target, blended 0.7 off the office profile. Outgoing has to have
    // moved by most of the way, or the "never empties, turns over" note is describing nothing.
    const split = plan.calendar.demand.directionalSplit;
    expect(split?.outgoing ?? 0).toBeGreaterThan(0.25);
  });
});

/* -------------------------------------------------------------------------- *
 * The inverse — a calendar that leaked outside its dates
 * -------------------------------------------------------------------------- */

describe('a period outside its own days changes nothing, byte-identically', () => {
  it('leaves today alone when the window is elsewhere', () => {
    /*
     * The worst version of this feature is one that leaks. Byte-identical, not "close": if this
     * fails, every figure this repository measured on a day with no calendar has moved.
     */
    const state = monday();
    const elsewhere = periodOnDays(CALENDAR_PERIODS.vacation, 8, 14);
    const plan = planWith(state, elsewhere);

    // Identity, not equality — the caller's *did anything happen today?* check is an identity test,
    // and a fresh-but-equal building would force a second parse and resolve on every ordinary day.
    expect(plan.calendar.day).toBeNull();
    expect(plan.calendar.building).toBe(plan.grown);
    expect(plan.calendar.demand).toEqual({});
    expect(plan.calendar.demandTemplateId).toBeNull();
    expect(plan.calendar.outOfServiceCarIds).toEqual([]);
    expect(legsOfRun(runOf(plan))).toBe(controlLegs(state));
  });

  it('leaves a weekday the period does not touch alone', () => {
    /*
     * `WEEKDAYS` doing real work. Saturday sits **inside** `quarter-end`'s window by day number and
     * outside it by weekday, and the run has to be the Saturday it would have been. Without the
     * weekday gate a calendar is just a second growth curve.
     */
    const state = saturday();
    const period = periodOnDays(CALENDAR_PERIODS['quarter-end'], 1, 7);
    expect(calendarDayFor(period, state.week.day, state.week.dayIdx)).toBeNull();
    const plan = planWith(state, period);
    expect(plan.calendar.building).toBe(plan.grown);
    expect(legsOfRun(runOf(plan))).toBe(controlLegs(state));
  });
});

/* -------------------------------------------------------------------------- *
 * The refusals, and the line that reports them
 * -------------------------------------------------------------------------- */

describe('what a period will not do', () => {
  const building = (): BuildingConfig => grownBuilding(authoredConfig('midtown-office'), 1);
  const office = { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 };

  it('will not set a mix under a template that varies the mix within the run', () => {
    // `core` refuses both at once — `generateTrace` throws rather than let one win silently — so the
    // period says what it could not do instead of producing a config that fails at run time.
    const day = calendarDayFor(CALENDAR_PERIODS.vacation, 1, 0);
    const patch = calendarPatch({
      day,
      building: building(),
      split: office,
      demandTemplateId: 'lunch-two-way',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
    });
    expect(patch.demand.directionalSplit).toBeUndefined();
    expect(patch.withheld.length).toBe(1);
    expect(patch.withheld[0]).toContain('lunch-two-way');
    // The fabric still moved. A refusal on one half is not a refusal of the period.
    expect(patch.building).not.toBe(building());
    expect(patch.population?.after ?? 0).toBeLessThan(patch.population?.before ?? 0);
  });

  it('will not overrule a template the player chose', () => {
    const day = calendarDayFor(CALENDAR_PERIODS['quarter-end'], 1, 0);
    const patch = calendarPatch({
      day,
      building: building(),
      split: office,
      demandTemplateId: 'constant-iso',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
      templateChosenByPlayer: true,
    });
    expect(patch.demandTemplateId).toBeNull();
    expect(patch.withheld[0] ?? '').toContain('constant-iso');
  });

  it('will not run a template the shift is too short for', () => {
    /*
     * Not a nicety, and the bar is `menu.ts`'s own: a template's declared period, refused in the
     * same words it refuses a free-play run with. `office-down-peak` declares a 30-minute period, so
     * a 300 s or 900 s shift measures a slice of a ramp and reports it as a down-peak.
     *
     * **The stronger half of the argument belongs to the record this period no longer names.**
     * `evening-egress` declares 20 minutes, and at 300 s `core` **throws** — a quarter of the run is
     * the quiet before the doors open, and the step and the hold do not fit in what is left. That
     * case is still live for the venue pairing (`crown-hotel`, and the challenge rotation), which is
     * why the refusal is a declared-period rule rather than a rule about one shape.
     */
    const day = calendarDayFor(CALENDAR_PERIODS['quarter-end'], 1, 0);
    for (const runLengthS of [300, 900]) {
      const patch = calendarPatch({
        day,
        building: building(),
        split: office,
        demandTemplateId: 'rise-and-fall',
        demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
        runLengthS,
      });
      expect(patch.demandTemplateId, `${String(runLengthS)} s`).toBeNull();
      expect(patch.withheld[0] ?? '').toContain('office-down-peak');
      // The rest of the period still applies. A refusal on one half is not a refusal of the period.
      expect(patch.population?.after ?? 0).toBeGreaterThan(patch.population?.before ?? 0);
      expect(patch.demand.directionalSplit).toBeDefined();
    }
  });

  it('still runs — and still moves the legs — on the shift that refused its template', () => {
    // The refusal above, taken all the way to a recording: the short shift produces a run rather
    // than an exception, and the period is still doing something to it.
    const state = { ...monday(), shiftLengthS: 300 };
    const plan = planWith(state, CALENDAR_PERIODS['quarter-end']);
    expect(plan.config.demandTemplate).toBe('rise-and-fall');
    expect(legsOfRun(runOf(plan))).not.toBe(controlLegs(state));
  });

  it('will not empty a bank to find a goods car, and says how many it found', () => {
    /*
     * Four cars in one bank, three of them already spoken for: there is no fourth to reserve,
     * because a bank with no in-service car is a set of floors nobody can reach. The shortfall is
     * reported rather than silently doing less.
     */
    const day = calendarDayFor(CALENDAR_PERIODS['moving-week'], 6, 5);
    expect(day?.shift.goodsCars).toBe(2);
    const patch = calendarPatch({
      day,
      building: building(),
      split: office,
      demandTemplateId: 'rise-and-fall',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
      // Three of the four already held by the player, so there is no fourth to reserve.
      playerHeldCarIds: ['main-B', 'main-C', 'main-D'],
    });
    expect(patch.outOfServiceCarIds).toEqual([]);
    expect(patch.withheld[0] ?? '').toContain('could reserve 0');
  });

  it('steps over the car the day’s own event has taken', () => {
    /*
     * `move-in` stands one car down for the first two thirds of the shift, and `carsToDerate` picks
     * `main-D` by the same total order the reservation uses. The period must reserve the next one
     * down — anything else is a car the incident's return event hands back to passengers mid-shift.
     */
    const day = calendarDayFor(CALENDAR_PERIODS['moving-week'], 1, 0);
    const patch = calendarPatch({
      day,
      building: building(),
      split: office,
      demandTemplateId: 'rise-and-fall',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
      event: SHIFT_EVENTS['move-in'],
    });
    expect(patch.outOfServiceCarIds).toEqual(['main-C']);
    expect(patch.withheld).toEqual([]);
  });

  it('reserves the same car the event leaves alone, and says so on the ordinary day', () => {
    // The negative control for the assertion above: with no event taking a car, the period reserves
    // the first one the order offers. Without this, `main-C` above could be the only answer this
    // function ever gives.
    const day = calendarDayFor(CALENDAR_PERIODS['moving-week'], 1, 0);
    const patch = calendarPatch({
      day,
      building: building(),
      split: office,
      demandTemplateId: 'rise-and-fall',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
      event: SHIFT_EVENTS.ordinary,
    });
    expect(patch.outOfServiceCarIds).toEqual(['main-D']);
    expect(patch.withheld).toEqual([]);
  });

  /**
   * **The same claim, on the shipped builder rather than on `calendarPatch` — GitHub issue #272.**
   *
   * The assertion above is the mechanism and it has been correct since it was written. What was
   * never tested is whether the product reaches it: `shiftRunConfigOf` passed
   * `spokenForCarIds: patch.outOfServiceCarIds`, which is `[]` on every day this build can produce,
   * so the reservation and `move-in`'s derate both picked `main-D` by the same total order.
   *
   * Measured before the fix, on `midtown-office` / `moving-week` / day 1 / 1 800 s:
   *
   * ```
   * outOfServiceCarIds: ["main-D"]
   * serviceEvents:      [{atS: 0, main-D, out-of-service}, {atS: 1200, main-D, in-service}]
   * calendarLine:       "Moving week · Monday — mix toward floor-to-floor, 1 car reserved"
   * main-D: 114 legs, first boardedAt 1207.5 s
   * ```
   *
   * A hundred and fourteen passengers rode the car the caption says the movers have all day.
   *
   * Asserted three ways, because two of them are documents and only the third is the run: no
   * `in-service` event may name a reserved car, no leg may be carried by one, and the caption has to
   * be making the claim in the first place — a version of this test whose period reserved nothing
   * would pass by saying nothing, which is § D163's *description rather than a gate*.
   */
  it('does not hand a reserved car back to passengers mid-shift', () => {
    const state = {
      ...monday(),
      calendar: periodOnDays(CALENDAR_PERIODS['moving-week'], 1, 7),
    };
    const shipped = shiftRunConfigOf(RESOURCES, state);

    // The caption makes the claim, and the incident is really scheduled. Without both, the rest is
    // vacuous.
    expect(shipped.calendarLine).toContain('1 car reserved');
    expect(shipped.outOfServiceCarIds).toHaveLength(1);
    const reserved = shipped.outOfServiceCarIds[0] ?? '';
    const events = shipped.config.building.serviceEvents ?? [];
    expect(events.length, 'the day schedules an incident at all').toBeGreaterThan(0);

    expect(
      events.filter((event) => `${event.bankId}-${event.carId}` === reserved),
      `no service event may name the reserved car ${reserved}`,
    ).toEqual([]);

    const run = recordRun(shipped.config, {
      recordDecisions: false,
      outOfServiceCarIds: shipped.outOfServiceCarIds,
    });
    expect(
      run.recording.legs.filter((leg) => leg.carId === reserved).length,
      `legs carried by the reserved car ${reserved}`,
    ).toBe(0);
  });

  /**
   * **The third source of the spoken-for set: the player's own holds — GitHub issue #272.**
   *
   * `dev/main.ts` lets a reader hold a car out of service, and that car is not free for the movers
   * either. The failure here is quieter than the incident one and it is the same false sentence: a
   * reservation that lands on a car the player already held publishes *"1 car reserved"* over a run
   * in which **no further car** left passenger service, so the caption charges the period for
   * something the player did.
   *
   * `main-C` is chosen because it is exactly the car the fix reserves when nothing else is held —
   * the assertion above pins that — so this is the collision rather than a car picked to avoid one.
   * The measurement is the count: the period's *one* reserved car has to be one **more** car out.
   */
  it('does not reserve a car the player is already holding', () => {
    const period = periodOnDays(CALENDAR_PERIODS['moving-week'], 1, 7);
    const held = ['main-C'];
    const plain = shiftRunConfigOf(RESOURCES, { ...monday(), calendar: period });
    expect(plain.outOfServiceCarIds, 'the car this test collides with').toEqual(held);

    const shipped = shiftRunConfigOf(RESOURCES, {
      ...monday(),
      calendar: period,
      outOfServiceCarIds: held,
    });
    expect(shipped.calendarLine).toContain('1 car reserved');
    expect(shipped.withheld).toEqual([]);
    // One reserved car means one more car out, not the same one counted twice.
    expect(shipped.outOfServiceCarIds).toEqual(['main-B', 'main-C']);
  });
});

describe('the line describes what was applied, not what was asked for', () => {
  const building = (): BuildingConfig => grownBuilding(authoredConfig('midtown-office'), 1);
  const office = { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 };

  it('is empty when no period applies', () => {
    expect(
      calendarLine(
        calendarPatch({
          day: null,
          building: building(),
          split: office,
          demandTemplateId: 'rise-and-fall',
          demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
          runLengthS: 1800,
        }),
      ),
    ).toBe('');
  });

  it('quotes the population the building carries, not the factor that was asked for', () => {
    const patch = calendarPatch({
      day: calendarDayFor(CALENDAR_PERIODS.vacation, 3, 2),
      building: building(),
      split: office,
      demandTemplateId: 'rise-and-fall',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
    });
    const line = calendarLine(patch);
    expect(line).toContain('Vacation week · Wednesday');
    expect(line).toContain(`${(patch.population?.after ?? 0).toLocaleString('en-GB')} of`);
    expect(line).toContain('mix flatter');
  });

  it('does not claim a mix it was refused', () => {
    const patch = calendarPatch({
      day: calendarDayFor(CALENDAR_PERIODS.vacation, 1, 0),
      building: building(),
      split: office,
      demandTemplateId: 'lunch-two-way',
      demandTemplates: RESOURCES.trafficProfiles.demandTemplates,
      runLengthS: 1800,
    });
    expect(calendarLine(patch)).not.toContain('mix');
  });
});

/* -------------------------------------------------------------------------- *
 * What a period asks of the run, and which of those asks reach it — issue #140
 * -------------------------------------------------------------------------- */

/**
 * `calendarAsks` against `calendarPatch`, on the same inputs, over a matrix that reaches both
 * verdicts on all four axes.
 *
 * This is the assertion the whole of issue #140 rests on, and it is written as an **agreement**
 * rather than as a table of expected fields on purpose. `scope/runIdentity.ts` refuses a run
 * because the calendar changed it, and the sentence it prints names the axes this function
 * returns; if that set could drift from the set `calendarPatch` actually wrote, the product would
 * be telling a player their run cannot be posted *because of a mix bias the engine withheld*. A
 * hand-written expectation would agree with whichever of the two it was copied from. This one
 * cannot: it asks the patch what it did.
 *
 * The four rows on the right are `calendarPatch`'s own observable outputs, one per ask:
 *
 * | ask | the patch's evidence |
 * |---|---|
 * | `populationFactor` | `population !== null` — set only when the fabric was scaled |
 * | `splitBias` | `demand.directionalSplit !== undefined` — absent when the bias was withheld |
 * | `demandTemplateId` | `demandTemplateId !== null` — `null` when the template was withheld |
 * | `goodsCars` | `outOfServiceCarIds.length > 0` — empty on a total shortfall |
 */
describe('what a period asks of the run, and what reaches it — issue #140', () => {
  const office = { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 };
  const templates = RESOURCES.trafficProfiles.demandTemplates;
  const RISE = 'rise-and-fall' as DemandTemplateId;
  const TWO_WAY = 'lunch-two-way' as DemandTemplateId;

  /**
   * The authored building, or the one a player commissioned to `shafts` — through the shipped
   * `commissionedBuilding` rather than by editing a bank here.
   *
   * The point of the second arm is that it is **not** a fixture: `commissioning/choices.ts
   * #shaftChoices` offers `max(1, current − 1)` and `dev/state.ts#shiftRunConfigOf` commissions
   * before it grows, so a one-shaft Garden Apartments is a fabric a player reaches with one select.
   * A hand-written config with one car would prove the code path and not the reachability, and
   * reachability is the half issue #264 turned on.
   */
  function fabricOf(buildingId: string, shafts?: number): BuildingConfig {
    const authored = authoredConfig(buildingId);
    if (shafts === undefined) return authored;
    const classes = commissionableClasses(RESOURCES.elevatorSpecs);
    const asBuilt = asBuiltChoices(authored, classes);
    const main = asBuilt[0];
    if (main === undefined) throw new Error(`${buildingId} declares no bank`);
    return commissionedBuilding(authored, withBankChoice(asBuilt, { ...main, shafts }), classes);
  }

  /**
   * The two functions on **one** set of inputs, the fabric included — GitHub issue #264.
   *
   * The building used to go to `calendarPatch` alone, because `calendarAsks` decided `goodsCars`
   * from the period's declaration. That is the defect: on a bank with no car free the two disagreed,
   * and the agreement below could not see it because only one of them was ever shown a bank. The
   * fabric is now part of `shared`, so a caller that could hand them different buildings does not
   * exist here either.
   */
  function bothWays(
    period: CalendarPeriod | null,
    running: DemandTemplateId,
    runLengthS: number,
    templateChosenByPlayer: boolean,
    buildingId = 'midtown-office',
    shafts?: number,
  ): { readonly asks: readonly string[]; readonly patch: ReturnType<typeof calendarPatch> } {
    const shared = {
      day: calendarDayFor(period, 1, 0),
      demandTemplateId: running,
      demandTemplates: templates,
      runLengthS,
      templateChosenByPlayer,
      building: grownBuilding(fabricOf(buildingId, shafts), 1),
      // The day's event goes into `shared` too — GitHub issue #272. Both functions decide
      // `goodsCars` by reserving against a real bank, and the cars the event has already taken are
      // part of that reservation; a caller that could hand them different events does not exist
      // here either.
      event: scheduledEventFor(period, 1, 0),
    };
    return {
      asks: calendarAsks(shared),
      patch: calendarPatch({ ...shared, split: office }),
    };
  }

  /** Every shipped period, plus the four states in which an ask is withheld or absent. */
  function matrix(): readonly {
    readonly name: string;
    readonly result: ReturnType<typeof bothWays>;
  }[] {
    return [
      ...CALENDAR_PERIOD_IDS.map((id) => ({
        name: `${id}, whole period, 1 800 s`,
        result: bothWays(periodOnDays(CALENDAR_PERIODS[id], 1, 7), RISE, 1800, false),
      })),
      // No calendar at all. The negative control that makes every row above mean something.
      { name: 'no period', result: bothWays(null, RISE, 1800, false) },
      // A day the period's window does not cover — indistinguishable from no calendar, by design.
      {
        name: 'a day outside the window',
        result: bothWays(periodOnDays(CALENDAR_PERIODS.vacation, 3, 5), RISE, 1800, false),
      },
      // The template declares 30 minutes and the shift is 10, so the period defers to the shift.
      {
        name: 'rota-week on a shift too short for shift-change',
        result: bothWays(periodOnDays(CALENDAR_PERIODS['rota-week'], 1, 7), RISE, 600, false),
      },
      // The player chose the template themselves, so the calendar does not overrule them.
      {
        name: 'rota-week under a player-chosen template',
        result: bothWays(periodOnDays(CALENDAR_PERIODS['rota-week'], 1, 7), RISE, 1800, true),
      },
      // `lunch-two-way` varies the mix within the run, so the engine refuses a bias over it.
      {
        name: 'vacation under lunch-two-way',
        result: bothWays(periodOnDays(CALENDAR_PERIODS.vacation, 1, 7), TWO_WAY, 1800, false),
      },
      /*
       * **A fabric with no car free — GitHub issue #264, and the row this matrix was missing.**
       * `moving-week` asks a one-shaft bank for a goods car and `reserveCars` never empties a bank,
       * so it gets none. Before the fix the ask said *yes* here and the patch said *no*, and the
       * agreement below could not catch it because every row was run on a bank with a spare car.
       */
      {
        name: 'moving-week on a bank commissioned down to one shaft',
        result: bothWays(
          periodOnDays(CALENDAR_PERIODS['moving-week'], 1, 7),
          RISE,
          1800,
          false,
          'garden-apartments',
          1,
        ),
      },
    ];
  }

  it('names exactly the asks the patch applied', () => {
    for (const { name, result } of matrix()) {
      const { asks, patch } = result;
      expect(asks.includes('populationFactor'), `${name}: populationFactor`).toBe(
        patch.population !== null,
      );
      expect(asks.includes('splitBias'), `${name}: splitBias`).toBe(
        patch.demand.directionalSplit !== undefined,
      );
      expect(asks.includes('demandTemplateId'), `${name}: demandTemplateId`).toBe(
        patch.demandTemplateId !== null,
      );
      expect(asks.includes('goodsCars'), `${name}: goodsCars`).toBe(
        patch.outOfServiceCarIds.length > 0,
      );
    }
  });

  it('is exercised by a matrix that reaches both verdicts on every axis', () => {
    // Without this the agreement above would pass over a matrix in which no ask ever landed, or one
    // in which none was ever withheld — the shape § D163 calls a description rather than a gate.
    for (const axis of ['populationFactor', 'splitBias', 'demandTemplateId', 'goodsCars'] as const) {
      const verdicts = matrix().map(({ result }) => result.asks.includes(axis));
      expect(verdicts, `${axis} is never asked`).toContain(true);
      expect(verdicts, `${axis} is always asked`).toContain(false);
    }
  });

  it('never names the event, which scheduledEventFor owns — issue #135', () => {
    // `moving-week` books `move-in` on six of its seven days, and the day's event is the one thing
    // about a period this function must stay silent about: `scope/runIdentity.ts` asks
    // `scheduledEventFor` for it, and two answers to one question is #135's whole subject.
    const { asks } = bothWays(periodOnDays(CALENDAR_PERIODS['moving-week'], 1, 7), RISE, 1800, false);
    expect(asks).not.toContain('eventId');
    expect(asks).not.toContain('note');
  });

  it('every authored bank has a spare car, asserted from disk', () => {
    /*
     * **This assertion is unchanged and its old title was wrong — GitHub issue #264.** It used to
     * be called *"the goods-car residual is unreachable on shipped data"*, on the argument that
     * `calendarAsks` deciding `goodsCars` from the period alone could only be wrong on a bank with
     * no car free, that `carsToDerate` never empties a bank, and that `data/buildings/` therefore
     * had to declare a **one-car** bank before it could bite.
     *
     * Every clause of that was true and the conclusion was not, because `data/buildings/` is not
     * the set of banks a run can have: `commissioning/choices.ts#shaftChoices` offers
     * `max(1, current − 1)`, so a player takes Garden Apartments' two cars down to one and
     * `shiftRunConfigOf` commissions the building before the calendar sees it. The residual was
     * live on a fabric one select away, and `scope/runIdentity.test.ts` now measures it end to end.
     *
     * What the assertion actually says is worth keeping and is what it is renamed to: **the
     * authored fabric always leaves a car to reserve**, which is why the shipped periods work
     * as designed on a building nobody has edited.
     */
    const dir = fileURLToPath(new URL('../../../../data/buildings/', import.meta.url));
    const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      const config = parseBuilding(JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown);
      for (const bank of config.banks) {
        expect(bank.cars.length, `${file} · ${bank.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('no shipped event holds a car for the whole shift, which is one half of the spoken-for set', () => {
    /*
     * Pinned over the event table rather than stated, because a sentence saying *the set is always
     * empty* is the shape issue #264 was: an event that held a car would make the ask claim a
     * reservation the patch stepped past, and this turns red on the commit that adds one instead of
     * on the day somebody re-reads a docstring.
     *
     * **This used to be the whole argument and is now one third of it — GitHub issue #272.** The
     * title said *"which is what lets `calendarAsks` omit the spoken-for set"*, and the body went
     * on: *"`shiftRunConfigOf` does not put [the derate] in `spokenForCarIds` either. The two
     * functions agree about that day because they agree about the argument."* Both sentences were
     * true and the second was a defect being described as a property — the product agreed with
     * `calendarAsks` by passing a set that was always empty, and the movers' car was handed back at
     * 1 200 s because of it. The set now has three sources and this assertion covers one; the other
     * two are swept below.
     */
    for (const id of Object.keys(SHIFT_EVENTS) as (keyof typeof SHIFT_EVENTS)[]) {
      expect(SHIFT_EVENTS[id].effect.carsOutOfService, id).toBe(0);
    }
  });

  /**
   * **The caption and the refusal agree about the whole shipped space, through the shipped builder —
   * GitHub issue #272.**
   *
   * The agreement above is `calendarAsks` against `calendarPatch` on one input, which is the
   * mechanism. This is whether the product reaches it, and the two are different questions —
   * `RISKS.md` R26. It drives `dev/state.ts#shiftRunConfigOf` for the caption and
   * `scope/runIdentity.ts#runIdentityIssues` for the refusal, on the same `ViewerState`, and
   * requires them to say the same thing about whether a car left passenger service.
   *
   * **A first version of this compared the two pure functions and would have measured nothing.**
   * They share one derivation now (`calendar.ts#spokenForCarsOf`), so feeding both the same event
   * makes them agree by construction; a sweep that cannot fail is § D163's *description rather than
   * a gate*. Only the shipped path can disagree, because only it has two callers that must each
   * remember to pass the event.
   *
   * It is what caught this lane's own residual. Correcting the run's spoken-for set without
   * correcting `runIdentity.ts`'s left six cells disagreeing — `garden-apartments` / `moving-week`,
   * days 1–6, a two-car bank whose only spare is `move-in`'s derate, so the caption reserved none
   * while the refusal claimed *"reserves at least one car out of passenger service"*. That is issue
   * #264's own shape arriving through a second door, and it existed for exactly as long as the two
   * halves of the fix were apart.
   *
   * Days 1, 6 and 7 rather than all seven: `moving-week`'s Saturday is its `goodsCars: 2` override
   * and its Sunday is the `goodsCars: 0` one, so the three reach the period's base shift and both of
   * its overrides. `scope/runIdentity.test.ts` covers the commissioned-down fabric on the building
   * where it bites; this one covers every shipped building as authored.
   */
  it('agrees with the run plan about every shipped building, period and day', () => {
    /*
     * Quoted from `scope/runIdentity.ts`'s own clause rather than imported: `askClause` builds it
     * inline and exports nothing, and a test that reached for the private string would be asserting
     * against an implementation detail. `scope/runIdentity.test.ts` holds the same constant for the
     * same reason, and if the wording moves both go red — which is correct, because the wording is
     * what a player reads.
     */
    const GOODS_CLAUSE = 'reserves at least one car out of passenger service';
    const found: string[] = [];
    const verdicts: boolean[] = [];

    for (const entry of RESOURCES.entries) {
      for (const id of CALENDAR_PERIOD_IDS) {
        for (const day of [1, 6, 7]) {
          const state: ViewerState = {
            ...baseState(),
            buildingId: entry.config.id,
            shiftLengthS: 1800,
            week: { ...baseState().week, day, dayIdx: day - 1 },
            calendar: periodOnDays(CALENDAR_PERIODS[id], 1, 7),
          };
          const plan = shiftRunConfigOf(RESOURCES, state);
          const message =
            runIdentityIssues(state, RESOURCES, 'ranked').find(
              (issue) => issue.key === 'viewer.calendar',
            )?.message ?? '';

          const captionReserves = plan.calendarLine.includes('reserved');
          const refusalClaims = message.includes(GOODS_CLAUSE);
          verdicts.push(captionReserves);
          if (captionReserves !== refusalClaims) {
            found.push(
              `${entry.config.id} · ${id} · day ${String(day)}: caption ${String(captionReserves)}, refusal ${String(refusalClaims)}`,
            );
          }
        }
      }
    }

    expect(found).toEqual([]);
    // The sweep has to have reached a cell that reserves and one that does not, or an empty `found`
    // is a matrix that measured nothing.
    expect(verdicts, 'no cell reserved a car').toContain(true);
    expect(verdicts, 'every cell reserved a car').toContain(false);
  });
});
