/**
 * The Casual reading of a filed day, and the four things it may not do — issues #110 and #100.
 *
 * 1. **It may not lose a figure.** The reorder is asserted to be a permutation in **both**
 *    directions, on the shipped grid and on a synthetic one carrying ids no `shift/report.ts`
 *    emits. A test that only checked the shipped eight would pass a reorder that dropped a ninth,
 *    which is the § D152 failure — a list that looks derived because the shipped set happens to
 *    fit it.
 * 2. **It may not replace the engineer's words.** Every note it returns **ends with** the cell's
 *    own note, byte for byte, on every cell of every shipped shape. Asserted with `endsWith`
 *    rather than `toContain`, because a lead that happened to quote the note in the middle of a
 *    paraphrase would pass containment and would be the second-account defect.
 * 3. **It may not turn a refusal into a figure.** A withheld cell keeps its value, its tone and its
 *    ground's own sentence, and the ground decides the *wording* and never the refusal.
 * 4. **It may not word a refusal it has no wording for.** A ground this build has no clause for
 *    falls back to the ground-free sentence rather than to a bare code or to nothing — driven with
 *    a ground no `core` branch emits (§ D134's fictional-schema technique).
 */

import { describe, expect, it } from 'vitest';

import {
  CASUAL_FIGURE_ORDER,
  CASUAL_LEVERS_HEADING,
  CASUAL_REACH_NOTE,
  CASUAL_SMALL_PRINT_LEAD,
  casualFigureOrderOf,
  casualNoteFor,
} from './casualDay.js';
import { SUPPRESSION_LEAD } from './disclosure.js';
import type { ReportFigure } from '../shift/types.js';

/** The shipped grid's ids, in `shift/report.ts#figuresFor`'s own order. */
const SHIPPED_IDS = [
  'carried',
  'minute',
  'average-wait',
  'worst-wait',
  'deepest-queue',
  'stairs',
  'energy-work',
  'energy-per-leg',
] as const;

const cell = (id: string, over: Partial<ReportFigure> = {}): ReportFigure => ({
  id,
  label: id.toUpperCase(),
  value: '7',
  note: `the engineer’s own note about ${id}`,
  tone: 'plain',
  axisOnly: false,
  ...over,
});

describe('the Casual grid leads with people and loses nobody', () => {
  it('is a permutation of the shipped grid — same members, same length', () => {
    const grid = SHIPPED_IDS.map((id) => cell(id));
    const reordered = casualFigureOrderOf(grid);
    expect(reordered).toHaveLength(grid.length);
    expect([...reordered].map((c) => c.id).sort()).toEqual([...SHIPPED_IDS].sort());
  });

  it('puts the counts of people ahead of the cell a run may refuse', () => {
    const order = casualFigureOrderOf(SHIPPED_IDS.map((id) => cell(id))).map((c) => c.id);
    // The claim, stated as an inequality rather than as a literal order, so a later reshuffle of
    // the counts among themselves does not fail a test about which half leads.
    for (const people of ['carried', 'stairs', 'worst-wait', 'deepest-queue']) {
      expect(order.indexOf(people), people).toBeLessThan(order.indexOf('average-wait'));
    }
    // And the axis that is never a score is last — § D106, kept as an ordering rather than argued.
    expect(order.slice(-2)).toEqual(['energy-work', 'energy-per-leg']);
  });

  it('keeps a figure this build has never heard of, at the end and in its own order', () => {
    /*
     * The ninth and tenth figures, which no shipped sheet emits. `figuresFor` is one edit away from
     * producing one, and a reorder that dropped it would be a figure a Casual player never sees —
     * the exact shape § D299 § 2 forbids ("named play styles are an entry point, never a ceiling").
     */
    const grid = [cell('ninth'), cell('carried'), cell('tenth'), cell('stairs')];
    const order = casualFigureOrderOf(grid).map((c) => c.id);
    expect(order).toEqual(['carried', 'stairs', 'ninth', 'tenth']);
  });

  it('names only ids the shipped grid produces — a rank for nothing ranks nothing', () => {
    expect([...CASUAL_FIGURE_ORDER].sort()).toEqual([...SHIPPED_IDS].sort());
  });

  it('is total on an empty grid', () => {
    expect(casualFigureOrderOf([])).toEqual([]);
  });
});

describe('a Casual note leads the engineer’s note and never replaces it', () => {
  it('ends with the cell’s own note, byte for byte, on every shipped id', () => {
    for (const id of SHIPPED_IDS) {
      const source = cell(id);
      expect(casualNoteFor(source).endsWith(source.note), id).toBe(true);
    }
  });

  it('returns a cell with no lead unchanged, rather than padding it', () => {
    // `worst-wait`'s own note is the best sentence on the sheet. A lead in front of it would be
    // this layer adding length to prove it ran.
    const source = cell('worst-wait');
    expect(casualNoteFor(source)).toBe(source.note);
  });

  it('leads the four cells that carry a word about the apparatus', () => {
    for (const id of ['minute', 'average-wait', 'stairs', 'energy-work']) {
      const source = cell(id);
      expect(casualNoteFor(source).length, id).toBeGreaterThan(source.note.length);
    }
  });

  it('restates no figure — the value never appears in the note it did not already appear in', () => {
    /*
     * Rule 1 of the module: a plain retelling of a number is a second copy of a figure. The value
     * here is a string no lead could contain by accident.
     */
    const source = cell('average-wait', { value: '16.0 s', note: 'over 5 legs' });
    expect(casualNoteFor(source)).not.toContain('16.0');
  });
});

