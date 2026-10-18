/**
 * **The front door, as words** — GAMEPLAY § 6.1, decided here and drawn by `doorScreen.ts`.
 *
 * Pure for `rail.ts`'s reason: every sentence a player meets on this screen is testable without a
 * document and drivable by the honesty sweep.
 *
 * ## § 6.1's order, and what each item is in this build
 *
 * 1. **The date stepper** — `‹` and `›` either side of the day label, plus a seven-chip strip. The
 *    guide's `dayOffset` runs −6…0 and the forward arrow dims at 0; both hold here. What the chips
 *    are *made of* is this build's own week rather than the prototype's authored fixture:
 *    `WeekState.history` is the last seven closed days ({@link HISTORY_DAYS}), each a `DayOutcome`
 *    that carries its weekday, its `minutePct` and — since Everyday slice 8 — the `WatchRecord` of
 *    what was actually run. So a chip names the tower **the day was played on** rather than the
 *    tower standing selected now, which are two different claims on a week that changed building.
 * 2. **The kind pill** — `TODAY'S TOWER` at offset 0, `REPLAY · DOES NOT COUNT` otherwise.
 * 3. **Yesterday's world result** and 4. **the two histograms** — `everyday/world.ts`'s labelled
 *    unavailable band. § 16 rule 15, and in this build it is the normal state rather than an edge
 *    case: there is no server, so there are no verified posts to aggregate.
 * 5. **The lede** — `today.ts`'s, composed from the building's own facts.
 * 6. **Three numbered steps** — the prototype's copy, transcribed.
 * 7. **Today's top five** — the board, which is the same absent world.
 * 8. **The seed line** and § 6's sentence about it.
 *
 * ## The replay refuses, and the refusal is the honest half of *every past day stays playable*
 *
 * § 6.1 says a missed day fills the gap in your week without scoring and a replay leaves the
 * original result on the board — and **this build can do neither**. `everyday/host.ts` runs *today*
 * with the standing config; there is no action anywhere in the tree that re-opens day 3 of a week
 * standing on day 5, because `shift/week.ts` moves a week forward (`nextDay`) and never back.
 *
 * So the stepper is real — it selects, and each chip shows what that day actually did — and the
 * § 3.3 primary for a past day is drawn **inert** with {@link DoorPrimaryView.note} naming the
 * reason. That is § 16 rule 6's shape (*unaffordable is visible, dimmed and inert — never hidden,
 * and never silently clickable; it always says what it is short by*) rather than rule 4's defect
 * (*do not label an affordance for a state you have not built*): the label is § 3.3's own cell and
 * the button does not pretend to be pressable. Drawing no stepper at all was the other option and
 * is worse — a player would learn their week's days are gone rather than that they are read-only.
 */

import { dayWordsFor } from '../mode/glossary.js';
import { HISTORY_DAYS } from '../shift/week.js';
import { dayVerdictOf, WEEK_LENGTH, weekDealOf, weekStripTargetOf } from '../shift/weekStake.js';
import { weekBookingsLineOf, weekUnderWayHarderLineOf, type BookingClock } from '../shift/nextWeek.js';
import { weeksHeldLineOf, type WeekRecord } from '../shift/weekRecord.js';
import type { DayOutcome, WeekState } from '../shift/types.js';
import { weekdayOf } from '../shift/types.js';

import { EM_DASH, percentFigure } from './figures.js';
import { recordOfDay, REPLAY_COPY, replayableDay } from './replay.js';
import type { TodayRecord } from './today.js';
import {
  WORLD_FIGURES_ABSENT,
  WORLD_FIGURES_LABEL,
  WORLD_FIGURES_REASON,
} from './world.js';

/** The furthest back § 6.1's stepper goes. The guide's `dayOffset` runs −6…0 — seven slots. */
export const DAY_OFFSET_MIN = -(HISTORY_DAYS - 1);

/** One chip of the seven-day strip. */
export interface DoorDayChip {
  /** `−6`…`0`, the guide's own `dayOffset`. */
  readonly offset: number;
  /** The week day this slot is, or `undefined` for a slot before the week began. */
  readonly day: number | undefined;
  /** `MON`, `TUE` — the strip's short form. */
  readonly weekday: string;
  /** The tower that day was played on, from its own record — or the em dash. */
  readonly tower: string;
  /** Away inside a minute, that day. The em dash for a day that has not been played. */
  readonly score: string;
  /** *today · clean day*, *today · not closed yet*, *missed*, *clean day · showing*, *not played*. */
  readonly note: string;
  readonly selected: boolean;
}

/**
 * **A day of the week still to come** — GitHub issue #631, wave AQ lane AQ-4. Drawn after today on
 * the strip, empty and inert: it is a slot, not a day anybody can open yet.
 */
