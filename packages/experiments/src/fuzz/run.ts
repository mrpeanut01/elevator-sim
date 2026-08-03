/**
 * Turning one {@link FuzzCase} into one verdict.
 *
 * The whole of the seam between the generator and the properties, and it is deliberately thin:
 * it builds a `SimulationConfig` from the case, runs it through the **shipped**
 * `runSimulation`, and hands the finished result to `checkAll`. Nothing here inspects a
 * building id, selects behaviour by profile name, or patches a weight — a fuzz run must be the
 * same run a user gets, or it proves nothing about the one they get.
 *
 * ## Failure taxonomy
 *
 * Three outcomes, and keeping them apart is what stops the campaign drowning its own findings:
 *
 * - **violations** — the run finished (or failed loudly) and a property does not hold. A
 *   finding.
 * - **skipped** — the case could not be evaluated. `unroutable` means the trace planner refused
 *   a trip because no chain of banks connects two floors, which is *correct* behaviour for a
 *   building nobody could ride and a defect in the **generator**, not the simulator. It is
 *   counted and reported rather than swallowed, and `generate.test.ts` asserts the corpus
 *   produces none.
 * - **threw** — an exception that is not a property verdict: a `ModelError` from a car, a
 *   `MetricsError` from the recorder, a bare `TypeError`. Always a finding, and never
 *   relabelled as a timeout.
 */

