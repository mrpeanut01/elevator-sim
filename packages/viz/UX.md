# Viewer UX inventory

> ## 🧭 Read this first — the file has two halves, and the numbers run out of order on purpose
>
> **§§ 8–26 are the live ledger**, for the *shift* viewer wave 10 built to
> [`docs/12-design-handoff.md`](../../docs/12-design-handoff.md) and wave 11 restyled: three
> columns, ten tabs, eleven mounted surfaces, two rails.
>
> **§§ 1–7 are the retired Phase 4 ledger** for the five-tab instrument panel that no longer
> exists. They are kept **verbatim and at their original numbers**, because `DECISIONS.md`,
> `docs/05`, `docs/07`, `docs/10`, `docs/12`, `GAPS.md` and **fifty-odd source files** cite them by
> number — `§ 7.1 rule 4` (the `awtIsValid` gate), `§ 7.1 rule 5` (the seed), `§ A.3` (the
> suppression clauses), `§ C.3`, `§ 7.2` — and a renumbering would silently break every one. So the
> new sections take the numbers *after* them and sit *above* them, because they are the live ones.
>
> **The old ids are not obsolete, and one whole surface of them is still shipped.** The retired
> § 4's `ED-01`…`ED-25` describe the **document editor**, which wave 10 kept whole and moved: it is
> now the `<details id="building-document">` block beneath the elevation in the Building tab, with
> its own thirty-two `ed-*` / `editor-*` ids resolved by `dev/editor.ts` rather than by the
> manifest. See `BE-23`. `KB-15`, `RV-T4`, `RV-T7`, `RV-08`, `PB-15`–`PB-17`, `RS-04`, `RS-05` and
> the `ED-*` rows are still named from source; none has been deleted.

## How the marks are used — read this before trusting one

Wave 1 shipped three `✅` marks that were false and a reviewer caught them
([`DECISIONS.md` § D18](../../DECISIONS.md)). So the marks distinguish **how** a row was
established, and there are four of them:

| Mark | Meaning |
|---|---|
| `✅ run` | Built, and **exercised in a browser** against the shipped `data/`. The delivery report says what was clicked. |
| `✅ test` | Built, and asserted by a test that **fails when the behaviour is removed** — and the test has been found and read, not inferred from a file name. |
| `⚠️ unverified` | Built and reachable, but **neither driven in a browser nor covered by a test**. Not a claim that it works. |
| `🔲` | Not built, inert, or built and failing its own success condition. |

A row that says two things gets two marks, one per clause. A row whose *specification* turned out
to contradict the code is re-marked with the contradiction stated, in the manner `D18` established
— claiming the behaviour was the defect, not lacking it.

**This pass could not drive anything.** It read the tree; it held no browser. So:

- **`✅ run` appears on exactly zero rows below.** Every one of the retired ledger's `✅ run` marks
  belongs to a viewer that no longer exists, and none of them has been carried across.
- **`✅ test` appears only where the assertion was located and read.** Where a test covers the
  *decision* and the DOM writing or the event listener is uncovered, the row carries **both** marks
  and says which clause is which. That split is not pedantry: `honesty/derive.test.ts` excludes the
  DOM half of **all eight** mounts by construction (*"DOM-bound … their authored literals are swept
  statically below, which is weaker than driving them and is stated as a limitation rather than
  presented as coverage"*), so an undivided `✅ test` on a mounted surface would be claiming exactly
  what that exclusion refuses to claim.
- **Everything else is `⚠️`.** An honest `⚠️` column is this document's deliverable. A green ledger
  is not, and the record says so: waves 5, 9 and 10 each drove rows that reading had passed —
  `RV-21`'s Retry was permanently dead after any failed load, and § D177 found three inert or wrong
  controls before a single editor was mounted. [§ D163](../../DECISIONS.md) clause 5 makes *driven,
  never read* a standing requirement, and **§ 26 is the list to work down.**

Three rows below are marked `🔲` on the strength of reading alone and are the first three things to
drive, because each is a control that *looks* like it works: `SG-15` (the bank filter),
`SH-09` (nothing writes the URL back) and `RX-03` (no stacked layout below 768 px). They are stated
as findings-from-reading, and § 26 ranks them accordingly.

---

## 8. Roles, and the cycle this ledger walks

The four roles of the retired § 1 are unchanged and still govern — Analyst, Designer, Reviewer,
Newcomer — with one addition the shift viewer creates:

| Role | Who they are | Primary goal | What failure costs them |
|---|---|---|---|
| **Operator** | Plays the shift: a week of days, a growing building, three goals a day | Keep the lobby moving, and understand *why* it stopped when it did | Learns a lesson the simulator never taught — a habit picked up from a number the run did not support |

The Operator is why § 10's honesty card and § 14's report exist, and why **no surface in this
viewer may print a mean the run refuses**: the retired § 7.1 rule 4 is now enforced from
`frame/overlay.ts#meansAreSuppressed` and asserted separately in the left rail, the right rail, the
report, the canvas, `live/` as a whole and the exported PNG (`LR-21`, `RR-10`, `DR-04`, `SG-10`).

Each surface below is enumerated as a cycle rather than as a component list: the goal, the happy
path, the alternate valid paths, invalid input, the empty state, the loading state, the error state
and the recovery.

---

## 9. Shell — `SH-`

**Goal.** Find the surface you need; know which run you are looking at; be able to send it to
somebody.

Three primary tabs (Simulation, Day report, Scenarios), four contextual editor tabs carrying
`hidden` in the markup until the right rail opens one, three retained instrument tabs, a drawer
toggle, a header and a footer.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| SH-01 | happy | Open the page cold | Every element the viewer resolves is present, and an opening shift runs unprompted | ✅ test — `elementMap.test.ts` checks the manifest against `index.html` **in both directions**, has no id twice, and lists exactly which of the page's ids the viewer never resolves (the document editor's) · ⚠️ — `boot()` calling `runShift()` on load has no test |
| SH-02 | happy | Read the tab strip at rest | Three primary tabs and three secondary; the four editors absent, not merely disabled | ✅ test — `surfaces.test.ts` *"hides every contextual editor nobody has opened"* · ⚠️ — `applySurfaceState`, the writer, is untested; there is no jsdom in this suite |
| SH-03 | happy | Click a tab | Its panel shows, every other hides, `aria-selected` follows | ✅ test (`surfaceStateFor` shows exactly one panel) · ⚠️ (the click listener and the writer) |
| SH-04 | alternate | <kbd>←</kbd>/<kbd>→</kbd>/<kbd>Home</kbd>/<kbd>End</kbd> on the strip | Walks the **visible** ring, wrapping; a hidden editor is skipped, never focused | ✅ test (`tabAfterKey`, including the skip and the wrap) · ⚠️ (the one `keydown` on the strip) |
| SH-05 | alternate | Open an editor from the right rail | Its tab appears and **stays** appeared for the session | ✅ test (`surfaceStateFor` with a revealed set) · ⚠️ (`context.openTab`, which also focuses the new tab) |
| SH-06 | edge | A contextual tab is the active one before the rail has revealed it | It is in the ring anyway — a selected button nobody can focus is worse than a visible one | ✅ test |
| SH-07 | edge | The roving tabindex | Exactly one **visible** tab is `0`; exactly one panel is shown | ✅ test |
| SH-08 | alternate | Deep link `?building&dispatcher&seed&duration&tab&rail&mode` | Opens there; a value the page does not have is refused rather than silently opening the first tab | ⚠️ — **`applyDeepLink` is exported from `main.ts` for exactly this and no test imports it.** `isTabName`, `isRailSegment` and `isViewMode` are covered by `elementMap.test.ts`/`mode/` in isolation; the seven-key patch and the `duration` clamp are not |
| SH-09 | alternate | Change the building, the seed or the tab, then copy the address bar | The URL follows the run, so a second person pasting it sees the same page | 🔲 **not built, and this is a regression against the retired `RV-03`/`RV-T2`.** There is no `history.pushState` or `replaceState` anywhere in `packages/viz`. The link is read on boot and never written. **Found by reading — drive it (§ 26 item 2)** |
| SH-10 | alternate | Narrow the window past 1340 px | The right rail becomes an overlay drawer, closed, with a toggle in the tab strip | ✅ test — `drawerStateFor`, **and** `surfaces.test.ts` reads `index.html` and asserts `DRAWER_BREAKPOINT_PX` matches the `@media (max-width: 1339px)` rule that does the layout · ⚠️ (`applyDrawerState`, the toggle click, and the `matchMedia('change')` listener added because `resize` alone left the drawer stale) |
| SH-11 | alternate | Widen it again | The column comes back without the reader pressing anything, and their choice is remembered for the next narrowing | ✅ test |
| SH-12 | recovery | <kbd>Escape</kbd> with the drawer open | The drawer closes | 🔲 **not built — a real gap, found by driving in an earlier pass and confirmed here by reading.** There is no `Escape` handler in `packages/viz/src` or in `index.html`; the toggle is the only way out |
| SH-13 | happy | Read the header | Building name, spec line, clock, phase pill, day and weekday, tenant count | ⚠️ for `drawHeader` · the parts are ✅ test elsewhere: `statLineOf` (`contracts.test.ts`, on all five buildings), `clockAt`/`phaseAt` (`timeline.test.ts`, including the wrap past midnight) |
| SH-14 | happy | Read the footer | Status line, seed line, **one** `copy run` | ✅ test — `provenanceBlock.test.ts` asserts `#copy-provenance` is gone from the page, the manifest **and** `docs/12`, so exactly one control copies provenance · ⚠️ (`drawFooter`) |
| SH-15 | loading | `data/` is being fetched | A label, not a bare spinner; the transport disabled | ✅ test — `bootstrap.test.ts` drives the load state machine · ⚠️ — `disableTransport` and the markup's initial `booting…` are unasserted |
| SH-16 | failure | `data/` fetch fails | The **failing path** is named in every failure mode — not only on `!response.ok`, which is the branch a file missing from this dev server does not take — focus moves to the `role="alert"` region, and a Retry chip appears beside it | ✅ test (`bootstrap.test.ts` fail → Retry → succeed; `dev/data.ts` names the path in all three modes) · ⚠️ (the focus move, the chip, the disable) |
| SH-17 | recovery | Press Retry | Refetches with no page reload, starts **at most once** however many attempts succeed, and a throw from `start` rejects rather than vanishing into a floating promise | ✅ test — the four `bootstrap.test.ts` cases are the `RV-21` regression, which was **false when driven** |
| SH-18 | failure | The page is missing elements the viewer needs | One list of every absent id with a count and a total, pointing at the manifest — never one reload per id — and a last-resort `<pre>` when there is no error slot to write into | ✅ test (`elementMap.test.ts` *"names all four when four are missing"*, and the empty-page case) · ⚠️ (the `<pre>`) |
| SH-19 | empty | Nothing has run yet | The empty state is explained rather than blank | ⚠️ — **and it is barely reachable**: `boot()` calls `runShift()` unconditionally, so `#clock`'s `06:00`, `#phase-label`'s *no run yet*, the footer's *no shift run yet* and the canvas's `No run yet.` are seen only when the opening run **fails** |
| SH-20 | failure | `data/campaign.json` fails while the other nine surfaces load | The failure is reported in the Campaign surface's own alert slot; the other nine come up | ⚠️ — read from `main.ts`'s detached `loadCampaign().catch`; nothing asserts it |

---

## 10. Left rail — `LR-`

**Goal (Operator, Newcomer).** See how the building feels without reading a statistic, and be told
plainly when a statistic is being withheld.

Mood card, four-segment wait-band bar, the driver list, four stat rows, `YOUR RUN`, `TODAY'S
SHIFT`, the honesty card with its *show me the maths* disclosure, and the `WHY IT DID THAT`
decision log. `mountLeftRail`'s only control is the disclosure toggle; everything else is
read-only.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| LR-01 | happy | The mood card | Face, headline and sub-line taken from the mood **unchanged** — no second sentence composed here | ✅ test (`leftRail.test.ts`, `render/mood.test.ts`) |
| LR-02 | happy | The wait-band bar | A partition: the four widths sum to exactly 100 whenever anybody is waiting; four zeroes on an empty lobby, never a full green bar; a fractional unit never widens the worst band past its share | ✅ test |
| LR-03 | happy | The bar's legend | The four bands by the design's names, each with its raw head count, and the partition restated in words — `KB-15` | ✅ test |
| LR-04 | happy | The four stat rows | The design's order, its tooltips **verbatim**, values read off the observations and nowhere else | ✅ test |
| LR-05 | alternate | A run whose long-wait threshold is not 60 s | The served caption and the tooltip are generated from the run's own threshold rather than from the handoff's literal | ✅ test |
| LR-06 | empty | Before the first run | The rows claim nothing and name no threshold they have not measured | ✅ test (`idleStatRowsOf`) |
| LR-07 | edge | Nobody served / nobody waiting | A dash, never 100 % of nobody; *nobody is waiting* rather than a zero-second longest wait | ✅ test |
| LR-08 | edge | The colour ladders | The longest wait is coloured at the wait bands' **own** boundaries and the served share on the design's 75/50 ladder — no literals — and every coloured row states its value as text too | ✅ test |
| LR-09 | happy | The driver rows | Each driver reads its own observation; the level is the **maximum**, not a weighted sum, so one distressed observation is not averaged away by four calm ones; each level has a distinct shape | ✅ test (`render/mood.test.ts`) |
| LR-10 | happy | `YOUR RUN` | Three figures in the design's order, banked against the contract's own `needClean`, a dash rather than a denominator it does not have, and the streak in words as well as in a colour | ✅ test |
| LR-11 | happy | The sparkline | One bar per closed day, each with its own tooltip; one **provisional** bar for a day still running; a flat one before any run | ✅ test |
| LR-12 | happy | `TODAY'S SHIFT` | The day's event and note; three goals a day, bars rising through the week and capped so the week never becomes unwinnable; the third goal alternates so a bad day is not three inverted bars | ✅ test (`shift/goals.test.ts`) |
| LR-13 | edge | A goal nothing has woken up | **Pending** renders no number at all; met carries the tick and the green band, missed with progress the amber; the goal's own sentence is passed through rather than restated | ✅ test — and `goals.test.ts` asserts grading starts at *exactly* the arrival threshold and is never `met` below it, even on observations that would clear every bar |
| LR-14 | alternate | Casual mode | Neither the toggle nor the maths paragraph is drawn, whatever the reader last chose — a lever, not a lecture | ✅ test |
| LR-15 | happy | *Show me the maths* | It is **a toggle that toggles** — the prototype's own rule made it inert | ✅ test (`mathsDisclosureOf`) · ⚠️ (the click handler in `mountLeftRail`, which writes through `MountContext.update`) |
| LR-16 | happy | Engineer maths | Quotes the run's own refusal **verbatim** when the means are suppressed; says which gates passed, over what window and over what `n`, when they do; never reproduces the prototype's invented figure | ✅ test (`live/honesty.test.ts`) |
| LR-17 | empty | The honesty card before any run | Says nothing has been measured, and does not tick | ✅ test |
| LR-18 | happy | `WHY IT DID THAT` | Newest first, at or before the playhead, never longer than the limit, and the same rows scrubbing backwards as forwards | ✅ test (`live/decisions.test.ts`) |
| LR-19 | alternate | The three decision outcomes | Assigned / reassigned / nobody-may-answer read differently **in words**; an assignment carries the dominant term's raw value and a dimensionless margin; no floor or car the recording cannot draw is ever named; the phrasing is the cost-term library's own | ✅ test |
| LR-20 | empty | A recording with no decision yet | One *standing by* row, drawn as a state with no clock time it did not have | ✅ test |
| LR-21 | failure | A run whose mean is refused | **No mean anywhere in the left rail** — not as a number, not inside a sentence — and every row still fills, which is why the rail is counts | ✅ test (`leftRail.test.ts`, plus `live/noMeans.test.ts`, which sweeps every module in `live/` for a suppressible figure and carries a positive control) |
| LR-22 | edge | The rail redraws at 60 Hz | Hover survives; a live redraw that finds nothing moved touches nothing | ⚠️ — `keyedFill`'s guard is the mechanism and `renderLive` the caller; neither is asserted |

