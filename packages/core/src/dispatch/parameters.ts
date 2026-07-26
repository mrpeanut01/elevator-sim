/**
 * The self-describing parameter schema — CLAUDE.md invariant 8, and the contract Phase 7's
 * optimizer is written against.
 *
 * > *"For an optimizer to search this space **without knowing anything about elevators**, the
 * > parameters must be self-describing."* — docs/06-parameterization-and-tuning.md
 *
 * A generic search algorithm reads {@link DISPATCH_PARAMETERS}, samples a valid configuration
 * from `type` plus `range`/`values`, skips knobs whose `activeWhen` is not satisfied, writes
 * the result back into a dispatcher profile using `id` as the dotted path, and never contains
 * a line of elevator-specific code. That is the whole mechanism.
 *
 * ## The schema must be exact in both directions
 *
 * `parameters.test.ts` asserts two things, and both matter equally:
 *
 * 1. **Nothing hidden.** Every field of the resolved config's tunable sections is declared.
 *    A knob the engine reads but does not declare is invisible to the optimizer, which will
 *    report a tuned winner that is only optimal at whatever the hidden value happened to be.
 * 2. **Nothing spurious.** Every declared parameter resolves to a field the engine actually
 *    reads. A declared parameter nothing reads is worse than useless: the optimizer spends
 *    real replications — 50 to 200 each — discovering that a dimension does nothing, and a
 *    noisy objective will happily attribute a difference to it anyway.
 *
 * ## What is deliberately *not* here
 *
 * | Parameter | Declared by | Why not here |
 * |---|---|---|
 * | `answer.bypassLoadThreshold`, `answer.overloadThreshold` | `LOAD_SENSOR_PARAMETERS` | the load cell owns them; the dispatcher reads their effect (`isBypassingHallCalls`), not the knob |
 * | `answer.dwellPolicy`, `dwellAdaptationGain`, `maxDwellS`, `reopenOnLateArrival` | `DOOR_PARAMETERS` | the door machine implements dwell; a second declaration is a second source of truth |
 * | `car.*` physics | `CAR_PARAMETERS`, `config/schema.ts` | Layer 1, not dispatch |
 * | `idle.predictorHorizonS`, `idle.predictorLearningRate` | nobody, yet | **Phase 5 owns the learned arrival model. Nothing in Phase 2 reads either, so declaring them would violate rule 2 above and send the optimizer hunting a dimension with no effect.** They land with the predictor. |
 * | `weights.rideTime` and the other eight pending terms | nobody, yet | same reason: a weight on an unimplemented term changes no decision. Phase 5 adds a row per term as each lands |
 * | `dispatch.hardConstraints` as an array | — | exposed instead as the boolean `constraints.noDirectionReversal`, because a set-valued parameter is not something a generic optimizer can sample, and a boolean per constraint is |
 * | `PARK_CALL_HORIZON` | — | **degenerate with `idle.repositionEnergyWeight`.** It enters the reposition test only as a divisor of that weight, so two knobs would move one ratio — the same argument `normalize.ts` makes for a bounded term's `fullScale`. Fixed in `lifecycle.ts` and documented there |
 * | `carMode`, service zoning, access zoning | — | **state and building fabric, not tunables.** docs/06 lists all three under stage 2, and the eligibility filter reads all three — through `Car.estimateCost()`, which owns them. An optimizer must not be handed a knob that sets a car out of service or moves a shaft |
 * | operational zoning | Phase 5 | the third kind of zoning is a dispatcher strategy, and this phase expresses it as the `zoneAffinity` cost term rather than as an eligibility filter. `RepositionContext.zoneFloorIds` already carries a zone for stage 7 |
 *
 * ## Ranges
 *
 * Weights use `[0, 5]` from docs/06 § The parameter schema. Stage ranges are the ones the same
 * document's Layer 2 tables give. The two normalization references get ranges wide enough to
 * change the shape of the map without inverting the meaning of a weight.
 */

import {
  ASSIGNMENT_MODES,
  ASSIGNMENT_TIMINGS,
  CALL_TYPES,
  COMMITMENT_POINTS,
  PARKING_STRATEGIES,
  REASSIGNMENT_POLICIES,
} from '../config/types.js';

