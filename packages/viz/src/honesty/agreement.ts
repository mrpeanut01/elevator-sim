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
import type { VizLeg, VizRecording } from '../contract/types.js';
import { shiftGoalsOf, todaysShiftOf } from '../dev/leftRail.js';
import { buildingConfigOf, initialState, plannedDayOf, type ViewerState } from '../dev/state.js';
import { stageHeaderOf } from '../everyday/stageScreenModel.js';
import { todayOf, type TodayRecord } from '../everyday/today.js';
import { frameAt } from '../frame/frameAt.js';
import { observationsAt } from '../live/observations.js';
import { raceVerdictSlotAt } from '../live/raceStrip.js';
import { describeFrame } from '../render/describeFrame.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { briefAsksOf } from '../everyday/briefView.js';
import { createEverydayHost, type EverydayHostBindings } from '../everyday/host.js';
import { railFooter } from '../everyday/rail.js';
import { settingsScreenViewOf } from '../everyday/settingsView.js';
import { weekScreenViewOf } from '../everyday/weekView.js';
import { scenarioHorizonFor, wholeDayFor, wholeDayRun } from '../shift/dayLength.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { pressCallRowOf } from '../shift/callRow.js';
import { dayCallRecordOf, dayCallRowOf } from '../shift/dayCalls.js';
import {
  admittedPressDayIds,
  CONTRACT_LADDER,
  pressDayFor,
  type ContractPressDay,
} from '../shift/ladder.js';
import type { PressCall } from '../shift/pressCall.js';
import { clockOf, dayReportOf, smallPrintFor } from '../shift/report.js';
import { DAY_START_S } from '../shift/types.js';
import { towerChoiceViewOf } from '../everyday/towerChoice.js';
import type { GoalObservations, Observations, ShiftGoal, WeekState } from '../shift/types.js';
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
  /**
   * **The case's own run**, on the first view only (`day1/period`), and `undefined` on the others —
   * wave AJ, the post-AI panel's seat D (D7) and seat B (defect 6).
   *
   * Every pair above is a function of the state, and the first two § D1102 pairs are not: a standing
   * count on a paused frame and the worst wait on a filed sheet are figures **of a run**. The corpus
   * already simulates one per case (`HonestyContext.recording`), so no simulation is added; it is
   * carried on one view because it is one run, and a pair that read it on all six would print the
   * same comparison six times. A pair that needs it reads `undefined` on the other views, which is
   * the register's own *both sides silent: the pair does not apply* rather than a pass.
   */
  readonly recording?: VizRecording | undefined;
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
export const AGREED_FIGURES: readonly AgreedFigure[] = Object.freeze<AgreedFigure[]>([
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
    id: 'asks-before-the-press',
    figure: 'what today asks — the goal bars the brief prints, and the ones the day is graded on',
    why:
      'GitHub issue **#597**, and § D984 is the repair. The brief is drawn **before** *Start the ' +
      'day*, and `everyday/host.ts#startRun` writes the whole-day window **on** that press, so a ' +
      'brief that asked `goalsToday()` read the slice this state still was: on day 1 of a whole-day ' +
      'tower it printed a 230 s worst wait and an 80 kJ energy bar, and the stage and the report ' +
      'then graded the same day against 460 s and 350 kJ. A player agreed to one set of goals and ' +
      'was graded on another. The `today-asks` pair could not see it: both of its sides read one ' +
      'state, and the whole-day views it compares are built with the press’s patch already applied, ' +
      'so the state the brief is drawn on was never a side of anything. This pair gives both sides ' +
      'the **pre-press** state: the left is the brief’s own expression, the right is the Everyday ' +
      'host after its own `startRun` has written its own patch, read the way the stage reads it. ' +
      'It is the § D359 shape across time rather than across shells.',
    left: {
      surfaceId: 'everyday/briefView.ts#briefAsksOf',
      read: (view) =>
        asksOf(
          briefAsksOf(createEverydayHost(hostBindingsFor(view))).map((reading) => reading.goal.label),
        ),
    },
    right: {
      surfaceId: 'everyday/host.ts#createEverydayHost',
      read: (view) => asksOf(askedAfterThePress(view)),
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
      'derivations** over one `WeekState`, and they gate today’s figure separately — ' +
      '`rail.ts#careerLineOf` asks whether any day in the `HISTORY_DAYS` window is in the history, ' +
      'and `weekView.ts#streakLineOf` takes a count off cards whose own gate is the same history ' +
      '(both read the sitting’s `dayClosed` until § D1004). Five asserted unit weeks in `rail.test.ts` hold the two ' +
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
              { week: view.state.week },
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
              nameOf: () => undefined,
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
  {
    id: 'press-call-window',
    figure: 'how long after the stage’s call a pinned day was tried — the door’s lede and the pinned data',
    why:
      'Wave AI, [§ D1029](../../../../DECISIONS.md). The door’s lede used to say *with the press made ' +
      'while the car is away*, a span in words over a measurement of one instant, and it was false on ' +
      'four of the seven rows it stood above. The lede now names a span again — the minutes after the ' +
      'stage’s call over which every admitted row was tried and held — and that span is a claim about ' +
      'the pinned data or it is nothing. The left side is the lede as the picker draws it, reached ' +
      'through `towerChoiceViewOf`; the right is the shortest admitted window read straight off ' +
      '`data/contract-ladder.json` through the admitted set. A lede typed as a literal, a lede ' +
      'derived from a refused row, or a window that moved in the data while the sentence did not, ' +
      'each publishes a span the other side does not, which is the § D227 defect this pair exists ' +
      'to catch before a player reads it.',
    left: {
      surfaceId: 'everyday/towerChoice.ts#towerChoiceViewOf',
      read: (view) =>
        minutesPhraseIn(
          towerChoiceViewOf({
            week: view.state.week,
            parked: view.state.parkedWeeks,
            seed: view.state.seed,
            calendar: view.state.calendar,
            horizonFor: () => undefined,
            nameOf: () => undefined,
          }).pressDays.lede,
        ),
    },
    right: {
      surfaceId: 'shift/ladder.ts#admittedPressDayIds',
      read: () => {
        const admitted = admittedPressDayIds();
        const windows = CONTRACT_LADDER.rows
          .filter((row) => admitted.includes(row.contractId))
          .map((row) => row.pressDay?.call?.windowS ?? 0);
        if (windows.length === 0) return undefined;
        const minutes = Math.floor(Math.min(...windows) / 60);
        return minutes === 1 ? 'minute' : `${MINUTE_NAMES[minutes] ?? String(minutes)} minutes`;
      },
    },
  },
  {
    id: 'press-call-row',
    figure: 'a pinned day’s tried count and clock range — the report’s call row and the pinned data',
    why:
      'Wave AI, [§ D1029](../../../../DECISIONS.md). The report’s call row is the one place a player ' +
      'is told how a pinned day read under the answer they did not choose, and it may say so only as ' +
      '*on this crowd, tried at N moments from A to B*, with N and the range read off the pin’s own ' +
      '`call` block. A row that composed its count or its range from anything else — a grid spacing ' +
      'assumed rather than stored, a window rounded, a literal left behind by a re-pin — would print ' +
      'a measurement the sweep never took, beside a verdict it did. The left side is the row as ' +
      '`shift/callRow.ts#pressCallRowOf` draws it for the first admitted pin at a fixture call; the ' +
      'right side is the same figure composed straight from `data/contract-ladder.json`. They must ' +
      'read the same, on every state, or the row is quoting somebody else’s measurement.',
    left: {
      surfaceId: 'shift/callRow.ts#pressCallRowOf',
      read: () => {
        const pin = firstAdmittedPin();
        if (pin === undefined) return undefined;
        const row = pressCallRowOf(
          { press: pin, call: FIXTURE_CALL, interventions: [], nameOf: () => undefined },
          (simTimeS) => clockOf(simTimeS, DAY_START_S),
        );
        return /at \d+ moments from \d\d:\d\d to \d\d:\d\d/u.exec(row?.why ?? '')?.[0];
      },
    },
    right: {
      surfaceId: 'shift/ladder.ts#CONTRACT_LADDER',
      read: () => {
        const measured = firstAdmittedPin()?.call;
        if (measured === undefined) return undefined;
        return (
          `at ${String(measured.tried)} moments from ${clockOf(FIXTURE_CALL.atS, DAY_START_S)} ` +
          `to ${clockOf(FIXTURE_CALL.atS + measured.windowS, DAY_START_S)}`
        );
      },
    },
  },
  {
    id: 'standing-now',
    figure: 'how many are standing at one instant — the stage header’s count and the race strip’s slot',
    why:
      'Wave AJ, the post-AI panel’s seat D, D7. On one paused frame at St Jude’s call the stage ' +
      'header read **10** standing and the race strip beside it **6**, because the strip’s slot was ' +
      'derived when the playhead crossed a four-minute grid line and the header at the playhead. A ' +
      'frame may carry one standing count. The two sides are separate derivations — the header folds ' +
      '`frame/overlay.ts#overlayAt`’s `waitingNow`, the slot walks the legs through `isWaitingAt` — ' +
      'read at the same off-grid playheads across the case’s run, so a shell that went back to ' +
      'answering the slot at the grid line, or a fold that stopped agreeing with the predicate, ' +
      'publishes a count the other does not.',
    left: {
      surfaceId: 'everyday/stageScreenModel.ts#stageHeaderOf',
      read: (view) => countsAtPlayheads(view.recording, (recording, t) => headerStandingAt(recording, t)),
    },
    right: {
      surfaceId: 'live/raceStrip.ts#raceVerdictSlotAt',
      read: (view) =>
        countsAtPlayheads(view.recording, (recording, t) =>
          /^(\d+) standing now$/u.exec(raceVerdictSlotAt(NO_SLOTS, NOBODY, recording, t))?.[1],
        ),
    },
  },
  {
    id: 'standing-said',
    figure: 'how many are standing at one instant — the stage header’s count and the sentence a screen reader says',
    why:
      'Wave AJ, the post-AI panel’s seat D, D7: the same paused frame whose header read 10 standing ' +
      'said *7 legs waiting* to a screen reader. `render/describeFrame.ts` reads `Frame.totalWaiting`, ' +
      'a step function over `core`’s progress samples, and the header folds the legs — two sources ' +
      'for one count, which `frame/overlay.ts` says agree by construction and nothing across the ' +
      'corpus held. The rate limit on the live region was the half the panel saw; this is the half ' +
      'that would let the sentence be wrong even when it is current.',
    left: {
      surfaceId: 'everyday/stageScreenModel.ts#stageHeaderOf',
      read: (view) => countsAtPlayheads(view.recording, (recording, t) => headerStandingAt(recording, t)),
    },
    right: {
      surfaceId: 'render/describeFrame.ts#describeFrame',
      read: (view) =>
        countsAtPlayheads(view.recording, (recording, t) =>
          / (\d+) legs waiting, /u.exec(describeFrame({ recording, frame: frameAt(recording, t) }))?.[1],
        ),
    },
  },
  {
    id: 'worst-wait',
    figure: 'the worst wait of the day — the report’s WORST WAIT card and the goal row that grades it',
    why:
      'Wave AJ, the post-AI panel’s seat B, defect 6, and § D1104. The card read **178 s** and the ' +
      'goal row **181 s** on one sheet: the card was the reporting window’s maximum and the goal the ' +
      'whole shift’s, and `docs/19` defect 3 had labelled each where it stood. A newcomer reads two ' +
      'worst waits. The card now reads the goal’s own fold; this pair is what stops a later change ' +
      'pointing it back at the window. Both sides are silent where the goal is not graded — under the ' +
      'wake-up gate, or when the worst wait belongs to somebody still standing — because there the ' +
      'goal row prints no figure to agree with.',
    left: {
      surfaceId: 'shift/report.ts#dayReportOf',
      read: (view) => gradedReportOf(view)?.figures.find((figure) => figure.id === 'worst-wait')?.value,
    },
    right: {
      surfaceId: 'shift/goals.ts#readGoals',
      read: (view) => {
        const run = gradedRunOf(view);
        if (run === undefined) return undefined;
        return readGoals(run.goals, run.observations).find((reading) => reading.goal.id === 'worst-wait')?.display;
      },
    },
  },
  {
    id: 'worst-wait-lever',
    figure: 'the worst wait of the day — the *Weight fairness up* lever card and the goal row that grades it',
    why:
      'Wave AK, the post-AJ panel’s seats B (H2) and D (H4), and § D1148. After § D1104 moved the ' +
      'WORST WAIT card to the goal’s whole-shift fold, the lever card two blocks down still read ' +
      '`summary.serviceLevel.longestWaitS`, the reporting window’s maximum, and printed *one still ' +
      'waited 178 s* on the sheet whose card and goal row said 181 s. The `worst-wait` pair compared ' +
      'the card with the goal and nothing compared the lever, which is how one sheet came to carry ' +
      'two worst waits again. Both sides are read only where the lever points at the day, which is ' +
      'the only state on which the card publishes a wait at all.',
    left: {
      surfaceId: 'shift/report.ts#dayReportOf',
      read: (view) => leverWorstWaitOf(gradedReportOf(view)),
    },
    right: {
      surfaceId: 'shift/goals.ts#readGoals',
      read: (view) => {
        const run = gradedRunOf(view);
        if (run === undefined || !fairnessLeverPointed(gradedReportOf(view))) return undefined;
        return readGoals(run.goals, run.observations).find((reading) => reading.goal.id === 'worst-wait')?.display;
      },
    },
  },
  {
    id: 'worst-wait-scope',
    figure: 'the span the day’s worst wait is taken over — the WORST WAIT card’s note and the report’s fold-out',
    why:
      'Wave AK, the post-AJ panel’s seat B (H1), and § D1148. The card says *the worst of the whole ' +
      'shift — the figure the goal row grades* and the fold-out a reader opens when two figures ' +
      'disagree said *the means and the WORST WAIT figure are over that window and nothing else*. ' +
      'Each read true of the tree it was written on; § D1104 moved the card and the paragraph that ' +
      'reconciles the sheet’s two spans stayed where it was. Compared as the span each names, so a ' +
      'later change to either side’s wording that moves the figure between spans is caught.',
    left: {
      surfaceId: 'shift/report.ts#dayReportOf',
      read: (view) => {
        const note = gradedReportOf(view)?.figures.find((figure) => figure.id === 'worst-wait')?.note;
        if (note === undefined) return undefined;
        return spanNamedIn(note);
      },
    },
    right: {
      surfaceId: 'shift/report.ts#smallPrintFor',
      read: (view) => {
        const run = gradedRunOf(view);
        if (run === undefined) return undefined;
        return worstWaitSpanInSmallPrint(smallPrintFor(run.recording.dispatcherProfileId, run.recording.summary, DAY_START_S));
      },
    },
  },
  {
    id: 'todays-shift',
    figure: 'what today is called and what it books — the Engineer rail’s line and the Everyday brief’s wrinkle card',
    why:
      'Wave AJ, the post-AI panel’s seats C and D (D6) and seat B (defect 4). On St Jude’s day 1 the ' +
      'Engineer rail read *An ordinary day — Nothing booked* one door from a brief saying cars D and E ' +
      'are booked out 08:37–08:46, and both called a pinned day the stage will stop to call *an ' +
      'ordinary day*. The brief had been repaired (§ D983) and the rail had not, because it read the ' +
      'calendar’s event while the brief read the run. The left side is the rail’s own derivation ' +
      '(`dev/leftRail.ts#todaysShiftOf`), the right the brief’s (`everyday/today.ts#todayOf` over the ' +
      'building `dev/state.ts#plannedDayOf` hands the next run), and the whole line is compared — name ' +
      'and note — because a fourth reader that forgot either half is the defect again.',
    left: {
      surfaceId: 'dev/leftRail.ts#todaysShiftOf',
      read: (view) => {
        const shift = todaysShiftOf(view.resources, view.state);
        return `${shift.name} — ${shift.note}`;
      },
    },
    right: {
      surfaceId: 'everyday/today.ts#todayOf',
      read: (view) => {
        const today = briefTodayOf(view);
        return `${today.wrinkleName} — ${today.wrinkleNote}`;
      },
    },
  },
  {
    id: 'day-call-row',
    figure: 'an ordinary call’s three ten-minute counts — the report’s call row and the runs it was counted on',
    why:
      'Wave AJ, [§ D1138](../../../../DECISIONS.md) clause 3. The row is the one place a player is ' +
      'told what the answers they did not give did, and it may say only what its runs measured: on ' +
      'this crowd, how many riders who arrived in the ten minutes from the call waited a minute or ' +
      'more under each answer. The left side is the row as `shift/dayCalls.ts#dayCallRowOf` draws it ' +
      'from a record the shipped `dayCallRecordOf` counted; the right side is the same three counts ' +
      'taken straight off the runs’ legs by an expression written here, from the legs’ own boarding ' +
      'and refusal times rather than through `isWaitingAt`. A row that counted legs where it says ' +
      'riders, read the window’s far edge as inside, counted a rider the building turned away, or ' +
      'printed its answers in another order would publish a count its runs do not hold, which is ' +
      'the claim-past-its-runs defect the ruling names; the pair fails on any of them.',
    left: {
      surfaceId: 'shift/dayCalls.ts#dayCallRowOf',
      read: () => {
        const row = dayCallRowOf(
          dayCallRecordOf({
            atS: DAY_CALL_FIXTURE.atS,
            windowEndS: DAY_CALL_FIXTURE.endS,
            answer: 'spread-cars',
            legs: DAY_CALL_FIXTURE.legs,
            observations: DAY_CALL_FIXTURE.observations,
          }),
          1,
          () => 'Shift cleared',
          (simTimeS) => clockOf(simTimeS, DAY_START_S),
        );
        const counts = /: (\d+) with park[^,]*, (\d+) with spread[^.]* and (\d+) with leave/u.exec(row.why);
        return counts === null ? undefined : `${String(counts[1])}/${String(counts[2])}/${String(counts[3])}`;
      },
    },
    right: {
      surfaceId: 'shift/dayCalls.ts#dayCallRecordOf',
      read: () =>
        DAY_CALL_ANSWER_ORDER.map((answer) => {
          const riders = new Set<string>();
          for (const leg of DAY_CALL_FIXTURE.legs[answer]) {
            if (leg.arrivedAt < DAY_CALL_FIXTURE.atS || leg.arrivedAt >= DAY_CALL_FIXTURE.endS) continue;
            /* Still standing a minute after arriving: neither boarded nor turned away by then. */
            const ended = Math.min(leg.boardedAt ?? Infinity, leg.refusedAt ?? Infinity);
            if (ended > leg.arrivedAt + 60) riders.add(leg.passengerId);
          }
          return String(riders.size);
        }).join('/'),
    },
  },
]);

/** The *nobody* pick with no rival and no refusal — the slot the standing pairs read. */
const NOBODY = Object.freeze({
  pick: 'none' as const,
  recording: undefined,
  refusal: undefined,
  pending: false,
  watching: false,
});
const NO_SLOTS = Object.freeze({ verdict: '', note: '', rivalName: '' });

/**
 * Nine playheads across the run, each a fraction of the way into its ninth of the span — so none
 * sits on `live/raceStrip.ts#RACE_SAMPLE_INTERVAL_S`'s grid by construction, which is where a cached slot
 * and a live one would agree by accident.
 */
function countsAtPlayheads(
  recording: VizRecording | undefined,
  countAt: (recording: VizRecording, t: number) => string | undefined,
): string | undefined {
  if (recording === undefined) return undefined;
  const span = recording.endedAt - recording.startedAt;
  const readings: string[] = [];
  for (let k = 0; k < 9; k += 1) {
    const t = recording.startedAt + (span * (k + 0.37)) / 9;
    readings.push(`${clockOf(t, DAY_START_S)} ${countAt(recording, t) ?? '?'}`);
  }
  return readings.join(' · ');
}

/** The stage header's *standing right now* figure at a playhead. */
function headerStandingAt(recording: VizRecording, t: number): string | undefined {
  return stageHeaderOf({
    simTimeS: t,
    recording,
    observations: observationsAt(recording, t),
    dayStartS: undefined,
    driverName: recording.dispatcherProfileId,
  }).figures.find((figure) => figure.label === 'standing right now')?.value;
}

/**
 * The run folded at its end, with the view's day's goals — or `undefined` where the worst-wait goal
 * is not graded, which is where the goal row prints no figure.
 */
function gradedRunOf(
  view: AgreementView,
): { readonly recording: VizRecording; readonly observations: Observations; readonly goals: readonly ShiftGoal[] } | undefined {
  const recording = view.recording;
  if (recording === undefined) return undefined;
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const goals = goalsForDay(view.state.week.day);
  const reading = readGoals(goals, observations).find((entry) => entry.goal.id === 'worst-wait');
  if (reading === undefined || reading.state === 'pending') return undefined;
  return { recording, observations, goals };
}

/**
 * The Day report of a graded run, as the `worst-wait` pairs read it — `undefined` where the goal
 * is not graded. Built once per view: every pair reading a sheet reads the same sheet.
 */
const gradedReports = new WeakMap<AgreementView, ReturnType<typeof dayReportOf> | null>();
function gradedReportOf(view: AgreementView): ReturnType<typeof dayReportOf> | undefined {
  const cached = gradedReports.get(view);
  if (cached !== undefined) return cached ?? undefined;
  const run = gradedRunOf(view);
  const report =
    run === undefined
      ? null
      : dayReportOf({
          recording: run.recording,
          observations: run.observations,
          goals: run.goals,
          week: view.state.week,
          contract: undefined,
          event: SHIFT_EVENTS.ordinary,
          plan: { shiftLengthS: run.recording.endedAt - run.recording.startedAt, windowStartS: null, patternId: 'building' },
          calendar: null,
          subject: { kind: 'week-day' },
        });
  gradedReports.set(view, report);
  return report ?? undefined;
}

/** Whether the sheet's *Weight fairness up* card is pointed at by the day. */
function fairnessLeverPointed(report: ReturnType<typeof dayReportOf> | undefined): boolean {
  const lever = report?.levers.find((entry) => entry.id === 'weight-fairness');
  return lever !== undefined && lever.body.startsWith('Today points here:');
}

/** The wait the pointed *Weight fairness up* card quotes, in the goal row's own form. */
function leverWorstWaitOf(report: ReturnType<typeof dayReportOf> | undefined): string | undefined {
  if (!fairnessLeverPointed(report)) return undefined;
  const body = report?.levers.find((entry) => entry.id === 'weight-fairness')?.body ?? '';
  return /one still waited (?:at least )?(\d+ s)/u.exec(body)?.[1] ?? 'no wait quoted';
}

/** The span the fold-out puts the WORST WAIT figure in: the clause the words sit in. */
function worstWaitSpanInSmallPrint(smallPrint: string): string {
  const clause = smallPrint.split(/;|\. /u).find((part) => part.includes('WORST WAIT'));
  return clause === undefined ? 'unnamed' : spanNamedIn(clause);
}

/** Which of the sheet's two spans a sentence names: the whole shift, the reporting window, or neither. */
function spanNamedIn(text: string): string {
  if (text.includes('whole shift')) return 'the whole shift';
  if (text.includes('window')) return 'the window';
  return 'unnamed';
}

/**
 * The brief's day record for a view's state — `everyday/briefScreen.ts#factsNow`'s inputs, reached
 * without a host: the building, clock, mix and day cars the next run is handed
 * (`dev/state.ts#plannedDayOf`) and the horizon the next press runs (`scenarioHorizonFor`).
 */
function briefTodayOf(view: AgreementView): TodayRecord {
  const { resources, state } = view;
  const planned = plannedDayOf(resources, state);
  return todayOf({
    week: state.week,
    calendar: state.calendar,
    building: planned.building,
    dayStartS: planned.startOfDayS,
    templateVariesMix: planned.templateVariesMix,
    wholeDayRun: planned.wholeDayRun,
    dayCars: planned.dayCars,
    buildingId: state.buildingId,
    dispatcherName: undefined,
    dispatcherId: state.dispatcherId,
    dispatcherNameOf: () => undefined,
    goals: [],
    seed: state.seed,
    horizon: scenarioHorizonFor(
      resources.trafficProfiles,
      buildingConfigOf(resources, state.savedBuildings, state.buildingId),
    ),
    crowdIsToday: false,
    daySeed: state.seed,
    firstSession: false,
    units: 'metric',
  });
}

/** The three answers in the row's order, spelled out here rather than read from `DAY_CALL_ANSWERS`. */
const DAY_CALL_ANSWER_ORDER = ['park-cars-lobby', 'spread-cars', 'leave'] as const;

/**
 * The `day-call-row` fixture: three runs of one call, a call at 10:00 and its ten-minute window. Each
 * run holds riders on both sides of every edge the count has — before the window, at its far edge,
 * a wait of exactly a minute, a wait just short of one, a rider turned away, and one rider with two
 * legs — so the two sides disagree on any of them if either reads it wrongly.
 */
const DAY_CALL_FIXTURE = (() => {
  const atS = 7200;
  const endS = atS + 600;
  const leg = (passengerId: string, arrivedAt: number, boardedAt?: number, refusedAt?: number): VizLeg =>
    ({
      passengerId,
      arrivedAt,
      ...(boardedAt === undefined ? {} : { boardedAt }),
      ...(refusedAt === undefined ? {} : { refusedAt }),
    }) as unknown as VizLeg;
  const base = [
    leg('early', atS - 10, atS + 100),
    leg('edge', endS, endS + 200),
    leg('minute', atS + 30, atS + 90),
    leg('short', atS + 40, atS + 99),
    leg('refused', atS + 50, undefined, atS + 70),
    leg('twice', atS + 60, atS + 200),
    leg('twice', atS + 300, atS + 400),
  ];
  const legs = {
    'park-cars-lobby': [...base, leg('p1', atS + 100, atS + 250)],
    'spread-cars': [...base, leg('s1', atS + 100, atS + 130), leg('s2', atS + 120, atS + 300), leg('s3', atS + 500)],
    leave: [...base, leg('l1', atS + 10, atS + 400), leg('l2', atS + 20, atS + 500)],
  } as const;
  /* The row's verdict clause is graded by the caller, and this pair's grader reads no fold. */
  const unread = {} as Observations;
  const observations = { 'park-cars-lobby': unread, 'spread-cars': unread, leave: unread };
  return { atS, endS, legs, observations };
})();

/** Minutes in words — the right side of `press-call-window`, kept apart from the picker's own table. */
const MINUTE_NAMES: readonly string[] = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** The span phrase in a lede — `five minutes`, `minute` — or `undefined` where it names none. */
function minutesPhraseIn(lede: string): string | undefined {
  return /over the ((?:[a-z]+ minutes)|minute) after it/u.exec(lede)?.[1];
}

/** The first admitted pin, or `undefined` on a ladder that admits none. */
function firstAdmittedPin(): ContractPressDay | undefined {
  const [id] = admittedPressDayIds();
  return id === undefined ? undefined : pressDayFor(id);
}

/** A call at the day's 10:00, on car `A` — the fixture `press-call-row`'s two sides are read at. */
const FIXTURE_CALL: PressCall = Object.freeze({
  atS: 7200,
  rule: 'first-minute-wait',
  carId: 'A',
  awayAtS: 7000,
  backAtS: 9000,
  act: undefined,
});

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

/**
 * The asks the stage reads **after** the Everyday host's own *Start the day* — § D984's right side.
 *
 * The one binding this lets write is `applyPatch`, into a copy of the view's state, and `startRun`
 * records nothing and runs nothing: the press's whole effect on what a day asks is the patch it
 * writes, and this harness still does not simulate (the *Cost* section). Everything else refuses
 * exactly as {@link hostBindingsFor} does. The patch is the host's own — nothing here rebuilds
 * `dayPatchFor` — so a press that changed what it writes moves this side with it.
 */
function askedAfterThePress(view: AgreementView): readonly string[] {
  let state = view.state;
  const bindings: EverydayHostBindings = {
    ...hostBindingsFor(view),
    state: () => state,
    applyPatch: (patch) => {
      state = { ...state, ...patch };
    },
    startRun: () => undefined,
  };
  const host = createEverydayHost(bindings);
  host.startRun();
  return host.goalsToday().map((reading) => reading.goal.label);
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
  // Zero, and its overlap is zero with it — a clean day is one where nobody's wait crossed the
  // line, so `goals.ts#gaveUpBesideOf` draws nothing here and the horizon is the project's own
  // 900 s stated rather than assumed (GitHub issue #456).
  abandonedCarried: 0,
  horizonS: 900,
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
 * | `day4` | today filed | `false` | both publish, and both must **release** today's figure |
 * | `day4-filed` | today filed | `true` | both publish, and both must **release** it |
 *
 * **The `day4` row read *withhold* until [§ D1004](../../../../DECISIONS.md)**, when both
 * derivations stopped asking the sitting and started asking the week: a day in the history is a
 * closed day whether or not this sitting filed the run. The arm is kept, because it is now the state
 * in which a derivation that went back to the sitting would disagree with one that did not —
 * `agreement.test.ts`'s negative control is exactly that regression.
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
 * The last two are one week with the sitting's axis flipped, which is what makes them a test of the
 * *gate* rather than of the arithmetic: the rail asks whether any day of the window is in the
 * history and Your week counts cards whose `show` is the same history, two expressions that happen
 * to agree, and since § D1004 neither reads `dayClosed`. A pair driven only on the filed arm would go
 * green on a derivation that had gone back to withholding today until the sitting files it.
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
      ...(views.length === 0 ? { recording: context.recording } : {}),
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
