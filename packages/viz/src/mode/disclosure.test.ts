/**
 * **Basic shortens a suppression reason, and cannot shorten it away.**
 *
 * `GAPS.md` § 3 carried this as a gap with a named fix: *"`core` returns one of four sentences as a
 * bare string with no ground code, so a per-ground rewording would re-decide which ground fired …
 * Named fix: `core` must carry the ground beside the prose."* It does now
 * (`core/metrics/awtValidity.ts`), and this file is the half of the fix that faces a player.
 *
 * ## The four things that could go wrong here, in the order they would hurt
 *
 * 1. **A shortened reason becomes a removed reason.** R3: *"Basic mode may shorten the reason; it may
 *    not remove it."* The lead is per ground and `core`'s sentence still follows it verbatim, still
 *    on `mustCarry`, so `parityViolations` still refuses a Basic mode that drops it. Asserted both
 *    ways: green for every ground, and **red with the reason quoted** when the reason is replaced by
 *    the short lead alone.
 * 2. **A ground gets another ground's words.** Each lead is asserted distinct, per ground, over the
 *    enumeration `core` derives from its own branch table — so a fifth ground that silently inherited
 *    a fourth ground's sentence is red here, and a fifth ground with *no* sentence is red at compile
 *    time on `SUPPRESSION_CLAUSE_BY_GROUND`.
 * 3. **An unrecognised code shows nothing.** Proved against
 *    {@link FICTIONAL_SUPPRESSION_GROUND}, which no `core` branch emits — § D134's technique, and
 *    the only way the fallback branch is reachable at all. A code is permission to shorten, never
 *    permission to go quiet.
 * 4. **The rendering changes for recordings that carry no ground.** That is every recording this
 *    build produces, because `VizSummary` does not declare the field. Asserted byte-identical to the
 *    fallback, so the shipped screen has not moved.
 *
 * ## Why the enumeration is imported rather than listed
 *
 * `AWT_INVALID_GROUNDS` is derived in `core` from the table that decides the grounds. Iterating it
 * here means a fifth ground enters this suite by existing — the same discipline `parity.test.ts`
 * relies on one layer up, and the reason neither file contains a list of grounds.
 */

import { AWT_INVALID_GROUNDS } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { SUPPRESSION_LEAD, disclosureItems } from './disclosure.js';
import {
  FICTIONAL_SUPPRESSION_GROUND,
  FICTIONAL_SUPPRESSION_REASON,
  fictionalRecording,
} from './fictionalFailState.test-helper.js';
import { parityRefusal, parityViolations } from './parity.js';
import { itemsIn, type DisclosureItem } from './types.js';

/** Every suppression item of a run carrying `ground`, or carrying none when it is `undefined`. */
function suppressionItems(ground?: string | undefined): readonly DisclosureItem[] {
  return disclosureItems({ recording: fictionalRecording({}, ground) }).filter(
    (item) => item.origin.kind === 'suppression',
  );
}

/** The Basic note of the first suppression item — the string the reader actually gets. */
function basicNote(ground?: string | undefined): string {
  const first = suppressionItems(ground)[0];
  expect(first, 'the fixture must produce a suppressed figure').toBeDefined();
  return first?.basic?.note ?? '';
}

/** What the lead is, with `core`'s sentence taken off the end. */
function leadOnly(ground?: string | undefined): string {
  return basicNote(ground).replace(FICTIONAL_SUPPRESSION_REASON, '').trim();
}

describe('the ground decides the wording, and the enumeration is core’s', () => {
  it('is not a vacuous sweep: core ships more than three grounds and the fixture is refused', () => {
    expect(AWT_INVALID_GROUNDS.length).toBeGreaterThan(3);
    expect(suppressionItems().length).toBeGreaterThan(0);
  });

  for (const ground of AWT_INVALID_GROUNDS) {
    it(`${ground} leads with a sentence about ${ground}, not the ground-free one`, () => {
      const note = basicNote(ground);
      expect(note).not.toContain(SUPPRESSION_LEAD);
      // R3's framing survives the shortening: a refusal is a result, not a gap.
      expect(note).toContain('that is a result rather than a gap');
      // And core's own words are still underneath it, verbatim.
      expect(note).toContain(FICTIONAL_SUPPRESSION_REASON);
    });
  }

  it('gives every ground its own sentence — no two share one', () => {
    const leads = AWT_INVALID_GROUNDS.map((ground) => leadOnly(ground));
    expect(new Set(leads).size).toBe(leads.length);
    /*
     * The runtime half of the compile-time guard on `SUPPRESSION_CLAUSE_BY_GROUND`. That `Record` is
     * total over the union, so a fifth ground cannot be *missing*; this is what catches a fifth
     * ground that was added by copying a fourth ground's clause.
     */
    for (const lead of leads) expect(lead).not.toBe(SUPPRESSION_LEAD);
  });

  it('shortens: every per-ground lead is shorter than the ground-free one', () => {
    // The gap's own word. A "shortened" reason that grew would be a different change.
    for (const ground of AWT_INVALID_GROUNDS) {
      expect(leadOnly(ground).length).toBeLessThan(SUPPRESSION_LEAD.length);
    }
  });

  it('leaves Advanced alone — the ground is a Basic wording, not a second reason', () => {
    for (const ground of [undefined, ...AWT_INVALID_GROUNDS, FICTIONAL_SUPPRESSION_GROUND]) {
      const item = suppressionItems(ground)[0];
      expect(item?.advanced.note).toBe(FICTIONAL_SUPPRESSION_REASON);
    }
  });
});

