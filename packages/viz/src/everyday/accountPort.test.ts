/**
 * **The channel, and the one claim it makes that a reviewer has to be able to check** — GitHub
 * issue #332.
 *
 * The claim is that {@link publishEverydayAccount} can be called from `dev/main.ts#drawMenu` —
 * every menu draw, not only every account write — without becoming the redraw storm GitHub issue
 * #106 documents, because it publishes nothing when the state is the same object and
 * `menu/account.ts` returns the same object for a commit that changes nothing.
 *
 * That is an argument about **two** modules, so it is driven over both rather than asserted about
 * one: every state below is built with the shipped reducers, and the counting is what a subscriber
 * would have felt.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SIGNED_OUT,
  pending,
  signedIn,
  signedOut,
  updateForm,
  waitEnded,
  withNotice,
} from '../menu/account.js';

import type { AccountState } from '../menu/account.js';

import { everydayAccount, onEverydayAccount, publishEverydayAccount } from './accountPort.js';
import { settingsScreenViewOf, type SettingsScreenView } from './settingsView.js';

/* Module state. Withdrawn after each case so an order dependence cannot hide here. */
afterEach(() => {
  publishEverydayAccount(undefined);
});

describe('the account channel — GitHub issue #332', () => {
  it('answers `undefined` until the Engineer surface has published one', () => {
    expect(everydayAccount()).toBeUndefined();
  });

  it('carries the state itself, so the two shells render one machine rather than two', () => {
    const signedInState = signedIn(SIGNED_OUT, 'session-token', {
      id: 'u1',
      email: 'someone@example.test',
      displayName: 'A player',
      displayNameChosen: true,
    });
    publishEverydayAccount(signedInState);
    expect(everydayAccount()).toBe(signedInState);
  });

  it('tells every listener, and stops when one unsubscribes', () => {
    let first = 0;
    let second = 0;
    const stopFirst = onEverydayAccount(() => {
      first += 1;
    });
    onEverydayAccount(() => {
      second += 1;
    });
    publishEverydayAccount(SIGNED_OUT);
    expect([first, second]).toEqual([1, 1]);
    stopFirst();
    publishEverydayAccount(withNotice(SIGNED_OUT, 'Signed out.'));
    expect([first, second]).toEqual([1, 2]);
  });

  /**
   * **The whole of the #106 argument, driven.**
   *
   * `drawMenu()` runs on a menu navigation, a settings toggle, a free-play edit and thirteen
   * account paths. Only the last of those may reach a listener, and what makes that true is not a
   * field comparison written here — it is `menu/account.ts` returning the state it was handed when
   * nothing changed, which that module's own first paragraph is about: *\"A commit that changes
   * nothing is not an edit\"*. So this drives the reducer rather than a hand-built pair.
   */
  it('publishes nothing when the account did not move, which is what lets `drawMenu` call it', () => {
    let heard = 0;
    onEverydayAccount(() => {
      heard += 1;
    });

    const typed = updateForm(SIGNED_OUT, { email: 'someone@example.test' });
    publishEverydayAccount(typed);
    expect(heard, 'a real transition is heard').toBe(1);

    /* The same draw again — a navigation, a slider, anything that is not an account write. */
    publishEverydayAccount(typed);
    expect(heard, 'a redraw with no account change woke a listener').toBe(1);

    /*
     * The same address arriving a second and third time, which is what a browser does: `change`
     * fires on blur and again on Enter, and once more on the blur that follows the button pressed.
     * `updateForm` hands the state back unchanged, so nothing here has to know that.
     */
    publishEverydayAccount(updateForm(typed, { email: 'someone@example.test' }));
    publishEverydayAccount(updateForm(typed, { email: 'someone@example.test' }));
    expect(heard, 'a re-committed identical address woke a listener').toBe(1);

    /* And a genuine edit is not swallowed by any of that. */
    publishEverydayAccount(updateForm(typed, { email: 'someone-else@example.test' }));
    expect(heard).toBe(2);
  });

  it('withdraws the account, which is a transition like any other', () => {
    let heard = 0;
    publishEverydayAccount(signedOut('Signed out.'));
    onEverydayAccount(() => {
      heard += 1;
    });
    publishEverydayAccount(undefined);
    expect(heard).toBe(1);
    expect(everydayAccount()).toBeUndefined();
    /* Twice is once: there is nothing further to withdraw. */
    publishEverydayAccount(undefined);
    expect(heard).toBe(1);
  });
});

/**
 * **The two publishes `dev/main.ts` owes, read as source** — which is weak evidence and is the only
 * evidence available, on `everyday/signInLink.test.ts`'s own precedent and with its own limitation:
 * this says a line has been written and nothing at all about what the product does.
 *
 * It is here because the defect it watches for was in this lane's first draft and no test in the
 * tree could see it. {@link publishEverydayAccount} was called from `drawMenu()` only — the choke
 * point every account **write** passes through — and boot's own sequence
 * (`restoreSession(); applyTheme(); renderAll(); runShift();`) never calls it. So on an ordinary
 * load nothing published an account at all, and the settings screen sat on its *the simulator is
 * still loading* arm for the whole visit while the simulator had long since loaded. The two calls
 * answer two different questions — *it moved* and *there is one* — and either alone is a screen
 * that is wrong half the time.
 */
