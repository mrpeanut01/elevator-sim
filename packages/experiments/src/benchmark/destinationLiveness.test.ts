/**
 * **The liveness proof for everything Phase 6a ships, and it is a count rather than a diff.**
 *
 * `docs/09` § 8 R6-1 names this phase's most likely dead seam: *a destination profile lands in
 * `data/` and changes nothing.* The reason a trajectory difference cannot rule it out is measured in
 * `destinationDisclosure.test.ts` — the shipped profile is **bit-identical to `eta` on Midtown
 * Office**, on Garden Apartments and at both up-peak points, and that is correct rather than broken.
 * So the evidence here is the one the contract asks for: how often each gated behaviour actually
 * evaluated, how often it produced a non-zero value, and how often it produced a **different** value
 * for different candidate cars inside one decision.
 *
 * Measured through `runSimulation` at the study's own operating points, seed 20260726:
 *
 * | configuration | `rideTime` non-zero | cross-car spread | eligibility |
 * |---|---|---|---|
 * | `destination-eta` + `rideTime 1`, `mobile-credential`, Midtown | **248 / 248** | **12 / 62 decisions** | — |
 * | the same weights at `up-down-buttons`, Midtown | **0 / 248** | **0 / 62 decisions** | — |
 * | shipped `destination-eta`, `mobile-credential`, Secure Tower | — | — | **0** refusals, **0** decisions wholly refused |
 * | the same profile at `up-down-buttons`, Secure Tower | — | — | **921** `accessDenied` refusals, **307 / 331** decisions wholly refused |
 *
 * Both gates are flat on their off side and live on their on side, which is the proof obligation
 * docs/09 § 8 R6-2 puts on the author rather than the reviewer.
 *
 * ## Why 12 of 62 is the right number to look at, and why it is not small
 *
 * `rideTime` is the seconds a passenger spends aboard **from the pickup**, and the term's own
 * docstring is explicit that in-car seconds are a property of the journey rather than of how the car
 * got there. So two candidate cars price an identical ride whenever neither has a committed stop
 * between the pickup and the destination — which at a quiet moment is most of them. The term can
 * only move an `argmin` in the decisions where the cars' outstanding stops differ, and it moves it in
 * 19 % of them. That is what a 1.562 s time-to-destination effect is made of, and a design that
 * demanded spread in *every* decision would be demanding that the term price something it has said
 * it does not.
 *
 * ## The shipped profile's liveness is categorical, not a spread, and forcing one shape would lie
 *
 * `destination-eta` weights no gated term. What its `callType` moves is the **eligibility filter**:
 * the credential reaches `estimateCost`, and cars stop refusing the call. The live direction is
 * therefore *fewer* refusals — and the refusals it removes are bank-wide, every car saying no to the
 * same call, which is why removing them turns 307 unassignable decisions per run into none and an
 * unservable building into a served one. That is H-ACCESS-1 one level down, in the filter that
 * causes it.
 */

import { describe, expect, it } from 'vitest';

import {
  formatDestinationLiveness,
  measureDestinationLiveness,
  type DestinationLiveness,
} from './destinationLiveness.js';

const TIMEOUT_MS = 300_000;

let cached: readonly DestinationLiveness[] | undefined;

async function liveness(): Promise<readonly DestinationLiveness[]> {
  cached ??= await measureDestinationLiveness();
  return cached;
}

function at(rows: readonly DestinationLiveness[], profileId: string): DestinationLiveness {
  const found = rows.find((row) => row.profileId === profileId);
  if (found === undefined) throw new Error(`no liveness row for "${profileId}"`);
  return found;
}

describe('Phase 6a liveness — counted through the shipped engine', () => {
  it('prints every count, on both sides of both gates', async () => {
    console.log(formatDestinationLiveness(await liveness()));
  }, TIMEOUT_MS);

  it('prices the ride on every evaluation, and differently for different cars', async () => {
    const row = at(await liveness(), 'liveness-priced');
    expect(row.callType).toBe('mobile-credential');
    expect(row.weightsRideTime).toBe(1);

    // Evaluated at all.
    expect(row.ridePricing.evaluations).toBeGreaterThan(0);
    // Non-zero on essentially all of them — docs/09 unit A1 asks for > 90 %.
    expect(row.ridePricing.nonZero / row.ridePricing.evaluations).toBeGreaterThan(0.9);
    // And the load-bearing one: a term that returns the same number for every candidate is a
    // constant added to every cost, and a constant cannot move an argmin.
    expect(row.ridePricing.decisionsWithSpread).toBeGreaterThan(0);
    console.log(
      `rideTime: ${row.ridePricing.nonZero}/${row.ridePricing.evaluations} non-zero, ` +
        `cross-car spread in ${row.ridePricing.decisionsWithSpread}/${row.ridePricing.decisions} decisions`,
    );
  }, TIMEOUT_MS);

  it('leaves the same weights completely inert on the gate’s off side', async () => {
    // The half that makes the half above mean something. `rideTimeTerm.activeWhen` declares the term
    // dead under `up-down-buttons`, and a declaration nothing checks is the `idle.predictorHorizonS`
    // shape — a live dimension declared dead, or a dead one declared live.
    const off = at(await liveness(), 'liveness-priced-conventional');
    expect(off.callType).toBe('up-down-buttons');
    expect(off.ridePricing.evaluations).toBeGreaterThan(0);
    expect(off.ridePricing.nonZero).toBe(0);
    expect(off.ridePricing.decisionsWithSpread).toBe(0);
  }, TIMEOUT_MS);

  it('shows the shipped profile removing every access refusal on the zoned building', async () => {
    const rows = await liveness();
    const credentialled = at(rows, 'destination-eta');
    const conventional = at(rows, 'liveness-conventional');

    expect(credentialled.callType).toBe('mobile-credential');
    expect(conventional.callType).toBe('up-down-buttons');

    // The gate's off side is emphatically not flat here — it is where the building breaks.
    expect(conventional.eligibility.accessRefusals).toBeGreaterThan(0);
    expect(conventional.eligibility.byReason.accessDenied).toBeGreaterThan(0);
    // Bank-wide refusals: no candidate left, so the call has no assignment at any cost. That is the
    // difference between a slow building and an unservable one.
    expect(conventional.eligibility.decisionsWhollyRefused).toBeGreaterThan(0);

    // And under the credential, none of it happens.
    expect(credentialled.eligibility.accessRefusals).toBe(0);
    expect(credentialled.eligibility.decisionsWhollyRefused).toBe(0);

    console.log(
      `secure-tower eligibility: up-down-buttons ${conventional.eligibility.accessRefusals} refusals / ` +
        `${conventional.eligibility.decisionsWhollyRefused} wholly-refused decisions; ` +
        `mobile-credential ${credentialled.eligibility.accessRefusals} / ` +
        `${credentialled.eligibility.decisionsWhollyRefused}`,
    );
  }, TIMEOUT_MS);
});
