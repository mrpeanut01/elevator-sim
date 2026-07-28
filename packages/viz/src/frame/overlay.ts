/**
 * The live metrics overlay's data: `(recording, t) → OverlayMetrics`. Pure.
 *
 * ## Why this module is what justified widening the contract
 *
 * Everything the wave-1 recording could offer a metrics overlay was three *cumulative* step
 * functions on {@link VizProgress}. Cumulative counters are the one thing an overlay must not
 * lean on: a running mean over the whole run converges to a flat line within a minute of
 * simulated time and then stops responding to anything the viewer is watching. Every figure
 * that answers "what is happening **now**" — a rolling mean wait, the longest wait currently
 * standing, a per-bank split of who is being served — needs the individual legs, and
 * `foldPassengers` had already discarded them.
 *
 * So {@link VizLeg} was added and `VIZ_SCHEMA_VERSION` bumped to 3, in the same change as this
 * file, which is its consumer. `DECISIONS.md` D15 reserved exactly that move and required
 * exactly that pairing.
 *
 * ## Statistical honesty, applied to a picture
 *
 * `CLAUDE.md` § Statistical discipline: *if a configuration saturates, flag it and suppress the
 * AWT interval; do not report a mean for a system whose queues grow without bound.* That rule
 * is about the report, and it is about the overlay for the same reason — a rolling mean drawn
 * over a diverging queue is a confident line through nonsense, and it is *more* persuasive than
 * a table because it moves.
 *
 * The split this module draws is therefore between **observations** and **estimates**:
 *
 * | Kind | Examples | Suppressed on a saturated run? |
 * |---|---|---|
 * | Observation | legs waiting now, longest current wait, legs boarded in the window | **no** — these are facts about the recording, and they are precisely what a viewer needs in order to *see* the divergence |
 * | Estimate | rolling mean wait, per-bank mean wait | **yes** — a mean of a quantity whose distribution has no steady state |
 *
 * {@link OverlayMetrics.suppressed} is derived from `recording.summary` — `saturated` or
 * `awtIsValid === false` — and never recomputed here. `UX.md` § 7.1 rule 4: two sources of
 * truth for "may I show this mean" is the failure this project exists to avoid.
 *
 * ## Cost
 *
 * `recording.legs` is sorted by `arrivedAt`, so the scan starts at the first leg that could
 * matter and stops at `t`. A 900 s run of the largest shipped building holds a few thousand
 * legs; the whole computation is a single pass over the ones that had arrived, which is
 * comfortably inside a 60 Hz frame budget and needs no cache — and a cache is exactly what would
 * make this impure and break scrubbing backwards.
 */

import type { Direction, SimTime } from '@elevator-sim/core';

import type { VizLeg, VizRecording } from '../contract/types.js';

/**
 * The trailing window, in simulated seconds.
 *
 * 300 s is not arbitrary: it is the interval `docs/03-traffic-and-statistics.md` reports demand
 * in (% of population per 5 minutes) and the hold length of the CIBSE rise-and-fall template.
 * A rolling figure over the same span as the demand it responds to is readable; one over 30 s is
 * noise and one over the whole run is the cumulative counter this module exists to replace.
 */
export const DEFAULT_WINDOW_S = 300;

/** One bank's share of the window. */
export interface BankMetrics {
  readonly bankId: string;
  /** Legs this bank answered inside the window. An observation. */
  readonly boardedInWindow: number;
  /** Mean wait of those legs. An **estimate**: `undefined` when suppressed or when none. */
  readonly meanWaitS: number | undefined;
}

/** What the overlay draws at one instant. */
export interface OverlayMetrics {
  readonly simTimeS: SimTime;
  readonly windowS: number;
  /** `max(startedAt, simTimeS - windowS)`, so the label can say what it actually covered. */
  readonly windowStartS: SimTime;
  /** Legs standing at a landing at `simTimeS`. Agrees with `Frame.totalWaiting` by construction. */
  readonly waitingNow: number;
  /** Longest wait among the legs standing now, seconds. `undefined` when nobody is waiting. */
  readonly longestCurrentWaitS: number | undefined;
  /** Legs whose wait ended inside the window. An observation. */
  readonly boardedInWindow: number;
  /** Mean wait of those legs. An **estimate** — `undefined` when suppressed or when none. */
  readonly rollingMeanWaitS: number | undefined;
  /** Copied from `recording.summary`, never recomputed. */
  readonly suppressed: boolean;
  readonly suppressionReason: string | undefined;
  /** One row per bank that answered anything in the window, sorted by bank id. */
  readonly banks: readonly BankMetrics[];
}

export interface OverlayOptions {
  readonly windowS?: number;
}

/**
 * A leg is waiting at `t` when it had arrived and had not yet boarded.
 *
 * Right-continuous at both ends, matching `stepValueAt` and `foldPassengers`: a leg that arrives
 * at exactly `t` is waiting at `t`, and one that boards at exactly `t` is not. That agreement is
 * what makes {@link OverlayMetrics.waitingNow} equal `Frame.totalWaiting`, which
 * `overlay.test.ts` asserts on every shipped building rather than trusting the reading.
 */
function isWaitingAt(leg: VizLeg, t: SimTime): boolean {
  if (leg.arrivedAt > t) return false;
  return leg.boardedAt === undefined || leg.boardedAt > t;
}

