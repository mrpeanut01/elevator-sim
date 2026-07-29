# The experience layer — Phase 9 contract

**Status: design, not implementation.** Nothing here is built. This document decides what Phase 9
is, what it may not do, and what evidence each unit of work must produce before it is called done.
It is the contract the implementation waves are written against, in the same sense that
[`docs/09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md) was the contract
for Phase 6.

It answers seven requests from the project's owner, tracked as **U2–U8**: basic/advanced modes,
gamification, visible rider queues, human-readable metrics, a dispatcher builder, definable rider
models, and access zoning. Each is a good request. Two of them, taken literally, would destroy the
only property that makes this simulator worth looking at, and § 1 is about which two and what to do
instead.

Every factual claim about the current code in this document was checked against the code and, where
a number appears, against a run. Measurements carry their configuration. The measurement log is
§ 12; the body cites it as **M1**–**M19**.

> ## Reviewed 2026-07-28 — **accepted with changes**, and the changes are folded in here
>
> An independent re-derivation reproduced **13 of the 16 original measurements exactly**. Three
> classes of error were found and every correction below is marked in place rather than silently
> applied, because a design document that quietly changes its own findings is the drift this
> repository exists to guard against.
>
> | class | what was wrong | where |
> |---|---|---|
> | **The energy sections were inverted** | This document was authored against a tree with no energy metric and merged after `f895a16` landed one. § 2.9, § 5.1, § 5.5, § 7.3, **M13** and W2's field list all asserted the axis does not exist | § 2.9, § 5.1, § 5.5, § 7.3, § 11.W2, **M13** |
> | **M10 is refuted** | Schema *discovery* does not run client-side "with no package change" — the functions live in `packages/experiments`, which has no browser export and whose only entry reaches `node:worker_threads`. § 8.5 already said so, so the document contradicted itself | § 2.6, § 11.W4, § 13 q1, **M10** |
> | **Six smaller errors, each verified** | R5's two clauses were mutually exclusive; `meanLoadFactor`'s row mixed two denominators; `intervalCoV`'s row committed the error R10 bans; § 10.4 was refuted by a shipped renderer; **M2**'s TTD clause matched 9 of 12, not 10; R10 cited the wrong source and the wrong remedy | R5, R10, § 7.1, § 7.2, § 10.4, **M2** |
>
> **The energy correction did not weaken a rule.** The prohibition on an energy *score* survives with
> a stronger reason and is now **R11**. Two rules the review found missing were added: **R12**
> (one-run goals need measured across-seed variance) and **R13** (minimum-n disclosure). Four
> measurements were added: **M17**, **M18**, **M19**, and M2's re-derivation.

---

## 0. The one-paragraph summary

Phase 9 is not a skin. The measurement that should govern its scope is **M1**: at the viewer's own
defaults — seed 42, 900 s, each building's shipped traffic profile at `typical` demand — only **14
of 60** building × dispatcher combinations produce a quotable mean waiting time, and **12 of those
14 are Garden Apartments**, a building on which **10 of the 12 shipped dispatchers produce the
identical AWT to three decimal places** and six of them produce a **byte-identical recording**
(**M2**). So the current viewer's honest state space is: one building where nothing you change makes
any difference, and four buildings where the headline number is legitimately refused. A gamified
layer laid on top of that without changing it would have nothing true to say. **Phase 9's first job
is not presentation. It is to give the viewer a set of configurations in which a non-expert's
choices visibly and legitimately matter** — which means shipping scenarios at demand levels below
the saturation ceiling, and it means the demand level becomes a first-class control (U7) before the
gamification (U3) has anything to score.

---

## 1. The rules that keep a gamified surface honest

This project's stated failure mode is reporting confident nonsense. The shipped viewer already
refuses to draw a mean waiting time on a run whose queues diverged, and prints the reason instead;
that refusal is the discipline reaching the screen, and it is the thing most at risk here.

The distinction that matters is **not** technical-versus-plain. `WT95 = 62 s` and *"1 in 20 riders
waited more than a minute"* are the same fact, and the second is not less true than the first — the
risk-communication literature says it is in fact better understood (§ 3.4). The distinction is
**observation versus estimate**, and the codebase has already drawn it: `frame/overlay.ts` splits
`OverlayMetrics` into observations (`waitingNow`, `longestCurrentWaitS`, `boardedInWindow`) that are
never suppressed, and estimates (`rollingMeanWaitS`, per-bank `meanWaitS`) that are suppressed with
the reason. `DECISIONS.md` § D64 records that decision and its reasoning. Phase 9 inherits it whole.

### R1 — Only observations may be scored.

A score may be computed from facts about the run that happened: how many people were delivered, how
long the longest wait was, how many people were still standing at the end, how many riders waited
over a minute, how much of the demand was answered. It may **not** be computed from any quantity the
summary marks as an estimate, and it may not be computed from `summary.meanWaitS`,
`summary.wait95S`, or `summary.meanTimeToDestinationS` unless `summary.awtIsValid` is `true`.

The reason this is not merely defensive: on the shipped configurations, an observation-based score
is *available* on all 60 cells and an estimate-based one is available on 14 (**M1**). The honest
rule is also the only one that ships.

### R2 — A score is a property of a run, never of a dispatcher.

The viewer runs one replication. One replication cannot support the sentence "dispatcher A is better
than dispatcher B" — CLAUDE.md requires a paired-t interval excluding zero over 50–200 replications
under common random numbers, and `docs/07-handoff.md` § 4 measures the smallest detectable effect at
**0.20 s between near-neighbour weight vectors and 1.9 s between structurally different
dispatchers**, both at n = 100.

This is not a theoretical caution. **M7**: Secure Tower under `collective`, 20 consecutive seeds,
900 s — **6 of 20 replications** return a quotable AWT and **4 of 20** are diagnosed saturated. The
same configuration. A badge reading *"no saturation — well played"* on one run of that
configuration is a 70/30 coin flip presented as a skill outcome. **M8** is the same defect from the
other side: on Midtown Office at seed 42, every arm saturates at 4 %/5 min, `eta` and
`predictive-balanced` are quotable at 5 %, and everything saturates again at 6 %. Quotability is
**not monotone in demand at a single seed**.

So: a single-run surface may say *"in this run, X happened."* It may not say *"this dispatcher is
better."* If the product wants to say the second thing — and § 5 argues it should — it must run a
replication batch, and § 11.W3 costs that out (**M6**: 2–196 ms per replication; a 50-replication
batch is 0.1 s on Garden Apartments and 9.8 s on Vertical City).

### R3 — Suppression replaces the number, it never hides it.

When a statistic is suppressed, the surface shows the *reason*, in the reader's register. It never
shows a blank, a dash, a zero, or a substituted number. Basic mode may shorten the reason; it may
not remove it. The full reason must remain reachable from the same place in one interaction.

The current reason strings are usable as-is for an expert and unusable for a novice. This is real
text the viewer prints today:

> Queue length rose by 148.1 persons (29.61/min, 19.9x the queue's own scatter) over the 300 s
> reporting window, against thresholds 8 persons and 0.5/min; the system is saturated, AWT is not
> approximately normal and its confidence interval must be suppressed.

The Basic-mode form of that, which is the same fact:

> **The queues never stopped growing.** By the end of the busy period, 148 more people were waiting
> than at the start — the building could not keep up. There is no meaningful "average wait" for a
> building in that state, so we are not showing one.

Both must be present; which one leads is what Basic/Advanced switches (§ 4).

### R4 — A suppressed run is not a lost run. It is a **result**, and it is the best fail state available.

Saturation is a far better losing condition than an arbitrary score threshold, because it is a real
property of the building rather than a number someone chose. A queue that diverges is legible on
screen (**M5**: the deepest single landing queue reaches **175 people** on Midtown Office at 900 s
and **379** on Vertical City at 1800 s), it is diagnosable, and it is fixable by exactly the levers
the product is trying to teach — more cars, faster cars, zoning, a better dispatcher, less demand.

Therefore Phase 9's fail states are, in order of preference:

1. **Overwhelmed** — `summary.saturated`. The queues diverged.
2. **Abandoned** — `serviceLevel.verdict === 'starved'`; somebody waited past the 900 s horizon.
3. **Stranded** — `status === 'timed-out'` with `undelivered > 0`. People never got where they were
   going.
4. **Locked out** — an access-controlled call no car could legally answer (§ 10).

None of these is invented. All four are already computed by `core`. Three of the four are already in
`VizSummary`; the second is not, and § 11.W2 adds it with its renderer.

### R5 — No score is displayed on a run whose statistics are suppressed *unless every component of
that score is an observation*.

The concrete rule for an implementer: a scoring function's input type must make the *estimate* fields
unreachable. Not a lint, not a convention — the score's input type does not carry `meanWaitS`. This
is the same instrument `overlayAt` already uses, one level up.

> **Corrected.** This rule originally read *"a scoring function takes `VizSummary` plus the
> observation fields, and its type must make the estimate fields unreachable"* — and those two
> clauses are mutually exclusive, because **`VizSummary` carries `meanWaitS`**
> (`packages/viz/src/contract/types.ts`, nine fields: `saturated`, `awtIsValid`, `awtInvalidReason`,
> **`meanWaitS`**, `wait95S`, `meanTimeToDestinationS`, `generated`, `delivered`, `undelivered`).
> A function that takes `VizSummary` can reach `meanWaitS` by construction. The rule as intended:
> the scorer takes a **narrowed** type — `Pick<VizSummary, 'saturated' | 'awtIsValid' | 'generated'
> | 'delivered' | 'undelivered'>` plus whatever observations W2 adds — and the narrowing is what
> carries the guarantee. `VizSummary` itself is not that type and must not be passed whole.

### R6 — A "win" that turned out to rest on an invalid measurement is retracted in place, and says so.

If a player achieves a goal, and the run that achieved it is then found to be suppressed — because
suppression is decided from the whole run and a goal may be evaluated mid-playback — the achievement
is withdrawn with the reason attached, in the same component, without a page transition. The
withdrawal text names what happened: *"This run's queues never stopped growing, so the average wait
this goal was measured against is not a real number. The goal is not met."*

The mechanism that makes this cheap: goals are evaluated from the finished recording, not
incrementally during playback. `recordRun` returns a complete recording before the first frame is
drawn; there is no live simulation to be surprised by. A goal evaluated at frame time from
`overlayAt` is a *preview*, and must be labelled provisional until the playhead reaches `endedAt`.

### R7 — The seed stays visible and copyable in every mode, including Basic.

`UX.md` § 7.1 rule 5 and CLAUDE.md invariant 5. A game whose runs cannot be reproduced is not a
demonstration of a simulator. Basic mode may render it as *"run #1454934106898…"* with a copy
control rather than as a labelled seed field, but it may not drop it.

### R8 — Basic mode may hide complexity. It may never hide a failure.

Enumerated in § 4. The short form: saturation, undelivered passengers, invalid statistics,
locked-out calls, and the seed are visible in every mode. Everything else is negotiable.

### R9 — One source of truth for "may I show this".

`awtIsValid` is copied from the summary and never recomputed (`UX.md` § 7.1 rule 4). Phase 9 adds
scoring and a second surface; both read the same flag from the same place. A scoring module that
re-derives saturation from queue samples is a defect, not an optimization.

### R10 — Do not translate a confidence interval into a probability word.

The IPCC's calibrated-language framework is the largest natural experiment in doing this, and the
finding is that lay readers **misinterpret calibrated likelihood terms regressively** — pulling
"very likely" down and "unlikely" up toward 50 % — with the misreading correlated to the reader's
prior beliefs. So Phase 9 does **not** render `[+0.58, +1.38] s` as *"probably a bit better"*. Where
an interval must be communicated to a non-expert, it is communicated as a **frequency over runs** —
*"we ran it 50 times; the new setting was faster in a way we can actually measure"* / *"the
difference was smaller than the noise, so we can't tell them apart"* — which is the natural-frequency
framing § 3.4 cites, applied to the quantity this project actually has.

> **Two corrections to the citation, both of which strengthen the rule.**
>
> **The regressive-misreading finding is Budescu et al.** — the multi-country experimental work on
> how readers interpret the IPCC's likelihood terms (Budescu, Broomell & Por, *Psychological
> Science* 2009; Budescu, Por, Broomell & Smithson, *Nature Climate Change* 2014). The two links this
> rule originally carried are not that work; they are a chapter on IPCC uncertainty treatment and a
> later *Climatic Change* paper. Cite the source that contains the finding.
>
> **The remedy the IPCC adopted was dual presentation, not abolition.** AR5 did not stop using
> likelihood words; it began printing the **numerical range beside the word** — *"likely (66–100 %)"*
> — because Budescu's experiments found the misreading is substantially reduced when the number
> accompanies the term, and is *not* reduced by the term alone however carefully defined. That is a
> stronger result for this document than "do not translate": it says a word without a number is the
> failure mode, and a word **with** a number is a documented remedy.
>
> So R10's operative form is: **never a word alone.** Either the interval, or a frequency over runs,
> or — if a word is used at all — the word *and* the number in the same phrase, in that order of
> preference. Phase 9's default remains the interval or the frequency, because those need no word.
>
> *Provenance: this correction comes from the design review, and unlike every other figure in this
> document it was **not** re-derived by running anything — the two papers were not fetched. It is
> recorded as a citation correction to be checked against the sources, not as a measurement.*

### R11 — Energy is an axis, never a score.

The energy proxy exists (§ 2.9). It may be displayed beside AWT and WT95 and never aggregated into a
grade, and `workPerServedLegKJ` goes beside the raw figure. Measured: `nearest-car` is on the Pareto
front at **six of eight** matrix cells *because it is worse at serving people*, so any eco score
ranks the worst dispatcher first. § 7.3 gives the five-clause form.

### R12 — A goal judged on one run must have its across-seed variance measured and published, or it is a batch goal.

R2 already says a *score* is a property of a run and never of a dispatcher. This is the same argument
applied to **goals**, and it bites harder, because a goal that always passes or always fails is not
merely noisy — it teaches nothing while looking like an achievement.

**Measured on the design's own stage-5 building.** Secure Tower, `collective`, seeds 1000–1019,
`durationS: 900`, `onTimeout: 'report'`, evaluating § 5.2's five single-run goals:

| goal | passes | information |
|---|---|---|
| `deliver-everyone` (`counts.unserved === 0`) | **0 / 20** | none — it is a constant |
| `nobody-abandoned` (`serviceLevel.verdict !== 'starved'`) | **20 / 20** | none — it is a constant |
| `answer-the-demand` (`personsPer5Min >= offeredPer5Min`) | **0 / 20** | none — it is a constant |
| `long-waits-under` (`pctOverLongWait <= 10`) | **11 / 20** | a coin flip, and the rate is a free parameter of the threshold |
| `everyone-can-get-there` (zero locked-out calls) | **not evaluable** | see below |

Three of the five carry **zero information** on this building at this operating point: the player's
choices cannot move them and the outcome is decided by the configuration. The fourth is a coin flip
whose pass rate is set entirely by the threshold the scenario author picks — which makes the
threshold, not the player, the thing being tested. For reference, the same batch gives 4/20
`saturated` and 6/20 quotable, reproducing **M7**.

The fifth is a **second finding**: `everyone-can-get-there` is listed in § 5.2 as checkable from
"zero locked-out calls (§ 10)", and § 10.4 says the recording **cannot distinguish a locked-out call
from an unanswered one today**. The goal table and § 10.4 contradict each other; § 10.4 is the one
that matches the code.

**The rule.** Before a goal ships as single-run, run it over at least 20 seeds on its own scenario
and publish the pass rate in the scenario file beside the goal. A pass rate of 0 or 1 makes it a
statement about the configuration — state it in the brief instead. Anything in between makes it a
batch goal, judged over the scenario's declared `replications` with the fraction reported, which
§ 5.2 already does for `no-divergence` and `beat-the-baseline` and which § 3.4 says lay readers read
well.

> ## Measured across the whole progression 2026-07-29, and **R12 empties its own middle category**
> (**M30**, **M31**; § 11 **W9**; the table is `data/scenario-goals.json`)
>
> **The trichotomy above is exhaustive over `[0, 1]`.** A rate of 0 or 1 is a configuration fact;
> anything else is a batch goal; there is nothing left for a single-run goal to be. That is not a
> reading chosen to be tidy — it is what the rule says, and the implementation has no `single-run`
> disposition because there is nothing for one to hold. **A campaign built on § 5.2's table is a
> campaign of batch goals and briefing facts.** Said plainly: R12, applied honestly, does not
> *filter* the single-run goal category; it **abolishes** it, and the seven-stage measurement below
> is what it looks like when it does.
>
> Measured on all seven of § 5.4's stages — every stage a candidate for every kind, two disjoint
> seed sets of **50** each, `durationS: 900`, `onTimeout: 'report'` — the 35 (goal × stage) cells
> with a per-run predicate land: **14 batch goals, 19 configuration facts, 2 unjudgeable.** Every
> stage keeps at least one; stage 1 and stage 3 keep exactly one, and on stage 3 — *Overwhelmed* —
> the one that survives is `nobody-abandoned`, with saturation, delivery and answered demand all
> decided before the player arrives. That is the right shape for the stage § 5.4 says is about
> *diagnosing* a building rather than beating it, and it was measured rather than arranged.
> `beat-the-baseline` ships on every stage besides these, unmeasured and undemoted, because it was
> never a one-run goal for R12 to reach.
>
> **M18's own table is corrected by its own rule.** M18 called `answer-the-demand` a constant on
> Secure Tower at 0/20. At n = 50 on two disjoint seed sets it is **3/50 and 1/50** — a very
> low-rate *variable*, not a constant, and therefore a batch goal rather than a briefing fact. A
> classification taken at twenty seeds moved at fifty, which is § D158's operational finding
> arriving exactly where it was predicted to. `deliver-everyone` (**0/50**, 0/50) and
> `nobody-abandoned` (**50/50**, 50/50) reproduce as constants.
>
> Two clauses this measurement adds to R12, because the rule as written does not cover the cases
> the data produced:
>
> - **A goal no seed could judge is not a goal either.** On Garden Apartments 1 of 50 tuning seeds
>   and 2 of 50 holdout seeds serve nobody in the reporting window, so `deliver-everyone` and
>   `long-waits-under` have no verdict on those runs. The judgeable seeds are **not** counted on
>   their own: that is selection on the outcome in § D158's exact sense — the runs that fall out are
>   the hard ones — and it would report a rate with an honest-looking denominator while having the
>   bias. Those two are `unjudgeable` on that stage and ship nowhere.
> - **A classification is checked on a disjoint seed set, and both sets are the same size.** The
>   first is CLAUDE.md § Tuning discipline. The second is arithmetic: a goal passing 49 of 50 is
>   `variable` and the same goal on 20 seeds is very often `constant-pass`, so unequal sets
>   manufacture a *"it did not generalise"* out of the denominator alone.
>
> `everyone-can-get-there` remains **not evaluable**, as § 10.4 says and as this row said; it is
> blocked on W7 and is published as withheld rather than omitted, because a kind missing from the
> table is indistinguishable from a kind that passed.

### R13 — No estimate is displayed without the count it was computed from, and a frequency restatement is forbidden when the denominator is smaller than the frequency it names.

Two clauses, one measurement.

**Measured**: Garden Apartments, `collective`, `durationS: 900`, default peak-5-minute window. At
seed 42 the run's AWT is `11.319 s` with `awtIsValid: true` — computed over **five** legs
(`counts.arrivals` in the window = 5). At seed 4 it is `10.262 s` over **one**. At seed 1, eleven.
Every one of these is a legitimately quotable mean by this project's own rule; none of them is a
mean anybody should read without knowing the `n`.

**Clause one.** Every displayed estimate carries its count, in the same visual unit — not in a
tooltip, not in an expandable. `n = 5` is not a caveat on `11.3 s`; it is part of what `11.3 s`
means.

**Clause two is the sharp one.** § 7.1's flagship translation renders `WT95` as *"**1 in 20 riders**
waited more than 62 seconds"*. Applied to that Garden run, it would say *"1 in 20 riders…"* about a
sample of **five**. There is no twentieth rider. The sentence invents a denominator — in the section
whose whole justification is the natural-frequency literature, which is about making denominators
*visible*.

So: a natural-frequency restatement (`1 in 20`, `8 in 100`, `5 in 1 000`) may be printed **only when
the actual count is at least as large as the denominator it names**. Below that, print the
percentile or the percentage with its `n` and no frequency form. The same applies to `% > 60 s` →
*"8 in 100"* and to `WT99` → *"1 in 100"*, which needs a hundred legs to be a sentence rather than a
rounding artefact.

---

## 2. What is true of the shipped product today

Verified against the code and against runs on 2026-07-28, on `design/phase9-experience` (based on
`integration`). Where a repository document disagrees with the code, the code wins and the
disagreement is stated.

### 2.1 The viewer is honest, with one leak — ✅ **CLOSED 2026-07-28, and there were two**

> **This section is left as written, and its finding is fixed.** `M11` was real and is closed
> ([`DECISIONS.md` § D111](../DECISIONS.md)): the suppression gate now lives once, as
> `meansAreSuppressed(recording)` in `frame/overlay.ts`, called by `overlayAt`, by `drawHeader` and
> by `dev/main.ts`'s status line — there were three copies of `saturated || !awtIsValid` and the
> third was missing. A suppressed run's header now reads `mean wait suppressed`, and deliberately
> **not** `mean wait so far —`: the em dash already means *nobody has been served yet*, which is a
> different fact and one the reader can act on.
>
> **The leak was not confined to `viz`, which this section could not have known.** `elevator-sim
> watch` printed the running mean unconditionally on **both** of its render paths — the TTY frame
> and the piped fallback — for the whole of a run, seconds before `printRunReport` said
> `AWT  SUPPRESSED` about the same run on the same terminal. `run` and `compare` were clean.
> Found by checking the claim that no other render site leaks rather than trusting it.
>
> **W1 below is therefore already done**, and its acceptance and liveness evidence were produced:
> the assertion `not.toContain('mean wait so far')` was watched failing against the unfixed gate,
> and the fix was driven in a browser and in the exported PNG on both suppression grounds.
> **Honest limit:** the CLI's TTY frame path was not driven in a real terminal — both paths call the
> same unit-tested `renderRunningMean`, but "driven on a TTY" is not claimed.



`dev/main.ts`'s DOM status line, `frame/overlay.ts`, `render/overlay.ts` and `render/describeFrame.ts`
all suppress correctly. **The canvas header does not** (**M11**). `render/canvas.ts` `drawHeader`
draws

```
waiting 193   boarded 83 legs   mean wait so far 87.7 s
```

unconditionally from `frame.runningMeanWaitS`, on the same header line as the banner it draws
immediately above it:

```
SATURATED — AWT suppressed
```

Seen on screen at Midtown Office, seed 42, t = 8:36, and worse at Secure Tower seed
16757712606996968457 where the header reads *"mean wait so far 1.8 s"* beside a banner saying
*10.7 % of arrivals were never served*. `describeFrame` — the text alternative the screen-reader
user gets — says *"Mean waiting time is suppressed"* and never states a mean. **The sighted reader
sees a number the non-sighted reader is told does not exist.**

`UX.md` § A.3 row **Saturated** already says the state must not show *"A mean waiting time"*. The
row is correct and the canvas contradicts it. This is a Phase 9 blocker, not a Phase 9 feature:
every rule in § 1 is undermined by one unlabelled mean in the largest type on the screen.
§ 11.W1 fixes it.

### 2.2 The default configuration is the worst one available

> **Half of this is closed, and the other half is closed by measurement rather than by a change**
> (2026-07-29, T73, wave 9). The **dispatcher** default moved to `collective` in wave 6
> ([§ D134](../DECISIONS.md)); this section's opening sentence was written before that and is
> corrected below, as is the TTD clause, which the review at the head of this document had already
> refuted in **M2** without correcting here. The **building** default is measured and **kept** — see
> the refutation after the second bullet. What was still open in wave 9 was a *third* site nobody had
> looked at: `elevator-sim list`'s **Try** block, which derived its examples from `data/`'s file
> order and so told a newcomer to `run` and `watch` `nearest-car`. Fixed in T73.

The viewer opens on Garden Apartments with ~~`nearest-car`~~ **`collective`**. Both defaults were
poor; one still is, and not for the reason first written:

- `docs/07-handoff.md` § 4 says in its own words that **`nearest-car` is a poor reference arm** —
  *"the **only** profile that saturates"* at the benchmark operating points — and recommends
  `collective` or `eta`. ~~It is the viewer's default dispatcher.~~ **It was, by accident of being
  first in `data/dispatcher-profiles.json`. § D134 made the choice explicit and the viewer now opens
  on `collective`; `dev/defaults.test.ts` pins it, which nothing did between D134 and T73.**
- Garden Apartments generates **16 passengers in 900 s** (5 of them inside the 300–600 s reporting
  window, which is the `n` every figure below is over — **R13**). **M2, as corrected in § 12**: ten of
  the twelve shipped dispatchers return AWT 11.319 s and WT95 24.548 s, but only **nine** of them also
  return TTD 39.302 s — `energy-aware` matches on wait and returns **39.592 s** on journey time. Six
  (`eta`, `fairness-first`, `capacity-aware`, `auction`, `auction-multi-round`, `destination-eta`)
  produce a **byte-identical** recording. The two that differ on wait are `zoned-uppeak` (2.500 s) and
  `predictive-balanced` (11.919 s). ~~ten … / TTD 39.302 s — identical to three decimals~~ was the
  original sentence and it over-counted the TTD clause by one; re-derived independently by T73 and it
  reproduces M2's correction exactly, including the seven distinct recordings.

**The building default is measured and kept, and this is the correction the section most needed.**
T73 ran all twelve dispatchers on all five buildings at the viewer's own settings — seed 42, 900 s,
each building's shipped traffic profile, `onTimeout: 'report'`:

| building | dispatchers publishing a mean |
|---|---|
| **garden-apartments** | **12 of 12** |
| midtown-office | 0 of 12 |
| mixed-use-high-rise | 1 of 12 (`destination-panel`) |
| secure-tower | 1 of 12 (`destination-eta`) |
| vertical-city | 0 of 12 |

That is **14 of 60**, which reproduces **M1** exactly, and it means *there is no better shipped
building to open on*. Every alternative gives a newcomer a first run whose headline number is
legitimately refused on eleven or twelve of the twelve dispatchers. Garden Apartments is not the
default because it is good; it is the default because it is the only one where the number exists at
all, and swapping it would trade *"nothing you change matters"* for *"nothing you do produces a
number"*. The remedy this section already names — **a scenario library at usable demand levels** — is
still the remedy, and it is the only one the evidence supports.

So the newcomer's first act — change the dispatcher and press Run — produces, six times out of
twelve, *literally the same picture*. This is not a rendering problem and it is not a bug: it is the
flat-plateau phenomenon `docs/07-handoff.md` § 4 documents ("weight perturbations below the
decision-flip threshold produce bit-identical runs"), reached by having too little traffic for any
decision to matter. It is nonetheless the single largest obstacle to U3, and no amount of
gamification fixes it. **A scenario library at usable demand levels does.**

### 2.3 The recording already carries everything a rider queue needs

`VizRecording` is at `VIZ_SCHEMA_VERSION` **4**. `legs` landed at v3 with `overlayAt` and
`landingAssignmentsAt` as its consumers; `passengerModel`, `VizLeg.destinationFloorId` and
`VizLeg.assignedCarId` landed at v4. `VizLeg` today carries: `passengerId`, `originFloorId`,
`destinationFloorId`, `direction`, `arrivedAt`, `boardedAt?`, `carId?`, `bankId?`, `assignedCarId?`.

**A per-floor queue of individual riders is derivable from that with no contract change at all.**
Every waiting rider at time `t` is a leg with `arrivedAt <= t` and `boardedAt` absent or `> t` —
which is `isWaitingAt`, already written. The individual's wait age is `t - arrivedAt`, their
destination is `destinationFloorId`, and under a panel the car they were promised is
`assignedCarId`. § 6 designs U4 on that basis. This contradicts the framing in the request, which
anticipated a contract widening; the widening U4 needs is zero fields.

### 2.4 The recording's byte budget is not where it was assumed to be

**M3**, measured by serialising each section:

| run | total | `legs` | `shafts` | `landings` | `progress` | legs |
|---|---|---|---|---|---|---|
| Midtown Office, `nearest-car`, 900 s | 1 782 kB | **81 kB (5 %)** | 1 655 kB (93 %) | 11 kB | 33 kB | 459 |
| Vertical City, `nearest-car`, 1800 s | 7 971 kB | **608 kB (8 %)** | 7 107 kB (89 %) | 56 kB | 178 kB | **3 222** |
| Secure Tower, `destination-panel`, 900 s | 1 156 kB | 57 kB (5 %) | 1 059 kB (92 %) | 8 kB | 24 kB | 290 |

The recording is dominated by `shafts` — the per-move `CarMotion` objects, 89–93 % of every byte.
Legs are 5–8 %. **Adding a field to `VizLeg` costs about 5 % of 5 %.** The cost argument against
widening `VizLeg` is therefore weak; the *consumer* argument (a field with no renderer is this
repository's signature defect) is the only one that should decide it, and this document keeps it.

Two corrections to figures circulating in planning material: Vertical City at 1800 s holds **3 222**
legs under `nearest-car` / seed 42 / `onTimeout: 'report'`, not 3 346; and the growth figure is not
"~150 kB per 1 000 legs" for the *recording* — it is **176–197 kB per 1 000 legs for the `legs`
array** across the three runs above, and **2.5–4.0 MB per 1 000 legs for the recording as a whole**,
because the whole is mostly motion and motion does not scale with passengers.

### 2.5 Reading the queue is free

**M4**: `landingAssignmentsAt` costs **0.02 ms/frame** on Midtown Office and **0.07 ms/frame** on
Vertical City with 3 222 legs, against a 16.7 ms 60 Hz budget. (That leg count was measured before
`vertical-city` declared its ground-lobby escalator, which removed about 8 % of the building's lift
legs — 3 141 at 1800 s under `collective` at the standard seed. These are headroom figures and the
count moved in the safe direction, so every claim in § 2 holds with more margin than it was
measured with, not less.) A per-rider queue renderer built on a
sibling selector will be in the same class. Frame budget is not a constraint on U4.

### 2.6 The parameter surface is real, complete, and already generic

**M9**, by running `discoverParameterSchemas()` and `collectSearchSpace()`:

- Discovery finds **10 schemas** exporting **99 declared parameter rows**:
  `ANALYTICAL_PARAMETERS` (3), `CAR_PARAMETERS` (6), `DISPATCH_PARAMETERS` (32),
  `DOOR_PARAMETERS` (10), `LOAD_SENSOR_PARAMETERS` (4), `METRICS_PARAMETERS` (12),
  `POLICY_PARAMETERS` (3), `PREDICTOR_PARAMETERS` (6), `SIM_PARAMETERS` (6),
  `TRAFFIC_PARAMETERS` (17).
- `collectSearchSpace()` narrows those to **49 dimensions** a dispatcher profile can actually hold —
  by *trying*, through `parseDispatcherProfiles`. By section:
  `weights` 12, `dispatch` 11, `answer` 9, `idle` 9, `auction` 3, `eligibility` 2, `normalization` 2,
  `constraints` 1. By type: continuous 32, categorical 9, boolean 4, integer 4. **13** carry an
  `activeWhen` gate, and the space comes back in a stable topological gate order.
- Every row carries `id`, `type`, `range`/`values`, `scale`, `default`, `unit?`, `description` and
  `activeWhen?`. Descriptions run **54 to 1 167 characters** and are written for a reader, not for a
  parser. `answer.reopenOnLateArrival`'s is 1 138 characters of why.

**M10, corrected**: the same discovery run against the **browser** barrel (`core/src/browser.ts`)
returns the identical 10 schemas and 99 rows. `parseDispatcherProfiles`, `buildingConfigSchema`,
`parseBuilding`, `resolveBuilding`, `parseTrafficProfiles` and `COST_TERMS` are all browser-barrel
exports, and `browser.test.ts` asserts the two barrels differ by exactly `loadConfig`. **The schema
*data* a generated editor needs is complete in `core/browser`, and discovery run against either
barrel gives identical results.** That is what M10 establishes and it is true.

**What M10 does *not* establish, and what this section originally claimed:** that discovery *runs*
client-side with no package change. It does not.

- `discoverParameterSchemas` and `collectSearchSpace` are declared in
  `packages/experiments/src/tuning/space/collect.ts` — in `experiments`, not in `core`.
- `packages/experiments/package.json` declares exactly two export paths, `"."` and
  `"./package.json"`. **There is no browser condition and no subpath**, so a deep import of
  `tuning/space` is refused by the resolver, not merely discouraged.
- The one entry that does exist pulls `node:worker_threads` transitively:
  `index.ts` → `runner/index.ts` → `runner/parallel.ts`, which imports `Worker` at module top level.
  The barrel's own docstring says so.

**This document already said this correctly**, in § 8.5: *"A browser cannot import the tuner
today."* The two statements cannot both stand. § 8.5 is the one that matches the code, so § 13's
**open question 1 is a prerequisite, not an optimization** — a browser-side generated editor needs
either a `./browser` export condition on `packages/experiments` or its own re-implementation of
discovery over the `core/browser` namespace, and the second is a second source of truth about what
the search space is.

This settles U6's architectural question: a generic editor should be **generated** from the schema,
not hand-written. § 8.

### 2.7 The traffic surface is self-describing too — and that is the answer to U7

`TRAFFIC_PARAMETERS` has 17 rows in the same shape, with `activeWhen` gates on the template geometry
and one `perMemberOf: 'building.entranceFloors'` row. It is excluded from `collectSearchSpace()` for
one mechanical reason only — **no dispatcher profile has a section that can hold it** — not for want
of a schema. So U6 and U7 are the same generator pointed at two schemas. § 9.

### 2.8 Access zoning exists in the editor, and says almost nothing

The editor keeps the three kinds of zoning genuinely separate, which is the hard part and is already
done: **Banks, cars and service zoning** / **Access zoning — credentials** / **Operational zoning**,
the last being a paragraph explaining that operational zoning is a dispatcher profile setting and is
not edited there. `editorEdits.ts` routes them through separate functions and
`editorEdits.test.ts` asserts an access edit changes `accessZones` and nothing else.

What is there, driven on Secure Tower: each zone is **two free-text fields** — floors as
`"2 3 4 5 6 7 8"` and credential groups as `"tenant-alpha-staff tenant-alpha-visitor facilities
security"`. There is no floor picker, no credential vocabulary, no view of which credential reaches
which floor, and — the important omission — **no connection to the dispatcher**.

**M12**: of the 12 shipped dispatcher profiles, exactly **two** (`destination-eta`,
`destination-panel`) declare a credential-carrying `dispatch.callType`. The other ten run at the
`up-down-buttons` default, under which an access-restricted pickup carries no credential, every car
returns `accessDenied`, and the call is **permanently unassignable**. Measured consequence, already
published: on Secure Tower, conventional dispatch leaves **33.5 %** unserved with **0 of 30**
replications quotable, and a destination-entry kiosk *without* the credential is **worse**, at
**100.0 %** — it serves nobody on that building at all (`docs/05-roadmap.md`, `DECISIONS.md`
§ D56, and `dispatch/types.ts`; re-pinned to `benchmark/accessControl.ts` H-ACCESS-1, seed
20 260 726, n = 30, after the `C35` fix).

So today a user can author an access zone in the editor and run it against ten of twelve dispatchers
that structurally cannot serve it, and nothing on either screen says so. § 10.

### 2.9 What the viewer cannot say, because the recording does not carry it

`VizSummary` carries nine fields: `saturated`, `awtIsValid`, `awtInvalidReason`, `meanWaitS`,
`wait95S`, `meanTimeToDestinationS`, `generated`, `delivered`, `undelivered`.

`RunSummary` carries, and `VizSummary` does not: `window` / `windowSeconds` (**so the viewer never
says which window its numbers cover, which `UX.md` RV-T4 requires**), `waiting.pctOverLongWait` and
`longWaitThresholdS`, `handlingCapacity` (HC5, %POP), `achievedInterval` (INT and its CoV),
`loadFactor`, `rideTime`, `serviceLevel` (the longest wait and whether it is censored), and
`counts`. § 7 lists which of these U5 needs and § 11.W2 adds them with their renderers.

**There *is* an energy metric, and the conclusion this section drew from its absence survives with a
better reason** (**M13, corrected**). This document was written against a tree in which
`REPLICATION_METRICS` had 19 entries and none was energy. `f895a16` landed the third Pareto axis
before this design merged, and the sentence went stale between authoring and merge.

Measured on this tree: `REPLICATION_METRICS` has **23** entries, of which four are energy —
`energyKJ`, `carDistanceM`, `carStarts`, `energyPerServedLegKJ`. `RunSummary.energy`
(`EnergyStatistics`) carries `workKJ`, `distanceM`, `starts`, `workPerServedLegKJ`, `movingCarCount`
and a `measured` flag. The proxy is out-of-balance mechanical work,
`|load − 0.5·rated| · g · distance` summed per move; its basis, its constants and what it
**deliberately omits** (acceleration losses, drive efficiency, door motors, standby power) are in
[`docs/02` § Energy and the counterweight](02-elevator-reference.md) and
[`DECISIONS.md` § D106](../DECISIONS.md). `idle.repositionEnergyWeight` is still an exchange rate
against *seconds of empty travel* and is still not this.

**So Phase 9 may show energy — and still may not score it.** The prohibition below is unchanged and
its justification is now a measurement rather than an absence: across the full experiment matrix,
**`nearest-car` is on the Pareto front at six of eight cells**, because it is best on energy and
worst on wait. `nearest-car` was the viewer's default until [§ D134](../DECISIONS.md), and is the
arm `docs/07` § 4 calls a poor reference. **A standalone eco score ranks the worst dispatcher first.** The replacement rule —
*energy is an axis, never a score* — is § 7.3.

`VizSummary` does not carry any of it today; § 11.W2 is where it would land if Phase 9 wants it.

### 2.10 Two small things found while driving the UI

- **M15**: the Run-viewer / Building-editor tab selection is not written to the URL. Every other
  control is. A scenario deep link that should open the editor cannot.
- **M16**: `.claude/launch.json` declares port **5173**; `packages/viz/vite.config.ts` declares
  **5174**. Neither is wrong on its own; together the preview tooling points at a port the server
  does not use.

Both are requests, not this document's to fix (§ 14).

---

## 3. Research — what is known, and what this document is proposing

Cited sources are at § 15. This section separates **found** from **proposed**; the proposals are
mine and are marked.

### 3.1 Overcrowding is a proven fail state, and it is the same one this simulator has

**Found.** Mini Metro's primary losing condition is a station that stays overcrowded too long; the
whole network then shuts down. Commentary from transport planners treats this as the game's central
design insight — it makes an abstract systems failure legible as a visible pile-up at one place, and
it is the failure the player caused ([Human Transit](https://humantransit.org/2014/03/the-lessons-of-mini-metro.html),
[Transportist](https://transportist.org/2014/11/05/mini-metro-review/)). The same commentary notes
the honest caveat: real passengers would divert to another mode rather than accumulate without
bound.

**Found, and it is a warning.** Mini Metro's minimalism makes the overcrowding indicator itself hard
to read on a busy screen — players report losing to a station they never saw fill
([Steam](https://steamcommunity.com/app/287980/discussions/0/35221031840044247)). Legibility of the
fail state is a separate problem from the fail state being good.

**Proposed.** This project's saturation diagnosis is exactly Mini Metro's overcrowding condition,
except that it is a fitted trend test on real queue samples rather than a timer, and it comes with a
sentence explaining itself. Adopt it as the fail state (R4). Take the warning seriously: the
diverging queue must be *visually* unmistakable well before the run ends, which is what U4 buys
(§ 6) — and it must not be conveyed by colour alone, per `UX.md` KB-15.

### 3.2 The elevator-sim genre has already learned the hard lesson

**Found.** SimTower was built around an elevator simulation and its endgame was elevator management;
players and retrospectives converge on the same complaint, that elevator micromanagement became
unwieldy at scale. Project Highrise deliberately went the other way and made elevators abstract,
becoming a building-management game rather than an elevator game
([Steam, Project Highrise discussions](https://steamcommunity.com/app/423580/discussions/0/358417461606712182/?ctp=2)).

**Proposed.** This project cannot take Project Highrise's exit: the elevators *are* the subject. The
scaling problem is therefore real and must be solved by *aggregation*, not by removal — which is why
§ 6 specifies a queue renderer that degrades from individual rider glyphs to a bar with a count, and
why § 8 specifies a dispatcher editor that opens on the three or four dimensions that matter rather
than on all 49.

### 3.3 Progressive disclosure, not a forked product

**Found.** Progressive disclosure is a 1995 Nielsen pattern with four decades of evidence: novices
learn faster and make fewer errors, experts pay one interaction
([NN/g](https://www.nngroup.com/articles/progressive-disclosure/),
[UX Tigers](https://www.uxtigers.com/post/progressive-disclosure)). It improves learnability,
efficiency and error rate. The canonical shape is the phone camera: shutter/zoom/flash on open, a
Pro mode holding ISO and RAW.

**Proposed.** Basic and Advanced are **one product with one state**, not two apps. Every Advanced
control has a Basic default that is *set*, not absent — switching modes never changes what the
simulator does, only what is shown. This is testable, and § 11 makes it an acceptance criterion:
**for every scenario, the recording produced in Basic mode is byte-identical to the recording
produced in Advanced mode.** If a mode switch can change a run, it is not progressive disclosure.

### 3.4 Natural frequencies, not probabilities — and no probability words

**Found.** Representing statistical information as natural frequencies rather than probabilities
measurably improves comprehension for lay readers and clinicians alike, and the advantage is largest
for rare events — "5 out of 1 000" beats "0.005"
([Frontiers](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01473/full),
[NCBI](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4604268/)). Icon arrays implement the same
framing visually and are associated with more accurate risk estimation and reduced denominator
neglect ([arXiv](https://arxiv.org/pdf/2207.09608)).

**Found, and it is the constraint on U5.** The IPCC's calibrated-language framework is the largest
deployed attempt to translate uncertainty into words, and the measured outcome is that the public
misinterprets the terms *regressively* — pulling "very likely" down and "unlikely" up toward 50 % —
with the error correlated to the reader's prior beliefs. **The finding is Budescu et al.** (Budescu,
Broomell & Por, *Psychological Science* 2009; Budescu, Por, Broomell & Smithson, *Nature Climate
Change* 2014), not the two IPCC-commentary sources this paragraph originally cited.

**And the remedy the IPCC adopted in AR5 was *dual presentation*, not abolition** — the numerical
range printed beside the word, *"likely (66–100 %)"* — because the same experiments found the
misreading is reduced when the number accompanies the term and is not reduced by a carefully defined
term alone. So the constraint is sharper than "do not translate": a likelihood **word without a
number** is the documented failure mode. U5's default is still the interval or a frequency over
runs, because neither needs a word at all. R10.

**Proposed.** U5's translations are **natural-frequency restatements of percentiles and counts**,
never adjectival restatements of intervals. `WT95 = 62 s` becomes *"1 in 20 riders waited more than
62 seconds"* — same fact, better format. `Δ = [+0.58, +1.38] s` becomes *"faster, by between half a
second and one and a half seconds"* — the interval, stated, with no adjective — or, where the
audience is the Basic-mode player, *"the difference was too small to measure at this many runs"*
when it contains zero. § 7 gives the table.

### 3.5 Teaching a system by making its ratios visible

**Found.** Factorio is widely credited with teaching production ratios without a tutorial, by making
the bottleneck physically visible: the belt backs up in front of the slow machine and empties after
it, so the player reads the constraint off the screen rather than off a number.

**Proposed.** The elevator equivalent is already computed and already suppressed correctly:
**offered demand versus handling capacity**. `HandlingCapacity` carries `offeredPer5Min` and
`personsPer5Min` in the same unit. A single paired bar — *"people arriving: 62 per 5 min / people
carried: 41 per 5 min"* — is the Factorio belt, it is two observations rather than any estimate, and
it explains saturation before the queue diverges. It is not in `VizSummary` today; § 11.W2 adds it.
This is the highest-value single addition in the whole of Phase 9.

---

## 4. U2 — Basic and Advanced modes

### Recommendation

**Basic is the default. Advanced is one control away and is remembered.** The reason is not that
novices matter more; it is that `UX.md`'s Newcomer role has a stated failure cost (*"concludes the
tool does not work"*) and the Analyst's does not depend on which mode opens. An expert pays one
click, which the progressive-disclosure literature (§ 3.3) says is the correct price.

**An advanced user must not be worse off**, so Advanced is a strict superset. Every control and
every figure that exists today is present in Advanced, in the same place, with the same wording.
Phase 9 adds; it does not relocate.

### What Basic hides

| Hidden in Basic | Where it goes |
|---|---|
| The raw `awtInvalidReason` string | Behind "why?" on the plain-language form (R3) |
| The per-bank mean-wait breakdown | Advanced |
| The load-factor panel's numeric column (bars stay) | Advanced |
| The window bounds label (`window 216–516 s`) | Replaced by *"the busiest 5 minutes"*; exact bounds in Advanced |
| The dispatcher profile *id* | Replaced by its display name; id shown on hover and in provenance |
| `Verify replay`, `Save recording`, `Export PNG`, bank filter, landing selector, frame-step buttons | Advanced |
| The 49-dimension dispatcher editor | Basic shows the curated subset (§ 8.3) |
| Every metric in § 7's "technical only" column | Advanced |

### What Basic may never hide — the non-negotiable list

1. **Saturation.** Present as a persistent banner in the reader's register, never a toast.
2. **Undelivered passengers.** The count, and that they never arrived.
3. **That a statistic is suppressed, and why.** Shortened, never removed (R3).
4. **Locked-out calls** — a call no car may legally answer (§ 10).
5. **The seed**, copyable (R7).
6. **The passenger model**, when it is `destination-dispatch`, because it changes what a landing
   queue *is* — `describeFrame` already says so and Basic mode is exactly the audience that needs
   telling.
7. **Warnings** from the run, including `double-deck-not-simulated`.

### The mode-parity acceptance criterion

For every shipped scenario, run in Basic and in Advanced, `JSON.stringify(recording)` must be
identical. A mode that changes a run is not a view. This is a cheap test and it is the one that
stops Basic mode from quietly lowering the demand to make the picture nicer.

---

## 5. U3 — Gamification

### 5.1 What the simulator already provides, and what it does not

It provides genuinely good raw material: rush hours with a rise-and-fall shape, saturation with a
diagnosis, access lockouts with measured consequences, cars taken out of service mid-run
(`serviceEvents`), a 100-floor building, and dispatchers that really do trade waiting against stop
count and empty travel.

It also provides an **energy axis**, which this section originally said it did not (§ 2.9,
corrected): `RunSummary.energy` and four `REPLICATION_METRICS` entries. It is raw material for a
*display*, not for a *score* — see § 7.3 and R11.

It does **not** provide, and Phase 9 must not pretend it does: a per-dispatcher verdict from one run
(R2), a single-run goal whose across-seed variance has been measured (R12), or — at shipped
demand — a set of configurations where a non-expert's choices change the outcome (§ 2.2, **M1**,
**M2**).

### 5.2 The shape: scenarios, not a campaign score

**A scenario is a named, seeded, fully-specified configuration plus a goal set plus a replication
budget.** It is data — a JSON file, validated by a schema, in the same spirit as invariant 7. It
carries:

```
id, name, brief (2–3 sentences of plain language)
building        — a building id or an inline BuildingConfig
traffic         — a TRAFFIC_PARAMETERS patch (§ 9)
dispatcher      — a starting profile, and which dimensions the player may move
seeds           — the tuning seed set, explicitly
holdoutSeeds    — a disjoint set, explicitly (CLAUDE.md § Tuning discipline)
replications    — how many runs a goal is judged over
goals           — a list of checkable goal objects
```

Goals are **checkable predicates over quantities that survive suppression**, and each declares
whether it is judged on one run or on a batch:

| Goal kind | Judged on | Checkable from |
|---|---|---|
| `deliver-everyone` | one run | `summary.undelivered === 0` |
| `no-divergence` | **batch** | fraction of replications with `saturated === false` |
| `nobody-abandoned` | one run | `serviceLevel.verdict !== 'starved'` |
| `answer-the-demand` | one run | `handlingCapacity.personsPer5Min >= offeredPer5Min` |
| `long-waits-under` | one run | `waiting.pctOverLongWait <= x` — an observation, a count over served legs, and it carries its own censoring caveat which must be shown |
| `everyone-can-get-there` | one run | zero locked-out calls (§ 10) |
| `beat-the-baseline` | **batch**, paired-t | interval on the difference excludes zero |

`no-divergence` and `beat-the-baseline` are batch goals **because R2 says so**, and **M7** is the
evidence: a single-run saturation verdict on Secure Tower flips 6/20. Stating a batch goal as
*"stays under control in at least 45 of 50 runs"* is both honest and better game design — it is a
frequency, which § 3.4 says lay readers read well.

> **The five single-run rows above do not survive R12 as written.** Measured on Secure Tower —
> this progression's own stage 5 — `collective`, seeds 1000–1019, 900 s (**M18**):
> `deliver-everyone` **0/20**, `nobody-abandoned` **20/20**, `answer-the-demand` **0/20**. Three
> constants: the player cannot move them, so they are facts about the configuration, not goals.
> `long-waits-under` is **11/20** at a ≤ 10 % threshold, i.e. a coin flip whose rate is set by the
> author's choice of threshold rather than by play. Each of these needs its across-seed pass rate
> measured on its own scenario and published in the scenario file, and anything strictly between 0
> and 1 becomes a batch goal.
>
> **`everyone-can-get-there` cannot be checked at all today**, and the table above and § 10.4
> contradict each other about it. This row says it is checkable from "zero locked-out calls
> (§ 10)"; § 10.4 says the recording carries no `credentialGroup` on a `VizLeg` and so cannot
> distinguish *"nobody came"* from *"nobody may come"*. § 10.4 matches the code. The goal is
> **blocked on W7**, not available now.

> **Measured on all seven stages 2026-07-29 — and the "Judged on" column is now wrong in one
> direction on every row.** W9 landed R12's mechanism: `data/scenario-goals.json` carries every
> kind's across-seed pass rate on every stage, and `packages/viz/src/scenario/goalRates.test.ts`
> refuses a table in which any kind is unaccounted for. **Not one of the five "one run" rows above
> survives as a one-run goal anywhere**, because R12's trichotomy leaves no such category — see the
> box under R12. What each row *is* varies by stage and is published per stage rather than asserted
> here: `deliver-everyone` is a constant on five stages, a batch goal on one and unjudgeable on one;
> `nobody-abandoned` is a constant on six stages and the **only** live goal on stage 3.
> `beat-the-baseline` and `no-divergence` are unchanged — they were already batch, for the reason
> R2 gives, and the measurement agrees.

### 5.3 Fail states

Per R4: **Overwhelmed**, **Abandoned**, **Stranded**, **Locked out**. Each has a plain-language
sentence, a one-line diagnosis naming the floor or the credential involved, and a **suggested
lever** drawn from the scenario's own editable dimensions. The lever is a hint, never an automatic
fix, and never phrased as "the right answer" — there is a Pareto front here, not an optimum.

### 5.4 Progression

Progression is by **mechanism introduced**, not by score threshold. Proposed ordering, each stage
adding exactly one concept and each stage using a shipped building:

1. **One shaft, low demand.** Garden Apartments. Teaches: a call, a car, a wait. Winnable trivially.
2. **The morning rush.** Midtown Office at a demand level *below* its ceiling. Teaches: rise-and-fall,
   the offered-vs-carried bar (§ 3.5). First encounter with a number that moves when you change
   something.
3. **Overwhelmed.** The same building at shipped demand. **Unwinnable as configured**, and it says
   so: this is the scenario that teaches saturation and teaches that the tool refuses to average a
   diverging queue. Its goal is *diagnose it*, not *beat it*.
4. **Two banks.** Mixed-Use High-Rise. Teaches service zoning and transfers, and that a journey can
   have two waits.
5. **Credentials.** Secure Tower. Teaches access zoning — and teaches it by *failing first* under a
   conventional dispatcher, which is a measured fact (§ 2.8) and the most instructive lesson in the
   whole set.
6. **The tall one.** Vertical City. Teaches that geometry beats dispatch at scale.
7. **Tune it.** The dispatcher editor (§ 8) with a batch goal and a holdout set — the first scenario
   where the player is asked to prove an improvement rather than observe one.

Stage 3 is the load-bearing one. **A game that cannot be lost teaches nothing, and this simulator's
losing condition is real.**

> **Measured 2026-07-29, and one word of the list above is now false.** Stage 1 is described as
> *"winnable trivially"*. Under the bar W5 actually ships — the count goals judged against the
> shipped setting's own published count on the same seeds, plus `beat-the-baseline`, which every
> stage carries and which needs a paired interval excluding zero with nothing resolving the other
> way — **no shipped dispatcher profile clears stage 1**, because on Garden Apartments no measure
> separates any admissible arm from `collective` at n = 50. Three stages *are* clearable from the
> dispatcher dropdown alone: **3** (`fairness-first`), **4** (`destination-eta`,
> `destination-panel`) and **7** (`destination-panel`). **Four, as of 2026-07-29** — see the
> correction in § 11 **W5**: **stage 6** clears under `destination-eta` and
> `destination-panel` too, and has since `long-waits-under` left its `goals` bucket. Stage 5 is the instructive one and it is
> instructive in both directions: `destination-eta` clears every locked-out landing and takes
> `answer-the-demand` from 3 of 50 to 12 of 50, and **costs** long waits — 16 of 50 against 32 —
> so it comes out *ahead on people carried and behind on long waits*, which is a move along the
> front rather than a win. That is § 5.3's Pareto sentence arriving as a measured outcome instead
> of a caution.

### 5.5 What must never be built

- A score displayed on a suppressed run (R1, R5).
- A leaderboard ranking dispatchers from single runs (R2).
- A grade letter derived from AWT.
- **An "efficiency" or "energy" score.** The quantity now exists (§ 2.9), and the prohibition is
  *stronger* for that, not weaker: measured across the full experiment matrix, `nearest-car` — the
  viewer's default until § D134, and the weakest shipped dispatcher — is **on the Pareto front at six of eight
  cells**, because it is best on energy and worst on wait. An eco score ranks it first. Energy is an
  axis, never a score (R11, § 7.3).
- **A single-run goal whose across-seed variance has not been measured** (R12).
- **An estimate displayed without the count it was computed from** (R13).
- A difficulty setting that changes anything other than declared `TRAFFIC_PARAMETERS` and building
  fabric. Difficulty is demand and geometry; it is never a fudge factor on a metric.

---

## 6. U4 — Visible rider queues per floor

### 6.1 The contract change is zero fields

§ 2.3. Every waiting rider at instant `t` is already in `recording.legs`. The addition is a **pure
selector beside `overlayAt` and `landingAssignmentsAt`**, in `frame/overlay.ts`:

```
queueAt(recording, t): readonly FloorQueue[]
```

where a `FloorQueue` is `{ floorId, riders: readonly QueuedRider[], total, oldestWaitS }` and a
`QueuedRider` is `{ passengerId, waitedS, direction, destinationFloorId, promisedCarId? }`, ordered
by `(arrivedAt, passengerId)` — the order `legs` is already sorted in, so the queue renders
first-come-first-served left to right, which is itself information.

Purity, ordering and the right-continuity convention are inherited from `isWaitingAt`, which already
exists and which `overlay.test.ts` already cross-checks against `Frame.totalWaiting` on every shipped
building. The new selector must satisfy `sum(queue.total) === frame.totalWaiting` on every shipped
building at every sampled instant, by the same test.

### 6.2 The renderer, and how it degrades

**M5**: the deepest single landing call reaches **175 waiting** on Midtown Office (900 s, seed 42,
`nearest-car`) and **379** on Vertical City (1800 s). One glyph per rider is not a design at those
depths, and Vertical City has 100 floors sharing the canvas height. So:

| Riders at a landing | Drawn as |
|---|---|
| 1–12 | Individual glyphs, oldest first, each glyph's fill carrying its wait age band |
| 13–40 | Glyphs to the row width, then `+N` |
| > 40, or floor pitch below the glyph height | A **bar** proportional to `log(1 + n)` with the count, plus the oldest wait |

Wait age is banded — under 30 s, 30–60 s, over 60 s, over the horizon — and every band carries a
**shape** as well as a colour, because `UX.md` KB-15 forbids colour as the only signal. The three
existing thresholds are not invented: 60 s is `metrics.longWaitThresholdS`, and the horizon is
`DEFAULT_MAX_WAIT_HORIZON_S`.

Under `destination-dispatch` the queue at a floor is **not one queue**. `landingAssignmentsAt`
already groups by `(origin, destination, promised car)`, and measured on Midtown Office there are
132 promise groups behind 28 direction landings. The renderer must therefore group the glyphs by
promised car and label the group, or it will draw a Level-1 building as a Level-0 one — the exact
defect version 4 exists to prevent. `describeFrame` already says the sentence; the picture must
match it.

### 6.3 The screen-reader form lands with it

`describeFrame` gains, per floor with anybody on it, one clause: *"Floor 7: 6 people waiting, the
longest for 41 seconds."* Not per rider — `KB-13` asks for a description, not a manifest. This is
not optional; it is how the individual-glyph information reaches a reader who cannot see it.

### 6.4 Non-test caller

`packages/viz/src/render/canvas.ts` (the shipped scene draw) and
`packages/viz/src/render/describeFrame.ts`. Named, and both in the same change as the selector.

---

## 7. U5 — Human-understandable metrics

### 7.1 The translation table

Every row is the **same fact** in both columns. Where a plain form would mislead, the row says so and
keeps the technical form only.

| Technical | Plain-language form | Notes |
|---|---|---|
| `AWT = 24.5 s` | "Riders waited **25 seconds on average**" | Only when `awtIsValid`. Otherwise R3's reason. |
| `WT95 = 62 s` | "**1 in 20 rides** waited more than a minute" | Natural frequency (§ 3.4). `95` → `1 in 20` is exact. **Corrected: the word was *"riders"*.** `WT95` is computed over **legs**, and a sky-lobby journey boards twice, so "riders" turns a leg statistic into a person statistic — the wave-1 `served` → `boardedLegs` defect reappearing in the plain-language column of the document written to prevent it. § 13 q7 settles the word: **a ride is one boarding, one car, one wait.** |
| `WT99` | "**1 in 100 rides** waited more than …" | Same correction, same reason. |
| `maxWaitS` | "The **unluckiest rider** waited …" | Must carry `longestWaitIsCensored`: if that rider never boarded, the figure is a **floor**, and the plain form becomes "…waited at least …". |
| `TTD = 96 s` | "**Door to door**, a typical trip took a minute and a half" | Journey-level, spanning transfers. On a sky-lobby building this is the number that matters and AWT is not. |
| `% > 60 s = 8 %` | "**8 in 100** riders waited more than a minute" | Carries the censoring caveat: the denominator is *served* legs, and the unserved are exactly the ones that would have counted. Show `unservedCount` beside it, always. |
| `INT = 30 s, CoV 0.4` | "A lift left the lobby **every 30 seconds**" | **INT only.** `intervalCoV` gets **no plain-language form** — see the note below the table. |
| `HC5 = 41 persons/5 min` vs `offered = 62` | "The lifts carried **41 people every 5 minutes**. **62 arrived.**" | § 3.5. Two observations. This is the headline Basic-mode metric. |
| `%POP = 12.4 %` | "**12 % of the building** moved every 5 minutes" | Requires a population; absent when the record has none. |
| `meanLoadFactor 0.62` | "Cars ran at about **62 % of rated capacity** — and the design target is 80 %, so they were roughly **three-quarters as full as a well-loaded car**" | **The arithmetic in the old row was wrong.** It read *"about 6 in 10 full"* while also saying "full" means 80 % of rated — but `meanLoadFactor` is a fraction of **rated**, so 0.62 of rated is 0.62/0.8 = **0.775** of the design load, i.e. 7.75 in ten "full", not 6 in 10. Either state the fraction of rated in percent, or divide by the design factor before saying "full" — never mix the two denominators in one sentence. |
| `saturated` | "**The queues never stopped growing.**" | R3. |
| `undelivered = 20` | "**20 people never got where they were going** before the clock ran out." | |
| `awtIsValid = false`, censoring ground | "Too many people were still waiting when time ran out — the average would only count the lucky ones." | This is the *exact* meaning of the technical reason. |

### 7.2 What must not be translated

- **Confidence intervals into adjectives.** R10, § 3.4. An interval is either shown as an interval or
  as a frequency over runs.
- **`queueSlopePersonsPerMinute`.** "The queue grew by 29.6 people a minute" is fine as a
  *diagnosis line* and misleading as a *metric*, because it is a fitted slope over a window and the
  fit is what the saturation test is; quoting it standalone invites treating it as a target.
- **`intervalCoV`, in any form.** The original rule here was *"CoV → 'bunching', with a two-state
  plain reading only"* — and that is **the error R10 itself bans**, one type down. R10 forbids
  mapping an interval onto a likelihood adjective; mapping a dispersion statistic onto *"they
  arrived in clumps"* versus *"evenly"* is the same operation on a different statistic, and it needs
  a threshold the document never states. Is 0.4 clumpy? 0.25? Nothing in `core` answers that, so
  neither may the UI. **Show `intervalCoV` as a number with its definition, or not at all.** If a
  two-state reading is genuinely wanted, it needs a threshold measured against something — the
  distribution of `intervalCoV` across a batch on the same building would do — and published as a
  measurement, not chosen to read well.
- **Anything derived from `meanWaitS` when it is suppressed**, including "improvement over baseline".

### 7.3 Energy — an axis, never a score

**This section said "do not ship an energy metric — it does not exist". It does exist** (§ 2.9,
corrected), and the rule that replaces the old one is narrower and better founded.

**The replacement rule.** Energy may be *displayed*. It may never be *scored*.

1. It is shown **only beside** AWT and WT95, as one axis of a Pareto front — never on its own, never
   as a gauge with a good end and a bad end.
2. It is **never aggregated** into a grade, a letter, a star rating, an "efficiency" number or a
   green leaf. No single number combines it with wait.
3. `workPerServedLegKJ` is shown **beside** the raw figure, always. *A configuration that spends
   less by serving fewer people has not saved anything*, and the raw figure alone cannot tell those
   apart. Show `distanceM` and `starts` too where there is room — they are the two things that can
   move it.
4. Where two arms are non-dominated they are **reported and not ordered**. Which trade an operator
   wants is the operator's call (CLAUDE.md § Tuning discipline).
5. It carries the same window every other figure carries (§ 7.4), and it is `NaN`-not-zero when the
   run recorded no travel — `measured: false` means *nobody wrote it down*, which is not *the cars
   did not move*.

**Why the prohibition on a score survived the metric arriving.** Measured across the full experiment
matrix, `nearest-car` is on the Pareto front at **six of eight cells** — and it is there because it
is **worse at serving people**: best on energy, worst on wait. `nearest-car` was the viewer's default
until § D134 and is the arm the handoff brief calls a poor reference. A standalone eco score would put it at the top
of the table. That is not a presentation bug that careful labelling fixes; it is what happens when a
non-domination relation is flattened into a rank.

**Units, stated on screen.** The figure is kilojoules of *out-of-balance mechanical work*, not kWh.
It omits acceleration losses, drive and gearing efficiency, door motors and standby power. Label it
*"drive work (proxy)"* or similar, never *"energy used"*, and link the definition
([`docs/02` § Energy and the counterweight](02-elevator-reference.md)).

**Empty-car travel** — the proxy this section originally proposed as a substitute — is now
redundant: `carDistanceM` and the load-aware work term together say more, and `starts` says the rest.

### 7.4 Every figure carries its window

`UX.md` RV-T4 requires it and `VizSummary` cannot satisfy it (§ 2.9). Adding `window` and
`windowSeconds` to `VizSummary` is a prerequisite for every row above, because *"riders waited 25
seconds on average"* is false without *"during the busiest 5 minutes"*.

---

## 8. U6 — Building dispatcher models in the UI

### 8.1 The architecture is a fit, and it is verified rather than assumed

Invariant 7 makes a dispatcher **data**; invariant 8 makes every tunable **self-describing**;
`collectSearchSpace()` returns 49 fully-specified dimensions in gate order with descriptions written
for humans (**M9**); and the whole surface is reachable from the browser barrel (**M10**). A
hand-written editor for 49 knobs would be wrong on the day the 50th is declared — which is the
argument `collect.ts` already makes about hand-listed search spaces, applied to a form.

**Decision: the dispatcher editor is generated from the schema.** One control renderer per
`type` — continuous (slider + number, honouring `scale: 'log'`), integer (stepper), categorical
(select over `values`), boolean (checkbox) — plus one rule that reads `activeWhen` through the
existing `isActive` and disables-with-reason rather than hiding. Four renderers, no elevator
knowledge, and a new parameter appears in the UI with no UI change. `description` is the help text;
`unit` is the suffix; `default` is the reset.

**A generated form is the only form that can be proved complete**, and the completeness test is
mechanical: every id in `collectSearchSpace().ids` must be reachable in the editor. That test is the
U6 analogue of `parameters.test.ts`'s "nothing hidden".

### 8.2 The guard rails a UI must respect

1. **`parseDispatcherProfiles` is the validator.** Not a re-implementation, not a subset. The editor
   authors a `DispatcherProfile` object and runs it through `parseDispatcherProfiles` before enabling
   Run — the same instrument `isProfileAuthorable` uses, and the same one `loadConfig` uses. The
   editor adds no schema, exactly as the building editor adds none.
2. **A profile may not weight a term its own settings make inert.** `policies.test.ts` enforces this
   two ways and the UI can only enforce one of them cheaply:
   - **Declarative** — a term's own `activeWhen` unsatisfied by the profile's settings. This is
     `unsatisfiedGatesOf`, it is pure schema, and the editor must enforce it live: weighting
     `rideTime` while `dispatch.callType` is `up-down-buttons` is refused at the control, with the
     reason, and the fix offered (*"a ride-time weight needs the destination to be known when the
     call is made"*).
   - **Empirical** — a weighted term that contributes zero across the scoring scenarios. This
     **cannot** be decided from the schema; `policies.test.ts` decides it by scoring. The editor must
     therefore **not claim** a profile is sound, only that it is *authorable and has no dead gate*.
     A profile the user wants to add to `data/` goes through the real test.
3. **Do not offer knobs that are not tunables.** `carMode`, service zoning and access zoning are
   deliberately excluded from `DISPATCH_PARAMETERS` (`dispatch/parameters.ts` says why): they are
   state and building fabric. The generated editor gets them for free by construction — it only
   renders what the schema declares — and that is a reason to generate rather than hand-write.

### 8.3 Basic mode's curated subset

49 sliders is an expert tool. Basic mode opens on a **preset gallery** — the 12 shipped profiles,
each with a plain-language description of what it is trying to do and what it gives up — plus **three
dimensions** the player may move:

- `weights.waitTime` versus `weights.stopCount` versus `weights.distanceTravelled`, presented as one
  three-way balance rather than three sliders. This is the tradeoff the product is trying to teach
  and it is the one the shipped profiles actually differ on (`energy-aware` is
  `0.6 / 0.3 / 0.1`).
- `idle.parkingStrategy`, because `dispatch/parameters.ts` states that on sparse-traffic buildings
  this stage dominates everything else, and it is a categorical with four legible values.
- `dispatch.reassignmentPolicy`, described in the schema as *"one of the highest-leverage knobs
  available"*.

"Show all 49" is one control away.

### 8.4 The noise floor is a UI element, not a footnote

**This is the most important thing in § 8.** `docs/07-handoff.md` § 4: near-neighbour weight vectors
are resolvable to **0.20 s at n = 100**; structurally different dispatchers to **1.9 s**. Below
that, an observed difference is noise. And weight perturbations below the decision-flip threshold
(δ ≤ 0.03) produce **bit-identical runs** — exactly zero gradient over finite regions.

A UI that shows a player moving a slider and a number changing from 24.5 s to 24.2 s has told them a
lie by juxtaposition. So:

- Single-run comparisons in the dispatcher editor are shown as **"this run"** figures, never as a
  delta against the previous run.
- Any delta requires a **batch** (§ 11.W3) and is shown with its interval; when the interval contains
  zero the UI says *"too small to measure at N runs"* and offers to raise N, quoting the budget table
  from `docs/07-handoff.md` § 4 (±0.5 s needs n = 143; ±0.25 s needs n = 563).
- A **bit-identical** result is reported as such — *"nothing changed: this weight did not flip a
  single decision"* — because `docs/07-handoff.md` says a bit-identical result is a wiring bug until
  proven otherwise, and because it is a genuinely interesting thing to have discovered.

### 8.5 Exposing `tune`

The optimizer is shipped, has a non-test caller (`packages/cli/src/commands/tune.ts`), and
rediscovered a known-good value blind. Exposing it in the UI is high value and structurally awkward:
`collectSearchSpace` and the search algorithms are node-free, but they are only reachable through
`@elevator-sim/experiments`'s single `.` export, whose barrel pulls the runner and therefore
`node:worker_threads`. **A browser cannot import the tuner today.**

Two options, and the choice is § 13's first open question:

- **(a)** `packages/experiments` grows a `./browser` export condition covering `tuning/space` and
  `tuning/search`, guarded by a graph-walk test in the manner of `core/src/browser.test.ts`. Clean,
  and it makes the search space itself importable, which the generated editor also wants.
- **(b)** The UI shells out to the CLI. Not available in a browser at all, so this means the desktop
  story only.

Recommendation: **(a)**, scoped to `tuning/space` first (which the editor needs regardless) and
`tuning/search` only if a UI-driven search is actually wanted. Either way `tune`'s **method** is not
re-implemented: held-out seeds, CRN within a round, and no ranking inside the noise floor come from
`runHoldoutRound`, not from new UI code.

> **Settled 2026-07-28 — (a), and the recommendation's scoping held.** *"A browser cannot import the
> tuner today"* is no longer true and is left standing as the record of why the barrel exists.
> [§ D121](../DECISIONS.md) added `packages/experiments/src/browser.ts` with a `browser` export
> condition and a both-directions graph-walk guard, carrying `tuning/space` — **and not
> `tuning/search`**, which is exactly the scoping recommended here, because nothing has yet asked
> for a UI-driven search. `reports/statistics.ts`, `runner/crn.ts`, `runner/metrics.ts` and
> `runner/stopping.ts` came with it, each answering a named W3 consumer rather than being whatever
> happened to be free of `node:`.
>
> The residual — TypeScript does not apply the `browser` condition, so a bare specifier typechecks
> against the Node surface — is closed by a guard in `packages/viz/src/boundaries.test.ts`
> ([§ D127](../DECISIONS.md)), and W4 is built on the result.

---

## 9. U7 — Rider models, definable, assignable, with multipliers

### 9.1 What exists

`data/traffic-profiles.json` holds four **profiles** (`office-prestige`, `office-standard`,
`residential`, `hotel`), each with a rate range (`min`/`typical`/`max` as % of population per 5 min),
a target interval and wait, a **batch size distribution** (geometric, mean 1.4–2.0), and a
directional split. It also holds two **demand templates** (CIBSE rise-and-fall, ISO constant) and one
**passenger mass distribution** (normal, μ 75 kg, σ 15 kg, min 20 kg). A building assigns a profile
per building and per floor.

`TRAFFIC_PARAMETERS` declares 17 tunables over that, self-describing in the same shape as the
dispatch schema, with `activeWhen` gates on template geometry and one `perMemberOf` row (§ 2.7).

### 9.2 Decision: a rider model is a `TRAFFIC_PARAMETERS` patch, and the editor is the same generator

U7 needs no new concept. A **rider model** is a named, validated patch over `TRAFFIC_PARAMETERS`,
stored as data, assignable to a scenario. The editor is § 8.1's generated form pointed at
`TRAFFIC_PARAMETERS` instead of `collectSearchSpace()` — same four control renderers, same
`activeWhen` rule, same `description` as help text. **This is the single strongest argument for
generating the form rather than writing it: U6 and U7 collapse into one unit of work.**

The three model rules bind and are already honoured by `core`, so the editor's job is to make them
**visible** rather than to enforce them:

- **Batches, not individuals.** The batch-size distribution is in the profile and is not a
  `TRAFFIC_PARAMETERS` row; the editor must show it as a stated property of the chosen profile
  (*"people arrive in groups averaging 1.4"*) and must offer `traffic.batchSharesDestination`, whose
  own description says it *"materially reduces stop count"*.
- **Mass is a distribution.** Shown as μ/σ, read-only in Phase 9, and labelled as what it is for:
  *"the load sensor has to have something to measure"*.
- **80 %, not 100 %.** Wherever the UI says a car is "full", it means the design load factor. Said
  once, prominently, in the metrics glossary.

### 9.3 The multiplier the owner asked for does not exist, and should

**This is a real gap.** `traffic.arrivalRatePctPop5min` is an **absolute override** — its own
description says an unset value is *"the only honest default: 12 is an office number and would run a
residential building at 2.4× its demand."* There is **no** row that multiplies a profile's own rate.
So "1.5× the normal morning rush" is not currently expressible; "8 %/5 min regardless of building
type" is.

Two ways forward:

- **(a) A new declared tunable** `traffic.arrivalRateMultiplier`, `continuous`, range `[0, 4]`,
  default `1`, `activeWhen: { 'traffic.arrivalRatePctPop5min': <unset> }` — except `activeWhen`'s
  declared forms are a value list and a numeric range, and "is unset" is neither. The gate would have
  to be expressed some other way, or the two would have to be mutually exclusive by resolver rule
  with a stated precedence. This is a `core` change, in `TRAFFIC_PARAMETERS` and the resolver, with
  a round-trip test per `parameters.test.ts`'s standard.
- **(b) The scenario layer resolves the multiplier** into an absolute rate at authoring time, storing
  both the multiplier and the resolved value, and `core` is untouched.

Recommendation: **(b) for Phase 9, (a) as a follow-on**. Reason: (a) is a `core` schema change whose
`activeWhen` semantics need a new condition form, and `dispatch/parameters.ts` is explicit that a
declared knob nothing reads is worse than no knob. (b) is honest — it stores what was actually run —
and it keeps the invariant-8 surface exactly as complete as it is now. The scenario file records
`{ profileRateTypical: 12, multiplier: 1.5, arrivalRatePctPop5min: 18 }` so the provenance of the
number is on the record.

**Occupancy multipliers are a different thing and live elsewhere.** Floor `population` is building
fabric, in `data/buildings/*.json`, and `resolveBuilding` takes the sum of floors as authoritative.
An "occupancy ×1.5" control is a **building** edit, not a traffic edit, and must be presented as
such — collapsing the two would be the traffic-versus-fabric version of collapsing the three zonings.

### 9.4 Designing the saturated case in from the start

The owner's stated purpose for multipliers is worst-case scenarios, and worst cases saturate. Per
**M1**, saturation is already the *common* case, so this is not a corner to handle later.

Concretely, a rider-model editor must:

- Show, before the run, an estimate of whether the configuration can be served — the **offered vs.
  handling capacity** comparison of § 3.5, which for a proposed configuration can be computed
  *analytically* from `core/src/analytical` (the Barney/CIBSE round-trip-time calculation) without
  simulating anything. This is the "unbuildable configuration" warning `UX.md`'s Designer role asks
  for, and the machinery exists.
- Report a saturated run as an **outcome with a diagnosis**, not as an error.
- Never offer a "compare" affordance across two configurations one of which is suppressed.
- Refuse to display a mean, per R1 — and note that the *observations* remain fully available, which
  is what lets a worst-case scenario still be interesting: 379 people at one landing is a spectacular
  and completely honest thing to show.

### 9.5 Scenario success criteria are checkable

Yes — that is what § 5.2's goal table is for. Every goal kind reduces to a predicate over
`RunSummary` fields or over a batch of them. Two properties the implementation must have:

1. **A goal that references a suppressed quantity is a scenario-authoring error, caught by the
   scenario schema at load**, not at judging time. `long-waits-under` is allowed (it is a count over
   served legs, with a stated caveat); a hypothetical `awt-under` is **rejected by the schema**
   because it can be unjudgeable.
2. **Batch goals declare their replication count and their seeds**, and the tuning and holdout sets
   must be disjoint — the same rule `runHoldoutRound` enforces by refusing rather than warning.

---

## 10. U8 — Access zoning (credentials)

### 10.1 Keep the three zonings distinct — and make the distinction *earned* rather than asserted

The editor already separates them structurally (§ 2.8) and explains the difference in prose. Prose
is the weakest form of this. Phase 9's job is to make the distinction visible in the **picture**,
where it cannot be skimmed past:

A **credential lens** on the building preview: pick a credential group and the preview draws three
states per floor —

- **reachable** — some shaft serves it *and* this credential opens it;
- **not served** — no shaft physically reaches it (service zoning);
- **not permitted** — a shaft reaches it, this credential does not open it (access zoning).

Three states, three glyphs, three legend rows, one sentence each. Anyone who uses the lens once has
learned the distinction, because the two failure states look different and are labelled with
different causes. Operational zoning is absent from the lens **by construction** and the lens says
so: it is not a property of the building.

### 10.2 The editor's actual gaps

| Gap | Fix |
|---|---|
| Floors are a free-text id list | A floor multi-select over the building's own floors, with the range syntax `expandFloors` already understands. `ED-14` already validates unknown floors; the control should make it unreachable. |
| Credential groups are free text | An autocomplete over groups already used in this building, with free entry retained. No fixed vocabulary — `core` has none and inventing one would be a second source of truth. |
| No view of coverage | The credential lens (§ 10.1), plus a matrix view (floors × credential groups) for the Analyst. |
| No warning when a floor is in no zone | Today's semantics: a floor in no access zone is unrestricted. Correct, and worth stating on screen — Secure Tower's own notes say only the lobby is unrestricted, and that is the design. |
| **No connection to the dispatcher** | § 10.3. This is the important one. |

### 10.3 The dispatcher compatibility warning — the highest-value item in U8

**M12** and the published measurements: a building with access zones, run under a dispatcher whose
`dispatch.callType` is `up-down-buttons`, has calls that **no car may legally answer**, and ten of
the twelve shipped dispatchers are in that state. The consequence is not "worse", it is
**structural**: `docs/01-architecture.md` records **0 of 30** replications quotable and **33.5 %**
unserved for conventional dispatch on Secure Tower's interfloor traffic; a destination-entry kiosk
*without* the credential is worse at **100.0 %** — with no credential it serves nobody on that
building at all (`benchmark/accessControl.ts` H-ACCESS-1, seed 20 260 726, n = 30, re-run after the
`C35` fix).

So the viewer and the editor both gain a check, computed from data both already hold:

> **This building has access-controlled floors. `nearest-car` does not read credentials, so calls
> from those floors cannot be answered by any car — 33 % of riders will not be served. Two shipped
> dispatchers do read credentials: `destination-eta` and `destination-panel`.**

Stated **before** the run, not diagnosed after it, and it is a warning rather than a block —
because running it and watching it fail is the single best lesson in the scenario set (§ 5.4
stage 5). This is not a new concept; `ConfigWarning` already exists, the editor already lists
warnings separately from errors, and Run stays enabled for a warning (`ED-15`).

### 10.4 Locked-out calls, on screen

A call no car may legally answer is currently **indistinguishable from a call no car happened to
take** — which is a narrower and more accurate statement than this section originally made.

> **Corrected.** The original read *"indistinguishable from a long wait"*, and that is refuted by a
> shipped renderer: `packages/viz/src/render/canvas.ts:451` already draws
> *"… · unassigned — no car answered this call in this run"* on a landing whose call was never
> answered, and `:258` draws `⊘` on a floor no shaft serves. So an unanswerable call is **not**
> presented as an ordinary long wait today; what the viewer cannot say is **why** it went
> unanswered. That is the gap, and it is the one worth closing.
>
> **Corrected a second time, and the sentence above is still too strong** (**M22**, § 13 q4).
> `Simulation` diagnoses stuck calls and emits a warning naming the call, the floor, the direction
> and the reason set — and `VizRecording` **already carries `warnings`**. Measured on Secure Tower
> at seed 42: `collective` **11** structural refusals, `nearest-car` **18**, `destination-eta`
> **0**. So the recording *can* say **why**, at run granularity, and the viewer could print it
> today.
>
> What is actually missing is narrower than either earlier statement: the fact is **prose, keyed on
> a call id `VizLeg` does not carry**, and it is emitted only for calls still stuck when the run
> stopped — a call freed late by a car passing for another reason is deliberately not reported.
> So it cannot be joined to a rider glyph, which is what § 6's renderer needs. The remedy is a
> **structured** counterpart to a warning that already exists, in `core`; § 13 q4 records it as
> new debt and it is **not** this document's change to make. `VizLeg.credentialGroup` below stays
> the cheaper half and still lands first.

`RV-08` covers the *service*-zoning case and notes that **no shipped building has an unserved
floor**, so the `⊘` path does not arise in `data/`. The *access* case does arise, on Secure Tower,
and falls into the generic "unassigned" text with no credential explanation.

To draw it, the recording must be able to distinguish "nobody came" from "nobody may come". Today it
cannot: `VizLeg` carries no `credentialGroup` (it is on `PassengerRecord` and deliberately not
copied). **This is the one genuine contract widening U8 needs**, and it lands with its renderer per
§ 2.4's rule:

- `VizLeg.credentialGroup?: CredentialGroup` — `VIZ_SCHEMA_VERSION` → 5.
- Consumers in the same change: the queue renderer's locked-out marker (§ 6), `describeFrame`'s
  clause, and the credential lens's "this rider cannot reach their destination" line.
- Cost: `credentialGroup` is a short string on a fraction of legs; against § 2.4's budget (legs are
  5–8 % of the recording) it is negligible.

> **✅ LANDED 2026-07-29, at version 6 and not 5, and one clause above is wrong.** W2 took version 5
> first, so this is the same field at the next number. Two corrections to the paragraph above,
> both found in the code rather than argued:
>
> 1. **The credential alone over-claims, and the origin floor is what does not.** A leg carries a
>    credential when *any* floor on its route is restricted, so a lobby-to-office trip on Secure
>    Tower carries one too — and that call **is** answerable, because a conventional `estimateCost`
>    checks access at the pickup floor and, with no destination disclosed, nowhere else. That is why
>    conventional dispatch leaves 33.5 % of Secure Tower unserved rather than 100 %. The predicate
>    is *"registered a call **at** a restricted floor"*, and which floors those are is a fact about
>    the **building** — passed in by the caller, exactly as `unservedFloorIds` already is, not added
>    as a second field.
> 2. **There are two causes, not one, and no dispatcher fixes the second.** A rider with a
>    credential the dispatcher cannot read is one failure; a rider with **no** credential on a
>    restricted floor (`credentialAssignment: 'none'`) is another, and telling that reader to switch
>    to `destination-eta` would be advice that does not work. `access/lockedOut.ts` separates them,
>    and the field is what makes the second visible at all.
>
> Landed in `src/access/lockedOut.ts`, `render/canvas.ts` (the `▩` mark and the banner),
> `render/describeFrame.ts` (the clause, which names the credential the glyph cannot carry), driven
> by `dev/main.ts`.

Whether a *stronger* signal is needed — an explicit "this call was refused on access grounds" event
rather than an inference from credential plus zone — is § 13's open question 4.

---

## 11. Work breakdown

Dependencies are hard unless marked. Every unit names its **non-test caller**, because
`docs/05-roadmap.md`'s standing requirement says the question is not "is it reachable" but "name the
caller", and a barrel re-export is not one.

### W1 — Close the honesty leak *(no dependencies; blocks everything)* — ✅ **DONE 2026-07-28**

> **Landed ahead of Phase 9, because it is a correctness fix and not a feature**
> ([`DECISIONS.md` § D111](../DECISIONS.md)). Both acceptance clauses pass, the liveness evidence
> below was produced, and a **second** leak the unit did not know about was found and fixed in
> `packages/cli/src/commands/watch.ts` on both of its render paths. W1 no longer blocks anything.

Remove the unconditional running mean from `render/canvas.ts`'s header, or gate it on
`awtIsValid`; make the canvas agree with `describeFrame`.

- **Acceptance:** on every shipped building whose run is suppressed, the rendered header contains no
  mean; `describeFrame` and the canvas make the same claims about the same run.
- **Liveness evidence:** a test that replaces the header's mean with a constant and goes red;
  a driven browser session on Midtown Office seed 42 showing the header without a mean.
- **Non-test caller:** `render/canvas.ts` `drawScene`, already shipped.
- **Note:** `UX.md` § A.3's **Saturated** row is already correct and the code is wrong. No
  criterion is weakened.

### W2 — Widen `VizSummary` to what U5 and U3 need *(depends on W1 for the honesty rule)* — ✅ **DONE 2026-07-29**

> **Landed** ([`DECISIONS.md` § D154](../DECISIONS.md)). `VIZ_SCHEMA_VERSION` is **5**, every field
> below is drawn by `packages/viz/src/render/runSummary.ts` and mounted by `drawRunSummary` in
> `packages/viz/src/dev/main.ts`, and the liveness evidence was produced **twice per field** —
> 30 renderer mutations and 25 recorder mutations, **55 of 55 red**.
>
> **Three deviations, each stated rather than absorbed:**
>
> 1. **The field is `reportWindow`, not `window`.** `packages/viz/src/boundaries.test.ts` forbids a
>    browser-free module to name `window`, and its own docstring argues against loosening that
>    rule. The field list above was written without knowing it. `windowSeconds` is unchanged.
> 2. **The contract carries `null` where `RunSummary` carries `NaN`.** A recording is serialised and
>    `JSON.stringify(NaN)` is `null`, so a `number`-typed `NaN` becomes a `null` the type system
>    calls a number — on the *loaded* copy, which no unit test builds by hand. Same fact, in the
>    encoding JSON has. § 7.3 clause 5's *"`NaN`-not-zero"* is honoured in its reason.
> 3. **The figures are DOM, not canvas** — R3 needs prose, R7 needs copyable, and the figures are
>    properties of the run rather than the frame. The one clause that must be on the bitmap is:
>    `drawFooter` names the window, because **Export PNG** is what leaves the building.
>
> **The acceptance clause about Basic mode is not met and cannot be**: Basic/Advanced is W6. The
> offered-versus-carried bar is on screen in the only mode that exists.
>
> **Found on the way — a twelfth dead seam, inside the type this unit widens.**
> `VizSummary.meanTimeToDestinationS` has existed since version 1 with **no non-test caller**;
> every reference outside the contract was one of three test files. It is drawn now, as
> *door to door*, with its `n`. And **three shipped buildings reconstruct no departure interval at
> all** (`garden-apartments`, `mixed-use-high-rise`, `vertical-city`) — a fact about those
> buildings, said in words rather than printed as a zero.


Add to `VizSummary`, each with a renderer in the same change: `window`, `windowSeconds`,
`pctOverLongWait` + `longWaitThresholdS` + `unservedCount`, **the count each estimate was computed
from** (R13 — an estimate without its `n` may not be drawn), `handlingCapacity`
(`personsPer5Min`, `offeredPer5Min`, `pctPopulationPer5Min?`), `achievedInterval`
(`meanS`, `coefficientOfVariation`), `serviceLevel` (`verdict`, `longestWaitS`,
`longestWaitIsCensored`, `overHorizonCount`), and — **added by the § 2.9 correction** — `energy`
(`measured`, `workKJ`, `workPerServedLegKJ`, `distanceM`, `starts`), which the original field list
omitted because it was written when the metric did not exist. `VIZ_SCHEMA_VERSION` → 5 together with
W7's `VizLeg.credentialGroup` if the two land in one wave; otherwise two bumps.

Energy lands under R11: `workKJ` is drawn only beside AWT and WT95, `workPerServedLegKJ` is drawn
beside `workKJ`, and no renderer combines them into one number. `measured: false` renders as *"not
recorded"*, never as zero.

- **Acceptance:** every added field is drawn somewhere in the shipped viewer; the offered-vs-carried
  bar (§ 3.5) is on screen in Basic mode; every displayed figure names its window.
- **Liveness evidence:** per field, replace it with a constant and watch a test go red — the standard
  `UX.md` sets for a `✅ test` mark.
- **Non-test caller:** `render/overlay.ts` and `render/canvas.ts`.
- **Risk:** this is the unit most likely to acquire a field with no consumer. The rule is one field,
  one renderer, same commit.

### W3 — The replication batch runner in the viewer *(depends on W2)* — ✅ **DONE 2026-07-29, and its acceptance clause did not survive the building it names**

> **Landed** ([`DECISIONS.md` § D158](../DECISIONS.md)). `packages/viz/src/batch/` holds the runner
> and the report; `packages/viz/src/dev/batchWorker.ts` runs it off the painting thread and
> `packages/viz/src/dev/batchPanel.ts` is the Compare tab, mounted by `src/dev/main.ts`. The
> statistics are `experiments`' — `pairedDifferenceEstimate` and `intervalContainsZero`, through the
> browser barrel — and nothing statistical is computed in `viz`. § 13 q1 is answered the
> non-duplicating way: the seed is `replicationSeed` and the equivalence class is `traceKeyOf`, both
> imported.
>
> **The acceptance clause below is met in the form R1 makes available, and not on AWT.** *"A batch
> of 50 on Midtown Office returns a paired-t interval on a difference"* — at Midtown's own traffic
> profile, **0 of 50** replications return a quotable AWT under `collective` **or** `eta`; all 50
> saturate, on both arms. The observation rows do return a paired-t interval at n = 50, which is
> exactly § 1's **M1** finding reaching a surface. The estimate half is reachable one operating
> point down and the panel gained a demand control so a reader can get there: at 2.5 % and 3.0 %
> `%POP`/5 min every replication of both arms is quotable and the interval excludes zero. The clause
> was **not** weakened.
>
> **One row is a caution about M20, and it is one replication wide.** At 2.0 % `collective` loses a
> single replication of fifty and the estimate rows suppress, between two demand levels at which
> both arms are quotable 50 of 50. That is **not** a refutation of M20's *"over a batch, quotability
> is monotone in demand"* — different seeds, different `n`, two arms rather than twelve — and it is
> not claimed as one. What it does show is operational: **under the complete-case rule one
> replication suppresses the whole estimate half**, so a demand level chosen because every arm is
> quotable must be verified at the batch size that will be run, on the seed set that will be used.
> A level validated at n = 20 can suppress at n = 50. W5 and T64 inherit that (**M27**).
>
> **Suppression handling is the design decision, and it is stated rather than defaulted**: an
> estimate row reports only when every pair is valid on both arms, and the survivors are **not**
> averaged, because the arms lose pairs at different rates and the traces that fall out are the ones
> the dispatchers differ most on. § D158 § 1 carries the rejected alternatives.

A worker that runs N replications of a configuration and returns a paired summary, so R2's batch
goals and § 8.4's honest deltas are possible.

- **Feasibility, measured (M6):** 2 ms/rep (Garden Apartments), 24 ms (Secure Tower), 60 ms
  (Midtown), 196 ms (Vertical City) at 900 s. 50 replications: 0.1 s to 9.8 s. 200: 0.4 s to 39 s.
  A worker plus a progress indicator covers it; the main thread must not block (`UX.md` § A.3
  **Simulating**).
- **Acceptance:** a batch of 50 on Midtown Office returns a paired-t interval on a difference; an
  interval containing zero is reported as unresolved and the two arms are **not ordered**; the seeds
  used are recorded and reproducible.
- **Liveness evidence:** a comparison whose true difference is zero (a profile against itself)
  reports "not resolved" rather than a winner.
- **Non-test caller:** the scenario judge (W5) and the dispatcher editor's compare control (W6).
  **Neither exists yet**, so the shipped caller is the **Compare tab**: `src/dev/main.ts` →
  `src/dev/batchPanel.ts` → `src/dev/batchWorker.ts` → `src/batch/runBatch.ts`, with
  `src/batch/report.ts` called back on the main thread. W5 and W6 inherit it rather than create it.
- **Open:** whether the batch reuses `packages/experiments`'s CRN manager (§ 13 q1) or duplicates a
  minimal seed-pairing rule. Duplicating is a second source of truth about pairing and should be
  avoided. **Settled: reused.** `replicationSeed` and `traceKeyOf` are imported. The one thing that
  is *not* reused is `traceDigest`, which is unreachable from a browser — it lives in
  `runner/replication.ts`, whose own import rule confines it to the Node barrel — and the batch
  compares the two arms' `PassengerTrace`s **field for field** instead, which `runner/crn.ts` calls
  the primary evidence the hash stands in for.

### W4 — The generated parameter form *(depends on nothing; parallel to W1–W3)* — ✅ **DONE 2026-07-28, with one half blocked on `core`**

> **Landed** ([`DECISIONS.md` § D127](../DECISIONS.md)). `packages/viz/src/controls/` holds the pure
> model and the four renderers; `packages/viz/src/dev/parameterForm.ts` mounts them on a third tab.
> Every acceptance clause below passes, the liveness evidence is derived from a **fictional** schema
> (an orchard — irrigation, litres per tree, pickers on shift, night harvest, lantern count), and
> **`C34` is closed with a measured caller count** (**M25**: 0 → 3 non-test, non-barrel importers of
> `experiments/src/browser.ts`; `tuning/space`'s uncalled exports 6 → 3).
>
> **The U7 half was blocked, and T75 unblocked it — the superseded finding is kept below because
> the correction is the instructive part.** § D134 recorded: *"of the ten schemas
> `discoverParameterSchemas()` finds, two refuse to collect into a search space —
> `TRAFFIC_PARAMETERS`, because `traffic.arrivalRatePctPop5min`'s default is `null`, and
> `SIM_PARAMETERS`, because `sim.drainGraceS` declares a log scale over a range starting at zero
> (**M24**)"*, with the sets derived from discovery *"so a fix in `core` turns it red."* It did.
>
> **All ten collect now, and the two refusals turned out to be different kinds of thing.**
> `SIM_PARAMETERS` was a defect in **two** rows (`sim.drainGraceS` and `sim.queueSampleCount`, the
> second invisible because the collector throws on the first) and the fix was the **scale**, because
> zero is a named mode in both ranges rather than a slack bound. `TRAFFIC_PARAMETERS` was not a
> defect at all, in **four** rows: `default: null` there is the *"only honest default"* § 9.3 quotes
> approvingly, and it is *also* not a point a search can start from — both at once. The collector
> now says both, through `CollectOptions.nullDefault: 'exclude'`: thirteen rows collect and four are
> named in `SearchSpace.unsearchable`, drawn beside the controls in the collector's own words. The
> register is § D134's — what cannot be searched is **said**, never dropped; what changed is the
> granularity, since one bad row used to take sixteen good ones off the screen with it.
>
> **What W4 does not do**, stated rather than discovered: the authored candidate is validated —
> through the shipped `SearchSpace.validate`, which is `parseDispatcherProfiles` plus
> `createPolicyFor` — and is **not yet routed into the Run button**. Wiring it is W5/W6's.

Four control renderers keyed on `type`, one `activeWhen` rule, `description` as help, `unit` as
suffix, `default` as reset. Pointed at `collectSearchSpace()` for U6 and at `TRAFFIC_PARAMETERS` for
U7.

- **Acceptance:** every id in `collectSearchSpace().ids` (49 today) is reachable in the editor, and
  the test that asserts it derives the list from the function rather than from a fixture; every
  authored profile round-trips through `parseDispatcherProfiles`; a weight on a term whose
  `activeWhen` is unsatisfied is refused **at the control**, with the reason.
- **Liveness evidence:** add a fictional schema row via the injectable `source` and watch the control
  appear with no UI change.
- **Non-test caller:** the dispatcher editor tab and the rider-model editor tab.
- **Blocked by:** § 13 q1, **as a prerequisite rather than a preference.** `collectSearchSpace()` and
  `discoverParameterSchemas()` are declared in `packages/experiments`, whose `package.json` exposes
  one export path with no browser condition, and whose barrel reaches `node:worker_threads`. A deep
  import is refused by the resolver. So W4 cannot start against `collectSearchSpace()` until either
  (a) `packages/experiments` gains a browser-safe export, or (b) the viewer re-implements discovery
  over the `core/browser` namespace — which **M10, corrected** shows would give identical results,
  and which is a second source of truth about what the search space is. The `TRAFFIC_PARAMETERS`
  half of W4 is unblocked either way, because that schema is on the `core/browser` barrel.

### W5 — Scenarios as data, and the judge *(depends on W2, W3)* — ✅ **DONE 2026-07-29, and the goal table supports all seven stages**

> **Landed.** `packages/viz/src/campaign/` holds the schema (`types.ts`, `parse.ts`), the briefing
> (`brief.ts`), the editable-dimension check (`dimensions.ts`), the judge (`judge.ts`) and § 5.3's
> four fail states (`failStates.ts`); `data/campaign.json` is the seven stages as data;
> `packages/viz/src/dev/campaignPanel.ts` is the Campaign tab, mounted by `src/dev/main.ts`.
> **No second runner and no second estimator**: every verdict comes from W3's `runBatch` and
> `batchReport`, and every goal rate from W9's `measureGoalRate`.
>
> **A goal is selected, never authored.** Each stage's goal list is checked **equal** to its
> `goals` bucket in `data/scenario-goals.json` — subset because § D160 forbids inventing one,
> superset because a measured goal quietly dropped is indistinguishable on screen from a goal
> nobody measured. The building, dispatcher, horizon, demand level, both seed sets and the
> replication count are each checked field-for-field against that table's entry for the same stage
> id, because a pass rate is a property of **one** configuration.
>
> **The bar is the shipped setting's own published count, and it is re-derived every time.** Each
> stage runs two arms — the stage's starting profile and the player's — so the baseline arm *is*
> the configuration the table measured, on the same seeds. `judge.ts` compares what that arm scored
> with what the table says it scored and **refuses to judge the player at all** when the two
> disagree. Nothing invents a threshold; § 5.2's own warning about `long-waits-under` is what that
> avoids.
>
> **The measured table does support a playable seven-stage progression, and the honest form of that
> sentence has two halves.** All seven stages carry at least one live goal (14 count goals plus
> `beat-the-baseline` on every stage). Measured over every admissible shipped profile, **three
> stages can be cleared from the dispatcher dropdown alone** — stage 3 by `fairness-first`, stage 4
> by `destination-eta` and `destination-panel`, stage 7 by `destination-panel` — and four cannot,
> because `beat-the-baseline` needs a paired interval excluding zero with nothing resolving the
> other way, and no shipped profile achieves that there.
>
> **That count is now four, and the correction is the same shape as the sentence it corrects.**
> Stage 6 clears under `destination-eta` and under `destination-panel`. It did **not** move because
> the tall building got escalators — re-measured on the pre-escalator configuration it clears there
> too — it moved when `long-waits-under` left stage 6's `goals` bucket, which is one fewer count
> goal a candidate has to match. The claim above was measured before that and was never
> re-measured, which is the failure this document names about numbers arriving at markdown: a
> published figure with no tool re-deriving it. `packages/viz/src/campaign/campaign.test.ts` now
> plays stage 6 at `destination-eta` and asserts the clear, so it cannot go stale silently again. **§ 5.4's *"winnable trivially"* is false
> of stage 1 under this bar**, and is corrected in place below. Clearing those four needs an
> authored weight vector, which is invariant 7's own model of what a dispatcher is.
>
> **Two findings, both from driving rather than from a test.**
>
> 1. **A saturated run can end with an empty building.** Stage 3 replication 0 — Midtown Office at
>    its shipped demand — is `saturated: true` with `undelivered: 0` and **ends at 1 883 s with
>    nobody standing**: the queues grew inside the 900 s demand horizon and drained afterwards. A
>    diagnosis sampled at `endedAt` said *"nobody was still standing at the end"* about it. That is
>    CLAUDE.md's *"neither sees a queue that grew enormously and drained just in time"* reaching a
>    screen; the diagnosis now samples every 15 s (**M5**'s cadence) and reports the worst moment,
>    which on that run is **119 people on `G` at 795 s**.
> 2. **R10 has a hole wherever text is *derived* rather than authored.** `idle.predictorHorizonS`'s
>    schema `description` contains the word *"likely"* — correct prose for a parameter schema, and a
>    probability word arriving on a player-facing surface through `SearchParameter.description` on
>    the stage that opens every declared dimension. `core`'s text is not this lane's to rewrite and
>    the Parameters tab may still show it, so `campaign/words.ts` **replaces** it there with the
>    reason (R3's shape applied to R10). The refusal does not quote the offending word, because a
>    refusal that named it tripped the blanket assertion it exists to keep.
>
> **Known limits.** `building` is an id and never an inline `BuildingConfig` (§ 5.2 allows either):
> an inline building could carry no measured goal, so it is a form in which nothing could legally be
> declared. `traffic` is the one field `BatchRequest` reads. The player's move is a **shipped
> profile**, not a live weight editor — W6/W4's wiring — and an off-spec profile is refused with the
> out-of-scope dimensions named rather than silently judged.

The scenario schema, a shipped scenario library covering § 5.4's seven stages, and a judge that
evaluates goals from finished recordings and batches.

- **Acceptance:** every shipped scenario loads, validates, runs, and reaches its stated goal state
  from the shipped `data/` — including stage 3, which must reach **Overwhelmed**; a goal referencing
  a suppressible quantity is rejected by the schema at load; tuning and holdout seed sets are
  asserted disjoint.
- **Liveness evidence:** each scenario's declared outcome is asserted against an actual run, not
  against a fixture. A scenario whose demand is changed must change its verdict.
- **Non-test caller:** the Basic-mode scenario picker.
- **Note:** stage 2 requires finding a demand level at which Midtown Office is quotable across arms.
  **M8** shows this is not a matter of picking a number off a sweep at one seed — quotability is
  non-monotone in demand at a single seed — so the level must be chosen the way
  `saturationCensus.test.ts` chooses one: **the highest load at which every arm, including the
  baseline, still returns a valid AWT**, measured over a batch.

### W6 — Basic / Advanced *(depends on W2, W4, W5)*

One state, two views, § 4's hide/never-hide lists.

- **Acceptance:** the mode-parity test — for every shipped scenario, the recording produced in Basic
  is byte-identical to Advanced; every item on § 4's never-hide list is asserted present in Basic on
  a run that exhibits it.
- **Liveness evidence:** the parity test fails if any control's Basic default differs from its
  Advanced value.
- **Non-test caller:** the app shell.

### W7 — Rider queues and the credential lens *(depends on W1; W7b depends on W2)* — ✅ **DONE 2026-07-29, both halves**

> **W7a is DONE, 2026-07-29** ([`DECISIONS.md` § D157](../DECISIONS.md)). `queueAt` is in
> `frame/overlay.ts`, the renderer is `render/riderQueue.ts` plus `drawLandings`, the § 6.3 clause
> is in `describeFrame`, and D4's mood treatment lands with it as `render/mood.ts`. **The zero-field
> claim in § 2.3 holds** — W7a adds **no** field — with one wording correction: `isWaitingAt` was
> module-*private*, not *"already exposed"*.
>
> *(Corrected at the W7a/W7b merge: this note said `VIZ_SCHEMA_VERSION` **is unchanged at 5**, and
> that was true of W7a alone. W7b bumps it to **6** for `VizLeg.credentialGroup`, so the sentence
> went stale between the two lanes landing. W7a's own claim — that it needs no field — is
> untouched.)*
>
> **Three deviations and one limitation, stated rather than absorbed:**
>
> 1. **`FloorQueue` carries `groups` and `worstBand` beyond § 6.1's four fields**, because § 6.2
>    requires the glyphs to be grouped by promised car and the § 6.1 type cannot express that. It
>    also carries `recentlyBoarded`, which is the relief transition: a boarding is otherwise
>    invisible, because the queue simply gets shorter between two frames.
> 2. **The band boundaries are read off `VizSummary`**, which D154 made possible, rather than from
>    `DEFAULT_MAX_WAIT_HORIZON_S`. Same numbers on the shipped buildings; the run's own numbers on
>    any other.
> 3. **The mood scorer omits `awtIsValid` too**, which R5's corrected example would have allowed. A
>    scorer that cannot see the suppression flag cannot come to branch on it.
> 4. **Limitation.** On a row too tight for the layout's own `FloorRow.labelled`, the bar is drawn
>    with **no count beside it** — the one place this feature does not keep *a bar never carries its
>    value alone*. The count stays in `describeFrame`, the landing selector and the header.
>
> **Frame budget, re-measured with the rendering in place** (600 instants, `nearest-car`, seed
> 20 260 727): whole frame including `drawScene` is **0.051 ms** on Midtown Office at 900 s and
> **0.197 ms** on Vertical City at 1800 s, against 16.7 ms — 1.2 % at worst. The deepest single
> landing queue seen was **450**, deeper than **M5**'s 379.

- **W7a — `queueAt` + renderer + `describeFrame` clause.** No contract change (§ 6.1).
- **W7b — `VizLeg.credentialGroup`, the locked-out marker, and the credential lens** (§ 10).
- **Acceptance (a):** `sum(queueAt(r,t).total) === frameAt(r,t).totalWaiting` on every shipped
  building at every sampled instant; the renderer degrades correctly at 175 and 379 waiting (**M5**);
  under `destination-dispatch` the glyphs are grouped by promised car.
- **Acceptance (b):** on Secure Tower under `nearest-car`, a locked-out call is drawn as locked out
  and not as a long wait; the same run under `destination-eta` shows none.
- **Liveness evidence:** remove the field and the marker's test goes red; a driven browser session
  on Secure Tower showing both states.
- **Non-test caller:** `render/canvas.ts`, `render/describeFrame.ts`, `render/preview.ts`.

> **W7b landed 2026-07-29.** `VizLeg.credentialGroup` at `VIZ_SCHEMA_VERSION` **6** (W2 took 5), the
> `▩` locked-out mark in `render/canvas.ts`, the credential lens in `render/preview.ts` +
> `access/zoning.ts`, driven by `dev/main.ts` and `dev/editor.ts`. Acceptance (b) is asserted on the
> shipped Secure Tower at seed 20 260 729 in `access/lockedOut.test.ts`.
>
> **Merged with W7a on 2026-07-29, and the two share a landing row.** Three things came out of
> that and none of them was in either lane's plan:
>
> 1. **Order on the row is `▲n ▼n` · `✗` · `▩` · one cell of air · the rider glyphs.** The call
>    marks go first because a long queue caption would otherwise push them past the metrics panel,
>    and the cell of air is there because `✗`/`▩` are statements about the **call** and `●◑○◆` are
>    statements about the **people**: run together they read as one string.
> 2. **A latent glyph collision, reported not resolved.** W7a's `abandoned` band was `✖` (U+2716)
>    and `D10`'s unanswered-call mark is `✗` (U+2717) — different characters, near-identical marks
>    at 12 px, and they co-occur *systematically*, because a call nobody answers is exactly a call
>    whose riders pass the abandonment horizon. Not observed on Secure Tower at seed 20 260 729
>    (nobody there passes the 900 s horizon), so it is latent. Neither glyph belongs to W7b and
>    changing either is not this lane's call.
>
>    > **Closed 2026-07-29 by T74, and it was never latent — the reported run was too short.**
>    > The `abandoned` band is now **`◆`** (U+25C6). The same building and the *same seed* the
>    > report calls latent — **Secure Tower, `collective`, seed 20 260 729** — puts both marks on
>    > floor 25 at `t ≈ 1673–1859 s` as soon as the horizon is 1 800 s rather than 900 s: the
>    > locked-out rider is still standing at 1 149 s, past the abandonment horizon, at a landing no
>    > car answers. Driven and screenshotted. The rule that replaces *"four distinct characters"* is
>    > **no two claims on one landing row may share a shape family**, asserted in
>    > `packages/viz/src/render/landingMarks.test.ts` with the whole theme collapsed to one colour.
> 3. **The empty-landing branch gained a third condition.** `queue === undefined` was W7a's; a
>    landing the caller has *named* as locked out must survive it too, or the picture and the
>    banner disagree about the same floor.
>
> **One collision that is neither lane's and is reported for routing:** the mood headline is drawn
> at canvas `y = 48` with `textBaseline: 'top'`, and `drawShafts` draws the bank label at
> `plot.y - 18 = 58` with `textBaseline: 'bottom'`. They overlap by 10 px on **every building with
> more than one bank** — Secure Tower, Mixed-Use High-Rise, Vertical City — and the 64 px header
> has no free row, so the fix is `headerPx`, which is W7a's decision to make.
>
> > **Closed 2026-07-29 by T74, and the header held *four* overlapping claims, not two.** The
> > hidden-shaft notice (`plot.y − 20`) overprinted both the mood line and the bank label, and the
> > selected landing's caption was drawn at exactly the same `y` and `x` as the hidden-shaft notice,
> > so those two overprinted each other. The fix is a `HeaderBand` on `Layout`: six named rows —
> > title, run meta, mood, notices, bank labels, shaft labels — with `headerPx`'s default *derived*
> > from that stack (**90 px**, from 64) and a smaller value clamped up rather than honoured.
> > Nothing in `render/` computes a header `y` of its own any more, and
> > `packages/viz/src/render/headerBand.test.ts` rebuilds every drawn text box from the recorded
> > `font`/`textAlign`/`textBaseline` and requires the boxes above `plot.y` to be pairwise disjoint
> > at five viewport sizes.

### W8 — Access-zoning editor and the dispatcher compatibility warning *(depends on W7b)* — **the warning ✅ DONE 2026-07-29; the editor controls open**

Floor multi-select, credential autocomplete, coverage matrix, and § 10.3's pre-run warning in both
the editor and the viewer.

- **Acceptance:** opening Secure Tower with `nearest-car` selected produces the warning naming the
  two credential-aware profiles, before Run; opening it with `destination-eta` produces none;
  authoring an access zone on a building and switching to a conventional dispatcher raises it live.
- **Liveness evidence:** the warning's test asserts the *count* of credential-aware shipped profiles
  is derived from `data/dispatcher-profiles.json` rather than hard-coded, so adding a third profile
  changes the message.
- **Non-test caller:** `dev/editor.ts` and `dev/main.ts`.

> **§ 10.3's warning landed 2026-07-29**, on both surfaces, with all three acceptance cases
> asserted in `access/dispatcherCredentials.test.ts` and driven in the browser. **Two deliberate
> departures from the wording above:**
>
> - **No percentage.** § 10.3's example sentence reads *"33 % of riders will not be served"*. That
>   figure is `benchmark/accessControl.ts` H-ACCESS-1's measurement of one arm, one building, one
>   seed and one traffic profile; reproducing it in a message that fires on **any** building under
>   **any** credential-blind profile would publish a number nothing re-derives, which `CLAUDE.md`
>   forbids in those words. The message names the restricted floors instead — derived, exact, and
>   the thing the reader can act on. A test asserts the message carries no `%` at all.
> - **§ 2.8's mechanism is narrower than the code's.** The prose says the two credential-aware
>   profiles are the ones that *"declare a credential-carrying `dispatch.callType`"*. Measured
>   through `core`'s own `callCarriesCredential`, a `destination-entry` profile with
>   `passengerAssignment: 'panel'` **also** carries a credential, because the kiosk performs the
>   access check and forwards its verdict (§ D30). The count — **2 of 12** — is right and is
>   re-derived in the test rather than quoted; the stated reason for it was incomplete.
>
> **The floor list is written as runs**, not as 29 comma-separated ids: *"29 of its 30 floors
> (2–30)"*. Both facts survive — the reader still learns the count — and the runs are consecutive
> **positions in the building's own floor order**, never arithmetic on the id, because floor ids
> are strings (`G`, `B2`, `Zone 5 hotel`). Changed at the W7a merge for a measured reason: the
> note is a paragraph in the same flex column as the canvas, and at 1440 × 900 with W6's mood
> gauge and W2's summary already in that column the stage had fallen to **149 px** for a 30-floor
> building. The runs take the note from 78 px to 59 px and the stage back to **281 px**.
>
> **Still open from § 10.2:** the floor multi-select and the floors × credential-groups coverage
> matrix. The credential *autocomplete* is landed in its § 10.2 form (options over the groups the
> building already uses, no fixed vocabulary) as the lens's own picker.

### W9 — R12, made mechanical *(depends on W3)* — ✅ **DONE 2026-07-29, and it emptied a category**

> The unit this document did not have when it was written. R12 was added by the design review as a
> rule and left as an aspiration: *"before a goal ships as single-run, run it over at least 20
> seeds… and publish the pass rate in the scenario file beside the goal."* Nothing ran it, nothing
> published it, and nothing could fail. W9 is the mechanism.

Measure every candidate goal's across-seed pass rate on every scenario it is a candidate for;
publish the counts in `data/`; demote by the measured rate rather than by intent; and guard the
whole of it.

- **What landed.** `packages/viz/src/scenario/`: `goals.ts` (the seven kinds as predicates over one
  replication, plus R12's classification), `candidates.ts` (§ 5.4's seven stages as configurations,
  every stage a candidate for every kind), `measure.ts` (two seed sets through **W3's** runner —
  no second runner and no second estimator), `published.ts` (the file shape and the validator),
  `goalReport.ts` (the same instrument over whatever batch the Compare tab just ran).
  `data/scenario-goals.json` is the published table.
- **Acceptance, met:** every shipped goal carries its measured rate with its `n`; nothing strictly
  between 0 and 1 ships as a single-run goal (nothing ships as one at all — see R12's box);
  a goal kind with no measured rate on a scenario is a **guard failure**, not an omission.
- **Liveness evidence, watched red before green.** Three source mutations: disabling the
  completeness clause reds *"catches a goal kind that ships with no measured rate at all"* with
  `expected '' to contain 'goal kind "no-divergence" has no measured pass rate here and is in no
  bucket'`; counting the judgeable seeds instead of poisoning the batch reds both the unit
  assertion **and** the re-derivation, which reports the survivor-counted `"rateClass":
  "constant-pass"` over `"passes": 49, "unmeasured": 1`; freezing the new `offeredPer5Min` field to
  `null` reds the re-derivation, which is what proves the field is read on the shipped path rather
  than only in a test. Ten data mutations run permanently as negative controls, applied to the
  **real** loaded table rather than to a fixture, and two of them exist for the false-negative shape
  this wave hit three times — `disposition` and `rateClass` are both stored *and* derived, so each
  is mutated alone **and** mutated consistently with its bucket, and the derivation from the
  published counts is what fails in every case.
- **Non-test caller:** `src/dev/main.ts` → `src/dev/batchPanel.ts` → `src/scenario/goalReport.ts` →
  `src/scenario/goals.ts`. The Compare tab prints, under the comparison rows, what each candidate
  goal **is** on the configuration just run — a batch goal, a fact about the configuration, or not
  judgeable here — with no verdict and no badge.
- **What it cost W3's contract:** one field. `BatchReplication.offeredPer5Min`, because
  `answer-the-demand` is `personsPer5Min >= offeredPer5Min` and the batch carried only the carried
  half. It is a **field and not a `BatchMetric`** on purpose: every arm sees the same passengers by
  construction, so a comparison row on it would be a paired difference of a value with itself, which
  is the shape § D158 § 3 records deleting rather than keeping as decoration.
- **One correction this lane made to itself, kept rather than absorbed.** The first draft filed
  **every** kind with no per-run predicate as unshippable, which quietly demoted
  `beat-the-baseline` — a goal § 5.2 already ships, as a **batch** goal, because R2 says a
  comparison needs a batch. R12 governs goals judged on *one run*; a goal that was never one is not
  demoted by it. The routing is now `batch-only → goals`, `blocked → withheld`, pinned in **both**
  directions by negative controls.
- **Known limit.** `everyone-can-get-there` is measured as **unmeasurable** and published as
  withheld, blocked on W7. It is not implemented here and W9 depends on none of W7's files.

### Dependency graph

```
W1 ──┬── W2 ──┬── W3 ──┬── W5 ──┬── W6
     │        │        │        │
     │        ├────────┴────────┘
     │        │
     └── W7a  └── W7b ── W8
              
W4 (independent, gated on open question q1) ──── W5, W6
```

---

## 12. Measurement log

**M1**–**M16** were measured on `design/phase9-experience` on 2026-07-28, Node 26, against the
repository's own `data/`. **M17**–**M19**, and the re-derivations marked *corrected* / *refuted*,
were measured on `docs/drift-sweep` on 2026-07-28 — the same day, but **after `f895a16`**, which is
why the energy rows move. Scripts were scratch; every result is reproducible from the stated
configuration.

| id | Measurement |
|---|---|
| **M1** | 5 buildings × 12 dispatchers, seed 42, `durationS: 900`, `onTimeout: 'report'`, shipped traffic profile at default demand level: **14 of 60** cells report `awtIsValid === true`. 12 of those 14 are Garden Apartments; the other two are `mixed-use-high-rise`/`destination-panel` and `secure-tower`/`destination-eta`. **40** of the 60 are diagnosed `saturated`; **6** more fail on censoring; 14 are quotable. |
| **M2, corrected** | Garden Apartments, same settings: **10 of 12** dispatchers give AWT 11.319 s and WT95 24.548 s, but only **9 of 12** also give TTD 39.302 s — `energy-aware` returns **39.592 s**, matching on wait and differing on journey time. Re-measured on this tree; the original row over-counted the TTD clause by one. SHA-256 over `{shafts, landings, legs}` gives **7 distinct recordings**; one fingerprint is shared by `eta`, `fairness-first`, `capacity-aware`, `auction`, `auction-multi-round`, `destination-eta`. The exceptions are `zoned-uppeak` (AWT 2.500 s) and `predictive-balanced` (11.919 s). |
| **M3** | Recording section sizes by `JSON.stringify().length` — see § 2.4 table. `shafts` is 89–93 % of every recording; `legs` is 5–8 %. Vertical City at 1800 s: **3 222 legs**, 7 971 kB total. |
| **M4** | `landingAssignmentsAt` at mid-run, 60 calls: 1 ms on Midtown Office (0.02 ms/call), 4 ms on Vertical City with 3 222 legs (0.07 ms/call). 60 Hz budget is 16.7 ms. |
| **M5** | Sampling every 15 s: deepest single landing call **175** (Midtown Office, 900 s), **379** (Vertical City, 1800 s), **5** (Secure Tower under `destination-panel`, where a call is one OD pair). Most simultaneous call rows: 10 / 44 / 29. |
| **M6** | `Simulation.run()` without recording, 20 replications, seeds 1000–1019, 900 s, `collective`: Garden Apartments 2 ms/rep, Secure Tower 24 ms/rep, Midtown Office 60 ms/rep, Vertical City 196 ms/rep. |
| **M7** | Same batch: Garden Apartments 19/20 quotable, 0/20 saturated. Midtown Office **0/20** quotable, 20/20 saturated. Secure Tower **6/20** quotable, 4/20 saturated. Vertical City 0/20 quotable, 19/20 saturated. |
| **M8** | Midtown Office, seed 42, `demand: { arrivalRatePctPop5min: r }`: quotable at r = 1, 2, 3 for all four arms tested; **all four saturate at r = 4**; at r = 5 `eta` (77.2 s) and `predictive-balanced` (62.6 s) are quotable and the others are not; all saturate at r = 6 and above. Quotability is not monotone in demand at one seed. |
| **M9** | `discoverParameterSchemas()` → 10 schemas, **99 declared rows**, of which **95 distinct ids** (four are legitimately re-declared by two schemas each: `answer.bypassLoadThreshold`, `answer.overloadThreshold`, `car.designLoadFactor`, `car.nominalPassengerMassKg`). `collectSearchSpace()` → **49** dimensions, 13 gated; sections `weights` 12, `dispatch` 11, `answer` 9, `idle` 9, `auction` 3, `eligibility` 2, `normalization` 2, `constraints` 1; types continuous 32, categorical 9, boolean 4, integer 4. The **46** distinct ids excluded are all of `car.*`, `traffic.*`, `metrics.*`, `analytical.*` and `sim.*` — excluded mechanically, because no dispatcher profile has a section that can hold them, not by name. |
| **M10, corrected** | `discoverParameterSchemas(browserBarrel)` returns the identical 10 schemas and 99 rows — the schema **data** in `core/browser` is complete and discovery against either barrel agrees. **The second sentence was wrong.** Discovery does *not* run client-side with no package change: `discoverParameterSchemas` and `collectSearchSpace` are declared in `packages/experiments/src/tuning/space/collect.ts`; `packages/experiments/package.json` declares only `"."` and `"./package.json"`, so a deep import is refused by the resolver; and the one entry it does declare reaches `node:worker_threads` through `runner/parallel.ts`. § 8.5 already said *"a browser cannot import the tuner today"* — that is the statement that matches the code. § 13 q1 is therefore a **prerequisite** for W4, not an optimization. |
| **M11** | `render/canvas.ts:210–217` draws `mean wait so far` from `frame.runningMeanWaitS` with no `awtIsValid` guard, on the same header as the `SATURATED — AWT suppressed` banner drawn at lines 230–235. Observed on screen at Midtown Office seed 42 (87.7 s beside the banner) and Secure Tower seed 16757712606996968457 (1.8 s beside *10.7 % never served*). `describeFrame.ts:67–71` states the suppression and never prints a mean. |
| **M12** | `data/dispatcher-profiles.json` holds 12 profiles. Exactly two — `destination-eta`, `destination-panel` — declare `dispatch.callType: mobile-credential`. The other ten run at the `up-down-buttons` default. |
| **M13, refuted** | An energy metric exists. `REPLICATION_METRICS` has **23** entries, four of them energy — `energyKJ`, `carDistanceM`, `carStarts`, `energyPerServedLegKJ` — and `RunSummary.energy` (`EnergyStatistics`) carries `workKJ`, `distanceM`, `starts`, `workPerServedLegKJ`, `movingCarCount`, `measured`. The original row was true of the tree this design was authored against and false by the time it merged: `f895a16` landed the axis in between. It is a *proxy* for out-of-balance mechanical work in kJ and is **not** kWh — no `kWh` or `energyKwh` symbol exists, and that part of the row stands. § 2.9, § 7.3, [`DECISIONS.md` § D106](../DECISIONS.md). |
| **M14** | `VizSummary` carries 9 fields; `RunSummary` carries `window`, `windowSeconds`, `counts`, `waiting.*` (including `pctOverLongWait`), `rideTime`, `loadFactor`, `handlingCapacity`, `achievedInterval`, `saturation`, `serviceLevel` — none of the last seven reaches the viewer. |
| **M15** | The Run-viewer / Building-editor tab selection is not written to the URL; every other control is. Verified by clicking the tab and re-reading `location.href`. |
| **M16** | `.claude/launch.json` declares port 5173; `packages/viz/vite.config.ts` declares 5174 with `strictPort: false`. |
| **M17** | Garden Apartments, `collective`, 900 s, default peak-5min window: the quotable AWT is computed over **5** legs at seed 42 (11.319 s), **1** at seed 4 (10.262 s), **11** at seed 1 (21.463 s), **4** at seed 2, **10** at seed 3 — all with `awtIsValid: true`. R13's minimum-n rule. |
| **M18** | Secure Tower, `collective`, seeds 1000–1019, 900 s: of § 5.2's five single-run goals, `deliver-everyone` passes **0/20**, `nobody-abandoned` **20/20**, `answer-the-demand` **0/20**, `long-waits-under` (≤ 10 %) **11/20**, and `everyone-can-get-there` is not evaluable from `RunSummary` at all. Same batch: 4/20 saturated, 6/20 quotable, reproducing M7. R12. |
| **M19** | `runMatrix()` on this tree: `nearest-car` is on the Pareto front at **6 of 8** cells (all but `midtown-down-peak` and `mixed-use-up-peak`); every cell's front is decided over `['awt','energy','wt95']`. The basis for R11. |

### Re-checked on 2026-07-28, after `destination-eta` gained its `rideTime` weight

`weights.rideTime: 0.5` ([`DECISIONS.md` § D112](../DECISIONS.md)) changes a shipped dispatcher's
behaviour, so every row above that names `destination-eta` or counts dispatchers was re-run rather
than assumed. **Rows are marked measured-again, not merely believed.**

| id | state |
|---|---|
| **M1** | **Reproduces exactly.** Re-run as 5 × 12 through `elevator-sim run --seed 42 --duration 900`: **14 of 60** quotable, 12 of them Garden Apartments, the other two `mixed-use-high-rise`/`destination-panel` and `secure-tower`/`destination-eta`; **40** saturated, **6** censoring failures. `secure-tower`/`destination-eta` still quotes, at 38.11 s. |
| **M2** | **Reproduces exactly**, and necessarily: the weight moves **4 of the 60** shipped cells and **`garden-apartments` does not move at all**. Ten of twelve still return AWT 11.32 s; the exceptions are still `zoned-uppeak` (2.50 s) and `predictive-balanced` (11.92 s). The six-profile shared fingerprint, which includes `destination-eta`, is unaffected. |
| **M11** | ✅ **CLOSED** — see § 2.1 and § 11 W1. The defect was real, and it was in `elevator-sim watch` as well as in the canvas. |
| **M12** | **Still true as written** — 12 profiles, exactly two declaring `mobile-credential`. What it did *not* say, and what changed, is the weight vector: both of those two now weight `rideTime`. |
| **M15** | ✅ **CLOSED** — the tab is written to the URL. |
| **M19** | **Re-measured and unchanged at 6 of 8**, on the same two exceptions. Two cells' *membership* moved — `destination-eta` joins `midtown-up-peak` and leaves `midtown-interfloor` and `vertical-city-up-peak` — and neither move touches `nearest-car`, so **R11's basis is intact**. Per-cell table in [`docs/05`](05-roadmap.md) § *What the matrix found*. |

**Not re-measured, and therefore not re-asserted:** M3–M9, M10, M13, M14, M16, M17, M18. None names
`destination-eta` or a dispatcher count, and M10's refutation (`packages/experiments` has no browser
export) was re-read against `packages/experiments/package.json` and still holds.

> **M10 is now itself out of date, in the good direction.** `packages/experiments` **does** have a
> browser export ([§ D121](../DECISIONS.md)) and W4 is built against it ([§ D127](../DECISIONS.md)).
> The row's *finding* — that discovery gives identical results against either `core` barrel and that
> a browser could not import the tuner **at the time it was written** — stands as a record of what
> was true then. Both halves of § 13 q1 are closed.

### Measured 2026-07-28 by T47, settling § 13

| id | Measurement |
|---|---|
| **M20** | Midtown Office, seeds 1000–1019, `durationS: 900`, `onTimeout: 'report'`, all **12** shipped arms, `demand: { arrivalRatePctPop5min: r }`. Quotable replications out of 20, worst arm across the twelve: r = 1 → **20/20** (all twelve at 20/20); r = 2 → 18/20 (`nearest-car`; eleven others at 20/20); r = 3 → 16/20 (`nearest-car`; `energy-aware` and `auction` at 19, **nine** arms at 20/20); r = 4 → 8/20 (`nearest-car`; **no** arm at 20/20, best 18); r = 5 → 5/20 (best 14). Over a batch, quotability **is** monotone in demand — M8's non-monotonicity is a single-seed effect. § 13 q2. |
| **M21** | `collective`, seeds 1000–1019, 900 s, on `midtown-office`, `secure-tower` and `mixed-use-high-rise` — 60 runs. A windowed goal (`waiting.pctOverLongWait ≤ 10`) and a whole-run goal (`counts.unserved === 0`) return **opposite verdicts on 35 of 60**. `midtown-office` seed 1000: window `pctOverLongWait` **89.5 %** (fail) against **0** unserved (pass), with the window `300–600 s` of an **1822 s** run. § 13 q3. |
| **M22** | Secure Tower, seed 42, 900 s. Structural-refusal warnings in `SimulationResult.warnings`, which `VizRecording.warnings` carries: `collective` **11** of 13 warnings, `nearest-car` **18** of 20, `destination-eta` **0** of 2. Text, verbatim: *"call `high#18:down` at floor `18` going down was never collected: every car in bank `high` refused it for a structural reason (accessDenied). Under dispatch.callType `up-down-buttons` a landing call carries no credential, so an access-restricted pickup floor is infeasible for the whole bank."* § 13 q4, and the basis for § 10.4's second correction. |
| **M23** | `runSimulation`, `collective`, 900 s, seeds 1000–1019, on this tree: Garden Apartments **0.7** ms/rep, Secure Tower **23.5**, Midtown Office **59.1**, Mixed-Use High-Rise **68.5**, Vertical City **227.1**. M6 reproduces on four of five within noise; **Vertical City is 16 % slower** than M6's 196, and Mixed-Use was never in M6. 50 replications: 0.0 / 1.2 / 3.0 / 3.4 / **11.4** s. § 13 q5. |
| **M24** | `ActiveWhenCondition` admits exactly two forms — a value list and `{ min?, max? }` — and `activeWhenSatisfied` returns `false` for an unset gate, so *"the absolute override is unset"* is not expressible and cannot be smuggled into the value list. Separately, and **superseded by T75**: of the **10** schemas `discoverParameterSchemas()` finds, two used to refuse to collect. All **10** collect now — `SIM_PARAMETERS`' two log-over-zero scales were a defect and are fixed in `core`; `TRAFFIC_PARAMETERS`' **four** `default: null` rows were not, and are reported per row in `SearchSpace.unsearchable` rather than taking the schema down. Declared rows **106 → 106**, dimensions **56 → 56**. § 13 q6, and W4's own finding as corrected. |
| **M25** | `C34`'s caller count, with the repository's own scanner (`corpus`/`isBarrel`/`auditModules` from `tuning/callers.test-helper.ts`, comments stripped so a `{@link}` is not an import). Non-test, non-barrel importers of `experiments/src/browser.ts`: **0 → 3** (`viz/src/controls/controls.ts`, `viz/src/controls/types.ts`, `viz/src/dev/parameterForm.ts`). Importers of any kind: 1 → 7. `auditModules(['experiments/src/tuning/space'])` uncalled exports: **6 → 3** — `activeParameters`, `parameterOf` and `defaultCandidate` gained real callers, which is what they were written for. § D127. |

### Measured 2026-07-29 by T62, for W3

Seed `20260729` throughout — a **different seed set** from M6/M7/M18/M20, which is why the counts
below are not directly comparable with theirs and are not read as re-measurements of them.
`durationS: 900`, `onTimeout: 'report'`, through `runBatch` (both arms, CRN audit on), Node 26.

| id | Measurement |
|---|---|
| **M26** | Quotable replications out of **50**, at each building's own traffic profile: Garden Apartments **47/50** (`collective`) and **47/50** (`eta`), 0 saturated; Secure Tower **7/50** and **8/50**, 24 and 22 saturated; Midtown Office **0/50** and **0/50**, **50/50 saturated on both arms**. So W3's acceptance clause — *"a batch of 50 on Midtown Office returns a paired-t interval on a difference"* — is met on the observation rows at n = 50 and cannot be met on AWT at that building's shipped demand. |
| **M27** | Midtown Office, 50 replications per arm, `collective` baseline against `eta`, `demand: { arrivalRatePctPop5min: r }`. Quotable `collective`/`eta` and the paired ΔAWT: r = 1.0 → 50/50, `+0.322 [−0.355, +1.000]`; r = 1.5 → 50/50, `−0.461 [−1.211, +0.289]`; r = 2.0 → **49**/50, **suppressed**; r = 2.5 → 50/50, `−1.779 [−3.271, −0.286]`; r = 3.0 → 50/50, `−2.399 [−4.090, −0.707]`. The 2.0 % dip is **one replication** and is not read as refuting **M20**; what it shows is that under the complete-case suppression rule a single replication suppresses the estimate half, so a demand level must be validated at the batch size that will be run. Note also that r = 2.5's `1.779 s` is **below** `docs/07` § 4's 1.9 s resolution limit between structurally different dispatchers. |
| **M28** | Wall-clock through `runBatch`, 50 replications × 2 arms including the recording fold and the field-for-field CRN comparison: Garden Apartments **0.16 s**, Secure Tower **2.53 s**, Midtown Office **5.18 s**, Vertical City **22.91 s** — that is 1.6 / 25.3 / 51.8 / 229.1 ms per arm-replication, every one of which is within **−12 % to +8 %** of **M23**'s bare `runSimulation` figure for the same building, so the fold and the audit are inside the machine noise rather than a measured overhead. Reproduces **M6**/**M23** within the difference those two account for. Not asserted by any test — § D91 records what happens to a gate whose threshold is a property of the machine. |
| **M29** | Garden Apartments, 50 replications: some replications report **no** `waiting.pctOverLongWait` at all, because it is a percentage of the rides served **in the reporting window** and this is the building **M17** measures as quoting an AWT over five legs at one seed and one at another. Those pairs are `null`, the batch row's verdict is `unmeasured` rather than `suppressed` or `0 %`, and the surviving pairs are not averaged. An observation can be absent without being refused, and the two states are drawn differently. |
| **M30** | **The goal pass-rate table**, § 11 **W9**, pinned in `data/scenario-goals.json` and re-derived by `packages/viz/src/scenario/goalRates.test.ts`. Seven stages of § 5.4, `collective`, `durationS: 900`, `onTimeout: 'report'`, two **disjoint** seed sets of **50** replications each (masters `20260730` and `20260731`, disjointness checked over the derived `replicationSeed`s). `long-waits-under` at **≤ 10 %**, M18's threshold. Cells are `tuning, holdout`. See the table below. Of the 35 (goal × stage) cells with a per-run predicate: **14 batch goals, 19 configuration facts, 2 unjudgeable** — and **0 single-run goals**, which is R12's own trichotomy applied without slack rather than a threshold anyone chose. |
| **M31** | **M18 is corrected by M30 at a larger `n`.** Secure Tower, `collective`, shipped demand — M18's own cell, at 50 seeds rather than 20 and on two disjoint sets. `deliver-everyone` **0/50, 0/50** (M18: 0/20 — reproduces as a constant); `nobody-abandoned` **50/50, 50/50** (M18: 20/20 — reproduces); `long-waits-under (≤ 10 %)` **32/50, 30/50** (M18: 11/20 — reproduces as variable); and `answer-the-demand` **3/50, 1/50**, which M18 recorded as a **constant** at 0/20. It is a very low-rate variable, so R12 makes it a **batch goal** on that stage rather than a briefing fact. A classification taken at twenty seeds moved at fifty: § D158's *"a level validated at n = 20 can suppress at n = 50"* arriving on a goal instead of on an estimate. |

**M30 — the goal pass-rate table.** `tuning, holdout`, each of 50 replications. A cell that is `0/50`
or `50/50` on both sets is a **fact about the configuration**, not a goal; anything strictly between
on both is a **batch goal**; a cell with any unjudgeable run is neither.

| stage | building, demand | `deliver-everyone` | `no-divergence` | `nobody-abandoned` | `answer-the-demand` | `long-waits-under` ≤ 10 % |
|---|---|---|---|---|---|---|
| **1 first call** | `garden-apartments`, shipped | 49/50, 48/50 † | 50/50, 50/50 | 50/50, 50/50 | **38/50, 48/50** | 49/50, 48/50 † |
| **2 morning rush** | `midtown-office`, 2.5 % | 50/50, 50/50 | 50/50, 50/50 | 50/50, 50/50 | **24/50, 20/50** | **41/50, 45/50** |
| **3 overwhelmed** | `midtown-office`, shipped | 50/50, 50/50 | 0/50, 0/50 | **28/50, 29/50** | 0/50, 0/50 | 0/50, 0/50 |
| **4 two banks** | `mixed-use-high-rise`, 1.5 % | 0/50, 0/50 | **13/50, 14/50** | 50/50, 50/50 | 0/50, 0/50 | **43/50, 42/50** |
| **5 credentials** | `secure-tower`, shipped | 0/50, 0/50 | **35/50, 32/50** | 50/50, 50/50 | **3/50, 1/50** | **32/50, 30/50** |
| **6 the tall one** | `vertical-city`, 0.5 % | **4/50, 9/50** | **41/50, 43/50** | 50/50, 50/50 | **4/50, 6/50** | 49/50, 50/50 ‡ |
| **7 prove it** | `midtown-office`, 1.5 % | 50/50, 50/50 | 50/50, 50/50 | 50/50, 50/50 | **26/50, 31/50** | 50/50, 50/50 |

Bold is a shipping batch goal. † is **unjudgeable**: 1 of 50 tuning seeds and 2 of 50 holdout seeds
serve nobody in the reporting window, so those runs have no verdict and the judgeable ones are not
counted on their own — see R12's box. ‡ is **withheld because the two seed sets disagree about the
kind of answer**: 49/50 is a variable and 50/50 is a constant-pass, and a classification that does
not survive a disjoint seed set is not one to ship a level on. `everyone-can-get-there` and
`beat-the-baseline` are withheld on every stage, the first blocked on W7 and the second because it
compares two arms.

> **This table had gone stale, and now it cannot again.** Three of row 6's five cells did not match
> `data/scenario-goals.json`: `no-divergence` was written 38/50, 42/50 against a shipped 41/50,
> 43/50; `answer-the-demand` 4/50, 5/50 against 4/50, 7/50; and `long-waits-under` was still **bold**
> — marked as a shipping goal — after the measured rates had made it *withheld*. The cause was
> `vertical-city` declaring its ground-lobby escalator: the goal table was regenerated by its own
> tool and this prose copy of it was not. That is exactly the failure mode `CLAUDE.md` names — *if
> you publish a number, pin it to the run that produced it* — arriving on a markdown table because
> nothing re-derived one. `packages/viz/src/scenario/goalRates.test.ts` now parses this table out of
> this file and compares every cell, every bold mark and every footnote against the shipped JSON, so
> a regeneration that leaves this paragraph behind is a test failure rather than a discovery.


---

## 13. Open questions that must be settled before implementation

> ## Settled 2026-07-28 — **all eight**, and three of them corrected something in this document
>
> Each answer below carries its **basis**: *measured*, *decided*, or *already closed by* a named
> decision. Where a question named a measurement as its settling method, the measurement was run.
> Full working in `DECISIONS.md` § D126.
>
> | q | answer | basis |
> |---|---|---|
> | 1 | **Yes, and it is shipped.** The prerequisite closed at § D121; the residual — TypeScript does not apply the `browser` condition — is closed mechanically in `packages/viz/src/boundaries.test.ts` (§ D127) | already closed, § D121 + § D127 |
> | 2 | **3 %/5 min on Midtown Office**, with the scenario declaring an arm set of nine of the twelve, at which every declared arm is **20/20** quotable. The strict all-twelve reading gives **1 %/5 min** | **measured**, **M20** |
> | 3 | **Every goal declares its scope, and the scenario schema requires the field.** The two disagree on **35 of 60** measured runs | **measured** (**M21**), then decided |
> | 4 | **No new event.** `core` already computes the refusal reason and it already reaches `VizRecording.warnings`. What is missing is a *structured* form of it, which is a `core` change | **measured**, **M22** |
> | 5 | **50 by default, off the main thread, with the resolution stated on screen**; a scenario asking for a resolved difference declares **150** | **measured** (**M23**), then decided |
> | 6 | **No — § 9.3 option (b) stands.** `activeWhen` provably cannot express *"the absolute override is unset"*, and the null default already breaks something else | **measured**, **M24** |
> | 7 | **"ride."** One boarding, one car, one wait; a journey with a transfer is **two rides**. § 7.1's `WT95` row is corrected accordingly | **decided**, against `describeFrame`'s wording |
> | 8 | **Before, and it is done.** The ⚠️ bucket is empty; two of the four rows were **false**, not merely unverified | already closed, [§ D120](../DECISIONS.md) |

1. ✅ **ANSWERED — yes, and both halves are now closed.** **Does `@elevator-sim/experiments` gain a
   browser-safe export? — PREREQUISITE, not optional.**
   W4 needs the search space and W3 wants the CRN manager, and today the package declares exactly
   two export paths (`"."`, `"./package.json"`) with no browser condition, so a deep import of
   `tuning/space` is **refused by the resolver**, and the one entry that exists pulls
   `node:worker_threads` through `runner/parallel.ts`. This question was originally marked optional
   on the strength of **M10**'s second sentence, which is refuted: M10 establishes that the schema
   *data* in `core/browser` is complete and that discovery gives identical results against either
   barrel, not that discovery *runs* client-side unchanged. § 8.5 stated the true position all
   along. **W4 cannot start against `collectSearchSpace()` until this is answered.**
   *Settled by:* a decision from the owner of `packages/experiments`, plus a graph-walk test in the
   manner of `core/src/browser.test.ts` if the answer is yes.

   > **Answered: yes.** [§ D121](../DECISIONS.md) added the barrel, the export condition and the
   > both-directions graph-walk guard, and § D121 itself recorded the half it did **not** close:
   > *"TypeScript does not apply the `browser` export condition … and nothing mechanically forces a
   > `viz` file to pick"* the explicit subpath. That half is now closed too, by a guard test in
   > `packages/viz/src/boundaries.test.ts` that fails on a bare `@elevator-sim/experiments`
   > specifier anywhere in the package — tests included, because nothing in `viz` has a legitimate
   > use for that package's Node surface. Manufactured and watched: on the violation, `tsc -p
   > packages/viz --noEmit` exits **0** and the guard names the offending file. `tsc` exiting zero
   > is the evidence the guard is necessary rather than tidy. § D127.

2. ✅ **ANSWERED — 3 %/5 min, with the arm set declared.** **What demand level makes Midtown Office a
   teachable scenario?** **M8** shows a single-seed sweep
   cannot answer this. *Settled by:* running `saturationCensus.test.ts`'s own rule — the highest load
   at which every arm including the baseline returns a valid AWT — over a batch on each candidate
   building, and recording the answer in the scenario file.

   > **Measured (M20).** Over a batch, quotability **is** monotone in demand, and steep. Twelve arms
   > × 20 seeds × five rates: at **1 %** all twelve are 20/20; at **3 %** nine of twelve are 20/20
   > and the worst (`nearest-car`) is 16/20; between **3 % and 4 %** every arm leaves 20/20 at once.
   >
   > **3 %/5 min**, with the scenario declaring the nine arms that are 20/20 there. That is the rule
   > applied, not bent: its emphasis is that the **baseline may not be excluded**, and `docs/07` § 4
   > already established `nearest-car` as a poor reference arm — both recommended baselines,
   > `collective` and `eta`, are 20/20 at 3 %. A scenario that insists on offering `nearest-car`
   > must drop to 1 %, where no queue forms and there is nothing to teach.

3. ✅ **ANSWERED — every goal declares its scope, and the schema requires it.** **Is a scenario's goal
   judged on the report window or the whole run?** Every figure in
   `RunSummary` is windowed (peak 5 minutes by default), but "20 people never arrived" is a whole-run
   fact. A scenario that mixes them without saying which is which will produce goals that look
   contradictory. *Settled by:* fixing the convention in the scenario schema — each goal declares its
   scope — and asserting it.

   > **Measured first (M21), because "looks contradictory" understates it.** `collective`, seeds
   > 1000–1019, 900 s, on three buildings: a windowed goal (`pctOverLongWait ≤ 10`) and a whole-run
   > goal (`counts.unserved === 0`) return **opposite verdicts on 35 of 60 runs**. On
   > `midtown-office` seed 1000 the window says 89.5 % of legs waited over a minute — *fail* — while
   > the whole run says zero unserved — *pass* — and the window is **300–600 s of an 1822 s run**.
   > Not an edge case: the majority case. So `scope` is a **required** field on every goal, rejected
   > at load if absent, and printed beside the verdict.

4. ✅ **ANSWERED — no new event; `core` already says it, and § 10.4 was too strong.** **Does a
   locked-out call need an explicit event, or is credential-plus-zone enough?** § 10.4
   infers it. An inference in the viewer is a second source of truth about a question `core` answers
   (`estimateCost` returns `accessDenied` / `destinationAccessDenied`), and CLAUDE.md has a rule about
   that. *Settled by:* checking whether the refusal reason survives into `RunRecord` today; if it does
   not, deciding whether `core` should carry it, which is a `core` change and not this document's.

   > **Checked, and it does survive (M22).** `Simulation` diagnoses stuck calls and pushes a warning
   > naming the call, the floor, the direction and the reason set; the warnings reach
   > `RunRecord.warnings` and `VizRecording` **already carries `warnings`**. Measured on Secure
   > Tower, seed 42: `collective` produces **11** structural-refusal warnings, `nearest-car` **18**,
   > and `destination-eta` **0**. One reads, verbatim: *"call `high#18:down` at floor 18 going down
   > was never collected: every car in bank `high` refused it for a structural reason
   > (accessDenied)."*
   >
   > So the answer is **no**: the refusal reason is computed, it survives, and no new event is
   > needed. What is missing is a **structured** counterpart to the sentence — the fact is prose,
   > keyed on a call id `VizLeg` does not carry, and emitted only for calls still stuck at the end.
   > That is a `core` change and is **new debt**, not this document's to make. W7b's
   > `VizLeg.credentialGroup` is still the cheaper half and still lands first.

5. ✅ **ANSWERED — 50 by default, 150 for a resolved difference.** **How many replications does a
   Basic-mode player wait for?** W3 measures 0.1–9.8 s for 50. The
   budget table says ±0.5 s needs n = 143 and ±0.25 s needs n = 563 — on Vertical City that is 28 s
   and 110 s. *Settled by:* choosing a default per scenario, sized to the building, and stating the
   resolution the chosen budget buys on screen (which is what `tune` already does).

   > **Re-measured (M23)**, because a budget decision that rests on a stale cost is a budget nobody
   > checked. M6 reproduces on four of five buildings; **Vertical City is 16 % slower** on this tree
   > (227 ms/rep against M6's 196), and Mixed-Use High-Rise — which M6 never measured — is 68.5.
   >
   > **50** is the default: the floor of CLAUDE.md's 50–200 budget, and the largest number that
   > keeps every building except Vertical City under 4 s. Vertical City needs a worker and a
   > progress indicator at any budget in the range, which W3 already specifies. A scenario whose
   > goal is a *resolved difference* declares **150**, from `docs/07` § 4's table. The resolution
   > the budget buys is stated on screen; an interval containing zero reads *"too small to measure
   > at 50 runs"* and offers to raise it.

6. ✅ **ANSWERED — no; § 9.3 option (b) stands, and now on measurement.** **Is
   `traffic.arrivalRateMultiplier` worth a `core` schema change?** § 9.3 recommends resolving it
   at the scenario layer for Phase 9. *Settled by:* whether `activeWhen` can express "the absolute
   override is unset" without a new condition form. If it cannot, (b) stands.

   > **It cannot (M24).** `ActiveWhenCondition` has exactly two forms — a value list and a numeric
   > interval — and `activeWhenSatisfied` returns **`false`** for an unset gate by a rule its own
   > docstring defends. So an "is unset" condition is not expressible, and it cannot be smuggled
   > into the value-list form either: an unset gate fails *every* condition, including one that
   > named it.
   >
   > **A second reason arrived with W4, and T75 narrowed it without removing it.**
   > `collectSearchSpace` refuses `traffic.arrivalRatePctPop5min` because its default is `null` —
   > *"a search needs a point it can start from"*. That null is the *"only honest default"* § 9.3
   > quotes approvingly, so the obstacle to (a) and the obstacle to **searching that row** are the
   > **same fact seen twice**. What T75 changed is that the fact no longer takes the whole schema
   > with it: the row is named in `SearchSpace.unsearchable` and its thirteen siblings collect.
   > **No number was invented for it, and none should be** — a search cannot start from "unset", and
   > any number declared there is imposed on every profile in every building. (b) stands.

7. ✅ **ANSWERED — "ride".** **What is the plain-language name for a "leg"?** `boardedLegs` counts
   leg boardings and a
   sky-lobby journey boards twice — this was already a wave-1 defect (`served` → `boardedLegs`).
   Basic mode must not reintroduce it by calling legs "people". *Settled by:* a decision on the word,
   applied consistently, with `describeFrame`'s existing wording as the reference.

   > **Decided: "ride".** One boarding, one car, one wait; a sky-lobby journey is **two rides**.
   > `describeFrame` already draws the distinction the word has to preserve — *"N **legs** waiting,
   > M boarded so far"* against *"N **passengers** undelivered"* — and "ride" is short, is not a
   > person, and composes: *"12 rides"*, *"the longest ride waited 41 seconds"*.
   >
   > **This convicts § 7.1's flagship row**, which renders `WT95` as *"1 in 20 **riders**"* over a
   > statistic computed on legs — the wave-1 defect reappearing in the plain-language column of the
   > document written to prevent it. Corrected there.

8. ✅ **ANSWERED — before, and it is done.** **Should the four `⚠️ unverified` rows in `UX.md` be
   settled before or during Phase 9?**
   `RV-11`, `RV-17`, `RV-21`, `KB-14`. `KB-14` (`prefers-reduced-motion`) matters most here, because
   an animated queue is exactly what that media query is about. *Settled by:* emulating the query in a
   driven session, which costs minutes.

   > **Closed by [§ D120](../DECISIONS.md), and it cost more than minutes because two of the four
   > were false rather than unverified.** `RV-21` was severe: a temporal-dead-zone `ReferenceError`
   > left **Retry permanently dead after any failed load**, with the page clearing its own error
   > message. `RV-17`'s second clause was false because Vite answers a missing `data/` file with
   > `index.html` and a **200**, so the only branch that named the missing path is the one it does
   > not take. `KB-14` and `RV-11` hold, with their limits recorded. The ⚠️ bucket is **0**, and
   > W4 adds no `transition` or `animation` declaration to the stylesheet, so KB-14's guard block
   > still protects against future motion rather than present motion.

---

## 14. Requests for files this document does not own

0. **`README.md` § Documentation — required, and this branch is red without it.**
   `packages/experiments/src/validation/documentation.test.ts` § *"lists every docs/\*.md on disk"*
   walks `docs/` and requires every file to be linked from README's table. Adding this document
   fails it; reproduced on this branch, `1 failed | 10 passed`. `README.md` is not this task's file,
   so the row is requested rather than written:

   ```
   | [Experience layer contract](docs/10-experience-layer-contract.md) | Phase 9's contract: the rules that keep a gamified surface honest, basic/advanced modes, rider queues, plain-language metrics, generated dispatcher and rider-model editors, access zoning |
   ```

1. ✅ **DONE.** **`packages/viz/src/render/canvas.ts`** — remove or gate the unconditional running
   mean in `drawHeader` (**M11**, W1). Landed 2026-07-28 as `meansAreSuppressed` in
   `frame/overlay.ts` with three named non-test callers, **and** the same defect was found and fixed
   in `packages/cli/src/commands/watch.ts` on both render paths ([§ D111](../DECISIONS.md)).
2. ✅ **DONE.** **`packages/viz/UX.md`** — § A.3's **Success** and **Saturated** rows are re-marked
   with the evidence, on both suppression grounds, on screen and in the exported PNG. Both
   *"must not show"* clauses were **false**, not merely unverified.
3. ⬜ **STILL OPEN.** **`docs/05-roadmap.md`** — add Phase 9 with the acceptance criteria of § 11.
   Deliberately **not** done: Phase 9 is designed and not started, and adding a roadmap phase row
   for unstarted work is how a design starts reading as work in progress. It is recorded instead in
   `docs/05` § *What remains* and [`docs/07`](07-handoff.md) § 8. The second half of this item —
   that `nearest-car` is the viewer's default despite `docs/07` § 4 recommending against it as a
   reference arm — is recorded, and item 4 is the fix.
4. ✅ **DONE 2026-07-28.** **`packages/viz/src/dev/main.ts`** — the viewer's default dispatcher was
   `nearest-car` only because it is first in `data/dispatcher-profiles.json`; it now opens on
   **`collective`**, chosen from a stated preference list (`collective`, then `eta`) with a fallback
   to file order if neither is authored, and the URL's `dispatcher` parameter still wins. Verified
   in a driven browser: `?tab=parameters` deep-links, and the dispatcher selector reads `collective`
   on first paint. § D127.
5. ✅ **DONE.** **`packages/viz/src/dev/main.ts`** — the selected tab is written into the URL
   (**M15**), and with it the editor and the viewer stopped holding separate opinions about which
   building is open ([§ D111](../DECISIONS.md)).
6. ✅ **DONE 2026-07-28.** **`.claude/launch.json` and `packages/viz/vite.config.ts`** — reconciled
   on **5174** (**M16**), the port the server was actually serving. `strictPort` is now `true`,
   which is the half of the fix that stops the disagreement returning: under `false` a busy 5174
   silently becomes 5175 and the tooling is wrong again with nothing said. § D127.
7. **`AGENT_STATUS.md`** — U2–U8 are not yet tracked there; only U1 is.

9. ✅ **CLOSED by T75** (opened by W4). **`packages/core`** — both schemas collect and the editor
   can be pointed at all ten (**M24**, corrected). `SIM_PARAMETERS` was a defect in two rows and the
   **scale** was wrong, not the bound: zero is a named mode in both `sim.drainGraceS` and
   `sim.queueSampleCount`. `TRAFFIC_PARAMETERS` was **not** a defect, in four rows, and the fix was
   emphatically **not** "give it a number" — the null is the *"only honest default"* § 9.3 quotes
   approvingly, and giving `traffic.arrivalRatePctPop5min` a default would impose an office rate on
   every residential building. The four are named per row in `SearchSpace.unsearchable` instead.
   § 9.3 q6 is unchanged and still open on its own terms.
10. ⬜ **NEW, opened by § 13 q4.** **`packages/core`** — the structural-refusal reason exists, is
    correct, and is **prose** (**M22**). A structured counterpart — the call's reason set, keyed so
    a `VizLeg` can be joined to it — is what § 6's queue renderer and § 10's credential lens need,
    and it is a `core` change.
8. **`data/dispatcher-profiles.json`** — no change requested. Noted for the record: the profile set is
   sparse (`weights.rideTime` is authored by exactly one profile), which is correct and is why § 8.3
   opens on presets rather than on sliders.

---

## 15. Sources

Prior art and research consulted for § 3. Findings from these are marked **found** in the text;
everything else is this document's proposal.

- Nielsen Norman Group, *Progressive Disclosure* — https://www.nngroup.com/articles/progressive-disclosure/
- UX Tigers, *Progressive Disclosure: From Training Wheels to Week-Long AI Agents* — https://www.uxtigers.com/post/progressive-disclosure
- Human Transit, *overcrowding and underfunding: the lessons of "Mini Metro"* — https://humantransit.org/2014/03/the-lessons-of-mini-metro.html
- Transportist (David Levinson), *Mini Metro Review* — https://transportist.org/2014/11/05/mini-metro-review/
- Steam, *Mini Metro* — lost to a station without an overcrowding indicator — https://steamcommunity.com/app/287980/discussions/0/35221031840044247
- Steam, *Project Highrise* — elevator management discussion — https://steamcommunity.com/app/423580/discussions/0/358417461606712182/?ctp=2
- Frontiers in Psychology, *Natural frequencies improve Bayesian reasoning in simple and complex inference tasks* — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01473/full
- NCBI PMC4604268, same study — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4604268/
- arXiv 2207.09608, *A Cross-Language Study of How People Verbalize Probabilities in Icon Array Visualizations* — https://arxiv.org/pdf/2207.09608
- **Budescu, Broomell & Por, *Improving Communication of Uncertainty in the Reports of the IPCC*, Psychological Science 20(3), 2009** — the regressive-misreading finding itself, and the source R10 rests on
- **Budescu, Por, Broomell & Smithson, *The interpretation of IPCC probabilistic statements around the world*, Nature Climate Change 4, 2014** — the multi-country replication, and the evidence for **dual presentation** (word *plus* numerical range) as the remedy AR5 adopted
- Climatic Change (Springer), *Confident, likely, or both? The implementation of the uncertainty language framework in IPCC special reports* — https://link.springer.com/article/10.1007/s10584-020-02746-x — *commentary on the framework's implementation; cited for context, not for the misreading finding*
- Cambridge, *A Critical Assessment of the IPCC* ch. 17, *Uncertainty* — https://www.cambridge.org/core/books/critical-assessment-of-the-intergovernmental-panel-on-climate-change/uncertainty/3B238E862AB873D1D746F8A594DC6DFD — *same: context, not the finding*

Internal sources: [`CLAUDE.md`](../CLAUDE.md) invariants 4–8 and § Statistical discipline;
[`docs/03-traffic-and-statistics.md`](03-traffic-and-statistics.md) § Saturation detection;
[`docs/05-roadmap.md`](05-roadmap.md) § Standing requirement and § Phase 6;
[`docs/06-parameterization-and-tuning.md`](06-parameterization-and-tuning.md) § The parameter schema;
[`docs/07-handoff.md`](07-handoff.md) § 4 Resolution limits;
[`docs/09-destination-dispatch-contract.md`](09-destination-dispatch-contract.md) § 1.3;
[`packages/viz/UX.md`](../packages/viz/UX.md) § 7.1 and § 7.2 — *settled 2026-07-28: the ledger is
**88** rows, **79 ✅**, with `RV-11`, `RV-17`, `RV-21` and `KB-14` still ⚠️ unverified and `ED-12` /
`ED-13` re-marked against the schema*;
[`DECISIONS.md`](../DECISIONS.md) § D15, § D30, § D63, § D64, and **§ D106** (the energy proxy: its
basis, its constants, its omissions, and why energy is an axis and never a score).
