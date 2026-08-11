/**
 * The left rail — *how the building feels* (`docs/12-design-handoff.md` § 1.2, rows L1–L7).
 *
 * ## What this file is allowed to know
 *
 * Seven surfaces, one mount, and **no arithmetic over a recording anywhere in it**. Every number
 * that reaches the page here was folded by `live/` or `shift/`; this module chooses words,
 * colours and widths and writes them into the elements `dev/elementMap.ts` names. That split is
 * the one `controls/render.ts` established and `dev/dom.ts`'s docstring restates: *the decision is
 * a pure function returning a descriptor, and the DOM is the dumb instantiator*. It is not a
 * stylistic preference — this repository has no jsdom (`vitest.config.ts` is `environment: 'node'`
 * for every project), so a decision made inside a DOM write is a decision no test can reach.
 *
 * Hence the exported pure functions below — {@link statRowsOf}, {@link moodViewOf},
 * {@link goalRowsOf}, {@link runFiguresOf}, {@link historyBarsOf}, {@link decisionRowViewOf},
 * {@link mathsDisclosureOf} — and hence the fact that {@link mountLeftRail} contains no `if` that
 * is about *what to say*, only about *where to put it*.
 *
 * ## The rule that outranks the design
 *
 * **Never display a suppressed mean.** `frame/overlay.ts`'s `meansAreSuppressed` is the one gate
 * (`docs/10` R9), and this rail's answer to it is structural rather than careful: it reads
 * `live/`, and `live/noMeans.test.ts` asserts mechanically that no module in that directory even
 * *names* `meanWaitS`, `wait95S` or `meanTimeToDestinationS`. Nothing here recomputes a mean
 * either — there is not one division in this file over a cohort. `leftRail.test.ts` re-runs the
 * `live/` walk against every string this module produces, on a real saturated Vertical City run,
 * because a renderer is the last place a suppressed figure could re-enter.
 *
 * That is also why the rail is worth having at all: at the viewer's own defaults only **14 of 60**
 * building × dispatcher combinations produce a quotable mean (`render/mood.ts` M1), so a rail
 * built on one would be blank on the 46 runs whose mood is worth watching.
 *
 * ## KB-15 — no colour-only signal
 *
 * Every coloured thing here carries a second signal in text:
 *
 * | Surface | Colour | The second signal |
 * |---|---|---|
 * | mood face | the worst band's tint | the face glyph `◡ ◠ ⌄ ×`, and the headline sentence |
 * | mood bar | the four band colours | the 2×2 legend names each band and states its count, and the bar's `aria-label` says the same in words |
 * | mood card's **basis** | nothing — it is never a colour | the headline's tense and the sub-line's *across the whole shift*, both in the `aria-label` too |
 * | *longest wait* | band amber / band red | the figure itself — `142 s` is the state |
 * | *served under N s* | band green / amber / red | the percentage, and `—` when there is no denominator |
 * | goal rows | met green / missed amber / pending grey | `GOAL_GLYPHS`' `✓ × ·`, plus the value or `—` |
 * | honesty card | amber or green edge | the `⚠`/`✓` glyph and the title sentence |
 * | decision rows | the outcome palette | the head reads `A → Level 12`, `A ⇄ Level 12` or `no car for Level 12` — three different sentences, not three colours |
 * | mood drivers | the three level colours | `MOOD_GLYPH`'s `○ ◑ ●`, and each row states its own number |
 * | a card drawn short of the end | italics, and nothing else until issue #109 | the retraction row — `·` and a sentence naming every reading withheld and what brings it back |
 *
 * The last row is the one this table was wrong about. `.mood-provisional { font-style: italic; }`
 * was the *whole* of R6 on this card: the rail draws `mood.drivers`, `mood.caveat` and
 * `mood.provisional` and has never drawn `mood.headline` — the headline here is `moodOf(bands)`'s —
 * so the *So far* sentence `render/mood.ts` writes for exactly this purpose reached the canvas and
 * not the rail. A promise a table makes on behalf of a surface is worth what § D227 says a stated
 * refusal is worth: nothing, until a test holds it. {@link moodDriverPanelOf} now carries it, and
 * `leftRail.test.ts` holds it.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { queueAt } from '../frame/overlay.js';
import { BAND_COLORS, WAIT_BANDS, moodOf, waitBandsAt } from '../live/bands.js';
import { decisionRowsAt } from '../live/decisions.js';
import { honestyAt } from '../live/honesty.js';
import { observationsAt } from '../live/observations.js';
import type {
  DecisionRow,
  DisclosureMode,
  HonestyCard,
  LiveObservations,
  Mood,
  WaitBandBasis,
  WaitBandId,
  WaitBands,
} from '../live/types.js';
import type { ViewMode } from '../mode/types.js';
import { MOOD_GLYPH, buildingMood, moodObservationsOf, type BuildingMood } from '../render/mood.js';
import { contractById } from '../shift/contracts.js';
import { scheduledEventFor } from '../shift/calendar.js';
import {
  PENDING_DISPLAY,
  bestLineFor,
  goalsForDay,
  readGoals,
  wasDisplayOf,
} from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import {
  weekdayOf,
  type DayOutcome,
  type GoalObservations,
  type GoalReading,
  type WeekState,
} from '../shift/types.js';

import {el, fill, keyedFill, setHidden, setStyle, setText } from './dom.js';
import type { HonestyElements, MoodElements, ShiftElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { disclosureOf } from './state.js';

/**
 * The elements this mount owns — a structural subset of `Elements`, so the shell passes its whole
 * record and the compiler confines this file to four of its fields.
 */
export interface LeftRailElements {
  readonly mood: MoodElements;
  readonly shift: ShiftElements;
  readonly honesty: HonestyElements;
  /** § 1.2 L7. */
  readonly decisionLog: HTMLElement;
}

/* -------------------------------------------------------------------------- *
 * Tokens
 *
 * Every colour this file writes is a CSS custom property **by name rather than
 * by value**: the stylesheet already declares the token set and a hex literal
 * here would be the second copy of it. `style.setProperty` takes `var(--x)`
 * happily, so there is no cost to spelling it this way.
 *
 * That was true of the four below and, until § D251, false of the band colours
 * beside them — `live/bands.ts` held its own hexes, this file put them into
 * inline styles, and an inline style is not reached by a `:root[data-theme]`
 * block. The rule and the practice agree now: `live/` names tokens too, so
 * `BAND_COLORS[0]` *is* `var(--band-0)` and the rail draws the page's green
 * rather than a copy of the dark one.
 * -------------------------------------------------------------------------- */

