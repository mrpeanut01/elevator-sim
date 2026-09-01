/**
 * The record, the gate, and the two branches § 1.5 asks for.
 *
 * Three claims made in `watch/record.ts`'s docstrings are settled here rather than asserted in
 * prose:
 *
 * 1. **The record carries exactly three things a submission does not.** `WATCH_RECORD_CARRIES` is
 *    compared against `WatchRecord`'s own field set in both directions, so a fourth subtraction
 *    cannot be smuggled into the filter by a one-line edit.
 * 2. **A period that books the day's event is refused.** That arm exists only because removing the
 *    `week` arm removed `runIdentityIssues`' own catch for it, and a test is the only thing that
 *    can tell a load-bearing arm from a decorative one.
 * 3. **A record replays the run it was taken from, on the legs.** § D177's comparison, not a window
 *    statistic — and the reproduction gate's two branches driven by a simulator that answers
 *    honestly and one that answers with a different run.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { CALENDAR_PERIODS, calendarDayFor, periodOnDays } from '../shift/calendar.js';
import type { VizRecording } from '../contract/types.js';

import { checkedRun, filedDayRuns, watchGateAfter, watchGateBefore } from './library.js';
import {
  PERIOD_BOOKS_THE_EVENT,
  WATCH_RECORD_CARRIES,
  recordRefusalFor,
  recordUnreadableReason,
  stateFromWatchRecord,
  watchRecordIssues,
  watchRecordOf,
  watchRunConfigOf,
} from './record.js';
import { postedResultOf, reproductionDrift } from './reproduce.js';
import type { WatchRecord, WatchableRun } from './types.js';

/** The legs of a run, as a comparable string — `scope/probes.test-helper.ts`' own comparison. */
function legsOf(recording: VizRecording): string {
  return recording.legs
    .map((leg) =>
      [
        leg.passengerId,
        leg.originFloorId,
        leg.destinationFloorId,
        leg.arrivedAt,
        leg.carId ?? '',
        leg.boardedAt ?? -1,
        leg.alightedAt ?? -1,
      ]
        .map(String)
        .join(','),
    )
    .join('|');
}

