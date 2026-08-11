/**
 * The four stat rows, the alarm chip's figure, and everything the shift layer's goals read.
 *
 * ## Every field is a count, and that is the design requirement rather than a preference
 *
 * `docs/12-design-handoff.md` § 4.2 replaces the prototype's report figures one for one, and the
 * replacements are counts: `CARRIED` is `count(legs where alightedAt <= t)`, `AWAY INSIDE A
 * MINUTE` is `count(boarded legs with wait < threshold) / count(boarded legs)`, `DEEPEST QUEUE`
 * is a maximum over a step function. § 1.5 B3 then makes the goals read *only* from observations.
 * Together those mean the rail keeps working on the 46-of-60 configurations whose mean this
 * project refuses to quote — which are the interesting ones, because the reason a mean is refused
 * is usually that the queues diverged.
 *
 * Nothing in this module reads `summary.meanWaitS`, `summary.wait95S` or
 * `summary.meanTimeToDestinationS`. It reads two *thresholds* off the summary —
 * `longWaitThresholdS` and `serviceLevel.horizonS` — because those are the run's own numbers and
 * a renderer that assumed 60 s and 900 s would be labelling one building with another's rule.
 *
 * ## Why the peak-queue scan is over legs and not over the recording's landing series
 *
 * `recording.landings` already holds a per-`(floor, direction)` step function of the waiting
 * count, and summing two of them per floor would be cheaper than what this module does. It is
 * deliberately not used, for the reason `overlay.test.ts` states about `waitingNow`: the landings
 * are a **fold** produced by `foldPassengers`, and re-deriving the same quantity from the legs
 * means the two come from different structures built by different code paths. `peakQueue` is then
 * checkable against the fold, and the check would catch a `describeLegs` that dropped or
 * duplicated a leg. Deriving it *from* the fold would make that test a tautology.
 *
 * ## Cost, and why there is no cache
 *
 * One pass over `recording.legs` for the counters, plus one sort-and-sweep over `2n` queue events
 * for the peak. A 900 s run of the largest shipped building holds a few thousand legs, so the
 * whole thing is comfortably inside a frame budget.
 *
 * There is **no cache and no cursor**, and that is not an oversight. The playhead scrubs
 * backwards: a reader drags left, a test samples the same instant twice, and the replay harness
 * compares `t` ascending against `t` descending. Any state carried between calls — "the last `t`
 * we answered", a running total advanced forwards — answers the second of those wrongly, and
 * wrongly in a way that only appears when somebody drags. Purity is the feature.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { overlayAt } from '../frame/overlay.js';

import type { LiveObservations, PeakQueue } from './types.js';

/**
 * One change in one floor's queue depth. Arrival `+1`, boarding `-1`.
 *
 * Sorted by `(at, delta, passengerId)` — **boardings before arrivals at the same instant**, and
 * the tie-break is the whole point. `foldPassengers` sorts the same way and says why: a landing
 * that empties and refills at the same simulated second must read as its net depth at that
 * second, not as a phantom stack of everybody who touched it. Applying arrivals first would
 * report a peak that never held, and `peakQueue` would then exceed a maximum of the recording's
 * own landing series.
 */
interface QueueDelta {
  readonly at: SimTime;
  readonly delta: 1 | -1;
  readonly floorId: string;
  readonly passengerId: string;
}

