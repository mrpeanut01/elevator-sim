# Building behaviour — the contract

**Status: designed; every step 0–6 built. Criteria written before the implementation,
which is the point — step 2's criterion is the first one measurement sent back for correction, and
step 6's is the first one measurement sent back with an answer nobody wanted to publish and a gate
that had to be raised before it could be.**

| Step | State |
|---|---|
| **0 — dual-lobby / escalator authoring (§ 5a)** | **built, and § 5 criterion 2 met on the legs** — `SpecTransportMode` on `BuildingSpec`, emitted by `buildingFromSpec`, read back by `specFromBuilding`, refused in the designer by `validateSpec`, with the controls in `dev/buildingEditor.ts`. **Say the gaps in the same breath**, below |
| **1 — traffic seed separation (§ 1.1)** | **built** — `StreamSet(seed, { trafficSeed })`, reaching `runSimulation` and reported on the result; `sim/trafficSeedSeam.test.ts` drives it end to end |
| **2 — `trafficModel: 'v2'` + `batchSize` stream (§ 1.3)** | **built** — `batchSize` in `STREAM_NAMES` and `TRAFFIC_STREAM_NAMES`, `trafficModel` on the run config and reported on the result when it is not `v1`; `sim/trafficModelSeam.test.ts` drives it end to end. **§ 1.3's stated consequence was wrong and is corrected below.** |
| **3 — mass control, group-size curve (§§ 2.1–2.2)** | **built** — three group-size families and a schema-bearing mass block with required truncation bounds, all five samplers one-draw-per-call so none is gated to `v2`; `traffic/varianceControls.test.ts` drives each on the legs |
| **5 — patience, lobby crowding, stairs (§ 3)** | **built, and the gaps are part of the verdict** — abandonment with a fifth `awtIsValid` ground above censoring, a crowding term that **destabilises four of nine measured cells** (a finding, not a bug), and stairs with both asymmetries. **§ 3.3's condition 2 is withdrawn**, below. Criterion 4 is met inside `core` and **not** at the renderer the way [§ D106](../DECISIONS.md)'s rule is — `viz/shift/goals.ts`'s horizon goal is still improved by abandonment with no figure beside it, bridged by a run-record disclaimer and not closed. **That is the clause to distrust first.** |
| **6 — the teaching surface (§ 4)** | **built, and § 5 criterion 5 answers with a fourth refusal** — a declared `TeachingSpec` whose four rules are refusals, `tune --teaching` as its named non-test caller, and a pre-registered spec measured at n = 200 on held-out traffic. **The gate was raised while it ran**: the first run cleared all four of the criterion's clauses at both cells, and § D200's static-hybrid control — promoted here from a follow-up to a gate clause — refuses both. Say it in the same breath as the intervals, below |
| **4 — inter-day variability (§ 2.3)** | **built, and § 5 criterion 3 met by a measurement** — `dayVariation` is a named stream (`core/src/random/streams.ts:97`), drawn at `traffic/generator.ts:1405`, with a partial declaration refused at `:583`/`:589`; `peakShiftS` is implemented in `traffic/demandTemplate.ts:301-349`; and `runner/crn.ts:204-210` puts the block in the CRN cohort key, which is the clause criterion 3 exists to force. `sim/dayVariationSeam.test.ts:14-45` is the measurement — variance ratios **8.30, 3.51, 3.68, 3.33** with Pitman–Morgan t from **18.83** down to **7.08**, and beneath the statistics an exact assertion that both shared-day arms report the identical drawn day and structural trace digest, because a variance ratio alone cannot tell *shared* from *lucky*. [§ D208](../DECISIONS.md) is the recorded judgement. **This row said `designed` for the whole time the step was built**, which is [§ D227](../DECISIONS.md)'s shape pointed at a status table rather than at a refusal, and it was found by a verification lane reading GitHub issue #174 rather than by anything in the suite — no test reads this table |

**Step 0's criterion is met by a run, not an argument.** Three banks, both lobby levels marked
transfer, and the escalator the only difference between the arms: `servedFloorIds` byte-identical,
**205 lift legs without the machine and 154 with it**, and the books balanced rather than inferred —
the same journeys generated in both arms, the same undelivered count, and every lift leg that
disappeared became exactly one `ConservationAudit.transportHops` entry. The landing picker and the
traversal-time field each move the run on their own. An adversarial check confirmed the negative
case: strip `transportModes` from the document before `parseBuilding` and the run returns
bit-identical to the control, so a mode the router ignored genuinely fails the test.

