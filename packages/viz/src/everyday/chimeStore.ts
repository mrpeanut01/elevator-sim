/**
 * **The one device chime store this page has** — the DOM half of `everyday/deviceChimes.ts`, on
 * the split `profileStore.ts` / `profile.ts` and `careerStore.ts` / `careerPersist.ts` already
 * keep. [§ D711](../../../../DECISIONS.md) clause 1, [§ D911](../../../../DECISIONS.md), GitHub
 * issue **#579**.
 *
 * The backing is `window.localStorage` when the browser grants it and nothing when it does not — a
 * private window that throws on touch, or the node test environment. A memory-only store is the
 * honest answer there: the tally is kept for the session and **the player is never told it was
 * saved**, which is `careerStore.ts`' rule and the reason {@link DeviceChimeStore.durable} exists.
 *
 * A singleton on `careerStore.ts`' exact condition, and for its exact reason: real backing, one
 * store, because the fix-it screen spends a tally the Settings panel draws and two instances would
 * be two tallies; no backing, nothing to share, so nothing is shared — a *process* running many
 * hosts (every node test file) has no `localStorage`, and a shared memory store there would leak
 * one test's turns into the next.
 */

import {
  DEVICE_CHIMES_KEY,
  DEVICE_CHIMES_QUARANTINE_KEY,
  decodeDeviceChimes,
  deviceBalanceOf,
  emptyDeviceChimes,
  encodeDeviceChimes,
  withSpend,
  withTurn,
  type DeviceChimeRecord,
  type DeviceChimeRefusal,
  type DeviceSpend,
  type DeviceSpendOutcome,
} from './deviceChimes.js';
import type { SessionStore } from '../persist/types.js';
import type { ChimeTurn } from '@elevator-sim/core/browser';

export interface DeviceChimeStore {
  /** What this device has finished and bought. Read from storage on the first ask, then held. */
  record(): DeviceChimeRecord;
  /** The balance a player reads, derived — never a stored number. */
  balance(): number;
  /** Whether the tally will survive this tab. `false` where storage is denied; never claimed falsely. */
  durable(): boolean;
  /** Why the stored bytes were not read, or `undefined`. `empty` is not a refusal — see the decoder. */
  refusal(): DeviceChimeRefusal | undefined;
  /** Record a finished turn, first time only where the turn has an identity. Answers the balance after. */
  bank(turn: ChimeTurn): number;
  /** Buy a scenario's budget rung out of this tally, or say why not. */
  spend(spend: DeviceSpend): DeviceSpendOutcome;
  /**
   * Forget everything and **seal the store**, so nothing this session goes on to do writes it back.
   *
   * `careerStore.ts#clear`'s contract, for its reason: GitHub issue #229's *clear saved progress*
   * must prevent the running session from rewriting the slot, and both keys go because a
   * quarantined record is a record the player still has on this device.
   */
  clear(): void;
}

function browserBacking(): SessionStore | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const storage = window.localStorage;
    return {
      read: (key) => storage.getItem(key),
      write: (key, value) => {
        storage.setItem(key, value);
      },
      remove: (key) => {
        storage.removeItem(key);
      },
    };
  } catch {
    /* Touching `localStorage` itself throws where storage is denied. Memory-only, honestly. */
    return undefined;
  }
}

export function createDeviceChimeStore(backing: SessionStore | undefined): DeviceChimeStore {
  let held: DeviceChimeRecord | undefined;
  let refusal: DeviceChimeRefusal | undefined;
  let memory: string | null = null;
  let sealed = false;

  /* Every `SessionStore` method may throw — `careerStore.ts` says so, and a browser with site data
   * blocked throws on the **read** rather than only on the getter `browserBacking` guards. */
  const read = (): string | null => {
    if (backing === undefined) return memory;
    try {
      return backing.read(DEVICE_CHIMES_KEY);
    } catch {
      return null;
    }
  };

  const setAside = (bytes: string): void => {
    if (backing === undefined) return;
    try {
      backing.write(DEVICE_CHIMES_QUARANTINE_KEY, bytes);
    } catch {
      /* Quota or a denied write. The bytes stay where they are, which is no worse than before. */
    }
  };

  const load = (): DeviceChimeRecord => {
    if (held !== undefined) return held;
    const raw = read();
    const loaded = decodeDeviceChimes(raw);
    refusal = loaded.refusal === 'empty' ? undefined : loaded.refusal;
    if (loaded.refusal !== undefined && loaded.refusal !== 'empty' && raw !== null) setAside(raw);
    held = loaded.record;
    return held;
  };

  const save = (record: DeviceChimeRecord): void => {
    held = record;
    if (sealed) return;
    const bytes = encodeDeviceChimes(record);
    if (backing === undefined) {
      memory = bytes;
      return;
    }
    try {
      backing.write(DEVICE_CHIMES_KEY, bytes);
    } catch {
      /* A full quota throws on write. The tally in memory is unaffected and still spendable, and a
       * notice on every clear would be worse than the silence — `careerStore.ts`' position. */
    }
  };

  return {
    record: () => load(),
    balance: () => deviceBalanceOf(load()),
    durable: () => backing !== undefined,
    refusal: () => {
      load();
      return refusal;
    },
    bank: (turn) => {
      const next = withTurn(load(), turn);
      if (next !== load()) save(next);
      return deviceBalanceOf(next);
    },
    spend: (spend) => {
      const outcome = withSpend(load(), spend);
      if (outcome.kind === 'bought') save(outcome.record);
      return outcome;
    },
    clear: () => {
      /* Seal first, then remove — `careerStore.ts#clear`'s order, for its reason. */
      sealed = true;
      memory = null;
      held = emptyDeviceChimes();
      refusal = undefined;
      if (backing === undefined) return;
      for (const key of [DEVICE_CHIMES_KEY, DEVICE_CHIMES_QUARANTINE_KEY]) {
        try {
          backing.remove(key);
        } catch {
          /* Denied or quota. The seal still holds, so nothing writes the tally back either way. */
        }
      }
    },
  };
}

let shared: DeviceChimeStore | undefined;

/** The store — one per page where there is real storage, a fresh one where there is not. */
export function everydayDeviceChimeStore(): DeviceChimeStore {
  const backing = browserBacking();
  if (backing === undefined) return createDeviceChimeStore(undefined);
  shared ??= createDeviceChimeStore(backing);
  return shared;
}
