# Wave 10 — the design handoff

> **Scope.** Implement the Claude Design handoff *Elevator Sim Reimagined* as the viewer, against
> the real simulator. **No phase verdict moves.** No published number is recomputed, no acceptance
> criterion is touched, and every deviation from the handoff is recorded with the constraint that
> forced it.
>
> Board: this file · design requirements and gap analysis:
> [`docs/12-design-handoff.md`](docs/12-design-handoff.md) · decisions:
> [§ D174](DECISIONS.md)–[§ D179](DECISIONS.md) · the handoff itself, vendored:
> [`docs/design/`](docs/design/).

## 1 — What this wave is

The viewer that existed was a five-tab instrument panel: Run viewer, Building editor, Parameters,
Compare, Campaign. The handoff is a single operating surface — a three-column *shift* in a building
you are running through a day — with the instrument panel folded into two rails.

The gap is structural rather than cosmetic, and [`docs/12`](docs/12-design-handoff.md) § 2 is the
audit. In one line: the shipped viewer's primary object is **a run you configure**, and the
handoff's is **a shift you are working**.

## 2 — The lanes, and their boundaries

Eight lanes, each owning a disjoint set of files. The boundaries were enforced by assignment, not by
convention: every lane was told the exact directories it might write and told to report anything it
needed from another rather than reach for it.

| Lane | Owns | Landed |
|---|---|---|
| **A — contract and recording** | `contract/types.ts`, `record/decisionLog.ts`, `record/recordRun.ts` | schema 7: `VizLeg.alightedAt`, `VizRecording.decisions`, `demandPhases`, `outOfServiceCarIds` ([§ D176](DECISIONS.md)) |
| **B — the live read** | `live/` | wait bands, observations at `t`, the real phase timeline, the decision rows, the honesty card |
| **C — the shift layer** | `shift/` | five scenarios, the day's event *with a real simulation effect*, goals, tenant growth, the week, the day report |
| **D — the stage** | `render/` | sky by time of day, slabs and lit windows, load-tinted cars with the doors as a gap, rider figures by wait band, the alarm rule, service badges with hit rectangles |
| **E — the shell** | `index.html`, `dev/elementMap.ts`, `dev/dom.ts`, `dev/surfaces.ts`, `dev/state.ts`, `dev/main.ts` | one palette, the three-column grid, the tab and rail machinery, the run builder |
| **F — the editors' models** | `authoring/` | four flat specs, each with the conversion to the real configuration object |
| **G — the panels** | `dev/leftRail.ts`, `rightRail.ts`, `reportPanel.ts`, `scenariosPanel.ts`, the four editor mounts | the eleven surfaces |
| **H — honesty coverage** | `honesty/` | every new player-facing producer driven by the property search, or excluded with a reason |

## 3 — The rule that did the work

> **Move the control and require the run to change.**

Every editor control has a test that moves it and asserts the resulting run differs — compared on
the **legs**, *who was carried by which car and when*, never on a window statistic, because a
summary over the peak five minutes can legitimately be equal for two visibly different runs.

It is the same rule as the roadmap's standing requirement (*name the non-test caller*) pointed at a
slider, and it found three defects before a single editor was mounted:

1. the dwell chips wrote a field that does nothing under the default door policy — **three chips,
   three byte-identical runs**;
2. the default group lever silently replaced `energy-aware`'s authored adaptive dwell the moment the
   page loaded;
3. *blind to the load sensor* was configured to a value `resolveLoadSensor` rejects.

Plus a false claim about a mechanism, in three docstrings and a UI string: the loader **warns**
about a rise past a class's envelope; it does not refuse. See [§ D177](DECISIONS.md).

## 4 — What did not move, and why that is the headline

- **No phase verdict.** Phase 4 is still complete against its own criterion, Phase 6 is still
  partial, Phase 9 still has no phase row.
- **No published number.** The report reads `VizSummary`, which reads `RunSummary` — the same object
  the CLI and the experiment matrix read. Nothing is recomputed for the screen.
