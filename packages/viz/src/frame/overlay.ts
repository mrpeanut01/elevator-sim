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

import type { Direction, SimTime } from '@elevator-sim/core/browser';

import type { VizLeg, VizRecording, VizSummary } from '../contract/types.js';

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
 *
 * Exported since slice 4d: this module is the one that decides who is waiting, and the race
 * strip's standing-count lane asks it rather than re-deriving the answer — a second answer over
 * there would be the two-answers divergence this package has a rule about. Non-test callers:
 * {@link overlayAt}, {@link landingAssignmentsAt} and {@link queueAt} here, and
 * `live/raceStrip.ts#raceSamplesOf`.
 */
export function isWaitingAt(leg: VizLeg, t: SimTime): boolean {
  if (leg.arrivedAt > t) return false;
  /*
   * **A rider the building turned away is not waiting** — `DECISIONS.md` § D266. They never board
   * and never get a car, so on `boardedAt` alone they are indistinguishable from somebody standing
   * there for the rest of the run; drawing them in the queue would make a credential refusal look
   * like a service failure on every surface that folds this predicate, which is the one reading
   * § D266 exists to refuse. `refusedAt` is absent on every leg of every building that declares no
   * `accessZones`, so this term is inert on three of the eight shipped buildings.
   *
   * Right-continuous with the rest: refused at exactly `t` means not waiting at `t`, which is the
   * convention `boardedAt` follows one line down.
   */
  if (leg.refusedAt !== undefined && leg.refusedAt <= t) return false;
  return leg.boardedAt === undefined || leg.boardedAt > t;
}

/**
 * May this run's *estimates* be shown at all? — `UX.md` § 7.1 rule 4, and `D1`.
 *
 * The two grounds the summary already decided on, read straight off it and never recomputed.
 * It lives here, with the metrics, rather than in a renderer, because the question is a fact
 * about the recording and every surface must get the same answer to it. There are three surfaces
 * and there were three copies of the expression: `overlayAt` below, `dev/main.ts`'s status line,
 * and — the one that got it wrong — `render/canvas.ts`'s header, which drew
 * `mean wait so far 87.7 s` on the line under the `SATURATED — AWT suppressed` banner it drew
 * itself. Three copies of a rule is three chances to keep two of them.
 *
 * Note what it is deliberately **not** sensitive to: a `timed-out` status, or undelivered
 * passengers. Those are `RV-16`'s banner, and a run can end with people still in the system and
 * still have a mean the statistics module stands behind. `awtIsValid` is the summary's own
 * verdict and it already accounts for censoring — four grounds' worth, per `CLAUDE.md`.
 */
export function meansAreSuppressed(recording: VizRecording): boolean {
  return recording.summary.saturated || !recording.summary.awtIsValid;
}

