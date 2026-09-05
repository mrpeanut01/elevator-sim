/**
 * **Two surfaces, one state, one figure** — the question the other nine properties cannot ask.
 *
 * ## Why this exists, and why an axis would not have done
 *
 * [`DECISIONS.md` § D359](../../../../DECISIONS.md) closed a defect this corpus could not have
 * caught. `shift/goals.ts#goalsForDay` grew a horizon parameter and **one of its four callers
 * passed it**, so after a whole authored day the Everyday rail graded the run against a **460 s**
 * worst-wait ceiling and the Engineer rail, one door away and about the same run, graded it against
 * **230 s**. Neither figure was wrong on its own. Publishing both about one run is what
 * `TEST_MATRIX.md` T1's *figures consistent* clause forbids, and § D359 wrote the diagnosis down:
 *
 * > all nine `PROPERTY_CHECKS` are predicates over **one case's rendered strings**, and each
 * > surface was internally honest either way. **The corpus has no property that gives two surfaces
 * > one state and asks whether they agree.**
 *
 * A `horizon` axis on the sweep would not have helped: it would drive each adapter over both kinds
 * of run and produce two internally-honest corpora, comparing neither. What is missing is a
 * property of a different **shape** — one that renders a single state through a declared *pair* of
 * shipped expressions and asserts that a named figure means the same thing in both.
 *
 * ## The pairs are declared, never inferred
 *
 * Two surfaces naming the same figure by coincidence is not a contract, and a property that
 * inferred pairs from name collisions would flag the batch's tuning figures against its hold-out
 * figures ([§ D355](../../../../DECISIONS.md), § D360) and a live figure against a whole-run fold
 * (`docs/10` R6) — all of which are *supposed* to differ. So {@link AGREED_FIGURES} is a register in
 * the idiom `derive.test.ts#NOT_PLAYER_FACING` already uses: every pair names both sides, names the
 * one figure claimed identical, and carries the reason it is a contract. A property that had to be
 * *weakened* to stop firing on those would be worse than no property.
 *
 * **The other half of the register is `agreement.test.ts#NOT_AGREED`**, and it is in the test file
 * for the reason `NOT_PLAYER_FACING` is: nothing outside a test can call a list of refusals, and
 * `deadCode.test.ts` says so out loud — it went red on this constant while it lived here, which is
 * the standing requirement doing its job on the instrument built to serve it. It holds the pairs
 * that were considered and rejected, each classified as *legitimately differing*, *a tautology*, or
 * *a real contract not built here*, with the argument attached.
 *
 * ## What a side is
 *
 * A side is a **shipped expression**, named `<module>#<export>` exactly as a violation names a
 * surface, plus a function that reads the figure out of it. The expression is imported by this
 * module, so a side whose function is deleted or renamed does not compile; the *string* is checked
 * against the source tree by `agreement.test.ts`, which is the half a rename can rot silently.
 *
 * ## What this module does **not** derive
 *
 * The horizon. `runHorizonOf` is § D359's one expression and each side reaches it through its own
 * shell; a copy here would be the defect arriving inside the instrument built to find it — § D159's
 * second false-negative variant, which `run.ts#recordingConfigFor` refuses for the same reason.
 * What this module *does* build is the **state**: `wholeDayFor` plus `wholeDayRun` is the same pair
 * `everyday/host.ts#dayPatchFor` composes when a player presses Run, and constructing the state a
 * player reaches is not the same act as deciding what kind of run it is.
 *
 * ## Cost
 *
 * No simulation. Every figure in the register is a function of the **state** rather than of a
 * recording — the ask a screen publishes, not the reading it takes — so the pairs are driven over
 * states built from the case's own building and cost arithmetic. That is deliberate rather than
 * incidental: `shift/dayLength.ts` measures a whole authored day at 3.5 s / 32 MB a replication on
 * Midtown Office and 9.2 s / 145 MB on Vertical City, against an always-on tier bounded at roughly
 * 200 s, so a property that needed a whole-day *run* would have belonged in the deep tier or
 * nowhere.
 *
 * ## What this still cannot see, said plainly
 *
 * **Any disagreement between two surfaces that are not a declared pair.** This is a register, and a
 * register covers what it names. The property is not a general equality check and must not become
 * one — `agreement.test.ts#NOT_AGREED`'s three `legitimately-differs` entries are figures that
 * would fire on every case if it did.
 *
 * **A disagreement that both sides reach through one object.** Two formatters over one
 * `Observations` cannot differ, so a defect *upstream* of that object — a wrong fold, a wrong
 * window — is invisible here and stays R3's and R6's to catch. `NOT_AGREED`'s two `tautology`
 * entries are the measured instances.
 *
 * **A disagreement in a figure no side can reach without a run.** One is named in `NOT_AGREED`
 * under `not-built-here`, with what it would take; it is a real contract and nothing checks it
 * today. *A closed day* used to be on that list beside *a run*, and it is not any more:
 * {@link withTodayFiled} files one with `record: null` — a shipped `DayOutcome`, not a stub — so a
 * career surface is drivable here with nothing simulated. That is what issue #214's pair stands on,
 * and `NOT_AGREED`'s remaining entry is narrowed to the half that is still true.
 *
 * **A disagreement between a shipped surface and a shipped *mount*.** Every side here is a pure
 * expression, because `boundaries.test.ts` confines the DOM to `dev/` and this directory runs under
 * Node. A mount that drew a figure its own model did not produce would pass this property, and the
 * browser tier is where that lives.
 */

