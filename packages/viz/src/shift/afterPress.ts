/**
 * **What the day did after the last press** — GitHub issue **#581**, the day report's missing link.
 *
 * ## The finding
 *
 * `docs/43` P3 scored understandability 6 / 10 against a bar of 8, and the assessor named one
 * missing link: *nothing on the career day report says which press moved which figure.* The
 * figures are on the sheet, the presses are on the sheet — `shift/report.ts#metaLinesFor` prints
 * `09:14 · parked the cars in the lobby` for every entry in the run record's log — and the
 * relation between them is drawn nowhere. The **rush** sheet is the product's own proof that such
 * a sentence can be written here: *"over the 90:00 the sheet's trend test measures, it grew 19.8
 * people a minute … 2 of the 3 standing at 12"* is a size and a location in the product's voice.
 *
 * ## Two arms, and the row says on its own face which one it is drawing
 *
 * #581 offers two permitted routes and forbids a third. **This module draws both permitted
 * routes**, one per arm, and the arm is chosen by whether the shell can hand it the day run
 * without the press:
 *
 * | arm | what the row says | the note it closes with |
 * |---|---|---|
 * | no pair (§ D900, unchanged) | what the day did after the press | {@link AFTER_PRESS_DISCLAIMER} |
 * | a pair ([§ D931](../../../../DECISIONS.md)) | **both runs**, at the same two instants, and both runs' verdicts ([§ D982](../../../../DECISIONS.md)) | {@link AFTER_PRESS_PAIR_NOTE}, and {@link AFTER_PRESS_VERDICT_NOTE} where the sheet grades |
 *
 * **Route 1 was rejected here and the rejection was half right**, which is why the second arm
 * exists. What § D900 settled is that a with-and-without pair on one seed cannot *declare a
 * difference*: it is one replication, and `CLAUDE.md`'s discipline is explicit — *never declare one
 * dispatcher better than another without a paired-t confidence interval that excludes zero*,
 * budgeting 50–200 replications, because ten produced a 12 % error against the converged mean in
 * the reference study. That is still true and nothing in the paired arm touches it. What it does
 * not settle is whether the pair may be **shown**. Two of this product's own screens already show
 * one — the tutorial's two arms on one seed, `fixit/run.ts`'s before-and-after at one playhead —
 * and they are honest because they state a fact about two runs rather than an estimate of an
 * effect. `shift/counterfactual.ts`' header is that argument at length, with the table that
 * separates the two claims.
 *
 * So the paired arm prints **two runs and never their difference**, in the same two counts of
 * people on both sides, and closes with {@link AFTER_PRESS_PAIR_NOTE} rather than with
 * {@link AFTER_PRESS_DISCLAIMER} — because a row that showed the unpressed run while still saying
 * *the day was not run again without it* would be `CLAUDE.md`'s stale-refusal defect manufactured
 * on purpose (§ D227).
 *
 * Where there is no pair the row is § D900's, word for word: the honest thing this sheet can then
 * say is **when** and **how much**, which is what the rush line the assessor praised says too — it
 * reports a size and a location and never claims the wave caused it.
 *
 * ## The rules this beat keeps, which are `shift/trouble.ts`'s rules on a smaller surface
 *
 * 1. **No mean, of anything.** Every figure is a count of people or a clock time, so R3's
 *    `suppressed-mean` class has nothing to sit beside and R13's *estimate without n* has no
 *    estimate to catch. That is structural here rather than a habit: `observationsAt`'s
 *    `waitingNow` and `carried` are counts of legs, and this module reads nothing else.
 * 2. **Every figure carries the cohort it is over.** *44 people standing* is people standing at
 *    that instant; *118 people delivered* is deliveries between the two clock times. Both are said
 *    in the sentence rather than implied by its position.
 * 3. **The window is the player's, and nothing else is inside it.** The beat names the **last**
 *    press and runs to the end of the run, so no other press falls in the window it reports. With
 *    more than one press it says how many came earlier, because a reader who cannot see the other
 *    presses would read this window as the whole day's.
 * 4. **No verb of cause.** *moved*, *because*, *caused*, *thanks to* and *made* are absent by
 *    construction and `afterPress.test.ts` fails on any of them, so the refusal is pinned by a run
 *    rather than by this paragraph. The paired arm keeps that list and adds a second one — the
 *    vocabulary of *estimation* rather than of cause (*better*, *worse*, *worth*, *saves*,
 *    *improves*, *would have*, *on average*) — in `counterfactual.test.ts`, because the failure a
 *    pair invites is not *the press caused it* but *the press is worth five people*. § D900's list
 *    is the floor and neither word of it was moved.
 *
 * ## Why it is a diagnosis row rather than a new field
 *
 * `shift/report.ts#diagnosisFor`'s own docstring records issue #56: a `report-window` row was
 * removed from that section because it was a **methodology footnote** wearing a timestamp —
 * word-for-word identical on a flawless day and a collapsed one, and nothing happened at the clock
 * it carried. This row is the other kind. Something did happen at its clock: the player pressed a
 * control, and the record holds the second they pressed it. A day nobody touched draws no row at
 * all, which is the same shape `interventionLogOf` already has (`[]` for an empty log, never a
 * placeholder line).
 *
 * The route choice, the rejection of route 1 and the four rules above are
 * [§ D900](../../../../DECISIONS.md) — an entry rather than this docstring alone, because the row
 * binds `shift/report.ts`'s diagnosis section, whose own docstring had read *two rows, both of
 * them events* since issue #56, and reaches `dev/reportPanel.ts`, `everyday/reportScreen.ts` and
 * `render/reportCard.ts` without any of them being asked.
 */

