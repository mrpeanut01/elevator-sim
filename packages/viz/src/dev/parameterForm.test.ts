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

import { collectSearchSpace, discoverParameterSchemas } from '@elevator-sim/experiments/browser';
import type { ParameterValue } from '@elevator-sim/experiments/browser';

import { candidateOf, controlsFor, defaultValues } from '../controls/controls.js';
import { glossaryFor, GLOSSARY_TERMS } from '../mode/glossary.js';

import {
  APPLIED_SCHEMA,
  appliedNoteFor,
  collectFormSource,
  formStatusLine,
  patienceFromCandidate,
} from './parameterForm.js';

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

/**
 * **The tab says what it does to a run, and one schema now does something** — the UI readiness
 * audit's B4.
 *
 * The finding was that 114 live controls over 12 schemas bound nothing: `ParameterFormHandle`'s
 * `candidate()` was the only route out of the form and no shipped file called it, so a player could
 * set `sim.patience.meanS` to 120, press Run, and get the same day back byte for byte. The status
 * line above — *"41 dimensions, 41 live — authorable as a dispatcher profile"* — is a true sentence
 * about a search space that reads like a claim about the Run button.
 *
 * Two halves are asked here and the third is asked elsewhere on purpose:
 *
 * 1. **The sentence** — every source draws a note, and it says the right one.
 * 2. **The conversion** — `patienceFromCandidate` over candidates built by the shipped
 *    `collectFormSource` / `candidateOf` pair, so what is decoded is what the form actually holds.
 * 3. **That it reaches a run** is `scope/scope.test.ts`'s `viewer.patience moves the legs`, which
 *    compares the legs of two states. That is the only evidence this repository accepts for *a
 *    control is not inert* (§ D177), and it is deliberately not restated here.
 */
describe('what the Parameters tab does to a run, said on the tab', () => {
  /** The candidate the form publishes for a source, built the way the mount builds it. */
  function candidateFor(
    sourceName: string,
    edits: Readonly<Record<string, ParameterValue>> = {},
  ): ReadonlyMap<string, ParameterValue> {
    const source = collectFormSource(sourceName);
    if (!source.ok) throw new Error(`${sourceName} does not collect: ${source.reason}`);
    const values = new Map(defaultValues(source.space));
    for (const [id, value] of Object.entries(edits)) values.set(id, value);
    return candidateOf(source.space, values);
  }

  it('names one applied schema, and it is one core actually declares', () => {
    // Derived rather than asserted against a literal: if `core` renames the export, the picker's
    // entry moves with it and this fails on the same commit instead of the branch going quiet.
    expect([...discoverParameterSchemas().keys()]).toContain(APPLIED_SCHEMA);
  });

  it('tells a reader outright that the other schemas change nothing', () => {
    for (const name of discoverParameterSchemas().keys()) {
      if (name === APPLIED_SCHEMA) continue;
      const note = appliedNoteFor(name);
      expect(note, `${name} draws no refusal`).toContain('NOT APPLIED');
      // The claim has to be checkable by the reader on the spot, which means naming the button and
      // saying what pressing it will do — not "not yet routed", which is what `docs/10` said in a
      // document nobody on this screen is reading.
      expect(note).toContain('Run this shift');
      expect(note).toContain('byte for byte');
      expect(note).toContain(APPLIED_SCHEMA);
    }
  });

  it('and says the opposite where the opposite is true', () => {
    const note = appliedNoteFor(APPLIED_SCHEMA);
    expect(note).toContain('APPLIED');
    expect(note).not.toContain('NOT APPLIED');
    // Abandonment improves AWT by construction, so the note that makes the control reachable is
    // also the note that has to say how to read it — CLAUDE.md's *beside the mean, never folded
    // into it*, at the one screen that can now switch it on.
    expect(note).toContain('abandoned');
    expect(note).toContain('suppressed');
  });

  it('decodes the schema’s own default as “nobody leaves”', () => {
    /*
     * `sim.patience.distribution` defaults to `none`, and `sim/patience.ts` is explicit that an
     * absent block is what makes a run byte-identical to one produced before patience existed. A
     * form that opened on a curve would put an unstated behaviour into every run in the product.
     */
    expect(patienceFromCandidate(candidateFor(APPLIED_SCHEMA))).toBeNull();
  });

  it('decodes an exponential curve, and drops the field that schema says is inert', () => {
    const curve = patienceFromCandidate(
      candidateFor(APPLIED_SCHEMA, {
        'sim.patience.distribution': 'exponential',
        'sim.patience.meanS': 120,
        'sim.patience.minS': 5,
      }),
    );
    // `spreadS` is gated `activeWhen: { distribution: ['uniform'] }`, so `candidateOf` never puts it
    // in the map here — and this decodes what is there rather than substituting a zero, because a
    // number written into a field `core` refuses to read is this file inventing a value.
    expect(curve).toEqual({ distribution: 'exponential', meanS: 120, minS: 5 });
  });

  it('decodes a uniform curve with its spread', () => {
    const curve = patienceFromCandidate(
      candidateFor(APPLIED_SCHEMA, {
        'sim.patience.distribution': 'uniform',
        'sim.patience.meanS': 200,
        'sim.patience.spreadS': 60,
        'sim.patience.minS': 10,
      }),
    );
    expect(curve).toEqual({ distribution: 'uniform', meanS: 200, spreadS: 60, minS: 10 });
  });

  it('refuses a mean core would throw on rather than handing it to the run', () => {
    // `requireValidPatience`: *"a mean patience of zero abandons every rider at the instant they
    // arrive and reports an AWT over nobody"*. The schema's range starts at 1, so no control can
    // produce this — the guard is what keeps that true of a schema change rather than of today's.
    expect(
      patienceFromCandidate(
        new Map<string, ParameterValue>([
          ['sim.patience.distribution', 'exponential'],
          ['sim.patience.meanS', 0],
        ]),
      ),
    ).toBeNull();
  });
});
