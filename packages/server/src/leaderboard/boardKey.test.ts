/**
 * **The board key is the contract's, and no player-settable parameter is in it.**
 *
 * `ENGINE_CONTRACT.md` § 12.1. The rule this file exists to keep is one sentence — *"No
 * player-settable parameter may enter a board key"* — and it is tested the only way a negative like
 * that can be: by driving **every axis a player can move** through {@link placeSubmission} and
 * requiring the key not to move with it. A test that checked two cases would prove two cases.
 */

import { describe, expect, it } from 'vitest';

import {
  BOARD_KEYS,
  DAILY_FIXTURE_CONFIG,
  dailyDateOf,
  dailyFixtureAt,
  dailySeedFor,
  isDailyFixtureRun,
  placeSubmission,
  runDataHashOf,
} from './boardKey.js';
import { ACCEPTED_DURATIONS_S, type SubmittedRun } from './submission.js';

const NOW_MS = Date.UTC(2026, 8, 1, 11, 30, 0);
const FIXTURE = dailyFixtureAt(NOW_MS);

/** A run that **is** today's fixture — the daily board's own membership condition. */
const TODAY: SubmittedRun = Object.freeze({
  ...DAILY_FIXTURE_CONFIG,
  dispatcherProfileId: 'collective',
  seed: FIXTURE.seed,
});

/** A run that is not: a different building, which nothing about the fixture names. */
const ELSEWHERE: SubmittedRun = Object.freeze({ ...TODAY, buildingId: 'midtown-office' });

const FACTS = Object.freeze({
  buildingDigest: 'aaa',
  dispatcherDigest: 'bbb',
  templateDigest: 'ccc',
  trafficModel: 'v1',
});

/* -------------------------------------------------------------------------- *
 * The forbidden key
 * -------------------------------------------------------------------------- */

