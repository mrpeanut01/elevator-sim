/**
 * **Scope-note coverage, in both directions** — `docs/21` § 3.5, GitHub issue #104's second half.
 *
 * ## What this adds that `scopeNotes.test.ts` does not
 *
 * That file asserts the notes it knows about are drawn and say the right thing. It is a very good
 * test and it cannot answer the question this one is for: *is every block that needs a note getting
 * one?* Its subject is a list somebody wrote, so a block added tomorrow with no note is invisible to
 * it — and a block that lost its note between waves is only caught if the list happened to name it.
 *
 * It had already happened. `dev/ruleEditor.ts` has carried a gated `next-run` note since the
 * Everyday rules landed and **no test drove it**: not `scopeNotes.test.ts`, whose five mounts do not
 * include the rule editor, and not `ruleEditor.test.ts`, which is about the rows. The note was
 * correct. Nothing said so, and nothing would have said anything if it had gone.
 *
 * So this is `deadCode.test.ts`'s two-direction allowlist discipline pointed at scope notes, which
 * is what `docs/21` § 3.5 asks for in terms:
 *
 * 1. **Coverage.** The set of keys that need a note is **derived from `scope/surface.ts`** — every
 *    non-`presentation` control and every latent, which is exactly *state consumed only by a later
 *    run* plus *state consumed by no run until a verb files it*. Each derived key is either a
 *    {@link NOTE_SITES} entry or a {@link WITHOUT_A_NOTE} entry with its reason. A key in neither is
 *    red, so **declaring a new writes-only surface without a note goes red**.
 * 2. **No stale sentence.** Every site's claimed commitment is checked against `commitmentOf`'s
 *    current answer, its note is read back out of the shipped mount, and each sentence is counted
 *    over the whole page. Deleting a note is red; re-scoping a field so the mount falls silent is
 *    red; a sentence spreading to a block it is untrue on is red.
 * 3. **The gate is real.** Each site's mount source must contain the `commitmentOf(key, wiring)`
 *    guard, so *the note is drawn iff the table still declares what it claims* is a property of the
 *    code rather than of this file's expectations. § D227's rule needs the guard, not the sentence.
 *
 * ## The failure direction stays silence
 *
 * `docs/21` L-7, and `scope/commitment.ts`'s own paragraph: a withdrawn commitment takes the
 * sentence **off** the screen rather than leaving a false one on it. Nothing here asks a mount to
 * draw a fallback — what it asks is that the table and the screen agree, in both directions, so
 * that silence is loud here rather than quiet on the page.
 *
 * ## Registers, not lists
 *
 * Both registers below are asserted non-stale against `SCOPE_OF` in both directions: an entry for a
 * key the table no longer carries is red, and a key the table carries with no entry is red. A
 * register that may silently grow is decoration, which is the rule `honesty.test.ts#OUTSTANDING`
 * and `deadCode.test.ts` both run on.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COMMITMENTS, commitmentOf, type Commitment, type Wiring } from '../scope/commitment.js';
import { SCOPE_OF } from '../scope/surface.js';
import type { SurfaceKey } from '../scope/types.js';

import { mountBuildingEditor } from './buildingEditor.js';
import { mountDispatcherEditor } from './dispatcherEditor.js';
import { mountMachinesEditor } from './machinesEditor.js';
import { mountRightRail } from './rightRail.js';
import { mountRuleEditor } from './ruleEditor.js';
import { mountSelectorEditor } from './selectorEditor.js';
import { mountTrafficEditor } from './trafficEditor.js';
import type { MountContext } from './mountTypes.js';
import { mountRecorder, type Recorded } from './mountRecorder.test-helper.js';

/** A context that records and does nothing. No mount asks anything of it while being built. */
const inertContext = (): MountContext => ({
  update: () => undefined,
  runShift: () => undefined,
  openTab: () => undefined,
  fail: () => undefined,
});

type Elements = ReturnType<typeof mountRecorder>['elements'];

/**
 * One block that draws a gated scope note.
 *
 * `phrase` is the sentence's own signature rather than the whole of it: the assertion is *this
 * block still says this*, and pinning six hundred characters would make a copy edit red for no
 * reason. `count` is how many blocks in the whole product may carry that phrase — the cross-check
 * that a sentence has not spread to a block where it is untrue, which is `scopeNotes.test.ts`'s own
 * *"the lock wording spread to a block that re-runs the day"* generalised to every commitment.
 */
