/**
 * **What GAMEPLAY § 8's three campaign screens say** — the pure half, split from the DOM for the
 * reason the whole of `everyday/` is split: the words are drivable without a document, and the
 * honesty sweep drives them.
 *
 * ## Three screens, one record
 *
 * § 16 rule 14 — *"One day record narrates everything"* — is the constraint this module exists to
 * satisfy. {@link towersView}, {@link buildingView} and {@link contractView} take **the same**
 * {@link CampaignInput} and derive everything from it through `campaign/economy.ts`. None of them
 * counts a cleared day, sums a purse or decides whether a tier is affordable: each asks the
 * economy, so two screens disagreeing about the same figure is not expressible. § 16 rule 5's
 * worked example (*"`cleared = day − 1 − missed`"*) lives in one function, and every `N of M`
 * counter below derives both halves from the same expression (§ 8.7).
 *
 * ## The copy is the prototype's
 *
 * Every authored sentence here is transcribed from `docs/design/elevator-sim-casual.dc.html`'s
 * `isTowers`, `isBuilding` and `isContract` blocks — the handoff wins every disagreement about what
 * the screen says. Where the prototype quotes a **number** it does not: the handoff is a prototype
 * with its own toy simulator, so a stat line comes from the building file (`docs/12` § 4.4, and
 * `shift/contracts.ts#statLineOf` is where it is generated) and every unit, day and percentage
 * comes from `campaign/economy.ts`.
 *
 * ## What is refused, and said
 *
 * Two things this build cannot produce are drawn as refusals rather than omitted:
 *
 * - **The trip budget's *was* figure.** § 7 says the four *was* figures are *"the same four
 *   measurements from this building's previous day"*. Three of § 8.6's four tests read an
 *   observation `shift/types.ts#GoalObservations` carries — away inside a minute, the longest
 *   anybody stood, the deepest landing — so those three are read through `shift/goals.ts`'s own
 *   `readGoal` and `wasDisplayOf` and are the run's own figures. **Loaded car departures are not on
 *   that record**, so the fourth test grades nothing and its *was* is `—` with the reason beside
 *   it. A stand-in there would be a figure with no source, which is the defect
 *   `shift/goals.ts#PENDING_DISPLAY` exists to avoid one layer down.
 * - **Offers on the table (§ 8.8).** Named in `campaign/career.ts#CAMPAIGN_ABSENCES`' neighbour
 *   {@link TOWERS_COPY.offersRefusal} rather than drawn empty: an offer is a contract on a building
 *   whose complexity § 8.5 publishes and whose acceptance switches a week, and neither the
 *   complexity table nor `shift/week.ts#switchWeek` is reached from these three screens yet.
 *
 * ## No engine identifier reaches any string here
 *
 * § 16 rule 11. A dispatcher is named by its profile's `name`, a building by its file's `name`, a
 * shop tier by the tier's own words. The only identifiers in this module are the keys of the frozen
 * copy objects, which nothing renders.
 */

import { readGoal, wasDisplayOf, PENDING_DISPLAY } from '../shift/goals.js';
import type { DayOutcome, GoalObservations, GoalReading, ShiftGoal } from '../shift/types.js';
import { wasGraded } from '../shift/week.js';
import {
  CALENDAR_SPAN,
  CONTRACT_DAYS,
  COMPLEXITY_MAX,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  FRESH_ODDS_PCT,
  SHOP,
  SLOTS,
  type CalendarCell,
  type Difficulty,
  type DifficultyId,
  type ShopCategory,
  type ShopTier,
  type ShopTierState,
  atRiskTowers,
  calendarColumns,
  calendarFrom,
  calendarRow,
  carriedIn,
  clearedDays,
  committedUnits,
  complexityOf,
  dayIndexOf,
  earnedSoFar,
  failureOddsPct,
  fittedLevel,
  bookedLevel,
  legalStarts,
  nextSlot,
  oddsAfterWorksPct,
  occupiedDayIndices,
  perfectMonthUnits,
  purseOf,
  rateOnDay,
  renewalOffer,
  serviceDaysLeft,
  shopTierState,
  shopTotalUnits,
  slotsOpen,
  standingOf,
  wearHeadOf,
  wearOf,
  worksDayLine,
} from '../campaign/economy.js';
import {
  BUILD_IDS,
  BUILD_LABELS,
  careerIsOver,
  type BuildId,
  type CampaignCareer,
  type CampaignTower,
  type NeedOption,
  type TowerNeed,
  needOf,
  nextLineOf,
  openTowerOf,
} from '../campaign/career.js';

/* -------------------------------------------------------------------------- *
 * What the screens are given
 * -------------------------------------------------------------------------- */

/** A building, as a screen needs to name it. Both fields are the file's, never authored here. */
export interface BuildingFacts {
  readonly name: string;
  /** `shift/contracts.ts#statLineOf`'s line, or `undefined` when the building did not resolve. */
  readonly spec: string | undefined;
}

/** One dispatcher on offer, for the standing-order selects. */
export interface DispatcherChoice {
  readonly id: string;
  readonly name: string;
  /** The style's one-line trade, printed under the picker (§ 8.2). `undefined` where none exists. */
  readonly note: string | undefined;
  readonly saved: boolean;
}

/**
 * Everything the three screens read — and, deliberately, one object.
 *
 * The buildings map is passed in rather than looked up here because resolving a building is
 * `dev/data.ts`'s job and this module holds no loader. The spec line still has one owner —
 * `shift/contracts.ts#statLineOf`, reached through `everyday/host.ts#buildingSpecLine`, which is
 * where the elevator specs a resolve needs actually live.
 */
export interface CampaignInput {
  readonly career: CampaignCareer;
  readonly buildings: ReadonlyMap<string, BuildingFacts>;
  readonly dispatchers: readonly DispatcherChoice[];
  /** Today's readings at the playhead, for the four tests. Empty before any run. */
  readonly observations: GoalObservations | undefined;
  /** The week's closed days, for § 7's *was* column. */
  readonly history: readonly DayOutcome[];
}

/** § 16 rule 1's mark for anything unfinished. Shared, so the three screens use one character. */
export const UNFINISHED = PENDING_DISPLAY;

/** A building the campaign holds but this build could not resolve — named, never blanked. */
const UNKNOWN_BUILDING: BuildingFacts = Object.freeze({ name: 'a building this build does not ship', spec: undefined });

function factsFor(input: CampaignInput, tower: CampaignTower): BuildingFacts {
  return input.buildings.get(tower.buildingId) ?? UNKNOWN_BUILDING;
}

/** `4 u` — § 2's vocabulary, which writes a unit as `4 u` and never as a coin or a credit. */
export function units(value: number): string {
  return `${String(value)} u`;
}

/* -------------------------------------------------------------------------- *
 * The four daily tests — § 7 and § 8.6
 * -------------------------------------------------------------------------- */

/**
 * **All four** of § 8.6's tests, as `ShiftGoal`s.
 *
 * Expressed as `ShiftGoal`s rather than as a private shape so that `shift/goals.ts#readGoal` grades
 * them and `#wasDisplayOf` supplies § 7's *was* — one grading rule for the daily loop and the
 * campaign, rather than a second opinion here about what *met* means. The bars are the picked
 * difficulty's, so changing the difficulty moves the row rather than the copy.
 *
 * ## It used to be three, and the fourth is the whole of GitHub issue #169's item 2
 *
 * The trip budget shipped as a hand-built row carrying a refusal — *"not measured — this run records
 * how many people were carried and how long they stood, and not how many loaded departures the
 * machines made"* — because `GoalObservations` had no field it could read. It has one now
 * (`ENGINE_CONTRACT.md` § 5's `trips`, folded by `core` and cut at the playhead by
 * `live/observations.ts`), so the refusal is **false** and is deleted rather than reworded: § D227
 * binds both ways, and a control that writes something may not claim it writes nothing.
 *
 * The row is no longer special in any way. It is the fourth entry of this list, it grades through
 * the same `readGoal`, and on a recording that carries no travel record it prints the same em dash
 * the other three print below the wake-up gate — which is the only shape in which the row can still
 * decline to answer, and it is a state rather than a sentence.
 */
