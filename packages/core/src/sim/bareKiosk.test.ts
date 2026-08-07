/**
 * **The bare kiosk refuses a passenger, not a queue** (`C35`, DECISIONS.md § T50-D1).
 *
 * `dispatch.callType: 'destination-entry'` with no landing panel is the middle rung of the
 * information ladder: the call discloses where the head of the landing queue is going and carries
 * nothing to identify them with. `costRequestFor` forwards the destination and drops the
 * credential, so `infeasibilityOf` step 4 asks *"may an unbadged passenger reach that floor?"* and
 * answers `destinationAccessDenied` for **every car in the building**.
 *
 * That refusal is correct and is the configuration's whole measured cost — it is the premise
 * DECISIONS.md § D30 rules on, and `benchmark/accessControl.ts` ships it as `BARE_KIOSK_ARM`.
 * Nothing here removes it.
 *
 * What it used to take with it was **the rest of the queue**. The refusal reached the system only
 * through the call value: `#callValue` took the head of the landing queue, disclosed their
 * restricted destination, and the whole call was refused — so every passenger standing behind
 * them was stranded too, including passengers whose journey touches no access zone at all. The
 * fuzz corpus found it on `fuzz-145`, where one credentialed passenger at the head of floor 7's
 * down queue stranded **eight** people bound for unrestricted floors and idled a one-car fleet for
 * 790.9 s; the same case under either of the ladder's other two rungs completes.
 *
 * `fuzz/corpus.test.ts` proves it happens. This file pins **what it is**, and the two assertions
 * that carry the fix are:
 *
 * 1. under the bare kiosk, **every undelivered leg is bound for the restricted floor** — the
 *    collateral is gone and the refusal is not;
 * 2. under `up-down-buttons` and `mobile-credential`, on the same building and the same seed,
 *    the mechanism does **not** fire at all. That control is what stops the fix becoming a
 *    general re-eligibility mechanism, and it is § T22-D1's `promisesRevoked === 0` control in
 *    the same role.
 *
 * The fixture is modelled on `fuzz-145`'s shrunk counterexample — one bank, one car, one access
 * zone over one populated floor — because a single car is what makes the outcome attributable:
 * there is no second car whose scheduling could have collected the queue by luck.
 *
 * **Measured on this fixture, with the three clauses of the fix removed and nothing else changed:**
 * `destination-entry` leaves **51** legs undelivered, **39** of them on journeys that touch no
 * access zone at all, against `up-down-buttons`' 4 and `mobile-credential`'s 0. With the fix:
 * **27** undelivered, **0** of them collateral, 15 of them refused by the kiosk for their own
 * destination and the rest standing on the restricted floor itself.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { CallType, DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_728;

/** The one floor an access zone covers. Everything else in the fixture is unrestricted. */
const RESTRICTED_FLOOR = '4';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/**
 * Five floors, one bank, **one** car, one access zone over floor 4.
 *
 * Populated on every floor and run at an interfloor-heavy mix, so landings genuinely queue and a
 * passenger bound for floor 4 genuinely arrives at the head of a queue behind which other people
 * are standing. That coincidence is the whole defect, and a fixture that never produced it would
 * assert nothing.
 */
