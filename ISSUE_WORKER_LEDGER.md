# ISSUE_WORKER_LEDGER.md

One row per open issue. Dispositions are evidence-backed; the evidence lives in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) and the batch reasoning in
[`ISSUE_TRIAGE_PLAN.md`](ISSUE_TRIAGE_PLAN.md).

**Snapshot:** 2026-08-09 · **13 of the play-test backlog remain open**, down from 29 — plus the
**5 filed from findings this wave**, so 18 open in total · branch `integration/issue-wave-14` ·
`npm run typecheck` **passes** · `npx vitest run --project viz` **passes — 121 files, 2 917 tests,
exit 0**.

**Sixteen issues closed with evidence** — the eleven from PRs #120 and #121, plus **#107, #117,
#102, #104 and #92** in this wave. Five of the five carried a claim that did not survive
verification, which is the wave's own headline: #104's premise (*nothing is locked*), #107's
recommendation (*confirm-before-abandon*), #92's two (*no Run now*, *no delta anywhere*), and
#117's lead symptom, which is now **driven and not reproduced** rather than merely unexplained.

**Five new issues filed from findings this wave** — #123 (a preview environment can never reach the
API), #124 (the new change-scope notes are unverified for contrast), #125 (Free play still clobbers
the in-memory campaign week), #126 (the report basis cannot see shift length, and the obvious proxy
is a trap), #127 (the delta block is not in the honesty corpus, found independently by two lanes).

**Shipped to production 2026-08-09.** The viewer is served from a CDN at
`https://yellow-glacier-0ff81230f.7.azurestaticapps.net`, the API stays on the Container App, and
the split is verified by run: page 200 in 0.59 s, `__buildings.json` 8 buildings as
`application/json`, `/no/such/page` a real 404, and a cross-origin `fetch` carrying an
`Authorization` header answered 200 from the permitted origin in a browser. Arming it found **four**
deploy-path defects that reading it had not (§ D308).

Legend — **Verified**: `code` traced to file:line · `run` reproduced by a recorded run ·
`—` not yet verified.

---

## Confirmed defects, ready to schedule

| # | title (short) | P | verified | disposition | canonical | next action |
|---|---|---|---|---|---|---|
| **108** | St Jude URL crashes the viewer | P1 | **code** | **Fix** | — | Union the viz type at 3 sites; add the derived-from-disk building-load guard test |
| **106** | Typing swallows the next click | P1 | **code** | **Fix** — *issue's diagnosis corrected* | — | Stop the rebuild at `main.ts:1531-1534`. **Must land before #111.** |
| **107** | Building switch destroys campaign progress | **P0** | **code + run** | **FIXED** — *confirm-before-abandon refuted* | — | Weeks parked per contract, persist envelope v4. § D312. The A/B/C table reproduced exactly; the *prompt* did not survive — once nothing is abandoned it guards an action with no consequence |
| **111** | Free play refuses Start on a valid config | P1 | **code** | **Fix** — *2b mechanism corrected* | — | **Blocked by #106.** Then `input` validation + re-derive part on template change |
| **109** | Rail publishes the result before the run | P1 | **code** | **Fix** | — | Gate `drawDrivers` on `shiftIsOver`; draw the retraction; `N of M` not `All N` |
| **114** | Machines rail changes nothing | P1 | **code** | **Fix — mark read-only** | — | Drop `onPick`, derive highlight from building, add speed to the envelope gate |
| **112** | Competitive loop never rendered | P2 | **code** | **Fix** | — | Drop `boardsRequested` latch; render `challenge.board.entries` |
| **113** | Custom dispatchers can't be proved | P2 | **code** | **Fix** | — | Persist on `saved*` patch (~5 lines) **first**; Compare selects later |
| **119** | Compare default resolves nothing | P2 | **run** | **Fix** | — | Render INDISTINGUISHABLE as an answer; draw intervals; **do not** tune the default for its verdict |
| **117** | WHAT MOVED compares a phantom run | P2 | **code + run** | **FIXED; headline NOT REPRODUCED** | — | `closeMenu` takes a required exit reason. § D311. Driven three runs → **three different baselines**; blast radius measured at one poisoned delta, self-recovering |
| **99** | Free play defaults saturate | P2 | **run** | **Fix — premise corrected** | — | Curate the opening pair. Default is Chancery + `nearest-car`, **not** Midtown + collective |
| **97** | "Scenarios" goes nowhere | P2 | **code** | **Rescope — premise refuted** | — | A scenario list *does* exist. Two real one-line bugs found instead |
| **118** | Export PNG / `copy run` point away | P2 | **code (partial)** | **Fix** | — | Export the Day report card; copy a URL. **Blocked by #108** (shared link is a coin flip) |
| **104** | No explanation for locked controls | P2 | **code** | **FIXED — premise refuted** | — | **Not one note.** Nothing is disabled during a run; the rail's lists are *live and destructive*. Nine notes derived from `SCOPE_OF`, three behaviours. § D309 |
| **102** | Comparison mixes buildings and modes | P2 | **code** | **FIXED with #117** | **#117** | `ReportBasis` checked before pairing; refusal in words on the `WITHHELD` precedent. A dispatcher swap is explicitly not refused |
| **105** | "Completed" appears mid-playback | P3 | **code** | **Combine → #109** | **#109** | `canvas.ts:1780` reads `result.status`. **Canvas footer, not rail** — fix must cover both |

