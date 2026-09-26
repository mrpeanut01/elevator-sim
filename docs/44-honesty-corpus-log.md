# 44 · The honesty corpus log

**Status: record, split out of [`CLAUDE.md`](../CLAUDE.md)'s Phase 9 row on 2026-09-26 by
[§ D1236](../DECISIONS.md), on the owner's instruction to lighten each wave's overhead.** The row
itself keeps only the current figures, the method rules this history taught, and a pointer here.
Everything below is the row's wave-by-wave text as it stood at `7e54a14`, moved verbatim, newest
first. The only edits are these: the headings, which name the wave each passage records; the two
spaces of list indentation each line carried inside the row; and relative link targets, rewritten
so they still resolve from `docs/`. Sentences that say *above*, *below* or *this row* meant the
Phase 9 row when they were written, and are left as written.

**How to add an entry.** One entry per wave, headed `## Wave XX`, newest first, placed above the
entry for the wave before it. At most **120 words of prose**, tables excluded; the figures go in the
table and the reasoning goes in a decision entry or the lane's own docstring.
`packages/experiments/src/validation/documentation.test.ts` holds the cap for every entry written
after this split; the entries below are older than the cap and are registered there by name.

**Where the current figures are.** [`CLAUDE.md`](../CLAUDE.md)'s Phase 9 row, and nowhere else.
The always-on row is measured on the integrated head; the deep row is read from the nightly
`corpus-figures` job in [`.github/workflows/deep-tiers.yml`](../.github/workflows/deep-tiers.yml).

## Wave AM

**Wave AM's move is 304.41 strings a case always-on, with two surfaces.** The base, `main` at
`838100b`, reproduced wave AL's always-on row to the string. Measured at `f3e8137`; the deep tier
was not measured locally and is read from the nightly job (§ D1236).

| | base `838100b` | wave AM | move | per case |
|---|---|---|---|---|
| always-on strings | 926 377 | **941 293** | **+14 916** | **304.41** |
| always-on surfaces | 75 | **77** | **+2** | none |
| cases · simulations · failing cases | 49 · 606 · 0 | **unmoved** | **0** | none |

**The surface sets were diffed**: `shift/dayClose.ts#dayCloseOf` and `shift/weekStake.ts#weekSheetOf`
were added, both within lane AM-C's forecast of one or two, and nothing was removed. Lane AM-D's
forecast surface did not appear. The lanes' floors sum to about 234 a case; the move is not split
between them (§ D256).

## Wave AL

**Wave AL's move is 142.24 strings a case always-on and 143.87 deep, with one surface in each,
forecast by name.** The base, `main` at `cb28ba5`, reproduced wave AK's row to the string in both
tiers, the eighth consecutive wave. Measured at `eff454b`, on a head green in all six projects
(viz by directory, viz-browser **69 / 407**, core **3 012**, experiments **1 526**, cli **179**,
server **650** on a quiet box, `tsc -b` clean).

| | base `cb28ba5` | wave AL | move | per case |
|---|---|---|---|---|
| always-on strings | 919 407 | **926 377** | **+6 970** | **142.24** |
| deep strings | 1 148 854 | **1 157 486** | **+8 632** | **143.87** |
| surfaces | 74 / 75 | **75 / 76** | **+1 / +1** | none |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | none |

**The surface sets were diffed**: one added in each tier, `everyday/stageCallRow.ts#stageCallRowsOf`,
the left side of lane AL-E's declared pair, and nothing removed. Seven lanes published floors
summing to about 121 a case; the move is above every floor and is not split between them (§ D256).

## Wave AK

**Wave AK's move is 129.20 strings a case always-on and 131.02 deep, with one surface in each,
and the deep tier found a defect the lanes could not see.** The base, `main` at `67599fe`,
reproduced wave AJ's row to the string in both tiers, the seventh consecutive wave. Measured at
`e5c9000`, on a head green in all six projects (viz by directory, viz-browser **66 / 397**, core
**3 012**, experiments **1 526**, cli **179**, server **650**, `tsc -b` clean).

| | base `67599fe` | wave AK | move | per case |
|---|---|---|---|---|
| always-on strings | 913 076 | **919 407** | **+6 331** | **129.20** |
| deep strings | 1 140 993 | **1 148 854** | **+7 861** | **131.02** |
| surfaces | 73 / 74 | **74 / 75** | **+1 / +1** | none |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | none |

**The surface sets were diffed**: one added in each tier, `shift/report.ts#smallPrintFor`, which
lane AK-B forecast by name, and nothing removed. The lanes published floors summing to about 106 a
case, below the move, and the move is not split between them (§ D256).

**The first deep reading on the integrated tree failed 22 of 60 cases**, all
`goal-without-rate` on `campaign/judge.ts#judgeStage`, the surface only the deep tier reaches.
R12's check exempted the goal kinds it never judges by finding the kind's id in the drawn
sentence; § D1154 and § D1159 named goals in words, so the id left the sentence and the exemption
stopped matching. No lane could see it: each ran the always-on tier. The goal seeds now carry
their kind and the check reads it (`honesty/goalRateExemption.test.ts`), and the figures above are
the re-measurement on the fixed head.

## Wave AJ

**Wave AJ's move is 534.08 strings a case always-on and 535.90 deep, with six surfaces in each
tier, every one forecast by name, and wave AI's owed deep reading is discharged.** Measured at
`1f7ae6f`; the tree was green in all six projects on that head and on the two test-only commits
after it (viz by directory, viz-browser **65 / 390**, core **3 012**, experiments **1 526**, cli
**179**, server **650**, `tsc -b` clean). The base, `main` at `58765c4`, reproduced wave AI's
always-on row exactly (886 906 / 67) and gave **wave AI's tree its first deep reading: 1 108 839 /
68 / 0 failing**, which is +18 291 (304.85 a case) and the same three surfaces over wave AH's deep
row. That run took 1 585 s on a quiet box; wave AI's was killed by the memory limit with ten agents
sharing the machine.

| | base `58765c4` | wave AJ | move | per case |
|---|---|---|---|---|
| always-on strings | 886 906 | **913 076** | **+26 170** | **534.08** |
| deep strings | 1 108 839 | **1 140 993** | **+32 154** | **535.90** |
| surfaces | 67 / 68 | **73 / 74** | **+6 / +6** | none |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | none |

**The surface sets were diffed rather than the counts compared**, in both tiers: six added in each
and nothing removed. `dev/leftRail.ts#todaysShiftOf`, `live/raceStrip.ts#raceVerdictSlotAt` and
`shift/goals.ts#readGoals` are lane AJ-H's declared pairs; `everyday/stagePlay.ts#stagePlayViewOf`
is AJ-K's campaign page; `shift/dayCalls.ts#dayCallRowOf` and `#dayCallRecordOf` are the two sides
of AJ-L's call-row pair. Each lane named its surfaces before the measurement. **The string move is
not split between lanes**: eleven lanes changed words, several on the same producers, and a
division would be the quotient § D256 refuses. **The deep tier's one-surface lead survives**:
`campaign/judge.ts#judgeStage` is still the only surface in deep and not in always-on.

**One declared pair caught a defect at integration rather than in a lane.** AJ-H's `todays-shift`
pair compares the Engineer rail's day line with the brief's; on the merged tree it failed on a
whole-day wrinkle, because the rail had not been given AJ-B's whole-day flag and printed the
withheld-mix sentence while the brief printed the episode. That is § D362's reason for pairs
arriving one wave later.

## Wave AI

**Wave AI's move is 304.02 strings a case in the always-on tier, with three surfaces, and the
deep tier was not measured this wave.** Measured at `412de16` on a head green in all six projects
(viz by directory, viz-browser **60 / 377**, core **2 991**, experiments **1 526**, cli **179**,
server **649**, `tsc -b` clean). The base at `4a81821` reproduced wave AH's row to the string in
**both** tiers, 872 009 / 64 and 1 090 548 / 65, the sixth consecutive wave.

**Why the deep row is stale, stated because a stale row read as current is this column's oldest
failure.** The deep run on the integrated head was killed after 43 minutes by the container's
memory limit (`oom-kill … CONSTRAINT_MEMCG`), with ten agents sharing a 16 GB box at load 56.
It was not re-run before the push; the weekly deep job and the next wave's integration measure it.
Until then the deep row describes `e1d10ac` and says nothing about this tree.

| | base `4a81821` | wave AI | move | per case |
|---|---|---|---|---|
| always-on strings | 872 009 | **886 906** | **+14 897** | **304.02** |
| always-on surfaces | 64 | **67** | **+3** | none |

**The surface sets were diffed and the three are the ones AI-D forecast by name**:
`shift/callRow.ts#pressCallRowOf`, `shift/ladder.ts#CONTRACT_LADDER` and
`shift/ladder.ts#admittedPressDayIds`. Nothing was removed. **The producer probe reproduces the
always-on corpus exactly on both trees** and attributes the move: the door's `todayOf` **+139.69**,
`fixit/engine.ts#classifyOutcome` **+94.00**, `shift/report.ts#dayReportOf` **+27.00**, the stage
header **+17.00**, the designer **+6.00**, and **+5.08** on each of tower choice and AI-D's three new
surfaces. The door and fix-it terms carry several lanes' changes each and are not split between
them (§ D256), so the lanes' string forecasts are left unscored.

## Wave AH

**Wave AH's move is the largest per case this column has recorded, and for the first time it
was attributed by tallying every always-on case by producer on both trees rather than by
probing one.** Measured on the integrated tree at `86e159b`, both tiers in one sitting, on a head
green in **all six** projects.

**The base reproduced to the string in both tiers**, at `dfe71ba`: 778 432 / 63 / 0 and
967 962 / 64 / 0, identical to wave AG's published row. Fifth consecutive wave it has held.

| | base `dfe71ba` | wave AH | move | per case |
|---|---|---|---|---|
| always-on strings | 778 432 | **872 009** | **+93 577** | **1 909.73** |
| deep strings | 967 962 | **1 090 548** | **+122 586** | **2 043.10** |
| surfaces | 63 / 64 | **64 / 65** | **+1 / +1** | none |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | none |

**The probe renders every always-on case through `honesty/surfaces.ts#renderAll` on both trees
and reproduces the corpus exactly** (778 432 and 872 009), so its split is the measurement
rather than an estimate:

| producer | per case | lane and forecast |
|---|---|---|
| `fixit/engine.ts#classifyOutcome` | **+1 784.16** | AH-E, a floor of 1 094 plus terms that grow with each building's cars, banks and floors |
| `everyday/towerChoice.ts#towerChoiceViewOf` | **+48.00** | AH-B forecast 48, and 0 from the first-session arm; both exact |
| `everyday/stageScreenModel.ts#stageHeaderOf` | **+22.00** | AH-A's 7, AH-C's 10 and AH-D's 5; the sum is exact |
| `everyday/tutorialModel.ts#tutorialWalkthroughViewOf` | **+17.00** | AH-D forecast 17; exact |
| the report's three producers, net | **+28.41** | AH-C's 8 and AH-A's 2, plus AH-C's missed-goal rows, which it declined to quantify |
| `everyday/briefView.ts#briefAsksOf` and `everyday/host.ts#createEverydayHost` | **+10.16** | AH-C's new pair, forecast as 6 or 12 by building |

**Three forecasts were exact and the rest were floors that held.** The report producers are not
split further: they carry one lane's constant and another lane's conditional rows together, and
dividing the 18.41 left over between them would be the quotient § D256 refuses. **The deep tier's
quotient differs because the fix-it term is building-dependent** and the deep tier draws more of
the larger towers; no deep probe was taken, so nothing finer is claimed for it.

