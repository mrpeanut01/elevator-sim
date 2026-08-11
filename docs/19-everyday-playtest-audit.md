# 19 — Everyday Mode play-experience audit (integrated tree, 2026-08-11)

> **Status: the playtest of the Everyday Mode delivery, walked as a player.** The successor to
> [`docs/17-play-experience-audit.md`](17-play-experience-audit.md), taken on
> `claude/casual-gameplay-implementation-ycybr1` after slices 0–3, 5, 6a, 4b and 7 landed.
> Fourteen ranked defects with reproductions (screenshots in the session workspace, not
> committed); **defect 1 is blocks-play** and owns a fix lane. The findings below are the
> verification lane's report, verbatim — the evidence is the deliverable.

The walk is complete. I have 20+ screenshots and verified reproductions. Let me do one final sanity re-check of the headline defect before writing the report — confirming the exact repro sequence once more from the evidence I gathered (reload → Resume → Run this shift → full day → "Nothing filed yet", then menu → Scenarios → same actions → sheet files as "attempt 2"), which I did in steps 20 and 22 with screenshots `21-trap-check.png` and `23-recovered-report.png`. That check holds: the same actions file a day or not depending solely on which menu row was used to leave the menu.

result: Play-experience audit of elevator-sim complete — verdict: strong, honest, often beautiful product with one blocks-play trap (after any reload, leaving the menu via Resume makes every run silently unfileable, including via the very button the empty report names) plus a ranked list of 14 defects with repros and screenshots in `/tmp/claude-0/-home-user-elevator-sim/bac14123-a480-501d-a689-b40a5481e334/scratchpad/playtest/`.

---

# Play-experience audit — elevator-sim, integrated tree, 2026-08-11

Driven as a player via Playwright against `npx vite` in `packages/viz` (port 5199), Chromium at `/opt/pw-browsers/chromium`, mostly at 1280×800 with a 1440×1000 re-check. Screenshots: `/tmp/claude-0/-home-user-elevator-sim/bac14123-a480-501d-a689-b40a5481e334/scratchpad/playtest/`. No repository files were modified.

## Per-flow verdicts

| Flow | Playable | Navigable | Intuitive | Informative | The observation that decides it |
|---|---|---|---|---|---|
| Cold load → menu | yes | yes | yes | yes | "Start here" is visually singled out, every server-dependent row says "needs a server, and this one has none", and How to play is genuinely good writing. First choice is legible in one glance. (`01-cold-load-menu.png`) |
| Scenario week (day loop) | **yes, until you reload** | yes | yes | yes | The loop — run, auto-open report, next day, hardened bars with "was" values — is the best game loop here. But after a reload, the natural Resume row silently disables filing forever (defect 1), which kills the loop for every returning player. |
| The stage | yes | yes | mixed | mixed | At 1440×1000 the building reads well and a bad morning *feels* bad before any number (× face, red rail, "96 people stacked up at Garage"). At 1280×800 the canvas is a 103-px sliver for a 21-floor tower (defect 7), and the timeline runs on a different clock from the header (defect 2). |
| Dispatcher editor, 4 plain levers | yes | yes | mixed | yes | The lever is honest — moving "How long anyone should wait" 0→60 moved the `starvation` term 0→60 and the header to "2 WEIGHTED", and the cost formula updates live — but at 1280 the 13 terms are below the fold, so nothing *visible* tells you the lever mattered (defect 5). |
| Intervention (Park the cars) | yes | yes | **yes** | yes | Found it without being told (it sits above the canvas). Pressed mid-run at 09:14: stamp "09:14 · parked the cars in the lobby" appeared beside the button, clock flowed 09:14→09:15→09:18 with no jump — "only the future changed" reads true. Tooltip states the semantics exactly. Never saw the disabled state in normal play. But the filed sheet never mentions the intervention (defect 10). |
| Four goals (left rail) | yes | yes | yes | yes | Day 1 shows "—", after filing shows "was 100% / was 42 s" beside hardened bars; ×s on the failed Midtown day are unambiguous, red, and valued (17%, 245, 1725 s). This slice works. (`24-tuesday-goals.png`, `34-midtown-report.png`) |
| Building editor sizing block | yes | yes | yes | **yes** | Add a shaft: round trip 113.6→104.8 s, interval 56.8→34.9 s; raise speed to 0.75: 104.8→97.5 s. The dominance sentence ("dominated by stops and door time, not by speed") plus the 50 %-sanity-bound warning read as advice from a consultant, not noise, and the provenance line ("no queueing model … run a day for that") is exactly right. |
| Day report | — | — | — | **best surface in the product** | The failed-day sheet ("It did not cope … a building being outrun, not a dispatcher having a bad day"), the withheld average carrying the run's own reasoning, and levers reordered with "Today points here" evidence. Marred by contradictory people-accounting on saturated days (defect 3) and caption concatenation (defect 8). |
| Free play | yes | yes | yes | yes | Clean six-axis form; the banner "Scenario 2 is kept on day 1 — pick that building again and it carries on" is a lovely reassurance. But the sheet still grades four goals and announces "Shift cleared" on a run that banks nothing (defect 13). |
| Compare | yes | yes | yes | **exemplary** | 100 sims in 6.4 s; "contains zero — not ordered by this batch", energy "shown and never ranked", and "running it again on a different seed until it separates: that chooses the answer" — the statistics discipline made legible. |
| Lab / Parameters / Machines | yes | yes | yes | yes | Parameters opens with "NOT APPLIED — nothing the Run button does reads this" and Machines with "Nothing here is pickable, and that is deliberate", each pointing where the choice *is* made. Honest refusals that read as refusals, not bugs. Neither screen is dead weight, but Parameters is for optimizer authors, not players. |

