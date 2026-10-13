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
 * crowd"*, and the reason has narrowed rather than gone away. This build **does** run a ghost now
 * (GitHub issue #226, § D482) — § 7's stage races the plain baseline or your latest saved over the
 * same crowd, live, on two lines. What it has never had is *the world's middle*: no run in this
 * build is posted anywhere, so there is no distribution to take a middle of, and the arm is omitted
 * from the picker rather than stubbed (`live/raceStrip.ts#GHOST_OPTIONS`; the missing capability is
 * GitHub issue #327). A sheet is also the wrong place for the race even where one ran — it is a
 * **filed** account of one day, and the ghost's verdict is a live reading at a playhead that the
 * strip refuses to state as proof. So the closing block keeps the half that is about this run — the
 * sheet's own small print, which says in more words what *inside the noise* means — and does not
 * manufacture an opponent to be level with.
 *
 * ## That closing block is layered rather than cut — GitHub issue #211
 *
 * It was **one paragraph of 335 words**, measured on a real Garden Apartments day: 215 from
 * `shift/report.ts#smallPrintFor` with `mode/casualDay.ts`'s 84-word lead in front of it and its
 * 36-word reach note behind. Every clause is true and worth knowing, and it was the longest
 * player-facing block in the product. {@link EverydayReportView.honesty}`.parts` is that same
 * string in {@link HonestyPart}s: one opened, the rest behind a disclosure the screen draws as a
 * `<details>`.
 *
 * **Three rules bind the layering, and each one is a defect this repository has already paid for.**
 *
 * 1. **`body` does not move.** It is still the whole block as one value, byte for byte, because
 *    `honesty/surfaces.ts` seeds it as a single `role: 'reason'` string — the longest refusal in
 *    the product. A layering that replaced the field would have taken it out of the corpus without
 *    failing anything.
 * 2. **Nothing is deleted and nothing is re-ordered.** The parts, joined by one space, *are*
 *    `body`; `reportView.test.ts` asserts that equality over a real sheet. Re-ordering is the
 *    subtler half and it is forbidden for a stated reason: Casual's lead announces *"Two phrases
 *    below are worth having before you read them"*, so hoisting the sheet's own refusal above it
 *    would read better and make that sentence false about its own page — § D227's stale-position
 *    defect, manufactured on purpose.
 * 3. **The refusal is the part that stays open.** What is drawn without a press is
 *    {@link sheetPartsOf}'s first paragraph — *this is one replication of one day on one seed, and
 *    it cannot tell you that anything is better than anything*. Folding that and leaving the
 *    translations open would be § D299's *a mode may make this easier to read and may not make it
 *    say less*, dressed as tidying.
 *
 * The seam the parts are cut on is **derived, not matched**: `sheet.smallPrint` contains
 * `report.smallPrint` byte for byte (`dev/reportPanel.ts:1466` is what guarantees it), so the two
 * values this function already holds locate the mode's front and back matter without this file
 * knowing one word of either. If that ever stops being true, {@link honestyPartsOf} lays the whole
 * block out as one block rather than losing a sentence.
 */

import type { ReportView } from '../dev/reportPanel.js';
import { reportViewOf } from '../dev/reportPanel.js';
import type { TabName } from '../dev/elementMap.js';
import type { ShapedDayReport } from '../shift/report.js';
import type { TomorrowBriefing } from '../shift/tomorrow.js';
import { PRESS_CALL_ROW_ID } from '../shift/callRow.js';
import { dayCloseOf, type DayCloseView } from '../shift/dayClose.js';
import { CAREER_GOALS_HEADING, CAREER_VERDICT_LINES } from './careerCalls.js';
import type { WeekState } from '../shift/types.js';
import { weekDealOf, type HouseReading } from '../shift/weekStake.js';

/**
 * Where a lever's press goes — GitHub issue #213, the owner's ruling on it, and GAMEPLAY § 6.5.
 *
 * § 6.5 says each lever is *"a live handoff into the workshop"* for a dispatcher change and
 * *"routes to the tuner"* for a building one. The owner's ruling on #213 (2026-08-26) is the same
 * thing in plainer words: *make the levers easy to find from the report's findings; make the game
 * work for the user first and document the approach second.* So every card routes:
 *
 * - a **dispatcher** lever opens § 11's workshop, seeded on the dispatcher that drove the day,
 *   because that is where a dispatcher is changed;
 * - *Add a car* opens the sandbox tuner, whose *Shafts* row is the control that adds one;
 * - *Zone the tower* opens the simulator's Building panel, because the tuner has no zoning control
 *   and the card would otherwise name a surface that cannot do what it says.
 *
 * ## What this changes about the statistical rule, and what it does not
 *
 * `dev/reportPanel.ts#LEVER_SURFACES` refused to route the dispatcher pair on `docs/10` R2's ground:
 * a sheet that pointed at the control which would make one profile beat another would be
 * recommending a dispatcher off one replication. That rule is about what a sheet **claims**, and
 * the card still claims nothing comparative — its {@link EverydayLeverCard.caveat} says out loud
 * that one day is not evidence and that the bench settles it. What changed is only that the player
 * can now find the control the advice is about. The Engineer sheet keeps the old restraint; it is
 * the enthusiast's surface and the argument in `reportPanel.ts` is still the honest one there.
 */
export type LeverRoute =
  | { readonly kind: 'engineer'; readonly tab: TabName }
  | { readonly kind: 'everyday'; readonly screen: 'tuner' | 'workshop' };

/** One § 6.5 lever, with where it is carried out. */
export interface EverydayLeverCard {
  readonly title: string;
  readonly body: string;
  /**
   * The Engineer panel that carries this advice out, when the route is the simulator's — kept as
   * a field because `reportScreen.ts` presses the tab it names. `undefined` for an Everyday route.
   */
  readonly surface: TabName | undefined;
  /** Where the press goes. Every shipped lever has one; `undefined` only for a lever this build does not know. */
  readonly route: LeverRoute | undefined;
  /**
   * What the card's button says, or `undefined` on a card that has none — issue #213.
   *
   * `undefined` exactly when {@link route} is, and `reportView.test.ts` asserts that pairing in
   * both directions: a label with nowhere to go and a route with nothing on its face are the same
   * defect from either end.
   */
  readonly goLabel: string | undefined;
  /**
   * The sentence beside a dispatcher lever's button — the statistical honesty the old refusal
   * carried, kept on the card now that the button exists. `undefined` on a fabric lever.
   */
  readonly caveat: string | undefined;
  /** What the card says instead of offering a button, when it names no surface. */
  readonly noSurfaceNote: string | undefined;
}

/**
 * **§ 6.5's one button into tomorrow, and which tomorrow it opens** — GitHub issue **#577**.
 *
 * ## The defect
 *
 * This field had one arm. The sheet at the end of a **career** day drew *Open the doors on
 * Tuesday* — the daily loop's label, computed from `WeekState` — and its press ran
 * `EverydayHost.openTomorrow` and went to the daily brief. So the most prominent control on the
 * sheet that closes a career day silently swapped the player into another mode: the crumbs went
 * from *All buildings / ⟨building⟩ / Contract / The day / How it went* to *Front door / Brief /
 * The day*, the leave button went from *⤺ Leave the career* to *⤺ Leave today's tower*, and the
 * contract, the purse, the wear clock and the day ladder all stopped advancing with nothing
 * saying so. **A playability assessor played thirteen days believing they were still in a career
 * before checking.** Career days were advanced through the `Back to ⟨building⟩` crumb, which no
 * copy pointed at.
 *
 * ## The § D227 question, settled by [§ D899](../../../../DECISIONS.md) rather than by implication
 *
 * #577 leaves it open on purpose: the button's words *"Open the doors on Tuesday"* name a day and
 * not a mode, so either the press must stop leaving the career, or the label must say that it
 * does. **It is settled the first way, and the reason is that the second repair fixes a
 * navigation defect by describing it.** § D227 is a rule about a control's words matching what it
 * does, and it is satisfiable in both directions — which is exactly why it cannot decide this on
 * its own. What decides it is that the player chose the career and the sheet is the end of a
 * career day: *the next day* has an unambiguous referent there, and it is this contract's day
 * `n + 1`. A label reading *"Open the doors on Tuesday — this leaves the career"* would be honest
 * and would still make the career's own onward step the least prominent thing on the screen, with
 * the mode change as the default. So the words stay a promise about the next day and the press is
 * made true of the career.
 *
 * **Nothing is lost by dropping the daily route from this sheet**, which is the clause #577 asks
 * to be answered rather than assumed: the daily loop is one rail row away on every screen
 * (`⌂ Modes`, then *today's scenario*), that row's label says where it goes, and no other control
 * on the career sheet ever offered it. The `Back to ⟨building⟩` primary is untouched — #577's
 * fourth criterion — and it is still the route to the desk where works and needs are decided.
 *
 * ## When the career draws no button at all
 *
 * A contract that has filed its last day (`tower.day > CONTRACT_DAYS`) has no next day to open —
 * `campaign/career.ts#fileDay` refuses a twenty-first, and § 3.3's contract row becomes *Start the
 * month again*. This step is then `undefined` rather than a button promising a day the record will
 * refuse, and the bar's own primary carries the player to the desk that has the renewal.
 */
export interface EverydayOnwardStep {
  readonly label: string;
  readonly note: string;
  /**
   * Which day the press opens — read by `reportScreen.ts` to pick the host call.
   *
   * A discriminator rather than the label, for `reportScreen.ts#primary`'s stated reason one
   * function down: the label is a *rendering* of this decision, and reading the destination back
   * out of a string makes where a button goes depend on how it is worded.
   */
  readonly goes: 'daily-tomorrow' | 'career-day' | 'career-desk' | 'week-sheet';
}

/**
 * **The one button on the close that closes the week** — swarm DN's Q2.3, lane AL-F,
 * [§ D1227](../../../../DECISIONS.md). The week's sheet was reachable only through *Your week*, a
 * screen the post-AK panel's seats found by accident, and its house line read *still being run*
 * for ten to thirty seconds because the house was asked only when the sheet was first read. The
 * close that closes the week now leads to the sheet, and each day's house run starts as that day
 * closes (`dev/main.ts#askWeekHouse`), so the sheet is ready when it is opened.
 */
export const WEEK_SHEET_STEP: EverydayOnwardStep = Object.freeze({
  label: 'See the week against the house',
  note: 'Opens this week’s sheet: your counted days beside the tower’s standing order on the same crowds. The next week starts from there.',
  goes: 'week-sheet',
});

/**
 * {@link WEEK_SHEET_STEP} for a week the census does not deal, which closes on Sunday since § D1394
 * (wave AO lane AO-5) and whose sheet sets no house beside the player.
 */
export const UNMEASURED_WEEK_SHEET_STEP: EverydayOnwardStep = Object.freeze({
  label: 'See the week’s sheet',
  note: 'Opens this week’s sheet: your seven days against its target. The next week starts from there.',
  goes: 'week-sheet',
});

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
    /**
     * The sheet's own small print, unedited — see the module docstring on what is *not* here.
     *
     * **Still one value, and that is load-bearing.** `honesty/surfaces.ts` seeds this field as a
     * single `role: 'reason'` string; {@link parts} is the same text laid out for reading, never a
     * replacement for it.
     */
    readonly body: string;
    /**
     * {@link body}, layered — issue #211. Joined by one space, in order, these *are* {@link body}.
     */
    readonly parts: readonly HonestyPart[];
    /** Where the question this sheet may not answer is answered, or `undefined` on an empty sheet. */
    readonly pointer: { readonly label: string; readonly why: string } | undefined;
  };
  /** § 6.5's one button into tomorrow, or `undefined` when there is nothing to advance from. */
  readonly tomorrow: EverydayOnwardStep | undefined;
  /**
   * Said when a **newer, unfiled** run stands on the stage — so a reader cannot take this sheet for
   * an account of the run they can currently see. `undefined` when the sheet and the stage agree.
   */
  readonly staleNote: string | undefined;
  /**
   * `shift/report.ts#PRACTICE_NOTE` when this sheet is a practice close — [§ D1138](../../../../DECISIONS.md)
   * clause 4: the first closed attempt at a day banks, and this is a later one. `undefined` on the
   * attempt that banked.
   */
  readonly practiceNote: string | undefined;
  /**
   * **A sandbox day's close: what it kept of the day, what it left out, and where the week is** —
   * wave AP lane AP-D2, [§ D1451](../../../../DECISIONS.md), the host's `sandboxDayLines`, drawn under
   * {@link practiceNote}. Empty on every sheet but a sandbox day's practice close.
   */
  readonly sandboxLines: readonly string[];
  /**
   * `shift/report.ts`'s target-met line on the close whose day met the week's target, drawn under
   * the verdict — swarm DN's Q2.2, [§ D1226](../../../../DECISIONS.md). `undefined` on every other
   * close.
   */
  readonly weekMark: string | undefined;
  /**
   * **What the close leads with** — wave AM, lane AM-C, swarm DO's § 1 ruling
   * ([§ D1246](../../../../DECISIONS.md) to [§ D1249](../../../../DECISIONS.md)): today against the
   * house with the week's tally, the call that decided it, the week's arithmetic and tomorrow in
   * full, drawn above the figures with the onward press under it. `undefined` where the input
   * carries no week (every caller but the daily report) and on a practice close.
   */
  readonly close: DayCloseView | undefined;
  /**
   * **What decided a career day** — wave AO, lane DS-2, [§ D1409](../../../../DECISIONS.md): the call
   * line graded on the contract's tests, then what decided the day where no call did
   * (`careerCalls.ts#careerCloseLineOf`). `undefined` on every sheet that is not a career day's, and
   * on a career day whose account has not been started.
   */
  readonly careerCall: string | undefined;
  /**
   * **Today again, as practice, beside the call that decided it** — wave AO, lane AO-4,
   * [§ D1388](../../../../DECISIONS.md), {@link REPORT_PRACTICE_AGAIN}. `undefined` except on the close of
   * a counted day an ordinary call decided; a pinned day's call keeps its own *Take this call again*.
   */
  readonly practiceAgain: { readonly label: string; readonly note: string } | undefined;
  /**
   * The two secondary presses beside the onward one on the close: *Your week* and the menu. Words
   * only; `reportScreen.ts` owns where each goes.
   */
  readonly secondary: { readonly week: string; readonly menu: string };
}

