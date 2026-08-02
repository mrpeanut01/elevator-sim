/**
 * The dispatch policy — a `DispatcherProfile` turned into a working group controller.
 *
 * ```ts
 * const config = await loadConfig('data');
 * const policy = createDispatchPolicy(config.dispatcherProfilesById.get('collective')!);
 *
 * policy.register(hallCall, kernel.now());
 * const decision = policy.dispatch(hallCall.id, cars.map((car) => car.snapshot()), kernel.now());
 * if (decision.primaryCarId !== undefined) bank.carById(decision.primaryCarId)!.assignHallCall(hallCall);
 * ```
 *
 * Swapping `'collective'` for `'nearest-car'` swaps the dispatcher. Nothing else changes,
 * because nothing else *can*: this file reads weights, hard constraints and stage settings,
 * and never reads a profile id (CLAUDE.md invariant 7). `policy.test.ts` proves it the only
 * way that is really convincing — by rebuilding every profile under a scrambled id and
 * checking that every decision is identical.
 *
 * ## What is stateful, and why
 *
 * Stages 1, 4 and 5 have memory by definition: a batch window has to know which calls are
 * open, a defer window has to know when the decision is due, and a starvation guard has to
 * know how often a call has already moved. That state is one insertion-ordered `Map` of
 * frozen {@link CallLifecycle} records, and {@link WeightedCostDispatchPolicy.reset} clears
 * it — a replication that inherits the previous one's assignments is not statistically
 * independent, and Phase 3's paired-t intervals would be measuring the wrong thing.
 *
 * Stages 2, 3, 6 and 7 have no memory and are pure functions in `lifecycle.ts` and
 * `scoringEngine.ts`. They are exposed directly ({@link WeightedCostDispatchPolicy.score},
 * {@link WeightedCostDispatchPolicy.eligible}) so a renderer, a test or Phase 5's
 * `AuctionDispatcher` can use the engine without creating a lifecycle.
 *
 * ## Determinism
 *
 * No RNG, no clock. Every method takes the time it should act at, iteration is over ordered
 * structures, and ties are broken by car id rather than by argument order. The same policy fed
 * the same snapshots at the same time makes the same decision, every time.
 */

import { DESTINATION_CALL_TYPES, isDestinationCallType } from '../config/types.js';
import type { SimTime } from '../kernel/types.js';
import type { CarSnapshot } from '../model/car/types.js';

