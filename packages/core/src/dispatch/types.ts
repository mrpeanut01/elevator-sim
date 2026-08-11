/**
 * The vocabulary of dispatch: what a call is, what a term is, what a decision is.
 *
 * ## One engine, many strategies (CLAUDE.md invariant 7)
 *
 * There is no `NearestCarDispatcher` type in this module, and there never will be. There is
 * one engine — `cost(car, call) = Σᵢ wᵢ · normalize(termᵢ(car, call))` — and every strategy is
 * a weight vector plus a handful of stage settings, loaded from
 * `data/dispatcher-profiles.json`. "Nearest car" is `{ distanceTravelled: 1.0 }`;
 * "conventional collective" is `{ waitTime: 1.0 }` with the `noDirectionReversal` hard
 * constraint. Nothing in `dispatch/` reads a profile id, so renaming a profile cannot change
 * a decision — `policy.test.ts` asserts exactly that.
 *
 * The distinction that matters, because it is easy to get wrong: branching on a **declared
 * categorical parameter's value** (`assignmentTiming === 'deferred'`) is the *implementation*
 * of that parameter, and every categorical tunable needs one somewhere. Branching on a
 * **profile identity** (`profile.id === 'nearest-car'`) is the failure invariant 7 names,
 * because it puts behaviour in code that the config claims to own.
 *
 * ## The seven stages
 *
 * docs/06-parameterization-and-tuning.md § Layer 2 decomposes the call lifecycle into seven
 * independently tunable stages, and {@link DispatchPolicy} exposes one entry point per stage
 * group:
 *
 * | Stage | Method | Parameters it reads |
 * |---|---|---|
 * | 1 registration | {@link DispatchPolicy.register} | `dispatch.callType`, `dispatch.batchWindowS` |
 * | 2 eligibility | {@link DispatchPolicy.dispatch} | `eligibility.*`, `constraints.*`, `answer.allowBypassIfSoleEligibleCar` |
 * | 3 scoring | {@link DispatchPolicy.score} | `weights.*`, `normalization.*` |
 * | 4 assignment | {@link DispatchPolicy.dispatch} | `dispatch.assignmentTiming`, `deferWindowS`, `assignmentMode`, `splitThresholdPassengers` |
 * | 5 reassignment | {@link DispatchPolicy.reconsider} | `dispatch.reassignmentPolicy`, `commitmentPoint`, `reassignmentHysteresisS`, `maxReassignmentsPerCall` |
 * | 6 answering | {@link DispatchPolicy.answer} | `answer.allowBypassIfSoleEligibleCar`, `eligibility.allowOppositeDirectionPickup` |
 * | 7 repositioning | {@link DispatchPolicy.reposition} | `idle.parkingStrategy`, `repositionThresholdS`, `repositionEnergyWeight` |
 *
 * Note the two groupings are deliberately different. Sections (`dispatch`, `answer`, `idle`,
 * `eligibility`) are the *authoring* grouping, chosen to match `data/dispatcher-profiles.json`
 * so a parameter id is literally the dotted path of the value in the file. Stages are the
 * *runtime* grouping. Collapsing them would either put parameter ids out of step with the
 * data file or invent a seventh JSON section nobody authors against.
 *
 * ## Conventions
 *
 * - SI throughout; time is simulated seconds from the kernel and nothing here reads a wall
 *   clock (CLAUDE.md invariant 3).
 * - No random draws anywhere in this module. A dispatch decision is a deterministic function
 *   of `(policy config, call, car snapshots, time)`; `policy.test.ts` runs the same decision a
 *   hundred times and compares (CLAUDE.md invariants 2 and 4).
 * - Every value the policy hands back is frozen.
 */

import type {
  AssignmentMode,
  AssignmentTiming,
  CallType,
  CommitmentPoint,
  ParkingStrategy,
  PassengerAssignmentMode,
  ReassignmentPolicy,
  RuleActionId,
  RuleConditionId,
  SelectionStageConfig,
} from '../config/types.js';
import type { SimTime } from '../kernel/types.js';
import type { CarSnapshot, CostEstimate, CostRequest } from '../model/car/types.js';
import type { CredentialGroup, Direction } from '../model/types.js';

import type {
  ResolvedRuleSets,
  ResolvedSelection,
  ResolvedWeightSets,
  WeightSetPolicy,
  WeightSetSource,
} from './selector.js';

/* -------------------------------------------------------------------------- *
 * Errors
 * -------------------------------------------------------------------------- */

/**
 * A dispatcher configuration that cannot be honoured.
 *
 * Thrown rather than returned, and thrown at policy-build time rather than at decision time,
 * because every case is a claim the engine cannot keep: an unknown hard constraint would
 * silently *not* constrain, and a deferred destination dispatcher would silently not defer.
 * Both would produce a plausible-looking run of the wrong system.
 */
export class DispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DispatchError';
  }
}

/* -------------------------------------------------------------------------- *
 * The call
 * -------------------------------------------------------------------------- */

/**
 * A call the group controller must allocate.
 *
 * A `HallCall` from `model/` satisfies this directly — that is the point — and the extra
 * fields are all optional, for information a bare up/down button cannot carry:
 *
 * - `destinationFloorId` and `credentialGroup` exist only under destination entry or a mobile
 *   credential. Whether the policy *uses* them is governed by `dispatch.callType`, which is
 *   how this simulator measures the advantage of moving information earlier rather than
 *   assuming it.
 * - `waitingPassengers` / `waitingMassKg` let a caller that has counted the landing queue say
 *   so, instead of the car assuming `assumedBoardingPassengers`.
 */
export interface DispatchCall {
  /** Stable identity, for reassignment tracking and starvation guards. */
  readonly id: string;
  readonly floorId: string;
  /** Shaft ordering of {@link floorId}. */
  readonly floorIndex: number;
  /** Which way the passenger wants to travel. */
  readonly direction: Direction;
  /** When the button was first pressed. Never refreshed by a re-press. */
  readonly registeredAt: SimTime;
  /** Known at call time under destination entry; absent with up/down buttons. */
  readonly destinationFloorId?: string | undefined;
  /** Known under a mobile credential; absent with up/down buttons. */
  readonly credentialGroup?: CredentialGroup | undefined;
  /**
   * The **landing panel already performed the access check** for this request.
   *
   * DECISIONS.md § D30 rules that a destination-entry kiosk authorizes: the passenger states a
   * destination *at the panel*, and the panel is what decides whether they may go there. Set by
   * the runner only under destination *dispatch*, where a panel physically exists; a bare
   * disclosure of the destination (Phase 6a's Level 0) has no kiosk and leaves it unset, which
   * is why turning this feature on cannot move a Level-0 number.
   *
   * It is a fact about the call, not a policy switch: `costRequestFor` forwards the credential
   * for an authorized request so `estimateCost` does not ask a second time whether an *unbadged*
   * passenger may reach a zoned floor — the question that, unasked, made `destination-entry`
   * unserviceable on `secure-tower` (**100 % unserved** against conventional's 33.5 % —
   * `benchmark/accessControl.ts` H-ACCESS-1, seed 20 260 726, n = 30, re-run after § T50-D1).
   */
  readonly panelAuthorized?: boolean | undefined;
  /** Passengers waiting for this call, when somebody counted. */
  readonly waitingPassengers?: number | undefined;
  /** Their total mass, kilograms, when known. */
  readonly waitingMassKg?: number | undefined;
}