export interface DoorUpcomingSlot {
  readonly day: number;
  /** `WED`, as a chip's. */
  readonly weekday: string;
  /** Always the em dash: nothing has been played. */
  readonly score: string;
  /** `to play`, or `to play · not counted` on a day the census does not count. */
  readonly note: string;
}

/** § 6.1's three numbered steps. */
export interface DoorStep {
  readonly n: string;
  readonly head: string;
  readonly body: string;
}

/** A band of world figures that has none — one shape, two screens (`weekView.ts` draws it too). */
export interface WorldBandView {
  readonly label: string;
  readonly reason: string;
  /** What would have been here, named. Never a zero and never an empty chart. */
  readonly absent: readonly string[];
}

/** § 3.3's door primary, as this screen's state resolves it. */
export interface DoorPrimaryView {
  /**
   * `Set up today`, `Set up the replay`, or — once today is closed — `Open the doors on Tuesday`
   * ([§ D1004](../../../../DECISIONS.md)): the row's three variants, never a fourth.
   */
  readonly label: string;
  /** The § 3.3 note, and on a past day the reason the button cannot act. */
  readonly note: string;
  /** True only on a chip from before this week began; a past day inside the week is pressable — § D517. */
  readonly inert: boolean;
  /**
   * Where the press goes: today's brief, a replay's, or tomorrow — `EverydayHost.openTomorrow`,
   * the same press as the report's *Open the doors on …*. § D1004.
   */
  readonly goes: 'today' | 'replay' | 'tomorrow';
  /**
   * Today again, as another attempt — drawn beside the primary only while the primary opens
   * tomorrow, because that is the one state in which the retry is no longer the primary. § D1004.
   */
  readonly again: { readonly label: string; readonly note: string } | undefined;
}

/** The whole screen, as data. */
export interface DoorScreenView {
  /** `TUESDAY · DAY 2`. */
  readonly eyebrow: string;
  readonly title: string;
  /** `TODAY'S TOWER` / `REPLAY · DOES NOT COUNT`. */
  readonly kindPill: string;
  /** Whether the pill is the replay one — the two are inked differently. */
  readonly isReplay: boolean;
  readonly stepper: {
    readonly label: string;
    readonly backEnabled: boolean;
    /**
     * Why the back arrow is dimmed, true of the day it is dimmed on — lane AO-4: the strip now stops
     * at the week's first day, which is not the same reason as the seven-day reach.
     */
    readonly backRefusal: string;
    readonly forwardEnabled: boolean;
  };
  readonly weekHeading: string;
  readonly chips: readonly DoorDayChip[];
  /** The days after today through the week's last, empty — GitHub issue #631. Empty on the last day. */
  readonly upcoming: readonly DoorUpcomingSlot[];
  /**
   * **The week's target on the strip** — `shift/weekStake.ts#weekStripTargetOf`, the numbers the
   * brief's `weekStakeLineOf` states — or `undefined` where the census sets no target. Issue #631.
   */
  readonly stripTarget: string | undefined;
  /** § 6.1's *One tower a day…* line, under the stepper. */
  readonly rule: string;
  /**
   * **What the day's own words mean, drawn under the rule** — the post-AI playability panel's
   * newcomer seat, who met *a press*, *standing order* and *pinned crowd* on this screen with
   * nothing saying what any of them was. Each is `mode/glossary.ts`'s one definition, chosen by
   * `dayWordsFor` from the text this screen actually prints, so a word the door stops printing
   * stops being defined here. Empty when the door prints none of them.
   *
   * **Behind one disclosure, headed {@link wordsHeading}** — wave AO, lane AO-4, the post-AN panel's
   * seat B (lost moment 3): three definition paragraphs stood open under the rule on every visit, so
   * the door read as a glossary before it read as a day. A reader who meets a word and wants it opens
   * the one line that names all three.
   */
  readonly words: readonly string[];
  /**
   * The disclosure's own line, naming the words it defines — *What press, standing order and pinned
   * crowd mean* — from the same `dayWordsFor` pick, so it names exactly the words under it. Empty
   * where {@link words} is.
   */
  readonly wordsHeading: string;
  readonly lede: string;
  readonly world: WorldBandView;
  readonly stepsHeading: string;
  readonly steps: readonly DoorStep[];
  /** Who is driving as things stand, and where it is changed. */
  readonly driver: { readonly heading: string; readonly name: string; readonly note: string };
  readonly seedLine: string;
  /** Why this tower, on a first day nobody has played on a legible one; `undefined` otherwise. */
  readonly firstSessionLine: string | undefined;
  /**
   * **Weeks held on this tower** — `shift/weekRecord.ts#weeksHeldLineOf`, lane AM-D
   * ([§ D1253](../../../../DECISIONS.md)) — or `undefined` before a week on it has closed.
   */
  readonly weeksHeld: string | undefined;
  /**
   * **This week, called harder than the last only where the house's census fell** — wave AN, lane
   * DQ-2, `shift/nextWeek.ts#weekUnderWayHarderLineOf` ([§ D1344](../../../../DECISIONS.md)) — or
   * `undefined` on week 1 and wherever it did not fall.
   */
  readonly weekHarder: string | undefined;
  /**
   * **The cars this week's level books out, the new one marked** — wave AO, lane DS-1,
   * `shift/nextWeek.ts#weekBookingsLineOf` ([§ D1400](../../../../DECISIONS.md)) — or `undefined`
   * for a week dealt no level. It names bookings and says nothing about difficulty.
   */
  readonly weekBookings: string | undefined;
  readonly sameForEveryone: string;
  readonly primary: DoorPrimaryView;
}

