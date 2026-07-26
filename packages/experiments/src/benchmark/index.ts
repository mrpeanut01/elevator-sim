/**
 * `experiments/benchmark` — **the Phase 5 acceptance gate, and its written report.**
 *
 * ```ts
 * import { runBenchmark, formatBenchmark } from './benchmark/index.js';
 * console.log(formatBenchmark(await runBenchmark()));
 * ```
 *
 * docs/05-roadmap.md § Phase 5 states two acceptance criteria:
 *
 * > Each dispatcher beats `NearestCarDispatcher` with a paired-t interval excluding zero on at least
 * > one building. Pre-positioning shows measurable AWT improvement on Garden Apartments, where
 * > parking policy dominates.
 *
 * This directory determines whether each is true. It does not try to make either true. Nothing here
 * tunes a weight, loosens a tolerance, or drops a losing arm; every profile in
 * `data/dispatcher-profiles.json` is measured and reported whatever it does.
 *
 * ---
 *
 * # THE VERDICT
 *
 * | criterion | verdict |
 * |---|---|
 * | *each dispatcher beats `nearest-car` with a paired-t interval excluding zero on at least one building* | **MET — 8 of 8 arms, on all three buildings, on all four metrics.** But three of the eight are *bit-identical to `eta`*, so what they beat the baseline with is a wait-time term and not their own mechanism |
 * | *pre-positioning shows measurable AWT improvement on Garden Apartments* | **NOT MET, and the effect is exactly zero** — 500 of 500 paired differences of precisely `0`. `predicted-demand` and `stay` produce bit-identical runs, because `Simulation.#park` supplies no forecast |
 *
 * **Phase 5 is therefore half green.** The first criterion passes and passes easily; the second fails
 * outright, for a reason that is a missing wiring in `core/sim/` rather than a defect in the
 * predictor, the reposition arithmetic, or the profile. The precise obstruction and its one-line fix
 * are recorded in `core/dispatch/policies/index.ts` as gap 4. This module cannot close it — it does
 * not own those files — and would not want to: measuring the gap is what a gate is for.
 *
 * ---
 *
 * # 1. The comparison table
 *
 * Baseline `nearest-car`. Three buildings, eight arms, four metrics, CRN throughout, paired-t at 95 %.
 * `formatBenchmark(await runBenchmark())` regenerates every number below.
 *
 * **Replication budgets, and why they are not larger.** The budget has a **ceiling set by the
 * baseline**, and this is the most consequential measurement in the study:
 *
 * | case | operating point | n used | baseline's first invalid replication | rho | paired half-width on AWT |
 * |---|---|---|---|---|---|
 * | Midtown Office | up-peak 1 % pop/5 min, 900 s, peak-5min | 250 | **287** | 0.624 | 0.886 s |
 * | Garden Apartments | residential 2 % pop/5 min, 3600 s, full-run | 500 | none in 1000 | **0.897** | 0.211 s |
 * | Secure Tower | up-peak 2 % pop/5 min, 900 s, peak-5min | 150 | **190** | 0.609 | 0.770 s |
 *
 * `nearest-car` is the only profile in the whole library that saturates anywhere in this study —
 * measured over 1000 replications per cell on all three buildings. Since any saturated replication
 * suppresses a cell's AWT, the baseline's divergence at replication 287 caps Midtown Office at
 * n = 287 **permanently**: the detectable effect falls as `1/sqrt(n)` only until then, so ~0.8 s
 * (≈5 % of `eta`'s AWT) is the floor of what this operating point can ever resolve. Raising `n` is not
 * available as a remedy. Garden Apartments has no ceiling and pairs far better besides (`rho` 0.90
 * against 0.62 — two cars over six floors leaves two dispatchers little to disagree about), so its
 * half-width is 0.211 s where Midtown's floor is ~0.8 s. That is why a 0.22 s effect is *almost*
 * resolvable on Garden and would be invisible on Midtown at any admissible budget.
 *
 * ## Midtown Office, up-peak 1 % — n = 250, baseline AWT 22.70 s
 *
 * | arm | AWT | d, 95 % paired-t | WT95 | d | % > 60 s | TTD | d | verdict |
 * |---|---|---|---|---|---|---|---|---|
 * | `eta` | 15.90 | −6.81 [−7.69, −5.92] | 29.09 | −23.41 [−26.20, −20.62] | 0.00 | 68.10 | −10.31 [−11.70, −8.93] | **BETTER** ×4 |
 * | `collective` | 15.89 | −6.81 [−7.72, −5.91] | 29.13 | −23.37 [−26.16, −20.58] | 0.00 | 68.05 | −10.36 [−11.75, −8.97] | **BETTER** ×4 |
 * | `energy-aware` | 15.94 | −6.76 [−7.65, −5.87] | 29.16 | −23.34 [−26.13, −20.55] | 0.00 | 68.92 | −9.49 [−10.90, −8.09] | **BETTER** ×4 |
 * | `fairness-first` | 15.90 | −6.81 [−7.69, −5.92] | 29.09 | −23.41 [−26.20, −20.62] | 0.00 | 68.10 | −10.31 [−11.70, −8.93] | **BETTER** ×4 |
 * | `capacity-aware` | 15.95 | −6.75 [−7.65, −5.86] | 29.09 | −23.41 [−26.19, −20.62] | 0.00 | 68.21 | −10.20 [−11.61, −8.80] | **BETTER** ×4 |
 * | `predictive-balanced` | 19.12 | −3.58 [−4.57, −2.60] | 32.52 | −19.98 [−22.81, −17.15] | 0.00 | 66.65 | −11.76 [−13.30, −10.21] | **BETTER** ×4 |
 * | `auction` | 16.64 | −6.06 [−6.99, −5.13] | 29.55 | −22.95 [−25.75, −20.15] | 0.00 | 67.35 | −11.06 [−12.54, −9.58] | **BETTER** ×4 |
 * | `zoned-uppeak` | 15.90 | −6.81 [−7.69, −5.92] | 29.09 | −23.41 [−26.20, −20.62] | 0.00 | 68.10 | −10.31 [−11.70, −8.93] | **BETTER** ×4 |
 *
 * Baseline WT95 52.50 s, **% > 60 s = 7.35**, TTD 78.41 s. Every arm's % > 60 s is **exactly zero**:
 * `nearest-car` is the only dispatcher in the library that makes anybody on this building wait longer
 * than a minute.
 *
 * ## Garden Apartments, residential 2 %, full run — n = 500, baseline AWT 16.67 s
 *
 * | arm | AWT | d, 95 % paired-t | verdict | WT95 d | TTD d |
 * |---|---|---|---|---|---|
 * | `eta` | 15.39 | −1.28 [−1.49, −1.07] | **BETTER** | −4.23 [−4.95, −3.51] | −1.86 [−2.13, −1.59] |
 * | `collective` | 15.40 | −1.27 [−1.49, −1.05] | **BETTER** | −3.84 [−4.55, −3.14] | −3.68 [−4.11, −3.25] |
 * | `energy-aware` | 15.40 | −1.27 [−1.48, −1.06] | **BETTER** | −4.17 [−4.89, −3.46] | −1.51 [−1.78, −1.25] |
 * | `fairness-first` | 15.38 | −1.29 [−1.50, −1.08] | **BETTER** | −4.25 [−4.97, −3.53] | −1.87 [−2.14, −1.60] |
 * | `capacity-aware` | 15.39 | −1.28 [−1.49, −1.07] | **BETTER** | −4.23 [−4.95, −3.51] | −1.93 [−2.20, −1.65] |
 * | `predictive-balanced` | 16.45 | **−0.22 [−0.46, +0.03]** | **INDISTINGUISHABLE** — needs n ≈ 623 | −2.71 [−3.45, −1.97] | −2.00 [−2.42, −1.58] |
 * | `auction` | 15.41 | −1.26 [−1.47, −1.04] | **BETTER** | −4.19 [−4.92, −3.47] | −1.96 [−2.25, −1.68] |
 * | `zoned-uppeak` | 15.39 | −1.28 [−1.49, −1.07] | **BETTER** | −4.23 [−4.95, −3.51] | −1.86 [−2.13, −1.59] |
 *
 * The one INDISTINGUISHABLE cell in 96. Reported as *below resolution at this budget*, with the
 * budget it would need (623 against the 500 spent) — **not** as a 1.3 % improvement. It is also, on
 * WT95, still `BETTER`: the same arm pulls the tail in by 2.71 s while leaving the mean where it was.
 *
 * ## Secure Tower, up-peak 2 % — n = 150, baseline AWT 20.87 s
 *
 * | arm | AWT | d, 95 % paired-t | WT95 d | TTD d | verdict |
 * |---|---|---|---|---|---|
 * | `eta` | 15.12 | −5.76 [−6.53, −4.99] | −19.52 [−22.42, −16.63] | −7.19 [−8.26, −6.13] | **BETTER** ×4 |
 * | `collective` | 15.11 | −5.77 [−6.53, −5.00] | −19.52 [−22.42, −16.63] | −7.19 [−8.25, −6.13] | **BETTER** ×4 |
 * | `energy-aware` | 15.16 | −5.72 [−6.50, −4.93] | −19.51 [−22.41, −16.61] | −6.58 [−7.66, −5.49] | **BETTER** ×4 |
 * | `fairness-first` | 15.12 | −5.76 [−6.53, −4.99] | −19.52 [−22.42, −16.63] | −7.19 [−8.26, −6.13] | **BETTER** ×4 |
 * | `capacity-aware` | 15.30 | −5.57 [−6.36, −4.77] | −19.48 [−22.39, −16.57] | −7.12 [−8.19, −6.06] | **BETTER** ×4 |
 * | `predictive-balanced` | 17.08 | −3.79 [−4.59, −2.99] | −17.73 [−20.64, −14.82] | −6.74 [−7.92, −5.57] | **BETTER** ×4 |
 * | `auction` | 15.41 | −5.47 [−6.26, −4.67] | −19.45 [−22.36, −16.53] | **−7.75 [−8.88, −6.61]** | **BETTER** ×4 |
 * | `zoned-uppeak` | 15.12 | −5.76 [−6.53, −4.99] | −19.52 [−22.42, −16.63] | −7.19 [−8.26, −6.13] | **BETTER** ×4 |
 *
 * **Nothing is WORSE than the baseline in any of the 96 cells.** Not one arm loses to `nearest-car`
 * anywhere, on any metric, on any building.
 *
 * ---
 *
 * # 2. Three of the eight arms are the same dispatcher
 *
 * This is the finding that qualifies the verdict, and it is a *zero* rather than a small number.
 *
 * | case | bit-identical classes |
 * |---|---|
 * | Midtown Office | `eta` ≡ `fairness-first` ≡ `zoned-uppeak` |
 * | Garden Apartments (n = 500) | `eta` ≡ `zoned-uppeak` |
 * | Secure Tower | `eta` ≡ `fairness-first` ≡ `zoned-uppeak` |
 *
 * Identical on **every** metric, in **every** replication — `rho = 1`, interval `[0, 0]`. Under a
 * deterministic simulator with CRN that is a claim about the dispatchers, not about the sample, and
 * Phase 3 established that it must be reported as `IDENTICAL` and never as `INDISTINGUISHABLE`: it is
 * not an effect too small to see, it is no effect. No budget changes it.
 *
 * **`zoned-uppeak` is `eta`, on every building.** Its weight vector is `waitTime: 0.7,
 * zoneAffinity: 0.3`, and `zoneAffinity` evaluates to `0` for every car in every real run because
 * `Simulation.#dispatchBank` passes a `DispatchContext` of `{ waitingPassengers, waitingMassKg }` and
 * no `zoneFloorIdsByCarId` — gap 5 in `core/dispatch/policies/index.ts`. What is left is a
 * single-term cost scaled by 0.7, and scaling a single-term cost cannot move an `argmin`. Its
 * `assignmentMode: split-demand` at 10 waiting passengers does not trigger at 1 % of population
 * either. So the only shipped zoning dispatcher is, measurably, not doing any zoning.
 *
 * **`fairness-first` is `eta`, on both up-peak buildings.** Its `starvation: 0.5` is correctly
 * implemented — the age of the oldest *committed hall call this car would push back*, which is the
 * only form of the term that can move an `argmin` at all. But at these loads a car seldom holds such
 * a call, so the term is `0` for every candidate, and a term equal across candidates moves nobody.
 * Its `until-commitment` reassignment with 2 s hysteresis never finds an improvement worth taking.
 * Under this arm it stays bit-identical to `eta` at 1 %, 2 % **and** 3 % — 250 of 250 exact zeros at
 * every load. The term is not merely quiet; under pure single-entrance up-peak it never fires at all.
 *
 * It does fire, and hard, once two landings contend — see § 5 and `tailStudy.ts`. But the load at
 * which it does is past the load at which the *baseline* stops being measurable, so the acceptance
 * criterion cannot be argued there. That is the phase's sharpest structural finding and it is
 * developed in § 5.
 *
 * ---
 *
 * # 3. `predictive-balanced`: beats the baseline, loses to the simplest arm, survives the longest
 *
 * The most-configured profile in the library — eleven weighted terms, deferred assignment, split
 * demand, adaptive dwell, reassignment on deceleration, predictive parking — is **significantly worse
 * than one-line `eta`** on mean wait, everywhere:
 *
 * | case | `predictive-balanced` − `eta`, AWT | `predictive-balanced` − `eta`, TTD |
 * |---|---|---|
 * | Midtown Office | **+3.22 [+2.81, +3.63]** | **−1.44 [−2.12, −0.77]** |
 * | Garden Apartments | **+1.06 [+0.95, +1.18]** | −0.14 [−0.47, +0.18] |
 * | Secure Tower | **+1.97 [+1.75, +2.18]** | +0.45 [−0.10, +1.00] |
 *
 * On Midtown it buys that with time-to-destination, where it is the **best arm in the study**. That is
 * a genuine Pareto trade and exactly what docs/06 § *Do not scalarize too early* warns about: eleven
 * terms is not eleven improvements, it is a different point on a front.
 *
 * And it has the study's most interesting property, one no interval can express. **At 4 % of
 * population per 5 minutes on Midtown Office it is the only profile in the library that does not
 * saturate:**
 *
 * | load | `nearest-car` | `eta` | `auction` | `zoned-uppeak` | `capacity-aware` | `predictive-balanced` |
 * |---|---|---|---|---|---|---|
 * | 1 % | 0 | 0 | 0 | 0 | 0 | 0 |
 * | 2 % | 7 | 1 | 0 | 1 | 0 | 0 |
 * | 3 % | 21 | 1 | 0 | 1 | 0 | 0 |
 * | 4 % | **52** | 8 | 7 | 4 | 1 | **0** |
 *
 * (saturated replications of 100.) The arm that loses to `eta` by 3 s at design load is the arm still
 * standing at four times it, and at 4 % every other arm's AWT has been suppressed so no ranking on
 * the mean exists. A benchmark that reported only AWT at one operating point would have called this
 * profile the study's weakest smart dispatcher. It is also its most robust one.
 *
 * ---
 *
 * # 4. Pre-positioning: the criterion fails, and the mechanism is not what failed
 *
 * `prepositioning.ts` isolates stage 7 the only way that is valid — **one profile, one field
 * changed** — with `predictive-balanced` and `idle.parkingStrategy` as the sole difference, on Garden
 * Apartments, n = 500, CRN.
 *
 * | strategy vs `stay` | AWT, 95 % paired-t | verdict |
 * |---|---|---|
 * | `predicted-demand` | `0.00 [0.00, 0.00]`, 500/500 differences exactly 0 | **IDENTICAL** |
 * | `zone-center` | `0.00 [0.00, 0.00]`, 500/500 differences exactly 0 | **IDENTICAL** |
 * | `lobby` | **`+1.97 [+1.75, +2.20]`**, 12.0 % | **WORSE** |
 *
 * **The criterion is NOT MET, and the measured effect of predictive pre-positioning is exactly zero.**
 * `Simulation.#park` builds its `RepositionContext` from `{ entranceFloorIds }` alone, and
 * `predicted-demand` with no `demandForecast` answers `no-forecast`, which is a refusal to move —
 * observationally identical to `stay`. `idle.predictorHorizonS`, `idle.repositionThresholdS` and
 * `idle.repositionEnergyWeight` are all inert in a real run, and everything
 * `core/dispatch/predictor/` computes reaches nothing.
 *
 * **But the roadmap's second clause — *"where parking policy dominates"* — is true, and that is the
 * sharper result.** `lobby` parking is the one strategy that is fully wired, and it moves AWT by 12 %
 * of the baseline: far above any resolution limit in this project, and *in the wrong direction*. So
 * the reposition arithmetic runs, moves cars, and matters a great deal on this building. What is
 * missing is the forecast, not the mechanism.
 *
 * That the direction is *worse* is a finding about elevator dispatch and not only about this codebase.
 * Lobby parking is the up-peak instinct — demand originates at the entrance, so wait there. On a
 * sparse residential building demand originates upstairs, and a car held at the ground floor pays its
 * whole climb on every call. `stay`, which is what `DISPATCH_DEFAULTS` already does, beats it on AWT,
 * WT95 and TTD simultaneously.
 *
 * ---
 *
 * # 5. The tail terms work — one load step past where the criterion can be argued
 *
 * `tailStudy.ts` takes the same building and changes one thing about the traffic: let **both** of
 * Midtown Office's entrance floors fill (`G` lobby and `P1` garage, at the building's own default
 * weights) instead of forcing everything through `G`. Two landings then contend for one bank, which is
 * the only situation in which a car holds a committed hall call that a new call would push back — and
 * therefore the only situation in which `starvation` is non-zero. Compared against **`eta`**, n = 250:
 *
 * | load | `fairness-first` − `eta`: AWT | WT95 | WT99 | % > 60 s | quotable? |
 * |---|---|---|---|---|---|
 * | 1 % | −0.01 [−0.05, +0.02] | −0.05 [−0.13, +0.02] | −0.03 [−0.09, +0.03] | 0.00 exactly | yes; nothing significant |
 * | 2 % | **−0.23 [−0.41, −0.05]** | **−1.58 [−2.48, −0.68]** | **−1.94 [−2.87, −1.02]** | **−0.49 [−0.76, −0.21]** | **yes; all significant** |
 * | 3 % | — | — | — | — | no: `eta` itself saturates |
 *
 * **The 2 % row is the phase's one clean demonstration that a tail term does what tail terms are for.**
 * The mean moves 1.16 %; WT95 moves 3.83 %; WT99 moves 4.24 %. The effect *grows as you move out of the
 * distribution*, which is precisely the signature that distinguishes a fairness term from a slightly
 * better `waitTime`. It cuts the fraction of passengers waiting over a minute from 1.30 % to 0.81 %.
 *
 * **And the window in which any of it can be said is one load step wide.** Swept at n = 250, saturated
 * replications:
 *
 * | load | `nearest-car` | `eta` | `fairness-first` | `capacity-aware` | `zoned-uppeak` |
 * |---|---|---|---|---|---|
 * | 1 % | 2 | 0 | 0 | 0 | 0 |
 * | 2 % | 29 | 0 | 0 | 0 | 0 |
 * | 2.25 % | 45 | 1 | 1 | 1 | 1 |
 * | 2.5 % | 52 | 3 | 2 | 1 | 2 |
 * | 2.75 % | 64 | 0 | 1 | 0 | 0 |
 * | 3 % | 108 | 2 | 0 | 0 | 2 |
 *
 * There is **no load above 2 % at which every arm is simultaneously quotable**, and the acceptance
 * baseline is unquotable at *every* load in the table including 1 %. So:
 *
 * > **The load at which the tail terms earn their weights is past the load at which `nearest-car`
 * > stops being measurable.** The criterion can only be argued in the regime where the interesting
 * > terms are inert; the regime where they work has no baseline to compare against. `nearest-car` does
 * > not merely lose at 3 % — its queues diverge on 43 % of replications.
 *
 * `capacity-aware` falls in the gap and the honest verdict is **INDISTINGUISHABLE from `eta` at every
 * load where all arms are quotable together** (2 %: AWT `−0.16 [−0.44, +0.12]`, WT95
 * `−0.86 [−1.85, +0.14]`). At 2.75 %, where it is quotable and `fairness-first` is not, it is
 * `−0.72 [−1.27, −0.17]` on AWT and `−2.29 [−4.10, −0.49]` on WT95 — both significant, neither
 * simultaneously comparable. Its `loadFactor` and `crowding` weights need cars near their bypass
 * threshold to have anything to price, and by that load something has diverged.
 *
 * One more thing the census shows and no interval can: at 3 % `fairness-first` saturates **0** of 250
 * where `eta` saturates 2. The fairness term buys robustness as well as tail, and robustness has no
 * confidence interval.
 *
 * ---
 *
 * # 6. The predictor is not cheating. Measured, on a pattern it cannot have learned.
 *
 * `predictorLag.ts` feeds an `ArrivalModel` one arrival every 5 s at floor `2` for 1800 s, then — with
 * no announcement — one every 5 s at floor `6`, and samples the forecast every 60 s throughout.
 *
 * | property | measured |
 * |---|---|
 * | samples before the shift where the new floor outranked the old | **0 of 30** |
 * | `forecast(6)` over the five samples up to and including the shift | flat at 2.37, 2.49 at the shift itself — unmoved |
 * | first movement in `forecast(6)` | **2100 s = shift + 300 s = exactly one bucket** |
 * | first time the argmax flips to floor `6` | **2400 s = shift + 600 s = two buckets** |
 * | does it adapt eventually | yes — floor `6` ranks first for the rest of the run |
 *
 * A first response of exactly one bucket width is the signature of an estimator that folds
 * **completed buckets only**: the shift lands inside `[1800, 2100)`, which cannot contribute to any
 * estimate until it closes, and at 2100 it does — `forecast(6)` jumps 2.49 → 13.82 while
 * `forecast(2)` falls 35.58 → 25.73. The *ranking* needs a second bucket for the moving average to
 * decay the old floor far enough to be overtaken. **The forecast lags its own cause by precisely the
 * amount the design says it must, and leads it by nothing.** No sample anywhere prefers a floor no
 * arrival has occurred at.
 *
 * The lag is also a *cost*, and worth stating as one: **600 s to re-rank is two thirds of a 900 s
 * replication.** A demand pattern that changes inside a replication is one this predictor will still
 * be catching up with when the measurement window closes. That bounds what pre-positioning could be
 * worth even once gap 4 is fixed, and it is why `predictorLearningRate` defaults to a deliberately
 * fast 0.3 rather than a textbook 0.05.
 *
 * ---
 *
 * # 7. The auction: sealed-bid is the central scorer; multi-round is unmeasured
 *
 * `auctionAggregation.ts` drives both aggregations over 1200 decision states drawn from the three
 * buildings' real car specs and shaft geometry, with positions, loads, car calls and committed hall
 * calls randomized from the `policyNoise` stream.
 *
 * | question | answer |
 * |---|---|
 * | does sealed-bid (`rounds = 1`) pick the same car as `bestScore(scoreCar(…))`? | **yes, 1200 of 1200.** 0 allocation differences, 0 price differences |
 * | states where nobody was eligible and both declined | 8 of 1200 (full cars on Garden; access zoning on Secure Tower) |
 * | does the contract net (`rounds = 3`, `reserveMarginalDelayS = 25`) ever allocate differently? | **yes, 110 of 1200 — 9.2 %.** 361 reserve-price withdrawals, 19 load-crossing, 24 waived to keep a landing served; 322 states went to 2 rounds and 2 to 3 |
 * | does multi-round *beat* sealed-bid on AWT? | **UNMEASURED, and unmeasurable today** |
 *
 * **The architecture answer, in the terms docs/01 asked it in.** Decentralizing the argmin buys
 * nothing: moving the computation into the cars changes who computes it, not what it computes, and
 * the equivalence is exact rather than approximate. Whatever value agent autonomy has must come from
 * a car doing something a central scorer *cannot express* — and the contract net's reserve price is
 * exactly that (a car refusing work the group's own objective says it should take). It demonstrably
 * reallocates on 9 % of decisions, so it *could* matter.
 *
 * Whether it does is not answerable now. `SimulationConfig` carries no policy factory:
 * `Simulation` builds every bank's controller with `createDispatchPolicy`, typed
 * `WeightedCostDispatchPolicy`, so an `AuctionDispatchPolicy` cannot be injected into a run — gap 2.
 * `auctionAggregation.test.ts` asserts that obstruction against `core`'s own source, so the day it is
 * fixed the test fails and this module is owed a real paired-t comparison. **A 9.2 % divergence rate
 * is not a wait-time result and is not quoted as one.**
 *
 * One corollary worth stating because it saves a wasted experiment: since sealed-bid *is* the central
 * argmin, the `auction` row of the main table — which runs through the ordinary weighted-cost engine,
 * the only engine `Simulation` can build — **already is the sealed-bid arm**. Running a "sealed-bid
 * benchmark" separately would be measuring one dispatcher twice.
 *
 * ---
 *
 * # 8. What this gate did not do
 *
 * - **No weight was tuned.** Every arm is the profile `data/dispatcher-profiles.json` ships.
 * - **No tolerance was loosened.** Every interval is paired-t at 95 %, the level a published interval
 *   is quoted at. Every operating point is the *highest* load at which the criterion can be argued at
 *   all, chosen by the saturation rule and not by the answer it produced.
 * - **No losing arm was dropped.** `dispatcherBenchmark.test.ts` asserts that the arm list is exactly
 *   the shipped profile set, so a profile added to `data/` and not to `ARM_PROFILES` fails the gate.
 * - **No point estimate was reported as a win.** The single INDISTINGUISHABLE cell is reported with
 *   the `n` it would need, computed from its own observed `s_D`.
 * - **Two `core` internals were deep-imported, and are not any more.** `createArrivalModel` in
 *   `predictorLag.ts` and `createAuctionPolicy`/`runAuction` in `auctionAggregation.ts` were off
 *   `@elevator-sim/core`'s public surface while this gate was written, and both index files belonged
 *   to the verifier. Skipping the predictor's cheating check and the architecture question because of
 *   an export barrel was not an option available to an acceptance gate, so the breach was taken and
 *   recorded rather than avoided and unmentioned — with the consequence stated plainly, that the
 *   relative specifier resolves under `vitest` (which runs from source) but would not resolve in the
 *   emitted `dist/benchmark/*.js` at Node runtime.
 *
 *   Phase 5's integration step re-exported `./policies/index.js` and `./predictor/index.js` from
 *   `dispatch/index.ts` and then from the package barrel, and both imports became
 *   `from '@elevator-sim/core'` with no other change. **The specifiers resolve to the same module, so
 *   not one number in this report moved**, and the directory is now safe to export — which it is,
 *   from `experiments/src/index.ts`.
 *
 * # 9. What the next phase should take from this
 *
 * 1. **`nearest-car` is too weak a baseline to separate anything.** It loses by 27–30 % on the
 *   up-peak buildings, is the only profile that saturates anywhere in the study, and is unquotable at
 *   every load where the interesting terms actually fire. Phase 6's criterion says *beats the naive
 *   baselines*; it should say *beats `eta`*, which is the arm that actually has to be beaten, which
 *   three of the eight profiles here are indistinguishable from, and which stays quotable one whole
 *   load step further up.
 * 2. **Two cost terms are inert in a real run** — `zoneAffinity` and `predictedDemand` — and one
 *   parking strategy and one whole aggregation are unreachable. Phase 7's optimizer will happily
 *   spend its budget searching those dimensions and measure exactly zero. The four fixes are in
 *   `core/dispatch/policies/index.ts`; they are worth more than any weight vector.
 * 3. **The tail is where the differences live, and the window to see them is one load step wide.**
 *   `fairness-first` is bit-identical to `eta` at the criterion's operating point and worth
 *   `−1.58 s` of WT95 one step up; `capacity-aware` needs a step beyond that, by which point some arm
 *   has always saturated. Tune and report per traffic pattern, as docs/06 says — and pick the
 *   operating point *before* looking at the answer, because these terms are all-or-nothing across a
 *   very narrow band of load.
 * 4. **Budget by the baseline's saturation, not by patience.** On Midtown Office no experiment at
 *   this operating point may exceed n = 287, whatever precision it wants.
 *
 * ---
 *
 * Names are re-exported explicitly rather than with `export *`, as everywhere else in this
 * repository, so widening this module's surface is a deliberate act.
 */

