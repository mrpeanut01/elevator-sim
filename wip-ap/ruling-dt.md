# Swarm DT: reconciled ruling

Members: S1 (player), S2 (honesty), S3 (engineering and measurement). Full texts are in `S1.md`, `S2.md` and `S3.md`, with instruments in `S1w/`, `S2w/` and `S3w/`. Where members split, a measurement beats an argument, and nothing may put a forecast where it cannot be true.

## What was measured (3 of 3 unless named)
- **The panel is one sample.** All three seats met one date-derived crowd sequence (§ D1229, `20261013dk`); Fairness first left alone reproduces all 15 of seat D's verdicts (S2), and S3 replayed seat D's Monday to the minute.
- **Keep can be wrong only on a day the kept driver misses and another play clears.** That is about 8 to 14 days in 100 (S2 14 in week 2 on the player's line; S3 8 to 10 by the census rows, 4 of 40 fresh crowds; S1 about 1 in 8). Zero in the panel's 15 is about a one-in-ten draw (S2).
- **The census reads a different line and counts rows.** DC-13 plays one seed all week, parks where players leave, and counts a losing day up to three times: its 12 keep-loss rows fall on 5 days, and in days it reads 5 of 9, inside the band (S3). `callBands.ts#weekBandsLinesOf` ignores bookings, so weeks 3 and 4 print week 2's figure (S2; seat A's identical sentence).
- **The wall is the dead day.** No driver left alone, no one-press play and no answer at a raised call clears 15, 18 and 25 of 100 day-crowds in weeks 2, 3 and 4 (S2). All four days the panel lost were dead; 0 of 80 (S3), 0 of 112 (S2) and 0 of 31 (S1) plays cleared them, lost by 08:35 to 08:53. The 08:00 bookings turned carried crowds into walls and none into decided days (S1, S3: the same crowds clear without the booking).
- **Excusing dead days alone** would let Fairness first left alone hold about 83 to 88 % of weeks (S1 and S3 agree on the figure).
- **Rows.** A morning call's losing answer first crosses a bar 184 to 232 minutes later, at the lunch peak; a lunch call's within 2 to 18 minutes (S3). The fewest-waits answer cleared 5 of 16 split rows (S3); seat B predicted 0 of 7 from it.

## Q1 and Q2: deal days that can be won, and that need the player
Members split three ways: S1 withdraws week 4 and keeps the dead days (refusing exclusion because passive holds rise); S3 excuses dead days at the close (accepting that rise); S2 deals from a measured pool with no dead day and at least one need day a week. **S2's ruling wins** because it is the only one that meets both majorities: two of three (S2, S3) say a dead day must not count, and two of three (S1, S2) say passive holds must not rise.

1. **A pool of measured crowds.** From week 2, every counted day is dealt from a pinned, published pool for its order, level and weekday (`data/week-pool.json`), indexed by date, day and weeks closed so everyone on a date meets one crowd and can check it. This replaces § D1229's derivation for those days in writing. Each crowd carries a measured tag:
   - **dead**: no shipped driver left alone and no answer at any call raised under either banded driver clears it;
   - **need**: both banded drivers left alone miss it, and a brief pick (another driver left alone) or one answer at a raised call clears it;
   - **live**: anything else.
   Each crowd also records which drivers clear it left alone and which answers at which calls clear it. One-press plays are not tagged: none of 223 tried saved a dead morning.
