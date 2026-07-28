/**
 * **What Phase 6a shipped into `data/`, and the one thing it could not.**
 *
 * `destination-eta` is the first profile in `data/dispatcher-profiles.json` to author a
 * `dispatch.callType`, and it is the whole of Phase 6a's implementation: **two authored fields and
 * no code.** The seam was already wired end to end — `costRequestFor` moves the destination and the
 * credential into the `CostRequest`, `estimateCost` authorizes against them, and
 * `Simulation.#callValue` supplies the head-of-queue passenger's destination — and nothing shipped
 * used it, because all ten other profiles run at the `up-down-buttons` default.
 *
 * This suite asserts the shape of that profile through the **real** `loadConfig`, and carries one
 * skipped regression that records exactly what has to change in `packages/core` before the profile
 * can weight the term the phase is about. See `DECISIONS-T15.md` § T15-1 and § T15-2.
 */

import { describe, expect, it } from 'vitest';

import { loadResources } from '../validation/harness.js';

import { ARM_PROFILES, BASELINE_PROFILE } from './arms.js';
import { DISCLOSURE_PROFILE } from './destinationDisclosure.js';

describe('the shipped destination profile', () => {
  it('loads through the real loadConfig and authors a destination call type', async () => {
    const profile = (await loadResources()).dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    expect(profile, `data/dispatcher-profiles.json has no "${DISCLOSURE_PROFILE}"`).toBeDefined();
    expect(profile?.dispatch?.callType).toBe('mobile-credential');
    // `mobile-credential` rather than `destination-entry`, and the reason is measured rather than
    // preferred: `accessControl.test.ts` shows a bare kiosk making `secure-tower` *worse* than
    // conventional dispatch, because `costRequestFor` drops the credential under `destination-entry`
    // and every zoned destination then comes back `destinationAccessDenied`. DECISIONS.md § D30
    // rules that the kiosk should authorize; that is panel-stage work in `core` and Phase 6b's.
  });

  it('is the only profile in the file that authors a call type, and it is an arm of the gate', async () => {
    const config = await loadResources();
    const authoring = [...config.dispatcherProfilesById.values()]
      .filter((profile) => profile.dispatch?.callType !== undefined)
      .map((profile) => profile.id);
    expect(authoring).toEqual([DISCLOSURE_PROFILE]);

    // A profile in `data/` that is neither the baseline nor an arm escapes the Phase 5 table
    // entirely, and `dispatcherBenchmark.test.ts` fails on exactly that. Asserted here too, from the
    // other direction, so the reason is visible at the profile rather than only at the gate.
    expect([BASELINE_PROFILE, ...ARM_PROFILES]).toContain(DISCLOSURE_PROFILE);
    expect([BASELINE_PROFILE, ...ARM_PROFILES].sort()).toEqual(
      [...config.dispatcherProfilesById.keys()].sort(),
    );
  });

  it('weights no term its own stage settings make inert', async () => {
    // The rule `core/src/dispatch/policies/policies.test.ts` enforces over the whole file, asserted
    // here for the one profile this phase added so the reason it holds is legible: the profile
    // weights `waitTime` only, and `waitTime` declares no `activeWhen`.
    const profile = (await loadResources()).dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    expect(Object.keys(profile?.weights ?? {})).toEqual(['waitTime']);
  });

  /**
   * **The promotion this phase could not make, recorded rather than forgotten.**
   *
   * `destination-eta` *should* weight `rideTime` — that weight is worth −1.562 s of
   * time-to-destination at the primary operating point, measured at n = 150 in
   * `destinationDisclosure.test.ts` on a derived arm that differs from the shipped profile in that
   * one field and nothing else. It cannot ship, for a reason that is entirely inside
   * `packages/core` and entirely inside a test fixture:
   *
   * `core/src/dispatch/policies/policies.test.ts`'s *"has no weight that contributes nothing"*
   * scores every shipped profile over `contributionScenarios()`, whose three calls come from
   * `fixtures.test-helper.ts`'s `call()` and carry **no `destinationFloorId`**. `costRequestFor`
   * therefore forwards no destination, and `rideTime` — the only term in the library with an
   * `activeWhen` — returns 0 for every car in every scenario *by construction*. Adding the weight
   * fails that assertion with `{ 'destination-eta': ['rideTime'] }`, which is a fixture gap and not
   * a defect in the profile: the **next test in the same file** proves the term is live by spreading
   * `{ destinationFloorId: '19', destinationFloorIndex: 19 }` onto the very same scenario.
   *
   * Unskip this the moment those scenarios carry a destination, and move the weight into
   * `data/dispatcher-profiles.json` in the same commit. `packages/core/**` is not this task's to
   * edit, so the fix is handed back rather than made — see `DECISIONS-T15.md` § T15-2.
   */
  it.skip('weights rideTime — BLOCKED on core/dispatch/policies fixtures carrying a destination', async () => {
    const profile = (await loadResources()).dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    expect(profile?.weights.rideTime).toBeGreaterThan(0);
  });
});
