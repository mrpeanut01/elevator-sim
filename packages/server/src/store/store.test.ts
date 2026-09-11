/**
 * The store's own claims — the ones `api.test.ts` cannot reach through a route.
 *
 * Three of them decide whether a leaderboard means anything: **best-per-player** (a board that
 * listed every entry would rank persistence, not skill), **re-submitting a seed replaces** (a
 * deterministic replay of the same seed is the same run, and counting a refresh as an achievement
 * is farming with extra steps), and **the clock is injected** (a session that expires is only
 * testable if the test decides when).
 *
 * **These run against PostgreSQL, not against a stand-in for one.** `PgliteSql` is PostgreSQL
 * compiled to WebAssembly, so the SQL exercised here is the SQL the server sends in production —
 * the same statements, the same dialect, the same constraint behaviour. That matters more than
 * usual for this file, because half of what it asserts *is* constraint behaviour: the foreign key
 * that refuses an entry for a challenge nobody issued, and the case-folded unique index that makes
 * `ada` and `Ada` one player. A test double would have had to reimplement both to stay green,
 * which is a way of testing the double.
 */

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { issuedChallengeFor } from '../challenge/schedule.js';
import { challengeScoreOf, type SeedResult } from '../challenge/submission.js';
import {
  boardDistributionOf,
  MIN_LADDER_N,
  type AxisObservation,
} from '../leaderboard/distribution.js';
import type { ClaimedMetrics, SubmittedRun } from '../leaderboard/submission.js';
import { PgliteSql } from './pglite.test-helper.js';
import { RacingSql } from './racingSql.test-helper.js';
import {
  BOARD_METRICS,
  HOUSE_DISPLAY_NAME,
  HOUSE_USER_ID,
  NoSuchUserError,
  SESSION_TTL_MS,
  Store,
  normaliseEmail,
  type BoardMetric,
} from './store.js';

/**
 * **Every test in this file boots a whole PostgreSQL, and vitest's default gives it five seconds.**
 *
 * That was the whole protection here until § D394. The `server` project now passes
 * `SIMULATING_TIMEOUT_MS` like `viz` and `core` do, so `vitest.config.ts`'s 5 000 ms default no
 * longer reaches this file and **this call is local reinforcement rather than the only thing
 * standing between the fixture and a flake**. It is kept on § D331's own rule: a site that knows it
 * is slow is allowed to say so, and deleting it would make the file depend silently on a line in
 * another package's config.
 *
 * Nothing about issue #144's argument was ever specific to simulating: `PgliteSql` compiles and
 * starts PostgreSQL-in-WebAssembly per fixture, which fits inside five seconds on an idle machine
 * and does not fit under load. That is why this file is the one § D394 cites — it references **no
 * simulation entry point at all**, so the survey pattern issue #149 prescribes does not match it,
 * and it is nonetheless the only file in the repository with a reproduced timeout behind it.
 *
 * **This is the flake the #254 lane saw once and could not reproduce in six runs.** Reproduced here
 * by running three `vitest run --project server` processes at once: 11, 12 and 6 failures across
 * three runs of the same green tree, every one of them `Test timed out in 5000ms`, every one of
 * them in this file. It is not a race, not an ordering problem and not the un-closed instances the
 * report suspected — those are closed one commit earlier and the timeouts survived it.
 *
 * Set for the file rather than annotated per test, because the annotation is a list and the list is
 * the defect — `vitest.config.ts`'s own note on issue #144 makes that argument at length. § D361
 * said the right home was the `server` project entry in that file, next to `viz`'s, and that it was
 * owed because that lane's allowed paths did not include the root config. **§ D394 discharged it**,
 * for `core` in the same commit.
 */
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const RUN: SubmittedRun = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  windowStartS: null,
  seed: '1',
});

function metrics(awtS: number): ClaimedMetrics {
  return { awtS, wt95S: awtS * 2, ttdMeanS: awtS * 3, pctOverLongWait: 0, awtIsValid: true };
}

/** A store with a clock the caller drives, and a couple of players in it. */
async function fixture(): Promise<{
  store: Store;
  /**
   * The same database, underneath the store.
   *
   * Handed back so the erasure test can read `pg_constraint` — the schema's own account of which
   * tables reference `users` — rather than being told which four they are. `Store` exposes no
   * catalog query and should not grow one for a test's benefit.
   */
  sql: PgliteSql;
  tick: (ms: number) => void;
  ada: string;
  bo: string;
}> {
  let clock = 1_770_000_000_000;
  const sql = new PgliteSql();
  const store = await Store.open({ sql, now: () => clock });
  // Every fixture is a whole PostgreSQL, and this file builds one per test. Closed when the test
  // finishes rather than at the end of the `it`, so a failing assertion does not leak the instance:
  // the #254 lane saw three session tests fail once under heavy parallel load with un-closed
  // instances outstanding and could not reproduce it in six runs, which is what an accumulating
  // resource looks like from the outside.
  onTestFinished(async () => store.close());
  const make = async (name: string): Promise<string> => {
    const created = await store.createUser({
      email: `${name}@example.test`,
      displayName: name,
      displayNameChosen: true,
    });
    if (!created.ok) throw new Error(created.reason);
    return created.user.id;
  };
  return {
    store,
    sql,
    tick: (ms) => {
      clock += ms;
    },
    ada: await make('Ada'),
    bo: await make('Bo'),
  };
}

/* -------------------------------------------------------------------------- *
 * Accounts
 * -------------------------------------------------------------------------- */

