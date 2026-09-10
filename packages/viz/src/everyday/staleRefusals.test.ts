/**
 * **Four docstrings that denied a shipped feature, and the paired guard that keeps them honest** —
 * GitHub issue #423.
 *
 * ## Why this file exists rather than another arm of `refusalsAreCurrent.test.ts`
 *
 * That file states its own limit on the record, and the limit is real: *"It cannot decide, in
 * general, whether a refusal names a feature that now exists. **Feature** has no registry; only
 * screens do."* It sweeps the six `*_ABSENCES` arrays, `UNBUILT_REASONS` and `modes.ts`, which is
 * every register a player can read — and the four defects below were in **none** of them. They were
 * in module docstrings, which nothing in this tree reads.
 *
 * The general problem is genuinely undecidable without a feature registry. The specific one is not:
 * for a sentence somebody has already caught, you can name the sentence *and* the thing it denied,
 * and check both. That is all this file does, and it is deliberately a list rather than a rule.
 *
 * ## The shape, and why each case has two halves
 *
 * Every case asserts a sentence is **absent** and the feature it denied is **present**. The second
 * half is what makes it a guard rather than a grep: a check that only looked for the sentence could
 * be satisfied by deleting the feature and putting the refusal back — which would be *correct*
 * then, and this file must not fire on a correct refusal. So the pair says: *this sentence is wrong
 * while this remains true*, and if the feature is ever genuinely removed, the second half goes red
 * and whoever removes it is asked to say so rather than quietly restoring a sentence.
 *
 * The absent halves match **source text**, including comments, which is why this file reads the
 * files itself rather than using `campaignModel.test.ts`'s reader — that one strips comments, and a
 * docstring is nothing but comments.
 *
 * ## `not.toContain` is the wrong predicate here, and finding that out is half the value
 *
 * The first draft asserted each sentence was simply absent, and **three of the five went red on the
 * corrections themselves**. This repository's convention when it retracts a sentence is to quote
 * the retracted wording in the correction — `CLAUDE.md` is written that way throughout, and it is a
 * good convention: a reader who arrives with the old sentence in their head needs to find it and be
 * told it is dead, not find nothing and conclude the document is about something else.
 *
 * So the predicate is **proximity to a retraction**, which is the shape
 * `packages/experiments/src/validation/documentation.test.ts` already uses for the refuted
 * access-control mechanism: *the claim may not appear without a refutation within N characters of
 * it*. A sentence inside a retraction is a record; the same sentence standing alone is a lie. The
 * difference is exactly the window, so the window is what is checked.
 *
 * {@link RETRACTION_WINDOW} is 600 rather than that file's 400 because these retractions carry an
 * argument as well as a verdict — the § D227 rule, what shipped, and where. It was set by measuring
 * the four corrections rather than guessed: the widest gap is under 400, and the slack is there so
 * a future editor rewrapping a paragraph does not go red for it.
 *
 * ## What was found, and the pattern across the four
 *
 * | file | the sentence | what shipped, and when |
 * |---|---|---|
 * | `campaignModel.ts` | *"the fourth test grades nothing"* | the `trips` goal reads `loadedDepartures` |
 * | `campaignModel.ts` | *"neither the complexity table nor `switchWeek` is reached"* | `offersView`, `take-offer`, `host.ts`'s `switchWeek` |
 * | `designerModel.ts` | *"nothing authors an escalator on either surface"* | `designerScreen.ts#drawEscalatorPanel`, § D518 |
 * | `rushScreenModel.ts` | *"The real source is the rush engine, which is not built"* | `everyday/rush.ts`, § D515 (#220) |
 * | `rushScreen.ts` | *"the model marks it inert because the climbing stream is not built"* | `rushBarModel` is `return base` |
 *
 * Two things they share. **Every one of them was contradicted inside its own file or its
 * neighbour** — `designerModel.ts` denied escalators 110 lines above a comment saying the escalator
 * rows had left on § D518 — so none needed outside knowledge to catch, only somebody reading twice.
 * And **every one survived the commit that made it false**, because § D227's rule (*a refusal leaves
 * on the commit that makes it false*) was applied to the register and not to the prose about it.
 *
 * `CLAUDE.md` § *"A stated refusal goes stale the same way"* is why this is the severity it is: a
 * dead seam does nothing, while a stale refusal **tells the reader not to touch the control**.
 * These four told a reader that four shipped features were absent.
 *
 * [§ D405](../../../../DECISIONS.md) settles the bookkeeping: nothing here binds a module that does
 * not own it, so this file is the record and no `DECISIONS.md` entry is due. Phrased that way rather
 * than with the marker phrase itself, because `documentation.test.ts`'s ratchet counts a discussion
 * of the marker as a use of it — § D405's own convention is to name it rather than utter it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseElevatorSpecs } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { BLANK_SPEC, machineAt } from '../authoring/buildingSpec.js';
import { classesFromSpecs } from '../authoring/machineSpec.js';
import { DIFFICULTIES } from '../campaign/economy.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { campaignTestGoals } from './campaignModel.js';
import { DESIGNER_ABSENCES, withShaftMachine } from './designerModel.js';
import { RUSH_ABSENCES, RUSH_SCREEN_COPY, rushBarModel } from './rushScreenModel.js';

const sourceOf = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Characters either side of a retracted sentence in which a retraction marker must appear. */
const RETRACTION_WINDOW = 600;