## Combines — unique scope must transfer before closure

| # | title (short) | disposition | canonical | scope that MUST be preserved |
|---|---|---|---|---|
| **101** | Leaderboard shows no scores | **Combine (partial)** | **#112** | *Board seeding is NOT a duplicate* — it is a product decision. Server has no seeding path at all; zero entries is correct behaviour |
| **100** | Casual surfaces engineer jargon | **Combine** | **#110** | The panel checklist: live-metrics header, dispatcher cards, Day report. #110 argues shape; #100 supplies the list |
| **98** | No onboarding / guided first run | **Combine** | **#90** | In-sim tooltips per panel; move *How to play* to top or a persistent `?` |
| **103** | No motion, doors, or people | **Combine** | **#115** | The *two-renderer* proposal (animated = Casual, schematic = Engineer). #115 asks for one stage. Interacts with **E-2** |
| **94** | Building switch resets config | **Rescope, keep open** | #107 (reset half) | Dispatcher portability; traffic preservation; persistent building header anchor. **#107's save-slot fix does not cover these** |

## Design — unblocked by § D299, and re-triaged against it

E-0 is decided: **two products over one engine.** Casual is what drives the mass-market reach, and
it is a different door into the **same full capability** — named play styles are an entry point,
never a ceiling.

**Engineer gets playability work too.** Its *rigour* is protected absolutely; its *playability* is
not frozen (§ D299 § 1, corrected in place — an earlier draft said "frozen" and that was this
project mis-transcribing the decision). The test:

> A change to Engineer may make it **easier to use**. It may not make it **say less**.

*Draw the interval* is in scope. *Stop printing the interval* is not. *Put the basis on the figure*
is in scope. *Drop the basis because it is noisy* is not.

