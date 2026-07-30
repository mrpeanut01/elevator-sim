# Handover — the Phase 6c re-measurement on `lunch-two-way`

**Written:** 2026-07-30 · **For:** a fresh agent, cold, in its own thread · **Status of the work it
describes:** not started, not scheduled, and explicitly permitted to end in a third refusal

This document exists so the measurement can be executed without re-deriving anything. It is written
to the standard [`docs/07-handoff.md`](07-handoff.md) sets: **every figure names where it came
from**, every path was verified against the tree on 2026-07-30 rather than copied from a brief, and
**where the brief this document was written from was wrong about the code, the correction is stated
here rather than silently fixed** — § 10 carries all of them. Optimism is the characteristic failure
direction of this repository's registers, so the clauses that cut *against* a positive result are
stated first and not last.

> **Read this before you commit.** Adding this file to `docs/` turns
> `packages/experiments/src/validation/documentation.test.ts` **red** until `README.md`'s
> `## Documentation` table gains a row for it — that suite walks `docs/*.md` on disk and requires
> every entry to be linked (`documentation.test.ts:385-403`; the instance is review finding #2). The
> commit that created this file was scoped to one file and could not add that row. **Adding it is the
> first thing you do**, before anything else in this document.

---

## 1. What is being asked

Measure the learned weight-set selector against the best shipped single profile at
**`midtown-office` under the `lunch-two-way` demand template**, at the operating point that already
ships as `MIDTOWN_LUNCH_TWO_WAY` (`packages/experiments/src/benchmark/arms.ts:404`, id
`lunch-two-way-1.5pct`), **together with its flat-mix negative control**
(`arms.ts:426`, id `lunch-two-way-1.5pct-flat`), and report the verdict against the gate
[`DECISIONS.md`](../DECISIONS.md) § D162 fixes.

**Why this cell and not another.** [§ D156](../DECISIONS.md) refused Phase 6c at all five PRIMARY
cells of a pre-registered eight-cell sweep and **named the mechanism**: `DemandPhase` carried a
scalar intensity, so the directional mix was fixed for a whole run, and the condition a weight-set
selector exists to exploit *did not occur at any shipped operating point*. Measured, not asserted —
Pearson's homogeneity statistic over the time-bin × direction table is inside its own noise at every
cell with more than one direction category, worst standardized deviation **+1.83 σ**, and four cells
have one category by construction (§ D156 § 1).

[§ D169](../DECISIONS.md) built the missing condition. `lunch-two-way` swings the mix from
outgoing-dominant to incoming-dominant across one 30-minute period: **χ² 383.4 against a flat
control's 4.8**, worst z **+8.36 σ**, lobby : down ratio ×165 first bin to last, with
`rise-and-fall` at the same point measured in the same apparatus at χ² 15.6 as the like-for-like
baseline. The template is cited (CIBSE Guide D's 45/45/10 period mean) where citable and
derived-with-the-arithmetic-shown where not — `data/traffic-profiles.json:70-80` carries both, and
the `$comment` at :79 is where the distinction is drawn.

**And nothing has been measured on it.** The commit that added the template deliberately ran no
selector arm; the ordering is the evidence (§ D162 condition 3). [`GAPS.md`](../GAPS.md) § 1 is the
register entry, and it is the largest open item in the project.

### A third refusal is an explicitly permitted, reportable outcome

§ D162's closing section says so in its own words: the template may ship, be cited, be part of the
product, and **the selector may still fail to clear the gate on it — or clear it and be refused by
the flat-mix control.** That would close the question § D156 opened rather than leaving it open a
third time, and it is a *stronger* result than a criterion bent to fit.

Two refusals already stand and neither is superseded by this work:
[§ D145](../DECISIONS.md) (one cell, ΔTTD `−0.213 [−0.440, +0.014]`, n = 200, disjoint seed) and
[§ D156](../DECISIONS.md) (eight cells, NOT ACCEPTED at all five PRIMARY, two of which cleared
Holm–Bonferroni and were refused anyway because the effect was a third to a half of what the
apparatus can resolve there). **Do not restate either as weaker than it is** — § D162's own
bad-criterion list names *"accepting on the mix-varying cell while quietly leaving § D156's eight
refusals unstated."*

---

## 2. Why this was moved out of wave 11

A measurement campaign and UI polish competing for one idle machine is the configuration
[`docs/07-handoff.md`](07-handoff.md) § 1 records **wave 5 failing under**: eight lanes on a 10-core
machine, each spawning a full vitest worker pool, **load average 198 with 31 vitest processes** —
roughly 20× oversubscription. Two lanes stalled without reporting, four committed nothing for tens
of minutes, and one lane's stray unscoped `pkill` killed *other* lanes' workers, after which a
builder saw an error in a package it had never touched and correctly refused to say whether it was
pre-existing.

The rule that came out of it is the operative one here: **parallelise the work, serialise the
measurement.** Every number in this document's scope is a paired-t interval over hundreds of
replications; a run taken under contended load is not wrong so much as *unreportable*, and the same
document warns twice not to treat wall-clock as a fixture (six true suite runtimes, none a property
of the code). This measurement therefore gets a thread and a machine to itself, and that is the
whole reason it is not in a wave with viewer work.

It is also **not** deferred for want of capability. The template ships, the negative control ships,
the study machinery ships, the protocol is pre-registered. What is missing is compute time and an
owner.

---

## 3. The five § D162 conditions, in full

§ D162 asked whether a mix-varying operating point may accept Phase 6c *at all*, stated the
objection at full strength — a template authored knowing what a selector exploits is, on its face,
constructing the test so the arm passes — and answered **conditionally yes**, under five conditions
that must **all** hold. Three are already discharged by shipped artefacts. Two are yours.

### Condition 1 — authored from reference evidence, cited, and not tuned · **ALREADY SATISFIED**

*Why it exists:* a split chosen because it made an arm win is a fabricated measurement.
[`CLAUDE.md`](../CLAUDE.md) § Reference data already requires a cited reason to change a reference
value, and no exception is made because the value is new.

*How to check it is met:* `data/traffic-profiles.json:70-80`. The period mean 45/45/10 is CIBSE
Guide D's, with BCO's *Guide to Specification* pairing the same split with 13 %/5 min two-way
demand; alternatives (40/40/20 Barney, 42/42/16 BCO 2009) are **recorded rather than averaged**. The
two endpoints are **derived and say so**, from the mechanism the sources describe plus three stated
assumptions, and the arithmetic is shown the right way round: `(0+90)/2 = 45`, `(90+0)/2 = 45`,
`(10+10)/2 = 10` — the cited mean is *reproduced by* the endpoints rather than asserted beside them.
Every geometric number (30-minute period, five-minute hold, zero baseline) is inherited from the
existing rise-and-fall record. **The cited part of this template is its mix, not its clock**
(§ D169).

*Your obligation:* none, except not to re-author it. **If you change any split, duration or rate in
this template, condition 1 fails and the measurement is void.** Vary `mixAmplitude` and nothing else.

### Condition 2 — it ships as a shipped operating point of a building, for its own reasons · **ALREADY SATISFIED**

*Why it exists:* this is the **load-bearing** condition. A template that is part of the product is a
thing the world made; a template that exists only to be measured on is a thing we made to pass.

*How to check it is met:* `midtown-office` carries the lunch two-way point because it is the
project's primary office building and Phase 2 validation case, it shipped no lunch point, and
[`docs/03`](03-traffic-and-statistics.md) has named two-way a governing peak since it was written.
The point copies `MIDTOWN_INTERFLOOR_MIX` exactly — same building, same 1.5 %/5 min, same 1800 s,
same entrance weights, same full-run window — so **the only difference between the two points is
where the directional mix comes from** (`arms.ts:380-403`). The rate is not a free choice made for
this measurement: it is the rate a censused, shipped Midtown point already runs at.

*The rate that is deliberately **not** used, and why:* the BCO pairs this mix with **13 %/5 min** in
a *design* calculation. `nearest-car` already loses its AWT on Midtown at 2 %; 13 % would saturate
the building many times over and produce no quotable interval for anybody. `arms.ts:390-394` records
this. Do not "improve" the point by raising the rate to the cited figure.

### Condition 3 — authored, cited and committed before any 6c arm runs · **ALREADY SATISFIED, AND THE ORDERING IS ON THE RECORD**

*Why it exists:* the ordering **is** the evidence against § D162's own objection.

*How to check it is met:* § D169's header reads *"built by a lane forbidden to measure a selector on
it"* and its Impact paragraph closes *"no selector arm was constructed, run or measured — the commit
ordering is the evidence."* The registration record agrees: `measureLunchTwoWayMix` is declared
`'no-intervals'` in `packages/experiments/src/benchmark/published.ts` (in `STUDY_ENTRY_POINTS`, from
:794) with the comment *"It constructs no `Simulation` and names no dispatcher: § D162 condition 3
forbids the commit that adds the template from also adding a selector result."*

*Your obligation:* do not retroactively edit the template's commit, and do not fold your selector
result into a commit that also touches `demandTemplate.ts` or `traffic-profiles.json`.

### Condition 4 — the gate is § D139 as raised by § D140, unchanged · **YOURS**

Itemised in § 4 below. **Nothing about it is relaxed to accommodate a new kind of cell.**

### Condition 5 — the flat-mix negative control · **THE CONTROL SHIPS; RUNNING IT IS YOURS**

*Why it exists, and it is the clause that can still refuse the phase:* the same template with the
mix change removed **and total demand held equal** must be measured **in the same run**. If the
selector's advantage survives on the flat-mix control, **the advantage is not about mix variation**
— it is the busy/idle schedule § D156 already found at `midtown-down-peak-1pct`, or a wiring fault,
and in either case it is **a bug report and not an acceptance**. § D156's one significant cell
learned exactly that: `fairness-first` 79.7 % / `energy-aware` 20.3 %, five pattern changes a run,
and the second regime was `idle`, which is triggered by the **level**. That is why this clause
exists rather than being assumed unnecessary.

*How to check it is met:* the control **ships** — `MIDTOWN_LUNCH_FLAT_CONTROL` at `arms.ts:426`,
identical to the treatment in every field except `demand.mixAmplitude: 0`. § D169 made this
first-class deliberately, *"so the lane that eventually measures cannot quietly build its own control
and let it drift from the treatment."*

**`mixAmplitude: 0` is not "no mix".** At amplitude 0 the phases still carry the mix, every knot
equal to the period mean, so the control runs flat at 45/45/10 at identical total demand. Dropping
the splits instead would return each floor to `office-standard`'s 85/5/10 and the control would
differ from the treatment **in the mean mix as well as in its variation**, which is not a control.
The damping is `split(t) = mean + amplitude · (authored(t) − mean)` at
`packages/core/src/traffic/demandTemplate.ts:430-434`; the type documents the reasoning at
`packages/core/src/traffic/types.ts:470-483`; and `mixAmplitude: 0` takes the **pre-existing static
code path deliberately**, because rescaling by a multiplier of one sums in a different order and
moved every arrival time by one unit in the last place (§ D169).

---

## 4. The gate, unchanged, itemised

Every clause below is § D139 as raised by § D140 and by § D151 §§ 2–3. **You may raise it. You may
not weaken it** ([`CLAUDE.md`](../CLAUDE.md) § Working agreements).

| # | Clause | Source | Where it is enforced in code |
|---|---|---|---|
| G1 | **Arms:** the learned selector against the **best shipped profile at this operating point**, chosen by this point's **own census** before any selector exists. Never `nearest-car` | § D139 | `censusSelectionPoint` → `SelectionCensus.referenceProfileId`, `weightSetSelection.ts:902-965` |
| G2 | **Metric: TTD, and only TTD.** `comparabilityOf` lists AWT and WT95 among nine metrics that stop being comparable across the two passenger models | § D139 | `SELECTION_GATE = 'ttdMeanS'`, `weightSetSelection.ts:169` |
| G3 | **Paired-t interval excluding zero on the better side, under CRN.** Never two intervals compared for overlap | § D139, `CLAUDE.md` § Statistical discipline | `compareCell`, and `crnAligned` is measured per arm at `weightSetSelection.ts:1160-1168` |
| G4 | **Budget 50–200, sized to this point's *own* saturation census.** Never inherited from a neighbouring module | § D139 | Clamp at `weightSetSelection.ts:1113-1117` — **see hazard H1, it has no lower bound** |
| G5 | **The resolution limit is measured on TTD at this cell**, not inherited from `docs/07` § 4's AWT figures | § D151 § 3, § D156 § 2 | `probeCellResolution`, `selectionSweep.ts:838-912`; `smallestDetectableEffect` :799 |
| G6 | **An effect below that limit is `NOT ACCEPTED`**, not accepted-with-a-caveat. This is a **gate condition**, not a reporting note | § D140 (the raise) | `SelectionArmResult.belowResolutionLimit`, consumed in the verdict biconditional at `selectionSweep.ts:1165-1168` |
| G7 | **Tuned on one seed set, validated on a disjoint one**, both printed, with a holdout verdict | § D139, `CLAUDE.md` § Tuning discipline | `SelectionStudy.holdoutVerdict`, `weightSetSelection.ts:1059` |
| G8 | **Costs published beside the verdict and never folded into it** — ΔAWT, ΔWT95, and energy as an **axis, never a score**, with the per-served-leg figure beside the raw one | § D100, § D106 | `SELECTION_COSTS`, `weightSetSelection.ts:172-180` |
| G9 | **Multiplicity correction** where more than one cell is judged | § D151 § 3 | `holmDecisions`, `selectionSweep.ts:948` |
| G10 | **The 2 s deadband known-answer is still rediscovered blind.** `idle.repositionThresholdS` ships at 8 s and is left wrong on purpose. A search returning 8 s **has failed, not agreed** | § D139 | `runDeadbandKnownAnswer`, `weightSetSelection.ts:753`; constants :845-846; the `rediscovered` bracket is `[1, 3]` s at :838 |
| G11 | **A bit-identical run is a wiring bug until proven otherwise.** An interval of exactly `[0, 0]` with `rho = 1` is not a small effect and no budget resolves it | § D139 | `identicalReplications` per arm; and see hazard H3 |
| G12 | **A significant effect at a one-regime cell is a bug report, not a result** | § D151 § 5 | `significantAtOneRegimeCell`, `selectionSweep.ts:1002`, :1195 |

**On G9 for this measurement.** § D151's Holm families are the five PRIMARY and three SECONDARY
cells of that sweep. This measurement is a **new cell set** — treatment and flat control — and it is
not a member of either family. **You may not pool it with either**; § D151 § 3 forbids pooling
families to enlarge either, and § D151 § 8 names *"pooling the primary and secondary families"* as a
thing that would make the criterion bad. State your own family explicitly and correct within it.
If you judge exactly one treatment cell against one gate, say so and say that no correction was
needed; if you add cells (e.g. a second `mixAmplitude`), correct across them and declare the family
**before** you see a ΔTTD.

---

## 5. The three hazards, stated before the procedure

### H1 — the study's budget clamp has **no lower bound**

```
const requested = options.replications ?? VERDICT_REPLICATIONS;
const replications =
  census.ceiling === undefined ? requested : Math.min(requested, census.ceiling);
```
`packages/experiments/src/benchmark/weightSetSelection.ts:1113-1117`

If the lunch census returns a small ceiling — and it may, because the point has **never been
censused** — `runWeightSetSelectionStudy` will run at that ceiling **without complaint**, silently
below [`CLAUDE.md`](../CLAUDE.md)'s 50-replication floor. Ten replications produced a **12 % error
against the converged mean** in the reference study; that is the exact failure this floor exists to
prevent.

**Only `matrix.ts` enforces the band.** `MIN_REPLICATIONS = 50` / `MAX_REPLICATIONS = 200` are
declared at `packages/experiments/src/benchmark/matrix.ts:159-160` and applied by `budgetFor` at
:174 — *"Neither end is ever silently crossed"* is that file's comment, and it is true of that file
only.

**What you must do:** read `SelectionCensus.ceiling` and `SelectionCensus.allArmCeiling`
(`weightSetSelection.ts:878-891`) yourself, **before** you accept whatever `replications` the study
returns, and compare `study.replications` against 50 explicitly. If the ceiling is under 50, the
honest outcome is the one `doubleDeck.ts` already models: **publish the point UNQUOTABLE rather than
run it under-budgeted, and do not lower or raise a budget after seeing an answer** — see
`doubleDeck.ts:520-540`, where a pre-registered budget of 200 was left at 200 and the point declared
UNQUOTABLE when a re-census dropped the ceiling to 90.

### H2 — the shipped arc is the **widest** amplitude consistent with its citation, and that cuts against you

An endpoint of exactly **0 % incoming** at the instant the period opens is the widest arc the cited
mean permits. A real building's departures and returns **overlap**, so a measured building's arc is
smoother at both ends. § D169 records this as its *first* known limit and says why in one line:
**a wider arc is the one a selector finds easiest to exploit.**

So this is not a caveat you add at the end. It is a standing discount on any positive result, and it
must appear **in the same paragraph as any ΔTTD you report as better**, not in a limitations section
below it. [`GAPS.md`](../GAPS.md) § 2 already states it *"first in three places rather than last"*.

The instrument for it is `mixAmplitude` (`types.ts:483`, schema at :865-874, default 1 at :610). If
you have budget for a third arm, **an intermediate amplitude is the single most informative thing
you can add**: an effect that scales with the arc is evidence about mix variation; an effect flat in
the arc is evidence about something else, and § D162 condition 5 already tells you what that
something else probably is.

### H3 — `eta` and `collective` ship the same weight vector, so a whole regime can be a no-op

§ D156 § 5 found it and nobody was looking for it: both are `{ waitTime: 1.0 }`, and the selector
switches **weights and nothing else** (deliberately — `dispatch.callType` decides the passenger
model, and `comparabilityOf` lists nine metrics that stop being comparable across it). So at every
cell whose census picks `collective` as the reference, the `interfloor` regime selects a vector the
run already had, and **every replication spent in that regime is bit-identical by construction.**

That is also the **measured discharge of G11** at those cells: a high identical count there is not a
wiring bug. The distinction is carried in the study object rather than in prose — `noOpWeightSets`,
computed by `sameVectorAs` at `selectionSweep.ts:1127-1140` and set at :1196, printed by
`formatSelectionSweep` at :1321-1324.

**Why it matters here specifically.** § D145's census at `midtown-office` interfloor-mix 1.5 %
returned **`collective`** as the reference arm, and the lunch point is the same building at the same
rate for the same duration. If your census returns `collective` or `eta`, you must report
`noOpWeightSets` beside the identical-replication count, or a reader cannot tell G11's wiring bug
from this cell's construction.

---

## 6. Step 0 — the census, and the budget derived from it

**Do this first, and do it before any selector exists.** The reference arm and the budget must be
fixed before the thing being graded exists; that ordering is what stops the reference being chosen
after seeing the result, which § D139's own bad-criterion list names.

### 6.1 What to run

`censusSelectionPoint` — `packages/experiments/src/benchmark/weightSetSelection.ts:902`. It runs all
twelve shipped profiles at the cell over `CENSUS_REPLICATIONS` (200, :210) and returns
`SelectionCensus` (:878):

| field | what it is | line |
|---|---|---|
| `rows` | one `CensusRow` per profile: `quotable`, `ceilingExcluded`, `meanTtdS`, `firstInvalidReplication` | :869-877 |
| `referenceProfileId` | the best **quotable** shipped profile on TTD. **This is the reference arm** | :884 |
| `ceiling` | the **reference arm's own** first-invalid index — the one the budget clamps to | :890 |
| `allArmCeiling` | the conservative min-over-twelve. **Reported beside the budget and never the budget** | :892 |

**Which ceiling, and why it is not the conservative one.** § D151 § 2 declares it and it changed
three cells of that sweep: a ceiling is an **arm-set** property, not only a
`(building, traffic, seed)` property, and the two diverge sharply — at `vertical-city` up-peak the
all-twelve ceiling is 10 and the reference arm's own is above 200. This study clamps by the
**declared arm set** (reference arm, learned arm, fuzzy arm) because the excluded arms are not in
the comparison. The comment is at `weightSetSelection.ts:954-961`.

**`firstInvalidOf` reads all four grounds, and this is a fix you must not undo.** It is
`weightSetSelection.ts:995`, and it reads `ReplicationRecord.awtIsValid` — the rule itself — rather
than `summary.saturation.saturated`, which is **one** of the four grounds. § D151 § 2 recorded the
under-report and forbade reusing the function unfixed; § D156 § 0 measured it: at
`garden-apartments` interfloor-mix 1.5 % **nothing saturates** at either censused seed and **no arm
keeps a quotable AWT** — all twelve fail with *"No passenger was served within the reporting
window"* — where the strict ceiling is 32 and 22 and the saturation-only reading returned `none` at
both. `CLAUDE.md` § Statistical discipline states the same rule from the other end: saturation is
one of four grounds, the others being an empty window, censoring above the unserved limit, and a leg
past the 900 s abandonment horizon.

> **There is no `benchmark/saturationCensus.ts`.** `benchmark/saturationCensus.test.ts` is a test
> only — it exists to keep *excluded by its ceiling* distinguishable from *excluded by its answer*
> (the instance is § D100's 3 % row). The reusable census machinery is `censusSelectionPoint` and
> `firstInvalidOf`, both in `weightSetSelection.ts`. Do not go looking for a module that is not
> there and do not write a second one.

### 6.2 What to record

Record all of it, on **both** the treatment and the flat control, and publish it whatever it says:

- Every `CensusRow` — the full twelve-profile TTD table. § D145 published its equivalent and it is
  what made *"`nearest-car` is 41 s of TTD behind the best arm here"* checkable.
- `referenceProfileId`, and **whether it is the same profile on the treatment and on the control.**
  If the two disagree, say so loudly: the comparison is then reference-arm-dependent and the control
  is weaker evidence than it looks. § D156 § 5 hit the analogous case (`auction` where § D151
  pre-registered `auction-multi-round`) and its handling is the model — **reported, not
  substituted**, carried as `referenceMatchesPreRegistration: false`.
- `ceiling` **and** `allArmCeiling`, separately, with the arms that set each.
- The count of quotable arms. If it is zero, `censusSelectionPoint` throws by design
  (`weightSetSelection.ts:945-949`) — *there is no reference arm and therefore no comparison* — and
  that is the result, not an error to work around.

### 6.3 How to derive the budget

Two shipped worked examples. Follow one and name which.

**Variance-derived (preferred where the point is clean):** `matrix.ts:156-230`. `budgetFor(sd)` at
:174 returns `ceil((z · sd / h)²)` clamped to `[50, 200]`, with `h = TARGET_HALF_WIDTH_S` (1 s, :155)
and a **normal** rather than a `t` quantile for a planning figure in the tens-to-hundreds. The
binding arm is *"the largest `sd` among the arms with **zero** invalid replications in the census"*,
and the restriction is what makes the rule non-circular — including an arm that saturates at some
`n` inside the band makes the budget a function of itself (`matrix.ts:184-196`). `BudgetBasis`
(:184-205) is the shape to record it in: `bindingArmId`, `sdOfDifference`, `unclampedReplications`,
`clamped: 'floor' | 'ceiling' | 'none'`.

**Pilot-variance at a disjoint seed (preferred where you want the budget provably independent of the
data it grades):** `doubleDeck.ts:142-166` and :474-540. `PILOT_SEED` is at :480 and is disjoint from
the study seed *"because a budget derived from the spread of the very replications it then reports
is a budget chosen after seeing the answer."*

**And the honest case, which is the one to read twice:** `doubleDeck.ts:520-540`. A re-census dropped
that point's ceiling from 386 to 90; the pre-registered budget of 200 was **left at 200** and the
point published **UNQUOTABLE**, *"rather than lowered to something that fits under 90, because a
budget chosen after seeing the answer is the thing `PILOT_SEED` exists to prevent."* If the lunch
census leaves you in that position, that is your result.

**Then check H1 by hand.** `study.replications` below 50 is a floor breach the machinery will not
tell you about.

---

## 7. Steps 1..6 — the run

Everything below is a `packages/experiments` entry point. Run **serially, on an idle machine**
(§ 2), and record the wall-clock as an observation rather than a fixture.

### Step 1 — the regime screen, before any ΔTTD

`screenRegimes` — `packages/experiments/src/benchmark/selectionSweep.ts:441`, returning `RegimeScreen`
(:365) whose `regimeCount` (:375) is the field the verdict reads at :1195.

This measures whether the **three detector inputs' ratios** move enough within the window to cross
the selector's own switching margin, on the shipped detector at its authored gains. § D151 § 5 is
the declaration that legitimises it, and the constraint on its use is fixed there: **the screen is a
moderator for interpretation, never a filter for inclusion.** You do not drop, reweight or reorder a
cell on the strength of it. T50's objection — *"a cell with only one live regime predicts a selector
that never switches, which is outcome information wearing a feasibility label"* — is why the
declaration exists.

**What you are looking for, and what would be a surprise.** The mix-liveness study already measured
the *traffic* — `measureLunchTwoWayMix` in `benchmark/lunchTwoWay.ts:271`, driven by
`livenessSuite.ts:44`, χ² 383.4. That is a fact about the arrival process. `screenRegimes` measures
what **the detector** makes of it, which is a different question and is the one that matters. Report
both. If the screen returns **1** on a template whose χ² is 383.4, that is a finding about the
detector's gains or its window and it belongs in the write-up **before** any ΔTTD — not after.

Read the arrivals-per-window column with it. § D156 § 1's mix ratios wobbled to 100 % on **4 to 36
arrivals** in a 300 s window, which is counting noise, and *"a screen that reported a moving ratio
without that column would let sampling noise read as traffic variety."*

**The mechanism worth naming in advance.** `data/dispatcher-profiles.json:179-206` is the
`patternSwitching` block. Its `two-way` pattern (:189) requires **both** `lobbyArrivalRate` and
`downPeakRate` in `[0.002, 0.008]` — the only pattern in the set requiring both directions live —
and maps to `predictive-balanced` (:201). The lunch arc's midpoint is exactly the condition that
membership describes. **If `two-way` never becomes the incumbent during your runs, the measurement
is testing something other than what it was designed to test, and you must say so.** Two selector
settings decide whether it can: `selection.hysteresisS` is a dwell time defaulting to **120 s**
(`packages/core/src/dispatch/selector.ts:571`, declared :300), so an 1800 s run admits at most ~15
switches; and `selection.switchMargin` is the learned half, **inert at its default of 0** (:582,
declared :310). `selectWeightSet` is :524 and `resolveWeightSets` is :361.

### Step 2 — the resolution limit, on TTD, at this cell, at the **tuning** seed

`probeCellResolution` — `selectionSweep.ts:838`. It measures two paired spreads at the cell and
converts each with `smallestDetectableEffect` (:799), the analytic 80 %-power figure
`(t[0.975,n−1] + t[0.80,n−1]) · s_D / √n`:

- **near-neighbour** — the reference profile against itself perturbed by `distanceTravelled = 0.4`;
- **structural** — the reference profile against each of the weight vectors
  `weightSetsByPattern` names, i.e. **the set the selector may actually adopt**, median over the
  quotable ones, every pair published.

**At the tuning seed and never the holdout seed.** The docstring at `selectionSweep.ts:830-837` gives
the reason and it is the sharpest sentence in the module: a limit measured on the arm's own paired
spread at the verdict seed would make *below the resolution limit* **arithmetically identical to**
*the interval contains zero*, which would quietly delete § D140's raise.

Two facts about the numbers you will get:

1. **The formula is calibrated, not asserted.** § D156 § 2 checks it against `docs/07` § 4's own
   0.20 s — the `+0.4 distanceTravelled` rung, detected on 8 of 10 disjoint seed sets at a measured
   effect of 0.2002 s, against an analytic 0.2165 s: agreement to 8 %.
2. **§ 4's two published numbers were not computed the same way, and the larger definition is the
   one in use.** The structural pair prices at 2.23 s under 80 % power where § 4 publishes 1.9 s, and
   1.9 s is what `1.96 · s_D / √n` returns — a *just-significant* figure. This lane uses 80 % power
   at both regimes, because that is what § 4's own label states and because it is the **larger** of
   the two, which is the only direction `CLAUDE.md` § Working agreements permits.

Measured across § D156's eight cells the structural limit came out between **0.509 s and 0.991 s** —
everywhere *smaller* than the 1.9 s § D145 inherited, i.e. the **permissive** direction. Expect a
figure in that neighbourhood and treat a wildly different one as a question about your apparatus
before it is a fact about the cell.

`probeCellResolution` takes `config: LoadedConfig` in its input, which
`SelectionStudyOptions.resolutionProbe` does **not** pass (`weightSetSelection.ts:1075-1088`). Close
over it, exactly as `runSelectionSweep` does at `selectionSweep.ts:1110-1120`.

### Step 3 — the study, on the treatment

`runWeightSetSelectionStudy` — `weightSetSelection.ts:1098`. Its internal order **is** the criterion's
(census → limit → learning → verdict), and nothing is chosen after a result is seen. Pass:

| option | value | why |
|---|---|---|
| `cell` | `{ id: 'midtown-lunch-two-way-1.5pct', building: 'midtown-office', point: MIDTOWN_LUNCH_TWO_WAY }` — the `SelectionCell` shape at :155 | the study is parameterized by cell; `SELECTION_CELL` (:162) is § D145's and is only the default |
| `seed` | your tuning seed | § D156 used `SWEEP_TUNING_SEED` (`selectionSweep.ts:271`) |
| `holdoutSeed` | **disjoint**, and asserted so | `SelectionStudy.seedsDisjoint` (:1040) is measured, not assumed |
| `replications` | your § 6.3 budget | **not** `VERDICT_REPLICATIONS` by reflex — see H1 |
| `censusReplications` | 200 unless the ceiling forbids it | `CENSUS_REPLICATIONS`, :210 |
| `searchCandidates` | **64** | calibrated on the deadband dimension **whose answer was known**, and not on any 6c result: 1.691 s at 64 draws, 1.490 s at 128, 1.874 s at 256, against a 32-draw run of 4.855 s reported rather than discarded. `SEARCH_CANDIDATES`, :228 |
| `resolutionProbe` | the Step 2 closure | omitted, `INHERITED_RESOLUTION_LIMITS` (:1031) stands and you have silently reverted § D151 § 3 |

The three arms are built at `weightSetSelection.ts:1138-1143`: `reference` (the census's pick),
`fuzzy` (Phase 7's detector, measured beside), and `learned` (Phase 6c). **The fuzzy arm is not the
gate** — it is Phase 7's bullet, and § D145 is the standing warning about it: its interval *did*
exclude zero (`−0.212 [−0.416, −0.007]`) and it was **still** reported below the resolution limit.
Report it, and do not let it stand in for the learned arm.

### Step 4 — the same study, on the flat control

Identical in every argument except `cell.point = MIDTOWN_LUNCH_FLAT_CONTROL`, **including the seeds**
— § D162 condition 5 requires the control *"measured in the same run"* at *equal total demand*, and
a control run on different traffic is not a control. § D162's bad-criterion list names *"running it
at a different total demand so it is not a control."*

### Step 5 — the deadband known-answer

`runDeadbandKnownAnswer` — `weightSetSelection.ts:753`. Same search machinery, pointed at
`idle.repositionThresholdS` on a different building (`garden-apartments`, :843) with a different
profile (`predictive-balanced`, :844) at a different metric, knowing nothing about deadbands. Shipped
value 8 s (:845), known interior optimum 2 s (:846), `rediscovered` true iff the winner lands in
`[1, 3]` s (:838).

**Run it in the same session and report it.** It is what makes every ΔTTD a fact about the policy
rather than about the machinery that fitted it. § D156 § 6 got 1.691 s at ΔAWT −2.189 s. **A run
returning 8 s has failed, not agreed** — and in that event your ΔTTD figures are uninterpretable and
must not be published as a Phase 6c verdict at all.

### Step 6 — Holm within your declared family, and the verdict biconditional

`holmDecisions` — `selectionSweep.ts:948`; `pairedPValue` :919. The verdict is a conjunction of four
clauses at :1165-1168 and it is worth reading in the source before you write anything:

```
accepted = better && holm.rejected && !gate.belowResolutionLimit && generalizes
```

Every failing clause produces a stated reason (:1170-1182), and `formatSelectionSweep` (:1255)
renders the whole thing including the `noOpWeightSets` line (:1321-1324) and the
one-regime bug-report flag (:1344).

---

## 8. Registration and pinning — so this is not an eleventh dead seam

[`CLAUDE.md`](../CLAUDE.md) and [`docs/07`](07-handoff.md) § 3 record **ten** shipped defects of the
form *configurable, unit-tested in isolation, dead in the shipped path*, plus one in `data/`. The
instructive one for a benchmark author is the ninth: **all five** categorical studies in
`benchmark/` had no non-test caller, and `measureEnergyLiveness` had two barrels, a string key in
`published.ts` and its own test while the repository's own scanner printed
`measureEnergyLiveness -> []`. **A barrel re-export and a `{@link}` tag look exactly like a caller
and are not one.** The rule is not *"is it reachable?"* but **"name the non-test caller."**

If you add a study module, you owe all of the following. They are enforced, and skipping any one
turns the suite red rather than passing quietly:

1. **`STUDY_ENTRY_POINTS`** — `published.ts:794`. Every study entry point maps to a
   `PublishedStudyId` **or** to `'no-intervals'`, and `experiments/src/index.test.ts` iterates the
   set **derived from the `benchmark/` directory** rather than a hand-written list. A study added
   without an entry here fails the suite until somebody decides which it is.
2. **`PUBLISHED_STUDY_IDS`** — `published.ts:100`. Add your id here **only if** you publish an
   interval. Phase 6c's gate does, so a new study module publishing a paired-t interval belongs in
   this list.
3. **A driver, and it must not be a test.** Interval studies: `regeneratePins.ts` — the entry goes in
   `measureAllPublishedFigures` at :57-79, beside `'weight-set-selection'` and `'selection-sweep'`.
   Categorical studies: `benchmark/livenessSuite.ts`, which exists **because** the categorical half
   had no driver at all.
4. **A `checkPinned` call, literally spelled.** `published.test.ts:168-183` regex-matches
   `checkPinned('<studyId>'` across every `*.test.ts` in `benchmark/` and fails by name if it is
   absent — *"a pin table nobody compares against is the dead-seam shape one level up."* The two
   existing calls are `weightSetSelection.test.ts:363` and `selectionSweep.test.ts:435`.
5. **A figures function.** `weightSetSelectionFigures` (`published.ts:412`) keys on
   `${armId}/gate/${metric}` and `${armId}/cost/${metric}`; `selectionSweepFigures` (:393) prefixes
   with the cell id. Follow one.
6. **If any headline figure of yours is a *count* rather than an interval, pin it as a count.** This
   is § D149's pattern and it exists because a guard missed a stale figure at **both** of its layers:
   Layer A (the pin table) excluded a categorical on the correct observation that it has no standard
   error, *and that was read as a licence to hold nothing*; Layer B scans for literals shaped
   `N [N, N]` and `51.7 %` is not interval-shaped — the scan did not fail to match it, **it was never
   asked to.** Meanwhile the study's own test asserted inequalities, and every one held *more*
   strongly after the figure went stale. **A stale number that still supports its own sentence is
   the only kind nobody re-checks.** The count-pin pattern is `accessControl.ts:302`
   (`PINNED_COVERAGE`) plus :417 (`derivedCoverageForms()`), asserted **both ways**. Your regime
   counts, switch counts, pattern-occupancy shares and identical-replication counts are all of this
   kind.

**The cheapest correct option is not to add a module at all.** If the treatment and the control can
be expressed as two `SweepCell`s (`selectionSweep.ts:108-123`), the existing `'selection-sweep'`
registration, driver, pin table and `checkPinned` call already cover them — at the cost of moving
`PRIMARY_CELLS` / `SECONDARY_CELLS`, which § D151 § 8 forbids (*"adding a cell after seeing a
result"*, *"dropping a primary cell that refused"*). **Do not edit either constant.** A third,
separately declared family in the same module, or a new module with the six obligations above, are
both admissible; silently growing § D151's frozen arrays is not.

---

## 9. How to write the verdict

### If the gate is not cleared

Say so plainly, in the form § D145 and § D156 already use, and **name the traffic condition
anyway**. A refusal on mix-varying traffic is a materially stronger statement than a refusal on
fixed-mix traffic, and it is the statement § D156 § 7 asked for. Then update:
[`docs/05-roadmap.md`](05-roadmap.md) § Phase 6c and its *What remains* row (:1697),
[`GAPS.md`](../GAPS.md) § 1, [`docs/07-handoff.md`](07-handoff.md), `README.md` and
[`CLAUDE.md`](../CLAUDE.md) — the phase set is asserted equal across three of those by
`validation/documentation.test.ts:144-160`, so a partial edit fails the suite.

### If the gate **is** cleared

§ D162 fixes the sentence you are allowed to write, and it is narrower than the result feels.

**Allowed, and this is close to verbatim:**

> *"Learned weight-set selection improves TTD under traffic whose directional mix changes within the
> run, at `midtown-office` / `lunch-two-way` 1.5 %, by N s [CI], against the best shipped profile at
> that point."*

**Not allowed, in any document, in any wording:**

- *"learned control works."*
- *"Phase 6c is accepted"* **without the traffic condition attached.**
- Any sentence that lets a reader carry the result to a **fixed-mix** operating point. § D151 § 7
  clause 3 fixed this before the template existed: *"selection helps when the directional mix changes
  mid-run"* — never *"selection helps."*
- Any aggregate claim that does not also state § D156's eight refusals. Omitting them is on
  § D162's own bad-criterion list.

**And Phase 6's status sentence must name the traffic condition in the same breath as the verdict.**
§ D162: *"A phase that is accepted only under a traffic condition the shipped buildings did not
previously express is a phase whose status sentence is longer, not shorter."*

**[§ D147](../DECISIONS.md) is the model for the wording**, and it is worth copying its shape rather
than paraphrasing its spirit. Its verdict is *WORSE under `eta`, BETTER under `collective`, one cell
permanently unresolvable*, and its closing sentence is the standard: **there is no verdict of the
form "double-deck is better."** § D147 also carries the discipline for a verdict that later gets
*better* — when [§ D167](../DECISIONS.md) flipped it to `BETTER-EVERYWHERE`, the entry's first
mandatory reading was that **the evidence base narrowed while the verdict widened**, and *"a better
word on a narrower base is not a stronger result."* Your result will be **one operating point**.
Say so at the same volume as the verdict.

### The clause that can still refuse an acceptance

If the treatment clears the gate **and the flat control also shows the advantage**, § D162
condition 5 makes that a **bug report, not an acceptance**. The two candidate explanations are named
in advance: it is the busy/idle schedule § D156 § 4 found — where the learned arm held
`fairness-first` 79.7 % / `energy-aware` 20.3 % with five changes a run, and the second regime was
`idle`, which the **level** triggers — or it is a wiring fault. **Investigate it rather than filing
it**, which is what § D156 § 4 did: it ran the constant-weight-override control (`fairness-first`
pinned for the whole run measured **+1.157 [+0.719, +1.595] WORSE**, so the effect was *not* the
selector degenerating into a static hybrid), instrumented the occupancy shares, and named the
mechanism. Do that here, and report what the policy actually learned rather than that it won.

---

## 10. Corrections to the machinery index this document was written from

Each of these was verified against the tree on 2026-07-30. **A handover that is wrong about the code
is the failure mode this repository has recorded most often** — ten of twenty-one review findings
were documentation drift, and six of the things wave 6 found wrong were in the open-debt register
itself, every one of them optimistic. So the corrections are stated rather than quietly applied.

| Claim as given | Verified state |
|---|---|
| `published.ts` `PUBLISHED_STUDY_IDS` **:701** | **Wrong. It is `published.ts:100`.** Line 701 is inside `UNPINNED_INTERVALS`, the declared-exceptions list. `STUDY_ENTRY_POINTS` at :794 is correct |
| `selectionSweep.ts` cell verdict biconditional **:1176-1180** | **Off by eleven. It is :1165-1168** (`better` :1165, `generalizes` :1166, `accepted` :1167-1168). The reason strings follow at :1169-1182 |
| `data/traffic-profiles.json:71-81` | **The record is :70-80.** `"id": "lunch-two-way"` is at :71 and the citation `$comment` at :79; :81 is the closing `]` of `templates` |
| `types.ts` parameter schema :866-875 | The `traffic.lunchTwoWay.mixAmplitude` block is **:865-874** (`id:` at :866). Its sibling `traffic.lunchTwoWay.durationS` ends at :864 |
| `mixAmplitude` damping at demandTemplate.ts:430-440 | The arc function is **:430-434**. The `[0, 1]` validation and its refusal message are separately at **:400-412** |
| Everything else in the index | **Verified correct**: `demandTemplate.ts` :387 / :678 / :350 / :509 · `types.ts` :610 / :483 · `arms.ts` :404 / :426 / :380-403 · no `saturationCensus.ts` · `weightSetSelection.ts` :869 / :878 / :902 / :995 / :753 / :843-853 / :1113-1117 / :1138-1143 · `matrix.ts` :156-230 / :174 · `doubleDeck.ts` :142-166 / :474-540 · `selectionSweep.ts` :157 / :232 / :271-272 / :799 / :838 / :919 / :948 / :1255 · `selector.ts` :361 / :524 / :571 / :582 · `dispatcher-profiles.json` :179-206 · `regeneratePins.ts` :57-79 · `published.test.ts` :168-183 · `accessControl.ts` :302 / :417 |

### Two things the index did not mention and you will trip over

1. **`weightSetSelection.ts` cites decisions by the *lane's own* numbering, not the integrated one.**
   In-file references to **`§ D126` mean integrated [§ D139](../DECISIONS.md)** (the criterion) — see
   :28, :168, :205, :224, :633, :740, :900, :1054, :1092 — and § D145's header records the same
   collision from the other side: *"the lane's own sources refer to this entry as its § D131, written
   before integration assigned a number."* Integrated § D126 is about interval families and integrated
   § D131 is the deck API; **neither is what those comments mean.** Do not repair the comments as part
   of this work, and do not follow them to the wrong entry.
2. **`TrafficArmSpec.demandTemplate`'s docstring is stale.** `packages/experiments/src/runner/types.ts:373`
   still reads *"`'rise-and-fall'` (the doc's recommendation) or `'constant-iso'`"*. There are three
   shipped templates; `lunch-two-way` is the third and the type itself (`DemandTemplateId`) admits
   it. Cosmetic, but it is the kind of sentence that makes a reader think the point cannot be
   expressed.

---

## 11. What would make this measurement bad, so a reviewer can check

Mirroring § D139 § *What would make this a bad criterion*, § D151 § 8 and § D162's own list, plus
the two failures specific to this cell.

- **Authoring or adjusting any split, duration, rate or endpoint of `lunch-two-way` after seeing a
  selector result.** Condition 1 fails and the measurement is void.
- **Dropping the flat-mix control, or running it at a different total demand, or at different
  seeds.** It is then not a control.
- **Reading `mixAmplitude: 0` as "no mix."** It is a flat run at the period's own 45/45/10 mean. A
  control built by deleting the splits reverts to `office-standard`'s 85/5/10 and differs from the
  treatment in the mean as well as the variation.
- **Accepting on this cell while leaving § D145's and § D156's refusals unstated**, or restating
  either as weaker than it is.
- **Reporting the ΔTTD without stating that the shipped arc is the widest amplitude consistent with
  its citation.** H2. It cuts against a positive result and belongs beside the number, not below it.
- **Running below 50 replications because the clamp allowed it.** H1. The clamp has no lower bound
  and will not tell you.
- **Lowering a budget after seeing an answer** to fit under a ceiling the census revealed. The
  shipped precedent publishes the point UNQUOTABLE instead (`doubleDeck.ts:520-540`).
- **Inheriting `docs/07` § 4's 1.9 s AWT figure as this cell's TTD limit.** § D151 § 3 requires it
  measured on TTD at the cell, and § D156 measured every such limit between 0.509 s and 0.991 s.
- **Measuring the resolution limit at the holdout seed.** It makes *below the resolution limit*
  arithmetically identical to *the interval contains zero* and deletes § D140's raise.
- **Using the regime screen to filter rather than to interpret.** § D151 § 5.
- **Widening the budget, the candidate count or the cell set until an interval excludes zero.**
  § D139's fourth clause, and § D151 § 0 records that a sweep is that clause wearing a disguise:
  eight cells at α = 0.05 each carry a family-wise error rate of ≈ 34 %.
- **Pooling your cells with § D151's PRIMARY or SECONDARY families**, or editing either frozen array.
- **Reporting a bit-identical count as a small effect** — or, in the other direction, **reporting one
  as a wiring bug without checking `noOpWeightSets` first.** H3.
- **Publishing an energy figure as part of the grade.** Energy is an axis, never a score
  ([§ D106](../DECISIONS.md)); `workPerServedLegKJ` goes beside the raw figure, because a
  configuration that spends less by serving fewer people has not saved anything. Both prior 6c
  measurements found energy **worse**, and that is the honest direction: a selector that switches
  into `capacity-aware` and `predictive-balanced` drives more.
- **Skipping the deadband known-answer**, or publishing a verdict after it returned 8 s.
- **Landing the study without a named non-test caller**, a `checkPinned` call, and a count pin for
  every headline count. § 8.
