/**
 * **Can any destination weight carry information at a pure down-peak?**
 *
 * `docs/07-handoff.md` § 8 left this open rather than as debt. `garden-down-peak` is
 * `destination-eta`'s last identity class — measured bit-identical to `eta` there at `rideTime`
 * **0.3, 1.0 and 2.0** ([`DECISIONS.md` § D112](../../../../DECISIONS.md)) — and *"whether **any**
 * destination weight can carry information at such a point"* was recorded as a question. Raising one
 * weight fourfold and seeing nothing move separates a blind operating point from a dead seam. It does
 * not separate *"this term is blind here"* from *"the destination is blind here"*, and those are
 * different claims: the first is about `rideTime`, the second about the building.
 *
 * This module separates them, by enumerating the term library instead of arguing about it.
 *
 * ## The shape of the measurement
 *
 * For **every** term `core`'s `DECLARED_TERM_IDS` declares, `eta + w·term` is run at
 * `up-down-buttons` and at `mobile-credential` — the same weight vector on both sides — under common
 * random numbers at the cell's own operating point. The only difference between the two arms of a
 * pair is whether the call carries a destination, so a paired difference between them is the value of
 * the disclosure and of nothing else. `waitTime` is enumerated too, at the weight `eta` already
 * carries, which makes that pair the *"call type disclosed, nothing pricing it"* control § D112 had
 * to derive as `destination-eta-unpriced`.
 *
 * The enumeration is what bounds the answer. One term measured flat says that term is blind here;
 * twelve terms measured flat would say the **shipped library** is, at this point, at this budget —
 * which is still weaker than *"destinations are useless at a down-peak"*, a sentence this module does
 * not measure and nobody should write.
 *
 * ## What is counted, and why a count and not an interval
 *
 * An arm bit-identical to its own control has a paired difference of exactly zero at every
 * replication, `rho = 1` and an interval of `[0, 0]`. `docs/07` § 4 is explicit that no budget
 * resolves that and that it is **a wiring bug until proven otherwise**. The proof here is the one
 * § D112 used in the opposite direction, and it is in this module rather than adjacent to it: the
 * gated behaviour is counted **live inside the run that produced the zero** — evaluated, non-zero —
 * and one of the enumerated terms is emphatically *not* identical across the same gate on the same
 * commit. So identity is reported as a count of differing replications, and an interval is published
 * beside it whichever way the count falls.
 *
 * ## The mechanism, measured rather than argued
 *
 * `CLAUDE.md`: *if you write a sentence about why something performs better, either measure it or say
 * it is unmeasured.* The sentence the register carries is *"every down trip ends at the lobby, so the
 * destination carries nothing the direction button did not"*. Its two halves are measured separately:
 *
 * - the **origin-destination multiset** the traffic actually generates, so *"every trip ends at the
 *   lobby"* is a count rather than a reading of a `directionalSplit`; and
 * - each weighted term's **cross-car spread** over every replication of the experiment — decisions in
 *   which two candidate cars received different raw values. That is the load-bearing number and
 *   `destinationLiveness.ts` established the technique: a term with the same value for every car is a
 *   constant added to every candidate's cost, and **a constant cannot change an `argmin`**. No weight
 *   rescues it, which is what *"no weight can help"* has to mean if it is to mean anything. The
 *   census runs on `replicationSeeds(seed, n)` — the experiment's **own** replication seeds — so the
 *   counts and the intervals are two readings of one set of runs rather than two measurements that
 *   could disagree.
 *
 * A third count sits between them: `decisionsWhereTermDecided`, the contested decisions whose
 * `argmin` moves when the term's contribution is subtracted. Spread says the term *could* decide;
 * this says it *did*, at that weight.
 */

import {
  DECLARED_TERM_IDS,
  Simulation,
  createPolicyFor,
  type DispatchContext,
  type DispatchDecision,
  type DispatchPolicy,
  type DispatcherProfile,
  type ResolvedBuilding,
  type ScoreBreakdown,
} from '@elevator-sim/core';

