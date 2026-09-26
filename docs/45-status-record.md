# 45 · The status record split out of CLAUDE.md

**Status: record, split out of [`CLAUDE.md`](../CLAUDE.md) on 2026-09-26 by
[§ D1236](../DECISIONS.md), on the owner's instruction to lighten each wave's overhead.**
`CLAUDE.md` is loaded into every agent on every lane, so it now carries each rule once and briefly,
with the verdicts and the gaps a reader must not lose. The history that taught those rules, and the
long form of each verdict, is here: moved verbatim from `CLAUDE.md` at `7e54a14`. The only edits are
these: the headings; the two spaces of list indentation on the Phase 9 passage; and relative link
targets, rewritten so they still resolve from `docs/`. Words such as *above*, *below* and *this
file* meant `CLAUDE.md` when they were written, and are left as written.

One sentence of `CLAUDE.md` was rewritten rather than moved, because the move made it false. Its
game-layer paragraph ended *"several paragraphs below describe the four-tile front door and the mode
names that ruling retires … and this file's status section has not yet been rewritten to match."*
Those paragraphs are the ones on this page, and the sentence now points here.

The honesty corpus's wave-by-wave figures are a separate record,
[`44-honesty-corpus-log.md`](44-honesty-corpus-log.md). Phase verdicts and their measurements are
in [`05-roadmap.md`](05-roadmap.md), which is unchanged by this split.

**This page is guarded where `CLAUDE.md` was.** Two checks that read `CLAUDE.md` for a claim now
read this page as well, because the claim now lives here in full:
`packages/viz/src/honesty/derive.test.ts` holds the count of statically swept DOM entry points in
the Phase 9 passage below, and `packages/experiments/src/validation/documentation.test.ts` holds
the withdrawn H-ACCESS-1 destination beside its withdrawal in the last section.

## Phase 6's status row

