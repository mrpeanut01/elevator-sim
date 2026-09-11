/**
 * **The board key is the contract's, and no player-settable parameter is in it.**
 *
 * `ENGINE_CONTRACT.md` § 12.1. The rule this file exists to keep is one sentence — *"No
 * player-settable parameter may enter a board key"* — and it is tested the only way a negative like
 * that can be: by driving **every axis a player can move** through {@link placeSubmission} and
 * requiring the key not to move with it. A test that checked two cases would prove two cases.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BOARD_KEYS,
  DAILY_FIXTURE_CONFIG,
  dailyDateOf,
  dailyFixtureAt,
  dailySeedFor,
  isDailyFixtureRun,
  modifierSetKeyOf,
  placeSubmission,
  runDataHashOf,
  rushPlacementOf,
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
        // The standard set — GitHub issue #371. Named rather than omitted, because a placement
        // that silently carried a set here would be the fourth axis moving under a run that
        // bought nothing.
        modifiers: [],
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
  it('transcribes the three § 12.1 names, with the one § D526 amends said as amended', () => {
    /*
     * **The first row is no longer § 12.1's word, and that is the point rather than a slip.**
     * § D526 clause 3 keys the daily board by the modifier set as well as the date, and this table
     * is what `placeSubmission` is checked against — a row still reading `date` beside a function
     * that produces `daily:…/rush-purse-top-up=2` would be § D227's stale refusal in a data
     * structure. The other two are the contract's, untouched.
     */
    expect(BOARD_KEYS.map((row) => row.key)).toEqual([
      'date × modifier set',
      'dispatcher id',
      'anything else',
      // Not § 12.1's: the rush board GitHub issue #372 built, § D543. Its own describe block below.
      'building × date × modifier set',
    ]);
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
      'date × modifier set',
      'anything else',
      'building × date × modifier set',
    ]);
    expect(rushPlacementOf('garden-apartments', NOW_MS, undefined).kind).toBe('rush');
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

/* -------------------------------------------------------------------------- *
 * The fourth axis — GitHub issue #371, § D526 clause 3
 * -------------------------------------------------------------------------- */

/**
 * **Boards are keyed by modifier set as well as by day.**
 *
 * The file above proves the negative § 12.1 asks for — no *player-settable* parameter enters a key —
 * and this describes the one axis § D526 clause 3 puts in deliberately. The two are not in tension
 * and the cases say why rather than the prose: the space is bounded by the shipped ledger, nothing
 * a player selects reaches it, and the standard set is the empty one so the key everybody is on
 * does not move.
 */