| # | title (short) | disposition under § D299 | note |
|---|---|---|---|
| **110** | "Casual" is not a mode | **BUILD — real layout, full capability** | #110's own recommendation is **partly wrong**: it proposes the 13 dispatchers *become* 4–5 play styles. Under § D299 they may not — the full weight vector stays reachable, one disclosure away |
| **100** | Casual surfaces engineer jargon | **BUILD with #110** | Supplies the panel checklist #110 lacks: live-metrics header, dispatcher cards, Day report |
| **115** | Nothing to watch | **BUILD — Casual-led** | Stage as the stage, people drawn. Engineer keeps the schematic view — genuinely better *for engineers*. **§ 6 is Engineer work regardless**: `LIVE METRICS` clips its own text on every building, and being drawn into the canvas no DOM check can see it |
| **103** | No motion, doors, or people | **BUILD — its two-renderer framing is now the correct one** | Filed as a subset of #115; under § D299 its *animated-for-Casual, schematic-for-Engineer* proposal is what the decision actually calls for |
| **119** | Compare draws no chart | **BUILD — Engineer work** | ~700 words of monospace prose per verdict and **not one drawn interval**, in a product whose central claim *is* an interval. Strictly more legible, removes nothing |
| **92** | Editor has no "Run this" | **BUILT — two claims refuted** | § D310. A run verb has existed since #65 and the Day report already draws a delta; the real gap was the round trip. Promises **one run** and names the 50-paired-run bar. `garden-apartments` pins INDISTINGUISHABLE |
| **113 § 5** | Only 2 of 5 families authorable | **PROMOTED to the critical path** | *"Tweak it fully"* makes this load-bearing. **Not a Casual problem** — the gap is in the shared editor and fails both products |
| **90**, **98** | No entry point / no onboarding | **BUILD — one door per product** | There are now two products, so there are two first runs to design |
| **116** | Point of view (design charter) | **Epic — keep open** | §2 stays deferred (§ D300). §3's *"there is no economy"* is **refuted** — `Commission the building` exists and #116 missed it twice |
| **96** | Simulation stage is passive | **DEFERRED with #116 §2** | Re-ask once commissioning is surfaced |
| **91** | Inter-day loop is invisible | **Schedule after the defect backlog** | Casual-led; Engineer benefits |
| **93** | Leaderboard has no social hooks | **Schedule after #112** | "Build what does not exist" vs #112's "render what does" — different acceptance criteria |

---

## Escalations

