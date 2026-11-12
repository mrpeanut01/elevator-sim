/**
 * **Saving a dispatcher of your own** — the pure half of the workshop's shelf.
 *
 * `everyday/host.ts` is the non-test caller of every export here: its `saveWorkingDispatcher`,
 * `duplicateSavedDispatcher` and `workingDispatcherStatus` are what the dispatcher workshop's
 * Save, Save as a copy, Duplicate and *unsaved changes* line are wired to.
 *
 * ## What a save holds
 *
 * Everything the workshop lets a player build: the working copy's weights, flags and family moves,
 * the group levers as they stand, the traffic-pattern switching and the rule rows. That is
 * `dev/state.ts#drivingProfileOf`'s own chain without the campaign kit, on purpose — a saved
 * dispatcher that dispatched differently from the run the player had just watched would be a save
 * of something else. The kit is left out because it is hardware bought for one campaign week, not
 * part of a design.
 *
 * The Engineer editor's *Save as new* writes the working copy and the levers and leaves the rules
 * and the switching behind with the session. This one carries them, because a player who wrote a
 * rule and pressed Save has been told the rule is part of what they made.
 */

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { profileFromSpec, type DispatcherSpec, type GroupLevers } from './dispatcherSpec.js';
import { profileWithRules, type RuleRow } from './ruleSpec.js';
import { profileWithSelector, type SelectorContext, type SelectorSpec } from './selectorSpec.js';

/** Everything the workshop holds about the dispatcher being built. */
export interface BuiltDispatcher {
  readonly spec: DispatcherSpec;
  readonly levers: GroupLevers;
  readonly selector: SelectorSpec;
  readonly rows: readonly RuleRow[];
}

/**
 * The profile a save writes.
 *
 * `context` is the shipped file's detector and map, against which the working copy's
 * pattern-to-priorities choices are compared: only the ones that differ are written.
 *
 * `base` is the profile the working copy was read from, so a field no workshop control draws —
 * `auction.rounds`, a reassignment budget — survives the save instead of resetting to the
 * resolver's default (`profileFromSpec`'s own argument for the option).
 */
export function builtProfileOf(
  built: BuiltDispatcher,
  id: string,
  base: DispatcherProfile | undefined,
  context: SelectorContext,
): DispatcherProfile {
  return profileWithRules(
    profileWithSelector(
      profileFromSpec(built.spec, { id, levers: built.levers, ...(base === undefined ? {} : { base }) }),
      built.selector,
      // With the context, so the dispatcher's own pattern-to-priorities entries are written onto
      // it rather than left with the session's library — a save that dropped them would be a
      // save of a different dispatcher from the one the player had been running.
      context,
    ),
    built.rows,
  );
}

/** Key-order-insensitive JSON, so two documents with the same content compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, held]) => held !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Whether two profiles are the same document — the question *would saving change anything*.
 *
 * Asked of the profile a save **would** write against the one already on the shelf, rather than of
 * the editors' four working copies one at a time, so the answer cannot disagree with the save: a
 * lever that bakes nothing new into the profile is not an unsaved change, and one that does is.
 */
export function sameProfile(a: DispatcherProfile, b: DispatcherProfile): boolean {
  return canonical(a) === canonical(b);
}

/**
 * The next free version of a name — `Patience`, then `Patience v2`, `Patience v3`.
 *
 * GAMEPLAY § 11.1's rule for *save as a copy*. A name already ending in a version is counted on
 * from its stem, so a copy of `Patience v2` is `Patience v3` and never `Patience v2 v2`. The
 * comparison is `dev/dispatcherEditor.ts#saveNameRefusalOf`'s — trimmed, case-insensitive — so a
 * name this returns is one that function accepts.
 */
export function versionedNameOf(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((other) => other.trim().toLowerCase()));
  const trimmed = name.trim() === '' ? 'My dispatcher' : name.trim();
  if (!used.has(trimmed.toLowerCase())) return trimmed;
  const stem = trimmed.replace(/\s+v\d+$/i, '');
  for (let version = 2; ; version += 1) {
    const candidate = `${stem} v${String(version)}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
