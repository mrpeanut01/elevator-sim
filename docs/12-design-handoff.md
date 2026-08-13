# 12 — The design handoff, and what implementing it costs

> **Status: the handoff is canonical for the user interface.** Where the handoff and the shipped
> viewer disagree about *what the screen looks like*, the handoff wins and the viewer moves. Where
> the handoff and the **simulator** disagree about *what a number means*, the simulator wins, the
> handoff's binding is re-sourced, and the difference is written down in [`DECISIONS.md`](../DECISIONS.md)
> rather than smoothed over. Both halves of that sentence are load-bearing; § 4 is the list of
> places the second half fired.

The handoff is **Elevator Sim Reimagined**, a Claude Design project
(`086c0778-f0a0-4dff-9fc8-50b0b785ee4d`). It is vendored into this repository at
[`docs/design/elevator-sim-reimagined.dc.html`](design/elevator-sim-reimagined.dc.html), with its
runtime at [`docs/design/support.js`](design/support.js), so a reviewer can diff the implementation
against the artefact it was cut from without a network round trip. **Do not edit the vendored
copy.** It is a record, not a source file; re-import it if the design moves.

> **A second handoff now exists for the Casual product.** *Everyday Mode* — the re-imagined
> Casual gameplay from the same design project — is vendored at
> [`docs/design/design_handoff_casual_mode/`](design/design_handoff_casual_mode/): a gameplay and
> navigation guide, an engine contract (every seed, formula and threshold), an ordered build plan
> mapped to this tree's real seams, and an adjudication of the repo's open issues. Its precedence
> rule is this document's own, restated in its README: the prototype wins layout and copy, the
> guide wins behaviour, the contract wins numbers, and the code wins anything about the existing
> tree. The same vendoring rule applies — a record, not a source file.

It is worth saying plainly what the handoff *is*, because it changes how it should be read: it is a
working prototype with its own toy simulator — S-curve-ish motion, `Math.random()` arrivals, a
twelve-term cost function, and a report sheet whose "average wait" is computed as
`28 + (100 − pct) × 0.9`. Its **layout, hierarchy, copy, interaction and state model** are the
deliverable. Its **numbers are not**, and § 4.2 is what happens to each one.

---

## 1 — The requirements checklist

Extracted from the artefact, in the order the screen presents them. Each row is a thing the
implementation must have, not a thing it must resemble.

### 1.1 Shell

| # | Requirement | Source |
|---|---|---|
| S1 | A three-row page grid: header (auto), body (1fr), footer (auto), `100vh`, no page scroll | `:22` |
| S2 | A three-column body: `296px · minmax(0,1fr) · 364px` | `:52` |
| S3 | Header carries: a car-shaped mark, the wordmark, a `SHIFT MODE` eyebrow, the building name, the building's spec line, the clock at 22 px monospace, a phase pill, the day label, the tenant count | `:24–50` |
| S4 | Footer carries: a status line, a seed line, a *copy run* button that yields a CLI invocation, and a right-aligned standing caveat | `:951–956` |
| S5 | Below 1340 px the right rail becomes an overlay drawer with a **Controls ▸** toggle in the tab strip; below 1180 px the header's secondary text steps aside; below 900 px the body is two columns | `:1525–1556` |
| S6 | Dark surface set: `#0b0e14` page, `#0e131b` rails, `#10151e`/`#131924` cards, `#212a36` edges, `#e8edf4` text, `#6d7b8d`/`#8b98a9` dim, `#4f9ee8` focus/accent | throughout |
| S7 | Band palette, used for *every* wait-age claim on every surface: `#3fb27f` `#e0b040` `#e0773a` `#e0473a` | `:1371` |
| S8 | Two type families: Helvetica-ish for prose, `ui-monospace` for every figure, label and eyebrow. Eyebrows are 10 px, 600, `.12em` tracked, uppercase, `#6d7b8d` | throughout |

### 1.2 Left rail — *how the building feels*

| # | Requirement | Source |
|---|---|---|
| L1 | `HOW THE BUILDING FEELS`: a mood card — 46 px round face glyph tinted by the worst band, a headline sentence, a monospace sub-line | `:57–64` |
| L2 | A four-segment stacked bar of the people waiting *now* by wait age, with a 2×2 legend naming them **breezy / tapping foot / checking watch / taking the stairs** and their counts | `:66–77` |
| L3 | Four hairline-separated stat rows with `title` tooltips: **standing right now**, **longest wait**, **carried today**, **served under 60 s**. Longest and served are colour-coded | `:80–85` |
| L4 | `YOUR RUN`: three figures — clean days running, best day so far, banked this scenario — over a seven-bar history sparkline with per-day tooltips, and a one-sentence framing note | `:88–119` |
| L5 | `TODAY'S SHIFT`: the day's event name and note, then one progress row per goal (glyph, label, value, bar), then a best-line footer | `:121–143` |
| L6 | An honesty card: glyph, title, plain sentence, and — in engineer mode — a *show me the maths* disclosure carrying the actual suppression rule | `:146–160` |
| L7 | `WHY IT DID THAT`: a live decision log, newest first, each row a timestamp, a coloured head (`car → floor`) and a one-line reason, animating in | `:163–177` |

### 1.3 Main column

