/**
 * A database that lets one other statement run at a chosen moment, exactly once.
 *
 * **This is how a check-then-act is tested rather than argued about.** `Store.recordEntry` reads the
 * account, then inserts; the window between those two is what `Store.deleteUser` made falsifiable
 * (issue #254), and a test that merely deleted the account *first* would exercise the pre-check and
 * never the losing branch. Firing on the `INSERT` puts the deletion exactly in the gap,
 * deterministically, with no timing and no flake — a sleep-and-hope test of the same property would
 * be the flakiest test in this repository.
 *
 * The injection point is the {@link Sql} seam `sql.ts` already exists for — the same seam that lets
 * these tests run real PostgreSQL rather than a stand-in — so nothing in `store.ts` knows it is
 * being raced, and the SQL under test is unchanged.
 *
 * **This file is a test helper and is named as one**, matching `pglite.test-helper.ts` and
 * `deadCode.test-helper.ts`. It has no non-test caller and must not acquire one: a production path
 * that could interleave an arbitrary callback into a statement would be a far worse thing than the
 * race it exists to reproduce. `deadCode.test.ts` excludes `.test-helper.ts` from its audit, so the
 * naming convention is what keeps that distinction legible.
 *
 * It is shared by `store.test.ts` and `http/api.test.ts` because both halves of the fix need it —
 * the store must raise the mapped error and the route must answer `401` to it — and a concurrency
 * harness written twice is a harness that drifts.
 */

import type { Sql, SqlResult } from './sql.js';

export class RacingSql implements Sql {
  readonly #inner: Sql;
  readonly #fires: (text: string) => boolean;
  readonly #race: () => Promise<void>;
  /** One-shot, because the raced statement is itself a `DELETE` that comes back through here. */
  #spent = false;

  constructor(inner: Sql, fires: (text: string) => boolean, race: () => Promise<void>) {
    this.#inner = inner;
    this.#fires = fires;
    this.#race = race;
  }

  async query(text: string, params: readonly unknown[] = []): Promise<SqlResult> {
    if (!this.#spent && this.#fires(text)) {
      this.#spent = true;
      await this.#race();
    }
    return this.#inner.query(text, params);
  }

  async exec(text: string): Promise<void> {
    await this.#inner.exec(text);
  }

  async close(): Promise<void> {
    await this.#inner.close();
  }
}
