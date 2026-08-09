# Known gaps — stated, measured where possible, and not closed

**As of:** 2026-07-30, wave 12 · **Branch:** `claude/project-completion-orchestration-7dz4qp` at
`a8acf65` · **Suite:** **262 files / 4 883 tests, 4 873 passed, 10 skipped**, `tsc -b` clean,
1 918 s under Node v26.5.1 **on the wave-12 container (Linux)** — measured **serially on an idle
machine with no lanes running, on the
pushed tree**; the wall-clock includes the new `lunch-two-way-selection` study re-deriving its own
20 pinned figures at full budget, which is the price of a pin that cannot go § D196-stale. (The two
figures this line carried earlier the same day — 4 853 at `821210a`, 4 859 at `6150b9f` — were each
superseded by landed work within hours: the drive phase and its fixes, then the Phase 6c
measurement; § D197–§ D200.) The wave-11
figure this line used to carry (258 files / 4 794, *4 784 passed*) **was not reproducible from any
committed tree this wave could reach**: 26 of its claimed passes fail on the tree as pushed, at the
very commit the figure was measured at, under Node 22 and 26 alike — for which the re-pin is
[§ D196](DECISIONS.md).

> **That figure names a platform now, and the qualifier above is load-bearing.** Re-measured on
> darwin/arm64 under Node 26.5.0 and 26.5.1, the § D196 re-pin is **exactly inverted**: its 26
> replacements fail and the 26 values it superseded pass, same three files, same skip count of 10 —
> while the total, *4 873 passed / 10 skipped*, reproduces this line precisely. Both measurements
> are correct on their own machine; neither pin set is portable, and Node was eliminated as the
> variable on both sides. **A suite figure is a claim about a machine as well as a commit.** The
> symmetry, what it retracts, and the two-OS CI matrix that now judges it are
> [§ D201](DECISIONS.md).

> **The skip count is 10 and has not moved all wave** — through wave 12 either. That is the number
> worth watching here: a wave that quietly skips a test to go green moves it, and a growing test
> count says nothing on its own.

This document exists because the alternative is worse. Every item here is something the project
**does not do**, **cannot yet say**, or **says with a caveat** — collected in one place rather than
distributed across commit messages where nobody planning work will find them.

Nothing in this file is a plan. Items are ordered by whether they can produce a **wrong number**, a
**wrong screen**, or neither.

---

## 1. ~~The largest one: Phase 6c has not been re-measured~~ — CLOSED BY MEASUREMENT (2026-07-30, under [§ D162](DECISIONS.md); [§ D200](DECISIONS.md) is the verdict), and the answer is the third refusal

**Phase 6 is ⚠️ partial and stays partial — now with the question closed rather than open.**

Learned weight-set selection was refused across eight pre-registered operating points
([§ D156](DECISIONS.md)), and the mechanism was named: the shipped demand model varied *how busy*
the building was and never *the mix* of up, down and interfloor traffic within a run, so the
condition selection exists to exploit did not occur anywhere. `lunch-two-way`
([§ D169](DECISIONS.md)) built that condition — χ² 383.4 against a flat control's 4.8 — and
[§ D162](DECISIONS.md) pre-registered the protocol under which measuring on it could count.

**The measurement is now done** (`benchmark/lunchTwoWaySelection.ts`), and
the selector does not clear the gate even under traffic whose directional mix changes within the
run: ΔTTD `−0.170 [−0.405, +0.064]` against `auction-multi-round` at n = 200 on the disjoint seed,
an interval containing zero, an eighth of the cell's own TTD-measured 0.412 s limit — while the
regime screen shows `two-way` as the detector's incumbent on 66.1 % of observations, so the
condition genuinely occurred and it is the selector that was refused. The § D162 flat-mix negative
control earned its clause: its learned arm came back BETTER (`−0.576 [−0.833, −0.319]`) on traffic
whose mix cannot vary, and the constant-override probe named the mechanism — a **static
weight-vector hybrid** the switching subtracts from, not mix exploitation.

**What that means for anyone reading a status table:** the largest open item is no longer open.
Learned selection is refused on fixed-mix traffic at nine operating points and on mix-varying
traffic at the one shipped point that expresses it. What would move Phase 6c now is a different
selector, not a different measurement.

---

## 2. Gaps that can produce a wrong number