describe('the modifier set is the daily key’s fourth axis — issue #371', () => {
  const PURSE = Object.freeze([{ sinkId: 'rush-purse-top-up', steps: 2 }]);
  const PREFIT = Object.freeze([{ sinkId: 'rush-prefit', steps: 1 }]);

  it('leaves the standard board’s key exactly where it was, byte for byte', () => {
    /*
     * **The migration this change does not need.** A database is holding `daily:2026-09-01` rows
     * right now; if the standard set appended anything at all — `/`, `standard`, an empty
     * separator — every one of them would be stranded on a board nothing asks for any more, and
     * only an application-level backfill could recover them. The empty set appends nothing, so
     * they are on the standard board because they always were.
     */
    expect(placeSubmission(TODAY, 'ada', FIXTURE).key).toBe('daily:2026-09-01');
    expect(placeSubmission(TODAY, 'ada', FIXTURE, []).key).toBe('daily:2026-09-01');
    expect(placeSubmission(TODAY, 'ada', FIXTURE, undefined).key).toBe('daily:2026-09-01');
    expect(modifierSetKeyOf(undefined)).toBe('');
    expect(modifierSetKeyOf([])).toBe('');
  });

  it('puts a bought purse on its own board rather than beside the standard runs', () => {
    // § D526 clause 3 in one assertion: *a run with a bought purse ranks among runs with the same
    // modifiers*. Two different sets are two different boards, and neither is the standard one.
    const standard = placeSubmission(TODAY, 'ada', FIXTURE).key;
    const purse = placeSubmission(TODAY, 'ada', FIXTURE, PURSE).key;
    const prefit = placeSubmission(TODAY, 'ada', FIXTURE, PREFIT).key;
    expect(new Set([standard, purse, prefit]).size).toBe(3);
    expect(purse).toBe('daily:2026-09-01/rush-purse-top-up=2');
  });

  it('is the same board for two players who bought the same thing, whoever they are', () => {
    // The daily board's own property, held one axis along: a key carrying the player would be the
    // personal log wearing the set's name.
    expect(placeSubmission(TODAY, 'ada', FIXTURE, PURSE).key).toBe(
      placeSubmission(TODAY, 'bo', FIXTURE, PURSE).key,
    );
  });

  it('is one board however the purchases that produced the set were spelled', () => {
    /*
     * **The boundary the defect would really sit on.** `chimes/ledger.ts#unbackedModifiers` decides
     * entitlement *by sink and summed* — *"a budget bought in two steps and a budget bought in one
     * are the same budget"* — so a key that hashed the claim list would put two players who played
     * identically on two boards, and the second one would be a leaderboard of one.
     *
     * Four spellings of the same set, and every one of them is the same key: order reversed, one
     * claim split into two, a zero-step claim that is not a claim, and the canonical form itself.
     */
    const spellings = [
      [{ sinkId: 'rush-prefit', steps: 1 }, { sinkId: 'rush-purse-top-up', steps: 2 }],
      [{ sinkId: 'rush-purse-top-up', steps: 2 }, { sinkId: 'rush-prefit', steps: 1 }],
      [
        { sinkId: 'rush-purse-top-up', steps: 1 },
        { sinkId: 'rush-prefit', steps: 1 },
        { sinkId: 'rush-purse-top-up', steps: 1 },
      ],
      [
        { sinkId: 'rush-purse-top-up', steps: 2 },
        { sinkId: 'career-purse-top-up', steps: 0 },
        { sinkId: 'rush-prefit', steps: 1 },
      ],
    ];
    const keys = new Set(spellings.map((set) => placeSubmission(TODAY, 'ada', FIXTURE, set).key));
    expect([...keys]).toEqual(['daily:2026-09-01/rush-prefit=1+rush-purse-top-up=2']);
  });

  it('tells one step from two, because a wider purse is a different starting condition', () => {
    // The other direction of the case above, and the reason it is a *sum* rather than a set of
    // sink ids: two steps of a purse is more units than one, so those runs are not comparable.
    expect(modifierSetKeyOf([{ sinkId: 'rush-purse-top-up', steps: 1 }])).not.toBe(
      modifierSetKeyOf([{ sinkId: 'rush-purse-top-up', steps: 2 }]),
    );
  });

  it('resets with the day, because the date is still in the key — § D509', () => {
    /*
     * § D509 clause 1: *the daily board resets by construction and on no interval anybody chose*,
     * and nothing is deleted — yesterday's rows stay under yesterday's key. A modifier-set board
     * inherits that rather than declaring it, because its key is the same date with a suffix.
     */
    const tomorrow = dailyFixtureAt(NOW_MS + 24 * 3_600_000);
    expect(placeSubmission({ ...TODAY, seed: tomorrow.seed }, 'ada', tomorrow, PURSE).key).toBe(
      'daily:2026-09-02/rush-purse-top-up=2',
    );
    expect(placeSubmission({ ...TODAY, seed: tomorrow.seed }, 'ada', tomorrow, PURSE).key).not.toBe(
      placeSubmission(TODAY, 'ada', FIXTURE, PURSE).key,
    );
  });

  it('leaves a personal log one log, and separates its rows by the hash instead', () => {
    /*
     * The asymmetry, asserted in both halves. A personal log is *one player's own record*; keying
     * it by the set would give one player several logs and a record in none of them. What the log
     * does need is to tell the two runs apart as **rows**, and `runDataHashOf` is where that
     * happens — the pair `(board_key, data_hash)` is part of `entries`' natural key, so without
     * this the two would upsert over each other.
     */
    expect(placeSubmission(ELSEWHERE, 'ada', FIXTURE, PURSE).key).toBe('personal:ada');
    expect(placeSubmission(ELSEWHERE, 'ada', FIXTURE).key).toBe('personal:ada');
    expect(runDataHashOf(ELSEWHERE, FACTS, PURSE)).not.toBe(runDataHashOf(ELSEWHERE, FACTS));
  });

  it('digests a standard run to the identical hex string it always did', () => {
    // The property the whole `emptyToUndefined` treatment exists for: every row already stored
    // must still name the data it was measured against.
    const before = runDataHashOf(TODAY, FACTS);
    expect(runDataHashOf(TODAY, FACTS, [])).toBe(before);
    expect(runDataHashOf(TODAY, FACTS, undefined)).toBe(before);
    expect(runDataHashOf(TODAY, FACTS, [{ sinkId: 'rush-purse-top-up', steps: 0 }])).toBe(before);
  });

  it('gives the board key and the data hash one canonical form, not two', () => {
    /*
     * One derivation, and the case that would catch a second. If either consumer sorted or summed
     * for itself, these two spellings would agree on one value and differ on the other — which is
     * how a row lands on the right board carrying the wrong measurement identity, or the reverse.
     */
    const a = [{ sinkId: 'rush-prefit', steps: 1 }, { sinkId: 'rush-purse-top-up', steps: 2 }];
    const b = [
      { sinkId: 'rush-purse-top-up', steps: 1 },
      { sinkId: 'rush-purse-top-up', steps: 1 },
      { sinkId: 'rush-prefit', steps: 1 },
    ];
    expect(placeSubmission(TODAY, 'ada', FIXTURE, a).key).toBe(placeSubmission(TODAY, 'ada', FIXTURE, b).key);
    expect(runDataHashOf(TODAY, FACTS, a)).toBe(runDataHashOf(TODAY, FACTS, b));
  });

  it('carries the set on the placement, so the row and the key cannot disagree', () => {
    // `http/api.ts` records the row from `placement.modifiers` rather than from its own copy of the
    // claim, which is what makes *the board says X and the row says Y* unreachable rather than
    // merely unlikely.
    const placement = placeSubmission(TODAY, 'ada', FIXTURE, [
      { sinkId: 'rush-purse-top-up', steps: 1 },
      { sinkId: 'rush-purse-top-up', steps: 1 },
    ]);
    expect(placement.modifiers).toEqual([{ sinkId: 'rush-purse-top-up', steps: 2 }]);
    expect(placement.key).toContain(modifierSetKeyOf(placement.modifiers));
  });

  it('names no price in any key it can produce, over the whole shipped ledger', () => {
    /*
     * § D526 clause 3 forbids a currency figure in a comparison between players, and a board key is
     * the most durable one there is. Driven over every sink the shipped table sells at every step
     * it sells, rather than over a hand-picked pair — a key format that interpolated the price
     * would pass a two-case test and fail here.
     *
     * **Asserted against the modifier part rather than the whole key, and the first draft was
     * wrong about that.** The whole key begins `daily:2026-09-01`, so a search for
     * `career-purse-top-up`'s two-step price of `20` found the `20` in `2026` and reported a defect
     * that was not there. A guard whose boundary is a substring of a date is a guard that will be
     * deleted rather than understood; the price can only ever land in the part this function
     * produces, so that is the part the case reads.
     */
    const table = JSON.parse(
      readFileSync(new URL('../../../../data/chime-ledger.json', import.meta.url), 'utf8'),
    ) as { readonly sinks: readonly { readonly id: string; readonly priceChimes: number; readonly maxSteps: number }[] };
    expect(table.sinks.length).toBeGreaterThan(0);
    for (const sink of table.sinks) {
      for (let steps = 1; steps <= sink.maxSteps; steps += 1) {
        const claim = [{ sinkId: sink.id, steps }];
        const setKey = modifierSetKeyOf(claim);
        expect(placeSubmission(TODAY, 'ada', FIXTURE, claim).key).toBe(`daily:2026-09-01/${setKey}`);
        expect(setKey).toContain(sink.id);
        for (const price of [sink.priceChimes, sink.priceChimes * steps]) {
          // Both the unit price and what these steps cost, because either would be the figure a
          // reader could do arithmetic on. `steps` itself is in the key and is not a price.
          if (price === steps) continue;
          expect(
            setKey,
            `${sink.id} at ${String(steps)} steps carries ${String(price)} chimes into the board key`,
          ).not.toContain(String(price));
        }
      }
    }
  });

  it('mints a bounded number of boards a day, and the bound is the ledger’s rather than a number here', () => {
    /*
     * **The whole answer to *"is this the forbidden digest coming back?"*, computed rather than
     * argued.** The key § 12.1 forbids fragments into thousands because its axes are open. This one
     * is closed by `data/chime-ledger.json`: each sink contributes `maxSteps + 1` states (absent, or
     * one of its steps), so the space is the product — and the bound is derived from the table, so
     * a ledger that grew an unbounded sink fails here rather than at the first empty board.
     */
    const table = JSON.parse(
      readFileSync(new URL('../../../../data/chime-ledger.json', import.meta.url), 'utf8'),
    ) as { readonly sinks: readonly { readonly maxSteps: number }[] };
    const boardsPerDay = table.sinks.reduce((total, sink) => total * (sink.maxSteps + 1), 1);
    expect(boardsPerDay).toBeLessThanOrEqual(64);
    /*
     * **And the module's own docstring quotes this figure, so it is read back rather than trusted.**
     * `boardKey.ts` says *"4 × 4 × 2 = 32 keys a day"* to make the bounded-space argument concrete.
     * A published number that nothing re-derives is the defect `CLAUDE.md` names outright — three
     * figures in this repository did not reproduce from the code that produced them — so the
     * docstring is asserted against the table rather than against a reader's memory of it. A ledger
     * that gains a sink makes this red on the line that has to be edited.
     */
    const module = readFileSync(new URL('./boardKey.ts', import.meta.url), 'utf8');
    expect(
      module,
      `boardKey.ts’s docstring no longer quotes the ${String(boardsPerDay)} the shipped ledger produces`,
    ).toContain(`${String(boardsPerDay)} keys a day`);
  });
});