/** What {@link doorScreenViewOf} is computed from. */
export interface DoorScreenInput {
  readonly week: WeekState;
  readonly today: TodayRecord;
  /**
   * A fraction of the run as the day's clock reads it, for {@link DoorScreenView.weekBookings}'s
   * times — `shift/nextWeek.ts#BookingClock`, built by `doorScreen.ts` from the run's own start and
   * length (wave AO, lane DS-1). Optional: absent, a booking is named by its car and its day alone.
   */
  readonly bookingClock?: BookingClock | undefined;
  /** The stepper's position, `−6`…`0`. Clamped, so a caller cannot select off the strip. */
  readonly dayOffset: number;
  /** Whether the run standing on the stage has been filed — `host.runState().dayClosed`. */
  readonly dayClosed: boolean;
  /**
   * A building's own name, by id, for a closed chip — `weekView.ts#WeekScreenInput.nameOf`'s field
   * and reason, GitHub issue #599: a closed chip printed the tower's id beside today's chip printing
   * its name.
   */
  readonly nameOf: (buildingId: string) => string | undefined;
  /**
   * The words the door's other cards print — the press-day card's heading, lede and note, which
   * `towerChoice.ts` owns — so {@link DoorScreenView.words} is read off everything on the screen
   * rather than off this view's half of it. Absent reads this view's own text only.
   */
  readonly alsoOnScreen?: readonly string[] | undefined;
  /** The week's tower's record of closed weeks — `EverydayHost.weekRecord()`. Absent draws no run. */
  readonly record?: WeekRecord | undefined;
  /**
   * Whether the attempt on the stage has answered or skipped its pinned call —
   * `EverydayHost.pinnedCallDone`, [§ D1530](../../../../DECISIONS.md). Absent reads as not.
   */
  readonly pinnedCallDone?: boolean | undefined;
  /**
   * **Who drove the banked day**, in the report's title words — `live/interventions.ts#driversLineOf`
   * over the banked record's own log, so *Conventional collective, then Fairness first from 12:25*.
   * GitHub issue #637 item 3: after the close the card still read *DRIVING TODAY Conventional
   * collective* over a day that finished on Fairness first. Absent, or on a day not banked, the card
   * names today's configured driver as before.
   */
  readonly droveLine?: string | undefined;
}

/**
 * § 6.1's three steps, verbatim from the prototype's `doorSteps`
 * (`docs/design/elevator-sim-casual.dc.html`), with one deviation stated.
 *
 * Step 2's *"Six in the morning to seven at night"* is the prototype's fixed 06:00–19:00 day, and
 * this simulator's shift is 15 to 120 minutes from a 06:00 start (`docs/12` § 4.1 records why the
 * fixed ruler was not implemented). A step that named an hour the run does not reach is the defect
 * § D175 corrected on the fire drill's *"14:00"*, so the clause is dropped and the rest of the
 * sentence — which is the part that teaches — is kept whole.
 */
