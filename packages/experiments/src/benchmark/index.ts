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
 * | *each dispatcher beats `nearest-car` with a paired-t interval excluding zero on at least one building* | **MET — 9 of 9 arms.** One of them, `zoned-uppeak`, is also WORSE than the baseline on a whole building, and it is named rather than averaged away |
 * | *pre-positioning shows measurable AWT improvement on Garden Apartments* | **MET as written, by `zone-center`: −4.88 s [−5.27, −4.49]** (−29.7 %) at n = 500 under CRN. **NOT MET by the *predictive* strategy at the settings the library ships:** `predicted-demand` reads **−0.006 s [−0.021, +0.010]**, a measured near-zero rather than an unresolved one. Retuning one field, `idle.repositionThresholdS`, from 8 s to 3 s takes it to −0.98 s [−1.28, −0.68] — reported as a retune, and the profile is left alone |
 *
 * **Phase 5 is green on both criteria as the roadmap words them**, and the second one is green on a
 * reading the roadmap's own scope bullet does not support — see the split immediately below, which is
 * the sentence a reader should take away rather than the table row. The second criterion used to read
 * *NOT MET, and the effect is
 * exactly zero — 500 of 500 paired differences of precisely `0`*, and that zero was never
 * statistical: four Phase 5 behaviours were built correctly, unit-tested, weighted by shipped
 * profiles and connected to nothing. `Simulation.#park` supplied no forecast, `#dispatchBank` no
 * operational partition, `simulation.ts` had no `reconsider` call site at all, and `SimulationConfig`
 * no way to select an aggregation. All four are wired; `core/src/sim/seam.test.ts` is the guard that
 * goes red if any becomes unreachable again, and it is behavioural rather than a symbol search
 * because a symbol search would have caught none of them.
 *
 * Read the honest form of the second verdict, not the headline, because the two readings of the word
 * *pre-positioning* give different answers and the report owes both.
 *
 * | reading of the criterion | verdict |
 * |---|---|
 * | *idle repositioning* — stage 7, any strategy | **MET.** `zone-center` is `−4.88 [−5.27, −4.49]`, −29.7 %, and `lobby` is `+1.98 [+1.75, +2.20]` the other way. Parking policy dominates this building, exactly as the clause says |
 * | ***predictive* pre-positioning** — the learned arrival model of the phase's own bullet, at the settings the library ships | **NOT MET, and not for want of resolution.** `predicted-demand` vs `stay` on `predictive-balanced` as authored is **−0.006 s [−0.021, +0.010]** at n = 500 (review finding #4: this cell used to read `[−0.031, +0.019]`, which is the **n = 300** deadband-sweep bound of § 4 quoted in an n = 500 sentence — same mean to three places, a half-width 59 % too wide), and the whole predictor apparatus — the same profile run with and without a forecast — is **−0.007 s [−0.032, +0.018]**, 296 of 300 replications bit-identical |
 *
 * The second row is a **result, not a null result for want of power.** Garden's half-width here is
 * 0.02 s against a 0.3 s detectable-effect target, so the interval says the true effect is between
 * −0.03 s and +0.02 s — measured, and measured tightly. It is also **not sparsity**: at eight times
 * the criterion's arrival rate the arm is still inert (§ 4's rate sweep, 300/300 bit-identical at 4 %).
 * The cause is `predictive-balanced`'s own `idle.repositionThresholdS: 8`, which a six-floor shaft
 * cannot pay from any park; the forecast reaches stage 7 on **35.40 of 35.40** reposition decisions per
 * run and comes back `below-threshold` 26.87 times and `reposition` 0.00 times. Move that one field to
 * 3 s and the same arm reads `−0.98 [−1.28, −0.68]`; move it to 2 s and `−1.11 [−1.55, −0.67]`. Those
 * rows are reported as what they are — **a retune of a shipped profile, not the shipped profile** — and
 * the profile is left as authored. § 4 has the whole sweep.
 *
 * ---
 *
 * # 1. The comparison table
 *
 * Baseline `nearest-car`. Three buildings, **nine** arms, four metrics, CRN throughout, paired-t at
 * 95 %. `formatBenchmark(await runBenchmark())` regenerates every number below.
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
 * `nearest-car` is still the profile that binds the budget, but it is no longer the *only* profile
 * that ever saturates: over 1000 replications per cell, `zoned-uppeak` first loses its AWT at index
 * **683** on Secure Tower — above the 150 that case is measured at, so it does not bind, and worth
 * recording because it did not happen before `zoneAffinity` started pricing anything. The baseline's
 * divergence at replication 287 caps Midtown Office at n = 287 **permanently**: the detectable effect
 * falls as `1/sqrt(n)` only until then, so ~0.8 s (≈5 % of `eta`'s AWT) is the floor of what this
 * operating point can ever resolve, and raising `n` is not available as a remedy. Garden Apartments
 * has no ceiling and pairs far better besides (`rho` 0.90 against 0.62 — two cars over six floors
 * leaves two dispatchers little to disagree about), so its half-width is 0.211 s where Midtown's floor
 * is ~0.8 s.
 *
 * ## Midtown Office, up-peak 1 % — n = 250, baseline AWT 22.70 s
 *
 * | arm | AWT | d, 95 % paired-t | WT95 | d | % > 60 s | TTD | d | verdict |
 * |---|---|---|---|---|---|---|---|---|
 * | `eta` | 15.90 | −6.81 [−7.70, −5.92] | 29.09 | −23.41 [−26.21, −20.61] | 0.00 | 68.10 | −10.31 [−11.70, −8.92] | **BETTER** ×4 |
 * | `collective` | 15.89 | −6.81 [−7.72, −5.91] | 29.13 | −23.37 [−26.18, −20.57] | 0.00 | 68.05 | −10.36 [−11.75, −8.96] | **BETTER** ×4 |
 * | `energy-aware` | 15.94 | −6.76 [−7.65, −5.87] | 29.16 | −23.34 [−26.15, −20.54] | 0.00 | 68.92 | −9.49 [−10.90, −8.08] | **BETTER** ×4 |
 * | `fairness-first` | 15.90 | −6.81 [−7.70, −5.92] | 29.09 | −23.41 [−26.21, −20.61] | 0.00 | 68.10 | −10.31 [−11.70, −8.92] | **BETTER** ×4 |
 * | `capacity-aware` | 15.95 | −6.75 [−7.65, −5.86] | 29.09 | −23.41 [−26.20, −20.61] | 0.00 | 68.21 | −10.20 [−11.62, −8.79] | **BETTER** ×4 |
 * | `predictive-balanced` | 18.90 | −3.81 [−4.80, −2.81] | 32.37 | −20.13 [−22.96, −17.29] | 0.00 | 66.96 | −11.45 [−12.99, −9.91] | **BETTER** ×4 |
 * | `auction` | 16.64 | −6.06 [−6.99, −5.13] | 29.55 | −22.95 [−25.77, −20.14] | 0.00 | 67.35 | −11.06 [−12.55, −9.57] | **BETTER** ×4 |
 * | `auction-multi-round` | 18.08 | −4.63 [−5.59, −3.66] | 31.02 | −21.48 [−24.30, −18.65] | 0.00 | **64.76** | **−13.65 [−15.18, −12.12]** | **BETTER** ×4 |
 * | `zoned-uppeak` | **14.54** | **−8.16 [−9.28, −7.04]** | 31.45 | −21.05 [−24.14, −17.95] | 0.13 | 66.28 | −12.13 [−13.87, −10.39] | **BETTER** ×4 |
 *
 * Baseline WT95 52.50 s, **% > 60 s = 7.35**, TTD 78.41 s. `zoned-uppeak` is the best arm on the mean
 * and the *worst smart arm* on the tail — a 35.9 % AWT gain bought with a WT95 gain smaller than
 * `eta`'s and the only non-zero % > 60 s in the field (0.13 against everyone else's exact zero). That
 * shape — mean down, tail up — is what a partition does when it refuses a call the nearest car could
 * have taken, and it is the same mechanism that makes it the study's one WORSE cell on Secure Tower.
 *
 * ## Garden Apartments, residential 2 %, full run — n = 500, baseline AWT 16.67 s
 *
 * | arm | AWT | d, 95 % paired-t | verdict | WT95 d | TTD d |
 * |---|---|---|---|---|---|
 * | `eta` | 15.39 | −1.28 [−1.49, −1.07] | **BETTER** | −4.23 [−4.95, −3.51] | −1.86 [−2.13, −1.59] |
 * | `collective` | 15.40 | −1.27 [−1.49, −1.05] | **BETTER** | −3.84 [−4.55, −3.14] | −3.68 [−4.11, −3.25] |
 * | `energy-aware` | 15.40 | −1.27 [−1.48, −1.06] | **BETTER** | −4.17 [−4.89, −3.45] | −1.51 [−1.78, −1.25] |
 * | `fairness-first` | 15.38 | −1.29 [−1.50, −1.08] | **BETTER** | −4.25 [−4.97, −3.53] | −1.87 [−2.14, −1.60] |
 * | `capacity-aware` | 15.39 | −1.28 [−1.49, −1.07] | **BETTER** | −4.23 [−4.95, −3.51] | −1.93 [−2.20, −1.65] |
 * | `predictive-balanced` | 16.44 | **−0.23 [−0.47, +0.02]** | **INDISTINGUISHABLE** — needs n ≈ 579 | −2.71 [−3.45, −1.97] | −2.01 [−2.43, −1.58] |
 * | `auction` | 15.41 | −1.26 [−1.47, −1.04] | **BETTER** | −4.19 [−4.92, −3.47] | −1.96 [−2.25, −1.68] |
 * | `auction-multi-round` | 15.42 | −1.25 [−1.47, −1.04] | **BETTER** | −4.17 [−4.90, −3.44] | −1.97 [−2.26, −1.69] |
 * | `zoned-uppeak` | **10.18** | **−6.49 [−6.91, −6.07]** | **BETTER** | **−11.24 [−12.03, −10.44]** | **−7.10 [−7.56, −6.64]** |
 *
 * One INDISTINGUISHABLE cell in 36. Reported as *below resolution at this budget*, with the budget it
 * would need (579 against the 500 spent) — **not** as a 1.4 % improvement. It is also, on WT95, still
 * `BETTER`: the same arm pulls the tail in by 2.71 s while leaving the mean where it was.
 *
 * `zoned-uppeak` −38.9 % on AWT here is the largest margin in the study, and it is a *parking* result
 * as much as a *zoning* one: the profile authors `zone-center` with a 2 s deadband, and § 4 measures
 * that strategy in isolation at −29.7 % on this same building.
 *
 * ## Secure Tower, up-peak 2 % — n = 150, baseline AWT 20.87 s
 *
 * | arm | AWT | d, 95 % paired-t | WT95 d | TTD d | verdict |
 * |---|---|---|---|---|---|
 * | `eta` | 15.12 | −5.76 [−6.53, −4.98] | −19.52 [−22.44, −16.60] | −7.19 [−8.26, −6.12] | **BETTER** ×4 |
 * | `collective` | 15.11 | −5.77 [−6.54, −4.99] | −19.52 [−22.44, −16.60] | −7.19 [−8.25, −6.12] | **BETTER** ×4 |
 * | `energy-aware` | 15.16 | −5.72 [−6.50, −4.93] | −19.51 [−22.43, −16.58] | −6.58 [−7.67, −5.48] | **BETTER** ×4 |
 * | `fairness-first` | 15.12 | −5.76 [−6.53, −4.98] | −19.52 [−22.44, −16.60] | −7.19 [−8.26, −6.12] | **BETTER** ×4 |
 * | `capacity-aware` | 15.30 | −5.57 [−6.37, −4.77] | −19.48 [−22.41, −16.54] | −7.12 [−8.20, −6.05] | **BETTER** ×4 |
 * | `predictive-balanced` | 16.88 | −3.99 [−4.80, −3.19] | −17.84 [−20.79, −14.89] | −6.41 [−7.59, −5.22] | **BETTER** ×4 |
 * | `auction` | 15.41 | −5.47 [−6.27, −4.66] | −19.45 [−22.39, −16.51] | −7.75 [−8.89, −6.60] | **BETTER** ×4 |
 * | `auction-multi-round` | 15.82 | −5.05 [−5.84, −4.26] | −19.05 [−21.98, −16.12] | **−8.55 [−9.73, −7.38]** | **BETTER** ×4 |
 * | `zoned-uppeak` | 22.72 | **+1.85 [+0.58, +3.12]** | **+7.24 [+3.44, +11.05]** | **+2.73 [+1.17, +4.30]** | **WORSE** ×4 |
 *
 * **One arm is WORSE than the baseline, on one building, on all four metrics**, and it is reported as
 * such rather than absorbed. `zoned-uppeak` still meets the criterion as literally written — it beats
 * `nearest-car` on the other two buildings by the largest margins in the study — and the loss is a
 * finding, not a defect. § 2 decomposes it.
 *
 * **A caveat that applies to this case and not to the other two.** Secure Tower declares its screened
 * lobby `G` as `isTransferFloor`, so a few of its journeys continue onto a second leg, and a
 * continuation leg begins waiting when the first leg's car put it down — a time the dispatcher
 * decides. At seed 20 260 726, 3 of 396 journeys are multi-leg and `conservation.transfers` is 0 under
 * `nearest-car` against 3 under `eta`, and the arms' predictor observation streams diverge. So a
 * paired difference here is a difference in dispatch **plus** whatever the divergent observation
 * stream did to the forecast. Midtown Office and Garden Apartments declare no transfer floor and carry
 * no such term; `core/src/sim/seam.test.ts` derives that partition from `building.transferFloors`
 * rather than from a list, so it cannot go stale.
 *
 * ---
 *
 * # 2. `zoned-uppeak`: best on two buildings, worst on the third, and the cause decomposes
 *
 * This section used to read *"three of the eight arms are the same dispatcher"* — `eta ≡
 * fairness-first ≡ zoned-uppeak` on the up-peak buildings, `rho = 1`, interval `[0, 0]`, every metric,
 * every replication — because `Simulation.#dispatchBank` passed `{ waitingPassengers, waitingMassKg }`
 * and no `zoneFloorIdsByCarId`, so `zoneAffinity` was 0 for every car and a single-term cost scaled by
 * 0.7 has `eta`'s argmin. That is over. Counted through the shipped engine on Midtown Office,
 * `zoneAffinity` went from **0 non-zero evaluations in 437 to 355 in 472**, with cross-car spread in
 * **142 of the profile's 144 decisions**, and `predictedDemand` from **0 in 7 057 to 7 435 in 7 435**.
 *
 * | case | bit-identical classes |
 * |---|---|
 * | Midtown Office | `eta` ≡ `fairness-first` |
 * | Garden Apartments (n = 500) | none |
 * | Secure Tower | `eta` ≡ `fairness-first` |
 *
 * `fairness-first ≡ eta` on the two up-peak cases survives and is **correct**: `starvation` is the age
 * of the oldest committed hall call this car would push back, no car at an up-peak lobby holds one, so
 * the term is 0 for every candidate and a term equal across candidates cannot move an argmin. A term
 * with no information must contribute no cost. It fires hard once two landings contend — § 5.
 *
 * **The regression is the cost term, not the parking strategy.** Holding everything else and setting
 * `weights.zoneAffinity` to 0 (seed 20 260 726, 60 replications, Secure Tower up-peak 2 %) runs the same
 * profile at **14.29 s against `eta`'s 15.37** — better than the field. With the weight restored it
 * runs at 23.78. So a
 * static contiguous partition prices a car for being outside a band on a building whose **access**
 * zoning already partitions the population differently, and the two disagree. The weight is left at the
 * hand-authored `0.3` rather than tuned down to make a gate pass; it is a dimension Phase 7 can now
 * actually search, which it could not when the term evaluated to zero.
 *
 * ---
 *
 * # 3. `predictive-balanced`: beats the baseline, loses to the simplest arm, survives the longest
 *
 * The most-configured profile in the library — ten weighted terms, deferred assignment, split demand,
 * adaptive dwell, reassignment on deceleration, predictive parking — is **significantly worse than
 * one-line `eta`** on mean wait, everywhere:
 *
 * | case | `predictive-balanced` − `eta`, AWT | `predictive-balanced` − `eta`, TTD |
 * |---|---|---|
 * | Midtown Office | **+3.00 [+2.59, +3.41]** | **−1.14 [−1.80, −0.48]** |
 * | Garden Apartments | **+1.05 [+0.94, +1.17]** | −0.15 [−0.48, +0.18] |
 * | Secure Tower | **+1.76 [+1.54, +1.98]** | +0.79 [+0.24, +1.34] |
 *
 * On Midtown it buys that with time-to-destination. That is a genuine Pareto trade and exactly what
 * docs/06 § *Do not scalarize too early* warns about: ten terms is not ten improvements, it is a
 * different point on a front.
 *
 * (It weights ten and not eleven because one of the eleven was decoration. It carried
 * `weights.rideTime: 0.3` while authoring no `dispatch.callType`, so it ran at the `up-down-buttons`
 * default where a landing call has no destination and `rideTimeTerm.activeWhen` declares the term
 * inert — 0 non-zero evaluations in 7 435 on Midtown, 0 in 56 on Garden. Dropping it is bit-identical,
 * because a saturating map sends a raw 0 to 0, so **no number in this report moved**;
 * `policies.test.ts` now refuses any profile that weights a term its own stage settings gate off.)
 *
 * And it has the study's most interesting property, one no interval can express. **At 4 % of population
 * per 5 minutes on Midtown Office it is the only profile in the library that does not saturate:**
 *
 * | load | `nearest-car` | `eta` | `auction` | `auction-multi-round` | `zoned-uppeak` | `capacity-aware` | `predictive-balanced` |
 * |---|---|---|---|---|---|---|---|
 * | 1 % | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
 * | 2 % | 7 | 1 | 0 | 1 | 0 | 0 | 0 |
 * | 3 % | 21 | 1 | 0 | 1 | 0 | 0 | 0 |
 * | 4 % | **52** | 8 | 7 | 7 | 3 | 1 | **0** |
 *
 * (saturated replications of 100.) The arm that loses to `eta` by 3 s at design load is the arm still
 * standing at four times it, and at 4 % every other arm's AWT has been suppressed so no ranking on the
 * mean exists. A benchmark that reported only AWT at one operating point would have called this profile
 * the study's weakest smart dispatcher. It is also its most robust one.
 *
 * ---
 *
 * # 4. Pre-positioning: the criterion is met by `zone-center`, and the *predictive* strategy is inert
 * at the settings it ships with — the deadband, not the forecast
 *
 * `prepositioning.ts` isolates stage 7 the only way that is valid — **one profile, one field changed**
 * — with `predictive-balanced` and `idle.parkingStrategy` as the sole difference, on Garden Apartments,
 * n = 500, CRN. A fifth arm changes a second field, `idle.repositionThresholdS`, and § below says why
 * that is sound rather than a confound.
 *
 * | strategy vs `stay` | AWT, 95 % paired-t | WT95 | % > 60 s | TTD | verdict on AWT |
 * |---|---|---|---|---|---|
 * | `zone-center` | **−4.88 [−5.27, −4.49]**, −29.7 % | −6.02 [−6.61, −5.43] | +0.02 [−0.04, +0.07] | −4.44 [−4.89, −3.99] | **BETTER** |
 * | `predicted-demand`, deadband 8 s as authored | `−0.006 [−0.021, +0.010]`, 497/500 differences exactly 0 | `0.00 [0.00, 0.00]` — **IDENTICAL**, 500/500 | `0.00 [0.00, 0.00]` — IDENTICAL | −0.01 [−0.02, +0.01] | **INDISTINGUISHABLE** |
 * | `predicted-demand`, deadband 3 s (**a retune**) | **−0.98 [−1.28, −0.68]**, −5.9 % | **−1.03 [−1.45, −0.62]** | +0.03 [−0.03, +0.09] | **−0.60 [−0.94, −0.26]** | **BETTER** |
 * | `lobby` | **+1.98 [+1.75, +2.20]**, +12.0 % | **+1.61 [+1.30, +1.93]** | +0.01 [−0.01, +0.04] | **+1.85 [+1.58, +2.11]** | **WORSE** |
 *
 * Baseline `stay`: AWT 16.45 s, WT95 27.42 s, % > 60 s 0.010, TTD 48.77 s. The % > 60 s column is
 * INDISTINGUISHABLE for every arm and is reported anyway: on a building whose baseline puts one leg in
 * ten thousand past a minute, that column has nothing to resolve, and saying so is the honest
 * alternative to omitting it.
 *
 * **The criterion is MET.** Both directions of the previous report's evidence have flipped: the
 * `predicted-demand` row used to be `0.00 [0.00, 0.00]` with 500 of 500 paired differences exactly
 * zero, and so did `zone-center`, because `Simulation.#park` built its `RepositionContext` from
 * `{ entranceFloorIds }` alone. A strategy with no forecast answers `no-forecast`, which is a refusal
 * to move and observationally identical to `stay`; a strategy with no partition computes the same shaft
 * median for every car. The runner resolves both now.
 *
 * **The deadband, not the forecast, is what withholds the gain from the shipped profile.**
 * `predictive-balanced` authors `idle.repositionThresholdS: 8`, from docs/06's worked example. That is
 * *seconds of expected response saved per future call*, and a six-floor residential shaft cannot
 * produce eight of them from any park — so the profile's own deadband vetoes almost every predictive
 * move and 497 of 500 replications come back bit-identical to `stay`. Re-measured for this report at seed 20 260 726 over 60
 * replications of this case's own operating point (residential 2 %, 3600 s, full-run), against
 * `stay`'s 16.46 s: `8` → 16.46 (indistinguishable from `stay`), `5` → 16.23, `3` → 16.03,
 * `2` → 15.54, `1` → 15.71 — the last one worse than `2`, which is a car churning inside a deadband
 * too small to hold it still. The profile is left as authored and the study measures both deadbands, because reporting only the tuned one
 * would be reporting a number nobody ships.
 *
 * **Why the extra arm is not a two-variable comparison.** It differs from the baseline in strategy
 * *and* deadband, and that is sound because `stay` returns `parked` before the reposition arithmetic
 * runs — `repositionThresholdS` cannot move it. The baseline at 8 s and the same profile at 3 s are the
 * same run, and `prepositioning.test.ts` asserts that rather than assuming it.
 *
 * **The mechanism is verified live, not inferred from the interval.** Instrumenting stage 7 through
 * `SimulationConfig.createPolicy` on this case's own operating point, 30 replications: the runner hands
 * `predicted-demand` a `demandForecast` on **35.40 of 35.40** reposition decisions per run, the
 * predictor is fed **14.43** arrivals per run, and the decision comes back `below-threshold`
 * **26.87** times and `reposition` **0.00** times. So the forecast arrives, the arithmetic runs, and
 * the profile's own deadband refuses every move. `zone-center` on the same profile and the same
 * deadband moves **5.93** times per run — the same 8 s that vetoes the forecast's target does not veto
 * the zone's, because a car's own zone edge is further from where it is standing than the forecast's
 * argmax usually is.
 *
 * **Full deadband sweep, n = 300, same operating point, against `stay`'s 16.31 s.** Every row is the
 * same profile with one field moved:
 *
 * | `repositionThresholdS` | AWT | d vs `stay`, 95 % paired-t | moves/run | `below-threshold`/run |
 * |---|---|---|---|---|
 * | **8 (as authored)** | 16.30 | **−0.006 [−0.031, +0.019]** | 0.01 | 27.50 |
 * | 6 | 16.28 | −0.021 [−0.087, +0.045] | 0.24 | 26.84 |
 * | 5 | 16.09 | **−0.217 [−0.378, −0.055]** | 0.97 | 24.79 |
 * | 4 | 15.88 | **−0.430 [−0.727, −0.133]** | 2.55 | 20.97 |
 * | 3 | 15.51 | **−0.792 [−1.182, −0.402]** | 4.59 | 15.61 |
 * | **2** | **15.20** | **−1.110 [−1.550, −0.670]** | 6.18 | 11.90 |
 * | 1 | 15.42 | −0.881 [−1.348, −0.414] | 6.89 | 9.95 |
 * | 0 | 15.68 | −0.623 [−1.138, −0.108] | 7.72 | 7.78 |
 *
 * The optimum is 2 s and the curve turns back up below it — a car churning inside a deadband too small
 * to hold it still. `zoned-uppeak` authors exactly 2.
 *
 * **And the inertness at 8 s is not a sparsity problem.** The obvious hypothesis — Garden generates
 * 14 arrivals an hour, so the forecast has nothing to learn from — is **wrong**, and the sweep that
 * refutes it is worth more than the one that would have confirmed it. At the authored deadband, against
 * `stay`, n = 300 per cell:
 *
 * | rate %pop/5min | arrivals/run | `stay` AWT | `predicted-demand` AWT | d, 95 % paired-t | moves/run |
 * |---|---|---|---|---|---|
 * | 2 (the criterion's point) | 16.2 | 16.31 | 16.30 | −0.006 [−0.031, +0.019] | 0.01 |
 * | 4 | 31.3 | 16.88 | 16.88 | **0.000 [0.000, 0.000]** — 300/300 identical | 0.00 |
 * | 8 | 62.7 | 17.58 | 17.57 | −0.014 [−0.035, +0.006] | 0.05 |
 * | 16 | 124.1 | 21.32 | 21.31 | −0.010 [−0.030, +0.010] | 0.01 |
 *
 * Eight times the demand does not move it. The 8 s deadband is a property of the *shaft* — six floors
 * of jerk-limited travel cannot produce eight seconds of expected saving from any park — so no amount
 * of forecast quality reaches it. That is a finding about the tunable, not about the predictor.
 *
 * **The whole predictor apparatus, priced.** `predictive-balanced` run with a forecast against the same
 * profile run with `createPredictor: () => undefined` — the exact pre-wiring condition — on Garden at
 * 2 %, n = 300: **−0.007 s [−0.032, +0.018]**, 296 of 300 replications bit-identical. On this building,
 * at this profile's authored settings, the forecast the phase built is worth nothing measurable. The
 * deadband is why, and the sweep above is what proves it.
 *
 * **`lobby` is still WORSE, and that is still the sharper half of the roadmap's second clause.** The
 * clause *"where parking policy dominates"* is true: parking moves AWT by 12 % of the baseline in the
 * wrong direction. Lobby parking is the up-peak instinct — demand originates at the entrance, so wait
 * there. On a sparse residential building demand originates upstairs, and a car held at the ground floor
 * pays its whole climb on every call. `stay`, which is what `DISPATCH_DEFAULTS` already does, beats it
 * on AWT, WT95 and TTD simultaneously.
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
 * | 2 % | **−0.26 [−0.45, −0.08]** | **−1.65 [−2.55, −0.76]** | **−2.05 [−2.98, −1.11]** | **−0.54 [−0.82, −0.27]** | **yes; all significant** |
 * | 3 % | −1.10 [−1.58, −0.62] | −7.79 [−10.01, −5.57] | −9.65 [−12.17, −7.13] | −1.71 [−2.29, −1.14] | no: `eta` itself saturates |
 *
 * **The 2 % row is the phase's one clean demonstration that a tail term does what tail terms are for.**
 * The mean moves 1.30 %; WT95 moves 4.02 %; WT99 moves 4.46 %. The effect *grows as you move out of the
 * distribution*, which is precisely the signature that distinguishes a fairness term from a slightly
 * better `waitTime`.
 *
 * **The same study now also prices `zoneAffinity`, and it prices it as a liability here.**
 * `zoned-uppeak` − `eta` at 1 % is `+9.85 [+8.03, +11.68]` on WT95 and `+1.96 [+1.36, +2.55]` on
 * % > 60 s, growing to `+31.4` and `+11.9` at 3 %. A contiguous partition on a two-entrance building
 * refuses cross-band pickups the argmin would have taken, and the passengers it refuses are exactly the
 * ones that populate the tail. Together with the Secure Tower WORSE cell this is now the study's
 * clearest statement about operational zoning: **it is a mean-versus-tail trade, and its sign depends
 * on whether the building's own zoning agrees with the partition.**
 *
 * **And the window in which any of it can be said is one load step wide.** Swept at n = 250, saturated
 * replications: `nearest-car` 2 / 29 / 108 at 1 / 2 / 3 %, `eta` 0 / 0 / 2, `fairness-first` 0 / 0 / 0,
 * `capacity-aware` 0 / 0 / 0, `zoned-uppeak` 0 / 1 / 5. So:
 *
 * > **The load at which the tail terms earn their weights is past the load at which `nearest-car` stops
 * > being measurable.** The criterion can only be argued in the regime where the interesting terms are
 * > inert; the regime where they work has no baseline to compare against. `nearest-car` does not merely
 * > lose at 3 % — its queues diverge on 43 % of replications.
 *
 * `capacity-aware` falls in the gap and the honest verdict is **INDISTINGUISHABLE from `eta` at every
 * load where all arms are quotable together** (2 %: AWT `−0.19 [−0.48, +0.10]`, WT95
 * `−0.92 [−1.91, +0.07]`; it would need n ≈ 556). Its `loadFactor` and `crowding` weights need cars near
 * their bypass threshold to have anything to price, and by that load something has diverged. One more
 * thing the census shows and no interval can: at 3 % `fairness-first` saturates **0** of 250 where `eta`
 * saturates 2. The fairness term buys robustness as well as tail, and robustness has no confidence
 * interval.
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
 * A first response of exactly one bucket width is the signature of an estimator that folds **completed
 * buckets only**: the shift lands inside `[1800, 2100)`, which cannot contribute to any estimate until
 * it closes, and at 2100 it does — `forecast(6)` jumps 2.49 → 13.82 while `forecast(2)` falls
 * 35.58 → 25.73. The *ranking* needs a second bucket for the moving average to decay the old floor far
 * enough to be overtaken. **The forecast lags its own cause by precisely the amount the design says it
 * must, and leads it by nothing.** No sample anywhere prefers a floor no arrival has occurred at.
 *
 * **And the same question, asked of the runner rather than the model.** The shift study is the sharper
 * test of the estimator and the weaker test of the *run loop*, because the run loop is what decides
 * which arrivals the model hears about and when: a runner that observed a passenger at
 * trace-generation time instead of at `arrivedAt` would give a perfectly causal model a perfectly
 * clairvoyant input, and every row above would still pass. `auditForecastCausalityInRun` closes that
 * half by driving 100 real replications of Midtown Office under mixed traffic, intercepting the
 * predictor through `SimulationConfig.createPredictor`, and scoring every forecast the run actually
 * served against the run's own trace:
 *
 * | measurement | result |
 * |---|---|
 * | observations fed / forecasts served | 11 891 / 34 422 |
 * | queries whose `fromT` preceded the newest observation | **0** |
 * | `max(lastObservedAt − queryTime)` over every query | **0.000 s** |
 * | corr(forecast, arrivals in the **preceding** 300 s) | 0.614 |
 * | corr(forecast, arrivals in the **following** 300 s) | 0.324 |
 * | **partial corr(forecast, following 300 s, given every arrival so far)** | **−0.0139 [−0.0317, +0.0038]** |
 *
 * The last row is the one that would catch a leak no import graph would. A causal forecast is a
 * function of the observed past, so once the past is partialled out nothing about the future may
 * remain — and nothing does. The forecast tracks what has already happened twice as closely as what is
 * about to.
 *
 * (That interval is over **replications**. The first version of this audit pooled all 34 422 queries as
 * if independent, producing a half-width about three times too narrow that disagreed with itself
 * between budgets — `+0.022 ± 0.011` at n = 12 against `−0.008 ± 0.008` at n = 25. Queries seconds
 * apart in one run see nearly the same floor counts. Batched to one number per replication the answer
 * is stable at n = 12, 25, 50 and 100 and contains zero at all four.)
 *
 * The same property is enforced in the run loop rather than only in this study: observations are taken
 * in `Simulation.#admit` at the passenger's own `arrivedAt`, the read path throws for a query earlier
 * than the last observation, and `Simulation.predictors` exposes the model as `DemandForecastSource`
 * so no caller can `observe` something the simulation never saw.
 *
 * The lag is also a *cost*, and worth stating as one: **600 s to re-rank is two thirds of a 900 s
 * replication.** A demand pattern that changes inside a replication is one this predictor will still be
 * catching up with when the measurement window closes. That bounds what pre-positioning can be worth —
 * and § 4 shows the bound is not what binds today; the deadband is — and it is why
 * `predictorLearningRate` defaults to a deliberately fast 0.3 rather than a textbook 0.05.
 *
 * ---
 *
 * # 7. The auction: sealed-bid is the central scorer; multi-round costs wait and buys journey
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
 * | does multi-round *beat* sealed-bid on AWT? | **no — it costs wait time and buys time-to-destination** |
 *
 * That last row is the one that used to read **UNMEASURED, and unmeasurable today**, because
 * `SimulationConfig` had no way to select an aggregation and both arms had to be built from one profile
 * through an options object. `config/schema.ts` carries an `auction` section now,
 * `dispatch/policies/registry.ts` maps `auction.aggregation` to a policy factory, and
 * `data/dispatcher-profiles.json` ships `auction` and `auction-multi-round` differing in that section
 * **and in nothing else** — so a paired-t interval between them is an interval on the aggregation, and
 * both are ordinary arms of the table in § 1. Measured, `auction-multi-round` − `auction`:
 *
 * | case | AWT | WT95 | TTD |
 * |---|---|---|---|
 * | Midtown Office | **+1.43 [+1.11, +1.76]** | **+1.48 [+1.10, +1.85]** | **−2.59 [−3.06, −2.12]** |
 * | Garden Apartments | +0.01 [−0.01, +0.02] | +0.02 [−0.02, +0.07] | −0.01 [−0.02, +0.01] |
 * | Secure Tower | **+0.42 [+0.26, +0.57]** | **+0.40 [+0.16, +0.64]** | **−0.81 [−1.08, −0.53]** |
 *
 * Two lower bounds in that table read `+1.11` and `+0.27` until 2026-07-27. Both were **double
 * roundings** — `1.104865` and `0.264903` taken to three places and then to two — and both are
 * wrong under either quantile, so the T2 t/z switch could not have surfaced them. Of the 18 bounds
 * in this table they are the only two where rounding twice differs from rounding once, which is
 * how the cause was identified rather than guessed. `published.ts` now re-derives every one of
 * them from the estimate.
 *
 * **The architecture answer, in the terms docs/01 asked it in.** Decentralizing the argmin buys
 * nothing: moving the computation into the cars changes who computes it, not what it computes, and the
 * equivalence is exact rather than approximate. Whatever value agent autonomy has must come from a car
 * doing something a central scorer *cannot express* — and the contract net's reserve price is exactly
 * that, a car refusing work the group's own objective says it should take. It does something
 * measurable, and what it does is a **trade rather than a win**: on the two up-peak buildings it raises
 * mean wait by 1.4 s and 0.4 s and lowers time-to-destination by 2.6 s and 0.8 s, and on the sparse
 * residential building it does nothing at all, because a car with two floors of slack never hits its
 * reserve. A dispatcher that refuses work on its own passengers' behalf protects the people already
 * aboard, at the expense of the people on the landing. That is a legible policy position, and it is not
 * the same policy as the argmin.
 *
 * One corollary worth stating because it saves a wasted experiment: since sealed-bid *is* the central
 * argmin, the `auction` row of the main table already is the sealed-bid arm. Running a "sealed-bid
 * benchmark" separately would be measuring one dispatcher twice.
 *
 * ---
 *
 * # 8. Capacity-driven reassignment: reachable, swept, and inert wherever a mean may be quoted
 *
 * docs/05-roadmap.md § Phase 5 lists *"capacity-aware reassignment when a car crosses the bypass
 * threshold"* as scope, and docs/01 names it as the second of the three reasons a pure
 * agent-per-elevator model fails. `capacityReassignment.ts` measures it the same way § 4 measures
 * stage 7 — **one profile, one field changed**: `capacity-aware` against itself with
 * `dispatch.reassignmentPolicy: never`, Midtown Office up-peak, n = 60 per cell under CRN.
 *
 * | load %pop/5min | crossings/run | **load-crossing migrations/run** | held/run | fire rate | AWT quotable on both? | d AWT (stage 5 on − off) |
 * |---|---|---|---|---|---|---|
 * | 1 | 0.00 | **0.00** | 0.00 | n/a | yes | `0.0000 [0.0000, 0.0000]` — 60/60 bit-identical |
 * | 2 | 0.55 | **0.00** | 0.27 | 0.0 % | no (control saturates 1/60) | suppressed |
 * | 3 | 2.77 | **0.00** | 2.07 | 0.0 % | **yes** | −0.520 [−1.039, +0.000] — **INDISTINGUISHABLE** |
 * | 4 | 6.07 | **0.00** | 5.00 | 0.0 % | no (control saturates 2/60) | suppressed |
 * | 8 | 19.27 | 0.15 | 16.85 | 0.8 % | no — 56/60 diverge | suppressed |
 * | 16 | 40.98 | 1.18 | 34.20 | 2.9 % | no — 60/60 diverge | suppressed |
 *
 * **The trigger fires on 0 % of load crossings at every load where an interval may be quoted.** It is
 * reached, and the counters prove it rather than a symbol search: `capacityCrossings` climbs from 0 to
 * 41 per run and `capacityHeld` shows the monitor examining 5 to 34 calls per run, so a migration count
 * of zero here means *the policy kept the call*, not *the call site is missing* — which is precisely
 * the distinction the phase lost four behaviours to. The first load at which it migrates anything is
 * 8 %, where 56 of 60 replications have a diverging queue.
 *
 * **The −0.52 s at 3 % is reassignment, it is not significant at n = 60, and none of it is the
 * capacity trigger.** The paired-t interval contains zero — by 0.0002 s on the upper bound, which is
 * a reason to report it as unresolved rather than as a near miss. (It read `[−1.029, −0.010]` while
 * published intervals used a normal quantile past n = 25; review finding #14 put them back on
 * Student-t, and this is the one cell in the study whose verdict that moved. The budget cannot be
 * raised: the control saturates at 4 %.) Switching
 * `reassignmentPolicy` gates *all* of stage 5, so that interval is an interval on reassignment as a
 * whole. Counted through the shipped engine at that load, the treatment arm swaps a call from one car
 * to another **0.017 times per run** and widens an already-assigned landing across a second car under
 * `split-demand` **0.367 times per run** (at 4 %: 0.100 and 1.550); the control does neither, because
 * `never` short-circuits the gate before scoring. So what stage 5 is worth on this building at this
 * load is *`split-demand` reaching a call that was already assigned* — not capacity-driven bypass.
 *
 * **One thing this measurement corrects about the project's own tests.** `core/src/sim/seam.test.ts`
 * asserts `capacityMigrations > 0` for `capacity-aware` at the traffic profile's default demand, and it
 * is right to: it is a wiring guard and the mechanism must be reachable. But measured at that operating
 * point, migrations run at 10.98 per run (22.4 % of crossings) with AWT at **788 s** and 60 of 60
 * replications diverging. The assertion is a proof of connection and must not be read as evidence that
 * the mechanism pays. `capacityReassignment.test.ts` states both halves.
 *
 * This is the same shape as § 5's tail terms, and it is now the phase's second instance of it: **the
 * load at which the interesting mechanism engages is past the load at which any mean may be reported.**
 *
 * ---
 *
 * # 9. What this gate did not do
 *
 * - **No weight was tuned.** Every arm is the profile `data/dispatcher-profiles.json` ships.
 *   `zoned-uppeak`'s `zoneAffinity: 0.3` is left where it was hand-authored, including on the building
 *   where it makes the arm lose.
 * - **No tolerance was loosened.** Every interval is paired-t at 95 %, the level a published interval is
 *   quoted at. Every operating point is the *highest* load at which the criterion can be argued at all,
 *   chosen by the saturation rule and not by the answer it produced.
 * - **No losing arm was dropped.** `dispatcherBenchmark.test.ts` asserts that the arm list is exactly
 *   the shipped profile set, so a profile added to `data/` and not to `ARM_PROFILES` fails the gate.
 *   The one WORSE arm is named in an assertion, with the case it loses on.
 * - **No point estimate was reported as a win.** The single INDISTINGUISHABLE cell is reported with the
 *   `n` it would need, computed from its own observed `s_D`, and the `predicted-demand` arm at its
 *   authored deadband is reported the same way even though a tighter deadband clears the criterion.
 * - **No criterion was weakened to make the phase pass.** The second criterion was reported NOT MET for
 *   as long as it was not met, with the strongest available evidence — 500 of 500 paired differences of
 *   exactly zero — and the fix was made in `core/sim/`, not here.
 *
 * # 10. What the next phase should take from this
 *
 * 1. **`nearest-car` is too weak a baseline to separate anything.** It loses by 28–36 % on the up-peak
 *   buildings, is the profile that binds every budget in the study, and is unquotable at every load
 *   where the interesting terms actually fire. Phase 6's criterion says *beats the naive baselines*; it
 *   should say *beats `eta`*, which is the arm that actually has to be beaten and which stays quotable
 *   one whole load step further up.
 * 2. **Two dimensions are newly worth searching, and one of them is newly dangerous.** `zoneAffinity`
 *   and `predictedDemand` price something in every real run now, so Phase 7's optimizer will get a
 *   non-constant objective on both. `weights.zoneAffinity` is the one to search first: at its
 *   hand-authored `0.3` it is the best arm on two buildings and the worst on the third, which is the
 *   signature of a weight that wants to be **per traffic pattern and per building** rather than global.
 * 3. **The tail is where the differences live, and the window to see them is one load step wide.**
 *   `fairness-first` is bit-identical to `eta` at the criterion's operating point and worth `−1.66 s` of
 *   WT95 one step up; `capacity-aware` needs a step beyond that, by which point some arm has always
 *   saturated. Tune and report per traffic pattern, as docs/06 says — and pick the operating point
 *   *before* looking at the answer, because these terms are all-or-nothing across a very narrow band of
 *   load.
 * 4. **Budget by the baseline's saturation, not by patience.** On Midtown Office no experiment at this
 *   operating point may exceed n = 287, whatever precision it wants.
 * 5. **A deadband can hide a working mechanism as completely as a missing call site.**
 *   `predicted-demand` read as *exactly zero effect* for two different reasons in succession — first no
 *   forecast, then a deadband the building could not pay. The first was a defect and the second is a
 *   tunable, and only a study that measured both could tell them apart. `idle.repositionThresholdS` is
 *   the single highest-value thing Phase 7 can search on this building: the sweep in § 4 moves AWT by
 *   1.11 s across the declared range and has an interior optimum at 2 s, so it is a real dimension with
 *   a real curve rather than a monotone knob.
 * 6. **Two of Phase 5's mechanisms only engage above the load where a mean may be reported**, and they
 *   are not the same two the phase expected. The tail terms (§ 5) need one load step past
 *   `nearest-car`'s divergence; the capacity trigger (§ 8) needs *four*, and fires on 0 % of load
 *   crossings everywhere below that. Phase 6 should either accept that these are argued from
 *   percentile and robustness statistics rather than from AWT, or find an operating point — a longer
 *   horizon, a bigger building, a lower-capacity car — where the queues stay stable while the cars
 *   still fill. Do not resolve it by relaxing the saturation rule.
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
  auditForecastCausalityInRun,
  measurePredictorLag,
} from './predictorLag.js';

