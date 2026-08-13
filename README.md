# elevator-sim

**A tower-management sim with a real engine underneath.**

Design a building — floors, elevator banks, security zones — fill it with people who have
somewhere to be, and watch the morning rush hit. Then change something and find out whether it
actually helped.

The twist is that nothing here is faked for effect. The cars obey jerk and acceleration limits, the
crowds arrive in batches with weights the load sensor can feel, and when you ask *"did that help?"*
the answer comes back with a confidence interval — or an honest refusal, if the run cannot support
one. **It plays like a game and it measures like an instrument.**

## The loop

1. **Build** — pick a tower or author your own: floors, banks, car specs, service and access zones.
2. **Populate** — choose a traffic pattern. Morning up-peak, lunch two-way, evening down-peak, or
   your own demand template.
3. **Run the day** — watch cars fill, doors dwell, queues build on the floors that are struggling.
4. **Change one thing** — a dispatcher, a weight, an extra car, a faster motor.
5. **Race them** — the same passengers, to the second, against both configurations. The simulator
   tells you whether the difference is real or whether you are looking at noise.

Step 5 is the whole point, and it is where most tower sims quietly cheat.

## Why it is a hard game to build honestly

Elevator group control is a genuinely hard scheduling problem: continuous state space, partially
observable, non-stationary demand, hard physical constraints. It is also one where the *obvious*
improvement frequently fails to show up in the data — **a faster elevator can measurably increase
average waiting time** if the gain is smaller than the statistical noise. Buy the upgrade, watch the
number get worse, conclude something false.

A sim that wants to be satisfying will round that away and give you the win. This one will not.

## How much you can trust the numbers

**The short version:** this simulator is built to be hard to fool, including by the people
writing it. Most of the engineering effort here has gone into *refusing to say things that
aren't supported* rather than into producing more output. If you have ever been handed a
traffic study whose conclusion evaporated when someone re-ran it, this section is about why
that is difficult to do here.

Read it as the rules of the game. They are unusually strict, and the strictness is the feature.

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

It is a simulation, not a building. The people in it are demand, not characters: they arrive, they
wait, they board, they leave. **Today it does not model passenger psychology, lift-lobby crowd flow,
or anyone deciding to take the stairs** — a rider will queue for twenty minutes without ever
glancing at the stairwell, which no real person does.

