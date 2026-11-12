/**
 * The SQLite driver and the migration runner on SQLite — § D1630.
 *
 * `migrations.test.ts` stays PostgreSQL's, because it reads PostgreSQL's catalogs; `store.test.ts`
 * and `chimes/ledger.test.ts` run on both engines through the `server-sqlite` project. What is left
 * is what only this driver does, and each case below is one of `sqlite.ts`'s promises.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PgliteSql } from './pglite.test-helper.js';
import type { Sql } from './sql.js';
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

async function register(sql: Sql): Promise<number[]> {
  const found = await sql.query('SELECT version FROM schema_migrations ORDER BY version');
  return found.rows.map((row) => Number(row['version']));
}

describe('migrations on SQLite', () => {
  it('records every version PostgreSQL records, on an empty database', async () => {
    const sqlite = track(new SqliteSql(':memory:'));
    const postgres = track(new PgliteSql());
    await Store.open({ sql: sqlite, now });
    await Store.open({ sql: postgres, now });
    expect(await register(sqlite)).toEqual(await register(postgres));
    expect((await register(sqlite)).length).toBeGreaterThan(1);
  });

  it('applies nothing a second time, and keeps what was written, across a reopened file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'elevator-sim-sqlite-'));
    try {
      const path = join(dir, 'store.db');
      const first = await Store.open({ sql: new SqliteSql(path), now });
      const created = await first.createUser({ email: 'a@example.test', displayName: 'Ada', displayNameChosen: true });
      expect(created.ok).toBe(true);
      await first.close();

      const sql = track(new SqliteSql(path));
      const second = await Store.open({ sql, now: () => CLOCK + 1 });
      expect((await second.userByEmail('a@example.test'))?.displayName).toBe('Ada');
      const applied = await sql.query('SELECT MAX(applied_at_ms) AS latest FROM schema_migrations');
      expect(Number(applied.rows[0]?.['latest'])).toBe(CLOCK);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the SQLite driver', () => {
  it('runs an exec batch as one transaction, as PostgreSQL runs a simple query', async () => {
    const sql = track(new SqliteSql(':memory:'));
    await sql.exec('CREATE TABLE t (n INTEGER)');
    await expect(sql.exec('INSERT INTO t VALUES (1); INSERT INTO missing VALUES (2);')).rejects.toThrow();
    expect((await sql.query('SELECT COUNT(*) AS n FROM t')).rows[0]?.['n']).toBe(0);
  });

  it('reports a unique and a foreign-key violation with PostgreSQL’s SQLSTATE', async () => {
    const sql = track(new SqliteSql(':memory:'));
    await sql.exec(
      'CREATE TABLE p (id TEXT PRIMARY KEY, e TEXT UNIQUE); ' +
        'CREATE TABLE c (id TEXT PRIMARY KEY, p TEXT NOT NULL REFERENCES p (id) ON DELETE CASCADE);',
    );
    await sql.query('INSERT INTO p VALUES ($1, $2)', ['a', 'x']);
    await expect(sql.query('INSERT INTO p VALUES ($1, $2)', ['b', 'x'])).rejects.toMatchObject({ code: '23505' });
    await expect(sql.query('INSERT INTO p VALUES ($1, $2)', ['a', 'y'])).rejects.toMatchObject({ code: '23505' });
    await expect(sql.query('INSERT INTO c VALUES ($1, $2)', ['c', 'none'])).rejects.toMatchObject({ code: '23503' });
  });

  it('counts changed rows for a write and returned rows for a read, as pg does', async () => {
    const sql = track(new SqliteSql(':memory:'));
    await sql.exec('CREATE TABLE t (n INTEGER, b BOOLEAN)');
    expect((await sql.query('INSERT INTO t VALUES ($1, $2), ($3, $4)', [1, true, 2, false])).rowCount).toBe(2);
    expect((await sql.query('UPDATE t SET n = n + 1 WHERE b = $1', [true])).rowCount).toBe(1);
    const returned = await sql.query('DELETE FROM t WHERE n > $1 RETURNING n', [0]);
    expect(returned.rowCount).toBe(2);
    expect(returned.rows.map((row) => row['n']).sort()).toEqual([2, 2]);
  });

  it('cascades a delete, because foreign keys are switched on', async () => {
    const sql = track(new SqliteSql(':memory:'));
    await sql.exec(
      'CREATE TABLE p (id TEXT PRIMARY KEY); ' +
        'CREATE TABLE c (id TEXT PRIMARY KEY, p TEXT NOT NULL REFERENCES p (id) ON DELETE CASCADE);',
    );
    await sql.query('INSERT INTO p VALUES ($1)', ['a']);
    await sql.query('INSERT INTO c VALUES ($1, $2)', ['c', 'a']);
    await sql.query('DELETE FROM p WHERE id = $1', ['a']);
    expect((await sql.query('SELECT COUNT(*) AS n FROM c')).rows[0]?.['n']).toBe(0);
  });
});