export function campaignTestGoals(difficulty: Difficulty): readonly ShiftGoal[] {
  return Object.freeze([
    Object.freeze({
      id: 'away',
      label: `${String(difficulty.tests.away)} in every hundred away inside a minute`,
      unit: '%' as const,
      bar: difficulty.tests.away,
      compare: 'at-least' as const,
      reads: 'minutePct' as const,
    }),
    Object.freeze({
      id: 'worst',
      label: `Nobody waits longer than ${String(difficulty.tests.worstS)} seconds`,
      unit: ' s' as const,
      bar: difficulty.tests.worstS,
      compare: 'at-most' as const,
      reads: 'worstWaitS' as const,
    }),
    Object.freeze({
      id: 'queue',
      label: `The lobby queue never passes ${String(difficulty.tests.queue)}`,
      unit: '' as const,
      bar: difficulty.tests.queue,
      compare: 'at-most' as const,
      reads: 'peakQueue' as const,
    }),
    Object.freeze({
      id: 'trips',
      label: `No more than ${String(difficulty.tests.trips)} trips on the machines`,
      unit: '' as const,
      bar: difficulty.tests.trips,
      compare: 'at-most' as const,
      reads: 'loadedDepartures' as const,
    }),
  ]);
}

/**
 * **Why the build select changes no day** — GitHub issue #313, drawn under the control itself.
 *
 * The two halves of the standing order are not the same kind of thing, and until this sentence the
 * screen presented them as though they were: the dispatcher select decides who drives and reaches
 * the run, and the build select records a shape and reaches nothing.
 * `campaign/career.ts#CampaignTower.buildId` holds the argument and the measurement; this is what a
 * player reads. It names where the fabric *is* decided rather than only saying what this control
 * does not do, because a refusal that leaves a reader with nowhere to go reads as a broken screen.
 *
 * Per-control and not in `CAMPAIGN_ABSENCES`, which is #207's placement rule: a register at the top
 * of a screen is where a reader learns what the mode cannot do, and a control's own limits belong on
 * the control.
 */
export const BUILD_REFUSAL =
  'kept for your own records — the day is built from what this building has actually had fitted, so picking a shape here changes nothing about how the lifts run. Buying the shape on the contract sheet is what changes that.';

/** § 8.6's tension sentence for each test — the prototype's own, in its order. */
export const TEST_TENSIONS: Readonly<Record<string, string>> = Object.freeze({
  away: 'Rewards sending a car the moment anyone presses. Fuller cars and fewer trips both work against it.',
  worst:
    'This is the one that fails when you optimise the average. One forgotten landing breaks it on an otherwise good day.',
  queue:
    'Wants a car parked downstairs, which is exactly the car the upper floors were waiting for.',
  trips: 'A wear budget, not a score. It punishes running half-empty cars up and down to look responsive.',
});

/** One test row. `reading` is `undefined` before any run today. */
export interface CampaignTestRow {
  readonly id: string;
  readonly label: string;
  /** The bar, as the row prints it — `75%`, `180 s`, `25`, `520`. */
  readonly target: string;
  /** § 7's *was* — the previous day's own figure, or `—`. */
  readonly was: string;
  readonly tension: string;
  readonly reading: GoalReading | undefined;
}

/**
 * The four rows, all four graded from the run.
 *
 * The `was` column is `shift/goals.ts#wasDisplayOf` over the week's history, which matches the
 * previous day by what a goal *reads* rather than by its id — so a campaign test and a daily goal
 * reading the same observation share one previous figure, which is what § 7 means by *"this
 * building's previous day"*.
 *
 * **There is no longer a `refusal` on this shape**, and the deletion is the point rather than a
 * tidy-up. The fourth row used to be built by hand here, outside the loop, carrying a sentence
 * saying nothing measured it; the field existed for that one row and for nothing else. A row that
 * cannot be graded now says so the way the other three do — a `pending` reading and an em dash —
 * which is a *state* the surrounding machinery already understands rather than prose only this
 * module could write. See {@link campaignTestGoals} for what made the sentence false.
 */
export function campaignTestRows(
  difficulty: Difficulty,
  tower: CampaignTower,
  observations: GoalObservations | undefined,
  history: readonly DayOutcome[],
): readonly CampaignTestRow[] {
  return campaignTestGoals(difficulty).map((goal): CampaignTestRow => {
    const suffix = goal.unit === '%' ? '%' : goal.unit;
    return {
      id: goal.id,
      label: goal.label,
      target: `${String(goal.bar)}${suffix}`,
      was: wasDisplayOf(history, tower.day, goal),
      tension: TEST_TENSIONS[goal.id] ?? '',
      reading: observations === undefined ? undefined : readGoal(goal, observations),
    };
  });
}

/**
 * § 6.4 step 4 — *"In a campaign run, evaluate the four tests and mark the day cleared or
 * missed"*, over the rows the screens are drawing.
 *
 * ## Over the rows, rather than over a second set of goals
 *
 * {@link campaignTestRows} is what the desk and the contract sheet print, so the verdict is a fold
 * over exactly the readings a player watched. Building a second `campaignTestGoals` list here and
 * grading that would be two statements of *what day N asks* — the drift this repository has three
 * of on the record — and it would silently stop following the difficulty the moment either copy
 * moved.
 *
 * ## All four decide it now, and the fold did not have to change to say so
 *
 * § 8.6 says a day is cleared only if **all four** hold. The trip budget is the fourth and used to
 * be the one nothing measured, so its row carried no `reading` and fell out of this fold — a row
 * nothing measured cannot be counted as held, and counting it as failed would have refused every
 * day the campaign ever ran. It is measured now (GitHub issue #169, `shift/types.ts`'s
 * `GoalObservations.loadedDepartures`), so it arrives with a reading like the other three and this
 * function folds four.
 *
 * **Not one line here moved for that**, which is what the shape was chosen for: the fold is over
 * whatever rows carry readings, so a fourth reading joins by existing. The same arm still covers the
 * case where a run's trip count is genuinely unavailable — the reading is then `pending`, `wasGraded`
 * refuses, and the day is `ungraded` rather than quietly decided by three tests out of four.
 *
 * ## Why `ungraded` is a third answer here and only two marks reach the record
 *
 * `wasGraded` is `shift/week.ts`'s predicate rather than a second copy: a reading is `pending`
 * below the wake-up gate and on a censored worst wait, and *unjudged is not passed* — but § D234's
 * other half is that it did not **cost** anything either. `CampaignDayVerdict` has no value for
 * that, so this function has one and the caller files nothing when it comes back. That keeps the
 * refusal at the seam that can act on it instead of turning an unread morning into a missed day.
 *
 * Non-test caller: `everyday/host.ts#createEverydayHost`'s `closeDay`, which is the only press
 * that files a campaign day.
 */
export function campaignDayVerdict(
  rows: readonly CampaignTestRow[],
): 'cleared' | 'missed' | 'ungraded' {
  const readings = rows.flatMap((row) => (row.reading === undefined ? [] : [row.reading]));
  if (!wasGraded(readings)) return 'ungraded';
  return readings.every((entry) => entry.state === 'met') ? 'cleared' : 'missed';
}