describe('the watch record', () => {
  it('carries exactly the four fields a selection cannot, and nothing else', () => {
    // Both directions. A row with no field behind it is issue #129's premise; a field with no row
    // is a subtraction nobody argued for. The fourth is `docs/20` defect 1's — see below for why it
    // is a carry rather than a refusal.
    const rows = Object.keys(WATCH_RECORD_CARRIES).sort();
    expect(rows).toEqual([
      'viewer.interventions',
      'viewer.outOfServiceCarIds',
      'viewer.ruleRows',
      'viewer.week',
    ]);
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    for (const field of ['interventions', 'outOfServiceCarIds', 'day', 'dayIdx'] as const) {
      expect(record).toHaveProperty(field);
    }
  });

  it('is written for a plain shift, and refuses a state a selection cannot express', () => {
    expect(watchRecordIssues(baseState(), RESOURCES)).toEqual([]);
    expect(watchRecordOf(baseState(), RESOURCES)).toBeDefined();

    // A patience curve is the clearest of the refusals and the one with the sharpest consequence:
    // abandonment improves the mean by construction, so a replay without it is a different run.
    const withPatience = { ...baseState(), patience: { distribution: 'exponential' as const, meanS: 120 } };
    const issues = watchRecordIssues(withPatience, RESOURCES);
    expect(issues.map((issue) => issue.key)).toContain('viewer.patience');
    expect(watchRecordOf(withPatience, RESOURCES)).toBeUndefined();
  });

  it('carries the week’s day rather than refusing it — the subtraction that is the point', () => {
    // Day 4 grows the building 33 %. `runIdentityIssues` refuses it for the leaderboard because a
    // selection carries no day; the record carries `day`, so it must not be refused here.
    const day4 = { ...baseState(), week: { ...baseState().week, day: 4 } };
    expect(watchRecordIssues(day4, RESOURCES)).toEqual([]);
    expect(watchRecordOf(day4, RESOURCES)?.day).toBe(4);
  });

  /*
   * `docs/20` defect 1, both halves, driven rather than argued.
   *
   * The defect: writing **one** Everyday rule made every day filed afterwards unwatchable, because
   * `runIdentityIssues` refuses a rule list for the wire and `watchRecordOf` refuses to write a
   * record for anything it refuses — and the rule row is session state, so re-running the same day
   * on a shipped dispatcher did not clear it.
   */
  it('carries a written rule rather than refusing the day that ran it', () => {
    const withRule = {
      ...baseState(),
      ruleRows: [{ when: 'lobby-queue-passes' as const, whenValue: 30, then: 'hold-at-lobby' as const }],
    };
    expect(watchRecordIssues(withRule, RESOURCES)).toEqual([]);
    expect(watchRecordOf(withRule, RESOURCES)?.ruleRows).toEqual(withRule.ruleRows);
  });

  it('replays a rules run *with* its rules — a record that dropped them is a different run', () => {
    /*
     * The carry has to be measured on the legs, not on the field: a record that stored the rows and
     * a `stateFromWatchRecord` that re-seeded them from the profile would satisfy every field
     * assertion above and replay the day with the rules taken out. `midtown-office` for
     * `interventions`' reason — a two-car bank has nowhere to hold anything, so the same case at
     * Garden Apartments would be green about a rule that never bit.
     */
    const withRule = {
      ...baseState(),
      buildingId: 'midtown-office',
      /*
       * `call-waited 30 s → hold a car at the lobby`, and the pair is **measured** rather than
       * plausible: `lobby-queue-passes 6 → hold-at-lobby` typechecks, runs, and produces
       * leg-identical output at this cell, so a case written on it would be green about a rule that
       * never bit — the inert-control failure § D177 exists to catch, arriving inside the test. The
       * value is one of the condition's own list: `core` refuses an out-of-list value rather than
       * rounding it, exactly as the editor's dropdown does.
       */
      ruleRows: [{ when: 'call-waited' as const, whenValue: 30, then: 'hold-at-lobby' as const }],
    };
    const record = watchRecordOf(withRule, RESOURCES);
    expect(record?.ruleRows).toHaveLength(1);
    if (record === undefined) return;

    const withRules = recordRun(watchRunConfigOf(withRule, RESOURCES, record)).recording;
    const without = recordRun(
      watchRunConfigOf(withRule, RESOURCES, { ...record, ruleRows: [] }),
    ).recording;
    expect(legsOf(withRules)).not.toBe(legsOf(without));
    // And the replay is the run the player's own state produced, which is the whole claim.
    expect(legsOf(withRules)).toBe(
      legsOf(recordRun(shiftRunConfigOf(RESOURCES, withRule).config).recording),
    );
  }, 60_000);

  it('refuses a record naming a rule vocabulary this build does not ship', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const alien = {
      ...record,
      ruleRows: [{ when: 'when-the-moon-is-full' as never, then: 'hold-at-lobby' as const }],
    };
    expect(recordUnreadableReason(alien, RESOURCES)).toContain('when-the-moon-is-full');
  });

  it('refuses a record naming an intervention kind this build does not ship — the same pattern', () => {
    // `persist/validate.ts` checks the log as *a list of objects and no further*, on the stated
    // promise that `core` refuses what it does not recognise; `core` keeps it with a throw at
    // scheduling time, and this gate keeps it with a row — a record written by a newer build must
    // lose its `Watch it` button rather than replay something approximate (§ 1.5).
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const alien = {
      ...record,
      interventions: [{ atS: 120, change: { kind: 'reverse-gravity' } as never }],
    };
    expect(recordUnreadableReason(alien, RESOURCES)).toContain('reverse-gravity');
  });

  it('refuses the new arms’ malformed payloads as rows, never as mid-replay exceptions', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;

    // A switch whose profile is not shaped like one: `resolveWeights` would otherwise meet it
    // as a raw TypeError halfway through a replay somebody pressed `Watch it` on.
    const corruptSwitch = {
      ...record,
      interventions: [
        { atS: 120, change: { kind: 'switch-dispatcher', profile: { id: 'x' } } as never },
      ],
    };
    expect(recordUnreadableReason(corruptSwitch, RESOURCES)).toContain(
      'not shaped like one',
    );

    // An answer effect with an out-of-vocabulary mode: `Car.setMode` stores any string, so an
    // unchecked record would be *applied silently* — the approximate replay § 1.5 forbids.
    const alienMode = {
      ...record,
      interventions: [
        {
          atS: 120,
          change: {
            kind: 'answer-incident',
            option: 'call the fitter',
            serviceEvents: [{ atS: 200, bankId: 'main', carId: 'B', mode: 'toast' }],
          } as never,
        },
      ],
    };
    expect(recordUnreadableReason(alienMode, RESOURCES)).toContain('toast');

    // And the well-formed shapes of both arms pass exactly as a park entry always has.
    const wellFormed = {
      ...record,
      interventions: [
        { atS: 60, change: { kind: 'park-cars-lobby' } as const },
        {
          atS: 120,
          change: {
            kind: 'switch-dispatcher',
            profile: RESOURCES.dispatcherProfiles.profiles[0],
          } as never,
        },
        {
          atS: 180,
          change: {
            kind: 'answer-incident',
            option: 'call the fitter',
            serviceEvents: [{ atS: 200, bankId: 'main', carId: 'B', mode: 'out-of-service' }],
          } as never,
        },
      ],
    };
    expect(recordUnreadableReason(wellFormed, RESOURCES)).toBeNull();
  });

  it('names the issue that refused a record, rather than blaming the file', () => {
    /*
     * The first half of defect 1. `recordRefusalFor` is `null` exactly when a record exists, and
     * quotes every issue that fired otherwise — so the day can say what to change instead of
     * *"filed without the record of what it ran — days closed from here on carry one"*, which was
     * false in its second clause for precisely these days.
     */
    expect(recordRefusalFor(baseState(), RESOURCES)).toBeNull();
    const refused = { ...baseState(), patience: { distribution: 'exponential' as const, meanS: 120 } };
    const reason = recordRefusalFor(refused, RESOURCES);
    expect(reason).not.toBeNull();
    expect(reason).toContain('abandon');
    // All of them, joined, never the first — `runIdentityIssues`' rule, inherited.
    const two = {
      ...refused,
      levers: { ...baseState().levers, parking: !baseState().levers.parking },
    };
    expect(recordRefusalFor(two, RESOURCES)?.split(';')).toHaveLength(2);
  });

  it('refuses a calendar period that books the day’s event — the arm the subtraction would lose', () => {
    /*
     * The load-bearing check. `calendarAsks` has no vocabulary for `eventId`, so this refusal comes
     * from nowhere else once `viewer.week` is subtracted. Driven against a real shipped period
     * rather than a contrived one, and the assertion is in both directions: the period must book an
     * event on the day chosen, or the test would be green about nothing.
     */
    const base = baseState();
    /*
     * `moving-week` books `move-in` on six of its seven days — `calendar.ts`'s own docstring says
     * so — so it is the period that reaches this arm. Placed over the day the base state is on, so
     * the booking is in effect rather than merely declared.
     */
    const period = CALENDAR_PERIODS['moving-week'];
    const today = calendarDayFor(
      periodOnDays(period, base.week.day, base.week.day + 2),
      base.week.day,
      base.week.dayIdx,
    );
    expect(today?.shift.eventId, 'moving-week must book this day’s event for the arm to fire')
      .not.toBeNull();

    const state = { ...base, calendar: periodOnDays(period, base.week.day, base.week.day + 2) };
    const issues = watchRecordIssues(state, RESOURCES);
    const booked = issues.find((issue) => issue.message === PERIOD_BOOKS_THE_EVENT);
    expect(booked?.key).toBe('viewer.calendar');
    expect(watchRecordOf(state, RESOURCES)).toBeUndefined();

    /*
     * And the arm is **silent** when the period is out of the window — otherwise it would be a
     * refusal that fires on runs the record reproduces perfectly, which is the direction
     * `CARRY_CHECKS.calendar` argues against at length.
     */
    const elsewhere = {
      ...base,
      calendar: periodOnDays(period, base.week.day + 3, base.week.day + 5),
    };
    expect(
      watchRecordIssues(elsewhere, RESOURCES).some(
        (issue) => issue.message === PERIOD_BOOKS_THE_EVENT,
      ),
    ).toBe(false);
  });
});