export type {
  ForecastCausalityAudit,
  ForecastCausalityOptions,
  ForecastSample,
  PredictorLagStudy,
} from './predictorLag.js';

/* -------------------------------------------------------------------------- *
 * Stage 5's load-driven trigger — how often it fires, and what it is worth
 * -------------------------------------------------------------------------- */

export {
  STAGE5_BUILDING,
  STAGE5_LOADS,
  STAGE5_PROFILE,
  formatCapacityReassignment,
  runCapacityReassignmentStudy,
  stage5Traffic,
  withoutReassignment,
} from './capacityReassignment.js';

export type {
  Stage5Cell,
  Stage5Options,
  Stage5Row,
  Stage5Study,
} from './capacityReassignment.js';

/* -------------------------------------------------------------------------- *
 * The architecture question
 * -------------------------------------------------------------------------- */

export {
  AUCTION_PROFILE,
  CONTRACT_NET,
  ENSEMBLE_BUILDINGS,
  ENSEMBLE_SEED,
  measureAuctionAggregation,
  measureMultiRoundReachability,
  requireAuctionProfile,
} from './auctionAggregation.js';

export type {
  AuctionEnsembleOptions,
  AuctionEnsembleResult,
  DecisionOutcome,
  DecisionState,
} from './auctionAggregation.js';