## Ranked defect list

**1. BLOCKS-PLAY — After a reload, leaving the menu via Resume makes every run silently unfileable, including via the button the empty sheet names.**
Repro: reload the page mid-campaign (session restores; menu up) → press **Resume** → press **Run this shift** → play the day to its very end (playhead `left: 100%`) → Day report reads **"Nothing filed yet — Play a day through — press 'Run this shift' — and the sheet fills itself in."** The player has just done exactly that. "Open the doors on tomorrow" is disabled with no explanation. Same happens from the dispatcher editor's "Save it and run it". No refusal sentence is printed anywhere (the loaded-run path got one in issue #136; this path returns silently). Recovery — reopening the menu and leaving via the Scenarios row — is discoverable by accident only; after it, the identical actions file "attempt 2 at this day". Screenshots: `21-trap-check.png`, `23-recovered-report.png`. Owner: `packages/viz/src/dev/main.ts` — `closeShift`'s `if (!playerHasChosen) return;` (~line 3689) and `closeMenu`'s `entered-a-mode` classification (~line 2267). § D232's gate, written for boot's phantom run, has swallowed runs the player explicitly configured and started; the flag should latch on "the player started a run on purpose" (Run this shift, Save it and run it, scenario card), or the refusal must at least speak.

**2. CONFUSING — The product runs on two clocks, both player-facing.**
The header clock, report, and tightest-moment all speak 08:30-based wall time; the timeline's phase bands (FILLING 06:00 · PEAK 06:14 · EASING 06:28 …) and the left rail's "WHY IT DID THAT" decision feed (`06:47 A → 4` while the header reads 09:26) speak a 06:00 template axis. A player cannot line up "the worst of it landed 08:47–09:00" with the bands, and "landed in EASING" is hard to believe of a stretch the bands place at PEAK. Screenshots: `06-x60.png` (bands 06:00–07:00 under header 08:37), `34-midtown-report.png` (feed at 06:53 beside clock 09:26). Owner: transport phase-strip labels and decision-feed timestamps in `packages/viz/src/dev/main.ts` / `dev/leftRail.ts` versus the header/report's mapping.

