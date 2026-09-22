/**
 * **The day report's one line about a press** — GitHub issue **#581**.
 *
 * The suite is shaped around the thing that can go wrong here, which is not arithmetic. #581 names
 * three routes and forbids the third: measure the counterfactual, state co-occurrence honestly, or
 * offer a plausible mechanism dressed as a measurement. `shift/afterPress.ts` takes the second, so
 * the assertions that matter are **the claim, not the numbers**:
 *
 * 1. the copy says out loud that nothing here measures the press (route 2, declared in the copy);
 * 2. **no causal verb appears anywhere in the row** — the refusal is pinned by a run rather than
 *    by the module's own docstring, which is `CLAUDE.md`'s rule about a stated refusal going stale
 *    the same way a stated mechanism does;
 * 3. every figure carries the cohort it is over, so R13 has nothing to catch;
 * 4. a day with nothing pressed draws no row at all, rather than a row saying nothing happened.
 *
 * Run against **real recordings** rather than hand-built summaries, for `report.test.ts`' stated
 * reason: the interesting failure is a run the simulator actually produces, and a synthetic
 * recording can be given a leg history no building has.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { AFTER_PRESS_DISCLAIMER, AFTER_PRESS_ROW_ID, afterPressBeatOf } from './afterPress.js';
import { clockOf, clockRange, dayReportOf, type ShapedDayReport } from './report.js';
import { goalsForDay } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import { contractById } from './contracts.js';
import { SHIFT_EVENTS } from './events.js';
import { openWeek } from './week.js';
import { DAY_START_S } from './types.js';

let config: LoadedConfig;
let run: VizRecording;

/** The sheet's own clock, passed in exactly as `shift/report.ts` passes it. */
const clocks = (startS: number, endS: number): string => clockRange(startS, endS, DAY_START_S);

/** A press at a fraction of the way through the run — a second the recording actually has. */
function pressAt(fraction: number, change: RunInterventionConfig['change']): RunInterventionConfig {
  const atS = Math.round(run.startedAt + (run.endedAt - run.startedAt) * fraction);
  return { atS, change };
}

const PARK: RunInterventionConfig['change'] = { kind: 'park-cars-lobby' };
const SPREAD: RunInterventionConfig['change'] = { kind: 'spread-cars' };

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const base: SimulationConfig = fixtureConfig(config, {
    buildingId: 'midtown-office',
    durationS: 900,
    onTimeout: 'report',
  });
  run = recordRun({ ...base, demand: { arrivalRatePctPop5min: 14 } }, { recordDecisions: false })
    .recording;
}, 180_000);

describe('the premises this suite rests on', () => {
  it('has a run with people standing at the press and people delivered after it', () => {
    const press = pressAt(0.4, PARK);
    const then = observationsAt(run, press.atS);
    const end = observationsAt(run, run.endedAt);
    // Both halves, because a run where nobody was standing would make the cohort assertions below
    // pass on sentences reading `0 people` and prove nothing about the wording.
    expect(then.waitingNow).toBeGreaterThan(0);
    expect(end.carried - then.carried).toBeGreaterThan(0);
  });
});

describe('a day with no press', () => {
  it('draws no row at all', () => {
    expect(afterPressBeatOf(run, [], clocks)).toBeUndefined();
  });

  it('draws no row for presses outside the run’s own span', () => {
    // Both ends. A press stamped at `endedAt` has no window after it, and one before `startedAt`
    // belongs to a record this recording is not of.
    const outside: readonly RunInterventionConfig[] = [
      { atS: run.startedAt - 1, change: PARK },
      { atS: run.endedAt, change: PARK },
      { atS: run.endedAt + 600, change: PARK },
    ];
    expect(afterPressBeatOf(run, outside, clocks)).toBeUndefined();
  });
});