---

## 11. Coach ribbon — `CO-`

**Goal (Newcomer).** Get a building moving without configuring anything, and be told what to look
at next.

Three selects — building, arrival pattern, shift length — plus **Run**, which § 4.7 moved here from
the transport so it sits beside its own inputs, and **See all scenarios**.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| CO-01 | happy | Pick a different building | The run re-runs on it, and the week follows the **scenario that building belongs to** rather than staying on the old one | ✅ test (`state.test.ts` `withBuilding`: takes the scenario, leaves the week alone for a building the reader drew, re-seeds the editor's working copy only while it is untouched, and is pure) · ⚠️ (the `change` listener) |
| CO-02 | happy | Pick a different arrival pattern | The run really moves off the building's own profile | ⚠️ — **and this is the § D177 gap on the busiest control in the ribbon.** The four editors each have a *"the control changes the run, compared on the legs"* test; this select has none. `shiftRunConfigOf` is asserted to hand the run **no** demand override under the building's own demand — the negative half — and nothing asserts the positive one |
| CO-03 | happy | Pick a different shift length | The run re-runs at the new duration and the timeline re-rules | ⚠️ — same shape as `CO-02` |
| CO-04 | happy | Press **Run** | Runs what the three selects above it describe | ✅ test — `provenanceBlock.test.ts` asserts `#run` is in the coach ribbon, **is off the transport card**, and that the manifest agrees which surface owns it · ⚠️ (the click) |
| CO-05 | alternate | Press **See all scenarios** | The Scenarios tab opens | ⚠️ |
| CO-06 | alternate | The coach hint | Withheld notes lead; otherwise one of four sentences keyed on the run's own observations — nothing graded below twenty arrivals, the crunch above twenty-five waiting, otherwise the goals | ⚠️ — `coachHint`'s four branches are inline in `main.ts` and have no test |
| CO-07 | empty | No run yet | The Newcomer sentence: *press play and watch a call appear, a car answer it, and the wait end* | ⚠️ |
| CO-08 | alternate | A day whose event withholds something | The event reaches the simulation **and** what it withheld is said | ✅ test — `events.test.ts` drives all five events into a real run (move-in genuinely takes a car out of service, fire-drill swings the traffic outward, conference raises interfloor, weekend reduces the level and changes nothing else, ordinary changes nothing) and asserts the mix is **withheld rather than thrown** under a mix-varying template · ⚠️ (`state.withheld` reaching `#coach-hint`) |

---

## 12. Stage — `SG-`

**Goal (Analyst, Newcomer).** Watch the mechanism, not the number.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| SG-01 | happy | A shift plays | Cars at their analytic S-curve height, doors in proportion to the open fraction, riders drawn as people, the mass and slabs behind them, a cable to each car | ✅ test (`stageRender.test.ts`, `canvas.test.ts`, `layout.test.ts`) |
| SG-02 | happy | The sky says what time it is | Four distinct ramps at the four hours the design names; windows warm after dark and cold in the day, never both; identical output for identical `t` — no RNG in the renderer | ✅ test (`sky.test.ts`, `stageRender.test.ts`) |
| SG-03 | happy | The waiting crowd | One glyph per waiting rider **in that rider's own band**; past the glyph budget a `+N`, past that a `log(1+n)` bar with the count beside it; the band survives the palette being collapsed to one colour | ✅ test (`riderQueue.test.ts`) |
| SG-04 | happy | The wait-age legend | Four keys derived from `WAIT_BANDS` and from nothing else, with the handoff's own words and hexes, and **no second copy in the markup** | ✅ test (`main.test.ts`, three ways, including against the vendored `docs/design/` prototype) · ⚠️ (`drawLegend` actually appending them) |
| SG-05 | alternate | A landing stacks up | One alarm the whole stage agrees on: fires **strictly above** the design's depth, names the deepest landing, and the chip and the pulsing rules cannot disagree | ✅ test (`stageRender.test.ts`) · ⚠️ (`#alarm`'s show/hide and its two sentences) |
| SG-06 | happy | The out-of-service badge | One badge per column, its state **in words**, a hit rectangle that contains the pill it drew, and the same fact in the text alternative | ✅ test (`stageRender.test.ts`) |
| SG-07 | alternate | Click the badge | That car leaves service and the shift re-runs without it | ✅ test for the **mechanism** — `events.test.ts` *"move-in genuinely takes a car out of service"* drives the same `outOfServiceCarIds` through `shiftRunConfigOf` into a real run · ⚠️ for the **click** — `wireStageClicks` and `badgeAt` are the only pointer targets on the canvas and neither is asserted |
| SG-08 | alternate | Four different claims on one landing row | Unanswered call, abandoned rider, locked-out landing and unserved floor are four different **shapes**, checked with every field of the theme collapsed to one string, with an exhaustiveness guard that throws on an unclassified mark | ✅ test (`landingMarks.test.ts`, `lockedOutRender.test.ts`) |
| SG-09 | failure | The banner | Leads with the status and the undelivered count; shows the status **and** the suppression when both apply; names the **credential** the dispatcher cannot read rather than only a count; never overprints the building name however many clauses it grows | ✅ test |
| SG-10 | failure | A run whose mean is refused | No mean on the canvas, in the `aria-label`, or in the bitmap `Export PNG` writes — on **both** suppression grounds | ✅ test (`canvas.test.ts`, both grounds, with the gate copied from the summary and never recomputed) |
| SG-11 | alternate | The text alternative | `describeFrame` writes the `aria-label` and a polite live region: building, seed, clock, status, suppression, counts, per-car floor / direction / door phase in words / OVERLOADED, the unanswered landings, the queues by band, the mood, and the passenger model when it is destination dispatch | ✅ test (`describeFrame.test.ts`) · ⚠️ (the 2 s re-announce cadence in `tick`) |
| SG-12 | edge | The header band | No two rows ever drawn in the same place, at every measured viewport; every row inside the canvas however long its sentence; the height derived from the rows it holds | ✅ test (`headerBand.test.ts`) |
| SG-13 | edge | A 60+ floor building | Labels thin by **stride** computed from the row pitch; reference floors never thinned; a label wider than the gutter clipped rather than drawn off-canvas; every floor keeps its row | ✅ test |
| SG-14 | edge | More shafts than fit | *Showing N of M* rather than a silent truncation | ✅ test |
| SG-15 | alternate | Choose a bank in the bank filter | The picture narrows to that bank | 🔲 **INERT — found by reading and CONFIRMED BY DRIVING 2026-07-30.** `#bank-filter`'s `change` handler writes a `bankFilter` binding that `drawStage` never reads; `buildLayout` and `drawScene` are handed `recording.shafts` whole and take no filter. The only other reader is `fillBankSelect`, which passes it back as the *selected option*. **Driven:** `vertical-city`, twelve cars over seven banks, playback **paused** so the clock could not confound the measurement — a hash over the canvas bitmap is **byte-identical** across `(all)`, `shuttle` and `zone-6-local`, and identical again on returning to `(all)`. The first attempt at this measurement *was* confounded — the run was playing and the pixels changed because the clock moved — which is why the paused control matters and is recorded. The retired `RS-05`'s claim that *"the bank filter narrows to a bank"* is **false of this viewer**. **§ 26 item 1** |
| SG-16 | alternate | Choose a landing in the landing selector | The assigned car's shaft is outlined and captioned with how long until it arrives; *unassigned* when the record never answered; *nobody waiting* and *nobody answered* are different sentences; under destination dispatch the **promised** shaft is outlined, not the one that happened to answer | ✅ test (`overlayRender.test.ts`) · ⚠️ (the `change` listener) |
| SG-17 | failure | The browser has no 2D context | Explained in text rather than thrown into the console | ⚠️ — `drawStage` returns early on `getContext('2d') === null` and **says nothing**; the retired `RV-19`'s text fallback did not survive the rewrite. Marked unverified rather than not-built because the `role="img"` canvas still carries its markup `aria-label`, so a reader is not left with silence — but that is a guess until somebody drives it |
| SG-18 | empty | No recording | The canvas is left at its markup `aria-label` of `No run yet.` and nothing is drawn | ⚠️ |

---

## 13. Transport and provenance — `TP-`

**Goal (Reviewer).** Get to the moment being disputed, and prove the run is the run.

`docs/12` § 4.7's block: the handoff's six controls, plus the obligations this simulator has and
the prototype does not — a seed, a replay verification, a recording to write and read, an export.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| TP-01 | happy | Play / pause | The glyph and the `aria-label` follow the state | ⚠️ — `Playback` itself is ✅ test (`playback.test.ts`, `mapping`), the button is not |
| TP-02 | happy | The speed chips | ×1 / ×10 / ×60 / ×240 / ×900, exactly one pressed, each captioned *N simulated seconds per real second* | ⚠️ — `SPEEDS` is exported from `main.ts` and no test reads it; the ×900 rung exists because a 1 800 s shift at ×60 is thirty seconds of watching |
| TP-03 | happy | The timeline | Phase segments contiguous over `[startedAt, endedAt]` with no gap and no overhang, the drain banded rather than left as a hole, ticks ruled at the run's own times both ends inclusive, and the playhead where the clock is | ✅ test (`timeline.test.ts`, including the empty schedule and the drain tail) · ⚠️ (the writing, and the re-append that keeps `#playhead` alive across a `fill`) |
| TP-04 | happy | Click the timeline to scrub | The playhead lands where dropped and the picture is correct for that instant | ⚠️ — `Playback.seekToProgress` is ✅ test; `scrubTo` is not |
| TP-05 | alternate | <kbd>←</kbd>/<kbd>→</kbd> with the timeline focused | Seeks | ⚠️ — and note what it seeks: `step(±60)` is ±60 display frames, i.e. **±1 real second × the current speed**, so ±60 simulated seconds at ×60 and ±900 at ×900. That is not the retired `KB-04`'s ∓5 s / ∓60 s; see `KX-10` |
| TP-06 | alternate | Step back / forward | Pauses first, then advances exactly one display frame at the current speed | ⚠️ — shares one handler with `KX-05`'s <kbd>,</kbd>/<kbd>.</kbd> |
| TP-07 | alternate | The loop chip | A `.chip[aria-pressed]` beside the speed chips, not a checkbox; toggling re-adopts the run at the current instant, because `Playback` takes `loop` at construction | ✅ test for the markup (`provenanceBlock.test.ts`) · ⚠️ for the re-adopt |
| TP-08 | invalid | Type into the seed field | A blank draws one and shows it; anything else re-runs at that seed | ⚠️ — **and worth driving carefully**: the parse is `BigInt(raw.replace(/\D/g, '') \|\| '0')`, so a non-numeric entry becomes **seed 0** rather than being refused, and a mistyped seed silently reproduces a different run. Unverified, not asserted anywhere |
| TP-09 | alternate | Verify replay | A match names the fingerprint; a **mismatch reports both fingerprints and leaves the stored recording on screen** | ✅ test (`record/document.test.ts`, `replay/replay.test.ts`, including a fingerprint that moves when a car's start position moves) · ⚠️ (the button) |
| TP-10 | alternate | Save recording | A JSON document carrying the recording and its serialized frames, named by building and seed | ⚠️ |
| TP-11 | failure | Load a recording | The schema version is checked **first**; a newer one is refused by name; an **older** one is refused too, because a v2 recording has no `legs` and the overlay would silently report an empty window on it; a truncated file reports its parse position and the previous run keeps playing | ✅ test (`record/document.test.ts`) · ⚠️ (the file input and the adopt) |
| TP-12 | alternate | Export PNG | The current frame, with the seed and the clock in the header the canvas already draws | ⚠️ — the header's content is ✅ test (`canvas.test.ts`, *"names the reporting window in the footer, so the exported PNG says what it covers"*); the export is not |
| TP-13 | failure | Press `copy run` | One control copies `building, dispatcher, traffic, seed, duration` in a form the CLI accepts | 🔲 **unmet, and carried forward verbatim from the retired `RV-T7` and from [`GAPS.md`](../../GAPS.md).** The line reads `--building … --dispatcher … --seed … --duration …` and names **no traffic and no day**. `--traffic` is a real `elevator-sim watch` flag, the coach ribbon's pattern select really does move the run off the building's own profile, and the day's event multiplies demand on top. So on any non-default pattern, or any day past the first, the line reproduces a **different** run — a provenance claim the CLI would honour and the reader could not check |
| TP-14 | happy | How many controls copy provenance | Exactly one | ✅ test — `provenanceBlock.test.ts` asserts `#copy-provenance` is gone from `index.html`, from `elementMap.ts` **and** from `docs/12`, in both directions. The design refactor had left two controls calling the same function with the same state |
| TP-15 | happy | The block's vocabulary | No native checkbox and no visible file input; the seed, the bank filter and the landing selector carry the editors' field styling; `.field-inline`, `.file-ghost` and `.provenance` declared once in the stylesheet; what remains grouped under an eyebrow | ✅ test |
| TP-16 | empty | No recording | The six transport controls are disabled and visibly so — **never enabled controls that do nothing** | ⚠️ — `disableTransport` is called from `main`, from `adopt` and from the failure path. This is the exact pair the retired § B.3 found **false** twice, so it is high on § 26 |
| TP-17 | failure | A run that throws | The message in the `role="alert"` slot, the status reading *the shift did not run*, and focus moved | ⚠️ |
| TP-18 | alternate | The status line after a run | `AWT … · WT95 …`, or the suppression reason in its place | ⚠️ for the writing · ✅ test for the gate — `meansAreSuppressed` has one home in `frame/overlay.ts` and is read by everything |

---

## 14. Day report — `DR-`

**Goal (Operator).** An honest account of the day, including the parts that cannot be quoted.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| DR-01 | happy | The playhead reaches the end | The day closes and the sheet opens, **once** — a loop does not file the same day twice | ⚠️ — the `filedRunId` guard is in `tick`; untested |
| DR-02 | alternate | Open the Day report tab by hand | The shift closes there too, and the tab is not set twice by two writers fighting | ⚠️ |
| DR-03 | happy | Average wait on a clean run | `summary.meanWaitS` exactly, formatted once, and **never the mockup's arithmetic** (the handoff's own prototype computes it as `28 + (100 − pct) × 0.9`) | ✅ test (`shift/report.test.ts` **and** `dev/reportPanel.test.ts`, both with the mockup formula as a negative control) |
| DR-04 | failure | Average wait on a refused run | The literal word, the run's own reason verbatim, **no digit anywhere in the value**, marked in the class a suppressed statistic already uses — and on **either** ground, not only saturation | ✅ test |
| DR-05 | alternate | The observations | Carried, the minute share with its denominator, the deepest queue with its floor and clock time, and the stairs — **never suppressed**, because seeing the divergence is the point | ✅ test |
| DR-06 | edge | Worst wait | States its censoring: *at least* when the longest wait belongs to a leg that never boarded; *not recorded* — never `0 s` — when the window held no arrivals | ✅ test |
| DR-07 | happy | Energy | Total **and** per-leg, always both, side by side and adjacent, with the per-leg figure's denominator; neither ranked, neither given a ranking colour or class even if its tone said otherwise; no other cell marked as an axis or given an energy unit; *not recorded* rather than `0 kJ` — [§ D106](../../DECISIONS.md) | ✅ test (both suites, with a refusal-to-rank case) |
| DR-08 | edge | Where it went wrong | Only clock times inside the recording's own span, **including in the advice**; the demand phase the worst moment fell in, or none invented for a recording that carries no schedule; the reporting window named | ✅ test |
| DR-09 | happy | The rest of the sheet | Title, meta lines, verdict, streak, cleared banner only when a day banked the last clean shift, the four levers **verbatim**, diagnosis rows accented from their own tone, tomorrow's forecast with the growth it really applies, and the small print naming this run's dispatcher | ✅ test |
| DR-10 | alternate | The goal rows | Every state carries a glyph **and** a word, not only a colour; pending is drawn as neither met nor missed | ✅ test |
| DR-11 | empty | Nothing filed yet | *Nothing filed yet* with the design's placeholder lede, naming a control that **exists**; no figures, no goals, no diagnosis, nothing to advance to, and **no weekday it has not earned** | ✅ test |
| DR-12 | alternate | **Take the next assignment** | Restarts the week on the next contract's building, keeping what was cleared, and clears the run | ✅ test for the transition (`week.test.ts`: resets streak, banked count, day and history; awards a contract once however many clean days follow; at the end of the list says so rather than promising a sixth scenario) · ⚠️ (the button) |
| DR-13 | alternate | **Open the doors on tomorrow** | Advances the day, wraps the weekday, clears the award so a banner belongs to one report, and clears the recording in the **same patch** so the reader never sees yesterday's figures under today's date | ✅ test (`week.test.ts`) · ⚠️ (the button) |
| DR-14 | recovery | **Back** | Returns to the Simulation tab | ⚠️ |
| DR-15 | alternate | A building the reader drew | Graded without pretending it banks anything | ✅ test |
| DR-16 | alternate | <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Closes the shift | ⚠️ — and **it is documented nowhere on screen**; there is no shortcut list in the interface |

