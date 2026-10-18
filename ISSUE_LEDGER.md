# Issue ledger

One row per open issue, judged against [`GAME_PILLARS.md`](GAME_PILLARS.md). GitHub is the source of
truth; this file is the working view. It supersedes `ISSUE_WORKER_LEDGER.md`, whose last snapshot is
2026-08-09. Snapshot: **2026-10-18, end of cycle 4** (wave AS, PR #638), before the owner's token freeze and the
new playtest track starting Tuesday. Cycle 1's triage was done by three sub-agents; their evidence (file:line)
is summarised in the *next action* column.

Pillars: 1 playable · 2 understandable · 3 simple · 4 engaging during a run.

## Agents in flight

| task | issue | branch | state |
|---|---|---|---|
| none | | | wave AS merged as `f5bc344` (PR #638); #633, #635, #636 and #637 are closed; no playtest is running |

## Cycles 2 to 4, in one paragraph each

**Waves AP to AR** (#622, #632, #634) took the first decision from 181 s to about 60 s, a day to about 4 min, put a
live before/after pair on every stage run, stopped Rush paying more for quitting than for playing, made Rush and Career
fit a phone, and made the report lead with its verdict. #626, #631 and #633 were closed after re-plays confirmed them.

**Wave AS** (#638) fixed #635 and #637: Rush's Play label, a pinned phone HUD, a fast first wave, a held loss moment and
the house time to pass; the live day's flicker and stale skip lines at their root, the order's true start time, the call
card clear of the header; the door and report in the past tense once a day is done, honest call rows, folded advice
after a perfect day, like-for-like comparisons; a quiet career day with Skip beside Play, the rail's clock, and
*Switch to Engineer* in view at 1280×600.

**The decision panel** (three agent seats, on the owner's instruction) ruled the eight roadblocks on #636 and the
follow-up on #635; every ruling is built: day 1 stays quiet (§ D1572), no rung above 30× (Skip is pointed at instead,
§ D1555), running figures in neutral ink (§ D1581), the 20 s allowance kept, Rush's parking chips measured (§ D1588:
INDISTINGUISHABLE at both press times over 50 paired crowds) and removed (§ D1589), calls left in place, stage 3 a
named breach (§ D1582), and stage 2's brief corrected with the survivor census regenerated (§ D1583).

## Build now

| # | title (short) | P | pillar | next action |
|---|---|---|---|---|
| 628 | Census sampler and press price destination panels differently | P2 | 1 | **Fixed** on PR #624, with no published count moved. Open for the owner: should a weight that opens at its default of 0 cost 2 u? A cleaner sampler would regenerate four cells, which is a decision |
| 232 | Building set to the content-plan target | P1 | 2, 4 | **AC4 done** on PR #624 (`buildingFieldReach.test.ts`), with three inert fields filed as #625. AC1 has 17 of 22 buildings. AC2: owner sign-off on harbour-point and ashgate |
| 625 | Three shipped building fields change no leg | P2 | 1 | Item 1's loader warning is fixed on PR #624. Owner: fix the data or keep each field with a reason |
| 627 | Lobby tap targets on short windows wider than 720 px | P3 | 1 | Filed from the lobby review. Buildable |
| 639 | A rush round ended by hand is paid in full when the client omits `stoppedS` | P3 | 1 | Carried from #636 item 8. The shipped client always sends it; needs a choice among three directions listed on the issue |

**Carried to the Tuesday playtest track** (not filed as defects, because they follow from rulings): on a 390×844 phone
the Rush handover picker is folded away during play until the player pauses (§ D1589 with AS-1's compact HUD); Rush has
one in-round choice now, so whether a round feels empty is the first thing to watch; the deep link straight to Rush
(#635 item 7) is unbuilt.

## Needs an owner decision

| # | title (short) | P | pillar | question |
|---|---|---|---|---|
| 234 | No stage clears from the dropdown alone | P1 | 2, 3, 4 | Stage 3 **ruled (b)** by the panel and registered as a named breach (§ D1582). Open: stage 8 (no ruling), stages 4 and 7 (buildable one per lane), stage 10 (waits on the § D1289 ruling), and option (a) for stage 3 as a later lane |
| 571 | Dispatcher choice inert on the opening tower | P2 | 2, 4 | Both built halves have landed. Should the Career opener move to a tower where dispatch matters? Then close |
| 582 | Four usability findings, wave AE | P3 | 1, 2 | Items 1, 3 and 4 are resolved (§ D1048, § D1357, § D1129). Item 2: does the rush's pre-run select still lose to the 600× clock? #622 has merged, so this is unblocked |
| 439 | Congregation template, deadline goal | P2 | 4 | Which gate applies, § 17 or a new goal-kind gate? Touches `goals.ts` |
| 434 | Hotel-over-office supertall | P3 | 4 | Does `shanghai-class-reference` already satisfy it? Likely close |
| 429 | Shafts cost floor area | P2 | 4 | Sign off the `shaft-area` band rate; should lost lettable area become Career income? |
| 248 | Operate the daily challenge | P2 | 4, 1 | Is the weekly total of daily boards still wanted? AC5 is blocked on #242 |
| 231 | [EPIC] Content complete | P1 | all | AC2: may "tuned against telemetry" read as a measured curve? |
| 219 | [EPIC] Feature complete | P0 | all | Re-count AC1 through `ABSENCE_TRIAGE`; the freeze (AC4) is the owner's call |

## Blocked

| # | title (short) | P | blocked on |
|---|---|---|---|
| 355 | No rehearsed rollback of the live site | P1 | A human with Azure access to run § 11.2 steps 1, 3 and 4 in docs/16 |
| 242 | Error monitoring and runbook | P1 | AC3: a human creating and triggering the Azure alert |
| 243 | Launch checklist | P1 | 12 rows need production access; AC4 needs #355 |
| 241 | [EPIC] Launch readiness | P1 | #355, #242, #243 and an outside tester |
| 409 | Gate main-thread block (B3) | P2 | A human timing it once on a named mid-range laptop |
| 553 | Budget rung in force during play | P2 | Unblocked now #622 has merged; the body should match #543's ruling |
| 443 | Retrofit archetype, payback goal | P3 | #439's goal-kind gate |
| 436 | Observation-express tower | P3 | #442 |
| 435 | Wind sway withdraws a bank | P3 | #234 and #372; owner-approved odds |
| 412 | TWIN shaft benchmark | P3 | A shipped building that declares a TWIN shaft |
| 441 | 235-person car class | P3 | #232's building slot and a source |
| 437 | Per-floor destination panels | P3 | A stage that offers panels; retitle to its play-path half |

## Deferred

| # | title (short) | P | why |
|---|---|---|---|
| 432 | Petronas-class twin towers | P2 | Data only, unblocked, but multi-day. The body should state the 2026-09-11 fold ruling |
| 440 | Abraj Al-Bait at 170 lifts | P3 | The cost probe was run (comment on #440). It can ship as a reference building only; live play and a one-job census do not fit. The building waits on #439 |
| 442 | Visitor demand class | P3 | Paired with #436 |
| 562 | Three-state traffic control | P3 | Waits for Engineer work to resume. The `discard*S` core seam could be split out |
| 555 | Per-building energy bar | P3 | Waits on docs/33 O2's tower rebalance |
| 536 | Career continuous run | P2 | Split into three issues (durable recordings, sourced service levels, graphical config); overlaps #622 |
| 422 | Fuller fix-a-building editor | P3 | Neither half is small; duty needs a priced seam |
| 233 | Fix-case content and pipeline | P1 | Triggered by the per-stage census filter. Needs info: was the #570 tenancy-lever bug filed? |
| 247 | [EPIC] Operate after launch | P2 | Post-launch (M6) |
