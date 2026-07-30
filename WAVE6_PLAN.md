# Wave 6 — closing Phase 6, and the register with it

> ## 🏁 CLOSED 2026-07-28. Twelve lanes merged; **no phase verdict moved, and that is the result.**
>
> **Measured serially on an idle machine after the last merge** — the only condition under which the
> number means anything: `npx tsc -b` clean, **190 files / 3 505 tests, 3 496 passed, 9 skipped**,
> exit 0, 473 s. Baseline was 179 / 3 353.
>
> **The first serial run was RED**, and this record says so before it says anything else:
> `2 failed | 3 494 passed`. Neither failure belonged to a lane. `runner/deadCode.test.ts` caught an
> allowlist entry that had outlived its reason; `benchmark/matrix.test.ts` caught **176 stale pins**,
> all on `vertical-city-up-peak` and none elsewhere — the old numbers described single-deck hardware
> on a building that has always declared eight double-deck cars. **Both guards fired on staleness no
> lane could see from inside its own scope**, which is the argument for having them.
>
> ### The four deferrals, all measured, none rounded up
>
> | | |
> |---|---|
> | **Phase 6c** | **Implemented, measured, NOT ACCEPTED.** ΔTTD `−0.213 [−0.440, +0.014]` — an interval containing zero, against a criterion recorded *before* the code existed ([§ D139](DECISIONS.md) → [§ D145](DECISIONS.md)). The search is not what failed: pointed at the deadband whose answer was known, it returned 1.490–1.874 s against a shipped 8 s |
> | **Double-deck** | **Simulated and benchmarked to a DISPATCHER-DEPENDENT verdict** — WORSE under `eta`, BETTER under `collective`, one cell permanently unresolvable. **There is no verdict of the form *double-deck is better*** ([§ D131](DECISIONS.md), [§ D147](DECISIONS.md)) |
> | **Phase 9** | § 13's eight questions answered, five by measurement; **W4 built** and proved generic against a schema the product does not ship; `C34` closed 0 → 3 callers ([§ D133](DECISIONS.md), [§ D134](DECISIONS.md)) |
> | **`moveFloor`** | The declaration list has its own view, driven in a browser. Its caller count did **not** move, 1 → 1, and the lane declined to claim it did ([§ D135](DECISIONS.md)) |
>
> **Phase 7's last undelivered bullet also landed** — the fuzzy detector ships and drives a run, and
> its interval **excludes zero and is still reported below the resolution limit**. That was the
> wave's easiest over-claim ([§ D143](DECISIONS.md), [§ D140](DECISIONS.md)).
>
> ### § 6's condition of done was the right condition
>
> **Fourteen items closed, thirteen opened.** The largest opened is a modelling limit found only by
> benchmarking: the `G → 2` lobby hop is charged as an elevator leg because `core` has no escalator
> or stair, which is why the WORSE-under-`eta` row is an **upper bound** rather than a figure.
>
> ### Six places the register was wrong about itself — every one optimistic
>
> A `C4` finding already closed · that finding being **ten places, six of them false about the
> code** · its reachability claim · **`withCallType`'s row wrong on both halves** (it was never a
> weak seam) · nine dead seams that were ten and are now eleven · and `garden-down-peak`'s "open
> question" whose answer is **yes**. Plus a seventh about the guards: **`published.test.ts` missed a
> stale published figure at both layers by construction**, and the figure moved from 51.7 % to
> 100 % with nothing going red, because the test asserted inequalities and every one held *more*
> strongly.
>
> ### § 4's concurrency rule, scored
>
> Three lanes at a time, never eight. **No lane stalled, no lane ran a repository-wide suite, and no
> `pkill` was issued.** Load peaked around 9 against wave 5's 198. Four lanes reported a failure
> outside their own files and **refused to diagnose it** — in every case correctly, and in one case
> the transient was another lane mid-edit in the shared tree.
>
> ### § 7's risks, scored
>
> All seven were real. **CRN survived** — the selector draws from no stream, measured against golden
> runs rather than reasoned about. **6c did not pass a gate it wrote itself** — the gate predates it
> and it failed. **Double-deck's blast radius held** at 48 of 60 byte-identical with the 12
> attributable. **The disclaimer was not over-retired** — three sites went, the analytical one was
> kept and strengthened. **W4's liveness came off a fictional schema.** And the corpus widening
> **found a real defect**, `C35`, opened and closed inside the wave.
>
> The plan below is as written at the opening and is left unaltered.