/** `3 of 4 held yesterday`, both halves derived from the rows beside it. */
export function testsHeldLine(rows: readonly CampaignTestRow[]): string {
  const graded = rows.filter((row) => row.reading !== undefined);
  if (graded.length === 0) return 'nothing run yet today';
  const held = graded.filter((row) => row.reading?.state === 'met').length;
  return `${String(held)} of ${String(graded.length)} holding`;
}

/* -------------------------------------------------------------------------- *
 * The triage screen — § 8.1
 * -------------------------------------------------------------------------- */

/** The authored chrome of the triage screen, one frozen object so the sweep renders every line. */
export const TOWERS_COPY = Object.freeze({
  title: 'Campaign',
  lede:
    'You are the supervisor, not the operator. Each building runs on the standing order you gave it ' +
    'and maintenance gets on with the rest — you hear from them when a lift fails, a crowd is booked, ' +
    'or a tenant moves in. Open the ones asking for a decision; leave the rest alone.',
  standingHeading: 'STANDING',
  calendarHeading: 'YOUR SCHEDULE, ROLLING',
  tableHeadings: Object.freeze(['BUILDING', 'MONTH', 'STANDING ORDER', 'BUILD', 'WANTS YOU FOR']),
  quietStatus: 'Nothing — it is running itself',
  quietCta: 'Look in',
  openCta: 'Open',
  renewCta: 'Renew',
  offersHeading: 'ON THE TABLE',
  offersRefusal:
    'no offers here yet — a building is offered on a complexity and a fee, and taking one moves a week ' +
    'between assignments; neither of those reaches this screen in this build',
  incidentsHeading: 'WHAT HAS HAPPENED LATELY',
  incidentsSub: 'none of it was your doing',
  incidentsRefusal:
    'nothing to report — this build draws no feed, because every entry in one would be an event it did not simulate',
  /**
   * § 8.11's footnote, **reworded from the design file's own sentence and stated as a frequency**.
   *
   * The prototype writes *"the odds are not flat … likelier to hand you one"*. R10 forbids a
   * probability word in a player-facing string outright (`campaign/words.ts#PROBABILITY_WORDS`,
   * and `honesty/derive.test.ts` sweeps every literal in the package for one), and the remedy the
   * sibling refusal names is *say a frequency over runs*. So the figure § 8.3 computes is said as
   * a share of days throughout these three screens — the number is unchanged and the word is not
   * a feeling. This is the one place the handoff's copy loses, and it loses to a project rule
   * rather than to a preference.
   */
  oddsFootnote:
    'Failures come from the building, not from your performance — but the rate is not flat: every ' +
    'trip since the last service window raises how often one falls, so a tower you have run hard hands ' +
    'you more of them. A tower you have never mismanaged can still hand you a bad week — which is ' +
    'why a spare slot is worth more than a spare unit.',
  /*
   * **`absencesHeading` left this copy table on the merge that closed GitHub issue #207.**
   *
   * It read `WHAT THIS BUILD DOES NOT DO`, and it headed `CAMPAIGN_ABSENCES` on the triage screen.
   * The register is drawn on the build-information panel now (`everyday/buildNotes.ts`), which
   * writes its own section heading, so a second heading here would be a string with no renderer —
   * the shape the dead-code audit exists to find. The array itself is unchanged.
   */
} as const);

/** § 8.6's legend, one entry per mark the grid can draw. */
export const CALENDAR_LEGEND: readonly { readonly glyph: string; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ glyph: '✓', label: 'cleared' }),
    Object.freeze({ glyph: '×', label: 'missed' }),
    Object.freeze({ glyph: '!', label: 'decision due' }),
    Object.freeze({ glyph: '⚒', label: 'works' }),
    Object.freeze({ glyph: '⚑', label: 'crowd booked' }),
    Object.freeze({ glyph: '▢', label: 'today' }),
    Object.freeze({ glyph: '', label: 'blank = not yours yet, or the contract has finished' }),
  ]);

/** The glyph for a mark. One table, so the grid and the legend cannot drift. */
export const CALENDAR_GLYPHS: Readonly<Record<CalendarCell['mark'], string>> = Object.freeze({
  blank: '',
  today: '▢',
  due: '!',
  works: '⚒',
  flagged: '⚑',
  cleared: '✓',
  missed: '×',
  ahead: '',
});

export interface SlotCardView {
  readonly heading: string;
  /** `in hand` · `open` · `14 needed`. */
  readonly tag: string;
  readonly note: string;
  readonly inHand: boolean;
}

export interface CareerStatView {
  readonly value: string;
  readonly label: string;
  readonly note: string;
}

export interface CalendarRowView {
  readonly towerId: string;
  readonly name: string;
  readonly cells: readonly {
    readonly glyph: string;
    readonly mark: CalendarCell['mark'];
    /** The cell's tooltip — the building, its own contract day, and anything on it. */
    readonly tip: string;
  }[];
}

export interface CalendarView {
  readonly heading: string;
  readonly note: string;
  /** The career days across the top. **The cells are emitted from this same array** (§ 8.7). */
  readonly columns: readonly number[];
  readonly rows: readonly CalendarRowView[];
  readonly legend: typeof CALENDAR_LEGEND;
}

export interface StandingOrderView {
  readonly dispatcherId: string;
  readonly dispatchers: readonly DispatcherChoice[];
  readonly buildId: BuildId;
  readonly builds: readonly { readonly id: BuildId; readonly label: string }[];
  /** The picked style's one-line trade, or the honest fallback. */
  readonly note: string;
  /** {@link BUILD_REFUSAL} — why the build select changes no run. Always present. */
  readonly buildNote: string;
}

export interface TowerRowView {
  readonly towerId: string;
  readonly name: string;
  readonly spec: string;
  readonly quirk: string;
  /** § 8.1's *complexity and fee* — `complexity 1 of 5 · 3 u a day`, or the honest half of it. */
  readonly terms: string;
  /** `day 4`. */
  readonly day: string;
  /** `3 cleared · 0 missed` — both halves derived. */
  readonly record: string;
  /** `1 month held · 6% to service`. */
  readonly wear: string;
  readonly wearIsDue: boolean;
  readonly order: StandingOrderView;
  /** The *wants you for* cell. */
  readonly status: string;
  readonly statusSub: string;
  readonly cta: string;
  readonly needsDecision: boolean;
}

export interface TowersView {
  readonly title: string;
  readonly stagePill: string;
  readonly meta: string;
  readonly lede: string;
  readonly standing: {
    readonly heading: string;
    readonly value: string;
    readonly pct: number;
    readonly note: string;
    readonly slots: readonly SlotCardView[];
  };
  readonly stats: readonly CareerStatView[];
  readonly calendar: CalendarView;
  readonly headings: readonly string[];
  readonly rows: readonly TowerRowView[];
  readonly footer: string;
  readonly offers: { readonly heading: string; readonly refusal: string };
  readonly lately: { readonly heading: string; readonly sub: string; readonly refusal: string };
  readonly oddsFootnote: string;
}

/**
 * § 8.12's snapshot label, **derived from the career day** rather than picked.
 *
 * The design's own `careerStage` control is a way of *reading* three authored states; this build has
 * one real career, so the label says where in it the player is. The boundaries are § 8.12's own
 * career days — 4, 24 and 96 — read as *the first month, the second, and after that*.
 */
export function careerStageLabel(today: number): string {
  if (today <= CONTRACT_DAYS) return 'WEEK ONE';
  if (today <= CONTRACT_DAYS * 4) return 'SECOND MONTH';
  return 'FIFTH MONTH';
}

/** § 8.4's standing note, in the design file's four arms. */
function standingNote(standing: number, open: number, atRisk: number): string {
  const next = nextSlot(standing);
  if (next === undefined) {
    return 'Every slot open. Nothing left to unlock — only buildings left to keep.';
  }
  if (atRisk > 0) {
    const towers = atRisk > 1 ? 'towers are' : 'tower is';
    return `Slot ${String(open + 1)} is paid for, but ${String(atRisk)} ${towers} one miss from ending. Steady those first.`;
  }
  return `${String(next.standing - standing)} more to open slot ${String(open + 1)} · a cleared day is worth 2, a missed one costs 3`;
}

