# T9 — published benchmark numbers that the code does not produce

> **🏁 Retired 2026-07-28 with the delivery; still authoritative, no longer updated.** A measurement
> record, and the origin of one of the repository's permanent guards:
> `benchmark/published.test.ts`, which is now what stands between a published interval and silent
> drift. `published.ts` carries **401 pinned estimate entries** as of 2026-07-28 (counted here by
> grep on this tree, not asserted by any test), grown by every study added since this task and with
> **no existing pin moved** by any of them — most recently the mixed-use study's 72, where
> `published.ts` was **+100 / −0** and a key-by-key diff confirmed it (§ D100).

Branch `fix/unreproducible-benchmarks`, 2026-07-27. Everything below is **measured**, at seed
`20 260 726`, on the branch's own tree unless a commit is named.

Companion to `T2-BLAST-RADIUS.md` § 4e, which flagged items 1 and 2 and deliberately left them
alone. This file closes them, names the cause of each, and records a **fourth** and **fifth**
instance found by the guard built for the first three.

> **Still authoritative as of 2026-07-28.** Every figure below stands, and the guard this task built
> — `benchmark/published.test.ts` — has since been the mechanical proof of a second claim it was not
> designed for: T21's fourth `awtIsValid` ground moved **no pinned estimate**, because
> `aggregateMetric` reads `record.metrics[metric]` and never consults that flag. Twelve new pins
> were added by Phase 6a/6b and none of the existing ones moved, verified key by key.

---

## 0. Headline

**The studies are deterministic from their seeds. This was never a reproducibility failure.**
`measureAllPublishedFigures()` — all five interval-publishing studies, 263 figures — returns a
byte-identical result on two runs in one process and on two separate processes, SHA-256
`9967a5da28b71dfb81bd591de5809d91fd1af5d1181a8ed65a3087f81ce5ca64`. CLAUDE.md invariants 2 and 4
and `docs/07-handoff.md` § 5 hold.

What failed is that **nothing in the suite re-derived a published interval**, so a docstring could
go stale across two commits, and a hand-transcription could be wrong on the day it was written,
without a single test noticing. That is now guarded (§ 4).

---

## 1. Item 1 — `runTailStudy()`'s published numbers: ROOT CAUSE

> **The figures were measured at `a1ec6ad` and never regenerated after `c237d95` wired stage 5
> (capacity reassignment) and stage 7 (pre-positioning) into `sim/simulation.ts`.**

### The evidence, and how it was obtained

`a1ec6ad` (the commit that introduced `tailStudy.ts`) was extracted to a scratch tree, built, and
`runTailStudy()` run against it at the shipped defaults. Following T2 § 4.0's method — *re-derive the
OLD published bound first* — **the old tree reproduces the published text character-for-character**:

| published in `tailStudy.ts` | `a1ec6ad` re-run | current tree |
|---|---|---|
| 2 % `fairness-first−eta` AWT `−0.23 [−0.41, −0.05]` | `−0.2336709127` → **`−0.23 [−0.41, −0.05]`** | `−0.26 [−0.45, −0.08]` |
| WT95 `−1.58 [−2.48, −0.68]` | `−1.5772694031` → **`−1.58 [−2.48, −0.68]`** | `−1.65 [−2.55, −0.76]` |
| WT99 `−1.94 [−2.87, −1.02]` | `−1.9450491768` → `−1.95` **[−2.87, −1.02]** | `−2.05 [−2.98, −1.11]` |
| % > 60 s `−0.49 [−0.76, −0.21]` | `−0.4864795049` → **`−0.49 [−0.76, −0.21]`** | `−0.54 [−0.82, −0.27]` |
| 2 % `capacity-aware−eta` AWT `−0.16 [−0.44, +0.12]` | **exact** | `−0.19 [−0.48, +0.10]` |
| WT95 `−0.86 [−1.85, +0.14]` | **exact** | `−0.92 [−1.91, +0.07]` |
| 2.75 % AWT `−0.72 [−1.27, −0.17]` | **exact** | `−0.82 [−1.37, −0.26]` |
| WT95 `−2.29 [−4.10, −0.49]` | **exact** | `−2.64 [−4.44, −0.85]` |
| census row 2 % `29 / 0 / 0 / 0 / 0` | **exact** | `29 / 0 / 0 / 0 / 1` |
| census rows 2.25 / 2.75 / 3 % | **exact** | `zoned-uppeak` 1→3, 0→2, 2→5 |