**The four gaps, named rather than left to be discovered:**

1. **`drawTransport` has a shipped caller and no DOM driver.** `dev/main.ts` is the only caller of
   `mountBuildingEditor`, and no test drives the mounted panel. This is the known Phase 9 gap — the
   **33 statically swept DOM entry points**, of which this mount is one — matched exactly by the
   access-zone editor beside it. It is **not widened** by this step, and it is not closed either.
   *(This sentence named that gap ~~"three DOM panels are statically swept rather than driven"~~
   and then put a fifth panel in it, which is how a count stops being a measurement and becomes a
   label: nothing was wrong about the gap, and the figure could no longer go stale visibly. It is
   derived by `packages/viz/src/honesty/derive.test.ts` now — [§ D421](../DECISIONS.md).)*
2. **The round trip carries three fields, not five.** `id`, `connects` and `traversalTimeS`
   survive; `name` and `$comment` do not, both deliberately (`buildingSpec.ts`'s
   `specFromBuilding` states the reason for each). `authoring.test.ts` asserts the surviving key
   set **exactly**, so the claim cannot quietly widen or narrow.
3. **Static `title` prose in `index.html` has no producer, so `honesty/derive.ts` cannot classify
   it.** Two sentences describing the landing pickers were false about the mechanism they
   described and were caught by review rather than by a test. They are now pinned in both
   directions in `buildingEditor.test.ts`, but that is a targeted pin on two claims, **not** a
   sweep of the file — the rest of `index.html`'s control copy remains unswept.
4. **The EN 115-1 seed extrapolates past its own clause above a 6 m rise.** The two-flat-step
   allowance is stated for a rise of 6 m or less, which covers every adjacent floor pair the
   height slider can produce. A machine spanning more floors says so in its own emitted
   `$comment` rather than presenting the figure as a citation.

Step 0 emits the citation `TransportModeConfig.traversalTimeS` requires — the derivation is
computed from the spec's own geometry on every write rather than carried, so it cannot go stale,
and a hand-set figure is labelled the author's and explicitly **not** cited.

This document covers one program in three parts: **richer traffic variance**, **passenger
behaviour**, and **a learned dispatcher you can teach**. They are one program because they share a
constraint, a seed discipline, and an acceptance bar, and because building any of them badly would
cost the same thing — the ability to trust a number this repository already published.

The motivating request was that the simulator should feel more like *a building* and less like a
demand generator. That is the right goal. `README.md` § What this does not claim states the gap
plainly: a rider here will queue for twenty minutes without ever glancing at the stairwell, which no
real person does. What follows is how to close that without giving up the thing that makes the
numbers worth having.

---

## 0. The constraint that governs everything below

**Every feature here arrives opt-in and off by default, and a run that does not ask for it must be
bit-identical to the run before the feature existed.**

This is not caution for its own sake. `DECISIONS.md` § D151 § 7 fixed the rule in advance, before
the last traffic-model change landed:

> It must be opt-in and byte-identical when unused. Every existing published number must reproduce
> exactly; a traffic-model change that moves a shipped figure invalidates far more than this phase.

The blast radius is measurable rather than hypothetical. This repository carries **981 pinned
estimates** across `benchmark/published.ts`, plus the trace and result identity guards in
`core/src/traffic/mixIdentity.test.ts` and `transportIdentity.test.ts`. A traffic change that moves
a draw silently moves all of them, and the failure looks exactly like the one § D196/§ D201 spent a
wave unpicking — a pin that is correct on one tree and wrong on another, with no way to tell which
was right.

### The specific trap in this program

`drawBatchSize` drew from the **`arrivals`** stream (`traffic/generator.ts`, now
`batchSizeStream` at the head of pass B). Group size and arrival instants shared a sequence, and
still do under `v1`.

So *any* change to the group-size curve — even one that leaves the mean untouched — consumes a
different number of draws from `arrivals` and shifts every subsequent arrival instant in the run.
The trace does not change a little. It changes completely.

> **Measured, and overstated.** The paragraph above was written before the change; it is not what a
> run says. `drawGeometricBatchSize` consumes exactly one draw per call for every mean, so *today*
> the draw count moves only with the **number of batches**, and the coupling that is real is
> **across demand sources** rather than within one. See § 1.3 → ***What measuring it found***, which
> states the corrected version and the two measurements behind it. The conclusion — that the move
> must be gated and landed alone — is unchanged, and § 2.2 is exactly when the strong form returns.

