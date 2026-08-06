/**
 * Can this dispatcher read a credential, and what happens on this building if it cannot —
 * `docs/10-experience-layer-contract.md` § 10.3, *"the highest-value item in U8"*.
 *
 * ## The predicate is `core`'s, not a copy of it
 *
 * Whether a call reaches a car carrying a credential is decided by exactly one expression in the
 * engine — `dispatch/lifecycle.ts`'s `callCarriesCredential(callType, panelAuthorized)` — and
 * that function's own docstring records **why** it is a function: a second copy of it was a
 * defect, because a runner that disagreed with `costRequestFor` about who is servable *"would
 * strand exactly the passengers it thought it was rescuing"*. So this module resolves the
 * profile through `resolveDispatchConfig` and asks that same function, plus `passengerModelOf`
 * for the panel half. Nothing here re-implements the rule and nothing here names a profile.
 *
 * ## Nothing is hard-coded — not the count, not the list, not the call types
 *
 * `docs/10` § 2.8 states the figure as *"of the 12 shipped dispatcher profiles, exactly two
 * (`destination-eta`, `destination-panel`) declare a credential-carrying `dispatch.callType`."*
 * That is prose, and this repository has a documented history of prose that was wrong about the
 * code. {@link credentialAwareProfileIds} derives it from whatever profile list it is handed, so
 * a thirteenth profile changes the message with no edit here — which is the liveness evidence
 * `docs/10` § 11 **W8** asks for by name.
 *
 * Measured on `data/dispatcher-profiles.json` as it stands: 2 of 12, and they are the two the
 * prose names. The **mechanism** is broader than the prose, though, and the difference matters
 * for anybody authoring a profile: a `destination-entry` call type with
 * `passengerAssignment: 'panel'` also carries a credential, because the kiosk performs the
 * access check itself and forwards its verdict (`DECISIONS.md` § D30). No shipped profile is in
 * that state, so the count is right and the reason given for it is incomplete.
 *
 * ## The **bare kiosk** is a third case, not a shade of the second
 *
 * A `destination-entry` profile *without* a panel discloses the destination and carries no
 * credential, and on an access-controlled building that is measurably **worse** than a
 * conventional dispatcher rather than better — **61.2 % unserved against conventional's 0.0 %**
 * (`benchmark/accessControl.ts` H-ACCESS-1, seed 20 260 726, n = 30, re-measured by
 * `DECISIONS.md` § D280). It gets its own sentence for that reason. No shipped profile raises it;
 * the branch exists because a profile authored in the parameter form can.
 *
 * **The figures this paragraph used to quote — *"100 % unserved against conventional's 33.5 %"* —
 * are withdrawn, and they were describing a defect.** Both were measured on the tree that applied
 * access zoning to a hall call's **pickup** floor (`DECISIONS.md` § D254), which stranded every
 * conventional landing call raised inside a zone and swept collateral into the kiosk's count too.
 * Re-run on the fixed simulator, conventional dispatch serves the building completely, so the
 * comparison is now against **zero** rather than against a third — the contrast is *larger*, not
 * smaller, and the reason for this branch is stronger than the withdrawn numbers made it look. The
 * kiosk row also got cleaner: 34.1 undelivered against 34.1 kiosk refusals, so every stranded leg
 * is a credential refusal and none is collateral (§ D256, § D279, § D280).
 */

import {
  DispatchError,
  callCarriesCredential,
  passengerModelOf,
  resolveDispatchConfig,
  type AccessZone,
  type CallType,
  type DispatcherProfileSource,
} from '@elevator-sim/core/browser';

import { floorRunsOf, restrictedFloorIds } from './zoning.js';

/** What one dispatcher profile can see of a call, as far as access control is concerned. */
export interface CredentialCapability {
  readonly profileId: string;
  readonly callType: CallType;
  /** `true` when a landing panel exists, which is what authorizes an otherwise bare destination. */
  readonly hasPanel: boolean;
  /** The answer `costRequestFor` will give. Every other field here exists to explain it. */
  readonly carriesCredential: boolean;
  /**
   * A `destination-entry`-family call type with no panel: the destination is disclosed and
   * nothing authorizes it. Distinct from an ordinary conventional profile and measured worse.
   */
  readonly isBareKiosk: boolean;
  /** Why, in one clause, naming the call type rather than the profile. */
  readonly reason: string;
}

