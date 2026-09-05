/**
 * **The mailed link's outcome, as a value** — GitHub issue #336's pure half.
 *
 * The browser tier owns the claim this issue is actually about — *which surface the outcome lands
 * on* — because that is a fact about two shells and a cover, and no node test has either. What this
 * file owns is everything the tier cannot reach with the artifact it serves: the artifact carries no
 * `<meta name="elevator-sim-api">` (`packages/viz/index.html` forbids one in terms), so a **session**
 * never exists there and the `signed-in` arm is unreachable in a browser without inventing a server.
 * Here it is a value.
 *
 * `signInLink.browser.test.ts` is the other half and neither stands in for the other.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  SIGN_IN_NOTICE_DISMISS,
  SIGN_IN_NOTICE_LABEL,
  SIGN_IN_NOTICE_POINTER,
  onSignInLinkReport,
  reportSignInLink,
  signInLinkReport,
  signInNoticeViewOf,
} from './signInLink.js';

/*
 * Module state, so every case puts it back. A report left standing would leak into the next case as
 * a banner nobody published — which is the same class of defect as the one this module fixes.
 */
afterEach(() => {
  reportSignInLink(undefined);
});

describe('what the shell is told', () => {
  it('has nothing to say until a link is redeemed', () => {
    expect(signInLinkReport()).toBeUndefined();
    expect(signInNoticeViewOf(undefined)).toBeUndefined();
  });

  it('carries the outcome sentence verbatim, whoever produced it', () => {
    const serverRefusal = 'That sign-in link has expired. Ask for a new one — they are good for a few minutes.';
    reportSignInLink({ stage: 'refused', text: serverRefusal });
    expect(signInNoticeViewOf(signInLinkReport())?.text).toBe(serverRefusal);
  });

  it('replaces rather than accumulates, because a second answer is not an addition', () => {
    reportSignInLink({ stage: 'working', text: 'Signing you in…' });
    reportSignInLink({ stage: 'signed-in', text: 'Signed in as Ada Lovelace.' });
    expect(signInLinkReport()).toEqual({ stage: 'signed-in', text: 'Signed in as Ada Lovelace.' });
  });

  it('is withdrawn by `undefined`, which is what the banner’s own Dismiss presses', () => {
    reportSignInLink({ stage: 'signed-in', text: 'Signed in as Ada Lovelace.' });
    reportSignInLink(undefined);
    expect(signInLinkReport()).toBeUndefined();
  });
});

describe('who hears about it', () => {
  it('notifies on arrival, on replacement and on withdrawal', () => {
    const heard: (string | undefined)[] = [];
    const stop = onSignInLinkReport(() => {
      heard.push(signInLinkReport()?.stage);
    });
    reportSignInLink({ stage: 'working', text: 'Signing you in…' });
    reportSignInLink({ stage: 'signed-in', text: 'Signed in as Ada Lovelace.' });
    reportSignInLink(undefined);
    stop();
    expect(heard).toEqual(['working', 'signed-in', undefined]);
  });

  it('stops when the unsubscribe is called — a torn-down shell hears nothing', () => {
    let heard = 0;
    const stop = onSignInLinkReport(() => {
      heard += 1;
    });
    reportSignInLink({ stage: 'refused', text: 'no' });
    stop();
    reportSignInLink({ stage: 'refused', text: 'still no' });
    expect(heard).toBe(1);
  });

  /*
   * The snapshot in {@link reportSignInLink} is what this asserts, and it is `everyday/swap.ts`'s
   * own rule: a listener that unsubscribes mid-notification must not make the set skip a neighbour.
   */
  it('does not skip a neighbour when one listener unsubscribes mid-notification', () => {
    let second = 0;
    const stopFirst = onSignInLinkReport(() => {
      stopFirst();
    });
    const stopSecond = onSignInLinkReport(() => {
      second += 1;
    });
    reportSignInLink({ stage: 'refused', text: 'no' });
    stopSecond();
    expect(second).toBe(1);
  });
});

describe('the banner, as a value', () => {
  it('says what it is about before it says what happened', () => {
    const view = signInNoticeViewOf({ stage: 'signed-in', text: 'Signed in as Ada Lovelace.' });
    expect(view?.label).toBe(SIGN_IN_NOTICE_LABEL);
    expect(view?.text).toBe('Signed in as Ada Lovelace.');
  });

  /*
   * Both settled arms need it, for different reasons: a refused link is asked for again from the
   * account screen, and a session that exists is named from it. Asserted on both so a later
   * narrowing to one has to be deliberate.
   */
  it.each(['signed-in', 'refused'] as const)(
    'points a %s outcome at the screen accounts live on',
    (stage) => {
      const view = signInNoticeViewOf({ stage, text: 'whatever the outcome was' });
      expect(view?.pointer).toBe(SIGN_IN_NOTICE_POINTER);
      expect(view?.dismiss).toBe(SIGN_IN_NOTICE_DISMISS);
    },
  );

  it('offers neither a route nor a dismissal while the request is still in flight', () => {
    const view = signInNoticeViewOf({ stage: 'working', text: 'Signing you in…' });
    expect(view?.text).toBe('Signing you in…');
    expect(view?.pointer).toBeUndefined();
    expect(view?.dismiss).toBeUndefined();
  });

  /**
   * The pointer names a route, and every step of it has to exist.
   *
   * `everyday/shell.ts` draws the swap row at the foot of the rail; `dev/main.ts#dispatchMenu`'s
   * `reopen` arm navigates to `main`; `menu/screens.ts` puts `main.account` on that screen labelled
   * *Account*. The sentence is checked against the last of those three here rather than being
   * trusted, because a route sentence that has gone stale is § D227's more dangerous half — it tells
   * a player to press something that is not there.
   */
  it('names a row the Engineer main menu actually carries', async () => {
    const { MENU_SCREENS } = await import('../menu/types.js');
    expect(SIGN_IN_NOTICE_POINTER).toContain('Switch to Engineer');
    expect(SIGN_IN_NOTICE_POINTER).toContain('Account');
    expect(MENU_SCREENS).toContain('account');
  });
});

