/**
 * The test-cost census, its ratchet, and the machine-swing properties of the instrument —
 * GitHub issue #344, [`DECISIONS.md`](../../../DECISIONS.md) § D492.
 *
 * ## The division of labour, which is the whole design
 *
 * **This file gates what is static and publishes what is measured.** `testCost.test-helper.ts`
 * derives both. A census of timeout annotations is a property of the code and can be asserted on
 * every run; an attribution of wall clock is a property of a machine on a day, and § D483 measured
 * that machine moving by 1.82× on identical work. So the second half is a deriver behind an
 * environment gate, on `honesty/measure.corpus.test.ts`'s precedent, and the numbers it produces
 * are published as dated records rather than pinned.
 *
 * ## What is gated, and what that cannot catch
 *
 * Gated: the **count** of annotations above each project's own ceiling, and their **sum**, both as
 * ratchets that may only fall. That is #344's fourth criterion — *no case may be annotated upward* —
 * mechanised rather than promised, and it holds under any machine swing because it reads no clock.
 *
 * Not gated, and not catchable by anything in this file:
 *
 * - **A case getting slower without its annotation changing.** Nothing static can see it, and no
 *   test inside the leg can time the leg. The deriver below is the instrument; running it is a
 *   person's decision.
 * - **The suite growing uniformly.** Every share-based statistic is blind to it *by construction*,
 *   which the case named *is blind to uniform growth* asserts rather than asserts around — a
 *   limitation nobody mechanised is § D227's stale refusal waiting to happen. `cohortRatio` is the
 *   one statistic that sees it, and § D492 measures its resolution at about **15 %**, because a real
 *   contention swing is not uniform: over runs 2.79× apart the pinned cohort moved 2.42×.
 * - **Anything at all when nobody runs it.** No workflow calls the deriver; `.github/` was out of
 *   this lane's scope. Wiring it into CI as an artifact is follow-up work, and it is named as owed
 *   rather than implied to exist.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  annotationCosts,
  annotationsIn,
  attributionOf,
  censusOf,
  ceilingsFrom,
  cohortRatio,
  driftBetween,
  filesCovering,
  formatAttribution,
  formatCensus,
  REPO_ROOT,
  VITEST_CONFIG,
  type Attribution,
  type Census,
} from './testCost.test-helper.js';

const census: Census = censusOf();
const config = readFileSync(VITEST_CONFIG, 'utf8');

/**
 * The above-ceiling population, pinned as a ratchet that may only fall.
 *
 * Derived on `8ff0215`, and derived again on `13e7b93` — the tree #344's own census was taken on —
 * where this scanner reproduces the issue's three published figures exactly (555 numeric
 * annotations, 182 at exactly 300 000 ms, 93 above it) and adds the two the issue's method could not
 * see, because they are written as file-local constants rather than literals.
 *
 * **Raising a number here is a decision, not a fix.** The friction is the point: an annotation above
 * a project's own ceiling is a site saying it knows it costs more than the project budgets for, and
 * #344 exists because ninety-three of those accumulated without anyone measuring one. If a new case
 * genuinely needs one, raise the entry and say why in the same commit — what may not happen is a
 * case being annotated upward to make some *other* check pass, which is that issue's fourth
 * criterion.
 *
 * Only the two `viz` projects are gated, and that is scope rather than judgement: this lane measured
 * the `viz` leg. `experiments` carries **168** above-ceiling annotations of which **123** are named
 * constants, `core` 6 (5 until 2026-09-15, when GitHub issue #428's three towers pushed
 * `traffic/credentialGapIdentity.test.ts`'s byte-identity case past 300 000 ms), `cli` 2 and
 * `server` 1 — counted by the same scanner, published by the
 * deriver, and gated by nothing here.
 */
