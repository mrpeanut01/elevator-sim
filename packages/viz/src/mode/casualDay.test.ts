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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

  it('marks the seam between the two registers — docs/19 defect 8', () => {
    /*
     * The engineer's notes are grid captions, not sentences — *"waited past the 15-minute
     * horizon…"* — and joined to a lead with a bare space they read as broken prose. The lead
     * branch now announces the register change the way the refusal branch always has ("The
     * measurement's reason follows, in its own words."), so a led note carries a seam and an
     * unled note carries none.
     */
    for (const id of ['minute', 'average-wait', 'stairs', 'energy-work']) {
      const source = cell(id);
      expect(casualNoteFor(source), id).toContain('The cell’s own note:');
    }
    expect(casualNoteFor(cell('worst-wait'))).not.toContain('The cell’s own note:');
  });

  it('claims nothing about which day it is drawn on — docs/19 defect 8’s AWAY caption', () => {
    /*
     * The old `minute` lead said the average below it *is* refused, which was false on every day
     * the average printed. A static lead cannot know the day, so the wording must be generic —
     * asserted as the conditional's presence and the indicative's absence.
     */
    const written = casualNoteFor(cell('minute'));
    expect(written).toContain('even on days');
    expect(written).not.toContain('which is why this figure is still here');
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

/* -------------------------------------------------------------------------- *
 * The rule the lead table keeps — derived from the table, never from an entry
 * -------------------------------------------------------------------------- */

/**
 * `CASUAL_LEAD_BY_CELL`'s own keys, read off the module's source.
 *
 * **Why the source and not the object.** The table is deliberately not exported —
 * `mode/disclosure.ts#CASUAL_LEAD_BY_FIGURE`'s reason, quoted in `casualDay.ts`: a new exported
 * prose declaration is an unclassified surface to `honesty/derive.test.ts`, so exporting it to make
 * this suite easier would put a hole in the search to close one here. Reading the declaration off
 * disk is `shift/week.test.ts`'s technique and `honesty/derive.test-helper.ts`'s whole method,
 * pointed at one object.
 *
 * Only the **keys** come from source. Every lead's **text** is taken from {@link casualNoteFor}'s
 * actual return value below, so nothing here re-implements string concatenation, escapes or the
 * seam — the scan cannot disagree with the shipped words, because it never reads them.
 */
function declaredLeadIds(): readonly string[] {
  const source = readFileSync(fileURLToPath(new URL('./casualDay.ts', import.meta.url)), 'utf8');
  const opened = source.indexOf('const CASUAL_LEAD_BY_CELL');
  expect(opened, 'CASUAL_LEAD_BY_CELL is not declared under that name any more').toBeGreaterThan(-1);
  const from = source.indexOf('Object.freeze({', opened);
  const to = source.indexOf('\n});', from);
  expect(to, 'the lead table no longer closes with a top-level `});`').toBeGreaterThan(from);
  /* Comments blanked, not deleted — `derive.test-helper.ts#blankComments`' reason, minus offsets. */
  const body = source.slice(from, to).replace(/\/\*[\s\S]*?\*\//g, ' ');
  return [...body.matchAll(/^ {2}'?([A-Za-z][\w-]*)'?:/gm)].map((found) => found[1] as string);
}

/**
 * The lead {@link casualNoteFor} puts in front of a cell, or `undefined` where it adds none.
 *
 * Recovered by subtraction rather than by re-reading the table: the note this drives with is a
 * string no lead could contain, so whatever precedes the seam is the lead exactly as it shipped.
 */
function leadFor(id: string): string | undefined {
  const source = cell(id, { note: 'ZZ-NOTE-ZZ' });
  const written = casualNoteFor(source);
  if (written === source.note) return undefined;
  const seam = written.indexOf('The cell’s own note:');
  expect(seam, `a led note for "${id}" carried no seam`).toBeGreaterThan(0);
  return written.slice(0, seam).trim();
}

/**
 * The forms a **static** lead may not take, each with the per-run fact it would be asserting.
 *
 * The rule is written in `casualDay.ts` on the `minute` entry — *"a static lead keyed on a cell id
 * cannot know which day it is drawn on, so it may only say things that are true of every day"* —
 * and GitHub issue #291 is what happens when only the day half of it is read. `average-wait` said
 * *"Averaged over the busiest five minutes of the day"* on a sheet whose window
 * `shift/reportWindow.ts` had already made `full-run`. The window is a per-run fact exactly as the
 * day is.
 *
 * ## What this catches, and what it does not — stated rather than discovered
 *
 * It catches a lead that **names a measurement basis**: a superlative window (*the busiest five
 * minutes*), a window id the product prints (*peak-5min*, *full-run*), a clock time, a counted span
 * of time, or the whole-run phrasings `honesty/properties.ts#NAMES_ITS_OWN_WINDOW` already
 * enumerates for the other side of the same question. It also catches the four deictics that can
 * only mean *this* run.
 *
 * It does **not** catch an arbitrary per-run claim in general. The `minute` entry's original defect
 * — *"which is why this figure is still here on a day the average below it is refused"* — is an
 * indicative mood rather than a vocabulary, and no regex separates that from the conditional that
 * replaced it. So the day half of the rule keeps its own entry-specific case above, and this sweep
 * is the window half plus what generalises. That is a deliberate under-match on § D346's precedent,
 * and it is named here so the next reader does not mistake a green for the whole rule.
 *
 * The patterns are deliberately **not** keyed on *day*, *building* or *sheet*: `stairs` says *"this
 * building made stand past its give-up line"* and `energy-work` says *"a day that spends less"*,
 * both of which are true of every run, and a check that refused them would be refusing the voice
 * rather than the claim. The last case below holds that narrowing open.
 */
/**
 * A static string **ruling a window out** — the shape both of issue #291's sentences shared.
 *
 * `average-wait` said *"rather than over all of it"*; `CASUAL_SMALL_PRINT_LEAD` said *"and not over
 * the whole shift"*. Naming a window is not by itself the defect — the sheet's own note names one
 * on every run, and a glossary that explains both ids has to name both. Saying which one this sheet
 * is **not** read over is the defect, because that is a claim about the run in a string that cannot
 * see it, and it is the half that survives a reader who skims.
 *
 * It is the sharper of the two instruments here and it is not a substitute for the other: a lead
 * that merely asserted *"averaged over the busiest five minutes"* with no contrast rules nothing
 * out and would pass this. Both run over the lead table; only this one runs over the glossary.
 */
const EXCLUDES_A_WINDOW = /\b(?:not|rather than|instead of)\s+(?:over\s+)?(?:the\s+)?(?:whole|entire|full|all)\b/i;

const PER_RUN_BASIS: readonly { readonly names: string; readonly pattern: RegExp }[] = Object.freeze(
  [
    {
      names: 'a superlative window — the defect issue #291 reports',
      pattern:
        /\b(?:busiest|tightest|peak|quietest)\s+(?:\w+\s+){0,3}(?:minutes?|seconds?|hours?|window|band|stretch|moment)\b/i,
    },
    {
      names: 'a window id the sheet derives from the run',
      pattern: /\b(?:peak-\d+\w*|full-run|report-window)\b|\b(?:peak|reporting|measurement)\s+window\b/i,
    },
    {
      names: 'a counted span of time — a window stated as its length',
      pattern:
        /\b(?:\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|sixty)[\s-](?:minutes?|seconds?|hours?)\b/i,
    },
    { names: 'a clock time', pattern: /\b\d{1,2}:\d{2}\b/ },
    {
      names: 'the whole run named as this figure’s basis — NAMES_ITS_OWN_WINDOW’s shape',
      pattern:
        /\b(?:over|across|during)\s+(?:the\s+)?(?:whole|entire|full|all)\b|\bwhole[- ](?:day|run|shift)\b/i,
    },
    {
      names: 'a deictic that can only mean this run',
      pattern: /\b(?:today|tonight|yesterday|tomorrow)\b/i,
    },
    { names: 'a window ruled out', pattern: EXCLUDES_A_WINDOW },
  ],
);

/** Every basis {@link PER_RUN_BASIS} finds in one string, named. */
function basesNamedIn(text: string): readonly string[] {
  return PER_RUN_BASIS.filter((rule) => rule.pattern.test(text)).map((rule) => rule.names);
}

describe('a static lead may not state a per-run fact — GitHub issue #291', () => {
  it('finds the table’s entries from the table, so a new lead is swept without an edit here', () => {
    /*
     * The scan and the shipped behaviour are checked against each other in **both** directions,
     * because a key scan that silently found nothing would make every assertion below vacuous —
     * § D152's failure, a list that looks derived because it happens to fit.
     */
    const declared = declaredLeadIds();
    expect(declared.length).toBeGreaterThan(0);
    for (const id of declared) expect(leadFor(id), `declared "${id}" leads nothing`).toBeDefined();
    for (const id of CASUAL_FIGURE_ORDER) {
      if (leadFor(id) === undefined) continue;
      expect(declared, `"${id}" is led at runtime and the scan missed it`).toContain(id);
    }
  });

  it('states no window, clock or day in any lead the table carries', () => {
    for (const id of declaredLeadIds()) {
      const lead = leadFor(id) ?? '';
      expect(basesNamedIn(lead), `${id}: ${lead}`).toEqual([]);
    }
  });

  it('would have caught the sentence it was written against', () => {
    /*
     * The instrument, driven against the words that shipped. A check like this is worth nothing
     * until something is known to move it, and the thing it must move on is the exact string
     * `casualDay.ts:196` carried at `55f2bca`.
     */
    const shipped =
      'Averaged over the busiest five minutes of the day rather than over all of it: this is what ' +
      'a wait came to when the building was under the most pressure, which is the stretch worth ' +
      'judging it on.';
    expect(basesNamedIn(shipped)).toContain(PER_RUN_BASIS[0]?.names);
    expect(shipped).toMatch(EXCLUDES_A_WINDOW);
  });

  it('leaves the voice the other three leads are written in alone', () => {
    /*
     * The narrowing, asserted rather than promised. These are the phrases a blunter rule would
     * have refused, and every one of them is true on every run.
     */
    for (const phrase of [
      'so it stays on this sheet even on days the average below it is refused',
      'People this building made stand past its give-up line',
      'a day that spends less by carrying fewer people has not saved anything',
      'which stretch of the day it was read over',
    ]) {
      expect(basesNamedIn(phrase), phrase).toEqual([]);
    }
  });
});

describe('the Casual sheet names one window and only one — issue #291 AC3', () => {
  /**
   * What each window id looks like when a **person** reads it, on the surfaces that name one.
   *
   * `shift/report.ts` prints `summary.reportWindow.id` into the cell's own note and into the small
   * print, and the Casual layer wraps both. So a sheet names its window in the run's own
   * vocabulary, and a static string naming a different one is the contradiction — which is a
   * property of the pair rather than of either string, and is why it is checked over the assembled
   * sheet rather than on one entry.
   */
  const WINDOW_VOICE: Readonly<Record<string, RegExp>> = Object.freeze({
    'full-run': /\bfull-run\b|\bwhole shift\b|\bwhole day\b|\bover all of it\b/i,
    'peak-5min': /\bpeak-5min\b|\bbusiest five minutes\b|\bpeak window\b/i,
  });

  const windowsNamedIn = (text: string): readonly string[] =>
    Object.entries(WINDOW_VOICE)
      .filter(([, pattern]) => pattern.test(text))
      .map(([id]) => id);

  for (const id of ['full-run', 'peak-5min']) {
    it(`names ${id} and nothing else when the run was read over ${id}`, () => {
      /*
       * Garden Apartments day 1 is the `full-run` arm and is the sheet issue #291 was reported on —
       * `shift/reportWindow.ts` gives that building `full-run` because both its matrix cells do.
       * The `peak-5min` arm is every other shipped building, and it is here because a fix that
       * merely swapped one hardcoded window for the other would pass one arm and fail this one.
       */
      const sheet = CASUAL_FIGURE_ORDER.map((cellId) =>
        casualNoteFor(cell(cellId, { note: `over 55 legs in the ${id} window` })),
      ).join(' ');
      expect(windowsNamedIn(sheet)).toEqual([id]);
    });
  }

  it('leaves the window to the run on the small print too — issue #291’s second half', () => {
    /*
     * The lead the issue does not name, and the more serious of the two.
     * `dev/reportPanel.ts#reportViewOf` joins `CASUAL_SMALL_PRINT_LEAD` to `shift/report.ts`'s
     * paragraph with a single space, so on a `full-run` sheet the old wording put *"taken over that
     * stretch and not over the whole shift"* two sentences from the run's own *"is false without
     * 'over the whole shift'"*. Fixing the cell lead alone would have left this suite's other case
     * red, which is the acceptance criterion doing its job.
     *
     * The rule here is **not** {@link PER_RUN_BASIS}: this constant is a glossary and issue #100
     * requires it to translate the window vocabulary, so naming a window is its job. What it may
     * not do is pick one — asserted as *both ids present* and *neither ruled out*.
     */
    expect([...windowsNamedIn(CASUAL_SMALL_PRINT_LEAD)].sort()).toEqual(['full-run', 'peak-5min']);
    expect(CASUAL_SMALL_PRINT_LEAD).not.toMatch(EXCLUDES_A_WINDOW);
    expect(CASUAL_REACH_NOTE).not.toMatch(EXCLUDES_A_WINDOW);
  });

  it('would have caught the small print that shipped, and by the rule that permits a glossary', () => {
    /*
     * The instrument against the words at `55f2bca`. The old string names both ids too — *"the
     * peak-5min window"* and *"not over the whole shift"* — so the first assertion above passes on
     * it and only the exclusion catches it. That is why both are here rather than one.
     */
    const shipped =
      'Two phrases below are worth having before you read them. “The peak-5min window” is the ' +
      'busiest five minutes of the day: the averages here are taken over that stretch and not ' +
      'over the whole shift, so a wait quoted on this sheet is a wait during the worst of it.';
    expect([...windowsNamedIn(shipped)].sort()).toEqual(['full-run', 'peak-5min']);
    expect(shipped).toMatch(EXCLUDES_A_WINDOW);
  });
});
