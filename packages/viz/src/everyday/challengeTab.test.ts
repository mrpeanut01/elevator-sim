/**
 * The challenge tab's five states, driven without a document — GitHub issue #221's third criterion.
 *
 * `boardScreen.test.ts`'s file for the tab beside it, and the case worth reading first is the same
 * one: *nobody has posted* and *we could not ask* must not share a sentence. The third state this
 * read has that the daily board does not is `index-only` — the challenge came back and its ranking
 * did not — and it exists because that is what an **upcoming** challenge looks like from here, and
 * a reader who can see the challenge's name being told it could not be read has been lied to.
 *
 * The other half of this file is the honesty obligations the wire carries: `note`, `compare`, the
 * other-data count and each row's two counts. `menu/challenge.ts` says why they travel in the body
 * rather than being remembered by a client — *"a renderer that drops `note` or `compare` is free to
 * draw a composite with nothing on screen saying it should not"* — so a test that the renderer does
 * not drop them is the enforcement of that sentence.
 */
import { describe, expect, it } from 'vitest';

import type { ChallengeBoardPage, ChallengeView } from '../menu/challenge.js';

import { BOARD_SCREEN_COPY, challengeTabViewOf } from './boardScreen.js';
import type { EverydayChallengeToday } from './host.js';

const CHALLENGE: ChallengeView = {
  challenge: {
    id: 'challenge-7',
    name: 'The Monday climb',
    brief: 'Midtown Office, up-peak, eight seeds.',
    config: {
      buildingId: 'midtown-office',
      demandTemplateId: 'up-peak',
      arrivalRatePctPop5min: 4,
      durationS: 900,
    },
    seeds: ['1', '2', '3'],
    opensAtMs: 0,
    closesAtMs: 10,
  },
  state: 'open',
  seedCount: 3,
  opensInMs: null,
  closesInMs: 5,
  clockNote: 'This challenge shuts in about an hour, on the server’s clock.',
  dataHash: 'hash',
  compare: {
    note: 'Compare is the only screen that may say one dispatcher beats another.',
    buildingId: 'midtown-office',
    demandTemplateId: 'up-peak',
    arrivalRatePctPop5min: 4,
    durationS: 900,
  },
};

function board(overrides: Partial<ChallengeBoardPage> = {}): ChallengeBoardPage {
  return {
    challengeId: CHALLENGE.challenge.id,
    challenge: CHALLENGE.challenge,
    state: 'open',
    dataHash: 'hash',
    metric: 'meanAwtS',
    seedCount: 3,
    note: 'This order is a fact about what was posted, not a ranking of dispatchers.',
    compare: CHALLENGE.compare,
    entries: [],
    entriesOnOtherData: 0,
    ...overrides,
  };
}

function row(displayName: string, dispatcherProfileId: string, meanAwtS: number): ChallengeBoardPage['entries'][number] {
  return {
    id: `row-${displayName}`,
    displayName,
    dispatcherProfileId,
    score: {
      runs: 3,
      legs: 1234,
      meanAwtS,
      meanWt95S: meanAwtS * 2,
      meanTtdMeanS: meanAwtS * 3,
      meanPctOverLongWait: 1.5,
      perSeed: [],
    },
    submittedAtMs: 0,
  };
}

const textOf = (view: { readonly lines: readonly { readonly text: string }[]; readonly footnotes: readonly { readonly text: string }[] }): string =>
  [...view.lines, ...view.footnotes].map((line) => line.text).join(' ');

