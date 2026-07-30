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
 */

import { GOAL_GLYPHS } from '../shift/goals.js';
import { contractById } from '../shift/contracts.js';
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

/** Everything the sheet shows, in one value. The empty state is a member of this type, not a hole. */
export interface ReportView {
  /** `false` before any shift has been closed. The sheet is drawn either way — it is never hidden. */
  readonly filed: boolean;
  readonly title: string;
  readonly metaLines: readonly string[];
  readonly lede: string;
  readonly figures: readonly FigureView[];
  readonly verdictLine: string;
  readonly verdictColour: string;
  readonly streakLine: string;
  readonly contractLine: string;
  readonly cleared: ClearedBannerView | null;
  readonly goals: readonly GoalRowView[];
  readonly diagnosis: readonly DiagnosisRowView[];
  readonly levers: readonly LeverRowView[];
  readonly forecast: ForecastView;
  readonly taught: string;
  readonly smallPrint: string;
  /** `Open the doors on Wednesday`. */
  readonly nextDayLabel: string;
  /** Whether the two CTAs do anything. Nothing to advance from before a day has been filed. */
  readonly canAdvance: boolean;
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
    streakLine: '',
    contractLine: '',
    cleared: null,
    goals: [],
    diagnosis: [],
    levers: [],
    forecast: { name: '', note: '', demand: '' },
    taught: '',
    smallPrint: '',
    // No weekday is named, because no day has been closed and tomorrow is not yet a fact.
    nextDayLabel: 'Open the doors on tomorrow',
    canAdvance: false,
  };
}

/** The whole sheet, filed or not. The only decision this surface makes. */
export function reportViewOf(report: DayReport | undefined): ReportView {
  if (report === undefined) return emptyReportView();
  return {
    filed: true,
    title: report.title,
    metaLines: report.metaLines,
    lede: report.lede,
    figures: report.figures.map(figureViewOf),
    verdictLine: report.verdictLine,
    verdictColour: report.verdict === 'cleared' ? 'var(--ok)' : 'var(--warn)',
    streakLine: report.streakLine,
    contractLine: report.contractLine,
    cleared: clearedBannerOf(report.cleared),
    goals: report.goals.map(goalRowViewOf),
    diagnosis: diagnosisRowsOf(report.diagnosis),
    levers: leverRowsOf(report.levers),
    forecast: report.forecast,
    taught: report.taught,
    smallPrint: report.smallPrint,
    nextDayLabel: `Open the doors on ${report.nextDayName}`,
    canAdvance: true,
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
    const award = view?.state.report?.cleared ?? null;
    const nextId = award?.nextContractId ?? null;
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

  return {
    render(view: ViewAt): void {
      latest = view;
      const drawn = reportViewOf(view.state.report);

      setText(ui.title, drawn.title);
      fill(ui.meta, ...drawn.metaLines.map((line) => el(doc, 'div', { text: line })));
      setText(ui.lede, drawn.lede);
      drawFigures(drawn);

      setText(ui.verdict, drawn.verdictLine);
      setStyle(ui.verdict, 'color', drawn.verdictColour);
      setText(ui.streak, drawn.streakLine);
      setText(ui.contract, drawn.contractLine);

      setHidden(ui.cleared, drawn.cleared === null);
      setText(ui.clearedNote, drawn.cleared?.note ?? '');

      drawGoals(drawn);
      drawDiagnosis(drawn);
      drawLevers(drawn);

      setText(ui.forecastName, drawn.forecast.name);
      setText(ui.forecastNote, drawn.forecast.note);
      setText(ui.forecastDemand, drawn.forecast.demand);
      setText(ui.taught, drawn.taught);
      setText(ui.smallPrint, drawn.smallPrint);

      setText(ui.nextDay, drawn.nextDayLabel);
      ui.nextDay.disabled = !drawn.canAdvance;
    },
  };
}