/**
 * **Today again, as practice** — wave AO, lane AO-4, [§ D1388](../../../../DECISIONS.md), the post-AN
 * panel's seat D: *Take this call again* is drawn only on the pinned Monday, so practising a day an
 * ordinary call decided was three screens deep (*Your week*, *Replay today's tower*, *Run today
 * again*). The close now offers it where it names the call. It is the whole day from its start: an
 * ordinary call is asked by the day's own calls from no presses (`dev/state.ts#dayCallsOpenOn`), so a
 * run opened at that call with the earlier answers carried would ask nothing, and the label says
 * *today*, never *this call*. A close of it is practice (§ D1138 clause 4), and its stage says so.
 */
export const REPORT_PRACTICE_AGAIN = Object.freeze({
  label: 'Play today again, as practice',
  note:
    'The same crowd from the start, under the driver the day began with and with nothing pressed, ' +
    'and the day asks its calls again as it reaches them. It banks nothing: your week keeps the day ' +
    'as you closed it.',
});

/** The close's two secondary presses — {@link EverydayReportView.secondary}. */
export const REPORT_SECONDARY = Object.freeze({ week: 'Your week', menu: 'Main menu' });

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
  /**
   * The Engineer tab strip's own words, keyed by tab — for {@link EverydayLeverCard.goLabel}.
   *
   * Supplied by `reportScreen.ts`, which reads them off the page rather than tabulating them: a
   * `Record<TabName, string>` in this repository would be a second copy of a label `index.html`
   * owns, stale the day somebody renames a tab. **Optional because a caller without a document
   * cannot honestly supply one** — the honesty corpus drives this function in Node — and a card
   * whose panel is not named says the narrower true thing instead of guessing at a name.
   */
  readonly panelNames?: Readonly<Partial<Record<TabName, string>>>;
  /**
   * The career this sheet is a day of, or `undefined` on every other flow — GitHub issue **#577**.
   *
   * Supplied by `reportScreen.ts` **only** where `context.ctx === 'campaign'`, because the run
   * context is the shell's fact and not this function's to infer. An absent value is *this is not
   * a career day*, so every existing caller — the daily loop, a replay, the honesty corpus,
   * `reportView.test.ts` — keeps the daily arm it has always had without passing anything.
   *
   * `day` is `CampaignTower.day`, which `campaign/career.ts#fileDay` has already advanced by the
   * time this sheet is drawn: closing the day is what moves it. So the number here is the day the
   * press would **open**, read off the record rather than computed as *the one on the sheet plus
   * one* — a second counter is the drift `runCampaignDay`'s own docstring refuses.
   */
  readonly career?: EverydayReportCareer | undefined;
  /**
   * The live week the sheet stands on, for the close's lead ({@link EverydayReportView.close}).
   * Supplied by `reportScreen.ts` on the daily flow only; absent everywhere else, which draws no
   * lead, so every existing caller is unchanged.
   */
  readonly week?: WeekState | undefined;
  /**
   * `EverydayHost.sandboxDayLines` — wave AP lane AP-D2, § D1451. Read only on a practice close, so a
   * stale session can put nothing on a counted day's sheet.
   */
  readonly sandbox?: readonly string[] | undefined;
  /** The shell's house runs per counted day — `EverydayHost.weekHouse`. Read only with {@link week}. */
  readonly house?: ((day: number) => HouseReading | undefined) | undefined;
  /**
   * The shell's driver run per counted day — `EverydayHost.weekDriverRun`, read only with
   * {@link week}, and only where the close's call line needs it (`shift/dayClose.ts#dayDeciderOf`,
   * wave AN, lane DQ-3, [§ D1351](../../../../DECISIONS.md)).
   */
  readonly driver?: ((day: number) => HouseReading | undefined) | undefined;
}