const ABOVE_CEILING: ReadonlyMap<string, { readonly count: number; readonly totalMs: number }> =
  new Map([
    /*
     * **91 → 92, and the one is named** — GitHub issue #382's
     * `shift/contractCurve.sweep.test.ts`. It is the contract-ladder sweep: eight contracts by
     * fifty seeds at day 1, each run built through `dev/state.ts#shiftRunConfigOf` and recorded in
     * full, which took 396 s wall clock at the published budget on this container. Its annotation is
     * four hours because the same instrument is run at `CONTRACT_CURVE_DAYS=1,5,10,20` and at
     * larger seed counts by hand, and an annotation shorter than the job it holds is an annotation
     * that fails for a reason that is not the code. It is gated on `CONTRACT_CURVE_SWEEP` and
     * registered in `deepTiers.test.ts`, so it costs the default suite nothing. Raised here with
     * that reason on the commit that added it, which is what the ratchet's own message asks for;
     * nothing existing was raised to make room.
     */
    /*
     * **92 → 93, and the one is named** — GitHub issue #367's `scenario/survivorSweep.test.ts`. It
     * is the survivor sweep: every scenario at every rung of its budget, with every configuration
     * the rung reaches played to a verdict through the shipped sequence, which on the shipped
     * campaign is ten scenarios × (a twelve-profile dropdown census + three rungs × twelve drawn
     * dials), each a fifty-replication two-arm batch and a second one wherever the first met every
     * bar. Measured 2026-09-10 at the shipped sample size on a quiet ten-core box: 932 s over 480
     * judgements. Its annotation is three hours because the same instrument is re-run under
     * `ELEVATOR_SIM_REGENERATE_SURVIVORS=1` to produce the pinned table, and an annotation shorter
     * than the job it holds is an annotation that fails for a reason that is not the code. It is
     * gated on `ELEVATOR_SIM_SURVIVORS` and registered in `deepTiers.test.ts`, so it costs the
     * default suite nothing. Raised here with that reason on the commit that added it, which is
     * what the ratchet's own message asks for; nothing existing was raised to make room.
     *
     * **It was uncounted first, and that is the more useful half of this entry.** The file's first
     * draft closed the callback on one line, put a block comment on the next and the bare
     * `10_800_000,` on the one after — and `annotationsIn`'s `CLOSER` matches a closing
     * `}, <ms>);` at the **start of a line**, so the census could not see it: 441 annotations,
     * 92 above ceiling, and this
     * ratchet green over a three-hour bound nobody had counted. An uncounted annotation is
     * `RISKS.md` R38 wearing a timeout, so the call was rewritten into the counted form rather than
     * left in the blind spot. **That limit is now fixed in the scanner**, one entry down.
     *
     * **93 → 96, and not one case was annotated upward — the instrument stopped being blind.**
     * `testCost.test-helper.ts` now reads the multi-line shape as well as the single-line one, and
     * attributes by parenthesis balance rather than by indent agreement. Forty-two annotations that
     * already existed became visible tree-wide, **and none was lost**: the census went 1 318 → 1 360
     * with zero removals, measured by diffing the site list rather than comparing totals.
     *
     * Three of the forty-two sit above this project's ceiling, and the sum says so exactly:
     * `dev/measure.surfaceRuns.test.ts:500` at 900 000, `honesty/honesty.test.ts:1113` at
     * 1 800 000 and `scenario/goalRates.test.ts:340` at 900 000 — **900 000 + 1 800 000 + 900 000 =
     * 3 600 000**, which is precisely 104 700 000 − 101 100 000. A raise that decomposes to the
     * string is a raise a reader can check.
     *
     * **Read the direction of this raise carefully**, because it is the one thing this ratchet
     * exists to make hard. #344's fourth criterion forbids *annotating a case upward to satisfy a
     * budget*. Nothing here was re-annotated: every one of these bounds was written on the commit
     * that added its case, and every one was already being paid at run time. What changed is that
     * the census can now say so. A ratchet that fell while the tree it measures grew invisibly was
     * not protecting anything — it was reporting its own blind spot as good news.
     */
    /*
     * **96 → 98 on the count and 104 700 000 → 107 400 000 on the sum, and all three moves are
     * named** — wave AA's three reference towers (GitHub issues #425, #424 and #430). **Not one of
     * the three is a new annotation; all three are existing budgets raised**, which is why the
     * `at its own ceiling` row falls by two in the same commit as this one rises by two. The two
     * cases did not appear — they crossed.
     *
     * - `shift/legibility.test.ts`, *"reproduces the table's slice"* — 300 000 → 900 000 ms.
     * - `shift/firstSession.test.ts`, *"every eligible contract's day 1 is legible"* — 300 000 → 900 000 ms.
     * - `honesty/honesty.test.ts` — 900 000 → 1 800 000 ms.
     *
     * That all three are raises rather than additions is the whole reason this entry pins a **sum**
     * beside a count. A wave that raised one budget and added none would leave the count level and
     * move only the sum, and a reader watching the count alone would see nothing happen.
     *
     * **None is a case annotated upward to satisfy a budget, which is the thing this ratchet exists
     * to catch.** All three are instruments over the *shipped set*, and the shipped set grew from
     * eleven buildings to fourteen and from ten contracts to thirteen on the same wave. The
     * legibility table gained three rows and is re-derived at 650 days; the first-session
     * eligibility set is derived from that table, so it grew with it; and the honesty corpus now
     * carries three more towers, which took it past its old ceiling under load — where a hook
     * timeout reported all thirty cases as *skipped* and said nothing about any property.
     *
     * The honesty raise is the one to read, because it is the one that could have gone the other
     * way: `STANDARD_CORPUS`'s own rule is that the corpus size is the claim, so a corpus quietly
     * trimmed to fit a window is a weakened search that still publishes a verdict. Raising the
     * window was the honest half of that choice.
     *
     * Raised on the commit that made the tree exceed it, with nothing existing raised to make room.
     */
    /*
     * **The count does not move and the sum rises by 1 800 000, which is the pair this entry pins
     * doing exactly what it was written to do** — wave AB's three reference towers (GitHub issues
     * #428, #427 and #426). Two budgets were raised and no case was added:
     *
     * - `shift/legibility.test.ts`, *"reproduces the table's slice"* — 900 000 → 1 800 000 ms.
     * - `shift/firstSession.test.ts`, *"every eligible contract's day 1 is legible"* — 900 000 →
     *   1 800 000 ms.
     *
     * 900 000 + 900 000 = **1 800 000**, which is precisely 109 200 000 − 107 400 000. Both sites
     * were already above this project's ceiling, so `at its own ceiling` and `above 300 000 ms` are
     * both unmoved and the count stays at 98 — a wave that raised two budgets and added none leaves
     * the count level and moves only the sum, which is the reason this entry pins both.
     *
     * **Neither is a case annotated upward to satisfy a budget**, which is the thing this ratchet
     * exists to catch. Both are instruments over the *shipped set*, and the shipped set grew from
     * fourteen buildings to seventeen and from thirteen contracts to sixteen on this wave. The
     * legibility slice walks every contract, so it gained three; the first-session walk is derived
     * from that slice's own table, so it gained the two of the three that cleared the threshold.
     * Both **timed out** on the tree that added them rather than merely running close, and the
     * alternative — dropping seeds or members — would have made each case a claim about a subset
     * of the set it names. Raised on the commit that made the tree exceed them, with nothing
     * existing raised to make room.
     */
    /*
     * **98 → 105, and all seven are one file** — `everyday/sittingClock.measure.test.ts`, GitHub
     * issue #559 and § D753's wall-clock instrument. It plays each mode's real recording end to end
     * through the shipped `Playback` against a system clock, which is the only way to settle a
     * claim about a player's evening: the five session-shape strings were out by a factor of four
     * and a division could not have found that. One reading cost **45.3 real minutes and 164 005
     * frames**, so four of its cases carry an hour and the rest ten to thirty minutes. It is gated
     * on `SITTING_OUT` and registered in `deepTiers.test.ts`, so the ordinary suite never pays for
     * it — which is what makes the annotation honest rather than a budget being satisfied upward.
     */
    /*
     * **105 → 108, and the three are named** — all three are wave AE's
     * `fixit/theAnswerIsNotPrinted.test.ts`, GitHub issue #566's guard, each at 600 000 ms: the
     * `beforeAll` that loads `data/`, the role-blind solvability enumeration, and the measurement
     * that checks every *the worst wait shortens* claim against its own run.
     *
     * **They earn the annotation because each one runs simulations rather than reading strings.**
     * The enumeration plays five editor families singly and then in pairs over parking, then the
     * repair rows in draw order, on every one of the eighteen shipped fix cases, and stops at the
     * first route that clears both measured bars — which is how that lane established 12 of 18 are
     * solvable from the editor alone and corrected § D706 § 1's 1-of-18 to a different question.
     * The claim measurement plays each repair that promises a shorter worst wait and compares the
     * legs; it found three shipped promises false. Neither can be done by inspection, and an
     * annotation shorter than the job it holds is an annotation that fails for a reason that is not
     * the code.
     *
     * **Nothing existing was raised to make room**, which is the ratchet's own condition: the base
     * at `918bc64` reads 105 above the ceiling summing to 126 600 000 ms, and the head reads 108
     * summing to 128 400 000 — a difference of exactly 1 800 000 ms, which is 3 × 600 000 and no
     * more. Derived from the tree on both commits rather than subtracted from this entry.
     */
    /*
     * **108 → 109 and 128 400 000 → 142 800 000, and the one is named** — GitHub issue #583's
     * `shift/energyBar.sweep.test.ts`, at **14 400 000 ms**, which is
     * `shift/contractCurve.sweep.test.ts`'s own four hours and for the same reason.
     *
     * It is the energy bar's re-derivation over the horizon the day actually runs: thirteen
     * contracts × fifty **ten-hour** days, each built through `dev/state.ts#shiftRunConfigOf` and
     * recorded in full, plus a second arm over all thirteen shipped dispatchers for § D106's
     * perverse-ranking check and a third at § D468's own 1 800 s horizon. A whole authored day is
     * roughly **ten times** the legs of the thirty-minute slice the existing sweeps run
     * (`shift/dayLength.ts` measures ×10.3 to ×10.7), and on the supertalls it is 30 000 to 68 000
     * legs a run, so the annotation is longer than any single arm because the same instrument is
     * re-run at larger seed counts and over dispatcher arms by hand.
     *
     * It is gated on `ENERGY_BAR_SWEEP` and registered in `deepTiers.test.ts`, so the ordinary
     * suite pays nothing for it. Raised here with that reason on the commit that added it, which is
     * what the ratchet's own message asks for; **nothing existing was raised to make room** — the
     * difference is exactly 14 400 000 and no more.
     */
    /*
     * **109 → 111 and 142 800 000 → 158 100 000, both are one file, and one of the two was
     * brought *down* before it was registered** — § D871's `shift/pressLadder.sweep.test.ts`,
     * integrated in wave AG and registered here by lane AG-FIX-1.
     *
     * **The entry above it was correct and incomplete, which is the useful half.** Lane AG-D
     * derived 109 / 142 800 000 on its own branch, where its `energyBar.sweep.test.ts` was the only
     * new gated instrument in the tree; lane AG-A's two landed in the same wave and neither lane
     * could see the other's. The merged tree read **111 / 171 600 000** against a ratchet of 109,
     * and the ratchet went red — which is it working rather than failing. Derived on both trees
     * with `censusOf`, keyed on file and case name rather than on line:
     *
     * | | base `9db3528` | merged head | move |
     * |---|---|---|---|
     * | viz above ceiling | 108 | 111 | **+3** |
     * | viz above-ceiling sum | 128 400 000 | 171 600 000 | **+43 200 000** |
     * | viz-browser | 79 / 19 920 000 | 79 / 19 920 000 | **0** |
     *
     * **Zero removals and zero raises on either project**, measured as a set difference rather
     * than inferred from the totals: the added set is exactly three sites, all at 14 400 000 —
     * `energyBar.sweep.test.ts`'s one and `pressLadder.sweep.test.ts`'s two — and
     * 3 × 14 400 000 = 43 200 000 exactly. So AG-D's *nothing existing was raised to make room*
     * is confirmed on the integrated tree and not only on its branch, and AG-A's two were never
     * annotated upward either: both were written on the commit that added the file.
     *
     * **The two are not registered on the same footing, and that is the finding rather than the
     * bookkeeping.** They arrived carrying the same four-hour bound and only one of them holds a
     * four-hour job. Measured 2026-09-22 on this container at load average 3.3:
     *
     * - *writes each contract's day as built and under each parking press* — sixteen contracts
     *   × three runs is **67.97 s** at one seed, so the default `PRESS_LADDER_SEEDS=20` is
     *   **22.7 minutes** and the hand-run `SEEDS=200` the file's own knobs exist for is **3.78 h**.
     *   Four hours brackets that, which is `contractCurve.sweep.test.ts`'s argument applied to this
     *   case's own job. **Registered at 14 400 000.**
     * - *writes which standing orders clear each pinned day with no press* — **91 runs in 10.18 s**
     *   at the shipped ladder's seven press days, and **295 s** for the largest census the data
     *   permits (sixteen contracts × thirteen profiles, priced off the same sitting's two per-run
     *   rates). Four hours is 1 414× the job and 48× the worst case. **Lowered at the site to
     *   900 000** rather than registered, with the measurement in its own docstring — § D405.
     *
     * So the sum registered here is 128 400 000 + 14 400 000 + 14 400 000 + 900 000 =
     * **158 100 000**, which is **13 500 000 less than the tree carried when this ratchet went
     * red**. A raise that lands below the measured tree is the only kind this entry's own rule
     * asks for: *raising a number here is a decision, not a fix*, and the decision available on a
     * bound 1 414× its job was to fix the bound.
     *
     * **What this ratchet cannot see, said once rather than implied.** It counts annotations and
     * sums them; it has no way to ask whether a bound is proportionate to the case it governs.
     * `annotationCosts` is the instrument for exactly that and it needs a `--reporter=json` run,
     * which nothing produces — the same missing wiring this file's own `scheduled: false` entry in
     * `deepTiers.test.ts` names. A four-hour bound on a ten-second job passes every check in this
     * repository, and the only reason this one was caught is that it happened to push a count.
     */
    /*
     * **111 → 112, and the one is named** — wave AH lane AH-D's `everyday/stagePace.sweep.test.ts`,
     * GitHub issue #592, § D991: every contract's Today's-scenario day 1 over fifty seeds, read for
     * § D512 legibility in real seconds under the stage's pacing and for each day's paced length. It
     * is gated on `STAGE_PACE_SWEEP` and registered in `deepTiers.test.ts`, so it costs the default
     * suite nothing. Measured: **368 s for one seed of all sixteen contracts at load average 11**,
     * the reference towers' whole days being most of it, so fifty seeds is about **5.1 h** serial —
     * annotated at **six hours** (21 600 000 ms), the job with a sixth to spare rather than a
     * multiple of it. 158 100 000 + 21 600 000 = **179 700 000**. Nothing existing was raised.
     */
    /*
     * **112 → 113, and the one is named** — wave AJ lane AJ-B's `shift/wrinkleCensus.sweep.test.ts`,
     * § D1057: every wrinkle spliced as a whole-day episode on five whole-day towers over a small
     * crowd set, beside the unwrinkled day on the same crowds, under the default standing order and
     * then every shipped order until one clears. Gated on `WRINKLE_CENSUS` and registered in
     * `deepTiers.test.ts`, so it costs the default suite nothing. Annotated at **six hours**
     * (21 600 000 ms), `stagePace.sweep.test.ts`'s bound, because the job measured in the lane ran
     * for hours at load average 16–20. 179 700 000 + 21 600 000 = **201 300 000**. Nothing existing
     * was raised.
     */
    ['viz', { count: 113, totalMs: 201_300_000 }],
    /*
     * **67 → 70, and the three are named** — GitHub issue #240's
     * `everyday/smallScreen.browser.test.ts`. Five of that file's eight annotations sit **at** this
     * tier's ceiling rather than above it, and the three that do not are the three cases that enter
     * the § 7 stage or cross four screens: `browserTier.test-helper.ts#enterEverydayStage` alone
     * waits up to 120 000 ms for the canvas to draw, so a case that calls it and then plays a day
     * cannot honestly be annotated at the ceiling — the annotation would be shorter than the helper
     * it contains. Raised here, with that reason, on the commit that added them, which is what the
     * ratchet's own message asks for. Nothing existing was raised to make room.
     */
    /*
     * **70 → 71, and the one is the same event as `viz`'s three**, not a new annotation:
     * `everyday/autoFile.browser.test.ts:259` at 300 000 ms, written over three lines and therefore
     * invisible until the scanner learned that shape. 17 820 000 − 17 520 000 = **300 000**, which
     * is that single site and nothing else. Nothing was annotated upward to make room, and nothing
     * existing was raised.
     */
    /*
     * **71 → 73, both `everyday/scenarioScreen.browser.test.ts`** — § D787's proof that a Scenario
     * stage row opens *its* stage. It presses every offered row on the built bundle and requires
     * the id in `#campaign-stage` to equal that row's, which is a claim only a browser can check
     * and only across rows: pressing one row passes against the defect, because the picker opens
     * on stage 1.
     */
    /*
     * **73 → 77, and the four are named** — all four are wave AE's
     * `everyday/firstTwoMinutes.browser.test.ts`, GitHub issue #569's instrument: the `beforeAll`
     * that builds and serves the bundle (180 000 ms), and three cases at 240 000–300 000 ms that
     * drive the shipped bundle at 1440 × 900 for the tutorial footer, the control below the fold
     * and the primary's own label.
     *
     * **They earn it because the three defects they hold were invisible to every other tier.** Each
     * is a claim about what a first-time player sees in a real viewport — a footer promising two
     * runs are coming while both are on screen, a control whose bottom edge sat at y ≈ 889 in a
     * 900 px window, and a button whose words disagreed with the screen it opened. A hit test at a
     * declared viewport is the only instrument that can see any of them, and it costs a bundle
     * build.
     *
     * **Nothing existing was raised**, and the line-number diff overstates the change if you read
     * it carelessly: `everyday/stageScreen.browser.test.ts` shows five annotations at new line
     * numbers, and all five are the **same cases moved** by that lane's edits above them. Keyed on
     * file and case name rather than on line, the added set is exactly these four. Base
     * 18 300 000 ms against head 19 320 000 — a difference of 1 020 000, which is
     * 180 000 + 240 000 + 300 000 + 300 000 exactly.
     */
    /*
     * **77 → 79, and the two are named** — both are lane AF-C's, in
     * `everyday/campaignJourney.browser.test.ts` at 300 000 ms each: *advances the career from the
     * sheet's own button, and stays in the career*, and *leaves Today's tower's own button opening
     * tomorrow*. GitHub issue #577's two polarities.
     *
     * **They earn the annotation because the defect they hold is invisible to every other tier, and
     * that is the finding rather than the cost.** The career's onward press landed the player on
     * Today's tower with the career's crumbs gone, and **nobody's module was wrong**: `reportView.ts`
     * composed a correct daily label, `host.ts#openTomorrow` advanced the week correctly and cleared
     * the campaign latch by name, and `actionBar.ts` has no `brief` row for the campaign context so
     * the bar fell back to the daily one. Three correct pieces whose *composition* swapped the mode.
     * Every unit passed while a player could spend thirteen days in the wrong mode, so the only
     * instrument that can see it is a case that drives the shipped bundle and reads the crumbs and
     * the rail back. That costs a bundle build.
     *
     * **Nothing existing was raised to make room**, and the arithmetic says so exactly: the base at
     * `495aabf` reads 77 above the ceiling summing to 19 320 000 ms, the head reads 79 summing to
     * 19 920 000 — a difference of 600 000, which is 2 × 300 000 and no more. The `viz` project's
     * own row is **unmoved at 108** across a wave of four lanes, which is worth one clause: three of
     * them added no annotated case at all.
     *
     * Derived from the tree on both commits, keyed on file and case name rather than on line,
     * because a lane that edits above an existing case shifts its line number and a line-keyed diff
     * reports a move as an addition.
     */
    /*
     * **79 → 82, and the three are named** — all three are wave AH lane A's
     * `everyday/weekSurvives.browser.test.ts` at 600 000 ms each: *plays seven days on …* (one
     * annotation, two cases, because the case is written once inside a loop over a whole-day tower
     * and a slice tower), *closes a Scenario day, plays every other mode …*, and *a reload taken
     * while a rush is standing …*. GitHub issues #593 and #594.
     *
     * **They earn it because both defects lived where no case went.** No case played past day 1 of a
     * Scenario week, so a day 3 that `core` refused on thirteen towers reached assessors first; and
     * no case left Scenario and came back, so a career day filed into the week and a rush's week was
     * written to disk and refused on the next load. Each case plays a real week or a real round
     * trip on the shipped bundle, several runs a case, which is why none can honestly sit at this
     * tier's ceiling.
     *
     * Nothing existing was raised: 19 920 000 + 3 × 600 000 = 21 720 000, keyed on file and case
     * name. If another lane of the same wave moved this row, the two moves add.
     */
    /*
     * **82 → 91 at integration, and the nine are named** — wave AH lane AH-D's three browser
     * files, each a `beforeAll` that builds and serves the bundle (180 000 ms) and two journeys at
     * 300 000 ms:
     * `everyday/stagePace.browser.test.ts` (GitHub issue #592, § D991 — a whole day's stage crosses
     * its quiet at 30× and plays its peak at 4×, and a slice is not paced),
     * `everyday/tutorialTwentySeconds.browser.test.ts` (#598, § D992 — the tutorial's failure within
     * twenty seconds, with a clock) and `everyday/tutorialLeave.browser.test.ts` (#598, § D993 —
     * neither exit files a day, and a reload offers a cover with a live way past it).
     *
     * **They earn it for the reason the four above did**: each holds a claim about what the mounted
     * screen does over real time — a transport changing speed, a press going live when somebody has
     * waited a minute, a week staying empty across a worker's landing — that no unit tier can see.
     * The stage journey waits for a whole day to simulate in the worker and then plays a real minute
     * to 08:30, which is why its bound is not the tier's. 21 720 000 + 3 × 180 000 + 6 × 300 000 =
     * **24 060 000**, lane A's row above plus these nine, which is the two moves adding as that
     * row said they would. Nothing existing was raised.
     */
    /*
     * **91 → 96, and the five are named** — wave AI lane AI-A's
     * `everyday/dayIsItsOwn.browser.test.ts` at 300 000 ms each: two cases for § D1002 (a press on
     * one tower's day does not ride into another tower's untouched day; a second attempt from the
     * brief starts with no presses), two for § D1003 (a reload mid-rush and one on a career report
     * keep the Scenario week's crowd), and one for § D1004 (a closed today opens tomorrow from the
     * front door, and Your week reads it closed after a reload).
     *
     * **They earn it for the reason the rows above did**: every defect they hold lived between two
     * runs, and each case plays two or three days — or a mode and a reload — on the shipped bundle,
     * which is exactly what no unit tier can see. Each was run against the bundle built from the tree
     * before the fix and failed there. Nothing existing was raised:
     * 24 060 000 + 5 × 300 000 = **25 560 000**, keyed on file and case name.
     */
    /*
     * **96 → 97, and the one is named** — wave AI lane AI-D's `everyday/pressCall.browser.test.ts`
     * at 300 000 ms (§ D1029): one case that opens a pinned day, holds the presses before the call,
     * stops at the call at `600×`, answers it, closes the day on the report and takes the call again
     * — two attempts on the shipped bundle, which is what no unit tier can see. Nothing existing was
     * raised: 25 560 000 + 300 000 = **25 860 000**.
     */
    ['viz-browser', { count: 97, totalMs: 25_860_000 }],
  ]);

