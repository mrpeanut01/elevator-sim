/**
 * **Whether a day's problem could be seen** — `docs/35-problem-per-mode.md` row 13, rule `PM-TT2`;
 * GitHub issue #354; and `docs/33` § 6's legibility arm, which is also #208's per-building
 * eligibility instrument (§ D475), built once.
 *
 * `docs/33` DC-4 is a statement about the **verdict**: a contract's day 1 must miss a goal on a
 * third to two thirds of seeds. It is silent about whether the player could ever have *seen* the
 * problem. A day can miss *worst wait inside 230 s* on one rider at minute 41 and be invisible for
 * the other fifty-nine minutes; it satisfies DC-4 and presents no problem to solve, which is #208's
 * defect arriving through the instrument meant to prevent it.
 *
 * ## The measurement
 *
 * A landing is **legible** at an instant when somebody standing on it has waited into the stage's
 * third wait band — `live/bands.ts#WAIT_BANDS`' *checking watch*, sixty seconds, the band the
 * cutaway colours a figure amber. A day is legible when some landing stays legible for
 * {@link LEGIBILITY_WINDOW_S} contiguous simulated seconds: long enough for a player watching at
 * the stage's default speed to notice a crowd, ask why, and act.
 *
 * Exact interval union over the legs rather than sampling, `docs/35` § 9.3's method: each leg
 * standing on a landing contributes `[arrivedAt + bandFromS, leftAt)` when it waited that long,
 * where `leftAt` is when it boarded, was turned away (§ D266: a refused rider is not waiting), or
 * the run ended. The union's longest interval on any landing is the day's legible stretch.
 *
 * ## The window is an assumption, and here is the reasoning
 *
 * `docs/35` § 11 item 5 lists *whether 120 contiguous seconds is the right legibility window* as
 * open and a design choice rather than a fact. It stays a declared assumption: at the stage's
 * default speed (`stageScreenModel.ts#DEFAULT_STAGE_SPEED_INDEX`) two simulated minutes are **thirty
 * real seconds**, long enough to notice a crowd, ask why, and act, and a shorter window would count
 * a crowd the cutaway drew for one frame. It is uncited by construction; a playtest is what would
 * move it, and the constant is here so a playtest has one thing to move.
 *
 * **That figure read *"on the order of ten real seconds"* until [§ D641](../../../../DECISIONS.md)**,
 * and it was correct for the `30×` default § D354 chose. The opening rung is now `4×`, so the same
 * 120 simulated seconds is thirty real ones — the window did **not** move, the speed under it did,
 * and the argument for the window got stronger rather than weaker. Corrected on the commit that made
 * it stale, which is `CLAUDE.md`'s rule for a published number and for the sentence that states a
 * mechanism alike.
 *
 * ## The sweep, and the run it pins to
 *
 * `legibility.sweep.test.ts` runs every contract's day 1 under the shipped default dispatcher at
 * its own shift length, seeds `20 260 824 + 7 919 n`, `n = 0…49` — `docs/33` § 4.6's cell exactly,
 * so the energy bar and this arm are measured on the same four hundred days — and publishes the
 * fraction of seeds with a legible landing per contract. That table lives beside
 * {@link LEGIBILITY_WINDOW_S} below, `shift/goals.ts`'s pattern, and `legibility.test.ts` pins a
 * ten-seed slice of it so a change to the crowd, the bands or the union is red before the table is
 * stale. It is a proportion with its `n`, never a mean of a mean, and there are no arms to compare
 * so there is no interval (`docs/33` § 6.5).
 */

import type { VizLeg, VizRecording } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';
import { isWaitingAt } from '../frame/overlay.js';

