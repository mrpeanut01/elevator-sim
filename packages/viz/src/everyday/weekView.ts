/**
 * **Your week, as words** — GAMEPLAY § 14, decided here and drawn by `weekScreen.ts`.
 *
 * Seven day cards, the percentile line, the style split, and the board's relationship to all
 * three. Pure, so every withheld state is assertable without a document — which matters more on
 * this screen than on any other, because § 12.2's *withheld matrix* is mostly about this one.
 *
 * ## The two independent reasons a figure is missing here, kept apart
 *
 * § 12.2 names four (day not closed · replay · sandbox · `noPost`) and says they combine. Two of
 * them reach this build:
 *
 * - **the day is not closed** — § 16 rule 1: *an unfinished thing shows `—`*, and a closed day is
 *   one the week's history carries, which *Close the day* alone writes. Today's card reads
 *   {@link EM_DASH} and *today · not closed yet* until it is, and the percentile line says there is
 *   nothing to place. This is a fact about **your own run** and it resolves the moment you close
 *   the day — and stays resolved across a reload, which is § D1004;
 * - **the world is unreachable** — § 16 rule 15, `everyday/world.ts`. This is a fact about
 *   **other players** and it does not resolve at all in this build.
 *
 * They are drawn in two different places on purpose. A screen that merged them would tell a player
 * who has not finished their day that the server is down, and a player on a train that they have
 * not finished their day. Both are wrong, and each is wrong in a way that makes the other
 * unfindable.
 *
 * ## Derive, never assert — § 16 rule 5
 *
 * The counts under the strip come from the rendered list: `cleared`, `missed` and `ungraded` are
 * tallied over the same cards a reader can count, and `closed` is their sum. Nothing is stored
 * beside them, so a card that changes changes the count.
 *
 * A day's verdict is `allMet` **and** `week.ts#wasGraded(readings)`, which is not a second opinion
 * about the same question: `DayOutcome.allMet`'s own docstring says it is *not* the whole verdict
 * and names `wasGraded` as the other half, deliberately derived from `readings` rather than stored
 * beside it *"so a restored session cannot carry the two disagreeing"*. `shift/report.ts` composes
 * its `cleared | missed | ungraded` from exactly this pair. Two readers, one rule.
 */

import { wasGraded } from '../shift/week.js';
import {
  DAY_UNMEASURED_SENTENCE,
  dayCountsToward,
  weekDealOf,
  weekSheetOf,
  weekStakeLineOf,
  type HouseReading,
  type WeekSheetView,
} from '../shift/weekStake.js';
import type { DayOutcome, WeekState } from '../shift/types.js';
import { weekRecordLineOf, type WeekRecord } from '../shift/weekRecord.js';
import { weekdayOf } from '../shift/types.js';

import { todayIsBanked, type WorldBandView } from './doorView.js';
import { EM_DASH, percentFigure } from './figures.js';
import {
  percentileLine,
  WORLD_FIGURES_ABSENT,
  WORLD_FIGURES_LABEL,
  WORLD_FIGURES_REASON,
} from './world.js';

/** How each closed day came out. The three `shift/report.ts` files, read the same way. */
export type WeekDayVerdict = 'cleared' | 'missed' | 'ungraded';

