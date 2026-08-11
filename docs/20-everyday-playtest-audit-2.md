# 20 — Everyday Mode play-experience audit #2 (2026-08-11)

> **Status: the second player-walk, and the one that re-verifies the first.** Successor to
> [`docs/19`](19-everyday-playtest-audit.md), taken after every slice of the Everyday Mode build
> plan landed (0–8 plus the three fix batches). Part A re-walks docs/19's fourteen defects **as a
> player rather than by reading the code** — nine verified fixed, three partial, **no
> regressions, and the blocks-play trap is gone**. Part B plays what is new. Seventeen new
> findings, **none blocks-play**; the two that matter most are that writing a single rule makes
> every later filed day unwatchable under a reason that blames the wrong thing, and that watch
> mode presents somebody else's run with the spectator's own identity — §14.1's own defect
> conditions, present in the shell but outside the module its test greps.
>
> The findings below are the lane's report, verbatim; the evidence is the deliverable.
> Screenshots were taken in the session workspace and are not committed.

Walk complete. Repo untouched (`git status` clean); 70 screenshots in the scratchpad. Writing up.

---

# PT2 — Everyday Mode play-experience audit #2

**Method.** Driven as a player through Playwright/Chromium at **1280×800** against `vite` on port 5399 (`packages/viz/vite.config.ts`, the same harness `*.browser.test.ts` boots). Fresh browser profile — cold first run, no restored session. Screenshots: `/tmp/claude-0/-home-user-elevator-sim/bac14123-a480-501d-a689-b40a5481e334/scratchpad/playtest2/`. No repository file was modified.

**Base, stated honestly:** the walk started on `1c1ddc2` and the checkout moved under me to `c31d5c9` (slice-10a merge, 15:24) partway through; the dev server serves from disk, so late observations are on the newer tree. The merge is docs + honesty-corpus work, but the figures below are "measured on this tree in one sitting", not per-commit.

---

## PART A — the first audit's 14 defects, re-walked

