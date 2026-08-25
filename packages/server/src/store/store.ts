/**
 * The database. PostgreSQL, one schema, no ORM, no migration framework.
 *
 * `DECISIONS.md` § D214 § 5 gives sessions a table rather than a JWT — *revocation is a `DELETE`* —
 * and § 4 gives every leaderboard entry a `configHash` so a `data/` change starts a new board
 * instead of corrupting an old one. Both of those are schema decisions, so they live here.
 *
 * ## Three rules this module keeps that are easy to lose
 *
 * **The clock is injected.** `core/` may not read a wall clock (invariant 3) and this package may —
 * it is the one that has to know whether a session has expired. But a *test* that depends on the
 * real clock is a test that fails at midnight, so the clock arrives as a function and the tests pass
 * a counter. That is invariant 3's spirit applied where its letter does not reach.
 *
 * **No credential crosses this boundary, and since § D241 there is no credential to cross it.**
 * `users` used to carry a `scrypt` salt and digest; the password path is gone, so those two columns
 * are gone with it. What the store holds instead is a `login_tokens` row per outstanding sign-in
 * link, and that row is the token's **identity**, never the token: the mailed string is signed by
 * `accounts/credentials.ts` and is readable in exactly one place, the mailbox it was sent to.
 *
 * **The database arrives as a {@link Sql}, and every method is async.** It was `node:sqlite` and
 * synchronous until the server needed somewhere to live that outlives a container filesystem. The
 * driver is injected rather than constructed here so that the tests can run the *same SQL* against
 * an in-process PostgreSQL — see `sql.ts` for why that mattered enough to justify a seam.
 *
 * ## What changed in the dialect, since a silent difference here is a corrupted board
 *
 * `INTEGER` became **`BIGINT`** for every `_ms` column. PostgreSQL's `INTEGER` is four bytes and
 * epoch milliseconds passed 2^31 in 1971, so the old declaration would have overflowed on the
 * first row rather than degrading slowly. `REAL` became **`DOUBLE PRECISION`** for the same class
 * of reason: PostgreSQL's `REAL` is a four-byte float, and rounding a measured AWT to seven
 * significant figures to save four bytes is how a leaderboard starts disagreeing with the run it
 * came from. The boolean columns are real `BOOLEAN`s rather than integers holding 0 or 1, and
 * SQLite's `COLLATE NOCASE` became an index and a predicate over `LOWER(display_name)`.
 *
 * ## What § D241 removed, and what a migration would have had to do
 *
 * `users` lost `salt_hex`, `hash_hex` and `confirmed`, and gained `display_name_chosen`. There is
 * **no migration**, because there is nothing to migrate: the deployed database has never held an
 * account — the password path was never reachable from a viewer that could not find its own API
 * (§ D243) — and this schema is applied by `CREATE TABLE IF NOT EXISTS` against an empty one.
 *
 * That is a claim about a specific database and it will stop being true, so what a migration would
 * need is written down here rather than assumed away. `salt_hex` and `hash_hex` are `NOT NULL` with
 * no default, so an existing `users` table would refuse every insert this code now writes: the
 * migration is `ALTER TABLE users DROP COLUMN salt_hex, DROP COLUMN hash_hex, DROP COLUMN
 * confirmed, ADD COLUMN display_name_chosen BOOLEAN NOT NULL DEFAULT TRUE` — `TRUE` for existing
 * rows, because a name a person actually typed at registration is a chosen one and re-prompting
 * everybody would be the migration lying about them. It does **not** belong hidden in
 * {@link Store.open}; this module's own rule is that when there is something to migrate, the honest
 * thing is a versioned migration table.
 */

import { randomUUID } from 'node:crypto';

import type { IssuedChallenge } from '../challenge/schedule.js';
import type { ChallengeScore, SeedResult } from '../challenge/submission.js';
import type { ClaimedMetrics, SubmittedRun } from '../leaderboard/submission.js';
import type { Sql } from './sql.js';

/* -------------------------------------------------------------------------- *
 * Rows
 * -------------------------------------------------------------------------- */

export interface UserRow {
  readonly id: string;
  /** Normalised: trimmed and lower-cased. {@link normaliseEmail} is the only writer. */
  readonly email: string;
  /** What a leaderboard shows. Never the email — an address is not a display name. */
  readonly displayName: string;
  /**
   * Whether {@link displayName} is one the player chose, or the placeholder they were given.
   *
   * § D241 creates the account when a sign-in link is *asked for*, and that request carries an
   * address and nothing else — it cannot carry a name, because asking for one only when the account
   * is new is exactly the account-existence oracle the uniform response exists to close. So a new
   * account gets `player-<random>` and this flag says so, and the viewer prompts once. Without the
   * flag the client would have to recognise the placeholder by its shape, which is a second place
   * that decides what a generated name looks like.
   */
  readonly displayNameChosen: boolean;
  readonly createdAtMs: number;
}

