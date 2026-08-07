# Compute offload — the contract

**Status: designed. Criteria written before the implementation, which is the point.**

| Phase | State |
|---|---|
| A — self-hosted CI runners | **withdrawn (2026-08-05, project owner). Requirement, runbook and code all removed** — see below |
| B — measurement fan-out | designed, not started |

> **Phase A is withdrawn, and the withdrawal is recorded rather than the section quietly deleted.**
> It was built as Bicep under `infra/azure/`, held inert behind an unset `CI_LINUX_RUNNER_LABEL`
> repository variable, and **never provisioned** — no VM ever booted and no job ever ran on one.
> The whole of it is now gone from the tree: the template, the cloud-init, the runbook, the
> `infra/checks/` workflow guard, and the `matrix shape` job that ran it. `ci.yml`'s Linux leg is
> the literal `ubuntu-latest` again, so there is no variable that can retarget a leg.
>
> **The finding that preceded the withdrawal stands, because it is the reusable part.** The
> runbook's expected cost of ~$5/month assumed **34 runner-hours** — billing only while a job
> executes. The template did not do that: `capacity: runnerCount` with **no autoscale resource**,
> `orchestrationMode: 'Uniform'`, and per-job **reimage rather than deallocation**, so two VMs
> billed 730 hours each. **≈ $212/month was the expected bill, not the ceiling**, and the $250
> figure was a budget *alert*, which notifies and does not cap. That is a published number that did
> not reproduce from the code that produced it — the defect class this repository has a standing
> rule about — and it is why the pool was never turned on.
>
> **A criterion this contract should have had, and did not:** criterion 7 requires a *ceiling*
> declared before the first fan-out. It should also require the **expected** figure to be
> reproducible from the template, because the ceiling was right and the expectation was not. That
> requirement now applies to Phase B, which has not been built.
>
> **Nothing here rules out self-hosted CI later.** It rules out *this* design, whose billing model
> was fixed capacity wearing the language of per-job ephemerality. Per-job billing needs scale-from-
> zero on queue depth, which is a different architecture and would need its own contract.
>
> **`infra/` exists again and is a different thing.** It now holds the deployment of the *product* —
> a Container App serving the viewer and the API, a PostgreSQL server and Communication Services —
> and has nothing to do with CI or with this document. It is called out here because a reader who
> remembers the withdrawal will otherwise find the directory back and reasonably assume the decision
> was reversed. It was not. The one thing it inherits is the lesson: its cost model is derived from
> parameters in its own template, and it scales to zero at rest rather than claiming to.

This document covers moving measurement compute off one laptop. It exists because the constraint is **not**
"more cores make things faster" — that part is uninteresting and mostly true. The constraint is that
this repository's statistical guarantees are **same-machine claims**, and a fleet that ignores that
would run faster and answer worse.

---

## 0. The two constraints that govern everything below

### 0.1 Common random numbers pair *within one run on one machine*

[§ D202](../DECISIONS.md) settled this while closing § D201:

> Bit-equality across machines was never needed: common random numbers pair alternatives *within one
> run on one machine*, so paired comparisons keep their 5–20× variance reduction per-platform, and
> invariant 5's replay guarantee is a same-machine claim that still holds.

**Therefore the unit of distribution is a whole paired comparison, never an arm.** A fleet that put
`eta` on node A and `collective` on node B would still produce numbers, would run at the same
throughput, and would silently discard the 5–20× the CRN design buys — because the two arms would no
longer share a passenger trace. The statistical discipline in `CLAUDE.md` names this directly:
*always feed the same passenger traces to every alternative under comparison.*

This is the single easiest way to spend money and get worse answers, and it is invisible in every
output except the width of the interval.

### 0.2 A runner is a pin environment

[§ D201](../DECISIONS.md) found the § D196 pin set **exactly inverted** between Linux and
darwin/arm64 — 26 replacements failing and the 26 values they superseded passing, same three files,
same skip count — while the totals reproduced on both. `.github/workflows/ci.yml`'s own header says
the two-OS matrix is deliberate for exactly this reason.

**So the architecture of a runner is a measurement decision, not an infrastructure one.** An
x86-64 Linux runner is the *same* environment as `ubuntu-latest` and buys cores without buying a
third pin set. An Ampere/ARM runner is a **third platform**, and under § D202's split — structural
digest exact, continuous summary within tolerance — it is buyable, but it must be **validated
rather than assumed**.

Phase A therefore matches `ubuntu-latest`. ARM is a later, separate, deliberate decision with its
own measurement.

---

## 1. What this buys, and what it does not

Ranked honestly, because the weakest case is the one that sounds most appealing.

| Buys | Value |
|---|---|
| **Higher replication budgets** — n = 200 → 800 halves a paired interval | **Highest.** The only place compute can change a *published verdict*. Phase 6c is refused partly on resolution: `−0.213 [−0.440, +0.014]` at n = 200 |
| **Routine pin regeneration** — currently a wave-scale event (~1 900 s) | High. Removes the § D196 staleness pressure structurally rather than by vigilance |
| ~~Lane verification decoupled from integration verification~~ | Was Phase A's, and **is not on offer any more.** This is what broke on 2026-07-31 at load 166, and it remains unaddressed rather than solved |
| ~~Faster unit suite~~ | Was Phase A's, and the **lowest**-value row on this table anyway. Already ~5–6× parallel at roughly one CPU-hour |

