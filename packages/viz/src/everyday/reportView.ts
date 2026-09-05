/**
 * **How it went, as words** — GAMEPLAY § 6.5, decided here and drawn by `reportScreen.ts`.
 *
 * ## This screen renders a sheet. It does not compute one.
 *
 * `shift/report.ts#dayReportOf` produces the {@link ShapedDayReport} at close and
 * `dev/reportPanel.ts#reportViewOf` turns it into a {@link ReportView} — every figure's colour,
 * every refusal, the pairing against the run before, the count beside each paired mean, the goal
 * rows, the framing. **All of that is reused, not re-decided.** This module calls that function
 * and adds only what is true of the *Everyday* screen and of nothing else: its headings, its
 * closing block, and where its levers hand off to.
 *
 * That is not deference for its own sake. Each of those decisions was made under a defect:
 *
 * - the **withheld cell** is the literal word `withheld` and never a softened number (`docs/10`
 *   R3), and its ground rides on the cell rather than being re-derived;
 * - **energy is `axisOnly`** and is drawn with no ranking colour whatever tone it carries
 *   (§ D106 — `nearest-car` is on the Pareto front at six of eight cells by being worst on wait,
 *   so a green energy cell would rank the weakest dispatcher first);
 * - a figure's **count** is drawn beside it on both sides of a paired row and on neither side of a
 *   refused one (issue #137, R13 clause one);
 * - the **delta refuses** when the two sheets are not sheets of the same question, and the
 *   identity rows stay under the refusal because they are the reason there is not a comparison
 *   (§ D311, issues #117 and #102).
 *
 * A second implementation of any of them on this screen would be a second answer to a question
 * this repository has already been wrong about once.
 *
 * ## Casual, and what that changes — nothing that is a number
 *
 * The sheet is drawn in `basic` mode, which is `mode/casualDay.ts`'s register: it leads each cell's
 * note with a plain-language line, reorders the grid so the cell a run may refuse comes before the
 * counts of people, reframes the levers heading, and wraps the small print. It changes **no value,
 * no tone, no class and no `axisOnly`** — `figureViewOf`'s own docstring is the argument, and
 * § D299 § 1's rule is the bar: a mode may make this easier to read and may not make it say less.
 *
 * ## § 6.5's order, and the one item this build cannot supply
 *
 * The report's fixed order is head and lede · four figures · three beats · three levers · the
 * closing honesty block · what changed overnight · one button into tomorrow. Every one of those is
 * here. What is not is § 6.5's *"You finished level with the world's middle run on the same
 * crowd"*, and the reason has narrowed rather than gone away. This build **does** run a ghost now
 * (GitHub issue #226, § D482) — § 7's stage races the plain baseline or your latest saved over the
 * same crowd, live, on two lines. What it has never had is *the world's middle*: no run in this
 * build is posted anywhere, so there is no distribution to take a middle of, and the arm is omitted
 * from the picker rather than stubbed (`live/raceStrip.ts#GHOST_OPTIONS`; the missing capability is
 * GitHub issue #327). A sheet is also the wrong place for the race even where one ran — it is a
 * **filed** account of one day, and the ghost's verdict is a live reading at a playhead that the
 * strip refuses to state as proof. So the closing block keeps the half that is about this run — the
 * sheet's own small print, which says in more words what *inside the noise* means — and does not
 * manufacture an opponent to be level with.
 *
 * ## That closing block is layered rather than cut — GitHub issue #211
 *
 * It was **one paragraph of 335 words**, measured on a real Garden Apartments day: 215 from
 * `shift/report.ts#smallPrintFor` with `mode/casualDay.ts`'s 84-word lead in front of it and its
 * 36-word reach note behind. Every clause is true and worth knowing, and it was the longest
 * player-facing block in the product. {@link EverydayReportView.honesty}`.parts` is that same
 * string in {@link HonestyPart}s: one opened, the rest behind a disclosure the screen draws as a
 * `<details>`.
 *
 * **Three rules bind the layering, and each one is a defect this repository has already paid for.**
 *
 * 1. **`body` does not move.** It is still the whole block as one value, byte for byte, because
 *    `honesty/surfaces.ts` seeds it as a single `role: 'reason'` string — the longest refusal in
 *    the product. A layering that replaced the field would have taken it out of the corpus without
 *    failing anything.
 * 2. **Nothing is deleted and nothing is re-ordered.** The parts, joined by one space, *are*
 *    `body`; `reportView.test.ts` asserts that equality over a real sheet. Re-ordering is the
 *    subtler half and it is forbidden for a stated reason: Casual's lead announces *"Two phrases
 *    below are worth having before you read them"*, so hoisting the sheet's own refusal above it
 *    would read better and make that sentence false about its own page — § D227's stale-position
 *    defect, manufactured on purpose.
 * 3. **The refusal is the part that stays open.** What is drawn without a press is
 *    {@link sheetPartsOf}'s first paragraph — *this is one replication of one day on one seed, and
 *    it cannot tell you that anything is better than anything*. Folding that and leaving the
 *    translations open would be § D299's *a mode may make this easier to read and may not make it
 *    say less*, dressed as tidying.
 *
 * The seam the parts are cut on is **derived, not matched**: `sheet.smallPrint` contains
 * `report.smallPrint` byte for byte (`dev/reportPanel.ts:1466` is what guarantees it), so the two
 * values this function already holds locate the mode's front and back matter without this file
 * knowing one word of either. If that ever stops being true, {@link honestyPartsOf} lays the whole
 * block out as one block rather than losing a sentence.
 */

