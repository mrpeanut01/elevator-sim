/**
 * **The way back from the Engineer surface** — the port that makes GAMEPLAY § 3.2's swap a door
 * rather than a one-way trip.
 *
 * ## What this is for
 *
 * The outward half of the swap needs no seam: `everyday/shell.ts` owns both the cover and the root
 * it covers with, so *Switch to Engineer* is a call it makes to itself. The **return** is the half
 * that crosses shells — the control is on `dev/main.ts`'s header and the thing it has to move is the
 * Everyday shell's own cover — and the two modules cannot import each other. `everyday/boot.ts`
 * imports `dev/main.js` for its side effect, so `dev/main.ts` importing `everyday/shell.js` would
 * close that cycle, and the cycle would bite exactly where `types.ts` records the last one biting:
 * at module-init time, on whichever file the graph entered second.
 *
 * So the dependency points the way it already points for `everyday/engineerBridge.ts`: the shell
 * **provides** the port when it mounts, `dev/main.ts` **consumes** whatever has been provided, and
 * neither names the other's module.
 *
 * ## Its one non-test caller in each direction
 *
 * {@link provideEverydaySwap} is called by `everyday/shell.ts#mountEverydayShell` — once on mount,
 * and again with `undefined` on `destroy`, so a torn-down shell cannot be handed the page by a
 * button that outlived it. {@link everydaySwap} and {@link onEverydaySwapProvided} are called by
 * `dev/main.ts#wireHeaderAndFooter`, which is the only reader.
 *
 * ## Why the header control is hidden until this port arrives, rather than refused
 *
 * A refusal would be a sentence about a door, and there is no honest sentence to write: on the page
 * this repository ships the port is always provided, because `packages/viz/index.html` loads
 * `everyday/boot.ts` and that file mounts the shell synchronously after starting `dev/main.ts`'s
 * async boot. The only build in which it is absent is one that loads `dev/main.ts` alone — and there
 * *there is no Everyday Mode to go back to*, so a control saying "not available" would be claiming a
 * world exists. Hidden is the true statement; the refusal would be the invented one.
 *
 * ## No words live here
 *
 * The door's three sentences are `everyday/types.ts`'s — `ENGINEER_SWAP_NOTE`,
 * `ENGINEER_RETURN_LABEL` and `ENGINEER_RETURN_TITLE` — for the reason that module's own docstring
 * gives. This file is the mechanism only, which is also why the honesty sweep does not drive it:
 * there is nothing in it a player reads, and it imports nothing, so it cannot be caught in the
 * cycle the words are held out of.
 */

/**
 * What the Engineer header may do to the Everyday shell. Narrow on purpose — one verb.
 *
 * There is deliberately no `enterEngineer` on it. The outward press is the rail's, the rail is the
 * shell's, and a port offering both directions would be a second way into a transition that already
 * has one — which is how the two halves get to disagree about what `inert` should say.
 */
export interface EverydaySwapPort {
  /**
   * Put Everyday Mode back over the Engineer surface, on the screen the player left.
   *
   * Idempotent: pressing it while Everyday Mode already has the page does nothing, which matters
   * because the header control is `inert` rather than absent while the Engineer menu is up and a
   * queued click can land after a swap has already happened.
   */
  returnToEveryday(): void;
  /**
   * Whether Everyday Mode has the page at this instant — `EverydayShell.world() === 'everyday'`,
   * read live rather than latched.
   *
   * ## Why a *read* does not reopen the argument above
   *
   * The paragraph over this interface refuses a second **verb**, and it still does: a port that
   * offered `enterEngineer` as well as `returnToEveryday` would be a second way into a transition
   * that already has one, and the two halves would get to disagree about what `inert` should say.
   * This is not that. It moves the page nowhere; it lets the surface behind the cover find out
   * which world is in front of it, which is a question `dev/main.ts` had no way to ask and was
   * answering by assumption.
   *
   * ## What it is for — GitHub issue **#287**
   *
   * `dev/main.ts#tick` closes the day when its own transport reaches the end of the run. That is
   * the Engineer surface's own behaviour and is right on the Engineer surface. Behind the Everyday
   * cover it was a second clock scoring somebody else's day: the covered transport autoplays at
   * ×60 whatever chip the player is holding, so arriving on § 7's stage and touching nothing filed,
   * scored and banked a day in `(endedAt − startedAt) / 60` real seconds — measured at 60.0 s on
   * the hour `garden-apartments` opens on, on a day the player had not watched a frame of.
   * `GAMEPLAY_AND_NAVIGATION.md` § 6.4 and § 16 rule 1 both forbid it in the same words: *`Close
   * the day` is the **only** thing that sets `dayClosed`*.
   *
   * **Two readers, not one**, and the second is why this is a port read rather than a line inside
   * `tick`: `dev/main.ts` also binds `Ctrl`/`Cmd`+`Enter` to the same close on a **`window`**
   * listener, and a window listener is not covered by `inert` — that shortcut filed the Everyday
   * player's day too. `dev/main.ts#engineerHasThePage` is the one expression both ask through.
   *
   * A decision number is owed for the boundary this draws: **the Engineer end-of-day close is
   * armed only while the Engineer surface has the page.** The Everyday product keeps its own
   * contract, the Engineer product keeps its own behaviour, and neither reaches across the cover.
   */
  hasThePage(): boolean;
}

let provided: EverydaySwapPort | undefined;

const listeners = new Set<() => void>();

/**
 * `everyday/shell.ts#mountEverydayShell` is the one intended caller: once with the port when it
 * mounts, once with `undefined` from `destroy`.
 *
 * Calling it again replaces the port — a re-mounted shell is a new cover — and re-notifies, which is
 * what a listener that survived the re-mount would want.
 */
export function provideEverydaySwap(port: EverydaySwapPort | undefined): void {
  provided = port;
  for (const listener of [...listeners]) listener();
}

/** The port, or `undefined` when no Everyday shell has the page. */
export function everydaySwap(): EverydaySwapPort | undefined {
  return provided;
}

/**
 * Hear the port arrive or go. Returns the unsubscribe.
 *
 * `dev/main.ts` does not call it: its boot runs once and lives as long as the page, so an
 * unsubscribe there would be a handle nothing can use. It is returned anyway because a listener that
 * cannot stop listening is the shape that leaks, and the next consumer will not be a boot.
 */
export function onEverydaySwapProvided(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
