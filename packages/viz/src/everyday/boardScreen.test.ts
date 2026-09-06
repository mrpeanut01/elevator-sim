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
    expect(view.rows).toEqual([
      { id: 'row-Ada', watch: 'watch', place: '1', displayName: 'Ada', driver: 'eta', gap: '', figure: '21.4 s', count: 'over 312 rides' },
      { id: 'row-Grace', watch: 'watch', place: '2', displayName: 'Grace', driver: 'eta', gap: '', figure: '29.5 s', count: 'over 312 rides' },
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