import type { BrowserResources } from '../dev/data.js';
import { SIGNED_OUT, signedIn, type AccountState } from '../menu/account.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import { buildingConfigOf, initialState, type ViewerState } from '../dev/state.js';
import { createEverydayHost, type EverydayHostBindings } from '../everyday/host.js';
import { railFooter } from '../everyday/rail.js';
import { settingsScreenViewOf } from '../everyday/settingsView.js';
import { weekScreenViewOf } from '../everyday/weekView.js';
import { wholeDayFor, wholeDayRun } from '../shift/dayLength.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import type { GoalObservations, WeekState } from '../shift/types.js';
import { closeDay, outcomeOf } from '../shift/week.js';

import type { HonestyContext } from './surfaces.js';
import type { HonestyViolation, RenderedText } from './types.js';

/* -------------------------------------------------------------------------- *
 * The state a pair is driven over
 * -------------------------------------------------------------------------- */

/**
 * One state both sides of every pair are rendered from.
 *
 * A `ViewerState` rather than a recording, because the figures in the register are **asks** — what
 * a screen says today wants — and an ask is a function of the state. See the module docstring's
 * *Cost* section for why that is the design and not a shortcut.
 */
export interface AgreementView {
  /**
   * `day1/period`, `day4-filed/whole-day`. Stable, so a violation names a state a reader can
   * rebuild.
   *
   * The id is the whole of what a view declares about itself, deliberately: a prose `what` field
   * sat here for one revision with no consumer but a test, which is the one-field-one-consumer rule
   * `docs/10` § 1 states and the shape this repository counts. The halves — which arm of
   * {@link AGREEMENT_ARMS}, which horizon — are what a reader needs and are both in the id.
   *
   * **The horizon stays the second segment.** `agreement.test.ts` reads it off `split('/')[1]` to
   * assert that both kinds of run are reached, which is the clause that keeps § D359's pair from
   * going vacuous, so a third dimension goes into the first segment or it silently breaks that
   * check.
   */
  readonly id: string;
  readonly state: ViewerState;
  readonly resources: BrowserResources;
  /**
   * Whether **today's** run has been filed — `EverydayHost.runState().dayClosed`, as a fact about
   * this state rather than about the week inside it.
   *
   * It is on the view rather than derived from `state.week` because it is not derivable from it,
   * and that is § 16 rule 1 in one sentence: a week restored from storage can carry today's outcome
   * while the stage holds no filed run, and *Close the day* alone sets this. Both career surfaces
   * gate today's figure on it — through **different** expressions, which is why they are a pair —
   * so a harness that guessed it would be choosing the answer.
   */
  readonly dayClosed: boolean;
  /**
   * The session, or `undefined` — `everyday/accountPort.ts#everydayAccount()`, as a fact about this
   * state.
   *
   * On the view rather than a constant inside a side, because both sides must be handed the **same**
   * account or the pair would be comparing two states and calling the difference a disagreement.
   * The three arms carry three different ones, which is what makes the `display-name` pair
   * discriminating rather than a claim about one fixture — see {@link AGREEMENT_ARMS}.
   */
  readonly account: AccountState | undefined;
}

/**
 * The device-local identity every view carries — [§ D490](../../../../DECISIONS.md)'s other name.
 *
 * A real one rather than `undefined`, and that is the whole of what makes the mint arm a test: with
 * nothing stored both names would fall back to `DEFAULT_EVERYDAY_PROFILE`'s `you` and a side that
 * had adopted the server's mint would be indistinguishable from one that had not.
 */
