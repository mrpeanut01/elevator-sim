/**
 * The store's own claims — the ones `api.test.ts` cannot reach through a route.
 *
 * Three of them decide whether a leaderboard means anything: **best-per-player** (a board that
 * listed every entry would rank persistence, not skill), **re-submitting a seed replaces** (a
 * deterministic replay of the same seed is the same run, and counting a refresh as an achievement
 * is farming with extra steps), and **the clock is injected** (a session that expires is only
 * testable if the test decides when).
 */

import { describe, expect, it } from 'vitest';

import { hashPassword } from '../accounts/credentials.js';
import { issuedChallengeFor } from '../challenge/schedule.js';
import { challengeScoreOf, type SeedResult } from '../challenge/submission.js';
import type { ClaimedMetrics, SubmittedRun } from '../leaderboard/submission.js';
import { SESSION_TTL_MS, Store, normaliseEmail } from './store.js';

const RUN: SubmittedRun = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  seed: '1',
});

function metrics(awtS: number): ClaimedMetrics {
  return { awtS, wt95S: awtS * 2, ttdMeanS: awtS * 3, pctOverLongWait: 0, awtIsValid: true };
}

/** A store with a clock the caller drives, and a couple of players in it. */
function fixture(): { store: Store; tick: (ms: number) => void; ada: string; bo: string } {
  let clock = 1_770_000_000_000;
  const store = new Store({ path: ':memory:', now: () => clock });
  const make = (name: string): string => {
    const created = store.createUser({
      email: `${name}@example.test`,
      displayName: name,
      password: hashPassword('a passphrase of adequate length'),
    });
    if (!created.ok) throw new Error(created.reason);
    return created.user.id;
  };
  return {
    store,
    tick: (ms) => {
      clock += ms;
    },
    ada: make('Ada'),
    bo: make('Bo'),
  };
}

/* -------------------------------------------------------------------------- *
 * Accounts
 * -------------------------------------------------------------------------- */

describe('accounts', () => {
  it('folds an address to one form, so one person is one account', () => {
    expect(normaliseEmail('  Player@Example.TEST ')).toBe('player@example.test');
    const { store } = fixture();
    expect(store.userByEmail('ADA@EXAMPLE.TEST')?.displayName).toBe('Ada');
  });

  it('refuses a second account on the same address or the same name', () => {
    const { store } = fixture();
    const password = hashPassword('a passphrase of adequate length');
    expect(store.createUser({ email: 'ADA@example.test', displayName: 'Other', password })).toMatchObject({
      ok: false,
      reason: 'email-taken',
    });
    // Case-insensitively for the name too — two rows that render identically on a board are two
    // rows a reader cannot tell apart.
    expect(store.createUser({ email: 'new@example.test', displayName: 'ada', password })).toMatchObject({
      ok: false,
      reason: 'name-taken',
    });
  });

  it('starts unconfirmed, and confirms only against the address that was mailed', () => {
    const { store, ada } = fixture();
    expect(store.userById(ada)?.confirmed).toBe(false);
    // The address is half the key. A confirmation that matched on id alone would confirm whatever
    // address the account holds *now*, which is how a confirmation flow becomes a takeover flow.
    expect(store.confirmUser(ada, 'someone-else@example.test')).toBe(false);
    expect(store.userById(ada)?.confirmed).toBe(false);
    expect(store.confirmUser(ada, 'ADA@example.test')).toBe(true);
    expect(store.userById(ada)?.confirmed).toBe(true);
  });

  it('never returns a password in any field of a user row', () => {
    const { store, ada } = fixture();
    expect(JSON.stringify(store.userById(ada))).not.toContain('a passphrase of adequate length');
  });
});

/* -------------------------------------------------------------------------- *
 * Sessions
 * -------------------------------------------------------------------------- */