describe('the challenge tab', () => {
  it('says it is asking while the read is in flight, and draws no absence', () => {
    const view = challengeTabViewOf(undefined);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.text).toBe(BOARD_SCREEN_COPY.challengeAsking);
    expect(view.rows).toEqual([]);
    // The five-state rule's whole point: an absence drawn here would publish *nobody has posted* for
    // as long as the network takes.
    expect(textOf(view)).not.toContain('Nobody has posted');
  });

  it('says this build has no server, and says what a challenge is', () => {
    const view = challengeTabViewOf({ kind: 'no-server' });
    expect(view.lines[0]?.text).toBe(BOARD_SCREEN_COPY.challengeAbsence);
    expect(textOf(view)).toContain('needs a server');
  });

  it('keeps “could not ask” and “nobody has posted” apart', () => {
    const unreachable = challengeTabViewOf({ kind: 'unreachable', detail: 'The server did not answer.' });
    expect(textOf(unreachable)).toContain(BOARD_SCREEN_COPY.challengeUnreachable);
    // The client's own sentence, carried rather than paraphrased.
    expect(textOf(unreachable)).toContain('The server did not answer.');
    expect(textOf(unreachable)).not.toContain(BOARD_SCREEN_COPY.challengeEmpty);

    const empty = challengeTabViewOf({ kind: 'board', challenge: CHALLENGE, board: board() });
    expect(textOf(empty)).toContain(BOARD_SCREEN_COPY.challengeEmpty);
    expect(textOf(empty)).not.toContain(BOARD_SCREEN_COPY.challengeUnreachable);
  });

  it('draws the challenge when only its ranking failed, and says which half is missing', () => {
    const view = challengeTabViewOf({
      kind: 'index-only',
      challenge: CHALLENGE,
      detail: 'This challenge has not opened yet.',
    });
    expect(view.heading).toBe('The Monday climb');
    expect(textOf(view)).toContain('Midtown Office, up-peak, eight seeds.');
    expect(textOf(view)).toContain('This challenge has not opened yet.');
    // *the ranking*, never *the challenge* — the challenge is on screen above the sentence.
    expect(textOf(view)).toContain(BOARD_SCREEN_COPY.challengeNoBoard);
    expect(view.rows).toEqual([]);
  });
});

describe('the challenge tab — the wire’s honesty obligations reach the screen', () => {
  const posted: EverydayChallengeToday = {
    kind: 'board',
    challenge: CHALLENGE,
    board: board({ entries: [row('Ada', 'eta', 18.25), row('Bo', 'collective', 21.4)] }),
  };

  it('carries the server’s note and Compare’s pointer, unparaphrased', () => {
    const view = challengeTabViewOf(posted);
    // § D218 § 5 clauses 2 and 5. Both are in `footnotes`, under the rows, so a reader meets the
    // ordering and its caveat in that order.
    expect(view.footnotes.map((line) => line.text)).toContain(board().note);
    expect(view.footnotes.map((line) => line.text)).toContain(CHALLENGE.compare.note);
  });

  it('gives every row both counts, in the row’s own box', () => {
    const view = challengeTabViewOf(posted);
    expect(view.rows).toHaveLength(2);
    for (const entry of view.rows) {
      // R13 clause one, on a surface where a number is a boast. `estimate-without-n` is the property
      // that would find this, and the fix for the Day report (#137) is the precedent.
      expect(entry.count).toContain('3 runs');
      expect(entry.count).toContain('1,234 rides');
      expect(entry.figure).toMatch(/^\d+\.\d s$/u);
    }
  });

  it('names the dispatcher, falling back to the id this build does not ship', () => {
    const view = challengeTabViewOf(posted, (id) => (id === 'eta' ? 'Shortest wait' : undefined));
    expect(view.rows[0]?.driver).toBe('Shortest wait');
    // An id where a name would be is the honest answer for a profile this build no longer carries —
    // `everyday/host.ts#watchRun`'s own argument against a total lookup that returns the first
    // shipped profile.
    expect(view.rows[1]?.driver).toBe('collective');
  });

  it('draws the other-data count with the server’s sentence, and only when there is one', () => {
    const withOther = challengeTabViewOf({
      ...posted,
      board: board({
        entries: [row('Ada', 'eta', 18.25)],
        entriesOnOtherData: 4,
        otherDataNote: 'Four entries were set before the reference data changed.',
      }),
    });
    expect(textOf(withOther)).toContain('Four entries were set before the reference data changed.');
    expect(textOf(challengeTabViewOf(posted))).not.toContain('before the reference data changed');
  });

  it('says posting a set is not on this surface rather than leaving it to be discovered', () => {
    // `docs/16` S9's rule about a control that writes nothing, applied to a control that does not
    // exist: the absence is stated on the tab.
    expect(textOf(challengeTabViewOf(posted))).toContain(BOARD_SCREEN_COPY.challengeCannotPost);
  });

  it('adds no ordering, interval or fold of its own', () => {
    const view = challengeTabViewOf(posted);
    // The rows are the server's, in the server's order. `perSeed` is never read here — five runs
    // cannot support an inference and a `[min, max]` beside a mean is read as one.
    expect(view.rows.map((entry) => entry.displayName)).toEqual(['Ada', 'Bo']);
    expect(textOf(view)).not.toContain('±');
    expect(textOf(view)).not.toContain('better');
  });
});