const DEVICE_IDENTITY = Object.freeze({ name: 'A player', avatarColor: '#4F8A5B' });

/* -------------------------------------------------------------------------- *
 * The register
 * -------------------------------------------------------------------------- */

/** One side of a declared pair: a shipped expression, and how to read the figure out of it. */
export interface AgreementSide {
  /** `<module>#<export>` — the expression this side reads, named as a violation names a surface. */
  readonly surfaceId: string;
  /**
   * The figure as this side publishes it, or `undefined` where this side does not publish it here.
   *
   * `undefined` is a fact about the state, not a pass: a pair on which **one** side publishes and
   * the other does not is reported, because one screen carrying a figure the other drops is the
   * disagreement in its starkest form.
   */
  read(view: AgreementView): string | undefined;
}

/** One declared contract: two surfaces, one figure, and the reason the two must match. */
export interface AgreedFigure {
  /** Stable id, printed in every violation this pair produces. */
  readonly id: string;
  /** The figure claimed identical, named the way a player would name it. */
  readonly figure: string;
  /**
   * Why these two must agree — the half that stops the register becoming a list of coincidences.
   *
   * Long enough to be an argument. `agreement.test.ts` holds it to the same floor
   * `derive.test.ts` holds a `NOT_PLAYER_FACING` reason to.
   */
  readonly why: string;
  readonly left: AgreementSide;
  readonly right: AgreementSide;
}

/**
 * **The declared pairs.** Two surfaces, one state, one figure, and a reason.
 *
 * Three pairs were put to the lane that built this register as *known to matter*; **one landed and
 * two were measured as tautologies**, with the measurement written into
 * `agreement.test.ts#NOT_AGREED` rather than left for the next lane to redo. A rejected pair with a
 * reason is worth more than a property with a fake one in it.
 *
 * The second entry is issue **#214**'s, and it arrived with the state it needs: the corpus reached
 * no week with a closed day in it, so a pair declared over the career line would have compared two
 * absences on every case and passed for the wrong reason. See {@link withTodayFiled} and
 * {@link AGREEMENT_ARMS}.
 */