/** What a career sheet's onward step is drawn from — {@link EverydayReportInput.career}. */
export interface EverydayReportCareer {
  /** The open tower's building, by its authored display name. */
  readonly buildingName: string;
  /** `CampaignTower.day` — the day the next press would run. */
  readonly day: number;
  /**
   * Whether this contract still has a day to open, `campaign/career.ts#fileDay`'s own refusal.
   *
   * Passed in rather than derived here from `day` against `CONTRACT_DAYS`: the record's owner is
   * `campaign/`, and a second copy of *when is a month over* in a view module is two answers to a
   * question that decides whether a button lies.
   */
  readonly canRunAnother: boolean;
  /**
   * Whether the tower's renewal stands, so the next press belongs to the desk rather than to a day —
   * GitHub issue #582 item 3, [§ D1274](../../../../DECISIONS.md).
   *
   * `campaign/career.ts#needOf`'s own answer, passed in for {@link canRunAnother}'s reason: when a
   * renewal falls due is `campaign/`'s rule, and a view that re-derived it from `day` would be a
   * second copy of the rule that decides where a button goes.
   */
  readonly renewalDue: boolean;
  /**
   * The renewal still ahead, as `campaign/career.ts#renewalAheadSentenceOf` words it, on the sheets of
   * the contract's last running days — [§ D1357](../../../../DECISIONS.md). `undefined` on every other
   * sheet. Passed in for {@link renewalDue}'s reason: the date is `campaign/`'s rule.
   */
  readonly renewalAhead?: string | undefined;
  /**
   * The contract is lost, in `campaign/career.ts#contractLostSentenceOf`'s words, or `undefined` —
   * wave AO lane AO-5, [§ D1392](../../../../DECISIONS.md). Passed in for {@link renewalDue}'s
   * reason: when a contract is lost is `campaign/`'s rule. The step goes to the desk, where the
   * month is started again, and outranks a renewal, which a lost contract is not offered.
   */
  readonly contractLost?: string | undefined;
  /**
   * What decided the day, from `EverydayHost.careerCloseLine` — wave AO, lane DS-2,
   * [§ D1409](../../../../DECISIONS.md). Passed in for {@link renewalDue}'s reason: the runs are the
   * host's.
   */
  readonly call?: string | undefined;
}

