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
 * ## The second axis, and the defect that made it necessary — [§ D946](../../../../DECISIONS.md)
 *
 * § D753 composed every figure from the **rung**, so a rung move carries them. It left the other
 * factor a constant, and an assessor measured what that cost on the screen a player uses to decide
 * how to spend their evening:
 *
 * | tile | it said | it played | out by |
 * |---|---|---|---|
 * | Career | *~4 min a building-day at 4×* | Garden Apartments' 3 600 s (§ D234) | ×3.75 |
 * | Today's scenario | *8-15 min a day at 4×* | Midtown Office's 36 000 s `office-day` | ×10 |
 *
 * The scenario figure was measured by playing rather than by reading: the playhead advanced
 * **4 019 s in 975 s of wall clock**, a rate of **4.12×**, so the rung was right and the span was
 * wrong. Both spans named the wrong day outright — `campaignStage` was `data/campaign.json`'s
 * 900 s stage, which the Career tile does not open at all, and `contractDay` was the 1 800–3 600 s
 * slice, which thirteen of the sixteen contracts no longer run.
 *
 * So the day length is now the second axis of the same derivation, and it enters in two ways
 * because the two halves have different reach. **The contract's own length is read live** from
 * `CONTRACTS`, so a contract authored at a new length moves these strings on its own commit.
 * **The authored day's period cannot be**, because it lives in `data/` behind an async load and
 * these are frozen module constants — so it is declared once, with its source, and
 * `sittingShape.test.ts` censuses `shift/dayLength.ts#wholeDayFor` over all sixteen contracts and
 * fails unless the published span brackets every one of them exactly. Rule 3 below is what makes
 * that a pin rather than a promise.
 *
 * Recorded under [§ D753](../../../../DECISIONS.md), which carries the measurement, the five
 * strings it moved and the four documents that repeated them, and under
 * [§ D946](../../../../DECISIONS.md), which is the day-length axis and the assessment above.
 */

import { DEFAULT_SHIFT_LENGTH_S } from '../dev/state.js';
import { CONTRACTS } from '../shift/contracts.js';

import { DEFAULT_STAGE_SPEED_INDEX, STAGE_SPEEDS, stageSpeedAt } from './stageScreenModel.js';
import { BETWEEN_PEAKS_SIM_PER_REAL_S } from './stagePace.js';

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
  /**
   * **Present when the span's long end is a whole authored day, which the stage paces** — GitHub
   * issue #592, [§ D991](../../../../DECISIONS.md). A whole day is not watched at one rung: its
   * acts play at the player's rung and the hours between them at
   * `stagePace.ts#BETWEEN_PEAKS_SIM_PER_REAL_S`, so its watching is {@link pacedDayRealS} rather
   * than `periodS / rung`. Absent on every span that plays at one rung, which is all the others.
   */
  readonly pacedDay?: PacedDay | undefined;
}

/**
 * A whole authored day as the stage plays it — [§ D991](../../../../DECISIONS.md).
 *
 * `slowS` is the simulated seconds the stage plays at the **watching** rung: every act, plus every
 * stretch between peaks with somebody on a landing past a minute. The rest of `recordedS` is crossed
 * at the between-peaks rung. `recordedS` is the recording's own length, which a whole day overruns
 * by the minutes its last riders take to drain; `periodS` is the authored day the span's end names.
 */
export interface PacedDay {
  readonly periodS: number;
  readonly recordedS: number;
  readonly slowS: number;
}

/**
 * **Real seconds of watching for a whole day under § D991's pacing** — the slow part at the
 * watching rung, the rest at the between-peaks rung or the watching rung, whichever is faster.
 *
 * Exact for the day it is handed, and derivable from the rung — rule 1 — because a day's slow part
 * is a property of its recording, not of the speed it is played at: the stage holds the watching
 * rung while somebody has waited past a minute **whatever** that rung is.
 */
export function pacedDayRealS(day: PacedDay, watchingSimPerRealS: number): number {
  const between = Math.max(watchingSimPerRealS, BETWEEN_PEAKS_SIM_PER_REAL_S);
  return day.slowS / watchingSimPerRealS + (day.recordedS - day.slowS) / between;
}

