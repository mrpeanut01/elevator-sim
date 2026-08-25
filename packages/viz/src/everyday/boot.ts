/**
 * **The application's entry point** — the one place that decides what a player meets.
 *
 * `packages/viz/index.html` loads this module and nothing else. It does two things, in this order:
 *
 * 1. Imports `dev/main.js` for its side effect, which builds and starts the Engineer surface inside
 *    the static `div.shell`. Nothing about that surface changes.
 * 2. Mounts {@link mountEverydayShell} over it, so the app opens on Everyday Mode's main menu
 *    (GAMEPLAY § 3.5) and the Engineer surface stays covered behind it.
 *
 * ## Why the import comes first, and why it is a bare side-effect import
 *
 * `dev/main.ts` self-invokes `main()` at module scope under `typeof document !== 'undefined'`, and
 * `main()` is async — so importing it *starts* the Engineer application and returns before it has
 * finished booting. That is fine and is the reason the shell covers rather than hides: the Engineer
 * surface lays itself out for its whole life whether or not anybody is looking at it, so whatever
 * it measures during that async boot it measures against a real box.
 *
 * The import is bare because there is nothing to call. Giving it a named export to invoke here would
 * be a second boot path for a module that already has one, and the second one would be the one
 * nothing tests.
 *
 * ## The Engineer surface is no longer handed off to — it is swapped to
 *
 * `everyday/stageScreen.ts` is GAMEPLAY § 7's stage, so `shell.ts` never insets `div.shell` and
 * takes neither an `engineerRoot` nor an `onEnter` hook. The import above is unchanged and so is
 * everything it starts — the Engineer application boots, lays itself out and runs exactly as before,
 * behind an opaque, inert cover.
 *
 * What reaches it is § 3.2's footer row: `shell.ts#enterEngineer` lifts the cover and steps the
 * Everyday root aside, and `dev/main.ts`'s header control puts it back through
 * `everyday/swap.ts`'s port. Neither direction runs through this file, and that is worth saying
 * because this file is where the hand-off used to live: the swap is a transition between two
 * mounted shells, not a boot, so nothing about it is entry-point business.
 *
 * {@link closeEngineerMenuWhenReady} stays, and it is now the whole fastening rather than the brace
 * to `onEnter`'s belt: the Engineer menu opens itself at boot, and a menu left open behind the cover
 * is the first thing a player would meet on their first swap.
 */

import '../dev/main.js';

import { EVERYDAY_HOST } from './host.js';
import { mountEverydayShell, type EverydayShell } from './shell.js';

/**
 * The Engineer menu, and its *Resume* row — how this shell gets that menu out of the way.
 *
 * `dev/main.ts` opens its own eight-screen menu at boot, over the Engineer surface — the surface the
 * heading above says is **swapped** to rather than handed off to, and which this line went on
 * calling *"the very surface the stage hands off to"* for one wave after § D338 retired that
 * hand-off (GitHub issue #261). It is the same retired hand-off `everyday/modes.ts` described from
 * the other end, naming the *mode* where this named the *surface*; both were stale, and neither was
 * narrowly true of some residual hand-off, because there is no route left that could produce one.
 * Something has to close it, and there are two ways: reach into that module for `closeMenu`, or
 * press the control a player would press. This presses the control — it is the one seam that stays
 * true if the menu is rewritten, and `dev/menuExit.browser.test.ts` already drives the same row.
 *
 * **Resume rather than a mode row, and the difference matters for what gets filed.** Resume exits
 * as `changed-their-mind`, so it does *not* latch `playerHasChosen`, so the demo day boot left on
 * the stage is not filed as something the player chose — which is exactly right, because they chose
 * Today's tower, not that. The first real press of *Run this shift* latches through
 * `playerStartedARun`, so nothing the player actually asks for goes unfiled — and § 7's stage asks
 * for exactly that press on entry, gated on `runState().open`, which boot's demo run does not set.
 */
export const ENGINEER_MENU_SELECTOR = '.menu-overlay';
export const ENGINEER_RESUME_SELECTOR = '[data-menu-control="main.resume"]';

/**
 * Press it if it is there. `true` when the menu is gone — pressed now or already closed.
 *
 * The `hidden` check is what makes this idempotent, and idempotence is what lets the observer below
 * call it on every mutation until the row arrives, without a later call re-opening anything.
 *
 * ## Module scope, and why that is the whole of the fix for GitHub issue #273
 *
 * It was `export`ed because the § D335 stage hand-off called it — the belt to
 * {@link closeEngineerMenuWhenReady}'s brace. § D338 retired the hand-off, the caller went with it,
 * and the `export` stood for a wave with nothing importing it. **It is not a dead seam and must not
 * be counted as one:** the function is called, on the shipped path, by the observer below. What had
 * no caller was the keyword.
 *
 * The other outcome was checked first and ruled out — the defect might have been a *missing* call
 * rather than a surplus export, if crossing § D338's door were supposed to close this menu behind
 * the player. It is not, and cannot be: outward, `shell.ts#setCoveredInert` inerts `div.shell`, so
 * `#open-menu` cannot be pressed while Everyday Mode has the page and nothing else dispatches
 * `reopen`; back, `menuPanel.ts#coverShell` inerts that same subtree while the menu is drawn, so
 * `#back-to-everyday` — which lives inside `div.shell` — cannot be pressed while the menu is up. A
 * player therefore cannot reach either side of the door with this menu open, and a second call site
 * would be a call that can never do anything.
 *
 * `deadCode.test.ts` holds both halves, because neither is safe as a sentence: its limit 6 says why
 * the package's dead-code audit could not see this (a self-use satisfies its caller question), and
 * its check goes red if the export comes back **or** if the two presses below go away.
 *
 * ## The lift, and why it is not a hack
 *
 * `everyday/shell.ts` covers the page by writing `inert` on every sibling, and **an `inert` subtree
 * swallows `HTMLElement.click()` as well as a real one**. So the shell's own cover stopped the shell
 * from operating the one control it needs to operate. That is not a race that can be ordered away:
 * `dev/main.ts` appends an *empty* `div.menu-overlay` and renders its rows in a later task, so by
 * the time the Resume row exists the cover has long since been applied — and this ran green in a
 * browser pane and red in headless for exactly that reason, which is what driving it was for.
 *
 * The attribute is therefore lifted for the press and put back in the same synchronous block. It is
 * restored unconditionally, before anything can observe otherwise: a `MutationObserver` callback is
 * a microtask, so the shell's re-assert sees the value it already wanted and no window exists in
 * which the covered menu is reachable by a player.
 */
