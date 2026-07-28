/**
 * **Phase 6a's liveness evidence — counted through the shipped engine, not read off a diff.**
 *
 * docs/09 § 8 R6-1 names the most likely way this phase ships a ninth dead seam: *a destination
 * profile lands in `data/` and changes nothing.* It is the most likely because it is nearly true —
 * measured, the shipped destination profile is **bit-identical** to `eta` on Garden Apartments, on
 * Midtown down-peak and on Midtown up-peak, because at those operating points the destination
 * carries no information the direction button did not already carry. A trajectory difference is
 * therefore the wrong evidence: at three of five shipped points there isn't one, and at the fourth
 * there is one for reasons that have nothing to do with the destination.
 *
 * So the evidence this module produces is the one docs/09 asks for and the one
 * `core/src/sim/seam.test.ts` established the technique for: **an evaluation count with spread.**
 * For each gated behaviour, through a real `runSimulation` on a real building, at the real operating
 * point:
 *
 * - how many times it was **evaluated**;
 * - how many of those evaluations produced a **non-zero** value;
 * - and in how many **decisions** it produced a *different* value for different candidate cars.
 *
 * The third is the one that matters and the reason the other two are not enough. A term that returns
 * the same number for every car is a constant added to every candidate's cost, and **a constant
 * cannot change an `argmin`**. "It looks wired" and "it evaluated" are both compatible with a
 * dispatcher that behaves exactly as it did before.
 *
 * ## Two gated behaviours, and they take two different kinds of evidence
 *
 * | behaviour | gate | evidence |
 * |---|---|---|
 * | destination **pricing** | `rideTimeTerm.activeWhen: dispatch.callType ∈ {destination-entry, mobile-credential}`, **and** a `weights.rideTime` | `rideTime` raw values, counted per evaluation, with cross-car spread per decision |
 * | credentialled **authorization** | `costRequestFor` forwards the credential only under `mobile-credential`, and `estimateCost` answers the eligibility filter with it | eligibility verdicts by refusal reason, counted per decision, with the decisions in which the filter *separated* the cars |
 *
 * The two are asymmetric and it would be a mistake to force one shape onto both. Pricing is live
 * when the number is **non-zero and different between cars**. Authorization is live when the
 * eligibility answer **changes across the gate** — and on an access-controlled building the
 * credentialled direction of that change is *fewer* refusals, not more. Measured on Secure Tower at
 * the interfloor operating point, the same profile refuses hundreds of cars for `accessDenied` at
 * `up-down-buttons` and **none** at `mobile-credential`, and the refusals are bank-wide rather than
 * per-car: every car of the bank says no to the same call, which is why the call is permanently
 * unassignable and the building is unservable rather than merely slow. That is the whole of
 * H-ACCESS-1 visible one level down, in the filter.
 *
 * **Both gates are counted on both sides.** A count that is non-zero on the gated-off side is not
 * evidence of a gate; docs/09 § 8 R6-2 makes the flatness of the off side a proof obligation on the
 * author rather than on the reviewer.
 */

import {
  Simulation,
  createPolicyFor,
  loadConfig,
  type DispatchContext,
  type DispatchDecision,
  type DispatchPolicy,
  type DispatcherProfile,
  type EligibilityVerdict,
  type ResolvedBuilding,
  type ScoreBreakdown,
} from '@elevator-sim/core';

import { DATA_DIR } from '../validation/harness.js';

import { MIDTOWN_INTERFLOOR_MIX, SECURE_INTERFLOOR_MIX } from './arms.js';
import { DISCLOSURE_PROFILE } from './destinationDisclosure.js';
import { BENCHMARK_SEED } from './suite.js';

/* -------------------------------------------------------------------------- *
 * The tally
 * -------------------------------------------------------------------------- */

/** One counted behaviour: evaluations, non-zero evaluations, and decisions with cross-car spread. */
export interface LivenessCount {
  /** Every time the behaviour was asked for a value. */
  readonly evaluations: number;
  /** Evaluations whose value was not zero / not the inert answer. */
  readonly nonZero: number;
  /** Decisions in which two candidate cars got **different** values. The load-bearing one. */
  readonly decisionsWithSpread: number;
  /** Decisions the behaviour was reached in at all — the denominator of {@link decisionsWithSpread}. */
  readonly decisions: number;
}

/** What one configuration's run counted. */
export interface DestinationLiveness {
  readonly label: string;
  readonly building: string;
  readonly profileId: string;
  readonly callType: string;
  readonly weightsRideTime: number;
  /** `rideTime`'s raw values, through `policy.dispatch`/`reconsider` inside the run. */
  readonly ridePricing: LivenessCount;
  /**
   * What the eligibility filter did, which is where a `callType` change shows up when no term
   * prices the destination.
   *
   * `accessRefusals` counts verdicts whose reason is one of the four the credential and the
   * destination can move — `accessDenied`, `destinationAccessDenied`, `serviceZone`,
   * `destinationServiceZone`. `decisionsWhollyRefused` is the count that makes an unservable
   * building unservable: every candidate car refused, so no assignment exists at any cost.
   */
  readonly eligibility: EligibilityCounts;
  /** Total dispatch decisions the run made. Context for the two counts. */
  readonly totalDecisions: number;
}