/** One of § 14's seven day cards. */
export interface WeekDayCard {
  /** `MON`. */
  readonly weekday: string;
  /** The week day number, or `undefined` for a slot before the week began. */
  readonly day: number | undefined;
  /** The tower that day was played on, from its own record — or the em dash. */
  readonly tower: string;
  /** Away inside a minute. {@link EM_DASH} on any day that has not been closed. */
  readonly score: string;
  /** *clean day* · *missed* · *too quiet to grade* · *today · not closed yet* · *not played*. */
  readonly note: string;
  /** `undefined` on every unclosed day — nothing to colour, because nothing was judged. */
  readonly verdict: WeekDayVerdict | undefined;
  readonly isToday: boolean;
  /**
   * Whether the day counts toward the week's target — [§ D1176](../../../../DECISIONS.md) — or
   * `undefined` where the week census does not speak for the tower (every clean day counts there,
   * so there is nothing to mark). A card that does not count says so in {@link note}, and the
   * sentence saying why is {@link WeekScreenView.notCounted}'s.
   */
  readonly counts: boolean | undefined;
  /**
   * Whether this card opens the sheet that accounts for it — *How it went*.
   *
   * ## Why a card is a door at all, which § 14 does not ask for
   *
   * Because in this build the report screen otherwise has **no entrance**. § 3.3's daily timeline
   * only reaches a *reached* step, so the door and the brief can never click through to it; and
   * the one press whose note promises the sheet — the stage row's `Close the day`, literally
   * *"stops the clock and writes the report"* — writes it without opening it
   * (`everyday/stageScreen.ts`'s `primary` pauses, files, and stays on the stage). So the loop's
   * last two screens were reachable in the design and unreachable in the product, which is the
   * shape of defect this repository has shipped eleven times: everything wired, nothing that can
   * press it.
   *
   * **The reason narrowed on the merge and the conclusion did not**, which is worth one line: this
   * argument was written when the stage handed off to the Engineer surface and drew no § 3.3 bar
   * at all, so *Close the day* had nowhere to live. § 7's stage is a screen now and the bar is
   * drawn under it, so the press exists — it just does not navigate. A card is still the only door
   * to the sheet.
   *
   * A day card is the honest place for the door. § 14 calls a card *a day*, § 6.5 calls the report
   * *an account of a day*, and a card that opens its own account claims nothing the week does not
   * already say. It is `true` only where all three of those hold — today, closed **this sitting**,
   * and a sheet actually standing — because a button that opened an empty sheet would be § 16
   * rule 4's defect (an affordance for a state that is not there).
   *
   * A **past** day is never readable: `ViewerState` keeps one sheet, so yesterday's account is not
   * in this build to open. (Playing one again is the front door's, since § D517 — a different verb.)
   */
  readonly readable: boolean;
}

/** What the strip adds up to, counted off the cards themselves. */
export interface WeekTally {
  readonly closed: number;
  readonly cleared: number;
  readonly missed: number;
  readonly ungraded: number;
  /** `2 cleared · 1 missed · 1 too quiet to grade, over 4 days closed`. */
  readonly line: string;
}

/** § 14's two structural board rules, stated where the board is not. */
export interface BoardRelationView {
  readonly heading: string;
  /** Why the board is not here, in `screens.ts`'s own words. */
  readonly refusal: string;
  /** The rules a board would have to keep, so a reader knows what is being withheld. */
  readonly rules: readonly { readonly title: string; readonly body: string }[];
}

/** The whole screen, as data. */
export interface WeekScreenView {
  readonly eyebrow: string;
  readonly title: string;
  /** `4 days running · best 81%` — the week's own two figures, or their honest absence. */
  readonly streakLine: string;
  readonly cards: readonly WeekDayCard[];
  readonly tally: WeekTally;
  readonly percentile: { readonly heading: string; readonly line: string };
  readonly world: WorldBandView;
  /** § 14's caption, kept verbatim because it is the sentence that makes a split honest. */
  readonly splitCaption: string;
  /** What the strip's one openable card does, or why none is open. Never a bare clickable card. */
  readonly readNote: string;
  readonly board: BoardRelationView;
  /**
   * **The week's target, *k of N***, or `undefined` where the week census does not speak —
   * `shift/weekStake.ts#weekStakeLineOf`, [§ D1176](../../../../DECISIONS.md).
   */
  readonly stake: string | undefined;
  /**
   * The strip's days that do not count, each with the one sentence saying why — the same sentence
   * the brief draws on that day. Empty where every day counts or the census does not speak.
   */
  readonly notCounted: readonly { readonly weekday: string; readonly sentence: string }[];
  /**
   * **The week's sheet at its close**, beside the house — [§ D1177](../../../../DECISIONS.md) —
   * or `undefined` before the last dealt day is filed and wherever the census does not speak.
   */
  readonly sheet: WeekSheetView | undefined;
  /**
   * **The tower's record of closed weeks**, one line — `shift/weekRecord.ts#weekRecordLineOf`, lane
   * AL-F ([§ D1230](../../../../DECISIONS.md)) — or `undefined` before a week on it has closed.
   */
  readonly record: string | undefined;
  /**
   * The screen's one button while the week's sheet stands — {@link WEEK_START_NEXT_LABEL} — and
   * `undefined` otherwise, when the button is the week row's own (§ 3.3).
   */
  readonly primary: string | undefined;
}

/**
 * **The Sunday screen's one button** — swarm DN's Q2.3, lane AL-F ([§ D1227](../../../../DECISIONS.md)).
 * While the week's sheet stands, the week has nothing left to play, and the next press is the next
 * week: the same tower, counted from zero, on crowds this device has not filed.
 */
export const WEEK_START_NEXT_LABEL = 'Start next week';