/** Everything the left rail's stat rows and the goal set read, at one instant. */
export function observationsAt(recording: VizRecording, simTimeS: SimTime): LiveObservations {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const { longWaitThresholdS } = recording.summary;
  const horizonS = recording.summary.serviceLevel.horizonS;

  // Reused rather than recomputed: `overlayAt` is the module that decides who is waiting, and two
  // answers to that question is the failure this package has a rule about.
  const overlay = overlayAt(recording, t);

  let arrived = 0;
  let boarded = 0;
  let carried = 0;
  let servedUnderThresholdCount = 0;
  let abandoned = 0;
  let worstWaitSoFarS: number | undefined;
  let worstWaitIsCensored = false;

  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break; // sorted by `(arrivedAt, passengerId)` — see `VizLeg`
    arrived += 1;

    const { boardedAt } = leg;
    if (boardedAt !== undefined && boardedAt <= t) {
      boarded += 1;
      if (boardedAt - leg.arrivedAt < longWaitThresholdS) servedUnderThresholdCount += 1;
    }
    if (leg.alightedAt !== undefined && leg.alightedAt <= t) carried += 1;
    // Strictly past, not at: waiting *exactly* the horizon is inside it, matching `core`'s own
    // `overHorizonCount`, which counts arrivals whose wait is **known to exceed** the horizon.
    if (crossesHorizonAt(leg, horizonS) < t) abandoned += 1;

    /*
     * The worst wait known at `t` — `diagnoseServiceLevel`'s ending rules with `censoredAtS`
     * set to the playhead. A boarded or refused leg's wait ended, exactly, at that instant; a
     * leg with neither by `t` reads as still standing, so `t - arrivedAt` is recorded with
     * `censored` set — and `censored` here means *unprovable* rather than merely *unfinished*,
     * because `VizLeg` carries no `abandonedAt` and a rider who walked out is indistinguishable
     * from one still waiting (see `LiveObservations.worstWaitIsCensored`). Strict `>` keeps ties
     * on the first leg in record order, matching `core`'s own tie rule, so the maximum is
     * deterministic. Clamped at 0 like `core`'s, so a malformed record cannot drag the maximum
     * negative.
     */
    const resolvedAt = leg.boardedAt ?? leg.refusedAt;
    const resolved = resolvedAt !== undefined && resolvedAt <= t;
    const waitS = Math.max(0, (resolved ? resolvedAt : t) - leg.arrivedAt);
    if (worstWaitSoFarS === undefined || waitS > worstWaitSoFarS) {
      worstWaitSoFarS = waitS;
      worstWaitIsCensored = !resolved;
    }
  }

  const queues = sweepQueues(recording, t);

  return {
    atS: t,
    waitingNow: overlay.waitingNow,
    longestCurrentWaitS: overlay.longestCurrentWaitS,
    arrived,
    boarded,
    carried,
    servedUnderThresholdCount,
    servedCount: boarded,
    // `undefined`, never `100`, on an empty denominator. See `LiveObservations`.
    servedUnderThresholdPct:
      boarded === 0 ? undefined : (servedUnderThresholdCount / boarded) * 100,
    longWaitThresholdS,
    peakQueue: queues.peak,
    deepestQueueNow: queues.deepestNow,
    deepestQueueFloorId: queues.deepestNowFloorId,
    abandoned,
    horizonS,
    worstWaitSoFarS,
    worstWaitIsCensored,
  };
}

/**
 * The instant this leg's wait reaches the horizon, or `Infinity` if it never does.
 *
 * A leg that boarded after waiting longer than the horizon reached it at `arrivedAt + horizonS`,
 * and a leg that never boarded reaches it at the same instant — the wait is the same quantity
 * either way, and `core`'s own `overHorizonCount` counts both. Deriving the crossing time rather
 * than testing `t - arrivedAt > horizonS` is what makes the count **non-decreasing in `t`**: a
 * leg that boards at 950 s having waited 950 s must not stop being abandoned the moment the
 * playhead passes its boarding.
 */
function crossesHorizonAt(leg: VizLeg, horizonS: number): number {
  const endedAt = leg.boardedAt;
  if (endedAt !== undefined && endedAt - leg.arrivedAt <= horizonS) return Number.POSITIVE_INFINITY;
  return leg.arrivedAt + horizonS;
}

interface QueueSweep {
  readonly peak: PeakQueue;
  readonly deepestNow: number;
  readonly deepestNowFloorId: string | undefined;
}

