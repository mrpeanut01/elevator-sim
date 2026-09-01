/**
 * **§ 7.6's handover against the run it claims to reach** — GitHub issue **#171**.
 *
 * ## The one thing this file is for
 *
 * `CLAUDE.md`'s standing requirement is *move the control and require the run to change, compared on
 * the legs rather than on a window statistic*, and this lane is the polarity that requirement is
 * least often pointed at: not a behaviour with no caller, but a behaviour in `core` — three
 * intervention kinds, all simulated, replayed and tested — that no shipped Everyday surface could
 * reach. A picker and a button that appended an entry nothing acted on would pass every other check
 * this repository runs, and the screen would look right.
 *
 * So the change under test is **the row the stage's own model builds**, not one composed here:
 * `stageInterventionsOf` is asked for its arms exactly as `everyday/stageScreen.ts` asks, the
 * handover row's `change` is taken off it, and that is what is appended to the run. If the row ever
 * stops carrying the target profile, or carries a different one, these cases fail rather than
 * quietly measuring something the screen does not draw.
 *
 * ## The cell, and why it is this one
 *
 * `midtown-office`, a 900 s shift, seed `20260804`, `collective` handing to `nearest-car` at
 * `atS = 300`. Every clause of that was chosen against a specific way this measurement can be
 * vacuous, and the wave that ran before this one lost a mutation to exactly that: a handover at a
 * moment when the two dispatchers would decide identically proves nothing.
 *
 * - **The two dispatchers score on orthogonal terms.** `collective` is `waitTime: 1` and
 *   `nearest-car` is `distanceTravelled: 1` — not a re-weighting of one vector but a different
 *   question about every car, so they disagree from the first decision after the stamp.
 * - **The stamp lands before the peak.** The day's demand runs `FILLING` 0–375 s, `PEAK` 375–525 s,
 *   `EASING` 525–900 s. At 300 s only **55** of the day's **433** boardings have happened, so 87 %
 *   of the day is still ahead of the press.
 * - **And the cell was chosen by measuring where it stops biting rather than by assuming it does
 *   not.** The recording runs to ~1 853 s — long past the demand window, because the queue drains
 *   after the last arrival — and a handover late in *that* window changes nothing at all: by then
 *   every remaining boarding is already committed. {@link LATE_IS_INERT} is that state, asserted
 *   rather than described, because it is the shape a lazily-picked instant would have had and the
 *   reason this file's positive result is not luck.
 *
 * ## What is asserted, and why the prefix is the harder half
 *
 * The acceptance clause is a determinism claim: *the figures before that moment are identical*. It
 * is invariants 2, 4 and 5 read out loud — every draw comes from a named stream on the injected
 * `StreamSet`, ties break by `(time, sequenceNumber)`, and the record carries its seed — so a
 * re-simulation from `t = 0` reproduces the prefix byte for byte and only the future moves. `core`
 * pins that at the engine (`sim/interventions.test.ts`); what is unpinned until here is that the
 * **shipped viewer path** preserves it, because `shiftRunConfigOf` rebuilds the whole run config
 * around the log and a field that moved with it would break the prefix without `core` noticing.
 */

import { describe, expect, it } from 'vitest';

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import { profileById, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { baseState, RESOURCES } from '../scope/probes.test-helper.js';
import { stageInterventionsOf, STAGE_SWITCH_NO_CHANGE } from './stageScreenModel.js';

/* -------------------------------------------------------------------------- *
 * The operating point
 * -------------------------------------------------------------------------- */

const AT = Object.freeze({
  buildingId: 'midtown-office',
  shiftLengthS: 900,
  driving: 'collective',
  handTo: 'nearest-car',
  /** Inside `FILLING`, before the peak — see the module docstring for why the instant matters. */
  atS: 300,
});

function stageState(): ViewerState {
  return {
    ...baseState(),
    buildingId: AT.buildingId,
    shiftLengthS: AT.shiftLengthS,
    dispatcherId: AT.driving,
  };
}

/**
 * One leg, as the thing two runs are compared on — never a window statistic.
 *
 * § D177's own words: *a mean can be unchanged for a run that is entirely different, and a mean can
 * move because the window moved.* Who boarded which car when is neither.
 */
type LegKey = readonly [passengerId: string, carId: string, boardedAt: number];

function legsOf(state: ViewerState): readonly LegKey[] {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1] as const);
}

function endOfRun(state: ViewerState): number {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  }).recording.endedAt;
}

/**
 * The handover the **screen** offers, taken off the model rather than written here.
 *
 * This is what makes the file a test of the shipped control instead of a test of `core`: the row
 * carries the whole profile, and the row is the thing `everyday/stageScreen.ts` presses.
 */