/**
 * The contiguous stretch a landing must stay in the third band for the day to count as legible.
 *
 * ## The table, and the run it pins to — GitHub issue #354, § D512
 *
 * Measured 2026-09-06 on the integrated tree by `legibility.sweep.test.ts`: each contract's day 1
 * under `collective` at its own shift length, ordinary day, seeds `20 260 824 + 7 919 n`,
 * `n = 0…49`, folded through {@link legibilityOf} at the shipped band and window. **Re-measured
 * 2026-09-14 at ten contracts × 50 seeds = 500 runs** (GitHub issues #500 and #501), `docs/33`
 * § 4.6's cell exactly, and **all eight original rows reproduced to the second** — the two added
 * rows were the only movement in the table.
 *
 * **Re-measured again 2026-09-15 at thirteen contracts × 50 seeds = 650 runs** (GitHub issues #424,
 * #425 and #430), and **all ten rows reproduced to the second for the second wave running**. The
 * three added rows are the only movement, and that is worth one line rather than none: this table's
 * value is that a change to the crowd, the bands or the union shows up as a row that moves, and two
 * consecutive waves of reproduction is what makes a row that *does* move mean something.
 *
 * **Re-measured again the same day at sixteen contracts × 50 seeds = 800 days** (GitHub issues #428,
 * #427 and #426), and **all thirteen earlier rows reproduced to the second for the third wave
 * running** — every count and every median, and the six per-seed slices `legibility.test.ts` pins as
 * well. Three consecutive waves of reproduction over a table that has grown from eight rows to
 * sixteen is the strongest thing this instrument can say about itself: every row that has ever moved
 * in it is a row somebody added.
 *
 * **Re-measured 2026-09-22, and six rows moved — the first time a row in this table has moved for a
 * reason that was not somebody adding a contract** (GitHub issue #584,
 * [§ D961](../../../../DECISIONS.md)). Every sweep before this one built its states as
 * `{ ...baseState(), buildingId: contract.buildingId, … }`, and `baseState()`'s week stands on
 * **`c1`**; `shift/ladder.ts#rungFor` keys a rung on the contract **and** the building, so the pair
 * disagreed, **no rung reached any run**, and the three waves of reproduction above were three
 * reproductions of *sixteen towers as built*. The instrument was right and deterministic the whole
 * time; the question it was asked was the wrong one.
 *
 * The as-built table is the one directly below, kept as the dated record it is. The shipped
 * constant is the one after it, which is what the same instrument says about the towers a player is
 * handed.
 *
 * | contract | building | as built, of 50 | median (s) | **as handed over, of 50** | **median (s)** |
 * |---|---|---|---|---|---|
 * | c1 | garden-apartments | **0** | 0 | **0** | 0 |
 * | c2 | midtown-office | **50** | 2 504 | **38** | **239** |
 * | c3 | secure-tower | 20 | 108 | 20 | 108 |
 * | c4 | mixed-use-high-rise | 32 | 136 | 32 | 136 |
 * | c5 | vertical-city | 45 | 191 | 45 | 191 |
 * | c6 | chancery-house | **2** | 28 | **14** | **91** |
 * | c7 | crown-hotel | 40 | 161 | **30** | **147** |
 * | c8 | st-jude-hospital | **1** | 38 | **3** | **52** |
 * | c9 | harbour-point | **50** | 1 343 | **11** | **56** |
 * | c10 | ashgate | 10 | 79 | **32** | **161** |
 * | c11 | ctf-class-reference | **50** | 1 221 | **50** | 1 221 |
 * | c12 | shanghai-class-reference | **50** | 729 | **50** | 729 |
 * | c13 | merdeka-class-reference | **50** | 459 | **50** | 459 |
 * | c14 | one-wtc-class-reference | **1** | 13 | **1** | 13 |
 * | c15 | empire-state-class-reference | 45 | 472 | 45 | 472 |
 * | c16 | willis-class-reference | **50** | 2 347 | **50** | 2 347 |
 *
 * **Every row that moved is a row whose contract declares a rung, and every row that did not move
 * is one whose contract hands its tower over as built.** That is not an interpretation of the
 * result; it is the result. Seven contracts declare a rung — c2 at 0.395 occupancy, c9 at 0.6, c6
 * at 1.06 with a five-shaft gearless bank and a rate of 16, c3 at 12, c7 at 11 with a maintenance
 * incident, c8 at 8.5 and c10 at 13.5 — and six of the seven moved. The seventh, **c3**, reproduced
 * to the second, and that is the check rather than an exception: its rung declares the rate its
 * profile already runs at, so the identity is what a correct instrument must report there.
 *
 * **The set § D475 draws from is the same size and not the same set: `c9` leaves and `c10`
 * joins.** Harbour Point goes from 50 of 50 to **11**, which takes it below the threshold, and
 * Ashgate from 10 to **32**, which takes it above. Eleven members before and eleven after, so
 * `firstSession.ts#FIRST_SESSION_LINE`'s own count does not move — which is exactly the case a
 * derived sentence is for and exactly the case a reader would otherwise miss.
 *
 * **One published reading is refuted by its own correction, and it is the one worth reading twice.**
 * The paragraph below says Harbour Point holds a landing all day *"because the group cannot clear
 * its crowd even let at three fifths ([§ D572](../../../../DECISIONS.md))"*. The three fifths is
 * `c9`'s rung, and the measurement that sentence rests on **never applied it**: 50 of 50 is the
 * tower at full letting. Let at three fifths, as the contract actually hands it over, the same day
 * is legible on 11 of 50 at a median 56 s. The letting works. What the old figure measured was a
 * building nobody is given.
 *
 * **The three reference towers are legible on every seed, and the reading is not flattering.** A day
 * is legible when somebody stays past a minute on some landing for two contiguous minutes, and on a
 * tower of four to eight thousand people that is not a problem a player can see and solve — it is
 * the building. `c11`'s median stretch is **1 221 s**, which is two thirds of the whole shift, and
 * it sits between Harbour Point's 1 343 and Midtown's 2 504 — the two towers this table already
 * records as *legible for the whole day because the group cannot cope*. So legibility at 50 of 50 on
 * these three means the same thing it means there, and `docs/33` § 6's arm should be read beside
 * § 4.7k's miss rates rather than on its own.
 *
 * **That paragraph's reading is kept, and the generalisation inside it is refuted by the next three
 * towers measured after it.** It says a held landing *"on a tower of four to eight thousand people"*
 * is the building rather than a problem a session can solve, which reads as a claim about **size**.
 * Measured, size is not the variable: `c14` (One-WTC-class, 4 810 occupants, 104 floors) is legible
 * on **1 of 50** at a median stretch of **13 s** — the least legible contract in the catalogue after
 * Garden Apartments, and the first supertall this table has found **ineligible** — while `c16`
 * (Willis-class, 9 200 occupants) is legible on **50 of 50** at **2 347 s**, second only to Midtown
 * Office, and `c15` (Empire-State-class, 8 230 occupants) sits between them on **45 of 50** at
 * **472 s**, the same count as Vertical City. Three towers of the same class, spanning the whole
 * range this instrument can report.
 *
 * **`c15` and `c16`'s medians were re-measured on 2026-09-15** at the published budget, when GitHub
 * issue #45's ladder moved two of Empire State's banks from 6.1 m/s to 6.0 and three of Willis's
 * expresses from 8.1 to 8.0 ([§ D600](../../../../DECISIONS.md)). **Only those two rows moved, and
 * only their medians** — 437 → 472 s and 2 314 → 2 347 s — while **all fourteen other rows reproduced
 * exactly**, counts and medians alike, and **both counts held** at 45 and 50. So the spread this
 * paragraph is about is unmoved: a timing change shifted how long the held landings last without
 * changing how many days hold one, which is what a threshold nobody crossed looks like from here.
 *
 * **Why they differ is unmeasured and no mechanism is offered here**, which is
 * [§ D256](../../../../DECISIONS.md)'s rule at the one place it is most tempting to break: a
 * sentence about the fabric would be a plausible story standing in for a run. What the pair does
 * establish is the negative — **population does not predict legibility** — and that is worth more
 * than the story it replaces, because the earlier reading would have had a reader assume every
 * supertall added from here lands at 50 of 50 and stop looking.
 *
 * Two readings, both of them what #208 and § D475 needed measured rather than argued. Garden
 * Apartments never once holds a landing in the third band for two minutes — nobody on it waits
 * sixty seconds, so *"the first session presents no problem to solve"* is the instrument's own
 * finding at 0 of 50, and the building is **not eligible** as a first session under § D475 until
 * something about its day changes. Chancery House and St Jude's were legible on 2 and 1 seeds, which
 * is *rarely* rather than *never* and is the same verdict for a first session — and as handed over
 * they read 14 and 3, which is still *rarely* and still the same verdict, so the reading survives
 * its own re-measurement. Midtown Office was legible on every seed with a stretch longer than the
 * shift, which read as a building whose problem a player cannot miss; as handed over, at 0.395
 * occupancy, it is legible on **38 of 50** at a median **239 s**, which is a building whose problem
 * a player usually meets and sometimes does not. The five that were legible on more than a third of
 * seeds when this paragraph was written — c2, c4, c5, c7 and c3 at two fifths — were the eligible
 * set this table handed § D475's draw.
 *
 * **That sentence is in the past tense now and was not when it needed to be**, which is worth one
 * line rather than a silent edit. It named five members and read as a present-tense fact about a
 * **derived** set; the table has since grown to sixteen rows and the set to **eleven**, so it was
 * wrong by six before anybody noticed. Nothing reads this prose — `firstSession.ts` derives
 * {@link LEGIBILITY_SWEEP} with the threshold and never the list — so the code was right the whole
 * time and only the sentence went stale. Re-tensed rather than refreshed with today's members,
 * because a list of eleven typed here would go stale on exactly the same schedule.
 *
 * **The two that landed with the content plan said opposite things, and 2026-09-22 swapped which
 * said which.** As built, Harbour Point was legible on **50 of 50** at a median 1 343 s and Ashgate
 * on **10 of 50** at 79 s — and the reading offered for the pair was that Harbour Point's group
 * cannot clear its crowd *"even let at three fifths"* ([§ D572](../../../../DECISIONS.md)) while
 * Ashgate's problem is a car-park arrival riding twice, which is a fact about *time to destination*
 * rather than about a landing holding a crowd. **As their contracts hand them over the two have
 * changed places**: Harbour Point reads **11 of 50** at 56 s and Ashgate **32 of 50** at 161 s.
 * Half of that reading survives and half does not. The half about Ashgate stands, and gains a
 * qualification rather than losing one — it is above the threshold now on a rate its rung declares,
 * and `docs/35` `PM-TT2`'s point that a tower can present a real problem somewhere this instrument
 * does not look is unaffected by where the count lands. The half about Harbour Point does not: the
 * three fifths was never applied, so what was measured was the group at full letting, and the
 * letting is exactly what the contract gives the player. **No mechanism is offered for why Ashgate
 * rises** ([§ D256](../../../../DECISIONS.md)); what is established is that both moves are a rung
 * reaching a run that it never used to reach.
 *
 * ## Re-measured 2026-09-22, a second time the same day — six rungs moved under it
 *
 * **The table directly above is the shipped one no longer; this one is.** The re-measurement above
 * ([§ D961](../../../../DECISIONS.md)) was taken on a branch, and a sibling lane in the same wave
 * **rebalanced six of the seven rungs** to keep `docs/33` DC-4 after booking a car out of each of
 * their days ([§ D914](../../../../DECISIONS.md)). So § D961 pinned a sweep over rungs that had
 * moved by the time the wave integrated: `c2` let 0.395 → 0.34 plus a car out, `c3` crowd 12 → 11
 * plus a car out, `c6` 16 → 15 plus a car out, `c8` 8.5 → **10.5** plus **two** cars out, `c10`
 * 13.5 → 12 plus a car out, and `c9` a car out with its letting unchanged. Both lanes were right
 * alone; the pin was stale on the merged tree. Re-measured on the same instrument at the same
 * budget — sixteen contracts × 50 seeds = **800 days**, `collective`, day 1, ordinary, seeds
 * `20 260 824 + 7 919 n` — [§ D963](../../../../DECISIONS.md):
 *
 * | contract | building | § D961, of 50 | median (s) | **merged tree, of 50** | **median (s)** |
 * |---|---|---|---|---|---|
 * | c1 | garden-apartments | 0 | 0 | 0 | 0 |
 * | c2 | midtown-office | 38 | 239 | **35** | **165** |
 * | c3 | secure-tower | 20 | 108 | **30** | **134** |
 * | c4 | mixed-use-high-rise | 32 | 136 | 32 | 136 |
 * | c5 | vertical-city | 45 | 191 | 45 | 191 |
 * | c6 | chancery-house | 14 | 91 | **25** | **119** |
 * | c7 | crown-hotel | 30 | 147 | 30 | 147 |
 * | c8 | st-jude-hospital | 3 | 52 | **43** | **197** |
 * | c9 | harbour-point | 11 | 56 | **20** | **96** |
 * | c10 | ashgate | 32 | 161 | **27** | **125** |
 * | c11 | ctf-class-reference | 50 | 1 221 | 50 | 1 221 |
 * | c12 | shanghai-class-reference | 50 | 729 | 50 | 729 |
 * | c13 | merdeka-class-reference | 50 | 459 | 50 | 459 |
 * | c14 | one-wtc-class-reference | 1 | 13 | 1 | 13 |
 * | c15 | empire-state-class-reference | 45 | 472 | 45 | 472 |
 * | c16 | willis-class-reference | 50 | 2 347 | 50 | 2 347 |
 *
 * **Exactly the six rows whose rung moved moved, and the seventh rung-bearing row is the control
 * — which nobody had to arrange for the second wave running.** `c7` is the one contract of the
 * seven the rebalance did not touch, its incident predating it (§ D871), and it reproduces **to
 * the second**: 30 of 50 at 147 s, and its first ten per-seed stretches are byte-identical to the
 * pin `legibility.test.ts` already carried. The nine rung-less contracts reproduce to the second
 * as well, counts and medians alike. So **ten of sixteen rows are a reproduction and six are a
 * move**, and no row moved that had no reason to.
 *
 * **`c8` is the largest single move this table has ever recorded, and it is not a near miss.**
 * St Jude's goes **3 of 50 → 43**, a median stretch of 52 s → **197**, on a rung that takes **two**
 * of its cars out of passenger service for three tenths of the shift and raises its crowd from 8.5
 * to 10.5 %. It is now the third-most legible game contract, above Midtown Office.
 *
 * **The eligible set gains three members and its published count moves for the first time since it
 * was derived.** § D512's threshold is untouched — more than a third of fifty seeds, `> 16.67`, so
 * seventeen — and under it `c6` (14 → **25**), `c8` (3 → **43**) and `c9` (11 → **20**) all cross
 * from below to above. The set goes from **eleven** members to **fourteen**, and `c10`, which
 * § D961 had just put in, stays in at 27. Only `c1` and `c14` are now out of sixteen.
 *
 * **Two readings this docstring has published for as long as it has existed stop being true, and
 * both stop for the same reason.** *Chancery House and St Jude's are legible on 2 and 1 seeds,
 * which is rarely rather than never and is the same verdict for a first session* was measured on a
 * day with every car in service; both towers now book cars out, and both are eligible. *Harbour
 * Point's letting works* — § D961's own correction, 11 of 50 — is still true of the letting and no
 * longer true of the contract, because the contract now takes a car away as well: 20 of 50. **No
 * mechanism is offered for the size of any of these moves** ([§ D256](../../../../DECISIONS.md));
 * what is established is that a car out of passenger service is a rung this instrument can see,
 * and that it moves every contract it is declared on in the same direction.
 *
 * **What this does not touch.** The threshold, the band, the window and the union are unmoved, and
 * so is every rung — this is the measurement of somebody else's rebalance catching up with it, not
 * a second rebalance. `c1` at 0 of 50 is unmoved and Garden Apartments is still not eligible.
 *
 * The proportion carries its `n`, the stretch is a median, and there is no interval: no arms are
 * compared (`docs/33` § 6.5). `legibility.test.ts` pins the first ten seeds of every contract so
 * a change to the crowd, the bands or the union is red before this table is stale.
 */