---

## 15. Scenarios — `SC-`

**Goal (Newcomer, Operator).** Pick something to learn, and be told what it teaches before
starting.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| SC-01 | happy | The card list | Five cards in the handoff's order, each naming a building that **resolves against `data/buildings/`**, covering every shipped building exactly once, teaching zoning before transfers | ✅ test (`scenariosPanel.test.ts`, `shift/contracts.test.ts`) |
| SC-02 | happy | The stat line | Generated from the building JSON — equal to `statLineOf` the loaded building for every scenario — and it **moves when the building does**, which is what "generated" buys; the fastest car quoted; thousands grouped without asking the machine what locale it is in | ✅ test |
| SC-03 | happy | Card status | Current / cleared / the rest, each with a distinct glyph, a distinct colour **and** a word for both | ✅ test |
| SC-04 | alternate | A scenario nobody has reached | Still takeable — **scenarios teach, they do not gate**; the list never answers *locked* | ✅ test (asserted in both `contracts.test.ts` and `scenariosPanel.test.ts`) |
| SC-05 | happy | The objective line | Counts what has been banked, **only on the contract you are on**, and reads *Cleared* once it has been | ✅ test |
| SC-06 | happy | The prose and the art | Each contract's brief, reward and teaching point carried without restating one as the other; one of the design's five swatches per scenario, with a fallback for anything else | ✅ test |
| SC-07 | failure | A card whose building did not load | Says so rather than inventing a spec, and the card is not takeable | ✅ test for the sentence · ⚠️ for `node.disabled` |
| SC-08 | alternate | Take a card | The week restarts on that contract's building and what was cleared is kept | ✅ test for the transition (`week.test.ts`) · ⚠️ (the click) |
| SC-09 | alternate | The sixth *build your own* card | Opens the building editor on a blank document | ⚠️ — its copy is inline in `mountScenarios` and reaches only `honesty/derive.ts`'s **static** sweep, which `derive.test.ts` states as *"a limitation, not coverage"*; `startOwn` has no test |

---

## 16. Right rail — `RR-`

**Goal (Analyst, Designer).** Change who is driving, what turns up, what the building is and what
the machines are — and read what each choice actually is before making it.

Four segments, each a list, a plate and an `Open … editor →` button. Below 1340 px it is the
drawer of `SH-10`.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| RR-01 | happy | The four segments | Exactly one shown and given the tabindex; arrows wrap; <kbd>Home</kbd>/<kbd>End</kbd> are the ends | ✅ test (`surfaces.test.ts`) · ⚠️ (the listeners) |
| RR-02 | happy | The dispatcher list | Tells every shipped profile apart, renders no profile's `$comment` whole or in part, carries **no estimate cue**, generates an honest one-liner from the weight vector, prints the two declared facts a vector cannot carry as the file declares them, names the engine rather than inventing a family, and notes `n of m · family` | ✅ test (`rightRail.test.ts`) |
| RR-03 | happy | The dispatcher plate | Eight rows in the design's order; weighted terms counted against the **library** rather than a literal twelve; at most the heaviest three, largest first; defaults read off the **resolved** config, so a default the profile never declared is still reported; parking, pooling and zoning read off the profiles that declare them; a group that adds no load filter said so; a profile the engine refuses said to be **refused** rather than described with defaults it will not run with | ✅ test |
| RR-04 | alternate | A dispatcher that cannot read this building's credential | The note names the credential, sits beside the list where the pairing is chosen, is `role="status"` and not `role="alert"`, leaves Run enabled, and is **empty when there is nothing to say** | ✅ test for the wording and the classification (`access/dispatcherCredentials.test.ts`, `lockedOutRender.test.ts`) · ⚠️ for the placement and the empty case on screen |
| RR-05 | happy | The traffic plate | States the pattern in traffic-study units and says the figures are **observed**; reads rate, batch mean and interfloor share off the profile; says *there is no building* rather than printing a population of zero | ✅ test |
| RR-06 | happy | The building plate | Every figure derived from the resolved building; handling capacity and interval **omitted with a reason** when there is no run; the 80 % design load stated beside the rated capacity; banks counted from the building rather than assumed to be one | ✅ test |
| RR-07 | happy | The machines segment | The nameplate block is **engineer-only**; the 80 % fill rule is read from the conventions block rather than written out; the class record's own envelope is carried; the warning is an **advisory** that never says the loader refuses, names the rise and the class's own limit, says nothing alarming inside the envelope, and makes no claim about a building it has not been given | ✅ test |
| RR-08 | happy | Pick an item in any of the four lists | The run changes | ⚠️ — the *effect* is covered downstream (`state.test.ts`, `authoring/authoring.test.ts`), the **pick** is four `onPick` closures in `rightRail.ts` and none is asserted |
| RR-09 | alternate | The four `Open … editor →` buttons | Reveal the contextual tab, open it, and move focus to it | ⚠️ |
| RR-10 | failure | A run whose mean is refused | **No mean in any plate** — including the achieved interval, which is still a mean over a queue that never settled | ✅ test |
| RR-11 | alternate | The drawer | The same rail as an overlay, with a toggle labelled by what pressing it will do | ✅ test for the label · ⚠️ for the overlay and the `z-index` layering |

---

## 17. Dispatcher editor — `DE-`

**Goal (Analyst).** Change what the dispatcher optimizes for, and see it change the run.

Wave 10's standing rule applies to every row marked *changes the run*: **the control is moved and
the resulting run is required to differ, compared on the legs** — who was carried by which car and
when — never on a window statistic, because a summary over the peak five minutes can legitimately
be equal for two visibly different runs ([§ D177](../../DECISIONS.md)).

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| DE-01 | happy | The term rows | One per declared term in the **file's own order**, each carrying the term's own `measures` as tooltip and its `serves` as sub-line | ✅ test (`dispatcherEditor.test.ts`) |
| DE-02 | happy | Weighted terms | The position is read off the spec, and which terms are weighted is marked | ✅ test |
| DE-03 | alternate | A term the model cannot act on | The inert notice appears **exactly** when `inertTerms` names it — § D112's `rideTime` defect turned into a rule — and never marks a term the model did not name | ✅ test, both directions |
| DE-04 | happy | Move a weight | The run changes | ✅ test (`authoring.test.ts`, on the legs) |
| DE-05 | happy | The three flags and the two levers | Each flag read off the spec and naming the field it writes; the levers read off the **group**, not off the dispatcher | ✅ test |
| DE-06 | happy | Flags and levers change the run | Turning the load sensor off changes it **once a car is full enough for it to matter**; the zoning flag changes it; parking and zoning levers each change it | ✅ test — and § D177 records that the *load sensor off* value the control first offered was one the model layer rejects, which no component test of the control would have caught |
| DE-07 | alternate | The dwell chips | Four states — nothing chosen and no chip matching, a profile that authors no dwell at all, the reader's own choice lit **as an override**, and an inherited value lit **as inherited** — and the three chips are three genuinely different buildings-in-service, with seconds taken from the shipped bands rather than invented | ✅ test |
| DE-08 | edge | Save a second dispatcher | The new id **skips one already in use** rather than counting the list | ✅ test |
| DE-09 | happy | Name, **Copy current**, dirty flag, Save, Close | The working copy is named, seeded from the current profile, marked dirty and saved | ⚠️ |
| DE-10 | alternate | The round trip | Every shipped profile round-trips without changing what it means; a weight of zero is never written; dirty is reported exactly when something moved; **an unedited round trip produces a bit-identical run** | ✅ test |
| DE-11 | failure | The error slot | A refusal is shown rather than swallowed | ⚠️ |

---

## 18. Traffic editor — `TE-`

**Goal (Analyst).** Change what turns up, and see the day it makes before running it.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| TE-01 | happy | The peak-order chips | Three offered, exactly the selected one pressed, its note carried | ✅ test |
| TE-02 | happy | The parameter rows | The engine's own parameters, grouped with each group headed exactly once, each formatted in its **own declared unit**, each patching the field it names, and the boolean row patched as a boolean | ✅ test |
| TE-03 | alternate | Parameters this engine cannot take | The mean group size is drawn **as a refusal**, because no demand field carries it; the interfloor share is refused under the two-way order and offered under the other two; the mix-amplitude row appears only under two-way | ✅ test |
| TE-04 | happy | The preview strip | Resolves the template the spec selects **with the run's own overrides** — mirroring `traceConfigFor` — draws the template's own phases contiguously over the whole shift, rates each segment from the spec's own demand rather than a placeholder, marks which segments lie inside the only quotable part of the run, names a phase from its two endpoint intensities, and rules the tick row with the shift's real clock span | ✅ test |
| TE-05 | failure | Overrides that cannot be applied | Returns a **reason** rather than throwing | ✅ test |
| TE-06 | happy | Every slider changes the run | Peak demand, peak hold, peak order, interfloor share, off-peak level and mean group size — each moved, each required to change the legs | ✅ test — the mean-group-size row is the one that reaches the file rather than the options, which is the distinction § D177 was written about |
| TE-07 | alternate | Saving | Widens **only** the profile it names, and leaves the file byte-identical when the batch mean was not moved | ✅ test |
| TE-08 | happy | Name, dirty, Save, Close, error | | ⚠️ |

---

## 19. Machines editor — `ME-`

**Goal (Designer).** Fit a different machine class, inside its own envelope.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| ME-01 | happy | The nine rows | Exactly the model's rows and **no control for a file-level field**; each group headed exactly once in the model's order; each row naming the record field it writes | ✅ test |
| ME-02 | happy | Values | Read off the spec, formatted in the row's unit, patched to the named field | ✅ test |
| ME-03 | happy | The rated-speed chips | The ladder taken from the **shipped table** rather than invented; never a speed outside the class's own band; both ends of the band always offered so a narrow class still has chips; the current typical pressed when it is inside the band | ✅ test |
| ME-04 | invalid | A typical speed dragged outside its own band | **Clamped**, rather than saving a record the loader refuses | ✅ test |
| ME-05 | alternate | Saving a class | An **addition** — a shipped class is never mutated — and the result is a class the parser accepts | ✅ test |
| ME-06 | happy | Name, dirty, Save, Close, error | | ⚠️ |
| ME-07 | happy | **A machine-class change reaches the run** | Fitting a different class changes the legs | ⚠️ — **this is the one editor § D177's rule does not cover.** `authoring.test.ts` has *"the dispatcher editor is not decoration"*, *"the traffic editor is not decoration"* and *"the building editor is not decoration"*. There is no *"the machines editor is not decoration"*. Its four assertions are round-trip, clamp, non-mutation and parseability — every one a claim about the **spec**, none about a **run**. § 26 item 3 |

---

## 20. Building editor — `BE-`

**Goal (Designer).** Try a geometry and see whether it is plausible before committing to a sweep.

The spec column, the elevation with its shaft bands and express toggle, the access-zoning block
(wave 11), and — kept whole beneath them — the document editor of the retired § 4.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| BE-01 | happy | The spec rows | Exactly the model's rows, each group headed once, each naming the field it reaches, integers rounded on patch | ✅ test |
| BE-02 | edge | Over 100 % let | An over-capacity track and note **only** past 100 %, and no other row gets a track at all | ✅ test |
| BE-03 | happy | The load chips | Never a load outside the class's `capacityLbRange`; labelled with the **capacities table's** persons, not lb ÷ 150; exactly the current load pressed when the class offers it | ✅ test |
| BE-04 | happy | The speed chips | Never outside the class's band; **nothing** pressed when the current speed sits outside the class it is fitted to; the class's typical always offered, so a freshly fitted car always has a pressed chip | ✅ test |
| BE-05 | alternate | The sky-lobby chips | Name the floors an *every N* rule seeds, excluding the lobby and the roof; press *none* on a building with no transfer levels; **drop a rule that names no floor on this building** rather than offering an inert chip; press nothing once a dot has been toggled off a rule | ✅ test |
| BE-06 | happy | The elevation's floor rows | One row per floor, top floor first with the lobby last — the direction the picture reads; the entrance and every transfer level badged; the row height shrunk for a tall tower rather than overflowing the panel | ✅ test |
| BE-07 | alternate | Occupancy | People shown as today's population over the floor's design capacity; a hand-set floor counted and the rest left on the building-wide slider; a non-zero overage at 120 % and none at 100 %; **the lobby's bar and dot drawn inert, because `buildingFromSpec` reads neither** | ✅ test — the inert-lobby row is the ledger's own kind of honesty: a control that is drawn and stated not to act |
| BE-08 | happy | The shaft bands | Agree with `banksOf` about every car's band; positioned against the same row grid the floors are drawn on; every bank index tinted, wrapping rather than running out | ✅ test |
| BE-09 | happy | The express toggle | Offered **exactly where the choice exists**, labelled which way it is thrown, with its tooltip taken **verbatim from the handoff** rather than paraphrased; a band starting above the lobby is called express and said to still land in the lobby | ✅ test |
| BE-10 | happy | Throw the express toggle | **The run changes, and it is the legs that move, not just the label**; the bank splits, because two cars that disagree about the lobby do not open onto the same floors; the lobby an express car really opens at is counted, and stops being counted when it does not; dirty when it moves and not when a redundant `false` is written | ✅ test |
| BE-11 | failure | Close the lobby off entirely | The building strands people, **and the editor says so first** | ✅ test |
| BE-12 | alternate | The drags | A vertical fraction maps onto the floor its row covers; a horizontal fraction snaps to the same 5 % step the slider uses; a band dragged off the bottom leaves floors nobody serves **and says so**; a rise past the class envelope is an **advisory, never a refusal** | ✅ test |
| BE-13 | happy | Add / remove a shaft | Adding a shaft changes the run | ✅ test |
| BE-14 | happy | Occupancy, floor count, a pinned band | The occupancy slider changes how many people the lifts must move; the floor count changes the run; a pinned shaft band changes **which car answers** | ✅ test |
| BE-15 | happy | The access-zone floor multi-select | Offers this building's own floors, top first, and nothing else; marks exactly the floors in the selected zone and names the zones that share one; **drops a floor the tower no longer has** rather than offering it | ✅ test (wave 11) |
| BE-16 | happy | The credential control | Offers the groups the building already names, in **declared order**, with no fixed vocabulary | ✅ test |
| BE-17 | happy | The coverage matrix | Floors × credential groups, top floor first, every group a column; *unrestricted*, *permitted* and *not permitted* said as three different things; **a glyph and a word in every cell** — `KB-15`, not a colour-only signal; a floor no group opens made visible, which is the state that strands demand; restricted floors named as **runs**, not as a comma-separated census; no column and no restricted floor on a building with no zone | ✅ test |
| BE-18 | happy | Access zoning changes the run | An access zone changes the run **and leaves every shaft serving exactly what it did** — service and access zoning stay separate; the floor multi-select changes it; the credential control changes it; the zones the round trip used to drop change it on Secure Tower; and *a group added beside one that already works is a no-op, which is the mechanism, not a bug* | ✅ test — and the editor's sentence is checked against **what the real route planner says** about who can get out of the lobby |
| BE-19 | alternate | The elevation's note | Says nothing about credentials on a building with no zone; names the credential barrier **as a credential** and the floors as served; says how many floors no group opens when that is the state | ✅ test |
| BE-20 | failure | Validation | Accepts a building the loader builds and reports its advisories rather than throwing; catches a `ConfigError` and renders it, because it is a fact about the document; surfaces the rise advisory as a warning while still loading the building; accepts a bank split produced by a drag | ✅ test |
| BE-21 | happy | The chrome | Add / remove zone, add a credential group (button **and** <kbd>Enter</kbd>), level occupancy, clear ranges, start from blank, Save, Close, dirty, error | ⚠️ |
| BE-22 | alternate | The round trip | Every shipped building reads into a spec whose shape survives a rebuild; a shipped building's access zoning is **carried through rather than dropped**; only the zone floors this tower has are written, and what was left out is said; a zone that covers nothing is left out of the document without claiming a refusal; dirty for a zone change and not for a floor nothing writes; persons taken from the capacities table rather than divided by 150 | ✅ test |
| BE-23 | alternate | The document editor | Kept whole beneath the elevation, in `<details id="building-document">` — the only surface that can express a floor range, per-floor ids and the access zoning the block above now also edits | ⚠️ for the **route**; the rows themselves are the retired § 4's `ED-01`…`ED-25`, whose marks were established against the old shell and **have not been re-established here**. `dev/editor.ts` resolves its own thirty-two ids, which is why `elementMap.test.ts`'s *"ids the viewer never resolves"* list is not empty and is asserted exactly |
| BE-24 | alternate | **Open the machine editor →** from the spec column | Reveals and opens the Machines tab | ⚠️ |