**3. CONFUSING — Saturated-day accounting contradicts itself on the sheet.**
Midtown day 1: CARRIED "768 **of 768 who turned up**" and headline "768 asked for a lift and 768 got one, with 0 still standing" — beside TOOK THE STAIRS **348** ("counted here and nowhere else"), a levers card saying "348 riders gave up and took the stairs", and an unluckiest-rider note saying "102 of 236 waited past the 900 s point". The carry goal grades ✓ 100 % on a day a third of the building walked. Whatever the internal definitions, the player cannot total the people, and the carry bar looks ungameable in the wrong direction (serving fewer people should not read as carrying everyone — the project's own § D106 footing). Also two worst-wait figures (box 1488 s = peak window, goal row/mood 1725 s = whole shift) reconciled only in the small print. Screenshot: `34-midtown-report.png`. Owner: `packages/viz/src/dev/reportPanel.ts` / `shift/report.ts` figure derivations.

**4. CONFUSING — Whole-run figures published at a playhead short of the end.**
The line under the timeline ("average wait 29.3 s (over 1 ride)", later "average wait suppressed (n = 236 rides) … the queues never settled during this run") is constant from the first second of playback — at 2:02 into a run with 0 arrived it already carried the final run's numbers, past tense included. The stage's top-right "NO AVERAGE — the queues never settled during this run" likewise shows at 27 % playback. This is exactly the pattern § D300's E-4 temporal axis polices on other surfaces (the "so far" register on the stage header does it right). Screenshots: `05-x10.png`, `29-midtown-peak.png`. Owner: transport status line in `packages/viz/src/dev/main.ts`; candidate new surfaces for `honesty/surfaces.ts`'s temporal property.

**5. CONFUSING — Moving a plain lever produces no visible acknowledgement at laptop width.**
At 1280 the 13 terms are below the fold; the only on-screen change when a lever moves is the sidebar header "THE 13 COST TERMS — 2 WEIGHTED", which renders as a one-word-per-line vertical sliver. The mapping to the term below is stated in prose but not *shown* (no highlight, no scroll, no inline echo of the term it moved). Screenshots: `15-editor-full.png`, `16-lever-moved.png`. Owner: `packages/viz/src/dev/dispatcherEditor.ts` + `#panel-dispatcher` layout in `packages/viz/index.html`.

**6. CONFUSING — "Open dispatcher editor →" opens the editor behind the drawer that launched it.**
The drawer stays open and occludes the right half of the editor ("EDITING — CONVENTIO…" truncated); the player must know to press "Close controls", whose button itself overlaps the drawer's first two tab labels at 1280. Screenshots: `14-dispatcher-editor.png`, `11-controls-drawer.png`. Owner: `packages/viz/src/dev/rightRail.ts` (the four `Open … editor` handlers) + drawer CSS.

**7. POLISH — The stage canvas collapses to a sliver at 1280×800.**
For Midtown (21 floors) the canvas CSS height is 103 px; the wait-age ticks are sub-pixel and the alert banner ("180 people stacked up at Lobby") covers most of the building. At 1440×1000 the same scene is 375 px and genuinely readable — shafts, loaded cars in orange, red +226 at the lobby. The drama exists; small screens never see it. Screenshots: `30-canvas-closeup.png` vs `32-canvas-tall.png`. Owner: stage layout CSS in `packages/viz/index.html` / `render/canvas.ts` sizing.

**8. POLISH (copy) — Casual view concatenates the Engineer caption after the Casual one, producing dangling fragments.**
"…flatter the day. **waited past the 15-minute horizon**" and "…refused. **an observation, never suppressed — over 29 served legs**". In Engineer view those trailing fragments stand alone correctly — the two registers are being joined without a seam in Casual. Also "over **1 legs** in the peak-5min window", and the AWAY-INSIDE-A-MINUTE caption explains a refusal of "the average below it" on days the average is plainly printed. Screenshots: `09-report-mid.png` vs `47-engineer-report.png`. Owner: figure-caption assembly in `packages/viz/src/dev/reportPanel.ts` (likely the both-registers rendering from the issues #110/#100 wave).

**9. POLISH (copy) — "Bank 0 more clean shifts on this building and the next assignment opens."**
Printed in WHAT THIS TAUGHT after the scenario is already cleared. Owner: `packages/viz/src/dev/reportPanel.ts` / `shift` taught-line.

**10. CONFUSING — The filed sheet of an intervened day never mentions the intervention.**
The stamp ("09:14 · parked the cars in the lobby") lives only on the stage; the Day report of that same day is indistinguishable from an untouched one. The player's question — "did my park matter?" — has no answer anywhere. Screenshots: `26-intervention-settled.png`, `27-tuesday-report.png`. Owner: `reportPanel.ts` meta lines / the shift record the sheet reads.

**11. CONFUSING — The building editor opens on a different building than the one on stage.**
On Midtown, "Open building editor →" shows "EDITING — GARDEN APARTMENTS". The no-clobber rationale in `rightRail.ts` is sound for a dirty draft, but with no draft at all the mismatch reads as a bug. Screenshot: `37-building-editor.png`. Owner: `packages/viz/src/dev/rightRail.ts` / `dev/editor.ts` seeding rule.

**12. POLISH — Speed chips persist across mode entry; ×900 makes a new mode's first day end in ~2 s.**
Entered Free Play with ×900 latched from a previous run: by the time the stage appeared, the day was over ("across the whole shift" mood, 360 carried) without a frame of it being watched. Owner: `dev/main.ts` transport state across `enterFreePlay`.

**13. CONFUSING — Free play's sheet grades four goals and announces "Shift cleared" on a run that banks nothing.**
The single-run shape correctly drops the streak/contract lines and says "one run, not part of a week — nothing is banked" — then still shows THE SHIFT ASKED FOR with ✓s against bars no contract issued. Cleared *what*? Screenshot: `47-engineer-report.png`. Owner: `reportPanel.ts` single-run shape.

**14. POLISH — Returning-player restore keeps the streak but drops the filed sheet.**
After reload the rail says "on a roll · 1/1 banked" while the Day report says "Nothing filed yet" — coherent once you know sheets aren't persisted, jarring the first time (and it feeds defect 1's trap). Owner: session save/restore in `dev/main.ts`.

Minor copy nits seen along the way: "1 clean **days** running"; the Settings playback-speed row (0.5×–8×) beside the stage's ×1–×900 chips is two speed controls with no stated relationship; the menu's "Resume — back to the shift on screen" appears on a genuinely first run.

## What would make it fun

The drama is real and it is in the right place — watching Midtown drown while the mood face hardens and the stairwell count climbs *feels* bad well before any number, and the failed-day sheet then explains it like a sympathetic examiner. What the game lacks is not honesty but *momentum*:

- **Close the loop the trap breaks.** Defect 1 aside, the single best retention move is already half-built: the report's "was" column and delta block make yesterday-vs-today legible; a one-line "your best Monday on this building" would make the *next* attempt itch.
- **Let the intervention leave a trace on the sheet.** One meta line — "at 09:14 you parked the cars; before that moment the two records are identical" — turns the park button from a toy into an experiment the report acknowledges. The data is already in the day's record.
- **Surface the lever's consequence where the eye is.** When a plain lever moves, flash/scroll the term it moved and echo the new cost formula next to the lever. The formula line (`cost = 1.00·wait + 0.60·starvation`) is the best feedback in the editor and it is currently below the fold.
- **Make the first bad morning arrive sooner.** Garden Apartments is so gentle that days 1–2 are ceremony (29 arrivals, everything 100 %). The scenario card promises "nothing here is hard", but one booked event on day 2 — a car out for an hour — would teach the intervention and the report's diagnosis in the first session, using machinery (`serviceEvents`, the events cycle) that already exists.
- **Point the crisis at the fix.** The Midtown sheet says "Add a car — the Building tab will let you feel how much it buys". Making that lever line a link that opens the building editor *seeded with this building* (defect 11) would convert the report's advice into the next click, which is the whole game.

Everything above is small relative to what is already there: the observation-sheet voice, the refusal discipline, and Compare's verdict prose are the product's personality, and they survive contact with a player.