| id | question | status |
|---|---|---|
| **E-0** | Teaching tool, mass-market sim, or a split? | **DECIDED 2026-08-08 — explicit split, two products over one engine.** Engineer is *frozen and never compromised*; Casual is a different door into the same full capability. § D299 |
| **E-1** | Deterministic intraday intervention? | **DEFERRED 2026-08-08, not refused.** Ship #104 and surface `Commission the building` first, then re-ask against a product where the existing agency is visible. § D300 |
| **E-7** | Deployed-build divergence: the tester played an Azure deployment, not HEAD | **RESOLVED 2026-08-07.** `git diff 769eb61 faf935b` is empty — HEAD is a merge commit with the deployed tree. Waves B/C were played against HEAD's content. Wave A's delta is purely additive and untouching. **All refutations stand.** |
| **E-2** | Casual: real layout, or remove the toggle? | **DECIDED 2026-08-08 — build it as a real layout, at FULL capability.** Named play styles are an entry point, never a ceiling; a Casual player authors and tunes completely. § D299 § 2 |
| **E-3** | Board seeding (#101 residual) | **DECIDED 2026-08-08 — seed with verified baseline runs.** Not fabrication: posted through the normal path, so the server replays and verifies them like any score. Labelled *reference*, never as players. § D300 |
| **E-4** | Phase 9's honesty sweep does not cover *temporal* honesty | **DECIDED 2026-08-08 — name the gap AND grow the sweep axis.** Naming alone leaves an uncovered property that happens to pass. Lane in flight. § D300 |
| **E-5** | Auth token lockout | **DECIDED 2026-08-07 — fix at the rate limiter.** Token stays in memory; the documented decision is not reversed; #112 rec 3 not adopted as written |
| **E-6** | Branch topology | **DECIDED 2026-08-07 — one owner, one sequenced branch**: #106 → #111 → #97a → #112 → #113 |

---

## Defects found during triage that no issue reports

These were surfaced by verification, not by a reporter. Each needs its own issue.

| id | defect | evidence |
|---|---|---|
| **N-1** | **The provisional retraction never reaches the screen.** `mood.test.ts:325-330` asserts it in words; the only shipped renderer drops `mood.headline`. Sole signal is `.mood-provisional { font-style: italic }` — no text, violating the rail's own KB-15 second-channel promise | findings § J |
| **N-2** | **`VizSummary` cannot see `accessRefused` or `abandoned`.** `describeSummary` (`recordRun.ts:487-489`) copies only 3 of 5 conservation fields, so the viz layer *cannot* phrase "All N" correctly even if it wanted to. 7 of 8 buildings declare `accessZones` | findings § J |
| **N-3** | **Stale sheet resurrection.** Toggling *show energy axis* mid-run resurrects the previous run's filed sheet. `main.ts:585-588` documents an invariant that is false | findings § J |
| **N-4** | **Enter does not submit, and Tab-then-Enter is broken.** No `<form>`, no `submit` handler; `restoreFocus` yanks focus back to the field. No keyboard path around #106 | findings § E |
| **N-5** | **Boot menu is painted stale and never refreshed.** `drawMenu()` precedes `runShift()` in `boot()`; neither `renderAll` nor `runShift` redraws it. Root cause of #97's quoted string | findings § I |
| **N-6** | **The honesty harness cannot see a presentation pointer drawn as a live control.** `mountRightRail` is on the undriven-mount exemption list. Generalises to `editingDispatcherId`, `editingPatternId`, `editingBuildingId` | findings § F |
| **N-7** | **`walk.test.ts` cannot see cross-select invalidation.** `:283-327` re-reads only the same row, so one select breaking another's validity is invisible. The exact hole #111 § 2b falls through | findings § I |
| **N-8** | **Two further missing-custom-profile sites** beyond #113's four: the challenge dispatcher select (`catalogue.ts:125`), and `batchPanel.ts:635-637` silently inheriting nothing on a custom building | findings § H |
| **N-9** | **`BuildingSpec` could not express a basement**, so three of eight shipped buildings silently corrupted on an untouched editor round trip — `crown-hotel`'s `back-of-house` zone moved `B1 → 2`, putting housekeeping/engineering/security on a guest floor. **FIXED**, § D297 | found during integration |
| **N-10** | Floor pitch averaged over all non-entrance floors, counting the basement drop as a storey — `st-jude` 4.0 → 4.4 m, `crown-hotel` 3.1 → 3.3 m. **FIXED** with N-9 | § D297 |
| **N-11** | `validateSpec`'s orphan branch minted its own id one line below a branch using `floorIdOf` — **off by one on every building, basement or not**. **FIXED** with N-9 | § D297 |
| **N-12** | `midtown-office` lost `P1` entirely on round trip: it is flagged `isEntrance` and every entrance folded onto floor 0. **FIXED** with N-9 | § D297 |

---

## Reporter claims that did NOT survive verification

Recorded so no engineer implements them. **Every one of these would have caused wasted or harmful work.**

| issue | claim | finding |
|---|---|---|
| **#106** | Rebuild is triggered by `input` (per keystroke) | **Wrong.** There is no `input` listener anywhere in the menu. It is `change`, on blur. **Implementing as written — switching to `input` — makes the defect strictly worse** |
| **#106** | Settings selects show the same defect | **Unsupported.** `applyTheme()` runs synchronously *before* `drawMenu()`. Split off; needs a runtime repro |
| **#114** | "Add the legs test — today that test would fail" | **Backwards.** `scope.test.ts:61-77` exists and **passes**, asserting inertness. Making the panel live turns the suite red unless the field is re-scoped first |
| **#114** | The rail renders the cards twice | **Refuted.** One rail list; the second is the Building editor's panel. "Render it once" is not actionable as written |
| **#114** | Speed is editable only behind *Save as a new building* | **Partly refuted.** The commissioning screen writes class **and** speed **live, no save** |
| **#113** | Custom dispatchers vanish because storage paths differ | **Refuted.** One writer, one reader. Real cause: `saveSessionNow()` has two call sites, neither a Save button |
| **#113** | Feeding profiles into Compare is "the highest-value fix, no new features" | **Refuted on effort.** Crosses a Worker boundary; `runBatch.ts:271-278` **throws** for an unresolvable arm, so options alone convert a silent omission into a runtime error |
| **#112** | Nothing in the UI mentions replay verification | **Refuted.** Five sites say it. Under-sold, not absent |
| **#112** | Persist the auth token | **Reverses a decision documented twice as deliberate.** Superseded by decision E-5 |
| **#109** | `delivered · All N` matches no other figure | **Refuted.** Matches `conservation.delivered` exactly; gaps are legs-vs-journeys or the playhead |
| **#109** | Stale figures survive into the next run | **Refuted for the rail**; true for the Day report via a different defect (N-3) the issue does not mention |
| **#109** | The stairs / worst-wait disagreements are bugs | **Refuted as arithmetic.** Documented intentional basis differences. The defect is labelling |
| **#117** | Three consecutive runs printed an identical baseline | **Not reproducible from code.** The confirmed defect poisons **one** delta, not three |
| **#111** | Sim-screen seed has `maxlength=20` | **Refuted.** `maxlength` appears nowhere. The menu is the **stricter** field — the issue's framing is inverted |
| **#111** | Re-picking the identical option clears the refusal | **Unlikely.** A native `<select>` fires no `change` for the already-selected option. **Stickier than reported** |
| **#97** | `?mode=scenarios`; no scenario list; menu reloads | **Refuted.** `mode` accepts only `basic`/`advanced`; 8 cards render into `#scenario-list`; a menu navigate changes no URL |
| **#99** | Free play defaults to Midtown Office + collective | **Refuted.** It is `buildings[0]`/`dispatchers[0]` = **Chancery House + Nearest car**. The real default is *worse* than reported |
| **#104** | The dispatcher and building controls "lock" during a run | **Refuted.** No control on any of those panels is disabled while a shift plays — the only `disabled` writes conditioned on *running* mean *a worker batch is in flight*. Worse, the rail's three lists are **live and destructive**: they write, call `runShift`, and the day on screen is discarded. One note reading "locked for this shift" would have been **false wherever it landed** |
| **#104** | Confirm-before-abandon is what #107 needs | **Refuted by the fix.** Once the week is parked, nothing is abandoned, so a prompt guards an action with no consequence and trains dismissal |
| **#117** | Three consecutive runs printed an identical baseline | **NOT REPRODUCED — now driven, not merely unexplained.** Three cards pressed in turn on `midtown-office` seed 424242 gave **three different baselines**. The confirmed defect poisons **one** delta and the next run recovers unaided |
| **#92** | The editor has no "Run now" | **Refuted.** A run verb has existed since issue #65 — `runThisDispatcherStateOf`, three states, already asserted on the legs. #92 step 3 describes the panel two waves ago |
| **#92** | There is no before/after delta anywhere | **Refuted.** The Day report has drawn one since issue #38. The real gap is the round trip: the press moves the reader to the stage and gives no account back where they were tuning |
| **N-4** | Enter does not submit; Tab-then-Enter is broken | **No longer reproduces.** Closed by #106's fix — `implicitSubmit()` and the third `restoreFocus` branch. Tested at both tiers |
| **#116** | The two saturating buildings are Midtown and Vertical City | **Unconfirmed at my configuration** (I measured Midtown + Mixed-Use). Shape and count confirmed; the specific pair needs reproduction on #116's own terms |
| **#116** | "There is no economy … a shaft **is** free, and instant" | **Refuted.** *Commission the building* is a capital-budget mechanic with a fixed capital-unit ceiling, locked in before the week. **#116 missed that screen twice** — also when claiming speed is only editable behind *Save as a new building*. Rescope §3 to "surface the economy that exists" |
