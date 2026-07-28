# Decisions — T11, Phase 4 wave 2

Decisions taken while completing Phase 4 (building editor, live metrics overlay, the UX cycle).
`DECISIONS.md` at the repository root is not mine to edit; these belong there and are recorded
here so the orchestrator can lift them.

---

## T11-1 — `VIZ_SCHEMA_VERSION` 2 → 3: `VizRecording.legs`

**Decision.** The recording grows one field, `legs: readonly VizLeg[]` — seven columns of
`PassengerRecord`: `passengerId`, `originFloorId`, `direction`, `arrivedAt`, `boardedAt?`,
`carId?`, `bankId?`. The version goes to **3**.

**Why now and not in wave 1.** `DECISIONS.md` D15 reserved exactly this change and made one
condition: it lands **with its first consumer**, because a configurable, unit-tested field with no
reader is the defect this repository has shipped eight times. Wave 2 is that wave. Both consumers
are in the same commit:

| Consumer | Reads | Row it makes reachable |
|---|---|---|
| `frame/overlay.ts` `overlayAt` | `arrivedAt`, `boardedAt`, `bankId` | the windowed figures of the live metrics overlay |
| `frame/overlay.ts` `landingAssignmentsAt` | `originFloorId`, `direction`, `arrivedAt`, `boardedAt`, `carId`, `bankId` | `RV-T3` — hovering a landing names the car that answers it, *from the record* |

`passengerId` is the tie-break that makes the array's order total; its consumer is the sort in
`describeLegs` and the ordering assertion in `recordRun.test.ts`.

**What was deliberately left out.** `massKg`, `journeyId`, `legIndex`, `credentialGroup`,
`destinationFloorId` and `alightedAt` are all on `PassengerRecord` and none is copied. Nothing here
reads them. Copying them "while we are in there" is how a contract acquires six fields and one
consumer.

**Why the fold was not replaced.** `VizProgress` stays. The two projections are built by different
code from the same passengers, and `recordRun.test.ts` compares them — agreement is evidence, and
would be unavailable if one were derived from the other.

