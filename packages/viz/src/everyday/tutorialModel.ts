/**
 * **The two-screen tutorial, as words and as one decision** — [§ D529](../../../../DECISIONS.md),
 * GitHub issue **#380**.
 *
 * § D529 clause 1: *"The first session is a tutorial of two screens, and it sits before Scenario
 * rather than inside it. Screen one walks the player through making changes on a forgiving
 * building — the editor is taught before a scenario asks the player to use it. Screen two is
 * `docs/35` § 8.1's `PM-DOOR`: a building falls apart, and the player is then shown how it could
 * have been fixed."*
 *
 * ## One lesson across the two screens, and it is the shipped case's
 *
 * The tutorial names a **shipped fix case** rather than authoring content of its own:
 * {@link TUTORIAL_CASE_ID} is `three-cars-one-cars-work`, `garden-apartments`, whose complaint is
 * the sentence `docs/35` § 9.1 quotes as the best writing in the product — *"We are six floors with
 * three lifts and I still watch all three sit downstairs together."* Three reasons, and the third
 * is the load-bearing one:
 *
 * 1. It is the **forgiving** building clause 1 asks for. GitHub issue #270 swept every legal axis
 *    and could not make `garden-apartments` fail; that is a defect in a *scenario* slot and exactly
 *    the right property for a tutorial, which is not trying to beat anybody.
 * 2. Its diagnosed repair **costs nothing** — *"Nothing was bought — the third car was never the
 *    problem, and neither were the first two."* A first lesson that teaches *the answer was not
 *    more steel* is worth more than a first lesson that teaches a parameter.
 * 3. **Screen one's control and screen two's answer are the same change.**
 *    `mode/plainLevers.ts`'s *Spread the cars out* writes `idle.parkingStrategy: zone-center`, and
 *    the case's diagnosed repair patches `idle.parkingStrategy` to `zone-center`. So the walkthrough
 *    teaches the control the worked answer then uses, rather than two unrelated demonstrations
 *    sharing a screen count.
 *
 * **Which building the tutorial uses is not settled by § D529** — *"What this does not decide.
 * Which building the tutorial uses, which is #270's."* The choice above is this module's, argued
 * rather than assumed, and it is carried in {@link TUTORIAL_ABSENCES} so a reader meets it on the
 * build panel instead of in a docstring.
 *
 * ## The gate is derived, and the word *derived* is doing real work
 *
 * [§ D476](../../../../DECISIONS.md) ruled that a first-run cover conditioned on **derived state**
 * is not the entry-screen override `charter` non-goal 10 forbids: *"`PM-DOOR` stores nothing.
 * Conditioned on derived state, the cover is recomputed from the player's own progress on every
 * load, so nothing survives a reload; it is re-derived."*
 *
 * {@link tutorialIsDue} therefore reads **only** quantities the player produced by playing — days
 * filed, cases solved, dispatchers rated — and there is no *seen the intro* field anywhere in
 * {@link TutorialProgress} for one to hide in. `tutorialModel.test.ts` asserts the type has no
 * boolean at all, which is the cheapest form of *never on a stored flag* that a test can state.
 *
 * ## And skipping must **advance** that state, which is stronger than not breaking it
 *
 * § D476's one condition: *"Skipping must advance the derived state. Otherwise a player who skips
 * the cover, reloads, and meets it again has been handed a screen they already dismissed … The
 * cheapest form is that the skip starts the day, so the state that conditions the cover has moved
 * by the time anything could reload."*
 *
 * **That condition is amended, and this paragraph is the record of what it used to say**
 * ([§ D993](../../../../DECISIONS.md), GitHub issue #598). `tutorialScreens.ts#leave` used to run
 * the day and file it on both ways out, so `week.history` was non-empty by the time anything could
 * reload — and the day it filed was a **scored day on a tower the player never saw**, which the
 * front door then announced before anybody had played. A press of Skip is a navigation, and
 * [§ D232](../../../../DECISIONS.md) says a navigation is not a progression event. `leave` files
 * nothing now. The condition holds within a session, through the shell's `tutorialOffered` guard;
 * across a reload it is replaced by *the first-visit cover always carries a live route to the mode
 * picker* — a player who has played nothing meets the landing page again, one press from the modes.
 * That is the cost § D993 accepts, and the alternative it refuses is a count of tutorials watched,
 * which would be the stored flag § D476 forbids wearing a number. `TutorialProgress` and
 * {@link tutorialIsDue} are unchanged.
 * `tutorialModel.test.ts` still asserts the gate over its whole space, and reads
 * `tutorialScreens.ts` off disk to check that `leave` is the one thing both ways out call and that
 * it neither starts nor closes a day.
 *
 * ## Screen two moves a control now — `charter S1`, and why no number is spent on it
 *
 * `docs/22` § 4's `S1`: *a first-time player reaches a building in visible trouble within 90 s of
 * first load*. The shipped path failed that by construction — the first three screens a stranger
 * met were prose, and the first control that changes a run was six screens in — while screen two's
 * own lede said *"Watch the three cars, and watch the fourth floor"* on a screen that drew no cars.
 * That is [§ D227](../../../../DECISIONS.md)'s stale refusal with its polarity reversed: a sentence
 * telling a reader to look at something that is not there, on the one screen a stranger is deciding
 * on.
 *
 * So screen two plays the run it names, on `everyday/caseStage.ts`'s block, and carries **one**
 * control — the shipped *Spread the cars out* lever, by its own name — which swaps the block for
 * the pair, side by side at one playhead. The worked answer **stays**, because § D529 permits one
 * in the first session and nowhere else; what moved is when it lands, which is after the press, as
 * confirmation rather than as instruction.
 *
 * **No `DECISIONS.md` entry is owed, under [§ D405](../../../../DECISIONS.md).** Nothing here
 * reaches past the two modules that took it: § D529 clause 1 is unmoved (nothing skips the
 * walkthrough, nothing reaches Scenario ahead of it, the worked answer stays inside the first
 * session), § D476's gate and exit are untouched, and the only edits outside this pair are the two
 * a new player-facing state always owes — its seeds in `honesty/surfaces.ts` and its absence row in
 * `buildNotes.test.ts#ABSENCE_TRIAGE`. This docstring is the record the working agreement asks for.
 *
 * **And `S1` is not declared met here.** What is built is the screen; what nobody has measured on
 * this tree is the wall clock from first load to a moving canvas, which depends on a worker
 * simulating two runs. A criterion is met by a measurement, not by the code that makes it
 * reachable.
 *
 * ## Outside the difficulty curve
 *
 * `docs/33` § 1.6, under [§ D528](../../../../DECISIONS.md): *"The tutorial is outside the curve …
 * not a ladder position and is governed by none of DC-1 through DC-9. It is the one place a worked
 * answer is permitted, which is the exact opposite of what DC-1 asks of a stage."* This module
 * therefore imports nothing from `campaign/`, `shift/goals.ts` or `shift/contracts.ts`, and
 * `tutorialCurve.test.ts` asserts that mechanically as well as reading the sentence off disk.
 *
 * Pure. No DOM, no host, no `data/` read — `tutorialScreens.ts` mounts what this returns, and the
 * honesty corpus sweeps it without a document.
 */