/**
 * **How long one contract's run is, in simulated seconds** — the same expression the press uses.
 *
 * `dev/state.ts#shiftLengthForContract` is what `scenariosPanel`'s *take*, `initialState` and
 * `host.ts#runCampaignDay` all write, and this is its fold over `CONTRACTS` rather than a second
 * reading of it: a contract that authors a length uses it, and a contract that authors none uses
 * `DEFAULT_SHIFT_LENGTH_S`. Imported rather than copied — 1 800 is the horizon every figure in
 * `docs/05-roadmap.md` was measured over, and a second copy of it here is how a session-shape
 * figure comes to describe a day the product does not run.
 */
function contractRunLengthS(contract: { readonly shiftLengthS?: number | undefined }): number {
  return contract.shiftLengthS ?? DEFAULT_SHIFT_LENGTH_S;
}

/** The smallest and largest of a non-empty list, as a span, with the file the list came from. */
function spanOf(values: readonly number[], source: string): SittingSpan {
  if (values.length === 0) throw new Error(`sittingShape: ${source} produced no length`);
  return Object.freeze({
    lowSimS: Math.min(...values),
    highSimS: Math.max(...values),
    source,
  });
}

/** The union of two spans — the shortest sitting either offers to the longest either offers. */
function unionOf(left: SittingSpan, right: SittingSpan): SittingSpan {
  const pacedDay = left.pacedDay ?? right.pacedDay;
  return Object.freeze({
    lowSimS: Math.min(left.lowSimS, right.lowSimS),
    highSimS: Math.max(left.highSimS, right.highSimS),
    source: `${left.source}; ${right.source}`,
    ...(pacedDay === undefined ? {} : { pacedDay }),
  });
}

/**
 * Real seconds of watching for one end of a span — `simS / rung`, except where that end is a whole
 * day the stage paces, which is {@link pacedDayRealS}.
 */
export function watchedRealS(span: SittingSpan, simS: number, simPerRealS: number): number {
  return span.pacedDay !== undefined && simS === span.pacedDay.periodS
    ? pacedDayRealS(span.pacedDay, simPerRealS)
    : simS / simPerRealS;
}

/**
 * **The period of the whole authored day a building may run**, in simulated seconds.
 *
 * This is the one number on this page that **cannot** be derived where it is used, and saying so
 * is better than pretending otherwise. `shift/dayLength.ts#wholeDayFor` answers it from
 * `data/traffic-profiles.json` — a record's `durationMin × 60`, offered to a building whose own
 * directional mix some phase of it declares at its peak — and `data/` is loaded asynchronously by
 * the shell. `SITTING_SHAPES` is a frozen module constant read by `EVERYDAY_MODES`, which
 * `honesty/surfaces.ts` sweeps without a document and without resources, so a figure composed here
 * cannot await a fetch.
 *
 * So it is **declared here and censused by the test**: `sittingShape.test.ts` runs `wholeDayFor`
 * over every one of the sixteen contracts' buildings and fails unless the span below brackets
 * every length exactly. A day record authored at a new period, a building that gains or loses a
 * day, and a contract authored at a new length are each a red test on the commit that lands them.
 * That is rule 3 of this module's docstring applied to the axis § D753 left out.
 */
const AUTHORED_DAY_PERIOD_S = 36000;

/**
 * **The longest whole day any contract plays under § D991's pacing** — measured, not estimated,
 * and the long end of the Today's-scenario figure. GitHub issue #592,
 * [§ D991](../../../../DECISIONS.md).
 *
 * `everyday/stagePace.sweep.test.ts` played every contract's day 1 as Today's scenario plays it —
 * sixteen contracts × fifty seeds, `collective`, seeds `20 260 824 + 7 919 n` — and this is the day
 * with the most seconds at the watching rung: `c16`, seed `n = 28`. It is a reference tower's,
 * whose landings hold somebody past a minute for most of the day, so the stage seldom gets to cross
 * anything fast. The game's own towers are the next constant, and the hub row names both.
 *
 * Measured rather than derived from the acts because the acts are a **floor** — 5 400 s of
 * `office-day` gives 39.5 minutes — and the drain on top of it is an outcome of the run. The
 * ruling's *about forty* is true of the game's towers and false of the reference towers, and a tile
 * that published it would be § D946's defect one axis over. The sweep refuses this constant at the
 * published budget the day a fresh measurement disagrees.
 */
export const WHOLE_DAY_LONGEST: PacedDay = Object.freeze({
  periodS: AUTHORED_DAY_PERIOD_S,
  recordedS: 36192.447,
  slowS: 24602.458,
});

