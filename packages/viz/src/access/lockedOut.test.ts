/**
 * *Nobody came* against *nobody may come*, on the building it actually happens on.
 *
 * `docs/10` § 11 **W7**'s acceptance (b), verbatim: *"on Secure Tower under `nearest-car`, a
 * locked-out call is drawn as locked out and not as a long wait; the same run under
 * `destination-eta` shows none."* Both halves are here, against real recordings of the shipped
 * building at a pinned seed, because a fixture recording would prove that a fixture recording
 * classifies.
 *
 * The synthetic suites below cover the two things a real run cannot be made to produce on
 * demand: an unbadged rider on a restricted floor, and a caller that does not know the access
 * zoning.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { credentialCapabilityOf } from './dispatcherCredentials.js';
import { LOCKOUT_CAUSES, describeLockedOut, lockedOutLandingsAt } from './lockedOut.js';
import { restrictedFloorIds } from './zoning.js';

const SEED = 20_260_729n;

let config: LoadedConfig;
let restricted: readonly string[];
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const building = config.buildingsById.get('secure-tower');
  if (building === undefined) throw new Error('secure-tower is missing from data/');
  restricted = restrictedFloorIds(
    building.floors.map((floor) => floor.id),
    building.accessZones,
  );
  for (const dispatcherId of ['nearest-car', 'destination-eta']) {
    recordings.set(
      dispatcherId,
      recordRun(breadthConfig(config, 'secure-tower', { dispatcherId, seed: SEED })).recording,
    );
  }
}, 240_000);

function recordingFor(dispatcherId: string): VizRecording {
  const recording = recordings.get(dispatcherId);
  if (recording === undefined) throw new Error(`no recording for ${dispatcherId}`);
  return recording;
}

function carries(dispatcherId: string): boolean {
  const profile = config.dispatcherProfilesById.get(dispatcherId);
  if (profile === undefined) throw new Error(`${dispatcherId} is missing from data/`);
  return credentialCapabilityOf(profile).carriesCredential;
}

describe('the recording carries the credential at all', () => {
  it('puts a credential on every Secure Tower leg whose route crosses a zone', () => {
    const legs = recordingFor('nearest-car').legs;
    expect(legs.length).toBeGreaterThan(50);
    const withCredential = legs.filter((leg) => leg.credentialGroup !== undefined);
    expect(withCredential.length).toBeGreaterThan(0);
    // Every credential on a leg is one the building actually grants somewhere.
    const known = new Set(
      (config.buildingsById.get('secure-tower')?.accessZones ?? []).flatMap(
        (zone) => zone.credentialGroups,
      ),
    );
    for (const leg of withCredential) expect(known.has(leg.credentialGroup ?? '')).toBe(true);
  });

  /*
   * The **recorder's** liveness, which the renderer suites cannot see.
   *
   * § D154: *"a recorder writing a plausible constant satisfies every renderer test and describes
   * a different run."* So the copy is compared passenger by passenger against the record it came
   * from, and the distinct-value count is asserted — a frozen constant passes the first check on
   * a building where everybody happens to hold the same badge, and Secure Tower is not that
   * building.
   */
  it('copies the credential per passenger, so a constant would not do', () => {
    const { recording, result } = recordRun(
      breadthConfig(config, 'secure-tower', { dispatcherId: 'nearest-car', seed: SEED }),
    );
    const expected = new Map(
      result.record.passengers.map((passenger) => [passenger.passengerId, passenger.credentialGroup]),
    );
    for (const leg of recording.legs) {
      expect(leg.credentialGroup, leg.passengerId).toBe(expected.get(leg.passengerId));
    }
    const distinct = new Set(recording.legs.map((leg) => leg.credentialGroup));
    expect(distinct.size).toBeGreaterThan(2);
  });

  it('carries none on a building with no access zones', () => {
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments', { seed: SEED }));
    expect(recording.legs.some((leg) => leg.credentialGroup !== undefined)).toBe(false);
  });
});

