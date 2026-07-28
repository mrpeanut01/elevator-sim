# Multi-agent execution plan

> ## 🏁 FINAL STATE — the delivery closed 2026-07-28. This document is no longer updated.
>
> **What it was for.** The authoritative coordination artifact: task scope, ownership boundaries,
> dependency order, merge order and the definition of done, across four waves and twenty-five tasks.
> It is kept because it is the record of *how* the work was done — including the mistakes, which are
> named below rather than tidied away — and because `packages/viz/UX.md` cites its planning-first
> rule.
>
> **What it achieved against § 1's goal.** All 21 review findings closed. Phases 0–5 and 7 accepted;
> Phase 4 complete against a **raised** criterion; Phases 6 and 8 partial, each for a stated reason.
> Suite 2 442 → **3 138** tests, green after every merge, `tsc -b` clean throughout.
>
> **§ 7's definition of done is not fully reached, and the gap is one item**, unchanged from what
> § 1 predicted: Phase 8's full experiment matrix at 50–200 replications, which also discharges
> Phase 7's acceptance interval. `fuzz-1000384`, the other half of that sentence, **is closed**.
>
> > **✅ CLOSED AFTER THIS BOARD WAS RETIRED.** The matrix landed in `f895a16` — 8 cells × 12
> > profiles with per-cell derived budgets, a Pareto front over (AWT, energy, WT95) made possible by
> > a new energy proxy, and Phase 7's interval at n = 150 on disjoint held-out seeds. **Phase 8 is
> > accepted** ([`DECISIONS.md` § D108](DECISIONS.md)) and § 7's definition of done is reached. The
> > suite figure below (3 138) is likewise superseded: **172 files / 3 172 tests**. The rows in
> > § 1 and § 4 that still say "not started" are left as the close-of-delivery record, per the
> > retire-in-place decision (§ D105); read [`docs/07-handoff.md`](docs/07-handoff.md) for current
> > state.
>
> **Three process mistakes this plan made, recorded because they cost real work:**
> 1. **The orchestrator weakened an acceptance criterion.** § D27 raised Phase 6's metric clause and
>    silently dropped its *building* clause. Caught by a builder (T23-F1), owned in § D99, closed by
>    measurement in § D100. It happened inside a decision whose stated purpose was to strengthen a
>    gate, which is the only reason it was invisible for a wave.
> 2. **Worktrees were mis-set-up, so builders linked against stale code.** Wave 1 symlinked the root
>    `node_modules`; Node resolves a symlink to its realpath, so `@elevator-sim/*` pointed at the
>    **main checkout's** `dist`. vitest was unaffected (`resolve.alias` maps to worktree-local
>    source) but every built-artifact claim was about the wrong tree, and one task's CLI evidence had
>    to be re-run. Fixed by `.worktree-setup.sh` from wave 2 on. See C8.
> 3. **A document was merged without being linked**, leaving `README.md`'s table and `docs/09`
>    inconsistent. **A guard caught it** — `validation/documentation.test.ts` now fails on any
>    `docs/*.md` on disk and absent from README's table. See R20.
>
> **Where the live information is now.** [`docs/05-roadmap.md`](docs/05-roadmap.md) for phase
> verdicts and evidence; [`docs/07-handoff.md`](docs/07-handoff.md) for current state, the permanent
> guards, and the open debt; [`DECISIONS.md`](DECISIONS.md) for every decision and its rationale.

Coordination artifact for the orchestrated completion of this project. Authoritative for task
scope, ownership, dependency order and merge order. Updated as waves land.

**Started:** 2026-07-27 · **Closed:** 2026-07-28 · **Baseline commit:** `6b20687` ·
**Integration branch:** `integration`

---

## 1. Goal

Bring the elevator simulator to a state where it can be handed off: every phase in
[`docs/05-roadmap.md`](docs/05-roadmap.md) either accepted against its stated criteria or
explicitly recorded as out of scope, and the 21-finding register in
[`docs/08-review-findings.md`](docs/08-review-findings.md) closed or classified.

Concretely, four bodies of work remain:

| Body | State |
|---|---|
| Review register — 21 findings (1 critical, 13 major, 7 minor) | ✅ **all 21 closed** (wave 1) |
| Phase 7 — Automated tuning | ✅ **ACCEPTED** 2026-07-27 (wave 1); re-confirmed 2026-07-28 |
| Phase 4 — Visualization | ✅ **COMPLETE** — viewer, editor, live metrics overlay, playback from a stored seed, 87-scenario UX ledger |
| Phase 6a / 6b — destination disclosure and dispatch | ✅ **ACCEPTED** against the criterion D27 raised |
| Phase 6c — learned control | ⬜ **deferred out of the phase** with reasons (D28) — not dropped, and it needs its own acceptance question first |
| Phase 6 — the criterion measured on the building it names | ✅ **closed by measurement** (D99 → D100): met by the Level-0 arm, **not** met by the Level-1 panel at any measured point |
| Phase 8 — Testing campaign | ⚠️ *at close:* seven of eight tracks landed and found four defects, **all four fixed**. `fuzz-1000384` is **closed**; the full experiment matrix at a real budget is not started, so the criterion is not yet met. **Superseded — the matrix landed in `f895a16` and Phase 8 is accepted (§ D108)** |

**The one thing between here and § 7's definition of done, at close:** run the full experiment matrix
at 50–200 replications — which also discharges Phase 7's acceptance interval, a measurement the
roadmap assigns to Phase 8 and that accepting Phase 7 did not discharge. `fuzz-1000384`, the other
half of this sentence as originally written, is closed (§ T22-D1) — and closed by fixing the
simulator, not by moving `deadlockIdleBoundS`, which is what R22 existed to prevent.

## 2. Architecture snapshot

TypeScript monorepo, npm workspaces, strict mode, Node ≥ 26, vitest.

```
packages/core          model, physics, dispatch, sim kernel, metrics, analytical oracle, config
  src/sim/simulation.ts        ← THE INTEGRATION SEAM. Every dispatch behaviour is called from here.
  src/sim/seam.test.ts         ← behavioural liveness guard (permanent, may not be deleted)
  src/dispatch/deadCode.test.ts← mechanical dead-export audit (permanent, may not be deleted)
packages/experiments   replication runner, CRN, statistics, benchmark, tuning (Phase 7)
packages/cli           list | run | compare | tune | watch
packages/viz           Phase 4 — contract, frame producer, replay harness, Canvas renderer
```

`core` must never depend on `experiments`, `cli` or `viz` (invariant 6). `vitest.config.ts`
aliases cross-package specifiers to package *source*, so **vitest** works in a worktree with a
plain `node_modules` symlink — but a **built** artifact does not: node resolves the symlink to its
realpath and `@elevator-sim/*` then points at the main checkout. Use `.worktree-setup.sh`, which
builds a real `node_modules` whose workspace entries point into the worktree.

## 3. Standing rules this plan is built around

Taken from [`docs/05-roadmap.md` § Standing requirement](docs/05-roadmap.md) and
[`docs/07-handoff.md` § 3](docs/07-handoff.md). They are not advisory — the project has shipped
**six** instances of the same defect class.

1. **Every task names the file its behaviour must be *called from*, not only the directory it is
   implemented in.** A task breakdown that adds a dispatch behaviour without naming
   `sim/simulation.ts` is a wrong breakdown.
2. **Liveness is measured, not read.** "It looks wired" is not evidence. A task is not done until
   a run is instrumented and invocations counted, or two configurations differing only in the new
   knob produce different car trajectories.
3. **A barrel re-export is not a caller. A `{@link}` is not a caller.** Name the non-test caller.
4. **Reviewers run things.** Agents in this repository have reported green suites that were red.
   A review that only reads is rejected.
5. **Gates are told "determine whether this is true, do not make it true."**
6. **No acceptance criterion may be weakened to pass.** Raise it instead.
7. **A bit-identical result is a wiring bug until proven otherwise.**

## 4. Task tree

### Wave 1 — Correctness foundation (CLOSED 2026-07-27)

Everything downstream reports numbers. The register must be worked *before* any tuning campaign
or Phase 8 measurement, or the campaign spends its budget on inert dimensions and publishes
intervals from the wrong quantile family.