export const DOOR_STEPS: readonly DoorStep[] = Object.freeze([
  Object.freeze({
    n: '1',
    head: 'Pick who drives',
    /*
     * The post-AH panel's H13: *"It is the only thing you choose"*, on a page that lists days a press
     * decides, above a stage that offers two parking presses and a handover on every day. The pick
     * is the choice made before the day, which is what the step is about. `today.ts#TODAY_CHOICE_LINE`
     * carries the same correction on the lede.
     */
    body: 'Ready-made styles, or one you built yourself. You pick before the day starts.',
  }),
  Object.freeze({
    n: '2',
    head: 'Watch the day',
    /*
     * GitHub issue #592, § D991. This read *"A whole working day, at whatever speed you set"*
     * (§ D733), and § D991 made its second clause partly false: on a whole day the stage now
     * crosses the hours between the peaks at `30×` itself, so the speed is not only the player's.
     * The peaks are still played at the speed they set, and a chip press still wins for the rest
     * of the day, so the sentence says both rather than dropping either.
     */
    /*
     * And H13's two halves, in the same step. *"A whole working day"* was false on the two towers
     * with no authored day, both of them on the pinned-press list, whose day is a thirty-minute
     * slice; *"the quiet hours between them faster"* is a whole day's pacing and a slice has none.
     * *"You can speed it up, not steer it"* was false on every day: the stage parks the cars,
     * spreads them and hands the day over while it plays. The step now names neither a length nor a
     * pacing, and says what the controls on the stage do.
     */
    body:
      'The day plays out at a speed you can change. While it plays you can park the cars, spread ' +
      'them out, or hand the day to another dispatcher.',
  }),
  Object.freeze({
    n: '3',
    head: 'Read what happened',
    body:
      'Plain words, then the bench if you want to know whether you were actually better or just ' +
      'lucky.',
  }),
]);

/**
 * § 6's closing sentence — **no longer verbatim, and the deviation is the whole entry**.
 *
 * The handoff's line is *“Everyone plays the same tower, the same crowd, the same day. The only
 * thing that differs is the dispatcher you bring.”* `CLAUDE.md` makes the handoff canonical for
 * what the screen looks like and makes this simulator canonical for what a number means, and this
 * sentence is on the second side of that line: it is a claim about the run, and the run did not
 * support it. `dev/main.ts` opened the session on `crypto.getRandomValues` and six cold loads gave
 * six different towers, so *the same tower, the same crowd* was false in both halves
 * ([§ D729](../../../../DECISIONS.md), [§ D730](../../../../DECISIONS.md)).
 *
 * **One half is now true and the other is not, so the sentence says which.** The crowd is the UTC
 * date's own digits, shared by everyone who plays today and checkable against the number printed
 * directly above this line. The **tower** is not shared and no seed makes it so: `shift/week.ts`
 * is a week over one `contractId`, and only a first session draws its tower from the seed at all.
 *
 * Conditional on `today.crowdIsToday` for `everyday/today.ts#seedLineOf`'s reason — a `?seed=`
 * deep link and a session left open across UTC midnight both reach this screen with a crowd nobody
 * else has, and an unconditional sentence would be the defect surviving inside its own repair.
 *
 * `docs/12` § 4's deviation register is where this belongs as a *design* deviation; it is recorded
 * here as well because a reader who greps the handoff for this sentence lands on this file first.
 *
 * **A third arm, for a pinned crowd** — [§ D1047](../../../../DECISIONS.md). *"This run is on a
 * crowd of its own … so nobody else is playing it"* was false on every pinned day from the day
 * § D973 put them on this screen: everybody who opens a tower's pinned day plays the same crowd, and
 * since § D1047 every newcomer's first day is one. Both of that arm's clauses were wrong there, and
 * so was *the dispatcher is yours to bring*, because the brief holds the tower's standing order
 * until the stage's call is answered (§ D1029) — so the pinned arm says whose crowd it is and leaves
 * the driver to the brief, which states the hold beside the control it holds.
 */
export function sameForEveryoneLine(crowdIsToday: boolean, crowdIsPinned: boolean, crowdIsDerived = false): string {
  if (crowdIsToday) {
    return (
      'Everyone playing today meets the same crowd — the number above is today’s date, and the ' +
      'run is seeded from it. The tower is the one your week is on, and the dispatcher is yours ' +
      'to bring.'
    );
  }
  if (crowdIsPinned) {
    return (
      'This run is on the crowd its day was measured on rather than the day’s, and everyone who ' +
      'opens this tower’s pinned day meets the same one. The tower is the one your week is on.'
    );
  }
  /*
   * **A fourth arm, for a crowd derived from the date** — lane AL-F, [§ D1229](../../../../DECISIONS.md).
   * *Nobody else is playing it* is not known of it: anyone who reaches the same day of the same
   * week today is dealt the same one. What is true is where it came from and that it is new here.
   */
  if (crowdIsDerived) {
    return (
      'You have played today’s own crowd on this tower already, so this day is dealt a new one, ' +
      'made from today’s date, the day of the week and the weeks you have closed here. It is not ' +
      'on today’s board. The tower is the one your week is on, and the dispatcher is yours to bring.'
    );
  }
  return (
    'This run is on a crowd of its own rather than the day’s, so nobody else is playing it. ' +
    'The tower is the one your week is on, and the dispatcher is yours to bring.'
  );
}

