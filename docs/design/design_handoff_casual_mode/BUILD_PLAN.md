# Build plan — Everyday Mode

Ordered work, mapped to real files in `mrpeanut01/elevator-sim@main`. Each item states the change,
the seam it lands on, and the check that proves it. Section references like §20.1 point at
`GAMEPLAY_AND_NAVIGATION.md`; contract references at `ENGINE_CONTRACT.md`.

**Before touching a seam, read it.** The paths and exports below were read from the repo tree and
symbol search; the internals were not. Where this plan and the code disagree about how a seam
works, the code wins and this plan is what needs correcting.

---

## 0. What already exists

Everyday Mode is not a greenfield build. The repo already carries most of its seams:

| Concern | Where it lives |
|---|---|
| Casual report figures, levers, small print | `packages/viz/src/mode/casualDay.ts` (`CASUAL_FIGURE_ORDER`, `casualFigureOrderOf`, `casualNoteFor`, `CASUAL_LEVERS_HEADING`, `CASUAL_SMALL_PRINT_LEAD`, `CASUAL_REACH_NOTE`) |
| Basic/advanced disclosure, suppression copy | `packages/viz/src/mode/disclosure.ts` (`BASIC_HIDES`, `SUPPRESSION_LEAD`, `suppressionLeadFor`, `NO_AVERAGE_LEAD`, `suppressionBannerFor`, `disclosureItems`), `mode/types.ts` (`VIEW_MODES`, `DisclosureItem`, `renderingIn`) |
| Plain-language glossary | `packages/viz/src/mode/glossary.ts` (`GLOSSARY_TERMS`, `glossaryPlain`, `glossaryFor`) |
| Basic/advanced parity enforcement | `packages/viz/src/mode/parity.ts` (`parityViolations`, `parityRefusal`) |
| Menus, boards, account, challenge | `packages/viz/src/menu/` — `screens.ts`, `menu.ts`, `account.ts`, `boardRun.ts`, `challenge.ts`, `client.ts`, `catalogue.ts`, `partsOfDay.ts`, `types.ts` |
| Shell chrome, rail, editors | `packages/viz/src/dev/` — `main.ts`, `menuPanel.ts`, `leftRail.ts`, `dispatcherEditor.ts`, `buildingEditor.ts`, `machinesEditor.ts`, `campaignPanel.ts`, `batchPanel.ts`, `elementMap.ts`, `motion.ts` |
| Campaign judging, fail states, brief | `packages/viz/src/campaign/` — `judge.ts`, `failStates.ts`, `brief.ts`, `stageRun.ts`, `dimensions.ts`, `words.ts`, `parse.ts` |
| Shop, budget, refusals | `packages/viz/src/commissioning/` — `budget.test.ts`, `building.ts`, `choices.ts`, `refusals.ts`, `types.ts` |
| The bench: batches, reports, intervals | `packages/viz/src/batch/` — `runBatch.ts`, `report.ts`, `intervalPlot.ts`, `types.ts` |
| Live run surfaces | `packages/viz/src/live/` — `bands.ts`, `decisions.ts`, `observations.ts`, `timeline.ts`, `honesty.ts` |
| Replay frames and overlays | `packages/viz/src/frame/` — `frameAt.ts`, `overlay.ts`, `pinnedQueue.ts`, `sequence.ts` |
| Building/dispatcher/machine authoring | `packages/viz/src/authoring/` — `buildingSpec.ts`, `dispatcherSpec.ts`, `machineSpec.ts`, `patternSpec.ts`, `selectorSpec.ts` |
| Access groups, zoning | `packages/viz/src/access/` — `zoning.ts`, `lockedOut.ts`, `dispatcherCredentials.ts` |
| Honesty sweep | `packages/viz/src/honesty/` — `surfaces.ts`, `properties.ts`, `run.ts`, `generate.ts`, `faults.ts`, `derive.test.ts` |
| Weights, cost terms, constraints | `packages/core/src/dispatch/` — `parameters.ts` (`DISPATCH_PARAMETERS`, `DISPATCH_DEFAULTS`, `dispatchParameter`), `terms/`, `types.ts`, `policy.ts`, `selector.ts`, `normalize.ts` |
| Crowds, sim, seeds, metrics | `packages/core/src/traffic/`, `sim/`, `random/`, `metrics/`, `physics/`, `analytical/` |
| Buildings and profiles | `data/buildings/*.json`, `data/traffic-profiles.json`, `data/dispatcher-profiles.json`, `data/campaign.json`, `data/elevator-specs.json` |

