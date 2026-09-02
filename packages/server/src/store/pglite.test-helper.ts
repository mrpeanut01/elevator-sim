/**
 * PostgreSQL in this process, for tests.
 *
 * PGlite is PostgreSQL compiled to WebAssembly, so this is not a dialect emulation and not a
 * SQLite-shaped stand-in — it is the same database the server talks to in production, running
 * without a daemon, a port or a container. That is what made it usable here when `ci.yml` compared
 * two operating systems on purpose (§ D201): a `services:` container runs only on the Linux leg,
 * GitHub's macOS runners have no Docker, and a test that needed either would leave one leg of the
 * matrix running a smaller suite than the other with nothing saying so.
 *
 * **§ D462 removed the macOS leg**, so that argument no longer applies and the choice is unchanged
 * anyway — the reason it survives its own premise is that a container in CI would still be a
 * daemon a developer's machine has to run, and this file's whole point is that it is not one.
 *
 * **This file is a test helper and is named as one**, matching `deadCode.test-helper.ts` and
 * `probes.test-helper.ts`. It has no non-test caller and is not supposed to acquire one: the
 * production driver is `PgSql` in `sql.ts`, called from `bootstrap.ts`. The naming convention is
 * what keeps that distinction legible, given the roadmap's standing requirement that a shipped
 * behaviour name its non-test caller.
 *
 * Each call gets a fresh in-memory database, which is the replacement for the `':memory:'` the
 * `node:sqlite` store used to take.
 */

import { PGlite } from '@electric-sql/pglite';

import type { Sql, SqlResult } from './sql.js';

/** A throwaway PostgreSQL, empty, in memory. The schema is applied by `Store.open`. */
export class PgliteSql implements Sql {
  readonly #db: PGlite;

  constructor() {
    this.#db = new PGlite();
  }

  async query(text: string, params: readonly unknown[] = []): Promise<SqlResult> {
    const result = await this.#db.query(text, params as unknown[]);
    return {
      rows: result.rows as Record<string, unknown>[],
      // PGlite reports this as `affectedRows`; `pg` calls it `rowCount`. Normalising here rather
      // than in `store.ts` is the point of the seam — the store must not know which driver it has.
      rowCount: result.affectedRows ?? 0,
    };
  }

  async exec(text: string): Promise<void> {
    await this.#db.exec(text);
  }

  async close(): Promise<void> {
    await this.#db.close();
  }
}
