# CLAUDE.md

Instructions for agents working in this repository.

## What this project is

An elevator traffic simulator for designing and benchmarking smart dispatch algorithms.
Read [`docs/00-project-brief.md`](docs/00-project-brief.md) first, then
[`docs/01-architecture.md`](docs/01-architecture.md).

**If you are about to touch the game layer, read [`docs/38-what-the-game-is.md`](docs/38-what-the-game-is.md)
and [`docs/39-decisions-in-force.md`](docs/39-decisions-in-force.md) before anything below.** The product owner
re-declared the game on 2026-09-06 — three modes with Scenario first, one currency earned by playing, everything
playing live, and a model that carries a Burj-class building ([§ D525](DECISIONS.md), [§ D526](DECISIONS.md),
[§ D527](DECISIONS.md)) — and the records split out of this file into
[`docs/45`](docs/45-status-record.md) describe the four-tile front door and the mode names that ruling
retires. `docs/39` says which decisions are in force and which are superseded; nothing in `DECISIONS.md`
is deleted or renumbered.

**Current status: Phases 0–5 and 7–9 are landed and accepted, plus a six-command CLI. Phase 6 is
partially complete.** Read the three that need care precisely — and **Phase 9's tick is the one that
must never travel alone**, because it is *accepted with named gaps* and the gaps are part of the
verdict:

- **Phase 6**: 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against a
  **raised** criterion, measured on the building that criterion names ([§ D100](DECISIONS.md)).
  Since the Level-1 panel's promise to `carIds[0]` was given a capacity bound
  ([§ D333](DECISIONS.md)), **the gate is met by both arms** at Midtown's heavy point: at
  `up-peak-4pct`, n = 200, ΔTTD `−1.598 [−2.575, −0.621]` against `eta` and
  `−1.642 [−2.620, −0.663]` against `collective`, both **BETTER**. Say the shape with the verdict:
  the two light points stay INDISTINGUISHABLE, and AWT and WT95 are **WORSE** against `eta` there.
  On a second building, `one-wtc-class-reference` at its 2 %, `destination-eta` is
  INDISTINGUISHABLE and `destination-panel` is BETTER, so the effect is **building-dependent**, the
  verdict is not moved, and **no mechanism is offered** ([§ D595](DECISIONS.md)). **6c (learned
  control) is implemented, measured and NOT ACCEPTED** ([§ D139](DECISIONS.md) is the criterion,
  [§ D145](DECISIONS.md) the verdict), and the refusal held over eight pre-registered cells
  ([§ D151](DECISIONS.md), [§ D156](DECISIONS.md)) and on `lunch-two-way`
  ([§ D162](DECISIONS.md), [§ D169](DECISIONS.md)): what would move 6c now is a different
  selector, not a different measurement. Double-deck operation is **simulated**
  ([§ D131](DECISIONS.md), [§ D598](DECISIONS.md)); **no residual is published for a double-deck
  bank**, because `oracle/upPeakCase.ts#isolateBank` drops the deck fields. The row's long form,
  with every interval, is [`docs/45`](docs/45-status-record.md).
- **Phase 8** — **both blocking property violations are closed**, and neither was closed by moving a
  bound: `fuzz-1001074` by a fourth `awtIsValid` ground, `fuzz-1000384` by revoking a promise a
  withdrawn car cannot keep. The deep tier is green at 2 000 cases. **All eight tracks have landed**;
  the eighth — the full experiment matrix and Pareto front at a real budget, which carries Phase 7's
  acceptance interval at 50–200 replications — landed in `f895a16`, so the phase's criterion (*every
  track lands, and no property violation is outstanding*) is met ([§ D108](DECISIONS.md); § D102 is
  the superseded partial verdict, left standing).
