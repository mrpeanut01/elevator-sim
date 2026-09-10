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

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EFFECT_CARRYING_KINDS,
  STORED_EFFECT_SHAPES,
  type EffectCarryingKind,
  type StoredEffectField,
  type StoredEffectFieldKind,
} from '@elevator-sim/core/browser';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { CALENDAR_PERIODS, calendarDayFor, periodOnDays } from '../shift/calendar.js';
import type { VizRecording } from '../contract/types.js';

import { filedDayRuns, watchGateAfter, watchGateBefore } from './library.js';
import { checkedRunForTest } from './gate.test-helper.js';
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
    const checked = checkedRunForTest(
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
    const rowPosted = postedResultOf(recording);
    const stale: WatchableRun = {
      ...row,
      posted: { ...rowPosted, carried: rowPosted.carried + 3, minutePct: 7 },
    };
    const checked = checkedRunForTest(
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
      reproductionDrift(stale.posted ?? rowPosted, postedResultOf(recording)).map((row2) => row2.label),
    ).toEqual(['people carried', 'away inside a minute (%)']);
  }, 60_000);

  it('refuses a record naming something this build does not ship', () => {
    const record = watchRecordOf(baseState(), RESOURCES);
    if (record === undefined) return;
    const recording = recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording;
    const checked = checkedRunForTest(
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
    const checked = checkedRunForTest(
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
   * **A case stood here and is deleted, because its premise expired rather than its wording.**
   *
   * It asserted that the gate reached the same verdict *whether it is called whole or in halves*,
   * on all four arms. That was worth a run while two shells took two routes: `dev/watchPanel.ts`
   * called the halves so its simulation could go on a worker and `everyday/host.ts#watchRun` called
   * the composition because its contract returned a row. Two gates is exactly the divergence
   * CLAUDE.md's standing requirement is about, and it would have been invisible — both shells
   * answer, and only the rows they refuse disagree.
   *
   * GitHub issue **#410** moved the Everyday press off the painting thread as well. Both shells
   * call the halves, `watch/library.ts#checkedRun` was deleted for want of a non-test caller, and
   * the only composition left is `watch/gate.test-helper.ts`'s — this suite's own convenience. A
   * case comparing a helper with its own definition is a tautology wearing the shape of a check,
   * which is worse than no case at all, so it is gone rather than reworded.
   *
   * The four arms are still covered: each has its own case above, driven through the helper, and
   * the two that must refuse **before** they simulate are still asserted by handing in a simulator
   * that throws.
   */
});

/* -------------------------------------------------------------------------- *
 * GitHub issue #476 — one description of a stored effect, and the readers of it
 * -------------------------------------------------------------------------- */

/**
 * A value of each field kind that the description accepts, and one it does not.
 *
 * `Record<StoredEffectFieldKind, …>` and not a partial one: `core` owns the vocabulary, so a sixth
 * kind added there is a **compile error here** rather than a field this file quietly stops
 * exercising. That is the tie that lets the two blocks below derive their effects from the table
 * instead of transcribing three shapes — and a transcription is exactly what #476 was filed about.
 */
const SAMPLE: Readonly<Record<StoredEffectFieldKind, { readonly ok: unknown; readonly bad: unknown }>> =
  Object.freeze({
    'a finite number': { ok: 200, bad: Number.NaN },
    'a non-empty string': { ok: 'main', bad: '' },
    'a non-empty list of non-empty strings': { ok: ['G', '2'], bad: [] },
    'a positive finite number': { ok: 900, bad: 0 },
    'a declared service mode': { ok: 'out-of-service', bad: 'toast' },
  });

/** The rows of the description, as `[name, fields]` — the union of `Record`s widened once, here. */
const DESCRIBED_SHAPES: readonly (readonly [string, Readonly<Record<string, StoredEffectField>>])[] =
  Object.entries(STORED_EFFECT_SHAPES).map(([name, shape]) => [
    name,
    shape.fields as Readonly<Record<string, StoredEffectField>>,
  ]);

/** The smallest effect of one described shape that the description accepts. */
function effectOf(fields: Readonly<Record<string, StoredEffectField>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([at, rule]) => [at, SAMPLE[rule.must].ok]));
}

/** A record carrying one intervention of `kind`, with `serviceEvents` passed through verbatim. */
function recordCarrying(kind: EffectCarryingKind, serviceEvents: readonly unknown[]): WatchRecord {
  const record = watchRecordOf(baseState(), RESOURCES);
  if (record === undefined) throw new Error('the base state must produce a record');
  const change =
    kind === 'answer-incident'
      ? { kind, option: 'close the high bank', serviceEvents }
      : { kind, changeId: 'rezone-bank', name: 'Re-zone a bank', serviceEvents };
  return { ...record, interventions: [{ atS: 120, change: change as never }] };
}