export interface SessionRow {
  readonly token: string;
  readonly userId: string;
  readonly expiresAtMs: number;
}

/**
 * One outstanding sign-in link, by the identity inside it.
 *
 * The row **is** the single-use guarantee. `accounts/credentials.ts` can prove a token was signed
 * here and has not expired, and it can prove that a thousand times over for a token that was spent
 * on the first — so "used once" is a fact about this table or it is not a fact.
 */
export interface LoginTokenRow {
  readonly jti: string;
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

/**
 * One player's standing on one challenge: their dispatcher, and the server's aggregate over the
 * whole seed set.
 *
 * `dataHash` is part of the identity and not a decoration — see `challenge/submission.ts`'s
 * {@link ChallengeScore} neighbours. A `data/` change inside a running challenge starts a second
 * board under the same challenge id rather than corrupting the first.
 */
export interface ChallengeEntryRow {
  readonly id: string;
  readonly challengeId: string;
  readonly dataHash: string;
  readonly userId: string;
  readonly displayName: string;
  /** The one axis a challenge leaves free. Stored so a row can be replayed and so it can be read. */
  readonly dispatcherProfileId: string;
  readonly score: ChallengeScore;
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
 * The one failure a caller has to be able to tell apart
 * -------------------------------------------------------------------------- */

/**
 * The account a write was for is not there — either it never was, or it stopped being there while
 * the write was in flight.
 *
 * **A class rather than a message, because since `deleteUser` landed the two cases are the same
 * outcome reached two ways and a caller must not have to tell them apart by string.** Before an
 * account could be deleted, a `users` row could not disappear under a submission: {@link
 * Store.recordEntry}'s `userById` check ran, and nothing in the product could falsify it before the
 * `INSERT`. That check **is** a check-then-act, and `DELETE /api/me` is what made the second half
 * reachable — a player deleting their account while a submission is being verified (a whole
 * simulation, so the window is seconds rather than microseconds) races the insert, and the insert
 * loses to the foreign key.
 *
 * What arrived at the caller then was PostgreSQL's own message, naming the constraint and the
 * table, as an unhandled rejection through the `Api` interface and a bare `500` over a socket. The
 * pre-check's civil `no such user` was bypassed by exactly the race the pre-check cannot close.
 *
 * So both paths raise this, `http/api.ts` answers `401` to it, and the message is unchanged from
 * the one the pre-check always threw.
 *
 * **This is not a transaction and does not pretend to be one.** `Store` has no transaction seam at
 * all — `sql.ts` carries `query`, `exec` and `close` — and giving it one is a larger design question
 * than the route that made this reachable. What is closed here is the *reporting*: the outcome is
 * the same whether the account vanished a second before the write or a millisecond into it. A
 * decision number is owed with the route's.
 */
export class NoSuchUserError extends Error {
  constructor(where: string) {
    super(`${where}: no such user`);
    this.name = 'NoSuchUserError';
  }
}

/**
 * Whether a driver error is PostgreSQL's foreign-key violation.
 *
 * **`23503` rather than the message**, because the SQLSTATE is defined by the dialect and the
 * sentence is not: `pg` and PGlite both surface it as `error.code`, and matching on the prose would
 * be matching on something a server version is free to reword. Module-private — nothing outside
 * this file has a driver error in its hand, and it must stay that way.
 */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503';
}

/* -------------------------------------------------------------------------- *
 * The store
 * -------------------------------------------------------------------------- */

/** Everything the store needs from outside itself. */
export interface StoreOptions {
  /** The database. `PgSql` in a real server, `PgliteSql` in a test — the SQL is identical. */
  readonly sql: Sql;
  /** Milliseconds since the epoch. Injected so a test can decide what "now" is. */
  readonly now: () => number;
}

export class Store {
  readonly #sql: Sql;
  readonly #now: () => number;

  /**
   * Private because construction has to apply the schema and applying it is asynchronous.
   *
   * {@link Store.open} is the only way in. A constructor that returned before the tables existed
   * would hand back a store whose first query fails, which is a worse bargain than one `await`.
   */
  private constructor(options: StoreOptions) {
    this.#sql = options.sql;
    this.#now = options.now;
  }