/**
 * **The two acceptance clauses no tier here can drive** — issue #336's third and fourth.
 *
 * Read as source, which is weak evidence and is the only evidence available: `redeemLinkFromHash`
 * lives inside `dev/main.ts`'s `boot()`, which needs a document, a canvas and a mailed token, and
 * the shipped page never reaches the state clause 3 is about — `everyday/boot.ts` mounts the shell
 * before that boot finishes, so **the Engineer surface never holds the page at redemption on the
 * artifact this repository ships.** The one build where it does is `dev/main.ts` loaded alone, which
 * has no HTML entry point, so the browser tier cannot serve it.
 *
 * `dev/main.progression.test.ts` is the precedent for reading this file as a string, and it states
 * the limitation the same way: this is strong evidence about a line having been written and no
 * evidence at all about what the product does.
 */
describe('what only the source can say — issue #336’s clauses 3 and 4', () => {
  /** `redeemLinkFromHash`'s own body, from its declaration to the closing brace at its indent. */
  async function redemptionSource(): Promise<string> {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      fileURLToPath(new URL('../dev/main.ts', import.meta.url)),
      'utf8',
    );
    const from = source.indexOf('async function redeemLinkFromHash()');
    expect(from, '`redeemLinkFromHash` is not in `dev/main.ts` under that name').toBeGreaterThan(0);
    const to = source.indexOf('\n  }\n', from);
    expect(to, 'the redemption’s closing brace was not found at its own indent').toBeGreaterThan(
      from,
    );
    return source.slice(from, to);
  }

  /*
   * Clause 3 — *a link opened while the Engineer surface holds the page behaves exactly as it does
   * today*. What makes that true is that every line this fix added is inside a gate, so the arm
   * where the Engineer surface has the page runs the code it always ran. Asserted as *no unguarded
   * publish and no unguarded suppression* rather than by quoting the function, so a rewrite that
   * keeps the property passes.
   */
  it('publishes to the other world only where the other world has the page', async () => {
    const body = await redemptionSource();
    expect(body).toContain('!engineerHasThePage()');
    /*
     * Looking **back** rather than at the line, because the settled publish spans four lines inside
     * its gate and a per-line rule reported it as ungated. The window is the text since the previous
     * statement-ending `;`, which is where a guard on this call would have to be.
     */
    const publishes = [...body.matchAll(/reportSignInLink\(/gu)];
    expect(publishes.length, 'nothing publishes the outcome at all').toBeGreaterThan(0);
    for (const publish of publishes) {
      const at = publish.index;
      const since = body.lastIndexOf(';', at);
      expect(
        body.slice(since + 1, at).includes('everydayHasThePage'),
        `this publish is not gated on who has the page: ${body.slice(since + 1, at + 40).trim()}`,
      ).toBe(true);
    }
    expect(
      body.includes("if (!everydayHasThePage) menuState = navigate(menuState, 'account')"),
      'the Engineer menu navigation is no longer gated, so it either runs under the cover again ' +
        '(where `reopen` discards it and `closeEngineerMenuWhenReady` is left holding an open ' +
        'overlay) or has stopped running where it belongs',
    ).toBe(true);
  });

  /*
   * Clause 4 — the fragment is cleared **before** the request, and the reason is unchanged: a
   * reload during a 28.7-second cold start must not re-send a token the first attempt is spending.
   * The browser tier asserts the fragment ends up empty; only this can assert the *ordering*, which
   * is the half the reason is about.
   */
  it('clears the fragment before anything is awaited', async () => {
    const body = await redemptionSource();
    const cleared = body.indexOf('window.history.replaceState(');
    const awaited = body.indexOf('await client.redeem(');
    expect(cleared, 'the fragment is never cleared').toBeGreaterThan(0);
    expect(awaited, 'the redemption never reaches the client').toBeGreaterThan(0);
    expect(
      cleared,
      'the fragment is cleared after the request rather than before it — a reload during a cold ' +
        'start would re-send a token the first attempt is spending, and the second attempt would ' +
        'come back `link-spent` to an honest player',
    ).toBeLessThan(awaited);
  });
});
