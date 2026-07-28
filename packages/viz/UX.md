# Phase 4 UX inventory

What the three visualization surfaces must do, enumerated so that every row becomes a test row.

This document exists because `MULTI_AGENT_PLAN.md` §&nbsp;planning-first says the interface is
locked before the UI fans out, and because `TEST_MATRIX.md` §&nbsp;3 currently holds ten
placeholder rows waiting for exactly this. **Every scenario below carries an id** (`RV-…`,
`PB-…`, `ED-…`); copy the id into the test matrix so a scenario and its test can be traced to
each other in both directions.

Scope note: wave 1 ships the contract (`src/contract`), the recorder, the frame producer, the
playback transport and a **minimal** renderer plus a dev shell (`src/dev/main.ts`). Every row
below is marked with what wave 1 already satisfies, so wave 2 knows precisely what is left.
`✅ w1` means the behaviour exists and is tested today; `🔲 w2` means it is specified here and
not built.

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
| RV-02 | happy | Change dispatcher, press Run again | New run replaces the old; previous run's seed preserved so the two are comparable | 🔲 w2 |
| RV-03 | happy | Deep link with all parameters in the URL | Loads and runs without further input | 🔲 w2 |
| RV-04 | alternate | Blank seed | A seed is drawn, **shown**, and the field is populated so the run is reproducible | ✅ w1 |
| RV-05 | alternate | Explicit seed reused | Byte-identical picture to the earlier run with that seed | ✅ w1 (proved in `replay.test.ts`) |
| RV-06 | alternate | Building with multiple banks | Banks are visually grouped and labelled; a bank filter is offered | 🔲 w2 |
| RV-07 | alternate | Building with sky lobbies (`mixed-use-high-rise`) | Transfer floors marked; a transferring passenger is not double-counted in the waiting total | 🔲 w2 |
| RV-08 | alternate | Access-restricted floors (`secure-tower`) | Restricted landings marked; a call no car may serve is shown as unassignable, not as a long wait | 🔲 w2 |
| RV-09 | alternate | 60+ floor building (`vertical-city`) | Floor labels thin out rather than overlap; every floor still has a row | 🔲 w2 |
| RV-10 | edge | Single-car bank | Layout does not collapse; the one shaft is centred | ✅ w1 (`layout.test.ts`) |
| RV-11 | edge | Zero-population building / no demand generated | "No passengers were generated" empty state, not an empty chart | 🔲 w2 |
| RV-12 | edge | Run with zero-length window (`startedAt == endedAt`) | Progress is 0, scrub disabled, no division by zero | ✅ w1 (`Playback.progress`) |
| RV-13 | edge | A car never leaves its home floor | Drawn parked at its start height, not omitted | ✅ w1 (`recordRun.test.ts` start-position guard + `frameAt.test.ts`, over **every** shipped building) |
| RV-14 | edge | Load factor above 1 (overload alarm at 1.1) | Rendered in the overload colour and labelled; the bar does not silently clip at 1 | 🔲 w2 |
| RV-15 | failure | Conservation audit fails (`SimulationError`) | Full-width error with the message and the seed; **no partial building drawn** | ✅ w1 (status line) |
| RV-16 | failure | Drain deadline fires with passengers in the system | Reported as `timed-out` with the undelivered count; not shown as a completed run | ✅ w1 (status line leads with the status and the undelivered count; the canvas banner is still w2) |
| RV-17 | failure | `data/` fetch fails (404 / offline) | "Could not load data" with the failing path and a Retry control | ✅ w1 (message only; no Retry) |
| RV-18 | failure | Malformed building JSON (`ConfigError`) | Every issue listed with its file and JSON path — `ConfigError` reports all of them at once, so the UI must not show only the first | 🔲 w2 |
| RV-19 | failure | Browser has no 2D canvas context | Explains the situation in text; does not throw into the console | ✅ w1 |
| RV-20 | recovery | After RV-15/RV-16/RV-18, change one input and re-run | Error clears; previous inputs are preserved, not reset | 🔲 w2 |
| RV-21 | recovery | After RV-17, press Retry | Refetches without a page reload | 🔲 w2 |

### A.3 States