/** What the eligibility filter did over a run. Counts, by reason. */
export interface EligibilityCounts {
  readonly verdicts: number;
  readonly accessRefusals: number;
  readonly byReason: Readonly<Record<string, number>>;
  /** Decisions in which some cars were eligible and some were refused — the filter separated them. */
  readonly decisionsWithMixedEligibility: number;
  /** Decisions in which **every** candidate was refused. A call nobody can serve. */
  readonly decisionsWhollyRefused: number;
  readonly decisions: number;
}

function emptyCount(): { evaluations: number; nonZero: number; decisionsWithSpread: number; decisions: number } {
  return { evaluations: 0, nonZero: 0, decisionsWithSpread: 0, decisions: 0 };
}

interface Tally {
  readonly ride: ReturnType<typeof emptyCount>;
  readonly byReason: Map<string, number>;
  verdicts: number;
  accessRefusals: number;
  decisionsWithMixedEligibility: number;
  decisionsWhollyRefused: number;
  eligibilityDecisions: number;
  decisions: number;
}

/** The four refusal reasons a `callType` change can move. Everything else is unrelated to the gate. */
const ACCESS_REASONS: ReadonlySet<string> = new Set([
  'accessDenied',
  'destinationAccessDenied',
  'serviceZone',
  'destinationServiceZone',
]);

function record(into: Tally, decision: DispatchDecision): void {
  if (decision.scores.length === 0 && decision.rejected.length === 0) return;
  into.decisions += 1;

  const rideRaws: number[] = [];
  for (const score of decision.scores) {
    for (const term of score.terms as readonly ScoreBreakdown[]) {
      if (term.termId !== 'rideTime') continue;
      into.ride.evaluations += 1;
      if (term.raw !== 0) into.ride.nonZero += 1;
      rideRaws.push(term.raw);
    }
  }
  if (rideRaws.length > 0) {
    into.ride.decisions += 1;
    if (new Set(rideRaws).size > 1) into.ride.decisionsWithSpread += 1;
  }

  const verdicts = decision.rejected as readonly EligibilityVerdict[];
  into.eligibilityDecisions += 1;
  for (const verdict of verdicts) {
    into.verdicts += 1;
    const reason = verdict.reason ?? 'unspecified';
    into.byReason.set(reason, (into.byReason.get(reason) ?? 0) + 1);
    if (ACCESS_REASONS.has(reason)) into.accessRefusals += 1;
  }
  /* Two different findings, and collapsing them would hide the one that matters. A decision with
     some cars eligible and some refused is the filter *discriminating*; a decision with every car
     refused is a call that has no assignment at any cost, which is what makes a building unservable
     rather than merely slow. */
  if (verdicts.length > 0 && decision.scores.length > 0) into.decisionsWithMixedEligibility += 1;
  if (verdicts.length > 0 && decision.scores.length === 0) into.decisionsWhollyRefused += 1;
}

/**
 * A real policy that counts what its engine priced and what it refused.
 *
 * Injected through `SimulationConfig.createPolicy`, so what is counted is what the run actually did
 * — through the `costRequestFor` the profile's own `callType` produces and the context
 * `#dispatchBank` really builds — rather than through a hand-built fixture that can be handed
 * whatever it needs to look alive. That distinction is the whole reason this module exists: every
 * cost term in this repository had a passing unit test while three of them evaluated to zero for
 * every car of every run.
 */
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
 * The measurement
 * -------------------------------------------------------------------------- */

/** One configuration to count. */
export interface LivenessCase {
  readonly label: string;
  readonly building: string;
  readonly profile: DispatcherProfile;
}

/**
 * Every configuration Phase 6a needs liveness evidence for, including the negative controls.
 *
 * Built from the **shipped** profile rather than from a fixture, so what is proved live is what
 * `data/dispatcher-profiles.json` actually contains.
 */