import type { DispatcherSpec, GroupLevers } from '../authoring/dispatcherSpec.js';
import type { VizRecording } from '../contract/types.js';
import { measuredOf } from '../fixit/run.js';
import type { FigureSpec, FixitCase } from '../fixit/types.js';
import { plainLeversOf } from '../mode/plainLevers.js';
import { PACE_HOLD_WAIT_S } from './stagePace.js';
import {
  workedAnswerViewOf,
  type WorkedAnswerFacts,
  type WorkedAnswerView,
} from './workedAnswer.js';

/**
 * The shipped fix case the tutorial teaches. See the module docstring for why this one, and
 * {@link TUTORIAL_ABSENCES} for the fact that the choice is #270's to confirm.
 *
 * A `data/` id rather than a copy of its content: a tutorial that restated the case's complaint,
 * diagnosis and repair would be a second authored copy of eighteen validated strings, and the day
 * `data/fixit-cases.json` moved, one of the two would be wrong with nothing to notice it.
 */
export const TUTORIAL_CASE_ID = 'three-cars-one-cars-work';

/* -------------------------------------------------------------------------- *
 * The gate — § D476, derived and never stored
 * -------------------------------------------------------------------------- */

/**
 * Everything {@link tutorialIsDue} is allowed to look at, and it is deliberately three counts.
 *
 * Each is a quantity the player produced by playing and each already persists for its own reasons:
 * `WeekState.history` through `persist/session.ts`, and both progress lists through
 * `everyday/profile.ts`. **There is no field here that means *has seen the tutorial***, and the
 * absence is asserted rather than merely intended — `tutorialModel.test.ts` reads this module's
 * source and fails on a boolean in this interface, because that is the shape a stored flag would
 * arrive in.
 */
export interface TutorialProgress {
  /** `host.week().history.length` — days filed. § D476's *no filed day*. */
  readonly filedDays: number;
  /** `profileStore.progress().solvedCaseIds.length` — fix cases whose pass conditions have held. */
  readonly solvedCases: number;
  /** `profileStore.progress().ratings.length` — dispatchers that have been through the forty. */
  readonly ratings: number;
}

/**
 * Whether the tutorial is due — *an empty week, no filed day*, and nothing else earned either.
 *
 * The last clause is not padding. A player who has never filed a day but has solved a fix case or
 * rated a dispatcher has met the product; handing them a walkthrough of the editor would be the
 * first-run screen arriving on a session that is not a first run. `filedDays` alone is the issue's
 * own wording; the two extra counts are what make it true of the player rather than of the week.
 */
export function tutorialIsDue(progress: TutorialProgress): boolean {
  return progress.filedDays === 0 && progress.solvedCases === 0 && progress.ratings === 0;
}

/*
 * **What both exits do, and why there is no constant for it** — § D476's playability condition.
 *
 * *Skip* and *Finish* leave the tutorial the same way: `tutorialScreens.ts#leave` goes to the menu
 * and files nothing ([§ D993](../../../../DECISIONS.md), GitHub issue #598; a navigation is not a
 * progression event, § D232). It used to run the day and file it, so `filedDays` had moved by the
 * time anything could reload — at the price of a scored day on a tower the player never saw. The
 * skip is a way past **being walked through**, and the first day on the player's week is now one
 * they play. Within a session the shell's `tutorialOffered` guard keeps the tutorial away; across a
 * reload the first-visit cover carries a live route to the mode picker, which is the condition as
 * § D993 amends it.
 *
 * There is deliberately **no `TUTORIAL_EXIT` constant and no `progressAfterExit` helper**. Both
 * existed in a draft of this module and neither had a shipped caller: the mount did the filing
 * through the host, so a value naming the exit would have been a behaviour that is configurable,
 * unit-tested in isolation and never called from a shipped path — the defect
 * `docs/05-roadmap.md`'s standing requirement is about, written into the module whose subject is
 * a condition. The condition is asserted over {@link tutorialIsDue} directly instead, which is
 * where it is actually decided. A block comment rather than a docstring, because there is
 * deliberately nothing under it to document.
 */