**Consequence for `PB-15`.** Version 2 recordings are now genuinely unreadable by this build: they
have no `legs`, and the overlay would report an empty window on them rather than fail. That is why
`readRecordingDocument` refuses an *older* version as well as a newer one, which is the first time
the constant has had a reader that could disagree with it (D16's condition).

---

## T11-2 — the overlay suppresses estimates and keeps observations

**Decision.** `OverlayMetrics` splits its fields in two and suppresses only one half when
`recording.summary` says the run saturated:

| Kind | Fields | Suppressed? |
|---|---|---|
| Observation | `waitingNow`, `longestCurrentWaitS`, `boardedInWindow`, per-bank `boardedInWindow` | **no** |
| Estimate | `rollingMeanWaitS`, per-bank `meanWaitS` | **yes**, replaced by the reason |

**Why.** `CLAUDE.md` forbids reporting a mean for a system whose queues grow without bound, and a
*moving* line is more persuasive than a table, so the rule binds here harder than in the CLI. But
suppressing the counts as well would remove the only thing that lets a reader **see** the
divergence — on `midtown-office` the queue climbs to 140 people at a landing, and that number is an
observation about the recording, not an estimate of a steady state.

`suppressed` is copied from `summary.saturated || !summary.awtIsValid`, never recomputed. `UX.md`
§ 7.1 rule 4.

**Measured, not assumed.** At the shipped traffic rates over 900 s: `midtown-office`,
`mixed-use-high-rise` and `vertical-city` saturate; `garden-apartments` and `secure-tower` do not.
`frame/overlay.test.ts` asserts suppression on the first group and **reports the mean** on the
second — a suppression rule that fired everywhere would be indistinguishable from a module that
computes nothing.

**Not added:** a windowed `WT95`. A 95th percentile over a 300-second window of ~20 legs is not a
figure this project should draw, and adding it would have been the easy half of the same decision.

---

## T11-3 — three new modules, and why they are not in three new directories

**Decision.** `overlayAt` lives in `frame/overlay.ts`; the recording load path lives in
`record/document.ts`; the editor's four pure modules are **flat files at `packages/viz/src/`**
(`editorEdits.ts`, `editorValidate.ts`, `editorHistory.ts`, `editorPreview.ts`).

**Why.** They were written as `metrics/`, `recording/` and `editor/`, and `core`'s
`sim/moduleTree.test.ts` went red: it compares every source directory under `packages/*/src`, at
any depth, against the module tree in `docs/01-architecture.md`, **in both directions**. A new
directory here needs a line in that doc, and `docs/` is not this task's to edit.

Two of the three moves are homes rather than compromises — `overlayAt` is a pure
`(recording, t) → …` producer exactly like `frameAt`, and reading a recording belongs beside
writing one. The editor is the compromise.

**Handback.** `docs/01-architecture.md` should gain `viz/editor/` under `viz/`, and the four
`editor*.ts` files should move into it in the same change. Nothing else needs to move.

---

## T11-4 — the boundaries grep is about code, not about prose

**Decision.** `boundaries.test.ts` now strips **string literals** as well as comments before
applying the DOM rule, using a character scanner; template-literal `${…}` substitutions survive
because they are code. Two positive controls were added.

**Why.** The viewer prints `the document is not a JSON object` and draws
`showing 6 of 12 shafts — widen the window`, and under a raw grep for `\bdocument\b` / `\bwindow\b`
both are DOM access in modules that have none. The cheap fix — matching only `document.` and
`window.` — is the wrong one: it stops catching a bare `document` used as a value, which is exactly
the shape of the one **real** finding this rule produced (a method parameter named `document`,
shadowing the global, in what is now `editorHistory.ts`).

The rule's teeth are now asserted rather than assumed: `dev/main.ts` and `dev/editor.ts` genuinely
touch the DOM and **must still trip the pattern after stripping**. That control caught the first,
regex-based version of the stripper, which anchored on any `}` in the file and silenced
`dev/main.ts` entirely.

---

## T11-5 — the editor never renders a second opinion about legality

**Decision.** `editorValidate.ts` reports issues from `parseBuilding` / `resolveBuilding` and
computes none of its own. It reports **every** issue of the furthest stage reached, and says when
that stage was not the last one.

**Why the stage matters.** A document that fails the schema never reaches cross-referencing, so
schema issues and cross-reference issues cannot both be collected in one pass. The honest report is
"here is everything this stage found, and there may be more once these are fixed" — a list of five
that silently *becomes a different five* after a fix is `ED-20`'s defect with better manners.

`ED-T8`'s guarantee — one control from a valid edit to a run — holds because "valid" means
`resolveBuilding` accepted it, and the run uses the same call (`resolveEdited` in `dev/data.ts`).

---

## T11-6 — the load bar's track is scaled past 1

**Decision.** `loadTrackMax` returns `max(1.1, max loadFactor)`, and the panel draws a full mark at
`1.0` inside that track. Four colour bands: `< 0.5`, `< 0.8`, `≥ 0.8` (the fill rule), `≥ 1.1` (the
alarm), the last always accompanied by a `!` glyph.

**Why.** `RV-14` says the bar must not silently clip at 1, and `D18` recorded that the old renderer
changed colour at 0.8 — the 80 % *fill rule* — while calling it the overload state. They are
different facts about a car and now have different thresholds, different colours and, for the
alarm, a non-colour signal.

---

## T11-7 — four things found by running the UI, not by reading it

Recorded because each is the kind of defect a green suite does not see, and each now has a test.

1. **The landing selector was populated once, at `startedAt`**, where nobody is waiting — so it
   offered exactly one option for the whole run and `RV-T3` was unreachable through the shipped UI.
   Its "has the option set changed?" key started at `''`, which is also the key of an *empty* set.
2. **Floor labels overflowed the gutter.** `vertical-city` names floors `Zone 5 hotel`; right-
   aligned text loses its *start* when it overflows, so the identifying half vanished off the
   canvas. `fitLabel` now clips to the gutter.
3. **Forced reference labels collided with strided ones.** Thinning kept every sky lobby and then
   drew it on top of its neighbour. The rule now reserves room both behind and ahead.
4. **The overlay panel overran its box.** On `vertical-city` (7 banks) the bank list pushed the
   car-load section — the one carrying the overload alarm — off the bottom; on `midtown-office` the
   8-line suppression reason did the same. Both lists are now bounded, both say what they left out,
   and the reason is capped at a third of the room available.

A fifth and a sixth, in the same class:

5. **The import applied an invalid document.** `ED-06` says issues are shown *before* anything is
   applied; a file naming an unknown elevator class and two floors that do not exist silently
   replaced the open building, because the *schema* had accepted it. It now lists the issues and
   asks, with an affirmative button that says what it does.
6. **The confirm dialog could hang.** The promise behind it waited on `<dialog>`'s `close` event,
   and in the automation context this was driven through, a form submit closed the dialog and set
   `returnValue` **without firing `close`** — so Discard, Import and Open-another silently did
   nothing. It now settles on whichever of `close` / `cancel` / either button arrives first,
   latched so it settles once. Environment-specific in origin; the fix is not.

## Handed back — things T11 could not change

- **`docs/01-architecture.md` § Module layout** should gain `viz/editor/` under `viz/`, after which
  `editorEdits.ts`, `editorValidate.ts`, `editorHistory.ts` and `editorPreview.ts` move into it.
  See T11-3. `core`'s `sim/moduleTree.test.ts` enforces the doc in both directions, which is why
  the four files are flat today.
- **`docs/05-roadmap.md` § Phase 4** carries the per-bullet table (`⬜ not built` for the editor,
  `⚠️ half` for the overlay). Both bullets are now built; the table and the phase verdict are the
  orchestrator's to update.
- **`DECISIONS.md`** — the eight entries above.
- **`TEST_MATRIX.md` § 3** holds ten placeholder rows waiting for `UX.md`'s ids. Eighty-seven ids
  now carry a state and a means of verification (`UX.md` § 7.0); copying them across is a
  mechanical job outside this task's files.
- **`ED-12` is a `core` question.** The row wants a zero-car bank to be a *warning*;
  `bankConfigSchema` makes it an error (`a bank must have at least one car`). Whoever owns the
  schema should decide which is right — the editor must not be the place the two disagree.

## T11-8 — three things the mutation harness found that reading would not have

Forty-six mutations, each replacing one rendered value with a constant. Four survived the first
pass and one the second; every one was a real gap, and the third is the interesting one.

1. **The rolling mean could be the constant `12`** and the suite stayed green: every assertion
   about it was either a bound (`> 0`) or a comparison against a value the panel had itself taken
   from `overlayAt`. Now recomputed from `recording.legs` independently, on every shipped
   building, at three window lengths. The per-bank mean had the same hole.
2. **`serializeBuilding`'s field ordering could be deleted.** The test serialised the shipped
   file, whose keys are *already* canonical. It now starts from a shuffled document.
3. **The overlay's "no room for any car" branch could be replaced by a bare heading** — because
   no panel can reach it. With `MIN_PANEL_HEIGHT_PX` at 200 there is always room for one car row,
   and below 200 the panel is not drawn at all. It was unreachable code with a plausible-looking
   test; it was **deleted**, not given a test that constructs a panel the layout never produces.
   The bank list's equivalent line stays, because that one is reachable and was seen on screen.
