/**
 * The daily tab's five states, driven without a document.
 *
 * The screen's `mount` needs a DOM, a worker and `data/proof-cases.json`; its *decision* needs
 * none of the three, which is why {@link dailyBoardViewOf} is a pure function and this file exists.
 * The renderer beside it is asserted in `boardScreen.browser.test.ts` on the real page.
 *
 * The case worth reading first is the one that separates *nobody has posted* from *we could not
 * ask*. Those two produced one sentence before GitHub issue #221, and a screen that says the first
 * when the second is true has published a claim about the world it never obtained.
 */
import { describe, expect, it } from 'vitest';

import type { BoardEntry } from '../menu/client.js';

import { BOARD_SCREEN_COPY, DAILY_BOARD_ABSENCE, dailyBoardViewOf } from './boardScreen.js';

/**
 * One posted row. `legs: null` is *the server sent no count*, and it is `null` rather than
 * `undefined` because a default parameter takes effect for `undefined` too — a helper written
 * `legs: number | undefined = 312` silently gave every "no count" case a count, and both tests
 * below passed against the wrong fixture until the assertion said so.
 */
function entry(displayName: string, awtS: number, legs: number | null = 312): BoardEntry {
  return {
    id: `row-${displayName}`,
    displayName,
    run: {
      buildingId: 'midtown-office',
      dispatcherProfileId: 'eta',
      demandTemplateId: 'up-peak',
      arrivalRatePctPop5min: 4,
      durationS: 900,
      windowStartS: null,
      seed: 'seed-7',
    },
    dataHash: 'hash',
    legs: legs ?? undefined,
    measured: {
      awtS,
      wt95S: awtS * 2,
      ttdMeanS: awtS * 3,
      pctOverLongWait: 0,
      awtIsValid: true,
    },
    submittedAtMs: 0,
  };
}

const textOf = (board: Parameters<typeof dailyBoardViewOf>[0]): string =>
  dailyBoardViewOf(board)
    .lines.map((line) => line.text)
    .join(' ');

