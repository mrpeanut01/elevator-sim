/**
 * The vocabulary of the fuzz campaign: what a generated case is, what a property is, and
 * what it means for one to fail.
 *
 * ## Why this module exists
 *
 * `docs/07-handoff.md` § 7 names property-based fuzzing the highest-value Phase 8 track, for
 * a reason worth restating on the type that carries the verdict:
 *
 * > Hand-written tests check cases someone thought of; randomized buildings find the ones
 * > nobody did. "Passenger silently lost" and "delivered to the wrong floor" are exactly the
 * > bugs that hide behind a plausible average waiting time.
 *
 * Every property here is therefore a predicate over a **finished run**, re-derived from the
 * trace and the record rather than read off `SimulationResult.conservation` — an audit that
 * checks itself passes whatever it is wrong about.
 *
 * ## Determinism (CLAUDE.md invariants 2 and 5)
 *
 * A {@link FuzzCase} is produced by {@link caseFromSeed} from one `fuzzSeed` and nothing else,
 * so every counterexample is one integer. Generation draws only from named streams on an
 * injected `StreamSet`; there is no `Math.random()` anywhere in this directory and no wall
 * clock (invariant 3). A **shrunk** case is no longer seed-derivable — it is a hand-reduced
 * neighbour of one — so {@link FuzzCase} is entirely JSON-serializable and a counterexample
 * prints in full. A finding nobody can replay is a rumour.
 */

import type { BuildingConfig, CallType, DemandTemplateId } from '@elevator-sim/core';

/* -------------------------------------------------------------------------- *
 * Properties
 * -------------------------------------------------------------------------- */

/**
 * The six invariants `docs/07-handoff.md` § 7 requires of any building, authored or not.
 *
 * Ordered as the handoff lists them. Each is checked by one function in `properties.ts`, and
 * each has a fault in `faults.ts` that makes it fail — a property that has never failed is a
 * property that cannot fail.
 */
export const FUZZ_PROPERTIES = [
  /** Every generated journey is delivered or named as undelivered. Nobody vanishes. */
  'conservation',
  /** Every leg ends at the floor the trace assigned it, and the journey at its own final floor. */
  'destination',
  /** No car carries a load the boarding rule could not have produced. 80 % of rated, not 100 %. */
  'capacity',
  /** No wait, ride or journey time is negative, and nothing precedes its own arrival. */
  'monotonic-time',
  /** The run terminates, and never sits idle while somebody it could serve is waiting. */
  'termination',
  /** Nobody waits past the stated bound unless the run is flagged saturated. */
  'starvation',
] as const;

export type FuzzProperty = (typeof FUZZ_PROPERTIES)[number];

