/**
 * **`sim.assignedWalkS`'s gate, checked in both directions** — GitHub issue #534 item 4,
 * `DECISIONS.md` § D553, § D568.
 *
 * Invariant 8 asks every tunable to declare when it is live. `sim.assignedWalkS` declared half of
 * its gate: `dispatch.passengerAssignment: 'panel'`. Since § D553 a landing may carry its own hall
 * fixture, so *whether a car is named* is decided landing by landing — `Simulation.#assignsAt` —
 * and a `panel` dispatcher over a building whose every floor declares `up-down-buttons` names no
 * car anywhere. The declared gate said the walk was live; nobody walked.
 *
 * ## What is asserted, and why a gate needs both halves
 *
 * `sim/searchSpaceLiveness.test.ts` states the rule this file applies to one row: *"a gate is a
 * claim, and every gate has to assert that its gated-**off** region is flat"*. A gate that is only
 * ever satisfied and then found live is unfalsifiable — a gate whose condition is simply wrong
 * passes it. So:
 *
 * - **live where a landing assigns.** On a hybrid building (panels at some landings only), moving
 *   the walk from 0 s to 20 s moves the legs.
 * - **flat where none does.** Under the same `panel` dispatcher on a building whose landings all
 *   declare `up-down-buttons`, the same move is byte-identical — every event, every record, every
 *   statistic — apart from the warning the run raises about it.
 * - **and the run says so.** A run that sets a non-zero walk and names no car anywhere raises a
 *   warning saying the value is inert, because a control that writes nothing must say so
 *   (`CLAUDE.md` § *the standing requirement*), and the saying is pinned by a run rather than by a
 *   sentence in a schema.
 * - **the declared half is complete.** Both clauses an `activeWhen` can name are declared, and the
 *   second — a destination-carrying call type — is *checked against `core`'s own refusal* rather
 *   than restated: `resolveDispatchConfig` throws for the pair the gate excludes.
 *
 * The third clause of the gate — *some landing of this building registers a destination call* — is
 * not declarable in an `activeWhen`, whose vocabulary is parameter ids; `sim/types.ts` says why at
 * the row, and this file is where it is executed instead.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { CallType, DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { resolveDispatchConfig } from '../dispatch/policy.js';
import { DispatchError } from '../dispatch/types.js';

import { fingerprint, load, reauthoredWithLandings } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import { SIM_PARAMETERS, type SimulationConfig, type SimulationResult } from './types.js';

const SEED = 20_260_914;
const BUILDING = 'midtown-office';

/** The § D333 heavy point, the operating point `landingPanels.test.ts` moved its own cases to. */
const UP_PEAK = {
  durationS: 1800,
  reportWindow: 'full-run',
  demand: {
    directionalSplit: { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 },
    arrivalRatePctPop5min: 4,
    peakWindowS: 300,
  },
} as const satisfies Partial<SimulationConfig>;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function shipped(buildingId: string): ResolvedBuilding {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`missing building fixture "${buildingId}"`);
  return building;
}

/** `eta` with the named stage settings and a priced ride — `landingPanels.test.ts`'s arms. */
function arm(id: string, dispatch: DispatcherProfile['dispatch']): DispatcherProfile {
  const base = config.dispatcherProfilesById.get('eta');
  if (base === undefined) throw new Error('missing dispatcher fixture "eta"');
  return {
    ...base,
    id,
    name: id,
    weights: { ...base.weights, rideTime: 1 },
    dispatch: { ...base.dispatch, ...dispatch },
  };
}

const PANEL = (): DispatcherProfile =>
  arm('arm-panel', { callType: 'mobile-credential', passengerAssignment: 'panel' });
const CONVENTIONAL = (): DispatcherProfile => arm('arm-conventional', {});

/** Up/down buttons on every landing of the building. */
function buttonsEverywhere(buildingId: string): Readonly<Record<string, CallType>> {
  return Object.fromEntries(
    shipped(buildingId).floors.map((floor) => [floor.id, 'up-down-buttons' as CallType]),
  );
}

/** Up/down buttons on every landing but the named ones, which keep the dispatcher's own fixture. */
function panelsOnlyAt(
  buildingId: string,
  ...panelled: readonly string[]
): Readonly<Record<string, CallType>> {
  return Object.fromEntries(
    shipped(buildingId)
      .floors.filter((floor) => !panelled.includes(floor.id))
      .map((floor) => [floor.id, 'up-down-buttons' as CallType]),
  );
}

function run(
  building: ResolvedBuilding,
  profile: DispatcherProfile,
  assignedWalkS: number,
): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    assignedWalkS,
    ...UP_PEAK,
  });
}

/** Every leg's car and boarding instant — the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map((leg) => `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}`)
    .join('|');
}

const mentionsTheWalk = (warning: string): boolean => warning.includes('sim.assignedWalkS');

/**
 * Everything a caller could act on **except the one warning that reports the inertness** — which
 * the run carries in two places, `SimulationResult.warnings` and `RunRecord.warnings`.
 *
 * Both are filtered rather than emptied, so an unrelated warning appearing or disappearing between
 * the two runs still fails. Emptying them would make this case pass for the wrong reason the day
 * something else in the run started warning.
 *
 * `RunRecord.warnings` is **omitted rather than emptied** when a run raises none, so absent and
 * empty are the same state and both are normalised to an empty array here. Without that the
 * comparison would fail on the *key* rather than on the run: the quiet arm has no `warnings` key at
 * all and the noisy one has a key whose only entry has just been filtered out.
 */
