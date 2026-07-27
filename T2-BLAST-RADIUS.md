# T2 — blast radius of the statistics-integrity fix

Branch `fix/statistics-integrity`. Handover to **T4 (documentation)**: this file enumerates every
published number the change moves, and states for each whether it moves, by how much, and whether a
verdict flips.

Fixes covered: review findings **#14** (published paired interval switched Student-t → normal above
n = 25), **#8** (`compare` could not say IDENTICAL), **#19** (`reproduce:` omitted `--confidence`).

---

## 1. The rule — what moves and what does not

Exactly one quantity changed: **the quantile used to build a published confidence interval.**
`estimateMean` (and therefore `pairedDifferenceEstimate`, and therefore every interval this
repository prints) now uses Student-t at `n − 1` degrees of freedom at every `n`, where it
previously used `z` above `n = 25`.

**Unchanged, everywhere:**

- every **mean** / point estimate / mean difference;
- every **relative effect** (`−29.7 %`, `+12.0 %`, …);
- every **exactly-zero paired-difference count** (`497/500`, `296/300`, `30/30`, …);
- every **`rho`**, trace digest, CRN alignment audit and saturation count;
- every **`requiredReplications`** figure (`needs n ≈ 579`, `n ≈ 3622`) — `verdict.ts`
  `replicationsToResolve` uses an explicit `Z_95` constant that this change does not touch;
- the **sequential stopping rule's** own `n ≤ 25` t / `n > 25` z crossover, which is correct where
  it came from and is deliberately left intact (`halfWidthQuantile`, and the runner's independent
  `docHalfWidth` test double).

**Changed:**

- every **half-width**, **lower bound**, **upper bound** and **noise floor**, multiplied outward by
  `t(n−1, α) / z(α)`;
- consequently, any **verdict** whose interval sat within that multiplier of zero.

**Direction is one-way.** The interval only ever *widens*. So an `INDISTINGUISHABLE` can never
become `BETTER` or `WORSE`; only the reverse is possible. No claim in this repository gets
*stronger* as a result of this change.

## 2. The multiplier, by replication count (95 % confidence)

| n | t(n−1, .975) | z(.975) | half-width × | change |
|---|---|---|---|---|
| 26 | 2.0595386 | 1.9599640 | 1.050804 | +5.080 % |
| 30 | 2.0452296 | 1.9599640 | 1.043504 | +4.350 % |
| 40 | 2.0226909 | 1.9599640 | 1.032004 | +3.200 % |
| 50 | 2.0095752 | 1.9599640 | 1.025312 | +2.531 % |
| 60 | — | — | 1.020933 | +2.093 % |
| 100 | 1.9842170 | 1.9599640 | 1.012374 | +1.237 % |
| 150 | — | — | 1.008251 | +0.825 % |
| 200 | 1.9719565 | 1.9599640 | 1.006119 | +0.612 % |
| 250 | — | — | 1.004886 | +0.489 % |
| 300 | 1.9679297 | 1.9599640 | 1.004064 | +0.406 % |
| 500 | 1.9647294 | 1.9599640 | 1.002431 | +0.243 % |