/**
 * The per-floor queue depth over `[startedAt, t]`, in one sweep.
 *
 * A *floor*, summing its up and down landings, because that is the stack a reader sees on the
 * canvas and the thing the alarm chip names. `(floor, direction)` would report half of it.
 */
function sweepQueues(recording: VizRecording, t: SimTime): QueueSweep {
  const events: QueueDelta[] = [];
  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break;
    /*
     * A rider the building turned away never joined this queue — `DECISIONS.md` § D266.
     *
     * Without it a refused leg is a `+1` with no matching `-1`, so it stands here for the rest of
     * the run and `deepestQueueNow` disagrees with `frame/overlay.ts`'s `queueAt`, which already
     * accounts for it through `isWaitingAt`. That agreement is what `observations.test.ts` §
     * *agrees with `queueAt` about the deepest queue standing right now* asserts, and it is
     * evidence precisely because the two are **different code** reaching the same answer.
     *
     * **No event at all rather than a `+1` and a `-1`** — the same choice `record/recordRun.ts`'s
     * `foldPassengers` makes, and the two folds agreeing is the whole point of the assertion above.
     *
     * A pair was written here first, and what it cost is worth recording because it is not what
     * you would guess. `refusedAt` equals `arrivedAt` on **every** refused leg — measured, 4 of 4
     * on `secure-tower` and 5 of 5 on `mixed-use-high-rise`, and none at all on the three buildings
     * declaring no `accessZones` — so a pair is two events at one instant, cancelled only by the
     * `delta` tie-break below happening to order them that way. **The suite did not catch it**, so
     * a green run here is not evidence for either shape. The argument against the pair is therefore
     * not that it computed a wrong number; it is that a rider who never joined the queue should not
     * be modelled as joining and leaving it, and that a fold whose correctness rests on a sort
     * order cancelling two events is one refactor away from being wrong silently.
     *
     * `refusedAt` is absent on every leg of the three shipped buildings that declare no
     * `accessZones`, so this is inert on those runs.
     */
    if (leg.refusedAt !== undefined && leg.refusedAt <= t) continue;
    events.push({
      at: leg.arrivedAt,
      delta: 1,
      floorId: leg.originFloorId,
      passengerId: leg.passengerId,
    });
    const { boardedAt } = leg;
    if (boardedAt !== undefined && boardedAt <= t) {
      events.push({
        at: boardedAt,
        delta: -1,
        floorId: leg.originFloorId,
        passengerId: leg.passengerId,
      });
    }
  }
  events.sort(
    (a, b) => a.at - b.at || a.delta - b.delta || a.passengerId.localeCompare(b.passengerId),
  );

  const depth = new Map<string, number>();
  let peakCount = 0;
  let peakFloorId: string | undefined;
  let peakAtS: SimTime | undefined;

  for (const event of events) {
    const next = (depth.get(event.floorId) ?? 0) + event.delta;
    depth.set(event.floorId, next);
    // Strictly greater, so `atS` is the **earliest** instant the depth was reached rather than
    // the last time it was matched. A reader asking "when was it worst" means the first time.
    if (next > peakCount) {
      peakCount = next;
      peakFloorId = event.floorId;
      peakAtS = event.at;
    }
  }

  // Building order, never sorted by id: sorting floor ids as strings reads `11, 12, 16, 20, 3, 4`
  // and would break a tie in favour of the third storey over the twentieth.
  let deepestNow = 0;
  let deepestNowFloorId: string | undefined;
  for (const floor of recording.floors) {
    const standing = depth.get(floor.id) ?? 0;
    if (standing > deepestNow) {
      deepestNow = standing;
      deepestNowFloorId = floor.id;
    }
  }

  return {
    peak: { count: peakCount, floorId: peakFloorId, atS: peakAtS },
    deepestNow,
    deepestNowFloorId,
  };
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
