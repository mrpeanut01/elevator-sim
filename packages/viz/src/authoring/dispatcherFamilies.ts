/**
 * **The shelves the dispatcher workshop groups the library under** — `data/dispatcher-families.json`.
 *
 * `everyday/workshopScreen.ts` is the non-test caller: it hands {@link DISPATCHER_FAMILIES} to
 * `everyday/workshopModel.ts#shelfOf`, which draws one shelf per family.
 *
 * ## Why this is data, and why it is not in `data/dispatcher-profiles.json`
 *
 * Data, for `core`'s `PlayStyle`'s reason: a table in a screen mapping profile ids to a heading
 * goes stale the day a profile is added, and which design sits with which is a fact about the
 * library rather than about a renderer.
 *
 * A file of its own, because the profiles document is not only a library — the whole of it is
 * `SimulationConfig.dispatcherProfiles`, so it is part of what every run is a function of, and
 * `fixit/morningsInput.ts` digests it into the shipped as-built mornings. A `families` block was
 * put there first and moved every one of those digests on a change that could not move a single
 * decision. A shelf heading is presentation; it does not belong in a run's identity.
 *
 * ## Imported, not fetched
 *
 * `fixit/asBuiltMornings.ts`'s shape: the document is bundled with the code that reads it, so the
 * shelf cannot be drawn against a different version of itself, and there is no load to fail.
 * {@link parseDispatcherFamilies} still refuses a malformed document by name, because the file is
 * edited by hand.
 */

import shippedDocument from '../../../../data/dispatcher-families.json' with { type: 'json' };

/** One named shelf of dispatchers. */
export interface DispatcherFamily {
  /** Stable key. Never rendered. */
  readonly id: string;
  /** The heading a player reads. */
  readonly name: string;
  /** One plain sentence about what the family's designs share. Never a claim of quality. */
  readonly line: string;
  /** The profiles shelved here, in the order they are drawn. */
  readonly profileIds: readonly string[];
}

/** The blurbs' own bound (`DECISIONS.md` § D186): past it, a line is maintainer prose on a player surface. */
const LINE_MAX = 160;

/**
 * Read the families document, refusing every way a hand edit can get it wrong.
 *
 * Whether a `profileIds` entry names a shipped profile is **not** checked here — this module does
 * not read the profile library — and is held for the shipped pair by `dispatcherFamilies.test.ts`.
 * `shelfOf` draws nothing for an id the library does not declare: an absence, not a stand-in.
 */
export function parseDispatcherFamilies(raw: unknown): readonly DispatcherFamily[] {
  const fail = (what: string): never => {
    throw new Error(`data/dispatcher-families.json is not a usable document: ${what}`);
  };
  if (typeof raw !== 'object' || raw === null) return fail('it is not an object');
  const families = (raw as { readonly families?: unknown }).families;
  if (!Array.isArray(families)) return fail('"families" is not a list');
  const seen = new Set<string>();
  const shelved = new Set<string>();
  return Object.freeze(
    families.map((entry: unknown, index): DispatcherFamily => {
      const at = `families[${String(index)}]`;
      if (typeof entry !== 'object' || entry === null) return fail(`${at} is not an object`);
      const { id, name, line, profileIds } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || id === '') return fail(`${at}.id is not a non-empty string`);
      if (seen.has(id)) return fail(`two families share the id "${id}"`);
      seen.add(id);
      if (typeof name !== 'string' || name.trim() === '') return fail(`${at}.name is empty`);
      if (typeof line !== 'string' || line.trim() === '' || line.length > LINE_MAX) {
        return fail(`${at}.line must be 1 to ${String(LINE_MAX)} characters`);
      }
      if (!Array.isArray(profileIds) || profileIds.length === 0) {
        return fail(`${at}.profileIds shelves nothing`);
      }
      const ids = profileIds.map((profileId: unknown): string => {
        if (typeof profileId !== 'string' || profileId === '') {
          return fail(`${at}.profileIds holds something that is not an id`);
        }
        if (shelved.has(profileId)) return fail(`"${profileId}" is on two shelves`);
        shelved.add(profileId);
        return profileId;
      });
      return Object.freeze({ id, name, line, profileIds: Object.freeze(ids) });
    }),
  );
}

/** The shipped shelves, parsed once at load. */
export const DISPATCHER_FAMILIES: readonly DispatcherFamily[] = parseDispatcherFamilies(shippedDocument);
