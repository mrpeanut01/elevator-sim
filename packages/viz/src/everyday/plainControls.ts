/**
 * **A plain name for every setting the workshop draws at *Detailed*.**
 *
 * `everyday/workshopScreen.ts#familyNodes` is the non-test caller. The schema-generated controls
 * it mounts are the Engineer shell's, and they label a setting with the simulator's own field name
 * — `batchWindowS`, `maxReassignmentsPerCall`. That is the right label at Engineer depth, where
 * a reader is matching the page against a profile, and the wrong one at Detailed, which is offered
 * to someone who has never seen a profile.
 *
 * ## Where the words come from, in order
 *
 * 1. **`core`'s own `player` words**, where the schema row carries them (`PlayerControlWords`,
 *    GitHub issue #147): an authored name and a one-clause effect, beside the id they describe.
 * 2. **Otherwise the field name, spelled out.** Not a second authored table — a table here would
 *    be a copy of the schema that goes stale the day a setting lands. The field name is split at
 *    its capitals and its unit suffix is written as a word, so `batchWindowS` reads
 *    *Batch window, seconds*. It says nothing the id does not; it only stops the id looking like
 *    code. The help line stays the schema's own description in that case.
 *
 * Total: an id this build's schema does not declare is spelled out the same way.
 */

import { dispatchParameter } from '@elevator-sim/core/browser';

/** A unit a field name ends in, as the word it stands for. */
const UNIT_SUFFIX: Readonly<Record<string, string>> = Object.freeze({
  S: 'seconds',
  M: 'metres',
  Kg: 'kilograms',
  Pct: 'percent',
});

/** Abbreviations a field name uses, as the words they stand for. */
const SPELLED: Readonly<Record<string, string>> = Object.freeze({
  max: 'maximum',
  min: 'minimum',
});

/** The last segment of a dotted id, split at its capitals: `batchWindowS` → `batch`, `Window`, `S`. */
function wordsOf(id: string): string[] {
  const field = id.slice(id.lastIndexOf('.') + 1);
  return field.split(/(?=[A-Z])/u).filter((word) => word.length > 0);
}

/** The field name spelled out: *Batch window, seconds*. */
export function spelledOutNameOf(id: string): string {
  const words = wordsOf(id);
  if (words.length === 0) return id;
  // A two-letter unit (`Kg`, `Pct`) is one split word; `S` and `M` are one letter. Only a final
  // word is ever a unit — `maxDwellS` ends in seconds, `minSpeedFpm` is not this function's to guess.
  const last = words.at(-1) ?? '';
  const unit = words.length > 1 ? UNIT_SUFFIX[last] : undefined;
  const body = (unit === undefined ? words : words.slice(0, -1))
    .map((word) => word.toLowerCase())
    .map((word) => SPELLED[word] ?? word)
    .join(' ');
  const sentence = body.charAt(0).toUpperCase() + body.slice(1);
  return unit === undefined ? sentence : `${sentence}, ${unit}`;
}

/** What a setting is called, and what moving it does, in words for a reader who has seen no profile. */
export interface PlainControlWords {
  readonly name: string;
  /** The authored one-clause effect, or `undefined` where only the schema's description exists. */
  readonly effect: string | undefined;
}

/** The plain words for a declared setting — see the module docstring for the two sources. */
export function plainControlWordsOf(id: string): PlainControlWords {
  const player = dispatchParameter(id)?.player;
  if (player !== undefined) {
    const name = player.name.charAt(0).toUpperCase() + player.name.slice(1);
    return Object.freeze({ name, effect: player.effect });
  }
  return Object.freeze({ name: spelledOutNameOf(id), effect: undefined });
}