/**
 * The sentence for a card that names no surface — a lever this build does not know how to route.
 *
 * Every shipped lever routes (see {@link LeverRoute}), so this is drawn only for a lever id
 * `shift/report.ts` has grown that {@link EVERYDAY_LEVER_ROUTES} has not, which is the honest
 * difference between *we did not wire it* and a blank card.
 */
const NO_SURFACE_NOTE =
  'No button here yet: this build does not know which screen carries this advice out.';

/**
 * The honesty a dispatcher lever's card keeps beside its button — GitHub issue #213.
 *
 * It is the old refusal's second sentence with the refusal taken out: the card sends the player to
 * the control the advice is about and says, on its face, that the sheet is not evidence the change
 * is better. `docs/10` R2 forbids the comparative claim, not the door.
 */
const DISPATCHER_LEVER_CAVEAT =
  'One day is not evidence that a different dispatcher is better. Try it, run tomorrow, and this ' +
  'sheet will say what it did; the bench is where the comparison gets settled properly.';

/**
 * Where each of `shift/report.ts`'s four levers goes — {@link LeverRoute}'s reasoning, as data.
 * Keyed on `ReportLever.id`, so a fifth lever arrives as a card with {@link NO_SURFACE_NOTE}
 * rather than a wrong door.
 */
