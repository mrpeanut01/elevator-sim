/**
 * The shift layer's view of the live fold — a projection, and deliberately nothing more.
 *
 * ## Why this is four lines of arithmetic and not a second fold
 *
 * `packages/viz/src/live/observations.ts` walks the recording's legs once and answers *what is
 * true at the playhead*. The shift layer needs the same facts in a slightly different shape: two
 * ratios instead of their numerators and denominators, and the peak queue flattened out of its
 * own record.
 *
 * The temptation is to compute them where they are used. That is how a repository ends up with two
 * answers to *how many people has this building carried*, and this one has a rule about it — the
 * suppression gate was written three times and two of them were right (`DECISIONS.md` § D111). So
 * `live/` folds and this projects, and the only arithmetic here is the two divisions and one
 * rounding, each with its empty case stated.
 *
 * `shift/observations.test-helper.ts` used to stand in for `live/` while the two lanes were built
 * in parallel. It is gone: a helper that outlives its blocker becomes the second source of truth it
 * was written to avoid.
 */

import type { LiveObservations } from '../live/types.js';

import type { Observations } from './types.js';

/**
 * Project the live fold into the shape the goals and the report read.
 *
 * The empty cases are the whole content of this function and none is arbitrary (the third —
 * `worstWaitS: 0` when nobody has arrived — is stated at the field below, and is `minutePct`'s
 * argument again):
 *
 * - **`carryPct` is 100 when nobody has arrived.** A building that has been asked for nothing has
 *   failed nobody. The goal gate (`arrived < WAKE_UP_ARRIVALS`) makes the value unreadable anyway,
 *   so this only decides what an ungraded panel shows, and *100 %* is the honest reading of *no
 *   outstanding journeys*.
 * - **`minutePct` is 100 when nobody has been served**, and this one is a compromise worth naming.
 *   `live/` deliberately returns `undefined` there — *"the design's prototype returns 100 % on an
 *   empty denominator, which reads as everybody was served promptly about a building where nobody
 *   has been served at all"* — and it is right. `GoalObservations.minutePct` is a `number`, because
 *   a goal is a comparison and a comparison against `undefined` is not one. The two are reconciled
 *   by the wake-up gate rather than by the number: below twenty arrivals every reading is
 *   `pending` and the panel prints `—`, so the `100` written here is never displayed and never
 *   compared. The rail's own *served under 60 s* row reads `live/`'s `undefined` directly and shows
 *   a dash.
 */
export function shiftObservationsOf(live: LiveObservations): Observations {
  return {
    arrived: live.arrived,
    carried: live.carried,
    servedLegs: live.servedCount,
    carryPct: live.arrived === 0 ? 100 : Math.round((live.carried / live.arrived) * 100),
    minutePct: live.servedUnderThresholdPct === undefined
      ? 100
      : Math.round(live.servedUnderThresholdPct),
    peakQueue: live.peakQueue.count,
    // `null` and not `undefined`: `Observations` spells absence the way a JSON round trip can
    // carry it, for the same reason `VizSummary` does.
    peakQueueFloorId: live.peakQueue.floorId ?? null,
    peakQueueAtS: live.peakQueue.atS ?? null,
    abandoned: live.abandoned,
    // `0` when nobody has arrived, for `minutePct`'s reason one case up: a goal is a comparison
    // and needs a number, and under the wake-up gate the value is never displayed and never
    // compared. Whole seconds, matching `worstWaitFigure`'s own `toFixed(0)`, so the goal row
    // and the report cell cannot round one wait two ways.
    worstWaitS: live.worstWaitSoFarS === undefined ? 0 : Math.round(live.worstWaitSoFarS),
    worstWaitIsCensored: live.worstWaitIsCensored,
  };
}
