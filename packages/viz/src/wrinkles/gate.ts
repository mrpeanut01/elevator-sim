/**
 * § 17's gate that matters — GitHub issue **#159**.
 *
 * `GAMEPLAY_AND_NAVIGATION.md` § 17, verbatim:
 *
 * > **The gate that matters:** a day only earns its place if it **changes which dispatcher wins**.
 * > Run the baseline dispatchers over a candidate day offline and keep it only if the ranking
 * > differs from yesterday's by more than noise — the same paired-run machinery the bench uses.
 * > Days that do not shuffle the ranking are cosmetic; discard them.
 *
 * ## Here, and using `batch/`, because § 17 says which machinery
 *
 * *"The same paired-run machinery the bench uses"* names `packages/viz/src/batch/`: `runBatch` runs
 * every arm over one passenger trace per replication — CRN by construction, because the dispatcher
 * is the one field `traceKeyOf` does not read — and `report.ts` is what the bench draws. A second
 * implementation in `packages/experiments` would have been a second answer to *did this shuffle the
 * ranking*, and would have had to re-derive the wrinkle's effect on the run, which `shiftRunPatch`
 * already owns.
 *
 * ## What *"differs from yesterday's by more than noise"* is taken to mean
 *
 * Two clauses, and both must hold:
 *
 * 1. **The ranking differs.** The arms are ordered by mean AWT on the candidate day and on a
 *    control day — the same building, the same seed, the same horizon, no wrinkle. A wrinkle that
 *    leaves the order alone is § 17's *cosmetic*.
 * 2. **The swap is resolvable.** Ordering two arms on a difference this apparatus cannot resolve is
 *    CLAUDE.md's named failure mode — *increasing lift speed appearing to increase average waiting
 *    time* — so the pair whose order changed is put through a **paired-t interval on the candidate
 *    day**, and the day is kept only if that interval excludes zero.
 *
 * The second clause is what stops this being a sort. A ranking computed from two means will differ
 * on almost every day if the means are close enough, and keeping a day on that basis would fill the
 * library with wrinkles that shuffle nothing a player could perceive and nothing this project would
 * be allowed to report.
 *
 * **What clause 2 measures, precisely, and what it does not.** The interval is taken on the
 * *candidate* day alone: it answers *are these two arms separable on this day*, not *is the
 * difference between the two days' orderings larger than noise*. A pair that is within noise on the
 * control day and separable on the candidate day is therefore kept, although some of the "swap" may
 * be control-day noise. The instrument for the stronger question is a difference-of-differences —
 * `benchmark/published.ts` publishes one under `difference-of-differences/absolute`
 * ([§ D280](../../../../DECISIONS.md)) — and it is **not** used here. The claim this gate makes is
 * the weaker one, said in the weaker words, because an overstated mechanism is the defect
 * `docs/05-roadmap.md`'s standing requirement records seven sites of.
 *
 * **`ttdMeanS` is not used and AWT is**, although the learned-control work reaches for TTD: a
 * ranking here is *which dispatcher wins*, and every shipped surface that orders dispatchers orders
 * them on wait. Changing the quantity would change what the gate is about.
 *
 * ## What it does not do
 *
 * It does not run itself. It is a function over a candidate wrinkle and a budget, and the caller
 * supplies both — `gate.test.ts` drives it at a small budget against the shipped library, and a
 * content author running the whole library at 50–200 replications is a study rather than a suite.
 * The replication floor is nonetheless enforced here rather than left to the caller, because an
 * interval below it is one CLAUDE.md forbids acting on.
 */

import { intervalContainsZero, pairedDifferenceEstimate } from '@elevator-sim/experiments/browser';
import type { MeanEstimate } from '@elevator-sim/experiments/browser';
import type { ResolvedBuilding, SimulationDemandOptions } from '@elevator-sim/core/browser';

import { MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchArmResult, BatchRequest, BatchResources, BatchResult } from '../batch/types.js';
import { shiftRunPatch } from '../shift/events.js';
import { serviceEventsFor } from '../shift/incidents.js';
import type { ShiftDemandBase } from '../shift/events.js';
import type { ShiftEvent } from '../shift/types.js';
import { everyWrinkle } from './draw.js';
import type { DrawnWrinkle, WrinkleLibrary } from './types.js';

/** One arm's standing on a day: its mean wait, and how many replications stood behind it. */
export interface WrinkleArmStanding {
  readonly armId: string;
  readonly meanAwtS: number;
  /** Replications whose own summary was entitled to quote a mean — R9's rule, not re-derived. */
  readonly quotable: number;
}

/** What the gate decided about one candidate day, and everything it decided it from. */
export interface WrinkleGateVerdict {
  readonly wrinkleId: string;
  /** `true` only when the ranking moved **and** the move is resolvable. */
  readonly earnsItsPlace: boolean;
  /**
   * Whether the gate was able to read the two days at all.
   *
   * `false` means **not judged**, which is a different fact from *judged and discarded* and the
   * distinction is load-bearing: § 17 says to *discard* a cosmetic day, so a content author acting
   * on `earnsItsPlace: false` would delete a day the gate never measured. Both are `false` on
   * `earnsItsPlace`; only one of them is a finding about the day.
   *
   * It went in because the gate got this wrong. With no quotable replication every arm's mean is
   * `NaN`, `Array.prototype.sort`'s comparator returns `NaN`, the spec treats that as `+0` and the
   * input order survives on **both** days — so the rankings matched, and the verdict read
   * *"leaves the ranking exactly as the control day had it (eta < collective < nearest-car), so it
   * is cosmetic"*, quoting the arms' declaration order as though it were a measurement. Reproduced
   * at `midtown-office` / 900 s, where all three arms are unquotable and every day read cosmetic.
   * That is CLAUDE.md's saturation rule inverted: *"if a configuration saturates, flag it and
   * suppress the AWT interval"*.
   */
  readonly judged: boolean;
  /** The reader's sentence. Says which clause failed when one did. */
  readonly reason: string;
  readonly candidateRanking: readonly WrinkleArmStanding[];
  readonly controlRanking: readonly WrinkleArmStanding[];
  /** The arms whose order changed, in control order, or `null` when nothing moved. */
  readonly swappedPair: readonly [string, string] | null;
  /** The paired-t interval on that pair, on the candidate day. `null` when nothing swapped. */
  readonly estimate: MeanEstimate | null;
}

export interface WrinkleGateInput {
  readonly wrinkle: DrawnWrinkle;
  readonly buildingId: string;
  readonly building: ResolvedBuilding;
  readonly resources: Omit<BatchResources, 'building'>;
  /** Dispatcher profile ids to rank. § 17's *"the baseline dispatchers"*. */
  readonly dispatcherProfileIds: readonly string[];
  readonly seed: string;
  readonly durationS: number;
  readonly replications: number;
  /** The demand the day would have run at with no wrinkle. `baseDemandOf`'s output. */
  readonly base: ShiftDemandBase;
}

/** Raised when the gate cannot be run at all, as distinct from a day it refuses. */
export class WrinkleGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrinkleGateError';
  }
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** An arm's per-replication AWT, `null` where the run's own summary refused to quote one. */
function awtSamples(arm: BatchArmResult): readonly (number | null)[] {
  return arm.replications.map((replication) =>
    replication.awtIsValid ? replication.metrics.awtS : null,
  );
}

/** Arms with too few quotable replications to stand behind a mean, on either day. */
function unquotableArms(result: BatchResult): readonly string[] {
  return result.arms
    .filter((arm) => awtSamples(arm).filter((value) => value !== null).length < 2)
    .map((arm) => arm.armId);
}

function rankingOf(result: BatchResult): readonly WrinkleArmStanding[] {
  return result.arms
    .map((arm) => {
      const quotable = awtSamples(arm).filter((value): value is number => value !== null);
      return { armId: arm.armId, meanAwtS: meanOf(quotable), quotable: quotable.length };
    })
    .slice()
    .sort((a, b) => a.meanAwtS - b.meanAwtS);
}