/* -------------------------------------------------------------------------- *
 * Screen one — walking the player through making changes
 * -------------------------------------------------------------------------- */

/** One step of the walkthrough. `control` is what the player is being shown, in the rail's words. */
export interface TutorialStep {
  readonly id: string;
  readonly control: string;
  readonly title: string;
  readonly body: string;
}

/** A figure screen one quotes. Always read off a run; see {@link tutorialWalkthroughViewOf}. */
export interface TutorialFigure {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface TutorialWalkthroughView {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly steps: readonly TutorialStep[];
  readonly figuresHeading: string;
  readonly figures: readonly TutorialFigure[];
  /** What the figures are of, or — before the run lands — why there are none yet. */
  readonly figuresNote: string;
  readonly skip: string;
  readonly skipNote: string;
}

export const TUTORIAL_COPY = Object.freeze({
  eyebrow: 'First session',
  walkthroughTitle: 'How this works',
  walkthroughLede:
    'Six floors, three lifts, and a resident who keeps missing them. Before anything is asked of you, here is what you can change and where it is.',
  figuresHeading: 'The building, today',
  figuresPending:
    'The day is being simulated now. These are readings from that run, so there is nothing to show until it lands.',
  figuresLanded:
    'Every figure here is from the run that just finished on this device — the same engine every mode plays on.',
  skip: 'Skip the tutorial',
  /*
   * GitHub issue #598, [§ D993](../../../../DECISIONS.md). This read *"The day still runs and still
   * gets filed, so this is a way past the walkthrough rather than a way past the day"*, and the day
   * it filed was a scored day on a tower the player never saw — the front door then read *MON
   * mixed-use-high-rise 96 % today* before anybody had played. Leaving files nothing now.
   */
  skipNote:
    'Nothing is filed and nothing is scored. This is a way past the walkthrough, and the first day on your week is one you play.',
  collapseTitle: 'Watch it come apart',
  /*
   * *The top three floors*, not *the fourth floor* — the post-AH panel's B.md: a player watched
   * floor 4 and the riders past a minute stood on floor 6. The letter is written **from** floor 4,
   * but the case measures waits starting on floors 4, 5 and 6 (`data/fixit-cases.json`, the
   * complaint's `scope.floorIds`), and that is where the screen's red riders come from. So the lede
   * points at the stretch the measure counts rather than the one landing the letter-writer lives on;
   * `tutorialModel.test.ts` derives the stretch from the case and the building and holds the word.
   * Recorded here under [§ D405](../../../../DECISIONS.md): the decision is this sentence's.
   */
  collapseLede:
    'This is the same building with nothing changed. Watch the three cars, and watch the top three floors, where the letter comes from.',
  collapsePending:
    'The day is being simulated now, twice — once as it stands and once with one thing changed. Nothing is shown until both land.',
  /*
   * **Screen two's canvas, and the one press beside it** — the beat the tutorial did not have.
   *
   * `charter S1` asks that a first-time player reach a building in visible trouble inside ninety
   * seconds of first load, and until this block landed the first three screens were prose: the
   * lede above promised *watch the three cars* on a screen that drew no cars, which is § D227's
   * stale refusal with its polarity reversed — a sentence telling a reader to look at something
   * that is not there, on the one screen a stranger decides on.
   *
   * Two wordings of one block, because two runs play in it: the morning as the building runs it,
   * and the same morning with the control pressed. Neither carries a digit — every number on this
   * screen arrives from a run, through the worked answer, and `tutorialModel.test.ts` fails on a
   * digit anywhere in this table.
   */
  stageEyebrow: 'THE MORNING THE LETTER IS ABOUT',
  /*
   * GitHub issue #598, [§ D992](../../../../DECISIONS.md). This read *"Playing now, at the speed you
   * have set"*, and at the speed they had set a player watched about two minutes of three idle cars
   * and nobody on a landing. The quiet minutes are crossed fast now and the picture slows to their
   * speed whenever somebody has waited a minute, so the sentence says both halves.
   */
  stageNote:
    'Playing now. The quiet minutes run fast, and the picture slows to the speed you have set whenever somebody on a landing has waited a minute. Nothing has been changed: this is the building as it stands.',
  stageSkip: 'Stop it there',
  stageEnded: 'That is the morning as the building runs it today, with nothing changed.',
  stagePending:
    'The morning is being simulated now. Nothing is drawn until it lands — a picture of a run that has not happened is the one thing a tutorial may not show.',
  answeredEyebrow: 'THE SAME MORNING, BOTH WAYS',
  answeredNote:
    'Both runs at once, at the same minute: the same people arriving at the same landings, in two buildings that differ only in what the idle cars do between calls.',
  answeredSkip: 'Skip to the answer',
  answeredEnded: 'That is the same morning both ways, at the same minute.',
  /*
   * The two panes' captions. Only the pair carries them — a caption over the only canvas on screen
   * is a label on the one thing there, which is `caseStage.ts`'s own rule for the field.
   */
  paneAsBuilt: 'AS IT STANDS',
  paneAnswered: 'WITH THE CARS SPREAD OUT',
  /*
   * The control. Its **label and its two ends are not authored here** — they are the shipped
   * lever's own, read through `mode/plainLevers.ts#plainLeversOf`, so the tutorial cannot teach a
   * control the workshop calls something else. What is authored is only why it is the control on
   * screen, and the refusal that stands on its face while the second run is still being made.
   */
  controlHeading: 'CHANGE ONE THING',
  controlWhy:
    'This is the same control the dispatcher workshop lists under that name, and it is the one this building needs. Press it and the same morning runs again with it on.',
  controlRefusal:
    'The second run is still being simulated. Until it lands there is nothing to show you, so this will not press.',
  /*
   * GitHub issue #598, § D992: an assessor playing blind pressed the fix **before seeing anything
   * break**, because the press was live from the first frame. It waits now for the thing the lede
   * tells the player to watch for — somebody past a minute on a landing — or for the morning to
   * have played out, and it says so on its own face rather than looking dead.
   */
  controlWatchFirst:
    'Watch first. This presses once somebody on a landing has waited a minute, or once the morning has finished playing.',
  /*
   * **The non-visual register for the canvas and the press** — `docs/36` `AX-3`, whose policy is
   * that a live region is written *when its sentence changes and at no other time*.
   *
   * Three sentences and one beat, so the region is a pure function of the state and the mount can
   * compare before it writes. It is not a second wording of the picture — `docs/36` § 3.3's
   * refusal — it says which of the two runs is on the canvas and what the one control does, which
   * is the fact a reader who cannot see the canvas has no other route to.
   *
   * **What it does not carry, said rather than implied**: the frame itself. The block this screen
   * mounts is `everyday/asBuiltStage.ts`, whose canvas has no accessible name on any screen that
   * draws it, and that gap is registered in {@link TUTORIAL_ABSENCES} rather than papered over
   * here — a per-frame description assembled by this module would be the second source of truth
   * `docs/36` § 3.2 refuses.
   */
  sayPending: 'The morning is still being simulated.',
  sayAsBuilt:
    'The building is playing as it stands. One control sits under the picture: spread the cars out.',
  sayAsBuiltEnded:
    'The morning has finished playing, with nothing changed. The one control under it is still there: spread the cars out.',
  sayAnswered:
    'The cars have been spread out. The same morning is now playing twice side by side, as it stands and with that one change, and the worked answer is under it.',
  sayAnsweredEnded:
    'Both mornings have finished playing, side by side. The worked answer is under them.',
  complaintHeading: 'The letter',
  symptomHeading: 'What you are looking at',
  workedWhy:
    'This is a tutorial, so the answer is on the screen. From here on you get the building and the letter, and the answer is yours.',
  finish: 'Start playing',
  /* § D993: it read *"The day is filed and the main menu is next."* Nothing is filed now. */
  finishNote: 'Nothing is filed. The main menu is next, and the first day on your week is one you play.',
});

/* -------------------------------------------------------------------------- *
 * Screen two's pace, clock and figure captions — GitHub issue #598, § D992
 * -------------------------------------------------------------------------- */

/**
 * **The rung screen two crosses its quiet minutes at: 90 simulated seconds per real second.**
 *
 * GitHub issue **#598**, [§ D992](../../../../DECISIONS.md). Three assessors watched *Watch it come
 * apart* for about two minutes and saw three idle cars and nobody on a landing: at the player's
 * `4×` the case's first arrival is 146 real seconds in, and the first rider to wait a minute —
 * the thing the lede tells the player to watch for — is five minutes in. The issue's bar is that the
 * failure builds visibly **within about twenty seconds** of the screen opening.
 *
 * **A derivation from that bar and the ladder, not a taste.** On the shipped case's as-built run the
 * first moment anybody on a landing has waited a minute is 1 448 simulated seconds in (measured, and
 * re-measured by `tutorialRuns.test.ts` on every run of the suite). Crossing that at one rung inside
 * twenty real seconds needs at least 72.4× — so `30×`, the whole-day rung
 * (`stagePace.ts#BETWEEN_PEAKS_SIM_PER_REAL_S`), reaches it at 48 s and fails, and **`90×` is the
 * slowest rung on the ladder that meets it** (16 s). The test asserts both halves, so a case
 * re-authored with an earlier failure makes this constant too fast and says so.
 *
 * **Why this may leave § D344's cue budget where the whole day may not.** The whole day's between
 * rung is crossed while the building is carrying people, so it has to stay a speed at which a door
 * cycle is still a cue. Here the fast rung holds only while **nobody on any landing has waited a
 * minute** — the stretch the assessors described as *nothing moving* — and the picture drops to the
 * player's own rung the instant the thing worth watching begins. It is § D991's rule with a faster
 * quiet, on a run of a few dozen journeys rather than seven thousand, and it is one constant: set it
 * to the player's rung and the screen plays as it did.
 */
export const TUTORIAL_QUIET_SIM_PER_REAL_S = 90;

/**
 * **Screen two's speed at a playhead** — the player's rung while anybody on a landing has waited past
 * `stagePace.ts#PACE_HOLD_WAIT_S`, and {@link TUTORIAL_QUIET_SIM_PER_REAL_S} or the player's rung,
 * whichever is faster, otherwise. `longestStandingS` is the present frame's longest wait over every
 * pane on the canvas (`live/bands.ts#waitBandsAt(…).longestCurrentWaitS`), so it never reads ahead.
 */
export function tutorialPaceOf(input: {
  readonly longestStandingS: number | undefined;
  readonly watchingSimPerRealS: number;
}): number {
  const held = input.longestStandingS !== undefined && input.longestStandingS >= PACE_HOLD_WAIT_S;
  return held
    ? input.watchingSimPerRealS
    : Math.max(input.watchingSimPerRealS, TUTORIAL_QUIET_SIM_PER_REAL_S);
}

/** A multiplier as the ladder labels it — § D354: the label is the multiplier. */
function rungWord(simPerRealS: number): string {
  return `${String(simPerRealS)}×`;
}

/**
 * **Screen two's clock and the reason for its speed** — GitHub issue #598's *no clock*.
 *
 * The case's run declares no hour of the day, so the clock is **building time from the start of the
 * run** rather than a time of day a template never stated (`live/timeline.ts#clockAt` would fall
 * back to 06:00, which is a claim nobody authored). The second line says what the transport is
 * doing and why, from the present frame only — the same shape as the stage's § D991 note.
 */
export function tutorialClockOf(input: {
  readonly simTimeS: number;
  readonly startedAtS: number;
  readonly simPerRealS: number;
  readonly watchingSimPerRealS: number;
}): { readonly clock: string; readonly pace: string } {
  const elapsed = Math.max(0, Math.floor(input.simTimeS - input.startedAtS));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} into the morning`;
  const pace =
    input.simPerRealS > input.watchingSimPerRealS
      ? `${rungWord(input.simPerRealS)} while nobody on a landing has waited a minute`
      : `${rungWord(input.simPerRealS)}, your speed, while somebody has waited a minute`;
  return Object.freeze({ clock, pace });
}

/**
 * **What each figure card on screen one is of** — GitHub issue #598.
 *
 * Every card used to be captioned with the complaint's own measure, *"waits over a minute starting
 * at the upper flats"* — including the card about **the lower floors**, which is a caption
 * describing a different card. Each kind of figure `fixit/types.ts#FigureSpec` can carry gets its
 * own sentence here, keyed by kind so a new kind fails to type rather than inheriting a neighbour's.
 * None carries a digit: the figure is the card's value, read off the run.
 */
export const TUTORIAL_FIGURE_NOTES: Readonly<Record<FigureSpec['kind'], string>> = Object.freeze({
  complaint: 'The thing the letter is about, counted over this morning.',
  'scope-long-waits': 'Journeys starting on the floors the letter is about that waited over a minute for a car.',
  'scope-mean-wait': 'The wait for a car on the floors the letter is about, taken over the journeys that boarded.',
  'scope-worst-wait': 'The longest anybody on the floors the letter is about waited for a car.',
  'rest-away-pct': 'Every other journey in the building, for comparison with the floors the letter is about.',
});

/**
 * The three steps, in the order a player meets the controls.
 *
 * The `control` strings name surfaces this build ships — the dispatcher workshop's plain levers,
 * the stage's speed chips and its intervention row — rather than describing an editor in general.
 * A walkthrough that named a control the build does not have would be the stale refusal § D227 is
 * about, with its polarity reversed: it would tell a player to press something that is not there.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = Object.freeze([
  Object.freeze({
    id: 'levers',
    control: 'Dispatcher workshop · the four levers',
    title: 'Change how the lifts decide',
    body: 'Four plain levers sit over the dispatcher: how long anyone should wait, keep a car downstairs, spread the cars out, and how much room to leave in a car. Moving one changes the next run and nothing about the one you are watching.',
  }),
  Object.freeze({
    /*
     * The id **is** `mode/plainLevers.ts`'s lever id, and that pins the two screens to each other:
     * `tutorialModel.test.ts` resolves it against the shipped lever list and asserts its `writes`
     * clause names the same `idle.parkingStrategy` the tutorial case's diagnosed repair patches. A
     * walkthrough that taught a control the answer does not use would be two demonstrations
     * sharing a screen count rather than one lesson.
     */
    id: 'spread',
    control: 'Spread the cars out',
    title: 'The one this building needs',
    body: 'It decides where an idle car waits: huddled together, or one to a stretch of the tower. On a quiet building with three lifts and six floors, where the cars stand matters more than which one gets picked.',
  }),
  Object.freeze({
    id: 'run',
    control: 'The day · run, watch, close',
    title: 'Run it and read it',
    body: 'A day is simulated end to end and then played back, so you can move the clock, change speed, and go back over a moment. Closing the day writes the sheet and files it into your week.',
  }),
]);