| # | Requirement | Source |
|---|---|---|
| M1 | A tab strip with radiused top corners: **Simulation · Day report · Scenarios**, plus the narrow-viewport **Controls ▸** button right-aligned | `:182–189` |
| M2 | A coach ribbon on the Simulation tab: a 2 px left accent, a label + title block, a rule, a hint + progress block, then the building and pattern selects and an **All scenarios** button | `:192–217` |
| M3 | The stage: a full-bleed canvas in a radiused bordered panel, with an absolutely positioned pulsing alarm chip at top-left when a landing stacks up | `:218–227` |
| M4 | A wait-age legend strip under the stage: `HOW LONG THEY HAVE STOOD` + four coloured dots | `:228–234` |
| M5 | The transport bar: a 34 px play/pause square, a 26 px phase-segmented timeline with a white playhead and click-to-scrub, five o'clock ticks, and speed chips | `:808–830` |
| M6 | **Day report**: an observation-sheet layout — eyebrow, title, right-aligned meta, a lede paragraph, a figure grid, *The shift asked for* (verdict + goals + a cleared banner), *Where it went wrong*, *Levers you actually have*, a tomorrow/taught pair, the small print, and two CTAs | `:237–381` |
| M7 | **Scenarios**: five cards, each an art swatch + status glyph + label + title + name + brief + a four-part stat line; plus a dashed *build your own* card | `:758–805` |
| M8 | **Dispatcher editor**: the controller list on the left, and on the right a name field, twelve cost-term sliders each with a tooltip and a *serves* line, three flag toggles, the group levers block with a dwell chip row, a cost-function summary line, advice, and save | `:383–489` |
| M9 | **Traffic editor**: name, peak-order chips, ten grouped sliders, a *the day this makes* preview strip, save | `:491–549` |
| M10 | **Machines editor**: name, nine grouped sliders, a rated-speed chip row, a spec summary, save | `:551–591` |
| M11 | **Building editor**: five grouped sliders with an over-capacity track, an occupancy line, machine-class chips, load chips, speed chips, sky-lobby chips, a summary and advice; and beside it the **elevation** — one row per floor with a sky toggle, a draggable 0–120 % occupancy bar and a people count, plus draggable shaft bands, a per-shaft legend with an express toggle, and add/remove shaft | `:593–756` |

### 1.4 Right rail

| # | Requirement | Source |
|---|---|---|
| R1 | A four-way segmented control: **Dispatcher · Traffic · Building · Machines** | `:835–840` |
| R2 | Each segment: an eyebrow with a right-aligned note, a list of selectable cards, a monospace `SCHEDULE` key/value plate, and an `Open … editor →` button | `:842–947` |
| R3 | The Dispatcher plate is the running profile's weight vector and flags; the Building plate is a consultant's traffic-analysis schedule (population, rise, round trip, interval, handling capacity); the Traffic plate is the arrival pattern in the units a traffic study is written in; the Machines segment adds a `NAMEPLATE` plate in engineer mode | `:858–944` |

### 1.5 Behaviour and state

| # | Requirement | Source |
|---|---|---|
| B1 | Casual and engineer modes. Engineer sees the nameplate, the suppression rule and the maths; casual gets a lever, not a lecture | `:2344–2363` |
| B2 | A week: day N, weekday name, tenant growth of 11 % per day, an event per day (move-in / fire drill / conference / ordinary / weekend) | `:1419–1426`, `:1568` |
| B3 | Goals that harden with the day, read only from observations, and are **not graded before the building wakes up** (`arrived < 20` → `—`) | `:1428–1439`, `:2382` |
| B4 | Five scenarios on the five shipped buildings, all open from the start, each needing 1–3 clean shifts banked | `:1381–1417`, `:1616` |
| B5 | A streak, a best day, and a seven-day history | `:1952–1978` |
| B6 | Save-as-new for dispatchers, patterns, machine classes and buildings; editing a shipped thing never overwrites it | `:2871`, `:3009`, `:3336`, `:3249` |
| B7 | Clicking a shaft's badge on the canvas takes that car out of service | `:2420–2442` |
| B8 | Nothing on the screen is averaged over a queue that never settled | `:3516` |

---

## 2 — The audit: current viewer against the handoff

The viewer that exists is [`packages/viz/index.html`](../packages/viz/index.html) plus
[`packages/viz/src/dev/main.ts`](../packages/viz/src/dev/main.ts). It is a **five-tab instrument
panel**: Run viewer, Building editor, Parameters, Compare, Campaign. The handoff is a **single
operating surface** with the instrument panel folded into two rails.

### 2.1 Information architecture — the gap is structural, not cosmetic

| Dimension | Now | Handoff | Gap |
|---|---|---|---|
| Page shape | header · one tabpanel · footer, one column | header · three columns · footer | **rewrite** |
| Primary object | *a run* — you configure one and press Run | *a shift* — you are running a building through a day | **new layer** |
| Configuration | a toolbar of nine controls above the canvas | two rails, seven surfaces, all persistent | **rewrite** |
| Metrics | one `#run-summary` figure list + one `#building-mood` panel, side by side under the stage | four live stats, a mood card, a goal set, a decision log, a report sheet | **new surfaces** |
| Progression | none | day, week, streak, banked shifts, five scenarios | **absent** |
| Explanation | none — the viewer shows *what*, never *why* | `WHY IT DID THAT` is a first-class rail section | **absent, needs backend** |
| Editors | one (building), on its own tab, JSON-first | four, rail-linked, slider-first, all save-as-new | **three absent, one to re-front** |

### 2.2 Component-level mismatches

- **Tokens.** The two palettes disagree in every value: page `#0f1319` vs `#0b0e14`, panel `#171d26`
  vs `#0e131b`, edge `#2b3542` vs `#212a36`, text `#e6edf3` vs `#e8edf4`. The canvas keeps a
  *second* hand-maintained copy in `render/canvas.ts`'s `DEFAULT_THEME`. Three copies of a palette
  is the same defect class this repository has closed ten times: **one source, derived everywhere.**
- **Type.** Everything is currently 13 px monospace, including prose. The handoff is bi-typal and
  its figures run 15–24 px. Nothing in the current stylesheet expresses a figure size.
- **Density.** The handoff's cards are 12–14 px padded with 10–12 px radii and hairline `1px` grid
  gaps; the current surface is a flat 8 px `.bar` stack with 4 px radii.
- **Copy placement.** Every handoff label is a sentence a building manager would say — *standing
  right now*, *how long they have stood*, *taking the stairs*. The current labels are metric names.
  This is a **requirement**, not a flavour: it is what makes the honesty card legible to a casual
  reader, and `mode/disclosure.ts` already holds the vocabulary that has to move.
- **Interaction.** The handoff scrubs by clicking the timeline; the viewer scrubs with a
  `<input type=range>`. The handoff picks speed with chips; the viewer with a `<select>`. The
  handoff toggles a car out of service by clicking the canvas; the viewer cannot.
- **States.** The handoff specifies the empty case (`arrived < 20` → goals read `—`, decision log
  reads *standing by*, report reads *Nothing filed yet*), the alarm case, the cleared case and the
  saturated case. The viewer has a loading state, an error state and nothing between.

### 2.3 What the current implementation has that the handoff does not