/** The status of a quiet tower's contract — § 8.1's `statusSub`, derived from the allowance. */
function contractStatusLine(tower: CampaignTower): string {
  const allowance = DIFFICULTIES[tower.difficultyId].miss;
  if (tower.day >= 19) return 'renewal offered';
  const left = allowance - tower.missed;
  if (left < 0) return `contract ended — ${String(tower.missed)} missed`;
  if (left === 0) return 'one more miss ends it';
  if (left === 1) return 'one miss left';
  return `${String(left)} misses left`;
}

/** § 8.1's terms cell. Refuses the complexity half rather than defaulting it (§ 8.5). */
function termsLine(tower: CampaignTower): string {
  const complexity = complexityOf(tower.buildingId);
  const fee = `${units(tower.rate)} a day`;
  if (complexity === undefined) return `complexity ${UNFINISHED} · ${fee}`;
  return `complexity ${String(complexity)} of ${String(COMPLEXITY_MAX)} · ${fee}`;
}

function standingOrderView(input: CampaignInput, tower: CampaignTower): StandingOrderView {
  const picked = input.dispatchers.find((entry) => entry.id === tower.dispatcherId);
  return {
    dispatcherId: tower.dispatcherId,
    dispatchers: input.dispatchers,
    buildId: tower.buildId,
    builds: BUILD_IDS.map((id) => ({ id, label: BUILD_LABELS[id] })),
    buildNote: BUILD_REFUSAL,
    /*
     * § 8.2's *"the style's one-line trade printed beneath the picker"*, and the honest arm when
     * there is none. No shipped dispatcher carries a player-facing trade line — the profiles hold
     * an id, a name and a weight vector — so the picker says that rather than printing a weight or
     * an invented sentence, which is § 16 rule 11's own remedy for a parameter with no player name.
     */
    note:
      picked === undefined
        ? 'nobody is assigned — pick who drives this building every day'
        : (picked.note ??
          (picked.saved
            ? 'one of yours — the workshop knows what it does'
            : 'no one-line trade ships with this style yet — what it does is its weights, and the workshop is where they are readable')),
  };
}

function towerRowView(input: CampaignInput, tower: CampaignTower): TowerRowView {
  const facts = factsFor(input, tower);
  const need = needOf(tower);
  const wearPct = Math.round(wearOf(tower) * 100);
  const months = tower.months === 1 ? '1 month held' : `${String(tower.months)} months held`;
  return {
    towerId: tower.id,
    name: facts.name,
    spec: facts.spec ?? UNFINISHED,
    quirk: tower.quirk === '' ? UNFINISHED : tower.quirk,
    terms: termsLine(tower),
    day: `day ${String(tower.day)}`,
    record: `${String(clearedDays(tower))} cleared · ${String(tower.missed)} missed`,
    wear: `${months} · ${String(wearPct)}% to service`,
    wearIsDue: wearHeadOf(tower) === 'due',
    order: standingOrderView(input, tower),
    status: need?.title ?? TOWERS_COPY.quietStatus,
    statusSub: need?.due ?? nextLineOf(tower),
    cta:
      need === undefined
        ? TOWERS_COPY.quietCta
        : need.kind === 'renewal'
          ? TOWERS_COPY.renewCta
          : TOWERS_COPY.openCta,
    needsDecision: need !== undefined,
  };
}

/** The rolling calendar, rows and columns from one array. */
export function calendarView(input: CampaignInput): CalendarView {
  const today = input.career.today;
  const columns = calendarColumns(today);
  const from = calendarFrom(today);
  return {
    heading: TOWERS_COPY.calendarHeading,
    note: `working days ${String(from)}–${String(from + CALENDAR_SPAN - 1)} · contracts renew, expire and appear as you go, each twenty days from wherever it starts`,
    columns,
    rows: input.career.towers.map((tower): CalendarRowView => {
      const facts = factsFor(input, tower);
      const need = needOf(tower);
      const marks = {
        dueDays: need === undefined ? [] : [tower.day],
        flaggedDays: tower.flaggedDays,
      };
      return {
        towerId: tower.id,
        name: facts.name,
        cells: calendarRow(today, tower, marks).map((cell) => ({
          glyph: CALENDAR_GLYPHS[cell.mark],
          mark: cell.mark,
          tip:
            cell.towerDay === undefined
              ? `${facts.name} · not yours on working day ${String(cell.careerDay)}`
              : `${facts.name} · its day ${String(cell.towerDay)} of ${String(CONTRACT_DAYS)}${tipSuffix(cell.mark)}`,
        })),
      };
    }),
    legend: CALENDAR_LEGEND,
  };
}

/**
 * The half-sentence after a calendar cell's day number.
 *
 * **`works` says the works are booked and stops there — GitHub issue #264.** It used to say *"a car
 * out of service"*, and no campaign day has ever taken one: `RecordRunOptions.outOfServiceCarIds`
 * has no writer under `campaign/`, none in any `everyday/campaign*` module, and none in
 * `everyday/host.ts#runCampaignDay`, which patches the building and the dispatcher and starts the
 * run. That is the *assertion* half of § D227's class rather than the refusal half, and it is the
 * worse one: a player who reasons correctly from it attributes a bad day to a missing car instead of
 * to their dispatcher, which is the diagnosis this game exists to teach.
 *
 * Withdrawn rather than hedged. *A car may be out* on a day where none ever is would be the same
 * claim with more words. What is left is the part `economy.test.ts` and `campaignModel.test.ts`
 * already hold: the money is gone, and the nights are spoken for.
 */
function tipSuffix(mark: CalendarCell['mark']): string {
  switch (mark) {
    case 'today':
      return ' · today';
    case 'due':
      return ' · a decision is due';
    case 'works':
      return ' · works are booked';
    case 'flagged':
      return ' · a crowd is booked';
    case 'cleared':
      return ' · cleared';
    case 'missed':
      return ' · missed';
    default:
      return '';
  }
}