That gap is the difference between a good engine and a building you believe in, and closing it is
active work rather than an aspiration — see [Goals](#goals). The constraint it has to respect is the
one that governs every model change here: **new behaviour arrives opt-in and off by default, so a
run that does not ask for it is bit-identical to the run before it existed.** A traffic-model change
that silently moved a published figure would invalidate far more than the feature was worth.

Where a limitation is known it is written down in [`docs/07-handoff.md`](docs/07-handoff.md) § 8
with its measurement rather than left for you to discover — including the ones that are
inconvenient.

## Goals

**Shipped:**

- **Configurable buildings** — arbitrary floors, multiple banks, service zones, access-control zones
- **Realistic physics** — S-curve motion profiles with acceleration and jerk limits, door timing, load weighing
- **Realistic traffic** — office / residential / hotel / mixed-use arrival profiles with peak templates
- **Pluggable dispatchers** — nearest-car, ETA, zoned, auction-based and destination-dispatch, all
  as weight vectors in `data/`, not classes
- **Statistically valid results** — multi-replication runs, common random numbers, sequential confidence-interval stopping

**In design — the building-behaviour program.** These are what turn a correct engine into a tower
you believe in, and each is scoped to arrive opt-in and off by default so no shipped figure moves:

- **Richer traffic variance** — an independent traffic seed so demand can be re-rolled without
  disturbing anything else, an authored body-mass distribution, a group-size curve you can shape,
  and day-to-day variability so Tuesday is not a copy of Monday
- **Passenger behaviour** — patience and abandonment, lift-lobby crowding that slows boarding when a
  lobby is packed, and stair-taking with the asymmetry real people have (a flight down is cheap, a
  flight up is not)
- **A learned dispatcher you can teach** — the surface for training a policy against your own
  building and traffic, with the same acceptance bar every other dispatcher faces. Measured three
  times so far and refused three times ([§ D145](DECISIONS.md), [§ D156](DECISIONS.md),
  [§ D200](DECISIONS.md)) — the refusals are published above the wins

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
| [Building behaviour contract](docs/14-building-behaviour-contract.md) | The program that makes the sim read as a building — **steps 0, 1 and 2 built, the rest designed**: an independent traffic seed, body-mass and group-size distributions you can shape, day-to-day variability, passenger patience and abandonment, lift-lobby crowding, stairs with the up/down asymmetry real people have, and the surface for teaching a learned dispatcher. Every feature opt-in and byte-identical when unused, with the acceptance criteria written before the implementation and the sequencing forced by what can move a published number — including step 2's, which measurement sent back for correction rather than met ([§ D203](DECISIONS.md)) |
| [Compute offload contract](docs/15-compute-offload-contract.md) | Moving measurement compute off one laptop, and why that is a statistics problem before it is an infrastructure one: common random numbers pair alternatives *within one run on one machine*, so the unit of distribution is a whole paired comparison and never an arm; and a runner is a pin environment, so a second architecture is a third pin set rather than cheaper cores. **Phase A — self-hosted Azure CI runners — is withdrawn and its code removed**, on a cost finding: the template billed fixed capacity (≈ $212/month) while the runbook published the ~$5 of a per-job model it did not implement, which is a published number that did not reproduce from the code that produced it. Phase B, the measurement fan-out, is still only designed. Carries the honest ranking of what compute does and does not buy — two of whose four rows died with Phase A — and the criterion that raising the replication budget requires re-measuring the resolution limit rather than inheriting it |
| [Change scope contract](docs/16-change-scope-contract.md) | What a control is allowed to move, and when. The simulator runs a whole day and plays the recording back, so there is no mid-day change — every change re-rolls the day, which makes the retry the product's most-used verb and, until it was named, one that could bank a scenario on a single Monday. Four scopes named so a fifth is a compile error, the controls under them derived from the state's own keys in both directions, and ten rules **S1–S10** — including the one that says a presentation control must reach a sink *and* must not reach the legs |
| [Static site deployment](docs/16-static-site-deployment.md) | Hosting the viewer's page on a CDN while the API stays on the Container App, because `serve.ts` serves the page out of a container running at `minReplicas: 0` and a cold first load was measured at **32.2 s** against 0.13 s warm — which `/api/wake` cannot fix, since the page is the thing being waited on. Carries the priced three-way comparison and the trade it honestly is: £0 and same-origin stops being true, versus ≈ £9/month to keep it, versus ≈ £26/month to change nothing but the bill. The three configured values that then have to agree, the two the server refuses to hold apart, and — in the runbook's own voice — a § 9 that separates what was run from what was only reasoned about. **Nothing is switched on and no Azure resource has been created by it** |
| [Everyday Mode playtest audit #2](docs/20-everyday-playtest-audit-2.md) | The second player-walk, taken after every slice landed: it re-verifies docs/19's fourteen defects as a player (nine fixed, three partial, no regressions, the blocks-play trap gone) and plays the new rules editor, ghost race, Fix-a-building, bench suite and watch flows. Seventeen new findings, none blocks-play, each with a repro and an owning module — plus the session narrative naming the product's best ninety seconds and its worst |
| [Everyday Mode playtest audit](docs/19-everyday-playtest-audit.md) | The Everyday Mode delivery walked as a player in a real browser — docs/17's successor. Per-flow verdicts on playability, navigation, intuition and information; fourteen ranked defects with reproductions, one blocks-play (the post-reload Resume trap, since fixed with the repro as a browser regression); and the what-would-make-it-fun notes the polish lanes are scoped from |
| [Everyday Mode tree audit](docs/18-everyday-mode-tree-audit.md) | The casual-mode design handoff's build plan verified against this tree, slice by slice, after the handoff's own precedence rule fired: the prototype §20 describes is not in this repository, so what it calls inert controls do not exist here, what it calls missing partly exists, and what it says to delete was never built. Carries a verified work-order per slice naming the real seams, the implementation-status register for landed slices, and the disagreement register where the code won |
| [Engineer reimagined contract](docs/21-engineer-reimagined-contract.md) | The Engineer surface rebuilt in Everyday Mode's visual language, with **more** information rather than less — [§ D299](DECISIONS.md)'s test (*a change may make Engineer easier to use; it may not make it say less*) turned into an instrument: an information-survival ledger naming every figure, qualifier and refusal on all fourteen surfaces with the export that carries it, so a review is a checklist rather than a reading. Carries the token restyle both products share, the added controls and the authoring gap that fails both products (five dispatcher families advertised, two authorable), six engineering challenges scored in verdicts and intervals and never in a grade, and the lane cuts they are built from |
| [Play-through audit](docs/17-play-experience-audit.md) | The product walked as a player, mode by mode: what each is for, whether it makes sense, what moves at each scope inside it, and what its results page has to say. Carries four modes that do not exist and an argument for each — incidents and maintenance over the `serviceEvents` scheduler no shipped building calls, a calendar of seasons and holidays at `growth.ts`'s own seam, a fixed-seed daily challenge that would give the leaderboard a competitive axis other than luck, and a commissioning phase over the elevator-spec table's real rise and floor-count gates |
| [Play-test report](docs/elevator-sim-playtest-report.md) | A tester's session notes, kept as the source the play-test backlog was filed from. Read it as a **report rather than a finding**: verification has since refuted or re-attributed a large share of what it claims, and the surviving dispositions live in [`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md), whose *claims that did not survive verification* tables are the correction of record |
| [Phase 6c re-measurement handover](docs/13-phase-6c-handover.md) | The pre-registered § D162 protocol, written to be executed cold in its own session: the five conditions and which already hold, the gate itemised, the saturation census that must come first because no budget may be inherited, and what an acceptance would and would not be allowed to say. A third refusal is a permitted outcome — and is now the recorded one (`benchmark/lunchTwoWaySelection.ts`) |

Machine-readable configuration lives in [`data/`](data/), and the design the viewer is built to is
vendored in [`docs/design/`](docs/design/).

### Running the viewer

```bash
npm install && npm run build
npm run dev -w @elevator-sim/viz     # → http://localhost:5174
```

### Deploying it

The viewer and the API ship as **one container serving one origin** — which is what lets the API's
CORS policy stay at same-origin, because there is no cross-origin request to permit. The viewer's
web bundle is a separate build from the library one:

```bash
npm run build:web -w @elevator-sim/viz     # → packages/viz/dist-web/
docker build -t elevator-sim .
```

The server needs PostgreSQL (`ELEVATOR_SIM_DB`), a 32-character signing secret
(`ELEVATOR_SIM_SECRET`, no default — a placeholder is how a development secret reaches production),
and, in production only, a real mailer. [`infra/README.md`](infra/README.md) is the Azure runbook:
Container App, PostgreSQL flexible server, and Communication Services for confirmation mail, with
the cost model derived from the template's own parameters rather than asserted beside it. Its § 0
says plainly which claims were verified by running them and which are still only reasoned about.

**The viewer is served from a CDN and the API from the container**, which removes a 32.2 s cold
first page load — [`docs/16-static-site-deployment.md`](docs/16-static-site-deployment.md) is the
runbook, and its § 9 keeps the same split between what was measured and what was argued. Arming it
found two defects that reading it had not, both fatal and both invisible until a real token was
exchanged ([§ D308](DECISIONS.md)).

## Status

**Phases 0–5 and 7–9 are landed and accepted. Phase 6 is partially complete** — see the table for
what that means, and read Phase 9's row rather than its tick: it is **accepted with named gaps**,
and the gaps are part of the verdict. Four packages (`core`, `experiments`, `viz`, `cli`), a six-command CLI, and a
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
| 6 — Destination dispatch & learned control | ⚠️ 6a (disclosure) and 6b (dispatch) accepted against a **raised** criterion, now measured on the Mixed-Use High-Rise the criterion names: **met by the Level-0 arm — and since [§ D333](DECISIONS.md) by the Level-1 panel too, at the heavy point.** The panel had been measured with a defect only it could suffer: `#tellThePanel` promised every waiter at a landing to one car with no capacity bound. Bounded, ΔTTD at up-peak 4 % (n = 200) is `−1.598 [−2.575, −0.621]` against `eta` and `−1.642 [−2.620, −0.663]` against `collective`, both **BETTER** and resolvable at that cell, with AWT and WT95 still **WORSE** beside them. The two lighter points remain INDISTINGUISHABLE, which is the shape an over-subscription defect predicts. 6c (learned control) is **implemented, measured, and NOT ACCEPTED** — and the refusal is no longer one operating point: it was swept over **eight pre-registered cells** and held, refused at **all five primary cells** under a multiple-comparison correction, with the smallest detectable effect re-measured at each cell rather than inherited from another. Two of those cells clear the correction and were **refused anyway**, because the effect is a third to a half of what the apparatus can resolve there. **The refusal has since held a third time, on the one condition the sweep named as missing**: measured under [§ D162](DECISIONS.md)'s pre-registered conditions at the mix-varying `lunch-two-way` point — where the detector's `two-way` pattern really is the incumbent — the learned arm's ΔTTD contains zero and sits below the cell's own TTD-measured limit, and the flat-mix negative control exposed the remaining advantage as a static weight-vector hybrid, not mix exploitation (`benchmark/lunchTwoWaySelection.ts`). Double-deck operation **is simulated**; its verdict became BETTER-EVERYWHERE once a real escalator replaced a lift leg the hardware would never pay for — on **two cells at one operating point where the previous answer had four at two**, and a better word on a narrower base is not a stronger result. Every sub-phase now has a measurement rather than a deferral, and the phase is still partial because one of them was refused |
| 8 — Testing campaign | ✅ All eight tracks landed — fuzzing, oracle across all five buildings, physics, statistics, determinism, scale, adversarial, and the full experiment matrix (8 cells × 12 profiles, Pareto front over AWT / energy / WT95) — and found four real defects, **all four now fixed**; the deep tier is green at 2 000 cases and **no property violation is outstanding**, so both halves of the criterion are met |
| 9 — Experience layer | ✅ **ACCEPTED WITH NAMED GAPS** — all nine units built, and the two clauses that decide the phase are met **by a run rather than by an argument**: the honesty property held under **search** over 60 cases, **271 985 generated strings** and 23 surfaces with **0 violations** — *after* finding two, one real and one a check accepting the wrong branch — and mode parity is **derived from the code**, not listed by hand. **The gaps are named because they are part of the verdict, not beside it**: clause 4, *every unit names its non-test caller*, is **satisfied in prose and mechanised by nothing** — no dead-code audit reaches `packages/viz`, so it is the clause to distrust first *(closed in wave 12: `packages/viz/src/deadCode.test.ts` mechanises it, [§ D192](DECISIONS.md) — verdict unchanged)*; `Escape` does not dismiss the drawer *(closed in wave 12, [§ D188](DECISIONS.md))*; and **U6**, **U7's rider models** and **Basic's curated three-dimension subset** are unbuilt |

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
[`docs/10`](docs/10-experience-layer-contract.md) — has **all nine of its units built** and, as of
2026-07-30, a status row: a Casual/Engineer split, a schema-generated dispatcher form, per-floor
rider queues, a building-mood gauge, an access-credential lens, a seven-stage campaign whose bars
are the shipped configuration's own measured scores rather than numbers somebody picked, and a
comparison tab that runs a proper replication batch in a worker and shows the interval without
naming a winner when the interval contains zero. **It carried no status row for as long as it had
no criterion**, and then for as long as the criterion was unmeasured — the row and the verdict land
together or neither does, which is [§ D163](DECISIONS.md)'s own rule. Both now exist, and the
verdict is **accepted with named gaps**: what a reader should take from it is not the tick but the
four gaps under it, the first of which is that *every unit names its non-test caller* is a sentence
in a document and not a test. TWIN operation — two
independently driven cars in one shaft — is **designed and not built**, in
[`docs/11`](docs/11-twin-shaft-contract.md); it is not double-deck, and the contract says why. A
phase's *status* is now bound to **evidence that
exists** — `validation/phaseStatus.test.ts` parses every status and citation out of the roadmap and
fails if an accepted phase names a test, study or pin group that does not — but **not to evidence
that supports it**: a phase could still cite a real suite that does not assert its criterion, and the
guard cannot tell a raised criterion from a weakened one. See [`docs/07` § 8](docs/07-handoff.md).

The browser viewer and building editor live in `packages/viz` and are dev-served with Vite;
`packages/core` exposes a `./browser` subpath so nothing pulls `node:fs` into a bundle.

**The menu, accounts and the leaderboard** ([`DECISIONS.md` § D214](DECISIONS.md), § D215). The shell
opens on a main menu — Campaign, Free Play, Leaderboard, Account, Settings — whose state is a pure
reducer with no `document` in it, and whose Free Play axes are **derived from `data/`** rather than
listed. `packages/server` is the first server this repository has had: accounts with `scrypt`
hashing, email confirmation behind a signed expiring token, opaque session tokens in a table, and a
leaderboard whose **entries are verified by replaying their seed**. That last part is the whole
anti-cheat design and there is no other part to it — a client-reported score measures willingness to
cheat, and invariant 5 already guarantees the fix, so the server re-runs the submission through the
same kernel every study drives and accepts the score only if it reproduces. A board is keyed by a
content hash of what it measured, so a `data/` change **starts a new board** rather than silently
invalidating an old one, and it ranks on **one declared metric** with the others beside it — never a
composite, for the reason [§ D106](DECISIONS.md) gives about energy. Its dependencies are
`node:sqlite`, `node:crypto` and `node:http`; the repository's runtime dependency count is
unchanged. The signing secret comes from the environment and **has no default**: a server started
without one refuses to boot.

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