/**
 * The complete-case paired difference between two arms, over replications where **both** quoted.
 *
 * Complete-case rather than pairwise-deleted per arm, for `batch/report.ts`'s reason: a paired
 * interval over indices the two arms do not share is arithmetic on unrelated runs.
 */
function pairedAwt(result: BatchResult, firstId: string, secondId: string): MeanEstimate | null {
  const first = result.arms.find((arm) => arm.armId === firstId);
  const second = result.arms.find((arm) => arm.armId === secondId);
  if (first === undefined || second === undefined) return null;
  const a = awtSamples(first);
  const b = awtSamples(second);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === null || x === undefined || y === null || y === undefined) continue;
    left.push(x);
    right.push(y);
  }
  if (left.length < 2) return null;
  return pairedDifferenceEstimate(left, right);
}

/** The demand a wrinkle writes, and the building it derates, ready for a `runBatch` request. */
function dayOf(
  input: WrinkleGateInput,
  event: ShiftEvent | null,
): { demand: SimulationDemandOptions; building: ResolvedBuilding } {
  if (event === null) {
    return {
      demand: {
        arrivalRatePctPop5min: input.base.ratePctPop5min,
        directionalSplit: input.base.split,
      },
      building: input.building,
    };
  }
  const patch = shiftRunPatch({ event, building: input.building, base: input.base });
  const events = serviceEventsFor(patch.incidents, input.durationS);
  const building =
    events.length === 0
      ? input.building
      : {
          ...input.building,
          serviceEvents: [
            ...(input.building.serviceEvents ?? []),
            ...events.map((service) => ({
              atS: service.atS,
              bankId: service.bankId ?? '',
              carId: service.carId,
              mode: service.mode,
            })),
          ],
        };
  return {
    demand: {
      arrivalRatePctPop5min: input.base.ratePctPop5min,
      directionalSplit: input.base.split,
      ...patch.demand,
    },
    building,
  };
}

function requestOf(input: WrinkleGateInput, demand: SimulationDemandOptions): BatchRequest {
  return {
    buildingId: input.buildingId,
    seed: input.seed,
    durationS: input.durationS,
    replications: input.replications,
    arms: input.dispatcherProfileIds.map((id) => ({ armId: id, dispatcherProfileId: id })),
    arrivalRatePctPop5min: null,
    demand,
  };
}

/**
 * Run one candidate day against a control day and say whether it earns its place.
 *
 * @throws WrinkleGateError when the budget is below {@link MIN_REPLICATION_BUDGET}, or fewer than
 *   two dispatchers were given — a ranking of one arm cannot differ from anything.
 */