describe('a code this build does not recognise falls back, and does not go quiet', () => {
  it('uses the ground-free lead for a ground no core branch emits', () => {
    const note = basicNote(FICTIONAL_SUPPRESSION_GROUND);
    expect(note).toContain(SUPPRESSION_LEAD);
    expect(note).toContain(FICTIONAL_SUPPRESSION_REASON);
    // The code itself never reaches the screen. A bare `flooded-pit` is not an explanation.
    expect(note).not.toContain(FICTIONAL_SUPPRESSION_GROUND);
  });

  it('renders a recording that carries no ground exactly as it did before codes existed', () => {
    // Every recording `record/recordRun.ts` produces today is this one: `VizSummary` does not carry
    // the field. So this assertion is the shipped screen, and it must not have moved.
    expect(basicNote(undefined)).toBe(`${SUPPRESSION_LEAD} ${FICTIONAL_SUPPRESSION_REASON}`);
  });

  it('treats an unrecognised ground and an absent one identically', () => {
    expect(basicNote(FICTIONAL_SUPPRESSION_GROUND)).toBe(basicNote(undefined));
  });
});

describe('shortening is not removing — parity still guards core’s sentence', () => {
  it('is clean for every ground, the fictional one, and none at all', () => {
    for (const ground of [undefined, ...AWT_INVALID_GROUNDS, FICTIONAL_SUPPRESSION_GROUND]) {
      const items = disclosureItems({ recording: fictionalRecording({}, ground) });
      expect(parityViolations(items), String(ground)).toEqual([]);
    }
  });

  it('carries the reason on mustCarry whichever ground fired', () => {
    for (const ground of [undefined, ...AWT_INVALID_GROUNDS, FICTIONAL_SUPPRESSION_GROUND]) {
      for (const item of suppressionItems(ground)) {
        expect(item.mustCarry, String(ground)).toContain(FICTIONAL_SUPPRESSION_REASON);
      }
    }
  });

  it('refuses a Basic mode that keeps only the short lead and drops core’s sentence', () => {
    /*
     * The failure this whole design is arranged around, and the one R3's *"may shorten, may not
     * remove"* forbids: a per-ground lead is a good sentence and it is not the measurement's answer.
     * A mode that substituted it would read *better* and would be a second source of truth.
     */
    const ground = AWT_INVALID_GROUNDS[0];
    const items = disclosureItems({ recording: fictionalRecording({}, ground) }).map((item) =>
      item.origin.kind === 'suppression' && item.basic !== null
        ? { ...item, basic: { ...item.basic, note: leadOnly(ground) } }
        : item,
    );
    const violations = parityViolations(items);
    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) expect(violation.rule).toBe('dropped-text');
    expect(parityRefusal(items)).toContain(FICTIONAL_SUPPRESSION_REASON);
  });

  it('keeps the refusal decided by the figure, not by the ground', () => {
    /*
     * R9: one gate. A recording whose mean is *quotable* has no suppression item at all, whatever it
     * carries in `awtInvalidGround` — so the code cannot create a refusal, only word one.
     */
    const quotable = fictionalRecording(
      {
        summary: {
          ...fictionalRecording().summary,
          saturated: false,
          awtIsValid: true,
          awtInvalidReason: undefined,
        },
      },
      AWT_INVALID_GROUNDS[0],
    );
    const items = disclosureItems({ recording: quotable });
    expect(items.filter((item) => item.origin.kind === 'suppression')).toEqual([]);
    expect(itemsIn(items, 'basic').length).toBeGreaterThan(0);
    expect(parityViolations(items)).toEqual([]);
  });
});
