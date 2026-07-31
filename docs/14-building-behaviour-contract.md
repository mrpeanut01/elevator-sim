# Building behaviour — the contract

**Status: designed; steps 0 and 1 built. Criteria written before the implementation, which is the point.**

| Step | State |
|---|---|
| **0 — dual-lobby / escalator authoring (§ 5a)** | **built, and § 5 criterion 2 met on the legs** — `SpecTransportMode` on `BuildingSpec`, emitted by `buildingFromSpec`, read back by `specFromBuilding`, refused in the designer by `validateSpec`, with the controls in `dev/buildingEditor.ts`. **Say the gaps in the same breath**, below |
| **1 — traffic seed separation (§ 1.1)** | **built** — `StreamSet(seed, { trafficSeed })`, reaching `runSimulation` and reported on the result; `sim/trafficSeedSeam.test.ts` drives it end to end |
| 2–6 | designed |

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
   `mountBuildingEditor`, and no test drives the mounted panel. This is the known Phase 9 gap —
   *"three DOM panels are statically swept rather than driven"* — matched exactly by the
   access-zone editor beside it. It is **not widened** by this step, and it is not closed either.
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

`drawBatchSize` currently draws from the **`arrivals`** stream
(`traffic/generator.ts:1006`). Group size and arrival instants share a sequence.

So *any* change to the group-size curve — even one that leaves the mean untouched — consumes a
different number of draws from `arrivals` and shifts every subsequent arrival instant in the run.
The trace does not change a little. It changes completely.

That is what makes "give group size its own stream" a **correctness** change and not a tidiness one,
and it is also why the move cannot be made silently: relocating the draw is itself trace-moving. The
sequencing in § 1 exists to make it survivable.

---

## 1. Seeds and streams

### 1.1 A traffic seed, separate from the run seed

Today one seed derives all six streams (`random/streams.ts`), so "same building, different crowd" is
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
| `batchSize` | group size — **moved off `arrivals`**, see § 1.3 |
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
2. the journey is within a declared floor-count reach;
3. the drawn propensity clears the threshold for that journey.

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

A learned dispatcher is **implemented, measured, and NOT ACCEPTED — three times**:

| Verdict | What was measured |
|---|---|
| [§ D145](../DECISIONS.md) | ΔTTD `−0.213 [−0.440, +0.014]` at n = 200 on a disjoint seed — interval contains zero |
| [§ D156](../DECISIONS.md) | Swept over eight pre-registered operating points; refused at all five PRIMARY cells under Holm–Bonferroni |
| [§ D200](../DECISIONS.md) | Re-measured on `lunch-two-way` against § D162 — refused again |

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
