/**
 * **The liveness proof for everything Phase 6a ships, and it is a count rather than a diff.**
 *
 * `docs/09` § 8 R6-1 names this phase's most likely dead seam: *a destination profile lands in
 * `data/` and changes nothing.* **It happened**, and it took T30 and a full experiment matrix to
 * see it: the shipped profile weighted no gated term, and was bit-identical to `eta` at 8 of 8
 * matrix cells.
 *
 * A trajectory difference is still the wrong evidence, and the reason is measured rather than
 * argued. Even with the weight authored, the shipped profile is bit-identical to `eta` on Garden
 * Apartments down-peak at **every** weight up to 2.0 — every down trip ends at the lobby, so the
 * destination carries nothing the direction button did not. An operating point that is blind and a
 * seam that is dead produce the same diff. So the evidence here is the one the contract asks for:
 * how often each gated behaviour actually evaluated, how often it produced a non-zero value, and how
 * often it produced a **different** value for different candidate cars inside one decision.
 *
 * Measured through `runSimulation` at the study's own operating points, seed 20260726:
 *
 * | configuration | `rideTime` non-zero | cross-car spread | eligibility |
 * |---|---|---|---|
 * | **shipped `destination-eta`** (`rideTime 0.5`), `mobile-credential`, Midtown | **260 / 260** | **12 / 65 decisions** | — |
 * | the shipped profile at `up-down-buttons`, Midtown | **0 / 248** | **0 / 62 decisions** | — |
 * | `destination-eta` + `rideTime 1`, `mobile-credential`, Midtown | **248 / 248** | **12 / 62 decisions** | — |
 * | the same weights at `up-down-buttons`, Midtown | **0 / 248** | **0 / 62 decisions** | — |
 * | shipped `destination-eta`, `mobile-credential`, Secure Tower | — | — | **0** refusals, **0** decisions wholly refused |
 * | the same profile at `up-down-buttons`, Secure Tower | — | — | **0** verdicts of any reason |
 * | the same profile at `destination-entry`, no credential, Secure Tower | — | — | **0** verdicts — and **29 of 65** legs carried, against 65 on both shipped arms |
 *
 * Both gates are flat on their off side and live on their on side, which is the proof obligation
 * docs/09 § 8 R6-2 puts on the author rather than the reviewer.
 *
 * **The first two rows are new, and their absence is how the inert profile shipped.** Until T30 the
 * shipped `destination-eta` weighted no gated term at all, so the `rideTime` rows here measured
 * only `liveness-priced` — the same profile with the weight *forced to 1 by this file*. Those
 * counts proved the **term** live and said nothing about the **profile**, and the matrix later
 * measured what the profile did: bit-identical to `eta` at 8 of 8 cells. `data/` now ships 0.5 and
 * the shipped configuration is counted at its own weight, on its own building, against its own
 * gated-off control.
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
 * ## The shipped profile now has liveness of **both** shapes, and they are still different shapes
 *
 * On Midtown Office, `destination-eta`'s `callType` moves nothing in the eligibility filter — the
 * building declares no `accessZones` — so what makes it live there is the **pricing**: 260 of 260
 * evaluations non-zero, with cross-car spread in 12 of 65 decisions.
 *
 * **On Secure Tower it used to move the eligibility filter, and since `DECISIONS.md` § D254 it moves
 * nothing there.** This paragraph read: *the credential reaches `estimateCost`, cars stop refusing
 * the call, and removing those bank-wide refusals turns 307 unassignable decisions per run into none
 * and an unservable building into a served one — H-ACCESS-1 one level down, in the filter that
 * causes it.* The filter was refusing because `estimateCost` asked the access question about a hall
 * call's **pickup** floor, which is a modelling error; the check and the `accessDenied` reason are
 * both deleted, and both Secure Tower rows now record **zero verdicts of any kind**. H-ACCESS-1 is
 * refuted (§ D256) and this was its mechanism.
 *
 * So the shipped profile's liveness on the zoned building is now the **pricing** — 153 of 153
 * evaluations non-zero, cross-car spread in 2 of 51 decisions — the same shape it has on Midtown,
 * rather than a second one. The eligibility census is kept, and kept honest by the third Secure
 * Tower row: the **bare kiosk**, `destination-entry` with no credential, which still refuses every
 * zoned destination on every car. Without it, *"zero refusals on both arms"* would be indis-
 * tinguishable from a census that had stopped counting — § D261's vacuous-precondition trap, which
 * this repository has already fallen into once with a filter matching a deleted reason.
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

function at(
  rows: readonly DestinationLiveness[],
  profileId: string,
  buildingId?: string,
): DestinationLiveness {
  // `buildingId` is not optional decoration: `destination-panel` is measured on two buildings, so
  // an id-only lookup silently returns whichever case happens to come first in `livenessCases`.
  const found = rows.find(
    (row) =>
      row.profileId === profileId && (buildingId === undefined || row.building === buildingId),
  );
  if (found === undefined) {
    throw new Error(`no liveness row for "${profileId}"${buildingId === undefined ? '' : ` on ${buildingId}`}`);
  }
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

  it('prices the ride on the SHIPPED profile, at the weight data/ actually carries', async () => {
    /*
     * **The assertion whose absence let the inert profile ship.** Everything above measures
     * `liveness-priced` — `destination-eta` with `rideTime` forced to 1 — which is a study arm. The
     * shipped file weighted `rideTime` at nothing at all, so the counts that proved the *term* live
     * proved nothing about the *profile*, and the matrix later found it bit-identical to `eta` at 8
     * of 8 cells. `data/dispatcher-profiles.json` now ships 0.3, and this is that configuration
     * counted through the shipped engine on the primary building, at its own weight.
     *
     * Same three questions as the study arm, and the third is still the load-bearing one: a term
     * returning the same number for every candidate is a constant added to every cost, and a
     * constant cannot move an argmin.
     */
    const row = at(await liveness(), 'destination-eta', 'midtown-office');
    expect(row.callType).toBe('mobile-credential');
    expect(row.weightsRideTime).toBe(0.5);

    expect(row.ridePricing.evaluations).toBeGreaterThan(0);
    expect(row.ridePricing.nonZero / row.ridePricing.evaluations).toBeGreaterThan(0.9);
    expect(row.ridePricing.decisionsWithSpread).toBeGreaterThan(0);
    console.log(
      `SHIPPED destination-eta on midtown-office: rideTime ${row.ridePricing.nonZero}/` +
        `${row.ridePricing.evaluations} non-zero, cross-car spread in ` +
        `${row.ridePricing.decisionsWithSpread}/${row.ridePricing.decisions} decisions ` +
        `over ${row.totalDecisions} dispatch decisions`,
    );
  }, TIMEOUT_MS);

  it('leaves the shipped profile’s own gate flat on its off side', async () => {
    // docs/09 § 8 R6-2: the off side is the author's proof obligation, and it has to be the off side
    // of *this* configuration rather than of a neighbouring one.
    const off = at(await liveness(), 'liveness-shipped-conventional');
    expect(off.callType).toBe('up-down-buttons');
    expect(off.weightsRideTime).toBe(0.5);
    expect(off.ridePricing.evaluations).toBeGreaterThan(0);
    expect(off.ridePricing.nonZero).toBe(0);
    expect(off.ridePricing.decisionsWithSpread).toBe(0);
  }, TIMEOUT_MS);

  /**
   * **There is no access refusal for the shipped profile to remove, and the bare kiosk is what
   * proves the counter can still see one.**
   *
   * This case asserted that the conventional arm on Secure Tower produced `accessDenied` refusals
   * and bank-wide unassignable decisions, and that the credential removed all of them — 921 against
   * 0, and 307 of 331 decisions wholly refused against none. Every one of those numbers was
   * `estimateCost` asking the access question about a hall call's **pickup** floor (§ D254). The
   * reason `accessDenied` no longer exists in `core` at all, so the assertion cannot be repaired by
   * renaming: the *direction* it measured — refusals that a credential makes disappear — is gone.
   *
   * The inversion needs care for the reason § D261 gives about the adversarial fixture: a filter
   * looking for a deleted reason matches nothing, and a test asserting *zero* refusals then passes
   * by being **vacuous**. Two arms both at zero is not evidence that the credential is inert; it is
   * equally consistent with a census that has stopped counting.
   *
   * **Measured, the census is not blind — it is empty, and the refusal moved upstream of it.** The
   * eligibility filter returns **0 verdicts of any kind** on all three Secure Tower configurations,
   * not merely zero access refusals: no car is ineligible for any reason, so `decision.rejected` is
   * empty everywhere. The bare kiosk is added here as the third row precisely to establish that,
   * because it is the one configuration that still turns riders away — and it turns them away at
   * `#kioskAllows`, one passenger at a time (§ T50-D1), **before a landing call is raised**. So
   * `estimateCost` is never asked about them and the filter has nothing to record.
   *
   * That gives the non-vacuous pair this case needs, in this module's own units: the kiosk carries
   * **29 of 65** comparable legs against the two shipped arms' **65 of 65**, on the same building,
   * the same seed and the same traffic, while all three report the same empty filter. A census that
   * had merely stopped counting would not have moved the leg count. Where the kiosk's refusals *are*
   * counted is `StageActivity.kioskRefusedLegs`, which `accessControl.ts` reads at 34.1 per run.
   */
  it('finds an empty eligibility filter on every shipped arm — and a kiosk refusing upstream of it', async () => {
    const rows = await liveness();
    const credentialled = at(rows, 'destination-eta', 'secure-tower');
    const conventional = at(rows, 'liveness-conventional');
    const kiosk = at(rows, 'liveness-bare-kiosk', 'secure-tower');

    expect(credentialled.callType).toBe('mobile-credential');
    expect(conventional.callType).toBe('up-down-buttons');
    expect(kiosk.callType).toBe('destination-entry');

    // The filter is empty on all three — no verdict of any reason, access or otherwise. Asserted on
    // `verdicts` rather than on `accessRefusals` because it is the stronger and more falsifiable
    // statement: a filter that had started refusing for `serviceZone` would break this and would
    // leave an `accessRefusals === 0` assertion green.
    for (const [label, row] of [
      ['up-down-buttons', conventional],
      ['mobile-credential', credentialled],
      ['destination-entry, no credential', kiosk],
    ] as const) {
      expect(row.eligibility.verdicts, label).toBe(0);
      expect(row.eligibility.accessRefusals, label).toBe(0);
      expect(row.eligibility.decisionsWhollyRefused, label).toBe(0);
      expect(Object.keys(row.eligibility.byReason), label).toEqual([]);
      // …and every one of them made real decisions, so the emptiness is a filter with nothing to
      // refuse rather than a run that never dispatched anything.
      expect(row.eligibility.decisions, label).toBeGreaterThan(0);
    }

    /*
     * The discriminating pair, and it is what stops the three zeros above from being a census that
     * has quietly stopped counting. The kiosk still refuses — it refuses at the interface, before
     * any car is asked — and the cost shows up as legs that never boarded.
     */
    expect(kiosk.panel.comparedLegs).toBeLessThan(conventional.panel.comparedLegs);
    expect(credentialled.panel.comparedLegs).toBe(conventional.panel.comparedLegs);
    // Non-vacuous in the other direction too: the shipped arms carry essentially everybody, so the
    // kiosk's shortfall is the kiosk rather than a building nobody can serve.
    expect(conventional.panel.comparedLegs / (conventional.panel.legs - conventional.panel.refusedLegs))
      .toBeGreaterThan(0.95);

    console.log(
      `secure-tower: eligibility verdicts ${conventional.eligibility.verdicts}/` +
        `${credentialled.eligibility.verdicts}/${kiosk.eligibility.verdicts} ` +
        '(up-down-buttons / mobile-credential / bare kiosk); comparable legs ' +
        `${conventional.panel.comparedLegs}/${credentialled.panel.comparedLegs}/${kiosk.panel.comparedLegs} ` +
        `of ${conventional.panel.legs} legs, ${conventional.panel.refusedLegs} of which the building ` +
        'turned away for want of a credential on every arm alike (§ D265)',
    );
  }, TIMEOUT_MS);
});