export const AGREED_FIGURES: readonly AgreedFigure[] = Object.freeze([
  {
    id: 'today-asks',
    figure: "what today asks — the four goal bars, as each shell's rail publishes them",
    why:
      "Both products put today's goals in front of the same player, one door apart, about one " +
      'run. `shift/goals.ts#goalsForDay` takes the day **and what kind of run today is**, and the ' +
      'second argument is the one a caller can forget: forgetting it compiles, draws, and grades ' +
      'a ten-hour run against a thirty-minute ceiling. That is not hypothetical — it shipped, and ' +
      '§ D359 is the repair. The two sides here are the two shells’ own derivations, reached ' +
      'through their own code rather than through a shared array, so the pair fails exactly when ' +
      'one shell stops asking `shift/dayLength.ts#runHorizonOf` and the other keeps asking it. ' +
      'The whole ask is compared rather than the ceiling alone, because the ladder that hardens ' +
      'the other three bars is horizon-blind today and a future bar that is not would otherwise ' +
      'diverge unwatched.',
    left: {
      surfaceId: 'dev/leftRail.ts#shiftGoalsOf',
      read: (view) => asksOf(shiftGoalsOf(view.state, view.resources).map((goal) => goal.label)),
    },
    right: {
      surfaceId: 'everyday/host.ts#createEverydayHost',
      read: (view) =>
        asksOf(
          createEverydayHost(hostBindingsFor(view))
            .goalsToday()
            .map((reading) => reading.goal.label),
        ),
    },
  },
  {
    id: 'career-line',
    figure: 'the days saved so far — the career line § 3.2’s rail card and § 14’s header publish',
    why:
      'Issue **#214** is this pair disagreeing. The `PLAYING AS` card said *no days saved yet* ' +
      'beside a Your week header reading *1 day running*, because the card took its career from ' +
      '`everyday/profileStore.ts` — a store that holds a name and a colour and has no day count ' +
      'to hold — so the refusal was the only string that line could render. Both screens are one ' +
      'click apart in the same rail, about the same week, and the fix pointed the card at the ' +
      'store that keeps days. What holds it there is not the fix: the two lines are **separate ' +
      'derivations** over one `WeekState`, and they gate today’s figure differently — ' +
      '`rail.ts#careerLineOf` asks whether any day in the `HISTORY_DAYS` window is `day < ' +
      'week.day || dayClosed`, and `weekView.ts#streakLineOf` takes a count off cards whose own ' +
      'gate is `!isToday || dayClosed`. Five asserted unit weeks in `rail.test.ts` hold the two ' +
      'equal, which is a claim about five weeks; this is the claim over every case in the corpus, ' +
      'and it is the one a player reading both surfaces on one frame is actually owed. The whole ' +
      'line is compared rather than the streak alone, because the withheld arm — `best —` — is ' +
      'exactly where the two gates could part.',
    left: {
      surfaceId: 'everyday/rail.ts#railFooter',
      read: (view) =>
        hasACareer(view)
          ? railFooter(
              { screen: 'menu', ctx: 'daily' },
              { week: view.state.week, dayClosed: view.dayClosed },
            ).identity.streak
          : undefined,
    },
    right: {
      surfaceId: 'everyday/weekView.ts#weekScreenViewOf',
      read: (view) =>
        hasACareer(view)
          ? weekScreenViewOf({
              week: view.state.week,
              /*
               * Today's card carries it; the streak line does not. Named from the state anyway,
               * because a harness that passed a placeholder would be building a week no player is
               * in — and the next figure added to this pair might read it.
               */
              towerToday: view.state.buildingId,
              dayClosed: view.dayClosed,
              // The shipped pairing: a sheet stands exactly when the day is closed. The
              // two-can-disagree arm is `weekView.test.ts`'s, where it is a claim about a control.
              sheetStanding: view.dayClosed,
            }).streakLine
          : undefined,
    },
  },
  {
    id: 'display-name',
    figure: 'what the player is called — the name § 3.2’s rail card and § 15.1’s field publish',
    why:
      '[§ D490](../../../../DECISIONS.md) is this pair, written down before the code. Two names ' +
      'exist in this build — `everyday/profile.ts#EverydayProfile.name`, device-local and sent ' +
      'nowhere, and `menu/client.ts#AccountSummary.displayName`, minted `player-<12 hex>` and what ' +
      'a board row shows — and § 15.1 asserts they are one thing. While nothing on the Everyday ' +
      'side posted they never met, so the settings screen’s own note about where the name appears ' +
      'was **unfalsifiable rather than true**, which is § D227’s shape aimed at the one parameter ' +
      '§ 15.1 makes load-bearing. GitHub issue #332 ends that. The two sides are one click apart in ' +
      'one rail and both publish this string, and either could read `profile.name` directly and be ' +
      'internally honest while the product said two things about who the player is — § D359’s exact ' +
      'signature and the one `properties.ts` cannot see. What the pair catches is not this commit ' +
      'being wrong: it is a later reader dropping the ask to ' +
      '`everyday/profile.ts#effectiveNameOf`, which compiles, draws, and is wrong only on the ' +
      'arms where a session exists. The **mint** arm is why it is not a tautology — a side that ' +
      'took `displayName` unconditionally publishes `player-…` there while the other publishes the ' +
      'device-local name, which is precisely the sign-in-costs-you-something defect § D490 refuses.',
    left: {
      surfaceId: 'everyday/rail.ts#railFooter',
      read: (view) =>
        railFooter(
          { screen: 'settings', ctx: 'daily' },
          { profile: DEVICE_IDENTITY, account: view.account },
        ).identity.name,
    },
    right: {
      surfaceId: 'everyday/settingsView.ts#settingsScreenViewOf',
      read: (view) =>
        settingsScreenViewOf({
          profile: DEVICE_IDENTITY,
          account: view.account,
          // The account block's arm does not move this figure; it is named from the state anyway,
          // because a harness passing a placeholder would be building a screen no player is on.
          accountServer: view.account !== undefined,
        }).you.nameValue,
    },
  },
]);

