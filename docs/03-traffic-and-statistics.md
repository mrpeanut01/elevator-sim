# Traffic Modeling and Statistical Methodology

This is the doc that protects the project from reporting nonsense. Read it before touching
the experiment runner.

## Part 1: Traffic demand

### Demand targets by building type

| Building type | Governing peak | Arrival rate (% pop / 5 min) | Target interval | Target avg wait |
|---|---|---|---|---|
| Prestige office | Up-peak (morning) | 15–17% | ≤ 25 s | ≤ 20 s |
| Standard office | Up-peak | 11–15% | ≤ 30 s | ≤ 25 s |
| Residential | Down-peak AM, up-peak PM | 3–7% | 50–90 s | 40–70 s |
| Hotel | Two-way (lunch, evening) | 10–15% | ≤ 40 s | ≤ 35 s |
| Mixed-use high-rise | Per-zone, overlapping | varies by zone | per zone | per zone |

Mixed-use is where a smart dispatcher earns its keep: office down-peak and residential
up-peak overlap around 18:00 and compete for the same shuttle capacity.

### Arrival process

Passengers arrive as a **Poisson batch arrival process** — not one at a time. Groups
travel together (colleagues, families, tour groups), and batching materially changes
loading and stop patterns. Batch size distribution is a per-building-type parameter.

### Demand templates

Two established shapes:

- **Constant demand** (draft ISO 8100-32): steady rate for the whole run
- **Rise-and-fall template** (CIBSE Guide D): demand ramps up to a peak and back down,
  with results reported for the peak 5 minutes

Use the **rise-and-fall template**. Rationale in Part 3 — the constant-demand approach is
incompatible with confidence intervals for our purposes.

## Part 2: The analytical baseline

The closed-form round-trip-time calculation (Barney / CIBSE Guide D). **Implement this as
a test oracle.** If the simulator's numbers diverge wildly from the closed form under pure
up-peak, there is a bug. It is the best free validation available.

```
RTT = 2·(H·tv + tx) + (S+1)·ts + 2·P·tp  round trip time
S   = N·(1 − ((N−1)/N)^P)                expected stops among N floors
H   = N − Σ_{i=1..N−1} (i/N)^P           expected highest reversal floor
INT = RTT / L                            interval, L = cars in group
HC5 = 300·P·L / RTT = 300·P / INT        persons handled per 5 minutes, whole group
%POP = HC5 / population × 100            handling capacity as % of population
```

**The `tx` term is not optional, and this block omitted it.** `roundTripTime()`
computes `2·(H·tv + tx)` and `deriveUpPeakTerms` derives `tx` from real floor heights for *every*
zoned bank — Secure Tower's high bank runs ~60 m of express, worth ~14 s each way and about **20 %
of its round trip**. Hand-checking a zoned bank against the expression this document published
therefore disagreed with the code by tens of seconds of RTT. `tx` is zero only for a bank whose
served zone starts at the terminal, which is the unzoned case the textbook form assumes.