import type { RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { stampVerbOf } from '../live/interventions.js';
import { observationsAt } from '../live/observations.js';

import { lastPressInRun, pressesInRun, type PressCounterfactual } from './counterfactual.js';
import type { ReportDiagnosis } from './types.js';

/** The row's id, so a renderer or a test can name it without matching on its words. */
export const AFTER_PRESS_ROW_ID = 'after-press';

/**
 * **Which claim this row is making, in the copy itself** — #581's *"say which route in the copy"*.
 *
 * Three clauses and each is load-bearing. The first says what the reading is not: nothing here ran
 * the day without the press, so nothing here measures the press. The second and third say why the
 * sheet does not simply go and measure it, because a reader told *this is not measured* and not
 * told *and here is what measuring it would take* will reasonably assume nobody tried.
 *
 * It names no dispatcher and ranks nothing, so `docs/10` R2's *no comparative claim off one
 * replication* has nothing to catch; and it carries no figure at all, which is deliberate — the
 * numbers are in {@link ReportDiagnosis.what} and the row's own `why` opener, each under the
 * cohort it is over, and a refusal with a number in it is the shape R3 spends its length on.
 */
export const AFTER_PRESS_DISCLAIMER =
  'This is what the day did after the press, not what the press did: the day was not run again ' +
  'without it, so nothing here measures the change. One run either way would not settle it — the ' +
  'bench is where a difference is shown, over many runs of the same crowd.';

/**
 * **What kind of claim a pair of runs is** — § D931, and the paired arm's closing note.
 *
 * It replaces {@link AFTER_PRESS_DISCLAIMER} rather than joining it, because two of that
 * constant's three clauses stop being true the moment the row prints the unpressed run: the day
 * *was* run again without the press, and the row *does* show the change. Leaving it standing beside
 * a figure that contradicts it is `CLAUDE.md`'s stale-refusal defect (§ D227) — worse than a stale
 * seam, because a refusal tells the reader not to look at the thing beside it.
 *
 * Four clauses, each load-bearing and each about the **claim** rather than about the figures:
 *
 * 1. *two runs of one day, and that is all they are* — what the reading **is**, said before what
 *    it is not, because a player who has just been shown two numbers is already reading them.
 * 2. *one replication* — the repository's own unit, named so the sentence is checkable against
 *    `CLAUDE.md` rather than being a general disclaimer.
 * 3. the three ways the reading does not travel — another day, another crowd, another tower. Three
 *    rather than one, because *this is not general* is abstract and *this says nothing about
 *    tomorrow* is not.
 * 4. where the question **is** answered, which § D900 also carried: a reader told *not here* and
 *    not told *there* will reasonably assume nobody can.
 *
 * **It carries no figure**, exactly as {@link AFTER_PRESS_DISCLAIMER} carries none — not even the
 * replication budget, because a number inside a refusal is the shape R3 spends its length on, and
 * because this row's numerals are all counts of people with their cohort attached and a bare `50`
 * would be the one that is not.
 */
export const AFTER_PRESS_PAIR_NOTE =
  'Those are two runs of one day, and that is all they are. A with-and-without pair on one seed is ' +
  'a single replication, and a single replication settles nothing in general: nothing here says ' +
  'what that press does on another day, on another crowd, or on another tower. The bench is where ' +
  'a question like that is answered, over many runs of the same crowd.';

/**
 * **What kind of fact two verdicts are** — [§ D982](../../../../DECISIONS.md), the clause the
 * decision agent's ruling adds to {@link AFTER_PRESS_PAIR_NOTE} on every row that prints them.
 *
 * Kept as its own constant and appended rather than spliced into the note, because the note also
 * closes a paired row on a **single-run** sheet, which prints no verdict (its banner refuses to
 * grade — `docs/19` defect 13), and a clause about *the two verdicts* under a row with none would
 * be a caption over nothing.
 *
 * The clause is the half of the ruling that answers the selection effect: a player sent to a
 * pinned day meets a flip every time, against 126 flips in 700 pairs across fifty crowds per
 * pinned contract, so the row says on its own face that two verdicts from one crowd say nothing
 * about another. `pressLadder.test.ts` pins that premise by a run — on `c7` the same press clears
 * one crowd's missed day and misses another crowd's cleared one — which is § D227's rule that a
 * refusal is pinned by a run and never by another sentence.
 *
 * No digit, no word from § D900's causal list or the estimation list, and no press as the subject
 * of *clears* or *misses*.
 */
export const AFTER_PRESS_VERDICT_NOTE =
  'The two verdicts are the same kind of fact as the counts: how this crowd’s day was graded with ' +
  'that press and without it, and nothing about how a day is graded for any other crowd, even in ' +
  'this tower.';

/**
 * Both runs' verdicts, graded by `shift/report.ts`'s own grader against the sheet's own goals —
 * [§ D982](../../../../DECISIONS.md). Built there (this module grades nothing), carried here as
 * words.
 */
export interface PairVerdicts {
  /** This run: the banner's own line, and the goals it missed by name (empty unless it missed). */
  readonly pressed: PairVerdictSide;
  /** The run without the last press, graded over its own whole run. */
  readonly unpressed: PairVerdictSide;
}

export interface PairVerdictSide {
  /** `VERDICT_VOICE[verdict].line` — *Shift cleared*, *Shift missed*, *Too quiet to grade*. */
  readonly line: string;
  /** `shift/goals.ts#goalPlainNameOf` for each goal read `missed`, in the goal table's order. */
  readonly missedGoals: readonly string[];
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/** *Shift missed on the worst-wait goal* / *Shift cleared*. */
function verdictWords(side: PairVerdictSide): string {
  return side.missedGoals.length === 0 ? side.line : `${side.line} on ${listOf(side.missedGoals)}`;
}

/**
 * The sentence that prints both verdicts — [§ D982](../../../../DECISIONS.md).
 *
 * Four things about it are the ruling's constraints rather than phrasing, and each is pinned by
 * `counterfactual.test.ts`:
 *
 * 1. **Always both, in the counts' order** — this run, then the run without the press — and the
 *    words do not depend on whether the two agree. No flag, tone or ordering is keyed on
 *    agreement, because a row that spoke up only on a flip would tell only the *my press decided
 *    it* story and hide the four days in five that correct it.
 * 2. **No word connects them.** Not *still*, *either way*, *turned*, *decided* or *would*: two
 *    facts, side by side, and the reader draws the line if there is one to draw.
 * 3. **The press is never the subject of the verdict.** *The run without that press, over its own
 *    whole day, reads …* keeps five words between *press* and the verdict, so the sentence cannot be
 *    read as *the press cleared*; `counterfactual.test.ts` holds that with a pattern.
 * 4. **The unpressed verdict is its whole day's**, and the words say so, rather than attaching it
 *    to *those same two clock times* the counts are read at. The two runs can end seconds apart and
 *    a verdict is a property of a whole day.
 */
function verdictClause(verdicts: PairVerdicts | undefined): string {
  if (verdicts === undefined) return '';
  return (
    ` Graded against the same goals, this run reads ${verdictWords(verdicts.pressed)}; the run` +
    ` without that press, over its own whole day, reads ${verdictWords(verdicts.unpressed)}.`
  );
}

/** Said when presses came before the one this row names, so its window is not read as the day's. */
function earlierPressClause(earlier: number): string {
  if (earlier === 0) return '';
  const word = earlier === 1 ? 'press' : 'presses';
  const verb = earlier === 1 ? 'is' : 'are';
  return ` ${String(earlier)} earlier ${word} ${verb} in the log above, outside this window.`;
}

/** `44 people` / `1 person`. */
function people(count: number): string {
  return `${String(count)} ${count === 1 ? 'person' : 'people'}`;
}

/**
 * The other run, in the same two counts and at the same two instants — § D931's paired arm.
 *
 * Four things about the wording are decisions rather than phrasing, and each is pinned by
 * `counterfactual.test.ts`:
 *
 * 1. **The three figures are the same three on both sides**, in the same order and the same
 *    words. A pair whose sides answer different questions is not a pair, and a reader comparing
 *    *standing* against *delivered* across a clause is what a re-ordered second half invites. The
 *    third of them — people picked up after a long wait — is drawn **only on this arm**, so
 *    § D900's unpaired row is byte-identical to what it shipped: there is nothing to compare it
 *    against there, and a lone count would be a figure the row has no use for.
 *    `shift/counterfactual.ts`' header measures why it is the third figure and not the longest
 *    wait: on a day that drains, the first two are identical in both arms.
 * 2. **Past perfect, and no modal.** *had also been run* rather than *would have ended*. The
 *    unpressed run is a run that happened — it is the recording the player was watching before
 *    they pressed (`shift/counterfactual.ts`) — and a modal would turn a fact about a recording
 *    into a claim about a world.
 * 3. **The three things held constant are named**: the seed, the crowd, and *nothing else
 *    changed*. That is what makes the two numbers worth putting side by side, and it is exactly
 *    what `pressCounterfactualOf`'s grounds 1–5 checked before this sentence was allowed.
 * 4. **No difference is stated**, and none is computed anywhere in this module. The reader may
 *    subtract; the sheet may not, because a subtraction off one replication is an estimate and the
 *    row is not entitled to one. This is the single line that separates § D931 from the thing
 *    § D900 refused.
 *
 * The two runs' **verdicts** are not this clause's: {@link verdictClause} prints them after it,
 * since [§ D982](../../../../DECISIONS.md) amended § D931 clause 3.
 */
function pairClause(pair: PressCounterfactual | undefined, ourLongWaits: number): string {
  if (pair === undefined) return '';
  return (
    ` By the end of the day ${people(ourLongWaits)} had been picked up after a wait past the run's` +
    ' own long-wait mark. The same day, from the same seed and the same crowd, had also been run' +
    ' without that press and with nothing else changed: read at those same two clock times, that' +
    ` run had ${people(pair.standingAtWindowEnd)} standing at the landings, had delivered ` +
    `${people(pair.deliveredInWindow)} between them, and had picked up ` +
    `${people(pair.longWaitsByWindowEnd)} after a wait past that same mark.`
  );
}

/**
 * The beat, or `undefined` when the run has no press to report one for.
 *
 * `undefined` on three states and each is a state rather than a failure: an untouched day, a run
 * whose only presses are stamped at or past its own end (there is no window left to read), and a
 * record whose presses all fall outside its own span. A row is never drawn empty — #581's *"a day
 * with no presses draws no such line and says nothing instead of inventing one"*.
 *
 * The clock is passed in rather than imported, because `shift/report.ts` owns the shift clock and a
 * second mapping from simulated seconds to `HH:MM` would be two answers to *what time is it in this
 * building* — the defect that module's own `clockOf` docstring exists to refuse.
 */
export function afterPressBeatOf(
  recording: VizRecording,
  interventions: readonly RunInterventionConfig[],
  clockRangeOf: (startS: SimTime, endS: SimTime) => string,
  counterfactual?: PressCounterfactual | undefined,
  verdicts?: PairVerdicts | undefined,
): ReportDiagnosis | undefined {
  /*
   * Inside the run's own span, strictly before its end, and in time order — all three owned by
   * `shift/counterfactual.ts#lastPressInRun` rather than here, so that the row and the pair beside
   * it cannot disagree about *which press*. A press stamped at `endedAt` has no window after it,
   * and a reading over an empty window would publish `0 people delivered` about a building that
   * was not asked to deliver anybody — a true figure making a false impression, which is the class
   * this sheet's refusals are for.
   */
  const ordered = pressesInRun(recording, interventions);
  const last = lastPressInRun(recording, interventions);
  if (last === undefined) return undefined;

  const then = observationsAt(recording, last.atS);
  const end = observationsAt(recording, recording.endedAt);
  /*
   * Clamped at zero rather than trusted. `carried` is non-decreasing in `t` by construction, so a
   * negative here would be a record whose legs are not sorted — and a sheet printing `-3 people
   * delivered` would be reporting a defect in a vocabulary the player cannot act on.
   */
  const delivered = Math.max(0, end.carried - then.carried);
  /*
   * The pair is used only when it is a pair **of this press**. `pressCounterfactualOf` already
   * refuses six ways, and this is the seventh and the cheapest: **both** ends of the window are
   * checked, because a value built around another press or another end would print two runs whose
   * windows do not line up under a sentence claiming they do. Belt and braces on purpose — the two
   * answers to *which press* come from one function, and this asserts that they did.
   */
  const pair =
    counterfactual?.pressAtS === last.atS && counterfactual.windowEndS === recording.endedAt
      ? counterfactual
      : undefined;

  return {
    id: AFTER_PRESS_ROW_ID,
    when: clockRangeOf(last.atS, recording.endedAt),
    what: `You ${stampVerbOf(last.change)}, with ${people(then.waitingNow)} standing at the landings`,
    why:
      `${people(end.waitingNow)} were standing when the day ended, and ${people(delivered)} were ` +
      'delivered between those two clock times.' +
      pairClause(pair, Math.max(0, end.servedCount - end.servedUnderThresholdCount)) +
      /*
       * § D982. Only beside a pair — the unpaired row is § D900's, byte for byte, and carries no
       * verdict word — and only when the sheet graded (a single-run sheet passes none).
       */
      (pair === undefined ? '' : verdictClause(verdicts)) +
      `${earlierPressClause(ordered.length - 1)} ` +
      (pair === undefined
        ? AFTER_PRESS_DISCLAIMER
        : verdicts === undefined
          ? AFTER_PRESS_PAIR_NOTE
          : `${AFTER_PRESS_PAIR_NOTE} ${AFTER_PRESS_VERDICT_NOTE}`),
    /*
     * **Never toned.** A press is not a fault, and `diagnosisRowsOf` paints `bad` and `caution`
     * from this field: a red edge under a sentence that explicitly claims no cause would say, in
     * colour, the thing the words refuse to say. `plain` on every day, cleared or missed.
     */
    tone: 'plain',
  };
}
