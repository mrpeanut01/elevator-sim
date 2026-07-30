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
makes scrubbing backwards free and replay bit-identical. A sixteen-hour day of Midtown Office at
its shipped demand is roughly 39 000 passengers; recording it synchronously in a browser tab is
tens of seconds and hundreds of megabytes, and Vertical City is four times that. More important:
**the shipped demand templates do not describe a sixteen-hour day.** `rise-and-fall` is thirty
minutes; `constant-iso` is two hours. Drawing seven office phases over a thirty-minute
rise-and-fall run would be a label that does not describe the demand underneath it — the exact
failure the honesty card exists to prevent.

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