const INK = 'var(--text)';
const DIM = 'var(--dimmer)';
const FAINT = 'var(--faint)';
/** The empty half of a progress track, and a bar with nothing to report. */
const TRACK = 'var(--edge-strong)';
const BANKED = 'var(--accent-soft)';

/** `WAIT_BANDS[0].color` — `var(--band-0)`, so the *good* green is the page's and not a copy. */
const GOOD = BAND_COLORS[0] ?? INK;
const CAUTION = BAND_COLORS[1] ?? INK;
const HOT = BAND_COLORS[3] ?? INK;

/* -------------------------------------------------------------------------- *
 * L1 / L2 — the mood card
 * -------------------------------------------------------------------------- */

/** One segment of the four-part stacked bar. */
export interface MoodSegment {
  readonly bandId: WaitBandId;
  /** A whole percentage. The four sum to exactly 100 whenever anybody is waiting. */
  readonly widthPct: number;
  readonly color: string;
}

/** One cell of the 2×2 legend — design `:72–76`. */
export interface MoodLegendEntry {
  readonly bandId: WaitBandId;
  readonly label: string;
  readonly count: number;
  readonly color: string;
}

export interface MoodView {
  readonly face: string;
  readonly headline: string;
  readonly sub: string;
  readonly faceBg: string;
  readonly faceEdge: string;
  readonly segments: readonly MoodSegment[];
  readonly legend: readonly MoodLegendEntry[];
  /**
   * The bar's `aria-label`, and KB-15's second signal for it: the same partition in words, so a
   * reader who cannot separate amber from orange still has the counts.
   */
  readonly barLabel: string;
  readonly anybodyWaiting: boolean;
}

/**
 * The mood card, from one scan of the queues.
 *
 * `bands` and `mood` are taken as arguments rather than recomputed because `moodOf` is
 * deliberately exposed for exactly this: `waitBandsAt` twice on the same frame would be correct
 * and would double the work.
 *
 * ## Why the widths are apportioned rather than `WaitBandCount.pct`
 *
 * `WaitBandCount.pct` is `Math.round(count / total * 100)` and its own docstring says the four
 * need not sum to 100 — true, and harmless where the design binds them to `flex`. They are bound
 * to `width` here, inside a fixed-width track, so a set that sums to 99 draws a one-percent gap of
 * background that means nothing, and a set that sums to 101 silently clips the worst band off the
 * right-hand end. The bar is a *partition of the people standing right now*; largest-remainder
 * apportionment is what keeps it one.
 *
 * Ties in the remainder go to the calmer band, which is the direction that cannot flatter: a
 * rounding unit awarded upward would widen *taking the stairs*, and the one error this card must
 * not make is the reassuring one — so the tie-break is the conservative direction for the *bar*,
 * while the worst band's *presence* is never rounded away because {@link MoodLegendEntry.count} is
 * the raw head count and sits beside it.
 */
export function moodViewOf(bands: WaitBands, mood: Mood): MoodView {
  const widths = apportion(
    bands.counts.map((entry) => entry.count),
    bands.total,
  );
  const live = bands.basis === 'now';
  return {
    face: mood.face,
    headline: mood.headline,
    sub: mood.sub,
    faceBg: mood.bg,
    faceEdge: mood.edge,
    segments: bands.counts.map((entry, index) => ({
      bandId: entry.band.id,
      widthPct: widths[index] ?? 0,
      color: entry.band.color,
    })),
    legend: bands.counts.map((entry) => ({
      bandId: entry.band.id,
      label: entry.band.label,
      count: entry.count,
      color: entry.band.color,
    })),
    /*
     * KB-15's second signal for the bar, and — since the card grew a second basis — the one place
     * the basis is stated in full words rather than implied by a tense. A screen-reader user gets
     * *"Across the whole shift, 1392 people called a lift: …"* and never has to infer from a face
     * glyph which of two questions the bar is answering.
     */
    barLabel: barLabelOf(bands, live),
    anybodyWaiting: bands.total > 0,
  };
}

function barLabelOf(bands: WaitBands, live: boolean): string {
  const partition = bands.counts
    .map((entry) => `${String(entry.count)} ${entry.band.label}`)
    .join(', ');
  if (live) {
    return bands.total === 0 ? 'Nobody is waiting.' : `${String(bands.total)} waiting: ${partition}.`;
  }
  return bands.total === 0
    ? 'The shift is over and nobody called a lift.'
    : `Across the whole shift, ${String(bands.total)} people called a lift, ` +
        `by the longest each of them stood: ${partition}.`;
}

/** The card before the first run: no face, no claim, and no zeros pretending to be observations. */
export function idleMoodView(): MoodView {
  const first = WAIT_BANDS[0];
  return {
    face: '·',
    headline: 'No shift on the board yet.',
    sub: 'run a shift and this fills in',
    faceBg: 'transparent',
    faceEdge: first?.color ?? INK,
    segments: WAIT_BANDS.map((band) => ({ bandId: band.id, widthPct: 0, color: band.color })),
    legend: WAIT_BANDS.map((band) => ({
      bandId: band.id,
      label: band.label,
      count: 0,
      color: band.color,
    })),
    barLabel: 'No shift on the board yet.',
    anybodyWaiting: false,
  };
}

/**
 * Whole percentages that sum to exactly 100, by largest remainder.
 *
 * Returns all zeroes on an empty total, which is the honest reading of an empty lobby: a bar of
 * four zeroes draws nothing, and `|| 1` in the denominator would draw a full green bar about a
 * building nobody is in.
 */