import { replicationSeeds } from '../runner/crn.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, ExperimentResult } from '../runner/types.js';
import {
  cellOf,
  derivedProfile,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from '../validation/harness.js';

import { matrixCell, type MatrixCell } from './matrix.js';
import { identityClassesOf } from './suite.js';
import { compareCell, type CellComparison } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The operating point and the arms
 * -------------------------------------------------------------------------- */

/** The cell the open question is about. Taken from `matrix.ts`, never restated. */
export const DOWN_PEAK_CELL_ID = 'garden-down-peak';

/**
 * The conventional reference arm.
 *
 * `eta` rather than `collective` or `nearest-car`: `docs/07` § 4 records `nearest-car` as the only
 * profile that saturates anywhere and a poor reference arm, and `eta` is the arm § D112's identity
 * class is stated against — so this study's zero and that one's are the same zero.
 */
export const DOWN_PEAK_BASELINE = 'eta';

/**
 * The seed. **Not `MATRIX_SEED`**, on purpose.
 *
 * The identity class this module is about was found by `runMatrix()` at 20 260 728. Re-measuring it
 * on the same passenger populations would restate that finding rather than check it — the argument
 * `matrix.ts` makes for its own seed being distinct from the gate's. 20 260 726 is `BENCHMARK_SEED`;
 * agreement across two seed sets is therefore evidence rather than arithmetic.
 */
export const DOWN_PEAK_SEED = 20_260_726;

/**
 * The replication budget.
 *
 * The top of `CLAUDE.md`'s 50–200 band, and admissible only because this cell's own census says so:
 * every arm below reports `saturatedCount` and the study asserts it is zero at this `n`. A ceiling is
 * a property of a **(building, traffic, seed)** and is never inherited — `docs/07` § 4 records this
 * repository making that mistake twice. `matrix.ts` runs this cell at 51 against `collective`; that
 * number is that study's, at that study's seed, and is not reused here.
 */
export const DOWN_PEAK_REPLICATIONS = 200;

/**
 * Weights the two destination-reading terms are swept at.
 *
 * The top of the sweep is **16× the shipped `destination-eta` weight**. § D112's evidence that the
 * point is blind rather than under-weighted was a fourfold rise; this is the same experiment with
 * more room, and a term that is flat at 8 is flat because its value does not vary, not because its
 * weight is small.
 */
export const GATE_WEIGHTS: readonly number[] = Object.freeze([0.2, 0.5, 1, 2, 8]);

/** Weight every other term is enumerated at — one point, because the enumeration is a screen. */
export const ENUMERATION_WEIGHT = 1;

/**
 * The terms that read `request.destinationFloorId`, and therefore the ones a weight sweep can move.
 *
 * `rideTime` and `stopCount`, and only the first declares an `activeWhen` for the call type. Listed
 * so the sweep can be aimed; **not** relied on for the answer — the enumeration runs every declared
 * term across the gate, so a third term reading the destination would show up as a term that moves
 * and this constant would stop matching what was measured.
 */
export const DESTINATION_READING_TERMS: readonly string[] = Object.freeze([
  'rideTime',
  'stopCount',
]);

/** The four metrics every comparison reports. `energyKJ` is an axis, never a score (§ D106). */
export const DOWN_PEAK_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'energyKJ',
]);

/**
 * The shipped destination profiles, carried as arms so the answer is stated about `data/`.
 *
 * `destination-panel` changes the passenger model, so `awtS` and `wt95S` are on `core`'s
 * `MODEL_SENSITIVE_METRIC_IDS` list for it and measure a different construct than they do for the
 * conventional arms. Its row is reported and flagged, never folded into the answer.
 */
export const SHIPPED_DESTINATION_ARMS: readonly string[] = Object.freeze([
  'destination-eta',
  'destination-panel',
]);

