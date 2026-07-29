# Wave 7 — the plan, and what it is allowed to conclude

**Opened:** 2026-07-28 · **Branch:** `integration` · **Base:** `da411ea`

## 0. The request, and what it actually reduces to

The instruction was *"complete Phases 1–7 completely."* Read against
[`docs/05-roadmap.md`](docs/05-roadmap.md), that reduces to a much smaller and much harder thing
than it sounds:

- **Phases 1, 2, 3, 4, 5 and 7 are already ACCEPTED**, each against a stated criterion with the
  measurement behind it.
- **Phase 6 is ⚠️ partial**, and it is partial for exactly one reason: **6c is implemented,
  measured, and NOT ACCEPTED** ([§ D145](DECISIONS.md)) against a criterion written before the code
  existed ([§ D139](DECISIONS.md)) and raised in one place before either arm was run
  ([§ D140](DECISIONS.md)).

So "complete Phases 1–7" is not a documentation task. There is exactly one honest way to move
Phase 6 and one dishonest way, and the dishonest way is forbidden by
[`CLAUDE.md`](CLAUDE.md) § Working agreements: *do not weaken an acceptance criterion to make a
phase pass.*

**This wave takes the honest route and states in advance that it may fail.**

## 1. The one thing this wave may not do

§ D139 names, in writing and before any result existed, what would make its criterion a bad one:

> Gating on AWT — that is objection 3 returning under a new name. Choosing the reference arm after
> seeing the result. Reporting a bit-identical run as a small effect. **Widening the budget until
> the interval excludes zero**, rather than reporting the effect as below the resolution limit.

A sweep across operating points is the follow-up the open-debt register itself names. It is also,
run carelessly, **exactly the fourth item on that list wearing a disguise**: measure eight cells,
report the one that passed, and the family-wise error rate at α = 0.05 per cell is not 5 % but
34 %. That is the *confident nonsense* failure mode
[`CLAUDE.md`](CLAUDE.md) § Statistical discipline exists to prevent.

**Therefore the protocol is pre-registered before any ΔTTD is computed, and the cell set is fixed
by a feasibility census that is forbidden to measure any ΔTTD at all.** T50 carries that
prohibition explicitly.

## 2. The task tree

| ID | Task | Lane | Depends on | Isolation |
|---|---|---|---|---|
| **T50** | Feasibility census across candidate cells — ceilings, quotable arms, marginal variance. **Forbidden to measure ΔTTD.** | 6c | — | main tree, read-only + scratchpad |
| **T51** | Pre-register the sweep protocol as § D150, **before T52 runs** | 6c | T50 | orchestrator, not delegated |
| **T52** | Implement the parameterized sweep; run it at the pre-registered budget; report the verdict whatever it is | 6c | T51 | worktree |
| **T53** | Wire `patternSwitching` through `SimulationConfig` so the shipped runner can reach the selector | debt | — | worktree |
| **T54** | Derive `PROFILE_OBJECT_SECTIONS` from `dispatcherProfileSchema` (invariant 8) | debt | — | worktree |
| **T55** | `stopCount`'s `activeWhen`, with its blast radius measured first | debt | T54 | worktree |

T53, T54 and T55 are **independent of 6c's verdict**. They are debt inside Phases 6 and 7 that is
worth closing whether the sweep passes or refuses.

## 3. The pre-registration, in outline — full text lands as § D150

Written here first so that the shape is on the record before T50's census returns, and so that a
reviewer can check the final § D150 against it.

### 3.1 What is broadened, and what is raised

§ D139 states its gate for *an* operating point without naming one; § D145 chose
`midtown-office` interfloor-mix. The sweep **broadens coverage** and **raises the per-cell bar**:

- **Raised:** per-cell α becomes Holm–Bonferroni corrected across the pre-registered cell set, so
  each cell is judged more strictly than § D145's single cell was.
- **Raised:** § D140's resolution clause stays a **gate condition**, and the limit is measured
  **on TTD at the cell** rather than inherited from § 4's AWT-measured figures. The open-debt
  register already flags that inheritance as unmeasured rather than settled; this wave closes it
  instead of relying on the more permissive reading.
- **Broadened:** the cell set is larger than one.
- **Unchanged:** metric is TTD and only TTD; costs published beside and never folded in; CRN;
  tune-on-one-seed-set / validate-on-disjoint; the 2 s deadband known-answer check.

### 3.2 The mechanistic prediction, stated in advance

Following the precedent [§ D148](DECISIONS.md) set for TWIN — where the expected direction was
stated in advance so that a surprise would read as a bug report rather than a discovery — this
wave states its expectation **before** the sweep:

> A selector that chooses among shipped weight vectors can only pay for itself where **there is
> something to switch on**. It should help, if anywhere, on **non-stationary** traffic — a demand
> pattern whose mix changes materially inside the measurement window. It should **not** help on
> stationary traffic, because a selector that never switches is the profile it started from, and a
> selector that switches at random is worse than one that does not.

Two consequences, both of which make the result interpretable either way:

1. `midtown-office` interfloor-mix — § D145's single cell — is close to stationary. That is a
   **candidate mechanistic explanation for the null already measured**, and the sweep is the test
   of it, not a second try at the same question.
2. **A win on a stationary cell is a bug report, not a result.** If the sweep returns a
   significant effect where nothing changes inside the window, the first hypothesis is a wiring
   fault, and § D139's *"a bit-identical run is a wiring bug until proven otherwise"* clause
   generalizes to it.

### 3.3 What "accepted" would mean, stated before the result

**Phase 6c is ACCEPTED if and only if** the selector clears the gate — paired-t interval excluding
zero on the better side under CRN, at the Holm-corrected level, with an effect at or above that
cell's own TTD-measured resolution limit, and generalizing to the disjoint seed set — at **at
least one pre-registered cell**.

**And the phase status must then name the cells where it did and did not.** There is no aggregate
claim of the form *learned control works*. [§ D147](DECISIONS.md)'s double-deck verdict is the
precedent and the model: *WORSE under `eta`, BETTER under `collective`, one cell permanently
unresolvable — there is no verdict of the form "double-deck is better."*

### 3.4 The outcome this wave explicitly permits

**A second refusal, across the whole grid.** That is a real and reportable result: it would turn
§ D145's *"nothing says a selector cannot help somewhere else"* from an open question into a
measured answer over a named set of operating points, which is strictly more than the repository
knows today. It would leave Phase 6 ⚠️ partial, and this document will say so.

## 4. Merge order and gates

1. `feat/t54-schema-sections` → `integration` (no dependants)
2. `feat/t53-selector-runner` → `integration` (touches `core`/`runner`/`cli`; merge before the
   sweep so the sweep runs against the wired tree)
3. `feat/t55-stopcount-activewhen` → `integration` (after T54; both move the search space)
4. `feat/t52-sweep` → `integration` (last; carries the verdict)

Every merge is followed by the full suite, not just the lane's own tests. No lane merges on its
own report — the reports are claims, and this repository has a documented history of reports that
were wrong about the code in the optimistic direction.

## 5. Definition of done for this wave

- [ ] Every lane merged or explicitly abandoned with a reason.
- [ ] `npx tsc -b` clean; `npx vitest run` green on `integration`.
- [ ] § D150 dated and committed **before** T52's first ΔTTD.
- [ ] Phase 6c's status updated to whatever the sweep actually returned, including refusal.
- [ ] `docs/05-roadmap.md`, `docs/07-handoff.md` § 8 and `CLAUDE.md` agree with each other and
      with the code — checked, not assumed.
- [ ] Anything left open is in § 8's register with its measurement, not dropped.
