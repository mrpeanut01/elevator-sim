/**
 * The database a store test runs against — § D1629.
 *
 * PostgreSQL (PGlite) by default. A `*.sqlite.test.ts` file calls {@link useTestEngine} with
 * `'sqlite'` and then imports a suite, so the same cases run on SQLite inside the `server` project
 * that `ci.yml` already runs; a new vitest project would run nowhere, because the CI legs name their
 * projects literally (`ciWorkflowMatrix.test.ts`). The choice is a module variable rather than an
 * environment variable because vitest gives each test file a fresh module graph, so it cannot leak
 * into the next file the way `process.env` would in a reused worker.
 *
 * Only the tests that are about the SQL use this. The HTTP and challenge tests keep `PgliteSql`:
 * every statement they reach is a store method these suites already run on both engines.
 */

import { PgliteSql } from './pglite.test-helper.js';
import type { Sql } from './sql.js';
import { SqliteSql } from './sqlite.js';

export type TestEngine = 'postgres' | 'sqlite';

let engine: TestEngine = 'postgres';

/** Set before the suite is imported; every `testSql()` after it opens that engine. */
export function useTestEngine(chosen: TestEngine): void {
  engine = chosen;
}

export function testEngine(): TestEngine {
  return engine;
}

export function testSql(): Sql {
  return engine === 'sqlite' ? new SqliteSql(':memory:') : new PgliteSql();
}

/** One foreign key that points at `users`, as the engine's own catalog describes it. */
export interface UserReference {
  readonly table: string;
  readonly column: string;
  /** Normalised across engines: `cascade` for `ON DELETE CASCADE`, anything else as the engine says it. */
  readonly onDelete: string;
}

/**
 * Every foreign key that points at `users`, read out of the engine's catalog rather than written
 * down, for `store.test.ts`'s erasure tests (§ D213's reason: a list goes stale, the catalog is the
 * schema). PostgreSQL answers from `pg_constraint`, SQLite from `PRAGMA foreign_key_list`.
 */
export async function tablesReferencingUsers(sql: Sql): Promise<readonly UserReference[]> {
  if (sql.dialect === 'sqlite') {
    const tables = await sql.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const found: UserReference[] = [];
    for (const row of tables.rows) {
      const table = String(row['name']);
      const keys = await sql.query(`SELECT * FROM pragma_foreign_key_list('${table}')`);
      for (const key of keys.rows) {
        if (key['table'] !== 'users') continue;
        found.push({
          table,
          column: String(key['from']),
          onDelete: String(key['on_delete']).toUpperCase() === 'CASCADE' ? 'cascade' : String(key['on_delete']),
        });
      }
    }
    return found.sort((a, b) => a.table.localeCompare(b.table) || a.column.localeCompare(b.column));
  }
  const result = await sql.query(
    'SELECT child.relname AS table_name, att.attname AS column_name, con.confdeltype AS on_delete ' +
      'FROM pg_constraint con ' +
      'JOIN pg_class child ON child.oid = con.conrelid ' +
      'JOIN pg_class parent ON parent.oid = con.confrelid ' +
      'CROSS JOIN LATERAL unnest(con.conkey) AS k(attnum) ' +
      'JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum ' +
      "WHERE con.contype = 'f' AND parent.relname = 'users' " +
      'ORDER BY child.relname, att.attname',
  );
  return result.rows.map((row) => ({
    table: String(row['table_name']),
    column: String(row['column_name']),
    // `pg_constraint.confdeltype`: `'c'` is `ON DELETE CASCADE`, `'a'` is `NO ACTION`.
    onDelete: String(row['on_delete']) === 'c' ? 'cascade' : String(row['on_delete']),
  }));
}
