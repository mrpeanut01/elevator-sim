/**
 * **The day report's pair of runs** — GitHub issue **#581** route 1, § D931.
 *
 * The suite is shaped around the two things that can go wrong, and neither of them is arithmetic.
 *
 * **One: the pair is not a pair.** A with-and-without reading is worth nothing unless the two runs
 * differ in the press and in nothing else, so the premises are asserted on **real recordings**
 * before any copy is read — the same crowd, the same start, a **bit-identical prefix** before the
 * press (derived by this file's own filter and key rather than by the module's predicate), and
 * legs that actually differ after it. The last of those is what stops the rest being vacuous: two
 * identical runs would satisfy every other assertion here and prove nothing.
 *
 * **Two: the copy claims more than a pair supports.** § D900's row may say no causal verb, and
 * `afterPress.test.ts` pins that list — it is kept here **unchanged and not one word of it moved**,
 * and a second list is added beside it. The failure a *pair* invites is not *the press caused it*;
 * it is *the press is worth five people*, which is an estimate off one replication and is exactly
 * what `CLAUDE.md`'s statistical discipline forbids. So {@link ESTIMATE} bans the vocabulary of
 * estimation and comparison, and one case asserts that the row states **no difference at all** —
 * the two runs are printed and the arithmetic is left to the reader, because a subtraction on a
 * sheet is a quantity and a quantity off one seed is a claim this product may not make.
 *
 * Run against recordings the simulator actually produced, for `afterPress.test.ts`' own stated
 * reason: a synthetic recording can be given a leg history no building has, and the interesting
 * failure is the one a real run reaches.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { sameCrowd } from '../record/crowd.js';

import {
  AFTER_PRESS_DISCLAIMER,
  AFTER_PRESS_PAIR_NOTE,
  AFTER_PRESS_ROW_ID,
  AFTER_PRESS_VERDICT_NOTE,
  afterPressBeatOf,
} from './afterPress.js';
import { contractById } from './contracts.js';
import { lastPressInRun, pressCounterfactualOf, pressesInRun } from './counterfactual.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay } from './goals.js';
import { shiftObservationsOf } from './observations.js';
import { clockRange, dayReportOf, type ShapedDayReport } from './report.js';
import { DAY_START_S } from './types.js';
import { openWeek } from './week.js';

/**
 * The prefix, derived **here** rather than by calling the module under test.
 *
 * `shift/counterfactual.ts` keeps its own `samePrefix` unexported on purpose: a test that proved
 * the prefix claim by calling the predicate the module refuses on would be asking the code whether
 * it agrees with itself. So this file filters and keys the legs independently, and the module's
 * ground is exercised the other way round — through a pair with one boarding second moved.
 */
function prefixKeysOf(run: VizRecording, pressAtS: number): readonly string[] {
  const key = (leg: VizLeg): string =>
    [
      leg.passengerId,
      String(leg.legIndex ?? 0),
      leg.originFloorId,
      leg.destinationFloorId,
      String(leg.arrivedAt),
      String(leg.boardedAt ?? -1),
      leg.carId ?? '',
    ].join('|');
  return run.legs
    .filter((leg) => leg.boardedAt !== undefined && leg.boardedAt < pressAtS)
    .map(key)
    .sort();
}

/** The sheet's own clock, passed exactly as `shift/report.ts` passes it. */
const clocks = (startS: number, endS: number): string => clockRange(startS, endS, DAY_START_S);

const DURATION_S = 900;
/** Four tenths of the way in — late enough that a prefix exists to compare. */
const PRESS_AT_S = Math.round(DURATION_S * 0.4);
const PRESS: RunInterventionConfig = { atS: PRESS_AT_S, change: { kind: 'spread-cars' } };

/** The other parking verb, run as its own arm — see the end-of-day case below. */
const PARK: RunInterventionConfig = { atS: PRESS_AT_S, change: { kind: 'park-cars-lobby' } };

