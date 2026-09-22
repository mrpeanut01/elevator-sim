/**
 * **The day run without the press** — GitHub issue **#581** route 1, and
 * [§ D931](../../../../DECISIONS.md).
 *
 * ## What [§ D900](../../../../DECISIONS.md) settled, and the half it did not consider
 *
 * `shift/afterPress.ts` states what the day did after the player's press and says, in the copy,
 * that nothing there measures the press. That refusal was reached on this repository's statistical
 * rule rather than on cost: a with-and-without pair on one seed is **one replication**, and
 * `CLAUDE.md` forbids declaring a difference without a paired-t interval excluding zero at 50–200
 * replications. **That reasoning is correct about declaring a difference, and that is the whole of
 * what it settles.**
 *
 * What it did not weigh is that two of this product's own screens already draw a single-seed pair
 * and are honest doing it. The tutorial runs both arms on one seed and prints *7 over-minute waits
 * → 0*. `fixit/run.ts` plays an as-built and a repaired recording at one playhead. Neither claims a
 * general effect, and neither needs 50 replications, because **a pair of runs is a fact about two
 * runs**. It becomes an *estimate* only when somebody reads it as one, and what stops that is the
 * sentence beside it rather than the sample size.
 *
 * So the distinction this module is built on, stated once:
 *
 * | claim | what it needs |
 * |---|---|
 * | *spreading the cars is worth 88 s* | a paired-t interval excluding zero, 50–200 replications |
 * | *this run ended with 0 standing; the run without that press ended with 5* | two runs |
 *
 * The first is forbidden here and nothing in `shift/afterPress.ts` may imply it. The second is
 * what this module supplies.
 *
 * ## The run without the press is not simulated here, because it has already been simulated
 *
 * #581 and this lane's brief both assume a re-run — *the day re-simulates in under two seconds*.
 * It does, and it is not needed. `dev/main.ts#runShift` re-simulates the **whole day from t = 0**
 * every time the player presses a mid-run control, with the intervention log grown by one entry
 * (`ENGINE_CONTRACT` § 1.4). The recording on screen immediately before that press is therefore a
 * complete run of the same day, from the same seed, with the log one entry shorter — exactly the
 * counterfactual, already in hand, and already asserted against the pressed run by
 * `record/crowd.ts#assertSameCrowd` at `dev/main.ts#applyShift`. This module reads that pair; the
 * shell holds it (`dev/main.ts`'s `unpressedRecording`) instead of discarding it.
 *
 * Two consequences worth stating. The counterfactual costs **no simulation and no worker round
 * trip**, so nothing about the sheet's latency changes. And the pair is exact by construction
 * rather than by a re-derivation that could drift: it is the run the player watched.
 *
 * The press that is taken out is the **last** one, and the earlier presses stay in. That is not a
 * convenience either: it is the only removal for which the prefix claim below can be true, and it
 * is the press `shift/afterPress.ts` names.
 *
 * ## Six grounds for refusing, and a refusal draws § D900's line instead
 *
 * {@link pressCounterfactualOf} answers `undefined` unless every one of these holds, and a day
 * that cannot show a pair shows the row § D900 shipped, word for word. A wrong pair is worse than
 * no pair, because the row's whole value is that the two runs differ in one thing.
 *
 * 1. **The same seed.** `CLAUDE.md` invariant 2 — two runs that do not share a seed do not share a
 *    stream set, and their difference is the generator's rather than the press's.
 * 2. **The same building.**
 * 3. **The same start.** `startedAt`, and **not** `endedAt` — which was the first version of this
 *    ground and was wrong, in a way worth recording because it would have made the whole feature
 *    fire on almost nothing. A run stops when the day has drained rather than at a fixed second,
 *    so a press that changes the tail changes the instant: measured on this module's own pinned
 *    day (`crown-hotel`, 900 s, 14 %), the unpressed run ends at **981.725 s** and the same day
 *    with *park the cars in the lobby* at 360 s ends at **970.319 s**. Requiring them equal would
 *    have refused a legitimate pair eleven seconds apart. And it would have looked safe if it had
 *    been written off one arm: *spread the cars* on that same day ends at the **same** instant, so
 *    the divergence is a property of a press rather than of every press. Both arms are run in
 *    `counterfactual.test.ts`. The window is closed by **one** instant instead — see below.
 * 4. **The same crowd**, by `record/crowd.ts#sameCrowd` — the assertion three shipped surfaces
 *    already make, non-vacuous by that module's own contract.
 * 5. **A bit-identical prefix**: every leg that boarded before the press is present on both sides
 *    with the same passenger, the same car, the same boarding second and the same route, in both
 *    directions. This is the claim *nothing but the press differs* reduced to something a machine
 *    can check, and it is checked at the moment it is claimed rather than argued in a docstring.
 * 6. **A press inside the run**, strictly before its end.
 *
 * Ground 5 is **vacuously true for a press before anybody has boarded**, and that is allowed
 * rather than papered over: the pair is still the same seed and the same crowd, ground 4 is
 * non-vacuous by construction, and refusing a legitimate early press would be a bound moved to
 * make a check look strong. `counterfactual.test.ts` pins both halves — that a real pair passes
 * with a non-empty prefix, and that a fabricated prefix difference is refused.
 *
 * ## One window, taken from the run the row is about
 *
 * Both readings are taken at the **pressed** run's own two instants: the press, and that run's end.
 * The unpressed run is read at those same two clock times rather than at its own end, so the row's
 * *between the same two clock times* is literally true rather than nearly true. Reading each run at
 * its own end would have put two windows of different lengths in one sentence — a difference of
 * eleven seconds on the pair above, which is small, invisible, and exactly the kind of thing a
 * reader has no way to discover.
 *
 * `observationsAt` is total in `t`, so a partner that had already finished is read in its settled
 * state and a partner still running is read where it had got to. Both are honest answers to *what
 * had happened by this clock time*, which is the question the sentence asks.
 *
 * ## The third figure is the one that does the work, and it was chosen by measurement
 *
 * The first draft carried two counts — people standing at the end, people delivered in the window
 * — mirroring the row's own sentence. Measured on the pinned pair, **both are identical in the two
 * arms**: `crown-hotel`, 900 s, 14 %, *spread the cars* at 360 s reads `0 standing / 155 delivered`
 * with the press and `0 standing / 155 delivered` without it. The reason is structural rather than
 * unlucky: on a day that drains, everybody is served and nobody is left standing whatever the cars
 * do, so those two counts cannot tell the arms apart and the row would have printed one day twice.
 *
 * What does tell them apart on that pair is **how long people stood**: 4 people picked up after a
 * wait past the run's own long-wait mark with the press, **1** without it (and the longest single
 * wait 123.3 s against 82.4 s). So {@link PressCounterfactual.longWaitsByWindowEnd} is carried,
 * and it is the tutorial's own figure — *7 over-minute waits → 0* — in this row's vocabulary.
 *
 * It is a **count of people**, which is why it is this and not the longest wait: a duration on
 * this row would be the first figure here that is not a headcount, and the mark it is taken
 * against is named rather than printed, so the row carries no digit whose cohort is not people.
 * The mark itself is `summary.longWaitThresholdS`, the run's own — 60 s on every shipped building
 * and not assumed anywhere — and the sheet's figure grid four inches up is where a reader meets
 * its value, which is one source rather than two.
 *
 * ## What this module deliberately does not compute
 *
 * **The difference.** Neither figure is subtracted from its partner, here or in the copy
 * `shift/afterPress.ts` builds from it. The two runs are printed and the reader may subtract; a
 * *difference* printed on a sheet is a quantity, and a quantity off one replication is the
 * estimate this repository refuses. **No verdict**, either: the two runs' `Shift cleared` /
 * `Shift missed` lines are available (§ D871 quotes exactly that pair for one seed) and are the
 * shortest route from a true pair to *my press decides the day*. **No mean and no duration**:
 * every figure here is a count of people, so R3's `suppressed-mean` class has nothing to sit
 * beside and R13 has no estimate to catch, which is `shift/afterPress.ts`' first rule kept rather
 * than re-argued.
 */

