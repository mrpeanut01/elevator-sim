# Multi-agent execution plan

Coordination artifact for the orchestrated completion of this project. Authoritative for task
scope, ownership, dependency order and merge order. Updated as waves land.

**Started:** 2026-07-27 · **Baseline commit:** `6b20687` · **Integration branch:** `integration`

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
| Phase 7 — Automated tuning | ✅ **ACCEPTED** 2026-07-27 (wave 1) |
| Phase 4 — Visualization | 🟡 foundation landed; editor + metrics overlay in flight (T11) |
| Phase 8 — Testing campaign | 🟡 fuzzing (T12) and oracle (T13) in flight |
| Phase 6 — Destination dispatch & learned control | ⬜ contract in flight (T14), implementation wave 3 |

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

### Wave 4 — Phase 8 campaign + acceptance (planned)

Task ids continue from T15; the wave-2 ids T10–T14 are taken.

| ID | Task |
|---|---|
| T15 | Determinism regression, scale & performance, adversarial edge cases |
| T16 | Full experiment matrix + Pareto front, at a real replication budget |
| T17 | Phase 7's acceptance number at 50–200 replications — the roadmap explicitly assigns this to Phase 8, and accepting the phase did not discharge it |

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