let unpressed: VizRecording;
let pressed: VizRecording;
let parked: VizRecording;

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  const base: SimulationConfig = {
    ...fixtureConfig(config, {
      buildingId: 'crown-hotel',
      durationS: DURATION_S,
      onTimeout: 'report',
    }),
    demand: { arrivalRatePctPop5min: 14 },
  };
  /*
   * The same config twice, differing only in the log — which is what the shell produces: a press
   * re-simulates the whole day from t = 0 with the log grown by one entry, and the run it replaces
   * is this file's `unpressed`. `core` promises a run with no `interventions` key is byte-identical
   * to one built before the field existed, so the unpressed arm omits it rather than passing `[]`.
   */
  unpressed = recordRun(base, { recordDecisions: false }).recording;
  pressed = recordRun({ ...base, interventions: [PRESS] }, { recordDecisions: false }).recording;
  parked = recordRun({ ...base, interventions: [PARK] }, { recordDecisions: false }).recording;
}, 300_000);

/* -------------------------------------------------------------------------- *
 * The premises — without these every assertion below is vacuous
 * -------------------------------------------------------------------------- */

describe('the pair is a pair', () => {
  it('is the same seed, the same building and the same start', () => {
    expect(pressed.seed).toBe(unpressed.seed);
    expect(pressed.buildingId).toBe(unpressed.buildingId);
    expect(pressed.startedAt).toBe(unpressed.startedAt);
  });

  it('need not end at the same instant, which is why ground 3 is the start and not the end', () => {
    /*
     * The finding that moved ground 3, pinned on the arm that shows it. A run stops when the day
     * has drained rather than at a fixed second, so a press that changes the tail changes the
     * instant: measured here, the unpressed day ends at **981.725 s** and the same day with *park
     * the cars in the lobby* at 360 s ends at **970.319 s**. An earlier draft of this module
     * required `endedAt` equality and would have refused that pair — and every pair like it —
     * while reading perfectly.
     *
     * Both arms are asserted, and that is the point of running two: *spread the cars* on this same
     * day ends at the **same** instant as the unpressed run, so the divergence is a property of a
     * press rather than of every press, and a ground written off one arm would have looked safe.
     */
    expect(parked.endedAt).not.toBe(unpressed.endedAt);
    expect(Math.abs(parked.endedAt - unpressed.endedAt)).toBeLessThan(60);
    expect(pressed.endedAt).toBe(unpressed.endedAt);
    // And the pair the strict ground would have thrown away is produced.
    expect(pressCounterfactualOf(parked, unpressed, [PARK])).toBeDefined();
  });

  it('met the same crowd', () => {
    // `record/crowd.ts`' own assertion, which is non-vacuous by its contract: two empty recordings
    // are explicitly *not* the same crowd.
    expect(sameCrowd(pressed, unpressed)).toBe(true);
  });

  it('is bit-identical before the press, over a prefix that is not empty', () => {
    /*
     * `CLAUDE.md` invariant 2 and the standing requirement together: the two runs share a seed and
     * therefore a stream set, and `core` schedules the change at `atS`, so nothing that fired
     * before the press can observe it. This is that claim checked rather than argued.
     *
     * The non-emptiness assertion is the half that makes it worth running. A press before anybody
     * had boarded would satisfy `samePrefix` over nothing at all.
     */
    const ours = prefixKeysOf(pressed, PRESS_AT_S);
    expect(ours.length).toBeGreaterThan(20);
    expect(prefixKeysOf(unpressed, PRESS_AT_S)).toEqual(ours);
  });

  it('differs after the press, on the legs rather than on a window statistic', () => {
    /*
     * `CLAUDE.md`'s standing requirement in its own words — *move the control and require the run
     * to change, compared on the legs*. Without this the whole file would be comparing a run with
     * itself, and the paired row would be printing one day twice under a sentence saying it was
     * two.
     */
    const boardingsAfter = (run: VizRecording): string =>
      JSON.stringify(
        run.legs
          .filter((leg) => leg.boardedAt !== undefined && leg.boardedAt >= PRESS_AT_S)
          .map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
      );
    expect(boardingsAfter(pressed)).not.toBe(boardingsAfter(unpressed));
  });
});

/* -------------------------------------------------------------------------- *
 * The reading, and the six grounds it refuses on
 * -------------------------------------------------------------------------- */