function dismissEngineerMenu(doc: Document): boolean {
  const overlay = doc.querySelector<HTMLElement>(ENGINEER_MENU_SELECTOR);
  if (overlay === null) return false;
  if (overlay.hidden) return true;
  const resume = overlay.querySelector<HTMLButtonElement>(ENGINEER_RESUME_SELECTOR);
  if (resume === null) return false;
  const wasInert = overlay.inert;
  overlay.inert = false;
  try {
    resume.click();
  } finally {
    overlay.inert = wasInert;
  }
  return true;
}

/**
 * Close the Engineer menu as soon as it exists, and keep it closed.
 *
 * ## Why at boot, which is where it ended up
 *
 * `dev/main.ts` self-invokes an **async** `main()`, so at the moment this shell mounts, the Engineer
 * menu may be an empty `div.menu-overlay` with `hidden === false` and no rows in it yet. Dismissing
 * only when the player pressed *Today's tower* therefore had a race: press fast enough and the
 * Resume row was not there to press, the hand-off did nothing, and the stage arrived with the
 * Engineer menu sitting on top of it. That race is not hypothetical — it fired here, on a reload
 * that beat the boot.
 *
 * Waiting for the row and pressing it once removes the race instead of narrowing it. That made this
 * the brace and {@link dismissEngineerMenu} at the hand-off the belt — a cheap no-op by the time it
 * ran. § D338 retired the hand-off and the belt with it, so this is now the **whole** fastening,
 * which is what the module heading says and what this paragraph went on contradicting.
 *
 * ## Why it watches the overlay rather than the document
 *
 * The obvious form of this — one observer on `body` with `subtree: true` — **wedges the renderer**,
 * and that was measured rather than reasoned about: `dev/main.ts` builds eleven panels and redraws
 * at 60 Hz, so a document-wide observer records every node any of that adds, and the page never
 * fired `load` at all. The existing browser tier passed against the same tree in 22 seconds, which
 * is how the cause was pinned to this and not to the harness.
 *
 * So it is two narrow steps instead. `body`'s **direct children** are watched until
 * `div.menu-overlay` arrives; then that one element's subtree is watched until it contains the row.
 * The overlay is a menu, so its subtree is small and bounded, and everything else `dev/main.ts`
 * builds is invisible to this.
 *
 * ## Why it carries no deadline
 *
 * `boundaries.test.ts` requires that nothing outside the shells schedules a timer, and any deadline
 * long enough not to fire during that boot is far longer than the moment when the answer matters.
 *
 * That moment used to be the hand-off, where {@link bootEveryday} pressed the row a second time and
 * reported a failure to the console. There is no hand-off now, and the honest consequence is that
 * this observer has no deadline **and** no reporting site — a menu that never gained its Resume row
 * stays open behind an opaque cover, where nobody can see it and nothing depends on it. That is a
 * smaller failure than the one it replaces, and it is stated rather than left to be inferred from a
 * deleted `console.error`.
 */
export function closeEngineerMenuWhenReady(doc: Document): void {
  if (dismissEngineerMenu(doc)) return;

  const observer = new MutationObserver(() => {
    if (dismissEngineerMenu(doc)) {
      observer.disconnect();
      return;
    }
    /*
     * The overlay may have arrived empty — `dev/main.ts` appends it and renders its rows in a later
     * task. Watching it from here is what turns "the menu exists" into "the menu has a Resume row",
     * without ever widening the watch to the document.
     */
    const overlay = doc.querySelector<HTMLElement>(ENGINEER_MENU_SELECTOR);
    if (overlay !== null) observer.observe(overlay, { childList: true, subtree: true });
  });
  observer.observe(doc.body, { childList: true });
}

/** Mount the Everyday shell over an already-booting Engineer surface. */
export function bootEveryday(doc: Document): EverydayShell {
  closeEngineerMenuWhenReady(doc);
  return mountEverydayShell(doc, {
    /*
     * The data host's slot — `dev/main.ts` publishes into it at the end of its own boot, which is
     * strictly after this mount (its `main()` is async and this file runs synchronously after the
     * side-effect import above). The shell handles both orders; see `EverydayShellHost.host`.
     */
    host: EVERYDAY_HOST,
  });
}

/*
 * Same guard as `dev/main.ts`'s, and for the same reason: under `vitest`'s `environment: 'node'` a
 * test may import this module for {@link bootEveryday} without a document to mount into.
 */
if (typeof document !== 'undefined') bootEveryday(document);