describe('the daily board tab', () => {
  it('says it is asking while the read is in flight, and shows no absence', () => {
    const view = dailyBoardViewOf(undefined);
    expect(view.rows).toEqual([]);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.text).toBe(BOARD_SCREEN_COPY.dailyAsking);
    /* The quieter grey: this is a progress line, not a reason the board is absent. */
    expect(view.lines[0]?.role).toBe('note');
    expect(textOf(undefined)).not.toContain('Nobody has posted');
  });

  it('draws the build-has-no-server sentence only when the host holds no client', () => {
    expect(textOf({ kind: 'no-server' })).toBe(DAILY_BOARD_ABSENCE);
    for (const other of [
      { kind: 'unreachable', detail: 'x' },
      { kind: 'undeclared' },
      { kind: 'board', date: '2026-09-02', note: 'n', distribution: undefined, distributionDetail: undefined, rows: [] },
    ] as const) {
      expect(textOf(other)).not.toContain('this build has none');
    }
  });

  it('carries the server’s own sentence when the read failed, under ours', () => {
    const view = dailyBoardViewOf({ kind: 'unreachable', detail: 'HTTP 503 from the board service' });
    expect(view.rows).toEqual([]);
    expect(view.lines).toHaveLength(2);
    expect(view.lines[0]?.text).toBe(BOARD_SCREEN_COPY.dailyUnreachable);
    /* Carried rather than paraphrased — a paraphrase of a reason we did not author is a guess. */
    expect(view.lines[1]?.text).toBe('HTTP 503 from the board service');
  });

  it('never says nobody posted when the board could not be reached', () => {
    const said = textOf({ kind: 'unreachable', detail: 'the network went away' });
    expect(said).not.toContain('Nobody has posted');
    expect(said).not.toContain('resets tomorrow');
  });

  it('distinguishes a server too old to name a day from a day with no board', () => {
    const undeclared = textOf({ kind: 'undeclared' });
    expect(undeclared).toBe(BOARD_SCREEN_COPY.dailyUndeclared);
    expect(undeclared).not.toContain('Nobody has posted');
    expect(dailyBoardViewOf({ kind: 'undeclared' }).rows).toEqual([]);
  });

  it('says nobody has posted only for a board that was actually read and is empty', () => {
    const view = dailyBoardViewOf({
      kind: 'board',
      date: '2026-09-02',
      note: 'Every row is replayed before it appears.',
      distribution: undefined, distributionDetail: undefined, rows: [],
    });
    expect(view.rows).toEqual([]);
    /* The server's note stays: it is what makes the board's rows mean anything, empty or not. */
    expect(view.lines[0]?.text).toBe('Every row is replayed before it appears.');
    expect(view.lines[1]?.text).toBe(BOARD_SCREEN_COPY.dailyEmpty);
  });

  it('ranks the rows in the order the server sent them and draws one figure each', () => {
    const view = dailyBoardViewOf({
      kind: 'board',
      date: '2026-09-02',
      note: 'note',
      distribution: undefined, distributionDetail: undefined, rows: [entry('Ada', 21.44), entry('Grace', 29.5)],
    });
    /*
     * The whole row rather than the fields this case is about, deliberately: a field added to
     * `DailyBoardRowView` and left undrawn arrives here as a failure rather than as nothing.
     * `house` and `modifiers` are the standard-run answers — `undefined` for a run nobody's house
     * posted, `''` for the empty modifier set (GitHub issue #371).
     */
    expect(view.rows).toEqual([
      { id: 'row-Ada', watch: 'watch', place: '1', displayName: 'Ada', driver: 'eta', gap: '', figure: '21.4 s', count: 'over 312 rides', house: undefined, modifiers: '' },
      { id: 'row-Grace', watch: 'watch', place: '2', displayName: 'Grace', driver: 'eta', gap: '', figure: '29.5 s', count: 'over 312 rides', house: undefined, modifiers: '' },
    ]);
  });

  /**
   * GitHub issue #93 on the daily board: the dispatcher is revealed on every row by name when this
   * build ships it, and the player's own row says how far behind the top row it is — in
   * `menu/gap.ts`'s one sentence, on published figures only, and never on anybody else's row.
   */
  it('names who drove each row, and tells the player their own distance from the top', () => {
    const rows = [entry('Ada', 21.44), entry('Grace', 29.5), entry('Lin', 31, null)];
    const board = { kind: 'board' as const, date: '2026-09-02', note: 'note', distribution: undefined, distributionDetail: undefined, rows };
    const named = dailyBoardViewOf(board, 'Grace', (id) => (id === 'eta' ? 'Minimum estimated wait' : undefined));
    expect(named.rows.map((row) => row.driver)).toEqual(['Minimum estimated wait', 'Minimum estimated wait', 'Minimum estimated wait']);
    expect(named.rows[1]?.watch).toBe('yours');
    expect(named.rows[1]?.gap).toBe(' · 8.1 s behind the top row on this board’s metric');
    /* Nobody else's row carries a gap, and the top row's own is empty even when it is the player's. */
    expect(named.rows[0]?.gap).toBe('');
    expect(named.rows[2]?.gap).toBe('');
    expect(dailyBoardViewOf(board, 'Ada').rows[0]?.gap).toBe('');
    /* A withheld mean has no distance from anything. */
    expect(dailyBoardViewOf(board, 'Lin').rows[2]?.gap).toBe('');
    /* An id this build does not ship is drawn as itself rather than invented into a name. */
    expect(dailyBoardViewOf(board).rows[0]?.driver).toBe('eta');
  });

  it('withholds a row’s mean when the server sent no count for it', () => {
    /*
     * R13 clause one, and this is the case that made the whole `legs` field exist: the honesty
     * corpus reported `estimate-without-n` on this row the day it was written. A count this client
     * could not obtain is not a count it may invent, so the mean goes rather than the caveat.
     */
    const view = dailyBoardViewOf({
      kind: 'board',
      date: '2026-09-02',
      note: 'note',
      distribution: undefined, distributionDetail: undefined, rows: [entry('Ada', 21.4, null)],
    });
    expect(view.rows[0]?.count).toBeUndefined();
    expect(view.rows[0]?.figure).not.toContain('21.4');
    /* Still ranked and still named — the ranking is the server's and this row earned its place. */
    expect(view.rows[0]).toMatchObject({ place: '1', displayName: 'Ada' });
  });

  it('keeps the rows that do carry a count when one row does not', () => {
    /* A board read by one client can hold rows from before and after the field existed. */
    const view = dailyBoardViewOf({
      kind: 'board',
      date: '2026-09-02',
      note: 'note',
      distribution: undefined, distributionDetail: undefined, rows: [entry('Ada', 21.4), entry('Grace', 29.5, null), entry('Kay', 33.1, 88)],
    });
    expect(view.rows.map((row) => row.count)).toEqual([
      'over 312 rides',
      undefined,
      'over 88 rides',
    ]);
    expect(view.rows.map((row) => row.figure)).toEqual(['21.4 s', 'no count', '33.1 s']);
  });

  it('gives every row a Watch it, and the signed-in player’s own row the inert your run — GitHub issue #337', () => {
    const board = { kind: 'board' as const, date: '2026-09-06', note: 'n', distribution: undefined, distributionDetail: undefined, rows: [entry('A. Turing', 21.4), entry('Nadia R.', 29.5)] };
    expect(dailyBoardViewOf(board).rows.map((row) => row.watch)).toEqual(['watch', 'watch']);
    expect(dailyBoardViewOf(board, 'Nadia R.').rows.map((row) => row.watch)).toEqual(['watch', 'yours']);
    expect(dailyBoardViewOf(board, 'Nadia R.').rows.map((row) => row.id)).toEqual(['row-A. Turing', 'row-Nadia R.']);
    expect(BOARD_SCREEN_COPY.dailyRowYours).toBe('your run');
  });

  it('draws the middle of the board under the rows, one axis a line with its count, and never an interval — GitHub issue #327', () => {
    const base = { kind: 'board' as const, date: '2026-09-06', note: 'n', rows: [entry('Ada', 21.4)] };
    const unasked = dailyBoardViewOf({ ...base, distribution: undefined, distributionDetail: undefined });
    expect(unasked.world.map((line) => line.text)).toEqual([BOARD_SCREEN_COPY.worldHeading, BOARD_SCREEN_COPY.worldUnasked]);
    const older = dailyBoardViewOf({ ...base, distribution: undefined, distributionDetail: 'Older server.' });
    expect(older.world[1]?.text).toContain('Older server.');
    const withheld = dailyBoardViewOf({
      ...base,
      distribution: { boardKey: 'k', n: 3, ladders: [], withheld: 'Three players have posted.', absent: [], note: 'note' },
      distributionDetail: undefined,
    });
    expect(withheld.world.map((line) => line.text)).toEqual([BOARD_SCREEN_COPY.worldHeading, 'Three players have posted.']);
    const ladder = dailyBoardViewOf({
      ...base,
      distribution: {
        boardKey: 'k',
        n: 24,
        ladders: [
          { axis: 'awtS', n: 24, rungs: { p10: 12, p25: 14.1, p50: 18.25, p75: 23, p90: 30 }, medianEntryId: 'e1' },
          { axis: 'pctOverLongWait', n: 24, rungs: { p10: 0, p25: 1, p50: 3.4, p75: 5, p90: 9 }, medianEntryId: 'e2' },
        ],
        withheld: undefined,
        absent: [{ axis: 'energy', reason: 'not on the wire' }],
        note: 'Each axis is its own ladder.',
      },
      distributionDetail: undefined,
    });
    const texts = ladder.world.map((line) => line.text);
    expect(texts[0]).toBe(BOARD_SCREEN_COPY.worldHeading);
    expect(texts[1]).toContain('Mean wait');
    expect(texts[1]).toContain('18.3 s');
    expect(texts[1]).toContain('over 24 players');
    expect(texts[2]).toContain('3.4%');
    expect(texts[3]).toBe('Each axis is its own ladder.');
    expect(texts[4]).toBe('energy: not on the wire');
    for (const text of texts) expect(text).not.toMatch(/interval|confidence|±/u);
    /* No state without a read board draws a middle. */
    expect(dailyBoardViewOf({ kind: 'no-server' }).world).toEqual([]);
  });

  it('does not draw dataHash as though it were a score', () => {
    const view = dailyBoardViewOf({
      kind: 'board',
      date: '2026-09-02',
      note: 'note',
      distribution: undefined, distributionDetail: undefined, rows: [entry('Ada', 21.4)],
    });
    const drawn = [
      ...view.lines.map((line) => line.text),
      ...view.rows.map((row) => `${row.figure} ${row.count ?? ''}`),
    ];
    expect(drawn.join(' ')).not.toContain('hash');
  });
});