describe('sessions', () => {
  it('expire on the injected clock, not on the wall clock', () => {
    const { store, tick, ada } = fixture();
    store.createSession('token-a', ada);
    tick(SESSION_TTL_MS - 1);
    expect(store.userForSession('token-a')?.id).toBe(ada);
    tick(2);
    expect(store.userForSession('token-a')).toBeUndefined();
  });

  it('sweep an expired token away rather than leaving it refusable forever', () => {
    const { store, tick, ada } = fixture();
    store.createSession('token-b', ada);
    tick(SESSION_TTL_MS + 1);
    expect(store.userForSession('token-b')).toBeUndefined();
    // Gone, not merely refused: re-creating the same token string must not collide with a row that
    // can never authenticate anything.
    expect(() => store.createSession('token-b', ada)).not.toThrow();
  });

  it('are revocable, which is why they are a table', () => {
    const { store, ada } = fixture();
    store.createSession('token-c', ada);
    store.deleteSession('token-c');
    expect(store.userForSession('token-c')).toBeUndefined();
  });

  it('refuse an unknown token without throwing', () => {
    const { store } = fixture();
    expect(store.userForSession('never-issued')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * Boards
 * -------------------------------------------------------------------------- */

describe('a board', () => {
  it('lists a player once, at their best, however many seeds they post', () => {
    const { store, tick, ada, bo } = fixture();
    for (const [seed, awtS] of [
      ['1', 40],
      ['2', 30],
      ['3', 35],
    ] as const) {
      store.recordEntry({ configHash: 'board-1', userId: ada, run: { ...RUN, seed }, measured: metrics(awtS) });
      tick(1000);
    }
    store.recordEntry({ configHash: 'board-1', userId: bo, run: { ...RUN, seed: '9' }, measured: metrics(33) });

    const board = store.board('board-1', 'awtS', 25);
    // Two rows, not four. A board that listed every entry would put Ada in the top three places
    // for having submitted three times, and stop being a comparison between players.
    expect(board.map((entry) => entry.displayName)).toEqual(['Ada', 'Bo']);
    expect(board[0]?.measured.awtS).toBe(30);
  });

  it('ranks on the metric it is asked for, and the order can differ between metrics', () => {
    const { store, ada, bo } = fixture();
    // Ada is better on wait; Bo is better on the tail. Ranking on one and drawing the other is
    // exactly § D106's rule — the operator's tradeoff, never a constant baked in.
    store.recordEntry({
      configHash: 'board-2',
      userId: ada,
      run: RUN,
      measured: { awtS: 20, wt95S: 90, ttdMeanS: 60, pctOverLongWait: 5, awtIsValid: true },
    });
    store.recordEntry({
      configHash: 'board-2',
      userId: bo,
      run: RUN,
      measured: { awtS: 25, wt95S: 40, ttdMeanS: 70, pctOverLongWait: 1, awtIsValid: true },
    });
    expect(store.board('board-2', 'awtS', 25).map((entry) => entry.displayName)).toEqual(['Ada', 'Bo']);
    expect(store.board('board-2', 'wt95S', 25).map((entry) => entry.displayName)).toEqual(['Bo', 'Ada']);
  });

  it('replaces rather than appends when the same seed is submitted again', () => {
    const { store, ada } = fixture();
    const first = store.recordEntry({ configHash: 'board-3', userId: ada, run: RUN, measured: metrics(40) });
    const again = store.recordEntry({ configHash: 'board-3', userId: ada, run: RUN, measured: metrics(40) });
    expect(again.id).toBe(first.id);
    expect(store.board('board-3', 'awtS', 25)).toHaveLength(1);
  });

  it('keeps two boards apart', () => {
    const { store, ada } = fixture();
    store.recordEntry({ configHash: 'board-4', userId: ada, run: RUN, measured: metrics(10) });
    store.recordEntry({ configHash: 'board-5', userId: ada, run: RUN, measured: metrics(60) });
    expect(store.board('board-4', 'awtS', 25)[0]?.measured.awtS).toBe(10);
    expect(store.board('board-5', 'awtS', 25)[0]?.measured.awtS).toBe(60);
    expect(store.boards().map((board) => board.configHash).sort()).toEqual(['board-4', 'board-5']);
  });

  it('honours its limit', () => {
    const { store, ada, bo } = fixture();
    store.recordEntry({ configHash: 'board-6', userId: ada, run: RUN, measured: metrics(10) });
    store.recordEntry({ configHash: 'board-6', userId: bo, run: RUN, measured: metrics(20) });
    expect(store.board('board-6', 'awtS', 1)).toHaveLength(1);
  });

  it('refuses an entry for a user that does not exist', () => {
    const { store } = fixture();
    expect(() =>
      store.recordEntry({ configHash: 'board-7', userId: 'nobody', run: RUN, measured: metrics(10) }),
    ).toThrow();
  });

  it('round-trips the run it stored, so a board row can be replayed', () => {
    const { store, ada } = fixture();
    // Invariant 5, at the storage layer: an entry that lost its seed would be a score nobody could
    // ever re-verify, which is the one property the whole design rests on.
    store.recordEntry({ configHash: 'board-8', userId: ada, run: RUN, measured: metrics(10) });
    expect(store.board('board-8', 'awtS', 25)[0]?.run).toEqual(RUN);
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

  it('issues a challenge once and never overwrites it', () => {
    const { store } = fixture();
    store.issueChallenge(CHALLENGE);
    // A rotation edit must not move the window or the seed set of a challenge people are currently
    // posting to — that is § D214 § 4's defect with a competition on it, where the stored entries
    // would stop describing the challenge they name. First issue wins; an edit takes effect next
    // cycle.
    const rewritten = store.issueChallenge({ ...CHALLENGE, seeds: ['9'], closesAtMs: 0 });
    expect(rewritten.seeds).toEqual([...CHALLENGE.seeds]);
    expect(store.challengeById(CHALLENGE.id)?.closesAtMs).toBe(CHALLENGE.closesAtMs);
  });

  it('gives each player one row, and a re-submission replaces it', () => {
    const { store, ada } = fixture();
    store.issueChallenge(CHALLENGE);
    const first = store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'collective',
      score: challengeScore(40),
    });
    const again = store.recordChallengeEntry({
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
    const board = store.challengeBoard(CHALLENGE.id, 'data-1', 'awtS', 25);
    expect(board).toHaveLength(1);
    expect(board[0]?.dispatcherProfileId).toBe('eta');
    expect(board[0]?.score.meanAwtS).toBe(30);
  });

  it('orders two dispatchers against each other on one board — the defect § D218 fixes', () => {
    const { store, ada, bo } = fixture();
    store.issueChallenge(CHALLENGE);
    for (const [userId, dispatcherProfileId, awtS] of [
      [ada, 'collective', 25],
      [bo, 'destination-eta', 20],
    ] as const) {
      store.recordChallengeEntry({
        challengeId: CHALLENGE.id,
        dataHash: 'data-1',
        userId,
        dispatcherProfileId,
        score: challengeScore(awtS),
      });
    }
    const board = store.challengeBoard(CHALLENGE.id, 'data-1', 'awtS', 25);
    expect(board.map((entry) => entry.displayName)).toEqual(['Bo', 'Ada']);
    // Both rows carry the count they were computed over, at both levels. R13 is a property of the
    // row, so it survives the round trip through SQLite or it is not a property of the row.
    expect(board[0]?.score.runs).toBe(5);
    expect(board[0]?.score.legs).toBe(100);
    expect(board[0]?.score.perSeed).toHaveLength(5);
  });

  it('forks a board when the reference data changes, and counts what is on the other one', () => {
    const { store, ada, bo } = fixture();
    store.issueChallenge(CHALLENGE);
    store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-1',
      userId: ada,
      dispatcherProfileId: 'collective',
      score: challengeScore(25),
    });
    store.recordChallengeEntry({
      challengeId: CHALLENGE.id,
      dataHash: 'data-2',
      userId: bo,
      dispatcherProfileId: 'collective',
      score: challengeScore(15),
    });
    // Not merged — a run this server can no longer reproduce cannot sit in the same order as one it
    // can — and not dropped either, because a surface that silently omitted them would be losing
    // rows without saying so.
    expect(store.challengeBoard(CHALLENGE.id, 'data-1', 'awtS', 25)).toHaveLength(1);
    expect(store.challengeDataHashes(CHALLENGE.id).map((group) => group.dataHash).sort()).toEqual([
      'data-1',
      'data-2',
    ]);
  });

  it('refuses an entry for a challenge that was never issued', () => {
    const { store, ada } = fixture();
    // A foreign key, not a loose id: an entry whose challenge does not exist is a row nobody could
    // ever replay, because the seeds and the configuration live on the challenge.
    expect(() =>
      store.recordChallengeEntry({
        challengeId: 'never-issued-0',
        dataHash: 'data-1',
        userId: ada,
        dispatcherProfileId: 'collective',
        score: challengeScore(25),
      }),
    ).toThrow();
  });

  it('lists issued challenges, most recently opened first', () => {
    const { store } = fixture();
    store.issueChallenge(issuedChallengeFor(0));
    store.issueChallenge(issuedChallengeFor(2));
    store.issueChallenge(issuedChallengeFor(1));
    expect(store.recentChallenges(10).map((issued) => issued.id)).toEqual([
      issuedChallengeFor(2).id,
      issuedChallengeFor(1).id,
      issuedChallengeFor(0).id,
    ]);
  });
});
