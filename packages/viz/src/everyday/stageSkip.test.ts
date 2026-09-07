/**
 * **§ 2.3's skip control** — GitHub issue **#369**, [§ D525](../../../../DECISIONS.md) clause 4.
 *
 * `docs/38` § 1 states the design this serves and the caveat in the same breath: *"If you would
 * rather not watch, you can speed it up or skip to the end, but watching is the point, not a
 * replay."* So the two claims worth asserting are **that the control reaches the end** and **that
 * reaching it changes nothing**, and the second is the one a screen test would let through.
 *
 * The transport is driven over a {@link ManualClock} rather than through a mount, for the reason
 * `playback.test.ts` gives: these are assertions about state and arithmetic, and a mounted stage
 * would only add a document to them. What the mount does with the answers is
 * `stageScreen.browser.test.ts`'s.
 */

import { describe, expect, it } from 'vitest';

import { VIZ_SCHEMA_VERSION, type VizRecording } from '../contract/types.js';
import { constantSeries } from '../contract/series.js';
import { FIXTURE_DOOR_CONFIG, fixtureSummary } from '../fixtures.test-helper.js';
import { ManualClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { STAGE_SKIP_COPY, STAGE_SPEEDS, stageSkipViewOf } from './stageScreenModel.js';

const RECORDING: VizRecording = {
  schemaVersion: VIZ_SCHEMA_VERSION,
  runId: 'skip-fixture',
  seed: '369',
  buildingId: 'synthetic',
  buildingName: 'Synthetic',
  dispatcherProfileId: 'eta',
  passengerModel: 'conventional',
  status: 'completed',
  startedAt: 0,
  endedAt: 100,
  floors: [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: false, population: 10 },
  ],
  shafts: [
    {
      carId: 'main-A',
      bankId: 'main',
      label: 'A',
      startFloorId: 'G',
      startHeightM: 0,
      servedFloorIds: ['G', '2'],
      capacityPersons: 13,
      doorConfig: FIXTURE_DOOR_CONFIG,
      motions: [],
      doorMarks: [],
      occupants: constantSeries(0),
      loadFactor: constantSeries(0),
    },
  ],
  legs: [],
  landings: [],
  progress: {
    waiting: constantSeries(0),
    boardedLegs: constantSeries(0),
    meanWaitS: constantSeries(0),
  },
  summary: fixtureSummary({
    meanWaitS: 0,
    wait95S: 0,
    meanTimeToDestinationS: 0,
    generated: 0,
    delivered: 0,
    undelivered: 0,
  }),
  // Version 7. Empty is the legal value for a fixture that exercises none of the three:
  // the timeline draws one unlabelled band, the decision log draws its empty state, and
  // no shaft is dark. See `contract/types.ts`.
  demandPhases: [],
  decisions: [],
  outOfServiceCarIds: [],
  warnings: [],
};

/** The transport a stage owns, at the start of the day, paused — what `adopt` leaves behind. */
function transport(): { readonly playback: Playback; readonly clock: ManualClock } {
  const clock = new ManualClock();
  return { playback: new Playback(RECORDING, clock), clock };
}

/**
 * `stageScreen.ts#skipToEnd`, in the three lines the mount runs. Kept here rather than exported
 * from the mount because the mount needs a document to exist at all; the claim under test is what
 * those three lines do to a transport, which is a fact about `Playback`.
 */
function skipToEnd(playback: Playback): void {
  playback.play();
  playback.seekTo(playback.recording.endedAt);
}

