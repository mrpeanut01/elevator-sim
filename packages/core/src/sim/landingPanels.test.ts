/**
 * **Destination panels per floor, measured at the seam** — GitHub issue #437, stage 1,
 * `DECISIONS.md` § D553.
 *
 * Al-Kodmany (Buildings 2015, § 2.2.1) describes destination dispatch as a *hybrid* as often as a
 * whole-building switch: panels on the busiest landings, up/down buttons on the rest. This tree
 * could not say that — `dispatch.callType` applied to every landing in the run — and a per-floor
 * field that loaded, validated and reached nothing would be the standing requirement's defect
 * again. So every claim here is taken through the real `runSimulation` on a shipped building,
 * re-authored through the schema `loadConfig` runs:
 *
 * - **AC1.** A building that declares nothing is the shipped building, and a landing that declares
 *   the dispatcher's own call type changes nothing, byte for byte.
 * - **AC4.** Adding a panel to one floor changes the legs — under a dispatcher that names a car at
 *   the panel (Level 1) and under one that only prices the destination (Level 0).
 * - **AC2.** Each landing registers its own kind of call: the panel landing promises cars, the
 *   button landing promises nobody, the conservation audit holds, the run says it is `hybrid` and
 *   which landings made it so, and the bare kiosk's refusal is asked only where the kiosk is.
 *
 * **The non-test caller (AC6)** is the shipped entry path: `loadConfig` parses
 * `FloorConfig.landingCallType` through `floorConfigSchema`, `createBuilding` hands it to `Floor`,
 * and `Simulation`'s constructor reads every floor's through `comparabilityOfLandings` and
 * `#callValue`, which stamps `DispatchCall.callType` for `costRequestFor` and `batchKeyOf`.
 *
 * Nothing here says a hybrid is better. That is stage 2's pinned measurement, on the legs, with a
 * paired interval over common random numbers (CLAUDE.md § Statistical discipline).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type {
  CallType,
  DispatcherProfile,
  LoadedConfig,
  ResolvedBuilding,
} from '../config/types.js';
import { MODEL_SENSITIVE_METRIC_IDS } from '../metrics/comparability.js';
import { parseRunRecord } from '../metrics/serialization.js';

import { DATA_DIR, fingerprint, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import { SimulationError, type SimulationConfig, type SimulationResult } from './types.js';

const SEED = 20_260_911;

/** docs/09 § 2.2's operating point: the mix in which a destination says more than a direction. */
const INTERFLOOR_MIX = {
  durationS: 1800,
  reportWindow: 'full-run',
  demand: {
    directionalSplit: { incoming: 0.4, outgoing: 0.3, interfloor: 0.3 },
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  },
} as const satisfies Partial<SimulationConfig>;

/**
 * An up-peak at 4 %, the § D333 heavy point's level. The move-the-control cases run here rather than
 * at the interfloor mix because at 1.5 % interfloor, at {@link SEED}, a panel at G alone left every
 * leg identical to the run with none. That is an **observation at one seed, not a property of the
 * mix**, and no mechanism is offered for it: the review of PR #532 found the null seed-dependent,
 * and at the very next seed the same panel moves the legs. AC4's last case pins both halves, so the
 * reason this constant exists is held by a run rather than by this paragraph; § D553 records the
 * sweep that found it.
 */
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

/**
 * A shipped building re-authored with `declared` landing call types, through `parseBuilding` and
 * `resolveBuilding` exactly as `loadConfig` calls them — the same file path, so even
 * `ResolvedBuilding.source` is the shipped one.
 */