---

## 21. Retained instruments — `IS-`

**Goal (Analyst).** Say *this dispatcher is better* — which is the only place it can ever be said,
and why `docs/12` § 2.3 refused to delete these three to match a design that had not heard of them.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| IS-01 | happy | Compare runs a batch | Both arms get the same seed at every replication, from the shipped derivation, and **really do see the same passengers** — checked outside the module, with two negative controls | ✅ test (`batch/runBatch.test.ts`) |
| IS-02 | happy | Compare's report | Only metrics the shipped projection has; **no probability word reaches the reader**, with a positive control; no estimate without the count it came from and no invented denominator; complete-case suppression — one invalid pair suppresses the row and the survivor average is printed nowhere; a verdict only when the paired interval excludes zero; energy shown and **never ordered**; a profile against itself **not** resolved; below the budget the interval is drawn and no winner named | ✅ test (`batch/report.test.ts`) |
| IS-03 | happy | Compare's defaults | Opens on **two different arms** | ✅ test (`defaults.test.ts`) |
| IS-04 | happy | Compare's controls, progress, cancel and error slot | | ⚠️ — `mountBatchPanel` is excluded from the honesty search **by construction**, as DOM-bound, and its authored literals reach only the static sweep |
| IS-05 | happy | Campaign | Seven stages in order, one per measured scenario; goals a **subset and a superset** of the measured table, so none can be added or dropped by hand; briefs free of probability words at load time; fail states in R4's order; the editable weight vector runs a profile `data/` does not contain; the holdout half is carried, including the stage that **does not survive** it | ✅ test (`campaign/campaign.test.ts`, with sixteen negative controls) |
| IS-06 | happy | Campaign's panel and weights bar | | ⚠️ |
| IS-07 | happy | Parameters | One control of the right kind for every row of a schema, taken from the declaration; a gated-off dimension **disabled with its reason** rather than hidden; an edit or a reset to a gated-off dimension refused **naming the gate**; a value the schema does not admit refused on every kind; declared bounds themselves accepted | ✅ test (`controls/controls.test.ts`, driven against a fictional schema this product does not ship **and** against the real one) |
| IS-08 | happy | Parameters' coverage | Points at every discovered schema and names the rows inside them that cannot be searched; says the same count in the status line as it draws in the list | ✅ test |
| IS-09 | happy | The Parameters form's mount | | ⚠️ |

---

## 22. Modes — `MD-`

**Goal.** A newcomer sees less; **nobody sees less of a failure.**

`mode/` calls the two levels `basic` and `advanced`; the handoff calls them Casual and Engineer, so
the values are the model's and the labels are the design's.