export const LEGIBILITY_WINDOW_S = 120;

/** One row of the sweep {@link LEGIBILITY_WINDOW_S}'s docstring tabulates. */
export interface LegibilitySweepRow {
  readonly contractId: string;
  readonly buildingId: string;
  /** Seeds of the fifty on which day 1 is legible. */
  readonly legibleOf50: number;
  /** The median, over the fifty seeds, of the longest third-band stretch on any landing. */
  readonly medianStretchS: number;
}

/**
 * The sweep's table, as data — the same figures as the docstring above, so `shift/firstSession.ts`
 * can derive § D475's eligible set from the measurement rather than from a list somebody typed, and
 * `legibility.sweep.test.ts` can refuse this constant the day a fresh sweep disagrees with it.
 */
export const LEGIBILITY_SWEEP: readonly LegibilitySweepRow[] = Object.freeze([
  { contractId: 'c1', buildingId: 'garden-apartments', legibleOf50: 0, medianStretchS: 0 },
  { contractId: 'c2', buildingId: 'midtown-office', legibleOf50: 35, medianStretchS: 165 },
  { contractId: 'c3', buildingId: 'secure-tower', legibleOf50: 30, medianStretchS: 134 },
  { contractId: 'c4', buildingId: 'mixed-use-high-rise', legibleOf50: 32, medianStretchS: 136 },
  { contractId: 'c5', buildingId: 'vertical-city', legibleOf50: 45, medianStretchS: 191 },
  { contractId: 'c6', buildingId: 'chancery-house', legibleOf50: 25, medianStretchS: 119 },
  { contractId: 'c7', buildingId: 'crown-hotel', legibleOf50: 30, medianStretchS: 147 },
  { contractId: 'c8', buildingId: 'st-jude-hospital', legibleOf50: 43, medianStretchS: 197 },
  { contractId: 'c9', buildingId: 'harbour-point', legibleOf50: 20, medianStretchS: 96 },
  { contractId: 'c10', buildingId: 'ashgate', legibleOf50: 27, medianStretchS: 125 },
  { contractId: 'c11', buildingId: 'ctf-class-reference', legibleOf50: 50, medianStretchS: 1221 },
  { contractId: 'c12', buildingId: 'shanghai-class-reference', legibleOf50: 50, medianStretchS: 729 },
  { contractId: 'c13', buildingId: 'merdeka-class-reference', legibleOf50: 50, medianStretchS: 459 },
  { contractId: 'c14', buildingId: 'one-wtc-class-reference', legibleOf50: 1, medianStretchS: 13 },
  { contractId: 'c15', buildingId: 'empire-state-class-reference', legibleOf50: 45, medianStretchS: 472 },
  { contractId: 'c16', buildingId: 'willis-class-reference', legibleOf50: 50, medianStretchS: 2347 },
]);