That is what makes "give group size its own stream" a **correctness** change and not a tidiness one,
and it is also why the move cannot be made silently: relocating the draw is itself trace-moving. The
sequencing in § 1 exists to make it survivable.

---

## 1. Seeds and streams

### 1.1 A traffic seed, separate from the run seed

Before this step, one seed derived every stream (`random/streams.ts`), so "same building, different crowd" is
impossible to ask for: changing the seed changes the door obstructions and the policy noise too.

**Contract.** A run accepts an optional `trafficSeed` distinct from `seed`. When absent it is
derived from `seed` exactly as today, so every existing run is unchanged. When present it seeds the
demand-side streams — `arrivals`, `origins`, `destinations`, `passengerMass`, and the new streams
below — while `doorObstruction` and `policyNoise` continue to derive from `seed`.

What that buys, and why it is worth a config field:

- **Re-roll the crowd, hold the machine.** Twenty different Tuesdays against one building.
- **Hold the crowd, change the machine.** This is common random numbers expressed as a knob, and it
  is the comparison the whole project is built around.
- **A held-out traffic set for the learned dispatcher** (§ 4) that is disjoint by construction
  rather than by convention.

**Invariant 5 still binds.** Both seeds are persisted on the run record and both are printed. A run
that replays needs both, and a record carrying one is a bug, not a shorthand.

### 1.2 New named streams

Added to `STREAM_NAMES`, because invariant 2 admits no unnamed draw:

| Stream | Draws |
|---|---|
| `batchSize` | group size — **moved off `arrivals`**, see § 1.3. **Built.** Also in `TRAFFIC_STREAM_NAMES`: how many people walk in together is a fact about the crowd, so § 1.1's traffic seed must seed it |
| `patience` | per-passenger abandonment tolerance (§ 3.1) |
| `modeChoice` | stairs-versus-lift decision (§ 3.3) |
| `dayVariation` | the per-day multipliers of § 2.3 |

### 1.3 Moving `batchSize` off `arrivals` — the one unavoidable break

There is no way to give group size its own stream without changing what `arrivals` yields. The move
must therefore be **gated on the same flag as the features that need it**:

- `trafficModel: 'v1'` (default) — `batchSize` draws from `arrivals`, exactly as today. Every pin
  reproduces. This is the branch every existing test and every published figure runs on.
- `trafficModel: 'v2'` — `batchSize` draws from its own stream, and §§ 2–3 become available.

Two model versions is a cost, and it is smaller than the alternative. The alternative is
re-deriving 981 pinned estimates and every identity digest in one commit, which destroys the ability
to say *"this figure has not moved since Phase 5"* — the property those pins exist to provide.

`v1` is deleted when the last figure that depends on it has been re-derived under `v2` **and the
re-derivation has been published as a comparison**, not before.

#### What measuring it found — the paragraph above overstated the coupling

Built and measured 2026-07-31. The step landed; **the sentence at the head of § 0 did not survive
contact with a run**, and it is corrected here rather than quietly dropped.

The pre-registered test was *"under `v1`, changing the group-size mean shifts arrival instants;
under `v2` it leaves them untouched"*. It was written first, watched failing, and its second half
then **failed on the finished implementation** — for two reasons, both properties of the model
rather than defects in the wiring:

1. **`batchesPerSecond = passengerRate / meanBatchSize`** (`traffic/poissonBatch.ts`). Total
   *passenger* demand is held fixed, so the *batch* arrival rate is a function of the mean **by
   construction**: bigger groups mean fewer, larger batches. No stream separation can make the batch
   arrival process invariant to the group-size mean, and one that did would describe a building
   where raising the group size raised the headcount. Measured: a mean change moves the instants
   under `v2` exactly as it does under `v1`.
2. **`drawGeometricBatchSize` consumes exactly one draw per call for every mean**, deliberately and
   with its own comment saying so. So a mean change never changes the *per-batch* draw count. A
   **rate-compensated** change — mean and passenger rate scaled together, batch rate held fixed —
   leaves the instants untouched under `v1` *and* `v2` alike. Measured, and now asserted, because
   it is the property a future group-size sampler must not quietly break.

So *"any change to the group-size curve consumes a different number of draws"* is false today. The
draw count changes only through the **number of batches**, and the coupling that is real is
**across demand sources**, not within one:

> `generateTrace` walks `plan.sources` in order and, for each, draws all of that source's arrival
> times (pass A) and then all of its group sizes (pass B). Under `v1` both come from `arrivals`, so
> **source *k*'s group sizes displace source *k+1*'s arrival times.** The residents of Midtown
> Office turn up when they do partly because of how many people walked through the lobby door
> together.