import { NORMALIZATION_DEFAULTS } from './normalize.js';
import { COST_TERMS } from './terms/index.js';
import type { DispatchParameterSpec, ResolvedDispatchConfig } from './types.js';

/* -------------------------------------------------------------------------- *
 * Defaults
 * -------------------------------------------------------------------------- */

/**
 * Every dispatch default, in one frozen object.
 *
 * The single source of truth: {@link DISPATCH_PARAMETERS} quotes these rather than repeating
 * the numbers, and `resolveDispatchConfig` applies them, so the declared schema and the
 * resolver cannot disagree. `parameters.test.ts` checks that too.
 *
 * The defaults describe the **simplest system that works**, not a good dispatcher: immediate
 * single-car assignment, no batching, no reassignment, no parking. A profile opts into every
 * mechanism it wants, so a run that did not configure something cannot silently benefit from
 * it — and the value of each mechanism is measurable against these.
 */
export const DISPATCH_DEFAULTS = Object.freeze({
  /** Conventional up/down buttons: neither destination nor credential known at call time. */
  callType: 'up-down-buttons',
  /** No batching. Every press is scored on its own. */
  batchWindowS: 0,
  assignmentTiming: 'immediate',
  deferWindowS: 0,
  assignmentMode: 'single-car',
  /** A full car's design load, so `split-demand` triggers when a landing exceeds one carload. */
  splitThresholdPassengers: 12,
  /** Conservative: a call stays where it was put unless a profile asks for better. */
  reassignmentPolicy: 'never',
  /** What real controllers do; only consulted under `until-commitment`. */
  commitmentPoint: 'on-deceleration',
  /** Seconds of wait a switch must save. 0 would let two equal cars trade a call forever. */
  reassignmentHysteresisS: 5,
  maxReassignmentsPerCall: 3,
  /** A car may take a call it will arrive at facing the wrong way, unless a profile forbids it. */
  allowOppositeDirectionPickup: true,
  /** Inert at 1.0: the load cell's own bypass has already filtered anything fuller. */
  maxLoadFactorForAssignment: 1,
  /** Off: overriding a full car's bypass is a starvation guard a profile opts into. */
  allowBypassIfSoleEligibleCar: false,
  /** Cars wait where they last stopped. */
  parkingStrategy: 'stay',
  /**
   * Seconds of expected response, **per future call**, a park must save before it is worth the
   * trip.
   *
   * Two, not five. The deadband is compared against a per-call gain (`PARK_CALL_HORIZON`
   * explains why both sides are per-call), and the per-call gain a park can actually buy is
   * bounded by the shaft: on `data/buildings/midtown-office.json` the best `zone-center`
   * saving anywhere is 7.5 s, so a 5 s deadband admits only the two or three floors at each
   * extreme and vetoed the strategy outright under the previous one-off arithmetic. Two
   * seconds is about half a single-floor hop on that building — small enough that a car four
   * or more floors off its park comes in, large enough that no car shuffles for noise.
   */
  repositionThresholdS: 2,
  /**
   * Seconds of anticipated per-call wait the operator will spend to avoid one second of empty
   * travel, the travel being amortised over `PARK_CALL_HORIZON` calls.
   */
  repositionEnergyWeight: 0.2,
} as const);

/* -------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------- */

/** One `weights.<termId>` row per implemented term, in registry order. */
const WEIGHT_PARAMETERS: readonly DispatchParameterSpec[] = COST_TERMS.map((term) => ({
  id: `weights.${term.id}`,
  type: 'continuous' as const,
  range: [0, 5] as const,
  scale: 'linear' as const,
  default: 0,
  description: `Weight on the normalized ${term.id} term — ${term.measures.toLowerCase()}${term.unit === '' ? '' : `, raw unit ${term.unit}`}. Zero removes the term from the sum entirely.`,
}));

/**
 * The schema for every dispatch tunable (CLAUDE.md invariant 8).
 *
 * `id` is the dotted path in `data/dispatcher-profiles.json`, so a tuned winner is written
 * back as a profile without translation. `eligibility.*` is the one section the config schema
 * does not carry yet — see {@link EligibilityStageConfig} for the exact rows it owes.
 */
