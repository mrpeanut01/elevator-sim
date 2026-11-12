/**
 * SQLite behind the {@link Sql} seam — § D1630.
 *
 * ## Why this exists beside `PgSql`
 *
 * The store's database cost a fixed ≈ $16 a month on Azure Database for PostgreSQL (`infra/README.md`
 * § 5) for a leaderboard that is idle most of the day. A SQLite file on the container's disk, copied
 * continuously to Blob Storage by Litestream, costs pennies, and Litestream's restore on boot is
 * what answers the reason the store left `node:sqlite` in the first place: a container's
 * filesystem does not outlive the container (`store.ts`'s header).
 *
 * Both drivers ship. `bootstrap.ts#sqlFor` picks one from the URL in `ELEVATOR_SIM_DB`, so going
 * back to PostgreSQL is a setting rather than a port, and both run the store's tests: the SQLite leg
 * is the `server-sqlite` project in `vitest.config.ts`.
 *
 * ## What this driver normalises, and why nothing else
 *
 * The seam carries no dialect translation (`sql.ts`), and this file keeps that rule. The query text
 * the store writes is the text SQLite prepares. What differs is the transport, four things in it,
 * and one function, `LOWER`, replaced so a name's case folds as PostgreSQL folds it:
 *
 *   * **Parameters.** `$1` is a *named* parameter to SQLite, so the array is bound as an object
 *     keyed `$1`, `$2`, …. A `true`/`false` becomes `1`/`0`, because SQLite has no boolean and
 *     refuses to bind one, and `undefined` becomes `NULL` as `pg` sends it.
 *   * **`rowCount`.** `pg` reports rows changed for a write and rows returned for a read or a
 *     `RETURNING`; this does the same, from `changes` or from the rows.
 *   * **Errors.** A constraint failure carries PostgreSQL's SQLSTATE in `code` (`23505` unique,
 *     `23503` foreign key), because `store.ts#isUniqueViolation` and `#isForeignKeyViolation` read
 *     only that field, and they must not learn which engine raised it.
 *   * **`exec` is one transaction.** PostgreSQL runs a multi-statement simple query as one implicit
 *     transaction and the migration runner leans on that (`store.ts#applyMigrations`). SQLite does
 *     not, so the batch is wrapped in `BEGIN`/`COMMIT`. That is safe here and was not in `PgSql`:
 *     there is one connection, and `node:sqlite` is synchronous, so nothing can interleave between
 *     the `BEGIN` and the `COMMIT`.
 *
 * ## One connection, one writer
 *
 * A `DatabaseSync` is one connection and every call on it completes before control returns to the
 * event loop, so each statement is atomic against every other request without a lock. That is the
 * property the store's no-transaction design (§ D361) needs, and it is also why the Container App
 * must run **one replica** while this driver is in use: two replicas would be two writers on two
 * copies of the file. `infra/azure/main.bicep` pins `maxReplicas` to 1 when it deploys SQLite.
 */

import { DatabaseSync } from 'node:sqlite';

import type { Sql, SqlResult } from './sql.js';

/**
 * Connection settings. WAL is what Litestream replicates, `NORMAL` is the durability WAL is
 * designed around, and foreign keys are off by default in SQLite, which would silently drop the
 * schema's `ON DELETE CASCADE`.
 */
const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
];

/** SQLite's extended result codes for the two constraint failures the store distinguishes. */
const UNIQUE_CODES = new Set([1555 /* PRIMARYKEY */, 2067 /* UNIQUE */]);
const FOREIGN_KEY_CODE = 787;

export class SqliteSql implements Sql {
  readonly dialect = 'sqlite';
  readonly #db: DatabaseSync;

  /** `path` is a file, or `:memory:` for a test. */
  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    for (const pragma of PRAGMAS) this.#db.exec(pragma);
    // SQLite's own LOWER folds ASCII only, so `Élan` and `élan` would be two display names here and
    // one on PostgreSQL, whose LOWER follows the database's Unicode collation. The unique index
    // `users_display_name` is on LOWER(display_name), so the replacement has to be in place before
    // the schema creates it, and it has to be deterministic for SQLite to index it at all.
    this.#db.function('lower', { deterministic: true }, (value) =>
      typeof value === 'string' ? value.toLowerCase() : value,
    );
  }

  async query(text: string, params: readonly unknown[] = []): Promise<SqlResult> {
    try {
      const statement = this.#db.prepare(text);
      const bound = bindingsOf(params);
      if (statement.columns().length > 0) {
        const rows = statement.all(bound) as Record<string, unknown>[];
        return { rows, rowCount: rows.length };
      }
      const changed = statement.run(bound);
      return { rows: [], rowCount: Number(changed.changes) };
    } catch (error) {
      throw withSqlState(error);
    }
  }

  async exec(text: string): Promise<void> {
    this.#db.exec('BEGIN');
    try {
      this.#db.exec(text);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw withSqlState(error);
    }
  }

  async close(): Promise<void> {
    if (this.#db.isOpen) this.#db.close();
  }
}

/** The positional array as SQLite's named `$n` bindings. */
function bindingsOf(params: readonly unknown[]): Record<string, null | number | bigint | string | Uint8Array> {
  const bound: Record<string, null | number | bigint | string | Uint8Array> = {};
  params.forEach((value, index) => {
    bound[`$${String(index + 1)}`] = toSqlite(value);
  });
  return bound;
}

function toSqlite(value: unknown): null | number | bigint | string | Uint8Array {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`SqliteSql: cannot bind a ${typeof value} as a parameter.`);
}

/** The error as raised, with PostgreSQL's SQLSTATE in `code` for the two the store reads. */
function withSqlState(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return error;
  const errcode = (error as { errcode?: unknown }).errcode;
  if (typeof errcode !== 'number') return error;
  const sqlState = UNIQUE_CODES.has(errcode) ? '23505' : errcode === FOREIGN_KEY_CODE ? '23503' : undefined;
  if (sqlState === undefined) return error;
  return Object.assign(error, { sqliteCode: (error as { code?: unknown }).code, code: sqlState });
}