describe('the reading of the run that was not pressed', () => {
  it('names the press it was taken around, and reports that run’s own two counts', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const then = observationsAt(unpressed, PRESS_AT_S);
    const end = observationsAt(unpressed, pressed.endedAt);
    expect(pair?.pressAtS).toBe(PRESS_AT_S);
    expect(pair?.windowEndS).toBe(pressed.endedAt);
    expect(pair?.standingAtWindowEnd).toBe(end.waitingNow);
    expect(pair?.deliveredInWindow).toBe(end.carried - then.carried);
    expect(pair?.longWaitsByWindowEnd).toBe(end.servedCount - end.servedUnderThresholdCount);
  });

  it('is told apart from the pressed run by the long waits and by nothing else', () => {
    /*
     * The measurement that chose the third figure, kept as a case so it cannot quietly stop being
     * true. On this pinned pair the day drains under both arms, so *standing at the end* and
     * *delivered in the window* are **equal** — and the count of people picked up after a long
     * wait is not. A version of this row carrying only the first two would have printed one day
     * twice; `shift/counterfactual.ts`' header is the argument and this is the run behind it.
     */
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const ours = observationsAt(pressed, pressed.endedAt);
    const oursThen = observationsAt(pressed, PRESS_AT_S);
    // Measured on this pair: 0 standing and 155 delivered under both arms, 4 long waits against 1.
    expect(pair?.standingAtWindowEnd).toBe(ours.waitingNow);
    expect(pair?.deliveredInWindow).toBe(ours.carried - oursThen.carried);
    expect(pair?.longWaitsByWindowEnd).not.toBe(
      ours.servedCount - ours.servedUnderThresholdCount,
    );
  });

  it('reads the partner at this row’s window rather than at the partner’s own end', () => {
    /*
     * The two runs end eleven seconds apart, so this is a real distinction rather than a
     * formality: read at its own end the unpressed run would answer a different question from the
     * one the sentence asks, and the row's *the same two clock times* would be false by a margin
     * no reader could see.
     */
    const pair = pressCounterfactualOf(parked, unpressed, [PARK]);
    const own = observationsAt(unpressed, unpressed.endedAt);
    const ours = observationsAt(unpressed, parked.endedAt);
    expect(pair?.windowEndS).toBe(parked.endedAt);
    expect(pair?.windowEndS).not.toBe(unpressed.endedAt);
    expect(own.atS).not.toBe(ours.atS);
    expect(pair?.standingAtWindowEnd).toBe(ours.waitingNow);
    expect(pair?.longWaitsByWindowEnd).toBe(
      ours.servedCount - ours.servedUnderThresholdCount,
    );
  });

  it('reads the unpressed run and not the pressed one', () => {
    /*
     * The assertion that would have caught the worst defect this module could have: a pair whose
     * figures come from the run the sheet is already reporting reads perfectly and says nothing.
     * At least one of the two figures has to differ between the arms for this to be checkable, so
     * both are compared and the case requires the pair to be distinguishable.
     */
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const pressedEnd = observationsAt(pressed, pressed.endedAt);
    const pressedThen = observationsAt(pressed, PRESS_AT_S);
    const pressedSide = [
      pressedEnd.waitingNow,
      pressedEnd.carried - pressedThen.carried,
      pressedEnd.servedCount - pressedEnd.servedUnderThresholdCount,
    ];
    expect([
      pair?.standingAtWindowEnd,
      pair?.deliveredInWindow,
      pair?.longWaitsByWindowEnd,
    ]).not.toEqual(pressedSide);
  });

  it('answers the last press when there is more than one, keeping the earlier ones', () => {
    const earlier: RunInterventionConfig = { atS: 120, change: { kind: 'spread-cars' } };
    const pair = pressCounterfactualOf(pressed, unpressed, [earlier, PRESS]);
    expect(pair?.pressAtS).toBe(PRESS_AT_S);
    // And the ordering is this module's rather than the caller's.
    expect(pressCounterfactualOf(pressed, unpressed, [PRESS, earlier])).toEqual(pair);
    expect(lastPressInRun(pressed, [PRESS, earlier])?.atS).toBe(PRESS_AT_S);
    expect(pressesInRun(pressed, [PRESS, earlier]).map((entry) => entry.atS)).toEqual([
      120,
      PRESS_AT_S,
    ]);
  });

  it('refuses on a press the run does not contain', () => {
    expect(pressCounterfactualOf(pressed, unpressed, [])).toBeUndefined();
    expect(
      pressCounterfactualOf(pressed, unpressed, [{ atS: pressed.endedAt, change: PRESS.change }]),
    ).toBeUndefined();
  });

  it('refuses a partner from another seed, another tower or another start', () => {
    const alter = (patch: Partial<VizRecording>): VizRecording => ({ ...unpressed, ...patch });
    expect(pressCounterfactualOf(pressed, alter({ seed: '999' }), [PRESS])).toBeUndefined();
    expect(pressCounterfactualOf(pressed, alter({ buildingId: 'elsewhere' }), [PRESS])).toBeUndefined();
    expect(
      pressCounterfactualOf(pressed, alter({ startedAt: unpressed.startedAt + 1 }), [PRESS]),
    ).toBeUndefined();
  });

  it('refuses a partner whose prefix moved, which is the ground that cannot be argued', () => {
    /*
     * One boarding second changed, on a leg that boarded before the press. Everything else — the
     * seed, the building, the span, the crowd — is untouched, so this is the one ground under test
     * and the refusal cannot be coming from another.
     */
    const target = unpressed.legs.find(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt < PRESS_AT_S,
    );
    expect(target).toBeDefined();
    const moved: VizRecording = {
      ...unpressed,
      legs: unpressed.legs.map((leg) =>
        leg === target ? { ...leg, boardedAt: (leg.boardedAt ?? 0) - 1 } : leg,
      ),
    };
    expect(sameCrowd(pressed, moved)).toBe(true);
    expect(prefixKeysOf(moved, PRESS_AT_S)).not.toEqual(prefixKeysOf(pressed, PRESS_AT_S));
    expect(pressCounterfactualOf(pressed, moved, [PRESS])).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The claim the row makes — the half a reviewer cannot check by reading
 * -------------------------------------------------------------------------- */

/**
 * § D900's list, **copied unchanged**. The lane that added the paired arm was forbidden to move a
 * word of it, and copying rather than importing is deliberate: a shared constant edited in one
 * place would weaken both lists at once, and these are two different claims about two different
 * rows.
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

/**
 * The vocabulary of **estimation**, which is what a pair invites and a cause does not.
 *
 * *Better*, *worse* and *worth* rank two configurations, which `CLAUDE.md` permits only behind a
 * paired-t interval excluding zero. *Saves*, *gains* and *costs you* are the same ranking with a
 * size attached. *Would have* is a modal about a world rather than an indicative about a
 * recording — the unpressed run is a run that happened, and the copy says so in the past perfect.
 * *On average*, *typically* and *usually* generalise off one seed, which is the single sentence
 * this whole lane exists not to write.
 *
 * The list is over the row's **whole** text including both notes, so a disclaimer cannot buy the
 * right to use one of these words by negating it: a reader skimming picks up *worth* either way.
 */
const ESTIMATE = [
  'better',
  'worse',
  'worth',
  'saves',
  'saved',
  'saving',
  'improves',
  'gain',
  'costs you',
  'would have',
  'on average',
  'typically',
  'usually',
  'faster',
  'slower',
  'thanks',
] as const;

function rowText(beat: { readonly what: string; readonly why: string } | undefined): string {
  return `${beat?.what ?? ''} ${beat?.why ?? ''}`;
}

/**
 * Whole words, not substrings.
 *
 * Found by a false red: `gain` is inside *again*, and § D900's own disclaimer says *the day was not
 * run again without it*. A substring ban would have failed the **unpaired** row on a word it does
 * not contain, which is a check that fires where there is nothing to fire at — and the fix is a
 * boundary rather than a shorter list.
 */
function says(text: string, phrase: string): boolean {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'u').test(text);
}

describe('the paired row says what kind of claim it is', () => {
  it('prints both runs, at the same two instants and in the same two counts', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const beat = afterPressBeatOf(pressed, [PRESS], clocks, pair);
    const end = observationsAt(pressed, pressed.endedAt);
    const then = observationsAt(pressed, PRESS_AT_S);
    // The day the player played.
    expect(beat?.why).toContain(`${String(end.waitingNow)} people were standing when the day ended`);
    expect(beat?.why).toContain(
      `${String(end.carried - then.carried)} people were delivered between those two clock times`,
    );
    // And the day they did not.
    expect(beat?.why).toContain('had also been run without that press and with nothing else changed');
    expect(beat?.why).toContain('read at those same two clock times, that run had');
    expect(beat?.why).toContain(
      `${String(pair?.standingAtWindowEnd)} people standing at the landings`,
    );
    expect(beat?.why).toContain(
      `had delivered ${String(pair?.deliveredInWindow)} people between them`,
    );
    // And the third figure, on both sides, against a mark the row names and never prints.
    const ours = observationsAt(pressed, pressed.endedAt);
    expect(beat?.why).toContain(
      `${String(ours.servedCount - ours.servedUnderThresholdCount)} people had been picked up ` +
        "after a wait past the run's own long-wait mark",
    );
    expect(beat?.why).toContain(
      `had picked up ${String(pair?.longWaitsByWindowEnd)} person after a wait past that same mark`,
    );
  });

  it('closes with the pair note and retires § D900’s refusal, which has stopped being true', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const beat = afterPressBeatOf(pressed, [PRESS], clocks, pair);
    expect(beat?.why).toContain(AFTER_PRESS_PAIR_NOTE);
    /*
     * The half worth failing on. § D900's line says *the day was not run again without it, so
     * nothing here measures the change* — beside a figure off the run without it, that is a stale
     * refusal (§ D227), which this repository holds to be worse than a stale seam because it tells
     * the reader not to look.
     */
    expect(beat?.why).not.toContain(AFTER_PRESS_DISCLAIMER);
    expect(beat?.why).not.toContain('the day was not run again without it');
  });

  it('carries the five clauses the note exists for, each asserted for what it says', () => {
    expect(AFTER_PRESS_PAIR_NOTE).toContain('two runs of one day');
    expect(AFTER_PRESS_PAIR_NOTE).toContain('a single replication');
    expect(AFTER_PRESS_PAIR_NOTE).toContain('on another day');
    expect(AFTER_PRESS_PAIR_NOTE).toContain('The bench is where');
    /*
     * The fifth — § D982. Two verdicts from one crowd say nothing about another crowd, **even in
     * this tower**, which is the half a player on a pinned day most needs: that day was chosen for
     * its flip, and `pressLadder.test.ts` runs a second crowd on the same tower where the same press
     * does the opposite.
     */
    expect(AFTER_PRESS_VERDICT_NOTE).toContain('The two verdicts are the same kind of fact as the counts');
    expect(AFTER_PRESS_VERDICT_NOTE).toContain('nothing about how a day is graded for any other crowd');
    expect(AFTER_PRESS_VERDICT_NOTE).toContain('even in this tower');
    // And no figure at all, exactly as § D900's disclaimer carries none.
    expect(/\d/u.test(AFTER_PRESS_PAIR_NOTE)).toBe(false);
    expect(/\d/u.test(AFTER_PRESS_VERDICT_NOTE)).toBe(false);
    // Nor any word the no-difference case bans across the row, which the clause is part of.
    for (const word of ['fewer', 'more', 'difference', 'instead', 'rather than', 'compared']) {
      expect(says(AFTER_PRESS_VERDICT_NOTE.toLowerCase(), word), word).toBe(false);
    }
  });

  it('uses no causal verb — § D900’s list, unchanged and unmoved', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    for (const change of [PRESS.change, { kind: 'park-cars-lobby' } as const]) {
      const beat = afterPressBeatOf(pressed, [{ atS: PRESS_AT_S, change }], clocks, pair);
      const whole = rowText(beat).toLowerCase();
      for (const word of CAUSAL) {
        expect(whole.includes(word), `the paired row says "${word}": ${whole}`).toBe(false);
      }
      for (const word of ESTIMATE) {
        expect(says(whole, word), `the paired row says "${word}": ${whole}`).toBe(false);
      }
    }
  });

  it('uses no word of estimation or ranking either — the list a pair needs', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const beat = afterPressBeatOf(pressed, [PRESS], clocks, pair);
    const whole = rowText(beat).toLowerCase();
    for (const word of ESTIMATE) {
      expect(says(whole, word), `the paired row says "${word}": ${whole}`).toBe(false);
    }
  });

  it('states no difference between the two runs, only the two runs', () => {
    /*
     * The line that separates this row from the one § D900 refused. A difference is a **quantity**,
     * and a quantity off one replication is an estimate: `CLAUDE.md` gives no licence for one
     * without a paired-t interval excluding zero at 50–200 replications, and nothing about this
     * pair is that. So the sheet prints two runs; the reader may subtract.
     *
     * Asserted two ways rather than one, because either alone is weak: no word of subtraction
     * anywhere in the row, and neither arithmetic difference appears as a figure in it. The second
     * is written to skip the degenerate case where a difference of zero collides with a count that
     * is honestly zero.
     */
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const beat = afterPressBeatOf(pressed, [PRESS], clocks, pair);
    const whole = rowText(beat);
    for (const word of ['fewer', 'more', 'difference', 'instead', 'rather than', 'compared']) {
      expect(says(whole.toLowerCase(), word), `the row says "${word}"`).toBe(false);
    }
    const end = observationsAt(pressed, pressed.endedAt);
    const then = observationsAt(pressed, PRESS_AT_S);
    const ourSide = [
      end.waitingNow,
      end.carried - then.carried,
      end.servedCount - end.servedUnderThresholdCount,
    ];
    const theirSide = [
      pair?.standingAtWindowEnd ?? -1,
      pair?.deliveredInWindow ?? -1,
      pair?.longWaitsByWindowEnd ?? -1,
    ];
    /*
     * The six figures the row is entitled to print. A gap that happens to equal one of them is not
     * evidence that a difference was printed — on this pair the long-wait gap is 3 and the
     * unpressed run's own long-wait count is 1, so a blunter check would fail on a figure that is
     * a reading. This is the honest formulation and it was written after the blunt one fired.
     */
    const readings = new Set([...ourSide, ...theirSide]);
    const gaps = ourSide
      .map((ours, index) => Math.abs(ours - (theirSide[index] ?? 0)))
      .filter((gap) => gap > 0 && !readings.has(gap));
    expect(
      ourSide.some((ours, index) => ours !== theirSide[index]),
      'the two runs differ on at least one of the three counts',
    ).toBe(true);
    for (const gap of gaps) {
      expect(
        new RegExp(`\\b${String(gap)} (people|person)\\b`, 'u').test(whole),
        `the row prints ${String(gap)} people, which is a difference rather than a reading`,
      ).toBe(false);
    }
  });

  it('gives every figure the cohort it is over — § D900’s rule, on the longer row', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const beat = afterPressBeatOf(
      pressed,
      [{ atS: 120, change: { kind: 'spread-cars' } }, PRESS],
      clocks,
      pair,
    );
    const whole = rowText(beat);
    for (const match of whole.matchAll(/\d+(?<unit>[^\d]{0,16})/gu)) {
      const unit = match.groups?.['unit'] ?? '';
      expect(/ (people|person|earlier press)/u.test(unit), `"${match[0]}" names no cohort`).toBe(true);
    }
  });

  it('carries no mean and no estimate — R3 and R13 have nothing to catch', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const whole = rowText(afterPressBeatOf(pressed, [PRESS], clocks, pair)).toLowerCase();
    for (const cue of ['average', 'mean', 'typical', 'per ride', 'withheld', ' s ']) {
      expect(whole.includes(cue), `the paired row says "${cue}"`).toBe(false);
    }
  });
});

