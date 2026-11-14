/**
 * **The rush card on the setup screen, as pure decisions** — [§ D1636](../../../../DECISIONS.md).
 * Drawn by `everyday/rushScreen.ts`; `shift/rushPlay.ts` holds the cards and `core` the arithmetic.
 *
 * A card is a wave model and a roll. The screen offers the day's card first, the same for everybody
 * on that day, and lets the player take another model or another morning. Nothing here draws a
 * random number: today's card is the day's number, and *another morning* is the next roll.
 *
 * The screen says a round has breakdowns and never when: {@link rushCardLinesOf} reads whether the
 * card has any on this tower and gives no count and no time, because the surprise is the point.
 */

import { RUSH_MAX_ROLL, rushCardIsClassic, type RushCard } from '@elevator-sim/core/browser';

import { RUSH_CARDS, type RushPlay } from '../shift/rushPlay.js';

const DAY_MS = 86_400_000;

/** Whole days since 1970 in UTC, the day the server's rush board is keyed on. */
export function rushDayNumberOf(nowMs: number): number {
  return Math.max(0, Math.floor(nowMs / DAY_MS));
}

/**
 * The day's card: the day number as the roll, and the wave models that have breakdowns taken in turn.
 * The classic climb is never the day's card. It stays one press away as a model of its own.
 */
export function rushTodayCardOf(dayNumber: number): RushCard {
  const lively = RUSH_CARDS.waveModels.filter((model) => model.incidents);
  const pool = lively.length === 0 ? RUSH_CARDS.waveModels : lively;
  const model = pool[dayNumber % pool.length];
  return { model: model?.id ?? 'climb', roll: Math.min(dayNumber, RUSH_MAX_ROLL) };
}

/** The same model on the next morning. Wraps at the largest roll a card may carry. */
export function rushNextMorningOf(card: RushCard): RushCard {
  return { model: card.model, roll: card.roll >= RUSH_MAX_ROLL ? 1 : card.roll + 1 };
}

export const RUSH_CARD_COPY = Object.freeze({
  eyebrow: 'THE CROWD',
  today: 'Today’s rush',
  todayTag: 'today’s rush, the same for everyone',
  pickedTag: 'your pick',
  another: 'Another morning',
  morning: (roll: number): string => `morning ${String(roll)}`,
  classicMorning: 'the house morning',
  ends: (people: number, minutes: number): string =>
    `Ends when ${String(people)} people have waited over ${String(minutes)} minutes at once.`,
  breakdowns: 'Lifts break down during the round. Each breakdown raises that line until the lobby recovers.',
  noSpare: 'No bank in this tower has a lift to spare, so none breaks down here.',
  steady: 'No lift breaks down on this one.',
  board: 'Each card has its own board for the day.',
  classicBoard: 'The house runs on the right were measured on this card.',
  houseElsewhere: (name: string): string =>
    `The house has not run ${name}. These rows are its runs on The Climb, the one card that never changes, one per dispatcher.`,
});

/** Whether a play is on the card the house rows were measured on: the climb, on its one morning. */
export function rushPlayIsHouseCard(play: RushPlay): boolean {
  return rushCardIsClassic(play.card);
}

/** One wave model as a button. */
export interface RushModelChoiceView {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly selected: boolean;
}

/** Every wave model, in the file's order, with the card's own marked. */
export function rushModelChoicesOf(card: RushCard): readonly RushModelChoiceView[] {
  return RUSH_CARDS.waveModels.map((model) => ({
    id: model.id,
    name: model.name,
    blurb: model.blurb,
    selected: model.id === card.model,
  }));
}

/** The card as the screen names it. */
export interface RushCardView {
  /** `Surges · morning 20405`. */
  readonly name: string;
  /** Whether this is the day's card or one the player chose. */
  readonly tag: string;
  /** The end rule on this card, then what breakdowns do to it, then where it posts. */
  readonly lines: readonly string[];
}

export function rushCardViewOf(play: RushPlay, today: RushCard): RushCardView {
  const classic = rushPlayIsHouseCard(play);
  const isToday = play.card.model === today.model && play.card.roll === today.roll;
  return {
    name: `${play.model.name} · ${classic ? RUSH_CARD_COPY.classicMorning : RUSH_CARD_COPY.morning(play.card.roll)}`,
    tag: isToday ? RUSH_CARD_COPY.todayTag : RUSH_CARD_COPY.pickedTag,
    lines: rushCardLinesOf(play),
  };
}

/** The end rule on this card, what breakdowns do to it on this tower, and where the card posts. */
export function rushCardLinesOf(play: RushPlay): readonly string[] {
  const ends = RUSH_CARD_COPY.ends(play.line.people, play.line.overS / 60);
  const classic = rushPlayIsHouseCard(play);
  if (!play.model.incidents) return [ends, RUSH_CARD_COPY.steady, classic ? RUSH_CARD_COPY.classicBoard : RUSH_CARD_COPY.board];
  return [ends, play.incidents.length === 0 ? RUSH_CARD_COPY.noSpare : RUSH_CARD_COPY.breakdowns, RUSH_CARD_COPY.board];
}