import {
  answerDecisionFor,
  assignmentWidth,
  batchKeyOf,
  clearsHysteresis,
  costRequestFor,
  filterEligible,
  isCommitted,
  landingShare,
  newLifecycle,
  observationFor,
  repositionDecisionFor,
  requestForShare,
  withLifecycle,
} from './lifecycle.js';
import { resolveNormalization } from './normalize.js';
import { DISPATCH_DEFAULTS, DISPATCH_PARAMETERS } from './parameters.js';
import { rankScores, scoreCar } from './scoringEngine.js';
import {
  ArrivalWindow,
  INITIAL_SELECTOR_STATE,
  resolveWeightSets,
  selectWeightSet,
  type PatternSwitchingSource,
  type ResolvedSelection,
  type SelectorState,
  type TrafficObservation,
  type WeightSetSource,
} from './selector.js';
import { COST_TERMS, DECLARED_TERM_IDS, isDeclaredTerm, isImplementedTerm } from './terms/index.js';
import {
  DispatchError,
  HARD_CONSTRAINT_IDS,
  type AnswerDecision,
  type CallLifecycle,
  type CarScore,
  type DecisionOutcome,
  type DecisionReason,
  type DispatchCall,
  type DispatchContext,
  type DispatchDecision,
  type DispatchObservation,
  type DispatchParameterSpec,
  type DispatchPolicy,
  type DispatchPolicyOptions,
  type DispatcherProfileSource,
  type EligibilityVerdict,
  type HardConstraintId,
  type RepositionContext,
  type RepositionDecision,
  type ResolvedDispatchConfig,
  type SelectionStageConfig,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

/**
 * Turn an authored profile into a fully defaulted, fully checked configuration.
 *
 * Precedence is `options > profile > DISPATCH_DEFAULTS`, the same order `resolveDoorConfig`
 * and `resolveLoadSensor` use.
 *
 * Three things are rejected outright rather than tolerated, because each is a claim the engine
 * cannot keep and each would produce a plausible-looking run of the wrong system:
 *
 * - **an unknown `engine`** — this package has one, and a profile naming another is asking for
 *   behaviour that does not exist;
 * - **an unknown hard constraint** — an ignored constraint is a config that silently does not
 *   constrain, which is the most dangerous failure in the file;
 * - **a weight on a term the library does not declare** — a misspelled `waitTiem` contributes
 *   nothing, so a profile whose only weight is misspelled scores every car at exactly zero and
 *   the dispatcher becomes the tie-break, lowest car id wins. Same argument as the hard
 *   constraint, same treatment. The check is here rather than left to
 *   `dispatcherProfilesSchema` because the schema only sees `data/dispatcher-profiles.json`:
 *   every fixture in this module, and every candidate a Phase 7 optimizer supplies through
 *   {@link DispatchPolicyOptions.weights}, is a hand-built object no schema ever validates;
 * - **deferred assignment under destination entry** — docs/06 § Stage 4 records that a
 *   destination dispatcher *cannot* defer, because the passenger must be told which car to
 *   walk to immediately. Allowing it would let a run quietly measure a system nobody can
 *   build.
 *
 * A weight on a term the library *declares* but no phase implements is not rejected; it lands
 * in {@link ResolvedDispatchConfig.pendingWeights}. Every profile in
 * `data/dispatcher-profiles.json` must build a working policy today, and
 * `predictive-balanced` weights ten of the twelve declared terms.
 */
export function resolveDispatchConfig(
  source: DispatcherProfileSource,
  options: DispatchPolicyOptions = {},
): ResolvedDispatchConfig {
  if (source.engine !== undefined && source.engine !== 'weighted-cost') {
    throw new DispatchError(
      `Dispatcher "${source.id}" declares engine "${source.engine}". This package implements one engine, "weighted-cost"; every strategy is a weight vector over it (CLAUDE.md invariant 7).`,
    );
  }

  /* ---- weights ---- */
  const authored: Record<string, number> = { ...source.weights, ...(options.weights ?? {}) };
  const { weights, pendingWeights } = resolveWeights(authored, source.id);

  /* ---- hard constraints ---- */
  const declared = options.hardConstraints ?? source.hardConstraints ?? [];
  const hardConstraints: HardConstraintId[] = [];
  for (const id of declared) {
    if (!isHardConstraintId(id)) {
      throw new DispatchError(
        `Dispatcher "${source.id}" declares hard constraint "${id}", which this engine does not implement. Known constraints: ${HARD_CONSTRAINT_IDS.join(', ')}. A hard constraint that is silently ignored is a configuration that does not constrain.`,
      );
    }
    hardConstraints.push(id);
  }

  /* ---- stages ---- */
  const dispatchStage = source.dispatch;
  const callType = dispatchStage?.callType ?? DISPATCH_DEFAULTS.callType;
  const assignmentTiming = dispatchStage?.assignmentTiming ?? DISPATCH_DEFAULTS.assignmentTiming;

  if (callType === 'destination-entry' && assignmentTiming === 'deferred') {
    throw new DispatchError(
      `Dispatcher "${source.id}" defers assignment under destination entry. A destination dispatcher must name the car at the landing, so it cannot defer — docs/06-parameterization-and-tuning.md § Stage 4. That constraint is a documented cost of the approach and this simulator measures it; it must not be configured away.`,
    );
  }

  const passengerAssignment =
    dispatchStage?.passengerAssignment ?? DISPATCH_DEFAULTS.passengerAssignment;

  // Deferral is refused for `destination-entry` above and **not** re-refused here, and the
  // asymmetry is the two call types' own semantics rather than an oversight. A kiosk holds a
  // person at a screen, so it cannot defer and the throw above says so. A `mobile-credential`
  // assignment is delivered to the phone of somebody who is still walking in from the street, and
  // a defer window it waits out is a system that exists. Which of the two a profile buys is the
  // profile's decision; refusing the pair here would put that decision in code.
  if (passengerAssignment === 'panel' && !isDestinationCallType(callType)) {
    throw new DispatchError(
      `Dispatcher "${source.id}" names a car at the landing panel (dispatch.passengerAssignment: "panel") under dispatch.callType "${callType}", which does not know where the passenger is going. A panel that cannot ask for a destination is an up/down button. Set callType to one of ${DESTINATION_CALL_TYPES.join(', ')}, or leave passengerAssignment at "none".`,
    );
  }

  const eligibility = source.eligibility;
  const answer = source.answer;
  const idle = source.idle;
  const selectionSource: SelectionStageConfig = {
    ...(source.selection ?? {}),
    ...(options.selection ?? {}),
  };
  const selection: ResolvedSelection = Object.freeze({
    policy: selectionSource.policy ?? DISPATCH_DEFAULTS.selectionPolicy,
    hysteresisS: nonNegative(
      selectionSource.hysteresisS ?? DISPATCH_DEFAULTS.selectionHysteresisS,
      'selection.hysteresisS',
      source.id,
    ),
    observationWindowS: positive(
      selectionSource.observationWindowS ?? DISPATCH_DEFAULTS.selectionObservationWindowS,
      'selection.observationWindowS',
      source.id,
    ),
    lobbyArrivalRateGain: nonNegative(
      selectionSource.lobbyArrivalRateGain ?? DISPATCH_DEFAULTS.selectionInputGain,
      'selection.lobbyArrivalRateGain',
      source.id,
    ),
    interfloorRateGain: nonNegative(
      selectionSource.interfloorRateGain ?? DISPATCH_DEFAULTS.selectionInputGain,
      'selection.interfloorRateGain',
      source.id,
    ),
    downPeakRateGain: nonNegative(
      selectionSource.downPeakRateGain ?? DISPATCH_DEFAULTS.selectionInputGain,
      'selection.downPeakRateGain',
      source.id,
    ),
    switchMargin: nonNegative(
      selectionSource.switchMargin ?? DISPATCH_DEFAULTS.selectionSwitchMargin,
      'selection.switchMargin',
      source.id,
    ),
  });
  // Resolved here rather than at the first decision, and thrown from here rather than returned:
  // a dangling weight-set name is a configuration whose dispatcher cannot express one of its own
  // declared regimes, and finding that out 600 s into a replication is finding it out after the
  // run it invalidated. Same argument, same place, as the unknown hard constraint above.
  const weightSets = resolveWeightSets(options.weightSets, selection, source.id);
  const waitTimeReference = options.normalization?.waitTimeS ?? source.normalization?.waitTimeS;
  const distanceReference = options.normalization?.distanceM ?? source.normalization?.distanceM;

  const config: ResolvedDispatchConfig = {
    id: source.id,
    name: source.name,
    engine: 'weighted-cost',
    weights,
    pendingWeights,
    declaredHardConstraints: Object.freeze([...hardConstraints]),
    constraints: Object.freeze({
      noDirectionReversal: hardConstraints.includes('noDirectionReversal'),
    }),
    // `overrides > profile > defaults`, the same precedence every other stage uses. The profile
    // half is what makes `normalization.waitTimeS` and `normalization.distanceM` persistable as
    // data: both are declared tunables, and a tunable an optimizer can sample but not write back
    // into a profile is a dimension it searches for nothing.
    normalization: resolveNormalization({
      ...(waitTimeReference === undefined ? {} : { waitTimeS: waitTimeReference }),
      ...(distanceReference === undefined ? {} : { distanceM: distanceReference }),
    }),
    dispatch: Object.freeze({
      callType,
      passengerAssignment,
      batchWindowS: nonNegative(
        dispatchStage?.batchWindowS ?? DISPATCH_DEFAULTS.batchWindowS,
        'dispatch.batchWindowS',
        source.id,
      ),
      assignmentTiming,
      deferWindowS: nonNegative(
        dispatchStage?.deferWindowS ?? DISPATCH_DEFAULTS.deferWindowS,
        'dispatch.deferWindowS',
        source.id,
      ),
      assignmentMode: dispatchStage?.assignmentMode ?? DISPATCH_DEFAULTS.assignmentMode,
      splitThresholdPassengers: positiveInteger(
        dispatchStage?.splitThresholdPassengers ?? DISPATCH_DEFAULTS.splitThresholdPassengers,
        'dispatch.splitThresholdPassengers',
        source.id,
      ),
      reassignmentPolicy: dispatchStage?.reassignmentPolicy ?? DISPATCH_DEFAULTS.reassignmentPolicy,
      commitmentPoint: dispatchStage?.commitmentPoint ?? DISPATCH_DEFAULTS.commitmentPoint,
      reassignmentHysteresisS: nonNegative(
        dispatchStage?.reassignmentHysteresisS ?? DISPATCH_DEFAULTS.reassignmentHysteresisS,
        'dispatch.reassignmentHysteresisS',
        source.id,
      ),
      maxReassignmentsPerCall: nonNegativeInteger(
        dispatchStage?.maxReassignmentsPerCall ?? DISPATCH_DEFAULTS.maxReassignmentsPerCall,
        'dispatch.maxReassignmentsPerCall',
        source.id,
      ),
    }),
    eligibility: Object.freeze({
      allowOppositeDirectionPickup:
        options.eligibility?.allowOppositeDirectionPickup ??
        eligibility?.allowOppositeDirectionPickup ??
        DISPATCH_DEFAULTS.allowOppositeDirectionPickup,
      enRouteDiversion:
        options.eligibility?.enRouteDiversion ??
        eligibility?.enRouteDiversion ??
        DISPATCH_DEFAULTS.enRouteDiversion,
      maxLoadFactorForAssignment: nonNegative(
        options.eligibility?.maxLoadFactorForAssignment ??
          eligibility?.maxLoadFactorForAssignment ??
          DISPATCH_DEFAULTS.maxLoadFactorForAssignment,
        'eligibility.maxLoadFactorForAssignment',
        source.id,
      ),
    }),
    answer: Object.freeze({
      allowBypassIfSoleEligibleCar:
        answer?.allowBypassIfSoleEligibleCar ?? DISPATCH_DEFAULTS.allowBypassIfSoleEligibleCar,
    }),
    idle: Object.freeze({
      parkingStrategy: idle?.parkingStrategy ?? DISPATCH_DEFAULTS.parkingStrategy,
      repositionThresholdS: nonNegative(
        idle?.repositionThresholdS ?? DISPATCH_DEFAULTS.repositionThresholdS,
        'idle.repositionThresholdS',
        source.id,
      ),
      repositionEnergyWeight: nonNegative(
        idle?.repositionEnergyWeight ?? DISPATCH_DEFAULTS.repositionEnergyWeight,
        'idle.repositionEnergyWeight',
        source.id,
      ),
    }),
    selection,
    ...(weightSets === undefined ? {} : { weightSets }),
  };

  return Object.freeze(config);
}

/**
 * One authored weight record, in cost-term registry order, with the pending half split off.
 *
 * Extracted from {@link resolveDispatchConfig} because the weight-set selector resolves the
 * *same* thing for every arm it may switch to, and two implementations of "what is this
 * profile's weight vector" would be two answers to one question — the failure
 * `runner/metrics.ts`'s docstring names. Registry order first, so two profiles weighting the
 * same terms sum them in the same sequence and produce bit-identical costs; and a misspelled
 * term id is rejected here for every arm, not only for the profile that happens to be the run's.
 */
export function resolveWeights(
  authored: Readonly<Record<string, number>>,
  profileId: string,
): {
  readonly weights: ReadonlyMap<string, number>;
  readonly pendingWeights: ReadonlyMap<string, number>;
} {
  const weights = new Map<string, number>();
  const pendingWeights = new Map<string, number>();
  for (const term of COST_TERMS) {
    const weight = authored[term.id];
    if (weight !== undefined) weights.set(term.id, weight);
  }
  for (const [id, weight] of Object.entries(authored)) {
    if (isImplementedTerm(id)) continue;
    if (!isDeclaredTerm(id)) {
      throw new DispatchError(
        `Dispatcher "${profileId}" puts weight ${weight} on "${id}", which the cost-term library does not declare. Known terms: ${DECLARED_TERM_IDS.join(', ')}. A weight nothing reads contributes nothing, so a misspelled term id produces a dispatcher that scores every car identically and decides by car id — a plausible-looking run of a system nobody configured.`,
      );
    }
    pendingWeights.set(id, weight);
  }
  return { weights, pendingWeights };
}

/**
 * The shape the weight-set library is derived from: the whole of `data/dispatcher-profiles.json`.
 *
 * Declared structurally, as {@link DispatcherProfileSource} is, so this module states exactly what
 * it needs from that file and a real `DispatcherProfiles` satisfies it without a cast.
 */
export interface WeightSetLibrarySource {
  readonly patternSwitching?: PatternSwitchingSource | undefined;
  readonly profiles: readonly {
    readonly id: string;
    readonly weights: Readonly<Record<string, number>>;
  }[];
}

/**
 * Turn a loaded `data/dispatcher-profiles.json` into the library a selector chooses among.
 *
 * **This is the function that makes the selector reachable from a shipped run.** § D141 built the
 * mechanism and left it reachable only through {@link DispatchPolicyOptions.weightSets}, which is
 * an *override* — a hand-built object for a fixture or an optimizer. `experiments`' runner carried
 * one per dispatcher arm, so a study could switch weight sets and `elevator-sim run` could not:
 * the file-level `patternSwitching` block and the profiles its arms name both live in the data
 * directory the CLI already loads, and nothing turned the one into the other. `SimulationConfig`
 * now carries that file the way it already carries `data/elevator-specs.json`, `Simulation` calls
 * this, and the seam has a non-test caller.
 *
 * Total and cheap: `undefined` in, `undefined` out; no `patternSwitching` block, `undefined` out.
 * A profile that then asks for a selector is refused by {@link resolveWeightSets} with the message
 * that names the missing library, which is the same refusal a hand-built caller gets. Deriving it
 * unconditionally is therefore free of behavioural consequence — under `selection.policy: 'off'`,
 * which is every shipped profile, `resolveWeightSets` returns before it reads a field of it.
 *
 * The arms' weights go through {@link resolveWeights}, the same function `resolveDispatchConfig`
 * uses for the run's own profile, for the reason that function's docstring gives: two answers to
 * "what is this profile's weight vector" would be two sources of truth about one question.
 *
 * **One consequence is stated rather than hidden: this widens the blast radius of one specific
 * malformed file.** `resolveWeights` throws on a weight whose term id `core`'s registry does not
 * declare, and every profile is now resolved on every run rather than only the run's own. So a
 * `data/dispatcher-profiles.json` that adds a term to its own `terms` list without implementing it
 * in `dispatch/terms/` — a half-finished state, which `dispatcherProfilesSchema` accepts because it
 * validates weights against the *file's* term list — fails every run instead of only runs of the
 * profile that weights it. That is loud, names the offending profile and term, and is the correct
 * reading of a file whose arms cannot all be built; the alternative, skipping a profile whose
 * weights do not resolve, is a selector silently missing one of its regimes, which
 * {@link resolveWeightSets} refuses for exactly this reason.
 */
export function weightSetSourceFrom(
  library: WeightSetLibrarySource | undefined,
): WeightSetSource | undefined {
  const patternSwitching = library?.patternSwitching;
  if (library === undefined || patternSwitching === undefined) return undefined;
  const weightsByProfileId = new Map<string, ReadonlyMap<string, number>>();
  for (const profile of library.profiles) {
    weightsByProfileId.set(profile.id, resolveWeights(profile.weights, profile.id).weights);
  }
  return Object.freeze({ patternSwitching, weightsByProfileId });
}

function isHardConstraintId(id: string): id is HardConstraintId {
  return (HARD_CONSTRAINT_IDS as readonly string[]).includes(id);
}

function nonNegative(value: number, id: string, profileId: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DispatchError(
      `Dispatcher "${profileId}": ${id} must be a finite non-negative number; received ${value}.`,
    );
  }
  return value;
}

