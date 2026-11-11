/**
 * Escalator queues: what a run recorded at each boarding landing, and what it means — § D1631.
 *
 * An escalator that declares `capacityPersonsPerHour` has a first-come, first-served queue at
 * each of its two landings (`config/types.ts#TransportModeConfig.capacityPersonsPerHour`). This
 * module is the metrics half: the raw rows a run writes ({@link TransportQueueRecord}), and the
 * pure function that turns them into per-window statistics and a saturation verdict
 * ({@link summarizeTransportQueues}).
 *
 * ## Why the queue wait has its own table and is not inside AWT
 *
 * AWT is *lift* waiting time: registration at a landing to stepping into a car. A rider standing
 * at the foot of an escalator has not reached a lift landing, lights no button and is invisible to
 * every dispatcher, so their wait is not something a dispatcher can be credited with or blamed
 * for. It is still a wait, and it is still on the journey's time-to-destination — the next lift
 * leg does not begin until they step off, and a closing hop's wait is carried on the leg as
 * `PassengerRecord.egressQueueSeconds`. It is published here, beside AWT, on the footing
 * abandonment is: a figure that changes what the lift figures mean belongs next to them, never
 * folded in.
 *
 * ## Saturation is exact here, and that is why there is no threshold
 *
 * The lift trend test fits a line to a noisy queue series and needs two thresholds to tell growth
 * from scatter. This queue's server is deterministic — one rider every `3600 / capacity` seconds
 * — so the question *"did more people arrive than could possibly be carried?"* has an exact
 * answer: a window of `T` seconds can board at most `floor(T / headway) + 1` riders, and a window
 * that was offered more ends with a longer queue than it began with by at least the difference.
 * That is the closed form `sim/escalatorCapacity.test.ts` checks the simulation against: above
 * capacity the queue grows at `arrival rate − capacity`.
 *
 * Two more grounds cover the shapes that one cannot see, and they are the lift gate's own two.
 * **Not cleared**: a rider whose arrival at the far landing fell past the run's drain deadline.
 * Their wait is not a completed observation, and a mean taken beside them is the mean of the
 * riders who got through. **Starved**: a rider who stood there longer than the 900 s horizon
 * `serviceLevel` already applies to a lift wait. A window that runs on past the end of demand —
 * `full-run` does, by the whole drain tail — dilutes the count test exactly as a hump dilutes the
 * lift trend test (`docs/03` § Saturation detection, `fuzz-1001074`), and a queue that grew
 * enormously and drained in the tail would otherwise publish a mean. The horizon is reused rather
 * than chosen: this model has no reneging and no diversion, and a quarter of an hour at the foot
 * of an escalator is far past where either assumption describes anybody.
 *
 * Any ground sets {@link TransportQueueStatistics.saturated}, withholds that queue's mean wait,
 * and — through `awtValidity.ts`'s `transport-saturated` ground — withholds the lift AWT's
 * confidence interval too. The last step is not caution: an escalator that cannot carry its
 * demand **meters** the lifts behind it, so lift waiting time falls *because* people are being
 * held somewhere else. That is abandonment's shape exactly, and it gets abandonment's treatment.
 *
 * Nothing here reads a clock (invariant 3) or draws a random number (invariant 2), and every
 * function is pure.
 */

import type { SimTime } from '../kernel/types.js';
import type { Direction } from '../model/types.js';

import type { ReportWindow } from './types.js';

/* -------------------------------------------------------------------------- *
 * The record
 * -------------------------------------------------------------------------- */

/** One rider's turn at an escalator's boarding landing. */
export interface TransportBoardingRecord {
  /** The journey the rider is on. A journey boards a given queue at most once. */
  readonly journeyId: string;
  /**
   * When the rider reached the boarding landing and joined the queue.
   *
   * **The window membership key** for this table, by the rule every window in this module
   * follows: a rider belongs to the window they *arrived* in.
   */
  readonly enteredAt: SimTime;
  /**
   * When their turn came and they stepped on. Equal to {@link enteredAt} when nobody was ahead.
   *
   * Always present, even for a rider the run never saw board: the server is deterministic and
   * nobody leaves this queue, so a rider's turn is fixed at the instant they join it. Read it
   * with {@link cut}.
   */
  readonly boardedAt: SimTime;
  /**
   * Present, and `true`, when this rider would have reached the far landing after the run's
   * drain deadline — so the run ended with them still queued or still riding, and they are
   * named in `SimulationResult.undelivered` as `on-transport`.
   *
   * Absent on every rider who got through, so a run whose queues all cleared writes no such key.
   */
  readonly cut?: true | undefined;
}

