/**
 * The database. PostgreSQL, one schema, no ORM, and since § D464 a versioned migration table.
 *
 * `DECISIONS.md` § D214 § 5 gives sessions a table rather than a JWT — *revocation is a `DELETE`* —
 * and § 4 gives every leaderboard entry a digest of the `data/` it was measured against, so a
 * `data/` change is visible rather than silent. Both of those are schema decisions, so they live
 * here.
 *
 * **`entries` carries two identities now and used to carry one**, and the split is
 * `ENGINE_CONTRACT.md` § 12.1's: `board_key` says *which leaderboard this row is on* and `data_hash`
 * says *what data it was measured against*. The single `config_hash` column answered both, and its
 * value was a digest of the building, the dispatcher, the template, the rate and the run length —
 * which is the key the contract forbids in as many words, because every axis in it is one a player
 * picks. `leaderboard/boardKey.ts` holds the argument; what it costs here is a column rename and a
 * column added.
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
 * ## Migrations, and the two this file writes down without running
 *
 * {@link MIGRATIONS} is the versioned list and {@link applyMigrations} is the runner. It exists
 * because one of the changes below stopped being hypothetical: `entries.legs` landed on 2026-09-02
 * as `NOT NULL` with no default, on a table a deployed database may already hold rows in, and
 * `CREATE TABLE IF NOT EXISTS` does not add a column to a table that exists. § D464 has the ruling.
 *
 * The other two are **still** written down rather than run, and now they have somewhere to go.
 *
 * **§ D241's.** `users` lost `salt_hex`, `hash_hex` and `confirmed`, and gained
 * `display_name_chosen`. There is no migration for it, because there is nothing to migrate: the
 * deployed database has never held an account, the password path never having been reachable from a
 * viewer that could not find its own API (§ D243). That is a claim about a specific database and it
 * will stop being true, so what a migration would need is written down here rather than assumed
 * away. `salt_hex` and `hash_hex` are `NOT NULL` with no default, so an existing `users` table
 * would refuse every insert this code now writes: the migration is `ALTER TABLE users DROP COLUMN
 * salt_hex, DROP COLUMN hash_hex, DROP COLUMN confirmed, ADD COLUMN display_name_chosen BOOLEAN
 * NOT NULL DEFAULT TRUE`, with `TRUE` for existing rows, because a name a person actually typed at
 * registration is a chosen one and re-prompting everybody would be the migration lying about them.
 *
 * **`entries`' second identity, on the same terms, and this one is the open question.**
 * `config_hash` became `board_key` **and** `data_hash` on 2026-09-01, and the two hold different
 * things rather than one being a rename of the other. An existing table would need:
 *
 * ```sql
 * ALTER TABLE entries RENAME COLUMN config_hash TO data_hash;
 * ALTER TABLE entries ADD COLUMN board_key TEXT;
 * ```
 *
 * and then a **backfill only the application can write**, because a board key is decided from the
 * run and the day's fixture (`leaderboard/boardKey.ts#placeSubmission`) and neither is a column
 * here: every old row would be replayed through `placeSubmission` from its `run_json` and the
 * fixture for its `submitted_at_ms`, and only then could `board_key` be made `NOT NULL` and the
 * unique constraint moved. There is nothing to migrate today, the deployed database never having
 * held an entry for the reason § D243 gives, and writing the steps down is the alternative to
 * assuming that stays true.
 *
 * **It is deliberately not migration 1.** It is the older of the two changes and would sort first,
 * and it is left unwritten because its backfill is the one shape this runner may not take: a
 * replay inside a migration couples schema versioning to the simulation engine and makes container
 * startup unbounded in time. A `legs` column and a renamed identity are the same class of drift and
 * are not the same size of problem, and saying which one is answered is worth more than answering
 * half of the second one. § D464 records that as an open item rather than a closed one.
 */

import { randomUUID } from 'node:crypto';