function withoutTheWalkWarning(result: SimulationResult): string {
  const keep = (warnings: readonly string[] | undefined): readonly string[] =>
    (warnings ?? []).filter((warning) => !mentionsTheWalk(warning));
  return fingerprint({
    ...result,
    warnings: keep(result.warnings),
    record: { ...result.record, warnings: keep(result.record.warnings) },
  });
}

/** The warning in both places it is published, so neither can go quiet on its own. */
const inertWarnings = (result: SimulationResult): readonly string[] => [
  ...result.warnings.filter(mentionsTheWalk),
  ...(result.record.warnings ?? []).filter(mentionsTheWalk),
];

/* -------------------------------------------------------------------------- *
 * The declared half
 * -------------------------------------------------------------------------- */

describe('the two clauses an activeWhen can name are declared', () => {
  it('gates on the panel and on a call type that can carry a destination', () => {
    const row = SIM_PARAMETERS.find((parameter) => parameter.id === 'sim.assignedWalkS');
    expect(row?.activeWhen).toStrictEqual({
      'dispatch.passengerAssignment': ['panel'],
      'dispatch.callType': ['destination-entry', 'mobile-credential'],
    });
  });

  it('declares the call-type clause core already refuses, rather than a new rule', () => {
    // The clause was transitive before it was written down, and this is what made it true: the
    // resolver refuses `panel` beside a call type that cannot ask for a destination. Asked of
    // `core` rather than restated, so a change there fails here.
    expect(() =>
      resolveDispatchConfig(
        arm('probe', { callType: 'up-down-buttons', passengerAssignment: 'panel' }),
      ),
    ).toThrow(DispatchError);
    for (const callType of ['destination-entry', 'mobile-credential'] as const) {
      expect(
        resolveDispatchConfig(arm('probe', { callType, passengerAssignment: 'panel' })).dispatch
          .passengerAssignment,
      ).toBe('panel');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Live where a landing assigns
 * -------------------------------------------------------------------------- */

describe('the walk is charged at the landings that name a car', () => {
  it('moves the legs on a hybrid building, and raises no inert warning', () => {
    const building = reauthoredWithLandings(config, BUILDING, panelsOnlyAt(BUILDING, 'G'));
    const free = run(building, PANEL(), 0);
    const walked = run(building, PANEL(), 20);

    expect(free.comparability.passengerModel).toBe('hybrid');
    expect(trajectory(walked)).not.toBe(trajectory(free));
    // The arrival column is the window-membership key; a walk moves who boards when, never who came.
    expect(walked.record.passengers.map((leg) => leg.arrivedAt)).toEqual(
      free.record.passengers.map((leg) => leg.arrivedAt),
    );
    expect(inertWarnings(walked)).toEqual([]);
  }, 60_000);

  it('moves the legs on a building that declares nothing at all, which is every shipped one', () => {
    const free = run(shipped(BUILDING), PANEL(), 0);
    const walked = run(shipped(BUILDING), PANEL(), 20);
    expect(free.comparability.passengerModel).toBe('destination-dispatch');
    expect(trajectory(walked)).not.toBe(trajectory(free));
    expect(inertWarnings(walked)).toEqual([]);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Flat where none does — the half a gate is usually never asked
 * -------------------------------------------------------------------------- */

describe('the walk is inert where no landing names a car, and the run says so', () => {
  it('is byte-identical under a panel dispatcher whose landings are all up/down buttons', () => {
    const building = reauthoredWithLandings(config, BUILDING, buttonsEverywhere(BUILDING));
    const free = run(building, PANEL(), 0);
    const walked = run(building, PANEL(), 30);

    expect(free.comparability.passengerModel).toBe('conventional');
    expect(withoutTheWalkWarning(walked)).toBe(withoutTheWalkWarning(free));
    expect(inertWarnings(walked)).toHaveLength(2);
    expect(inertWarnings(walked)[0]).toMatch(/inert/);
    expect(inertWarnings(free)).toEqual([]);
  }, 60_000);

  it('is byte-identical under a conventional dispatcher', () => {
    const free = run(shipped(BUILDING), CONVENTIONAL(), 0);
    const walked = run(shipped(BUILDING), CONVENTIONAL(), 25);
    expect(withoutTheWalkWarning(walked)).toBe(withoutTheWalkWarning(free));
    expect(inertWarnings(walked)).toHaveLength(2);
    expect(inertWarnings(free)).toEqual([]);
  }, 60_000);

  it('says nothing at the default, so no run that never set the knob grows a warning', () => {
    expect(inertWarnings(run(shipped(BUILDING), CONVENTIONAL(), 0))).toEqual([]);
  }, 60_000);
});