/** One direction of one escalator: its declaration, and everybody who queued for it. */
export interface TransportQueueRecord {
  /** `TransportModeConfig.id`. */
  readonly modeId: string;
  /** Which of the pair this is. `up` boards at the lower landing. */
  readonly direction: Direction;
  /** The landing this queue forms at. */
  readonly boardingFloorId: string;
  /** The declared service rate, persons per hour. */
  readonly capacityPersonsPerHour: number;
  /** In the order they joined, which is the order they boarded. */
  readonly boardings: readonly TransportBoardingRecord[];
}

/* -------------------------------------------------------------------------- *
 * The summary
 * -------------------------------------------------------------------------- */

/** Why a queue's mean wait is withheld. */
export const TRANSPORT_SATURATION_GROUNDS = [
  /** More riders arrived in the window than the escalator can board in a window that long. */
  'over-capacity',
  /** A rider who arrived in the window had not got through when the run ended. */
  'not-cleared',
  /** A rider who arrived in the window stood in the queue for longer than the wait horizon. */
  'starved',
] as const;

export type TransportSaturationGround = (typeof TRANSPORT_SATURATION_GROUNDS)[number];

/** One escalator queue over one reporting window. */
export interface TransportQueueStatistics {
  readonly modeId: string;
  readonly direction: Direction;
  readonly boardingFloorId: string;
  readonly capacityPersonsPerHour: number;
  /** Riders who joined the queue inside the window. */
  readonly enteredCount: number;
  /** Of those, how many got through — reached the far landing before the run's deadline. */
  readonly clearedCount: number;
  /** Of those, how many did not. `enteredCount - clearedCount`. */
  readonly notClearedCount: number;
  /**
   * The most riders this queue can board in a window this long: `floor(T / headway) + 1`.
   *
   * The `+ 1` is the rider who steps on at the window's first instant. Printed because it is the
   * figure {@link enteredCount} is judged against, and a verdict whose bar is not shown is a
   * verdict nobody can check.
   */
  readonly maxBoardableCount: number;
  /**
   * Offered load as a share of capacity: riders per hour arriving in the window, over
   * {@link capacityPersonsPerHour}. Above `1` the queue cannot keep up.
   */
  readonly utilisation: number;
  /**
   * Mean seconds between joining the queue and stepping on, over {@link enteredCount}.
   *
   * **Absent when {@link saturated}**, and absent when nobody entered. A saturated queue's mean
   * depends on how long the window is rather than on the escalator, so it is not a property of
   * anything and is not printed.
   */
  readonly meanWaitS?: number | undefined;
  /**
   * The longest wait among riders who entered in the window. Published even when saturated,
   * where it is a **lower bound on what the queue would have reached** — the last rider's turn,
   * not the turn of the rider who would have arrived next.
   */
  readonly maxWaitS: number;
  /** The wait past which this queue is reported `starved`. `summarizeRun`'s `maxWaitHorizonS`. */
  readonly waitHorizonS: number;
  /** How many riders who entered in the window waited at all. */
  readonly waitedCount: number;
  /** The most riders standing in this queue at once, at any instant a rider joined it in the window. */
  readonly peakQueueLength: number;
  readonly saturated: boolean;
  /** Present exactly when {@link saturated}. The first ground that fired. */
  readonly saturationGround?: TransportSaturationGround | undefined;
}

function headwaySecondsOf(capacityPersonsPerHour: number): number {
  return 3600 / capacityPersonsPerHour;
}