describe('a refused cell stays refused, and the ground decides only the wording', () => {
  const refused = (ground: ReportFigure['suppressionGround']): ReportFigure =>
    cell('average-wait', {
      value: 'withheld',
      tone: 'withheld',
      note: 'the queues never settled and the interval must be suppressed.',
      ...(ground === undefined ? {} : { suppressionGround: ground }),
    });

  it('carries core’s own reason verbatim, after the lead', () => {
    const source = refused('saturated');
    expect(casualNoteFor(source).endsWith(source.note)).toBe(true);
  });

  it('words the refusal differently per ground, and never as the same sentence', () => {
    const written = new Set(
      (['saturated', 'empty-window', 'censored', 'abandoned', 'starved'] as const).map((ground) =>
        casualNoteFor(refused(ground)),
      ),
    );
    expect(written.size).toBe(5);
  });

  it('falls back to the ground-free sentence when the run carries no ground', () => {
    expect(casualNoteFor(refused(undefined)).startsWith(SUPPRESSION_LEAD)).toBe(true);
  });

  it('falls back on a ground this build has no wording for — § D134’s technique', () => {
    /*
     * `record/document.ts` casts a loaded document to `VizRecording` without checking any field's
     * *value*, so a file declaring a newer `core`'s ground reaches this function in the shipped
     * path. Showing a bare code, or nothing, would turn a widened vocabulary into a suppressed
     * refusal. The cast is the point of the test.
     */
    const invented = refused('a-sixth-ground-no-core-branch-emits' as ReportFigure['suppressionGround']);
    expect(casualNoteFor(invented).startsWith(SUPPRESSION_LEAD)).toBe(true);
  });

  it('never softens the refusal into a description of the day', () => {
    // The one sentence this module was told not to write. `SATURATED` is the run saying the
    // building could not cope; *a busy day* is a weaker and different claim.
    for (const ground of ['saturated', 'empty-window', 'censored', 'abandoned', 'starved'] as const) {
      expect(casualNoteFor(refused(ground)).toLowerCase()).not.toContain('busy day');
    }
  });

  it('reads the tone and not the value, so a formatting change cannot invent a refusal', () => {
    /*
     * A cell whose *value* happens to read `withheld` but whose tone says otherwise is a figure, and
     * gets `average-wait`'s ordinary lead rather than a refusal's. Asserted because the tempting
     * implementation is `cell.value === WITHHELD`, which would make this module's wording depend on
     * a formatting decision `shift/report.ts` makes three modules away — and would print *there is
     * no number here* over a cell that has one.
     */
    const oddity = cell('average-wait', { value: 'withheld', tone: 'plain', note: 'a note' });
    const written = casualNoteFor(oddity);
    expect(written.startsWith(SUPPRESSION_LEAD)).toBe(false);
    expect(written).not.toContain('There is no number here');
    expect(written.endsWith('a note')).toBe(true);
  });
});

describe('the sentences Casual adds are as true as the ones they lead', () => {
  it('translates both terms issue #100 names for this surface', () => {
    expect(CASUAL_SMALL_PRINT_LEAD).toContain('peak-5min');
    expect(CASUAL_SMALL_PRINT_LEAD).toContain('confidence interval');
  });

  it('does not soften what one day can support', () => {
    // The small print's whole point. A lead that shortened this claim would be the module doing
    // the thing it was built to refuse.
    expect(CASUAL_SMALL_PRINT_LEAD).toContain('one day cannot clear it');
    expect(CASUAL_SMALL_PRINT_LEAD).toMatch(/fifty or more/i);
  });

  it('claims reach rather than simplicity — § D299 § 2', () => {
    expect(CASUAL_REACH_NOTE).toMatch(/every figure/i);
    expect(CASUAL_REACH_NOTE).toMatch(/never what you can reach/i);
  });

  it('does not say where the view control is', () => {
    /*
     * Issue #72 established the selector is `display: none` below about 1 180 px, and #110 § 3 that
     * it is covered while the menu is open. A sentence that is true on one viewport is § D227's
     * stale refusal, filed before it happens.
     */
    for (const place of ['top right', 'top-right', 'header', 'above']) {
      expect(CASUAL_REACH_NOTE.toLowerCase()).not.toContain(place);
    }
  });

  it('heads the levers with the question they answer', () => {
    expect(CASUAL_LEVERS_HEADING).toBe('What would make tomorrow better');
  });
});