describe('what only the source can say — the two publishes', () => {
  const source = (): string =>
    readFileSync(fileURLToPath(new URL('../dev/main.ts', import.meta.url)), 'utf8');

  it('publishes on every menu draw, so no account transition is missed', () => {
    const body = source();
    const at = body.indexOf('function drawMenu()');
    expect(at, '`drawMenu` is not in `dev/main.ts` under that name').toBeGreaterThan(0);
    const to = body.indexOf('\n  }\n', at);
    expect(
      body.slice(at, to),
      'the account is no longer published from `drawMenu`, which is the one choke point every ' +
        'account write passes through — thirteen call sites of `accountState = …; drawMenu();`. ' +
        'A publish moved out of it is a transition a screen never hears about.',
    ).toContain('publishEverydayAccount(accountState)');
  });

  it('publishes once at boot as well, so an untouched load has an account to draw', () => {
    const body = source();
    const publishes = [...body.matchAll(/publishEverydayAccount\(/gu)];
    expect(
      publishes.length,
      'there is only one publish, and it is `drawMenu`’s. Nothing in boot calls `drawMenu`, so on ' +
        'a load where the player never opens the Engineer menu the Everyday settings screen would ' +
        'draw its booting arm for the whole visit.',
    ).toBeGreaterThan(1);
    /* And the second one is boot's, beside the line that makes Everyday screens mountable. */
    const host = body.indexOf('EVERYDAY_HOST.publish(');
    const boot = body.indexOf('publishEverydayAccount(accountState);', host);
    expect(host, 'the Everyday host is no longer published under that name').toBeGreaterThan(0);
    expect(boot, 'boot does not publish the account after publishing the host').toBeGreaterThan(host);
  });
});

/**
 * **A wait that ends leaves no trace of itself** — GitHub issue #221's third defect.
 *
 * `startWaiting` set `busy: true` and returned a closure that cleared only the timers and the live
 * region. Three of its four callers followed `done()` with `withNotice` or `signedIn`, both of
 * which write `busy: false`, so the flag came down by *coincidence of the caller* rather than by
 * the pair being complete. `postCurrentRun` was the fourth: the surface that consumes it is the
 * Everyday shell, which writes its own success line on its own screen and has no account notice to
 * write. Posting a run from Everyday therefore left the account `busy` for the rest of the session
 * — {@link canSubmitForm} false, *Save name* disabled, and a stale *"Posting this run…"* under an
 * `aria-describedby` claiming a request was in flight when none was.
 *
 * It lives in this file rather than in a screen's because this is the channel it broke on: the
 * Everyday world only ever sees `busy` through `publishEverydayAccount`, and the two cases below
 * are the property and the wiring that carries it.
 */
describe('a wait that ends — GitHub issue #221', () => {
  const waiting = signedIn(SIGNED_OUT, 'token', {
    id: 'u-1',
    email: 'a@turing.example',
    displayName: 'A. Turing',
    displayNameChosen: true,
  });

  it('round-trips exactly: what was displaced comes back, not merely the flag', () => {
    const before = withNotice(waiting, 'Signed in.');
    const during = pending(before, 'Posting this run…');
    expect(during.busy).toBe(true);
    expect(during.notice).toBe('Posting this run…');

    const after = waitEnded(during, before.notice);
    /*
     * Field-for-field rather than `busy === false`. *Clears the flag* would also be satisfied by a
     * function that left the wait's own sentence on screen — which is the second half of what the
     * player actually saw, a disabled control beside a sentence about a request that had finished.
     */
    expect(after).toEqual(before);
  });

  it('re-offers *Save name* on the screen the player was actually stuck on', () => {
    /*
     * The rendered settings block rather than {@link canSubmitForm}, because the flag is not what a
     * player meets. `settingsView.ts`'s `offered = !account.busy && …` is what greys the control,
     * and its `notice` is the sentence beside it — so this drives the two things that were wrong on
     * screen: a disabled *Save name*, and *"Posting this run…"* still under it.
     */
    const screen = (account: AccountState): SettingsScreenView =>
      settingsScreenViewOf({ profile: undefined, accountServer: true, account });

    const before = withNotice(waiting, 'Signed in.');
    expect(screen(before).you.signIn.actionOffered).toBe(true);

    const during = pending(before, 'Posting this run…');
    expect(screen(during).you.signIn.actionOffered).toBe(false);
    expect(screen(during).you.signIn.notice).toBe('Posting this run…');

    const after = screen(waitEnded(during, before.notice));
    expect(after.you.signIn.actionOffered, 'the control is still disabled after the post finished').toBe(true);
    expect(
      after.you.signIn.notice,
      'the screen still says a request is in flight after it finished — the stale half of the defect',
    ).toBe('Signed in.');
  });

  it('is what `startWaiting` returns, so no caller has to remember to clear it', () => {
    /*
     * The source rather than a behaviour, because the defect was a *missing* call and no unit can
     * observe one. `dev/main.ts`'s `startWaiting` is a closure inside boot with no seam to drive,
     * and the property that matters is structural: the undo is in the pair, not in each of the
     * four callers.
     */
    const body = readFileSync(fileURLToPath(new URL('../dev/main.ts', import.meta.url)), 'utf8');
    const at = body.indexOf('function startWaiting(');
    expect(at, '`startWaiting` is not in `dev/main.ts` under that name').toBeGreaterThan(0);
    const to = body.indexOf('\n  }\n', at);
    const fn = body.slice(at, to);

    expect(
      fn,
      '`startWaiting` no longer ends the wait through `waitEnded`. It sets `busy` and returns the ' +
        'way to stop, so clearing it has to happen here — a caller that forgets leaves the account ' +
        'busy for the session, which is exactly what posting from the Everyday shell did.',
    ).toContain('waitEnded(accountState');
    expect(
      fn,
      'the undo no longer redraws. `drawMenu` is the only thing that publishes to `accountPort`, ' +
        'so a state cleared without it is a state the Everyday world never hears about.',
    ).toContain('drawMenu()');
  });
});
