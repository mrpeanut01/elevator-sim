# Agent status board

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
| C4 | `packages/experiments/src/validation/harness.ts:176` builds `productionStoppingRule` by injecting `estimateMean`, which is now Student-t at every n. Sequentially-stopped experiments may therefore run marginally more replications. T2 argues this is the conservative direction (`stopping.ts`: stopping too early "publishes a number it did not earn") and left it deliberately, since re-wiring it to a crossover estimator in a separate change would create a symbol with no non-test caller. **Needs a decision, not a default.** | T2 | wave 2 |
| C5 | `packages/experiments/src/reports/compare.ts:607` can still print `'z'` as a fallback family label on a published convergence report, in the branch where `achievedHalfWidth` is already `NaN`. Cosmetic but it is the exact mislabelling finding #14 was about. | T2 | wave 2 |
| C6 | **One published verdict flips** as a direct result of T2: Phase 5 capacity reassignment, `−0.520 s [−1.029, −0.010]` BETTER at n=60 → `[−1.039, +0.000]` **INDISTINGUISHABLE**. Quoted in four places (`docs/05-roadmap.md:360`, `benchmark/index.ts:497`, `benchmark/capacityReassignment.ts:39` and `:54` — the last is prose and needs rewording, not renumbering). No test asserts the old bound. | T2 | T4 |
| C7 | **NEW DEFECT — the permanent mechanical guard is partly unearned.** `packages/core/src/dispatch/deadCode.test.ts` has two scanner holes T1 found and fixed in its own copy: (a) the export pattern does not match `export async function`, so those exports were never scanned at all; (b) it strips comments but not string literals, so a symbol that names itself in its own error message counts as self-used and becomes unfalsifiably live. T1 demonstrated (a)+(b) by removing a real importer and watching the unfixed audit stay **green**. The same holes exist in core's copy today. | T1 | new task, wave 2 |
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
- **The 87-row UX ledger's four ⚠️ rows** (`RV-11`, `RV-17`, `RV-21`, `KB-14`) are built and
  reachable, and were neither driven nor tested by the task that inventoried them. They are carried
  through as *unverified*, not as passing.
