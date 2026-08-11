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
 * carry a glyph (`✓ × ·`, from `shift/goals.ts`) plus a `title` naming the state in words, because
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
 *
 * The same reach, one section over: `<h3>Where it went wrong</h3>` and `<h3>Levers you actually
 * have</h3>` are authored siblings of `#report-diagnosis` and `#report-levers`. {@link headingOf}
 * climbs to them so that the first can be **written from the sheet** — a fixed *where it went wrong*
 * fired on a shift where nothing did, issue #56 — and so that both are hidden with their own list on
 * the two sheets that have no rows at all.
 *
 * ## A new sheet opens at its own top — issue #62
 *
 * The report auto-opens when a run plays out, and it is the game handing a reader their result. It
 * opened at the offset they left the *previous* sheet at: two thirds down, on the lever cards, with
 * the verdict and every stat tile above the fold and nothing indicating they were there. Because
 * `runId` is `building-profile-seed`, a re-run of one selection draws a visually identical region,
 * so it read as a sheet that had not updated. {@link sheetIdentityOf} is the whole of the test, and
 * the write is deferred until the panel is actually on screen — a `scrollTop` written into a
 * `display: none` tabpanel is dropped, and the sheet files while the reader is still on the run
 * surface.
 *
 * ## A sheet is a statement about a whole day, so it waits for the whole day — § D223
 *
 * The simulator runs a day to its end and then plays it back, so `main.ts`'s `closeShift` can file a
 * complete account of a run the reader is four minutes into — and it does, because opening this tab
 * is one of the two ways `closeShift` is reached. Every other surface on the screen reads the
 * **playhead**: the header's clock, the footer's `n arrived, n carried`, the left rail's goals. Issue
 * #16 is what that costs. A player re-ran a filed selection, opened this tab at once, and read
 * `06:00 FILLING` and `0 carried` in the chrome beside `CARRIED 360` on the sheet — one screen, two
 * answers to *how did today go?*.
 *
 * The figures were not stale. `runId` is `building-profile-seed`, so a re-run of the same selection
 * is bit-identical and the sheet was a true account **of the recording**. What was false was the
 * sheet presenting itself as *the state of the run on screen* while the run on screen was at 06:00.
 *
 * So there is a third state, and {@link runProgressOf} is the whole of the test: while the playhead
 * is short of `endedAt`, a filed sheet is replaced by a sheet that says the day is still running and
 * names the time it has reached. **It carries no figure at all**, and that is not timidity — every
 * cell on this grid is a whole-run quantity. `CARRIED`, `DEEPEST QUEUE` and `TOOK THE STAIRS` come
 * from observations folded at `endedAt`; `AVERAGE WAIT`, `WORST WAIT` and the energy pair come from
 * `VizSummary`, which is summarised once over the whole run and cannot be re-derived at a playhead.
 * A part-day mean is exactly the thin sample CLAUDE.md's `awtIsValid` grounds exist to refuse, and
 * inventing one to avoid an empty box is the `docs/10` R3 failure with extra steps. The surface that
 * *does* read a shift while it runs is the left rail, and the copy points there.
 *
 * Two consequences, both deliberate. Scrubbing back after a day has been filed and re-opening this
 * tab shows the running sheet again — the screen is at 09:14, so the sheet declines to be at 18:00,
 * which is the property being bought rather than a lapse in it. And with the transport looping, the
 * playhead reaches `endedAt` only in passing, so the sheet is mostly the running one; a run on repeat
 * has no *finished* instant to agree with.
 */

import { GOAL_GLYPHS, PENDING_DISPLAY } from '../shift/goals.js';
import { contractById } from '../shift/contracts.js';
import {
  CASUAL_LEVERS_HEADING,
  CASUAL_REACH_NOTE,
  CASUAL_SMALL_PRINT_LEAD,
  casualFigureOrderOf,
  casualNoteFor,
} from '../mode/casualDay.js';
import type { ViewMode } from '../mode/types.js';
import {
  clockOf,
  type ReportBasis,
  type ReportNextStep,
  type ShapedDayReport,
} from '../shift/report.js';
import type {
  ClearedAward,
  FigureTone,
  GoalLine,
  ReportDiagnosis,
  ReportFigure,
  ReportLever,
} from '../shift/types.js';
import { nextDay, switchWeek } from '../shift/week.js';
import type { TomorrowBriefing } from '../shift/tomorrow.js';

import { el, figure, fill, setHidden, setStyle, setText } from './dom.js';
import type { ReportElements, TabName } from './elementMap.js';
import type { MountContext, Panel, UnfiledSheetFacts, ViewAt } from './mountTypes.js';

/* -------------------------------------------------------------------------- *
 * The view — every string and every colour this surface will show
 * -------------------------------------------------------------------------- */

/**
 * The verdict's colour, one arm per verdict.
 *
 * A `Record` rather than a ternary, for the reason `shift/report.ts` gives about `VERDICT_VOICE`:
 * a fourth verdict must be a **compile error here** rather than silently inheriting whatever an
 * `else` branch happened to say. That is not hypothetical — this was a two-arm ternary written
 * when there were two verdicts, and `ungraded` (§ D234) landed in its `else`.
 */
const VERDICT_COLOUR: Readonly<Record<ShapedDayReport['verdict'], string>> = Object.freeze({
  cleared: 'var(--ok)',
  missed: 'var(--warn)',
  // Neutral, and deliberately the same token the empty sheet below uses. A day nobody judged is
  // not a day that went wrong, and amber is this palette's word for *went wrong*.
  ungraded: 'var(--dim)',
});

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
  /**
   * `was 78%`, or the bare em dash when the building has no previous day — `GoalLine.was`,
   * dressed exactly as the rail's `goalRowsOf` dresses it, because two spellings of yesterday
   * would be two screens disagreeing.
   */
  readonly was: string;
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
  /**
   * The tab this card's advice is carried out on, or `undefined` for one that names no surface.
   *
   * GitHub issue #38. *"The Building tab will let you feel how much it buys"* names a tab and does
   * not go there: the card is the one place on this sheet that tells a reader to do something, and
   * it was the one place with nothing to press. Every other pointer on the surface — the Compare
   * block under the small print — is already a navigation, so this is the existing seam applied to
   * the four cards rather than a new idea.
   *
   * `undefined` rather than a default. A card whose advice is a *dispatcher* choice is carried out
   * on a surface this sheet cannot name without picking one for the reader, which is the one thing
   * `docs/10` R2 forbids it; see {@link LEVER_SURFACES}.
   */
  readonly surface?: TabName | undefined;
}

/**
 * Which tab carries out each lever's advice — **the two that are a fabric change, and no others.**
 *
 * Issue #38, and the restraint is the decision rather than an omission.
 *
 * *Add a car* and *Zone the tower* are both edits to the building document: a car is a `CarConfig`
 * and zoning is a bank's `servesFloors`, and the Building tab is where both are authored. Naming it
 * is a statement about **where a control lives**, which is checkable and cannot go stale silently —
 * `reportPanel.test.ts` asserts every id here is a card `shift/report.ts` can actually emit.
 *
 * The other two are deliberately absent. *Weight fairness up* and *Ask where they're going* are
 * both **a different dispatcher**, and a card that navigated to the dispatcher editor with a lever
 * named would be this sheet recommending a dispatch strategy off one replication — `docs/10` R2,
 * and CLAUDE.md's *never declare one dispatcher better than another without a paired-t interval
 * that excludes zero*. The sheet may say what today showed; it may not point at the control that
 * would make one profile beat another. Their cards keep their words and stay unclickable, which is
 * the honest difference and is asserted in both directions.
 *
 * Keyed on `ReportLever.id`, which is stable and is the same id the shift layer matches
 * observations against — so a fifth lever arrives here as a missing entry (no navigation) rather
 * than as a wrong one.
 */
export const LEVER_SURFACES: Readonly<Record<string, TabName>> = Object.freeze({
  'add-a-car': 'building',
  'zone-the-tower': 'building',
});

