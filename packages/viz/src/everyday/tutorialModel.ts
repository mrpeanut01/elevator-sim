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
 * `tutorialScreens.ts#leave` is that condition: **both** the skip and the finish run the day and
 * file it, so `week.history` is non-empty by the time anything could reload.
 * `tutorialModel.test.ts` asserts the property over the whole space this gate can be in rather
 * than over one example — every progress {@link tutorialIsDue} answers `true` for answers `false`
 * once a day is filed — and reads `tutorialScreens.ts` off disk to check that `leave` is the one
 * thing both ways out call.
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
import type { VizRecording } from '../contract/types.js';
import { measuredOf } from '../fixit/run.js';
import type { FixitCase } from '../fixit/types.js';
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
 * *Skip* and *Finish* leave the tutorial the same way: `tutorialScreens.ts#leave` runs the day and
 * files it, so `filedDays` has moved by the time anything could reload. The skip is therefore not a
 * way past the first day, it is a way past **being walked through** it, which is the distinction
 * that makes the condition satisfiable at all — a skip that changed nothing persisted would hand
 * the same screen back on the next load.
 *
 * There is deliberately **no `TUTORIAL_EXIT` constant and no `progressAfterExit` helper**. Both
 * existed in a draft of this module and neither had a shipped caller: the mount does the filing
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
  skipNote:
    'The day still runs and still gets filed, so this is a way past the walkthrough rather than a way past the day.',
  collapseTitle: 'Watch it come apart',
  collapseLede:
    'This is the same building with nothing changed. Watch the three cars, and watch the fourth floor.',
  collapsePending:
    'The day is being simulated now, twice — once as it stands and once with one thing changed. Nothing is shown until both land.',
  complaintHeading: 'The letter',
  symptomHeading: 'What you are looking at',
  workedWhy:
    'This is a tutorial, so the answer is on the screen. From here on you get the building and the letter, and the answer is yours.',
  finish: 'Start playing',
  finishNote: 'The day is filed and the main menu is next.',
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
  readonly finish: string;
  readonly finishNote: string;
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
 */
export function tutorialCollapseViewOf(input: {
  readonly complaint?: string | undefined;
  readonly complainer?: string | undefined;
  readonly symptom?: string | undefined;
}): TutorialCollapseView {
  return Object.freeze({
    eyebrow: TUTORIAL_COPY.eyebrow,
    title: TUTORIAL_COPY.collapseTitle,
    lede: TUTORIAL_COPY.collapseLede,
    complaintHeading: TUTORIAL_COPY.complaintHeading,
    complaint: input.complaint,
    complainer: input.complainer,
    symptomHeading: TUTORIAL_COPY.symptomHeading,
    symptom: input.symptom,
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
]);