| Gap | State |
|---|---|
| **~~The `lunch-two-way` operating point has no saturation census~~ — CLOSED (2026-07-30)** | The § D162 measurement (`benchmark/lunchTwoWaySelection.ts`) censused both the point and its flat control at 200 replications over all twelve shipped profiles: **every arm quotable on both cells, no ceiling on either**, `firstInvalidOf` reading all four `awtIsValid` grounds. The budget was then variance-derived (binding arm `nearest-car`, clamped to the band's ceiling of 200) rather than inherited. |
| **The `lunch-two-way` arc is the widest amplitude consistent with its citation** | A real building's departures and returns overlap. **A wider arc is the one a selector finds easiest to exploit**, so this cuts against any future positive result and is stated first in three places rather than last. `mixAmplitude` narrows it. The § D162 measurement carries the discount beside its figures — and it now also cuts against the flat control's static-hybrid BETTER being read as anything about mix. |
| **~~The `matrix` study's pins are re-derived by no test~~ — this entry was FALSE, and its cause is worth more than the entry** | `matrix.test.ts` has called `checkPinned('matrix', …)` against a **full-budget** `runMatrix()` on every always-on run since `f895a16`, and `published.test.ts`'s scan — which reads sources with `readFileSync` — has enforced that call's existence for all fifteen ids, so the claimed state would have made an existing test **red**. The finding came from a `grep`; `matrix.test.ts` carried a raw NUL byte, `grep` here wraps `ugrep -I`, and the file was **silently skipped**. That is the same artifact `f78dc42` documents producing a false `#rail-access-note` finding — **second victim of one tooling defect**, and this one sat in the register where a lane would plan against it. Kept struck through rather than deleted: a false gap costs a lane a day, and the mechanism is now twice-attested. See [§ D184](DECISIONS.md). |
| **The `matrix` study's *Pareto front* was re-derived by nothing, and it had already drifted — NOW CLOSED** | The real gap, one study over from § D149's. Every one of the 352 pins is an **arm-against-baseline** paired estimate; front membership is decided **arm-against-arm** over raw per-replication energy, so no interval pin can see a front move. `7fac568` legitimately moved `vertical-city-up-peak` and `docs/05` did not follow — for four days the published front there read three arms where the tree computes six. **`nearest-car`'s 6-of-8 count never moved, which is why nobody noticed**, and that count is what § D106 and the refusal of an eco score actually rest on. Closed by `PINNED_FRONTS` + `matrixFront.test.ts` at ~0.3 s, on the run the suite already pays for; the document is corrected. |
| **One door-hold figure is annotated rather than re-derived** | The 50-cell study behind it has **no shipped entry point** — it lives in the commit that measured it. 40 of 50 cells provably cannot have moved; 10 can have. Marked *"measured on the pre-escalator configuration"* rather than quietly kept. |
| **Double-deck's verdict is `BETTER-EVERYWHERE` on a narrower base than the answer it replaced** | Two cells at one operating point, where the previous answer had four at two; the 1.5 % point is unquotable at any budget in the band. **A better word on a narrower base is not a stronger result**, and a reader who skims will take the word at face value. |
| **A one-way escalator is not expressible** | Transport modes carry no direction, because nothing would read it and an unread field is the dead seam this repository has shipped twelve times. |
| **Two of `vertical-city`'s three sky-lobby escalators carry nobody** | The zone locals already serve both levels. Declared because the machines exist in the building being modelled, **measured and pinned in both directions** so it is loud rather than discovered. |
| **A zone cannot be changed mid-run** | Operational zoning is a shipped concept with no mechanism over time. Deliberately deferred this wave — nothing measures it and no published result depends on it. |
| **The double-deck closed-form round-trip-time check is single-deck** | The Barney/CIBSE derivation *is* the single-deck one; retiring the warning would be the over-claim. |
| **~~`copy run` emits a CLI line that reproduces a *different* run whenever the pattern or the day is non-default~~ — CLOSED (2026-07-30, wave 12, [§ D190](DECISIONS.md), `dbfc22e`)** | The finding stands as history: the line named `--building`, `--dispatcher`, `--seed` and `--duration` and **no traffic**. The coach ribbon's pattern select really does move the run off the building's own profile, and the day's event multiplies demand on top. `--traffic` is a real `elevator-sim watch` flag, so the CLI would honour the line and produce something else. This is a **provenance** surface, which makes it worse than an ordinary display bug: the reader cannot check it, because the whole point of the control is that they could not otherwise reproduce the run. Found while verifying `RV-T7` for [§ D180](DECISIONS.md); carried in `UX.md`'s `RV-T7` row. **Closed:** the line now emits `--traffic`/`--template` — with the viewer route **driven bit-identical to the CLI route at 10 of 10 cells** rather than assumed equivalent — or **refuses with named reasons** and copies nothing: a saved pattern, any day but the first, held cars, moved group levers, saved buildings or dispatchers. |

---

## 3. Gaps that can produce a wrong screen

| Gap | State |
|---|---|
| ~~**The leaderboard's competitive axis is the seed**~~ **— closed** | `configHashOf` hashes the building, the dispatcher, the template, the rate, the duration and the loaded `data/` and deliberately excludes the seed, so every entry on one board was the same configuration on a different seed and picking a better dispatcher moved you to a different board. **The fixed-seed challenge board is built and wired** ([§ D218](DECISIONS.md) is the criterion, dated before the code): the server issues the configuration and the seed set, the dispatcher is the axis, every row carries the count it was computed over, and the § 5.5 tension is answered by scoring over a set rather than a run — with Compare still the only surface allowed to order two dispatchers. The config board stays and keeps saying, in words, what it is. |
| ~~**The Day report is shaped like a day of a week even in free play**~~ **— closed** | It named a scenario and a banked count on a run banking nothing. Every line was individually honest — `contractStatus` answers correctly when there is no contract — and the *sheet* was still the wrong shape for a mode with no week. `ShapedDayReport` is two shapes with one core: the single run drops the week's five statements and adds four of its own, and the figure grid, the diagnosis, the levers and the small print are the **same values** on both rather than two lists that agree today. `DayReportInput.subject` is required, which is the actual fix: the defect was a caller inferring a week from *there is no contract*, and a required field is a caller that has to say. |
| **~~`settings.showEnergyAxis` and `settings.theme` reach nothing~~ — re-measured 2026-08-05 ([§ D250](DECISIONS.md)): `theme` is closed, `showEnergyAxis` reaches a *function* and no pixel, and *that* is the finding** | `theme` is wired and visible — measured in a browser, `data-theme="light"` on the root and the whole shell recoloured ([§ D235](DECISIONS.md) built the second palette). `showEnergyAxis` left `SINK_MISSING` because it acquired a sink, `render/runSummary.ts#summaryFigureIds` — and **that function's only shipped caller is `mode/disclosure.ts#disclosureItems`, whose only shipped caller is `dev/main.ts#drawParity`, which turns it into `parityRefusal`: a string that is empty whenever parity holds.** So the register was emptied by a sink nothing renders. Measured: with a run on screen at 1280×720, the whole shell's text is **byte-identical** with the switch on and off (GitHub issue #70, whose reporter is right about this one and wrong about persistence). The two energy cells a player reads are `shift/report.ts#energyFigures`, emitted unconditionally, and `DayReportInput` has no field for the preference — so the fix is one required field plus one caller, and the deeper one is that `scope.test.ts`'s *a presentation control reaches a sink* is satisfiable by a pure function no surface calls. **`SINK_MISSING` being empty is not the same claim as "all four are visible", and it was read as one.** |
| **Two surfaces are called Campaign, and a third is called Scenarios** — *half closed* | The contract week in `shift/` and the batch-judged stages in `data/campaign.json` are different modes with different verbs, and the scope model separates them (`shift-week` against `stage-campaign`). **The batch tab is now labelled `Lab`, id unchanged**, so the two modes no longer share a word, and the whole menu — a shell the handoff has no concept of — is recorded as a deviation in [`docs/12` § 4.8](docs/12-design-handoff.md) rather than sitting in neither document, which is the § 4.7 failure at a larger radius. What is left is that the *Scenarios* tab and the *Campaign* menu row name one mode from two angles. That is a naming judgement about a surface the handoff drew, and the handoff settles those. |
| **Sandbox is a string with no feature behind it** | `Sandbox` appears in the coach ribbon when a building has no contract, and no mode sits behind it — a label describing a feature. **Endless is closed:** `c5`'s reward now names something that exists (`shift/week.ts`'s `openEndless`, `menu/enterEndless.ts`, the **Keep going** row on the campaign screen), and the day report has a sentence of its own rather than telling an endless player they are on their own building. Sandbox is left open because it is not the same shape: endless was a missing *mode* and this is a missing *meaning* — nobody has decided what Sandbox is, and building the wrong thing is worse than the label. |
| ~~**The weight-set selector has no surface**~~ **— closed, and half its seam was missing** | `selection.policy` over `patternSwitching` is the simulator's one genuine mid-run adaptation and reached no screen. Mounting it found that a profile's `selection` block already survived into a run and **`patternSwitching` did not** — loaded, carried, and writable by nothing in the viewer — so an arm-map editor over it would have been the twelfth dead seam with a slider on it. `dispatcherProfilesWithSelector` is that seam. The § D177 test moves the legs on the policy, the arm map and each of the six sliders; two needed a non-default operating point, and each names its own with the reason, because those are findings about the shipped calibration rather than about the panel. |
| **A restored week that is dropped is announced in the coach ribbon, not in a slot of its own** | **Closed in substance, open in placement.** `persist/notice.ts#restoreNoticeFor` turns each discriminated restore failure into a line that says what was lost, that it is not the player's doing, and what happens now — and `absent` returns nothing, because a first visit is not a loss and a notice a reader learns to ignore is worse than none. It is driven by the honesty sweep (`RESTORE_NOTICE`), which is what moved `loadSession` out of `derive.test.ts`'s persistence exclusion: two arms quote its wording, so it now reaches a player. What is left is where it is shown — the coach ribbon's hint, ahead of the withheld refusals, because a slot of its own is markup the lane did not own. The hint is advice about the run and this is news about the save; a dedicated line is the better home. |
| ~~**The light palette repaints the shell and not the stage**~~ **— closed** | `render/tokens.ts` now holds both palettes and `themeFor` resolves a stage as well as the shell's twenty-seven tokens; `dev/main.ts` stamps `data-theme` so `index.html`'s light block is live, and the building editor's preview asks for the palette at draw time. The light stage is argued rather than inverted — night stays the deepest of the four skies, because a black night sky would restore the half-repaint inside the plot for a third of every simulated day. The property asserted is **partition preservation** (equal in dark iff equal in light) rather than all-distinct, because the dark palette collides on purpose. |
| ~~**The saved library does not survive a reload**~~ **— closed, at schema version 2** | `savedBuildings`, `savedDispatchers`, `savedPatterns` and `savedClasses` are persisted, and the three objections that kept them out are answered rather than waived. **Unbounded size:** a declared 512 000-character budget, checked before the store is touched, refusing the whole save with a sentence naming the size — refusing rather than dropping the library, because one slot is replaced whole and a save that *"left the library out"* would delete the copy already there. **`core`'s shapes:** each entry is validated on the way back in through the loader that owns it — no second validator — and one that no longer parses is dropped **by name** while the rest survive. **The version:** `SESSION_SCHEMA_VERSION` is 2 and version 1 still restores its week, because refusing would take a week away over a feature that build never had. The rule that makes per-entry restore legitimate beside the week's all-or-nothing is stated where both live: a library is independent documents; a week is one state whose parts constrain each other. |
| ~~**`DayReportInput.event` is a dead input**~~ **— closed, and the larger half was not the dead input** | Destructured and read by nothing; the forecast card names *tomorrow's* event and derived it independently. So a sheet for a move-in day described the figures and never mentioned the derated car that shaped them: every line true, and the account missing its subject. It is now a meta line, because it is identity rather than a reading — and absent on a single run, where there is no week to book anything against. **The independent derivation was itself a defect** — it was `eventFor(day + 1, …)`, the ordinary schedule, on a card predicting a run the calendar would overrule (GitHub issue #135, closed: `shift/calendar.ts#scheduledEventFor` is the one answer, and `shift/eventSeam.test.ts` derives from disk that it stays the only one). |
| **A live weight editor makes overfitting the tuning seeds the dominant strategy** | Measured, not theorised: a stage cleared on an edited vector is **beaten on three measures on that stage's own declared holdout set**, and the sweep is sharp — three neighbouring values clear, the fourth does not. The campaign judges on tuning seeds only, and **nothing in the shipped surface says so**. This is `CLAUDE.md` § *Tuning discipline* arriving as a game-design defect. |
| **~~Basic mode cannot *shorten* a suppression reason~~ — CLOSED, both halves** | `core` carries the ground beside the prose ([§ D183](DECISIONS.md)) and `VizSummary` transports it at `VIZ_SCHEMA_VERSION` 8 ([§ D185](DECISIONS.md)). Kept one line, struck through, for the finding underneath it: **every assertion in the disclosure suite handed a ground in directly, so all of them were green for a whole commit while the shipped screen still rendered the ground-free lead.** A fixture-only suite cannot tell *wired* from *working* — the same distinction the standing requirement makes between *reachable* and *has a non-test caller*, arriving through a test fixture instead of a barrel re-export. The replacement records real runs. |
| **~~`render/mood.ts`'s docstring does not name `awtInvalidGround`~~ — CLOSED (2026-07-30, wave 12 lane D, `9ce6a6f`)** among the summary fields deliberately omitted from `MoodSummary` | The omission itself was and is real — the `Pick` and the explicit copy list both exclude it, so nothing leaks. Only the docstring was incomplete ([§ D185](DECISIONS.md)); it now names the field. |
| **~~Several documents state a `VIZ_SCHEMA_VERSION` that is no longer current~~ — CLOSED (2026-07-30, wave 12 lane D)** | `docs/10` § *the recording contract* said the recording *is* at version 4; it is at **8**, and the present-tense claims now say so. Most other occurrences are **historical and correct** — they record the version a unit landed at, and rewriting those would destroy the history they exist for. Distinguishing the two was the work, which is why this was a register row and not a find-and-replace: only the present-tense claims were corrected and the past-tense ones stand as evidence. |
| **Thirteen warning rows on one building is a wall** | Grouping is deliberately **not** done: parity requires each warning's text in Basic, and a summarising group is the first place one could go missing. |
| **The three DOM panels are statically swept, not driven** | The generated honesty search reaches them only by scanning source for probability words. A sentence assembled at runtime there is invisible to it. Weaker than driving, and stated as a limitation rather than presented as coverage. |
| **The always-on honesty tier reaches no batch at 50+ replications** | So R2's budget clause is only satisfiable in the deep tier, behind a flag. |
| **~~The honesty search's `mode` dimension has one value~~ — CLOSED (2026-07-30, wave 12, [§ D194](DECISIONS.md)) — and the result was null** | `'basic'` joined `HONESTY_MODES` and the always-on corpus produced **zero new strings** — no shipped adapter branches on `context.case.mode`, because the disclosure adapter renders both `VIEW_MODES` on every case. The axis is generative headroom that becomes load-bearing the day a renderer branches on case mode, which is what its docstring now records instead of the doubling it wrongly predicted. |
| **The structural-refusal reason is prose keyed on an id the leg record does not carry** | So it cannot be joined to a leg. **This was in the wave plan and I never briefed it** — an orchestration miss, recorded rather than dropped. |
| **Basic's curated three-dimension subset is not built** | The campaign editor is restricted to each stage's declared editable set instead, which is data. |
| **~~The elevation's express toggle produces two strings the honesty search never sees~~ — CLOSED (2026-07-30, wave 12, [§ D194](DECISIONS.md))** | `honesty/surfaces.ts` seeded only `car.legend` from `elevationCarsOf`, so `expressLabel` and `expressTitle` were outside R1–R13. Stated rather than discovered: the toggle landed in [§ D181](DECISIONS.md) from a lane that did not own `surfaces.ts`. **Closed:** both strings are now driven, both throws included — one via a legend no shipped spec can produce. |
| **~~The stage's bank filter is inert — the thirteenth dead seam, and this wave restyled it~~ — CLOSED (2026-07-30, wave 12, [§ D187](DECISIONS.md))** | The finding, kept verbatim: `#bank-filter`'s `change` handler writes a binding `drawStage` never reads; `buildLayout` and `drawScene` take `recording.shafts` whole. **Driven and confirmed** on `vertical-city` (twelve cars, seven banks) with playback **paused**: a hash over the canvas bitmap is byte-identical across `(all)`, `shuttle` and `zone-6-local`. Two things make it worth more than its size. **First, § D180 restyled this control into the handoff's vocabulary and recorded it as load-bearing** — citing `RS-05`, whose claim that the filter narrows the picture is false of this viewer. A lane audited what the control *is for* and never asked whether it *works*; "name the non-test caller" has a sibling question, **"name the reader of the value"**, and nothing here asks it. **Second, `RS-05` permits horizontal scroll *or* a bank filter and forbids silent truncation** — so a building too wide to draw is currently relying on a control that does nothing. Found by the UX ledger rebuild ([`packages/viz/UX.md`](packages/viz/UX.md) `SG-15`). **Closed by wiring, not retiring:** a pure `shaftsForBank` threaded through `drawStage` → `buildLayout`, with the § D177 test that moves the filter and requires the column set to change, and the no-silent-truncation caption *"bank X — showing N of M shafts"*. [§ D180](DECISIONS.md) now carries the correction note it was owed. Browser re-drive owed (`UX.md` § 26 item 1). |
| **~~Nothing writes the URL back~~ — CLOSED (2026-07-30, wave 12, [§ D189](DECISIONS.md))** | `applyDeepLink` read `?building&dispatcher&seed&duration&tab&rail&mode` and no `pushState`/`replaceState` existed anywhere in `packages/viz`, so a deep link could be *followed* and never *produced* — the reader could not copy the address of what they were looking at. Retired `RV-03`/`RV-T2` claimed otherwise and were false of this viewer. `UX.md` `SH-09`; found by reading. **Closed:** `history.replaceState` — never `pushState` — at the `renderAll` chokepoint, deterministic defaults omitted, the seed always written, nothing written before boot; the round trip is asserted directly (`deepLinkStateOf(deepLinkSearchOf(state))`) and `applyDeepLink` has its first tests. Built and round-trip tested; the **browser drive is still owed** (`UX.md` § 26 item 2). |
| **A dispatcher card's words are derived, and the better ones are authored where nothing may read them** | `$comment` is maintainer documentation and no longer reaches a card ([§ D186](DECISIONS.md)) — the longest rendered card went from **5 133 characters to 164**. The derived replacement is honest and bounded and **reads as configuration, not as a sentence a building manager would say**, which `docs/12` § 2.2 makes a requirement rather than a flavour. The handoff already writes the right copy per dispatcher; `data/dispatcher-profiles.json` has no field to put it in, and `$comment` must not be made to serve. |
| **~~`patternOptionsOf`'s `help` still reads a *traffic* profile's `$comment` onto a driven surface~~ — CLOSED (2026-07-30, wave 12, [§ D193](DECISIONS.md))** | The identical route § D186 closed one surface over: benign at 64 characters of player-safe copy, and bounded by nothing. **Closed the way § D186 closed it for dispatchers, on the authored-field side:** `TrafficProfile.blurb` — required, 1–160 characters, schema-validated in `core`, so a profile with nothing to say still has to say it on purpose — and the card reads it and nothing else. The `$comment` route is refused in both directions, **including adversarial injection**: a § D186-shaped essay planted on *every* profile must reach none of a card's rendered strings, and the guard was mutation-checked red before landing. The dispatcher half of § D186's "left open" — an authored field in `data/dispatcher-profiles.json` — **remains open** (the row above), and `blurb` is named so that field can share it. |
| **~~`Escape` does not dismiss the right-rail drawer~~ — CLOSED (2026-07-30, wave 12, [§ D188](DECISIONS.md))** | Below the 1340 px breakpoint the right rail becomes an overlay at `z-index: 20` over the stage, and **its own toggle was the only way to close it** — the key every other overlay on the web answers to did nothing. Found by **driving** the shipped page at 1280 px while discharging [§ D163](DECISIONS.md) clause 5, not by reading the markup, which is the whole reason that clause forbids a canvas mock. It was a keyboard-trap-shaped defect rather than a cosmetic one: a reader who opened the drawer to see who is driving had to find the toggle again to see the building. Named in Phase 9's verdict rather than counted against it ([`docs/05`](docs/05-roadmap.md) § Phase 9). **Closed:** a pure `escapeClosesDrawer(viewportPx, openedByReader)` wired into `wireKeyboard`, focus returned to `#drawer-toggle` — and **deliberately inert in column mode**: at ≥ 1340 px the rail is a remembered layout choice, not a modal, and `Escape` dismissing it would destroy state the reader set on purpose. |
| **The access block's six mount-private copy sentences in `dev/buildingEditor.ts` are static-only** *(rewritten to the residue 2026-07-30, wave 12, [§ D194](DECISIONS.md) — the row read "the access block's labels, tooltips and legend are statically swept, not driven", and its prescribed fix, a `covers` entry in `honesty/surfaces.ts`, was **half wrong**)* | The block is now **driven**: the coverage-matrix cells in all three states, the chips, the restricted-floor runs, `elevationNoteOf`'s stranded clause, `validateSpec`'s empty-group refusal and the loader's `credentialGroups.min(1)` refusal are seeded. Not via `covers`: `accessMatrixOf`/`zoneChoicesOf` are deliberately prose-free — facts and ids only — so `deriveTextProducers` does not list them and a `covers` entry naming them fails derive's own no-stale-coverage guard; for a prose-free producer, coverage is **seeds composing the strings exactly as the mount does**, with liveness held by the adapter-liveness assertion. **What remains:** the six mount-private copy sentences in `dev/buildingEditor.ts` are static-only, and the named fix is exporting them. |

---

## 4. Real debt that cannot produce either, and is therefore out of scope

Listed so it does not read as forgotten. None of these can make the simulator compute a wrong
number or the viewer show a wrong screen.

`tuning/space`'s liveness sweep cannot probe seven `selection.*` rows (it passes no dispatcher
profiles) · `published.test.ts` holds nothing for a categorical study outside one case · a `'z'`
family label can still print on a convergence report whose half-width is already `NaN` ·
`estimateMean` returns a zero half-width on a zero-variance sample · `prepositionPlan` has zero
callers and is classified rather than deleted · `stats/` consolidation is unstarted.

