/**
 * **Issue #266: every place in the store where a concurrent write can be told a stale fact, and
 * what each one does about it.**
 *
 * § D358 mapped two sites and said plainly that it had not answered the general question. This is
 * the general question: *how many read-then-write pairs are there, and which of them a delete can
 * now interleave with?* It is answered by {@link writingSites}, which reads `store.ts` and its own
 * `SCHEMA` — so the answer widens on its own the day a method or a table is added, rather than the
 * day somebody notices.
 *
 * **The issue named two sites. The derivation finds five read-then-write pairs and eleven writing
 * members**, and the two it did not name are the interesting ones: `createUser` and
 * `setDisplayName` both pre-check a uniqueness constraint and then write, and both used to hand a
 * raw `23505` to a route that has the right word for it in its own return type.
 *
 * ## Why the remedied set is wider than the issue's title
 *
 * A read-then-write scan inside `store/` cannot see `createSession` or `createLoginToken`: each is a
 * bare `INSERT` into a table with a foreign key to `users`, and the read that makes it a
 * check-then-act is one frame up, in `http/api.ts`. So the set that has to carry a stated remedy is
 * *every member that writes*, which is derived by the same scan and takes no judgement to compute.
 * A member that only reads cannot be made to lie by a concurrent delete — it returns fewer rows,
 * which is true.
 *
 * ## The remedies are per site and the reasons are not interchangeable
 *
 * {@link REMEDIES} is asserted against the derivation in both directions: a member that starts
 * writing and is not in the table fails, an entry for a member that no longer writes fails, and a
 * *risk* that the schema stops carrying makes its own entry stale and fails. What it cannot check is
 * whether the sentence is true, which is what the behavioural suites below are for.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  STORE_DIR,
  type Site,
  memberReadsBeforeWriting,
  passThroughIsReached,
  passThroughMembers,
  sqlIssuingFiles,
  traces,
  flatten,
  writingSites,
  writtenTables,
} from './concurrency.test-helper.js';

const SOURCE = readFileSync(join(STORE_DIR, 'store.ts'), 'utf8');
const SITES = writingSites(SOURCE);

/* -------------------------------------------------------------------------- *
 * The table
 * -------------------------------------------------------------------------- */

/** The thing the database can do to a write, as the derivation names it. */
type Risk = 'foreign-key' | 'unique' | 'delete-blocked' | 'cascade';

interface Remedy {
  /** Which derived risks this entry answers. Asserted against the derivation, both ways. */
  readonly risks: readonly Risk[];
  readonly remedy: 'mapped' | 'arbitrated-by-the-write' | 'nothing-can-fire' | 'in-a-transaction';
  /** Why this remedy and not the other one. Per site — never a policy applied by default. */
  readonly because: string;
  /** What the person on the other end of the request sees, and whether it is true. */
  readonly player: string;
}

/**
 * One entry per writing member, and the choice is made per site.
 *
 * Three of the four remedy kinds are used. **`in-a-transaction` is used nowhere**, and that is the
 * recorded decision rather than an omission — see the suite below, which asserts it and states the
 * trigger that would reopen it.
 */