/** Arms whose passenger model makes `awtS` and `wt95S` incomparable with the conventional table. */
export const MODEL_SENSITIVE_ARMS: readonly string[] = Object.freeze(['destination-panel']);

/** One (term, weight) the disclosure gate is opened at. */
export interface GateSpec {
  readonly termId: string;
  readonly weight: number;
}

/**
 * Every (term, weight) measured, derived from `core`'s own vocabulary rather than listed.
 *
 * A term added to the library appears here without anybody remembering to add it, which is the
 * property this repository's dead-seam register keeps asking for.
 */
export const GATE_SPECS: readonly GateSpec[] = Object.freeze(
  DECLARED_TERM_IDS.flatMap((termId) =>
    (DESTINATION_READING_TERMS.includes(termId) ? GATE_WEIGHTS : [ENUMERATION_WEIGHT]).map((weight) =>
      Object.freeze({ termId, weight }),
    ),
  ),
);

/** Arm id for `eta` plus one term at one weight, on one side of the disclosure gate. */
export function gateArmId(spec: GateSpec, disclosed: boolean): string {
  return `dp-${spec.termId}${String(spec.weight)}-${disclosed ? 'mc' : 'udb'}`;
}

/**
 * Every derived profile this study registers. Config only, never code (invariant 7).
 *
 * Each pair differs in exactly one field — `dispatch.callType` — so the paired difference between its
 * two members is the value of the disclosure. Neither side names a `passengerAssignment`, so both
 * stay on the conventional passenger model and `awtS` and `wt95S` measure the same construct on both
 * sides of every pair.
 */
export function gateProfiles(baseline: DispatcherProfile): readonly DispatcherProfile[] {
  const out: DispatcherProfile[] = [];
  for (const spec of GATE_SPECS) {
    out.push(
      derivedProfile(baseline, gateArmId(spec, false), {
        name: `eta + ${String(spec.weight)} x ${spec.termId}, destination withheld`,
        weights: { [spec.termId]: spec.weight },
      }),
    );
    out.push(
      derivedProfile(baseline, gateArmId(spec, true), {
        name: `eta + ${String(spec.weight)} x ${spec.termId}, destination disclosed`,
        weights: { [spec.termId]: spec.weight },
        dispatch: { callType: 'mobile-credential' },
      } as Parameters<typeof derivedProfile>[2]),
    );
  }
  return Object.freeze(out);
}

/* -------------------------------------------------------------------------- *
 * The census — the mechanism, counted through the experiment's own replications
 * -------------------------------------------------------------------------- */

/** One weighted term's behaviour over every replication, on one side of the gate. */
export interface SpreadCount {
  readonly termId: string;
  readonly weight: number;
  readonly disclosed: boolean;
  /** Every time the term was asked for a value. */
  readonly evaluations: number;
  /** Evaluations whose raw value was not zero. */
  readonly nonZero: number;
  /** Decisions with more than one candidate car — the only decisions a cost term can move. */
  readonly contestedDecisions: number;
  /**
   * Contested decisions in which two candidate cars got **different** raw values.
   *
   * Zero means the term is a constant across candidates: it shifts every cost by the same amount and
   * cannot change an `argmin` at any weight. That is the difference between *"blind"* and
   * *"under-weighted"*, and it is a count rather than an inference.
   */
  readonly decisionsWithSpread: number;
  /** Contested decisions whose `argmin` moves when this term's contribution is subtracted. */
  readonly decisionsWhereTermDecided: number;
}

/** What the traffic actually generated, so *"every trip ends at the lobby"* is a count. */
export interface DestinationCensus {
  readonly replications: number;
  readonly legs: number;
  /** Distinct destination floor ids over every generated leg of every replication. */
  readonly destinations: readonly string[];
  /** Legs whose destination is the building's entrance floor. */
  readonly legsToEntrance: number;
  /** Distinct origin floor ids — the information the hall call already carries. */
  readonly origins: readonly string[];
  /**
   * Eligibility refusals under disclosure, **by reason**.
   *
   * Counted rather than assumed to be empty. This building declares no access zone, so none of the
   * four reasons a credential can move (`accessDenied`, `destinationAccessDenied`, `serviceZone`,
   * `destinationServiceZone`) can occur here — and the ones that do occur are the ordinary
   * availability refusals every arm sees, which is what makes them evidence that the call type
   * changed nothing in the filter.
   */
  readonly refusalsUnderDisclosure: Readonly<Record<string, number>>;
}

