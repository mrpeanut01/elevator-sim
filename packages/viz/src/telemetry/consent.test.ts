/**
 * **The consent slot, and the four states § 15.2 draws** — GitHub issue #340.
 *
 * Two claims are worth more than the rest of this file and both are about the identifier:
 *
 * - it is **minted only by a grant**, because there is no other export that can produce one, and a
 *   slot whose grant carries no usable id is refused whole rather than repaired;
 * - it is **gone after a withdrawal**, so § 4.3's *"a withdrawal that only stops future collection
 *   is not a withdrawal"* is a fact about the device rather than a sentence about intent.
 *
 * The rest is `everyday/profile.ts`'s envelope discipline pointed at a second slot: both directions
 * of refusal, and nothing throws.
 */

import { describe, expect, it } from 'vitest';

import type { SessionStore } from '../persist/types.js';
import {
  CONSENT_KEY,
  CONSENT_SCHEMA_VERSION,
  UNASKED,
  clearConsent,
  grantConsent,
  isPlayerId,
  readConsent,
  refuseConsent,
  withdrawConsent,
} from './consent.js';
import { CONSENT_COPY, CONSENT_ROW_COPY, consentAskViewOf, consentRowViewOf } from './consentView.js';

const ID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

function memoryStore(): SessionStore & { readonly slots: Map<string, string> } {
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

describe('the slot', () => {
  it('reads unasked on a device that has never been written to', () => {
    expect(readConsent(memoryStore())).toEqual(UNASKED);
    expect(readConsent(undefined)).toEqual(UNASKED);
  });

  it('round-trips a grant with its identifier', () => {
    const store = memoryStore();
    expect(grantConsent(store, ID).durable).toBe(true);
    expect(readConsent(store)).toEqual({ state: 'granted', playerId: ID });
  });

  it('keeps the answer and drops the identifier on a withdrawal', () => {
    const store = memoryStore();
    grantConsent(store, ID);
    withdrawConsent(store);
    expect(readConsent(store)).toEqual({ state: 'withdrawn', playerId: undefined });
    // The key is still there: § 10 non-goal 3 forbids asking again after an answer, and a slot that
    // had been removed would be a device that has never been asked.
    expect(store.slots.has(CONSENT_KEY)).toBe(true);
  });

  it('writes no identifier on a refusal, and does not carry one over from a grant', () => {
    const store = memoryStore();
    grantConsent(store, ID);
    refuseConsent(store);
    expect(store.slots.get(CONSENT_KEY) ?? '').not.toContain(ID);
    expect(readConsent(store).playerId).toBeUndefined();
  });

  it('removes the slot entirely when the device is cleared, so the question returns', () => {
    const store = memoryStore();
    grantConsent(store, ID);
    clearConsent(store);
    expect(store.slots.size).toBe(0);
    expect(readConsent(store)).toEqual(UNASKED);
  });
});

describe('both directions of refusal', () => {
  const write = (value: unknown): SessionStore & { readonly slots: Map<string, string> } => {
    const store = memoryStore();
    store.slots.set(CONSENT_KEY, typeof value === 'string' ? value : JSON.stringify(value));
    return store;
  };

  it('refuses a version this build does not know', () => {
    expect(readConsent(write({ version: CONSENT_SCHEMA_VERSION + 1, state: 'granted', playerId: ID }))).toEqual(UNASKED);
  });

  it('refuses bytes that are not an envelope', () => {
    for (const value of ['not json', '"a string"', '[1,2,3]', 'null', '{}']) {
      expect(readConsent(write(value)), value).toEqual(UNASKED);
    }
  });

  it('refuses a state this build does not have', () => {
    expect(readConsent(write({ version: CONSENT_SCHEMA_VERSION, state: 'maybe' }))).toEqual(UNASKED);
  });

  it('refuses a grant whose identifier is not 128 bits of hex, rather than minting a new one', () => {
    /*
     * The case that matters most here. Repairing a broken grant by minting an id would put an
     * identifier on a device without a press, which is P-1 read backwards — and the player would
     * silently become a second player to `docs/26 K4`.
     */
    for (const playerId of [undefined, '', ID.toUpperCase(), `${ID}0`, 42]) {
      expect(readConsent(write({ version: CONSENT_SCHEMA_VERSION, state: 'granted', playerId }))).toEqual(UNASKED);
    }
  });

  it('refuses an identifier that is not 128 bits of hex at the writer too', () => {
    const store = memoryStore();
    expect(grantConsent(store, 'not-an-id').durable).toBe(false);
    expect(store.slots.size).toBe(0);
    expect(isPlayerId(ID)).toBe(true);
    expect(isPlayerId('not-an-id')).toBe(false);
  });
});

describe('§ 15.2’s four states, as words', () => {
  it('asks once and never again', () => {
    expect(consentAskViewOf('unasked')).toBeDefined();
    for (const state of ['granted', 'refused', 'withdrawn'] as const) {
      // § 10 non-goal 3: no repeated asking after a refusal — and a withdrawal is an answer.
      expect(consentAskViewOf(state), state).toBeUndefined();
    }
  });

  it('offers two answers that are the same shape, and neither is a default', () => {
    const ask = consentAskViewOf('unasked');
    expect(ask?.no).toBe(CONSENT_COPY.no);
    expect(ask?.yes).toBe(CONSENT_COPY.yes);
    // The view carries no field a caller could use to make one look like the way forward. Asserted
    // over the keys rather than described, because § 10 non-goal 3 forbids asymmetric answers and
    // this is the shape that makes one impossible to express.
    expect(Object.keys(ask ?? {}).sort()).toEqual(['body', 'heading', 'later', 'no', 'notCollected', 'yes']);
  });

  it('says what is not collected, because that is what makes the ask credible', () => {
    // § 4.1: the short form of § 2.2's list belongs on the surface. Each clause here is a refusal
    // the schema enforces rather than a promise this copy is making on somebody else's behalf.
    const ask = consentAskViewOf('unasked');
    expect(ask?.notCollected).toMatch(/anything you type/u);
    expect(ask?.notCollected).toMatch(/email address/u);
    expect(ask?.notCollected).toMatch(/where you are/u);
    expect(ask?.notCollected).toMatch(/any other site/u);
  });

  it('says the game is unchanged by a refusal, which is P-6 on the surface', () => {
    expect(consentAssertion(consentAskViewOf('unasked')?.notCollected)).toBe(true);
  });

  it('draws the row off on every state but a grant', () => {
    expect(consentRowViewOf('granted').on).toBe(true);
    expect(consentRowViewOf('granted').value).toBe(CONSENT_ROW_COPY.on);
    for (const state of ['unasked', 'refused', 'withdrawn'] as const) {
      expect(consentRowViewOf(state).on, state).toBe(false);
      expect(consentRowViewOf(state).value, state).toBe(CONSENT_ROW_COPY.off);
    }
  });

  it('tells a withdrawn player which half could fail', () => {
    // § 4.3 requires the surface to say it: the local half is immediate and the server half is a
    // request that can fail. A row that promised deletion outright would be the one sentence here
    // that can lie.
    expect(consentRowViewOf('withdrawn').note).toBe(CONSENT_ROW_COPY.withdrawnNote);
    expect(consentRowViewOf('withdrawn').note).toMatch(/ages out/u);
  });

  it('tells a player whose browser will not remember, on every state', () => {
    for (const state of ['unasked', 'granted', 'refused', 'withdrawn'] as const) {
      expect(consentRowViewOf(state, false).note, state).toBe(CONSENT_ROW_COPY.notDurable);
    }
  });

  it('cites no section, no file and no identifier — charter non-goal 8', () => {
    /*
     * The rule § 4.1's fourth bullet states, held here as well as in the honesty corpus. The corpus
     * is the real instrument (`internal-notation` over the seeded strings); this is the cheap check
     * that fails in milliseconds when somebody pastes a section number into the copy.
     */
    for (const text of [...Object.values(CONSENT_COPY), ...Object.values(CONSENT_ROW_COPY)]) {
      expect(text, text).not.toMatch(/§|\.ts\b|\bdocs\/|#[A-Za-z]/u);
    }
  });
});

/** Whether the ask says, in the player's own words, that saying no changes nothing about the game. */
function consentAssertion(text: string | undefined): boolean {
  return text !== undefined && /Saying no changes nothing about the game/u.test(text);
}