/**
 * Trailing numeric arguments that are **not** annotations, registered so the census can say so.
 *
 * `annotationsIn` declines any trailing argument it cannot attribute to a vitest opener, and the
 * check below asserts that the set of numeric ones is exactly this. Both directions matter: a new
 * entry means the scanner has met a shape it cannot read, and an entry that stops reproducing means
 * a site moved and the registry is decoration. Today there is one, and it is a `setTimeout` inside
 * a helper — a socket that must not hang, closed `}, 2_000);` exactly as a test would be.
 *
 * **It moved from `:142` to `:143` on 2026-09-10** and nothing about it changed: GitHub issue #242
 * added one import to that file, above the helper. That is a line-number pin behaving exactly as the
 * paragraph above says it should — the entry stopped reproducing, the check went red, and somebody
 * looked. A registry keyed on a line will do this on every edit upstream of the site, and the cost
 * is the point rather than a defect: the alternative is a key that cannot tell a moved site from a
 * deleted one.
 */
const DECLINED_NUMERIC: readonly string[] = ['packages/server/src/http/serve.test.ts:143'];

/**
 * A pinned set of files that stands in for *one unit of this machine* — see `cohortRatio`.
 *
 * Chosen mechanically rather than by taste: every `viz` file whose wall clock sat between 0.5 s and
 * 3 s in the run of 2026-09-05, which is 32 files and 48.0 s, 5.7 % of that run's serial cost. Small
 * files are import-dominated and noisy one at a time; thirty-two of them together are not, and none
 * of them is a simulation sweep whose own cost could drift for reasons that are not the machine.
 *
 * It is a *baseline*, so its own staleness is the hazard: `cohortRatio` returns `present` beside
 * `pinned` and a reader who sees them diverge should re-pin rather than believe the ratio.
 */
