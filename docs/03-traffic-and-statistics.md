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
RTT = 2·H·tv + (S+1)·ts + 2·P·tp        round trip time
S   = N·(1 − ((N−1)/N)^P)                expected stops among N floors
INT = RTT / L                            interval, L = cars in group
HC5 = 300·P / RTT                        persons handled per 5 minutes
%POP = HC5 / population × 100            handling capacity as % of population
```

| Term | Meaning |
|---|---|
| `H` | Highest reversal floor |
| `N` | Number of floors served above the lobby |
| `tv` | Single-floor transit time at rated speed |
| `ts` | Time lost per stop (doors, start delay, leveling) |
| `tp` | Passenger transfer time |
| `P` | Passengers per trip — **use 80% of rated capacity** |
| `L` | Number of cars in the group |

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
    halfWidth = t[n-1, conf] * (s / sqrt(n))     # n <= 25, t-distribution
    halfWidth = z[conf]      * (s / sqrt(n))     # n >  25, normal approximation
    if halfWidth < acceptableRange: stop and report mean
```

z-values by confidence level:

| Confidence | 70% | 80% | 90% | 95% | 99% |
|---|---|---|---|---|---|
| z | 1.04 | 1.28 | 1.65 | 1.96 | 2.58 |

### Saturation detection

If demand exceeds handling capacity, queues grow without bound and AWT is not remotely
normal. The literature's position is that an accurate AWT is unnecessary because the
configuration fails anyway — but **the simulator must detect saturation and flag it**
rather than reporting a meaningless mean.

Detection: test for a positive trend in queue length across the run. If present, mark the
result `SATURATED` and suppress the AWT confidence interval.

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

Percentile confidence intervals require substantially more replications than mean CIs.
If WT95 is a headline metric, factor that into the stopping rule.

## Sources

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
