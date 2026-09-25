/**
 * What today asks — bars that harden with the day, read only from observations.
 *
 * ## Why this is a second goal vocabulary, and why that is not a duplicate
 *
 * `scenario/goals.ts` already holds a goal vocabulary, and the first thing to say is that this
 * module is **not** a replacement for it or a fork of it. They answer different questions on
 * different objects, and merging them would break the older one's central finding.
 *
 * | | `scenario/goals.ts` | this module |
 * |---|---|---|
 * | judged over | **a batch** — twenty or fifty replications of one configuration | **one day**, which is one replication |
 * | input | `BatchReplication` — a run's summary, including `unservedFraction` and `pctOverLongWait` | {@link GoalObservations} — four counts and ratios of counts |
 * | output | a **pass rate** with its `n`, classified by R12 into `batch` / `configuration-fact` / `not-shippable` | a per-day `met` / `missed` / `pending` |
 * | may it say a thing was achieved? | no — R12's trichotomy leaves no single-run category | yes, and that is the whole difference |
 *
 * `scenario/goals.ts`'s module docstring is explicit that R12 *"empties the single-run goal
 * category"* and that {@link GoalDisposition} therefore has no `single-run` member. A shift goal is
 * exactly the object R12 says may not exist — a verdict on one replication — and it is legitimate
 * here for one reason, stated so it can be attacked: **a shift goal is not a claim about a
 * dispatcher.** *"You carried 89 % of the people who turned up today"* is a statement about what
 * happened on one day, which is what the reader watched happen. It is never *"this dispatcher is
 * better"*, which needs 50–200 paired replications and an interval excluding zero, and which this
 * viewer may only say on the Compare surface (`docs/12` § 2.3, R2). The report's small print says
 * so in the reader's own words, on every single day.
 *
 * Reusing `scenario/goals.ts` here was tried on paper and refused for a concrete reason rather
 * than a taxonomic one: its five per-replication predicates read `unservedFraction`,
 * `personsPer5Min` and `pctOverLongWait` off a `BatchReplication`, none of which the live rail has
 * at playhead `t`, and three of the four bars the design draws (a carried share, a peak queue
 * depth, an abandonment count) have no kind in its table at all. Extending its `GOAL_KINDS` with
 * three per-day kinds would have put objects with no pass rate into the type `measureGoalRate`
 * consumes, and R12's classification is the thing that type exists to compute.
 *
 * ## The rule that is structural rather than stated
 *
 * {@link readGoal} takes a {@link GoalObservations}, which carries seven numbers, one censoring
 * flag and **not one suppressible field** — no `meanWaitS`, no `wait95S`, no
 * `meanTimeToDestinationS`. A goal that wanted to grade a mean could not be written against this
 * type. CLAUDE.md: *"If a configuration saturates, flag it and suppress the AWT interval"*;
 * grading against the suppressed figure would be the inverse of that rule, and the handoff's own
 * footer — *"nothing on this screen is averaged over a queue that never settled"* — is what this
 * enforces. The worst wait clears that bar deliberately: it is a **maximum**, not an estimate —
 * the same classification `report.ts#worstWaitFigure` relies on to print it on a saturated run —
 * and where a maximum genuinely is unknowable (its leg unresolved) the censoring flag makes the
 * reading refuse rather than guess; see {@link readGoal}.
 *
 * {@link ShiftGoal.reads} is a **key** of that type rather than a closure for the same reason: a
 * predicate carrying its own reader can read anything it closes over.
 *
 * ## Nothing is graded before the building wakes up
 *
 * `design.html` :2382. Under {@link WAKE_UP_ARRIVALS} arrivals every reading is `pending` and
 * renders `—`. Modelled as its own state and not as `met: false`, because an empty morning is not
 * a failure — a `carryPct` of 100 % over three riders is arithmetic, not competence, and a
 * `peakQueue` of 0 before anybody arrived is not a queue held under control. A boolean cannot tell
 * the two apart; a three-valued state can, and `week.ts` treats pending as *not met* when it counts
 * a clean day, which is `campaign/judge.ts`'s rule (*unjudged is not passed*) at a smaller scale.
 */

import type { WaitBandBasis } from '../live/types.js';