const REMEDIES: Readonly<Record<string, readonly Remedy[]>> = Object.freeze({
  createUser: [
    {
      risks: ['unique'],
      remedy: 'mapped',
      because:
        'The two pre-reads are a check-then-act against `users_email_key` and the `LOWER(display_name)` ' +
        'index, and two concurrent requests for the same unknown address both pass them. The loser used ' +
        'to throw PostgreSQL’s own sentence — past the branch in `createPlayer` whose comment reads ' +
        '“Lost a race to another request for the same address: that account is the right answer”, which ' +
        'the race could therefore never reach. A `23505` now returns the same discriminated result the ' +
        'sequential path returns, so that branch is reachable by the case it was written for. Which ' +
        'constraint fired is settled by asking the database whether the *address* is now taken, per ' +
        '§ D358’s rule: `users` has two unique keys and only one of them is the address. The third ' +
        'entry in the derived list is the primary key, which is a fresh `randomUUID` and cannot ' +
        'collide with a row this store did not write; an unexplained `23505` is re-thrown rather ' +
        'than labelled, so that case stays a server failure and reads as one.',
      player:
        'Before: `500 internal-error` on `POST /api/auth/request-link` — and a 500 where every other ' +
        'answer on that route is a uniform 202. After: the 202, and the link, because the account the ' +
        'other request created is the account this one wanted.',
    },
    {
      risks: ['cascade'],
      remedy: 'nothing-can-fire',
      because:
        'It inserts a row rather than reading one. A concurrent deletion of some other account cannot ' +
        'make a fresh insert wrong, and there is no row of its own for a cascade to remove yet.',
      player: 'Unchanged: an account, or a civil refusal naming which of the two things was taken.',
    },
  ],

  setDisplayName: [
    {
      risks: ['unique'],
      remedy: 'mapped',
      because:
        'The docstring already claimed the unique index “is what makes the guarantee true under two ' +
        'players renaming to the same thing at once, which the check alone cannot promise”. It made ' +
        'the *data* true and handed the *caller* a raw `23505`. The result type already carries the ' +
        'word — `name-taken` — so the constraint path returns what the pre-check returns. The ' +
        'discriminator of `createUser` is not needed here: an `UPDATE` that sets only `display_name` ' +
        'can collide with exactly one of the three unique keys, which is what the derivation says.',
      player:
        'Before: `500 internal-error` on `POST /api/me/name`. After: `409 name-taken`, “That display ' +
        'name is already in use on a board.” — which is true, and is what a player who lost by a ' +
        'millisecond gets told a millisecond later anyway.',
    },
    {
      risks: ['cascade'],
      remedy: 'arbitrated-by-the-write',
      because:
        'A deletion racing the rename is already answered by the write itself: `rowCount === 0` is ' +
        '`no-such-user`, and the re-read after it returns `undefined` for the same reason. Neither ' +
        'branch needed adding and neither is a pre-check — this is the shape the other sites were ' +
        'moved towards rather than away from.',
      player: '`401 not-signed-in`, “Sign in to change your name.” True: the account is gone.',
    },
  ],

  deleteUser: [
    {
      risks: ['cascade'],
      remedy: 'nothing-can-fire',
      because:
        'One statement, and the four child tables go inside it. A second concurrent deletion matches ' +
        'nothing and returns, which is the same answer as the first — the docstring’s reason for ' +
        'returning no boolean. The `delete-blocked` risk is empty *by derivation*: every foreign key ' +
        'into `users` in `SCHEMA` cascades, and `store.test.ts` cross-checks that against the live ' +
        'catalog. A fifth table added without `ON DELETE CASCADE` makes this entry stale and fails.',
      player: '`200`, both times. Erasure is not a thing that can half-happen here.',
    },
  ],

  createLoginToken: [
    {
      risks: ['foreign-key', 'cascade'],
      remedy: 'mapped',
      because:
        'The check-then-act is one frame up: `requestLink` reads the account and then writes the token, ' +
        'and a deletion in that gap breaks `login_tokens_user_id_fkey`. This is the pair the ' +
        'read-then-write scan inside `store/` cannot see, and the reason the remedied set is *every ' +
        'writing member*. Mapped to `NoSuchUserError` by the same `#asOwnerError` the two entry writers ' +
        'use, and `requestLink` answers it by starting the account again — because per § D241 asking ' +
        'for a link on an address with no account is what creates one, so a link for a re-made account ' +
        'is the honest answer rather than a fallback.',
      player:
        'Before: `500 internal-error`, on the one route in this API whose whole design is a response ' +
        'that says nothing about the address. After: the uniform `202`, and a link that works.',
    },
    {
      risks: ['unique'],
      remedy: 'nothing-can-fire',
      because:
        'The only unique key on `login_tokens` is the `jti`, which `accounts/credentials.ts` draws ' +
        'fresh per link. Two callers cannot collide on it without the random source repeating.',
      player: 'Nothing to see: this one is a fact about the key rather than about a race.',
    },
  ],

  consumeLoginToken: [
    {
      risks: ['cascade'],
      remedy: 'arbitrated-by-the-write',
      because:
        'Its `rowCount` is its answer and always has been — the docstring argues that against a ' +
        '`SELECT`-then-`DELETE` for exactly this reason. What the cascade changes is not whether the ' +
        'answer is *reached* but what `false` **means**: the row can be gone because the link was spent ' +
        'or because the account was deleted, and `redeemLink` used to call both “already used”. It now ' +
        'asks which, and says the true one. No mapping, because no constraint fires here.',
      player:
        'Before: “That sign-in link has already been used.” — false, when what happened is that the ' +
        'account was deleted. After: “That sign-in link is not valid.”, which is the same answer the ' +
        'sequential path gives for a link whose account is gone.',
    },
  ],

  createSession: [
    {
      risks: ['foreign-key', 'cascade'],
      remedy: 'mapped',
      because:
        '`redeemLink` reads the account, compares the address inside the signature against it, and then ' +
        'writes the session; a deletion in that gap breaks `sessions_user_id_fkey`. The second site the ' +
        'read-then-write scan cannot see. Mapped to `NoSuchUserError`, which `redeemLink` answers with ' +
        'the refusal it already gives when the read itself comes back empty — the outcome is the same ' +
        'whether the account went a millisecond before the write or a millisecond into it.',
      player:
        'Before: `500 internal-error` after the link was already spent, which is the worst possible ' +
        'moment for an unexplained failure. After: `400 link-invalid`, “That sign-in link is not ' +
        'valid. Ask for a new one.”',
    },
    {
      risks: ['unique'],
      remedy: 'nothing-can-fire',
      because:
        'The token is the primary key of `sessions` and is drawn fresh per session by ' +
        '`newSessionToken`. Two callers cannot collide on it without the random source repeating, ' +
        'which would be a very much larger problem than a raced insert.',
      player: 'Nothing to see: a fact about the key rather than about a race.',
    },
  ],

  userForSession: [
    {
      risks: ['cascade'],
      remedy: 'nothing-can-fire',
      because:
        'It reads a session and then deletes it — but only the row it just read, only when that row has ' +
        'expired, and it never looks at what the delete matched. A cascade that removed the row first ' +
        'makes the delete match nothing, which changes no answer. The `userById` after it then returns ' +
        '`undefined`, which is the truth. This is a read-then-write pair by the derivation and needs ' +
        'nothing done to it, which is the point of stating the choice per site.',
      player: '`401 not-signed-in`. True: the account is gone, so nobody is signed in.',
    },
  ],

  deleteSession: [
    {
      risks: ['cascade'],
      remedy: 'nothing-can-fire',
      because:
        'One idempotent `DELETE` whose result is not read. `logout` answers `200` whether or not the ' +
        'token was real, on purpose — a logout that reported “no such session” would say whether a ' +
        'token existed.',
      player: '`200 ok`. True: you are signed out either way.',
    },
  ],

  recordEntry: [
    {
      risks: ['foreign-key', 'cascade'],
      remedy: 'mapped',
      because:
        '§ D358’s site, and it stays mapped rather than becoming transactional. A transaction would not ' +
        'close it — under `READ COMMITTED` the concurrent `DELETE FROM users` still commits and the ' +
        '`INSERT` still fails the key — and the lock that *would* close it, `SELECT … FOR UPDATE`, buys ' +
        'the player a worse answer: the insert wins, the delete then cascades the row away, and the ' +
        'player is told their score posted a moment before it is erased. The mapping tells a truer ' +
        'story than the lock.',
      player:
        '`401`, “That account was deleted while this run was being verified, so nothing was posted.” ' +
        'Before § D358 it was `500`, or an unhandled rejection through `Api`.',
    },
    {
      risks: ['unique'],
      remedy: 'arbitrated-by-the-write',
      because:
        'The second defect at this site, and it has nothing to do with deletion. `UNIQUE (board_key, ' +
        'data_hash, user_id, seed)` is the natural key, and the upsert conflicted on `id` — the ' +
        '*primary* key — so ' +
        'the “re-submitting the same seed replaces rather than appends” guarantee held only when the ' +
        'pre-read found the row. Two concurrent submissions of one seed both read nothing, both mint a ' +
        'fresh `randomUUID`, and the second violates the natural key. The conflict target is now the ' +
        'natural key and the row’s id comes back from `RETURNING`, so the database arbitrates and the ' +
        'pre-read is gone rather than merely guarded. `consumeLoginToken`’s docstring already argued ' +
        'this shape: one statement, and exactly one caller can see it win. What is left in the ' +
        'derived list is the primary key, which the statement no longer arbitrates and cannot ' +
        'collide on either — the id it inserts is a fresh `randomUUID`.',
      player:
        'Before: a double-tapped submit answered `500` on the losing request, having posted nothing ' +
        'for it. After: both are the same score on the same row, which is what a deterministic replay ' +
        'of one seed is.',
    },
  ],

  issueChallenge: [
    {
      risks: [],
      remedy: 'nothing-can-fire',
      because:
        'The only writing member with no derived risk at all. `ON CONFLICT (id) DO NOTHING` arbitrates ' +
        'the one unique key, `challenges` references nothing, and nothing deletes a challenge — so the ' +
        'read after the write cannot come back empty. `?? challenge` covers the impossible case anyway ' +
        'and is left alone.',
      player: 'The challenge, whoever issued it first.',
    },
  ],

  recordChallengeEntry: [
    {
      risks: ['foreign-key', 'cascade'],
      remedy: 'mapped',
      because:
        '`recordEntry`’s reason, plus the discriminator that makes it honest: `challenge_entries` ' +
        'references two tables and only one of them is the account, so the mapping asks the database ' +
        'whether the *owner* went away rather than reading a generated constraint name. The ' +
        '`challenge_id` key is deliberately not mapped — `issueChallenge` never deletes — and comes out ' +
        'as itself.',
      player:
        '`401`, the same sentence as `recordEntry`. A missing *challenge* still comes out as a server ' +
        'failure, which is correct: it is one.',
    },
    {
      risks: ['unique'],
      remedy: 'arbitrated-by-the-write',
      because:
        '`UNIQUE (challenge_id, data_hash, user_id)` with the upsert conflicting on `id`, which is ' +
        '`recordEntry`’s second defect exactly. Same remedy, same residual primary key, and stated ' +
        'separately rather than by reference because the two tables are different tables and the ' +
        'natural keys are different natural keys.',
      player:
        'Before: `500` on the losing half of a double submission. After: one row, latest wins — which ' +
        'is what the docstring says a challenge entry is.',
    },
  ],
});