function handoverFrom(state: ViewerState, targetId: string, atS: number): RunInterventionConfig {
  const target = profileById(RESOURCES, [], targetId);
  const view = stageInterventionsOf({
    interventions: state.interventions,
    simTimeS: atS,
    hasRun: true,
    dayClosed: false,
    recomputing: false,
    switchTo: { target, driving: () => profileById(RESOURCES, [], state.dispatcherId) },
  });
  const row = view.rows.find((entry) => entry.change.kind === 'switch-dispatcher');
  if (row === undefined) throw new Error('the stage model offered no handover row');
  return { atS, change: row.change };
}

const before = (legs: readonly LegKey[], atS: number): readonly LegKey[] =>
  legs.filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < atS);
const fromThere = (legs: readonly LegKey[], atS: number): readonly LegKey[] =>
  legs.filter(([, , boardedAt]) => !(boardedAt >= 0 && boardedAt < atS));

/* -------------------------------------------------------------------------- *
 * The proof
 * -------------------------------------------------------------------------- */

describe('the stage’s handover reaches the run — GitHub issue #171', () => {
  const plain = stageState();
  const baseline = legsOf(plain);
  const handed = legsOf({ ...plain, interventions: [handoverFrom(plain, AT.handTo, AT.atS)] });

  it('leaves every boarding before the stamp byte-identical — the acceptance clause', () => {
    /*
     * Non-empty first, or the identity below is vacuous: a run whose first boarding is after the
     * stamp would pass an empty-prefix comparison while proving nothing. This is the guard
     * `core`'s own case keeps for the same reason.
     */
    expect(before(baseline, AT.atS).length).toBeGreaterThan(20);
    expect(before(handed, AT.atS)).toEqual(before(baseline, AT.atS));
  });

  it('moves the day after it, on the legs and not on a mean', () => {
    expect(fromThere(handed, AT.atS)).not.toEqual(fromThere(baseline, AT.atS));
    /*
     * How *much* moves, so a one-leg difference cannot masquerade as the control working. Measured
     * at this cell: 313 of the 378 boardings from the stamp on are a different car, a different
     * instant, or both. Asserted as a floor rather than as the figure, because the figure is a
     * property of a traffic template that may legitimately be re-tuned and the claim is that the
     * handover reaches the dispatcher — not that it reaches it by exactly 313 legs.
     */
    const moved = fromThere(baseline, AT.atS).filter(
      (leg, index) => JSON.stringify(leg) !== JSON.stringify(fromThere(handed, AT.atS)[index]),
    );
    expect(moved.length).toBeGreaterThan(100);
  });

  it('replays to the same legs — the record carries its seed (invariant 5)', () => {
    expect(legsOf({ ...plain, interventions: [handoverFrom(plain, AT.handTo, AT.atS)] })).toEqual(
      handed,
    );
  });

  /**
   * **The instant this cell was chosen against**, asserted rather than described.
   *
   * The recording outlives the demand window by ~950 s while the queue drains, and a handover in
   * that tail is inert: every boarding left is already committed, so the two dispatchers cannot
   * disagree about anything. A cell picked by taking *half the recording* lands here, the legs come
   * back identical, and a mutation to the whole control survives — which is the shape wave J's lane
   * A found. Keeping it is what says the positive result above is about the control and not about
   * where the playhead happened to be.
   */
  it('LATE_IS_INERT: the same handover after the last decision moves nothing', () => {
    const lateS = Math.floor(endOfRun(plain)) - 1;
    expect(lateS).toBeGreaterThan(AT.shiftLengthS);
    const late = legsOf({ ...plain, interventions: [handoverFrom(plain, AT.handTo, lateS)] });
    expect(late).toEqual(baseline);
  });

  /**
   * **§ D227 in the refusing direction**: the arm that says it would change nothing changes nothing.
   *
   * A refusal is pinned by a run and never by another sentence, and this is the run. The model
   * refuses a handover to the vector already driving; pressing it anyway — which the screen will not
   * let a player do — produces the byte-identical day the sentence claims.
   */
  it('a refused handover would have been the run it was', () => {
    const target = profileById(RESOURCES, [], AT.driving);
    const view = stageInterventionsOf({
      interventions: [],
      simTimeS: AT.atS,
      hasRun: true,
      dayClosed: false,
      recomputing: false,
      switchTo: { target, driving: () => target },
    });
    const row = view.rows.find((entry) => entry.change.kind === 'switch-dispatcher');
    expect(row?.refusal).toBe(STAGE_SWITCH_NO_CHANGE);
    const pressed = legsOf({
      ...plain,
      interventions: [{ atS: AT.atS, change: row?.change ?? { kind: 'park-cars-lobby' } }],
    });
    expect(pressed).toEqual(baseline);
  });
});