interface NoteSite {
  readonly key: SurfaceKey;
  /** What the block's own handler does, which is the half `SCOPE_OF` cannot answer. */
  readonly wiring: Wiring;
  /** What {@link commitmentOf} must still return for this pair. */
  readonly commitment: Commitment;
  /** The module that draws it — asserted to contain the guard. */
  readonly module: string;
  readonly mount: (elements: Elements, context: MountContext) => unknown;
  /** The element the note is inserted before. */
  readonly block: (elements: Elements) => unknown;
  readonly phrase: string;
  readonly count: number;
}

/**
 * Every block in the product that draws one, with the commitment it claims.
 *
 * Ten, over seven mounts. The three that re-run are the rail's live lists; the three that wait for
 * the next run are the group levers, the weight-set selector and the Everyday rules; the four
 * drafts are the four editors' working copies.
 */
const NOTE_SITES: readonly NoteSite[] = [
  {
    key: 'viewer.dispatcherId',
    wiring: 'runs-the-shift',
    commitment: 're-runs-now',
    module: './rightRail.ts',
    mount: (elements, context) => mountRightRail(elements.rail, context),
    block: (elements) => elements.rail.dispatcherList,
    phrase: 'does not steer the shift on screen',
    count: 3,
  },
  {
    key: 'viewer.pattern',
    wiring: 'runs-the-shift',
    commitment: 're-runs-now',
    module: './rightRail.ts',
    mount: (elements, context) => mountRightRail(elements.rail, context),
    block: (elements) => elements.rail.trafficList,
    phrase: 'does not steer the shift on screen',
    count: 3,
  },
  {
    key: 'viewer.buildingId',
    wiring: 'runs-the-shift',
    commitment: 're-runs-now',
    module: './rightRail.ts',
    mount: (elements, context) => mountRightRail(elements.rail, context),
    block: (elements) => elements.rail.buildingList,
    phrase: 'does not steer the shift on screen',
    count: 3,
  },
  {
    key: 'viewer.levers',
    wiring: 'writes-only',
    commitment: 'next-run',
    module: './dispatcherEditor.ts',
    mount: (elements, context) => mountDispatcherEditor(elements.dispatcherEditor, context),
    block: (elements) => elements.dispatcherEditor.levers,
    /* Issue #104's own wording, verbatim, because it is exactly right about this block. */
    phrase: 'Locked for this shift: changes apply to your next run',
    count: 2,
  },
  {
    key: 'viewer.selectorSpec',
    wiring: 'writes-only',
    commitment: 'next-run',
    module: './selectorEditor.ts',
    mount: (elements, context) => mountSelectorEditor(elements.selectorEditor, context),
    block: (elements) => elements.selectorEditor.policy,
    phrase: 'Locked for this shift: changes apply to your next run',
    count: 2,
  },
  {
    key: 'viewer.ruleRows',
    wiring: 'writes-only',
    commitment: 'next-run',
    module: './ruleEditor.ts',
    mount: (elements, context) => mountRuleEditor(elements.ruleEditor, context),
    block: (elements) => elements.ruleEditor.rows,
    /*
     * A **third** `next-run` block, and it does not use the other two's wording — which is right
     * rather than an inconsistency to tidy. The other two are settings a run is simulated with; a
     * rule is a mid-day mechanism configured in advance, and *locked for this shift* over it would
     * invite the reading that the rules stop firing. § D227 asks for true, not uniform.
     */
    phrase: 'Rules take effect on your next run',
    count: 1,
  },
  {
    key: 'viewer.dispatcherSpec',
    wiring: 'writes-only',
    commitment: 'draft',
    module: './dispatcherEditor.ts',
    mount: (elements, context) => mountDispatcherEditor(elements.dispatcherEditor, context),
    block: (elements) => elements.dispatcherEditor.terms,
    phrase: 'reaches a run yet',
    count: 4,
  },
  {
    key: 'viewer.patternSpec',
    wiring: 'writes-only',
    commitment: 'draft',
    module: './trafficEditor.ts',
    mount: (elements, context) => mountTrafficEditor(elements.trafficEditor, context),
    block: (elements) => elements.trafficEditor.orderChips,
    phrase: 'reaches a run yet',
    count: 4,
  },
  {
    key: 'viewer.machineSpec',
    wiring: 'writes-only',
    commitment: 'draft',
    module: './machinesEditor.ts',
    mount: (elements, context) => mountMachinesEditor(elements.machinesEditor, context),
    block: (elements) => elements.machinesEditor.rows,
    phrase: 'reaches a run yet',
    count: 4,
  },
  {
    key: 'viewer.buildingSpec',
    wiring: 'writes-only',
    commitment: 'draft',
    module: './buildingEditor.ts',
    mount: (elements, context) => mountBuildingEditor(elements.buildingEditor, context),
    block: (elements) => elements.buildingEditor.rows,
    phrase: 'reaches a run yet',
    count: 4,
  },
];