/* -------------------------------------------------------------------------- *
 * The lifecycle
 * -------------------------------------------------------------------------- */

/** The seven stages of docs/06-parameterization-and-tuning.md § Layer 2, in order. */
export const CALL_STAGES = [
  'registration',
  'eligibility',
  'scoring',
  'assignment',
  'reassignment',
  'answering',
  'repositioning',
] as const;

export type CallStage = (typeof CALL_STAGES)[number];

/**
 * Where a call has got to, and everything the later stages need to know about its history.
 *
 * Immutable: the policy replaces the record rather than editing it, so a caller holding one
 * from before a reassignment still sees what it saw. `reassignments` and `committedAt` are
 * the two fields stage 5 turns on — a starvation guard and an irrevocability latch.
 */
export interface CallLifecycle {
  readonly callId: string;
  readonly call: DispatchCall;
  readonly stage: CallStage;
  readonly registeredAt: SimTime;
  /**
   * Earliest time the call may be scored: `registeredAt + batchWindowS`, plus `deferWindowS`
   * when `assignmentTiming` is `deferred`.
   */
  readonly scoreableAt: SimTime;
  /**
   * `floorId:direction`. Calls sharing it inside the batch window are the same button and are
   * merged into one lifecycle rather than scored separately.
   */
  readonly batchKey: string;
  /** Passengers known to be waiting for this call. Grows as a batch accumulates. */
  readonly waitingPassengers: number;
  /** Their total mass, kilograms, or `undefined` when nobody weighed them. */
  readonly waitingMassKg: number | undefined;
  /** Cars currently holding the call, best-first. More than one only under `split-demand`. */
  readonly carIds: readonly string[];
  /**
   * How many of the landing each holding car was priced for and is expected to collect:
   * `ceil(waitingPassengers / carIds.length)`.
   *
   * `undefined` when nobody counted the queue, which is the normal case for a bare up/down
   * button — the cars then charge their own `assumedBoardingPassengers`. Equal to
   * `waitingPassengers` under `single-car`, and the point of the field under `split-demand`: a
   * runner that boards a whole landing onto one car of a split has not run the system the
   * dispatcher priced.
   */
  readonly boardingPassengersPerCar: number | undefined;
  /** Weighted cost of the primary car at the moment of assignment. */
  readonly cost: number | undefined;
  /** Estimated wait of the primary car at the moment of assignment, seconds. */
  readonly etaSeconds: number | undefined;
  readonly assignedAt: SimTime | undefined;
  /** When the current assignment became irrevocable. Latched; cleared by a reassignment. */
  readonly committedAt: SimTime | undefined;
  /** How many times the call has changed cars. The `maxReassignmentsPerCall` guard. */
  readonly reassignments: number;
  readonly lastDecisionAt: SimTime;
  readonly answeredAt: SimTime | undefined;
}

/* -------------------------------------------------------------------------- *
 * Stage 2 — eligibility
 * -------------------------------------------------------------------------- */

/**
 * Why a car may not take a call. Hard filters, never costs.
 *
 * The first six mirror {@link InfeasibilityReason} and come straight from
 * `Car.estimateCost()`: service mode, service zoning, access zoning on the destination and the
 * load cell are the car's own answers and the dispatcher does not second-guess them. The rest
 * are the group controller's own, and each maps to exactly one declared tunable — which is what
 * keeps them filters rather than opinions.
 *
 * There is no `accessDenied` here for the reason `INFEASIBILITY_REASONS` gives: access zoning
 * is a question about the destination, and `destinationAccessDenied` is its name (§ D254).
 */
export const INELIGIBILITY_REASONS = [
  'serviceMode',
  'serviceZone',
  'destinationServiceZone',
  'destinationAccessDenied',
  'overload',
  'hallCallBypass',
  /** `eligibility.maxLoadFactorForAssignment`: the car would be too full on arrival. */
  'loadFactorCeiling',
  /** `eligibility.allowOppositeDirectionPickup` is off and the car would arrive facing the wrong way. */
  'oppositeDirection',
  /** A `hardConstraints` entry rejected it; see {@link EligibilityVerdict.constraintId}. */
  'hardConstraint',
] as const;

export type IneligibilityReason = (typeof INELIGIBILITY_REASONS)[number];

/**
 * Hard constraints a profile may declare in `data/dispatcher-profiles.json`.
 *
 * A constraint is not a term with a large weight: no weight vector can make an ineligible car
 * eligible, which is the entire difference. `collective` declares `noDirectionReversal`, and
 * that single line is what turns the ETA dispatcher into conventional collective control.
 *
 * An unrecognised id throws at build time rather than being ignored — an ignored hard
 * constraint is a config that silently does not constrain.
 */
export const HARD_CONSTRAINT_IDS = ['noDirectionReversal'] as const;

export type HardConstraintId = (typeof HARD_CONSTRAINT_IDS)[number];

/**
 * The player-facing words for each hard constraint — GitHub issue #147, and the Everyday Mode
 * handoff's §16 rule 11 (`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`).
 *
 * A constraint's `description` on its `constraints.<id>` schema row is addressed to an optimizer
 * and a reading engineer; #147's finding is that a card built from it can say what a constraint
 * *is* but never what it *does* in words a player can act on. The fix is **two fields with two
 * readers, declared beside the model** — never a lookup table in a renderer, which is
 * `if (id === …)` wearing prose and goes stale the day a constraint is added.
 *
 * A `Record` keyed by {@link HardConstraintId} rather than a parallel array: adding a constraint
 * id without its words is a compile error, not a runtime fallback. The honest fallback for a
 * surface that meets a constraint this record somehow cannot name (*a filter no weight can buy
 * past*, plus the id) lives with the surface, because reaching it is a content bug the surface
 * must survive, not a state this module is allowed to ship.
 */
export const HARD_CONSTRAINT_WORDS: Readonly<Record<HardConstraintId, PlayerControlWords>> =
  Object.freeze({
    noDirectionReversal: Object.freeze({
      name: 'finish the direction first',
      effect:
        'a car never turns around for a new call — it finishes the direction it is travelling, however the weights are set',
    }),
  });