**All 73 of the viewer's elements are required, and no surface is optional.** A page supplying only
some of them now gets one list naming every id it lacks rather than dying on the first
([§ D173](DECISIONS.md)), and `dev/elementMap.ts` is the list. But `dev/main.ts` still dereferences
every one unconditionally, so *"this page has no Campaign tab"* is not expressible — it is a missing
element, not a disabled surface. Declaring an element optional without guarding its wiring would be
a promise the page does not keep, so the declaration was **not** added. Making a surface genuinely
optional is a change to `main.ts`, one surface at a time, and nothing needs it until a UI wants to
ship a subset.

---

## 5. Where a status claim is weaker than it looks

- **Phase 9 is ACCEPTED WITH NAMED GAPS, and its criterion was written after seven of its nine units
  existed** ([§ D163](DECISIONS.md)). The defence of that ordering is structural, not chronological:
  the clauses that decide the phase were ones the product **failed** at the time of writing, and
  both are now met by a run — clause 2 (mode parity) derived from the code
  ([§ D168](DECISIONS.md)), clause 1 (the honesty property under search) green at 60 cases and
  271 985 strings **after finding two violations** ([§ D186](DECISIONS.md)). **[§ D172](DECISIONS.md)
  had asserted that tier clean on an argument rather than a run, and the run disagreed** — which is
  what the label on that claim was for, and is the single best reason to distrust any *"this holds"*
  in this repository that does not name a run.