Three shipped, tested, phase-bearing surfaces: **Parameters** (docs/10 § 11 W4, the
schema-generated form — CLAUDE.md invariant 8 reaching a screen), **Compare** (N paired
replications under common random numbers with a paired-t interval — the only surface allowed to
say one dispatcher beats another) and **Campaign** (seven stages, § D161). The handoff's author did
not know about them.

Deleting them to match the handoff would delete the only surface on which R2 — *the single-run
viewer may not say "this dispatcher is better"* — can ever be discharged. **They are kept**, as
three more buttons in the handoff's own tab strip, which is an open horizontal list and takes them
without inventing a pattern. See [§ D174](../DECISIONS.md).

---

## 3 — The refactor plan

Dependency order. Each stage is landable and testable on its own.

1. **Tokens and shell.** One palette, declared once as CSS custom properties, with
   `render/theme.ts` deriving the canvas theme from the same values so the third copy stops
   existing. New `index.html` with the three-column grid; `dev/elementMap.ts` moves in the same
   commit, because `elementMap.test.ts` asserts the manifest against the markup in both directions.
2. **The live-read layer** — `packages/viz/src/live/`, pure, no DOM. Wait bands, live observations,
   the real phase timeline, the time-of-day clock, decision rows. Everything the rails read at
   playhead `t` comes from here and from nowhere else.
3. **The decision log's backend** — `record/decisionLog.ts`, through the sanctioned
   `SimulationConfig.createPolicy` hook, capturing `DispatchDecision.scores[].terms` so the reason
   is the *actual* dominant weighted term and not a guess. Contract schema bumps to 7.
4. **The shift layer** — `packages/viz/src/shift/`, pure. Contracts, goals, events, growth, week,
   report.
5. **The stage** — `render/`, restyled to the handoff's visual language, with every existing
   honesty and layout guard kept green or replaced by a stronger one.
6. **The rails and the report** — `dev/`, mounting 2 and 4.
7. **The four editors** — `dev/`, each producing a real configuration object the simulator runs.
8. **Verification** — the run through § 5.

### 3.1 Backend changes, and why each is required by the front end

Per the frontend–backend alignment rule, each of these is a deliberate backend change made because
holding the backend fixed would force the UI away from the design. Every one preserves business
correctness; every one is in [`DECISIONS.md`](../DECISIONS.md) and [`TEST_MATRIX.md`](../TEST_MATRIX.md).

| # | Change | Required by | Correctness note |
|---|---|---|---|
| BE1 | `VizRecording.decisions: readonly VizDecision[]`, schema 6 → 7 | L7 | Captured by wrapping the policy through the hook `SimulationConfig.createPolicy` documents for exactly this. No wrapper draws a random number, reads a clock or alters a return value, so common random numbers stay synchronised and the `RunRecord` fingerprint is unchanged — asserted, not assumed. |
| BE2 | `VizLeg.alightedAt` | L3 *carried today*, and the report's carried figure | Previously a leg recorded arrival and boarding but not delivery, so "carried" could only be approximated by "boarded". An approximation on a counter that a goal is read from is not acceptable. |
| BE3 | `VizLeg.abandonedAt` | L2's fourth band, B3's *nobody waits past the horizon* goal | The 900 s abandonment horizon already governs `awtIsValid`'s fourth ground; the recording did not carry which legs crossed it. |
| BE4 | `VizRecording.demandPhases: readonly VizPhase[]` | M5, S3's phase pill | The resolved demand template's own segments with their real `%pop/5min` rates. Without it the timeline would have to invent a schedule, which is § 4.1. |
| BE5 | `recordRun` accepts `outOfServiceCarIds` | B7 | Uses `Car.setMode`, which `serviceMode.test.ts` already covers. A car out of service returns `infeasibleReason: 'serviceMode'` from `estimateCost`, so the dispatcher behaves correctly with no new branch. |
| BE6 | `shift/growth.ts` scales `BuildingConfig.floors[].population` and re-resolves | B2 | A building edit, through `parseBuilding`/`resolveBuilding`, which is what the building editor already does. Population growth therefore reaches the simulation rather than only the header. |
| BE7 | `authoring/patternSpec.ts` widens `TrafficProfiles` for the pattern's batch mean | M9's *mean group size* row | Batch size is not a `SimulationDemandOptions` field — it lives on the traffic **profile**, so a slider bound to `demand` writes nothing. The run resolves against a widened copy of the file, exactly as it does for a machine class the reader saved. `CLAUDE.md` says passengers arrive in batches and that batch size changes loading more than the mean rate does, so this is the last row on that panel that could be allowed to be decoration. |

### 3.2 What is explicitly **not** changed

`Car.estimateCost` stays pure (invariant 1). No global RNG appears (invariant 2). No wall clock
enters `core/` (invariant 3) — the shift clock is `dayStartS + frame.simTimeS`, and `simTimeS` is
the kernel's. `core/` gains no dependency on `viz/` (invariant 6). No dispatcher becomes a class
(invariant 7): a dispatcher the reader builds in M8 is a `DispatcherProfile` weight vector.

---

## 4 — Deviations from the handoff

Every one of these is also a row in [`DECISIONS.md`](../DECISIONS.md) § D174–§ D179.

### 4.1 The day is the run's own clock, not an invented sixteen hours

**The handoff** runs 06:00–22:00 with seven named phases — `TRICKLE`, `AM PEAK`, `STEADY`, `LUNCH`,
`STEADY`, `PM PEAK`, `QUIET` — generated by `phasesOf(pattern)` from an authored pattern object.

**The constraint.** This simulator does not step in real time. `core/` has no clock (invariant 3):
`Simulation.run()` returns a whole result and `frameAt(recording, t)` samples it, which is what
makes scrubbing backwards free and replay bit-identical.