export function overlayAt(
  recording: VizRecording,
  simTimeS: SimTime,
  options: OverlayOptions = {},
): OverlayMetrics {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const windowS = options.windowS ?? DEFAULT_WINDOW_S;
  const windowStartS = Math.max(recording.startedAt, t - windowS);

  const suppressed = meansAreSuppressed(recording);
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
 * One landing **call** at one instant, with the assignment the run itself recorded.
 *
 * {@link answeredByCarId} is forward-looking on purpose, and the label the renderer draws says
 * so ("→ car A in 12 s"). This is a *replay*, not a live system: the recording already knows
 * which car boarded the oldest waiting leg and when. `UX.md` `RV-T3` asks that "the assignment
 * shown matches the record", and taking it straight off the record is the only way to guarantee
 * that rather than to hope for it.
 *
 * ## What a *call* is depends on the passenger model, and that is the whole of version 4
 *
 * Under `conventional` — the up/down button, and destination *disclosure* too — a call is one
 * `(floorId, direction)` button, everybody pressing it is pressing the same thing, and whichever
 * car opens takes whoever fits. One row per landing is the truth.
 *
 * Under `destination-dispatch` there is no direction button. docs/09 § 1.3: the call identity is
 * the origin-destination pair, and the panel has already named a car for each. So a row here is
 * a `(floorId, destinationFloorId, promisedCarId)` group, and there are **several rows per
 * floor**: measured on Midtown Office, 92 calls and 132 promise groups behind the 28 landings a
 * version-3 recording drew.
 *
 * `answeredByCarId === undefined` means the run never answered this call — `UX.md` `RV-08`'s
 * unassignable landing. Under a panel that reading is only available when {@link promisedCarId}
 * is *also* absent, which it never is: a promised passenger still waiting at the horizon is not
 * an unassignable call, and saying so was the falsehood version 4 exists to remove.
 */
export interface LandingAssignment {
  /**
   * Identity of this row, total and stable across instants.
   *
   * `floorId` alone stopped being a key under a panel, and a selector keyed on it would offer
   * several options with the same value. The renderer highlights a *floor row* from
   * {@link floorId}; a caller that has to remember which call the reader picked uses this.
   */
  readonly key: string;
  readonly floorId: string;
  readonly direction: Direction;
  /**
   * The destination this call is for, under `destination-dispatch`. `undefined` conventionally,
   * where the landing is one button and its passengers are going to different places.
   */
  readonly destinationFloorId: string | undefined;
  /**
   * The car the landing panel promised this group, under `destination-dispatch`.
   *
   * Known from the instant each passenger arrived — this is a fact the run recorded, not an
   * inference from who eventually boarded. `undefined` conventionally, where nothing promises.
   */
  readonly promisedCarId: string | undefined;
  readonly waiting: number;
  /** Wait of the longest-standing leg at this landing, seconds. */
  readonly oldestWaitS: number | undefined;
  readonly answeredByCarId: string | undefined;
  readonly answeredByBankId: string | undefined;
  /** Simulated seconds from now until that boarding. `undefined` when never answered. */
  readonly answeredInS: number | undefined;
}

/**
 * The grouping key, which is what the passenger model decides.
 *
 * Sorted-tuple form rather than a template literal per model, so the sort below can be a plain
 * comparison on the same fields the key is built from and the two cannot disagree.
 */
function callGroupOf(
  leg: VizLeg,
  model: VizRecording['passengerModel'],
): { readonly key: string; readonly destinationFloorId: string | undefined; readonly promisedCarId: string | undefined } {
  if (model !== 'destination-dispatch') {
    return {
      key: `${leg.originFloorId} ${leg.direction}`,
      destinationFloorId: undefined,
      promisedCarId: undefined,
    };
  }
  // Two arrivals for the same OD pair inside `batchWindowS` merge into one call and share a car;
  // two outside it are two calls and need not. So the promise is part of the identity, not a
  // property of the (floor, destination) pair — measured: 30 OD pairs on Midtown Office are
  // promised more than one car over a 900 s run.
  const promised = leg.assignedCarId;
  return {
    key: `${leg.originFloorId} ${leg.direction} ${leg.destinationFloorId} ${promised ?? ''}`,
    destinationFloorId: leg.destinationFloorId,
    promisedCarId: promised,
  };
}

/**
 * Every landing call with somebody standing at it, at `t`, sorted by {@link LandingAssignment.key}.
 *
 * Calls with nobody waiting are omitted rather than listed as empty rows: the caller is a
 * hover lookup and a panel, and an entry per floor per direction on a 60-floor building is 120
 * rows of nothing.
 */
export function landingAssignmentsAt(
  recording: VizRecording,
  simTimeS: SimTime,
): readonly LandingAssignment[] {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const byKey = new Map<
    string,
    {
      key: string;
      floorId: string;
      direction: Direction;
      destinationFloorId: string | undefined;
      promisedCarId: string | undefined;
      waiting: number;
      oldest: VizLeg;
    }
  >();

  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break;
    if (!isWaitingAt(leg, t)) continue;
    const group = callGroupOf(leg, recording.passengerModel);
    const entry = byKey.get(group.key);
    if (entry === undefined) {
      byKey.set(group.key, {
        key: group.key,
        floorId: leg.originFloorId,
        direction: leg.direction,
        destinationFloorId: group.destinationFloorId,
        promisedCarId: group.promisedCarId,
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
        key: entry.key,
        floorId: entry.floorId,
        direction: entry.direction,
        destinationFloorId: entry.destinationFloorId,
        promisedCarId: entry.promisedCarId,
        waiting: entry.waiting,
        oldestWaitS: t - oldest.arrivedAt,
        answeredByCarId: oldest.carId,
        answeredByBankId: oldest.bankId,
        answeredInS: oldest.boardedAt === undefined ? undefined : oldest.boardedAt - t,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* -------------------------------------------------------------------------- *
 * U4 — the per-floor rider queue (`docs/10-experience-layer-contract.md` § 6)
 * -------------------------------------------------------------------------- */

/**
 * How long somebody has been standing, banded — `docs/10` § 6.2.
 *
 * Four bands, and **three of the four boundaries are the run's own numbers rather than this
 * module's**: `longWaitThresholdS` and `serviceLevel.horizonS` are carried on {@link VizSummary}
 * since schema 5, so a building that reports long waits at 45 s bands its riders at 45 s. Only the
 * first boundary is derived — half the long-wait threshold — and it is derived rather than written
 * down for the same reason.
 *
 * The names are the *fact*, not the feeling: `long` means *past the threshold this run counts a
 * long wait at*, and `abandoned` means *past the horizon beyond which `core` stops counting the
 * wait at all*. The mood vocabulary is a separate mapping in `render/riderQueue.ts`, so a change to
 * how a queue *feels* cannot quietly change what a band *is*.
 */
export type WaitBand = 'settling' | 'waiting' | 'long' | 'abandoned';

/** The three boundaries between the four {@link WaitBand}s, in simulated seconds. */
export interface WaitBandThresholds {
  /** Below this, `settling`. Half the long-wait threshold. */
  readonly settlingS: number;
  /** At or above this, `long`. `RunSummary.waiting.longWaitThresholdS`, never assumed. */
  readonly longS: number;
  /** At or above this, `abandoned`. `RunSummary.serviceLevel.horizonS`, never assumed. */
  readonly horizonS: number;
}

/**
 * The bands this run's own summary implies.
 *
 * Takes the summary rather than the recording so that a caller cannot accidentally band by a
 * *different* run's thresholds than the one it is drawing, and so the function is callable from a
 * test with a summary alone.
 */
export function waitBandsOf(
  summary: Pick<VizSummary, 'longWaitThresholdS' | 'serviceLevel'>,
): WaitBandThresholds {
  const longS = summary.longWaitThresholdS;
  return { settlingS: longS / 2, longS, horizonS: summary.serviceLevel.horizonS };
}

/**
 * Which band a wait of `waitedS` falls in.
 *
 * Tested descending so the classification is monotone in `waitedS` whatever order the thresholds
 * happen to be in. A building whose horizon is below its long-wait threshold is a misconfiguration
 * and not this function's to diagnose, but it must not produce a band that goes *down* as somebody
 * waits longer, which an ascending chain would.
 */
export function waitBandOf(waitedS: number, thresholds: WaitBandThresholds): WaitBand {
  if (waitedS >= thresholds.horizonS) return 'abandoned';
  if (waitedS >= thresholds.longS) return 'long';
  if (waitedS >= thresholds.settlingS) return 'waiting';
  return 'settling';
}

/** Ascending severity, so a caller can take the worst of a set without a comparison table. */
const BAND_ORDER: readonly WaitBand[] = ['settling', 'waiting', 'long', 'abandoned'];

/** The more severe of two bands. Total, and the only place the ordering is decided. */
export function worseBand(a: WaitBand, b: WaitBand): WaitBand {
  return BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b;
}

/** One person standing at a landing, at one instant. */
export interface QueuedRider {
  readonly passengerId: string;
  /** `t - arrivedAt`. The individual's own wait, not the landing's oldest. */
  readonly waitedS: number;
  readonly direction: Direction;
  readonly destinationFloorId: string;
  /** The car the landing panel promised them. `undefined` under the conventional model. */
  readonly promisedCarId: string | undefined;
  readonly band: WaitBand;
}

/**
 * One promise group at a landing — the partition `docs/10` § 6.2 requires under a panel.
 *
 * *"The renderer must therefore group the glyphs by promised car and label the group, or it will
 * draw a Level-1 building as a Level-0 one — the exact defect version 4 exists to prevent."*
 * Conventionally there is exactly one group per floor and its {@link promisedCarId} is `undefined`,
 * so the renderer has one shape to draw rather than two code paths.
 */
export interface QueueGroup {
  /** `promisedCarId ?? ''`. Stable, and what the groups are sorted by. */
  readonly key: string;
  readonly promisedCarId: string | undefined;
  /** Members, in the array's own `(arrivedAt, passengerId)` order — first come, first drawn. */
  readonly riders: readonly QueuedRider[];
  readonly total: number;
  readonly oldestWaitS: number;
}

/** Everybody standing at one floor, at one instant. */
export interface FloorQueue {
  readonly floorId: string;
  /** Every rider at this floor, oldest first. */
  readonly riders: readonly QueuedRider[];
  /** The same riders, partitioned by promised car. One group conventionally. */
  readonly groups: readonly QueueGroup[];
  readonly total: number;
  readonly oldestWaitS: number;
  /** The worst band anybody here is in — what the floor's own marker shows. */
  readonly worstBand: WaitBand;
  /**
   * Legs that boarded **at this floor** within {@link QueueOptions.reliefWindowS} of `t`.
   *
   * The relief transition, as an observation. A rider who boards leaves the queue and would
   * otherwise vanish between two frames with nothing on screen distinguishing *"a car came"* from
   * *"they were never here"* — which is the one moment in a run where the dispatcher visibly did
   * its job. Counted rather than listed: the glyph is a tally at the landing, not a manifest.
   */
  readonly recentlyBoarded: number;
}

export interface QueueOptions {
  /**
   * How long a boarding stays on screen as relief, in **simulated** seconds.
   *
   * A display dwell, and the only number in this module that is not the run's own. It is not a
   * modelling constant and nothing statistical reads it: it decides how long a `✓` lingers. The
   * caller may override it; five seconds is roughly a door cycle on the shipped buildings, so the
   * mark is still up while the car that caused it is still at the floor.
   */
  readonly reliefWindowS?: number;
}

export const DEFAULT_RELIEF_WINDOW_S = 5;

/**
 * Every floor with somebody standing at it, at `t` — `docs/10` § 6.1's `queueAt`.
 *
 * ## Why this needed no contract change
 *
 * § 2.3 claims a per-floor queue of individual riders is derivable from `VizLeg` with **zero** new
 * fields, and it is: {@link isWaitingAt} decides membership, `t - arrivedAt` is the wait,
 * `destinationFloorId` is where they are going and `assignedCarId` is the promise. The claim was
 * checked against the code before this function was written and holds, with one wording
 * correction recorded in the delivery report: `isWaitingAt` was module-*private*, not "already
 * exposed", so this is the change that gives it a second caller inside its own file.
 *
 * ## Ordering, and what it means on screen
 *
 * Floors come back in the **building's** order (`recording.floors`), never sorted by id — sorting
 * floor ids as strings reads `11, 12, 16, 20, 3, 4` and puts the third storey above the twentieth.
 * Riders come back in `legs` order, which the contract states is `(arrivedAt, passengerId)`, so a
 * row drawn left to right is first-come-first-served and the reader can see the queue's age
 * gradient without a legend.
 *
 * Floors with nobody on them are omitted rather than returned empty, exactly as
 * {@link landingAssignmentsAt} omits them: a 100-floor building would otherwise return 100 rows of
 * nothing every frame. `sum(total)` therefore still equals `Frame.totalWaiting`, which
 * `queue.test.ts` asserts on every shipped building at every sampled instant.
 */
export function queueAt(
  recording: VizRecording,
  simTimeS: SimTime,
  options: QueueOptions = {},
): readonly FloorQueue[] {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const reliefWindowS = options.reliefWindowS ?? DEFAULT_RELIEF_WINDOW_S;
  const thresholds = waitBandsOf(recording.summary);
  const panel = recording.passengerModel === 'destination-dispatch';

  interface Draft {
    readonly riders: QueuedRider[];
    readonly groups: Map<string, QueuedRider[]>;
    boarded: number;
  }
  const byFloor = new Map<string, Draft>();
  const draftFor = (floorId: string): Draft => {
    const existing = byFloor.get(floorId);
    if (existing !== undefined) return existing;
    const created: Draft = { riders: [], groups: new Map(), boarded: 0 };
    byFloor.set(floorId, created);
    return created;
  };

  for (const leg of recording.legs) {
    if (leg.arrivedAt > t) break; // sorted by arrivedAt, exactly as `overlayAt` relies on
    if (isWaitingAt(leg, t)) {
      const waitedS = t - leg.arrivedAt;
      // The promise is a fact about the passenger under a panel and absent otherwise. It is read
      // off the leg rather than inferred from who eventually boarded — `carId` would be the
      // outcome, and a promise nobody kept is precisely the case version 4 exists to draw.
      const promisedCarId = panel ? leg.assignedCarId : undefined;
      const rider: QueuedRider = {
        passengerId: leg.passengerId,
        waitedS,
        direction: leg.direction,
        destinationFloorId: leg.destinationFloorId,
        promisedCarId,
        band: waitBandOf(waitedS, thresholds),
      };
      const draft = draftFor(leg.originFloorId);
      draft.riders.push(rider);
      const key = promisedCarId ?? '';
      const group = draft.groups.get(key);
      if (group === undefined) draft.groups.set(key, [rider]);
      else group.push(rider);
      continue;
    }
    const boardedAt = leg.boardedAt;
    if (boardedAt === undefined || boardedAt > t || boardedAt <= t - reliefWindowS) continue;
    draftFor(leg.originFloorId).boarded += 1;
  }

  const queues: FloorQueue[] = [];
  for (const floor of recording.floors) {
    const draft = byFloor.get(floor.id);
    if (draft === undefined) continue;
    if (draft.riders.length === 0 && draft.boarded === 0) continue;
    const groups: QueueGroup[] = [...draft.groups.entries()]
      .map(([key, riders]): QueueGroup => {
        const first = riders[0];
        return {
          key,
          promisedCarId: key === '' ? undefined : key,
          riders,
          total: riders.length,
          // `riders` is filled in `legs` order, so the first is the oldest. Reduced anyway rather
          // than indexed: the ordering is a property of the contract and a lookup that silently
          // depended on it would break quietly if it ever moved.
          oldestWaitS: riders.reduce((best, rider) => Math.max(best, rider.waitedS), first?.waitedS ?? 0),
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
    queues.push({
      floorId: floor.id,
      riders: draft.riders,
      groups,
      total: draft.riders.length,
      oldestWaitS: draft.riders.reduce((best, rider) => Math.max(best, rider.waitedS), 0),
      worstBand: draft.riders.reduce<WaitBand>(
        (worst, rider) => worseBand(worst, rider.band),
        'settling',
      ),
      recentlyBoarded: draft.boarded,
    });
  }
  return queues;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