const REFERENCE_COHORT: readonly string[] = [
  'packages/viz/src/authoring/roundTrip.test.ts',
  'packages/viz/src/campaign/fitOut.test.ts',
  'packages/viz/src/campaign/reportWindow.test.ts',
  'packages/viz/src/campaign/stageOneParking.test.ts',
  'packages/viz/src/dev/browserTier.test.ts',
  'packages/viz/src/dev/defaults.test.ts',
  'packages/viz/src/dev/dispatcherEditor.test.ts',
  'packages/viz/src/dev/leftRail.test.ts',
  'packages/viz/src/dev/menuPanel.test.ts',
  'packages/viz/src/dev/rightRail.test.ts',
  'packages/viz/src/dev/trafficEditor.test.ts',
  'packages/viz/src/dev/viewerSelector.test.ts',
  'packages/viz/src/editor/editorPreview.test.ts',
  'packages/viz/src/everyday/stageHandover.test.ts',
  'packages/viz/src/frame/frameAt.test.ts',
  'packages/viz/src/honesty/agreement.test.ts',
  'packages/viz/src/live/bands.test.ts',
  'packages/viz/src/menu/boardRun.test.ts',
  'packages/viz/src/menu/howToPlay.test.ts',
  'packages/viz/src/menu/menu.test.ts',
  'packages/viz/src/menu/screens.test.ts',
  'packages/viz/src/mode/glossary.test.ts',
  'packages/viz/src/record/decisionLog.test.ts',
  'packages/viz/src/record/document.test.ts',
  'packages/viz/src/render/runSummary.test.ts',
  'packages/viz/src/shift/banking.test.ts',
  'packages/viz/src/shift/dayLength.test.ts',
  'packages/viz/src/shift/events.test.ts',
  'packages/viz/src/shift/incidents.test.ts',
  'packages/viz/src/shift/reportWindow.test.ts',
  'packages/viz/src/watch/record.test.ts',
  'packages/viz/src/watch/reference.test.ts',
];