export function gateWrinkle(input: WrinkleGateInput): WrinkleGateVerdict {
  if (input.dispatcherProfileIds.length < 2) {
    throw new WrinkleGateError(
      'the gate ranks dispatchers, so it needs at least two; one arm cannot shuffle.',
    );
  }
  if (input.replications < MIN_REPLICATION_BUDGET) {
    throw new WrinkleGateError(
      `${String(input.replications)} replications is below the ${String(MIN_REPLICATION_BUDGET)} ` +
        'this project will act on — CLAUDE.md § Statistical discipline. A day kept on a thinner ' +
        'budget is a day kept on noise, which is the thing this gate exists to refuse.',
    );
  }

  const event: ShiftEvent = {
    id: input.wrinkle.id,
    name: input.wrinkle.name,
    note: input.wrinkle.note,
    effect: {
      ...input.wrinkle.effect,
      writes: [],
    },
  };

  const candidateDay = dayOf(input, event);
  const controlDay = dayOf(input, null);
  const candidate = runBatch(requestOf(input, candidateDay.demand), {
    ...input.resources,
    building: candidateDay.building,
  });
  const control = runBatch(requestOf(input, controlDay.demand), {
    ...input.resources,
    building: controlDay.building,
  });

  const candidateRanking = rankingOf(candidate);
  const controlRanking = rankingOf(control);

  /*
   * Refuse before ranking, not after. A mean over no quotable replication is `NaN`, and ranking on
   * `NaN` does not fail — it silently returns the order the arms were declared in.
   */
  const unquotable = [...new Set([...unquotableArms(candidate), ...unquotableArms(control)])];
  if (unquotable.length > 0) {
    return {
      wrinkleId: input.wrinkle.id,
      earnsItsPlace: false,
      judged: false,
      reason:
        `${input.wrinkle.id} was not judged: ${unquotable.join(', ')} quoted a mean on fewer than ` +
        'two replications, so there is no ranking to compare and no paired interval to take. ' +
        'Nothing here is a finding about the day itself — the gate could not read it. Run it on a ' +
        'building and horizon where the arms quote before drawing any conclusion about this day.',
      candidateRanking,
      controlRanking,
      swappedPair: null,
      estimate: null,
    };
  }

  const candidateOrder = candidateRanking.map((standing) => standing.armId);
  const controlOrder = controlRanking.map((standing) => standing.armId);
  const same = candidateOrder.every((armId, index) => armId === controlOrder[index]);

  if (same) {
    return {
      wrinkleId: input.wrinkle.id,
      earnsItsPlace: false,
      judged: true,
      reason:
        `${input.wrinkle.id} leaves the ranking exactly as the control day had it ` +
        `(${controlOrder.join(' < ')}), so it is cosmetic — § 17.`,
      candidateRanking,
      controlRanking,
      swappedPair: null,
      estimate: null,
    };
  }

  /*
   * The **first** position at which the two orders disagree, and the two arms that trade it. The
   * first rather than any, because that is the one *"which dispatcher wins"* is about: a shuffle
   * among the arms nobody would run is not a day changing the answer.
   */
  const at = candidateOrder.findIndex((armId, index) => armId !== controlOrder[index]);
  const winner = candidateOrder[at] ?? '';
  const displaced = controlOrder[at] ?? '';
  const estimate = pairedAwt(candidate, winner, displaced);

  if (estimate === null) {
    return {
      wrinkleId: input.wrinkle.id,
      earnsItsPlace: false,
      judged: true,
      reason:
        `${input.wrinkle.id} moved ${displaced} out of place for ${winner}, and too few ` +
        'replications quoted a mean on both arms for a paired interval to be taken — so whether ' +
        'the move is real is unmeasured, and an unmeasured move is not a kept day.',
      candidateRanking,
      controlRanking,
      swappedPair: [winner, displaced],
      estimate: null,
    };
  }

  const resolvable = !intervalContainsZero(estimate);
  return {
    wrinkleId: input.wrinkle.id,
    earnsItsPlace: resolvable,
    judged: true,
    reason: resolvable
      ? `${input.wrinkle.id} puts ${winner} ahead of ${displaced}, which the control day had the ` +
        `other way, and the paired interval on that pair excludes zero — it earns its place.`
      : `${input.wrinkle.id} puts ${winner} ahead of ${displaced} on the means, but the paired ` +
        'interval on that pair contains zero: the apparatus cannot resolve the swap, so ordering ' +
        'the two on it is the failure mode CLAUDE.md names. Discarded.',
    candidateRanking,
    controlRanking,
    swappedPair: [winner, displaced],
    estimate,
  };
}

/**
 * Run every concrete wrinkle in a library through {@link gateWrinkle}, in library order.
 *
 * § 17's gate is a question about a *library*, not about one day — *"days that do not shuffle the
 * ranking are cosmetic; discard them"* is a sweep — so this is the shape a content author actually
 * wants, and `gate.test.ts` drives it. Every verdict is returned, kept and discarded alike: which
 * days were refused is the useful half, and a function that returned only the survivors would make
 * the refusals unreadable.
 */
export function gateLibrary(
  library: WrinkleLibrary,
  input: Omit<WrinkleGateInput, 'wrinkle'>,
): readonly WrinkleGateVerdict[] {
  return everyWrinkle(library).map((wrinkle) => gateWrinkle({ ...input, wrinkle }));
}