/** § 8.1's whole screen. */
export function towersView(input: CampaignInput): TowersView {
  const career = input.career;
  const standing = standingOf(career.carry, career.towers);
  const open = slotsOpen(standing);
  const atRisk = atRiskTowers(career.towers).length;
  const next = nextSlot(standing);
  const dueService = career.towers.filter((tower) => wearHeadOf(tower) === 'due').length;
  const wanting = career.towers.filter((tower) => needOf(tower) !== undefined).length;
  const held = career.towers.length;

  return {
    title: TOWERS_COPY.title,
    stagePill: careerStageLabel(career.today),
    meta: `${String(Math.min(held, open))} of ${String(SLOTS.length)} slots in hand · ${String(atRisk)} at risk · standing ${String(standing)}`,
    lede: TOWERS_COPY.lede,
    standing: {
      heading: TOWERS_COPY.standingHeading,
      value: String(standing),
      pct:
        next === undefined
          ? 100
          : Math.max(0, Math.min(100, Math.round((standing / next.standing) * 100))),
      note: standingNote(standing, open, atRisk),
      slots: SLOTS.map((slot, index): SlotCardView => {
        const inHand = index < held;
        return {
          heading: `SLOT ${String(index + 1)}`,
          tag: inHand ? 'in hand' : slot.standing <= standing ? 'open' : `${String(slot.standing)} needed`,
          note: slot.note,
          inHand,
        };
      }),
    },
    stats: [
      {
        value: `day ${String(career.today)}`,
        label: 'of your career',
        note: 'contracts start and end around you — nothing resets',
      },
      {
        value: String(career.monthsWorked),
        label: 'months worked',
        note: 'across every building you have held',
      },
      {
        value: String(standing),
        label: 'standing',
        note:
          (career.carry > 0 ? `${String(career.carry)} banked from finished contracts · ` : '') +
          (next === undefined
            ? 'every slot open'
            : open > held
              ? 'a slot is open'
              : `${String(next.standing - standing)} from the next slot`),
      },
      {
        value: `${String(dueService)} of ${String(held)}`,
        label: 'due a service window',
        note: 'machines are counted in trips, not days',
      },
      {
        value: `${String(career.lost)} of 3`,
        label: 'contracts lost',
        /*
         * § 8.10's ceiling, said where a player reads it. `careerIsOver` counts contracts already
         * past their allowance as well as those filed as lost, so a month that has ended and is
         * still on the screen is included before anybody clears it away.
         */
        note: careerIsOver(career)
          ? 'the agency has stopped calling'
          : career.lost >= 2
            ? 'one more and the agency stops calling'
            : 'lose three and the career ends',
      },
    ],
    calendar: calendarView(input),
    headings: TOWERS_COPY.tableHeadings,
    rows: career.towers.map((tower) => towerRowView(input, tower)),
    footer: `${String(wanting)} of ${String(held)} buildings want a decision · the rest need nothing from you today`,
    offers: { heading: TOWERS_COPY.offersHeading, refusal: TOWERS_COPY.offersRefusal },
    lately: {
      heading: TOWERS_COPY.incidentsHeading,
      sub: TOWERS_COPY.incidentsSub,
      refusal: TOWERS_COPY.incidentsRefusal,
    },
    oddsFootnote: TOWERS_COPY.oddsFootnote,
  };
}

/* -------------------------------------------------------------------------- *
 * The building desk — § 8.2
 * -------------------------------------------------------------------------- */

export const BUILDING_COPY = Object.freeze({
  incidentEyebrow: 'THEY NEED A DECISION',
  optionsEyebrow: 'WHAT DO YOU WANT DONE',
  optionsNote: 'maintenance can handle any of it — they need you to choose',
  optionsNoteRenewal: 'a finished contract frees its slot — that is how you move up',
  quietHeading: 'Running itself',
  quietBody:
    'Your standing order is holding and nothing is booked. Maintenance will carry on without you, and ' +
    'you will hear from them when something changes.',
  orderHeading: 'DISPATCHER STANDING ORDER',
  orderSub: 'What this building does every day without asking you.',
  orderDrives: 'DRIVES EVERY DAY',
  buildingHeading: 'BUILDING',
  fittedHeading: 'WHAT IS INSTALLED',
  purseHeading: "THIS BUILDING'S PURSE",
  purseNote:
    'Each building keeps its own purse, fed by its daily fee. Kit is fitted on nights you book, and it ' +
    'belongs to the building — hand the contract back and it stays behind.',
  purseLink: 'Buy and book the nights in the contract →',
  quirkHeading: "THE BUILDING'S HABIT",
  quirkSub: 'the thing that will catch you out',
  conditionHeading: 'CONDITION',
  oddsHeading: 'HOW OFTEN A LIFT FAILS',
  temporaryHeading: 'TEMPORARY CHANGES',
  temporaryEmpty:
    'Nothing temporary in place. Anything you set for an incident reverts on its own when the incident ' +
    'closes, so a bad week cannot quietly become your standing order.',
  monthHeading: 'THIS MONTH',
  testsEyebrow: 'WHAT TODAY ASKS',
  /*
   * **This read *"all four, or the day is missed"* when the fourth graded nothing**, and it is left
   * exactly as the correction wrote it now that all four do — § D227's first direction, on the line
   * that tells a player what closing the day will do to them.
   *
   * *Every one this run can read* is still the true sentence rather than a leftover. The trip budget
   * grades from this wave (GitHub issue #169), so on a shipped run the four are four; but a reading
   * can still be `pending` — below the wake-up gate, on a censored worst wait, or on a recording that
   * carries no travel record — and on those days {@link campaignDayVerdict} returns `ungraded` and
   * nothing is filed. A note promising *all four* would be back to promising a bar the day may not
   * have, which is the defect this line was rewritten for.
   */
  testsNote:
    'every one this run can read, or the day is missed — and a day it could not read is not filed at all',
  asBuilt: 'as built',
} as const);

/** § 8.3's three wear heads, in the design file's own words. */
export const WEAR_HEADS: Readonly<Record<ReturnType<typeof wearHeadOf>, string>> = Object.freeze({
  due: 'Service window due',
  wearing: 'Wearing in',
  fresh: 'Recently serviced',
});

export interface NeedOptionView {
  readonly id: string;
  readonly label: string;
  /** `free` · `3 u` · `46 u · 10 nights`, with § 16 rule 6's shortfall appended. */
  readonly cost: string;
  readonly when: string;
  readonly effect: string;
  /** § 16 rule 6 — visible, dimmed and inert, and it says what it is short by. */
  readonly affordable: boolean;
  readonly isDefault: boolean;
}

export interface FittedRowView {
  readonly categoryId: string;
  /** The tier's own name once live, the category's once booked, or the category and *as built*. */
  readonly label: string;
  /** `L2` · `booked` · `—`. */
  readonly level: string;
  readonly state: 'live' | 'booked' | 'as-built';
}

export interface BuildingView {
  readonly name: string;
  readonly spec: string;
  readonly statePill: string;
  readonly need:
    | {
        readonly eyebrow: string;
        readonly allowance: string;
        readonly due: string;
        readonly title: string;
        readonly brief: string;
        /** § 8.9's offer block, on a renewal only. */
        readonly offer:
          | { readonly rate: string; readonly head: string; readonly why: string }
          | undefined;
      }
    | undefined;
  readonly options:
    | { readonly eyebrow: string; readonly note: string; readonly purse: string; readonly rows: readonly NeedOptionView[] }
    | undefined;
  readonly quiet: { readonly heading: string; readonly body: string; readonly next: string } | undefined;
  readonly order: {
    readonly heading: string;
    readonly sub: string;
    readonly drives: string;
    readonly view: StandingOrderView;
  };
  readonly fitted: { readonly heading: string; readonly rows: readonly FittedRowView[] };
  readonly purse: {
    readonly heading: string;
    readonly onHand: string;
    readonly note: string;
    readonly link: string;
  };
  readonly quirk: { readonly heading: string; readonly text: string; readonly sub: string };
  readonly condition: {
    readonly heading: string;
    readonly head: string;
    readonly headId: ReturnType<typeof wearHeadOf>;
    readonly trips: string;
    readonly wearPct: number;
    readonly note: string;
  };
  readonly odds: { readonly heading: string; readonly now: string; readonly note: string };
  readonly temporary: { readonly heading: string; readonly body: string };
  readonly month: {
    readonly heading: string;
    readonly day: string;
    readonly cleared: string;
    readonly missed: string;
  };
  readonly tests: {
    readonly eyebrow: string;
    readonly note: string;
    readonly held: string;
    readonly rows: readonly CampaignTestRow[];
  };
}

/** `1,200 / 45,000 trips` — grouped explicitly, never through a locale. */
function groupThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** § 8.3's wear note, in the design file's three arms. */
function wearNote(tower: CampaignTower): string {
  const left = serviceDaysLeft(tower);
  const head = wearHeadOf(tower);
  if (head === 'due') {
    return `Roughly ${String(left)} working days before the machines are due. Maintenance will take one lift a night for three nights — better to book it in a quiet week than have it fall due during a rush.`;
  }
  if (head === 'wearing') {
    return `About ${String(left)} working days of trips before the next window. Faster doors and fuller cars both slow this clock down.`;
  }
  return `About ${String(left)} working days of trips before the next window. Recently serviced, so a failure would be genuine bad luck rather than something you let build up.`;
}