describe('a day with no pair draws § D900’s row, word for word', () => {
  it('falls back rather than degrading when the counterfactual is absent', () => {
    const beat = afterPressBeatOf(pressed, [PRESS], clocks, undefined);
    expect(beat?.why).toContain(AFTER_PRESS_DISCLAIMER);
    expect(beat?.why).not.toContain(AFTER_PRESS_PAIR_NOTE);
    expect(beat?.why).not.toContain('had also been run');
    /*
     * And the third figure does not leak on to the unpaired arm. § D900's row is byte-identical to
     * what it shipped — a lone long-wait count with nothing to read it against would be a new
     * figure on a row this lane was told to leave standing.
     */
    expect(beat?.why).not.toContain('long-wait mark');
    expect(afterPressBeatOf(pressed, [PRESS], clocks, undefined)).toEqual(
      afterPressBeatOf(pressed, [PRESS], clocks),
    );
  });

  it('falls back when the pair was taken around a different press', () => {
    // Belt and braces on `afterPress.ts`' seventh ground: a pair whose window is not this row's.
    const stale = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const other: RunInterventionConfig = { atS: PRESS_AT_S + 60, change: PRESS.change };
    const beat = afterPressBeatOf(pressed, [other], clocks, stale);
    expect(beat?.why).toContain(AFTER_PRESS_DISCLAIMER);
    expect(beat?.why).not.toContain('had also been run');
  });
});