describe('a day with a press', () => {
  it('names the press, its clock and the end of the run', () => {
    const press = pressAt(0.4, PARK);
    const beat = afterPressBeatOf(run, [press], clocks);
    expect(beat?.id).toBe(AFTER_PRESS_ROW_ID);
    expect(beat?.when).toBe(clockRange(press.atS, run.endedAt, DAY_START_S));
    // The stage's own past tense, shared through `stampVerbOf` — the sheet and the stage may not
    // have two vocabularies for one press.
    expect(beat?.what).toContain('parked the cars in the lobby');
  });

  it('prints a clock the run actually had', () => {
    // `report.test.ts`' rule 4, applied to the row this module adds.
    const inside = new Set<string>();
    for (let t = run.startedAt; t <= run.endedAt; t += 30) inside.add(clockOf(t, DAY_START_S));
    inside.add(clockOf(run.endedAt, DAY_START_S));
    const beat = afterPressBeatOf(run, [pressAt(0.4, PARK)], clocks);
    for (const part of (beat?.when ?? '').split('–')) {
      expect(inside.has(part), `${part} is outside the run`).toBe(true);
    }
  });

  it('reports the standing counts and the deliveries the run actually produced', () => {
    const press = pressAt(0.4, PARK);
    const then = observationsAt(run, press.atS);
    const end = observationsAt(run, run.endedAt);
    const beat = afterPressBeatOf(run, [press], clocks);
    expect(beat?.what).toContain(`${String(then.waitingNow)} people standing`);
    expect(beat?.why).toContain(`${String(end.waitingNow)} people were standing`);
    expect(beat?.why).toContain(`${String(end.carried - then.carried)} people were delivered`);
  });

  it('is never toned, because a press is not a fault', () => {
    expect(afterPressBeatOf(run, [pressAt(0.4, PARK)], clocks)?.tone).toBe('plain');
  });
});

describe('the last press is the one reported, and the earlier ones are declared', () => {
  it('names the latest press rather than the first', () => {
    const beat = afterPressBeatOf(run, [pressAt(0.2, PARK), pressAt(0.6, SPREAD)], clocks);
    expect(beat?.when).toBe(clockRange(pressAt(0.6, SPREAD).atS, run.endedAt, DAY_START_S));
    expect(beat?.what).not.toContain('parked the cars');
  });

  it('holds its own time order rather than inheriting the log’s', () => {
    // Authored out of order, which the append-only log is not — but the claim is *the last press*,
    // and a claim held by the caller's ordering is a claim nothing checks.
    const ordered = afterPressBeatOf(run, [pressAt(0.2, PARK), pressAt(0.6, SPREAD)], clocks);
    const shuffled = afterPressBeatOf(run, [pressAt(0.6, SPREAD), pressAt(0.2, PARK)], clocks);
    expect(shuffled).toEqual(ordered);
  });

  it('says how many presses came before it, so the window is not read as the day’s', () => {
    const one = afterPressBeatOf(run, [pressAt(0.2, PARK), pressAt(0.6, SPREAD)], clocks);
    expect(one?.why).toContain('1 earlier press is in the log above, outside this window.');
    const two = afterPressBeatOf(
      run,
      [pressAt(0.2, PARK), pressAt(0.4, PARK), pressAt(0.6, SPREAD)],
      clocks,
    );
    expect(two?.why).toContain('2 earlier presses are in the log above, outside this window.');
  });

  it('says nothing about earlier presses when there were none', () => {
    expect(afterPressBeatOf(run, [pressAt(0.4, PARK)], clocks)?.why).not.toContain('earlier press');
  });
});

/* -------------------------------------------------------------------------- *
 * The claim — #581's whole difficulty, and the half a reviewer cannot check by reading
 * -------------------------------------------------------------------------- */

