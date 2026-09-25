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

import type { DispatcherProfile, RunInterventionConfig } from '@elevator-sim/core/browser';

import { drivingProfileOf, profileById, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { baseState, RESOURCES } from '../scope/probes.test-helper.js';
import { SWITCH_NEEDS_BIDDING, SWITCH_NEEDS_OTHER_PANELS } from '../live/interventions.js';
import {
  stageInterventionsOf,
  STAGE_SWITCH_NO_CHANGE,
  type StageInterventionRow,
} from './stageScreenModel.js';

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
    /*
     * `drivingProfileOf`, which is what `EverydayHost.drivingProfile` answers with and what
     * `shiftRunConfigOf` builds the run through — not the base profile the id names. Using the base
     * here would make this helper agree with the screen only while the player has moved nothing.
     */
    switchTo: { target, driving: () => drivingProfileOf(RESOURCES, state) },
  });
  const row = view.rows.find((entry) => entry.change.kind === 'adopt-dispatcher');
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
    const row = view.rows.find((entry) => entry.change.kind === 'adopt-dispatcher');
    expect(row?.refusal).toBe(STAGE_SWITCH_NO_CHANGE);
    const pressed = legsOf({
      ...plain,
      interventions: [{ atS: AT.atS, change: row?.change ?? { kind: 'park-cars-lobby' } }],
    });
    expect(pressed).toEqual(baseline);
  });
});

/* -------------------------------------------------------------------------- *
 * Every row the picker offers — § D1048
 * -------------------------------------------------------------------------- */

/**
 * **Every row the picker offers, enabled and moving the day or refused and pinned by a run** —
 * [§ D1048](../../../../DECISIONS.md).
 *
 * The case above proves one handover reaches the run. What it could not see is the rows that were
 * offered, enabled and inert: *Destination disclosure* and *Destination dispatch* moved 0 of 14
 * pinned-day legs, because a destination term reads nothing at an up-and-down button and the run
 * keeps the landing it opened with; and *Minimum estimated wait* was refused as *already running*
 * because it shares collective's weights, while the brief said it clears the day. So every shipped
 * profile is driven through the model's own row, and each row is exactly one of two things:
 * **enabled, and the legs move**, or **refused, and a run shows what pressing it would have been**.
 */
