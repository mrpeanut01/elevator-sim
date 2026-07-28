# Agent status board

Live state of every task. Updated by the orchestrator as reports come in.

**Wave 1 · opened 2026-07-27 · integration branch `integration` (base `6b20687`)**

| Task | Agent | Branch | Worktree | Status | Blockers | Next action |
|---|---|---|---|---|---|---|
| T1 | tuning-seam builder | `feat/tuning-seam` | `.worktrees/T1-tuning-seam` | ✅ **merged** `2f835d0` | — | review pending |
| T2 | statistics builder | `fix/statistics-integrity` | `.worktrees/T2-statistics` | ✅ **merged** `0342982` | — | independent review in flight |
| T3 | inert-tunables builder | `fix/inert-tunables` | `.worktrees/T3-inert-tunables` | 🟡 in flight | — | await report + behaviour-change list |
| T4 | docs builder | `docs/register-drift` | `.worktrees/T4-docs` | ⬜ held | wave-1 merges | dispatch after T1–T3 merge |
| T6 | blast-radius + statistics follow-ups | `fix/blast-radius` | `.worktrees/T6-blast-radius` | 🟡 in flight | — | **blocks T4** |
| T5 | viz foundation builder | `feat/viz-foundation` | `.worktrees/T5-viz` | ✅ **merged** `a3cb937` | — | independent review in flight |

## Review / test assignments

| Task | Reviewer | Tester | Gate verdict |
|---|---|---|---|
| T1 | pending | orchestrator verified `tune` end to end + known-answer test | ✅ passed |
| T2 | ✅ done — **ACCEPT WITH FOLLOW-UPS** | orchestrator re-verified in main checkout | ✅ passed, 6 follow-ups → T6 |
| T3 | required (high risk — writes `sim/simulation.ts`) | required | — |
| T4 | orchestrator re-verification | — | — |
| T5 | 🟡 in flight — adversarial, instructed to run not read | orchestrator (post-merge suite) | pending |

## Carried forward — must be actioned before wave 1 closes

| # | Item | Raised by | Owner |
|---|---|---|---|
| C1 | `npm install` to refresh `package-lock.json` for `packages/viz`'s `vite` devDependency. **Deferred deliberately** — the root `node_modules` is symlinked into every live worktree, so reinstalling mid-flight would disrupt running agents. Run once wave 1's builders are all done. `npm ci` would fail until then. | T5 | orchestrator |
| C2 | `core`'s barrel re-exports `loadConfig`, which imports `node:fs/promises`, so any browser import of `@elevator-sim/core` throws at module evaluation. `config/loader.ts`'s own header documents the opposite intent ("a browser build can import `parseBuilding`/`resolveBuilding` from `./parse.js` … Phase 4's web viewer consuming core"). Needs an fs-free subpath export. Worked around in the dev server only. | T5 | new task, wave 2 |
| C4 | `packages/experiments/src/validation/harness.ts:176` builds `productionStoppingRule` by injecting `estimateMean`, which is now Student-t at every n. Sequentially-stopped experiments may therefore run marginally more replications. T2 argues this is the conservative direction (`stopping.ts`: stopping too early "publishes a number it did not earn") and left it deliberately, since re-wiring it to a crossover estimator in a separate change would create a symbol with no non-test caller. **Needs a decision, not a default.** | T2 | wave 2 |
| C5 | `packages/experiments/src/reports/compare.ts:607` can still print `'z'` as a fallback family label on a published convergence report, in the branch where `achievedHalfWidth` is already `NaN`. Cosmetic but it is the exact mislabelling finding #14 was about. | T2 | wave 2 |
| C6 | **One published verdict flips** as a direct result of T2: Phase 5 capacity reassignment, `−0.520 s [−1.029, −0.010]` BETTER at n=60 → `[−1.039, +0.000]` **INDISTINGUISHABLE**. Quoted in four places (`docs/05-roadmap.md:360`, `benchmark/index.ts:497`, `benchmark/capacityReassignment.ts:39` and `:54` — the last is prose and needs rewording, not renumbering). No test asserts the old bound. | T2 | T4 |
| C7 | **NEW DEFECT — the permanent mechanical guard is partly unearned.** `packages/core/src/dispatch/deadCode.test.ts` has two scanner holes T1 found and fixed in its own copy: (a) the export pattern does not match `export async function`, so those exports were never scanned at all; (b) it strips comments but not string literals, so a symbol that names itself in its own error message counts as self-used and becomes unfalsifiably live. T1 demonstrated (a)+(b) by removing a real importer and watching the unfixed audit stay **green**. The same holes exist in core's copy today. | T1 | new task, wave 2 |
| C8 | **ENVIRONMENT DEFECT in D4.** `node_modules/@elevator-sim/*` symlinks resolve to `../../packages/*` — the **main checkout's** packages — so a worktree running a *built* artifact links against the main checkout's `dist`, not its own. vitest is unaffected (`resolve.alias` maps to worktree-local source) and `packages/core` is unaffected (no workspace deps), but any worktree-built CLI or `experiments` consumer was stale. T1 hit it and worked around it with worktree-local symlinks. **Consequence: T2's built-CLI evidence was produced against stale `experiments`; the orchestrator re-verified all of it in the main checkout — see below.** | T1 | orchestrator (done) |
| C9 | `docs/05-roadmap.md` § Phase 7 and `docs/07-handoff.md` still record Phase 7 as NOT ACCEPTED and the CLI as four commands. Both are now false. | T1 | T4 |
| C3 | `patternSwitching` roadmap bullet may need marking not-done — pending T3's decision. | plan | T4 |