/* -------------------------------------------------------------------------- *
 * The enumeration
 * -------------------------------------------------------------------------- */

/** The risk categories the derivation says a site actually carries. */
function derivedRisks(site: Site): readonly Risk[] {
  const out: Risk[] = [];
  if (site.foreignKeyRisk.length > 0) out.push('foreign-key');
  if (site.uniqueRisk.length > 0) out.push('unique');
  if (site.deleteRisk.length > 0) out.push('delete-blocked');
  if (site.cascadeExposure.length > 0) out.push('cascade');
  return out.sort();
}

describe('the enumeration of read-then-write pairs', () => {
  it('is derived from the store’s own source, and there are five rather than the two #266 named', () => {
    // #266's table lists `recordEntry` and `recordChallengeEntry`, which is what a reader looking for
    // a *foreign key* violation finds. The other three pre-check something else: `createUser` and
    // `setDisplayName` pre-check uniqueness, and `userForSession` reads a row before sweeping it.
    expect(memberReadsBeforeWriting(SOURCE)).toEqual([
      'createUser',
      'recordChallengeEntry',
      'recordEntry',
      'setDisplayName',
      'userForSession',
    ]);
  });

  it('covers every file in the directory that issues SQL, so a second one cannot hide', () => {
    // Calls are resolved within one file. A second SQL-issuing file would be a member whose callees
    // this scanner cannot follow, reported as fewer statements — which reads as less risk.
    expect(sqlIssuingFiles()).toEqual(['store.ts']);
  });

  it('sees the statement of every member that is handed one, rather than counting it as no risk', () => {
    const passThrough = passThroughMembers(SOURCE);
    expect(passThrough).toEqual(['#userRow']);
    for (const member of passThrough) {
      expect(passThroughIsReached(SOURCE, member), `${member} is handed no readable statement`).toBe(true);
    }
  });

  it('does not confuse two members that share a name', () => {
    // `constructor` appears twice — `NoSuchUserError` and `Store`. Neither issues SQL, so the
    // by-name call resolution cannot pick the wrong one. The day that stops being true, it can.
    const all = traces(SOURCE);
    const passThrough = new Set(passThroughMembers(SOURCE));
    const withStatements = all
      .filter((t) => !passThrough.has(t.name) && flatten(all, t.name).length > 0)
      .map((t) => t.name);
    expect(new Set(withStatements).size).toBe(withStatements.length);
  });
});