/**
 * Whether the `career-line` contract **applies** to this state — the pair's one scoping rule.
 *
 * ## Why a week with no closed day is out of scope rather than a violation
 *
 * On such a week the two surfaces say different things **and both are right**. The rail card draws
 * `rail.ts#NO_CAREER_YET` — a sentence with no digit in it, because § 20.11 forbids a fixture
 * presented as a player and *0 days running · best —* is one — while § 14's header draws the
 * week's zeroes, which is what a screen made of seven day cards is for. That is one screen refusing
 * a figure and another publishing it, not two answers to one question. Requiring them equal would
 * force the rail to drop its absence, which `rail.ts`'s own rule 4 calls *the same defect facing
 * the other way*, and a property that had to be weakened later is worse than one scoped honestly
 * now.
 *
 * ## Why one gate and not one per side
 *
 * Both sides ask this, so the pair is either fully present or fully absent and
 * {@link checkSurfacesAgree}'s *one side dropped it* clause cannot fire on a state that is merely
 * out of scope. Sharing the **scope** is not sharing the **derivation**: what is compared is still
 * two expressions reached through two shells, and the gate below reads neither of them — it reads
 * the week.
 *
 * {@link AGREEMENT_ARMS} keeps this from swallowing the pair: `agreement.test.ts` asserts that the
 * in-scope arms are reached on every fixture case, because a register entry that is out of scope
 * everywhere is byte-identical to one that is not declared.
 */
function hasACareer(view: AgreementView): boolean {
  return view.state.week.history.length > 0;
}

/* -------------------------------------------------------------------------- *
 * Reading a side
 * -------------------------------------------------------------------------- */

/** The four asks as one string, in the order the shell publishes them. `undefined` when empty. */
function asksOf(labels: readonly string[]): string | undefined {
  return labels.length === 0 ? undefined : labels.join(' · ');
}

/**
 * The Everyday host over a state and nothing else.
 *
 * Every binding a *read* needs is here and every binding that would **write** throws, which is the
 * point rather than laziness: this harness renders, and a side that quietly ran the day would be
 * comparing two different runs. `createEverydayHost` is pure over its bindings — it reads
 * `state()` fresh on every call — so a stub is the whole of what the shell needs to answer
 * `goalsToday()`.
 */