/**
 * Screen one, worded.
 *
 * `figures` is whatever the caller read off the landed run, and this function invents none: with an
 * empty list it draws {@link TUTORIAL_COPY.figuresPending}, which says the run has not landed
 * rather than showing a zero. A tutorial is exactly where a stand-in figure is most tempting, which
 * is § D529's stated reason for requiring both screens to be real runs.
 */
export function tutorialWalkthroughViewOf(input: {
  readonly figures: readonly TutorialFigure[];
}): TutorialWalkthroughView {
  return Object.freeze({
    eyebrow: TUTORIAL_COPY.eyebrow,
    title: TUTORIAL_COPY.walkthroughTitle,
    lede: TUTORIAL_COPY.walkthroughLede,
    steps: TUTORIAL_STEPS,
    figuresHeading: TUTORIAL_COPY.figuresHeading,
    figures: input.figures,
    figuresNote:
      input.figures.length === 0 ? TUTORIAL_COPY.figuresPending : TUTORIAL_COPY.figuresLanded,
    skip: TUTORIAL_COPY.skip,
    skipNote: TUTORIAL_COPY.skipNote,
  });
}

/* -------------------------------------------------------------------------- *
 * Screen two — PM-DOOR, and the worked answer
 * -------------------------------------------------------------------------- */