| # | Defect (docs/19) | Verdict | Evidence |
|---|---|---|---|
| **1** | Reload → Resume → run → day never files | **VERIFIED** | Reload mid-campaign → **Resume** → **Run this shift** → played to `playhead: 100%` → the sheet filed: *"Monday — day 1 … attempt 2 at this day"*, streak intact. `15-report-after-resume-run.png`. Same via **Save it and run it** on a rules dispatcher: filed, with a *WHAT MOVED SINCE THE RUN BEFORE THIS ONE* block naming the dispatcher change. |
| **1b** | Does a genuinely unfileable run say why? | **VERIFIED** | Saved a recording, re-loaded it, played to the end: transport line and the empty sheet both read *"this run was loaded from a file, so it is not a day of this week and nothing is banked from it — watch it, scrub it and compare it, and run the shift here to bank one"* (`66-loaded-run-end.png`). Minor wobble: **while** the loaded run played, the status still promised *"…and file when the playhead reaches the end"*; the refusal only replaced it at the end. |
| **2** | Two clocks | **VERIFIED** | One instant, three surfaces agree: header `08:51 / FILLING`, playhead 36.2 %, ticks `08:30 08:45 09:00 09:15 09:30`, feed `08:51 B → Lobby`. Measured band boxes on a free-play run: FILLING 0–41.3 %, PEAK 41.3–57.9 %, EASING 57.9–99.2 % → the report's *"08:47–09:00 … landed in EASING"* is exactly the EASING band, and its peak-5min window `08:42–08:47` is exactly the PEAK band. `18-midrun-0900.png`, `32-timeline-bands.png`. |
| **3** | Saturated people-accounting contradicts itself | **PARTIALLY** | Sheet-internal overlap is now stated: TOOK THE STAIRS carries *"every one of them is inside CARRIED too, so these two cells overlap rather than add"*, and WORST WAIT carries *"the peak-5min window's worst — the goal row reads the whole shift"* (that reconciles the old 1488/1725 pair). **But** on the same screen the left rail reads **taking the stairs 534** while the sheet reads **TOOK THE STAIRS 288** (`38-midtown-report.png`), the rail says *"73 of 200 people waited past the 900 s point"* on a day of 726 riders, and CARRIED still grades ✓ 100 % on a day the sheet's own headline calls *"a building being outrun"*. A player still cannot total the people. |
| **4** | Whole-run figures at a playhead short of the end | **PARTIALLY** | The transport line is fixed — mid-run it reads *"still playing — average wait and 95th-percentile wait are read over the finished day…"*. The **canvas is not**: at **14 % playback**, 08:38, 60 carried, 93 % away inside a minute, the RIGHT NOW box reads **"average wait so far / NO AVERAGE — A RESULT"** and the strip above reads "no average" — the whole-run saturation refusal, published under a *so far* label (`68-canvas-early.png`). `#frame-description` is worse: it carries the complete whole-run suppression paragraph (*"Queue length rose by 128.7 persons … the system is saturated"*) identically at 14 %, 64 % and 97 %. |
| **5** | No visible acknowledgement when a plain lever moves | **PARTIALLY** | A real echo now exists — *"How long anyone should wait is now 78 — that wrote weights.starvation, the same number the term slider below holds."* — and the header flips to *2 WEIGHTED*. At 1280×800 the echo's box is at y = 748–835 with the footer at 745: **below the fold**. The "THE 13 COST TERMS" header still renders as a **58 px** one-word-per-line sliver. `27-editor-after-lever.png`. |
| **6** | Editor opens behind the drawer that launched it | **VERIFIED** | "Open dispatcher editor →" closes the drawer, adds a *Dispatcher* tab, and shows *EDITING — CONVENTIONAL COLLECTIVE* untruncated. `25-dispatcher-editor.png`. |
| **7** | Canvas collapses to a sliver at 1280×800 | **VERIFIED** | `#stage` is **398 px** for Midtown's 21 floors (was 103); shafts, floor labels, wait-age ticks and the `+19/+37` landing counts are all legible, and the alert banner sits over the title strip rather than over the building. `37-midtown-midrun.png`. |
| **8** | Casual view concatenates the Engineer caption | **VERIFIED** | The two registers are joined by an explicit seam: *"… The cell's own note: waited past the 15-minute horizon before a car came…"*. Engineer view shows the short form alone. No dangling fragments found on four sheets. `39-midtown-engineer.png`. |
| **10** | Filed sheet never mentions the intervention | **VERIFIED** | Parked at 08:52 on Garden day 2; the sheet's meta block carries **"08:52 · parked the cars in the lobby"**. `23-day2-report-casual.png`. (No before/after comparison — that was a wish, not the defect.) |
| **11** | Building editor opens on the wrong building | **VERIFIED** | On Midtown it opens *EDITING — MIDTOWN OFFICE*, with a *blank tower* button beside it. `41-building-editor.png`. |
| **12** | Speed chips persist into a new mode | **PARTIALLY** | Free play resets ×900 → ×60. **Watch does not**: with ×900 latched, 1.5 s after pressing *Watch it* the watched run was already at 06:22 of a run ending ~06:26 — somebody else's day is over before you see it. |
| *(9)* | "Bank 0 more clean shifts…" | **VERIFIED** | New branch: *"… is already cleared, and its reward is open … the sheet is the reward now."* |
| *(13)* | Free play grades four goals / "Shift cleared" | **VERIFIED** | Now *"WHAT A SCENARIO WOULD ASK — READ, NOT GRADED"* with `·` glyphs. |
| *(14)* | Restore keeps streak, drops sheet | **VERIFIED** | Empty sheet now explains: *"The rail's banked days are real — they were filed in a previous sitting. Their sheet was not kept…"* |

**Net: 9 of 12 fully verified, 3 partial, 0 regressions to a previous state. The blocks-play trap is gone.**

---

## PART B — the new flows, as a first-timer

