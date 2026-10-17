/**
 * **Where this device keeps its best rush sittings** — the `localStorage` half of
 * `everyday/rushDeviceBest.ts`, [§ D1420](../../../../DECISIONS.md), on `chimeStore.ts`' exact split
 * and for its reasons.
 *
 * The backing is `window.localStorage` when the browser grants it and nothing when it does not; a
 * memory-only store keeps the sitting for the session and never claims it was saved. A singleton
 * where storage is real, so the host that keeps a sitting and the screen that draws it read one
 * record; a fresh store where it is not, so node test files cannot leak sittings into each other.
 */

import {
  RUSH_DEVICE_BEST_KEY,
  RUSH_DEVICE_BEST_QUARANTINE_KEY,
  decodeRushDeviceBest,
  encodeRushDeviceBest,
  withRushDeviceBest,
  type RushDeviceBestRecord,
} from './rushDeviceBest.js';
import {
  RUSH_DEVICE_FURTHEST_KEY,
  RUSH_DEVICE_FURTHEST_QUARANTINE_KEY,
  decodeRushDeviceFurthest,
  encodeRushDeviceFurthest,
  withRushDeviceFurthest,
  type RushDeviceFurthest,
  type RushDeviceFurthestRecord,
} from './rushDeviceFurthest.js';
import type { RushSittingBody } from './rushSitting.js';
import type { SessionStore } from '../persist/types.js';

/** What the host and the rush screen need of the record. */
export interface RushDeviceStore {
  /** The record as it stands, read once and then held. */
  record(): RushDeviceBestRecord;
  /** Keep `body` as `buildingId`'s best when it held longer than the kept one. Returns whether it was kept. */
  offer(buildingId: string, body: RushSittingBody, heldS: number): boolean;
  /**
   * The furthest round per tower, ended by hand or at the line — `rushDeviceFurthest.ts`,
   * [§ D1515](../../../../DECISIONS.md). A slot of its own, on the same backing.
   */
  furthest(): RushDeviceFurthestRecord;
  /** Keep `entry` when it went further than the kept round. Returns whether it was kept. */
  offerFurthest(entry: RushDeviceFurthest): boolean;
  /**
   * **A round was still running when the page went away** — wave AQ, lane AQ-3. The tower it ran
   * on, written at `pagehide` (`host.ts`), read once by the next page, and cleared once said.
   */
  unfinished(): string | undefined;
  markUnfinished(buildingId: string): void;
  clearUnfinished(): void;
  /** The tower a round is running on now, or `undefined` — what `pagehide` marks. Told by `host.ts`. */
  setRunning(buildingId: string | undefined): void;
  running(): string | undefined;
}

/** The slot {@link RushDeviceStore.unfinished} reads. */
export const RUSH_UNFINISHED_KEY = 'elevator-sim.rush-unfinished.v1';

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

/** One slot on the backing: read once and held, quarantined when unreadable, written on change. */
function slotOf<R>(
  backing: SessionStore | undefined,
  key: string,
  quarantineKey: string,
  decode: (raw: string | null) => { readonly record: R; readonly refused: boolean },
  encode: (record: R) => string,
): { readonly load: () => R; readonly save: (record: R) => void } {
  let held: R | undefined;
  let memory: string | null = null;

  const read = (): string | null => {
    if (backing === undefined) return memory;
    try {
      return backing.read(key);
    } catch {
      return null;
    }
  };

  const load = (): R => {
    if (held !== undefined) return held;
    const raw = read();
    const loaded = decode(raw);
    if (loaded.refused && raw !== null && backing !== undefined) {
      try {
        backing.write(quarantineKey, raw);
      } catch {
        /* Quota or a denied write: the bytes stay where they were. */
      }
    }
    held = loaded.record;
    return held;
  };

  const save = (record: R): void => {
    held = record;
    const bytes = encode(record);
    if (backing === undefined) {
      memory = bytes;
      return;
    }
    try {
      backing.write(key, bytes);
    } catch {
      /* A full quota throws on write; the record in memory still draws this session. */
    }
  };

  return { load, save };
}

export function createRushDeviceStore(backing: SessionStore | undefined): RushDeviceStore {
  const best = slotOf(backing, RUSH_DEVICE_BEST_KEY, RUSH_DEVICE_BEST_QUARANTINE_KEY, decodeRushDeviceBest, encodeRushDeviceBest);
  const far = slotOf(
    backing,
    RUSH_DEVICE_FURTHEST_KEY,
    RUSH_DEVICE_FURTHEST_QUARANTINE_KEY,
    decodeRushDeviceFurthest,
    encodeRushDeviceFurthest,
  );

  let unfinishedInMemory: string | undefined;
  let runningOn: string | undefined;

  return {
    record: () => best.load(),
    offer: (buildingId, body, heldS) => {
      const before = best.load();
      const next = withRushDeviceBest(before, buildingId, body, heldS);
      if (next === before) return false;
      best.save(next);
      return true;
    },
    unfinished: () => {
      if (backing === undefined) return unfinishedInMemory;
      try {
        const raw = backing.read(RUSH_UNFINISHED_KEY);
        return raw === null || raw === '' ? undefined : raw;
      } catch {
        return undefined;
      }
    },
    markUnfinished: (buildingId) => {
      if (backing === undefined) {
        unfinishedInMemory = buildingId;
        return;
      }
      try {
        backing.write(RUSH_UNFINISHED_KEY, buildingId);
      } catch {
        /* Nothing to say next time, which is what happened before this slot existed. */
      }
    },
    clearUnfinished: () => {
      unfinishedInMemory = undefined;
      if (backing === undefined) return;
      try {
        backing.remove(RUSH_UNFINISHED_KEY);
      } catch {
        /* A denied write leaves the line to be said once more. */
      }
    },
    setRunning: (buildingId) => {
      runningOn = buildingId;
    },
    running: () => runningOn,
    furthest: () => far.load(),
    offerFurthest: (entry) => {
      const before = far.load();
      const next = withRushDeviceFurthest(before, entry);
      if (next === before) return false;
      far.save(next);
      return true;
    },
  };
}

let shared: RushDeviceStore | undefined;

/** The store — one per page where there is real storage, a fresh one where there is not. */
export function everydayRushDeviceStore(): RushDeviceStore {
  const backing = browserBacking();
  if (backing === undefined) return createRushDeviceStore(undefined);
  if (shared === undefined) {
    const store = createRushDeviceStore(backing);
    shared = store;
    /*
     * Wave AQ lane AQ-3: a page that goes away while a round runs marks it, so the next page can say
     * the round was not kept. A page restored from the back-forward cache is the same round, still
     * running, so the mark comes off again.
     */
    window.addEventListener('pagehide', () => {
      const on = store.running();
      if (on !== undefined) store.markUnfinished(on);
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) store.clearUnfinished();
    });
  }
  return shared;
}