export const DISPATCH_PARAMETERS: readonly DispatchParameterSpec[] = [
  ...WEIGHT_PARAMETERS,

  /* ---- normalization (stage 3) ---- */
  {
    id: 'normalization.waitTimeS',
    type: 'continuous',
    range: [10, 180],
    scale: 'log',
    default: NORMALIZATION_DEFAULTS.waitTimeS,
    unit: 's',
    description:
      'Half-cost point of the saturating waitTime map: a wait of this many seconds normalizes to 0.5. Changes the curvature of the map, not its gain, so it is not recoverable by rescaling weights.waitTime. Default is the 60 s threshold the % > 60 s metric reports against.',
  },
  {
    id: 'normalization.distanceM',
    type: 'continuous',
    range: [5, 200],
    scale: 'log',
    default: NORMALIZATION_DEFAULTS.distanceM,
    unit: 'm',
    description:
      'Half-cost point of the saturating distanceTravelled map: this many added metres normalizes to 0.5. About nine floor-to-floor heights by default. A single-term profile is invariant to it; it matters when distance trades against wait.',
  },

  /* ---- hard constraints (stage 2) ---- */
  {
    id: 'constraints.noDirectionReversal',
    type: 'boolean',
    default: false,
    description:
      'Refuse any car that would have to change direction on account of the call — either to reach the floor or to face the passenger the right way on arrival. The one line that turns the ETA dispatcher into conventional collective control. A hard filter: no weight vector can buy past it. Authored in a profile as hardConstraints: ["noDirectionReversal"].',
  },

  /* ---- stage 1: registration ---- */
  {
    id: 'dispatch.callType',
    type: 'categorical',
    values: [...CALL_TYPES],
    default: DISPATCH_DEFAULTS.callType,
    description:
      'What is known when the call is registered. up-down-buttons knows neither destination nor credential; destination-entry knows the destination; mobile-credential knows both. Moving information earlier is the entire source of destination dispatch’s advantage, and this is the knob that moves it.',
  },
  {
    id: 'dispatch.batchWindowS',
    type: 'continuous',
    range: [0, 5],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.batchWindowS,
    unit: 's',
    description:
      'Hold a call this long so near-simultaneous presses at the same landing are merged into one lifecycle with a true count of who is waiting. Trades a little wait for a better-informed score.',
  },

  /* ---- stage 4: assignment ---- */
  {
    id: 'dispatch.assignmentTiming',
    type: 'categorical',
    values: [...ASSIGNMENT_TIMINGS],
    default: DISPATCH_DEFAULTS.assignmentTiming,
    description:
      'Assign as soon as the call is scoreable, or defer so several calls can be allocated against one another. Deferring is impossible under destination entry, where the passenger must be told which car to walk to at once; that combination is rejected rather than silently measured.',
  },
  {
    id: 'dispatch.deferWindowS',
    type: 'continuous',
    range: [0, 10],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.deferWindowS,
    unit: 's',
    description: 'How long a deferred assignment waits before it is taken.',
    activeWhen: { 'dispatch.assignmentTiming': ['deferred'] },
  },
  {
    id: 'dispatch.assignmentMode',
    type: 'categorical',
    values: [...ASSIGNMENT_MODES],
    default: DISPATCH_DEFAULTS.assignmentMode,
    description:
      'One car per call, or several in parallel once a landing queue exceeds splitThresholdPassengers. Parallel service is what stops a heavy floor being drained one carload at a time.',
  },
  {
    id: 'dispatch.splitThresholdPassengers',
    type: 'integer',
    range: [1, 40],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.splitThresholdPassengers,
    description:
      'Waiting count above which demand at one landing is split across cars; the number of cars is ceil(waiting / threshold), capped by how many are eligible.',
    activeWhen: { 'dispatch.assignmentMode': ['split-demand'] },
  },

  /* ---- stage 5: reassignment ---- */
  {
    id: 'dispatch.reassignmentPolicy',
    type: 'categorical',
    values: [...REASSIGNMENT_POLICIES],
    default: DISPATCH_DEFAULTS.reassignmentPolicy,
    description:
      'never: an assignment is final. until-commitment: a call may move until the car commits at commitmentPoint. continuous: a call may move at any time, commitment included. One of the highest-leverage knobs available, and the mechanism that makes capacity-driven bypass work.',
  },
  {
    id: 'dispatch.commitmentPoint',
    type: 'categorical',
    values: [...COMMITMENT_POINTS],
    default: DISPATCH_DEFAULTS.commitmentPoint,
    description:
      'When an assignment becomes irrevocable. on-assignment: immediately. on-deceleration: once the car is inside the deceleration phase of the move that ends at the call floor — what real systems do. on-door-open: only once the doors are moving at the floor. Nested, so a later point always means more reassignment freedom.',
    activeWhen: { 'dispatch.reassignmentPolicy': ['until-commitment'] },
  },
  {
    id: 'dispatch.reassignmentHysteresisS',
    type: 'continuous',
    range: [0, 30],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.reassignmentHysteresisS,
    unit: 's',
    description:
      'Seconds of estimated wait a switch must save before a call is moved, on top of a strictly lower weighted cost. Prevents two near-equal cars trading a call back and forth on floating-point noise. In seconds rather than cost units because a cost threshold would change meaning with every weight vector.',
    activeWhen: { 'dispatch.reassignmentPolicy': ['until-commitment', 'continuous'] },
  },
  {
    id: 'dispatch.maxReassignmentsPerCall',
    type: 'integer',
    range: [0, 10],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.maxReassignmentsPerCall,
    description:
      'Starvation guard: a call that has already moved this many times stays put. Without a bound, a call in a busy bank can be handed on indefinitely and never actually served.',
    activeWhen: { 'dispatch.reassignmentPolicy': ['until-commitment', 'continuous'] },
  },

  /* ---- stage 2: eligibility ---- */
  {
    id: 'eligibility.allowOppositeDirectionPickup',
    type: 'boolean',
    default: DISPATCH_DEFAULTS.allowOppositeDirectionPickup,
    description:
      'Whether a car may take a call it will arrive at facing the wrong way — a down-travelling car answering an up call. Off is one half of conventional collective behaviour; the other half is constraints.noDirectionReversal.',
  },
  {
    id: 'eligibility.maxLoadFactorForAssignment',
    type: 'continuous',
    range: [0, 1.2],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.maxLoadFactorForAssignment,
    description:
      'Refuse assignment when the projected load on arrival would exceed this fraction of rated load. Distinct from the load cell’s bypass threshold: bypass is about the car refusing new hall calls, this is about the dispatcher declining to promise one.',
  },

  /* ---- stage 6: answering ---- */
  {
    id: 'answer.allowBypassIfSoleEligibleCar',
    type: 'boolean',
    default: DISPATCH_DEFAULTS.allowBypassIfSoleEligibleCar,
    description:
      'Starvation guard: let a car bypassing on load answer anyway when it is the only car whose shaft reaches the floor. Owned by the dispatcher rather than the car because it depends on how many other cars exist, which no car can know.',
  },

  /* ---- stage 7: repositioning ---- */
  {
    id: 'idle.parkingStrategy',
    type: 'categorical',
    values: [...PARKING_STRATEGIES],
    default: DISPATCH_DEFAULTS.parkingStrategy,
    description:
      'Where an idle car waits. stay: where it last stopped. lobby: the nearest served entrance. zone-center: the median floor of its zone. predicted-demand: the floor with the highest forecast arrivals, which needs a forecast — Phase 5 learns one; without it the strategy reports no-forecast rather than guessing. Each choice also declares the demand model the move is scored against, so lobby parking is judged on lobby calls. On sparse-traffic buildings this stage dominates everything else.',
  },
  {
    id: 'idle.repositionThresholdS',
    type: 'continuous',
    range: [0, 60],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.repositionThresholdS,
    unit: 's',
    description:
      'Deadband: do not move an idle car unless every call it answers from the new park is expected to be served this many seconds sooner. Per call, like the gain it is compared against — the repositioning trip is amortised over the calls the park will answer, so a park is not asked to repay a whole trip out of one call. Stops cars shuffling for fractions of a second.',
    activeWhen: { 'idle.parkingStrategy': ['lobby', 'zone-center', 'predicted-demand'] },
  },
  {
    id: 'idle.repositionEnergyWeight',
    type: 'continuous',
    range: [0, 2],
    scale: 'linear',
    default: DISPATCH_DEFAULTS.repositionEnergyWeight,
    description:
      'Exchange rate between anticipated waiting time and energy spent moving an empty car: the per-call net gain is the expected saving minus this times the seconds of travel, amortised over the calls the park is expected to answer. Both sides in seconds per call, so the subtraction is dimensionally honest. 0 ignores energy entirely; 2 makes a park whose saving equals its travel time exactly break even, which is the whole meaningful range.',
    activeWhen: { 'idle.parkingStrategy': ['lobby', 'zone-center', 'predicted-demand'] },
  },
];