/**
 * **The two controls, and both were run red before the fix landed.**
 *
 * The first against `main`, where a bank-range effect reads *"answers an incident with an effect
 * that names no car and no second"* — the defect, exactly as #476 describes it. The second against
 * a deliberately over-wide implementation of `storedEffectIssue`, because the dangerous way to fix
 * the first is to widen the arm until it accepts anything, and a guard that has never failed is a
 * guard nobody has checked.
 *
 * Both are driven from {@link STORED_EFFECT_SHAPES} and {@link EFFECT_CARRYING_KINDS} rather than
 * from transcribed exemplars, which is the drift leg: a fourth shape, or a fourth kind that carries
 * effects, is exercised through every reader the day it is declared.
 */
describe('every reader of a stored effect reads it against one description', () => {
  it('reads back every shape the description admits, on every kind that carries one', () => {
    for (const kind of EFFECT_CARRYING_KINDS) {
      for (const [name, fields] of DESCRIBED_SHAPES) {
        expect(
          recordUnreadableReason(recordCarrying(kind, [effectOf(fields)]), RESOURCES),
          `a ${kind} carrying a ${name} effect must be readable`,
        ).toBeNull();
      }
      // Empty is legal on every one of them — `core/src/sim/types.ts` says so on all three arms:
      // an answer whose effect is reassurance alone still belongs on the record.
      expect(recordUnreadableReason(recordCarrying(kind, []), RESOURCES)).toBeNull();
    }
  });

  it('still refuses what the description does not admit — the widening this could have been', () => {
    /*
     * **The boundary first, and it is checked against the value the widening would really have.**
     * `{ atS, bankId }` is precisely what *"drop the `carId` requirement"* accepts — a second and a
     * bank, changing nothing — and it is the shape a reader widened to pass the block above would
     * let through. Two shapes in one object is the other side: not an arm of the union at all.
     */
    const twoShapes = { ...effectOf(DESCRIBED_SHAPES[0]?.[1] ?? {}), ...effectOf(DESCRIBED_SHAPES[1]?.[1] ?? {}) };
    for (const kind of EFFECT_CARRYING_KINDS) {
      for (const effects of [[{ atS: 200, bankId: 'main' }], [twoShapes], [null], ['out-of-service'], [42]]) {
        expect(
          recordUnreadableReason(recordCarrying(kind, effects), RESOURCES),
          `a ${kind} carrying ${JSON.stringify(effects)} must be refused`,
        ).not.toBeNull();
      }
      // An effect list that is not a list at all.
      expect(
        recordUnreadableReason(recordCarrying(kind, 'out-of-service' as never), RESOURCES),
      ).not.toBeNull();

      /*
       * Then every field of every shape, absent and then wrong — derived rather than written out,
       * so a shape that gains a field is exercised the day it is described. The `carId` rows are
       * the other naive fix: *require `carId` only when there is no `servesFloors`* accepts a mode
       * change with no car, and this refuses it.
       */
      for (const [name, fields] of DESCRIBED_SHAPES) {
        for (const [at, rule] of Object.entries(fields)) {
          const dropped: Record<string, unknown> = effectOf(fields);
          delete dropped[at];
          expect(
            recordUnreadableReason(recordCarrying(kind, [dropped]), RESOURCES),
            `a ${kind} carrying a ${name} effect without ${at} must be refused`,
          ).not.toBeNull();
          expect(
            recordUnreadableReason(
              recordCarrying(kind, [{ ...effectOf(fields), [at]: SAMPLE[rule.must].bad }]),
              RESOURCES,
            ),
            `a ${kind} carrying a ${name} effect with a bad ${at} must be refused`,
          ).not.toBeNull();
        }
      }
    }
  });

  it('names the build rather than the file when the miss is a vocabulary one', () => {
    // The distinction #476 is about, one level up: a mode this build does not declare is a fact
    // about the build; a bank id that is not a string is a fact about the bytes.
    const alien = { ...effectOf(STORED_EFFECT_SHAPES.mode.fields), mode: 'toast' };
    expect(recordUnreadableReason(recordCarrying('answer-incident', [alien]), RESOURCES))
      .toContain('does not ship the service mode');
    const damaged = { ...effectOf(STORED_EFFECT_SHAPES.mode.fields), bankId: 42 };
    expect(recordUnreadableReason(recordCarrying('answer-incident', [damaged]), RESOURCES))
      .toContain('would be a guess');
  });
});

/* -------------------------------------------------------------------------- *
 * The drift guard — the reader set is derived from disk, never from a list
 * -------------------------------------------------------------------------- */