/**
 * Screen two's own words — the letter, the symptom and the chrome around them.
 *
 * **The worked answer is deliberately not a field here.** It is its own component with its own
 * model (`workedAnswer.ts`) and its own pending arm, because § D529 clause 2 makes it the thing
 * Rush reuses: a copy of it hanging off this view would be a second place it could be worded, and
 * screen two would have to hand the rush one it computed. `tutorialScreens.ts#mountWorkedAnswer`
 * is the one place it is built, on both screens that draw it.
 */
/**
 * Which of screen two's two runs is on the canvas.
 *
 * `as-built` until the player presses the control: one canvas, the building as it stands.
 * `answered` afterwards: the **pair**, side by side at one playhead, which is
 * `everyday/caseStage.ts`'s two-pane block and the reason the press is legible at all — a single
 * canvas replaced by another single canvas asks the player to remember what they saw, and this
 * shows them the one variable they moved.
 *
 * It is the beat rather than a boolean because the live region, the block's wording, the captions
 * and the presence of the control are all functions of it, and four booleans that must agree is
 * four ways to disagree.
 */
export type TutorialBeat = 'as-built' | 'answered';

/**
 * The wording of the block that plays a run.
 *
 * Structurally `everyday/caseStage.ts#CaseStageCopy` — the same three fields, so the mount
 * hands this straight in rather than repacking it. Authored on the model side for that module's
 * own stated reason: the strings are then swept by the honesty corpus with the rest of this
 * screen's words, which a block that authored its own copy would not be.
 */
