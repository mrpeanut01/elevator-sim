# 21 — Engineer reimagined: the design contract

**Status: design, not implementation. Nothing here is built.** This document decides what the
reimagined Engineer surface is, what it may not do, and what evidence each lane of work must
produce before it is called done. It is the contract the Engineer implementation lanes are written
against, on the model of [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md):
an *evidence obligation*, not a mood board.

The owner's direction, verbatim in intent: Everyday (Casual) Mode is the front door for everyone;
the Engineer surface is re-imagined **in the Casual visual style**, with **much more** information,
controls and detail than it has today, and **different, more engineering-flavoured challenges**.
Both products co-exist over one engine.

**The binding test is [§ D299](../DECISIONS.md) § 1's, and every section below answers to it:**

> A change to Engineer may make it **easier to use**. It may not make it **say less**.

And [§ D301](../DECISIONS.md) § 3 is why this document is affordable at all: *Casual's mass-market
work and Engineer's playability work are largely the same work.* A practitioner tuning a weight
vector wants exactly what a newcomer trying things wants — to see what changed and why. What this
contract adds on top of that shared work is the half only Engineer wants: the bases, the limits of
the apparatus, and challenges about the engineering rather than about the week.

## 0. Precedence, sources, and one provenance note

1. **Layout, spacing, type, copy** — the Casual handoff wins.
   [`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md)
   § 19 is **canonical for token values**; the vendored prototype
   [`docs/design/elevator-sim-casual.dc.html`](design/elevator-sim-casual.dc.html) is the citation
   for idiom — inline styles throughout (1 401 `style="` attributes, no stylesheet), eyebrows in
   DM Mono at `.10–.16em` letter-spacing in `#8D8271`, headings Familjen Grotesk 600/700, figures
   always mono, always with units.
2. **What a control does, what a number means, what happens next** — the simulator wins, exactly as
   [`docs/12-design-handoff.md`](12-design-handoff.md)'s status block states it. The Casual
   prototype has its own toy models; its layout is the deliverable and its numbers are not.
3. **Anything about the existing tree** — the code wins. Every seam named below was read before it
   was named, and each carries its non-test caller.

**Provenance note, because it already cost this wave an hour:** the prototype entered the tree at
`1b7a2f1` on `integration/everyday-and-engineer`. A lane branched from an older ref will not see it
and must read it from the integration branch rather than concluding it is not vendored.

One more source is *load-bearing by absence*: `docs/10` § 1's rules R1–R13 predate the
Casual/Engineer split and mention Engineer nowhere. This document is the first to contract the
Engineer surface by name, and it inherits every one of those rules unchanged — R3 (*suppression
replaces the number, it never hides it*), R7 (*the seed stays visible and copyable in every mode*),
R10 (*no probability words for intervals*), R11 (*energy is an axis, never a score*), R13 (*no
estimate without its count*) are cited below where a lane could plausibly break them.

---

## 1. The information-survival ledger

**This is § D299's test made mechanical.** Every class of figure, qualifier, refusal and
suppression the Engineer surfaces publish today is listed here, per surface, with the export that
produces it. A reviewer of any restyle or MORE lane greps the finished surface against this table.
**A row that has no carrier in the restyled surface fails the lane** — not "should be discussed",
fails. Rows may move between surfaces; they may not disappear. The ledger was built from a full
read of `packages/viz/src/dev/` and `packages/viz/src/render/`; line numbers are as of `0a6815d`.

### 1.1 Cross-cutting invariants — the structural rules, stronger than any row

These are enforced by construction today, and the restyle must keep the *construction*, not merely
the behaviour:

| # | Rule | Where it is structural today |
|---|---|---|
| L-1 | **Never display a suppressed mean — enforced by vocabulary.** No module under `live/` even names `meanWaitS`, `wait95S` or `meanTimeToDestinationS` (`live/noMeans.test.ts`); the left rail has *not one division over a cohort* | `dev/leftRail.ts`, `leftRail.test.ts` re-runs the walk over every string on a real saturated run |
| L-2 | **The Day report renderer cannot compute a mean at all.** No `toFixed`, no division, no `Math.round`, no fallback; a withheld cell is the literal `WITHHELD` plus the run's own `awtInvalidReason` | `dev/reportPanel.ts`, `reportPanel.test.ts` asserts the drawn cell contains no digit |
| L-3 | **A plate never computes a round trip.** It reads one off the run, or it says there is no run | `dev/rightRail.ts#buildingPlateOf` |
| L-4 | **Energy is an axis.** `axisOnly` is checked before tone; `favours` is `null` on every axis row however the interval fell; `unranked` means *may not be ranked*, not *could not decide* | `dev/reportPanel.ts#figureViewOf`, `batch/report.ts`, § D106 |
| L-5 | **Absence is drawn three ways and the distinction survives**: *hidden* (a slot with nothing to say), *`—`* (a figure with no sample), *`withheld`/named refusal* (a figure the run refuses). `''` is rejected everywhere — a captioned empty box is R3's *blank where a number should be* | every panel; stated per-surface below |
| L-6 | **KB-15: colour is never the only signal.** Every tone has a glyph, a `title`, or a non-optional `note` beside it | `dev/leftRail.ts` KB-15 table, `FigureView.note` non-optional |
| L-7 | **Scope notes are gated, and the failure direction is silence, never a stale sentence.** Every note is drawn iff `commitmentOf(...)` still declares what it claims | `scope/commitment.ts`; consumers in all four editors, `rightRail`, `selectorEditor` |
| L-8 | **Refusal-code seams stay codes.** `RunThisState`, `EditorRunReadOut`, `NameRefusal`, `RenameState`, `UnauthorableBlock`, `PatternRowView.refusal` are prose-free unions with module-private copy tables, because an exported producer of prose owes `honesty/surfaces.ts` an adapter | `dev/dispatcherEditor.ts`, `dev/trafficEditor.ts` |
| L-9 | **New prose is red, not skipped.** `honesty/derive.test.ts` derives the text-producer set from the source tree; a new exported producer in no adapter's `covers` and no stated exclusion fails the suite | `honesty/derive.test-helper.ts` |
| L-10 | **The corpus is measured once, after integration, or not at all** — the rule CLAUDE.md has now recorded four times. Lanes report string counts as branch-local only | `honesty.test.ts`, Phase 9 row |

### 1.2 Per-surface ledger

Each row: **what** is published → **carrier** (export, file). The reviewer's grep targets are the
carrier names and the quoted fragments.

**Shell & provenance** (`dev/main.ts`)
- Reproduction line `elevator-sim run --building … --seed …` with refusals delegated to
  `scope/runIdentity.ts#runIdentityIssues` — deliberately not re-derived → `provenanceLineOf` (l.5989)
- The `--part`-has-no-clock refusal; `--duration`/`--part` mutual exclusion → `partFlagFor`
- Seed entry refuses rather than coerces, two distinct messages, no `maxlength` (a paste must not
  truncate in silence) → `seedEntryOf` (l.6446), § D198
- Deep-link state, share links, seek grammar (±5 s, Shift ±60 s, Home/End) → `deepLinkStateOf`, `seekActionForKey`

**Left rail — how the building feels** (`dev/leftRail.ts`, mount `mountLeftRail` l.958)
- Mood face + four bands, each band's **count** in the legend, basis carried in tense, never colour → `moodViewOf`
- `standing right now` titled *"Instantaneous, not an average."* → `statRowsOf`
- `served under {n} s` caption generated from `observations.longWaitThresholdS`, never assumed;
  `—` on an empty denominator and **never `100%`**; tooltip carries `Over {n} served legs` → `servedCaptionFor`, `servedTitleFor`
- `best day so far` reads `—` until a day has *closed* (gate is `history.length`, not a zero) → `runFiguresOf`
- *Today, so far* withheld while watching a stranger's run → `todayShareOf`
- Goal rows: `pending` is not `missed` in a grey coat; `was` prints only with a figure — *"`was —`
  would dress an absence as a measurement"* → `goalRowsOf`
- Honesty card idle state: *"…whether the run's averages may be quoted, and on what grounds if they
  may not"*, glyph `·` and explicitly not a `✓` → `idleHonestyCard`
- Decision log refuses to narrate what the recorded term breakdown does not say → `decisionRowViewOf`, `live/decisions.ts`
- Mood drivers: whole-run drivers gated on `shiftIsOver` (§ D293); the retraction is a **row**, not a style → `moodDriverRowsOf`

**Right rail — what is running** (`dev/rightRail.ts`, mount `mountRightRail` l.1426)
- Dispatcher blurb derived from the weight vector, never `$comment`; empty vector reads
  *"no term weighted — every car prices the same"* → `dispatcherBlurbOf`
- The 8-row `SCHEDULE` plate reads `resolveDispatchConfig`, not the authored profile; rows name
  their config path; error arm `refused / this engine will not build it` → `dispatcherPlateOf`
- Building plate: capacity states both halves (`{n} persons · {m} at design load` — the 80 % rule
  made visible); handling capacity is *"A count, not an estimate."*; `achieved interval` has three
  arms — `withheld` + ground, measured `over {count} gaps`, `not reconstructed` → `buildingPlateOf` (l.860)
- Traffic options: `$comment` refused in both directions (adversarial test) → `patternOptionsOf`
- Machines segment **reports and says that it reports**; no `pick`, no `aria-pressed` → `MACHINES_ARE_REPORTED` (l.1105), issue #114
- The picks-re-run scope note — the *locked for this shift* wording explicitly refused because a
  run refutes it → `PICKS_RE_RUN` (l.1408)
- Access compatibility note (docs/10 § 10.3), empty when there is nothing to say → `accessNote`

**Dispatcher editor** (`dev/dispatcherEditor.ts`, mount l.909)
- Inert terms drawn beside their control, never dropped (§ D112 as a rule) → `inertTerms`
- Dwell chips' fourth state — *the dispatcher's own* — is the default → `dwellChipsOf`
- `ONE_RUN_PROMISE` (l.731): one run is not a comparison; *50 or more paired runs … which is what
  Compare is for* — on both running verbs, deliberately absent from *Already driving*
- The six-state result strip: `noRun | superseded | watching | unfiled | firstSheet | paired`;
  eyebrow constant across all six so the block is findable when empty; **arithmetic-free by
  construction**, every value a string one of the two sheets already published; `withheld → withheld`
  pairs rather than holes; the playhead outranks the filed sheet → `editorRunReadOutOf`, `EditorRunPairing`, § D310
- Save/rename refusals: `empty | taken`; `notYours | unchanged | refused | ready`; rename keeps the id → `saveNameRefusalOf`, `renameStateOf`, `renamedDispatchers`
- **The unauthorable register**: seven blocks the editor names and cannot author —
  `auction | zoning | panel | reassignment | timing | constraints | selection` → `unauthorableBlocksOf` (l.700). *This register shrinks in § 3.6 and must shrink honestly: each block leaves it on the commit that makes it authorable, and not before.*
- Scope notes ×2, gated: `DRAFT_NOTE` and `LEVERS_NOTE` (issue #104's wording verbatim, because it
  is exactly right about that block)

**Selector editor** (`dev/selectorEditor.ts`)
- *"Nothing on this surface says switching helps"* — three recorded refusals (§ D145/D156/D169)
  stand behind it; every hint says what a rule does, none what it buys → `POLICY_HINTS`
- Whole-panel absence when the library declares no `patternSwitching`, drawn with its reason → `selectorAvailability`
- Membership ramps deliberately not offered (calibration would be silently invalidated); reader-saved
  dispatchers not offered as arms; a stale binding *is* shown because hiding it would hide the entry
  its refusal is about
- The deliberately absent refusal on `selection.switchMargin` — the code outranks the schema and the
  note says why

**Traffic editor** (`dev/trafficEditor.ts`)
- `interfloorShare` inert under `two-way`, drawn as a refusal naming `planDemand`'s own refusal → `inertPatternRows` (l.140)
- The § D227 stale-refusal history in the header, with the rule: *an entry added back here would
  have to name the caller it believes does not exist*
- Preview strip mirrors `sim/simulation.ts#traceConfigFor` field for field; `TrafficError` returns
  as a reason, never a crash → `previewTemplateOf`
- Per-row engine units (`%pop/5 min`, `baselineFraction`, …) → `formatPatternValue`

**Machines editor** (`dev/machinesEditor.ts`)
- Nine rows, not eleven — door/transfer time are file-level and the absence is said, not drawn dead
- Every slider names the `data/elevator-specs.json` field it writes, under the slider, exhaustively → `machineFieldOf` (l.69)
- `maxRiseM` is *"an advisory the loader warns on and builds anyway"* — a true sentence about a
  mechanism, kept true
- A shipped class is never overwritten (`midtown-office` names `geared-traction` by id) → `specsWithClass`

**Building editor** (`dev/buildingEditor.ts`, mount l.1516)
- Three zonings in three blocks — service (elevation), access (matrix), transport modes — never
  collapsed (CLAUDE.md modeling rule) → `elevationRowsOf`, `accessMatrixOf`, `transportChoicesOf`
- Three separately-labelled advisory slots + notes: `classWarning`, `elevationWarning`,
  `accessWarning`, `elevationNote`, `transportNote`, `overCapacityNote`
- The no-clobber seed rule on entry from the rail → `buildingEditorSeedOf` (l.2758), docs/19 defect 11
- The live closed-form feasibility readout per resolved bank → `authoring/buildingSpec.ts:2342`
  (`analyzeUpPeak`) — *already the analytic seam § 4's E2 wires*

**Day report** (`dev/reportPanel.ts`, mount l.1475)
- `ReportFigure` cells: value, non-optional note, **`count` per side** (issue #137: a refused mean
  carries none, two counts because two runs are two cohorts) → `DeltaRowView.beforeCount/afterCount`
- Delta block refuses across a basis mismatch: identity rows, **no figure rows**, `DeltaRefusal.differsOn`
  never empty, in `ReportBasis` field order (§ D311; issues #117/#102). A dispatcher swap is
  asserted comparable — it is the comparison the block exists for
- The third state: a filed sheet short of `endedAt` is replaced by a running sheet carrying **no
  figure at all** (§ D223)
- Verdict trichotomy `cleared | missed | ungraded` as a `Record` so a fourth is a compile error;
  `ungraded` is neutral, not amber (§ D234)
- Single-run framing *omits* week slots rather than emptying them; levers: only `add-a-car` and
  `zone-the-tower` navigate — the two dispatcher cards keep their words and stay unclickable,
  asserted in both directions → `LEVER_SURFACES`
- `SINGLE_RUN_GOALS_HEADING = 'What a scenario would ask — read, not graded'` → `unaskedGoalRowViewOf`

**Compare / batch** (`dev/batchPanel.ts` mount l.112; `batch/report.ts`; `batch/intervalPlot.ts`)
- Verdict taxonomy `resolved | under-budget | unresolved | shown | suppressed | unmeasured`;
  **below 50 pairs an interval excluding zero is drawn with the winner unnamed** → `batchReport`, `MIN_REPLICATION_BUDGET`
- One drawn interval per measure on a zero line; `ranks` copied from the verdict, never inferred
  from geometry; per-row scales with domain ends drawn so bars cannot be read across rows → `intervalPlotFor` (#119's ask, shipped)
- Complete-case rule with the dropped-pairs sentence up front; the ~700 words per verdict moved
  behind `<details>` **and not one word was cut**
- CRN audited per replication, mismatches *reported*, never thrown → `runBatch`, `firstTraceDisagreement`
- Cancel is the only honest form: a terminated batch reports nothing
- Empty state teaches which arm is which way round in the subtraction (§ D225)

**Suite / bench** (`dev/suitePanel.ts`)
- Cells are the eight measured operating points, not the eight buildings — said in the empty state
- Same-profile-both-arms is not refused: it is the liveness control and the copy says so
- Replications are not clamped; `under-budget` is consumed, never re-derived or relaxed
- Per-cell provenance `{building} · {n} replications per arm · seed {s}`; trace key kept on `title`

**Campaign** (`dev/campaignPanel.ts`)
- Every verdict comes from a batch; the bar must **reproduce** before anyone is judged against it
  (`reproduced = passes === target && n === publishedN`, else `met: null`) → `campaign/judge.ts#judgeStage`
- Identical arms reported as a control, not a failure; the panel opens on the smallest admissible
  change (§ D226) → `openingProfileFor`, `controlOrVerdictRow`
- One replication replayed for diagnosis, labelled *Run 1*, seed printed → `evidenceFrom`
- Out-of-scope dimensions refused **by name** before a replication runs → `admitProfile`

**Parameters** (`dev/parameterForm.ts`)
- The APPLIED/NOT-APPLIED sentence per source, drawn as the form's first child; the refusal says
  what the tab *is*, not only what it is not → `appliedNoteFor` (l.126), `APPLIED_SCHEMA`
- Schemas discovered, never named in the file; `default: null` rows drawn as named refusals in
  `collectSearchSpace`'s own words
- `formStatusLine` byte-identical in the glossary block, two readers asserted (§ D154)

**Stage & canvas** (`render/canvas.ts`, `render/overlay.ts`, `render/describeFrame.ts`)
- The schematic stage — cars, queues, bands, banner; whole-run figures gated at the playhead
  (§ D300 E-4's temporal property; two violations found and fixed)
- `LIVE METRICS` in two registers (`ENGINEER_WORDS` / `CASUAL_WORDS`), suppressed statistics
  replaced by refusals in either register; content width contract with `render/layout.ts`
  (`MIN_OVERLAY_WIDTH_PX`, § D316) → `drawOverlay`
- `describeFrame` — the run in words, mood drivers gated as the rail gates them (§ D293)

**Watch / fixit overlays** (`dev/watchPanel.ts`, `dev/fixitPanel.ts`)
- The basis line: a record that no longer reproduces its figures **is not replayed at all**; the
  gate runs on the press and the cost is stated both ways
- A row that cannot be replayed loses its button rather than replaying something approximate
- Reference rows carry `reference run · not a player` on the row *and* the header
- Fixit outcome rows: `holds / does not hold`, `{before} → {after} · {verdict}`, closing `BASIS_LINE`
  from the engine; main-thread runs a **stated cost**

### 1.3 The ledger's own acceptance check

Mechanical, in three parts: **(a)** every carrier named above still exists (or its replacement is
named in the lane's delivery note with the row it carries); **(b)** the honesty corpus's per-tier
failing-case column stays 0 and the string counts move only *up* — a downward move needs a
§ D293-shaped argument recorded in `DECISIONS.md` (fewer repetitions, not less disclosure);
**(c)** the corpus is re-measured once, on the integrated tree (L-10). A lane that cannot meet (a)
for a row has found contract work, not ledger flexibility.

---

## 2. The restyle contract

### 2.1 The token source, and the module lane A0 owes this contract

Guide § 19 is the value source: paper `#F7F2E8` (deep `#EDE4D5`/`#E4D8C4`), card `#FBF7EF` (sunk
`#F5EFE3`/`#F2EADB`), ink `#23201C`, ink soft `#4C463D`, warm greys `#6E665A`/`#8D8271`/`#A79B87`/
`#C6B79F`, rules `#D6C9B4`/`#E2D6C1`/`#DDD1BE`, sun `#F2A63B`, terracotta `#B8462B` (alarm
`#D4573A`), moss `#4F8A5B`, sky `#4E9DD8`, amber wash `#FDF3E2` (edge `#E0B98A`), eight shaft
tints; Familjen Grotesk 600/700, Instrument Sans 400/500/600, DM Mono 500; radii 5·8·9·10·12·14·20;
gaps 26 / 16–18 / 12–14 / 7–9 / 5–6.

Lane A0 provides **`packages/viz/src/everyday/tokens.ts`**, the shared module both products read.
This contract consumes it and needs the following export *shape* (names indicative; A0 owns the
final spelling, and this document moves to A0's spelling when it lands):

```ts
export interface CasualPalette {
  paper: string; paperDeep: readonly string[]; card: string; cardSunk: readonly string[];
  ink: string; inkSoft: string;
  warmGrey: string; warmGreySecondary: string; warmGreyLabel: string; warmGreyFaint: readonly string[];
  rule: readonly string[];
  sun: string; terracotta: string; terracottaAlarm: string; moss: string; sky: string;
  amberWash: string; amberEdge: string;
  shaftTints: readonly string[];       // exactly the eight of § 19, in order
}
export const CASUAL_PALETTE: CasualPalette;
export const FONT_HEADING: string;     // 'Familjen Grotesk', … fallbacks
export const FONT_BODY: string;
export const FONT_MONO: string;        // every figure, eyebrow, timestamp, code line
export const EYEBROW: { sizePx: number; letterSpacingEm: number; color: string };
export const RADII: readonly number[];
```

**Pinning:** the module's values must be pinned to § 19's block the way `dev/tokens.test.ts` pins
`index.html` to `render/tokens.ts` — a test reads
`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` as text and asserts byte
equality per token. The markup is the contract; a value that disagrees with § 19 is a bug in the
module, not a preference. (This is `elementMap.test.ts`'s own technique, third application.)

### 2.2 How the tokens land on the Engineer shell

The Engineer page today draws docs/12 § 1.1's S6/S7 dark palette from `render/tokens.ts`, with a
light mode beside it, both pinned by `dev/tokens.test.ts`. The restyle makes the § 19 paper
palette the Engineer's shipped appearance. Mechanically:

1. **`render/tokens.ts` stays the single source for everything the canvas draws**, and gains the
   paper palette *by import from `everyday/tokens.ts`* — never by a third copy. The stage's
   `Palette` record acquires paper-mode values; `dev/tokens.test.ts`'s pins move to the new
   `:root` in the same commit, and the move is recorded in `DECISIONS.md` (a pin is a pin to a
   decision, and the decision is changing). The S6/S7 dark values survive as the dark mode —
   **restyle is a re-skin, not a deletion of a mode.**
2. **Semantic custom properties are re-pointed, not renamed.** `--ok → moss`, `--warn → sun`,
   `--bad`/`--band-3 → terracotta alarm`, `--accent → sun`, `--dim`/`--dimmer → warm greys`,
   `--edge → rule`, backgrounds → paper/card. `reportPanel.ts`, `scenariosPanel.ts` and every
   `var(--…)` consumer restyle **without a code change**, which is the point of the indirection.
3. **Every private palette in `dev/` migrates onto the module or the custom properties.** The
   inventory found: `leftRail.ts`'s module constants (`GOOD`, `CAUTION`, `HOT`, `DIM`, `FAINT`,
   `TRACK`, `BANKED`); `buildingEditor.ts#SHAFT_TINTS` (→ § 19's eight shaft tints);
   `watchPanel.ts` and `fixitPanel.ts`, six private hexes each (`#141a21` panels — dark overlays
   inside a paper product); `scenariosPanel.ts#SCENARIO_ART`/`FALLBACK_ART`;
   `trafficEditor.ts#PREVIEW_PALETTE` via `live/timeline.ts`. The acceptance check is a grep in
   both directions: no hex literal in `packages/viz/src/dev/` outside an explicit allowlist, and
   the allowlist asserted non-stale — the dead-code audit's own discipline (§ D192) applied to
   colour.
4. **Typography and idiom follow the prototype**: eyebrows (DM Mono, uppercase, `.12–.16em`,
   `warmGreyLabel`) become the panel-title register; **figures are always mono, always with
   units**; card radii and gap scale from the module. The refusal registers keep their words —
   restyle moves *type and surface*, never copy (copy changes are § 3 work with their own checks).
5. **Contrast survives measurement, not intent.** `noteContrast.test.ts` /
   `noteContrast.browser.test.ts` run against the paper values at the same thresholds. § 19's
   warm-grey-on-paper pairs are close to the floor for small text; where a § 19 pairing fails the
   measured threshold, the darker grey of the § 19 ramp is used and the deviation is recorded
   docs/12 § 4-style (a four-move argument: the handoff, the constraint, what is implemented, what
   is preserved). **The simulator's accessibility floor outranks the prototype's greys.**

### 2.3 What stays canvas, what becomes DOM

The rule, stated once: **the picture of the building stays canvas; words about the run prefer
DOM.** Engineer keeps the schematic stage — § D299 § 3 is explicit that the schematic is *genuinely
better for engineers*, and no lane builds a second renderer here (Casual's drawn-people stage is
Casual's lane). The one migration is `LIVE METRICS` (§ 3.4): a panel of *words* that has twice had
geometry defects no DOM check could see (§ D316) moves out of the bitmap. `headerBand`, stage
labels, the banner and the crowd stay canvas and keep their § D300-E-4 playhead gating.

The shell geometry adopts the handoff's grammar where it costs nothing: the Engineer surface is
reached through the Everyday shell's own hand-off (§ D335 — `enterEngineerStage`, the cover/uncover
rule, `inert`'s two writers with the outer cover winning), and nothing in this contract touches
that mechanism. The Engineer's tab strip and rails restyle in place; GAMEPLAY § 3's 212 px rail is
the *Casual* shell and is not duplicated here (§ 6 non-goal 4).

---

## 3. The MORE contract

Each item: what is true today (verified against the tree at `0a6815d`), what is added, the seam,
and the acceptance check in the repository's idiom — **move the control and require the run to
change, compared on the legs** (§ D177), with the negative case pinned beside it where one exists.

### 3.1 Compare — the residue of #119, and #113 § 1's locked door

**Already true:** the intervals are drawn (`batch/intervalPlot.ts#intervalPlotFor` — one bar per
measure on a zero line, ranks copied from the verdict); the report leads with the answer and the
dropped-pairs sentence; not one word of justification was cut.

**Added:**
1. **Defaults that resolve.** The shipped default request must produce at least one non-axis
   `resolved` row on a first run. The triple is chosen by measurement, not taste: a lane runs the
   candidate defaults and pins the result the way `benchmark/published.ts` pins figures.
   Seam: `dev/defaults.ts`.
2. ~~**The remedy is a control.**~~ Where the report's remedy sentence names the lever (*lower demand
   %pop/5 min*), a button beside the verdict applies it and re-runs. Seam: `dev/batchPanel.ts`,
   writing the existing `demand` field — no new config.

   **This item was already built when this contract was written, and the item is kept struck
   through rather than deleted** (GitHub issue #172 item 6). `dev/batchPanel.ts#remedyControl`
   landed in `fa9679e` on **2026-08-08**, four days before the `0a6815d` this section's own preamble
   names as *verified against the tree*. So it belongs above, under **Already true**, and it was
   listed below as work to do. It is the mirror of the class this repository records most often —
   not a sentence that outlived its subject, but one that arrived after it — and it costs the same
   thing: a lane reading § 3 for work would have started on a button that exists. The verification
   this preamble claims was the thing that did not happen; saying so is worth more than a tidy list.

   **What the item asked for and what shipped are not identical, and the difference is the useful
   part.** The button applies the lever and re-runs, as written. What has since changed is
   `remedyFor`'s *sentence*, which no longer promises an end state — a remedy that named an outcome
   was claiming more than one re-run can support. `batch/remedyLadder.test.ts` holds the rungs.
3. **No tab steal.** A finishing single run may not switch the centre column while a batch is
   running or its results are on screen; the affordance is a `Day report ready →` chip.
   Seam: `dev/main.ts#reportOpensItself` (l.5893) — the pure decision already exists; it gains the
   batch-visible input.
4. **Custom dispatchers enter Compare, the suite and the Lab** (#113 § 1 — *both surfaces point at
   a locked door*). `#batch-candidate`, `#batch-baseline` and `#campaign-profile` list saved
   dispatchers by display name. Seam: the selects' option sources in `dev/batchPanel.ts`,
   `dev/suitePanel.ts`, `dev/campaignPanel.ts`, reading `state.savedDispatchers` through the same
   `dispatcherProfilesWithSelector` path `shiftRunConfigOf` uses — one answer to *what profiles
   exist*, not a second list. Campaign admission still runs `admitProfile`: a saved dispatcher out
   of a stage's editable scope is refused **by name**, exactly as an edit is today.

**Acceptance:** fresh profile saved in the editor → appears in all three selects → 50-replication
batch runs → verdict names it by display name. Move one weight, re-run the batch: rows change.
Negative pin: the same profile in both arms stays the liveness control (every row `IDENTICAL` /
unresolved, no winner). First-run defaults: a browser-tier case presses *Run batch* with zero prior
clicks and asserts ≥ 1 resolved non-axis row. Tab steal: browser-tier case runs a batch while a
shift finishes and asserts the active tab did not change.

### 3.2 The dispatcher editor — what #92 still owes, which is not what it says

**#92's headline is stale and this contract does not re-assert it** (§ D310: *the editor has had a
Run this verb since issue #65*, and the six-state result strip answers *what did it do*). The
surviving width defects (echo below the fold, the 58 px sliver header, the empty left column) are
docs/20 defects 11 and 13, **in flight on `fix/docs20-polish-six` with defects 14–17** — cited
here as in-flight, owned by that lane, out of scope for these.

**Added — the legs disclosure.** The result strip gains a *where it moved* disclosure: leg-level
observation rows (rider cohort, floor, car, clock) where the paired runs diverged, derived from
the two recordings the strip already holds. **Arithmetic-free stays the law**: rows are
observations of two runs side by side — no aggregate, no sign, no colour, no verdict, because a
two-single-run delta is *this project's documented central failure mode shipped as a feature*
(§ D310). `ONE_RUN_PROMISE` stays on the block unchanged.
Seam: a new pure export in `dev/` (shape: `legDivergenceOf(before, after): readonly LegRow[]`)
consumed by the strip's mount; enters `covers` of the strip's honesty adapter (L-9 makes this
red-not-skipped).
**Acceptance:** move a weight on a seed where the legs differ → *Run this* → the disclosure names
at least one leg, and the named leg really differs between the recordings (asserted on the
recordings, not the strings). Negative pin: § D310's garden-apartments identical-legs pair draws
the six-state block's existing *nothing moved* arm and zero leg rows.

### 3.3 The what-moved block, surfaced (#117 / #102 — built; this is placement)

**Already true:** § D311 closed the phantom baseline and built the basis refusal (identity rows, no
figure rows, `differsOn` never empty); issue #137 put a count on every paired mean, per side.

**Added:** placement and rank, not data. In the restyled Day report the delta block becomes the
first card after the figure grid — eyebrow `WHAT MOVED SINCE THE RUN BEFORE THIS ONE`, § 19 card,
counts beside means exactly as now — and the editor strip keeps drawing the same `reportDeltaOf`
view (one decision, two renderers, the #137 discipline). The basis refusal's caption and note
survive verbatim; the campaign shift-length basis gap (#126) stays open and stays *named* in the
small print rather than silently tolerated.
**Acceptance:** `reportPanel.test.ts` continues to hold every § D311 behaviour byte-for-byte (the
lane may move markup, not meaning); the honesty corpus's six pairings per case are unmoved;
browser-tier: file two comparable runs, the block is above the fold at 1280×800.

### 3.4 LIVE METRICS — unclipped is done; DOM-checkable is this contract's half (#115 § 6)

**Already true:** the clipping is closed — § D316: the 250 px panel was arriving at 135.3 px;
`render/layout.ts` now refuses to hand over a panel narrower than `MIN_OVERLAY_WIDTH_PX`, and
`overlayRender.test.ts` asserts every string fits the content width, in both registers.

**Added — the migration out of the bitmap.** The panel becomes a DOM card in the restyled
inspector, rendering the same view in both registers (`ENGINEER_WORDS` / `CASUAL_WORDS` survive as
the card's two vocabularies, mode-aware as today). One view-model, one renderer: the pure view is
extracted from `render/overlay.ts` (shape: `overlayViewOf(metrics, frame, mode): OverlayView`),
the DOM card draws it, and the canvas stops drawing the panel — the stage keeps the reclaimed
room for the crowd lane (§ D316's own beneficiary). RS-03's narrow-viewport rule transfers: below
the width floor the card stacks, it never shrinks its text.
Seams: `render/overlay.ts` (view extraction), `render/layout.ts` (room no longer reserved),
`dev/main.ts` (mount; `renderLive` keeps the 60 Hz path via `keyedFill`, watchPanel's #106 lesson —
a rebuilt-every-frame element loses its clicks and its scroll), the panel's honesty adapter
(`covers` moves to the new view export).
**Acceptance:** a DOM overflow check (`scrollWidth ≤ clientWidth` on the card, every shipped
building, both registers) — the check #115 § 6 said no DOM check could make; every `ENGINEER_WORDS`
label present in the card; suppressed statistics still draw refusals, no number beside them, either
register, any playhead; corpus delta (strings leaving the canvas surface, arriving on the DOM one)
measured once after integration and recorded.

### 3.5 Why-locked, mechanised (#104 — built; this is coverage)

**Already true:** the scope-note pattern is shipped and gated (`commitmentOf`, L-7), including
#104's own wording verbatim on the levers block, and the machines segment's demotion note.

**Added:** the audit that makes coverage a property instead of a habit. A test derives the set of
controls that write state consumed only by a later run (from `scope/surface.ts`'s declarations)
and asserts **both directions**: every such block's mount draws a gated note, and no drawn note
claims a commitment `scope/surface.ts` no longer declares. This is `deadCode.test.ts`'s
two-direction allowlist discipline pointed at scope notes — the register may not become
decoration.
Seam: new `dev/scopeNotes.audit.test.ts` beside the existing `scopeNotes.test.ts`; no product code.
**Acceptance:** deleting any shipped scope note goes red; declaring a new `writes-only` surface
without a note goes red; the failure direction for a withdrawn commitment stays *silence*, per L-7.

### 3.6 The authoring gap — the largest item (#113 § 5, promoted by § D299 § 2)

**The evidence is the product's own register**: `dispatcherEditor.ts#unauthorableBlocksOf` names
seven blocks it cannot author — `auction`, `zoning`, `panel`, `reassignment`, `timing`,
`constraints`, `selection` — *reported rather than fixed*, because a silent partial editor is the
defect. `data/dispatcher-profiles.json` advertises five families; two are authorable. § D299 § 2:
**the authoring gap is in the shared editor and it fails both products.**

**Added:** family-complete authoring, generated from the schema rather than hand-built per block —
invariants 7 and 8 are the design: every tunable already declares type, range, default and
`activeWhen`, and `collectSearchSpace()` already returns the dimension set. The editor's rule
becomes: **every dimension the space declares is either a control or a named refusal beside it** —
`parameterForm.ts`'s own `nullDefault` discipline, and `campaignPanel.ts` already proves the
mounting pattern (`editableIdsOf` + `instantiateControlNode`, deliberately not a second
`createElement` walk). Concretely, controls over the profile blocks the register names:
`dispatch.*` (assignment timing, defer window, assignment mode, split threshold, reassignment
policy, commitment point, hysteresis, max reassignments), `answer.*` (bypass load threshold, sole
eligible bypass, dwell policy — extending the existing chips — adaptation gain, max dwell),
`idle.*` (parking strategy, reposition threshold, reposition energy weight, predictor horizon),
`eligibility.*` / `hardConstraints`, the auction family's engine selection, operational-zoning
terms, and the destination family. The engine `<select>` is filled from the profiles' own declared
engines, `ruleEditor.ts`-style — *the refusal is the vocabulary's, made once*.

Three rules bind the lane:
1. **The register shrinks honestly.** Each `UnauthorableBlock` member leaves `unauthorableBlocksOf`
   on the commit that makes it authorable — a registered gap that has been fixed must stop being
   registered, or the register becomes decoration (the `OUTSTANDING` rule, applied here).
2. **No editor over a dead seam.** Before any block gets a control, the lane names the non-test
   caller that reads the field on a shipped run path (`resolveDispatchConfig` →
   `shiftRunConfigOf`), § D219's lesson applied *before* the panel is written. A block whose field
   nothing reads is not given a control; it is given a refusal naming that fact, and a
   `GAPS.md` entry.
3. **Inert-by-configuration is drawn** (`inertTerms`' rule generalised): a control live only under
   `activeWhen` gates draws its gate when closed, beside the control.

**Persistence and #113 §§ 2–4** (custom dispatchers vanishing on reload; save-selects-on-save
asymmetry): the name/rename refusals are built (`NameRefusal`, `RenameState`); the persistence
claim is **needs-verification** against the current tree — the lane's first task is to reproduce
or close it with a driven browser case, and the finding goes in the delivery note either way.

**Acceptance (per family, the § D177 pair):** author a minimal profile of the family from scratch
in the editor; *Run this*; the run differs from the weighted-cost baseline **on the legs**.
Negative pin: re-author a shipped profile's exact values; the run is **bit-identical** to the
shipped profile's run — and per the standing requirement's closing rule, a bit-identical result
anywhere else is treated as a wiring bug, not a measurement. Plus: `unauthorableBlocksOf` returns
exactly the still-unauthorable set, asserted in both directions.

### 3.7 More instrument, same honesty — the additions beyond the backlog

The owner's *much more information* is delivered as computed-but-unshown values reaching the
screen, each with its basis attached. Three, and one is a declared new seam:

1. **The closed-form plate row.** The building plate gains a specification row per bank:
   Barney/CIBSE round trip, interval and %pop/5 min from `analyzeUpPeak` — the value the building
   editor already computes live (`authoring/buildingSpec.ts:2342`) shown beside the *measured*
   handling-capacity and achieved-interval rows. **L-3 is preserved by basis, not violated**: the
   row is labelled *closed form — a specification, not a measurement*, cites
   `CLOSED_FORM_ASSUMPTIONS`, and never substitutes for the measured arm (`no run yet` still
   refuses the measured rows; the spec row appears regardless, because a specification needs no
   run). This puts the correctness oracle on screen: under pure up-peak the two rows agree within
   a few percent, and a visible divergence is a defect report per CLAUDE.md's oracle rule.
   Seam: `dev/rightRail.ts#buildingPlateOf` + `core/analytical` (both callers already real).
   Acceptance: change car count in the building editor → both the spec row and the next run's
   measured row move; the two rows never share a cell or a tone.
2. **The resolution note on Compare — a declared NEW seam.** An `unresolved` row gains one
   sentence: *at this cell, n ≈ {replicationsToResolve} would resolve an effect of this size; the
   smallest effect this apparatus can resolve at n = {n} is {smallestDetectableEffect} s.*
   `compareCell`, `replicationsToResolve` and `smallestDetectableEffect`
   (`packages/experiments/src/benchmark/verdict.ts`, `selectionSweep.ts`) **have no viz caller
   today** — they are driven by benchmark scripts only. Wiring them is adding an export path
   through `@elevator-sim/experiments/browser`, and this contract says so rather than pretending
   the seam exists. **The guard rail travels with the number**: the note must carry Compare's own
   caveat — *running it again until it separates chooses the answer* — verbatim, because a
   required-n figure without it is an invitation to sequential testing, and R10 already forbids
   dressing the interval in softer words. The note may never change a verdict word.
   Acceptance: the note appears only on `unresolved`/`under-budget` rows, computed from that
   batch's own `sdOfDifference`; deleting the caveat sentence goes red; verdict strings byte-stable.
3. **Per-leg energy everywhere raw energy shows** — already the § D106 rule; the restyle re-audits
   every energy cell for the pairing rather than assuming it survived layout changes.

---

## 4. The engineering challenges

Different from Casual's four (daily score, campaign economy, rush, Fix-a-building) — these are
about the engineering. **All of them are data** (invariant 7): a new authored file,
**`data/engineering-briefs.json`**, one entry per brief, validated at load the way
`campaign/parse.ts` validates stages — against `data/buildings/`, `collectSearchSpace()`, and
(where a batch bar is judged) `data/scenario-goals.json`. Top-level shape:

```jsonc
{ "generatedBy": "authored — validated at load by viz/briefs/parse.ts",
  "contract": "docs/21-engineer-reimagined-contract.md § 4",
  "briefs": [ { "id": "…", "kind": "…", "name": "…", "teaches": "…", "brief": ["…"], … } ] }
```

Two trip-wires bind every brief, learned from the seam survey rather than assumed:

- **A batch-judged bar must already be measured.** `judgeStage` refuses to judge against a bar
  that does not reproduce (`met: null`, the stage can never clear), and the bars live in
  `data/scenario-goals.json` per stage id. Any brief with goals therefore ships **with** its
  measured row, regenerated via the scenario regeneration path — whose driver today is
  `scenario/regenerate.test-helper.ts`, a test helper. The lane that adds briefs owns running the
  regeneration and recording the run; a brief whose bar was never measured is refused at load.
- **Anything speaking of required n or resolvable effects rides § 3.7's declared new seam**, with
  its caveat sentence, or does not speak of them.

The panel: **`dev/briefsPanel.ts`**, mounted from `dev/main.ts` (the named non-test caller),
reusing the campaign panel's worker path (`dev/batchWorker.ts`) and the campaign refusal grammar
(`admitProfile`, `evidenceFrom`, `controlOrVerdictRow`). Briefs whose shape *is* a campaign stage
run through `campaign/` unchanged; only the two non-batch kinds (E2's spec half, E4) carry pure
judges in a new `packages/viz/src/briefs/` directory, honesty-adapted like everything else (L-9).

**Scoring, globally: there is no scalar score anywhere in this section.** A brief's outcome is a
verdict list in the existing vocabularies — goal verdicts with reproduced bars, interval verdicts
with the winner unnamed under budget, refusals with grounds. R2 binds (a score is a property of a
run, never of a dispatcher); R11 binds (no energy in any aggregate); the five suppression grounds
bind unchanged.

### E1 — Commission to the brief

**Player:** a building, a constraint (`retrofit` — editable nothing; `refurbishment` — class and
speed, 35 % headroom; `new-build` — all three dimensions), a demand level, and stated goals. Choose
per-bank shafts / machine class / rated speed within the capital budget; prove the choice.
**Engine (all callers real):** `commissioning/refusals.ts#reviewCommissioning` gates the choice set
(scope, mixed-fleet, structural, deck, over-budget, loader refusals — each named at its site);
`commissioning/building.ts#commissionedBuilding` writes the `BuildingConfig`; a two-arm batch
(as-built baseline vs commissioned candidate) through `batch/runBatch.ts`; goals judged by
`campaign/judge.ts` against the brief's measured bars.
**Honest scoring:** the three prohibitions of `commissioning/types.ts` bind — capital gates
choices and **never appears on a results page, is never compared between players, and is never
folded into a verdict** (`budget.test.ts` already asserts all three, including the import ban).
The result page is the batch report, whole.
**Data:** `{ "kind": "commission", "building": id, "constraintId": "refurbishment", "demandLevel":
"typical", "durationS": …, "replications": ≥50, "seeds": …, "holdoutSeeds": …, "goals": […] }`.
**Acceptance:** move one bank choice → the run changes on the legs; an over-budget set is refused
before a replication runs, at the site, by name. Negative pin: choices identical to as-built →
`commissionedBuilding` returns the input object identically and every comparison row is the
liveness control.

### E2 — Design to the interval

**Player:** a population, a floor count, a traffic profile and two targets — an up-peak interval
(s) and a handling capacity (%pop/5 min). Design the bank in the building editor to meet the spec
by closed form, then prove it on a crowd.
**Engine:** the spec half is `core/analytical` (`analyzeUpPeak`, `interval`,
`handlingCapacity5Min`, `percentPopulation`) — exactly the live readout
`authoring/buildingSpec.ts:2342` already computes; the crowd half is a batch on the designed
building. The judge for the spec half is a pure function in `briefs/` comparing
`RoundTripResult` to targets.
**Honest scoring — two verdicts, never merged:** *designed to spec (closed form — a specification,
not a measurement, assumptions cited)* and *held on the crowd (measured, with intervals and every
suppression ground live)*. A design that clears closed form and saturates on the crowd reports
**both**, which is the lesson the challenge exists to teach — and it is the correctness oracle
(CLAUDE.md: simulation vs Barney/CIBSE within a few percent under pure up-peak) played forward.
**Data:** `{ "kind": "design-to-interval", "targets": { "intervalS": …, "percentPopulation5Min":
… }, "floors": …, "population": …, "trafficProfile": …, "seeds": …, "replications": ≥50 }`.
**Acceptance:** change the car count → the closed-form readout changes *and* the next batch
changes; the two verdict rows never share a cell; the closed-form row's assumption citation is
asserted present.

### E3 — Diagnose the saturation

**Player:** a case opens on a run whose mean is withheld. Name the ground; name the lever; move
one editable dimension; prove the fix.
**Engine:** the ground is read from the run itself — `summary.awtInvalidReason` /
`ReportFigure.suppressionGround` (core's code, not prose; five grounds per CLAUDE.md);
the diagnosis evidence is `campaign/failStates.ts#evidenceFrom` (one replication replayed,
landings sampled, labelled *Run 1* with its seed, exactly the campaign's own mechanism); levers
come from the schema's own `SearchParameter.description` via `dimensionHelp`. The fix is judged as
a two-arm batch (broken configuration baseline vs fixed candidate).
**Honest scoring:** the *name the ground* step grades against the run's own code — **the case
authors the configuration, never the expected ground**, because an authored answer key goes stale
the day the engine's ordering moves (the five grounds are ordered by cause and have moved once
already). The fix step's verdict is the batch's, with suppression grounds live in both arms.
**Data:** `{ "kind": "diagnose", "building": id, "dispatcherProfileId": …, "demand": …,
"durationS": …, "pinnedSeed": "…", "editable": { "mode": "listed", "ids": […] }, "seeds": …,
"replications": ≥50 }`.
**Acceptance:** the case's as-given run reproduces its suppression at the pinned seed — asserted
in the suite, so **a case whose defect stops reproducing goes red and is retired or re-pinned**
(the register rule: a brief about a defect that no longer exists must stop being shipped);
the player's fix changes the run on the legs; a fix that trades the mean for >2 % abandonment is
*not* a pass — the fifth ground catches it, and the case copy says beforehand that it will.

### E4 — Find what moved

**Player:** two runs, same seed, same crowd, differing in exactly one dimension. Read the
evidence — the delta block, the decision log, the stage — and name the dimension.
**Engine:** the pair is built by `ghostRun.ts`'s discipline (the primary's own `SimulationConfig`
with one field swapped — CRN by construction); the grading key is
`campaign/dimensions.ts#movedDimensions` on the two resolved candidates — **computed, never
authored**. The dimension is drawn per attempt from the brief's pool by a named stream on the
injected `StreamSet` (invariant 2 — no global RNG), seeded from the brief's seed and the attempt
ordinal so every attempt replays.
**Honest scoring:** binary — named it or did not — because this is a reading exercise, not an
estimation; no interval is claimed and none is needed. The evidence shown is the honest product
surface itself: the delta block with counts, refusals intact.
**Data:** `{ "kind": "what-moved", "building": id, "baseProfileId": …, "pool": ["weights.…",
"dispatch.…", …], "seed": "…", "durationS": … }`.
**Acceptance:** for every pool member at the brief's seed, `movedDimensions` returns exactly that
member **and the paired legs differ** — asserted at load, so a dimension whose move is
leg-invisible at that seed is refused at authoring time (a bit-identical pair is a wiring bug
until proven otherwise; it may not become a trick question).

### E5 — Meet the handling-capacity target

**Player:** a building at a stated demand, a target in engineering units (`persons/5 min` or
`%pop/5 min`). Choose and tune a dispatcher within the brief's editable set until the crowd is
answered — without buying the target through suppression.
**Engine:** a campaign-shaped stage (`answer-the-demand` + `beat-the-baseline` goals, measured
bars, `judgeStage` with its reproduced-bar gate). The differentiator from Casual's campaign is the
plate beside the verdict: the closed-form ceiling for the bank (E2's row) drawn next to the
measured `personsPer5Min`, so the player sees achieved against theoretical — two bases, labelled,
never merged.
**Honest scoring:** `judgeStage` whole — `met: null` when the bar fails to reproduce, `cleared`
only when every goal is met, fail-state frequencies from the batch with the one replayed
diagnosis labelled *Run 1*.
**Data:** a `CampaignStage`-shaped entry (id, building, one traffic field, editable ids, seeds +
disjoint holdout, goals) in `engineering-briefs.json`, with its measured row regenerated into
`data/scenario-goals.json` under the brief's id — trip-wire one, owned by the lane.
**Acceptance:** the stage clears only through the judge; move an editable dimension → the batch
changes; the ceiling row never colours, never grades, and appears with its assumptions.

### E6 — The Pareto trade study

**Player:** a candidate set (their saved dispatchers plus shipped baselines) over pre-registered
cells. Deliver a recommendation as a **front**, not a winner: which candidates are non-dominated
over (AWT, WT95, energy per served leg), and what each trade costs.
**Engine:** `batch/suite.ts` runs the cells (the suite's field widens from exactly-two to the
brief's candidate list — a typed change to `SuiteField`, named here so the lane sizes it);
domination is computed in `briefs/` from the suite's own rows under a hard rule: **a candidate may
be called ahead of another on a wait axis only where that pairwise interval resolved** — an
unresolved pair is published as *unresolved at this budget*, never inferred from point estimates.
Energy is never a domination axis by itself grading anything: the front is presented per the
tuning discipline (*report the Pareto front; the energy-versus-wait tradeoff is the operator's
call*), which is sanctioned — Phase 8's matrix put `nearest-car` on the front at six of eight
cells *because* it is best on energy and worst on wait, and that sentence is the model for this
screen's copy.
**Honest scoring:** completion is a front where every membership claim is interval-backed;
`under-budget` rows refuse membership claims; there is no single winner and the copy says why.
**Data:** `{ "kind": "trade-study", "cells": [matrix cell ids], "candidates": "player-saved" |
[ids], "replications": ≥50, "seed": "…" }`.
**Acceptance:** at 10 replications every pairwise claim reads *under budget — no member named*;
at ≥50 with a resolvable pair, the front names it and the interval that backs it is drawn
(§ 3.1's plot, reused); adding a candidate identical to an existing one produces `IDENTICAL`
rows and the front says so rather than drawing two points.

---

## 5. Lane cuts

Five lanes. Engineer lanes own `packages/viz/src/dev/`, `packages/viz/src/render/`,
`packages/viz/src/briefs/` (new), `packages/experiments/src/browser.ts` (B5 only) and the named
`data/` files. **No Engineer lane writes `packages/viz/src/everyday/`** — Casual's screen lanes own
it; the only contact is importing `everyday/tokens.ts` (lane A0's deliverable). Two live-branch
constraints: lane B4 shares `dispatcherEditor.ts` with `fix/docs20-polish-six` (docs/20 defects
11/13–17) and **starts after that branch merges**; every lane reports corpus figures as
branch-local only (L-10).

Clause skeleton per lane is doc 10 § 11's, verbatim in shape: Acceptance / Liveness evidence /
Non-test caller / Risk.

**B1 — Tokens onto the Engineer shell** *(first; everything else depends on it)* — **LANDED**,
[§ D336](../DECISIONS.md).
Scope: `packages/viz/index.html` (custom-property blocks), `packages/viz/src/render/tokens.ts`,
`dev/tokens.test.ts`, palette migrations in `dev/leftRail.ts`, `dev/buildingEditor.ts`
(`SHAFT_TINTS`), `dev/watchPanel.ts`, `dev/fixitPanel.ts`, `dev/scenariosPanel.ts`,
`live/timeline.ts`; consumes `everyday/tokens.ts`.
**Acceptance:** § 2.2's five clauses; zero behaviour change; ledger § 1 fully green.
**Liveness evidence:** the both-direction hex grep; `noteContrast` suites green at paper values;
a driven session on Midtown Office seed 42 showing the restyled shell with every § 1.2 carrier
present. **Non-test caller:** the shell itself — every mount already ships. **Risk:** § 19 greys
vs the contrast floor; the deviation path is § 2.2 (5) and it is written down, not improvised.

*What landed, where it differs from the plan above, and what the next lane inherits:*

- **The blocks swapped rather than the light one being edited.** `:root` is paper; the S6/S7 dark
  values live in `:root[data-theme='dark']`. Both modes stay pinned in both directions.
- **Five § 19 values ship deepened**, each because it fails a floor this shell already enforced —
  the risk row above, realised and recorded. The deviations are pinned *as measurements*
  (`dev/tokens.test.ts` asserts § 19's value still fails and the shipped value clears), so a guide
  that moves re-adopts rather than a deviation outliving its reason.
- **`SHAFT_TINTS` went further than a value swap.** It was mode-blind — six literals written into
  inline styles — and five of the six were another token's string. It is `--shaft-1…8` now, in the
  `Palette` and in both blocks, and **eight** because § 19's line has eight.
- **The sweep found two things the § 2.2 (3) census did not.** `reportPanel.ts` drew the met/missed
  goal washes as frozen *dark* band values, and two native `<select>`s (`#view-mode`, `#race-ghost`)
  carried the user agent's `fieldtext` rather than the palette's ink — the second found only by
  driving the page. Both closed; `dev/paletteLiterals.test.ts`'s allowlist is **empty**.
- **`dev/fixitPanel.ts` was not restyled here.** `fix/docs20-polish-six` had already repainted it;
  its version is carried verbatim rather than re-done.
- **Inherited by B2–B4:** every `var(--…)` consumer restyled with no code change, which is what
  § 2.2 (2) promised, so no lane after this one needs to touch a colour to be on paper.

**B2 — Compare, suite and report surfaces** *(after B1)*
Scope: `dev/batchPanel.ts`, `dev/suitePanel.ts`, `dev/reportPanel.ts`, `dev/campaignPanel.ts`
(select sources only), `dev/defaults.ts`, `dev/main.ts#reportOpensItself`.
Delivers § 3.1 (defaults, remedy control, no tab steal, custom profiles in the selects) and § 3.3
(delta block placement). **Acceptance/liveness:** as written per item, including the
zero-prior-clicks browser case and the pinned resolving defaults. **Non-test caller:**
`dev/main.ts`'s existing mounts. **Risk:** the defaults pin — a default that resolves today can
stop resolving when a baseline profile moves; the pin names its run (seed, triple) so the failure
is loud.

**B3 — The inspector: LIVE METRICS to DOM, the closed-form plate row, the scope-note audit**
*(after B1; parallel with B2)*
Scope: `render/overlay.ts`, `render/layout.ts`, `dev/rightRail.ts`, `dev/main.ts` (mount),
`honesty/surfaces.ts` (adapter `covers`; append-at-end rule respected), new
`dev/scopeNotes.audit.test.ts`.
Delivers § 3.4, § 3.7 (1), § 3.5. **Acceptance/liveness:** as written per item; the DOM overflow
check on all eight buildings in both registers is the headline. **Non-test caller:** `dev/main.ts`
mounts; `buildingPlateOf` is already called by the shipped rail. **Risk:** the 60 Hz DOM path —
issue #106's detached-button defect is the named hazard and `keyedFill` the named remedy.

*What landed, where it differs from the plan above, and what the next lane inherits* —
[§ D337](../DECISIONS.md):

- **`Layout.overlay` is gone, not merely unused.** § 3.4 says *room no longer reserved*; leaving the
  `Rect` behind would have been the dead-seam shape this repository counts. `overlayWidthPx`,
  `MIN_OVERLAY_WIDTH_PX` and `dev/main.ts`'s overlay ladder rung went with it, and the plot is
  **250 px wider at every width** — the beneficiary § D316 named, collected.
- **Three § 1.2 carriers moved and are named in § D337's table.** The width contract's replacement is
  the measured DOM check plus RS-03 stacking in CSS; the refusal's is `OverlayEstimate`'s refused
  arm, which carries no `value` field at all.
- **The headline check found a defect on its first run.** `auto-fit` holds a grid track at its
  `minmax` floor when the container is narrower than the floor, so the card overflowed at 420 px —
  issue #115 § 6's shape in CSS, on the card built to make it visible.
- **§ 3.7 (1) widened L-3 with a label rather than breaking it**, and `dev/rightRail.ts`'s module
  docstring moved with the rule (§ D227 binds a refusal as hard as a claim).
- **§ 3.5's audit found `dev/ruleEditor.ts`'s scope note driven by nothing**, and recorded a second
  wording for `next-run` rather than unifying it.
- **Inherited by B5:** `honesty/surfaces.ts` gains `LIVE_METRICS`, appended last; the strings that
  left `CANVAS`'s `drawOverlay` capture arrive there under named fields rather than `fillText[n]`.

**B4 — Authoring the families** *(after B1 and after `fix/docs20-polish-six` merges)*
Scope: `dev/dispatcherEditor.ts`, new `dev/familyControls.ts` (schema-driven control mounting,
reusing `parameterForm.ts#instantiateControlNode`), honesty adapter `covers`.
Delivers § 3.6 whole, including the persistence verification. **Acceptance/liveness:** the
per-family § D177 pair with the bit-identical negative pin; `unauthorableBlocksOf` asserted in
both directions as it shrinks. **Non-test caller:** `resolveDispatchConfig` → `shiftRunConfigOf`
per block, named per block *before* its control is built. **Risk:** this is the lane most likely
to build a control over a dead field; rule 2 of § 3.6 exists because of it, and a refusal is the
correct deliverable for any block that fails the caller test.

**B5 — Engineering briefs: data, judges, panel, and the declared new seam** *(after B2; parallel
with B3/B4)*
Scope: `data/engineering-briefs.json`, `data/scenario-goals.json` (regenerated rows for E1/E3/E5,
with the regeneration run recorded), new `packages/viz/src/briefs/` (parse + the two pure judges +
domination), `dev/briefsPanel.ts`, `dev/main.ts` (mount), `packages/experiments/src/browser.ts`
(§ 3.7 (2)'s three exports), `batch/suite.ts` (`SuiteField` widening), honesty adapter.
**Acceptance/liveness:** each E-item's check as written; the load-time validations (E3's
reproducing defect, E4's leg-visible pool) are suite assertions, not review notes.
**Non-test caller:** `dev/main.ts` mounts `briefsPanel`; `briefsPanel` is the first viz caller of
the three benchmark exports and says so in its header. **Risk:** trip-wire one — a brief shipped
without its measured bar is unclearable by construction; the load-time refusal makes that loud
rather than mysterious.

Dependency order: **B1 → {B2, B3} → B5**, with **B4** gated on the external merge. B2 and B3 touch
`dev/main.ts` in disjoint regions (tab logic vs inspector mount); the integration lane owns the
merge order there.

---

## 6. Non-goals — what this reimagining must NOT do

1. **Remove, round, soften or hide anything in § 1.** No figure deleted, no qualifier dropped, no
   threshold widened, no refusal reworded into reassurance. § D299's test is the review test, and
   the ledger is its instrument.
2. **No second engine, no second statistics.** The prototype's toy formulas (its report sheet
   computes average wait as `28 + (100 − pct) × 0.9`) are layout reference only; every number on
   the reimagined surface comes from the run, the batch, or `core/analytical` — and the analytic
   basis is always labelled as such (L-3, § 3.7 (1)).
3. **No scalar challenge score, ever.** No stars, no grades, no points; a brief's outcome is
   verdicts, intervals and refusals. Energy appears on no aggregate (R11/§ D106), capital appears
   on no results page (`commissioning/types.ts`'s prohibitions), and no winner is named under
   budget or across an interval containing zero.
4. **No duplication of Casual's screens or shell.** GAMEPLAY § 3's rail, § 4's sixteen screens,
   the menu, the boards — Casual lanes own them in `everyday/`. The Engineer surface is reached
   through the shell's existing hand-off (§ D335) and does not grow a second front door.
5. **No second renderer on the Engineer stage.** The schematic stays; drawn people, doors and the
   stage-as-the-stage are Casual's build (§ D299 § 3).
6. **No mechanism sentences.** Challenge and panel copy may not state *why* a configuration
   performs better unless the mechanism is measured — § D280's rule, with H-ACCESS-1's corollary:
   where a mechanism was withdrawn, no replacement plausible sentence goes in its place.
7. **No control that writes nothing, and no silence about it.** Every new control names its field
   and its non-test caller before it is drawn (§ D219, § D227 — both polarities: a dead control
   may not look live, a live control may not claim to be dead).
8. **No renumbering.** UX.md's retired sections, the dead-seam ordinals, the ledger row names —
   references hold; new work gets new names.
9. **No per-branch corpus figures in any published row.** Measured once, after integration, or
   not at all (L-10).

---

## 7. Requests to files this document does not own

⬜ **Lane A0** — `packages/viz/src/everyday/tokens.ts` with § 2.1's shape, pinned to guide § 19 as
text. This contract tracks A0's final export names.
⬜ **DECISIONS.md** — three entries when the lanes land: the palette-pin move (§ 2.2 (1)), the
LIVE METRICS migration (§ 3.4), and the experiments new seam (§ 3.7 (2)).
⬜ **GAPS.md** — any § 3.6 block that fails the caller test lands here with its refusal.
⬜ **docs/05-roadmap.md** — no new phase row for this work while it is unstarted; docs/10 § 14
item 3's precedent (*a design that starts reading as work in progress*) applies verbatim.

---

*Written against `0a6815d` on `integration/everyday-and-engineer`. Every code claim was checked
against the tree at that commit; where a claim could not be re-verified (the #113 § 2 persistence
defect), it is marked needs-verification and assigned rather than asserted.*