/** One concrete failure: which property, what was wrong, and about whom. */
export interface Violation {
  readonly property: FuzzProperty;
  /** Human-readable, and specific enough to act on without re-running. */
  readonly message: string;
  /** Journey, leg, car or floor id the failure is about, when there is one. */
  readonly subject?: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * The generated case
 * -------------------------------------------------------------------------- */

/** Bank layouts the generator knows how to build. Each guarantees a routable building. */
export const FUZZ_TOPOLOGIES = [
  /** One bank, every floor. The degenerate case, and the one a single car lives in. */
  'single-bank',
  /** Two banks, both serving every floor. Allocation matters; routing does not. */
  'parallel-banks',
  /** Low and high banks meeting at one `isTransferFloor`. Two-leg journeys. */
  'sky-lobby',
  /** Shuttle plus two locals: up to three legs, and a floor served by three banks. */
  'shuttle',
] as const;

export type FuzzTopology = (typeof FUZZ_TOPOLOGIES)[number];

/**
 * One replication's worth of randomized configuration, fully serializable.
 *
 * `building` is the output of `parseBuilding`, so it is by construction a config the real
 * schema accepts — a fuzzer that emits invalid configs tests the validator, not the
 * simulator.
 */
export interface FuzzCase {
  /** `fuzz-<seed>`, or `<parent>-s<n>` for a shrunk neighbour. */
  readonly caseId: string;
  /** The generator seed, decimal. `caseFromSeed(fuzzSeed)` reproduces an unshrunk case exactly. */
  readonly fuzzSeed: string;
  /** Master seed handed to `runSimulation`. Derived from `fuzzSeed`, and on the run record. */
  readonly simSeed: number;
  readonly topology: FuzzTopology;
  readonly building: BuildingConfig;
  /** A shipped profile id. Which dispatcher runs is data, never a branch (invariant 7). */
  readonly dispatcherProfileId: string;
  /** Overrides the profile's `dispatch.callType`. Decides whether a call carries a credential. */
  readonly callType: CallType;
  /** Percent of population per 5 minutes, overriding the profile. */
  readonly arrivalRatePctPop5min: number;
  /**
   * Which demand shape the run is driven by.
   *
   * Generated rather than fixed, because the two shapes stress different things: `rise-and-fall`
   * ramps to a held peak and back, which is the shape every shipped result is measured under,
   * and `constant-iso` holds one rate for the whole run, which is what a short horizon needs —
   * a rise-and-fall run must be longer than its own 300 s peak hold or the template refuses to
   * resolve. The generator honours that floor; so does the shrinker.
   */
  readonly demandTemplate: DemandTemplateId;
  readonly durationS: number;
  readonly doorObstructionProbability: number;
  readonly drainGraceS: number;
  /** Short labels for what makes this case interesting. Reported, never branched on. */
  readonly tags: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Outcomes
 * -------------------------------------------------------------------------- */

/**
 * Why a case produced no verdict.
 *
 * `unroutable` is a **generator** defect, not a simulator one: the trace planner throws when
 * no chain of banks connects an origin to a destination, which is correct behaviour for a
 * building nobody could ride. It is reported separately so a shrink step that disconnects a
 * building is discarded rather than counted as a counterexample.
 */
export const FUZZ_SKIP_REASONS = ['unroutable', 'invalid-config'] as const;

export type FuzzSkipReason = (typeof FUZZ_SKIP_REASONS)[number];

/** What running one case produced. Exactly one of `violations` / `skipped` / `threw` is set. */
export interface FuzzOutcome {
  readonly case: FuzzCase;
  readonly violations: readonly Violation[];
  /** Present when the case could not be evaluated; see {@link FUZZ_SKIP_REASONS}. */
  readonly skipped?: FuzzSkipReason | undefined;
  /** An exception the run threw that is not itself a property verdict. */
  readonly threw?: string | undefined;
  /* ---- measurements, reported by the campaign ---- */
  readonly generatedPassengers: number;
  /** Simulated seconds this case ran, `record.endedAt - record.startedAt`. */
  readonly simulatedSeconds: number;
  readonly status: string;
}

/** What a whole campaign measured. Printed by the always-on suite so the cost is never silent. */
export interface CampaignStats {
  readonly cases: number;
  readonly evaluated: number;
  readonly skipped: number;
  readonly failures: number;
  readonly generatedPassengers: number;
  readonly simulatedSeconds: number;
  readonly topologies: Readonly<Record<string, number>>;
  readonly statuses: Readonly<Record<string, number>>;
}

/* -------------------------------------------------------------------------- *
 * Bounds
 * -------------------------------------------------------------------------- */

/**
 * The two numbers the properties need that the model does not state for itself.
 *
 * Both are **stated**, not tuned: they are the thresholds at which "the system stopped doing
 * anything" and "this passenger has been abandoned" become claims worth making, and moving
 * either to make a case pass is the failure mode this whole track exists to prevent.
 */
export interface PropertyBounds {
  /**
   * Simulated seconds with **no boarding and no alighting anywhere in the building**, while at
   * least one passenger the fleet could serve is still waiting, before the run is called
   * deadlocked.
   *
   * 600 s. A saturated system is not idle — its cars board and alight continuously and only
   * the queue grows — so this discriminates deadlock from saturation rather than restating it.
   * The longest single round trip any generated building can produce is well under 300 s.
   */
  readonly deadlockIdleBoundS: number;
  /**
   * Seconds a servable passenger may wait before the run must be flagged saturated.
   *
   * 900 s = 15 minutes. `docs/03-traffic-and-statistics.md` treats anything past 60 s as a bad
   * wait and the shipped buildings run at 10–30 s AWT, so a quarter hour is two orders of
   * magnitude out and is only reachable if the passenger was forgotten. A run that produces
   * one and *is* flagged saturated is reporting honestly; one that is not is starving people
   * while publishing a mean.
   */
  readonly starvationBoundS: number;
}

export const PROPERTY_BOUNDS: PropertyBounds = Object.freeze({
  deadlockIdleBoundS: 600,
  starvationBoundS: 900,
});