/** One car's answer to "could you take this call at all?", with the estimate that decided it. */
export interface EligibilityVerdict {
  readonly carId: string;
  readonly eligible: boolean;
  readonly reason: IneligibilityReason | undefined;
  /** Which hard constraint rejected it, when `reason` is `hardConstraint`. */
  readonly constraintId: HardConstraintId | undefined;
  /**
   * The cost estimate the filter computed, reused by the scorer rather than recomputed.
   *
   * For a car admitted by the `allowBypassIfSoleEligibleCar` starvation guard this is the
   * estimate taken with the bypass overridden, so its ETA is a usable number rather than the
   * `Infinity` a bypassing car reports.
   */
  readonly estimate: CostEstimate;
  /**
   * Exactly what this car was asked to price.
   *
   * Per car, not per call, because the boarding count is capped at what the car has room for:
   * a landing of thirty people is not thirty boarders for a car that holds sixteen. The scorer
   * reuses this so every term sees the same question the estimate answered.
   */
  readonly request: CostRequest;
  /** True when the load-bypass filter was overridden by the sole-eligible-car guard. */
  readonly bypassOverridden: boolean;
}

/* -------------------------------------------------------------------------- *
 * Stage 3 — scoring
 * -------------------------------------------------------------------------- */

/**
 * How a term's raw value is mapped onto the shared `[0, 1]` scale.
 *
 * - `saturating` — `x / (reference + x)` for a non-negative raw `x`. Strictly increasing and
 *   bounded, so ordering survives at any magnitude while the scale stays comparable. The
 *   reference is the **half-cost point**: a raw value equal to the reference normalizes to
 *   0.5. It is a genuine tunable, because it changes the curvature of the map and not merely
 *   its gain.
 * - `bounded` — `clamp(x / fullScale, 0, 1)` for a raw value with a known finite maximum.
 *   `fullScale` is a **constant on the term, not a tunable**: for a linear map the scale is
 *   exactly a gain, so exposing it would duplicate the term's weight and hand a Phase 7
 *   optimizer a degenerate direction to waste evaluations on.
 */
export type NormalizationMode = 'saturating' | 'bounded';

/** The tunable reference scales, one per `saturating` term. */
export const NORMALIZATION_SCALE_IDS = ['waitTimeS', 'distanceM'] as const;

export type NormalizationScaleId = (typeof NORMALIZATION_SCALE_IDS)[number];

/** Resolved reference scales, in SI. */
export type ResolvedNormalization = { readonly [K in NormalizationScaleId]: number };

/** A term whose raw value is unbounded above; normalized through the saturating map. */
export interface SaturatingNormalization {
  readonly mode: 'saturating';
  /** Which tunable reference scale to divide by. */
  readonly scale: NormalizationScaleId;
}

/** A term whose raw value has a known maximum; normalized linearly against that constant. */
export interface BoundedNormalization {
  readonly mode: 'bounded';
  /** The raw value that maps to 1. Constant, deliberately: see {@link NormalizationMode}. */
  readonly fullScale: number;
}

export type TermNormalization = SaturatingNormalization | BoundedNormalization;

/**
 * Facts about the wider system a term may price, beyond the car and the call.
 *
 * Resolved once per decision and shared by every term, so a term never queries the world
 * itself and stays a pure function of its context. Phase 5's `crowding` and `starvation`
 * terms widen this interface; nothing about the engine changes when they do.
 */
export interface DispatchObservation {
  /** Passengers waiting at the call floor for the call direction. */
  readonly waitingPassengers: number;
  /** Their total mass, kilograms, or `undefined` when nobody weighed them. */
  readonly waitingMassKg: number | undefined;
  /**
   * Car id to the floor ids of that car's **operational** zone, for `zoneAffinity`.
   *
   * Operational zoning only — the third kind, the dispatcher's own dynamic partitioning
   * (docs/01-architecture.md § Security zones are three different things). Service zoning is
   * `car.shaft` and access zoning is `ServedFloor.permittedCredentialGroups`; neither belongs
   * here and neither is a cost. Produced by `policies/groupContext.ts`, which owns the
   * partition, and absent when no operational zoning is configured — which is not the same as
   * an empty zone, and leaves `zoneAffinity` inert rather than making every floor a deviation.
   */
  readonly zoneFloorIdsByCarId?: ReadonlyMap<string, readonly string[]> | undefined;
  /**
   * Floor id to expected arrivals over the predictor's horizon, for `predictedDemand`.
   *
   * The return of `DemandForecast.expectedDemandByFloor(at)`, unchanged, and exactly what
   * `RepositionContext.demandForecast` declares — so one forecast per decision is read by both
   * stage 3 and stage 7 and a run cannot park against one future while scoring its calls
   * against another. A cost term is pure and cannot own a learned model, so the forecast is
   * resolved once by whoever holds the predictor and handed in here. Absent means nobody
   * supplied one, and `predictedDemand` is then inert rather than guessing.
   */
  readonly demandForecast?: ReadonlyMap<string, number> | undefined;
}

/**
 * Everything a cost term is allowed to see.
 *
 * `estimate` is computed **once per (car, call)** by the eligibility filter and shared by
 * every term, which is what keeps a twelve-term weight vector the same price as a one-term
 * one. It is the output of the pure `Car.estimateCost()`; nothing here can mutate a car.
 */
export interface TermContext {
  readonly car: CarSnapshot;
  readonly call: DispatchCall;
  /** The call as the car was asked to price it, after `callType` decided what it may know. */
  readonly request: CostRequest;
  readonly estimate: CostEstimate;
  readonly at: SimTime;
  readonly observation: DispatchObservation;
}

/**
 * The words an Everyday surface prints for one cost term — the term's name, the `serves`
 * clause, and both slider ends, as the Everyday Mode engine contract §6.3 specifies them
 * (`docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md`).
 *
 * Declared **beside the term** rather than in a screen, because that is where the contract and
 * GitHub issue #147 both put them: *"the name, the serves clause and both end labels are
 * properties of the model, not of the screen"*. A table in a renderer mapping ids to friendly
 * prose is forbidden — it goes stale the day a term is added, and the screen is the wrong owner.
 *
 * Two readers, two vocabularies, and neither replaces the other. {@link CostTermDefinition.measures}
 * and the library's `serves` (`AWT`, `WT95`) are addressed to an optimizer and an engineer;
 * these words are addressed to a player. Collapsing them to save a field produces a sentence
 * addressed to nobody, which is the defect #147 caught before it shipped.
 */
export interface PlayerTermWords {
  /** The term as a player reads it — `wait time`, never `waitTime`. */
  readonly name: string;
  /** What weighting it serves, in plain words — `average wait`, never `AWT`. */
  readonly serves: string;
  /** The slider's zero end — what a weight of nothing buys. */
  readonly atZero: string;
  /** The slider's full end — what the maximum weight buys. */
  readonly atFull: string;
}

/**
 * The player-facing name and one-clause effect of a control — a schema row, a hard constraint —
 * as the Everyday Mode handoff's §16 rule 11 requires
 * (`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`, GitHub issue #147).
 *
 * Optional end labels carry a slider's two ends where the control is continuous; a toggle or a
 * choice has none. The optimizer-facing `description` stays untouched beside it — two fields,
 * two readers, never one string doing both jobs.
 */
export interface PlayerControlWords {
  readonly name: string;
  /** One clause: what moving the control does, in words a player can act on. */
  readonly effect: string;
  /** The low end of a continuous control, where a surface draws slider ends. */
  readonly atZero?: string | undefined;
  /** The high end. */
  readonly atFull?: string | undefined;
}