/**
 * § 8.3's note under the failure figure, in the design file's two arms and said as a frequency —
 * see {@link TOWERS_COPY.oddsFootnote} for why the wording departs from the prototype's.
 */
function failureRateNote(tower: CampaignTower): string {
  if (wearHeadOf(tower) === 'due') {
    return `Past the window this climbs fast, against ${FRESH_RATE_TEXT} on freshly serviced machines.`;
  }
  return `Every trip adds to this. Booking the service window takes it back to ${FRESH_RATE_TEXT}.`;
}

/** § 8.3's `freshOdds`, worded once — the figure is `economy.ts`'s and this is its sentence. */
const FRESH_RATE_TEXT = `${FRESH_ODDS_PCT.toFixed(1)}% of days`;

function needOptionViews(tower: CampaignTower, need: TowerNeed): readonly NeedOptionView[] {
  const purse = purseOf(tower);
  return need.options.map((option: NeedOption): NeedOptionView => {
    const affordable = option.units <= purse;
    const base =
      option.units === 0
        ? option.nights === 0
          ? 'free'
          : `free · ${String(option.nights)} nights`
        : option.nights === 0
          ? units(option.units)
          : `${units(option.units)} · ${String(option.nights)} nights`;
    return {
      id: option.id,
      label: option.label,
      cost: affordable ? base : `${base} · need ${String(option.units - purse)} more`,
      when: option.when,
      effect: option.effect,
      affordable,
      isDefault: option.isDefault === true,
    };
  });
}

/** § 8.2's whole desk. */
export function buildingView(input: CampaignInput): BuildingView | undefined {
  const tower = openTowerOf(input.career);
  if (tower === undefined) return undefined;
  const facts = factsFor(input, tower);
  const difficulty = DIFFICULTIES[tower.difficultyId];
  const need = needOf(tower);
  const offer = renewalOffer(tower);
  const rows = campaignTestRows(difficulty, tower, input.observations, input.history);

  return {
    name: facts.name,
    spec: facts.spec ?? UNFINISHED,
    statePill: need === undefined ? 'running itself' : 'needs a decision',
    need:
      need === undefined
        ? undefined
        : {
            eyebrow: BUILDING_COPY.incidentEyebrow,
            allowance: `${String(tower.missed)} of ${difficulty.miss === 0 ? 'no' : String(difficulty.miss)} missed days used · ${difficulty.name.toLowerCase()}`,
            due: need.due,
            title: need.title,
            brief: need.brief,
            offer:
              need.kind !== 'renewal'
                ? undefined
                : {
                    rate: units(offer.offered),
                    head: `a day, up from ${String(offer.wasRate)} — their offer, not yours to set`,
                    why: `${recordLine(tower)}. A harder building pays more because it will cost you more days; a record like yours moves the rate by ${offer.bonus >= 0 ? '+' : ''}${String(offer.bonus)}.`,
                  },
          },
    options:
      need === undefined
        ? undefined
        : {
            eyebrow: BUILDING_COPY.optionsEyebrow,
            note:
              need.kind === 'renewal'
                ? BUILDING_COPY.optionsNoteRenewal
                : BUILDING_COPY.optionsNote,
            purse: `${units(purseOf(tower))} on hand · ${String(rateOnDay(difficulty, dayIndexOf(tower)))} a cleared day`,
            rows: needOptionViews(tower, need),
          },
    quiet:
      need !== undefined
        ? undefined
        : {
            heading: BUILDING_COPY.quietHeading,
            body: BUILDING_COPY.quietBody,
            next: nextLineOf(tower),
          },
    order: {
      heading: BUILDING_COPY.orderHeading,
      sub: BUILDING_COPY.orderSub,
      drives: BUILDING_COPY.orderDrives,
      view: standingOrderView(input, tower),
    },
    fitted: {
      heading: BUILDING_COPY.fittedHeading,
      rows: SHOP.map((category): FittedRowView => {
        const live = fittedLevel(tower, category.id);
        const booked = bookedLevel(tower, category.id);
        if (live > 0) {
          return {
            categoryId: category.id,
            label: category.tiers.find((tier) => tier.level === live)?.name ?? category.name,
            level: `L${String(live)}`,
            state: 'live',
          };
        }
        if (booked > 0) {
          return {
            categoryId: category.id,
            label: category.tiers.find((tier) => tier.level === booked)?.name ?? category.name,
            level: 'booked',
            state: 'booked',
          };
        }
        return {
          categoryId: category.id,
          label: `${category.name} — ${BUILDING_COPY.asBuilt}`,
          level: UNFINISHED,
          state: 'as-built',
        };
      }),
    },
    purse: {
      heading: BUILDING_COPY.purseHeading,
      onHand: `${units(purseOf(tower))} on hand`,
      note: BUILDING_COPY.purseNote,
      link: BUILDING_COPY.purseLink,
    },
    quirk: {
      heading: BUILDING_COPY.quirkHeading,
      text: tower.quirk === '' ? UNFINISHED : tower.quirk,
      sub: BUILDING_COPY.quirkSub,
    },
    condition: {
      heading: BUILDING_COPY.conditionHeading,
      head: WEAR_HEADS[wearHeadOf(tower)],
      headId: wearHeadOf(tower),
      trips: `${groupThousands(tower.trips)} / ${groupThousands(tower.serviceAt)} trips`,
      wearPct: Math.round(wearOf(tower) * 100),
      note: wearNote(tower),
    },
    odds: {
      heading: BUILDING_COPY.oddsHeading,
      now: `${failureOddsPct(tower).toFixed(1)}% of days`,
      note: failureRateNote(tower),
    },
    temporary: { heading: BUILDING_COPY.temporaryHeading, body: BUILDING_COPY.temporaryEmpty },
    month: {
      heading: BUILDING_COPY.monthHeading,
      day: `day ${String(tower.day)}`,
      cleared: String(clearedDays(tower)),
      missed: String(tower.missed),
    },
    tests: {
      eyebrow: `WHAT DAY ${String(tower.day)} ASKS`,
      note: BUILDING_COPY.testsNote,
      held: testsHeldLine(rows),
      rows,
    },
  };
}

/** § 8.9's record line — `94% of days cleared · complexity 3 of 5`, both halves derived. */
export function recordLine(tower: CampaignTower): string {
  const offer = renewalOffer(tower);
  const complexity = complexityOf(tower.buildingId);
  const share = `${String(Math.round(offer.clearRate * 100))}% of days cleared`;
  if (complexity === undefined) return `${share} · complexity ${UNFINISHED}`;
  return `${share} · complexity ${String(complexity)} of ${String(COMPLEXITY_MAX)}`;
}

/* -------------------------------------------------------------------------- *
 * Contract & works — § 8.3 and § 8.4
 * -------------------------------------------------------------------------- */

