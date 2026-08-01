# Compute offload — the contract

**Status: designed. Criteria written before the implementation, which is the point.**

| Phase | State |
|---|---|
| A — self-hosted CI runners | **built, inert, and deliberately not provisioned** (2026-07-31, project owner) — see [`infra/README.md`](../infra/README.md) |
| B — measurement fan-out | designed, not started |

> **Provisioning was declined, and the reason is a finding rather than a change of mind.** § 6's
> expected cost of ~$5/month assumes **34 runner-hours**, i.e. billing only while a job executes.
> The template does not do that: `main.bicep` sets `capacity: runnerCount` with **no autoscale
> resource**, `orchestrationMode: 'Uniform'`, and ephemerality is per-job **reimage rather than
> deallocation** — the runbook's own verification step confirms the instances sit *"idle"* and
> running. Two VMs therefore bill 730 hours each, so **≈ $212/month is the expected bill, not the
> ceiling**, and the $250 figure is a budget *alert* — § 6 says correctly in one paragraph that
> Azure budgets notify and do not stop spend, then contradicts it in the next.
>
> **This is a published number that does not reproduce from the code that produced it**, which is
> the defect class this repository has a standing rule about. It is not a reason the design is
> wrong — inertness, the two-OS matrix guard and the x86-64 constraint were all proven by mutation —
> but it is a reason not to run it yet.
>
> **What would make it worth turning on:** `runnerCount: 0` at rest with a manual scale either side
> of a wave (one parameter, one command), deploy-per-wave with the teardown in `infra/README.md`
> § 7, or Actions Runner Controller on AKS scaling from zero on queue depth — the only one of the
> three that genuinely delivers per-job billing.
>
> **A criterion this contract should have had, and did not:** criterion 7 requires a *ceiling*
> declared before the first fan-out. It should also require the **expected** figure to be
> reproducible from the template, because the ceiling was right and the expectation was not.

**What "built, inert, unprovisioned" means, said precisely, because two of those three words are the
kind that get rounded up.** The infrastructure exists as code (`infra/azure/`, Bicep, compiles clean
and has never been deployed) and `ci.yml`'s Linux leg can be moved to it by setting one repository
variable. **With that variable unset — the shipped state — CI does exactly what it did before**, on
`ubuntu-latest`, and criterion 3 below is mechanised against the workflow file itself
(`infra/checks/`, run by the `matrix shape` job): the inert default is *evaluated*, in both
directions, and nine mutations of the shipped `ci.yml` are each required to be rejected.

Of the criteria in § 4, Phase A can meet exactly two. **3 is met and mechanised. 7's ceiling is
declared** — $250/month at the shipped defaults, derived in `infra/README.md` § 6 from public list
prices, with the honest note that an Azure budget alerts and does not cap, so the real ceiling is
the instance count. **4 cannot be checked until a runner exists**, and is the first thing to check
when one does: a pin that moves on the first self-hosted run is a finding about the runner, not a
value to edit. 1, 2, 5 and 6 are Phase B's.

This document covers moving compute off one laptop. It exists because the constraint is **not**
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
| **Lane verification decoupled from integration verification** | High, and immediate. This is what broke on 2026-07-31 at load 166 |
| Faster unit suite | **Lowest.** Already ~5–6× parallel at roughly one CPU-hour; more cores gives a useful but modest wall-clock cut |

**What it does not buy.** None of this repository's actual blockers this wave were CPU-bound. A
pre-registered criterion that was factually wrong, an authoring surface that did not exist, a
replay gap in a hand-written field enumeration, eleven behaviours that reached no shipped path —
none of them get faster with more cores. **Compute is not a substitute for the acceptance
apparatus, and cheap compute makes confident nonsense cheaper to produce.** The stated failure mode
of this project is reporting confident nonsense; a fleet is an amplifier in both directions.

---

## 2. Phase A — self-hosted CI runners

**Contract.** The Linux leg of the existing matrix runs on self-hosted runners sized for this
workload; the macOS leg stays GitHub-hosted, because the matrix's whole purpose is comparing two
platforms and Azure has no macOS.

- **x86-64 Linux**, matching `ubuntu-latest`, per § 0.2.
- Node pinned to the floor `package.json` declares, as `ci.yml` already does. **No Node axis** —
  § D201 eliminated Node as the variable on both sides, and re-introducing it would widen the matrix
  without a question to answer.
- `fail-fast: false` preserved. Cancelling one leg for being slow makes *"does this pin hold on both
  platforms?"* unanswerable, which is the comparison the matrix exists for.
- Ephemeral runners — one job per runner, torn down after. A reused runner is a shared mutable
  environment, and this repository has already lost a wave to a second writer on its tree.

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

1. **A sharded run reproduces the single-machine run.** Structural digest **exactly**; continuous
   summaries within § D202's declared tolerance. Same seeds, same cells, same arms, any shard count
   — including a shard count of 1, which must be byte-identical to not sharding at all.
2. **Arms cannot be split.** A test that *attempts* to distribute a comparison's arms across shards
   fails loudly at the type or the entry point. Asserted by trying it, not by reading the code.
3. **The two-OS matrix still compares two operating systems.** A self-hosted Linux runner must not
   silently become the only leg, and a test or workflow assertion says so.
4. **No pinned estimate moves and no identity digest moves** — Phase A changes where the suite runs,
   not what it computes. Any movement is a **finding about the runner**, reported and stopped on,
   never a value to edit. § D196/§ D201 cost this repository a wave over precisely that.
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