/* -------------------------------------------------------------------------- *
 * The arms, the operating points and the metrics — all data
 * -------------------------------------------------------------------------- */

export {
  ARM_PROFILES,
  BASELINE_PROFILE,
  BENCHMARK_CASES,
  BENCHMARK_METRICS,
  METRIC_LABELS,
  benchmarkCase,
} from './arms.js';

export type { BenchmarkCase } from './arms.js';

/* -------------------------------------------------------------------------- *
 * Verdicts — what a paired interval is allowed to be called
 * -------------------------------------------------------------------------- */

export { CELL_VERDICTS, classify, compareCell, replicationsToResolve } from './verdict.js';

export type { CellComparison, CellComparisonInput, CellVerdict } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The benchmark
 * -------------------------------------------------------------------------- */

export {
  BENCHMARK_SEED,
  armOf,
  armsWithVerdict,
  identityClassesOf,
  runBenchmark,
  runBenchmarkCase,
  verdictCounts,
} from './suite.js';

export type { ArmResult, BenchmarkRunOptions, CaseResult } from './suite.js';

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

export {
  cellNote,
  criterionOutcomes,
  formatBenchmark,
  formatCase,
  formatInterval,
  formatRelative,
  padVerdict,
} from './report.js';

export type { CriterionOutcome } from './report.js';