describe('the remedy chosen at each site', () => {
  it('is stated for every member that writes, and for no member that does not', () => {
    expect(Object.keys(REMEDIES).sort()).toEqual(SITES.map((s) => s.member).sort());
  });

  it('answers exactly the risks the schema says that write carries', () => {
    for (const site of SITES) {
      const claimed = [...new Set((REMEDIES[site.member] ?? []).flatMap((r) => r.risks))].sort();
      expect(claimed, `${site.member}: the stated risks and the derived ones disagree`).toEqual(
        derivedRisks(site),
      );
    }
  });

  it('gives every site a reason and a sentence about what the player sees', () => {
    for (const [member, remedies] of Object.entries(REMEDIES)) {
      expect(remedies.length, `${member} has no stated remedy`).toBeGreaterThan(0);
      for (const remedy of remedies) {
        expect(remedy.because.length, `${member}: no reason`).toBeGreaterThan(80);
        expect(remedy.player.length, `${member}: nothing said about the player`).toBeGreaterThan(20);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The transactions decision, asserted rather than asserted in prose
 * -------------------------------------------------------------------------- */

describe('`Store` gains no transactions, and that is the decision', () => {
  it('issues no BEGIN, COMMIT or ROLLBACK anywhere', () => {
    const verbs = SITES.flatMap((s) => s.statements.map((st) => st.verb));
    expect(verbs.filter((v) => v === 'BEGIN' || v === 'COMMIT' || v === 'ROLLBACK')).toEqual([]);
  });

  it('chooses a transaction at no site', () => {
    expect(Object.values(REMEDIES).flat().filter((r) => r.remedy === 'in-a-transaction')).toEqual([]);
  });

  it('writes to at most one table per member — the trigger that would reopen the decision', () => {
    // The argument in § D361 is that no site in this store needs two writes to land together:
    // `deleteUser` is one statement *because* the cascade is the rest of it, and `consumeLoginToken`'s
    // second statement is a sweep of rows the first could not have accepted. The day a member has to
    // write two tables, atomicity stops being free and `Sql` has to grow `withTransaction` — because
    // `PgSql.query` takes a connection from a pool per call, so a `BEGIN` and its `COMMIT` would land
    // on different connections and the transaction would silently not exist. This is that day's alarm.
    for (const site of SITES) {
      expect(
        writtenTables(site),
        `${site.member} writes to more than one table. § D361 recorded this as the trigger for giving ` +
          '`Sql` a real transaction seam; a second `query` call is not a transaction, because the pool ' +
          'hands out a different connection each time.',
      ).toHaveLength(1);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The derivation itself, mutated
 * -------------------------------------------------------------------------- */

/** `store.ts` with an extra member spliced into `Store`. */
function withMember(body: string): string {
  const mutated = SOURCE.replace('export class Store {', `export class Store {\n${body}\n`);
  if (mutated === SOURCE) throw new Error('the splice anchor moved; this mutation tests nothing');
  return mutated;
}

describe('the derivation notices a pair that was added after it was written', () => {
  it('sees a read and a write written side by side', () => {
    const mutated = withMember(`
      async mutantDirect(token: string): Promise<void> {
        const found = await this.#sql.query('SELECT user_id FROM sessions WHERE token = $1', [token]);
        if (found.rows[0] !== undefined) {
          await this.#sql.query('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES ($1, $2, $3)', []);
        }
      }
    `);
    expect(memberReadsBeforeWriting(mutated)).toContain('mutantDirect');
  });

  it('sees a read that is only reachable by following two calls and a parameter', () => {
    // The load-bearing mutation. `userById` issues no SQL of its own — it hands a literal to
    // `#userRow`, which runs it. A scanner that stopped at the member boundary, or that gave up on a
    // statement it was handed, would report this member as a bare `INSERT` with nothing before it,
    // which is the exact shape of a check-then-act reported as safe.
    const mutated = withMember(`
      async mutantIndirect(id: string): Promise<void> {
        const user = await this.userById(id);
        if (user !== undefined) {
          await this.#sql.query('INSERT INTO sessions (token, user_id, expires_at_ms) VALUES ($1, $2, $3)', []);
        }
      }
    `);
    expect(memberReadsBeforeWriting(mutated)).toContain('mutantIndirect');
    const site = writingSites(mutated).find((s) => s.member === 'mutantIndirect');
    expect(site?.statements.map((s) => s.verb)).toEqual(['SELECT', 'INSERT']);
    expect(site?.foreignKeyRisk).toEqual(['users']);
  });

  it('puts a new writing member in the set the remedy table has to cover', () => {
    const mutated = withMember(`
      async mutantUnlisted(token: string): Promise<void> {
        await this.#sql.query('DELETE FROM sessions WHERE token = $1', [token]);
      }
    `);
    const members = writingSites(mutated).map((s) => s.member);
    expect(members).toContain('mutantUnlisted');
    // Which is what makes the coverage assertion above fail, rather than quietly passing.
    expect(Object.keys(REMEDIES)).not.toContain('mutantUnlisted');
  });

  it('sees a member that writes two tables, which is the transaction trigger', () => {
    const mutated = withMember(`
      async mutantTwoTables(id: string): Promise<void> {
        await this.#sql.query('DELETE FROM sessions WHERE user_id = $1', [id]);
        await this.#sql.query('DELETE FROM login_tokens WHERE user_id = $1', [id]);
      }
    `);
    const site = writingSites(mutated).find((s) => s.member === 'mutantTwoTables');
    expect(site === undefined ? [] : writtenTables(site)).toEqual(['login_tokens', 'sessions']);
  });

  it('refuses a statement it cannot read, rather than counting it as no risk', () => {
    const mutated = withMember(`
      async mutantComputed(table: string): Promise<void> {
        await this.#sql.query('DELETE FROM ' + table + ' WHERE id = $1', []);
      }
    `);
    expect(() => writingSites(mutated)).toThrow(/cannot read/u);
  });
});

describe('the derivation notices a schema change as well as a code change', () => {
  it('sees a new table that references `users` without cascading, and blames `deleteUser`', () => {
    const mutated = SOURCE.replace(
      'CREATE TABLE IF NOT EXISTS sessions (',
      'CREATE TABLE IF NOT EXISTS mutant_notes (\n' +
        '  id       TEXT PRIMARY KEY,\n' +
        '  user_id  TEXT NOT NULL REFERENCES users (id),\n' +
        '  note     TEXT NOT NULL\n' +
        ');\n\nCREATE TABLE IF NOT EXISTS sessions (',
    );
    expect(mutated).not.toBe(SOURCE);
    const site = writingSites(mutated).find((s) => s.member === 'deleteUser');
    // `deleteUser`'s whole promise — one statement, and the cascade is the rest of it — is false the
    // moment this is non-empty, and its stated remedy says so in as many words.
    expect(site?.deleteRisk).toEqual(['mutant_notes']);
    expect(SITES.find((s) => s.member === 'deleteUser')?.deleteRisk).toEqual([]);
  });

  it('sees a new unique constraint on a table an existing member writes', () => {
    const mutated = SOURCE.replace(
      '  submitted_at_ms     BIGINT NOT NULL,\n  UNIQUE (board_key, data_hash, user_id, seed)',
      '  submitted_at_ms     BIGINT NOT NULL,\n  UNIQUE (board_key, data_hash, user_id, seed),\n  UNIQUE (run_json)',
    );
    expect(mutated).not.toBe(SOURCE);
    const site = writingSites(mutated).find((s) => s.member === 'recordEntry');
    expect(site?.uniqueRisk).toContainEqual(['run_json']);
  });
});
