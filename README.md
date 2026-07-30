# elevator-sim

A configurable elevator traffic simulator for designing and benchmarking **smart dispatch algorithms**.

Build a building — floors, elevator banks, security zones — generate realistic passenger
traffic, and race dispatch strategies against each other under statistically valid conditions.

## Why

Elevator group control is a genuinely hard scheduling problem: continuous state space,
partially observable, non-stationary demand, and hard physical constraints. It is also
one where the "obvious" improvements frequently fail to show up in the data — a faster
elevator can measurably *increase* average waiting time if the gain is smaller than the
statistical noise.

This project exists to make those comparisons rigorous.

## How much you can trust the numbers

**The short version:** this simulator is built to be hard to fool, including by the people
writing it. Most of the engineering effort here has gone into *refusing to say things that
aren't supported* rather than into producing more output. If you have ever been handed a
traffic study whose conclusion evaporated when someone re-ran it, this section is about why
that is difficult to do here.

### 1. It declines to answer when it can't answer honestly

A simulated run that saturates — where the passenger queue grows faster than the group can
clear it — has an average waiting time, arithmetically. That number is meaningless: it tells
you when you stopped watching, not how the building performs. **The simulator suppresses it
and prints the reason instead.**

Saturation is only one of four grounds for refusing to publish a mean. The others are an
empty reporting window (nobody was served), censoring above the unserved limit, and a journey
past the 900-second abandonment horizon — the last of which was added after a run was found
publishing a tidy mean beside a **922.7-second** wait. The queue had grown enormously and
drained just in time; the trend test saw a queue that had stopped growing, the censoring test
saw one that had cleared, and **neither saw the disaster in between**.

In practice this refusal bites hard. Across the twelve shipped dispatchers and five shipped
buildings at the viewer's default settings, only **14 of 60 combinations** produce a quotable
average waiting time. The honest response to that is not to relax the rule. It is to show the
observations that *are* valid — people carried, longest wait, queue depth per floor — and say
plainly why the average is missing.

### 2. Every comparison races the same passengers

When two dispatchers are compared, they are not run against "similar" traffic. They are run
against **identical passengers** — the same people arriving at the same second on the same
floors wanting the same destinations — so that any difference in the result is the dispatcher
and not the luck of the draw. This is *common random numbers*, and — measured here rather than
taken from the literature — it is worth between **1.8×** and **324×** in the number of runs
required, depending on how similar the two dispatchers are. The published general figure is a
single number; the honest answer is that it depends enormously on what you are comparing, and
budgeting by it blindly will under-run the comparisons that need the most care.

Because the pairing is what makes the comparison sensitive, it is checked rather than assumed:
both arms' passenger traces are compared field by field, every replication, and a comparison
whose pairing has broken **refuses to report an interval at all**.

Results are reported as **paired confidence intervals** — the interval on the *difference*, not
two separate intervals side by side. Comparing two overlapping intervals and concluding "no
significant difference" is a standard and seductive error, and the codebase forbids it in
writing.

### 3. Some differences are too small to see, and we say which

Below a certain size, a difference cannot be distinguished from noise at any realistic number
of runs. This simulator **measures that floor rather than assuming it**, and reports anything
underneath it as *below the resolution limit* — never as a win.

The floor is not one number. For two dispatchers whose cost weightings are near neighbours it
is around **0.20 seconds**; for structurally different dispatchers it is roughly **ten times
coarser**. And because those figures were originally measured on waiting time, they were
re-measured directly on door-to-door journey time before being used to judge journey-time
results — which turned out to make the test *stricter to pass, not easier*.

There is a third case, and it is the uncomfortable one: an effect whose required number of runs
exceeds the point's own saturation ceiling is **permanently unresolvable there**. Not
under-budgeted — unresolvable. The simulator says so rather than quoting a number from an
under-powered run.

### 4. Checked against the closed-form answer

Under pure up-peak, the simulated round-trip time, interval and handling capacity are checked
against the **Barney / CIBSE closed-form round-trip-time calculation** — the hand calculation a
lift consultant would do — on all five shipped buildings. If the simulation and the closed form
disagree, the working assumption is that **the simulation is wrong** until proven otherwise.

Reference values — capacities, door times, jerk and acceleration limits, passenger mass, arrival
rates by building type — come from CIBSE Guide D, ISO 8100-32 and the published lift-engineering
literature, and changing one requires citing why.

### 5. The physics is the boring kind of correct

The details that are easy to skip are the ones that change conclusions:

- **Cars fill to 80 % of rated capacity, not 100 %.** Using the nameplate figure makes every
  result systematically optimistic.
- **Motion is modelled with jerk and acceleration limits**, so a short hop never reaches rated
  speed. A simulator that ignores this concludes that faster lifts always help. They don't.
