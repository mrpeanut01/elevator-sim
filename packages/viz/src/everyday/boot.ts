/**
 * **The application's entry point** — the one place that decides what a player meets.
 *
 * `packages/viz/index.html` loads this module and nothing else. It does two things, in this order:
 *
 * 1. Imports `dev/main.js` for its side effect, which builds and starts the Engineer surface inside
 *    the static `div.shell`. Nothing about that surface changes.
 * 2. Mounts {@link mountEverydayShell} over it, so the app opens on Everyday Mode's main menu
 *    (GAMEPLAY § 3.5) and the Engineer surface is uncovered only when a mode hands off to it.
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
 * ## What happens if the Engineer root is missing
 *
 * Nothing fatal, and nothing silent. {@link mountEverydayShell} accepts `engineerRoot: undefined` —
 * the menu, the rail and every refusal draw without it — so a page that shipped without `div.shell`
 * gets a working menu whose one playable tile lands on an empty stage. That is worse than a hard
 * failure and better than a blank page, so it is reported to the console rather than passed over.
 */

import '../dev/main.js';

import { mountEverydayShell, type EverydayShell } from './shell.js';

/**
 * The selector for the Engineer application root.
 *
 * `div.shell` is authored statically in `packages/viz/index.html` rather than created by
 * `dev/main.ts`, which is why this is a query rather than an import.
 */
export const ENGINEER_ROOT_SELECTOR = '.shell';

/**
 * The Engineer menu, and its *Resume* row — how this shell gets that menu out of the way.
 *
 * `dev/main.ts` opens its own eight-screen menu at boot, over the very surface the stage hands off
 * to. Something has to close it, and there are two ways: reach into that module for `closeMenu`, or
 * press the control a player would press. This presses the control — it is the one seam that stays
 * true if the menu is rewritten, and `dev/menuExit.browser.test.ts` already drives the same row.
 *
 * **Resume rather than a mode row, and the difference matters for what gets filed.** Resume exits
 * as `changed-their-mind`, so it does *not* latch `playerHasChosen`, so the demo day boot left on
 * the stage is not filed as something the player chose — which is exactly right, because they chose
 * Today's tower, not that. The first real press of *Run this shift* latches through
 * `playerStartedARun`, so nothing the player actually asks for goes unfiled.
 */
export const ENGINEER_MENU_SELECTOR = '.menu-overlay';
export const ENGINEER_RESUME_SELECTOR = '[data-menu-control="main.resume"]';

/**
 * Press it if it is there. `true` when the menu is gone — pressed now or already closed.
 *
 * The `hidden` check is what makes this idempotent, and idempotence is what lets it be called from
 * both a boot watcher and the stage hand-off without the second call re-opening anything.
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
export function dismissEngineerMenu(doc: Document): boolean {
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
 * ## Why at boot rather than at the hand-off, which is where it started
 *
 * `dev/main.ts` self-invokes an **async** `main()`, so at the moment this shell mounts, the Engineer
 * menu may be an empty `div.menu-overlay` with `hidden === false` and no rows in it yet. Dismissing
 * only when the player pressed *Today's tower* therefore had a race: press fast enough and the
 * Resume row was not there to press, the hand-off did nothing, and the stage arrived with the
 * Engineer menu sitting on top of it. That race is not hypothetical — it fired here, on a reload
 * that beat the boot.
 *
 * Waiting for the row and pressing it once removes the race instead of narrowing it: by the time any
 * hand-off can happen the menu is already closed, and {@link dismissEngineerMenu} at the hand-off is
 * then a cheap no-op that stays as the belt to this brace.
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
 * That moment is the hand-off, and it is where the failure is reported: {@link bootEveryday} calls
 * {@link dismissEngineerMenu} again as the stage is entered and says so if the menu is still up. A
 * silent failure there is a player looking at a developer menu the product does not admit to having,
 * which is the failure mode this repository keeps finding — so it is named, at the instant it would
 * become visible, rather than guessed at on a clock.
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
  const engineerRoot = doc.querySelector<HTMLElement>(ENGINEER_ROOT_SELECTOR) ?? undefined;
  if (engineerRoot === undefined) {
    console.error(
      `Everyday shell: no ${ENGINEER_ROOT_SELECTOR} in the document. The menu will draw, but ` +
        "Today's tower will hand off to nothing.",
    );
  }
  closeEngineerMenuWhenReady(doc);
  return mountEverydayShell(doc, {
    engineerRoot,
    /*
     * The belt to `closeEngineerMenuWhenReady`'s brace, and the place its failure is reported: by
     * here the menu should long since be closed, so a `false` means the Resume row never arrived and
     * the player is about to meet the Engineer menu over their stage.
     */
    onEnter: (screen) => {
      if (screen !== 'stage') return;
      if (dismissEngineerMenu(doc)) return;
      console.error(
        `Everyday shell: handing off to the stage and ${ENGINEER_MENU_SELECTOR} ` +
          `${ENGINEER_RESUME_SELECTOR} is not there to press. The Engineer menu is still over it.`,
      );
    },
  });
}

/*
 * Same guard as `dev/main.ts`'s, and for the same reason: under `vitest`'s `environment: 'node'` a
 * test may import this module for {@link bootEveryday} without a document to mount into.
 */
if (typeof document !== 'undefined') bootEveryday(document);