function hostBindingsFor(view: AgreementView): EverydayHostBindings {
  const refuse = (what: string) => (): never => {
    throw new Error(`the agreement harness renders and does not ${what}`);
  };
  return {
    resources: view.resources,
    state: () => view.state,
    playheadS: () => 0,
    // The view's own, not a constant: it is the state's fact, and a harness that answered a
    // different one from the side beside it would be two states pretending to be one.
    dayClosed: () => view.dayClosed,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: refuse('start a run'),
    intervene: refuse('intervene'),
    closeDay: refuse('close the day'),
    openRunTab: refuse('open a tab'),
    applyPatch: refuse('patch the state'),
    /*
     * § 7.4's rival splits the same way the six above do: the **read** answers the true state of a
     * harness that has raced nobody, and the **press** refuses, because commissioning a second
     * simulation is exactly the *quietly ran the day* this stub exists to make impossible.
     */
    ghostRace: () => ({ pick: 'none', rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: refuse('race a rival'),
    /*
     * § 14.1's five presses refuse on the same ground as the four above — GitHub issue #182. The
     * sixth is a **read** and answers `undefined`: this harness renders one state, and no state it
     * is given is a spectator's, so *nobody is being watched* is the true answer rather than a stub.
     */
    loadReferenceRuns: () => Promise.resolve([]),
    simulateRecord: refuse('simulate a record'),
    enterWatch: refuse('enter a watch'),
    stopWatching: refuse('stop a watch'),
    playThisCrowd: refuse('play a watched crowd'),
    watching: () => undefined,
    /* No page, so no API origin, so nothing to ask — the honest no-server arm. */
    dailyBoard: undefined,
    onChange: () => () => undefined,
  };
}

/* -------------------------------------------------------------------------- *
 * The states
 * -------------------------------------------------------------------------- */

/**
 * One clean authored day, as an observation — the input {@link withTodayFiled} grades.
 *
 * Values rather than a run, because this module does not simulate (see the *Cost* section): a day
 * that files is a `DayOutcome`, and a `DayOutcome` is `outcomeOf` over readings. The numbers are a
 * plausible clean shift and nothing here reads them back as a measurement — what the career
 * surfaces publish out of the week is `streak` and `bestMinutePct`, and both come from `closeDay`'s
 * own arithmetic over whatever was filed.
 */
const A_CLEAN_DAY: GoalObservations = Object.freeze({
  arrived: 400,
  carryPct: 100,
  minutePct: 84,
  peakQueue: 2,
  abandoned: 0,
  worstWaitS: 30,
  worstWaitIsCensored: false,
  // Under `GOAL_BARS.energyPerLegMaxKJ`, so the constant's name stays true after § D468 gave the
  // day a fifth bar. Left absent it would read `pending`, and `outcomeOf` counts unjudged as not
  // passed, so *a clean day* would quietly stop being one.
  workPerServedLegKJ: 34.7,
});

/**
 * The same week with **today filed onto it** — the state the `career-line` pair needs, and the one
 * the corpus could not reach.
 *
 * ## Why this composition is here and not borrowed
 *
 * `surfaces.ts#shiftBundleOf` also closes days, and it closes them over **recordings**: it
 * simulates. This module must not (the *Cost* section says why, in seconds), and it does not have
 * to — `shift/week.ts#outcomeOf` takes `record: null` as a first-class value, which is the measured
 * state of a session written by a build that had no record to write, and `closeDay` is total over
 * it. So a filed day is reachable here with no run behind it, and the two figures both career
 * surfaces publish (`WeekState.streak`, `WeekState.bestMinutePct`) are `closeDay`'s own arithmetic
 * either way.
 *
 * ## Its non-test caller, and why it is exported
 *
 * `honesty/surfaces.ts`'s `EVERYDAY_MENU` adapter, which seeds the rail's `PLAYING AS` card. Before
 * this, that adapter drove `railModel(...)` with **no options at all**, so `rail.footer.streak`
 * rendered only the honest-absence form and the *populated* career line — the one issue #214 is
 * about — was in no corpus case at all. One fixture **builder**, two readers: the seed there and
 * the pair below file a day the same way, so a change to what *a filed day* means moves the swept
 * string and the compared figure together. The two do not use the same *week* and are not meant
 * to — the pair drives day 4 to sit on the bar-hardening ladder and the seed drives day 1, which
 * is the card's line as a first-week player meets it.
 */
export function withTodayFiled(week: WeekState): WeekState {
  return closeDay(
    week,
    outcomeOf({
      day: week.day,
      dayIdx: week.dayIdx,
      eventId: 'ordinary',
      arrived: A_CLEAN_DAY.arrived,
      carried: A_CLEAN_DAY.arrived,
      minutePct: A_CLEAN_DAY.minutePct,
      readings: readGoals(goalsForDay(week.day), A_CLEAN_DAY),
      /*
       * A day filed with no record and no refusal — `shift/types.ts#DayOutcome.record` names this
       * exact pair as the measured state of a session written before the field existed. It is a
       * shipped value rather than a stub, which matters because a career surface that behaved
       * differently on it would be behaving differently on a real restored week.
       */
      record: null,
      recordRefusal: null,
    }),
  );
}

/**
 * The weeks the pairs are driven on, and what today's filing state is on each.
 *
 * Days 1 and 4 are `surfaces.ts#shiftBundleOf`'s two closes, kept for its reason: two days hold
 * **two points of the bar-hardening ladder** in the corpus, so a pair whose figure moves with the
 * day is compared at two magnitudes rather than at one. What is new is the **career** dimension,
 * and the three arms are chosen so that the `career-line` pair meets each of the states its two
 * derivations gate on differently:
 *
 * | arm | week | `dayClosed` | what the pair sees |
 * |---|---|---|---|
 * | `day1` | nothing closed | `false` | the pair does not apply — see {@link hasACareer} |
 * | `day4` | today filed | `false` | both publish, and both must **withhold** today's figure |
 * | `day4-filed` | today filed | `true` | both publish, and both must **release** it |
 *
 * **The account moves with the arm too, and it is a second dimension carried without a second axis**
 * — [§ D490](../../../../DECISIONS.md), GitHub issue #332. The three arms carry signed out, signed
 * in and still holding the server's mint, and signed in and named, which is every state
 * `everyday/profile.ts#effectiveNameOf` distinguishes. It rides on the existing arms rather than
 * multiplying them because a fourth axis would double every **other** pair's readings to reach three
 * states of one, and the `display-name` pair is in scope on all three where `career-line` is in
 * scope on two — so nothing is lost by sharing the table and a whole dimension of cost is.
 *
 * | arm | account | what the `display-name` pair sees |
 * |---|---|---|
 * | `day1` | none | both publish this device's name |
 * | `day4` | the mint, `displayNameChosen: false` | both must **still** publish this device's name |
 * | `day4-filed` | named | both publish the account's |
 *
 * The last two are one week with the axis flipped, which is what makes them a test of the *gate*
 * rather than of the arithmetic: the rail asks `history.some(day => day.day < week.day ||
 * dayClosed)` and Your week counts cards whose `show` is `!isToday || dayClosed`, and those are two
 * expressions that happen to agree. A pair driven only on a state where both release would go green
 * on a rail that had forgotten the gate entirely.
 *
 * **The arm id is the first segment of `AgreementView.id`** — see that field for why the horizon
 * has to stay the second.
 */
const AGREEMENT_ARMS: readonly {
  readonly id: string;
  readonly day: number;
  readonly dayClosed: boolean;
  readonly account: AccountState | undefined;
  week(base: WeekState): WeekState;
}[] = Object.freeze([
  { id: 'day1', day: 1, dayClosed: false, account: undefined, week: (base) => base },
  /*
   * The mint. Built through `menu/account.ts#signedIn` rather than as a literal, so the state this
   * corpus drives is one that module can actually produce — and `displayNameChosen: false` is the
   * server's own flag rather than this harness recognising `player-…` by its shape, which
   * `namingStage` refuses by name.
   */
  {
    id: 'day4',
    day: 4,
    dayClosed: false,
    account: signedIn(SIGNED_OUT, 'session-token', {
      id: 'u1',
      email: 'someone@example.test',
      displayName: 'player-a1b2c3d4e5f6',
      displayNameChosen: false,
    }),
    week: withTodayFiled,
  },
  {
    id: 'day4-filed',
    day: 4,
    dayClosed: true,
    account: signedIn(SIGNED_OUT, 'session-token', {
      id: 'u1',
      email: 'someone@example.test',
      displayName: 'Somebody Else',
      displayNameChosen: true,
    }),
    week: withTodayFiled,
  },
]);

/**
 * Every state the pairs are driven over: each arm as a **slice**, and — where the building has an
 * authored day — the same arm run **whole**.
 *
 * The second is the one § D359's defect needs, and it is the one that can quietly vanish: three of
 * the eight shipped buildings have no authored day, so a corpus whose cases all landed on those
 * would drive only slices and the property would be green over a state in which the two shells
 * cannot differ. `agreement.test.ts` asserts the whole-day arm is reached rather than assuming it,
 * and asserts the same of the career arms for the same reason.
 */
export function agreementViews(
  context: HonestyContext,
  resources: BrowserResources,
): readonly AgreementView[] {
  const base = initialState(resources, BigInt(context.case.simSeed));
  const buildingId = context.case.buildingId;
  /*
   * Resolved through the state's own saved list rather than through the loaded entries alone, which
   * is the lookup `runHorizonOf`'s three callers all make. It is `[]` on an `initialState` today,
   * so the two are the same call — and they must stay the same call, because a harness that looked
   * the building up differently from the shells would be building a state neither of them is in.
   */
  const day = wholeDayFor(
    resources.trafficProfiles,
    buildingConfigOf(resources, base.savedBuildings, buildingId),
  );
  const views: AgreementView[] = [];
  for (const arm of AGREEMENT_ARMS) {
    /*
     * `dayIdx` moves with `day`, which it did not have to before: nothing read it while the only
     * pair was the goal ask. `weekView.ts` reads it for every card's weekday, and a week claiming
     * to be on day 4 of a Monday would be a state no player can be in — the harness inventing the
     * disagreement it is looking for.
     */
    const week = arm.week({ ...base.week, day: arm.day, dayIdx: arm.day - 1 });
    const state: ViewerState = { ...base, buildingId, week };
    views.push({
      id: `${arm.id}/period`,
      state,
      resources,
      dayClosed: arm.dayClosed,
      account: arm.account,
    });
    if (day === undefined) continue;
    views.push({
      id: `${arm.id}/whole-day`,
      state: { ...state, ...wholeDayRun(day) },
      resources,
      dayClosed: arm.dayClosed,
      account: arm.account,
    });
  }
  return views;
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

/**
 * Every declared pair, over every state, as strings the corpus carries.
 *
 * Seeded into the corpus rather than compared here, for the reason every other structural fact in
 * this directory is declared by the surface and judged by a property: it is what lets
 * `faults.ts` fire this property the same way it fires the other nine — *a property that has never
 * failed is a property that cannot fail* — and it puts the compared strings in a counterexample.
 *
 * `figures` is a parameter with the register as its default so the emptied-register control in
 * `agreement.test.ts` can show that the guard would then be watching nothing.
 */
export function renderAgreements(
  context: HonestyContext,
  resources: BrowserResources,
  figures: readonly AgreedFigure[] = AGREED_FIGURES,
): readonly RenderedText[] {
  const texts: RenderedText[] = [];
  for (const view of agreementViews(context, resources)) {
    for (const pair of figures) {
      for (const side of ['left', 'right'] as const) {
        const text = pair[side].read(view);
        if (text === undefined || text.trim() === '') continue;
        texts.push({
          surfaceId: pair[side].surfaceId,
          field: `agree(${pair.id})@${view.id}.${side}`,
          text,
          // A label, not an observation: an ask is what today wants, never a fact about a run.
          role: 'label',
          provenance: 'single-run',
          agreement: { pair: pair.id, view: view.id, side },
        });
      }
    }
  }
  return texts;
}

/* -------------------------------------------------------------------------- *
 * The property
 * -------------------------------------------------------------------------- */

/** The two sides of one pair on one state, as the corpus rendered them. */
interface Pairing {
  readonly pair: string;
  readonly view: string;
  left?: RenderedText | undefined;
  right?: RenderedText | undefined;
}

function pairingsIn(texts: readonly RenderedText[]): readonly Pairing[] {
  const found = new Map<string, Pairing>();
  for (const text of texts) {
    const mark = text.agreement;
    if (mark === undefined) continue;
    const key = `${mark.pair}@${mark.view}`;
    const pairing = found.get(key) ?? { pair: mark.pair, view: mark.view };
    pairing[mark.side] = text;
    found.set(key, pairing);
  }
  return [...found.values()];
}

function figureOf(id: string): AgreedFigure | undefined {
  return AGREED_FIGURES.find((figure) => figure.id === id);
}

/**
 * **T1's *figures consistent* clause, under search** — two surfaces, one state, one figure.
 *
 * Two clauses, and the second is not a lesser form of the first:
 *
 * 1. **Both sides say the same thing.** The figure is compared as rendered, so the violation quotes
 *    what a player would read on each screen rather than a normalised number nobody sees.
 * 2. **Both sides say something.** One screen publishing the ask while the other drops it is the
 *    disagreement in its starkest form, and a check that only compared present pairs would call it
 *    a pass. `AgreementSide.read` returning `undefined` on **both** sides is a different fact — the
 *    pair does not apply to that state — and is silently skipped here and measured in
 *    `agreement.test.ts`.
 *
 * A pairing whose id is in no register entry is reported rather than ignored: it means a reading
 * was seeded by something the register no longer declares, which is the corpus and the register
 * having drifted apart.
 */
export function checkSurfacesAgree(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const pairing of pairingsIn(texts)) {
    const declared = figureOf(pairing.pair);
    const { left, right } = pairing;
    if (declared === undefined) {
      const seen = left ?? right;
      /* c8 ignore next -- a pairing exists only because a side was seeded. */
      if (seen === undefined) continue;
      found.push({
        property: 'surfaces-disagree',
        message:
          `a reading was seeded for the pair "${pairing.pair}", which AGREED_FIGURES does not ` +
          'declare. The corpus and the register have drifted: either restore the entry, or stop ' +
          'seeding the reading — an undeclared pair is a comparison nobody has argued for.',
        surfaceId: seen.surfaceId,
        field: seen.field,
        text: seen.text.slice(0, 200),
      });
      continue;
    }
    if (left === undefined || right === undefined) {
      const seen = left ?? right;
      /* c8 ignore next -- one side is present, or there would be no pairing. */
      if (seen === undefined) continue;
      const silent = left === undefined ? declared.left : declared.right;
      found.push({
        property: 'surfaces-disagree',
        message:
          `${declared.figure} is published by \`${seen.surfaceId}\` and by nothing on ` +
          `\`${silent.surfaceId}\`, on ${pairing.view}. One screen carrying a figure the other ` +
          'drops is a disagreement about what the run is, not a narrower screen: a player who ' +
          'reads both is owed one answer. AGREED_FIGURES declares these two a contract — ' +
          `${declared.why}`,
        surfaceId: silent.surfaceId,
        field: `agree(${declared.id})@${pairing.view}.${left === undefined ? 'left' : 'right'}`,
        text: seen.text.slice(0, 200),
      });
      continue;
    }
    if (left.text === right.text) continue;
    found.push({
      property: 'surfaces-disagree',
      message:
        `${declared.figure} differs between \`${left.surfaceId}\` and \`${right.surfaceId}\` on ` +
        `${pairing.view}. One says “${left.text}”; the other says “${right.text}”. Each surface ` +
        'may be internally honest and the product is still incoherent — a player reads both, one ' +
        `door apart, about one run. AGREED_FIGURES declares these two a contract — ${declared.why}`,
      surfaceId: right.surfaceId,
      field: right.field,
      text: right.text.slice(0, 200),
    });
  }
  return found;
}