export interface TutorialStageCopy {
  readonly eyebrow: string;
  readonly note: string;
  readonly skip: string;
}

/**
 * **Screen two's one control**, and the reason this screen exists in the shape it does.
 *
 * `charter S1`: *a first-time player reaches a building in visible trouble within 90 s of first
 * load*. A building in trouble that the player cannot touch is a diagram; the press is what makes
 * it a game, and it is deliberately the **only** one on the screen.
 *
 * ## Its words are the shipped lever's, not this module's
 *
 * {@link label}, {@link from} and {@link to} are read out of
 * `mode/plainLevers.ts#plainLeversOf` at draw time. That is the whole mechanism of *wired to the
 * existing lever*: a tutorial that restated the label would be a second place to word a control
 * the workshop already words, and the day the workshop renamed it the first session would be
 * teaching a name the product no longer uses. `tutorialModel.test.ts` resolves the control's label
 * against the shipped lever list and fails if it is not exactly one of them.
 *
 * **The `writes` clause is deliberately not carried.** `mode/plainLevers.ts` says why in terms —
 * it is the engineer-facing tooltip, and *an Everyday-only surface would not render it*. It names
 * `idle.parkingStrategy: zone-center`, which is internal notation on a player surface and would be
 * a finding the moment the honesty corpus swept it. What the field is for is the test: it is where
 * the lever and the case's diagnosed repair are pinned to each other, in `tutorialRuns.test.ts`,
 * which has the case file loaded and can compare them.
 *
 * ## And it refuses out loud rather than silently
 *
 * {@link refusal} is present exactly while the second run has not landed, and the mount draws it
 * on the control itself. A press that did nothing and said nothing is the defect
 * `docs/05-roadmap.md`'s standing requirement is about, in the one place a stranger is deciding
 * whether the product answers when touched.
 */
export interface TutorialControlView {
  readonly heading: string;
  /** `mode/plainLevers.ts`' own label for the lever this presses. Never restated here. */
  readonly label: string;
  /** The lever's own read-line, from the same place. */
  readonly reads: string;
  /** The lever's two ends, in the prototype's words — which is what the canvas shows. */
  readonly from: string;
  readonly to: string;
  /** Why this control is the one on the screen. The tutorial's words, because the reason is. */
  readonly why: string;
  /** Present exactly while the second run has not landed. `undefined` means the press is live. */
  readonly refusal: string | undefined;
}

export interface TutorialCollapseView {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly complaintHeading: string;
  /** The tenant's own words, from the shipped case. `undefined` until the case file has loaded. */
  readonly complaint: string | undefined;
  readonly complainer: string | undefined;
  readonly symptomHeading: string;
  readonly symptom: string | undefined;
  /** Which run is on the canvas — see {@link TutorialBeat}. */
  readonly beat: TutorialBeat;
  /** The playing block's words, for whichever run is in it. */
  readonly stage: TutorialStageCopy;
  /** What stands where the block was, once its run has ended or been stopped. */
  readonly stageEnded: string;
  /** Why there is no canvas yet, or `undefined` once there is one. */
  readonly stagePending: string | undefined;
  /**
   * The captions over the block's panes, in order.
   *
   * Empty on the `as-built` beat, where there is one canvas and a caption would label the only
   * thing on screen — `caseStage.ts`'s own rule for the field, kept rather than restated. Two on
   * the `answered` beat, because two unlabelled canvases side by side are a puzzle.
   */
  readonly paneCaptions: readonly string[];
  /** The one control, on the `as-built` beat. `undefined` once it has been pressed. */
  readonly control: TutorialControlView | undefined;
  /** The live region's whole sentence — `docs/36` `AX-3`. Written only when it changes. */
  readonly say: string;
  readonly finish: string;
  readonly finishNote: string;
}