- **No invariant.** `estimateCost` stays pure; no global RNG; no wall clock in `core/` (the shift
  clock is `dayStartS + frame.simTimeS`, and `simTimeS` is the kernel's); `core/` gains no dependency
  on `viz/`; a dispatcher a reader builds is a weight vector.
- **No surface deleted.** Compare, Campaign and Parameters are retained as three chips in the
  handoff's own tab strip. Deleting them to match a design that had not heard of them would delete
  the only surface on which *"this dispatcher is better"* can be said at all
  ([§ D174](DECISIONS.md)).

## 5 — Coverage

New suites, all colocated and all `environment: 'node'` — this repository has no jsdom, so the
pattern throughout is that the **decision** is a pure exported function and the DOM writing is
decision-free.

| Area | What is asserted |
|---|---|
| `record/decisionLog.test.ts` | an instrumented run's `RunRecord` equals an uninstrumented one's, by `JSON.stringify` and not by a digest; the phases cover the run contiguously and scale onto its duration; a withheld car carries nobody and the control is not vacuous |
| `live/*` | the bands agree with `Frame.totalWaiting` on every shipped building; scrubbing backwards returns identical results; and `noMeans.test.ts` — a comment-stripped grep **plus** a recursive walk of every function's output on a real saturated run, because the grep alone would miss an arithmetic leak |
| `shift/*` | every event's effect is **consumed** — the run differs from the no-event control in the way the event claims, and `ordinary` is byte-identical; a grown building loads with warning codes identical to the shipped one's; goals are `pending` below twenty arrivals and the gate is load-bearing |
| `authoring/authoring.test.ts` | every control changes the run; opening a shipped dispatcher and saving it untouched produces a **bit-identical** `RunRecord`; the dwell seconds come from the shipped bands; persons come from the capacities table and not from `lb / 150` |
| `dev/surfaces.test.ts` | the arrow keys skip a hidden contextual tab; exactly one visible tab is focusable; the drawer breakpoint here and the `@media` rule in the stylesheet agree |
| `render/*` | the sky bands differ across the four hours; the bob is a function of `simTimeS` so two draws at the same `t` are identical; the load tint thresholds; the alarm rule |
| `honesty/` | every new player-facing producer is driven by the property search or excluded with a reason — § D163 clause 1, working as intended |

## 5.1 — Measured at close

`npx tsc -b` clean. `npx vitest run` → **253 files / 4 700 tests, 4 690 passed, 10 skipped**,
exit 0, **550 s** serially on an idle machine. Against the tree wave 10 opened on — 227 files,
4 161 tests — that is **+26 files and +539 tests**, and the two that were failing at the start
(a `docs/*.md` the README did not link, and the honesty search's derived surface set) are green.

The honesty property search grew with the surfaces it now covers: **94 497 → 194 206 strings per
campaign**, over **15 → 22** text-producing surfaces, with **zero** unclassified producers. That is
the number that says the new rails, report, scenarios and four editors are inside § D163 clause 1
rather than beside it.

## 6 — Deviations

Five, each with the constraint that forced it, in [`docs/12`](docs/12-design-handoff.md) § 4 and in
[`DECISIONS.md`](DECISIONS.md):

1. **The day is the run's own clock** ([§ D175](DECISIONS.md)) — the handoff's sixteen hours are not
   a thing this simulator has, and the shipped demand templates are 30 min and 2 h.
2. **Every figure is re-sourced** ([§ D178](DECISIONS.md)) — including the average wait, which is
   `withheld` on all four suppression grounds rather than only on saturation.
3. **The traffic editor edits what the engine has** ([§ D177](DECISIONS.md)) — the handoff's ten
   day-shaped sliders become rows bound to `SimulationDemandOptions`.
4. **The five scenarios are the five shipped buildings, unchanged** — where a handoff stat line
   disagrees with `data/buildings/*.json`, the file wins and the line is generated.
5. **The elevation's shaft drag writes service zoning** — a band that is not a contiguous slice of a
   bank is not a building this loader will build, so a drag produces a bank split.

Plus three the stage lane refused on accessibility and safety grounds, each argued at the token: the
`⚿` restricted-floor badge (it would collapse access zoning into service zoning), the red load tint
at 0.95 (a colour-only signal for a car's worst state, or a safety alarm on a car that is not
overloaded), and `waitingUp` sharing the freshest band's green.

## 7 — What the handoff got wrong, and how each was found

A prototype is worth more than a mockup because it has states, interactions and copy — and its bugs
look exactly like requirements. Four survived into the implementation, and three of the four were
found by a **mechanism** rather than by review ([§ D179](DECISIONS.md), [`docs/12`](docs/12-design-handoff.md) § 4.6):

| Found by | The defect |
|---|---|
| A test asserting a control changes what is on screen | the *show me the maths* toggle was inert — visible exactly when the paragraph was already open |
| A test that had **pinned three clock times as exceptions**, then tightened to forbid them | `08:30`, `14:00` and `11:30` name hours no 30-minute shift contains; the third also promised a car's return to service that never happens |
| The honesty property search | the report-window row quoted `25` beside an estimate cue, on a run whose refused mean rounds to 25 — printing the withheld number three rows under the cell withholding it |
| Opening the page at 900 px | the mood card's driver rows pushed the four headline stats off screen |

Three more came from driving the running viewer: a temporal-dead-zone reference that reported *the
shift did not run* over a stage that had drawn, a mode select disagreeing with its own panels under
a deep link, and the week banking a shift against the scenario it had left.