That is what `v2` removes, and it is measured directly: at one fixed configuration and seed, `v1`
and `v2` agree exactly on the **first** source's instants — drawn before any group-size draw exists
— and disagree on **all nineteen** later ones. One unchanged and nineteen displaced is the coupling
seen rather than argued.

**None of this weakens the case for the flag; it sharpens what the flag is for.** § 2.2 will add a
group-size *curve*, and a sampler whose draw count depends on its parameters — a table, a truncated
Poisson, anything but the current one-parameter geometric — reintroduces the strong form of the
coupling immediately. Under `v2` it cannot. The flag is insurance bought before the risk arrives,
which is the only time it is available.

---

## 2. Traffic variance

### 2.1 Body mass

Mass is already a distribution (`drawMass`, `profiles.passengerMass`) rather than a constant — the
modelling rule is met. What is missing is **control**: the distribution's shape is fixed in
reference data and cannot be varied per building or per run.

**Contract.** `passengerMass` becomes a declared, schema-bearing tunable: distribution family
(`normal` | `lognormal`), mean, standard deviation, and truncation bounds. Bounds are required, not
optional — an untruncated normal will eventually produce a negative mass, and a load sensor that
reads a negative passenger is a bug that surfaces as a strange capacity result three layers away.

Per invariant 8 it declares its schema, so a generic optimizer can search it without knowing what a
kilogram is.

**Why it matters for play:** a building whose population is heavier fills its cars by weight before
it fills them by count, and the 80%-of-rated-capacity rule starts binding on a different axis. That
is a real effect this simulator can already feel and cannot currently be asked about.

### 2.2 Group size — defining the curve

Today: `batchSize.mean`, consumed by `drawBatchSize`. One number.

**Contract.** A declared distribution with a shape parameter, over integers ≥ 1:

| Family | Shape | Reads as |
|---|---|---|
| `geometric` | mean | today's behaviour, preserved exactly |
| `zeroTruncatedPoisson` | mean | tighter clustering around the mean |
| `explicit` | a weight vector over sizes 1..n | authored — "this hotel arrives in fours" |

`explicit` is the one worth having. A conference floor emptying in groups of eight is a different
building from one emptying in ones and twos at the same passenger rate, and no mean can express
that difference. It is also the parameter most directly visible in play: batch size drives hall-call
count and dwell time, which is what the player *sees* on the stage.

**The guard this needs.** The standing requirement in `docs/05-roadmap.md` applies with force here:
move the control and require the run to change, compared on the legs rather than on a window
statistic. A group-size curve that is authored, schema-valid, tested in isolation and consulted by
nothing is precisely the eleven-times-shipped defect, and it would be invisible to every other check
in the suite.

### 2.3 Inter-day variability

Today a template is deterministic given its seed: Tuesday is a copy of Monday.

**Contract.** An optional `dayVariation` block: a multiplicative factor on total demand, drawn per
run from the `dayVariation` stream, plus an optional shift on peak timing. Both bounded and both
declared.

Deliberately **not** a random walk across days and not a calendar. A single per-run multiplier is
enough to answer *"is this dispatcher robust to a 15% heavier Monday, or is its win an artefact of
one demand level?"*, which is the question that matters and the one a learned dispatcher must not be
allowed to overfit. A richer model can come later with a reason.

**This interacts with statistics and the interaction is the point.** Day variation adds a variance
component *between* replications. Under common random numbers it must be part of the shared trace —
both arms of a comparison see the same Monday — or it silently inflates the paired variance and
destroys the power the CRN design buys. This is the easiest way to get this feature wrong, and the
acceptance criterion in § 5 tests exactly it.

---

## 3. Passenger behaviour

The three features that make it read as a building. Each is a **behaviour**, not an accessor, which
means each must reach a shipped path or it is dead code by this repository's own definition.

### 3.1 Patience and abandonment

The 900-second abandonment horizon already exists as a *reporting* concept — `awtIsValid`'s fourth
ground refuses a mean when a leg passes it. But nobody actually leaves. The horizon judges the run
without appearing in it.

**Contract.** An optional per-passenger patience, drawn from the `patience` stream against a
declared distribution. A passenger whose wait exceeds it abandons: removed from the queue, its hall
call withdrawn if no one else holds it, and recorded as `abandoned` — never as served, and never
silently dropped.