**The surface sets were diffed rather than the counts compared**, in both tiers: exactly one
added in each, `everyday/briefView.ts#briefAsksOf`, which AH-C forecast by name, and nothing
removed. **The deep tier's one-surface lead survives**: `campaign/judge.ts#judgeStage` is still
the only surface in deep and not in always-on.

**Green in all six projects before the row was published**, counts rather than the word:
viz **332 / 7 390**, viz-browser **57 / 368** with `ELEVATOR_SIM_CHROMIUM` set, core
**143 / 2 991**, experiments **115 / 1 526**, cli **12 / 179**, server **29 / 649**, and
`tsc -b` clean.

## Wave AG

**Wave AG's move is exactly 104.00 strings a case and one surface in both tiers, four lanes
forecast it before the measurement, and the forecasts sum to it to the string.** Measured on the
integrated tree at `dacb8ef`, on a head green in **all six** projects and in CI.

**The base reproduced to the string in both tiers**, at `9db3528` — 773 336 / 62 / 0 and
961 722 / 63 / 0, identical to wave AF's published row. Fourth consecutive wave it has held.

| | base `9db3528` | wave AG | move | per case |
|---|---|---|---|---|
| always-on strings | 773 336 | **778 432** | **+5 096** | **104.00** |
| deep strings | 961 722 | **967 962** | **+6 240** | **104.00** |
| surfaces | 62 / 63 | **63 / 64** | **+1 / +1** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**AG-A forecast +104 and +1 surface, and named both.** Its decomposition had no conditional term:
the new `everyday/towerChoice.ts#towerChoiceViewOf` adapter renders two states, and each state is
four header strings plus three strings for each of `CONTRACTS`' sixteen rows, so 2 × (4 + 48) =
104. The one assumption a reader could check was that `singleRun` maps seeds one to one, and it
does. **AG-B, AG-C and AG-D each forecast 0**, each on a stated ground: a row present in both arms
of the day report is a substitution, a copy change inside `EVERYDAY_MODES` is a substitution, and
the corpus calls `goalsForDay` with the default `'period'` horizon so it never renders the new
whole-day bar's label. All three hold.

**Both fix lanes contributed zero, and one of them moved a player-facing sentence.** Integration
found nine failures in `viz` from four lanes each green alone, and two fix lanes closed them.
AG-FIX-2's re-measurement of the legibility sweep grew the first-session set from eleven towers to
fourteen, so `shift/firstSession.ts#FIRST_SESSION_LINE` now reads *fourteen towers*. That is one
string in and one string out, and the measurement agrees.

**The surface sets were diffed rather than the counts compared**, in both tiers: exactly one added
in each, `everyday/towerChoice.ts#towerChoiceViewOf`, and nothing removed. **The deep tier's
one-surface lead survives and the diff names it**: `campaign/judge.ts#judgeStage` is the only
surface in deep and not in always-on, and nothing is in always-on and not in deep.

**The two tiers were measured two days apart, on the same commit.** Work was paused after the
always-on reading on 2026-09-22 and the deep reading was taken on 2026-09-24, at `dacb8ef` both
times. The deep run took 1 402 s on an idle box; the base deep run took 3 452 s under load 50,
which is the box and not the corpus.

**Green in all six projects before the row was published**, counts rather than the word *passed*:
viz **328 / 7 290**, viz-browser **52 / 354**, core **143 / 2 989**, experiments **115 / 1 526**,
cli **12 / 179**, server **29 / 649**, and CI green on the same head. The browser tier is now 52
files rather than 51, because AG-A added a contract-picker journey that runs against the shipped
bundle.

## Wave AF

**Wave AF's move is exactly 128.00 strings a case in both tiers, it decomposes to the string
across five producers, and all four lanes' forecasts are right — including one that was right to
refuse to publish a figure at all.** Measured on the integrated tree, both tiers in one sitting,
on a head green in **all six** projects.

**The base reproduced to the string in both tiers**, at `495aabf` — 767 064 / 62 / 0 and
954 042 / 63 / 0, identical to wave AE's published row. Third consecutive wave it has held.

| | base `495aabf` | wave AF | move | per case |
|---|---|---|---|---|
| always-on strings | 767 064 | **773 336** | **+6 272** | **128.00** |
| deep strings | 954 042 | **961 722** | **+7 680** | **128.00** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**The probe attributes every one of the 128**, rendered on each tree and tallied by producer:
`everyday/settingsView.ts#settingsScreenViewOf` **+97**, `dev/reportPanel.ts#reportViewOf`
**+16**, `fixit/engine.ts#classifyOutcome` **+15**, `shift/report.ts#dayReportOf` **+6**, and
`everyday/modes.ts#EVERYDAY_MODES` **−6**. 97 + 16 + 15 + 6 − 6 = 128, and 128 × 49 = 6 272,
128 × 60 = 7 680.

**AF-C's forecast is exact term by term**, which this column has not seen before. It published
**+22** decomposed as +6 from `SHIFT_REPORT` and +8 and +8 from the report panel's two seeding
paths, *and* published a range — *"if the panel adapter's loop nesting is not what I read, the 22
is wrong and the true figure is between 6 and 22"*. Measured: `dayReportOf` +6 and `reportViewOf`
+16. Its reading was right and its own stated doubt was unfounded, which is a forecast carrying
its own error bar and then not needing it.

**AF-D's forecast is the one to read, because it refused to divide.** It counted what it could
exactly — one `CHIMES_PANEL_COPY` key, **−6** for three rail completions × two deleted arms,
**+15** for the fix-it rung block's four arms — and for the two whole Settings cases it added it
said: *"not derivable without measuring … I do not claim a per-case integer — dividing to get one
would be the quotient § D256 refuses"*, publishing a **floor of ≈ 90** instead. Measured, those
cases are **96**. The floor was right and conservative by six strings, and the lane that could
have guessed a figure and been nearly right chose not to. That is § D256 applied by a lane to its
own forecast.

**AF-A and AF-B both forecast 0 and neither appears in the producer diff.** AF-A's ground was
that `honesty/run.ts#buildingFor` never goes through `shiftRunConfigOf`, so no corpus case carries
a contract rung; AF-B's was that every string whose text changed sits inside a DOM mount the
corpus excludes. Both hold.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical,
nothing added, nothing removed — on a wave that made a day's verdict turn on a press, wired two
workshop levers into the run, kept the career in the career and closed the chimes loop. Every
string entered an adapter that already existed. **The deep tier's one-surface lead survives**:
`campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is in
always-on and not in deep.

**Green in all six projects before the row was published**, and the count is what was checked
rather than the word *passed*: viz **323 / 7 222**, viz-browser **51 / 351**, core **143 / 2 989**,
experiments **115 / 1 526**, cli **12 / 179**, server **29 / 649**. The browser tier needs
`ELEVATOR_SIM_CHROMIUM` set or every case skips silently and reports success — which is why the
file and case counts are quoted here and not a verdict word.

## Wave AE

**Wave AE's move is exactly 27.00 strings a case in both tiers, and four lanes each published a
figure before the measurement that sums to it precisely.** That has never happened here. § D454's
precedent is four forecasts that each verified against their own branch and still came up one
string a case short once integrated, with no honest way to say which lane owned the gap; § D487's
is three lanes forecasting and all three right. This is four, summing to the string, with no
remainder to argue about.

| | base `918bc64` | wave AE | move | per case |
|---|---|---|---|---|
| always-on strings | 765 741 | **767 064** | **+1 323** | **27.00** |
| deep strings | 952 422 | **954 042** | **+1 620** | **27.00** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

27 × 49 = 1 323 and 27 × 60 = 1 620, both exact, with **no conditional remainder in either
tier**. The forecasts: **AE-A +1** (`CAMPAIGN_ABSENCES` going 1 → 2, its first growth ever — the
register had only shrunk), **AE-B +13** (decomposed to the string across five terms), **AE-C 0**,
**AE-D +13** (one `STAGE_GOALS_COPY` key plus twelve from four seeded campaign states).

**AE-C's zero is the one to read, because it was right for the reason it gave.** That lane deleted
or rewrote **22 player-facing sentences** in `data/fixit-cases.json` and forecast no corpus
movement, because `honesty/surfaces.ts`'s fix-it adapters drive their own synthetic
`fixitSearchCase` and **not the shipped file**. So every sentence in the fix-it content a player
actually meets is rendered by nothing the search reads, and always has been — found by a null
result rather than by a violation, which is § D437's shape one mode across. It is GitHub issue
**#570**, and **#233 authors sixteen more cases to the same shape**, so the unswept area roughly
doubles before anything narrows it. Three false promises in shipped repair copy were measured in
that lane — two *the worst wait shortens* claims that measure 77 → 79 s and 79 → 82 s — and no
property could ever have seen them.

**The base reproduced to the string in both tiers**, at `918bc64`, which is the habit § D442 set.

**And this row was measured twice, on the head rather than on the base, which is the newer
habit.** The first reading was taken on `88c8a6e`; five commits then landed — a spectator-facing
fix and the front-door pair — and the structural argument said none could move it, because
`honesty/surfaces.ts:9991` states that `everyday/stageScreen.ts#STAGE_SCREEN` is not driven and
`:8161` excludes `shell.ts#mountEverydayShell` by name, both asserted in `derive.test.ts`. That
argument was correct **and it is the kind § D487's own row was wrong about**, so the measurement
was run again on the final head: **both tiers reproduced exactly**, 767 064 and 954 042, with the
surface sets, the building histograms and the fit-out draws unmoved.

**The surface sets were diffed rather than the counts compared**, in both tiers and against both
readings: identical, nothing added, nothing removed — on a wave that made a career day a
different day, gave the rush's dispatcher pick a route, retired a printed answer from eighteen fix
cases and made two goal sets legible. Every one entered an adapter that already existed. **The
deep tier's one-surface lead survives and the diff names it**: `campaign/judge.ts#judgeStage` is
the only surface in deep and not in always-on, and nothing is in always-on and not in deep.

**The tree was green in every project before the row was published, and the integrator got that
wrong once first.** The `viz` project **excludes** `*.browser.test.ts`; `viz-browser` is a
separate project at its own 120 000 ms ceiling, and it had not been run this wave. Called green on
the strength of five suites while a sixth existed, it was then found red in three files — which is
§ D487's trap arriving one wave after the row that records it. Final state, all six: viz 319 files
/ 7 147 cases, **viz-browser 51 / 349**, core 143 / 2 989, experiments 115 / 1 526, cli 12 / 179,
server 29 / 649.

## Wave AD

**Wave AD's move is exactly 4.00 strings a case in both tiers, every one of them on one surface,
and this is the first time this column has scored three forecasts and had all three come out
right with the attribution measured rather than divided.** Measured on the integrated tree after
wave AD, both tiers in one sitting, on a head CI had already reported green in every project —
which is § D487's rule obeyed in the order it was written rather than repaired afterwards.

**The base reproduced to the string in both tiers**, at `74c586d`: always-on 765 545 / 62
surfaces / 0 failing, deep 952 182 / 63 / 0, identical to wave AC-2's published row. That is the
habit § D442 set, and it is the only thing that tells a correction apart from a move.

| | base `74c586d` | wave AD | move | per case |
|---|---|---|---|---|
| always-on strings | 765 545 | **765 741** | **+196** | **4.00** |
| deep strings | 952 182 | **952 422** | **+240** | **4.00** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**4 × 49 = 196 and 4 × 60 = 240**, both exact, with no conditional remainder in either tier —
which is what a constant seeded once per case looks like and is a different shape from wave AC-2's
638-plus-a-remainder directly above.