| Flow | Playable | Navigable | Intuitive | Informative | The observation that decides it |
|---|---|---|---|---|---|
| **Rules editor (when/then)** | yes | **buried** | yes | yes | I built a working rule with no instructions: `when [the lobby queue passes] [30 people] then [hold a car at the lobby]`, and the readback said *"Reads as: when the lobby queue passes 30 people, hold a car at the lobby"* plus *"moves lobby (idle.parkingStrategy) — the idle cars head for the lobby — there is no per-car count to promise"*. The value dropdown re-units itself (30 s → 30 people) when the condition changes. The stage header then named it live: **"rule 1 — the lobby queue passes 30 people"** from 08:39 to 09:19 (`51-header-rule-pill.png`). Navigability is the flaw: it lives at the bottom of a 10 000-character editor panel, below the selector arms, reachable only by scrolling past everything. |
| **Ghost race** | yes | yes | yes | mostly | All three picks behave as specified: *nobody* draws one lane, no note, **no verdict** (the slot carries a live "183 standing now" instead) and issues no second sim; *the plain baseline* and *your latest saved* each run a rival and print *level with* with the honest footer *"One day each on the same crowd. That is a race, not proof."* Verdict felt honest, never triumphal. Weakness: when the two lanes coincide (the common case) you cannot tell there are two lines, and the strip never says "these two ran identically". |
| **Fix-a-building** | yes | yes | **yes — best new thing** | yes | Opened *The sleeping sky lobby*: tenant letter, four baseline figures, and a diagnosis that names the mechanism (*"For the shuttles the bottom of the run is the street, three hundred metres from the lobbies they serve"*). Repairs are priced and honestly described (*"you are buying machinery to race a parking rule"*). Budget refuses per row: *"short by 1 u — beyond a repair budget"*. Buying the free config fix produced **"The lobby is awake."** with 9 waits → 0 and the case flipping to FIXED (`56-fixit-fixed.png`). Three copy faults below. |
| **Bench suite (8 cells)** | yes | **poor** | yes | **exemplary on statistics** | Ticked two Garden cells at n = 10; it named no winner and said why per measure, then printed the budget note: *"The project's budget is 50–200: ten replications produced a 12 % error against the converged mean in the reference study."* But the output is a 17 800-character wall of prose with no cross-cell summary — nine measures × two cells, each with a four-line paragraph — and it prints a **raw JSON blob** at the player: `Every arm ran this population: {"arrivalRatePctPop5min":2,"building":"garden-apartments",…}`. |
| **Watching a run** | yes | **no** | no | yes | The record framing is excellent (*"A record that no longer reproduces the figures it was filed with is not replayed at all"*), the pill reads `REPLAY · … · VERIFIED BY RE-SIMULATION`, interventions are disabled, and **Stop watching restored everything** — my run at 726 carried, playhead at 09:22, back on the Compare tab I left. But it is *not* unmistakably somebody else's run: the race strip's lane key says **"you"**, the footer says **"lobby holder · seed 20260804"** (my dispatcher, my seed) beside a header saying *THEIR DISPATCHER Conventional collective*, the rail says *"YOUR RUN"* and *"That one got away from you"*, and pressing *Watch it* leaves you on whatever tab you were on — I landed on the Compare panel's suite output with the spectator bar overlapping the app header. |
| **Detector readout** | yes | yes | mixed | yes | It works and it is playhead-honest (updates as the playhead crosses a switch). But under the **rules** policy the no-match state reads **"no clear pattern"** — a traffic-detector sentence — where the editor's own words are *"If no rule fits, Conventional collective decides."* |
| **Designer sizing block** | yes | yes | yes | yes | Cars 4 → 6 moved interval **37.4 → 24.9 s** and handling **102.7 → 154.1 per 5 min** with round-trip time correctly unmoved, the *"a lot of people per shaft"* warning withdrew itself, and the provenance line (*"a prediction from the geometry … it has no queueing model … run a day for that"*) plus the multi-entrance caveat read like a consultant. |

---

## Ranked NEW defects

**No blocks-play defect found.** Severities below are *confusing* / *polish*.