/** How far the enclosing `*"…"*` may sit from the sentence it holds. */
const QUOTE_WINDOW = 300;

/**
 * How this tree says *this sentence is dead*.
 *
 * Every one is a phrase that only appears when an author is disowning a claim. `GitHub issue #423`
 * is in the set because it is this sweep's own citation and each correction carries it; the rest
 * are the wordings the four corrections actually used, read off them rather than invented, so the
 * set is not wider than the evidence.
 */
const RETRACTION_MARKERS =
  /stopped being true|had been false|was false|is deleted|left (?:this table |the register )?on the commit|GitHub issue #423|(?:it|this) read|used to (?:say|read)|no longer exists|§ D227|R38/gi;

/**
 * Assert a retracted sentence appears **only** inside a retraction — the predicate this file exists
 * to get right. Absent is fine; present-and-disowned is fine; present-and-standing is the defect.
 *
 * **Two conditions, and the second was added because the first alone let the control through.** A
 * marker within {@link RETRACTION_WINDOW} was the whole test at first, copied from
 * `documentation.test.ts`. Then the positive control — the original sentence pasted back as a
 * standing claim — **passed**, because it landed beside `DESIGNER_ABSENCES`, whose own unrelated
 * comment carries *left on the commit* and *§ D227*. Proximity to a retraction is not the same as
 * being inside one, and a file that retracts anything would have been permanently immune.
 *
 * So the sentence must *also* sit inside this tree's retraction quotation — `*"…"*`, the emphasis
 * form every correction here uses to hold a dead sentence at arm's length. That is what separates
 * the two cases mechanically: a claim being asserted is unquoted prose, and a claim being disowned
 * is in quotation marks with a marker beside it. Neither condition alone is the predicate.
 */