function nonNegativeInteger(value: number, id: string, profileId: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DispatchError(
      `Dispatcher "${profileId}": ${id} must be a non-negative integer; received ${value}.`,
    );
  }
  return value;
}

function positive(value: number, id: string, profileId: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DispatchError(
      `Dispatcher "${profileId}": ${id} must be a finite positive number; received ${value}.`,
    );
  }
  return value;
}

function positiveInteger(value: number, id: string, profileId: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DispatchError(
      `Dispatcher "${profileId}": ${id} must be a positive integer; received ${value}.`,
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- *
 * The policy
 * -------------------------------------------------------------------------- */

/**
 * The one dispatch engine, configured by data.
 *
 * There is no subclass and there will not be one. "Nearest car" and "collective" are two
 * instances of this class holding different {@link ResolvedDispatchConfig}s — that is the
 * roadmap's Phase 2 acceptance criterion and the whole of CLAUDE.md invariant 7.
 */
export class WeightedCostDispatchPolicy implements DispatchPolicy {
  readonly id: string;
  readonly name: string;
  readonly engine = 'weighted-cost' as const;
  readonly config: ResolvedDispatchConfig;
  readonly parameters: readonly DispatchParameterSpec[] = DISPATCH_PARAMETERS;

  /** Call id to lifecycle. A Map, so iteration order is registration order and reproducible. */
  readonly #lifecycles = new Map<string, CallLifecycle>();
  /** Open batch key to the call id that owns it, so a second press joins rather than forks. */
  readonly #openBatches = new Map<string, string>();

  /* ---- stage 3's weight-set selection. All three are inert while the selector is off. ---- */

  /**
   * The trailing arrival window, built only when a selector is configured.
   *
   * `undefined` under `selection.policy: 'off'` — every shipped profile — so a non-selecting run
   * allocates nothing, records nothing and takes no branch a previous run did not.
   */
  readonly #arrivals: ArrivalWindow | undefined;
  /** The selector's memory. Deterministic simulation state; {@link reset} clears it. */
  #selectorState: SelectorState = INITIAL_SELECTOR_STATE;
  /**
   * The weight vector in force.
   *
   * Initialised to `config.weights` — **the same frozen Map object**, not a copy — so a policy
   * with no selector hands the scorer exactly what it handed before this mechanism existed. That
   * is what makes byte-identity a structural property rather than a tolerance.
   */
  #weights: ReadonlyMap<string, number>;
  /** Weight-set changes this policy has made. For reports and for the liveness study. */
  #switchCount = 0;
  /** The pattern currently in force, or `undefined` while the profile's own weights stand. */
  #activePatternId: string | undefined;
  /** What the detector last saw. For a report, for calibration, and for the liveness study. */
  #lastTraffic: TrafficObservation | undefined;

  constructor(config: ResolvedDispatchConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.#weights = config.weights;
    this.#arrivals = config.weightSets === undefined ? undefined : new ArrivalWindow();
  }

  /**
   * The weight vector this policy is scoring with **now**.
   *
   * Equal to `config.weights` for the life of a run on every shipped profile. A study reads it to
   * assert that a selector actually selected — the mechanism being live is a fact to measure, not
   * to infer from the configuration being present.
   */
  get activeWeights(): ReadonlyMap<string, number> {
    return this.#weights;
  }

  /** The pattern in force, or `undefined`. Provenance for a report; never read to decide. */
  get activePattern(): string | undefined {
    return this.#activePatternId;
  }

  /** How many times the weight vector has changed during this run. */
  get weightSetSwitches(): number {
    return this.#switchCount;
  }

  /**
   * The traffic state the detector read at the last decision, or `undefined` with no selector.
   *
   * The membership ramps in `data/dispatcher-profiles.json` are authored in these units, so this
   * is also how they were calibrated — measured off real runs rather than guessed, which is the
   * difference between a detector and a decoration.
   */
  get observedTraffic(): TrafficObservation | undefined {
    return this.#lastTraffic;
  }

  get calls(): readonly CallLifecycle[] {
    return Object.freeze([...this.#lifecycles.values()]);
  }

  lifecycle(callId: string): CallLifecycle | undefined {
    return this.#lifecycles.get(callId);
  }

  /* ---------------------------------------------------------------- *
   * Stage 1 — registration
   * ---------------------------------------------------------------- */

  /**
   * Register a call.
   *
   * Re-registering a live call id updates what is known about who is waiting and returns the
   * same lifecycle — a re-press is not a new call, and `registeredAt` never moves, or every
   * waiting-time and starvation figure would silently reset.
   *
   * A *different* call id whose `floorId:direction` batch is still open joins that batch
   * instead of starting its own: same button, more people. Its waiting count is folded in and
   * the caller gets the batch's lifecycle back, so a runner that registered two arrivals gets
   * one decision rather than two.
   */
  register(
    call: DispatchCall,
    at: SimTime,
    context?: DispatchContext | undefined,
  ): CallLifecycle {
    const observation = observationFor(
      call,
      context?.waitingPassengers,
      context?.waitingMassKg,
      context,
    );

    const existing = this.#lifecycles.get(call.id);
    if (existing !== undefined) {
      const merged = withLifecycle(existing, {
        waitingPassengers: Math.max(existing.waitingPassengers, observation.waitingPassengers),
        waitingMassKg: observation.waitingMassKg ?? existing.waitingMassKg,
      });
      this.#lifecycles.set(call.id, merged);
      this.#countArrival(call, at, merged.waitingPassengers - existing.waitingPassengers);
      return merged;
    }

    const batchKey = batchKeyOf(call, this.config);
    const openId = this.#openBatches.get(batchKey);
    const open = openId === undefined ? undefined : this.#lifecycles.get(openId);
    if (open !== undefined && this.config.dispatch.batchWindowS > 0 && at < open.scoreableAt) {
      const merged = withLifecycle(open, {
        waitingPassengers: open.waitingPassengers + Math.max(1, observation.waitingPassengers),
        waitingMassKg:
          observation.waitingMassKg === undefined
            ? open.waitingMassKg
            : (open.waitingMassKg ?? 0) + observation.waitingMassKg,
      });
      this.#lifecycles.set(open.callId, merged);
      this.#countArrival(call, at, merged.waitingPassengers - open.waitingPassengers);
      return merged;
    }

    const created = newLifecycle(call, at, this.config, observation);
    this.#lifecycles.set(call.id, created);
    this.#openBatches.set(batchKey, call.id);
    this.#countArrival(call, at, created.waitingPassengers);
    return created;
  }

  /**
   * Feed the traffic detector, if there is one.
   *
   * **Deltas, not registrations.** `Simulation.#registerCalls` re-registers every live call on
   * every dispatch pass with the landing's current count, so a detector that counted calls would
   * multiply one queue by however often the bank happened to be asked and report an arrival rate
   * that rose with the dispatcher's own activity. What is recorded is the increase in what is
   * waiting, which is passengers.
   *
   * Nothing happens at all when the selector is off, which is what keeps a shipped run's
   * allocation profile as well as its numbers unchanged.
   */
  #countArrival(call: DispatchCall, at: SimTime, delta: number): void {
    if (this.#arrivals === undefined || delta <= 0) return;
    this.#arrivals.record(at, call.floorIndex, call.direction, delta);
  }

  /* ---------------------------------------------------------------- *
   * Stages 2 and 3, exposed pure
   * ---------------------------------------------------------------- */

  /**
   * Stage 2 alone. Priced through {@link WeightedCostDispatchPolicy.score}'s own path, so a
   * caller inspecting eligibility sees exactly the verdicts the decision was made from — under
   * `split-demand` a car is eligible for the share it would be given, not for the whole
   * landing, and one pricing path is what stops the two answers disagreeing.
   */
  eligible(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly EligibilityVerdict[] {
    const observation = observationFor(
      call,
      context?.waitingPassengers,
      context?.waitingMassKg,
      context,
    );
    return this.#priceLanding(call, cars, at, observation).verdicts;
  }

  score(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly CarScore[] {
    const observation = observationFor(
      call,
      context?.waitingPassengers,
      context?.waitingMassKg,
      context,
    );
    return this.#priceLanding(call, cars, at, observation).scores;
  }

  #scoreVerdicts(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    verdicts: readonly EligibilityVerdict[],
    at: SimTime,
    observation: DispatchObservation,
  ): readonly CarScore[] {
    const byId = new Map(cars.map((car) => [car.carId, car]));
    const scores: CarScore[] = [];

    for (const verdict of verdicts) {
      if (!verdict.eligible) continue;
      const car = byId.get(verdict.carId);
      /* c8 ignore next -- unreachable: verdicts are built from these same cars. */
      if (car === undefined) continue;
      // `verdict.request` rather than a fresh one: the terms must price exactly the question
      // the estimate answered, boarding cap included.
      scores.push(
        scoreCar(
          { car, call, request: verdict.request, estimate: verdict.estimate, at, observation },
          // The one binding this whole mechanism exists to break. It used to read
          // `this.config.weights` and that single expression was the reason a dispatcher could
          // not be changed mid-run; `#weights` **is** `config.weights`, the same object, on
          // every profile that does not ask for a selector.
          this.#weights,
          this.config.normalization,
        ),
      );
    }
    return rankScores(scores);
  }

  /**
   * Stages 2 and 3, priced as stage 4 will divide the landing.
   *
   * `split-demand` names several cars for one button and each of them takes a share of it, so
   * the question every car is asked is *"what would it cost you to collect
   * `ceil(waiting / width)` of these people?"* — not the whole queue. Pricing the whole queue
   * to every car is the error `lifecycle.ts`'s `requestForCar` exists to prevent, one level up: it
   * inflates each car's dwell with transfers another car will make, records a `cost` and an
   * `etaSeconds` for a trip nobody takes, and lets `maxLoadFactorForAssignment` disqualify
   * cars for a load they were never going to carry — precisely when a heavy landing most needs
   * them.
   *
   * The width and the share define each other, so this is a small fixed point rather than one
   * pass. It starts at the widest split the profile allows if every car supplied turned out
   * eligible, prices the landing divided that far, and narrows to the number that actually
   * came back eligible; `width` falls strictly on every iteration, so it terminates in at most
   * one pass per car, and it settles on the **widest** split the eligible cars can support.
   *
   * Starting wide rather than narrow is the half that matters: a single pass at the whole
   * queue can reject every car on the load ceiling, leaving nothing to split and no way back.
   *
   * The **request** carries the share; the {@link DispatchObservation} does not. What a car is
   * asked to carry is per car, but how many people are on the landing is a fact about the
   * landing — Phase 5's `crowding` term measures the hall queue, and it must go on seeing all
   * of it however the queue was divided.
   *
   * Under `single-car` the first width is 1, the share is the whole landing, and this is
   * exactly the one-pass filter-and-score it replaces.
   */
  #priceLanding(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    observation: DispatchObservation,
  ): {
    readonly verdicts: readonly EligibilityVerdict[];
    readonly scores: readonly CarScore[];
    readonly width: number;
    /** Passengers each assigned car is asked to take; `undefined` when nobody counted. */
    readonly share: number | undefined;
  } {
    const whole = costRequestFor(call, this.config, observation);
    const waiting = observation.waitingPassengers;

    let width = assignmentWidth(this.config, cars.length, waiting);
    let pricedShare = landingShare(waiting, width);
    let verdicts: readonly EligibilityVerdict[];
    let scores: readonly CarScore[];

    for (;;) {
      const request = pricedShare === undefined ? whole : requestForShare(whole, pricedShare);
      verdicts = filterEligible(cars, call, request, this.config);
      scores = this.#scoreVerdicts(call, cars, verdicts, at, observation);

      // Narrower or the same, never wider: `assignmentWidth` is monotone in the eligible
      // count, and the count cannot exceed the number of cars the current width assumed. So
      // `width` strictly decreases whenever the loop goes round again, and this terminates.
      const settled = assignmentWidth(this.config, scores.length, waiting);
      if (settled >= width || settled <= 0) {
        width = Math.min(width, settled);
        break;
      }
      width = settled;
      pricedShare = landingShare(waiting, width);
    }

    // The share reported is the share the scores were priced at, always.
    return { verdicts, scores, width, share: width > 0 ? pricedShare : undefined };
  }

  /* ---------------------------------------------------------------- *
   * Stages 2 to 4 — the decision
   * ---------------------------------------------------------------- */

  dispatch(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): DispatchDecision {
    this.#refreshWeightSet(cars, at, context);
    return this.#decide(callId, cars, at, context);
  }

  /**
   * **Stage 3, before the scoring.** Consult the weight-set selector, and adopt what it says.
   *
   * Called once per decision, from {@link dispatch} and {@link reconsider}, and **not** from
   * {@link score} or {@link eligible}: those two are the read-only views of the engine and a
   * caller inspecting a score must see the weights the decision was made with, not advance the
   * selector past it. `AuctionDispatcher` prices every car through `score`, so a selector that
   * updated there would step the hysteresis once per bidder.
   *
   * Consumes no random stream and reads no clock: `at` is the kernel's, `cars` is the snapshot
   * list the caller already built, and {@link selectWeightSet} is pure. That is the whole of this
   * mechanism's cost to common random numbers, and it is zero — asserted by re-running
   * `validation/goldenRuns.test.ts` and `fuzz/determinism.test.ts`, not by this paragraph.
   */
  #refreshWeightSet(
    cars: readonly CarSnapshot[],
    at: SimTime,
    context: DispatchContext | undefined,
  ): void {
    const sets = this.config.weightSets;
    if (sets === undefined || this.#arrivals === undefined) return;

    const traffic = this.#arrivals.observe(
      at,
      this.config.selection.observationWindowS,
      cars,
      context?.entranceFloorIndices,
    );
    this.#lastTraffic = traffic;
    const result = selectWeightSet(sets, this.config.selection, traffic, this.#selectorState, at);
    this.#selectorState = result.state;
    if (result.switched) this.#switchCount += 1;
    // An abstaining detector leaves the profile's own weights standing, which is why this reads
    // the arm rather than assuming one: `arm === undefined` is "none of the declared regimes",
    // and guessing the least-bad one would hide exactly that.
    this.#weights = result.arm?.weights ?? this.config.weights;
    this.#activePatternId = result.arm?.patternId;
  }

  /* ---------------------------------------------------------------- *
   * Stage 5 — reassignment
   * ---------------------------------------------------------------- */

  reconsider(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): DispatchDecision {
    this.#refreshWeightSet(cars, at, context);
    return this.#decide(callId, cars, at, context);
  }

  /**
   * Stages 2 to 5 for one call.
   *
   * {@link dispatch} and {@link reconsider} are the same call, deliberately: **which stage a
   * call is in is a property of the call, not of the caller's vocabulary.** An unassigned
   * call is in stage 4 and owes the batch and defer windows; an assigned one is in stage 5 and
   * owes the reassignment policy, the commitment latch, the reassignment budget and the
   * hysteresis. Deciding that from the method name instead would mean a runner that called
   * `dispatch()` twice on the same call could move it with `reassignmentPolicy: never` set —
   * a config that says "an assignment is final" quietly not being final.
   */
  #decide(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context: DispatchContext | undefined,
  ): DispatchDecision {
    const lifecycle = this.#lifecycles.get(callId);
    if (lifecycle === undefined) {
      throw new DispatchError(
        `Call "${callId}" is not registered with dispatcher "${this.config.id}". Call register() before dispatch().`,
      );
    }

    const call = lifecycle.call;
    const observation = observationFor(
      call,
      context?.waitingPassengers ?? lifecycle.waitingPassengers,
      context?.waitingMassKg ?? lifecycle.waitingMassKg,
      context,
    );
    const assigned = lifecycle.carIds.length > 0;

    /* ---- stage 4: is it time yet? The windows are spent once a car holds the call. ---- */
    if (!assigned && at < lifecycle.scoreableAt) {
      const reason: DecisionReason =
        at < lifecycle.registeredAt + this.config.dispatch.batchWindowS
          ? 'awaiting-batch-window'
          : 'awaiting-defer-window';
      return Object.freeze({
        callId,
        outcome: 'deferred' as const,
        carIds: lifecycle.carIds,
        primaryCarId: lifecycle.carIds[0],
        boardingPassengersPerCar: lifecycle.boardingPassengersPerCar,
        cost: lifecycle.cost,
        at,
        dueAt: lifecycle.scoreableAt,
        scores: Object.freeze([]),
        rejected: Object.freeze([]),
        reason,
        stage: 'registration' as const,
      });
    }

    /* ---- stage 5 gates, before any work is done ---- */
    if (assigned) {
      const gate = this.#reassignmentGate(lifecycle, cars, at);
      if (gate !== undefined) {
        return this.#record(lifecycle, 'retained', gate.reason, at, [], [], 'reassignment', gate.lifecycle);
      }
    }

    /* ---- stages 2 to 4: filter, score, and divide the landing ---- */
    const { verdicts, scores, width, share } = this.#priceLanding(call, cars, at, observation);
    const rejected = Object.freeze(verdicts.filter((verdict) => !verdict.eligible));

    const best = scores[0];
    if (best === undefined) {
      return this.#record(
        lifecycle,
        assigned ? 'retained' : 'unassigned',
        'no-eligible-car',
        at,
        scores,
        rejected,
        'eligibility',
      );
    }

    /* ---- stage 4: which cars, and what each of them is taking ---- */
    const chosen = scores.slice(0, width);
    const carIds = Object.freeze(chosen.map((score) => score.carId));

    /* ---- stage 5: is the change worth making? ---- */
    if (assigned) {
      const incumbentId = lifecycle.carIds[0];
      if (incumbentId === best.carId) {
        // The incumbent is still the best. Its cost is refreshed and, under `split-demand`,
        // so is the set of cars sharing the landing — that is not a reassignment, because the
        // call has not moved.
        return this.#record(lifecycle, 'retained', 'incumbent-best', at, scores, rejected, 'reassignment', {
          carIds,
          cost: best.cost,
          etaSeconds: best.estimate.etaSeconds,
          boardingPassengersPerCar: share,
        });
      }

      const incumbent = scores.find((score) => score.carId === incumbentId);
      // An incumbent that is no longer eligible at all — it filled up, went out of service, or
      // a hard constraint now rejects it — has nothing to defend, so the hysteresis does not
      // apply and the call moves. Holding a call on an ineligible car is how a floor starves.
      const holds =
        incumbent !== undefined &&
        !clearsHysteresis(
          incumbent.cost,
          incumbent.estimate.etaSeconds,
          best.cost,
          best.estimate.etaSeconds,
          this.config.dispatch.reassignmentHysteresisS,
        );
      if (holds) {
        return this.#record(lifecycle, 'retained', 'below-hysteresis', at, scores, rejected, 'reassignment', {
          cost: incumbent.cost,
          etaSeconds: incumbent.estimate.etaSeconds,
        });
      }

      return this.#record(lifecycle, 'reassigned', undefined, at, scores, rejected, 'reassignment', {
        carIds,
        cost: best.cost,
        etaSeconds: best.estimate.etaSeconds,
        boardingPassengersPerCar: share,
        assignedAt: at,
        // A new car has committed to nothing. Clearing the latch is what makes
        // `maxReassignmentsPerCall` the binding guard rather than the commitment point.
        committedAt: undefined,
        reassignments: lifecycle.reassignments + 1,
      });
    }

    const bestCar = carSnapshotOf(cars, best.carId);
    return this.#record(lifecycle, 'assigned', undefined, at, scores, rejected, 'assignment', {
      carIds,
      cost: best.cost,
      etaSeconds: best.estimate.etaSeconds,
      boardingPassengersPerCar: share,
      assignedAt: at,
      committedAt:
        bestCar !== undefined && isCommitted(bestCar, call, this.config, at) ? at : undefined,
    });
  }

  /**
   * Whether stage 5 may even look, and the lifecycle with any commitment it observed latched.
   *
   * Returns `undefined` to mean "go ahead". Commitment is latched here rather than recomputed
   * at every call: a car that has begun decelerating for a floor has committed, and a
   * predicate that went false again once it arrived would un-commit it.
   */
  #reassignmentGate(
    lifecycle: CallLifecycle,
    cars: readonly CarSnapshot[],
    at: SimTime,
  ): { reason: DecisionReason; lifecycle: CallLifecycle } | undefined {
    const policy = this.config.dispatch.reassignmentPolicy;
    if (policy === 'never') {
      return { reason: 'reassignment-disabled', lifecycle };
    }

    if (lifecycle.reassignments >= this.config.dispatch.maxReassignmentsPerCall) {
      return { reason: 'max-reassignments', lifecycle };
    }

    if (policy !== 'until-commitment') return undefined;

    const incumbentId = lifecycle.carIds[0];
    const incumbent = incumbentId === undefined ? undefined : carSnapshotOf(cars, incumbentId);
    const committedAt =
      lifecycle.committedAt ??
      (incumbent !== undefined && isCommitted(incumbent, lifecycle.call, this.config, at)
        ? at
        : undefined);

    if (committedAt !== undefined) {
      return { reason: 'committed', lifecycle: withLifecycle(lifecycle, { committedAt }) };
    }
    return undefined;
  }

  /** Store the lifecycle patch and build the frozen decision that goes with it. */
  #record(
    lifecycle: CallLifecycle,
    outcome: DecisionOutcome,
    reason: DecisionReason | undefined,
    at: SimTime,
    scores: readonly CarScore[],
    rejected: readonly EligibilityVerdict[],
    stage: DispatchDecision['stage'],
    patch?: Partial<CallLifecycle> | undefined,
  ): DispatchDecision {
    const updated = withLifecycle(lifecycle, { ...(patch ?? {}), stage, lastDecisionAt: at });
    this.#lifecycles.set(updated.callId, updated);
    if (updated.carIds.length > 0) this.#openBatches.delete(updated.batchKey);

    return Object.freeze({
      callId: updated.callId,
      outcome,
      carIds: updated.carIds,
      primaryCarId: updated.carIds[0],
      boardingPassengersPerCar: updated.boardingPassengersPerCar,
      cost: updated.cost,
      at,
      dueAt: undefined,
      scores,
      rejected,
      reason,
      stage,
    });
  }

  /* ---------------------------------------------------------------- *
   * Stage 6 — answering
   * ---------------------------------------------------------------- */

  /**
   * **Stage 6.** Whether this car should stop here for this call.
   *
   * `cars` is the group, and omitting it means the group is *unknown* — it is passed straight
   * through rather than defaulted to `[car]`, because `[car]` is not an absent argument, it is
   * the assertion "this bank has one car", which makes
   * `answer.allowBypassIfSoleEligibleCar`'s starvation override fire unconditionally in a bank
   * of any size. A runner that omitted the list would have had every full car in the group
   * override its own load bypass while claiming a starvation protection nobody established.
   * With the group unknown the override cannot fire and the car bypasses on load.
   */
  answer(
    car: CarSnapshot,
    call: DispatchCall,
    at: SimTime,
    cars?: readonly CarSnapshot[] | undefined,
  ): AnswerDecision {
    const lifecycle = this.#lifecycles.get(call.id);
    return answerDecisionFor(car, call, this.config, lifecycle?.carIds ?? [], cars);
  }

  /* ---------------------------------------------------------------- *
   * Stage 7 — repositioning
   * ---------------------------------------------------------------- */

  reposition(
    car: CarSnapshot,
    at: SimTime,
    context?: RepositionContext | undefined,
  ): RepositionDecision {
    return repositionDecisionFor(car, this.config, context ?? {});
  }

  /* ---------------------------------------------------------------- *
   * Bookkeeping
   * ---------------------------------------------------------------- */

  /** Mark a call served. It leaves the live set; the record goes to the metrics layer. */
  complete(callId: string, at: SimTime): CallLifecycle | undefined {
    const lifecycle = this.#lifecycles.get(callId);
    if (lifecycle === undefined) return undefined;
    this.#lifecycles.delete(callId);
    if (this.#openBatches.get(lifecycle.batchKey) === callId) {
      this.#openBatches.delete(lifecycle.batchKey);
    }
    return withLifecycle(lifecycle, {
      stage: 'answering',
      answeredAt: at,
      lastDecisionAt: at,
    });
  }

  cancel(callId: string): boolean {
    const lifecycle = this.#lifecycles.get(callId);
    if (lifecycle === undefined) return false;
    this.#lifecycles.delete(callId);
    if (this.#openBatches.get(lifecycle.batchKey) === callId) {
      this.#openBatches.delete(lifecycle.batchKey);
    }
    return true;
  }

  reset(): void {
    this.#lifecycles.clear();
    this.#openBatches.clear();
    // The selector's memory goes with the lifecycles, for the same reason and by the same
    // argument: a replication that inherited the previous one's traffic history would begin
    // already convinced of a pattern, and Phase 3's paired-t intervals would be measuring a
    // dispatcher that had seen the other replication's passengers.
    this.#arrivals?.clear();
    this.#selectorState = INITIAL_SELECTOR_STATE;
    this.#weights = this.config.weights;
    this.#activePatternId = undefined;
    this.#lastTraffic = undefined;
    this.#switchCount = 0;
  }
}

function carSnapshotOf(
  cars: readonly CarSnapshot[],
  carId: string,
): CarSnapshot | undefined {
  return cars.find((car) => car.carId === carId);
}

/* -------------------------------------------------------------------------- *
 * Construction
 * -------------------------------------------------------------------------- */

/**
 * Build a policy from a dispatcher profile.
 *
 * ```ts
 * const policy = createDispatchPolicy(config.dispatcherProfilesById.get('nearest-car')!);
 * ```
 *
 * The only entry point. There is no strategy argument, because the strategy *is* the profile.
 */
export function createDispatchPolicy(
  profile: DispatcherProfileSource,
  options: DispatchPolicyOptions = {},
): WeightedCostDispatchPolicy {
  return new WeightedCostDispatchPolicy(resolveDispatchConfig(profile, options));
}
