# Agent status board

Live state of every task. Updated by the orchestrator as reports come in.

**Wave 1 · opened 2026-07-27 · integration branch `integration` (base `6b20687`)**

| Task | Agent | Branch | Worktree | Status | Blockers | Next action |
|---|---|---|---|---|---|---|
| T1 | tuning-seam builder | `feat/tuning-seam` | `.worktrees/T1-tuning-seam` | 🟡 in flight | — | await report |
| T2 | statistics builder | `fix/statistics-integrity` | `.worktrees/T2-statistics` | 🟡 in flight | — | await report + blast-radius list |
| T3 | inert-tunables builder | `fix/inert-tunables` | `.worktrees/T3-inert-tunables` | 🟡 in flight | — | await report + behaviour-change list |
| T4 | docs builder | `docs/register-drift` | `.worktrees/T4-docs` | ⬜ held | wave-1 merges | dispatch after T1–T3 merge |
| T5 | viz foundation builder | `feat/viz-foundation` | `.worktrees/T5-viz` | ✅ **merged** `a3cb937` | — | independent review in flight |

## Review / test assignments

| Task | Reviewer | Tester | Gate verdict |
|---|---|---|---|
| T1 | pending | pending | — |
| T2 | required (high risk — changes every published interval) | required | — |
| T3 | required (high risk — writes `sim/simulation.ts`) | required | — |
| T4 | orchestrator re-verification | — | — |
| T5 | 🟡 in flight — adversarial, instructed to run not read | orchestrator (post-merge suite) | pending |

## Carried forward — must be actioned before wave 1 closes

| # | Item | Raised by | Owner |
|---|---|---|---|
| C1 | `npm install` to refresh `package-lock.json` for `packages/viz`'s `vite` devDependency. **Deferred deliberately** — the root `node_modules` is symlinked into every live worktree, so reinstalling mid-flight would disrupt running agents. Run once wave 1's builders are all done. `npm ci` would fail until then. | T5 | orchestrator |
| C2 | `core`'s barrel re-exports `loadConfig`, which imports `node:fs/promises`, so any browser import of `@elevator-sim/core` throws at module evaluation. `config/loader.ts`'s own header documents the opposite intent ("a browser build can import `parseBuilding`/`resolveBuilding` from `./parse.js` … Phase 4's web viewer consuming core"). Needs an fs-free subpath export. Worked around in the dev server only. | T5 | new task, wave 2 |
| C3 | `patternSwitching` roadmap bullet may need marking not-done — pending T3's decision. | plan | T4 |

## Baseline

| Check | Result | When |
|---|---|---|
| `npx tsc -b` | clean (exit 0) | 2026-07-27 |
| `npx vitest run` | **115 files / 2442 tests passed**, 181 s | 2026-07-27 |

Any task reporting fewer than 2,442 passing tests without naming the assertions it deliberately
changed has regressed the suite.

## Log

- **2026-07-27** — Repo surveyed. Build clean. Coordination artifacts created. Wave 1 defined:
  five tasks, disjoint ownership, `sim/simulation.ts` assigned to T3.
- **2026-07-27** — Baseline captured: `tsc -b` clean, 2,442 tests green.
- **2026-07-27** — Worktrees created with `node_modules` symlinks (D4). T1, T2, T3, T5 dispatched
  concurrently. T4 held until T1–T3 merge so it documents post-merge truth rather than pre-merge.