/** The monorepo's `packages/` directory — `deadCode.test-helper.ts`'s own derivation, three up. */
const PACKAGES_DIR = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Dependencies and build output. Dot-directories are skipped by the walk itself, which also keeps a
 * `.claude/worktrees/` checkout parked inside the tree from being scanned twice — a guard that
 * passes CI and reddens on any machine with a worktree in it is a guard that has to be found twice.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-web', 'coverage']);

/** Every shipped `.ts` under `packages/`, derived. Tests and helpers are not readers of a record. */
function shippedSources(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...shippedSources(full));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.test-helper.')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The fields that tell one described shape from another — **derived from the description**.
 *
 * A field every shape carries (`atS`, `bankId`) is not evidence of anything: an intervention entry
 * has an `atS` too. A field only some shapes carry is what a reader touches when it is deciding
 * *which* shape it has, which is the decision this module exists to hold in one place.
 */
const TELLING_FIELDS = [
  ...new Set(DESCRIBED_SHAPES.flatMap(([, fields]) => Object.keys(fields))),
].filter((field) => !DESCRIBED_SHAPES.every(([, fields]) => field in fields));

/**
 * The fields **every** described shape carries — the complement of {@link TELLING_FIELDS}, derived
 * the same way. `atS` and `bankId` today; a fourth shape that dropped one would take it out of here
 * and out of idiom 4 below, which is why it is computed rather than written.
 */
const SHARED_FIELDS = [
  ...new Set(DESCRIBED_SHAPES.flatMap(([, fields]) => Object.keys(fields))),
].filter((field) => DESCRIBED_SHAPES.every(([, fields]) => field in fields));

/**
 * A file spelling its own idea of what a stored effect may be, in four idioms — the three the
 * divergent readers were actually written in, and one that closes the hole those three left. The
 * field names come from the table rather than from here.
 *
 * 1. a runtime test of a telling field — `typeof x.carId`, `Array.isArray(x.servesFloors)`;
 * 2. a discrimination on one — `'mode' in x`, which is what `config/serviceEvent.ts`'s three guards
 *    do and what a reader that branched for itself would copy;
 * 3. an untrusted read of `serviceEvents` by bracket index, which is how the *tolerant* reader was
 *    spelled — it named no field at all and asked for an `atS`, so 1 and 2 would never have seen
 *    it. The trailing class excludes `Draft['serviceEvents'][number]`, a type and not a read.
 * 4. a hand-rolled runtime test of a **shared** field — `typeof x.atS`, `typeof x['bankId']`.
 *
 * **Idiom 4 is here because the hole this docstring used to declare turned out to be affordable.**
 * It said a reader validating an effect on `atS` and `bankId` alone, reaching `serviceEvents` by a
 * dotted property rather than a bracket, matched none of the three — and that a marker on the
 * shared fields *"would flag most of this file"*. The first half was true and was reproduced with a
 * probe; the second was not measured. Measured: of every shipped file that mentions `serviceEvents`
 * at all, **exactly one** hand-rolls such a test — this module's own `record.ts`, on the
 * *intervention entry's* `atS` rather than an effect's — and it is already exempt for consulting
 * the description. So the marker costs no register entry and closes the case, and
 * `noPropertyAccessFromIndexSignature` being **off** in `tsconfig.base.json` is what made the hole
 * reachable rather than theoretical: a dotted read of an index-signature bag compiles here.
 *
 * **What it still cannot see**, stated rather than left to be discovered: a reader that keeps its
 * `storedEffectIssue` call and hand-rolls a second check beside it. The exemption is file-granular,
 * as `deadCode.test.ts`'s registers are, and no regex over a file can be otherwise.
 */
function spellsItsOwnCheck(): RegExp {
  const alt = TELLING_FIELDS.join('|');
  const shared = SHARED_FIELDS.join('|');
  const reach = `(?:\\.(?:${alt})|\\[['"](?:${alt})['"]\\])`;
  const sharedReach = `(?:\\.(?:${shared})|\\[['"](?:${shared})['"]\\])`;
  return new RegExp(
    `typeof\\s+[A-Za-z_$][\\w$]*${reach}` +
      `|Array\\.isArray\\(\\s*[A-Za-z_$][\\w$]*${reach}` +
      `|['"](?:${alt})['"]\\s+in\\s+` +
      `|[A-Za-z_$][\\w$]*\\[['"]serviceEvents['"]\\]\\s*[^[]` +
      `|(?:typeof\\s+|Array\\.isArray\\(\\s*)[A-Za-z_$][\\w$]*${sharedReach}`,
    'u',
  );
}

/**
 * Files the pattern flags whose match is about something other than a stored effect, with the
 * reason — `deadCode.test.ts#PUBLIC_API_ONLY`'s shape, and asserted in **both** directions below so
 * an entry cannot outlive its reason and become the place a real reader goes to be forgotten.
 */
