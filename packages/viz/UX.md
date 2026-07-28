# Phase 4 UX inventory

What the three visualization surfaces must do, enumerated so that every row becomes a test row.

This document exists because `MULTI_AGENT_PLAN.md` §&nbsp;planning-first says the interface is
locked before the UI fans out, and because `TEST_MATRIX.md` §&nbsp;3 currently holds ten
placeholder rows waiting for exactly this. **Every scenario below carries an id** (`RV-…`,
`PB-…`, `ED-…`); copy the id into the test matrix so a scenario and its test can be traced to
each other in both directions.

## How the marks are used — read this before trusting one

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
| RV-T7 | Copy a run's provenance | One control copies `building, dispatcher, traffic, seed, duration` in a form the CLI accepts |

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
| PB-09 | alternate | Window selection then loop | Only the selected span repeats | 🔲 — **not built.** Whole-run looping is (a checkbox, rebuilt transport at the current instant); selecting a sub-window is not |
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
| ED-T1 | Add, remove and reorder floors | Heights and indices stay consistent; the shaft picture updates live; **the list reads the way the building does** — highest floor at the top, ground at the bottom, the same direction the preview beside it draws (`U1`) |
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
| ED-12 | edge | Bank with zero cars | Warning, not an error; the run will simply have no service there | 🔲 **re-marked, not built: this row contradicts the schema.** `bankConfigSchema` requires `cars` to have at least one entry (*a bank must have at least one car*), so a zero-car bank is a schema **error** and cannot be a warning without the editor overriding the loader — which `ED-T8` forbids. Asserted as an error in `editorEdits.test.ts`. Making it a warning is a `core` schema change and belongs there |
| ED-13 | edge | Car serving a floor its bank does not | Rejected, citing the cross-reference check | 🔲 **re-marked:** a car has no `servesFloors` in the schema — service zoning is declared per **bank**, so the situation the row describes is unrepresentable. The nearest real check, a bank serving a floor the building does not declare, is ✅ test with the element's JSON path named |
| ED-14 | edge | Access zone naming a floor that does not exist | Rejected, naming the unknown floor | ✅ test |
| ED-15 | edge | Building with no entrance floor | Warning: incoming traffic has nowhere to originate | ✅ test — `no-entrance-floor`, listed as a warning with Run left enabled |
| ED-16 | edge | Population declared inconsistently with the sum of floors | The sum wins (as `resolveBuilding` does); the discrepancy is shown, not hidden | ✅ test — the warning names the declared figure and the resolved building carries the sum |
| ED-17 | edge | `doubleDeck: true` | Surfaced as **not simulated as paired** — the open item in `docs/07-handoff.md` — rather than silently accepted | ✅ test — `double-deck-not-simulated` appears in the warning list, verbatim from `core` |
| ED-18 | failure | Invalid JSON pasted | Parse error with position; the editor state is not lost | ✅ run — the typed text is kept exactly, the error names the parse failure and focus moves to it. A position is reported when the engine gives one; a document truncated at EOF yields *Unexpected end of JSON input* with none |
| ED-19 | failure | Save fails (no filesystem access in the browser) | Falls back to download; says so before the user commits to a long edit | ✅ run — the control is labelled **Download JSON** up front, and after it fires the status says *move it into data/buildings/ to make it a shipped building* |
| ED-20 | failure | Schema rejects the whole document | Every issue at once — `ConfigError` collects them deliberately, so showing only the first would be a regression against the loader's own contract | ✅ run — six independent faults produced **six located problems at once**. The list also says when it is a *stage* rather than a total: a document that failed the schema never reached cross-referencing, so more may appear once these are fixed |
| ED-21 | recovery | Undo / redo an edit | At least 20 steps; keyboard-driven | ✅ run (the buttons) · ✅ test (25 edits undone and redone; a no-op edit spends no step). **Not keyboard-driven**: there is no ⌘Z binding — the buttons are reachable by Tab and that is all |
| ED-22 | recovery | Discard all changes | Confirmed once, then back to the loaded document | ✅ run — a modal confirm, then the floor height back to 9 m and the document clean again |
| ED-23 | recovery | Leaving with unsaved edits | Warned before navigation | ⚠️ unverified for the browser's own leave prompt (a `beforeunload` handler, fired only on real navigation) · ✅ run for the in-app half: opening another building, starting from blank or importing over unsaved edits each ask first |

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

### 7.0 Ledger — where the 88 rows stand after wave 2, `T29` and `T39`

| State | Rows | Ids |
|---|---|---|
| ✅ **wave 1** | 32 | `RV-01 04 05 10 12 13 15 16 19` · `PB-01 02 03 04 05 06 10 11 12 13 14` · `ED-11` · `KB-02 03 04 05 08 09 10 15` · `RS-01 06 07` |
| ✅ **run** — driven in a browser against the shipped `data/` | 37 | `RV-02 03 06 07 09 11 17 18 20` · `PB-07 08 15 16 17 18` · `ED-01 02 04 05 06 10 18 19 20 21 22` · `KB-01 06 07 11 12 13 15a` · `RS-02 03 05 08` |
| ✅ **run** + ✅ **test** — driven *and* asserted, both clauses | 4 | `RV-08` · `RV-21` · `ED-01a` (added by `T29`) · `KB-14` |
| ✅ **test** — asserted, and the assertion proved to bite | 11 | `RV-14` · `ED-03 07 08 09 14 15 16 17` · `KB-15b` · `RS-04` |
| ✅ + ⚠️ — one clause each way | 1 | `ED-23` (in-app half run, `beforeunload` unverified) |
| ⚠️ **unverified** — built, reachable, neither driven nor tested | 0 | — |
| 🔲 **re-marked** — the row contradicts the schema; stated rather than papered over | 2 | `ED-12` `ED-13` |
| 🔲 **not built** | 1 | `PB-09` (window selection then loop) |

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
