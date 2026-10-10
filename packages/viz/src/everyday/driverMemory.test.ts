/**
 * The kept driver's slot — `driverMemory.ts`, [§ D1318](../../../../DECISIONS.md).
 *
 * What comes back is an id the build or the player's library still offers, or nothing; a store
 * that throws costs the pick and never the page. The host's half (who writes) is in `host.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { SessionStore } from '../persist/types.js';

import { DRIVER_KEY, forgetDriver, rememberDriver, rememberedDriverOf } from './driverMemory.js';

function memoryStore(): SessionStore & { readonly slot: Map<string, string> } {
  const slot = new Map<string, string>();
  return {
    slot,
    read: (key) => slot.get(key) ?? null,
    write: (key, value) => {
      slot.set(key, value);
    },
    remove: (key) => {
      slot.delete(key);
    },
  };
}

const THROWS: SessionStore = {
  read: () => {
    throw new Error('blocked');
  },
  write: () => {
    throw new Error('blocked');
  },
  remove: () => {
    throw new Error('blocked');
  },
};

const OFFERED = [{ id: 'collective' }, { id: 'fairness-first' }, { id: 'my-own' }];

describe('the week’s kept driver — § D1318', () => {
  it('comes back as it was written, under its own key', () => {
    const store = memoryStore();
    rememberDriver(store, 'fairness-first');
    expect(store.slot.get(DRIVER_KEY)).toBe('fairness-first');
    expect(rememberedDriverOf(store, OFFERED)).toBe('fairness-first');
  });

  it('comes back as nothing when the id is no longer offered, so the house drives as before', () => {
    const store = memoryStore();
    rememberDriver(store, 'retired-profile');
    expect(rememberedDriverOf(store, OFFERED)).toBeUndefined();
  });

  it('is forgotten with the week', () => {
    const store = memoryStore();
    rememberDriver(store, 'my-own');
    forgetDriver(store);
    expect(rememberedDriverOf(store, OFFERED)).toBeUndefined();
  });

  it('is total over a store that throws and over no store at all', () => {
    expect(() => {
      rememberDriver(THROWS, 'collective');
    }).not.toThrow();
    expect(() => {
      forgetDriver(THROWS);
    }).not.toThrow();
    expect(rememberedDriverOf(THROWS, OFFERED)).toBeUndefined();
    expect(rememberedDriverOf(undefined, OFFERED)).toBeUndefined();
  });
});
