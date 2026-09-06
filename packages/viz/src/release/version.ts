/**
 * **Which build this is** — GitHub issue #246, [§ D501](../../../../DECISIONS.md).
 *
 * A bug report against a deployed site used to arrive with no way of saying which commit produced
 * it: the page carried no version, a saved recording carried a schema number and nothing else, and
 * the reader had to guess from the date. This module is the one place the answer lives. The bundler
 * substitutes {@link BUILD_VERSION} at build time (`vite.config.ts#buildVersion`: the deploy
 * workflow's `ELEVATOR_SIM_BUILD_VERSION`, else `git rev-parse --short=10 HEAD`), and two readers
 * draw it — the build-information panel on Settings, and `record/recordRun.ts`, which stamps every
 * recording with it so a file that comes back in a report says what made it.
 *
 * ## Why a commit and not a number
 *
 * A version number is a promise somebody has to keep, and nothing in this tree bumps one. A commit
 * is a fact the repository already holds, it is what `RELEASE_NOTES.md` is keyed by, and it is what
 * a reader with the tree can check out. The short form is ten characters, which is unambiguous in a
 * tree this size and short enough to read off a phone.
 *
 * ## `unbuilt` is a value, not an absence
 *
 * A tree that was never bundled — a test, a bare `tsc`, a checkout with no `.git` — has no commit
 * to name, and saying so is more useful than saying nothing: a recording stamped `unbuilt` was made
 * by a run outside the shipped bundle, which is itself a fact about where the report came from.
 *
 * ## What this line may not say
 *
 * The panel draws {@link buildVersionLineOf}'s sentence, so it is swept by `honesty/properties.ts`
 * like every other player string: no source filename, no code identifier, no section number. A
 * commit hash is none of those under that instrument, and the sentence around it is plain words.
 */

declare const __BUILD_VERSION__: string | undefined;

/** The value a bundle that names no build carries — see the module note. */
export const UNBUILT = 'unbuilt';

/**
 * The commit this bundle was built from, ten characters, or {@link UNBUILT}.
 *
 * `typeof` first, because a `declare const` the bundler did not substitute is a reference error
 * rather than `undefined`, and a test should read the fallback rather than crash at import.
 */
export const BUILD_VERSION: string =
  typeof __BUILD_VERSION__ === 'string' && __BUILD_VERSION__.length > 0 ? __BUILD_VERSION__ : UNBUILT;

/** The sentence the build-information panel draws, in the player's words. */
export function buildVersionLineOf(version: string): string {
  if (version === UNBUILT) {
    return 'This copy was not built for release, so it has no build number to show.';
  }
  return `Build ${version}. Quote it if you report something; the release notes are keyed by it.`;
}