export const EVERYDAY_LEVER_ROUTES: Readonly<Record<string, LeverRoute>> = Object.freeze({
  'add-a-car': { kind: 'everyday', screen: 'tuner' },
  'zone-the-tower': { kind: 'engineer', tab: 'building' },
  'weight-fairness': { kind: 'everyday', screen: 'workshop' },
  'ask-destination': { kind: 'everyday', screen: 'workshop' },
});

/** What the button says for an Everyday route — the screen named as the rail names it. */
const EVERYDAY_ROUTE_LABELS: Readonly<Record<'tuner' | 'workshop', string>> = Object.freeze({
  tuner: 'Open the sandbox',
  workshop: 'Open the dispatcher workshop',
});

/** The Everyday empty state. Names no Engineer control — § 16 rule 11's neighbouring rule. */
const EMPTY_LEDE =
  'No day has been closed yet, so there is nothing to report. Set up a day at the front door, ' +
  'watch it, and press Close the day — that is the only thing that writes this sheet.';

/* -------------------------------------------------------------------------- *
 * The closing block, layered — GitHub issue #211
 * -------------------------------------------------------------------------- */

/**
 * One piece of § 6.5's closing block.
 *
 * `open` is drawn as a paragraph and is always read. `fold` is a disclosure: its {@link handle} is
 * the layer's own first sentence — drawn always, and the thing a reader presses — and its
 * {@link paragraphs} are what opens. **The handle is a sentence of the block rather than a label
 * this screen wrote**, which is why the layering adds no string a player can read and the honesty
 * corpus has nothing new to sweep.
 */
export type HonestyPart =
  | { readonly kind: 'open'; readonly text: string }
  | {
      readonly kind: 'fold';
      readonly handle: string;
      /** Never empty — a fold with nothing behind it is a control that does nothing. */
      readonly paragraphs: readonly string[];
    };

/**
 * **The stated length budget for this copy slot** — issue #211's first acceptance criterion, for
 * the one slot this lane owns.
 *
 * Both numbers are ceilings rather than targets, and they are held by a case in
 * `reportView.test.ts` over a **real** sheet rather than a fixture — the whole point of a budget is
 * that it is measured against the copy that actually ships.
 *
 * - `open` is every word drawn before a reader presses anything: the open paragraph plus each
 *   fold's handle. On the measured day that is 91 of 335.
 * - `paragraph` is the ceiling for any one block of prose, opened or folded. It is what stops the
 *   fix from being *one shorter wall and one longer one*.
 */
export const SMALL_PRINT_BUDGET = Object.freeze({ open: 110, paragraph: 70 });

