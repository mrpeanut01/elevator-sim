# Test matrix

> ## ↩️ Wave 11 — coverage added, and the two shapes it found that a matrix row cannot express
>
> Wave 11's coverage is in [`WAVE11_PLAN.md`](WAVE11_PLAN.md) § 4 lane by lane. Two findings belong
> *here* rather than there, because both are about what a coverage table can and cannot claim.
>
> **1. A fixture-only row is not a covered row.** Every assertion in `mode/disclosure.test.ts` handed a
> suppression ground in directly, so the whole block was green for a commit while the shipped screen
> rendered something else ([§ D185](DECISIONS.md)). A row reading *"Basic shortens a suppression
> reason — ✅ tested"* would have been **true about the test and false about the product**. This file's
> own opening rule — *a component test does not close a row* — has a second half it did not state:
> **a row is closed by a case that originates in a real run**, because a fixture proves the mechanism
> is correct and cannot prove it is reached.
>
> **2. A row can go stale while every sentence it supports stays true.** `docs/05`'s Pareto-front
> table published three arms where the tree computes six, for four days, and nothing caught it —
> because `nearest-car`'s 6-of-8 count, which is what § D106 and the refusal of an eco score actually
> rest on, never moved ([§ D184](DECISIONS.md)). That is [§ D149](DECISIONS.md)'s rule arriving at a
> table instead of a figure: **a stale number that still supports its own sentence is the only kind
> nobody re-checks.** The fix was not a row; it was a guard that re-derives the table from the run the
> suite already pays for.
>
> Wave 10's rule below is unchanged and carried every wave-11 control that shipped.

> ## ↩️ Wave 10 — the design handoff. This matrix stays retired in place; wave 10's coverage is in [`WAVE10_PLAN.md`](WAVE10_PLAN.md) § 5.
>
> Wave 10's own standing rule is this file's, one level down. This file says *a component test does
> not close a row, because this project's dominant defect class passes every component test it has*.
> Wave 10 applies that to the four editors the handoff adds: **every control has a test that moves it
> and requires the resulting run to differ**, compared on the legs — who was carried by which car and
> when — and never on a window statistic, because a summary over the peak five minutes can
> legitimately be equal for two visibly different runs.
>
> It found three defects that way ([§ D177](DECISIONS.md)): a dwell control writing a field that does
> nothing under the default door policy, a default lever silently rewriting a shipped dispatcher, and
> a *load sensor off* value the model layer rejects. None of the three would have failed a component
> test of the control.

> ## ↩️ The delivery reopened 2026-07-28 as **wave 5**, and this matrix stays retired in place.
>
> Two of the three items it left carried forward are wave-5 scope and are being worked now: the
> **four ⚠️ unverified UX rows** (T39, driven against a dev server serving its own worktree) and
> **C7**, which closed after this file was written. The third — the full experiment matrix — landed
> in `f895a16`.
>
> Wave 5's coverage is tracked in [`WAVE5_PLAN.md`](WAVE5_PLAN.md) § 5 and
> [`AGENT_STATUS.md`](AGENT_STATUS.md) § Wave 5. Its standing rule is this file's own: **a component
> test does not close a row**, because this project's dominant defect class passes every component
> test it has.