**1. CONFUSING — Write one rule and every day you file afterwards becomes unwatchable, with a reason that blames the file format.**
Repro: dispatcher editor → *Add a rule* → save & run → file the day → menu → Scenarios → **Watch a run**. The current week's day is listed as `Monday · day 1 / — · day 1 of this week` with *"this day was filed without the record of what it ran, so there is nothing to re-simulate — days closed from here on carry one"*. It was closed by this build, seconds ago; and "days closed from here on carry one" is false — every subsequent day carries the same rule and is refused identically. I re-ran and re-filed the same day with the shipped `conventional collective` and it stayed unwatchable, because the rule row is still session state. Screenshots `60-watch-picker.png`, `71-watch-list-after-clean-day.png`. Owner: `watch/record.ts#watchRecordIssues` (the whole-issue refusal) + `watch/library.ts:51` (the one-size message).

**2. CONFUSING — A written rule governs the run but is named nowhere the run is judged.**
After picking *Conventional collective* from the drawer, the rule was still in force (header pill: `rule 1 …`), yet the footer said `conventional collective`, and the filed sheet's identity line said **"Midtown Office · Conventional collective"** — the sheet contains the word "rule" zero times. The exact shape of old defect 10, fixed for interventions and open for rules. Screenshot `48-rule-run-start.png` + sheet dump. Owner: `shift/report.ts` identity line, `dev/state.ts#shiftRunConfigOf` provenance.

**3. CONFUSING — The canvas publishes the whole-run refusal from the first frames, under a "so far" label.**
Repro: run Midtown, scrub to 14 %: 60 carried, 93 % away inside a minute, longest wait 102 s — and the RIGHT NOW box reads *"average wait so far / **NO AVERAGE — A RESULT**"*. `#frame-description` carries the full whole-run saturation paragraph identically at 14 %, 64 % and 97 %. `68-canvas-early.png`, `67-midrun-canvas.png`. Owner: `render/canvas.ts` (the RIGHT NOW cell and the header strip) and the frame-description producer — both are candidates for § D300's E-4 temporal property, which the transport line already passes.

**4. CONFUSING — "taking the stairs" means two different things, six centimetres apart.**
Midtown day 1: left rail *taking the stairs **534***, sheet *TOOK THE STAIRS **288***, both on screen at once, and the sheet's own note says every one of the 288 *was carried* — so the cell labelled "took the stairs" counts people who did not. `38-midtown-report.png`. Owner: `dev/leftRail.ts` mood-cohort labels vs `shift/report.ts` stairs figure.

**5. CONFUSING — The tutorial scenario's first-ever sheet refuses both of its headline numbers, and the small print's explanation of why is wrong.**
Garden Apartments day 1 (the very first sheet a new player sees): **AVERAGE WAIT withheld**, **WORST WAIT not recorded** — *"the reporting window held no arrivals"* — while the goal row beside them reads a perfectly good `38 s` and the rail says *"0.0 people arrived every 5 minutes and the lifts carried 0.0. The lifts kept up with the door."* on a day of 40 arrivals. The window is fixed at the template's PEAK band (08:57–09:02 on both Garden days), but the small print calls it *"the busiest five minutes of the day"* — which a window with zero arrivals in a 40-arrival day is not. The project already measured this: `experiments/src/benchmark/arms.ts:40` — *"Garden Apartments needs the full-run window, not peak-5min … at 1 % the peak-5min cell is invalid on 54 replications in 100"*. The shift path sets no `reportWindow`. `09-day1-end.png`. Owner: the shift run config's window choice + `shift/report.ts` small print.

**6. CONFUSING — The sheet's "worst of it" is a different window from the one its means are taken over.**
Free-play Chancery: means over `08:42–08:47`, *"THE TIGHTEST MOMENT 08:50"*, *"08:47–09:00 The worst of it landed in EASING"* — while the small print says *"a wait quoted on this sheet is a wait during the worst of it"*. On Garden day 1 the same line reads *"The worst of it landed in EASING, at **0.0 %pop/5min**"*. Owner: `shift/report.ts` tightest-moment vs window derivation.