export function livenessCases(destination: DispatcherProfile): readonly LivenessCase[] {
  const conventional: DispatcherProfile = Object.freeze({
    ...destination,
    id: 'liveness-conventional',
    name: 'The shipped destination profile at the conventional call type',
    dispatch: Object.freeze({ ...destination.dispatch, callType: 'up-down-buttons' as const }),
  });
  const priced: DispatcherProfile = Object.freeze({
    ...destination,
    id: 'liveness-priced',
    name: 'The shipped destination profile with the ride priced',
    weights: Object.freeze({ ...destination.weights, rideTime: 1 }),
  });
  const pricedConventional: DispatcherProfile = Object.freeze({
    ...priced,
    id: 'liveness-priced-conventional',
    dispatch: Object.freeze({ ...destination.dispatch, callType: 'up-down-buttons' as const }),
  });

  return Object.freeze([
    Object.freeze({
      label: 'shipped destination-eta on the access-controlled building',
      building: 'secure-tower',
      profile: destination,
    }),
    Object.freeze({
      label: 'the same profile at up-down-buttons — the gate’s off side',
      building: 'secure-tower',
      profile: conventional,
    }),
    Object.freeze({
      label: 'destination-eta + rideTime 1 at the primary point',
      building: 'midtown-office',
      profile: priced,
    }),
    Object.freeze({
      label: 'the same weights at up-down-buttons — the gate’s off side',
      building: 'midtown-office',
      profile: pricedConventional,
    }),
  ]);
}

/**
 * Count the two gated behaviours through a full `runSimulation` for every case.
 *
 * Not a study and it publishes no interval: counts and nothing else.
 */
export async function measureDestinationLiveness(
  options: { readonly seed?: number | undefined } = {},
): Promise<readonly DestinationLiveness[]> {
  const config = await loadConfig(DATA_DIR);
  const destination = config.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
  if (destination === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${DISCLOSURE_PROFILE}".`);
  }
  const seed = options.seed ?? BENCHMARK_SEED;

  const out: DestinationLiveness[] = [];
  for (const subject of livenessCases(destination)) {
    const building = config.buildingsById.get(subject.building);
    if (building === undefined) throw new Error(`No building "${subject.building}".`);
    const traffic =
      subject.building === 'secure-tower' ? SECURE_INTERFLOOR_MIX : MIDTOWN_INTERFLOOR_MIX;
    const tally: Tally = {
      ride: emptyCount(),
      byReason: new Map<string, number>(),
      verdicts: 0,
      accessRefusals: 0,
      decisionsWithMixedEligibility: 0,
      decisionsWhollyRefused: 0,
      eligibilityDecisions: 0,
      decisions: 0,
    };

    const simulation = new Simulation({
      building: building as ResolvedBuilding,
      dispatcherProfile: subject.profile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed,
      onTimeout: 'report',
      ...(traffic.durationS === undefined ? {} : { durationS: traffic.durationS }),
      ...(traffic.reportWindow === undefined ? {} : { reportWindow: traffic.reportWindow }),
      ...(traffic.demand === undefined ? {} : { demand: traffic.demand }),
      createPolicy: (profile, policyOptions) => counting(createPolicyFor(profile, policyOptions), tally),
    });
    simulation.run();

    out.push(
      Object.freeze({
        label: subject.label,
        building: subject.building,
        profileId: subject.profile.id,
        callType: String(subject.profile.dispatch?.callType ?? 'up-down-buttons'),
        weightsRideTime: subject.profile.weights.rideTime ?? 0,
        ridePricing: Object.freeze({ ...tally.ride }),
        eligibility: Object.freeze({
          verdicts: tally.verdicts,
          accessRefusals: tally.accessRefusals,
          byReason: Object.freeze(Object.fromEntries([...tally.byReason].sort())),
          decisionsWithMixedEligibility: tally.decisionsWithMixedEligibility,
          decisionsWhollyRefused: tally.decisionsWhollyRefused,
          decisions: tally.eligibilityDecisions,
        }),
        totalDecisions: tally.decisions,
      }),
    );
  }
  return Object.freeze(out);
}

/** The counts as the console table the suite prints. Feeds no decision. */
export function formatDestinationLiveness(rows: readonly DestinationLiveness[]): string {
  const lines: string[] = ['Phase 6a liveness — counted through runSimulation, not read off a diff'];
  for (const row of rows) {
    lines.push(
      `  ${row.label}\n` +
        `    building ${row.building}, callType ${row.callType}, weights.rideTime ${row.weightsRideTime}, ` +
        `${row.totalDecisions} decisions\n` +
        `    rideTime pricing : ${row.ridePricing.nonZero}/${row.ridePricing.evaluations} evaluations non-zero, ` +
        `cross-car spread in ${row.ridePricing.decisionsWithSpread}/${row.ridePricing.decisions} decisions\n` +
        `    eligibility      : ${row.eligibility.accessRefusals}/${row.eligibility.verdicts} verdicts refused on access or service zoning; ` +
        `mixed in ${row.eligibility.decisionsWithMixedEligibility}, wholly refused in ${row.eligibility.decisionsWhollyRefused}, ` +
        `of ${row.eligibility.decisions} decisions; by reason ` +
        (Object.keys(row.eligibility.byReason).length === 0
          ? 'none'
          : Object.entries(row.eligibility.byReason)
              .map(([reason, count]) => `${reason}=${count}`)
              .join(' ')),
    );
  }
  return lines.join('\n');
}
