/**
 * § 10.3's compatibility check, and the figure it rests on — **measured, not quoted**.
 *
 * `docs/10` § 2.8 asserts *"of the 12 shipped dispatcher profiles, exactly two
 * (`destination-eta`, `destination-panel`) declare a credential-carrying `dispatch.callType`."*
 * That is prose. The first suite below re-derives it from `data/dispatcher-profiles.json`
 * through `core`'s own `callCarriesCredential`, so the number in this repository's documents is
 * pinned to the code that produces it rather than to a sentence somebody typed.
 *
 * The second suite is `docs/10` § 11 **W8**'s stated liveness evidence, verbatim: *"the
 * warning's test asserts the count of credential-aware shipped profiles is derived from
 * `data/dispatcher-profiles.json` rather than hard-coded, so adding a third profile changes the
 * message."*
 */

import { loadConfig, type DispatcherProfile, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  checkAccessCompatibility,
  credentialAwareProfileIds,
  credentialCapabilityOf,
} from './dispatcherCredentials.js';

let config: LoadedConfig;
let profiles: readonly DispatcherProfile[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  profiles = [...config.dispatcherProfilesById.values()];
}, 120_000);

function secureTowerInput(profileId: string): Parameters<typeof checkAccessCompatibility>[0] {
  const building = config.buildingsById.get('secure-tower');
  const profile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined || profile === undefined) {
    throw new Error(`missing secure-tower or ${profileId} in data/`);
  }
  return {
    buildingName: building.name,
    floorIds: building.floors.map((floor) => floor.id),
    accessZones: building.accessZones,
    profile,
    profiles,
  };
}

describe('which shipped profiles can read a credential — measured', () => {
  it('is exactly the two `docs/10` § 2.8 names, and the rest read nothing', () => {
    const aware = credentialAwareProfileIds(profiles);
    expect(aware).toEqual(['destination-eta', 'destination-panel']);
    // The denominator too, so *"eleven of thirteen"* is a derived statement here rather than a
    // claim. 10 → 11 with `collective-enroute` (`DECISIONS.md` § D205), which reads no credential:
    // it is `collective` plus an eligibility setting, and eligibility is not a call type.
    expect(profiles.length - aware.length).toBe(11);
  });

  it('reads it through the call type, not through a list of profile names', () => {
    for (const profile of profiles) {
      const capability = credentialCapabilityOf(profile);
      expect(capability.carriesCredential).toBe(
        capability.callType === 'mobile-credential' || capability.hasPanel,
      );
      expect(capability.reason).toContain(capability.callType);
    }
  });

  it('classifies no shipped profile as a bare kiosk', () => {
    // The measured-worst case (`DECISIONS.md` § D137: 100 % unserved on Secure Tower) is
    // reachable by an authored profile and by none that ships. Asserted so that a profile
    // arriving in `data/` with `destination-entry` and no panel is a visible diff here.
    expect(profiles.filter((profile) => credentialCapabilityOf(profile).isBareKiosk)).toEqual([]);
  });
});