/**
 * § 6.1's line under the stepper — the prototype's, with *tower* corrected to *crowd*.
 *
 * It read *“One tower a day, the same for everybody”*. **One tower a day is a property of a
 * product this one does not have**: a week runs one contract and a player advances days inside it,
 * so the tower changes when a contract does and not when the date does. The crowd is what turns
 * over daily ([§ D730](../../../../DECISIONS.md)), and it is what this rule now states.
 *
 * **Since GitHub issue #595 ([§ D973](../../../../DECISIONS.md)) the product picks a crowd a second
 * way**: a pinned day chosen from the door's own list sets the crowd it was measured on. The rule
 * names that exception rather than leaving *the same for everybody* to be false of it.
 *
 * **And since [§ D1047](../../../../DECISIONS.md) a player can be on one without choosing it**: a
 * newcomer's first day is dealt as a pinned day, so *unless you choose one* was false of the first
 * screen every new player reads. *Unless you are on one* is true of both routes.
 *
 * Unconditional, unlike {@link sameForEveryoneLine}, because it states **how the product picks a
 * crowd** rather than a claim about the run standing in front of the reader — and the two lines
 * that do make that claim are on the same screen, four lines below.
 */
const DOOR_RULE =
  'One crowd a day, the same for everybody, unless you are on one of the days a press decides — ' +
  'the tower is the one your week is on. A run counts once; every earlier day stays open as a ' +
  'replay that does not.';

/** The world band, which every world figure on this screen degrades to. */
const WORLD_BAND: WorldBandView = Object.freeze({
  label: WORLD_FIGURES_LABEL,
  reason: WORLD_FIGURES_REASON,
  absent: WORLD_FIGURES_ABSENT,
});

/** `Monday` → `MON`. The strip's short form; the chip's `title` carries the long one. */
function shortWeekday(dayIdx: number): string {
  return weekdayOf(dayIdx).slice(0, 3).toUpperCase();
}

/**
 * The seven chips, oldest first, ending on today.
 *
 * Matched to history **by day number** rather than by position, because `history` holds only closed
 * days: a week where day 2 was never closed has six entries and a positional walk would slide every
 * chip one slot left and label somebody's Wednesday as their Tuesday.
 */
function chipsOf(input: DoorScreenInput): readonly DoorDayChip[] {
  const { week } = input;
  const byDay = new Map<number, DayOutcome>(week.history.map((entry) => [entry.day, entry]));
  const chips: DoorDayChip[] = [];
  for (let offset = earliestOffsetOf(week); offset <= 0; offset += 1) {
    const day = week.day + offset;
    const closed = day < 1 ? undefined : byDay.get(day);
    const isToday = offset === 0;
    const selected = offset === input.dayOffset;
    chips.push({
      offset,
      day: day < 1 ? undefined : day,
      weekday: day < 1 ? EM_DASH : shortWeekday(week.dayIdx + offset),
      // The tower the day was **run on**, from its own record. A day with no record says so with
      // the placeholder rather than borrowing the building standing selected now.
      tower:
        closed?.record == null
          ? isToday
            ? input.today.towerName
            : EM_DASH
          : (input.nameOf(closed.record.buildingId) ?? closed.record.buildingId),
      score: closed === undefined ? EM_DASH : percentFigure(closed.minutePct),
      note: noteFor({ isToday, selected, closed, exists: day >= 1 }),
      selected,
    });
  }
  return Object.freeze(chips);
}

/** The days still to come, after today through the week's last — {@link DoorScreenView.upcoming}. */
function upcomingOf(week: WeekState): readonly DoorUpcomingSlot[] {
  const dealt = weekDealOf(week)?.days;
  const slots: DoorUpcomingSlot[] = [];
  for (let day = week.day + 1; day <= WEEK_LENGTH; day += 1) {
    const counts = dealt?.[day - 1]?.counts;
    slots.push({
      day,
      weekday: shortWeekday(week.dayIdx + (day - week.day)),
      score: EM_DASH,
      note: counts === false ? 'to play · not counted' : 'to play',
    });
  }
  return Object.freeze(slots);
}

/**
 * **The strip starts on the week's first day** — wave AO, lane AO-4, the post-AN panel's seat B (lost
 * moment 3). The strip always drew seven slots, so a Tuesday drew five blank *before this week* tiles
 * to the left of Monday, and a first visit six, each with an em dash for a tower and a score: the
 * first thing the door showed a newcomer was a row of nothing. The prototype's strip is a week of
 * days played and draws no such tile, so the handoff is silent on them. The strip, and the stepper
 * over it, now start on day 1, and go back at most {@link DAY_OFFSET_MIN} days as before
 * ([§ D1386](../../../../DECISIONS.md), which amends § D517 clause 3's before-the-week chip).
 */
