/**
 * The post block's seven states, and the two properties that make it worth having.
 *
 * Pure over {@link postRunViewOf}, so every state is driven without a document — which is the split
 * `everyday/boardScreen.test.ts` already makes for the read half and the reason the view function
 * exists at all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { POST_RUN_NO_SERVER, type EverydayPostOutcome } from './host.js';
import { POST_RUN_COPY, placementLineOf, postRunViewOf } from './postRun.js';

const READY = {
  hasRun: true,
  hasServer: true,
  signedIn: true,
  posting: false,
  outcome: undefined,
} as const;

const textOf = (view: { readonly lines: readonly { readonly text: string }[] }): string =>
  view.lines.map((line) => line.text).join(' ');

describe('everyday/postRun.ts — what the post block says', () => {
  it('offers the press with a run, a server and an account', () => {
    const view = postRunViewOf(READY);
    expect(view.pressable).toBe(true);
    expect(view.label).toBe(POST_RUN_COPY.button);
    expect(textOf(view)).toBe(POST_RUN_COPY.note);
  });

  it('says there is nowhere to post before it says anything else, and does not offer the press', () => {
    const view = postRunViewOf({ ...READY, hasServer: false, hasRun: false, signedIn: false });
    expect(view.pressable).toBe(false);
    // The build's property first: a player with no run and no account on a server-less build is not
    // owed three sentences, and the one they get is the only one they can act on.
    expect(textOf(view)).toBe(POST_RUN_NO_SERVER);
  });

  it('names the missing run rather than greying the button in silence', () => {
    const view = postRunViewOf({ ...READY, hasRun: false });
    expect(view.pressable).toBe(false);
    expect(textOf(view)).toContain('no finished run');
  });

  it('says what signing in takes before the press, and still offers it', () => {
    const view = postRunViewOf({ ...READY, signedIn: false });
    // Live rather than greyed — § D456's *say what to do rather than greying a control*. The press
    // produces the same sentence again from `postCurrentRun`, which is the backstop.
    expect(view.pressable).toBe(true);
    expect(textOf(view)).toContain('Sign in to post this run');
    expect(textOf(view)).toContain('no password');
  });

  it('draws no absence while a press is in flight', () => {
    const view = postRunViewOf({ ...READY, hasRun: false, signedIn: false, posting: true });
    expect(view.label).toBe(POST_RUN_COPY.posting);
    expect(view.pressable).toBe(false);
    // The in-flight state outranks every known-before-the-press answer: a block that swapped to
    // *there is no run* mid-request would publish an absence about a request that is still running.
    expect(textOf(view)).toBe(POST_RUN_COPY.note);
  });
});

describe('everyday/postRun.ts — a refusal is carried, never paraphrased', () => {
  /**
   * The load-bearing property of the whole block: whatever the outcome says is what the player
   * reads. A screen that summarised a refusal would be inventing a reason, and the one refusal this
   * product spends is an accusation — `menu/client.ts`'s own argument about `refusalDetail`.
   */
  const carried: readonly Extract<EverydayPostOutcome, { readonly detail: string }>[] = [
    { kind: 'no-server', detail: 'a sentence about the build' },
    { kind: 'signed-out', detail: 'a sentence about the player' },
    { kind: 'refused', detail: 'a sentence about the run' },
    { kind: 'failed', detail: 'a sentence about the server' },
  ];

  for (const outcome of carried) {
    it(`draws the ${outcome.kind} detail verbatim`, () => {
      const view = postRunViewOf({ ...READY, outcome });
      expect(view.lines.some((line) => line.text === outcome.detail)).toBe(true);
    });
  }

  it('leaves the press live on everything but a build with no server', () => {
    for (const outcome of carried) {
      expect(postRunViewOf({ ...READY, outcome }).pressable).toBe(outcome.kind !== 'no-server');
    }
  });

  it('says nothing was sent when this shell was the one that refused', () => {
    const view = postRunViewOf({ ...READY, outcome: { kind: 'refused', detail: 'no.' } });
    // The distinction `refused` and `failed` exist to keep: a player told *the server refused this*
    // about a request that never happened has been told something false about a machine they cannot
    // inspect. Only the shell's own refusal carries this line.
    expect(textOf(view)).toContain('nothing was sent');
    expect(textOf(postRunViewOf({ ...READY, outcome: { kind: 'failed', detail: 'no.' } }))).not.toContain(
      'nothing was sent',
    );
  });
});