/**
 * The two shapes an annotation is written in, and the one that used to be invisible.
 *
 * Both fixtures are the **same annotation**: one case, one bound, 600 001 ms — a millisecond over
 * `viz`'s ceiling so that a miscount shows up in the above-ceiling arm too, not only in the total.
 * They differ in nothing but line breaks, so a scanner that reads one and not the other is
 * reporting a fact about Prettier rather than about cost.
 *
 * **The multi-line one is the control.** Before the {@link MULTI_BRACE} path it returned zero
 * annotations, which is how a three-hour bound sat uncounted in `scenario/survivorSweep.test.ts`
 * with `ABOVE_CEILING` green over it. Revert that path and the second case here goes red, which is
 * the only reason to trust the first.
 *
 * The third fixture is the guard in the other direction, and it is the one worth keeping: this
 * repository really does quote `}, 600_000);` **in prose**, twice in `vitest.config.ts`'s own
 * retraction. It must stay uncounted — and it does, because {@link blankNonCode} turns a comment
 * into whitespace before any pattern here runs. That protection belongs to the blanker rather than
 * to the patterns, which is exactly why widening the patterns is safe.
 */
describe('an annotation is counted in both shapes it is written in', () => {
  const CEILINGS = ceilingsFrom(config);
  const AT = 'packages/viz/src/fixture.test.ts';

  const ONE_LINE = [
    "import { it } from 'vitest';",
    '',
    "  it('a bound on one line', async () => {",
    '    await nothing();',
    '  }, 600_001);',
    '',
  ].join('\n');

  const MULTI_LINE = [
    "import { it } from 'vitest';",
    '',
    '  it(',
    "    'a bound on one line',",
    '    async () => {',
    '      await nothing();',
    '    },',
    '    /* the same bound, with its reason written beside it */',
    '    600_001,',
    '  );',
    '',
  ].join('\n');

  const IN_PROSE = [
    '/**',
    ' * A docstring that quotes the shape being counted, closed `}, 600_001);` exactly as a test',
    ' * would be — and on three lines too:',
    ' *',
    ' *   },',
    ' *   600_001,',
    ' * );',
    ' */',
    'export const NOTHING = 1;',
    '',
  ].join('\n');

  it('counts the single-line shape', () => {
    const { annotations, unattributed } = annotationsIn(AT, ONE_LINE, CEILINGS);
    expect(annotations.map((one) => one.ms)).toStrictEqual([600_001]);
    expect(annotations[0]?.opener).toBe('it');
    expect(annotations[0]?.name).toBe('a bound on one line');
    expect(unattributed).toStrictEqual([]);
  });

  it('counts the multi-line shape, which it could not before', () => {
    const { annotations, unattributed } = annotationsIn(AT, MULTI_LINE, CEILINGS);
    expect(
      annotations.map((one) => one.ms),
      'a bound Prettier broke across lines is still a bound, and an uncounted annotation is ' +
        'RISKS.md R38 wearing a timeout',
    ).toStrictEqual([600_001]);
    expect(annotations[0]?.opener).toBe('it');
    expect(annotations[0]?.name).toBe('a bound on one line');
    expect(unattributed).toStrictEqual([]);
  });

  it('reads the two shapes identically, because they are the same annotation', () => {
    const one = annotationsIn(AT, ONE_LINE, CEILINGS).annotations;
    const many = annotationsIn(AT, MULTI_LINE, CEILINGS).annotations;
    expect(many.length).toBe(one.length);
    expect(many[0]?.ms).toBe(one[0]?.ms);
    expect(many[0]?.via).toBe(one[0]?.via);
    expect(many[0]?.project).toBe(one[0]?.project);
  });

  it('counts neither shape when it is quoted in prose', () => {
    const { annotations, unattributed } = annotationsIn(AT, IN_PROSE, CEILINGS);
    expect(
      annotations,
      'blankNonCode blanks a comment before any pattern runs, which is what lets the patterns ' +
        'widen safely — vitest.config.ts quotes this shape twice in its own retraction',
    ).toStrictEqual([]);
    expect(unattributed).toStrictEqual([]);
  });
});