/**
 * One `before → after` pair — **every string in it published by one of the two sheets**.
 *
 * There is no signed change and no direction. A subtraction would be arithmetic in a file that has
 * none, and it would be the sheet doing the reader's subtraction *and* choosing which way is good.
 * The values are what the two sheets printed, in the words they printed them in — which is what
 * makes a withheld cell survive the pairing intact: `withheld → 58.3 s` is the shift layer's own
 * refusal, copied, rather than a hole where a difference could not be taken.
 *
 * ## The two count fields, and why they are two — GitHub issue #137
 *
 * This row had three fields, and the honesty sweep's R13 found what the missing fourth cost the
 * moment the block entered the corpus: `AVERAGE WAIT was 17.8 s → 23.4 s`, **a mean with no count
 * anywhere in its box**, on 24 of 49 always-on cases. R13 clause one is not a style rule —
 * *`n = 5` is not a caveat on `11.3 s`, it is part of what `11.3 s` means* — and this block is
 * where the sheet's mean travels furthest from the note that carried its denominator: on the Day
 * report the figure grid is one block below, and on § D310's dispatcher-editor result strip, which
 * draws this same view through `reportViewOf`, there is no grid at all.
 *
 * **Two runs, two counts, and they are attached per side rather than stated once for the row.** The
 * two values are means of *different runs*, taken over different cohorts — a day that carried 1 198
 * legs and a day that carried 1 204 — so one `n` under both would be a claim neither sheet made,
 * and it would be wrong in exactly the case a reader is here for: a change that moved the wait by
 * moving how many people got carried. Each count is glued to the value it is the denominator of, so
 * the row cannot be read as one sample even by a reader who is skimming. They stay two even when
 * the two numbers agree — collapsing them then would be indistinguishable, on screen, from a row
 * that only ever had one, and *"they happened to match"* is itself worth seeing.
 *
 * **A refused figure stays refused.** {@link beforeCount} and {@link afterCount} are `null` wherever
 * the sheet published no mean: a withheld cell has no sample, so `withheld` pairs as the bare word
 * it always did, and the count that would have gone beside it does not appear. See
 * {@link ReportFigure.count}, which is where that decision is made and where it is argued.
 *
 * Nothing here is composed: both counts are the two sheets' own notes for that cell, carried the
 * way {@link before} and {@link after} carry their values.
 */
export interface DeltaRowView {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  /**
   * What the earlier sheet's value was computed over — its own note, verbatim — or `null`.
   *
   * `null` means *"this side is not a mean over a sample"*, which covers every observation row, the
   * identity rows, and a side whose mean the run refused. It never means *"there is a count and it
   * is not being shown"*: that state is the defect this field exists to end.
   */
  readonly beforeCount: string | null;
  /** The same, for the later sheet's value. See {@link beforeCount}. */
  readonly afterCount: string | null;
}

/**
 * *What moved since the run before this one* — issue #38, and the loop's missing half.
 *
 * ## What was reported
 *
 * Clicking a dispatcher in the right rail re-simulates the whole shift on the same seed instantly,
 * which is the game. The second sheet is then a fresh sheet with no reference to the first: the
 * only string mentioning the earlier run is the grey `attempt 2 at this day`. A player who swapped
 * `collective` for `capacity-aware` had 288 fewer riders take the stairs **and** made the unluckiest
 * rider 642 s worse, and had to screenshot both reports to find that out. The rail's *best day so
 * far* moved 18 % → 20 %, so the one lesson the app volunteers is the one it least wants taught.
 *
 * ## Why this is not the comparison R2 forbids
 *
 * *Took the stairs: 483, was 771* is not an inferential claim about dispatchers. It is a statement
 * about two runs that already happened, of exactly the kind every other number on this sheet is.
 * What R2 forbids is the **verdict**, and this block never renders one: no arrow that means good, no
 * colour, no ordering, no sum. {@link ReportDeltaView.note} carries the refusal in the same visual
 * unit as the rows, and the *Take it to Compare* box already under the small print names the surface
 * that may settle it.
 *
 * ## And why it names what was **run**, not only what came out
 *
 * The trap this block could set is worse than the silence it replaces: showing six numbers that
 * moved, without saying that the seed moved too, invites a reader to attribute the change to the one
 * thing they touched. So {@link ReportDeltaView.selection} pairs the identity lines — the building
 * and dispatcher, the seed and span, and which day the sheet is of — and a reader can see whether
 * the two runs were even asked the same question.
 *
 * ## And why *seeing* it was not enough — GitHub issues #117 and #102
 *
 * That last paragraph was the answer this block gave for a year, and it is the half-measure the two
 * issues report from opposite ends. A player who finished a Free Play run on Midtown Office and
 * opened a scenario day on Garden Apartments read `CARRIED was 726 → 48`; another switched building
 * mid-session and read `was 48 → 5961`. Both cases *were* labelled — the identity row said the
 * building had changed — and both still printed six figure rows underneath, because a label is
 * something a reader may notice and arithmetic is something they will read. #117 puts it exactly:
 * *"the panel already prints the honest caveat … it should refuse the arithmetic in the cases where
 * the caveat is load-bearing."*
 *
 * So the figures are **withheld** when the two sheets are not sheets of the same question, and
 * {@link ReportDeltaView.refused} says which axis differs, in words. That is the shape this
 * repository already uses for a mean it may not publish (`shift/report.ts`'s `WITHHELD` beside the
 * run's own `awtInvalidReason`): the cell is not quietly dropped and it is not filled with a number
 * the same run calls invalid — it says what it is not saying, and why.
 *
 * The identity rows stay. They are not the comparison; they are the reason there is not one, and a
 * refusal that hid what it was refusing about would send a reader hunting for it.
 */
export interface ReportDeltaView {
  /** What the block is. Always present when the block is. */
  readonly caption: string;
  /** What differs about *what was run*. Empty when the two runs were the same selection. */
  readonly selection: readonly DeltaRowView[];
  /**
   * Figures whose printed value differs, in the sheet's own order.
   *
   * Empty when none did — **and empty whenever {@link refused} is non-null**, which is the whole of
   * the fix for issues #117 and #102. The two emptinesses are told apart by {@link note}, never by
   * the reader guessing.
   */
  readonly figures: readonly DeltaRowView[];
  /**
   * Why the figures are not paired, or `null` when they are.
   *
   * `null` is *these two sheets answer the same question*, which is the case the block was built
   * for: one building, one shape of run, one demand, and a dispatcher swapped between them.
   */
  readonly refused: DeltaRefusal | null;
  /** The sentence under the rows — the refusal, or the reason nothing moved. Never empty. */
  readonly note: string;
}

/**
 * Why two sheets may not be differenced — issues #117 and #102.
 *
 * Structured rather than only prose because a test can hold a list and cannot hold a sentence: the
 * property that matters is *the axes that differ are named*, and asserting that against a paragraph
 * would be asserting against wording. {@link ReportDeltaView.note} is composed from this, so the
 * words on screen and the reason cannot drift apart.
 */