- **Phase 6** — 6a (destination *disclosure*) and 6b (destination *dispatch*) are accepted against a
  **raised** criterion, now measured on the building that criterion names ([§ D100](../DECISIONS.md)).
  The gate **was met by the Level-0 arm and not by the Level-1 panel at any measured point**, and
  **that second half stopped being true on 2026-08-11** ([§ D333](../DECISIONS.md)). It was never a
  fact about the panel: `Simulation#tellThePanel` promised every waiter at a landing to `carIds[0]`
  with no capacity bound, so the Level-1 arm was the only arm that could suffer the defect and it
  was measured with it. Bounded, the heavy point turns over — at `up-peak-4pct`, n = 200, ΔTTD
  `−1.598 [−2.575, −0.621]` against `eta` and `−1.642 [−2.620, −0.663]` against `collective`, both
  **BETTER**, with `requiredReplications = 1` against that cell's measured ceiling of 206, so the
  effect is resolvable there rather than merely excluding zero. **The gate is now met by both
  arms** — and say the shape, not just the verdict: the two light points stay INDISTINGUISHABLE,
  which is what an over-subscription defect predicts, since an unbounded promise cannot bite until
  a car fills. The cost is unchanged and still reported beside it (AWT and WT95 **WORSE** against
  `eta` at that point).
  **That verdict now has a second building rather than a second seed, and half of it did not
  reproduce** ([§ D595](../DECISIONS.md), GitHub issue #428). Measured on `one-wtc-class-reference` at
  the same apparatus — `eta` baseline, n = 200 under common random numbers, TTD the gate — at *that
  tower's* highest quotable rate, which is 2 % rather than Midtown's 4 % and is censused at the
  budget the run spends: **`destination-eta` is INDISTINGUISHABLE**, ΔTTD `−0.092 [−0.804, +0.619]`
  with `requiredReplications` of **11 704** against a budget of 200, while **`destination-panel` is
  BETTER**, `−1.293 [−2.069, −0.517]`, resolvable at n = 1. So the Level-0 arm that carries § D100's
  accepted result does nothing on the second tower and the Level-1 panel does — **the reverse of the
  shape above** — and what the pair establishes is that the effect is **building-dependent**. The
  verdict is not moved: Midtown's interval is still Midtown's, this one is still this one, and
  § D100's criterion is the criterion's own to restate. The costs are the same shape on both arms
  (AWT and WT95 **WORSE**), and **no mechanism is offered** for the split. 6c (learned control) is **no longer deferred — it is implemented, measured, and NOT
  ACCEPTED**: ΔTTD `−0.213 [−0.440, +0.014]` against `collective` at n = 200 on a disjoint seed, an
  interval containing zero, unchanged at 24 and 64 search candidates ([§ D139](../DECISIONS.md) is the
  criterion, dated before the code; [§ D145](../DECISIONS.md) is the verdict). **That refusal is now
  swept over eight pre-registered operating points and it held** — NOT ACCEPTED at all five PRIMARY
  cells under Holm–Bonferroni, with the resolution limit measured on **TTD at each cell** rather
  than inherited, and two cells that clear the correction refused anyway because the effect is a
  third to a half of what the apparatus can resolve there ([§ D151](../DECISIONS.md) is the protocol,
  dated before any sweep ΔTTD; [§ D156](../DECISIONS.md) is the result). The one cell that clears every
  gate is a **secondary** one, and what its policy learned is a *busy/idle schedule* rather than a
  traffic-pattern selection — because the demand template shipped at that time varied the **level**
  and never the **directional split**, which § D156 measures rather than asserts. **The missing
  condition was then built (`lunch-two-way`, [§ D169](../DECISIONS.md)) and the re-measurement
  [§ D162](../DECISIONS.md) pre-registered has now run — and refused a third time
  (`benchmark/lunchTwoWaySelection.ts`):** at `midtown-office`/`lunch-two-way` 1.5 %, with the detector's
  `two-way` pattern the incumbent on 66.1 % of observations, the learned arm's ΔTTD is
  `−0.170 [−0.405, +0.064]` at n = 200 on the disjoint seed — containing zero and below the cell's
  own TTD-measured 0.412 s limit — and the flat-mix negative control's own BETTER
  (`−0.576 [−0.833, −0.319]`) was investigated, not filed: a constant weight-vector hybrid beats
  the reference by more on *both* cells than the selector does on either, so the advantage is
  static and the switching subtracts from it. The mix-varying question is closed in the refusing
  direction; what would move 6c now is a different selector, not a different measurement.
  Double-deck operation is
  **simulated** — paired stops, per-deck design load, deck-bound legs ([§ D131](../DECISIONS.md)) — and
  the disclaimer survives only in the narrower case of a double-deck bank declaring no
  `servesFloorPairs`, which no shipped building raises. **That last clause is now checked by a
  building that could have raised it rather than by a set that happened not to**
  ([§ D598](../DECISIONS.md), GitHub issue #426): `willis-class-reference` runs its sixteen
  double-deckers as the **locals**, pairing every floor in their zone rather than four transfer
  levels, and it loads with zero warnings — while deleting one bank's pairs **does** raise
  `missing-floor-pairs`, which is what makes the first half worth anything. Two things that tower
  measured and the shuttle-only set could not: a double-deck **local** forces one uniform storey
  height over its whole zone, because every pair must be exactly `deckSeparationM` apart; and its
  lobby escalator carries 720 hops with the decks and **exactly zero** without them, so a transport
  mode can be *produced by* the deck model rather than sit beside it. **No residual is published for
  a double-deck bank**, and that is the apparatus rather than the building —
  `oracle/upPeakCase.ts#isolateBank` drops the deck fields, so what it measures is a single-deck
  bank of the same cars.

## Phase 9's verdict: the temporal axis and the named gaps

**The sweep now has a temporal axis, and it is the first thing in this verdict that did not come
back green** ([§ D300](../DECISIONS.md)'s E-4, [§ D307](../DECISIONS.md)). A seventh property asks
whether a surface publishes, at a playhead short of `endedAt`, a figure that can only be true of
the whole run. It found two on its first run — `render/canvas.ts`'s stage banner reading **127
undelivered at 00:00 and still 127 at 704 s while 376 people were standing**, and
`render/describeFrame.ts` joining every mood driver ungated where § D293 gated the rail. **Both
are now fixed**; both were deliberately *recorded rather than fixed* in the lane that found them,
because a corpus that grew an axis and stayed green is a different claim from one that had to be
repaired first. **Say the gaps in the same breath.** Clause 4 —
*every unit names its non-test caller* — is **mechanised for reachability and not for the naming**.
**Every** `packages/viz/src` directory is inside `AUDITED_MODULES`, and this sentence no longer
says how many, because saying how many is what keeps going wrong:
`packages/viz/src/deadCode.test.ts:124-158` lists them and `:447` asserts that list against
`readdirSync` in both directions, so an export with no caller is caught. **The count is derived
there and quoted nowhere**, which is the fix rather than a fourth correction. **What no test checks is
the clause's own words** — that each unit *names* its caller in prose — and there the four
dead-code audits cover 7 of 49, and the evidence is a hand-written table plus one prose line per unit. It is
the clause to distrust first, and a fifth audit under `packages/viz` is the fix — **done in
wave 12** (`packages/viz/src/deadCode.test.ts`, [§ D192](../DECISIONS.md)), which **on the tree it
landed on** derived 19 directories from disk, asserted them both ways, classified 1 017 exports,
and immediately found two docstrings naming callers that do not call; the verdict itself is
unchanged.

**Two of those figures are dated and one was live and wrong, which is the distinction this row
keeps failing.** The directory count was a present-tense claim about the tree — it read **19**, was
corrected to **27**, then to **28**, and on 2026-09-19 an adversarial assessor ran the command this
paragraph itself prints and got **32**
(`find packages/viz/src -mindepth 1 -maxdepth 1 -type d | wc -l`).
**That is the fourth value this one figure has taken, and the third time it has been corrected in
the very paragraph arguing that it should be derived rather than quoted.** So it is no longer
quoted: the sentence above says *every* directory and points at the assertion that makes that true.
A figure a reader can regenerate in one command does not need a copy of itself in prose, and this
one proved across four values that a copy will go stale faster than anybody re-reads it. The two
citations beside it were wrong as well — `:124-154` for a list ending at 158, and `:356-366` for an
assertion at 447 — which is the same defect one level down: a line number is a published figure. The wave-12 pair is a record of what that audit found when it landed, and is now marked
as such rather than silently refreshed. **The export count is deliberately not re-published**: two
derivations disagreed (2 357 against ~2 893 by a cruder scan), and the audit's own figure cannot be
read off a run because vitest intercepts `console.log` — the same trap that made
`honesty/measure.corpus.test.ts` necessary. A count nobody can derive twice the same way does not
belong in prose ([§ D429](../DECISIONS.md)). Also named in the
verdict: `Escape` does not dismiss the drawer *(closed in wave 12, [§ D188](../DECISIONS.md))*, the
honesty sweep's `mode` axis has one value *(closed in wave 12, [§ D194](../DECISIONS.md) — the
second value produced zero new strings, **and that measured null has since stopped being true**:
the Day report and the live-metrics panel became mode-aware for GitHub issues #110 and #100, and
both adapters now render **both** registers on every case, which is where the always-on tier's
string count moved to 278 756. A null is a measurement of a tree, not a property of the axis)*,
**42 statically swept DOM entry points** are not driven *(**21** mounts and **21**
screen-registry rows, derived by `packages/viz/src/honesty/derive.test.ts` rather than
transcribed, and published in this verdict as three until [§ D421](../DECISIONS.md) measured it —
the screen rows' pure halves **are** driven, so what goes unswept in both groups is only what the
entry point authors inline)*, and **U6**, **U7's rider models** and
**Basic's curated three-dimension subset** are unbuilt.

## Wave 6, and what the phases became true of

**Phase 9's row is the first status to move since Phase 8's on 2026-07-28, and wave 6 is the reason
that is worth saying rather than assuming.** That wave
built double-deck simulation, a mid-run weight-set selector, Phase 7's undelivered fuzzy detector,
Phase 6c, and Phase 9's W4 — and **not one phase verdict changed**, because 6c did not clear the
criterion written before it ([§ D139](../DECISIONS.md)) and Phase 6 is
therefore still partial. The fuzzy arm *did* return an interval excluding zero, ΔTTD
`−0.212 [−0.416, −0.007]`, and is still reported **below the resolution limit** — both arms sit in
the structural regime whose smallest detectable effect is 1.9 s, and an interval excluding zero is
not a win when the effect is smaller than the apparatus can resolve.

What has moved is what the phases are *true of*: `destination-eta` weights `rideTime` at **0.5**
([§ D112](../DECISIONS.md)); the viewer and `elevator-sim watch` no longer print a mean the same run
says is suppressed ([§ D111](../DECISIONS.md)); the ninth dead seam and the two holes in `core`'s
dead-code scanner are closed ([§ D114](../DECISIONS.md)); and the eleventh dead seam — the whole deck
API — is closed by simulating it ([§ D131](../DECISIONS.md)). **Two more have been found and closed
since** — `serviceEvents`, a mid-run service scheduler no shipped building called, and
`patternSwitching`, the weight-set selector library that was loaded, carried into `SimulationConfig`,
resolved, and **writable by nothing in the viewer** ([§ D219](../DECISIONS.md)) — which takes the count
to **eleven in code plus two in `data/`**. The existing ordinals do not move: *the ninth* and *the
eleventh* name specific instances, and renumbering them would break every reference for a running
total. None of that was allowed to round a verdict up.

## Energy: an axis, and its one bar

**Energy is an axis, never a score, and since 2026-09-04 it also carries exactly one bar.** The
matrix that closed Phase 8 measured `nearest-car` (the weakest shipped dispatcher, and the viewer's
default until § D134) **on the Pareto front at six of eight cells**, because it is best on energy and
worst on wait. A dispatcher that drives less carries fewer people. So the energy proxy may be shown
**beside** AWT and WT95 and never aggregated into a grade, and
`EnergyStatistics.workPerServedLegKJ` goes beside the raw figure: a configuration that spends less
by serving fewer people has not saved anything. See [§ D106](../DECISIONS.md).

**What that rule does not forbid, because four lanes read it as forbidding everything.** A
**single, independent, unweighted** goal that passes or fails on energy alone is permitted and is
not an aggregation ([§ D367](../DECISIONS.md), [§ D106](../DECISIONS.md)'s own added clause). It ships:
`shift/goals.ts#goalsForDay` returns a fifth `ShiftGoal`, *"Keep the work inside 80 kJ per ride
delivered"*, and the daily loop now asks five things rather than four. **Specified against
`workPerServedLegKJ` and never raw `energyKJ`**, which is the whole of why it survives the rule
above: the legs delivered are the denominator, so a day that saves work by carrying fewer people
fails the bar instead of winning it. Still forbidden, unchanged: no weight, no combined score, no
letter or star, and no ordering two arms on energy. `campaign/judge.ts`'s refusal is untouched.

**80 is derived and the run is pinned** ([§ D468](../DECISIONS.md), `docs/33` § 4.6). Eight contracts ×
50 seeds at day 1 under `collective`, seeds `20 260 824 + 7 919 n`: the pooled two-thirds point is
78.30 kJ and below about 70 kJ the day leaves `docs/33` DC-4's band at the top, so the bar is
bracketed on both sides and 80 is the round figure 400 runs support. **It does not harden with the
day**, because the quantity falls ×1.6 to ×15.6 over a twenty-day week as the building fills and no
ladder tracks both ends.

**There are two of it since 2026-09-22, one per horizon, and 80 is the one for a slice**
([§ D962](../DECISIONS.md), `docs/33` § 4.6b, GitHub issue #583). § D468's figure is computed over the
run's **reporting window**, which is `peak-5min` — three hundred seconds — on seven of the eight
contracts it measured; a **whole authored day** writes its own window, so the same quantity on the
same building and seed reads 35.6 kJ over the slice and 149.2 over the day. One constant was grading
both, and on the flagship day that meant **0 clean days of 325 across all thirteen shipped
dispatchers**. The whole-day bar is **350 kJ**, derived on § D468's own protocol over the thirteen
contracts `shift/dayLength.ts#wholeDayFor` admits × 25 seeds: pooled two-thirds point 353.80, and
350 rather than 360 because where stability and strictness disagreed the **tighter** figure was
taken. § D106's check was re-run at the new horizon and comes back clean on the two contracts
measured — `nearest-car` has the lowest energy median at both and is strictly the worst arm at both
— and **the other eleven are unmeasured on the dispatcher axis, so nothing is claimed about them**.
One of § D468's two brackets **cannot be met at this horizon and is reported rather than used**: the
four wait goals alone miss 77.5 % of whole days, above DC-4's top, which is #234's and `docs/33`
O2's rather than this bar's. Two things the same measurement found and did not fix: the bar is dominated
by building fabric rather than by play, which is `docs/33` O2 on a fifth goal, and
`mixed-use-high-rise` day 1 stops clearing under every shipped dispatcher, which is #234's. The
check § D106 most needed was run rather than argued: `nearest-car` wins the energy bar at all seven
contracts measured and **loses the day at every one where the bar binds**, so the perverse ranking
§ D106 measures is not reachable through this bar.

## The two worlds, the swap and the landing page

**The page opens on Everyday Mode, and that changed on 2026-08-12.** `packages/viz/index.html` loads
`everyday/boot.ts`, which imports `dev/main.ts` for its side effect — so the Engineer surface still
builds and starts exactly as before — and mounts a 212 px rail, a pinned action bar and a four-tile
menu over it ([§ D335](../DECISIONS.md)). The change is one line of HTML to revert.

**Both worlds co-exist, and § 3.2's *Switch to Engineer* row is the door between them
([§ D338](../DECISIONS.md)).** It used to be *Today's tower* that handed off; § 7's stage is a screen
now — and the *Today's tower* tile opens § 6.1's front door, which is what § 4's inventory says it
reaches — so the rail's footer row is what crosses over. The Engineer header
carries the way back (`#back-to-everyday`), reached through `everyday/swap.ts`'s provided port
because `dev/main.ts` may not import the Everyday shell — `boot.ts` already imports `dev/main.ts`,
and closing that cycle is what produced this directory's last module-init `undefined`.

Four consequences worth knowing before you touch either shell. **`inert` has three non-test
writers**, not two — `menuPanel.ts#coverShell`, `everyday/shell.ts#setInert`, and
`everyday/boot.ts:117`, which lifts and restores the overlay's own `inert` inside one synchronous
block in `dismissEngineerMenu`. The rule between the first two is that the outer cover
wins while it is up; writing it unguarded hangs the renderer, because `el.inert = true` on an
already-inert element still calls `setAttribute` and still records a mutation. **Both roots are
covered and neither is ever hidden**: the Engineer root because its canvases size from their laid-out
box, and now the Everyday root for the same reason on the other side of the door, since § 7's stage
holds a canvas whose `resize` listener is still attached while the other world has the page —
`visibility:hidden` keeps the box, `display:none` does not, and the browser tier asserts the canvas's
width is identical either side of a round trip. **The browser tier reaches the Engineer surface
through the player's own path** (`enterEngineerStage`, `reopenEngineerMenu`) rather than by taking the
cover off, which is the difference between a tier that tests the product and one that tests a surface
nobody can open — and that helper had gone stale with the hand-off, leaving the tier red in 25 cases
across 12 files while the product worked. And **all four mode tiles open now**: every one of
the inventory's screen keys is accounted for — **twenty-one keys, of which twenty are registered in
`everyday/screens.ts` and `menu` is the shell's own** — so `UNBUILT_REASONS` is empty for
the first time. **The count is not repeated here, because it has moved four times and this sentence
has been wrong once already** ([§ D723](../DECISIONS.md)): `everyday/types.ts#EVERYDAY_SCREENS` carries
it, states it in its own docstring, and names the ruling beside every key past the design handoff's
seventeen — `scenario` ([§ D525](../DECISIONS.md)), `tutorial` and `collapse` ([§ D529](../DECISIONS.md))
and `landing` (GitHub issue #244). Read it there. The constant and the both-directions test around it stay exactly where they are — a
screen that ever leaves the registry owes its sentence back, and an empty table is a state that must
keep being checked rather than a rule that can be deleted.

**The swap is not remembered, and that is § 3.5 rather than a second rule.** A reload lands on the
Everyday main menu whichever world the player was in, because a remembered world is the entry-screen
override the guide forbids wearing `localStorage`. The rail's row says so on its own face
(`types.ts#ENGINEER_SWAP_NOTE`), which is where a reader will meet it.

**A first arrival meets a landing page, and it is one `go` in the shell rather than a second rule
about entry screens** (GitHub issue #244). `everyday/shell.ts#offerTutorial` used to send a visitor
who has played nothing to the two-screen walkthrough; it sends them to `everyday/landingScreen.ts`
instead, **on exactly the same gate**, and that page's single call to action opens the walkthrough.
So § D529 clause 1 is untouched — nothing skips the walkthrough and nothing reaches Scenario ahead
of it — and § 3.5 is untouched too, because the gate is re-derived from the week on every load and
nothing is stored. A returning player still lands on the mode picker.

Three things about that page are worth knowing before you touch it. **Its one button changes what it
says as well as where it goes** — *show me how it plays* into the walkthrough, *play a scenario*
afterwards — because a button promising a scenario and opening a walkthrough would be a small lie on
the one screen the page exists to be trusted on, and `landingView.test.ts` fails when the two labels
converge. **It publishes no figure at all**, deliberately and mechanically: a digit anywhere in a
drawn string fails that same file, because the honesty search checks whether a figure is *licensed*
and nothing in this repository checks whether one is *current*. And **the block that shows the game
in motion is a real run** — one pinned morning at Midtown Office, simulated in a worker and played
back on the stage's own painter over a window that skips the empty lobby at the start and the
draining tail at the end. Measured on the built bundle at 1440 × 900: **370 ms from navigation to a
moving canvas**, of which 240 ms is the page drawn — **and that pair is pinned to nothing**, which
this file's own rule forbids. No test re-derives it, no command in any document reproduces it, and
`DECISIONS.md` carries no entry for it; `docs/41` § 348 nonetheless calls it the only comparable
figure this repository holds. It is republished here as a **dated reading of one machine on one
day** rather than as a current claim, on the same footing as the wave-12 audit pair above it, and
what would pin it is a browser-tier case that navigates the built bundle and asserts a band. There is no video and no decorative animation,
for the reason a picture of a run would be the one curated thing in the product.

## The design handoff

**The viewer is now built to a design handoff, and the handoff is canonical for the interface.**
*Elevator Sim Reimagined* is vendored at [`docs/design/`](design/); the requirements extracted
from it, the audit of the old viewer against it, and every deviation with the constraint that forced
it are [`docs/12-design-handoff.md`](12-design-handoff.md) ([§ D174](../DECISIONS.md)–[§ D179](../DECISIONS.md)).
Two halves, both load-bearing: **the handoff wins every disagreement about what the screen looks
like, and the simulator wins every disagreement about what a number means.** The handoff is a
prototype with its own toy simulator — its report sheet computes *average wait* as
`28 + (100 − pct) × 0.9` — so its layout, copy and interaction are the deliverable and its numbers
are not.

The rule that carried that work is the standing requirement below, pointed at a slider:
**move the control and require the run to change**, compared on the legs rather than on a window
statistic. It found three inert or wrong controls and one false claim about a mechanism before a
single editor was mounted ([§ D177](../DECISIONS.md)). If you add a control, add that test.

## The dead seams behind the standing requirement

[`docs/07-handoff.md`](07-handoff.md) is the resume brief. Work proceeds by the phases
in [`docs/05-roadmap.md`](05-roadmap.md), which carries each phase's acceptance verdict and the
measurements behind it. Read its **Standing requirement — the integration seam has an owner** before
planning work: a behaviour that is configurable, unit-tested in isolation and never called from a
shipped path passes every other check this repository runs, and has already shipped **eleven** times in
code — plus, **twice**, in `data/` (`destination-eta`, and `patternSwitching`'s weight sets). The instructive one is the sixth: the whole of `tuning/` was reachable
from nothing outside its own tests, the module said so in its own docstring, and the roadmap asserted
the phase green anyway. So the rule is not "is it reachable?" but **"name the non-test caller"**. A
barrel re-export and a `{@link}` tag look exactly like a caller and are not one.

**And the most recent one is the one to read if you are about to build a surface.**
`patternSwitching` was authored in `data/`, calibrated against eight measured operating points,
loaded correctly, carried into `SimulationConfig`, and resolved by `resolveWeightSets` — everything
about it worked except that **no code in the viewer could write it**. A five-select editor over that
would have passed every check this repository runs while binding nothing: the player moves a
control, the run does not change, and the screen looks right. The rule that caught it is the one
below — *move the control and require the run to change, compared on the legs* — applied before the
panel was written rather than after ([§ D219](../DECISIONS.md)).

**And the newest one is the same defect with its polarity reversed, which is why it is not in the
count.** `accessZones` was loaded, schema-checked, cross-validated with four dedicated warning
codes, indexed correctly by `Bank` and consulted by `Simulation` in three places — and **could not
change a result**, because `traffic/generator.ts` issued every rider the credential their own route
needs, so every generated trip was authorised by construction and the gate never bit. Not a
behaviour with no caller: a caller with no behaviour to reach. It is closed by giving a declared
share of journeys that begin *inside* the building the badge their own floor implies rather than the
one their destination needs ([§ D265](../DECISIONS.md)); the share is **an uncited assumption with its
reasoning attached in `data/traffic-profiles.json`**, not a citation, and the rider it turns away is
a **fourth outcome** — neither delivered, nor waiting, nor abandoned — published beside AWT on
exactly the footing `workPerServedLegKJ` sits beside raw energy ([§ D266](../DECISIONS.md)). It was
found only because [§ D254](../DECISIONS.md) removed the defect that had been hiding it, which is the
lesson: a feature can be observable **through a bug** and inert without one.

**The eleventh is the most recent and the most instructive, and it is the one to read first.** The
whole deck API on `model/bank.ts` — `isDoubleDeck`, `deckAt`, `deckAssignmentFor`, `pairedFloorOf`,
`servesFloorPair` — had **no non-test caller anywhere in the tree**. **Two of those five were
closed by deletion rather than by simulation** — `pairedFloorOf` and `servesFloorPair` are gone
(`model/bank.ts` says so where they were), and only `isDoubleDeck`, `deckAt` and
`deckAssignmentFor` acquired a caller, `sim/simulation.ts:4438#bankDecksAllow`. Every reference outside its own
file was `bank.test.ts` or a barrel re-export. It is instructive because nothing about it looked
neglected: `vertical-city` had authored eight double-deck cars and four floor pairs since the
building was written, the config layer cross-validated them with four dedicated warning codes, and
`Bank` indexed the geometry correctly. **The configuration was right, the validation was right, and
nothing consulted either.** Closed by simulating it ([§ D131](../DECISIONS.md)) — which is why the
count above moved from nine to ten in code, while *"the ninth dead seam"* elsewhere in these
documents still correctly names § D114's instance and must not be renumbered.

**The ninth, and the one in `data/`, are the next two worth reading.**
The ninth is `measureEnergyLiveness` — and it was not a one-off: `published.ts` splits `benchmark/`
into studies that publish an interval and studies classified `'no-intervals'`, the first half has
`regeneratePins.ts` as its driver, and the second half had **no driver at all**, so **all five** of
its members were dead by the same measure. `benchmark/livenessSuite.ts` is now that driver and
`src/index.test.ts`'s guard iterates the entry-point set **derived from the directory** rather than
five hand-written names. The one in `data/` is `destination-eta`: two authored fields, a schema-valid
profile, its own tests, and — **as it shipped, since raised to 0.5 by § D112, which is what
`data/dispatcher-profiles.json` carries today** — `weights.rideTime: 0`, so the destination
reached `estimateCost` and
changed no decision, **bit-identical to `eta` at 8 of 8 matrix cells**. Invariant 7 makes strategy
data; it does not make data exempt. See [§ D112](../DECISIONS.md) and [§ D114](../DECISIONS.md).

## Stale mechanisms, stale refusals and stale numbers

**A stated mechanism goes stale the same way, and the correction is now pinned.** Seven places
in this repository asserted, as fact, that destination dispatch does better under access control
*because* authorization and optimization happen in the same step. Measured at n = 150 per building
under common random numbers, the difference-of-differences is `+1.020 s [+0.625, +1.414]` — it buys
*less* where access is controlled. The run is `runAccessControlStudy({})` at seed 20 260 726, held in
`benchmark/published.ts` under `difference-of-differences/absolute` and re-pinned by
[§ D280](../DECISIONS.md); the superseded `+0.982 [+0.584, +1.380]` was measured on the tree carrying
[§ D254](../DECISIONS.md)'s pickup-access defect. All seven are
corrected, and `packages/experiments/src/validation/documentation.test.ts` now asserts it five
ways: the claim may not appear without a refutation within 400 characters of it, the correction may
not be silently deleted, `model/car/estimateCost.ts`'s exclusion — its sentence is *descriptive*
and true — is asserted in **both** directions, no site may re-state the withdrawn destination for
the saving, and the carrier set the check runs over is **derived from disk rather than transcribed**,
so a new site carrying the claim cannot escape by not being on a list. If you write a sentence about *why* something
performs better, either measure it or say it is unmeasured.

**And the second half of that correction was itself a stated mechanism, which is why it is now
withdrawn rather than replaced.** Six of those sites went on to say *"and the saving is entirely in
the credential (H-ACCESS-1)"*. H-ACCESS-1 is **REFUTED** ([§ D256](../DECISIONS.md),
[§ D279](../DECISIONS.md)): under conventional dispatch `eta` and `destination-eta-unpriced` are
bit-identical on **150 of 150** `secure-tower` replications across all seven identity metrics, so the
credential buys nothing there and the saving is not in it either. What stays measured is the
**negative** — the same-step mechanism is not what produces the saving. **Where the saving does come
from is unmeasured, and no replacement mechanism may be offered in its place**, because a second
plausible sentence would be this defect again with new wording.

**A stated *refusal* goes stale the same way, and it is the more dangerous half.** The traffic
editor drew *mean group size* as a refusal — *"no field of `SimulationDemandOptions` carries it …
moving it would change this summary line and no passenger"* — for every wave after
`trafficProfilesWithPattern` made it live, which `shiftRunConfigOf` has called since wave 13. **It is
not a twelfth dead seam:** the seam was live and correctly wired end to end, and what was dead was
the sentence describing it. That is worse than a dead seam rather than better — a dead seam merely
does nothing, while a stale refusal tells the reader not to touch the control, and this one guarded
the parameter this file names outright (*passengers arrive in batches, not one at a time*). So the
standing requirement binds **both ways**: a control that writes nothing must say so, and a control
that writes something may not claim it writes nothing. A refusal is pinned by a run, never by
another sentence. See [§ D227](../DECISIONS.md).

**A published number goes stale the same way.** Three figures in this repository did not reproduce
from the code that was supposed to produce them — one measured before a seam was wired and never
regenerated, two hand-transcribed through a double rounding — and no test noticed, because nothing
in the suite re-derived a published interval. If you publish a number, pin it to the run that
produced it.
