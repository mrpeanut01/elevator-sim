/**
 * Copy a PostgreSQL store into an empty SQLite one, once — § D1630.
 *
 * ## Why at boot, inside the container
 *
 * The deployed PostgreSQL admits Azure services only (`infra/azure/main.bicep`'s `allow-azure-services`
 * rule), so a copy run from an operator's laptop would be refused at the firewall. The container is
 * inside that boundary. So the cutover is a deployment, not a script: the app boots on SQLite with
 * `ELEVATOR_SIM_IMPORT_FROM` holding the old PostgreSQL URL, and `main.ts` calls {@link importOnce}
 * before it serves a request. `infra/README.md` § 8 is the runbook.
 *
 * ## The guards, each one a way this could lose data
 *
 *   * **Only into SQLite, and only before the server starts.** The copy is one SQLite transaction, which
 *     needs one connection with nothing else on it. `PgSql` is a pool, where a `BEGIN` and a `COMMIT` land
 *     on different connections (`store.ts#applyMigrations` says why that is the trap), and a request
 *     served halfway through would read half a copy.
 *   * **Only into a store with no players in it.** A destination holding any account but the house is
 *     refused by name, so a variable left set after the cutover can never overwrite what players have
 *     written since. The house row itself is written by `Store.open` on both sides and skipped by
 *     `ON CONFLICT DO NOTHING`.
 *   * **All of it or none of it.** Every table is copied inside one transaction, and a failure rolls back
 *     to the empty store it found, so the next boot tries again rather than finding half a copy and
 *     refusing it as "has players".
 *   * **Every table, checked rather than listed.** {@link IMPORT_ORDER} is the order parents come
 *     before children; `importer.test.ts` holds it equal to the schema's own table list in both
 *     directions, so a new table cannot be forgotten here.
 *
 * ## A source older than this schema, which is what the first cutover met
 *
 * The importer reads the source as it finds it and never migrates it, and on 2026-11-12 the deployed
 * PostgreSQL turned out to hold the schema of 2026-08-15: no `telemetry_events`, `chime_entries` or
 * `rush_entries`, and an `entries` table keyed by `config_hash` (`store.ts`'s header says why that
 * change has no migration). The current server cannot boot on that database, so nothing could bring
 * it forward first. Two rules follow, and `importer.test.ts` holds both against that schema:
 *
 *   * **A table the source does not have is copied as no rows**, and named in the outcome's
 *     `absentFromSource`, because a table that never existed held nothing to lose.
 *   * **A row the destination has no column for stops the copy by name.** A legacy `entries` row has
 *     no `board_key`, and only a replay can write one, so the copy is refused and rolled back before
 *     a row is dropped quietly. An empty legacy table copies as no rows.
 *
 * The docstring is the record of this (§ D405): it binds nothing outside this module.
 *
 * Copying back from SQLite to PostgreSQL is not built: it would need a transaction on a pool, and it
 * has no caller.
 */

import type { Sql, SqlResult } from './sql.js';
import { HOUSE_USER_ID, Store } from './store.js';

/** Every table the store owns but its migration register, parents before children. */
export const IMPORT_ORDER: readonly string[] = Object.freeze([
  'users',
  'sessions',
  'login_tokens',
  'challenges',
  'entries',
  'challenge_entries',
  'telemetry_events',
  'chime_entries',
  'rush_entries',
]);

export type ImportOutcome =
  | {
      readonly imported: true;
      readonly rows: Readonly<Record<string, number>>;
      /** Tables an older source never had, copied as no rows. Empty for a source on this schema. */
      readonly absentFromSource: readonly string[];
    }
  | { readonly imported: false; readonly reason: 'destination-has-players' | 'source-is-empty' };

export async function importOnce(source: Sql, destination: Sql, now: () => number): Promise<ImportOutcome> {
  if (destination.dialect !== 'sqlite') {
    throw new Error('importOnce: the destination must be SQLite, the one engine where the copy is one transaction.');
  }
  // The schema, the register and the house row, exactly as the server's own open would leave them.
  await Store.open({ sql: destination, now });

  if ((await players(destination)) > 0) return { imported: false, reason: 'destination-has-players' };
  if ((await players(source)) === 0) return { imported: false, reason: 'source-is-empty' };

  const rows: Record<string, number> = {};
  const absentFromSource: string[] = [];
  await destination.query('BEGIN');
  try {
    for (const table of IMPORT_ORDER) {
      const found = await readTable(source, table);
      if (found === undefined) {
        absentFromSource.push(table);
        rows[table] = 0;
        continue;
      }
      const known = await columnsOf(destination, table);
      let copied = 0;
      for (const row of found.rows) {
        const columns = Object.keys(row);
        const unknown = columns.filter((column) => !known.has(column));
        if (unknown.length > 0) {
          throw new Error(
            `importOnce: the source's ${table} has ${String(found.rows.length)} row(s) with column(s) this schema ` +
              `does not have (${unknown.join(', ')}). They are from an older schema and cannot be copied as they ` +
              'are; nothing was imported.',
          );
        }
        const placeholders = columns.map((_, index) => `$${String(index + 1)}`);
        const written = await destination.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
          columns.map((column) => row[column]),
        );
        copied += written.rowCount;
      }
      rows[table] = copied;
    }
    await destination.query('COMMIT');
  } catch (error) {
    await destination.query('ROLLBACK');
    throw error;
  }
  return { imported: true, rows: Object.freeze(rows), absentFromSource: Object.freeze(absentFromSource) };
}

/** Every row of a source table, or `undefined` when the source has no such table (SQLSTATE 42P01). */
async function readTable(source: Sql, table: string): Promise<SqlResult | undefined> {
  try {
    return await source.query(`SELECT * FROM ${table}`);
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01') return undefined;
    throw error;
  }
}

/** The destination's own columns for a table. The destination is SQLite, so this is its pragma. */
async function columnsOf(destination: Sql, table: string): Promise<ReadonlySet<string>> {
  const found = await destination.query(`SELECT name FROM pragma_table_info('${table}')`);
  return new Set(found.rows.map((row) => String(row['name'])));
}

/** Accounts other than the house. */
async function players(sql: Sql): Promise<number> {
  const found = await sql.query('SELECT COUNT(*) AS n FROM users WHERE id <> $1', [HOUSE_USER_ID]);
  return Number(found.rows[0]?.['n'] ?? 0);
}