The `H` line was missing too, while `highestReversalFloor`'s docstring asserted *"that is the
expression stated in `docs/03-traffic-and-statistics.md` Part 2"* — of a formula this document did
not contain. Both are [review finding #16](08-review-findings.md), and both are now checked rather
than trusted: `packages/core/src/analytical/docFormula.test.ts` parses this fenced block and
evaluates it against `roundTripTime()` on a bank with a non-zero `expressJumpS`.

| Term | Meaning |
|---|---|
| `H` | Highest reversal floor — `N − Σ_{i=1..N−1} (i/N)^P`, exact for uniform destinations |
| `N` | Number of floors served above the lobby |
| `tv` | Single-floor transit time at rated speed |
| `tx` | **Express-jump time** — the one-way run from the terminal to the bottom of the served zone. Zero for an unzoned bank, ~14 s for Secure Tower's high bank |
| `ts` | Time lost per stop (doors, start delay, leveling) |
| `tp` | Passenger transfer time |
| `P` | Passengers per trip — **use 80% of rated capacity** |
| `L` | Number of cars in the group |

`HC5` is the **group** figure: `L` cars each complete `300/RTT` round trips in the window
and carry `P` people on each. Dropping `L` gives the per-car figure, which is what `%POP`
must not be measured with — on Midtown Office that reads 1.50% of population per 5 minutes
against the 11–15% office target above, instead of the correct 6.01%. CIBSE Guide D and
Barney both write it as `UPPHC = 300·P / INT`.

## Part 3: Statistical methodology

### Why this matters more than it sounds

Elevator peaks are **terminating** simulations — a bounded window with a start and end.
The failure mode that will bite this project is documented in the literature:
**counterintuitive results, such as increasing lift speed increasing average waiting
time**, because the true improvement is smaller than the statistical noise.

Peters & Abbi ran 1000 replications on a 4-lift up-peak with 600 people:

| Measurement | Value |
|---|---|
| Individual run AWT range | **4.1 s – 7.4 s** (nearly 2×) |
| Mean after 15 runs | **5.6 s** |
| Mean converged over runs 500–1000 | **~5.0 s** |

CIBSE's recommended ~10 runs would have reported ~5.6 s against a converged ~5.0 s — a
**12% error**, comfortably larger than the gap between two decent dispatch algorithms.

**Budget 50–200 replications per configuration, not 10.**

### Where the "measured" numbers in this doc come from

Everything below labelled **measured** was produced by the Phase 3 acceptance gate
(`packages/experiments/src/validation/`) against the real `data/` directory and the real
simulator, at one fixed operating point:

| | |
|---|---|
| Building | Midtown Office; `eta` = `{waitTime: 1}`, `nearest-car` = `{distanceTravelled: 1}` |
| Traffic | pure up-peak, all incoming through the main entrance, 900 s horizon, peak 300 s reported |
| Arrival rate | **1% of population per 5 minutes** |
| Replications | n = 100 per cell, fixed rather than adaptive, so a measured variance is a variance over a known `n` |
| Interval | 95% paired-t for a published comparison; 90% for the stopping rule |

The **1%** needs saying out loud, because Part 1 targets 11–15% for an office. A cell's AWT
interval is suppressed if *any* replication saturated, and at n = 100 that is a demanding
test — at 2% this building's `eta` already saturates one replication in a hundred. 1% is the
rate at which both dispatchers come back 0/100 saturated, so the gate quotes only statistics
these rules permit quoting. That is an *operating point*, not a loosened tolerance, but the
consequence is real: the numbers below are measured in a **lightly loaded** regime. Treat the
ratios and the method as transferable; re-measure the absolute waits at whatever rate a study
actually uses.

### Measured: the replication budget is a function of the target precision, not a constant

50–200 is sound, but it is not a property of the simulator — it is a property of the
precision you ask for. A 400-replication reference sample of `eta` on Midtown up-peak:

| | |
|---|---|
| Mean AWT | 15.80 s |
| Sample sd | 3.60 s |
| Coefficient of variation | **23%** |

From that `s`, the replications a 90% interval on the mean requires:

| Target half-width | as % of AWT | Required n |
|---|---|---|
| ±2 s | 12.7% | **11** |
| ±1 s | 6.3% | 37 |
| ±0.8 s | 5.1% | 57 |
| ±0.5 s | 3.2% | 143 |
| ±0.4 s | 2.5% | 222 |
| ±0.25 s | 1.6% | 563 |

> **This table used to be the deleted normal quantile's answer.** It read
> **9 / 36 / 55 / 141 / 220 / 563**, and five of those six rows reproduce exactly at `z = 1.6449`
> rather than at `t[n−1]` — which this simulator uses at **every** `n` (§ Sequential stopping rule,
> and `DECISIONS.md` § D14). Since `t` is strictly wider than `z`, the old table **understated the
> budget at every rung**, which is the optimistic direction. Corrected by re-deriving each row from
> `studentTQuantile` at 90 % two-sided against the same `s = 3.60 s`. **No conclusion in this
> document changes** — the band is still ±0.5 s to ±0.8 s and the ±2 s row is still small enough to
> be the point being made. Raised as **C19** by Phase 8's oracle track, and missed by the wave-1
> blast-radius scan because that scan covered *published intervals* and this is a *planning* table.

So **50–200 replications corresponds to a ±0.5 s to ±0.8 s target** on this configuration —
and this doc's own worked example of ±2 s at 90% is satisfied at **n = 11** by projection, with
the sequential rule's unconstrained crossing landing at **n = 10** (measured 2026-07-28: the rule
crosses at n = 10, `rule-satisfied`, half-width 1.876 s, mean 16.780 s, s = 3.237 s; unchanged by
D14, because that run's own sample sd is smaller than the 3.60 s reference this table projects
from). Ten is precisely the run count the section above calls a 12% error. The two pieces of
guidance were in tension because the worked target was far looser than the accuracy the budget
exists to buy.