function onlyInRetraction(source: string, sentence: string, where: string): void {
  const markers = [...source.matchAll(RETRACTION_MARKERS)].map((m) => m.index);
  let from = 0;
  for (;;) {
    const at = source.indexOf(sentence, from);
    if (at < 0) return;
    const end = at + sentence.length;

    const nearest = markers.reduce(
      (best, mark) => Math.min(best, mark > end ? mark - end : mark < at ? at - mark : 0),
      Number.POSITIVE_INFINITY,
    );
    expect(
      nearest,
      `${where}: "${sentence}" stands with no retraction within ${String(RETRACTION_WINDOW)} ` +
        `characters (nearest ${Number.isFinite(nearest) ? String(nearest) : 'none in the file'}). ` +
        'Either it is being asserted again, or a correction was rewritten without its marker.',
    ).toBeLessThanOrEqual(RETRACTION_WINDOW);

    /*
     * And inside the quotation. The window either side is generous because a retracted sentence is
     * often quoted with the clause that preceded it, but it is bounded so an `*"` belonging to some
     * other quotation two paragraphs up cannot vouch for this one.
     */
    const opens = source.lastIndexOf('*"', at);
    const closes = source.indexOf('"*', end);
    expect(
      opens >= 0 && at - opens <= QUOTE_WINDOW && closes >= 0 && closes - end <= QUOTE_WINDOW,
      `${where}: "${sentence}" is not inside a retraction quotation. A dead sentence is held in ` +
        '`*"…"*` so a reader meets it and is told it is dead; the same words as plain prose are ' +
        'the claim being made again.',
    ).toBe(true);

    from = end;
  }
}