/** The third band's floor — `WAIT_BANDS[2].fromS`, read rather than retyped. */
export function legibilityBandFromS(): number {
  const third = WAIT_BANDS[2];
  if (third === undefined) throw new Error('WAIT_BANDS has fewer than three bands');
  return third.fromS;
}

export interface LandingLegibility {
  readonly floorId: string;
  /** The longest contiguous stretch, in simulated seconds, with somebody in the third band. */
  readonly longestS: number;
  /** Total simulated seconds with somebody in the third band, as a union. */
  readonly totalS: number;
  /**
   * The simulated second at which this landing's first stretch of `windowS` completes — when the
   * day became legible here — or `undefined` while no stretch reaches the window.
   */
  readonly legibleAtS: number | undefined;
}

export interface DayLegibility {
  readonly bandFromS: number;
  readonly windowS: number;
  readonly landings: readonly LandingLegibility[];
  /** The longest stretch on any landing. */
  readonly longestS: number;
  /** `longestS >= windowS`. */
  readonly legible: boolean;
  /**
   * The earliest {@link LandingLegibility.legibleAtS} over the landings — when a player watching the
   * stage from the start could first have seen the problem — or `undefined` on a day that is not
   * legible. GitHub issue #208's first criterion asks for it in seconds from the day's start.
   */
  readonly legibleAtS: number | undefined;
}