/** Every declared id, for a quick membership test. */
export const DISPATCH_PARAMETER_IDS: ReadonlySet<string> = new Set(
  DISPATCH_PARAMETERS.map((parameter) => parameter.id),
);

/** A declared parameter by id. */
export function dispatchParameter(id: string): DispatchParameterSpec | undefined {
  return DISPATCH_PARAMETERS.find((parameter) => parameter.id === id);
}

/* -------------------------------------------------------------------------- *
 * Reading a parameter back out of a resolved config
 * -------------------------------------------------------------------------- */

/**
 * The value a resolved config holds for a declared parameter id, or `undefined` if the id is
 * not one of the declared ones.
 *
 * This is what makes invariant 8 *checkable* rather than aspirational. An optimizer uses it to
 * read back what it sampled; `parameters.test.ts` uses it to prove that a probe value written
 * into a profile reaches the field the engine reads — in both directions, so neither a hidden
 * knob nor a spurious declaration can survive.
 *
 * The four section prefixes are exactly the tunable surface of {@link ResolvedDispatchConfig},
 * plus `weights.*` and `normalization.*`.
 */
export function dispatchParameterValue(
  config: ResolvedDispatchConfig,
  id: string,
): number | string | boolean | undefined {
  const separator = id.indexOf('.');
  if (separator < 0) return undefined;
  const section = id.slice(0, separator);
  const key = id.slice(separator + 1);

  switch (section) {
    case 'weights':
      return config.weights.get(key) ?? config.pendingWeights.get(key);
    case 'normalization':
      return readField(config.normalization, key);
    case 'constraints':
      return readField(config.constraints, key);
    case 'dispatch':
      return readField(config.dispatch, key);
    case 'eligibility':
      return readField(config.eligibility, key);
    case 'answer':
      return readField(config.answer, key);
    case 'idle':
      return readField(config.idle, key);
    default:
      return undefined;
  }
}