describe('a refusal that outlived the thing it refused — GitHub issue #423', () => {
  it('does not say the trip budget grades nothing, and the trip goal reads its observation', () => {
    onlyInRetraction(sourceOf('./campaignModel.ts'), 'grades nothing', 'campaignModel.ts');

    /*
     * The other half. `loadedDepartures` is the observation the docstring said was *"not on that
     * record"*; the chain that puts it there is `core/src/metrics/summarize.ts#loadedDepartureTimes`
     * → `record/recordRun.ts` → `live/observations.ts` → `shift/goals.ts#readGoal`.
     */
    const trips = campaignTestGoals(DIFFICULTIES.standard).find((goal) => goal.id === 'trips');
    expect(trips, 'the trip goal is gone — if that is deliberate, the deleted refusal may be owed back').toBeDefined();
    expect(trips?.reads).toBe('loadedDepartures');
  });

  it('does not say offers are unreachable, and the offers view reads its two seams', () => {
    const source = sourceOf('./campaignModel.ts');
    onlyInRetraction(source, 'is reached from these three screens yet', 'campaignModel.ts');
    /*
     * `TOWERS_COPY.offersRefusal` was a `{@link}` to a symbol that no longer exists, and this
     * docstring held its **only** surviving mention in the tree. A dangling link is the quietest
     * form of this defect: it renders as prose and resolves to nothing.
     */
    expect(source).not.toContain('{@link TOWERS_COPY.offersRefusal}');
  });

  it('does not say nothing authors an escalator, and the register agrees with itself', () => {
    onlyInRetraction(sourceOf('./designerModel.ts'), 'nothing authors an escalator', 'designerModel.ts');
    /* The escalator panel writes `spec.transportModes`; § D518 took the rows out of the register. */
    expect(sourceOf('./designerScreen.ts')).toContain('spec.transportModes');
    for (const row of DESIGNER_ABSENCES) {
      expect(row, 'an escalator row is back in the register without the docstring coming back').not.toContain('escalator');
    }
  });

  it('does not say a design carries one class, and the model carries one per shaft', () => {
    /*
     * **A sixth, arriving with the feature rather than two weeks after it** — GitHub issue #420.
     * This file's four were caught by somebody reading twice; this one is registered on the commit
     * that makes it false, which is what § D227 asks for and what the escalator case above cost by
     * not doing.
     *
     * The sentence is `designerModel.ts`'s own third deviation from § 13 — it argued that a
     * per-shaft picker would be *"five controls writing the same setting"*, which was § D219 read
     * correctly against a model with one machine in it. `BuildingSpec.machineByCar` is that model
     * changed, so the argument is now a retraction rather than a claim.
     */
    onlyInRetraction(
      sourceOf('./designerModel.ts'),
      'One machine class for the design, not one per shaft',
      'designerModel.ts',
    );

    /*
     * The other half, and the half that makes this a guard rather than a grep. Three facts, each of
     * which would have to be undone for the retraction to become wrong again: the model carries a
     * machine per shaft, the panel writes it, and the register no longer refuses it. If the feature
     * is ever genuinely removed these go red and whoever removes it is asked to say so, rather than
     * quietly putting the sentence back.
     */
    const hydraulic = classesFromSpecs(
      parseElevatorSpecs(
        JSON.parse(readFileSync(join(DATA_DIR, 'elevator-specs.json'), 'utf8')) as unknown,
      ),
    ).find((entry) => entry.id === 'hydraulic');
    expect(hydraulic, 'the shipped hydraulic class').toBeDefined();
    const pinned = withShaftMachine(BLANK_SPEC, 1, hydraulic);
    expect(machineAt(pinned, 1).specClass, 'the model no longer holds one machine').toBe(
      'hydraulic',
    );
    expect(machineAt(pinned, 0).specClass, 'and an unpinned shaft still follows the design').toBe(
      BLANK_SPEC.specClass,
    );
    expect(sourceOf('./designerScreen.ts')).toContain('withShaftMachine');
    for (const row of DESIGNER_ABSENCES) {
      expect(row, 'a class-per-shaft row is back without the docstring coming back').not.toContain(
        'machine class per shaft',
      );
    }
  });

  it('does not say the rush engine is unbuilt, and the primary is live', () => {
    onlyInRetraction(sourceOf('./rushScreenModel.ts'), 'the rush engine, which is not built', 'rushScreenModel.ts');
    onlyInRetraction(sourceOf('./rushScreen.ts'), 'the climbing stream is not built', 'rushScreen.ts');

    /*
     * `rushBarModel` is the thing that carried the refusal. It is `return base` now, so the bar's
     * own row stands — identity is the assertion, because a substitution would mean a cell was
     * being edited again.
     */
    const bar = { primary: { label: 'Start the rush' } } as never;
    expect(rushBarModel(bar)).toBe(bar);
  });

  it('deleted the inert label rather than rewording it, because it had no reader', () => {
    /*
     * `RUSH_SCREEN_COPY.primaryInertLabel` read *'Start the rush — not built yet'* and was
     * substituted by `rushBarModel` while the engine was missing. From the commit that built the
     * engine it had no reader at all, and what it said was false — a player-facing constant in the
     * honesty corpus claiming a shipped feature was absent.
     *
     * Asserted on the **object** rather than the source, because the source still discusses it in
     * the comment that records the deletion, and that comment should stay.
     */
    expect(Object.keys(RUSH_SCREEN_COPY)).not.toContain('primaryInertLabel');
    for (const value of Object.values(RUSH_SCREEN_COPY)) {
      expect(value, 'a shipped rush string still says the rush is unbuilt').not.toContain('not built yet');
    }
  });

  it('counts the rush register rather than describing it in prose beside itself', () => {
    /*
     * The docstring said *"the three entries about the missing engine"* next to an array holding
     * one entry, about the standings. `RISKS.md` R38 at the shortest possible range — a number
     * written into prose beside the thing it counts.
     */
    expect(RUSH_ABSENCES.length).toBe(1);
    onlyInRetraction(
      sourceOf('./rushScreenModel.ts'),
      'three entries about the missing engine',
      'rushScreenModel.ts',
    );
  });

  it('leaves the general problem to the file that states it, and says so', () => {
    /*
     * A guard against this file quietly becoming the answer to a question it does not answer.
     * `refusalsAreCurrent.test.ts` documents that deciding *in general* whether a refusal names a
     * feature that now exists is not something it can do. That remains true — this file is a list of
     * five already-caught sentences, not a rule — and if that paragraph is ever deleted because
     * somebody thinks this file replaced it, this case says otherwise.
     */
    expect(sourceOf('./refusalsAreCurrent.test.ts')).toContain(
      'cannot decide, in general, whether a refusal names a feature that now exists',
    );
  });
});