**7. CONFUSING — Watch mode calls the watched run "you" and labels it with the spectator's own identity.**
While watching *The lobby-parking reference*: race-strip key **"you"**; footer `paused · 363 arrived, 363 carried · **lobby holder** seed **20260804** · day 1` (my dispatcher, my seed) beside *THEIR DISPATCHER Conventional collective*; rail headed **YOUR RUN**; the Day report tab silently shows **my** last filed sheet with no note that it is not the run on screen. `62-watching-stage.png`, `63-watch-report.png`. `watch/view.test.ts` greps the *watch view*'s strings — the shell's rails, footer and race strip are outside it. Owner: `dev/main.ts` watch adoption + `live/raceStrip.ts` key + `dev/leftRail.ts`.

**8. CONFUSING — Fix-a-building's verdict says "Better" when nothing got better, and its money copy contradicts itself.**
Bought *New car interiors* (5 u) + *Call-out cover* (6 u) — both described by the product as doing nothing — and ran: **"Better, and the complaint still stands."** above a row reading *"9 waits → 9 waits · **0 %** of it went away"*. `classifyOutcome` (`fixit/engine.ts:272`) uses that head as the fall-through, and its own docstring claims the opposite intent. Two more on the same screen: the budget line reads *"11 of 12 u committed, 0 u of it machinery — **Everything you changed is a setting, and settings are free**"*, and after the real fix the body says *"**Nothing was bought**: the cars were always enough"* while the Spent row reads *"budget 12 u → 11 u"*. `54-fixit-budget.png`, `55-fixit-outcome-wrong.png`, `56-fixit-fixed.png`.

**9. CONFUSING — Engine ids and raw JSON on player-facing surfaces.**
Canvas subtitle and `#frame-description` both name the dispatcher **`yours-1`** where every other surface says *Lobby holder* (`68-canvas-early.png`); the suite prints `{"arrivalRatePctPop5min":2,"building":"garden-apartments","durationS":3600,"peakWindowS":300}` as its population line, and names `packages/experiments' MATRIX_CELLS` in body copy (`59-suite-result.png`). Owner: `render/canvas.ts`, `batch/suite.ts` / `dev/suitePanel.ts`.

**10. CONFUSING — Speed carries into Watch; a stranger's day is over before you look at it.** ×900 latched → 1.5 s after *Watch it* the run is at 06:22 of a ~06:26 record. Free play resets to ×60; watch does not. Owner: `dev/main.ts#enterWatch` transport state.

**11. POLISH — The lever's new echo sentence lands below the fold at 1280×800** (y 748–835, footer at 745), and the cost-terms header is still a 58 px vertical sliver. `27-editor-after-lever.png`.

**12. POLISH — The spectator bar overlaps the app header**, clipping "Elevator Sim", the Menu button and the clock. `61-watching.png`.

**13. POLISH — The dispatcher editor's left column is a large empty white void** once you scroll to the rules section — half the panel width, nothing in it. `46-rule-added.png`.

**14. POLISH — Progress is written on a delay.** Pressing *Open the doors on Tuesday* and reloading ~1 s later restored **Day 1**; the same action with a 6 s pause restored Day 2 correctly. A player who closes the tab after taking tomorrow loses the day.

**15. POLISH — The bench suite has no scannable summary.** Two cells at n = 10 produce 17.8 k characters of prose; per-cell verdicts are only findable by reading. Identical arms print *"interval [0.00, 0.00], crossing zero"* on all nine measures and the copy still says *"not the same as the two settings being identical"* — true, but it reads as evasion when every delta is exactly zero.

**16. POLISH — Fix-a-building's repair rows are toggles with no `aria-pressed` and no tick** (selection is a background colour only), the case stays badged **FIXED** after a later run that fails the complaint at 0 %, and the whole overlay is dark-themed inside an otherwise light product.

**17. POLISH — "attempt 2 at this day" counts a re-simulation caused by an intervention**, so a player who pressed *Run* once and parked once sees attempt 2. Also the header truncates to *"Midto…"* whenever the pattern pill is showing.

---

## PART C — the product as a session