Ten of eleven reproduce exactly. The eleventh (WT99's mean) differs only in the last printed digit
of the *mean* with both bounds exact — a hand transcription of `−1.945` down to `−1.94`, in the same
family as item 2 and unrelated to the drift.

### Which of the five candidate explanations, and why not the others

- **not a different `n`** — the pre-wiring re-run is at the module's own default n = 250;
- **not a different seed, window, rate or duration** — same `BENCHMARK_SEED`, same
  `twoEntranceUpPeak`, same 900 s / peak-5 min;
- **not changed defaults or arms** — `git log` shows `tailStudy.ts` has **one** commit, `a1ec6ad`.
  The file never changed; the engine under it did;
- **not non-determinism** — see § 0;
- **the code changed**, and the docstring did not.

### The mechanism, at replication resolution

`#reassignOnLoad` is swept from `#finishStop` and every gate is the policy's: under the default
`reassignmentPolicy: never` every call comes back `retained`. `fairness-first` and `capacity-aware`
both declare `until-commitment`; **`eta` does not.** So the wiring moved the treatment arms and left
the reference untouched.

Measured per replication, two-entrance 2 %, n = 250, both trees:

| arm | replications whose AWT changed across `c237d95` | replications with `capacityMigrations > 0` | containment |
|---|---|---|---|
| `eta` | **0** | **0** | — (and `eta`'s mean is bit-identical at every load, 19.072286 / 20.187607 / 23.973225) |
| `fairness-first` | 10 | 14 | **changed ⊂ migrated** |
| `capacity-aware` | 5 | 8 | **changed ⊂ migrated** |
| `zoned-uppeak` | **250** | **0** | a *different* mechanism — stage 7 `zone-center` parking, wired by the same commit |

No replication changed without a stage-5 migration except on `zoned-uppeak`, which migrated nothing
and moved everywhere. That splits the drift cleanly into its two causes and is why only
`zoned-uppeak`'s column of the saturation census moved.

### Verdict on which number is correct

**The current code is correct and the published numbers were stale.** The old figures were right
for an engine in which three Phase 5 behaviours were never called — the exact defect `c237d95` fixed
and `core/src/sim/seam.test.ts` now guards. Restoring that configuration would mean un-wiring the
simulator. Corrected forward; the old values are recorded here and in the file's new *Provenance*
section rather than discarded.

**No verdict flips.** Every cell keeps its `BETTER` / `INDISTINGUISHABLE` / `UNQUOTABLE` label, on
both trees, at every load.

---

## 2. Item 2 — the two § 7 auction bounds: ROOT CAUSE

> **Double rounding.** The bound was taken to three decimals and then to two.

`runBenchmark()` re-run at the shipped defaults reproduces the § 7 table's means and standard errors
exactly. Only two printed *lower bounds* disagree, and neither is reachable under either quantile:

| location | file said | full-precision bound (z, as the author had it) | correct at 2 dp | 3 dp → 2 dp |
|---|---|---|---|---|
| `index.ts:463` WT95, Midtown, n = 250 | `+1.11` | `1.104865` | **`+1.10`** | `1.105` → `+1.11` ✗ |
| `index.ts:465` AWT, Secure, n = 150 | `+0.27` | `0.264903` | **`+0.26`** | `0.265` → `+0.27` ✗ |

**The cause is identified rather than guessed.** Of the **18** bounds in that table, `round(x, 3)`
then `round(·, 2)` differs from `round(x, 2)` on **exactly two** — and they are exactly the two that
were wrong. (Under a random-error hypothesis that is 1 in 153.)

**It does not share item 1's cause.** Item 1 moved the estimate and left the rendering rule alone;
item 2 left the estimate untouched and got the rendering wrong. Neither flips a verdict — both
intervals exclude zero either way.

---

## 3. Two further instances, found by the guard

Both are the same defect classes, found because Layer B re-derives every literal rather than reading
it.

### 3a. `index.ts:343` — a third double rounding

§ 5's WT95 cell read `−1.66 [−2.55, −0.76]`. The estimate is `−1.6547939976`, which is `−1.65` at
2 dp and `−1.655` at 3 dp; `−1.655` → `−1.66` is item 2's signature exactly. Bounds were already
correct. **Corrected to `−1.65 [−2.55, −0.76]`.**

### 3b. `index.ts:26`, `:46`, `:242` — review finding #4, still live in three places

`−0.006 [−0.031, +0.019]` is the **n = 300** deadband-sweep bound, quoted three times in prose and a
table that declare **n = 500**. T2 § 4e-4 identified it and left it for the orchestrator. At n = 500
`runPrepositioningStudy()` gives mean `−0.005801020408`, SE `0.007965417897` →
**`−0.006 [−0.021, +0.010]`** — same mean to three places, a half-width **59 % too wide**.
**Corrected in all three places**, with the provenance stated inline. The n = 300 sweep rows at
`:289` and `:308` keep `[−0.031, +0.019]`, which is right for them.

---

## 4. The guard

`packages/experiments/src/benchmark/published.ts` + `published.test.ts` + `regeneratePins.ts`.
Two layers, because the three known instances split across two of them and either layer alone
would miss the other.

| layer | what it pins | where it runs | cost |
|---|---|---|---|
| **A — the estimate** | `n`, `mean`, `standardError`, `lower`, `upper` at full double precision, for **263 figures** across all five interval-publishing studies | inside `dispatcherBenchmark`, `tailStudy`, `prepositioning`, `capacityReassignment`, `predictorLag` suites, on studies they already run and cache | **≈ 0 s** for three of five; `capacity-reassignment` (n = 60 vs the suite's cheap 40) and `forecast-causality` (n = 100 vs 12) need their own run, ≈ 17 s. Tail widened from 3 loads to 6 to cover the census, ≈ +20 s |
| **B — the publication** | every interval-shaped literal in `benchmark/**` must be reproduced by a pin at its own printed precision, or declared in `UNPINNED_INTERVALS` **with an exact count** | `published.test.ts` | **0.7 s** — a source scan, no simulation |

### Design decisions, and the reasoning

- **Assert the estimate, not the text — *and* the text.** The brief asks for estimate-level
  assertions so a formatting change cannot fail the guard and a drift cannot hide in rounding.
  Layer A does that. But item 2 moves *no estimate at all*: it is wrong text over a right number, so
  an estimate-only guard would have been blind to two of the four instances. Layer B renders from
  the pin and requires the file to contain that rendering.
- **Cost: piggyback rather than a second suite.** Re-running every study in one guard file costs
  60–140 s. The study suites already pay it, so Layer A checks the cached result. Measured total
  addition to the suite, measured: **191.9 s → 196.7 s wall for the whole repository**
  (128 files / 2592 tests → 129 / 2605). Under 5 s, because the added simulation lands in files that
  run in parallel with everything else. A guard that doubled the suite is a guard somebody
  eventually excludes.
- **Multiset, not membership.** `UNPINNED_INTERVALS` carries a `count` per (file, text). Finding #4
  is precisely a literal that is *correct in one place and wrong in another*, so a membership
  allowlist would wave the second one through. Reintroducing it raises the count 2 → 3 and fails.
- **The domain is the directory.** Following `seam.test.ts`: `published.test.ts` scans every
  non-test module for `export (async )?function (run|measure|audit)Xxx` and requires each name to be
  classified in `STUDY_ENTRY_POINTS` as a study id or as `'no-intervals'`. **A study cannot be added
  to `benchmark/` without failing the suite until somebody decides whether it publishes an
  interval.** A second test requires every study id in the domain to be handed to `checkPinned` by
  some suite — a pin table nobody compares against is the dead-seam shape one level up.
- **Regeneration is deliberate.** `regeneratePins.ts` emits the table; its docstring says a re-run
  that disagrees with the file is *a question, not an answer*. `published.test.ts` round-trips the
  emitter so it cannot rot.
- **`TAIL_CENSUS_LOADS` is now exported.** The 2.75 % row and the census table were published from a
  sweep no exported constant named, which is why they went stale invisibly. Named, and the suite
  runs it.

### Evidence it fails — all three known instances reintroduced

| # | reintroduced | result |
|---|---|---|
| 1 | `tailStudy.ts` 2 % row reverted to the `a1ec6ad` figures | **RED** — 4 literals "printed, but no pinned estimate renders it" |
| 1′ | the `2/fairness-first/awtS` pin set to the pre-wiring estimate (the *estimate*-level form) | **RED** — `study "tail" no longer reproduces its published figures — 4 mismatch(es): mean pinned −0.2336709127, measured −0.26250327352862823` |
| 2 | `index.ts:463/:465` reverted to `+1.11` / `+0.27` | **RED** — both named |
| 3 (#4) | `index.ts:46` reverted to `[−0.031, +0.019]` | **RED** — *"appears 3 time(s), UNPINNED_INTERVALS declares 2"* |

Each was restored and re-run green.

### What remains unguarded — stated, not narrowed

1. **`benchmark/index.ts` § 4's sweeps, 13 literals.** The deadband sweep, the rate sweep and the
   predictor-off comparison are `runBenchmarkCase` / `new Simulation` calls that exist in
   `c237d95`'s **commit message** and nowhere in the tree. Pinning them requires shipping the sweep
   as an entry point first. All 13 are enumerated in `UNPINNED_INTERVALS` with the call that would
   reproduce them.
2. **`benchmark/report.ts:25`'s format illustration.** No `n`, no study — T2 § 4e-1's conclusion,
   unchanged.
3. **`packages/experiments/src/tuning/**` (2 literals) and `packages/cli/**`.** Out of the scan's
   directory. The tuning ones are literal fixtures at n = 12 in `holdoutRound.test.ts`; the CLI's
   are T2 § 4f's unassigned worked example.
4. **`docs/**`.** Not this task's files. The guard does not read them, so
   `docs/05-roadmap.md:380`'s stale figure is **not** caught by it — see § 5.
5. **Positional identity.** Layer B proves each literal is reproduced by *some* pin, not by the
   *right* pin. Swapping two arms' correctly-rendered intervals would pass. Closing that needs a
   per-site key annotation; it is a strictly smaller hole than "no check at all" and is recorded
   here rather than implied.
6. **Non-interval published statistics.** Relative effects (`−29.7 %`), `rho`, exact-zero counts and
   required-`n` figures are not pinned. The one exception is the tail study's saturation census,
   which is now asserted in `tailStudy.test.ts` because it is the table `c237d95` moved.

---

## 5. What the documentation task must transcribe

All of these are in files **T9 does not own**. Every "new" value is measured on this branch at
seed 20 260 726 with the shipped estimator (Student-t at `n−1`).

### `docs/05-roadmap.md:380` — item 1, the same stale figures

| old | new |
|---|---|
| `fairness-first` − `eta` is **−0.23 s AWT [−0.41, −0.05]** | **−0.26 s AWT [−0.45, −0.08]** |
| **−1.58 s WT95** | **−1.65 s WT95** |
| **−1.94 s WT99** | **−2.05 s WT99** |

The sentence around them ("The tail terms only earn their weights one load step *above* where the
baseline stops being quotable") is still correct.

### `docs/05-roadmap.md:302` and `docs/07-handoff.md:203` — review finding #4

| old | new |
|---|---|
| `−0.006 [−0.031, +0.019]` attributed to **n = 500** | `−0.006 [−0.021, +0.010]` (mean −0.005801020408, SE 0.007965417897, n = 500) |

`[−0.031, +0.019]` is the **n = 300** deadband-sweep bound and stays wherever the surrounding text
says n = 300. T2 § 4e-4 flagged this; T9 has applied it in `benchmark/index.ts` only.

### `docs/08-review-findings.md` — finding #4

Can be marked **closed in `packages/experiments/`** and **guarded**: `published.test.ts` fails if the
n = 300 literal reappears in an n = 500 position. Still open in `docs/`.

### New material worth recording in `docs/05-roadmap.md` § Phase 5 and `DECISIONS.md`

- The tail study's saturation census `zoned-uppeak` column moved with `c237d95`
  (`0/0/1/2/0/2` → `0/1/3/2/2/5` at 1 / 2 / 2.25 / 2.5 / 2.75 / 3 %), and with it a claim: it is no
  longer true that every arm is quotable at 2 %. `fairness-first` and `capacity-aware` remain
  quotable there, so **no interval or verdict changes** — but "there is no load *above* 2 % at which
  every arm is simultaneously quotable" is now "there is no load *in this sweep*".
- **The guard exists and what it costs** (§ 4), including that a new study in `benchmark/` now fails
  the suite until it is classified.

---

## 6. Requests to other owners

| file | request |
|---|---|
| `docs/05-roadmap.md`, `docs/07-handoff.md`, `docs/08-review-findings.md` | § 5 above |
| `T2-BLAST-RADIUS.md` § 4e items 2 and 4 | Both are now closed in `packages/experiments/`. § 4e-2's "not reproducible from the shipped study" is resolved: it reproduced from `a1ec6ad`, and the file has been corrected forward |
| orchestrator | The § 4 sweeps in `index.ts` have no entry point (§ 4, gap 1). Shipping `runDeadbandSweep()` / `runRateSweep()` would let 13 more published intervals be pinned. Sized at roughly one focused task |
| orchestrator | `packages/cli/**`'s intervals (T2 § 4f) are still unassigned and outside this guard's directory |