describe('the annotation census is derived from the tree, not transcribed', () => {
  it('reads every project ceiling out of vitest.config.ts', () => {
    const ceilings = ceilingsFrom(config);
    // The six the config registers, and the two values it sets.
    expect([...ceilings.keys()].sort()).toStrictEqual([
      'cli',
      'core',
      'experiments',
      'server',
      'viz',
      'viz-browser',
    ]);
    expect(ceilings.get('viz')?.ceilingMs).toBe(300_000);
    expect(ceilings.get('viz-browser')?.ceilingMs).toBe(120_000);
    // Nothing is left on vitest's own default today; the day one is, this says so rather than
    // silently censusing it against 5 000 ms.
    expect([...ceilings.values()].filter((one) => one.isDefault)).toStrictEqual([]);
  });

  it('counts nothing it cannot attribute, and says so where it declines', () => {
    // A numeric trailing argument that reached no opener is either a shape this scanner cannot read
    // or a call that is not a test. Every one is registered with which, and the register is
    // asserted in both directions so it cannot become decoration.
    const missedNumeric = census.unattributed
      .filter((one) => /^[0-9_]+$/u.test(one.argument))
      .map((one) => `${one.file}:${one.line}`);
    expect(missedNumeric).toStrictEqual([...DECLINED_NUMERIC]);

    // An identifier the scanner cannot resolve would be an annotation it cannot price. There are
    // none of those either; what it declines are calls that are not tests at all —
    // `page.evaluate(fn, selector)` and friends — and those are correctly not annotations.
    const unresolved = census.unattributed.filter((one) => one.reason === 'unresolved constant');
    expect(unresolved).toStrictEqual([]);
    expect(census.unattributed.every((one) => one.reason === 'no opener')).toBe(true);
  });

  it('finds the annotations the issue could not, because they are constants rather than literals', () => {
    // The correction #344's census needs: a numeric-literal scan sees 45 above-ceiling annotations
    // in `experiments`, and the population is 168. Named here as a fact about the scanner's reach,
    // and gated nowhere — see ABOVE_CEILING's note on scope.
    const experiments = census.byProject.get('experiments');
    const byConstant = census.annotations.filter(
      (one) => one.project === 'experiments' && one.via === 'constant' && one.ms > 300_000,
    );
    expect(experiments).toBeDefined();
    expect(byConstant.length).toBeGreaterThan(100);
  });

  it('holds the above-ceiling population as a ratchet that may only fall', () => {
    for (const [project, pinned] of ABOVE_CEILING) {
      const measured = census.byProject.get(project);
      expect(measured, `${project} is registered in vitest.config.ts`).toBeDefined();
      const above = measured?.aboveSites ?? [];
      const totalMs = above.reduce((sum, one) => sum + one.ms, 0);
      expect(
        above.length,
        `${project} carries ${above.length} annotations above its own ${measured?.ceilingMs} ms ` +
          `ceiling, and ${pinned.count} were registered. A case may not be annotated upward to ` +
          'satisfy a budget (#344, criterion 4). If this one earns its annotation, raise the ' +
          'entry in ABOVE_CEILING and say why in the same commit.',
      ).toBeLessThanOrEqual(pinned.count);
      expect(
        totalMs,
        `${project}'s above-ceiling annotations now sum to ${totalMs} ms against ${pinned.totalMs} ` +
          'registered. The count can stay level while a value is raised, which is why the sum is ' +
          'here as well as the count.',
      ).toBeLessThanOrEqual(pinned.totalMs);
    }
  });

  it('holds the census vitest.config.ts states to what the tree says', () => {
    // R38, and the reason #344 exists at all: the paragraph this replaces was typed once and
    // checked never — twice, a day apart, on the same docstring. Every count the docstring states
    // is rebuilt here from the tree, so the prose cannot drift without this going red.
    const viz = census.byProject.get('viz');
    const browser = census.byProject.get('viz-browser');
    expect(viz).toBeDefined();
    expect(browser).toBeDefined();

    // `packages/viz` the directory, which is the population the older sentence counts and is not
    // the same population as the `viz` project — the difference is the whole of the correction.
    const directory = census.annotations.filter((one) => one.file.startsWith('packages/viz/'));
    const atSimulatingCeiling = directory.filter((one) => one.ms === 300_000).length;

    /*
     * The fourth row, derived like the three above it — **and it was the one that was not**.
     *
     * It read `| above 300 000 ms | 89 | 4 |` and the tree said 96, because nothing asserted it:
     * `above its own ceiling` moved three times while this sat still. For the `viz` column the two
     * rows are the **same predicate**, since that project's own ceiling *is* 300 000 ms, so the
     * file contradicted itself two lines apart. The row earns its place only in the `viz-browser`
     * column, where the ceiling is 120 000 and *above 300 000* is a genuinely different question.
     *
     * A stale figure inside the docstring written to stop stale figures is `RISKS.md` R38 at its
     * least excusable, and it was found by a reviewer rather than by this loop — which is the
     * argument for putting it in the loop.
     */
    const aboveSimulatingCeiling = (project: string): number =>
      census.annotations.filter((one) => one.project === project && one.ms > 300_000).length;

    /*
     * The fifth and sixth rows, added 2026-09-22 — **the two figures in that docstring this loop
     * did not cover, and therefore the only two that were wrong.**
     *
     * The prose two lines under the table said the *above 300 000 ms* row *"sees four browser cases
     * and misses the 63 that sit above the tier's own ceiling, including twenty annotated at
     * exactly this file's constant"*. Measured on this tree the two are **75** and **31**, and
     * measured on wave AG's base at `9db3528` they are **75** and **31** as well — so neither had
     * been true for some number of waves and no wave moved them. Every figure this loop asserted
     * was correct or went red on the commit that moved it; the two it did not assert drifted
     * silently, in the paragraph whose own argument is that a census must ask each project about
     * its own ceiling rather than about a number.
     *
     * That is the whole case for a claim list rather than a careful author, so they are in it.
     * `browser?.above - aboveSimulatingCeiling('viz-browser')` is the difference the sentence is
     * *about*, derived rather than subtracted by the reader, and the second is the browser tier's
     * population at exactly this file's own constant — which is a different predicate from `at its
     * own ceiling` above it, because that tier's ceiling is 120 000 and not 300 000.
     */
    const atSimulatingCeilingIn = (project: string): number =>
      census.annotations.filter((one) => one.project === project && one.ms === 300_000).length;

    for (const claim of [
      `| annotations | ${viz?.total ?? 0} | ${browser?.total ?? 0} |`,
      `| above its own ceiling | **${viz?.above ?? 0}** | **${browser?.above ?? 0}** |`,
      `| at its own ceiling | ${viz?.at ?? 0} | ${browser?.at ?? 0} |`,
      `| above 300 000 ms | ${aboveSimulatingCeiling('viz')} | ${aboveSimulatingCeiling('viz-browser')} |`,
      `**${directory.length}** timeout annotations in all, of which **${atSimulatingCeiling}**`,
      `misses the **${(browser?.above ?? 0) - aboveSimulatingCeiling('viz-browser')}** that sit ` +
        `above the tier's own ceiling, including **${atSimulatingCeilingIn('viz-browser')}**`,
    ]) {
      expect(
        config,
        `vitest.config.ts no longer states, and the tree now says: ${claim}`,
      ).toContain(claim);
    }
  });
});