/**
 * One cost term: an id, how to normalize it, and a pure function of a {@link TermContext}.
 *
 * Adding the remaining nine terms in Phase 5 is adding nine of these to `terms/` and nine
 * rows to the registry. The engine iterates the registry and never names a term, so it does
 * not change — which is the property this shape exists to buy.
 *
 * `evaluate` must return a **non-negative** raw value in `unit`. A cost, never a bonus: a
 * negative term would let one car be rewarded for a property another is punished for and make
 * the weighted sum non-monotonic in its own weights.
 */
export interface CostTermDefinition {
  /** Must match an id in `data/dispatcher-profiles.json → terms`. */
  readonly id: string;
  /** SI unit of the raw value, or `''` for a dimensionless count. */
  readonly unit: string;
  /** What the term measures, mirroring the `terms` library entry. */
  readonly measures: string;
  readonly normalization: TermNormalization;
  /**
   * The stage settings under which this term can change a decision at all, copied onto its
   * `weights.<id>` row in `DISPATCH_PARAMETERS` (CLAUDE.md invariant 8).
   *
   * Declared by the term rather than listed in the schema, because only the term knows what it
   * needs: `rideTime` reads `request.destinationFloorId`, which exists only under
   * `dispatch.callType: destination-entry` or `mobile-credential`, so under the default call
   * type its weight is a dimension an optimizer would search for nothing. Keeping the condition
   * here is also what stops `parameters.ts` naming a term, which invariant 7 forbids.
   */
  readonly activeWhen?: Readonly<Record<string, readonly string[]>> | undefined;
  /**
   * The stage settings under which this term prices **more** than it otherwise does — and, unlike
   * {@link activeWhen}, **not a gate**.
   *
   * The two are mutually exclusive on the same key and say opposite things about the region
   * outside the condition. `activeWhen` says *"the weight is a dead dimension there, skip it"*.
   * `partiallyActiveWhen` says *"the weight is live there too — search it — but the term is
   * pricing a different quantity on the two sides, so a weight tuned on one does not transfer to
   * the other."*
   *
   * `stopCount` is the case, and the reason this field exists rather than a second `activeWhen`.
   * It counts the pickup stop under every call type and adds the destination stop only when the
   * destination is disclosed, so half of its raw value is conditional and its **weight** is not.
   * Gating it was tried and refused by measurement — `searchSpaceLiveness.test.ts` found
   * `weights.stopCount` still moving a run at `dispatch.callType: up-down-buttons`, outside the
   * proposed gate, which is the one error `activeWhen` exists to make impossible.
   *
   * Carried onto the derived `weights.<id>` row's `description` by `parameters.ts`, so it reaches
   * every schema consumer that exists — the search space, the experience layer's help text —
   * without adding a `DispatchParameterSpec` field nothing outside a test would read.
   *
   * Its proof obligation is the mirror image of the gate's, and
   * `terms/destinationDisclosure.test.ts` executes both: inside the condition the term must price
   * differently, and **outside it the term must still separate two candidate cars**. A
   * declaration that fails the second is a gate wearing the wrong name.
   */
  readonly partiallyActiveWhen?: Readonly<Record<string, readonly string[]>> | undefined;
  /**
   * The words an Everyday surface prints for this term — see {@link PlayerTermWords}.
   *
   * Required, not optional: a term authored without its player words would reach the Everyday
   * editor as a slider labelled with its engine id, which is the exact defect #147 names. The
   * compiler is the coverage test here; `playerWords.test.ts` checks the words' register.
   */
  readonly player: PlayerTermWords;
  /** Pure. Non-negative. Never `NaN`. */
  readonly evaluate: (context: TermContext) => number;
}

/** One term's contribution to one car's cost, kept for explainability and for tests. */
export interface ScoreBreakdown {
  readonly termId: string;
  readonly weight: number;
  /** The term's own unit. */
  readonly raw: number;
  /** `[0, 1]`. */
  readonly normalized: number;
  /** `weight * normalized`. */
  readonly contribution: number;
}

/** What one car would cost for one call, and why. */
export interface CarScore {
  readonly carId: string;
  /** `Σᵢ wᵢ · normalize(termᵢ)`. Lower is better. */
  readonly cost: number;
  readonly estimate: CostEstimate;
  /** One entry per weighted term, in registry order. */
  readonly terms: readonly ScoreBreakdown[];
}

/* -------------------------------------------------------------------------- *
 * Stages 4 and 5 — the decision
 * -------------------------------------------------------------------------- */

export const DECISION_OUTCOMES = [
  /** The call was allocated to a car that did not hold it. */
  'assigned',
  /** The call moved from one car to another. */
  'reassigned',
  /** The call stayed where it was. */
  'retained',
  /** Too early to decide: the batch or defer window is still open. */
  'deferred',
  /** No car may take it right now. The call stays registered and is re-scored later. */
  'unassigned',
] as const;

export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** Why a decision came out the way it did. Diagnostic; the contract is the outcome. */
export const DECISION_REASONS = [
  'no-eligible-car',
  'awaiting-batch-window',
  'awaiting-defer-window',
  'reassignment-disabled',
  'committed',
  'max-reassignments',
  'below-hysteresis',
  'incumbent-best',
] as const;

export type DecisionReason = (typeof DECISION_REASONS)[number];

/** The result of running stages 2 to 5 for one call. Frozen. */
export interface DispatchDecision {
  readonly callId: string;
  readonly outcome: DecisionOutcome;
  /** Cars now holding the call, best-first. More than one only under `split-demand`. */
  readonly carIds: readonly string[];
  /** The best car, or `undefined` when nothing was assigned. */
  readonly primaryCarId: string | undefined;
  /**
   * Passengers each car in {@link carIds} was priced for and should board:
   * `ceil(waitingPassengers / carIds.length)`, or `undefined` when nobody counted the queue.
   *
   * The half of `split-demand` that is not the car list. Three cars named for a landing of
   * twenty is three cars taking seven each; a runner that loads twenty onto the first one to
   * arrive is running a different system from the one that was scored.
   */
  readonly boardingPassengersPerCar: number | undefined;
  /** Weighted cost of the primary car. */
  readonly cost: number | undefined;
  readonly at: SimTime;
  /** When to ask again, for a `deferred` outcome. */
  readonly dueAt: SimTime | undefined;
  /** Every eligible car, best-first. Empty for a deferred decision. */
  readonly scores: readonly CarScore[];
  /** Every car that was filtered out, in the order supplied, with the reason. */
  readonly rejected: readonly EligibilityVerdict[];
  readonly reason: DecisionReason | undefined;
  /** The stage the decision came out of. */
  readonly stage: CallStage;
}