At 80 % confidence and n = 30 (the finding-#19 CLI case) the multiplier is **1.023317 (+2.332 %)**.

`n ≤ 25` is unaffected: the published interval was already t there.

## 3. VERDICT FLIP — one result, quoted in four places

> ### The Phase 5 capacity-reassignment headline is no longer significant.

**`−0.520 s [−1.029, −0.010]` at 3 % load, n = 60 → `[−1.039, +0.000]`, which CONTAINS ZERO.**

This is **not** a derivation. It was re-measured by running the shipped study
(`runCapacityReassignmentStudy({ replications: 60, loads: [3] })`) against the fixed source:

```
load 3 %, n=60, quotable=true, exactZero=50/60, crnAligned=true
mean d = −0.5196 s   s_D = 2.0123   SE = 0.259788
AFTER  (t(59), method 't'): [−1.0394, +0.0003]  half-width 0.5198  ->  CONTAINS zero
BEFORE (z=1.959964)       : [−1.0288, −0.0104]  half-width 0.5092  ->  EXCLUDES zero
```

The mean is unchanged to four decimals. Only the half-width moved, by 2.09 %, and the upper bound
crossed zero at **+0.0003 s**.

**Every place this number appears, and what it must become:**

| location | current text | correct text |
|---|---|---|
| `docs/05-roadmap.md:360` | "The **−0.520 s [−1.029, −0.010]** that switching the policy is worth at 3 %" | `−0.520 s [−1.039, +0.000]` — **INDISTINGUISHABLE at n = 60**, not "worth" |
| `packages/experiments/src/benchmark/index.ts:497` | table row `**−0.520 [−1.029, −0.010]**` | `−0.520 [−1.039, +0.000]` |
| `packages/experiments/src/benchmark/capacityReassignment.ts:39` | table row `` `−0.52 [−1.03, −0.01]` `` | `` `−0.52 [−1.04, +0.00]` `` |
| `packages/experiments/src/benchmark/capacityReassignment.ts:54` | "**2. Reassignment as a whole is worth `−0.52 s [−1.03, −0.01]` of AWT at 3 %**" | the claim's *sign* survives but its *significance* does not; it must be reworded to an unresolved effect at n = 60 |

Note this **strengthens** the study's own headline finding — that the capacity trigger is inert
where it can be quoted — rather than weakening it. The `inertWhereQuotable` flag, the crossing
counts (0.00 → 0.55 → 2.77 → 6.07 → 19.27 → 40.98), the migration counts and `firstFiringLoad` are
all untouched. What changes is that the *whole-policy* AWT gain at 3 % can no longer be quoted as
significant at n = 60. No test asserts the old bound (`capacityReassignment.test.ts` only logs it,
and at n = 40), so nothing goes red — which is exactly why this list exists.

`docs/08-review-findings.md:156` also documents a flip case at n = 26
(`[−0.1643, −0.0011]` → `[−0.1684, +0.0030]`); that is finding #14's own worked example and is now
the *correct* behaviour rather than a defect to fix.

## 4. Complete inventory — every published interval, by file

Measured by recomputing each interval's half-width at its section's own `n` and re-rendering it at
the precision it is printed to. "changes" means the *printed digits* differ.

| file | intervals | change at printed precision | verdict flips |
|---|---|---|---|
| `packages/experiments/src/benchmark/index.ts` | 148 | **63** | 1 (L497) |
| `packages/experiments/src/benchmark/tailStudy.ts` | 11 | 1 (L54) | 0 |
| `packages/experiments/src/benchmark/capacityReassignment.ts` | 2 | 2 | **2** (L39, L54 — same result) |
| `packages/experiments/src/benchmark/prepositioning.ts` | 3 | 0 | 0 |
| `packages/experiments/src/benchmark/report.ts` | 1 | 1 (L25 — a docstring *example*, not a measurement) | 0 |
| `packages/experiments/src/benchmark/dispatcherBenchmark.test.ts` | 5 (docstring only) | 0 | 0 |
| `packages/experiments/src/benchmark/predictorLag.test.ts` | 1 (docstring) | 1 | 0 |
| `docs/05-roadmap.md` | 10 | 4 | 1 (L360) |
| `docs/07-handoff.md` | 4 | 0 | 0 |
| `docs/06-parameterization-and-tuning.md` | 3 | 0 — these are **parameter ranges** (`"range": [0, 5]`), not intervals | 0 |
| `docs/08-review-findings.md` | 23 | n/a — a review register that records what was measured *before* the fix; T4's call whether to annotate | 0 |
| `README.md` | 0 | 0 | 0 |
| `docs/00`–`docs/04` | 0 | 0 | 0 |

### 4a. `packages/experiments/src/benchmark/index.ts` — the 63 lines that change

Grouped by section, each `[old] -> [new]`:

**Midtown Office up-peak 1 %, n = 250 (×0.489 %)** — L90–L98:

```
L90  [−26.20, −20.62] -> [−26.21, −20.61]      L90  [−11.70, −8.93] -> [−11.71, −8.92]
L91  [−26.16, −20.58] -> [−26.17, −20.57]      L91  [−11.75, −8.97] -> [−11.76, −8.96]
L92  [−26.13, −20.55] -> [−26.14, −20.54]      L92  [−10.90, −8.09] -> [−10.91, −8.08]
L93  [−26.20, −20.62] -> [−26.21, −20.61]      L93  [−11.70, −8.93] -> [−11.71, −8.92]
L94  [−26.19, −20.62] -> [−26.20, −20.61]      L94  [−11.61, −8.80] -> [−11.62, −8.79]
L95  [−22.95, −17.30] -> [−22.96, −17.29]      L95  [−12.98, −9.92] -> [−12.99, −9.91]
L96  [−25.75, −20.15] -> [−25.76, −20.14]      L96  [−12.54, −9.58] -> [−12.55, −9.57]
L97  [−24.29, −18.66] -> [−24.30, −18.65]      L97  [−15.18, −12.13] -> [−15.19, −12.12]
L98  [−9.27, −7.04]   -> [−9.28, −7.03]        L98  [−24.13, −17.97] -> [−24.15, −17.95]
L98  [−13.87, −10.40] -> [−13.88, −10.39]
```

**Secure Tower up-peak 2 %, n = 150 (×0.825 %)** — L132–L140, L199:

```
L132 [−6.53, −4.99] -> [−6.54, −4.98]   [−22.42, −16.63] -> [−22.44, −16.61]   [−8.26, −6.13] -> [−8.27, −6.12]
L133 [−6.53, −5.00] -> [−6.54, −4.99]   [−22.42, −16.63] -> [−22.44, −16.61]   [−8.25, −6.13] -> [−8.26, −6.12]
L134 [−6.50, −4.93] -> [−6.51, −4.92]   [−22.41, −16.61] -> [−22.43, −16.59]   [−7.66, −5.49] -> [−7.67, −5.48]
L135 [−6.53, −4.99] -> [−6.54, −4.98]   [−22.42, −16.63] -> [−22.44, −16.61]   [−8.26, −6.13] -> [−8.27, −6.12]
L136 [−6.36, −4.77] -> [−6.37, −4.76]   [−22.39, −16.57] -> [−22.41, −16.55]   [−8.19, −6.06] -> [−8.20, −6.05]
L137 [−4.79, −3.20] -> [−4.80, −3.19]   [−20.77, −14.91] -> [−20.79, −14.89]   [−7.58, −5.23] -> [−7.59, −5.22]
L138 [−6.26, −4.67] -> [−6.27, −4.66]   [−22.36, −16.53] -> [−22.38, −16.51]   [−8.88, −6.61] -> [−8.89, −6.60]
L139 [−5.83, −4.27] -> [−5.84, −4.26]   [−21.95, −16.14] -> [−21.97, −16.12]   [−9.72, −7.38] -> [−9.73, −7.37]
L140 [+0.59, +3.11] -> [+0.58, +3.12]   [+3.47, +11.02]  -> [+3.44, +11.05]    [+1.18, +4.28] -> [+1.17, +4.29]
L199 [−1.79, −0.49] -> [−1.80, −0.48]
```

**Deadband sweep, n = 300 (×0.406 %)** — L291–L296:

```
L291 [−0.378, −0.055] -> [−0.379, −0.054]     L292 [−0.726, −0.135] -> [−0.727, −0.134]
L293 [−1.181, −0.404] -> [−1.183, −0.402]     L294 [−1.548, −0.671] -> [−1.550, −0.669]
L295 [−1.346, −0.416] -> [−1.348, −0.414]     L296 [−1.136, −0.111] -> [−1.138, −0.109]
```

**Tail terms / auction, n = 250 (×0.489 %)**, and the predictor-causality row at n = 100:

```
L344 [−9.99, −5.58]     -> [−10.00, −5.57]       L344 [−12.16, −7.14] -> [−12.17, −7.13]
L352 [+8.04, +11.67]    -> [+8.03, +11.68]
L414 [−0.0315, +0.0036] -> [−0.0316, +0.0037]    (n = 100)
```

**Capacity reassignment, n = 60 (×2.093 %)** — L463, L465, L497:

```
L463 [+1.11, +1.76] -> [+1.10, +1.77]   [+1.11, +1.85] -> [+1.10, +1.86]   [−3.06, −2.12] -> [−3.07, −2.11]
L465 [+0.16, +0.64] -> [+0.15, +0.65]   [−1.08, −0.53] -> [−1.09, −0.52]
L497 [−1.029, −0.010] -> [−1.040, +0.001]        *** VERDICT FLIPS ***
```

### 4b. `docs/05-roadmap.md` — the 4 that change

```
L360 [−1.029, −0.010]  -> [−1.040, +0.001]   n = 60   *** VERDICT FLIPS: BETTER -> INDISTINGUISHABLE ***
L373 [−0.0315, +0.0036] -> [−0.0317, +0.0038]  n = 100  (already contained zero; still does)
L553 [−2.257, −0.319]  -> [−2.277, −0.299]   n = 60   Phase 7 holdout — STILL EXCLUDES ZERO
L553 [−2.135, +0.303]  -> [−2.161, +0.329]   n = 60   tuning seed set — still contains zero
```

The Phase 7 acceptance measurement at `docs/05-roadmap.md:553` **survives**: the holdout interval
still excludes zero, with the upper bound moving from `−0.319` to `−0.299`. Its margin is now 30 %
of the half-width rather than 33 %; the "MET as a measurement, NOT as a gate" verdict stands, and
if anything the roadmap's own reason for not gating on it ("a coin flip dressed as an acceptance
criterion") is now better supported.

### 4c. Other files — the 2 that change

```
packages/experiments/src/benchmark/tailStudy.ts:54   [−4.10, −0.49] -> [−4.11, −0.48]   (n = 250)
packages/experiments/src/benchmark/report.ts:25      [−8.19, −5.53] -> [−8.21, −5.51]
        — a docstring illustration of the format, not a measurement. Update only for consistency.
packages/experiments/src/benchmark/predictorLag.test.ts:122  [−0.0315, +0.0036] -> [−0.0317, +0.0038]
```

### 4d. Explicitly unchanged at printed precision (do NOT edit)

- **All four Phase 5 pre-positioning rows** at `docs/07-handoff.md:202-205` and
  `packages/experiments/src/benchmark/prepositioning.ts:34-37`: at n = 500 the multiplier is
  0.243 %, below the last printed digit. `−4.88 [−5.27, −4.49]`, `+1.98 [+1.75, +2.20]`,
  `−0.98 [−1.28, −0.68]` and `−0.01 [−0.02, +0.01]` all print identically after the fix.
- `docs/05-roadmap.md:302` and `benchmark/index.ts:26, :45, :46, :55` — same rows, same reason.
  (They are separately wrong for the reason review finding **#4** gives; that is a different fix,
  and this change does not touch it. The correct n = 500 value remains
  `−0.0058 [−0.0214, +0.0098]`, whose printed form the t quantile does not move.)
- `docs/05-roadmap.md:343, :350` (`−0.006 [−0.031, +0.019]`, `−0.007 [−0.032, +0.018]`, n = 300):
  unchanged at 3 dp.
- `docs/05-roadmap.md:380` / `tailStudy.ts:22` (`−0.23 [−0.41, −0.05]`, n = 250): unchanged at 2 dp,
  still excludes zero.
- `README.md`, `docs/00`–`docs/04`: contain no confidence intervals at all.
- `docs/03-traffic-and-statistics.md` — no intervals, and its two rules (§ Part 3 stopping,
  § Part 4 paired-t) are now implemented as written. **No doc change is required to justify this
  fix**; the code was wrong against the doc, not the other way round.

## 5. CLI output — what a user sees change

- Every `compare` at `--reps > 25` (including the **default of 100**) prints a bound roughly
  1.2 % wider. The label "The paired-t interval on the difference excludes zero" is now true.
- Two arms whose paired differences are all exactly zero print **IDENTICAL**, not
  INDISTINGUISHABLE, and the "Raise --reps" / "below this experiment's resolution" paragraph is
  replaced by one that points at the roadmap's bit-identity-is-a-wiring-bug rule.
  `compare --help`'s third example comment changes from `# must be INDISTINGUISHABLE` to
  `# must be IDENTICAL`.
- The `reproduce:` line now carries `--confidence <f>` unconditionally, so it is one token longer
  than any previously documented example of it (including
  `docs/08-review-findings.md:209`'s quoted line).

## 6. Tests

- **No test in the suite pinned any of the moved bounds.** The only two assertions that pinned the
  *bugs* are listed in the commit message and in the T2 report:
  `packages/experiments/src/reports/statistics.test.ts` (`pastCrossover.method` → `'z'` on the
  published path, replaced) and `packages/experiments/src/reports/compare.test.ts:196`
  (`large.convergence.method` → `'z'`, now `'t'`), plus the CLI's
  `reports INDISTINGUISHABLE when a dispatcher is compared with itself`, rewritten as
  `names a self-comparison IDENTICAL, not a resolution problem`.
- `packages/experiments/src/runner/stopping.test.ts` is untouched and still asserts the
  `n ≤ 25` t / `n > 25` z crossover through its own `docHalfWidth` double. That test, plus the
  retitled `halfWidthQuantile` block in `statistics.test.ts`, is the guarantee that the stopping
  rule's rule survived.

## 7. One behavioural side effect outside the reporting path

`packages/experiments/src/validation/harness.ts:176` builds `productionStoppingRule` by injecting
`estimateMean` into `halfWidthStoppingRule`. Because `estimateMean` is now t-always, that stopping
rule's half-width is 0.2–5 % larger past n = 25, so a sequentially-stopped experiment may run
**marginally more** replications before it stops. That is the conservative direction (`stopping.ts`
states it: "an experiment that runs too long wastes CPU, and one that stops too early publishes a
number it did not earn"), and no test's replication count changed.

`harness.ts` is not T2's file. If the owner wants the stopping rule to keep the doc's cheaper
crossover, the one-line change is to inject a crossover-based estimator built on the still-exported
`halfWidthQuantile` rather than on `estimateMean` — but doing so would create a symbol whose only
caller is a test unless it is wired at the same time, so it should be done as one change or not at
all.
