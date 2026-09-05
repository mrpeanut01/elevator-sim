/**
 * The migration runner, against the one database shape no other test in this package builds.
 *
 * Every other store test opens an **empty** PGlite, which is why nothing in the suite noticed that
 * `CREATE TABLE IF NOT EXISTS` adds no column to a table that already exists. This file builds the
 * database as it stood before `entries.legs` landed, puts a row in it, and then opens a `Store` on
 * it. That is the case issue #333 is about and it is the only case in which the runner does
 * anything at all.
 *
 * **The historical schema below is a fixture and is deliberately not derived from `store.ts`'s own
 * `SCHEMA`.** A fixture computed from the current schema would move with it and would stop
 * reproducing the defect the day somebody edited the wrong line. It is a transcription of `entries`
 * as it stood at `e8aac0d`, the commit before `5ea3805` added the column, with that block's SQL
 * comments dropped and nothing else changed. It is allowed to go stale: what it has to be is *a
 * database this code did not create*, and any old shape does that.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import type { ClaimedMetrics, SubmittedRun } from '../leaderboard/submission.js';
import { PgliteSql } from './pglite.test-helper.js';
import type { Sql, SqlResult } from './sql.js';
import { Store } from './store.js';

// Every test here boots a whole PostgreSQL, for `store.test.ts`'s reason and with its number.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const CLOCK = 1_770_000_000_000;

const RUN: SubmittedRun = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  windowStartS: null,
  seed: '1',
});

const MEASURED: ClaimedMetrics = Object.freeze({
  awtS: 21.4,
  wt95S: 40,
  ttdMeanS: 60,
  pctOverLongWait: 0,
  awtIsValid: true,
});

/**
 * `users` and `entries` as they were before `legs`, plus nothing else.
 *
 * The other four tables are irrelevant to the defect and their absence is itself a small piece of
 * the fixture's job: migration 0 has to create them on a database that has some of the schema and
 * not all of it, which is a shape `IF NOT EXISTS` handles and a `CREATE DATABASE` does not.
 */
const SCHEMA_BEFORE_LEGS = `
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  display_name_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms       BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_display_name ON users (LOWER(display_name));

CREATE TABLE IF NOT EXISTS entries (
  id                  TEXT PRIMARY KEY,
  board_key           TEXT NOT NULL,
  data_hash           TEXT NOT NULL,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seed                TEXT NOT NULL,
  run_json            TEXT NOT NULL,
  awt_s               DOUBLE PRECISION NOT NULL,
  wt95_s              DOUBLE PRECISION NOT NULL,
  ttd_mean_s          DOUBLE PRECISION NOT NULL,
  pct_over_long_wait  DOUBLE PRECISION NOT NULL,
  submitted_at_ms     BIGINT NOT NULL,
  UNIQUE (board_key, data_hash, user_id, seed)
);
CREATE INDEX IF NOT EXISTS entries_board ON entries (board_key, awt_s);
`;

/** A database of the old shape, with one player and one row that carries no count. */
async function databaseBeforeLegs(): Promise<PgliteSql> {
  const sql = new PgliteSql();
  onTestFinished(async () => sql.close());
  await sql.exec(SCHEMA_BEFORE_LEGS);
  await sql.query('INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) VALUES ($1, $2, $3, $4, $5)', [
    'user-ada',
    'ada@example.test',
    'Ada',
    true,
    CLOCK,
  ]);
  await sql.query(
    'INSERT INTO entries (id, board_key, data_hash, user_id, seed, run_json, awt_s, wt95_s, ' +
      'ttd_mean_s, pct_over_long_wait, submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    ['entry-old', 'daily:2026-09-01', 'data-1', 'user-ada', '1', JSON.stringify(RUN), 21.4, 40, 60, 0, CLOCK],
  );
  return sql;
}

async function emptyDatabase(): Promise<PgliteSql> {
  const sql = new PgliteSql();
  onTestFinished(async () => sql.close());
  return sql;
}