describe('§ 2.3’s skip control — issue #369', () => {
  it('lands the playhead on the end of the run', () => {
    const { playback } = transport();
    expect(playback.simTimeS).toBe(RECORDING.startedAt);

    skipToEnd(playback);

    expect(playback.simTimeS).toBe(RECORDING.endedAt);
    expect(playback.progress).toBe(1);
  });

  /**
   * **The state, not the position** — and this is the assertion the obvious implementation fails.
   *
   * `Playback.state` reports `ended` only while the transport is *playing* and the playhead has
   * reached `endedAt`; it is derived rather than stored, which is what lets a seek backwards resume
   * without a reset. A skip written as `pause(); seekTo(end)` leaves the transport reading `paused`
   * on the last frame, so `stageScreen.ts#syncTransport`'s `dayEnded` edge never fires and § 3.3's
   * row goes on offering *Close the day* about a day the player can see has finished.
   */
  it('leaves the transport in the state the action bar reads as a finished day', () => {
    const { playback } = transport();
    expect(playback.state).toBe('paused');

    skipToEnd(playback);

    expect(playback.state).toBe('ended');
  });

  /**
   * **`docs/16`'s rule for a presentation control: it reaches a sink and must not reach the legs.**
   *
   * The recording is simulated on a worker before the stage draws its first frame, so the day is
   * finished being decided by the time any of these controls exist. Asserted on the recording
   * itself rather than argued: a day watched at `1×`, a day watched at the top rung and a day
   * skipped are compared **serialised**, which is the strongest form of *changes no figure* — it
   * catches a mutation anywhere in the record, not only in the summary somebody thought to check.
   */
  it('produces a byte-identical recording watched slowly, watched fast, or skipped', () => {
    const before = JSON.stringify(RECORDING);

    const slow = transport();
    slow.playback.setSpeed(STAGE_SPEEDS[0].simPerRealS);
    slow.playback.play();
    slow.clock.advance(10);
    slow.playback.frame();

    const fast = transport();
    const top = STAGE_SPEEDS[STAGE_SPEEDS.length - 1];
    fast.playback.setSpeed(top === undefined ? 600 : top.simPerRealS);
    fast.playback.play();
    fast.clock.advance(10);
    fast.playback.frame();

    const skipped = transport();
    skipToEnd(skipped.playback);
    skipped.playback.frame();

    expect(JSON.stringify(slow.playback.recording)).toBe(before);
    expect(JSON.stringify(fast.playback.recording)).toBe(before);
    expect(JSON.stringify(skipped.playback.recording)).toBe(before);
  });

  /**
   * The control says what it is, and stops claiming to be pressable once it cannot do anything —
   * which is § D354's defect class (a chip face that lied about itself) caught one level up.
   */
  it('offers the skip while the day runs and refuses it, with a reason, once it is over', () => {
    const running = stageSkipViewOf({ dayEnded: false, hasRun: true });
    expect(running).toEqual({
      label: STAGE_SKIP_COPY.label,
      note: STAGE_SKIP_COPY.note,
      inert: false,
    });

    const over = stageSkipViewOf({ dayEnded: true, hasRun: true });
    expect(over.inert).toBe(true);
    expect(over.label).toBe(STAGE_SKIP_COPY.label);
    expect(over.note).toBe(STAGE_SKIP_COPY.doneReason);
    /* The reason has to be a reason, not a restatement of the label. */
    expect(over.note).not.toBe(running.note);
  });

  /**
   * **The arm that goes wrong quietly.** Between the stage mounting and the worker handing a
   * recording back there is no transport, so the control is disabled — and the first version of it
   * left the note reading *what pressing it would do*. That is `CLAUDE.md`'s stale refusal from the
   * other side: a sentence that describes a live seam on a control nobody can reach. Every arm that
   * disables the button now says why, and only the live arm says what it does.
   */
  it('says why it is dead while the day is still being simulated, not what it would do', () => {
    const pending = stageSkipViewOf({ dayEnded: false, hasRun: false });
    expect(pending.inert).toBe(true);
    expect(pending.note).toBe(STAGE_SKIP_COPY.pendingReason);
    expect(pending.note).not.toBe(STAGE_SKIP_COPY.note);

    /* Three distinct sentences, so no arm is quietly borrowing another's. */
    const notes = new Set([
      stageSkipViewOf({ dayEnded: false, hasRun: true }).note,
      stageSkipViewOf({ dayEnded: true, hasRun: true }).note,
      pending.note,
    ]);
    expect(notes.size).toBe(3);
  });

  /**
   * **Not an eighth rung**, asserted on the ladder rather than in a docstring: a skip that had
   * quietly become a speed would show up here as an eighth entry, and #369's second criterion is
   * that the seven-rung ladder is unchanged.
   */
  it('adds no rung to the ladder, and every rung still equals its own multiplier', () => {
    expect(STAGE_SPEEDS).toHaveLength(7);
    for (const speed of STAGE_SPEEDS) {
      expect(speed.label).toBe(`${String(speed.simPerRealS)}×`);
    }
    expect(STAGE_SPEEDS.some((speed) => speed.label === STAGE_SKIP_COPY.label)).toBe(false);
  });
});