const NOT_A_STORED_EFFECT: Readonly<Record<string, string>> = Object.freeze({
  'experiments/src/validation/serviceMode.ts':
    'its `in` test guards a `CarSnapshot` off a run result on the way to rewriting a recorded ' +
    'car’s mode. Two of the fields it names are two of the description’s, which is a collision ' +
    'rather than a reader: nothing in that file reads a stored intervention.',
});

describe('nothing else spells its own idea of what a stored effect may be', () => {
  const sources = shippedSources(PACKAGES_DIR);
  const pattern = spellsItsOwnCheck();
  const read = (path: string): string => readFileSync(path, 'utf8');

  it('scans the tree it is supposed to be scanning, with a pattern that still matches', () => {
    /*
     * The two ways this guard reaches a **correct-looking zero while the readers diverge**, asserted
     * directly rather than through the defect — `documentation.test.ts`'s own repair of the same
     * mistake. A `SKIP_DIRS` entry that swallowed `packages/` takes the walk to nothing and passes;
     * a pattern edited to something narrower matches nothing and passes.
     */
    expect(sources.length, 'the walk found no sources, so this guard is scanning nothing')
      .toBeGreaterThan(400);
    expect(
      sources.filter((path) => /serviceEvents/u.test(read(path))).length,
      'no file mentions serviceEvents, so the conjunction below can never fire',
    ).toBeGreaterThan(15);
    /*
     * Control strings, verbatim from the tree: the first two are the two divergent readers as
     * `watch/record.ts` spelled them before #476 landed, the third is `config/serviceEvent.ts`'s
     * own guard — the discrimination a new reader would copy. Checked against strings rather than
     * against the tree, because the tree is *supposed* to stop matching once the fix is in, and a
     * pattern that has stopped matching anything is indistinguishable from a tree that is clean.
     */
    for (const control of [
      "        typeof effect.carId !== 'string' ||",
      "    const effects = change['serviceEvents'];",
      "  return 'mode' in event;",
      // Idiom 4, and it is the probe that found the hole rather than an invented string: a reader
      // that reaches `serviceEvents` dotted and validates on the shared fields alone escaped the
      // other three, which was reproduced before this clause was written.
      '    return effects.every((e) => typeof e.atS === \'number\');',
    ]) {
      expect(pattern.test(control), `the pattern no longer matches a real spelling: ${control}`)
        .toBe(true);
    }
    /*
     * The two field sets are complements and both are load bearing — the telling fields drive
     * idioms 1 and 2, the shared ones idiom 4 — so a table change that emptied either would take a
     * whole idiom out of the pattern silently. Asserted as a partition rather than by name.
     */
    expect(TELLING_FIELDS).not.toContain('atS');
    expect(TELLING_FIELDS).not.toContain('bankId');
    expect([...SHARED_FIELDS].sort()).toEqual(['atS', 'bankId']);
    expect(TELLING_FIELDS.filter((field) => SHARED_FIELDS.includes(field))).toEqual([]);
    expect(TELLING_FIELDS.length).toBeGreaterThan(0);
  });

  it('flags no shipped file that does not consult the one description', () => {
    const flagged = sources
      .filter((path) => {
        const src = read(path);
        return /serviceEvents/u.test(src) && pattern.test(src);
      })
      .map((path) => relative(PACKAGES_DIR, path).split(sep).join('/'));

    const rogue = flagged.filter(
      (path) => !(path in NOT_A_STORED_EFFECT) && !/storedEffectIssue/u.test(read(join(PACKAGES_DIR, path))),
    );
    expect(
      rogue,
      'these files decide for themselves what a stored service event may look like. That is the ' +
        'divergence GitHub issue #476 was filed about — two readers with different ideas of the ' +
        'same shape, and nothing that could say so. Call core’s storedEffectIssue instead, or ' +
        'record the file in NOT_A_STORED_EFFECT with the reason its match is about something else.',
    ).toEqual([]);

    // The register cannot rot: an entry whose file has stopped matching must be deleted.
    for (const [path, reason] of Object.entries(NOT_A_STORED_EFFECT)) {
      expect(flagged, `${path} no longer matches, so its entry is stale — delete it. (${reason})`)
        .toContain(path);
    }
  });

  it('derives the readers from disk, and finds the one the issue was filed against', () => {
    const readers = sources
      .filter((path) => /storedEffectIssue/u.test(read(path)))
      .map((path) => relative(PACKAGES_DIR, path).split(sep).join('/'))
      .sort();
    // Both ends: the description itself, and the record reader #476 names. A reader that stopped
    // importing it would fall out of this list and the check above would catch it going rogue.
    expect(readers).toContain('core/src/sim/storedEffect.ts');
    expect(readers).toContain('viz/src/watch/record.ts');
  });
});
