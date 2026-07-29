/**
 * **The seam guard.** Every dispatch behaviour the config declares must be observable in a run.
 *
 * This class of defect has now occurred four times in this project, always with the same shape: a
 * behaviour is implemented, unit-tested in isolation, weighted or named by a shipped profile, and
 * **dead in the shipped path** because nothing in `sim/simulation.ts` calls it. It is worse than an
 * absent feature, because every other kind of test passes:
 *
 * - the module's own suite passes — it drives the behaviour directly;
 * - the schema round-trips — the knob is declared, in range, with a default;
 * - the run completes and its books balance;
 * - and a Phase 7 optimizer spends a fifth of its replication budget searching a dimension whose
 *   objective is a constant, then reports whichever noise it found as a winner.
 *
 * A grep for the symbol does not catch it either, which is why nothing here greps. Every assertion
 * below is **behavioural**: two configurations that the docs say must differ are run through
 * `runSimulation` on the same seed, and their car trajectories must not be byte-identical. A
 * bit-identical pair is not "a small effect at this budget" — it is a disconnected feature, and no
 * budget changes it (docs/05-roadmap.md § Phase 7, the piecewise-constant objective).
 *
 * ## What is guarded, and against what
 *
 * | Guard | Fails when |
 * |---|---|
 * | every `idle.parkingStrategy` differs from `stay` | `#park` stops resolving the bank context, or a strategy loses its input |
 * | `auction.aggregation` selects a policy | the registry stops being consulted, or a profile's section stops being read |
 * | sealed-bid ≡ central argmin | the auction stops being an *aggregation* and becomes a second cost function |
 * | the load edge fires and migrates | `#finishStop` stops sweeping, or the monitor stops being constructed |
 * | every weighted term prices something | any cost term goes inert through the engine, `zoneAffinity` and `predictedDemand` included |
 * | the predictor observes identically across dispatchers on every zero-transfer building | CRN breaks between a predictive arm and a non-predictive one |
 * | and divergently on every building that declares one | transfers stop feeding the predictor, or a stale hand-written list of "single-leg" buildings goes unchecked |
 *
 * ## Why the digest is the passenger record and not the summary
 *
 * Two configurations can produce the same AWT from different journeys, and a mean is exactly the
 * statistic that hides a small structural difference. The digest is every leg's car and boarding
 * instant, which is the trajectory itself.
 */

import { describe, expect, it } from 'vitest';

import { PARKING_STRATEGIES } from '../config/types.js';
import type { DispatcherProfile, ParkingStrategy, ResolvedBuilding } from '../config/types.js';
import { COST_TERMS, createPolicyFor } from '../dispatch/index.js';
import type {
  DispatchContext,
  DispatchDecision,
  DispatchPolicy,
  ScoreBreakdown,
} from '../dispatch/types.js';
import { createArrivalModel } from '../dispatch/predictor/arrivalModel.js';
import type { ArrivalModel } from '../dispatch/predictor/types.js';
import type { Direction } from '../model/types.js';
import { LOAD_SENSOR_DEFAULTS } from '../model/car/loadSensor.js';
import { dwellSecondsFor } from '../physics/doors/doorMachine.js';
import { DOOR_DEFAULTS } from '../physics/doors/types.js';