> **Correction, 2026-08-05 — the cost figure this paragraph used to carry did not reproduce.**
> It read: *"A sixteen-hour day of Midtown Office at its shipped demand is roughly 39 000
> passengers; recording it synchronously in a browser tab is tens of seconds and hundreds of
> megabytes, and Vertical City is four times that."*
>
> That is `1712 occupants × 12 %pop/5 min × 192 five-minute blocks = 39 444` — **the morning peak
> rate held for sixteen hours.** No CIBSE day profile has that shape, and it is the same mistake
> play-tester issue #81 reports in the product: treating the peak as if it were the day. Measured
> instead at a realistic daily average of 2.2 %pop/5 min, a sixteen-hour Midtown day is about
> **7 200 passengers**, and a full shaped day costs roughly **3.4×** a thirty-minute replication at
> Midtown Office and **5.8×** at Vertical City — four to six times, not ten, and not *tens of
> seconds*. CLAUDE.md's rule applies to this document too: if you publish a number, pin it to the
> run that produced it.
>
> **One part of the original claim is not refuted and is still open.** The CLI measurements above
> build no `VizRecording`. The viewer holds the whole recording in memory so scrubbing stays free,
> and the size of that structure for a twenty-thousand-passenger day is **unmeasured**. Measure it
> before offering a full day on Vertical City.

The remaining constraint is real and unchanged: **the shipped demand templates do not describe a
sixteen-hour day.** `rise-and-fall` is thirty minutes; `constant-iso` is two hours. Drawing seven
office phases over a thirty-minute rise-and-fall run would be a label that does not describe the
demand underneath it — the exact failure the honesty card exists to prevent. That is a missing
*record*, not a missing model: `DemandPhase` already carries per-phase intensity and directional
split, `intensityAt` is already one piecewise-linear evaluator over one knot list, and
`shift-change` already ships six phases with two interior peaks.

**What is implemented.** The timeline's segments are the **resolved demand template's own phases**,
named and rated from the template (`ramp up`, `peak hold`, `ramp down`, `drain`), with their real
`%pop/5 min`. The clock is `06:00 + simTimeS`, so the o'clock ticks under the timeline are the run's
*actual* simulated times rather than a fixed five-label ruler. Shift length is a control in the
coach ribbon beside the building and pattern selects — the handoff's own component, one more
instance of it — defaulting to 1 800 s.

Layout, hierarchy, segment colouring, playhead, tick row, click-to-scrub and speed chips are all as
drawn. What changed is that the labels are true.

### 4.2 Every figure is re-sourced from the recording

The handoff's report sheet computes its average wait as `28 + (100 − pct) × 0.9` and its up-peak
share as `arrived × 0.31`. Those are placeholders in a prototype and are replaced, one for one:

| Handoff figure | Implemented source |
|---|---|
| `CARRIED` | `count(legs where alightedAt ≤ t)` (BE2) |
| `AWAY INSIDE A MINUTE` | `count(boarded legs with wait < 60) / count(boarded legs)` — an observation, never suppressed, exactly as the handoff's own note says |
| `AVERAGE WAIT` | `summary.meanWaitS`, **or the word `withheld` and `summary.awtInvalidReason` when `awtIsValid` is false or the run saturated**. The handoff already reserved `withheld` for the saturated case; the implementation widens it to all four grounds |
| `WORST WAIT` | `summary.serviceLevel.longestWaitS`, with `longestWaitIsCensored` stated beside it |
| `DEEPEST QUEUE` | the maximum over `t` of the per-landing waiting count, with the floor and clock time it happened at |
| `TOOK THE STAIRS` | `count(legs where abandonedAt is set)` (BE3) |
| *Where it went wrong* — the 08:30 and 17:20 rows | Derived from the run's own peak windows, not from two hard-coded clock times |

**One figure is added that the handoff does not have:** energy, as `workKJ` with
`workPerServedLegKJ` beside it, in the report's figure grid. [§ D106](../DECISIONS.md) requires that
energy be shown beside AWT and WT95 and never aggregated into a grade; the current viewer shows it
and dropping it to match a handoff that had not heard the argument would be a regression. It is
rendered in the handoff's own figure-cell component, carries no colour ranking, and is never summed
with anything.

### 4.3 The traffic editor edits what the engine has

The handoff's traffic editor has ten sliders over an authored pattern object (`amStart`, `amHours`,
`amMult`, `pmStart`, …, `interfloor`, `group`). The simulator's demand is
`SimulationDemandOptions` plus a resolved template: `arrivalRatePctPop5min`, `directionalSplit`,
`batchSize`, `peakWindowS`, `baselineFraction`, `mixAmplitude`, `entranceWeights`,
`interfloorWeighting`.

The two are not the same axis set, and a slider that moved nothing would be the eleventh dead seam.
The editor therefore keeps the handoff's **layout, grouping, tooltip discipline, preview strip and
save-as-new flow** and binds its rows to the engine's real parameters, grouped as
`INTENSITY` / `DIRECTION` / `THE SHAPE OF THE PERIOD`. Each row's tooltip names the field it writes.
The peak-order chips remain, mapping to the directional split the handoff's own note describes
(up-first → incoming-dominant, down-first → outgoing-dominant, two-way → the `lunch-two-way`
template).

### 4.4 The five scenarios are the five shipped buildings, unchanged

The handoff re-authors each building inline (`PRESETS`) with rounded floor heights and populations.
The implementation uses `data/buildings/*.json` verbatim — same five ids, same order, same teaching
point, same `needClean`. Where a handoff stat line disagrees with the file (Garden Apartments is
6 floors in both; Midtown Office is 21 floors in both; Vertical City is 101 in both), the file wins
and the line is generated from it.

### 4.7 The campaign is eight scenarios, and the handoff specifies five

§ 4.4 fixes the campaign at the five buildings shipped when the design was written. Three more
buildings landed afterwards — `chancery-house`, `crown-hotel` and `st-jude-hospital`
([`DECISIONS.md` § D213](../DECISIONS.md)) — and a shipped building with **no contract is a scenario
the reader can never take**, which is the thing § 4.4's own coverage rule exists to prevent.

**The handoff's five are unchanged**: same ids `c1`–`c5`, same order, same teaching points, same
`needClean`. The three new contracts are appended as `c6`–`c8`, and the constraint that shaped them
is the campaign's own progression rule — `needClean` is non-decreasing, so a contract following the
handoff's finale may not ask for **less** than it did. All three ask for 3.

**What this deviation does not do** is move the finale's reward. `c5` still grants endless mode where
the handoff put it, rather than being rewritten so the last contract in the list carries it: the
handoff wins every disagreement about what the screen looks like, and *"which contract unlocks
endless mode"* is a disagreement it already settled. The three appended scenarios are additional
work after the designed arc, not a re-cut of it.