/** What {@link weekScreenViewOf} is computed from. */
export interface WeekScreenInput {
  readonly week: WeekState;
  /** The building the standing selection points at, for today's card when it has no record yet. */
  readonly towerToday: string;
  /**
   * A building's own name, by id — what a **closed** card names the tower it was run on with.
   * GitHub issue #599.
   *
   * Required rather than optional, `today.ts#TodayInput.calendar`'s own reason: the card used to
   * print `record.buildingId` for every closed day — *THU midtown-office* on the card beside
   * *Midtown Office* on today's — so a closed day and an open one named one tower two ways. The
   * source is the one {@link towerToday} is drawn from (the building document's `name`); the id is
   * the fallback only where this build has no document for it, which is `todayOf`'s own rule.
   */
  readonly nameOf: (buildingId: string) => string | undefined;
  /**
   * `host.runState().dayClosed` — *the run on the stage was filed this sitting*. Since
   * [§ D1004](../../../../DECISIONS.md) it is not the one authority for *today is finished*: an
   * outcome in the week's history is too, and a card reads that. This decides only what is about
   * the sitting — whether today's card can open a sheet.
   */
  readonly dayClosed: boolean;
  /**
   * Whether a filed sheet is standing — `host.lastReport() !== undefined`.
   *
   * Beside {@link dayClosed} rather than derived from it, because the two can disagree: a week
   * restored from a previous sitting carries closed days and no sheet, and `openTomorrow` clears
   * the sheet while the week keeps the day. See {@link WeekDayCard.readable}.
   */
  readonly sheetStanding: boolean;
  /**
   * The house's reading on a counted day that needed a run of its own — the shell's measurement,
   * `dev/main.ts`'s house runs, [§ D1177](../../../../DECISIONS.md). A day whose own run was the
   * house's is read off the day by `shift/weekStake.ts#weekSheetOf` and never asked here. Optional,
   * and absent means *nothing has answered yet*: the sheet then says the house is still being run
   * rather than counting a run that has not happened.
   */
  readonly house?: (day: number) => HouseReading | undefined;
  /**
   * The tower's record of closed weeks — `EverydayHost.weekRecord`, § D1230. Optional: absent, the
   * screen says nothing about a record, which is what a tower with none gets anyway.
   */
  readonly record?: WeekRecord | undefined;
}

/** How many cards § 14 draws. Seven, and `HISTORY_DAYS` is the same seven one layer down. */
export const WEEK_CARDS = 7;

/** How a closed day came out — see the module docstring for why it is this pair and not one flag. */
export function verdictOf(outcome: DayOutcome): WeekDayVerdict {
  if (!wasGraded(outcome.readings)) return 'ungraded';
  return outcome.allMet ? 'cleared' : 'missed';
}

/** The note a card carries. One sentence fragment per state, and no state without one. */
const VERDICT_NOTE: Readonly<Record<WeekDayVerdict, string>> = Object.freeze({
  cleared: 'clean day',
  missed: 'missed',
  ungraded: 'too quiet to grade',
});

/** `Monday` → `MON`. */
function shortWeekday(dayIdx: number): string {
  return weekdayOf(dayIdx).slice(0, 3).toUpperCase();
}

/**
 * The seven cards, oldest first, ending on today.
 *
 * Keyed by day number rather than by position in `history`, for `doorView.ts`'s reason: history
 * holds only closed days, so a positional walk mislabels every card after the first gap.
 */
