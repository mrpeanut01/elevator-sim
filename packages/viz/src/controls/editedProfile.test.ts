/**
 * An edited weight vector is still **data** — `docs/10-experience-layer-contract.md` § 11 **W6**.
 *
 * Three claims, and the second is the one W6 is judged on:
 *
 * 1. An edit round-trips through the **same schema the optimizer reads**. Not a schema like it:
 *    `candidateProfile` → `parseDispatcherProfiles`, and the value comes back out through
 *    `candidateFromProfile`, which is what a search would read.
 * 2. An edit that produces an invalid profile is **refused at the control**, with a reason, and
 *    never reaches a simulator. Both kinds of invalid are covered: a value the dimension cannot
 *    hold, and a *combination* every dimension admits and `core` refuses.
 * 3. The refusal a player sees and the refusal a batch would raise are the **same sentence**,
 *    because they are the same function.
 */

import {
  candidateFromProfile,
  collectSearchSpace,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import type { DispatcherProfile, LoadedConfig } from '@elevator-sim/core';
import { loadConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, requireDispatcher } from '../fixtures.test-helper.js';
import { admitEditedVector, resolveEditedProfile, valuesFromProfile } from './editedProfile.js';

let config: LoadedConfig;
let space: SearchSpace;
let collective: DispatcherProfile;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  collective = requireDispatcher(config, 'collective');
});

describe('an edit round-trips through the profile schema', () => {
  it('produces a profile a search would read back with the edited value', () => {
    const before = valuesFromProfile(space, collective).get('weights.waitTime');
    const resolved = resolveEditedProfile(space, collective, {
      baseProfileId: collective.id,
      profileId: 'collective-edited',
      values: { 'weights.waitTime': 3.25 },
    });
    expect(resolved.ok, resolved.ok ? '' : resolved.reason).toBe(true);
    if (!resolved.ok) return;

    // Through `candidateFromProfile`, which is `experiments`' own answer to "what does this
    // profile actually run?" — not by reading the JSON this test just wrote.
    const readBack = candidateFromProfile(space, resolved.profile);
    expect(readBack.get('weights.waitTime')).toBe(3.25);
    expect(before).not.toBe(3.25);
    expect(resolved.profile.id).toBe('collective-edited');
  });

  it('leaves every dimension the edit did not name where the base had it', () => {
    const resolved = resolveEditedProfile(space, collective, {
      baseProfileId: collective.id,
      profileId: 'collective-edited',
      values: { 'weights.waitTime': 3.25 },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const base = candidateFromProfile(space, collective);
    const edited = candidateFromProfile(space, resolved.profile);
    const moved = space.ids.filter((id) => String(base.get(id)) !== String(edited.get(id)));
    expect(moved).toEqual(['weights.waitTime']);
  });

  it('carries the base profile’s fields that are not dimensions of the space', () => {
    /*
     * The candidate carries every **live dimension**, so a reader could reasonably think merging
     * onto the base contributes nothing. It contributes the profile fields the search space does
     * not model — measured: across all twelve shipped profiles the merged and unmerged documents
     * differ in exactly one field, `role`, and dropping the base loses it.
     *
     * Without this the base merge could be deleted with the whole suite green, which the liveness
     * sweep watched happen.
     */
    expect(collective.role).toBeDefined();
    const resolved = resolveEditedProfile(space, collective, {
      baseProfileId: collective.id,
      profileId: 'collective-edited',
      values: { 'weights.waitTime': 3.25 },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.profile.role).toBe(collective.role);
  });
});

describe('an invalid edit is refused at the control, with a reason', () => {
  it('refuses a value outside the dimension’s declared range, quoting the bound', () => {
    const admission = admitEditedVector(space, collective, { 'weights.waitTime': 99 });
    expect(admission.admissible).toBe(false);
    expect(admission.reason).toContain('weights.waitTime');
    // The bound is the schema's, printed. A refusal that says only "invalid" is not actionable.
    expect(admission.reason).toContain('[0, 5]');
  });

  it('refuses a dimension the space does not declare, by name', () => {
    const admission = admitEditedVector(space, collective, { 'weights.vibes': 1 });
    expect(admission.admissible).toBe(false);
    expect(admission.reason).toContain('weights.vibes is not a dimension of this space.');
  });

  it('refuses a dimension whose gate is unmet, naming the gate rather than saying "unavailable"', () => {
    // `dispatch.commitmentPoint` is gated on `dispatch.reassignmentPolicy`, which `collective`
    // leaves at `never`. The point of naming the gate is that "this needs a reassignment policy"
    // is actionable and "unavailable" is not — `controls/controls.ts`'s own words.
    const admission = admitEditedVector(space, collective, {
      'dispatch.commitmentPoint': 'on-door-open',
    });
    expect(admission.admissible).toBe(false);
    expect(admission.reason).toContain('dispatch.reassignmentPolicy');
  });

  it('refuses a combination every dimension admits and `core` will not build', () => {
    /*
     * The declared box is not the feasible set. `destination-entry` plus `deferred` is the one
     * constraint `core` states — *"that constraint is a documented cost of the approach and this
     * simulator measures it; it must not be configured away"* — and one uniform draw in eight
     * violates it. Both values are legal on their own dimension, so nothing at the slider can
     * catch this and `SearchSpace.validate` is what does.
     */
    const admission = admitEditedVector(space, collective, {
      'dispatch.callType': 'destination-entry',
      'dispatch.assignmentTiming': 'deferred',
    });
    expect(admission.admissible).toBe(false);
    expect(admission.reason).toContain('the declared box is not the feasible set');
    expect(admission.reason).toContain('defer');
  });

  it('admits each half of that combination on its own, so the refusal is about the pair', () => {
    // Without this the test above would pass on a form that refused `destination-entry` outright,
    // and the claim being made — that the *combination* is what is infeasible — would be untested.
    expect(
      admitEditedVector(space, collective, { 'dispatch.callType': 'destination-entry' }).admissible,
    ).toBe(true);
    expect(
      admitEditedVector(space, collective, { 'dispatch.assignmentTiming': 'deferred' }).admissible,
    ).toBe(true);
  });

  it('returns the refusal rather than throwing, so a worker boundary keeps the dimension name', () => {
    const resolved = resolveEditedProfile(space, collective, {
      baseProfileId: collective.id,
      profileId: 'collective-edited',
      values: { 'weights.waitTime': 99 },
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain('weights.waitTime');
  });

  it('refuses a profile id the file schema will not hold', () => {
    // `config/schema.ts` requires a non-empty string and nothing more, so this is the only id the
    // parser rejects. Asserted rather than assumed: the first version of this test used
    // `'Not A Valid Id!'` on the belief that ids were slugs, and it went green because the profile
    // parsed — a test that would have passed whatever `resolveEditedProfile` did with the id.
    const resolved = resolveEditedProfile(space, collective, {
      baseProfileId: collective.id,
      profileId: '',
      values: { 'weights.waitTime': 1 },
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain('not authorable as a dispatcher profile');
  });
});