/**
 * Resolve one profile and ask `core` what it will know.
 *
 * A profile the engine would refuse (an unknown weight, an unknown hard constraint, an engine it
 * does not implement) cannot run at all, so there is no credential question to answer about it:
 * the capability comes back `carriesCredential: false` with the refusal as its reason, and the
 * caller's own validation is what reports the refusal. Swallowing it here and claiming
 * credential-awareness would be worse than either.
 */
export function credentialCapabilityOf(profile: DispatcherProfileSource): CredentialCapability {
  let callType: CallType;
  let hasPanel: boolean;
  try {
    const stage = resolveDispatchConfig(profile).dispatch;
    callType = stage.callType;
    hasPanel = passengerModelOf(stage) === 'destination-dispatch';
  } catch (error) {
    if (!(error instanceof DispatchError)) throw error;
    return Object.freeze({
      profileId: profile.id,
      callType: 'up-down-buttons',
      hasPanel: false,
      carriesCredential: false,
      isBareKiosk: false,
      reason: `this engine refuses the profile, so it reads nothing: ${error.message}`,
    });
  }

  const carriesCredential = callCarriesCredential(callType, hasPanel);
  const isBareKiosk = !carriesCredential && callType !== 'up-down-buttons';
  return Object.freeze({
    profileId: profile.id,
    callType,
    hasPanel,
    carriesCredential,
    isBareKiosk,
    reason: carriesCredential
      ? hasPanel && callType !== 'mobile-credential'
        ? `its landing panel performs the access check and forwards the verdict (call type ${callType})`
        : `it registers calls as ${callType}, which carries the rider's credential`
      : isBareKiosk
        ? `it registers calls as ${callType}, which discloses the destination and carries no credential`
        : `it registers calls as ${callType}, which carries no credential`,
  });
}

/**
 * The ids of the profiles in `profiles` that read a credential, in the order given.
 *
 * Derived, never listed. `dispatcherCredentials.test.ts` adds a thirteenth profile and asserts
 * the warning's sentence changes, which is what stops this becoming a literal again.
 */
export function credentialAwareProfileIds(
  profiles: readonly DispatcherProfileSource[],
): readonly string[] {
  return profiles.filter((profile) => credentialCapabilityOf(profile).carriesCredential).map((p) => p.id);
}

/* -------------------------------------------------------------------------- *
 * The pre-run check
 * -------------------------------------------------------------------------- */

export interface AccessCompatibilityInput {
  readonly buildingName: string;
  /** Every floor id, in building order — the order the warning names them in. */
  readonly floorIds: readonly string[];
  readonly accessZones: readonly AccessZone[] | undefined;
  readonly profile: DispatcherProfileSource;
  /** Every profile the reader could have picked instead. The alternatives are derived from it. */
  readonly profiles: readonly DispatcherProfileSource[];
}

export interface AccessCompatibility {
  readonly capability: CredentialCapability;
  /** Floors inside at least one access zone, in building order. */
  readonly restrictedFloorIds: readonly string[];
  /** Ids of the profiles that would read the credential. Derived from the list given. */
  readonly credentialAwareProfileIds: readonly string[];
  /**
   * The sentence to show before **Run**, or `undefined` when there is nothing to say.
   *
   * `undefined` in exactly two cases and no others: the building declares no access zone (there
   * is no credential to fail to read), or the profile reads credentials (nothing will be
   * refused on access grounds).
   */
  readonly warning?: string | undefined;
}