import type { ReportView } from '../dev/reportPanel.js';
import { reportViewOf } from '../dev/reportPanel.js';
import type { TabName } from '../dev/elementMap.js';
import type { ShapedDayReport } from '../shift/report.js';
import type { TomorrowBriefing } from '../shift/tomorrow.js';

/** One § 6.5 lever, with where it is carried out. */
export interface EverydayLeverCard {
  readonly title: string;
  readonly body: string;
  /**
   * The Engineer panel that carries this advice out, or `undefined` for a card that names none.
   *
   * `dev/reportPanel.ts#LEVER_SURFACES`' answer, unedited — **including its restraint**. Two of the
   * four cards are a *fabric* change (a car, a zoning) and name the panel that authors the building
   * document; the other two are *a different dispatcher*, and that module refuses to point at the
   * control that would make one profile beat another, because a sheet doing so would be
   * recommending a dispatch strategy off one replication (`docs/10` R2, CLAUDE.md's paired-t rule).
   * This screen does not relax that just because the Everyday brief happens to have a dispatcher
   * picker on it: the restraint is about what a *sheet* may claim, not about which screen is handy.
   */
  readonly surface: TabName | undefined;
  /**
   * What the card's button says, or `undefined` on a card that has none — issue #213.
   *
   * `undefined` exactly when {@link surface} is, and `reportView.test.ts` asserts that pairing in
   * both directions: a label with nowhere to go and a route with nothing on its face are the same
   * defect from either end.
   */
  readonly goLabel: string | undefined;
  /** What the card says instead of offering a button, when it names no surface. */
  readonly noSurfaceNote: string | undefined;
}

