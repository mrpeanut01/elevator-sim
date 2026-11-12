import { afterEach, describe, expect, it } from 'vitest';

import { IMPORT_ORDER, importOnce } from './importer.js';
import { PgliteSql } from './pglite.test-helper.js';
import type { Sql, SqlResult } from './sql.js';
import { SqliteSql } from './sqlite.js';
import { Store } from './store.js';

const CLOCK = 1_770_000_000_000;
const now = (): number => CLOCK;

const opened: Sql[] = [];
afterEach(async () => {
  for (const sql of opened.splice(0)) await sql.close();
});
function track<T extends Sql>(sql: T): T {
  opened.push(sql);
  return sql;
}

/** A PostgreSQL store with one row in every table, written in each table's own types. */
async function populatedPostgres(): Promise<PgliteSql> {
  const sql = track(new PgliteSql());
  await Store.open({ sql, now });
  const at = CLOCK - 1_000;
  await sql.query(
    'INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) VALUES ($1, $2, $3, $4, $5)',
    ['u1', 'ada@example.test', 'Ada', true, at],
  );
  await sql.query('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES ($1, $2, $3)', ['s1', 'u1', CLOCK + 9e6]);
  await sql.query('INSERT INTO login_tokens (jti, user_id, expires_at_ms) VALUES ($1, $2, $3)', ['j1', 'u1', CLOCK + 9e5]);
  await sql.query('INSERT INTO challenges (id, opens_at_ms, closes_at_ms, issued_json) VALUES ($1, $2, $3, $4)', [
    'c1',
    at,
    CLOCK + 1,
    '{}',
  ]);
  await sql.query(
    'INSERT INTO entries (id, board_key, data_hash, user_id, seed, run_json, awt_s, wt95_s, ttd_mean_s, ' +
      'pct_over_long_wait, legs, submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
    ['e1', 'board', 'h', 'u1', '7', '{"seed":"7"}', 21.5, 60.25, 80.125, 0.5, 300, at],
  );
  await sql.query(
    'INSERT INTO challenge_entries (id, challenge_id, data_hash, user_id, dispatcher_profile_id, runs, legs, ' +
      'mean_awt_s, mean_wt95_s, mean_ttd_mean_s, mean_pct_over_long_wait, per_seed_json, submitted_at_ms) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
    ['ce1', 'c1', 'h', 'u1', 'eta', 3, 900, 20, 55, 75, 0.25, '[]', at],
  );
  await sql.query(
    'INSERT INTO telemetry_events (id, player_id, session_id, build_id, name, at_ms, fields_json, received_at_ms) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    ['t1', 'p', 's', 'b', 'opened', 12, '{}', at],
  );
  await sql.query(
    'INSERT INTO chime_entries (id, user_id, seq, direction, entry_key, chimes, balance_after, written_at_ms, turn_key) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    ['ch1', 'u1', 1, 'earn', 'gift', 50, 50, at, null],
  );
  await sql.query(
    'INSERT INTO rush_entries (id, board_key, user_id, building_id, seed, held_s, furthest_wave, rounds_json, ' +
      'submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    ['r1', 'rush:b:d', 'u1', 'b', '9', 412.75, 4, '[]', at],
  );
  return sql;
}

/**
 * The schema the deployed PostgreSQL held at the first cutover, 2026-11-12: `store.ts` as of
 * 2026-08-15 (commit c8fd6fa). Three tables do not exist yet and `entries` is keyed by `config_hash`.
 */
