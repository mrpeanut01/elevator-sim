/**
 * **A tower card's picture: the last filed day, playing on a loop** — GitHub issue #536's
 * *"they automatically run while on this screen"*, in the one form [§ D716](../../../../DECISIONS.md)
 * permits, built by wave AN lane AP-3 ([§ D1301](../../../../DECISIONS.md)).
 *
 * ## A transport over a recording the day already produced, and nothing else
 *
 * § D716 § 3: *"A tower that runs on the campaign screen is a `presentation` control over a recording
 * the day already produced. It may play, seek, loop and colour. It may not file, and it may not
 * grade."* This module is that sentence as a type. {@link towerLoopOf} is handed a
 * {@link TowerLoopSource}, which has one optional method and it reads; the loop it returns holds a
 * `Playback` over the recording the tower's last `file-day` was graded from, and a `Playback` is a
 * clock and an anchor. There is no path from here to `EverydayHost.campaignAct`, to `closeDay`, or
 * to the state a run is built from, so a card that plays for an hour, or for a month, files nothing
 * and moves no `tower.day` — `towerLoop.test.ts` drives one for a simulated hour against a host
 * whose writers are spied, and compares the career's bytes before and after.
 *
 * ## The day it plays is the day that was filed
 *
 * The recording is the one `everyday/host.ts#closeDay` stored on the press that filed it, which was
 * simulated from the seed `runCampaignDay` derived for that tower and day
 * (`campaign/incidents.ts#careerDaySeedFor`). It is replayed, never re-simulated, so the picture and
 * the verdict on the card are the same run by construction rather than by a second simulation
 * agreeing with the first. What that costs is persistence: the recording lives as long as the page,
 * on `EverydayHost.campaignHistory`'s ground, and a card after a reload says it has nothing to play.
 *
 * ## Why a loop over the whole day
 *
 * The card is a picture of how the day went, so it shows all of it, at a speed where Garden
 * Apartments' hour passes in half a minute. The transport loops on its whole-run window through
 * `Playback.frame`, which is the call that wraps; nothing reads its `ended` state.
 */

import type { Frame, VizRecording } from '../contract/types.js';
import type { DisplayClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import type { FiledDayRecord } from './campaignModel.js';

/**
 * The only thing a card loop is handed: a way to **read** filed days.
 *
 * `EverydayHost` satisfies it, and the screen passes the host itself; the narrowing is the point.
 * A caller holding only this cannot reach a writer, so the guarantee that watching files nothing is
 * carried by the signature rather than by every caller remembering not to.
 */
export interface TowerLoopSource {
  campaignFiledDays?(): ReadonlyMap<string, FiledDayRecord>;
}

/**
 * Simulated seconds per real second on a card — a presentation constant, reaching no run.
 *
 * Garden Apartments' contract hour plays in thirty seconds at this speed, which is long enough to
 * see a queue form and thin and short enough that a card glanced at shows the day moving.
 */
export const TOWER_LOOP_SPEED = 120;

export interface TowerLoop {
  readonly towerId: string;
  /** The contract day the recording is of — the day `file-day` closed. */
  readonly day: number;
  /** The filed day's recording, unaltered. */
  readonly recording: VizRecording;
  /**
   * The picture now: the transport's frame, which reads the clock once and wraps to the day's start
   * at its end. `Playback.simTimeS` alone clamps at the end rather than wrapping, so a painter that
   * read only that would show the last frame for ever; this is the call that loops.
   */
  frame(): Frame;
  /** Stops the transport. The recording and everything it was filed into are untouched. */
  stop(): void;
}

/**
 * The loop for one tower's card, or `undefined` when it has no filed day this sitting, or when the
 * filed recording has no length to loop over (a window the playhead cannot cross is a still frame,
 * and `Playback.setLoop` refuses one).
 *
 * Non-test caller: `everyday/campaignScreens.ts#mountTowers`, which paints each loop with
 * `everyday/cutaway.ts#drawCutaway`, the painter the stage and the landing page share.
 */
export function towerLoopOf(
  source: TowerLoopSource,
  towerId: string,
  clock: DisplayClock,
): TowerLoop | undefined {
  const filed = source.campaignFiledDays?.().get(towerId);
  if (filed === undefined) return undefined;
  const recording = filed.recording;
  if (!(recording.endedAt > recording.startedAt)) return undefined;
  const playback = new Playback(recording, clock, {
    speed: TOWER_LOOP_SPEED,
    autoplay: true,
    loop: true,
  });
  return {
    towerId,
    day: filed.day,
    recording,
    frame: () => playback.frame(),
    stop: () => {
      playback.pause();
    },
  };
}