export function earliestOffsetOf(week: Pick<WeekState, 'day'>): number {
  return Math.min(0, Math.max(DAY_OFFSET_MIN, 1 - week.day));
}

/** Why the stepper's back arrow is dimmed — {@link DoorScreenView.stepper}'s `backRefusal`. */
export const DOOR_BACK_REFUSAL = Object.freeze({
  reach: 'The week only goes back seven days.',
  firstDay: 'This is the week’s first day, so there is no day before it.',
});

/** `What press, standing order and pinned crowd mean` — the door's words, named in one line. */
export function doorWordsHeadingOf(terms: readonly string[]): string {
  if (terms.length === 0) return '';
  const list =
    terms.length === 1 ? terms[0] : `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1] ?? ''}`;
  return `What ${list ?? ''} ${terms.length === 1 ? 'means' : 'mean'}`;
}

/**
 * **A closed day's verdict, in Your week's card's words** — `clean day`, `missed`, `too quiet to
 * grade`. One map for both screens (`weekView.ts` reads it), so the door's chip and the week's card
 * cannot name one day two ways.
 */
export const DAY_VERDICT_NOTE: Readonly<Record<'cleared' | 'missed' | 'ungraded', string>> = Object.freeze({
  cleared: 'clean day',
  missed: 'missed',
  ungraded: 'too quiet to grade',
});

/**
 * A chip's state. § 16 rule 1 owns the first arm: an unfinished day says so.
 *
 * **A closed day says how it went** — wave AN, lane AN-7, carried from the post-AL panel and found
 * again by the post-AM panel's seat D: a missed Monday read *90 % · played* here while Your week
 * read *missed*. The figure is the share of riders away inside a minute, which a missed day can
 * score high, so the word beside it is the day's verdict, as the week's card gives it.
 */
function noteFor(state: {
  readonly isToday: boolean;
  readonly selected: boolean;
  readonly closed: DayOutcome | undefined;
  readonly exists: boolean;
}): string {
  if (!state.exists) return 'before this week';
  const verdict = state.closed === undefined ? undefined : DAY_VERDICT_NOTE[dayVerdictOf(state.closed)];
  if (state.isToday) return verdict === undefined ? 'today · not closed yet' : `today · ${verdict}`;
  if (verdict === undefined) return 'not played';
  return state.selected ? `${verdict} · showing` : verdict;
}

/**
 * The line under *Run today again* — what the second attempt is, and which attempt the week keeps.
 * Player-facing; swept by the corpus through the door adapter. It said *the one you close last*
 * under [§ D1098](../../../../DECISIONS.md); [§ D1138](../../../../DECISIONS.md) clause 4 made the
 * first closed attempt the one that banks, so it says that, as `shift/week.ts#closeDay` does it.
 */
export const RUN_TODAY_AGAIN_NOTE =
  'Another attempt at the same day, on the same crowd and with no presses carried over. ' +
  'It is practice: your week keeps your first attempt at this day, and this one banks nothing.';

/**
 * § 3.3's primary for the selected day.
 *
 * Today is pressable and goes on to the brief. A past day inside the week is pressable too since
 * § D517 and goes on to the same brief over a replay week; only a chip from before the week began
 * is inert, and its note says why in terms the player can check.
 */