function cardsOf(input: WeekScreenInput): readonly WeekDayCard[] {
  const { week } = input;
  const byDay = new Map<number, DayOutcome>(week.history.map((entry) => [entry.day, entry]));
  const cards: WeekDayCard[] = [];
  for (let offset = -(WEEK_CARDS - 1); offset <= 0; offset += 1) {
    const day = week.day + offset;
    const isToday = offset === 0;
    const closed = day < 1 ? undefined : byDay.get(day);
    /*
     * § 16 rule 1 — *an unfinished thing shows `—`* — read off the week, which is where a finished
     * day is recorded. [§ D1004](../../../../DECISIONS.md).
     *
     * This used to require `dayClosed` as well for today's card — *the run on the stage has been
     * filed* — on the ground that a week restored from storage can carry today's outcome while the
     * stage holds no filed run, and a card drawn then would publish a figure for a day *this
     * sitting* had not finished. The ground was about the sitting and the card is about the week,
     * and the post-AH panel found where they part: a Thursday the report called *banked* read
     * *today · not closed yet* here after a reload or a second attempt, while the front door's chip,
     * reading the same history, said *today* with its score, and the tally said *No day of this week
     * has been closed yet* after Monday was. An outcome in `history` **is** a closed day — nothing
     * else writes one — so the card shows it, and what stays gated on the sitting is the one thing
     * that is about the sitting: {@link WeekDayCard.readable}, which needs the sheet.
     */
    const show = closed !== undefined;
    const verdict = show && closed !== undefined ? verdictOf(closed) : undefined;
    /* § D1176: whether the day counts toward the week, off the day as it closed or as it is dealt. */
    const dealt = day < 1 ? undefined : weekDealOf(week.contractId)?.days[day - 1];
    const counts =
      dealt === undefined
        ? undefined
        : closed !== undefined
          ? dayCountsToward(week.contractId, closed)
          : dealt.counts;
    const uncounted = counts === false ? ' · not counted' : '';
    cards.push({
      weekday: day < 1 ? EM_DASH : shortWeekday(week.dayIdx + offset),
      day: day < 1 ? undefined : day,
      tower:
        closed?.record == null
          ? isToday
            ? input.towerToday
            : EM_DASH
          : (input.nameOf(closed.record.buildingId) ?? closed.record.buildingId),
      score: show && closed !== undefined ? percentFigure(closed.minutePct) : EM_DASH,
      note:
        day < 1
          ? 'before this week'
          : `${
              isToday && !show
                ? 'today · not closed yet'
                : verdict === undefined
                  ? 'not played'
                  : isToday
                    ? `today · ${VERDICT_NOTE[verdict]}`
                    : VERDICT_NOTE[verdict]
            }${uncounted}`,
      verdict,
      isToday,
      counts,
      /* The sitting's own question, and the one place `dayClosed` still decides — § D1004. */
      readable: isToday && show && input.dayClosed && input.sheetStanding,
    });
  }
  return Object.freeze(cards);
}

/** The tally, counted off the cards. See the module docstring on § 16 rule 5. */
function tallyOf(cards: readonly WeekDayCard[]): WeekTally {
  const count = (verdict: WeekDayVerdict): number =>
    cards.filter((card) => card.verdict === verdict).length;
  const cleared = count('cleared');
  const missed = count('missed');
  const ungraded = count('ungraded');
  const closed = cleared + missed + ungraded;
  const parts = [
    `${String(cleared)} cleared`,
    `${String(missed)} missed`,
    `${String(ungraded)} too quiet to grade`,
  ];
  return {
    closed,
    cleared,
    missed,
    ungraded,
    line:
      closed === 0
        ? 'No day of this week has been closed yet.'
        : `${parts.join(' · ')}, over ${String(closed)} ${closed === 1 ? 'day' : 'days'} closed.`,
  };
}

/**
 * The streak line — the week's own two figures, and `—` for the one that has no value yet.
 *
 * `bestMinutePct` is `0` before the first day closes, and `0` here would be a claim that somebody
 * ran a day and got nobody away inside a minute. So the zero is read as *no day yet* and drawn as
 * the em dash, which is § 13's only placeholder.
 */
function streakLineOf(week: WeekState, closed: number): string {
  const best = closed === 0 ? EM_DASH : percentFigure(week.bestMinutePct);
  const days = week.streak === 1 ? '1 day running' : `${String(week.streak)} days running`;
  return `${days} · best ${best}`;
}

/**
 * Why no board is drawn on Your week.
 *
 * **It read `UNBUILT_REASONS.board` until § 14's screen landed beside this one, and that read is
 * what the merge broke.** The board is a *registered* screen now, so the refusals table has no
 * sentence for that key and the `??` fallback — *"the board screen is not built"* — would have
 * shipped as a false statement about a screen a player can open: § D227's defect arriving through
 * a fallback rather than through a stale literal, which is the arrival this file could not have
 * caught on either branch alone.
 *
 * **It then said the board itself was absent, and that is withdrawn rather than reworded.** It
 * read *"that needs a server to post and rank runs, and this build has none — so there are no rows
 * anywhere"*, restated short from `everyday/boardScreen.ts#DAILY_BOARD_ABSENCE`. Two things were
 * wrong with it by the time GitHub issue #221 landed. The board reads now, so the claim was false
 * on any served build — and worse, it was a claim **this screen cannot check**: the week screen
 * asks no server anything, so it was asserting the outcome of a request it never makes. § D227
 * pins a refusal to a run, and there is no run behind this one to pin it to.
 *
 * So the block stops refusing and starts pointing. What survives is the part this screen does
 * know: § 14's two rules about what a board may be keyed by, which are true whether or not a
 * server answered today, and a line saying where the board is. The heading changed with it — a
 * section called *why it is not here* cannot introduce a signpost.
 */