## Baseline

| Check | Result | When |
|---|---|---|
| `npx tsc -b` | clean (exit 0) | 2026-07-27 |
| `npx vitest run` | **115 files / 2442 tests passed**, 181 s | 2026-07-27 |

Any task reporting fewer than 2,442 passing tests without naming the assertions it deliberately
changed has regressed the suite.

## Integration verification — run by the orchestrator, not taken on report

| After merging | `tsc -b` | Full suite | Expected | Verdict |
|---|---|---|---|---|
| baseline | clean | 115 files / 2442 tests | — | ✅ |
| T5 `a3cb937` | clean | 124 files / **2531** tests | 2442 + 89 | ✅ matches |
| T2 `0342982` | clean | 124 files / **2543** tests | 2531 + 12 | ✅ matches |
| T1 `2f835d0` | clean | 126 files / **2578** tests | 2543 + 35 | ✅ matches |

### Orchestrator re-verification of T2, run in the main checkout (C8 remediation)

Because T2's built-CLI evidence came from a worktree with stale package resolution, every
CLI-level claim was re-run here, where resolution is correct:

| Claim | Result |
|---|---|
| `compare --a eta --b eta` reports IDENTICAL | ✅ verified — 20 of 20 exactly zero, and **0** occurrences of "Raise --reps" / "below this experiment's resolution" |
| published interval is Student-t at every n | ✅ verified — n=25/26/30/100/500 all `method=t`, recovered quantiles 2.063899 / 2.059539 / 2.045230 / 1.984217 / 1.964729, converging to z from above |
| stopping-rule crossover unchanged | ✅ verified — `halfWidthQuantile(25)` = t 2.063899, `(26)` = z 1.959964 |
| `reproduce:` line reproduces the verdict (#19) | ✅ verified — both runs give `−0.22 s [−0.41, −0.04] BETTER` and the line now carries `--confidence 0.8` |

### Orchestrator verification of T1, run in the main checkout

| Claim | Result |
|---|---|
| `elevator-sim tune` runs against real `data/` | ✅ verified end to end |
| help lists five commands | ✅ verified — `list run compare tune watch` |
| tuning and holdout seed sets are disjoint | ✅ verified — printed `DISJOINT`, trace seed 9876618837807159332 vs holdout 11367898276632666949 |
| **known-answer test: an optimizer rediscovers the deadband blind** | ✅ **verified** — searching from the shipped `idle.repositionThresholdS: 8`, random search returned **2.582 s** against Phase 5's independently measured interior optimum of 2 s. `docs/07-handoff.md` § 5 left the wrong value shipped precisely so this could be tested |

## Log

- **2026-07-27** — Repo surveyed. Build clean. Coordination artifacts created. Wave 1 defined:
  five tasks, disjoint ownership, `sim/simulation.ts` assigned to T3.
- **2026-07-27** — Baseline captured: `tsc -b` clean, 2,442 tests green.
- **2026-07-27** — Worktrees created with `node_modules` symlinks (D4). T1, T2, T3, T5 dispatched
  concurrently. T4 held until T1–T3 merge so it documents post-merge truth rather than pre-merge.