describe('everyday/postRun.ts — where the run landed is the server’s answer', () => {
  /*
   * **The token the server actually sends, not a sentence.** This fixture used to carry
   * `placement: 'Your own record log, because this run is not today's fixture.'` — prose nobody
   * ships. `http/api.ts` answers `{ placement: placement.kind }` and `kind` is `'daily' |
   * 'personal'`, so the fixture encoded the same misunderstanding as the code it was checking, and
   * the product printed *"The server put it here: personal"* under a green suite.
   *
   * The parity check below is what stops that recurring: it reads the server's own source for the
   * token set rather than trusting this literal.
   */
  const posted: EverydayPostOutcome = { kind: 'posted', placement: 'personal' };

  it('turns each placement token into words, and never prints the token', () => {
    for (const [token, expected] of [
      ['daily', POST_RUN_COPY.postedDaily],
      ['personal', POST_RUN_COPY.postedPersonal],
      // A server ahead of this client, and the empty string `menu/client.ts` yields for an omitted
      // field. Both get the honest arm rather than a lede with nothing after it.
      ['seasonal', POST_RUN_COPY.postedUnknownBoard],
      ['', POST_RUN_COPY.postedUnknownBoard],
    ] as const) {
      const text = textOf(postRunViewOf({ ...READY, outcome: { kind: 'posted', placement: token } }));
      expect(text, `placement '${token}'`).toContain(expected);
      /*
       * The token itself is never on screen. Written as a **word-boundary** match rather than
       * `not.toContain(token)`, because `postedDaily` legitimately contains the word *day* — the
       * assertion has to refuse the bare wire word without refusing English.
       */
      if (token.length > 0) {
        expect(text, `placement '${token}' leaked`).not.toMatch(new RegExp(`(^|[\\s:])${token}([\\s.,]|$)`));
      }
    }
  });

  it('renders no board key, because it is not carried and was never parsed', () => {
    /*
     * GitHub issue #331 is the record of what happens when a client decides which board a run went
     * to: `placeSubmission` answers `daily:<date>` only for the day's exact fixture, so a shell
     * announcing *today's board* on its own reckoning would be wrong for most runs a player plays.
     * The key is no longer even on `EverydayPostOutcome` — see `everyday/host.ts` — so this is now
     * a check that the deletion held rather than a check on a rendering decision.
     */
    const view = postRunViewOf({ ...READY, outcome: posted });
    expect(textOf(view)).not.toContain('personal:');
    expect(textOf(view)).not.toContain('daily:');
  });

  it('has a sentence for every placement kind the server can send', () => {
    /*
     * The server's own source, on `menu/challenge.test.ts`'s method: the arms of
     * `BoardPlacement` in `leaderboard/boardKey.ts`. A client that grows a third board and forgets
     * the sentence draws `postedUnknownBoard` in production and passes every fixture here, so the
     * set has to come from the file that defines it.
     */
    const boardKeySource = readFileSync(
      fileURLToPath(new URL('../../../server/src/leaderboard/boardKey.ts', import.meta.url)),
      'utf8',
    );
    const union = /export type BoardPlacement =([\s\S]*?)\n\n/.exec(boardKeySource);
    expect(union, 'BoardPlacement not found in the server source — the check has gone stale').not.toBeNull();
    const kinds = [...(union?.[1] ?? '').matchAll(/readonly kind: '([a-z-]+)'/g)].map((m) => m[1] ?? '');

    expect(kinds).toEqual(['daily', 'personal']);
    for (const kind of kinds) {
      expect(placementLineOf(kind), `no sentence for '${kind}'`).not.toBe(POST_RUN_COPY.postedUnknownBoard);
    }
  });

  it('says the server replayed the seed, and says it on no other state', () => {
    expect(textOf(postRunViewOf({ ...READY, outcome: posted }))).toContain('replayed your seed');
    for (const outcome of [
      { kind: 'failed', detail: 'no.' },
      { kind: 'refused', detail: 'no.' },
    ] as const) {
      expect(textOf(postRunViewOf({ ...READY, outcome }))).not.toContain('replayed your seed');
    }
  });

  it('leaves the press live after a success, because a duplicate is the server’s question', () => {
    expect(postRunViewOf({ ...READY, outcome: posted }).pressable).toBe(true);
  });
});