**The move is attributed by a probe rather than by a quotient, and the probe says one surface.**
The first corpus case was rendered on each tree and its strings tallied by producer:
`everyday/settingsView.ts#settingsScreenViewOf` goes **708 → 712**, and *nothing else in the tree
moves at all* — the whole-case total goes 14 088 → 14 092. That is GitHub issue #557's career
purse reaching the Settings chime panel, which now knows whether a top-up has a tower to land in.
A division would have produced the same 4 and licensed no claim about which lane earned it, which
is what [§ D256](../DECISIONS.md) refuses.

**Three lanes forecast and all three were right**, the second time this column has managed that
(wave R was the first). AD-A predicted *non-zero, small, and no new surface* for the purse work,
and its own surface is the entire move. AD-D predicted **0 strings and 0 surfaces in both tiers**
for the Scenario copy on the ground that every change is a substitution on an existing seed, and
AD-F predicted **0** for two test files and a `DECISIONS.md` append. Neither appears anywhere in
the producer diff. The forecasts sum to the measurement, so there is no remainder to argue about
and none is invented.

**The surface sets were diffed rather than the counts compared**, in both tiers and against both
bases: identical, nothing added, nothing removed — on a wave that made three Parameters-tab
schemas reach the run, rebuilt the Scenario hub's budget offer, taught a stage row to open its
own stage, and gave the kernel a resume. Every one of them entered an adapter that already
existed. **The deep tier's one-surface lead survives and the diff names it**:
`campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is
in always-on and not in deep.

**Both tiers exited 0 with the verdict matching the figures** — always-on 96 110 ms, deep
1 324 421 ms, on a box whose load average was under 2 for the whole sitting. That is said because
a figure taken under contention measures the box, which this column has recorded twice.

## Wave AC-2

**Wave AC-2's move is 638 strings a case in both tiers, and the base had drifted in both — which
is the half worth reading.** The playability wave: ten build lanes and six decision agents, people
drawn on the stage, a before-and-after pair on the fix-case screen, a canvas and a control in the
tutorial, a shareable result, a chime line on the rail, the ten campaign stages reaching the
Scenario hub, and a located hold on the rush. Measured on the integrated tree, both tiers, with
the base at `cae5034` re-measured first in a detached worktree.

**The base did not reproduce, in either tier**, and the published row was correct when it was
taken:

| | published for wave AB | measured at `cae5034` | drift |
|---|---|---|---|
| always-on strings | 733 546 | **734 281** | **+735** |
| deep strings | 912 990 | **913 890** | **+900** |
| surfaces · cases · simulations · failing | 62 / 63 · 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** |

Waves landed after AB without this row being re-measured, so subtracting from the published
figures would have attributed 735 and 900 of somebody else's strings to this wave — the mistake
the waves P and Q row exists to record, arriving for the third time. It was caught the only way it
can be, and **independently corroborated inside the wave**: a lane measuring its own move in
isolated worktrees read the same base, 734 281, without being told what the integrator had
measured.

| | base `cae5034` | wave AC-2 | move | per case |
|---|---|---|---|---|
| always-on strings | 734 281 | **765 545** | **+31 264** | **638.04** |
| deep strings | 913 890 | **952 182** | **+38 292** | **638.20** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**Both quotients sit a hair above 638**, which is wave AB's shape a wave later: 49 × 638 = 31 262
against 31 264 measured, and 60 × 638 = 38 280 against 38 292 — a per-case constant of **exactly
638** plus a conditional remainder of **2 strings in one tier and 12 in the other**. The
conditional terms are named rather than guessed: the rush's located hold draws a landing list
whose length is the run's, and the tutorial's collapse screen draws five arms of which a case
reaches as many as its run earns.

**The surface sets were diffed rather than the counts compared**, in both tiers and against both
bases: **identical, nothing added, nothing removed** — on a wave that built seven new player
surfaces' worth of words. Every one entered an adapter that already existed, which is what several
lanes forecast before the measurement and what § D489's ruling looks like from here. **The deep
tier's one-surface lead survives and the diff names it**: `campaign/judge.ts#judgeStage` is the
only surface in deep and not in always-on, and nothing is in always-on and not in deep.

**Both tiers exited 0 with the verdict matching the figures**, on a quiet box — always-on 96 972 ms,
deep 1 373 041 ms. That is worth one line because two agents filed false failures earlier in this
wave measuring under load average 31–41 with 126 vitest processes competing, and
`vitest.config.ts`'s own docstring records a 0.60 s case failing at 5 454 ms at a third of that
load. A figure taken under contention measures the box.

**Then both tiers were measured a second time, on the head rather than on the base, and that is
the new habit rather than a repeated one.** The figures above were taken on `5c4de11`, and the
viz leg was **red** on that commit — two defects of the integrator's own, a superseded classifier
left exported with no caller and this file's sibling `vitest.config.ts` carrying an annotation
census stale by three. § D487 is the precedent and it is exact: a row taken on a tree green in
four projects and red in a fifth, where the lane that fixed the fifth then moved the row by one
string a case. So the same measurement was run again on `fb1cc8c`, the green head, and **both
tiers reproduced to the string** — always-on 765 545 / 62 surfaces / 0 failing, deep 952 182 / 63
/ 0, with the surface sets, the building histograms and the fit-out draws unmoved.

**The structural argument was available and was deliberately not relied on.** The deleted symbol
had zero references outside its own definition and `honesty/surfaces.ts` imports three things
from that module, none of them touched, so nothing the corpus renders *could* have changed. That
reasoning was correct, and it is the kind of reasoning § D487's own row was wrong about. Every
wave before this one re-measured the **base** to tell a correction from a move; this is the first
to re-measure the **head** after a late fix, and it costs 1 427 s to stop a row resting on an
argument.

## Wave AB

**Wave AB's move is 217 strings a case in both tiers, and the small change is the whole of the
interest: the remainder is 10 strings across 49 cases and 7 across 60.** Measured on the
integrated tree after wave AB, both tiers in one sitting, with the base at `e53f28b` re-measured
first in a detached worktree.

**The base reproduced to the string in both tiers** — always-on 722 903 / 62 surfaces / 0 failing,
deep 899 963 / 63 / 0, identical to wave AA's published row. That is the second consecutive wave
the base has held since wave Z broke the streak, and the habit is worth restating in the form that
survives: not that the base *will* reproduce, but that you find out, because only a re-measurement
tells a correction apart from a move.

| | base `e53f28b` | wave AB | move | per case |
|---|---|---|---|---|
| always-on strings | 722 903 | **733 546** | **+10 643** | **217.20** |
| deep strings | 899 963 | **912 990** | **+13 027** | **217.12** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**Neither quotient is an integer and both sit a hair above 217, which is a different shape from
every non-integer this column has recorded.** 49 × 217 = 10 633 against 10 643 measured, and
60 × 217 = 13 020 against 13 027 — so the move is a per-case constant of **exactly 217** plus a
conditional remainder of **10 strings in one tier and 7 in the other**, about a fifth of a string
a case. Previous non-integers here were state-dependent renderers emitting a genuinely variable
count; this one is a constant with a rounding error's worth of condition attached, and saying
which it is costs one division.

**The forecasts are scored and they do not sum, which is recorded rather than explained away.**
Three lanes published exact per-case figures — lane B **+8**, lane C **+80**, lane D **0**, summing
to **88** — and lane A published a **floor** of +18 (13 → 16 contracts × 5 seeds, plus three
`nextContract` strings) with an unquantified conditional above it. Floor total **106**; measured
**217**. **The 111-a-case remainder is not attributed to lane A**, tempting as the arithmetic is:
that inference holds only if the other three forecasts were exact, and [§ D454](../DECISIONS.md)
recorded four forecasts that each checked out against their own branch and still came up one
string a case short in the integrated tree. A quotient is not a measurement, which is what
[§ D256](../DECISIONS.md) refuses. What can be said exactly is that lane A was the only lane to
publish a floor rather than a figure, and it was right to.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical,
nothing added, nothing removed — on a wave that authored **three more reference towers** (One WTC,
Empire State, Willis), gave every floor a plate and every shaft a footprint that comes out of it,
built a rush sitting that posts from the viewer with a twelve-state post block, and rebalanced a
campaign stage. Every one of them went into an adapter that already existed; the three towers
enter by `honesty/surfaces.ts` iterating `CONTRACTS` rather than by anybody listing them, and none
of them appears in either tier's building histogram, which is unmoved. **The deep tier's
one-surface lead survives and the diff names it**: `campaign/judge.ts#judgeStage` is the only
surface in deep and not in always-on, and nothing is in always-on and not in deep.

**Both tiers exited 0 this time, which the previous pair did not.** The base deep run wrote
complete figures at 76 minutes while vitest called it failed at its 3 600 000 ms test timeout
under a load average of 30; the integrated run was given `--testTimeout=10800000` and finished in
**1 847 751 ms** on a quiet box with the verdict matching the figures. A measurement whose verdict
disagrees with its own output is a measurement somebody will later mistake for a failure.

## Wave AA

**Wave AA's move is 129 strings a case in both tiers, and the base reproduced exactly — which is
the streak restarting one wave after it broke.** Measured on the integrated tree after wave AA,
both tiers in one sitting, with the base at `fb15704` re-measured first in a detached worktree.

**The base reproduced to the string in both tiers**: always-on 716 568 / 62 surfaces / 0 failing,
deep 892 214 / 63 / 0, identical to wave Z's published row. Wave Z is the only wave in this
column's history where the base did *not* reproduce, and the row it published had to be stated
against a measured base rather than the published one. This wave needs no such caveat, and that is
worth one sentence rather than none: the habit is not that the base *will* reproduce, it is that
you find out — and finding out is the only thing that tells a correction apart from a move.

| | base `fb15704` | wave AA | move | per case |
|---|---|---|---|---|
| always-on strings | 716 568 | **722 903** | **+6 335** | **129.29** |
| deep strings | 892 214 | **899 963** | **+7 749** | **129.15** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**Neither quotient is an integer, and the two differ**, which is what a state-dependent renderer
looks like from here: the three new towers are drawn through adapters whose string count depends
on the run, and the deep tier draws a different mix of buildings and days. No arithmetic makes
them one, and claiming a per-case constant would be manufacturing precision this measurement does
not have.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical,
nothing added, nothing removed — on a wave that authored **three reference towers**, added a
rope-class equipment tunable with the first hard travel ceiling, rehearsed the revert procedure,
and built a 1 046-line accessibility walkthrough over 21 screens. Every one of those went into an
adapter that already existed; the towers enter by `honesty/surfaces.ts` iterating `CONTRACTS`
rather than by anybody listing them. **The deep tier's one-surface lead survives and the diff
names it**: `campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and
nothing is in always-on and not in deep.

**One lane forecast zero and was right, which is the only forecast this wave carries.** Lane D's
six accessibility fixes each reuse a constant or node the product already draws — `SCREEN_NAMES`
is already seeded — so it predicted **0** corpus movement from a commit that changed five player
surfaces. The rest of the move belongs to three lanes that forecast nothing, and it is not split
between them: a quotient is not a measurement, which is what [§ D256](../DECISIONS.md) refuses.

## Wave Z

**Wave Z's move is exactly 88.00 strings a case in both tiers — and the row it replaced was wrong
about its own verdict, which is a worse failure than the stale counts and is the reason to read
this entry.** Measured on the integrated tree after wave Z, both tiers in one sitting, with the
base at `155bf07` re-measured first in a detached worktree.

**The base did not reproduce, and one column of the published row was not merely stale but false:**

| | published for wave Y | measured at `155bf07` | drift |
|---|---|---|---|
| always-on strings | 680 037 | **712 256** | **+32 219** |
| deep strings | 845 966 | **886 934** | **+40 968** |
| surfaces | 62 / 63 | **62 / 63** | **0** |
| **deep failing cases** | **0** | **5** | **the row asserted a verdict it did not have** |

The string drift is the ordinary kind — waves landing without the row being re-measured, which
this column has now recorded twice running. **The failing-case column is not that.** The row said
*"green, and the register is empty"* of the deep tier, and at that commit the deep tier had five
failing cases: `honesty-9100014`, `-9100022`, `-9100028`, `-9100038` and `-9100050` (twice), every
one `whole-run-figure-early @ everyday/stageScreenModel.ts#stageHeaderOf`. **Those five are GitHub
issue #537**, the weekly job's red, on exactly the case ids CI reported. A stale count sends a
reader to the wrong number; a stale *verdict* tells them a search found nothing when it found
something, which is the one thing this column exists not to do.

