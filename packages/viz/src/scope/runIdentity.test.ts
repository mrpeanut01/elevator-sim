/**
 * One derivation of *"can this run be reproduced elsewhere?"*, and the hand-written copy it replaces
 * — S5.
 *
 * The load-bearing test is the last one: `runIdentityIssues(state, resources, 'ranked')` must refuse
 * **exactly** the states `dev/main.ts#provenanceLineOf` refuses. Not a superset and not a subset,
 * over a matrix of states rather than at one point.
 *
 * Both directions are failures with a victim:
 *
 * - **Stricter than provenance** and the submit path refuses a run a CLI line would have reproduced,
 *   so an honest player is told their run cannot be posted and never finds out why.
 * - **Looser than provenance** and the client posts a run the server cannot reproduce. The server
 *   rejects it as a forgery — which is the one place this product accuses somebody of cheating, and
 *   it would be accusing them of a client bug.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { provenanceLineOf } from '../dev/main.js';
import type { ViewerState } from '../dev/state.js';
import { nextDay } from '../shift/week.js';

import {
  CALENDAR_PERIODS,
  periodOnDays,
  type CalendarPeriod,
  type CalendarShift,
} from '../shift/calendar.js';

import { baseState, legsOf, RESOURCES } from './probes.test-helper.js';
import { runIdentityIssues } from './runIdentity.js';

/**
 * The states the two implementations are compared over.
 *
 * One per refusal `provenanceLineOf` can produce, plus the clean case and two that must **not** be
 * refused — a moved seed and a different shipped dispatcher — because a predicate that refused
 * everything would agree with a predicate that refused everything.
 */
function matrix(): readonly { readonly name: string; readonly state: ViewerState }[] {
  const base = baseState();
  return [
    { name: 'clean, day 1, shipped everything', state: base },
    { name: 'a different shipped dispatcher', state: { ...base, dispatcherId: 'nearest-car' } },
    { name: 'a moved seed', state: { ...base, seed: 987654321n } },
    { name: 'a longer shift', state: { ...base, shiftLengthS: 1800 } },
    { name: 'a building only this browser has', state: { ...base, buildingId: 'my-tower' } },
    { name: 'a dispatcher only this browser has', state: { ...base, dispatcherId: 'my-profile' } },
    { name: 'a saved arrival pattern', state: { ...base, pattern: 'my-pattern' } },
    { name: 'day 2 — the building has grown', state: { ...base, week: nextDay(base.week) } },
    { name: 'a car held out of service', state: { ...base, outOfServiceCarIds: ['main-b'] } },
    {
      name: 'a group lever moved off its default',
      state: { ...base, levers: { ...DEFAULT_LEVERS, express: true } },
    },
  ];
}