describe('the claim this row makes is the claim its evidence supports', () => {
  /**
   * The verbs that would turn a co-occurrence into a cause.
   *
   * Written as a list rather than as a rule, because the rule — *say nothing you did not measure*
   * — is not mechanically checkable and this is. It is the same instrument
   * `packages/experiments/src/validation/documentation.test.ts` uses on the access-control claim:
   * a sentence that goes stale is caught by a run, never by another sentence.
   *
   * `moved` is first on purpose. #581 says it outright: *it is the only thing that licenses the
   * word moved*, of the counterfactual this row does not run.
   */
  const CAUSAL = [
    'moved',
    'because',
    'caused',
    'thanks to',
    'led to',
    'resulted in',
    'made the',
    'improved',
    'fixed',
    'due to',
    'so the',
  ] as const;

  it('uses no causal verb anywhere in the row', () => {
    for (const change of [PARK, SPREAD]) {
      const beat = afterPressBeatOf(run, [pressAt(0.4, change)], clocks);
      const whole = `${beat?.what ?? ''} ${beat?.why ?? ''}`.toLowerCase();
      for (const word of CAUSAL) {
        expect(whole.includes(word), `the row says "${word}": ${whole}`).toBe(false);
      }
    }
  });

  it('says in the copy which route it took, rather than only in a docstring', () => {
    const beat = afterPressBeatOf(run, [pressAt(0.4, PARK)], clocks);
    expect(beat?.why).toContain(AFTER_PRESS_DISCLAIMER);
    // The three clauses, each asserted for what it says rather than by matching the constant it
    // came from: what the reading is not, why the sheet does not measure it, and where it would be.
    expect(AFTER_PRESS_DISCLAIMER).toContain('not what the press did');
    expect(AFTER_PRESS_DISCLAIMER).toContain('the day was not run again without it');
    expect(AFTER_PRESS_DISCLAIMER).toContain('the bench');
  });

  it('carries no mean and no estimate — R3 and R13 have nothing to catch', () => {
    const beat = afterPressBeatOf(run, [pressAt(0.4, PARK)], clocks);
    const whole = `${beat?.what ?? ''} ${beat?.why ?? ''}`.toLowerCase();
    for (const cue of ['average', 'mean', 'typical', 'per ride', 'withheld', ' s ']) {
      expect(whole.includes(cue), `the row says "${cue}"`).toBe(false);
    }
  });

  it('gives every figure the cohort it is over', () => {
    /*
     * Every numeral outside the `when` cell is immediately followed by the thing it counts. Run on
     * the two arms whose verb carries no authored name: an `equipment-change` names a tier the
     * price schedule authored, and a digit inside *that* is the schedule's rather than this row's.
     */
    for (const change of [PARK, SPREAD]) {
      const beat = afterPressBeatOf(run, [pressAt(0.2, change), pressAt(0.6, change)], clocks);
      const whole = `${beat?.what ?? ''} ${beat?.why ?? ''}`;
      for (const match of whole.matchAll(/\d+(?<unit>[^\d]{0,16})/gu)) {
        const unit = match.groups?.['unit'] ?? '';
        expect(
          / (people|person|earlier press)/u.test(unit),
          `"${match[0]}" names no cohort`,
        ).toBe(true);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * On the sheet — the row reaches the product, which is the half a unit cannot show
 * -------------------------------------------------------------------------- */

describe('the sheet', () => {
  function sheet(interventions: readonly RunInterventionConfig[]): ShapedDayReport {
    const observations = shiftObservationsOf(observationsAt(run, run.endedAt));
    return dayReportOf({
      recording: run,
      observations,
      goals: goalsForDay(4),
      week: { ...openWeek('c2'), day: 4, dayIdx: 3 },
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      plan: { shiftLengthS: 900, windowStartS: null, patternId: 'building' },
      calendar: null,
      subject: { kind: 'week-day' },
      interventions,
    });
  }

  it('carries the row on a day that was pressed and not on one that was not', () => {
    const untouched = sheet([]);
    const pressed = sheet([pressAt(0.4, PARK)]);
    expect(untouched.diagnosis.map((row) => row.id)).not.toContain(AFTER_PRESS_ROW_ID);
    expect(pressed.diagnosis.map((row) => row.id)).toContain(AFTER_PRESS_ROW_ID);
    // The two rows the section has always had keep their order and their place, because
    // `render/reportCard.ts` draws `diagnosis[0]` and nothing else moved.
    expect(untouched.diagnosis.map((row) => row.id)).toEqual(['peak-queue', 'peak-phase']);
    expect(pressed.diagnosis.map((row) => row.id)).toEqual([
      'peak-queue',
      'peak-phase',
      AFTER_PRESS_ROW_ID,
    ]);
  });

  it('draws it in the sheet’s own clock, not in a second one', () => {
    const press = pressAt(0.4, PARK);
    const row = sheet([press]).diagnosis.find((candidate) => candidate.id === AFTER_PRESS_ROW_ID);
    expect(row?.when).toBe(clockRange(press.atS, run.endedAt, DAY_START_S));
  });

  it('draws the same press the log above it names', () => {
    // One vocabulary: the meta line and the beat are both `stampVerbOf`, so a sheet cannot call one
    // press two things.
    const pressed = sheet([pressAt(0.4, SPREAD)]);
    const row = pressed.diagnosis.find((candidate) => candidate.id === AFTER_PRESS_ROW_ID);
    const logged = pressed.metaLines.find((line) => line.includes('·') && line.includes('spread'));
    expect(logged).toBeDefined();
    const verb = (logged ?? '').split(' · ')[1] ?? '';
    expect(verb.length).toBeGreaterThan(0);
    expect(row?.what).toContain(verb);
  });
});
