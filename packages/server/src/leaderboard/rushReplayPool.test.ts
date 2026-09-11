/// <reference types="node" />

/**
 * **The replay pool's own contract** — PR #513's review, finding 2. `http/replayOffThread.test.ts`
 * drives the route; this drives the pool the route leases from, on the three things the route relies
 * on: a replay across the thread answers **exactly** what the request thread would have (the results
 * stay deterministic), the limit is a limit, and a slot whose thread cannot start is given back rather
 * than lost.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, parseChimeLedger, parseRushPurse } from '@elevator-sim/core';

import { createRushReplays, type RushReplays } from './rushReplayPool.js';
import { replayRushSitting, type SubmittedRushSitting } from './rushSitting.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const GARDEN_HELD_S =
  (
    JSON.parse(readFileSync(new URL('./rushHoldAgreement.json', import.meta.url), 'utf8')) as {
      readonly cells: readonly { readonly buildingId: string; readonly dispatcherProfileId: string; readonly heldS: number | null }[];
    }
  ).cells.find((cell) => cell.buildingId === 'garden-apartments' && cell.dispatcherProfileId === 'collective')?.heldS ?? null;

function gardenSitting(rounds: number, claimedHeldS: number | null = GARDEN_HELD_S): SubmittedRushSitting {
  return { buildingId: 'garden-apartments', rounds: Array.from({ length: rounds }, () => ({ dispatcherProfileId: 'collective', claimedHeldS })) };
}

let pool: RushReplays;

beforeAll(() => {
  pool = createRushReplays({ dataDir: DATA_DIR, limit: 1 });
});

afterAll(async () => {
  await pool.close();
});

describe('the rush replay pool — PR #513, finding 2', () => {
  it('answers on its thread exactly what the request thread answers, for an honest sitting and a forged one', async () => {
    const config = await loadConfig(DATA_DIR);
    const ledger = parseChimeLedger(JSON.parse(readFileSync(join(DATA_DIR, 'chime-ledger.json'), 'utf8')) as unknown);
    const purse = parseRushPurse(JSON.parse(readFileSync(join(DATA_DIR, 'rush-purse.json'), 'utf8')) as unknown);
    const from = {
      resources: {
        buildingsById: config.buildingsById,
        dispatcherProfilesById: config.dispatcherProfilesById,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        dispatcherProfiles: config.dispatcherProfiles,
      },
      purse,
      ledger,
    };
    for (const sitting of [gardenSitting(2), gardenSitting(1, (GARDEN_HELD_S ?? 0) + 2)]) {
      const lease = pool.tryAcquire();
      if (lease === undefined) throw new Error('the pool’s only slot should be free between cases');
      try {
        expect(await lease.replay(sitting)).toEqual(replayRushSitting(sitting, from));
      } finally {
        lease.release();
      }
    }
  });

  it('holds its limit: while the one slot is held nothing else is handed out, and a released slot is free again', () => {
    const held = pool.tryAcquire();
    expect(held).toBeDefined();
    expect(pool.tryAcquire()).toBeUndefined();
    held?.release();
    held?.release();
    const again = pool.tryAcquire();
    expect(again, 'a released slot — released twice — should be exactly one free slot').toBeDefined();
    expect(pool.tryAcquire()).toBeUndefined();
    again?.release();
  });

  it('tells a refused caller to wait longer while more rounds are in flight', async () => {
    const idle = pool.retryAfterS();
    const lease = pool.tryAcquire();
    if (lease === undefined) throw new Error('the pool’s only slot should be free');
    try {
      const replaying = lease.replay(gardenSitting(3));
      const busy = pool.retryAfterS();
      expect(busy).toBeGreaterThanOrEqual(3);
      expect(busy).toBeGreaterThan(idle);
      await replaying;
    } finally {
      lease.release();
    }
    expect(pool.retryAfterS()).toBe(idle);
  });

  it('gives back a slot whose thread cannot start, and says why', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'elevator-replay-pool-'));
    const broken = createRushReplays({ dataDir: empty, limit: 1 });
    try {
      const lease = broken.tryAcquire();
      if (lease === undefined) throw new Error('a new pool’s only slot should be free');
      await expect(lease.replay(gardenSitting(1))).rejects.toThrow(/did not start/u);
      lease.release();
      expect(broken.tryAcquire()).toBeDefined();
    } finally {
      await broken.close();
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('refuses a limit that is not a whole number of at least one', () => {
    expect(() => createRushReplays({ dataDir: DATA_DIR, limit: 0 })).toThrow(/whole number/u);
    expect(() => createRushReplays({ dataDir: DATA_DIR, limit: 1.5 })).toThrow(/whole number/u);
  });
});