function apportion(counts: readonly number[], total: number): readonly number[] {
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((count) => (count / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    // Largest remainder first; a tie goes to the calmer band, which is the lower index.
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const out = [...floors];
  for (const entry of order) {
    if (remaining <= 0) break;
    out[entry.index] = (out[entry.index] ?? 0) + 1;
    remaining -= 1;
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * L3 — the four stat rows
 * -------------------------------------------------------------------------- */

/** What a stat row's colour *means*, carried so a test can assert it without reading a hex. */
export type StatTone = 'plain' | 'good' | 'caution' | 'hot' | 'unknown';

export interface StatRow {
  readonly label: string;
  readonly value: string;
  /** The handoff's tooltip, verbatim. See {@link SERVED_TITLE} for the one that is extended. */
  readonly title: string;
  readonly tone: StatTone;
  /** The colour {@link tone} paints. `undefined` leaves the row at the default ink. */
  readonly color: string | undefined;
}

/** Design `:80`, verbatim. */
const STANDING_TITLE =
  'People at a landing with their call registered and no car yet. Instantaneous, not an average.';
/** Design `:82`, verbatim. */
const LONGEST_TITLE =
  'The worst wait currently on the board. This is the number tenants complain about — averages hide it.';
/** Design `:83`, verbatim. */
const CARRIED_TITLE = 'Passengers delivered to their destination floor since 06:00.';
/** Design `:84`, verbatim. True of every shipped building; see {@link servedTitleFor}. */
const SERVED_TITLE =
  'Share of served calls whose hall wait was under a minute. Sixty seconds is the conventional ' +
  'line between acceptable and noticed.';

/**
 * The wait ages the *longest wait* row changes colour at.
 *
 * The design writes `> 120` and `> 60` as literals. They are read off {@link WAIT_BANDS} here
 * instead — `checking-watch` opens at 60 s and `taking-the-stairs` at 120 s — because the two
 * boundaries and the mood card's four legend labels are the same statement about the same
 * building, and a rail that hard-coded them could start colouring a wait amber on one surface and
 * green on the other. Falling back to the literals keeps this total if a band is ever removed.
 */
const AMBER_FROM_S = WAIT_BANDS[2]?.fromS ?? 60;
const RED_FROM_S = WAIT_BANDS[3]?.fromS ?? 120;

/**
 * The four rows, in the design's order.
 *
 * ## The fourth caption is generated, and that is the point of the row
 *
 * `LiveObservations.longWaitThresholdS` is *this run's* long-wait threshold, taken off the
 * summary and never assumed. Every shipped building reports 60 s, so the caption reads *served
 * under 60 s* today — but a building that counted a long wait at 45 s would otherwise be labelled
 * with somebody else's number, which is a caption that has stopped describing the picture.
 *
 * ## Why the share can be a dash and can never be `100%`
 *
 * `servedUnderThresholdPct` is `undefined` when nothing has boarded. The design's prototype
 * returns 100 % on an empty denominator, which reads as *everybody was served promptly* about a
 * building where nobody has been served at all. R13, one type down — and the `n` travels into the
 * tooltip beside it, because the same percentage over five legs and over four hundred are
 * different claims.
 */
export function statRowsOf(observations: LiveObservations): readonly StatRow[] {
  const longest = observations.longestCurrentWaitS;
  const share = observations.servedUnderThresholdPct;

  const longestTone: StatTone =
    longest === undefined
      ? 'plain'
      : longest >= RED_FROM_S
        ? 'hot'
        : longest >= AMBER_FROM_S
          ? 'caution'
          : 'plain';

  const shareTone: StatTone =
    share === undefined ? 'unknown' : share >= 75 ? 'good' : share >= 50 ? 'caution' : 'hot';

  return [
    row('standing right now', String(observations.waitingNow), STANDING_TITLE, 'plain'),
    row(
      'longest wait',
      longest === undefined ? 'nobody waiting' : `${longest.toFixed(0)} s`,
      LONGEST_TITLE,
      longestTone,
    ),
    row('carried today', String(observations.carried), CARRIED_TITLE, 'plain'),
    row(
      servedCaptionFor(observations.longWaitThresholdS),
      share === undefined ? PENDING_DISPLAY : `${share.toFixed(0)}%`,
      servedTitleFor(observations.longWaitThresholdS, observations.servedCount),
      shareTone,
    ),
  ];
}

/** The same four rows before the first run: the labels, and nothing claimed. */
export function idleStatRowsOf(): readonly StatRow[] {
  return [
    row('standing right now', PENDING_DISPLAY, STANDING_TITLE, 'unknown'),
    row('longest wait', PENDING_DISPLAY, LONGEST_TITLE, 'unknown'),
    row('carried today', PENDING_DISPLAY, CARRIED_TITLE, 'unknown'),
    /*
     * No threshold to name, so the caption does not name one. Writing `served under 60 s` here
     * would be the hard-coded caption this row exists to avoid, printed at the one moment there
     * is provably no run to have measured it.
     */
    row(
      'served promptly',
      PENDING_DISPLAY,
      'No shift has run, so there is no long-wait threshold to measure a share against.',
      'unknown',
    ),
  ];
}

function row(label: string, value: string, title: string, tone: StatTone): StatRow {
  return { label, value, title, tone, color: colorOfTone(tone) };
}

function colorOfTone(tone: StatTone): string | undefined {
  switch (tone) {
    case 'good':
      return GOOD;
    case 'caution':
      return CAUTION;
    case 'hot':
      return HOT;
    case 'unknown':
      return DIM;
    case 'plain':
      return undefined;
  }
}

/** `served under 60 s` — the number is the run's, never this file's. */
export function servedCaptionFor(thresholdS: number): string {
  return `served under ${thresholdS.toFixed(0)} s`;
}

/**
 * The tooltip, with the run's `n` on the end.
 *
 * The handoff's sentence is kept verbatim when the threshold is the sixty seconds it describes,
 * and replaced when it is not — a tooltip that says *under a minute* over a row captioned *served
 * under 45 s* is two claims about one number.
 */
export function servedTitleFor(thresholdS: number, servedCount: number): string {
  const base =
    Math.round(thresholdS) === 60
      ? SERVED_TITLE
      : `Share of served calls whose hall wait was under ${thresholdS.toFixed(0)} s — this run's ` +
        'own long-wait threshold, rather than the conventional sixty.';
  return `${base} Over ${String(servedCount)} served legs.`;
}

/* -------------------------------------------------------------------------- *
 * L4 — YOUR RUN
 * -------------------------------------------------------------------------- */

export interface RunFigure {
  readonly value: string;
  readonly label: string;
  readonly color: string | undefined;
}

/** The eyebrow note beside `YOUR RUN` and `TODAY'S SHIFT` — design `:90`, `:123`. */
export interface StreakLine {
  readonly text: string;
  readonly color: string;
}

export function streakLineOf(week: WeekState): StreakLine {
  return week.streak > 0
    ? { text: 'on a roll', color: GOOD }
    : { text: 'no streak yet', color: DIM };
}

/**
 * The three figures — design `:93–105`.
 *
 * *banked this scenario* reads `—` rather than `0/0` for a building the reader built, because
 * there is no contract behind it to bank against and a fraction with no denominator is not a
 * progress figure. `contractById` returns `undefined` there rather than throwing, which is the
 * behaviour `week.ts` relies on for restored state naming a scenario since renamed.
 */
export function runFiguresOf(week: WeekState): readonly RunFigure[] {
  const contract = contractById(week.contractId);
  return [
    {
      value: String(week.streak),
      label: 'clean days running',
      color: week.streak > 0 ? GOOD : DIM,
    },
    { value: `${String(week.bestMinutePct)}%`, label: 'best day so far', color: undefined },
    {
      value:
        contract === undefined
          ? PENDING_DISPLAY
          : `${String(week.cleanRun)}/${String(contract.needClean)}`,
      label: 'banked this scenario',
      color: BANKED,
    },
  ];
}

/** One bar of the seven-day sparkline. */
export interface HistoryBar {
  /** Two letters of the weekday — design `:1974`. */
  readonly short: string;
  /** `0`–`100`. Floored at {@link MIN_BAR_PCT} so a bad day is still a visible bar. */
  readonly heightPct: number;
  readonly color: string;
  readonly title: string;
}

/**
 * The design's own bar thresholds (`:1975`): 75 % and 50 % of riders away inside a minute.
 *
 * Named rather than inlined because they are the *sparkline's* ladder and the served row's ladder
 * and the two must not drift — {@link statRowsOf} reads the same two numbers.
 */
const GOOD_SHARE_PCT = 75;
const FAIR_SHARE_PCT = 50;
/** Design `:1975`'s `Math.max(6, …)`: a zero-height bar reads as a missing day, not a bad one. */
const MIN_BAR_PCT = 6;

/**
 * Seven bars, oldest first, or one provisional bar for a day still running.
 *
 * `WeekState.history` already holds at most seven (`HISTORY_DAYS`), so nothing is sliced here — a
 * second truncation would be a second answer to *how long is the history*.
 */
export function historyBarsOf(
  history: readonly DayOutcome[],
  todayMinutePct: number | undefined,
  todayDayIdx: number,
): readonly HistoryBar[] {
  if (history.length > 0) {
    return history.map((day) => ({
      short: day.weekday.slice(0, 2),
      heightPct: Math.max(MIN_BAR_PCT, day.minutePct),
      color: shareColor(day.minutePct),
      title:
        `${day.weekday}: ${String(day.minutePct)}% away inside a minute, ` +
        `${String(day.carried)} carried of ${String(day.arrived)} who turned up`,
    }));
  }
  const weekday = weekdayOf(todayDayIdx);
  if (todayMinutePct === undefined) {
    return [
      {
        short: weekday.slice(0, 2),
        heightPct: MIN_BAR_PCT,
        color: TRACK,
        title: `${weekday}: nothing banked yet — no shift has closed`,
      },
    ];
  }
  return [
    {
      short: weekday.slice(0, 2),
      heightPct: Math.max(MIN_BAR_PCT, todayMinutePct),
      color: shareColor(todayMinutePct),
      title: `${weekday}, so far: ${String(todayMinutePct)}% away inside a minute`,
    },
  ];
}

function shareColor(pct: number): string {
  if (pct >= GOOD_SHARE_PCT) return GOOD;
  if (pct >= FAIR_SHARE_PCT) return CAUTION;
  return HOT;
}

/* -------------------------------------------------------------------------- *
 * L5 — TODAY'S SHIFT
 * -------------------------------------------------------------------------- */

export interface GoalRow {
  /** `✓`, `×` or `·` — `GOAL_GLYPHS`. Never the only signal; {@link value} is the other. */
  readonly glyph: string;
  readonly label: string;
  /** The observed value with its unit, or `PENDING_DISPLAY`. Never a number while pending. */
  readonly value: string;
  /**
   * `was 78%`, or the bare em dash when the building has no previous day — the handoff's "was"
   * figure (§ 8.6), derived by `shift/goals.ts#wasDisplayOf` so this screen and the report sheet
   * cannot show two different yesterdays.
   */
  readonly was: string;
  readonly state: GoalReading['state'];
  readonly barPct: number;
  /** Glyph and value colour. */
  readonly color: string;
  /** The progress bar's fill. Flat grey while pending — an ungraded bar is empty, not full. */
  readonly fill: string;
}

/**
 * One row per reading — design `:130–140`, plus the "was" slot the casual handoff adds (§ 8.6).
 *
 * The three states are the design's three, and `pending` is not a `missed` in a grey coat: a
 * morning under twenty arrivals has not been judged, so its row shows the em dash and a flat
 * track. `readGoal` decides that; this only paints it, which is why the assertion *a pending goal
 * never renders a number* is a property of {@link GoalReading.display} that this function may not
 * be able to break.
 *
 * The `was` slot prints the word only when there is a figure to attribute: `was —` would dress an
 * absence as a measurement, so a day with no yesterday shows the bare dash.
 */
export function goalRowsOf(
  readings: readonly GoalReading[],
  history: readonly DayOutcome[],
  day: number,
): readonly GoalRow[] {
  return readings.map((reading) => {
    const met = reading.state === 'met';
    const pending = reading.state === 'pending';
    const was = wasDisplayOf(history, day, reading.goal);
    return {
      glyph: reading.glyph,
      label: reading.goal.label,
      value: reading.display,
      was: was === PENDING_DISPLAY ? PENDING_DISPLAY : `was ${was}`,
      state: reading.state,
      barPct: reading.progressPct,
      color: pending ? FAINT : met ? GOOD : CAUTION,
      /*
       * A missed goal with nothing observed yet gets the empty track rather than amber: design
       * `:2394`'s `met ? green : got > 0 ? amber : track`. An amber sliver at zero would claim
       * progress that has not happened.
       */
      fill: pending ? TRACK : met ? GOOD : (reading.observed ?? 0) > 0 ? CAUTION : TRACK,
    };
  });
}

/* -------------------------------------------------------------------------- *
 * L6 — the honesty card
 * -------------------------------------------------------------------------- */

export interface MathsDisclosure {
  readonly toggleHidden: boolean;
  readonly toggleLabel: string;
  readonly mathsHidden: boolean;
  readonly maths: string;
}

/**
 * The *show me the maths* disclosure — design `:153–158`, **with the prototype's own rule fixed.**
 *
 * The design computes `hasMaths = engineer` and then `showMaths = st.showMaths || engineer`. Those
 * two together make the toggle inert: it is visible exactly when the maths is already disclosed by
 * the mode, so pressing it flips a state field and changes nothing on the screen. That is a
 * control that does not do anything, which is the defect this whole wave has a rule about — and it
 * is in the prototype rather than in the implementation, which is why it is corrected here and
 * recorded in `docs/12` § 4 rather than reproduced faithfully.
 *
 * The rule implemented is the one the design's *appearance* implies: the toggle exists in engineer
 * mode, the maths starts **disclosed** there (so the first engineer view matches the mockup's
 * screenshot, and the button reads *hide the maths*), and pressing it hides and shows the
 * paragraph. `ViewerState.showMaths` therefore defaults to `true`; in casual mode `hasMaths` is
 * false and neither the toggle nor the paragraph is drawn, exactly as before.
 */
export function mathsDisclosureOf(
  card: HonestyCard,
  showMaths: boolean,
  mode: DisclosureMode,
): MathsDisclosure {
  void mode;
  const disclosed = card.hasMaths && showMaths;
  return {
    toggleHidden: !card.hasMaths,
    toggleLabel: disclosed ? 'hide the maths' : 'show me the maths',
    mathsHidden: !disclosed,
    maths: card.maths ?? '',
  };
}

/**
 * The card before the first run.
 *
 * Not a `✓`: nothing has been checked. `suppressed` is `false` because no run has been refused,
 * and `warning` is `false` because there is nothing to warn about — the glyph is the neutral
 * middle dot the goal rows use for the same idea.
 */
export function idleHonestyCard(): HonestyCard {
  return {
    basis: 'now',
    glyph: '·',
    title: 'Nothing measured yet',
    plain:
      'Run a shift and this card says whether the run’s averages may be quoted, and on what ' +
      'grounds if they may not.',
    hasMaths: false,
    maths: undefined,
    bg: 'transparent',
    edge: 'var(--edge)',
    warning: false,
    suppressed: false,
    fallingBehind: false,
  };
}

/* -------------------------------------------------------------------------- *
 * L7 — WHY IT DID THAT
 * -------------------------------------------------------------------------- */

export interface DecisionRowView {
  readonly key: string;
  readonly time: string;
  readonly head: string;
  readonly why: string;
  readonly title: string;
  readonly color: string;
  /** The design's *standing by* row, which is a state and not an error. */
  readonly empty: boolean;
}

/**
 * One row, ready to draw.
 *
 * Thin on purpose. `live/decisions.ts` already refuses to narrate anything the recorded term
 * breakdown does not say — no invented seconds on a dimensionless margin, no name for a runner-up
 * the recording does not keep — and the honest thing for a renderer to do with that work is pass
 * it through. What this function *does* add is {@link empty}, so the standing-by row is styled as
 * a state rather than as a decision that happened at 06:00.
 */
export function decisionRowViewOf(row: DecisionRow): DecisionRowView {
  return {
    key: row.key,
    time: row.outcome === 'empty' ? '—' : row.t,
    head: row.head,
    why: row.why,
    title: row.title,
    color: row.color,
    empty: row.outcome === 'empty',
  };
}

/** The log before the first run. `decisionRowsAt` needs a recording; this is the state before one. */
export function idleDecisionRow(): DecisionRowView {
  return {
    key: 'no-run',
    time: '—',
    head: 'standing by',
    why: 'no shift on the board yet — the log fills as the group makes decisions',
    title: 'Every dispatch decision this run made, newest first, with the term that carried it.',
    color: FAINT,
    empty: true,
  };
}

/* -------------------------------------------------------------------------- *
 * The mood gauge's driver rows — docs/10 § 6 / D4
 * -------------------------------------------------------------------------- */

export interface MoodDriverRow {
  readonly label: string;
  /** `MOOD_GLYPH`'s `○ ◑ ●`, so the level survives a greyscale screenshot. */
  readonly glyph: string;
  readonly text: string;
  /** `mood-calm` / `mood-frustrated` / `mood-distressed`, keyed on the level and nothing else. */
  readonly levelClass: string;
}

/**
 * The mood card's driver block — the rows, and the sentence that stands in for the ones withheld.
 *
 * One shape rather than two so that the retraction cannot be dropped by a renderer that draws the
 * rows: it **is** a row. That is issue #109's second half in one design decision — see
 * {@link moodDriverPanelOf}.
 */
interface MoodDriverPanel {
  readonly rows: readonly MoodDriverRow[];
  /** R2, in the component. Drawn in both disclosure modes, finished shift or not. */
  readonly caveat: string;
}

/** The label the retraction row carries, and the class that italicises it. Pinned by the tests. */
const RETRACTION_LABEL = 'the whole shift';
const RETRACTION_CLASS = 'mood-provisional';

/**
 * `render/mood.ts`'s rows, as the rail draws them — **gated on whether the shift is over**.
 *
 * ## The defect this closes (issue #109)
 *
 * `record/recordRun.ts` is *"the only place in the package that runs a simulation"* and it
 * simulates the **whole day up front**; `dev/main.ts` runs one on a cold load with zero clicks. So
 * by the first paint there is a finished recording, the playhead is at the start, and four of the
 * five drivers — every one whose `MoodDriver.basis` is `'whole-run'` — were reporting the end
 * of the day beside a clock reading the beginning of it. The rail's gates are all
 * `recording === undefined`, which boot's own run makes false before anything is drawn, so the
 * card's only remaining nod to R6 was `provisional` italics.
 *
 * The rule is not invented here. `dev/reportPanel.ts`'s `runProgressOf`/`watchingReportView` (§ D223,
 * issue #16) already refuse a whole-day sheet at a part-day playhead, in the sheet's own words, and
 * `reportPanel.test.ts` pins it by asserting the watching view's figures are empty *and* that the
 * whole-day `carried` appears in none of its strings. This is that rule on the rail, and the
 * refusal is worded in the same phrase — *two answers to one question*.
 *
 * ## Why `over` is a parameter and not recomputed
 *
 * `drawDrivers` passes {@link shiftIsOver}, which is the rail's one home for the decision and the
 * same call `basisAt` makes for the mood and honesty cards; a panel that asked the question itself
 * would be the second copy that docstring warns about. {@link moodDriverRowsOf} feeds
 * `!mood.provisional` instead, because it is called from a context holding a mood and no clock —
 * and `leftRail.test.ts` pins the two answers identical at every sampled playhead on a real
 * recording, so the honesty sweep enumerates exactly the rows the screen draws rather than a set
 * that merely resembles them.
 *
 * Every driver still standing is reported, including the calm ones — that is the gauge's own rule
 * and its docstring says why: *a gauge that lists only what went wrong cannot be told apart from a
 * gauge that looked at only one thing.* Withholding is by `basis`, which is a fact about where a
 * number came from, and never by level: a card that dropped its bad news mid-run would be this
 * defect wearing the fix's clothes.
 *
 * The class is derived from `driver.level` rather than from `driver.id`, because `index.html`'s own
 * comment forbids a stylesheet rule keyed on an id.
 */
function moodDriverPanelOf(mood: BuildingMood, over: boolean): MoodDriverPanel {
  const drivers = over ? mood.drivers : mood.drivers.filter((driver) => driver.basis === 'now');
  const rows: MoodDriverRow[] = drivers.map((driver) => ({
    label: driver.label,
    glyph: MOOD_GLYPH[driver.level],
    text: driver.text,
    levelClass: `mood-${driver.level}`,
  }));
  /*
   * KB-15, and the reason this is a row rather than a flag or a font style.
   *
   * `mood.test.ts` has asserted since this unit shipped that *"a flag no renderer is obliged to
   * read is not a retraction — the words carry it too"*, pinning it on `mood.headline`. The rail
   * does not draw `mood.headline`; its card headline is `moodOf(bands)`. So the entire retraction
   * on this surface was `.mood-provisional { font-style: italic; }` — a colour-only signal in
   * everything but hue, on the card whose docstring above is a table promising every signal a
   * second channel in text. The words are now the signal and the italics are the second channel,
   * which is the order KB-15 asks for.
   *
   * `'·'` is `shift/goals.ts`'s pending glyph, not a `MOOD_GLYPH`: the withheld readings are not a
   * mood level, and giving them one would put a calm ○ or a distressed ● on a row that has
   * deliberately measured nothing.
   */
  if (!over && mood.retraction !== '') {
    rows.push({
      label: RETRACTION_LABEL,
      glyph: '·',
      text: mood.retraction,
      levelClass: RETRACTION_CLASS,
    });
  }
  return { rows, caveat: mood.caveat };
}

/**
 * The same rows, for a caller that holds a mood and no clock — the honesty sweep, chiefly.
 *
 * `mood.provisional` is `atS < endedAt` computed by `buildingMood` from the very two numbers
 * {@link shiftIsOver} compares, so this is the same gate reached by the other of its two doors, not
 * a looser one. `leftRail.test.ts` asserts the equality rather than arguing it.
 */
export function moodDriverRowsOf(mood: BuildingMood): readonly MoodDriverRow[] {
  return moodDriverPanelOf(mood, !mood.provisional).rows;
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/** How many decision rows the design's panel draws — `:170`'s placeholder count. */
const DECISION_ROWS = 6;

/**
 * Rebuild a container only when what it would draw has changed.
 *
 * **This is a correctness measure, not an optimisation, and it is why every list below is drawn
 * through it.** `dev/main.ts` calls this rail's `render` on every playback frame — it is the one
 * panel that does, because it is the one whose contents move with the playhead — and `fill`
 * replaces a container's children outright. Three things break if that happens sixty times a
 * second:
 *
 * 1. `.decision`'s `riseIn` animation restarts on every rebuild, so the decision log animates
 *    permanently instead of when a decision arrives. The design's animation *is* the signal that
 *    something new happened; running it always destroys the signal.
 * 2. Focus and hover are lost from anything inside, every frame.
 * 3. The accessibility tree churns, which is the exact cost `dom.ts`'s `setText` exists to avoid
 *    and which a `fill` beside it would reintroduce.
 *
 * The signature is a string built from what the rows *say*, so a redraw happens when a figure
 * moves and not when the clock does.
 *
 * Duplicated in `dev/rightRail.ts`. It belongs in `dev/dom.ts`, which this lane may not edit; the
 * handover says so.
 */
/**
 * Build the left rail. Nothing is drawn until {@link Panel.render} is called.
 *
 * `context` is held for the honesty toggle, which is the rail's only control: everything else
 * here is read-only. It writes through {@link MountContext.update} rather than to a closure, so
 * the shell stays the single owner of the state — `mountTypes.ts`'s whole argument.
 */
export function mountLeftRail(elements: LeftRailElements, context: MountContext): Panel {
  const doc = elements.decisionLog.ownerDocument;
  let showMaths = false;

  elements.honesty.toggle.addEventListener('click', () => {
    context.update({ showMaths: !showMaths });
  });

  const surfaces: RailSurfaces = {
    bar: keyedFill(elements.mood.bar),
    legend: keyedFill(elements.mood.legend),
    drivers: keyedFill(elements.mood.drivers),
    stats: keyedFill(elements.mood.stats),
    runFigures: keyedFill(elements.shift.runFigures),
    history: keyedFill(elements.shift.history),
    goals: keyedFill(elements.shift.goals),
    decisions: keyedFill(elements.decisionLog),
  };

  return {
    render(view: ViewAt): void {
      const { recording, state } = view;
      showMaths = state.showMaths;
      const t = view.simTimeS;
      const mode = disclosureOf(state.mode);

      drawMood(doc, elements.mood, surfaces, recording, t, state.mode);
      drawStats(doc, surfaces, recording, t);
      drawShift(doc, elements.shift, surfaces, view);
      drawHonesty(elements.honesty, recording, t, mode, state.showMaths);
      drawDecisions(doc, surfaces, recording, t);
    },
  };
}

/** One keyed writer per container the rail rebuilds. Held for the life of the mount. */
interface RailSurfaces {
  readonly bar: (key: string, build: () => readonly Node[]) => void;
  readonly legend: (key: string, build: () => readonly Node[]) => void;
  readonly drivers: (key: string, build: () => readonly Node[]) => void;
  readonly stats: (key: string, build: () => readonly Node[]) => void;
  readonly runFigures: (key: string, build: () => readonly Node[]) => void;
  readonly history: (key: string, build: () => readonly Node[]) => void;
  readonly goals: (key: string, build: () => readonly Node[]) => void;
  readonly decisions: (key: string, build: () => readonly Node[]) => void;
}

/* ---- L1 / L2 ---- */

function drawMood(
  doc: Document,
  ui: MoodElements,
  surfaces: RailSurfaces,
  recording: VizRecording | undefined,
  t: SimTime,
  viewMode: ViewMode,
): void {
  const view =
    recording === undefined
      ? idleMoodView()
      : (() => {
          const bands = waitBandsAt(recording, t, basisAt(recording, t));
          return moodViewOf(bands, moodOf(bands));
        })();

  setText(ui.face, view.face);
  setStyle(ui.face, 'background', view.faceBg);
  setStyle(ui.face, 'border-color', view.faceEdge);
  setText(ui.headline, view.headline);
  setText(ui.sub, view.sub);
  ui.bar.setAttribute('aria-label', view.barLabel);

  surfaces.bar(view.segments.map((segment) => String(segment.widthPct)).join('|'), () =>
    view.segments.map((segment) =>
      el(doc, 'div', {
        style: { width: `${String(segment.widthPct)}%`, background: segment.color },
      }),
    ),
  );
  surfaces.legend(view.legend.map((entry) => String(entry.count)).join('|'), () =>
    view.legend.map((entry) =>
      el(doc, 'div', {
        style: { color: entry.color },
        children: [
          el(doc, 'span', { text: entry.label }),
          el(doc, 'span', { text: String(entry.count) }),
        ],
      }),
    ),
  );

  drawDrivers(doc, surfaces, recording, t, viewMode);
}

/**
 * Whether the playhead has reached the end of the shift — **the decision**, with one home.
 *
 * Exported for the reason `render/runSummary.ts#summaryFigureIds` gives about itself: a probe that
 * recomputed `t >= endedAt` would assert its own arithmetic and say nothing about the rail, so the
 * question *"is this rail about to draw a finished shift?"* is answerable by calling the function
 * the rail itself calls. It is also the only decision on this rail that two surfaces share, and two
 * copies of it is how the mood card and the honesty card would come to disagree about which shift a
 * reader is looking at.
 *
 * `>=` rather than `===` because `simTimeS` is a float the transport advances by a frame's worth at
 * a time; it lands *on* `endedAt` only because `ViewAt.simTimeS` is clamped into the recording, and
 * a comparison that leaned on that clamp would be a comparison leaning on somebody else's rounding.
 *
 * `recording.status` is deliberately **not** consulted. A `timed-out` run is finished too — and it
 * has the more honest terminal frame, because the people it failed are still standing in it — so a
 * rule keyed on `status === 'completed'` would hand the retrospective card to the run that needs it
 * least, which is the inversion this whole change is about.
 */
export function shiftIsOver(recording: VizRecording, t: SimTime): boolean {
  return t >= recording.endedAt;
}

/**
 * Which question the mood card and the honesty card answer at this playhead.
 *
 * The live one while the shift is running, the retrospective one once {@link shiftIsOver}.
 * **The rail is the right place for this and `live/` is not**: `live/` answers whichever question
 * it is asked, and *which question a finished shift deserves* is a presentation call — exactly the
 * split this file's docstring describes, and the reason both `waitBandsAt` and `honestyAt` take the
 * basis rather than sniffing the recording for themselves.
 */
function basisAt(recording: VizRecording, t: SimTime): WaitBandBasis {
  return shiftIsOver(recording, t) ? 'whole-run' : 'now';
}

function drawDrivers(
  doc: Document,
  surfaces: RailSurfaces,
  recording: VizRecording | undefined,
  t: SimTime,
  mode: ViewMode,
): void {
  if (recording === undefined) {
    surfaces.drivers('idle', () => []);
    return;
  }
  // The reader's own mode — issue #71. The two driver sentences that carry vocabulary (the
  // abandonment horizon, and the per-5-minute rates) lead with a plain-language sentence in Casual
  // and are unchanged in Engineer.
  const mood = buildingMood(moodObservationsOf(recording, queueAt(recording, t), t), mode);
  /*
   * Issue #109. `shiftIsOver` — the rail's one home for the decision, and the same call `basisAt`
   * makes two surfaces up — decides whether this card may publish the day. Everything about *what
   * to say* stays in `moodDriverPanelOf`, which is why there is no `if` here: this function reads a
   * clock and hands the answer over.
   *
   * The whole-run gate is `shiftIsOver` and **not** `recording === undefined`, which is the gate
   * every other branch in this file uses and the reason the defect survived review. Boot runs a
   * simulation with zero clicks, so `recording === undefined` is false before the first paint and
   * a gate keyed on it is open for the whole of the run it was meant to guard.
   */
  const panel = moodDriverPanelOf(mood, shiftIsOver(recording, t));
  const rows = panel.rows;
  surfaces.drivers(
    rows.map((driver) => `${driver.levelClass}|${driver.text}`).join('||'),
    () => [
      ...rows.map((driver) =>
        el(doc, 'div', {
          className: 'mood-driver',
          children: [
            el(doc, 'span', { className: 'mood-label', text: driver.label }),
            el(doc, 'span', {
              className: driver.levelClass,
              text: `${driver.glyph} ${driver.text}`,
            }),
          ],
        }),
      ),
      // R2 in the component: what this is not. Shown in both disclosure modes, because a casual
      // reader is the one most likely to read a mood as a verdict on the dispatcher.
      el(doc, 'p', { className: 'mood-caveat', text: panel.caveat }),
    ],
  );
}

/* ---- L3 ---- */

function drawStats(
  doc: Document,
  surfaces: RailSurfaces,
  recording: VizRecording | undefined,
  t: SimTime,
): void {
  const rows =
    recording === undefined ? idleStatRowsOf() : statRowsOf(observationsAt(recording, t));
  surfaces.stats(rows.map((entry) => `${entry.label}=${entry.value}=${entry.tone}`).join('|'), () =>
    rows.map((entry) =>
      el(doc, 'div', {
        className: 'stat-row',
        children: [
          el(doc, 'span', {
            className: 'stat-label helpful',
            text: entry.label,
            title: entry.title,
          }),
          el(doc, 'span', {
            className: 'stat-value',
            text: entry.value,
            style: entry.color === undefined ? {} : { color: entry.color },
          }),
        ],
      }),
    ),
  );
}

/* ---- L4 / L5 ---- */

function drawShift(
  doc: Document,
  ui: ShiftElements,
  surfaces: RailSurfaces,
  view: ViewAt,
): void {
  const { recording, state } = view;
  const week = state.week;

  const streak = streakLineOf(week);
  setText(ui.streakLine, streak.text);
  setStyle(ui.streakLine, 'color', streak.color);

  const figures = runFiguresOf(week);
  surfaces.runFigures(figures.map((entry) => entry.value).join('|'), () =>
    figures.map((entry) =>
      el(doc, 'div', {
        className: 'run-figure',
        children: [
          el(doc, 'div', {
            className: 'run-figure-value',
            text: entry.value,
            style: entry.color === undefined ? {} : { color: entry.color },
          }),
          el(doc, 'div', { className: 'run-figure-label', text: entry.label }),
        ],
      }),
    ),
  );

  const observations = goalObservationsOf(recording, view.simTimeS);
  const bars = historyBarsOf(
    week.history,
    recording === undefined ? undefined : observations.minutePct,
    week.dayIdx,
  );
  surfaces.history(bars.map((bar) => `${bar.short}:${String(bar.heightPct)}`).join('|'), () =>
    bars.map((bar) =>
      el(doc, 'div', {
        className: 'history-day',
        title: bar.title,
        children: [
          el(doc, 'div', {
            className: 'history-bar',
            style: { height: `${String(bar.heightPct)}%`, background: bar.color },
          }),
          el(doc, 'span', { className: 'history-label', text: bar.short }),
        ],
      }),
    ),
  );

  /*
   * Through the calendar — GitHub issue #135's **third** caller, found by neither lane that filed
   * it. The rail names today's event and its note, on screen for the whole shift, and it named the
   * ordinary schedule's: under `moving-week` it read *Weekend goods run* beside cars running a
   * move-in. `shift/calendar.ts#scheduledEventFor` is the one answer to the question and this is
   * one of its four callers.
   */
  const event = scheduledEventFor(state.calendar, week.day, week.dayIdx);
  setText(ui.event, event.name);
  setText(ui.note, event.note);

  const goals = goalRowsOf(readGoals(goalsForDay(week.day), observations), week.history, week.day);
  surfaces.goals(
    goals
      .map((goal) => `${goal.label}=${goal.value}=${goal.was}=${String(goal.barPct)}`)
      .join('|'),
    () =>
      goals.map((goal) =>
        el(doc, 'div', {
          className: 'goal',
          children: [
            el(doc, 'div', {
              className: 'goal-line',
              children: [
                el(doc, 'span', {
                  className: 'goal-glyph',
                  text: goal.glyph,
                  style: { color: goal.color },
                }),
                el(doc, 'span', { className: 'goal-label', text: goal.label }),
                // Last night's figure, dim, before today's — reading order is claim, precedent,
                // verdict. The dash carries no "was": see `goalRowsOf`.
                el(doc, 'span', { className: 'goal-was', text: goal.was }),
                el(doc, 'span', {
                  className: 'goal-got',
                  text: goal.value,
                  style: { color: goal.color },
                }),
              ],
            }),
            el(doc, 'span', {
              className: 'goal-track',
              children: [
                el(doc, 'span', {
                  className: 'goal-fill',
                  style: { width: `${String(goal.barPct)}%`, background: goal.fill },
                }),
              ],
            }),
          ],
        }),
      ),
  );

  setText(ui.best, bestLineFor(observations, week.bestMinutePct));
}

/**
 * The goal inputs at the playhead — the live fold, projected.
 *
 * Before the first run there is nothing to fold, and the zeroes here are not a stand-in for
 * observations: `arrived: 0` is below `WAKE_UP_ARRIVALS`, so every reading comes back `pending`
 * and every row prints the em dash. The gate does the work, exactly as it does on a quiet morning.
 */
function goalObservationsOf(
  recording: VizRecording | undefined,
  t: SimTime,
): GoalObservations {
  if (recording === undefined) {
    return {
      arrived: 0,
      carryPct: 100,
      minutePct: 100,
      peakQueue: 0,
      abandoned: 0,
      worstWaitS: 0,
      worstWaitIsCensored: false,
    };
  }
  return shiftObservationsOf(observationsAt(recording, t));
}

/* ---- L6 ---- */

function drawHonesty(
  ui: HonestyElements,
  recording: VizRecording | undefined,
  t: SimTime,
  mode: DisclosureMode,
  showMaths: boolean,
): void {
  /*
   * The same basis the mood card above it is drawn on, and it has to be the same one: a rail whose
   * face is retrospective and whose honesty card is instantaneous is two panels answering two
   * questions with no way for a reader to tell which is which.
   */
  const card =
    recording === undefined
      ? idleHonestyCard()
      : honestyAt(recording, t, mode, basisAt(recording, t));
  setStyle(ui.card, 'background', card.bg);
  setStyle(ui.card, 'border-color', card.edge);
  setText(ui.glyph, card.glyph);
  setText(ui.title, card.title);
  setText(ui.plain, card.plain);

  const disclosure = mathsDisclosureOf(card, showMaths, mode);
  setHidden(ui.toggle, disclosure.toggleHidden);
  setText(ui.toggle, disclosure.toggleLabel);
  ui.toggle.setAttribute('aria-expanded', disclosure.mathsHidden ? 'false' : 'true');
  setHidden(ui.maths, disclosure.mathsHidden);
  setText(ui.maths, disclosure.maths);
}

/* ---- L7 ---- */

function drawDecisions(
  doc: Document,
  surfaces: RailSurfaces,
  recording: VizRecording | undefined,
  t: SimTime,
): void {
  const rows =
    recording === undefined
      ? [idleDecisionRow()]
      : decisionRowsAt(recording, t, DECISION_ROWS).map(decisionRowViewOf);
  // Keyed on the row keys alone: `DecisionRow.key` is `${at}-${callId}`, so the log is rebuilt
  // exactly when a decision enters or leaves the window — which is when `riseIn` should play.
  surfaces.decisions(rows.map((entry) => entry.key).join('|'), () =>
    rows.map((entry) =>
      el(doc, 'div', {
        className: 'decision',
        title: entry.title,
        children: [
          el(doc, 'div', {
            className: 'decision-head',
            children: [
              el(doc, 'span', { className: 'decision-time', text: entry.time }),
              el(doc, 'span', {
                className: 'decision-title',
                text: entry.head,
                style: { color: entry.color },
              }),
            ],
          }),
          el(doc, 'div', { className: 'decision-why', text: entry.why }),
        ],
      }),
    ),
  );
}
