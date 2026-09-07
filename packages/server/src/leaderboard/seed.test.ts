/**
 * Seeding a daily board — GitHub issue #222, § D521, and the idempotence GitHub issue #328 asks to
 * have asserted rather than assumed (§ D522).
 *
 * Driven against a whole PostgreSQL and the shipped `data/`, through the same replay the verifier
 * uses: every shipped dispatcher is either seeded or skipped with the verifier's own reason, a
 * second firing on the same date moves nothing, and the ladder still counts nobody.
 */

import { loadConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest';

import { factsResolver } from '../bootstrap.js';
import { PgliteSql } from '../store/pglite.test-helper.js';
import { HOUSE_USER_ID, Store } from '../store/store.js';

import { seedDailyBoard } from './seed.js';
import type { VerificationResources } from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;

let resources: VerificationResources;
let factsFor: ReturnType<typeof factsResolver>;

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  resources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };
  factsFor = factsResolver(config);
}, 60_000);

async function storeOf(): Promise<Store> {
  const store = await Store.open({ sql: new PgliteSql(), now: () => 1_770_000_000_000 });
  onTestFinished(async () => store.close());
  return store;
}

describe('seedDailyBoard', () => {
  it('posts one house row per shipped dispatcher whose mean is quotable, skips the rest with the verifier’s reason, and fires twice without moving', async () => {
    const store = await storeOf();
    const deps = { store, resources, factsFor, now: () => 1_770_000_000_000 };
    const first = await seedDailyBoard(deps, '2026-09-06');

    expect(first.boardKey).toBe('daily:2026-09-06');
    expect(first.seed).toBe('20260906');
    expect(first.seeded.length + first.skipped.length).toBe(resources.dispatcherProfilesById.size);
    expect(first.seeded.length).toBeGreaterThan(5);
    /* `nearest-car` on the daily fixture is measured unquotable (probe, 2026-09-06): skipped as a player would be refused. */
    const nearest = first.skipped.find((row) => row.dispatcherProfileId === 'nearest-car');
    expect(nearest?.code).toBe('awt-not-quotable');
    for (const row of first.skipped) expect(row.detail.length).toBeGreaterThan(20);

    const board = await store.board('daily:2026-09-06', 'awtS', 50);
    expect(board).toHaveLength(first.seeded.length);
    for (const row of board) {
      expect(row.userId).toBe(HOUSE_USER_ID);
      expect(row.baselineProfileId).toBe(row.run.dispatcherProfileId);
      expect(row.legs).toBeGreaterThan(0);
    }
    expect(new Set(board.map((row) => row.baselineProfileId)).size).toBe(board.length);
    /* The house is nobody: the ladder has no observation. */
    expect(await store.axisObservations('daily:2026-09-06', 'awtS')).toEqual([]);

    /* #328's idempotence clause: the same date again is the same rows, by id, and no more of them. */
    const second = await seedDailyBoard(deps, '2026-09-06');
    expect(second.seeded.map((row) => row.entryId).sort()).toEqual(first.seeded.map((row) => row.entryId).sort());
    expect(await store.board('daily:2026-09-06', 'awtS', 50)).toHaveLength(first.seeded.length);
  }, 600_000);
});
