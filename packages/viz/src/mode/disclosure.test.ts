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
 * 4. **The rendering changes for recordings that carry no ground.** No longer *every* recording this
 *    build produces — `VizSummary` declares the field at schema version 8 and `describeSummary`
 *    copies it — but still two real ones: a run whose mean is quotable carries no ground at all, and
 *    a loaded file can carry a code this build has no wording for, because `record/document.ts`
 *    checks a document's *keys* and never a field's *value*. Asserted byte-identical to the
 *    ground-free fallback in both cases.
 *
 * ## Why the enumeration is imported rather than listed
 *
 * `AWT_INVALID_GROUNDS` is derived in `core` from the table that decides the grounds. Iterating it
 * here means a fifth ground enters this suite by existing — the same discipline `parity.test.ts`
 * relies on one layer up, and the reason neither file contains a list of grounds.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { AWT_INVALID_GROUNDS } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import {
  DATA_DIR,
  SUPPRESSED_BUILDING_ID,
  fixtureConfig,
  suppressedConfig,
} from '../fixtures.test-helper.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { readRecordingDocument } from '../record/document.js';
import { recordRun } from '../record/recordRun.js';

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
    /*
     * This was *every* recording until `VizSummary` gained the field at schema version 8. It is now
     * the shape a **quotable** run has — `core` emits the ground and the prose together or neither —
     * and it is still the exact bytes the screen carried before codes existed, which is what makes
     * the version-8 transport a widening rather than a rewrite.
     */
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
     *
     * **The ground is now written into the summary override rather than passed as the second
     * argument, and that is a strengthening rather than a tidy-up.** `fictionalRecording` spreads
     * `overrides` last, so an override that replaces the whole summary also replaced the *grounded*
     * one: this case used to run with no ground present at all, and asserted only that a quotable run
     * has no suppression item — true, and not the claim in its own name. Writing the ground onto the
     * quotable summary makes the recording deliberately self-contradictory (a code beside
     * `awtIsValid: true`, a shape `core` cannot emit and a hand-edited file can) and asserts what R9
     * actually says: the flag decides, and the ground is inert.
     */
    const ground = AWT_INVALID_GROUNDS[0];
    expect(ground, 'core ships at least one ground').toBeDefined();
    const quotable = fictionalRecording({
      summary: {
        ...fictionalRecording().summary,
        saturated: false,
        awtIsValid: true,
        awtInvalidReason: undefined,
        awtInvalidGround: ground,
      },
    });
    const items = disclosureItems({ recording: quotable });
    expect(items.filter((item) => item.origin.kind === 'suppression')).toEqual([]);
    expect(itemsIn(items, 'basic').length).toBeGreaterThan(0);
    expect(parityViolations(items)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The transport, on a run this build actually produces
 * -------------------------------------------------------------------------- */

/**
 * Everything above hands a ground in. **Nothing above proves a recording carries one.**
 *
 * That distinction is the whole of `GAPS.md` § 3's remaining half: the per-ground wording landed one
 * commit before `VizSummary` had the field, so every assertion in this file passed while the shipped
 * screen still rendered the ground-free lead. A fixture-only suite cannot tell *"the mechanism works"*
 * from *"the mechanism is wired"* — which is the roadmap's standing requirement (**name the non-test
 * caller**) pointed at a contract field rather than at a function.
 *
 * So this suite records **real runs** and asserts on what came out of them: `suppressedConfig`,
 * which is the fixture `live/noMeans.test.ts` uses for the same reason, and `garden-apartments`,
 * which does not saturate and is therefore the control that keeps the first assertion from being
 * true of everything.
 *
 * **The refused run is a rate, not a building** — `DECISIONS.md` § D260. This named `vertical-city`
 * *"at the shipped rates"*, and § D254's pickup access check was what refused it; the building now
 * completes at 100 % delivery on every seed tried. `suppressedConfig` states 16 % of population per
 * five minutes, and its ground is `saturated` on all three seeds measured — which this file depends
 * on more than the others do, because a fixture that wandered between grounds would make the
 * per-ground lead assertion below about a different sentence each run.
 */
const SUPPRESSED_ID = SUPPRESSED_BUILDING_ID;

let config: LoadedConfig;
let suppressed: VizRecording;
let quotable: VizRecording;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  suppressed = recordRun(suppressedConfig(config)).recording;
  quotable = recordRun(fixtureConfig(config)).recording;
}, 600_000);