- **Phase 9** — **ACCEPTED WITH NAMED GAPS (2026-07-30)** against [§ D163](DECISIONS.md), which also
  wrote the rule that *the status row and the verdict land together or neither does*. All nine units
  are built. The two clauses that decide the phase are the two the product **failed** when the
  criterion was written, and both are now met **by a run rather than by an argument**: the honesty
  property holds under *search* — and it **found two violations first**, one real and one a check
  accepting the wrong branch, so [§ D172](DECISIONS.md)'s *"the refinement relation, not a run"* had
  to be corrected ([§ D186](DECISIONS.md)); and mode parity is **derived from the code**, proved
  against a fail state the product deliberately does not ship.

  **The honesty corpus, both tiers, as of wave AL, measured 2026-09-26 on the integrated tree.**
  Every earlier wave's move, its decomposition and what it taught are in
  [`docs/44`](docs/44-honesty-corpus-log.md), newest first:

  | tier | cases | strings | simulations | surfaces | failing cases | verdict |
  |---|---|---|---|---|---|---|
  | always-on | 49 | **926 377** | **606** | **75** | **0** | **green**, and the register is empty |
  | deep (`ELEVATOR_SIM_HONESTY=deep`) | 60 | **1 157 486** | **4 710** | **76** | **0** | **green**, and the register is empty |

  **How this row is kept.** Each rule below was learned the hard way at least once, and the log says
  where. They are stated once here and nowhere else in this file ([§ D1236](DECISIONS.md)).

  - **Measure once, after integration, on a tree green in all six projects**, never per branch. A
    branch figure is stale the moment the branch merges, and a row taken on a tree red in one
    project is moved by the lane that fixes it. The deriver is `honesty/measure.corpus.test.ts`,
    which writes the figures and the whole surface set to a file because vitest swallows
    `console.log`.
  - **The always-on row is measured on the integrated head each wave; the deep row is read from the
    nightly job.** The `corpus-figures` job in `.github/workflows/deep-tiers.yml` measures both tiers
    on `main` in one sitting and writes them, with the commit they are true of, to its job summary
    and its `corpus-figures` artifact. The deep row is republished from the first nightly run after
    the wave merges, and until then it names the commit it describes.
  - **Re-measure the base first.** Only a base measurement tells a correction from a move; waves Y,
    Z and AC-2 each found the published row had drifted under waves that never re-measured it.
  - **Diff the surface sets, never only the counts.** A count cannot say whether a move is a new
    screen or a correction. The deep tier leads by exactly one surface,
    `campaign/judge.ts#judgeStage`, which speaks in no other tier.
  - **Never split a move between lanes by quotient** ([§ D256](DECISIONS.md)). A set difference is a
    measurement and so is a probe that renders cases on both trees and tallies by producer; a
    division is neither.
  - **A lane publishes a forecast, never a figure, and a forecast is a floor unless it is derived
    term by term.**
  - **A wave's entry in `docs/44` is at most about 120 words of prose**, tables excluded;
    `documentation.test.ts` holds that cap.

  **The named gaps travel with the verdict.** Clause 4, *every unit names its non-test caller*, is
  mechanised for reachability and not for the naming: every `packages/viz/src` directory is in
  `deadCode.test.ts`'s `AUDITED_MODULES`, asserted against disk in both directions, and no test
  checks that a unit *names* its caller in prose. **42 statically swept DOM entry points** are not
  driven *(**21** mounts and **21** screen-registry rows, derived by
  `packages/viz/src/honesty/derive.test.ts`; the screen rows' pure halves **are** driven, so what
  goes unswept is only what an entry point authors inline)*. And **U6**, **U7's rider models** and
  **Basic's curated three-dimension subset** are unbuilt. The long form, with the temporal axis's
  first two findings and the dead-code audit's history, is [`docs/45`](docs/45-status-record.md).