function readField(section: object, key: string): number | string | boolean | undefined {
  if (!Object.hasOwn(section, key)) return undefined;
  const value = (section as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
    ? value
    : undefined;
}

/**
 * Every `<section>.<key>` path the resolved config exposes as a tunable, in a stable order.
 *
 * The counterpart of {@link dispatchParameterValue}: it enumerates what the engine reads so a
 * test can assert that {@link DISPATCH_PARAMETERS} covers all of it. `weights.*` is included
 * only for implemented terms, because a weight on a term no phase implements changes no
 * decision and must not be offered to an optimizer.
 */
export function tunablePathsOf(config: ResolvedDispatchConfig): readonly string[] {
  const paths: string[] = [];
  for (const term of COST_TERMS) paths.push(`weights.${term.id}`);
  for (const key of Object.keys(config.normalization)) paths.push(`normalization.${key}`);
  for (const key of Object.keys(config.constraints)) paths.push(`constraints.${key}`);
  for (const key of Object.keys(config.dispatch)) paths.push(`dispatch.${key}`);
  for (const key of Object.keys(config.eligibility)) paths.push(`eligibility.${key}`);
  for (const key of Object.keys(config.answer)) paths.push(`answer.${key}`);
  for (const key of Object.keys(config.idle)) paths.push(`idle.${key}`);
  return Object.freeze(paths);
}
