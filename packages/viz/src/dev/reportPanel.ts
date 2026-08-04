/**
 * The Day report on screen — `docs/12-design-handoff.md` § 1.3 **M6**.
 *
 * ## This module draws a `DayReport`. It does not compute one.
 *
 * `shift/report.ts` has already made every decision the sheet embodies: which figures appear, what
 * each says, which one is refused and on what grounds, what the diagnosis rows are derived from,
 * and which clock times the run actually had. That module's docstring is the argument; this one is
 * the pane of glass in front of it.
 *
 * The separation is not tidiness. **The structural form of *never display a suppressed mean* is
 * that the renderer cannot compute a mean at all.** There is no arithmetic in this file — no
 * `toFixed`, no division, no `Math.round`, no fallback for a value the shift layer withheld. When
 * the run saturated, {@link ReportFigure.value} is the literal {@link WITHHELD} and the note is the
 * run's own `awtInvalidReason`, and the only thing this module does with either is put it in a
 * `textContent`. A renderer that reformatted the figure could reformat it wrongly; a renderer with
 * no formatter cannot. `reportPanel.test.ts` asserts the drawn cell contains no digit.
 *
 * ## Energy has no colour here, and that is a rule rather than a default
 *
 * [§ D106](../../../../DECISIONS.md): energy is **an axis, never a score**. Measured across the full
 * experiment matrix, `nearest-car` — the weakest shipped dispatcher — sits on the Pareto front at
 * six of eight cells precisely because it is best on energy and worst on wait, so a green `workKJ`
 * would congratulate the dispatcher that carries fewest people. {@link figureViewOf} therefore
 * returns **no colour and no ranking class** for any figure carrying {@link ReportFigure.axisOnly},
 * whatever its tone; the two energy cells are drawn in the same `.figure` component as every other
 * cell, side by side, and nothing on this sheet sums or ranks them.
 *
 * ## Colour is never the only signal — KB-15
 *
 * Every tone maps to a colour *and* is already carried by the words `shift/report.ts` put in the
 * note, which is why the note is not optional in {@link FigureView}. The goal rows go further and
 * carry a glyph (`✓ ○ ·`, from `shift/goals.ts`) plus a `title` naming the state in words, because
 * the met/missed pair differs by a green that reads as grey under `prefers-contrast`.
 *
 * ## The pure part and the dumb part
 *
 * `controls/render.ts` established the split this package uses everywhere: the *decision* is a pure
 * function returning a descriptor, and the DOM is the instantiator. There is no jsdom in this
 * repository (`vitest.config.ts` is `environment: 'node'` for every project), so a decision left
 * inside a mount is a decision no test can reach. {@link reportViewOf} is therefore the whole of
 * this surface's judgement — including the empty state — and {@link mountReport} writes it.
 *
 * ## A slot with nothing to say is hidden, not emptied
 *
 * A sheet arrives here of one of two shapes (`shift/report.ts`'s `ShapedDayReport`), and on a
 * single run five of the week's statements do not exist. This module draws that as **absence**:
 * {@link ReportView.framing} carries no key for them at all, and the render hides the streak span,
 * the contract span, the cleared banner, the *Tomorrow* card, the *What this taught* card and the
 * *Open the doors on…* button. Writing `''` into each would leave a captioned empty box — `docs/10`
 * R3's *blank where a number should be*, at the layout's scale — and a reader cannot tell that from
 * a surface that failed to load.
 *
 * Two of those are **cards whose caption is a sibling of the field**: `index.html` gives the id to
 * `#report-forecast-name` and `#report-taught`, not to the box drawn around them, so hiding the
 * field alone would leave the words *Tomorrow* and *What this taught* standing over nothing. Until
 * the markup carries an id of its own, {@link cardOf} climbs one level, and it climbs exactly one.
 */

import { GOAL_GLYPHS } from '../shift/goals.js';
import { contractById } from '../shift/contracts.js';
import type { ReportNextStep, ShapedDayReport } from '../shift/report.js';
import type {
  ClearedAward,
  DayReport,
  FigureTone,
  GoalReading,
  ReportDiagnosis,
  ReportFigure,
  ReportLever,
} from '../shift/types.js';
import { nextDay, takeContract } from '../shift/week.js';