/**
 * **The stated length budget for a figure card's note** — GitHub issue #211's other slot.
 *
 * A card's note is `mode/casualDay.ts#casualNoteFor`'s lead plus the engineer's own caption, which
 * on the stairs card is 70 words under a value of `0`. The budget is the number of words drawn
 * before a reader presses anything; a note inside it is drawn whole, and a note over it is drawn
 * as its first sentence with the rest one press away ({@link figureNotePartsOf}). Twenty-four is
 * two lines of the card's own width at its type size, which is what a reader scans under a figure
 * before deciding whether to read on.
 */
export const FIGURE_NOTE_BUDGET = Object.freeze({ open: 24 });

/** The handle on a folded card note — a verb, because it is a control, and never a summary of the fold. */
export const FIGURE_NOTE_HANDLE = 'Read the rest';

/**
 * A card note as a lead and the rest, or the note whole.
 *
 * `rest` is `undefined` when the note is inside {@link FIGURE_NOTE_BUDGET} or is one sentence —
 * a disclosure whose handle is its whole content reveals nothing, `foldOf`'s own rule. Joined with
 * one space, `lead` and `rest` are the note byte for byte, which `reportView.test.ts` holds over
 * every card of a real sheet: nothing is deleted or re-ordered, and the corpus keeps reading the
 * whole string because the split happens at the renderer and the producer is unchanged.
 */
export function figureNotePartsOf(note: string): { readonly lead: string; readonly rest: string | undefined } {
  const sentences = sentencesOf(note);
  if (sentences.length < 2 || wordsIn(note) <= FIGURE_NOTE_BUDGET.open) return { lead: note, rest: undefined };
  const [lead, ...tail] = sentences;
  return { lead: lead ?? note, rest: tail.join(' ') };
}

/**
 * Sentences, split on the space between them and on nothing else.
 *
 * The lookahead is what keeps `06:05–06:10:` and `“Riders waited twenty-five seconds on average”`
 * inside their own sentences: a split needs a terminator behind it *and* a capital or an opening
 * quote in front. Joined back with one space this is the input exactly, which is the property
 * every case downstream of it rests on.
 */