**No verdict is rounded up.** Wave 6 built double-deck simulation, a mid-run weight-set selector,
Phase 7's fuzzy detector, Phase 6c and Phase 9's W4, and moved no phase verdict: the fuzzy arm's
ΔTTD `−0.212 [−0.416, −0.007]` excludes zero and is still reported **below the resolution limit**,
because an interval excluding zero is not a win when the effect is smaller than the apparatus can
resolve. The long form of this section, and of each paragraph below, is
[`docs/45`](docs/45-status-record.md).

**Energy is an axis, never a score** ([§ D106](DECISIONS.md)). Show it **beside** AWT and WT95,
never aggregated into a grade, with `EnergyStatistics.workPerServedLegKJ` beside the raw figure: a
configuration that spends less by serving fewer people has saved nothing, which is why
`nearest-car`, the weakest shipped dispatcher, sat on the Pareto front at six of eight cells. **One
single, independent, unweighted** pass-or-fail goal on `workPerServedLegKJ` is permitted and ships
([§ D367](DECISIONS.md)): 80 kJ a ride over a slice ([§ D468](DECISIONS.md)) and 350 kJ over a
whole authored day ([§ D962](DECISIONS.md)). Still forbidden: a weight, a combined score, a letter
or star, and ordering two arms on energy.

**The page opens on Everyday Mode** ([§ D335](DECISIONS.md), [§ D338](DECISIONS.md)):
`packages/viz/index.html` loads `everyday/boot.ts`, which imports `dev/main.ts` for its side effect,
so the Engineer surface still builds and starts. Before touching either shell: **`inert` has three
non-test writers** (`menuPanel.ts#coverShell`, `everyday/shell.ts#setInert`, and
`everyday/boot.ts#dismissEngineerMenu`), and the outer cover wins while it is up, because an
unguarded write hangs the renderer. **Neither root is ever hidden with `display:none`**, because
canvases size from their laid-out box. `dev/main.ts` may not import the Everyday shell; the way
back goes through `everyday/swap.ts`. The browser tier reaches the Engineer surface through the
player's own path (`enterEngineerStage`, `reopenEngineerMenu`). The swap is not remembered, by the
guide's § 3.5. `everyday/types.ts#EVERYDAY_SCREENS` carries the screen count, so it is not repeated
here ([§ D723](DECISIONS.md)). A first arrival meets `everyday/landingScreen.ts` on the tutorial's
own gate; that page publishes no figure, and `landingView.test.ts` holds both that and its button's
two labels.

**The viewer is built to a design handoff**, vendored at [`docs/design/`](docs/design/) and
extracted in [`docs/12-design-handoff.md`](docs/12-design-handoff.md)
([§ D174](DECISIONS.md) to [§ D179](DECISIONS.md)). **The handoff wins every disagreement about what the
screen looks like, and the simulator wins every disagreement about what a number means**: the
prototype's toy simulator is not a source for any figure.

