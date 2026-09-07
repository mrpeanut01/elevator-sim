/**
 * **The worked answer — the one component in this product allowed to say what it would have
 * done**, and the module that exists so that permission has exactly one address.
 *
 * [§ D529](../../../../DECISIONS.md) clause 4, in the product owner's own instruction to *"write
 * the boundary down once"*:
 *
 * > A worked answer is permitted in the tutorial and nowhere else. No hint control, no suggested
 * > fix, no diagnosis line, and no *here is what we would have done*, in any scenario, in any mode,
 * > at any ladder position.
 *
 * [§ D525](../../../../DECISIONS.md) clause 2 retires proposed fixes from every scenario — the
 * four-repair menu, the five decoys and the printed line saying what kind of fix it is all go — and
 * this component shows one anyway. The two coexist because **a tutorial teaches and a scenario does
 * not**, and for no other reason. Without the boundary written down once, this component is reused
 * as a hint button on scenario twelve and the thing § D525 scrapped comes back through the side
 * door.
 *
 * **So the boundary is a build failure rather than a paragraph.** `boundaries.test.ts` holds the
 * allowlist of modules that may import this one; a module outside the tutorial that gains it turns
 * the suite red, and the failure message says which of the two remedies applies. The allowlist has
 * three names and one of them is the honesty sweep, which renders every player-facing string and
 * draws none.
 *
 * ## Two entry points, one component — § D529 clause 2
 *
 * *"Screen two is reused as the Rush tutorial when the player later opens Rush. Building it twice
 * is what this clause exists to prevent."* So this module exports the **view**, and the two entry
 * points are one line each — `tutorialModel.ts#tutorialWorkedAnswerOf` and
 * `rushScreenModel.ts#rushTutorialWorkedAnswerOf`. Everything below the framing line is identical
 * between them by construction rather than by review, and `workedAnswer.test.ts` drives both in one
 * case and compares the bodies.
 *
 * ## Every figure here is a run's, and none of them is authored
 *
 * {@link WorkedAnswerFacts} carries two numbers and neither has a literal anywhere in this file:
 * they are `fixit/run.ts#measuredOf`'s `complaintBefore` and `complaintAfter`, read off two
 * recordings the shipped `recordRun` made from the shipped `fixitRunPlanOf` pair. § D529's
 * obligation is that *both screens are real runs on the real engine, not scripted mocks* — a
 * tutorial being exactly where a stand-in figure is most tempting — and `tutorialRuns.test.ts`
 * runs the engine and asserts the movement this component reports is the movement the runs made.
 *
 * Pure. No DOM, no host, no `data/` read. `tutorialScreens.ts#mountWorkedAnswer` draws what this
 * returns, and the honesty corpus sweeps it without a document.
 */

/**
 * What a worked answer is *about*, all of it measured or authored in `data/` — never composed here.
 *
 * The three prose fields come from the shipped case file, which `fixit/parse.ts` validates for
 * player-facing copy (no probability words, no engine identifier). The two numbers come from a
 * pair of runs. This module words the movement between them and nothing else.
 */
export interface WorkedAnswerFacts {
  /** What was wrong, in the case's own words — `FixitCase.diagnosis.text`. */
  readonly diagnosis: string;
  /** Why, at length — `FixitCase.diagnosis.reasoning`. */
  readonly reasoning: string;
  /** The change that answers it — the **diagnosed** repair's name. */
  readonly change: string;
  /** What that change does, and what it costs, in the case's words — the repair's `effect`. */
  readonly effect: string;
  /** What is being counted, in the player's words — `ComplaintMeasure.label`. */
  readonly measure: string;
  /** The count on the run as built. `measuredOf(...).complaintBefore`. */
  readonly before: number;
  /** The count on the same crowd with the change applied. `measuredOf(...).complaintAfter`. */
  readonly after: number;
  /**
   * Whether the two runs met the same crowd, measured on the legs by `record/crowd.ts`.
   *
   * Carried because the basis line depends on it and a component that assumed *the same crowd*
   * would be making the claim § D350's fix-it site exists to stop anybody making by assertion.
   */
  readonly sameCrowd: boolean;
}