describe('the predicate answers the question it claims to', () => {
  it('accepts a day-1 run on shipped data', () => {
    expect(runIdentityIssues(baseState(), RESOURCES)).toEqual([]);
    expect(runIdentityIssues(baseState(), RESOURCES).length === 0).toBe(true);
  });

  it('accepts the axes a selection actually carries', () => {
    // The negative control that makes every refusal below mean something. All four are
    // `between-games`, which `ranked` permits, and all four travel with a submission.
    const base = baseState();
    for (const state of [
      { ...base, dispatcherId: 'nearest-car' },
      { ...base, seed: 987654321n },
      { ...base, shiftLengthS: 1800 },
      { ...base, buildingId: 'midtown-office' },
    ]) {
      expect(runIdentityIssues(state, RESOURCES), JSON.stringify(state.buildingId)).toEqual([]);
    }
  });

  it('lets a run that is one part of a longer day be posted, now the submission carries which part', () => {
    /*
     * The inverse of what this case used to assert, and the inversion is the point.
     *
     * § D288 refused a windowed run outright: `RunSubmission` was six fields, the window was in
     * none of them, and the board **re-simulates** rather than trusting the client — so posting a
     * lunch peak would have had the server replay the seed over the whole ten hours and answer a
     * different question, correctly. The refusal named its own fix, and all three parts of it have
     * landed: the field is on the wire, `configHashOf` digests it so a morning and a lunch are
     * ranked apart, and `configFor` passes it to the replay as `windowStartS`/`windowEndS`.
     *
     * Still asserted against the whole-period control in the same case, for the reason the refusal
     * gave: both arms are thirty minutes, so nothing here turns on the length.
     */
    const base = { ...baseState(), shiftLengthS: 1800 };
    expect(runIdentityIssues({ ...base, windowStartS: null }, RESOURCES)).toEqual([]);
    expect(runIdentityIssues({ ...base, windowStartS: 30 * 60 }, RESOURCES)).toEqual([]);
    // Under `shift-week`, which permits every scope, for symmetry with the refusal this replaced.
    expect(
      runIdentityIssues({ ...base, windowStartS: 30 * 60 }, RESOURCES, 'shift-week'),
    ).toEqual([]);
    // Non-vacuity: this function still refuses things, so an empty array above is a decision about
    // the window rather than a function that stopped working.
    expect(
      runIdentityIssues({ ...base, windowStartS: 30 * 60, buildingId: 'not-a-building' }, RESOURCES)
        .length,
    ).toBeGreaterThan(0);
  });

  it('reports every reason rather than the first', () => {
    const base = baseState();
    const bad: ViewerState = {
      ...base,
      week: nextDay(base.week),
      outOfServiceCarIds: ['main-b'],
      levers: { ...DEFAULT_LEVERS, express: true },
    };
    // A reader who fixes one and is then told about the next has been made to guess how many there
    // are — `freePlayIssues`' rule, applied to the same kind of gate.
    expect(runIdentityIssues(bad, RESOURCES).length).toBe(3);
  });

  it('names the field each refusal is about', () => {
    for (const { name, state } of matrix()) {
      for (const issue of runIdentityIssues(state, RESOURCES)) {
        expect(issue.key, name).toMatch(/^viewer\./u);
        expect(issue.message.length, `${name} — ${issue.key}`).toBeGreaterThan(30);
      }
    }
  });

  it('refuses nothing in a mode that permits everything', () => {
    const base = baseState();
    const busy: ViewerState = { ...base, week: nextDay(base.week), outOfServiceCarIds: ['main-b'] };
    // `shift-week` permits every scope, so the only refusals left are the three value questions —
    // and this state raises none of them.
    expect(runIdentityIssues(busy, RESOURCES, 'shift-week')).toEqual([]);
  });
});