/**
 * The lever the one press moves, by id — `mode/plainLevers.ts`'s own, and the same id
 * {@link TUTORIAL_STEPS}' second step carries.
 *
 * Module-private on purpose. It is a pin between two shipped things rather than a value anybody
 * outside needs: the tests resolve the control's **label** against the shipped lever list, which is
 * the stronger assertion and needs no export to make.
 */
const TUTORIAL_LEVER_ID = 'spread';

/*
 * A neutral vector to read the lever's words off.
 *
 * The three fields this control draws — the label and the two ends — are **not functions of the
 * spec**: `plainLeversOf` reads the weights and flags only for a lever's *current value*, which
 * this screen does not draw, because the tutorial is not editing anybody's dispatcher. So the
 * vector handed in is a neutral one and nothing here claims to be the player's.
 *
 * Written out rather than taken from `authoring/dispatcherSpec.ts#blankSpec`, which is a value
 * import that would pull `@elevator-sim/experiments/browser` into a module the honesty corpus
 * loads for its strings. Type-only here, so the shape is still checked by the compiler.
 */
const NEUTRAL_SPEC: DispatcherSpec = Object.freeze({
  name: 'the building as it stands',
  weights: {},
  flags: { pool: false, zone: false, bypass: true },
  families: {},
});
const NEUTRAL_LEVERS: GroupLevers = Object.freeze({
  parking: false,
  express: false,
  dwell: undefined,
});

function tutorialControlViewOf(changeReady: boolean, mayPress: boolean): TutorialControlView {
  const lever = plainLeversOf(NEUTRAL_SPEC, NEUTRAL_LEVERS).find(
    (candidate) => candidate.id === TUTORIAL_LEVER_ID,
  );
  if (lever === undefined) {
    // An honest lookup rather than a fallback label: a tutorial that invented the name of a
    // control when the shipped list stopped carrying it would be teaching a press that is not
    // there, which is the one thing a first session may not do.
    throw new Error(`the tutorial names the plain lever "${TUTORIAL_LEVER_ID}", which is not shipped`);
  }
  return Object.freeze({
    heading: TUTORIAL_COPY.controlHeading,
    label: lever.label,
    reads: lever.reads,
    from: lever.atZero,
    to: lever.atFull,
    why: TUTORIAL_COPY.controlWhy,
    refusal: !changeReady
      ? TUTORIAL_COPY.controlRefusal
      : mayPress
        ? undefined
        : TUTORIAL_COPY.controlWatchFirst,
  });
}

/**
 * **The measured facts behind a worked answer** — the seam § D529's *real runs* obligation lands on.
 *
 * Every figure the worked answer draws is produced here, and every one of them comes from
 * `fixit/run.ts#measuredOf` over two recordings. Nothing is authored: the diagnosis, the reasoning,
 * the change and its effect are the shipped case's own validated copy, and the two counts are the
 * runs'. `tutorialRuns.test.ts` re-derives this from its own `recordRun` pair and compares field by
 * field, which is how *both screens are real runs on the real engine* becomes an assertion instead
 * of a claim.
 *
 * Pure, and in the model rather than in the mount for that reason: a fact-builder that could only
 * be reached through a `Worker` and a `fetch` is a fact-builder no node test can hold to a run.
 */
export function workedAnswerFactsOf(
  entry: FixitCase,
  before: VizRecording,
  after: VizRecording,
): WorkedAnswerFacts {
  const measured = measuredOf(entry, before, after);
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed === undefined) {
    throw new Error(`the tutorial's case "${entry.id}" has no diagnosed repair to show`);
  }
  return {
    diagnosis: entry.diagnosis.text,
    reasoning: entry.diagnosis.reasoning,
    change: diagnosed.name,
    effect: diagnosed.effect,
    measure: entry.complaint.measure.label,
    before: measured.complaintBefore,
    after: measured.complaintAfter,
    sameCrowd: measured.sameCrowd,
  };
}

/**
 * **The tutorial's entry point into the worked answer** — one of the two § D529 clause 2 names.
 *
 * The other is `rushScreenModel.ts#rushTutorialWorkedAnswerOf`. Both are one line, both call
 * `workedAnswer.ts#workedAnswerViewOf`, and the only thing they may differ on is the framing line
 * that says why an answer is on the screen — which differs because the reason does.
 * `workedAnswer.test.ts` drives both in one case with one set of measured facts and asserts every
 * other field is identical.
 */
export function tutorialWorkedAnswerOf(facts: WorkedAnswerFacts): WorkedAnswerView {
  return workedAnswerViewOf(facts, TUTORIAL_COPY.workedWhy);
}

/**
 * Screen two, worded.
 *
 * Every quoted field is optional and absent means *the case file has not loaded yet*, never a
 * stand-in: a tutorial that drew a placeholder complaint would be authoring the one piece of
 * writing `docs/35` § 9.1 calls the best in the product.
 *
 * ## The three beats, and why they are one function of two inputs
 *
 * `beat` says which run is on the canvas and `changeReady` says whether the second one exists yet.
 * Everything else on the screen follows from those two — the block's wording, whether the control
 * is there, whether it refuses, and the live region's sentence — so there is exactly one place the
 * screen's state is decided and the mount holds no opinion of its own. A screen that decided its
 * own live-region sentence beside a model that decided its own block wording is two answers to
 * *what is happening*, and `docs/36` `AX-2` exists because those drift.
 *
 * **The worked answer is still not a field here**, for the reason it never was: it is its own
 * component with its own model, because § D529 clause 2 makes it the thing Rush reuses. What this
 * view decides is only *when* it is drawn, through {@link TutorialCollapseView.beat} — after the
 * press, as confirmation, which is the half § D529 permits here and nowhere else.
 */