**Two things do not exist yet and are the bulk of the work:** the intervention record (§7.6) and
spectator mode (§14.1). Everything else is wiring, correcting or presenting what is already there.

---

## 1. Order of work

Ten slices, each shippable on its own, in dependency order. Do not reorder 1–3; they are what
everything else reads.

### Slice 1 — One weight vector (§20.1)

The prototype has four plain levers that reach the sim and thirteen cost terms that do not. They
must be one model: **the thirteen terms are the truth, the four levers are named views onto
them.**

- The terms already exist as `weights.<id>` rows in `DISPATCH_PARAMETERS`
  (`packages/core/src/dispatch/parameters.ts`) with ranges and defaults. Do not invent a parallel
  list in the UI.
- Each lever writes its owned terms; moving a term updates the lever that owns it. Mapping in
  §20.1.
- The *show me the maths* line prints the compiled cost expression from the same vector.

**Check:** open the maths line, move a lever, the printed expression changes; open the thirteen
and the numbers agree. `parityViolations` reports nothing new.

### Slice 2 — Plain names live in `core` (§16 rule 11, issue #147)

- Add a player-facing **name** and **one-clause effect** beside each parameter, cost term and hard
  constraint in `packages/core/src/dispatch/parameters.ts` / `terms/` / `types.ts` — a second
  field beside the existing optimizer-facing description, not a replacement for it.
- Everyday surfaces read those fields. `glossaryPlain` in `mode/glossary.ts` is the existing seam
  for plain language; extend it rather than adding a lookup table in a screen.
- Keep the honest fallback: a constraint with no player-facing name renders *a filter no weight
  can buy past* plus its id.

**Check:** grep the Everyday bundle for engine identifiers and find none. Add a test that every
`DISPATCH_PARAMETERS` row a Casual surface can reach has a player-facing name — the same shape as
the existing coverage test in `dispatch/parameters.test.ts`.

### Slice 3 — The run record and interventions (§7.6, contract §1.4, issues #116/#96)

The largest single change, and the one that turns the stage from a movie into a game.

```
run = { seed, config, interventions: [ { atS, change } ] }
```

- An intervention appends to the log and **re-simulates from t = 0**, resuming playback at the
  same playhead. The prefix is bit-identical, so the picture does not jump.
- Budget is known: 181 ms / 828 ms / 1,521 ms a run on Garden Apartments / Midtown Office /
  Vertical City; 100 runs in 4.3 s warm. Re-simulate synchronously under ~400 ms, otherwise show
  a `recomputing` beat.
- Start with **one** intervention: *park the cars in the lobby*. Then dispatcher switching. The
  campaign incident answer (§7.5) is already this shape and becomes the third case.
- Replay verification replays the log too, so nothing about posting honesty changes.
- `packages/viz/src/frame/` (`frameAt.ts`, `sequence.ts`) and `packages/viz/src/live/timeline.ts`
  are the seams for playhead and frame addressing.

**Check:** intervene at 09:14 — every figure before 09:14 is identical, every figure after it
changes. Re-running the same record twice produces identical metrics.

### Slice 4 — Wire the controls that lie (§20.2, §20.3, §20.4)

Each of these renders today and reaches nothing:

- **Rules** (`ruleList`) — compile each row to a conditional adjustment of the vector or a
  behaviour flag, top to bottom, first match wins, fallback to the style's own vector.
- **Flags and group levers** — `pool`, `sensor`, `park` must affect the sim.
- **Traffic-pattern switching** — the detector must classify the last *judge* seconds and honour
  *hold* and *margin*; under *one setting all shift* it must not be built at all.
- **The ghost picker** — `reset()` ignores `ghostId` and always runs Steady hand. Wire all five,
  including `none` (no second sim, no lines, no band, no verdict).