**The measurement consequence, stated because it is not obvious.** Abandonment *improves* average
waiting time by construction: it removes the longest waits from the sample. A configuration that
abandons 30% of its riders will post a superb AWT. So the abandonment count is a **published figure
beside AWT**, on the same footing that `workPerServedLegKJ` sits beside the raw energy number
(§ D106) — and for the identical reason, stated there as *a configuration that spends less by
serving fewer people has not saved anything*. Same trap, different axis.

`awtIsValid` gains a fifth ground: an abandonment rate above a declared threshold suppresses the
mean outright.

### 3.2 Lift-lobby crowd flow

Today boarding time depends on how many people board. It does not depend on how many people are
*standing there*.

**Contract.** An optional crowding term on dwell: when a lobby's queue exceeds a declared density
threshold, per-passenger transfer time rises by a declared factor, bounded. It is a term on the
existing door/dwell model — `physics/doors` — not a new subsystem, and not a spatial crowd
simulation. It has no pathfinding and no jostling; it is one monotone function of queue length, and
the contract says so rather than implying more.

**Why it earns its place:** it introduces a *feedback loop the simulator currently lacks*. Slow
boarding lengthens the queue, which slows boarding. That is the mechanism behind real up-peak
collapse, and without it the model's failure mode is too graceful — queues grow linearly where real
lobbies go non-linear. It is also, for a player, the moment a busy morning stops being a number and
becomes visible.

Being a feedback loop, it can destabilise a run that was stable. That is a *finding*, not a bug, and
the saturation detector already exists to catch and report it.

### 3.3 Stairs, with the asymmetry real people have

**This one is half-built already, and that changes its cost.** Upper and lower lobbies joined by an
escalator ship today: `TransportModeConfig` declares a non-lift connection between two floors with a
traversal time, `vertical-city` authors four of them (`G↔2`, `26↔27`, `51↔52`, `76↔77` — a ground
lobby and three sky lobbies), the router sends journeys over them, and `ConservationAudit.
transportHops` accounts for every crossing. § D170 recorded the effect when they landed: *26
journeys routed over different floors — `30 → 45` stops going `30>26>G>2>27>45` and goes
`30>26>27>45`*.

So the geometry, the traversal accounting, the conservation audit and the config validation all
exist. **Stairs are a new mode kind on a shipped model, not a new subsystem.** Three additions:

**1. A `kind` discriminator.** `'escalator' | 'stairs'`, defaulting to `'escalator'` when absent so
every existing building parses unchanged and every trace stays byte-identical (§ 0).

**2. Directional traversal time — the physical asymmetry.** `traversalTimeS` is a single number
today, which is correct for an escalator: it carries you at one speed in the direction it runs.
Stairs are not symmetric. Climbing a flight costs more time and more effort than descending it, so
the field must accept either a scalar (escalator, unchanged) or `{ upS, downS }` (stairs). A stairs
mode declared with a scalar is a config error, not a default — the asymmetry is the modelling
content, and silently symmetrising it would be the failure this section exists to avoid.

**3. Elective use — the behavioural asymmetry.** An escalator is *structural*: the router uses it
because the building's geometry says those floors connect. Stairs are *chosen*: the passenger
decides, and most of the time decides against. So a stairs mode is not consulted by the router at
all. It is offered to the passenger, and taken when all hold:

1. the floors are connected by a declared stairs mode;
2. ~~the journey is within a declared floor-count reach;~~ **withdrawn — see below;**
3. the drawn propensity clears the threshold for that journey.

> **Condition 2 is withdrawn, and the reason is measured rather than argued.** `connects` is a
> **pair**, so a mode's floor span is fixed by the mode itself and conditions 1 and 2 collapse into
> one: once the pair is declared, the span is decided and there is nothing left for a reach to
> range over. The reach was expressed as a propensity *array* indexed by flight count, whose length
> doubled as the reach — and only `curve[span − 1]` was ever read. Zeroing index 0 of a two-flight
> stair produced a **bit-identical `SimulationResult`**: schema-valid, authorable, validated, and
> consulted by nothing. That is [§ D112](../DECISIONS.md)'s shape at the data layer, inside the
> feature this section specifies.
>
> Worse, the reach did not protect what it was written to protect. An author declaring
> `connects: ["2","8"]` with a one-entry curve got a mode that parsed, validated, and did nothing at
> all — the exact configured-and-dead outcome condition 2 existed to prevent.
>
> Replaced by a scalar pair, `use: { up, down }`, both read. **The signed-delta requirement below is
> unchanged and is not what was withdrawn** — it is now realised *across* modes rather than within
> one, since each mode carries its own up and down number for its own fixed span. One consequence
> to know: nothing enforces monotonicity in span, so an author may declare a six-flight stair at
> `up: 0.9` beside a one-flight stair at `up: 0.1` and no check will object. That was equally true
> of the array form; it is simply no longer implied by the type.