describe('no player-settable parameter enters a board key', () => {
  /**
   * Every axis a player picks, each with a value that is not the fixture's.
   *
   * This list **is** the contract's own enumeration — *"building × dispatcher × traffic template ×
   * arrival rate × run length"* — plus the window § D288 added and the two fields this wave added,
   * so it covers the whole of what a submission lets a player choose.
   */
  const MOVES: readonly (readonly [string, Partial<SubmittedRun>])[] = Object.freeze([
    ['building', { buildingId: 'midtown-office' }],
    ['dispatcher', { dispatcherProfileId: 'eta' }],
    ['traffic template', { demandTemplateId: 'rise-and-fall' }],
    ['arrival rate', { arrivalRatePctPop5min: 8 }],
    ['run length', { durationS: 1_800 }],
    ['window', { windowStartS: 3_600 }],
    ['seed', { seed: '999' }],
    ['rules', { ruleRows: [{ when: 'call-waited' as const, whenValue: 60, then: 'jump-queue' as const }] }],
    ['intervention log', { interventions: [{ atS: 300, change: { kind: 'park-cars-lobby' as const } }] }],
  ]);

  it('gives one key to every configuration a player can invent, and it is their own log', () => {
    /*
     * The defect, stated as the property that refutes it. Before the split each of these moves
     * produced a *different* board — nine axes, every combination its own leaderboard of one, with
     * its inventor permanently first. Now every one of them lands in the same place: the player's
     * personal-record log, which is what the contract says *"anything else"* is.
     */
    const keys = new Set(
      MOVES.map(([, patch]) => placeSubmission({ ...ELSEWHERE, ...patch }, 'ada', FIXTURE).key),
    );
    expect([...keys]).toEqual(['personal:ada']);
  });

  it('keeps the day’s board keyed by the date alone, whatever the player brought to it', () => {
    /*
     * The other half, and the one that decides whether the daily board is a board at all. The
     * dispatcher, the rules and the log are exactly what a player *may* vary on the day's fixture —
     * they are the competitive axes — so none of them may move the key, or every entrant would be
     * on a board of their own again by a different route.
     */
    for (const patch of [
      { dispatcherProfileId: 'eta' },
      { ruleRows: [{ when: 'lobby-queue-passes' as const, whenValue: 12, then: 'hold-at-lobby' as const }] },
      { interventions: [{ atS: 900, change: { kind: 'park-cars-lobby' as const } }] },
    ] as const) {
      expect(placeSubmission({ ...TODAY, ...patch }, 'ada', FIXTURE)).toEqual({
        kind: 'daily',
        key: 'daily:2026-09-01',
        date: '2026-09-01',
      });
    }
  });

  it('does not put two players on two boards for playing the same day', () => {
    // The daily board is *"one board a day, everybody on it"*. A key carrying the player would be
    // the personal log wearing the day's name.
    expect(placeSubmission(TODAY, 'ada', FIXTURE).key).toBe(placeSubmission(TODAY, 'bo', FIXTURE).key);
  });

  it('does give two players two logs, because a personal log is one player’s', () => {
    expect(placeSubmission(ELSEWHERE, 'ada', FIXTURE).key).not.toBe(
      placeSubmission(ELSEWHERE, 'bo', FIXTURE).key,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The day's fixture
 * -------------------------------------------------------------------------- */

describe('the day’s fixture', () => {
  it('is the same fixture at every hour of one UTC day, and a new one at the next', () => {
    // The key is a *date*. A fixture that turned over at some other moment would put two crowds on
    // one board, which is § 12.1's *"Rows within a board must have met the identical crowd"*.
    expect(dailyFixtureAt(Date.UTC(2026, 8, 1, 0, 0, 0)).date).toBe('2026-09-01');
    expect(dailyFixtureAt(Date.UTC(2026, 8, 1, 23, 59, 59)).date).toBe('2026-09-01');
    expect(dailyFixtureAt(Date.UTC(2026, 8, 2, 0, 0, 0)).date).toBe('2026-09-02');
  });

  it('gives every player on one day the identical crowd, and two days two crowds', () => {
    expect(dailySeedFor('2026-09-01')).toBe('20260901');
    expect(dailySeedFor('2026-09-01')).not.toBe(dailySeedFor('2026-09-02'));
    // Decimal digits, because that is what `submissionIssues` accepts and what `BigInt` reads.
    expect(dailySeedFor(dailyDateOf(NOW_MS))).toMatch(/^\d{1,20}$/u);
  });

  it('refuses a run that met a different crowd, however identical the rest of it is', () => {
    // Yesterday's seed on today's fixture is a *replay of a past day*, which § 12 suppresses from
    // posting outright. Here it simply is not today's board: the run met a crowd nobody else on the
    // board met, and ranking it beside them would be ranking luck.
    expect(isDailyFixtureRun(TODAY, FIXTURE)).toBe(true);
    expect(isDailyFixtureRun({ ...TODAY, seed: dailySeedFor('2026-08-31') }, FIXTURE)).toBe(false);
  });

  it('is a run this server will actually accept, rather than a shape only this file can write', () => {
    /*
     * The fixture names `windowStartS: 0` with a 36 000 s length rather than `durationS` alone, and
     * that is forced rather than stylistic: `office-day` is an authored phase list and `core`
     * refuses `templateOverrides.durationS` on one by name (§ D275). A fixture written the other
     * way would be a daily board whose every submission threw inside the replay.
     *
     * Asserted against the *lengths the server accepts* rather than against a literal, so a fixture
     * edited to a length nobody may post is red here rather than at the first submission.
     */
    expect(DAILY_FIXTURE_CONFIG.windowStartS).toBe(0);
    expect(ACCEPTED_DURATIONS_S).toContain(DAILY_FIXTURE_CONFIG.durationS);
  });
});

/* -------------------------------------------------------------------------- *
 * The table, both ways
 * -------------------------------------------------------------------------- */

describe('the contract’s three keys, and which of them this build reaches', () => {
  it('transcribes exactly the three § 12.1 names', () => {
    expect(BOARD_KEYS.map((row) => row.key)).toEqual(['date', 'dispatcher id', 'anything else']);
  });

  it('reaches every key that claims a route', () => {
    // A row with a route and no way to produce it would be the docstring-claims-a-caller defect
    // this repository has shipped eleven times.
    const produced = new Set([
      placeSubmission(TODAY, 'ada', FIXTURE).kind,
      placeSubmission(ELSEWHERE, 'ada', FIXTURE).kind,
    ]);
    expect(produced).toEqual(new Set(['daily', 'personal']));
    expect(BOARD_KEYS.filter((row) => row.route !== null).map((row) => row.key)).toEqual([
      'date',
      'anything else',
    ]);
  });

  it('reaches none of the keys that claim no route, and says which those are', () => {
    /*
     * **The ladder is declared and unbuilt, and this is where that is kept honest.** A single
     * `SubmittedRun` is one case; a rating is a mean over forty (§ 12.3), so no submission this
     * endpoint can receive is a ladder entry. The row stays in the table because a client has to be
     * able to label the absence (§ 12.2) rather than draw nothing, and it stays `route: null`
     * because inventing a `'ladder'` branch nothing produces would be a contract quotation over
     * dead code.
     *
     * The day that route is built, this assertion is what says the table has to be updated with it.
     */
    expect(BOARD_KEYS.filter((row) => row.route === null).map((row) => row.key)).toEqual([
      'dispatcher id',
    ]);
    const kinds = new Set(
      [TODAY, ELSEWHERE, { ...TODAY, dispatcherProfileId: 'eta' }].map(
        (run) => placeSubmission(run, 'ada', FIXTURE).kind,
      ),
    );
    expect([...kinds]).not.toContain('ladder');
  });
});

/* -------------------------------------------------------------------------- *
 * The two jobs, separated
 * -------------------------------------------------------------------------- */

describe('the digest and the key answer different questions', () => {
  it('gives one board key to runs whose data hashes differ, which is the whole point', () => {
    // Two configurations in one player's log. Before the split, "different data" meant "different
    // board"; now it means "different row", and the log is one place.
    const a = { ...ELSEWHERE, durationS: 1_800 };
    const b = { ...ELSEWHERE, durationS: 3_600 };
    expect(runDataHashOf(a, FACTS)).not.toBe(runDataHashOf(b, FACTS));
    expect(placeSubmission(a, 'ada', FIXTURE).key).toBe(placeSubmission(b, 'ada', FIXTURE).key);
  });

  it('gives one data hash to runs on two different boards, which is the other half', () => {
    // Same measurement, two players: one posts it on the day's board, the other has it in a log
    // because their fixture was yesterday's. The digest cannot tell them apart and must not — it is
    // an answer about data, and both were measured against the same data.
    const yesterday = dailyFixtureAt(NOW_MS - 24 * 3_600_000);
    expect(runDataHashOf(TODAY, FACTS)).toBe(runDataHashOf(TODAY, FACTS));
    expect(placeSubmission(TODAY, 'ada', FIXTURE).kind).toBe('daily');
    expect(placeSubmission(TODAY, 'ada', yesterday).kind).toBe('personal');
  });
});