The same reasoning added three stages to `data/campaign.json` and three to `CANDIDATE_SCENARIOS`,
whose goal pass rates are measured over both 50-replication seed sets and published in
`data/scenario-goals.json` like every other stage's — R12 applies to a scenario the design did not
specify exactly as it applies to one it did.

### 4.6 Four corrections to the prototype, found by implementing it

The handoff is a working prototype, and four things in it do not survive being built against a real
simulator. Each is a change to what the design specifies, so each is recorded here rather than
absorbed.

1. **The *show me the maths* toggle was inert.** The prototype computes `hasMaths = engineer` and
   then `showMaths = st.showMaths || engineer`; together those make the button visible exactly when
   the paragraph is already open, so pressing it changes a state field and nothing on the screen.
   The rule is now `hasMaths && showMaths`, with `showMaths` starting `true` so the first engineer
   view matches the mockup's rendered state. `leftRail.test.ts` asserts the two states differ.
2. **Two clock times named hours no shift contains.** *"Superb at 08:30"*, *"Fire drill, 14:00"* and
   *"one car is effectively half a car until 11:30"* are the prototype's verbatim prose, and under
   § 4.1 a 30-minute shift starting at 06:00 has none of those hours in it. The third was worse than
   a caption: the car is out of service for the whole shift, so *until 11:30* promised a return that
   never happens. All three are re-sourced and `reportPanel.test.ts` now asserts **no** clock time
   outside the run's own span, where it previously pinned these as exceptions.
3. **The report-window row quoted a numeral that collided with a refused mean.** Its illustrative
   counter-example read *"Riders waited 25 seconds on average" is false without…*, and on a run
   whose own suppressed `meanWaitS` rounds to 25 the sheet printed that number three rows under a
   cell reading `AVERAGE WAIT: withheld`. Found by the honesty property search; fixed by spelling
   the figure as a word, because a carve-out for *numerals inside quotation marks* would have a
   hiding place in it.
4. **The mood card's driver rows moved below the four stat rows.** The drivers are an addition
   (`docs/10` § 6 / D4) rather than the handoff's, and four sentences above the stats pushed the
   rail's four headline figures off a 900 px screen. Nothing is hidden by the move and mode parity
   is untouched.

### 4.5 Deferred

- **The elevation's shaft-band drag writes service zoning, not an arbitrary band.** A car's served
  floors are its bank's `servesFloors`, and a band that is not a contiguous subset of one is not a
  building this loader will build. Dragging produces a bank split; a drag that would produce an
  unbuildable bank is refused at the control with the loader's own message, rather than accepted and
  rejected on save.
- **`skyEvery` chips** seed `isTransferFloor` on the floors they name, which is a real field; the
  handoff's *shuttle vs local* car roles are derived from the bank structure rather than assigned.

### 4.7 Twelve controls the handoff has no row for, one deleted, and what each survivor is for

**The handoff** specifies the transport as six things (M5): a 34 px play/pause square, a 26 px
phase-segmented timeline, a white playhead, click-to-scrub, five o'clock ticks and speed chips. All
six are implemented as drawn and **none of them moves here.**

**The constraint.** The same `.transport` card carried **thirteen further controls that appear in no
requirement row above and in no deviation above it** — so § 5 point 11 was false about them in its
quietest direction. Not § 4 and `DECISIONS.md` disagreeing: a block neither document mentioned at
all, which is the failure mode a *both documents agree* check cannot see. § 2.3 records only the
three retained **tabs**; it says nothing about these.

They rendered as native, unstyled form chrome — a raw *Choose File / No file chosen*, bare `<select>`
arrows, a bare checkbox — in a viewer whose entire visual language is chips, ghosts and plates. It
was the single most visible departure from the handoff on the screen.

The handoff has no opinion about them because **its prototype has no need of them.** Its simulator
steps in real time and draws arrivals from `Math.random()`: it keeps no seed, records nothing,
verifies nothing and exports nothing, so there is nothing to reproduce, verify, save, load or hand
to a third party. This simulator's obligations are the reason each control exists. Naming them
collectively as *the provenance controls* would be the phrase under which an inert control hides,
so each is named with the obligation that requires it, and each obligation was checked against
`packages/viz/UX.md` and the invariants rather than assumed.

**One is deleted rather than restyled.** `#copy-provenance` called the same `copyProvenance()`, with
the same state and producing the same `--building … --dispatcher … --seed … --duration …` line, as
the footer's `#copy-run` — and `#copy-run` is the handoff's **own S4 requirement**. `UX.md`'s
`RV-T7` asks for *one* control that copies a run's provenance in the form the CLI accepts; there
were two, and deleting the one the handoff did not ask for discharges the obligation inside the
handoff's own component. The footer keeps it. There is now exactly one.

**The twelve that stay, and why.**

| Control | What it does | The obligation, and where it is written |
|---|---|---|
| `#seed` | The only control that **sets the shift's seed**. The footer's `#seed-line` displays it and cannot change it; Compare's `#batch-seed` is a different run's base seed, not this one's | Invariant 5 — *every persisted run record carries its seed, so any run replays exactly*. `UX.md` § 1 makes it a **role** requirement: the Reviewer "cannot do their job without it", and § 7.1 rule 5 freezes *the seed is visible and copyable on every surface that shows a run*. `RV-04` requires the drawn seed be written **back into the field** |
| `#verify` | Re-simulates from the same seed and compares `recordingFingerprint`s, keeping the stored recording on screen either way | Invariants 4 and 5 together: a replay that matched only sometimes is what a non-deterministic tie-break looks like from the outside, so this is where those two invariants become something a reader can press. `PB-16` — *must not silently show the new run* |
| `#save-recording` / `#load-recording` | The recording document round-trip, and the schema-version check on the way back in | `PB-07`, `PB-15` (a schema **newer or older** than this build is refused by name), `PB-17`, `PB-18`. [§ D16](../DECISIONS.md): `readRecordingDocument` is `VIZ_SCHEMA_VERSION`'s first caller that can actually **disagree** |
| `#export-png` | Writes the current frame to a file, from `canvas.toBlob` | `RS-08`. [§ D111](../DECISIONS.md) is why this one is load-bearing rather than convenient: **the export *is* the canvas**, so the suppressed-mean leak did not stay on one screen — `Export PNG` baked it into a shareable artifact. The re-check after the fix was run on the decoded bitmap, not on the page |
| `#bank-filter` | Narrows the stage to one bank | `RV-06`; and `RS-05`, which permits horizontal scroll **or** a bank filter and forbids silent truncation |
| `#landing-select` | Picks a landing on the stage and captions its calls | `RV-T3`, `RV-08` |
| `#run` | Runs what the coach ribbon's three selects describe | `RV-T2`, `RV-01`. Moved — see below |
| `#loop` | Restarts at `startedAt` when the shift ends | `PB-06`, `PB-T7`. `PB-09` (a *sub-window* loop) is still **not built**, and this control does not claim to be it |
| `#step-back` / `#step-forward` | One display frame each way, pausing first | `PB-T4`, `PB-08`, `KB-06` — the buttons and the `,`/`.` keys share one handler |
| `#status` | The run's own verdict line: the AWT-or-suppression sentence, the replay verdict, `loading data…`, and *the shift did not run* | `UX.md` § B.3 **Loading** — *progress or at least an indeterminate state with a label*. It is **not** the footer's fact; see below |
| `#error` | `role="alert"`, `tabindex="-1"`, and focus moves to it | `KB-11`, one of the seven ⛔ non-negotiable keyboard rows |

