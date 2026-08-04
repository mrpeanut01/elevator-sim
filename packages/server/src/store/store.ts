/**
 * The database. `node:sqlite`, one file, no ORM, no migration framework.
 *
 * `DECISIONS.md` § D214 § 5 gives sessions a table rather than a JWT — *revocation is a `DELETE`* —
 * and § 4 gives every leaderboard entry a `configHash` so a `data/` change starts a new board
 * instead of corrupting an old one. Both of those are schema decisions, so they live here.
 *
 * ## Two rules this module keeps that are easy to lose
 *
 * **The clock is injected.** `core/` may not read a wall clock (invariant 3) and this package may —
 * it is the one that has to know whether a session has expired. But a *test* that depends on the
 * real clock is a test that fails at midnight, so the clock arrives as a function and the tests pass
 * a counter. That is invariant 3's spirit applied where its letter does not reach.
 *
 * **A password never crosses this boundary.** The store takes and returns a `PasswordHash` —
 * salt and digest — and has no method that accepts a plaintext one. Hashing is
 * `accounts/credentials.ts`'s job, and a store that could hash would be a store that could log.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import type { PasswordHash } from '../accounts/credentials.js';
import type { ClaimedMetrics, SubmittedRun } from '../leaderboard/submission.js';

/* -------------------------------------------------------------------------- *
 * Rows
 * -------------------------------------------------------------------------- */

export interface UserRow {
  readonly id: string;
  /** Normalised: trimmed and lower-cased. {@link normaliseEmail} is the only writer. */
  readonly email: string;
  /** What a leaderboard shows. Never the email — an address is not a display name. */
  readonly displayName: string;
  readonly password: PasswordHash;
  readonly confirmed: boolean;
  readonly createdAtMs: number;
}

export interface SessionRow {
  readonly token: string;
  readonly userId: string;
  readonly expiresAtMs: number;
}

/** One accepted score. The **server's** metrics; a claim is never persisted (§ D214 § 3). */
export interface EntryRow {
  readonly id: string;
  readonly configHash: string;
  readonly userId: string;
  readonly displayName: string;
  readonly run: SubmittedRun;
  readonly measured: ClaimedMetrics;
  readonly submittedAtMs: number;
}

/** How a board is ordered. Never a composite: § D106 — energy is an axis, never a score. */
export type BoardMetric = 'awtS' | 'wt95S' | 'ttdMeanS' | 'pctOverLongWait';

export const BOARD_METRICS: readonly BoardMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'pctOverLongWait',
]);

/** Session lifetime. Long enough to be usable, short enough that a stolen token expires. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * An address, in the one form the database stores.
 *
 * Case-folded and trimmed, so `Player@Example.test` and `player@example.test ` are the same account
 * rather than two accounts one person cannot tell apart. Exported because registration, login and
 * confirmation must all fold identically — three call sites doing their own `.toLowerCase()` is how
 * they come to disagree.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* -------------------------------------------------------------------------- *
 * The store
 * -------------------------------------------------------------------------- */

/** Everything the store needs from outside itself. */
export interface StoreOptions {
  /** `':memory:'` in tests, a file path in a real server. */
  readonly path: string;
  /** Milliseconds since the epoch. Injected so a test can decide what "now" is. */
  readonly now: () => number;
}

export class Store {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  constructor(options: StoreOptions) {
    this.#db = new DatabaseSync(options.path);
    this.#now = options.now;
    // Foreign keys are off by default in SQLite, which makes a declared reference decoration. A
    // session row pointing at a deleted user is exactly the orphan this catches.
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec(SCHEMA);
  }

  close(): void {
    this.#db.close();
  }

  /* ---------------------------------------------------------------- users */

  /**
   * Create an account, or report the address is taken.
   *
   * Returns a discriminated result rather than throwing, because "this address already has an
   * account" is an ordinary outcome of a registration form and not an exceptional one.
   */
  createUser(input: {
    readonly email: string;
    readonly displayName: string;
    readonly password: PasswordHash;
  }): { readonly ok: true; readonly user: UserRow } | { readonly ok: false; readonly reason: 'email-taken' | 'name-taken' } {
    const email = normaliseEmail(input.email);
    if (this.userByEmail(email) !== undefined) return { ok: false, reason: 'email-taken' };
    if (this.#userByName(input.displayName) !== undefined) return { ok: false, reason: 'name-taken' };

    const user: UserRow = {
      id: randomUUID(),
      email,
      displayName: input.displayName,
      password: input.password,
      confirmed: false,
      createdAtMs: this.#now(),
    };
    this.#db
      .prepare(
        'INSERT INTO users (id, email, display_name, salt_hex, hash_hex, confirmed, created_at_ms) ' +
          'VALUES (?, ?, ?, ?, ?, 0, ?)',
      )
      .run(
        user.id,
        user.email,
        user.displayName,
        user.password.saltHex,
        user.password.hashHex,
        user.createdAtMs,
      );
    return { ok: true, user };
  }

  userByEmail(email: string): UserRow | undefined {
    return this.#userRow('SELECT * FROM users WHERE email = ?', normaliseEmail(email));
  }

  userById(id: string): UserRow | undefined {
    return this.#userRow('SELECT * FROM users WHERE id = ?', id);
  }

  #userByName(displayName: string): UserRow | undefined {
    return this.#userRow('SELECT * FROM users WHERE display_name = ? COLLATE NOCASE', displayName);
  }