/** Facts the caller can supply about the world at decision time. All optional. */
export interface DispatchContext {
  /** Passengers waiting at the call floor for the call direction. */
  readonly waitingPassengers?: number | undefined;
  /** Their total mass, kilograms. */
  readonly waitingMassKg?: number | undefined;
  /**
   * Car id to the floor ids of that car's operational zone. Forwarded to
   * {@link DispatchObservation.zoneFloorIdsByCarId}; `policies/groupContext.ts` builds it.
   */
  readonly zoneFloorIdsByCarId?: ReadonlyMap<string, readonly string[]> | undefined;
  /**
   * Floor id to expected arrivals over the predictor's horizon. Forwarded to
   * {@link DispatchObservation.demandForecast}; resolve it once per dispatch pass, not per call.
   */
  readonly demandForecast?: ReadonlyMap<string, number> | undefined;
  /**
   * Shaft indices of the building's entrance floors, for the traffic-pattern detector.
   *
   * The third fact only the group controller holds, and the one this lane added. A car snapshot
   * carries its shaft's served floors, their heights and their access zones, and **not** whether
   * a floor is an entrance — so `dispatch/selector.ts` cannot tell a lobby arrival from an
   * interfloor one without being told. It was told wrongly once, which is why this field exists:
   * the first implementation used the shaft's lowest served floor as the lobby, and on
   * `midtown-office` the `main` bank's lowest served floor is `P1` at index −1 while the lobby
   * `G` is index 0, so a **pure up-peak run reported an interfloor rate four times its lobby
   * rate**. Both floors are `isEntrance` there; neither is the lowest one alone.
   *
   * Absent, the detector falls back to the shaft's lowest served floor — correct on a building
   * with nothing below the lobby, and stated rather than silent.
   */
  readonly entranceFloorIndices?: ReadonlySet<number> | undefined;
  /**
   * Seconds after local midnight at which the run's `t = 0` falls, from the resolved demand
   * template's `startOfDayS` — authored data, never a wall clock (invariant 3 intact).
   *
   * The input `dispatch/selector.ts`'s header said this file would gain *"if a scenario ever
   * carries a start-of-day"*. Six shipped templates author `startOfDayMin`, and the Everyday
   * rules' time conditions read `(startOfDayS + at) mod 86400` through this field. Read **only**
   * under `selection.policy: 'rules'`; absent — a template with no clock, or a hand-built caller
   * — every time clause evaluates false, which the rules editor states as a refusal rather than
   * leaving silent (§ D227).
   */
  readonly startOfDayS?: number | undefined;
}

/* -------------------------------------------------------------------------- *
 * Stage 6 — answering
 * -------------------------------------------------------------------------- */

export const ANSWER_REASONS = [
  /** The car holds the call and may stop. */
  'assigned',
  /** Bypassing on load, but no other car could serve the floor, so it stops anyway. */
  'sole-eligible-override',
  'not-at-floor',
  'not-assigned',
  'bypassing-load',
  'direction-mismatch',
] as const;

export type AnswerReason = (typeof ANSWER_REASONS)[number];

/** Whether a car should open its doors for a call it is standing at. */
export interface AnswerDecision {
  readonly carId: string;
  readonly callId: string;
  readonly answer: boolean;
  readonly reason: AnswerReason;
}

/* -------------------------------------------------------------------------- *
 * Stage 7 — repositioning
 * -------------------------------------------------------------------------- */

export const REPOSITION_REASONS = [
  /** Move: the anticipated saving clears the threshold. */
  'reposition',
  /** `parkingStrategy` is `stay`. */
  'parked',
  /** The car has work to do; parking is for idle cars only. */
  'busy',
  'already-there',
  /** The saving net of energy is below `repositionThresholdS`. */
  'below-threshold',
  /** The strategy has no target here — no served entrance, or an empty zone. */
  'no-target',
  /** `predicted-demand` with no forecast supplied. Phase 5 lands the predictor. */
  'no-forecast',
] as const;

export type RepositionReason = (typeof REPOSITION_REASONS)[number];

/** Where an idle car should wait, and the arithmetic that decided it. */
export interface RepositionDecision {
  readonly carId: string;
  readonly move: boolean;
  readonly targetFloorId: string | undefined;
  readonly reason: RepositionReason;
  /**
   * Expected response time saved **on each future call** by waiting at the target instead of
   * here, seconds.
   *
   * Expected response time is the mean, over the floors the shaft serves, of the real
   * jerk-limited time to reach each — not `distance / ratedSpeed`, because a park two floors
   * away is dominated by jerk and acceleration. The mean is weighted by the supplied demand
   * forecast, or, absent one, by the demand model the chosen strategy implies: `lobby` weights
   * the entrances, `zone-center` the zone.
   */
  readonly anticipatedSavingS: number;
  /** Seconds to reach the target, motor start and levelling included. The one-off trip. */
  readonly travelSeconds: number;
  /**
   * `anticipatedSavingS - repositionEnergyWeight * travelSeconds / PARK_CALL_HORIZON`:
   * the per-call gain, with the one-off trip amortised over the calls the park will answer so
   * both sides of the comparison are the same quantity.
   */
  readonly netGainS: number;
}

/** Facts the caller can supply about where cars should park. All optional. */
export interface RepositionContext {
  /** Ground-level floors, for `parkingStrategy: lobby`. A building may have several. */
  readonly entranceFloorIds?: readonly string[] | undefined;
  /**
   * The car's operational zone, for `parkingStrategy: zone-center`. Operational zoning is a
   * dispatcher strategy, so it arrives here rather than from the shaft; absent, the centre of
   * the shaft's own service zone is used.
   */
  readonly zoneFloorIds?: readonly string[] | undefined;
  /**
   * Floor id to expected arrivals, for `parkingStrategy: predicted-demand`. Phase 5 learns
   * this; until then a caller may supply one and the strategy works, or omit it and the
   * strategy reports `no-forecast` rather than guessing.
   */
  readonly demandForecast?: ReadonlyMap<string, number> | undefined;
  /**
   * Stage 7 settings in force **instead of** the profile's own `idle` section, for this decision.
   *
   * The seam Everyday Mode's interventions travel through (`sim/types.ts#RunInterventionConfig`).
   * A *park the cars in the lobby* intervention is the profile's own idle stage with
   * `parkingStrategy` replaced by `'lobby'` — the deadband and the energy exchange rate stay the
   * operator's, because the player's instruction is about *where* cars wait, not about what a
   * repositioning trip is worth. `Simulation.#park` computes it as a pure function of
   * `(interventions, at)` and passes it here; the policy stays one stateless pass-through to
   * `repositionDecisionFor`, which is what makes before/after delegation unnecessary — the
   * lifecycle and batch maps in `policy.ts` never fork.
   *
   * **Absent means the profile's `idle` is read untouched, by identity** — `repositionDecisionFor`
   * takes the branch it always took and hands the scorer the same frozen config object, so a run
   * with no interventions is byte-identical to one built before this field existed.
   */
  readonly idleOverride?: ResolvedIdleStage | undefined;
}

/* -------------------------------------------------------------------------- *
 * Resolved configuration
 * -------------------------------------------------------------------------- */