describe('the house’s rows — GitHub issue #222, § D521', () => {
  const house = (awtS: number, dispatcher: string): BoardEntry => ({
    ...entry('The house', awtS),
    id: `row-house-${dispatcher}`,
    baselineProfileId: dispatcher,
    run: { ...entry('The house', awtS).run, dispatcherProfileId: dispatcher },
  });
  const board = {
    kind: 'board' as const,
    date: '2026-09-06',
    note: 'One crowd.',
    distribution: undefined,
    distributionDetail: undefined,
    rows: [house(19.8, 'collective'), entry('Ada', 21.4), house(31, 'eta')],
  };

  it('tags a house row, says the note once under the board’s own, and tags no player’s row', () => {
    const view = dailyBoardViewOf(board, 'Ada', (id) => id);
    expect(view.rows.map((row) => row.house)).toEqual([BOARD_SCREEN_COPY.dailyHouseTag, undefined, BOARD_SCREEN_COPY.dailyHouseTag]);
    /*
     * Three lines now: the server's ranking note, which modifier set this board is (issue #371,
     * and these are standard runs), and then the house's. The house note stays **last**, because it
     * qualifies some of the rows in a comparison the line above it has just defined.
     */
    expect(view.lines.map((line) => line.className)).toEqual([
      'everyday-board-note',
      'everyday-board-modifiers-standard',
      'everyday-board-house-note',
    ]);
    expect(view.lines[2]?.text).toBe(BOARD_SCREEN_COPY.dailyHouseNote);
    /* Nobody played these, and the note may not read as a ranking of dispatchers. */
    expect(BOARD_SCREEN_COPY.dailyHouseNote).toMatch(/Nobody played them/u);
    expect(BOARD_SCREEN_COPY.dailyHouseNote).toMatch(/do not rank the dispatchers/u);
  });

  it('never treats a house row as the player’s own, even under the player’s name, and draws no gap on it', () => {
    const named = { ...board, rows: [{ ...house(19.8, 'collective'), displayName: 'Ada' }, entry('Ada', 21.4)] };
    const view = dailyBoardViewOf(named, 'Ada', (id) => id);
    expect(view.rows[0]?.watch).toBe('watch');
    expect(view.rows[0]?.gap).toBe('');
    expect(view.rows[1]?.watch).toBe('yours');
  });

  it('draws no house note on a board with no house row', () => {
    const view = dailyBoardViewOf({ ...board, rows: [entry('Ada', 21.4)] }, undefined, (id) => id);
    expect(view.lines.map((line) => line.className)).toEqual([
      'everyday-board-note',
      // Issue #371's, and it is not the house's: a board of standard runs says which board it is.
      'everyday-board-modifiers-standard',
    ]);
    expect(view.rows[0]?.house).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The modifiers a row was played with — GitHub issue #371, § D526 clause 3
 * -------------------------------------------------------------------------- */

/** `entry`, plus what the run was played with. `undefined` is a standard run. */
function played(
  displayName: string,
  awtS: number,
  modifiers: readonly { readonly sinkId: string; readonly steps: number; readonly name: string }[],
): BoardEntry {
  return { ...entry(displayName, awtS), modifiers };
}

const PURSE = Object.freeze([
  { sinkId: 'rush-purse-top-up', steps: 2, name: 'Start with a bigger purse' },
]);
const PREFIT = Object.freeze([
  { sinkId: 'rush-prefit', steps: 1, name: 'Start with the building fitted' },
]);

function boardOf(rows: readonly BoardEntry[]): Parameters<typeof dailyBoardViewOf>[0] {
  return {
    kind: 'board',
    date: '2026-09-20',
    note: 'Ranked on the named metric alone.',
    distribution: undefined,
    distributionDetail: undefined,
    rows,
  };
}

/**
 * Every string a board view draws, in one list, so a guard can ask about all of them.
 *
 * The lines, the world block **and** every field of every row — a check that walked only the rows
 * would miss a note, and a check that walked only the notes would miss the thing this issue puts on
 * a row.
 */
function everyStringIn(view: ReturnType<typeof dailyBoardViewOf>): readonly string[] {
  return [
    ...view.lines.map((line) => line.text),
    ...view.world.map((line) => line.text),
    ...view.rows.flatMap((row) => [
      row.place,
      row.displayName,
      row.driver,
      row.gap,
      row.figure,
      row.house ?? '',
      row.count ?? '',
      row.modifiers,
    ]),
  ].filter((text) => text !== '');
}

/**
 * A digit standing next to a currency word — **the shape § D526 clause 3 forbids on a board**.
 *
 * Deliberately not a search for the *word*: a board is allowed to say *chimes* if it ever needs to
 * explain what it is not showing, and what clause 3 forbids is *a currency figure*. So the pattern
 * is a number within a short reach of the word, in either order, which is what a reader would
 * actually do arithmetic on.
 */
const CURRENCY_FIGURE = /\d[^.]{0,24}?(chime|credit)|(chime|credit)[^.]{0,24}?\d/iu;

describe('a row says what it was played with and never what it cost — issue #371', () => {
  it('catches the figure a row drawing its price would carry — the positive control', () => {
    /*
     * **The control is the defect's real shape.** The tempting row is *"Start with a bigger purse
     * ×2 · 16 chimes"* — the modifier and what it cost, side by side, because that is the sentence
     * a designer would write and because the price is on `ChimeSink` right beside the name. The
     * guard is shown catching it, and catching the plainer *"Bought for 16 chimes"* too, before it
     * is trusted to report that the shipped view carries neither.
     */
    expect(CURRENCY_FIGURE.test('Start with a bigger purse ×2 · 16 chimes')).toBe(true);
    expect(CURRENCY_FIGURE.test('Bought for 16 chimes.')).toBe(true);
    expect(CURRENCY_FIGURE.test('8 credits spent')).toBe(true);
    /* And the strings a board legitimately draws are not caught with them. */
    expect(CURRENCY_FIGURE.test('Start with a bigger purse ×2')).toBe(false);
    expect(CURRENCY_FIGURE.test('over 312 rides')).toBe(false);
    expect(CURRENCY_FIGURE.test('21.4 s')).toBe(false);
  });

  it('draws nothing at all on a standard run, which is the empty set rather than a withholding', () => {
    const view = dailyBoardViewOf(boardOf([entry('A. Turing', 21.4), entry('G. Hopper', 29.5)]));
    expect(view.rows.map((row) => row.modifiers)).toEqual(['', '']);
    expect(view.rows.every((row) => row.figure !== BOARD_SCREEN_COPY.dailyRowWithheld)).toBe(true);
    // The board says which board it is, and on the standard one that sentence is the standard one.
    expect(view.lines.map((line) => line.text)).toContain(BOARD_SCREEN_COPY.dailyStandardBoardNote);
  });

  it('names the modifier and its step count on every row of a modifier set’s board', () => {
    const view = dailyBoardViewOf(boardOf([played('A. Turing', 21.4, PURSE), played('G. Hopper', 29.5, PURSE)]));
    expect(view.rows.map((row) => row.modifiers)).toEqual([
      'Start with a bigger purse ×2',
      'Start with a bigger purse ×2',
    ]);
    expect(view.lines.map((line) => line.text)).toContain(BOARD_SCREEN_COPY.dailyModifierSetNote);
    expect(view.lines.map((line) => line.text)).not.toContain(BOARD_SCREEN_COPY.dailyStandardBoardNote);
  });

  it('drops the ×1, because one step of a modifier is just the modifier', () => {
    const view = dailyBoardViewOf(boardOf([played('A. Turing', 21.4, PREFIT)]));
    expect(view.rows[0]?.modifiers).toBe('Start with the building fitted');
  });

  it('falls back to the sink id for a modifier this build was not told the name of', () => {
    // A build reading a server that ships a sink it does not know. The `driver` column does exactly
    // this for a dispatcher, and for the same reason: an id is worse than a name and much better
    // than a blank where a fact should be.
    const view = dailyBoardViewOf(
      boardOf([played('A. Turing', 21.4, [{ sinkId: 'some-new-sink', steps: 1, name: '' }])]),
    );
    expect(view.rows[0]?.modifiers).toBe('some-new-sink');
  });

  it('says so when the rows do not agree about their set — the mixed-population control', () => {
    /*
     * **The state a board keyed by its modifier set cannot produce, driven as the regression it
     * would be.** If the key stopped carrying the axis, one board would hold a purse run and a
     * standard run and the column would sort across two populations — a ranking of starting
     * conditions presented as a ranking of players.
     *
     * The mixture here is exactly what that build would serve, and the view must say so rather
     * than draw the standard sentence over it or say nothing. Both the wrong outcomes are asserted
     * against, because *"nothing said"* is the one this would actually have shipped as.
     */
    const view = dailyBoardViewOf(boardOf([played('A. Turing', 21.4, PURSE), entry('G. Hopper', 29.5)]));
    const lines = view.lines.map((line) => line.text);
    expect(lines).toContain(BOARD_SCREEN_COPY.dailyMixedNote);
    expect(lines).not.toContain(BOARD_SCREEN_COPY.dailyStandardBoardNote);
    expect(lines).not.toContain(BOARD_SCREEN_COPY.dailyModifierSetNote);
    // And each row still says what it was played with, which is what makes the note actionable.
    expect(view.rows.map((row) => row.modifiers)).toEqual(['Start with a bigger purse ×2', '']);
  });

  it('says nothing about a set on a board nobody has posted to', () => {
    // A board with no rows has no set to be about, and inventing the standard sentence there would
    // be a claim about a population that does not exist — the daily tab's own rule about *nobody
    // has posted* versus *we could not ask*, one axis along.
    const lines = dailyBoardViewOf(boardOf([])).lines.map((line) => line.text);
    expect(lines).not.toContain(BOARD_SCREEN_COPY.dailyStandardBoardNote);
    expect(lines).not.toContain(BOARD_SCREEN_COPY.dailyModifierSetNote);
    expect(lines).toContain(BOARD_SCREEN_COPY.dailyEmpty);
  });

  it('carries no currency figure on any row or note of any board state', () => {
    /*
     * The criterion — *no row anywhere carries a credits figure* — asked of every string the view
     * draws, in every state that can carry a modifier, rather than of the one field that holds one.
     * A price that leaked into the board note would satisfy a row-only check.
     */
    for (const rows of [
      [entry('A. Turing', 21.4)],
      [played('A. Turing', 21.4, PURSE), played('G. Hopper', 29.5, PURSE)],
      [played('A. Turing', 21.4, [...PREFIT, ...PURSE])],
      [played('A. Turing', 21.4, PURSE), entry('G. Hopper', 29.5)],
      [],
    ]) {
      for (const text of everyStringIn(dailyBoardViewOf(boardOf(rows)))) {
        expect(CURRENCY_FIGURE.test(text), text).toBe(false);
      }
    }
    /* And the screen's own copy table, which is where a price would be written by hand. */
    for (const [key, text] of Object.entries(BOARD_SCREEN_COPY)) {
      expect(CURRENCY_FIGURE.test(text), `${key}: ${text}`).toBe(false);
    }
  });
});