| ID | Task | Branch | Findings | Depends on |
|---|---|---|---|---|
| **T1** | Phase 7 acceptance seam — `tuning/` barrel, experiments re-export, CLI `tune` command, experiments-side dead-code audit | `feat/tuning-seam` | #1 (CRITICAL) | — |
| **T2** | Statistical integrity — paired-t quantile family, IDENTICAL verdict, reproduce-line fidelity | `fix/statistics-integrity` | #8, #14, #19 | — |
| **T3** | Inert configuration surface — predictor horizon, late-arrival reopen, overload threshold, double-deck, pattern switching + a generic search-space liveness sweep | `fix/inert-tunables` | #5, #9, #10, #11, #12, #13, #21 | — |
| **T4** | Documentation & claim drift | `docs/register-drift` | #2, #3, #4, #6, #7, #15, #16, #17, #18, #20 | T1–T3 (re-verify after) |
| **T5** | Phase 4 foundation — `packages/viz` contract, skeleton, replay harness | `feat/viz-foundation` | — | — |

**Why these five are safe in parallel:** their owned-file sets are disjoint (§ 5). T4 reads what
T1–T3 land, so it merges last in the wave and re-verifies every number it publishes.

### Wave 2 — in flight (opened 2026-07-27)

Wave 1 closed with all 21 register findings resolved, Phase 7 accepted, and 2,641 tests green.
Wave 2 completes Phase 4, opens Phase 8's two highest-value tracks, and does the planning-first
work for Phase 6.

| ID | Task | Branch | Owns |
|---|---|---|---|
| T10 | `core` browser-safe entry point (C2); delete the viz dev shims | `fix/core-browser-entry` | `packages/core/**`, `packages/viz/vite.config.ts`, `packages/viz/dev-shims/**` |
| T11 | **Phase 4 completion** — building editor, live metrics overlay, full UX cycle | `feat/viz-phase4` | `packages/viz/src/**`, `UX.md`, `index.html`, viz `package.json` |
| T12 | **Phase 8 — property-based fuzzing** (the highest-value track) | `feat/phase8-fuzzing` | `packages/experiments/src/fuzz/**`, `packages/experiments/src/index.ts` |
| T13 | **Phase 8 — analytical cross-validation + physics verification** | `feat/phase8-oracle` | `packages/experiments/src/{oracle,validation}/**` except `validation/documentation.test.ts` |
| T14 | **Phase 6 contract** — design only, no implementation | `design/destination-dispatch` | `docs/09-destination-dispatch-contract.md` (new, sole file) |

**Why T14 is a document and not code.** Risk R9: destination dispatch changes the passenger model
fundamentally. Phase 5 shipped four dead seams simultaneously because work was partitioned before
the interfaces were locked. The contract is locked first, then implementation fans out against it.

**Two lessons from wave 1 written into every wave-2 brief.** (a) Mutation-test your own work — 7 of
8 `frameCar` fields could be replaced with constants while the suite stayed green. (b) Ask what a
defect could look like that still passes your test — Phase 4's replay criterion was satisfied in
full by a picture with a 77-metre error.

### Wave 3 — Phase 6 implementation (planned)

Fans out against T14's locked contract. Scope, parallelisation and ownership come from T14's work
breakdown, not from this table.

### Wave 3 — Phase 6 (landed)

| ID | Task | Outcome |
|---|---|---|
| T15 | Phase 6a — destination disclosure, the studies, the access-control hypothesis | ✅ 6a accepted; **H-ACCESS-2 refuted**, H-ACCESS-1 confirmed categorically |
| T16 | Phase 6b — the `core` seam: write-once promises, broken-promise counter, comparability | ✅ |
| T18 | Phase 6b — the user-facing surface: viz schema 4, the panel profile, the C→D contrast | ✅ 6b accepted; found that `compare` was ranking two passenger models on AWT |

### Wave 4 — Phase 8 campaign + closing pass

