/**
 * **Where a replay of a called day opens: just before the call** — wave AK,
 * [§ D1140](../../../../DECISIONS.md), the post-AJ panel's seat A.
 *
 * Seat A's best moment in the build was the report telling them their answer cleared the day where
 * the other two would have missed, and both ways back to that moment made them sit through the
 * morning first: *Take this call again* re-opened the day at 08:30 for a call at 08:40, and *Watch
 * it* (had it played at all) opened a ten-hour day at 08:00. A replay of a called day is for the
 * call, so it opens {@link CALL_LEAD_S} before it, playing.
 *
 * ## What *the call* is, on a day that had more than one
 *
 * The first one, and read off what the day kept rather than re-derived:
 *
 * 1. **A pinned day's call** where the run is that day as it was measured —
 *    `dev/state.ts#pressDayCallOf`, a pure function of the recording, so it is found whether the
 *    player pressed at it or left the standing order to it.
 * 2. **Otherwise the first press on record.** An ordinary day's call stamps its press at the call
 *    second (`dev/main.ts#answerDayCall`), so the first press is the first call the player answered
 *    with a press. A call answered *leave them* presses nothing and is not in the record, and the
 *    ordinary calls themselves are not stored: re-raising them needs the three look-ahead runs per
 *    candidate that `shift/dayCalls.ts` admits a call with, which a replay does not run. So a day
 *    whose every call was left opens at the first press after them, or at its start.
 * 3. **Otherwise the day's start**, as before.
 *
 * Nothing is stored for this: every input is the record or the run it re-asks (§ 3.5).
 */

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { pressDayCallOf, type ViewerState } from '../dev/state.js';
import { stateFromWatchRecord } from '../watch/record.js';
import type { WatchRecord } from '../watch/types.js';

/**
 * **How long before the call the replay opens** — half a simulated minute, so the call arrives on
 * a stage already moving with the queue that raised it in view. At the stage's default speed that is
 * a few seconds of watching, where the whole morning before it was minutes. Owner-reversible.
 */
export const CALL_LEAD_S = 30;

/** `atS` less the lead, clamped to the recording, or `undefined` when there is no call to open at. */
function openingBefore(atS: number | undefined, recording: VizRecording): number | undefined {
  if (atS === undefined || !Number.isFinite(atS)) return undefined;
  const at = Math.min(recording.endedAt, Math.max(recording.startedAt, atS - CALL_LEAD_S));
  return at > recording.startedAt ? at : undefined;
}

/**
 * The second the stage opens `recording` at when it replays the day `state` describes, or
 * `undefined` for the day's start — rule 1, then rule 2.
 */
export function callOpeningOf(
  resources: BrowserResources,
  state: ViewerState,
  recording: VizRecording,
): number | undefined {
  const pinned = pressDayCallOf(resources, state, recording)?.call.atS;
  if (pinned !== undefined) return openingBefore(pinned, recording);
  const first = state.interventions.reduce<number | undefined>(
    (earliest, entry) => (earliest === undefined || entry.atS < earliest ? entry.atS : earliest),
    undefined,
  );
  return openingBefore(first, recording);
}

/**
 * {@link callOpeningOf} for a watched record: the day as the record re-asks it, with the record's
 * own presses, so a pinned day's call is found on a filed day exactly as on the stage that played it.
 */
export function watchedCallOpeningOf(
  resources: BrowserResources,
  base: ViewerState,
  record: WatchRecord,
  recording: VizRecording,
): number | undefined {
  return callOpeningOf(resources, stateFromWatchRecord(base, resources, record), recording);
}