/**
 * The keys that need no note, each with the reason — the allowlist half.
 *
 * Every reason is about **where the control is**, not about whether a note would be nice. Three
 * shapes, and they are the only three:
 *
 * - *no block*: the field is written by the shell's own machinery or by a run's outcome, not by a
 *   control a reader presses. There is nothing for a note to sit above.
 * - *chrome*: the control is on the Engineer shell's own header, coach ribbon or transport, drawn
 *   by `dev/main.ts` rather than by a mount. A note there is contract work with a home of its own
 *   (`docs/21` § 3.2), not an omission here.
 * - *another product's screen*: the control is in `menu/` or `everyday/`, which no Engineer lane
 *   owns (`docs/21` § 5). The Casual screens carry their own copy register, and a note authored
 *   here would be a second voice on somebody else's screen.
 *
 * A reason that stops being true is not caught by this file — it is prose, and prose is what
 * § D227 rates worst. What *is* caught is the register going stale in either direction, and a key
 * moving into a mount that draws notes: that key's block then has a note nothing declares, and the
 * per-phrase counts below go red.
 */
const WITHOUT_A_NOTE: Readonly<Record<string, string>> = Object.freeze({
  'viewer.windowStartS':
    'chrome — the part-of-day select on the coach ribbon, drawn by dev/main.ts, whose Run is the ' +
    'verb beside it.',
  'viewer.shiftLengthS':
    'chrome — the shift-length select on the coach ribbon, three controls from its own Run button.',
  'viewer.seed':
    'chrome — the seed entry on the provenance line. It carries R7 and § D198’s refusals rather ' +
    'than a scope note: what a reader needs there is that a paste is not truncated.',
  'viewer.freePlay':
    'another product’s screen — Free Play’s own setup form in menu/, whose Start begins a game.',
  'viewer.calendar':
    'no block — the week’s calendar period, written when a week is taken rather than by a control.',
  'viewer.commissioning':
    'another product’s screen — the commissioning board, which is a between-games choice made ' +
    'before a week exists to steer.',
  'viewer.week':
    'no block — the day boundary itself, written by closeShift and by taking a contract.',
  'viewer.patience':
    'chrome — the Parameters tab’s schema-driven form, which draws parameterForm.ts’s own ' +
    'APPLIED/NOT-APPLIED sentence per source. That sentence is the same claim in the form’s own ' +
    'register, and a second one beside it would be two voices on one control.',
  'viewer.outOfServiceCarIds':
    'no block — the badge under a shaft on the stage canvas. The rail’s own note covers the ' +
    'picks; a canvas hit has no element to insert a paragraph before.',
  'viewer.interventions':
    'no block — the stage’s intervention control, which is the product’s one mid-run instrument ' +
    'and says so in live/interventions.ts’s own stamp.',
  'viewer.savedClasses':
    'realised elsewhere — the machines editor’s Save verb. Its note is on viewer.machineSpec, ' +
    'and it is the one save that then reaches a run with no further selection, which that note says.',
  'viewer.savedDispatchers':
    'realised elsewhere — the dispatcher editor’s Save verb, named in viewer.dispatcherSpec’s note.',
  'viewer.savedPatterns':
    'realised elsewhere — the traffic editor’s Save verb, named in viewer.patternSpec’s note.',
  'viewer.savedBuildings':
    'realised elsewhere — the building editor’s Save verb, named in viewer.buildingSpec’s note.',
  'viewer.parkedWeeks':
    'no block — written by withBuilding and withFreePlayWeek when a week is stepped away from.',
  'free-play.buildingId': 'another product’s screen — Free Play’s setup form in menu/.',
  'free-play.dispatcherProfileId': 'another product’s screen — Free Play’s setup form in menu/.',
  'free-play.demandTemplateId': 'another product’s screen — Free Play’s setup form in menu/.',
  'free-play.arrivalRatePctPop5min': 'another product’s screen — Free Play’s setup form in menu/.',
  'free-play.durationS': 'another product’s screen — Free Play’s setup form in menu/.',
  'free-play.windowStartS': 'another product’s screen — Free Play’s setup form in menu/.',
  'free-play.seed': 'another product’s screen — Free Play’s setup form in menu/.',
  'challenge.dispatcherProfileId':
    'another product’s screen — the challenge board in menu/, whose runs are the server’s.',
});