Both survive, for different jobs:

- **±2 s at n ≈ 10 is fine for a loose absolute estimate** of a single configuration.
- **It is not fine for a comparison.** Peters & Abbi's 12% error is exactly the reason: ten
  runs misplace the mean by more than the gap between two decent dispatchers. Keep the
  50-replication floor for anything that will be compared against anything else.

The runner is already built this way: `RUNNER_DEFAULTS.minReplications` is 50 and the stopping
rule is not consulted below it, so the policy floor dominates and a default sweep spends
50–200 replications whatever the rule computes. **State the target precision, then let the
rule pick `n`** — do not quote a flat run count.

> **Which of the two this repository actually does, measured 2026-07-28.** It states the target and
> derives `n` — but **offline, not sequentially.** `benchmark/matrix.ts`'s `budgetFor` inverts
> `n ≥ (z · sd / h)²` at `h = 1 s` against a 200-replication census and clamps to [50, 200], and
> that is where the matrix's per-cell budgets come from. **No shipped study injects a stopping
> rule**, and the omission is deliberate rather than pending: a rule stops *cells*
> (`replicationRunner.ts`'s `CellState`), so the two arms of a paired comparison would stop at
> different `n` and the shorter arm — chosen by its own realized variance — would decide how many
> pairs survive. That is selection on the outcome variable. The rule remains correct for
> **single-cell** precision-targeted estimation, of which this repository ships none; the port is
> exempted on that ground in [`DECISIONS.md` § D125](../DECISIONS.md). Read the instruction above as
> *state the target* — not as a claim that anything here stops sequentially.

### AWT is lognormal, but approximate it as normal

Average waiting time can never be ≤ 0 and has a long right tail, making it lognormal.
Peters & Abbi tested Cox's method for proper lognormal confidence intervals and
**rejected it**: at 1000 runs and 95% confidence, a 5 s mean produced bounds of
**0.7 s to 36.1 s**. Useless in practice.

The working answer is to approximate as normal for the mean. D'Agostino normality tests
come out borderline either way, and the approximation is defensible and standard.

### The independence condition

Confidence-interval math requires each replication's AWT to be independent of every other.
Waiting times *within* a single run are correlated.

**Therefore you cannot put a confidence interval on one long constant-demand run.** You
need many independent replications, each with an independently generated passenger set.
This is why the rise-and-fall template approach wins.

### Sequential stopping rule

Rather than a fixed run count, let the user specify an **acceptable range** (e.g. ±2 s)
and a **confidence level** (e.g. 90%), then run until satisfied:

```
after each replication n:
    halfWidth = t[n-1, conf] * (s / sqrt(n))     # every n — no crossover
    if halfWidth < acceptableRange: stop and report mean
```

**This simulator uses Student-t at every `n`, in the stopping rule as well as in the published
interval.** The textbook `t` (n ≤ 25) / `z` (n > 25) crossover, which this section previously wrote
as the rule, describes the literature and **not** this repository. It was removed on 2026-07-27:

- `estimateMean` — and therefore `pairedDifferenceEstimate`, and therefore every interval this
  project prints — was switching to the normal quantile above n = 25 while the CLI labelled the
  result "the paired-t interval". At n = 26 that is `z = 1.9600` where `t(25) = 2.0595`: the
  half-width is 4.83 % too small and a nominal 95 % interval has **93.88 %** actual coverage. Three
  of 148 real paired comparisons in a sweep at n = 26 flipped from EXCLUDES-ZERO to contains-zero.
  [Review finding #14](08-review-findings.md).
- The crossover survived in one function, `halfWidthQuantile`, whose docstring named two callers it
  did not have. Nothing injected it; `validation/harness.ts` had already been building the
  production stopping rule out of `estimateMean`. The symbol is **deleted**, and the stopping rule is
  t-always by decision rather than by accident. The alternative — injecting a crossover estimator so
  the loop control ran a narrower quantile than the report — would let a cell stop while its own
  convergence report said IN PROGRESS: two numbers for the same quantity, which is finding #14's
  failure mode one layer down. [`DECISIONS.md` § D14](../DECISIONS.md).

**No replication count changed** as a result, in the suite or anywhere else. The t quantile is
strictly wider than z, so the effect on the loop control is to stop *later*, which is the
conservative direction: a rule that stops too early publishes a number it did not earn.

Quantiles by confidence level. `z` is the `n → ∞` limit and is quoted for reference only — nothing in
this repository uses it to build a published interval:

| Confidence | 70% | 80% | 90% | 95% | 99% |
|---|---|---|---|---|---|
| z (limit) | 1.04 | 1.28 | 1.65 | 1.96 | 2.58 |

| n | 26 | 30 | 50 | 100 | 200 | 500 |
|---|---|---|---|---|---|---|
| t(n−1, .975) | 2.0595 | 2.0452 | 2.0096 | 1.9842 | 1.9720 | 1.9647 |
| half-width vs z | +5.08 % | +4.35 % | +2.53 % | +1.24 % | +0.61 % | +0.24 % |

### Saturation detection — and the three other grounds for suppressing an AWT

If demand exceeds handling capacity, queues grow without bound and AWT is not remotely
normal. The literature's position is that an accurate AWT is unnecessary because the
configuration fails anyway — but **the simulator must detect saturation and flag it**
rather than reporting a meaningless mean.

Saturation detection: test for a positive trend in queue length across the run. If present, mark the
result `SATURATED` and suppress the AWT confidence interval.

**But the trend test is not the only ground, and this section used to say it was.** `RunSummary`
carries `awtIsValid` with **four** grounds, evaluated in the order below. A run tripping more than
one reports the most fundamental reason, so adding a ground never changes an existing message.

| # | ground | the shape it sees |
|---|---|---|
| 1 | **trend** — `SaturationDiagnosis.saturated` | a queue that never clears and is **still growing** at the horizon |
| 2 | **emptiness** — no leg boarded in the window | there is no waiting time to average |
| 3 | **censoring** — unserved fraction over `DEFAULT_MAX_UNSERVED_FRACTION` | a queue that has not cleared **by** the horizon, so the people in it are unserved legs. AWT is then the mean over the legs that boarded, who are systematically the passengers who waited *least* |
| 4 | **starvation** — a leg past the 900 s abandonment horizon | a queue that grew enormously and then **drained just in time** |

Grounds 1 and 3 are both proxies for one question — *did the backlog clear?* — detected in two
specific shapes, and **neither sees the third shape**. Ground 4 was added on 2026-07-27 after Phase
8's fuzz campaign produced a run that escaped both, and the case is worth stating because the
failure is precisely the one this whole document exists to prevent.

> **`fuzz-1001074`, and why it published.** A fifteen-floor, single-bank, two-car building, 177 legs,
> **0 undelivered**, run status `completed`. Mean wait **172.1 s**, median 101.8 s, p90 450.5 s,
> **p95 686.4 s**, p99 897.5 s, **max 922.7 s**, and **67.8 % of legs waited over 60 s** — with
> `awtIsValid` reporting **true**. It escaped the trend gate because a hump fits a shallow line with
> large residuals (growth-to-noise 1.32 against a gate of 4 — the *false negative* twin of the false
> positive the thresholds already document) and the censoring gate because everybody was eventually
> collected, 177 of 177. Little's Law says the simulator was right about all of it:
> `λ·W = 0.1235 × 172.07 = 21.2` against a measured mean queue of **20.8**. The model was internally
> consistent; **what was wrong was the report.** That the run *recovered just in time* is exactly
> what let it publish, and the passengers in the backlog absorbed the whole cost — "statistics
> improve as the bug gets worse", which is the failure mode
> [`CLAUDE.md`](../CLAUDE.md) § Statistical discipline is written against.

Three things about ground 4 are deliberate:

- **It is a fourth `awtIsValid` ground, not a fourth `SaturationVerdict`.** To produce a
  "bounded-but-unacceptable" *saturation* verdict, the rule would have to threshold queue **level**,
  and level cannot be made scale-free: by `L = λW`, forty people waiting is a normal morning in a
  4 000-person tower and a catastrophe in an eleven-floor building with one car. The observable that
  is already normalised by arrival rate is the **wait**. So `saturation.verdict === 'stable'` still
  means exactly "the trend test said stable", every existing consumer is unchanged, and **no pinned
  estimate moved** — the only path from the flag to a number is `stopOnSaturation`, which keys on
  `saturated`.
- **Censoring runs in the safe direction.** A leg that never boarded has no waiting time but does
  have a waiting time *so far* — `endedAt − arrivedAt`, a lower bound. It counts at that bound, and
  the diagnosis says when the reported figure is one. Excluding the unserved would put the gate's
  blind spot exactly where service is worst.
- **900 s is measured against, not chosen.** Over every shipped operating point at every shipped
  profile, at the budgets the benchmark actually uses, the longest single wait is 203.7 s on Midtown
  up-peak (n = 250), 136.6 s on Garden residential (n = 500), 121.2 s on Secure Tower up-peak
  (n = 150) and **344.8 s** on Midtown interfloor-mix (n = 1000) — a margin of 2.6× at the tightest.
  Every replication of every one of those cells returns `serviceLevel: 'served'`. The cells that
  *do* produce longer waits already lose their AWT at replication index 0 on grounds 1 and 3. So the
  horizon sits clear above everything the project publishes and below everything it already refuses
  to, and `benchmark/saturationCensus.test.ts` re-measures all of it so none of those figures can go
  stale. **A suppression rule that fires everywhere computes nothing**; this one fires nowhere it
  should not.

The gate is **per-window**, which is correct — a window statistic is a statement about its window —
but it means a `peak-5min` report cannot see a passenger starved at minute 25. Phase 8's whole-record
property scan (`fuzz/properties.ts` P6) is the backstop, and it also covers *servability*, which
`core` has no notion of. Full reasoning: [`DECISIONS.md` § T21-D1 – T21-D3](../DECISIONS.md).

## Part 4: Common random numbers — the big win

When comparing dispatcher A against dispatcher B, **do not run them independently.** Feed
the same passenger traces to both and analyze the paired difference:

```
Dᵢ = AWT_A(i) − AWT_B(i)
```

The mechanism:

```
Var(A − B) = Var(A) + Var(B) − 2·Cov(A, B)
```

Independent runs give `Cov = 0`. CRN induces positive correlation, so the covariance term
subtracts and the variance of the *difference* collapses. Published reductions reach
**~94%** — roughly **5–20× fewer runs** for equal confidence on a comparison.

### Measured: the reduction depends entirely on how similar the two arms are

That published figure is reachable on this simulator, but it is **regime-dependent** and the
range is enormous. Same building, same traffic, same n = 100, same metric — varying only how
far the candidate sits from the baseline. Since `eta` is `{waitTime: 1}` and `nearest-car` is
`{distanceTravelled: 1}`, adding `distanceTravelled` to `eta` walks continuously from one to
the other:

| Comparison | rho | Variance reduction | Implied fewer runs |
|---|---|---|---|
| `eta` vs `eta` + 0.1·`distanceTravelled` | 0.9969 | **99.69%** | 324× |
| `eta` vs `eta` + 0.8·`distanceTravelled` | 0.9027 | 89.77% | 9.8× |
| `eta` vs `nearest-car` | 0.6083 | **43.75%** | 1.8× |

Read that as a direct instruction about budget:

- **Phase 7's search neighbourhood** — candidates differing by one nudged weight — *is* the
  regime the ~94% / 5–20× claim describes. It holds there with room to spare. The same figure
  in [Parameterization & Tuning § Use common random numbers](06-parameterization-and-tuning.md#use-common-random-numbers-across-candidates)
  is therefore correct as written, because an optimization round compares near-neighbours.
- **Phase 5's dispatcher-vs-baseline comparisons** are the bottom row, where the claim is
  **wrong by an order of magnitude**: CRN buys 1.8×, not 5–20×.

**Budget replications according to how similar the arms are.** Structurally different
dispatchers need close to the independent-sampling run count. Do not assume a comparison is
cheap merely because it is paired.

#### Why the bottom row cannot be fixed

The obvious suspicion is broken synchronization. It was investigated and ruled out:

- per-replication trace digests are **byte-identical** across the two arms, so both really did
  see the same passenger populations;
- two independent estimators of the unpaired variance agree to **3.21%** — 79.68 s² measured
  over six disjoint baseline seed sets, against 82.32 s² implied algebraically by
  `Var(A) + Var(B)` from the paired runs alone. The six estimates span 68 to 85 s², which is
  also why one of them is not quotable on its own.

Against `Var(A − B) = 46.31 s²` under CRN, those two baselines put the reduction at **41.88%
empirical** and **43.75% algebraic**. The table above quotes the algebraic figure because it
uses only the paired runs and so cannot be biased by which seed set the independent baseline
happened to draw.

The cause is **unequal marginal variances**:

| | AWT mean | Var |
|---|---|---|
| `nearest-car` | 23.06 s | 69.76 s² |
| `eta` | 16.20 s | 12.56 s² |

Since `Var(A − B) = Var(A) + Var(B) − 2·rho·sd_A·sd_B`, even at **rho = 1** the difference
retains `(sd_A − sd_B)² = 23.12 s²` of the 82.32 s² total. **71.92% is therefore the hard
ceiling** on that comparison however perfect the synchronization becomes. 94% was never
reachable there, and no amount of stream discipline would have found it.

A corollary worth carrying into Phase 5: a dispatcher that is *more variable* than its
baseline is intrinsically harder to compare against it, independently of how much better its
mean is. Reducing variance is itself worth points.

### Measured: the resolution limit is two numbers, not one

"What is the smallest improvement we can detect?" has two answers here, roughly **10× apart at
the same budget**, separated by the same similarity axis as the table above. Power curve, 11
rungs × 10 disjoint seed sets, n = 100, 95% paired-t, base AWT 15.72 s.

**Near-neighbour arms** (one weight nudged, rho 0.98–1.00):

| Effect | as % of AWT | Detected |
|---|---|---|
| 0.089 s | 0.57% | 3/10 |
| 0.134 s | 0.85% | 6/10 |
| **0.200 s** | **1.27%** | **8/10 — 80% power** |
| **0.265 s** | **1.69%** | **10/10** |

**Structurally different dispatchers** (rho ≈ 0.61, s_D = 6.81 s): the paired half-width at
n = 100 is **1.33 s**, so

| | Effect | as % of AWT |
|---|---|---|
| detectable at all | ~1.3 s | 8.5% |
| 80% power | ~1.9 s | 12% |

This is the number Phase 5 needs *before* it starts. Its acceptance criterion is "each
dispatcher beats `NearestCarDispatcher` with a paired-t interval excluding zero" — at n = 100
on this operating point that demands roughly a **12% AWT improvement**. Anything smaller is
not a failed dispatcher; it is below the apparatus's resolution at that budget, and the honest
report is **indistinguishable**, not "no better". To resolve less, raise `n`: the detectable
effect falls as `1/sqrt(n)`, so 4× the replications buys 2× the resolution.

That is the whole difference between *"our dispatcher is better"* and *"better than we can
measure"* — and only the second is defensible without checking the half-width first.

### Measured: flat plateaus, not noise — read this before writing an optimizer

A weight perturbation below the threshold at which it flips a dispatch decision produces a
**bit-identical run**. Not a small effect — *no* effect:

| `distanceTravelled` weight added to `eta` | Exactly-zero paired differences | rho | Effect |
|---|---|---|---|
| 0.01 | **100/100** | 1.000000 | exactly 0 |
| 0.02 | **100/100** | 1.000000 | exactly 0 |
| 0.03 | **100/100** | 1.000000 | exactly 0 |
| 0.035 | 98/100 | 0.998314 | 0.026 s |
| 0.04 | 98/100 | 0.998314 | 0.026 s |
| 0.06 | 97/100 | 0.998126 | 0.033 s |
| 0.10 | 95/100 | 0.996918 | 0.058 s |

The mechanism is not subtle and will not go away: dispatch is an `argmin` over a handful of
cars, ranked by `(cost, carId)`. A weight change that reorders no car's cost changes nothing
downstream, and the simulator is deterministic, so the two runs agree bit for bit. The
objective surface is **piecewise constant — a staircase, not a slope.** Note that 0.035 and
0.04 are identical to *each other* as well: the plateaus continue well past the first step.

What a Phase 7 optimizer author must design for:

1. **Flat regions are expected, not a bug.** A candidate scoring *exactly* the baseline is the
   normal consequence of too small a step, and it is detectable for free: paired differences
   that are exactly zero, `rho = 1`.
2. **Finite-difference gradients are undefined there.** Any method estimating a gradient from
   small perturbations reads the slope as zero and stalls. Prefer methods that need no
   gradient — random search, CMA-ES with a step size above the plateau width, Bayesian
   optimization on a coarser grid.
3. **Step size has a floor.** On this configuration a `distanceTravelled` step must exceed
   ~0.03 to do anything at all. That floor is per-term, per-building and per-traffic, so
   **probe it** rather than trusting this number.
4. **The paired difference is sparse.** Even at a clearly significant 0.3 weight step, ~90 of
   100 replications are still exactly zero and the entire effect is carried by the few where a
   decision flipped. Estimators assuming a dense, roughly normal difference are working
   against the actual shape of the data.

### Use a paired-t interval

Compute the confidence interval on the **differences**, not two separate intervals.

```
D̄ ± t[n-1, conf] * (s_D / sqrt(n))
```

If the interval excludes zero, the difference is significant.

> **Common and costly error:** two overlapping confidence intervals do **not** imply
> "no significant difference." Always use the paired interval for comparisons.

### CRN requires stream synchronization

CRN is the reason the architecture keeps reproducible input streams. See
[Architecture § Determinism](01-architecture.md#determinism-strategy) — per-source RNG
streams are what make CRN survive the fact that different dispatchers cause different
event sequences.

## Part 5: What to record

Persist **per-run records, not aggregates**, with the seed attached, so any run can be
replayed exactly and results re-analyzed without re-simulating.

| Metric | Why |
|---|---|
| AWT + CI | Headline number |
| **WT95** — 95th percentile wait | What people experience as "bad"; means hide tails |
| **% waiting > 60 s** | Standard long-wait quality metric |
| **TTD** — time to destination (wait + ride) | What destination dispatch optimizes; AWT alone unfairly penalizes it |
| Car load factor distribution | Validates the capacity model |
| Achieved handling capacity | Comparison against the analytical baseline |
| Saturation flag | Suppresses invalid statistics |
| **Energy proxy** — out-of-balance work over the window, plus metres travelled and motor starts | The third Pareto axis. Landed in `f895a16`; before it, every front this project produced silently degenerated to two axes with the third reported `inactive`. Report `workPerServedLegKJ` beside it — a configuration that spends less by serving fewer people has not saved anything. Definition and omissions: [`docs/02` § Energy and the counterweight](02-elevator-reference.md) |

`REPLICATION_METRICS` is the machine-readable form of this table and is **23** entries wide; the
seven rows above name the ones a report should lead with.

Percentile confidence intervals require substantially more replications than mean CIs.
If WT95 is a headline metric, factor that into the stopping rule.

**Measured**, on the same 400-replication reference sample as Part 3: WT95 has a mean of
29.17 s and an sd of 4.43 s, so at a common ±1 s target and 90% it needs **n ≈ 54** against
AWT's 36 — about 1.5× the budget. Its coefficient of variation is actually *lower* than AWT's
(15% against 23%); the extra cost comes from the wider absolute spread, so compare the two at
an absolute target rather than a percentage one.

## Sources

Where a section above is labelled **measured**, it qualifies a published figure with what this
simulator does at its own operating point. **None of the sources below is being contradicted.**
The ~94% CRN reduction is reproduced here (99.69%) in the regime it describes — closely related
alternatives — and the 50–200 replication budget is right for the ±0.5 s to ±0.8 s precision it
implicitly assumes. What the gate established is which regime this project's own comparisons
fall into, and that is a fact about Midtown Office and these dispatchers rather than about the
literature. Re-measure before carrying any of these numbers to another building or arrival rate.

- [Determining the Number of Simulations Required for Statistically Valid Results — Abbi & Peters, 9th Symposium on Lift & Escalator Technologies](https://download.peters-research.com/library/Determining_the_Number_of_Simulations_Required_for_Statistically_Valid_Results.pdf)
- [Traffic Analysis Based on the Up-Peak Round Trip Time Method — Peters Research](https://liftescalatorlibrary.org/paper_indexing/papers/00000036.pdf)
- [CIBSE Guide D: Transportation Systems in Buildings (2020)](https://www.cibse.org/knowledge-research/knowledge-portal/guide-d-transportation-systems-in-buildings-2020/)
- [ISO 8100-32:2020 Guidance — Elevator World](https://elevatorworld.com/article/iso-8100-322020-guidance/)
- [Variance Reduction Techniques — Rossetti, KSL Simulation Book](https://rossetti.github.io/KSLBook/ch9VRTs.html)
- [Investigating the Effectiveness of Variance Reduction Techniques in DES Models](https://arxiv.org/pdf/1305.7424)
- [Using Common Random Numbers in Health Care Cost-Effectiveness Simulation Modeling — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3725537/)
- [Automating Discrete Event Simulation Output Analysis — Hoad & Robinson, Warwick](https://warwick.ac.uk/fac/soc/wbs/projects/autosimoa/overall_framework/overallframework_websitewriteup_5.doc)
- [Improving Elevator Performance Using Reinforcement Learning — Crites & Barto, NeurIPS](http://papers.neurips.cc/paper/1073-improving-elevator-performance-using-reinforcement-learning.pdf)
- [Confidence Intervals for the Mean of a Log-Normal Distribution — Olsson, Journal of Statistics Education](https://jse.amstat.org/v13n1/olsson.html)