  /** Connect, apply the schema, hand back a usable store. Idempotent — see {@link SCHEMA}. */
  static async open(options: StoreOptions): Promise<Store> {
    // No `PRAGMA foreign_keys = ON` equivalent: SQLite left references unenforced unless asked,
    // which is why that line existed. PostgreSQL always enforces them, so the guarantee the pragma
    // bought is now a property of the database rather than a line that could be deleted.
    await options.sql.exec(SCHEMA);
    return new Store(options);
  }

  async close(): Promise<void> {
    await this.#sql.close();
  }

  /* ---------------------------------------------------------------- users */

  /**
   * Create an account, or report the address is taken.
   *
   * Returns a discriminated result rather than throwing, because "this address already has an
   * account" is an ordinary outcome of a registration form and not an exceptional one.
   */
  async createUser(input: {
    readonly email: string;
    readonly displayName: string;
    /** False for the generated placeholder of § D241, true when a person typed it. */
    readonly displayNameChosen: boolean;
  }): Promise<
    { readonly ok: true; readonly user: UserRow } | { readonly ok: false; readonly reason: 'email-taken' | 'name-taken' }
  > {
    const email = normaliseEmail(input.email);
    if ((await this.userByEmail(email)) !== undefined) return { ok: false, reason: 'email-taken' };
    if ((await this.#userByName(input.displayName)) !== undefined) return { ok: false, reason: 'name-taken' };

    const user: UserRow = {
      id: randomUUID(),
      email,
      displayName: input.displayName,
      displayNameChosen: input.displayNameChosen,
      createdAtMs: this.#now(),
    };
    await this.#sql.query(
      'INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) ' +
        'VALUES ($1, $2, $3, $4, $5)',
      [user.id, user.email, user.displayName, user.displayNameChosen, user.createdAtMs],
    );
    return { ok: true, user };
  }

  async userByEmail(email: string): Promise<UserRow | undefined> {
    return this.#userRow('SELECT * FROM users WHERE email = $1', normaliseEmail(email));
  }

  async userById(id: string): Promise<UserRow | undefined> {
    return this.#userRow('SELECT * FROM users WHERE id = $1', id);
  }

  /**
   * Case-insensitively, because `ada` and `Ada` are one player.
   *
   * `LOWER(display_name) = LOWER($1)` rather than SQLite's `COLLATE NOCASE`, and the unique index
   * in {@link SCHEMA} is on the same expression — the two must fold identically or the lookup
   * would miss a duplicate the index would then refuse, turning a civil "that name is taken" into
   * a constraint violation the caller does not handle.
   */
  async #userByName(displayName: string): Promise<UserRow | undefined> {
    return this.#userRow('SELECT * FROM users WHERE LOWER(display_name) = LOWER($1)', displayName);
  }

  /**
   * Rename a player, or report the name is taken.
   *
   * The only writer of `display_name_chosen`, and it sets it in the same statement — a rename that
   * left the flag alone would leave the viewer prompting forever, and two statements would leave a
   * window where it is neither.
   *
   * Checked with {@link #userByName} before the write **and** guarded by the unique index behind it.
   * The check gives the caller a civil refusal; the index is what makes the guarantee true under two
   * players renaming to the same thing at once, which the check alone cannot promise.
   */
  async setDisplayName(
    id: string,
    displayName: string,
  ): Promise<{ readonly ok: true; readonly user: UserRow } | { readonly ok: false; readonly reason: 'name-taken' | 'no-such-user' }> {
    const clash = await this.#userByName(displayName);
    if (clash !== undefined && clash.id !== id) return { ok: false, reason: 'name-taken' };
    const result = await this.#sql.query(
      'UPDATE users SET display_name = $2, display_name_chosen = TRUE WHERE id = $1',
      [id, displayName],
    );
    if (result.rowCount === 0) return { ok: false, reason: 'no-such-user' };
    const user = await this.userById(id);
    return user === undefined ? { ok: false, reason: 'no-such-user' } : { ok: true, user };
  }