/** Every recorded version, ascending, with the instant each was recorded. */
async function register(sql: Sql): Promise<readonly { version: number; appliedAtMs: number }[]> {
  const found = await sql.query('SELECT version, applied_at_ms FROM schema_migrations ORDER BY version ASC');
  return found.rows.map((row) => ({ version: Number(row['version']), appliedAtMs: Number(row['applied_at_ms']) }));
}

/** Whether `entries` has the column, asked of the catalog rather than of a failed query. */
async function legsColumn(sql: Sql): Promise<{ present: boolean; nullable: boolean }> {
  const found = await sql.query(
    `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'legs'`,
  );
  const row = found.rows[0];
  return { present: row !== undefined, nullable: row?.['is_nullable'] === 'YES' };
}

/**
 * A database that lets a test rewrite or refuse a statement.
 *
 * `racingSql.test-helper.ts` fires on `query` and passes `exec` straight through, which is exactly
 * the half this file needs, so the seam is taken again here rather than widened there: nothing that
 * uses `RacingSql` today wants its `exec` intercepted, and a shared helper that grew a second mode
 * would be a helper two files disagree about.
 */
class InterceptingSql implements Sql {
  readonly #inner: Sql;
  readonly #onExec: (text: string) => Promise<string>;
  readonly execs: string[] = [];

  constructor(inner: Sql, onExec: (text: string) => Promise<string>) {
    this.#inner = inner;
    this.#onExec = onExec;
  }

  async query(text: string, params: readonly unknown[] = []): Promise<SqlResult> {
    return this.#inner.query(text, params);
  }

  async exec(text: string): Promise<void> {
    this.execs.push(text);
    await this.#inner.exec(await this.#onExec(text));
  }

  async close(): Promise<void> {
    await this.#inner.close();
  }
}

const AS_IS = async (text: string): Promise<string> => text;

/* -------------------------------------------------------------------------- *
 * The list, and what an empty database gets
 * -------------------------------------------------------------------------- */