function reauthored(
  buildingId: string,
  declared: Readonly<Record<string, CallType>> = {},
): ResolvedBuilding {
  const file = join(DATA_DIR, 'buildings', `${buildingId}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { floors?: Record<string, unknown>[] };
  const seen = new Set<string>();
  const floors = (raw.floors ?? []).map((floor) => {
    const id = String(floor['id']);
    const landingCallType = declared[id];
    if (landingCallType === undefined) return floor;
    seen.add(id);
    return { ...floor, landingCallType };
  });
  const missing = Object.keys(declared).filter((id) => !seen.has(id));
  if (missing.length > 0) throw new Error(`${buildingId} authors no explicit floor ${missing.join(', ')}`);
  return resolveBuilding(parseBuilding({ ...raw, floors }, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/** Every landing of a building declaring one call type. */
function everywhere(buildingId: string, callType: CallType): Readonly<Record<string, CallType>> {
  return Object.fromEntries(shipped(buildingId).floors.map((floor) => [floor.id, callType]));
}

/** Up/down buttons on every landing but the named ones, which keep the dispatcher's call type. */
function panelsOnlyAt(buildingId: string, ...panelled: readonly string[]): Readonly<Record<string, CallType>> {
  return Object.fromEntries(
    shipped(buildingId)
      .floors.filter((floor) => !panelled.includes(floor.id))
      .map((floor) => [floor.id, 'up-down-buttons' as CallType]),
  );
}

/** `eta` with the stage settings and weights named, and nothing else — `destinationDispatch.test.ts`'s arms. */
function arm(
  id: string,
  dispatch: DispatcherProfile['dispatch'],
  weights: Readonly<Record<string, number>> = {},
): DispatcherProfile {
  const base = config.dispatcherProfilesById.get('eta');
  if (base === undefined) throw new Error('missing dispatcher fixture "eta"');
  return {
    ...base,
    id,
    name: id,
    weights: { ...base.weights, ...weights },
    dispatch: { ...base.dispatch, ...dispatch },
  };
}

const CONVENTIONAL = (): DispatcherProfile => arm('arm-conventional', {});
const PRICED_BUTTONS = (): DispatcherProfile => arm('arm-priced', {}, { rideTime: 1 });
const DISCLOSURE = (): DispatcherProfile =>
  arm('arm-disclosure', { callType: 'mobile-credential' }, { rideTime: 1 });
const PANEL = (): DispatcherProfile =>
  arm('arm-panel', { callType: 'mobile-credential', passengerAssignment: 'panel' }, { rideTime: 1 });

function run(
  building: ResolvedBuilding,
  profile: DispatcherProfile,
  overrides: Partial<SimulationConfig> = {},
): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    ...INTERFLOOR_MIX,
    ...overrides,
  });
}

/** Every leg's car and boarding instant — the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map(
      (leg) =>
        `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}:${String(leg.alightedAt)}`,
    )
    .join('|');
}

function promisedLegs(result: SimulationResult) {
  return result.record.passengers.filter((leg) => leg.assignedCarId !== undefined);
}

/* -------------------------------------------------------------------------- *
 * AC1 — unset is today's behaviour
 * -------------------------------------------------------------------------- */

describe('AC1: a building that declares no landing call type runs as it always has', () => {
  it('re-authoring midtown-office through the schema reproduces the shipped building, byte for byte', () => {
    expect(fingerprint(run(reauthored('midtown-office'), PANEL()))).toBe(
      fingerprint(run(shipped('midtown-office'), PANEL())),
    );
  });

  it('declaring the dispatcher’s own call type on every landing changes nothing, byte for byte', () => {
    for (const [profile, callType] of [
      [CONVENTIONAL(), 'up-down-buttons'],
      [DISCLOSURE(), 'mobile-credential'],
      [PANEL(), 'mobile-credential'],
    ] as const) {
      const undeclared = run(shipped('midtown-office'), profile);
      const declared = run(reauthored('midtown-office', everywhere('midtown-office', callType)), profile);
      expect(fingerprint(declared)).toBe(fingerprint(undeclared));
      expect(declared.comparability).toStrictEqual(undeclared.comparability);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * AC4 — move the control and require the run to change
 * -------------------------------------------------------------------------- */

describe('AC4: adding a panel to one floor changes the legs', () => {
  it('under a dispatcher that names a car at the panel: none against the lobby alone', () => {
    const none = run(
      reauthored('midtown-office', everywhere('midtown-office', 'up-down-buttons')),
      PANEL(),
      UP_PEAK,
    );
    const lobby = run(reauthored('midtown-office', panelsOnlyAt('midtown-office', 'G')), PANEL(), UP_PEAK);

    expect(trajectory(lobby)).not.toBe(trajectory(none));
    // The arrival column is the window-membership key; a panel moves who boards what, never who came.
    expect(lobby.record.passengers.map((leg) => leg.arrivedAt)).toEqual(
      none.record.passengers.map((leg) => leg.arrivedAt),
    );
    expect(promisedLegs(none)).toHaveLength(0);
    expect(promisedLegs(lobby).length).toBeGreaterThan(0);
  });

  it('under a dispatcher that only prices the destination: a kiosk at the lobby moves the legs', () => {
    const buttons = run(shipped('midtown-office'), PRICED_BUTTONS(), UP_PEAK);
    const kiosk = run(
      reauthored('midtown-office', { G: 'destination-entry' }),
      PRICED_BUTTONS(),
      UP_PEAK,
    );
    expect(trajectory(kiosk)).not.toBe(trajectory(buttons));
    // Level 0 is still the conventional passenger model: nobody is promised anything.
    expect(promisedLegs(kiosk)).toHaveLength(0);
    expect(kiosk.comparability).toStrictEqual(buttons.comparability);
  });

  it('at the interfloor mix the same panel leaves the legs alone at one seed and moves them at the next', () => {
    // Why the two cases above run at `UP_PEAK`, pinned as an observation at two named seeds rather
    // than as a mechanism: the null at `SEED` is a fact about that seed's traces, not about the mix.
    const legsUnmovedAt = (seed: number): boolean => {
      const none = run(
        reauthored('midtown-office', everywhere('midtown-office', 'up-down-buttons')),
        PANEL(),
        { seed },
      );
      const lobby = run(reauthored('midtown-office', panelsOnlyAt('midtown-office', 'G')), PANEL(), { seed });
      expect(promisedLegs(lobby).length, `seed ${String(seed)}: the panel did promise cars`).toBeGreaterThan(0);
      return trajectory(lobby) === trajectory(none);
    };
    expect(legsUnmovedAt(SEED), 'the file’s seed: every leg identical').toBe(true);
    expect(legsUnmovedAt(SEED + 1), 'the next seed: the legs move').toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * AC2 — each landing registers its own kind of call
 * -------------------------------------------------------------------------- */

describe('AC2: the dispatcher registers the call each landing can make', () => {
  it('promises cars at the panel landing, and nobody at a button landing', () => {
    const lobby = run(reauthored('midtown-office', panelsOnlyAt('midtown-office', 'G')), PANEL());

    // runSimulation throws on a failed conservation audit, so reaching here is claim 5 holding per
    // landing: every leg the panel could promise was promised, and nobody else was counted.
    expect(lobby.status).toBe('completed');
    const fromLobby = lobby.record.passengers.filter((leg) => leg.originFloorId === 'G');
    const elsewhere = lobby.record.passengers.filter((leg) => leg.originFloorId !== 'G');
    expect(fromLobby.length).toBeGreaterThan(0);
    expect(elsewhere.length).toBeGreaterThan(0);

    for (const leg of fromLobby.filter((candidate) => candidate.boardedAt !== undefined)) {
      expect(leg.assignedCarId, `${leg.passengerId} boarded at the panel unpromised`).toBeDefined();
      expect(leg.carId, `${leg.passengerId} boarded a car it was not promised`).toBe(leg.assignedCarId);
    }
    expect(elsewhere.filter((leg) => leg.assignedCarId !== undefined)).toEqual([]);
  });

  it('says the run is hybrid, names the landings that assign, and carries both onto the record', () => {
    const lobby = run(reauthored('midtown-office', panelsOnlyAt('midtown-office', 'G', 'P1')), PANEL());

    // Building order is floor-index order, and the garage P1 is index -1.
    expect(lobby.comparability.passengerModel).toBe('hybrid');
    expect(lobby.comparability.assigningFloorIds).toEqual(['P1', 'G']);
    expect(lobby.comparability.notComparableMetrics).toEqual(MODEL_SENSITIVE_METRIC_IDS);
    expect(lobby.record.passengerModel).toBe('hybrid');
    expect(lobby.record.assigningFloorIds).toEqual(['P1', 'G']);
    expect(lobby.warnings.some((warning) => warning.includes('§ D553'))).toBe(true);

    const roundTripped = parseRunRecord(JSON.stringify(lobby.record));
    expect(roundTripped.passengerModel).toBe('hybrid');
    expect(roundTripped.assigningFloorIds).toEqual(['P1', 'G']);
  });

  it('runs a panel dispatcher over a building with no panel anywhere as its conventional twin', () => {
    const noPanels = run(
      reauthored('midtown-office', everywhere('midtown-office', 'up-down-buttons')),
      PANEL(),
    );
    const twin = run(shipped('midtown-office'), arm('arm-panel', {}, { rideTime: 1 }));

    expect(trajectory(noPanels)).toBe(trajectory(twin));
    expect(JSON.stringify(noPanels.summary)).toBe(JSON.stringify(twin.summary));
    expect(noPanels.comparability).toStrictEqual(twin.comparability);
    expect(noPanels.record.passengerModel).toBeUndefined();
  });

  it('keeps a disclosure-only run conventional, all twenty-three comparable, however its landings mix', () => {
    const mixed = run(reauthored('midtown-office', panelsOnlyAt('midtown-office', 'G')), DISCLOSURE());
    expect(mixed.comparability.passengerModel).toBe('conventional');
    expect(mixed.comparability.notComparableMetrics).toEqual([]);
    expect(mixed.record.passengerModel).toBeUndefined();
  });

  it('asks the bare kiosk’s refusal at the kiosk landing and at no other', () => {
    const tower = shipped('secure-tower');
    const [entrance] = tower.entranceFloors;
    if (entrance === undefined) throw new Error('secure-tower declares no entrance');

    const readers = run(tower, DISCLOSURE());
    const kioskAtEntrance = run(
      reauthored('secure-tower', { [entrance.id]: 'destination-entry' }),
      DISCLOSURE(),
    );
    const kioskEverywhere = run(tower, arm('arm-kiosk', { callType: 'destination-entry' }, { rideTime: 1 }));

    expect(readers.stageActivity.kioskRefusedLegs).toBe(0);
    expect(kioskAtEntrance.stageActivity.kioskRefusedLegs).toBeGreaterThan(0);
    expect(kioskAtEntrance.stageActivity.kioskRefusedLegs).toBeLessThan(
      kioskEverywhere.stageActivity.kioskRefusedLegs,
    );
    // Against the readers run on the same trace (common random numbers), so the legs every arm
    // leaves unboarded — the access refusals § D266 counts as a fourth outcome — are netted out, and
    // what is left is what the kiosk did.
    const unboarded = (result: SimulationResult): readonly { passengerId: string; originFloorId: string }[] =>
      result.record.passengers.filter((leg) => leg.boardedAt === undefined);
    const alreadyUnboarded = new Set(unboarded(readers).map((leg) => leg.passengerId));
    const strandedByKiosk = unboarded(kioskAtEntrance).filter(
      (leg) => !alreadyUnboarded.has(leg.passengerId),
    );
    expect(strandedByKiosk.length).toBeGreaterThan(0);
    expect(strandedByKiosk.filter((leg) => leg.originFloorId !== entrance.id)).toEqual([]);
  });

  it('refuses a destination-entry landing under a dispatcher that defers, as it refuses the whole run', () => {
    const deferring = config.dispatcherProfilesById.get('predictive-balanced');
    if (deferring === undefined) throw new Error('missing dispatcher fixture "predictive-balanced"');
    expect(deferring.dispatch?.assignmentTiming).toBe('deferred');

    expect(() => run(reauthored('midtown-office', { G: 'destination-entry' }), deferring)).toThrow(
      SimulationError,
    );
    expect(() => run(reauthored('midtown-office', { G: 'destination-entry' }), deferring)).toThrow(
      /landingCallType/,
    );
    // A mobile-credential reader is not a kiosk and is not refused, on policy.ts's own asymmetry.
    expect(run(reauthored('midtown-office', { G: 'mobile-credential' }), deferring).status).toBe(
      'completed',
    );
  });
});