import type { IssuedChallenge } from '../challenge/schedule.js';
import type { ChallengeScore, SeedResult } from '../challenge/submission.js';
import type { ClaimedMetrics, SubmittedRun } from '../leaderboard/submission.js';
import type { Sql, SqlResult } from './sql.js';

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
  /** Which board — `daily:YYYY-MM-DD` or `personal:<user id>`. `boardKey.ts#placeSubmission`. */
  readonly boardKey: string;
  /** What data it was measured against — `boardKey.ts#runDataHashOf`. Never a board key. */
  readonly dataHash: string;
  readonly userId: string;
  readonly displayName: string;
  readonly run: SubmittedRun;
  readonly measured: ClaimedMetrics;
  /**
   * Served legs in the measurement window — the `n` behind {@link measured}'s `awtS`.
   *
   * Beside `measured` rather than inside it, and the placement is the decision. `ClaimedMetrics` is
   * *the claim a player makes*; this is never claimed, never compared, and never refused on. It is
   * read off the server's own replay for the same § D214 § 3 reason the four means are, plus a
   * sharper one: a mean's denominator is the single number a cheat would most want to choose, and
   * putting it in the claim would create one more way to refuse an honest player who computed it
   * differently. `challenge/submission.ts#ClaimedSeedMetrics.legs` *is* claimed, because a challenge
   * aggregates across seeds and the client must say which run each figure came from.
   *
   * Here so a board row can print `21.4 s over 312 legs` rather than a bare mean — R13 clause one,
   * which `honesty/properties.ts` states as *"`n = 5` is not a caveat on `11.3 s`; it is part of
   * what `11.3 s` means"*. The row was drawing the mean alone until the honesty corpus said so.
   *
   * **`undefined` is a value this carries, and it means the server has no count for that row.**
   * The column landed on 2026-09-02, after a database was already holding rows, so migration 1
   * ({@link MIGRATIONS}) adds it nullable and writes nothing into the rows that predate it. A count
   * the server cannot substantiate is withheld rather than replaced by a plausible one (§ D464),
   * which is the rule `workPerServedLegKJ` already sits under beside raw energy. Every row this
   * code *writes* carries a number, because `recordEntry` takes one and the column is `NOT NULL`
   * in {@link SCHEMA}. The absent case is history rather than a path.
   *
   * **`Number(null)` is `0`, which is why {@link entryOf} does not reach for it.** A null column
   * read through `Number` would manufacture the backfilled zero the schema comment refuses, and it
   * would do it silently, on a row whose mean would then read as an average over no rides at all.
   */
  readonly legs: number | undefined;
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
 * **Recorded here rather than in `DECISIONS.md`, under § D405.** The absence of a transaction
 * seam is § D361's ruling — *`Store` gains no transactions, and the enumeration that says so is
 * derived* — whose rule is that each write either maps its constraint violation onto an answer
 * the route already has a word for, or lets the write arbitrate. This is the first of those, and
 * `concurrency.test-helper.ts` derives the set it belongs to rather than reading it here.
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

