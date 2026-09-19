/**
 * **How long a sitting takes, in the player's evening** — GitHub issue **#559**.
 *
 * Five strings a player reads *before* choosing a mode say how long a sitting is. They are the last
 * thing read before an evening is committed, so they are a claim about **wall clock** — and they
 * were wrong by a factor of four to five, corresponding to roughly 5–6 simulated seconds per real
 * second, which is no rung on the ladder `stageScreenModel.ts#stageSpeedAt` ships. This module is
 * the one place those figures are decided, and every one of them is composed here rather than
 * typed.
 *
 * ## Three rules, and each exists because its opposite was the tempting fix
 *
 * 1. **The rung is read, never transcribed.** Every figure below divides a span in simulated
 *    seconds by `stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX).simPerRealS`, and every string names that
 *    rung by `.label`. [§ D641](../../../../DECISIONS.md) replaced three test literals reading
 *    `30×` with exactly that read, because a rung that has moved twice would otherwise have to be
 *    re-transcribed twice; a session-shape figure has the same property. Move
 *    `DEFAULT_STAGE_SIM_PER_REAL_S` and all five strings move with it, on the same commit, with no
 *    document to remember.
 * 2. **Rounding goes up, never to a friendlier number.** {@link sittingMinutes} is `Math.ceil`.
 *    Twenty-two and a half minutes reads *23*, not *20*, and 3 min 45 s reads *4*, not *3*. A
 *    session-shape figure that is optimistic by a factor is the thing this repository's honesty
 *    discipline exists to catch, and the direction of a rounding error on the screen where a
 *    person decides how to spend their evening is not a matter of taste.
 * 3. **A span is a measurement of the shipped content, not an estimate.** Each entry below carries
 *    the file its span was read from and `sittingShape.test.ts` asserts it against that file, so a
 *    stage re-authored at 1 200 s moves these strings by failing a test rather than by somebody
 *    noticing. That is `modes.test.ts`' own idiom for the *eighteen* two files over.
 *
 * ## What is a figure here and what is deliberately not
 *
 * **Named:** the watching. A sitting's watching is a recording played back at a rung, and that is
 * the term the player is committing an evening to.
 *
 * **Measured and then dropped as below the rounding:** the simulate wait. A sitting begins with a
 * run being computed before a frame is drawn, and that is wall clock too — it is not a function of
 * the rung, so no derivation from the ladder can see it. `sittingClock.measure.test.ts` measured
 * it: **75 ms** for the opening building-day, **417 ms** for a second one, **903 ms** for a fix
 * case's pair and **2 716 ms** for a rush. Against seven to twenty-three minutes of watching it is
 * under the minute these strings round to, so it is named here and **not added**. It was worth
 * measuring precisely because that conclusion was not available without measuring it — and the
 * rush's is the one that shows why it had to be a clock: it is thirty-six times the shortest, and
 * no function of the rung could have told you that.
 *
 * **Refused:** the player's own dwell — reading the letter, choosing a repair, looking at the
 * report. Nothing in this repository measures it and no constant here invents one. So every figure
 * below is a **floor on the watching** rather than a total sitting, and the strings say *watched*
 * where there is room for the word. A friendly total assembled from a measured half and a guessed
 * half would be the stated-mechanism defect `CLAUDE.md` records under *a published number goes
 * stale the same way*, with the guess inside the number where no reader can see it.
 *
 * ## The sibling that solved the same problem the other way, and why this is not it
 *
 * `scenario/ladder.ts#shapeOf` draws a path row's length as *"15 min in the building"* — building
 * time, explicitly not real time — and its docstring says why: *"the stage plays a recording back
 * at a speed the player picks and a bare `15 min` would be a claim about their evening."* That is
 * right **for a row that is describing a run**. These five strings are describing a *session*: a
 * claim about the evening is the whole of what they are for, and refusing to make one would
 * satisfy the honesty rule and fail the player, who came to the tile to find out whether they have
 * time. So the two modules disagree on purpose, and each says so.
 *
 * Recorded under [§ D753](../../../../DECISIONS.md), which carries the measurement, the five
 * strings it moved and the four documents that repeated them.
 */

import { DEFAULT_STAGE_SPEED_INDEX, stageSpeedAt } from './stageScreenModel.js';

/**
 * A sitting's watching, in simulated seconds, with the file that says so.
 *
 * `lowSimS === highSimS` where the shipped content is one length, and the two differ where a player
 * can meet either end of a real spread. The spread is drawn rather than averaged: an average over
 * the rush's own distribution would publish eighteen minutes on a mode whose entire point is that
 * the length is the outcome.
 */
export interface SittingSpan {
  readonly lowSimS: number;
  readonly highSimS: number;
  /** The file this span is read from — asserted by `sittingShape.test.ts`, never by a reader. */
  readonly source: string;
}

/**
 * Every span a shipped sitting can have, in simulated seconds.
 *
 * **`fixCase` is the one entry that is not an authored duration**, and the difference is the point:
 * a case plays the as-built run and then the pair, and each recording runs past its authored
 * `durationS` while the building drains. So the span is what the simulator produced, censused over
 * all eighteen cases by `sittingClock.measure.test.ts`' span leg, not `2 × durationS`.
 */
