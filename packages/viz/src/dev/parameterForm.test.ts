/**
 * The two glossary terms this form is the only producer of — GitHub issue #22.
 *
 * ## Why this file exists
 *
 * `mode/glossary.ts` defines **dead gate** and **authorable**, and holds every term to its
 * *attached to something real* clause — a definition whose `term` no shipped source prints is red
 * there, so neither can rot silently. What that clause cannot see is the other direction: a term
 * that is defined, attached, and reaches **no screen**, because the surface that prints the word
 * never asks for its definition.
 *
 * `parameterForm.ts#formStatusLine` and `controls/editedProfile.ts` are the only producers of
 * either word in the tree, so until `draw` called `glossaryFor` on the line it had just built, both
 * definitions were unreachable copy — the shape the standing requirement is written about, arriving
 * in a vocabulary module instead of in a behaviour.
 *
 * ## What this can assert and what it deliberately cannot
 *
 * `docs/16` S9's tiers: this is the **static** end. `mountParameterForm` needs a document and this
 * package has none, so what is checked here is the pure pair the mount composes —
 * `glossaryFor(formStatusLine(…))` — and not that the nodes reach the page. That limit is stated
 * rather than papered over: the mount's own line is `glossaryFor([line])` over the same `line` it
 * assigns to `status.textContent`, which is as close as this tier gets to the screen.
 */

import { describe, expect, it } from 'vitest';

import { collectSearchSpace } from '@elevator-sim/experiments/browser';

import { controlsFor, defaultValues } from '../controls/controls.js';
import { glossaryFor, GLOSSARY_TERMS } from '../mode/glossary.js';

import { formStatusLine } from './parameterForm.js';

/** The shipped dispatcher space, which is what the form opens on. */
function statusLine(): string {
  const space = collectSearchSpace();
  const values = defaultValues(space);
  return formStatusLine(space, controlsFor(space, values), values);
}

describe('the status line reaches the vocabulary that defines it', () => {
  it('carries both words the glossary defines for it, and nothing else defines', () => {
    /*
     * The sentence is `… authorable as a dispatcher profile, and it has no dead gate. Authorability
     * is a schema check …`. Asserted through `glossaryFor` rather than by searching the string,
     * because what is being checked is that the **vocabulary** answers for this line — a substring
     * check would pass on a glossary that had never heard of either word.
     */
    const terms = glossaryFor([statusLine()]).map((entry) => entry.id);
    expect(terms, 'the form’s own status line reaches no glossary term at all').not.toEqual([]);
    for (const id of ['dead-gate', 'authorable']) {
      expect(terms, `the status line prints "${id}" and the glossary is not asked about it`).toContain(id);
    }
  });

  it('is not vacuous — the glossary really can answer nothing', () => {
    // Without this, the assertion above would pass on a `glossaryFor` that returned every term for
    // every input, which is the shape a matcher bug takes.
    expect(glossaryFor(['nothing in this sentence is a term of art'])).toEqual([]);
    expect(glossaryFor([])).toEqual([]);
  });

  it('leads and never replaces — the line is what it was', () => {
    /*
     * § D240's rule 3, and § D277's restatement of it: the plain language goes **beside** the
     * sentence. `glossaryFor` is pure and returns entries by reference, so the only way the form
     * could rewrite its own line is by composing new copy — which the mount does not do, and which
     * this pins by requiring the line to survive being read.
     */
    const before = statusLine();
    void glossaryFor([before]);
    expect(statusLine()).toBe(before);
  });

  it('hands back the glossary’s own entries rather than copies', () => {
    // The mount deduplicates by `id` for exactly this reason — identity holds today and would stop
    // holding silently the day a producer maps over the table.
    for (const entry of glossaryFor([statusLine()])) {
      expect(GLOSSARY_TERMS).toContain(entry);
    }
  });
});