/**
 * The keys a note is owed for, **derived** from the table rather than listed.
 *
 * A `presentation` control moves no leg — `scope.test.ts` decides that by running both arms and
 * comparing them — so there is nothing about a later run to say. An `output` is written by the
 * shell and moved by no control. What is left is exactly *state a run reads*, in its two flavours:
 * a control that reaches a run, and a draft that reaches one once a verb files it.
 */
function keysNeedingANote(): readonly SurfaceKey[] {
  return (Object.keys(SCOPE_OF) as SurfaceKey[]).filter((key) => {
    const commitment = commitmentOf(key, 'writes-only');
    return commitment === 'next-run' || commitment === 'draft';
  });
}

/** The `<p>` a mount inserted beside `node` — `scopeNotes.test.ts`'s own reader. */
const noteBeside = (around: (node: unknown) => readonly Recorded[], node: unknown): string =>
  around(node)
    .filter((sibling) => sibling.tag === 'p' && sibling.id === '')
    .map((sibling) => sibling.textContent)
    .join(' ');

/** Every mount that carries a note, built once, over one page. */
function wholePage(): { readonly around: (node: unknown) => readonly Recorded[]; readonly texts: readonly string[] } {
  const made = mountRecorder();
  const context = inertContext();
  mountRightRail(made.elements.rail, context);
  mountDispatcherEditor(made.elements.dispatcherEditor, context);
  mountSelectorEditor(made.elements.selectorEditor, context);
  mountRuleEditor(made.elements.ruleEditor, context);
  mountTrafficEditor(made.elements.trafficEditor, context);
  mountMachinesEditor(made.elements.machinesEditor, context);
  mountBuildingEditor(made.elements.buildingEditor, context);
  return { around: made.around, texts: made.nodes().map((node) => node.textContent) };
}

const sourceOf = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('every commitment the table declares has a note, or a reason it has none', () => {
  it('classifies every key that needs one, and neither register carries a key the table dropped', () => {
    const needed = [...keysNeedingANote()].sort();
    const claimed = [
      ...new Set([...NOTE_SITES.map((site) => site.key), ...Object.keys(WITHOUT_A_NOTE)]),
    ].sort();
    expect(
      claimed,
      'a writes-only or latent surface was declared with neither a scope note nor a stated reason ' +
        'for having none — see docs/21 § 3.5',
    ).toEqual(needed);
  });

  it('registers no key twice — a block cannot both have a note and be excused one', () => {
    const sited = new Set(NOTE_SITES.map((site) => site.key));
    const excused = Object.keys(WITHOUT_A_NOTE).filter((key) => sited.has(key as SurfaceKey));
    expect(excused, 'these keys are in both registers').toEqual([]);
  });

  it('is not a vacuous derivation — the table really does carry both flavours', () => {
    // Without this, a `commitmentOf` that started returning `undefined` would make every assertion
    // above pass over an empty set, which is the shape `deadCode.test.ts` calls a guard watching
    // nothing.
    const needed = keysNeedingANote();
    expect(needed.length).toBeGreaterThan(20);
    expect(needed.filter((key) => commitmentOf(key, 'writes-only') === 'draft').length).toBe(8);
  });

  it('excuses nothing that a note-carrying mount actually writes', () => {
    /*
     * The half of the allowlist that is not prose. Every reason above says the control is somewhere
     * else — the shell's chrome, another product's screen, or nowhere. `SCOPE_OF`'s `latent` arm
     * names the key that realises a draft, so the four `saved*` keys are excused *by* a note rather
     * than in spite of one, and that is checkable: each names a `realisedBy` whose own key is a
     * note site.
     */
    for (const [key, reason] of Object.entries(WITHOUT_A_NOTE)) {
      if (!reason.startsWith('realised elsewhere')) continue;
      const draft = NOTE_SITES.find((site) => {
        const entry = SCOPE_OF[site.key as SurfaceKey];
        return entry?.kind === 'latent' && entry.realisedBy === key;
      });
      expect(draft, `${key} claims a draft's note covers it, and no draft names it`).toBeDefined();
    }
  });
});