import type { RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import { sameCrowd } from '../record/crowd.js';

/**
 * The readings of the run that was **not** pressed, taken at the same two instants the pressed
 * run's row reports.
 *
 * Three counts of people and nothing else — see the header for why the third one is carried, why
 * it is a headcount rather than the longest wait, and why no difference between the two runs is
 * computed anywhere.
 */
export interface PressCounterfactual {
  /** The press that was taken out, so a renderer and a test name the same second. */
  readonly pressAtS: SimTime;
  /** The other end of the window — the **pressed** run's last instant. See the header. */
  readonly windowEndS: SimTime;
  /** People standing at a landing in the unpressed run at {@link windowEndS}. */
  readonly standingAtWindowEnd: number;
  /** People delivered in the unpressed run between {@link pressAtS} and {@link windowEndS}. */
  readonly deliveredInWindow: number;
  /**
   * People the unpressed run had picked up, by {@link windowEndS}, after a wait past that run's
   * own `longWaitThresholdS` — the figure that tells the two arms apart. See the header.
   */
  readonly longWaitsByWindowEnd: number;
}

/** The part of a recording this module's span and identity grounds read. */
type RunSpan = Pick<VizRecording, 'startedAt' | 'endedAt'>;

/**
 * The last press this recording could report on, or `undefined` when there is none.
 *
 * Owned here rather than in `shift/afterPress.ts` so that the row and the pair cannot disagree
 * about *which press*, and so that `dev/main.ts` can ask the same question without a third copy of
 * the ordering. In-run and strictly before the end, for `afterPressBeatOf`'s stated reason: a press
 * at `endedAt` has no window after it.
 *
 * The sort is held here rather than inherited from the log's authored order, which is
 * `afterPressBeatOf`'s own argument — the claim is *the last press*, and a claim held by the
 * caller's ordering is a claim nothing checks.
 */
export function lastPressInRun(
  recording: RunSpan,
  interventions: readonly RunInterventionConfig[],
): RunInterventionConfig | undefined {
  const ordered = pressesInRun(recording, interventions);
  return ordered[ordered.length - 1];
}

/** This run's presses, in time order — the row's *earlier presses* denominator, and its subject. */
export function pressesInRun(
  recording: RunSpan,
  interventions: readonly RunInterventionConfig[],
): readonly RunInterventionConfig[] {
  return interventions
    .filter((entry) => entry.atS >= recording.startedAt && entry.atS < recording.endedAt)
    .sort((a, b) => a.atS - b.atS);
}

/**
 * Everything about a leg that was settled before `pressAtS`.
 *
 * `alightedAt` is in the key only when the alighting itself happened before the press: a rider who
 * boarded at 08:10 and is still in the car at the press may legitimately be let out somewhere else
 * afterwards, because that is a decision the press is entitled to change. Including it
 * unconditionally would make ground 5 refuse every real pair, which is the shape of a check that is
 * strict and useless.
 */
function settledKeyOf(leg: VizLeg, pressAtS: SimTime): string {
  const alighted = leg.alightedAt !== undefined && leg.alightedAt < pressAtS ? leg.alightedAt : -1;
  return [
    leg.passengerId,
    String(leg.legIndex ?? 0),
    leg.originFloorId,
    leg.destinationFloorId,
    leg.finalDestinationFloorId ?? leg.destinationFloorId,
    String(leg.arrivedAt),
    String(leg.boardedAt ?? -1),
    leg.carId ?? '',
    String(alighted),
  ].join('|');
}

/** The legs whose boarding was decided before the press — the prefix ground 5 compares. */
function prefixLegsOf(recording: VizRecording, pressAtS: SimTime): readonly VizLeg[] {
  return recording.legs.filter((leg) => leg.boardedAt !== undefined && leg.boardedAt < pressAtS);
}

/**
 * Whether everything that had happened by `pressAtS` is identical in both runs — ground 5.
 *
 * Both directions, by multiset: a leg on one side with no partner on the other is a difference
 * whichever side it is on, and a duplicated leg is a difference too.
 *
 * **Deliberately not exported, and the test is stronger for it.** `counterfactual.test.ts` proves
 * the prefix claim with a filter and a key of its own rather than by calling this predicate, so a
 * bug here cannot certify itself; the ground is then exercised through
 * {@link pressCounterfactualOf} on a pair with one boarding second moved. An export whose only
 * caller is a test is the shape `deadCode.test.ts` exists to catch, and it would have bought a
 * weaker assertion.
 */
function samePrefix(left: VizRecording, right: VizRecording, pressAtS: SimTime): boolean {
  const counts = new Map<string, number>();
  for (const leg of prefixLegsOf(left, pressAtS)) {
    const key = settledKeyOf(leg, pressAtS);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const leg of prefixLegsOf(right, pressAtS)) {
    const key = settledKeyOf(leg, pressAtS);
    const seen = counts.get(key);
    if (seen === undefined || seen === 0) return false;
    counts.set(key, seen - 1);
  }
  for (const remaining of counts.values()) if (remaining !== 0) return false;
  return true;
}

/**
 * The pair, or `undefined` on any of the six grounds in the header.
 *
 * `pressed` is the run on screen and `unpressed` is the run that was on screen before the last
 * press — see the header for why the second is already in hand. The order of the arguments is the
 * order of the sentence: the day the player played, and the day they did not.
 */
export function pressCounterfactualOf(
  pressed: VizRecording,
  unpressed: VizRecording,
  interventions: readonly RunInterventionConfig[],
): PressCounterfactual | undefined {
  const last = lastPressInRun(pressed, interventions);
  if (last === undefined) return undefined; // ground 6
  if (pressed.seed !== unpressed.seed) return undefined; // ground 1
  if (pressed.buildingId !== unpressed.buildingId) return undefined; // ground 2
  if (pressed.startedAt !== unpressed.startedAt) return undefined; // ground 3
  if (!sameCrowd(pressed, unpressed)) return undefined; // ground 4
  if (!samePrefix(pressed, unpressed, last.atS)) return undefined; // ground 5

  const then = observationsAt(unpressed, last.atS);
  const end = observationsAt(unpressed, pressed.endedAt);
  return {
    pressAtS: last.atS,
    windowEndS: pressed.endedAt,
    standingAtWindowEnd: end.waitingNow,
    /*
     * Clamped at zero on `afterPressBeatOf`'s own ground: `carried` is non-decreasing in `t` by
     * construction, so a negative here would be a record whose legs are not sorted, and a sheet
     * printing `-3 people delivered` reports a defect in a vocabulary the player cannot act on.
     */
    deliveredInWindow: Math.max(0, end.carried - then.carried),
    /*
     * The run's own mark, never 60: `observationsAt` reads `summary.longWaitThresholdS` and a
     * building that counts a long wait at 45 s is counted at 45. Clamped for `deliveredInWindow`'s
     * reason — both counters are non-decreasing by construction, and a negative headcount on a
     * sheet reports a defect in a vocabulary the player cannot act on.
     */
    longWaitsByWindowEnd: Math.max(0, end.servedCount - end.servedUnderThresholdCount),
  };
}