**The two asymmetries are independent and both are required.** A rider descending four flights and
one climbing four flights face different *costs* (1) and have different *willingness* (3). Modelling
only the cost would have people cheerfully climbing forty floors slowly; modelling only the
willingness would have the ones who do climb arrive as fast as those going down. Neither is a
building.

**The asymmetry is the modelling content, and it is the request.** Propensity must be a function of
*signed* floor delta, not of distance. Descending two floors is close to free; ascending two floors
is work. A model symmetric in `|Δfloor|` would be worse than no model at all, because it would
quietly claim that up-traffic self-relieves at the same rate as down-traffic — and down-peak is
exactly where a real building's stairs take load off the lifts.

The default curve should be authored from lift-engineering literature with the citation beside it,
per this repository's reference-data rule, and it is **per building**: a hotel's guests and an office
tower's staff do not behave alike, and neither behaves like a hospital's.

**The obligation this creates.** Riders taking the stairs leave the lift system, so served-leg
counts fall. Every energy figure must therefore be read through `workPerServedLegKJ`, and any
comparison across configurations with different stair uptake compares different populations. § 5's
criterion 4 exists to keep that honest.

---

## 4. A learned dispatcher you can teach

### 4.1 What already exists, and what the record says

A learned dispatcher is **implemented, measured, and NOT ACCEPTED — four times**:

| Verdict | What was measured |
|---|---|
| [§ D145](../DECISIONS.md) | ΔTTD `−0.213 [−0.440, +0.014]` at n = 200 on a disjoint seed — interval contains zero |
| [§ D156](../DECISIONS.md) | Swept over eight pre-registered operating points; refused at all five PRIMARY cells under Holm–Bonferroni |
| [§ D200](../DECISIONS.md) | Re-measured on `lunch-two-way` against § D162 — refused again |
| step 6, this document | Taught over two points under day-to-day demand variation, n = 200, held-out **traffic** with the machine held. **The interval excluded zero on the better side at both cells and the phase is still refused** — see below |

**The fourth refusal is a different shape from the first three, and the difference is the point.**
§ D145, § D156 and § D200 refused on the *interval* — it contained zero, or the effect was below what
the apparatus could resolve. Step 6's arm clears both of those at both cells: ΔTTD
`−0.957 [−1.277, −0.636]` at `interfloor-mix` and `−0.714 [−0.961, −0.466]` at `lunch-two-way`, each
above that cell's own TTD-measured limit, both surviving Holm within a family declared before any
ΔTTD, both generalizing in sign from the training traffic. It is refused by the clause § D200's
finding forced into the gate: **pin the weight vector the policy spent most of its time in, run it
for the whole run with no selector, and the policy must beat that.** It does not. The static
`predictive-balanced` hybrid alone is `−1.207 [−1.535, −0.879]` and `−0.731 [−0.983, −0.479]`, and
the taught arm against it is `+0.250 [+0.093, +0.407]` **WORSE** and `+0.017 [−0.023, +0.058]`
indistinguishable. § D200's sentence reproduces on two cells it was not measured on: *the advantage
is static, and the switching subtracts from it.*

So what these two cells demonstrate is a fact about `data/` and not about learning — the shipped
`auction-multi-round` and `collective` vectors are not TTD-optimal at their own census's point, and
one already-authored vector beats them there. That is § D200's *"a finding about `data/`, not about
learning"*, now at two more points, and it is the same shape as [§ D112](../DECISIONS.md).

**And the costs go beside it, never folded in.** Every better-on-TTD figure above is **worse on
AWT** (`+0.580` and `+0.409`), worse or indistinguishable on WT95, and worse on energy on both the
raw figure and per served leg — which is the honest direction and the one § D106 exists to keep
visible.

**The refusal was then re-run on seeds it was not measured on, because a verdict that turns on one
seed set is what [§ D206](../DECISIONS.md) was corrected for.** Two further seed configurations —
one moving only the holdout traffic, one moving the run seed and both traffic seeds — give six cells
in all, and the switching premium is **WORSE at three and indistinguishable at three, favouring the
policy at none**:

| seeds (run / training / holdout) | cell | taught ΔTTD | static hybrid ΔTTD | taught − static |
|---|---|---|---|---|
| 20260726 / 20260726 / **20261537** *(pre-registered)* | interfloor-mix | −0.957 | **−1.207** | `+0.250 [+0.093, +0.407]` WORSE |
| | lunch-two-way | −0.714 | **−0.731** | `+0.017 [−0.023, +0.058]` INDIST. |
| 20260726 / 20260726 / **20261538** | interfloor-mix | −0.532 | **−0.882** | `+0.350 [+0.184, +0.516]` WORSE |
| | lunch-two-way | −0.586 | **−0.667** | `+0.082 [−0.016, +0.179]` INDIST. |
| **20260728 / 20260728 / 20261539** | interfloor-mix | −0.207 *(below limit)* | **−0.306** | `+0.099 [−0.062, +0.260]` INDIST. |
| | lunch-two-way | −0.322 *(below limit)* | **−0.928** | `+0.606 [+0.439, +0.773]` WORSE |

The two extra rows are a check on a **refusal** and are reported whole rather than quoted from; they
also show two things the single pre-registered run could not. The taught arm's own ΔTTD is not
stable — it is above the cell's limit at four cells and below it at two — while the *static* vector
beats the census's pick at all six. And the census's own pick moves with the seed: `collective` at
`interfloor-mix` on the third configuration where the first two returned `auction-multi-round`, and
`auction-multi-round` at `lunch-two-way` where they returned `collective`. A reference arm is a
property of a `(building, traffic, seed)`, which `docs/07` § 4 already says twice.

**This is the most important context for the feature, and it points at the design.** § D156 found
that what the policy learned was a *busy/idle schedule* rather than a traffic-pattern selection —
because the shipped demand template varies the **level** and never the **directional split**. The
policy had nothing to discriminate on, so it learned the only signal present.

§ 2 of this document is what supplies that signal. The teaching surface should be built *after*
traffic has something to teach, not before — which is the honest reading of three refusals.

### 4.2 The teaching surface

**Contract.** A declared training configuration — a `TeachingSpec` — carrying: the building and
traffic templates to train against, the observation features the policy may see, the action space,
the objective, the replication budget, and the held-out traffic seeds it may never see.

Four rules it must satisfy, each from a discipline already established here:

1. **Held-out traffic is disjoint by construction.** The tuning discipline requires it, and § 1.1's
   separate traffic seed is what makes it structural rather than a convention someone maintains.
2. **The observation set is declared, not implicit.** A policy that can see the future — or a
   quantity computed from it — is the failure `predictorLag.ts` exists to catch. Every feature is
   named in the spec and its causality is asserted.
3. **The acceptance bar is the standard one, with no exemption.** A paired-t interval excluding
   zero, on a disjoint seed set, above the resolution limit measured at that cell. A learned
   dispatcher gets no special pleading; three refusals are three refusals.
4. **The output is a weight vector where it can be** (invariant 7). Where a genuinely new *cost
   term* is required, that justifies new code — and only that does.

### 4.3 What it may not become

A learned dispatcher that beats the baseline **on the traffic it trained on** is not a result; it is
the definition of overfitting, and this repository's tuning discipline names it. The surface must
make the honest comparison the easy one to run, and the dishonest one awkward — the same principle
`§ D177`'s inert-control tests apply to the viewer.

**Built, and the awkwardness is that the dishonest comparison is not expressible.** Every interval
`runTeachingRound` produces is measured on the holdout traffic seed; there is no parameter, flag or
field that asks for one on the training traffic. The training-side number survives as a **bare
mean** — no interval, no verdict, no p-value — because those are the shapes a reader quotes. A spec
whose two traffic seeds are equal is refused before anything runs, so the cheapest route to a
training-set win is an error message. And the two seeds are driven rather than described: moving the
holdout seed must move the published interval and leave the policy alone, and the round's own mean
is re-derived from a fresh experiment at the holdout seed.

---

## 5. Acceptance criteria — written before the implementation

Pre-registered, per this repository's practice of dating the criterion before the code. Each is a
run, not an argument.

1. **Byte-identity when unused.** With every feature here absent or off, the full suite passes
   unchanged: all 981 pinned estimates, both identity digests, on both CI platforms. **This is the
   blocking criterion; it is not negotiable and it is not weakened.**
2. **Every control moves the run.** For each new tunable, a test that changes it and requires the
   result to change *on the legs* — not on a window statistic. The standing requirement, applied to
   every knob § 2 and § 3 add. A control that fails this is deleted, not documented.
