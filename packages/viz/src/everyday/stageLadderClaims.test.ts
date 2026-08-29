/**
 * **Every prose claim about the stage's speed ladder, re-derived from the ladder** — GitHub issue
 * **#286**, `RISKS.md` **R38**.
 *
 * ## What went wrong, and why a corrected literal was not the fix
 *
 * [§ D354](../../../../DECISIONS.md) replaced a five-rung `STAGE_SPEEDS` with a seven-rung one
 * carrying a true 1:1, and **three descriptions of the old ladder stayed behind it** — one of them a
 * string a player reads. They were not subtle and nothing found them: the sentence
 * *"the stage has its own five speeds"* was in the honesty corpus the entire time, because
 * `honesty/surfaces.ts#EVERYDAY_BUILD_NOTES` seeds `settingsView.ts#SETTINGS_ABSENCES` and has since
 * #207. **Being swept is not being checked.** All ten honesty properties are predicates over the
 * strings of one render; not one of them compares a written count against the structure it counts,
 * and none could without reading this tree's own exports, which `properties.ts` may not do.
 *
 * So the instrument is an ordinary node test, in the shape `viewportGateClaims.test.ts` reached for
 * the same class one wave earlier: **the documents' figures are read off disk and compared against
 * the value the code actually holds.** Writing *seven* into the three sites would have been the
 * defect again with a fresher number — this repository has now recorded that lesson five times on
 * one status row.
 *
 * ## What is checked, and the one rule that decides which text counts
 *
 * A **declared shape per claim**, each scoped to the document that carries it, each required to
 * match at least once. A guard that quietly stops matching is worse than no guard, so a shape that
 * finds nothing fails with the two things a reader can do about it.
 *
 * **Only live claims are read.** This repository keeps superseded figures standing with the
 * correction beside them, so a corrected document contains the old numbers **on purpose** — the
 * whole of `docs/29` § 4.1 is a struck-through table whose arithmetic § D344 still rests on. The
 * rule `viewportGateClaims.test.ts` settled applies unchanged: **a figure inside `~~…~~` is
 * history, and a figure in a shape is still being asserted.** Nothing here parses supersession
 * markers to decide what to believe; the shapes simply do not fit struck text, which keeps the
 * distinction visible in the documents rather than buried in a regex.
 *
 * ## What is deliberately **not** checked here
 *
 * The shipped string. `settingsView.test.ts` owns it, because the fix there is *derivation* rather
 * than transcription — the sentence interpolates `STAGE_SPEEDS.length` and cannot go stale — and a
 * second assertion over the same string from a file about documents would read as though the
 * product needed watching in the same way a document does. It does not; that is the difference the
 * two fixes are meant to show.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { STAGE_SPEEDS } from './stageScreenModel.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

const read = (document: string): string => readFileSync(join(REPO, document), 'utf8');

/**
 * `~~struck~~` spans blanked, so a superseded figure is not read as a live claim.
 *
 * Blanked to the same length rather than deleted, so nothing either side of a strike is joined into
 * a phrase that was never written.
 */
const live = (text: string): string =>
  text.replace(/~~[\s\S]*?~~/g, (span) => span.replace(/[^\n]/g, ' '));

/**
 * The count words this repository writes ladder sizes in, and a deliberate failure outside them.
 *
 * A ladder of thirteen rungs is not a thing this map should quietly decline to check: it is a thing
 * somebody has to come and write a word for, which is one line and a moment's thought, and is the
 * price of documents that read like sentences instead of like a data sheet.
 */
const COUNT_WORDS: readonly string[] = Object.freeze([
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
]);

function wordFor(n: number): string {
  const word = COUNT_WORDS[n];
  if (word === undefined) {
    throw new Error(
      `no count word for ${String(n)}. The ladder outgrew this map — add the word rather than ` +
        'loosening the check, which is the only way this file stops being about counts.',
    );
  }
  return word;
}

