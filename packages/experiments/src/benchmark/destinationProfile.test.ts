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
 * This suite asserts the shape of that profile through the **real** `loadConfig`. It **carried** a
 * skipped regression naming the one-line `packages/core` fixture fix that stood between the file
 * and a shipped `rideTime` weight; T16 made that fix, Phase 6b ships the weight, and the test is
 * un-skipped below — against `destination-panel` rather than against `destination-eta`, for a
 * reason that is a published result rather than a preference. See `the root DECISIONS.md` § T15-1 and
 * § T15-2, and `the root DECISIONS.md` § T18-D4.
 */

import { describe, expect, it } from 'vitest';

import { loadResources } from '../validation/harness.js';

import { ARM_PROFILES, BASELINE_PROFILE, DESTINATION_DISPATCH_PROFILE } from './arms.js';
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

  it('is one of the two profiles that author a call type, and both are arms of the gate', async () => {
    const config = await loadResources();
    const authoring = [...config.dispatcherProfilesById.values()]
      .filter((profile) => profile.dispatch?.callType !== undefined)
      .map((profile) => profile.id);
    // Two, in file order, since Phase 6b: Level 0 (disclosure) and Level 1 (the landing panel).
    // They are different systems — docs/09 § 1.1 — and only the second sets
    // `passengerAssignment`, which is what the assertion below discriminates on.
    expect(authoring).toEqual([DISCLOSURE_PROFILE, DESTINATION_DISPATCH_PROFILE]);
    expect(
      config.dispatcherProfilesById.get(DISCLOSURE_PROFILE)?.dispatch?.passengerAssignment,
    ).toBeUndefined();
    expect(
      config.dispatcherProfilesById.get(DESTINATION_DISPATCH_PROFILE)?.dispatch
        ?.passengerAssignment,
    ).toBe('panel');
    expect([BASELINE_PROFILE, ...ARM_PROFILES]).toContain(DESTINATION_DISPATCH_PROFILE);

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
   * **C26 is closed, and the promotion it blocked is made — on the profile it belongs on.**
   *
   * Phase 6a left this test skipped with a one-line fix named: `contributionScenarios()` in
   * `core/src/dispatch/policies/policies.test.ts` built its call from a fixture carrying no
   * `destinationFloorId`, so `rideTime` — the only term in the library with an `activeWhen` —
   * returned 0 for every car in every scenario *by construction*, and the *"has no weight that
   * contributes nothing"* assertion failed any shipped profile that weighted it. T16 fixed the
   * fixture (`the root DECISIONS.md` § T16-D8), so a shipped `rideTime` weight is now
   * possible, and Phase 6b ships one.
   *
   * **It is not `destination-eta`, and that is the part worth reading before trusting the
   * assertion.** The skipped test named `DISCLOSURE_PROFILE`, and moving the weight there would
   * have deleted a published result rather than fixed a fixture note:
   * `destinationDisclosure.test.ts` asserts the shipped Level-0 profile is `IDENTICAL` to `eta`
   * on all four metrics at n = 150, and *that* is the decomposition which attributes Phase 6a's
   * −1.562 s to the weight rather than to the call type. A `destination-eta` that priced ride
   * time would be its own treatment arm, the control would be gone, and twelve pinned estimates
   * would move to make a fixture comment come true.
   *
   * So the claim is asserted where it is true and the exclusion is asserted beside it, which is
   * strictly more than the skipped version checked: **some** shipped profile weights the gated
   * term (C26 is really closed), and the decomposition arm still weights nothing else.
   */
  it('ships a profile that weights rideTime — C26 closed', async () => {
    const config = await loadResources();
    const priced = config.dispatcherProfilesById.get(DESTINATION_DISPATCH_PROFILE);
    expect(priced, `data/dispatcher-profiles.json has no "${DESTINATION_DISPATCH_PROFILE}"`)
      .toBeDefined();
    expect(priced?.weights.rideTime).toBeGreaterThan(0);
    // The term is gated on a destination call type; a profile weighting it without one is the
    // dead-weight shape `predictive-balanced` shipped and `policies.test.ts` now rejects.
    expect(priced?.dispatch?.callType).toBe('mobile-credential');

    // The Phase 6a decomposition arm is deliberately left unpriced. See the docstring.
    const disclosure = config.dispatcherProfilesById.get(DISCLOSURE_PROFILE);
    expect(Object.keys(disclosure?.weights ?? {})).toEqual(['waitTime']);
  });

});