**Check:** a rule holding two cars at the lobby above a queue of 12 visibly parks a car; the
stage header names the detected pattern and it changes at noon; picking *nobody* leaves one line
and no verdict.

### Slice 5 — Score the campaign day for real (§20.6)

- Evaluate the four tests at close from the run: away, worst wait, peak lobby queue, trips
  (contract §7). Derive cleared/missed from them — `packages/viz/src/campaign/judge.ts` is the
  seam.
- The "was" figures beside each test read this building's **previous day**, not constants.
- `testsCount` must be derived or `—`.

**Check:** a day that peaks the lobby at 26 against a cap of 25 is missed, and the calendar draws
an ×.

### Slice 6 — Fix a building and the designer run the engine (§20.7)

- Replace `fixPct` / `restDelta` with **paired runs**: as-built versus as-specified on the same
  crowd. Keep the three pass conditions and the four outcome copies exactly — they are correct,
  only their inputs are fake.
- The designer's interval and handling capacity may stay analytic (contract §10) but must be
  computed by the same code the engine uses to size a group —
  `packages/core/src/analytical/` and `packages/viz/src/authoring/buildingSpec.ts`.
- Delete the dead diagnosis quiz (`fixGuess` and the candidate list, §20.9); keep `options` in the
  data as the source of the diagnosis line.

**Check:** the before/after rows on a passed case match a fresh run of the same configuration;
nothing on the fix screen is clickable except repairs, the editor and the primary.

### Slice 7 — One bench (§20.8)

- Keep the suite (field × tests × reps) and render the pairwise interval and verdict **only when
  the field is exactly two**. Delete the legacy pairwise panel.
- `reps` must change the result; the interval comes from paired runs, not a constant.
  `packages/viz/src/batch/runBatch.ts` and `intervalPlot.ts` already do this work — the Casual
  screen should consume them rather than reimplement.
- The eight tests are the same fixtures as the gauntlet's forty (contract §12.3).

**Check:** 10 reps and 200 reps give visibly different interval widths; the verdict says *too
close to call* when the interval contains zero.

### Slice 8 — Spectator mode (§14.1, contract §1.5)

- `Watch it` on a board row fetches that run's record and replays it. Not a re-run with the
  viewer's current dispatcher — that is what the prototype does, and it makes the header's figures
  and the picture disagree.
- Every surface in §14.1's table branches: ink header, their name and posted result, the
  verified-replay pill, no timeline, no verdict, no first-person copy, `Play this crowd yourself`.
- Interventions are **disabled** while watching; playback controls are not interventions.
- A row whose record does not reproduce its posted metrics loses its button rather than replaying
  something approximate.
- `packages/viz/src/menu/boardRun.ts` is the seam for a board row as a run.

**Check:** the string `you` appears nowhere on screen while watching; a watched run's away figure
at 19:00 equals the figure on its board row.

### Slice 9 — The gauntlet, and the boards (§20.10, §14, contract §12)

- `Send it through the gauntlet` must require a saved dispatcher, run the forty cases with
  progress in place, and land on the ladder with the new rating and case count.
- Board keys: **one board a day; no player-settable parameter in a board key** (contract §12.1).
  Arbitrary configurations post to a personal-record log.
- `How did they do it` — a board row expands to the dispatcher behind it and offers *load it into
  the workshop as a copy*.
- `Race this run` — a board row becomes a fifth ghost option.
- The ladder's `What are the forty?` panel is generated from the **same fixture list** the bench
  and gauntlet use (contract §12.3), not a second copy of the names.

**Check:** a dirty dispatcher cannot be sent and the button says why; the panel's eight buildings
are the batch fixtures.

### Slice 10 — Honesty, fixtures and the API-absent state (§20.11, §20.13)

- The sweep enumerates states **from the state model** (§18): every combination of *day not
  closed · replay · sandbox · noPost* across Your week, the board, the ladder, the percentile line
  and the report. `packages/viz/src/honesty/properties.ts` and `surfaces.ts` are where this lives;
  `generate.ts` is where enumeration belongs.
