/**
 * **The profile module's three claims**: the curated six are § 15.1's, the persistence refuses in
 * both directions the way `persist/session.ts` taught, and the store is the one place a name
 * change becomes visible — which is what § 20.15's no-reload rail update stands on.
 */

import { describe, expect, it } from 'vitest';

import { displayNameIssueOf } from '../menu/account.js';
import type { SessionStore } from '../persist/types.js';

import {
  AVATAR_SWATCHES,
  avatarInitialOf,
  createProfileStore,
  DEFAULT_EVERYDAY_PROFILE,
  loadProfile,
  saveProfile,
} from './profile.js';

/** A working backing slot. */
function memoryBacking(): SessionStore & { readonly slots: Map<string, string> } {
  const slots = new Map<string, string>();
  return {
    slots,
    read: (key) => slots.get(key) ?? null,
    write: (key, value) => {
      slots.set(key, value);
    },
    remove: (key) => {
      slots.delete(key);
    },
  };
}

/** A browser whose storage refuses to be touched — every method throws, as the real one may. */
const refusingBacking: SessionStore = {
  read: () => {
    throw new Error('storage denied');
  },
  write: () => {
    throw new Error('storage denied');
  },
  remove: () => {
    throw new Error('storage denied');
  },
};

describe('the curated six', () => {
  it('is § 15.1’s list — sun, terracotta, moss, sky, ochre, slate — in the prototype’s order', () => {
    expect(AVATAR_SWATCHES.map((swatch) => swatch.id)).toEqual([
      'sun',
      'terracotta',
      'moss',
      'sky',
      'ochre',
      'slate',
    ]);
    expect(AVATAR_SWATCHES.map((swatch) => swatch.color)).toEqual([
      '#F2A63B',
      '#B8462B',
      '#4F8A5B',
      '#4E9DD8',
      '#8D6A2F',
      '#5F7268',
    ]);
  });

  it('starts a player as the prototype’s own `you`, on sun', () => {
    expect(DEFAULT_EVERYDAY_PROFILE).toEqual({ name: 'you', avatarColor: '#F2A63B' });
  });
});

describe('the initial on the disc', () => {
  it('is the first alphanumeric character, uppercased — the prototype’s own derivation', () => {
    expect(avatarInitialOf('you')).toBe('Y');
    expect(avatarInitialOf('Nadia R.')).toBe('N');
    // Leading punctuation is skipped, which a bare `name[0]` would not do.
    expect(avatarInitialOf('...jo')).toBe('J');
  });

  it('falls back to Y rather than drawing an empty disc', () => {
    expect(avatarInitialOf('—')).toBe('Y');
  });
});

describe('persistence, both directions', () => {
  it('round-trips a profile through the slot', () => {
    const backing = memoryBacking();
    const profile = { name: 'Nadia R.', avatarColor: '#4F8A5B' };
    expect(saveProfile(backing, profile)).toBe(true);
    expect(loadProfile(backing)).toEqual(profile);
  });

  it('answers undefined for an empty slot, and false for a write the store refuses', () => {
    expect(loadProfile(memoryBacking())).toBeUndefined();
    expect(loadProfile(refusingBacking)).toBeUndefined();
    expect(saveProfile(refusingBacking, DEFAULT_EVERYDAY_PROFILE)).toBe(false);
  });

  it('refuses bytes that do not parse, and a version this build does not know', () => {
    const backing = memoryBacking();
    backing.slots.set('elevator-sim.everyday-profile', 'not json');
    expect(loadProfile(backing)).toBeUndefined();
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 2, profile: DEFAULT_EVERYDAY_PROFILE }),
    );
    expect(loadProfile(backing)).toBeUndefined();
  });

  it('refuses a colour outside the curated six and a name the display-name rule refuses', () => {
    const backing = memoryBacking();
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 1, profile: { name: 'fine', avatarColor: '#000000' } }),
    );
    expect(loadProfile(backing)).toBeUndefined();
    /*
     * The gate is `menu/account.ts`'s own — asserted through it rather than through a copy of its
     * regex, so the two cannot drift: a name the account screen would refuse is a name this
     * module will not restore.
     */
    const controlName = 'a\nb';
    expect(displayNameIssueOf(controlName)).toBeDefined();
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 1, profile: { name: controlName, avatarColor: '#F2A63B' } }),
    );
    expect(loadProfile(backing)).toBeUndefined();
  });

  it('does not clear a refused slot — a refusal is evidence, and the next save overwrites anyway', () => {
    const backing = memoryBacking();
    backing.slots.set('elevator-sim.everyday-profile', 'not json');
    loadProfile(backing);
    expect(backing.slots.get('elevator-sim.everyday-profile')).toBe('not json');
  });
});

describe('the live store', () => {
  it('restores from its backing at creation', () => {
    const backing = memoryBacking();
    saveProfile(backing, { name: 'Nadia R.', avatarColor: '#5F7268' });
    const store = createProfileStore(backing);
    expect(store.current()).toEqual({ name: 'Nadia R.', avatarColor: '#5F7268' });
  });

  it('notifies every subscriber on set, and stops after unsubscribe', () => {
    const store = createProfileStore(memoryBacking());
    let heard = 0;
    const stop = store.subscribe(() => {
      heard += 1;
    });
    expect(store.set({ name: 'Nadia R.', avatarColor: '#F2A63B' })).toBe(true);
    expect(heard).toBe(1);
    expect(store.current()?.name).toBe('Nadia R.');
    stop();
    store.set({ name: 'Someone else', avatarColor: '#F2A63B' });
    expect(heard).toBe(1);
  });

  it('works memory-only when the browser grants no storage — and says so through set’s answer', () => {
    const store = createProfileStore(undefined);
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    // `false` is the honest answer the settings screen turns into a sentence: the profile is
    // changed everywhere in this document, and it will not survive the tab.
    expect(store.set({ name: 'Nadia R.', avatarColor: '#B8462B' })).toBe(false);
    expect(store.current()).toEqual({ name: 'Nadia R.', avatarColor: '#B8462B' });
    expect(heard).toBe(1);
  });
});