Four of those are also named in `packages/viz/src/index.ts`'s caller register — the repository's own
answer to *"name the non-test caller"*. `readRecordingDocument`, `verifyReplay`,
`recordingFingerprint`, `frameSequence` and `serializeFrames` list **these controls** as their only
non-test callers, and `windowClause` lists *"the surface `Export PNG` writes to a file"*. Deleting a
control here does not simplify the viewer; it creates a dead seam of the exact class the roadmap's
standing requirement is written about.

**What is implemented.** The handoff has no *layout* for this block, so the constraint it imposes is
its **vocabulary**, not its arrangement:

1. `#copy-provenance` is **deleted**, in the markup, in `dev/elementMap.ts`'s manifest and in
   `main.ts`'s wiring, in one change.
2. `#run` moves into the **coach ribbon** (M2), beside the building, pattern and shift-length selects
   that are its actual inputs, as a `.primary` at the ribbon's scale. It had been three controls away
   from everything that decides what it runs. Its manifest entry moves from `transport` to `coach`
   with it, so the grouping in the type says which surface owns it.
3. `#load-recording` is `.sr-only` behind a `.ghost` label. A bare file input appears nowhere in the
   handoff, and its chrome is the one thing no stylesheet can reach. The input stays in the tab order
   and the label carries the focus ring `:focus-visible` would have drawn on it (`KB-02`).
4. `#loop` is a `.chip[aria-pressed]` beside the speed chips — the handoff's own toggle pattern, and
   the same kind of claim as a speed chip: how the transport behaves, not what the run contains.
   `main.ts` holds the state and `setLooping` is its only writer, because `.chip[aria-pressed='true']`
   is the *only* thing that makes the chip look on.
5. `#seed`, `#bank-filter` and `#landing-select` use `.field-inline` — the editors' own `.field`
   border, radius, background and focus, turned sideways for a toolbar. A select here and a select in
   an editor are now visibly the same control.
6. What remains is grouped under an **eyebrow** — `PROVENANCE AND REPLAY`, with the standing note
   *every run carries its seed and replays from it* — so it reads as a deliberate block rather than a
   strip of leftovers.

**`#status` is deliberately *not* folded into the footer's `#status-line`.** They look like the same
control and carry different facts. `#status-line` is S4 and says where the *playhead* is —
`running · 412 arrived, 380 carried · collective`. `#status` says what the *run* is —
`AWT 19.4 s · WT95 41.2 s`, or `AWT suppressed — …` with the reason, or the replay verdict, or
`could not load data/`. Merging them would put a suppression reason and a live counter in one slot
where the second would overwrite the first, on the one screen whose whole discipline is that a
refused mean stays refused and visible.


### 4.8 A whole shell the handoff has no concept of — the menu, and the four screens under it

**The handoff has no title screen, no mode select, no settings screen, no accounts and no
leaderboard.** `docs/design/` contains none of them, so every one of those decisions is a deviation,
and until this section none of them was recorded as one. That is the § 4.7 failure repeated at a
larger radius: not two documents disagreeing, but a whole surface neither of them mentions, which is
what a *both documents agree* check cannot see.

**What the handoff still settles, and these must not contradict.** It is canonical for what the
screen looks like: the chip-and-plate visual language, the two rails, the tab strip, the report
sheet's shape, and every requirement row in § 1. The menu is drawn in that language rather than in
one of its own, it is an overlay above the drawer rather than a route that replaces the shell, and
**nothing on it may state a figure** — the simulator wins every disagreement about what a number
means, and the menu states no numbers at all except a board's, which come from the server with their
own count attached.

**The six screens, and what each is for.**

| Screen | Why the handoff has no row for it | The constraint it is built under |
|---|---|---|
| Main | The prototype has one mode and opens straight into it | Six destinations, each with a line saying what it is; never a bare list of nouns — **and one of them recommended, in words** (see below) |
| Campaign | The prototype's week has no way in or out — it simply is | Says which of the two things called Campaign this is, and selects the surface rather than dropping the reader on whatever tab was last open |
| Free play | The prototype has no configuration a player chooses | Six axes, all derived from `data/`; Start disabled **and explained**; the run is day one and the screen says so |
| Settings | The prototype has no presentation controls at all | Presentation only, and that claim is **measured** — `scope.test.ts` moves each and requires the legs byte-identical |
| Leaderboard | There is no server in the prototype | Says what a board *is* rather than letting the word imply a skill ranking |
| Challenge | Neither is there a competition | The window is drawn and never computed; the dispatcher is the only axis; every row carries its `n` |

**The Main row's constraint gained a clause, and the clause is a deviation the handoff cannot settle**
— GitHub issues #90 and #98, under [§ D299](../DECISIONS.md). *"Six destinations, each with a line
saying what it is"* is what the row asked for and it is what shipped, and it turned out to be
insufficient in a direction the sentence does not cover: six equally-weighted destinations are a
complete set of *choices* and an empty set of *recommendations*, so a player arriving for the first
time is told what each row is and never which one to press. #90 measures the cost — four first-touch
paths tried in the order a curious player would, none of them the intended one.