/**
 * A minimal report in the reporter's own shape, so the properties below are about the arithmetic
 * rather than about a fixture the arithmetic was written around.
 */
function reportOf(files: readonly (readonly [string, readonly number[]])[], scale = 1): unknown {
  let clock = 1_000_000;
  const testResults = files.map(([name, durations]) => {
    const start = clock;
    const wall = durations.reduce((sum, one) => sum + one, 0) * scale;
    clock += wall;
    return {
      name: `${REPO_ROOT}packages/viz/src/${name}`,
      startTime: start,
      endTime: start + wall,
      status: 'passed',
      assertionResults: durations.map((ms, index) => ({
        title: `case ${index}`,
        fullName: `${name} case ${index}`,
        duration: ms * scale,
        status: 'passed',
      })),
    };
  });
  return { startTime: 1_000_000, testResults };
}

const SHAPE: readonly (readonly [string, readonly number[]])[] = [
  ['heavy.test.ts', [100_000, 40_000, 900]],
  ['middling.test.ts', [20_000, 5_000]],
  ['light.test.ts', [400, 300, 120]],
  ['tiny.test.ts', [30, 20]],
];

describe('the instrument survives a machine swing, and is blind to exactly one thing', () => {
  const base = attributionOf(reportOf(SHAPE));

  it('reports a share and a critical path that do not move when every duration does', () => {
    // § D483's model: one factor, applied to everything. 1.82 is the measured factor.
    const swung = attributionOf(reportOf(SHAPE, 1.82));
    const drift = driftBetween(base, swung);

    expect(drift.scale).toBeCloseTo(1.82, 6);
    expect(drift.totalAbsShareDelta).toBeCloseTo(0, 12);
    expect(drift.criticalPathShareDelta).toBeCloseTo(0, 12);
    expect(drift.rankMoves).toStrictEqual([]);
    expect(swung.criticalPathShare).toBeCloseTo(base.criticalPathShare, 12);
    // And the seconds, which are what a budget would have been written in, move by the whole 1.82.
    expect(swung.serialMs / base.serialMs).toBeCloseTo(1.82, 6);
  });

  it('is blind to uniform growth, which is the limitation stated as a test', () => {
    // A suite where every file got 20 % more expensive for real reasons is arithmetically
    // indistinguishable, in shares, from a machine 20 % slower. Nothing in `driftBetween` can tell
    // them apart, and this asserts that rather than leaving it as a sentence in a docstring.
    const grown = attributionOf(reportOf(SHAPE, 1.2));
    const drift = driftBetween(base, grown);
    expect(drift.totalAbsShareDelta).toBeCloseTo(0, 12);
    expect(drift.worstShareMove?.delta ?? 0).toBeCloseTo(0, 12);
  });

  it('sees one file growing, which is what a share is for', () => {
    // Eight-fold, which is what it takes to pass `heavy.test.ts` — so the rank moves as well as the
    // share, and the two halves of the instrument are both exercised.
    const changed = SHAPE.map(([name, durations]) =>
      name === 'middling.test.ts'
        ? ([name, durations.map((one) => one * 8)] as const)
        : ([name, durations] as const),
    );
    const drift = driftBetween(base, attributionOf(reportOf(changed)));
    expect(drift.worstShareMove?.file).toBe('packages/viz/src/middling.test.ts');
    expect(drift.worstShareMove?.delta ?? 0).toBeGreaterThan(0.1);
    expect(drift.rankMoves.map((one) => `${one.file} ${one.from}->${one.to}`)).toStrictEqual([
      'packages/viz/src/heavy.test.ts 1->2',
      'packages/viz/src/middling.test.ts 2->1',
    ]);
  });

  it('sees absolute growth through a same-run baseline, and reports its own staleness', () => {
    const cohort = ['packages/viz/src/light.test.ts', 'packages/viz/src/tiny.test.ts'];
    const swung = attributionOf(reportOf(SHAPE, 1.82));
    // The machine moves and the ratio does not.
    expect(cohortRatio(swung, cohort).ratio).toBeCloseTo(cohortRatio(base, cohort).ratio, 9);
    // One file grows and the ratio does.
    const grown = SHAPE.map(([name, durations]) =>
      name === 'heavy.test.ts'
        ? ([name, durations.map((one) => one * 2)] as const)
        : ([name, durations] as const),
    );
    expect(cohortRatio(attributionOf(reportOf(grown)), cohort).ratio).toBeGreaterThan(
      cohortRatio(base, cohort).ratio * 1.3,
    );
    // A pinned member that is no longer in the tree is visible rather than silent.
    const stale = cohortRatio(base, [...cohort, 'packages/viz/src/renamed.test.ts']);
    expect(stale.present).toBe(2);
    expect(stale.pinned).toBe(3);
  });

  it('attributes the leg to files and cases, and names the floor concurrency cannot cross', () => {
    expect(filesCovering(base, 0.5)).toBe(1);
    expect(base.criticalPathShare).toBeGreaterThan(0.5);
    expect(base.files[0]?.file).toBe('packages/viz/src/heavy.test.ts');
    expect(base.cases[0]?.ms).toBe(100_000);
    // Everything a file's wall clock is not spent inside a case — imports, collection, hooks.
    expect(base.files.every((one) => one.outsideMs >= 0)).toBe(true);
  });

  it('refuses a report with no clock in it rather than attributing zeroes', () => {
    expect(() => attributionOf({ testResults: [] })).toThrow(/no `testResults`/u);
    expect(() =>
      attributionOf({ startTime: 1, testResults: [{ name: 'x.test.ts', assertionResults: [] }] }),
    ).toThrow(/no clock/u);
  });

  it('prices an annotation against the case it governs, and says when it cannot', () => {
    const attribution = attributionOf(reportOf(SHAPE));
    const [first] = attribution.files;
    expect(first).toBeDefined();
    const priced = annotationCosts(
      [
        {
          file: 'packages/viz/src/heavy.test.ts',
          line: 1,
          opener: 'it',
          name: 'case 0',
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
        {
          file: 'packages/viz/src/heavy.test.ts',
          line: 2,
          opener: 'beforeAll',
          name: undefined,
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
        {
          file: 'packages/viz/src/gone.test.ts',
          line: 3,
          opener: 'it',
          name: 'case 0',
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
        {
          file: 'packages/viz/src/heavy.test.ts',
          line: 4,
          opener: 'it',
          name: 'partitions the legs, on %s',
          ms: 600_000,
          via: 'literal',
          project: 'viz',
        },
      ],
      attribution,
    );
    expect(priced.map((one) => one.verdict.kind)).toStrictEqual([
      'case',
      'hook',
      'file did not run',
      'name not matched',
    ]);
    const [governed] = priced;
    expect(governed?.verdict.kind === 'case' ? governed.verdict.measuredMs : 0).toBe(100_000);
    expect(governed?.verdict.kind === 'case' ? governed.verdict.headroom : 0).toBeCloseTo(6, 9);
  });
});

/**
 * The deriver: skipped unless asked for, on `honesty/measure.corpus.test.ts`'s precedent.
 *
 * ```
 * npx vitest run --project viz --reporter=json --outputFile=/tmp/vizA.json
 * TEST_COST_REPORT=/tmp/vizA.json TEST_COST_OUT=/tmp/cost.txt \
 *   npx vitest run --project viz packages/viz/src/testCost.test.ts
 * ```
 *
 * `TEST_COST_OUT` alone opens the gate and writes the census; `TEST_COST_REPORT` adds the
 * attribution, `TEST_COST_REPORT_B` adds the drift between two runs — which is the only honest way
 * to say anything about a machine swing, because both readings have to exist before either means
 * anything — and `TEST_COST_ROOT` points the census at another checkout, which is how a published
 * count is shown to have moved or not.
 *
 * It asserts nothing about the figures. R38's remedy is a ratchet or a derivation and never a pin,
 * and a pinned second count is precisely what § D483 refuted.
 */
const reportPath = process.env['TEST_COST_REPORT'];
const secondPath = process.env['TEST_COST_REPORT_B'];
const outPath = process.env['TEST_COST_OUT'];
const rootOverride = process.env['TEST_COST_ROOT'];

describe.skipIf(outPath === undefined)('the test-cost figures, derived rather than transcribed', () => {
  it('writes the census and the attribution where a reporter cannot swallow them', () => {
    /*
     * **The census half needs no report, and that is what makes a base tree measurable.** #344's
     * own figures were taken on `13e7b93` and this file's are taken on the wave branch; the only
     * way to say whether a count *moved* is to run the same scanner over both, which
     * `TEST_COST_ROOT` allows:
     *
     * ```
     * git archive 13e7b93 packages | tar -x -C /tmp/base
     * TEST_COST_ROOT=/tmp/base TEST_COST_OUT=/tmp/base-census.txt \
     *   npx vitest run --project viz packages/viz/src/testCost.test.ts
     * ```
     *
     * The ceilings still come from *this* tree's `vitest.config.ts`, deliberately: a census of an
     * old tree against a moved ceiling would answer a question nobody asked.
     */
    const measured =
      rootOverride === undefined ? census : censusOf(join(rootOverride, 'packages'), VITEST_CONFIG);
    const lines = [
      `# test cost, derived ${new Date().toISOString().slice(0, 10)}`,
      `# tree: ${rootOverride ?? 'this worktree'}`,
      `# report: ${reportPath ?? 'none — census only'}`,
      '',
      formatCensus(measured),
    ];

    if (reportPath !== undefined) {
      const read = (path: string): Attribution =>
        attributionOf(JSON.parse(readFileSync(path, 'utf8')) as unknown);
      const attribution = read(reportPath);
      lines.push(
        '',
        formatAttribution(attribution),
        '',
        `cohort: ${JSON.stringify(cohortRatio(attribution, REFERENCE_COHORT))}`,
      );

      const above = [...(measured.byProject.get('viz')?.aboveSites ?? [])];
      const priced = annotationCosts(above, attribution);
      const cases = priced.filter((one) => one.verdict.kind === 'case');
      const costs = cases
        .map((one) => (one.verdict.kind === 'case' ? one.verdict.measuredMs : 0))
        .sort((a, b) => b - a);
      lines.push(
        '',
        'above-ceiling annotations in the viz project, priced against this run',
        `  joined to a case: ${cases.length}   hooks: ${priced.filter((one) => one.verdict.kind === 'hook').length}` +
          `   file did not run: ${priced.filter((one) => one.verdict.kind === 'file did not run').length}` +
          `   name not matched: ${priced.filter((one) => one.verdict.kind === 'name not matched').length}`,
        `  measured: max ${((costs[0] ?? 0) / 1000).toFixed(1)} s, median ${((costs[Math.floor(costs.length / 2)] ?? 0) / 1000).toFixed(2)} s`,
      );
      for (const amplification of [1, 1.82, 4.5, 9]) {
        lines.push(
          `  past the 300 s ceiling at ${amplification}×: ${costs.filter((one) => one * amplification > 300_000).length}` +
            `   past their own annotation: ${
              cases.filter(
                (one) =>
                  one.verdict.kind === 'case' &&
                  one.verdict.measuredMs * amplification > one.annotation.ms,
              ).length
            }`,
        );
      }
      for (const one of priced
        .filter((entry) => entry.verdict.kind === 'case')
        .sort(
          (a, b) =>
            (b.verdict.kind === 'case' ? b.verdict.measuredMs : 0) -
            (a.verdict.kind === 'case' ? a.verdict.measuredMs : 0),
        )
        .slice(0, 12)) {
        const ms = one.verdict.kind === 'case' ? one.verdict.measuredMs : 0;
        lines.push(
          `  ${(ms / 1000).toFixed(1).padStart(7)} s  annotated ${(one.annotation.ms / 1000).toFixed(0)} s  ${one.annotation.file}:${one.annotation.line}`,
        );
      }

      if (secondPath !== undefined) {
        const drift = driftBetween(attribution, read(secondPath));
        lines.push(
          '',
          `drift against ${secondPath}`,
          `  scale (serial): ${drift.scale.toFixed(4)}`,
          `  Σ|Δshare|: ${drift.totalAbsShareDelta.toFixed(5)}   worst: ${drift.worstShareMove?.file ?? '—'} ${(drift.worstShareMove?.delta ?? 0).toFixed(5)}`,
          `  Δcritical path share: ${drift.criticalPathShareDelta.toFixed(5)}`,
          `  rank moves in the top ten: ${drift.rankMoves.map((one) => `${one.file} ${one.from}->${one.to}`).join(', ') || 'none'}`,
          `  only in one run: ${[...drift.onlyInA, ...drift.onlyInB].join(', ') || 'none'}`,
          `  cohort ratio: ${cohortRatio(attribution, REFERENCE_COHORT).ratio.toFixed(4)} vs ${cohortRatio(read(secondPath), REFERENCE_COHORT).ratio.toFixed(4)}`,
        );
      }
    }

    writeFileSync(outPath as string, `${lines.join('\n')}\n`, 'utf8');
  });
});
