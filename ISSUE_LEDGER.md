# Issue ledger

One row per open issue, judged against [`GAME_PILLARS.md`](GAME_PILLARS.md). GitHub is the source of
truth; this file is the working view. It supersedes `ISSUE_WORKER_LEDGER.md`, whose last snapshot is
2026-08-09. Snapshot: **2026-10-17, cycle 1**, against main `bc668c3`. The read-only triage was done
by three sub-agents; their evidence (file:line) is summarised in the *next action* column.

Pillars: 1 playable · 2 understandable · 3 simple · 4 engaging during a run.

## Agents in flight

| task | issue | branch | state |
|---|---|---|---|
| B-234 | #234 stage 3 | `fix/234-stage-3` (worktree) | building |
| B-232 | #232 AC4 | `test/232-dead-building-fields` (worktree) | building |
| B-590 | #590 | `test/590-rung-remeasure` (worktree) | measuring |
| P-0 | baseline playtest | none (read-only) | running |

**Do not collide with PR #622** (wave AP, paused by the owner). It touches `packages/viz/src/everyday/*`,
`shift/*` (including `goals.ts`), `data/week-pool.json` and `campaign/career.ts`. It also reserved
decisions **D1445–D1540**, which overlap § D1445 (the lobby) on main; this cycle uses D1541 and up.

## Build now

| # | title (short) | P | pillar | next action |
|---|---|---|---|---|
| 234 | No stage clears from the dropdown alone | P1 | 2, 3, 4 | Stage 3 first; stages 4, 7, 8 follow one per lane. Stage 10 waits on the § D1289 censoring ruling |
| 232 | Building set to the content-plan target | P1 | 2, 4 | AC4 (dead-field check) is in flight. AC1 has 17 of 22 buildings. AC2: owner sign-off on harbour-point and ashgate |
| 590 | Re-measure five rungs at n = 50 | P2 | 4 | In flight. If a rung leaves its band, that is a decision, and the band does not move |

## Needs an owner decision

| # | title (short) | P | pillar | question |
|---|---|---|---|---|
| 571 | Dispatcher choice inert on the opening tower | P2 | 2, 4 | Both built halves have landed. Should the Career opener move to a tower where dispatch matters? Then close |
| 582 | Four usability findings, wave AE | P3 | 1, 2 | Items 1, 3 and 4 are resolved (§ D1048, § D1357, § D1129). Item 2: does the rush's pre-run select still lose to the 600× clock? Collides with #622 |
| 439 | Congregation template, deadline goal | P2 | 4 | Which gate applies, § 17 or a new goal-kind gate? Touches `goals.ts` (#622) |
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
| 553 | Budget rung in force during play | P2 | PR #622 (`stageScreen*`, `rushScreen*`). The body should match #543's ruling |
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
| 440 | Abraj Al-Bait at 170 lifts | P3 | The building waits on #439; an optional cost spike (test-only 170-car stub) can run any time |
| 442 | Visitor demand class | P3 | Paired with #436 |
| 562 | Three-state traffic control | P3 | Waits for Engineer work to resume. The `discard*S` core seam could be split out |
| 555 | Per-building energy bar | P3 | Waits on docs/33 O2's tower rebalance |
| 536 | Career continuous run | P2 | Split into three issues (durable recordings, sourced service levels, graphical config); overlaps #622 |
| 422 | Fuller fix-a-building editor | P3 | Neither half is small; duty needs a priced seam |
| 233 | Fix-case content and pipeline | P1 | Triggered by the per-stage census filter. Needs info: was the #570 tenancy-lever bug filed? |
| 247 | [EPIC] Operate after launch | P2 | Post-launch (M6) |