function primaryOf(input: DoorScreenInput, chips: readonly DoorDayChip[]): DoorPrimaryView {
  if (input.dayOffset === 0) {
    /*
     * **A closed today opens tomorrow** — [§ D1004](../../../../DECISIONS.md), the post-AH panel's
     * *no route to tomorrow from the front door*. Two assessors closed Monday, left the report,
     * came back here, and met *Set up today* over a disabled `›`: the only press re-ran Monday, and
     * Tuesday opened only by re-running and re-closing it to reach the report's own button. The
     * week already says today is closed — its history carries the day, which is what the chip
     * reads — so the door says it too, and the press is the report's *Open the doors on …*.
     *
     * Read off the week's history alone — wave AK, [§ D1142](../../../../DECISIONS.md). See
     * {@link todayIsBanked} for why `dayClosed` no longer decides it.
     */
    if (todayIsBanked(input)) {
      const tomorrow = weekdayOf((input.week.dayIdx + 1) % 7);
      return {
        label: `Open the doors on ${tomorrow}`,
        note:
          /* *…and starts it* was false: the press opens the brief, where the day starts (§ D1218, § D1250). */
          `Today is closed and banked. This opens ${tomorrow}'s brief, where you start the day; today ` +
          'stays in your week as it is, and on the strip as a replay that does not count.',
        inert: false,
        goes: 'tomorrow',
        again: {
          label: 'Run today again',
          /*
           * **What the week keeps, said as `shift/week.ts#closeDay` does it** — wave AJ, § D1098
           * and § D1138. This said *the week keeps the better one*, and the week did not: § D1098
           * moved it to *the attempt you close last*, which was the arithmetic then. § D1138
           * clause 4 then moved the arithmetic: the first closed attempt banks and a re-close is
           * practice, because a retake after the report could otherwise bank the answer the report
           * had just printed. The sentence follows the rule again.
           */
          note: RUN_TODAY_AGAIN_NOTE,
        },
      };
    }
    return {
      label: 'Set up today',
      /* GitHub issue #626's leftover (wave AQ, AQ-1): a held driver is not picked today. */
      note: input.today.driverHeld === undefined ? 'Pick who drives, then run it.' : DOOR_PRIMARY_NOTE_HELD,
      inert: false,
      goes: 'today',
      again: undefined,
    };
  }
  /*
   * § 6.1's *every past day stays playable* — GitHub issue #177 item 1, § D517. A chip inside this
   * week hands its day back; a chip from before the week began has no day to hand, and says so.
   * `everyday/replay.ts` is the mechanism and owns both sentences.
   */
  const chip = chips.find((entry) => entry.offset === input.dayOffset);
  if (chip?.day !== undefined && replayableDay(input.week, chip.day)) {
    return {
      label: 'Set up the replay',
      /* The promise is the record's to make — `replay.ts#replayedDayOfRecord`, § D1094. */
      note:
        recordOfDay(input.week, chip.day) === undefined
          ? REPLAY_COPY.doorNoteNoRecord(chip.day)
          : REPLAY_COPY.doorNote(chip.day),
      inert: false,
      goes: 'replay',
      again: undefined,
    };
  }
  return {
    label: 'Set up the replay',
    note: REPLAY_COPY.beforeTheWeek,
    inert: true,
    goes: 'replay',
    again: undefined,
  };
}

/**
 * Whether today is closed — its outcome is in the standing week's history. `everyday/weekView.ts`
 * reads the same question, so *Your week* and this door cannot disagree about the one day both draw
 * ([§ D1004](../../../../DECISIONS.md)).
 *
 * **The week alone, and no longer `dayClosed` beside it** — wave AK, [§ D1142](../../../../DECISIONS.md),
 * the post-AJ panel's seat A, D2. `dayClosed` is *the run on the stage was filed this sitting*, and
 * that run need not belong to this week: seat A closed St Jude's Monday, moved the week to Midtown
 * Office, and read *"Today is closed and banked … Open the doors on Tuesday"* over a Monday the
 * strip beside it called *not closed yet*. A run on a crowd the week does not keep (§ D1141) is
 * filed and never closed into the week either. Every close that does bank writes the day into the
 * history, so the history is the whole answer; § D1004's other direction (a reload, or a second
 * attempt pressed from the brief, leaves the day banked with no filed run standing) is unchanged.
 */
export function todayIsBanked(input: Pick<DoorScreenInput, 'week'>): boolean {
  return input.week.history.some((entry) => entry.day === input.week.day);
}

/** The handle the door's world band folds its paragraph under — GitHub issue #637 item 7. */
export const DOOR_WORLD_FOLD = 'Details';

/** The *Driving today* card's note on a day whose driver the brief lets the player change. */
export const DOOR_DRIVER_NOTE = 'Change it on the brief, which is the next screen.';

/**
 * The note on a day whose driver is held (`today.ts#TodayRecord.driverHeld`) — GitHub issue #626
 * item 2: *Change it on the brief* sat over a brief whose driver cards were held until the stage's call.
 */
export const DOOR_DRIVER_NOTE_HELD =
  'Held until the stage’s call is answered; the brief, which is the next screen, says why.';

/**
 * The same note once the hold is over — wave AR, lane AR-2, [§ D1530](../../../../DECISIONS.md). After
 * the call was answered, or the day closed, the door still said *Held until the stage's call is
 * answered* about a call that was behind the player.
 */
export const DOOR_DRIVER_NOTE_HELD_PAST = 'Held for the stage’s call, which is over.';

/**
 * **Step 1 and the footer on a day whose driver is held** — GitHub issue #626's leftover, wave AQ
 * lane AQ-1. *"Pick who drives"* and *"Pick who drives, then run it"* sat beside *"Held until the
 * stage's call is answered"* on the same screen. On that day the step says who drives instead, and
 * the footer says what the press does.
 */
