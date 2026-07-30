# Wave 11 — polishing the viewer to spec, and handing 6c on

> **Scope.** Take the wave-10 viewer from *implemented* to **fully implemented per spec and
> polished**, measured against [`docs/12`](docs/12-design-handoff.md) § 5's eleven-point definition
> of done and § 1's thirty-seven requirement rows. Close Phase 9's acceptance question. Close the
> named wrong-number and wrong-screen gaps in [`GAPS.md`](GAPS.md). **Phase 6c is explicitly out of
> scope** and leaves as a handover document instead.
>
> Board: this file · design requirements and the definition of done:
> [`docs/12-design-handoff.md`](docs/12-design-handoff.md) · the handoff itself, vendored:
> [`docs/design/`](docs/design/) · gap register at open: [`GAPS.md`](GAPS.md).

## 1 — What this wave is

Wave 10 rebuilt the viewer to the *Elevator Sim Reimagined* handoff and closed on its own claim of
green. **That claim was never committed and never verified by anyone but the lane that made it** —
the entire change set was sitting in the working tree at wave 11's open. Step one is therefore not
new work: it is verifying and landing what already exists, because an unverified change set is not
a baseline and every other lane branches from it.

What follows is polish in the specific sense `docs/12` § 5 defines, which is not a matter of taste:
eleven numbered criteria, thirty-seven numbered requirement rows, and a rule about who wins a
disagreement. **The handoff wins every disagreement about what the screen looks like. The simulator
wins every disagreement about what a number means.** A gap against the handoff is a defect; a
deviation forced by the simulator is a decision, and it is only a decision if it is written down
with the constraint that forced it.

## 2 — What is out of scope, and why that is a decision rather than an omission

**Phase 6c's re-measurement.** The protocol is pre-registered at [§ D162](DECISIONS.md), the
mix-varying template it needs shipped in wave 9, and nothing has been measured on it. It is the
largest open question in the project and it is **deliberately not answered here**: it is a
measurement campaign whose compute profile and failure modes have nothing in common with UI polish,
and interleaving them would mean a wave whose two halves compete for the same idle machine — the
exact configuration [`docs/07`](docs/07-handoff.md) § 1 records wave 5 failing under.

It leaves as a **handover document** so the next thread starts cold without re-deriving anything.
Its step 0 is the `lunch-two-way` saturation census, because [`GAPS.md`](GAPS.md) § 2 makes deriving
that budget the measuring lane's own job and not an inheritance.

**A third refusal remains an explicitly permitted outcome.** Nothing about moving this out of the
wave should be read as expecting it to pass.

## 3 — The rule this wave carries forward

> **Move the control and require the run to change.**

Wave 10's standing rule, unchanged: every editor control has a test that moves it and asserts the
resulting run differs, compared on the **legs** — who was carried by which car and when — and never
on a window statistic, because a summary over the peak five minutes can legitimately be equal for
two visibly different runs. It found three inert or wrong controls and one false claim about a
mechanism before a single editor was mounted ([§ D177](DECISIONS.md)).

Every control this wave adds carries that test. A control that cannot be given one is a control that
does not ship.

## 4 — Lanes

Boundaries were enforced by assignment: each lane was told the exact files it might write and told to
**report** anything it needed from another rather than reach for it. That held — no lane wrote outside
its list, and one stopped and reported a file it needed instead of taking it.

| Lane | Owns | Landed |
|---|---|---|
| **T81 — land wave 10** | the tree | wave 10 verified against its own claim and pushed (`22a1021`) |
| **T83 — the 6c handover** | `docs/13` | the § D162 protocol written to be executed cold, in its own session |
| **T89 — conformance audit** | read-only | the gap register that drove every lane below |
| **A — shell and left rail** | `index.html`, `dev/main.ts`, `dev/elementMap.ts` | M4's missing legend, and six token/type/spacing gaps (`65de5d9`) |
| **B — transport** | the same three, serially after A | § 4.7, § D180, and the block restyled into the handoff's vocabulary |
| **C — elevation** | `dev/buildingEditor.ts`, `authoring/buildingSpec.ts` | the express toggle, and the stranded-band refusal (§ D181) |
| **D — access zoning** | the same two, plus markup, serially after C | W8's last two controls, and the round trip that was deleting them (§ D182) |
| **E — suppression ground** | `core/src/`, `viz/src/mode/` | the ground beside the prose, derivation intact (§ D183) |
| **F — matrix front** | `experiments/src/benchmark/` | the front pinned, and a four-day-old published drift found (§ D184) |
| **G — the transport of E** | `viz/src/contract/`, `record/`, `mode/` | schema 8, and the fixtures that could not tell wired from working (§ D185) |

### What the boundary policy did **not** cover, and it cost a commit

Lanes owned disjoint **files**. That is necessary and it is **not sufficient**, because `git add -A`
stages the whole repository: `ae6750b`'s message describes lane D alone and the commit contains lanes
E, F and D together. The wave's own § 5 says one worktree per concurrent lane and the orchestrator did
not use worktrees. Recorded under [§ D182](DECISIONS.md) rather than tidied away, and the remedy from
that point on was explicit paths at every `git add`.

**The generalisable form:** file ownership partitions *editing*; only a worktree partitions
*committing*. A wave that parallelises without worktrees can still produce a correct tree and cannot
produce an honest history.

## 5 — Shared files, and who owns them

The shell files are the ones two lanes will both want, and wave 10's lane E owned them alone for
that reason. They stay orchestrator-owned here: a lane needing a new element id **reports it** and
the orchestrator applies it, because `dev/elementMap.test.ts` asserts the manifest against the
markup in both directions and two lanes editing it concurrently produces a conflict that looks like
a test failure.

| File | Owner |
|---|---|
| `packages/viz/index.html` | orchestrator |
| `packages/viz/src/dev/elementMap.ts` | orchestrator |
| `packages/viz/src/dev/main.ts` | orchestrator |
| `WAVE11_PLAN.md`, `AGENT_STATUS.md`, `DECISIONS.md`, `GAPS.md`, `RISKS.md`, `TEST_MATRIX.md` | orchestrator |

## 6 — Definition of done for this wave

1. `docs/12` § 5's eleven criteria each hold, or each failure is recorded with the constraint that
   forced it.
2. Every one of § 1's thirty-seven requirement rows is marked **built and driven**, **built and
   tested**, **deviated with a recorded constraint**, or **refused with an argument** — and no row is
   marked from reading the code.
3. Phase 9 has a status row and a verdict, landed together, or a recorded reason why neither did.
4. The named gaps this wave took are closed or restated with what was learned.
5. `npx tsc -b` clean and `npx vitest run` green, **measured serially on an idle machine**, and the
   red run reported if there was one.
6. No phase verdict is rounded up, and no acceptance criterion is weakened to make one pass.
