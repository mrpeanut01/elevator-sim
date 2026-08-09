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
| **#100** | The dispatcher cards show `cost = 1.00 times wait` | **Not reproduced on the rail, in either mode, on any of 13 profiles.** The string is real and lives in the dispatcher **editor** (`authoring/dispatcherSpec.ts#weightSummaryOf`). Misattributed, not false — filed as **#146** |
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
| **W18-5** | `PROVISIONED_FALLBACK` points at a path that exists on no machine this repo has been measured on | Kept, with its status stated as documentation rather than a usable default |
| **W18-6** | Two `.primary` buttons in one `.editor-actions` row, so the run verb must be located by exclusion | Left alone — giving it an id is a product change, and this was a test-repair lane |
