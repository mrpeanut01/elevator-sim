# Agent status board

> ## ↩️ REOPENED 2026-07-28 for **wave 5**, which has now **CLOSED**. The board is
> [§ Wave 5](#wave-5--live) at the foot of this file; everything between here and it is the
> **unaltered** waves 1–4 record.
>
> **All six C-items listed as still open below are CLOSED** — `C4`, `C5`, `C24`, `C27`, `C30`,
> `C32` ([§ D116](DECISIONS.md)–[§ D122](DECISIONS.md)). **`C33` and `C34` are open in their place.**
>
> Wave 5 worked the six still-open C-items below plus the three non-`C` items in
> [§ D115](DECISIONS.md) § *What remains open*. Its board is [`WAVE5_PLAN.md`](WAVE5_PLAN.md).
> **This board was reopened because a live delivery needs a live status board** —
> [`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md), [`RISKS.md`](RISKS.md) and
> [`TEST_MATRIX.md`](TEST_MATRIX.md) stay retired in place per [§ D105](DECISIONS.md).

> ## 🏁 FINAL STATE of waves 1–4 — that delivery closed 2026-07-28. This section is no longer updated.
>
> **What it was for.** The live state of every task across four waves — branch, worktree, status,
> blockers, review verdict — plus the **carried-forward register (C1 – C32)**, which is the part
> that outlived the delivery. `docs/01`, `docs/05`, `docs/08`, `core/src/analytical/upPeak.ts` and
> `core/src/sim/moduleTree.test.ts` all cite C-numbers from it, which is why it is retired in place
> rather than deleted.
>
> ### Carried-forward register at close
>
> | | Items |
> |---|---|
> | ✅ **Closed** | C1, C2, C3, C6, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19, C20, C21, C22, C23, C25, C26, C28, C29, C31, **C7** |
> | ⬜ **Still open** | **C5** (a `'z'` fallback label can still print on a convergence report) · **C24** (`fuzz/`'s only non-test caller is a test) · **C27** (Phase 6a/6b/mixed-use studies are off the package barrel) · **C30** (`ED-12`/`ED-13` contradict the schema) · **C32** (the fuzz generator picks call types blind to the profile) |
>
> > **✅ C7 CLOSED after this board was retired.** Both holes in `core`'s dead-code scanner are
> > fixed, both **watched failing** before being closed, and closing them surfaced **no new dead
> > exports** — the allowlist is unchanged in both directions. What changed is that three existing
> > assertions became *falsifiable*: the string-literal hole had made *"createArrivalModel must read
> > live"* unfalsifiable, which reads as coverage and is worse than a missing assertion.
> > [`DECISIONS.md` § D114](DECISIONS.md). **Six items remain open**, not seven.
>
> All open items are carried into [`docs/07-handoff.md`](docs/07-handoff.md) § 8, which is the
> document a cold reader is pointed at. Nothing here is the only record of an open item.
>
> ### The closing wave (T29 / T30 / T31 / T32), after this board was retired
>
> Four correctness defects in shipped code and one documentation pass. **No phase status moved.**
> `destination-eta` shipped a destination that changed no decision — the standing requirement's
> defect in `data/` rather than in code — and now weights `rideTime` at 0.5
> ([§ D112](DECISIONS.md)); the viewer *and* `elevator-sim watch` printed a mean the same run said
> was suppressed ([§ D111](DECISIONS.md)); the `'no-intervals'` half of `benchmark/` had no driver
> and all five of its studies were dead ([§ D114](DECISIONS.md)); C7 closed. The editor's floor
> lists now order by `index`, and its ⇧/⇩ buttons are relabelled honestly with the **scope call
> handed back** (§ D111). Full accounting in [§ D115](DECISIONS.md).
>
> ### The four recommendations T23 handed back are all built
>
> **T23-R1** the refuted-mechanism guard, **T23-R2** the fourth phase-status vocabulary term
> (`partial`, now used by all four guard-coupled documents), **T23-R3** scoping
> `moduleTree.test.ts` to packages that exist, **T23-R4** the two `core` docstrings — **re-measured
> rather than transcribed, and one of the handed-back figures did not reproduce** (see below) — and
> **T23-R5** the `viz/editor/` move with the `docs/01` line in the same commit.
>
> ### T23-F1 / D99 is closed by measurement
>
> Phase 6's criterion named the Mixed-Use High-Rise; § D27 dropped the building clause; § D99 owned
> that as a weakening and § D100 measured it there. **Met by the Level-0 arm** (ΔTTD −21.239 /
> −2.072 / −2.116 against the three baselines, all BETTER, at up-peak 4 %, n = 200); **not met by
> the Level-1 panel at any measured point.**
>
> ### The two figures this board recorded as *unverified* — now measured, and one was wrong
>
> - **C20** — `deriveUpPeakTerms` is **82.5 % / 21.2 %** at the declared `tp = 1.75 s`. The
>   published 102.8 % / 26.3 % reproduces **only at `tp = 1.2 s`**, which no car of that bank
>   declares.
> - **C21** — `vertical-city/zone-5-local`'s departure band is **1.23 s**, and **2.95×** tighter
>   than the next narrowest. **The "5×" this board handed back did not reproduce** over the
>   fourteen-bank sweep. The 1.23 s figure is confirmed.
>
> ### And the four ⚠️ UX rows are still unverified, not passing
>
> `RV-11`, `RV-17`, `RV-21`, `KB-14` — built and reachable, neither driven nor tested. Carried
> forward exactly as this board recorded them, because a count that ticks them is a count that lies.

Live state of every task. Updated by the orchestrator as reports come in.

**Wave 1 · opened 2026-07-27 · integration branch `integration` (base `6b20687`)**

| Task | Agent | Branch | Worktree | Status | Blockers | Next action |
|---|---|---|---|---|---|---|
| T1 | tuning-seam builder | `feat/tuning-seam` | `.worktrees/T1-tuning-seam` | ✅ **merged** `2f835d0` | — | review pending |
| T2 | statistics builder | `fix/statistics-integrity` | `.worktrees/T2-statistics` | ✅ **merged** `0342982` | — | independent review in flight |
| T3 | inert-tunables builder | `fix/inert-tunables` | `.worktrees/T3-inert-tunables` | ✅ **merged** `9fb32e8` | — | independent review in flight |
| T4 | docs builder | `docs/register-drift` | `.worktrees/T4-docs` | ⬜ held | wave-1 merges | dispatch after T1–T3 merge |
| T6 | blast-radius + statistics follow-ups | `fix/blast-radius` | `.worktrees/T6-blast-radius` | ✅ **merged** `ff2c1bf` | — | **T4 unblocked on numbers** |
| T7 | courtesy-hold + gate remediation | `fix/courtesy-hold` | `.worktrees/T7-courtesy-hold` | 🟡 in flight | — | **blocks T4** (3 doc figures) |
| T8 | viz frame defects (from T5 review REJECT) | `fix/viz-frame-defects` | *(removed)* | ✅ **merged**; 8/8 mutants killed | — | done |
| T9 | unreproducible benchmark numbers (C13, C14) + a drift guard | `fix/unreproducible-benchmarks` | *(removed)* | ✅ **merged**; root causes established, guard red on all 3 | — | done |
| T5 | viz foundation builder | `feat/viz-foundation` | `.worktrees/T5-viz` | ✅ **merged** `a3cb937` | — | independent review in flight |

## Review / test assignments

| Task | Reviewer | Tester | Gate verdict |
|---|---|---|---|
| T1 | pending | orchestrator verified `tune` end to end + known-answer test | ✅ passed |
| T2 | ✅ done — **ACCEPT WITH FOLLOW-UPS** | orchestrator re-verified in main checkout | ✅ passed, 6 follow-ups → T6 |
| T3 | ✅ done — **ACCEPT WITH FOLLOW-UPS** | orchestrator (post-merge suite) | ✅ passed; 8 follow-ups → T7 |
| T4 | orchestrator re-verification | — | — |
| T5 | ✅ done — **REJECT** | orchestrator (post-merge suite) | ❌ failed; remediating forward → T8 |

## Carried forward — must be actioned before wave 1 closes

| # | Item | Raised by | Owner |
|---|---|---|---|
| C1 | `npm install` to refresh `package-lock.json` for `packages/viz`'s `vite` devDependency. **Deferred deliberately** — the root `node_modules` is symlinked into every live worktree, so reinstalling mid-flight would disrupt running agents. Run once wave 1's builders are all done. `npm ci` would fail until then. | T5 | orchestrator |
| C2 | `core`'s barrel re-exports `loadConfig`, which imports `node:fs/promises`, so any browser import of `@elevator-sim/core` throws at module evaluation. `config/loader.ts`'s own header documents the opposite intent ("a browser build can import `parseBuilding`/`resolveBuilding` from `./parse.js` … Phase 4's web viewer consuming core"). Needs an fs-free subpath export. Worked around in the dev server only. | T5 | new task, wave 2 |
| C4 | ✅ **CLOSED 2026-07-28 — moot as filed, and answered on the question it should have asked.** *(As filed:)* `harness.ts:176` builds `productionStoppingRule` out of `estimateMean`, Student-t at every n, so sequentially-stopped experiments may run marginally more replications. **Needs a decision, not a default.** *(Disposition:)* **there are no sequentially-stopped experiments** — nothing outside a test injects a stopping rule, and `benchmark/` never mentions the field, so no published interval was produced by one and the budget question has no subject. The real question — does the rule satisfy the roadmap's standing requirement — is answered three ways: the **port is exempt** (a rule stops *cells*, so a paired comparison's arms would stop at different `n` and the shorter arm's own variance would decide how many pairs survive — inadmissible, not merely unwired); `fixedBudgetStoppingRule` is **dead** with a docstring that claimed the runner called it (it does not; `decide()` inlines that branch); and `runner.acceptableRange` is an **inert tunable** whose report-side twin `targetHalfWidth` has no shipped caller either, leaving `ConvergenceStatus` at `'not-assessed'` on every shipped path. Measured: 86 runner exports scanned, 7 uncalled. Four false docstrings and two doc claims corrected; no phase status and no published number moves. **`runner/` is now audited** — `runner/deadCode.test.ts`, the third dead-code guard, 7 exports allowlisted with reasons, asserted both ways, watched failing three ways, with one assertion pinning the exemption itself. [`DECISIONS.md` § D125](DECISIONS.md) | T2 → closed by T37 | — |
| C5 | `packages/experiments/src/reports/compare.ts:607` can still print `'z'` as a fallback family label on a published convergence report, in the branch where `achievedHalfWidth` is already `NaN`. Cosmetic but it is the exact mislabelling finding #14 was about. | T2 | wave 2 |
| C6 | **One published verdict flips** as a direct result of T2: Phase 5 capacity reassignment, `−0.520 s [−1.029, −0.010]` BETTER at n=60 → `[−1.039, +0.000]` **INDISTINGUISHABLE**. Quoted in four places (`docs/05-roadmap.md:360`, `benchmark/index.ts:497`, `benchmark/capacityReassignment.ts:39` and `:54` — the last is prose and needs rewording, not renumbering). No test asserts the old bound. | T2 | T4 |
| C7 | ✅ **CLOSED 2026-07-28.** *(As filed:)* **NEW DEFECT — the permanent mechanical guard is partly unearned.** `packages/core/src/dispatch/deadCode.test.ts` has two scanner holes T1 found and fixed in its own copy: (a) the export pattern does not match `export async function`, so those exports were never scanned at all; (b) it strips comments but not string literals, so a symbol that names itself in its own error message counts as self-used and becomes unfalsifiably live. T1 demonstrated (a)+(b) by removing a real importer and watching the unfixed audit stay **green**. *(Disposition:)* both ported inline — `core` may not import from `experiments` — both watched failing first, **no new dead exports surfaced**, allowlist unchanged in both directions, and three assertions added pinning the fixes against synthetic input because `dispatch/{policies,predictor}` contains no `export async function` today. [`DECISIONS.md` § D114](DECISIONS.md) | T1 → closed by the closing wave | — |
| C8 | **ENVIRONMENT DEFECT in D4.** `node_modules/@elevator-sim/*` symlinks resolve to `../../packages/*` — the **main checkout's** packages — so a worktree running a *built* artifact links against the main checkout's `dist`, not its own. vitest is unaffected (`resolve.alias` maps to worktree-local source) and `packages/core` is unaffected (no workspace deps), but any worktree-built CLI or `experiments` consumer was stale. T1 hit it and worked around it with worktree-local symlinks. **Consequence: T2's built-CLI evidence was produced against stale `experiments`; the orchestrator re-verified all of it in the main checkout — see below.** | T1 | orchestrator (done) |
| C9 | `docs/05-roadmap.md` § Phase 7 and `docs/07-handoff.md` still record Phase 7 as NOT ACCEPTED and the CLI as four commands. Both are now false. | T1 | T4 |
| C12 | **`packages/cli/**` is unassigned and carries 2 moving intervals.** `cli/src/commands/tune.ts:118` holds a **third** copy of the Phase 7 acceptance pair (`[−2.257, −0.319]` → `[−2.277, −0.298]`); `cli/src/cli.test.ts:471-472` and `commands/compare.ts:480-481` carry finding #19's worked example at n=30 (multipliers 1.023317 at 80%, 1.043504 at 95%), whose exact bounds need a CLI re-run. | T6 | orchestrator |
| C13 ✅ CLOSED by T9 (double rounding, 3 dp then 2 dp) | **Two published bounds in `benchmark/index.ts` never reproduced, pre-dating this wave** — `:463` WT95 reads `[+1.11, +1.85]` but measures `[+1.10, +1.85]`; `:465` AWT reads `[+0.27, +0.57]` but measures `[+0.26, +0.57]`. Neither flips a verdict. T6 deliberately did **not** fix them, so that correcting a pre-existing error would not make a blast-radius diff unauditable. Correct judgement; still needs doing. | T6 | new task |
| C14 ✅ CLOSED by T9 (measured at `a1ec6ad`, never regenerated after `c237d95` wired stages 5 and 7) | **`docs/05-roadmap.md:380` and `benchmark/tailStudy.ts:21,22,53,54` do not reproduce from `runTailStudy()` at all** — e.g. `−0.23 [−0.41, −0.05]` published vs `−0.26 [−0.44, −0.08]` measured. **Not attributable to T2**; this is a separate pre-existing defect of the same class as register finding #4. | T6 | new task |
| C16 | **RAISE the Phase 4 acceptance criterion.** "A stored run replays identically" was satisfied in full by a recorder wrong on 3 of 4 buildings — a wrong picture replays as faithfully as a right one. Add a second clause: *and the first frame places every car where the run says it started.* `CLAUDE.md`: raise a criterion, never lower it. | T8 | T4 |
| C17 | `RunRecord` still has **no** `warnings` field — confirmed by grep of `packages/core/src/metrics/types.ts`. T8's report incidentally claimed otherwise; it meant `SimulationResult.warnings`. The question (does the double-deck disclaimer travel with a stored run?) remains **open with T7**, not settled. | orchestrator | T7 |
| C18 | **T9's figures for T4 to transcribe.** `docs/05-roadmap.md:380`: `−0.23 [−0.41, −0.05]` → `−0.26 [−0.45, −0.08]`, WT95 `−1.58` → `−1.65`, WT99 `−1.94` → `−2.05`. `docs/05-roadmap.md:302` and `docs/07-handoff.md:203`: the n=500 row `−0.006 [−0.031, +0.019]` → `−0.006 [−0.021, +0.010]` (this is register finding #4, now closed in code and still open in docs). Tail census `zoned-uppeak` column `0/0/1/2/0/2` → `0/1/3/2/2/5`, so "no load **above** 2 %" becomes "no load **in this sweep**". No verdict changes. | T9 | T4 |
| C15 | `docs/03-traffic-and-statistics.md` § Part 3 still states the t/z crossover as this simulator's rule. After D14 it must read `t[n−1]` at every n, or say plainly that it describes the literature and not this simulator. | T6 | T4 |
| C3 | **CONFIRMED by T3 (D12): `patternSwitching` is NOT implemented.** `docs/05-roadmap.md:481` lists "Fuzzy traffic-pattern detector with hysteresis, driving per-pattern weight sets" as a delivered Phase 7 bullet and **must be marked not-done**. T3 does not own `docs/`. | T3 | T4 |
| C10 | `docs/06-parameterization-and-tuning.md` now states a stale range for `answer.overloadThreshold` — narrowed from `[1, 1.5]` to `[designLoadFactor, 1.5]` by T3 (D10). | T3 | T4 |
| C11 | `DOOR_DEFAULTS.reopenOnLateArrival` changed `true` → `false` (T3, D9). Any doc quoting the old default is stale. | T3 | T4 |

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
| T3 `9fb32e8` | clean | 128 files / **2590** tests | 2578 + 12 | ✅ matches |
| T6 `ff2c1bf` | clean | 128 files / **2592** tests | 2590 + 2 | ✅ matches |
| T8 `1dbfa43` | clean | 128 files / **2610** tests | 2592 + 18 | ✅ matches |
| T9 `0e509ef` | clean | 129 files / **2623** tests | 2610 + 13 | ✅ matches |
| T7 `ac01caa` | clean | 129 files / **2627** tests | 2623 + 4 | ✅ matches |
| T4 `411e920` | clean | 133 files / **2641** tests | 2627 + 14 | ✅ matches |

**Ten merges, ten predicted counts, ten matches.** The suite has grown 2442 → 2641 with no
regression at any step. A count that did not match its prediction would be the cheapest possible
signal that a test was silently dropped; none has.

**All five wave-1 builders merged.** Worktrees for T1, T2, T3 and T5 removed and their branches
deleted after merge + green suite, per the plan's worktree policy. `.worktrees/T6-blast-radius`
remains (in flight).

Note for future waves: `.gitignore`'s `node_modules/` pattern does not match a *symlink* named
`node_modules`, so a worktree set up per D4 always reports one untracked entry. That is the
orchestrator's own artifact, not the builder's work — check `git log <merged>..<branch>` is empty
before concluding a worktree is dirty.

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

---

# WAVE 2 — IN FLIGHT

| Task | Branch | Status | Blockers |
|---|---|---|---|
| T10 | `fix/core-browser-entry` | 🟡 in flight | — |
| T11 | `feat/viz-phase4` | 🟡 in flight | T10 reports viz import-specifier changes; orchestrator applies at merge |
| T12 | `feat/phase8-fuzzing` | 🟡 in flight | — |
| T13 | `feat/phase8-oracle` | 🟡 in flight | needs barrel exports from T12 if any |
| T14 | `design/destination-dispatch` | 🟡 in flight | — (design only) |

Worktrees now use `.worktree-setup.sh`, which builds a real `node_modules` whose `@elevator-sim/*`
entries point **into the worktree**. The wave-1 approach (symlink the root `node_modules`) resolved
via realpath to the main checkout, so built-artifact evidence was about the wrong tree.

---

# WAVE 1 — CLOSED 2026-07-27

**Result:** all 21 register findings closed; Phase 7 **ACCEPTED**; Phase 4 **foundation landed,
not complete**; suite 2,442 → **2,641** tests, green after every one of ten merges.

## Reconciling the one number two tasks disagreed on

T3 measured "10 of 50 cells differ, `warnings` only". T7 measured "30 of 50, `record` only". T4
could not re-measure and correctly recorded it as unverified rather than transcribing it. **Both are
right at their own baselines**, and neither is a defect:

- T3's 10/50 is against pre-T3 `integration`. Its change added the double-deck disclaimer, which
  reached `SimulationResult.warnings` only — `RunRecord` had no `warnings` field, so the record
  hash could not move.
- T7's 30/50 is against pre-T7 `integration`. Its change *added* `RunRecord.warnings` (closing
  C17), so every cell whose run raises any warning now has a different `record` — 30 of them.

In both measurements `trajectory`, `summary`, `conservation`, `undelivered` and `status` are
identical in every cell. **No simulated number has moved at any point in wave 1.** T9's
full-precision benchmark pins, installed independently and after both, are green — which is a
third, mechanical confirmation of the same fact.

## Carried into wave 2

| # | Item | Owner |
|---|---|---|
| C2 | `core`'s barrel re-exports `loadConfig`, which imports `node:fs/promises`, so a browser import throws at module evaluation. `viz` works around it with dev-server shims. Needs an fs-free subpath export. | wave 2 |
| — | Phase 4 completion: building editor, live metrics overlay, and the full UX cycle over `UX.md`'s 85 scenarios | wave 2 |
| — | Phase 8: property-based fuzzing (the highest-value track), analytical cross-validation across all five buildings | wave 2 |
| — | Phase 6: destination dispatch, access control, learned control — contract task first | wave 3 |
| — | `main` is deliberately **not** updated. Per `MULTI_AGENT_PLAN.md` § 8, `integration` accumulates until the system reaches its definition of done. | orchestrator |

## Doc corrections queued from wave 2 (for the closing documentation pass)

| # | Correction | Found by |
|---|---|---|
| C19 | **`docs/07-handoff.md` § 4's replication-budget table is the deleted normal quantile's answer.** 5 of its 6 rows reproduce at `z`; at `t[n−1]` the budgets are **11 / 37 / 57 / 143 / 222 / 563** against the published 9 / 36 / 55 / 141 / 220 / 563. It understates the budget at every rung — the optimistic direction. Conclusions unchanged. Direct consequence of D14; missed by T2/T6's blast radius because that scan covered *published intervals*, not the *planning* table. | T13 |
| C20 | `packages/core/src/analytical/upPeak.ts` — `deriveUpPeakTerms`' docstring cites "102.8 % … instead of 26.3 %", which reproduces **only at `tp = 1.2 s`**, a value no car of that bank declares. At the declared 1.75 s it is 82.5 % / 21.2 %. Stale pre-fix figures in a `core` docstring. | T13 |
| C21 | `packages/core/src/metrics/summarize.ts` — the `DepartureGapBracket` docstring names three empty brackets but omits that `vertical-city/zone-5-local`'s band is **1.23 s**, 5× tighter than the next and 29× below the widest. | T13 |
| C22 ✅ **CLOSED** — 16 files migrated (not 9: T10's list predated T11's six new modules, and a manual grep gave a false NONE on a 16th). Guarded by a new `boundaries.test.ts` rule with a positive control. | Apply T10's 9-line request in `packages/viz/src/**`: switch browser-reachable, non-test files from `@elevator-sim/core` to `@elevator-sim/core/browser`. Nothing is broken without it — the export condition resolves correctly — but TypeScript's `NodeNext` resolution does not apply the `browser` condition, so a viz file still *sees* `loadConfig` in its types and calling it would typecheck and fail at runtime. Blocked until T11 merges. | T10 |
| C23 | **The access-control mechanism claim is REFUTED and asserted as fact in SEVEN places** — T15 grepped rather than counting T14's four: `docs/01-architecture.md:103-105`, `docs/05-roadmap.md:549-550`, `docs/07-handoff.md:271-273`, `core/src/dispatch/lifecycle.ts:100-104`, `core/src/model/types.ts:122-124`, `core/src/model/car/types.ts:470-473`, `core/src/sim/simulation.ts:2020-2022`. `estimateCost.ts:123` is descriptive and correct as written. **No test pinned any of them** — nothing went red while they were wrong. | T14 → T15 |
| C26 | **A fixture gap in `core` blocks a legitimate profile weight.** `core/src/dispatch/policies/policies.test.ts`'s "has no weight that contributes nothing" scores profiles over `contributionScenarios()`, whose calls carry no `destinationFloorId` — so `rideTime` returns 0 for every car *by construction* and any profile weighting it fails. The very next test in the same file proves the term live by spreading a destination onto the same scenario. T15 left a skipped, documented regression test naming the one-line fix. | T15 |
| C27 | T15's new study entry points are on neither `benchmark/index.ts` nor the package barrel, because `index.test.ts` requires the two to move together and the barrel was another builder's file. Name list in D62. | T15 |
| C24 | **`fuzz/`'s only non-test caller is a test.** `campaign.ts` is driven by `corpus.test.ts`; T12 flagged this itself as "a weaker answer to the standing requirement than `tune` gives `tuning/`" rather than dressing it up. Defensible — a fuzzer's product *is* a test — but a CLI `fuzz` command would close it cleanly and expose the deep campaign to users. | T12 |
| C25 | Out-of-service cars are **unfuzzable**: `carConfigSchema` has no service-mode field, so `INELIGIBILITY_REASONS.serviceMode` is unreachable from any authorable config. Needs a `core` change to become testable. | T12 |
| C28 | **A wave-1 guard couples `core`'s suite to `viz`'s existence on disk.** `core/src/sim/moduleTree.test.ts` compares source directories against `docs/01-architecture.md` in both directions; the doc names `viz/*` directories, so removing `packages/viz` makes them phantoms and the **core** suite goes red. Invariant 6 still holds — it is a doc-driven coupling, not an import — but a reviewer checking the strong form hits it, and the guard should scope its directory set to packages that exist. | T11 |
| C29 | `docs/01-architecture.md`'s module tree needs `viz/editor/`; `docs/05-roadmap.md` § Phase 4's per-bullet table and verdict need updating; `TEST_MATRIX.md` § 3 can now take the 87 UX ids. | T11 |
| C31 | **`docs/09` § 3.1's "empty landing series" prediction is REFUTED by measurement.** Phase 6b kept `PassengerRecord.direction` populated, so a Level-1 recording draws the same landings as a conventional one. The real defect was a *collapse* — 28 landings drawn against 92 landing calls and 132 promise groups on Midtown — producing a falsehood on screen: "unassigned — no car answered this call" about passengers the panel had promised a car. Fixed by rendering; the contract's prediction should be corrected. | T18 |
| C32 | `packages/experiments/src/fuzz/run.ts` was edited by T18 outside its ownership (`withCallType` now drops `passengerAssignment` when the call type cannot carry a destination). Without it every fuzz case naming the shipped profile at `up-down-buttons` threw. **`fuzz/generate.ts` still picks call types blind to the profile** — a real corpus extension for the fuzz owner. | T18 |
| C30 | `UX.md` `ED-12` ("a zero-car bank is a warning") contradicts `bankConfigSchema`'s *a bank must have at least one car*, and `ED-13` describes a per-car `servesFloors` the schema does not have. Both re-marked rather than ticked; `ED-12` is a `core` schema question. | T11 |

---

# WAVE 4 — the closing documentation pass (T23), 2026-07-28

Branch `docs/final-status`. Baseline verified **before** any edit, in this worktree: `npx tsc -b`
clean, `npx vitest run --testTimeout=60000` → **167 files / 3,100 tests (3,092 passed, 8 skipped)**,
343 s. Delta after the pass: **zero** — this task changed no `packages/**` or `data/**` file.

## Disposition of C19 – C32

Each verified in this worktree rather than taken on report. "Verified fixed" means the fix was found
in the code or the doc; "closed here" means this pass made the change.

| # | Disposition |
|---|---|
| C19 | ✅ **CLOSED HERE.** The replication-budget table was the deleted normal quantile's answer. Re-derived from `studentTQuantile` at 90 % two-sided against `s = 3.60 s`: **11 / 37 / 57 / 143 / 222 / 563** against the published 9 / 36 / 55 / 141 / 220 / 563. Five of the six published rows reproduce exactly at `z`; the sixth (563) is already the `t` answer, `z` gives 562. `t` is strictly wider, so the old table **understated the budget at every rung**. Corrected in **both** copies — `docs/07` § 4 and `docs/03` § *Measured: the replication budget…*, which carried the same six numbers. No conclusion changes |
| C20 | ❌ **STILL OPEN — verified present.** `packages/core/src/analytical/upPeak.ts:253-254` still reads *"102.8 % of population per five minutes instead of 26.3 %"*. `packages/core/**` is not this task's. Recorded in `docs/07` § 8 with the correct figures (82.5 % / 21.2 % at the declared `tp = 1.75 s`) marked as transcribed, not re-measured here |
| C21 | ❌ **STILL OPEN — verified present.** `packages/core/src/metrics/summarize.ts`'s `DepartureGapBracket` docstring names three empty brackets and does not mention `vertical-city/zone-5-local`'s **1.23 s** band. Recorded in `docs/07` § 8 |
| C22 | ✅ closed by T11/T10 (16 files migrated, guarded with a positive control) |
| C23 | ✅ **CLOSED.** Four `core` sites **verified corrected** by reading them, not assumed: `dispatch/lifecycle.ts:133`, `model/types.ts:122`, `model/car/types.ts:470`, `sim/simulation.ts:2410`. The three documents are corrected here: `docs/01-architecture.md` § Zoning, `docs/05-roadmap.md` § Phase 6, `docs/07-handoff.md` § 7. `model/car/estimateCost.ts:123` left as written — it is descriptive and correct. **The recommendation to pin it is below and is NOT built** |
| C24 | ⬜ open — `fuzz/`'s only non-test caller is a test. Carried into `docs/07` § 8 |
| C25 | ✅ closed by T19/T20 — `CarConfig.mode` and `BuildingConfig.serviceEvents` made the corner authorable; 9 of the 64 pinned fuzz cases start a car out of group control and 11 carry a mid-run schedule |
| C26 | ✅ closed by T16-D8; the skipped regression test is un-skipped |
| C27 | ⬜ open — Phase 6a/6b study entry points are off `benchmark/index.ts` and the package barrel. **The roadmap was written to name their module paths rather than a barrel export**, so it does not repeat finding #17's shape. Carried into `docs/07` § 8 |
| C28 | ⬜ open, and **reported precisely rather than edited** — `core/src/sim/moduleTree.test.ts` is a `packages/core` file another builder owns this round. Full statement in `docs/01-architecture.md` § *Layout note* and `docs/07` § 8 |
| C29 | ⚠️ **REFUTED as written, and doing what it asked would have gone red.** It asks for `viz/editor/` in `docs/01`'s module tree. **There is no such directory**: the editor's four modules are flat files at `packages/viz/src/` (§ D65), and `moduleTree.test.ts` compares the doc against disk **in both directions** — the line would have become a phantom and reddened the **core** suite. Recorded in `docs/01` as outstanding, with the note that the file move and the doc line must land in one commit. The other two clauses are done: `docs/05` § Phase 4's table and verdict are rewritten, and `TEST_MATRIX.md` § 3 now carries the 87 UX ids |
| C30 | ⬜ open — `ED-12` is a `core` schema question. Carried into `docs/07` § 8 and marked in `TEST_MATRIX.md` § 3 |
| C31 | ✅ **CLOSED HERE.** `docs/09` § 3.1's *empty landing series* prediction is corrected inline and marked ⚠️ REFUTED, with the real defect stated: a **collapse** — 28 landings drawn against 92 landing calls and 132 promise groups on Midtown, producing "unassigned — no car answered this call" about passengers the panel had promised a car. The § 8 risk row is annotated and marked discharged. A summary table of every refuted contract prediction is added at the head of `docs/09` |
| C32 | ⬜ open — `fuzz/generate.ts` still picks call types blind to the profile. Carried into `docs/07` § 8 |

## Also closed by this pass

| Item | What was done |
|---|---|
| C9 | Phase 7 was already recorded ACCEPTED and the CLI as five commands; **re-confirmed by check** and the confirmation recorded in `docs/05` § Phase 7 |
| C10, C11, C15 | Verified already corrected in `docs/06` (`[designLoadFactor, 1.5]`, `reopenOnLateArrival` default `false`) and `docs/03` § Sequential stopping rule (Student-t at every `n`). No edit needed |
| C16 | The raised Phase 4 criterion is carried into the rewritten Phase 4 verdict, which now records the phase **COMPLETE** with the evidence for each clause |
| The fourth `awtIsValid` gate | `docs/03` § *Saturation detection* rewritten: it described the trend test as *the* suppression mechanism and there are **four** grounds. The `fuzz-1001074` reproduction, the Little's-Law consistency check, and the 900 s horizon's measured margins are recorded |
| Phase 8 | Added to `docs/05-roadmap.md`, which had **no Phase 8 section at all** — the phase existed only in `docs/07` § 7 |
| Phase 6 | Restructured into 6a / 6b / 6c across `docs/05` and `docs/07`, with D27's raised criterion stated as it now stands and the results against it |

## Recommendations handed back — code changes this task could not make

| # | Change | Why it matters |
|---|---|---|
| **T23-R1** | **Pin the seven refuted-mechanism sites.** Add to `packages/experiments/src/validation/documentation.test.ts`: for each of `docs/01-architecture.md`, `docs/05-roadmap.md`, `docs/07-handoff.md`, `core/src/dispatch/lifecycle.ts`, `core/src/model/types.ts`, `core/src/model/car/types.ts`, `core/src/sim/simulation.ts`, assert the file does **not** contain a sentence matching `/better under access control/i` unless the same file also contains `refuted` within 400 characters. Watch it fail by re-inserting the old sentence in one file. **Explicitly exclude** `core/src/model/car/estimateCost.ts`, whose "authorize and optimize in one step" is descriptive and true | § D60 records that nothing went red while all seven were wrong, which is the same defect class as a published number nothing re-derives. The corrections are prose, and prose is the only artefact in this repository nothing executes |
| **T23-R2** | **Give the phase-status guard a fourth vocabulary term.** `documentation.test.ts`'s `statusFromProse` recognises *landed and accepted* / *a foundation only* / *not started*. Neither Phase 6 nor Phase 8 is "a foundation only", and all three documents now carry a paragraph explaining that the phrase is the guard's, not the author's. Add e.g. `are partially complete` mapping to `'partial'` and migrate the three documents in one commit | The guard currently forces a false-sounding phrase into the first line of the resume brief, which is the exact position review finding #18 was about |
| **T23-R3** | **Scope `moduleTree.test.ts` to packages that exist** (C28), so deleting `packages/viz` does not redden `core` | Invariant 6's strong form is "core builds and tests with `viz` absent". A reviewer checking it hits a documentation coupling and reasonably reads it as a violation |
| **T23-R4** | **Correct the two `core` docstrings** C20 and C21 | Stale figures in a docstring are the defect class `CLAUDE.md` § *A published number goes stale the same way* names |
| **T23-R5** | **Move the four `editor*.ts` files into `packages/viz/src/editor/` and add the line to `docs/01`, in one commit** (C29) | Two-directional guard: neither half is valid alone |

## Found by this pass

**T23-F1 — Phase 6's criterion named a building, the raise dropped it, and nothing was measured
there.** The original gate read *"a learned dispatcher beats the naive baselines on AWT and WT95
**on the Mixed-Use High-Rise**"*. § D27 raised the metric clause and did not carry the building
clause, and **no Phase 6a or 6b result is measured on `mixed-use-high-rise`** — the operating points
are Midtown Office and Secure Tower interfloor-mix. The reasons for those two are good (Secure Tower
is the only access-zoned building; Midtown is the unzoned control the difference-of-differences
needs) and the substitution was never argued in writing. Dropping a named building from a criterion
is the shape of a weakening, which `CLAUDE.md` forbids, and `mixed-use-high-rise` is separately the
building whose achieved interval is `unmeasurable` by design — a real obstacle, not an excuse.
**Not resolved by this pass**; recorded in `docs/05` § Phase 6 and `docs/07` § 8, and Phase 8's full
experiment matrix is the natural place to close it.

## What this pass could not verify, and says so rather than asserting

- **C20's replacement figures (82.5 % / 21.2 %) and C21's 1.23 s band** are transcribed from Phase
  8's oracle track. This pass verified that the stale text is still present; it did not re-derive the
  replacements.
- **`fuzz-1000384`'s verdict.** A fix is in flight in a concurrent task. Every document records it as
  an **open finding** with its seed, its characterisation and its pre-existence proof, and none of
  them declares Phase 8 clean. The orchestrator finalises the verdict at merge.
  *(Since resolved: **fixed** by § T22-D1, `deadlockIdleBoundS` untouched — see § D115.)*
- **The 87-row UX ledger's four ⚠️ rows** (`RV-11`, `RV-17`, `RV-21`, `KB-14`) are built and
  reachable, and were neither driven nor tested by the task that inventoried them. They are carried
  through as *unverified*, not as passing.
  *(Still true at final close. The ledger is now **88** rows; **those same four rows are unchanged
  and still ⚠️** — the pass that fixed § A.3's two false rows drove three buildings at one viewport
  and did not re-exercise them.)*

---

# UI feedback from the user — 2026-07-28, triage in progress

Collected while T26 (experiment matrix) is in flight. T26 owns `packages/**` and `data/**`, so
none of these are dispatched yet; they batch into one UI task once it lands.

| # | Item | Class | Notes |
|---|---|---|---|
| U1 | **Building editor: invert the floor list so Ground is at the bottom**, matching the preview. | broken — internal inconsistency | Confirmed by screenshot: the editor lists `G, 2, 3, 4, 5, 6` top-to-bottom (ascending downward) while the preview draws `6` at top and `Lobby` at bottom (ascending upward). Two representations of the same building reading in opposite directions on one screen. Check the same inversion in every other floor-ordered list in the editor (bank `servesFloors`, zone floor lists, sky-lobby flags) rather than fixing only the one reported — a half-inverted editor is worse than a consistently wrong one. `UX.md` rows `ED-*` may need re-marking. |
| U2 | **Basic / Advanced view modes** in the run viewer — the current surface is expert-facing throughout. | new | Needs a decision on which is *default*, and on what "basic" is allowed to hide. |
| U3 | **Gamification plan** — research and design, not immediate implementation. | new, research asked for | The hard constraint is that engagement must not cost truthfulness: the viewer currently refuses to show a mean on a saturated run, and that refusal is the project's central discipline reaching the screen. |
| U4 | **Visible rider queues at each floor** — individual riders waiting, not a count badge. | new | The recording folds landing data; `legs` was added at schema v3 and landing assignments at v4. Check whether that carries enough for per-rider rendering before widening the contract again. |
| U5 | **Human-understandable metrics** alongside AWT / WT95 / TTD. | new | Plain language is not the same as less true. "1 in 20 riders waited over a minute" is both more legible *and* exactly as correct as "WT95 = 62 s". The observation/estimate split and the suppression rule must survive translation. |
| U6 | **Build new dispatcher models in the UI.** | new | Strong architectural fit: invariant 7 makes dispatchers *data* (weight vectors + stage settings), and invariant 8 makes every tunable self-describing — `discoverParameterSchemas()` / `collectSearchSpace()` already enumerate ~49 dimensions with type, range, default and `activeWhen`. A generic editor is generatable from that rather than hand-built. |
| U7 | **Rider models definable and assignable to scenarios**, with traffic/occupancy multipliers for worst-case scenarios. | new | `data/traffic-profiles.json` is the current home. Multipliers drive straight into saturation, so the worst-case scenarios this asks for are exactly the runs whose statistics must be suppressed — that has to be designed in, not discovered. |
| U8 | **Build out Access Zoning (credentials).** | new | `CLAUDE.md` forbids collapsing the three kinds of zoning (service / access / operational) into one field, so the editor must keep them distinct. Credentials have measured consequences: a destination kiosk without one breaks `secure-tower` outright (100 % unserved vs 33.5 %). |

**Scope call:** U2–U8 are a coherent body of work, not a punch list — a *product* phase on top of a
simulator whose engine is now sound. Recorded as **Phase 9** rather than bolted onto Phase 4, whose
acceptance criteria say nothing about any of it. Phase 4 stays COMPLETE as scoped; this is new scope.

> ### Disposition at final close (2026-07-28)
>
> - **U1 — DONE.** Every floor-ordered list in the editor now reads the way the building does,
>   ordered by **`index`** and **not** by reversing the declaration array: `midtown-office.json`
>   declares index `0` before index `-1`, so a reversed array would have drawn its basement *above*
>   the lobby in the form and below it in the picture — the same defect on one building instead of
>   five, which is worse because it looks fixed. The audit U1 asked for was done: bank service
>   zoning and the floor-range list moved too; access-zone floor lists and zone rows were examined
>   and deliberately **left alone**, with reasons. **A second finding fell out of it** — the ⇧/⇩
>   buttons never moved a floor *in the building*, only in the JSON declaration; they are relabelled
>   honestly and the scope call is **handed back**. [§ D111](DECISIONS.md).
> - **U2–U8 — DESIGNED, NOT BUILT.** `docs/10-experience-layer-contract.md` is the contract. **Not
>   one line of it is implemented**, and no status table carries a Phase 9 row, deliberately. One
>   prerequisite blocks part of it: `packages/experiments` has **no browser export**, so U6's
>   generated editor cannot reach `collectSearchSpace()` from a browser at all — `docs/10` § 13 q1.
> - **U3's hard constraint was violated by the shipped code the whole time.** *"Engagement must not
>   cost truthfulness: the viewer currently refuses to show a mean on a saturated run"* — it did
>   not. The canvas header printed one, one line below its own suppression banner, and so did
>   `elevator-sim watch`. Fixed before Phase 9 rather than as part of it ([§ D111](DECISIONS.md)),
>   because a gamified surface built on top of that would have inherited it.

---

# Wave 5 — live

Opened **2026-07-28** from `918897d` on `integration`. Plan and ownership map:
[`WAVE5_PLAN.md`](WAVE5_PLAN.md). Scope: the six open C-items and the three non-`C` items in
[§ D115](DECISIONS.md) § *What remains open*. **No phase verdict is in scope.**

**Baseline, measured before the wave opened rather than taken from the handoff:** `npx tsc -b`
clean; `npx vitest run --testTimeout=120000` → **172 files / 3 220 tests, 3 211 passed, 9 skipped**,
exit 0, 540 s. Reproduces `docs/07` § 1 exactly.

| Task | Item | Branch | Worktree | Status | Last update | Blockers | Next action |
|---|---|---|---|---|---|---|---|
| **T33** | `C5` — the `'z'` family label | `fix/c5-z-label` | *removed* | ✅ merged `ef8274d` | 2026-07-28 | — | done — **the item was stale; the unheld convention was the defect**. Opened `C33` |
| **T34** | `C24` + `C27` — CLI `fuzz`, both barrels | `feat/fuzz-cli-and-barrels` | *removed* | ✅ merged `e7532a5` | 2026-07-28 | — | done — non-test caller **verified with the repo's own scanner** |
| **T35** | `experiments` browser export | `feat/experiments-browser-export` | *removed* | ✅ merged `6240250` | 2026-07-28 | — | done — reachability list was **three** modules, not one. W4 **partly** unblocked. Opened `C34` |
| **T36** | `C32` — profile-aware fuzz call types | `fix/c32-fuzz-call-types` | *removed* | ✅ merged `c8d95d3` | 2026-07-28 | — | done — **two** defects, 122 of 2 000 deep cases affected. Deep tier green at 2 000, 0 violations |
| **T37** | `C4` — stopping-rule budget **decision** | `fix/c4-stopping-budget` | *removed* | ✅ merged `4467b87` | 2026-07-28 | — | done — **change nothing**, with the benefit measured, not asserted |
| **T38** | `C30` — `ED-12`/`ED-13` schema question | `fix/c30-editor-schema` | *removed* | ✅ merged `eb0e825` | 2026-07-28 | — | done — schema **held**; `resolveBuilding` raised to agree with it |
| **T39** | The four ⚠️ UX rows, **driven** | `feat/ux-verify-rows` | *removed* | ✅ merged `913b766` | 2026-07-28 | — | done — **two rows were false**; Retry was permanently dead after any failed load |
| **T40** | A guard binding phase status to evidence | `test/phase-status-assertions` | *removed* | ✅ merged `0a69872` | 2026-07-28 | — | done — ten manufactured failures watched. Found the roadmap stated **no status at all** for Phases 0 and 1 |

### Carried-forward register — wave 5 disposition

| Item | Owner | State |
|---|---|---|
| **C4** — the sequential stopping rule's budget | T37 | ✅ **CLOSED** — decision is *change nothing*, and the **benefit** was measured, not asserted: below the replication floor a normal quantile gives up **12–20 points of coverage** to save 3–8 replications ([§ D119](DECISIONS.md)) |
| **C5** — a `'z'` fallback label can print | T33 | ✅ **CLOSED — and the row was stale.** `'z'` could not print and had not been able to since `89bbf37`; the *unheld convention* was the real defect. Opens **C33** ([§ D117](DECISIONS.md)) |
| **C24** — `fuzz/`'s only non-test caller is a test | T34 | ✅ **CLOSED** — `cli/src/commands/fuzz.ts`, verified with the repository's own scanner. Three weaker instances stand in its place, one of them *in the file that closed it* ([§ D118](DECISIONS.md)) |
| **C27** — Phase 6a/6b/mixed-use studies off the barrels | T34 | ✅ **CLOSED** — 34 names + `runMixedUseHighRiseStudy` on both barrels in one commit. It buys public API surface and **not** liveness, and the entry says so ([§ D118](DECISIONS.md)) |
| **C30** — `ED-12`/`ED-13` contradict the schema | T38 → T39 | ✅ **CLOSED — the schema held.** `ED-12`'s row was wrong; `resolveBuilding` was **raised** to agree with the schema it had been silently contradicting, emitting an `empty-bank` code nothing had ever produced ([§ D116](DECISIONS.md)) |
| **C32** — fuzz generator picks call types blind | T36 | ✅ **CLOSED** — two defects, not one; **122 of 2 000 deep cases (6.1 %)** ran something other than what they said. Seed→case mapping proved unmoved by diff **and** by running both regressions ([§ D122](DECISIONS.md)) |

### The three non-`C` items

| Item | Owner | State |
|---|---|---|
| `packages/experiments` has no browser export — **blocks** `docs/10` W4 | T35 | ✅ **prerequisite CLOSED, W4 only *partly* unblocked.** The `node:` reachability list was **three** modules, not one; TypeScript does not apply the `browser` condition. Opens **C34** ([§ D121](DECISIONS.md)) |
| Four ⚠️ UX rows — `RV-11`, `RV-17`, `RV-21`, `KB-14` | T39 | ✅ **CLOSED by exercise, and two were *false*.** `RV-21`'s Retry was permanently dead after any failed load. `KB-14`'s row records what could **not** be exercised ([§ D120](DECISIONS.md)) |
| **No test asserts any phase's status** — § D115 calls this the largest un-mechanised risk | T40 | ⚠️ **NARROWED, not closed.** Status is now bound to evidence that **exists**, not evidence that **supports** it; the guard cannot tell a raised criterion from a weakened one and never questions a `partial` phase ([§ D123](DECISIONS.md)) |

### Explicitly **not** in wave 5

Phase 6c · Phase 9 · double-deck simulation · `patternSwitching` · `garden-down-peak`'s identity
class · the `moveFloor` scope call. Each is deferred by a recorded argument, not by neglect, and
wave 5 does not quietly reopen any of them. See [`WAVE5_PLAN.md`](WAVE5_PLAN.md) § 1.


### Wave 5 closed — 2026-07-28

All eight lanes merged, **no phase verdict moved**. Suite 172 files / 3 220 tests →
**178 files / 3 349 tests (3 340 pass, 9 skip)**, `tsc -b` clean, 567 s measured **serially on an
idle machine** — the only condition under which that number means anything.

**Nine items closed, seven opened.** New: **C33** (the `'z'` shape two files from where it was
fixed) · **C34** (the browser barrel has no non-test caller) · W4's TypeScript-condition gap ·
`deepCampaignRequested` · `withCallType` · `destination-entry` unreached by both fuzz corpora ·
three findings from the `C4` measurement. Current list: [`docs/07`](docs/07-handoff.md) § 8.

**Five of the eight lanes found the register understated what was wrong** — the item as written was
not the defect. That is the argument for *determine whether this is true, do not make it true*, and
it is written up in [§ D124](DECISIONS.md) along with three process findings, including the one this
wave paid for: **parallelise the work, serialise the measurement.**

---

# Waves 7 and 8 — live, 2026-07-29

**Wave 7** closes the debt underneath Phase 6/7 and measures the Phase 6c sweep.
**Wave 8** is Phase 9, the experience layer. They run concurrently because wave 7 is
`core`/`experiments` and wave 8 is `viz`; the one shared surface is `boundaries.test.ts`.

**Baseline:** `da411ea` — 190 files, 3496 passed, 9 skipped, `tsc -b` clean.
**Now:** `4b8682d` — **194 files, 3585 passed, 9 skipped**, `tsc -b` clean.

| ID | Task | Branch | Status | Verdict |
|---|---|---|---|---|
| T50 | Feasibility census for the 6c sweep | *(main tree, read-only)* | **CLOSED** | 18 cells censused, **no ΔTTD measured anywhere** — the constraint that keeps the cell set honest |
| T51 | Pre-register the sweep as § D151 | `integration` | **CLOSED** | committed `26715f1`, before any comparison existed |
| T52 | Run the pre-registered sweep | `feat/t52-sweep` | **IN FLIGHT** | the long pole |
| T53 | Selector reaches the shipped runner | `feat/t53-selector-runner` | **MERGED** `e75a1c6` | § D153 — the **twelfth** signature defect, caught before shipping |
| T54 | Derive `PROFILE_OBJECT_SECTIONS` | `feat/t54-schema-sections` | **MERGED** `94973fe` | § D152 — counts unmoved (56/106), which *is* the claim |
| T55 | `stopCount`'s `activeWhen` | `feat/t55-stopcount` | **IN FLIGHT** | blast radius **before** the edit, by instruction |
| T56 | `kioskRefusedLegs` + C27 | `feat/t56-seams` | **MERGED** `aa2c0ed` | C27 was **not open** — a register row wrong in the *pessimistic* direction |
| T60 | Widen `VizSummary` (W2) | `feat/t60-vizsummary` | **MERGED** `4b8682d` | § D154 — 55/55 liveness mutations red; twelfth dead seam found *inside* the widened type |
| T61 | Rider queues + mood (W6/U4) | `feat/t61-queues-mood` | **IN FLIGHT** | — |
| T62 | Batch runner in a worker (W3) | `feat/t62-batch-runner` | **IN FLIGHT** | — |

## What these waves have found so far, and none of it moved a phase verdict

1. **A guard keyed on an outcome does not catch a change to the *reason* that outcome holds.**
   T54 excused `selection` from the liveness sweep and built a guard to fail the day it became
   runnable. T53 *is* that day, and the guard stayed green — correctly. The claim survived and the
   reason died. Corrected in place with the superseded wording kept beside it ([§ D153](DECISIONS.md)).
2. **A register row wrong in the pessimistic direction.** Six were found wrong in one wave before
   and *every one was optimistic*. C27 is the first that claimed open what was already closed. But
   something real was missing anyway: the two barrel guards compare the barrels **against each
   other**, so deleting all 34 names from both left them green.
3. **A false negative in mutation testing.** Freezing `wait95S` came back green because the value
   has **two readers** and killing one left the other live. Not a dead field — a dead *mutation*.
4. **`docs/10` was wrong about the code twice** — its W2 field list names a `window` field this
   package's own boundary rule forbids. The binding contract is not exempt from being checked.
5. **A test-suite fault that says nothing about the code.** `packages/core`'s whole-simulation tests
   ran under vitest's 5 000 ms default; under a loaded parallel runner **eight** of them timed out.
   71 explicit timeouts added (`5d161e8`), and the two heaviest tests in the same run had *passed*
   all along because they already carried one.

## Process notes for whoever runs the next wave

- **Concurrent lanes all appending to `DECISIONS.md` collide on the entry number.** Three collisions
  so far (D151/D152/D154), each cheap to fix at merge, none caught by any test. If a wave runs more
  than two lanes that record decisions, allocate the numbers up front.
- **Do not let a lane merge on its own report.** Every merge here was re-verified by the full suite
  in the integration tree, and the reports were accurate — but that is a finding, not an assumption.
- **The feasibility/outcome boundary has to be enforced, not requested.** T50 was told not to
  measure ΔTTD and independently refused a *second* measurement — the operating point's detector-input
  rates — on the grounds that it "predicts a selector that never switches, which is outcome
  information wearing a feasibility label." That objection is why § D151 § 5 exists.

## Waves 7 and 8 — CLOSED 2026-07-29

**Final:** `0342868` — **209 test files, 3903 passed, 9 skipped**, `tsc -b` clean, 30 commits.
Baseline was `da411ea` — 190 files, 3496 passed. All worktrees removed, all lane branches deleted.

| ID | Unit | Verdict |
|---|---|---|
| T50 | Sweep feasibility census | 18 cells, **no ΔTTD measured anywhere** |
| T51 | § D151 — the sweep, pre-registered | committed before any comparison existed |
| T52 | The sweep | **Phase 6c NOT ACCEPTED at all five PRIMARY cells** |
| T53 | Selector → shipped runner | § D153 — twelfth signature defect, caught pre-ship |
| T54 | Search space derived from schema | § D152 — counts unmoved, which *is* the claim |
| T55 | `stopCount`'s `activeWhen` | § D155 — **written, measured, refused** |
| T56 | `kioskRefusedLegs` + C27 | C27 was **not open** — first pessimistic register row |
| T60–T65 | Phase 9, W2/W3/W5/W6/W7/W9 | §§ D154, D157–D161 |

### Phase status — unchanged, and that is the result

**Phases 1–5 and 7 accepted. Phase 6 ⚠️ partial. Phase 8 accepted.** No verdict moved. Phase 6c
was swept over eight pre-registered operating points under a protocol dated before any ΔTTD, and
refused. The mechanism is now named rather than guessed: **the shipped demand template varies the
*level* and never the *directional split*, so the condition learned selection exists to exploit does
not occur at any shipped operating point.**

### The one finding that outranks the rest

**Six lanes, six tests that could not fail — and the sixth was the instrument that checks for tests
that cannot fail.** Five distinct mechanisms, none catchable by reading:

1. **Two readers** — freezing one leaves the other live (T60, `wait95S`).
2. **A fixture routing past the subject** — the default gutter left zero cells, so every "glyph"
   test silently exercised the **bar** path (T61). Three mutations green.
3. **A control returning before the live half** — the CRN negative control compared traces at
   different *seeds*, returning at the `seed` scalar before the per-passenger loop, which is the
   only half that can fire in production (T62).
4. **A guard whose *meaning* eroded while every assertion stayed true** — `marks()` filtered
   `y > 40` to mean "landing rows"; another lane drew at `y = 48`. Nothing went red, because the
   test is the thing that moved (T63).
5. **The mutation harness itself** — `--reporter=basic` no longer exists in vitest 4, so **every
   mutation reported "no failures."** A sweep that would have certified a dead suite as fully
   live (T65).

**A test that cannot fail is invisible to every other check this repository runs**, including the
one built to find it. Hunting all five is now a standing item in a lane brief, not a lucky catch.

### Process notes for the next wave

- **Allocate `DECISIONS.md` entry numbers up front.** Seven collisions. The danger is not the
  collision: a wrong cross-reference points at a **real, unrelated entry**, so nothing reads as
  broken to anyone who does not follow the link. `CLAUDE.md` spent one commit pointing readers at
  the schema-derivation entry while describing the sweep. No test catches this.
- **Hand a conflicted merge back to the lane that wrote it.** T61 and T63 collided on 11 hunks
  across three rendering files. Resolving them centrally would have shipped both an eroded guard
  and an unasserted spacing change; the lane found both.
- **Serialise the measurement, parallelise the work** — still true, and wave 7 paid it again: the
  full suite ran ~8.5 min alone and ~13 min under load, and a loaded runner produced **eight**
  spurious timeout failures that said nothing about the code.
- **Every unit found its governing document wrong about the code at least once**, and `docs/10`
  three times. Being *binding* does not make a document *right*.

---

# Wave 9 — CLOSED 2026-07-29

**Scope, by explicit instruction:** drive the debt affecting gameplay or simulation toward zero,
in parallel where possible. Six items were out of scope by that filter (internal hygiene that
cannot produce a wrong number or a wrong screen) and stayed listed rather than closed quietly.

**Final:** `55f04f8`, pushed to `origin/integration`. **225 test files, 4 122 tests passed, 10
skipped**, `tsc -b` clean. Baseline at wave open: `3fec814` — 209 files, 3 903 passed. All wave 9
worktrees and branches removed.

| ID | Unit | Verdict |
|---|---|---|
| T71 | Non-elevator transport mode in `core` | § D167 — largest modelling debt closed; double-deck verdict **flipped while its evidence base narrowed** |
| T73 | `nearest-car` defaults | § D164 — the viewer's default was already fixed and **undefended**; live site was the CLI's example list |
| T74 | Three viewer defects | § D165 — two of three reports were wrong about their own cause |
| T75 | Viewer selector + two `core` schema rows | § D166 — both "blocked on a `core` fix" refusals understated themselves, in opposite directions |
| T76 | Phase 9 U2 mode split + live weight editor | § D168 — mode parity satisfies § D163 clause 2; found a never-hide item **no mode had ever drawn** |
| T78 | Honesty property under search | § D171 — satisfies § D163 clause 1; found **two real contract violations**, both owner-resolved |
| T79 | Sky-lobby escalators + campaign stage 6 | § D170 — corrected the orchestrator's own false premise about the building's geometry |
| T70 | Phase-varying directional split | § D169 — built the condition Phase 6c's refusal named; **ran no selector arm**, by design |
| T80 | Two merge-exposed honesty findings | § D172 — suppressed-mean report was a **false positive**; narrowing it surfaced five more of the same class |

## Where Phases 1–7 and 9 stand at close

**Phase 6 is still ⚠️ partial.** The condition its refusal named — no shipped template varying
directional mix within a run — no longer exists, but **no selector arm has been measured on the
new template**. That measurement is explicitly the next piece of work, not done here. See
[`GAPS.md`](GAPS.md) § 1.

**Phase 9 has a criterion for the first time** ([§ D163](DECISIONS.md)), and both of its
load-bearing clauses now measure as satisfied. It still carries no status row — a formal
acceptance pass is a distinct piece of work this wave did not do, deliberately, per § D163's own
rule that the row and the verdict land together.

## The two results worth carrying past this wave

**A negative result, stated as cleanly as the positive ones.** The honesty search found two real
contract violations — a probability word reaching a schema surface, and a comparison panel naming
a winner at n = 2 against a stated floor of 50. Both were owner judgement calls, not code defects,
and both are resolved with the reasoning on the record rather than silently patched.

**A false positive, and the discipline of narrowing a property instead of widening an exclusion.**
The suppressed-mean report looked exactly like a third instance of a leak this repository has
closed twice before. It was arithmetically impossible instead — a run-level count matched by an
over-eager cue window — and narrowing the check correctly surfaced **five more of the same class**
before it stabilised. The closed leak from two waves ago is now reconfirmed by an injected fault
rather than by rereading the code that fixed it.

## Full gap register

[`GAPS.md`](GAPS.md) — every known limitation in one place, ordered by whether it can produce a
wrong number, a wrong screen, or neither. Written so the next reader does not have to reconstruct
it from thirty commit messages.

---

# Wave 11 — 2026-07-30

**Scope:** take the wave-10 viewer from *implemented* to *implemented per spec*, measured against
[`docs/12`](docs/12-design-handoff.md) § 5's eleven-point definition of done and § 1's thirty-seven
requirement rows; close the named gaps in [`GAPS.md`](GAPS.md); hand Phase 6c on rather than run it.
Board: [`WAVE11_PLAN.md`](WAVE11_PLAN.md).

**Wave 10 was uncommitted when this wave opened** — the entire design-handoff rebuild sat in the
working tree, closed against its own claim and verified by nobody. It reproduced exactly (253 files /
4 700 tests) and landed as `22a1021`.

| ID | Unit | Verdict |
|---|---|---|
| T81 | Verify and land wave 10 | Claim reproduced exactly; pushed |
| T83 | Phase 6c handover | [`docs/13`](docs/13-phase-6c-handover.md) — written to be executed cold; the lane corrected five line references in the index it was given |
| T89 | Conformance audit | 37 rows audited against the vendored prototype; drove every lane below |
| T90 | Transport block | § D180 — thirteen controls in **no** requirement row and no deviation; recorded and restyled |
| T91 | Elevation express toggle | § D181 — built; found a band closed with no transfer level silently losing 93 % of demand |
| T86 | Access-zoning controls | § D182 — W8 closed; found the editor **deleting** access zones on save, and Vertical City reading back as three floors |
| T88 | Suppression ground | § D183 — the ground beside the prose, with the parity derivation intact |
| T87 | Matrix pins | § D184 — the recorded gap was **false**; the real gap was the Pareto front, already drifted four days |
| T92 | Schema 8 transport | § D185 — the ground reaches the screen; the fixtures could not tell *wired* from *working* |

## The two results worth carrying past this wave

**A tooling defect produced two false findings, and one of them was in the register.** Five source
files carried raw NUL bytes; `grep` here wraps `ugrep -I`, which **silently skips** such files —
no output, exit 1, indistinguishable from a genuine miss. It produced a false *"nothing writes
`#rail-access-note`"*, caught within the hour by driving the page; and a false `GAPS.md` entry saying
the matrix pins were re-derived by no test, which sat where a lane would plan a day's work against it.
Closed in `f78dc42`. **A register entry is evidence about the tree and inherits the reliability of
whatever produced it.**

**Three defects were found by building against a thing rather than reading it**, which is the wave's
own rule pointed at four different subjects: the legend labels that reached no DOM (M4), the editor
that deleted the zoning it was being taught to edit, the band that could strand a building's traffic,
and the disclosure suite that was green for a whole commit while the screen it described rendered
something else.

## Where the phases stand at close

**No phase verdict moved, and none was in scope.** Phase 6 is still ⚠️ partial with 6c handed on.
**All nine of Phase 9's units are now built** — W8 was the last open half — and Phase 9 still carries
**no status row**, because [§ D163](DECISIONS.md)'s rule is that the row and the verdict land together
and the acceptance pass is a distinct piece of work. A unit landing is not a verdict.

> **Stale two paragraphs up, corrected in place (wave 12 census, 2026-07-30):** the acceptance pass
> happened later the same wave — `b876724` landed the row and the verdict together, and Phase 9 is
> **✅ ACCEPTED WITH NAMED GAPS (2026-07-30)**, stated identically in `docs/05`, `README.md`,
> `GAPS.md` § 5 and `CLAUDE.md`. This close section was written at `9fd738c` and the wave's last
> four commits postdate it. For the same reason it carries no closing suite figure; the figure is in
> `GAPS.md`'s header — `integration` @ `bf16a2d`, **258 files / 4 794 tests, 4 784 passed,
> 10 skipped**, `tsc -b` clean, 565 s serial.

---

# Wave 12 — 2026-07-30

**Scope:** the known open items, verified at file:line before lanes were cut, then a playability
baseline: the UX ledger's § 26 drive list executed in a real browser, and Phase 6c's pre-registered
re-measurement ([`docs/13`](docs/13-phase-6c-handover.md)) run as its own serial phase.
Board: [`WAVE12_PLAN.md`](WAVE12_PLAN.md).

| ID | Unit | Lane | Status |
|---|---|---|---|
| T93 | Wire the bank filter (SG-15), with a picture-change test | V | ✅ landed `6f6c320` — [§ D187](DECISIONS.md), and § D180's contradiction recorded where it was fixed |
| T94 | `Escape` dismisses the drawer (SH-12/KX-11) + KX-10 | V | ✅ landed `43ab0ab` — [§ D188](DECISIONS.md); KX-10 built in the same commit |
| T95 | URL write-back (SH-09), round-trip tested | V | ✅ landed `1e958b3` — [§ D189](DECISIONS.md); `applyDeepLink`'s first direct tests |
| T96 | `copy run` names the traffic pattern (TP-13) | V | ✅ landed `dbfc22e` — [§ D190](DECISIONS.md); equivalence driven 10/10, refusals for what no flag expresses |
| T97 | Machines editor "is not decoration" suite (ME-07) | T | ✅ landed `52ae8fc` — [§ D191](DECISIONS.md); the fit-path wiring fact is the keeper |
| T98 | Arrival-pattern select positive assertion (CO-02) | T | ✅ landed `ea81cb3` — [§ D191](DECISIONS.md) |
| T99 | Honesty seeding: `'basic'` mode axis, express-toggle and access-block strings | H | ✅ landed `848b182`+`409de31`+`62b7a6d` — [§ D194](DECISIONS.md); always-on corpus 200 248 → 201 832, 0 violations |
| T100 | The fifth dead-code audit, under `packages/viz` (Phase 9 clause 4 mechanised) | A | ✅ landed `f3084a2` — [§ D192](DECISIONS.md); 8 dead candidates opened as follow-up |
| T101 | A real authored field replaces `$comment` on the pattern surface (G3-o) | P | ✅ landed `29d8137` — [§ D193](DECISIONS.md) |
| T102 | Register corrections: `docs/07` § 8's six stale entries, `docs/10` schema version, two docstrings | D | ✅ landed `9ce6a6f` — six pessimistic stale entries retired in place |
| T103 | Phase 6c measured per § D162 / `docs/13` — serial phase after integration | M | ✅ landed `0a7bb4d`+`b4be48b`+`e70082f` — **NOT ACCEPTED, the third refusal** ([§ D200](DECISIONS.md)); the detector engaged, the selector refused, and the flat control's BETTER named as a static hybrid |
| T104 | Drive phase: UX § 26 list in a browser; every 🔲 resolved, primary flows end-to-end | — | ✅ landed `5d4b782`+`0f56719` — [§ D198](DECISIONS.md); 87 rows driven green from zero, 🔲 = 0, eight defects found and fixed same-day ([§ D199](DECISIONS.md)) |
| — | Disposition of T100's 8 dead candidates (wire or delete, each with its own verification) | — | ✅ landed — [§ D197](DECISIONS.md); 4 wired, 4 deleted, and the dwell chips were inert in every shipped shift |

**Lane conduct:** six lanes, six worktrees, six branches; every `git add` named explicit paths and no
commit contains another lane's work — R25's remedy held. The wave's own errors — an invalidated
baseline measurement, a decision number cited before it existed, two silent lane stalls — are
recorded in [§ D195](DECISIONS.md) rather than tidied away.

**Final (integration close):** `npx tsc -b` clean, `npx vitest run` → **261 files / 4 853 tests,
4 843 passed, 10 skipped**, exit 0, 1 373 s, **Node v26.5.1, serially on an idle machine, on the
pushed tree at `821210a`**. The first integration run was **red — 26 failed — and the red run is
the wave's largest finding**: the failures were inherited pins that matched no committed tree,
including the handoff's own close figure, traced link by link and re-pinned under
[§ D196](DECISIONS.md). The skip count did not move all wave.

**Final (wave close, superseding the line above):** after the drive phase, its eight same-day
defect fixes, the dead-candidate dispositions and the Phase 6c measurement — **262 files / 4 883
tests, 4 873 passed, 10 skipped**, `tsc -b` clean, 1 918 s, Node v26.5.1, serial on an idle
machine, **on the pushed tree at `a8acf65`**. Every task on the wave board is landed; the wave's
verdicts are § D187–§ D200, and no phase marker moved in either direction.

---

# Wave 13 — 2026-07-31

**Scope:** the building-behaviour program, `docs/14-building-behaviour-contract.md` steps 0–6 —
richer traffic variance, passenger behaviour, and a learned dispatcher that can be taught. Board:
[`WAVE13_PLAN.md`](WAVE13_PLAN.md).

**What makes this wave different from 1–12:** those closed findings, built a design handoff, and
audited what already existed. This one **adds behaviour**, which is the thing this repository is
worst at adding safely — the signature defect has landed eleven times in code and once in `data/`,
and §§ 2–3 of the contract are almost entirely new tunables. The wave's rule is therefore
`docs/14 § 5` criterion 2: **move the control and require the run to change, on the legs.**

| ID | Unit | Branch | Depends | Status |
|---|---|---|---|---|
| T1 | Traffic seed separation (§ 1.1) | — | — | ✅ landed `d52f347` — `StreamSet(seed, { trafficSeed })` reaching `runSimulation` and reported on the result; 4 885 → 4 896 tests, no existing figure moved |
| T0 | Sky-lobby / escalator authoring in the designer (§ 5a) | `feat/w13-sky-lobby-authoring` | — | 🔄 **open** — halt lifted 2026-07-31, see *Environment — closed* below |
| T2 | `trafficModel: 'v2'` + `batchSize` stream (§ 1.3) | `feat/w13-traffic-model-v2` | — | 🔄 **open** — halt lifted 2026-07-31, see *Environment — closed* below |
| T3 | Mass control, group-size curve (§ 2.1–2.2) | `feat/w13-traffic-variance` | T2 | ⬜ blocked |
| T4 | Day variation (§ 2.3) | `feat/w13-day-variation` | T3 | ⬜ blocked |
| T5 | Patience, lobby crowding, stairs (§ 3) | `feat/w13-passenger-behaviour` | T2 | ⬜ blocked |
| T6 | Learned-dispatcher teaching surface (§ 4) | `feat/w13-teaching-surface` | T3, T4 | ⬜ blocked |

**Baseline at open:** `d52f347` — **4 896 tests, 4 886 passed, 0 failed, 10 skipped**, `tsc -b`
clean, `review-gates` green, all 981 pins and both identity digests reproducing.

## Environment — the wave's first finding, and it is not about the code

**Both lanes were halted within minutes of opening, because the working tree is not stable.** The
repository lives under `~/Documents/`, and **Dropbox and OneDrive are both running against it**.
Observed inside a four-minute window, all of it while two agents held open worktrees:

| Observed | Evidence |
|---|---|
| An untracked file deleted seconds after it was written | `WAVE13_PLAN.md` written, confirmed, then absent |
| A tracked file's staged modification reverted | the wave-13 append to this file, lost and re-applied |
| `.worktrees/` deleted whole, with two live agents inside it | `ls: .worktrees/: No such file or directory` |
| `node_modules/` replaced by a dangling symlink, then restored | `readlink` → `../../node_modules`, target absent; a real directory again two minutes later |
| A `git checkout` silently reverted | `integration/wave-13` checked out; `HEAD` back on `fix/repin-to-reproducible-values` |
| Every file's mtime rewritten wholesale | uniform `11:51` across the tree |

**This is the same client that already cost this repository a wave.** `scripts/review-gates.mjs`
gates on `name 2.ts` copies for exactly this reason, and its docstring records what they did: *"they
produced **21** failures that had nothing to do with the code"*. `GAPS 3.md` — a third-generation
conflict copy — was present, absent and present again during this session. The gate treats the
symptom; the cause is that a sync client is a second writer to the tree.

**Why this halts the wave rather than merely annoying it.** Every acceptance criterion in `docs/14`
is *a run, not an argument*, and the blocking one is byte-identity across 981 pins. A suite result
from a tree a second process is rewriting is not evidence of anything — green or red. That is
precisely the failure mode [§ D196](DECISIONS.md)/[§ D201](DECISIONS.md) cost a wave to unpick: a
pin correct on one tree and wrong on another, with no way to tell which was right. Running lanes
here would manufacture that condition deliberately.

`git fsck` is clean — no object corruption, only the dangling objects expected after worktree
removal. **Nothing is lost**, and both agents were stopped before either wrote a file.

## Environment — closed 2026-07-31, by a run rather than by an argument

**The repository was relocated to `~/Development/04-personal-projects/elevator-sim`** — a real local
directory on the data volume, outside `~/Documents`, `~/Desktop`, `~/Library/CloudStorage/*`,
`~/Dropbox` and `~/OneDrive`. **Both sync clients are still running**, and that is the point worth
stating precisely: the precondition was never *"kill the client"*, it was *"the client cannot see the
tree"*. Checked rather than assumed:

| Check | Result |
|---|---|
| `git rev-parse --show-toplevel`, `realpath`, `df` | a real local path on `/System/Volumes/Data`, no symlink, no cloud-storage ancestor |
| 30-second write-and-wait probe | **passed** — the untracked file survived and `git status` stayed clean. The same sequence previously lost the file, reverted a staged edit, and reverted a `git checkout` |
| Conflict copies | `GAPS 3.md` removed. It was **not** a byte-copy of `GAPS.md` — 41 lines were unique to it, a superseded wave-11 generation — so it was preserved outside the repository before deletion rather than discarded |

**Baseline re-established on the relocated tree, at `866e6a1`:**

```
Test Files  263 passed (263)
     Tests  4886 passed | 10 skipped (4896)
  Duration  703.81s
```

`tsc -b` clean; `review-gates` scanned 583 source files and **all blocking gates pass**; all 981 pins
and both identity digests reproduce. This matches § 1's inherited figure exactly — 4 896 / 4 886 / 0
/ 10 — so it is now **confirmed rather than inherited**, which was the whole reason for re-running
it.

**The skip count is 10 and still has not moved.** That is the number [`GAPS.md`](GAPS.md) says to
watch, because a wave that quietly skips a test to go green moves it and a growing test count says
nothing on its own.

**[§ D201](DECISIONS.md)'s platform hazard did not bite, and it was the live risk here.** That
decision found this suite's *pass/fail split* to be platform-dependent — the § D196 re-pin inverts
between Linux and darwin/arm64 — while the **totals** reproduce across both. This run is
darwin/arm64 and the totals reproduce, so the deviation § D201 predicts is absent and no finding is
outstanding. A suite figure is a claim about a machine as well as a commit, and this one now names
both.

## Lanes — opened 2026-07-31 against the confirmed baseline

One worktree per lane, one branch per worktree, one agent per branch — R25's remedy, followed this
time rather than adopted after the fact. Both lane branches and `integration/wave-13` were moved from
`d52f347` to `866e6a1`, the tree the baseline was actually measured on.

| Lane | Worktree | Branch | Scope |
|---|---|---|---|
| **T0** | `.worktrees/w13-t0-sky-lobby` | `feat/w13-sky-lobby-authoring` | `packages/viz` only; moves no draw |
| **T2** | `.worktrees/w13-t2-traffic-model` | `feat/w13-traffic-model-v2` | `packages/core`; forbidden `published.ts` |

**Worktrees were given a real `npm ci` rather than the symlinked `node_modules` of
`.worktree-setup.sh`.** That script exists because the naive symlink resolves to its realpath in the
main checkout, so `@elevator-sim/*` points at the wrong tree and built-artifact evidence is about
code you did not write. Verified by `realpath` that each worktree's `@elevator-sim/core` resolves
into **its own** `packages/core`, which is the property the script was hand-rolling and which npm
workspaces provides directly.