  /**
   * Mark an address confirmed.
   *
   * Takes the **address as well as the id** and updates only when both match, because the token
   * that authorises this carries both and a confirmation that ignored the address would confirm
   * whatever address the account had *now* rather than the one that was mailed. `credentials.ts`
   * puts the email inside the signature for the same reason; this is the other half of it.
   */
  confirmUser(id: string, email: string): boolean {
    const result = this.#db
      .prepare('UPDATE users SET confirmed = 1 WHERE id = ? AND email = ?')
      .run(id, normaliseEmail(email));
    return Number(result.changes) > 0;
  }

  /* ------------------------------------------------------------- sessions */

  createSession(token: string, userId: string): SessionRow {
    const row: SessionRow = { token, userId, expiresAtMs: this.#now() + SESSION_TTL_MS };
    this.#db
      .prepare('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES (?, ?, ?)')
      .run(row.token, row.userId, row.expiresAtMs);
    return row;
  }

  /**
   * The user a session token belongs to, or `undefined`.
   *
   * An expired session is **deleted on the way past** rather than merely refused, so the table does
   * not grow a permanent tail of tokens that can never authenticate anything.
   */
  userForSession(token: string): UserRow | undefined {
    const row = this.#db.prepare('SELECT user_id, expires_at_ms FROM sessions WHERE token = ?').get(token) as
      | { user_id: string; expires_at_ms: number }
      | undefined;
    if (row === undefined) return undefined;
    if (Number(row.expires_at_ms) <= this.#now()) {
      this.deleteSession(token);
      return undefined;
    }
    return this.userById(String(row.user_id));
  }

  deleteSession(token: string): void {
    this.#db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  /* ---------------------------------------------------------- leaderboard */

  /**
   * Record an accepted score.
   *
   * One row per (board, player, seed): re-submitting the same seed **replaces** rather than
   * appends, because a deterministic replay of the same seed is the same run and a board that
   * listed it twice would be counting a refresh as an achievement.
   */
  recordEntry(input: {
    readonly configHash: string;
    readonly userId: string;
    readonly run: SubmittedRun;
    readonly measured: ClaimedMetrics;
  }): EntryRow {
    const user = this.userById(input.userId);
    if (user === undefined) throw new Error('recordEntry: no such user');
    const existing = this.#db
      .prepare('SELECT id FROM entries WHERE config_hash = ? AND user_id = ? AND seed = ?')
      .get(input.configHash, input.userId, input.run.seed) as { id: string } | undefined;

    const row: EntryRow = {
      id: existing === undefined ? randomUUID() : String(existing.id),
      configHash: input.configHash,
      userId: input.userId,
      displayName: user.displayName,
      run: input.run,
      measured: input.measured,
      submittedAtMs: this.#now(),
    };
    this.#db
      .prepare(
        'INSERT INTO entries (id, config_hash, user_id, seed, run_json, awt_s, wt95_s, ttd_mean_s, ' +
          'pct_over_long_wait, submitted_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET run_json = excluded.run_json, awt_s = excluded.awt_s, ' +
          'wt95_s = excluded.wt95_s, ttd_mean_s = excluded.ttd_mean_s, ' +
          'pct_over_long_wait = excluded.pct_over_long_wait, submitted_at_ms = excluded.submitted_at_ms',
      )
      .run(
        row.id,
        row.configHash,
        row.userId,
        row.run.seed,
        JSON.stringify(row.run),
        row.measured.awtS,
        row.measured.wt95S,
        row.measured.ttdMeanS,
        row.measured.pctOverLongWait,
        row.submittedAtMs,
      );
    return row;
  }

  /**
   * One board, ordered by `metric`, ascending — every ranked metric here is a cost, so lower is
   * better for all four and there is no direction to get wrong.
   *
   * **Best entry per player**, not every entry. A board that listed all of them would rank
   * persistence: a player submitting a hundred seeds would hold the top hundred places, and the
   * board would stop being a comparison between players.
   *
   * Only `awtIsValid: true` runs are here at all — `verifySubmission` refuses the others on entry
   * (§ D214 § 6), so the suppression rule cannot be worked around by ranking.
   */
  board(configHash: string, metric: BoardMetric, limit: number): readonly EntryRow[] {
    const column = COLUMN_OF[metric];
    const rows = this.#db
      .prepare(
        `SELECT e.* , u.display_name AS display_name FROM entries e JOIN users u ON u.id = e.user_id ` +
          `WHERE e.config_hash = ? AND e.${column} = (` +
          `SELECT MIN(b.${column}) FROM entries b WHERE b.config_hash = e.config_hash AND b.user_id = e.user_id` +
          `) GROUP BY e.user_id ORDER BY e.${column} ASC, e.submitted_at_ms ASC LIMIT ?`,
      )
      .all(configHash, limit) as readonly Record<string, unknown>[];
    return Object.freeze(rows.map((row) => entryOf(row)));
  }

  /** Every board that has an entry, most recently posted to first. For the leaderboard index. */
  boards(): readonly { readonly configHash: string; readonly entries: number; readonly latestMs: number }[] {
    const rows = this.#db
      .prepare(
        'SELECT config_hash, COUNT(*) AS entries, MAX(submitted_at_ms) AS latest FROM entries ' +
          'GROUP BY config_hash ORDER BY latest DESC',
      )
      .all() as readonly Record<string, unknown>[];
    return Object.freeze(
      rows.map((row) => ({
        configHash: String(row['config_hash']),
        entries: Number(row['entries']),
        latestMs: Number(row['latest']),
      })),
    );
  }

  /* --------------------------------------------------------------- shared */

  #userRow(sql: string, parameter: string): UserRow | undefined {
    const row = this.#db.prepare(sql).get(parameter) as Record<string, unknown> | undefined;
    if (row === undefined) return undefined;
    return Object.freeze({
      id: String(row['id']),
      email: String(row['email']),
      displayName: String(row['display_name']),
      password: { saltHex: String(row['salt_hex']), hashHex: String(row['hash_hex']) },
      confirmed: Number(row['confirmed']) === 1,
      createdAtMs: Number(row['created_at_ms']),
    });
  }
}

const COLUMN_OF: Readonly<Record<BoardMetric, string>> = Object.freeze({
  awtS: 'awt_s',
  wt95S: 'wt95_s',
  ttdMeanS: 'ttd_mean_s',
  pctOverLongWait: 'pct_over_long_wait',
});

function entryOf(row: Record<string, unknown>): EntryRow {
  return Object.freeze({
    id: String(row['id']),
    configHash: String(row['config_hash']),
    userId: String(row['user_id']),
    displayName: String(row['display_name']),
    run: JSON.parse(String(row['run_json'])) as SubmittedRun,
    measured: Object.freeze({
      awtS: Number(row['awt_s']),
      wt95S: Number(row['wt95_s']),
      ttdMeanS: Number(row['ttd_mean_s']),
      pctOverLongWait: Number(row['pct_over_long_wait']),
      // Only quotable runs are ever stored, so this is a fact about the table rather than a column.
      awtIsValid: true,
    }),
    submittedAtMs: Number(row['submitted_at_ms']),
  });
}

/**
 * The schema, as one statement.
 *
 * `IF NOT EXISTS` throughout, so opening an existing database is the same code path as creating
 * one. There is no migration framework because there is nothing to migrate yet; when there is, the
 * honest thing is a versioned migration table and not an `ALTER` hidden in a constructor.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  salt_hex      TEXT NOT NULL,
  hash_hex      TEXT NOT NULL,
  confirmed     INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_display_name ON users (display_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS sessions (
  token          TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at_ms  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id                  TEXT PRIMARY KEY,
  config_hash         TEXT NOT NULL,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seed                TEXT NOT NULL,
  run_json            TEXT NOT NULL,
  awt_s               REAL NOT NULL,
  wt95_s              REAL NOT NULL,
  ttd_mean_s          REAL NOT NULL,
  pct_over_long_wait  REAL NOT NULL,
  submitted_at_ms     INTEGER NOT NULL,
  UNIQUE (config_hash, user_id, seed)
);
CREATE INDEX IF NOT EXISTS entries_board ON entries (config_hash, awt_s);
`;
