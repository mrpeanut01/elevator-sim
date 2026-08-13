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

import { HISTORY_DAYS } from '../shift/week.js';
import type { DayOutcome, WeekState } from '../shift/types.js';
import { weekdayOf } from '../shift/types.js';

import { EM_DASH, percentFigure } from './figures.js';
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
  /** *today*, *today · not closed yet*, *played*, *showing*, *not played*. */
  readonly note: string;
  readonly selected: boolean;
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
  /** `Set up today` or `Set up the replay` — § 3.3's two variants, never a third. */
  readonly label: string;
  /** The § 3.3 note, and on a past day the reason the button cannot act. */
  readonly note: string;
  /** True on every past day. See the module docstring. */
  readonly inert: boolean;
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
    readonly forwardEnabled: boolean;
  };
  readonly weekHeading: string;
  readonly chips: readonly DoorDayChip[];
  /** § 6.1's *One tower a day…* line, under the stepper. */
  readonly rule: string;
  readonly lede: string;
  readonly world: WorldBandView;
  readonly stepsHeading: string;
  readonly steps: readonly DoorStep[];
  /** Who is driving as things stand, and where it is changed. */
  readonly driver: { readonly heading: string; readonly name: string; readonly note: string };
  readonly seedLine: string;
  readonly sameForEveryone: string;
  readonly primary: DoorPrimaryView;
}

/** What {@link doorScreenViewOf} is computed from. */
export interface DoorScreenInput {
  readonly week: WeekState;
  readonly today: TodayRecord;
  /** The stepper's position, `−6`…`0`. Clamped, so a caller cannot select off the strip. */
  readonly dayOffset: number;
  /** Whether the run standing on the stage has been filed — `host.runState().dayClosed`. */
  readonly dayClosed: boolean;
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
    body: 'Ready-made styles, or one you built yourself. It is the only thing you choose.',
  }),
  Object.freeze({
    n: '2',
    head: 'Watch the day',
    body:
      'The whole shift in a couple of minutes. You can speed it up, not steer it — the dispatcher ' +
      'is the decision you already made.',
  }),
  Object.freeze({
    n: '3',
    head: 'Read what happened',
    body:
      'Plain words, then the bench if you want to know whether you were actually better or just ' +
      'lucky.',
  }),
]);

/** § 6's closing sentence, verbatim. */
export const SAME_FOR_EVERYONE =
  'Everyone plays the same tower, the same crowd, the same day. The only thing that differs is ' +
  'the dispatcher you bring.';

/** § 6.1's line under the stepper, verbatim from the prototype. */
const DOOR_RULE =
  'One tower a day, the same for everybody. A run counts once; every earlier day stays open as a ' +
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
  for (let offset = DAY_OFFSET_MIN; offset <= 0; offset += 1) {
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
      tower: closed?.record?.buildingId ?? (isToday ? input.today.towerName : EM_DASH),
      score: closed === undefined ? EM_DASH : percentFigure(closed.minutePct),
      note: noteFor({ isToday, selected, closed: closed !== undefined, exists: day >= 1 }),
      selected,
    });
  }
  return Object.freeze(chips);
}

/** A chip's one-word state. § 16 rule 1 owns the first arm: an unfinished day says so. */
function noteFor(state: {
  readonly isToday: boolean;
  readonly selected: boolean;
  readonly closed: boolean;
  readonly exists: boolean;
}): string {
  if (!state.exists) return 'before this week';
  if (state.isToday) return state.closed ? 'today' : 'today · not closed yet';
  if (!state.closed) return 'not played';
  return state.selected ? 'showing' : 'played';
}

/**
 * § 3.3's primary for the selected day.
 *
 * Today is pressable and goes on to the brief. A past day is not, and the note says why in the
 * terms the player can check: the week is standing somewhere else, and nothing here moves it back.
 */
function primaryOf(input: DoorScreenInput, chips: readonly DoorDayChip[]): DoorPrimaryView {
  if (input.dayOffset === 0) {
    return {
      label: 'Set up today',
      note: input.dayClosed
        ? 'Today is already closed. Running it again is another attempt at the same day, and the ' +
          'week keeps the better one rather than banking both.'
        : 'Pick who drives, then run it.',
      inert: false,
    };
  }
  const chip = chips.find((entry) => entry.offset === input.dayOffset);
  const which = chip?.day === undefined ? 'That day' : `Day ${String(chip.day)}`;
  return {
    label: 'Set up the replay',
    note:
      `${which} cannot be re-opened here. A week moves forward one day at a time and this build ` +
      'has no way to stand it back up on a day it has already left, so the strip above reads your ' +
      'week rather than replaying it.',
    inert: true,
  };
}

/** § 6.1, resolved. Total: every arm answers something a player can read. */
export function doorScreenViewOf(input: DoorScreenInput): DoorScreenView {
  const offset = Math.min(0, Math.max(DAY_OFFSET_MIN, Math.trunc(input.dayOffset)));
  const clamped: DoorScreenInput = { ...input, dayOffset: offset };
  const chips = chipsOf(clamped);
  const selected = chips.find((chip) => chip.offset === offset);
  const isReplay = offset !== 0;
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
      backEnabled: offset > DAY_OFFSET_MIN,
      // § 6.1: *"The forward arrow dims at 0."*
      forwardEnabled: offset < 0,
    },
    weekHeading: 'THE WEEK SO FAR',
    chips,
    rule: DOOR_RULE,
    lede: input.today.lede,
    world: WORLD_BAND,
    stepsHeading: 'WHAT THE JOB IS',
    steps: DOOR_STEPS,
    driver: {
      heading: 'DRIVING TODAY',
      name: input.today.driver,
      note: 'Change it on the brief, which is the next screen.',
    },
    seedLine: input.today.seedLine,
    sameForEveryone: SAME_FOR_EVERYONE,
    primary: primaryOf(clamped, chips),
  };
}