describe('one derivation, two consumers', () => {
  it('agrees with provenanceLineOf on every state in the matrix', () => {
    for (const { name, state } of matrix()) {
      const provenance = provenanceLineOf(state, RESOURCES);
      const issues = runIdentityIssues(state, RESOURCES, 'ranked');
      expect(
        issues.length === 0,
        `${name}: provenance ${provenance.ok ? 'accepts' : 'refuses'} and runIdentity ${
          issues.length === 0 ? 'accepts' : `refuses (${issues.map((issue) => issue.key).join(', ')})`
        }`,
      ).toBe(provenance.ok);
    }
  });

  it('gives the same number of reasons', () => {
    // Not just the same verdict. A predicate that collapsed three refusals into one would agree on
    // every boolean above and still tell a player less than the control beside it does.
    for (const { name, state } of matrix()) {
      const provenance = provenanceLineOf(state, RESOURCES);
      if (provenance.ok) continue;
      expect(runIdentityIssues(state, RESOURCES, 'ranked').length, name).toBe(provenance.reasons.length);
    }
  });

  it('is exercised by a matrix that reaches both verdicts', () => {
    // Without this the two assertions above would pass over ten states that all refuse.
    const verdicts = matrix().map(({ state }) => runIdentityIssues(state, RESOURCES).length === 0);
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});

/* -------------------------------------------------------------------------- *
 * A calendar period that names no event — GitHub issue #140
 * -------------------------------------------------------------------------- */

/**
 * **A period that names no event still changes the run, and day 1 was calling that reproducible.**
 *
 * The gate was `week.day === 1 && event.effect.changesNothing`. Four of the five shipped periods
 * change the run on day 1 while booking no event at all, so a run on **a quarter of the building**
 * was published as reproducible from a selection that carries no calendar — and `runIdentity` is
 * the derivation the leaderboard submit path and `copy run` share, so the server would have
 * replayed the shipped building and answered `422 metrics-do-not-reproduce` at an honest player.
 *
 * Every case here is decided **on the legs** rather than on the predicate's own opinion — § D177's
 * rule, applied to a refusal rather than to a slider — and both directions are asserted, because a
 * fix that refused every day 1 would close the hole and open a worse one: it would tell a player
 * their perfectly ordinary run cannot be posted.
 *
 * The sentence is asserted as well as the verdict, and that is issue #135's stated reason for
 * leaving this open rather than a nicety. Its sentence named the day number and the event, so
 * opening the gate without rewriting it would have filed a refusal giving the **wrong reason** —
 * *"day 1 … schedules “Ordinary day”"* about a run that moved because of a population factor.
 * § D227 rates a wrong refusal below the gap itself.
 */
describe('a calendar period that names no event still changes the run — issue #140', () => {
  /** Midtown Office at 1 800 s: four cars and 1 710 people, so every axis of a period bites. */
  function on(period: CalendarPeriod | null): ViewerState {
    return { ...baseState(), buildingId: 'midtown-office', shiftLengthS: 1800, calendar: period };
  }

  const whole = (id: keyof typeof CALENDAR_PERIODS): CalendarPeriod =>
    periodOnDays(CALENDAR_PERIODS[id], 1, 7);

  /** A period that applies today and asks the run for nothing at all. The false-positive control. */
  const INERT_SHIFT: CalendarShift = {
    populationFactor: 1,
    splitBias: null,
    demandTemplateId: null,
    eventId: null,
    goodsCars: 0,
    note: 'The doors open and today is today.',
  };
  const inertPeriod: CalendarPeriod = {
    ...CALENDAR_PERIODS.vacation,
    name: 'A week off from the calendar',
    shift: INERT_SHIFT,
    overrides: {},
  };

  it('refuses day 1 under every shipped period, and the legs say it had to', () => {
    /*
     * The two halves are the whole test. `legs` is the ground truth — the run under the period is
     * not the run a selection would reproduce — and `issues` is what the product says about it. A
     * period whose legs moved and whose verdict was *reproducible* is the defect; this is the
     * assertion that had it.
     */
    const plain = legsOf(on(null));
    for (const id of ['public-holiday', 'vacation', 'quarter-end', 'rota-week', 'moving-week'] as const) {
      const state = on(whole(id));
      expect(legsOf(state), `${id} moves no leg — this probe measures nothing`).not.toBe(plain);
      expect(runIdentityIssues(state, RESOURCES, 'ranked').length, id).toBeGreaterThan(0);
    }
  });

  it('names the period and what it moved, never an event it did not book', () => {
    /*
     * `public-holiday` is the sharpest case: `fromDay: 1, toDay: 1`, `eventId: null`, and a
     * `populationFactor` of 0.25 — it exists *only* on the day the gate used to open, and the only
     * thing it changes is the one thing the old sentence could not name.
     */
    const holiday = runIdentityIssues(on(whole('public-holiday')), RESOURCES, 'ranked');
    expect(holiday.map((issue) => issue.key)).toEqual(['viewer.week']);
    expect(holiday[0]?.message).toBe(
      'the calendar’s “Public holiday” scales the building’s population to 25 %, and none of that ' +
        'travels with a selection',
    );
    // The half § D227 is about: no event is named, because the period books none.
    expect(holiday[0]?.message).not.toContain('schedules');

    // `vacation` moves two axes, and both are named. A sentence naming one would pass a weaker
    // assertion and still tell a player half of why their run is not theirs to share.
    const vacation = runIdentityIssues(on(whole('vacation')), RESOURCES, 'ranked');
    expect(vacation[0]?.message).toBe(
      'the calendar’s “Vacation week” scales the building’s population to 60 % and pulls the mix ' +
        'flatter, and none of that travels with a selection',
    );
  });

  it('keeps the period and the day’s event apart, each with its own subject', () => {
    // `moving-week` books `move-in` **and** biases the mix **and** reserves a car, so this is the
    // one shipped period where all three facts are live at once. They are joined rather than
    // merged: a period does not necessarily book the day's event, and a sentence reading
    // "Moving week … and schedules X" would attribute the week's own drill to the calendar.
    const issues = runIdentityIssues(on(whole('moving-week')), RESOURCES, 'ranked');
    expect(issues[0]?.message).toBe(
      'the calendar’s “Moving week” pulls the mix toward floor-to-floor and reserves at least one ' +
        'car out of passenger service, the day schedules “Move-in day”, and none of that travels ' +
        'with a selection',
    );
  });

  it('leaves day 1 reproducible with no calendar at all', () => {
    // The negative control the fix would otherwise not need: without it, a change that refused
    // every day 1 would pass every assertion above.
    expect(runIdentityIssues(on(null), RESOURCES, 'ranked')).toEqual([]);
    expect(runIdentityIssues(baseState(), RESOURCES, 'ranked')).toEqual([]);
  });

  it('leaves day 1 reproducible under a period that genuinely changes nothing', () => {
    // A period **is** open, applies today, and asks the run for nothing — and the legs agree, which
    // is what makes this a measurement rather than a restatement of the predicate.
    const state = on(inertPeriod);
    expect(legsOf(state)).toBe(legsOf(on(null)));
    expect(runIdentityIssues(state, RESOURCES, 'ranked')).toEqual([]);
  });

  it('leaves day 1 reproducible on a day the period does not cover', () => {
    // A window that starts later is `calendarDayFor`'s `null`, which is the whole of *no calendar*.
    const state = on(periodOnDays(CALENDAR_PERIODS['public-holiday'], 3, 5));
    expect(legsOf(state)).toBe(legsOf(on(null)));
    expect(runIdentityIssues(state, RESOURCES, 'ranked')).toEqual([]);
  });

  it('names no ask the engine withheld', () => {
    /*
     * The other direction of the wrong-reason failure, and the reason `calendarAsks` shares
     * `calendarPatch`'s branches instead of reading the period's declaration.
     *
     * `rota-week` asks for a mix bias and the `shift-change` template and scales nothing. Under a
     * player-chosen `lunch-two-way` the calendar gets **neither**: the template is the player's
     * (§ D215) and the engine refuses a bias under a template that varies the mix. So the run is
     * byte-identical to the calendar-free one and must be posted, not refused — a predicate reading
     * the period's declaration would refuse it, and would name two axes that never moved.
     */
    const chosen = {
      ...on(whole('rota-week')),
      freePlay: { demandTemplateId: 'lunch-two-way', arrivalRatePctPop5min: null },
    } satisfies ViewerState;
    const control = { ...chosen, calendar: null } satisfies ViewerState;
    expect(legsOf(chosen)).toBe(legsOf(control));
    expect(runIdentityIssues(chosen, RESOURCES, 'ranked')).toEqual([]);

    // And the same period at a shift too short for its template keeps the bias, which does land —
    // so the refusal names the mix and stays silent about the template.
    const short = on(whole('rota-week'));
    const message = runIdentityIssues({ ...short, shiftLengthS: 900 }, RESOURCES, 'ranked')[0]?.message;
    expect(message).toContain('pulls the mix two-way');
    expect(message).not.toContain('demand template');
  });

  it('does not offer a 0 % growth as a reason, which the shipped sentence did', () => {
    // `day 1 grows the building by 0 %` was printed by the product under `moving-week`, beside a
    // disabled **Post this run**. A refusal listing a thing that did not happen is the same defect
    // as one naming the wrong thing, one degree milder.
    for (const id of ['public-holiday', 'vacation', 'moving-week', 'quarter-end', 'rota-week'] as const) {
      expect(runIdentityIssues(on(whole(id)), RESOURCES, 'ranked')[0]?.message, id).not.toContain(
        'grows the building by 0 %',
      );
    }
    // Day 2 still says it, because on day 2 it is true.
    expect(
      runIdentityIssues({ ...on(null), week: nextDay(baseState().week) }, RESOURCES, 'ranked')[0]
        ?.message,
    ).toContain('grows the building by 11 %');
  });

  it('still opens the gate for a period that names an event — #135 must not regress', () => {
    // `moving-week`'s day 1 is `move-in`, which `eventFor` alone reads as `ordinary`. The route
    // through `scheduledEventFor` is what makes it visible, and it is asserted here as well as in
    // `eventSeam.test.ts` because this arm is the one where getting it wrong publishes a run.
    const issues = runIdentityIssues(on(whole('moving-week')), RESOURCES, 'ranked');
    expect(issues[0]?.message).toContain('the day schedules “Move-in day”');
  });
});