**So #537 is closed by a run rather than by an argument**: the same measurement on the integrated
tree reads `failures 0` over all sixty deep cases, and the register is empty beside it.

| | base `155bf07` | wave Z | move | per case |
|---|---|---|---|---|
| always-on strings | 712 256 | **716 568** | **+4 312** | **88.00** |
| deep strings | 886 934 | **892 214** | **+5 280** | **88.00** |
| surfaces | 62 / 63 | **62 / 63** | **0** | — |
| cases · simulations | 49 / 60 · 606 / 4 710 | **unmoved** | **0** | — |
| deep failing cases | **5** | **0** | **−5** | — |

**88.00 in both tiers to the hundredth**: 4 312 ÷ 49 and 5 280 ÷ 60 are both exactly 88.

**The surface sets were diffed rather than the counts compared**, in both tiers and against both
bases: identical, nothing added, nothing removed, on a wave that authored two buildings, built a
hybrid fuzz family, moved a pricing seam and changed five Everyday screens. Every one of them went
into an adapter that already existed — the two new towers enter by `honesty/surfaces.ts` iterating
`CONTRACTS` rather than by anybody listing them, which is what a derived seed buys. **The deep
tier's one-surface lead survives and the diff names it**: `campaign/judge.ts#judgeStage` is the
only surface in deep and not in always-on, and nothing is in always-on and not in deep.

**The move is deliberately not decomposed, and one lane's forecast is the reason it cannot be.**
Lane C published **+2 a case in both tiers** before the measurement — the `replay` and `watch` arms
of the `ENGINEER_DOOR` adapter — and that is the only forecast this wave carries. The other 86 a
case belong to four lanes that forecast nothing. Splitting it between them would be a quotient
dressed as a measurement, which is what [§ D256](../DECISIONS.md) refuses; the surface attribution is
exact because a set difference is a measurement and a division is not.

## Wave Y

**Wave Y's move is exactly 752 strings a case in both tiers — and the row it replaced was already
wrong before this wave started, which is the more useful half.** Measured on the integrated tree
after wave Y, both tiers in one sitting, with the base at `f2e1970` re-measured first.

**The base did not reproduce.** Fifteen consecutive waves had confirmed it; this is the sixteenth
and it is the one that broke the streak:

| | published for wave X | measured at `f2e1970` | drift |
|---|---|---|---|
| always-on strings | 624 294 | **643 189** | **+18 895** |
| always-on surfaces | 57 | **58** | **+1** |
| deep strings | 777 728 | **800 846** | **+23 118** |
| deep surfaces | 58 | **59** | **+1** |

So this wave's own move has to be stated against the **measured** base rather than the published
one, and both are given, because subtracting the published figures would attribute somebody else's
wave to this one — which is the mistake waves P and Q's row exists to record.

| | base `f2e1970` | wave Y | move | per case |
|---|---|---|---|---|
| always-on strings | 643 189 | **680 037** | **+36 848** | **752.0** |
| deep strings | 800 846 | **845 966** | **+45 120** | **752.0** |
| surfaces | 58 / 59 | **62 / 63** | **+4 / +4** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**752.0 in both tiers to the tenth**, which is what four whole screens seeded once per case looks
like: 36 848 ÷ 49 and 45 120 ÷ 60 are both exactly 752.

**The surface sets were diffed rather than the counts compared**, in both tiers, and the +4 is
named with nothing removed: `everyday/landingView.ts#landingViewOf`,
`everyday/support.ts#supportViewOf`, `scenario/survivors.ts#survivorSentenceFor` and
`telemetry/consentView.ts#consentAskViewOf` — GitHub issues #244, #245, #367 and #340, the four
screens this wave built. **The deep tier's one-surface lead survives**, and the diff names it:
`campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is in
always-on and not in deep. A wave that added four surfaces to both sides did not disturb the gap,
which is how a real move would have been told apart from this one.

**The move is deliberately not decomposed, and the arithmetic says why.** Four lanes published a
per-case forecast — the landing page at +131, telemetry's consent at +30, #404's skip label at +1
and #370's stamp at +1 — summing to **163**. Measured, 752. The two lanes that seeded the other
two surfaces, `support` and `survivors`, published no string forecast at all, and the remainder is
theirs. Attributing 589 a case between two lanes that did not forecast would be manufacturing a
decomposition, which is what § D256 refuses; the surface attribution is exact because a set
difference is a measurement and a quotient is not.

**What the streak breaking is worth, stated rather than filed.** Wave X's row was correct when it
was taken. What happened between then and `f2e1970` is that waves landed without the row being
re-measured — so the published figures aged into a claim nobody had checked, and only re-measuring
the base told a *correction* apart from a *move*. That is this row's oldest lesson arriving from
the other direction: the habit § D442 set is not that the base *will* reproduce, it is that you
find out.

## Wave X

**Wave X's move is exactly nineteen strings a case in both tiers, all of it on one adapter, and it
is the third time this column has landed on nineteen.** Measured on the integrated tree after
wave X, both tiers in one sitting, with the base at `5358c05` re-measured first in a detached
worktree — where it reproduced wave W's published row **exactly in both tiers**, the
**fourteenth** consecutive wave that has held.

| | base `5358c05` | wave X | move | per case |
|---|---|---|---|---|
| always-on strings | 623 363 | **624 294** | **+931** | **19.0** |
| deep strings | 776 588 | **777 728** | **+1 140** | **19.0** |
| surfaces | 57 / 58 | **57 / 58** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**The first corpus case moves by exactly 19, rendered on each tree and diffed by producer, and
every one of the nineteen is `gauntlet/ladder.ts#ladderRowsOf`**, the board adapter: two are
`BOARD_SCREEN_COPY`'s new keys (the house tag and the house note, iterated generically), and
seventeen are the daily board's new `house` state — two house rows and two player rows, each with
a driver, a wait and a name, one gap, two world lines and two lines under the table. 2 + 17 = 19,
49 × 19 = 931 and 60 × 19 = 1 140. **A wave that changed a core outcome model, a schema and a
campaign answer moved this column by a board state and two copy keys**: the technician's new
*when* is a substitution on an option the dock adapter already seeded, the beat label's `(house)`
form is drawn on no seeded state, and nothing in `core` renders a player-facing string. The
stranded count is published in the audit and the stage activity and drawn by no screen yet, which
is why the sweep cannot see it and why the ledger says so.

**The coincidence is worth naming for the third time.** Wave O moved +931 / +1 140 and wave R
+980 / +1 200 at nineteen and twenty a case; this is +931 / +1 140 again, on different surfaces for
different reasons — fourteen board states plus five keys then, seventeen board strings plus two
keys now. Three waves landing on the same integer is arithmetic, and the sentence exists so the
next reader does not read it as a copied row.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical,
nothing added, nothing removed. The house is a state on the existing board surface, § D489's
ruling showing up in the measurement once more. The deep tier's one-surface lead survives and
the diff names it: `campaign/judge.ts#judgeStage` is the only surface in deep and not in
always-on, and nothing is in always-on and not in deep.

## Wave W

**Wave W's move is 288 strings a case to within a fraction in both tiers, and one surface, and the
fraction is the door.** Measured on the integrated tree after wave W, both tiers in one sitting,
with the base at `4111655` re-measured first in a detached worktree — where it reproduced wave V's
published row **exactly in both tiers**, the **thirteenth** consecutive wave that has held.

| | base `4111655` | wave W | move | per case |
|---|---|---|---|---|
| always-on strings | 609 249 | **623 363** | **+14 114** | **288.04** |
| deep strings | 759 296 | **776 588** | **+17 292** | **288.20** |
| surfaces | 56 / 57 | **57 / 58** | **+1 / +1** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**The first corpus case moves by exactly 288, rendered on each tree and diffed by producer**, and
it sums to the string across eight adapters:

- `everyday/today.ts#todayOf` — **+132**: the door adapter now renders a third door per arm, at
  yesterday's chip, because § D517 made that chip pressable and its note had to be swept — a whole
  door's chips, steps, world band and primary twice over — plus § D514's first-session line.
- `everyday/rush.ts#rushResultViewOf` — **+62**: the new adapter, GitHub issue #220's result sheet
  in both outcomes and the held stage header at three playheads. This is the surface the column
  gained.
- `everyday/campaignModel.ts#towersView` — **+38**: two more offer cards on the campaign screen,
  § D519's Secure Tower and Mixed-Use High-Rise, across the seeded states.
- `everyday/modes.ts#EVERYDAY_MODES` — **+30**: the `replay` run context's rail sublines, bar
  rows and leave strip, swept over `RUN_CONTEXTS` as every context is.
- `menu/menu.ts#freePlayIssues` — **+23**: § D516's one sentence on the four menu screens inside a
  mode, over the arms the menu adapter drives.