Coordination artifact for the delivery opened **2026-07-28** after `63186a8`. Authoritative for
wave-6 task scope, ownership, merge order and the definition of done.

[`WAVE5_PLAN.md`](WAVE5_PLAN.md) is the closed record of the previous wave and stays retired in
place, as [`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md) does for waves 1–4. This document continues
from both and supersedes neither.

**Baseline commit:** `63186a8` · **Integration branch:** `integration`

---

## 0. What makes this wave different from wave 5

Wave 5 was a debt wave: nine items closed, **no phase verdict moved, and none was ever in scope.**

Wave 6 moves verdicts. Four decisions were taken by the owner before any lane opened, and each one
converts a **standing deferral** into work:

| Deferral | Decision | Lane |
|---|---|---|
| Phase 6c — learned control | Build it as **learned weight selection**, gated on TTD | T45 |
| Double-deck — configured, not simulated | **Simulate it**, and retire the disclaimer | T44 |
| Phase 9 — designed, not built | Settle § 13, **build W4 only** | T47 |
| `moveFloor` — scope call handed back | **Give the declaration list its own view** | T48 |

That means this wave can fail in a way wave 5 could not: **by passing a gate it wrote itself.**
[`CLAUDE.md`](CLAUDE.md) § Working agreements and § D27 → § D99 are the standing warning — a
criterion may be raised, never weakened, and this project has weakened one once already, by
accident, inside a decision whose stated purpose was to strengthen it. § 6 below is the mitigation.

---

## 1. The register as verified against the code, not as read

§ 8 of [`docs/07-handoff.md`](docs/07-handoff.md) lists seven live items. Checked against the tree
at `63186a8` before planning, **two of the seven are not as recorded**:

| Item | As recorded | As found |
|---|---|---|
| **Three findings from the `C4` measurement** | three open | **Finding 1 is already closed.** `validation/sequentialStopping.test.ts` reads `t[n−1]` back out of the shipped `estimateMean` (`:60–68`); the hard-coded `z90` is gone. The handoff's own closing blockquote says a concurrent session did this; the § 8 row was not updated to match |
| **`C4` finding 2 — `StoppingVerdict`'s stale docstring** | one place | **Four places.** The deleted § D14 family — `'t'` for `n ≤ 25`, `'z'` past it — survives at `runner/types.ts:43–48`, `runner/types.ts:688`, `runner/stopping.ts:8–9` and `runner/stopping.ts:695–696`. The same blockquote reports this one closed. It is not |

Both are recorded here rather than quietly corrected, because *"the register says X"* and *"the code
says Y"* being different sentences is the whole reason this project keeps a register at all. The
remaining five items are as recorded.

---

## 2. Lanes, ownership, and the one seam that has an owner

**Every lane names its integration seam and its non-test caller before it writes a line.** This
repository has shipped **ten** defects of the shape *configurable, unit-tested in isolation, dead in
the shipped path* — nine in code and one in `data/` — and the rule is not *"is it reachable?"* but
**"name the non-test caller"** ([`docs/07`](docs/07-handoff.md) § 3).

| Lane | Scope | Owns | Seam, named in advance |
|---|---|---|---|
| **T41** | `C33` + the `C4` residue | `experiments/src/reports/`, `experiments/src/runner/` | none new — narrows a type and corrects four docstrings |
| **T43** | `deepCampaignRequested`, `withCallType`, `destination-entry` | `experiments/src/fuzz/` | `cli/src/commands/fuzz.ts` for the first two, or a recorded exemption in the § D125 manner |
| **T44** | Double-deck simulation | `core/src/{model,sim,config,analytical}/` | `Bank.assignDeck` ← `sim/simulation.ts`, **counted in a real run** |
| **T45** | The weight-set selector: mechanism, fuzzy policy, learned policy | `core/src/dispatch/`, `data/dispatcher-profiles.json`, `experiments/src/benchmark/` | `selectWeightSet` ← `sim/simulation.ts`, **counted in a real run** |
| **T47** | `docs/10` § 13, W4, `C34` | `viz/src/controls/`, `experiments/src/browser.ts`, `docs/` | W4's control renderers are `browser.ts`'s first non-test caller |
| **T48** | `moveFloor`'s declaration view | `viz/src/editor/`, `viz/src/dev/` | the declaration-order view is `moveFloor`'s first non-test caller |
| **T49** | `garden-down-peak`'s identity class | `experiments/src/benchmark/` | none — a measurement, not a mechanism |

### T45 is one mechanism, not two — and that is a design call this board is making

Phase 7's undelivered bullet (*a fuzzy traffic-pattern detector driving per-pattern weight sets*)
and Phase 6c (*learned control*) were on the register as separate deferrals. They are **two policies
over one mechanism**: both observe traffic state and choose a weight vector, and both need the thing
this repository does not have — [`docs/07`](docs/07-handoff.md) § 8's last row, *"a dispatcher
cannot be changed mid-run."*

Building that mechanism twice would give two answers to one question, which is the failure
`runner/metrics.ts`'s docstring names. So T45 builds it **once**, as a port, with two policies over
it, and both are **data** under invariant 7:

1. **The mechanism** — a weight-set selector consulted at decision time, with hysteresis, and a
   stated answer for what it does to common random numbers. **CRN is the risk here**, not the
   arithmetic: a selector that draws is a new RNG consumer and desynchronizes every paired
   comparison in the project. It must consume no stream, or a named one.
2. **The fuzzy policy** — reads the `patternSwitching` block already authored in `data/` and
   schema-validated and read by nothing. Note `weightSetsByPattern` names `energy-saver`, which
   **is not an authored profile**; `parse.ts` warns `unknown-weight-set-profile` and `loader.test.ts`
   asserts the warning. That dangling name is part of this lane's scope, not a surprise to hit later.
3. **The learned policy** — Phase 6c, per § 3 below.

---

## 3. Phase 6c's acceptance question, written before the implementation

§ D28 deferred 6c for three reasons, and the third is the binding one: *its acceptance criterion was
stated in the metrics 6b makes non-comparable.* So the criterion is stated here, **first**, and
recorded in `DECISIONS.md` before T45 writes the policy:

- **Arms.** The learned selector against the **best shipped profile at the same operating point** —
  not against `nearest-car`, which [`docs/07`](docs/07-handoff.md) § 4 shows is a poor reference arm
  and the only profile that saturates.
- **Metric — TTD, and only TTD.** `core`'s own `comparabilityOf` lists AWT and WT95 among nine
  metrics that stop being comparable across the two passenger models, and `compare` already refuses
  to gate on them across models. AWT and WT95 are **published beside** the verdict as costs, never
  folded into it — the same rule § D100 applied to Level 0 and Level 1, and the same rule
  [§ D106](DECISIONS.md) applies to energy.
- **Gate.** A paired-t confidence interval **excluding zero** on the better side, under common
  random numbers, at 50–200 replications sized to the operating point's own saturation ceiling —
  established from that cell's census, never inherited from a neighbouring module.
- **Generalization.** Tuned on one seed set, validated on a **disjoint** one, both printed, with a
  holdout verdict. Anything else overfits the policy to specific passenger traces.
- **The known-answer check.** The 2 s deadband ([`docs/07`](docs/07-handoff.md) § 5) stays shipped at
  8 s. A learned policy that rediscovers ~2 s blind has validated itself; one that returns 8 s has
  **failed, not agreed.**

**A failed gate is a result and is reported as one.** § 9 of the handoff: every phase so far has
needed a follow-up and none passed its gate clean first time, and that is evidence the gates are set
right. If the learned selector cannot clear this interval, 6c lands as *implemented, measured, and
not accepted* — which is a stronger outcome than a criterion bent to fit it.

---

## 4. Concurrency — the risk wave 5 did not name, and what it cost

Wave 5 ran **eight lanes on a 10-core machine**, each spawning a full vitest worker pool: load
average **198 with 31 vitest processes**, roughly 20× oversubscription. Two lanes stalled without
reporting, four committed nothing for tens of minutes, and one lane's stray unscoped
`pkill -f vitest/dist/workers/forks` killed *other* lanes' workers. A builder then saw `1 error` in
a package it had never touched and correctly **refused to say whether it was pre-existing**.

**Parallelise the work, serialise the measurement.** Wave 6's rules:

1. **At most three lanes run at once.**
2. **No lane runs a package-wide or repository-wide suite.** A lane runs *its own test files*, by
   path. The full suite is run by integration, alone, on an idle machine.
3. **No lane kills a process it did not start.** No unscoped `pkill`.
4. **A lane that sees a failure outside its own files reports it and does not diagnose it** — under
   concurrency it cannot tell pre-existing from cross-lane, and guessing is what wave 5 punished.

---

## 5. Merge order

Smallest blast radius first, so that a later lane's failure is attributable:

`T41` → `T43` → `T44` → `T45` → `T47` → `T48` → `T49` → integration.

T44 and T45 both touch `core` and both add a mechanism; T44 merges first because double-deck is
confined to the model and the selector reaches the dispatcher. T47 and T48 both touch `viz`; T47
first because W4 adds a directory and T48 changes an existing view.

---

## 6. Definition of done

A lane is done when **all** of these hold. Wave 5's § 5 made the last one a condition and it was the
right condition.

1. `npx tsc -b` clean.
2. The lane's own test files pass, run by path.
3. **Every new behaviour has a named non-test caller, verified with the repository's own scanner**
   — not asserted, not inferred from a barrel re-export or a `{@link}` tag.
4. **Every published number is pinned to the run that produced it.** If a lane writes a figure into
   a document, a test re-derives it.
5. **Every sentence about *why* something performs better is measured, or says it is unmeasured.**
   Seven places in this repository once asserted a mechanism that measurement refuted, and nothing
   went red.
6. A decision recorded in `DECISIONS.md` for anything the docs do not already cover.
7. **The debt register rewritten to what is actually left, including anything this wave opened.**
   A register that only ever shrinks is not being read honestly — five of wave 5's seven new items
   were found only by fixing something adjacent to them.

And for the wave as a whole: the four places the phase set is stated — [`CLAUDE.md`](CLAUDE.md),
[`README.md`](README.md) § Status, [`docs/05-roadmap.md`](docs/05-roadmap.md) and
[`docs/07-handoff.md`](docs/07-handoff.md) — must agree, which
`validation/documentation.test.ts` and `validation/phaseStatus.test.ts` assert.

---

## 7. Risks this board names in advance

| Risk | Lane | Mitigation named against it |
|---|---|---|
| **The selector desynchronizes CRN** and silently destroys every paired comparison in the project | T45 | It consumes no random stream, or a named one on the injected `StreamSet`. Asserted by re-running `validation/goldenRuns.test.ts` and a determinism check, not by reading the code |
| **6c passes a gate it wrote itself** | T45 | § 3 fixes the criterion before the implementation exists, and the 2 s deadband is the known answer the policy cannot see |
| **Double-deck changes numbers on buildings that have no double-deck car** | T44 | Blast radius measured: every shipped cell without a double-deck car must be **byte-identical**, in the manner § T22-D1's fix was checked (60 of 60 cells) |
| **Retiring the disclaimer over-claims** | T44 | `vertical-city/shuttle` stays oracle-unmeasurable for its **other three** stated reasons. Simulating the decks answers one of four blockers and the lane may not imply it answered them all |
| **Widening the fuzz corpus moves the seed → case mapping** and silently invalidates every pinned case | T43 | Re-pin deliberately and diff the corpus, as T36 did; run the deep tier at 2 000 and report violations as findings, never as bounds to move |
| **W4's liveness evidence is read off the shipped schema**, so a generated control looks live because the schema happens to fit it | T47 | The evidence is derived from a **fictional** schema the product does not ship |
| **A lane reports a green suite that is red** | all | § 9: reviewers run things. Integration re-runs the full suite serially and does not take a lane's word for it |
