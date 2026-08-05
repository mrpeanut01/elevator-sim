/**
 * What to tell a player whose saved week could not be read, whose library came back with holes in
 * it, or whose progress has stopped being written.
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
 *
 * ## Three functions, because there are three different pieces of news
 *
 * {@link restoreNoticeFor} is *your week could not be read*. {@link libraryNoticeFor} is *some of
 * the things you saved could not be reopened* — **not a `SessionRestoreFailure`**, because the
 * restore succeeded: the week came back, the library came back, and some entries in it did not.
 * `types.ts`'s `SavedLibrary` argues why that is a different kind of event rather than a softer one.
 * {@link saveNoticeFor} is the third and it is about the *future* rather than the past: nothing has
 * been lost, and nothing is being kept either.
 *
 * All three keep the same rule. Say **what was lost, that it is not the player's doing, and what
 * happens now** — and none of them puts a validator's sentence on a ribbon. The library's drops
 * carry a `reason` that names a JSON path inside a building config; that string is for whoever has
 * to work out why, it is in the value, and it does not appear in any sentence below.
 */

import type { DroppedEntry, SessionRestoreFailure, SessionSaveFailure } from './types.js';

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
      /*
       * *this build is on* rather than *this one reads*, since version 2 landed. The build reads
       * more than one shape — a version-1 envelope restores — so a sentence claiming it reads only
       * `supported` would be a small false statement in the one place a player is being told why
       * they lost something.
       */
      return (
        `Your saved week was written by a different build of this app (version ${String(failure.found)}; ` +
        `this build is on version ${String(failure.supported)}), so it could not be read. Starting a ` +
        'fresh week — nothing you do now will be lost.'
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

/* -------------------------------------------------------------------------- *
 * A library that came back with holes in it
 * -------------------------------------------------------------------------- */

/** How many dropped entries are named before the sentence stops listing and starts counting. */
const NAMED_AT_MOST = 3;

/** `the building “Tower B”` — the noun a player uses, and the name they gave it. */
const SHELF_NOUN: Readonly<Record<DroppedEntry['shelf'], string>> = Object.freeze({
  building: 'building',
  dispatcher: 'dispatcher',
  pattern: 'arrival pattern',
  class: 'machine class',
});

/**
 * `a`, `b and c`, `a, b and c` — an Oxford-comma-free list, because the sentence is prose.
 *
 * Separate from the counting above so that *and 4 more* joins the list as an ordinary member. A
 * sentence that ended *"…, the pattern “Lunch rush”, and 4 more"* reads as five items where four
 * were promised.
 */
function inWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

/**
 * What to tell a player whose library came back with entries missing. `undefined` when none were.
 *
 * ## Why `undefined` on an empty list, and not an empty string
 *
 * The same load-bearing case as `absent` above, and for the same reason: **the ordinary outcome is
 * that nothing was dropped**, on every load, forever. A function that returned a cheerful sentence
 * on that path would put a line about the library on a ribbon a hundred times before the one time
 * it meant something, and by then nobody reads it.
 *
 * ## What the sentence says, and what it deliberately does not
 *
 * Three things, in `notice.ts`'s order. **What was lost** — by the name the player gave it, because
 * *"one of your saved buildings"* sends somebody hunting through a library for something they
 * cannot identify. **That it is not their doing** — an entry is dropped because this build's loader
 * changed, or because the bytes were damaged in storage; neither is a thing a player did, and a
 * sentence that merely stated the loss would leave them wondering. **What happens now** — the rest
 * of the library is there and was not touched, which is the fact that separates *three of your
 * buildings are gone* from *your library is broken*.
 *
 * It does **not** carry `DroppedEntry.reason`. That is the validator's own words — a JSON path and
 * a type mismatch — and `restoreNoticeFor` appends the equivalent only on the arms where a reader
 * could act on it. Here they could not: the document is already gone, and nothing a player can do
 * to a coach ribbon will fix a `cars[2].spec` that names a class this build withdrew.
 */
export function libraryNoticeFor(dropped: readonly DroppedEntry[]): string | undefined {
  if (dropped.length === 0) return undefined;

  const named = dropped
    .slice(0, NAMED_AT_MOST)
    .map((entry) => `the ${SHELF_NOUN[entry.shelf]} “${entry.label}”`);
  const remaining = dropped.length - named.length;
  const list = inWords(remaining > 0 ? [...named, `${String(remaining)} more`] : named);

  const opening =
    dropped.length === 1
      ? 'One thing you saved could not be reopened by this build, so it has been left out'
      : `${String(dropped.length)} things you saved could not be reopened by this build, so they have been left out`;

  return (
    `${opening}: ${list}. That is this build’s doing rather than anything you did — ` +
    'everything else you saved is still here and untouched.'
  );
}

/* -------------------------------------------------------------------------- *
 * A save that did not happen
 * -------------------------------------------------------------------------- */

/** Characters to a round kB, for a sentence. Never zero, so *0 kB* cannot be the news. */
function roughKilobytes(characters: number): string {
  return `${String(Math.max(1, Math.round(characters / 1000)))} kB`;
}

/**
 * What to tell a player whose progress is not being written. Total — every kind says something.
 *
 * ## Why this exists at all, when `saveSession` already carries a message
 *
 * For the reason {@link restoreNoticeFor} exists beside `loadSession`'s. `SessionSaveFailure`'s
 * messages name a JSON path and an exception, and `honesty/derive.test.ts` classifies them as
 * developer strings on the ground that *"nothing puts one on a screen"*. That is still true of the
 * messages; it stopped being true of the **news**. A player whose library has outgrown the slot is
 * the one person who can fix it, and they cannot fix what they are not told.
 *
 * ## Every arm is about the future, and that is what makes it a different sentence
 *
 * Nothing has been lost in any of these — the run is on screen, the week is in memory, the previous
 * save is untouched. What has stopped is *keeping*. So each sentence says that plainly rather than
 * apologising for a loss that has not happened, which is the same shape as `restoreNoticeFor`'s
 * `unavailable` arm.
 */
export function saveNoticeFor(failure: SessionSaveFailure): string {
  switch (failure.kind) {
    case 'library-too-large':
      /*
       * The only arm a player can act on, so it is the only one that says how. The size is in
       * rounded kB rather than characters: the exact figure is in `failure.characters` for whoever
       * needs it, and a ribbon that read *"527 418 characters"* would be quoting an implementation
       * at somebody who wants to know which building to delete.
       */
      return (
        `The ${String(failure.entries)} things you have saved have outgrown what this browser will ` +
        `keep — about ${roughKilobytes(failure.characters)}, and the limit is ` +
        `${roughKilobytes(failure.limit)}. Nothing has been lost and your last save is untouched, ` +
        'but nothing new is being kept — including this week — until you delete a saved building, ' +
        'dispatcher, pattern or machine class.'
      );

    case 'store':
      return (
        'This browser would not store your progress just now, so this week will not survive a ' +
        'reload. Nothing has been lost — everything on screen still works.'
      );

    case 'unserialisable':
      /*
       * A bug in this build rather than anything about the player's browser or their library, and
       * the sentence says so. The path that names the offending field stays in `failure.path`,
       * where a developer will find it; putting it here would be the diagnostic-on-a-ribbon this
       * module exists to refuse.
       */
      return (
        'Something in this session could not be written to storage, so your progress is not being ' +
        'kept. That is a fault in this build rather than anything you did. Nothing has been lost — ' +
        'everything on screen still works, but the week will not survive a reload.'
      );
  }
}
