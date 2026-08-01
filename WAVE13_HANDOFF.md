# Wave 13 — handoff

**Paused 2026-08-01 at a clean boundary.** Six of seven steps are merged, verified and green. The
seventh is built and committed on its own branch, **unreviewed and unmerged**. Nothing is
half-written; every lane that landed did so through an independent adversarial review.

Read [`WAVE13_PLAN.md`](WAVE13_PLAN.md) for the board and
[`docs/14-building-behaviour-contract.md`](docs/14-building-behaviour-contract.md) for the contract.
This file is only what you need to **restart**.

---

## 0. Where the work is

| | |
|---|---|
| Integration branch | `integration/wave-13` at `6ec4891` |
| Suite on it | **272 files / 5 077 tests, 5 067 passed, 0 failed, 10 skipped**, `tsc -b` clean, `review-gates` green over 594 files, all 981 pins and both identity digests reproducing |
| Measured | Serially, on an idle machine, per `GAPS.md`'s own rule |

**Steps 0, 1, 2, 3, 4 and 5 are merged.** Decisions [§ D203](DECISIONS.md), [§ D205](DECISIONS.md),
[§ D206](DECISIONS.md) carry the criterion judgements; `AGENT_STATUS.md` § *Wave 13 — all six
behaviour steps merged* carries the per-measurement table.

**The skip count is 10 and did not move across six measurements.** That is the column to read.
4 896 → 5 077 tests says nothing on its own.

---

## 1. The one thing outstanding — T6

**Branch `feat/w13-teaching-surface` at `a6e8e2f`, worktree `.worktrees/w13-t6-teaching-surface`.**

**Verdict: REFUSED a fourth time — and on a new ground.** Pre-registered spec, n = 200 on held-out
traffic, `midtown-office`, two cells in one declared Holm family, both carrying step 4's day
variation:

| cell | taught ΔTTD (held-out) | static hybrid | taught − static |
|---|---|---|---|
| `interfloor-mix-1.5pct` | **−0.957 [−1.277, −0.636]** BETTER | **−1.207 [−1.535, −0.879]** | `+0.250 [+0.093, +0.407]` **WORSE** |
| `lunch-two-way-1.5pct` | **−0.714 [−0.961, −0.466]** BETTER | **−0.731 [−0.983, −0.479]** | `+0.017 [−0.023, +0.058]` INDIST. |

**The shape of this refusal is what makes it worth reviewing carefully.** § D145/§ D156/§ D200 all
refused *on the interval* — it contained zero, or the effect sat below the resolution limit. This arm
**clears all four of criterion 5's clauses at both cells**: interval excludes zero, above each cell's
own TTD-measured limit (0.501 s, 0.521 s), Holm rejects at α = 0.025/0.05 in a family declared before
any ΔTTD, and it generalizes in sign.

**It is refused by a fifth clause the lane added *after* its first run came back ACCEPTED.** That
clause is § D200's own advice turned into a gate: pin the weight vector the policy actually spent its
time in (`two-way` → `predictive-balanced`, held on 83.1 % / 86.6 % of decisions), run it for the
whole run with no selector, and require the policy to beat it. It does not. **§ D200's sentence
reproduces on two cells it was never measured on** — *the advantage is static, and the switching
subtracts from it.*

Costs reported beside, never folded in: AWT **+0.580 / +0.409 WORSE**, WT95 +2.245 WORSE /
indistinguishable, energy worse on the raw figure and per served leg.

**It survives a seed change** — § D206's lesson applied by the lane to itself. Six cells across three
seed configurations: switching premium **WORSE at three, indistinguishable at three, favouring the
policy at none.** Notably the *taught* arm's own ΔTTD is **not** stable (above its limit at four
cells, below at two) while the static vector beats the census's pick at all six.

**Budget was never the constraint.** 200 replications × 3 arms at 1 800 s is 12.4 s serial; the whole
pre-registered measurement is ≈ 6 minutes locally, run three times. No "cannot resolve at this
budget" disclaimer is needed, and `n = 200` is the top of the 50–200 band.

**It has not been reviewed and must not be merged on its commit message.** Every feature lane in this
wave was sent back at least once, and in each case the review found something the lane's own report
did not contain. Do this before anything else:

1. Read the lane's report if it is still resumable; otherwise read `git show 5d15b01` in full.
2. **Run an independent adversarial review** — instructed to *refute*, not approve, and to verify by
   driving code rather than reading it. Every useful finding this wave came from a mutation: write
   the one-line break, watch the intended test go red, revert.
3. **Verify `docs/14` § 5 is byte-identical to base by blob hash.** Base for this branch is
   `88756c6`. This single check is what separated a correct criterion refusal from an incorrect one,
   twice.
4. A refusal is published like the first three ([§ D145](DECISIONS.md), [§ D156](DECISIONS.md),
   [§ D200](DECISIONS.md)) — it needs a `DECISIONS.md` entry, not just a commit.

**What a reviewer must check, specifically:**

- **Is the fifth clause a raise or a weakening?** The lane says a raise, and `docs/14` § 5
  byte-identical with digest `0b98cc86…`. **Verify that digest against base `88756c6`.** A gate
  stricter than § 5 asks for is exactly what *"do not weaken a criterion — raise it instead"* means,
  but it is also how a lane could refuse a result it did not like. The distinguishing fact is that
  the raise was added **after an ACCEPTED run**, against the lane's own interest.
- **Is the static control fair?** It pins the *dominant* vector, which is sound at 83–97 % occupancy
  and would be a weak control for a policy alternating evenly between two. Confirm the occupancy.
- **The robustness sweep ran *after* the pre-registered verdict.** That checks a refusal, which is the
  safe direction — but confirm all six cells are reported whole rather than quoted from.
- **Is the honest comparison genuinely the only expressible one?** The lane claims no parameter, flag
  or field can ask for an interval on training traffic, and that the training number survives only as
  a bare mean. Drive it rather than read it.
- **A `data/` finding rides along and should be filed separately:** the shipped `auction-multi-round`
  and `collective` vectors are **not TTD-optimal at their own census's point** — the § D112 shape
  again, in reference data rather than in code.

**Known issues the lane reported:** `parseTeachingSpec` does not reject unknown keys, so a misspelled
field runs at its default; `traceDigest` hashes the master seed and so cannot witness the traffic
split (deliberately left alone — *an audit trail is not moved to make a new test convenient*);
and `docs/14`'s header row `| 4, 6 | designed |` became two rows, so **expect a merge conflict there.**

**The orchestrator still owes:** a `DECISIONS.md` entry for this verdict (all figures reproducible via
`elevator-sim tune --teaching packages/experiments/src/teaching/phase6c-midtown.teaching.json`), the
root-`.md` status rows, and a decision on whether these figures belong in `published.ts`. **Phase 6
stays partial — nothing here changes that.**

---

## 2. The thirteen open findings

None blocks the remaining work. **Read F6 first** — it is the condition that made three of this
wave's invariant-5 defects possible and is closed by none of them.

| # | Finding |
|---|---|
| **F6** | **Invariant 5's persistence layer has no non-test caller.** `createStoredRun`, `parseStoredRun`, `replayStoredRun`, `appendRunToFile` — every reference outside their own module is a barrel re-export, a docstring, a test, or a test's child process. Its correctness has only ever been checked against records it wrote itself, in the same process. That is the condition under which a field can go missing from a hand-written enumeration for two commits and no suite notice — which happened three times this wave |
| **F13** | **The Azure expected-cost figure does not reproduce from the template.** `~$5/month` assumes 34 runner-hours; `main.bicep` sets fixed `capacity` with no autoscale and reimage-not-deallocate ephemerality, so two VMs bill 730 h each ⇒ **≈ $212/month**, and `$250` is a budget *alert*, not a cap. **Provisioning was declined on this.** Fix options in `docs/15` |
| F2 | The `v1`/`v2` pairing prohibition is prose where `metrics/comparability.ts` exists to carry it as data; the CRN pairing key knows neither traffic field |
| F5 | No golden runs `v2` or carries a traffic seed, so `goldenRuns.test.ts` does not reach either replay field |
| F7 | Deleting `v1` later would silently misreplay every historical record — a `v1` record *omits* the key and the reader resolves `?? default` |
| F11 | ~700 characters of developer prose naming `sim.patience` and `summary.abandonment` render **verbatim in Basic mode**; the honesty sweep seeds `warnings: []` so it is never swept |
| F12 | Two § D203 claim sites remain unguarded, registered and asserted to *still carry the claim* so correcting either reddens the guard |
| F4, F8 | T0 and T3 low-severity findings, each measured |
| F10 | *(closed as a decline)* `docs/02` states plainly that no stair reference value is citable and what an author must do instead |

