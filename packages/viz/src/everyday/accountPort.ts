/**
 * **The account, as the Everyday world hears about it** — GitHub issue #332,
 * [§ D489](../../../../DECISIONS.md)'s asking half, and the notification defect that issue's
 * implementation map measured before anything was built.
 *
 * ## What is here and what is deliberately next door
 *
 * The **state** and its change notification are here. The three **effects** — commit an address,
 * ask for a link, choose a display name, sign out — are on `everyday/host.ts` in `dailyBoard`'s
 * shape, because they are calls into the client and that is where this shell takes calls. The split
 * is not tidiness: a screen has to be told *when* the account moved, and the host cannot tell it.
 *
 * ## Why the host cannot tell it, measured rather than assumed
 *
 * `dev/main.ts`'s `everydayHostListeners` is drained in exactly one place — the last statement of
 * `renderAll()` — and **no account path calls `renderAll`**. Every one of them calls `drawMenu()`,
 * which is `renderMenu(menuRoot, menuHost)` and nothing else. So a screen wired to
 * `EverydayHost.onChange` would render once and never move again: the player presses *Email me a
 * link*, the state goes busy, the wait ladder escalates three times over § D243 § 4's measured
 * **28.7 s** cold start, the 202 arrives, the 429 gate lifts on a timer — and the screen shows none
 * of it. A screen that does not repaint for half a minute is indistinguishable from a hang, which
 * is the one failure `dev/main.ts`'s wait ladder exists to prevent.
 *
 * `everyday/signInLink.ts` reached the same conclusion one wave earlier and wrote the other half
 * down: widening that drain to `drawMenu` would notify every Everyday screen on every commit in the
 * Engineer account form, *"which is a redraw storm in the direction GitHub issue #106 documents"*.
 * Both routes are refused, and this is the third: a channel of its own, published from `drawMenu`,
 * that fires **only when the account state is a different object**.
 *
 * ## The de-duplication is `menu/account.ts`'s own rule, borrowed rather than re-decided
 *
 * Every reducer in that module returns a **fresh `Object.freeze`d** state for a real transition and
 * — this is the part that matters — `updateForm` returns *the state it was given* when the commit
 * changes nothing:
 *
 * > **A commit that changes nothing is not an edit** — GitHub issue #106. […] the rule is about the
 * > string and not about the event.
 *
 * So reference identity is an exact test for *did the account move*, and {@link
 * publishEverydayAccount} can be called from `drawMenu()` — the one choke point every account write
 * already passes through, thirteen call sites of it — without a listener hearing about a menu
 * navigation, a slider, or the same address arriving three times from one blur. A comparison that
 * looked at fields would be a second answer to #106's question; this one inherits the first.
 *
 * ## What a listener must do with it, and what it must not
 *
 * Repaint the **account region** and nothing else. `everyday/settingsScreen.ts` does that with a
 * targeted redraw beside the two it already has, so the `<input>` carrying the caret is never
 * replaced. Rebuilding the screen on a notification would be #106 with a new trigger — *"a press
 * swallowed mid-`mousedown`, and focus taken off whatever the reader was on"* (`dev/main.ts`) — on
 * a form with a focused email field, which is exactly where that costs most.
 *
 * ## Why a provided value rather than an import
 *
 * `everyday/signInLink.ts`'s argument, unchanged: `dev/main.ts` holds `accountState` as a local
 * inside an async boot and exports no accessor, `everyday/boot.ts` already imports `dev/main.js`,
 * and an Everyday module importing it back would close the cycle that produced this directory's
 * last module-init `undefined`. This module imports one **type** and nothing else, so neither end
 * can be caught in one.
 *
 * ## The state itself is shared, not copied
 *
 * What travels is `menu/account.ts`'s own {@link AccountState}. `boundaries.test.ts` forbids
 * `everyday/` a **value** import of `menu/client.js` and names nothing else; `menu/account.ts`
 * imports client types only and is already value-imported here (`profile.ts`, `settingsView.ts`).
 * So the two shells render one state machine rather than two, and cannot disagree about whether
 * anybody is signed in — which is the failure `honesty/agreement.ts`'s `surfaces-disagree` exists
 * to catch, avoided structurally instead of watched.
 */

import type { AccountState } from '../menu/account.js';

let published: AccountState | undefined;

const listeners = new Set<() => void>();

/**
 * `dev/main.ts#drawMenu` is the one intended caller, on every draw of the Engineer menu.
 *
 * A no-op when the state is the same object, which is every call that did not follow an account
 * write and every commit that changed nothing — see the module docstring. `undefined` withdraws the
 * account, which is the state before `dev/main.ts`'s boot has reached its own `accountState`.
 */
export function publishEverydayAccount(state: AccountState | undefined): void {
  if (state === published) return;
  published = state;
  for (const listener of [...listeners]) listener();
}

/**
 * The account, or `undefined` while the Engineer surface is still booting.
 *
 * `undefined` is a real state a player can be in and is drawn as one — the Everyday shell mounts
 * immediately and `dev/main.ts` boots asynchronously, so the settings screen is reachable before
 * this has ever been published. It is the same window `everyday/engineerBridge.ts` opens for the
 * Motion row, and it is drawn the same way: a sentence, never a dead control.
 */
export function everydayAccount(): AccountState | undefined {
  return published;
}

/**
 * Hear it move. Returns the unsubscribe, which the settings screen calls on unmount so a
 * navigated-away screen does not redraw into a region something else now owns.
 */
export function onEverydayAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