/** When a leg stopped standing on its landing: boarded, turned away, or the run's end. */
function leftAt(leg: VizLeg, endedAt: number): number {
  if (leg.refusedAt !== undefined) return leg.refusedAt;
  if (leg.boardedAt !== undefined) return leg.boardedAt;
  return endedAt;
}

/** The union of half-open intervals, merged and sorted. */
function unionOf(intervals: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * The day's legibility, from its legs. Pure; the recording is read and never simulated.
 *
 * `bandFromS` and `windowS` are parameters so a test can move them and see the answer move,
 * and default to the shipped band and window so every non-test caller asks the same question.
 */
export function legibilityOf(
  recording: Pick<VizRecording, 'legs' | 'endedAt'>,
  options: { readonly bandFromS?: number; readonly windowS?: number } = {},
): DayLegibility {
  const bandFromS = options.bandFromS ?? legibilityBandFromS();
  const windowS = options.windowS ?? LEGIBILITY_WINDOW_S;
  const byFloor = new Map<string, (readonly [number, number])[]>();
  for (const leg of recording.legs) {
    const left = leftAt(leg, recording.endedAt);
    const from = leg.arrivedAt + bandFromS;
    if (left <= from) continue;
    /* A refused rider never waited in the band: § D266's rule, the same one `isWaitingAt` applies. */
    if (!isWaitingAt(leg, from)) continue;
    const list = byFloor.get(leg.originFloorId) ?? [];
    list.push([from, left]);
    byFloor.set(leg.originFloorId, list);
  }
  const landings: LandingLegibility[] = [...byFloor.entries()]
    .map(([floorId, intervals]) => {
      const merged = unionOf(intervals);
      const longestS = merged.reduce((best, [a, b]) => Math.max(best, b - a), 0);
      const totalS = merged.reduce((sum, [a, b]) => sum + (b - a), 0);
      const first = merged.find(([a, b]) => b - a >= windowS);
      const legibleAtS = first === undefined ? undefined : first[0] + windowS;
      return { floorId, longestS, totalS, legibleAtS };
    })
    .sort((a, b) => b.longestS - a.longestS || a.floorId.localeCompare(b.floorId));
  const longestS = landings[0]?.longestS ?? 0;
  const moments = landings.flatMap((landing) => (landing.legibleAtS === undefined ? [] : [landing.legibleAtS]));
  const legibleAtS = moments.length === 0 ? undefined : Math.min(...moments);
  return { bandFromS, windowS, landings, longestS, legible: longestS >= windowS, legibleAtS };
}