const SCHEMA_OF_2026_08_15 = `
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  display_name_chosen BOOLEAN NOT NULL DEFAULT FALSE, created_at_ms BIGINT NOT NULL);
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at_ms BIGINT NOT NULL);
CREATE TABLE login_tokens (jti TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at_ms BIGINT NOT NULL);
CREATE TABLE entries (id TEXT PRIMARY KEY, config_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, seed TEXT NOT NULL, run_json TEXT NOT NULL,
  awt_s DOUBLE PRECISION NOT NULL, wt95_s DOUBLE PRECISION NOT NULL, ttd_mean_s DOUBLE PRECISION NOT NULL,
  pct_over_long_wait DOUBLE PRECISION NOT NULL, submitted_at_ms BIGINT NOT NULL, UNIQUE (config_hash, user_id, seed));
CREATE TABLE challenges (id TEXT PRIMARY KEY, opens_at_ms BIGINT NOT NULL, closes_at_ms BIGINT NOT NULL,
  issued_json TEXT NOT NULL);
CREATE TABLE challenge_entries (id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL REFERENCES challenges (id),
  data_hash TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  dispatcher_profile_id TEXT NOT NULL, runs INTEGER NOT NULL, legs INTEGER NOT NULL, mean_awt_s DOUBLE PRECISION NOT NULL,
  mean_wt95_s DOUBLE PRECISION NOT NULL, mean_ttd_mean_s DOUBLE PRECISION NOT NULL,
  mean_pct_over_long_wait DOUBLE PRECISION NOT NULL, per_seed_json TEXT NOT NULL, submitted_at_ms BIGINT NOT NULL,
  UNIQUE (challenge_id, data_hash, user_id));
`;

/** A PostgreSQL store on that older schema, with a player and no leaderboard entry. */
async function postgresOf20260815(): Promise<PgliteSql> {
  const sql = track(new PgliteSql());
  await sql.exec(SCHEMA_OF_2026_08_15);
  const at = CLOCK - 1_000;
  await sql.query(
    'INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) VALUES ($1, $2, $3, $4, $5)',
    ['u1', 'ada@example.test', 'Ada', true, at],
  );
  await sql.query('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES ($1, $2, $3)', ['s1', 'u1', CLOCK + 9e6]);
  await sql.query('INSERT INTO challenges (id, opens_at_ms, closes_at_ms, issued_json) VALUES ($1, $2, $3, $4)', [
    'c1',
    at,
    CLOCK + 1,
    '{}',
  ]);
  await sql.query(
    'INSERT INTO challenge_entries (id, challenge_id, data_hash, user_id, dispatcher_profile_id, runs, legs, ' +
      'mean_awt_s, mean_wt95_s, mean_ttd_mean_s, mean_pct_over_long_wait, per_seed_json, submitted_at_ms) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
    ['ce1', 'c1', 'h', 'u1', 'eta', 3, 900, 20, 55, 75, 0.25, '[]', at],
  );
  return sql;
}