function sentencesOf(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/(?<=[.!?][”’"']?) (?=[“"'(A-Z])/u);
}

const wordsIn = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

/** Sentences gathered into paragraphs, each under the budget unless one sentence exceeds it alone. */
function grouped(sentences: readonly string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const length = wordsIn(sentence);
    if (current.length > 0 && words + length > SMALL_PRINT_BUDGET.paragraph) {
      groups.push(current);
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

const paragraphed = (sentences: readonly string[]): string[] =>
  grouped(sentences).map((group) => group.join(' '));

/**
 * A layer the mode wraps the sheet in, folded behind its own opening sentence.
 *
 * A single-sentence layer comes back `open`: a disclosure whose handle is the whole of its content
 * is a control that reveals nothing, which is the *dead seam* shape one level down from where this
 * repository usually finds it.
 */
function foldOf(text: string): HonestyPart | undefined {
  const [handle, ...tail] = sentencesOf(text);
  if (handle === undefined) return undefined;
  if (tail.length === 0) return { kind: 'open', text: handle };
  return { kind: 'fold', handle, paragraphs: paragraphed(tail) };
}

/**
 * The sheet's own words: its opening paragraph drawn, the rest folded behind its next sentence.
 *
 * The opening paragraph is where the refusal lives, and it is the one part of this block that may
 * not be behind a press — see the module docstring's rule 3.
 */
function sheetPartsOf(core: string): HonestyPart[] {
  const groups = grouped(sentencesOf(core));
  const lead = groups[0];
  if (lead === undefined) return [];
  const rest = groups.slice(1).flat();
  const tail = foldOf(rest.join(' '));
  return [{ kind: 'open', text: lead.join(' ') }, ...(tail === undefined ? [] : [tail])];
}

/**
 * {@link EverydayReportView.honesty}`.body`, laid out — and the seam is derived rather than matched.
 *
 * `reportViewOf` composes Casual's block as `${lead} ${core} ${reach}` with `core` — the shaped
 * sheet's own `smallPrint` — sitting between them **byte for byte**, which is § D299's rule and the
 * thing `dev/reportPanel.ts:1461` exists to state. So `indexOf` finds the sheet's words inside the
 * block and the two wings fall out of the slices, without this module knowing a word of either.
 *
 * When it is not found — the Engineer register, where the block *is* the core, or a mode that
 * one day composes differently — the whole block is laid out as one block. That is the safe
 * direction: fewer folds, never a lost sentence.
 */
function honestyPartsOf(body: string, core: string | undefined): HonestyPart[] {
  const at = core === undefined || core.trim() === '' ? -1 : body.indexOf(core);
  if (at < 0 || core === undefined) return sheetPartsOf(body);
  const front = foldOf(body.slice(0, at));
  const back = foldOf(body.slice(at + core.length));
  return [
    ...(front === undefined ? [] : [front]),
    ...sheetPartsOf(core),
    ...(back === undefined ? [] : [back]),
  ];
}

/* -------------------------------------------------------------------------- *
 * The lever hand-off — GitHub issue #213
 * -------------------------------------------------------------------------- */

/**
 * What a routed lever's button says — **authored here rather than in the mount, deliberately.**
 *
 * `honesty/derive.test.ts` excludes `everyday/reportScreen.ts#REPORT_SCREEN` from the sweep on the
 * DOM mounts' shared ground, on the stated understanding that *what the four mounts author of their
 * own is geometry, class names and floor labels*. This string is none of those: it is a claim about
 * what pressing a button does, and it was being composed inside the one half of this screen no
 * sweep reads. That is why issue #213's defect survived — a button promising *the Building panel*
 * while its handler opened the Everyday day stage was swept by nothing.
 *
 * It reaches the view as {@link EverydayLeverCard.goLabel} rather than as an exported function of
 * its own, which is not a style choice: a second exported text producer in this module would be a
 * declaration `honesty/surfaces.ts` has to name in an adapter, and this lane may not edit that
 * file — `derive.test.ts` fails on an unclassified producer, which is the guard working. On the
 * card it is inside `everydayReportViewOf`, which that adapter already covers, so seeding it is one
 * line in a loop `surfaces.ts` already walks.
 *
 * The panel's name is still **read from the Engineer tab button in the page** rather than tabulated
 * (see `reportScreen.ts`' docstring), so it arrives as a string that may be absent; with no such
 * button the label names the simulator without naming a panel, which is a narrower claim rather
 * than a wrong one, and is exactly what the press then does.
 */
function leverButtonLabel(panel: string | undefined): string {
  return panel === undefined || panel === ''
    ? 'Open the simulator'
    : `Open the simulator’s ${panel} panel`;
}

/**
 * § 6.5's one button into tomorrow, in whichever flow this sheet belongs to — GitHub issue #577.
 *
 * The career arm wins where there is a career, and it does not consult `canAdvance`: that flag is
 * the **week's** — `WeekFramingView.canAdvance` is *is there a day after this one in the seven* —
 * and a contract's twenty days are not a week's seven. A standing renewal sends the press to the
 * desk instead of a day ({@link EverydayReportCareer.renewalDue}, § D1274), and a career whose month
 * is over with no renewal standing draws nothing here, which is
 * {@link EverydayReportCareer.canRunAnother} and is a different refusal for a different record.
 *
 * Both notes say what the press does **and** where it leaves you, because the whole of #577 is a
 * player who could not tell those two apart. The career note names the career; the daily note says
 * the week is where it stays.
 */
function onwardStepOf(
  career: EverydayReportCareer | undefined,
  filed: boolean,
  canAdvance: boolean,
  nextDayLabel: string,
  weekClosed = false,
  weekStep: EverydayOnwardStep = WEEK_SHEET_STEP,
): EverydayOnwardStep | undefined {
  /*
   * An unfiled sheet advances from nothing, on either flow. The screen returns before this block
   * is drawn, so this guard is the value being honest rather than the control being gated twice —
   * an adapter that rendered the empty state would otherwise read a step off a sheet that is not
   * there. `canAdvance` already carries it on the daily arm; the career arm does not consult
   * `canAdvance`, so it has to carry it here.
   */
  if (!filed) return undefined;
  if (weekClosed && career === undefined) return weekStep;
  if (career !== undefined) {
    /*
     * **The renewal comes before the next day, and the step says so** — GitHub issue #582 item 3,
     * [§ D1274](../../../../DECISIONS.md). This arm used to offer *Open the doors on day 19* on day
     * 18's sheet, and the press ran day 19 past a renewal the building's desk will not run a day
     * over. It goes to the desk instead, and its note is the line that says the renewal has come,
     * on the sheet of the day before it. Checked before {@link EverydayReportCareer.canRunAnother}
     * because a month that has run out still has its renewal standing, and the desk is where that
     * is answered.
     */
    /*
     * Since [§ D1357](../../../../DECISIONS.md) the renewal stands once day 20 has closed, so this arm
     * is day 20's sheet (and any later one), and the note names the day that waits on the answer.
     */
    if (career.contractLost !== undefined) {
      return {
        label: `Open the desk at ${career.buildingName}`,
        note: `${career.contractLost} No more of its days run. This opens the building’s desk, where the month can be started again. You stay in the career.`,
        goes: 'career-desk',
      };
    }
    if (career.renewalDue) {
      return {
        label: `Answer the renewal at ${career.buildingName}`,
        note:
          'Day 20 has closed and the contract is up for renewal. The next month’s first day does not ' +
          'run until it is answered. This opens the building’s desk, where the offer is. You stay in ' +
          'the career.',
        goes: 'career-desk',
      };
    }
    if (!career.canRunAnother) return undefined;
    return {
      /*
       * The day and the building, both. *Open the doors on day 4* alone would be true and would
       * still not say which of a career's buildings it is a day of, and the sheet a player is
       * reading is a sheet about one tower.
       */
      label: `Open the doors on day ${String(career.day)} at ${career.buildingName}`,
      /*
       * Days 19 and 20 play, and the sheets of day 18 and day 19 say when the renewal falls due: the
       * line #582 asked for on the sheet before it, on its true date (§ D1357).
       */
      note:
        career.renewalAhead === undefined
          ? 'Runs the next day of this contract. You stay in the career.'
          : `Runs the next day of this contract. ${career.renewalAhead} You stay in the career.`,
      goes: 'career-day',
    };
  }
  /*
   * *Opens tomorrow's day and starts it* stood here, and the press opens tomorrow's brief: the day's
   * one scored attempt starts at *Start the day* there (§ D1218), so the note said a thing the press
   * does not do (swarm DO's S2, sentence 1; the post-AL panel's seats A, B and D).
   */
  return canAdvance
    ? {
        label: nextDayLabel,
        note: 'Opens tomorrow’s brief, where you set the day up and start it. Today stays in your week exactly as it is.',
        goes: 'daily-tomorrow',
      }
    : undefined;
}

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
  /*
   * **A career day's headline is the contract's mark** — wave AP lane AP-D2, § D1452. The sheet a
   * career close files is graded on the contract's four tests (`host.ts#closeDay`), so its verdict is
   * the mark the career files; the headline says whose tests it is, and the goal rows are headed as
   * the contract's.
   */
  const verdict = input.report?.verdict;
  const careerSheet =
    input.career === undefined || !sheet.filed
      ? sheet
      : {
          ...sheet,
          verdictLine: verdict === 'cleared' || verdict === 'missed' ? CAREER_VERDICT_LINES[verdict] : sheet.verdictLine,
          goalsHeading: CAREER_GOALS_HEADING,
        };
  return {
    filed: sheet.filed,
    emptyLede: sheet.filed ? undefined : EMPTY_LEDE,
    sheet: careerSheet,
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
    levers: sheet.levers.map((lever) => {
      const route = EVERYDAY_LEVER_ROUTES[lever.id];
      const surface = route?.kind === 'engineer' ? route.tab : undefined;
      return {
        title: lever.title,
        body: lever.body,
        surface,
        route,
        goLabel:
          route === undefined
            ? undefined
            : route.kind === 'engineer'
              ? leverButtonLabel(input.panelNames?.[route.tab])
              : EVERYDAY_ROUTE_LABELS[route.screen],
        caveat: route?.kind === 'everyday' && route.screen === 'workshop' ? DISPATCHER_LEVER_CAVEAT : undefined,
        noSurfaceNote: route === undefined ? NO_SURFACE_NOTE : undefined,
      };
    }),
    honesty: {
      title: 'This was one day',
      body: sheet.smallPrint,
      parts: honestyPartsOf(sheet.smallPrint, input.report?.smallPrint),
      pointer:
        sheet.nextStep === undefined
          ? undefined
          : { label: sheet.nextStep.label, why: sheet.nextStep.why },
    },
    tomorrow: onwardStepOf(
      input.career,
      sheet.filed,
      canAdvance,
      framing.kind === 'week-day' ? framing.nextDayLabel : '',
      framing.kind === 'week-day' && framing.weekClosed === true,
      /* No house beside a week the census does not deal (§ D1394), so its step does not name one. */
      input.week !== undefined && weekDealOf(input.week) === undefined ? UNMEASURED_WEEK_SHEET_STEP : WEEK_SHEET_STEP,
    ),
    staleNote: input.newerRunOnStage
      ? 'A newer run is standing on the stage and has not been closed. This sheet is the last day ' +
        'you closed, not that run — close the day to replace it.'
      : undefined,
    practiceNote: framing.kind === 'week-day' ? framing.practiceNote : undefined,
    sandboxLines: framing.kind === 'week-day' && framing.practiceNote !== undefined ? (input.sandbox ?? []) : [],
    weekMark: framing.kind === 'week-day' ? framing.weekMark : undefined,
    practiceAgain:
      input.week !== undefined &&
      input.career === undefined &&
      input.report?.of === 'week-day' &&
      input.report.callDecided === true &&
      input.report.practiceNote === undefined &&
      !input.report.diagnosis.some((entry) => entry.id === PRESS_CALL_ROW_ID)
        ? REPORT_PRACTICE_AGAIN
        : undefined,
    close:
      input.week === undefined || input.report?.of !== 'week-day' || input.career !== undefined
        ? undefined
        : dayCloseOf({
            week: input.week,
            report: input.report,
            houseOf: input.house ?? (() => undefined),
            driverOf: input.driver,
            population: input.overnight?.population,
            onward: input.overnight?.onward,
          }),
    careerCall: input.career?.call,
    secondary: REPORT_SECONDARY,
  };
}
