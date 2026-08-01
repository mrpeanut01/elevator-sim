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

**Branch `feat/w13-teaching-surface` at `5d15b01`, worktree `.worktrees/w13-t6-teaching-surface`.**

Its commit subject is *"the teaching gate gains § D200's static hybrid, and it is what refuses the
round"* — so it appears to be **a fourth refusal**, which is a permitted and pre-registered outcome
(`docs/14` § 5 criterion 5, and § 7: *"any step may return a refusal — the learned dispatcher already
has, three times"*).

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

**Scrutinise the refusal itself hardest.** § D200 found that a *constant weight-vector hybrid* beat
the selector on both cells, so *"the advantage is static and the switching subtracts from it."* If T6
has added that hybrid to the gate and been refused by it, that is a coherent and honest result — but
check whether the comparison is the honest one (held-out traffic, disjoint **by construction** via
step 1's `trafficSeed`) rather than the flattering one, and whether the budget could resolve the
effect at all. **There is no compute fleet.** *"We cannot resolve this at the budget available"* is a
correct result; a narrow interval around a small effect is not a win.

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