- **Phase 9's clause 4 is now mechanised** ([§ D192](DECISIONS.md), 2026-07-30, wave 12).
  ~~**Phase 9's clause 4 is the weakest thing under an accepted phase in this repository.**~~
  *(retired in place — that sentence was true when written and the fifth audit it called for is
  built.)* *Every unit names its non-test caller* is re-derived by
  `packages/viz/src/deadCode.test.ts`: all **19** directories under `packages/viz/src` are derived
  from disk and asserted in **both directions** — a twentieth directory turns the suite red — over
  **1 017 exports**, with the 25 zero-caller exports classified as **8 `DEAD_CANDIDATES` + 17
  `PUBLIC_API_ONLY`**, both lists asserted in both directions plus disjointness. The hand-written
  table in `packages/viz/src/index.ts` is demoted to commentary. The residue, so this row does not
  round up: the **8 dead candidates await disposition** — wire or delete, each with its own
  verification burden, a recorded follow-up task — and the mechanisation immediately found **two
  docstrings naming callers that do not call** (`dev/viewerRunConfig`,
  `dev/PREFERRED_VIEWER_DISPATCHERS`; [§ D192](DECISIONS.md)), which is the prose table's failure
  mode arriving exactly where the standing requirement said it would.
- **Phase 9's own contract has been wrong about the code four times** in this wave — a reachability
  claim, a field list, a hard-coded percentage in an example message, and a goal table disagreeing
  with the shipped data in three of five cells. Being *binding* does not make a document *right*.
- **"Three of seven campaign stages clear from the dispatcher dropdown alone" is four.** Corrected,
  and now pinned by a test that re-derives it. [§ D161](DECISIONS.md) now carries the supersession
  note on the count (wave 12).