describe(`${SUPPRESSED_ID} — a recorded run carries its ground, and Basic reads it`, () => {
  it('really is refused, or the rest of this proves nothing', () => {
    expect(meansAreSuppressed(suppressed)).toBe(true);
    expect(suppressed.summary.awtIsValid).toBe(false);
  }, 600_000);

  it('carries a ground that is one of core’s, beside non-empty prose', () => {
    const { awtInvalidGround, awtInvalidReason } = suppressed.summary;
    expect(awtInvalidGround).toBeDefined();
    expect(AWT_INVALID_GROUNDS as readonly string[]).toContain(awtInvalidGround);
    expect(awtInvalidReason ?? '').not.toBe('');
  }, 600_000);

  it('leads Basic with a sentence about this refusal, and still carries core’s underneath', () => {
    /*
     * The assertion the whole change exists for. Before the transport this note was
     * `SUPPRESSION_LEAD` plus the reason on every real recording; it is now the per-ground lead plus
     * the reason, and the second half is what R3 forbids dropping.
     */
    const items = disclosureItems({ recording: suppressed }).filter(
      (item) => item.origin.kind === 'suppression',
    );
    expect(items.length).toBeGreaterThan(0);
    const reason = suppressed.summary.awtInvalidReason ?? '';
    for (const item of items) {
      const note = item.basic?.note ?? '';
      expect(note).not.toContain(SUPPRESSION_LEAD);
      expect(note).toContain('that is a result rather than a gap');
      expect(note).toContain(reason);
      /*
       * The lead is a **lead**: `core`'s sentence is the suffix of the note, not a paraphrase folded
       * into it. Asserted as a suffix rather than as *"the ground code does not appear"*, because for
       * the `saturated` ground `core`'s own prose contains the word `saturated` — a not-to-contain
       * check there would fail on correct output. The *unrecognised* code's invisibility is asserted
       * against the fictional ground above, where no such collision exists.
       */
      expect(note.endsWith(reason)).toBe(true);
      expect(note.length).toBeGreaterThan(reason.length);
      expect(item.advanced.note).toBe(reason);
      expect(item.mustCarry).toContain(reason);
    }
    expect(parityViolations(disclosureItems({ recording: suppressed }))).toEqual([]);
  }, 600_000);

  it('survives the round trip through a saved document at the bumped schema', () => {
    /*
     * `readRecordingDocument` refuses a schema newer *or* older than this build by name (`PB-15`), so
     * a version bump that forgot to stamp the new number would fail here rather than at a reader's
     * screen. And the ground must survive `JSON.stringify` — a field the contract carries and a file
     * loses is a field that works only in the session that produced it.
     */
    const loaded = readRecordingDocument(JSON.stringify(suppressed));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.recording.summary.awtInvalidGround).toBe(suppressed.summary.awtInvalidGround);
    expect(loaded.recording.summary.awtInvalidReason).toBe(suppressed.summary.awtInvalidReason);
  }, 600_000);
});

describe('garden-apartments — the control: a quotable run carries no ground at all', () => {
  it('has no ground, no reason and no suppression item', () => {
    expect(quotable.summary.awtIsValid).toBe(true);
    expect(quotable.summary.awtInvalidGround).toBeUndefined();
    expect(quotable.summary.awtInvalidReason).toBeUndefined();
    const items = disclosureItems({ recording: quotable });
    expect(items.filter((item) => item.origin.kind === 'suppression')).toEqual([]);
    // Not vacuous: the run produced rows, it just produced no refused one.
    expect(itemsIn(items, 'basic').length).toBeGreaterThan(0);
  }, 600_000);

  it('drops the pair from the serialised document rather than writing two nulls', () => {
    // `JSON.stringify` turns an `undefined` value into an absent key, which is why the contract
    // carries the pair as optional rather than nullable — a `null` ground would be a fifth value.
    const text = JSON.stringify(quotable);
    expect(text).not.toContain('awtInvalidGround');
    expect(text).not.toContain('awtInvalidReason');
  }, 600_000);
});

/* -------------------------------------------------------------------------- *
 * Issue #71 — the split has to exist, and parity cannot see whether it does
 * -------------------------------------------------------------------------- */

/**
 * **The mode control has to change what is on the screen.**
 *
 * This is the roadmap's standing requirement — *move the control and require the run to change* —
 * applied to a mode rather than to a slider, and it is the check `mode/parity.ts` structurally
 * cannot be: all three of parity's rules fire on Basic **dropping** something, so a Basic rendering
 * that is a byte-for-byte copy of Advanced passes it with zero violations. That is driven below
 * rather than argued, because a limitation nobody has driven is one somebody will forget.
 *
 * Measured before the fix, on a real `chancery-house` run: twelve items, two hidden in Basic, three
 * differing and **seven byte-identical** — and the seven carried exactly the vocabulary the mode
 * exists to remove (*95th-percentile wait*, *door to door*, *rides over 60 s*, *the unluckiest
 * rider*, `n = 44 rides`). See [`DECISIONS.md` § D240](../../../../DECISIONS.md).
 *
 * The assertion is about **every** figure Basic keeps rather than about a list of ids: a list would
 * let a thirteenth figure through untranslated in silence, which is § D152's defect one layer over.
 */
