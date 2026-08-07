/**
 * The one thing `store.ts` needs from a database: run this SQL, give me rows back.
 *
 * ## Why this seam exists, given that an abstraction layer is usually the wrong answer
 *
 * The store used to be `node:sqlite`, which is synchronous and has `':memory:'`, so its 355 lines
 * of tests needed no infrastructure at all. PostgreSQL has neither property. The obvious
 * replacements both fail on something this repository already decided:
 *
 *   * **A `services:` container in CI** runs only on Linux runners. `ci.yml`'s matrix is two
 *     operating systems on purpose — § D201 found the § D196 pin set exactly inverted between
 *     Linux and darwin/arm64 — so a test that can only run on one leg would quietly make the
 *     other leg a weaker suite. Testcontainers fails the same way: GitHub's macOS runners have no
 *     Docker.
 *   * **SQLite in tests, PostgreSQL in production** would mean the shipped SQL is the SQL nothing
 *     runs. That is this repository's most-repeated defect wearing a database: a behaviour that is
 *     configurable, unit-tested and reached by no shipped path has now shipped eleven times, and
 *     the roadmap's standing requirement is to name the non-test caller rather than to trust that
 *     one exists.
 *
 * So the seam is deliberately **as thin as it can be while keeping the SQL identical**. It is not
 * a query builder and it is not an ORM. It carries no dialect translation, no placeholder
 * rewriting and no schema abstraction, because every one of those would reintroduce exactly the
 * gap it exists to close: the query text `store.ts` writes is the query text PostgreSQL receives,
 * in tests and in production alike. What differs between the two is the transport and nothing else.
 *
 * {@link PgSql} is the production driver and its non-test caller is `bootstrap.ts`.
 * `pglite.test-helper.ts` is the other implementation and is named as a test helper because that is
 * all it is — an in-process build of PostgreSQL itself, so what it runs is not an emulation of the
 * dialect but the dialect.
 */

import { Pool } from 'pg';

/** What a query answers with. Deliberately the intersection of what both drivers already return. */
export interface SqlResult {
  readonly rows: readonly Record<string, unknown>[];
  /** Rows the statement changed. `store.ts` uses this to tell "updated" from "matched nothing". */
  readonly rowCount: number;
}

export interface Sql {
  /** One parameterised statement. `$1`-style placeholders, which is PostgreSQL's own syntax. */
  query(text: string, params?: readonly unknown[]): Promise<SqlResult>;
  /** Multi-statement DDL with no parameters. Used once, for the schema. */
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * PostgreSQL over a connection pool.
 *
 * A pool rather than a single connection because a Container App serves requests concurrently and
 * a lone connection would serialise them. The size is left at the driver's default: this is a
 * leaderboard for a simulator, and a tuned pool size would be a number nobody measured.
 */
export class PgSql implements Sql {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString });
  }

  async query(text: string, params: readonly unknown[] = []): Promise<SqlResult> {
    const result = await this.#pool.query(text, params as unknown[]);
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 };
  }

  async exec(text: string): Promise<void> {
    await this.#pool.query(text);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