/** The whole screen, as data. */
export interface EverydayReportView {
  /** Whether there is a sheet at all. `false` draws {@link emptyLede} and nothing else. */
  readonly filed: boolean;
  /** The Everyday empty state — never `reportPanel.ts`'s, which names an Engineer button. */
  readonly emptyLede: string | undefined;
  /** `dev/reportPanel.ts`'s view, in Casual register. Every decision on it is that module's. */
  readonly sheet: ReportView;
  readonly headings: {
    readonly figures: string;
    readonly beats: string;
    readonly levers: string;
    readonly delta: string;
    readonly overnight: string;
  };
  readonly levers: readonly EverydayLeverCard[];
  /** § 6.5's closing honesty block. */
  readonly honesty: {
    readonly title: string;
    /**
     * The sheet's own small print, unedited — see the module docstring on what is *not* here.
     *
     * **Still one value, and that is load-bearing.** `honesty/surfaces.ts` seeds this field as a
     * single `role: 'reason'` string; {@link parts} is the same text laid out for reading, never a
     * replacement for it.
     */
    readonly body: string;
    /**
     * {@link body}, layered — issue #211. Joined by one space, in order, these *are* {@link body}.
     */
    readonly parts: readonly HonestyPart[];
    /** Where the question this sheet may not answer is answered, or `undefined` on an empty sheet. */
    readonly pointer: { readonly label: string; readonly why: string } | undefined;
  };
  /** § 6.5's one button into tomorrow, or `undefined` when there is nothing to advance from. */
  readonly tomorrow: { readonly label: string; readonly note: string } | undefined;
  /**
   * Said when a **newer, unfiled** run stands on the stage — so a reader cannot take this sheet for
   * an account of the run they can currently see. `undefined` when the sheet and the stage agree.
   */
  readonly staleNote: string | undefined;
}

/** What {@link everydayReportViewOf} is computed from. */
export interface EverydayReportInput {
  /** `host.lastReport()` — the last filed sheet, or `undefined` before any day has closed. */
  readonly report: ShapedDayReport | undefined;
  /**
   * The sheet before it, for the delta block — this screen's own {@link SheetContinuity}, rotated
   * by `dev/reportPanel.ts#rotatedOn`. Not a second memory of the panel's: that module's docstring
   * is explicit that the run a delta is against should be *the one the reader actually read*, and
   * an Everyday reader read this screen's sheets rather than the Engineer panel's.
   */
  readonly previous: ShapedDayReport | undefined;
  /** `host.tomorrowBriefing()` — what changed overnight, measured by `shift/tomorrow.ts`. */
  readonly overnight: TomorrowBriefing | undefined;
  /** Whether a run stands on the stage that this sheet is not an account of. */
  readonly newerRunOnStage: boolean;
  /**
   * The Engineer tab strip's own words, keyed by tab — for {@link EverydayLeverCard.goLabel}.
   *
   * Supplied by `reportScreen.ts`, which reads them off the page rather than tabulating them: a
   * `Record<TabName, string>` in this repository would be a second copy of a label `index.html`
   * owns, stale the day somebody renames a tab. **Optional because a caller without a document
   * cannot honestly supply one** — the honesty corpus drives this function in Node — and a card
   * whose panel is not named says the narrower true thing instead of guessing at a name.
   */
  readonly panelNames?: Readonly<Partial<Record<TabName, string>>>;
}

/**
 * The sentence for a card that names no surface — `LEVER_SURFACES`' restraint, said out loud.
 *
 * A card with no button and no explanation reads as an oversight; this is the difference between
 * *we did not wire it* and *a sheet may not send you there*.
 */
const NO_SURFACE_NOTE =
  'No button here on purpose: this is advice about which dispatcher to bring, and one day is not ' +
  'evidence about that. The bench runs the comparison properly.';

/** The Everyday empty state. Names no Engineer control — § 16 rule 11's neighbouring rule. */
const EMPTY_LEDE =
  'No day has been closed yet, so there is nothing to report. Set up a day at the front door, ' +
  'watch it, and press Close the day — that is the only thing that writes this sheet.';

/* -------------------------------------------------------------------------- *
 * The closing block, layered — GitHub issue #211
 * -------------------------------------------------------------------------- */

/**
 * One piece of § 6.5's closing block.
 *
 * `open` is drawn as a paragraph and is always read. `fold` is a disclosure: its {@link handle} is
 * the layer's own first sentence — drawn always, and the thing a reader presses — and its
 * {@link paragraphs} are what opens. **The handle is a sentence of the block rather than a label
 * this screen wrote**, which is why the layering adds no string a player can read and the honesty
 * corpus has nothing new to sweep.
 */
export type HonestyPart =
  | { readonly kind: 'open'; readonly text: string }
  | {
      readonly kind: 'fold';
      readonly handle: string;
      /** Never empty — a fold with nothing behind it is a control that does nothing. */
      readonly paragraphs: readonly string[];
    };