So the root now leads with a **recommendation** rather than a seventh destination: one row, labelled
*Start here*, whose intent is one of the six the screen already offered. Three things make it a
deviation the handoff has no view on rather than a disagreement with it. The handoff draws no menu at
all, so there is no row it contradicts. Nothing is removed or reordered — the six destinations and
Resume are on the screen in the order they were, which is [§ D299](../DECISIONS.md) § 2's constraint
that a first run may **sequence** what a player meets and may not **remove** what they can reach. And
it states no figure, including no duration: #90 proposes *"it takes about 5 minutes"* and nothing in
this repository measures that, so it is not said.

**It is one row with two destinations, because § D299 says there are two products.** Casual's opens
the scenarios board; Engineer's opens Free play. *How to play* moves with it, from last on the list to
directly under the recommendation — #98's third recommendation, and the half of it that does not need
a persistent `?` in the header the handoff also has no row for.

**One rename, and it is the one disagreement with the handoff's own vocabulary.** The prototype uses
*Campaign* for its batch-judged stage list. This implementation also has a contract week, which the
scenarios card and the shift layer both call a campaign — so two unrelated modes wore one word.
**The batch tab is relabelled `Lab`; the id is unchanged**, so every deep link, every test and every
`ELEMENT_IDS` row still names `campaign`. The week keeps the handoff's word because the week is what
a player spends their time in, and the surface that moved is the one a reader reaches least.

`docs/17` § 5 clause 2 is the residue: the *Scenarios* tab and the *Campaign* menu row still name the
same mode from two angles — the mode and its assignment picker. That is a naming judgement about a
surface the handoff drew, so it is recorded here rather than settled unilaterally.

**Two panels, added inside the shell rather than beside it.** The weight-set selector sits beneath
the dispatcher's own controls in `#panel-dispatcher`, and the challenge board is a menu screen rather
than a tab. Both follow § 4.7's rule for a control the handoff has no row for: it is drawn in the
design's language, it is refused **beside itself** when the run will not read it, and it is recorded
here.

### 4.9 Two S5 rows the artefact wrote for a prototype with one audience, and a key it has no row for

Every one of these is [§ D236](../DECISIONS.md), and each is a change to what the design specifies
rather than an interpretation of it.

**S5's step-aside loses two of its four elements.** The artefact marks the building's spec line
(`design.html` `:37`) and the phase pill (`:43`) with `data-hide-narrow`, and this implementation had
added the mode select and the banner to the set. The spec line and the banner keep it. The other two
do not:

- the **phase pill** is not *secondary text*, which is what S5's own sentence steps aside. In the
  prototype it captions a toy simulator; here `FILLING`/`PEAK`/`EASING`/`DRAIN` is the only statement
  on the screen of what the building is doing at the playhead, and every goal, band and report is
  read against it. Six characters;
- the **mode select** is the deeper case, and it is the one that shows why *the handoff wins every
  disagreement about what the screen looks like* has a boundary. § 1.5 B1's two modes are this
  implementation's addition to a prototype that has one audience, so the artefact has no opinion
  about where their switch goes at 800 px — and `display: none` gave it a zero-size box, which took
  it out of the **tab order** as well as off the screen. No other surface in the product changes
  Casual/Engineer. That is not a look, it is a lockout.

**The header wraps below 768 px.** The artefact's header is a nowrap flex row with `overflow: hidden`,
which at 375 px put 141 px of itself — the clock, the day and the tenant count — where no gesture
reaches. `flex-wrap: wrap` is a change to a rule the artefact wrote, and the layout it produces at
1180 px and above is byte-identical.

**A key for the building drawing, which the handoff has no row for.** § 1.3 M4 specifies one legend
strip, for the *rider* wait bands, and the artefact draws its cars in four load colours and two
direction arrows with nothing that says so. § 4.7's rule for a control the handoff has no row for
applies to a *caption* the same way: it is drawn in the design's own legend component, immediately
under M4's, and it spends no hue the stage does not draw. Its swatches read `render/tokens.ts`
through three new shell tokens, so the key and the canvas cannot disagree.

### 4.10 The run-to-run delta rows carry an `n`, and the handoff has no block for them at all

GitHub issue #137, and it is recorded here because § 4.7's rule — *a control the handoff has no row
for still answers to this document* — applies to a **block** the same way.

**The handoff has no delta block.** *What moved since the run before this one* is issue #38's
addition, `index.html` has no slot for it, and `dev/reportPanel.ts` builds its box after the lede for
that reason. § D310 then drew the same view a second time, as the dispatcher editor's result strip.
So there is no handoff layout to deviate from; what there is, and what this change is answerable to,
is the handoff's **figure component**: a value with its note directly under it, in the same cell, at
the note size and in the dim ink (`design.html` :250–258, and § 4.2's table is its figure-by-figure
audit).

**What changed.** Each paired value that is a mean now draws the count it was taken over beside it,
parenthesised, at 11 px in `--dim` — the sheet's own figure note, verbatim, unedited:

```
AVERAGE WAIT   was 9.7 s (over 14 legs in the peak-5min window) → 14.3 s (over 14 legs in the peak-5min window)
```

**The constraint that forced it, and why the note is not under the row.** The honesty sweep's R13 —
*no estimate is displayed without the count it was computed from, in the same visual unit* — fired on
this row on 24 of 49 always-on cases and 28 of 60 deep, the first time the block was swept. A note
line under the row would satisfy *the same visual unit* and would leave a reader pairing two values
with two counts by position. These are means of **two different runs**: one `n` for the row, or two
`n`s a row apart, are both readings a reader can get wrong, and the one they get wrong is the case
they came here for. Beside its own value is the only placement where the pairing cannot be misread.

**What it costs the layout.** The row is a wrapping flex line and stays one; on a wide screen the
figure rows grow by the bracketed clause, and on a narrow one they wrap to a second line rather than
truncating. The dispatcher editor's strip draws the same two facts in its own `plate-row` idiom —
one row, both counts in brackets — because that panel has no figure grid anywhere near it, which is
the surface where a mean with no denominator costs most.