export interface DeltaRefusal {
  /**
   * The axes the two runs disagree on, in the words the note uses, in {@link ReportBasis}' own
   * field order. Never empty — a refusal with nothing to name would be a refusal with no grounds.
   */
  readonly differsOn: readonly string[];
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
  /**
   * Whether this sheet is presenting an account of a run.
   *
   * `false` on **both** of the two sheets that are not one: before any shift has been closed, and
   * while the run a closed shift is an account *of* has not been played out (see the module
   * docstring). The sheet is drawn in every case — it is never hidden.
   */
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
  /**
   * What the diagnosis list is headed — `shift/report.ts`'s string, unread and unedited.
   *
   * `index.html` authors that heading as a fixed `<h3>Where it went wrong</h3>`, so it fired on a
   * shift where nothing did (issue #56). The words are the shift layer's because they are a claim
   * about the run: they come out of the same {@link ShapedDayReport.verdict} the banner does, so a
   * green **Shift cleared** cannot stand above *where it went wrong*.
   *
   * `''` on both unfiled sheets, where the list is empty and the heading is hidden with it.
   */
  readonly diagnosisHeading: string;
  /**
   * What the goal block is headed, or `undefined` for *keep what `index.html` authored*.
   *
   * `index.html` authors the heading as a fixed `<h3>The shift asked for</h3>`, and on a single
   * run that is a claim about a contract that does not exist — `docs/19` defect 13's first half.
   * The single-run sheet reframes it to {@link SINGLE_RUN_GOALS_HEADING}; every other sheet keeps
   * the markup's own words, on {@link leversHeading}'s exact arrangement and for its exact reason:
   * this package holds no second copy of a string the markup owns, and the write happens on every
   * frame because the sheet's shape moves both ways.
   */
  readonly goalsHeading: string | undefined;
  readonly levers: readonly LeverRowView[];
  /**
   * What the lever section is headed, or `undefined` for *keep what `index.html` authored*.
   *
   * The one field on this view whose `undefined` means *do not write* rather than *there is
   * nothing to say*, and the asymmetry is the point: Engineer's heading is the markup's
   * (`<h3>Levers you actually have</h3>`) and stays there, so this package holds no second copy of
   * a string `index.html` owns. Casual's is `mode/casualDay.ts#CASUAL_LEVERS_HEADING`, which
   * reframes the section from the controls a player may move to the question those controls answer.
   *
   * `diagnosisHeading` above is the opposite arrangement — always written, because issue #56 was a
   * fixed *Where it went wrong* standing over a shift where nothing did, and that heading is a
   * claim about the run. This one is not: the four cards are the same four cards whatever the day
   * did.
   */
  readonly leversHeading: string | undefined;
  /**
   * What moved since the sheet before this one, or `null` when there is nothing to say.
   *
   * `null` on the first filed sheet of a session — there is no earlier run — and on **both** sheets
   * that are not an account of a played-out run: § D223's rule is that a sheet reporting a whole day
   * waits for the whole day, and a delta is made of that sheet's figures, so it waits too.
   */
  readonly delta: ReportDeltaView | null;
  readonly smallPrint: string;
  /**
   * The between-day beat, or `null` — GitHub issue #91.
   *
   * `null` on **four** sheets and each for its own reason: nothing filed (no day has closed), a run
   * still being watched (§ D223 — the sheet declines to be at 18:00 while the screen is at 09:14,
   * and so does the beat), a single run (a Free Play run belongs to no week and nothing changes
   * overnight for it), and a day that closed in a mode that does not advance the week.
   *
   * The whole `TomorrowBriefing` is carried through unread and unedited, exactly as `nextStep` is:
   * every string in it is `shift/tomorrow.ts`'s, and a caption composed here would be this module
   * deciding what a week's progress means — which is a decision, and every decision on this surface
   * lives in a pure module a test can reach.
   */
  readonly overnight: TomorrowBriefing | null;
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
export function figureViewOf(cell: ReportFigure, mode: ViewMode = 'advanced'): FigureView {
  /*
   * The **note** is the only thing the mode touches, and that is the whole of the discipline —
   * GitHub issues #110 and #100, `mode/casualDay.ts`.
   *
   * Not the value: a Casual retelling of `16.0 s` would be a second copy of a figure, and this
   * file has no formatter to make one with. Not the tone or the classes: a refused cell is drawn
   * as refused in both modes, because *plain language* is permission to word a refusal for the
   * reader who met it and is not permission to make it look like a figure. Not `axisOnly`: § D106
   * is not a disclosure decision, and an energy cell that acquired a ranking colour in one mode
   * would be that decision reversed by a view preference.
   *
   * So `casualNoteFor` **leads** the cell's own note and never replaces it, and everything below
   * this line is the same in both modes.
   */
  const note = mode === 'basic' ? casualNoteFor(cell) : cell.note;
  if (cell.axisOnly) {
    return {
      label: cell.label,
      value: cell.value,
      note,
      // `figure-axis` styles nothing. It is a marker so a reviewer reading the DOM can see that
      // the absence of colour here is deliberate rather than an omission.
      classes: ['figure-observation', 'figure-axis'],
      colour: undefined,
    };
  }
  return {
    label: cell.label,
    value: cell.value,
    note,
    classes: toneClassesOf(cell.tone),
    colour: toneColourOf(cell.tone),
  };
}

/* -------------------------------------------------------------------------- *
 * The rows
 * -------------------------------------------------------------------------- */

/** The design's two goal-row treatments, widened to the third state the implementation has. */
export function goalRowViewOf(line: GoalLine): GoalRowView {
  const { reading } = line;
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
    // The word only when there is a figure to attribute — `was —` would dress an absence as a
    // measurement. The same rule `dev/leftRail.ts#goalRowsOf` applies, spelled the same way.
    was: line.was === PENDING_DISPLAY ? PENDING_DISPLAY : `was ${line.was}`,
    ...dressing,
  };
}

/**
 * What the single-run sheet heads its goal block — `docs/19` defect 13, the reframing decided.
 *
 * ## The decision: reframe, not drop
 *
 * The audit allowed either. Dropping the block would have put the sheet in silent disagreement
 * with the left rail, which reads the same goals against the same observations while the shift
 * runs — one surface measuring what the other declines to mention. Reframed, the block keeps every
 * observation and loses every **claim**: the heading stops asserting that the shift asked for
 * anything, and {@link unaskedGoalRowViewOf} strips the ✓/× that graded bars no contract issued.
 * The dash in the heading carries the disclaimer in the same visual unit as the words it
 * qualifies, which is R13's own placement rule applied to a sentence.
 */
const SINGLE_RUN_GOALS_HEADING = 'What a scenario would ask — read, not graded';

/**
 * A goal row on a single run's sheet: the reading kept, the grade withheld.
 *
 * Built **on** {@link goalRowViewOf} rather than beside it so the label, the observed value and
 * the `was` dressing cannot drift between the two shapes. What changes is the grade's three
 * channels — glyph, colour, background — and the `title` that says why in words (KB-15: the glyph
 * is the shorthand, never the message). A `pending` row passes through untouched: it was never
 * graded, its em dash and its own help sentence are already the honest rendering, and rewording it
 * would claim it was *read* when the building had not woken up.
 *
 * Module-private, like the heading above it: the suites and the honesty sweep read these rows off
 * {@link reportViewOf}'s own output, and an export whose only shipped reader is its own module is
 * the shape `deadCode.test.ts` refuses.
 */
