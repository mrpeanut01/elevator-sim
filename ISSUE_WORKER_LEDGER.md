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
  both a dispatcher sweep inside one `it()`.
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