export const DOOR_STEP_ONE_HELD: DoorStep = Object.freeze({
  n: '1',
  head: 'Who drives',
  body: 'Today the tower’s own standing order drives until the stage’s call is answered. You pick on any other day.',
});

/**
 * {@link DOOR_STEP_ONE_HELD} once the call is behind the player — GitHub issue #637 item 3, wave AS
 * lane AS-3. After the close, step 1 still said the standing order drives *until the stage's call is
 * answered*. Read off the same fact as {@link DOOR_DRIVER_NOTE_HELD_PAST} (§ D1530).
 */
export const DOOR_STEP_ONE_HELD_PAST: DoorStep = Object.freeze({
  n: '1',
  head: 'Who drove',
  body: 'Today the tower’s own standing order drove until the stage’s call. You pick on any other day.',
});

/** The driver card's heading once the day is banked and its drivers are known ({@link DoorScreenInput.droveLine}). */
export const DOOR_DROVE_HEADING = 'DROVE TODAY';

/** The § 3.3 note on today's press while its driver is held. */
export const DOOR_PRIMARY_NOTE_HELD = 'Open the brief, then run it. The tower’s own order drives today.';

/** § 6.1, resolved. Total: every arm answers something a player can read. */
export function doorScreenViewOf(input: DoorScreenInput): DoorScreenView {
  const earliest = earliestOffsetOf(input.week);
  const offset = Math.min(0, Math.max(earliest, Math.trunc(input.dayOffset)));
  const clamped: DoorScreenInput = { ...input, dayOffset: offset };
  const chips = chipsOf(clamped);
  const selected = chips.find((chip) => chip.offset === offset);
  const isReplay = offset !== 0;
  const sameForEveryone = sameForEveryoneLine(
    input.today.crowdIsToday,
    input.today.crowdIsPinned,
    input.today.crowdIsDerived === true,
  );
  const banked = todayIsBanked(input);
  const callBehind = input.pinnedCallDone === true || banked;
  const stepOne = callBehind ? DOOR_STEP_ONE_HELD_PAST : DOOR_STEP_ONE_HELD;
  const steps =
    input.today.driverHeld === undefined
      ? DOOR_STEPS
      : DOOR_STEPS.map((step, index) => (index === 0 ? stepOne : step));
  const drove = banked && input.droveLine !== undefined && input.droveLine !== '' ? input.droveLine : undefined;
  const printed = [
    DOOR_RULE,
    input.today.lede,
    ...steps.map((step) => step.body),
    input.today.seedLine,
    input.today.firstSessionLine ?? '',
    sameForEveryone,
    ...(input.alsoOnScreen ?? []),
  ];
  const dayWords = dayWordsFor(printed);
  return {
    eyebrow: input.today.dayLabel,
    title: input.today.towerName,
    kindPill: isReplay ? 'REPLAY · DOES NOT COUNT' : 'TODAY’S TOWER',
    isReplay,
    stepper: {
      label:
        selected?.day === undefined
          ? 'Before this week'
          : `${weekdayOf(input.week.dayIdx + offset)} · day ${String(selected.day)}`,
      backEnabled: offset > earliest,
      backRefusal: earliest > DAY_OFFSET_MIN ? DOOR_BACK_REFUSAL.firstDay : DOOR_BACK_REFUSAL.reach,
      // § 6.1: *"The forward arrow dims at 0."*
      forwardEnabled: offset < 0,
    },
    weekHeading: 'THIS WEEK',
    chips,
    upcoming: upcomingOf(input.week),
    stripTarget: weekStripTargetOf(input.week),
    rule: DOOR_RULE,
    words: dayWords.map((entry) => entry.plain),
    wordsHeading: doorWordsHeadingOf(dayWords.map((entry) => entry.term)),
    lede: input.today.lede,
    world: WORLD_BAND,
    stepsHeading: 'WHAT THE JOB IS',
    steps,
    driver: {
      heading: drove === undefined ? 'DRIVING TODAY' : DOOR_DROVE_HEADING,
      name: drove ?? input.today.driver,
      note:
        input.today.driverHeld === undefined
          ? DOOR_DRIVER_NOTE
          : callBehind
            ? DOOR_DRIVER_NOTE_HELD_PAST
            : DOOR_DRIVER_NOTE_HELD,
    },
    seedLine: input.today.seedLine,
    firstSessionLine: input.today.firstSessionLine,
    weeksHeld: input.record === undefined ? undefined : weeksHeldLineOf(input.record),
    weekHarder: weekUnderWayHarderLineOf(input.week),
    weekBookings: weekBookingsLineOf(input.week, undefined, input.bookingClock),
    sameForEveryone,
    primary: primaryOf(clamped, chips),
  };
}