function unaskedGoalRowViewOf(line: GoalLine): GoalRowView {
  const graded = goalRowViewOf(line);
  if (line.reading.state === 'pending') return graded;
  return {
    ...graded,
    // `pending`'s own glyph — the vocabulary already means *no verdict here*, and a fourth mark
    // would be a new symbol for a distinction the help text and the heading both carry in words.
    glyph: GOAL_GLYPHS.pending,
    colour: 'var(--dimmer)',
    background: 'transparent',
    help: 'read, not graded — no scenario asked for this run',
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
  return levers.map((lever) => {
    const surface = LEVER_SURFACES[lever.id];
    return {
      title: lever.title,
      body: lever.body,
      ...(surface === undefined ? {} : { surface }),
    };
  });
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

/**
 * The `<h3>` a section's list hangs under, when the markup has one.
 *
 * The same one-level reach {@link cardOf} makes, and for the same reason: `index.html` gives the id
 * to the list (`#report-diagnosis`, `#report-levers`) and leaves the heading beside it as an
 * unaddressed sibling, so a panel that writes only the list cannot say what the list is *called* —
 * which is issue #56 in one sentence — and cannot hide the caption when the list is empty.
 *
 * `undefined` rather than a throw when the sibling is not a heading: a markup change that moves the
 * `<h3>` degrades to *the heading keeps the words `index.html` authored*, which is the behaviour
 * this file had before, rather than to an exception inside a render loop. **The fix that removes
 * this reach is an id on each heading in `index.html`**, which this lane does not own.
 */
function headingOf(list: HTMLElement): HTMLElement | undefined {
  const previous = list.previousElementSibling;
  if (previous === null || previous.tagName !== 'H3') return undefined;
  return previous instanceof HTMLElement ? previous : undefined;
}

/**
 * Which filed sheet this is, as one string — or `''` for *not a filed sheet at all*.
 *
 * The signal behind both of this panel's pieces of continuity: a new account is owed its own top
 * (issue #62) and becomes the thing the *next* account is differenced against (issue #38).
 *
 * Issue #62: the report auto-opens when a run plays out, and it opened at whatever offset the reader
 * left the previous sheet at — two thirds down, on the lever cards, with the verdict, every stat
 * tile and the goal list above the fold and nothing saying so. On a second run of one selection the
 * visible region is genuinely identical, so it reads as a sheet that failed to update.
 *
 * The identity is the sheet's own **words**, not `runId`: `runId` is `building-profile-seed`, so
 * re-running one selection produces a bit-identical recording (§ D223) and keying on it would refuse
 * to scroll on exactly the retry the reader is trying to compare. The meta block is what separates
 * those two — it carries `attempt 2 at this selection` — so it is in the key.
 *
 * Deliberately **not** the drawn view: the running sheet's lede names the playhead's clock and
 * changes every frame, and a key that moved with it would fight a reader trying to scroll. The
 * `''` arm is exactly `ReportView.filed === false`, computed from the same two inputs
 * {@link reportViewOf} decides it from, so the two cannot disagree.
 */
function sheetIdentityOf(report: ShapedDayReport | undefined, progress: RunProgress): string {
  if (report === undefined || progress.kind === 'watching') return '';
  return [report.title, ...report.metaLines].join('\n');
}

/* -------------------------------------------------------------------------- *
 * The rotation — what the panel remembers between frames
 * -------------------------------------------------------------------------- */

/**
 * The two sheets the panel is holding, and whether the reader is still owed the top of one.
 *
 * ## Why this is a value rather than three `let`s inside the mount
 *
 * It was three `let`s inside {@link mountReport}, and that made the entire mechanism of issue #38
 * unreachable: closure variables in a function that needs a `document`, in a package whose every
 * vitest project is `environment: 'node'`. The suite could assert the *source order* of two
 * assignments and nothing else — so when GitHub issue #117 reported *"three consecutive runs printed
 * an identical baseline"*, there was no way to answer it except by reading the code and arguing.
 *
 * A pure reducer can be **driven**: fed the exact frame sequence the shell produces — a run cleared,
 * a run watched, a run filed, sixty frames of each — and asked what the `was` column then says. That
 * is what `reportPanel.test.ts`'s three-run case does, and it is the difference between *we think
 * this cannot happen* and *we ran it three times and read the answer*.
 *
 * ## Why the drawn sheet's continuity and not the shell's history
 *
 * `ViewerState` does not carry a previous sheet, and this is not a workaround for that: the run a
 * delta is against should be **the one the reader actually read**, not one the shell remembers on
 * their behalf. It is lost on reload, which is honest, because so is the reader's memory of it.
 */
export interface SheetContinuity {
  /**
   * {@link sheetIdentityOf} of the last **filed** sheet taken on, or `''` for *nothing filed yet*.
   *
   * Unfiled sheets never move it. Pressing *Run this shift* clears the report, so an unfiled sheet
   * stands between every pair of filed ones; rotating on that would hand the next delta an
   * `undefined` predecessor and lose the run the reader just read.
   */
  readonly filedIdentity: string;
  /** The filed sheet on screen now. */
  readonly current: ShapedDayReport | undefined;
  /** The filed sheet before it — issue #38's *was* column, and the only thing read out of here. */
  readonly previous: ShapedDayReport | undefined;
  /** Whether the top of a new sheet is still owed to the reader — issue #62. */
  readonly owesTop: boolean;
}

/** A panel that has drawn nothing yet. The state {@link mountReport} starts in. */
export const NOTHING_FILED_YET: SheetContinuity = Object.freeze({
  filedIdentity: '',
  current: undefined,
  previous: undefined,
  owesTop: false,
});

/**
 * Take on a frame — the rotation, as a total function of the frame and what came before it.
 *
 * Called **before** the view is built, never after. Rotating afterwards would make every sheet its
 * own predecessor on the very next frame — `renderAll` runs sixty times a second — and every delta
 * would read *nothing moved* one frame after appearing.
 *
 * A frame that is not a new filed sheet returns the memory **by reference**, which is not an
 * optimisation: it is the property that makes the sixty frames a second between two runs provably
 * inert, and `reportPanel.test.ts` asserts identity rather than equality on exactly that case.
 */
export function rotatedOn(
  memory: SheetContinuity,
  report: ShapedDayReport | undefined,
  progress: RunProgress,
): SheetContinuity {
  const identity = sheetIdentityOf(report, progress);
  if (identity === '' || identity === memory.filedIdentity) return memory;
  return { filedIdentity: identity, current: report, previous: memory.current, owesTop: true };
}

/**
 * The reader has been given the top of the new sheet — issue #62's debt, discharged.
 *
 * Cleared on the **write** rather than on the identity change, so a reader who scrolls *this* sheet
 * keeps their place: the debt is false from then until a different sheet arrives.
 */
export function topWritten(memory: SheetContinuity): SheetContinuity {
  return { ...memory, owesTop: false };
}

/* -------------------------------------------------------------------------- *
 * The delta — issue #38
 * -------------------------------------------------------------------------- */

/**
 * The three identity lines a reader needs to know whether two runs were asked the same question.
 *
 * A fixed table rather than a walk over `metaLines`, because the block's whole value is that a
 * reader can tell a **seed change** from a **dispatcher change**, and an unlabelled positional diff
 * cannot. Indices 0 and 1 are `metaLinesFor`'s first two entries and are present on both shapes of
 * sheet; the lines after them (the day's event, the attempt) are the sheet's own narration of the
 * retry and are already on the page above this block.
 */
const SELECTION_ROWS: readonly { readonly label: string; readonly of: 'title' | 0 | 1 }[] =
  Object.freeze([
    Object.freeze({ label: 'THE SHEET', of: 'title' as const }),
    Object.freeze({ label: 'BUILDING & DISPATCHER', of: 0 as const }),
    Object.freeze({ label: 'SEED & SPAN', of: 1 as const }),
  ]);

/**
 * Each axis of {@link ReportBasis}, in the words the refusal says it in.
 *
 * An exhaustive `Record` over the basis's own keys, for the reason {@link VERDICT_COLOUR} is one: a
 * fourth axis added to the sheet must be a **compile error here** rather than an axis that silently
 * stops being checked. That failure would be invisible on screen — the block would go on drawing a
 * confident diff — which is the whole of issues #117 and #102.
 *
 * The phrases are clauses of one sentence (*"…was in a different building and against different
 * traffic"*) rather than nouns, so the note reads as English at one, two or three of them without
 * this file assembling grammar.
 */
const BASIS_DIFFERENCES: Readonly<Record<keyof ReportBasis, string>> = Object.freeze({
  buildingId: 'in a different building',
  subject: 'in a different mode',
  demand: 'against different traffic',
  /*
   * The two GitHub issue #126 added, and the table's exhaustiveness is what made adding them a
   * compile error rather than an edit somebody had to remember. Both are clauses of the same
   * sentence as the three above, so a refusal naming all five still reads as English.
   *
   * *A different stretch* rather than *a different length*: the axis is one string over a length
   * **and** a window start (`shift/report.ts#extentLineOf`), so a phrase naming only the length
   * would be wrong about a reader who moved the run to the afternoon and kept it half an hour long.
   *
   * *Built from* rather than *against*, so the pattern reads as a different question from `demand`'s
   * *against different traffic* on a screen that can carry both at once. `demand` is what the day
   * asked for — its day number and event, or a Free Play selection line; `patternId` is which
   * authored arrival pattern the day was built out of.
   */
  extent: 'over a different stretch of the day',
  patternId: 'built from a different arrival pattern',
});

/**
 * Which axes two sheets disagree on — empty when they are sheets of the same question.
 *
 * Keyed off {@link BASIS_DIFFERENCES} rather than off `Object.keys(basis)` so the order is the
 * frozen table's and a field the table does not name cannot be compared silently. The two are the
 * same set by construction: the table is typed as a total `Record` over the basis.
 */
function basisDifferencesOf(previous: ReportBasis, current: ReportBasis): readonly string[] {
  const differs: string[] = [];
  for (const [axis, phrase] of Object.entries(BASIS_DIFFERENCES) as readonly [
    keyof ReportBasis,
    string,
  ][]) {
    if (previous[axis] !== current[axis]) differs.push(phrase);
  }
  return differs;
}

/** `a`, `a and b`, `a, b and c` — one sentence's worth of clauses, joined the way English does. */
function andList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

/**
 * The sentence a reader gets **instead of** the figure rows — issues #117 and #102.
 *
 * Three things it has to do, and the third is the one that is easy to lose. It names the axis, so
 * the refusal is checkable against the identity rows directly above it. It says the arithmetic is
 * not being done rather than doing it quietly wrong — `docs/10` R3's rule that an absence must be
 * distinguishable from a failure, which here means *"nothing here is a comparison"* in as many
 * words. And it keeps the pointer at **Compare**, because a reader who has just been told this is
 * not a comparison is exactly the reader who wants to know where one can be had; the un-refused
 * note carries that pointer too, and a refusal that dropped it would answer a player's question
 * with a door closing.
 *
 * No word in it orders the two runs. That is the same line {@link ReportDeltaView} draws for the
 * ordinary case and it does not relax because the block is refusing: *the earlier run was on a
 * bigger building* is still a comparison, and still one run against one run.
 */
function refusalNoteOf(differsOn: readonly string[]): string {
  return (
    `The run before this one was ${andList(differsOn)}. Nothing here is a comparison, so the ` +
    'figures are not paired: the two runs were not asked the same question, and a count that ' +
    'moved because the building or the traffic moved says nothing about what you changed. What ' +
    'differs is listed above. Comparing two settings needs them run against the same passengers, ' +
    '50 or more times each, with an interval that excludes zero — which is what Compare is for.'
  );
}

/**
 * The sentence a cell already published about **what its value was computed over**, or `null`.
 *
 * One line, and the whole of it is a refusal to make a decision here. Whether this value is a mean
 * over a sample is `shift/report.ts`'s answer (`ReportFigure.count`, set from the same summary as
 * the value); *how to say so in English* is also its answer (`ReportFigure.note`, the line the
 * figure grid draws under the figure). This module chooses neither and copies both, which is the
 * same contract {@link DeltaRowView.before} keeps for the value itself.
 *
 * The two are read together on purpose. `count` alone would have to be formatted here, and a second
 * place that decides whether an `n` is written *1204* or *1 204* is a second place for it to be
 * written differently from the grid one block above. `note` alone would mean asking a sentence
 * whether it contains a count, which is the parse this field exists to avoid.
 */
function countNoteOf(cell: ReportFigure): string | null {
  return cell.count === undefined ? null : cell.note;
}

/**
 * What moved between two filed sheets — and nothing else.
 *
 * Pure, total, and **arithmetic-free**: every value is a string one of the two sheets already
 * published, paired by figure id, so a withheld cell pairs as the word `withheld` and an unmeasured
 * energy cell as `not recorded`. Nothing here re-derives, re-rounds or subtracts. See
 * {@link ReportDeltaView} for why that is the design and not a shortcut.
 *
 * Rows are emitted only where the two strings **differ**, so the block answers *what changed* rather
 * than reprinting the grid. When nothing differs at all the block is still drawn, and says why: the
 * run id is building, dispatcher and seed, so an unchanged selection reproduces bit-identically
 * (§ D223) and *"the report did not update"* is the reading this replaces.
 *
 * **The comparability gate comes first** — issues #117 and #102. Two sheets of different questions
 * get the identity rows, no figure rows and a note that says which axis differs; see
 * {@link ReportDeltaView} and {@link ReportBasis}. It is checked ahead of the pairing rather than
 * used to filter it afterwards, because a partial pairing would be the same defect with fewer rows.
 *
 * **And each paired value carries the count it was taken over** — issue #137, R13 clause one. The
 * two counts come from the two sheets, one each, because the two values do; the argument for why
 * they are per-side rather than per-row is {@link DeltaRowView}'s. Note what the refusal branch
 * above does *not* need doing to it: it returns no figure rows at all, so there is no value there
 * for a count to be missing from, and § D311's refusal acquires nothing that could make it read as
 * a figure with a caveat.
 */
function reportDeltaOf(previous: ShapedDayReport, current: ShapedDayReport): ReportDeltaView {
  const lineOf = (report: ShapedDayReport, of: 'title' | 0 | 1): string =>
    of === 'title' ? report.title : (report.metaLines[of] ?? '');

  const selection: DeltaRowView[] = [];
  for (const row of SELECTION_ROWS) {
    const before = lineOf(previous, row.of);
    const after = lineOf(current, row.of);
    // An identity line is a name, not a mean, so neither side has a sample. See {@link DeltaRowView}.
    if (before !== after) {
      selection.push({ label: row.label, before, after, beforeCount: null, afterCount: null });
    }
  }

  const differsOn = basisDifferencesOf(previous.basis, current.basis);
  if (differsOn.length > 0) {
    return {
      /*
       * A different caption, because the old one is a promise the block is about to break. *What
       * moved since the run before this one* over a refusal would be a heading answering a question
       * the paragraph beneath it declines — and the heading is the part a reader keeps.
       */
      caption: 'The run before this one',
      selection,
      figures: [],
      refused: { differsOn },
      note: refusalNoteOf(differsOn),
    };
  }

  /*
   * The earlier sheet's whole **cell**, not just its value — issue #137.
   *
   * A pairing needs two counts and they belong to two different runs, so the earlier one can only
   * come from the earlier sheet. Keyed by `id` rather than by `label` for the reason the pairing
   * always was: a label is copy and an id is the contract.
   */
  const was = new Map(previous.figures.map((cell) => [cell.id, cell]));
  const figures: DeltaRowView[] = [];
  for (const cell of current.figures) {
    const wasCell = was.get(cell.id);
    // A figure the earlier sheet did not carry is not a change; it is a sheet of a different shape.
    if (wasCell === undefined || wasCell.value === cell.value) continue;
    figures.push({
      label: cell.label,
      before: wasCell.value,
      after: cell.value,
      /*
       * Each side's own denominator, from each side's own sheet, and the note is carried rather
       * than rebuilt: `ReportFigure.count` says *whether* this value is a mean over a sample and
       * `ReportFigure.note` is how that sheet already said it in words. Asking `count` rather than
       * looking for digits in the note is the difference between *is there a count* and *is there
       * a number*, which is the mistake this block is being fixed out of.
       */
      beforeCount: countNoteOf(wasCell),
      afterCount: countNoteOf(cell),
    });
  }

  const moved = selection.length > 0 || figures.length > 0;
  return {
    caption: 'What moved since the run before this one',
    selection,
    figures,
    refused: null,
    note: moved
      ? /*
         * The refusal, in the same visual unit as the rows it qualifies. It states what the block
         * **is** — two sheets, side by side — and what would be needed to turn it into a result,
         * which is the sentence the small print already makes this sheet's thesis. No word here
         * orders the two runs, and nothing in the block is coloured: the reported case moved four
         * figures in two directions at once, and the point is precisely that it is a trade.
         */
        'Two runs are two runs. This is what the two sheets printed, side by side — not a result, ' +
        'and not a direction. Which setting is better needs 50 or more paired runs against the ' +
        'same passengers and an interval that excludes zero, which is what Compare is for.'
      : 'Nothing moved. A run is identified by its building, its dispatcher and its seed, so this ' +
        'is the same day simulated again and it reproduces exactly — the sheet is not stale, ' +
        'there was nothing new to say.',
  };
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
 *
 * ## The lede answers for the screen it is on — `docs/19` defects 1 and 14
 *
 * The design's sentence is advice, and twice it was false advice. A completed run standing
 * unfileable (boot's own, watched to its end after **Resume**; a recording loaded from a file)
 * got *"press 'Run this shift'"* from a sheet refusing, in silence, the very thing that copy
 * promises — so when {@link UnfiledSheetFacts.refusal} carries a sentence, the lede **is** that
 * sentence, `shift/banking.ts`'s own words unedited. And after a reload the rail said *on a roll ·
 * 1/1 banked* over this sheet's *Nothing filed yet* with nothing connecting the two; the
 * prior-sitting arm is the connection.
 *
 * ### The defect-14 decision, and why the sheet is not restored instead
 *
 * The alternative was to persist the filed sheet. Refused: a `ShapedDayReport` is derived, whole,
 * from a recording this shell holds in memory and deliberately does not persist (`persist/` — a
 * session snapshot is the week's facts, not a 57 MB recording), so a restored sheet would be a
 * document with no run behind it — unreplayable, undiffable, and one build away from a shape the
 * renderer no longer draws. The week's **facts** survive because they are facts; the sheet is an
 * *account*, and an account that cannot be reproduced is exactly what issue #136 refused to bank.
 * So the sheet says what happened to it, in words, and the title keeps the empty state's name —
 * the rail's claim is true, the sheet's is true, and the lede is what makes them one story.
 *
 * The refusal outranks the prior-sitting sentence when both hold: the completed run standing on
 * the stage is the thing the reader is looking at, and the older story can wait a run.
 */
export function emptyReportView(unfiled?: UnfiledSheetFacts): ReportView {
  const lede =
    unfiled?.refusal !== undefined
      ? unfiled.refusal
      : unfiled?.fromPreviousSitting === true
        ? 'The rail’s banked days are real — they were filed in a previous sitting. Their sheet ' +
          'was not kept: a sheet is an account of a run, and the run itself is not restored. Play ' +
          'a day through — press “Run this shift” — and today’s sheet fills itself in.'
        : 'Play a day through — press “Run this shift” — and the sheet fills itself in.';
  return {
    filed: false,
    title: 'Nothing filed yet',
    metaLines: [],
    lede,
    figures: [],
    verdictLine: '',
    verdictColour: 'var(--dim)',
    goals: [],
    diagnosis: [],
    // Nothing to head. The heading is hidden with its empty list rather than left standing over one.
    diagnosisHeading: '',
    // No rows, so the markup's own words stand — and the mount hides the heading with its empty
    // list, exactly as it does for the two headings below.
    goalsHeading: undefined,
    levers: [],
    // No cards, so nothing to head — and `undefined` here means *leave the markup alone*, which is
    // the right answer for a heading that is about to be hidden with its own empty list.
    leversHeading: undefined,
    // Nothing has been filed, so there is no earlier sheet and no later one to move from it.
    delta: null,
    smallPrint: '',
    // Nothing has been run, so there is no question to take anywhere yet.
    nextStep: undefined,
    // No day has closed, so there is no overnight. The box is hidden whole rather than drawn with
    // the word *Overnight* over three empty groups.
    overnight: null,
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
 * The run on screen, mid-day — the state a filed sheet may not be drawn over. See the module
 * docstring.
 *
 * The two clock strings are `shift/report.ts`'s {@link clockOf}, not this module's: there is no
 * arithmetic in this file, and *what time is it in this building* has exactly one implementation
 * that the header band, the transport ticks and this sheet all read.
 */
export interface WatchingRun {
  readonly kind: 'watching';
  /** Where the playhead is, as `HH:MM` on the shift clock. */
  readonly atClock: string;
  /** Where the run ends, as `HH:MM`. */
  readonly endsAtClock: string;
}

/**
 * How much of the run on screen has been watched — the one thing this surface needs from outside the
 * report to know whether the report is a statement about what is on the screen.
 */
export type RunProgress = { readonly kind: 'played-out' } | WatchingRun;

/**
 * Read the playhead against the run it is in.
 *
 * `Playback.simTimeS` is clamped into `[startedAt, endedAt]` and reaches `endedAt` exactly when the
 * transport reports `ended`, so the comparison is an equality in the case that matters rather than a
 * tolerance. No recording is `played-out` rather than `watching`: there is then no clock on the
 * screen for the sheet to disagree with, and `reportViewOf` has already answered the no-run case
 * with the empty sheet.
 */
export function runProgressOf(view: Pick<ViewAt, 'recording' | 'simTimeS'>): RunProgress {
  const recording = view.recording;
  if (recording === undefined || view.simTimeS >= recording.endedAt) return { kind: 'played-out' };
  return {
    kind: 'watching',
    atClock: clockOf(view.simTimeS),
    endsAtClock: clockOf(recording.endedAt),
  };
}

/**
 * The sheet a day still being watched gets — issue #16's fix, and § D223.
 *
 * Built on {@link emptyReportView} rather than beside it, because the half these two share is the
 * half that must not drift: *no figure, no goal, no verdict, nothing to advance to*. What differs is
 * the words, and the words are the whole point — the empty sheet's lede tells a reader to press
 * *Run this shift*, which is advice for something this reader has already done.
 *
 * The copy names three things that exist: the timeline (a click on it seeks — `main.ts`'s `scrubTo`),
 * the left rail, and the playhead's own clock. It promises no figure, because there is none it could
 * keep — see the module docstring on why a part-day cell cannot be honestly drawn.
 */
function watchingReportView(progress: WatchingRun): ReportView {
  const { atClock, endsAtClock } = progress;
  return {
    ...emptyReportView(),
    title: 'The day is still running',
    lede:
      `This sheet reports a whole day at once, and you are watching ${atClock} of a shift that ` +
      `runs to ${endsAtClock}. It waits for the playhead: a finished day’s figures beside a clock ` +
      `reading ${atClock} would be two answers to one question. The day is already simulated end ` +
      'to end, so play it through — or click the far end of the timeline — and the sheet is here. ' +
      'The left rail reads the shift while it runs.',
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
 * The whole sheet — nothing filed, still being watched, or filed. The only decision this surface
 * makes.
 *
 * The three arms are ordered by what a reader is owed. *Nothing has been run* outranks everything,
 * because a sheet cannot be about a run that does not exist. *The run is still on screen* comes
 * next, and it outranks a filed sheet on purpose: the report may be true of the recording and still
 * be the wrong thing to draw, because the rest of the screen is describing an instant the sheet is
 * hours past. See the module docstring.
 *
 * `progress` defaults to `played-out` so that a caller holding only a report — the honesty sweep
 * enumerating this surface's strings, a test asserting the filed sheet — gets the filed sheet.
 * `mountReport` never takes the default: it reads the playhead off the same {@link ViewAt} the
 * header and the footer are drawn from, which is what makes *two answers on one screen*
 * unconstructible rather than unlikely.
 *
 * **The bare `DayReport` arm is gone**, and its own docstring said when it would be: *"it is here so
 * this panel compiles against a `ViewerState.report` that has not yet been widened to
 * `ShapedDayReport`; when it is, this arm and the `'of' in report` test both go."* It was. Every
 * caller in the tree — `dev/main.ts` through `ViewerState.report`, and `honesty/surfaces.ts` — hands
 * over a shaped sheet, so the arm reconstructed a discriminator nothing had lost.
 */
export function reportViewOf(
  report: ShapedDayReport | undefined,
  progress: RunProgress = { kind: 'played-out' },
  previous?: ShapedDayReport | undefined,
  overnight?: TomorrowBriefing | undefined,
  mode: ViewMode = 'advanced',
  /*
   * Why the empty sheet is empty, when the shell knows more than *nothing has run* — `docs/19`
   * defects 1 and 14. Optional so every caller that holds only a report (the honesty sweep, the
   * dispatcher editor's strip, the suites) keeps its meaning: no facts is the plain empty sheet.
   */
  unfiled?: UnfiledSheetFacts | undefined,
): ReportView {
  if (report === undefined) return emptyReportView(unfiled);
  if (progress.kind === 'watching') return watchingReportView(progress);
  const shaped: ShapedDayReport = report;
  const casual = mode === 'basic';
  const singleRun = shaped.of === 'single-run';
  return {
    filed: true,
    // Both shapes carry it — see {@link SingleRunFramingView}.
    nextStep: shaped.nextStep,
    title: shaped.title,
    metaLines: shaped.metaLines,
    lede: shaped.lede,
    /*
     * **The order is the reframing; the membership is not** — issues #110 and #100.
     *
     * `casualFigureOrderOf` is a permutation, so the Casual grid carries every cell the Engineer
     * grid carries. What moves is which one a reader meets first: `shift/report.ts#figuresFor`
     * puts the two cohort statistics third and fourth, which is where an engineer wants them and
     * which puts the one cell a run may refuse ahead of every count of people. See
     * `mode/casualDay.ts`.
     *
     * The map is applied **after** the reorder rather than before it, so `figureViewOf` sees the
     * cell rather than a position — the two are independent, and a reorder that had to be kept in
     * step with a per-index lookup is the shape of coupling that goes wrong when a ninth figure
     * lands.
     */
    figures: (casual ? casualFigureOrderOf(shaped.figures) : shaped.figures).map((cell) =>
      figureViewOf(cell, mode),
    ),
    verdictLine: shaped.verdictLine,
    /*
     * Three verdicts, three colours — and the third is **neutral**, not a warning.
     *
     * This was a two-arm ternary when `verdict` had two values, so `ungraded` (§ D234) fell to the
     * `else` and a day nobody judged was drawn in the same amber as a day that missed its bars.
     * *Too quiet to grade* is not a failure and must not be coloured as one; `var(--dim)` is the
     * neutral this file already uses for the empty sheet a few hundred lines up, so the third arm
     * is the existing vocabulary rather than a new colour.
     *
     * Written as an exhaustive record for the reason § D237 gives about `VERDICT_VOICE`: a fourth
     * verdict must fail to compile here rather than silently inherit whatever the `else` says.
     *
     * **A single run's banner is not a verdict, so it does not take a verdict's colour** —
     * `docs/19` defect 13. `shift/report.ts` replaced its words with a refusal to grade; a green
     * refusal would be the grade back as a colour (KB-15's converse — colour may not carry a
     * signal the words withdrew), so the arm keys on the sheet's shape, exactly as
     * `render/reportCard.ts` inks the same line on the shared card.
     */
    verdictColour: singleRun ? 'var(--dim)' : VERDICT_COLOUR[shaped.verdict],
    /*
     * The readings survive; the grade does not — `docs/19` defect 13's other half, decided at
     * {@link SINGLE_RUN_GOALS_HEADING}. The mapping is chosen per sheet-shape here for Casual's
     * reason two fields down: this function is the panel's one decision surface, and a branch
     * inside the mount would be a branch no node suite can drive.
     */
    goals: shaped.goals.map(singleRun ? unaskedGoalRowViewOf : goalRowViewOf),
    goalsHeading: singleRun ? SINGLE_RUN_GOALS_HEADING : undefined,
    diagnosis: diagnosisRowsOf(shaped.diagnosis),
    diagnosisHeading: shaped.diagnosisHeading,
    levers: leverRowsOf(shaped.levers),
    leversHeading: casual ? CASUAL_LEVERS_HEADING : undefined,
    // Issue #38. `undefined` on the first sheet of a session, and on the two sheets above that
    // return before this expression is reached — a delta of a day that is still running would be
    // the § D223 defect with a second run's numbers in it.
    delta: previous === undefined ? null : reportDeltaOf(previous, shaped),
    /*
     * The beat is **week-shaped**, so it is dropped on a single run for `WeekFramingView`'s own
     * reason: five of the week's statements do not exist on that sheet, and *what changed
     * overnight* is a sixth. A Free Play run is one replication of one day and has no tomorrow to
     * have grown into.
     *
     * The arm is read off the *sheet's* shape rather than off whether a briefing happened to be
     * passed, so a caller that hands one over for a single run gets it dropped rather than drawn —
     * the same direction `framingOf` refuses in.
     */
    overnight: shaped.of === 'week-day' ? (overnight ?? null) : null,
    /*
     * **The engineer's paragraph, led into and followed out of** — never edited, and never cut.
     *
     * The small print carries the two terms issue #100 names for this surface — *the peak-5min
     * window* and *a confidence interval that excludes zero* — and both are load-bearing: the first
     * is the basis of every mean on the grid and the second is the bar this repository holds. So
     * Casual translates them in front (`CASUAL_SMALL_PRINT_LEAD`) and says what the two views
     * differ in behind (`CASUAL_REACH_NOTE`), and `shaped.smallPrint` sits between them byte for
     * byte. § D299's test binds here: a mode may make this easier to read and may not make it say
     * less.
     */
    smallPrint: casual
      ? `${CASUAL_SMALL_PRINT_LEAD} ${shaped.smallPrint} ${CASUAL_REACH_NOTE}`
      : shaped.smallPrint,
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
   * The two headings `index.html` authors as unaddressed siblings. Resolved once, at mount, so a
   * per-frame render does not walk the DOM for them.
   */
  const diagnosisHeading = headingOf(ui.diagnosis);
  const leversHeading = headingOf(ui.levers);
  /*
   * The goal block's heading — `<h3>The shift asked for</h3>` — resolved through the **verdict
   * span** rather than through `#report-goals`, because that is where the markup put it:
   * `index.html` seats the h3 and `#report-verdict` in one flex row, with the cleared banner and
   * the goal list as later siblings, so the one-level reach from the list would land on the
   * banner. The reach from `ui.verdict` is the same single `previousElementSibling` step
   * {@link headingOf} makes everywhere else, and it degrades the same way: no h3, and the heading
   * keeps whatever the markup says.
   */
  const goalsHeading = headingOf(ui.verdict);
  /** The markup's own words for it, captured at mount — {@link authoredLeversHeading}'s reason. */
  const authoredGoalsHeading = goalsHeading?.textContent ?? '';
  /**
   * *Levers you actually have* — `index.html`'s own words, captured once, at mount.
   *
   * The reason this is read off the DOM rather than written in this file is the reason
   * {@link ReportView.leversHeading} is `string | undefined`: a second copy of a string the markup
   * owns is two strings that agree today. The reason it is **captured** rather than simply left
   * alone is a defect this arrangement has and a one-directional write does not — the mode
   * selector moves **both** ways. Writing Casual's heading and then, on the way back, writing
   * nothing leaves *What would make tomorrow better* standing over an Engineer sheet, which is the
   * stale-sentence defect § D227 records, produced by the fix for a different one.
   *
   * `''` if the markup has no heading to climb to, which is `headingOf`'s own degraded case.
   */
  const authoredLeversHeading = leversHeading?.textContent ?? '';
  /** `.sheet` — the element `index.html` gives `overflow: auto`. Issue #62. */
  const scroller = ui.title.closest('.sheet');
  /**
   * The two sheets this panel is holding, and the reader's unpaid scroll — issues #38, #62 and #117.
   *
   * One value through one reducer, rather than the three `let`s this was: see
   * {@link SheetContinuity} for why the difference is the difference between a mechanism a test can
   * drive and a mechanism a test can only read.
   */
  let continuity: SheetContinuity = NOTHING_FILED_YET;

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
     *
     * The *drawn* view, playhead included: a banner that is not on the screen may not be actioned
     * from it. Without `runProgressOf` here this handler would read a cleared award off a sheet the
     * render is refusing to draw, which is the same disagreement one layer down.
     */
    const framing =
      view === undefined
        ? undefined
        : reportViewOf(view.state.report, runProgressOf(view)).framing;
    const nextId =
      framing?.kind === 'week-day' ? (framing.cleared?.nextContractId ?? null) : null;
    if (view !== undefined && nextId !== null) {
      const contract = contractById(nextId);
      /*
       * `restart` for the scenario card's reason (`WeekArrival`), and the week just cleared is
       * **parked** rather than dropped — GitHub issue #107. This was a bare `takeContract`, so the
       * button that congratulates a player on clearing a scenario also deleted the week they
       * cleared it in: the sparkline, the streak and the seven days went the moment they accepted
       * the reward.
       */
      const moved = switchWeek(view.state.week, view.state.parkedWeeks, nextId, 'restart');
      context.update({
        week: moved.week,
        parkedWeeks: moved.parked,
        ...(contract === undefined ? {} : { buildingId: contract.buildingId }),
        outOfServiceCarIds: [],
        // The intervention log belongs to the day being left, on outOfServiceCarIds' ground —
        // see ViewerState.interventions for the clearing ledger.
        interventions: [],
        recording: undefined,
        report: undefined,
        tomorrow: undefined,
        withheld: [],
      });
    }
    context.openTab('run');
  });

  /**
   * *Open the doors on tomorrow.*
   *
   * The recording, the report and the between-day beat are cleared in the same patch that advances
   * the day, so that if the run refuses the reader is looking at an empty sheet for a day that has
   * not happened rather than at yesterday's figures under today's date. The beat goes with the
   * sheet rather than surviving the press (issue #91): it is an account of a day that has closed,
   * and this press opens one that has not.
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
      tomorrow: undefined,
      withheld: [],
      // Yesterday's change of mind is part of yesterday's record, and tomorrow opens with none —
      // an intervention stamped 09:14 replayed onto a different day would be a stamp about a run
      // that never carried it. See ViewerState.interventions for the clearing ledger.
      interventions: [],
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

  /**
   * The between-day beat — GitHub issue #91.
   *
   * The box is hidden **whole** when there is no briefing, rather than emptied: `#report-overnight`
   * carries the caption *Overnight* as an authored child, so blanking the lists would leave the
   * word standing over nothing — this module's own rule, and the reason `cardOf` exists two slots
   * up. Here the container has its own id, so no climb is needed.
   *
   * Nothing is composed. Every string written below is a field of `TomorrowBriefing`, and the only
   * decision in this function is *which element does it go in*.
   */
  function drawOvernight(view: ReportView): void {
    const beat = view.overnight;
    setHidden(ui.overnight, beat === null);
    if (beat === null) {
      setText(ui.overnightHeadline, '');
      fill(ui.overnightGroups);
      fill(ui.overnightWithheld);
      return;
    }
    setText(ui.overnightHeadline, beat.headline);
    fill(
      ui.overnightGroups,
      ...beat.groups.map((group) =>
        el(doc, 'div', {
          className: 'overnight-group',
          children: [
            el(doc, 'div', { className: 'eyebrow', text: group.caption }),
            ...group.rows.map((row) =>
              el(doc, 'div', {
                className: 'overnight-row',
                children: [
                  el(doc, 'span', { className: 'overnight-label', text: row.label }),
                  el(doc, 'span', { className: 'overnight-value', text: row.value }),
                  el(doc, 'div', { className: 'overnight-note', text: row.note }),
                ],
              }),
            ),
          ],
        }),
      ),
    );
    /*
     * Tomorrow's refusals, drawn rather than swallowed. They are `shiftRunConfigOf`'s own words —
     * a calendar template the shift is too short for, a bias a mix-varying template refuses — and a
     * beat that promised the period while dropping the refusal would promise a day the run will not
     * deliver.
     */
    fill(
      ui.overnightWithheld,
      ...beat.withheld.map((line) =>
        el(doc, 'div', { className: 'overnight-withheld', text: line }),
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
            // Last night's figure before today's — the handoff's "was" column (§ 8.6), in the
            // same reading order the rail draws: claim, precedent, verdict.
            el(doc, 'span', { className: 'goal-was', text: row.was }),
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
      ...view.levers.map((lever) => {
        const words = [
          el(doc, 'div', {
            text: lever.title,
            style: { 'font-size': '13px', 'font-weight': '600' },
          }),
          el(doc, 'div', { className: 'figure-note', text: lever.body }),
        ];
        /*
         * **A card that names a tab goes there** — issue #38.
         *
         * A `<button>` rather than a click handler on the `<div>` that was here: the card is
         * reached by Tab, announced as a control, and pressed with Space or Enter, none of which a
         * clickable div is. `type="button"` because this sheet sits inside no form and a default
         * submit would reload the page.
         *
         * A card with no surface stays the `<div>` it was, and that is the § D177 rule kept rather
         * than bent: an element that looks pressable and does nothing is the inert control this
         * repository counts, so the two cards that may not navigate do not look as though they can.
         */
        if (lever.surface === undefined) {
          return el(doc, 'div', { className: 'report-lever', children: words });
        }
        const surface = lever.surface;
        const card = el(doc, 'button', {
          className: 'report-lever report-lever-goes',
          attrs: { type: 'button' },
          children: words,
        });
        card.addEventListener('click', () => {
          context.openTab(surface);
        });
        return card;
      }),
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

  /*
   * *What moved since the run before this one* — issue #38, and the second block `index.html` has
   * no slot for. Built here for the reason `nextStepBox` is: the markup is the handoff's, and the
   * handoff drew one sheet at a time.
   *
   * It sits directly under the lede and **above** the figure grid, which is where the question it
   * answers is asked: the reader has just re-run a shift with one thing changed and wants to know
   * what that did. No colour anywhere in it — see {@link ReportDeltaView}.
   */
  const deltaCaption = el(doc, 'div', { className: 'eyebrow' });
  const deltaRows = el(doc, 'div', { style: { display: 'grid', gap: '4px', 'margin-top': '6px' } });
  const deltaNote = el(doc, 'p', { className: 'figure-note' });
  const deltaBox = el(doc, 'div', {
    style: { margin: '14px 0 0', padding: '11px 13px', border: '1px solid var(--edge)', 'border-radius': '10px' },
    children: [deltaCaption, deltaRows, deltaNote],
  });
  ui.lede.insertAdjacentElement('afterend', deltaBox);

  /**
   * One `LABEL  before → after` line. The arrow is a separator, never a direction.
   *
   * The count rides **beside its own value** rather than under the row — issue #137, and the
   * placement is the argument. R13 asks for the `n` in the same visual unit as the figure; a line
   * under the row would satisfy that and would leave a reader to work out which of two numbers goes
   * with which of two counts, which is the one thing a pairing of two runs cannot let them guess.
   * Parenthesised, dimmed and set at the note size, so it reads as the sheet's own figure note —
   * which is what it is, verbatim — rather than as part of the value.
   */
  function deltaRow(row: DeltaRowView): HTMLElement {
    const count = (text: string | null): readonly HTMLElement[] =>
      text === null
        ? []
        : [el(doc, 'span', { text: `(${text})`, style: { color: 'var(--dim)', 'font-size': '11px' } })];
    return el(doc, 'div', {
      style: { display: 'flex', 'flex-wrap': 'wrap', gap: '4px 8px', 'font-size': '12px' },
      children: [
        el(doc, 'span', {
          text: row.label,
          style: { font: '600 11px var(--mono)', color: 'var(--dim)', 'min-width': '150px' },
        }),
        // `was` in words as well as in position, because a bare arrow is a signal with one channel.
        el(doc, 'span', { text: `was ${row.before}`, style: { color: 'var(--dim)' } }),
        ...count(row.beforeCount),
        // Decorative: `was` already carries the relation in words, so a screen reader hears it once.
        el(doc, 'span', { text: '→', attrs: { 'aria-hidden': 'true' }, style: { color: 'var(--dim)' } }),
        el(doc, 'span', { text: row.after }),
        ...count(row.afterCount),
      ],
    });
  }

  /*
   * The block, refused or not, drawn the same way — issues #117 and #102.
   *
   * There is no branch here and there deliberately is not one: a refused delta is a delta whose
   * `figures` are empty and whose `caption` and `note` say so, which is the shape `reportDeltaOf`
   * returns. A renderer that drew the refusal differently would be a second place that decides
   * whether two runs are comparable, and the two would disagree the day one of them was edited.
   */
  function drawDelta(view: ReportView): void {
    const delta = view.delta;
    setHidden(deltaBox, delta === null);
    setText(deltaCaption, delta?.caption ?? '');
    setText(deltaNote, delta?.note ?? '');
    fill(deltaRows, ...(delta === null ? [] : [...delta.selection, ...delta.figures].map(deltaRow)));
  }

  return {
    render(view: ViewAt): void {
      latest = view;
      /*
       * The playhead is read off the same `ViewAt` that `drawHeader` and `drawFooter` are given in
       * the same `renderAll`, so the sheet and the chrome cannot be describing different instants —
       * issue #16, § D223.
       */
      const progress = runProgressOf(view);
      /*
       * The rotation, and it happens **before** the view is built rather than after it.
       *
       * A new filed account arrives: the sheet that was on screen becomes the one this sheet is
       * differenced against (issue #38), and the reader is owed the top of the new one (issue #62).
       * Both halves, and the reasons neither may move, are {@link rotatedOn}'s — this line is the
       * one place it is called, and the whole of the state it keeps is {@link continuity}.
       */
      continuity = rotatedOn(continuity, view.state.report, progress);
      /*
       * The reader's disclosure level, read off the same `ViewerState` the header's `view` selector
       * writes — issues #110 and #100. It is threaded rather than looked up because every decision
       * this surface makes lives in `reportViewOf`, which a test can reach and a mount cannot: a
       * Casual branch inside this closure would be a branch no suite in this package can drive, in
       * a repository whose vitest projects are all `environment: 'node'`.
       */
      const drawn = reportViewOf(
        view.state.report,
        progress,
        continuity.previous,
        view.state.tomorrow,
        view.state.mode,
        // Why an empty sheet is empty, when the shell knows — `docs/19` defects 1 and 14. Read
        // off the same `ViewAt` as everything else, so the sheet's excuse and the rail's claim
        // are facts about one frame.
        view.unfiledSheet,
      );
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
      drawDelta(drawn);
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
      /*
       * The goal block's heading, written from the sheet on the one shape where the authored words
       * are a false claim (`docs/19` defect 13) and restored to the markup's own on every other —
       * {@link authoredLeversHeading}'s two-way rule, because the mode selector and the play mode
       * both move both ways. Hidden with its empty list on the two unfiled sheets, where *The
       * shift asked for* stood over nothing.
       */
      if (goalsHeading !== undefined) {
        setText(goalsHeading, drawn.goalsHeading ?? authoredGoalsHeading);
        setHidden(goalsHeading, drawn.goals.length === 0);
      }
      drawDiagnosis(drawn);
      drawLevers(drawn);
      /*
       * The heading says what the section is, so it is written from the sheet rather than left as
       * `index.html`'s fixed *Where it went wrong* (issue #56) — and it is hidden with its list
       * rather than left standing over an empty box, which is this module's own rule for a slot with
       * nothing in it, applied to the caption instead of the field.
       */
      if (diagnosisHeading !== undefined) {
        setText(diagnosisHeading, drawn.diagnosisHeading);
        setHidden(diagnosisHeading, drawn.diagnosis.length === 0);
      }
      if (leversHeading !== undefined) {
        /*
         * The view's words, or the markup's own — and it is written on **every** frame rather than
         * only when the view has some, because the mode selector moves both ways. See
         * {@link authoredLeversHeading}: writing Casual's question and then leaving it there would
         * put *What would make tomorrow better* over an Engineer sheet.
         *
         * Hidden with its list either way, for the reason the diagnosis heading is: a caption over
         * an empty box reads as a surface that failed to load.
         */
        setText(leversHeading, drawn.leversHeading ?? authoredLeversHeading);
        setHidden(leversHeading, drawn.levers.length === 0);
      }

      setText(ui.forecastName, week?.forecast.name ?? '');
      setText(ui.forecastNote, week?.forecast.note ?? '');
      setText(ui.forecastDemand, week?.forecast.demand ?? '');
      setHidden(cardOf(ui.forecastName), week === null);
      setText(ui.taught, week?.taught ?? '');
      setHidden(cardOf(ui.taught), week === null);
      drawOvernight(drawn);
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

      /*
       * A new sheet opens at its own top — issue #62, second half.
       *
       * The scroll is written only while the panel is on screen: `renderAll` draws every panel on
       * every frame, tab or no tab, and `index.html` hides a tabpanel with `display: none`, where
       * `scrollTop` is not writable. The sheet files while the reader is still on the run surface —
       * `main.ts`'s `closeShift` sets the report and the tab in one patch — so a write at the moment
       * the identity changed would land on an element with no layout and be dropped.
       *
       * The flag is cleared on the write rather than on the identity change, so a reader who scrolls
       * *this* sheet keeps their place — see {@link topWritten}.
       */
      if (continuity.owesTop && scroller !== null && view.state.tab === 'report') {
        scroller.scrollTop = 0;
        continuity = topWritten(continuity);
      }
    },
  };
}