/**
 * **The longest whole day on the game's own towers** — the contracts whose buildings are not
 * `*-class-reference`: `c5` (Vertical City), seed `n = 39`, on the same sweep. Quoted on the hub row beside the
 * long end, because the reference towers set that end and a player on a game tower would otherwise
 * read a figure more than twice what they will watch.
 */
export const WHOLE_DAY_LONGEST_GAME_TOWER: PacedDay = Object.freeze({
  periodS: AUTHORED_DAY_PERIOD_S,
  recordedS: 36413.148,
  slowS: 8486.048,
});

/**
 * Every span a shipped sitting can have, in simulated seconds.
 *
 * **`fixCase` is the one entry that is not an authored duration**, and the difference is the point:
 * a case plays the as-built run and then the pair, and each recording runs past its authored
 * `durationS` while the building drains. So the span is what the simulator produced, censused over
 * all eighteen cases by `sittingClock.measure.test.ts`' span leg, not `2 × durationS`.
 */
export const SITTING_SPANS = Object.freeze({
  /**
   * **One career building-day** — what the Career tile opens on to.
   *
   * This entry read `campaignStage`, 900 s, `data/campaign.json`, and it was the wrong day
   * entirely: a career day is not a campaign stage. `host.ts#runCampaignDay` writes
   * `shiftLengthS: shiftLengthForContract(tower.id)` and `windowStartS: null`, and a
   * `CampaignTower.id` **is** a contract id — so the day the Career tile plays is the signed
   * contract's own run length, over any of the sixteen. An assessor measured the opening tower
   * (Garden Apartments, `c1`, an hour by § D234) and got fifteen minutes of watching against a
   * tile promising four.
   *
   * Derived live over `CONTRACTS`, so a contract authored at a new length moves this string on
   * that contract's own commit. `data/campaign.json`'s 900 s stages are still 900 s and are still
   * what `scenario/ladder.ts` draws — they are simply not this.
   */
  careerDay: spanOf(CONTRACTS.map(contractRunLengthS), 'packages/viz/src/shift/contracts.ts'),
  /**
   * **One contract day** — the Scenario hub's *Today's scenario*, which opens § 6.1's front door.
   *
   * This entry read 1 800–3 600 s, and it was right for three of the sixteen contracts and out by
   * a factor of ten for thirteen. `host.ts#startRun` spreads `wholeDayRun(day)` into the patch for
   * any building `wholeDayFor` answers for, which is every office crowd — thirteen of the sixteen
   * contracts on the day this was written, and a number `sittingShape.test.ts` censuses rather
   * than this sentence, because a count in prose about a set that grows is the defect this entry
   * is about one level up. `office-day` declares a **ten-hour** period. An assessor watched Midtown Office advance
   * 4 019 s in 975 s of wall clock and worked out that the tile promising 8–15 minutes had sold
   * them two and a half hours.
   *
   * The union rather than either half, because *Today's scenario* is one press that reaches both:
   * a contract with an authored day runs the day, and a contract without one keeps its slice.
   * Quoting the slice alone is what shipped.
   */
  contractDay: unionOf(
    spanOf(CONTRACTS.map(contractRunLengthS), 'packages/viz/src/shift/contracts.ts'),
    Object.freeze({
      ...spanOf([AUTHORED_DAY_PERIOD_S], 'data/traffic-profiles.json, through shift/dayLength.ts#wholeDayFor'),
      /*
       * § D991: the day is paced, so its watching is the slow part at the rung and the rest faster —
       * and the long end is the longest day any contract plays, measured. This read *2 h 30* while
       * the stage played every second at one rung.
       */
      pacedDay: WHOLE_DAY_LONGEST,
    }),
  ),
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

/** The between-peaks rung's own chip label — § D354's rule that a label **is** its multiplier. */
function betweenRungLabel(): string {
  const rung = STAGE_SPEEDS.find((speed) => speed.simPerRealS === BETWEEN_PEAKS_SIM_PER_REAL_S);
  if (rung === undefined) throw new Error('sittingShape: the between-peaks rung is not on the ladder');
  return rung.label;
}

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
 * **Where a figure stops being minutes and starts being hours** — ninety.
 *
 * An office contract's day **was** 150 minutes at the shipped rung while the stage played every
 * second of it at one speed (§ D991 paces it to about forty now, so no shipped figure crosses this
 * boundary today; the rule stays because a rung move or a new day could bring one back), and
 * *150 min* is true, legible and the wrong size of unit for a decision about an evening: a reader parses two and a half hours
 * faster than they parse a hundred and fifty minutes, and this string's whole job is to be parsed
 * before an evening is committed. Ninety rather than sixty so that the common cases stay in the
 * unit they were authored in — nothing shipped lands between 60 and 89 — and so that a range whose
 * ends straddle the boundary is the exception rather than the rule.
 *
 * The minutes are computed first and **then** formatted, so {@link sittingMinutes}' `Math.ceil` is
 * the only rounding anywhere in this module. An hours form that divided the seconds again would
 * have a second rounding in it, and rule 2 of this module's docstring is about there being exactly
 * one.
 */
const HOURS_FROM_MINUTES = 90;

/** Whole minutes as a player reads them — `23 min`, or `2 h 30` once past {@link HOURS_FROM_MINUTES}. */
function sittingWord(minutes: number): string {
  if (minutes < HOURS_FROM_MINUTES) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest).padStart(2, '0')}`;
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
  const highRealS = watchedRealS(span, span.highSimS, rung.simPerRealS);
  if (highRealS < 60) return `under a minute${of} at ${rung.label}`;
  /* One rounding, up, whichever way the end is watched — rule 2. A paced whole day is § D991's. */
  const minutesOf = (simS: number): number =>
    span.pacedDay !== undefined && simS === span.pacedDay.periodS
      ? Math.ceil(pacedDayRealS(span.pacedDay, rung.simPerRealS) / 60)
      : sittingMinutes(simS, rung.simPerRealS);
  const low = minutesOf(span.lowSimS);
  const high = minutesOf(span.highSimS);
  const figure =
    low === high
      ? `~${sittingWord(high)}`
      : low < HOURS_FROM_MINUTES && high < HOURS_FROM_MINUTES
        ? `${String(low)}-${String(high)} min`
        : `${sittingWord(low)}-${sittingWord(high)}`;
  return `${figure}${of} at ${rung.label}`;
}

/**
 * The Scenario tile's own span: the shortest sitting the hub offers to the longest.
 *
 * It is the union of the hub's two entries rather than either of them, because the tile is the
 * press that reaches both and a figure quoting one would be advertising the shorter.
 *
 * **Taken through {@link unionOf} rather than written out, and that is this module's own defect
 * caught one field over.** It read `contractDay.lowSimS` to `fixCase.highSimS` — correct only
 * while the fix case was the longer of the two, which it was and is no longer. A hand-built union
 * that happens to name the right two fields is exactly the *constant that happens to be right*
 * this rewrite is about.
 */
const SCENARIO_HUB_SPAN: SittingSpan = unionOf(SITTING_SPANS.contractDay, SITTING_SPANS.fixCase);

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
  careerMode: `${sittingLengthPhrase(SITTING_SPANS.careerDay, 'a building-day')} · three lost contracts ends the career`,
  /**
   * The Rush tile. The range **is** the mode, which is what its second clause has always said and
   * has never until now had a figure agreeing with: 95 of the 221 measured cells never hold at all.
   */
  rushMode: `${sittingLengthPhrase(SITTING_SPANS.rush)} · the run always ends; the question is when`,
  /**
   * The hub's *Today's scenario* row.
   *
   * It names the between-peaks rung as well as the watching one, because § D753 rule 2 is that a
   * figure names the rung it was quoted at and this one was quoted at two (§ D991). It read
   * *8 min-2 h 30 a day at 4×* while the stage played every second of a whole day at one rung.
   *
   * **The long end is a reference tower's and the row says so**, rather than letting a player on
   * one of the game's own towers read a figure more than twice what they will watch: the second
   * clause is {@link WHOLE_DAY_LONGEST_GAME_TOWER}, measured on the same sweep.
   */
  contractDay: `${sittingLengthPhrase(SITTING_SPANS.contractDay, 'a day')}, the hours between peaks at ${betweenRungLabel()}; ${String(Math.ceil(pacedDayRealS(WHOLE_DAY_LONGEST_GAME_TOWER, openingRung().simPerRealS) / 60))} min at most on the game’s own towers — the long end is a reference tower’s · no losing — a day is a score, not a pass`,
  /** The hub's *Fix a building* row. */
  fixCase: `${sittingLengthPhrase(SITTING_SPANS.fixCase, 'a case')}, skippable · retry as often as you like`,
});