import {
  ConfigError,
  SimulationError,
  runSimulation,
  type AuctionPolicyOptions,
  type CallType,
  type DispatchPolicy,
  type DispatcherProfile,
  type LoadedConfig,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';

import {
  carriesCallType,
  legalCallTypesFor,
  resolveCase,
  type GenerateOptions,
} from './generate.js';
import { checkAll, type PropertyContext } from './properties.js';
import { PROPERTY_BOUNDS, type FuzzCase, type FuzzOutcome, type PropertyBounds, type Violation } from './types.js';

/** Everything a case needs from the loaded reference data, plus the optional fault hook. */
export interface RunOptions {
  readonly config: LoadedConfig;
  readonly bounds?: PropertyBounds | undefined;
  /**
   * The `SimulationConfig.createPolicy` hook, forwarded unchanged.
   *
   * Present for exactly one purpose: injecting a *fault* into a real run, so a property can be
   * shown to fail. It is never used by the campaign itself. `sim/types.ts` documents the hook as
   * instrumentation and states the contract a policy handed in here must keep; a fault
   * deliberately breaks the dispatch behaviour and nothing else.
   */
  readonly createPolicy?:
    | ((profile: DispatcherProfile, options: AuctionPolicyOptions) => DispatchPolicy)
    | undefined;
}

/** `GenerateOptions` derived from a loaded config, so ids stay data (CLAUDE.md invariant 7). */
/**
 * The dispatcher profiles the **recorded** corpus is indexed against.
 *
 * A fuzz case is a seed decoded against an option space, and the dispatcher axis of that space is
 * the shipped profile list. So adding a profile to `data/dispatcher-profiles.json` re-maps every
 * seed: `caseFromSeed(1_001_074, …)` stops naming the eleven-floor single-car building whose
 * 922.7 s wait closed `fuzz-1001074` and names something else instead, with the same seed and a
 * different meaning. Nothing fails loudly — the reproduction simply reproduces a different run.
 *
 * That is a **regression record losing its subject**, so the record declares its own axis. Frozen
 * at the twelve profiles shipped when the deep-tier findings were recorded (`DECISIONS.md` § D205
 * added the thirteenth); a case recorded against a later library declares its own list beside it.
 *
 * The *campaign* deliberately does not use this — new profiles should be fuzzed, and a seed that
 * re-maps in a search is a seed doing its job. Only the pinned reproductions need stable identity.
 */
export const CORPUS_DISPATCHER_PROFILE_IDS: readonly string[] = Object.freeze([
  'nearest-car',
  'eta',
  'collective',
  'energy-aware',
  'fairness-first',
  'capacity-aware',
  'predictive-balanced',
  'auction',
  'auction-multi-round',
  'zoned-uppeak',
  'destination-eta',
  'destination-panel',
]);

export function generateOptionsFrom(
  config: LoadedConfig,
  space?: GenerateOptions['space'],
  /**
   * The dispatcher axis, by id and in this order. Defaults to every shipped profile — the right
   * behaviour for a search. Pass {@link CORPUS_DISPATCHER_PROFILE_IDS} to reproduce a recorded
   * case, whose seed only means what it meant against the library it was found under.
   */
  profileIds?: readonly string[],
): GenerateOptions {
  const byId = new Map(config.dispatcherProfiles.profiles.map((profile) => [profile.id, profile]));
  const profiles =
    profileIds === undefined
      ? config.dispatcherProfiles.profiles
      : profileIds.map((id) => {
          const profile = byId.get(id);
          if (profile === undefined) {
            throw new Error(
              `Fuzz option space asks for dispatcher profile "${id}", which data/dispatcher-profiles.json does not declare. A corpus indexed against a profile that no longer ships cannot reproduce the case it recorded.`,
            );
          }
          return profile;
        });
  return {
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: profiles,
    trafficProfileIds: config.trafficProfiles.profiles.map((profile) => profile.id),
    ...(space === undefined ? {} : { space }),
  };
}

/**
 * A profile with `dispatch.callType` replaced, and anything gated on the old one removed with it.
 *
 * Config, not code. Which information a call carries is the single lever that decides whether
 * an access-restricted landing is servable at all, and it has to be reachable from a generated
 * case without touching the dispatcher.
 *
 * ## Why `passengerAssignment` comes off with the gate
 *
 * `dispatch.passengerAssignment: 'panel'` declares
 * `activeWhen: { 'dispatch.callType': ['destination-entry', 'mobile-credential'] }`, and
 * `resolveDispatchConfig` **refuses** the pair `panel` + `up-down-buttons` outright: a panel that
 * cannot ask for a destination is an up/down button (`the root DECISIONS.md` § T16-D1). A helper
 * that overrides a conditional dimension and leaves its dependents behind produces a profile
 * nobody could author, so dropping the dependent is the same rule `activeWhen` states, applied in
 * the same direction.
 *
 * ## What that drop is no longer doing, and why it stays (C32)
 *
 * It used to be load-bearing for the **generator**: `generate.ts` picked a call type from two
 * conventional values without consulting the profile, so a case naming `destination-panel` beside
 * `up-down-buttons` reached here as a configuration the schema declares inadmissible, and this line
 * quietly rewrote it into a different dispatcher. Measured over the shipped seeds: **1 of the 64
 * pinned corpus cases (`fuzz-118`) and 61 of 2 000 deep cases**, plus 61 more deep cases of
 * `destination-eta` × `up-down-buttons` that were not refused and ran with `weights.rideTime`
 * inert. The generator now draws the call type from {@link legalCallTypesFor}, so **no generated
 * case can reach the drop** — {@link assertCarriesCallType}, called below on every case, is what
 * turns that from a claim into a check.
 *
 * The line is kept rather than deleted, for two reasons and neither is caution:
 *
 * 1. It has a caller that is not the generator. `validation/adversarial.test.ts` builds the
 *    **conventional control arm** of a destination-dispatch comparison with exactly
 *    `withCallType(panel, 'up-down-buttons')`, and asserts the drop by name — deliberately, because
 *    the control has to be the same profile with the destination taken away.
 * 2. `withCallType` is on the package barrel as the documented way to move this gate. A public
 *    helper that produces an inadmissible profile for one of its three legal arguments would be a
 *    trap, and the fix for that is not to remove the argument from the *generator* only.
 *
 * So: the generator no longer relies on it, and this file no longer lets it be relied on silently.
 */
export function withCallType(profile: DispatcherProfile, callType: CallType): DispatcherProfile {
  const carriesDestination = callType === 'destination-entry' || callType === 'mobile-credential';
  const dispatch = { ...profile.dispatch, callType };
  if (!carriesDestination) delete dispatch.passengerAssignment;
  return { ...profile, dispatch };
}

/**
 * The generator's side of the bargain, checked rather than trusted.
 *
 * A case whose `(profile, callType)` pair the profile cannot carry is a **generator** defect — the
 * same class as an unroutable building, and handled the same way: thrown rather than filtered, so
 * it cannot be mistaken for a simulator finding or absorbed into a rewrite nobody sees. It is not a
 * `ConfigError`, so `evaluateCase` does not turn it into a skip.
 *
 * @throws Error if the pair is one {@link legalCallTypesFor} would not have produced.
 */
export function assertCarriesCallType(profile: DispatcherProfile, callType: CallType): void {
  if (carriesCallType(profile, callType)) return;
  throw new Error(
    `fuzz case names dispatcher "${profile.id}" under dispatch.callType "${callType}", which that ` +
      `profile cannot carry: the pair is either refused by resolveDispatchConfig or leaves a tunable ` +
      `the profile authored inert. legalCallTypesFor("${profile.id}") = ` +
      `${legalCallTypesFor(profile).join(', ')}. This is a bug in generate.ts, not a simulator finding.`,
  );
}

/**
 * The `SimulationConfig` a case runs as. Exported so a counterexample can be re-run by hand.
 *
 * Named `fuzzSimulationConfigFor` rather than `simulationConfigFor` because `runner/` exports a
 * function of that name with different semantics — it builds a *cell's* config from an experiment
 * spec — and the package barrel re-exports both. Renamed at the source rather than omitted, so
 * neither can silently shadow the other in a file that imports both.
 */
export function fuzzSimulationConfigFor(fuzzCase: FuzzCase, options: RunOptions): SimulationConfig {
  const { config } = options;
  const base = config.dispatcherProfilesById.get(fuzzCase.dispatcherProfileId);
  if (base === undefined) {
    throw new Error(`fuzz case "${fuzzCase.caseId}" names unknown dispatcher "${fuzzCase.dispatcherProfileId}"`);
  }
  assertCarriesCallType(base, fuzzCase.callType);
  return {
    building: resolveCase(fuzzCase, generateOptionsFrom(config)),
    dispatcherProfile: withCallType(base, fuzzCase.callType),
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: fuzzCase.simSeed,
    demandTemplate: fuzzCase.demandTemplate,
    durationS: fuzzCase.durationS,
    demand: { arrivalRatePctPop5min: fuzzCase.arrivalRatePctPop5min },
    // The whole run, not the template's peak window: a starvation bound and a saturation
    // verdict computed over five minutes of a ten-minute run would exempt half the passengers
    // from the properties that are about them.
    reportWindow: 'full-run',
    drainGraceS: fuzzCase.drainGraceS,
    doorObstructionProbability: fuzzCase.doorObstructionProbability,
    // Saturation is a legitimate measurement and the campaign generates it on purpose; it is
    // never a licence to lose anybody, which is what the properties are for.
    onTimeout: 'report',
    runId: fuzzCase.caseId,
    ...(options.createPolicy === undefined ? {} : { createPolicy: options.createPolicy }),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** A trace the planner refused to generate, as opposed to anything the simulator did. */
function isRoutingRefusal(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'TrafficError' &&
    (error.message.includes('No chain of banks connects') ||
      error.message.includes('elevator legs') ||
      error.message.includes('to itself'))
  );
}

function outcomeOf(
  fuzzCase: FuzzCase,
  result: SimulationResult | undefined,
  violations: readonly Violation[],
  extra: { readonly skipped?: FuzzOutcome['skipped']; readonly threw?: string | undefined } = {},
): FuzzOutcome {
  return {
    case: fuzzCase,
    violations: Object.freeze([...violations]),
    ...(extra.skipped === undefined ? {} : { skipped: extra.skipped }),
    ...(extra.threw === undefined ? {} : { threw: extra.threw }),
    generatedPassengers: result?.trace.passengerCount ?? 0,
    simulatedSeconds: result === undefined ? 0 : result.record.endedAt - result.record.startedAt,
    status: result?.status ?? (extra.skipped ?? 'threw'),
  };
}

/**
 * Run one case and check all six properties against it.
 *
 * Never throws for a case-level problem: every failure mode becomes a field on the outcome, so
 * a campaign of a thousand cases reports a thousand verdicts rather than stopping at the first
 * interesting one.
 */
export function evaluateCase(fuzzCase: FuzzCase, options: RunOptions): FuzzOutcome {
  const bounds = options.bounds ?? PROPERTY_BOUNDS;
  const { config } = options;

  let simConfig: SimulationConfig;
  try {
    simConfig = fuzzSimulationConfigFor(fuzzCase, options);
  } catch (error) {
    if (error instanceof ConfigError) return outcomeOf(fuzzCase, undefined, [], { skipped: 'invalid-config' });
    throw error;
  }

  const contextFor = (result: SimulationResult): PropertyContext => ({
    case: fuzzCase,
    building: simConfig.building,
    dispatcherProfile: simConfig.dispatcherProfile,
    elevatorSpecs: config.elevatorSpecs,
    result,
    bounds,
  });

  try {
    const result = runSimulation(simConfig);
    return outcomeOf(fuzzCase, result, checkAll(contextFor(result)));
  } catch (error) {
    if (isRoutingRefusal(error)) return outcomeOf(fuzzCase, undefined, [], { skipped: 'unroutable' });

    if (error instanceof SimulationError) {
      // `SimulationError` is thrown for a failed conservation audit and for an exhausted event
      // budget. Both are findings, and the partial result is attached precisely so the rest of
      // the properties can still be checked on the wreckage.
      const partial = error.result;
      const own: Violation[] = [
        {
          property: partial?.status === 'aborted' ? 'termination' : 'conservation',
          message: `run refused to report: ${messageOf(error)}`,
          subject: fuzzCase.caseId,
        },
      ];
      const rest = partial === undefined ? [] : checkAll(contextFor(partial));
      return outcomeOf(fuzzCase, partial, [...own, ...rest]);
    }

    return outcomeOf(fuzzCase, undefined, [], { threw: messageOf(error) });
  }
}

/** Whether an outcome is a finding: a violated property, or an exception that is not a skip. */
export function isFailure(outcome: FuzzOutcome): boolean {
  return outcome.violations.length > 0 || outcome.threw !== undefined;
}