describe('the list', () => {
  it('makes migration 0 the shipped schema by reference, so it cannot drift from a copy of it', () => {
    // Read out of the source because there is nothing to import: neither `SCHEMA` nor `MIGRATIONS`
    // is exported, and exporting either to satisfy a test would put a symbol in the package's
    // surface that nothing outside this file calls. `concurrency.test.ts` reads `store.ts` the same
    // way and for the same reason.
    const source = readFileSync(new URL('./store.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/version:\s*0,[\s\S]{0,120}?sql:\s*SCHEMA\b/u);
    // And the transcription this would have been instead. A copy would have to open a template
    // literal here, which is what this refuses.
    expect(source).not.toMatch(/version:\s*0,[\s\S]{0,120}?sql:\s*`/u);
  });

  it('numbers its migrations from 0, contiguously, with no repeats', () => {
    const source = readFileSync(new URL('./store.ts', import.meta.url), 'utf8');
    const block = /const MIGRATIONS[\s\S]*?\n\]\);/u.exec(source)?.[0] ?? '';
    expect(block).not.toBe('');
    const versions = [...block.matchAll(/version:\s*(\d+)/gu)].map((m) => Number(m[1]));
    expect(versions).toEqual(versions.map((_, index) => index));
  });
});

describe('an empty database', () => {
  it('records both migrations, in order, on the injected clock', async () => {
    const sql = await emptyDatabase();
    await Store.open({ sql, now: () => CLOCK });
    expect(await register(sql)).toEqual([
      { version: 0, appliedAtMs: CLOCK },
      { version: 1, appliedAtMs: CLOCK },
    ]);
  });

  it('gets migration 0 unchanged, so `legs` arrives `NOT NULL` from the schema and not from the ALTER', async () => {
    const sql = await emptyDatabase();
    await Store.open({ sql, now: () => CLOCK });
    // This is what says migration 0 was the shipped schema rather than a transcription of it: only
    // `SCHEMA` declares the column `NOT NULL`, and migration 1's `ADD COLUMN IF NOT EXISTS` is a
    // no-op here. A database created today therefore cannot hold a row with no count.
    expect(await legsColumn(sql)).toEqual({ present: true, nullable: false });
  });

  it('applies nothing on a second open, and does not restamp the first', async () => {
    const sql = await emptyDatabase();
    let clock = CLOCK;
    await Store.open({ sql, now: () => clock });
    clock = CLOCK + 86_400_000;
    await Store.open({ sql, now: () => clock });
    expect(await register(sql)).toEqual([
      { version: 0, appliedAtMs: CLOCK },
      { version: 1, appliedAtMs: CLOCK },
    ]);
  });

  it('writes the version row before the migration, which is the whole race design', async () => {
    const inner = await emptyDatabase();
    const sql = new InterceptingSql(inner, AS_IS);
    await Store.open({ sql, now: () => CLOCK });
    const migrations = sql.execs.filter((text) => text.includes('INSERT INTO schema_migrations'));
    expect(migrations).toHaveLength(2);
    for (const text of migrations) {
      // A loser's batch has to abort on the primary key before its DDL runs. If the migration ever
      // moves in front of the row that claims it, that stops being true and this fails.
      expect(text.trimStart().startsWith('INSERT INTO schema_migrations')).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The database the issue is about
 * -------------------------------------------------------------------------- */

describe('a database created before `entries.legs`', () => {
  it('is broken in both directions before the runner touches it, which is the premise', async () => {
    const sql = await databaseBeforeLegs();
    // The read: the key is absent rather than null, so the mapping that used `Number` produced
    // `NaN` for every row on every board.
    const read = await sql.query('SELECT * FROM entries');
    expect(Object.prototype.hasOwnProperty.call(read.rows[0] ?? {}, 'legs')).toBe(false);
    expect(Number((read.rows[0] ?? {})['legs'])).toBeNaN();
    // The write: `42703`, undefined column, on every submission.
    await expect(
      sql.query('INSERT INTO entries (id, board_key, data_hash, user_id, seed, run_json, awt_s, wt95_s, ttd_mean_s, pct_over_long_wait, legs, submitted_at_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [
        'entry-new', 'daily:2026-09-02', 'data-1', 'user-ada', '2', '{}', 1, 1, 1, 0, 200, CLOCK,
      ]),
    ).rejects.toMatchObject({ code: '42703' });
  });

  it('applies exactly the missing migrations and adds the column nullable', async () => {
    const sql = await databaseBeforeLegs();
    await Store.open({ sql, now: () => CLOCK });
    expect((await register(sql)).map((r) => r.version)).toEqual([0, 1]);
    // Nullable here and `NOT NULL` on a database created today. The divergence is real, it is the
    // price of applying migration 0 unchanged, and it is measured rather than left to be found:
    // this is the only kind of database that can hold a row with no count.
    expect(await legsColumn(sql)).toEqual({ present: true, nullable: true });
  });

  it('reads the row that predates the column, and withholds its count rather than inventing one', async () => {
    const sql = await databaseBeforeLegs();
    const store = await Store.open({ sql, now: () => CLOCK });
    const board = await store.board('daily:2026-09-01', 'awtS', 10);
    expect(board).toHaveLength(1);
    // Rank, name and the mean survive. The denominator does not exist and is not manufactured:
    // `Number(null)` is `0`, and a `0` here would read as an average over no rides at all.
    expect(board[0]?.displayName).toBe('Ada');
    expect(board[0]?.measured.awtS).toBe(21.4);
    expect(board[0]?.legs).toBeUndefined();
  });

  it('accepts a new submission afterwards, with its count, beside the row that has none', async () => {
    const sql = await databaseBeforeLegs();
    const store = await Store.open({ sql, now: () => CLOCK });
    await store.recordEntry({
      boardKey: 'daily:2026-09-01',
      dataHash: 'data-1',
      userId: 'user-ada',
      run: { ...RUN, seed: '2' },
      measured: { ...MEASURED, awtS: 19 },
      legs: 312,
    });
    const board = await store.board('daily:2026-09-01', 'awtS', 10);
    // One row per player, so the new one replaces the old on this board. What matters is that the
    // insert the old database refused now succeeds and carries its own denominator.
    expect(board.map((row) => row.legs)).toEqual([312]);
  });
});

/* -------------------------------------------------------------------------- *
 * Opening at a recorded version
 * -------------------------------------------------------------------------- */

describe('a database at a recorded version', () => {
  it('applies exactly the ones it is missing, and no earlier one', async () => {
    const sql = await databaseBeforeLegs();
    await sql.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms BIGINT NOT NULL);');
    await sql.query('INSERT INTO schema_migrations (version, applied_at_ms) VALUES ($1, $2)', [0, CLOCK - 1]);
    await Store.open({ sql, now: () => CLOCK });
    expect(await register(sql)).toEqual([
      // Untouched: a recorded version is never re-applied and never restamped.
      { version: 0, appliedAtMs: CLOCK - 1 },
      { version: 1, appliedAtMs: CLOCK },
    ]);
    expect(await legsColumn(sql)).toEqual({ present: true, nullable: true });
  });

  it('applies nothing when it is already current, even with the tables missing', async () => {
    // A deliberately incoherent database: the register says everything has run and the tables are
    // not there. The runner believes the register, which is what "records which migrations have
    // run" means, and this test exists so that the behaviour is a decision rather than a surprise.
    const sql = await emptyDatabase();
    await sql.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms BIGINT NOT NULL);');
    await sql.query('INSERT INTO schema_migrations (version, applied_at_ms) VALUES ($1, $2), ($3, $4)', [0, CLOCK, 1, CLOCK]);
    await Store.open({ sql, now: () => CLOCK });
    expect(await legsColumn(sql)).toEqual({ present: false, nullable: false });
  });
});

/* -------------------------------------------------------------------------- *
 * A migration that fails
 * -------------------------------------------------------------------------- */

describe('a migration that fails', () => {
  it('leaves the version unrecorded and the change unapplied, so a restart retries it', async () => {
    const inner = await databaseBeforeLegs();
    // The version row commits with its migration or not at all. Breaking the statement *after* the
    // row is written is the only way to tell the two apart: if the batch were not one transaction,
    // version 1 would be recorded here and the column would be missing forever.
    const broken = new InterceptingSql(inner, async (text) =>
      text.includes('ALTER TABLE entries') ? `${text.split('\n')[0] ?? ''}\nSELECT 1/0;` : text,
    );
    await expect(Store.open({ sql: broken, now: () => CLOCK })).rejects.toMatchObject({ code: '22012' });
    expect((await register(inner)).map((r) => r.version)).toEqual([0]);
    expect(await legsColumn(inner)).toEqual({ present: false, nullable: false });
  });

  it('is applied by the next open, which is what "retries rather than skips" means', async () => {
    const inner = await databaseBeforeLegs();
    const broken = new InterceptingSql(inner, async (text) =>
      text.includes('ALTER TABLE entries') ? `${text.split('\n')[0] ?? ''}\nSELECT 1/0;` : text,
    );
    await expect(Store.open({ sql: broken, now: () => CLOCK })).rejects.toThrow();
    await Store.open({ sql: inner, now: () => CLOCK + 60_000 });
    expect(await register(inner)).toEqual([
      { version: 0, appliedAtMs: CLOCK },
      { version: 1, appliedAtMs: CLOCK + 60_000 },
    ]);
    expect(await legsColumn(inner)).toEqual({ present: true, nullable: true });
  });

  it('does not swallow a unique violation raised by the migration itself', async () => {
    // The recovery path asks whether the version is recorded now, rather than treating every
    // `23505` as "somebody else did it". This is the case that distinction is for: a migration
    // whose own statement collides, on a version nobody has claimed.
    const inner = await databaseBeforeLegs();
    const broken = new InterceptingSql(inner, async (text) =>
      text.includes('ALTER TABLE entries')
        ? `${text.split('\n')[0] ?? ''}\nINSERT INTO users (id, email, display_name, created_at_ms) VALUES ('x', 'ada@example.test', 'X', 1);`
        : text,
    );
    await expect(Store.open({ sql: broken, now: () => CLOCK })).rejects.toMatchObject({ code: '23505' });
    expect((await register(inner)).map((r) => r.version)).toEqual([0]);
  });
});

/* -------------------------------------------------------------------------- *
 * Two containers starting at once
 * -------------------------------------------------------------------------- */

describe('two openers racing', () => {
  it('both succeed, and every version is recorded once', async () => {
    const inner = await emptyDatabase();
    let raced = false;
    // The loser's whole batch is interleaved: the second store opens and migrates completely in the
    // window between the first store deciding what to apply and applying it.
    const racing = new InterceptingSql(inner, async (text) => {
      if (!raced && text.includes('INSERT INTO schema_migrations')) {
        raced = true;
        await Store.open({ sql: inner, now: () => CLOCK });
      }
      return text;
    });
    const store = await Store.open({ sql: racing, now: () => CLOCK });
    expect(raced).toBe(true);
    // One row per version. The loser's `INSERT` hit the primary key, its batch rolled back, it
    // asked whether the version was recorded, and it was.
    expect((await register(inner)).map((r) => r.version)).toEqual([0, 1]);
    // And the store the loser handed back is usable, which is the point of recovering rather than
    // failing: a container that lost a startup race must still serve.
    expect(await store.board('daily:2026-09-01', 'awtS', 10)).toEqual([]);
  });

  it('rolls the loser back before its migration runs, which is why the row goes first', async () => {
    // The observation the design rests on. A statement is appended *after* the migration in the
    // loser's batch: if the batch aborted on the primary key, as claimed, that statement never
    // runs and the table it creates is not there. If the version row went last instead, it would
    // run, and the loser would have applied a migration somebody else had already applied.
    const inner = await databaseBeforeLegs();
    let raced = false;
    const racing = new InterceptingSql(inner, async (text) => {
      if (!raced && text.includes('INSERT INTO schema_migrations')) {
        raced = true;
        await Store.open({ sql: inner, now: () => CLOCK });
        return `${text}\nCREATE TABLE loser_marker (x INTEGER);`;
      }
      return text;
    });
    await Store.open({ sql: racing, now: () => CLOCK });
    expect(raced).toBe(true);
    const marker = await inner.query(`SELECT to_regclass('loser_marker') AS present`);
    expect(marker.rows[0]?.['present'] ?? null).toBeNull();
    expect((await register(inner)).map((r) => r.version)).toEqual([0, 1]);
  });
});

/* -------------------------------------------------------------------------- *
 * The register itself
 * -------------------------------------------------------------------------- */

describe('the register', () => {
  it('tolerates a concurrent creator, which is the one path PGlite cannot reach on its own', async () => {
    const inner = await emptyDatabase();
    await Store.open({ sql: inner, now: () => CLOCK });
    // The table is there. A `CREATE TABLE IF NOT EXISTS` that raises anyway is what PostgreSQL does
    // to the loser of a catalog race, and the runner's answer is to ask whether the table exists.
    const refusing = new InterceptingSql(inner, async (text) => {
      if (text.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) throw catalogRace();
      return text;
    });
    await Store.open({ sql: refusing, now: () => CLOCK });
    expect((await register(inner)).map((r) => r.version)).toEqual([0, 1]);
  });

  it('rethrows when the table really is not there, rather than pressing on blind', async () => {
    const inner = await emptyDatabase();
    const refusing = new InterceptingSql(inner, async (text) => {
      if (text.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) throw catalogRace();
      return text;
    });
    await expect(Store.open({ sql: refusing, now: () => CLOCK })).rejects.toMatchObject({ code: '23505' });
  });
});

/** PostgreSQL's answer to the loser of a `CREATE TABLE IF NOT EXISTS` race, as an error object. */
function catalogRace(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'), {
    code: '23505',
  });
}