describe('a record replays the run it was taken from', () => {
  it('reproduces the legs, not just the summary', () => {
    const state = baseState();
    const original = recordRun(shiftRunConfigOf(RESOURCES, state).config).recording;
    const record = watchRecordOf(state, RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const replayed = recordRun(watchRunConfigOf(state, RESOURCES, record)).recording;
    // § D177's comparison: a mean can be unchanged for a run that is entirely different.
    expect(legsOf(replayed)).toBe(legsOf(original));
  }, 60_000);

  it('replays the intervention log, and a record without it is a different run', () => {
    /*
     * `midtown-office`, not the probes' Garden Apartments. docs/18 records the control as
     * **measured inert** at the garden-apartments 900 s cell — a two-car bank has nowhere to park
     * anything — so a test written there would be green about a run the log never touched, which is
     * the inert-control failure with the polarity that lets a real defect through.
     */
    const withLog = {
      ...baseState(),
      buildingId: 'midtown-office',
      interventions: [{ atS: 120, change: { kind: 'park-cars-lobby' } }] as const,
    };
    const record = watchRecordOf(withLog, RESOURCES);
    expect(record?.interventions).toHaveLength(1);
    if (record === undefined) return;

    const withIt = recordRun(watchRunConfigOf(withLog, RESOURCES, record)).recording;
    const without = recordRun(
      watchRunConfigOf(withLog, RESOURCES, { ...record, interventions: [] }),
    ).recording;
    // The measured half of `CARRY_CHECKS.interventions`' sentence — *a replay without it is a
    // different run* — rather than a restatement of it.
    expect(legsOf(withIt)).not.toBe(legsOf(without));
    // And the run the record describes is the one the state produced.
    expect(legsOf(withIt)).toBe(
      legsOf(recordRun(shiftRunConfigOf(RESOURCES, withLog).config).recording),
    );
  }, 60_000);

  it('does not let the spectator’s own state leak into somebody else’s day', () => {
    /*
     * `stateFromWatchRecord` writes every unrecorded field explicitly. The measurement: a
     * spectator sitting on a moved lever and a patience curve replays a record byte for byte the
     * same as a spectator sitting on defaults.
     */
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const loaded = {
      ...baseState(),
      levers: { ...baseState().levers, parking: !baseState().levers.parking },
      patience: { distribution: 'exponential' as const, meanS: 90 },
      outOfServiceCarIds: ['main-1'],
    };
    expect(legsOf(recordRun(watchRunConfigOf(loaded, RESOURCES, record)).recording)).toBe(
      legsOf(recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording),
    );
    // And the reconstructed state says so rather than only behaving so.
    const rebuilt = stateFromWatchRecord(loaded, RESOURCES, record);
    expect(rebuilt.patience).toBeNull();
    expect(rebuilt.outOfServiceCarIds).toEqual(record.outOfServiceCarIds);
    expect(rebuilt.playMode).toBe('free-play');
  }, 60_000);
});

describe('the reproduction gate', () => {
  function rowFor(record: WatchRecord, recording: VizRecording): WatchableRun {
    return {
      id: 'row',
      source: 'filed-day',
      label: 'Monday · day 1',
      buildingName: 'Garden Apartments',
      subtitle: 'day 1 of this week',
      record,
      posted: postedResultOf(recording),
      blocked: null,
    };
  }

  it('passes a record that reproduces, and hands back the replay', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const recording = recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording;
    const checked = checkedRun(
      rowFor(record, recording),
      RESOURCES,
      baseState(),
      (config) => recordRun(config).recording,
    );
    expect(checked.run.blocked).toBeNull();
    expect(checked.recording).toBeDefined();
  }, 60_000);

  it('refuses a record that does not, naming the figures that moved', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const recording = recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording;
    const row = rowFor(record, recording);
    const stale: WatchableRun = {
      ...row,
      posted: { ...row.posted, carried: row.posted.carried + 3, minutePct: 7 },
    };
    const checked = checkedRun(
      stale,
      RESOURCES,
      baseState(),
      (config) => recordRun(config).recording,
    );
    expect(checked.run.blocked?.ground).toBe('does-not-reproduce');
    expect(checked.recording).toBeUndefined();
    expect(checked.run.blocked?.reason).toContain('people carried');
    expect(checked.run.blocked?.reason).toContain('away inside a minute');
    // The drift list is what the sentence is built from, so it is asserted rather than the prose.
    expect(
      reproductionDrift(stale.posted, postedResultOf(recording)).map((row2) => row2.label),
    ).toEqual(['people carried', 'away inside a minute (%)']);
  }, 60_000);

  it('refuses a record naming something this build does not ship', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    if (record === undefined) return;
    const recording = recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording;
    const checked = checkedRun(
      rowFor({ ...record, buildingId: 'no-such-tower' }, recording),
      RESOURCES,
      baseState(),
      () => {
        throw new Error('the gate must refuse before it simulates an unreadable record');
      },
    );
    expect(checked.run.blocked?.ground).toBe('unreadable-record');
    expect(checked.run.blocked?.reason).toContain('no-such-tower');
  }, 60_000);

  it('gives a day filed with no record its own ground, and never simulates one', () => {
    const week = {
      ...baseState().week,
      history: [
        {
          day: 1,
          dayIdx: 0,
          weekday: 'Monday' as const,
          eventId: 'ordinary' as const,
          arrived: 30,
          carried: 30,
          minutePct: 90,
          readings: [],
          record: null,
          // A day from a build that kept no reason — `library.ts`'s `no-record` arm, which is what
          // this case drives.
          recordRefusal: null,
          allMet: true,
        },
      ],
    };
    const [row] = filedDayRuns([week], () => 'Garden Apartments');
    expect(row?.blocked?.ground).toBe('no-record');
    const checked = checkedRun(
      row as WatchableRun,
      RESOURCES,
      baseState(),
      () => {
        throw new Error('a day with no record has nothing to re-simulate');
      },
    );
    expect(checked.run.blocked?.ground).toBe('no-record');
  });

  /*
   * GitHub issue #165 split the gate so `dev/watchPanel.ts` could run its simulation on a worker
   * while `everyday/host.ts#watchRun` keeps calling the whole thing. Two gates is exactly the
   * divergence CLAUDE.md's standing requirement is about, and it would be invisible: both shells
   * would answer, and only the rows they refuse would disagree. So the composition is required to
   * agree with the halves on every arm the gate has — including the two that must **not** reach a
   * simulation, which are asserted by handing in a simulator that throws.
   */
  it('is the same gate whether it is called whole or in halves, on all four arms', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const recording = recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording;
    const good = rowFor(record, recording);
    const stale: WatchableRun = { ...good, posted: { ...good.posted, carried: good.posted.carried + 3 } };
    const unreadable = rowFor({ ...record, buildingId: 'no-such-tower' }, recording);
    const [noRecord] = filedDayRuns(
      [
        {
          ...baseState().week,
          history: [
            {
              day: 1,
              dayIdx: 0,
              weekday: 'Monday' as const,
              eventId: 'ordinary' as const,
              arrived: 30,
              carried: 30,
              minutePct: 90,
              readings: [],
              record: null,
              recordRefusal: null,
              allMet: true,
            },
          ],
        },
      ],
      () => 'Garden Apartments',
    );
    expect(noRecord).toBeDefined();
    if (noRecord === undefined) return;

    for (const [name, row, needsRun] of [
      ['reproduces', good, true],
      ['does-not-reproduce', stale, true],
      ['unreadable-record', unreadable, false],
      ['no-record', noRecord, false],
    ] as const) {
      const whole = checkedRun(row, RESOURCES, baseState(), (config) =>
        needsRun
          ? recordRun(config).recording
          : (() => {
              throw new Error(`the ${name} arm must refuse before it simulates`);
            })(),
      );
      const gate = watchGateBefore(row, RESOURCES, baseState());
      const halves =
        gate.kind === 'settled'
          ? gate.checked
          : watchGateAfter(row, recordRun(gate.config).recording);
      expect(gate.kind, `${name}: the halves disagree about whether a run is needed`).toBe(
        needsRun ? 'simulate' : 'settled',
      );
      expect(halves.run.blocked, `${name}: the halves reached a different verdict`).toEqual(
        whole.run.blocked,
      );
      expect(halves.recording === undefined, `${name}: one half kept a replay the other did not`).toBe(
        whole.recording === undefined,
      );
    }
  }, 120_000);
});
