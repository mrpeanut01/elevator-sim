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
 * crowd"* — the comparison is against a **ghost**, and this build runs no ghost
 * (`briefView.ts#GHOST_REFUSAL` carries the evidence). So the closing block keeps the half that is
 * about this run — the sheet's own small print, which says in more words what *inside the noise*
 * means — and does not manufacture an opponent to be level with.
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
    /** The sheet's own small print, unedited — see the module docstring on what is *not* here. */
    readonly body: string;
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
      noSurfaceNote: lever.surface === undefined ? NO_SURFACE_NOTE : undefined,
    })),
    honesty: {
      title: 'This was one day',
      body: sheet.smallPrint,
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