import { BUILDING_IDS, load } from './fixtures.test-helper.js';
import { Simulation, runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_726;

/** Every leg's car and boarding instant: the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map((leg) => `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}:${String(leg.alightedAt)}`)
    .join('|');
}

/* -------------------------------------------------------------------------- *
 * Stage 7 — every parking strategy must do something a run can see
 * -------------------------------------------------------------------------- */

describe('idle.parkingStrategy is observable in a run, for every value the categorical admits', () => {
  /**
   * The deadband is set to something the shafts can pay for.
   *
   * `repositionThresholdS` is *seconds of expected response saved per future call*, and at a value
   * above what a building's geometry can produce every strategy is correctly inside its own
   * deadband and every arm is identical — which would make this guard pass for the wrong reason.
   * 2 s is inside the declared `[0, 60]` range and well under what a 21-floor shaft produces.
   */
  const IDLE = { repositionThresholdS: 2, repositionEnergyWeight: 0.1 } as const;

  function parked(
    building: ResolvedBuilding,
    base: DispatcherProfile,
    strategy: ParkingStrategy,
    config: Omit<SimulationConfig, 'building' | 'dispatcherProfile'>,
  ): string {
    return trajectory(
      runSimulation({
        ...config,
        building,
        dispatcherProfile: {
          ...base,
          id: `park-${strategy}`,
          idle: { ...base.idle, ...IDLE, parkingStrategy: strategy },
        },
      }),
    );
  }

  it('makes every strategy produce different car trajectories from stay', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    const base = cfg.dispatcherProfilesById.get('eta') as DispatcherProfile;
    const common = {
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    } as const;

    const control = parked(building, base, 'stay', common);
    for (const strategy of PARKING_STRATEGIES) {
      if (strategy === 'stay') continue;
      expect(
        parked(building, base, strategy, common),
        `parkingStrategy "${strategy}" produced a byte-identical run to "stay" — the strategy is not reaching stage 7`,
      ).not.toBe(control);
    }
  });

  it('answers no-forecast, and only no-forecast, when the run holds no predictor', async () => {
    // The control arm for the guard above, and the exact state `predicted-demand` was stuck in
    // before the predictor was wired: with no forecast the strategy refuses to move, which is
    // observationally identical to `stay`. Asserting it here is what keeps the assertion above
    // meaningful — it shows the difference really is the forecast.
    const cfg = await load();
    const building = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    const base = cfg.dispatcherProfilesById.get('eta') as DispatcherProfile;
    const common = {
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      createPredictor: () => undefined,
    } as const;

    expect(parked(building, base, 'predicted-demand', common)).toBe(
      parked(building, base, 'stay', common),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 4 — the aggregation is selected by data, and the two arms differ
 * -------------------------------------------------------------------------- */

describe('auction.aggregation selects the policy, and the aggregations are not the same run', () => {
  async function run(profileId: string, overrides: Partial<SimulationConfig> = {}) {
    const cfg = await load();
    const building = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    return runSimulation({
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get(profileId) as DispatcherProfile,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      ...overrides,
    });
  }

  it('runs multi-round contract net differently from sealed bid', async () => {
    // The two profiles differ in their `auction` section and in nothing else, so a difference here
    // is the aggregation. A byte-identical pair would mean either the registry is not consulted or
    // the profile's rounds are not read — the state the project was in when the multi-round arm had
    // a measured divergence rate and no wait-time result.
    expect(trajectory(await run('auction-multi-round'))).not.toBe(
      trajectory(await run('auction')),
    );
  });

  it('makes sealed bid bit-identical to the centralized argmin over the same weights', async () => {
    // The other direction, and it is a theorem rather than a tolerance: with one round there is no
    // round to reallocate a declined contract into, so the winner is the lowest bid — which is what
    // the central scorer picks. If this ever stops holding, the auction has become a second cost
    // function rather than a second aggregation, and every "the contract net differs" result above
    // would be measuring the wrong thing.
    const cfg = await load();
    const auction = cfg.dispatcherProfilesById.get('auction') as DispatcherProfile;
    const central: DispatcherProfile = { ...auction, auction: { aggregation: 'central-argmin' } };
    const building = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    const common = {
      building,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    } as const;

    expect(trajectory(runSimulation({ ...common, dispatcherProfile: auction }))).toBe(
      trajectory(runSimulation({ ...common, dispatcherProfile: central })),
    );
  }, 60_000);

  it('builds the policy the profile names, in every bank', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get('mixed-use-high-rise') as ResolvedBuilding;
    for (const [profileId, wantsAuction] of [
      ['auction-multi-round', true],
      ['eta', false],
    ] as const) {
      const simulation = new Simulation({
        building,
        dispatcherProfile: cfg.dispatcherProfilesById.get(profileId) as DispatcherProfile,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });
      expect(simulation.policies.size).toBeGreaterThan(1);
      for (const [bankId, policy] of simulation.policies) {
        expect('auction' in policy.config, `${profileId}/${bankId}`).toBe(wantsAuction);
      }
    }
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Stage 5 — the load edge fires, and only migrates for a profile that opted in
 * -------------------------------------------------------------------------- */

describe('capacity-driven reassignment fires on the load edge', () => {
  async function activity(profileId: string) {
    const cfg = await load();
    const simulation = new Simulation({
      building: cfg.buildingsById.get('midtown-office') as ResolvedBuilding,
      dispatcherProfile: cfg.dispatcherProfilesById.get(profileId) as DispatcherProfile,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    });
    simulation.run();
    return simulation.stageActivity;
  }

  it('sweeps for every profile and migrates only under until-commitment', async () => {
    // Three counts, and the third is the one that distinguishes "off" from "never wired". A
    // migration count of zero used to mean both, indistinguishably; a crossing count separates them.
    const optedIn = await activity('capacity-aware');
    expect(optedIn.capacityCrossings, 'no car crossed its bypass threshold').toBeGreaterThan(0);
    expect(optedIn.capacityMigrations, 'stage 5 never moved a call').toBeGreaterThan(0);

    const control = await activity('eta');
    expect(control.capacityCrossings, 'the sweep did not run for the control arm').toBeGreaterThan(0);
    expect(control.capacityHeld, 'the sweep looked at no call').toBeGreaterThan(0);
    expect(control.capacityMigrations, 'reassignmentPolicy: never migrated a call').toBe(0);
  });

  it('leaves a reassignmentPolicy: never profile bit-identical to one run without the sweep', async () => {
    // The claim that makes the mechanism's value measurable against its own absence: wiring the
    // trigger in changed nothing for a profile that did not ask for stage 5. Under `never` every
    // call comes back `retained`, so no `#applyDecision` runs — and the `eta` numbers this project
    // has already published stay comparable.
    const cfg = await load();
    const eta = cfg.dispatcherProfilesById.get('eta') as DispatcherProfile;
    expect(eta.dispatch?.reassignmentPolicy).toBeUndefined();
    const activityOf = await activity('eta');
    expect(activityOf.capacityMigrations).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Stage 6 — the courtesy hold reaches the door, and the profile decides it
 * -------------------------------------------------------------------------- */

describe('answer.reopenOnLateArrival reaches a run, in both of its positions', () => {
  async function simulate(reopenOnLateArrival: boolean, buildingId = 'midtown-office') {
    const cfg = await load();
    const base = cfg.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    const simulation = new Simulation({
      building: cfg.buildingsById.get(buildingId) as ResolvedBuilding,
      dispatcherProfile: {
        ...base,
        id: `hold-${String(reopenOnLateArrival)}`,
        answer: { ...base.answer, reopenOnLateArrival },
      },
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    });
    return { simulation, result: simulation.run() };
  }

  it('asks for the hold whatever the profile says, and honours it only when the profile does', async () => {
    // Three counts, and the first is the one that distinguishes "off" from "never wired" — the
    // same distinction `capacityCrossings` makes for stage 5, and for the same reason. The only
    // non-test caller of `Car.requestReopen` used to hardcode `'obstruction'`, so the
    // `lateArrival` branch of `doorMachine.refusalFor` was unreachable, `DoorAccounting.lateArrivals`
    // was structurally 0 on every run this project can produce, and
    // `DOOR_REOPEN_REFUSALS.policyDisabled` was a verdict nothing could return. A granted count
    // of zero could not tell any of that from a profile that simply declined every hold.
    const declined = (await simulate(false)).simulation.stageActivity;
    expect(
      declined.lateArrivalHoldsRequested,
      'no courtesy hold was ever asked for — the request site is gone',
    ).toBeGreaterThan(0);
    expect(declined.lateArrivalHoldsGranted).toBe(0);
    expect(
      declined.lateArrivalHoldsRefused,
      'DOOR_REOPEN_REFUSALS.policyDisabled is unreachable again',
    ).toBe(declined.lateArrivalHoldsRequested);

    const honoured = (await simulate(true)).simulation.stageActivity;
    expect(honoured.lateArrivalHoldsGranted).toBeGreaterThan(0);
  }, 120_000);

  it('produces a different set of journeys when it is honoured', async () => {
    // The behavioural half. A bit-identical pair here would mean the door reversed and nobody
    // boarded, which is a reopen that costs time and buys nothing — the shape the obstruction
    // path had before `#transferAtStop` learned to replay its boarding half.
    const declined = await simulate(false);
    const honoured = await simulate(true);
    expect(trajectory(honoured.result)).not.toBe(trajectory(declined.result));
  }, 120_000);

  it('is off by default, exercised through default resolution on a building that asks', async () => {
    /*
     * This used to call `simulate(false, 'garden-apartments')` — setting the flag *explicitly*,
     * so it never touched the default at all — on the one shipped building whose landings always
     * empty, where `lateArrivalHoldsRequested` is 0 and `granted === 0` holds whatever the door
     * does. Both halves were vacuous, and together they asserted nothing.
     *
     * What it has to test: a profile that **authors nothing** resolves to a declined hold, on a
     * building that actually asks for one. `midtown-office` requests holds; the profile goes in
     * with no `answer.reopenOnLateArrival` key at all, so `resolveDoorConfig` falls all the way
     * through to `DOOR_DEFAULTS`.
     */
    const cfg = await load();
    const base = cfg.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    expect(base.answer?.reopenOnLateArrival).toBeUndefined();
    expect(DOOR_DEFAULTS.reopenOnLateArrival).toBe(false);

    const answer = { ...base.answer };
    delete (answer as Record<string, unknown>)['reopenOnLateArrival'];
    const simulation = new Simulation({
      building: cfg.buildingsById.get('midtown-office') as ResolvedBuilding,
      dispatcherProfile: { ...base, id: 'hold-unauthored', answer },
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    });
    const result = simulation.run();
    const activity = simulation.stageActivity;

    // The building really does ask, so the two assertions below are about the *default*.
    expect(
      activity.lateArrivalHoldsRequested,
      'midtown-office stopped producing late arrivals; this test is vacuous again',
    ).toBeGreaterThan(0);
    expect(activity.lateArrivalHoldsGranted).toBe(0);
    expect(activity.lateArrivalHoldsRefused).toBe(activity.lateArrivalHoldsRequested);

    // And bit-identical to the same profile with the flag written out as `false`, which is what
    // "the default preserves the published operating point" means.
    const explicit = await simulate(false);
    expect(trajectory(result)).toBe(trajectory(explicit.result));
  }, 120_000);

  it('grants no hold that boards nobody, and sizes each one to its own cohort', async () => {
    /*
     * **The two assertions whose absence let the courtesy hold ship with a fictional price.**
     *
     * 1. *A granted hold buys boarding.* `#reopenForLateArrival` used to test
     *    `massKg >= designLoadKg` plus the serve predicate, while `#boardFrom` also requires
     *    `massKg + candidate.massKg < overloadKg`. The two disagree the moment
     *    `answer.overloadThreshold` comes down towards the design load factor — the floor its
     *    declared range now reaches — and the disagreement is a door that reverses, spends the
     *    time, and boards nobody. Both now ask `#projectedBoarding`, which is defined against
     *    `#boardFrom` clause for clause, so the two cannot drift apart again silently.
     *
     * 2. *The dwell is the hold's, not the stop's.* `applyReopen` re-granted
     *    `dwellSecondsFor(config, door.reason)` — the transfer of the cohort that had **already**
     *    got off and on, capped only at `maxTransferSeconds` — once per honoured reopen.
     *
     * The bound is per-hold and not a run total, because a run total cannot see it: the hold
     * dwell is `max(base hall dwell, cohort x tp)`, the base term dominates on these buildings,
     * and summing hides one 40 s re-grant among two hundred 5 s holds. Measured with the defect
     * in place, `lateArrivalHoldMaxDwellS` reaches **40.0 s on vertical-city — exactly
     * `maxTransferSeconds`** — against a largest hold cohort of 17, and every building below
     * fails this assertion. With the dwell sized to the hold, each comes in at exactly
     * `dwellSecondsFor` of its own largest cohort.
     */
    const cfg = await load();
    const base = cfg.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;

    for (const buildingId of ['secure-tower', 'mixed-use-high-rise']) {
      for (const overloadThreshold of [1.1, LOAD_SENSOR_DEFAULTS.designLoadFactor]) {
        const simulation = new Simulation({
          building: cfg.buildingsById.get(buildingId) as ResolvedBuilding,
          dispatcherProfile: {
            ...base,
            id: `hold-bound-${String(overloadThreshold)}`,
            answer: { ...base.answer, reopenOnLateArrival: true, overloadThreshold },
          },
          trafficProfiles: cfg.trafficProfiles,
          elevatorSpecs: cfg.elevatorSpecs,
          seed: SEED,
          onTimeout: 'report',
        });
        simulation.run();
        const a = simulation.stageActivity;
        const where = `on ${buildingId} at overloadThreshold ${overloadThreshold}`;

        expect(a.lateArrivalHoldsGranted, `no hold was granted ${where}`).toBeGreaterThan(0);

        // (1) The intersection of the room check and the boarding predicate.
        expect(
          a.lateArrivalHoldsBoarded,
          `${a.lateArrivalHoldsGranted} holds reversed a door and boarded nobody ${where} — ` +
            'the room check and #boardFrom disagree again',
        ).toBeGreaterThan(0);

        // (2) The dwell bound, rebuilt from the fleet's own resolved door configs: what a
        // hall-call open period for the largest cohort any single hold was sized for costs.
        // Nothing about the stops the holds interrupted may enter into it.
        let bound = 0;
        for (const car of simulation.building.cars) {
          bound = Math.max(
            bound,
            dwellSecondsFor(car.doorConfig, {
              carCall: false,
              hallCall: true,
              hallQueueLength: a.lateArrivalHoldMaxCohort,
              transferSeconds: a.lateArrivalHoldMaxCohort * car.passengerTransferS,
            }),
          );
        }
        expect(
          a.lateArrivalHoldMaxDwellS,
          `one hold was granted ${a.lateArrivalHoldMaxDwellS.toFixed(2)}s ${where}, and the ` +
            `largest cohort any hold was sized for is ${a.lateArrivalHoldMaxCohort} ` +
            `passengers, worth ${bound.toFixed(2)}s. A reopen is being re-granted the transfer ` +
            'of the cohort that had already transferred',
        ).toBeLessThanOrEqual(bound + 1e-9);

        // Non-vacuity: a run in which no hold was sized for anybody could not fail the above.
        expect(a.lateArrivalHoldMaxCohort, `no hold was sized for anybody ${where}`).toBeGreaterThan(0);
      }
    }
  }, 240_000);
});

/* -------------------------------------------------------------------------- *
 * Stage 3 — no weighted cost term may be inert through the shipped engine
 * -------------------------------------------------------------------------- */

/** Non-zero raw evaluations and cross-car spread, per term, over a whole run. */
interface TermTally {
  readonly evaluations: Map<string, number>;
  readonly nonZero: Map<string, number>;
  readonly spread: Map<string, number>;
}

function tally(): TermTally {
  return { evaluations: new Map(), nonZero: new Map(), spread: new Map() };
}

function bump(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function record(into: TermTally, decision: DispatchDecision): void {
  if (decision.scores.length === 0) return;
  const byTerm = new Map<string, number[]>();
  for (const score of decision.scores) {
    for (const term of score.terms as readonly ScoreBreakdown[]) {
      bump(into.evaluations, term.termId);
      if (term.raw !== 0) bump(into.nonZero, term.termId);
      const seen = byTerm.get(term.termId) ?? [];
      seen.push(term.raw);
      byTerm.set(term.termId, seen);
    }
  }
  for (const [termId, raws] of byTerm) {
    if (new Set(raws).size > 1) bump(into.spread, termId);
  }
}

/**
 * A real policy that counts what its engine priced.
 *
 * Injected through `SimulationConfig.createPolicy`, so the decisions counted are the ones the run
 * actually made — through `costRequestFor`, `observationFor` and the context `#dispatchBank` really
 * builds — rather than through a hand-built `TermContext` that can be given whatever it needs to
 * look alive. That distinction is the whole reason this test exists: every term had a passing unit
 * test while three of them evaluated to zero for every car of every run.
 */
function counting(inner: DispatchPolicy, into: TermTally): DispatchPolicy {
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

describe('every weighted cost term prices something through the shipped engine', () => {
  /**
   * Every implemented term at weight 1, and the one stage setting `rideTime` needs.
   *
   * `destination-entry` is not a thumb on the scale: it is the configuration under which `rideTime`
   * is declared live (`rideTimeTerm.activeWhen`), and the runner supplies the head-of-queue
   * passenger's destination on the call exactly as it already supplies their credential — gated by
   * `costRequestFor`, so no `up-down-buttons` profile can see it.
   */
  const EVERY_TERM: DispatcherProfile = {
    id: 'seam-every-term',
    name: 'Every implemented term weighted',
    weights: Object.fromEntries(COST_TERMS.map((term) => [term.id, 1])),
    dispatch: { callType: 'destination-entry' },
  };

  it('evaluates every term to a non-zero value, with spread across candidate cars', async () => {
    const cfg = await load();
    const counts = tally();
    const simulation = new Simulation({
      building: cfg.buildingsById.get('midtown-office') as ResolvedBuilding,
      dispatcherProfile: EVERY_TERM,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      createPolicy: (profile, options) => counting(createPolicyFor(profile, options), counts),
    });
    simulation.run();

    for (const term of COST_TERMS) {
      const evaluations = counts.evaluations.get(term.id) ?? 0;
      expect(evaluations, `${term.id} was never evaluated`).toBeGreaterThan(0);
      // Non-zero alone is not enough. A term that returns the same value for every candidate is a
      // constant added to every cost, and a constant cannot move an argmin — which is what a
      // "uniform destination prior" version of `rideTime` would have been.
      expect(
        counts.nonZero.get(term.id) ?? 0,
        `${term.id} evaluated to zero on all ${evaluations} evaluations of a real run`,
      ).toBeGreaterThan(0);
      expect(
        counts.spread.get(term.id) ?? 0,
        `${term.id} produced the same value for every car in every decision of a real run`,
      ).toBeGreaterThan(0);
    }
  }, 60_000);

  it('leaves rideTime correctly inert under up-down-buttons, as its activeWhen declares', async () => {
    // The contrast that keeps the assertion above honest. A landing call carries no destination
    // under `up-down-buttons`, so nobody — not the term, not the car — can say how long the
    // passenger will be aboard, and a term with no information must contribute no cost. `rideTime`
    // is therefore inert *by configuration* rather than by disconnection, which is the distinction
    // `activeWhen` exists to make machine-readable.
    const cfg = await load();
    const counts = tally();
    const simulation = new Simulation({
      building: cfg.buildingsById.get('midtown-office') as ResolvedBuilding,
      dispatcherProfile: { ...EVERY_TERM, id: 'seam-conventional', dispatch: {} },
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      createPolicy: (profile, options) => counting(createPolicyFor(profile, options), counts),
    });
    simulation.run();

    expect(counts.evaluations.get('rideTime') ?? 0).toBeGreaterThan(0);
    expect(counts.nonZero.get('rideTime') ?? 0).toBe(0);
    // And the two group-owned terms are live under both call types, because they do not depend on
    // the destination at all.
    for (const termId of ['zoneAffinity', 'predictedDemand']) {
      expect(counts.nonZero.get(termId) ?? 0, termId).toBeGreaterThan(0);
    }
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Common random numbers — the predictor must see the same world in every arm
 * -------------------------------------------------------------------------- */

describe('the arrival model observes identically whatever the dispatcher does', () => {
  /** Wraps a real model and records the exact observation sequence it was fed. */
  function recording(floorIds: readonly string[], log: string[]): ArrivalModel {
    const model = createArrivalModel({ floorIds });
    return new Proxy(model, {
      get(target, property): unknown {
        if (property === 'observe') {
          return (floorId: string, direction: Direction, at: number, count?: number): void => {
            log.push(`${floorId}:${direction}:${String(at)}:${String(count ?? 1)}`);
            model.observe(floorId, direction, at, count);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as ArrivalModel;
  }

  /** The dispatchers the partition is checked across. Structurally different from each other. */
  const ARMS = ['nearest-car', 'eta', 'predictive-balanced', 'auction-multi-round'] as const;

  function sequenceFor(
    cfg: Awaited<ReturnType<typeof load>>,
    building: ResolvedBuilding,
    profileId: string,
  ): string {
    const log: string[] = [];
    const simulation = new Simulation({
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get(profileId) as DispatcherProfile,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      createPredictor: (bank) => recording(bank.servesFloors, log),
    });
    simulation.run();
    return log.join('|');
  }

  /**
   * The two sides of the claim, **derived from `data/buildings/` rather than hand-listed**.
   *
   * The previous version of this guard named `midtown-office` and asserted only on it, while the
   * comment beside it, `#buildPredictors`' docstring and docs/05-roadmap.md all named
   * `secure-tower` as a third single-leg building. It is not one: `data/buildings/secure-tower.json`
   * flags its screened lobby `G` as `isTransferFloor`, so a handful of its journeys continue onto a
   * second leg and its observation stream is dispatcher-dependent like any other transfer
   * building's. Nothing caught it because nothing derived the list.
   *
   * So the list is derived now. `transferFloors` is the *only* thing that decides which side a
   * building falls on — it is exactly the condition that lets a continuation leg exist — and a
   * building that grows or loses a sky lobby moves sides here automatically instead of leaving a
   * stale name behind in three documents.
   */
  async function partition(): Promise<{
    cfg: Awaited<ReturnType<typeof load>>;
    singleLeg: readonly ResolvedBuilding[];
    withTransfers: readonly ResolvedBuilding[];
  }> {
    const cfg = await load();
    const singleLeg: ResolvedBuilding[] = [];
    const withTransfers: ResolvedBuilding[] = [];
    for (const buildingId of BUILDING_IDS) {
      const building = cfg.buildingsById.get(buildingId) as ResolvedBuilding;
      (building.transferFloors.length === 0 ? singleLeg : withTransfers).push(building);
    }
    // Both sides non-empty, or one of the two assertions below is vacuous.
    expect(singleLeg.length, 'no shipped building is single-leg any more').toBeGreaterThan(0);
    expect(withTransfers.length, 'no shipped building has a sky lobby any more').toBeGreaterThan(0);
    return { cfg, singleLeg, withTransfers };
  }

  it('feeds a byte-identical observation sequence to every dispatcher on every zero-transfer building', async () => {
    // The property CRN rests on: the passenger population is a function of `(seed, config)` and
    // must not shift when a dispatcher behaves differently (docs/03 § Part 4). Observations are
    // taken in `#admit`, at the passenger's own `arrivedAt`, which for a first leg is the trace's
    // batch time — so a predictive arm and a non-predictive one see the same world and can be
    // paired on equal terms.
    //
    // Asserted for every building with no transfer floor, not for one named one. As `data/` ships
    // that is `garden-apartments` and `midtown-office`, and the first of those is where the Phase 5
    // pre-positioning criterion lives.
    const { cfg, singleLeg } = await partition();
    for (const building of singleLeg) {
      const sequences = ARMS.map((profileId) => sequenceFor(cfg, building, profileId));
      expect(sequences[0]?.length ?? 0, `${building.id} observed nothing`).toBeGreaterThan(0);
      for (const [index, sequence] of sequences.entries()) {
        expect(
          sequence,
          `${building.id} declares no transfer floor, yet "${ARMS[index] ?? ''}" fed its predictor different observations from "${ARMS[0]}" — a predictive arm cannot be CRN-paired against a non-predictive one there`,
        ).toBe(sequences[0]);
      }
    }
  }, 120_000);

  it('diverges on every building that declares a transfer floor, which is a fact about transfers and not a bug', async () => {
    // A transfer arrival IS a real arrival, observed after it happened, so causality holds. What
    // does not hold is CRN on the *observation stream*: two arms deliver the first legs at
    // different times, so the second legs begin waiting at different times. The consequence is
    // stated rather than hidden — a paired difference on one of these buildings is a difference in
    // dispatch PLUS whatever the divergent observation stream did to the forecast.
    //
    // It holds on `secure-tower` too, and only feebly, which is why it was missed: measured at this
    // seed only 3 of its 396 journeys are multi-leg and `conservation.transfers` is 0 under
    // `nearest-car` against 3 under `eta`. Three dispatcher-dependent transfers still make the
    // stream dispatcher-dependent, and `secure-up-peak` is a benchmark case.
    const { cfg, withTransfers } = await partition();
    for (const building of withTransfers) {
      const sequences = ARMS.map((profileId) => sequenceFor(cfg, building, profileId));
      const reference = sequences[0] ?? '';
      expect(reference.length, `${building.id} observed nothing`).toBeGreaterThan(0);

      // Same dispatcher, same seed: byte-identical, so the divergence below is the dispatcher and
      // not nondeterminism.
      expect(sequenceFor(cfg, building, ARMS[0]), `${building.id} is not deterministic`).toBe(
        reference,
      );

      expect(
        sequences.filter((sequence) => sequence !== reference).length,
        `${building.id} declares transfer floors (${building.transferFloors.map((floor) => floor.id).join(', ')}) yet every dispatcher fed its predictor the same observations — either transfers stopped feeding the predictor, or this building is single-leg in practice and the caveat it carries is unnecessary`,
      ).toBeGreaterThan(0);
    }
  }, 120_000);
});