/**
 * **Phase 6b's liveness, on the same terms.**
 *
 * docs/09 § 8 names *"a destination profile ships and changes nothing"* as the most likely ninth
 * dead seam, and `data/dispatcher-profiles.json` now ships a second one. Measured through
 * `runSimulation` at seed 20260726, Midtown Office interfloor-mix:
 *
 * | configuration | `rideTime` non-zero | cross-car spread | decisions | promised | wrong-car | broken |
 * |---|---|---|---|---|---|---|
 * | shipped `destination-panel` (arm D) | **356 / 356** | **16 / 92** | 92 | **96 / 96** | **0** | 4 |
 * | the same profile without the panel (arm C) | 248 / 248 | 12 / 62 | 62 | **0 / 96** | 0 | 0 |
 *
 * The decision count rising 62 → 92 is the mechanical heart of the change (docs/09 § 1.3): under
 * a panel a landing is one call per origin-destination pair, so there are more of them.
 */
describe('Phase 6b liveness — the shipped landing-panel profile', () => {
  it('promises every leg a car, and every promise is kept', async () => {
    const row = at(await liveness(), 'destination-panel', 'midtown-office');
    expect(row.panel.passengerModel).toBe('destination-dispatch');
    expect(row.panel.legs).toBeGreaterThan(0);
    expect(row.panel.promisedLegs).toBe(row.panel.legs);
    // `#reconcile` fails the run on this; counted here independently, because a claim checked
    // only by the code that makes it is not checked.
    expect(row.panel.wrongCarBoardings).toBe(0);
    // The cost of the write-once rule, paid and counted rather than hidden (T16 § D3).
    expect(row.panel.brokenPromises).toBeGreaterThan(0);

    // The promise **bites**: a majority of legs board a car conventional dispatch would not have
    // sent them to. T16 measured 70 of 96; the assertion is a floor, not a pin.
    expect(row.panel.differentCarThanConventional / row.panel.comparedLegs).toBeGreaterThan(0.2);

    // And the gated term is live inside it, with spread — a term that returns the same number
    // for every candidate is a constant, and a constant cannot move an argmin.
    expect(row.panel.legs).toBeGreaterThan(0);
    expect(row.ridePricing.nonZero / row.ridePricing.evaluations).toBeGreaterThan(0.9);
    expect(row.ridePricing.decisionsWithSpread).toBeGreaterThan(0);

    console.log(
      `destination-panel: ${row.panel.promisedLegs}/${row.panel.legs} promised, ` +
        `${row.panel.wrongCarBoardings} wrong-car, ${row.panel.brokenPromises} broken, ` +
        `${row.panel.differentCarThanConventional}/${row.panel.comparedLegs} legs on a different car than eta, ` +
        `rideTime ${row.ridePricing.nonZero}/${row.ridePricing.evaluations} non-zero with spread in ` +
        `${row.ridePricing.decisionsWithSpread}/${row.ridePricing.decisions} decisions`,
    );
  }, TIMEOUT_MS);

  it('promises nobody on the gate’s off side, and opens fewer calls there', async () => {
    // The half that makes the half above mean something. Same weights, same call type, same
    // credential — `passengerAssignment` removed and nothing else.
    const rows = await liveness();
    const on = at(rows, 'destination-panel', 'midtown-office');
    const off = at(rows, 'liveness-panel-off', 'midtown-office');

    expect(off.panel.passengerModel).toBe('conventional');
    expect(off.panel.promisedLegs).toBe(0);
    expect(off.panel.brokenPromises).toBe(0);
    expect(off.panel.legs).toBe(on.panel.legs);

    // docs/09 § 1.3: a landing under a panel is one call per origin-destination pair, so the
    // decision count rises. That is the mechanism, counted rather than described.
    expect(on.totalDecisions).toBeGreaterThan(off.totalDecisions);
    console.log(
      `decisions: arm C ${off.totalDecisions} → arm D ${on.totalDecisions} on the same trace`,
    );
  }, TIMEOUT_MS);

  it('keeps its promises on the access-controlled building too', async () => {
    const secure = at(await liveness(), 'destination-panel', 'secure-tower');
    expect(secure.panel.passengerModel).toBe('destination-dispatch');
    /*
     * **Every leg the panel could see** — § D266's term, added rather than the equality relaxed.
     * The building turns a handful of riders away for want of a credential before any car is
     * dispatched, so they never reach a landing queue and no panel is ever asked about them. The
     * count is asserted to be real and non-zero below, so this cannot be satisfied by a run in
     * which the panel quietly stopped promising anybody.
     */
    expect(secure.panel.refusedLegs).toBeGreaterThan(0);
    expect(secure.panel.promisedLegs).toBe(secure.panel.legs - secure.panel.refusedLegs);
    expect(secure.panel.wrongCarBoardings).toBe(0);
    // D30/T16-D2: the panel is what authorizes, so the credentialled building is served.
    expect(secure.eligibility.decisionsWhollyRefused).toBe(0);
  }, TIMEOUT_MS);
});
