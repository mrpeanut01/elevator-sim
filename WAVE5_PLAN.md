# Wave 5 — closing the open-debt register

> ## 🏁 CLOSED 2026-07-28. All eight lanes merged; **no phase verdict moved.**
>
> **Measured serially on an idle machine after the eighth merge** — the only condition under which
> the number means anything: `npx tsc -b` clean, **178 files / 3 349 tests, 3 340 passed, 9 skipped**,
> exit 0, 567 s. Baseline was 172 / 3 220. The **+129 tests and +6 files are accounted for lane by
> lane** in [`docs/07-handoff.md`](docs/07-handoff.md) § 1.
>
> **Nine items closed, seven opened.** § 5 made *"the debt table rewritten to what is actually left,
> including anything this wave opened"* a condition of done, and it was the right condition: five of
> the seven new items were found only by fixing something adjacent to them.
>
> **Five of the eight lanes found that the item as written was not the defect** — `C5`'s stated
> defect was already gone, `C30`'s question was answerable only because a second gate had been
> disagreeing in silence, `C32` was two defects with the second invisible to any refusal, the `node:`
> reachability list was three modules rather than one, and the roadmap carried no status at all for
> two phases. Decisions: [§ D116](DECISIONS.md)–[§ D124](DECISIONS.md).
>
> **§ 7's risks, scored.** All four task-specific risks were real and all four were caught by the
> mitigation named against them — T36 proved the seed→case mapping unmoved by diff *and* by running
> both regressions; T40's guard fired on a 6c upgraded by inheriting a sibling's citations, which is
> the tautological shape, caught inside its own lane; T38 re-marked the row rather than relaxing the
> schema; T39 recorded what it could not exercise instead of ticking it. **The risk this board did
> not name is the one that cost the most:** eight lanes each running a package-wide suite on a
> 10-core machine, load 198, two lanes stalled and one stray `pkill` crossing lanes. See
> [§ D124](DECISIONS.md).
>
> The plan below is as written at the opening and is left unaltered.


Coordination artifact for the delivery **reopened 2026-07-28** after `918897d`. Authoritative for
wave-5 task scope, ownership, merge order and the definition of done.

[`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md) is the closed record of waves 1–4 and stays retired in
place per [§ D105](DECISIONS.md) — `docs/01`, `docs/05`, `docs/08`, `core/src/analytical/` and
`packages/viz/UX.md` cite it, and its five recorded process mistakes are the most transferable thing
that delivery produced. This document does not supersede it; it continues from it.

**Baseline commit:** `918897d` · **Integration branch:** `integration`

---

## 0. Baseline, measured before anything was planned

Not taken on report. Run on this tree on 2026-07-28 before any worktree existed:

```
npx tsc -b                                        → clean, exit 0
npx vitest run --testTimeout=120000               → 172 files / 3 220 tests
                                                    3 211 passed, 9 skipped, exit 0, 540 s
```

This reproduces [`docs/07-handoff.md`](docs/07-handoff.md) § 1 exactly, including the file count and
the skip count. **The handoff is truthful, so wave 5 plans against it rather than re-deriving it.**

The 540 s is this machine's answer and is not a fixture — `docs/07` § 1 records the same tree
measured at 435 s, 519 s, 793 s and 578 s on other machines and occasions. Do not use it as a
runtime regression signal.

## 1. Goal, and what is deliberately **not** in it

Close the open-debt register in [§ D115](DECISIONS.md) § *What remains open* and
[`docs/07-handoff.md`](docs/07-handoff.md) § 8 — **without moving any phase verdict**, because none
of this work bears on one. If a phase verdict does move, that is a finding and it gets measured, not
rounded.

**In scope — nine items:**

| Item | Why it is closable now |
|---|---|
| `C5` — a `'z'` quantile-family label can still print | Cosmetic mislabelling, and it is the exact class review finding #14 was about |
| `C24` — `fuzz/`'s only non-test caller is a test | A CLI `fuzz` command closes it cleanly and puts the deep campaign in a user's hands |
| `C27` — Phase 6a/6b studies are off the package barrels | Name list is settled in § D62; both files must change in one commit |
| `C32` — the fuzz generator picks call types blind to the profile | A real corpus extension; `run.ts` currently papers over it in `withCallType` |
| `C4` — the sequential stopping rule's budget | Recorded as *needing a decision, not a default* |
| `C30` — `ED-12` / `ED-13` contradict the schema | A `core` schema question that has been deferred rather than answered |
| `packages/experiments` has no browser export | A **prerequisite**, not an optimization — it blocks `docs/10`'s W4 |
| Four ⚠️ UX rows — `RV-11`, `RV-17`, `RV-21`, `KB-14` | Built and reachable; never driven. `KB-14` is one of seven ⛔ non-negotiable rows |
| **No test asserts any phase's status** | Named in § D115 as **the largest un-mechanised risk in the repository** |

**Explicitly out of scope, and left exactly as their decisions record them.** These are deferred by
argument, not by neglect, and wave 5 does not quietly reopen them:

| Deferred | By |
|---|---|
| **Phase 6c — learned control** | § D28. Shares no interface with 6a/6b, strains invariant 8, and its criterion is stated in metrics 6b makes non-comparable. **Needs its own acceptance question before it needs an implementation** |
| **Phase 9 — the experience layer** | `docs/10` is a complete design and not one line is built. Its § 13 lists questions that must be settled first. No status table carries a Phase 9 row, deliberately |
| **Double-deck simulation** | Configured, validated, disclaimed on every run of `vertical-city`, not simulated |
| **`patternSwitching`** | § D12. Authored in `data/`, schema-validated, read by no runtime code |
| **`garden-down-peak`'s identity class** | Structural, not under-weighted — bit-identical at `rideTime` 0.3, 1.0 **and** 2.0. An open question, not debt |
| **The `moveFloor` scope call** | § D111 hands the scope decision back deliberately |

## 2. Standing rules this wave is built around

Unchanged from [`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md) § 3 and
[`docs/07-handoff.md`](docs/07-handoff.md) § 3 and § 9. Restated because every one of them was
written after the defect it prevents had already shipped:

1. **Name the non-test caller.** Not *"is this symbol reachable?"* A barrel re-export is not a
   caller; a `{@link}` is not a caller. This project has shipped **ten** instances.
2. **Liveness is measured, not read.** "It looks wired" is not evidence.
3. **Reviewers run things.** Agents here have reported green suites that were red, and a
   tautological guard survived being flagged *and* reported fixed.
4. **Gates are told: determine whether this is true, do not make it true.**
5. **No acceptance criterion may be weakened to pass. Raise it instead.** Done once by accident,
   inside a decision whose stated purpose was to strengthen a gate (§ D27 → § D99).
6. **A bit-identical result is a wiring bug until proven otherwise.**
7. **If you publish a number, pin it to the run that produced it**; if you write a sentence about
   *why* something performs better, either measure it or say it is unmeasured.

## 3. Task tree — wave 5A (all eight in flight, opened 2026-07-28)

| ID | Task | Branch | Worktree | Depends on |
|---|---|---|---|---|
| **T33** | `C5` — the `'z'` family label | `fix/c5-z-label` | `.worktrees/T33` | — |
| **T34** | `C24` + `C27` — CLI `fuzz` command and the two barrels | `feat/fuzz-cli-and-barrels` | `.worktrees/T34` | — |
| **T35** | `packages/experiments` browser export + graph-walk guard | `feat/experiments-browser-export` | `.worktrees/T35` | — |
| **T36** | `C32` — profile-aware fuzz call types | `fix/c32-fuzz-call-types` | `.worktrees/T36` | — |
| **T37** | `C4` — the sequential stopping rule's budget **decision** | `fix/c4-stopping-budget` | `.worktrees/T37` | — |
| **T38** | `C30` — the `ED-12` / `ED-13` schema question | `fix/c30-editor-schema` | `.worktrees/T38` | — |
| **T39** | The four ⚠️ UX rows, **driven** | `feat/ux-verify-rows` | `.worktrees/T39` | — (applies T38's verdict after merge) |
| **T40** | **A guard that binds phase status to evidence** | `test/phase-status-assertions` | `.worktrees/T40` | — |

### Why all eight are safe in parallel

Ownership is disjoint at **file** granularity, not directory granularity — the coarser split is what
let wave 1 mis-partition Phase 5 and ship four dead seams at once.

| Task | Owns (write) |
|---|---|
| T33 | `experiments/src/reports/compare.ts` + its tests |
| T34 | `cli/src/**`, `experiments/src/index.ts`, `index.test.ts`, `benchmark/index.ts`, `fuzz/index.ts` — plus a **narrow doc exception** for the CLI command list in `README.md` and `docs/07` § Running it |
| T35 | `experiments/package.json`, `experiments/src/browser.ts` + `browser.test.ts` (both new) |
| T36 | `experiments/src/fuzz/{generate,run}.ts` + their tests, `fuzz/corpus.test.ts` |
| T37 | `experiments/src/runner/stopping.ts` + its tests |
| T38 | `core/src/config/{schema,parse}.ts` + their tests |
| T39 | `packages/viz/**` including `UX.md` |
| T40 | `experiments/src/validation/phaseStatus.test.ts` (new); `docs/05-roadmap.md` for **form only, never a verdict** |

**The orchestrator owns everything not listed** — in particular all of `docs/**`, `README.md`,
`CLAUDE.md`, `DECISIONS.md` and the root coordination artifacts, apart from T34's and T40's stated
exceptions. Builders **report** doc staleness with path and line; they do not edit it. This keeps
eight concurrent lanes out of the four documents whose mutual agreement is itself a guarded
invariant.

**Two ownership collisions were resolved by sequencing rather than by hoping:**
- `packages/viz/UX.md` — T38 produces the `ED-12`/`ED-13` verdict and the exact replacement rows;
  **T39 owns the file**. The orchestrator applies T38's rows after T39 merges.
- `data/**` and `packages/core/src/sim/**` are written by nobody this wave. T36 must derive the
  legal call-type set *from* `data/dispatcher-profiles.json` (invariant 7) without editing it.

### Worktree setup

Every worktree was created from `integration` and initialised with `./.worktree-setup.sh`, which
builds a real `node_modules` whose `@elevator-sim/*` entries point **into the worktree**. A naive
symlink of the root `node_modules` resolves to its realpath, so built artifacts would be about the
main checkout's code — recorded as process mistake #2 of waves 1–4, which cost a task's CLI evidence.

T39 needs a running app. `.claude/launch.json` carries a **`viz-T39`** configuration that runs Vite
with `.worktrees/T39/packages/viz` as its root on port 5174, so the UX evidence is about T39's tree
and not the main checkout. That entry is temporary and is removed when T39 merges.

## 4. Merge order

```
T33 → T37 → T33/T36 → T35 → T34 → T38 → T39 → T40
```

Resolved to: **T33, T37, T36, T35, T34, T38, T39, T40**, each `--no-ff` into `integration`, with
verification after each merge.

Rationale, in dependency terms rather than convenience:
- **T33** and **T37** are the smallest blast radius (one module each, no exported surface change) and
  go first so a later failure has fewer candidate causes.
- **T36** changes the fuzz corpus, so it lands before **T34**, which puts a CLI command on top of the
  campaign — otherwise T34's end-to-end evidence would be about a corpus that is about to change.
- **T35** changes `package.json`'s `exports`, which affects how everything downstream resolves; it
  lands before T34's barrel work so the barrels are added against the final resolution rules.
- **T38** before **T39** because T39 applies its verdict.
- **T40** last, because it asserts statuses over the whole tree and must see the final one.

## 5. Definition of done for wave 5

Per task:
- Stated acceptance criteria pass — **run, not read**, with real output in the report.
- Every behavioural change has a test; every guard has been **watched failing** before it passes.
- Any new configurable behaviour has a **named non-test caller** and a measured liveness assertion.
- `npx tsc -b` clean and the owning package's suite green in the task's own worktree.

For the wave:
- The nine in-scope items closed, or reclassified with the reason recorded in `DECISIONS.md` —
  "closed" and "honestly still open with a better description" are both acceptable outcomes;
  "ticked" is not.
- Full suite green after every merge, with **no test-count regression** against the 3 220 baseline.
- Phase 8's blocking rule honoured: **any property violation blocks the wave.**
- `docs/05-roadmap.md`, `docs/07-handoff.md`, `CLAUDE.md`, `README.md` and this file agree with each
  other **and with the code**, re-verified after the last merge rather than assumed.
- The open-debt table in `docs/07` § 8 rewritten to what is *actually* left — including anything
  wave 5 opened. A register that only ever shrinks is not being read honestly.

## 6. Rollback

Each task is one branch merged `--no-ff`, so a failed integration is `git revert -m 1 <merge>` on
`integration` with the task branch still alive for a follow-up. `main` is untouched until
`integration` is green end to end. Worktrees are removed only after their branch is merged **and**
the post-merge suite is green — never with uncommitted changes in them.

## 7. Risks specific to this wave

| Risk | Mitigation |
|---|---|
| **T36 shifts the fuzz seed→case mapping**, silently re-pointing the `fuzz-1001074` and `fuzz-1000384` regressions at different cases | T36's brief requires it to answer the seed-vs-case pinning question explicitly and prove both regressions still reproduce. A regression test that quietly starts testing something else is worse than no test |
| **T40 writes a tautological guard** that passes only because it was fitted to today's documents | Its brief requires two manufactured failures — flip a status to ✅, delete a cited test — with pasted output. This repository has already had a tautological guard survive being flagged *and* reported fixed |
| **T38 relaxes `bankConfigSchema`** so a UX ledger row can be ticked | Explicitly forbidden in its brief. Re-marking the row is the expected outcome; a schema change carries a high bar and tests in both directions |
| **T39 ticks a row it argued rather than exercised** | Its brief requires per-row method and evidence, and permits an honest ⚠️. The precedent is § D111, where two rows were *false*, not merely unverified |
| Eight concurrent lanes converge on the four mutually-guarded documents | All doc ownership held by the orchestrator bar two narrow, stated exceptions |
| The wave closes items and leaves the register looking finished | § 5 requires the debt table to be rewritten to what is actually left, including anything this wave opened |