describe('every note a mount draws is gated on a commitment the table still declares', () => {
  it.each(NOTE_SITES.map((site) => [`${site.key} · ${site.module}`, site] as const))(
    '%s draws its note, and the table still says what the note claims',
    (_label, site) => {
      // The table's answer has not moved out from under the site's claim.
      expect(
        commitmentOf(site.key, site.wiring),
        `${site.key} is no longer ${site.commitment} — the note above its block is now a claim ` +
          'the table does not make',
      ).toBe(site.commitment);

      // The mount really draws it, read back out of the page it was inserted into.
      const made = mountRecorder();
      site.mount(made.elements, inertContext());
      const note = noteBeside(made.around, site.block(made.elements));
      expect(note, `${site.key}: its block drew no scope note`).toContain(site.phrase);
    },
  );

  it.each(NOTE_SITES.map((site) => [`${site.key} · ${site.module}`, site] as const))(
    '%s guards the sentence on commitmentOf rather than on a comment',
    (_label, site) => {
      /*
       * The gate itself, at the source. A note that were written unconditionally would pass every
       * assertion above and would be a hand-written refusal again the day the field is re-scoped —
       * § D227's shape, in the module written to prevent it. `scope/commitment.ts`'s own contract is
       * that the caller *asks for the answer it expects*, so the expected answer is in the call.
       */
      const source = sourceOf(site.module).replace(/\s+/gu, ' ');
      /*
       * Three parts rather than one literal call, because the two idioms in the tree are both
       * correct. Four editors write the guard inline (`commitmentOf('viewer.levers', 'writes-only')
       * === 'next-run'`); `rightRail.ts` **parameterises** it — one `scopeNote(list, key)` helper
       * over three lists — which is better rather than worse, and a check that only recognised the
       * inline spelling would have pushed the rail towards three copies of one guard.
       */
      expect(source, `${site.module} draws a note for ${site.key} with no commitmentOf guard`)
        .toContain('commitmentOf(');
      expect(source, `${site.module} never names ${site.key}`).toContain(`'${site.key}'`);
      expect(
        source,
        `${site.module} guards on no commitment — a note that cannot fall silent is § D227's defect`,
      ).toContain(`'${site.commitment}'`);
      expect(source, `${site.module} never states the wiring it claims`).toContain(
        `'${site.wiring}'`,
      );
    },
  );

  it('draws each sentence exactly where it is true, counted over the whole page', () => {
    /*
     * The cross-check `scopeNotes.test.ts` runs on the lock wording, generalised: every phrase is
     * counted over every note-carrying mount at once. One too few is a note that has gone; one too
     * many is a sentence that has spread to a block it is untrue on, which § D227 rates worse than
     * a missing one.
     */
    const built = wholePage();
    for (const phrase of new Set(NOTE_SITES.map((site) => site.phrase))) {
      const expected = NOTE_SITES.find((site) => site.phrase === phrase)?.count ?? 0;
      const drawn = built.texts.filter((text) => text.includes(phrase));
      expect(drawn, `“${phrase}” is drawn on ${String(drawn.length)} blocks, not ${String(expected)}`)
        .toHaveLength(expected);
    }
  });

  it('declares a count for every site, and the counts agree with the sites', () => {
    // The register's own arithmetic: a phrase shared by three sites must declare `count: 3`, so the
    // count cannot be quietly widened to make a spreading sentence pass.
    for (const phrase of new Set(NOTE_SITES.map((site) => site.phrase))) {
      const sites = NOTE_SITES.filter((site) => site.phrase === phrase);
      for (const site of sites) {
        expect(site.count, `${site.key}'s count disagrees with how many sites share its phrase`)
          .toBe(sites.length);
      }
    }
  });

  it('claims only commitments the vocabulary has, and never the presentation one', () => {
    /*
     * `shown-only` is the fourth `Commitment` and no site may claim it: it is what a *presentation*
     * control gets, and a presentation control moves no leg, so a note about what a later run will
     * do would be a sentence about nothing. The derivation above excludes them by construction;
     * this asserts the registers agree with the derivation rather than merely not contradicting it.
     */
    for (const site of NOTE_SITES) {
      expect(COMMITMENTS).toContain(site.commitment);
      expect(site.commitment, `${site.key} claims shown-only`).not.toBe('shown-only');
    }
  });
});