**Two of those four rows died with Phase A**, and the two that survive are both Phase B's. That is
worth stating rather than leaving to inference: withdrawing Phase A did not just remove an
implementation, it removed the only part of this document that was going to make CI faster.

**What it does not buy.** None of this repository's actual blockers this wave were CPU-bound. A
pre-registered criterion that was factually wrong, an authoring surface that did not exist, a
replay gap in a hand-written field enumeration, eleven behaviours that reached no shipped path —
none of them get faster with more cores. **Compute is not a substitute for the acceptance
apparatus, and cheap compute makes confident nonsense cheaper to produce.** The stated failure mode
of this project is reporting confident nonsense; a fleet is an amplifier in both directions.

---

## 2. Phase A — self-hosted CI runners — **WITHDRAWN**

**The contract that stood here is withdrawn**, and the implementation it judged has been removed
from the tree. See the note under the status table for what was built, what was never run, and the
cost finding that ended it.

Two properties it asserted are **not** Phase A's and survive it, because they are properties of
`ci.yml` itself and remain enforced by the file:

- **The matrix compares two operating systems**, `fail-fast: false`, with no Node axis — § D201
  eliminated Node as the variable on both sides.
- **The Linux leg is x86-64, or the run says so.** The architecture check is still in `ci.yml`. Its
  subject is now GitHub changing what `ubuntu-latest` means rather than an operator pointing a leg
  at an ARM pool, which is a smaller threat and still not this repository's decision to make.

What is gone with the phase is the *mechanised* guard on those properties: `infra/checks/` evaluated
the runner-label expression and rejected nine mutations of `ci.yml`, and it was deleted with the
switch it existed to prove inert. **Both properties are therefore now conventions in a file rather
than assertions in a test.** Say that plainly rather than counting the guard as still standing.

## 3. Phase B — measurement fan-out

**Contract.** `benchmark/` studies are shardable by **replication block**. A shard receives a set of
replication indices and runs **every arm** of **every cell** it is given; it never receives a subset
of arms.

- The shard boundary is the replication, and the aggregation is over paired differences already
  computed within a shard — never over per-arm means computed on different machines.
- Splitting arms across shards must be **structurally impossible**, not discouraged. A comment
  saying *"do not split arms"* is the shape of defect this repository has paid for repeatedly; the
  type must refuse it.
- Sharding is opt-in and the un-sharded path is unchanged.

---

## 4. Acceptance criteria — written before the implementation

Each is a run, not an argument.

**Numbering is deliberately not compacted.** Criteria 3 and 4 belonged to the withdrawn Phase A.
They are struck through rather than deleted and the remaining five keep their original numbers, so
that a criterion cannot be quietly dropped by renumbering the list around it — and so that anything
elsewhere citing "criterion 5" still points at the criterion it meant.

1. **A sharded run reproduces the single-machine run.** Structural digest **exactly**; continuous
   summaries within § D202's declared tolerance. Same seeds, same cells, same arms, any shard count
   — including a shard count of 1, which must be byte-identical to not sharding at all.
2. **Arms cannot be split.** A test that *attempts* to distribute a comparison's arms across shards
   fails loudly at the type or the entry point. Asserted by trying it, not by reading the code.
3. ~~**The two-OS matrix still compares two operating systems.** A self-hosted Linux runner must not
   silently become the only leg, and a test or workflow assertion says so.~~ **Withdrawn with
   Phase A.** No leg is retargetable any more, so the threat it guarded does not exist; the
   two-OS matrix itself remains in `ci.yml`, now as a convention rather than an assertion (§ 2).
4. ~~**No pinned estimate moves and no identity digest moves** — Phase A changes where the suite
   runs, not what it computes. Any movement is a **finding about the runner**, reported and stopped
   on, never a value to edit.~~ **Withdrawn with Phase A**, which never ran, so this was never
   tested. **The rule behind it is not withdrawn** and Phase B inherits it directly: a pin that
   moves when only the machine changed is a finding about the machine. § D196/§ D201 cost this
   repository a wave over precisely that.
5. **The resolution limit is re-measured at the new budget, never inherited.** Raising n lowers the
   smallest detectable effect. § D156 refused two cells that *cleared* Holm–Bonferroni because the
   effect was a third to a half of what the apparatus could resolve there — that judgement is
   budget-dependent, and re-running it at n = 800 against a limit measured at n = 200 would be a
   verdict laundered through a stale bar.
6. **No new dead seam.** The shard runner names its non-test caller. A barrel re-export and a
   `{@link}` tag look exactly like a caller and are not one.
7. **Cost is bounded and observable.** A ceiling is declared before the first fan-out, and spend is
   reported beside the result the way energy is reported beside AWT — never folded into a claim
   about how good an answer is.

---

## 5. What this document does not do

It does not authorise spend. Provisioning is the project owner's decision, and this contract is what
the work is judged against once they make it.

It does not make a small effect important. A narrower interval around `−0.213` is still `−0.213`,
and criterion 5 exists so that raising the budget cannot quietly convert *"we cannot resolve this"*
into *"this is real"* without re-measuring what the apparatus can now see.

It does not add a platform. ARM is deliberately deferred to its own decision with its own
measurement, per § 0.2.