/**
 * **The stated length budget for this copy slot** — issue #211's first acceptance criterion, for
 * the one slot this lane owns.
 *
 * Both numbers are ceilings rather than targets, and they are held by a case in
 * `reportView.test.ts` over a **real** sheet rather than a fixture — the whole point of a budget is
 * that it is measured against the copy that actually ships.
 *
 * - `open` is every word drawn before a reader presses anything: the open paragraph plus each
 *   fold's handle. On the measured day that is 91 of 335.
 * - `paragraph` is the ceiling for any one block of prose, opened or folded. It is what stops the
 *   fix from being *one shorter wall and one longer one*.
 */
export const SMALL_PRINT_BUDGET = Object.freeze({ open: 110, paragraph: 70 });

/**
 * Sentences, split on the space between them and on nothing else.
 *
 * The lookahead is what keeps `06:05–06:10:` and `“Riders waited twenty-five seconds on average”`
 * inside their own sentences: a split needs a terminator behind it *and* a capital or an opening
 * quote in front. Joined back with one space this is the input exactly, which is the property
 * every case downstream of it rests on.
 */
function sentencesOf(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/(?<=[.!?][”’"']?) (?=[“"'(A-Z])/u);
}

const wordsIn = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

/** Sentences gathered into paragraphs, each under the budget unless one sentence exceeds it alone. */
function grouped(sentences: readonly string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const length = wordsIn(sentence);
    if (current.length > 0 && words + length > SMALL_PRINT_BUDGET.paragraph) {
      groups.push(current);
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

const paragraphed = (sentences: readonly string[]): string[] =>
  grouped(sentences).map((group) => group.join(' '));

/**
 * A layer the mode wraps the sheet in, folded behind its own opening sentence.
 *
 * A single-sentence layer comes back `open`: a disclosure whose handle is the whole of its content
 * is a control that reveals nothing, which is the *dead seam* shape one level down from where this
 * repository usually finds it.
 */
function foldOf(text: string): HonestyPart | undefined {
  const [handle, ...tail] = sentencesOf(text);
  if (handle === undefined) return undefined;
  if (tail.length === 0) return { kind: 'open', text: handle };
  return { kind: 'fold', handle, paragraphs: paragraphed(tail) };
}

/**
 * The sheet's own words: its opening paragraph drawn, the rest folded behind its next sentence.
 *
 * The opening paragraph is where the refusal lives, and it is the one part of this block that may
 * not be behind a press — see the module docstring's rule 3.
 */
function sheetPartsOf(core: string): HonestyPart[] {
  const groups = grouped(sentencesOf(core));
  const lead = groups[0];
  if (lead === undefined) return [];
  const rest = groups.slice(1).flat();
  const tail = foldOf(rest.join(' '));
  return [{ kind: 'open', text: lead.join(' ') }, ...(tail === undefined ? [] : [tail])];
}

/**
 * {@link EverydayReportView.honesty}`.body`, laid out — and the seam is derived rather than matched.
 *
 * `reportViewOf` composes Casual's block as `${lead} ${core} ${reach}` with `core` — the shaped
 * sheet's own `smallPrint` — sitting between them **byte for byte**, which is § D299's rule and the
 * thing `dev/reportPanel.ts:1461` exists to state. So `indexOf` finds the sheet's words inside the
 * block and the two wings fall out of the slices, without this module knowing a word of either.
 *
 * When it is not found — the Engineer register, where the block *is* the core, or a mode that
 * one day composes differently — the whole block is laid out as one block. That is the safe
 * direction: fewer folds, never a lost sentence.
 */
function honestyPartsOf(body: string, core: string | undefined): HonestyPart[] {
  const at = core === undefined || core.trim() === '' ? -1 : body.indexOf(core);
  if (at < 0 || core === undefined) return sheetPartsOf(body);
  const front = foldOf(body.slice(0, at));
  const back = foldOf(body.slice(at + core.length));
  return [
    ...(front === undefined ? [] : [front]),
    ...sheetPartsOf(core),
    ...(back === undefined ? [] : [back]),
  ];
}

/* -------------------------------------------------------------------------- *
 * The lever hand-off — GitHub issue #213
 * -------------------------------------------------------------------------- */

/**
 * What a routed lever's button says — **authored here rather than in the mount, deliberately.**
 *
 * `honesty/derive.test.ts` excludes `everyday/reportScreen.ts#REPORT_SCREEN` from the sweep on the
 * DOM mounts' shared ground, on the stated understanding that *what the four mounts author of their
 * own is geometry, class names and floor labels*. This string is none of those: it is a claim about
 * what pressing a button does, and it was being composed inside the one half of this screen no
 * sweep reads. That is why issue #213's defect survived — a button promising *the Building panel*
 * while its handler opened the Everyday day stage was swept by nothing.
 *
 * It reaches the view as {@link EverydayLeverCard.goLabel} rather than as an exported function of
 * its own, which is not a style choice: a second exported text producer in this module would be a
 * declaration `honesty/surfaces.ts` has to name in an adapter, and this lane may not edit that
 * file — `derive.test.ts` fails on an unclassified producer, which is the guard working. On the
 * card it is inside `everydayReportViewOf`, which that adapter already covers, so seeding it is one
 * line in a loop `surfaces.ts` already walks.
 *
 * The panel's name is still **read from the Engineer tab button in the page** rather than tabulated
 * (see `reportScreen.ts`' docstring), so it arrives as a string that may be absent; with no such
 * button the label names the simulator without naming a panel, which is a narrower claim rather
 * than a wrong one, and is exactly what the press then does.
 */
function leverButtonLabel(panel: string | undefined): string {
  return panel === undefined || panel === ''
    ? 'Open the simulator'
    : `Open the simulator’s ${panel} panel`;
}

/** § 6.5, resolved. */
export function everydayReportViewOf(input: EverydayReportInput): EverydayReportView {
  const sheet = reportViewOf(
    input.report,
    { kind: 'played-out' },
    input.previous,
    input.overnight,
    // Casual. See the module docstring for exactly what this changes and what it may not.
    'basic',
  );
  const framing = sheet.framing;
  const canAdvance = framing.kind === 'week-day' && framing.canAdvance && sheet.filed;
  return {
    filed: sheet.filed,
    emptyLede: sheet.filed ? undefined : EMPTY_LEDE,
    sheet,
    headings: {
      figures: 'HOW THE DAY CAME OUT',
      beats: sheet.diagnosisHeading,
      /*
       * `reportViewOf` returns Casual's own levers heading in this register and `undefined` in the
       * other, where it means *keep what `index.html` authored*. This screen authors no markup, so
       * there is nothing to keep: the fallback is the guide's own § 6.5 wording for the section.
       */
      levers: sheet.leversHeading ?? 'What would have helped',
      delta: sheet.delta?.caption ?? '',
      overnight: 'What changed overnight',
    },
    levers: sheet.levers.map((lever) => ({
      title: lever.title,
      body: lever.body,
      surface: lever.surface,
      goLabel:
        lever.surface === undefined
          ? undefined
          : leverButtonLabel(input.panelNames?.[lever.surface]),
      noSurfaceNote: lever.surface === undefined ? NO_SURFACE_NOTE : undefined,
    })),
    honesty: {
      title: 'This was one day',
      body: sheet.smallPrint,
      parts: honestyPartsOf(sheet.smallPrint, input.report?.smallPrint),
      pointer:
        sheet.nextStep === undefined
          ? undefined
          : { label: sheet.nextStep.label, why: sheet.nextStep.why },
    },
    tomorrow: canAdvance
      ? {
          label: framing.kind === 'week-day' ? framing.nextDayLabel : '',
          note: 'Opens tomorrow’s day and starts it. Today stays in your week exactly as it is.',
        }
      : undefined,
    staleNote: input.newerRunOnStage
      ? 'A newer run is standing on the stage and has not been closed. This sheet is the last day ' +
        'you closed, not that run — close the day to replace it.'
      : undefined,
  };
}