describe('Secure Tower under `nearest-car`', () => {
  it('finds locked-out landings, and says the dispatcher cannot read the credential', () => {
    const recording = recordingFor('nearest-car');
    const landings = lockedOutLandingsAt({
      recording,
      at: recording.endedAt,
      restrictedFloorIds: restricted,
      carriesCredential: carries('nearest-car'),
    });
    expect(landings.length).toBeGreaterThan(0);
    for (const landing of landings) {
      expect(restricted).toContain(landing.floorId);
      expect(landing.cause).toBe('credential-not-read');
      expect(landing.credentialGroups.length).toBeGreaterThan(0);
      expect(landing.legCount).toBeGreaterThan(0);
    }
    const sentence = describeLockedOut(landings);
    expect(sentence).toContain('locked out');
    expect(sentence).toContain('no car may legally answer');
    expect(sentence).toContain('this dispatcher does not read');
    // Which credential — the whole content of § 10.4's *"why"*.
    expect(sentence).toMatch(/tenant-[a-z]+-staff|facilities|security|exec/);
  });

  it('orders the landings by the building’s own floor order', () => {
    const recording = recordingFor('nearest-car');
    const landings = lockedOutLandingsAt({
      recording,
      at: recording.endedAt,
      restrictedFloorIds: restricted,
      carriesCredential: false,
    });
    const order = recording.floors.map((floor) => floor.id);
    const positions = landings.map((landing) => order.indexOf(landing.floorId));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('claims nothing at the start of the run, when nobody has called yet', () => {
    const recording = recordingFor('nearest-car');
    expect(
      lockedOutLandingsAt({
        recording,
        at: recording.startedAt,
        restrictedFloorIds: restricted,
        carriesCredential: false,
      }),
    ).toEqual([]);
  });
});

describe('the same building under `destination-eta`', () => {
  it('shows none, because the credential reaches the cars', () => {
    const recording = recordingFor('destination-eta');
    expect(carries('destination-eta')).toBe(true);
    expect(
      lockedOutLandingsAt({
        recording,
        at: recording.endedAt,
        restrictedFloorIds: restricted,
        carriesCredential: true,
      }),
    ).toEqual([]);
    expect(describeLockedOut([])).toBe('');
  });
});

describe('a caller that does not know the zoning', () => {
  it('claims nothing rather than inferring it', () => {
    const recording = recordingFor('nearest-car');
    expect(
      lockedOutLandingsAt({
        recording,
        at: recording.endedAt,
        restrictedFloorIds: [],
        carriesCredential: false,
      }),
    ).toEqual([]);
  });
});

describe('an unbadged rider on a restricted floor', () => {
  const leg = (overrides: Partial<VizLeg>): VizLeg => ({
    passengerId: 'p1',
    originFloorId: '2',
    destinationFloorId: 'G',
    direction: 'down',
    arrivedAt: 10,
    ...overrides,
  });

  function withLegs(legs: readonly VizLeg[]): VizRecording {
    const base = recordingFor('nearest-car');
    return { ...base, legs };
  }

  it('is a different cause from a credential the dispatcher cannot read', () => {
    const landings = lockedOutLandingsAt({
      recording: withLegs([leg({})]),
      at: 100,
      restrictedFloorIds: restricted,
      carriesCredential: false,
    });
    expect(landings).toHaveLength(1);
    expect(landings[0]?.cause).toBe('rider-has-no-credential');
    expect(landings[0]?.credentialGroups).toEqual([]);
    expect(LOCKOUT_CAUSES).toContain(landings[0]?.cause);
  });

  it('is still locked out under a dispatcher that *does* read credentials', () => {
    // The row of § 10.4's table that no dispatcher fixes. Advising this reader to switch to
    // `destination-eta` would be advice that does not work, which is why the cause is separate.
    const landings = lockedOutLandingsAt({
      recording: withLegs([leg({})]),
      at: 100,
      restrictedFloorIds: restricted,
      carriesCredential: true,
    });
    expect(landings).toHaveLength(1);
    expect(describeLockedOut(landings)).toContain('no dispatcher can serve them');
  });

  it('is not reported once a car has served them', () => {
    const served = leg({ boardedAt: 40, carId: 'low-A', bankId: 'low' });
    expect(
      lockedOutLandingsAt({
        recording: withLegs([served]),
        at: 100,
        restrictedFloorIds: restricted,
        carriesCredential: false,
      }),
    ).toEqual([]);
  });

  it('is not reported before they arrive', () => {
    expect(
      lockedOutLandingsAt({
        recording: withLegs([leg({ arrivedAt: 500 })]),
        at: 100,
        restrictedFloorIds: restricted,
        carriesCredential: false,
      }),
    ).toEqual([]);
  });

  it('is not reported at an unrestricted origin', () => {
    expect(
      lockedOutLandingsAt({
        recording: withLegs([leg({ originFloorId: 'G', destinationFloorId: '2', direction: 'up' })]),
        at: 100,
        restrictedFloorIds: restricted,
        carriesCredential: false,
      }),
    ).toEqual([]);
  });
});
