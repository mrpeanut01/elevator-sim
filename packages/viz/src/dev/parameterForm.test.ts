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
  APPLIED_SCHEMAS,
  appliedNoteFor,
  collectFormSource,
  crowdingFromCandidate,
  demandFromCandidate,
  formStatusLine,
  isAppliedSchema,
  movedFromDefault,
  patienceFromCandidate,
  runnerTunablesFromCandidate,
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

  it('names four applied schemas, and every one is a schema core actually declares', () => {
    // Derived rather than asserted against a literal: if `core` renames an export, the picker's
    // entry moves with it and this fails on the same commit instead of the branch going quiet.
    const declared = [...discoverParameterSchemas().keys()];
    for (const name of APPLIED_SCHEMAS) expect(declared).toContain(name);
    expect(APPLIED_SCHEMAS).toHaveLength(4);
  });

  it('tells a reader outright that the other schemas change nothing', () => {
    for (const name of discoverParameterSchemas().keys()) {
      if (isAppliedSchema(name)) continue;
      const note = appliedNoteFor(name);
      expect(note, `${name} draws no refusal`).toContain('NOT APPLIED');
      // The claim has to be checkable by the reader on the spot, which means naming the button and
      // saying what pressing it will do — not "not yet routed", which is what `docs/10` said in a
      // document nobody on this screen is reading.
      expect(note).toContain('Run this shift');
      expect(note).toContain('byte for byte');
      for (const applied of APPLIED_SCHEMAS) expect(note).toContain(applied);
    }
  });

  it('and says the opposite on every source where the opposite is true', () => {
    /*
     * **§ D227, which is the half of this defect class that does real damage.** A stale refusal is
     * worse than a dead seam: it tells the reader not to touch a control that works. So the note
     * for an applied source may not carry the refusal's words, and this runs over the whole set
     * rather than over the one name somebody remembered.
     */
    for (const name of APPLIED_SCHEMAS) {
      const note = appliedNoteFor(name);
      expect(note, `${name} draws no applied note`).toContain('APPLIED');
      expect(note, `${name} still says NOT APPLIED`).not.toContain('NOT APPLIED');
      expect(note, `${name} does not say what to press`).toContain('Run this shift');
      expect(note, `${name} still promises a byte-identical day`).not.toContain('byte for byte');
    }
  });

  it('says how to read the patience note’s own consequence', () => {
    const note = appliedNoteFor('PATIENCE_PARAMETERS');
    // Abandonment improves AWT by construction, so the note that makes the control reachable is
    // also the note that has to say how to read it — CLAUDE.md's *beside the mean, never folded
    // into it*, at the one screen that can now switch it on.
    expect(note).toContain('abandoned');
    expect(note).toContain('suppressed');
  });

  it('names, on the traffic note itself, the rows it does not apply', () => {
    /*
     * A source that applies *some* of its rows is the shape a blanket sentence gets wrong in both
     * directions, and `appliedNoteFor`'s own docstring says why each of the four is refused. The
     * note has to carry the count a reader can check against the picker's refusal list.
     */
    const note = appliedNoteFor('TRAFFIC_PARAMETERS');
    expect(note).toContain('eight');
    expect(note).toContain('NOT applied');
    expect(note).toContain('nineteen');
  });

  it('decodes the schema’s own default as “nobody leaves”', () => {
    /*
     * `sim.patience.distribution` defaults to `none`, and `sim/patience.ts` is explicit that an
     * absent block is what makes a run byte-identical to one produced before patience existed. A
     * form that opened on a curve would put an unstated behaviour into every run in the product.
     */
    expect(patienceFromCandidate(candidateFor('PATIENCE_PARAMETERS'))).toBeNull();
  });

  it('decodes an exponential curve, and drops the field that schema says is inert', () => {
    const curve = patienceFromCandidate(
      candidateFor('PATIENCE_PARAMETERS', {
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
      candidateFor('PATIENCE_PARAMETERS', {
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

/**
 * **The absent-key discipline, and the three decoders that keep it** — the parity assessment's § 4.
 *
 * `candidateOf` returns every *active* row, defaults included, so the danger of routing a schema is
 * not that the wire fails but that it succeeds too well: a form nobody has touched would write a
 * full record onto the config, and every default in it would stop being a default and start being a
 * pinned value chosen by a screen the player never opened. `core` refuses that shape in as many
 * words — `traceConfigFor` spreads each demand field or omits it, *"never `?? <a default of this
 * file's own>`"* — and these cases are what stop the viewer restating the rule instead of keeping
 * it.
 *
 * **That the three reach a run is `scope/scope.test.ts`'s business, not this file's**, exactly as
 * it already is for `patience`: `viewer.paramDemand`, `viewer.lobbyCrowding` and
 * `viewer.runnerTunables` each move the legs there. Legs are the only evidence this repository
 * accepts for *a control is not inert* (§ D177), and restating it here would be a second answer.
 */
describe('the day-shaping schemas decode, and an untouched form decodes to nothing', () => {
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

  it('reports nothing moved on a form at its declared defaults, in every applied source', () => {
    for (const name of APPLIED_SCHEMAS) {
      expect(movedFromDefault(name, candidateFor(name)).size, `${name} moved at rest`).toBe(0);
    }
  });

  it('reports exactly the row that moved, and reads the default off core rather than a literal', () => {
    const moved = movedFromDefault(
      'CROWDING_PARAMETERS',
      candidateFor('CROWDING_PARAMETERS', { 'sim.lobbyCrowding.factorPerPerson': 0.05 }),
    );
    expect([...moved.keys()]).toEqual(['sim.lobbyCrowding.factorPerPerson']);
  });

  it('decodes an untouched traffic form to null, so the profiles keep deciding', () => {
    expect(demandFromCandidate(candidateFor('TRAFFIC_PARAMETERS'))).toBeNull();
  });

  it('decodes only the traffic rows that moved', () => {
    const demand = demandFromCandidate(
      candidateFor('TRAFFIC_PARAMETERS', {
        'traffic.demandLevel': 'max',
        'traffic.interfloorWeighting': 'uniform',
      }),
    );
    // `maxLegs`, `credentialAssignment` and `batchSharesDestination` are untouched and therefore
    // absent, not present-at-their-default: an absent key means *the profile decides* and a present
    // one means *this screen decided*, and they are different claims to `core`.
    expect(demand).toEqual({ demandLevel: 'max', interfloorWeighting: 'uniform' });
  });

  it('refuses an enumerated traffic value core does not declare', () => {
    // `requireOneOf`'s own measurement: `interfloorWeighting: 'bogus'` produced 719 legs, silently
    // `population`, because the read is `=== 'uniform' ? … : …`. A cast here would put that back.
    expect(
      demandFromCandidate(
        new Map<string, ParameterValue>([['traffic.interfloorWeighting', 'bogus']]),
      ),
    ).toBeNull();
  });

  it('never carries the two demand fields the day’s event owns', () => {
    /*
     * The ordering argument in `shiftRunConfigOf` rests on this: `paramDemand` is merged after the
     * event patch and the calendar, which is safe only because the key sets are disjoint. Both of
     * those write `directionalSplit` and one writes `arrivalRatePctPop5min`, and both ids declare
     * `default: null`, so `collectFormSource`'s `nullDefault: 'exclude'` keeps them out of the
     * controls entirely. The day one of them acquires a default is the day a fire drill's demand
     * could be taken away by a slider, and this is what fails then.
     */
    const source = collectFormSource('TRAFFIC_PARAMETERS');
    if (!source.ok) throw new Error(source.reason);
    for (const id of ['traffic.arrivalRatePctPop5min', 'traffic.directionalSplit.incoming']) {
      expect(source.space.unsearchable.has(id), `${id} now draws a control`).toBe(true);
    }
  });

  it('decodes an untouched crowding form to null — no block, not an inert one', () => {
    // `SimulationConfig.lobbyCrowding`: absent means *a lobby's size does not affect how fast it
    // loads*, which is what every run this repository has published assumed. A block of zeroes
    // would be a different claim about the same run.
    expect(crowdingFromCandidate(candidateFor('CROWDING_PARAMETERS'))).toBeNull();
  });

  it('decodes the crowding block whole the moment one row moves', () => {
    // All three or none, because `DoorCrowdingConfig` requires every field. The two untouched rows
    // travel at their declared defaults, which `CROWDING_PARAMETERS` says are *"the value that
    // makes the term inert"* — so a block built from one moved row is the term asked for and
    // nothing more.
    expect(
      crowdingFromCandidate(
        candidateFor('CROWDING_PARAMETERS', {
          'sim.lobbyCrowding.thresholdPersons': 8,
          'sim.lobbyCrowding.factorPerPerson': 0.04,
          'sim.lobbyCrowding.maxFactor': 2.5,
        }),
      ),
    ).toEqual({ thresholdPersons: 8, factorPerPerson: 0.04, maxFactor: 2.5 });
  });

  it('refuses a crowding ceiling below one rather than handing it to the run', () => {
    // *"A crowded lobby that boards faster than an empty one inverts the loop this exists to
    // model."* The schema's range starts at 1, so no control can produce this; the guard keeps
    // that true of a schema change rather than of today's schema.
    expect(
      crowdingFromCandidate(
        new Map<string, ParameterValue>([
          ['sim.lobbyCrowding.thresholdPersons', 5],
          ['sim.lobbyCrowding.factorPerPerson', 0.1],
          ['sim.lobbyCrowding.maxFactor', 0.5],
        ]),
      ),
    ).toBeNull();
  });

  it('decodes an untouched runner form to null, so SIM_DEFAULTS keeps deciding', () => {
    expect(runnerTunablesFromCandidate(candidateFor('SIM_PARAMETERS'))).toBeNull();
  });

  it('decodes only the runner rows that moved, and never the one the schema gates off', () => {
    const tunables = runnerTunablesFromCandidate(
      candidateFor('SIM_PARAMETERS', { 'sim.doorObstructionProbability': 0.2 }),
    );
    expect(tunables).toEqual({ doorObstructionProbability: 0.2 });
    // `sim.assignedWalkS` is `activeWhen` two `DISPATCH_PARAMETERS` rows this space does not hold,
    // so `candidateOf` omits it. That is the schema's own statement that the field is inert here,
    // and substituting a number for it would be this file inventing a value `core` refuses to read.
    expect(
      candidateFor('SIM_PARAMETERS').has('sim.assignedWalkS'),
      'sim.assignedWalkS is no longer gated off in a single-schema space',
    ).toBe(false);
  });

  it('agrees with the shell about which sources are applied', () => {
    // One set read in two places: `dev/main.ts` branches on `isAppliedSchema` and the note is
    // drawn from the same constant, so the sentence and the branch cannot disagree — which is the
    // failure mode this whole tab was an instance of.
    for (const name of discoverParameterSchemas().keys()) {
      expect(isAppliedSchema(name)).toBe(APPLIED_SCHEMAS.includes(name));
    }
  });
});
