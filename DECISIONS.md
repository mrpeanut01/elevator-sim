# Decision log

Decisions made during orchestrated delivery, with the alternatives considered. Project-technical
decisions that belong to a doc are recorded there as well, per
[`CLAUDE.md` § Working agreements](CLAUDE.md).

---

## D1 — Work the review register before any tuning or measurement campaign

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** [`docs/08-review-findings.md`](docs/08-review-findings.md) carries 21 open findings.
Three of them (#9/#10 predictor horizon, #12/#13 late-arrival reopen, #21 overload threshold) are
declared Phase 7 search dimensions that provably cannot move any objective, and one (#14) means
every published interval past n=25 uses the normal quantile while being labelled paired-t.

**Alternatives.** (a) Start Phase 6/8 immediately and fix findings opportunistically.
(b) Fix the register first. (c) Fix only the critical finding.

**Chosen:** (b). **Why:** a tuning campaign run against the current tree spends 50–200 replications
per evaluation on at least three exactly-flat dimensions and reports whichever value the draw held
as a tuned result — and every interval it publishes is anticonservative. Fixing afterwards means
re-running the campaign. `docs/07-handoff.md` states this ordering explicitly.

**Impact.** Wave 1 is register work plus the Phase 7 seam. Phases 6 and 8 move to waves 3 and 4.

---

## D2 — Phase 4 (visualization) runs in parallel with wave 1, not after it

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** Phase 4 creates a new `packages/viz` and consumes `core`'s public API. The roadmap's
sequencing notes say Phase 4 can run in parallel once Phase 2 is complete; Phase 2 landed.

**Alternatives.** (a) Serialize after the register. (b) Parallelize now.

**Chosen:** (b), scoped to a foundation task (T5) rather than a fan-out. **Why:** the file set is
disjoint from every other wave-1 task (a new package plus three root config files), so it carries
no merge risk, and it is the longest-lead item with a UX cycle attached. Fanning out UI features
before the contract is locked is exactly what the plan's planning-first rule forbids, so T5
delivers the contract and skeleton and wave 2 fans out against it.

**Impact.** `tsconfig.json`, root `package.json` and `vitest.config.ts` are owned by T5 for wave 1.

---

## D3 — `sim/simulation.ts` has a single named owner per wave

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** The roadmap records that Phase 5 shipped four dead seams simultaneously because work
was partitioned by module directory and `sim/simulation.ts` appeared in no agent's ownership list.

**Alternatives.** (a) Let any task edit it and resolve conflicts at merge. (b) Assign it to one
task per wave. (c) Orchestrator owns it and applies wiring edits itself.

**Chosen:** (b) — T3 owns it for wave 1. **Why:** (a) reproduces the documented root cause; (c)
puts the orchestrator in the critical path of every task. Naming an owner makes the seam somebody's
definition of done, which is the fix the roadmap asks for.

**Impact.** T1, T2, T4 and T5 may not write `sim/simulation.ts`. Any wiring they need is requested
from T3.

---

## D4 — Worktrees get a `node_modules` symlink rather than their own install

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** Concurrent tasks run in git worktrees, which have no `node_modules`. The repo is an
npm workspace whose `vitest.config.ts` aliases cross-package specifiers to package *source*, and
`packages/*/node_modules` hold nothing but a `.vite` cache.

**Alternatives.** (a) `npm install` per worktree. (b) Symlink the root `node_modules`.

**Chosen:** (b). **Why:** the alias config means no worktree needs a built `dist` of a sibling
package to run tests, so a shared dependency tree is sufficient and avoids five redundant installs.

**Impact.** Any task that needs to run the *built* CLI (`node packages/cli/dist/index.js`) must run
`npx tsc -b` in its own worktree first; `dist/` is gitignored so it will not conflict at merge.

---

## D5 — The Phase 4 renderer consumes a *recorded* run, not a live `Simulation`

**Date:** 2026-07-27 · **Owner:** T5 · **Ratified by:** orchestrator

**Context.** Phase 4's renderer must sample `Car.positionAt(t)` at display framerate *between*
kernel events. That needs a time source. `Simulation.run()` is one synchronous call with no live
clock to sample, and `CLAUDE.md` invariant 3 forbids adding one to `core/`.

**Alternatives.** (a) Invert control — a tick loop or wall clock driving the simulation.
(b) Render a finished, serialisable, seed-bearing `VizRecording`. (c) Support both.

**Chosen:** (b). **Why:** (a) puts a clock in `core` and breaks invariant 3. A shipped building
simulates in milliseconds, so running first and sampling afterwards costs nothing perceptible, and
it is what makes Phase 4's acceptance criterion — "a stored run replays visually identically" —
mechanically checkable in Node without a browser.

**Impact.** Wave 2's live metrics overlay reads from the recording's folded step series rather than
from a running simulation. The building editor is unaffected (it operates on config, not runs).
Long runs hold all frames in memory; streaming is wave-2 work. Recorded runs are `postMessage`-able,
so moving simulation off the main thread stays open.

---

## D6 — `npm install` is deferred until wave 1's builders finish

**Date:** 2026-07-27 · **Owner:** orchestrator

**Context.** `packages/viz` declares `vite` as a devDependency and `package-lock.json` is stale, so
`npm ci` would fail. The obvious fix is to run `npm install` immediately.

**Alternatives.** (a) Run it now. (b) Defer to the end of the wave.

**Chosen:** (b). **Why:** per D4 the root `node_modules` is symlinked into every live worktree.
Reinstalling while three builders are running their suites against it would mutate their dependency
tree mid-run and produce failures that look like defects in their work. The tree already contains
vite 8.1.5 (vitest brings it), so nothing is blocked until the lock is regenerated.

**Impact.** Tracked as C1 in `AGENT_STATUS.md`. Wave 1 does not close until it is done and the
suite is re-run against the refreshed lock.

---

## D7 — The sequential stopping rule uses the published estimator; `halfWidthQuantile` is deleted

**Date:** 2026-07-27 · **Owner:** T6

**Context.** Review finding #14 moved published intervals to Student-t at `n − 1` at every `n`.
That took `reports/statistics.ts`'s `halfWidthQuantile` — the `t` (n ≤ 25) / `z` (n > 25) crossover
that [`docs/03-traffic-and-statistics.md`](docs/03-traffic-and-statistics.md) § Part 3 states as the
*sequential stopping rule's* rule — off the published path. Afterwards it had **no non-test
production caller**: `validation/harness.ts:176` builds `productionStoppingRule` by injecting
`estimateMean` (t-always), and the only other reference was a fallback label at
`reports/compare.ts:607` for a family `formatConvergence` never prints. Its own docstring claimed
"Callers: the runner's injected `HalfWidthEstimator`, and the convergence report's fallback label";
nothing injected it. That is the shape [`docs/05-roadmap.md`](docs/05-roadmap.md)'s **Standing
requirement — the integration seam has an owner** exists to catch, arriving for the seventh time and
created by a fix.

**Alternatives.** (a) Inject a crossover estimator built on `halfWidthQuantile` into
`productionStoppingRule`, so § Part 3's rule is implemented in the loop control where it belongs
while published intervals stay t-always. (b) Delete `halfWidthQuantile` and stop claiming the
crossover is implemented, which makes § Part 3 wrong as written. (c) Leave it exported and unused.

**Chosen:** (b). **Why:**

1. **The two rules share a target, so they cannot use different quantiles.** `acceptableRange` is a
   half-width target, and `ConvergenceReport.status` decides `converged` from the *published*
   half-width. Under (a) the runner stops on a half-width 2–5 % narrower than the one the page
   prints, so a cell can stop while its own report says `IN PROGRESS`. Two numbers for the same
   quantity on the same cell is the mislabelling class of finding #14, one layer down.
2. **(a) stops earlier, which is the unsafe direction.** `runner/stopping.ts` states it: "an
   experiment that runs too long wastes CPU, and one that stops too early publishes a number it did
   not earn." (b) is the conservative option *and* the smaller diff; it was chosen for the first
   reason, and the second is noted so it cannot be mistaken for the motive.
3. **§ Part 3's own justification does not survive.** The doc allows the stopping rule to be
   approximate because "being 5 % optimistic about when to stop costs replications, not
   correctness". That holds only while the stopping half-width is never published. It is published:
   the runner records it on `StoppingVerdict` and a cell's replication count is explained from it.
4. **(c) is the defect itself.** A symbol may have no caller only with a recorded reason
   (`tuning/deadCode.test.ts` § `PUBLIC_API_ONLY`); "the doc mentions a crossover" is not one.

`T_DISTRIBUTION_MAX_N` goes with it: after (b) it had no code use, and an exported constant
documenting a crossover nothing implements is the same defect in a smaller package.

**Impact.**

- Deleted: `halfWidthQuantile`, `T_DISTRIBUTION_MAX_N` (from `reports/statistics.ts` and the
  `packages/experiments` barrel). Nothing outside `packages/experiments` referenced either.
- `reports/compare.ts:607` now defaults `ConvergenceReport.method` to `'t'`, so a suppressed
  headline metric past n = 25 can no longer stamp `'z'` on a serialized report.
- `runner/stopping.test.ts` gains a `productionStoppingRule` block asserting that the loop control's
  half-width equals the published one at n = 10, 25, 26 and 200, and that it is strictly wider than
  the doc's crossover past 25. That block, not a docstring, is now what owns the decision.
- `runner/fixtures.test-helper.ts`'s `docHalfWidth` double keeps the crossover **on purpose** — an
  estimator whose family differs from the shipped one is what proves `halfWidthStoppingRule` records
  the estimate verbatim instead of re-deriving it. Its docstring now says so.
- **Hand-back to the orchestrator:** `docs/03-traffic-and-statistics.md` § Part 3's four-line rule
  still reads `t[n-1]` for `n ≤ 25` and `z[conf]` above. It must become `t[n-1]` at every `n`, or
  state that the crossover is a description of the literature and not of this simulator. `docs/` is
  not T6's to edit.
- **`normalQuantile` is left exported with no production caller, and that is now a stated claim.**
  Deleting `halfWidthQuantile` removed its last one. It is kept because it is the reference
  `studentTQuantile` is validated against (`studentTQuantile(p, 1e6)` must converge on it, and the
  published interval must stay strictly wider than it past n = 25) and because
  `statistics.test.ts` pins it against the `Z_95 = 1.959963984540054` literal
  `benchmark/verdict.ts` hard-codes for replication planning — the one `z` left in the repository.
  Both reasons are in its docstring, with an instruction to delete rather than widen them.
- No replication count in the suite changed: `productionStoppingRule` already injected
  `estimateMean` before this change. This decision removes a dead alternative, it does not alter
  behaviour.