- Every authored fixture gets a real source or an explicit `FIXTURE` marker: `contractDays`,
  `weekDays`, `doorBoardRows`, `boardRows`, `ladderRows`, `styleSplit`, `RUSH_BESTS`, `doorStats`,
  both histograms, the report's beats.
- Reference runs are labelled everywhere and never presented as players.
- Every screen renders with the API unreachable: world figures degrade to a labelled *world
  figures unavailable* state (issue #123).

**Check:** a state a player can reach cannot be a state the sweep has never seen; with the network
off, no screen shows a zero where it means "unknown".

---

## 2. Cross-cutting rules for every slice

These are not a slice; they apply to all of them.

1. **Derive, never assert.** `cleared = day − 1 − missed`. Counts come from the rendered list.
   Statuses come from `missed` vs the difficulty's allowance.
2. **`—` for anything unfinished.** `dayClosed` is set by *Close the day* alone.
3. **Unaffordable is visible, dimmed, inert, and says what it is short by.**
4. **A control that cannot act now says so** and offers the re-run.
5. **A disclosure announces its contents, persists per player, and is never the only route** to a
   surface (issue #130).
6. **A formula appears only where every symbol in it is named**, behind a disclosure, after the
   plain sentence, with its signs explained (issue #146).
7. **One day record narrates the brief, the stage, the report and the calendar.**
8. **The prototype's copy is the copy.** If a sentence needs to change, change it in the spec too
   (§21) — a number in the docs that disagrees with the build is a defect of the same class as two
   numbers disagreeing on one screen.

---

## 3. Small corrections worth doing early

Cheap, and each removes a lie:

- The rail's `DESIGN` group is *Dispatcher workshop · Test bench · Design a building*. **Tune the
  tower is not a rail item** — it is reached from the brief and the report only.
- The two boards are **one rail item** (`Boards & ladder`), highlighted for either tab.
- **Settings is its own screen** (§15.1), reached from the rail, drawn as a bordered row with a
  gear icon. The menu holds nothing but the four mode cards and the primary.
- The stage enters **paused** at 06:00; **speed resets to the player's default** each run and is
  never inherited across days.
- Speed labels come from the same array the loop multiplies by, so `12×` cannot mean something
  else.
- `runIncidentClock` is the simulated time the answer was given, and it appears on the report.
- The `Sound` setting has nothing behind it: give it doors, chimes and lobby murmur, or remove the
  row.
- The rush ends when **forty people have been standing over two minutes at once**, not when forty
  people are standing (§20.5).
- The rush result screen is its own (§9.3) and branches on whether the hold line was crossed; it
  must never fall through to the daily report.

---

## 4. Testing posture

The repo's existing instruments are the right ones — extend, do not invent:

- `packages/viz/src/mode/parity.test.ts` — basic/advanced parity. Every new Casual surface should
  be covered by it.
- `packages/viz/src/honesty/*` — the sweep. Slice 10 changes how it enumerates.
- `packages/core/src/dispatch/parameters.test.ts` — parameter coverage. Slice 2 adds a
  player-facing-name assertion in the same shape.
- `packages/viz/src/batch/*` — the bench's own tests are the reference for paired-run statistics.
- `packages/viz/src/dev/*.browser.test.ts` — shell, menu, keyboard and exit behaviour. The bar
  table in §3.3 is directly testable here: for each screen, assert the left button, the back
  button, the timeline and the primary.

Two failure modes cost a full cycle each while prototyping, and both are cheap to guard:

- **Declaration order.** The campaign group must be computed before anything reads it; a `const`
  read above its declaration is a temporal-dead-zone `ReferenceError` and the whole app goes
  blank.
- **Duplicate declarations.** A duplicate `const` in one scope is a hard `SyntaxError`.

---

## 5. Suggested PR slicing

One PR per slice, in order, each with its acceptance check in the description. Slices 1–3 are
sequential. 4 depends on 1 and 3. 5, 6, 7 are independent of each other once 1 is in. 8 depends
on 3. 9 depends on 7 and 8. 10 last, because it enumerates what the others built.

Keep the four handoff documents updated in the same PR that changes the behaviour they describe.