/**
 * The eligibility stage as docs/06-parameterization-and-tuning.md § Stage 2 declares it.
 *
 * ## The config surface, now landed
 *
 * This block used to record a gap: `dispatcherProfileSchema` had no `eligibility` section, so a
 * profile carrying one was rejected at load time and only {@link DispatchPolicyOptions.eligibility}
 * could set these two. An optimizer honouring {@link DISPATCH_PARAMETERS} could therefore *search*
 * both values and could not *persist* a winner — invariant 8 met on the sampling half only, which
 * is the same defect as a declared-but-unread knob arriving one step later.
 *
 * `config/schema.ts` now carries `eligibilityStageSchema` and `config/types.ts` carries
 * `ProfileEligibilityConfig`, so both values are authorable as `profiles[].eligibility` and
 * survive a `loadConfig` round trip. `dispatch/parameters.test.ts` asserts that for **every**
 * declared id in all three dispatch schemas, in both directions, so the gap cannot reopen quietly.
 */
export interface EligibilityStageConfig {
  /** Whether a car may take a call it will arrive at facing the wrong way. */
  readonly allowOppositeDirectionPickup?: boolean | undefined;
  /** Whether a moving car may be cut short at a floor it has not yet committed past. */
  readonly enRouteDiversion?: boolean | undefined;
  /** Refuse assignment when the projected load on arrival would exceed this. */
  readonly maxLoadFactorForAssignment?: number | undefined;
}

/** Stage 1, 4 and 5 settings, resolved. Mirrors `DispatchStageConfig` with defaults applied. */
export interface ResolvedDispatchStage {
  readonly callType: CallType;
  /** Whether the landing panel names a car per passenger. `none` is the conventional model. */
  readonly passengerAssignment: PassengerAssignmentMode;
  readonly batchWindowS: number;
  readonly assignmentTiming: AssignmentTiming;
  readonly deferWindowS: number;
  readonly assignmentMode: AssignmentMode;
  readonly splitThresholdPassengers: number;
  readonly reassignmentPolicy: ReassignmentPolicy;
  readonly commitmentPoint: CommitmentPoint;
  readonly reassignmentHysteresisS: number;
  readonly maxReassignmentsPerCall: number;
}

/** Stage 2 settings, resolved. */
export interface ResolvedEligibilityStage {
  readonly allowOppositeDirectionPickup: boolean;
  readonly enRouteDiversion: boolean;
  readonly maxLoadFactorForAssignment: number;
}

/**
 * Stage 6 settings the **dispatcher** owns, resolved.
 *
 * Deliberately one field. `bypassLoadThreshold`, `overloadThreshold` and the whole dwell
 * policy are also authored under `answer` in a profile, but they are read by the load sensor
 * and the door machine, which already declare them in `LOAD_SENSOR_PARAMETERS` and
 * `DOOR_PARAMETERS`. Re-declaring them here would be a second source of truth for the same
 * knob. The dispatcher reads their *effect* — `car.load.isBypassingHallCalls` — not the knob.
 *
 * `allowBypassIfSoleEligibleCar` is the exception because no car can evaluate it: it depends
 * on how many *other* cars could serve the floor, which only the group controller knows.
 */
export interface ResolvedAnswerStage {
  readonly allowBypassIfSoleEligibleCar: boolean;
}

/**
 * The `idle.parkingFloorIndex` value that means *this shaft's own highest served floor*.
 *
 * Written only by the rules compiler, for `park the idle cars at the top floor`: parking is a
 * per-car decision, `parkingCandidates` resolves it against the shaft it is deciding for, and a
 * profile that wants a *specific* top floor authors that floor's real index. An integer so the
 * resolved shape stays one numeric field, and `MAX_SAFE_INTEGER` rather than `Infinity` so the
 * sentinel survives JSON. No shaft serves a floor at this index, which is what makes the branch
 * in `parkingCandidates` total rather than a collision.
 */
export const PARK_AT_TOP_FLOOR_INDEX: number = Number.MAX_SAFE_INTEGER;

/** Stage 7 settings, resolved. */
export interface ResolvedIdleStage {
  readonly parkingStrategy: ParkingStrategy;
  readonly repositionThresholdS: number;
  readonly repositionEnergyWeight: number;
  /**
   * The shaft floor index `fixed-floor` parks at; {@link PARK_AT_TOP_FLOOR_INDEX} for the
   * shaft's top served floor. Read by no other strategy, and resolved to its declared default
   * of 0 so the field is always present — an optimizer sampling `fixed-floor` starts at the
   * datum floor rather than at an undefined it cannot write back.
   */
  readonly parkingFloorIndex: number;
}

/** Which hard constraints are on. The boolean form a generic optimizer can sample. */
export interface ResolvedConstraints {
  readonly noDirectionReversal: boolean;
}

/**
 * Stage 3's **weight-set selection**, as a profile may author it.
 *
 * Re-exported from `config/types.ts`, not redeclared: it is a section of
 * `dispatcherProfileSchema` and every schema-validated shape lives there. The whole authored
 * surface of `dispatch/selector.ts` is six scalars and no map — the arms themselves are the
 * file-level `patternSwitching` block, in the same file and for the same reason the cost-term
 * library is, because a library of what exists is not a knob an optimizer samples.
 */
export type { SelectionStageConfig } from '../config/types.js';

/**
 * A dispatcher profile with every default applied and every claim checked.
 *
 * The five stage sections are exactly the tunable surface: every field in them is declared in
 * {@link DISPATCH_PARAMETERS}, and every declared parameter resolves to one of them.
 * `parameters.test.ts` asserts the correspondence in both directions, because a declared
 * parameter nothing reads misdirects an optimizer just as badly as a hidden one.
 */
export interface ResolvedDispatchConfig {
  readonly id: string;
  readonly name: string;
  /** There is one engine. The field exists so a future engine is a config error, not a silent swap. */
  readonly engine: 'weighted-cost';
  /** Term id to weight, for terms this phase implements, in registry order. */
  readonly weights: ReadonlyMap<string, number>;
  /**
   * Term id to weight for terms the library declares but no phase implements yet.
   *
   * Carried rather than rejected so every profile in `data/dispatcher-profiles.json` builds a
   * working policy today: `predictive-balanced` weights ten terms and Phase 2 implemented
   * three. They contribute nothing to a score, and a caller that needs to know can read this.
   * A *misspelled* term never reaches here — `dispatcherProfilesSchema` already rejects a
   * weight whose id is not in the `terms` library.
   */
  readonly pendingWeights: ReadonlyMap<string, number>;
  /** The `hardConstraints` array as authored, for provenance. */
  readonly declaredHardConstraints: readonly HardConstraintId[];
  readonly constraints: ResolvedConstraints;
  readonly normalization: ResolvedNormalization;
  readonly dispatch: ResolvedDispatchStage;
  readonly eligibility: ResolvedEligibilityStage;
  readonly answer: ResolvedAnswerStage;
  readonly idle: ResolvedIdleStage;
  /**
   * Stage 3's weight-set selection. Six scalars, all declared, all defaulted to inert.
   *
   * `policy: 'off'` is the default and every shipped profile's state; under it
   * {@link ResolvedDispatchConfig.weightSets} is absent and the policy hands {@link weights} —
   * the same frozen Map object — to the scorer on every decision, so a non-selecting run is
   * byte-identical by construction.
   */
  readonly selection: ResolvedSelection;
  /**
   * The arms the selector may choose between, absent when it is off.
   *
   * **Not** a tunable section: `tunablePathsOf` does not enumerate it and
   * `DISPATCH_PARAMETERS` declares no row for it, because the arm set is the same kind of thing
   * as the cost-term library — a statement of what exists, resolved out of
   * `data/dispatcher-profiles.json`, and not a dimension an optimizer samples.
   */
  readonly weightSets?: ResolvedWeightSets | undefined;
  /**
   * The Everyday rules' compiled arms, present exactly when `selection.policy` is `'rules'`.
   *
   * Beside {@link weightSets} rather than inside `selection`, for `weightSets`' own reason:
   * `parameters.ts` enumerates `selection`'s keys against declared tunables and a compiled arm
   * list is not a tunable — it is the resolved form of the profile's `rules.rows`, the same kind
   * of thing as the arm library. The two are mutually exclusive by construction: the resolver
   * builds `weightSets` only under `fuzzy`/`contextual` and `ruleSets` only under `rules`.
   */
  readonly ruleSets?: ResolvedRuleSets | undefined;
}