- **Passenger mass is a distribution**, not an average — otherwise the load weighing device has
  nothing to weigh, and bypass behaviour becomes fiction.
- **Passengers arrive in batches**, because people travel together, and batch size materially
  changes loading and stopping patterns.
- **Service zoning, access control and operational zoning are three different things** and are
  never collapsed into one field: which floors a shaft physically reaches, which floors a
  credential permits, and how the controller chooses to partition the building are separate
  questions with separate failure modes.

### 6. The question is written down before the answer exists

Acceptance criteria for each phase are committed **before** the code that answers them, and the
commit history shows the ordering. A criterion written after a result is indistinguishable from
one fitted to it.

The project's own working rule is blunt: *do not weaken an acceptance criterion to make a phase
pass — raise it instead.* That has been honoured in the awkward direction. One improvement was
written exactly as the backlog requested, measured, and then **thrown away**, because the
measurement showed the change would have hidden a live tuning dimension from the optimiser. A
gate is a claim about the world, and the wrong claim costs more than no claim.

### 7. Negative results are published, not buried

Learned dispatcher control was implemented, measured across **eight pre-registered operating
points** spanning five buildings and several traffic patterns, and **not accepted** — the
improvement was smaller than what the apparatus can resolve. Two of those points cleared the
statistical bar and were still refused, because the effect was a third to a half of the smallest
difference detectable there.

More usefully, the *reason* is now known rather than guessed: the shipped demand model varies
how **busy** the building is over time, but never varies the **mix** of up, down and interfloor
traffic within a run — so the condition a pattern-switching controller exists to exploit does
not occur at any shipped operating point. That is a far more actionable answer than a green tick
would have been.

### 8. Published numbers are re-derived, not retyped

Three figures in this repository once failed to reproduce from the code that was supposed to
produce them — one measured before a feature was wired and never regenerated, two mis-copied
through a double rounding — and nothing noticed, because no test re-derived a published interval.
Now they do: the headline figures are re-computed from the runs that produced them, and a change
that moves one turns the test suite red instead of quietly changing what the project claims.

### 9. A test nobody has watched fail is not yet a test

The standing practice is to break a behaviour deliberately and confirm the guard goes red
*before* trusting it. This is not ceremony. In one recent stretch of work it caught **six tests
that could not fail**, by five different mechanisms — including a display test whose fixture
routed it silently past the code path it named, and, one level up, a checking tool that reported
"no failures" for every case because a command-line flag it depended on had been renamed. It
would have certified a dead test suite as fully live.

### 10. Where a caller can get it wrong, we try to make it impossible rather than merely detected

The practices above are about the numbers. This one is about the code that produces them, and it is
the newest.

A function that refuses a bad argument by failing loudly is doing the right thing — but "the right
behaviour on a bad call" is not the same as "the bad call cannot be made". The routine that scores
one simulated run against one design goal used to refuse two of the seven goal types, correctly,
because those two compare *two* configurations and no single run can answer them. Four places in the
codebase checked for that before calling it. All four were right, and **nothing obliged them to be** —
the check was a convention four authors held by having read the same comment. So the restriction is
now part of the type the function accepts: a caller that has not checked no longer fails at run time,
it fails to compile. Three modules and two dozen test lines stopped building the moment that landed,
which is how we know the change has teeth rather than merely reads well.

The same reasoning fixed how the browser viewer reports a page it cannot start on. It resolves 73
named elements, and it used to stop at the first one missing — including, awkwardly, the element it
writes its own error messages into, so the one situation where the message mattered most was the one
where nobody ever saw it. It now names every missing element at once, and the list of what a page must
contain is a document rather than 73 calls buried in a 1,600-line file.

Neither change fixed a bug. Both removed a way for the *next* person to introduce one.

### What this does not claim

It is a simulation, not a building. It does not model passenger psychology, lift-lobby crowd
flow, or anyone deciding to take the stairs. Where a limitation is known it is written down in
[`docs/07-handoff.md`](docs/07-handoff.md) § 8 with its measurement rather than left for you to
discover — including the ones that are inconvenient.

## Goals

- **Configurable buildings** — arbitrary floors, multiple banks, service zones, access-control zones
- **Realistic physics** — S-curve motion profiles with acceleration and jerk limits, door timing, load weighing
- **Realistic traffic** — office / residential / hotel / mixed-use arrival profiles with peak templates
- **Pluggable dispatchers** — nearest-car, ETA, zoned, auction-based and destination-dispatch, all
  as weight vectors in `data/`, not classes. A *learned* dispatcher is deferred scope, not shipped
- **Statistically valid results** — multi-replication runs, common random numbers, sequential confidence-interval stopping

## Target smart behaviors

