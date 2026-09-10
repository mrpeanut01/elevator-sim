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
 * ## Complete-case-or-nothing, which is `batch/report.ts`'s rule and was very nearly not kept here
 *
 * A replication counts only if its own summary quoted a mean, and this gate **refuses the day
 * outright** unless *every* replication quotes on *every* arm on *both* days. It does not average
 * the ones that held.
 *
 * That is `batch/report.ts`'s R1, and its argument is the reason rather than its authority being:
 *
 * > The rejected alternative is the tempting one — average the pairs that held and print the reduced
 * > `n`. It is rejected because it is **selection on the outcome** … the traces that fall out are
 * > exactly the ones where the dispatchers differ most. The surviving subset therefore understates
 * > the difference in the regime a player is trying to fix, and it does so while displaying an
 * > honest `n` — which makes it worse than a blank, not better.
 *
 * The first draft of this file did exactly that rejected thing while citing `report.ts` for it, and
 * every one of the nine days it kept was kept on 44 to 48 pairs of 50. Review measured that. The
 * bias runs the wrong way for a *content* gate in particular: the traces that drop out are the ones
 * the dispatchers disagree on, so a day would be kept or discarded on the traces that agree.
 *
 * **The cost is that the caller must pick an operating point where the arms quote**, which is a real
 * constraint and not a formality — at Garden Apartments' residential rate the peak-5-minute window
 * is empty on 2 of 50 replications, so the whole sweep is unjudgeable until {@link
 * WrinkleGateInput.reportWindow} is `'full-run'`. That is the same correction `benchmark/matrixCells.ts`
 * makes to the same building for the same reason, and it is why the field is on the input at all.
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
import type {
  ResolvedBuilding,
  SimulationDemandOptions,
  WindowSelection,
} from '@elevator-sim/core/browser';

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
  /**
   * Which window each run's summary is computed over, or absent for the run's own default.
   *
   * Load-bearing rather than a pass-through: the default peak-5-minute window is empty often enough
   * on a sparse building to make every day unjudgeable under the complete-case rule above. See the
   * module docstring.
   */
  readonly reportWindow?: WindowSelection | undefined;
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

/**
 * Arms that did not quote a mean on **every** replication, named with their counts.
 *
 * Not *"too few to average"* — `batch/report.ts`'s R1 is that a single dropped pair suppresses the
 * row, because the pairs that drop are the ones the arms differ most on. See the module docstring.
 */
function shortArms(result: BatchResult, requested: number, day: string): readonly string[] {
  const out: string[] = [];
  for (const arm of result.arms) {
    const quotable = awtSamples(arm).filter((value) => value !== null).length;
    /*
     * Against `requested`, not against the arm's own recorded length. Those agree today — `runBatch`
     * gives every arm exactly `request.replications` entries and `armConfigOf` throws rather than
     * skipping — but an arm that recorded nothing would read `0 < 0` and pass a guard whose whole
     * job is to stop a `NaN` reaching the ranking. The count the caller asked for is the one the
     * rule is about.
     */
    if (quotable < requested) {
      out.push(`${arm.armId} ${String(quotable)}/${String(requested)} on the ${day} day`);
    }
  }
  return out;
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
 * The paired difference between two arms.
 *
 * Reached only after {@link shortArms} has found nothing, so by the time this runs every
 * replication quotes on every arm and the pairing is total. The `null` guards below are therefore
 * unreachable in the shipped path and are kept as a floor rather than as a filter — this function
 * must not become the place that quietly averages survivors, which is what the module docstring is
 * about. An earlier draft's docstring cited `batch/report.ts` for *"complete-case"* while doing the
 * opposite of what that file means by it; the rule now lives one level up, where it can refuse.
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
    ...(input.reportWindow === undefined ? {} : { reportWindow: input.reportWindow }),
  };
}

/**
 * Run one candidate day against a control day and say whether it earns its place.
 *
 * @throws WrinkleGateError when the budget is below {@link MIN_REPLICATION_BUDGET}, or fewer than
 *   two dispatchers were given — a ranking of one arm cannot differ from anything.
 */
export function gateWrinkle(input: WrinkleGateInput): WrinkleGateVerdict {
  return gateWrinkleAgainst(input, runControlDay(input));
}