/**
 * Whether a driver error is PostgreSQL's uniqueness violation.
 *
 * `23505`, for {@link isForeignKeyViolation}'s reason and with the same rule about what may be read
 * from it: **the SQLSTATE, never the constraint name.** `users` carries two unique keys and only one
 * of them is the address; `entries` carries a primary key and a natural key. Which one fired is
 * answered by asking the database what is now taken, not by matching `users_email_key` — a name
 * PostgreSQL generates and nothing here declares.
 *
 * Module-private, like its neighbour: nothing outside this file has a driver error in its hand.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
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

  /**
   * Connect, bring the database up to date, hand back a usable store.
   *
   * **This applies migrations rather than a schema.** It used to be one `exec(SCHEMA)`, which is
   * the same thing for an empty database and nothing at all for a database that already has the
   * tables: `CREATE TABLE IF NOT EXISTS` does not add a column. {@link applyMigrations} carries the
   * argument and § D464 carries the ruling.
   *
   * Still idempotent, and still the only way in. A store handed back before its tables exist is a
   * store whose first query fails, which is a worse bargain than one `await`.
   */
  static async open(options: StoreOptions): Promise<Store> {
    // No `PRAGMA foreign_keys = ON` equivalent: SQLite left references unenforced unless asked,
    // which is why that line existed. PostgreSQL always enforces them, so the guarantee the pragma
    // bought is now a property of the database rather than a line that could be deleted.
    await applyMigrations(options.sql, options.now);
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
   *
   * **And it returns it whether the loser lost by a second or by a microsecond** (#266). The two
   * reads above the insert are a check-then-act against `users_email_key` and the
   * `LOWER(display_name)` index: two requests for the same unknown address both pass them and both
   * insert, and the loser used to throw PostgreSQL's own sentence — straight past `createPlayer`'s
   * branch for exactly that case, whose comment reads *"Lost a race to another request for the same
   * address: that account is the right answer"*. That branch was reachable only by the sequential
   * path, which is the one that is not a race.
   *
   * **Which key fired is settled by asking the database**, per {@link isUniqueViolation}. An
   * unexplained `23505` — neither address nor name taken — is re-thrown rather than labelled, on
   * {@link Store.#asOwnerError}'s principle: a mapping that answers a question it did not verify is
   * a worse failure than an unmapped one.
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
    try {
      await this.#sql.query(
        'INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) ' +
          'VALUES ($1, $2, $3, $4, $5)',
        [user.id, user.email, user.displayName, user.displayNameChosen, user.createdAtMs],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if ((await this.userByEmail(email)) !== undefined) return { ok: false, reason: 'email-taken' };
      if ((await this.#userByName(input.displayName)) !== undefined) return { ok: false, reason: 'name-taken' };
      throw error;
    }
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
   *
   * **That last sentence used to be half true, and #266 is the other half.** The index made the
   * *data* true and handed the *caller* a raw `23505`, which `http/api.ts` could only answer with a
   * `500` — for a condition whose word is already in this method's return type. The constraint path
   * now returns what the pre-check returns. It is the more dangerous shape of the stale claim
   * `DECISIONS.md` § D227 records: a sentence that describes a guarantee the code keeps by crashing.
   *
   * A deletion racing the rename needs nothing added: `rowCount === 0` and the re-read's `undefined`
   * both already answer `no-such-user`, which is the write arbitrating rather than a second check.
   */
  async setDisplayName(
    id: string,
    displayName: string,
  ): Promise<{ readonly ok: true; readonly user: UserRow } | { readonly ok: false; readonly reason: 'name-taken' | 'no-such-user' }> {
    const clash = await this.#userByName(displayName);
    if (clash !== undefined && clash.id !== id) return { ok: false, reason: 'name-taken' };
    let result;
    try {
      result = await this.#sql.query(
        'UPDATE users SET display_name = $2, display_name_chosen = TRUE WHERE id = $1',
        [id, displayName],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Asked rather than assumed, for `createUser`'s reason. An `UPDATE` that sets only the name
      // can collide with one of `users`' three unique keys, but *that* is a fact about this
      // statement rather than about the error, and the error is not going to say which.
      const taken = await this.#userByName(displayName);
      if (taken !== undefined && taken.id !== id) return { ok: false, reason: 'name-taken' };
      throw error;
    }
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
   * **Recorded here rather than in `DECISIONS.md`, under § D405.** This and the route above it are
   * § D358's; what is local to this member is the shape of its answer — an id and never an
   * address, the caller's own session among the rows it removes, and no boolean for a caller to
   * branch on.
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
   *
   * **It reads nothing, and it is still a check-then-act** (#266). The read is one frame up:
   * `requestLink` finds or creates the account and then calls this, and a deletion in that gap
   * breaks `login_tokens_user_id_fkey`. That is why the enumeration this issue asked for is over
   * every member that *writes* rather than over the read-then-write pairs a scan of this file can
   * see — a pair whose halves are in two files is invisible to the narrower question.
   */
  async createLoginToken(input: LoginTokenRow): Promise<void> {
    try {
      await this.#sql.query('INSERT INTO login_tokens (jti, user_id, expires_at_ms) VALUES ($1, $2, $3)', [
        input.jti,
        input.userId,
        input.expiresAtMs,
      ]);
    } catch (error) {
      throw await this.#asOwnerError(error, input.userId, 'createLoginToken');
    }
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

  /**
   * Open a session for an account that exists.
   *
   * {@link createLoginToken}'s shape, one route along and with more at stake (#266): `redeemLink`
   * reads the account, checks the address inside the signature against it, and then writes here —
   * and by that point the link has **already been spent**, so a deletion landing in the gap used to
   * cost the player an unexplained `500` and the link both. Mapped, so the route answers what it
   * already answers when the read itself comes back empty.
   */
  async createSession(token: string, userId: string): Promise<SessionRow> {
    const row: SessionRow = { token, userId, expiresAtMs: this.#now() + SESSION_TTL_MS };
    try {
      await this.#sql.query('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES ($1, $2, $3)', [
        row.token,
        row.userId,
        row.expiresAtMs,
      ]);
    } catch (error) {
      throw await this.#asOwnerError(error, userId, 'createSession');
    }
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
   * One row per (board, configuration, player, seed): re-submitting the same seed **replaces**
   * rather than appends, because a deterministic replay of the same seed is the same run and a board
   * that listed it twice would be counting a refresh as an achievement.
   *
   * **`data_hash` joined that key when the board key stopped being a digest of the configuration.**
   * It had to: `personal:<user id>` is one key for every run a player posts, so `(board_key, user,
   * seed)` alone would have collapsed two different configurations at one seed into one row — a
   * personal *record* log that could hold at most one record per seed. On the daily board the
   * fixture pins the seed, so the pair `(board_key, data_hash)` there separates a player's rows by
   * the dispatcher they ran, which is the axis that board compares.
   *
   * **The database keeps that promise now, and until #266 a `SELECT` did.** The upsert conflicted on
   * `id` — the *primary* key — while the guarantee is over the natural key, so
   * the replacement only happened when the pre-read found the row. Two submissions of one seed in
   * flight together both read nothing, both mint a fresh `randomUUID`, and the second violates the
   * natural key: a double-tapped submit answered `500` and posted nothing for the losing half.
   *
   * Conflicting on the natural key makes exactly one caller win and the other update. The row's id
   * comes back from `RETURNING`, because the winner's id is the row's id and inventing one here
   * would be reporting an id that is not in the table. The pre-read is **gone rather than guarded**:
   * with the write arbitrating there is nothing left for it to decide, and
   * {@link Store.consumeLoginToken} already argues that shape — *"not a `SELECT` then a `DELETE`:
   * two statements are a check-then-act"*.
   *
   * The `userById` above stays, and stays a check-then-act. It is not there to decide whether to
   * insert; it is there for `displayName`, which this table does not store. Its race is the foreign
   * key, and that is mapped rather than closed — see {@link NoSuchUserError}.
   */
  async recordEntry(input: {
    readonly boardKey: string;
    readonly dataHash: string;
    readonly userId: string;
    readonly run: SubmittedRun;
    readonly measured: ClaimedMetrics;
    /** {@link EntryRow.legs} — the server's own count, never the client's. */
    readonly legs: number;
  }): Promise<EntryRow> {
    const user = await this.userById(input.userId);
    if (user === undefined) throw new NoSuchUserError('recordEntry');

    const draft = {
      boardKey: input.boardKey,
      dataHash: input.dataHash,
      userId: input.userId,
      displayName: user.displayName,
      run: input.run,
      measured: input.measured,
      legs: input.legs,
      submittedAtMs: this.#now(),
    };
    // Guarded, because the `userById` above is a check-then-act and `deleteUser` is what made its
    // second half reachable. See {@link NoSuchUserError}.
    let written;
    try {
      written = await this.#sql.query(
        'INSERT INTO entries (id, board_key, data_hash, user_id, seed, run_json, awt_s, wt95_s, ' +
          'ttd_mean_s, pct_over_long_wait, legs, submitted_at_ms) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ' +
          'ON CONFLICT (board_key, data_hash, user_id, seed) DO UPDATE SET run_json = excluded.run_json, ' +
          'awt_s = excluded.awt_s, wt95_s = excluded.wt95_s, ttd_mean_s = excluded.ttd_mean_s, ' +
          'pct_over_long_wait = excluded.pct_over_long_wait, legs = excluded.legs, ' +
          'submitted_at_ms = excluded.submitted_at_ms ' +
          'RETURNING id',
        [
          randomUUID(),
          draft.boardKey,
          draft.dataHash,
          draft.userId,
          draft.run.seed,
          JSON.stringify(draft.run),
          draft.measured.awtS,
          draft.measured.wt95S,
          draft.measured.ttdMeanS,
          draft.measured.pctOverLongWait,
          draft.legs,
          draft.submittedAtMs,
        ],
      );
    } catch (error) {
      throw await this.#asOwnerError(error, input.userId, 'recordEntry');
    }
    return { id: idOf(written, 'recordEntry'), ...draft };
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
  async board(boardKey: string, metric: BoardMetric, limit: number): Promise<readonly EntryRow[]> {
    const column = COLUMN_OF[metric];
    const result = await this.#sql.query(
      `SELECT * FROM (` +
        `SELECT DISTINCT ON (e.user_id) e.*, u.display_name AS display_name ` +
        `FROM entries e JOIN users u ON u.id = e.user_id WHERE e.board_key = $1 ` +
        `ORDER BY e.user_id, e.${column} ASC, e.submitted_at_ms ASC` +
        `) best ORDER BY best.${column} ASC, best.submitted_at_ms ASC LIMIT $2`,
      [boardKey, limit],
    );
    return Object.freeze(result.rows.map((row) => entryOf(row)));
  }

  /** Every board that has an entry, most recently posted to first. For the leaderboard index. */
  async boards(): Promise<readonly { readonly boardKey: string; readonly entries: number; readonly latestMs: number }[]> {
    const result = await this.#sql.query(
      'SELECT board_key, COUNT(*) AS entries, MAX(submitted_at_ms) AS latest FROM entries ' +
        'GROUP BY board_key ORDER BY latest DESC',
    );
    return Object.freeze(
      result.rows.map((row) => ({
        boardKey: String(row['board_key']),
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
   *
   * **Conflicting on `UNIQUE (challenge_id, data_hash, user_id)` rather than on `id`**, for
   * {@link Store.recordEntry}'s reason and stated here rather than by reference because it is a
   * different table with a different natural key: the upsert used to name the primary key, so
   * *latest wins* held only when the pre-read found the row and two submissions in flight together
   * failed the second. The row's id comes back from `RETURNING`.
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

    const draft = {
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
    let written;
    try {
      written = await this.#sql.query(
        'INSERT INTO challenge_entries (id, challenge_id, data_hash, user_id, dispatcher_profile_id, ' +
          'runs, legs, mean_awt_s, mean_wt95_s, mean_ttd_mean_s, mean_pct_over_long_wait, ' +
          'per_seed_json, submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ' +
          'ON CONFLICT (challenge_id, data_hash, user_id) DO UPDATE SET ' +
          'dispatcher_profile_id = excluded.dispatcher_profile_id, ' +
          'runs = excluded.runs, legs = excluded.legs, mean_awt_s = excluded.mean_awt_s, ' +
          'mean_wt95_s = excluded.mean_wt95_s, mean_ttd_mean_s = excluded.mean_ttd_mean_s, ' +
          'mean_pct_over_long_wait = excluded.mean_pct_over_long_wait, ' +
          'per_seed_json = excluded.per_seed_json, submitted_at_ms = excluded.submitted_at_ms ' +
          'RETURNING id',
        [
          randomUUID(),
          draft.challengeId,
          draft.dataHash,
          draft.userId,
          draft.dispatcherProfileId,
          draft.score.runs,
          draft.score.legs,
          draft.score.meanAwtS,
          draft.score.meanWt95S,
          draft.score.meanTtdMeanS,
          draft.score.meanPctOverLongWait,
          JSON.stringify(draft.score.perSeed),
          draft.submittedAtMs,
        ],
      );
    } catch (error) {
      throw await this.#asOwnerError(error, input.userId, 'recordChallengeEntry');
    }
    return { id: idOf(written, 'recordChallengeEntry'), ...draft };
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

/**
 * The `id` an upsert's `RETURNING` clause reported, or a loud failure.
 *
 * `INSERT … ON CONFLICT … DO UPDATE … RETURNING id` returns exactly one row on both branches, so
 * the absent case is unreachable — and `String(undefined)` is the string `'undefined'`, which is a
 * row identity a caller would carry away and a board would rank. An unreachable case that degrades
 * into plausible nonsense is worth one line to make it stop.
 */
function idOf(result: SqlResult, where: string): string {
  const id = result.rows[0]?.['id'];
  if (typeof id !== 'string') {
    throw new Error(`${where}: the upsert returned no id. RETURNING is the row's identity here.`);
  }
  return id;
}

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
    boardKey: String(row['board_key']),
    dataHash: String(row['data_hash']),
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
    // `null` and absent are the two shapes a pre-migration row reaches here in, and neither may go
    // through `Number`: it turns the first into `0` and the second into `NaN`, and `0` is the more
    // dangerous of those because it looks like an answer. Measured against this driver rather than
    // assumed — a column the table does not have comes back with the key missing, not as `null`.
    legs: row['legs'] === null || row['legs'] === undefined ? undefined : Number(row['legs']),
    submittedAtMs: Number(row['submitted_at_ms']),
  });
}

/**
 * The schema, as one statement, and **migration 0**.
 *
 * `IF NOT EXISTS` throughout, so opening an existing database is the same code path as creating
 * one. That was the whole mechanism until § D464; it is now the first entry of {@link MIGRATIONS},
 * referenced rather than copied, so an empty database gets exactly the treatment it got before and
 * a database that already has these tables gets the later entries it is missing.
 *
 * **What this block cannot do is the reason the list exists.** `CREATE TABLE IF NOT EXISTS` adds no
 * column to a table that is already there, so every column added here after a database was created
 * is a column that database does not have, and every `INSERT` naming it fails with `42703`. Adding
 * a column below without adding a migration for it reintroduces exactly that.
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
  -- Which leaderboard: 'daily:YYYY-MM-DD' or 'personal:<user id>' (ENGINE_CONTRACT section 12.1).
  -- Never a digest of the configuration: that is the key the contract forbids.
  board_key           TEXT NOT NULL,
  -- What the row was measured against -- leaderboard/boardKey.ts#runDataHashOf. This is the value
  -- the old config_hash column held; what changed is that it no longer decides who ranks beside whom.
  data_hash           TEXT NOT NULL,
  user_id             TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seed                TEXT NOT NULL,
  run_json            TEXT NOT NULL,
  awt_s               DOUBLE PRECISION NOT NULL,
  wt95_s              DOUBLE PRECISION NOT NULL,
  ttd_mean_s          DOUBLE PRECISION NOT NULL,
  pct_over_long_wait  DOUBLE PRECISION NOT NULL,
  -- Served legs in the row's measurement window: the n behind awt_s, and the reason a board row
  -- may print a mean at all (R13 clause one). The SERVER's count, from its own replay -- a client
  -- never sends one, because a denominator is the number a cheat would most want to choose.
  -- NOT NULL and no default: this landed before any database held a row, and the honest thing once
  -- one does is the versioned migration this file's schema docstring names, not a backfilled zero.
  legs                INTEGER NOT NULL,
  submitted_at_ms     BIGINT NOT NULL,
  UNIQUE (board_key, data_hash, user_id, seed)
);
CREATE INDEX IF NOT EXISTS entries_board ON entries (board_key, awt_s);

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

/* -------------------------------------------------------------------------- *
 * Migrations
 * -------------------------------------------------------------------------- */

/**
 * The register of what has already run.
 *
 * Created outside the migration list and before anything reads it, because a runner whose own
 * bookkeeping table were migration 0 could not record migration 0. `CREATE TABLE IF NOT EXISTS`
 * makes that safe to repeat; {@link ensureRegister} says what it does about two containers doing it
 * at the same instant.
 *
 * `version` is the primary key, and that is the whole of the concurrency design. See {@link
 * applyMigrations}.
 *
 * **Declared after {@link SCHEMA} on purpose.** `concurrency.test-helper.ts#schemaFacts` finds the
 * shipped schema as *the first string literal in this file containing `CREATE TABLE`*, so a second
 * such literal placed above it would leave the whole concurrency audit reading this four-line table
 * as the product's schema and reporting no risk anywhere. Moving this constant upwards breaks that
 * audit silently, which is the one direction it may never fail in.
 */
const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version        INTEGER PRIMARY KEY,
  applied_at_ms  BIGINT NOT NULL
);
`;

/** One step, and the version that records it. */
interface Migration {
  /** Ascending, contiguous, and never reused. An id here is a name. */
  readonly version: number;
  /**
   * What it is, so a failure names something a reader can find rather than a number.
   *
   * Read by {@link recordOf}'s guard rather than only by a reader of this list, which is the
   * difference between a field and a comment. It is deliberately not in the SQL: a name in a
   * column would be a second place the identity of a migration is written down, and the version is
   * already the identity.
   */
  readonly name: string;
  /**
   * The SQL, with no `$1` placeholders and no parameters.
   *
   * Neither is an oversight. {@link applyMigrations} sends each migration through `Sql.exec`, whose
   * whole value here is that PostgreSQL runs a multi-statement simple query as one implicit
   * transaction. Parameters would force the extended protocol, which carries exactly one statement,
   * and the atomicity would be gone with them.
   */
  readonly sql: string;
}

/**
 * Every migration, in the order they are applied.
 *
 * **Migration 0 is {@link SCHEMA} itself, by reference rather than by copy.** An empty database
 * therefore gets byte-identical treatment to the one `exec(SCHEMA)` this runner replaced, and a
 * change to the schema cannot drift away from a transcription of it, because there is none.
 *
 * **Migration 1 is `entries.legs`, and it is nullable.** The column landed on 2026-09-02 as
 * `INTEGER NOT NULL` with no default, on a table a deployed database may already have held rows in,
 * and `CREATE TABLE IF NOT EXISTS` adds nothing to a table that exists. So on such a database every
 * `INSERT` fails with `42703` (measured: *column "legs" of relation "entries" does not exist*) and
 * every read maps `Number(undefined)`, which is `NaN`.
 *
 * What a row written before the column gets is **nothing**, and that is § D464's ruling rather than
 * a shortcut. `BoardEntry.legs` is already `number | undefined` on the client and
 * `everyday/boardScreen.ts` withholds the figure for a row that carries no count, so a null row
 * keeps its rank and its name and loses a number the server cannot substantiate. The two
 * alternatives were both refused: a zero is the backfill {@link SCHEMA}'s own comment on the column
 * rules out, and a replay would couple schema versioning to the simulation engine and make
 * container startup unbounded in time. This module already refuses that shape by name for
 * `board_key`, calling it a backfill only the application can write.
 *
 * **`IF NOT EXISTS` on the `ALTER`, because both databases run the same list.** A database created
 * today gets `legs` from migration 0 with its `NOT NULL` intact and migration 1 does nothing; a
 * database created before 2026-09-02 gets it here, nullable. That difference in the *constraint* is
 * real and survives, and `migrations.test.ts` measures it rather than leaving a reader to find it:
 * the older database is the one that can hold a row with no count, and it is the only one that
 * ever could.
 */
const MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({ version: 0, name: 'the schema as it stood', sql: SCHEMA }),
  Object.freeze({
    version: 1,
    name: 'entries.legs, nullable for the rows that predate it',
    sql: 'ALTER TABLE entries ADD COLUMN IF NOT EXISTS legs INTEGER;',
  }),
]);

/**
 * Bring a database up to the current version, applying exactly the migrations it is missing.
 *
 * ## Why the version row is written first
 *
 * Each migration is one `Sql.exec` whose text is the row that records it followed by the migration
 * itself. That ordering looks backwards and is the load-bearing part.
 *
 * PostgreSQL executes a multi-statement simple query as a **single implicit transaction**, so the
 * two commit together or neither does. Measured here rather than trusted: an `exec` of
 * `INSERT …; SELECT 1/0;` against the in-process PostgreSQL leaves the table empty. That is
 * acceptance criterion six for free, and it is the reason no explicit `BEGIN` appears. An explicit
 * one would be worse than useless: `PgSql.query` takes a connection from a pool per call, so a
 * `BEGIN` and its `COMMIT` would land on different connections and the transaction would silently
 * not exist. § D361 recorded that as the trigger for giving `Sql` a real transaction seam, and this
 * runner does not reach it, because one `exec` is one statement batch on one connection.
 *
 * Writing the version row first then makes `schema_migrations.version` the lock. Two containers
 * starting at once both read the same set of applied versions and both build the same batch;
 * PostgreSQL serialises them; the winner commits; the loser's very first statement hits the primary
 * key, raises `23505`, and the batch rolls back **before the migration itself has run**. No
 * advisory lock, no lease, no timeout, and nothing to leak if a container is killed mid-flight.
 *
 * The loser then asks whether the version is recorded now, and continues if it is. It asks rather
 * than assuming, because a `23505` can also come out of a migration that inserts data, and
 * swallowing that one would skip a migration that had failed. Only the SQLSTATE is read, never the
 * constraint name: {@link isUniqueViolation} carries that rule.
 *
 * **What this is not tested against.** `pglite.test-helper.ts` is one session, so two openers in a
 * test are two calls on one connection rather than two connections. That is enough to exercise the
 * interleaving and the recovery, and it is not enough to exercise PostgreSQL's own locking. An
 * advisory lock would have been worse on exactly this point: `pg_try_advisory_lock` returns true
 * for a lock the same session already holds (measured), so a lock-based runner would have been
 * untestable in this harness rather than merely partly tested.
 *
 * Every migration is also idempotent on its own, which is what makes a retry after a crash between
 * the commit and the next statement harmless.
 *
 * **Returns nothing, deliberately.** A report of what it applied would be a second account of the
 * same fact, and `schema_migrations` is the first one. `migrations.test.ts` reads the register,
 * which is the state a restarting container will read too.
 */
async function applyMigrations(sql: Sql, now: () => number): Promise<void> {
  await ensureRegister(sql);
  const found = await sql.query('SELECT version FROM schema_migrations');
  const applied = new Set(found.rows.map((row) => Number(row['version'])));
  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    try {
      await sql.exec(`${recordOf(migration, now())}\n${migration.sql}`);
    } catch (error) {
      // The one error that means somebody else did this. Anything else, including a `23505` from
      // the migration's own statements, is a migration that failed and must stay unrecorded.
      if (isUniqueViolation(error) && (await isRecorded(sql, migration.version))) continue;
      throw error;
    }
  }
}

/**
 * The statement that claims a version.
 *
 * Both values are interpolated rather than bound, for {@link Migration.sql}'s reason: a parameter
 * would move this off the simple query protocol and take the batch's atomicity with it. Both are
 * numbers this module owns, and both are checked to be safe integers before they are printed, so
 * the interpolation cannot become an injection and a fractional clock cannot become a `BIGINT` the
 * database refuses.
 */
function recordOf(migration: Migration, atMs: number): string {
  const applied = Math.trunc(atMs);
  if (!Number.isSafeInteger(migration.version) || !Number.isSafeInteger(applied)) {
    throw new Error(
      `migrations: ${migration.name} (version ${String(migration.version)}) has a version or a clock ` +
        `reading ${String(atMs)} that is not a safe integer. These are printed into SQL rather than ` +
        'bound to it, so they have to be numbers.',
    );
  }
  return `INSERT INTO schema_migrations (version, applied_at_ms) VALUES (${String(migration.version)}, ${String(applied)});`;
}

/**
 * Make sure the register exists, tolerating a concurrent creator.
 *
 * `CREATE TABLE IF NOT EXISTS` is not atomic against another session doing the same thing:
 * PostgreSQL checks the catalog and then inserts into it, and two containers starting together can
 * leave one holding a unique violation on a catalog index rather than a quiet no-op. The question
 * this call is asking is only *is the table there*, so it is asked again on failure and the error is
 * rethrown when the answer is no.
 *
 * **Both branches are covered, and what is not covered is said rather than implied.**
 * `migrations.test.ts` reaches them through the {@link Sql} seam by making this one `exec` raise,
 * once with the table already there and once without, so neither the recovery nor the rethrow is
 * argued for in prose alone. What no test here reproduces is PostgreSQL actually racing itself:
 * `pglite.test-helper.ts` is one session, so the collision is injected rather than provoked.
 */
async function ensureRegister(sql: Sql): Promise<void> {
  try {
    await sql.exec(MIGRATIONS_TABLE);
  } catch (error) {
    const present = await sql.query(`SELECT to_regclass('schema_migrations') AS present`);
    const value = present.rows[0]?.['present'];
    if (value === null || value === undefined) throw error;
  }
}

/** Whether a version is in the register. Asked after a collision, never instead of one. */
async function isRecorded(sql: Sql, version: number): Promise<boolean> {
  const found = await sql.query('SELECT version FROM schema_migrations WHERE version = $1', [version]);
  return found.rows.length > 0;
}