/* -------------------------------------------------------------------------- *
 * On the sheet — the half a unit cannot show
 * -------------------------------------------------------------------------- */

/** The sheet a player reads for `run`, filed with `pair` — or without one. */
function sheetOf(
  run: VizRecording,
  interventions: readonly RunInterventionConfig[],
  pair: ReturnType<typeof pressCounterfactualOf>,
  subject: 'week-day' | 'single-run' = 'week-day',
): ShapedDayReport {
  return dayReportOf({
    recording: run,
    observations: shiftObservationsOf(observationsAt(run, run.endedAt)),
    goals: goalsForDay(4),
    week: { ...openWeek('c2'), day: 4, dayIdx: 3 },
    contract: contractById('c2'),
    event: SHIFT_EVENTS.ordinary,
    plan: { shiftLengthS: DURATION_S, windowStartS: null, patternId: 'building' },
    calendar: null,
    subject:
      subject === 'week-day'
        ? { kind: 'week-day' }
        : {
            kind: 'single-run',
            selection: {
              demandTemplateId: 'constant-iso',
              arrivalRatePctPop5min: 14,
              durationS: DURATION_S,
            },
          },
    interventions,
    pressCounterfactual: pair,
  });
}

function afterPressRowOf(report: ShapedDayReport): ShapedDayReport['diagnosis'][number] | undefined {
  return report.diagnosis.find((candidate) => candidate.id === AFTER_PRESS_ROW_ID);
}