export const CONTRACT_COPY = Object.freeze({
  lede:
    'One building for twenty days. You are paid for each day you clear, more as the month goes on, and ' +
    'you spend it on the tower itself. A perfect month buys about a third of the shop, so the month is ' +
    'really a question about what this building will never get.',
  difficultyEyebrow: 'HOW HARD',
  difficultyFooter: 'Changing this starts a fresh month.',
  monthHeading: 'THE MONTH',
  purseHeading: 'THE PURSE',
  oddsHeading: 'HOW OFTEN A LIFT FAILS',
  purseCarryNote: 'carries into next month — what it does not spend here, it keeps.',
  purseKitNote:
    'Kit belongs to the building, so a contract you lose takes it with it — and a tower left as built ' +
    'starts missing days on its own, while one in good condition renews on better terms.',
  /*
   * **The second half used to say *"The lift is out for the peak on each of those days"*, and it was
   * not true of any run — GitHub issue #264.** See {@link tipSuffix} for the mechanism and for why
   * the sentence is withdrawn rather than hedged. What replaces it is the cost the works genuinely
   * carry, which is time: the nights are spoken for and the kit is not live until they are done.
   */
  shopSub:
    'Pick a level, then pick the nights it goes in on the month above. Those nights are spoken for — ' +
    'nothing else can go in on them, and the kit is live the day after the last.',
  termsHeading: 'What clears the week',
  shaftHeading: 'The shaft decision',
  /*
   * *"You hand back two cars for eight days you still have to clear"* went the same way and for the
   * same reason (issue #264). It was the most expensive instance of the claim rather than the most
   * visible: § 8.4's whole decision is priced off it, so a player reasoning correctly from a cost
   * the run does not charge declines the purchase the month is built around. The trade that is
   * actually modelled is the one left standing — eight of the twenty days gone before the kit is
   * live, so buying late buys nothing.
   */
  shaftBody:
    'A fourth car is 34 units and eight nights. Buy it in week two and it is live with a fortnight ' +
    'left to use it, which is what pays for the eight days it takes to go in. Buy it in week four ' +
    'and you have paid for something you never get to use.',
  shaftBody2:
    'The alternative is four cheap things that each shave a second. They will out-perform the shaft this ' +
    'month and leave the building exactly as short as it was.',
  testsConflict:
    'The queue cap and the wear budget cannot both be satisfied by driving harder — one wants more trips, ' +
    'the other fewer. That is the day’s actual puzzle: the only things that move both are grouping people ' +
    'by destination, bigger cars, and starting the crowd later.',
  cancel: 'cancel',
} as const);

/** § 8.3's month-grid legend. The `⚒` entry says *booked*, never *a car out* — issue #264. */
export const MONTH_LEGEND: readonly string[] = Object.freeze([
  'cleared',
  'missed',
  'works booked',
  'to come',
]);

/** Weekday heads over the month grid — four weeks of five working days. */
export const WEEKDAY_HEADS: readonly string[] = Object.freeze(['MON', 'TUE', 'WED', 'THU', 'FRI']);

export interface MonthCellView {
  /** 0-based day index. */
  readonly dayIdx: number;
  /** `NOW` · `✓` · `×` · `⚒` · `+` · ``. */
  readonly mark: string;
  readonly state: 'today' | 'cleared' | 'missed' | 'works' | 'bookable' | 'ahead';
  readonly tip: string;
}

export interface ShopTierRowView {
  readonly categoryId: string;
  readonly level: number;
  readonly levelLabel: string;
  readonly name: string;
  /** `9 u · 1n`. */
  readonly cost: string;
  readonly effect: string;
  /** The derived state line — § 8.2's seven. */
  readonly state: string;
  readonly stateId: ShopTierState['id'];
  readonly pressable: boolean;
}

export interface ShopCategoryView {
  readonly id: string;
  readonly name: string;
  readonly sub: string;
  /** `level 2 fitted` · `level 1 booked` · `nothing yet`. */
  readonly owned: string;
  readonly rows: readonly ShopTierRowView[];
}

export interface ContractView {
  readonly title: string;
  readonly meta: string;
  readonly lede: string;
  readonly difficulty: {
    readonly eyebrow: string;
    readonly picked: DifficultyId;
    readonly buttons: readonly { readonly id: DifficultyId; readonly label: string }[];
    readonly note: string;
    readonly footer: string;
  };
  readonly month: {
    readonly heading: string;
    readonly note: string;
    readonly heads: readonly string[];
    readonly weeks: readonly { readonly label: string; readonly cells: readonly MonthCellView[] }[];
    readonly prompt: string | undefined;
    readonly cancel: string;
    readonly booked: readonly { readonly name: string; readonly when: string }[];
    readonly worksCost: string | undefined;
    readonly legend: readonly string[];
  };
  readonly purse: {
    readonly heading: string;
    readonly onHand: string;
    readonly note: string;
    readonly weeks: readonly { readonly label: string; readonly value: string; readonly note: string; readonly current: boolean }[];
    readonly oddsHeading: string;
    readonly oddsNow: string;
    readonly oddsAfter: string;
    readonly oddsNote: string;
    readonly totalNote: string;
    readonly carryNote: string;
    readonly kitNote: string;
  };
  readonly tests: {
    readonly eyebrow: string;
    readonly note: string;
    readonly held: string;
    readonly rows: readonly CampaignTestRow[];
    readonly conflict: string;
  };
  readonly shop: {
    readonly eyebrow: string;
    readonly sub: string;
    readonly categories: readonly ShopCategoryView[];
  };
  readonly terms: {
    readonly heading: string;
    readonly rows: readonly { readonly label: string; readonly got: string }[];
  };
  readonly shaft: { readonly heading: string; readonly body: string; readonly body2: string };
}

function shopTierRow(
  tower: CampaignTower,
  category: ShopCategory,
  tier: ShopTier,
): ShopTierRowView {
  const state = shopTierState(tower, category.id, tier);
  return {
    categoryId: category.id,
    level: tier.level,
    levelLabel: `L${String(tier.level)}`,
    name: tier.name,
    cost: tier.nights === 0 ? units(tier.units) : `${units(tier.units)} · ${String(tier.nights)}n`,
    effect: tier.effect,
    state: shopStateLine(tower, tier, state),
    stateId: state.id,
    pressable: state.pressable,
  };
}

/** § 8.2's *"every tier shows its own derived state"*, worded. */
function shopStateLine(tower: CampaignTower, tier: ShopTier, state: ShopTierState): string {
  switch (state.id) {
    case 'fitted':
      return 'in the building';
    case 'under-works':
      return state.booking === undefined ? 'booked' : worksDayLine(state.booking);
    case 'booked':
      return 'booked';
    case 'needs-below':
      return `needs level ${String(state.needsLevel ?? tier.level - 1)} first`;
    case 'short':
      return `need ${String(state.shortBy ?? 0)} more`;
    case 'past-contract':
      return 'works run past the contract';
    case 'buyable': {
      if (tier.nights === 0) return 'working tomorrow';
      const ready = dayIndexOf(tower) + tier.nights;
      return `ready on day ${String(ready + 1)} · ${String(CONTRACT_DAYS - ready)} days of benefit`;
    }
  }
}