| State | Must show | Must not show |
|---|---|---|
| **Empty** (nothing selected) | What this view is for; the controls that need choosing; a "run a sample" affordance for the Newcomer | An empty canvas with no explanation |
| **Loading data** | That `data/` is being fetched | A spinner with no label |
| **Simulating** | That a run is in progress and that it takes ~a second; the parameters being run | A frozen UI with no feedback — the simulation is synchronous and *will* block the main thread until wave 2 moves it to a worker |
| **Success** | Building, dispatcher, traffic, seed, clock, speed, counters, per-car status, legend | An AWT when `awtIsValid` is false |
| **Error** | What failed, the seed, and what to change | A partially drawn building |
| **Saturated** | Persistent banner, undelivered count, suppression reason | A mean waiting time |

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
| PB-07 | alternate | Load a recording from a file rather than re-simulating | Same picture; schema version checked first | 🔲 w2 — the check goes **with** the load path; `isSupportedRecording` was deleted rather than shipped guarding nothing (see `src/index.ts`) |
| PB-08 | alternate | Step one frame while paused | Advances exactly one display frame | 🔲 w2 |
| PB-09 | alternate | Window selection then loop | Only the selected span repeats | 🔲 w2 |
| PB-10 | edge | Seek before `startedAt` / after `endedAt` | Clamps; never extrapolates | ✅ w1 |
| PB-11 | edge | Speed set to the extremes | ×0.05 and ×1000 accepted; outside that range refused with a message | ✅ w1 |
| PB-12 | edge | Tab hidden, then restored (rAF stops firing) | The playhead reflects **elapsed display time**, so it resumes at the right instant rather than replaying the gap | ✅ w1 (anchored mapping) |
| PB-13 | edge | High-refresh (144 Hz) vs 60 Hz display | Same simulated instants reached at the same wall-clock time; frame rate does not change the run | ✅ w1 (`mapping.test` frame-rate independence) |
| PB-14 | edge | Very long run (drain tail of an hour) | Scrub resolution stays usable; frame budget is bounded, and a run over the ceiling is **refused, not clipped** | ✅ w1 (`frameTimes` throws; `truncate: true` is the explicit opt-in) |
| PB-15 | failure | Recording schema version newer than the viewer | "This recording was made by a newer viewer" — not a crash and not a wrong picture | 🔲 w2. `VIZ_SCHEMA_VERSION` is stamped on every recording and is at **2**; nothing reads it yet, and nothing in wave 1 could |
| PB-16 | failure | Seed does not reproduce the stored recording | Explicit mismatch report naming both fingerprints; **must not silently show the new run** | 🔲 w2 |
| PB-17 | failure | Corrupt recording file (truncated JSON) | Parse error with the byte offset; the previous run stays on screen | 🔲 w2 |
| PB-18 | recovery | After PB-15/16/17 | Load a different recording without a page reload | 🔲 w2 |

### B.3 States

| State | Must show | Must not show |
|---|---|---|
| **Empty** (no recording) | Transport disabled and visibly so | Enabled controls that do nothing |
| **Loading** (simulating or fetching) | Progress or at least an indeterminate state with a label | A dead transport with no explanation |
| **Playing / paused / ended** | Which of the three it is, the clock, the elapsed fraction | "Playing" while the playhead is pinned at the end |
| **Error** | What failed and which recording | A stale playhead moving over a recording that failed to load |

---

## 4. Surface C — Building editor

Edits `data/buildings/*.json` against the **existing** schema, which already validates
(`buildingConfigSchema`, `resolveBuilding`). The editor adds no new schema.

### C.1 Tasks and success conditions