  /**
   * Erase an account, and with it everything in this database that points at one.
   *
   * **One statement, and the cascade is the rest of it.** Every table that references `users` —
   * `sessions`, `login_tokens`, `entries` and `challenge_entries` — declares
   * `user_id … REFERENCES users (id) ON DELETE CASCADE`, so the child rows go inside the same
   * statement as the parent rather than in four more that could fail halfway and leave an account
   * half-erased. Four hand-written deletes here would also be a second place that has to be widened
   * the day a fifth table references `users`, and the day it is not widened is the day erasure
   * quietly stops being erasure. So the derivation is left to the database, and `store.test.ts`
   * reads the foreign keys **out of `pg_constraint`** rather than writing the four names down again.
   *
   * **It takes an id and never an address.** `http/api.ts`'s `deleteAccount` reads that id off the
   * session and the route accepts no other identity, so there is no argument here a request could
   * supply — the one place this could have become a way to erase somebody else.
   *
   * **The caller's own session is one of the rows this removes**, so the token that authorised the
   * deletion stops authorising anything in the same statement. That is the point rather than a side
   * effect: an account that is gone must not have a working key.
   *
   * Returns nothing, unlike {@link consumeLoginToken}, whose `rowCount` **is** its answer. Here the
   * caller has already authenticated the account into existence, so a `false` could only mean a
   * concurrent second deletion — and the right response to that is the same as to the first. A
   * boolean nobody branches on is an invitation to branch on it.
   *
   * A decision number is owed for this and for the route above it; the argument is here and in
   * `http/api.ts`.
   */
  async deleteUser(id: string): Promise<void> {
    await this.#sql.query('DELETE FROM users WHERE id = $1', [id]);
  }

  /* -------------------------------------------------------- sign-in links */