interface Tally {
  contested: number;
  readonly refusalsByReason: Map<string, number>;
  readonly evaluations: Map<string, number>;
  readonly nonZero: Map<string, number>;
  readonly spread: Map<string, number>;
  readonly decided: Map<string, number>;
}

const bump = (into: Map<string, number>, key: string): void => {
  into.set(key, (into.get(key) ?? 0) + 1);
};

function emptyTally(): Tally {
  return {
    contested: 0,
    refusalsByReason: new Map(),
    evaluations: new Map(),
    nonZero: new Map(),
    spread: new Map(),
    decided: new Map(),
  };
}

/** The cheapest car under this cost vector, with `compareScores`' own tie-break on the car id. */
function winner(costs: readonly (readonly [string, number])[]): string {
  let bestId = '';
  let bestCost = Number.POSITIVE_INFINITY;
  for (const [carId, cost] of costs) {
    if (cost < bestCost || (cost === bestCost && carId < bestId)) {
      bestId = carId;
      bestCost = cost;
    }
  }
  return bestId;
}

function record(into: Tally, decision: DispatchDecision): void {
  for (const verdict of decision.rejected as readonly { readonly reason?: string | undefined }[]) {
    bump(into.refusalsByReason, verdict.reason ?? 'unspecified');
  }
  if (decision.scores.length < 2) return;
  into.contested += 1;

  const raws = new Map<string, number[]>();
  const contributions = new Map<string, Map<string, number>>();
  for (const score of decision.scores) {
    for (const term of score.terms as readonly ScoreBreakdown[]) {
      bump(into.evaluations, term.termId);
      if (term.raw !== 0) bump(into.nonZero, term.termId);
      const list = raws.get(term.termId);
      if (list === undefined) raws.set(term.termId, [term.raw]);
      else list.push(term.raw);
      const byCar = contributions.get(term.termId) ?? new Map<string, number>();
      byCar.set(score.carId, (byCar.get(score.carId) ?? 0) + term.contribution);
      contributions.set(term.termId, byCar);
    }
  }

  const full = decision.scores.map((score) => [score.carId, score.cost] as const);
  const chosen = winner(full);
  for (const [termId, values] of raws) {
    if (new Set(values).size > 1) bump(into.spread, termId);
    const byCar = contributions.get(termId);
    const without = decision.scores.map(
      (score) => [score.carId, score.cost - (byCar?.get(score.carId) ?? 0)] as const,
    );
    if (winner(without) !== chosen) bump(into.decided, termId);
  }
}