describe('Secure Tower, before Run', () => {
  it('warns for a conventional profile, naming the floors and why', () => {
    const result = checkAccessCompatibility(secureTowerInput('nearest-car'));
    const warning = result.warning ?? '';
    expect(warning).not.toBe('');
    expect(warning).toContain('Secure Tower has 5 access zones covering 29 of its 30 floors');
    expect(warning).toContain('nearest-car does not read credentials');
    expect(warning).toContain('up-down-buttons');
    expect(warning).toContain('permanently unassignable');
    // Named, in building order, as one run — every affected floor and no reader asked to parse
    // 29 comma-separated ids. The count is stated separately, so nothing is hidden.
    expect(warning).toContain('(2–30)');
    expect(warning).toContain('29 of its 30 floors');
    expect(result.restrictedFloorIds).toHaveLength(29);
  });

  it('names the alternatives, and the count comes from the profile list', () => {
    const warning = checkAccessCompatibility(secureTowerInput('nearest-car')).warning ?? '';
    expect(warning).toContain('2 of the 13 dispatchers loaded here do read a credential');
    expect(warning).toContain('destination-eta, destination-panel');
  });

  it('states a fact rather than a verdict, and leaves Run alone', () => {
    const warning = checkAccessCompatibility(secureTowerInput('nearest-car')).warning ?? '';
    expect(warning).toContain('This states what the run will do; Run stays enabled.');
    for (const verdict of ['wrong', 'should', 'recommend', 'better', 'worse than', 'instead of']) {
      expect(warning.toLowerCase()).not.toContain(verdict);
    }
    // `CLAUDE.md`: a published number is pinned to the run that produced it. This message fires
    // on any building under any credential-blind profile, so it carries no percentage at all.
    expect(warning).not.toMatch(/\d+(\.\d+)?\s?%/);
  });

  it('is silent for a credential-aware profile', () => {
    for (const id of ['destination-eta', 'destination-panel']) {
      const result = checkAccessCompatibility(secureTowerInput(id));
      expect(result.warning, id).toBeUndefined();
      expect(result.capability.carriesCredential, id).toBe(true);
      // The floors are still reported: the check knows they are restricted and says nothing
      // about them, which is different from not having looked.
      expect(result.restrictedFloorIds, id).toHaveLength(29);
    }
  });

  it('is silent on every shipped building that declares no access zone', () => {
    const unzoned = [...config.buildingsById.values()].filter(
      (building) => building.accessZones.length === 0,
    );
    expect(unzoned.length).toBeGreaterThan(0);
    for (const building of unzoned) {
      const profile = config.dispatcherProfilesById.get('nearest-car');
      if (profile === undefined) throw new Error('nearest-car is missing');
      const result = checkAccessCompatibility({
        buildingName: building.name,
        floorIds: building.floors.map((floor) => floor.id),
        accessZones: building.accessZones,
        profile,
        profiles,
      });
      expect(result.warning, building.id).toBeUndefined();
    }
  });
});

describe('the message is derived from the profile list — W8’s liveness evidence', () => {
  it('changes when a fourteenth, credential-aware profile is added', () => {
    const before = checkAccessCompatibility(secureTowerInput('nearest-car')).warning ?? '';
    const extra: DispatcherProfile = {
      id: 'badge-reader',
      name: 'Badge reader',
      weights: { waitTime: 1 },
      dispatch: { callType: 'mobile-credential' },
    } as DispatcherProfile;
    const after =
      checkAccessCompatibility({
        ...secureTowerInput('nearest-car'),
        profiles: [...profiles, extra],
      }).warning ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain('3 of the 14 dispatchers loaded here do read a credential');
    expect(after).toContain('badge-reader');
  });

  it('says so plainly when nothing in the list can read a credential', () => {
    const blind = profiles.filter((profile) => !credentialCapabilityOf(profile).carriesCredential);
    const warning =
      checkAccessCompatibility({ ...secureTowerInput('nearest-car'), profiles: blind }).warning ?? '';
    expect(warning).toContain('no dispatcher that can serve those floors');
  });
});

describe('the bare kiosk gets its own sentence', () => {
  it('names the disclosed destination with nothing to authorize it', () => {
    const kiosk = {
      id: 'kiosk',
      name: 'Bare kiosk',
      weights: { waitTime: 1 },
      dispatch: { callType: 'destination-entry' },
    } as DispatcherProfile;
    const capability = credentialCapabilityOf(kiosk);
    expect(capability.isBareKiosk).toBe(true);
    expect(capability.carriesCredential).toBe(false);
    const warning =
      checkAccessCompatibility({ ...secureTowerInput('nearest-car'), profile: kiosk }).warning ?? '';
    expect(warning).toContain('without a landing panel');
    expect(warning).toContain('§ D137');
  });

  it('does not attach that sentence to an ordinary conventional profile', () => {
    const warning = checkAccessCompatibility(secureTowerInput('collective')).warning ?? '';
    expect(warning).not.toContain('without a landing panel');
  });
});

describe('a profile the engine refuses', () => {
  it('claims no credential awareness and reports the refusal as its reason', () => {
    const broken = {
      id: 'typo',
      name: 'Typo',
      weights: { waitTiem: 1 },
    } as unknown as DispatcherProfile;
    const capability = credentialCapabilityOf(broken);
    expect(capability.carriesCredential).toBe(false);
    expect(capability.reason).toContain('this engine refuses the profile');
  });
});
