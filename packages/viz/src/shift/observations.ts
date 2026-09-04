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
 * - **`carryPct`'s basis is arrivals *including* riders who gave up, and abandonment cannot
 *   improve it** (`docs/19` defect 3, on § D106's footing). The denominator is `live.arrived`,
 *   which counts every leg from the instant its call registered — a rider who runs out of
 *   patience and leaves keeps their arrival (`VizLeg` carries no `abandonedAt`; leaving never
 *   removes a leg) and can never enter the numerator, because `carried` counts only legs that
 *   alighted. So a rider walking out moves this percentage **down or not at all**, never up —
 *   unlike AWT, which abandonment improves by construction and which the fifth `awtIsValid`
 *   ground suppresses for exactly that reason. The carry goal reads this field and inherits the
 *   basis. When the goal grades ✓ 100 % beside a non-zero TOOK THE STAIRS count, both are true
 *   of one cohort: those riders' waits crossed the horizon *and* a car still came for them —
 *   the overlap {@link Observations.abandonedCarried} counts and the sheet now states.
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
    abandonedCarried: live.abandonedCarried,
    // The fourth outcome, copied like `abandoned` beside it and derived nowhere else: `live/` folds
    // it in the same pass as `arrived` and `abandoned`, which is what stops one sheet holding two
    // answers to *how many did this building turn away* — issue #288, § D265, § D266.
    turnedAway: live.turnedAway,
    horizonS: live.horizonS,
    // `0` when nobody has arrived, for `minutePct`'s reason one case up: a goal is a comparison
    // and needs a number, and under the wake-up gate the value is never displayed and never
    // compared. Whole seconds, matching `worstWaitFigure`'s own `toFixed(0)`, so the goal row
    // and the report cell cannot round one wait two ways.
    worstWaitS: live.worstWaitSoFarS === undefined ? 0 : Math.round(live.worstWaitSoFarS),
    worstWaitIsCensored: live.worstWaitIsCensored,
    // § 5's `trips`, copied like `abandoned` and `turnedAway` beside it and derived nowhere else.
    // **The one field here that is not defaulted**, and deliberately: the three cases above spell
    // an empty run as a number because a goal is a comparison, and each is unreadable under a gate.
    // This one has no such gate to hide behind — a trip budget is an `at-most` bar, so a `?? 0`
    // would grade *met* on every run nobody measured. `undefined` travels through instead, and
    // `goals.ts#readGoal` refuses it.
    ...(live.loadedDepartures === undefined ? {} : { loadedDepartures: live.loadedDepartures }),
    // The energy bar's observation, copied like the three counts above it and derived nowhere else
    // (§ D367, § D468, issue #275). `undefined` travels through for the same reason
    // `loadedDepartures` does and for one more: `live/observations.ts#energyPerServedLegAt` returns
    // it at every playhead short of the run's end, because the figure is a window statistic rather
    // than a fold and a rail drawn at an instant may not publish one.
    ...(live.workPerServedLegKJ === undefined
      ? {}
      : { workPerServedLegKJ: live.workPerServedLegKJ }),
  };
}