const DAILY_BOARD_POINTER =
  'Today’s board lives on Boards & ladder, where it is read from the server and every row on it ' +
  'was replayed and re-measured before it appeared. Two rules decide what may share a board at ' +
  'all, and they are the reason a ranking means anything.';

/** § 14's two board rules, quoted close enough that a reader can check them against the guide. */
const BOARD_RULES: readonly { readonly title: string; readonly body: string }[] = Object.freeze([
  Object.freeze({
    title: 'One board a day, and nothing you configure enters its key',
    /*
     * GitHub issue #595, § D973. The first sentence read *"One tower, one crowd, one seed,
     * everybody"* — true of the **board**, which the server keys on one fixture tower and the day's
     * seed (`packages/server/src/leaderboard/boardKey.ts#DAILY_FIXTURE_CONFIG`), and read on this
     * screen as a claim about the player's own week, which since the front door's picker (§ D912)
     * may be on any tower. A day run on another tower goes to the player's own record, not the
     * board, so the sentence now says so rather than letting *everybody* stand for *you*.
     */
    body:
      'The board is one tower and one crowd for everybody, and it need not be the tower your week ' +
      'is on — a day joins it only when it ran that tower on that crowd, and anything else goes to ' +
      'your own record. A board keyed by building and dispatcher and ' +
      'traffic and arrival rate fragments into thousands of one-entry boards where everyone is ' +
      'permanently first and nobody ever meets. Arbitrary configurations are a personal record, ' +
      'not a board.',
  }),
  Object.freeze({
    title: 'Rows must be comparable',
    body:
      'Every row on a daily board ran the identical crowd, and every row on the ladder ran the ' +
      'identical forty cases scored as a mean. Sorting runs that met different passengers is a ' +
      'ranking of luck.',
  }),
]);

/** § 14, resolved. */
export function weekScreenViewOf(input: WeekScreenInput): WeekScreenView {
  const cards = cardsOf(input);
  const tally = tallyOf(cards);
  /* Today closed, by the week or by the sitting — `doorView.ts#todayIsBanked`, so the door agrees. */
  const todayClosed = todayIsBanked(input);
  const sheet = weekSheetOf(input.week, input.house ?? (() => undefined));
  return {
    eyebrow: 'ELEVATOR SIM · EVERYDAY MODE',
    title: 'Your week',
    streakLine: streakLineOf(input.week, tally.closed),
    cards,
    tally,
    percentile: {
      heading: 'WHERE YOU LANDED TODAY',
      line: percentileLine(todayClosed),
    },
    world: {
      label: WORLD_FIGURES_LABEL,
      reason: WORLD_FIGURES_REASON,
      absent: WORLD_FIGURES_ABSENT,
    },
    splitCaption:
      'Share of today’s players, not a ranking. A popular style is not a proven one.',
    readNote: cards.some((card) => card.readable)
      ? 'Today’s card opens the account of it.'
      : todayClosed
        ? 'Today is closed, and the week keeps it. Its account is no longer standing — a reload or a later run takes the sheet.'
        : 'A day opens its own account once it has been closed.',
    board: {
      heading: 'TODAY’S BOARD, AND WHAT MAY SHARE ONE',
      refusal: DAILY_BOARD_POINTER,
      rules: BOARD_RULES,
    },
    stake: weekStakeLineOf(input.week),
    notCounted: notCountedOf(input.week, cards),
    sheet,
    record: input.record === undefined ? undefined : weekRecordLineOf(input.record),
    primary: sheet === undefined ? undefined : WEEK_START_NEXT_LABEL,
  };
}

/**
 * The strip's days that do not count, with the sentence saying why — § D1176. The sentence is the
 * dealt day's, or the one for a day that closed under some other wrinkle than it is dealt.
 */
function notCountedOf(
  week: WeekState,
  cards: readonly WeekDayCard[],
): readonly { readonly weekday: string; readonly sentence: string }[] {
  const deal = weekDealOf(week.contractId);
  if (deal === undefined) return [];
  const byDay = new Map<number, DayOutcome>(week.history.map((entry) => [entry.day, entry]));
  const out: { readonly weekday: string; readonly sentence: string }[] = [];
  for (const card of cards) {
    if (card.counts !== false || card.day === undefined) continue;
    const dealt = deal.days[card.day - 1];
    if (dealt === undefined) continue;
    const closed = byDay.get(card.day);
    out.push({
      weekday: card.weekday,
      sentence:
        closed === undefined || closed.eventId === dealt.eventId
          ? dealt.sentence
          : DAY_UNMEASURED_SENTENCE,
    });
  }
  return Object.freeze(out);
}