| ID | Task | Outcome |
|---|---|---|
| T19 | `CarConfig.mode` and `BuildingConfig.serviceEvents` — making the out-of-service corner authorable | ✅ exposed a crash: an out-of-service car at an occupied landing killed the run |
| T20 | Service-mode coverage, adversarial corners, scale & performance | ✅ found that P5 termination was blind to a fleet that never moves; found `fuzz-1001074` |
| T21 | The fourth `awtIsValid` ground | ✅ no pinned estimate moved; uncovered `fuzz-1000384` while verifying |
| T22 | `fuzz-1000384` — the open P5 deadlock | 🟡 in flight |
| **T23** | **Closing documentation pass** — phase statuses with evidence, the refuted hypothesis, the measured corrections | ✅ this pass |
| — | Full experiment matrix + Pareto front at a real replication budget, carrying Phase 7's acceptance number at 50–200 replications | ⬜ **not started** at close — **landed afterwards in `f895a16`**; Phase 8 accepted (§ D108) |

## 5. Ownership map — wave 1

No two concurrent tasks may write the same file. The orchestrator owns anything not listed.

| Task | Owns (write) | Reads only |
|---|---|---|
| T1 | `packages/experiments/src/tuning/index.ts` (new), `packages/experiments/src/index.ts`, `packages/experiments/src/index.test.ts`, `packages/experiments/src/tuning/deadCode.test.ts` (new), `packages/cli/src/commands/tune.ts` (new), `packages/cli/src/commands/tune.test.ts` (new), `packages/cli/src/index.ts`, `packages/cli/src/help.ts` | all of `tuning/` |
| T2 | `packages/experiments/src/reports/statistics.ts`, `…/statistics.test.ts`, `packages/experiments/src/reports/format.ts`, `packages/cli/src/commands/compare.ts`, `packages/cli/src/cli.test.ts` | `benchmark/verdict.ts` |
| T3 | `packages/core/src/dispatch/predictor/**`, `packages/core/src/physics/doors/**`, `packages/core/src/model/car/loadSensor.ts`, `packages/core/src/model/bank.ts`, `packages/core/src/sim/simulation.ts`, `packages/core/src/sim/seam.test.ts`, `packages/core/src/config/parse.ts`, `packages/core/src/config/schema.ts`, `data/dispatcher-profiles.json` | everything |
| T4 | `README.md`, `CLAUDE.md`, `docs/*.md`, `packages/core/src/dispatch/policies/zoning.ts` (comments only) | everything |
| T5 | `packages/viz/**` (new), `tsconfig.json`, root `package.json` (workspaces), `vitest.config.ts` | `packages/core/src/**` |

**Seam ownership.** `packages/core/src/sim/simulation.ts` is owned by **T3** for this wave. No
other wave-1 task may write it. T5 may not write it at all — invariant 6 runs the other way.

## 6. Merge order

`T5 → T1 → T3 → T2 → T4`, each into `integration`, with the full suite run after each merge.

Rationale: T5 is additive and cannot break anything (new package). T1 is additive plus two barrels.
T3 changes simulator behaviour, so it lands before T2, which changes how differences are reported —
otherwise T2's regenerated intervals would need regenerating again. T4 publishes numbers and merges
last so it can quote the post-merge truth.

## 7. Definition of done

Per task:
- Stated acceptance criteria pass — **run, not read**.
- Unit tests added or updated for every behavioural change; regression test for every fixed finding.
- For any new configurable behaviour: a named non-test caller **and** a measured liveness assertion.
- Independent review (separate agent) for T2, T3 and anything touching `sim/simulation.ts`.
- `npx tsc -b` clean and the full suite green in the task's own worktree before merge readiness.

For the system:
- Every roadmap phase accepted against its criteria or explicitly recorded as deferred with reasons.
- Every register finding closed, or classified as won't-fix with the reason recorded in
  `DECISIONS.md`.
- Phase 8's blocking rule honoured: any Phase 8 failure blocks release.
- `docs/05-roadmap.md`, `docs/07-handoff.md`, `CLAUDE.md` and `README.md` agree with each other and
  with the code.

## 8. Rollback plan

Each task is one branch merged with `--no-ff`, so a failed integration is `git revert -m 1 <merge>`
on `integration` and the task branch stays alive for a follow-up. `main` is not touched until
`integration` is green end to end. Worktrees are removed only after their branch is merged and the
post-merge suite is green.