- `everyday/designerModel.ts#designerFigures` — **+6**: § D518's escalator and document copy.
- `shift/report.ts#dayReportOf` — **+4**.
- `everyday/buildNotes.ts#buildNotesViewOf` — **−7**: seven register rows out — the rush's three
  and the shell's rush row (#220), the shell's replay row (#177 item 1), and the designer's
  escalator and document rows (#177 item 5).

132 + 62 + 38 + 30 + 23 + 6 + 4 − 7 = 288. The tier quotients sit a fraction above 288 because
the door's third render is conditional on the case's week having a day to hand back, and the
deep tier draws a different mix of days.

**The surface sets were diffed rather than the counts compared**, in both tiers: exactly one added
in each, `everyday/rush.ts#rushResultViewOf`, nothing removed. The deep tier's one-surface lead
survives and the diff names it: `campaign/judge.ts#judgeStage` is the only surface in deep and not
in always-on, and nothing is in always-on and not in deep.

## Wave V

**Wave V's move is 299 strings a case in the always-on tier and 298 or 299 in the deep one, and
the one conditional string was found by rendering every deep case rather than by reasoning about
it.** Measured on the integrated tree after wave V, both tiers in one sitting, with the base at
`f60e816` re-measured first in a detached worktree — where it reproduced wave U's published row
**exactly in both tiers**, the **twelfth** consecutive wave that has held.

| | base `f60e816` | wave V | move | per case |
|---|---|---|---|---|
| always-on strings | 594 598 | **609 249** | **+14 651** | **299.0** |
| deep strings | 741 367 | **759 296** | **+17 929** | **298.82** |
| surfaces | 56 / 57 | **56 / 57** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**The always-on tier is exactly 299 a case, and the first corpus case decomposes it to the string**,
rendered on each tree and diffed by producer:

- `everyday/stageScreenModel.ts#stageHeaderOf` — **+185**: GitHub issue #171's dock over the nine
  states the stage adapter seeds — quiet, none, a breakdown open, late, answered, broke and with no
  run, a coach party alone and held — with the figure grid, each option's cost, effect, timing and
  refusal, and `CAMPAIGN_DOCK_COPY`'s sixteen keys.
- `everyday/campaignModel.ts#towersView` — **+95**: #169 item 3's offers, five cards of five
  strings plus a heading and a note on three of the four seeded states and four cards of four on
  `second-month`, less the one refusal line each state used to carry.
- `everyday/today.ts#todayOf` — **+8**: #211's fold handle, two on each of the four report states.
- `gauntlet/ladder.ts#ladderRowsOf` — **+8**: #93's driver and gap on the daily rows and on the
  ladder, and #252's reset policy.
- `shift/report.ts#dayReportOf` — **+5**: the two new events' names and notes, and the coach
  party's withheld line.
- `everyday/buildNotes.ts#buildNotesViewOf` — **−2**: three register entries out (#171, #352), one
  empty-register line in.

185 + 95 + 8 + 8 + 5 − 2 = 299, and 49 × 299 = 14 651.

**The deep tier is eleven strings short of 60 × 299, and the eleven were located by measurement.**
Every deep case was rendered on both trees and diffed: 49 cases move by 299 and **11 by 298** — six
on `midtown-office`, four on `mixed-use-high-rise`, one on `vertical-city` — and on each of the
eleven the dock reads 184 rather than 185. One of them rendered beside a 299 case names the string:
`stage.dock(breakdown).option.technician.refusal`, *the day ends before the car would be back*,
which the seeded breakdown state draws only where fewer than twenty minutes remain on the clock.
The eleven are the cases where more do, so the technician is offered without a refusal. The probe
counts in a different unit from the corpus (739 687 → 757 616 across the sixty), and its move is
17 929 to the string. No lane forecast this move, because there were no lanes.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical, nothing
added, nothing removed, on a wave that put a dock beside the campaign stage, offers on the campaign
screen, a fold on every figure card and two rows on the daily board. Every one of them went into an
adapter that already existed. The deep tier's one-surface lead survives and the diff names it:
`campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is in
always-on and not in deep.

## Wave U

**Wave U's move is not a per-case constant, and the probe that decomposed wave T's says why before
anybody has to guess.** Measured on the integrated tree after wave U, both tiers in one sitting,
with the base at `51cd1ff` re-measured first in a detached worktree — where it reproduced wave T's
published row **exactly in both tiers**, the **eleventh** consecutive wave that has held.

| | base `51cd1ff` | wave U | move | per case |
|---|---|---|---|---|
| always-on strings | 589 825 | **594 598** | **+4 773** | **97.41** |
| deep strings | 735 583 | **741 367** | **+5 784** | **96.40** |
| surfaces | 56 / 57 | **56 / 57** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**Two of the five terms are conditional, which is why the two quotients differ and neither is an
integer.** Rendered on the first corpus case on each tree and diffed by producer, the move there
is **+99**, and it sums to the string:

- `watch/view.ts#watchingViewOf` — **+50**: GitHub issue #337's two posted rows and two refusals,
  with the board's figures, their counts and the source line on each.
- `everyday/today.ts#todayOf` — **+24**: #213's lever routes, a go-label and a caveat per card,
  which is the first conditional term — the report draws as many lever cards as the day earned.
- `gauntlet/ladder.ts#ladderRowsOf` — **+24**: #327's world lines under the daily rows, the
  board adapter's `ladder` state and the withheld arm beside it.
- `everyday/stageScreenModel.ts#stageHeaderOf` — **+3**: #324's three camera chips, the second
  conditional term, present only on the two towers where a band differs from the whole and
  absent from the document everywhere else, which is what § D505 said the honest control looks
  like.
- `everyday/buildNotes.ts#buildNotesViewOf` — **−2**: the tuner-door absence (#177 item 2) and
  the camera absence (#324) leaving the register, each on the commit that made it false.

50 + 24 + 24 + 3 − 2 = 99. A first case at 99 against a tier average of 97.41 is the two
conditional terms varying across the corpus, and the gap between the tiers' quotients is the
deep tier drawing a different mix of towers and days. No lane forecast this move, because there
were no lanes; the decomposition is a probe rather than a prediction, wave T's method kept.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical,
nothing added, nothing removed, on a wave that put a watch route on the daily board, a camera
on the stage, a works elevation on the campaign screen and a world ladder under the rows. Every
one of them went into an adapter that already existed. The deep tier's one-surface lead survives
and the diff names it: `campaign/judge.ts#judgeStage` is the only surface in deep and not in
always-on, and nothing is in always-on and not in deep.

## Wave T

**Wave T's move is 114 strings a case in both tiers, it was decomposed by a probe rather than by
a forecast, and the probe found three strings the guards had passed.** Measured on the integrated
tree after wave T, both tiers in one sitting, with the base at `36255b4` re-measured first in a
detached worktree — where it reproduced its published row **exactly in both tiers**, the **tenth**
consecutive wave that has held.

| | base `36255b4` | wave T | move | per case |
|---|---|---|---|---|
| always-on strings | 584 239 | **589 825** | **+5 586** | **114.0** |
| deep strings | 728 743 | **735 583** | **+6 840** | **114.0** |
| surfaces | 56 / 57 | **56 / 57** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**No lane forecast this move, because there were no lanes**: one worker built thirteen issues
serially, so the decomposition was taken after the fact by rendering one corpus case on each tree
and diffing the seeded fields by adapter. It sums to the string:

- `everyday/settingsView.ts#settingsScreenViewOf` — **+95**: GitHub issue #229's default-speed
  row (three strings) and clear row (three, two while booting) across the six existing account
  arms, plus two new arms, `armed` and `cleared`, carrying the clear arc's other states.
- `everyday/stageScreenModel.ts#stageHeaderOf` — **+13**: #352's *spread the cars* row over the
  three existing states (two strings each), and #338's `unpostable` state (seven).
- `fixit/engine.ts#classifyOutcome` — **+3 then +6**: #351's two disclosure arms and #350's
  demand basis line, and then #348's three as-built words, seeded after the probe.
- `live/bands.ts#moodAt` — **+1**: the Engineer strip's spread button.
- `everyday/buildNotes.ts#buildNotesViewOf` — **−1**: #246's build line in, #229's two register
  entries out.

95 + 13 + 6 + 1 − 1 = 114.

**The probe's finding is the part worth keeping.** Its first pass read **111**, and the three
missing were `FIXIT_SCREEN_COPY`'s as-built keys: in the FIXIT adapter's `covers`, classified as
driven by `derive.test.ts`, and reached by nothing, because their only reader is a mount. The
adapter now seeds them by name and the tree was re-measured; the interim 111-a-case figures
(589 678 and 735 403) were correct for the tree they were taken on and are not the row. **Being
in `covers` is not being swept**, which is wave G's lesson one step along: that wave said seeding
is not checking, and this one says a claim of seeding is not seeding.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical, nothing
added, nothing removed, on a wave that put a playing canvas on the fix-it screen, two rows on
Settings, an intervention on the stage and a build line on the panel. Every one of them went into
an adapter that already existed. The deep tier's one-surface lead survives and the diff names it:
`campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is in
always-on and not in deep.

## Wave S

**Wave S's move is the first this row has recorded that is deliberately *not* a per-case constant,
and the lane forecast it exactly anyway.** Measured on the integrated tree after wave S, both tiers
in one sitting, with the base at `589660f` re-measured first in a detached worktree — where it
reproduced its published row **exactly in both tiers**, the **ninth** consecutive wave that has
held.

| | base `589660f` | wave S | move | per case |
|---|---|---|---|---|
| always-on strings | 583 006 | **584 239** | **+1 233** | **25.16** |
| deep strings | 727 213 | **728 743** | **+1 530** | **25.50** |
| surfaces | 56 / 57 | **56 / 57** | **0** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**Every wave since G has reported a per-case integer — 19, 20, 28, 76 — and this one cannot,
because one of its three terms is conditional.** The decomposition, published before the
measurement and matching it to the string:

- `everyday/settingsView.ts#settingsScreenViewOf` — **+16 a case** (+784 / +960). Twenty-two new
  seeds over the six account arms the six cases now carry, less the deleted `you.home` on each.
- `everyday/buildNotes.ts` — **−1 a case** (−49 / −60), the `Sign out` absence leaving.
- `honesty/agreement.ts`'s `display-name` pair — **6 or 12 a case** (+498 / +630): two sides ×
  three arms, **doubled where the case's building has an authored whole day**. That is the
  conditional term, and it is why no integer exists.

784 − 49 + 498 = 1 233 and 960 − 60 + 630 = 1 530.

**The conditional term is the part worth reading, because it identifies three buildings by
arithmetic and the histogram then confirms them.** Solving the pair's contribution in both tiers
gives **exactly 15 cases at 6** in each — 15 × 6 + 34 × 12 = 498 across 49 cases, and
15 × 6 + 45 × 12 = 630 across 60. The run's own `buildings` line says which: `garden-apartments=15`
in always-on, and `garden-apartments=9 + st-jude-hospital=3 + crown-hotel=3` in deep. **Three
buildings, which is the number this file says have no authored day, arrived at from two tiers of
arithmetic rather than read off a file** — and then agreeing with a histogram nothing in the
derivation consulted.

**The surface sets were diffed rather than the counts compared**, in both tiers: **identical,
nothing added, nothing removed**, on a wave that shipped a new player-facing account block across
six states. That is what building a *state* on an existing surface looks like from here, and it is
§ D489's ruling showing up in the measurement — an eighteenth screen would have moved this column.
The deep tier's one-surface lead survives and the diff names it: `campaign/judge.ts#judgeStage` is
the only surface in deep and not in always-on, and nothing is in always-on and not in deep.

## Wave R

**Wave R's move is twenty strings a case in both tiers, three lanes each forecast their own share,
and all three were exact** ([§ D487](../DECISIONS.md)). Measured on the integrated tree after wave R,
both tiers in one sitting, with the base at `3bad770` re-measured first in a detached worktree —
where it reproduced its published row **exactly in both tiers**, the **eighth** consecutive wave
that has held.

| | base `3bad770` | wave R | move | per case |
|---|---|---|---|---|
| always-on strings | 582 026 | **583 006** | **+980** | **20.0** |
| deep strings | 726 013 | **727 213** | **+1 200** | **20.0** |
| surfaces | 55 / 56 | **56 / 57** | **+1 / +1** | — |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** | — |

**The twenty decomposes into three lane forecasts published before the measurement, and every one
was exact.** Lane A forecast **7 a case** in both tiers for a new sign-in notice surface — a label
over three stages, a pointer and a dismiss over two settled states. Lane D forecast **12 a case**
for the race strip's six arms × (verdict + note), net of one string it deleted. The fix lane
forecast **1 a case**: a constant moving between two adapters that both already speak, plus a new
seventh arm whose verdict is `''` and is filtered. 7 + 12 + 1 = 20, and the tree reads 20.0 in both
tiers. § D454 recorded four forecasts short by one string a case and § D457 recorded one that
predicted motion where the answer was zero; this is the first wave in which **every** lane that
forecast was right.

**This row was published at nineteen first, and the correction is the more useful half.** § D487's
measurement was taken on a tree that was green in four projects and **red in the browser tier**,
which the integrator had not yet run. A fifth lane then landed to fix it, moved one string a case,
and the row had to be re-measured. Nothing about 582 957 was wrong — it was correct for the tree it
was taken on, which is this file's oldest lesson about this row arriving on the integrator instead
of a lane. What was wrong was the judgement that **integration was complete**. § D343 says the
measurement is taken once, after integration; it does not say who decides when integration has
happened, and the honest rule is now written down: **not until the full suite is green in every
project.**

**A coincidence worth naming so nobody reads it as a copied row.** Wave O's move was *also* +931
and +1 140, also 19.0 a case in both tiers ([§ D461](../DECISIONS.md)). Different lanes, different
surfaces, different causes — wave O's nineteen was fourteen board-screen states plus five copy
keys, and wave R's is seven notice strings plus twelve race-strip ones. Two waves landing on the
same integer is arithmetic, not a transcription error, and the sentence exists because the next
reader will otherwise assume it is one.

**The surface sets were diffed rather than the counts compared**, in both tiers. Exactly one added
in each — `everyday/signInLink.ts#signInNoticeViewOf`, lane A's — nothing removed, and lane D's
forecast that its work would add no surface was right: a race strip that already existed gained a
second recording rather than a screen. The deep tier's one-surface lead survives and the diff names
it: `campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is
in always-on and not in deep.

## Waves P and Q

**Waves P and Q moved this row by exactly 104 strings a case, in both tiers, and the 104 splits
into two waves rather than decomposing into parts of one.** Measured on the integrated tree after
wave Q, both tiers in one sitting, with **two** bases re-measured in a detached worktree rather
than one: wave O's published row at `eb5b3b6`, and wave P integrated at `771e65f`.

| | wave O `eb5b3b6` | wave P `771e65f` | wave Q | wave P's move | wave Q's move |
|---|---|---|---|---|---|
| always-on strings | 576 930 | **578 302** | **582 026** | +1 372 = **28.0**/case | +3 724 = **76.0**/case |
| deep strings | 719 773 | **721 453** | **726 013** | +1 680 = **28.0**/case | +4 560 = **76.0**/case |
| surfaces, both tiers | 55 / 56 | 55 / 56 | **55 / 56** | **0** | **0** |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | unmoved | **unmoved** | **0** | **0** |

**The second base is the whole reason this row can say anything.** Wave P closed without taking its
corpus measurement, and that debt was recorded and left standing. So the move from wave O's row to
today spans **two** waves, and the integrator's first reading of it was that wave Q's two lane
forecasts summed to 76 a case against 104 measured and were therefore short by 28. **They were not
short by anything.** Measuring `771e65f` rather than reasoning about it splits the 104 exactly: 28
a case is wave P's energy goal, and 76 a case is wave Q's.

**76 is what the two lanes forecast, to the string.** Lane Q-B published *roughly 68 a case* before
the measurement and lane Q-D published *+8 a case in both tiers*; 68 + 8 = 76, and the tree reads
76.0 in both tiers. This is the first time this column has scored a forecast exactly and had it come
out right. § D454 recorded four forecasts short by one string a case, and § D457 recorded one that
predicted motion where the answer was zero.

**The lesson is a correct figure with a misleading denominator**, which is a new shape for this
column. Nothing about 582 026 was wrong. What was wrong was the wave it would have been attributed
to, and the fix was a ninety-second run rather than a paragraph of caveat. Publishing the caveat
instead would have left the record saying two lanes forecast short by 28 when they were exact.

**The surface sets were diffed rather than the counts compared**, in both tiers and against both
bases: identical, nothing added, nothing removed, across two waves that added a screen's worth of
goal rows, an accessibility standard, three defect fixes and a membership allowlist. The deep tier's
one-surface lead survives and the diff names it — `campaign/judge.ts#judgeStage`, the only surface in
deep and not in always-on, with nothing in always-on and not in deep.

## Wave O

**Wave O's move is exactly nineteen strings a case, in both tiers, and the nineteen decompose
without remainder** ([§ D461](../DECISIONS.md)). Measured once on the integrated tree, both tiers in
one sitting, with the base at `d4636a5` re-measured first in a detached worktree — where it
reproduced its published row **exactly in both tiers**, the **seventh** consecutive wave that has
held.

| | base `d4636a5` | wave O | move |
|---|---|---|---|
| always-on strings | 575 999 | **576 930** | **+931** |
| deep strings | 718 633 | **719 773** | **+1 140** |
| surfaces, both tiers | 55 / 56 | **55 / 56** | **0** |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** |

**931 ÷ 49 = 19 and 1 140 ÷ 60 = 19**, and the decomposition was checked against the code rather
than inferred from the quotient. Fourteen are `everyday/boardScreen.ts#dailyBoardViewOf` driven
over the six states the board adapter seeds — GitHub issue #221's daily board — and five are
`BOARD_SCREEN_COPY`'s new keys, which `honesty/surfaces.ts` iterates generically. **The three
refusal corrections in the same wave contributed zero**, because each is a substitution: one string
in, one string out. Second time this row has been able to attribute a move to the string.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical, nothing
added, nothing removed. The daily tab's five states went into the **existing** board adapter rather
than a new one. The deep tier's one-surface lead survives and the diff names it —
`campaign/judge.ts#judgeStage`, the only surface in deep and not in always-on, with nothing in
always-on and not in deep.

## Waves L and M

**Waves L and M each moved this row by exactly zero, and the second zero is arithmetic rather than
luck** ([§ D457](../DECISIONS.md)). Measured once on the integrated tree at `aea42b5`, both tiers in
one sitting, with the base at `39c1f1c` re-measured first in a detached worktree — where it
reproduced its published row **exactly in both tiers**, the **sixth** consecutive wave that has
held.

| | base `39c1f1c` (wave L integrated) | wave M integrated | move |
|---|---|---|---|
| always-on strings | 575 999 | **575 999** | **0** |
| deep strings | 718 633 | **718 633** | **0** |
| always-on surfaces | 55 | **55** | **0** |
| deep surfaces | 56 | **56** | **0** |
| cases · simulations · failing cases | 49 / 60 · 606 / 4 710 · 0 | **unmoved** | **0** |

**Wave L's zero is measured rather than assumed, and it is why the row was not stale.** The base is
wave L integrated, and it reads exactly what wave K published — so five merged lanes touching
`honesty/surfaces.ts`, `menu/`, `shift/reportWindow.ts` and `campaign/judge.ts` added and removed
no string at all. That was worth measuring precisely because it looked stale: `CLAUDE.md` was last
touched by wave K, wave L edited the corpus's own surface file, and the integrator of this wave
wrote *"the row is stale by two waves"* into a check-in before measuring it. **It was not.** Sixth
instance of the same lesson and the first where the wrong inference was written down first.

**Wave M's zero is exact and the arithmetic is the whole of it.** GitHub issue #283 added two keys
to `everyday/designerModel.ts#DESIGNER_COPY`, which `honesty/surfaces.ts` iterates generically, and
deleted two entries from `DESIGNER_ABSENCES`, which the build-notes adapter seeds. **+2 − 2 = 0 per
case**, so 49 × 0 and 60 × 0. A wave that moved words on a player screen and moved the corpus by
nothing is what a substitution looks like from here, and it is distinguishable from *nobody
measured* only because the base was measured too.

**The forecast this wave published was wrong, and in the more embarrassing direction.** Wave M's
ledger entry predicted *"strings moving by a small per-case constant in both tiers"*. The constant
is zero. Wave K's entry recorded four forecasts short by one string per case; this one predicted a
move where there is none, which is worse, because a forecast that expects motion will read a
correct zero as a failed measurement. Recorded rather than quietly dropped.

**The surface sets were diffed rather than the counts compared**, in both tiers: identical, nothing
added, nothing removed. The deep tier's one-surface lead survives and the diff names it —
`campaign/judge.ts#judgeStage` is the only surface in deep and not in always-on, and nothing is in
always-on and not in deep.

## Wave K

**Wave K's move is the first this row has been able to check against a forecast that was wrong, and
the size of the error is the finding** ([§ D454](../DECISIONS.md)). Measured once on the integrated
tree, both tiers in one sitting, with the base at `e8aac0d` re-measured first in a detached
worktree — where it reproduced its published row **exactly in both tiers**, the fifth consecutive
wave that has held.

| | base `e8aac0d` | wave K | move |
|---|---|---|---|
| always-on strings | 572 667 | **575 999** | **+3 332** |
| deep strings | 714 553 | **718 633** | **+4 080** |
| always-on surfaces | 54 | **55** | **+1** |
| deep surfaces | 55 | **56** | **+1** |

Four lanes each published a decomposed per-case forecast **before** the measurement. Summed, they
predict **+3 381** and **+4 140**. Measured: **+3 332** and **+4 080** — short by **49** and **60**,
which is *exactly one string per case in both tiers*. That scaling rules out noise and rules out a
single miscounted constant, and each lane's decomposition was checked and sums to its own claim.
So the forecasts are **not additive**: one string some lane counted as new is not new in the
integrated tree, or one lane's change removes a string another adds. **Which lane is unattributed
and no mechanism is offered** — establishing it means measuring each branch, which § D343 forbids
publishing, and naming a plausible candidate instead is what § D256 refuses. If the same
one-per-case gap reappears in the next wave that forecasts, that localises it far more cheaply.

**The surface sets were diffed rather than the counts compared.** Exactly one added per tier —
`batch/library.ts#batchLibraryOf`, lane A's — nothing removed, and the deep tier's one-surface lead
is still exactly `campaign/judge.ts#judgeStage`.

## Wave J

**Wave J moved the strings and one surface, and a lane predicted the move before it was taken**
([§ D442](../DECISIONS.md)). Measured once on the integrated tree, both tiers in one sitting, after
five lanes had merged — and the base at `df36e7c` was re-measured first in a detached worktree,
where it **reproduced its published row exactly in both tiers** (49 / 571 205 / 606 / 53 / 0 and
60 / 712 547 / 4 710 / 54 / 0). That is the fourth consecutive wave the base has been confirmed
rather than trusted.

| | base `df36e7c` | wave J | move |
|---|---|---|---|
| always-on strings | 571 205 | **572 667** | **+1 462** |
| deep strings | 712 547 | **714 553** | **+2 006** |
| always-on surfaces | 53 | **54** | **+1** |
| deep surfaces | 54 | **55** | **+1** |
| always-on suppressed runs | 9 | **12** | **+3** |
| deep suppressed runs | 20 | **21** | **+1** |

**The surface sets were diffed rather than the counts compared.** Exactly one was added in each
tier — `everyday/watchStage.ts#everydayWatchingCopyOf`, lane C's — and nothing was removed. The
deep tier's one-surface lead survived and the diff names it: `campaign/judge.ts#judgeStage` is the
only surface in deep and not in always-on, and nothing is in always-on and not in deep.

**The string move is not decomposable per lane, and that is structural rather than unmeasured.**
Lane D's fit-out axis changes the legs of every fitted case, so state-dependent renderers on
*other* lanes' surfaces emit different counts against different runs; the contributions are not
additive even in principle. Lane D measured +90 on its own branch, where lane C's surface did not
exist to be perturbed, and that figure cannot be subtracted out. Neither move divides evenly by
its case count. Wave G's exact attribution was possible because a chip face is seeded once per
case; claiming the same precision here would be manufacturing it. **What is attributable is
attributed exactly**: the surface, by set difference, to lane C.

**The substantive finding is the suppression move.** Three always-on cases publish a quotable mean
**as built** and have it refused once the tower is fitted. A purchase changes whether R3 has
anything to say about the run — which a corpus of as-built towers could not see, and which is the
coverage hole wave I found by a null result. **No mechanism is offered for why**; it is unmeasured,
and a plausible sentence in place of a measurement is what [§ D256](../DECISIONS.md) refuses.

## Wave I

**Wave I moved every one of these figures by zero, and the reason is a gap rather than a
non-event.** Measured once on the integrated tree, both tiers in one sitting, after five lanes had
merged: **49 / 571 205 / 606 / 53 / 0** and **60 / 712 547 / 4 710 / 54 / 0** — identical to the
base at `255aff2`, which was re-measured first and reproduced this row exactly for the second wave
running. The surface **sets** were diffed rather than the counts compared: nothing added, nothing
removed, and the deep tier's lead is still exactly `campaign/judge.ts#judgeStage`.

Four of the five lanes could not have moved it — workflows, documents, a classifier's own test and
a browser-tier harness render no player-facing string. **The fifth was expected to and did not**,
and its lane said so in advance: § D427 makes a purchase reach the run, so *"any corpus case that
ever carries a non-`AS_BUILT` fit-out would move"*. None did. **The corpus held no case in which
anything had been bought**, so the ten honesty properties had never read a fitted run's strings —
every campaign case they saw was a tower as built. That was a hole in the corpus's coverage of § 8,
found by a null result rather than by a violation, and it is the kind of thing this column exists to
make visible.

**That gap is closed** ([§ D437](../DECISIONS.md)): `HonestyCase.fitOutId` is a fit-out axis drawn
last, so every pinned seed keeps the configuration it had and a share of them now run a tower that
has bought something. Which kit is a survey rather than a preference — all sixteen shipped tiers
swept over all 49 always-on cases and compared **on the legs**, because § D427's table is measured
at the campaign's `garden-apartments`/3 600 s and this corpus runs 600–900 s. That lane did not
re-measure this row — § D343 puts that on the integrator — but it **published a forecast of what
the measurement would find, and the integrated tree matched it**: cases and simulations unmoved,
failing cases 0, strings moving by no per-case constant, `suppressed runs` 9 → 12 on the always-on
tier, and a `fit-outs` line reading `as-built=30 machines-2=8 machines-2+control-3=11` — the
suppression count and the fit-out draw both to the case. Read one clause precisely: *"the strings
move and nothing else does"* is true **of that lane's change**, and the surface this row gained is
lane C's watching copy, named by set difference rather than inferred from the count. A prediction
that survives an independent measurement is the only thing a lane can honestly say about the corpus
under § D343, and it is worth more than a figure taken on a branch.

## Wave H

**Wave H is the first time this row's *previous* figures were confirmed rather than trusted, and
that is the finding rather than the move.** Before publishing the new pair, the base commit
`6260dcb` was re-measured in a detached worktree and reproduced the row it had published
**exactly** — 49 cases, 570 560 strings, 606 simulations, 51 surfaces, 0 failures. Five times this
column has been wrong; this is the first time it has been checked in the one direction that can
tell a correction from a move.

| | wave G | wave H | move |
|---|---|---|---|
| always-on strings | 570 560 | **571 205** | **+645** |
| deep strings | 711 737 | **712 547** | **+810** |
| always-on surfaces | 51 | **53** | **+2** |
| deep surfaces | 52 | **54** | **+2** |

**The surface sets were diffed rather than the counts compared**, and the +2 is named in both
tiers with nothing removed: `everyday/rail.ts#railFooter` and `everyday/weekView.ts#weekScreenViewOf`
— GitHub issue #214's declared pair, § D362's shape, where a pair must carry the shipped
expression's id or a violation could not say *which* surface disagreed. Cases and simulations are
unmoved in both tiers, which is what declaring a pair rather than building a screen looks like.

**Unlike wave G's, this move is *not* attributable to the string.** 645 over 49 cases and 810 over
60 are not integers, and no arithmetic makes them one: the rail footer and the week header emit a
state-dependent number of strings, so there is no per-case constant to multiply. Saying so is the
point — wave G's exact attribution was possible because a chip face is seeded once per case, and
claiming the same precision here would be manufacturing it.

**The deep tier's one-surface lead survived, and it was verified by set difference rather than by
subtracting counts**: the only surface in deep and not in always-on is
`campaign/judge.ts#judgeStage`, and nothing is in always-on and not in deep. A wave that added two
surfaces to both tiers did not disturb the gap, which is how a real move would have been told
apart from this one.

## Wave G

  **Wave G's move is the first this row has been able to attribute exactly, and the arithmetic is the
whole of it.** Measured on the integrated tree after wave G, both tiers in one sitting: strings
**+343** always-on and **+420** deep, with cases, simulations, surfaces and failing cases unmoved.

| | wave F | wave G | move |
|---|---|---|---|
| always-on strings | 570 217 | **570 560** | **+343** |
| deep strings | 711 317 | **711 737** | **+420** |

`honesty/surfaces.ts`'s `EVERYDAY_STAGE` gained the stage's **seven** speed chip faces, seeded once
per case. **7 × 49 = 343 and 7 × 60 = 420** — the move is the seeding and nothing else, to the
string. No other lane in the wave added one: the tab-gate note built for GitHub issue #130 is
drawn by `dev/surfaces.ts#surfaceStateFor`, which joins the navigation-plumbing exclusion rather
than the corpus.

**The surface sets were diffed rather than the counts compared** — identical in both tiers, and the
deep tier's one-surface lead is still exactly `campaign/judge.ts#judgeStage`. So a wave that seeded
three hundred new strings added no surface, which is what the two columns are for.

**Seeded and deliberately not `covers`.** A chip face is `1×`, and the corpus's producer test wants
a *prose* literal — two adjacent alphabetic words — so a `covers` entry would have tripped its first
guard. Worth saying what the seeding does **not** buy: it would not have caught § D354's defect,
because no property compares a label against its multiplier and none can. **Being swept is not
being checked**, and that distinction was itself a correction to a briefing that had claimed the
ladder's sentence was outside the corpus when it had been inside it all along.

## Waves E and F, measured 2026-08-29

**Re-measured twice on 2026-08-29, and the pair is what makes either number mean anything.** First
on `f13d455` — merged `main`, wave E integrated, discharging the measurement wave E closed owing —
and again on the wave F integrated tree. Both tiers in one sitting each, never on a branch
([§ D343](../DECISIONS.md)).

| | published before | at `f13d455` (wave E) | wave F integrated |
|---|---|---|---|
| always-on strings | 569 663 | **570 217** (+554) | **570 217** (**+0**) |
| deep strings | 710 660 | **711 317** (+657) | **711 317** (**+0**) |

**Wave F moved the string count by zero, and that is a finding rather than a null.** Five lanes
changed player-facing words — a run-scoped sentence rescoped to its window, a bench heading given
its denominator, a remedy's promise withdrawn, a Workshop's disclosure rebuilt from two states to
four — and **not one of them added a string**. Every change was a reword or a substitution. The
bench is the clearest case: `honesty/surfaces.ts`'s seed loop went from
`text: BENCH_COPY.tooCloseHeading` to `text: mark.heading` over the same iteration, so one string
goes in and one comes out and the count *cannot* move.

**The surface sets were diffed rather than the counts compared** — base against integrated, both
tiers — and are **identical, 51 and 52, nothing added or removed**. That is the probe wave B had to
build by hand after finding this column wrong by one; it is kept now, in
`honesty/measure.corpus.test.ts`, which is also why these figures exist at all: `honesty.test.ts`
computes every one of them and prints them with `console.log`, **which vitest 4 intercepts**, so on
this toolchain they could not be read off a run at all. That, not indifference, is why the
measurement kept being skipped.

**The deep tier is still exactly one surface above always-on, and the diff names it**:
`campaign/judge.ts#judgeStage`, silent in one tier by construction and loud in the other. Five
lanes did not disturb that gap, which is what says the sets were compared rather than assumed.

**The surfaces column moved +2 in each tier and it is not two new screens.** They are the two sides
of [§ D362](../DECISIONS.md)'s declared pair, which must carry the shipped expression's id or a
violation could not name *which* surface disagreed. `honesty.test.ts` asserts that in both
directions, because this is R38's shape on the row corrected for R38 one wave earlier — and the
deep tier's one-surface lead over always-on survives it, which is how a real move would have been
told apart from this one.

**A tenth property landed** — `surfaces-disagree`, the only one that is not a predicate over a
single surface's strings. It exists because § D359's defect was invisible to the other nine: each
screen was internally honest while the product was incoherent. It costs 0.019 s cold over the whole
always-on tier and needs no simulation.

## Wave B, measured 2026-08-25, and the ninth property of 2026-08-24

**Re-measured 2026-08-25 on the integrated tree, both tiers, in one sitting** — after wave B's ten
lanes had merged and never once on a branch. Strings moved **+2 776** and **+3 954**; cases and
simulations are unmoved.

**The surfaces column moved by one in both tiers and wave B did not move it**, which is the thing
to read twice. The column said **48** and **49**; measured, it is **49** and **50** — and it is
**49 on `000852a`, the commit the previous row claims to describe.** The two surface *sets* were
probed at the base commit and at the wave's head and diffed: they are **identical**. So nothing in
these forty-five commits added a surface; the figure had been stale since M2-GATE and #207 moved
six registers into a Settings build-information panel, and nobody re-measured. Published as a
correction rather than as a move, because *"cases, simulations and surfaces unmoved"* beside a
changed number reads as *this wave added a surface*, and the next reader would go looking for one
that does not exist. It is `RISKS.md` R38 on the very row that exists to track that class, and it
is the **fifth** time this file has recorded the lesson.

**The deep tier is still exactly one surface above the always-on tier**, for the reason it has
always been — `campaign/judge.ts#judgeStage` is silent in one tier by construction and loud in the
other — and that gap surviving the correction is what says the correction is a correction: a real
move would have had to disturb it.

**Both registers are empty and both tiers are green.** `internal-notation`'s nineteen findings were
taken to zero by #207 before this wave opened, and wave B added none: the § D343 check was run on
the integrated tree and `honesty/properties.ts` is untouched, the scope constants
(`STANDARD_SPACE`, `DEEP_SPACE`, `maxDurationS`, `stageProbability`) are unmoved, and `OUTSTANDING`
is unmoved. **A lane asked to keep a gate at zero can do it by fixing strings or by moving the
gate, and only a diff tells you which** — the whole of `honesty/` in this wave is one 18-line
classification entry in `derive.test.ts` ([§ D359](../DECISIONS.md)).

**What the corpus still cannot ask** is whether two surfaces agree about one run. All nine
properties are predicates over a single case's rendered strings, so wave B's horizon defect — the
Everyday rail grading a run against 460 s while the Engineer rail graded the same run against 230 s
— was invisible to it, and a horizon axis would not have helped: each surface was internally honest
either way. GitHub issue #269, and § D334's `suppressed-mean` finding was the same shape.

**The verdict column has gone back to meaning what it was written to mean, and the row below
predicted it.** A ninth property landed on 2026-08-24 — `internal-notation`, the mechanical
instrument for `CHARTER_PROGRAMME.md` § M2's third exit criterion — and it **found nineteen
violations on player surfaces**: seventeen in both tiers, two only the deep tier reaches. They are
**recorded rather than fixed**, in `honesty.test.ts`'s `OUTSTANDING` with ghost checks holding
them, on § D307's precedent. So both tiers still pass and **neither register is empty**, which is
the distinction the column was kept for. The criterion is met when that block is empty and at no
earlier moment; the fix is GitHub issue #207.

**The strings and surfaces columns are unmoved by that commit and are nonetheless stale** — the
property is a predicate over the existing corpus and renders nothing, but this wave's landed copy
has moved both tiers. Measured on the branch: 566 506 and 706 214. Those figures are **not
published here**, because M2 is still open and § D343 requires the measurement once after the wave
integrates. This row is re-measured then.

## The Everyday-and-Engineer wave, measured 2026-08-13

**Re-measured 2026-08-13 on the integrated tree, both tiers, in one sitting** — the row above is
that measurement, taken after every lane of the Everyday-and-Engineer wave had merged and never
once on a branch. **Eleven surfaces and roughly 190 000 strings** joined each tier, which is the
largest single move this row has recorded and is what building the other twelve of § 4's screens
looks like: the stage, the daily loop's four, the campaign's three, the workshop, the bench, the
three standalone screens, the gauntlet's ladder, the door between the two products, and the
Engineer editor's family controls all entered the corpus at once.

**The cases, the simulations and the failing-case columns are all unmoved**, and that is the
claim worth reading twice: the corpus grew by half again and found nothing, on a wave that added
thirteen screens. The surfaces column is the honest measure of what this wave built — a screen
that is not in this count is a screen the search has never read.

The deep tier is still exactly one surface above the always-on tier, for the reason it has always
been: `campaign/judge.ts#judgeStage` is silent in one tier by construction and loud in the other.
Thirteen new surfaces on both sides did not disturb that, which is the gap being a property
rather than a coincidence.

The `EVERYDAY_MENU` adapter drives the four mode tiles, the rail over **every** screen key in all
**five** run contexts — `everyday/types.ts:84` is `daily, campaign, rush, watch, replay`, and the
adapter iterates the array, so the sweep is right and only this sentence had gone stale — both
shapes of the rail, and the shell's register of absences. It does not
drive `mountEverydayShell`, which needs a document and is excluded on the DOM mounts' shared
ground — the pure/DOM split in `everyday/` exists so that the words are drivable without one.

The row this replaced published `374 491 / 36` and `474 400 / 37`, measured on merged `main` the
day before ([§ D334](../DECISIONS.md)); the one *that* replaced published `335 950 / 30` and
`426 662 / 31`, and its surfaces column had been wrong by six for longer than its string counts had
been wrong at all. **This is the fourth time this file has recorded the same lesson**, which is why
the sentence below it is the rule and not an observation.

**The deep tier's failing-case column reached `0` for the first time here, and the register was
briefly empty with it — the second half stopped being true on 2026-08-24, above.** Both
entries in it named one collision — the M7 caveat's *"6 of 20 consecutive seeds"* against a refused
mean of 19.65 — and § D332's deck fix moved that run: re-measured, `honesty-9100031` reports
`awtIsValid: true` and a mean of **19.186**, so it neither suppresses nor rounds to 20. The entries
were deleted on the commit that made them stop reproducing. **That is luck moving rather than a
defect being fixed**, and `honesty.test.ts` says so where the entries used to be: the caveat still
cites its measurement with a bare integer, so the class is open and the next run to collide will
arrive unregistered, which is correct.

## The earliest entries: the 2026-08-09 measurement, wave 18, and issues #127 and #137

Measured 2026-08-09 on the integrated tree, both tiers, in one sitting — and that is the point of
the sentence rather than a detail of it. **Three lanes in this wave each measured the corpus on a
different base and reported three different pairs of numbers**, every one of them correct where it
was taken and none of them correct here. A figure re-measured per branch is a figure that is stale
the moment the branch merges, so the measurement now happens once, after integration, or not at
all.

**Wave 18 moved both counts by roughly a sixth — `287 083 → 335 950` and `362 317 → 426 662` — and
the rule above earned its keep again.** The lane that produced most of that rise measured **335 803**
on its own branch and said so explicitly as a branch-local figure; the integrated number is 147
higher, from a *different* lane's free-play fixtures. Neither lane could have published the right
number, and both were correct where they stood. Cases, simulations and surfaces are all unmoved,
which is what a wave that gave existing surfaces a second register is supposed to look like: the
rise is the Casual arm of the canvas header, the dispatcher cards and the plates entering the
corpus, plus `buildingPlateOf`'s Casual arm being swept for the first time — it had been shipping
unreachable since issue #71 because `keyedPlate` hashed a key that a mode toggle did not change.

**The verdict column says *green* rather than *0 violations*, and the difference used to be
deliberate.** It meant: both tiers pass, and every violation the search finds is in
`honesty.test.ts`'s `OUTSTANDING` register with a ghost check holding it. **As of § D334 the two
briefly coincided — the register was empty and the search found nothing**, which was the first
time that had been true of the deep tier. The distinction was kept in this row rather than deleted,
because it is what the column would mean again the next time a finding was recorded rather than
fixed. **That happened on 2026-08-24**, one property later, and the sentence is left standing
because a row that had predicted its own next state is worth more than a tidy one.

- **`suppressed-mean` on `honesty-9100031` is closed, and not by anybody fixing it.** It was the
  cue-rule coincidence — the caveat says *"a quotable average on 6 of 20 consecutive seeds"* and
  that run's refused `meanWaitS` rounded to 20. § D332's deck fix moved the run out from under the
  collision: it now reports `awtIsValid: true` and a mean of 19.186, so it neither suppresses nor
  rounds to 20. The two register entries were deleted on the commit that made them stop
  reproducing. **The caveat is unchanged**, so the class is still open and the next run that
  collides will arrive unregistered.

- **`suppressed-mean` on `dev/reportPanel.ts#reportViewOf` was found and fixed in the same
  sitting** ([§ D334](../DECISIONS.md)). The Day report's delta block drew
  `AVERAGE WAIT was 30.5 s → withheld` two lines under a cell reading `withheld`, and the earlier
  sheet in that pairing is **the same candidate arm at another seed**, so its mean sits on top of
  the one being withheld rather than near it. A figure the current sheet withholds is no longer
  paired; it is named in the note with the reason. This one was a product defect rather than a
  coincidence, and it was introduced by § D332 — the deep tier was green before that merge and red
  after, which is how it was caught.

**`estimate-without-n` was the second, and it is closed in the product** (issue **#137**). The Day
report's delta row published `AVERAGE WAIT was 17.8 s → 23.4 s` — a mean with **no count in its
own box**, on 24 of 49 always-on cases and 28 of 60 deep — and § D310's editor strip drew the same
row with no figure grid anywhere near it. The row now carries the count each mean was taken over,
**one per side**: the two values are means of two different runs, so one `n` under both would be a
claim neither sheet made. A refused mean carries none, because a refusal has no sample. Fixed in
the view (`ReportFigure.count` → `DeltaRowView.beforeCount`/`afterCount`) so both renderers draw it
from one decision, and **both `OUTSTANDING` entries were deleted on the commit that made the
finding stop reproducing** — a registered finding that has been fixed must stop being registered,
or the register becomes decoration. Violations went **48 → 0** always-on and **104 → 0** deep; the
string counts moved **+100** and **+112**, which is the counts themselves entering the corpus. A
decision number is owed; the argument is in the docstrings named in § D322's closing note.

The column that moved into the table is **failing cases**, which the run prints and which nobody
has to derive. A count of *violations* is still not published as a headline: two attempts to
extract one from the run's output disagreed with each other, because a finding is reported once per
property that sees it rather than once per string. Where a violation count appears below it is
quoted as *reported violation lines on a named property*, which is a thing a reader can grep the
run's output for — and the only violation count that needs no such care is **zero**.

**The deep tier's surface count is one above the always-on tier's, in every row above and for one
reason**: `campaign/judge.ts#judgeStage` is silent in the always-on tier by construction
(`STANDARD_SPACE` sets `stageProbability: 0`, a stage being 50 replications) and loud in the deep
one. `honesty.test.ts` asserts that silence in one tier and that noise in the other, which is why
the gap is a property rather than a coincidence — and it is how a row that once published the same
number for both tiers was known to be wrong before it was re-measured.

**Both string counts went up, and both for the same reason**: issue #127 put the Day report's
**run-to-run delta block** into the corpus, which had never been in it — `honesty/surfaces.ts`
rendered `reportViewOf(shaped)` with no `previous`, so the caption, both arms of the note, the
comparability refusal § D311 added and every paired row were swept by nothing, on a block § D310
draws on **two** surfaces. Six pairings per case, each a state a player can produce, add **+1 220**
always-on and **+1 552** deep. The simulations move by exactly one per case (**+49** and **+60**)
because a *drawn* comparison needs two runs, and the case's candidate arm is the honest second one.

**Then they went up again — by 1 129 and 1 372 — and that is two fixes rather than a second
sweep.** Measured on the integrated tree: **285 954 → 287 083** always-on and **360 945 → 362 317**
deep, with the simulations, the cases and the surfaces all unmoved.

**Two changes, not one, and the split is stated because attributing it to one would be the
per-branch figure again.** Issue #137 put a count beside each paired mean and measured
286 054 / 361 057 **on its own branch**; § D3xx's calendar seam then seeded a period's event choice
per day and added the rest. Neither branch's number survived the merge, which is the third time
this file has recorded that and the reason the measurement now happens once, after integration.

A string count that rose while nothing else did is what fixes that add words to existing rows are
supposed to look like, and saying it beside the violation count is the point — #137 took
`estimate-without-n` from **48 reported violations to 0** always-on and **104 to 0** deep, and took
the always-on tier from **24 failing cases to none**.

**The violation counts had gone up first, and that was the finding rather than the cost.** The
block's first sweep produced one R13 violation, in 24 of 49 always-on and 28 of 60 deep cases:
`AVERAGE WAIT was 17.8 s → 23.4 s`, a mean with **no count anywhere in its box**. It was real
rather than a classification artefact — the block's rows carried no note, and on
`dispatcherEditor.ts`'s result strip there is no figure grid nearby either — and it was **recorded
rather than fixed** in that lane, on § D307's own precedent that a corpus which acquired a surface
and had to be repaired first is a different claim from one that acquired it and reported. It is
fixed now, one wave later, in the view both surfaces draw from.

The deep tier's **then-remaining** failure — its only one at that point — was `honesty-9100031` /
`suppressed-mean`, a **cue-rule coincidence rather than a product defect**: the caveat says *"a
quotable average on 6 of 20 consecutive seeds"* and that run's refused `meanWaitS` (19.65) also
rounded to 20. It had been published as outstanding since the temporal axis landed **and was in no
register**, so the deep tier was simply red on that base; it was entered in `honesty.test.ts`'s
`OUTSTANDING`, where the ghost check held it accountable in both directions — **and that ghost
check is what closed it**. § D332 moved the run (`awtIsValid: true`, mean 19.186), the entry
stopped reproducing, the check said so, and both entries were deleted. It is also the reason
issue #137's count was
seeded as its own string rather than spliced into the row: the row's label *is* R3's cue, and a
denominator set beside the word `AVERAGE` on a run whose mean is refused is that same collision,
manufactured on purpose.

## The row's opening paragraph, as it stood when this log was split out

**The figures this row published have now gone stale twice, which is the thing to notice about
them.** They read *"60 cases, 271 985 strings, 4 650 simulations, 23 surfaces, 0 violations"*, were
re-measured by [§ D307](../DECISIONS.md) to 246 875 always-on and 312 104 deep — and **both of those
had moved again before anybody looked**. Measured on `integration/issue-wave-15` 2026-08-09,
**before** this wave's work: always-on **49 cases, 259 956 strings, 30 surfaces, 0 violations**;
deep **60 cases, 327 805 strings, 31 surfaces, 4 650 simulations, 10 violations in one case**. Two
of those were already wrong in the published row — the deep tier's surface count is **31**, not 30,
because `campaign/judge.ts#judgeStage` speaks in no other tier, and *0 violations* had stopped
being true of the deep half the day the temporal axis landed. The current figures, **measured on the
integrated tree after wave X** against a base that was re-measured first (the habit § D442 set);
the run that first moved them was issues #127 and #137, the second of which fixed what the first
found, and the arguments for that pair are in `honesty/surfaces.ts`, `honesty/run.ts`,
`shift/types.ts#ReportFigure.count` and `dev/reportPanel.ts#DeltaRowView`. **The figures
below are wave AL's, both tiers, measured 2026-09-26 on the integrated tree**; the paragraph above
describes the wave that first moved this column and is kept as the dated record it is:
