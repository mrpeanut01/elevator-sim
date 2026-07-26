/**
 * The self-describing schema for the tunables this module adds — CLAUDE.md invariant 8.
 *
 * `DISPATCH_PARAMETERS` declares the seven-stage lifecycle's knobs and `PREDICTOR_PARAMETERS` the
 * arrival model's. This file declares the **two** that exist only once aggregation does, in the
 * same shape and with the same discipline `parameters.ts` states for the originals:
 *
 * 1. **Nothing hidden.** Every value {@link ResolvedAuctionStage} carries is declared here. A knob
 *    the code reads but does not declare is invisible to an optimizer, which will then report a
 *    winner that is only optimal at whatever the hidden value happened to be.
 * 2. **Nothing spurious.** Every row resolves to a value something in this directory actually
 *    reads. `policies.test.ts` asserts the correspondence in both directions.
 *
 * ## What is deliberately *not* here
 *
 * | Parameter | Declared by | Why not here |
 * |---|---|---|
 * | `idle.predictorHorizonS`, `predictorLearningRate`, `predictorBucketWidthS`, `predictorCycleS`, `predictorPriorRatePerS`, `predictorPriorStrength` | `PREDICTOR_PARAMETERS` | they are the **arrival model's** tunables. This module only *queries* a forecast through {@link DemandForecastSource}, and `expectedDemandByFloor` already answers over the model's own configured horizon — declaring the horizon here as well would be two sources of truth for how far ahead a bank looks, and an optimizer would find two knobs moving one number |
 * | `answer.bypassLoadThreshold` | `LOAD_SENSOR_PARAMETERS` | the load cell owns it. The capacity trigger reads its **effect** (`isBypassingHallCalls`) and the bid-withdrawal rule reads the threshold *off the snapshot*, so there is one declaration of the number |
 * | number of operational zones | — | it is `cars.filter(in-service).length`, which is **state, not a tunable**. An optimizer must not be handed a knob that takes a car out of service |
 * | `dispatch.reassignmentPolicy`, `commitmentPoint`, `reassignmentHysteresisS`, `maxReassignmentsPerCall` | `DISPATCH_PARAMETERS` | capacity-driven migration is stage 5 *driven by the load sensor*, not a second stage 5. It adds a trigger, not a knob |
 * | `idle.repositionThresholdS`, `repositionEnergyWeight` | `DISPATCH_PARAMETERS` | same: pre-positioning supplies stage 7 with a forecast and a zone, and stage 7's arithmetic is unchanged |
 *
 * Those last two rows are the test of whether this module stayed a *policy*. Three of the four
 * behaviours here add **no parameter at all** — they make declared parameters that were inert
 * actually bite. A behaviour that needed a new knob to work was not wired up; it was reimplemented.
 *
 * ## The gate the two auction knobs carry, and the half of the condition that still cannot be gated
 *
 * Both `auction.rounds` and `auction.reserveMarginalDelayS` are inert under
 * `auction.aggregation: central-argmin`, which holds no auction at all, and both declare exactly
 * that: `activeWhen: { 'auction.aggregation': ['contract-net'] }`.
 *
 * That gate is **evaluable by the one rule the rest of the schema uses**, which is the property
 * that matters. `DispatchParameterSpec.activeWhen` maps a parameter id to *the values that make
 * this knob live*, and `dispatch/parameters.test.ts` states the contract every row obeys: the gate
 * must exist, `gate.type` must be `'categorical'`, and each listed value must appear in
 * `gate.values`. Every other gate in the schema names a categorical —
 * `dispatch.assignmentTiming`, `dispatch.reassignmentPolicy`, `idle.parkingStrategy` — and
 * `auction.aggregation` is one too.
 *
 * The reserve has a *second* condition that still cannot be expressed: it is also inert while
 * `auction.rounds` is 1, because a single-round auction has no round to reallocate a declined
 * contract into. `auction.rounds` is an **integer with a range and no `values`**, so a gate on it
 * — `{ 'auction.rounds': ['2', … , '8'] }` — satisfies the shape and none of the semantics: an
 * optimizer implementing the contract evaluates `gate.values.includes('2')` against `undefined`
 * and either throws or treats the reserve as permanently inactive, and one comparing its own
 * sampled `3` against the string `'3'` never activates it. A gate whose evaluation rule differs
 * from every other gate in the schema is exactly the elevator-specific knowledge CLAUDE.md
 * invariant 8 exists to remove.
 *
 * So that half is stated where an optimizer can only ignore it rather than misread it — in the
 * `description` — and asserted **behaviourally**: `policies.test.ts` runs the same reserve at
 * `rounds: 1` and at `rounds: 2` and requires no withdrawal in the first case and one in the
 * second. The follow-up it still owes, in a file this module does not own: give
 * `DispatchParameterSpec.activeWhen` a numeric-threshold form — `{ id, atLeast }` alongside the
 * value list — and update both suites, so there is **one** evaluation rule and the second half of
 * the gate can be declared too.
 */

import { AGGREGATIONS } from '../../config/types.js';
import type { DispatchParameterSpec } from '../types.js';

/* -------------------------------------------------------------------------- *
 * Defaults
 * -------------------------------------------------------------------------- */

/** The most rounds an auction may hold. Eight, because a bank of eight cars is a large bank. */
export const MAX_AUCTION_ROUNDS = 8;

/**
 * Every default this module applies, in one frozen object.
 *
 * The single source of truth: {@link POLICY_PARAMETERS} quotes these rather than repeating the
 * numbers, and the resolvers apply them, so the declared schema and the resolvers cannot
 * disagree.
 *
 * They describe **the simplest aggregation that works**, exactly as `DISPATCH_DEFAULTS` does:
 * one round, an unreachable reserve. An auction built with no options is therefore the
 * centralized argmin, and every decentralized behaviour is something a profile opts into and
 * that a benchmark can measure against that baseline.
 */
export const POLICY_DEFAULTS = Object.freeze({
  /**
   * The centralized argmin. A profile opts into a contract net; nothing gets one by accident.
   *
   * This is also the value that keeps `createPolicyFor` on the weighted-cost policy for every
   * profile that never mentions an aggregation, so adding the selector changed no shipped run.
   */
  aggregation: 'central-argmin',
  /** Sealed-bid, single round. Provably the centralized argmin — see `auction.test.ts`. */
  rounds: 1,
  /**
   * Seconds of delay to its own committed passengers a bidder will accept.
   *
   * 600 s is unreachable on every building in `data/buildings/`, so the reserve is **inert by
   * default** — the same construction `eligibility.maxLoadFactorForAssignment: 1` uses. A run
   * that did not configure a reserve cannot silently get one, and the value of the mechanism is
   * measurable against its absence.
   */
  reserveMarginalDelayS: 600,
} as const);

/* -------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------- */

/**
 * The schema for every tunable this module adds.
 *
 * `id` is the dotted path of the value in `data/dispatcher-profiles.json`, so a tuned winner is
 * written back as a profile without translation — once `config/schema.ts` gains the `auction`
 * section {@link AuctionStageConfig} records. Two rows, both of them the aggregation: everything
 * else this module does is a declared parameter that was inert starting to bite.
 */
export const POLICY_PARAMETERS: readonly DispatchParameterSpec[] = Object.freeze([
  {
    id: 'auction.aggregation',
    type: 'categorical',
    values: AGGREGATIONS,
    default: POLICY_DEFAULTS.aggregation,
    description:
      'Who aggregates the prices the one cost engine produces. central-argmin is the group controller minimising over every eligible car, which is what every profile without this section gets. contract-net has each car bid from its own estimateCost() and lets a provisional winner take its bid back. Both compute an identical price for an identical car; only the allocation rule differs, which is exactly the comparison docs/01-architecture.md asks to be benchmarked rather than assumed. This is the key dispatch/policies/registry.ts looks the policy factory up by, so which dispatcher runs is data.',
  },
  {
    id: 'auction.rounds',
    type: 'integer',
    range: [1, MAX_AUCTION_ROUNDS],
    scale: 'linear',
    default: POLICY_DEFAULTS.rounds,
    activeWhen: { 'auction.aggregation': ['contract-net'] },
    description:
      'Maximum bidding rounds; one more than the number of bid withdrawals the auction may take. 1 is a sealed-bid single-round auction, which allocates the contract to the lowest bid and is therefore exactly the centralized argmin — the control arm. Above 1 a provisional winner may take its bid back, either on its reserve price or because winning would push it over its own hall-call bypass threshold while another bidder stays under, and the auction re-runs among the remaining bidders. This is the one knob that changes who aggregates.',
  },
  {
    id: 'auction.reserveMarginalDelayS',
    type: 'continuous',
    range: [0, 600],
    scale: 'linear',
    default: POLICY_DEFAULTS.reserveMarginalDelayS,
    unit: 's',
    activeWhen: { 'auction.aggregation': ['contract-net'] },
    description:
      'A bidder’s own ceiling on the delay it will impose on the passengers it is already committed to. Above it the car declines the contract, whatever the group’s objective says. Distinct from the existingCallDelay cost term and from eligibility.maxLoadFactorForAssignment in exactly one way, and it is the way the agent-autonomy hypothesis turns on: those are the group deciding, this is a car refusing. Inert at the 600 s default, which no building in data/buildings/ can reach, and inert at any value while auction.rounds is 1: a single-round auction has no second round to reallocate a declined contract into, so no withdrawal is taken. An optimizer sampling this dimension at rounds = 1 is sampling a dimension that cannot move the objective.',
  },
] as const);

/** Every declared id, for a quick membership test. */
export const POLICY_PARAMETER_IDS: ReadonlySet<string> = new Set(
  POLICY_PARAMETERS.map((parameter) => parameter.id),
);

/** A declared parameter by id. */
export function policyParameter(id: string): DispatchParameterSpec | undefined {
  return POLICY_PARAMETERS.find((parameter) => parameter.id === id);
}
