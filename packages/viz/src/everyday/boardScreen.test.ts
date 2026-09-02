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
      { kind: 'board', date: '2026-09-02', note: 'n', rows: [] },
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
      rows: [],
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
      rows: [entry('Ada', 21.44), entry('Grace', 29.5)],
    });
    expect(view.rows).toEqual([
      { place: '1', displayName: 'Ada', figure: '21.4 s', count: 'over 312 rides' },
      { place: '2', displayName: 'Grace', figure: '29.5 s', count: 'over 312 rides' },
    ]);
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
      rows: [entry('Ada', 21.4, null)],
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
      rows: [entry('Ada', 21.4), entry('Grace', 29.5, null), entry('Kay', 33.1, 88)],
    });
    expect(view.rows.map((row) => row.count)).toEqual([
      'over 312 rides',
      undefined,
      'over 88 rides',
    ]);
    expect(view.rows.map((row) => row.figure)).toEqual(['21.4 s', 'no count', '33.1 s']);
  });

  it('does not draw dataHash as though it were a score', () => {
    const view = dailyBoardViewOf({
      kind: 'board',
      date: '2026-09-02',
      note: 'note',
      rows: [entry('Ada', 21.4)],
    });
    const drawn = [
      ...view.lines.map((line) => line.text),
      ...view.rows.map((row) => `${row.figure} ${row.count ?? ''}`),
    ];
    expect(drawn.join(' ')).not.toContain('hash');
  });
});