export function tutorialCollapseViewOf(input: {
  readonly complaint?: string | undefined;
  readonly complainer?: string | undefined;
  readonly symptom?: string | undefined;
  /** Which run is on the canvas. Defaults to the building as it stands. */
  readonly beat?: TutorialBeat | undefined;
  /** Whether the second run has landed. The control refuses out loud until it has. */
  readonly changeReady?: boolean | undefined;
  /**
   * Whether this beat has a recording to draw at all.
   *
   * **Not the same question as {@link runEnded}, and folding them into one flag was a bug this
   * screen shipped for exactly one commit.** *No picture yet* and *the picture has finished* are
   * opposite states that happen to share an absent canvas: with one flag, a run that played to its
   * own end printed *the morning is being simulated now* about a morning the player had just
   * watched — a sentence telling a reader to wait for something that had already happened.
   */
  readonly runReady?: boolean | undefined;
  /** Whether that recording's playback has finished or been stopped. */
  readonly runEnded?: boolean | undefined;
  /**
   * Whether the canvas has shown somebody past a minute on a landing — latched by the mount from
   * the present frame, never read ahead. GitHub issue #598, § D992: the press waits for it, or for
   * the as-built morning to have finished, so nobody is asked to fix a building before seeing it
   * break. Absent means *not yet*.
   */
  readonly troubleSeen?: boolean | undefined;
}): TutorialCollapseView {
  const beat: TutorialBeat = input.beat ?? 'as-built';
  const answered = beat === 'answered';
  const runReady = input.runReady ?? false;
  const runEnded = runReady && (input.runEnded ?? false);
  return Object.freeze({
    eyebrow: TUTORIAL_COPY.eyebrow,
    title: TUTORIAL_COPY.collapseTitle,
    lede: TUTORIAL_COPY.collapseLede,
    complaintHeading: TUTORIAL_COPY.complaintHeading,
    complaint: input.complaint,
    complainer: input.complainer,
    symptomHeading: TUTORIAL_COPY.symptomHeading,
    symptom: input.symptom,
    beat,
    stage: Object.freeze(
      answered
        ? {
            eyebrow: TUTORIAL_COPY.answeredEyebrow,
            note: TUTORIAL_COPY.answeredNote,
            skip: TUTORIAL_COPY.answeredSkip,
          }
        : {
            eyebrow: TUTORIAL_COPY.stageEyebrow,
            note: TUTORIAL_COPY.stageNote,
            skip: TUTORIAL_COPY.stageSkip,
          },
    ),
    stageEnded: answered ? TUTORIAL_COPY.answeredEnded : TUTORIAL_COPY.stageEnded,
    stagePending: runReady ? undefined : TUTORIAL_COPY.stagePending,
    paneCaptions: answered
      ? Object.freeze([TUTORIAL_COPY.paneAsBuilt, TUTORIAL_COPY.paneAnswered])
      : Object.freeze([]),
    /*
     * One press and it is spent. The control leaves on the beat it moved, rather than staying as a
     * toggle: a second press would have to put the building back, and *undo the fix* is not a
     * lesson — it is a control whose second state the worked answer below it then contradicts.
     */
    control: answered
      ? undefined
      : tutorialControlViewOf(input.changeReady ?? false, (input.troubleSeen ?? false) || runEnded),
    /*
     * Five states, five sentences, and the pairing is what `docs/36` `AX-3` needs: the mount may
     * only write the region when the sentence changes, so a state that shared a sentence with its
     * neighbour would be a real change the mount correctly suppressed.
     */
    say: !runReady
      ? TUTORIAL_COPY.sayPending
      : answered
        ? runEnded
          ? TUTORIAL_COPY.sayAnsweredEnded
          : TUTORIAL_COPY.sayAnswered
        : runEnded
          ? TUTORIAL_COPY.sayAsBuiltEnded
          : TUTORIAL_COPY.sayAsBuilt,
    finish: TUTORIAL_COPY.finish,
    finishNote: TUTORIAL_COPY.finishNote,
  });
}

/**
 * What the tutorial does not settle, for the build panel — `buildNotes.ts` carries it like every
 * other register, and `buildNotes.test.ts#ABSENCE_TRIAGE` names the issue each row waits on.
 */
export const TUTORIAL_ABSENCES: readonly string[] = Object.freeze([
  'The tutorial teaches a shipped fix case on Garden Apartments. Which building the first session should use is still open, and an authored one may replace it.',
  /*
   * **`docs/36` `AX-1`, on the screen this wave gave a canvas to.** The block is
   * `everyday/caseStage.ts`, shared with the fix-it screen, and its canvases carry no accessible
   * name on either. This screen adds the live region `AX-3` asks for and does **not** add a name,
   * because a per-frame description assembled here would be the second source of truth
   * `docs/36` § 3.2 refuses — the name has to come from the frame, in the block that holds it.
   *
   * Registered rather than left implied: a screen that acquires a picture and says nothing about
   * who can read it is the silence the standing requirement is about, one clause over.
   */
  'The picture on this screen has no name a screen reader can read. The sentence beside it says which run is playing and what the control does; the frame itself does not reach a reader who cannot see it.',
]);