export function overlayAt(
  recording: VizRecording,
  simTimeS: SimTime,
  options: OverlayOptions = {},
): OverlayMetrics {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const windowS = options.windowS ?? DEFAULT_WINDOW_S;
  const windowStartS = Math.max(recording.startedAt, t - windowS);

  const suppressed = recording.summary.saturated || !recording.summary.awtIsValid;
  const suppressionReason = suppressed
    ? (recording.summary.awtInvalidReason ??
      'the run saturated: the queues did not reach a steady state, so a mean wait describes nothing.')
    : undefined;

  let waitingNow = 0;
  let longestCurrentWaitS: number | undefined;
  let boardedInWindow = 0;
  let waitSum = 0;
  const banks = new Map<string, { boarded: number; waitSum: number }>();

  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break; // sorted by arrivedAt; nothing after this has happened yet
    if (isWaitingAt(leg, t)) {
      waitingNow += 1;
      const waited = t - leg.arrivedAt;
      if (longestCurrentWaitS === undefined || waited > longestCurrentWaitS) {
        longestCurrentWaitS = waited;
      }
      continue;
    }
    const boardedAt = leg.boardedAt;
    if (boardedAt === undefined || boardedAt < windowStartS || boardedAt > t) continue;
    const waited = boardedAt - leg.arrivedAt;
    boardedInWindow += 1;
    waitSum += waited;
    const bankId = leg.bankId;
    if (bankId === undefined) continue;
    const bucket = banks.get(bankId) ?? { boarded: 0, waitSum: 0 };
    bucket.boarded += 1;
    bucket.waitSum += waited;
    banks.set(bankId, bucket);
  }

  const bankRows: BankMetrics[] = [...banks.entries()]
    .map(([bankId, bucket]) => ({
      bankId,
      boardedInWindow: bucket.boarded,
      meanWaitS: suppressed || bucket.boarded === 0 ? undefined : bucket.waitSum / bucket.boarded,
    }))
    .sort((a, b) => a.bankId.localeCompare(b.bankId));

  return {
    simTimeS: t,
    windowS,
    windowStartS,
    waitingNow,
    longestCurrentWaitS,
    boardedInWindow,
    rollingMeanWaitS: suppressed || boardedInWindow === 0 ? undefined : waitSum / boardedInWindow,
    suppressed,
    suppressionReason,
    banks: bankRows,
  };
}

/* -------------------------------------------------------------------------- *
 * RV-T3 — which car answers this landing
 * -------------------------------------------------------------------------- */

/**
 * One landing at one instant, with the assignment the run itself recorded.
 *
 * {@link answeredByCarId} is forward-looking on purpose, and the label the renderer draws says
 * so ("→ car A in 12 s"). This is a *replay*, not a live system: the recording already knows
 * which car boarded the oldest waiting leg and when. `UX.md` `RV-T3` asks that "the assignment
 * shown matches the record", and taking it straight off the record is the only way to guarantee
 * that rather than to hope for it.
 *
 * `undefined` means the run never answered this call — `UX.md` `RV-08`'s unassignable landing,
 * which must read as unassignable rather than as an ever-growing wait.
 */
export interface LandingAssignment {
  readonly floorId: string;
  readonly direction: Direction;
  readonly waiting: number;
  /** Wait of the longest-standing leg at this landing, seconds. */
  readonly oldestWaitS: number | undefined;
  readonly answeredByCarId: string | undefined;
  readonly answeredByBankId: string | undefined;
  /** Simulated seconds from now until that boarding. `undefined` when never answered. */
  readonly answeredInS: number | undefined;
}

/**
 * Every landing with somebody standing at it, at `t`, sorted by `(floorId, direction)`.
 *
 * Landings with nobody waiting are omitted rather than listed as empty rows: the caller is a
 * hover lookup and a panel, and an entry per floor per direction on a 60-floor building is 120
 * rows of nothing.
 */
export function landingAssignmentsAt(
  recording: VizRecording,
  simTimeS: SimTime,
): readonly LandingAssignment[] {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const byKey = new Map<string, { floorId: string; direction: Direction; waiting: number; oldest: VizLeg }>();

  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break;
    if (!isWaitingAt(leg, t)) continue;
    const key = `${leg.originFloorId} ${leg.direction}`;
    const entry = byKey.get(key);
    if (entry === undefined) {
      byKey.set(key, {
        floorId: leg.originFloorId,
        direction: leg.direction,
        waiting: 1,
        oldest: leg,
      });
      continue;
    }
    entry.waiting += 1;
    // `legs` is sorted by `(arrivedAt, passengerId)`, so the first one seen at a key is already
    // the oldest. Comparing anyway rather than relying on it: the ordering is documented on the
    // contract, and a lookup that silently depends on it would break quietly if it ever moved.
    if (leg.arrivedAt < entry.oldest.arrivedAt) entry.oldest = leg;
  }

  return [...byKey.values()]
    .map((entry): LandingAssignment => {
      const { oldest } = entry;
      return {
        floorId: entry.floorId,
        direction: entry.direction,
        waiting: entry.waiting,
        oldestWaitS: t - oldest.arrivedAt,
        answeredByCarId: oldest.carId,
        answeredByBankId: oldest.bankId,
        answeredInS: oldest.boardedAt === undefined ? undefined : oldest.boardedAt - t,
      };
    })
    .sort((a, b) => a.floorId.localeCompare(b.floorId) || a.direction.localeCompare(b.direction));
}

/** The assignment at one landing, or `undefined` when nobody is waiting there. */
export function landingAssignmentAt(
  recording: VizRecording,
  floorId: string,
  simTimeS: SimTime,
): LandingAssignment | undefined {
  return landingAssignmentsAt(recording, simTimeS).find(
    (assignment) => assignment.floorId === floorId,
  );
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
