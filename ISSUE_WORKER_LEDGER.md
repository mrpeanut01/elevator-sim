# ISSUE_WORKER_LEDGER.md

One row per open issue. Dispositions are evidence-backed; the evidence lives in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) and the batch reasoning in
[`ISSUE_TRIAGE_PLAN.md`](ISSUE_TRIAGE_PLAN.md).

**Snapshot:** 2026-08-09, after **wave 18** · branch `integration/issue-wave-18` ·
`npm run typecheck` **clean** · `--project viz` **131 files, 3 213 passed, 1 skipped** ·
`--project core --project server --project cli` **128 files, 2 809 passed** ·
`--project viz-browser` **7 files, 44 passed**, run twice — a tier that was **8 red and running
nowhere** when the wave opened · honesty **both tiers green**, 335 950 always-on / 426 662 deep,
measured once on the integrated tree.

**Wave 18 closed #100, #124, #125, #129, #140 and #143**, and filed **six** from findings —
#142–#147. Wave 17 closed #135, #136, #137 before it.

**The wave's headline is the same one the last three had, and it is getting hard to call it a
coincidence: five of six lanes found the issue's own claim to be wrong.** #100's two quoted
symptoms both pointed at the wrong surface; #124's premise (*this tier cannot check contrast*) was
false and both classes already passed; #125's prescribed mechanism was a **no-op** and the lane said
so rather than substituting silently; #129's boundary check came back the opposite of what the issue
assumed and the shape was decided by a **measurement** instead; #140's list of affected periods was
half the real set; #142's diagnosis (*copy drift*) was right about the symptom and wrong about the
cause in 7 of 8 cases.

**Two defects existed only in the merge, and neither branch could have seen them** — both files were
green alone. `noteContrast.browser.test.ts` carried the seventh private copy of a gate that #142 had
just consolidated (the guard caught it by design, naming the file), and its `port: 0` collided with
`boot.browser.test.ts` on Vite's default 5173 once the tier had seven concurrent files. That is why
the suite is re-run after every **merge**, not after every branch.

**Twenty issues closed with evidence** — the eleven from PRs #120 and #121, plus **#107, #117,
#102, #104, #92, #99 and #118** in wave 14, and **#90, #115 and #103** in wave 15. **Seven of seven carried a claim that did not survive
verification**, which is the wave's own headline: #104's premise (*nothing is locked*), #107's
recommendation (*confirm-before-abandon*), #92's two (*no Run now*, *no delta anywhere*), and
#117's lead symptom, which is now **driven and not reproduced** rather than merely unexplained; #99's
premise, wrong twice over; and #118's, where the *requested fix* would have been worse than the
defect if applied as written.

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
| **99** | Free play defaults saturate | P2 | **run** | **FIXED — premise corrected twice** | — | § D313. The menu still held `nearest-car`, the dispatcher **§ D134 retired from the Run viewer** — two doors, one held the old answer. Chancery stays (Garden serves 2–8 riders and both arms return identical runs); the dispatcher moves. Measured over 6 seeds |
| **97** | "Scenarios" goes nowhere | P2 | **code** | **Rescope — premise refuted** | — | A scenario list *does* exist. Two real one-line bugs found instead |
| **118** | Export PNG / `copy run` point away | P2 | **code** | **FIXED — the requested fix needed a prerequisite** | — | § D314. Copying the URL **as it stood** would have been a worse provenance claim than the CLI line — `deepLinkSearchOf` carried four axes and dropped four. The link grew first, then the button was pointed at it |
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
| **#90** | The menu presents *five* equally-weighted options | **Wrong on count.** Six navigations + Resume + the guide = **eight**; #90's own body lists seven and contradicts its title |
| **#90** | Scenarios' first option is *Keep going*, silently entering endless mode | **Refuted.** First is *Pick a scenario*; *Keep going* is fourth and last — fixed under #97 |
| **#98** | No tutorial prompt, **no tooltip** | **Refuted.** 28 `title=` tooltips ship plus four programmatic. What is absent is *first-run* tooltips, which is a narrower and truer claim |
| **#103** | The building has no motion and no door animation | **Refuted at HEAD.** Cars move continuously off `yForHeight`, doors off `doorFraction` — wave 10. And people *are* drawn: `riderFigures.ts` is complete and wired. The defect was that `Layout.riderLane` was `undefined` on **7 of 8** buildings |
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

---

## Wave 18 — claims that did NOT survive verification

Same table as above, kept separate because the wave is recent and the entries are dense. **Every one
of these would have caused wasted or harmful work**, and three would have shipped a new defect.

| issue | claim | finding |
|---|---|---|
| **#100** | The live-metrics header still prints `SATURATED` / `AWT suppressed` in Casual | **Half wrong, and the half matters.** That panel has been Casual since `21a0c17`. The surface still printing it is `render/canvas.ts#drawHeader`'s **header band** — a different function, drawn into the bitmap. Fixing "the panel" would have changed a surface that was already correct |
| **#100** | The dispatcher cards show `cost = 1.00 times wait` | **Not reproduced on the rail, in either mode, on any of 13 profiles.** The string is real and lives in the dispatcher **editor** (`authoring/dispatcherSpec.ts#weightSummaryOf`, **renamed since to `costFunctionLine`** — annotated rather than rewritten, since the finding is unchanged and only the symbol moved; wave S lane S-V1, § D495). Misattributed, not false — filed as **#146** |
| **#100** | (implied by § D319) the panels cannot see the mode, so the gap is structural | **False here.** `mountRightRail` has had `state.mode` for waves and `SceneInput.mode` reached `drawOverlay`. Nobody had written the other register. The § D319 precedent did not transfer |
| **#124** | A document-tier test has no stylesheet to resolve, so this needs a browser | **False.** Joining a static stylesheet parse to a mount-driven run of the shipped panels produces real ratios with no browser. The browser was worth having as *confirmation*, not as the only option |
| **#124** | The nine change-scope notes are unverified and may fail contrast | **Unfounded for both classes.** `.advice` 7.21 dark / 8.25 light, `.rail-prose` 6.35 / 5.92 — § D235 had already raised the ink ladder past AA. Nothing in the product changed. What was missing was anything that would *notice* if one of them stopped |
| **#125** | Park the week "exactly as `withBuilding`'s `switchWeek(…, 'resume')` already does" | **Not implementable as written** — that call is a **no-op** on the same contract id (first line returns). Worse, a hand-rolled park under the borrowed id breaks § D312's invariant and drops the campaign week on the next building change. The free-play week needed an id of its own |
| **#125** | `enterFreePlay` lives in `dev/state.ts` | Wrong file — `menu/enterFreePlay.ts` |
| **#129** | `permits` is what lets the two fields through | **Two routes, not one.** `viewer.selectorSpec` is `within-day`, which `ranked` already forbids, and it still reached the submit button because the `switch` had no arm and fell to `default: return undefined`. A third field with the same defect, found by the exhaustiveness assertion |
| **#129** | `runIdentity.ts`'s docstring: *"`runIdentity.test.ts` asserts the two agree"* | **No such assertion existed.** Nothing in `packages/viz` referred to `carriesState` at all. The mechanism that should have caught #129 on the day the fields landed was a sentence |
| **#129** | (assumed) the `server → viz` boundary forbids carrying the fields | **Permissive** — § D214 § 3 says so, and it was measured by wiring it up (`tsc -b` exit 0, import in 73 ms). So the shape was decided by **soundness** instead: a commissioning choice is a building edit on the wire, and 16 shafts turn a 23.00 s mean wait into **6.58 s** with nothing objecting |
| **#140** | `vacation` and `public-holiday` are the affected periods | **Four of five**, not two. `quarter-end` and `rota-week` are unmentioned and equally affected |
| **#140** | Reuse `calendarLine` for the sentence | **Does not work as stated** — it needs a `CalendarPatch`, which needs a building, and the only owner throws on a building `data/buildings/` does not ship, which is the exact state the predicate exists to describe |
| **#140** | Periods swap the demand template, so that axis is live | **Not always.** `office-down-peak` differs from `rise-and-fall` only in `startOfDayMin`, which nothing statistical reads, so `quarter-end`'s swap moves no leg at an unwindowed cell. Filed as a data question |
| **#142** | The failures are copy drift — the labels changed | **Right about the symptom, wrong about the cause in 7 of 8.** `'Pick a scenario'` still exists verbatim. The real fault is that Playwright's `hasText` is a case-insensitive substring over the whole `textContent`, and issue #90's recommended row reads *"it opens the scenarios board"* — so `.first()` pressed **Start here**, which closes the menu. Updating the string literals would have fixed nothing |
| **#142** | (2 of 8) a menu label changed | **Stale ordinal, product correct.** `#dispatcher-list .pick` `nth(2)` is now `collective`, which § D134 made the opening dispatcher, so the panel correctly answered with a **disabled** *Already driving* button |
| **#143** | `role="status"` suggests the note should be quieter than a warning | **Refuted, and by the other surface.** The role governs how an assistive technology *interrupts*; the class governs the register it *reads* in. The editor's `#ed-access-note` carries `warn` alone and has always drawn in `--warn`, so the two surfaces § 10.3 requires were rendering one fact in two registers |

## Wave 18 — findings recorded rather than fixed

| id | finding | disposition |
|---|---|---|
| **W18-1** | `dispatcherPlateOf`'s help said the library declares **twelve** terms beside a value reading `1 of 13` | Fixed in the #100 lane |
| **W18-2** | `keyedPlate` hashed key+value only, so **a mode toggle never redrew** a plate whose Casual lead lives in `help` — true of `buildingPlateOf` since issue #71, meaning Casual's building-plate text has been shipping unreachable | Fixed in the #100 lane. **Worth confirming in a browser** |
| **W18-3** | `boot.browser.test.ts`'s comment claimed the Resume row is found *"by the attribute the panel writes"*. It never was — and it must keep matching text, because `menuPanel.ts` deliberately drops the attribute from a refused row and the refused state is what that reading is about | Comment fixed in place; the code was right. CLAUDE.md's *stated mechanism goes stale* in a test file |
| **W18-4** | ~80 more legs tests across 23 files run real simulations at vitest's default 5 s | #144 fixed the three known sites. The general static check is **not honestly buildable** — a name-level call graph gave **1 881** false positives, and even a correct one asks the wrong question, since most simulations run at module scope. The total alternative is `testTimeout` on the `viz` project, a repo-wide config decision |
| **W18-5** | `PROVISIONED_FALLBACK` points at a path that exists on no machine this repo has been measured on | Kept, with its status stated as documentation rather than a usable default. **Corrected 2026-08-26 — the claim is false on this host.** The path exists, and the tier ran from it with `ELEVATOR_SIM_CHROMIUM` unset (`dailyLoop.browser.test.ts`, 6 passed, 18.81 s). `browserTier.test-helper.ts`'s own docstring carried the same claim and is corrected with it. Both were true where written; a sentence about the *environment* goes stale exactly as a sentence about the product does |
| **W18-6** | Two `.primary` buttons in one `.editor-actions` row, so the run verb must be located by exclusion | Left alone — giving it an id is a product change, and this was a test-repair lane |

---

# Charter programme — wave 1 dispositions (#186–#193, #206–#218)

**Snapshot:** 2026-08-24, branch `claude/elevator-sim-charter-kickoff-rexfw8` at `c8fd6fa`.
Evidence: [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) §§ M–W.
**No issue below is scheduled.** M0 and M1 are not open, and M2 is the first milestone that may
contain code.