3. **Day variation is inside the CRN pairing.** A paired comparison under `dayVariation` must show
   variance no larger than the same comparison without it. If day variation leaks outside the shared
   trace, the paired standard error rises and this fails — which is the whole reason the criterion
   exists.
4. **Abandonment and stairs are reported beside AWT, never folded into it.** A configuration whose
   AWT improves while its served-leg count falls must be *shown* doing so. Asserted the way § D106's
   energy rule is asserted.
5. **The learned dispatcher clears the standard bar or is refused.** Paired-t excluding zero on
   held-out traffic, above the resolution limit at that cell. A fourth refusal is a permitted
   outcome and is published like the first three.
6. **No new dead seam.** Every unit added here names its non-test caller, mechanically — the audit
   extended on 2026-07-31 now covers all fourteen `core` directories and will see these.

---

## 5a. The dual-lobby gap is in the designer, not the engine

Found 2026-07-31 while scoping § 3.3, and it is the inverse of this repository's usual defect: the
engine is complete and the **authoring surface is missing**.

Shipping today: `TransportModeConfig` in the schema, four escalators authored in
`data/buildings/vertical-city.json`, cross-validation with dedicated warning codes, routing over
them, and `ConservationAudit.transportHops` counting every crossing. Measured, pinned, and green on
both CI platforms.

Not shipping: **any way to author one.** `viz/src/authoring/buildingSpec.ts` exposes five
parameters — floors, floor height, capacity per floor, occupancy, cars — and produces a uniform
tower. The string `transportMode` does not appear anywhere in `packages/viz` outside one comment.

So the most interesting building this simulator can *run* is one a player cannot *build*. A
supertall with sky lobbies is the canonical case for group control — it is why `vertical-city`
exists as a reference building — and it is reachable only by hand-editing JSON.

**Contract.** The building designer gains a sky-lobby section: zero or more lobby pairs, each
declaring the two floors it joins and the traversal time between them, emitted as
`transportModes` entries. The generated building is validated by the same schema path as an
authored one, because a designer that can produce a config the loader rejects is worse than one that
cannot produce it at all.

**Why it is sequenced first.** It touches no draw, moves no trace, and invalidates no pin — it adds
a way to *write* a config the engine has always read. It is the cheapest item in this document and
the most visible in play, and it is independent of every other step. It also carries its own
version of § 5 criterion 2: **move the control and require the run to change**, compared on the
legs. A sky-lobby control that emits a mode the router ignores would be the eleventh defect wearing
a new hat.

---

## 6. Sequencing

The order is forced by the dependencies, not chosen for convenience:

| Step | Delivers | Why here |
|---|---|---|
| 0 | Dual-lobby / escalator authoring in the designer (§ 5a) | Independent of everything else; moves no trace; the engine already supports it |
| 1 | Traffic seed separation (§ 1.1) | Nothing else can be held-out-tested without it; changes no draw |
| 2 | `trafficModel: 'v2'` + `batchSize` stream (§ 1.3) | The one trace-moving change, isolated behind a flag and landed alone |
| 3 | Mass control, group-size curve (§ 2.1–2.2) | Both need step 2's stream; both are pure traffic |
| 4 | Day variation (§ 2.3) | Needs step 3; interacts with CRN, so it lands where that can be measured |
| 5 | Patience, lobby crowding, stairs (§ 3) | Behaviour, each independently gated; stairs needs the transport model that already ships |
| 6 | Teaching surface (§ 4) | Last, deliberately — § D156 says the policy needs something to learn from, and steps 3–4 are what supply it |

Steps 1 and 2 are small and land alone, because they are the ones that can move a published number
and there is no value in discovering that alongside a feature.

---

## 7. What this document does not do

It does not authorise the work. Each step lands against its own acceptance criterion, and any step
may return a refusal — the learned dispatcher already has, three times.

It does not model passenger psychology in any general sense. Patience, crowding and mode choice are
three declared, bounded, measurable behaviours. Calling them "psychology" would overclaim, and the
gap between what a model does and what its name implies is the exact drift
`validation/documentation.test.ts` exists to catch.

---

**Sources to cite when the defaults are authored:** CIBSE Guide D (stair usage by floor delta,
lobby densities), ISO 8100-32 (transfer times under crowding), and the published lift-engineering
literature already cited in `docs/02-elevator-reference.md`. A default with no citation is a guess
wearing a number, and this repository's reference-data rule forbids it.