> ## 🏁 FINAL STATE of waves 1–4 — 2026-07-28. This section is closed and is no longer updated.
>
> **What it was for.** Scenario-level coverage during the orchestrated completion of this project.
> It exists because component tests alone do not close a row: this project's dominant defect class —
> *configurable, unit-tested in isolation, dead in the shipped path* — passes every component test
> it has, **nine times over in code and once in `data/`**.
>
> **Where the live information is now.** [`docs/05-roadmap.md`](docs/05-roadmap.md) carries each
> phase's acceptance verdict and the measurements behind it;
> [`docs/07-handoff.md`](docs/07-handoff.md) § 3 lists the permanent guards and why each exists, and
> § 8 lists the open debt. This file is kept because it records *how* the coverage was assembled and
> because `packages/viz/UX.md` cites § 3 of it.
>
> **Its own carried-forward items, at close:** every row below is ✅ except three, and all three are
> stated rather than quietly ticked — **C7** (two holes in `core`'s dead-code scanner, still open),
> the four ⚠️ unverified UX rows, and the full experiment matrix (⬜, the one track between Phase 8
> and acceptance). The two rows that were ❌ or ⚠️ when this file was last written — `fuzz-1000384`
> and the unpinned refuted mechanism — are **both closed**, and are marked so below.
>
> > **Since close:** the full experiment matrix **landed** (`f895a16`) and its row below is ✅;
> > **Phase 8 is accepted** ([`DECISIONS.md` § D108](DECISIONS.md)).
>
> > ### ✅ **Final disposition of the three, after the closing wave (2026-07-28)**
> >
> > - **The full experiment matrix** — landed, ✅ below.
> > - **C7** — **CLOSED.** Both scanner holes fixed, both watched failing first, **no new dead
> >   exports surfaced**, allowlist unchanged in both directions. The second hole had made an
> >   existing assertion *unfalsifiable*, which is worse than a missing one because it reads as
> >   coverage. [`DECISIONS.md` § D114](DECISIONS.md).
> > - **The four ⚠️ UX rows** — **unchanged, and still not passing.** `RV-11`, `RV-17`, `RV-21`,
> >   `KB-14`, built and reachable, neither driven nor tested. Confirmed against
> >   `packages/viz/UX.md` § 7.0 after its edits landed: the ledger is now **88** rows, **79 ✅**,
> >   and § A.3's **Success** and **Saturated** rows were found *false* rather than unverified and
> >   are re-marked ([§ D111](DECISIONS.md)).

Legend: ⬜ not started · 🟡 in progress · ✅ passing · ❌ failing · ⚪ n/a

**Suite at close, measured on `docs/handoff` 2026-07-28: 168 files, 3,138 tests (3,130 passing,
8 skipped), 460 s, `tsc -b` clean.**

> **Superseded, and left standing as the close-of-delivery record.** Phase 8's eighth track landed
> after this board was retired (`f895a16`) and added 34 tests and one skip. Measured on
> `docs/drift-sweep` 2026-07-28: **172 files, 3 172 tests (3 163 passing, 9 skipped)**, `tsc -b`
> clean. The runtime is not restated because it is load-dependent and this board's 460 s was never
> reproducible as a property of the code — see [`docs/07`](docs/07-handoff.md) § *Running it*.
>
> > **Superseded again, at true close.** The closing wave added 48 tests in no new files. Measured
> > on `docs/final-truth` 2026-07-28: **172 files, 3 220 tests (3 211 passing, 9 skipped)**,
> > `tsc -b` clean, exit 0. +19 from [§ D111](DECISIONS.md) and +29 from
> > [§ D112](DECISIONS.md) / [§ D114](DECISIONS.md), accounted test by test.

---

## 1. Wave 1 — correctness foundation

| Flow / behaviour | Test type | Scenario | Owner | Status |
|---|---|---|---|---|
| Phase 7 tuning reachable from the package surface | integration | every `tuning/` entry point has a non-test importer; `@elevator-sim/experiments` re-exports them | T1 | ✅ |
| CLI `tune` runs a real search | e2e | `sim -- tune` on a shipped building produces a candidate and a held-out verdict | T1 | ✅ |
| CLI `tune` — invalid input | e2e | unknown building / unknown profile / n below the resolution floor → clear error, non-zero exit | T1 | ✅ |
| Experiments dead-code audit | mechanical | every export of `tuning/{search,space,report}` has a real importer or an allowlist entry stating why | T1 | ✅ |
| Published paired interval uses t(n−1) | unit | `pairedDifferenceEstimate` at n=26 → `method:'t'`, `df:25`; Monte-Carlo coverage ≥ 95% | T2 | ✅ |
| Sequential stopping keeps its own z crossover | unit | **superseded by D14** — `halfWidthQuantile` is deleted and the rule is Student-t at every `n`. The assertion is now that the rule and the report use the *same* estimator | T2 → T6 | ✅ |
| `compare` distinguishes identical from indistinguishable | e2e | `--a eta --b eta` → names the case identical, does **not** print "Raise --reps" | T2 | ✅ |
| `compare` reproduce line reproduces | e2e | parse the printed `reproduce:` line, re-run it, assert byte-identical verdict | T2 | ✅ |
| Every search-space dimension is live | integration | for each dimension, two profiles differing only in it produce different trajectories on ≥1 shipped building — or the dimension declares why not, with an executed proof | T3 → T7 | ✅ |
| `idle.predictorHorizonS` | integration | ungated and allowlisted, with a proof obligation on the gate (D21) | T3 → T7 | ✅ |
| `answer.reopenOnLateArrival` | integration | implemented, ships `false`, and its price is a measurement rather than a figure from a diverging queue (D9, D25) | T3 → T7 | ✅ |
| `answer.overloadThreshold` | integration | range narrowed to `[designLoadFactor, 1.5]` (D10) | T3 | ✅ |
| Double-deck cars | integration | not simulated; `loadConfig` warns, the warning reaches `SimulationResult.warnings`, `RunRecord` and the CLI report (D11, D22, D23) | T3 → T7 | ✅ |
| `patternSwitching` | integration | **recorded as deliberately unimplemented** and the roadmap bullet marked not-done (D12) | T3 | ✅ |
| Doc claims match code | consistency | phase set agrees across `CLAUDE.md`, `README.md`, `docs/07-handoff.md`; docs' JSON examples parse and satisfy their gates; docs/01's module tree matches disk in both directions; docs/03's formulas evaluate against `roundTripTime()` | T4 | ✅ |
| Published study intervals re-derive | mechanical | every interval-shaped literal in `benchmark/` is either reproduced by a pinned estimate at its own printed precision, or declared unpinned with a count | T9 | ✅ |
| `core` builds and tests with `viz` absent | build | invariant 6, in its strong form once `viz` exists | T5 | ✅ — **C28 closed.** `moduleTree.test.ts` is scoped to installed workspace members; verified by deleting and deregistering `packages/viz` in a scratch copy (`tsc -b` clean, `core` 77 files / 1 832 tests green), with the pre-fix guard reddening on the same copy |
| Stored run replays visually identically | integration | replay from a stored seed reproduces the same frame sequence, with a per-field negative control | T5 | ✅ |
| **The first frame places every car where the run says it started** | integration | the raised Phase 4 clause (**C16**), asserted on all five buildings by `describe.each(BUILDING_IDS)` | T8 | ✅ |

## 2. Regression — must stay green through every merge

| Guard | What it protects | Status |
|---|---|---|
| `core/src/sim/seam.test.ts` | behavioural liveness of dispatch behaviours | ✅ |
| `core/src/dispatch/deadCode.test.ts` | mechanical dead-export audit | ✅ — **C7 closed**: both scanner holes fixed and watched failing first, no new dead exports surfaced, allowlist unchanged in both directions ([§ D114](DECISIONS.md)) |
| `experiments/src/index.test.ts` § study entry points | every study in `STUDY_ENTRY_POINTS` — **derived from the `benchmark/` directory**, not a hand-written list — has a non-test, non-barrel caller | ✅ — added by the closing wave, after the whole `'no-intervals'` half of `benchmark/` was found dead ([§ D114](DECISIONS.md)) |
| `experiments/src/tuning/deadCode.test.ts` | the same audit for `tuning/{search,space,report}` | ✅ |
| `estimateCost` purity (3 guards) | invariant 1 | ✅ |
| No global RNG / no wall-clock in `core/` | invariants 2, 3 | ✅ |
| Closed-form RTT oracle | correctness oracle | ✅ — now across **all five** buildings |
| CRN determinism — same seed, bit-identical paired differences | invariants 4, 5 | ✅ |
| `benchmark/published.test.ts` | a published number cannot appear without a study behind it, nor change in silence | ✅ |
| `viz/src/boundaries.test.ts` | invariant 6, plus the no-DOM rule with positive controls (D66) | ✅ |
| `core/src/browser.test.ts` + the import-graph guard | no `node:` builtin reachable from the browser barrel (D31–D33) | ✅ |
| `core/src/sim/moduleTree.test.ts` | `docs/01`'s module tree against disk, both directions, scoped to installed packages | ✅ |
| `experiments/src/validation/documentation.test.ts` | phase-set agreement across three documents, `docs/07` against itself, README's doc table, the roadmap's entry points, **and the refuted mechanism at all seven sites** | ✅ |
| `experiments/src/benchmark/saturationCensus.test.ts` | an operating point excluded by its **ceiling** reported as if excluded by its **answer** | ✅ |

## 3. UI scenarios — the live ledger is the shift viewer's, and it is not green

> **The Phase 4 board that stood here is retired, not deleted.** It counted 87 rows against the
> **five-tab instrument panel** — Run viewer, Building editor, Parameters, Compare, Campaign — that
> wave 10 replaced with the three-column shift surface. Those rows and their marks are kept
> verbatim at `packages/viz/UX.md` §§ 1–7, at their original section numbers, because seventy-odd
> source files and a dozen documents cite them; the old board is reproduced at the bottom of this
> section for the record. **Nothing below claims a mark that ledger does not carry.**

**The inventory is [`packages/viz/UX.md`](packages/viz/UX.md); its live per-surface ledger is
§§ 9–24 there and its count is § 25.** Sixteen surfaces, **219 rows**, ids `SH- LR- CO- SG- TP-
DR- SC- RR- DE- TE- ME- BE- IS- MD- KX- RX-`.

| State | Rows | Where they are |
|---|---|---|
| ✅ **run** — every clause driven in a browser, or driven where the remaining clause is `✅ test` | **81** | `SH` 15 · `TP` 14 · `KX` 12 · `RX` 7 · `SG` 6 · `DR` 5 · `CO` 5 · `LR` 4 · `RR` 3 · `MD` 3 · `SC` 2 · `BE` 2 · `DE` 1 · `ME` 1 · `IS` 1 |
| ✅ **test** — the whole row asserted, and the drive did not reach it | **106** | `BE` 21 · `LR` 17 · `DR` 10 · `DE` 9 · `SG` 8 · `TE` 7 · `SC` 6 · `RR` 6 · `IS` 6 · `MD` 6 · `ME` 5 · `KX` 2 · `RX` 2 · `SH` 1 |
| ✅ + ⚠️ — one clause established (by test or by drive), another still unverified | **20** | `SH` 3 · `SG` 3 · `KX` 3 · `IS` 2 · `RX` 2 · `CO` 1 · `TP` 1 · `SC` 1 · `RR` 1 · `TE` 1 · `ME` 1 · `BE` 1 |
| ⚠️ **unverified** — built and reachable, neither driven nor covered | **8** | `CO` 2 · `SH` 1 · `LR` 1 · `SG` 1 · `TP` 1 · `DE` 1 · `MD` 1 |
| 🔲 **not built, inert, or failing its own condition** | **4** | `TP-08` · `TP-10` · `DR-13` · `RR-11` — all four **found by the drive** and filed, not fixed |

These five counts are **derived from `UX.md`'s own tables**, not tallied by hand, on the rule *a row
carrying `🔲` is not built; a row carrying both `✅ test` and `⚠️` is half; a row carrying one is
that one.* Editing a row's marks makes this table wrong until it is re-derived.

> **Re-derived 2026-07-30 (wave 12), counted from `UX.md` §§ 9–24's mark cells after the wave-12 row
> updates (struck-through history spans excluded).** The table read *117 / 40 / 55 / 7* until this
> date. Six of the seven `🔲` rows are closed by a fix **with a test**, per-row: `SG-15` — the bank
> filter wired through `buildLayout` with the § D177 legs-of-the-picture test and the visible
> *showing N of M* caption ([§ D187](DECISIONS.md)); `SH-12` / `KX-11` — `Escape` closes the drawer,
> deliberately inert in column mode ([§ D188](DECISIONS.md)); `KX-10` — fixed-seconds seek and
> <kbd>Home</kbd>/<kbd>End</kbd> via `seekActionForKey` ([§ D188](DECISIONS.md)); `SH-09` — URL
> write-back at the `renderAll` chokepoint, round-trip tested ([§ D189](DECISIONS.md)); `TP-13` —
> `copy run` emits `--traffic`/`--template`, driven bit-identical to the CLI route at 10 of 10
> cells, or refuses with named reasons ([§ D190](DECISIONS.md)). Each carries `✅ test` on its
> mechanism and `⚠️` on its listener/browser half — **the § 26 browser re-drive is owed in the drive
> phase, so none carries `✅ run`**. `RX-03` is the one remaining `🔲`, expected to graduate from
> finding to fix during the drive phase. `ME-07` and `CO-02` moved `⚠️` → `✅ test` on
> [§ D191](DECISIONS.md): the machines-editor suite drives the **fit path** — the naive fit-less
> path would have called a live control dead — and `CO-02`'s DOM change-listener half stays `⚠️`
> for the drive phase.

> **Re-derived 2026-07-30 (drive phase), counted from `UX.md` §§ 9–24's mark cells after § 26 was
> executed in a real browser (Chromium via Playwright).** The table read *0 / 118 / 47 / 53 / 1*
> until the drive. 81 rows now carry `✅ run` with one-line evidence each in the ledger; the six
> wave-12 fix rows (`SG-15`, `SH-12`/`KX-11`, `KX-10`, `SH-09`, `TP-13`) all confirmed green in
> the browser, with one defect filed beside `SH-09` (the opening seed never reaches the address
> bar until the first interaction). `RX-03` was reproduced at 375×667, fixed in `5d4b782`
> (stylesheet-only, pinned by `surfaces.test.ts`; no caller-less breakpoint constant), and
> re-driven green. The four `🔲` ids are **new, found by driving** — `TP-08` (a non-numeric seed
> silently becomes seed 0), `TP-10` (Save writes `{recording, frames}` and Load requires a
> top-level `schemaVersion`, so the product refuses its own artifact), `DR-13`
> (`reportPanel.ts:400` and `main.ts:1359` both wire `#report-next-day`, so one press advances two
> days), `RR-11` (below 1340 px the open drawer overlays `#drawer-toggle`, so pointer-only readers
> cannot close it) — the fourth consecutive pass in which driving found what reading and the suite
> had both passed. `TP-17`, `SG-17`, `MD-07` and `DE-11` could not be provoked through the shipped
> UI and stay `⚠️` with that stated.

**The 40 half rows are the two rules at the top of this file arriving at the same place.** *(47
since the wave-12 re-derivation — the six fixed `🔲` rows and `CO-02` joined this bucket, each
tested on its mechanism and unverified on its listener.)* Rule
one: *a component test does not close a row.* Rule two, from wave 11: *a row is closed by a case
that originates in a real run, because a fixture proves the mechanism is correct and cannot prove
it is reached.* Every one of those 40 is a surface whose **decision** is asserted and whose **DOM
writing or event listener** is not — and that is not an oversight anybody could tidy away:
`packages/viz/src/honesty/derive.test.ts` excludes the DOM half of **all eight** mounts by name,
with the reason stated as *"weaker than driving them … a limitation rather than coverage."* A plain
`✅ test` on those rows would claim exactly what that exclusion refuses to claim.

**Why the ⚠️ column is 59 rows.** *(The number 59 was wrong when written: the derived table above
said **55** at the time, and re-deriving on 2026-07-30 — counted from `UX.md` §§ 9–24's mark cells
after the wave-12 edits, struck history spans excluded — gives **53**, `ME-07` and `CO-02` having
left the bucket on [§ D191](DECISIONS.md). Nothing reconciled this heading against the table it sits
under until wave 12; the sentence below stands, and is still the right explanation of the column.)*
`packages/viz/src/dev/main.ts` is 1 394 lines and holds every
event listener in the viewer. `main.test.ts` exists — it did not when wave 10 landed — but its
three blocks are entirely about the wait-age legend. Forty-odd `addEventListener` calls,
`drawHeader`, `drawFooter`, `drawCoach`, `drawStage`, `drawTransportChrome`, `runShift`, `adopt`,
`closeShift`, `applyDeepLink` and `randomSeed` have no test at all.

**Three of the seven 🔲 rows were found by reading and have not yet been driven** —
`SG-15` (the bank filter writes a binding the renderer never reads), `SH-09` (no
`pushState`/`replaceState` survives, so nothing writes the URL back) and `RX-03` (the left rail
never yields; there is no stacked layout below 768 px). They are stated as findings-from-reading.
`UX.md` § 26 is the ordered list of what to drive, highest risk first, and those three lead it.
*(Wave 12, 2026-07-30: `SG-15` was then confirmed inert **by driving** before being wired
([§ D187](DECISIONS.md)) and `SH-09` was built ([§ D189](DECISIONS.md)) — see the re-derivation
note above; `RX-03` remains, deferred to the drive phase. The § 26 list still leads with the two
fixes, now as re-drives to confirm.)*

The scenario classes this matrix demands of every UI feature — happy path, alternate valid path,
invalid input, empty state, loading state, failure and recovery, keyboard and focus, responsive
behaviour — are what the sixteen surfaces enumerate, one cycle each.

> ### 🏁 Retired — the Phase 4 board, as it stood at wave 9
>
> Against `packages/viz/UX.md` §§ 1–7, which are unchanged. **87 rows** on this board; the ledger
> there reached 90 after `T48`. Kept because the ids are cited from source and because § 4's
> `ED-01`…`ED-25` describe the **document editor**, which wave 10 kept whole and moved beneath the
> building editor's elevation — those rows still describe a live surface, and it is the *route* and
> the `✅ run` marks that are stale (`UX.md` `BE-23`, and § 26 item 20 is the pass that would
> re-establish them).
>
> | State | Rows | Ids |
> |---|---|---|
> | ✅ **wave 1** | 32 | `RV-01 04 05 10 12 13 15 16 19` · `PB-01 02 03 04 05 06 10 11 12 13 14` · `ED-11` · `KB-02 03 04 05 08 09 10 15` · `RS-01 06 07` |
> | ✅ **run** — driven in a browser against the shipped `data/` | 34 | `RV-02 03 06 07 09 20` · `PB-07 08 15 16 17 18` · `ED-01 02 04 05 06 10 18 19 20 21 22` · `KB-01 06 07 11 12 13 15a` · `RS-02 03 05 08` |
> | ✅ **test** — asserted, and the assertion proved to bite | 12 | `RV-08 14` · `ED-03 07 08 09 14 15 16 17` · `KB-15b` · `RS-04` |
> | ✅ + ⚠️ — one clause each way | 2 | `RV-18` (editor half run, viewer half unverified) · `ED-23` (in-app half run, `beforeunload` unverified) |
> | ⚠️ **unverified** — built and reachable, neither driven nor tested | 4 | `RV-11` `RV-17` `RV-21` `KB-14` |
> | 🔲 **re-marked** — the row contradicts the schema, stated rather than papered over (**C30**) | 2 | `ED-12` `ED-13` |
> | 🔲 **not built** | 1 | `PB-09` (window selection then loop) |
>
> The four ⚠️ rows were closed by `T39` and the seven ⛔ keyboard rows all reached ✅ — against
> *that* viewer. **Four of this board's rows are now known false of the shipped one**, and each has
> a successor that says so rather than quietly re-marking the old row: `RV-03`/`RV-T2` → `SH-09`;
> `RS-05` → `SG-15`; `RS-03` → `RX-03`; `KB-04`/`KB-05` → `KX-10`. `RV-T7` is unchanged and still
> unmet, carried forward verbatim as `TP-13` and in [`GAPS.md`](GAPS.md).

## 4. Phase 8 — testing campaign

| Track | Proves | Status |
|---|---|---|
| Property-based fuzzing | no passenger lost, none delivered to the wrong floor, no car over capacity, no negative waits, no deadlock, bounded starvation | ✅ built — 64-case always-on corpus (0 violations), 2 000-case deep tier (**0 violations**; the one it found is fixed) |
| Analytical cross-validation | closed-form agreement across all five buildings | ✅ `oracle/fiveBuildings.test.ts`, `bankCensus.test.ts`; three banks recorded as unmeasurable with mechanisms rather than reconciled (D39) |
| Physics verification | S-curve times vs hand calculations; degenerate short hops | ✅ `validation/physics.test.ts` |
| Statistical self-validation | Phase 3 results re-run as regression | ✅ `crnVarianceReduction`, `nullComparison`, `sequentialStopping`, `operatingPoint` |
| Determinism regression | golden runs replay byte-identically from stored seeds | ✅ `validation/goldenRuns.test.ts`, `fuzz/determinism.test.ts` |
| Scale & performance | large buildings, long sweeps, memory profile | ✅ `validation/perfScaling.test.ts` — always-on tier asserts **simulation outputs** (legs, kernel events); wall-clock gates are `ELEVATOR_SIM_DEEP=1` (D91) |
| Adversarial edge cases | saturation, single car, all calls one floor, access lockout, all cars out of service, mid-run mode changes | ✅ `validation/adversarial.test.ts`, `fuzz/faults.test.ts` |
| Full experiment matrix | every dispatcher × building × traffic; Pareto front over (AWT, energy, WT95) with explicit INDISTINGUISHABLE verdicts | ✅ **landed after this board was retired**, in `f895a16` — `benchmark/matrix.ts` + `matrix.test.ts` (8 cells × 12 profiles, per-cell derived budgets n = 50…200), `benchmark/matrixCensus.test.ts` (opt-in census), `benchmark/phase7Acceptance.ts` (Phase 7's interval at n = 150 on disjoint seeds). **Phase 8 is accepted** (§ D108) |

### Findings from the campaign — all four closed

| # | Finding | Status |
|---|---|---|
| 1 | A published mean beside an abandoned passenger — `fuzz-1001074`, max wait 922.7 s with `awtIsValid: true` | ✅ fixed — a fourth `awtIsValid` ground |
| 2 | An out-of-service car parked at an occupied landing threw out of `run()` and killed the run | ✅ fixed — `#carCanCarry` and `#park` |
| 3 | P5 termination blind to a fleet that never moves at all — 0 of 365 journeys, zero violations | ✅ fixed by strengthening; the bound was not moved |
| 4 | **`fuzz-1000384`** — 1 694.3 s of fleet inactivity with a servable journey outstanding; 592 identical dispatches to a car that had left group control | ✅ **fixed** — a promise a withdrawn car cannot keep is revoked (§ T22-D1). `deadlockIdleBoundS` untouched at 600 s, `PROPERTY_BOUNDS` unchanged line for line, 60 of 60 shipped cells byte-identical. **R22 discharged** |

## 5. Phase 6 — destination dispatch

| Flow / behaviour | Scenario | Status |
|---|---|---|
| The gate metric | TTD beats the baseline with a paired-t interval excluding zero (D27) | ✅ 6a `−1.562 [−1.916, −1.208] s` |
| The reporting clause | AWT and WT95 carry explicit verdicts, including WORSE | ✅ 6a AWT `+0.514`, WT95 `+1.010`, both WORSE and both published |
| Disclosure is worth zero until something prices it | the **`destination-eta-unpriced`** arm vs `eta` on an unzoned building | ✅ 150/150 paired differences exactly zero, every metric. *(This control was the **shipped** `destination-eta` until [§ D112](DECISIONS.md) authored `weights.rideTime: 0.5`. It is now bound to the **configuration** rather than to the id: measurement unchanged, only the name moved. Left bound to the id, the shipped profile's new weight would have falsified this row by a pin regeneration alone.)* |
| Coverage under access control (H-ACCESS-1) | conventional dispatch cannot serve `secure-tower` interfloor traffic at any budget | ✅ 0/30 quotable, 33.5 % unserved, vs 30/30 and 0.00 % |
| Optimization under access control (H-ACCESS-2) | difference-of-differences across two buildings | ✅ measured, and it **REFUTES** the roadmap's mechanism: `+0.982 [+0.584, +1.380] s` |
| Every leg promised, promise kept, promise bites | zero wrong-car boardings on 5 buildings; 70 of 96 legs board a different car than under conventional dispatch | ✅ `sim/destinationDispatch.test.ts` |
| The panel's cost where it binds | Midtown interfloor-mix 4.5 %, D − C | ✅ TTD `+5.94` WORSE, WT95 `+37.34` WORSE, ride `−1.02` BETTER |
| `compare` refuses to gate across passenger models | two arms with different models → headline moves to TTD, `core`'s nine-metric list printed | ✅ `cli/src/cli.test.ts` |
| The refuted mechanism is pinned by a test | the seven mechanism sites stay corrected | ✅ **built** — `validation/documentation.test.ts`, three ways: a claim with no refutation within 400 chars fails, a deleted correction fails, and `estimateCost.ts`'s exclusion is asserted in both directions. All three watched failing. **C23 closed** |
| **The criterion measured on the building it names** | Phase 6's gate on `mixed-use-high-rise`, which § D27 dropped and § D99 owned | ✅ `benchmark/mixedUseHighRise.test.ts` + `saturationCensus.test.ts`, 72 pins. **Met by Level 0** (ΔTTD −21.239 / −2.072 / −2.116, all BETTER); **not met by Level 1** at any measured point |
| The building's own scenario admits no paired comparison | mixed 40/30/30, every `role:"baseline"` profile 0/30 quotable, unserved **rising** as load falls | ✅ measured, reported as counts and never as an interval |
