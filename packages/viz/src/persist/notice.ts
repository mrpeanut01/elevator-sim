/**
 * What to tell a player whose saved week could not be read.
 *
 * ## The gap this closes
 *
 * `loadSession` already refuses precisely, and every refusal already carries a sentence naming the
 * field and the reason — a wrong schema version, an unknown key, a seed that would not survive the
 * trip back to a `bigint`, a contract `data/` no longer ships. `dev/main.ts` read the discriminated
 * failure, cleared the unreadable slot so it could not re-fail forever, and **started fresh without
 * saying so**. A player who lost a week got a new one and no explanation.
 *
 * `GAPS.md` filed it with the reason it was not fixed in the persistence lane: the moment the line
 * exists it is a player-facing string, and a player-facing string owes the honesty sweep an adapter.
 * This module is that line, and the adapter is in `honesty/surfaces.ts`.
 *
 * ## Why the wording is not `failure.message`
 *
 * The failure messages are written for whoever is debugging the envelope: *"week.history[0].day is
 * not a finite number"* is exactly right in a console and useless on a coach ribbon. What a player
 * needs is three things in one sentence — **what was lost, that it is not their doing, and what
 * happens now** — and the third is the one a bare error never has.
 *
 * The precise message is not thrown away. It is appended for the `parse`, `shape` and `stale` arms,
 * where it names a field or a missing id and is therefore actionable by somebody who can look; and
 * omitted for `unavailable`, where the browser's own wording adds nothing a player can use.
 *
 * ## `absent` returns nothing, and that is the load-bearing case
 *
 * A first visit is not a loss. Announcing *"no saved week was found"* to somebody who has never
 * played would make the notice mean two things — *your progress is gone* and *welcome* — and a
 * reader who saw it once on a first run would learn to ignore it on the run that mattered. This is
 * the same argument `SessionRestoreFailure` makes for having six kinds rather than one.
 */

import type { SessionRestoreFailure } from './types.js';

/**
 * The sentence, or `undefined` when there is nothing to say.
 *
 * Total over {@link SessionRestoreFailure} — an exhaustive switch, so a seventh failure kind is a
 * compile error rather than a silence.
 */
export function restoreNoticeFor(failure: SessionRestoreFailure): string | undefined {
  switch (failure.kind) {
    case 'absent':
      // Not a loss. See the module docstring.
      return undefined;

    case 'unavailable':
      /*
       * The only arm about the *future* rather than the past: nothing was lost, because nothing was
       * ever saved. Saying so is what stops a player closing the tab expecting to come back to it.
       */
      return (
        'This browser is not letting the page store anything, so your week will not survive a ' +
        'reload. Nothing has been lost — but nothing is being kept either.'
      );

    case 'version':
      return (
        `Your saved week was written by a different build of this app (version ${String(failure.found)}; ` +
        `this one reads ${String(failure.supported)}), so it could not be read. Starting a fresh week — ` +
        'nothing you do now will be lost.'
      );

    case 'parse':
      return `Your saved week could not be read and has been cleared. Starting fresh. (${failure.message})`;

    case 'shape':
      return (
        'Your saved week was damaged and could not be read, so it has been cleared. Starting fresh. ' +
        `(${failure.message})`
      );

    case 'stale':
      /*
       * The one arm where the cause is *this* build rather than the stored bytes: the week named a
       * contract or a building that no longer ships. Naming what went missing matters here because
       * it is the difference between *the app broke* and *the scenario you were on was withdrawn*,
       * and only the second is true.
       */
      return (
        'Your saved week was on something this build no longer ships, so it could not be reopened: ' +
        `${failure.missing.join(', ')}. Starting a fresh week.`
      );
  }
}