  /**
   * Record an outstanding sign-in link, so that redeeming it can consume it.
   *
   * Takes the token's `jti` and never the token. The distinction is the whole point: a database that
   * held the mailed string would be a database whose backup is a pile of working account keys.
   */
  async createLoginToken(input: LoginTokenRow): Promise<void> {
    await this.#sql.query('INSERT INTO login_tokens (jti, user_id, expires_at_ms) VALUES ($1, $2, $3)', [
      input.jti,
      input.userId,
      input.expiresAtMs,
    ]);
  }

  /**
   * Spend a sign-in link, once.
   *
   * **A single `DELETE` whose `rowCount` is the answer.** Not a `SELECT` then a `DELETE`: two
   * statements are a check-then-act, and the version of that race on this surface is two concurrent
   * redemptions of one link both finding the row and both being handed a session. One statement
   * makes the database the arbiter, and exactly one caller can see `rowCount > 0`.
   *
   * Expired rows are swept on the way past, for the reason {@link Store.userForSession} sweeps
   * expired sessions: a table of tokens that can never authenticate anything is a table that only
   * grows. The sweep is a second statement and does not need to be atomic with the first — it
   * deletes only rows the first could not have accepted anyway.
   */
  async consumeLoginToken(jti: string): Promise<boolean> {
    const result = await this.#sql.query('DELETE FROM login_tokens WHERE jti = $1 AND expires_at_ms > $2', [
      jti,
      this.#now(),
    ]);
    await this.#sql.query('DELETE FROM login_tokens WHERE expires_at_ms <= $1', [this.#now()]);
    return result.rowCount > 0;
  }

  /* ------------------------------------------------------------- sessions */

  async createSession(token: string, userId: string): Promise<SessionRow> {
    const row: SessionRow = { token, userId, expiresAtMs: this.#now() + SESSION_TTL_MS };
    await this.#sql.query('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES ($1, $2, $3)', [
      row.token,
      row.userId,
      row.expiresAtMs,
    ]);
    return row;
  }

  /**
   * The user a session token belongs to, or `undefined`.
   *
   * An expired session is **deleted on the way past** rather than merely refused, so the table does
   * not grow a permanent tail of tokens that can never authenticate anything.
   */
  async userForSession(token: string): Promise<UserRow | undefined> {
    const result = await this.#sql.query('SELECT user_id, expires_at_ms FROM sessions WHERE token = $1', [token]);
    const row = result.rows[0];
    if (row === undefined) return undefined;
    if (Number(row['expires_at_ms']) <= this.#now()) {
      await this.deleteSession(token);
      return undefined;
    }
    return this.userById(String(row['user_id']));
  }

  async deleteSession(token: string): Promise<void> {
    await this.#sql.query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  /* ---------------------------------------------------------- leaderboard */

  /**
   * Record an accepted score.
   *
   * One row per (board, player, seed): re-submitting the same seed **replaces** rather than
   * appends, because a deterministic replay of the same seed is the same run and a board that
   * listed it twice would be counting a refresh as an achievement.
   */
  async recordEntry(input: {
    readonly configHash: string;
    readonly userId: string;
    readonly run: SubmittedRun;
    readonly measured: ClaimedMetrics;
  }): Promise<EntryRow> {
    const user = await this.userById(input.userId);
    if (user === undefined) throw new NoSuchUserError('recordEntry');
    const found = await this.#sql.query(
      'SELECT id FROM entries WHERE config_hash = $1 AND user_id = $2 AND seed = $3',
      [input.configHash, input.userId, input.run.seed],
    );
    const existing = found.rows[0];

    const row: EntryRow = {
      id: existing === undefined ? randomUUID() : String(existing['id']),
      configHash: input.configHash,
      userId: input.userId,
      displayName: user.displayName,
      run: input.run,
      measured: input.measured,
      submittedAtMs: this.#now(),
    };
    // Guarded, because the `userById` above is a check-then-act and `deleteUser` is what made its
    // second half reachable. See {@link NoSuchUserError}.
    try {
      await this.#sql.query(
        'INSERT INTO entries (id, config_hash, user_id, seed, run_json, awt_s, wt95_s, ttd_mean_s, ' +
          'pct_over_long_wait, submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ' +
          'ON CONFLICT (id) DO UPDATE SET run_json = excluded.run_json, awt_s = excluded.awt_s, ' +
          'wt95_s = excluded.wt95_s, ttd_mean_s = excluded.ttd_mean_s, ' +
          'pct_over_long_wait = excluded.pct_over_long_wait, submitted_at_ms = excluded.submitted_at_ms',
        [
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
        ],
      );
    } catch (error) {
      throw await this.#asOwnerError(error, input.userId, 'recordEntry');
    }
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
   *
   * **`DISTINCT ON` rather than the old `GROUP BY e.user_id`.** SQLite allowed selecting `e.*`
   * while grouping by one column and picked an arbitrary row from each group; PostgreSQL rejects
   * that outright, and it was never what the board wanted anyway — it wanted one determinate row
   * per player. `DISTINCT ON (e.user_id)` with the tie-break in its own `ORDER BY` says that
   * directly, and it also retires the correlated `MIN` subquery the old query needed to find each
   * player's best row. The inner ordering picks the row; the outer ordering ranks the board.
   */
  async board(configHash: string, metric: BoardMetric, limit: number): Promise<readonly EntryRow[]> {
    const column = COLUMN_OF[metric];
    const result = await this.#sql.query(
      `SELECT * FROM (` +
        `SELECT DISTINCT ON (e.user_id) e.*, u.display_name AS display_name ` +
        `FROM entries e JOIN users u ON u.id = e.user_id WHERE e.config_hash = $1 ` +
        `ORDER BY e.user_id, e.${column} ASC, e.submitted_at_ms ASC` +
        `) best ORDER BY best.${column} ASC, best.submitted_at_ms ASC LIMIT $2`,
      [configHash, limit],
    );
    return Object.freeze(result.rows.map((row) => entryOf(row)));
  }

  /** Every board that has an entry, most recently posted to first. For the leaderboard index. */
  async boards(): Promise<readonly { readonly configHash: string; readonly entries: number; readonly latestMs: number }[]> {
    const result = await this.#sql.query(
      'SELECT config_hash, COUNT(*) AS entries, MAX(submitted_at_ms) AS latest FROM entries ' +
        'GROUP BY config_hash ORDER BY latest DESC',
    );
    return Object.freeze(
      result.rows.map((row) => ({
        configHash: String(row['config_hash']),
        // `COUNT(*)` and a `BIGINT` `MAX` both come back from `pg` as strings, because a 64-bit
        // integer does not always fit a JS number. These two always do, and `Number` takes either
        // form, so the coercion is the same one the row mappers already used.
        entries: Number(row['entries']),
        latestMs: Number(row['latest']),
      })),
    );
  }

  /* ------------------------------------------------------------ challenges */

  /**
   * Put a challenge on the record — **insert if absent, never overwrite**.
   *
   * The asymmetry is the decision. A challenge is issued by arithmetic over a rotation
   * (`challenge/schedule.ts`), so a re-issue produces the same row and an upsert would be
   * harmless — until the rotation's copy is edited, at which point an overwriting upsert would
   * silently move the window or the seed set of a challenge players are **currently posting to**.
   * That is § D214 § 4's defect with a competition on it: the entries would stop describing the
   * challenge they name. So the first issue wins, and a rotation edit takes effect on the next
   * cycle rather than under the feet of the current one.
   *
   * Returns the row as it now stands, which is the stored one and not necessarily the argument.
   */
  async issueChallenge(challenge: IssuedChallenge): Promise<IssuedChallenge> {
    await this.#sql.query(
      'INSERT INTO challenges (id, opens_at_ms, closes_at_ms, issued_json) VALUES ($1, $2, $3, $4) ' +
        'ON CONFLICT (id) DO NOTHING',
      [challenge.id, challenge.opensAtMs, challenge.closesAtMs, JSON.stringify(challenge)],
    );
    return (await this.challengeById(challenge.id)) ?? challenge;
  }

  async challengeById(id: string): Promise<IssuedChallenge | undefined> {
    const result = await this.#sql.query('SELECT issued_json FROM challenges WHERE id = $1', [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : (JSON.parse(String(row['issued_json'])) as IssuedChallenge);
  }

  /** Challenges the server has issued, most recently opened first. For the challenge index. */
  async recentChallenges(limit: number): Promise<readonly IssuedChallenge[]> {
    const result = await this.#sql.query(
      'SELECT issued_json FROM challenges ORDER BY opens_at_ms DESC LIMIT $1',
      [limit],
    );
    return Object.freeze(result.rows.map((row) => JSON.parse(String(row['issued_json'])) as IssuedChallenge));
  }

  /**
   * Record a verified challenge entry.
   *
   * **One row per (challenge, data, player), and a re-submission replaces it.** Not best-per-metric,
   * which is what the config board does and what would be wrong here: a board that kept each
   * player's best row *per column* would show a different player's dispatcher depending on which
   * metric a reader sorted by, so four readers would be looking at four different boards. Latest
   * wins instead — a challenge entry is the run a player currently stands behind, and switching
   * dispatcher is the move the whole surface exists to make possible.
   */
  async recordChallengeEntry(input: {
    readonly challengeId: string;
    readonly dataHash: string;
    readonly userId: string;
    readonly dispatcherProfileId: string;
    readonly score: ChallengeScore;
  }): Promise<ChallengeEntryRow> {
    const user = await this.userById(input.userId);
    if (user === undefined) throw new NoSuchUserError('recordChallengeEntry');
    const found = await this.#sql.query(
      'SELECT id FROM challenge_entries WHERE challenge_id = $1 AND data_hash = $2 AND user_id = $3',
      [input.challengeId, input.dataHash, input.userId],
    );
    const existing = found.rows[0];

    const row: ChallengeEntryRow = {
      id: existing === undefined ? randomUUID() : String(existing['id']),
      challengeId: input.challengeId,
      dataHash: input.dataHash,
      userId: input.userId,
      displayName: user.displayName,
      dispatcherProfileId: input.dispatcherProfileId,
      score: input.score,
      submittedAtMs: this.#now(),
    };
    // Guarded for {@link recordEntry}'s reason. The `challenge_id` foreign key can also fire here
    // and is deliberately **not** mapped: `issueChallenge` never deletes, so a challenge cannot
    // vanish under a submission, and inventing a branch for an unreachable case is the defect this
    // repository has a standing rule about. `#asOwnerError` distinguishes them by asking whether
    // the account is what went missing, rather than by reading a generated constraint name.
    try {
      await this.#sql.query(
        'INSERT INTO challenge_entries (id, challenge_id, data_hash, user_id, dispatcher_profile_id, ' +
          'runs, legs, mean_awt_s, mean_wt95_s, mean_ttd_mean_s, mean_pct_over_long_wait, ' +
          'per_seed_json, submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ' +
          'ON CONFLICT (id) DO UPDATE SET dispatcher_profile_id = excluded.dispatcher_profile_id, ' +
          'runs = excluded.runs, legs = excluded.legs, mean_awt_s = excluded.mean_awt_s, ' +
          'mean_wt95_s = excluded.mean_wt95_s, mean_ttd_mean_s = excluded.mean_ttd_mean_s, ' +
          'mean_pct_over_long_wait = excluded.mean_pct_over_long_wait, ' +
          'per_seed_json = excluded.per_seed_json, submitted_at_ms = excluded.submitted_at_ms',
        [
          row.id,
          row.challengeId,
          row.dataHash,
          row.userId,
          row.dispatcherProfileId,
          row.score.runs,
          row.score.legs,
          row.score.meanAwtS,
          row.score.meanWt95S,
          row.score.meanTtdMeanS,
          row.score.meanPctOverLongWait,
          JSON.stringify(row.score.perSeed),
          row.submittedAtMs,
        ],
      );
    } catch (error) {
      throw await this.#asOwnerError(error, input.userId, 'recordChallengeEntry');
    }
    return row;
  }

  /**
   * One challenge board, ordered by the mean of `metric`, ascending.
   *
   * Every ranked metric is a cost, so lower is better for all four and there is no direction to get
   * wrong. No best-per-player clause is needed here and its absence is not an oversight: the
   * uniqueness constraint already gives each player exactly one row, so this cannot rank
   * persistence the way an unfiltered config board would.
   */
  async challengeBoard(
    challengeId: string,
    dataHash: string,
    metric: BoardMetric,
    limit: number,
  ): Promise<readonly ChallengeEntryRow[]> {
    const result = await this.#sql.query(
      'SELECT e.*, u.display_name AS display_name FROM challenge_entries e ' +
        'JOIN users u ON u.id = e.user_id WHERE e.challenge_id = $1 AND e.data_hash = $2 ' +
        `ORDER BY e.${CHALLENGE_COLUMN_OF[metric]} ASC, e.submitted_at_ms ASC LIMIT $3`,
      [challengeId, dataHash, limit],
    );
    return Object.freeze(result.rows.map((row) => challengeEntryOf(row)));
  }

  /**
   * Every `data/` generation a challenge has entries under, largest first.
   *
   * So the API can say *how many* entries sit on a board other than the one being shown. Entries
   * set before a mid-challenge `data/` change are not deleted and are not merged; they are counted,
   * and a surface that did neither would be quietly losing rows.
   */
  async challengeDataHashes(
    challengeId: string,
  ): Promise<readonly { readonly dataHash: string; readonly entries: number }[]> {
    const result = await this.#sql.query(
      'SELECT data_hash, COUNT(*) AS entries FROM challenge_entries WHERE challenge_id = $1 ' +
        'GROUP BY data_hash ORDER BY entries DESC',
      [challengeId],
    );
    return Object.freeze(
      result.rows.map((row) => ({ dataHash: String(row['data_hash']), entries: Number(row['entries']) })),
    );
  }

  /* --------------------------------------------------------------- shared */

  /**
   * The error a failed insert should actually raise: {@link NoSuchUserError} when the account is
   * what went missing, and otherwise the driver's own error, untouched.
   *
   * **It asks the database rather than reading the constraint's name.** A foreign-key violation on
   * `challenge_entries` can come from either of its two references, and telling them apart by
   * matching `challenge_entries_user_id_fkey` would be depending on a name PostgreSQL generates and
   * nothing here declares. Re-reading the account answers the question that is actually being
   * asked — *did the owner go away?* — and costs one query on a path that has already failed.
   *
   * A re-check is itself racy in principle, and is not in practice: ids are UUIDs and are never
   * reused, so an account cannot come back between the insert failing and this asking.
   */
  async #asOwnerError(error: unknown, userId: string, where: string): Promise<unknown> {
    if (isForeignKeyViolation(error) && (await this.userById(userId)) === undefined) {
      return new NoSuchUserError(where);
    }
    return error;
  }

  async #userRow(sql: string, parameter: string): Promise<UserRow | undefined> {
    const result = await this.#sql.query(sql, [parameter]);
    const row = result.rows[0];
    if (row === undefined) return undefined;
    return Object.freeze({
      id: String(row['id']),
      email: String(row['email']),
      displayName: String(row['display_name']),
      // A real `BOOLEAN`, so this is the column's own value rather than a comparison against the
      // integer 1. Coerced rather than cast because the two drivers are entitled to disagree about
      // whether that arrives as `true` or as `'t'`.
      displayNameChosen: row['display_name_chosen'] === true || row['display_name_chosen'] === 't',
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

/**
 * The same four metric ids, over the challenge table's mean columns.
 *
 * The **ids are deliberately the same** as the config board's, so a client's metric selector is one
 * control and not two, and so `BOARD_METRICS` remains the single list of what this product will
 * order a board on. Only the column differs, because a challenge row's `awtS` is a mean over the
 * seed set rather than one run's figure.
 */
const CHALLENGE_COLUMN_OF: Readonly<Record<BoardMetric, string>> = Object.freeze({
  awtS: 'mean_awt_s',
  wt95S: 'mean_wt95_s',
  ttdMeanS: 'mean_ttd_mean_s',
  pctOverLongWait: 'mean_pct_over_long_wait',
});

function challengeEntryOf(row: Record<string, unknown>): ChallengeEntryRow {
  return Object.freeze({
    id: String(row['id']),
    challengeId: String(row['challenge_id']),
    dataHash: String(row['data_hash']),
    userId: String(row['user_id']),
    displayName: String(row['display_name']),
    dispatcherProfileId: String(row['dispatcher_profile_id']),
    score: Object.freeze({
      runs: Number(row['runs']),
      legs: Number(row['legs']),
      meanAwtS: Number(row['mean_awt_s']),
      meanWt95S: Number(row['mean_wt95_s']),
      meanTtdMeanS: Number(row['mean_ttd_mean_s']),
      meanPctOverLongWait: Number(row['mean_pct_over_long_wait']),
      // Kept whole, not summarised. The mean above is small enough that a reader is entitled to
      // see every run behind it, and a row that could not be taken apart could not be audited.
      perSeed: JSON.parse(String(row['per_seed_json'])) as readonly SeedResult[],
    }),
    submittedAtMs: Number(row['submitted_at_ms']),
  });
}

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
 *
 * **Every `_ms` column is `BIGINT`, and that is not a style choice.** These hold epoch
 * milliseconds — around 1.77e12 today — and PostgreSQL's `INTEGER` tops out at 2.1e9. Declaring
 * them `INTEGER`, as the SQLite schema did harmlessly, would fail on the first row written.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  -- § D241. False while the name is the placeholder an account gets before its owner has ever
  -- signed in; true once a person has typed one. There is no password column and there never will
  -- be another one: the only credential this product has is an emailed link.
  display_name_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms       BIGINT NOT NULL
);
-- SQLite spelled this \`display_name COLLATE NOCASE\`. The expression index is PostgreSQL's
-- equivalent, and \`#userByName\` folds with the same \`LOWER\` so the lookup and the constraint
-- cannot disagree about what counts as a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS users_display_name ON users (LOWER(display_name));

CREATE TABLE IF NOT EXISTS sessions (
  token          TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at_ms  BIGINT NOT NULL
);

-- One row per outstanding sign-in link, holding the token's identity and never the token. This
-- table is what makes a magic link single-use: the signature stays valid forever, so the row being
-- gone is the only thing that can say a link has been spent.
CREATE TABLE IF NOT EXISTS login_tokens (
  jti            TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at_ms  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_tokens_expiry ON login_tokens (expires_at_ms);

CREATE TABLE IF NOT EXISTS entries (
  id                  TEXT PRIMARY KEY,
  config_hash         TEXT NOT NULL,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seed                TEXT NOT NULL,
  run_json            TEXT NOT NULL,
  awt_s               DOUBLE PRECISION NOT NULL,
  wt95_s              DOUBLE PRECISION NOT NULL,
  ttd_mean_s          DOUBLE PRECISION NOT NULL,
  pct_over_long_wait  DOUBLE PRECISION NOT NULL,
  submitted_at_ms     BIGINT NOT NULL,
  UNIQUE (config_hash, user_id, seed)
);
CREATE INDEX IF NOT EXISTS entries_board ON entries (config_hash, awt_s);

CREATE TABLE IF NOT EXISTS challenges (
  id            TEXT PRIMARY KEY,
  opens_at_ms   BIGINT NOT NULL,
  closes_at_ms  BIGINT NOT NULL,
  issued_json   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenges_window ON challenges (opens_at_ms);

CREATE TABLE IF NOT EXISTS challenge_entries (
  id                       TEXT PRIMARY KEY,
  -- A real reference, not a loose id: an entry for a challenge that was never issued would be a row
  -- nobody could ever replay, because the seeds and the configuration live on the challenge.
  challenge_id             TEXT NOT NULL REFERENCES challenges (id),
  data_hash                TEXT NOT NULL,
  user_id                  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  dispatcher_profile_id    TEXT NOT NULL,
  runs                     INTEGER NOT NULL,
  legs                     INTEGER NOT NULL,
  mean_awt_s               DOUBLE PRECISION NOT NULL,
  mean_wt95_s              DOUBLE PRECISION NOT NULL,
  mean_ttd_mean_s          DOUBLE PRECISION NOT NULL,
  mean_pct_over_long_wait  DOUBLE PRECISION NOT NULL,
  per_seed_json            TEXT NOT NULL,
  submitted_at_ms          BIGINT NOT NULL,
  UNIQUE (challenge_id, data_hash, user_id)
);
CREATE INDEX IF NOT EXISTS challenge_entries_board
  ON challenge_entries (challenge_id, data_hash, mean_awt_s);
`;