2. **The dealer.** No dead crowd is dealt as a counted day. Each week from week 2 deals at least one need day, on a weekday chosen by the same index. The number of need days a week is the least that holds DC-11 (the stronger banded profile left alone holds no more than half the weeks) over the pool as dealt.
3. **The gates read the pool as dealt.** DC-10, DC-11, the monotone clause (§ D1400) and § D1337's trap check (no single answer clears more than two thirds of need days) are re-read over the pool. A level whose gates fail is withdrawn, and the sheet says so. S1's DC-14 is subsumed: with no dead day, fate decides no week. S1's withdrawal of week 4 is not taken by fiat; the gates decide it.
4. **DC-13 in days.** The keep band is read as the share of need days in the pool as dealt, per banded profile, on the player's line (*leave* at placement calls). *Your week* states it in days for the level as dealt (S2's sentence form). The row band stays an instrument that no sheet quotes, and "where the player is" is struck from `docs/33` (S2).
5. **The brief states the ways through** (S1 and S2): on every pooled day, from the pool's record and with no run in the browser, how many of the 13 drivers clear this crowd left alone, naming none. On a need day with no driver, it says that answering a call cleared it on this crowd. **The close** names, in the past tense, the drivers that cleared and the answer that would have (S1, S2 and S3 all name after the day).
6. **Refused:** S3's excusing dead days at the close, since the pool never deals one and passive holds must not rise; screening crowds in the browser (S2: it drops the days a call saves); asking who drives only at splits (S1); an earlier first call (S2); any bar, target or slope moved (`docs/38` § 4); removing the picker (§ D525, § D528). S3's refusal of crowds "screened to split" is met: the pool is screened for dead and need, it is published, and the trap check runs over it.

## Q3: rows that teach (3 of 3 on the shape)
1. **Each row leads with the first crossing** once the playhead has reached it: *From 12:38, park could no longer clear: the deepest landing reached 33 against 32* (S3's wording, S2's honesty pair). Until then it reads *No answer has crossed a bar yet*, then each answer's deepest landing and longest wait at the playhead, the answer taken first. *Cleared* is said only at the close.
2. **The count leaves the stage row.** On the report row it comes last, labelled as not one of the day's goals (S2 and S3 keep it there; S1 would drop it).
3. **The caveat is said once,** above the rows (S1, S2).
4. **The pinned call reads goals** from the three runs `dev/main.ts#measurePinnedCall` already makes, through `dayCallMaximaOf`; a record written before keeps its counts-only row (3 of 3).
5. **The close names every answer's verdict on a split row,** with the goal each missing answer crossed, its figure and its clock (S2; widens § D1433 clause 3).
6. **Refused (3 of 3):** seat A's per-answer effect on the card, and any whole-day verdict ahead of the playhead. § D1432 stands.
7. **The card's two faults go here too:** seat A's nearest-bar pick named the landing while the wait was already past its bar, and seat D's card and row disagreed at 08:48. A goal already past its bar ranks first.

## Q4: after the top
1. **The ladder continues by need days** (S2): past the booking ladder, each level adds one need day a week from the pool, admitted by the gates in Q1 item 3, paying § D1402's 10 chimes once per level. No streak pays (3 of 3).
2. **Start next week stays the held top's primary press** (S2 and S3: the week keeps dealing new crowds), because many tomorrows are the hook. **The tower's Rush is offered beside it** (S1), with this device's best and the line that chimes buy its pre-fit and purse there.
3. **The onward tower** is offered only where a census admits a ladder harder than this top (S1, S3).
4. **The sheet** says what the next level adds, *harder* only on § D1344's measure, and names what a held level paid (seat D's D6, lane AP-D2).

## Owner-reversible
The pool's size, the need-day count's rule, the two banded drivers the tags read, the brief's count form, dropping the count from the stage row, the need ladder, the Rush beside the top's primary press, and replacing § D1229's derivation with the pool.

## Lanes
| lane | contents | after | cost |
|---|---|---|---|
| **DT-1 Days that can be won** | Q1 items 1 to 5 and Q2: the pool census, the dealer, the gates over the pool, DC-13 in days, *Your week* per level, the brief's ways line and the close's names | none | about 3 agent-days, plus 3 to 6 machine hours detached |
| **DT-2 Rows and the top** | Q3 items 1 to 7, Q4 items 2 to 4 | none | about 1.5 agent-days |
| **DT-3 The need ladder** | Q4 item 1 | DT-1 | about 1 agent-day, plus census |