export const SITTING_SPANS = Object.freeze({
  /** One campaign stage — Career's building-day. */
  campaignStage: Object.freeze({
    lowSimS: 900,
    highSimS: 900,
    source: 'data/campaign.json',
  }),
  /** One contract day — the Scenario hub's *Today's scenario*, which opens § 6.1's front door. */
  contractDay: Object.freeze({
    lowSimS: 1800,
    highSimS: 3600,
    source: 'packages/viz/src/dev/state.ts#DEFAULT_SHIFT_LENGTH_S and shift/contracts.ts',
  }),
  /** One fix-a-building case — the as-built run watched, then the pair. */
  fixCase: Object.freeze({
    lowSimS: 3085.1,
    highSimS: 5400,
    source: 'data/fixit-cases.json, simulated by sittingClock.measure.test.ts’ span leg',
  }),
  /**
   * One rush, from the start to the hold — or to the end of the stream where it never holds.
   *
   * 95 of the house's 221 measured cells never hold, and those run the whole 5 400 s stream, which
   * is where the top of this range comes from. It is not a worst case: it is the commonest one.
   */
  rush: Object.freeze({
    lowSimS: 956,
    highSimS: 5400,
    source: 'data/rush-house-runs.json',
  }),
} satisfies Readonly<Record<string, SittingSpan>>);

/** The rung every figure here is quoted at — the stage's shipped opening speed. */
function openingRung(): { readonly label: string; readonly simPerRealS: number } {
  return stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX);
}

/**
 * Real minutes of watching for a span of simulated seconds at a rung — **rounded up, always**.
 *
 * `Math.ceil` is rule 2 of this module's docstring and is not a style choice: every rounding error
 * this function can make lands on the side of the sitting being shorter than advertised being
 * impossible.
 */
export function sittingMinutes(
  simS: number,
  simPerRealS: number = openingRung().simPerRealS,
): number {
  return Math.ceil(simS / simPerRealS / 60);
}

/**
 * The length clause of a shape string — *"8-15 min a day at 4×"*, or *"~4 min a building-day at 4×"*
 * where the shipped content is one length.
 *
 * The rung's own label is appended rather than left implicit, and that is what keeps the figure
 * true for a player who has moved their **Default speed** in Settings: the string names the rung it
 * was quoted at, so a player running `30×` can see at a glance that the figure is not theirs. The
 * alternative — reading `everydayProfileStore().defaultSpeed()` here — would make `EVERYDAY_MODES`
 * a function of browser storage, and a mode tile that cannot be built without a `localStorage` is a
 * tile `honesty/surfaces.ts` cannot sweep.
 *
 * `noun` is what the length is *of*, and it is not decoration: *~5 min* told a player nothing about
 * five minutes of what, which is half of why the retired strings were unusable even where they were
 * not wrong. Omit it where the tile covers more than one kind of sitting.
 *
 * Under a minute reads *"under a minute"* rather than *"1 min"*, because the ladder reaches `600×`
 * and *1 min* for a run that takes fifteen seconds is this module's own defect at the other end.
 */
export function sittingLengthPhrase(span: SittingSpan, noun = ''): string {
  const rung = openingRung();
  const of = noun === '' ? '' : ` ${noun}`;
  if (span.highSimS / rung.simPerRealS < 60) return `under a minute${of} at ${rung.label}`;
  const low = sittingMinutes(span.lowSimS, rung.simPerRealS);
  const high = sittingMinutes(span.highSimS, rung.simPerRealS);
  const figure = low === high ? `~${String(high)} min` : `${String(low)}-${String(high)} min`;
  return `${figure}${of} at ${rung.label}`;
}

/**
 * The Scenario tile's own span: the shortest sitting the hub offers to the longest.
 *
 * It is the union of the hub's two entries rather than either of them, because the tile is the
 * press that reaches both and a figure quoting one would be advertising the shorter.
 */
const SCENARIO_HUB_SPAN: SittingSpan = Object.freeze({
  lowSimS: SITTING_SPANS.contractDay.lowSimS,
  highSimS: SITTING_SPANS.fixCase.highSimS,
  source: `${SITTING_SPANS.contractDay.source}; ${SITTING_SPANS.fixCase.source}`,
});

/**
 * The five session-shape strings, composed once.
 *
 * Each is *length · what the length is of · the promise the retired string already carried*. Every
 * lose-condition and every retry clause below is the design handoff's own wording, kept word for
 * word: `CLAUDE.md`'s division is that the handoff wins every disagreement about what the screen
 * looks like and the simulator wins every disagreement about what a number means, and only the
 * numbers moved.
 *
 * `modes.ts` and `scenarioModel.ts` consume these by name. Neither may compose one of its own —
 * `sittingShape.test.ts` fails on a minute literal in either file — because five figures assembled
 * in three places is how they came to disagree with the ladder in the first place.
 */
export const SITTING_SHAPES = Object.freeze({
  /**
   * The Scenario tile, which covers both of the hub's entries.
   *
   * *skippable* is on the face of it rather than left to be discovered, because a twenty-four
   * minute figure with no exit beside it reads as a twenty-four minute commitment, and
   * `caseStage.ts` ships a skip on every run a case plays. Naming the length without the escape
   * would be true and would misinform, which is the P2 half of what this module is for.
   */
  scenarioMode: `${sittingLengthPhrase(SCENARIO_HUB_SPAN)}, skippable · retry as often as you like`,
  /** The Career tile. The lose condition is the handoff's and is kept word for word. */
  careerMode: `${sittingLengthPhrase(SITTING_SPANS.campaignStage, 'a building-day')} · three lost contracts ends the career`,
  /**
   * The Rush tile. The range **is** the mode, which is what its second clause has always said and
   * has never until now had a figure agreeing with: 95 of the 221 measured cells never hold at all.
   */
  rushMode: `${sittingLengthPhrase(SITTING_SPANS.rush)} · the run always ends; the question is when`,
  /** The hub's *Today's scenario* row. */
  contractDay: `${sittingLengthPhrase(SITTING_SPANS.contractDay, 'a day')} · no losing — a day is a score, not a pass`,
  /** The hub's *Fix a building* row. */
  fixCase: `${sittingLengthPhrase(SITTING_SPANS.fixCase, 'a case')}, skippable · retry as often as you like`,
});