/** § D344's discrete-cue budget: a cue must fit inside the 9.8 s door cycle it announces. */
const DISCRETE_CUE_LIMIT_S = 39;

describe('the speed ladder every document describes is the one `STAGE_SPEEDS` holds', () => {
  const multipliers = STAGE_SPEEDS.map((speed) => speed.simPerRealS);
  const labels = STAGE_SPEEDS.map((speed) => speed.label);
  const discrete = multipliers.filter((s) => s <= DISCRETE_CUE_LIMIT_S).length;

  it('has a ladder to check, and labels that are ratios — otherwise nothing below means anything', () => {
    expect(STAGE_SPEEDS.length, 'the ladder is empty; this whole file is watching nothing').toBeGreaterThan(0);
    /*
     * Not a re-assertion of `stageScreenModel.test.ts`'s label rule — it is the precondition for
     * reading a chip name out of a document as a multiplier at all. If a label ever stops being its
     * own ratio, every shape below is comparing two unrelated numbers and would go green by luck.
     */
    expect(labels).toEqual(multipliers.map((s) => `${String(s)}×`));
  });

  /**
   * **`docs/28` § 6 is the one place the ladder is written out in full**, and it is written out
   * because pixels need the frame arithmetic. Everything else cites it — `docs/29` § 1 was corrected
   * to cite rather than restate, since restating is how it went wrong.
   *
   * Order is asserted, not just membership: the table is read top to bottom as a ladder, and a
   * reordering that left the set intact would still be a different picture.
   */
  it('finds `docs/28` § 6’s table equal to the ladder, rung for rung and in order', () => {
    const rows = [...live(read('docs/28-art-direction.md')).matchAll(/^\|\s*`(\d+)×`[^|]*\|\s*(\d+)\s*\|/gmu)];
    expect(
      rows.length,
      '`docs/28-art-direction.md` § 6 no longer has a table this shape reads. Teach the regex if ' +
        'the table moved; delete this case if the table went — but a guard matching nothing must ' +
        'not report green.',
    ).toBeGreaterThan(0);
    expect(
      rows.map((row) => `${row[1] ?? ''}× ${row[2] ?? ''}`),
      'the published table is not the shipped ladder. Re-derive it from `STAGE_SPEEDS`; a table ' +
        'typed beside a structure is stale as of the next commit that moves the structure.',
    ).toEqual(STAGE_SPEEDS.map((speed) => `${String(speed.simPerRealS)}× ${String(speed.simPerRealS)}`));
  });

  /**
   * The counts written in words, one declared shape each.
   *
   * These are the sentences #286 was filed about: `docs/29` § 1 said *five* and listed the five old
   * multipliers, and it said so in the document's own list of *"three facts, each checkable in one
   * command"*. Checkable it now is.
   */
  it('finds every spelled count of the ladder equal to `STAGE_SPEEDS.length`', () => {
    const CLAIMS: readonly { readonly document: string; readonly shape: RegExp; readonly what: string }[] =
      Object.freeze([
        {
          document: 'docs/28-art-direction.md',
          shape: /`stageScreenModel\.ts#STAGE_SPEEDS` ships (\w+) settings/gu,
          what: '§ 6’s lead-in to the canonical table',
        },
        {
          document: 'docs/29-audio-direction.md',
          shape: /the\s+ladder \*\*(\w+) rungs/gu,
          what: '§ 1 fact 1, the corrected headline evidence',
        },
      ]);
    const wanted = wordFor(STAGE_SPEEDS.length);
    const wrong: string[] = [];
    for (const claim of CLAIMS) {
      const hits = [...live(read(claim.document)).matchAll(claim.shape)];
      expect(
        hits.length,
        `${claim.document}: ${claim.what} no longer states the ladder’s size in a shape this ` +
          'guard reads. Teach the regex, or delete the claim and this row with it.',
      ).toBeGreaterThan(0);
      for (const hit of hits) if (hit[1] !== wanted) wrong.push(`${claim.document}: “${hit[0].trim()}”`);
    }
    expect(
      wrong,
      `the ladder ships ${String(STAGE_SPEEDS.length)} rungs — ${wanted}. A count in prose beside a ` +
        'structure drifts the moment the structure moves, and this is the fifth time this ' +
        'repository has recorded that class.',
    ).toEqual([]);
  });

  /**
   * The multiplier list, where `docs/29` § 1 names it — the exact claim that was false.
   *
   * It read *"ships five values … 8, 30, 90, 240, 600"*. Both halves are derived now: the count word
   * against `STAGE_SPEEDS.length` above, and the sequence itself here, in order.
   */
  it('finds `docs/29` § 1’s multiplier list equal to the ladder’s, in order', () => {
    const hits = [...live(read('docs/29-audio-direction.md')).matchAll(/\*\*\w+ rungs — ([^—]+) — every label/gu)];
    expect(
      hits.length,
      '`docs/29-audio-direction.md` § 1 no longer lists the multipliers in a shape this guard ' +
        'reads. Teach the regex, or delete the list — citing `docs/28` § 6 without restating it is ' +
        'the better fix and is what the rest of that paragraph does.',
    ).toBe(1);
    const listed = [...(hits[0]?.[1] ?? '').matchAll(/\d+/gu)].map((n) => Number(n[0]));
    expect(
      listed,
      'the multipliers this document lists are not the ones that ship. This is the sentence #286 ' +
        'was filed about, in its second life.',
    ).toEqual([...multipliers]);
  });

  /**
   * § D344's `S ≤ 39` budget, counted rather than asserted.
   *
   * `docs/29` § 9 item 2 is the clause that said a real-time rung *would* reopen the audio cut. It
   * is delivered, and what makes it more than delivered is the count: **four** rungs sit inside the
   * budget where two did, and neither of those two was 1:1. Both numbers move if the ladder does.
   */
  it('finds `docs/29` § 9’s discrete-cue count derived from the ladder', () => {
    const hits = [...live(read('docs/29-audio-direction.md')).matchAll(/\*\*(\w+) of its (\w+)\*\* sit inside/gu)];
    expect(
      hits.length,
      '`docs/29-audio-direction.md` § 9 item 2 no longer states how many rungs clear § D344’s ' +
        'budget. That count is what makes the reopen clause *delivered* rather than merely met — ' +
        'teach the regex or delete the sentence, but do not leave this watching nothing.',
    ).toBe(1);
    expect(
      [hits[0]?.[1], hits[0]?.[2]],
      `${String(discrete)} of ${String(STAGE_SPEEDS.length)} rungs run at or under ` +
        `${String(DISCRETE_CUE_LIMIT_S)} simulated seconds per real second. Both halves are ` +
        'derived; neither is a number to type.',
    ).toEqual([wordFor(discrete), wordFor(STAGE_SPEEDS.length)]);
  });

  /**
   * `README.md`'s index row, which said the slowest shipped speed *"is already 8× compressed"*.
   *
   * The row is where a cold reader meets the audio document, so a withdrawn premise sitting in it
   * is the premise most people read. The rung is named rather than described — `1×` rather than
   * *real time* — precisely so this can compare it to a number.
   */
  it('finds `README.md`’s slowest-rung claim naming the slowest rung', () => {
    const hits = [...live(read('README.md')).matchAll(/slowest rung was \d+× compressed[^`]*`(\d+)×`/gu)];
    expect(
      hits.length,
      '`README.md`’s audio row no longer names the slowest rung in a shape this guard reads. It ' +
        'said *“the stage’s slowest shipped speed is already 8× compressed”* for two waves after ' +
        'that stopped being true; if the sentence moved, teach the regex.',
    ).toBe(1);
    expect(
      Number(hits[0]?.[1]),
      'the rung `README.md` calls the slowest is not the slowest one that ships.',
    ).toBe(Math.min(...multipliers));
  });
});