function summarizeOne(
  queue: TransportQueueRecord,
  window: ReportWindow,
  horizonS: number,
): TransportQueueStatistics {
  const windowS = window.endS - window.startS;
  const headwayS = headwaySecondsOf(queue.capacityPersonsPerHour);
  const maxBoardableCount = Math.floor(windowS / headwayS) + 1;

  let enteredCount = 0;
  let notClearedCount = 0;
  let waitedCount = 0;
  let waitSum = 0;
  let maxWaitS = 0;
  let peakQueueLength = 0;
  // Index of the earliest rider who has not yet boarded as of the entry being examined. FIFO, so
  // `boardedAt` is non-decreasing and one forward-only pointer counts everybody still standing.
  let firstStillQueued = 0;

  for (const [index, boarding] of queue.boardings.entries()) {
    while (
      firstStillQueued < index &&
      (queue.boardings[firstStillQueued]?.boardedAt ?? Number.POSITIVE_INFINITY) <= boarding.enteredAt
    ) {
      firstStillQueued += 1;
    }
    if (boarding.enteredAt < window.startS || boarding.enteredAt >= window.endS) continue;
    enteredCount += 1;
    const waitS = boarding.boardedAt - boarding.enteredAt;
    waitSum += waitS;
    if (waitS > 0) waitedCount += 1;
    if (waitS > maxWaitS) maxWaitS = waitS;
    if (boarding.cut === true) notClearedCount += 1;
    // Everybody ahead who has not stepped on, plus this rider when they have to wait too.
    const standing = index - firstStillQueued + (waitS > 0 ? 1 : 0);
    if (standing > peakQueueLength) peakQueueLength = standing;
  }

  const saturationGround: TransportSaturationGround | undefined =
    enteredCount > maxBoardableCount
      ? 'over-capacity'
      : notClearedCount > 0
        ? 'not-cleared'
        : maxWaitS > horizonS
          ? 'starved'
          : undefined;
  const saturated = saturationGround !== undefined;

  return Object.freeze({
    modeId: queue.modeId,
    direction: queue.direction,
    boardingFloorId: queue.boardingFloorId,
    capacityPersonsPerHour: queue.capacityPersonsPerHour,
    enteredCount,
    clearedCount: enteredCount - notClearedCount,
    notClearedCount,
    maxBoardableCount,
    utilisation: windowS > 0 ? (enteredCount * 3600) / windowS / queue.capacityPersonsPerHour : 0,
    ...(saturated || enteredCount === 0 ? {} : { meanWaitS: waitSum / enteredCount }),
    maxWaitS,
    waitHorizonS: horizonS,
    waitedCount,
    peakQueueLength,
    saturated,
    ...(saturationGround === undefined ? {} : { saturationGround }),
  });
}

/**
 * Per-window statistics for every escalator queue a record carries, in the record's order.
 *
 * Pure, and total on a well-formed record. Returns `[]` for a record with no
 * `transportQueues`, which is every record of every building that declares no capacity.
 */
export function summarizeTransportQueues(
  queues: readonly TransportQueueRecord[] | undefined,
  window: ReportWindow,
  horizonS: number,
): readonly TransportQueueStatistics[] {
  return Object.freeze((queues ?? []).map((queue) => summarizeOne(queue, window, horizonS)));
}

/** The sentence a saturated queue is reported with — the run's own words for its verdict. */
export function describeTransportSaturation(
  queue: TransportQueueStatistics,
  windowSeconds: number,
): string {
  const where = `Escalator "${queue.modeId}" (${queue.direction}, boarding at ${queue.boardingFloorId})`;
  if (queue.saturationGround === 'over-capacity') {
    return `${where} was offered ${queue.enteredCount} riders in the ${windowSeconds.toFixed(0)} s reporting window against a declared capacity of ${queue.capacityPersonsPerHour} persons per hour, which can board at most ${queue.maxBoardableCount} in a window that long (${(queue.utilisation * 100).toFixed(0)}% of capacity); its queue grew by at least ${queue.enteredCount - queue.maxBoardableCount} riders over the window and the longest wait recorded there was ${queue.maxWaitS.toFixed(1)} s.`;
  }
  if (queue.saturationGround === 'starved') {
    return `${where} held a rider for ${queue.maxWaitS.toFixed(1)} s, past the ${queue.waitHorizonS.toFixed(0)} s wait horizon, against a declared capacity of ${queue.capacityPersonsPerHour} persons per hour; ${queue.enteredCount} riders joined it in the ${windowSeconds.toFixed(0)} s reporting window, which is long enough to board ${queue.maxBoardableCount}, so the count alone does not show it — the queue built while demand ran and drained afterwards.`;
  }
  return `${where} had ${queue.notClearedCount} of the ${queue.enteredCount} riders who joined it in the ${windowSeconds.toFixed(0)} s reporting window still queued or still riding when the run reached its drain deadline; the longest wait recorded there was ${queue.maxWaitS.toFixed(1)} s.`;
}