/**
 * § 10.3's check, computed from data the viewer and the editor both already hold.
 *
 * **A fact, not a verdict.** The message says what the run will do; it does not say the reader
 * chose wrongly, and there is no "recommended" profile in it — `R11` and this project's whole
 * position on the Pareto front forbid that, and `docs/10` is explicit that running it and
 * watching it fail is the lesson. Run stays enabled (`ED-15`), which is what makes this a
 * warning rather than a block.
 *
 * **No percentage.** § 10.3's example sentence reads *"33 % of riders will not be served"*, and
 * that figure was `benchmark/accessControl.ts` H-ACCESS-1's measurement of **one** arm on **one**
 * building at one seed and one traffic profile. Reproducing it inside a message that fires on
 * any building under any conventional profile would be publishing a number nothing here
 * re-derives, which `CLAUDE.md` forbids in exactly those words. The message names the floors
 * instead — which is derived, exact, and the thing the reader can act on. **That decision was
 * right for a stronger reason than it knew:** the 33.5 % it declined to quote is now **withdrawn**
 * — it measured `DECISIONS.md` § D254's pickup-access defect, and the same configuration re-run on
 * the fixed simulator delivers everybody (§ D256). A message that had hard-coded it would have
 * shipped a defect's signature to the player.
 *
 * ## ⚠️ The warning's own middle clause is stale, and it is named here rather than quietly rewritten
 *
 * The sentence below still tells the player that *"a call from any of those floors reaches every
 * car as an unbadged request, every car refuses it on access grounds, and the call is permanently
 * unassignable."* **That is § D254's deleted defect described as live behaviour.** A credential
 * governs where you may *go*, not where you may be *collected*; the pickup check and the
 * `accessDenied` reason are both gone, and conventional dispatch now serves every access-zoned
 * building this project ships at 100 % delivery — `eta` and `destination-eta-unpriced` are
 * bit-identical on 150 of 150 `secure-tower` replications (§ D256, § D279).
 *
 * **It is not corrected here, and the reason is that the honest correction is a product decision
 * rather than a wording one.** What survives is enforced by the *runner* per passenger against the
 * **destination** (`Simulation.#bankCanCarry`, `#carCanCarry`), which no choice of dispatcher
 * changes, plus § D265's credential gap, which is a property of the traffic model. The one
 * genuinely dispatcher-dependent refusal left is the **bare kiosk**, and it already has its own
 * sentence above. So the truthful message for a conventional profile may be *no message at all* —
 * which would empty this check of the purpose `docs/10` § 10.3 gives it, and § D256's rule is that
 * a re-design of that kind needs a criterion written before the numbers are read.
 *
 * **What may not happen is a second plausible sentence put in the gap.** `CLAUDE.md`'s rule for a
 * claim about *why* is measure it or say it is unmeasured, and this is the saying. The standing
 * requirement it sits under is the one for a stale *refusal* (§ D227): a control that writes
 * something may not claim it writes nothing, and — as here — a message may not claim a refusal the
 * engine no longer performs. `lockedOut.ts` names the same gap in the same directory for the same
 * reason.
 */
export function checkAccessCompatibility(input: AccessCompatibilityInput): AccessCompatibility {
  const capability = credentialCapabilityOf(input.profile);
  const restricted = restrictedFloorIds(input.floorIds, input.accessZones);
  const aware = credentialAwareProfileIds(input.profiles);

  const base = {
    capability,
    restrictedFloorIds: restricted,
    credentialAwareProfileIds: aware,
  };
  if (restricted.length === 0 || capability.carriesCredential) return Object.freeze(base);

  const zoneCount = (input.accessZones ?? []).length;
  const alternatives =
    aware.length === 0
      ? 'None of the ' +
        `${String(input.profiles.length)} dispatchers loaded here reads one, so this building has ` +
        'no dispatcher that can serve those floors.'
      : `${String(aware.length)} of the ${String(input.profiles.length)} dispatchers loaded here do read a ` +
        `credential: ${aware.join(', ')}.`;

  const kiosk = capability.isBareKiosk
    ? ' A destination call type without a landing panel is the measured worst case on an ' +
      'access-controlled building — the destination is disclosed and nothing authorizes it, so ' +
      'the check is asked a second time and refused (DECISIONS.md § D137).'
    : '';

  return Object.freeze({
    ...base,
    warning:
      `${input.buildingName} has ${String(zoneCount)} access zone${zoneCount === 1 ? '' : 's'} ` +
      `covering ${String(restricted.length)} of its ${String(input.floorIds.length)} floors ` +
      `(${floorRunsOf(input.floorIds, restricted)}). ${input.profile.id} does not read credentials — ` +
      `${capability.reason} — so a call from any of those floors reaches every car as an ` +
      'unbadged request, every car refuses it on access grounds, and the call is permanently ' +
      `unassignable.${kiosk} ${alternatives} ` +
      'This states what the run will do; Run stays enabled.',
  });
}