/** A real policy that counts what its engine priced. The technique is `destinationLiveness.ts`'s. */
function counting(inner: DispatchPolicy, into: Tally): DispatchPolicy {
  const wrapper: Partial<DispatchPolicy> = {
    dispatch(callId, cars, at, context?: DispatchContext | undefined) {
      const decision = inner.dispatch(callId, cars, at, context);
      record(into, decision);
      return decision;
    },
    reconsider(callId, cars, at, context?: DispatchContext | undefined) {
      const decision = inner.reconsider(callId, cars, at, context);
      record(into, decision);
      return decision;
    },
  };
  return new Proxy(inner, {
    get(target, property): unknown {
      const own = (wrapper as Record<string | symbol, unknown>)[property];
      if (own !== undefined) return own;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as DispatchPolicy;
}

/* -------------------------------------------------------------------------- *
 * The results
 * -------------------------------------------------------------------------- */

/** One arm against `eta`, with the saturation evidence that says whether it may be quoted. */
export interface GateArm {
  readonly armId: string;
  readonly termId: string;
  readonly weight: number;
  readonly disclosed: boolean;
  readonly quotable: boolean;
  readonly quotabilityReason: string | undefined;
  /** Replications whose AWT was invalidated. This arm's contribution to the cell's own ceiling. */
  readonly saturatedCount: number;
  /** Replications whose metric vector differs from `eta`'s at the same index. */
  readonly replicationsDifferingFromBaseline: number;
  /** `true` when this arm's `awtS` and `wt95S` are not comparable with the conventional table. */
  readonly modelSensitive: boolean;
  readonly cells: readonly CellComparison[];
}

/**
 * One term at one weight, measured **across the disclosure gate**.
 *
 * `disclosed − withheld`, paired. This is the study's primary quantity: both arms carry the same
 * weight vector, so the difference is the value of knowing the destination and of nothing else.
 */
export interface GateContrast {
  readonly termId: string;
  readonly weight: number;
  /** Replications whose metric vector differs between the two sides. Zero means blind. */
  readonly replicationsDiffering: number;
  readonly withheld: SpreadCount;
  readonly disclosed: SpreadCount;
  readonly cells: readonly CellComparison[];
}

/** Everything this study measured. */
export interface DownPeakDestinationStudy {
  readonly cell: MatrixCell;
  readonly seed: number;
  readonly replications: number;
  readonly baselineId: string;
  readonly baselineQuotable: boolean;
  readonly census: DestinationCensus;
  readonly arms: readonly GateArm[];
  readonly contrasts: readonly GateContrast[];
  /** Terms whose disclosed arm differs from its withheld arm at any weight. */
  readonly informativeTerms: readonly string[];
  /** The largest `saturatedCount` any arm reported. Zero is what makes this budget admissible. */
  readonly worstSaturatedCount: number;
  /** Arms whose per-replication metric vectors are exactly equal, as classes of size > 1. */
  readonly identityClasses: readonly (readonly string[])[];
  /** Whether every arm's replication `i` really saw the baseline's replication `i` population. */
  readonly crnAligned: boolean;
  readonly experiment: ExperimentResult;
}

export interface DownPeakStudyOptions {
  readonly resources?: ExperimentResources | undefined;
  readonly seed?: number | undefined;
  readonly replications?: number | undefined;
  /**
   * Skip the instrumented census, which costs one extra run per arm per replication.
   *
   * Off by default and the default is the point: the census is where the *mechanism* is measured,
   * and a driver whose default skipped it would publish the intervals without the evidence that says
   * what they mean. `census.legs` is `0` when it is set, so a narrowed run cannot be mistaken for a
   * full one.
   */
  readonly skipCensus?: boolean | undefined;
}

const IDENTITY_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'pctOverLongWait',
  'intervalS',
  'meanLoadFactor',
  'meanQueueLength',
]);

function differingReplications(
  experiment: ExperimentResult,
  armId: string,
  otherId: string,
  replications: number,
): number {
  let differing = 0;
  for (let index = 0; index < replications; index += 1) {
    const same = IDENTITY_METRICS.every((metric) => {
      const a = samplesOf(experiment, armId, metric)[index];
      const b = samplesOf(experiment, otherId, metric)[index];
      return a === b || (Number.isNaN(a as number) && Number.isNaN(b as number));
    });
    if (!same) differing += 1;
  }
  return differing;
}

const emptySpread = (spec: GateSpec, disclosed: boolean): SpreadCount =>
  Object.freeze({
    termId: spec.termId,
    weight: spec.weight,
    disclosed,
    evaluations: 0,
    nonZero: 0,
    contestedDecisions: 0,
    decisionsWithSpread: 0,
    decisionsWhereTermDecided: 0,
  });

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

/**
 * Run the whole question: the census, the enumeration, and an interval for every pair.
 *
 * Serial by construction — `runGateExperiment` pins `parallel: { mode: 'serial' }` — because a
 * benchmark taken under load is not evidence.
 */
export async function runDownPeakDestinationStudy(
  options: DownPeakStudyOptions = {},
): Promise<DownPeakDestinationStudy> {
  const cell = matrixCell(DOWN_PEAK_CELL_ID);
  const config = await loadResources();
  const baseline = config.dispatcherProfilesById.get(DOWN_PEAK_BASELINE);
  if (baseline === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${DOWN_PEAK_BASELINE}".`);
  }
  const derived = gateProfiles(baseline);
  const resources = options.resources ?? withProfiles(config, derived);
  const seed = options.seed ?? DOWN_PEAK_SEED;
  const replications = options.replications ?? DOWN_PEAK_REPLICATIONS;
  const building = config.buildingsById.get(cell.building) as ResolvedBuilding;
  const entrance = building.floors.find((floor) => floor.isEntrance)?.id ?? 'G';
  const profileById = new Map(derived.map((profile) => [profile.id, profile] as const));

  /* ---- the census, over the experiment's own replication seeds ---- */
  const seeds = replicationSeeds(seed, replications);
  const spreadByArm = new Map<string, SpreadCount>();
  let census: DestinationCensus = Object.freeze({
    replications: 0,
    legs: 0,
    destinations: Object.freeze([]),
    legsToEntrance: 0,
    origins: Object.freeze([]),
    refusalsUnderDisclosure: Object.freeze({}),
  });

  if (options.skipCensus !== true) {
    const destinations = new Set<string>();
    const origins = new Set<string>();
    let legs = 0;
    let legsToEntrance = 0;
    let censusRecorded = false;

    for (const spec of GATE_SPECS) {
      for (const disclosed of [false, true]) {
        const armId = gateArmId(spec, disclosed);
        const profile = profileById.get(armId) as DispatcherProfile;
        const tally = emptyTally();
        const collectLegs = disclosed && !censusRecorded;
        for (const replicationSeedValue of seeds) {
          const simulation = new Simulation({
            building,
            dispatcherProfile: profile,
            trafficProfiles: config.trafficProfiles,
            elevatorSpecs: config.elevatorSpecs,
            seed: replicationSeedValue,
            onTimeout: 'report',
            ...(cell.traffic.durationS === undefined ? {} : { durationS: cell.traffic.durationS }),
            ...(cell.traffic.reportWindow === undefined
              ? {}
              : { reportWindow: cell.traffic.reportWindow }),
            ...(cell.traffic.demand === undefined ? {} : { demand: cell.traffic.demand }),
            createPolicy: (resolved, policyOptions) =>
              counting(createPolicyFor(resolved, policyOptions), tally),
          });
          const result = simulation.run();
          if (collectLegs) {
            for (const passenger of result.record.passengers) {
              legs += 1;
              destinations.add(passenger.destinationFloorId);
              origins.add(passenger.originFloorId);
              if (passenger.destinationFloorId === entrance) legsToEntrance += 1;
            }
          }
        }
        spreadByArm.set(
          armId,
          Object.freeze({
            termId: spec.termId,
            weight: spec.weight,
            disclosed,
            evaluations: tally.evaluations.get(spec.termId) ?? 0,
            nonZero: tally.nonZero.get(spec.termId) ?? 0,
            contestedDecisions: tally.contested,
            decisionsWithSpread: tally.spread.get(spec.termId) ?? 0,
            decisionsWhereTermDecided: tally.decided.get(spec.termId) ?? 0,
          }),
        );
        if (collectLegs) {
          census = Object.freeze({
            replications,
            legs,
            destinations: Object.freeze([...destinations].sort()),
            legsToEntrance,
            origins: Object.freeze([...origins].sort()),
            refusalsUnderDisclosure: Object.freeze(
              Object.fromEntries([...tally.refusalsByReason].sort()),
            ),
          });
          censusRecorded = true;
        }
      }
    }
  }

  /* ---- the experiment ---- */
  const gateArmIds = derived.map((profile) => profile.id);
  const armIds = [...gateArmIds, ...SHIPPED_DESTINATION_ARMS];
  const experiment = await runGateExperiment({
    id: `t49/down-peak-destination/${cell.id}`,
    seed,
    building: cell.building,
    dispatchers: [DOWN_PEAK_BASELINE, ...armIds],
    traffic: cell.traffic,
    replications,
    resources,
  });

  const baselineCell = cellOf(experiment, DOWN_PEAK_BASELINE);
  const baselineQuotable = baselineCell.aggregate.awtIsValid;

  const armOf = (armId: string, termId: string, weight: number, disclosed: boolean): GateArm => {
    const armCell = cellOf(experiment, armId);
    const quotable = baselineQuotable && armCell.aggregate.awtIsValid;
    return Object.freeze({
      armId,
      termId,
      weight,
      disclosed,
      quotable: armCell.aggregate.awtIsValid,
      quotabilityReason: armCell.aggregate.awtInvalidReason,
      saturatedCount: armCell.aggregate.saturatedCount,
      replicationsDifferingFromBaseline: differingReplications(
        experiment,
        armId,
        DOWN_PEAK_BASELINE,
        replications,
      ),
      modelSensitive: MODEL_SENSITIVE_ARMS.includes(armId),
      cells: Object.freeze(
        DOWN_PEAK_METRICS.map((metric) =>
          compareCell({
            metric,
            armId,
            baselineId: DOWN_PEAK_BASELINE,
            candidate: samplesOf(experiment, armId, metric),
            baseline: samplesOf(experiment, DOWN_PEAK_BASELINE, metric),
            quotable,
          }),
        ),
      ),
    });
  };

  const arms: GateArm[] = [];
  for (const spec of GATE_SPECS) {
    for (const disclosed of [false, true]) {
      arms.push(armOf(gateArmId(spec, disclosed), spec.termId, spec.weight, disclosed));
    }
  }
  for (const armId of SHIPPED_DESTINATION_ARMS) {
    const profile = config.dispatcherProfilesById.get(armId);
    arms.push(armOf(armId, 'rideTime', profile?.weights.rideTime ?? 0, true));
  }

  const contrasts: GateContrast[] = [];
  for (const spec of GATE_SPECS) {
    const disclosedId = gateArmId(spec, true);
    const withheldId = gateArmId(spec, false);
    const quotable =
      cellOf(experiment, disclosedId).aggregate.awtIsValid &&
      cellOf(experiment, withheldId).aggregate.awtIsValid;
    contrasts.push(
      Object.freeze({
        termId: spec.termId,
        weight: spec.weight,
        replicationsDiffering: differingReplications(
          experiment,
          disclosedId,
          withheldId,
          replications,
        ),
        withheld: spreadByArm.get(withheldId) ?? emptySpread(spec, false),
        disclosed: spreadByArm.get(disclosedId) ?? emptySpread(spec, true),
        cells: Object.freeze(
          DOWN_PEAK_METRICS.map((metric) =>
            compareCell({
              metric,
              armId: disclosedId,
              baselineId: withheldId,
              candidate: samplesOf(experiment, disclosedId, metric),
              baseline: samplesOf(experiment, withheldId, metric),
              quotable,
            }),
          ),
        ),
      }),
    );
  }

  const baselineDigests = baselineCell.replications.map((entry) => entry.traceDigest);
  let crnAligned = true;
  for (const armId of armIds) {
    const digests = cellOf(experiment, armId).replications.map((entry) => entry.traceDigest);
    if (
      digests.length !== baselineDigests.length ||
      digests.some((digest, index) => digest !== baselineDigests[index])
    ) {
      crnAligned = false;
    }
  }

  const informative = new Set<string>();
  for (const contrast of contrasts) {
    if (contrast.replicationsDiffering > 0) informative.add(contrast.termId);
  }

  return Object.freeze({
    cell,
    seed,
    replications,
    baselineId: DOWN_PEAK_BASELINE,
    baselineQuotable,
    census,
    arms: Object.freeze(arms),
    contrasts: Object.freeze(contrasts),
    informativeTerms: Object.freeze([...informative].sort()),
    worstSaturatedCount: arms.reduce((worst, arm) => Math.max(worst, arm.saturatedCount), 0),
    identityClasses: Object.freeze(
      identityClassesOf(experiment, [DOWN_PEAK_BASELINE, ...armIds]).filter(
        (members) => members.length > 1,
      ),
    ),
    crnAligned,
    experiment,
  });
}

/** The contrast for one (term, weight). @throws Error when the study did not measure it. */
export function gateContrast(
  study: DownPeakDestinationStudy,
  termId: string,
  weight: number,
): GateContrast {
  const found = study.contrasts.find(
    (entry) => entry.termId === termId && entry.weight === weight,
  );
  if (found === undefined) {
    throw new Error(
      `No gate contrast for "${termId}" at weight ${String(weight)}. Measured: ${study.contrasts
        .map((entry) => `${entry.termId}@${String(entry.weight)}`)
        .join(', ')}.`,
    );
  }
  return found;
}

/** One arm's comparison on one metric. @throws Error when the study did not measure it. */
export function downPeakCell(
  study: DownPeakDestinationStudy,
  armId: string,
  metric: ReplicationMetric,
): CellComparison {
  const arm = study.arms.find((entry) => entry.armId === armId);
  const found = arm?.cells.find((entry) => entry.metric === metric);
  if (found === undefined) {
    throw new Error(`Arm "${armId}" was not measured on "${metric}".`);
  }
  return found;
}

/** The study as the console table its driver prints. Feeds no decision. */
export function formatDownPeakDestinationStudy(study: DownPeakDestinationStudy): string {
  const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
  const lines: string[] = [
    `Can any destination weight carry information at ${study.cell.id}?`,
    `  ${study.cell.label} · seed ${String(study.seed)} · n = ${String(study.replications)} · ` +
      `CRN aligned ${String(study.crnAligned)} · worst saturatedCount ${String(study.worstSaturatedCount)}`,
    '',
    study.census.legs === 0
      ? '  census skipped'
      : `  census over ${String(study.census.replications)} replications: ${String(study.census.legs)} legs, ` +
        `origins {${study.census.origins.join(', ')}}, destinations {${study.census.destinations.join(', ')}}, ` +
        `${String(study.census.legsToEntrance)} of ${String(study.census.legs)} end at the entrance, ` +
        `refusals under disclosure {${Object.entries(study.census.refusalsUnderDisclosure)
          .map(([reason, count]) => `${reason}=${String(count)}`)
          .join(' ')}}`,
    '',
    '  across the disclosure gate — disclosed minus withheld, paired:',
  ];
  for (const contrast of study.contrasts) {
    const awt = contrast.cells.find((entry) => entry.metric === 'awtS');
    lines.push(
      `    ${`${contrast.termId}@${String(contrast.weight)}`.padEnd(24)}` +
        `differing ${String(contrast.replicationsDiffering)}/${String(study.replications)}` +
        `  spread ${String(contrast.withheld.decisionsWithSpread)}→${String(contrast.disclosed.decisionsWithSpread)}` +
        ` of ${String(contrast.disclosed.contestedDecisions)} contested` +
        `  decided ${String(contrast.withheld.decisionsWhereTermDecided)}→${String(contrast.disclosed.decisionsWhereTermDecided)}` +
        (awt === undefined
          ? ''
          : `  AWT ${signed(awt.estimate.mean)} [${awt.estimate.lower.toFixed(3)}, ` +
            `${awt.estimate.upper.toFixed(3)}] ${awt.verdict}`),
    );
  }
  lines.push(
    '',
    `  terms whose value the destination moves here: ${
      study.informativeTerms.length === 0 ? 'none' : study.informativeTerms.join(', ')
    }`,
  );
  return lines.join('\n');
}