describe('every handover the picker offers moves the day or says why not — § D1048', () => {
  const plain = stageState();
  const baseline = legsOf(plain);
  const shelf = RESOURCES.dispatcherProfiles.profiles;
  const rowFor = (targetId: string): StageInterventionRow => {
    const view = stageInterventionsOf({
      interventions: [],
      simTimeS: AT.atS,
      hasRun: true,
      dayClosed: false,
      recomputing: false,
      switchTo: {
        target: profileById(RESOURCES, [], targetId),
        driving: () => drivingProfileOf(RESOURCES, plain),
      },
    });
    const row = view.rows.find((entry) => entry.change.kind === 'adopt-dispatcher');
    if (row === undefined) throw new Error('the stage model offered no handover row');
    return row;
  };
  const pressed = (change: RunInterventionConfig['change']): readonly LegKey[] =>
    legsOf({ ...plain, interventions: [{ atS: AT.atS, change }] });
  /** A shipped profile with the fields named removed from its `dispatch` or its top level. */
  const without = (id: string, strip: (profile: DispatcherProfile) => DispatcherProfile): DispatcherProfile =>
    strip(profileById(RESOURCES, [], id));

  it('moves the legs on every row it enables, and enables all but the standing order and the refusals', () => {
    const enabled = shelf.filter((profile) => rowFor(profile.id).refusal === undefined).map((p) => p.id);
    /*
     * Minimum estimated wait is enabled now: it is collective without the no-turning rule, and the
     * whole dispatcher carries the rule where the vector alone did not.
     */
    expect(enabled).toContain('eta');
    expect(enabled.length).toBe(shelf.length - 5);
    const inert = enabled.filter(
      (id) => JSON.stringify(pressed(rowFor(id).change)) === JSON.stringify(baseline),
    );
    expect(inert).toEqual([]);
  });

  it('refuses the standing order itself, and pressed anyway it is the day it was', () => {
    const row = rowFor(AT.driving);
    expect(row.refusal).toBe(STAGE_SWITCH_NO_CHANGE);
    expect(pressed(row.change)).toEqual(baseline);
  });

  it('refuses both destination rows — the run refuses them too, and without the panels each is ETA', () => {
    const eta = pressed({ kind: 'adopt-dispatcher', profile: profileById(RESOURCES, [], 'eta') });
    for (const id of ['destination-eta', 'destination-panel']) {
      const row = rowFor(id);
      expect(row.refusal, id).toBe(SWITCH_NEEDS_OTHER_PANELS);
      /* Pressed anyway, the engine will not half-adopt it. */
      expect(() => pressed(row.change), id).toThrow(/passenger model/u);
      /*
       * And what a handover *could* carry of it — everything but the panels — is Minimum estimated
       * wait on the legs: the destination term reads nothing at an up-and-down button, so the rest of
       * the dispatcher is another row on the same shelf under this one's name.
       */
      const carried = without(id, (profile) => ({ ...profile, dispatch: {} }));
      expect(pressed({ kind: 'adopt-dispatcher', profile: carried }), id).toEqual(eta);
    }
  });

  it('refuses both bidding rows — the run refuses them too, and without the bidding the two are one day', () => {
    const sealed = rowFor('auction');
    const rounds = rowFor('auction-multi-round');
    expect(sealed.refusal).toBe(SWITCH_NEEDS_BIDDING);
    expect(rounds.refusal).toBe(SWITCH_NEEDS_BIDDING);
    expect(() => pressed(sealed.change)).toThrow(/bidding/u);
    /*
     * The bidding is the only thing that makes the two different dispatchers, and it is what a
     * handover would have to leave behind — so the day either could hand over is neither of them.
     */
    const bare = (id: string): DispatcherProfile =>
      without(id, ({ auction: _auction, ...rest }) => rest);
    expect(pressed({ kind: 'adopt-dispatcher', profile: bare('auction-multi-round') })).toEqual(
      pressed({ kind: 'adopt-dispatcher', profile: bare('auction') }),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * What the parking press actually does — GitHub issue #565, § D949
 * -------------------------------------------------------------------------- */

/**
 * **The measurement that refused a fix**, kept because it is worth more than the fix would have
 * been — [§ D949](../../../../DECISIONS.md).
 *
 * A playability assessor pressed *spread the cars* on a day driven by `zoned-uppeak`, measured
 * **0 of 355 legs** changed, and read nothing on the screen. § D227's first polarity says a control
 * that does nothing must say so, and the refusal looked derivable without simulating anything:
 * `data/dispatcher-profiles.json` gives `zoned-uppeak` `idle.parkingStrategy: "zone-center"`, and
 * `sim/simulation.ts#idleOverrideAt` sets exactly `'zone-center'` for a `spread-cars` entry. The
 * press writes the value already in force, so — the argument goes — it cannot move a leg, and the
 * row can say so before anybody presses it.
 *
 * **That argument is false, and this file is where it was caught.** Swept over two buildings ×
 * three shift lengths × three dispatchers × both arms, with the press stamped at 28 % of the shift:
 * under `zoned-uppeak` at `garden-apartments`, *spread the cars* **does** move the legs at 900 s
 * and at 1 800 s, while writing the strategy that profile already declares. A refusal derived from
 * the profile would have told those players a live control was dead, which is § D177's
 * inert-control class with its polarity reversed — the failure the refusal existed to prevent,
 * arriving as the fix for it.
 *
 * **No mechanism is offered**, on [§ D256](../../../../DECISIONS.md)'s rule. `repositionDecisionFor`
 * reads every stage-7 setting off one `effective` config and the override is value-identical, so
 * the run *should* be identical and is not; establishing why means measuring inside `core`, and a
 * plausible sentence in place of that measurement is what § D256 refuses.
 *
 * So the two cells below are the claim this file makes and the whole of it: the press is **inert at
 * some operating points and live at others under the same dispatcher**, which is why nothing on the
 * stage may say in advance what it will do.
 */
describe('the parking press is operating-point dependent, not dispatcher dependent — issue #565', () => {
  const PRESS_AT_S = Math.round(AT.shiftLengthS * 0.28);
  const SPREAD: RunInterventionConfig = { atS: PRESS_AT_S, change: { kind: 'spread-cars' } };

  const spreadMoves = (buildingId: string, shiftLengthS: number, dispatcherId: string): boolean => {
    const at: ViewerState = { ...stageState(), buildingId, shiftLengthS, dispatcherId };
    const baseline = legsOf(at);
    expect(baseline.length, `${buildingId}/${dispatcherId} carried nobody`).toBeGreaterThan(0);
    return JSON.stringify(legsOf({ ...at, interventions: [SPREAD] })) !== JSON.stringify(baseline);
  };

  /*
   * The assessor's own cell, reproduced: the press writes the strategy `zoned-uppeak` already
   * declares and the legs do not move. This is the half that made the refusal look derivable.
   */
  it('moves no leg under zoned-uppeak on the office tower', () => {
    expect(spreadMoves('midtown-office', 1800, 'zoned-uppeak')).toBe(false);
  });

  /*
   * And the half that refutes it. Same dispatcher, same press, same 28 % stamp — a different
   * building, and the legs move. Whatever makes the press bite is not the profile's declared
   * parking strategy, so no screen reading that profile can say in advance that the press is inert.
   */
  it('and moves legs under the same dispatcher on the residential block', () => {
    expect(spreadMoves('garden-apartments', 1800, 'zoned-uppeak')).toBe(true);
  });

  /*
   * The control that keeps the pair from being a statement about `zoned-uppeak` at all: on the
   * office tower the press is live under `collective`, so the office cell above is not simply a
   * building on which nothing ever repositions.
   */
  it('and is live on that same office tower under a dispatcher that parks nowhere in particular', () => {
    expect(spreadMoves('midtown-office', 1800, 'collective')).toBe(true);
  });
});
