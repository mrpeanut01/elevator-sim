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

import { resolveCase, type GenerateOptions } from './generate.js';
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
export function generateOptionsFrom(
  config: LoadedConfig,
  space?: GenerateOptions['space'],
): GenerateOptions {
  return {
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfileIds: config.dispatcherProfiles.profiles.map((profile) => profile.id),
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
 * cannot ask for a destination is an up/down button (`packages/core/DECISIONS-T16.md` § T16-D1).
 * `generate.ts` picks a call type from the two conventional values without consulting the profile,
 * so overriding it onto Phase 6b's shipped `destination-panel` used to construct a configuration
 * the schema declares inadmissible and every fuzz case naming that profile threw — measured, 1
 * corpus counterexample and the whole trace-invariance suite.
 *
 * The fix is here rather than in the generator or in `data/` because this is the function that
 * *moves* the gate: a helper that overrides a conditional dimension and leaves its dependents
 * behind produces a profile nobody could author. Dropping the dependent is the same rule
 * `activeWhen` states, applied in the same direction.
 *
 * **Cross-boundary note.** This file is outside T18's ownership (`packages/experiments/src/fuzz/**`).
 * The edit is made rather than handed back for the reason `DECISIONS-T16.md` § T16-D10 gives for
 * the same shape: leaving it red blocks integration for concurrent branches over a change that is
 * mechanical and whose alternative — not shipping the profile — is the task. See
 * `packages/viz/DECISIONS-T18.md` § T18-D7.
 */
export function withCallType(profile: DispatcherProfile, callType: CallType): DispatcherProfile {
  const carriesDestination = callType === 'destination-entry' || callType === 'mobile-credential';
  const dispatch = { ...profile.dispatch, callType };
  if (!carriesDestination) delete dispatch.passengerAssignment;
  return { ...profile, dispatch };
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