/* -------------------------------------------------------------------------- *
 * The rush board — GitHub issue #372, § D543
 * -------------------------------------------------------------------------- */

describe('the rush board — building × date × modifier set', () => {
  it('keys a posted sitting by its building, the day and the set, and appends nothing for the standard set', () => {
    expect(rushPlacementOf('garden-apartments', NOW_MS, undefined)).toEqual({
      kind: 'rush',
      key: 'rush:garden-apartments:2026-09-01',
      date: '2026-09-01',
      buildingId: 'garden-apartments',
      modifiers: [],
    });
    const set = [{ sinkId: 'rush-purse-top-up', steps: 2 }];
    expect(rushPlacementOf('garden-apartments', NOW_MS, set).key).toBe(`rush:garden-apartments:2026-09-01/${modifierSetKeyOf(set)}`);
  });

  it('puts another tower on another board, because rows on one board must have met the identical crowd', () => {
    // § 12.1's last sentence. The rush is the same number of people on every tower, not the same
    // people: they arrive at a different building's floors, so a sort across towers ranks buildings.
    expect(rushPlacementOf('midtown-office', NOW_MS, undefined).key).not.toBe(rushPlacementOf('garden-apartments', NOW_MS, undefined).key);
  });

  it('resets by construction, as every board does under § D509: tomorrow is another key and nothing is deleted', () => {
    const tomorrow = NOW_MS + 24 * 60 * 60 * 1000;
    expect(rushPlacementOf('garden-apartments', tomorrow, undefined).key).toBe('rush:garden-apartments:2026-09-02');
  });

  it('is the row BOARD_KEYS names, with this function as its route', () => {
    const row = BOARD_KEYS.find((candidate) => candidate.key === 'building × date × modifier set');
    expect(row?.route).toContain('rushPlacementOf');
  });
});