**Is there a loop worth repeating?** Yes, and it is stronger than at the first audit. The loop now closes: run a day → the sheet explains it in the voice of a sympathetic examiner → the *levers you actually have* card points at a fix (*"Today points here: floor P1 stood 201 deep"*) → the editor lets you make that change in plain words → the header names your rule while the day plays → the next sheet prints *WHAT MOVED SINCE THE RUN BEFORE THIS ONE* and names the change you made. That chain — advice → control → visible mechanism → measured delta — is a genuine game loop, and it did not exist before.

**Where a first-timer gets lost or bored.** Day 1 of scenario 1 is still the weakest ninety seconds in the product, and it is now weak in a new way: a gentle building whose *first ever sheet* refuses both AVERAGE WAIT and WORST WAIT, whose rail says *"the lifts kept up with the door"* about 0.0 arrivals per 5 minutes, and whose 40 riders all arrive after the window has closed. The player's first lesson is a refusal about a day in which nothing happened. Second lost moment: the rules editor and the ghost picker — the two most game-like things built since the last audit — are at the bottom of a very long panel and under the stage respectively, and nothing on the coach line mentions either. Third: the suite. A player who ticks a cell out of curiosity gets a dissertation.

**The single best moment.** *Fix-a-building*, first case. You read a tenant's letter, you look at four figures, you are told the fault is in the configuration and not the fabric, you decline to buy a ninth shuttle you cannot afford, you choose a free setting — and the product answers **"The lobby is awake. A shuttle now waits where the building finishes its day, and the letter-writer rides down inside a minute. Nothing was bought: the cars were always enough — they were parked in the wrong place."** That is the whole thesis of the project delivered as a puzzle with a punchline, in about ninety seconds.

**The single worst moment.** Pressing *Watch it* on a shipped reference run and landing on the Compare panel's statistics wall, with a floating bar clipping the app header, a footer naming *my* dispatcher and *my* seed under a heading saying *THEIR DISPATCHER*, a lane in the race strip labelled **"you"**, and a Day report tab quietly showing my own sheet — all while the run I asked to watch was already over because ×900 was still latched. Every one of the four defect conditions §14.1 set out to prevent is present in the room; they are just outside the module the tests grep.

---

## What I would do next

1. **Give Garden Apartments the `full-run` window in the shift path.** The measurement that justifies it is already in the repo (`arms.ts:40`); the tutorial building currently refuses its own headline numbers roughly half the time.
2. **Put the shell's own rails, footer and race strip inside the watch view's string corpus.** The rule *"the word `you` does not appear"* is enforced over the panel and not over the screen, and the screen is what the player reads.
3. **Make the record refusal name its cause.** `watchRecordIssues` already knows which issue fired; printing it turns "your days are mysteriously unwatchable forever" into "this day ran rules you wrote, and a record cannot name them yet".
4. **Extend § D300's temporal property to `render/canvas.ts`'s RIGHT NOW cell and the frame description.** The transport line was fixed by exactly this method; the canvas is the surface a player actually watches.
5. **Fix the fixit fall-through head** so "Better" requires a measured improvement, and key the *"settings are free"* sentence on spend rather than on machinery spend.
6. **Pick one word for the give-up cohort** and use it on both the rail and the sheet, or rename one of them. Two numbers under one label, side by side, is the accounting complaint from the last audit wearing a new hat.
7. **Surface the two new toys.** A *Write a rule* row beside *Open dispatcher editor →*, and one coach line pointing at the race strip, would double their discovery rate for free.

result: PT2 audit complete — of the first audit's 14 defects 9 are verified fixed (including the blocks-play Resume trap) and 3 are only partial (saturated people-accounting, mid-playback whole-run figures on the canvas, lever feedback at 1280); the new rules editor, ghost race, Fix-a-building, bench suite and watch flows all work, with 17 new ranked defects — the worst being that writing one rule silently makes every later filed day unwatchable under a wrong reason, and that watch mode labels somebody else's run "you" with the spectator's own dispatcher and seed; screenshots in `/tmp/claude-0/-home-user-elevator-sim/bac14123-a480-501d-a689-b40a5481e334/scratchpad/playtest2/`.