**The wave's error rate held.** Of thirteen issues settled, **two are refuted at their central
premise** (#190, #209), **eight carry at least one false or materially misleading clause**, and
**three would have shipped a new defect, a reversed product decision, or a wasted edit if acted on
as written** (#190, #213, #217).

Legend — **Verified**: `code` traced to file:line · `run` reproduced by a recorded run.

## Confirmed, schedulable once the gate opens

| # | title (short) | P | verified | disposition | next action |
|---|---|---|---|---|---|
| **206** | Core loop dead-ends at filing | **P0** | **code** | **Fix — 3 claims corrected** | Two gaps, both needed: navigate from `stageScreen.ts:878` **on the confirmed file**, and change `shell.ts:969`'s enabling predicate. Step numbers are pinned by `actionBar.test.ts`; **do not raise them.** Campaign shares the path; **Fix a building does not** |
| **216** | Monday called "Tuesday-shaped" | P3 | **code** | **Fix — cheapest in the set** | One string literal, `shift/events.ts:198`. Assert against `WEEKDAYS` so the test cannot go stale |
| **214** | Rail contradicts the week screen | P1 | **code** | **Fix — "stale" → "unconditional"** | `drawRail` reads `dataHost.week()`, as `campaignRailOptions()` already does. The two-store split stays |
| **215** | "ATTEMPT 4" after one run | P2 | **code** | **Fix — mechanism corrected** | Not navigation. Stop `stageScreen.ts:862` re-running a closed day, or extend `week.ts`'s `recordGrew` exemption to a bit-identical re-simulation |
| **213** | Report advice is not actionable | P1 | **code** | **Fix — criterion must be narrowed** | The button already goes to the wrong screen (`reportScreen.ts:281`). **Only 2 of 4 levers may ever route**; routing the dispatcher pair off one replication is `docs/10` R2 |
| **212** | Stage does not show the crowd | **P0** | **code** | **Rescope — largely refuted** | People, doors and queues **are drawn**. Real defects: door leaves paint over the whole car body at `doorFraction = 0` (`stageScreen.ts:268-273`), and the stage opens paused at 06:00 on an empty lobby |
| **207** | Front door sells the absences | **P0** | **code** | **Fix — undercounted** | **Six** surfaces, not four; 27 entries, 17 carrying notation. A build-information panel must be a **real non-test caller of all six arrays** or `viz/src/deadCode.test.ts` re-fires |
| **208** | First session presents no problem | **P0** | **run** | **Fix — slot decision, not data** | Measured over 100 seeds. Move stage 1 off Garden, or open it under a booked event, or stop drawing a random first seed. **Raising the arrival rate is barred** by the profile's declared max |
| **210** | No first-run experience | **P0** | **code** | **Build** | Absence confirmed; one quoted phrase is in no document in this tree. Cannot close alone — its tester criterion is #218's |
| **211** | Copy too long | P1 | **code** | **Fix — counts corrected** | **338 words**, not 400; stairs card **70**, not 120. Fix in the two views; `shaped.smallPrint` must survive **byte for byte** |
| **193** | Rebuild the risk register | P1 | **code** | **Fix — widen the scope** | Four registers were overwritten by `1b7a2f1`, not one. **Six** dangling ids across **eleven** sites, not three. R1/R5/R7/R10 were declared permanent |

## Refuted — close with the refutation written down

| # | title (short) | verdict | why |
|---|---|---|---|
| **209** | Tutorial refuses both headline numbers | **REFUTED** | Fixed by `e6a1a3d` on **2026-08-11, 13 days before the issue was filed**. All four acceptance criteria already met; 0 of 100 seeds suppress. **Residual, and it needs its own issue:** `campaign/stageRun.ts` sets no `reportWindow` — 2 of 50 stage-1 seeds still suppress |
| **190** | Close the positioning question | **REFUTED** | Answered 2026-08-08 by § D299, *"the positioning decision, taken by the product owner"*. **#190's proposed answer contradicts it.** Reframe as a supersede, or close. **Escalated** — superseding § D299 is a product-owner decision |

## Rescope or reduce

| # | title (short) | disposition | why |
|---|---|---|---|
| **218** | Define and hold the slice review | **Reduce to "execute the review"** | Duplicates [`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md) § M2's exit criteria almost verbatim, and is blocked on #198. **Its criterion 3 fails today** and the check is an eighth honesty property with no new plumbing |
| **217** | Promote Fix a building | **Rescope — 2 criteria half wrong** | The "stale refusal" **never renders** (`modes.ts:30-32`). The **docstring is already correct**; the inline comment at `:126` is the stale one |
| **189** | Competitive teardown | **Rescope** | A cited four-title prior-art survey exists at `docs/10:673-770`. The *teardown against a common template* is genuinely absent; the "no analysis exists" premise is not |
| **191** | Core loop statement | **Rescope** | `README.md:14-24` and the design-canonical `GAMEPLAY_AND_NAVIGATION.md:249-254` both state a loop, the latter per-mode with lengths and lose-conditions. Must reconcile, not silently replace |
| **188** | Define the two audiences | **Rescope** | `packages/viz/UX.md:757-764` and `:82-89` already define **five** roles. Two inventories neither superseding the other is the stale-statement class this repo exists to record |

## New issues owed, from findings this wave

| finding | where | why it needs its own issue |
|---|---|---|
| Lever button opens the wrong screen | `everyday/reportScreen.ts:281` | § D335 redefined the `stage` key under the call site. A label describing a feature that does not exist — a charter non-goal |
| Register makes a false claim about `LEVER_SURFACES` | `everyday/shell.ts:152` | Says four levers each route; it is two, by decision. **Rendered to the player** |
| Streak refusal is unconditional | `everyday/rail.ts:235` | No producer supplies `profile.streak`. A refusal nothing can retract |
| False mechanism on a player surface | `everyday/settingsView.ts:236-243` | Asserts server-side replay verification two blocks below a register saying this build has no server |
| Campaign path sets no `reportWindow` | `campaign/stageRun.ts:62-75, 110-125` | #209's live residual. **Closing it invalidates `data/scenario-goals.json`** and needs regeneration |
| `## D63` is a duplicate heading | `DECISIONS.md:1888, 1904` | `citations.test.ts` asserts a `§ Dnnn` resolves, **not that it is unique** |
| S5's figure has gone stale twice | `docs/10:1680-1694` | *"four of seven"* against ten shipped stages, and two named clearers have flipped. **No test derives the count across all ten** — which is why it went stale without failing anything |

---

# Wave D — reconciliation, 2026-08-26

**Snapshot:** branch `claude/github-issue-worker-9ol0cy` at `2c7b308` (identical to `main`) ·
**94 open issues, 0 open pull requests** · `npm install` was required before anything (this container
arrived with no `node_modules`) · `npm run typecheck` **exit 0**.

**Why this wave opened on reconciliation.** The wave-C merge says *"every known issue burned down"*
and the open list disagreed with it **in both directions**. Establishing which of the two was wrong
was cheaper than scheduling work against either, so nothing was scheduled until it was. Five
investigation-only lanes ran at once — they write nothing, so they conflict on nothing.

**The wave's error rate held, and it held in the direction this repository keeps recording.** Of the
ten issues verified against their own acceptance criteria, **three were closable and seven were
not**, every one of the seven because a criterion that was *not about writing prose* went unchecked
while a status board recorded the lane as landed. That is [`RISKS.md`](RISKS.md) R38 landing on
`AGENT_STATUS.md` rather than on a docstring.

## Closed with evidence — eight

| # | title (short) | ground | evidence |
|---|---|---|---|
| **198** | Define the vertical slice | **completed** | All four criteria met in `docs/25-vertical-slice.md` — § 1.1/1.2/§ 4 name the seven screens, § 2.1's C1–C12 and § 2.2's G1–G8 are the reviewer's checklist, § 3's X1–X8 carry the playtest thresholds. The *agreed* half is `CHARTER_PROGRAMME.md` § M1's 2026-08-24 gate. Its own mechanical debt discharged: `README.md:276` exists and `documentation.test.ts` is **25/25** |
| **194** | [EPIC] Produce the GDD | **completed** | All five criteria met in `docs/32-game-design.md`. The mode count was checked against the code, not the document — 16 registry rows at `everyday/screens.ts:122-137` plus `menu` = **17**, which is what § 1.3 claims. `get_sub_issues` returns `[]`, so closing orphans nothing |
| **215** | "ATTEMPT 4" after one run | **completed** | `shift/week.ts:395` is the sole increment and was always honest; the dishonest thing was the run beneath it. `everyday/stageScreen.ts:941` now gates on `stageEntryStartsARun` (`:1025`). `stageScreen.test.ts` **pins the call site by source in both directions** — 10 passed |
| **156** | Endless rush has no engine | **duplicate → #220** | Scope transferred first: the arrival formula, § 20.5's hold line, the never-fall-through constraint, § 9.2's stage shape |
| **160** | A campaign day is never filed | **duplicate → #223** | Scope transferred first: the state-model decision, the seam map, § 16 rule 14's warning |
| **164** | Progress dies with the tab | **duplicate → #224** | Scope transferred first: the `persist/validate.ts` migration blocker, the magnitude argument, the pre-written fix site |
| **168** | § 6.2/§ 7.4's ghost | **duplicate → #226** | Scope transferred first: the five-arm inventory, **the finding that `best` is unblocked**, `ghostPlanOf`'s one-field-swap rule, three refusal registers not one |
| **180** | The workshop cannot save | **duplicate → #228** | Scope transferred first: § 11.1's **four** save behaviours, the existing verb set, `sendGateOf`'s total gate |

**No duplicate was closed before its unique scope was on the canonical.** That transfer is the whole
of what closing a duplicate costs here, and five of the five carried implementable detail the
milestone-level canonical compresses away.

## Verified NOT closable — seven, with the unmet criterion named

| # | met / total | what is actually missing |
|---|---|---|
| **211** | 2 of 5 | The budget covers **one slot**, and `reportView.ts:223` says so itself. The report figure cards the issue names by example are still a flat **62-word** block (`mode/casualDay.ts:209`, drawn by `screenDom.ts:137` with no disclosure in `figureCell`) |
| **213** | 2 of 5 | AC4's absence entry is **still shipped** at `everyday/buildNotes.ts:128`, corrected rather than removed and still triaged to **#177**. AC1 is unmet by an argued decision (`dev/reportPanel.ts:231`) that is not written into the issue |
| **214** | 2 of 3 | The contradiction is fixed and reaches the product. **The corpus still cannot see it**: `honesty/surfaces.ts:7391` drives `railModel` with **no options**, so only the absence form renders, and `AGREED_FIGURES` declares one pair that is not this one |
| **195** | 3 of 5 | **No reference board and no visual thesis** (both zero on grep; § 1.1 declines them), and **no minimum stage size**. AC3's stated blocker — *needs a browser* — no longer holds on this host |
| **197** | 2 of 4 | `TEST_MATRIX.md` is **not** rewritten against the map, and both files say so in terms. § 5.2's D1–D10 are recorded, not removed; **D1 still reproduces** in `boardScreen.ts` |
| **201** | 3 of 5 | **Zero occurrences of "dashboard"** — no dashboard, owner or cadence, and the omission is not in the document's own open-items register either. § 8 forbids a read route, so the deployment section currently rules out what AC5 needs |
| **202** | 3 of 6 | The consent surface is **described, not designed** — which is the exact half AC5 excludes. The on-device store the criterion names appears only as somewhere the consent slot may *not* go |

## The cross-cohort mapping, which was owed and did not exist

[`MULTI_AGENT_PLAN.md:122`](MULTI_AGENT_PLAN.md) rules that *"the 34 pre-existing open issues …
are not superseded by the charter tree. Several are children of it; the mapping is produced by
verification and recorded in `ISSUE_WORKER_LEDGER.md`, not asserted here."* **That mapping did not
exist** — this file covered only #186–#193 and #206–#218. This section is it.

**Five pairs meet the duplicate bar** (closed above). **Eleven look like duplicates by title and are
not**, and the sharpest is worth stating on its own:

- **#170 ↔ #229 is now the *opposite* of a duplicate.** § D368 retitled #229 after its own premise
  was refuted, and `buildNotes.test.ts#ABSENCE_TRIAGE` partitions the six `SETTINGS_ABSENCES` rows
  across **four** owners: `Sound` → **#258**, `Units` → **#170**, `Default speed` → **#229**,
  `Clear saved progress` → **#229**, `Post runs to the board` → **#161**, `Sign out` → **#221**.
  The two share **no row**. Closing either against the other would silently drop the Units
  conversion, which `ENGINE_CONTRACT.md` § 13 requires to *convert, not relabel* — a correctness
  bite, since this repository keeps imperial values only in reference data with the unit in the
  identifier. `docs/29` § 8 already ruled *"Do not close #170 outright. Half of it is live work."*
- **#161 ↔ #221** — two owners for one component in `ABSENCE_TRIAGE`, which is the register's own
  statement that they are not one issue. #161 holds a **contract breach needing a server-side
  decision**: § 12.1 says one board a day, `server/challenge/schedule.ts` ships **seven**.
- **#169 ↔ #234** — shared component, **zero shared acceptance criteria**. #169 is unbuilt features;
  #234 is balance of built content.
- Also related-not-duplicate: #162↔#227, #172↔#230↔#166, #179↔#248, #158↔#232, #165↔#238,
  #174↔#235, #177↔#233, #178 § 3↔#225, #182↔#161.

## Two structural findings that outrank the individual verdicts

**No formal epic/sub-issue link exists anywhere in the charter cohort.** `get_sub_issues` returns
empty for all four epics (#219, #231, #241, #247) and every issue in both cohorts reports
`has_parent: false`. The hierarchy is prose plus milestone membership only. **Mechanising it is a
better disposition than closing the cohort-G issues**, and it is what `MULTI_AGENT_PLAN.md` had in
mind by *"several are children of it"*.

**#179 is a hard blocker for M3's #221 and its restatement #248 is filed in M6**, three milestones
later. A blocker filed behind the thing it blocks.

## The M2 gate box that is met and unticked

`CHARTER_PROGRAMME.md` § M2 leaves *"T1 reads `passing` in `TEST_MATRIX.md`"* **unticked**, while
`TEST_MATRIX.md` reads `passing` and [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md)
§ Z records the watched 6/6 run behind it. Not ticked in this wave either — the matrix's figure was
measured at `000852a` and forty-five commits have landed since, so it is being **re-run** rather than
inherited. A gate ticked from a stale row is the thing the gate exists to prevent.


## Wave D, second half — four issues worked, two closed, two refused

| # | outcome | ground |
|---|---|---|
| **147** | **closed** | The card reads `core`'s `HARD_CONSTRAINT_WORDS`, keyed by id so a constraint without words is a compile error there rather than a silent default here. Fallback lives with the surface by that record's own instruction and is **driven** — `hardConstraints` is `readonly string[]`, so `data/` can carry an id the union has never seen |
| **145** | **closed** | `WEEK_CONTRACT_SENTINELS` is mapped by the corpus; `week.test.ts` reads `week.ts` from disk and requires both directions, with a fourth case guarding the regex so two empty sets cannot agree. The **real `SANDBOX_CONTRACT_ID` had never been swept** — the fixture used `'no-such-contract'` |
| **281** | **open — 2 of 5** | AC1 and AC2 met; **AC3 not met and the file says so.** Deleting the reset leaves it 3 of 3 green, because `reconcile`'s clamp covers it locally. The deployed build is unreachable (`curl` → `000`) |
| **173** | **open — premise partly refuted** | `CHARTER_PROGRAMME.md:50` **is** a reservation point and was correct (D374 → D375). It was unguarded, not absent. Now derived, with D63's duplicate registered and the owed count ratcheted at 64 |

**The rule this half kept proving.** Four figures were corrected by measurement before they shipped:
a screen overflow read as `0` that is `8 772`; a margin written as `73` that is `221`; a duplicate
count of `2` that is `1`; and a ratchet that read `69` because it counted its own prose. Three of
the four would have read as tidier findings than the truth.

**What the wave did not do.** It did not close #281 on two of five criteria, did not renumber D63 to
make a duplicate go away, did not rewrite a dated findings figure to make two registers agree, and
did not report a suite run taken over a tree that changed underneath it.

## Wave E — the 2026-08-27 playtest cohort, dispatched as six lanes plus a concurrent verifier

**Snapshot:** 2026-08-27, base `55f2bca` = `origin/main` at dispatch · working branch
`claude/github-issue-worker-tfg581` · PR **#302** · `npm run typecheck` **clean on the merged tree**.

**The batch chose itself.** Nine issues (#287–#295) were filed at 12:00–12:04 on 2026-08-27 from an
agentic playtest round, none triaged, one **P0**, every one carrying file:line mechanisms and a
provenance line pinning the build under test to `55f2bca` — *"both hashes reproduce exactly from
`55f2bca` via `npm run build:web`"*. A cohort with no staleness gap is the cheapest cohort to verify,
which is why it went first rather than by age.

| # | P | lane | outcome |
|---|---|---|---|
| **287** | P0 | A | in flight |
| **288** | P1 | B | in flight |
| **289** | P1 | C | in flight |
| **290** | P2 | C | in flight |
| **291** | P1 | D | **landed** — and the defect had a second instance the issue did not report |
| **292** | P1 | F | in flight |
| **293** | P1 | E | **landed** — four stale sites, not the three the issue named |
| **294** | P3 | D | **landed** — premise refuted as framing; decision taken, number owed |
| **295** | P2 | V | **10 of 16 rows verified**; six filed, two refuted, one referred |

### The habit held again, and this time on the issues rather than on the code

Every lane that has reported found something its brief did not describe, and two of the four findings
would have left an acceptance criterion unmet if the issue had been actioned literally:

- **#291's window claim had a twin two sentences away.** `CASUAL_SMALL_PRINT_LEAD`
  (`mode/casualDay.ts:341`) carried the identical defect, and `dev/reportPanel.ts:1466` joins the two
  into **one paragraph**, so Garden day 1 printed a flat contradiction with itself. The issue quotes
  the second half of that paragraph and did not notice the first. AC3 — *names one window and only
  one* — is red against a tree with only the reported entry fixed.
- **#293's stale sites were four.** `docs/27-flow-maps.md:315` quoted the claim too, two rows below a
  neighbouring claim already marked *"Corrected 2026-08-25 (issue #262)"* — the correction reached
  its neighbour and not it.
- **#293 also carried a defect nobody predicted.** `RUSH_ABSENCES[3]` read *"the five entries
  **below**"* while being drawn in Settings with *The drawing board* underneath it. A register row
  gone stale about **where it is drawn** — the § D227 class turned on the register itself.
- **#294's premise is refuted as framing.** `shift mode` is not an orphan string: `SHIFT MODE` is the
  Engineer header's own eyebrow (`index.html:1720`), required by `docs/12-design-handoff.md` S3 from
  the canonical handoff. The title was **correct until § D335 moved the front door**. R42's shape, not
  a typo — and it changes the fix, because there is a live consumer to keep true.

### What the corpus had never read

`honesty/surfaces.ts` seeded three of the four cells the standings row draws. **`held` was the
missing one** — so `'57 min'` against a handle, which is precisely the *other player's figure* #293
opens on, had never been read by the search. Found while adding the marker, not by looking for it. It
carries its own owed-decision marker at the site, in `honesty/surfaces.ts`.

### Two instruments, and only one of them proves what it claims

Both merged lanes' checks were **mutation-validated by the integrator**, not only by the lane that
wrote them, and the results differ in a way worth recording:

| mutation | import-graph case | browser case |
|---|---|---|
| revert the tab title | **red** (2 of 4) | — |
| drop the rush note from the renderer | **green** | **red** |

The import-graph case is green under a mutation that removes the note from the page, because the
import survives the deletion of the `append`. **Lane E said so itself** — *"an import is evidence,
not proof — which is why the browser case compares painted rectangles"* — and that is why the browser
case exists. A lane that had claimed the weaker instrument was sufficient would have shipped a check
that cannot fail for the reason it was written.

**Lane E also caught its own first instrument passing against the defect it was written for.** v1
asked whether the docstring named the renderer *anywhere*; `RUSH_BESTS`' history section mentions
`rushScreen.ts` only to say what it does *not* import, which satisfied the check. Narrowed to the
docstring's lead, it fails on the base wording. That is the page-error-probe lesson landing on a
lane that then applied it to itself.

### The ratchet was at its ceiling, and it was not moved

`validation/documentation.test.ts`'s owed-decision ratchet stands at **64 with zero headroom** and its
docstring says it *"may not rise"*. Three new markers took it to 67. The lane **did not raise the
ceiling** and **did not rephrase to dodge the grep** — the gate's own docstring forbids the second —
and folded both arguments under `casualDay.ts`'s existing module-level declaration instead.

**It then reported a blind spot it could have used silently:** `filesUnder` scans `.ts` and `.md`
only, so the `index.html` marker is not counted at all. Owed its own issue. A lane that benefits from
a gate's hole and says nothing is the more expensive outcome, and this one said so in the open.

### Six issues filed from the verifier, and two rows refuted

**#296** (F35), **#297** (F27), **#298** (F24), **#299** (F36), **#300** (F23), **#301** (F40).

**#296 is a twelfth dead seam with a false disclosure on top**, and it is the row #295 nominated to be
verified first — *"the agents disagree"*. **Both agents were right.** `drivingProfileOf`
(`dev/state.ts:1153`) reads `state.levers`, `state.selectorSpec` and `state.ruleRows`, and never
`state.dispatcherSpec`, so `lobby` travels and **all 13 term sliders and all 3 behaviour flags are
byte-identical on the legs** — while `everyday/actionBar.ts:340` tells the player *"Unsaved changes
travel with the run."* `scope/surface.ts:262` already declares the field latent in those words.

The single browser case guarding that screen passes because **its own docstring names the false
premise**: it asserts on the printed cost expression, which *is* composed from the ignored weights.
An assertion on a window statistic rather than on the legs — the standing requirement failing on the
one screen written to satisfy it.

**F34 refuted on its load-bearing word.** The fourth campaign goal is not *silently* dropped:
`campaignModel.ts:267` gives the row `refusal: TRIPS_REFUSAL` and `campaignScreens.ts:298-302` draws
it. Its duplicate note against #277 is wrong too — different surfaces, different arrays, no overlap.
**F39 refuted for the report's figure grid** by trace rather than by failure to reproduce, which is
the stronger verdict; the row stays open, narrowed, because the other candidate was not localised.

### What this wave has not done

- **The honesty corpus is not re-measured and no counts are published** (§ D343). Both merged lanes
  ran the always-on tier as a pass/fail gate only, and said so.
- **The honesty corpus is not re-measured and no counts are published** — § D343 takes that once,
  **after this merges to `main`**, and three lanes added player-facing strings, so the Phase 9 figures
  in `CLAUDE.md` will move. **That measurement is owed to the next session.**

## Wave E closed — the integrated result, measured rather than inherited

**The full suite ran on the integrated tree, twice: locally and on both CI legs.**

| run | result |
|---|---|
| local, integrated tree | **463 files · 9 106 passed · 11 skipped · 1 failed** |
| CI `suite (linux)` at `0c694b1` | **green** |
| CI `suite (macos)` at `0c694b1` | **green** |
| `Review`, `Deploy viewer` | green |

**The local failure was the most useful result of the wave**, and it was Lane F's own count gate red
against Lane F's own figure: the browser-tier file count read **29** on its branch and **30**
integrated, once Lane A added `autoFile.browser.test.ts`. Three values in one wave — 25 in the support
matrix and 26 in `M2_MEASUREMENT.md` when the wave opened against a tree of 28, then 29, then 30 —
**each correct where it was taken.** The gate proved itself on the person who wrote it.

### CI then failed twice more, and the first diagnosis was wrong

`suite (linux)` and `suite (macos)` both went red on the viewport register, **byte-identically**. The
first hypothesis was a timing race and it was **withdrawn**: identical output from two different
runners is not what a race produces. Five local conditions were green — default, a 20× CPU throttle,
forced `prefers-reduced-motion: reduce`, the full Chromium build, and the whole suite at default
parallelism — and CI's browser could not be installed here (`playwright-core` pins **1234**; this
container has **1194**, download blocked).

**The root cause was the pinned scroll offset.** Every control existed in all three environments —
the same stage drew `stage-play`, `stage-start`, seven speed chips, a primary, a back and a leave
everywhere. Only *which of them fell outside the viewport* differed, and the two answers were **near
complements**: the signature of a scroll container resting at opposite ends. `MEASURE` pinned each
`hidden`/`clip` box to its **current** offset, but such a box cannot be moved by any gesture, so that
offset was put there by script. Reading reachability from it asks a question about the browser.
Zeroing first asks what the clause means.

**The register is unchanged by that fix**, which is the evidence it is right: a no-op on the leg that
was green, a definition on the legs that were not. No register entry was added, deleted or reworded
to reach green — that register is the record of what #240 has to fix.

## Wave E dispositions

| # | disposition | evidence |
|---|---|---|
| **287** (P0) | **closed** | Four ACs met. Its *"not more than once per sitting"* **refuted** — the loop banks a week; its arithmetic wrong in every operand |
| **288** | **closed** | Four ACs met. Its headline `2 915 s` **misattributed** — fixing what it described would have relabelled the number and left it on the card |
| **289** | **closed** | Three ACs, **AC2 raised** — a caller-set test could not have caught a bypasser |
| **290** | **closed** | Two ACs. Its *"counter correctly stays at 0"* **refuted** — no guard existed, that day was missed |
| **291** | **closed** | Three ACs. A **twin defect two sentences away** would have left AC3 unmet |
| **292** | **closed** | Four ACs. Its location claim **refuted**; instrument red-by-register, calibrated independently |
| **293** | **closed** | Three ACs. **Four** stale sites, not three; a register row stale about where it is drawn |
| **294** | **closed** | Three ACs. Premise **refuted as framing**; decision recorded as § D375 |
| **295** | **open, deliberately** | Its criterion is *"closes when the table is empty"*. Six rows remain (F22, F26, F28, F32, F37, F38) plus the narrowed F39 and the F33 product decision |

**Six of the eight closed issues carried a claim that verification refuted.** That is the wave's
headline and it is the fourth consecutive wave to report it.

**Filed from findings:** #296 (a **twelfth dead seam**, with a false disclosure on top), #297, #298,
#299, #300, #301, #303. **Decisions allocated:** D375–D385.

**What no fix in this wave has:** verification against a deployed artifact. The PR's Azure preview is
unreachable from this container — `CONNECT` returns **403**, as § D374 recorded on 2026-08-25.

---

## Wave F closed — the 2026-08-27 verifier's own findings

**Base `f13d455`** (wave E merged). **Integration branch** `claude/github-issue-worker-5rz7vo`,
PR **#304**. Five build lanes in worktrees, one read-only triage lane run concurrently.

### Dispositions

| # | P | disposition | evidence |
|---|---|---|---|
| **296** | P1 | **fixed — disclosure** | All clauses confirmed on the legs; widened to 13 terms and 3 flags **one at a time and all together: moved the legs 0, inert 16**. A half the issue does not name and § D227 rates worse: `workingCopyIsDirty` never read `levers`, so `lobby` — the one lever that *does* change the run — said *"Nothing changed yet."* § D386 |
| **297** | P1 | **fixed — the sentence names its window** | Reproduces exactly: **44 of 361 playheads (12.2 %)** on `garden-apartments` 3 600 s seed 20260827. Invisible on the standard fixtures — all eight buildings report zero at the 900 s breadth rates, which is why seven waves never saw it |
| **298** | P1 | **fixed at the seam** | 1 432 px reproduces to the pixel on a **built bundle**, not a dev server. Three refutations, one of which decided the test's shape — see below. Fixed in `shell.ts`, so it holds for all nine screens that rebuild in place. § D388 |
| **299** | P2 | **fixed — text, pinned to a run** | Confirmed digit for digit on five buildings, then **measured on all eight because that is where the remedy is offered**. Only two of eight behave as the withdrawn sentence assumed. § D392 |
| **300** | P2 | **fixed — asks the run** | All five rows reproduce, **and the issue named the smallest of three producers**. #36's case kept **by construction** (`growthFactor(1)` is exactly 1), not by a branch. § D390 |
| **301** | P3 | **fixed at the model** | Confirmed by construction (1 resolved / 5 unresolved / 2 shown drew both rollups unqualified). `answerFor` deliberately **not** touched — shared with the Engineer panel and the CLI. § D389 |
| **303** | P2 | **fixed — § 2 met, not renegotiated** | 42.5 % at 1280×800 confirmed; `340px` → `60vh`. The margin is **zero on purpose** rather than padded to a threshold with nothing behind it. Three clause-2 entries left `OUTSTANDING` on the fixing commit. § D391 |

**Every lane refuted something in its own brief — the fifth consecutive wave to report it.**

### The refutations that changed what was built

- **#298's mechanism was incomplete, and the missing half decided the instrument.** The clamp needs a
  layout forced *while the container is empty*, and what forces it is the **focus teardown of the
  control just pressed**. A synthetic `element.click()` loses **0 px at every offset**, before the fix
  as well as after — **a case built that way would have been green on the defect.**
- **#298's *"at 1280×800 both screens fit"* is false** — 623 px and 1 071 px of overflow. The desktop
  row was an artefact of measuring from offset 0, so desktop is a second instance rather than a control.
- **#300 named one producer of three.** The calendar is worse than the growth it reported — *1 710
  people about a run of 437* — and commissioning is a third.
- **#299 understated itself.** Crown Hotel raises the dropped count on the **first** press off its own
  minimum; St Jude's refuses on `censored` and never on `saturated`. Its `garden-apartments` ladder was
  refuted **in the direction that strengthens the issue**.

### Recorded rather than fixed

- **No player can press a fix-it repair card at 375×667** — 30 px wide, 807 px tall, overlapping,
  pushed outside the region; `elementFromPoint` answers `null`. That is why #298's `3 713 px` row could
  not be reproduced. A **dead control**, not cramped layout. Belongs to **#240**.
- **The PR preview is still unreachable** — `CONNECT` 403, re-measured on this PR's own stage URL
  rather than inherited from § D374. **Fourth consecutive wave with no fix verified against a deployed
  artifact.**

### What the integrator verified rather than accepted

- **Every lane's instruments were mutation-validated by the integrator.** Lane A's reported *"4 RED"*
  measured as **3**; corrected rather than repeated. Its real proof is the two-state mutation, failing
  with *"`["viewer.dispatcherSpec"]` reaches no run and the bar would still claim the edit travelled"*.
- **Lane D's two `shell.browser.test.ts` failures were checked, not accepted as contention** — 15/15 in
  isolation, exit code read directly.
- **A local full-suite run reported `exit code 0` from the harness and `VITEST_EXIT=124` from vitest.**
  It was killed by its own timeout and produced no result. **It is not recorded as a pass.** CI's
  completed run is the one quoted: 465 files, 9 143 passed, 12 skipped, one failure.

### The one CI failure, and what it says

`viewportGateClaims.test.ts` red on `suite (macos)` at `5cc39bf`: Lane C's new browser file took the
tier to **31** while five sites still said **30**. Re-derived rather than copied from the failure.

**That count has now been wrong at five distinct values** — 25, 26, 29, 30, 31 — every one correct where
it was taken. R38 caught by a gate built for R38, and **no mutation was needed to validate the
instrument: CI failed on it live.**

### Process, changed before dispatch rather than at integration

- **Decision numbers pre-allocated D386–D392**, because the owed-decision ratchet sits at **64 with zero
  headroom** and the standard *"say a number is owed"* brief now hands the integrator a red gate. Six
  used; charter next-free **D393**, reconciled **four times** because every lane edited that row and each
  was correct on its own branch.
- **Ownership declared by function rather than by file**, so `dev/state.ts` and `batch/report.ts` each
  carried two lanes instead of serialising four into two.

### Owed to the next session

- **#256 is verifiably already fixed and is not closed** — all four criteria met at `f13d455`. Closure
  was left to the owner rather than taken.
- **#237 (P0) and #171 need rescoping, not building.** Both rest on premises the code refutes.
- **Five of the 26 unledgered issues carried adjudications posted as GitHub comments that never reached
  this file**, three with allocated decision numbers. The ledger has been competing with a second
  record; § C of `ISSUE_TRIAGE_PLAN.md` names them.
- **#270 and #275 were silently unblocked** when #280 merged on 2026-08-26. Nothing in this process
  watches for a blocker clearing.

## Wave G closed — the CI and test-infrastructure cluster, 2026-08-29

Merged as PR #307 → `6260dcb`, over wave F's `0cd422a`. Five lanes, **five issues closed with
evidence** (#163, #149, #175, #130, #286) and **two new issues filed** (#305, #306) — both of them
reds that only existed because a lane turned a tier on.

Decision numbers pre-allocated **D393–D395**; three used, and lanes D and E each finished without
needing one, which is the allocation working rather than a shortfall.

### The wave's actual product: two tiers that had never run

Lane A's issue (#163) was that seventeen opt-in tests, including the only seed-collision check in
the repository, had never executed in CI — `ci.yml` runs a bare `npm test`, no workflow set a
deep-tier variable, and **no workflow in the repository had a `schedule:` trigger at all**. The
lane's deliverable was `.github/workflows/deep-tiers.yml`, nine jobs, one tier per job.

Turning them on immediately produced two reds, and both were **recorded rather than fixed**:

- **#305** — deep fuzz, 1 counterexample in 250 cases: `fuzz-1000130` ends at `t = 3493.7776`
  against its own hard deadline of `t = 3493`. Not a rounding artefact; `checkTermination`'s
  `EPSILON` is `1e-9` and the overshoot is 0.78 s.
- **#306** — the 200-replication matrix census, which every declared ceiling and spread is derived
  from, disagrees with `MATRIX_CELLS` in three places. These bound every interval the experiment
  matrix publishes.

Neither was re-baselined to make a tier green. **A declared figure that no longer reproduces is a
finding about the budget published intervals were computed under, not a number to update** — both
are worked in wave H as lanes A and B.

### What the integrator verified rather than accepted

- **One CI red, and it was invariant 6.** `deepTiers.test.ts` — the aliveness audit — named three
  `packages/viz/...` paths from inside `packages/experiments`, so `boundaries.test.ts` failed
  correctly. Three fixes were rejected before the right one: composing the path is rephrasing around
  a grep, deriving both sides is a tautology, and loosening the pattern weakens a gate. The audit
  moved to `packages/viz/src/` instead (`1052597`), where `boundaries.test.ts` itself lives.
- **Two mutation attempts silently failed to apply** while validating that fix — one regex missed
  the entry shape, one deleted a comment line. **Neither was counted as evidence.** A mutation that
  does not land is not a mutation that failed to redden.
- **The browser-tier file count was wrong at a sixth distinct value** (`c99e550`): 32, against two
  documents saying 31. The series is now 25, 26, 29, 30, 31, 32 — every one correct where it was
  taken. R38 caught by a gate built for R38, six times.

### The process failure, which the lane caught and the integrator did not

The integrator read 0 commits and 10 minutes of uptime, concluded the first dispatch had died in a
container restart, and re-dispatched — producing **ten lanes on five issues**. It was caught by
**Lane B**, which noticed its scratchpad file had been overwritten by a sibling, not by the
integrator. Five duplicates were stopped.

The reading was made from detached worktree HEADs rather than from branch refs, which is why a lane
that was mid-A/B-run looked idle. **Branch refs, not worktree HEADs**, is the rule that follows.

### The corpus measurement, and the first move this row could attribute exactly

Measured once on the integrated tree, both tiers in one sitting, per [§ D343](DECISIONS.md):

| tier | cases | strings | simulations | surfaces | failing |
|---|---|---|---|---|---|
| always-on | 49 | 570 560 | 606 | 51 | 0 |
| deep | 60 | 711 737 | 4 710 | 52 | 0 |

Strings moved **+343** and **+420** against wave F, with cases, simulations, surfaces and failing
cases all unmoved. `EVERYDAY_STAGE` gained the stage's **seven** speed chip faces, seeded once per
case: **7 × 49 = 343** and **7 × 60 = 420**. The move is the seeding and nothing else, to the
string — the first time this row has been able to attribute its own movement rather than report it.

The surface **sets** were diffed rather than the counts compared, and the deep tier's one-surface
lead is still exactly `campaign/judge.ts#judgeStage`.

### Owed to the next session, and discharged in wave H's opening

- **The ledger had no wave G entry at all** until it was written retrospectively here. A wave that
  merges without its record is a wave whose reasoning survives only in commit messages, which is the
  thing `CLAUDE.md`'s working agreements exist to prevent.
- **§ D394 had no heading.** Reconstructing this entry turned up `it.## D394 — …` on one line in
  `DECISIONS.md`: § D393's closing sentence and § D394's heading were merged during this wave's own
  integration. Five `.ts` files cite `§ D394`. **Re-breaking it leaves `citations.test.ts` and
  `documentation.test.ts` green** — the resolver iterates markdown documents only, so a `§ Dnnn` in
  a TypeScript file is checked by nothing. Fixed in `16abc54`; the gate hole is wave H lane E's.
- **D387 was allocated in wave F and never written.** The heading audit reports 387 headings and
  missing numbers `44, 55, 78–84, 387`. The first nine are historic; **387 is a hole this process
  just made**, and nothing noticed for a wave. A block-allocation mechanism has to say what becomes
  of an unused number.

## Wave H — dispatched 2026-08-29

Five lanes over a backlog of 78. Decision block **D396–D403** to lanes A–D, with lane E owning
**D404 upward** because its burn-down needs a variable-size block.

| lane | issue | subject |
|---|---|---|
| A | #306 | Attribute the census divergence before re-declaring anything, then re-derive what was computed under the old ceilings |
| B | #305 | Root-cause the 0.78 s termination overshoot; `EPSILON`, `PROPERTY_BOUNDS` and the generator are all off limits |
| C | #223 | Campaign days must file: the loop that records nothing when a day completes |
| D | #214 | The rail's pre-attach paint, and the corpus pair that would have caught it |
| E | #173 | A stated way for a lane to reserve a decision number, and the owed backlog it would stop regrowing |

**Composition rule applied:** the two reds this process itself filed go first. A wave that files reds
and then works new features leaves its own findings to rot, and #306 in particular invalidates the
budget every published matrix interval was computed under.

**Before dispatch**, `.worktree-setup.sh`'s `@elevator-sim` links were derived from `packages/*/`
rather than from a hand-written list (`8aafd7e`). The list read `core experiments cli viz` and
omitted `server` — so the one workspace it failed to name resolved to the **main checkout**, which is
exactly the failure the script's own header comment exists to prevent, arriving through the list
instead of through the symlink.

## Wave H closed — the two reds this process filed, the campaign loop, and the ratchet, 2026-09-01

Five lanes over a backlog of 78. **Six issues closed** (#306, #305, #223, #214, #173, #310), one of
them filed and fixed inside the wave.

### The lanes were stopped by a rate limit, and the wave survived it

All five terminated mid-task on the account's weekly limit — not a wall in the work. **Every one had
committed incrementally, so nothing was lost**, and the integrator finished, reviewed and verified
the merge. `RISKS.md` R41 (*a lane that commits only at the end loses the lane*) is the reason this
is a paragraph and not a re-run.

Two lanes were mid-sentence when they stopped: Lane C's last words were *"now the DECISIONS entries
and the `AGENT_STATUS.md` correction"* and Lane D's *"now the DECISIONS entries"* — both of which had
already landed in earlier commits. A lane's plan for its next step is not a claim about its last one.

### What the integration caught that no lane could

**Lane A's figures predated Lane B's fix.** Lane A re-declared census ceilings measured *"on the tree
carrying § D131's simulated decks, § D332 and § D333"* — a tree **without** Lane B's departure
gating, which changes when a car may depart near the drain deadline, the exact regime the census runs
in. Publishing them unchecked would be the measured-on-one-tree-published-against-another defect this
file has recorded three times.

Re-censused on the integrated tree: **2 tests, exit 0, 404 s**. The census is deterministic under a
fixed `MATRIX_SEED` and common random numbers, so the result is exact rather than probabilistic —
**Lane B's fix does not move the census figures**, and Lane A's re-declarations stand.

That check was possible only because the two lanes were read against each other. Neither could have
run it: Lane A's tree had no fix and Lane B's had no re-declaration.

### The reservation mechanism caught the integrator on its first wave

Lane E's § D404 makes a wave's decision block a checked object: while a reservation is open the
charter row names the block's **floor**, no heading may exceed its **ceiling**, and the case goes red
until the block is emptied and the row reconciled on the same commit.

Its ceiling check fired on **§ D418**, written by the **integrator** mid-wave, one past the block.
Not a lane — the author of the process. The number was kept (ids are names here, and it was already
cited from `vitest.config.ts` and #310) and the block closed. **The sizing lesson is recorded in the
file rather than in a person's memory: an integrator who works during a wave needs a number reserved
too.**

Lane E also repaired the ratchet's non-vacuity guard rather than deleting it, which is what the brief
warned against and what the obvious reading invites. `expect(owed).toBeGreaterThan(0)` guards the
**defect**, not the instrument: it is satisfied by any single site anywhere, and it goes red on the
commit that settles the last one — the very commit the gate exists to reward. Replaced by two
assertions on the instrument (the walk finds >500 files; the pattern still matches a control
sentence), so `owed === 0` is a legitimate green. The ceiling fell **64 → 5**, lowered *to* the
measured count and never below it.

### The integrator's own defects, both found by writing things down

- **§ D394 had no heading.** Reconstructing wave G's ledger entry turned up `it.## D394 — …` on one
  line: § D393's closing sentence and § D394's heading merged during wave G's own integration. Five
  `.ts` files cite it. **Mutation-validated that nothing catches this** — with the heading re-broken,
  `citations.test.ts` and `documentation.test.ts` both pass, because the `§ Dnnn` resolver iterates
  markdown only and the heading regex is anchored. The audit happened because the record was being
  written, not because a test ran.
- **A build break was pushed.** Closing the reservation with a bare `= null` narrowed the `const` to
  `null`, making the open-wave branch `never`; `tsc -b` failed with eleven errors and took all three
  CI checks with it. The edit had been validated by running the tests it belongs to, **and they
  passed — vitest transpiles rather than type-checks**. `npm run typecheck` is the same `tsc -b` and
  would have caught it; it was run after the merges and not after that edit. The rule is not new; the
  failure was skipping it.

### The corpus, and the first time this row's old figures were checked

| tier | cases | strings | simulations | surfaces | failing |
|---|---|---|---|---|---|
| always-on | 49 (0 skipped) | **571 205** | 606 | **53** | **0** |
| deep | 60 (0 skipped) | **712 547** | 4 710 | **54** | **0** |

**Before publishing, the base was re-measured and reproduced its published row exactly** — 570 560 /
606 / 51 / 0 at `6260dcb`, in a detached worktree so it could not disturb the deep tier running
against the working tree. This column has been wrong five times, and this is the first time it has
been checked in the one direction that distinguishes a correction from a move.

Sets diffed rather than counts compared: **+2 in both tiers, nothing removed**, both named —
`everyday/rail.ts#railFooter` and `everyday/weekView.ts#weekScreenViewOf`, #214's declared pair. The
deep tier's one-surface lead verified by set difference: `campaign/judge.ts#judgeStage` is the only
deep-only surface and nothing is always-on-only.

**The string move is not attributable to the string, and that is published rather than glossed.** 645
over 49 cases and 810 over 60 are not integers and no arithmetic makes them one — those two producers
emit a state-dependent count. Wave G's exactness came from a chip face seeded once per case; claiming
the same precision here would be manufacturing it.

### Owed to the next session

- **#176 is measured and unfixed.** *"The three DOM panels are statically swept"* is published in six
  places and none names which three; derived, it is **17 `#mount*` ids and 16 `*_SCREEN` rows** of
  216 exclusions, and even the narrowest reading is four rather than three. The derivation is on the
  issue so nobody has to re-take it. *(Closed in wave I by lane B, [§ D421](DECISIONS.md) — as **33**
  rather than 17: the classifier's own reasons put mounts and screen rows in one class, and stopping
  at the mounts is how `docs/14` came to put a fifth panel in a class of three. All six sites now
  derive it from `NOT_PLAYER_FACING` rather than carry a typed number.)*
- **The `§ Dnnn` citation gate still reads markdown only.** Lane E was handed it; whether it landed
  widened is for the next reader to check rather than assume. *(Checked at wave I's dispatch rather
  than assumed: **it did land** — the resolver iterates `[...DOCUMENTS, ...SOURCES]` with its own
  non-vacuity guard on the `.ts` walk.)*
- **D387 remains a registered hole**, and the mechanism that would have prevented it now exists.
- **The ratchet sits on its ceiling again at 5 with zero headroom**, which is the ratchet working and
  the next lane's operational constraint.

## Wave I closed — the instruments, and Wave H's leftovers given owners, 2026-09-01

Five lanes. **Three carried scope wave H left behind**, assigned to an owner rather than kept as a
note: #309's surviving red (A), #176 which wave H measured and deliberately did not fix (B),
`M2_MEASUREMENT.md:410` which wave H deliberately left (C), and #181, #223's other half (E).

### The wave's largest finding is that a scheduled tier had never run

Lane A **refuted the integrator's hypothesis**, which is what it was asked to do. The `perf-sweep`
job's four-second failure was offered as the signature of vitest's 5 000 ms default that § D418 had
just removed. It was not. § D418 was already on `main` and the failure survived it:

```
RunnerError: Worker failed to initialize: Cannot find module
  '@elevator-sim/core/dist/index.js'
```

The deep arm is the only tier running `parallel: { mode: 'workers' }`. **A worker thread is loaded by
Node, not vitest**, so it resolves `@elevator-sim/core` through `node_modules` to `packages/core/dist`
— which `npm ci` does not create and the job never built. The always-on cases in the same file passed
because they are serial and resolve to source through vitest's alias. The timing settles it: the deep
arm took **188 ms**, not four seconds. A timeout does not fail fast; this failed fast because nothing
ran.

**So #163's acceptance clause was never discharged.** The seed-collision check — the tier landed in
wave G — was wired, scheduled, named in `deepTiers.test.ts`, counted in every audit, and had **never
executed a replication**. A dead seam wearing a green tick, inside the workflow built to stop exactly
that.

### The browser tier was certifying an artifact players never receive

Lane D measured the gap rather than listing Vite's documented differences, driving both servers side
by side at one viewport. Most differences **do not bite**: the stylesheet is inline and byte-identical
(same SHA-256), every box matches to 0.01 px, and nothing in `packages/viz/src` reads
`import.meta.env`. **The asset surface is the whole of it** — `publicDir` is the repo's `data/`, so
the dev server answers `/buildings/midtown-office.json` with `200 application/json` while the bundle
answers the SPA fallback, `200 text/html`. A seventh fetched document would work on every machine here
and fail in production.

**Both CI reds on this PR had one cause, and it was the harness.** The old helper *built* on every
call and two files called it — concurrent builds into one `dist-web` with `emptyOutDir: true`.
Measured by running it twice: **404 on 63 of 87** requests for `/`, 62 of 87 for the entry chunk,
18 of 140 for `/fixit-cases.json`, in a ~900 ms window. macOS's `ERR_HTTP_RESPONSE_CODE_FAILURE` is
that directly; linux's *"no heading"* is `fixitScreen.ts`'s load-failure branch, which has no `h1`.

**#281's own stated mechanism is refuted** and no replacement is offered — § D426. `scrollTop` reads
0 the moment `reconcile` empties the container, before any layout is forced, and with the reset
deleted **both** artifacts report offset 0, so the artifact was never the difference. What makes the
offset survive on the deployed build is unmeasured, and #123 blocks the measurement that would settle
it. That is § D256's discipline: refute the mechanism, publish the negative, and do not supply a
second plausible sentence.

**The tier got cheaper**: 268.98 s → 166.2 s. One build added, 29 dev-server startups removed.

### A gate that had been green over five stale sites

Lane C found `viewportGateClaims.test.ts` — R38's own instrument, and the gate that caught the
browser-tier count during wave H — **passing over five stale sites**. Its shapes matched a literal
space; Markdown wraps at 100 columns, and two sites had a newline where the regex wanted one. Three
more spelled the count in no shape it knew. Shapes now join with `\s+`, a third is added, and the
unshaped sentences were **reworded onto the shape** rather than the regex taught three phrasings.
Its strengthened guard then found all three survivors unaided — better evidence than an injected
fault.

That is worth reading beside wave H's ledger entry, which reports the integrator fixing *"four live
sites"* on this gate's say-so. Four was what the gate could see.

### The count that was never a measurement

Lane B published #176's figure as **33 — 17 mounts and 16 screen-registry rows** — rather than the 17
the integrator's own derivation had suggested, and the reason is the better one: the classifier's
reasons put all 33 in one class, so stopping at the mounts leaves 16 exclusions taken on identical
ground uncounted, **which is exactly how `docs/14` came to put a fifth panel into a class of three**.
It also refused a bare 33, because each screen row names the adapter that drives its words. The
decomposition and that clause now travel with the number at all six sites, none of which carries it
as a typed number.

### A purchase reaches the run, proved on the legs

Lane E's evidence is **13 of 16 tiers move the legs** at the campaign's own cell, same seed, purchase
against none — and the three that do not are each asserted *with* a cell where they do, with a
physical reason (two cars over an hour of residential trickle never fill). Its first finding is
§ D112's defect bought with units: a tier that only set `callType` reached the run and changed
nothing.

**Its journey evidence got stronger during integration rather than weaker.** The cross-lane check —
lane D changed which artifact the browser tier drives, and lane E's proof rests on journey tests in
that tier — resolved positively: `campaignJourney.browser.test.ts` now calls `startShippedSite`, so
that evidence runs against the **shipped bundle**, and the tier is green on the integrated tree
(33 files, 192 tests, exit 0).

### What the integrator's own commit ran into

Wave H's block was fitted to its lanes and § D418 was written past it. Wave I's reserved D429–D430
for the integrator, and closing it found the case § D404 could not have: **a hole at a block's top
points the charter row straight at it.** Hence § D430 — holes may sit anywhere in a block except its
top — and D428, lane E's unspent number, sits safely inside it.

`citations.test.ts` then refused this commit twice, correctly both times: once for a relative path
escaping the repo from a root document, and once for the hole cited as a section — including when the
entry explained the refusal *by example*. That is § D405's convention arriving at a second gate:
**name it, do not utter it.**

### Owed to the next session

- **#176's other two families are untouched** and § D421 says so: the mount-private prose is not
  exported, R2's replication-budget clause is still deep-tier-only, and `UX.md` § 26's owed drive
  coverage is unmoved. The counting half is closed; the gap is the same size.
- **The `packages/viz` export count is unpublishable** until the audit's own figure can be read off a
  run — two derivations disagree and vitest swallows the instrument's output (§ D429).
- **`scenario-goals.json` removed left the tier green** — a coverage gap lane D reported rather than
  hid.
- **#181's remaining two breaks**: nothing increments `trips`, and `CampaignTower.buildId` reaches no
  run.
- **`assertCoreBuilt()` compares mtimes while `tsc -b` re-emits on content hashes**, so a touched
  source leaves the guard red until a rebuild. Errs safe; worth a sentence in its docstring.

## Wave L closed — the six untriaged, and three premises that did not survive, 2026-09-02

Four lanes over the six issues filed on 2026-09-01 out of waves J and K, none of which had reached
any coordination artifact when this wave opened.

| issue | disposition | evidence |
|---|---|---|
| #315 | **fixed** | `3e2d8f3` · one rule, both sides derive it; `tsc -b` clean, server 335/335, experiments barrels 103/103 |
| #316 | **fixed** | `587dee0` · shared axes named above, varying named per row; menu + menuPanel + honesty 354 passed |
| #317 | **fixed** | `0f5124b` · sweep split per dispatcher; **full `viz` 4 882 passed, 3 skipped, exit 0, 363 s** |
| #320 | **fixed** | `0f5124b` · claim retracted, survey published, `cli` given the constant |
| #321 | **fixed** | `a661238` · `.gitignore` matches a symlink, `pkill` hazard documented |
| #318 | **deferred, premise refuted** | the check it asks for predates it by six days and runs green |

### The wave's real subject is that most of these reports were wrong about something

Not wrong to file. Every one of the five named a real defect, and every fix stands. But **three of
the four carried a stated mechanism, figure or remedy that did not survive measurement**, and in each
case the lane published the correction rather than quietly working around it. That is `RISKS.md`
**R35** — *inbound feedback has a measured error rate* — recurring at full strength.

- **#321's mechanism.** It says `.worktree-setup.sh` *"deliberately creates `node_modules` as a
  symlink"*. It does `mkdir -p` and builds a real directory. The git behaviour is real and
  reproduces in all four cells; the explanation is not.
- **#321's exit code.** Reports cite 144. Measured: SIGTERM yields **143** for bash and node alike,
  and 144 is 128+16, `SIGSTKFLT`, which a default `pkill` does not send. Flagged unresolved rather
  than explained away, and the note written not to depend on it.
- **#321's nominated safe form.** *"Check `/proc/<pid>/cwd` resolves inside the worktree, then kill
  by PID"* still kills the agent's own harness, whose cwd **is** the worktree root. The committed
  form walks the `PPid:` chain and excludes self and ancestors. Had the lane written the brief's
  version verbatim it would have been a plausible sentence in place of a measurement.
- **#315's suggested destination.** The brief said move the rule into `core`; `shiftReportWindowFor`
  is defined entirely over `MATRIX_CELLS`, so `core` would have had to acquire the cells — the
  brief's own stop condition. The lane inverted the move instead.
- **#318's premise.** *"The collision survived because no check looks for it."* The check exists,
  registers D63 deliberately, landed six days before the issue, and runs green.
- **The integrator's own first reading.** A looser grep reported `D125` as a second duplicate. It is
  not one: `DECISION_HEADING` requires the em dash immediately. Recorded because this file's subject
  is stale counts.

### Two lanes were told to stop, and stopping is what found the better answer

Lane A's brief named an escalation trigger — *stop if moving the rule into `core` requires pulling
`MATRIX_CELLS` in*. It hit exactly that, and rather than forcing it or halting, put the rule where
the cells already live. `core` gained no dependency and no file under `packages/core/src` changed.

Lane C was told not to raise a budget to hide a red. It did not, twice over: it split the unit so
vitest schedules something smaller than the budget, and when it found the neighbouring `viz`
headroom figures wrong by more than 2× it **published the correction and left the constant where it
was**.

### What each lane found that nobody asked for

- **Lane B found three more false statements** on the screen it was fixing: an empty board printing a
  *"rows disagree"* refusal about rows that do not exist; a notice diagnosing a mixed board as
  client/server disagreement, which § D439 makes the working product; and `beatDetailOf` claiming it
  *"loads this board's configuration"* when `selectionFromRun` has always taken every field from the
  row.
- **Lane D found `RISKS.md` R43**, now registered: § D4 still instructs the `node_modules` symlink
  that `.worktree-setup.sh` exists to replace, and § D6 rests on the superseded form **as its
  reason**. A reader following § D4 creates the symlink #321's `.gitignore` defect then tracked, so
  the decision manufactures the hazard.
- **Lane A found an existing fixture passing on a run the client called quotable and the server
  refused** — this same defect wearing different code. Raised 40 % → 60 %, assertion unchanged.
- **Lane C found the next #317, already worse.** `campaign/campaign.test.ts` at **109 041 ms**, the
  same shape one file over; at the measured 4.5× amplification that is **490 s against a 300 s
  ceiling**. `campaign/stageSequence.test.ts` behind it at 77 363 ms. Neither fixed.
  **Corrected 2026-09-05 — the ceiling in that sentence is the wrong ceiling.** Both cases carry an
  explicit per-test timeout overriding the project default: `campaign.test.ts:866` closes
  `}, 3_000_000);` and `stageSequence.test.ts:187` closes `}, 900_000);`. At the same 4.5×, that is
  490 s against 3 000 s and 348 s against 900 s, so neither can time out. The claim was inherited
  verbatim from `vitest.config.ts`, where it has been retracted in place; what survives is a
  **wall-clock** cost on the `viz` leg rather than a timeout risk, and it is GitHub issue #344.
  Left standing rather than rewritten, because a ledger entry is a dated record of what a lane
  believed and the correction is worth more beside it than in place of it.

### The measurement that could not be taken, said plainly

**The 336 s timeout in #317 was never reproduced**, and the lane declined to claim it. What was
reproduced is the mechanism: 78 328 ms idle for the offending case, and 4.5× amplification measured
under 16 spinners on this 4-core container. Their product is 352 s against a 300 s ceiling and a
reported 336 826 ms. Worst case after the split needs **21.9×** to time out.

Two brief figures were contradicted by measurement and are reported as data rather than reconciled:
`judge.test.ts` measured **81.2 s** where the brief cited 162 s and 232 s, and `viz` holds **4 882**
cases where the brief and `vitest.config.ts` both said roughly 3 200.

### Owed to the next session

- **The next #317 needs an issue**: `campaign/campaign.test.ts` and `campaign/stageSequence.test.ts`,
  both a dispatcher sweep inside one `it()`. **Filed as #344 on 2026-09-05, on a corrected premise:**
  the timeout risk this bullet assumed does not exist, and what the issue carries instead is the
  `viz` leg's wall clock and the 93 `packages/viz` cases annotated above the project ceiling.
- **Four cross-references the split makes stale**: `honesty/surfaces.ts` and § D186 name
  `judge.test.ts` for a claim that survives but moved file; `docs/05-roadmap.md` lists the Phase 9
  gate suites; `ISSUE_VERIFICATION_FINDINGS.md` cites `judge.test.ts:165`.
- **§ D4 and § D6 are wrong and were not fixed** — `DECISIONS.md` is open in PR #319, and correcting
  a recorded decision is an owner's call. R43 holds it.
- **`menu/challenge.ts` is a second mirror of `configFor`** that sets no report window, and the
  parity guard that should catch it needs a colon its shorthand spelling does not have. Latent: no
  shipped challenge names a moved building.
- **The Phase 9 corpus row is owed a measurement.** `honesty/surfaces.ts` gained one surface
  (`menu/boardRun.ts#rowVariationOf`), so both tiers move by one. Per § D343 that is taken once on
  the integrated tree, so **no figure is published here**.
- **#93 and #159 remain the older backlog's two untracked issues.** #93 is a combine candidate under
  #221, recorded and not actioned, because it carries four acceptance criteria #221 does not state.

---

# Wave M — 2026-09-02: two closed, four premises re-checked, and a register with no guard

**Taken at `c3953bb`** (= `origin/main`, wave K merged). **Open issues at the start: 66. Open pull
requests: 1** — #322, wave L, a *sibling session's*, covering #315–#318, #320 and #321.

**This wave was planned around that pull request rather than across it.** Its twenty-six changed
files were listed before a line of this wave was written, and every verification lane was told to
report a collision against them. The tightest hazard was the one this repository already names:
`honesty/surfaces.ts` is on wave L's list, and two of wave M's candidates would have touched it. One
of them (#159) is not being built for other reasons; the other (#283) turned out not to need it,
because that file iterates `DESIGNER_COPY` generically rather than naming its keys — so a new copy
key joins the corpus with no edit to the file the sibling holds. **That was checked, not assumed.**

## M.1 Reconciliation — eight issues had no row anywhere, and two were nobody's

Every open issue number was grepped against this file, [`ISSUE_TRIAGE_PLAN.md`](ISSUE_TRIAGE_PLAN.md)
and [`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md). **Thirty-one have no ledger row. Eight have no row
in any of the three.** Six of the eight are wave L's. The two that were nobody's are **#283** and
**#323**, and both are closed here.

That is the same finding snapshot C made and it has not improved: the ledger is still competing with
a second record. Five of snapshot C's twenty-six carried adjudications posted as GitHub comments that
never reached this file; this wave's dispositions for #146, #158, #159, #177 and #178 are posted as
comments **and** recorded below, because posting alone is what produced the gap.

## M.2 Four premises verified before anything was built. Three did not survive whole

| issue | central claim | verdict |
|---|---|---|
| **#323** | the guard's remedy does not clear the state it names | **CONFIRMED, and reproduced by run** |
| **#283** | three absence rows point at the triage issue itself | **CONFIRMED exactly**; the register's test cannot see it |
| **#159** | *"a day's wrinkle is hard-coded"* | **REFUTED in both halves** |
| **#146** | the editor prints the cost line in one register | **CONFIRMED literally, REFUTED in aim** |
| **#177 / #178** | seven and nine open gaps | **13 of 16 stand; 3 are built, 1 before its issue was filed** |

**#159 is the instructive one, and it fails in the direction this repository has learned to watch for
second.** The shaft-C-out example the issue calls *the only wrinkle* is not in the tree at all: it is
prototype prose in `ENGINE_CONTRACT.md:94` that was never ported, and the shipped daily fixture
(`server/src/leaderboard/boardKey.ts:147-153`) has no wrinkle field. What does exist is a wrinkle
library in code — `shift/events.ts:136-239`, five parameterised templates whose `EventEffect` fields
reach demand, whole-shift holds and `serviceEvents`, with a *mechanically enforced* single caller. So
the real gap is **five code-authored templates instead of twenty data-authored ones, no rotation, no
gate**, and the naive build would produce about fifteen rows that parse, validate, draw a caption and
change nothing. Rescoped on the issue rather than started.

## M.3 What landed

**#323 — the guard's named remedy is now true.** `runner/fixtures.test-helper.ts#assertCoreBuilt`
compared the newest emitted `.js` against the newest source, and told the reader to run `npx tsc -b`.
That command is content-incremental, so a working tree whose mtimes moved without its bytes moving —
which is what `git merge` and `git checkout -B` produce — sat in a state the command could not leave.
Reproduced verbatim: after `touch packages/core/src/index.ts`, `npx tsc -b` returned 0 three times
while the guard stayed red, and `tsc -b --dry` said *"is up to date"* in the same breath. **TypeScript
disagreed with the guard, and TypeScript was right.**

The freshness marker is now the newer of the emitted `.js` and `dist/.tsbuildinfo` — TypeScript's own
record of when it last reconciled the two. A no-op build rewrites that file and nothing else, which is
exactly the fact the old comparison discarded. **The direction of the error is unchanged**: a tree not
built since a source moved is still refused, and it was watched being refused. `coreBuildState.test.ts`
drives all eight states over temporary trees in 17 ms, and `parallel.test.ts` was run in the failing
state and passed 12 of 12.

**#283 — the three placeholder rows are resolved, one built and two deleted** ([§ D455](DECISIONS.md)).
The two designer entries said where a capability is *authored* rather than that this build cannot do
it, which is an ownership boundary and not a queue item. They are deleted, **and their words moved**
to hints beside the controls they qualify; the browser tier asserts both directions, that each hint is
on the designer screen and that neither sentence is on the build-information panel any more. Deleting
alone would have cost a player the one sentence that tells service zoning from access zoning, which
`CLAUDE.md` names outright as a distinction never to collapse. The stage camera went the other way:
§ 7.3 of the handoff lists the camera among what a player can touch, so it is a gap rather than the
deliberate position #283 suspected, and it is **#324**'s now.

**Found in the same file, and it is R38 on a file whose whole subject is R38.** `buildNotes.ts`'s
docstring asserted *"there are twenty-seven"* entries in the present tense. There were twenty-six
before this wave and twenty-four after. The sentence now states no count at all, which is the rule the
same paragraph preaches two lines above.

## M.4 Owed, and one thing not done

- **The honesty corpus is not re-measured here.** Two copy keys enter it and two register entries
  leave, so both tiers' string counts move. [§ D343](DECISIONS.md) puts that measurement on the
  integrator of the *integrated* tree, and with #322 open this branch is not it. Forecast, so it can
  be checked rather than trusted: **cases, simulations, surfaces and failing cases all unmoved**;
  strings move by a small per-case constant in both tiers; `suppressed runs` unmoved.
- **#146 and #158 need a ruling, not a lane.** Both are posted with the exits priced.
- **`GAPS.md` has no staleness guard** and is the register issues are actually filed from —
  [`RISKS.md`](RISKS.md) **R44**, and the reason #178 shipped with a fixed defect as its
  headline. **#325 owns building it**, filed with the row so R44 does not itself become an R42.
  The three realised rows are corrected in place against the code, each citing the file and line
  that contradicts it and each kept rather than deleted, because they are the row's evidence.
  **That discharges the instances and not the class**, which is the whole reason #325 exists:
  a guard over free prose is not available, so #325 prices three shapes of fix rather than
  prescribing one, and says which it would take.

---

# Wave N — 2026-09-02: the owner's ruling, and two corpus zeros

**Taken at `aea42b5`** (= `origin/main`, wave M merged). **Open issues at the start: 69. Open pull
requests: 0.**

## N.1 The product owner re-aimed the charter, and it is the first ruling that puts a price on a refusal

Given directly, and quoted rather than paraphrased ([§ D456](DECISIONS.md)):

> These are good goals, but not at the expense of game play.

**`charter P2`'s test could only ever fail in one direction.** It asks whether a change makes the
product say *less*, so every change that added refusal text passed it and no change could fail it.
The pillar behaved as a ratchet, and it had been ratcheting onto the surfaces a player actually
reads. **GitHub issues #208 and #211 are that ratchet reported from the other end**, by people who
could see the result and not the cause — which is why this ruling closes nothing and re-aims four
open issues.

P2 gains a second test (*can the player still play?*), § 2 states that a pillar is not the reason the
game exists, and `charter S6` moves from *state why the simulator refused a number* to *say what a
refusal means for your next change, and no tester is stopped by one*. **The S6 trade is written into
the charter rather than dressed as a strengthening**: weaker on articulation, strictly harder on
blocking, because one tester abandoning the loop now fails it outright where four of ten could
previously be stopped. `charter P1` and `charter S8` are untouched and S8 is the one with a working
instrument, so the honesty commitment itself did not move.

One sentence was **withdrawn rather than reworded**: `docs/30` said the refusal *"is the thing this
product is actually for"*. It is not, and a document that confuses a constraint with a purpose keeps
producing screens that are correct and no fun.

## N.2 The corpus moved by zero twice, and only one of the zeros is interesting

[§ D457](DECISIONS.md). Measured once on the integrated tree, both tiers in one sitting, base
re-measured first in a detached worktree — where it reproduced its published row **exactly in both
tiers**, the sixth consecutive wave.

| | base `39c1f1c` | integrated `aea42b5` | move |
|---|---|---|---|
| always-on strings | 575 999 | **575 999** | **0** |
| deep strings | 718 633 | **718 633** | **0** |
| surfaces, both tiers | 55 / 56 | **55 / 56** | **0** |

**Wave M's zero is arithmetic.** #283 added two `DESIGNER_COPY` keys, which `honesty/surfaces.ts`
iterates generically, and deleted two `DESIGNER_ABSENCES` entries, which the build-notes adapter
seeds. **+2 − 2 = 0 per case.**

**Wave L's zero is the one worth reading, because I got it wrong first.** `CLAUDE.md` was last
touched by wave K, wave L merged five lanes including edits to the corpus's own surface file, and I
wrote *"the row is stale by two waves"* into a scheduled check-in **before measuring it**. The base
reads exactly what wave K published. A row that *looks* stale and a row that *is* stale are different
claims, and only one of them can be settled by reading commit history. Sixth instance of this
project's oldest lesson, and the first where the wrong inference was written down first.

**The forecast wave M published was wrong in the worse direction** — it predicted *a small per-case
constant* and the constant is zero. § D454 recorded forecasts short by one string per case; a
forecast expecting motion teaches its reader to treat a correct zero as a failed measurement.

## N.3 The blocked set, re-read for the first time

Four read-only lanes checked whether snapshot C's blockers still held. **The sorting was wrong in
every group** — the detail is [`ISSUE_TRIAGE_PLAN.md`](ISSUE_TRIAGE_PLAN.md) snapshot F. Headlines:

- **There is no server cluster.** A complete, deployed API with 329 passing tests, and #179 closed
  2026-09-01. **#221 is unblocked and is the highest-leverage item in the backlog.**
- **One of four tester-blocked issues is tester-blocked.** #211's gate was lifted by the owner on
  2026-08-26 in a comment nothing in this repository had absorbed, and snapshot C asserted the
  opposite three days later.
- **#275's blocker merged 2026-08-26** and it sat blocked for a week.
- **#237, the only P0, rests on a refuted premise** — 3 passing / 14 owned / 4 planned, and all **40**
  named test files exist. Its own second criterion was satisfied before it was filed.

**Filed from findings:** #327 (no endpoint returns a distribution), #328 (nothing runs on a
schedule), #329 (a blocker that clears is watched by nothing). **Dispositioned on the issue with
evidence:** #146, #158, #159, #161, #177, #178, #208, #210, #211, #218, #221, #222, #226, #237, #248,
#275.

## N.4 Two register corrections, both in the same direction

[`RISKS.md`](RISKS.md) **R45** is new: *a blocker that clears is not an event anything watches for.*
Realised three times in one wave, and the observation itself was written down by snapshot C on
2026-08-29 and never built — R42 with a process note as its subject. #329 owns it.

**R42's own citation was stale**, and is corrected: it cited a `docs/16` sentence that exists nowhere
in the tree. **The register that tracks stale claims was carrying one**, which is R44 with `RISKS.md`
as its subject.

## N.5 Owed to the next wave

- **#221 first.** No blocker, and it gates four other things. Retract `everyday/buildNotes.ts`'s and
  `everyday/world.ts`'s *this build ships no server* on the same commit — both are live and false.
- **The API image is deployed by hand** and its store migration is manual, so #221's end-to-end
  acceptance has an operational prerequisite that is not code.
- **#237 and #146 need a ruling, not a lane.** Both are posted with the exits priced.

---

# Wave O — the social layer's read half, opened 2026-09-02 at `d4636a5`

**One worker, no lanes.** Wave N's hand-off said *"#221 first. No blocker, and it gates four other
things."* This is that, and it is a single-worker wave on purpose: the work turned out to be one seam
built from a database column to a rendered row, and a wire change split across lanes is how two lanes
each publish a figure that is correct on their branch and wrong in the tree.

| Piece | Issue | Commit |
|---|---|---|
| `boards()` returns the whole answer, not a third of it | #331 | `1ebba96` |
| The daily board reads, and a row carries its own `n` | #221 | `5ea3805` |
| Three refusals the read made false | #221 | `75b3071` |

## O.1 What the corpus found, which is the wave's real story

The board row I wrote drew `21.4 s` beside a player's name. It typechecked, every number on it was
real, and it was internally consistent. **Within an hour the honesty search reported
`estimate-without-n` on 49 of 49 always-on cases**: a mean wait with no denominator anywhere in its
box. R13 clause one, and the same defect #137 fixed for the Day report's delta row one wave earlier.

Nothing else in this repository would have caught it. That is worth saying plainly, because the
corpus's cost is visible in every wave's wall clock and its value is only visible on days like this.

**There was no shortcut, and the two that looked like ones are both named in `CLAUDE.md`.** No field
a client already holds is the count a board row's mean was taken over — `RunSubmission` carries a
duration and an arrival rate, and neither is a denominator. Marking the string something other than
`estimate` would have been moving the gate. So the fix reaches the wire: `entries.legs`,
`verifySubmission` returning `summary.waiting.count` off its own replay.

**Where it sits is the decision worth reading** (§ D459). Beside `ClaimedMetrics`, never inside it.
A mean's denominator is the single number a dishonest client would most want to choose — halve it and
a mean over the easy half of a run is indistinguishable from a mean over the run — so putting it in
the claim would have added a way to refuse an honest player on the path this repository already
calls *"this product's one accusation, spent on a player who did nothing wrong."* Never claimed,
never compared, never refused on.

## O.2 Three refusals corrected three different ways, and two left alone

Five player-facing sentences said *this build has no server*. **All five were already false on every
build a player has ever loaded** — `http/static.ts` injects `<meta name="elevator-sim-api">` into
`index.html` as it serves it, and the CDN bundle gets an absolute origin from `apiOrigin.mjs`. The
board drawing rows under them only made it visible.

They were not corrected uniformly, because they were not wrong in the same way (§ D460):

- **`settingsView.ts`** kept its refusal and lost a second, false reason bolted onto a true one.
  Nothing posts a run yet, so there is still no path for a switch to turn off.
- **`buildNotes.ts`** *narrowed* rather than leaving. The absence did not close: you can read
  today's board and you cannot post to it. Its `ABSENCE_TRIAGE` row followed it from #161 to #332.
- **`weekView.ts`** was **withdrawn**, and not because it was false. The week screen asks no server
  anything, so it was stating the outcome of a request it never makes. There was no run to pin it to
  and no rewording that could have given it one. § D227 says a refusal is pinned by a run; a surface
  with no run available may not refuse at all.

**Two were left exactly as they are, and that is the finding.** `everyday/world.ts`'s and
`everyday/rushScreenModel.ts`'s speak about endpoints that genuinely do not exist — a distribution
(#327) and another player's rush. A lane briefed to sweep *the stale-refusal cluster* would have
replaced two accurate refusals with two inaccurate ones, which is § D227's defect committed in the
course of fixing § D227's defect.

## O.3 The corpus, measured on the integrated tree

Both tiers in one sitting, never on a branch (§ D343), with the base at `d4636a5` re-measured first
in a detached worktree — where it **reproduced its published row exactly in both tiers**, the
seventh consecutive wave that has held.

| | base `d4636a5` | wave O | move |
|---|---|---|---|
| always-on strings | 575 999 | **576 930** | **+931** |
| deep strings | 718 633 | **719 773** | **+1 140** |
| surfaces, both tiers | 55 / 56 | **55 / 56** | **0** |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** |

**931 ÷ 49 = 19 and 1 140 ÷ 60 = 19.** Both exact and the same nineteen, which makes this the second
time the row has been able to attribute a move to the string. The decomposition was checked against
the code rather than inferred from the quotient: **fourteen** are `dailyBoardViewOf` driven over the
six seeded states — two of them for `unreachable`, because the server's own sentence is carried under
ours — and **five** are `BOARD_SCREEN_COPY`'s new keys, which the adapter iterates generically.

**The three refusal corrections contributed zero**, and that is arithmetic rather than luck. Each is
a substitution: one string in, one string out. § D457 recorded wave M's zero for exactly this reason
at a different scale, and here the same rule holds inside a wave that did move.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical, nothing
added, nothing removed. The daily tab's five states went into the *existing* board adapter rather
than a new one. The deep tier's one-surface lead is still exactly `campaign/judge.ts#judgeStage`.

## O.4 What I got wrong

**I nearly shipped the row.** The seed loop marked the wait `role: 'estimate'` with no `countShown`,
which is why the search fired. `role: 'observation'` would have looked like a reasonable choice for a
figure the server measured, and the sweep would have been silent.

**A default parameter ate two fixtures.** `legs: number | undefined = 312` takes the default when
`undefined` is passed explicitly, so both *"the server sent no count"* cases ran with a count and
both tests passed against the wrong fixture. Caught by an assertion, fixed by taking `null` for
*deliberately none*.

**The deep tier needs `CORPUS_TIER=deep`, not `ELEVATOR_SIM_HONESTY=deep` alone.** Two runs wrote
always-on figures into a file named `deep`, and they were caught only because the file states its own
tier on line one.

## O.5 The owner's CI ruling, taken mid-wave

The macOS red on #334 put the question in front of the product owner and the answer was to remove
the leg: *"We're deploying out to Azure, so we don't need anything else burning CPU or tokens."*
§ D462.

**The reasoning holds where it was aimed.** A second leg proves portability to a platform nothing is
shipped on, and the objection was cost. What it also removes is the instrument § D196/§ D201 built:
portability stops being a *measured* property, and an environment-dependent pin goes back to being
indistinguishable from a portable one.

**The concern was raised once, in two sentences, and then the work was done in full.** That is the
shape this file should record for the next time: a stated cost, an owner's call, and no
re-litigation.

**The cost was overstated on the first pass and corrected by checking.** The draft `ci.yml` header
said three defects go unguarded. Checked one at a time:

| finding | uniquely the macOS leg's? |
|---|---|
| CLI `ENOTCONN` | **Yes, found there and nowhere else** — but `process.test.ts` fires every `BROKEN_PIPE_CODES` member individually, written so coverage would not depend on the machine. The known codes stay covered; finding an unknown fourth does not |
| `dist-web/` race | No — both legs reported it on the same commit, in different symptoms |
| Pinned viewport offset | No — the two legs agreed with *each other* against a local machine. CI-versus-local, not macOS-versus-linux |

Counting them would have made the trade look worse than it is, which is the same error in the
opposite direction from the one this project usually makes. The honest loss is one sentence: no
second platform is watching.

**Six files claimed the two-leg matrix and all six were corrected at their sites**, with the
present-tense claims changed and every historical measurement left exactly as written.
`docs/31-support-matrix.md` is an **adopted specification of record**, so it got a dated amendment
rather than an edit that matched it to the new reality.

**The find worth carrying:** `traffic/dayStartIdentity.test.ts` justified regenerating pins locally
by citing three machines that agreed. That route is gone, and nobody had said so. A pin regenerated
from here rests on one machine, which is § D201's defect wearing an equality assertion. The
docstring now warns where somebody about to regenerate will read it.

## O.6 Two more owner calls on cost, and the noise this session made for itself

**§ D463 — the preview deploy stops commenting.** `Azure/static-web-apps-deploy@v1` posted *"Your
stage site is ready!"* on every push; on #334 it fired five times in fifty minutes. Its `repo_token`
input is removed. **The action's own `action.yml` was fetched and read before the change** — it
declares that input `required: false` and *"currently used only for commenting on Pull Requests"* —
because a token dropped on a hunch would have failed the deploy rather than quieting it. The preview
still deploys and its URL still reaches the pull request through `environment.url`.
`pull-requests: write` went with it, since the comment was the only thing using it.

**The superseded-head notifications were entirely self-inflicted, and the count is the finding.**
Four pushes in one hour, three of them cancelling a CI run in flight — one **45 minutes** in. A
cancelled run still *completes* its check suite, and that completion arrives saying *"no third-party
check suite is still running or failed"* about a commit that is no longer the head. Five of those in
one session. **One described a head whose sibling job had been cancelled rather than passed**, so
acting on it would have meant declaring CI green while it was still running.

The fix is a working agreement in `CLAUDE.md`: commit freely, push once per wave. **Stated as
discipline rather than a gate, because nothing enforces it** — and this file should say plainly that
a rule which cannot fail is the thing this repository most often catches, so the next reader should
treat it as a habit to keep rather than a guarantee to rely on.

**Two things that look like the fix and are not**, recorded so nobody spends an afternoon on them:

- `paths-ignore` on `**.md` is **wrong here**. `validation/documentation.test.ts`,
  `validation/citations.test.ts` and `everyday/viewportGateClaims.test.ts` read the documents
  themselves, so a markdown-only change can legitimately fail this suite; skipping it would skip the
  guards that exist for exactly that case.
- **A `paths:` filter does not narrow a pull request.** GitHub evaluates it against the whole PR
  diff rather than the individual push. `deploy-viz.yml` already carries one naming only
  `packages/**` and friends, and it still ran on a push that touched two root `.md` files and
  nothing else — which is how this was established rather than assumed.

## O.7 Owed to the next wave

- **#221 has three criteria left**, and the next one is **#332**, the Everyday sign-in. Posting is
  blocked on it and nothing else. The daily challenge tab is the one after that.
- **#161 should be split.** Its own text says to when the blocker clears; the blocker cleared and two
  of its five bullets are now done. Commented with the split and left the body alone.
- **#333 is filed and it is this wave's own debt.** `entries` gained a `NOT NULL` column, and
  `CREATE TABLE IF NOT EXISTS` does not add a column to a table that already exists. `store.ts`'s
  schema docstring said the honest thing — *"there is no migration framework because there is
  nothing to migrate yet"* — and #179 closing on 2026-09-01 is what made that sentence expire. On a
  database created before `5ea3805` the insert fails and `entryOf` reads `NaN`. No test catches it,
  because every test opens an empty database. Filed rather than fixed here because a migration
  runner is its own build with its own acceptance criteria, and because the pre-existing-row answer
  is a decision to record rather than assume.
- **#275 and #329** are still the two whose blockers cleared and which nothing has picked up. Three
  consecutive waves now, which is #329's own subject arriving for the third time.
- **#335 is re-aimed rather than closed.** Removing the macOS leg made its red go away and answered
  nothing: `BLOCKED_FRAME_GAP_MS` is still a wall-clock bound calibrated on Linux and enforced as
  though portable, and the Linux leg is the same kind of shared VM. `docs/31-support-matrix.md` § 5
  had written this class down before it happened — *"a wall-clock budget on hardware with that
  spread will produce flaky red runs"* — and that paragraph is now annotated with the run that
  proved it.
- **A notification pattern to distrust.** `check_suite.completed` envelopes saying *"no third-party
  check suite is still running or failed"* arrived **three times for superseded heads**. Twice they
  would have read as *CI is done* while the current head was still running, and once the sibling job
  had been **cancelled** rather than passed. Verify with `list_workflow_jobs` against the current
  head sha before acting on one.

---

# Wave P — 2026-09-04: seven issues closed before a single build landed

**Opened at `eb5b3b6`** (= `origin/main`, wave O merged). **Open issues at the start: 71. Open pull
requests: 0.**

## P.1 The wave's subject is that the backlog was measurably staler than the tree

Wave O's hand-off named the batch in order — #332, #333, then #275 and #329 — and that batch was
dispatched. But three verification lanes went out **before** any build, and they are what the wave
turned out to be about. **Five issues filed on 2026-09-01 and 2026-09-02 described defects the tree
had already fixed**, in three cases within hours of filing, and nobody had closed them.

| issue | filed | fixed | gap |
|---|---|---|---|
| **#316** the reveal goes quiet on a mixed board | 2026-09-01 17:27 | `587dee0`, same day | **7 hours** |
| **#321** two worktree sharp edges | 2026-09-01 21:17 | `a661238`, same day | **under 2 hours** |
| **#318** nothing checks for a duplicate heading | 2026-09-01 17:28 | `f38823c`, 2026-08-26 | **already false when filed, by 6 days** |
| **#320** `cli` has not been reported failing | 2026-09-01 21:13 | in `vitest.config.ts`'s own body | verified by P-V1 |
| **#315** every `garden-apartments` run is a 422 | 2026-09-01 17:27 | `leaderboard/verify.ts:111` | verified by P-V1 |

**#318 is the instructive one and it is not the fastest.** Its closing claim was that the collision
survived *because no check looks for it*. A check had looked for it for six days, found it, and
registered it deliberately with its reason. The register worked. What was missing was anybody
scheduled to re-read the entry — which is #329's subject arriving on an issue that is not about a
blocker, and is the fifth instance this project has recorded.

## P.2 D63 was cleared by asking a question nobody had asked

The duplicate heading is gone, and not by any of the three remedies the issue or the guard proposed.
Renumbering is forbidden by R1. Retitling does not work at all, because the number still heads two
blocks and only a human reading the file benefits. Registering had already been done.

**The first `## D63` was never a decision.** It is a sub-agent's hand-back status note, recording
that a suite was already red before that branch touched anything, lifted into `DECISIONS.md` with
the Phase 4 decisions that follow it. The preamble sitting **between** the two blocks still addresses
the orchestrator who was meant to lift them, which is the paste showing through. Demoted out of the
`## Dnnn —` shape, `D63` names one decision, `KNOWN_DUPLICATE_DECISIONS` is empty, and no citation
broke: `runner/types.ts:744` already disambiguated itself and `docs/10:2466` cited it bare and now
resolves uniquely. **The one ambiguous citation in the tree was closed by the heading change rather
than by editing the citation**, which is the better outcome, since editing it would have left the
ambiguity for the next citation to rediscover.

The guard's own advice is corrected in the same commit. It offered *retitle the newer heading*, and
that is wrong for the reason above.

## P.3 The reservation mechanism caught the integrator, for the second time in four waves

Appending `## D472` while lanes A and C hold D464–D471 leaves a numbering hole, and
`documentation.test.ts` went red on exactly that. The entry was backed out and the argument moved
into the `KNOWN_DUPLICATE_DECISIONS` docstring, which is where § D405 puts it anyway. **The
integrator's number is allocated at integration, after the lanes' entries land**, which is what the
process says and what this wave had to be reminded of by a test.

There is a second collision, recorded in `AGENT_STATUS.md` rather than tidied: D468–D471 was
pencilled for lane B and then dispatched to lane C. Only lane C will spend it.

## P.4 Two issues combined, one umbrella split, and one product blocker found

**#162 closed as a duplicate of #227**, scope transferred verbatim first. The ruling that had kept
them apart rested on a premise *that issue's own earlier comment had already retracted*: the body
still claimed B2 and B5 while comment one had given B2 to #167, and #167 has since closed. Same
disease as P.1, in an issue body rather than a docstring.

**#161 split and closed.** Two of five bullets verified done, two re-homed to issues that already
existed, two residues filed as **#337** and **#338**. Two corrections to the issue's own third
comment fell out: the weekly challenge period is **not** a § 12.1 board-key disagreement, because
the contract scopes *one board a day* to board keys and the daily key is now the date alone; and
bullet 5 now has **three** refusal grounds rather than two, the third being that an `answer-incident`
would carry the answer without the thing answered and replay to a different run the server would
verify as honest. That is worse than a refusal, so #338 asks for a ruling rather than assuming a fix.

**#332 is blocked on a product decision nobody had noticed, and the map found it before the build.**
`CLAUDE.md` makes the design handoff canonical for the interface. **The handoff specifies no sign-in
screen**: § 4's inventory has seventeen keys and none is an account screen, § 15.1 specifies the
signed-in half only, and the prototype's one account line is fixture copy of an already-signed-in
state. A builder starting today would invent a screen's worth of player copy, four failure states
included, with nothing to check it against, in a repository whose § D460 rule is that a sentence a
surface cannot stand behind gets withdrawn rather than reworded.

Two more findings from the same map. **A mailed sign-in link is redeemed onto a surface the player
cannot see** — filed as **#336**, a live defect in the product's only credential path, broken in the
direction that looks like nothing happening. And **the host does not notify on an account
transition**: `everydayHostListeners` fires in one place, the last statement of `renderAll()`, and
all thirteen account paths call `drawMenu()` instead. A screen wired to `onChange` would render once
and never update, across a 28.7 second cold start.

## P.5 What was verified rather than accepted

Every closure in this wave was re-checked by the integrator against the tree before the issue moved.
`587dee0` and `a661238` were confirmed as ancestors of `HEAD`; `f38823c` was dated with `git log -S`;
the `reportWindow` derivation was read at `leaderboard/verify.ts:111` rather than taken from a test's
docstring; `boardScreen.ts` was grepped for `watch` and returns zero; `data/engineering-briefs.json`
and `packages/viz/src/briefs/` were confirmed absent.

**One agent claim did not survive.** P-V2 reported that the checkout had no `node_modules` and that
it ran `npm ci`. Both worktrees carry 95 packages matching root and `vitest` resolves in each, so
either the claim is wrong or the reinstall was a no-op. Nothing was harmed, and it is recorded
because a lane's account of its own environment is evidence like any other.

**One agent finding was corrected.** P-D reported #161 bullet 5's residue as ground 2 alone. The code
names three grounds and the third is the substantive one.

---

# Wave P — 2026-09-04: the backlog was decaying faster than anyone was reading it

**Opened at `eb5b3b6`** (= `origin/main`, wave O merged), clean tree, **zero open pull requests**,
**71 open issues**. Closed at **69 open**: five closed, three filed, two built.

## P.1 The wave's real subject, and it was not what the hand-off named

Wave O handed over a build batch. This wave ran it, and also sent three read-only lanes at the seven
issues filed on 2026-09-01 and 2026-09-02 before dispatching anything. That second half is what the
wave turned out to be about. **Five of those seven described defects the tree had already fixed**,
three of them within hours of being filed.

The instances are worth naming individually, because the pattern only becomes visible when they sit
together:

- **#316** was fixed roughly seven hours after it was filed.
- **#321** was fixed under two hours after it was filed, on both of its halves. `.gitignore:23`
  carries the `node_modules` symlink fix with a four-cell measurement table in its own header, and
  `.worktree-setup.sh`'s header carries the `pkill -f` hazard together with a safe kill-by-PID form.
- **#318**'s premise did not survive at all: the first of the two `## D63` headings was never a
  decision.
- **#162** was a duplicate of #227.
- **#161** was an umbrella whose own body said to split it when its blocker cleared. The blocker had
  cleared, two of its five bullets were done, and it was split into #337 and #338 and closed.

**The rule this wave would hand forward: an issue filed against a fast-moving tree is a hypothesis
with a timestamp.** Verify against the code rather than against the last comment, and verify before
scheduling. Three of these five would have become build lanes if anybody had trusted the titles.

## P.2 What was built, and both lanes refused the same thing without conferring

| lane | issue | branch | verified by the integrator |
|---|---|---|---|
| **A** | **#333** — the store gets a versioned migration table | `fix/issue-333-store-migrations` | `--project server` **15 files / 356 passed** (base 14 / 337), `tsc -b` exit 0 |
| **C** | **#275** — the day asks a fifth thing, 80 kJ per delivered leg | `feat/issue-275-energy-goal` | `--project viz` **216 files / 4 999 passed, 4 skipped** (base 216 / 4 987), `tsc -b` exit 0 |

Both suites were run by the integrator in the lane's own worktree rather than accepted from the
lane's report, and the integrated tree typechecks clean.

**The finding worth keeping is that the two lanes reached the same refusal independently, from
opposite ends of the product.** Lane A ruled that a board row written before `entries.legs` existed
gets `NULL` rather than a backfilled zero, because `Number(null)` is `0` and a zero *looks like an
answer*. Lane C ruled that a persisted day played before the energy bar existed gets no energy
reading rather than a stand-in, because the bar is `at-most` and a fabricated zero would read as a
day that **passed** it. Neither lane could see the other's code. The shared rule underneath is one
this repository already applies to `workPerServedLegKJ` beside raw energy: a figure nobody measured
is withheld, and the dangerous substitute is not the obviously wrong one but the plausible one.

**Lane C came in at 24 files against a brief naming six, and the overrun is justified rather than
tolerated.** Adding a fifth goal necessarily widens the persisted envelope (version 7 to 8, with 1
through 7 still read), the live observation types, and the honesty corpus. The scope was challenged
before it was accepted, which is the only reason it can be called justified.

**The threshold is derived rather than chosen**, which is the half of #275 that had been deferred for
a week. 400 seeds pooled, two-thirds point at 78.30 kJ, and 80 taken because at n = 400 the standard
error on a one-third proportion is 2.4 points and the move sits inside it. The lower bound was
checked in the same run: 60 kJ leaves day one unpassable rather than difficult.

## P.3 The decision block, and the guard catching the integrator for the second wave running

Wave P reserved **D464–D471** and spent **two**: D464 and D468. That is a 4:1 reservation against a
1:1 spend, and it is a sizing lesson rather than an accident. Wave H's note already said the block
should be sized to include the integrator; what it had not said is that it should be sized to the
**issues**, because one issue closed end to end is one decision however many modules it touches.
Fourth consecutive wave in which a lane has returned its spare numbers for exactly that reason.

**The integrator got the hole convention wrong and `documentation.test.ts` caught it.** All six
unspent numbers were registered as holes and the charter row was set to **D472**. That is wrong:
D469 to D471 sit *above* the highest written decision, so nothing was written past them and they are
free rather than holed. A hole is a gap **between** written decisions, which is why every previously
registered hole sits inside a block and not at its top. Corrected to three holes, D465 to D467,
closed from above by D468, and a charter row naming **D469**.

Second wave running that this guard has caught the process's author rather than a lane.

## P.4 A notification pattern, now at four recorded instances

A `check_suite.completed` envelope arrived saying no third-party suite was still running or failed,
naming head `6aa4b99`. That head had been **superseded**, and its suite was **cancelled** by the
push rather than passed. Acting on it would have meant declaring CI green while the real head's
45-minute suite was 20 minutes in. A second envelope, naming the live head `d2c16bc`, was genuine.

**The two are indistinguishable without checking the head sha**, which is why the working agreement
says to check it. The agreement's other half also paid: a documentation commit was deliberately held
unpushed rather than cancelling a run that was already 20 minutes deep.

## P.5 Owed to the next wave

- **#336 should be taken before #332, and this reverses wave O's hand-off.** A mailed sign-in link
  redeems onto a surface the Everyday shell covers, so the product's only credential path is broken
  in the direction that looks like nothing happening. It is small, and it is a strict prerequisite
  for the sign-in screen #332 asks for.
- **#332 is blocked on a product decision, not on capacity.** The design handoff specifies no
  sign-in screen, and there are two display names where § 15.1 asserts one.
- **Five issues are blocked on a decision rather than on work**: #327, #328, #329, #332, #338. Each
  would be settled in a paragraph. None has been. That is a different failure from the one this file
  usually tracks and probably a more expensive one.
- **#174 needs a run, not an opinion.** Day variation is built and `docs/14`'s status line says it is
  not, because that line means *its criterion has been measured* and the criterion is a variance
  comparison nobody appears to have run. **#235's premise depends on the answer** and has not been
  re-checked.
- **#333 lands in the repository and not in the deployed database.** The image is deployed by hand
  from `scripts/deploy-azure.sh`, invoked by nothing in CI, so a migration runner existing is not a
  migration having run.

---

# Wave Q — 2026-09-05: five lanes, one regression run, and four briefs proved wrong

**Opened at `771e65f`, closed at `51d3553`.** Five builders in parallel worktrees, one integration
branch, one suite. The combining was the point: five pull requests would have cost five fifty-minute
runs and five chances to cancel each other.

| lane | issue | decision | verified by the integrator |
|---|---|---|---|
| **Q-A** | #123 the preview allowlist is membership | **D469** | `--project server` **16 files / 367 passed** |
| **Q-B** | #277 the stage draws five goals, as readings | **D470** | `--project viz` **217 / 5 023** |
| **Q-C** | #341 the CSP gate names its permitted origins | **D471** | shell reproduction, both directions |
| **Q-D** | #295's three confirmed defects | **D472** | `--project viz` **217 / 5 011** |
| **Q-E** | #204 the accessibility standard | **D473** | document guards **35 passed** |

Every figure above was produced by the integrator running the suite in the lane's own worktree, never
read off the lane's report. `tsc -b` exit 0 at every merge and again on the integrated tree.

## Q.1 Four of five lanes refuted their own brief, and one of the four saved a dead feature

This is the wave's finding, and it is not a compliment to the lanes so much as an indictment of the
briefs. Every brief carried one cheap instruction: **verify the premise first, and a refuted premise
is a successful outcome.** Four lanes took it.

**Q-B's is the one that mattered.** The brief said the mechanism already existed and was proven, that
the job was *a caller, not a new mechanism*, and pointed at `host.goalsToday()` with its four
non-test callers. The lane studied those four and found that every one of them is a surface shown
**before a run or after one**, which is why none had ever exposed what `goalsToday()` does:
it folds at `EverydayHostBindings.playheadS`, which `dev/main.ts:3745` binds to the **Engineer**
transport's `playback?.simTimeS`. The Everyday stage builds a `Playback` of its own.

**A caller written exactly as the brief described would have drawn five figures that never moved,
over a day the player could watch running.** It would have passed every other check this repository
runs: the control moves, the screen looks right, the run does not change. That is the standing
requirement's own defect class, and the lane found it by writing the standing-requirement test
**before** the feature rather than after. The fix is a port, `goalsAt(simTimeS)`, with `goalsToday()`
delegating to it so the two cannot drift.

**Q-A** proved by mutation that the test the brief said would go red does not: with the pre-§ D330
equality rule restored, all four pre-existing cases in that block still pass. That case asserted only
that a *disagreeing* allowlist throws, and under membership one still throws, for another reason. It
never distinguished the two rules. The lane kept it and wrote that reason into it rather than
deleting the evidence.

**Q-C** measured that the fix its own issue proposed, pinning the CSP terminator, rejects a
**correct** policy whose `connect-src` is written last, because this CSP carries no trailing
semicolon. It built position-independent tokenised equality instead. It also corrected the brief's
documentation classification in both directions, moving one line the brief called a dated record and
leaving one the brief implied should move.

**Q-D** found the shared `plural()` helper the brief told it to reuse does not exist. Three
module-private copies, two ternaries, one inline, and a docstring at `shift/report.ts:1784` already
recording why nobody imported one. The fix was to **export** one first, and the lane's own sentence
is the lesson: a helper nobody can import is a helper nobody reaches for.

## Q.2 The decision block returned no holes, which no block had managed before

Wave Q reserved **D469–D473**, one number per lane, and spent all five. Wave P reserved four per lane
and returned **six** unspent, the most any block has produced. The change was to size the block to the
unit that actually consumes a number, and that unit is an **issue**: one issue closed end to end is
one decision however many modules it touches. Four consecutive waves had been saying so by returning
their spare numbers.

**The reservation was opened mid-wave rather than at dispatch, and that is the part to keep.** Lane
Q-C landed D471 before Q-A's D469 and Q-B's D470 existed, so the tree read as though two numbers below
the highest were holes. They were unlanded. **Three separate lanes reported the resulting red as an
integrator action**, each computing it from `documentation.test.ts`'s own arithmetic rather than
running it, and each was right. `OPEN_RESERVATION` and the charter row were reconciled on the same
commit as the last merge, which is the step nobody performs when nothing asks for it. **D387 is
the registered hole that shows it**, and this paragraph originally cited that number in the
section form. `citations.test.ts` resolves every such reference to a heading, a hole heads
nothing, and the guard went red naming this file. A hole is written as a bare number for
exactly that reason, which the code around it already did and the prose did not.

## Q.3 Two predictions the integrator made that were wrong, in the harmless direction

**The `honesty/surfaces.ts` collision never happened.** It was mapped as certain before dispatch and
both lanes were told to keep their edits minimal and localised. They did, and git merged the file
with no conflict at all. Q-B measured the separation in advance and said so: its hunks end around
line 9031 and Q-D's `GAUNTLET` adapter begins at 9371.

**Q-B's mid-run honesty needed no correction.** The brief spent a paragraph on it. The lane
implemented it as a projection of the input rather than an edit of the output, so the stage's
unjudged row and the Engineer rail's are the same object: `state: 'pending'`, `progressPct: 0`,
`observed: null` rather than a stand-in zero, `display` kept. Its reasoning on the progress bar is
better than the brief's: an `at-most` bar fills to 100 while the observed value is under the ceiling,
so *never let a landing stack past 34 people* would draw a **full** track at 00:00 on an empty
building. A full track is a verdict with no word in it.

## Q.4 What is owed, and what is not discharged

- **#277's AC5 is not discharged.** `docs/22-charter.md` § 2 and `MULTI_AGENT_PLAN.md` § 1 goal 4
  both still cite the closed #212 and need re-adjudicating against what landed. Outside the lane's
  scope, named in § D470, and the reason this issue should not be closed as wholly complete.
- **`docs/25:516`** still says *"the four goals still grade"* under saturation. Q-C flagged it and
  refused to correct it: the type argument holds, the count probably does not, and whether all five
  grade on a saturated day is a measurement nobody has taken.
- **Q-D's residue.** Reachable uninflected counts in `everyday/campaignModel.ts`,
  `campaignScreens.ts`, `failStates.ts`, `buildNotes.ts`, `today.ts`, `rightRail.ts`,
  `designerModel.ts`, `benchScreen.ts`, left because those files belong to other lanes. `nights: 1`
  appears six times in shipped tier data.
- **A scanner artifact, measured and left alone.** `honesty/derive.test-helper.ts` splits module
  spans at `function`, `const` and `class` and never at `interface`, so one span runs over an
  interface and picks up a member name. That, and nothing the module authors, is why `derive.test.ts`
  classifies `gauntlet/ladder.ts` as a text producer while the exclusion's own reason says it authors
  nothing.

---

# Wave R — 2026-09-05: four build lanes, two read-only lanes, and three rulings that turned out to be one rule

**66 open at the start. Six closed, one filed, four decision-blocked issues turned into schedulable
work.** Base `13e7b93`, integrated on `claude/github-issue-worker-j9csrb`.

| lane | issue | outcome |
|---|---|---|
| **R-A** | #336 | **closed** — the mailed link reports to the world holding the page |
| **R-B** | #199 | **closed** — `docs/37-content-plan.md`, and the substitution runs far deeper than #158 |
| **R-C** | #315 | **closed** — the residue was in the challenge path, and the guard was blind twice |
| **R-D** | #226 | **closed** — the ghost port, and a race that was vacuous at the shipped defaults |
| **R-V** | #317 #320 #324 #325 | **two closed as already fixed**, two dispositioned with evidence |
| **R-X** | — | the `experiments` leg's 1.82× variance diagnosed to the machine |

## R.1 The wave's own finding: three rulings that are the same rule

D481, D484 and D486 were taken independently, on three unrelated issues, and they say one thing:
**the wire carries causes and the receiver derives effects.**

- **§ D481** — a report window is derived server-side from the building id, never carried, because a
  player who picks their own window picks their own average.
- **§ D484** — a world distribution publishes a quantile ladder per axis and **no typical run**,
  because a median vector assembles three different submissions into a run nobody played; the ghost
  takes a real entry at the median of a named axis instead.
- **§ D486** — a `switch-dispatcher` travels as `{ atS, toProfileId, ruleRows? }` and the server
  re-derives the vector, because that is already how the **base** profile travels.

D486 is the one to read. Its ground 2 had been called structural twice, on the reasoning that *"the
viewer's driving profile is routinely a derived object no id resolves"* — **which is equally true of
the base profile, and the base profile posts.** The precedent sits in the same file: before
`ruleRows` existed the whole of § 11's workshop was unpostable by construction, and that file's own
verdict is the rule — *"That refusal was correct and is gone because the fact it rested on is."*

## R.2 Four lanes, four refutations, and one of them was mine

Wave Q had four of five lanes refute their briefs. This wave had four of four, and the briefs were
mine.

- **R-C** was told to move the report-window rule into `core`, my recommendation and the issue's. It
  found the rule already lives in `experiments` and that moving it down would force `core` to acquire
  `MATRIX_CELLS` — **the direction inverts.** It moved nothing.
- **R-A** was passed wave P's claim that the account-notification fix is *"wrong for the reason
  issue #106 records"*. The listener claim is true; it is **not a defect**, because `EverydayHost`
  exposes no account member so nothing can subscribe. And #106 is **misattributed** — that is
  `replaceChildren` destroying mousedown-node memory, which cannot fire while the Everyday root is
  `inert` throughout. The real cost is § D388's family.
- **R-B** was told the tree ships five contracts. It ships **eight**, and only the issue was stale.
- **R-V** was sent at four issues assumed open. **Two were already fixed**, both by `0f5124b`, one
  day after each was filed and before either was triaged.

## R.3 The measurement that had to be re-derived twice

R-X diagnosed the `experiments` leg running **35m25s and 19m27s on the same tree**. The verdict is
the machine — CPU and wall moved by the same factor so concurrency was unchanged, 102 of 103 files
were slower, and `Typecheck and build` moved with them while the network-bound step moved the other
way.

**Two obvious readings were wrong and one was the integrator's.** Four stable legs do not rule out a
slow runner, because the five legs are five separate VMs. And the expensive study does not explain
it: `selectionSweep` moved 1.71×, *less* than the leg.

The step written to record the environment — citing § D201's *a run is a machine and not only a
commit* — recorded name, arch, kernel, node and npm, byte-identical across both jobs, **and no core
count**. Three `echo` lines now fix that. Which hardware difference it was stays undetermined, per
§ D256.

## R.4 What the guards caught, and every one caught the integrator

- **`documentation.test.ts`** went red when `OPEN_RESERVATION` was closed without reconciling the
  charter row — D387's exact step, on the third consecutive wave it has caught the process's own
  author. (Written as a bare number: D387 is a registered hole, a hole heads nothing, and
  `citations.test.ts` resolves every `§ Dnnn` to a heading. **This paragraph originally cited it in
  the section form and went red for it** — the same slip wave Q recorded, in the sentence explaining
  the rule, on the person who wrote the sentence.)
- **`citations.test.ts`** and the reservation ceiling both held while the block was widened twice.
- **A backgrounded run reported `exit 0` for a command that never ran**, because the redirect
  targeted a directory that did not exist and `|| true` plus a misplaced `$?` swallowed it. The
  measurement was re-taken. `.worktree-setup.sh`'s header says exactly this: a run is evidence only
  if you read its real exit code.

## R.5 Owed to the next wave

- **A verify lane's residue goes on the issue, not into a report.** Wave P's lane verified #315 as
  fixed and recorded *"residue past the code fix"* somewhere nobody could find, so R-C opened against
  a stale brief and had to rediscover it. Every read-only lane's findings land as an issue comment.
- **#344 is filed and unowned** — 146 cases across five packages annotated above the 300 s project
  ceiling, and a wall-clock watch that must survive a 1.82× machine swing.
- **The three stale "five scenarios" docstrings turned out to be ten sentences**, and are fixed.
  `scenariosPanel.ts` had *"The eight swatches"* nine lines below a header saying *"Five cards"* —
  half-corrected is how a claim outlives its correction.
- **#332 is next.** #336 was its named prerequisite and is closed.

---

# Wave S — 2026-09-05: three rulings before the first lane, and a verification half that struck four items and refuted three more

**61 open at the start.** Base `8ff0215`, integrated on `claude/github-issue-worker-kv9ju5`. Five
lanes: two read-only verification, three builders in their own worktrees.

## S.1 The wave's shape, and why the first act was a ruling rather than a lane

Wave R's hand-off named **#332** as next and said its prerequisite #336 was closed, which was true
and not sufficient. Wave P's implementation map had found **two product decisions gating the screen**
and a third gating one of its acceptance criteria, and the hand-off could not see them because they
were in a comment rather than in the issue's own state — which is #329's subject arriving on the
process that filed #329.

So the wave opened with three rulings, dated before any code:

| ruling | what it settles | the thing to read |
|---|---|---|
| **§ D489** | sign-in is the signed-out **state** of `settings`' YOU section, not an eighteenth screen | The map's blocker — *the handoff specifies no sign-in screen* — is true and one step short. The handoff is silent about a **screen** and explicit about a **state** (§ 15.1), and `everyday/settingsView.ts` withheld that state deliberately, in writing, because drawing it over an empty session would have been a fabrication. Building sign-in **discharges a withholding**; it does not override a specification |
| **§ D490** | one display name; first sign-in adopts the device-local one | The shipped YOU note already claims the device-local name is the board name. That claim is unfalsifiable today and **false the moment a signed-in player posts** under a `player-<hex>` mint. The adoption is legal because `everyday/profile.ts:361` already validates that name with the server's own `displayNameIssueOf` |
| **§ D491** | the server grows a distinct mail-not-sent refusal | `api.ts` already awaits the send deliberately and says why in its own comment. What is missing is the code letting a client act on it — § D486's rule failing in the direction that costs the player |

## S.2 The reservation was opened four lanes late, by the person who wrote the rule down

`documentation.test.ts#OPEN_RESERVATION`'s own comment says the block is drawn **before any lane
starts** and names that as the half wave Q got wrong. This wave drew it after two read-only lanes and
two build lanes were dispatched and three numbers were spent. Nothing was lost — the read-only lanes
allocate nothing, and the two builders hold numbers inside the block later drawn around them — but
that is luck rather than process, and it is recorded in the guard's own comment rather than tidied
out of it.

## S.3 The verification half: nine issues, four items struck, one duplicate closed, one issue filed

**Lane S-V1** (#146, #171, #177, #178) and **lane S-V2** (#158, #159, #169, #174, #225). Every finding
landed as an issue comment on the issue it concerns, which is wave R's own R.5 lesson applied — that
wave had a lane rediscover residue because the previous wave's verifier had written it somewhere
nobody could find.

| issue | premise | outcome |
|---|---|---|
| **#146** | holds; two supporting clauses refuted | **ruled** — § D495, now a build |
| **#171** | partly refuted — the second intervention landed | **retitled**, blocked on #169 → #181 |
| **#177** | partly refuted — item 6 has zero instances | schedulable, rewritten to six |
| **#178** | partly refuted — items 2, 3, 4 built | **retitled**, schedulable, rewritten to six |
| **#158** | holds in every clause | **closed as duplicate of #232**, after its unique item moved |
| **#159** | partly refuted — five templates ship where the body says one | schedulable after a three-way split; **#346 filed** |
| **#169** | partly refuted — item 2 closed | items 1 and 3 schedulable; item 4 blocked on item 3 |
| **#174** | partly refuted — day variation is built | `docs/14` corrected on this wave's own commit |
| **#225** | refuted as worded | **ruled** — § D496 |

### S.3.1 The four findings worth more than the verdicts

**A status table nothing reads had said `designed` for the whole time the step was built.**
`docs/14-building-behaviour-contract.md:16` read `| 4 | designed |` while `random/streams.ts:97`
declared the stream, `traffic/generator.ts:1405` drew it, `runner/crn.ts:204-210` put it in the CRN
cohort key and `sim/dayVariationSeam.test.ts:14-45` measured § 5 criterion 3 with variance ratios
8.30 / 3.51 / 3.68 / 3.33 and an exact shared-day assertion beneath them. § D227's shape pointed at a
**status row** rather than at a refusal, and **no test reads that table** — it was found by a lane
reading a GitHub issue.

**A fourth stale `GAPS.md` § 3 row, and it is the one that survived a deliberate sweep.**
`GAPS.md:123` claims the campaign judges on tuning seeds only and that nothing in the shipped surface
says so. Both halves are refuted four ways (`campaign/judge.ts:252`, `:348-356`,
`campaign/parse.ts:294-301`, `campaign/brief.ts:90-91`). Rows 115 and 117 were annotated CLOSED on
2026-09-02 and **row 123 was missed by that same pass**, which makes it the right mutation fixture
for #325 — a guard that catches rows nobody swept proves less than one catching the row a human
sweep walked past. And it compounds: row 123 is the **source** of #178's item 4.

**Two verified statements about the same capability looked contradictory and were not.** The
2026-09-02 comment on #159 says `EventEffect` cannot express four of § 17's six wrinkle kinds;
`docs/37` § 5.1 says four of six pass. Both are correct and the subjects differ — one measures
`shift/types.ts#EventEffect`, the other the engine's own configuration. **The engine can already
express four kinds that `EventEffect` cannot**, which is a decision about where the wrinkle library
lives before it is an implementation detail: twenty rows against `EventEffect`'s five fields would
leave roughly fifteen that parse, draw a caption and change nothing.

**A branch no player and no sweep reaches.** #169's item 4 (`complexity —` for two towers) is
unreachable today: `freshTower`'s only non-test, non-corpus caller is `openingCareer`, which opens on
`garden-apartments`, and the honesty corpus drives only two towers, both of which publish a
complexity. It becomes reachable the moment item 3's offer surface lands, which is the order to build
them in.

### S.3.2 A comment that contradicted itself, and what it would have cost

#178's 2026-09-04 comment strikes items 2 and 4 with evidence and then lists both under **"What
stays"**, calling item 4 *"the one I would not let sit"*. A reader reaching only that comment
schedules two built things, one at P1. The issue is retitled and the comment superseded rather than
left to be read — which is the same failure mode as #329's third instance, a record correct in one
paragraph and wrong in the next.

## S.4 The telemetry cluster's dependency graph, verified rather than asserted

Lane S-V3 adjudicated **#201, #202, #236, #250, #340** read-only at `8e3c2ea`. **Nothing in the
cluster is closable and nothing is a duplicate** — five issues, five distinct scopes. The edges below
are in § D485's form (a line in the issue body, written once, never edited, whose going stale is the
detection mechanism), and they are recorded here because **#329's build owes a backfill of "the
blocked set it can verify"** and this is that set for this cluster.

| edge | the fact that justifies it |
|---|---|
| **#340 `Blocked by #202`** | `CHARTER_PROGRAMME.md:172` — *"#202 lands **before** any telemetry ships … shipping in the other order is not recoverable"*; `RISKS.md` R31 lists it as a trigger. Concretely: #340's AC4 needs consent copy `docs/26` § 4.1 does not draft and #202's AC5 owes |
| **#250 `Blocked by #340`** | No emitter, no route, no store. `grep -rni telemetry packages/viz/src` → 0, mechanised by `documentation.test.ts:1136` |
| **#250 `Blocked by #201`** | `docs/26` § 8 — *"Two routes, and no third"*. A dashboard reads; #340 **excludes** the dashboard; § 8 is #201's section |
| **#236 `Blocked by #340`** | AC1 is *"against telemetry"*; AC2's abandonment points are § 6.3's beat-drop diagnostic over E8 |
| **#236 `Blocked by #234`** | AC5 names S1–S5. `docs/22-charter.md:183` assigns **S5** to a paired CRN sweep, not to telemetry, and `docs/26` § 9.5 records the charter gate as *"assigning a criterion to the wrong instrument"* |
| **#201 (AC3's baseline clause only) `Blocked by #340`** | `grep -c -i baseline docs/26` → 0, and § 11: *"Nothing in this document has been built."* **This edge does not cover AC5**, which is schedulable today |

**The edges deliberately not drawn are the more useful half**, because a wrong `Blocked by` line never
goes stale and is therefore worse than a missing one:

- **#201 `Blocked by #340` as a whole issue** — false for AC5, which is a specification and needs no
  instrument.
- **#202 `Blocked by` anything** — all three of its residues are documentation and design. **#202 is a
  root of this graph and the backlog reads it as a leaf.** That inversion is the cluster's sharpest
  finding: #340 looks like the thing that unblocks everything and is itself blocked by an explicitly
  non-recoverable ordering rule recorded in two places.
- **#236 `Blocked by #205`** — #205 closed as completed and its deliverable landed. What is missing is
  **recruitment**, and `docs/30:4` says the programme *"recruits nobody"* while `:51` scores it *0 of
  4*. **No open issue owns it.**

### S.4.1 Four unowned prerequisites the cluster will meet

Collected rather than left to be rediscovered, because every one of them is the shape #340 was filed
about:

1. **Cohort recruitment** (#236 AC1) — no issue.
2. **The visible-trouble threshold and dwell, and the `controlKey` registry** (#340 AC1) — both *"owed
   by M2"* per `docs/26` § 11, and **#212, the M2 issue that owed them, is closed**. Without them E3
   and E4 cannot be emitted to spec, and § 6.2 forbids the telemetry client restating the threshold,
   because two definitions of *visible trouble* would be two sets of statistics.
3. **The § 8 read-route question** (#250, settled on #201).
4. **The lawful basis, the published privacy notice, and whether an age statement is needed**
   (`docs/26` § 1.3 and § 11) — a repository-wide search returns only #202.

### S.4.2 What the lane refused, and it is the right refusal

Two closures a reader would plausibly propose — **#201 as a duplicate of #250**, **#202 as a duplicate
of #340** — are refused on the register-partition test rather than on titles. **In both pairs the
older issue's deliverable is a specification the newer one consumes as an unstated input**, so closing
it would push a design decision into a build lane with no criterion requiring it be reviewed. That is
`ISSUE_WORKER_LEDGER.md` § D's #170 ↔ #229 lesson with the polarity that applies here.

**And #202's AC6 has a near-neighbour that is also not a duplicate: #229's AC3.** #229 builds the
*control* (*Clear saved progress works*); #202 AC6 wants the *posture* to carry the category, its
period and its deletion path. Closing either against the other drops half. That this lands on #229 for
the second time is a coincidence, and the lane named it as one so that nobody reads it as a pattern.

### S.4.3 Two figures in `docs/26` § 0 have gone stale, in the class § 0 documents

`:37` records `telemetry` as *"2 files / 6 lines"* — it is **3 files** today, `documentation.test.ts`
having joined when the guard was written, while the 6-line figure describes the narrower server grep
and is still exact. `:55` states *"`analytics` is still 0 files"* — the published command returns **2
files**, both prose by the document's own test. **The claims are intact and the counts are not**, and
§ 0's own rule is the one to apply: *"a measurement whose command is retuned until it gives the old
answer is the defect this table exists to prevent."*