| Id | Class | Scenario | Expected | Mark |
|---|---|---|---|---|
| MD-01 | happy | The header select | Two options, the handoff's labels over `mode/`'s values | ⚠️ — read from the markup; nothing asserts the pairing |
| MD-02 | alternate | The remembered mode | Persisted to `localStorage`, **unless the link named one** — a deep link is somebody sending a finding, and a remembered preference that overrode it would show the recipient a different page without either of them knowing | ⚠️ |
| MD-03 | edge | `?mode=advanced` | The **select follows the state**, so the page is not in engineer mode with its own control reading *Casual* | ⚠️ — the bug this guard exists for is exactly the kind that has shipped here before |
| MD-04 | happy | A mode is a presentation, not a run | The recording is untouched in either mode, and the same items are produced whichever mode is read first | ✅ test (`mode/parity.test.ts` — § 4's own acceptance clause) |
| MD-05 | failure | Basic must not hide a failure | The fail state, its diagnosis, the suppression reason, the seed, the undelivered count, the passenger model, the locked-out landing, the warning code **and its styling** all survive into Basic; each way of losing one is refused **by name**, with the missing text quoted | ✅ test — eight distinct refusals, each watched failing |
| MD-06 | alternate | The parity set is derived | A fail state, a suppression reason and a warning code **the product does not ship** are carried through, so the check cannot be passing because the corpus is thin | ✅ test |
| MD-07 | failure | A parity violation on screen | Written into `#mode-parity`, which is `role="alert"` | ⚠️ |
| MD-08 | alternate | Basic's suppression wording | Keyed on the run's **own** ground, and asserted from a **real recording** rather than a fixture — the whole `disclosure.test.ts` block was green for a commit while the shipped screen rendered something else ([§ D185](../../DECISIONS.md)) | ✅ test |
| MD-09 | edge | A ground this build does not recognise | Falls back to the ground-free lead and does not go quiet; an unrecognised ground and an absent one are treated identically | ✅ test |
| MD-10 | alternate | Engineer-only surfaces | The rail's nameplate block and the honesty card's maths | ✅ test (`rightRail.test.ts`, `leftRail.test.ts`) |

---

## 23. Keyboard and focus — `KX-`

Applies to every surface. Non-negotiable rows are marked ⛔. `KX-` rather than `KB-`, because the
retired § 5's `KB-` ids are cited from source and keep their old meanings.

| Id | Behaviour | Mark |
|---|---|---|
| KX-01 | ⛔ Every control reachable by <kbd>Tab</kbd> in visual order; a skip link is the first stop | ⚠️ — the skip link is in the markup; the order is asserted nowhere |
| KX-02 | ⛔ Focus ring always visible, never removed without a replacement | ⚠️ — `:focus-visible` is declared once in `index.html` and the ghost file-input label is documented as carrying the ring the input would have drawn; neither is asserted |
| KX-03 | <kbd>Space</kbd> toggles play/pause | ⚠️ |
| KX-04 | ⛔ Typing in an `<input>`, a `<textarea>` **or a `<select>`** never triggers a shortcut | ⚠️ — the guard is three `instanceof` checks at the top of the window handler; untested |
| KX-05 | <kbd>,</kbd>/<kbd>.</kbd> step one display frame, pausing first | ⚠️ |
| KX-06 | <kbd>[</kbd>/<kbd>]</kbd> walk the speed ladder, clamped at both ends | ⚠️ |
| KX-07 | <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> closes the shift | ⚠️ — and undiscoverable; see `DR-16` |
| KX-08 | <kbd>←</kbd>/<kbd>→</kbd>/<kbd>Home</kbd>/<kbd>End</kbd> walk the tab strip and the rail segments, over the **visible** ring | ✅ test for both rings (`surfaces.test.ts`) · ⚠️ for the two listeners |
| KX-09 | <kbd>←</kbd>/<kbd>→</kbd> on the focused timeline (`role="slider" tabindex="0"`) seek | ⚠️ |
| KX-10 | <kbd>←</kbd>/<kbd>→</kbd> seek ∓5 s and ∓60 s with <kbd>Shift</kbd>; <kbd>Home</kbd>/<kbd>End</kbd> jump to the run's ends | 🔲 **not built in this shell.** The retired `KB-04` and `KB-05` have no successor: there is no global arrow handler and no <kbd>Home</kbd>/<kbd>End</kbd> handler, and the timeline's own arrows are `KX-09`'s frame step, not a fixed-seconds seek |
| KX-11 | <kbd>Escape</kbd> dismisses the drawer | 🔲 **not built** — see `SH-12` |
| KX-12 | ⛔ After an error, focus moves to the error message so a screen reader announces it | ⚠️ — three call sites (`failRun`, the load failure, the recording-load failure) all `focus()` a `role="alert" tabindex="-1"` region; none is asserted, and the editors' own error slots are separate elements |
| KX-13 | ⛔ Modal dialogs trap focus and restore it on close | ⚠️ — a native `<dialog>.showModal()`, so the trap is the platform's; the restore is a `close` listener in `main.ts` |
| KX-14 | ⛔ The canvas is not a focus trap; it exposes a text alternative summarising the current frame | ✅ test for the alternative's content (`describeFrame.test.ts`, the fullest test in the suite) · ⚠️ for the live-region cadence |
| KX-15 | ⛔ Colour is never the only signal | ✅ test — asserted in **twelve** independent places: the wait bands, the rider glyphs, the landing marks, the door phase, the overload alarm, the mood level, the stat rows, the mood bar, the goal rows, the decision rows, the scenario status and the access-coverage matrix. `landingMarks.test.ts` goes further: no two claims on one landing row may share a **shape family**, checked with the entire theme collapsed to a single string and an exhaustiveness guard that throws on an unclassified mark |
| KX-16 | ⛔ `prefers-reduced-motion` respected: a freshly adopted run does **not** autoplay, and the stylesheet guard overrides any transition or animation | ✅ test (`motion.test.ts` pins the query string, both autoplay verdicts, and that `index.html`'s guard block still selects `*` and carries `!important` on both properties) |
| KX-17 | The roving tabindex never lands on a hidden tab | ✅ test |

---

## 24. Responsive — `RX-`

Four breakpoints, all in `index.html`: **1340** (the drawer, duplicated from
`DRAWER_BREAKPOINT_PX`), **1180** (`data-hide-narrow`), **900** (the left rail narrows) and **768**.

| Id | Viewport | Expectation | Mark |
|---|---|---|---|
| RX-01 | ≥ 1340 px | Three columns: left rail, stage, right rail | ⚠️ |
| RX-02 | < 1340 px | Two columns; the right rail becomes an absolutely positioned overlay drawer, **closed**, and `#drawer-toggle` appears | ✅ test — `surfaces.test.ts` reads `index.html` and asserts the `@media` rule matches the constant, which is what stops the two drifting · ⚠️ for the layout itself |
| RX-03 | < 768 px | Controls stack; the canvas keeps at least 60 % of the height | 🔲 **not built.** The 768 px query restyles three things — the instrument body, the report sheet and the editor grid — and `.body` keeps a **236 px left rail at every width**. There is no stacked layout and no canvas height floor. The retired `RS-03` has no successor. **Found by reading — drive it (§ 26 item 4)** |
| RX-04 | < 1180 px | The building's spec line, the phase pill, the mode select and the banner step aside — the name outranks the spec | ⚠️ |
| RX-05 | < 900 px of canvas | The live metrics panel is **dropped rather than squeezed**, and draws nothing at all when the layout reserved no room | ✅ test (`overlayRender.test.ts`) · ⚠️ for `main.ts`'s `OVERLAY_MIN_VIEWPORT_PX` decision |
| RX-06 | Short viewport | Floor rows thin **by label**, never by dropping shafts; the stride is computed from the row pitch, so it responds to height as well as to floor count | ✅ test |
| RX-07 | More shafts than fit | *Showing N of M*, never a silent truncation, and a list with no room at all collapses to one line naming what it holds | ✅ test |
| RX-08 | Resize during playback | Relayout without pausing or jumping the playhead — the layout is rebuilt per frame | ⚠️ |
| RX-09 | Crossing 1340 px | The drawer's state changes at the same instant the layout does — a `matchMedia('change')` listener, because `resize` alone left the rail as a stale overlay needing **two** presses of the toggle | ⚠️ — the defect is documented in `main.ts`; the fix is unasserted |
| RX-10 | `devicePixelRatio` 2–3 | Crisp, capped at ×2 | ⚠️ |
| RX-11 | Print / screenshot | The frame exports as PNG carrying its seed, its clock **and its reporting window** | ✅ test for the header's content · ⚠️ for the export |

---

## 25. Ledger — where the 219 rows stand

| State | Rows | Per surface |
|---|---|---|
| ✅ **run** — driven in a browser | **0** | — this pass held no browser, and no `✅ run` from the retired ledger was carried across |
| ✅ **test** — the whole row asserted, and the assertion located and read | **117** | `BE` 21 · `LR` 20 · `SG` 10 · `DR` 10 · `DE` 9 · `TE` 7 · `SC` 6 · `RR` 6 · `IS` 6 · `MD` 6 · `ME` 5 · `SH` 4 · `KX` 3 · `TP` 2 · `RX` 2 · `CO` 0 |
| ✅ **test** + ⚠️ — one clause each way, almost always *the decision is asserted, the DOM writing or the listener is not* | **40** | `SH` 11 · `TP` 8 · `SG` 5 · `CO` 3 · `RR` 3 · `RX` 3 · `DR` 2 · `SC` 2 · `KX` 2 · `LR` 1 |
| ⚠️ **unverified** — built and reachable, neither driven nor covered | **55** | `KX` 10 · `TP` 7 · `CO` 5 · `RX` 5 · `DR` 4 · `MD` 4 · `SH` 3 · `BE` 3 · `IS` 3 · `SG` 2 · `RR` 2 · `DE` 2 · `ME` 2 · `LR` 1 · `SC` 1 · `TE` 1 |
| 🔲 **not built, inert, or failing its own condition** | **7** | `SH-09` (nothing writes the URL back) · `SH-12` and `KX-11` (Escape does not dismiss the drawer) · `SG-15` (the bank filter is inert) · `TP-13` (`copy run` names no traffic) · `KX-10` (∓5 s seek, Home/End) · `RX-03` (no stacked layout below 768 px) |

**219 rows. 117 fully asserted, 40 half asserted, 55 unverified, 7 not met.**

The four bucket counts and the seven `🔲` ids above were **derived from this file's own tables**
rather than tallied by hand, on the rule *a row carrying `🔲` is not built; a row carrying both
`✅ test` and `⚠️` is half; a row carrying only one is that one.* If a row is edited so that its
marks change, this table is wrong until it is re-derived — which is [§ D149](../../DECISIONS.md)'s
rule pointed at a count instead of a figure, and is the only reason the numbers are worth printing.

Three things that table is careful about:

1. **The 40 half rows are not rounding errors.** They are the DOM half of the eight mounts, and
   `honesty/derive.test.ts` excludes every one of them by name with a stated reason — *"DOM-bound
   … their authored literals are swept statically below, which is weaker than driving them and is
   stated as a limitation rather than presented as coverage."* Marking those rows a plain `✅ test`
   would claim precisely what that exclusion refuses to claim.
2. **`dev/main.ts` holds all the event wiring and `main.test.ts` covers one exported function.**
   `main.test.ts` exists — it was not there when the survey was written — but its three `describe`
   blocks are entirely about the wait-age legend. Forty-odd `addEventListener` calls, `drawHeader`,
   `drawFooter`, `drawCoach`, `drawStage`, `drawTransportChrome`, `runShift`, `adopt`, `closeShift`,
   `applyDeepLink` and `randomSeed` have no test at all. That single fact accounts for most of the
   `⚠️` column.
3. **Seven `🔲` rows, and three of them were found by reading in this pass** — `SG-15`, `SH-09`,
   `RX-03`. Reading found them; only driving can confirm them, and this project's record is three
   consecutive passes where driving found a defect reading had missed. The other four were already
   known: two carried forward from driving (`SH-12`/`KX-11`, `TP-13`) and one read off the absence
   of a handler (`KX-10`).

---

## 26. What needs driving, in order

Ordered by value: what could be inert first, then what has no test at all, then what has failed
before, then the rest. Each item names the rows it closes.

| # | Drive this | Rows | Why it is here |
|---|---|---|---|
| 1 | **The bank filter.** Pick a bank on `vertical-city` (35 shafts, 4 banks) and watch the stage | `SG-15` | Suspected **inert** from reading: `#bank-filter` writes a binding `drawStage` never reads. A control that looks like it works is the worst kind. If it is inert, the retired `RS-05` needs re-marking too |
| 2 | **The URL.** Change building, seed, tab and rail; read the address bar; reload | `SH-09`, `SH-08` | Suspected **not built** — no `pushState`/`replaceState` in the package. Deep links still *load* (`applyDeepLink`), and `applyDeepLink` itself has **no test**, so both directions need a browser |
| 3 | **The machines editor's effect on a run.** Fit a different class, run, compare the legs | `ME-07`, `ME-06` | The only one of the four editors with no *"the control changes the run"* test. § D177 found three inert or wrong controls in the other three |
| 4 | **The narrow layouts.** 1339, 1179, 899 and 767 px, plus a crossing in each direction | `RX-03`, `RX-01`, `RX-04`, `RX-09`, `SH-10` | `RX-03` is suspected **not built**. `RX-09` is a defect the code documents having fixed and nothing asserts — and the symptom was a rail needing *two* presses to close |
| 5 | **The out-of-service badge.** Click one under a shaft; confirm the car leaves and the shift re-runs | `SG-06`, `SG-07` | The only pointer target on the canvas. The hit rectangle is asserted; the handler that consumes it is not, and it re-runs the whole shift |
| 6 | **The coach ribbon's two untested selects.** Change the pattern, then the shift length; compare the legs both times | `CO-02`, `CO-03`, `CO-01`, `CO-04` | The controls that decide what runs, held to a lower standard than any editor control. `shiftRunConfigOf` asserts the *negative* half only |
| 7 | **The transport's empty and error states.** Reload with `data/` moved aside; then a run that throws; then an editor hand-over after a failed run | `TP-16`, `TP-17`, `SH-15`, `SH-16`, `SH-19` | This exact pair was found **false twice** in the retired ledger — enabled controls with no listeners, and a disabled transport after an editor hand-over |
| 8 | **Retry.** Restore the moved file and press Retry | `SH-17` | `RV-21` was false when first driven and killed the page silently. `bootstrap.test.ts` now covers the state machine; the button and the focus move are still unverified |
| 9 | **The seed field.** Type a non-numeric seed | `TP-08` | `BigInt(raw.replace(/\D/g,'') \|\| '0')` silently yields **seed 0**. A provenance control that quietly changes the run |
| 10 | **`copy run`.** Copy on a non-default pattern and on day 3; paste into the CLI | `TP-13` | Known unmet. Driving it produces the evidence for the fix, and the fix has its own verification burden ([`GAPS.md`](../../GAPS.md)) |
| 11 | **The right rail's picks and its four `Open … editor →` buttons** | `RR-08`, `RR-09`, `SH-05`, `BE-24` | The handoff's **only** route to the four contextual editors. If `openTab` misfires, four surfaces are unreachable |
| 12 | **The tab strip.** Click each; arrow through it before and after revealing an editor; reload on a deep-linked tab | `SH-02`, `SH-03`, `SH-04`, `KX-08`, `KX-17` | The decision is well tested and the writer is not; a roving tabindex is a rule with an off-by-one in it |
| 13 | **The day-close paths.** Let a shift end; open the sheet by hand; **Take the next assignment**, **Open the doors on tomorrow**, **Back**, and <kbd>⌘</kbd>+<kbd>Enter</kbd> | `DR-01`, `DR-02`, `DR-12`, `DR-13`, `DR-14`, `DR-16` | Two entry points into `closeShift`, a `filedRunId` guard, and three buttons that patch the week |
| 14 | **The rest of the transport.** Play, pause, both step buttons, click-to-scrub, the loop chip, each speed chip, Verify, Save, Load, Export | `TP-01`–`TP-07`, `TP-09`–`TP-12`, `TP-18` | Ten controls; every underlying module asserted, every button unverified |
| 15 | **Keyboard and focus.** <kbd>Space</kbd>, <kbd>,</kbd>/<kbd>.</kbd>, <kbd>[</kbd>/<kbd>]</kbd>, typing in a field, the timeline's arrows, focus after an error, the confirm dialog, <kbd>Tab</kbd> order, <kbd>Escape</kbd> | `KX-01`–`KX-07`, `KX-09`, `KX-11`–`KX-13` | Four ⛔ rows are in this block. `KX-10` and `KX-11` are expected to confirm as **not built** |
| 16 | **The mode toggle.** Switch, reload, then open `?mode=advanced` in a fresh tab | `MD-01`, `MD-02`, `MD-03`, `MD-07` | The remembered-mode-versus-deep-link rule and the select-follows-state fix are both unasserted |
| 17 | **The honesty disclosure and the decision log**, on a suppressed run and a clean one | `LR-15`, `LR-22`, `SG-11` | The one control in the left rail, and the log the prototype's own rule made inert |
| 18 | **The four editors' chrome.** Name, dirty, Save, Close, error, and the building editor's zone / group / occupancy buttons | `DE-09`, `DE-11`, `TE-08`, `ME-06`, `BE-21`, `SC-09` | Every editor's **model** is asserted; none of their save paths is |
| 19 | **The three retained instruments.** Run a Compare, run a campaign stage, open Parameters | `IS-04`, `IS-06`, `IS-09` | Three mounts excluded from the honesty search by construction |
| 20 | **The document editor, re-established.** Open Building → the `<details>` block and walk the retired § 4 | `BE-23`, and the retired `ED-01`…`ED-25` | Twenty-five rows whose marks belong to a shell that no longer exists, describing a surface that still ships |
| 21 | **The degraded and empty states.** A building with no demand; a campaign file that will not load; a canvas with no 2D context | `SG-17`, `SG-18`, `SH-19`, `SH-20`, `CO-05`–`CO-07`, `SC-07` | `SG-17` lost its text fallback in the rewrite; `SH-19` is nearly unreachable because the shell runs on load |

---

> ## ↩️ Retired in place — the Phase 4 ledger, waves 1–9. Closed 2026-07-30; no longer updated.
>
> Everything below this line describes the **five-tab instrument panel** — Run viewer, Building
> editor, Parameters, Compare, Campaign — that wave 10 replaced with the three-column shift surface
> enumerated in §§ 8–26 above. It is kept **verbatim and at its original section numbers** for
> three reasons, in order of weight:
>
> 1. **Its ids and its section numbers are cited from source.** Around seventy source files and a
>    dozen documents name `KB-15`, `RV-T4`, `RV-08`, `RV-14`, `RV-T7`, `PB-07`, `PB-15`–`PB-17`,
>    `RS-04`, `RS-05`, `ED-07`, `ED-09`, `ED-12`–`ED-18`, `ED-20`–`ED-25`, `§ 7.1 rule 4`,
>    `§ 7.1 rule 5`, `§ A.3`, `§ C.3` and `§ 7.2`. Nothing here has been renumbered or deleted.
> 2. **One whole surface of it is still shipped.** § 4's `ED-01`…`ED-25` describe the **document
>    editor**, which wave 10 kept whole and moved beneath the building editor's elevation. Those
>    rows still describe a live surface; what is stale is the **route** to it and the `✅ run` marks,
>    which were established by clicking a tab that no longer exists. `BE-23` says so, and § 26
>    item 20 is the pass that would re-establish them.
> 3. **The history is evidence.** § 7.0.1–7.0.3 record three passes in which driving found a defect
>    that reading had missed — `D1`'s leaked mean, `RV-21`'s dead Retry, `RV-17`'s unnamed path —
>    which is the argument § 26 rests on.
>
> **Three of its rows are now known to be false of the shipped viewer**, and each has a successor
> above that says so rather than quietly re-marking the old one:
>
> | Retired row | What changed | Successor |
> |---|---|---|
> | `RV-03` / `RV-T2` — *every control writes back to the URL* | No `pushState`/`replaceState` survives in `packages/viz`; the link is read on boot and never written | `SH-09` 🔲 |
> | `RS-05` — *the bank filter narrows to a bank* | `#bank-filter` writes a binding the renderer never reads | `SG-15` 🔲 |
> | `RS-03` — *below 768 px the controls stack and the canvas keeps 60 % of the height* | The left rail never yields; the 768 px query restyles three panels | `RX-03` 🔲 |
> | `KB-04` / `KB-05` — *∓5 s and ∓60 s seek; Home / End* | No global arrow or Home/End handler in this shell | `KX-10` 🔲 |
>
> `RV-T7` is unchanged and still unmet — it is carried forward verbatim as `TP-13`.

What the three visualization surfaces must do, enumerated so that every row becomes a test row.

This document exists because `MULTI_AGENT_PLAN.md` §&nbsp;planning-first says the interface is
locked before the UI fans out, and because `TEST_MATRIX.md` §&nbsp;3 currently holds ten
placeholder rows waiting for exactly this. **Every scenario below carries an id** (`RV-…`,
`PB-…`, `ED-…`); copy the id into the test matrix so a scenario and its test can be traced to
each other in both directions.

## How the marks are used — read this before trusting one *(retired copy; the live one is at the top of this file)*

Wave 1 shipped three `✅` marks that were false and a reviewer caught them (`DECISIONS.md` D18).
So the marks now distinguish **how** a row was established, and there are four of them:

| Mark | Meaning |
|---|---|
| `✅ run` | Built, and **exercised in a browser** against the shipped `data/`. The delivery report says what was clicked. |
| `✅ test` | Built, and asserted by a test that fails when the behaviour is removed — every one of these was checked by replacing the rendered value with a constant and watching a test go red. |
| `⚠️ unverified` | Built and reachable, but **neither driven in a browser nor covered by a test**. Not a claim that it works. |
| `🔲` | Not built. |

`✅ w1` on a row means wave 1 established it and wave 2 did not touch it.

A row that says two things gets two marks, one per clause. A row whose *specification* turned out
to contradict the schema is re-marked with the contradiction stated, in the manner D18 established
— claiming the behaviour was the defect, not lacking it.

Scope note: wave 1 shipped the contract (`src/contract`), the recorder, the frame producer, the
playback transport and a **minimal** renderer plus a dev shell (`src/dev/main.ts`). Wave 2 adds
the building editor, the live metrics overlay, the recording load path and the rest of the
keyboard and responsive behaviour.

---

## 1. Roles

| Role | Who they are | Primary goal | What failure costs them |
|---|---|---|---|
| **Analyst** | Runs experiments, reads confidence intervals | Understand *why* a dispatcher produced the AWT the statistics report — see the mechanism, not just the number | Ships a conclusion whose mechanism they never checked |
| **Designer** | Sizes lift groups for a building | Try a geometry (floors, banks, cars, zones) and see whether it is plausible before committing to a sweep | Wastes a 200-replication sweep on an unbuildable configuration |
| **Reviewer** | Audits a claim someone else made | Reproduce a specific run exactly from its seed and watch the moment being disputed | Cannot verify, so has to accept or reject on authority |
| **Newcomer** | Learning what the simulator does | Get a building moving on screen within a minute of opening the page | Concludes the tool does not work |

Three consequences of that table drive the rest of this document:

1. The **seed is a first-class, always-visible, always-copyable control**, because the Reviewer
   cannot do their job without it (CLAUDE.md invariant 5).
2. A **suppressed AWT is never quietly replaced by a number**. The Analyst's failure mode is
   believing a mean that the statistics module refused to stand behind.
3. The viewer must be **useful before it is configured**. The Newcomer arrives with nothing
   selected.

---

## 2. Surface A — Run viewer

Shows one replication: shafts, cars at their analytic S-curve height, doors, landing calls,
live counters.

### A.1 Tasks and success conditions

| Id | Task | Success condition |
|---|---|---|
| RV-T1 | Watch a shipped building run | Cars visibly move between floors with non-linear (jerk-limited) motion; doors open and shut; landing counts rise and fall |
| RV-T2 | Choose building, dispatcher, traffic and seed, then run | The chosen four are echoed on screen and in the URL; a second person pasting that URL sees the same run |
| RV-T3 | Identify the car serving a specific landing call | Hovering or focusing a landing highlights the assigned car; the assignment shown matches the record |
| RV-T4 | Read the headline statistics without leaving the view | AWT, WT95, TTD, handling capacity and saturation verdict are visible, each labelled with the window it was computed over |
| RV-T5 | Distinguish the live running mean from the reported AWT | Two visibly different labels; the running mean is never called "AWT" |
| RV-T6 | Notice that a run saturated | A persistent banner, not a transient toast; the AWT figure is replaced by the suppression reason |
| RV-T7 | Copy a run's provenance | One control copies `building, dispatcher, traffic, seed, duration` in a form the CLI accepts. **"One" is now literally true and was not**: the design refactor left `#copy-provenance` on the transport calling the same `copyProvenance()` with the same state as the footer's `#copy-run`, which is the handoff's own S4 requirement, so two controls emitted the identical line. The transport's is deleted (`docs/12` § 4.7). **The success condition is still not fully met, and this row now says so**: the line reads `--building … --dispatcher … --seed … --duration …` and names **no traffic**, while the coach ribbon's pattern select really does move the run off the building's own profile and the day's event multiplies demand on top of it. `--traffic` is a real `elevator-sim watch` flag. So a shift run on a non-default pattern, or on any day past the first, copies a line that reproduces a *different* run — a provenance claim the CLI would honour and the reader could not check |

### A.2 Paths

| Id | Class | Scenario | Expected | Wave |
|---|---|---|---|---|
| RV-01 | happy | Pick building + dispatcher, press Run | Simulation completes, playback starts, cars move | ✅ w1 — **for every shipped building**. Until wave 1's remediation this was true of two of the five: under the kernel's default `onTimeout: 'throw'` the three tall buildings end a 900 s run undelivered and produced no recording at all. `src/dev/main.ts` now runs with `onTimeout: 'report'` |
| RV-02 | happy | Change dispatcher, press Run again | New run replaces the old; previous run's seed preserved so the two are comparable | ✅ run — the seed is written back into the field before each run, so pressing Run after changing the dispatcher compares like with like |
| RV-03 | happy | Deep link with all parameters in the URL | Loads and runs without further input | ✅ run — `?building=…&dispatcher=…&seed=…&duration=…&speed=…&tab=…`, and every control writes back to the URL. **`tab` is `T29`'s addition and it closes a real hole**: `syncUrl` wrote five keys and not the surface, so `selectTab` never recorded where the reader was, a deep link always opened on the viewer, and a reload from the editor came back to the viewer. Worse, the editor kept its **own** building selector: `?building=secure-tower` plus **Building editor** opened *Garden Apartments*, because the editor took `resources.entries[0]` and nothing told it otherwise. Driven both ways — `?building=secure-tower&tab=editor` reloads into the editor on Secure Tower, and choosing Vertical City in the editor moves the viewer's selector and the URL with it |
| RV-04 | alternate | Blank seed | A seed is drawn, **shown**, and the field is populated so the run is reproducible | ✅ w1 |
| RV-05 | alternate | Explicit seed reused | Byte-identical picture to the earlier run with that seed | ✅ w1 (proved in `replay.test.ts`) |
| RV-06 | alternate | Building with multiple banks | Banks are visually grouped and labelled; a bank filter is offered | ✅ run — bank id above each column (only when there is more than one), clipped to the column width; filter disabled on a single-bank building |
| RV-07 | alternate | Building with sky lobbies (`mixed-use-high-rise`) | Transfer floors marked; a transferring passenger is not double-counted in the waiting total | ✅ run (the `⇄` badge) · ✅ test (the count) — a leg is counted as waiting only between its own arrival and its own boarding, so a two-leg journey is never waiting twice at one instant; `frame/overlay.test.ts` cross-checks `waitingNow` against `Frame.totalWaiting` on every shipped building. **Journey-level identity is not asserted**, because `VizLeg` deliberately omits `journeyId` |
| RV-08 | alternate | Access-restricted floors (`secure-tower`) | Restricted landings marked; a call no car may serve is shown as unassignable, not as a long wait | ✅ test (both halves) · ✅ run (the second half, `T29`) — a floor no shaft serves gets `⊘`, exercised on a constructed recording because **no shipped building has an unserved floor**, so the `⊘` path does not arise in `data/`. The *unanswered call* half no longer depends on the reader finding it: until `T29` its only surface anywhere was the caption drawn for a landing picked out of the landing `<select>`, which is `wide-only` and therefore absent below 1280 px. It is now a `✗` on the landing itself and a count in the canvas banner, and a sentence in the text alternative — driven on Secure Tower seed `16757712606996968457` (*12 landings unanswered*) and Vertical City seed `42` (*22 landings unanswered*). `✗` and `⊘` are deliberately different glyphs in different gutters: one is geometry, the other is an outcome |
| RV-09 | alternate | 60+ floor building (`vertical-city`) | Floor labels thin out rather than overlap; every floor still has a row | ✅ run — measured on `vertical-city`: labels thin by stride, reference floors (entrance, every sky lobby, both ends) are never thinned, and a label wider than the gutter is clipped with an ellipsis rather than drawn off the canvas |
| RV-10 | edge | Single-car bank | Layout does not collapse; the one shaft is centred | ✅ w1 (`layout.test.ts`) |
| RV-11 | edge | Zero-population building / no demand generated | "No passengers were generated" empty state, not an empty chart | ✅ run (`T39`) — no shipped building produces it, so one was **built in the editor**: Garden Apartments with all six floor populations set to 0, then **Run this building** (`ED-04`). The status line reads *0 generated, 0 delivered · no passengers were generated in this window — nothing to watch · AWT suppressed — No passenger was served within the reporting window…*; the canvas draws the building with `AWT suppressed` in the banner and `mean wait suppressed` where the running mean goes; the metrics panel reads `rolling mean wait SUPPRESSED` with the reason. A designed state, not a blank canvas and not a crash. **Not on the canvas:** the *no passengers were generated* sentence itself is only in the status line — the picture, the exported PNG and `describeFrame`'s text alternative say `0 generated` and leave the reader to draw the conclusion |
| RV-12 | edge | Run with zero-length window (`startedAt == endedAt`) | Progress is 0, scrub disabled, no division by zero | ✅ w1 (`Playback.progress`) |
| RV-13 | edge | A car never leaves its home floor | Drawn parked at its start height, not omitted | ✅ w1 (`recordRun.test.ts` start-position guard + `frameAt.test.ts`, over **every** shipped building) |
| RV-14 | edge | Load factor above 1 (overload alarm at 1.1) | Rendered in the overload colour and labelled; the bar does not silently clip at 1 | ✅ test — four load bands with the fill rule (0.8) and the alarm (1.1) at **different** thresholds; the panel's track is scaled to `max(1.1, heaviest car)` so an overloaded car draws past the full mark. No shipped run in the sessions driven reached 1.1, so the `!` glyph was not seen on screen |
| RV-15 | failure | Conservation audit fails (`SimulationError`) | Full-width error with the message and the seed; **no partial building drawn** | ✅ w1 (status line) |
| RV-16 | failure | Drain deadline fires with passengers in the system | Reported as `timed-out` with the undelivered count; not shown as a completed run | ✅ w1 (status line leads with the status and the undelivered count; the canvas banner is still w2) |
| RV-17 | failure | `data/` fetch fails (404 / offline) | "Could not load data" with the failing path and a Retry control | ✅ run (`T39`) — **and it was false when driven.** The earlier note argued the handler was unreachable because the app cannot load from a stopped server; that is true of a stopped server and irrelevant to a *fetch* failure. Method: `data/elevator-specs.json` was moved aside **while the dev server ran**, and the page reloaded. The message named no path — Vite answers `Accept: */*` (which `fetch` sends) with `index.html` and a **200**, so the only branch that named the path, `!response.ok`, is the branch a missing file does not take; the reader got `could not load data/: Unexpected token '<', "<!doctype "… is not valid JSON`. A network failure named no path either. `dev/data.ts` now names the path in all three modes and says what HTML-for-JSON means here. Re-driven: *could not load data/: /elevator-specs.json did not parse as JSON: … (the server answered 200 text/html, which is what this dev server sends when the file is missing from data/)*, focus on the `role="alert"` region, **Retry** beside it. Second defect fixed in passing: the five transport controls were left **enabled** in this state, wired to listeners `boot` had never attached |
| RV-18 | failure | Malformed building JSON (`ConfigError`) | Every issue listed with its file and JSON path — `ConfigError` reports all of them at once, so the UI must not show only the first | ✅ run in the **editor** (`ED-20`: six located problems at once) · ✅ run in the **viewer** (`T39`) — driven by the method `RV-17`'s note said was impossible: five schema violations were written into `data/buildings/garden-apartments.json` while the dev server ran. The `role="alert"` region rendered `Invalid config in garden-apartments.json: 5 problems` and then **all five**, each with its JSON path (`id`, `type`, `floors[1].index`, `floors[2].heightM`, `banks[0].cars[0].ratedLoadLb`), verbatim and `pre-wrap`. Restoring the file and pressing **Retry** brought the viewer into service — `RV-21` again, from a `ConfigError` rather than a 404 |
| RV-19 | failure | Browser has no 2D canvas context | Explains the situation in text; does not throw into the console | ✅ w1 |
| RV-20 | recovery | After RV-15/RV-16/RV-18, change one input and re-run | Error clears; previous inputs are preserved, not reset | ✅ run — a bad seed raised the error and moved focus to it; fixing the seed and re-running cleared it with dispatcher and duration untouched |
| RV-21 | recovery | After RV-17, press Retry | Refetches without a page reload | ✅ run (`T39`) · ✅ test — **this row was false, and it is the reason the pass was worth making.** Driven by restoring `data/elevator-specs.json` and pressing **Retry**: the fetch succeeded — three 200s in the resource timings — and the page then died. `unhandledrejection: ReferenceError: Cannot access 'started' before initialization at start (dev/main.ts:124)`. The failure path did `if (!(await load())) return;` *above* the `let started = false` that `start()` closes over, so a first load that failed left that binding in its temporal dead zone for the life of the page; the retry ran inside a floating `async` IIFE with no `catch`, so the page cleared its own error message and stopped for ever at `loading data…`, empty. The sequence now lives in `dev/bootstrap.ts`, where its state cannot depend on the statement order of the caller and a throw from `start` **rejects** instead of vanishing; `bootstrap.test.ts` drives fail → Retry → succeed. Re-driven end to end: Retry refetched and the viewer came into service without a reload — building list populated, seed `1089729876208202577`, *6 generated, 6 delivered · AWT 19.4 s* |

### A.3 States

Two of the "must not show" clauses below were **false in the shipped viewer until `T29`**, and they
are re-marked in the manner `D18` established — stating the contradiction rather than quietly
fixing the row. `drawHeader` drew `mean wait so far 87.7 s` on the header line *immediately below*
the `SATURATED — AWT suppressed` banner the same function drew, and it did so on both suppression
grounds: Secure Tower at seed `16757712606996968457` showed `TIMED-OUT — 19 undelivered · AWT
suppressed` beside `mean wait so far 16.6 s`.

Not two surfaces disagreeing — **one**. The `<canvas role="img">` that painted the number carries
an `aria-label` written by `describeFrame` from the same summary, reading *"Mean waiting time is
suppressed…"*. The sighted reader saw a figure the non-sighted reader was told did not exist, and
**Export PNG** baked it into a shareable file, because the canvas is the export source.

The `Established` column is filled in only where `T29` actually drove the row. `—` means *this
task did not exercise it*, not *it does not work*.

| State | Must show | Must not show | Established |
|---|---|---|---|
| **Empty** (nothing selected) | What this view is for; the controls that need choosing; a "run a sample" affordance for the Newcomer | An empty canvas with no explanation | — not exercised by `T29` |
| **Loading data** | That `data/` is being fetched | A spinner with no label | — not exercised by `T29` |
| **Simulating** | That a run is in progress and that it takes ~a second; the parameters being run | A frozen UI with no feedback — the simulation is synchronous and *will* block the main thread until wave 2 moves it to a worker | — not exercised by `T29` |
| **Success** | Building, dispatcher, traffic, seed, clock, speed, counters, per-car status, legend | An AWT when `awtIsValid` is false | ✅ run · ✅ test — **was false, now holds.** Driven on Secure Tower seed `16757712606996968457` (`awtIsValid` false, **not** saturated): the header reads `mean wait suppressed` and no figure appears, on screen, in the `aria-label` and in the exported PNG. `canvas.test.ts` *"prints no mean on the other suppression ground either"*. The **must show** half is unchanged and not re-exercised here |
| **Error** | What failed, the seed, and what to change | A partially drawn building | — not exercised by `T29` |
| **Saturated** | Persistent banner, undelivered count, suppression reason | A mean waiting time | ✅ run · ✅ test — **was false, now holds.** Driven on Vertical City seed `42` (`summary.saturated` true): banner `SATURATED — AWT suppressed`, header `mean wait suppressed`, the `41.5 s` gone from screen and from `canvas.toDataURL`. `canvas.test.ts` *"says so, loudly, when the run saturated — and prints no mean beside the banner"*, whose `not.toContain('mean wait so far')` was watched failing against the unfixed gate. The **must show** half was already true and is unchanged |

The gate itself now has one home — `meansAreSuppressed(recording)` in `frame/overlay.ts`, read by
`overlayAt`, by `drawHeader` and by `dev/main.ts`'s status line. There were three copies of
`saturated || !awtIsValid` and one of them was missing; § 7.1 rule 4 says why that is not a
tidiness argument. An em dash still means *nobody has been served yet* and is never used for a
suppressed run, because those are different facts and only one of them is the reader's to act on.

---

## 3. Surface B — Playback and replay

The transport over a recording: play, pause, scrub, speed, step, and replay-from-seed.

### B.1 Tasks and success conditions

| Id | Task | Success condition |
|---|---|---|
| PB-T1 | Watch at a comfortable speed | Speed control offers ×1 … ×120; the current speed is always visible |
| PB-T2 | Pause on a moment of interest | The picture freezes exactly; nothing continues to drift |
| PB-T3 | Scrub to a specific time | The playhead lands where dropped; the picture is correct for that instant, not for the nearest previously drawn frame |
| PB-T4 | Step frame by frame | A single keypress advances one display frame; motion is inspectable |
| PB-T5 | Replay a stored run | Given a seed (or a stored recording), the frame sequence is identical to the original |
| PB-T6 | Compare two runs | Two recordings play from a shared playhead at the same simulated time |
| PB-T7 | Loop a short window | Selecting a window and looping repeats it without drift |

### B.2 Paths

| Id | Class | Scenario | Expected | Wave |
|---|---|---|---|---|
| PB-01 | happy | Play from the start to the end | Playhead reaches `endedAt` and stops; state reads `ended` | ✅ w1 |
| PB-02 | happy | Pause, wait, resume | Resumes from where it paused, not from where it would have been | ✅ w1 |
| PB-03 | happy | Change speed mid-playback | The playhead does not jump | ✅ w1 |
| PB-04 | happy | Scrub backwards | Frames are correct for the earlier instant — the frame producer is pure, so no state has to be rewound | ✅ w1 |
| PB-05 | happy | Replay from a pasted seed | Identical picture | ✅ w1 |
| PB-06 | alternate | Loop enabled | Restarts at `startedAt` with no accumulated drift | ✅ w1 |
| PB-07 | alternate | Load a recording from a file rather than re-simulating | Same picture; schema version checked first | ✅ run — **Save recording** then **load**, round-tripped in the browser. `readRecordingDocument` in `record/document.ts` is the version check's first caller that can actually disagree (D16) |
| PB-08 | alternate | Step one frame while paused | Advances exactly one display frame | ✅ run — two transport buttons and the `,`/`.` keys; each pauses first, then seeks by one 60 Hz frame at the current speed |
| PB-09 | alternate | Window selection then loop | Only the selected span repeats | 🔲 — **not built.** Whole-run looping is (a `.chip[aria-pressed]` beside the speed chips since `docs/12` § 4.7, a native checkbox before it; either way the transport is rebuilt at the current instant, because `Playback` takes `loop` at construction); selecting a sub-window is not |
| PB-10 | edge | Seek before `startedAt` / after `endedAt` | Clamps; never extrapolates | ✅ w1 |
| PB-11 | edge | Speed set to the extremes | ×0.05 and ×1000 accepted; outside that range refused with a message | ✅ w1 |
| PB-12 | edge | Tab hidden, then restored (rAF stops firing) | The playhead reflects **elapsed display time**, so it resumes at the right instant rather than replaying the gap | ✅ w1 (anchored mapping) |
| PB-13 | edge | High-refresh (144 Hz) vs 60 Hz display | Same simulated instants reached at the same wall-clock time; frame rate does not change the run | ✅ w1 (`mapping.test` frame-rate independence) |
| PB-14 | edge | Very long run (drain tail of an hour) | Scrub resolution stays usable; frame budget is bounded, and a run over the ceiling is **refused, not clipped** | ✅ w1 (`frameTimes` throws; `truncate: true` is the explicit opt-in) |
| PB-15 | failure | Recording schema version newer than the viewer | "This recording was made by a newer viewer" — not a crash and not a wrong picture | ✅ run — a schema-99 file was refused by name and the run on screen was untouched. An **older** version is refused too: a v2 recording has no `legs`, so the overlay would silently report an empty window on it |
| PB-16 | failure | Seed does not reproduce the stored recording | Explicit mismatch report naming both fingerprints; **must not silently show the new run** | ✅ run (the match: *replay verified — 2634 frames identical from seed 42 (fingerprint 4532d885)*) · ✅ test (the mismatch, including a fingerprint that moves when a car's start position moves) |
| PB-17 | failure | Corrupt recording file (truncated JSON) | Parse error with the byte offset; the previous run stays on screen | ✅ run — a half-truncated recording reported *Unterminated string in JSON at position 27563 (byte 27563)* and the previous run kept playing |
| PB-18 | recovery | After PB-15/16/17 | Load a different recording without a page reload | ✅ run — a valid recording loaded straight after a truncated one, no reload |

### B.3 States

The `Empty` row's "must not show" clause was **false whenever `data/` failed to load**, and its
"must show" clause was **false for a run the editor handed over after a failed run** — both found
by `T39` while driving `RV-17` and `RV-11`, and both re-marked here rather than quietly fixed.

| State | Must show | Must not show | Established |
|---|---|---|---|
| **Empty** (no recording) | Transport disabled and visibly so | Enabled controls that do nothing | ✅ run (`T39`) — **both clauses were false and now hold.** The disable/enable pair lived in `boot`, which a failed load never reaches, so `RV-17`'s error state showed five live-looking controls whose listeners had never been attached; and it was triggered by a click on **Run**, which `ED-04`'s *"Run this building"* does not perform, so after a failed run the editor could put a run on screen that could not be paused, stepped, scrubbed or exported. The transport now follows the recording, from `adopt` and from `runOnce`'s failure path. Driven: disabled before the fetch, disabled after a failed run, enabled by an editor hand-over |
| **Loading** (simulating or fetching) | Progress or at least an indeterminate state with a label | A dead transport with no explanation | ✅ run (`T39`) — `loading data…` in the status line throughout the fetch and again on each Retry |
| **Playing / paused / ended** | Which of the three it is, the clock, the elapsed fraction | "Playing" while the playhead is pinned at the end | — not exercised by `T39` |
| **Error** | What failed and which recording | A stale playhead moving over a recording that failed to load | partly — `T39` drove only the *failed load* case (`RV-17`, `RV-18`), where the canvas stays blank at its `No run yet.` label because no recording was ever adopted. The case the clause is really about — an error arriving while a recording is on screen — was not exercised |

---

## 4. Surface C — Building editor

Edits `data/buildings/*.json` against the **existing** schema, which already validates
(`buildingConfigSchema`, `resolveBuilding`). The editor adds no new schema.

### C.1 Tasks and success conditions

| Id | Task | Success condition |
|---|---|---|
| ED-T1 | Add and remove floors; reorder the declaration | Heights and indices stay consistent; the shaft picture updates live; **the list reads the way the building does** — highest floor at the top, ground at the bottom, the same direction the preview beside it draws (`U1`). *Reorder* is a second thing and has a second view: the **Floors** table is ordered by `index`, which is what decides which floor is above which and is edited there; the **Declaration order** list is the `floors` array as the file writes it, and ⇧/⇩ move a floor within that array and change nothing else (`ED-24`, `ED-25`) |
| ED-T2 | Use a floor **range** for a tall building | Ranges expand exactly as `expandFloors` does; the editor shows the expansion |
| ED-T3 | Add a bank and cars, choosing an elevator class | The class comes from `data/elevator-specs.json`; capacity and timings are shown, not typed |
| ED-T4 | Define **service** zoning (which floors a shaft physically serves) | A shaft serving a subset is drawn over that subset only |
| ED-T5 | Define **access** zoning (credential) | Kept visibly separate from service zoning — they are different concepts and must never share a field |
| ED-T6 | Leave **operational** zoning alone | The editor states that operational zoning is a dispatcher profile setting, not building geometry |
| ED-T7 | Validate before running | Every `ConfigError` issue listed with file and JSON path; every `ConfigWarning` listed separately as suspicious-not-fatal |
| ED-T8 | Run the edited building immediately | One control goes from a valid edit to a run in the viewer |
| ED-T9 | Export / import | Round-trips through the same JSON `loadConfig` reads; a hand-edited file loads unchanged |

### C.2 Paths

| Id | Class | Scenario | Expected | Wave |
|---|---|---|---|---|
| ED-01 | happy | Load a shipped building, change a floor height, see the picture update | Live preview; no run needed | ✅ run — floor 4 of Garden Apartments moved 9 m → 11.5 m and the preview redrew with no run |
| ED-01a | happy | Read the floor list and the preview together | They run in the same direction | ✅ run · ✅ test (`U1`, added by `T29`) — **this row exists because they did not.** The form listed `G, 2, 3, 4, 5, 6` downward while the preview drew `6` at the top: two views of one building, on one screen, reading opposite ways. Every floor-ordered list in the editor now goes through `floorsInBuildingOrder` — the floors table, each bank's *service* zoning checklist (`.checklist label` is `display:flex`, so it is a vertical list of floors) and the floor-range list. Ordered by `index` rather than by reversing the declaration array, because `midtown-office.json` declares index `0` before index `-1` and a reversed array would draw its basement above the lobby in the form and below it in the picture. Driven on Secure Tower (`30 … G`) and Vertical City (`77 … G`, ranges 6 → 1); `editorPreview.test.ts` compares the list order against the pixel `y` `buildLayout` gives each floor, on **every** shipped building, so the two cannot be wrong in the same direction |
| ED-02 | happy | Add a car to an existing bank | Appears as a new shaft immediately | ✅ run · ✅ test — **Add car** produced car B and a second shaft in the preview |
| ED-03 | happy | Change a car's elevator class | Speed/capacity/door timings update from the spec | ✅ test — the class `<select>` is filled from `elevator-specs.json` and each car shows its class envelope; changing the class **clears the per-car overrides that belonged to the old one**, so a 0.63 m/s hydraulic override cannot survive onto a gearless car |
| ED-04 | happy | Save and run | Viewer opens on the edited building | ✅ run — floor 6's population 24 → 200, **Run this building**, and the viewer ran the edited building (12 passengers generated against 7 before) |
| ED-05 | alternate | Start from a blank building | A minimum viable building (one bank, one car, two floors) is offered | ✅ run · ✅ test — the minimum is read off the schema (two served floors, one car), and its traffic profile is taken from `traffic-profiles.json` rather than guessed from the building type |
| ED-06 | alternate | Import a JSON file | Validated on import; issues shown before anything is applied | ✅ run — an invalid import lists its issues **and then asks**; declining leaves the open document and its own verdict untouched, accepting opens it with Run disabled |
| ED-07 | alternate | Floor range covering 40 floors | Expansion previewed; `MAX_FLOORS_PER_RANGE` enforced with a clear message | ✅ test — the expansion is captioned on the preview (*N floors, first … last*), and a 10 000-floor range is refused with the 1000 ceiling named |
| ED-08 | alternate | Two banks with overlapping served floors | Both drawn; overlap is legal and not flagged as an error | ✅ test |
| ED-09 | edge | Duplicate floor id | Rejected at the field, naming the other floor | ✅ test — rejected by the loader's own duplicate check, with the id named. **Not "at the field"**: the editor has one issue list, and a per-field marker would be a second place that decides what is legal |
| ED-10 | edge | Non-monotonic heights (floor 5 below floor 4) | Rejected, with both values shown | ✅ run · ✅ test — *floor "5" (index 5) sits at 1 m, below floor "4" (index 4), which sits at 11.5 m*, and Run is disabled with the reason |
| ED-11 | edge | Negative heights (basements) | Accepted — basements are legal — and drawn below the datum | ✅ w1 (layout handles negative heights) |
| ED-12 | edge | Bank with zero cars | **Rejected as an error**, located at `banks[i].cars` — a bank is a group of cars, and with none its `servesFloors` is a service claim with nothing behind it | ✅ test — **the row's old expectation ("warning, not an error; the run will simply have no service there") was wrong, and settling it was `C30`.** It does not simply have no service there: on a seven-floor tower whose top floor was served only by a carless bank (`nearest-car`, `rise-and-fall`, seeds 1–12), **ten of twelve seeds published `awtIsValid: true`** — a mean over the passengers the *other* bank served — two of them with passengers in the window never served at all, at 1.5 % and 4.3 %, under the 5 % censoring limit. `awtIsValid` is a threshold backstop, not a gate. The schema is **unchanged** (*a bank must have at least one car*, `banks[0].cars`, code `schema`); what changed is that `resolveBuilding` — which used to accept a carless bank with **no issue and no warning**, and is the editor's whole definition of valid (`ED-T8`, § D67) — now refuses it too, with code `empty-bank`. `deriveUpPeakTerms` had always thrown `emptyGroup` for the same bank. Asserted in `editorEdits.test.ts` (schema stage) and in `core`'s `parse.test.ts` § 5, both directions. To stop service without deleting the bank, a car carries `mode: "out-of-service"` — still legal, and pinned |
| ED-13 | edge | Bank serving a floor the building does not declare | Rejected, citing the cross-reference check, with the offending element's own JSON path | ✅ test — **the scenario was restated, because the old one was unrepresentable** (`C30`): the row read *"car serving a floor its bank does not"*, and `carConfigSchema` has no `servesFloors`. That is by design, not omission — service zoning is a property of the shaft group, so a car serving a different floor set would be a different bank, and the editor's only service-zoning control is per bank (`setBankServedFloors`, `ED-T4`). The capability is misdescribed, not missing. The real check is asserted in `editorValidate.test.ts`: `servesFloors: ['G', '2', 'ghost']` gives `unknown-floor` naming `ghost`, at a path containing `servesFloors`. The nearest survivor of the original scenario is double-deck — a `servesFloorPairs` deck floor not listed in the bank's `servesFloors` is `floor-pair` — and the editor has no control that authors pairs, so that one reaches it only by import |
| ED-14 | edge | Access zone naming a floor that does not exist | Rejected, naming the unknown floor | ✅ test |
| ED-15 | edge | Building with no entrance floor | Warning: incoming traffic has nowhere to originate | ✅ test — `no-entrance-floor`, listed as a warning with Run left enabled |
| ED-16 | edge | Population declared inconsistently with the sum of floors | The sum wins (as `resolveBuilding` does); the discrepancy is shown, not hidden | ✅ test — the warning names the declared figure and the resolved building carries the sum |
| ED-17 | edge | `doubleDeck: true` | **Accepted silently, and that is now correct** — double-deck operation is simulated, so there is nothing to disclaim. The editor warns only on the one case still wrong: a double-deck bank declaring no `servesFloorPairs` | ✅ test — `editorValidate.test.ts` asserts `double-deck-not-simulated` is **absent** from the warning list on `vertical-city`, and that `missing-floor-pairs` appears when the pairing is stripped |
| ED-17a | edge | `doubleDeck: true` with no `servesFloorPairs` | Warning: each car runs as a single-deck car of the same whole-car capacity, so it makes up to twice the stops the declared hardware would | ✅ test — the surviving `missing-floor-pairs` code, verbatim from `core`; **no shipped building raises it** |
| ED-18 | failure | Invalid JSON pasted | Parse error with position; the editor state is not lost | ✅ run — the typed text is kept exactly, the error names the parse failure and focus moves to it. A position is reported when the engine gives one; a document truncated at EOF yields *Unexpected end of JSON input* with none |
| ED-19 | failure | Save fails (no filesystem access in the browser) | Falls back to download; says so before the user commits to a long edit | ✅ run — the control is labelled **Download JSON** up front, and after it fires the status says *move it into data/buildings/ to make it a shipped building* |
| ED-20 | failure | Schema rejects the whole document | Every issue at once — `ConfigError` collects them deliberately, so showing only the first would be a regression against the loader's own contract | ✅ run — six independent faults produced **six located problems at once**. The list also says when it is a *stage* rather than a total: a document that failed the schema never reached cross-referencing, so more may appear once these are fixed |
| ED-21 | recovery | Undo / redo an edit | At least 20 steps; keyboard-driven | ✅ run (the buttons) · ✅ test (25 edits undone and redone; a no-op edit spends no step). **Not keyboard-driven**: there is no ⌘Z binding — the buttons are reachable by Tab and that is all |
| ED-22 | recovery | Discard all changes | Confirmed once, then back to the loaded document | ✅ run — a modal confirm, then the floor height back to 9 m and the document clean again |
| ED-23 | recovery | Leaving with unsaved edits | Warned before navigation | ⚠️ unverified for the browser's own leave prompt (a `beforeunload` handler, fired only on real navigation) · ✅ run for the in-app half: opening another building, starting from blank or importing over unsaved edits each ask first |
| ED-24 | happy | Reorder the JSON declaration | The floors appear in the order the file writes them, and ⇧/⇩ move a floor within that array — `index` and `heightM` are untouched | ✅ run · ✅ test (`T48`) — **this row exists because the control had no view.** ⇧/⇩ used to sit in the `index`-ordered Floors table, where pressing one moved nothing the reader could see: `moveFloor` renumbers neither `index` nor `heightM` (deliberately — the loader fails a building whose two disagree, `floor-height-order`, and an editor that rewrote either would settle a modelling error by fiat), so the row stayed put and only the Document textarea changed. They now live in a **Declaration order** list which *is* the array. Driven on Garden Apartments: one ⇩ on row 1 moved `G` from first to second in the list **and** in the Document (`floors` became `2, G, 3, 4, 5, 6`), while `G` kept `index 0, 0 m`, `2` kept `index 2, 3 m`, and the Floors table above stayed `6 5 4 3 2 G`. `editorPreview.test.ts` § `ED-24` asserts the same edit at the level below the DOM — same ids, same `index`/`heightM`, different positions — and that reordering the array leaves `validateBuilding`'s verdict and issue codes identical, because `parse.ts` runs the height check over `expandFloors`' already-index-sorted output |
| ED-25 | happy | Tell the two floor views apart | Each says which order it is in and what that order is for; neither offers an opinion about legality | ✅ run · ✅ test (`T48`) — the view carries a paragraph naming both orders, saying that `index`/`heightM` are read-only here and edited in the table above, and ending *"Whether the document is legal is the loader's answer, listed under Validation below; this list never says"* — § D67, one source of legality. Beneath it a sentence compares the two orders, and it is the evidence the button did something: on Garden Apartments it reads *declares its floors in a different order from the table above*, and on a **Start from blank** document one ⇩ flipped it to *happens to declare its floors in the same order the table above shows them*. Driven, both sentences. `declarationOrderMatchesBuildingOrder` is asserted in `editorPreview.test.ts` and was watched failing against both `() => true` and `() => false`; the first ⇧ and last ⇩ are disabled (a no-op guard, read off the DOM as `[⇧ true, ⇩ false, ⇧ false, ⇩ true]`), which is the only thing in the view that greys anything out and it is not a verdict |

### C.3 States

| State | Must show | Must not show |
|---|---|---|
| **Empty** (no building open) | Open / import / start-from-blank | An empty form |
| **Loading** | Which file is being read | — |
| **Valid** | A live preview and an enabled Run | — |
| **Invalid** | Every issue, located by file and JSON path; Run **disabled** with the reason | A Run button that fails after being pressed |
| **Warning-only** | Warnings listed as suspicious; Run enabled | A blocked Run for a warning |
| **Saving / saved** | Confirmation and where it went | — |

---

## 5. Keyboard and focus

Applies to every surface. Non-negotiable rows are marked ⛔.

| Id | Behaviour | Wave |
|---|---|---|
| KB-01 | ⛔ Every control reachable by <kbd>Tab</kbd> in visual order | ✅ run — DOM order is visual order on both surfaces, a skip link is the first stop, and the tablist uses a roving `tabindex` with <kbd>←</kbd>/<kbd>→</kbd> between tabs |
| KB-02 | ⛔ Focus ring always visible; never removed without a replacement | ✅ w1 (`:focus-visible` in `index.html`) |
| KB-03 | <kbd>Space</kbd> toggles play/pause when focus is not in a text field | ✅ w1 |
| KB-04 | <kbd>←</kbd>/<kbd>→</kbd> seek ∓5 simulated seconds; with <kbd>Shift</kbd>, ∓60 | ✅ w1 |
| KB-05 | <kbd>Home</kbd>/<kbd>End</kbd> jump to the start / end of the run | ✅ w1 for Home; <kbd>End</kbd> added in wave 2 |
| KB-06 | <kbd>,</kbd>/<kbd>.</kbd> step one display frame back / forward while paused | ✅ run — the keys and the two transport buttons share one handler, which pauses first |
| KB-07 | <kbd>[</kbd>/<kbd>]</kbd> step down / up the speed ladder | ✅ run — `]` moved the ladder ×10 → ×30 and wrote the new speed into the URL |
| KB-08 | ⛔ Typing in the seed or any editor field never triggers a shortcut | ✅ w1 |
| KB-09 | The scrub range responds to arrow keys as a native `<input type=range>` | ✅ w1 |
| KB-10 | ⛔ Focus is not stolen by the animation loop — the scrub position updates only while it is unfocused | ✅ w1 |
| KB-11 | ⛔ After an error, focus moves to the error message so a screen reader announces it | ✅ run — a `role="alert"` region with `tabindex="-1"` on both surfaces; after a bad seed `document.activeElement.id` was `error`, and after an invalid JSON paste it was `editor-error` |
| KB-12 | Modal dialogs (discard, overwrite) trap focus and restore it on close | ✅ run — a native `<dialog>.showModal()`, so the trap and the restore are the platform's. The promise behind it settles on **any** of close / cancel / either button, because `close` was observed not to fire for a synthetic submit and a dialog that never resolves hangs the flow silently |
| KB-13 | ⛔ Canvas is not a focus trap; it exposes a text alternative summarising the current frame | ✅ run · ✅ test — `describeFrame` writes the canvas's `aria-label` and a polite live region: building, seed, clock, run status, suppression, waiting and boarded counts, **the landings whose calls no car answers** (`T29`), and per car the floor, direction, **door phase in words** and **OVERLOADED/full in words**. The editor's preview canvas has its own (`describePreview`). `T29` found the rule bites in a direction nobody had checked: the alternative was *more* honest than the picture, saying the mean was suppressed while the header printed one, so `KB-13` is now also the reason the two are asserted to agree |
| KB-14 | ⛔ `prefers-reduced-motion` respected: playback still works, but nothing animates that is not the simulation itself | ✅ run (`T39`) · ✅ test — the browser tooling here cannot emulate the media query, so it was driven the only honest way left: `window.matchMedia` — the one thing the app reads — was replaced before pressing **Run**, and the A/B run both ways. Under `reduce`: **Play**, clock frozen at `0:00 / 15:00`, scrub at 0, unchanged across three seconds of forced frames; pressing **Play** then advanced it to `6:49`, so the transport is untouched. Without the stub, the same click autoplayed — **Pause**, clock at `0:19` and moving. The decision moved out of `main.ts` into `dev/motion.ts` so it can be asserted without an operating system that has the preference switched on; `motion.test.ts` pins the query string, both autoplay verdicts, and — for the second clause — that `index.html`'s guard block still selects `*` and carries `!important` on both properties. Also measured in the live page: **zero** `transition`/`animation` declarations exist in the stylesheet at all, so the block is a guard against future motion rather than a fix for present motion |
| KB-15 | Colour is never the only signal — **direction** carries a ▲/▼ glyph | ✅ w1 |
| KB-15a | …and so does **door state**, which today is a fill-width gap only | ✅ run · ✅ test — four distinct glyphs (`▮` `◂▸` `▯` `▸◂`) drawn beside the car wherever the floor pitch leaves room, and the phase in words in the text alternative at every pitch. `opening` and `closing` are the pair a width-only signal cannot tell apart, and they draw differently at the same fraction |
| KB-15b | …and so does **overload**, which today is `theme.carHeavy` and nothing else — and fires at load factor 0.8, not at the 1.1 alarm | ✅ test — the 80 % fill rule and the 1.1 alarm are now different thresholds with different colours, and the alarm carries a `!` glyph beside the car **at every floor pitch** and a `!` in the load panel. Not seen on screen: no run driven in the session reached 1.1 |

---

## 6. Responsive expectations

| Id | Viewport | Expectation | Wave |
|---|---|---|---|
| RS-01 | ≥ 1280 px wide | Full layout: all shafts, floor labels, landing counts, per-car status | ✅ w1 |
| RS-02 | 768–1279 px | Per-car status list collapses; shafts and landings stay | ✅ run at 1024 px — the bank filter, landing selector and PNG export collapse below 1280 px; shafts, landings and the metrics panel stay |
| RS-03 | < 768 px | Controls stack; the canvas keeps at least 60% of the height | ✅ run at 700 px — the controls stack, the metrics panel is dropped rather than squeezed (below 900 px of canvas), and the canvas keeps a `60vh` floor |
| RS-04 | Short viewport (< 500 px tall) | Floor rows thin out by label, never by dropping shafts | ✅ test — the thinning stride is computed from the row **pitch**, so it responds to height as well as floor count; every floor keeps its line, its shaft and its car at every pitch |
| RS-05 | More shafts than fit | Horizontal scroll **or** a bank filter — never silently truncated | ✅ run — `vertical-city` at 1280 px drew *showing 30 of 35 shafts — widen the window*, and the bank filter narrows to a bank. The metrics panel's two lists obey the same rule, and a list with no room at all collapses to one line naming what it holds rather than to "showing 0 of N" |
| RS-06 | Window resize during playback | Relayout without pausing or jumping the playhead | ✅ w1 (layout is rebuilt per frame) |
| RS-07 | `devicePixelRatio` 2 or 3 | Crisp lines and text, not a scaled bitmap | ✅ w1 |
| RS-08 | Print / screenshot | The current frame is exportable as PNG with its seed and clock burned in | ✅ run — **Export PNG** produced `mixed-use-high-rise-42-5s.png` from `canvas.toDataURL`; the seed and the clock are in the header the canvas already draws, and in the filename. Re-driven in `T29`, because "the header the canvas already draws" is exactly why `D1` mattered: the export is the canvas, so a leaked mean left the artifact rather than the screen. The exported bitmap was decoded back into the page and read on both suppression grounds — `mean wait so far 41.5 s` before, `mean wait suppressed` after |

---

## 7. What wave 2 must not change — and what it is expected to change

### 7.1 Frozen: the four structural decisions

These are contract decisions, not preferences. Changing one changes what the acceptance
criterion means.

1. **A renderer consumes a `VizRecording`, never a live `Simulation`.** The reasoning is in
   `src/contract/types.ts`; the short version is that a live renderer would need either a tick
   loop or a wall clock inside `core`.
2. **`frameAt` stays pure.** Scrubbing backwards, comparing two runs and the replay test all
   depend on it.
3. **Wall-clock time enters only through `DisplayClock`.** Enforced by `boundaries.test.ts`.
4. **`awtIsValid` is copied from the summary, never recomputed in the viewer.** Two sources of
   truth for "may I show this mean" is exactly the failure this project is built to avoid.
5. **The seed is visible and copyable on every surface that shows a run.**

### 7.0 Ledger — where the 91 rows stand after wave 2, `T29`, `T39`, `T48` and `T44`

| State | Rows | Ids |
|---|---|---|
| ✅ **wave 1** | 32 | `RV-01 04 05 10 12 13 15 16 19` · `PB-01 02 03 04 05 06 10 11 12 13 14` · `ED-11` · `KB-02 03 04 05 08 09 10 15` · `RS-01 06 07` |
| ✅ **run** — driven in a browser against the shipped `data/` | 37 | `RV-02 03 06 07 09 11 17 18 20` · `PB-07 08 15 16 17 18` · `ED-01 02 04 05 06 10 18 19 20 21 22` · `KB-01 06 07 11 12 13 15a` · `RS-02 03 05 08` |
| ✅ **run** + ✅ **test** — driven *and* asserted, both clauses | 6 | `RV-08` · `RV-21` · `ED-01a` (added by `T29`) · `ED-24` `ED-25` (added by `T48`) · `KB-14` |
| ✅ **test** — asserted, and the assertion proved to bite | 14 | `RV-14` · `ED-03 07 08 09 12 13 14 15 16 17` · `ED-17a` (added by `T44`) · `KB-15b` · `RS-04` |
| ✅ + ⚠️ — one clause each way | 1 | `ED-23` (in-app half run, `beforeunload` unverified) |
| ⚠️ **unverified** — built, reachable, neither driven nor tested | 0 | — |
| 🔲 **re-marked** — the row contradicts the schema | 0 | — (`ED-12` `ED-13` settled by `T38`; see below) |
| 🔲 **not built** | 1 | `PB-09` (window selection then loop) |

`ED-12` and `ED-13` left this bucket by being **answered**, not by being ticked. `C30` asked whether
a zero-car bank should be a schema error or a warning; the answer is **error**, the schema did not
move, and the row was the thing that was wrong. Relaxing `bankConfigSchema` so this ledger could
show a green row would have been the *weaken-a-criterion-to-pass* failure `CLAUDE.md` § Working
agreements forbids. What did change is that `resolveBuilding` — the editor's whole definition of
legality under `ED-T8` — was **raised** to agree with the schema it had been silently disagreeing
with. `ED-13`'s scenario was restated because it described a per-car `servesFloors` the model does
not have and should not have. [`DECISIONS.md` § D116](../../DECISIONS.md).

**`ED-17` was re-marked the same way, and it is the sharper case**: the row was *correct when
written and made false by a capability landing*. It asserted that `double-deck-not-simulated`
appears in the editor's warning list *verbatim from `core`* — a good assertion, pinned to a real
string, of exactly the kind this ledger asks for. Then double-deck operation was simulated and the
warning code was **deleted**, because it had become a false statement about the simulator. The row
now asserts the code is **absent**, and `ED-17a` covers the narrower condition that survived — a
double-deck bank declaring no `servesFloorPairs`, which **no shipped building raises**.

The lesson is not that the row was wrong. It is that **a ledger row pinned to a `core` string
inherits every change to that string**, and nothing here would have gone red if the editor had
simply stopped warning: the assertion was *contains*, and a warning that disappears passes a
*contains* check only when someone re-reads it. This one was caught by the lane that deleted the
code telling the lane that owns the ledger.

The seven ⛔ non-negotiable keyboard rows — `KB-01 02 08 10 11 13 14 15` — are now **all ✅**;
`KB-14` was the last, and `T39` drove it.

#### 7.0.1 What `T29` changed, and what it deliberately did not

`T29` fixed correctness defects in the shipped viewer. It touched six rows and added one, and the
count moved from 87 to 88 because `ED-01a` is new. `RV-08` moved from **test** to **run + test**;
nothing else changed bucket.

| Row | Change |
|---|---|
| § A.3 **Saturated**, § A.3 **Success** | Both "must not show" clauses were **false** and now hold — `D1`. Marked with the evidence, on both suppression grounds, on screen and in the exported PNG |
| `RV-03` | `tab` joins the five URL keys; the editor and the viewer stopped holding separate opinions about which building is open — `D11` |
| `RV-08` | The unanswered-call marker gained a surface that does not depend on the landing `<select>` — `D10` |
| `RS-08` | Re-driven, because the export **is** the canvas and that is what made `D1` more than a display bug |
| `KB-13` | The text alternative gained the unanswered landings, and became the thing the picture is asserted to agree with |
| `ED-T1`, `ED-01a` | Every floor-ordered list in the editor reads the way the building does — `U1` |

**Not claimed.** `T29` drove Secure Tower, Vertical City and Garden Apartments in a browser at
one viewport. It did not re-exercise `RV-11`, `RV-17`, `RV-21` or `KB-14` — `T39` did, below; it
did not touch Basic/Advanced modes, which are not built; and the `⊘` unserved-floor path still
has no shipped building that produces it.

#### 7.0.2 What `T39` changed — the last four ⚠️ rows, and what driving them found

`T39` closed the four rows that had been *built and never exercised*. Two of them were not merely
unverified; they were **false**, and both had been false since wave 2 shipped. The count stays at
88: no row was added or removed.

| Row | Change |
|---|---|
| `RV-21` | **False.** Retry refetched and then killed the page on a temporal-dead-zone `ReferenceError`, silently, inside a floating promise. Sequence extracted to `dev/bootstrap.ts` with `bootstrap.test.ts`; a throw from `start` can no longer vanish. ⚠️ → ✅ run + ✅ test |
| `RV-17` | **False in its second clause.** The message named the failing path only on the `!response.ok` branch, which is the branch a file missing from `data/` does *not* take on this dev server. `dev/data.ts` now names it in every failure mode. ⚠️ → ✅ run |
| `KB-14` | Held. Driven both ways by substituting `window.matchMedia`, and moved to `dev/motion.ts` so the verdict is assertable without the operating-system setting. ⚠️ → ✅ run + ✅ test |
| `RV-11` | Held. No shipped building produces it, so the state was built in the editor and run through `ED-04`. ⚠️ → ✅ run |
| `RV-18` | The viewer half was ⚠️ "for `RV-17`'s reason", and that reason was wrong for it too. Driven: five schema problems, all five shown at once. ✅ + ⚠️ → ✅ run |
| § B.3 empty state | Two wiring defects found while driving the above and fixed: the transport was left **enabled** during a failed load, and left **disabled** for a run handed over by the editor after a failed run — `ED-04`'s door, which is how `RV-11` is reached |

**Not claimed.** `T39` drove one viewport (1280 × 720) and did not re-audit the rows `T29` had
already established beyond the `D111` spot-check below. The `⊘` unserved-floor path still has no
shipped building that produces it, and `ED-23`'s `beforeunload` half is still unverified.

#### 7.0.3 What `T48` changed — the declaration list gets its own view

`T29` left a scope call open (`DECISIONS.md` § D111, [`docs/07`](../../docs/07-handoff.md) § 8):
the floors table and the declaration array are two orders sharing one widget, so either the
declaration gets its own view or `moveFloor` goes and `index` becomes the only ordering control.
**The owner chose the view.** Deleting `moveFloor` would have left it with no non-test caller,
which is this repository's signature defect; the honest version of "delete the buttons" is "delete
the function", and owning the seam is better than removing it.

The count moves from 88 to **90**: `ED-24` and `ED-25` are new. No existing row changed bucket.

| Row | Change |
|---|---|
| `ED-T1` | Split into two clauses, because it was one task covering two orderings. *Add/remove* and the `index` order are the Floors table; *reorder the declaration* is the new view. The old wording made "reorder floors" sound like one thing the editor did, which is how a button that reformatted JSON read as a button that moved a floor |
| `ED-24` | **New.** The declaration-order view exists, ⇧/⇩ live only there, and the array really changes. ✅ run + ✅ test |
| `ED-25` | **New.** The two views are told apart on screen, and neither renders a second opinion about legality. ✅ run + ✅ test |

**Not claimed.** `T48` drove the Building editor tab only, at one viewport, on Garden Apartments
and a **Start from blank** document. It did not re-drive Secure Tower, Vertical City, Midtown
Office or Mixed-Use High-Rise through the new view — the reordering-does-not-change-the-verdict
assertion covers `midtown-office` (the awkward one, index `0` declared before index `-1`) under
test rather than in a browser. `moveFloor`'s caller count was measured, not asserted: **1 before,
1 after**, via `nonTestImportersOf` from `experiments/src/tuning/callers.test-helper.ts`. The
number did not move — the *caller* did, from the `index`-ordered table where the operation was
invisible to the view where it is the whole point.

**`D111` spot-check.** Re-confirmed on **both** suppression grounds, on the canvas *and* in the
bitmap `Export PNG` writes (`canvas.toDataURL`, inspected by rendering it back into the page):
Vertical City at 26:34 with 1868 legs boarded, saturated, drew `SATURATED — AWT suppressed` and
`mean wait suppressed` with no figure anywhere; the zero-population run drew `AWT suppressed` and
`mean wait suppressed` on the empty-window ground. The metrics panel read `SUPPRESSED` with the
reason in both. No regression.

### 7.2 Not frozen: the field set of `VizRecording`

The list above froze four *structural* decisions. It was read — reasonably — as freezing the
recording's **shape** too, and that reading is wrong and was worth correcting before wave 2
started, because under it several of this document's own rows are unreachable and a necessary
change would have looked like a violation:

- The fold discards `PassengerRecord.carId` and `bankId`, so **RV-T3** ("hovering a landing
  highlights the assigned car; the assignment shown matches the record") cannot be built from a
  recording at all.
- The roadmap's **live metrics overlay** can show exactly three cumulative counters from
  `VizProgress`. Anything windowed — a rolling AWT, a per-bank breakdown, the peak-5-minute
  figure the statistics actually report — needs per-leg data the fold drops.

So: **the field set of `VizRecording` is expected to grow, and growing it is a deliberate
`VIZ_SCHEMA_VERSION` bump, not a violation of § 7.1.** What is frozen is the direction of
dependency, the purity of `frameAt`, the single home of the wall clock, and the provenance of
`awtIsValid` — none of which a new field touches.

Two consequences already applied in wave 1's remediation:

- `VIZ_SCHEMA_VERSION` is **2**. `VizProgress.served` / `Frame.served` became `boardedLegs`,
  because the counter counts leg boardings and the header drew them as people.
- `buildLayout` takes `readonly ShaftGeometry[]` — carId, bankId, label, servedFloorIds — rather
  than `readonly VizShaft[]`. `VizShaft` satisfies it structurally, so no caller changed, and
  **ED-01/ED-02**'s run-less editor preview is now expressible: laying a building out no longer
  requires motions, door marks, occupancy series and a capacity, i.e. no longer requires a
  finished run.

What was deliberately **not** done: adding the per-leg array that RV-T3 and a windowed overlay
need. Nothing in wave 1 would read it, and a field with no reader is the defect this repository
has shipped five times, not a head start. Wave 2 adds it together with its first consumer, and
bumps the version to 3. The full reasoning is in `the root DECISIONS.md`.

**Done in wave 2.** `VIZ_SCHEMA_VERSION` is **3**. `VizRecording.legs` carries seven fields of
`PassengerRecord` — `passengerId`, `originFloorId`, `direction`, `arrivedAt`, `boardedAt?`,
`carId?`, `bankId?` — and arrives with both of its consumers in the same change: `overlayAt` for
the windowed figures and the per-bank split, `landingAssignmentsAt` for `RV-T3`. Nothing else was
copied across; six further fields of `PassengerRecord` are still deliberately absent, and
`VizProgress` was **not** replaced, so the fold and the leg array remain two independent
projections of the same passengers that `recordRun.test.ts` compares. See
`the root DECISIONS.md` § T11-1.