describe('accounts', () => {
  it('folds an address to one form, so one person is one account', async () => {
    expect(normaliseEmail('  Player@Example.TEST ')).toBe('player@example.test');
    const { store } = await fixture();
    expect((await store.userByEmail('ADA@EXAMPLE.TEST'))?.displayName).toBe('Ada');
  });

  it('refuses a second account on the same address or the same name', async () => {
    const { store } = await fixture();
    expect(
      await store.createUser({ email: 'ADA@example.test', displayName: 'Other', displayNameChosen: true }),
    ).toMatchObject({ ok: false, reason: 'email-taken' });
    // Case-insensitively for the name too — two rows that render identically on a board are two
    // rows a reader cannot tell apart.
    expect(
      await store.createUser({ email: 'new@example.test', displayName: 'ada', displayNameChosen: true }),
    ).toMatchObject({ ok: false, reason: 'name-taken' });
  });

  it('carries no credential column at all, because § D241 left none to carry', async () => {
    const { store, ada } = await fixture();
    const row = JSON.stringify(await store.userById(ada));
    // Asserted over the serialised row rather than field by field, so a column reintroduced later
    // fails here rather than in a breach. There is no digest, no salt and no scrypt cost: the only
    // credential this product has is a link in a mailbox, and it is not stored.
    for (const gone of ['saltHex', 'hashHex', 'password', 'confirmed']) {
      expect(row, gone).not.toContain(gone);
    }
  });

  it('starts with a placeholder name and remembers that it is one', async () => {
    const { store } = await fixture();
    const created = await store.createUser({
      email: 'fresh@example.test',
      displayName: 'player-000000000000',
      displayNameChosen: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.user.displayNameChosen).toBe(false);
    // The flag exists so the viewer can prompt exactly once. Without it the client would have to
    // recognise a generated name by its shape, which is a second place deciding what one looks like.
    expect((await store.userById(created.user.id))?.displayNameChosen).toBe(false);
  });

  it('renames a player, and a rename is what makes the name theirs', async () => {
    const { store, ada } = await fixture();
    const renamed = await store.setDisplayName(ada, 'Ada Lovelace');
    expect(renamed).toMatchObject({ ok: true });
    if (!renamed.ok) return;
    expect(renamed.user.displayName).toBe('Ada Lovelace');
    expect(renamed.user.displayNameChosen).toBe(true);
  });

  it('refuses a rename onto somebody else’s name, case-insensitively', async () => {
    const { store, ada } = await fixture();
    expect(await store.setDisplayName(ada, 'bo')).toMatchObject({ ok: false, reason: 'name-taken' });
    // ...and renaming to your own name is not a clash with yourself, which the naive check gets
    // wrong and which a player hits the moment they fix their own capitalisation.
    expect(await store.setDisplayName(ada, 'ADA')).toMatchObject({ ok: true });
  });

  it('refuses a rename for a user that does not exist', async () => {
    const { store } = await fixture();
    expect(await store.setDisplayName('nobody', 'Somebody')).toMatchObject({ ok: false, reason: 'no-such-user' });
  });
});

/* -------------------------------------------------------------------------- *
 * Sign-in links
 * -------------------------------------------------------------------------- */

describe('a sign-in link', () => {
  it('is spendable exactly once', async () => {
    const { store, ada } = await fixture();
    await store.createLoginToken({ jti: 'jti-1', userId: ada, expiresAtMs: 1_770_000_060_000 });
    // The first redemption wins and the second gets nothing. This is the claim a signature cannot
    // make — `verifyLoginToken` would accept the same token a thousand times — so it is made here.
    expect(await store.consumeLoginToken('jti-1')).toBe(true);
    expect(await store.consumeLoginToken('jti-1')).toBe(false);
  });

  it('refuses one that was never issued, without throwing', async () => {
    const { store } = await fixture();
    expect(await store.consumeLoginToken('never-issued')).toBe(false);
  });

  it('refuses an expired one on the injected clock, and sweeps it away', async () => {
    const { store, tick, ada } = await fixture();
    await store.createLoginToken({ jti: 'jti-2', userId: ada, expiresAtMs: 1_770_000_000_000 + 1000 });
    tick(1001);
    expect(await store.consumeLoginToken('jti-2')).toBe(false);
    // Gone, not merely refused: the primary key makes that a real constraint, so re-issuing the
    // same identity would fail if the sweep had only refused it. A table of links that can never
    // authenticate anything is a table that only grows.
    await expect(
      store.createLoginToken({ jti: 'jti-2', userId: ada, expiresAtMs: 1_770_000_100_000 }),
    ).resolves.toBeUndefined();
  });

  it('keeps two outstanding links for one player apart', async () => {
    const { store, ada } = await fixture();
    // A player who asks twice must not lock themselves out by spending the first: the second link
    // is a different row and is still good.
    await store.createLoginToken({ jti: 'jti-a', userId: ada, expiresAtMs: 1_770_000_060_000 });
    await store.createLoginToken({ jti: 'jti-b', userId: ada, expiresAtMs: 1_770_000_060_000 });
    expect(await store.consumeLoginToken('jti-a')).toBe(true);
    expect(await store.consumeLoginToken('jti-b')).toBe(true);
  });

  it('goes away with the account it belongs to', async () => {
    const { store, ada } = await fixture();
    await store.createLoginToken({ jti: 'jti-fk', userId: ada, expiresAtMs: 1_770_000_060_000 });
    // A real foreign key, for the reason `challenge_entries` has one: a link naming an account that
    // does not exist is a row that could only ever fail, and it would fail at redemption time.
    await expect(
      store.createLoginToken({ jti: 'jti-orphan', userId: 'nobody', expiresAtMs: 1_770_000_060_000 }),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- *
 * Sessions
 * -------------------------------------------------------------------------- */

describe('sessions', () => {
  it('expire on the injected clock, not on the wall clock', async () => {
    const { store, tick, ada } = await fixture();
    await store.createSession('token-a', ada);
    tick(SESSION_TTL_MS - 1);
    expect((await store.userForSession('token-a'))?.id).toBe(ada);
    tick(2);
    expect(await store.userForSession('token-a')).toBeUndefined();
  });

  it('sweep an expired token away rather than leaving it refusable forever', async () => {
    const { store, tick, ada } = await fixture();
    await store.createSession('token-b', ada);
    tick(SESSION_TTL_MS + 1);
    expect(await store.userForSession('token-b')).toBeUndefined();
    // Gone, not merely refused: re-creating the same token string must not collide with a row that
    // can never authenticate anything. The primary key makes that a real constraint rather than a
    // preference, so a sweep that had only *refused* the token would fail here.
    await expect(store.createSession('token-b', ada)).resolves.toMatchObject({ token: 'token-b', userId: ada });
  });

  it('are revocable, which is why they are a table', async () => {
    const { store, ada } = await fixture();
    await store.createSession('token-c', ada);
    await store.deleteSession('token-c');
    expect(await store.userForSession('token-c')).toBeUndefined();
  });

  it('refuse an unknown token without throwing', async () => {
    const { store } = await fixture();
    expect(await store.userForSession('never-issued')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Boards
 * -------------------------------------------------------------------------- */

describe('a board', () => {
  it('lists a player once, at their best, however many seeds they post', async () => {
    const { store, tick, ada, bo } = await fixture();
    for (const [seed, awtS] of [
      ['1', 40],
      ['2', 30],
      ['3', 35],
    ] as const) {
      await store.recordEntry({ boardKey: 'board-1', dataHash: 'data-1', userId: ada, run: { ...RUN, seed }, measured: metrics(awtS), legs: 200 });
      tick(1000);
    }
    await store.recordEntry({ boardKey: 'board-1', dataHash: 'data-1', userId: bo, run: { ...RUN, seed: '9' }, measured: metrics(33), legs: 200 });

    const board = await store.board('board-1', 'awtS', 25);
    // Two rows, not four. A board that listed every entry would put Ada in the top three places
    // for having submitted three times, and stop being a comparison between players.
    expect(board.map((entry) => entry.displayName)).toEqual(['Ada', 'Bo']);
    expect(board[0]?.measured.awtS).toBe(30);
  });

  it('ranks on the metric it is asked for, and the order can differ between metrics', async () => {
    const { store, ada, bo } = await fixture();
    // Ada is better on wait; Bo is better on the tail. Ranking on one and drawing the other is
    // exactly § D106's rule — the operator's tradeoff, never a constant baked in.
    await store.recordEntry({
      boardKey: 'board-2', dataHash: 'data-1',
      userId: ada,
      run: RUN,
      measured: { awtS: 20, wt95S: 90, ttdMeanS: 60, pctOverLongWait: 5, awtIsValid: true },
      legs: 200,
    });
    await store.recordEntry({
      boardKey: 'board-2', dataHash: 'data-1',
      userId: bo,
      run: RUN,
      measured: { awtS: 25, wt95S: 40, ttdMeanS: 70, pctOverLongWait: 1, awtIsValid: true },
      legs: 200,
    });
    expect((await store.board('board-2', 'awtS', 25)).map((entry) => entry.displayName)).toEqual(['Ada', 'Bo']);
    expect((await store.board('board-2', 'wt95S', 25)).map((entry) => entry.displayName)).toEqual(['Bo', 'Ada']);
  });

  it('gives the distribution one observation per player, their best on the axis asked — GitHub issue #327', async () => {
    const { store, ada, bo } = await fixture();
    /* Ada twice on this board, Bo once: two observations, and Ada's is her better wait. */
    const better = await store.recordEntry({ boardKey: 'board-4', dataHash: 'd', userId: ada, run: RUN, measured: metrics(30), legs: 100 });
    await store.recordEntry({ boardKey: 'board-4', dataHash: 'd2', userId: ada, run: { ...RUN, seed: '77' }, measured: metrics(45), legs: 100 });
    await store.recordEntry({ boardKey: 'board-4', dataHash: 'd3', userId: bo, run: { ...RUN, seed: '78' }, measured: metrics(35), legs: 100 });
    const observed = await store.axisObservations('board-4', 'awtS');
    expect(observed.map((row: { value: number }) => row.value).sort((a: number, b: number) => a - b)).toEqual([30, 35]);
    expect(observed.find((row: { value: number }) => row.value === 30)?.entryId).toBe(better.id);
    expect(await store.axisObservations('board-nobody', 'awtS')).toEqual([]);
  });

  it('replaces rather than appends when the same seed is submitted again', async () => {
    const { store, ada } = await fixture();
    const first = await store.recordEntry({ boardKey: 'board-3', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(40), legs: 200 });
    const again = await store.recordEntry({ boardKey: 'board-3', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(40), legs: 200 });
    expect(again.id).toBe(first.id);
    expect(await store.board('board-3', 'awtS', 25)).toHaveLength(1);
  });

  it('keeps two boards apart', async () => {
    const { store, ada } = await fixture();
    await store.recordEntry({ boardKey: 'board-4', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(10), legs: 200 });
    await store.recordEntry({ boardKey: 'board-5', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(60), legs: 200 });
    expect((await store.board('board-4', 'awtS', 25))[0]?.measured.awtS).toBe(10);
    expect((await store.board('board-5', 'awtS', 25))[0]?.measured.awtS).toBe(60);
    expect((await store.boards()).map((board) => board.boardKey).sort()).toEqual(['board-4', 'board-5']);
  });

  it('honours its limit', async () => {
    const { store, ada, bo } = await fixture();
    await store.recordEntry({ boardKey: 'board-6', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(10), legs: 200 });
    await store.recordEntry({ boardKey: 'board-6', dataHash: 'data-1', userId: bo, run: RUN, measured: metrics(20), legs: 200 });
    expect(await store.board('board-6', 'awtS', 1)).toHaveLength(1);
  });

  it('refuses an entry for a user that does not exist', async () => {
    const { store } = await fixture();
    await expect(
      store.recordEntry({ boardKey: 'board-7', dataHash: 'data-1', userId: 'nobody', run: RUN, measured: metrics(10), legs: 200 }),
    ).rejects.toThrow();
  });

  it('round-trips the run it stored, so a board row can be replayed', async () => {
    const { store, ada } = await fixture();
    // Invariant 5, at the storage layer: an entry that lost its seed would be a score nobody could
    // ever re-verify, which is the one property the whole design rests on.
    await store.recordEntry({ boardKey: 'board-8', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(10), legs: 200 });
    expect((await store.board('board-8', 'awtS', 25))[0]?.run).toEqual(RUN);
  });
});

/* -------------------------------------------------------------------------- *
 * Challenges
 * -------------------------------------------------------------------------- */

/** A five-run set whose mean AWT is `awtS`, so a test can state an expected order in one number. */
function challengeScore(awtS: number) {
  const perSeed: SeedResult[] = ['1', '2', '3', '4', '5'].map((seed) => ({
    seed,
    awtS,
    wt95S: awtS * 2,
    ttdMeanS: awtS * 3,
    pctOverLongWait: 0,
    legs: 20,
  }));
  return challengeScoreOf(perSeed);
}

describe('a challenge board', () => {
  const CHALLENGE = issuedChallengeFor(0);

  it('issues a challenge once and never overwrites it', async () => {
    const { store } = await fixture();
    await store.issueChallenge(CHALLENGE);
    // A rotation edit must not move the window or the seed set of a challenge people are currently
    // posting to — that is § D214 § 4's defect with a competition on it, where the stored entries
    // would stop describing the challenge they name. First issue wins; an edit takes effect next
    // cycle.
    const rewritten = await store.issueChallenge({ ...CHALLENGE, seeds: ['9'], closesAtMs: 0 });
    expect(rewritten.seeds).toEqual([...CHALLENGE.seeds]);
    expect((await store.challengeById(CHALLENGE.id))?.closesAtMs).toBe(CHALLENGE.closesAtMs);
  });

  it('gives each player one row, and a re-submission replaces it', async () => {
    const { store, ada } = await fixture();
    await store.issueChallenge(CHALLENGE);
    const first = await store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'collective',
      score: challengeScore(40),
    });
    const again = await store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'eta',
      score: challengeScore(30),
    });
    // Latest wins, not best-per-metric. A board that kept each player's best row *per column* would
    // show a different player's dispatcher depending on which metric a reader sorted by, so four
    // readers would be looking at four different boards.
    expect(again.id).toBe(first.id);
    const board = await store.challengeBoard(CHALLENGE.id, 'data-1', 'awtS', 25);
    expect(board).toHaveLength(1);
    expect(board[0]?.dispatcherProfileId).toBe('eta');
    expect(board[0]?.score.meanAwtS).toBe(30);
  });

  it('orders two dispatchers against each other on one board — the defect § D218 fixes', async () => {
    const { store, ada, bo } = await fixture();
    await store.issueChallenge(CHALLENGE);
    for (const [userId, dispatcherProfileId, awtS] of [
      [ada, 'collective', 25],
      [bo, 'destination-eta', 20],
    ] as const) {
      await store.recordChallengeEntry({
        challengeId: CHALLENGE.id,
        dataHash: 'data-1',
        userId,
        dispatcherProfileId,
        score: challengeScore(awtS),
      });
    }
    const board = await store.challengeBoard(CHALLENGE.id, 'data-1', 'awtS', 25);
    expect(board.map((entry) => entry.displayName)).toEqual(['Bo', 'Ada']);
    // Both rows carry the count they were computed over, at both levels. R13 is a property of the
    // row, so it survives the round trip through the database or it is not a property of the row.
    expect(board[0]?.score.runs).toBe(5);
    expect(board[0]?.score.legs).toBe(100);
    expect(board[0]?.score.perSeed).toHaveLength(5);
  });

  it('forks a board when the reference data changes, and counts what is on the other one', async () => {
    const { store, ada, bo } = await fixture();
    await store.issueChallenge(CHALLENGE);
    await store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'collective',
      score: challengeScore(25),
    });
    await store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-2',
      userId: bo,
      dispatcherProfileId: 'collective',
      score: challengeScore(15),
    });
    // Not merged — a run this server can no longer reproduce cannot sit in the same order as one it
    // can — and not dropped either, because a surface that silently omitted them would be losing
    // rows without saying so.
    expect(await store.challengeBoard(CHALLENGE.id, 'data-1', 'awtS', 25)).toHaveLength(1);
    expect((await store.challengeDataHashes(CHALLENGE.id)).map((group) => group.dataHash).sort()).toEqual([
      'data-1',
      'data-2',
    ]);
  });

  it('refuses an entry for a challenge that was never issued', async () => {
    const { store, ada } = await fixture();
    // A foreign key, not a loose id: an entry whose challenge does not exist is a row nobody could
    // ever replay, because the seeds and the configuration live on the challenge. PostgreSQL
    // enforces this without being asked — SQLite needed `PRAGMA foreign_keys = ON` first, and this
    // assertion is what would have caught that pragma going missing.
    await expect(
      store.recordChallengeEntry({
        challengeId: 'never-issued-0',
        dataHash: 'data-1',
        userId: ada,
        dispatcherProfileId: 'collective',
        score: challengeScore(25),
      }),
    ).rejects.toThrow();
  });

  it('lists issued challenges, most recently opened first', async () => {
    const { store } = await fixture();
    await store.issueChallenge(issuedChallengeFor(0));
    await store.issueChallenge(issuedChallengeFor(2));
    await store.issueChallenge(issuedChallengeFor(1));
    expect((await store.recentChallenges(10)).map((issued) => issued.id)).toEqual([
      issuedChallengeFor(2).id,
      issuedChallengeFor(1).id,
      issuedChallengeFor(0).id,
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * Erasure
 * -------------------------------------------------------------------------- */

/** One table that references `users`, as the database itself describes it. */
interface UserReference {
  readonly table: string;
  readonly column: string;
  /** `pg_constraint.confdeltype`. `'c'` is `ON DELETE CASCADE`; `'a'` is `NO ACTION`. */
  readonly onDelete: string;
}

/**
 * Every foreign key that points at `users`, read out of PostgreSQL's own catalog.
 *
 * **This is the whole point of the erasure tests below and not a convenience.** A hand-written list
 * of child tables is a list that stops being true the day someone adds a table and does not think
 * of this file — which is `DECISIONS.md` § D213's lesson and the reason `deadCode.test.ts` derives
 * its directory list off disk rather than writing one down. The catalog cannot go stale against the
 * schema, because it *is* the schema: `Store.open` applied it four lines ago.
 *
 * Possible only because `PgliteSql` is PostgreSQL rather than a stand-in for one. A test double
 * would have had to be told the answer, which is the thing being avoided.
 */
async function tablesReferencingUsers(sql: PgliteSql): Promise<readonly UserReference[]> {
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
    onDelete: String(row['on_delete']),
  }));
}

/** How many rows of `table` point at `userId`. */
async function rowsFor(sql: PgliteSql, reference: UserReference, userId: string): Promise<number> {
  const result = await sql.query(
    `SELECT COUNT(*) AS n FROM ${reference.table} WHERE ${reference.column} = $1`,
    [userId],
  );
  return Number(result.rows[0]?.['n'] ?? -1);
}

/** A player with a row in every table that references `users`. */
async function populate(store: Store, userId: string, suffix: string): Promise<void> {
  await store.createSession(`session-${suffix}`, userId);
  await store.createLoginToken({ jti: `jti-${suffix}`, userId, expiresAtMs: 1_770_000_060_000 });
  await store.recordEntry({ boardKey: 'board-erasure', dataHash: 'data-1', userId, run: RUN, measured: metrics(10), legs: 200 });
  await store.recordChallengeEntry({
    challengeId: issuedChallengeFor(0).id,
    dataHash: 'data-1',
    userId,
    dispatcherProfileId: 'collective',
    score: challengeScore(20),
  });
  // GitHub issue #368. A balance is account state, so erasure has to take it — and the assertion
  // that it does is only worth anything if there is a row here to take.
  // `entryKey` is the LEDGER's vocabulary — a **source** id on an earn, never the completion a
  // client posts. This wrote `career-day-paid`, which is the completion; the source that pays it is
  // `earn-career-day`, and the two are deliberately different strings so a module naming one is
  // distinguishable from a module naming the other (`data/chime-ledger.json`'s own comment).
  await store.recordChimeEntry({ userId, direction: 'earn', entryKey: 'earn-career-day', chimes: 3 });
  // GitHub issue #372. A posted rush sitting is a board row the account owns, so erasure has to take it
  // — and, as above, the assertion is only worth anything with a row here to take.
  await store.recordRushEntry({
    boardKey: 'rush:garden-apartments:2026-09-01',
    userId,
    buildingId: 'garden-apartments',
    seed: '90210',
    heldS: 1_178,
    furthestWave: 7,
    rounds: [{ dispatcherProfileId: 'collective', heldS: 1_178, wavesOutlasted: 6, purseBeforeUnits: 0, paidUnits: 12, purseAfterUnits: 12 }],
    modifiers: [],
  });
}

describe('deleting an account', () => {
  it('declares ON DELETE CASCADE on every table that references users', async () => {
    const { sql } = await fixture();
    const children = await tablesReferencingUsers(sql);
    // A floor rather than a list. It is here so that a catalog query which quietly matched nothing
    // — a renamed table, a `pg_constraint` shape that moved — cannot pass every assertion below by
    // having nothing to assert about, which is how `deadCode.test.ts` guards its own scanner.
    expect(children.length, 'the catalog query found no foreign key to users').toBeGreaterThanOrEqual(4);
    expect(
      children.filter((child) => child.onDelete !== 'c').map((child) => `${child.table}.${child.column}`),
      'these reference users without ON DELETE CASCADE, so deleting an account would either fail ' +
        'or orphan them — `Store.deleteUser` is one statement and relies on the cascade for the rest',
    ).toEqual([]);
  });

  it('takes every child row with it, derived from the schema rather than from a list here', async () => {
    const { store, sql, ada, bo } = await fixture();
    await store.issueChallenge(issuedChallengeFor(0));
    await populate(store, ada, 'ada');
    await populate(store, bo, 'bo');
    const children = await tablesReferencingUsers(sql);

    // **Before**, and this half is what stops the assertion after the delete being vacuous: a table
    // the fixture forgot to populate would report zero afterwards no matter what `deleteUser` did.
    // It also fails usefully the day a fifth table references `users` — the message names the table
    // that needs a row here, rather than the test silently covering three of four.
    for (const child of children) {
      expect(await rowsFor(sql, child, ada), `${child.table} was never populated for this test`).toBeGreaterThan(0);
    }

    await store.deleteUser(ada);

    expect(await store.userById(ada)).toBeUndefined();
    for (const child of children) {
      expect(await rowsFor(sql, child, ada), `${child.table} still holds a row for the deleted account`).toBe(0);
    }
    // And nobody else's. A cascade that took the whole table would satisfy every assertion above.
    expect((await store.userById(bo))?.displayName).toBe('Bo');
    for (const child of children) {
      expect(await rowsFor(sql, child, bo), `${child.table} lost a row belonging to another account`).toBeGreaterThan(0);
    }
  });

  it('leaves the challenge itself standing, because it is not the player’s to erase', async () => {
    const { store, ada } = await fixture();
    await store.issueChallenge(issuedChallengeFor(0));
    await populate(store, ada, 'ada');
    await store.deleteUser(ada);
    // `challenges` carries no `user_id` and so is not in the derived set above, which is correct
    // rather than an omission: a challenge is the server's own rotation and other players are
    // posting to it. An erasure that took it would delete strangers' entries by cascade.
    expect(await store.challengeById(issuedChallengeFor(0).id)).toBeDefined();
  });

  it('is silent about an id that is not there, rather than throwing', async () => {
    const { store } = await fixture();
    // The route above this has already authenticated, so this can only be a concurrent second
    // deletion — and the answer to that is the answer to the first one.
    await expect(store.deleteUser('nobody')).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The race that deletion made reachable
 * -------------------------------------------------------------------------- */

/** A store whose one account is deleted the instant `fires` matches, and that account's id. */
async function racedFixture(fires: (text: string) => boolean): Promise<{ store: Store; ada: string }> {
  let store: Store | undefined;
  let ada = '';
  const sql = new RacingSql(new PgliteSql(), fires, async () => {
    await store?.deleteUser(ada);
  });
  store = await Store.open({ sql, now: () => 1_770_000_000_000 });
  onTestFinished(async () => store?.close());
  const created = await store.createUser({
    email: 'raced@example.test',
    displayName: 'Raced',
    displayNameChosen: true,
  });
  if (!created.ok) throw new Error(created.reason);
  ada = created.user.id;
  return { store, ada };
}

describe('an account deleted underneath a submission', () => {
  it('fails recordEntry as a missing account, not as a raw constraint violation', async () => {
    const { store, ada } = await racedFixture((text) => text.startsWith('INSERT INTO entries'));
    // The pre-check passes — the account is there when `recordEntry` looks — and the row is gone by
    // the time the insert runs. Before this was mapped, what came out was PostgreSQL's own
    // sentence, naming the constraint and the table, as an unhandled rejection.
    const failure = store.recordEntry({ boardKey: 'raced', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(10), legs: 200 });
    await expect(failure).rejects.toBeInstanceOf(NoSuchUserError);
    await expect(failure).rejects.toThrow('recordEntry: no such user');
    await expect(failure).rejects.not.toThrow(/foreign key|constraint|entries_user_id_fkey/u);
  });

  it('fails recordChallengeEntry the same way, because it has the same shape', async () => {
    const { store, ada } = await racedFixture((text) => text.startsWith('INSERT INTO challenge_entries'));
    await store.issueChallenge(issuedChallengeFor(0));
    const failure = store.recordChallengeEntry({
      challengeId: issuedChallengeFor(0).id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'collective',
      score: challengeScore(20),
    });
    await expect(failure).rejects.toBeInstanceOf(NoSuchUserError);
    await expect(failure).rejects.toThrow('recordChallengeEntry: no such user');
  });

  it('does not call a missing challenge a missing account', async () => {
    const { store, ada } = await fixture();
    // `challenge_entries` references two tables and only one of them is the account. The mapping
    // asks the database whether the *owner* went away rather than reading a generated constraint
    // name, so the other foreign key has to still come out as itself.
    await expect(
      store.recordChallengeEntry({
        challengeId: 'never-issued-0',
        dataHash: 'data-1',
        userId: ada,
        dispatcherProfileId: 'collective',
        score: challengeScore(25),
      }),
    ).rejects.not.toBeInstanceOf(NoSuchUserError);
  });
});

/* -------------------------------------------------------------------------- *
 * The other four races, found by deriving the enumeration rather than reading
 * -------------------------------------------------------------------------- */

/**
 * A store whose one account exists, and a competing statement that runs inside a chosen gap.
 *
 * {@link racedFixture}'s sibling. That one races a *deletion*, which is the case #254 made
 * reachable; this one races **another caller doing the same thing**, which was always reachable and
 * which `concurrency.test.ts` derives three more instances of. The competing statement runs on the
 * database underneath `RacingSql`, so it does not come back through the one-shot gate.
 *
 * Armed by hand, because the fixture's own `createUser` would otherwise spend the shot on itself.
 */
async function contendedFixture(options: {
  readonly fires: (text: string) => boolean;
  readonly contend: (sql: PgliteSql) => Promise<void>;
}): Promise<{ store: Store; sql: PgliteSql; ada: string; arm: () => void }> {
  let armed = false;
  const inner = new PgliteSql();
  const sql = new RacingSql(
    inner,
    (text) => armed && options.fires(text),
    async () => options.contend(inner),
  );
  const store = await Store.open({ sql, now: () => 1_770_000_000_000 });
  onTestFinished(async () => store.close());
  const created = await store.createUser({
    email: 'raced@example.test',
    displayName: 'Raced',
    displayNameChosen: true,
  });
  if (!created.ok) throw new Error(created.reason);
  return {
    store,
    sql: inner,
    ada: created.user.id,
    arm: () => {
      armed = true;
    },
  };
}

/** One `users` row, written straight past the store. */
const INSERT_USER =
  'INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) VALUES ($1, $2, $3, $4, $5)';

describe('two callers doing the same thing at the same moment', () => {
  it('reports a lost race for an address as a taken address, not as a constraint violation', async () => {
    // Both requests read the address, both find nothing, both insert. `createPlayer`'s own comment
    // — "Lost a race to another request for the same address: that account is the right answer" —
    // described a branch that only the *sequential* path could reach until this was mapped.
    const { store, arm } = await contendedFixture({
      fires: (text) => text.startsWith('INSERT INTO users'),
      contend: async (inner) => {
        await inner.query(INSERT_USER, ['winner', 'contested@example.test', 'Winner', true, 1_770_000_000_000]);
      },
    });
    arm();
    expect(
      await store.createUser({ email: 'contested@example.test', displayName: 'Loser', displayNameChosen: true }),
    ).toMatchObject({ ok: false, reason: 'email-taken' });
  });

  it('tells a lost name apart from a lost address, by asking which one is now taken', async () => {
    // `users` has two unique keys and only one of them is the address, so the mapping cannot read a
    // constraint name — it asks the database the question actually being asked. § D358's rule, on
    // the site where the discriminator matters most.
    const { store, arm } = await contendedFixture({
      fires: (text) => text.startsWith('INSERT INTO users'),
      contend: async (inner) => {
        await inner.query(INSERT_USER, ['winner', 'other@example.test', 'Contested', true, 1_770_000_000_000]);
      },
    });
    arm();
    expect(
      await store.createUser({ email: 'fresh@example.test', displayName: 'Contested', displayNameChosen: true }),
    ).toMatchObject({ ok: false, reason: 'name-taken' });
  });

  it('reports a rename that lost to another rename as a taken name', async () => {
    // `setDisplayName`'s docstring already claimed the unique index "is what makes the guarantee
    // true under two players renaming to the same thing at once, which the check alone cannot
    // promise". It made the data true and handed the caller a raw `23505`.
    const { store, ada, arm } = await contendedFixture({
      fires: (text) => text.startsWith('UPDATE users'),
      contend: async (inner) => {
        await inner.query(INSERT_USER, ['winner', 'grace@example.test', 'Grace', true, 1_770_000_000_000]);
      },
    });
    arm();
    expect(await store.setDisplayName(ada, 'Grace')).toMatchObject({ ok: false, reason: 'name-taken' });
  });

  it('makes two submissions of one seed one row, rather than failing the second', async () => {
    // Nothing to do with deletion. The upsert conflicted on `id` — the primary key — while the
    // guarantee it exists to keep is over the natural key. Two concurrent submissions of the same
    // seed both read nothing, both mint a fresh id, and the second loses.
    const { store, sql, ada, arm } = await contendedFixture({
      fires: (text) => text.startsWith('INSERT INTO entries'),
      contend: async (inner) => {
        await inner.query(
          'INSERT INTO entries (id, board_key, data_hash, user_id, seed, run_json, awt_s, wt95_s, ' +
            'ttd_mean_s, pct_over_long_wait, legs, submitted_at_ms) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
          ['first-in', 'contested', 'data-1', ada, RUN.seed, JSON.stringify(RUN), 11, 22, 33, 0, 99, 1_770_000_000_000],
        );
      },
    });
    arm();
    const row = await store.recordEntry({ boardKey: 'contested', dataHash: 'data-1', userId: ada, run: RUN, measured: metrics(10), legs: 200 });
    // The winner's row is the row, updated — not a second one and not a rejection. Its id comes
    // back from the statement, so the caller is told which row it actually wrote.
    expect(row.id).toBe('first-in');
    expect(row.measured.awtS).toBe(10);
    // `legs` rides the same upsert as the means: the row that wins carries its own denominator,
    // not the contender's 99. A mean from one run over a count from another is the exact defect
    // the field exists to prevent.
    expect(row.legs).toBe(200);
    const count = await sql.query('SELECT COUNT(*) AS n FROM entries WHERE board_key = $1', ['contested']);
    expect(Number(count.rows[0]?.['n'])).toBe(1);
  });

  it('does the same for a challenge entry, because it has the same shape', async () => {
    const { store, sql, ada, arm } = await contendedFixture({
      fires: (text) => text.startsWith('INSERT INTO challenge_entries'),
      contend: async (inner) => {
        await inner.query(
          'INSERT INTO challenge_entries (id, challenge_id, data_hash, user_id, dispatcher_profile_id, ' +
            'runs, legs, mean_awt_s, mean_wt95_s, mean_ttd_mean_s, mean_pct_over_long_wait, ' +
            'per_seed_json, submitted_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
          ['first-in', issuedChallengeFor(0).id, 'data-1', ada, 'eta', 5, 100, 30, 60, 90, 0, '[]', 1_770_000_000_000],
        );
      },
    });
    await store.issueChallenge(issuedChallengeFor(0));
    arm();
    const row = await store.recordChallengeEntry({
      challengeId: issuedChallengeFor(0).id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'collective',
      score: challengeScore(20),
    });
    expect(row.id).toBe('first-in');
    // Latest wins, which is what the docstring says a challenge entry is: the run a player
    // currently stands behind, and switching dispatcher is the move the surface exists for.
    expect(row.dispatcherProfileId).toBe('collective');
    const count = await sql.query('SELECT COUNT(*) AS n FROM challenge_entries WHERE challenge_id = $1', [
      issuedChallengeFor(0).id,
    ]);
    expect(Number(count.rows[0]?.['n'])).toBe(1);
  });
});

describe('an account deleted underneath a write that never read it', () => {
  it('fails createLoginToken as a missing account, not as a raw constraint violation', async () => {
    // The pair a read-then-write scan inside `store/` cannot see: the read is one frame up, in
    // `requestLink`, and this method is a bare `INSERT` into a table with a key to `users`.
    const { store, ada } = await racedFixture((text) => text.startsWith('INSERT INTO login_tokens'));
    const failure = store.createLoginToken({ jti: 'jti-raced', userId: ada, expiresAtMs: 1_770_000_060_000 });
    await expect(failure).rejects.toBeInstanceOf(NoSuchUserError);
    await expect(failure).rejects.toThrow('createLoginToken: no such user');
    await expect(failure).rejects.not.toThrow(/foreign key|constraint|fkey/u);
  });

  it('fails createSession the same way, at the worst possible moment', async () => {
    // `redeemLink` has already spent the link by the time it gets here, so an unexplained failure
    // costs the player the link as well as the session.
    const { store, ada } = await racedFixture((text) => text.startsWith('INSERT INTO sessions'));
    const failure = store.createSession('session-raced', ada);
    await expect(failure).rejects.toBeInstanceOf(NoSuchUserError);
    await expect(failure).rejects.toThrow('createSession: no such user');
    await expect(failure).rejects.not.toThrow(/foreign key|constraint|fkey/u);
  });
});

describe('the house — GitHub issue #222, § D521', () => {
  it('exists on every open, once, with an address no mail can reach', async () => {
    const { store, sql } = await fixture();
    const house = await store.userById(HOUSE_USER_ID);
    expect(house?.displayName).toBe(HOUSE_DISPLAY_NAME);
    expect(house?.email).toMatch(/\.invalid$/u);
    /* A second open against the same database is idempotent by the fixed id. */
    const again = await Store.open({ sql, now: () => 1 });
    const count = await sql.query('SELECT COUNT(*) AS n FROM users WHERE id = $1', [HOUSE_USER_ID]);
    expect(Number(count.rows[0]?.['n'])).toBe(1);
    void again;
  });

  it('keeps one row per baseline dispatcher on a board, beside one row per player', async () => {
    const { store, ada } = await fixture();
    await store.recordEntry({ boardKey: 'daily:2026-09-06', dataHash: 'd-collective', userId: HOUSE_USER_ID, run: { ...RUN, dispatcherProfileId: 'collective' }, measured: metrics(20), legs: 300, baselineProfileId: 'collective' });
    await store.recordEntry({ boardKey: 'daily:2026-09-06', dataHash: 'd-eta', userId: HOUSE_USER_ID, run: { ...RUN, dispatcherProfileId: 'eta' }, measured: metrics(25), legs: 300, baselineProfileId: 'eta' });
    await store.recordEntry({ boardKey: 'daily:2026-09-06', dataHash: 'd-ada', userId: ada, run: RUN, measured: metrics(22), legs: 300 });
    await store.recordEntry({ boardKey: 'daily:2026-09-06', dataHash: 'd-ada-2', userId: ada, run: { ...RUN, seed: '2' }, measured: metrics(27), legs: 300 });
    const board = await store.board('daily:2026-09-06', 'awtS', 25);
    /* Three rows: two house dispatchers and Ada once at her best — never the thirteen-into-one collapse. */
    expect(board.map((row) => [row.displayName, row.baselineProfileId, row.measured.awtS])).toEqual([
      [HOUSE_DISPLAY_NAME, 'collective', 20],
      ['Ada', undefined, 22],
      [HOUSE_DISPLAY_NAME, 'eta', 25],
    ]);
  });

  it('counts players only in the ladder, because the house is not one', async () => {
    const { store, ada, bo } = await fixture();
    await store.recordEntry({ boardKey: 'daily:2026-09-07', dataHash: 'd-h', userId: HOUSE_USER_ID, run: RUN, measured: metrics(10), legs: 300, baselineProfileId: 'collective' });
    await store.recordEntry({ boardKey: 'daily:2026-09-07', dataHash: 'd-a', userId: ada, run: RUN, measured: metrics(30), legs: 300 });
    await store.recordEntry({ boardKey: 'daily:2026-09-07', dataHash: 'd-b', userId: bo, run: RUN, measured: metrics(35), legs: 300 });
    const observed = await store.axisObservations('daily:2026-09-07', 'awtS');
    expect(observed.map((row) => row.value).sort((a, b) => a - b)).toEqual([30, 35]);
  });

  it('re-seeding the same dispatcher on the same board replaces the row rather than adding one', async () => {
    const { store } = await fixture();
    const first = await store.recordEntry({ boardKey: 'daily:2026-09-08', dataHash: 'd-c', userId: HOUSE_USER_ID, run: RUN, measured: metrics(20), legs: 300, baselineProfileId: 'collective' });
    const again = await store.recordEntry({ boardKey: 'daily:2026-09-08', dataHash: 'd-c', userId: HOUSE_USER_ID, run: RUN, measured: metrics(20), legs: 300, baselineProfileId: 'collective' });
    expect(again.id).toBe(first.id);
    expect(await store.board('daily:2026-09-08', 'awtS', 25)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- *
 * Telemetry — R-1's route-internal read (GitHub issue #250)
 * -------------------------------------------------------------------------- */

describe('the KPI dashboard’s read', () => {
  it('hands back what was written, fields and all, oldest arrival first', async () => {
    const { store } = await fixture();
    await store.recordTelemetry([
      {
        playerId: 'a'.repeat(32),
        sessionId: 'b'.repeat(32),
        buildId: 'abc0123456',
        name: 'screen_entered',
        atMs: 900,
        fields: { screenKey: 'stage', fromScreenKey: null },
        receivedAtMs: 1_770_000_002_000,
      },
      {
        playerId: 'a'.repeat(32),
        sessionId: 'b'.repeat(32),
        buildId: 'abc0123456',
        name: 'session_start',
        atMs: 0,
        fields: { entryScreenKey: 'menu' },
        receivedAtMs: 1_770_000_001_000,
      },
    ]);

    const read = await store.telemetryEventsForDashboard();
    /*
     * Ordered by the server's own clock rather than by `atMs`, because that is what tells a
     * player's first session from their fourth — `docs/26` § 7.1's only absolute clock, and the
     * one `dashboardOf` groups on.
     */
    expect(read.map((event) => event.name)).toEqual(['session_start', 'screen_entered']);
    // The fields survive the JSON round trip rather than arriving as a string.
    expect(read[1]?.fields).toEqual({ screenKey: 'stage', fromScreenKey: null });
    expect(read[0]?.atMs).toBe(0);
  });

  it('takes no player filter, because § 18.3 item 1 forbids the screen one would build', async () => {
    /*
     * *"No per-player view for the team … nobody on this project gets a screen that shows one
     * person's sessions."* A `playerId` parameter here is that screen's query arriving before the
     * screen, so the method has none — asserted on its arity rather than described in prose.
     */
    const { store } = await fixture();
    expect(store.telemetryEventsForDashboard.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The modifier set on the row and in the key — GitHub issue #371, § D526 clause 3
 * -------------------------------------------------------------------------- */

/**
 * **Boards keyed by modifier set, and the twenty-player floor a rare set inherits.**
 *
 * Three claims that only a real database can settle. That the column round-trips; that two sets are
 * two populations in `axisObservations`, which is what *keyed by* has to mean at the SQL layer; and
 * that a rare set therefore falls under `distribution.ts#MIN_LADDER_N` **without this file naming
 * twenty**, because a second copy of the floor is how the two come to disagree.
 */
describe('a run carries its modifiers onto the board — issue #371', () => {
  const PURSE = Object.freeze([{ sinkId: 'rush-purse-top-up', steps: 2 }]);
  const STANDARD_KEY = 'daily:2026-09-20';
  const PURSE_KEY = 'daily:2026-09-20/rush-purse-top-up=2';

  /** `n` players, each with one row on `boardKey`, each carrying `modifiers`. */
  async function populate(
    store: Store,
    boardKey: string,
    n: number,
    modifiers: readonly { readonly sinkId: string; readonly steps: number }[] | undefined,
    from: number,
  ): Promise<void> {
    for (let index = 0; index < n; index += 1) {
      const name = `p${String(from + index)}`;
      const created = await store.createUser({
        email: `${name}@example.test`,
        displayName: name,
        displayNameChosen: true,
      });
      if (!created.ok) throw new Error(created.reason);
      await store.recordEntry({
        boardKey,
        dataHash: modifiers === undefined ? 'standard' : 'purse',
        userId: created.user.id,
        run: { ...RUN, seed: String(from + index) },
        measured: metrics(20 + index),
        legs: 300,
        ...(modifiers === undefined ? {} : { modifiers }),
      });
    }
  }

  it('reads back the set it was written with, and the empty set for a run that bought nothing', async () => {
    const { store, ada, bo } = await fixture();
    await store.recordEntry({
      boardKey: PURSE_KEY,
      dataHash: 'purse',
      userId: ada,
      run: RUN,
      measured: metrics(21),
      legs: 300,
      modifiers: PURSE,
    });
    await store.recordEntry({
      boardKey: STANDARD_KEY,
      dataHash: 'standard',
      userId: bo,
      run: RUN,
      measured: metrics(22),
      legs: 300,
    });
    expect((await store.board(PURSE_KEY, 'awtS', 10))[0]?.modifiers).toEqual(PURSE);
    /*
     * **The empty set, not `undefined`.** A row that bought nothing is a row whose set is empty,
     * and the board key it is on already says so — so there is no unknown to model and no reason
     * for a renderer to withhold. `NULL` in the column and `[]` here are the same answer.
     */
    expect((await store.board(STANDARD_KEY, 'awtS', 10))[0]?.modifiers).toEqual([]);
  });

  it('does not collapse a purse run and a standard run of one configuration into one row', async () => {
    /*
     * `entries`' natural key is `(board_key, data_hash, user_id, seed)`, and a personal log is one
     * key for everything a player posts. So the modifier set has to be in the **hash** or these two
     * upsert over each other and the player's own log can hold only one of them —
     * `boardKey.ts#runDataHashOf` is where that happens, and this is that decision seen from the
     * table.
     */
    const { store, ada } = await fixture();
    for (const [dataHash, modifiers] of [
      ['standard', undefined],
      ['purse', PURSE],
    ] as const) {
      await store.recordEntry({
        boardKey: `personal:${ada}`,
        dataHash,
        userId: ada,
        run: RUN,
        measured: metrics(21),
        legs: 300,
        ...(modifiers === undefined ? {} : { modifiers }),
      });
    }
    /*
     * **Counted on the board rather than listed from it, and the first draft got that wrong.**
     * `Store.board` is `DISTINCT ON (user_id, baseline_profile_id)` — best per player — so a
     * personal log *lists* one row for one player however many it holds. That is pre-existing and
     * is not this issue's business; the claim here is that the table keeps both rows rather than
     * upserting one over the other, and `Store.boards` is the count that says so.
     */
    const log = (await store.boards()).find((row) => row.boardKey === `personal:${ada}`);
    expect(log?.entries).toBe(2);
  });

  it('counts a modifier set’s board as its own population, and the standard board as its own', async () => {
    /*
     * **The positive control for the whole issue, and the boundary is deliberate.** Nineteen
     * players on the purse board and five on the standard one: 19 is one short of the floor and
     * 19 + 5 = 24 is comfortably over it. So a build that keyed boards *without* the modifier set
     * would pool them into one population of twenty-four and publish a ladder over runs that did
     * not start from the same purse. Keyed properly, the purse board has nineteen observations and
     * the standard board five, and neither reaches the floor.
     *
     * The numbers are chosen against the value the defect would really have. Nineteen and one, or
     * five and five, would have left both boards under the floor either way and the case would have
     * passed on a build with no keying at all.
     */
    const { store } = await fixture();
    await populate(store, PURSE_KEY, 19, PURSE, 100);
    await populate(store, STANDARD_KEY, 5, undefined, 200);
    expect(await store.axisObservations(PURSE_KEY, 'awtS')).toHaveLength(19);
    expect(await store.axisObservations(STANDARD_KEY, 'awtS')).toHaveLength(5);
    // And the mixture a key without the axis would have produced is not reachable: no key holds
    // both populations.
    for (const key of [PURSE_KEY, STANDARD_KEY]) {
      const rows = await store.board(key, 'awtS', 100);
      expect(new Set(rows.map((row) => JSON.stringify(row.modifiers))).size).toBe(1);
    }
  });

  it('shows a rare modifier set no ladder, on the floor distribution.ts owns — § D506', async () => {
    /*
     * § D526 clause 3: *a modifier-set board inherits § D506's twenty-player floor, so a rare
     * modifier set shows no ladder.* Inherited rather than restated — the floor is read from
     * `MIN_LADDER_N` here, so a change to it moves this case rather than leaving it asserting a
     * number the server no longer uses.
     *
     * Driven at the boundary and one either side of it: `MIN_LADDER_N - 1` withholds and
     * `MIN_LADDER_N` publishes. An off-by-one in the comparison passes a 1-versus-100 case.
     */
    const { store } = await fixture();
    await populate(store, PURSE_KEY, MIN_LADDER_N - 1, PURSE, 300);
    const byAxis = new Map<BoardMetric, readonly AxisObservation[]>();
    for (const metric of BOARD_METRICS) {
      byAxis.set(metric, await store.axisObservations(PURSE_KEY, metric));
    }
    const rare = boardDistributionOf(PURSE_KEY, byAxis);
    expect(rare.n).toBe(MIN_LADDER_N - 1);
    expect(rare.withheld).toBeDefined();
    expect(rare.ladders.every((ladder) => ladder.rungs === undefined)).toBe(true);

    // One more player and the same board publishes, so the withholding above is the floor rather
    // than something else about a modifier-set board.
    await populate(store, PURSE_KEY, 1, PURSE, 400);
    const byAxisNow = new Map<BoardMetric, readonly AxisObservation[]>();
    for (const metric of BOARD_METRICS) {
      byAxisNow.set(metric, await store.axisObservations(PURSE_KEY, metric));
    }
    const common = boardDistributionOf(PURSE_KEY, byAxisNow);
    expect(common.n).toBe(MIN_LADDER_N);
    expect(common.withheld).toBeUndefined();
    expect(common.ladders.every((ladder) => ladder.rungs !== undefined)).toBe(true);
  });

  it('resets with the day, because a modifier board’s key carries the date — § D509', async () => {
    // § D509 clause 1: nothing is deleted and yesterday's rows stay under yesterday's key. Two
    // dates with one modifier set are two boards, exactly as two dates with none are.
    const { store, ada, bo } = await fixture();
    await store.recordEntry({
      boardKey: 'daily:2026-09-20/rush-purse-top-up=2',
      dataHash: 'purse',
      userId: ada,
      run: RUN,
      measured: metrics(21),
      legs: 300,
      modifiers: PURSE,
    });
    await store.recordEntry({
      boardKey: 'daily:2026-09-21/rush-purse-top-up=2',
      dataHash: 'purse',
      userId: bo,
      run: RUN,
      measured: metrics(22),
      legs: 300,
      modifiers: PURSE,
    });
    expect(await store.board('daily:2026-09-20/rush-purse-top-up=2', 'awtS', 10)).toHaveLength(1);
    expect(await store.board('daily:2026-09-21/rush-purse-top-up=2', 'awtS', 10)).toHaveLength(1);
  });
});