| Behavior | Where it lives |
|---|---|
| Predictive pre-positioning / parking | Group controller + learned arrival predictor |
| Hall-call bypass when car is full | Car load sensor → dispatcher reassignment |
| Parallel service of heavy floors | Group controller demand splitting |
| Dynamic zoning under up-peak | Group controller policy |
| Access-control-aware routing | Building ACL → dispatcher feasibility filter |

## Documentation

| Doc | Contents |
|---|---|
| [Project Brief](docs/00-project-brief.md) | Vision, scope, non-goals, success criteria |
| [Architecture](docs/01-architecture.md) | Three-layer design, core interfaces, DES kernel, determinism strategy |
| [Elevator Reference](docs/02-elevator-reference.md) | Elevator classes, speeds, capacities, door and motion timings |
| [Traffic & Statistics](docs/03-traffic-and-statistics.md) | Demand profiles, RTT math, replication methodology, CRN, stopping rules |
| [Test Buildings](docs/04-test-buildings.md) | Five reference buildings from low-rise to supertall |
| [Roadmap](docs/05-roadmap.md) | Phased development plan, with each phase's acceptance verdict and the measurements behind it |
| [Parameterization & Tuning](docs/06-parameterization-and-tuning.md) | How to tweak every model without recoding, and how to search for an optimum |
| [Handoff](docs/07-handoff.md) | Current state, measured facts that bound what you may claim, known-answer tests, open debt |
| [Review findings](docs/08-review-findings.md) | The whole-system review register, with each finding's disposition |
| [Destination dispatch contract](docs/09-destination-dispatch-contract.md) | Phase 6's locked interface contract, its measured comparison design, and the open questions that gate implementation |
| [Experience layer contract](docs/10-experience-layer-contract.md) | Phase 9's design: the rules that keep a gamified surface honest, novice/expert modes, a schema-generated dispatcher and traffic editor, and access-zone credentials |
| [TWIN shaft contract](docs/11-twin-shaft-contract.md) | Two independently driven cars in one shaft, designed and not built: the shaft model, the speed-dependent separation constraint, the deadlock invariant and the property that catches it, and an acceptance criterion written before the implementation |
| [Design handoff](docs/12-design-handoff.md) | The Claude Design handoff the viewer is built to, the requirements checklist extracted from it, the gap analysis against the shipped viewer, the backend changes the front end required, and every deviation with the constraint that forced it |

Machine-readable configuration lives in [`data/`](data/), and the design the viewer is built to is
vendored in [`docs/design/`](docs/design/).

### Running the viewer

```bash
npm install && npm run build
npm run dev -w @elevator-sim/viz     # → http://localhost:5174
```

## Status

**Phases 0–5, 7 and 8 are landed and accepted. Phase 6 is partially complete** — see the table for
what that means. Four packages (`core`, `experiments`, `viz`, `cli`), a six-command CLI, and a
viewer built to a [design handoff](docs/12-design-handoff.md). **253 test files, 4,700 tests**
(4,690 passing, 10 skipped), `tsc -b` clean, 550 s serially on an idle machine.

Wave 10 rebuilt the viewer against that handoff and **moved no phase verdict**: no published number
was recomputed and no acceptance criterion was touched — the report sheet reads `VizSummary`, which
reads `RunSummary`, which is the object the CLI and the experiment matrix already read. See
[`WAVE10_PLAN.md`](WAVE10_PLAN.md).

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ DES kernel, per-source RNG streams, config loading |
| 1 — Physics & model | ✅ S-curve motion, doors, load sensor, pure `estimateCost()` |
| 2 — Traffic & dispatch | ✅ Poisson batch arrivals, weighted-cost engine, RTT oracle |
| 3 — Experiment infra | ✅ Replication runner, CRN, sequential stopping, paired-t |
| 4 — Visualization | ✅ Viewer, building editor, live metrics overlay, playback from a stored seed, 88-scenario UX ledger |
| 5 — Smart dispatch | ✅ Twelve cost terms, auction, predictor, benchmark suite |
| 7 — Automated tuning | ✅ Search space, three searches, held-out validation, `elevator-sim tune` — **and its one undelivered bullet, the fuzzy traffic-pattern detector with hysteresis driving per-pattern weight sets, now ships and drives a run**; measured BETTER on TTD and reported **below the resolution limit**, because the effect is smaller than the apparatus resolves |
| CLI | ✅ `list`, `run`, `compare`, `tune`, `fuzz`, `watch` |
| 6 — Destination dispatch & learned control | ⚠️ 6a (disclosure) and 6b (dispatch) accepted against a **raised** criterion, now measured on the Mixed-Use High-Rise the criterion names: **met by the Level-0 arm, not met by the Level-1 panel at any measured point**. 6c (learned control) is **implemented, measured, and NOT ACCEPTED** — and the refusal is no longer one operating point: it was swept over **eight pre-registered cells** and held, refused at **all five primary cells** under a multiple-comparison correction, with the smallest detectable effect re-measured at each cell rather than inherited from another. Two of those cells clear the correction and were **refused anyway**, because the effect is a third to a half of what the apparatus can resolve there. Double-deck operation **is simulated**; its verdict became BETTER-EVERYWHERE once a real escalator replaced a lift leg the hardware would never pay for — on **two cells at one operating point where the previous answer had four at two**, and a better word on a narrower base is not a stronger result. Every sub-phase now has a measurement rather than a deferral, and the phase is still partial because one of them was refused |
| 8 — Testing campaign | ✅ All eight tracks landed — fuzzing, oracle across all five buildings, physics, statistics, determinism, scale, adversarial, and the full experiment matrix (8 cells × 12 profiles, Pareto front over AWT / energy / WT95) — and found four real defects, **all four now fixed**; the deep tier is green at 2 000 cases and **no property violation is outstanding**, so both halves of the criterion are met |