/**
 * The control day for a set of inputs — the same building, seed, horizon and demand, no wrinkle.
 *
 * Separated so {@link gateLibrary} can run it **once** for a whole sweep instead of once per
 * wrinkle. It is a pure function of the fields of {@link WrinkleGateInput} that are not the
 * wrinkle, which is what makes sharing it safe rather than merely cheaper: `dayOf(input, null)`
 * never reads `input.wrinkle`, so every wrinkle in a sweep was re-simulating a byte-identical run.
 *
 * The saving is half the sweep. Over the shipped library that is 38 redundant control runs of three
 * arms × 50 replications, and it was enough to make `gate.test.ts` exceed its own per-case timeouts
 * on a loaded machine — found when two parallel lanes hit it at once, not by reading the code.
 */
function runControlDay(input: WrinkleGateInput): BatchResult {
  const controlDay = dayOf(input, null);
  return runBatch(requestOf(input, controlDay.demand), {
    ...input.resources,
    building: controlDay.building,
  });
}

function gateWrinkleAgainst(input: WrinkleGateInput, control: BatchResult): WrinkleGateVerdict {
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
  const candidate = runBatch(requestOf(input, candidateDay.demand), {
    ...input.resources,
    building: candidateDay.building,
  });

  const candidateRanking = rankingOf(candidate);
  const controlRanking = rankingOf(control);

  /*
   * Refuse before ranking, not after. A mean over no quotable replication is `NaN`, and ranking on
   * `NaN` does not fail — it silently returns the order the arms were declared in.
   */
  const short = [
    ...shortArms(candidate, input.replications, 'candidate'),
    ...shortArms(control, input.replications, 'control'),
  ];
  if (short.length > 0) {
    return {
      wrinkleId: input.wrinkle.id,
      earnsItsPlace: false,
      judged: false,
      reason:
        `${input.wrinkle.id} was not judged: ${short.join(', ')} quoted a mean on fewer than every ` +
        'replication, and averaging the ones that held would be selection on the outcome — the ' +
        'traces that drop are the ones the dispatchers differ most on (`batch/report.ts` R1). ' +
        'Nothing here is a finding about the day itself. Run it at an operating point where every ' +
        'arm quotes — on a sparse building that usually means reportWindow: full-run.',
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
        `(${controlOrder.join(' < ')}) over ${String(input.replications)} paired replications, so ` +
        'it is cosmetic — § 17.',
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
      /*
       * **Not judged**, and this used to say `judged: true`, which was the flag lying in the one
       * branch it was invented for. Reaching here means no paired interval could be taken at all,
       * which is the same state as an arm that never quoted: the day is unmeasured, not discarded,
       * and § 17's instruction for a discarded day is to delete it. Unreachable while
       * {@link shortArms} holds — it guarantees a complete pairing — and it is the floor for when
       * that stops being true, so it must be right rather than merely consistent.
       */
      judged: false,
      reason:
        `${input.wrinkle.id} was not judged: it moved ${displaced} out of place for ${winner}, ` +
        `but of ${String(input.replications)} replications too few quoted a mean on both arms for ` +
        'a paired interval to be taken, so whether the move is real is unmeasured.',
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
        `other way, and the paired interval on that pair over n = ${String(estimate.n)} excludes ` +
        'zero — it earns its place.'
      : `${input.wrinkle.id} puts ${winner} ahead of ${displaced} on the means, but the paired ` +
        `interval on that pair over n = ${String(estimate.n)} contains zero: the apparatus cannot ` +
        'resolve the swap, so ordering the two on it is the failure mode CLAUDE.md names. ' +
        'Discarded.',
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
  const wrinkles = everyWrinkle(library);
  const first = wrinkles[0];
  if (first === undefined) return [];
  /*
   * One control run for the whole sweep — see {@link runControlDay}. Every verdict is still
   * compared against a control, and it is the same control it would have got on its own; what is
   * gone is thirty-seven identical re-simulations of it.
   */
  const control = runControlDay({ ...input, wrinkle: first });
  return wrinkles.map((wrinkle) => gateWrinkleAgainst({ ...input, wrinkle }, control));
}