/** § 8.3's whole contract sheet. */
export function contractView(input: CampaignInput): ContractView | undefined {
  const tower = openTowerOf(input.career);
  if (tower === undefined) return undefined;
  const facts = factsFor(input, tower);
  const difficulty = DIFFICULTIES[tower.difficultyId];
  const dayIdx = dayIndexOf(tower);
  const purse = purseOf(tower);
  const pending = input.career.pendingBooking;
  const pendingTier =
    pending === undefined || pending.towerId !== tower.id
      ? undefined
      : SHOP.find((category) => category.id === pending.categoryId)?.tiers.find(
          (tier) => tier.level === pending.level,
        );
  const starts = pendingTier === undefined ? [] : legalStarts(tower, pendingTier.nights);
  const occupied = occupiedDayIndices(tower);
  const lastCleared = tower.day - 1 - tower.missed;
  const worksDays = [...occupied].filter((index) => index >= dayIdx);
  const rows = campaignTestRows(difficulty, tower, input.observations, input.history);

  const cellFor = (index: number): MonthCellView => {
    const bookable = starts.includes(index);
    /*
     * **A legal start wins over `NOW`, and only while a buy is pending.** § 8.2 makes today a legal
     * start (`s ≥ dayIdx`) and § 8.4 says the grid lights *every* legal start with `+`; a `NOW` that
     * outranked it would hide the one start a player most often wants — tonight — behind a mark
     * that is redundant while the prompt above the grid is already saying which day is which.
     * `starts` is empty unless a tier is pending, so outside the booking step today is `NOW` again.
     */
    const state: MonthCellView['state'] =
      bookable
        ? 'bookable'
        : index === dayIdx
        ? 'today'
        : index < dayIdx
          ? index + 1 > lastCleared
            ? 'missed'
            : 'cleared'
          : occupied.has(index)
            ? 'works'
            : 'ahead';
    const mark =
      state === 'today'
        ? 'NOW'
        : state === 'cleared'
          ? '✓'
          : state === 'missed'
            ? '×'
            : state === 'works'
              ? '⚒'
              : state === 'bookable'
                ? '+'
                : '';
    /*
     * Neither arm claims a car — issue #264, and {@link tipSuffix} carries the argument. The offer
     * arm names the day the kit goes live instead, which is `worksDayLine`'s own arithmetic and the
     * thing a player is actually choosing between when they pick one night over another.
     */
    const tip =
      state === 'bookable' && pendingTier !== undefined
        ? `book ${pendingTier.name} — ${String(pendingTier.nights)} ${pendingTier.nights === 1 ? 'night' : 'nights'} from day ${String(index + 1)}, live on day ${String(index + 1 + pendingTier.nights)}`
        : `day ${String(index + 1)}${
            state === 'works'
              ? ' · works are booked'
              : state === 'missed'
                ? ' · missed'
                : state === 'cleared'
                  ? ' · cleared'
                  : ''
          }`;
    return { dayIdx: index, mark, state, tip };
  };

  const weeks = Array.from({ length: CONTRACT_DAYS / WEEKDAY_HEADS.length }, (_unused, week) => ({
    label: `W${String(week + 1)}`,
    cells: WEEKDAY_HEADS.map((_head, day) => cellFor(week * WEEKDAY_HEADS.length + day)),
  }));

  const booked = tower.bookings
    .filter((booking) => booking.nights > 0)
    .map((booking) => ({
      name:
        SHOP.find((category) => category.id === booking.categoryId)?.tiers.find(
          (tier) => tier.level === booking.level,
        )?.name ?? 'Works on the machines',
      when:
        booking.nights === 1
          ? `day ${String(booking.startIdx + 1)}`
          : `days ${String(booking.startIdx + 1)}–${String(booking.startIdx + booking.nights)}`,
    }));

  return {
    title: `${facts.name}, this month`,
    meta: `${facts.spec ?? UNFINISHED} · day ${String(tower.day)} of twenty · ${units(tower.rate)} a day`,
    lede: CONTRACT_COPY.lede,
    difficulty: {
      eyebrow: CONTRACT_COPY.difficultyEyebrow,
      picked: tower.difficultyId,
      buttons: DIFFICULTY_IDS.map((id) => ({ id, label: DIFFICULTIES[id].name })),
      note: difficulty.note,
      footer: CONTRACT_COPY.difficultyFooter,
    },
    month: {
      heading: CONTRACT_COPY.monthHeading,
      note: `day ${String(tower.day)} of ${String(CONTRACT_DAYS)} · ${String(rateOnDay(difficulty, dayIdx))} units a cleared day this week · ${difficulty.name.toLowerCase()}`,
      heads: WEEKDAY_HEADS,
      weeks,
      prompt:
        pendingTier === undefined
          ? undefined
          : `Pick the night ${pendingTier.name} goes in. ${String(pendingTier.nights)} ${pendingTier.nights === 1 ? 'night' : 'nights'} of works, and it is live the day after the last of them.`,
      cancel: CONTRACT_COPY.cancel,
      booked,
      /*
       * **The absence is stated here, where the player meets the cost — issue #264.** This line
       * used to read *"N peaks run a car short"*, which was the claim's most concrete form: a count
       * of peaks, each said to be a car down, on days that run with every lift. The count is real
       * and the money is real; the car is not, and § D227's first direction — *a control that
       * writes nothing must say so* — is why the sentence says so rather than going quiet.
       */
      worksCost:
        worksDays.length === 0
          ? undefined
          : `${String(worksDays.length)} ${worksDays.length === 1 ? 'night' : 'nights'} of works booked, for ${String(committedUnits(tower))} units of kit that stays with the building. The works take no car out of service — a booking moves the purse and this grid, not the day you run.`,
      legend: MONTH_LEGEND,
    },
    purse: {
      heading: CONTRACT_COPY.purseHeading,
      onHand: units(purse),
      note: `on hand · ${String(carriedIn(tower))} carried in from earlier months, ${String(earnedSoFar(tower))} earned this one, ${String(committedUnits(tower))} committed${worksDays.length === 0 ? '' : ` · ${String(worksDays.length)} nights of works running`} · ${String(rateOnDay(difficulty, dayIdx))} more tomorrow if today clears`,
      weeks: difficulty.rates.map((rate, week) => ({
        label: `WEEK ${String(week + 1)}`,
        value: units(rate),
        note: 'a cleared day',
        current: week === Math.min(difficulty.rates.length - 1, Math.floor(dayIdx / 5)),
      })),
      oddsHeading: CONTRACT_COPY.oddsHeading,
      oddsNow: `${failureOddsPct(tower).toFixed(1)}% of days`,
      oddsAfter: `${oddsAfterWorksPct(tower).toFixed(1)}% of days`,
      oddsNote:
        tower.bookings.length === 0
          ? 'Nothing booked yet, so this keeps climbing with every trip. Machine and door work is what moves this number.'
          : 'With the nights you have booked. Machines and doors both take load off the gear, which pushes the service window further out.',
      totalNote: `A perfect month pays ${String(perfectMonthUnits(difficulty))} units. The shop below is worth ${String(shopTotalUnits())}. You are choosing what this building does not get.`,
      carryNote: `This purse belongs to ${facts.name} alone and ${CONTRACT_COPY.purseCarryNote}`,
      kitNote: CONTRACT_COPY.purseKitNote,
    },
    tests: {
      eyebrow: `WHAT DAY ${String(tower.day)} ASKS`,
      note: BUILDING_COPY.testsNote,
      held: testsHeldLine(rows),
      rows,
      conflict: CONTRACT_COPY.testsConflict,
    },
    shop: {
      eyebrow: `SPEND BEFORE DAY ${String(tower.day)} RUNS`,
      sub: CONTRACT_COPY.shopSub,
      categories: SHOP.map((category): ShopCategoryView => {
        const live = fittedLevel(tower, category.id);
        const booking = bookedLevel(tower, category.id);
        return {
          id: category.id,
          name: category.name,
          sub: category.sub,
          owned:
            live > 0
              ? `level ${String(live)} fitted`
              : booking > 0
                ? `level ${String(booking)} booked`
                : 'nothing yet',
          rows: category.tiers.map((tier) => shopTierRow(tower, category, tier)),
        };
      }),
    },
    terms: {
      heading: CONTRACT_COPY.termsHeading,
      rows: [
        { label: 'Days cleared so far', got: `${String(clearedDays(tower))} of ${String(dayIdx)}` },
        { label: 'Days left in the month', got: String(CONTRACT_DAYS - dayIdx) },
        {
          label: 'Missed days allowed',
          got:
            difficulty.miss === 0
              ? `none — ${String(tower.missed)} already missed`
              : `${String(tower.missed)} of ${String(difficulty.miss)} used`,
        },
        {
          label: 'Nobody over three minutes, any day',
          got: rows.find((row) => row.id === 'worst')?.reading?.display ?? UNFINISHED,
        },
      ],
    },
    shaft: {
      heading: CONTRACT_COPY.shaftHeading,
      body: CONTRACT_COPY.shaftBody,
      body2: CONTRACT_COPY.shaftBody2,
    },
  };
}