| Id | Task | Success condition |
|---|---|---|
| ED-T1 | Add, remove and reorder floors | Heights and indices stay consistent; the shaft picture updates live |
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
| ED-01 | happy | Load a shipped building, change a floor height, see the picture update | Live preview; no run needed | 🔲 w2 |
| ED-02 | happy | Add a car to an existing bank | Appears as a new shaft immediately | 🔲 w2 |
| ED-03 | happy | Change a car's elevator class | Speed/capacity/door timings update from the spec | 🔲 w2 |
| ED-04 | happy | Save and run | Viewer opens on the edited building | 🔲 w2 |
| ED-05 | alternate | Start from a blank building | A minimum viable building (one bank, one car, two floors) is offered | 🔲 w2 |
| ED-06 | alternate | Import a JSON file | Validated on import; issues shown before anything is applied | 🔲 w2 |
| ED-07 | alternate | Floor range covering 40 floors | Expansion previewed; `MAX_FLOORS_PER_RANGE` enforced with a clear message | 🔲 w2 |
| ED-08 | alternate | Two banks with overlapping served floors | Both drawn; overlap is legal and not flagged as an error | 🔲 w2 |
| ED-09 | edge | Duplicate floor id | Rejected at the field, naming the other floor | 🔲 w2 |
| ED-10 | edge | Non-monotonic heights (floor 5 below floor 4) | Rejected, with both values shown | 🔲 w2 |
| ED-11 | edge | Negative heights (basements) | Accepted — basements are legal — and drawn below the datum | ✅ w1 (layout handles negative heights) |
| ED-12 | edge | Bank with zero cars | Warning, not an error; the run will simply have no service there | 🔲 w2 |
| ED-13 | edge | Car serving a floor its bank does not | Rejected, citing the cross-reference check | 🔲 w2 |
| ED-14 | edge | Access zone naming a floor that does not exist | Rejected, naming the unknown floor | 🔲 w2 |
| ED-15 | edge | Building with no entrance floor | Warning: incoming traffic has nowhere to originate | 🔲 w2 |
| ED-16 | edge | Population declared inconsistently with the sum of floors | The sum wins (as `resolveBuilding` does); the discrepancy is shown, not hidden | 🔲 w2 |
| ED-17 | edge | `doubleDeck: true` | Surfaced as **not simulated as paired** — the open item in `docs/07-handoff.md` — rather than silently accepted | 🔲 w2 |
| ED-18 | failure | Invalid JSON pasted | Parse error with position; the editor state is not lost | 🔲 w2 |
| ED-19 | failure | Save fails (no filesystem access in the browser) | Falls back to download; says so before the user commits to a long edit | 🔲 w2 |
| ED-20 | failure | Schema rejects the whole document | Every issue at once — `ConfigError` collects them deliberately, so showing only the first would be a regression against the loader's own contract | 🔲 w2 |
| ED-21 | recovery | Undo / redo an edit | At least 20 steps; keyboard-driven | 🔲 w2 |
| ED-22 | recovery | Discard all changes | Confirmed once, then back to the loaded document | 🔲 w2 |
| ED-23 | recovery | Leaving with unsaved edits | Warned before navigation | 🔲 w2 |

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
| KB-01 | ⛔ Every control reachable by <kbd>Tab</kbd> in visual order | 🔲 w2 |
| KB-02 | ⛔ Focus ring always visible; never removed without a replacement | ✅ w1 (`:focus-visible` in `index.html`) |
| KB-03 | <kbd>Space</kbd> toggles play/pause when focus is not in a text field | ✅ w1 |
| KB-04 | <kbd>←</kbd>/<kbd>→</kbd> seek ∓5 simulated seconds; with <kbd>Shift</kbd>, ∓60 | ✅ w1 |
| KB-05 | <kbd>Home</kbd>/<kbd>End</kbd> jump to the start / end of the run | ✅ w1 (Home only) |
| KB-06 | <kbd>,</kbd>/<kbd>.</kbd> step one display frame back / forward while paused | 🔲 w2 |
| KB-07 | <kbd>[</kbd>/<kbd>]</kbd> step down / up the speed ladder | 🔲 w2 |
| KB-08 | ⛔ Typing in the seed or any editor field never triggers a shortcut | ✅ w1 |
| KB-09 | The scrub range responds to arrow keys as a native `<input type=range>` | ✅ w1 |
| KB-10 | ⛔ Focus is not stolen by the animation loop — the scrub position updates only while it is unfocused | ✅ w1 |
| KB-11 | ⛔ After an error, focus moves to the error message so a screen reader announces it | 🔲 w2 |
| KB-12 | Modal dialogs (discard, overwrite) trap focus and restore it on close | 🔲 w2 |
| KB-13 | ⛔ Canvas is not a focus trap; it exposes a text alternative summarising the current frame | 🔲 w2 |
| KB-14 | ⛔ `prefers-reduced-motion` respected: playback still works, but nothing animates that is not the simulation itself | 🔲 w2 |
| KB-15 | Colour is never the only signal — **direction** carries a ▲/▼ glyph | ✅ w1 |
| KB-15a | …and so does **door state**, which today is a fill-width gap only | 🔲 w2 |
| KB-15b | …and so does **overload**, which today is `theme.carHeavy` and nothing else — and fires at load factor 0.8, not at the 1.1 alarm | 🔲 w2 (with RV-14) |

---

## 6. Responsive expectations

| Id | Viewport | Expectation | Wave |
|---|---|---|---|
| RS-01 | ≥ 1280 px wide | Full layout: all shafts, floor labels, landing counts, per-car status | ✅ w1 |
| RS-02 | 768–1279 px | Per-car status list collapses; shafts and landings stay | 🔲 w2 |
| RS-03 | < 768 px | Controls stack; the canvas keeps at least 60% of the height | 🔲 w2 |
| RS-04 | Short viewport (< 500 px tall) | Floor rows thin out by label, never by dropping shafts | 🔲 w2 |
| RS-05 | More shafts than fit | Horizontal scroll **or** a bank filter — never silently truncated | 🔲 w2 (CLI's `watch` says "showing N of M"; the viewer must too) |
| RS-06 | Window resize during playback | Relayout without pausing or jumping the playhead | ✅ w1 (layout is rebuilt per frame) |
| RS-07 | `devicePixelRatio` 2 or 3 | Crisp lines and text, not a scaled bitmap | ✅ w1 |
| RS-08 | Print / screenshot | The current frame is exportable as PNG with its seed and clock burned in | 🔲 w2 |

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
bumps the version to 3. The full reasoning is in `packages/viz/DECISIONS-T8.md`.