import { el, figure, fill, setHidden, setStyle, setText } from './dom.js';
import type { ReportElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';

/* -------------------------------------------------------------------------- *
 * The view — every string and every colour this surface will show
 * -------------------------------------------------------------------------- */

/** One cell of the figure grid, ready to instantiate. */
export interface FigureView {
  readonly label: string;
  readonly value: string;
  /**
   * The line under the figure. **Not optional**: it carries the denominator, the window or the
   * refusal's reason, and it is the non-colour half of every signal on this grid (KB-15).
   */
  readonly note: string;
  /** Classes for the `.figure` component. Never keyed on a figure id — `dev/dom.ts`'s rule. */
  readonly classes: readonly string[];
  /** An inline colour for the value, or `undefined` for *do not rank this*. */
  readonly colour: string | undefined;
}

/** One row of *The shift asked for*. */
export interface GoalRowView {
  readonly glyph: string;
  readonly label: string;
  /** The observed value, or the em dash while the building has not woken up. */
  readonly display: string;
  readonly colour: string;
  readonly background: string;
  /** The state in words, as a `title`. The glyph is the shorthand; this is the message. KB-15. */
  readonly help: string;
}

/** One row of *Where it went wrong*. */
export interface DiagnosisRowView {
  readonly when: string;
  readonly what: string;
  readonly why: string;
  /** The 2 px left rule's colour. */
  readonly accent: string;
}

/** One card of *Levers you actually have*. */
export interface LeverRowView {
  readonly title: string;
  readonly body: string;
}

/** The green banner, present only on the day that banked the last clean shift. */
export interface ClearedBannerView {
  readonly note: string;
  /** The contract to take, or `null` at the end of the list — the button then just goes back. */
  readonly nextContractId: string | null;
}

/** Tomorrow's card. */
export interface ForecastView {
  readonly name: string;
  readonly note: string;
  readonly demand: string;
}

/**
 * The half of the sheet that is a statement about a **week**, present only when there is one.
 *
 * A single run's view does not carry these keys with empty values — it does not carry them. See the
 * module docstring.
 */
export interface WeekFramingView {
  readonly kind: 'week-day';
  readonly streakLine: string;
  readonly contractLine: string;
  readonly cleared: ClearedBannerView | null;
  readonly forecast: ForecastView;
  readonly taught: string;
  /** `Open the doors on Wednesday`. */
  readonly nextDayLabel: string;
  /** Whether the two CTAs do anything. Nothing to advance from before a day has been filed. */
  readonly canAdvance: boolean;
}

/**
 * The half that is a statement about **one run** — and it is now only the discriminator.
 *
 * `nextStep` used to live here, which made *where to take this question* a property of the Free Play
 * sheet. It is a property of **both**: `docs/17` § 5 clause 7 is *the report never points at
 * Compare*, and a player finishing a campaign day has just read a levers card saying *try a
 * different dispatcher — a smarter one is free*, which is the question in as many words. It moved to
 * {@link ReportView}.
 */
export interface SingleRunFramingView {
  readonly kind: 'single-run';
}

/** Which shape of sheet this is. Exhaustive: a third member is a compile error at every branch. */
export type FramingView = WeekFramingView | SingleRunFramingView;

/** Everything the sheet shows, in one value. The empty state is a member of this type, not a hole. */
export interface ReportView {
  /** `false` before any shift has been closed. The sheet is drawn either way — it is never hidden. */
  readonly filed: boolean;
  /**
   * Where the question this sheet may not answer is answered — on **both** shapes of sheet.
   *
   * The strings are `shift/report.ts`'s, unread and unedited. A pointer at Compare composed here
   * would be this module deciding what the product's only comparison surface is for, which is a
   * decision — and every decision on this surface lives in a pure module that a test can reach.
   *
   * `undefined` on the empty sheet, and only there: nothing has been run, so there is no question
   * yet to send anywhere.
   */
  readonly nextStep: ReportNextStep | undefined;
  readonly title: string;
  readonly metaLines: readonly string[];
  readonly lede: string;
  readonly figures: readonly FigureView[];
  readonly verdictLine: string;
  readonly verdictColour: string;
  readonly goals: readonly GoalRowView[];
  readonly diagnosis: readonly DiagnosisRowView[];
  readonly levers: readonly LeverRowView[];
  readonly smallPrint: string;
  /** What this is a sheet **of** — and the whole of what differs between the two shapes. */
  readonly framing: FramingView;
}

/* -------------------------------------------------------------------------- *
 * Tones
 * -------------------------------------------------------------------------- */

/**
 * A tone's colour, as a token rather than a hex triple.
 *
 * The band colours are `index.html`'s `--band-0…3`, which the canvas, the rail and this sheet all
 * read, so the three surfaces cannot disagree about what amber means (§ 1.1 S7). `plain` has no
 * colour at all — the stylesheet's own `--text` is the right answer and repeating it inline would
 * be a fourth copy of a palette this refactor spent a commit removing.
 *
 * `unranked` returns `undefined` and is the reason this function exists as its own name: it is not
 * "we could not decide", it is *this quantity may not be ranked*. See the module docstring.
 */
export function toneColourOf(tone: FigureTone): string | undefined {
  switch (tone) {
    case 'plain':
      return undefined;
    case 'good':
      return 'var(--ok)';
    case 'caution':
      return 'var(--warn)';
    case 'hot':
      return 'var(--band-2)';
    case 'bad':
      return 'var(--bad)';
    case 'withheld':
      return 'var(--warn)';
    case 'unranked':
      return undefined;
  }
}

/**
 * The `.figure` classes a tone earns.
 *
 * `figure-suppressed` is what the shipped viewer's run summary already uses for a refused
 * statistic, so a reader who has seen one recognises the other; `figure-observation` carries no
 * colour rule of its own, which is what makes it the right class for an unranked axis.
 */
function toneClassesOf(tone: FigureTone): readonly string[] {
  switch (tone) {
    case 'withheld':
      return ['figure-suppressed', 'figure-warning'];
    case 'caution':
    case 'hot':
    case 'bad':
      return ['figure-warning'];
    case 'plain':
    case 'good':
    case 'unranked':
      return ['figure-observation'];
  }
}

/**
 * One figure, as it will be drawn — and the one place `axisOnly` is enforced.
 *
 * The `axisOnly` branch is checked **before** the tone, not merged with it. Reading the tone first
 * and trusting it to be `unranked` would make the guard depend on two fields agreeing; this way an
 * energy cell that somehow arrived carrying `tone: 'good'` still draws with no ranking colour and
 * no warning class, and `reportPanel.test.ts` asserts exactly that case.
 */
export function figureViewOf(cell: ReportFigure): FigureView {
  if (cell.axisOnly) {
    return {
      label: cell.label,
      value: cell.value,
      note: cell.note,
      // `figure-axis` styles nothing. It is a marker so a reviewer reading the DOM can see that
      // the absence of colour here is deliberate rather than an omission.
      classes: ['figure-observation', 'figure-axis'],
      colour: undefined,
    };
  }
  return {
    label: cell.label,
    value: cell.value,
    note: cell.note,
    classes: toneClassesOf(cell.tone),
    colour: toneColourOf(cell.tone),
  };
}

/* -------------------------------------------------------------------------- *
 * The rows
 * -------------------------------------------------------------------------- */

/** The design's two goal-row treatments, widened to the third state the implementation has. */
export function goalRowViewOf(reading: GoalReading): GoalRowView {
  const dressing =
    reading.state === 'met'
      ? { colour: 'var(--ok)', background: 'rgb(63 178 127 / 0.07)', help: 'met' }
      : reading.state === 'missed'
        ? { colour: 'var(--bad)', background: 'rgb(224 71 58 / 0.07)', help: 'missed' }
        : /*
           * The design has no third row treatment because its prototype grades everything. `pending`
           * is not a miss — under `WAKE_UP_ARRIVALS` arrivals nothing is graded at all (§ 1.5 B3) —
           * so it is drawn as neither, in the dim ink an ungraded row deserves, and the `title`
           * says why rather than leaving a reader to read a grey tick as a failure.
           */
          {
            colour: 'var(--dimmer)',
            background: 'transparent',
            help: 'not graded — the building had not woken up',
          };
  return {
    glyph: GOAL_GLYPHS[reading.state],
    label: reading.goal.label,
    display: reading.display,
    ...dressing,
  };
}

export function diagnosisRowsOf(rows: readonly ReportDiagnosis[]): readonly DiagnosisRowView[] {
  return rows.map((row) => ({
    when: row.when,
    what: row.what,
    why: row.why,
    // A row with nothing to flag gets the ordinary edge, not a colour that implies a verdict.
    accent: toneColourOf(row.tone) ?? 'var(--edge-strong)',
  }));
}

export function leverRowsOf(levers: readonly ReportLever[]): readonly LeverRowView[] {
  return levers.map((lever) => ({ title: lever.title, body: lever.body }));
}

/**
 * The card drawn around a field, or the field itself when there is no card.
 *
 * One level, never a walk. `index.html` puts the eyebrow (*Tomorrow*, *What this taught*) beside
 * the field rather than inside it, so hiding the field alone leaves its caption standing over an
 * empty box — the failure this whole change is about, reproduced one element down. The fallback is
 * the node itself so a markup change that removes the wrapper degrades to *hide the words* rather
 * than to a thrown handler in a render loop.
 */
function cardOf(node: HTMLElement): HTMLElement {
  return node.parentElement ?? node;
}

function clearedBannerOf(award: ClearedAward | null): ClearedBannerView | null {
  if (award === null) return null;
  return {
    note: `${award.reward} — try ${award.nextTitle} next`,
    nextContractId: award.nextContractId,
  };
}

/* -------------------------------------------------------------------------- *
 * The two states
 * -------------------------------------------------------------------------- */

/**
 * The empty sheet — `docs/12` § 2.2's *"the handoff specifies the empty case … report reads
 * **Nothing filed yet***.
 *
 * Drawn rather than hidden. A tab that opens onto a blank panel reads as a broken surface; a sheet
 * that says nothing has been filed reads as a sheet, and it is where a reader learns the sheet
 * exists before they have a day to put on it.
 *
 * The lede is the design's (`design.html` :3464) with **one substitution**: its sentence names a
 * *Close the day* button, and this implementation has no such control — the day is filed by running
 * a shift. Printing the design's own wording would be a caption naming a button that is not on the
 * screen, which is the class of defect § 4.1 exists to refuse. The rest of the sentence is verbatim.
 */
export function emptyReportView(): ReportView {
  return {
    filed: false,
    title: 'Nothing filed yet',
    metaLines: [],
    lede: 'Play a day through — press “Run this shift” — and the sheet fills itself in.',
    figures: [],
    verdictLine: '',
    verdictColour: 'var(--dim)',
    goals: [],
    diagnosis: [],
    levers: [],
    smallPrint: '',
    // Nothing has been run, so there is no question to take anywhere yet.
    nextStep: undefined,
    /*
     * Week-shaped, and deliberately so: nothing has been filed, so the shell is still standing in
     * the week it opens on, and the disabled *Open the doors on tomorrow* is the handoff's own
     * empty case (§ 2.2) rather than a slot reserved for a statement that will never arrive. The
     * blanks here mean *not yet*; the absences on a single run's sheet mean *never*, which is why
     * they are drawn differently.
     */
    framing: {
      kind: 'week-day',
      streakLine: '',
      contractLine: '',
      cleared: null,
      forecast: { name: '', note: '', demand: '' },
      taught: '',
      // No weekday is named, because no day has been closed and tomorrow is not yet a fact.
      nextDayLabel: 'Open the doors on tomorrow',
      canAdvance: false,
    },
  };
}

/**
 * The framing, which is the only place the two shapes differ.
 *
 * Exhaustive over `of`: a third shape of sheet is a compile error here rather than a card that
 * silently keeps drawing a week's forecast.
 */
function framingOf(report: ShapedDayReport): FramingView {
  if (report.of === 'single-run') {
    return { kind: 'single-run' };
  }
  return {
    kind: 'week-day',
    streakLine: report.streakLine,
    contractLine: report.contractLine,
    cleared: clearedBannerOf(report.cleared),
    forecast: report.forecast,
    taught: report.taught,
    nextDayLabel: `Open the doors on ${report.nextDayName}`,
    canAdvance: true,
  };
}

/**
 * The whole sheet, filed or not. The only decision this surface makes.
 *
 * **The bare `DayReport` arm is a transition, and it is not a guess.** `types.ts`'s `DayReport` is
 * by construction the week-day sheet — it declares `streakLine`, `contractLine`, `forecast` and
 * `nextDayName` as required fields — so a caller still holding one is holding a day of a week and
 * is read as such. It is here so this panel compiles against a `ViewerState.report` that has not
 * yet been widened to `ShapedDayReport`; when it is, this arm and the `'of' in report` test both
 * go, and nothing else in the function changes.
 */
export function reportViewOf(report: ShapedDayReport | DayReport | undefined): ReportView {
  if (report === undefined) return emptyReportView();
  const shaped: ShapedDayReport = 'of' in report ? report : { ...report, of: 'week-day' };
  return {
    filed: true,
    // Both shapes carry it — see {@link SingleRunFramingView}.
    nextStep: shaped.nextStep,
    title: shaped.title,
    metaLines: shaped.metaLines,
    lede: shaped.lede,
    figures: shaped.figures.map(figureViewOf),
    verdictLine: shaped.verdictLine,
    verdictColour: shaped.verdict === 'cleared' ? 'var(--ok)' : 'var(--warn)',
    goals: shaped.goals.map(goalRowViewOf),
    diagnosis: diagnosisRowsOf(shaped.diagnosis),
    levers: leverRowsOf(shaped.levers),
    smallPrint: shaped.smallPrint,
    framing: framingOf(shaped),
  };
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/**
 * Mount the observation sheet.
 *
 * Built once; `render` is called whenever anything moves. The three buttons are wired here and
 * read the latest {@link ViewAt} out of a closure the render fills, which is `mountTypes.ts`'s own
 * arrangement: a handler never holds a stale week, and it never writes the state directly.
 */
export function mountReport(elements: ReportElements, context: MountContext): Panel {
  const ui = elements;
  const doc = ui.title.ownerDocument;
  let latest: ViewAt | undefined;

  /**
   * *Take the next assignment.*
   *
   * `takeContract` restarts the week on the new scenario and keeps what has been cleared
   * (`week.ts`, rule 2), and the building moves with it — a week whose contract names Midtown
   * Office while the runner is still on Garden Apartments would make every goal a claim about a
   * building the assignment is not for. At the end of the list there is no next contract, and the
   * button simply returns to the building, which is the design's own branch.
   */
  ui.takeNext.addEventListener('click', () => {
    const view = latest;
    /*
     * Read through the view rather than off the report. The banner belongs to the week-day framing,
     * so asking the drawn view for it is the one question that stays correct whichever shape of
     * sheet the state is holding — and a single run has no award to take by construction.
     */
    const framing = view === undefined ? undefined : reportViewOf(view.state.report).framing;
    const nextId =
      framing?.kind === 'week-day' ? (framing.cleared?.nextContractId ?? null) : null;
    if (view !== undefined && nextId !== null) {
      const contract = contractById(nextId);
      context.update({
        week: takeContract(view.state.week, nextId),
        ...(contract === undefined ? {} : { buildingId: contract.buildingId }),
        outOfServiceCarIds: [],
        recording: undefined,
        report: undefined,
        withheld: [],
      });
    }
    context.openTab('run');
  });

  /**
   * *Open the doors on tomorrow.*
   *
   * The recording and the report are cleared in the same patch that advances the day, so that if
   * the run refuses the reader is looking at an empty sheet for a day that has not happened rather
   * than at yesterday's figures under today's date.
   *
   * This is the **only** listener on `#report-next-day`. Until 2026-07-30 `main.ts` wired a second
   * one that applied `nextDay` again, so one press advanced two days (DR-13, § D198) — the panel
   * owns its own buttons, and `reportPanel.test.ts` pins the single binding site. The tab move to
   * the run surface lived in that deleted duplicate; it is `takeNext`'s own idiom and belongs here.
   */
  ui.nextDay.addEventListener('click', () => {
    const view = latest;
    if (view === undefined) return;
    context.update({
      week: nextDay(view.state.week),
      recording: undefined,
      report: undefined,
      withheld: [],
    });
    context.openTab('run');
    context.runShift();
  });

  ui.back.addEventListener('click', () => {
    context.openTab('run');
  });

  function drawFigures(view: ReportView): void {
    fill(
      ui.figures,
      ...view.figures.map((cell) =>
        figure(doc, {
          label: cell.label,
          value: cell.value,
          note: cell.note,
          classes: cell.classes,
          valueColor: cell.colour,
        }),
      ),
    );
  }

  function drawGoals(view: ReportView): void {
    fill(
      ui.goals,
      ...view.goals.map((row) =>
        el(doc, 'div', {
          className: 'report-goal',
          title: row.help,
          style: { background: row.background },
          children: [
            el(doc, 'span', {
              className: 'goal-glyph',
              text: row.glyph,
              style: { color: row.colour },
            }),
            el(doc, 'span', { className: 'goal-label', text: row.label }),
            el(doc, 'span', {
              className: 'goal-got',
              text: row.display,
              style: { color: row.colour },
            }),
          ],
        }),
      ),
    );
  }

  function drawDiagnosis(view: ReportView): void {
    fill(
      ui.diagnosis,
      ...view.diagnosis.map((row) =>
        el(doc, 'div', {
          className: 'report-diagnosis',
          style: { 'border-left-color': row.accent },
          children: [
            el(doc, 'span', {
              className: 'report-when',
              text: row.when,
              style: { color: row.accent },
            }),
            el(doc, 'div', {
              children: [
                el(doc, 'div', {
                  text: row.what,
                  style: { 'font-size': '13.5px', 'font-weight': '600' },
                }),
                el(doc, 'p', { className: 'figure-note', text: row.why }),
              ],
            }),
          ],
        }),
      ),
    );
  }

  function drawLevers(view: ReportView): void {
    fill(
      ui.levers,
      ...view.levers.map((lever) =>
        el(doc, 'div', {
          className: 'report-lever',
          children: [
            el(doc, 'div', {
              text: lever.title,
              style: { 'font-size': '13px', 'font-weight': '600' },
            }),
            el(doc, 'div', { className: 'figure-note', text: lever.body }),
          ],
        }),
      ),
    );
  }

  /*
   * *Take it to Compare* — the one block `index.html` has no slot for.
   *
   * Built here rather than authored in the markup because the markup is the handoff's, and the
   * handoff drew a week's sheet only; the lane that owns `index.html` gives this an id and a
   * stylesheet. It sits directly under the small print, which is where the question it answers is
   * raised: the small print says this run *cannot* tell you one dispatcher beat another, and this
   * says where that can be settled. Both strings come from `shift/report.ts` — nothing here
   * composes them, and the surface to navigate to is `framing.nextStep.surface` on the view.
   */
  const nextStepLabel = el(doc, 'div', {
    style: { 'font-size': '13px', 'font-weight': '600', 'margin-top': '10px' },
  });
  const nextStepWhy = el(doc, 'p', { className: 'figure-note' });
  const nextStepBox = el(doc, 'div', { children: [nextStepLabel, nextStepWhy] });
  ui.smallPrint.insertAdjacentElement('afterend', nextStepBox);

  return {
    render(view: ViewAt): void {
      latest = view;
      const drawn = reportViewOf(view.state.report);
      /*
       * One `null` per shape, read once. Every week-shaped slot below is written *and* hidden from
       * the same value, so a slot can never be left showing yesterday's sentence on a sheet that
       * has no week — which is the bug this arrangement replaces, one indirection down.
       */
      const week = drawn.framing.kind === 'week-day' ? drawn.framing : null;
      const single = drawn.framing.kind === 'single-run' ? drawn.framing : null;

      setText(ui.title, drawn.title);
      fill(ui.meta, ...drawn.metaLines.map((line) => el(doc, 'div', { text: line })));
      setText(ui.lede, drawn.lede);
      drawFigures(drawn);

      setText(ui.verdict, drawn.verdictLine);
      setStyle(ui.verdict, 'color', drawn.verdictColour);
      setText(ui.streak, week?.streakLine ?? '');
      setHidden(ui.streak, week === null);
      setText(ui.contract, week?.contractLine ?? '');
      setHidden(ui.contract, week === null);

      setHidden(ui.cleared, (week?.cleared ?? null) === null);
      setText(ui.clearedNote, week?.cleared?.note ?? '');

      drawGoals(drawn);
      drawDiagnosis(drawn);
      drawLevers(drawn);

      setText(ui.forecastName, week?.forecast.name ?? '');
      setText(ui.forecastNote, week?.forecast.note ?? '');
      setText(ui.forecastDemand, week?.forecast.demand ?? '');
      setHidden(cardOf(ui.forecastName), week === null);
      setText(ui.taught, week?.taught ?? '');
      setHidden(cardOf(ui.taught), week === null);
      setText(ui.smallPrint, drawn.smallPrint);

      // Drawn on both shapes now — see `SingleRunFramingView`. Hidden only on the empty sheet,
      // where there is no run and therefore no question.
      setText(nextStepLabel, drawn.nextStep?.label ?? '');
      setText(nextStepWhy, drawn.nextStep?.why ?? '');
      setHidden(nextStepBox, drawn.nextStep === undefined);

      setText(ui.nextDay, week?.nextDayLabel ?? '');
      ui.nextDay.disabled = !(week?.canAdvance ?? false);
      // No tomorrow to open the doors on. The Back button is the whole of a single run's CTA row.
      setHidden(ui.nextDay, week === null);
    },
  };
}