Nothing else about the block moved: no colour, no arithmetic, no ordering, and a refused mean still
draws the bare word `withheld` with **no** count beside it — a refusal has no sample, and a
denominator printed next to it would read as a figure with a caveat.

### 4.11 The mood bar's fourth band is *eyeing the stairs*, because the handoff gave one phrase to two cohorts

`docs/20` defect 4. This is the first deviation taken on the grounds of the **second** half of
CLAUDE.md's rule rather than the first: *the handoff wins every disagreement about what the screen
looks like, and the simulator wins every disagreement about what a number means.*

**What the handoff says.** The mood card's fourth band is *taking the stairs* (`design.html`
:72–76, :230–233) and its legend rung is *gave up* (`:233`). The Day report's abandonment cell is
also *TOOK THE STAIRS*. Both are the handoff's words, and the handoff never puts them on screen
together.

**What the product does, and what that cost.** It puts them on screen together, on the same
sheet-plus-rail view a player reads after every shift. The audit's Midtown day 1 read **taking the
stairs 534** on the left rail and **TOOK THE STAIRS 288** in the figure grid six centimetres away —
and the sheet's own note said all 288 of them *were carried*. Neither number is wrong. They are
different cohorts:

| | left rail, fourth band | Day report, TOOK THE STAIRS |
|---|---|---|
| population | people **still standing** at the playhead | legs whose wait **crossed the horizon** |
| threshold | 120 s, the design's fixed rung | `summary.serviceLevel.horizonS`, the run's own |
| window | this instant | the whole shift |
| relation | either can be nonzero while the other is zero | — |

`live/bands.ts` has said *"bands are ages; abandonment is an outcome"* in its own docstring since it
was written, and `live/types.ts` warned in as many words that conflating them *"would let a rail
report four people taking the stairs while nobody had abandoned anything"*. The code knew. The
labels did not, and the labels are what a player reads.

**What changed, and which one moved.** The band's label becomes **`eyeing the stairs`** and its
legend rung becomes **`past two minutes`**. The report cell is untouched. The direction is forced
rather than chosen: the sheet's cohort has actually taken the stairs, the rail's is still in the
lobby, so the phrase stays with the cohort it describes. *past two minutes* also rejoins the rung to
the duration ladder the other three are on — *under 30 s* / *a minute* / *two minutes* — which is
what it was measuring all along; *gave up* was the one rung stating an outcome.

**What did not change.** `WaitBandId` is still `taking-the-stairs`. It is an engine string that
reaches no player surface, it is what `MoodSegment.bandId` and every stored view key on, and
renaming it would migrate data to fix a caption. The boundaries, the palette, the faces and the
apportionment are all untouched, and `waitLegendEntries`' range tooltip stays: a range is the thing
a reader checks a count against, and the fourth entry is still the one that most needs checking.

### 4.12 The dispatcher switch has one fixed target, and the stamp keeps the handoff's sentence

**What the handoff says.** GAMEPLAY § 7.6's build order for interventions is *"park the cars in
the lobby … then dispatcher switching"*, and its scope for the switch is **"any style or saved
dispatcher, from the stage"**. The stamp's worked example is `09:14 · switched to Lobby anchor`.

**What the product does.** The stamp is the handoff's sentence verbatim in shape — `switched to
<name>`, `live/interventions.ts#stampVerbOf`, name and never id — so there is no copy deviation to
record. The scope is deliberately narrower: the stage offers **one** switch target, the plain
baseline (`dev/ghostRun.ts#plainBaselineOf`, § D134's own preference list), as a single button
beside *Park the cars in the lobby*.

**The constraint.** *Any style or saved dispatcher* needs a picker, and a picker on the stage is a
surface with its own § 7.6 obligations — a disabled-state sentence per row, the no-op case per
target, the saved-shelf's own refusals — that belongs to the Everyday stage lane, not to the
mechanism lane that landed the arm. The core arm already carries **any** profile (it is the whole
`DispatcherProfile`, inline, exactly as `SimulationConfig.dispatcherProfile` serialises it), so
widening the control from one target to a picker is a viz-only change; nothing in the record's
shape or the engine narrows with the button. The one-target slice is the same shape § 20.12
prescribes for the log itself — *start with park … then switching* — applied one level down.

**One rule the control keeps that the handoff implies but does not spell.** The button disables
when pressing it would change nothing — and *nothing* is decided against the **vector actually
driving** (`dev/state.ts#drivingProfileOf`, the same derivation the run itself uses), not against
the profile id, because a lever-moved player handing the day back to the baseline is a real change
under an equal id. A switch also stands the player's rules and pattern switching down for the rest
of the day (the pin, `dispatch/policy.ts#adoptWeights`), and the control's title says so in words
(`SWITCH_PINS_NOTE`) rather than leaving it to be deduced from a rule that stopped firing.

---

## 5 — Definition of done

The refactor is done when all of the following are true, and not before.

1. **Layout fidelity** — the three regions, their widths, their order and their internal card
   structure match § 1 at 1440 × 900.
2. **Spacing and alignment** — the handoff's paddings, gaps and radii are reproduced from the token
   set, not eyeballed per component.
3. **Typography hierarchy** — two families, the eyebrow rule, the figure sizes.
4. **Component structure** — every § 1 row exists as its own mounted component.
5. **Interaction** — click-to-scrub, speed chips, segmented rails, drawer, sliders, chips, drags,
   canvas out-of-service toggle.
6. **Responsive** — 1440, 1280, 1100 and 860 px all usable; the drawer and the header step-aside
   behave as § S5.
7. **State completeness** — loading, empty (`arrived < 20`), validating (a refused edit), success,
   alarm, cleared, saturated and error are each reachable and each drawn.
8. **Accessibility** — skip link, `role=tablist` with roving tabindex, `aria-live` frame
   description, `:focus-visible` on every control, `prefers-reduced-motion` honoured, no colour-only
   signal anywhere (KB-15).
9. **Data support** — every exposed control writes a real configuration object the simulator reads,
   and no control is inert.
10. **Regression** — `npm run typecheck` and `npm test` green; every guard in
    [`docs/07-handoff.md`](07-handoff.md) § 3 still holds.
11. **Deviations recorded** — § 4 and `DECISIONS.md` agree.