function kioskBuilding(zoned = true): ResolvedBuilding {
  const id = zoned ? 'kiosk-walkup' : 'kiosk-walkup-open';
  const authored = {
    id,
    name: 'Kiosk walkup',
    type: 'mixed-use',
    trafficProfile: 'residential',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 3.5, population: 100 },
      { id: '3', index: 3, heightM: 7, population: 100 },
      { id: RESTRICTED_FLOOR, index: 4, heightM: 10.5, population: 40 },
      { id: '5', index: 5, heightM: 14, population: 100 },
    ],
    totalPopulation: 340,
    banks: [
      {
        id: 'main',
        servesFloors: ['G', '2', '3', RESTRICTED_FLOOR, '5'],
        cars: [
          {
            id: 'main-1',
            spec: 'gearless-traction',
            ratedSpeedMps: 2.5,
            ratedLoadLb: 1600,
            doorType: 'sideOpening',
            passengerTransferS: 1.75,
          },
        ],
      },
    ],
    accessZones: zoned
      ? [{ id: 'zone-1', floors: [RESTRICTED_FLOOR], credentialGroups: ['grp-1'] }]
      : [],
  };
  return resolveBuilding(parseBuilding(authored, `${id}.json`), config.elevatorSpecs, {
    file: `${id}.json`,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/** Every leg that had not reached its destination when the run stopped, by leg id. */
function undeliveredLegIds(result: SimulationResult): ReadonlySet<string> {
  return new Set(result.undelivered.map((journey) => journey.legId));
}

/** `eta` with one field moved: the call type. Config and nothing else (invariant 7). */
function armProfile(callType: CallType): DispatcherProfile {
  const base = config.dispatcherProfilesById.get('eta');
  if (base === undefined) throw new Error('missing dispatcher fixture "eta"');
  return { ...base, id: `arm-${callType}`, name: callType, dispatch: { ...base.dispatch, callType } };
}

function run(callType: CallType, overrides: Partial<SimulationConfig> = {}): SimulationResult {
  return runSimulation({
    building: kioskBuilding(),
    dispatcherProfile: armProfile(callType),
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    durationS: 1200,
    reportWindow: 'full-run',
    demand: {
      // Interfloor-dominated and with no lobby arrivals at all, which is what makes the fixture
      // reproduce rather than merely configure the defect: a landing call opened at an *upper*
      // floor is the only way a refused head can have a queue behind them. Lobby traffic hides
      // the whole mechanism, because the one car parks at the lobby and `#loadWhileIdle` boards
      // whoever is standing there without asking the group anything at all.
      directionalSplit: { incoming: 0, outgoing: 0.3, interfloor: 0.7 },
      arrivalRatePctPop5min: 12,
      peakWindowS: 300,
      credentialAssignment: 'permitted-first',
    },
    ...overrides,
  });
}

/* -------------------------------------------------------------------------- *
 * 1. The refusal survives, and stops being collateral
 * -------------------------------------------------------------------------- */

describe('a destination kiosk with no credential refuses a passenger, not a queue', () => {
  it('strands nobody whose journey touches no access zone', () => {
    const bare = run('destination-entry');

    // The mechanism fired at all. Without this every assertion below is vacuous.
    expect(bare.stageActivity.kioskRefusedLegs, 'the bare kiosk refused nobody').toBeGreaterThan(0);

    /*
     * **The assertion that carries the fix**, in DECISIONS.md § D128's own words: nobody *"whose
     * own journey touches no restricted floor at all"* is left behind. Eight of the nine in
     * `fuzz-145`'s shrunk queue were exactly that.
     *
     * A leg that *starts* on the restricted floor is excluded on purpose and is not collateral of
     * anything this fix touches: `infeasibilityOf` step 3 refuses an access-restricted **pickup**
     * for want of a credential under `up-down-buttons` too — see `#markUnservable`, which calls it
     * the overwhelmingly common cause — so those landings are locked out on both credential-less
     * rungs of the ladder alike. Whether an idle car happens to be standing there and loads them
     * anyway is scheduling luck, and pinning it would pin the luck.
     */
    const collateral = bare.undelivered.filter(
      (journey) =>
        journey.originFloorId !== RESTRICTED_FLOOR &&
        journey.destinationFloorId !== RESTRICTED_FLOOR,
    );
    expect(
      collateral.map(
        (journey) =>
          `${journey.legId}: ${journey.originFloorId}\u2192${journey.destinationFloorId}`,
      ),
      'a journey touching no access zone was stranded behind a refused one',
    ).toEqual([]);

    // Refused, not dropped and not carried: every one of them is *named*, standing where they
    // started, and the books balance. A fix that lost a passenger fails here rather than in a mean.
    expect(bare.undelivered.length).toBeGreaterThan(0);
    for (const journey of bare.undelivered) {
      expect(journey.reason, journey.legId).toBe('waiting');
      expect(journey.boardedAt, journey.legId).toBeUndefined();
      expect(journey.carId, journey.legId).toBeUndefined();
    }
    expect(bare.conservation.balanced).toBe(true);
    // `accessRefused` is the credential gap's own terminus (§ D266), and it is added rather than
    // the equality relaxed: this building declares zones, so a few riders are turned away for a
    // badge before the kiosk is ever consulted, and they are a different refusal with a different
    // fix. Both are accounted for; neither is tolerated as a shortfall.
    expect(
      bare.conservation.delivered +
        bare.conservation.undelivered +
        (bare.conservation.accessRefused ?? 0),
    ).toBe(bare.conservation.generated);

    // And the run says so out loud rather than leaving a row in `undelivered` that reads as
    // ordinary overflow.
    expect(
      bare.warnings.some((warning) => warning.includes('refused by the destination kiosk')),
      'the run does not name the kiosk refusal',
    ).toBe(true);
  });

  it('is the call type that refuses them, not the building', () => {
    // The comparison `fuzz-145` is a counterexample *of*: same building, same seed, same trace,
    // one field moved. Every leg the bare kiosk turns away is carried by the rung above it, so
    // the refusal is a property of what the call discloses and not of what the fabric allows.
    const credentialed = run('mobile-credential');
    const bare = run('destination-entry');

    const stillStranded = undeliveredLegIds(credentialed);
    const refused = bare.undelivered.filter(
      (journey) => journey.destinationFloorId === RESTRICTED_FLOOR,
    );
    expect(refused.length, 'no leg was refused for its destination').toBeGreaterThan(0);
    for (const journey of refused) {
      expect(stillStranded.has(journey.legId), journey.legId).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2. The control — the mechanism must not fire anywhere else
 * -------------------------------------------------------------------------- */

describe('the refusal is a fact about the call type and the floor, and nothing else', () => {
  it('never fires under a call type that carries a credential or discloses no destination', () => {
    // § T22-D1's control, in the same role: the guard that keeps a narrow rule narrow is a run in
    // which it must *not* fire. Both of these buildings have the same access zone.
    for (const callType of ['up-down-buttons', 'mobile-credential'] as const) {
      const result = run(callType);
      expect(result.stageActivity.kioskRefusedLegs, callType).toBe(0);
      expect(
        result.warnings.some((warning) => warning.includes('refused by the destination kiosk')),
        callType,
      ).toBe(false);
    }
  });

  it('never fires on a building with no access zone, under any rung of the ladder', () => {
    // The other half of the gate: the zone, not the call type, is what makes the question bite.
    const bare = run('destination-entry', { building: kioskBuilding(false) });
    const conventional = run('up-down-buttons', { building: kioskBuilding(false) });
    expect(bare.stageActivity.kioskRefusedLegs).toBe(0);
    expect(
      bare.warnings.some((warning) => warning.includes('refused by the destination kiosk')),
    ).toBe(false);
    expect([...undeliveredLegIds(bare)]).toEqual([...undeliveredLegIds(conventional)]);
  });
});