---

## 3. What worked, and is worth repeating

**One worktree, one branch, one agent, and a real `npm ci` in each.** Not the symlinked
`node_modules` — `@elevator-sim/*` realpath-resolves back to the main checkout, so built-artifact
evidence becomes evidence about code you did not write. This cost one reviewer a false negative
before it re-pointed its scratch copy and re-ran.

**Reviewers told to refute, not approve.** Six lanes, six reviews, six sent back. The reviews caught:
a lane's own remediation that did not kill the mutation it cited; a losslessness claim whose test
projected through the surviving fields so it could not fail; two config fields nothing could set, in
the wave whose governing rule forbids exactly that; and a pre-registered criterion declared
impossible on evidence that reversed on a seed change.

**Mutation is the evidence.** Every strong claim in this wave was backed by breaking the code and
watching the intended test redden. Every weak one was backed by reading.

**Do not run more than one test suite at a time.** Three concurrent workloads reached **load 166** and
killed an integration run. `GAPS.md` already said to measure serially on an idle machine.

**Absolute paths on every command.** Working-directory drift between tool calls caused three separate
errors here, including a documentation check that "passed" from a tree lacking the file under test.

---

## 4. The line that is not crossed

Unchanged, and it held all wave: **981 pinned estimates and both identity digests reproduce, and a
moved pin is a finding rather than a value to edit.** Nothing in `packages/experiments/src/benchmark/
published.ts` moved. `docs/14` § 5 is byte-identical to base through three separate criterion
judgements — which is the only reason a correction can be distinguished from a weakening.

---

## 5. Decided, not implemented — `populationDigest`

**Finding.** `runner/replication.ts:112`'s `traceDigest` hashes `trace.seed` — the **master** seed —
as its first field. Since step 1 split the demand seed off, two runs generating the *same passenger
population* against two different machines digest differently, and two runs with *different*
populations at the same master seed also differ. **The digest can no longer distinguish "same crowd"
from "same seed".**

**Not a defect today.** Every cell of one experiment shares one master seed, so `verifyCrnAlignment`
and `assertCrnAligned` work exactly as intended. It becomes one the moment anything audits CRN
*across* experiments that differ in run seed but share a traffic seed — which is what
`packages/experiments/src/teaching/` now does.

**Checked first, and the answer is the opposite of what was expected: no digest is pinned anywhere.**
`published.ts` never mentions `traceDigest`; `crn.test.ts` asserts only relationally
(`toBe(traceDigest(other))`, `not.toBe`, `/^[0-9a-f]{16}$/`, and one fabricated
`'deadbeefdeadbeef'` mismatch fixture); nothing under `reports/` carries one. So changing it would
cost nothing mechanical.

**Decision: add `populationDigest`, do not change `traceDigest` — and the reason is not pinning.**
`traceDigest` is the CRN **audit trail**: `assertCrnAligned` reports it and stored records carry it.
An audit trail is not moved to make a new capability convenient, which is the reasoning T6 already
applied when it declined to move it. Pinning would have been a second reason; its absence does not
remove the first.

**Shape.** The population is *already* fully hashed — `passengerLine` covers id, journey, batch,
arrival instant, origin, destination, mass, category, demand floor, profile, credential and every
leg. `trace.seed` and `buildingId` are a provenance prefix on top of it. So:

- extract the tail (everything from `buildingId` onward) as `populationDigest`;
- `traceDigest` becomes `hashBytes(seed) → populationDigest`'s body, so its value is **unchanged**;
- **`buildingId` stays inside `populationDigest`** — a population is defined against a building's
  floor ids, and *"same crowd, different machine"* means a different dispatcher, not a different
  building. A cross-building population comparison is meaningless, not merely unequal.

**Not implemented, deliberately.** There was no budget left to land it with a **real non-test caller**
and a watched-failing test. A `populationDigest` shipped with no caller is this repository's
signature defect — twelve instances, one of them T5 in this very wave, sent back for exactly that.
**Whoever picks it up: give it a caller in `teaching/` first, then the digest.** The test to write is
the three-run contrast `trafficSeed.test.ts` already uses — same traffic seed and different run
seeds must produce the **same** `populationDigest` and **different** `traceDigest`s; that assertion
fails today, which is the whole finding.