[`docs/07-handoff.md`](docs/07-handoff.md) is the resume brief. Work proceeds by the phases
in [`docs/05-roadmap.md`](docs/05-roadmap.md), which carries each phase's acceptance verdict and the
measurements behind it. Read its **Standing requirement — the integration seam has an owner** before
planning work: a behaviour that is configurable, unit-tested in isolation and never called from a
shipped path passes every other check this repository runs, and has shipped **eleven** times in code
and **twice** in `data/`. The ordinals name instances (*the ninth* is § D114's, *the eleventh* the
deck API's) and are never renumbered. What that history taught:

- **Name the non-test caller.** A barrel re-export and a `{@link}` tag look exactly like a caller
  and are not one.
- **Move the control and require the run to change, compared on the legs** rather than on a window
  statistic. If you add a control, add that test ([§ D177](DECISIONS.md), [§ D219](DECISIONS.md)).
- **It binds both ways.** A control that writes nothing must say so, and a control that writes
  something may not claim it writes nothing; a refusal is pinned by a run, never by another
  sentence ([§ D227](DECISIONS.md)). A feature can also be observable only **through a bug** and
  inert without one ([§ D265](DECISIONS.md)).
- **Data is not exempt.** `destination-eta` shipped a destination term weighted at zero and was
  bit-identical to `eta` at 8 of 8 matrix cells ([§ D112](DECISIONS.md), [§ D114](DECISIONS.md)).
- **A stated mechanism goes stale the same way.** The access-control mechanism § D60 refuted stays
  refuted, and where destination dispatch's saving comes from is **unmeasured**
  ([§ D256](DECISIONS.md), [§ D279](DECISIONS.md), [§ D280](DECISIONS.md));
  `packages/experiments/src/validation/documentation.test.ts` holds both. If you write a sentence
  about *why* something performs better, either measure it or say it is unmeasured.
- **A published number goes stale the same way.** If you publish a number, pin it to the run that
  produced it.

## Non-negotiable invariants

These protect the statistical validity of every result the project produces. Treat
violations as bugs, and reject changes that introduce them.

1. **`Car.estimateCost()` is pure.** No mutation of any simulation state. The dispatcher
   calls it thousands of times per decision to evaluate hypotheticals.
2. **No global RNG.** Every random draw comes from a named stream on the injected
   `StreamSet`. A single shared RNG desynchronizes common random numbers and destroys
   comparison power — see [Architecture § Determinism](docs/01-architecture.md#determinism-strategy).
3. **No wall-clock time in `core/`.** All time comes from the kernel. No `Date.now()`,
   no `performance.now()`, no timers.
4. **Event queue ties break deterministically** by `(time, sequence)` — the field is `sequence`
   (`kernel/eventQueue.ts:19`), and the queue owns the counter so a caller cannot supply one.
   Never by
   insertion order into a hash structure.
5. **Every persisted run record carries its seed**, so any run replays exactly.
6. **`core/` never depends on `viz/`.** The core must build and test with `viz` absent.
7. **Anything tunable is data, not code.** Dispatch strategies are weight vectors in
   `data/dispatcher-profiles.json`, not classes. If you find yourself writing
   `if (strategy === 'nearest-car')`, stop — that belongs in config. Only a genuinely new
   *cost term* justifies new code. See
   [Parameterization & Tuning](docs/06-parameterization-and-tuning.md).
8. **Every tunable declares its schema** — type, range, default, and `activeWhen` for
   conditional parameters — so the space is explicit and checkable, and a search over it needs no
   elevator-specific knowledge: `tuning/search`'s random search, successive halving and sep-CMA-ES
   sample the space `tuning/space` collects — every declared row a dispatcher profile can hold —
   without one. **Nothing beyond that is planned**: Phase 7's schema-driven search entry point,
   Bayesian optimization and OCBA were withdrawn by the project owner on 2026-09-10 (GitHub issue
   #416, [§ D538](DECISIONS.md)), and the declaration stands on its own.

## Statistical discipline

The single most likely way this project fails is by reporting confident nonsense. The
literature documents the exact failure mode: *increasing lift speed appearing to increase
average waiting time*, because the real difference is smaller than the noise.

- **Never** declare one dispatcher better than another without a **paired-t confidence
  interval that excludes zero**.
- **Never** compare two separate confidence intervals and conclude from overlap. Overlapping
  intervals do not imply no significant difference.
- **Budget 50–200 replications** per configuration. Ten is not enough — it produced a 12%
  error against the converged mean in the reference study.
- Always feed **the same passenger traces** to every alternative under comparison (common
  random numbers). It is worth 5–20× in required run count.
- If a configuration saturates, **flag it and suppress the AWT interval**. Do not report a
  mean for a system whose queues grow without bound. **Saturation is one of five grounds**, not the
  whole rule: `awtIsValid` also fails on an empty window, on censoring above the unserved limit, and
  — since Phase 8 found a run publishing a mean beside a **922.7 s** wait — on a leg past the 900 s
  abandonment horizon. The trend test sees a queue still growing at the horizon and the censoring
  test sees one that has not cleared by it; **neither sees a queue that grew enormously and drained
  just in time.**
  **The fifth landed with wave 13's patience feature, and it sits above censoring rather than
  below it.** Once riders actually leave, an abandonment rate above 2 % suppresses the mean outright
  — because abandonment *improves* AWT by construction, removing the longest waits from the sample:
  at `midtown-office` 6 % with a 120 s mean patience, AWT goes **61.9 s → 23.3 s** with fifty-one
  riders gone. The ordering is by cause and was moved by measurement: drafted below `censored`, the
  first run that abandoned anyone reported *"too many arrivals were never served"* about a window
  whose queue had drained perfectly — true, and useless, since it sends a reader hunting a backlog
  that went home. **Abandonment and stairs uptake are published beside AWT, never folded into it**,
  on exactly the footing `workPerServedLegKJ` sits beside raw energy ([§ D106](DECISIONS.md)): a
  configuration that improves its wait by serving fewer people has not improved anything.
  See [`docs/03` § Saturation detection](docs/03-traffic-and-statistics.md).

Full detail in [`docs/03-traffic-and-statistics.md`](docs/03-traffic-and-statistics.md).

## Correctness oracle

Under pure up-peak, simulated interval and handling capacity must match the closed-form
Barney/CIBSE round-trip-time calculation within a few percent — **but only against the
*corrected* closed form**. The raw textbook comparison is ~25 % out and
`analytical/validation.test.ts:822` says so in terms; agreement reaches ~3 % once
`correctedRoundTripSeconds` restores two documented omissions (`stop-time-excludes-acceleration`,
`no-minimum-dwell`). A reader who runs the raw comparison and finds 25 % has found the textbook's
simplification, not a broken simulation. Implement that calculation
as a test. If simulation and closed form diverge, assume the simulation is wrong until
proven otherwise.

**One configuration is exempt, and the exemption is mechanised rather than promised.** Since GitHub
issue #444 a car may have two top speeds — a rated speed up and a lower descent limit, by design
(TWIN) or by `data/elevator-specs.json`'s air-pressure cap above 300 m of travel. The published
expression has exactly one `tv` and charges it twice, `2·(H·tv + tx)`, so it has nowhere to put the
asymmetry; extending it here would mean validating the simulator against arithmetic no reference
states, which is the circularity `analytical/`'s import discipline exists to prevent. So the
expression is left exactly as CIBSE publishes it, `CLOSED_FORM_ASSUMPTIONS` carries the divergence
as `symmetric-speed` (`bias: 'under'`), and `analyzeUpPeak` raises
`UP_PEAK_WARNING_CODES.directionalSpeedAsymmetry` on any bank whose cars have one — so a residual
measured there arrives with the reason attached rather than as a defect. **It stopped being raised
on no shipped building on 2026-09-15**, and that is a result rather than a regression: this
paragraph read *"raised on no shipped building, because every shipped car is symmetric"* for as long
as the exemption was a disclaimer about nothing, and `ctf-class-reference/shuttle` — 20 m/s up,
10 m/s down, the design Hitachi publishes for that tower — is now the one bank in
`data/buildings/` that raises it ([§ D577](DECISIONS.md), GitHub issue #425).
`analytical/upPeak.test.ts` asserts that in **both** directions, this bank and no other, because
half the claim is that the detector is not simply on. Under a symmetric configuration the oracle
agrees exactly as it did: `analytical/validation.test.ts` runs unchanged at its pinned tolerances.

## Modeling rules that are easy to get wrong

- **Cars fill to 80% of rated capacity, not 100%.** Using 1.0 makes everything
  systematically optimistic.
- **Model jerk and acceleration properly.** Short hops never reach rated speed. A simulator
  that ignores this will wrongly conclude faster elevators always help.
- **Passenger mass is a distribution, not a constant.** Otherwise the load sensor has
  nothing to measure.
- **Passengers arrive in batches**, not one at a time.
- **The three kinds of zoning are distinct concepts** — service (physical), access
  (credential), operational (dispatcher strategy). Never collapse them into one field.
- **Normalize cost terms before weighting.** Raw `waitTime` (0–120 s) and `stopCount`
  (0–20) on the same scale produce uninterpretable weights and an unsearchable space.

## Tuning discipline

- **Hold out traffic seeds.** Tune on one seed set, validate on a disjoint one, or you
  overfit the weight vector to specific passenger traces and the gain vanishes on new
  traffic.
- **Use common random numbers across candidates** within an optimization round.
- **Do not scalarize too early.** Report the Pareto front over (AWT, energy, WT95); the
  energy-versus-wait tradeoff is the operator's call, not a constant to bake in.
- **Tune per traffic pattern.** The optimum for up-peak is not the optimum for down-peak.

## Conventions

- TypeScript. Strict mode.
- Units are SI internally (metres, seconds, kilograms, m/s). Imperial values appear only
  in reference data and display formatting, always with the unit in the identifier
  (`ratedLoadLb`, `minSpeedFpm`). **`speedFpm` is not an identifier in this tree** — it was named
  here in error, and three sites copied the wrong name back out of this sentence:
  [`docs/29`](docs/29-audio-direction.md) § 8 (corrected on this commit),
  [`DECISIONS.md`](DECISIONS.md) § D448's transcription of this rule, and
  `packages/viz/src/everyday/units.ts`'s docstring. The last two are left standing — a decision
  entry is not rewritten after the fact, and a `.ts` docstring is outside a markdown-only change.
- Time is simulated seconds, a plain number, always sourced from the kernel.
- Prefer pure functions in `core/`. Side effects belong in the kernel and the runner.
- Tests colocate with source as `*.test.ts`.

## Reference data

- [`data/elevator-specs.json`](data/elevator-specs.json) — elevator classes, capacities, timings, and the
  `airPressure` block: the descent cap above a declared travel and the cabin pressurisation that
  lifts it. That block is not a property of a class, which is why it sits beside them rather than
  inside one.
- [`data/traffic-profiles.json`](data/traffic-profiles.json) — demand profiles by building type
- [`data/dispatcher-profiles.json`](data/dispatcher-profiles.json) — cost term library and dispatcher weight vectors
- [`data/buildings/`](data/buildings/) — test building configs; see its README for the schema

Reference values come from CIBSE Guide D, ISO 8100-32, and published lift-engineering
literature. Sources are cited at the bottom of each doc. If you change a reference value,
cite why.

## Working agreements

- Keep [`docs/05-roadmap.md`](docs/05-roadmap.md) phase status current as work lands.
- A phase is done when its stated acceptance criteria pass, not when the code exists.
- If you hit a decision the docs don't cover, record it in the relevant doc rather than
  only in a commit message.
- Do not weaken an acceptance criterion to make a phase pass. Raise it instead.
- **Per-wave local verification is the guards, the touched directories and the always-on corpus;
  CI is the full six-project run** ([§ D1236](DECISIONS.md)). A lane runs the files it touched, their
  neighbours, and the guards (`testCost`, `boundaries`, `deadCode`, `honesty/derive`,
  `documentation`, `citations`); the integrator adds the always-on corpus on the integrated head
  and leaves the whole of every project to the pull request's CI. The integrator still does not
  merge on red.
- **A wave's row is short.** Its row in [`docs/05-roadmap.md`](docs/05-roadmap.md) and its entry in
  [`docs/44`](docs/44-honesty-corpus-log.md) are each at most about 120 words of prose, tables
  excluded; the reasoning belongs in a decision entry or a docstring, and `documentation.test.ts`
  holds both caps.
- **One push per wave, not one per commit.** Commit as often as you like; push when the wave is
  ready. Every push to a **pull request branch** cancels the CI run in flight (`ci.yml:127` sets
  `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`) and starts a fresh suite
  (11 minutes at the median and 18 at p90 over the fortnight to 2026-09-25; it was ~45 before the
  legs were split), and the cancelled run completes a check suite on a head nobody
  cares about — which arrives as a `check_suite.completed` notification saying *"no third-party check
  suite is still running or failed"* about a commit that is no longer the head.
  **`main` has had no push run since [§ D1084](DECISIONS.md)**: it is tested by a nightly `schedule`
  run, keyed on **its own commit** rather than on `github.ref` as the push run was since
  [GitHub PR #386](https://github.com/mrpeanut01/elevator-sim/pull/386), because
  `cancel-in-progress: false` protects only a *running* run: GitHub keeps at most one **pending**
  run per group, so a third arrival evicts the queued one whatever the flag says. That was found by
  losing a run (`RISKS.md` R46 carries the three run ids), and restoring the push trigger restores
  the key with it. **A guard's red should now arrive in minutes rather than at the end of a leg**
  (about two is § D1084's estimate, unmeasured until the job's first runs): the `guards` job re-runs the
  registry, census, wiring and document tests (`testCost`, `boundaries`, `deadCode`,
  `honesty/derive`, `documentation`, `citations` and their like) on a runner of their own, beside
  the legs that still run them, so read that check first. Measured on
  2026-09-02: four pushes in one hour, three of them cancelling a run (one 45 minutes in), five
  spurious notifications, and one of those envelopes described a head whose sibling job had been
  **cancelled rather than passed**. Acting on any of them would have meant declaring CI green while
  it was still running. **This is discipline and not a gate** — nothing enforces it, which is why it
  is written where it will be read rather than asserted somewhere a test could pretend to check it.

**Two things that look like the fix for that and are not, so nobody spends an afternoon on them.**
`paths-ignore` on `**.md` would be **wrong**: `validation/documentation.test.ts`,
`validation/citations.test.ts` and `everyday/viewportGateClaims.test.ts` read the documents
themselves, so a markdown-only change can legitimately fail this suite and skipping it would skip the
guards that exist for exactly that. And a `paths:` filter does not narrow a pull request at all —
GitHub evaluates it against the **whole PR diff** rather than the individual push, which is why
`deploy-viz.yml` already carries a `paths:` list naming only `packages/**` and friends and still ran
on a push that touched two root `.md` files and nothing else.

**Decision numbers are reserved for you before you start, and *the relevant doc* is usually your own
module.** Two halves, both [§ D404](DECISIONS.md) and [§ D405](DECISIONS.md), and they exist because
reading the agreement above as *"every decision needs a `DECISIONS.md` entry"* while having no safe
way to claim a heading produced **sixty-four** sites saying a number was owed and none allocated.
**Your numbers are in your own dispatch brief** — the integrator pre-allocates a contiguous block per
lane before any lane starts, you allocate from it sequentially, and you report the highest you used.
Do **not** take numbers from `CHARTER_PROGRAMME.md`'s *Next free decision number* row: that row is
the integrator's input, it is stale for the whole duration of a wave, and two lanes reading it both
computed § D336. Need more than your block? Ask; never take the number above it, because the next
lane holds it. A number your block does not spend stays **unused permanently** and is registered in
`documentation.test.ts#KNOWN_DECISION_HOLES` — ids here are names, so backfilling one makes it mean
two things. And a `DECISIONS.md` entry is owed only when the decision **reaches past the module that
took it**: when it binds code or documents that module does not own, when it moves or refuses
something already recorded, or when a document refuses to cite itself without one. Otherwise your
docstring *is* the record the agreement asks for — say so and cite § D405, rather than writing that a
number is owed, which `documentation.test.ts` counts as debt against a ratchet that may only fall.
