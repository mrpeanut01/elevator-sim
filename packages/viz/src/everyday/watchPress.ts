/**
 * **Pressing *Watch it* on a row, in the one order that is safe** — GitHub issues #410, #526 item 3
 * and #531 item 2, [§ D567](../../../../DECISIONS.md).
 *
 * Two screens offer somebody else's run to be watched: `everyday/weekScreen.ts` (a filed day of the
 * player's own week, or a reference row) and `everyday/boardScreen.ts` (a posted daily-board row).
 * The press is the same on both and it has three hazards, none of them obvious from the call site:
 *
 * 1. **The gate is a worker round trip.** `EverydayHost.watchRun` re-simulates the record and enters
 *    the spectator state *only* on an exact reproduction, so the answer arrives in a later task and
 *    the row it answers about has to be remembered.
 * 2. **A second press must be dropped rather than queued** (#410). Two runs in flight over one host
 *    would land the second's answer over a spectator state the first had already entered.
 * 3. **A check that lands after the player has left the screen must enter nothing** (#526 item 3) —
 *    and must *undo* the watch the host has by then already entered, because `watchRun` enters it
 *    before it answers. Only the one this press entered, by identity: a watch the player has since
 *    opened elsewhere is not this press's to end.
 *
 * ## Why it is one function rather than the same fifteen lines twice
 *
 * It was the same fifteen lines twice. The week screen's copy is driven on the page
 * (`everyday/watchStage.browser.test.ts`), and the board's copy was driven by nothing, because the
 * browser tier runs no board server and the board's rows need one — so reverting the board's guard
 * alone failed no test in the tree, which is what GitHub issue #531 item 2 reports. Testing the
 * second copy was the other fix and it is the worse one: it would leave two implementations of a
 * three-hazard decision, each with its own test, free to drift apart in exactly the way this
 * repository's register of duplicated decisions says they do.
 *
 * So there is one implementation, `watchPress.test.ts` drives all four of its outcomes against a
 * fake host, and the two screens supply ports. **What that does not buy, stated rather than
 * glossed:** nothing here can tell you that the board still *calls* this. Its non-test callers are
 * named above and in {@link pressWatchRow}; the week screen's call is pinned on the page by the
 * browser case named above, and the board's is pinned by nothing until the tier can stand a board
 * server up. That is a smaller hole than the one it replaces — a guard with no test at all — and it
 * is the honest size of it.
 */

import type { WatchableRun } from '../watch/types.js';

import type { EverydayHost } from './host.js';

/**
 * What the pressing screen lends this function: its own idea of which row is busy, its own redraw,
 * and its own two destinations.
 *
 * Deliberately not *the screen* — the two differ in every one of these (the board keys its busy row
 * and its refusals by the server's row id and stores the reason, the week screen keys both by the
 * run's id and stores the whole checked row), and a shared function that knew about either would be
 * a third opinion about state neither screen has given it.
 */
export interface WatchPressPorts {
  /** Whether the screen that pressed is still mounted. `weekScreen`'s `alive`, `boardScreen`'s `!disposed`. */
  alive(): boolean;
  /** The row whose check is in flight on this screen, or `undefined`. */
  checking(): string | undefined;
  /** Remember the row whose check is in flight, or that none is. Assign only — {@link redraw} is separate. */
  setChecking(rowId: string | undefined): void;
  /** Draw the screen again. Called on the press and on a refusal, and deliberately not on the other two arms. */
  redraw(): void;
  /** Record the gate's refusal against the row it refused. The screen decides what it keeps of `checked`. */
  refuse(checked: WatchableRun): void;
  /** Enter the spectator context — `EverydayScreenShellContext.enterWatch`, which is the shell's half. */
  enter(): void;
}

/** The three calls this needs from the host, named rather than the whole façade. */
export type WatchPressHost = Pick<EverydayHost, 'watchRun' | 'watching' | 'stopWatching'>;

/**
 * Press *Watch it* on `run`, which the screen draws as row `rowId`.
 *
 * Non-test callers: `everyday/weekScreen.ts#press` and `everyday/boardScreen.ts`'s daily-row button.
 *
 * `rowId` is the screen's own key for the row rather than `run.id`, because the board's rows are the
 * server's and its busy state and refusals are keyed by the server's id; the week screen passes
 * `run.id` and the two agree without this function having to know which it was handed.
 *
 * The order is the whole of it: the guard, then the busy state and a draw, then the gate, and the
 * gate's answer read in the order *left / refused / enter*. A caller may put a busy state up on the
 * press and take it down in the callback with no fourth case to handle, because `watchRun` settles
 * exactly once on every arm — its own docstring is the contract this relies on.
 */
export function pressWatchRow(
  host: WatchPressHost,
  rowId: string,
  run: WatchableRun,
  ports: WatchPressPorts,
): void {
  /*
   * Dropped rather than queued — GitHub issue #410, and it is the guard the move off the painting
   * thread made necessary rather than a courtesy. While the gate was synchronous a second press
   * could not be delivered: the first one had the thread.
   */
  if (ports.checking() !== undefined) return;
  ports.setChecking(rowId);
  ports.redraw();
  host.watchRun(run, (checked) => {
    ports.setChecking(undefined);
    /*
     * **A check that lands after the player has left enters nothing** — GitHub issue #526 item 3.
     * The host has already entered the spectator state by the time this runs, so that session is
     * ended too — and only if it is the one this press entered, by identity.
     */
    if (!ports.alive()) {
      if (checked.blocked === null && host.watching()?.run === checked) host.stopWatching();
      return;
    }
    /*
     * The gate's answer is read rather than assumed: a row it hands back carrying `blocked` is a row
     * the shell must not navigate to. Recording the refusal by id is `dev/watchPanel.ts`'s own
     * arrangement — the row is redrawn with its reason and without its affordance.
     */
    if (checked.blocked !== null) {
      ports.refuse(checked);
      ports.redraw();
      return;
    }
    ports.enter();
  });
}