import {
  WAKE_UP_ARRIVALS,
  type DayOutcome,
  type GoalObservationId,
  type GoalObservations,
  type GoalReading,
  type GoalState,
  type RunHorizon,
  type ShiftGoal,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * The bars, and how they harden
 * -------------------------------------------------------------------------- */

/**
 * What the worst-wait ceiling is multiplied by when the day being graded is a **whole authored
 * day** rather than a thirty-minute slice of one — `shift/dayLength.ts`, and the one bar the day's
 * length moves.
 *
 * ## Why exactly one of the four bars carries this, and it is not the one you would guess
 *
 * Two of the four read a **share** (`carryPct`, `minutePct`) and two read a **maximum**
 * (`peakQueue`, `worstWaitS`). The obvious expectation is that both maxima grow with the horizon —
 * a maximum over twenty times the wall clock is a maximum over twenty times the opportunities — and
 * **for the queue that expectation is measured and refuted**, on the towers as their contracts hand
 * them over, by a three-member decision swarm that ruled three of three
 * ([§ D1085](../../../../DECISIONS.md)). `peakQueue` is the deepest single landing over the **whole
 * run** on both horizons (`live/observations.ts#sweepQueues`) and never reads the reporting window,
 * so § D962's defect, one constant grading a window that grew from 300 s to 36 000 s, has no queue
 * analogue: a whole day adds peaks to take the maximum over (lunch, on three of these towers), and
 * nothing else.
 *
 * Day 1, `collective`, ordinary, seeds `20 260 824 + 7 919 n` for `n = 0…24`, each seed run as the
 * contract's own 1 800 s slice and as the 36 000 s `office-day` Today's scenario plays, through
 * `shiftRunConfigOf` → `recordRun` → `observationsAt(recording, recording.endedAt)`. Median
 * `peakQueue` with p10 and p90, the seeds missing the day-1 bar of 32, and the paired whole − slice
 * difference with its 95 % interval. The honesty and engineering members ran this cell with separate
 * instruments and their 300 rows are identical:
 *
 * | contract | slice | whole day | misses, slice → whole | whole − slice, paired |
 * |---|---|---|---|---|
 * | c2 `midtown-office` | 18 [13, 27] | 23 [15, 32] | 1 → 3 | +3.6 [−0.1, +7.3] |
 * | c3 `secure-tower` | 32 [25, 46] | 29 [22, 32] | 11 → 2 | **−5.4 [−10.2, −0.6]** |
 * | c4 `mixed-use-high-rise` | 42 [30, 69] | 49 [32, 76] | 21 → 22 | +3.2 [−5.0, +11.4] |
 * | c6 `chancery-house` | 29 [22, 49] | 29 [17, 43] | 11 → 9 | −3.2 [−9.7, +3.3] |
 * | c9 `harbour-point` | 32 [22, 56] | 28 [22, 40] | 12 → 9 | −6.5 [−13.9, +0.9] |
 * | c10 `ashgate` | 32 [21, 40] | 29 [21, 36] | 11 → 7 | −1.5 [−5.6, +2.6] |
 * | **pooled, 150 pairs** | | | **67 → 52** | **−1.63 [−4.03, +0.76]** |
 *
 * No direction across towers (one of six reads deeper over the day, one shallower, four
 * indistinguishable), and none pooled: the interval contains zero and the whole day is deeper on 62
 * of 150 pairs. **So the queue bar does not move**, and a lane that had scaled both because both are
 * maxima would have loosened a real test on no evidence. At the day-1 bar the whole day refuses
 * **34.7 %** of these 150 runs against a pooled two-thirds point of **34.00**, which is § D468's
 * one-third line to within a third of a standard error, and the five-goal day misses **52.7 %**,
 * inside `docs/33` DC-4's band; the same bar refuses 44.7 % of the slices. The seven larger towers
 * (`c5`, `c11` to `c16`) missed 32 on every run measured at both horizons, three to five whole days
 * each, so the building decides their verdict and they are outside the pool: pooled over all thirteen as
 * § D962 pooled, the two-thirds point is **271 people** and would grade nothing.
 *
 * **The wall on later days is growth, and it stands at both horizons.** Misses of the queue bar over
 * the same six contracts, 150 runs a cell: day 2 (bar 30) 122 on the slice and 106 over the whole
 * day; day 4 (bar 26) 149 and 149; day 7 (bar 20) 150 and 150. The peak roughly doubles by day 4
 * while the ladder hardens, which is `docs/33` F5, and it is the demand side's to answer rather than
 * this bar's (§ D1085).
 *
 * `queueBar.test.ts` pins one of these crowds at both horizons on every run (`c6`, `n = 0`: 43 on
 * the slice, missed; 29 over the day, met) and `nearest-car` on the same day (128, missed, with
 * every rider carried). `queueBar.sweep.test.ts` re-derives the table and asserts its four claims.
 *
 * ### The dated record this replaced
 *
 * The table below was the only measurement behind the queue's flatness until § D1085, and it is
 * kept as the record of what was measured then. Ten seeds per cell, day 1, the shipped defaults,
 * thirty-minute `rise-and-fall` against the whole ten-hour `office-day`, median `peakQueue`, on the
 * towers **as built**, before `data/contract-ladder.json` handed any tower over at a rung. It no
 * longer describes the game: Midtown as handed over reads 18 and 23, not 216 and 229.
 *
 * | building | slice | whole day |
 * |---|---|---|
 * | Midtown Office | 216 | 229 |
 * | Secure Tower | 32 | 31 |
 * | Chancery House | 25 | **16** |
 * | Garden Apartments | 4 | 7 |
 *
 * The worst wait does move, and consistently: 1 522 → 2 804, 150 → 310, 79 → 161, 29 → 60 on the
 * dated record's four cells — ratios of **1.84, 2.07, 2.04 and 2.07**. The mechanism is not extra
 * sampling either: a slice **truncates its own tail** and a day does not. A thirty-minute run ends while the
 * morning backlog is still draining, so the longest wait it can record is bounded by the run; the
 * day's morning backlog drains into a continuing 0.25 inter-peak flow and records what it actually
 * cost. The same dispatcher on the same building looks worse purely because you watched longer,
 * which is `CLAUDE.md`'s own warned failure mode — *a mean can move because the window moved* —
 * arriving at a maximum instead of a mean.
 *
 * **`2` rather than a fitted figure**, and the spread is why: four buildings give 1.84–2.07 and a
 * third decimal would claim a precision four buildings do not support. The run is
 * `shiftRunConfigOf` at seeds `20 260 824 + 7 919 n`, `n = 0…9`, day 1, `collective`, folded
 * through `observationsAt(recording, recording.endedAt)`.
 *
 * **It is a step and not a curve, deliberately.** Two horizons were measured because the product
 * offers two kinds of run — a period, and a whole authored day — and a curve through two points is
 * a curve nobody measured. It is keyed on *is this a whole day* rather than on a number of seconds
 * for the same reason: a 7 200 s `constant-iso` is a longer *slice*, it truncates its tail exactly
 * as a shorter one does, and giving it a day's allowance would be interpolating a mechanism that is
 * not about length.
 *
 * **What it is for is invariance, not generosity.** § D345 forbids a difficulty setting from moving
 * the bar a run is judged against, and `docs/33` § 1.4's third reason says freezing a bar across a
 * change is *"a silent difficulty change in both directions"*. Leaving the ceiling at 230 s while
 * the horizon grew twentyfold is exactly that, in the harder direction, chosen by nobody: measured
 * with the ceiling fixed, Secure Tower's day 1 goes from **4 of 10 seeds missing something to 9 of
 * 10**, entirely on this bar — outside `docs/33` DC-4's one-third-to-two-thirds band, which 4 of 10
 * sits inside. At `2` the bar misses on the whole day exactly what it missed on the slice, on all
 * four cells, which is the property `goals.test.ts` pins.
 *
 * **Recorded here rather than in `DECISIONS.md`, under § D405.** The factor is local to this
 * module and pinned by `goals.test.ts` on all four cells; it *complies* with § D345 rather than
 * moving it — the bar tracks the horizon, and no difficulty setting touches either.
 */
const WORST_WAIT_WHOLE_DAY_FACTOR = 2;

/**
 * The energy ceiling, in kilojoules of out-of-balance mechanical work per leg the fleet delivered,
 * and the one bar that is **not** on a ladder ([§ D367](../../../../DECISIONS.md),
 * [§ D468](../../../../DECISIONS.md), GitHub issue #275).
 *
 * ## Why an energy bar exists at all, and what it is not
 *
 * § D106 rule 2 forbids **folding** energy into a figure that also carries wait. `nearest-car` is on
 * the Pareto front at six of eight matrix cells purely by being worst on wait, so a combined score
 * would rank the weakest shipped dispatcher first. This bar folds nothing: it is one goal, read
 * alone, met or missed on its own, with no weight against any other and no combined number
 * anywhere. `campaign/judge.ts`'s refusal to order two arms on energy is untouched, and raw
 * `workKJ` stays ungraded: the ratio is graded and the total is not, because the legs delivered
 * are the ratio's denominator and a day that saves work by carrying fewer people fails the bar
 * rather than winning it.
 *
 * ## The number is derived and here is the run
 *
 * `shiftRunConfigOf` at seeds `20 260 824 + 7 919 n`, `n = 0…49`, day 1, the shipped default
 * dispatcher (`collective`), each contract at its own shift length, ordinary day with no event,
 * folded through `observationsAt(recording, recording.endedAt)`. **Eight contracts × 50 seeds =
 * 400 runs**; every one of them recorded travel, so no cell is ungraded for want of a measurement.
 * Medians of `workPerServedLegKJ`, kJ:
 *
 * | contract | building | median | seeds over 80 kJ |
 * |---|---|---|---|
 * | c1 | Garden Apartments | 25.6 | 0/50 |
 * | c2 | Midtown Office | 10.4 | 0/50 |
 * | c3 | Secure Tower | 60.1 | 2/50 |
 * | c4 | Mixed-use High-rise | 131.8 | 50/50 |
 * | c5 | Vertical City | 82.8 | 33/50 |
 * | c6 | Chancery House | 57.4 | 4/50 |
 * | c7 | Crown Hotel | 43.3 | 4/50 |
 * | c8 | St Jude Hospital | 95.1 | 35/50 |
 *
 * Pooled over the 400, the two-thirds point is **78.30 kJ**, the value at which exactly one day in
 * three across the shipped catalogue misses the bar, which is `docs/33` DC-4's own lower edge read
 * over one goal instead of over a day. A second, independent constraint brackets it from below:
 * below about 70 kJ the pooled day-1 miss rate over all five goals leaves DC-4's band at the top
 * (73.2 % at 60 kJ), so a tighter bar makes day one unpassable rather than difficult.
 *
 * **80 rather than 78.3, and the arithmetic is the reason.** At `n = 400` the standard error on a
 * one-third proportion is 2.4 points; moving the bar from 78.30 to 80 moves the proportion from
 * 33.3 % to 32.0 %, which is half of one standard error. A decimal here would claim a precision
 * 400 runs do not support, exactly as {@link WORST_WAIT_WHOLE_DAY_FACTOR}'s `2` refuses a third
 * decimal four buildings do not support.
 *
 * ## It is a constant, and that is measured rather than lazy
 *
 * The other four bars harden nightly. This one does not, because the quantity itself falls steeply
 * as the building grows and no single ladder tracks the fall. Same instrument, days 1, 5, 10 and 20
 * at 50 seeds, median `workPerServedLegKJ`:
 *
 * | contract | day 1 | day 5 | day 10 | day 20 |
 * |---|---|---|---|---|
 * | c1 Garden Apartments | 25.6 | 22.1 | 19.4 | 16.2 |
 * | c8 St Jude Hospital | 95.1 | 19.5 | 12.2 | 6.1 |
 *
 * More people share the same car travel, so the work per delivered leg drops, by a factor of 1.6
 * over nineteen days on one contract and **15.6** on the other. A ladder fitted to either would be
 * wrong about the other by an order of magnitude, and a ladder that hardened would tighten a bar
 * the growth mechanism is already loosening far faster. So the bar holds still and the goal binds
 * hardest on day one, which is the opposite shape from the other four. That is a finding rather
 * than a design, and § D468 records it as one.
 *
 * ## What this bar does not do, stated so it is not over-read
 *
 * It does not discriminate between seeds on three of the eight contracts **the 2026-09-04 cell
 * measured**: c1 and c2 never miss it and c4 always does. The other five sit between 2 and 35 of 50.
 * *(Eight, not ten: `c9` and `c10` landed on 2026-09-14 with GitHub issues #500 and #501 and are
 * **unmeasured on this bar**. The figures above are a dated record of that run rather than a claim
 * about today's catalogue, and re-deriving them is whoever next runs § 4.6's cell — the 80 kJ bar
 * itself is not moved by a building being added, because it is pooled across contracts and § D468
 * pins it to the run that set it.)* The figure is dominated by how far cars have to travel, which is fabric, so
 * on the shipped catalogue this is closer to a per-building test than a per-day one. That is
 * `docs/33` § 7's **O2**, whether a bar should move with the building rather than with the day,
 * arriving on a fifth goal, and it is reported rather than fixed here, because fixing it means
 * authoring a bar per contract and § 1.4 refused that for the wait bars on grounds this lane may
 * not overturn on its own.
 */
const ENERGY_PER_LEG_MAX_KJ = 80;

/**
 * The energy bar a **whole authored day** is graded against — GitHub issue #583,
 * [§ D962](../../../../DECISIONS.md).
 *
 * ## Why there are two of these and not one
 *
 * {@link ENERGY_PER_LEG_MAX_KJ} is 80 and § D468 derived it honestly, over eight contracts × 50
 * seeds at each contract's own `shiftLengthForContract`. Its own *What the bar is true of* section
 * names the mechanism that has since made it stale and stops one step short of the consequence:
 * `VizSummary.energy` is computed over the run's **reporting window**, and on seven of the eight
 * contracts it measured that window is `peak-5min` — three hundred seconds of an 1 800 s run.
 *
 * `shift/dayLength.ts#wholeDayRun` writes `windowStartS: 0` and the record's own period, so a whole
 * authored day's reporting window **is the whole day**. The same building, the same dispatcher and
 * the same seed therefore produce two figures a factor of four apart, and one constant was grading
 * both. Measured on the shipped path, `collective`, day 1, seed 20 260 824:
 *
 * | contract | run | reporting window | delivered legs | kJ per delivered leg |
 * |---|---|---|---|---|
 * | c2 `midtown-office` | the slice, 1 800 s | `peak-5min`, 750 → 1 050 s | 100 | **35.6** |
 * | c2 `midtown-office` | the authored day, 36 000 s | `report-window`, 0 → 36 000 s | 2 857 | **149.2** |
 * | c5 `vertical-city` | the slice, 1 800 s | `peak-5min`, 750 → 1 050 s | 905 | **86.8** |
 * | c5 `vertical-city` | the authored day, 36 000 s | `report-window`, 0 → 36 000 s | 32 588 | **292.0** |
 *
 * **The two ratios are 4.19 and 3.36, which is why this is a second derivation rather than a factor
 * on the first.** {@link WORST_WAIT_WHOLE_DAY_FACTOR} is a step of `2` because four buildings
 * measured 1.84 to 2.07 — a spread of 12 % — and a step is honest there. These two differ by 25 %,
 * and a step fitted to them would claim a precision the measurement refuses.
 *
 * ## The cell, derived rather than listed
 *
 * `shift/energyBar.sweep.test.ts`, gated on `ENERGY_BAR_SWEEP=1`: **every contract that can run a
 * whole authored day**, which `shift/dayLength.ts#wholeDayFor` answers from the building's own
 * traffic profile — **thirteen of sixteen**, the three residential, hotel and hospital crowds
 * excepted. Derived over `CONTRACTS` rather than from a list of tower names, because a list is what
 * made the briefing that raised this issue say *five*.
 *
 * Day 1, `collective`, ordinary, seeds `20 260 824 + 7 919 n` — § D468's cell with the horizon
 * moved and one defect repaired: every state carries a consistent `(buildingId, contractId)` pair,
 * so each tower runs **as its contract hands it over** rather than as built (GitHub issue #584,
 * [§ D961](../../../../DECISIONS.md)). **25 seeds a contract, 325 runs**, equal weight.
 *
 * **Twenty-five rather than § D468's fifty, and the reduction is measured rather than asserted.**
 * On the six contracts where both budgets were run, the pooled two-thirds point is **identical from
 * n = 15 to n = 50** — 174.00 at 15, 20, 25, 30, 40 and 50, and 167.40 only at 10. The per-contract
 * distributions are tight (p10 to p90 within ±5 % of the median on every one of the thirteen), so
 * the pooled quantile is decided by *which contract's cluster it lands in* rather than by any
 * contract's spread, and a per-contract budget above about fifteen cannot move it. A whole authored
 * day is roughly ten times the legs of the slice § D468 measured, and 30 000 to 68 000 legs a run
 * on the six reference towers; fifty seeds a contract is a measurement nobody would re-run.
 *
 * ## The distribution, and the two constraints
 *
 * | contract | building | median kJ | p10 | p90 | four-goal miss |
 * |---|---|---|---|---|---|
 * | c2 | `midtown-office` | 150.5 | 146.8 | 155.9 | 12/25 |
 * | c3 | `secure-tower` | 231.2 | 225.4 | 235.8 | 10/25 |
 * | c4 | `mixed-use-high-rise` | 328.3 | 320.1 | 333.9 | 22/25 |
 * | c5 | `vertical-city` | 294.7 | 291.5 | 298.0 | 25/25 |
 * | c6 | `chancery-house` | 166.3 | 163.6 | 171.7 | 10/25 |
 * | c9 | `harbour-point` | 99.4 | 97.0 | 102.7 | 9/25 |
 * | c10 | `ashgate` | 97.6 | 94.2 | 100.7 | 14/25 |
 * | c11 | `ctf-class-reference` | 415.5 | 403.5 | 423.4 | 25/25 |
 * | c12 | `shanghai-class-reference` | 352.3 | 348.3 | 355.4 | 25/25 |
 * | c13 | `merdeka-class-reference` | 576.6 | 571.1 | 584.2 | 25/25 |
 * | c14 | `one-wtc-class-reference` | 611.1 | 603.8 | 619.2 | 25/25 |
 * | c15 | `empire-state-class-reference` | 382.3 | 378.5 | 384.7 | 25/25 |
 * | c16 | `willis-class-reference` | 284.6 | 282.7 | 287.2 | 25/25 |
 *
 * **Constraint 1, § D468's own: the pooled two-thirds point is 353.80 kJ**, the value at which one
 * day in three across the catalogue misses the bar.
 *
 * **Constraint 2, § D468's lower bracket, is not satisfiable at this horizon, and that is a finding
 * rather than a licence.** It asks that the pooled five-goal miss rate stay inside `docs/33` DC-4's
 * band. At the whole-day horizon the **other four goals already miss 252 of 325 = 77.5 %** on their
 * own, above DC-4's 66.7 % top, so no energy bar — not one at infinity — can bring the day inside
 * the band. Decomposed, it is not evenly spread: the seven game contracts miss **102 of 175 =
 * 58.3 %**, inside the band, and the six reference towers miss **150 of 150**. So the constraint
 * fails on the towers `docs/33` § 4.7k and § 4.7l already record as tied at a 1.00 miss rate, at a
 * horizon nobody re-measured them over. **It is #234's and `docs/33` O2's, not this bar's**, and
 * moving this bar to answer it would be buying difficulty by moving the mark.
 *
 * ## 350 rather than 353.80, and it is deliberately the tighter rounding
 *
 * At `n = 325` the standard error on a one-third proportion is **2.6 points**. **350** refuses 117
 * of 325 (**36.0 %**) against the two-thirds point's 33.2 % — 2.8 points, about one standard error,
 * and inside the 95 % interval on a one-third proportion (±5.1 points). A decimal would claim a
 * precision 325 runs do not support, which is {@link ENERGY_PER_LEG_MAX_KJ}'s own refusal.
 *
 * **The better-conditioned figure is 360 and it is not taken.** The two-thirds point falls *inside*
 * `shanghai-class-reference`'s own cluster (344.5 to 357.2 over its 25 runs), so the refused
 * proportion swings 37.8 % → 30.8 % across ten kilojoules there, all of it that one contract
 * crossing. Above 358 the proportion is **invariant at 30.8 % all the way to 377**, the gap before
 * Empire-State-class begins. A bar in that gap would be stable where 350 is steep — and it is also
 * the **looser** of the two. Where stability and strictness disagree the strict figure is taken,
 * because `CLAUDE.md`'s working agreements forbid moving a bar in the direction that makes content
 * pass. The cost is named rather than hidden: **a re-derivation after `shanghai-class-reference`'s
 * fabric moves will move this proportion more than the others**, and 17 of that contract's 25 runs
 * sit above 350.
 *
 * ## § D106's check, re-run at this bar and on this horizon
 *
 * § D106's measured objection is that `nearest-car` is on the Pareto front by being worst on wait,
 * so a grade that folded energy in would rank the weakest dispatcher first. § D468 measured the
 * answer at 1 800 s; it is measured again here, at 36 000 s, over **all thirteen shipped
 * dispatchers × 25 seeds** on two contracts — `midtown-office`, the flagship day, and
 * `mixed-use-high-rise`, where this bar binds.
 *
 * | | `nearest-car` median | rank on energy | clean days | best arm |
 * |---|---|---|---|---|
 * | c2 `midtown-office` | **81.2 kJ** | **lowest of thirteen** | **0/25** | `fairness-first` and `predictive-balanced`, 22/25 |
 * | c4 `mixed-use-high-rise` | **216.4 kJ** | **lowest of thirteen** | **0/25** | `eta`, `fairness-first`, `capacity-aware` and `collective`, 3/25 |
 *
 * **`nearest-car` wins the energy figure at both and is strictly the worst arm at both.** So the
 * perverse ranking is not reachable through this bar at the horizon it now grades, and that is a
 * measurement rather than an inference from the arithmetic. **Two cells, not thirteen**: the other
 * eleven contracts are unmeasured on the dispatcher axis and nothing is claimed about them.
 *
 * **And the bar is not inert.** At c4 it binds on two arms — `zoned-uppeak` goes from 3 clean days
 * to 0 and `predictive-balanced` from 1 to 0 — and the best-to-worst median span is ×2.12 at c2 and
 * ×1.89 at c4, so a player moving the dispatcher moves this goal.
 *
 * ## What the shipped bar was doing to the flagship day
 *
 * Measured on the same two cells at **80 kJ**: clean days summed over all thirteen arms are
 * **0 of 325** at `midtown-office` and **0 of 325** at `mixed-use-high-rise`. At 350 they are
 * **209 of 325** and **19 of 325**. That is GitHub issue #578's *"13 of 13 dispatchers miss"*
 * reproduced, and it is the energy half of it closing: the day goes from undecidable to decided by
 * the dispatcher, with the arm that drives least at the bottom.
 *
 * ## It is keyed on the horizon and never on a number of seconds
 *
 * {@link WORST_WAIT_WHOLE_DAY_FACTOR}'s rule exactly, and for its reason: a 7 200 s `constant-iso`
 * is a longer *slice*, whose reporting window is still the template's band, so the period bar is
 * the right one for it. `shift/dayLength.ts#runHorizonOf` is the one expression that answers *which
 * of the two kinds of run is this*, and {@link goalsForDay} asks it once.
 *
 * ## The period bar is untouched, which is the whole of what this does not move
 *
 * Every figure this repository has published at a contract's own shift length is measured on a
 * period run and is graded by 80 exactly as before — `docs/33` § 4.2, § 4.6's four hundred runs,
 * § 4.7's whole table, and `shift/contracts.ts`'s eight-contract tie at 1.00. None of them is
 * re-derived here.
 *
 * The derivation, the cell it was taken on, the two constraints that bracket it and § D106's
 * re-run check are `docs/33` § 4.6b and § D962.
 */
const ENERGY_PER_LEG_MAX_WHOLE_DAY_KJ = 350;

/**
 * The design's own hardening arithmetic (`design.html` :1428–1439), plus the worst-wait ceiling
 * the casual handoff's fourth test needs (`GAMEPLAY_AND_NAVIGATION.md` § 8.6, § 20.6).
 *
 * Four ceilings and a floor, and each cap is what stops the week becoming unwinnable: the
 * away-inside-a-minute bar tops out at 84 %, the carried bar at 96 %, the queue depth bottoms out
 * at 12, and the worst-wait ceiling bottoms out at 150 s. A bar that kept hardening would
 * eventually ask for a building that cannot exist, and the design's framing — *"No losing — just
 * a line you are trying to bend upward"* — would stop being true.
 *
 * The worst-wait numbers are bracketed by the handoff's own difficulty table rather than
 * invented: § 8.6 asks 240 s of Easy, 180 s of Standard, 150 s of Hard and 120 s of the tier it
 * names *Impossible*. So the week opens just under Easy (240 − 10 = 230 s on day 1), hardens by
 * 10 s a day in the pattern the other three bars established, and stops at Hard's 150 s —
 * deliberately short of the Impossible tier, because a floor is the promise that the line stays
 * bendable and a tier named Impossible is the wrong promise to converge on.
 */
export const GOAL_BARS = Object.freeze({
  minuteMax: 84,
  minuteBase: 58,
  minutePerDay: 3,
  carryMax: 96,
  carryBase: 86,
  carryPerDay: 1,
  queueMin: 12,
  queueBase: 34,
  queuePerDay: 2,
  worstMinS: 150,
  worstBaseS: 240,
  worstPerDayS: 10,
  worstWholeDayFactor: WORST_WAIT_WHOLE_DAY_FACTOR,
  // One value and no ladder; see `ENERGY_PER_LEG_MAX_KJ`. There is deliberately no `energyBase`
  // and no `energyPerDay` beside it: a key that existed and was always zero would read as a ladder
  // somebody forgot to author rather than as one the measurement refused.
  energyPerLegMaxKJ: ENERGY_PER_LEG_MAX_KJ,
  // The same bar over the other horizon, never a ladder either; see
  // `ENERGY_PER_LEG_MAX_WHOLE_DAY_KJ` for why it is a second derivation and not a factor.
  energyPerLegMaxWholeDayKJ: ENERGY_PER_LEG_MAX_WHOLE_DAY_KJ,
});

/**
 * **The one heading over {@link goalsForDay}'s bars, and the one sentence saying what they decide**
 * — GitHub issue **#567**, recorded here under [§ D405](../../../../DECISIONS.md).
 *
 * ## Why a constant, and why it lives beside the goals rather than on a screen
 *
 * The phrase was authored three times — `everyday/briefView.ts`, `everyday/stageScreenModel.ts` and
 * a third copy in `everyday/campaignModel.ts` that **no screen read at all** — and
 * `stageScreenModel.ts` said so in a docstring and left it for the next lane. A heading over a goal
 * set belongs with the goal set: a sixth bar and a reworded heading then move on one commit, and a
 * screen cannot head these bars with a synonym without importing one.
 *
 * ## The half that is not a tidy-up
 *
 * A career player meets **two** goal sets one click apart. These five are one of them. The other is
 * `everyday/campaignModel.ts#campaignTestGoals` — the contract's four tests at the tower's own
 * difficulty — and it is headed by {@link CONTRACT_ASKS_HEADING} there. The issue's premise was that
 * only these are graded; that is **not** what the code does, and the distinction is the fix:
 *
 * | | these five | the contract's four |
 * |---|---|---|
 * | authored by | `GOAL_BARS`, a ladder that hardens with the week's day | `campaign/economy.ts#DIFFICULTIES`, fixed per tier |
 * | decides | the day report's verdict, the streak, and whether a clean day is banked (`shift/week.ts#outcomeOf`) | whether the career day is filed **cleared** or **missed** against the contract (`everyday/host.ts`'s `closeDay` → `campaignDayVerdict`) |
 * | where the player meets it | the brief, the stage strip, the report | the building desk and the contract sheet |
 *
 * Neither is decoration and neither can be deleted without losing a grading rule, so both stay and
 * each says what it decides. {@link TODAY_ASKS_DECIDES} is this set's sentence.
 *
 * **No bar moved for this.** Reconciling the two sets by choosing numbers would need a derivation
 * pinned to a run, the way {@link ENERGY_PER_LEG_MAX_KJ} is pinned; picking a number to make two
 * headings agree is what `CLAUDE.md` refuses, and weakening either set to make them agree is what
 * the working agreements refuse.
 */
export const TODAY_ASKS_HEADING = 'WHAT TODAY ASKS';

/**
 * What {@link TODAY_ASKS_HEADING}'s bars decide, in the player's words.
 *
 * Drawn where a player is reading these five with the contract's four one click away — today that
 * is the § 7 stage inside a career run (`everyday/stageScreenModel.ts`). It names the other set
 * rather than only disclaiming this one, because a sentence saying *these are not the ones* with
 * nowhere to go reads as a broken screen; `everyday/campaignModel.ts#CONTRACT_ASKS_DECIDES` is its
 * mirror and the pair is asserted against the two goal sets in `everyday/goalSets.test.ts`.
 */
export const TODAY_ASKS_DECIDES =
  'These five are the week’s, and they decide the report and your streak. What files this day for ' +
  'the contract is the four on the building desk, under WHAT THE CONTRACT ASKS.';

/**
 * Today's goals: the handoff's four tests every day, in tension (§ 8.6), plus the energy bar.
 *
 * ## The fifth goal, and why it is not the thing § D106 forbids
 *
 * § D367 rules that a single, independent, unweighted energy bar is **not an aggregation**: it adds
 * no term to any other goal, produces no combined number, and orders no two arms. It is specified
 * against the work per **delivered leg** rather than the raw work, because the legs are the
 * denominator and a day that spends less by carrying fewer people therefore fails it. The bar, the
 * run that derived it and the reason it does not harden are all on
 * {@link ENERGY_PER_LEG_MAX_KJ}; what a reader most needs to know here is that it is read alone.
 *
 * **It is the one goal that can be `pending` on a completed day**, and that is deliberate rather
 * than a gap: the figure is a window statistic `core` computes once, so
 * `live/observations.ts#energyPerServedLegAt` withholds it at every playhead short of the run's end
 * and on any run that recorded no travel. Unjudged is not passed, so a day whose energy reading is
 * `pending` is not a clean day. That is `week.ts#outcomeOf`'s rule, unchanged.
 *
 * ## The `day % 2` alternation is retired, and here is the argument
 *
 * This function used to return three goals: carry, minute, and a third that alternated — even
 * days a queue-depth ceiling, odd days *nobody waits past the 15-minute horizon* (`abandoned`,
 * bar 0). The alternation's stated reason was that *"three inverted bars on a bad day is a wall
 * rather than a brief"*, and that reason still binds: this set has exactly two inverted bars, not
 * three, so retiring the alternation does not rebuild the wall.
 *
 * What retired it is the worst-wait ceiling subsuming the horizon goal outright. Every shipped
 * worst-wait bar is 150–230 s and the abandonment horizon is 900 s, so on any graded day the
 * ceiling is the stricter test of the same tail: a day that keeps its worst wait under 230 s
 * abandoned nobody by construction, and a day that abandoned anybody has a worst wait past 900 s
 * and misses the ceiling. Alternating the two would therefore alternate a strong test with a
 * test it implies — the week's difficulty would see-saw by parity while claiming to harden — and
 * § 20.6's own check (*a day that peaks the lobby at 26 against a cap of 25 is missed*) fails on
 * every day the queue goal sat out. Four tests, each load-bearing, every day, is what § 8.6
 * specifies; the odd-day goal survives where it belongs, as the report's *took the stairs*
 * figure and the add-a-car lever, both of which still read `Observations.abandoned`. The energy
 * bar is a fifth test on top of those four and does not disturb the argument: it is not an
 * alternation, and it is not an inverted bar the other four already supply two of.
 *
 * (`GOAL_OBSERVATION_IDS` keeps `'abandoned'` so restored histories that carry the retired
 * goal's readings stay restorable — see its docstring.)
 *
 * **Recorded here rather than in `DECISIONS.md`, under § D405.** The retirement is local to this
 * module's goal set: the ceiling subsumes the horizon goal outright, so the alternation would
 * have alternated a strong test with a test it implies. `GOAL_OBSERVATION_IDS` keeps
 * `'abandoned'` so restored histories stay restorable, and the reading survives where it belongs.
 *
 * ## The second argument, and why it is not a difficulty setting
 *
 * `over` says **what kind of run today is** — a period, or a whole authored day
 * (`shift/dayLength.ts`). It exists because § AB gave the Everyday daily loop the ten-hour
 * `office-day` in place of a thirty-minute `rise-and-fall`, and *a goal measured over thirty
 * minutes is not a goal over ten hours.* Exactly one bar moves and
 * {@link WORST_WAIT_WHOLE_DAY_FACTOR} carries the measurement, the mechanism and the refutation of
 * the other three.
 *
 * It is **not** the thing § D345 forbids. Every player on a whole day meets the same bar and every
 * player on a slice meets the same bar; what differs is the run, not the person. `docs/33` § 4.4's
 * W4 says the distinction outright — *"changing what day 5 asks of everybody is a design change to
 * the curve; changing what day 5 asks of an Easy player specifically is the thing § D345 forbids"*.
 * This is the first kind, and holding the ceiling still across a twentyfold change of horizon would
 * have been the second kind arriving by accident.
 *
 * **`'period'` is the default and that is a decision rather than a convenience.** Three of the
 * **fourteen** shipped buildings have no authored day and never will until one is written for their
 * crowd, so a slice is the majority case, and every published figure in this repository was graded
 * as one. *(The numerator has not moved and the denominator has three times: this read **eight**
 * while nine shipped, `harbour-point` and `ashgate` took it to eleven, and the three reference
 * towers of GitHub issues #424, #425 and #430 took it to fourteen. All five declare
 * `office-standard`, which `office-day` matches, so none of them added to the three.
 * `RISKS.md` R38 on a count in prose.)*
 *
 * **The named gap the default was covering is closed, and what it cost is worth recording.** This
 * paragraph used to end by saying `dev/leftRail.ts` and `dev/main.ts` were *"not yet horizon-aware,
 * and that is a named gap rather than a silent one"*. A named gap is still a gap: while it stood,
 * an Everyday player running the whole authored day was told by the Everyday rail that today asked
 * for a worst wait inside **460 s** and by the Engineer rail — the same run, one door away — that
 * it asked for **230 s**, which is the disagreement `TEST_MATRIX.md` T1 forbids outright. Both
 * shells now derive the argument from `shift/dayLength.ts#runHorizonOf`, which is one expression in
 * a directory both of them import, and `everyday/host.test.ts` drives the two call paths against
 * each other rather than against two literals.
 *
 * **The default stays, and stays optional, and `honesty/surfaces.ts` is right to call this bare.**
 * Its corpus sweeps periods and nothing else: both spaces bound a case at `maxDurationS` — 900 s
 * always-on, 1 800 s deep — and `honesty/surfaces.ts#planFor` writes `windowStartS: null`, so no
 * case in either tier is a whole authored day. Passing `'whole-day'` there would have the honesty
 * tier publish a 460 s ceiling over a 900 s run, which is the tier manufacturing the disagreement it
 * exists to find. What the default may never again mean is *a product surface has not been told*.
 *
 * Pure in its arguments, so the same day of the same week over the same kind of run always asks the
 * same thing.
 */
export function goalsForDay(
  day: number,
  over: RunHorizon = 'period',
): readonly ShiftGoal[] {
  const minuteBar = Math.min(
    GOAL_BARS.minuteMax,
    GOAL_BARS.minuteBase + day * GOAL_BARS.minutePerDay,
  );
  const carryBar = Math.min(GOAL_BARS.carryMax, GOAL_BARS.carryBase + day * GOAL_BARS.carryPerDay);
  const queueBar = Math.max(GOAL_BARS.queueMin, GOAL_BARS.queueBase - day * GOAL_BARS.queuePerDay);
  /*
   * The ladder first, the horizon second — so the day still hardens by 10 s and still floors, and
   * the allowance scales the bar the ladder arrived at rather than replacing it. The other order
   * would floor a whole day at 150 s and hand back the difficulty change this argument exists to
   * prevent.
   */
  const worstBar =
    Math.max(GOAL_BARS.worstMinS, GOAL_BARS.worstBaseS - day * GOAL_BARS.worstPerDayS) *
    (over === 'whole-day' ? GOAL_BARS.worstWholeDayFactor : 1);

  const carry: ShiftGoal = {
    id: 'carry',
    label: `Carry ${String(carryBar)}% of the people who turn up`,
    unit: '%',
    bar: carryBar,
    compare: 'at-least',
    reads: 'carryPct',
  };
  const minute: ShiftGoal = {
    id: 'minute',
    label: `Get ${String(minuteBar)}% of riders away inside a minute`,
    unit: '%',
    bar: minuteBar,
    compare: 'at-least',
    reads: 'minutePct',
  };
  /*
   * *A landing*, deliberately, where the handoff's test 3 says *the lobby* — and the sentence
   * says what the code does (§ D227), so the word "lobby" may not appear here while `peakQueue`
   * is a maximum over **every** landing. Any-landing is kept rather than narrowed, for three
   * reasons stated so they can be attacked. It is strictly the harder test: the lobby's peak is
   * one term of the maximum, so § 20.6's check — a lobby that peaks at 26 against a cap of 25 —
   * misses under this goal a fortiori. It matches what the reader is shown: the alarm chip and
   * the report's DEEPEST QUEUE name whichever floor stacked worst (`peakQueueFloorId` is carried
   * for exactly that), and a goal that graded only the ground floor while the chip pointed at
   * Level 12 would be two screens disagreeing about what the day was asked. And a lobby-only
   * goal would let every upper landing stack unbounded without a miss — on the shipped mixed-use
   * and residential buildings the pressure floor routinely is not the lobby, so the narrowing
   * would un-grade the very failure the test exists to catch.
   */
  const queue: ShiftGoal = {
    id: 'queue',
    label: `Never let a landing stack past ${String(queueBar)} people`,
    unit: '',
    bar: queueBar,
    compare: 'at-most',
    reads: 'peakQueue',
  };
  // *Inside*, not *under*: `at-most` meets the bar at the bar, and a label that said "under
  // 230 s" about a day whose worst wait was exactly 230 s would claim a strictness the
  // comparison does not have — § D227's rule at the scale of one preposition.
  //
  // *Across the whole shift* is on the label because the sheet carries a second worst wait —
  // the WORST WAIT cell, `summary.serviceLevel.longestWaitS`, which is the reporting window's
  // and legitimately larger or smaller on the same day. Two figures called "worst wait" four
  // inches apart, reconciled only in the small print, is `docs/19` defect 3's second half; each
  // now names its window where it stands (the cell's note carries the other label).
  const worst: ShiftGoal = {
    id: 'worst-wait',
    label: `Keep the worst wait inside ${String(worstBar)} s across the whole shift`,
    unit: ' s',
    bar: worstBar,
    compare: 'at-most',
    reads: 'worstWaitS',
  };

  /*
   * The fifth bar, and the only one that reads something other than a count, a share or a
   * maximum. See § D367 and § D468, GitHub issue #275.
   *
   * *Per ride delivered*, in the label, is load-bearing rather than decorative (§ D227 at the scale
   * of one phrase). The graded quantity is the ratio and never `workKJ`, and the phrase is where a
   * player meets the reason: the rides are the denominator, so a day that spends less by carrying
   * fewer people moves the number the wrong way. A label reading *"keep the work inside 80 kJ"*
   * would describe a bar this product refuses to have.
   *
   * *Inside*, not *under*, for `worst-wait`'s reason four lines above: `at-most` meets the bar **at**
   * the bar, and a label promising *under 80 kJ* about a day that spent exactly 80 would claim a
   * strictness the comparison does not have. § D227 at the scale of one preposition, twice.
   *
   * **The bar is not a rung of a ladder on either horizon** — it is the same value on day 1 and day
   * 20 — but since GitHub issue #583 there are **two** of it, one per horizon (§ D962). Each
   * constant carries the run it was derived from and the measurements that fix it:
   * `ENERGY_PER_LEG_MAX_KJ` for a slice and `ENERGY_PER_LEG_MAX_WHOLE_DAY_KJ` for a whole authored
   * day. The label above is written against the bar this call selected rather than against either
   * constant, so the two cannot come apart.
   *
   * The bar is chosen by the **horizon** and never by the day, which is the one place this goal
   * reads its second argument. `worst-wait` above scales its ladder by a measured factor; this one
   * selects between two measured constants, because the ratio between the two horizons is not one
   * number — 4.19 on Midtown Office and 3.36 on Vertical City.
   */
  const energyBar =
    over === 'whole-day' ? GOAL_BARS.energyPerLegMaxWholeDayKJ : GOAL_BARS.energyPerLegMaxKJ;
  const energy: ShiftGoal = {
    id: 'energy',
    label: `Keep the work inside ${String(energyBar)} kJ per ride delivered`,
    unit: ' kJ',
    bar: energyBar,
    compare: 'at-most',
    reads: 'workPerServedLegKJ',
  };

  return Object.freeze([carry, minute, queue, worst, energy]);
}

/**
 * The ids {@link goalsForDay} writes, in its order. `ShiftGoal.id` stays a `string` because a
 * restored session's goals come back through `persist/validate.ts` as whatever was saved, so this
 * union is the set the **shipped** producer writes rather than a narrowing of the persisted type.
 */
export const SHIFT_GOAL_IDS = Object.freeze([
  'carry',
  'minute',
  'queue',
  'worst-wait',
  'energy',
] as const);

/** One of {@link SHIFT_GOAL_IDS}. */
export type ShiftGoalId = (typeof SHIFT_GOAL_IDS)[number];

/**
 * **A goal's name with no bar in it** — [§ D982](../../../../DECISIONS.md), the table the day
 * report's after-press row names a missed goal from.
 *
 * ## Why not the label
 *
 * A label carries its bar — *Keep the worst wait inside 230 s across the whole shift* — and the
 * row that names these (`shift/afterPress.ts`) has a rule that every digit on it is a count of
 * people with its cohort attached (§ D931 rule 4). A bar in seconds or kilojoules would be the
 * first figure there that is not a headcount, and the label of the **other** run's goal would be a
 * second copy of the same bar four inches under the goal table that already prints it. So the row
 * names the goal and the table carries its value — one source for the number.
 *
 * *The energy goal* rather than anything that says *per ride*: that phrase is already an estimate
 * cue on the row (`counterfactual.test.ts`), and a goal's name does not need its denominator to be
 * recognised beside a table that prints it in full.
 *
 * `Record` over {@link ShiftGoalId}, so a sixth goal is a compile error here rather than a row
 * that names it with the fallback in {@link goalPlainNameOf}.
 */
export const GOAL_PLAIN_NAMES: Readonly<Record<ShiftGoalId, string>> = Object.freeze({
  carry: 'the carry goal',
  minute: 'the inside-a-minute goal',
  queue: 'the landing-queue goal',
  'worst-wait': 'the worst-wait goal',
  energy: 'the energy goal',
});

function isShiftGoalId(id: string): id is ShiftGoalId {
  return (SHIFT_GOAL_IDS as readonly string[]).includes(id);
}

/**
 * {@link GOAL_PLAIN_NAMES} for a goal, or a name that claims nothing about which goal it was when
 * the id is not one this build writes (a goal restored from a session saved by another build). The
 * fallback names no goal rather than inventing one, and carries no digit either.
 */
export function goalPlainNameOf(goal: ShiftGoal): string {
  return isShiftGoalId(goal.id) ? GOAL_PLAIN_NAMES[goal.id] : 'one of the day’s goals';
}

/* -------------------------------------------------------------------------- *
 * Reading one
 * -------------------------------------------------------------------------- */

/** The em dash the design prints for an ungraded goal (`design.html` :2383). */
export const PENDING_DISPLAY = '—';

/**
 * The glyphs. `✓` and `·` match `design.html` :2383–2391; the missed mark is the casual
 * handoff's `×` (§ 8.3, § 8.6, § 20.6 — *"the calendar draws an ×"*) rather than the older
 * prototype's `○`, because the handoff wins every disagreement about what the screen looks like
 * and it draws missed as a cross everywhere it draws it at all. `○` also collided with three
 * other vocabularies on the same screens — the scenarios panel's *not started*, the building
 * editor's *unzoned* and the mood rows' calm — all of which mean something neutral, which is the
 * one thing a missed day is not.
 *
 * A glyph is never the **only** signal — {@link GoalReading} also carries {@link GoalState}, and
 * the definition of done's clause 8 (KB-15) forbids a colour-only signal. The rail draws the state
 * word beside the glyph; the glyph is the shorthand, not the message.
 */
export const GOAL_GLYPHS: Readonly<Record<GoalState, string>> = Object.freeze({
  met: '✓',
  missed: '×',
  pending: '·',
});

/**
 * Read one goal against one set of observations.
 *
 * Total: every goal gets an answer and nothing throws. The `pending` branch is checked **first**,
 * before the observation is even read, so a quiet morning cannot produce a `met` by arithmetic.
 *
 * ## The second gate: a censored worst wait is not graded, in either direction
 *
 * A goal reading `worstWaitS` while {@link GoalObservations.worstWaitIsCensored} is `pending`,
 * whatever the number says. Half of that is the ordinary censoring argument — the wait belongs to
 * somebody still standing, so it is a lower bound, and a lower bound under the bar cannot prove
 * `met`. The other half is why the *provable-looking* direction is refused too: a bound past the
 * bar looks like a certain `missed`, but the recording carries no `abandonedAt`, so an
 * "unresolved" leg may belong to a rider who walked out long ago and whose true wait was short
 * (`live/types.ts#LiveObservations.worstWaitIsCensored` owns that argument). A bound that might
 * overstate proves nothing, so both directions read `pending` — which `week.ts` already treats
 * correctly: unjudged is not passed, and not failed either.
 *
 * ## The third gate: a figure nobody took is not graded either
 *
 * {@link GoalObservations.loadedDepartures} and {@link GoalObservations.workPerServedLegKJ} are the
 * type's two optional members, and an `undefined` reads `pending` in both directions. Here the
 * asymmetry runs the other way from the censoring gate's: both are `at-most` bars, so a recording
 * with no travel record folded to a zero would grade **met**, a pass awarded for a measurement
 * nobody took. That is the shape `campaign/career.ts`'s own rule refuses (*unjudged is not
 * passed*), and it is why the absent case is a gate rather than a default.
 *
 * The check is written over the *value* rather than over the goal's id, and the second optional
 * observation is what says that was worth doing: `workPerServedLegKJ` inherited this gate whole,
 * including its own extra reason for being absent, a playhead short of the run's end, without a
 * fourth branch here.
 */
export function readGoal(goal: ShiftGoal, observations: GoalObservations): GoalReading {
  if (observations.arrived < WAKE_UP_ARRIVALS) {
    return {
      goal,
      state: 'pending',
      observed: null,
      display: PENDING_DISPLAY,
      progressPct: 0,
      glyph: GOAL_GLYPHS.pending,
    };
  }
  if (goal.reads === 'worstWaitS' && observations.worstWaitIsCensored) {
    return {
      goal,
      state: 'pending',
      observed: null,
      display: PENDING_DISPLAY,
      progressPct: 0,
      glyph: GOAL_GLYPHS.pending,
    };
  }

  const observed = observations[goal.reads];
  if (observed === undefined) {
    return {
      goal,
      state: 'pending',
      observed: null,
      display: PENDING_DISPLAY,
      progressPct: 0,
      glyph: GOAL_GLYPHS.pending,
    };
  }
  const met = goal.compare === 'at-most' ? observed <= goal.bar : observed >= goal.bar;
  const state: GoalState = met ? 'met' : 'missed';
  return {
    goal,
    state,
    observed,
    display: `${String(observed)}${goal.unit}`,
    progressPct: progressOf(goal, observed),
    glyph: GOAL_GLYPHS[state],
  };
}

/** Every goal, in order. A convenience, and the shape both the rail and the report want. */
export function readGoals(
  goals: readonly ShiftGoal[],
  observations: GoalObservations,
): readonly GoalReading[] {
  return goals.map((goal) => readGoal(goal, observations));
}

/* -------------------------------------------------------------------------- *
 * The riders who left, beside the wait they flatter
 * -------------------------------------------------------------------------- */

/**
 * Which gradeable quantity a wait that crossed the give-up horizon can move **in the goal's own
 * favour** — [§ D106](../../../../DECISIONS.md)'s rule at the renderer, GitHub issue **#456**.
 *
 * ## The rule, and what it was missing here
 *
 * § D106: *abandonment and stairs uptake are published beside AWT, never folded into it*, on the
 * footing `EnergyStatistics.workPerServedLegKJ` sits beside raw `energyKJ` — *a configuration that
 * improves its wait by serving fewer people has not improved anything*. `core` keeps it: the fifth
 * `awtIsValid` ground suppresses a mean outright above 2 % abandonment. **This layer did not.**
 * {@link readGoal} graded a share whose denominator is the legs that boarded, and a rider left
 * standing leaves that denominator, so the bar could be cleared by making the building worse and
 * the screen that graded it said nothing. `docs/14` § 5 criterion 4 called that out and
 * `docs/14`'s own status table called it *the clause to distrust first*, and that row is rewritten
 * on the commit this lands with ([§ D227](../../../../DECISIONS.md): a refusal leaves on the commit
 * that makes it false).
 *
 * **[§ D207](../../../../DECISIONS.md)'s *Named gap: two viz surfaces do not carry the figures* is
 * where the defect was first written down, and it is left standing rather than edited** — a dated
 * decision is not rewritten after the fact. Two of its clauses have since stopped being true and a
 * reader who lands there should know which. It says this module *"reads
 * `serviceLevel.overHorizonCount`"*: it does not and no longer could — the odd-day horizon goal that
 * did was retired when the worst-wait ceiling subsumed it, and the count a surface publishes now is
 * `live/observations.ts`'s playhead fold. And it says *"no test fails if a renderer shows AWT
 * without the abandonment figure"*: `shift/goalsBeside.test.ts` is that test, and the run-record
 * disclaimer § D207 calls *a bridge, not the coupling* is no longer the only thing holding the rule
 * up.
 *
 * Of the two closures issue #456 names — grade a quantity with the served population in its
 * denominator, or draw the count beside the goal — this is the second, which is what § D106's
 * wording asks for. Nothing is folded, weighted, or aggregated: the count travels beside the
 * verdict and changes no verdict.
 *
 * ## Why a table over `GoalObservationId` rather than a list of goal ids
 *
 * A goal id is a bar; a `reads` is a quantity, and the flattering is a property of the quantity.
 * The campaign's `away` bar and the daily loop's `minute` bar are two goals reading one share, and
 * a list of goal ids would have had to name both and would have missed the third. The `Record` is
 * **exhaustive by the type**: a new member of `GOAL_OBSERVATION_IDS` fails to compile until
 * somebody classifies it, which is the property a hand-written list cannot have.
 *
 * ## Every one of the seven, with its reason — and two of them are `true`
 *
 * | reads | flattered | why |
 * |---|---|---|
 * | `minutePct` | **yes** | `servedUnderThresholdCount / boarded`. A leg that never boards is not in the denominator, so leaving *raises* the share. This is the wait statistic § D106 is about. |
 * | `loadedDepartures` | **yes** | an `at-most` wear budget. A rider who never boards makes no trip, so the count falls and the bar gets easier. |
 * | `carryPct` | no | `carried / arrived`, and `arrived` counts every leg from the instant its call registered. `shift/observations.ts` owns the argument: leaving moves this **down or not at all**. |
 * | `peakQueue` | no | `VizLeg` carries no `abandonedAt`, so a rider whose wait crossed the horizon is still standing in this fold. The depth gets *worse*, never better. |
 * | `worstWaitS` | no | the same fact, pointed the other way: an unresolved leg makes the maximum **censored**, and {@link readGoal}'s second gate reads a censored maximum as `pending`. Unjudged is not passed. |
 * | `abandoned` | no | it *is* the count. A figure cannot be published beside itself. |
 * | `workPerServedLegKJ` | no | § D468 and § D367: the legs delivered are the denominator, so a day that spends less by carrying fewer people **fails** the bar rather than winning it. It is the worked precedent this module is copying. |
 *
 * The two `true` rows are measured rather than argued — `goalsBeside.test.ts` builds one day
 * cleared by carrying people and one cleared by leaving them standing, and requires the two
 * screens to differ.
 *
 * **Recorded here rather than in `DECISIONS.md`, under [§ D405](../../../../DECISIONS.md).** It
 * takes nothing back and moves nothing: § D106's rule is unchanged, § D417's caption rule is
 * obeyed rather than amended, and what changes is that a surface which grades a flattered quantity
 * now draws the count § D106 already required beside it.
 */
const ABANDONMENT_FLATTERS: Readonly<Record<GoalObservationId, boolean>> = Object.freeze({
  carryPct: false,
  minutePct: true,
  peakQueue: false,
  abandoned: false,
  worstWaitS: false,
  loadedDepartures: true,
  workPerServedLegKJ: false,
});

/**
 * `15-minute` for a whole-minute horizon, `900 s` for anything else. The run's own number, never a
 * hard-coded fifteen minutes — [§ D417](../../../../DECISIONS.md).
 *
 * Exported and living here rather than in `shift/report.ts`, where it was written, because
 * `report.ts` imports this module and this module may not import it. Two copies of a caption rule
 * numbered precisely so that a fifth surface obeys it without reading the fourth surface's
 * docstring would be that decision defeated by transcription.
 */
export function horizonLabelOf(horizonS: number): string {
  const minutes = horizonS / 60;
  return Number.isInteger(minutes) ? `${String(minutes)}-minute` : `${horizonS.toFixed(0)} s`;
}

/**
 * The § D106 half of {@link gaveUpBesideOf}'s sentence — what the riders who were left standing did
 * to *this* quantity, in the reader's own terms.
 *
 * Keyed on the same {@link GoalObservationId} and exhaustive for the same reason. The five
 * unflattered quantities carry the empty string, and `goalsBeside.test.ts` drives one goal per id
 * to hold the two tables in step: exactly the ids marked `true` above produce a sentence, and every
 * sentence produced ends in a clause. A quantity that acquired a clause without acquiring a `true`
 * would be a sentence nothing draws.
 */
const DENOMINATOR_CLAUSE: Readonly<Record<GoalObservationId, string>> = Object.freeze({
  carryPct: '',
  minutePct: 'this share is over the rides that boarded',
  peakQueue: '',
  abandoned: '',
  worstWaitS: '',
  loadedDepartures: 'a ride that never boarded made no trip',
  workPerServedLegKJ: '',
});

/**
 * The clause the mid-run sentence carries **instead of** the overlap — [§ D557](../../../../DECISIONS.md).
 *
 * It does the same job § D417 gave the overlap and does it without a count: it tells the reader the
 * riders in front of the horizon are not a fourth disjoint outcome and may still be carried, so the
 * count above may not be subtracted from the people. What it refuses to do is say **how many** of
 * them a car reached, because at a playhead short of `endedAt` that is not a thing that has
 * happened yet.
 *
 * Exported so `goalsBeside.test.ts` pins the withholding against the shipped sentence rather than
 * against a copy of it.
 */
export const OVERLAP_UNSETTLED = 'whether a car eventually came for them is not settled until the day ends';

/**
 * The count of riders who waited past the give-up horizon, phrased to sit **beside** one goal —
 * the empty string on a goal the count cannot flatter, and on a run where nobody did.
 *
 * ## What it says, and why every clause is load-bearing
 *
 * `20 of 340 waited past the 15-minute give-up horizon, none of them carried; this share is over
 * the legs that boarded`.
 *
 * - **The count with its own denominator.** R13's rule — a figure never travels without the
 *   population it was taken over — and {@link GoalObservations.arrived} is that population.
 * - **The overlap, once the day has ended** ([§ D417](../../../../DECISIONS.md),
 *   [§ D557](../../../../DECISIONS.md)). `abandoned` counts *waits that crossed the horizon*,
 *   whether or not a car eventually came; it is an attribute, not a fourth disjoint outcome. On a
 *   no-patience saturated run every one of those legs can still board, so a surface publishing the
 *   bare count invites a reader to subtract it from the people. The three branches are the three
 *   shapes the overlap takes — and they are drawn on `'whole-run'` only. See below.
 * - **The run's own horizon**, from {@link GoalObservations.horizonS}, for the same decision.
 * - **The denominator clause**, which is the § D106 content rather than the § D417 content: it
 *   names *why the count is standing here*. A reader meeting `100 %` beside `20 of 340 waited past
 *   the horizon` can see that the hundred per cent is over the ones who boarded.
 *
 * ## Why `basis`, and why § D417's *always* is narrowed rather than kept
 *
 * R6 / § D223: *an outcome evaluated before the playhead reaches `endedAt` is a preview.* The count
 * and the horizon are **readings** — {@link GoalObservations.abandoned} is a fold at `t` and is
 * non-decreasing in it, so it understates and never lies. The **overlap is an outcome**: *did a car
 * ever come for them* is decided by the end of the day and by nothing earlier, and
 * {@link GoalObservations.abandonedCarried} at a mid-run playhead counts only the ones a car has
 * reached **so far**.
 *
 * Measured rather than argued, on `honesty-9100050` (deep corpus, `midtown-office`, `energy-aware`,
 * 1 440 s of demand ending at 2 941 s): at 1 471 s this sentence read *18 of 653 waited past the
 * 15-minute give-up horizon, **none of them carried***, and at 2 206 s the same sentence about the
 * same day read *195 of 653 … **42 of them carried***. *None of them carried* at half past the day
 * is the strongest possible misreading — it tells a player every one of those riders was lost — and
 * it is § D417's own defect with the polarity reversed: the clause written to stop a reader
 * subtracting the count from the people was, mid-run, producing that subtraction.
 *
 * So on `'now'` the overlap is **withheld and the withholding is said** ({@link OVERLAP_UNSETTLED}),
 * which is § D223's remedy rather than a softer figure. The count, the population and the
 * denominator clause all survive, because none of them is an outcome.
 *
 * **The basis is passed and never sniffed**, which is `dev/leftRail.ts#basisAt`'s recorded rule:
 * *"`live/` answers whichever question it is asked, and which question a finished shift deserves is
 * a presentation call."* `waitBandsAt`, `moodAt` and `honestyAt` all take it for that reason. It is
 * **required** rather than defaulted for the reason those three record against themselves: a
 * default that keeps the reading a caller had is how a whole class of string goes unexamined, and
 * here the wrong default would be the defect this parameter closes.
 *
 * ## What it deliberately does not say
 *
 * It does not say they *gave up and took the stairs* — `docs/19` defect 3, and
 * `report.ts#leversFor` carries the same correction in the same words. On a run that declares no
 * `sim.patience`, and no shipped configuration does, nobody actually left; what is true of all of
 * them is that the wait crossed the line. It also carries no verdict, no tone and no arithmetic
 * against the bar: {@link GoalReading.state} is the verdict and this is an observation beside it.
 *
 * Pure in its three arguments, so the rail, the stage strip, the report sheet and the campaign desk
 * cannot draw four sentences about one run.
 */
export function gaveUpBesideOf(
  goal: ShiftGoal,
  observations: GoalObservations,
  basis: WaitBandBasis,
): string {
  if (!ABANDONMENT_FLATTERS[goal.reads]) return '';
  const { abandoned, abandonedCarried, arrived, horizonS } = observations;
  if (abandoned <= 0) return '';
  const clause = DENOMINATOR_CLAUSE[goal.reads];
  if (basis === 'now') {
    return (
      `${String(abandoned)} of ${String(arrived)} have waited past the ${horizonLabelOf(horizonS)} ` +
      `give-up horizon so far; ${OVERLAP_UNSETTLED}; ${clause}`
    );
  }
  const overlap =
    abandonedCarried === 0
      ? 'none of them carried'
      : abandonedCarried === abandoned
        ? 'every one of them carried'
        : `${String(abandonedCarried)} of them carried`;
  return (
    `${String(abandoned)} of ${String(arrived)} waited past the ${horizonLabelOf(horizonS)} ` +
    `give-up horizon, ${overlap}; ${clause}`
  );
}


/**
 * How full the bar is, `0`–`100` — the design's own formula (`design.html` :2387–2389).
 *
 * An inverted goal with a bar of zero (*nobody waits past the horizon*) has no gradient to show:
 * one abandonment is the whole failure, so the bar is full or empty. Every other inverted goal
 * fills as the observed value falls away from the ceiling.
 *
 * The bar is decoration and the {@link GoalReading.state} is the verdict. They are computed
 * separately on purpose: rounding a percentage for a 4 px bar must never be able to move a
 * met/missed decision.
 */
function progressOf(goal: ShiftGoal, observed: number): number {
  if (goal.compare === 'at-most') {
    if (goal.bar === 0) return observed > 0 ? 0 : 100;
    return Math.round(Math.max(0, 100 - (observed / Math.max(1, goal.bar)) * 100));
  }
  if (goal.bar === 0) return 100;
  return Math.round(Math.min(100, (observed / goal.bar) * 100));
}

/**
 * The rail's footer line (`design.html` :2375).
 *
 * Verbatim in both branches, including the lower-case opening — it sits under a hairline in 10.5 px
 * monospace and reads as a caption rather than a sentence.
 */
export function bestLineFor(observations: GoalObservations, bestMinutePct: number): string {
  if (observations.arrived < WAKE_UP_ARRIVALS) {
    return 'not enough riders yet — nothing graded before the building wakes up';
  }
  return `best day ${String(bestMinutePct)}%`;
}

/* -------------------------------------------------------------------------- *
 * Last night's figure
 * -------------------------------------------------------------------------- */

/**
 * What this goal's quantity measured on the building's **previous day**, or the em dash.
 *
 * The handoff's "was" figures (§ 8.6): *"last night's actual result for this building, not a
 * constant. If there is no previous day, they read `—`."* This is the one derivation both
 * renderers call — the rail's goal rows and the report sheet's — so the two screens cannot show
 * two different yesterdays. See {@link GoalLine} for why the string is derived at draw time
 * rather than stored beside the reading.
 *
 * Three deliberate choices:
 *
 * - **The previous day is found by day number**, `entry.day === day - 1`, never as
 *   `history[history.length - 1]`. While a day is being played, yesterday *is* the last entry —
 *   but the moment today is closed and re-closed (the retry loop `WeekState.attempt` models),
 *   the last entry is today, and a "was" that read it would show this attempt's own figures as
 *   last night's.
 * - **Matched on {@link ShiftGoal.reads}**, not on the goal's id or bar: the bar hardens
 *   nightly, so yesterday's goal is a different object asking about the same quantity — and the
 *   quantity is what *"what it was last time"* means. A history written before a goal existed
 *   (a restored session from the three-goal build) simply has no reading for it, and answers
 *   the em dash rather than a stand-in.
 * - **The previous reading's own {@link GoalReading.display} is returned**, not a re-format of
 *   its `observed`: one formatting decision, made where the reading was made. A pending
 *   yesterday therefore reads `—` here too, which is honest — an ungraded morning measured
 *   nothing worth quoting tonight.
 */
/**
 * **The *was* slot, dressed as yesterday's** — GitHub issue #596 item 4, [§ D983](../../../../DECISIONS.md).
 *
 * The slot read `was 78%`, and on the Day report it sits a few rows above the after-press pair,
 * which prints *this run* and *the run without that press* — so two assessors read *was* as
 * *before my press*. It is the building's **previous day** ({@link wasDisplayOf}), and the word now
 * says so. The em dash stays bare, for the rule both callers already kept: `yesterday —` would dress
 * an absence as a measurement.
 *
 * One function because the rail and the report must spell yesterday one way — `dev/reportPanel.ts`
 * says two spellings would be two screens disagreeing — and they did, identically, as `was`.
 */
export function yesterdayLabelOf(was: string): string {
  return was === PENDING_DISPLAY ? PENDING_DISPLAY : `yesterday ${was}`;
}

export function wasDisplayOf(
  history: readonly DayOutcome[],
  day: number,
  goal: ShiftGoal,
): string {
  const previous = history.find((entry) => entry.day === day - 1);
  const reading = previous?.readings.find((entry) => entry.goal.reads === goal.reads);
  return reading?.display ?? PENDING_DISPLAY;
}
