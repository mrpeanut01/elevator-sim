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
import type { RushSittingBody } from './rushSitting.js';
import type { SessionStore } from '../persist/types.js';

/** What the host and the rush screen need of the record. */
export interface RushDeviceStore {
  /** The record as it stands, read once and then held. */
  record(): RushDeviceBestRecord;
  /** Keep `body` as `buildingId`'s best when it held longer than the kept one. Returns whether it was kept. */
  offer(buildingId: string, body: RushSittingBody, heldS: number): boolean;
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

export function createRushDeviceStore(backing: SessionStore | undefined): RushDeviceStore {
  let held: RushDeviceBestRecord | undefined;
  let memory: string | null = null;

  const read = (): string | null => {
    if (backing === undefined) return memory;
    try {
      return backing.read(RUSH_DEVICE_BEST_KEY);
    } catch {
      return null;
    }
  };

  const load = (): RushDeviceBestRecord => {
    if (held !== undefined) return held;
    const raw = read();
    const loaded = decodeRushDeviceBest(raw);
    if (loaded.refused && raw !== null && backing !== undefined) {
      try {
        backing.write(RUSH_DEVICE_BEST_QUARANTINE_KEY, raw);
      } catch {
        /* Quota or a denied write: the bytes stay where they were. */
      }
    }
    held = loaded.record;
    return held;
  };

  const save = (record: RushDeviceBestRecord): void => {
    held = record;
    const bytes = encodeRushDeviceBest(record);
    if (backing === undefined) {
      memory = bytes;
      return;
    }
    try {
      backing.write(RUSH_DEVICE_BEST_KEY, bytes);
    } catch {
      /* A full quota throws on write; the sitting in memory still draws this session. */
    }
  };

  return {
    record: () => load(),
    offer: (buildingId, body, heldS) => {
      const before = load();
      const next = withRushDeviceBest(before, buildingId, body, heldS);
      if (next === before) return false;
      save(next);
      return true;
    },
  };
}

let shared: RushDeviceStore | undefined;

/** The store — one per page where there is real storage, a fresh one where there is not. */
export function everydayRushDeviceStore(): RushDeviceStore {
  const backing = browserBacking();
  if (backing === undefined) return createRushDeviceStore(undefined);
  shared ??= createRushDeviceStore(backing);
  return shared;
}