/* -------------------------------------------------------------------------- *
 * Stage 7 in isolation — the pre-positioning criterion
 * -------------------------------------------------------------------------- */

export {
  CONTROL_STRATEGY,
  PREPOSITIONING_PROFILE,
  STUDIED_PARKING_STRATEGIES,
  parkingArmId,
  parkingVariant,
  runPrepositioningStudy,
} from './prepositioning.js';

export type { PrepositioningOptions, PrepositioningStudy } from './prepositioning.js';

/* -------------------------------------------------------------------------- *
 * Where the tail terms earn their weights — a vs-`eta` study, never the criterion
 * -------------------------------------------------------------------------- */

export {
  TAIL_ARMS,
  TAIL_LOADS,
  TAIL_METRICS,
  TAIL_REFERENCE,
  formatTailStudy,
  runTailStudy,
  twoEntranceUpPeak,
} from './tailStudy.js';

export type { TailCell, TailRow, TailStudy, TailStudyOptions } from './tailStudy.js';

/* -------------------------------------------------------------------------- *
 * The predictor's causality, measured behaviourally
 * -------------------------------------------------------------------------- */

export {
  AFTER_FLOOR,
  ARRIVAL_EVERY_S,
  BEFORE_FLOOR,
  GARDEN_FLOOR_IDS,
  RUN_DURATION_S,
  SAMPLE_EVERY_S,
  SHIFT_AT_S,
  measurePredictorLag,
} from './predictorLag.js';

export type { ForecastSample, PredictorLagStudy } from './predictorLag.js';

/* -------------------------------------------------------------------------- *
 * The architecture question
 * -------------------------------------------------------------------------- */

export {
  AUCTION_PROFILE,
  CONTRACT_NET,
  ENSEMBLE_BUILDINGS,
  ENSEMBLE_SEED,
  measureAuctionAggregation,
  multiRoundIsReachableFromSimulation,
  requireAuctionProfile,
} from './auctionAggregation.js';

export type {
  AuctionEnsembleOptions,
  AuctionEnsembleResult,
  DecisionOutcome,
  DecisionState,
} from './auctionAggregation.js';