/* -------------------------------------------------------------------------- *
 * Both runs' verdicts — § D982, amending § D931 clause 3
 * -------------------------------------------------------------------------- */

/**
 * **The vocabulary that connects two verdicts** — the decision agent's list, § D982.
 *
 * A pair of verdicts invites a third claim that neither the counts nor the note makes: that the
 * press *decided*, *rescued* or *turned* the day, or that the day *would* have gone the other way.
 * Each of these connects the two verdicts into a story about the press; the row prints two facts
 * side by side and leaves any connection to the reader. § D900's causal list and § D931's
 * estimation list stay exactly as they were beside it.
 */
const CONNECTS = [
  'decided',
  'decides',
  'decisive',
  'rescued',
  'rescue',
  'flipped',
  'turned',
  'won',
  'lost',
  'either way',
  'anyway',
  'still',
  'same verdict',
  'changed the verdict',
  'if you had',
  'would',
  'could have',
] as const;

/** A press may never be the subject of *clears* or *misses* — within three words of it. */
const PRESS_AS_SUBJECT =
  /\bpress(es)?\b(\W+\w+){0,3}\W+(clear|clears|cleared|miss|misses|missed)\b/iu;

describe('the paired row prints both runs’ verdicts, from the sheet’s own grader', () => {
  it('prints this run’s banner and the unpressed run’s, each as that run’s own sheet words it', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const ours = sheetOf(pressed, [PRESS], pair);
    /*
     * One source, both sides. The pressed side is the banner of the sheet the row sits on; the
     * unpressed side is the banner the **unpressed run's own sheet** carries against the same goals
     * — graded at its own end, over its own whole day — which is why it is read off a sheet of that
     * recording rather than off the pair's window.
     */
    const theirs = sheetOf(unpressed, [], undefined);
    const why = afterPressRowOf(ours)?.why ?? '';
    expect(why).toContain(`this run reads ${ours.verdictLine}`);
    expect(why).toContain(`the run without that press, over its own whole day, reads ${theirs.verdictLine}`);
    expect(why).toContain(AFTER_PRESS_VERDICT_NOTE);
  });

  it('names a missed run’s missed goals with no digit, and names none for a run that did not miss', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const ours = sheetOf(pressed, [PRESS], pair);
    const theirs = sheetOf(unpressed, [], undefined);
    const why = afterPressRowOf(ours)?.why ?? '';
    for (const [sheet, lead] of [
      [ours, 'this run reads '],
      [theirs, 'over its own whole day, reads '],
    ] as const) {
      const missed = sheet.goals.filter((line) => line.reading.state === 'missed');
      const clause = why.slice(why.indexOf(lead) + lead.length).split(/[;.]/u)[0] ?? '';
      if (sheet.verdict === 'missed') {
        expect(clause.startsWith(`${sheet.verdictLine} on the `), clause).toBe(true);
        expect(clause.split(' goal').length - 1, clause).toBe(missed.length);
      } else {
        expect(clause).toBe(sheet.verdictLine);
      }
      // A goal's name carries no bar: no digit, no unit.
      expect(/\d/u.test(clause), clause).toBe(false);
    }
  });

  it('never states the unpressed verdict anywhere but on that row', () => {
    /*
     * The ruling's rule 5. With a pair and without one, the banner, the lede, the headline, the
     * goals and every other diagnosis row are identical — only the after-press row moves, it stays
     * untoned, and it stays last, because `render/reportCard.ts` draws `diagnosis[0]`.
     */
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const withPair = sheetOf(pressed, [PRESS], pair);
    const without = sheetOf(pressed, [PRESS], undefined);
    expect(withPair.verdictLine).toBe(without.verdictLine);
    expect(withPair.lede).toBe(without.lede);
    expect(withPair.headlineFigureId).toBe(without.headlineFigureId);
    expect(withPair.goals).toEqual(without.goals);
    expect(withPair.figures).toEqual(without.figures);
    expect(withPair.diagnosis.filter((row) => row.id !== AFTER_PRESS_ROW_ID)).toEqual(
      without.diagnosis.filter((row) => row.id !== AFTER_PRESS_ROW_ID),
    );
    expect(afterPressRowOf(withPair)?.tone).toBe('plain');
    expect(withPair.diagnosis[withPair.diagnosis.length - 1]?.id).toBe(AFTER_PRESS_ROW_ID);
  });

  it('uses no word that connects the two verdicts, and never makes a press their subject', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const parkedPair = pressCounterfactualOf(parked, unpressed, [PARK]);
    const rows = [
      afterPressRowOf(sheetOf(pressed, [PRESS], pair)),
      afterPressRowOf(sheetOf(parked, [PARK], parkedPair)),
      afterPressRowOf(sheetOf(pressed, [{ atS: 120, change: { kind: 'spread-cars' } }, PRESS], pair)),
    ];
    for (const row of rows) {
      const whole = rowText(row).toLowerCase();
      expect(whole).toContain('reads shift');
      for (const word of CONNECTS) {
        expect(says(whole, word), `the paired row says "${word}": ${whole}`).toBe(false);
      }
      expect(PRESS_AS_SUBJECT.test(whole), whole).toBe(false);
      for (const word of CAUSAL) expect(whole.includes(word), word).toBe(false);
      for (const word of ESTIMATE) expect(says(whole, word), word).toBe(false);
      for (const cue of ['average', 'mean', 'typical', 'per ride', 'withheld', ' s ']) {
        expect(whole.includes(cue), cue).toBe(false);
      }
    }
  });

  it('would catch a press made the subject of a verdict — the pattern is not vacuous', () => {
    expect(PRESS_AS_SUBJECT.test('your press cleared the day')).toBe(true);
    expect(PRESS_AS_SUBJECT.test('the press at nine missed it')).toBe(true);
    expect(
      PRESS_AS_SUBJECT.test('the run without that press, over its own whole day, reads Shift missed'),
    ).toBe(false);
  });

  it('prints no verdict on a single-run sheet, whose banner refuses to grade', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const why = afterPressRowOf(sheetOf(pressed, [PRESS], pair, 'single-run'))?.why ?? '';
    expect(why).toContain('had also been run without that press');
    expect(why).toContain(AFTER_PRESS_PAIR_NOTE);
    expect(why).not.toContain(AFTER_PRESS_VERDICT_NOTE);
    for (const line of ['Shift cleared', 'Shift missed', 'Too quiet to grade']) {
      expect(why).not.toContain(line);
    }
  });
});