/* -------------------------------------------------------------------------- *
 * The policy
 * -------------------------------------------------------------------------- */

/**
 * The group controller for one bank: one scoring engine, configured by data.
 *
 * Stateful, because stages 1, 4 and 5 are: a batch window has to remember which calls are open,
 * and a starvation guard has to remember how often a call has moved. The state is a map of
 * {@link CallLifecycle} keyed by call id, iterated in insertion order, and {@link reset} clears
 * it — a replication that inherits the previous one's assignments is not statistically
 * independent (docs/03-traffic-and-statistics.md).
 *
 * Nothing here draws a random number or reads a clock. **Every stage method takes the time it
 * should act at**, including the two that do not currently need it: a signature with no `at`
 * is an invitation for a later implementation to reach for `Date.now()`, and CLAUDE.md
 * invariant 3 is easier to keep when the simulated clock is already in hand.
 */
export interface DispatchPolicy {
  /** The profile id this was built from. **Never read to decide anything.** */
  readonly id: string;
  readonly name: string;
  readonly engine: 'weighted-cost';
  readonly config: ResolvedDispatchConfig;
  /** The self-describing schema of every tunable this policy reads (CLAUDE.md invariant 8). */
  readonly parameters: readonly DispatchParameterSpec[];
  /** Every live call, in registration order. */
  readonly calls: readonly CallLifecycle[];

  /**
   * **Stage 1.** Register a call and decide when it becomes scoreable.
   *
   * Idempotent per batch: a second call with the same `floorId:direction` while the first
   * one's batch window is still open joins it, accumulating `waitingPassengers`, rather than
   * starting a second lifecycle. That is what `batchWindowS` buys.
   */
  register(call: DispatchCall, at: SimTime, context?: DispatchContext | undefined): CallLifecycle;

  /** **Stages 2 to 4.** Filter, score and assign. */
  dispatch(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): DispatchDecision;

  /** **Stage 5.** Re-score an assigned call and move it if the improvement is worth the churn. */
  reconsider(
    callId: string,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): DispatchDecision;

  /**
   * **Stage 6.** Whether this car should stop here for this call.
   *
   * `cars` is the group the car belongs to. Omitting it means "the group is unknown", which is
   * not the same as a group of one: `answer.allowBypassIfSoleEligibleCar` claims that no other
   * car could serve the floor, and that claim can only be made against a group somebody
   * supplied. Without one the override does not fire and a car bypassing on load stays past.
   */
  answer(
    car: CarSnapshot,
    call: DispatchCall,
    at: SimTime,
    cars?: readonly CarSnapshot[] | undefined,
  ): AnswerDecision;

  /** **Stage 7.** Where an idle car should wait. */
  reposition(
    car: CarSnapshot,
    at: SimTime,
    context?: RepositionContext | undefined,
  ): RepositionDecision;

