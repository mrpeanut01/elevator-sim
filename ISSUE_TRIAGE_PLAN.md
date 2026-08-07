# ISSUE_TRIAGE_PLAN.md

Backlog snapshot, clusters, priority rationale, and batch plan for the open GitHub Issues on
`mrpeanut01/elevator-sim`.

**Snapshot taken:** 2026-08-07. **Open issues:** 29 (#90–#119; #95 does not exist). **Open PRs:** 0.
**Working branch at snapshot:** `feat/azure-app-deployment`, clean. `npm run typecheck` passes.

This file is the orchestration record. The GitHub issue remains the public source of truth.

---

## 1. The one thing to read first

**No open issue reports a wrong simulation number.** Every one of the 29 is about the *viewer* —
what the screen shows, what a control does, and whether the player can find it. The engine,
the statistics and the server-side replay verification are repeatedly praised **by the reporters
themselves**, including in the two harshest issues (#112: *"The server side of this is genuinely
strong"*; #116: *"The simulator is excellent, fast and honest"*).

That matters for disposition. This backlog does not threaten any phase verdict in
[`docs/05-roadmap.md`](docs/05-roadmap.md), and no fix in it may be allowed to soften a published
figure or weaken a suppression rule. Several issues say so unprompted — #116 states outright
*"The suppression rule is right and I am not asking anyone to weaken it"* and #119 closes with
*"The ask is framing, not softening."* **Take them at their word and hold that line.**

---

## 2. The backlog arrived in three waves, and the wave decides the canonical

The issues were filed in three distinct sittings, and their evidentiary quality differs sharply.
This is the single most useful fact for deduplication.

| wave | issues | filed | character | evidence |
|---|---|---|---|---|
| **A** | #90–#98 | 03:00–03:04 | Game-design opinion; "what a mass-market game does differently" | Narrative. No file:line, no instrumentation. |
| **B** | #99–#105 | 03:42–03:45 | Playtest notes | Observed behaviour, no root causes. |
| **C** | #106–#119 | 03:51–04:00 | Instrumented playtest, 5 testers, ~250 driven steps | Pixel sampling, request listeners, DOM class dumps, **file:line root causes**. |

**Rule applied throughout: where a wave-C issue covers the same ground as a wave-A or wave-B issue,
the wave-C issue is canonical.** It is not a matter of recency — wave C carries reproductions and
root causes that wave A and B assert without support. Wave C issues also *cite* the earlier ones
explicitly (#107 → #94, #109 → #35, #110 → #71, #115 → #41, #119 → #60/#67), which is the
reporters themselves nominating the canonical.

**The exception is #116**, which is a design charter, not a defect report. See § 5.

---

## 3. The defect / design split

This is the primary triage axis, because the two halves have completely different dispositions.
A defect can be verified and fixed by an engineer. A design proposal cannot — it needs a product
decision that is not mine to make.

**DEFECT — something is broken, or the screen states something false (15):**
#99, #102, #105, #106, #107, #108, #109, #111, #112, #113, #114, #117, #118, #119, and #97 pending
verification.

**DESIGN — nothing is broken; the argument is that the product should be a different product (14):**
#90, #91, #92, #93, #94, #96, #98, #100, #101, #103, #110, #115, #116.

Two of these straddle and are split rather than forced into one bucket:
- **#94** — the silent config reset is a defect; "dispatcher portability across buildings" is design.
- **#101** — "the board shows nothing" is a defect (and probably #112's); "seed the board with
  reference scores" is a product decision about fabricating leaderboard content.

---

## 4. Three defects are instances of this repository's own named failure modes

`CLAUDE.md` names specific failure modes and gives them elevated status. Three open issues are
fresh instances, and they should be prioritised **above** their raw user impact for that reason.

### 4.1 #114 — a control that writes nothing (the standing requirement)

> *"move the control and require the run to change, compared on the legs rather than on a window
> statistic"* — `CLAUDE.md`, Standing requirement

#114 alleges the Machines rail lights up, prints *"Chancery House is inside this class's
envelope"*, and produces a **bit-identical run** (AWT 11.6 s, worst 43 s, deepest queue 17 —
unchanged). If that holds, it is the **twelfth** dead seam in code, and it is the exact shape the
standing requirement exists to catch. The issue even names the test the roadmap already
requires. *Verification in flight (task V-114).*

### 4.2 #109 — two answers to one question

`CLAUDE.md` treats a figure that disagrees with itself as a first-order defect. #109 reports the
rail and the Day report disagreeing on the **same quantity on the same screen**: took-the-stairs
357 vs 18, worst wait 119 s vs 43 s eight lines apart in one panel, and `longest wait 3193 s`
sitting directly above *"Nobody waited past the 900 s abandonment horizon"*.

Some of those are legitimate basis differences (whole-shift vs peak-5min). **That is precisely the
issue's point** — the basis is not on the figure. `AVERAGE WAIT` carries its window qualifier;
`WORST WAIT` beside it does not. *Verification in flight (task V-109).*

### 4.3 #114(c) and #109(2) — a stated claim that is false

> *"A stated *refusal* goes stale the same way, and it is the more dangerous half."* — `CLAUDE.md`, § D227

#114 reports the envelope sentence printing **unconditionally** — it claims validity for
*Ultra high-speed* (10.00–20.50 m/s) on a 5 m/s building. #109 reports `delivered ○ All N people
got where they were going` printed on a run where **108 of 205 gave up**. Both are the product
asserting something it has not checked, which § D227 rates worse than saying nothing.

---

## 5. #116 is an epic, not a duplicate — do not close it

#116 ("Point of view") is 13 287 characters of design charter from a full five-tester session. It
**explicitly states** that the individual defects are filed separately as #106–#115, and its value
is the synthesis and the **measurements**, which exist nowhere else in the backlog:

| building | one full simulation | source |
|---|---|---|
| Garden Apartments | 181 ms | #116 § 2, CLI-measured, minus a 317 ms process-start baseline |
| Midtown Office | 828 ms | " |
| Vertical City | 1 521 ms | " |

Those numbers are the load-bearing argument for its central proposal (§ 6.1 below). Closing #116 as
a duplicate of its own children would discard the only cost measurement in the backlog.

**Disposition: relabel as `epic` / `design-charter`, keep open, link the children.** It is a
tracking issue whose closure condition is "its children are resolved or explicitly rejected."

---

## 6. Two proposals need a human decision before any engineering starts

These are not defects and they are not small. They are architecture and product decisions with
long blast radius, and per the operating rules they are **escalated, not delegated**.

### 6.1 ESCALATION E-1 — deterministic intraday intervention (#116 § 2, #96)

**The proposal.** Change a run from `(seed, config)` to `(seed, config, [{atS, change}, …])`. When
the player intervenes at 09:14, append the event, **re-simulate from t = 0**, and resume playback
at the same playhead. The prefix is bit-identical, so the picture does not jump.

**Why it is escalated and not scheduled.** It changes the run model, and the run model is what
`recordRun` and server-side replay verification are both built on — the two things the backlog
most consistently praises. The proposal argues determinism is preserved and that the leaderboard
can still verify by replaying the intervention log. That argument is plausible and **unverified**.
It also touches Invariant 2 (no global RNG) and Invariant 5 (every persisted record carries its
seed) — a run record would now need to carry its intervention log to replay exactly.

**What I recommend.** Do not build it from the issue. If it is wanted, it needs a contract document
and a decision record first, in the shape this repo already uses. **#116 itself offers a much
cheaper fallback and names it: *"If that is too much for a first pass, the minimum is honesty"* —
mark the rail *Takes effect on the next run*.** That fallback is #104, it is small, and it is
already in the P2 batch below.

**Decision needed from a human:** build the intervention model, ship the honesty fallback only, or
neither.

### 6.2 ESCALATION E-2 — is Casual a real mode? (#110, #100, #103, #115)

**The measurement.** Flipping `#view-mode` between `basic` and `advanced` on the same run changes
**44 words out of 919** on the simulation screen. The dispatcher rail, the dispatcher editor, the
free-play setup, the main menu and the 2 001-word *How to play* are all **byte-identical** (`===`).

**Why it is escalated.** #110's recommendation is *"Make Casual a **layout**, not a copy variant —
or remove the toggle"*. Both branches are large, and they are opposite. Making it a real mode means
a second renderer (#103), a restructured stage (#115), a 4–5 entry play-style list replacing 13
dispatchers, and moving Compare/Lab/Parameters behind an Advanced entry. Removing it is a product
retreat. Neither is an engineering call.

**Decision needed from a human:** invest in Casual as a distinct layout, or delete the toggle.

---

## 7. Duplicate and overlap clusters

Canonical selection follows § 2. **In every combine below, the unique scope of the non-canonical
issue is listed explicitly — it must be transferred to the canonical issue before that issue is
closed, or it is lost.**

### Cluster 1 — Onboarding cold start
- **Canonical: #90** (no "Start here" entry point; five equally-weighted menu rows)
- Combine: **#98** (no onboarding / guided first run)
- **Unique scope in #98 that must be preserved:** in-sim tooltips on first run for each UI panel
  (Dispatcher, Parameters, Compare, Lab); move *How to play* to the top of the nav or make it a
  persistent `?` icon.
- **#97 is NOT in this cluster pending verification** — it alleges a concrete rendering bug
  (Scenarios renders no list at all), which is a defect, not a hierarchy complaint. If verification
  shows a scenario list *does* render, #97 collapses into this cluster. *Task V-111.*

### Cluster 2 — Casual mode
- **Canonical: #110** (measured: 44 words of 919; three surfaces byte-identical)
- Combine: **#100** (Casual surfaces engineer jargon)
- **Unique scope in #100:** names the specific panels that must get plain-language variants —
  live-metrics header (`SATURATED`, `AWT suppressed`), dispatcher cards (`cost = 1.00 times wait`),
  Day report (`peak-5min window`, `confidence interval`). #110 argues the *shape*; #100 supplies
  the *checklist*. Both are needed.
- Related, not duplicate: **#103** (Casual needs its own renderer) — that is a build, not a copy fix.
- Blocked on **E-2**.

### Cluster 3 — Building switch destroys state
- **Canonical: #107** (blocker, data loss: four cleared days and a 4-day streak silently reset)
- Combine: **#94** — but only its "silent reset" half. #107 says so itself: *"Related to #94, but
  stronger."*
- **Unique scope in #94 that #107's save-slot fix does NOT cover:** dispatcher portability when
  switching buildings; preserving manually-edited traffic parameters where structurally compatible;
  a persistent building-name + floor/car-count header anchor. **Keep #94 open, rescoped**, rather
  than closing it — its remainder is real and separable.
- #107 also carries two small standalone bugs that must not be lost in a save-model rewrite: the
  banked counter reads `4/1` (and `19/1`, `21/1`), and the advance-day button falls back to the
  literal word *"tomorrow"* from day 2 onward.

### Cluster 4 — Run-to-run comparison
- **Canonical: #117** (phantom baseline: three consecutive runs all printed an identical baseline
  for a run that never happened)
- Combine: **#102** (comparison mixes unrelated buildings and modes)
- **Coverage check:** #117's recommendation 2 — *"When the two runs are not comparable … say so
  instead of printing a diff"* — is #102's entire ask, verbatim in substance. This is a clean
  combine with no residue.
- **#117 may itself be a consequence of #109's cold-boot phantom run.** #117 says so and could not
  fully pin it. *Task V-109 is answering exactly this.* If confirmed, #117 becomes a verification
  case on #109's fix rather than separate work.

### Cluster 5 — Stage and visualization
- **Canonical: #115** (measured: stage 31.1 % of viewport, building ~6 %; `img=0, svg=0`; canvas
  pixel-identical for 70 samples over ~49 real seconds at ×1)
- Combine: **#103** (no motion, door animation, or human figures) — a strict subset of #115 § 2.
- **Unique scope in #103:** the proposal that the *animated* renderer be Casual-only and the
  schematic view be retained for Engineer. #115 asks for one stage; #103 asks for two. That is a
  real difference and it interacts with **E-2** — do not silently adopt either.
- #115 also carries a defect the design framing hides: **`LIVE METRICS` clips its own text** on
  every building (`main 6 legs suppres…`), and because it is drawn into the canvas **no DOM overflow
  check will find it**. That is separable, small, and worth its own follow-up.

### Cluster 6 — Competitive loop
- **Canonical: #112** (board never rendered; POST returns 201 and the screen says the opposite)
- Candidate combine: **#101** (leaderboard shows no scores) — likely a *symptom* of #112 § 1/§ 2
  rather than a separate defect. *Task V-112 is deciding this.*
- **#101's unique ask is a product decision, not a fix:** seeding boards with reference rows run
  from the project's own baseline dispatchers. That is fabricating leaderboard content, and it
  interacts with the anti-cheat replay verification #112 documents. **Do not combine that half.**
- Related, not duplicate: **#93** (social hooks: names, "beat this score", dispatcher reveal). #112
  is "render what exists"; #93 is "build what does not". Different acceptance criteria, different
  releases.
- #112 § 3 carries a **compounding hazard worth calling out**: the auth token lives only in JS
  memory, and `/api/auth/request-link` allows 3 requests per address per ~15 min. A player who
  reloads must re-request; on the third reload inside the window they are locked out of their own
  account. Combined with #106 (first sign-in click always swallowed), reloading is exactly what a
  player does. **#106 + #112 § 3 together are worse than either alone.**

### Cluster 7 — Recording is complete before playback is
- **Canonical: #109**
- Combine: **#105** ("Completed" label appears mid-playback)
- **Verified directly during this triage.** `packages/viz/src/render/canvas.ts:1780` renders
  `` `${recording.status} · … generated · …` ``, and `recording.status` is assigned from
  `result.status` at `packages/viz/src/record/recordRun.ts:360` — the *whole-run simulation
  result*, not the playback state. #109's recommendation 1 already names this exact strip:
  *"Gate every narrative line, the `average wait …` transport line and the `completed · N
  generated` strip on 'a run has started'"*. Clean combine.
- #105's suggested rename (`arrivals generated`) is a smaller, independently shippable fix and
  should be preserved as an option on #109 in case the gating work is deferred.

### Cluster 8 — Defaults produce a null first experience
Not a combine — three different surfaces, one shared root cause worth fixing as one batch.
- **#99** — Free play defaults (Midtown Office + `collective`) saturate on the first run.
- **#116 § 1** — measured: **2 of 8 buildings saturate on their own shipped defaults**, and they are
  Scenario 2 (*The morning rush*) and Scenario 5 (*Vertical City*) — the second level a player
  reaches, and the flagship.
- **#119 § 1** — Compare's shipped default batch resolves **0 of 8 measures**, because **1 of 50
  paired runs** saturated and the complete-case rule nullifies the three headline metrics.

**The correct framing, and it is #116's:** the suppression rule is right; the *default demand* is
wrong. Tune day 1 into the gradeable band and let tenant growth walk it toward saturation across
the week. **No suppression threshold may be moved to close any of these three.**

---

## 8. Priority assignment

| P | issues | rationale |
|---|---|---|
| **P0** | #107 | Silent, unrecoverable loss of player progress through the most obvious control on the tab. No confirmation, no undo. |
| **P1** | #108, #106, #111 | Hard blockers on first contact. #108 is a hard crash to a raw `TypeError` on a URL **the app writes itself**, with no in-app recovery. #106 makes the first sign-in always fail silently. #111 refuses Start on a valid configuration. |
| **P1** | #109, #114 | Instances of the repo's own named failure modes (§ 4). #109 also spoils the run's ending before it plays. |
| **P2** | #117, #113, #112, #119, #105 | Broken wires between things that already work. High value per unit of effort; low architectural risk. |
| **P2** | #104, #118, #102 | Small, self-contained, no decision required. |
| **P3** | #99, #94(rescoped) | Real, bounded, no urgency. |
| **DESIGN — blocked on E-1** | #96, #116 | See § 6.1. |
| **DESIGN — blocked on E-2** | #110, #100, #103, #115 | See § 6.2. |
| **DESIGN — schedule after defects** | #90, #98, #91, #92, #93 | Product work, not defect work. |
| **PENDING VERIFICATION** | #97, #101 | Disposition depends on tasks V-111 and V-112. |

**Priority is by impact and risk, not age** — which here means the wave-C issues outrank the
wave-A ones almost uniformly, despite being newer.

---

## 9. Batch plan

### Batch 1 — the crash and the two swallowed inputs (P0/P1, no decisions required)

| issue | why it is safe to start | conflict risk |
|---|---|---|
| **#108** | Root cause **verified during this triage**, exact and narrow: `packages/viz/src/authoring/buildingSpec.ts:166` declares `readonly traversalTimeS: number`, `data/buildings/st-jude-hospital.json` ships `{"upS": 26.0, "downS": 19.0}`, and `.toFixed(1)` is called at `buildingSpec.ts:790` and `dev/buildingEditor.ts:2197`. `core` declares the union at `packages/core/src/config/schema.ts:1037-1099`. | None — `authoring/` + `dev/`. |
| **#106** | Awaiting V-106 root cause. Single subsystem (`menu/`). | None. |
| **#111** | Awaiting V-111 root cause. Free-play setup validation. | Low; may touch `menu/`. |
| **#107** | Save model keyed by scenario. Largest of the four; sequence it last or isolate it. | **Touches `persist/` — serialize against #112 § 3/§ 4, which also changes the session blob.** |

**#108 carries a guard test the issue asks for by name, and this repo's standing rule demands:**
*load every building in `data/buildings/` through the viewer's own spec path*. It is derived from
disk rather than a hand-written list, in the shape `packages/viz/src/deadCode.test.ts` already
uses (§ D192). That test is worth more than the fix.

### Batch 2 — the honesty defects (P1, after V-109 and V-114 report)
#109 (+ #105, + #117 if V-109 confirms the shared cause), #114.

**#114's acceptance criterion is fixed by the roadmap already and must not be softened:** change
the machine class, re-run the same seed, **assert the legs differ**. If the resolution is
"mark it read-only" instead, the test becomes an assertion that the panel writes nothing and the
UI says so — the § D227 rule, both directions.

### Batch 3 — the wires (P2)
#113 (feed custom profiles into `#batch-candidate` / `#batch-baseline` / `#campaign-profile`),
#112 (render `entries`, persist the token), #119, #118, #104, #102.

#113's own recommendation ranks its fixes and names #1 as *"the highest-value fix here — it closes
the loop with no new features."* V-112 is verifying whether that is actually small.

### Serialization constraints
- `persist/` — **#107, #112 § 3, #112 § 4, #113 § 2** all change what is stored. One owner, one
  branch, sequenced. The session blob is already at `schemaVersion 3` (§ D290) and a fourth bump
  needs the same read-an-older-one-rather-than-call-it-damaged treatment.
- `menu/` — **#106, #111, #97, #90** all touch menu rendering. #106's fix (stop rebuilding the
  overlay on every keystroke) changes the rendering model the others build on. **#106 goes first.**
- `render/canvas.ts` — **#109, #105, #115** all touch it. Sequence after Batch 2 settles.

---

## 10. Exit criteria for this program

- Every one of the 29 has an evidence-backed disposition recorded in `ISSUE_WORKER_LEDGER.md`.
- Every combine has transferred the non-canonical issue's unique scope **before** closure.
- E-1 and E-2 have human decisions, or are explicitly parked with a review date.
- No fix has moved a suppression threshold, softened a published figure, or weakened an acceptance
  criterion. Where a fix touches a published number, it is re-pinned to the run that produced it.
- Every new control added carries the standing-requirement test: move it, re-run the seed, assert
  the legs differ.