/** The worked answer, as words. Every field is drawn; none is optional. */
export interface WorkedAnswerView {
  readonly heading: string;
  /**
   * Why the player is being handed an answer at all — the one field the two entry points differ
   * on, because the reason differs and saying the same thing in both places would be false in one.
   */
  readonly why: string;
  readonly diagnosis: string;
  readonly reasoning: string;
  readonly changeHeading: string;
  readonly change: string;
  readonly effect: string;
  /** `7 waits over a minute starting at the upper flats` — the count with its own label. */
  readonly before: string;
  readonly after: string;
  /** What moved, in one line, from the two numbers above and no third figure. */
  readonly movement: string;
  /** What the pair of runs is, so the movement is not read as a result it is not. */
  readonly basis: string;
  /** § D529 clause 4, on the surface it is about. */
  readonly boundary: string;
}

/**
 * The words this component owns.
 *
 * `boundary` is on the player's screen rather than only in this docstring on purpose: the clause it
 * states is the reason the screen is allowed to exist, and a player who meets a worked answer here
 * and never again is owed the sentence that says so. It is also what stops the next reader assuming
 * the absence of a hint button elsewhere is an oversight.
 */
export const WORKED_ANSWER_COPY = Object.freeze({
  heading: 'What would have fixed it',
  changeHeading: 'The change',
  basisSameCrowd:
    'Two runs of the same day, same crowd, same seed — one as it was built, one with that change and nothing else.',
  basisDifferentCrowd:
    'Two runs of the same day. The change moves who arrives as well as how they are carried, so the two crowds are not the same one and the counts are not paired.',
  /*
   * What stands here before the pair lands, and it belongs to the component rather than to either
   * screen: both entry points draw the same two runs, so a pending line owned by the tutorial would
   * be the tutorial's words appearing on the rush's screen. It says what is happening rather than
   * showing a zero, which is § D529's *real runs* obligation in the state where it is easiest to
   * break.
   */
  pending:
    'The day is being simulated now, twice — once as it stands and once with one thing changed. Nothing is shown until both land.',
  boundary:
    'This is the only place the game answers for you. In a scenario you get the building, the letter and the whole editor, and no suggested fix.',
});

/** `7 waits over a minute starting at the upper flats`, with the count read off a run. */
function countedAs(count: number, measure: string): string {
  const rounded = Math.round(count * 10) / 10;
  const shown = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${shown} ${measure}`;
}

/**
 * What moved, said once.
 *
 * Three arms, and the third is the one worth keeping: a change that moved nothing says so. A
 * worked answer whose own runs did not move is still a worked answer — it is just a wrong one, and
 * wording it as a win would be the fabrication § D529's *real runs* obligation is about.
 * `tutorialRuns.test.ts` asserts the shipped tutorial does not reach that arm, which is what makes
 * the arm a guard rather than a decoration.
 */
function movementOf(before: number, after: number): string {
  if (before === after) return 'That change moved this count by nothing on this day.';
  if (after > before) {
    return `That change made this count worse on this day, ${String(before)} to ${String(after)}.`;
  }
  const gone = before <= 0 ? null : Math.round(((before - after) / before) * 100);
  const share = gone === null ? '' : ` — ${String(gone)} % of it`;
  return `${String(before)} to ${String(after)}${share}, on the same day, with nothing bought.`;
}

/**
 * Word a worked answer.
 *
 * `why` is the caller's because the caller is the only one that knows which entry point this is;
 * every other field is a function of the facts, so the two entry points cannot drift apart in what
 * they claim about the runs — only in why they are showing them.
 */
export function workedAnswerViewOf(facts: WorkedAnswerFacts, why: string): WorkedAnswerView {
  return Object.freeze({
    heading: WORKED_ANSWER_COPY.heading,
    why,
    diagnosis: facts.diagnosis,
    reasoning: facts.reasoning,
    changeHeading: WORKED_ANSWER_COPY.changeHeading,
    change: facts.change,
    effect: facts.effect,
    before: countedAs(facts.before, facts.measure),
    after: countedAs(facts.after, facts.measure),
    movement: movementOf(facts.before, facts.after),
    basis: facts.sameCrowd
      ? WORKED_ANSWER_COPY.basisSameCrowd
      : WORKED_ANSWER_COPY.basisDifferentCrowd,
    boundary: WORKED_ANSWER_COPY.boundary,
  });
}