  /**
   * **Stage 3 alone.** Score every eligible car without assigning anything.
   *
   * The pure view of the engine: no lifecycle is created or touched. It is what a renderer
   * shows, what a test asserts on, and what Phase 5's `AuctionDispatcher` collects as bids —
   * an auction changes *who aggregates*, not what a bid is worth.
   *
   * The landing is priced exactly as {@link dispatch} would divide it, `split-demand`
   * included: a bid to collect a share of a queue is not a bid to collect all of it, and two
   * prices for the same question would be two sources of truth.
   */
  score(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly CarScore[];

  /** Stage 2 alone, for the same reasons. */
  eligible(
    call: DispatchCall,
    cars: readonly CarSnapshot[],
    at: SimTime,
    context?: DispatchContext | undefined,
  ): readonly EligibilityVerdict[];

  lifecycle(callId: string): CallLifecycle | undefined;

  /** Mark a call served. It leaves the live set; the record is returned for the metrics layer. */
  complete(callId: string, at: SimTime): CallLifecycle | undefined;

  /** Drop a call that will never be served. */
  cancel(callId: string): boolean;

  /** Forget every call. For reusing a policy across replications. */
  reset(): void;
}

/* -------------------------------------------------------------------------- *
 * Tunables (CLAUDE.md invariants 7 and 8)
 * -------------------------------------------------------------------------- */

/** Parameter kinds a generic optimizer understands. See docs/06-parameterization-and-tuning.md. */
export type DispatchParameterType = 'continuous' | 'integer' | 'categorical' | 'boolean';

/**
 * A numeric gate: the inclusive interval of another parameter's value that makes this one live.
 *
 * The second of the two `activeWhen` forms, and it exists because the first cannot express a
 * real gate the schema needs. `auction.reserveMarginalDelayS` is inert while `auction.rounds`
 * is 1 — a single-round auction has no later round to reallocate a declined contract into — and
 * `auction.rounds` is an **integer with a range and no `values`**, so the value-list form could
 * only encode it as `['2', '3', …]`: a list of strings compared against a sampled number, which
 * every honest evaluator gets wrong in one of two ways (never active, or thrown). The parameter
 * therefore shipped **ungated**, and an optimizer spent budget on a dead dimension whenever it
 * sampled `rounds = 1`.
 *
 * At least one bound must be present. Omitting one means unbounded on that side, so
 * `{ min: 2 }` reads "live at 2 and above". Bounds are inclusive, matching
 * {@link DispatchParameterSpec.range}, which is also inclusive.
 *
 * Evaluated by `isParameterActive` in `dispatch/parameters.ts` — **the** evaluation rule, shared
 * by both forms, so an optimizer implements one function and not one per parameter.
 */
export interface ActiveWhenRange {
  /** Inclusive lower bound. Omitted means unbounded below. */
  readonly min?: number | undefined;
  /** Inclusive upper bound. Omitted means unbounded above. */
  readonly max?: number | undefined;
}

/**
 * One `activeWhen` condition on one other parameter.
 *
 * Either the **values** that make this parameter live — for a `categorical` or `boolean` gate,
 * which is what every gate in the schema was until the auction reserve needed one — or an
 * inclusive numeric **interval**, for an `integer` or `continuous` gate. A condition is
 * satisfied when the gate's current value is in the list, or inside the interval.
 */
export type ActiveWhenCondition = readonly string[] | ActiveWhenRange;

/**
 * A self-describing tunable, in the same shape as `DoorParameterSpec` and `CarParameterSpec`.
 *
 * The shape is repeated rather than shared for the reason `CarParameterSpec` gives: it is the
 * generic parameter-schema shape from docs/06-parameterization-and-tuning.md, which has no
 * home module until Phase 7 lands `tuning/`. When it does, all three declarations move there.
 *
 * `id` is the **dotted path of the value in `data/dispatcher-profiles.json`**, so an optimizer
 * that samples this schema can write its winner straight back into a profile.
 */
export interface DispatchParameterSpec {
  readonly id: string;
  readonly type: DispatchParameterType;
  /** Inclusive `[min, max]`. Present for `continuous` and `integer`. */
  readonly range?: readonly [number, number] | undefined;
  readonly scale?: 'linear' | 'log' | undefined;
  /** Admissible values. Present for `categorical`. */
  readonly values?: readonly string[] | undefined;
  readonly default: number | string | boolean;
  /** SI unit, or omitted for a dimensionless quantity. */
  readonly unit?: string | undefined;
  readonly description: string;
  /**
   * Parameter id to the condition on it that makes **this** parameter live. Every condition
   * must hold.
   *
   * Two forms, one evaluation rule (`isParameterActive` in `dispatch/parameters.ts`): a list of
   * admitted values for a categorical or boolean gate, or an {@link ActiveWhenRange} for an
   * integer or continuous one. The second form landed because `auction.reserveMarginalDelayS`
   * is inert while `auction.rounds` is 1 and no list of strings can say so about an integer.
   */
  readonly activeWhen?: Readonly<Record<string, ActiveWhenCondition>> | undefined;
  /**
   * The player-facing name and one-clause effect, present on every row an Everyday surface can
   * reach — see {@link PlayerControlWords} and `playerWords.test.ts`, which pins the reachable
   * set in both directions.
   *
   * Optional on the schema row because most of the schema is the optimizer's territory and a
   * player never meets it; a row without one that a Casual surface *does* reach renders the
   * honest fallback and is a content bug (#147).
   */
  readonly player?: PlayerControlWords | undefined;
}

/**
 * Options accepted alongside a profile when building a policy.
 *
 * Everything here is an **override applied after the profile**, for a test fixture or an
 * optimizer that has not yet persisted its candidate as a profile. Precedence is
 * `overrides > profile > defaults`, the same order `resolveDoorConfig` and
 * `resolveLoadSensor` use.
 */
export interface DispatchPolicyOptions {
  readonly eligibility?: EligibilityStageConfig | undefined;
  readonly normalization?: Partial<ResolvedNormalization> | undefined;
  /** Term id to weight. Replaces the profile's weight for that term only. */
  readonly weights?: Readonly<Record<string, number>> | undefined;
  /** Replaces the profile's hard-constraint set entirely when present. */
  readonly hardConstraints?: readonly string[] | undefined;
  /** Overrides the profile's `selection` section field by field. */
  readonly selection?: SelectionStageConfig | undefined;
  /**
   * The weight-set library, which is file-level rather than per profile.
   *
   * `patternSwitching` and the profiles it names both live in `data/dispatcher-profiles.json`,
   * so a policy built from one profile cannot resolve its own arms. The runner supplies them —
   * `experiments/src/runner/experiment.ts` already carries a `DispatchPolicyOptions` per
   * dispatcher arm end to end, so a study enables the selector without a line of change in
   * `sim/simulation.ts`.
   *
   * Required whenever `selection.policy` is not `'off'`; supplying it while the policy is off
   * changes nothing.
   */
  readonly weightSets?: WeightSetSource | undefined;
}

/**
 * The shape `resolveDispatchConfig` reads a profile through.
 *
 * Declared structurally, as `physics/doors` does with `DoorAnswerSource`, so this module
 * states exactly what it needs from a profile and a real `DispatcherProfile` satisfies it
 * without a cast.
 */
export interface DispatcherProfileSource {
  readonly id: string;
  readonly name: string;
  readonly engine?: string | undefined;
  readonly weights: Readonly<Record<string, number>>;
  readonly hardConstraints?: readonly string[] | undefined;
  /**
   * This dispatcher's normalization half-cost points.
   *
   * Authorable per profile, and overridden by {@link DispatchPolicyOptions.normalization} when a
   * fixture or an optimizer supplies one. Both are declared in {@link DISPATCH_PARAMETERS}, so
   * both must be writable back into a profile.
   */
  readonly normalization?:
    | { readonly waitTimeS?: number | undefined; readonly distanceM?: number | undefined }
    | undefined;
  readonly dispatch?:
    | {
        readonly callType?: CallType | undefined;
        readonly passengerAssignment?: PassengerAssignmentMode | undefined;
        readonly batchWindowS?: number | undefined;
        readonly assignmentTiming?: AssignmentTiming | undefined;
        readonly deferWindowS?: number | undefined;
        readonly assignmentMode?: AssignmentMode | undefined;
        readonly splitThresholdPassengers?: number | undefined;
        readonly reassignmentPolicy?: ReassignmentPolicy | undefined;
        readonly commitmentPoint?: CommitmentPoint | undefined;
        readonly reassignmentHysteresisS?: number | undefined;
        readonly maxReassignmentsPerCall?: number | undefined;
      }
    | undefined;
  readonly eligibility?: EligibilityStageConfig | undefined;
  readonly answer?: { readonly allowBypassIfSoleEligibleCar?: boolean | undefined } | undefined;
  readonly idle?:
    | {
        readonly parkingStrategy?: ParkingStrategy | undefined;
        readonly parkingFloorIndex?: number | undefined;
        readonly repositionThresholdS?: number | undefined;
        readonly repositionEnergyWeight?: number | undefined;
      }
    | undefined;
  /** Stage 3's weight-set selection. Absent is `policy: 'off'`, which every shipped profile is. */
  readonly selection?: SelectionStageConfig | undefined;
  /**
   * The Everyday rules rows (§11.5). The id unions rather than bare strings, so a
   * `DispatcherProfile` — whose `rules` uses them — stays assignable here; `resolveRuleArms`
   * still validates at runtime, because a hand-built fixture can cast past any type.
   */
  readonly rules?:
    | {
        readonly rows?:
          | readonly {
              readonly when: RuleConditionId;
              readonly whenValue?: number | string | undefined;
              readonly then: RuleActionId;
              readonly thenValue?: number | string | undefined;
            }[]
          | undefined;
      }
    | undefined;
}