async function count(sql: Sql, table: string): Promise<number> {
  return Number((await sql.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.['n']);
}

describe('importOnce — § D1630', () => {
  it('copies every row of every table, and the store reads it back as it was written', async () => {
    const source = await populatedPostgres();
    const destination = track(new SqliteSql(':memory:'));
    const outcome = await importOnce(source, destination, now);
    expect(outcome.imported).toBe(true);
    for (const table of IMPORT_ORDER) {
      expect(await count(destination, table), table).toBe(await count(source, table));
    }
    const store = await Store.open({ sql: destination, now });
    const ada = await store.userByEmail('ada@example.test');
    expect(ada).toMatchObject({ id: 'u1', displayName: 'Ada', displayNameChosen: true, createdAtMs: CLOCK - 1_000 });
    expect((await store.board('board', 'awtS', 10)).map((row) => [row.id, row.measured.awtS, row.legs])).toEqual([
      ['e1', 21.5, 300],
    ]);
    expect(await store.chimeBalance('u1')).toBe(50);
    expect((await store.rushBoard('rush:b:d', 10)).map((row) => row.heldS)).toEqual([412.75]);
  });

  it('refuses a destination that already has players, so a variable left set cannot overwrite them', async () => {
    const source = await populatedPostgres();
    const destination = track(new SqliteSql(':memory:'));
    const store = await Store.open({ sql: destination, now });
    const created = await store.createUser({ email: 'bo@example.test', displayName: 'Bo', displayNameChosen: true });
    expect(created.ok).toBe(true);
    expect(await importOnce(source, destination, now)).toEqual({ imported: false, reason: 'destination-has-players' });
    expect(await count(destination, 'entries')).toBe(0);
  });

  it('says so when there is nothing to copy', async () => {
    const source = track(new PgliteSql());
    await Store.open({ sql: source, now });
    expect(await importOnce(source, track(new SqliteSql(':memory:')), now)).toEqual({
      imported: false,
      reason: 'source-is-empty',
    });
  });

  it('rolls a failed copy back to the empty store, so the next boot can try again', async () => {
    const source = await populatedPostgres();
    const inner = track(new SqliteSql(':memory:'));
    let fail = true;
    const flaky: Sql = {
      dialect: 'sqlite',
      query: async (text: string, params?: readonly unknown[]): Promise<SqlResult> => {
        if (fail && text.startsWith('INSERT INTO chime_entries')) throw new Error('disk went away');
        return inner.query(text, params);
      },
      exec: async (text: string) => inner.exec(text),
      close: async () => inner.close(),
    };
    await expect(importOnce(source, flaky, now)).rejects.toThrow('disk went away');
    expect(await count(inner, 'users')).toBe(1);
    expect(await count(inner, 'entries')).toBe(0);
    fail = false;
    expect((await importOnce(source, flaky, now)).imported).toBe(true);
    expect(await count(inner, 'chime_entries')).toBe(1);
  });

  it('copies a source on the schema of 2026-08-15, naming the tables it never had', async () => {
    const source = await postgresOf20260815();
    const destination = track(new SqliteSql(':memory:'));
    const outcome = await importOnce(source, destination, now);
    expect(outcome).toEqual({
      imported: true,
      rows: {
        users: 1,
        sessions: 1,
        login_tokens: 0,
        challenges: 1,
        entries: 0,
        challenge_entries: 1,
        telemetry_events: 0,
        chime_entries: 0,
        rush_entries: 0,
      },
      absentFromSource: ['telemetry_events', 'chime_entries', 'rush_entries'],
    });
    const store = await Store.open({ sql: destination, now });
    expect(await store.userByEmail('ada@example.test')).toMatchObject({ id: 'u1', displayName: 'Ada' });
    expect(await count(destination, 'challenge_entries')).toBe(1);
  });

  it('stops by name on a row from that schema it has no column for, and copies nothing', async () => {
    const source = await postgresOf20260815();
    await source.query(
      'INSERT INTO entries (id, config_hash, user_id, seed, run_json, awt_s, wt95_s, ttd_mean_s, pct_over_long_wait, ' +
        'submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      ['e1', 'h', 'u1', '7', '{}', 21.5, 60.25, 80.125, 0.5, CLOCK - 1_000],
    );
    const destination = track(new SqliteSql(':memory:'));
    await expect(importOnce(source, destination, now)).rejects.toThrow(/entries has 1 row\(s\) with column\(s\).*config_hash/u);
    expect(await count(destination, 'users')).toBe(1);
    expect(await count(destination, 'challenge_entries')).toBe(0);
  });

  it('reports no absent table for a source on this schema', async () => {
    const outcome = await importOnce(await populatedPostgres(), track(new SqliteSql(':memory:')), now);
    expect(outcome).toMatchObject({ imported: true, absentFromSource: [] });
  });

  it('refuses a PostgreSQL destination, where the copy could not be one transaction', async () => {
    await expect(importOnce(track(new PgliteSql()), track(new PgliteSql()), now)).rejects.toThrow(/must be SQLite/u);
  });

  it('names every table the schema has, parents before children, read from the schema itself', async () => {
    const sql = track(new SqliteSql(':memory:'));
    await Store.open({ sql, now });
    const tables = (
      await sql.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'",
      )
    ).rows.map((row) => String(row['name']));
    expect([...IMPORT_ORDER].sort()).toEqual(tables.sort());
    for (const [index, table] of IMPORT_ORDER.entries()) {
      const parents = (await sql.query(`SELECT "table" AS parent FROM pragma_foreign_key_list('${table}')`)).rows.map(
        (row) => String(row['parent']),
      );
      for (const parent of parents) expect(IMPORT_ORDER.indexOf(parent), `${parent} before ${table}`).toBeLessThan(index);
    }
  });
});