describe('the sheet', () => {
  const sheet = (pair: ReturnType<typeof pressCounterfactualOf>): ShapedDayReport =>
    sheetOf(pressed, [PRESS], pair);

  it('draws the pair on the row the log names, and the section keeps its shape', () => {
    const pair = pressCounterfactualOf(pressed, unpressed, [PRESS]);
    const drawn = sheet(pair);
    expect(drawn.diagnosis.map((row) => row.id)).toEqual([
      'peak-queue',
      'peak-phase',
      AFTER_PRESS_ROW_ID,
    ]);
    const row = drawn.diagnosis.find((candidate) => candidate.id === AFTER_PRESS_ROW_ID);
    expect(row?.why).toContain(AFTER_PRESS_PAIR_NOTE);
    expect(row?.when).toBe(clockRange(PRESS_AT_S, pressed.endedAt, DAY_START_S));
    // Never toned: a press is not a fault, and a red edge under a sentence that claims no cause
    // would say in colour what the words refuse to say.
    expect(row?.tone).toBe('plain');
  });

  it('draws § D900’s row through the same call when no pair is passed', () => {
    const row = sheet(undefined).diagnosis.find(
      (candidate) => candidate.id === AFTER_PRESS_ROW_ID,
    );
    expect(row?.why).toContain(AFTER_PRESS_DISCLAIMER);
  });
});