Try it — six commands, all against the real `data/` directory:

```bash
npm install && npm run build
npm run sim -- list
npm run sim -- run --building garden-apartments --dispatcher eta --seed 42
npm run sim -- compare --building midtown-office --a eta --b nearest-car --reps 100
npm run sim -- tune --building garden-apartments --params idle.repositionThresholdS --seed 42
npm run sim -- fuzz --cases 8                  # or: --tier deep --cases 2000, the overnight pass
npm run sim -- watch --building garden-apartments --dispatcher eta --speed 10
npm test        # 226 files, 4,148 tests — the benchmarks execute real replications, so this is minutes, not seconds
```

`compare` prints a paired-t interval on the difference and refuses to rank two arms whose interval
contains zero — that is the point of the project, not a nicety. It also **refuses to gate on AWT
across two passenger models**, moving its headline verdict to TTD and naming `core`'s own list of
the nine metrics that stop being comparable. `run`, `compare` **and `watch`** all refuse to print a
mean the run's own summary suppresses; `watch` printed one on both of its render paths until
[§ D111](DECISIONS.md).

**What is not done is in the brief, not in this table.** Phase 6c is **measured and refused**, which
is a different state from deferred and a better one. Phase 9 — the experience layer designed in
[`docs/10`](docs/10-experience-layer-contract.md) — has **eight and a half of its nine units
built**: a novice/expert split, a schema-generated dispatcher form, per-floor rider queues, a
building-mood gauge, an access-credential lens, a seven-stage campaign whose bars are the shipped
configuration's own measured scores rather than numbers somebody picked, and a comparison tab that
runs a proper replication batch in a worker and shows the interval without naming a winner when the
interval contains zero. The half that is open is the access-zoning **editor** controls; its
dispatcher-compatibility warning is done. **It still has no phase status row, deliberately.** Its
acceptance criterion exists and its two load-bearing clauses now measure as satisfied, but the row
and the verdict land together or neither does, and the sweep that would write the verdict has not
been run. A design with most of its code built is not an accepted phase. TWIN operation — two
independently driven cars in one shaft — is **designed and not built**, in
[`docs/11`](docs/11-twin-shaft-contract.md); it is not double-deck, and the contract says why. A
phase's *status* is now bound to **evidence that
exists** — `validation/phaseStatus.test.ts` parses every status and citation out of the roadmap and
fails if an accepted phase names a test, study or pin group that does not — but **not to evidence
that supports it**: a phase could still cite a real suite that does not assert its criterion, and the
guard cannot tell a raised criterion from a weakened one. See [`docs/07` § 8](docs/07-handoff.md).

The browser viewer and building editor live in `packages/viz` and are dev-served with Vite;
`packages/core` exposes a `./browser` subpath so nothing pulls `node:fs` into a bundle.

**Replacing the front end.** The layers under the viewer are designed to outlive it: the recording
contract, the frame producer, the metric overlays and every layout planner are pure functions of
`(recording, time)` with no DOM anywhere near them, and the two functions that turn a time into a
picture **clamp** their time argument, so scrubbing anywhere — including past the end of a run —
cannot throw. `packages/viz/src/dev/elementMap.ts` is the integration contract for the page itself:
every element the viewer resolves, in one list, checked against the shipped HTML in both directions.
The second direction is the useful one — it names the 34 ids in the page the viewer never looks up,
which is the answer to *what can new markup safely drop?* A page missing elements now gets one
message naming all of them rather than dying on the first. One honest limitation, recorded rather
than glossed: every element is still **required**, because the viewer dereferences all of them
unconditionally, so *"this build has no campaign tab"* is not yet expressible as a disabled surface.

See the [Roadmap](docs/05-roadmap.md) for per-phase acceptance verdicts and the measurements behind
them, and the [Handoff brief](docs/07-handoff.md) for current state and open debt.

## License

MIT — see [LICENSE](LICENSE).