describe('Casual and Engineer differ on every figure Casual keeps', () => {
  const textOf = (rendering: {
    readonly value: string;
    readonly count?: string | undefined;
    readonly note?: string | undefined;
  }): string =>
    [rendering.value, rendering.count, rendering.note]
      .filter((part): part is string => part !== undefined)
      .join(' | ');

  it('parity passes a Basic mode that is a copy of Advanced — the gap this suite fills', () => {
    const items = disclosureItems({
      recording: suppressed,
      dispatcherName: 'conventional collective',
    });
    const cloned = items.map((item) => ({ ...item, basic: item.advanced }));
    // Not a criticism of parity: refusing Basic for being *too* informative would be refusing the
    // safe direction. It is why the divergence claim needs a home, and this is the home.
    expect(parityViolations(cloned)).toEqual([]);
    expect(parityRefusal(cloned)).toBeUndefined();
  }, 600_000);

  /*
   * The two runs compare different numbers of rows, and the difference is the point rather than a
   * tolerance: on a refused run AWT, WT95 and TTD stop being negotiable figures and become
   * `suppression` items, which § 4 puts on the never-hide list and which both modes must therefore
   * carry. So the refused run has three fewer rows for this rule to bite on, and three more rows
   * `parityViolations` is already the authority over.
   */
  it.each([
    ['a refused run', (): VizRecording => suppressed, 5],
    ['a quotable run', (): VizRecording => quotable, 8],
  ])('%s: no figure reaches Casual in Engineer’s words', (_label, pick, atLeast) => {
    const items = disclosureItems({
      recording: pick(),
      dispatcherName: 'conventional collective',
      lockedOut: [],
    });
    const identical: string[] = [];
    let compared = 0;
    for (const item of items) {
      const basic = item.basic;
      // Hidden in Casual is a difference; § 4's non-negotiable rows are *required* to read the
      // same, so only the negotiable half — the figures — is under test here.
      if (basic === null) continue;
      if (item.origin.kind !== 'figure' && item.origin.kind !== 'run-identity') continue;
      compared += 1;
      if (textOf(item.advanced) === textOf(basic)) identical.push(item.id);
    }
    // Not vacuous: a run producing no comparable figure would pass the loop above trivially.
    expect(compared).toBeGreaterThanOrEqual(atLeast);
    expect(identical).toEqual([]);
  }, 600_000);

  it('names the surfaces the issue names, and shows them differing', () => {
    const items = disclosureItems({
      recording: quotable,
      dispatcherName: 'conventional collective',
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const id of ['awt', 'wt95', 'window', 'run', 'ttd', 'long-waits', 'service-level']) {
      const item = byId.get(id);
      expect(item, `the run summary must produce "${id}"`).toBeDefined();
      const basic = item?.basic ?? null;
      expect(basic, `Casual must still draw "${id}"`).not.toBeNull();
      if (item === undefined || basic === null) continue;
      expect(`${id}: ${String(textOf(item.advanced) !== textOf(basic))}`).toBe(`${id}: true`);
    }
    // § 7.2's two "technical only" rows are the ones Casual drops outright, and they are the only
    // two — a third would be Casual hiding a wait figure, which R11's own note forbids.
    expect(items.filter((item) => item.basic === null).map((item) => item.id).sort()).toEqual([
      'energy',
      'interval',
    ]);
  }, 600_000);

  it('translates without restating a figure, and without dropping the run’s own words', () => {
    const items = disclosureItems({ recording: quotable });
    for (const item of items) {
      const basic = item.basic;
      if (basic === null || item.origin.kind !== 'figure') continue;
      // The value is carried through untouched — except the reporting window, which is the one
      // value § 4 itself replaces. A plain retelling of `13.1 s` would be a second figure.
      if (item.id !== 'window') expect(basic.value).toBe(item.advanced.value);
      // The engineer's own sentence survives inside Casual's — a lead, never a replacement.
      const advancedNote = item.advanced.note;
      if (advancedNote !== undefined) expect(basic.note ?? '').toContain(advancedNote);
      // R13 clause one: the sample size never leaves the figure's side. It changes notation only,
      // and it names the same number.
      if (item.advanced.count !== undefined) {
        expect(basic.count).toBeDefined();
        const digits = /(\d[\d\s,]*)/.exec(item.advanced.count)?.[1] ?? '';
        expect(basic.count ?? '').toContain(digits.trim());
        expect(basic.count ?? '').not.toContain('n =');
      }
    }
  }, 600_000);

  it('never turns a statistic into a ranking, however plainly it puts it', () => {
    // The rule a plain-language layer is most able to break. *"An interval containing zero means
    // this run cannot tell them apart"* is plain English; *"A is better"* is a different claim, and
    // no wording here may become one — a single run may not order two settings at all.
    const banned =
      /\b(?:better than|worse than|faster than|slower than|beats?|outperform\w*|the best|the winner)\b/i;
    for (const recording of [suppressed, quotable]) {
      for (const item of disclosureItems({
        recording,
        dispatcherName: 'conventional collective',
      })) {
        for (const rendering of [item.advanced, item.basic]) {
          if (rendering === null) continue;
          const found = banned.exec(textOf(rendering));
          expect(`${item.id}: ${found?.[0] ?? 'none'}`).toBe(`${item.id}: none`);
        }
      }
    }
  }, 600_000);
});
