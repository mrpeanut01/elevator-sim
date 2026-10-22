# Design-cycle coordination artifact

One file per cycle, committed under `docs/design-cycles/CYCLE-*.md`. It is the shared
state the design loop passes between agents, the same role the WAVE*_PLAN.md files play
for the build loop. Every claim carries the seed or issue that grounds it, per the
repo's existing discipline (no verdict without a reproducible basis).

---

## CYCLE-2: stage 1 again, on the sized verdict and the fixed engine   (2026-10-21 to 2026-10-22, Eastern)

**Track(s):** Casual
**Build under test:** `main` at `c70dbf2` (wave AU's merge, which carries the engine fix), one commit
served unchanged through the whole playtest.
**Owner sign-off:** pending

**What this cycle starts from.** [`CYCLE-1.md`](CYCLE-1.md) § 5, the owner note, and the decision
panel's rulings on GitHub issue #645. Two of them fix how this cycle runs:

- **One engine, and it is `main`'s.** § D1600 clause 4 ordered the held release-direction fix to land
  before this cycle measured anything, so that the cycle would measure one engine. The fix turned out to
  move verdicts outside stage 1 and needs content re-derived around it (wave AU). Stage 1 itself was
  measured byte-identical on the unfixed and the fixed engines: the six presses cycle 1's playtest made,
  on both seed sets, batch by batch; the stage's survivor-census rows at every rung; and the fun proxies.
  The panel's ruling R5 (issue #645, 3–0) let this cycle proceed on the unfixed engine only if stage 1
  were also identical on the twelve fresh mastery batches. It was not (194 of 1 056 comparisons differed,
  every one from the release fix), so the cycle waited for wave AU and plays on the fixed engine, which
  restores clause 4 as written (§ D1605).
- **Mastery is re-judged in the harness.** The fresh seed batches are declared before the playtest
  (`data/mastery-seeds.json`), each persona attempt is judged by the game's own judge on its own fresh
  batch, and the game is left unchanged (§ D1601).

**The bar the playtest is judged against was written in cycle 1**, before Delta A was built
(`CYCLE-1.md` § 3, "How we'll know it worked"): no persona reconfirms C1, C2 or X1; every persona that
presses forecast parking reports it as helping on the stage's own crowds and too close to call on the
held-back ones; and the felt-but-null count is 0, against cycle 1's 1 (X5). It is persona evidence about
legibility and is weighted as such.

### 1. Sim-sweep summary  (fast loop, no LLM)
Source: on `c70dbf2` (the build under test, wave AV's tree at the same engine),
`elevator-sim fuzz --scenario stage-1-first-call` (standard tier), the same with `--tier deep --cases 2000`,
and the same with `--engagement`. Deterministic, and every figure reproduces from those commands. Every
proxy is still an unmeasured premise about people, so none is marked Measured.

**Nothing in this section moved since cycle 1.** The standard tier and the engagement report print
byte for byte what they printed on `4ee9557`, before wave AU's engine fix, which is what § D1605 found
for stage 1's presses and census rows. So cycle 1's baseline tables (`CYCLE-1.md` § 1) stand as this
cycle's baseline unchanged: tension in band 1 of 50 on each seed set, AWT 16.88 s [15.73, 18.04] and
WT95 29.41 s [27.18, 31.64] on tuning-20260730, AWT 15.78 s [14.71, 16.85] and WT95 27.59 s
[25.59, 29.59] on holdout-20260731, and an engine-level meaningful-choice baseline of 10 of 22
[0.269, 0.653], none of them a player's choice.

| Check | Cases | Result |
|---|---|---|
| Standard tier (64 pinned seeds and 7 regressions) | 71 | all 9 properties held; 0 failures |
| Deep tier (play seeds 1000001 to 1002000, up to 40 entries a log) | 2 000 | all 9 properties held; 0 failures; 23 389 log entries; 739 sessions refused a mean |

**The mastery slope is now measurable, off the screen.** The CLI still prints its named gap, because the
game itself still judges every attempt on the one holdout batch. Cycle 2 closes that gap in a harness
(§ D1601, § D1621): each persona's attempt k is re-judged by the game's own judge on fresh batch k from
`data/mastery-seeds.json` (stream `mastery-c2`, twelve batches of 50, declared before the playtest), and
the game is left as it is. The slope is in § 2.

### 2. Playtest findings  (middle loop, LLM personas)
Source: playtest-director, run as three separate instances so no persona borrowed another's context:
the curious player (1280 × 800), `five-minutes-phone` (390 × 844, also 360 × 740 and 844 × 390) and
`number-averse` (1280 × 800, also 820 × 1180). Each played the served `dist-web/` of `c70dbf2` in the
Casual register with only the screen's own controls, a fresh browser context per session. **Each played
a blind series first**, reading no repository file until it ended (§ D1601): the phone persona's
attempts 1 to 13, the curious player's 1 to 13 and `number-averse`'s 1 to 10. All three cleared by
their third press, so most of each series is the persona seeing what else works, and the later
attempts are the director's continuation in the persona's voice, marked as such in the record.

**How every row replays.** Every press is on `stage-1-first-call` at the base rung (4 u), judged on
tuning-20260730 (seed 20260730, 50 replications) and, when the tuning batch meets the goal, on
holdout-20260731 (seed 20260731, 50 replications). A press replays from stage id, move and rung; the
page itself shows no seed. The watched crowd is tuning replication 0, seed 16878484666841983707.

**What the evidence is.** Each playtester re-derived its presses with `stageSessionConfigFor`, core's
`runSimulation` and a paired t over the same 50 replications, and **every interval the page printed
matched the re-derivation to the printed digit**: the phone persona's 12 distinct moves, the curious
player's every press and `number-averse`'s 10 of 10. Wall-clock figures came from a contended container
and no row rests on one. Every persona premise is unmeasured (`docs/23-audiences-and-core-loop.md`
§ 1.5), and all of this is agent evidence about legibility, weighted as such.

#### Cycle 1's pass condition, judged

Written in `CYCLE-1.md` § 3 before Delta A was built. **Two of its three clauses are met, and the third
is not.**

| Clause | Result | Evidence |
|---|---|---|
| No persona reconfirms C1, C2 or X1 | **Met** | Every persona took a size from every press (C1 below); the unchanged press reads "the same run every time" (C2 below); all three read forecast parking's split verdict as a half pass without calling it a contradiction (`number-averse`'s doubt about its earlier clear is a different defect, X4 below) |
| Every persona that presses forecast parking reads it as helping on the stage's own crowds and too close to call on the held-back ones | **Met, 3 of 3** | Phone attempt 1 ("no difference I can call"), curious attempt 2 ("unclear on second"), `number-averse` attempt 3 ("could be a bit better or a bit worse") |
| Felt-but-null count 0, against cycle 1's 1 (X5) | **Not met: 1** | X1 below: the same persona, the same pair of moves and the same figures as cycle 1's X5 |

So Delta A did what it promised for the size of a verdict and for the null press, and it left one
thing where it was: a page that judges each press only against the shipped setting gives a player
who combines two dials no way to see which one did the work.

#### Mastery, re-judged on fresh crowds (§ D1601, § D1621)

`measure.mastery.test.ts` re-judged each persona's attempt k with the game's own judge on fresh batch k
of `data/mastery-seeds.json` (stream `mastery-c2`, 50 replications a batch). The declaration holds
twelve batches, so attempts 13 and 14 of the phone persona and of the curious player are not judged;
adding batches once the playtest had started was not done, although the seeds are a fixed function,
because the declaration's value is that it came first. The harness cuts `number-averse` at attempt 11,
its first after reading the tree.

| Persona | Attempts judged | Slope on fresh batches, clears per attempt [95 %] | Paired against the page's own batch | Fresh verdict differs from the page's |
|---|---|---|---|---|
| five-minutes-phone | 1 to 12 | +0.024 [−0.075, +0.124], flat | 0.000 [0.000, 0.000], flat | 0 of 12 |
| curious player | 1 to 12 | 0.000 [−0.102, +0.102], flat | −0.031 [−0.083, +0.020], flat | 1 of 12 |
| number-averse | 1 to 10 | +0.018 [−0.111, +0.147], flat | −0.030 [−0.112, +0.051], flat | 1 of 10 |

Every slope is flat, and on this stage that is the expected shape: each persona cleared by its third
press, so a series of ten or twelve has almost nothing to climb, and the slope says nothing about
learning either way. **Both differing verdicts are forecast parking under the shipped standing order**
(curious attempt 2 on `mastery-c2-02`, `number-averse` attempt 3 on `mastery-c2-03`): it clears on those
two fresh batches, and it does not clear on the phone persona's `mastery-c2-01` or on the page's own
holdout-20260731. A held-back verdict on a move this marginal depends on which fifty crowds judge it.
That is three batches, an observation and not an estimate.

#### Confirmed (report agrees with telemetry)
- **C1** [all three] **Every verdict now carries its size, and it is read.** Each persona quoted a
  range from each press ("shorter by between 1.35 and 4.07 seconds") and every one is the run's own
  paired interval. Pillar 2, positive; this is Delta A working.
- **C2** [five-minutes-phone, number-averse] **A null press is named as one.** The unchanged press reads
  "your run and the building's were the same run every time", which `number-averse` called the clearest
  verdict on the page. Pillar 2, positive.
- **C3** [all three] **Repeats are identical to the digit** across fresh contexts and viewports (phone
  attempts 2, 9, 11; curious 3, 4, 12, 13; `number-averse` 2, 8, 14). Pillar 1, positive.
- **C4** [all three] **Parking carries the clearing power, and the standing order mostly does not.**
  Mid-zone parking clears under every in-budget standing order the personas tried; `eta` alone is
  unresolved on average wait (−0.279 s [−0.960, +0.401]) and behind on door-to-door time (+1.904 s
  [+0.824, +2.985]); lobby parking, the letter's "first guess", loses (+1.491 s [+0.786, +2.197]).
  Reconfirms cycle 1's C5. Pillar 3, medium.
- **C5** [all three] **Differently priced standing orders produce one run.** `fairness-first` (4 u) and
  `capacity-aware` (4 u) match `eta` (2 u) bit for bit on 50 and 48 of 50 tuning replications, and with
  mid-zone parking on 49 and 45 of 50 (average-wait difference −0.013 s [−0.040, +0.013] and +0.023 s
  [−0.086, +0.133]). All three personas suspected the page had shown one result twice, and the page
  does not say the orders are alike. Pillar 3, medium.
- **C6** [all three] **A size has no base to be read against.** The page prints differences and never
  the shipped setting's own figures (average wait 16.88 s, 27.0 kJ a ride on the tuning crowds), so
  mid-zone parking's +142.6 kJ [+113.8, +171.4] cannot be read as the 43 % it is, and nothing lists the
  player's earlier presses. Energy was read in the right direction by all three. Pillar 2, medium.
- **C7** [all three] **The goal line names no measure, and the terms go undefined.** "Measurably ahead of
  the shipped setting" is judged on every row the batch orders (average wait, 95th-percentile wait,
  door-to-door time, and three observation rows: riders over a long wait, people moved per five minutes
  and riders never served), at least one ahead and none behind (`campaign/judge.ts#judgeComparisonGoal`;
  corrected by R10 amendment 10 from "three measures"). That rule failed `eta` alone on
  door-to-door time and cleared the curious player's attempt 11 on the 95th percentile alone. No
  definition reaches the stage page for door-to-door time, drive work (proxy), par, census, chimes or
  units. Pillar 2, medium.
- **C8** [all three] **Nothing on the stage pulls a cleared player on.** A clear pays 6 chimes once,
  later clears pay nothing, the wider rung costs 20 with no way shown to earn them, and stage 2 opens
  without stage 1. Two personas would have left within a press or two of clearing (a premise). Pillar 4,
  medium.
- **C9** [all three] **The stage stays calm whatever is pressed.** The shipped setting is flat on 49 of 50
  runs in both sets, `zoned-uppeak` on 50 of 50, lobby parking on 47 and `nearest-car` on 46 (stage 1's
  band, uncalibrated). Reconfirms cycle 1's C6. Pillar 4, low to medium.
- **C10** [five-minutes-phone, number-averse] **Layout.** At 360 × 740 the consent card still covers about
  half the first screen with its end clipped (cycle 1's C3); at 390 × 844 the goal line and both
  selects open below the fold; at 820 × 1180 the verdict heading lands under the bottom bar, below two
  watch panes (cycle 1's C4). Nothing overflows horizontally at any width tried. Pillar 1 and 2, low to
  medium.
- **C11** [all three] **The watched pair is replication 0 and loops until "Stop watching"** (§ D1534).
  There mid-zone parking cuts mean wait by 9.1 s against a 50-run mean of 2.71 s, so the picture is more
  dramatic than the verdict. Pillar 2 and 4, low to medium.

#### Contradicted (felt ≠ measured, usually a feedback or UI defect)
- **X1** [five-minutes-phone, attempt 10, director's continuation] **Felt but null: the persona credited
  `eta` with turning forecast parking's fail into a clear.** With parking held at forecast, the switch's
  own effect on mean wait is unresolved on both sets (−0.58 s [−1.24, +0.09] tuning, −0.26 s
  [−0.54, +0.02] holdout), which is cycle 1's X5 to the digit. Each press is judged only against the
  shipped setting, so the page never compares two of the player's own moves. This is the cycle's one
  felt-but-null entry. Pillar 2, medium to high.
- **X2** [curious player, five-minutes-phone] **Operational zoning was credited for a gain that lives in
  the parking built into it.** Zoning with cars left where they stopped is unresolved on mean wait
  (−0.288 s [−1.010, +0.434]) and behind on door-to-door time (+1.694 s [+0.575, +2.813]); the only cue
  is the relabelled parking option ("as it stands, in the middle of its own zone"). The move as pressed
  is resolved against the shipped setting, so this is a misattribution inside one move and not felt but
  null. Pillar 2, medium, with a pillar 3 risk.
- **X3** [all three] **Personas ranked their own moves by comparing two separate printed intervals**, the
  inference `CLAUDE.md` forbids, because the screen offers no paired view between presses. On the
  paired runs the curious player's attempt 7 ranking holds (−1.348 s [−2.159, −0.538]), `number-averse`'s
  attempt 5 holds thinly (−0.521 s [−1.031, −0.010] held-back), the curious player's "cheapest clear"
  is unsupported, and the phone persona's "energy about the same" is wrong (−27.4 kJ [−45.7, −9.1]).
  Pillar 2, medium.
- **X4** [number-averse] **"Not cleared." on a stage this device has cleared** made the persona doubt its
  clear had survived. It had; "Cleared on this device. Running it again is practice" sits screens away
  from the heading. Pillar 2, low to medium.
- **X5** [five-minutes-phone] **An over-budget pick greys Run** ("nothing to run until it fits") **while the
  stale verdict's red line says "Run it again to judge them".** Pillar 2, low to medium.
- **X6** [curious player] **"Minimum estimated wait" promises a shorter wait and alone gives none** (C4's
  figures). Pillar 2, low.
- **X7** [five-minutes-phone, curious player] **One "Cleared." heads a 4 s win and a clear resting on one
  measure**, such as the phone persona's attempt 10, whose held-back average-wait bound is −0.01 s and
  whose 95th percentile carries it (−1.88 s [−3.20, −0.55]); the persona called it "a coin flip". The
  sizes are printed below. Pillar 2, low.

#### Unverifiable (taste, weight low)
- **U1** [all three] "It unlocks nothing; I wanted a reward." The fact is C8.
- **U2** [five-minutes-phone, number-averse] "Behind and ahead on nothing" read as unparseable
  (`campaign/judge.ts`); comprehension is taste.
- **U3** [all three] The cost of the undefined terms to a lay player (C7's strings are verified).
- **U4** [five-minutes-phone] About 10 s of lobby ride and six taps to the stage; whether that is too slow
  for a minute's grab is a premise.
- **U5** [number-averse] "The first pile was probably luck" about forecast parking; luck is neither shown
  nor ruled out.
- **U6** [curious player] Whether the watch drawings carry anything to a lay player without a key.

**For the meaningful-choice proxy.** One persona belief is felt but null (X1). No persona pressed a verb,
so § 1's player-session rate stays 0 of 0.

### 3. Design deltas  (outer loop, design-director)
One delta this cycle. The design-director subagent sized its candidates on tuning-20260730 only and read
no holdout figure beyond those already in § 2. The decision is GitHub issue #645, ruling R10.

#### Delta B: split a press that changes both settings into each change on its own
- **Pillar served and how a player notices:** pillar 2, Understandable. After a press that changes both
  the standing order and where idle cars wait, the verdict gains one line for each change on its own,
  measured on the stage's own crowds with the other change kept as the player set it. The phone persona
  asked for exactly this ("Both of the two things I changed together, I cannot split them", attempt 4).
- **Simplicity budget:** (1) pillar 2, as above; the credit X1 gave `eta` meets a line saying what `eta`
  did with forecast parking kept. (2) It adds one block to the existing verdict card, drawn only after a
  press that moves both selects, and adds no verb, control, rule or screen. No judge rule moves: a clear
  is still beat-the-baseline on tuning-20260730 and again on holdout-20260731, and the watched pair
  (§ D1496) is untouched. (3) Each line uses the verdict's own sentence shape through the same formatter
  and says what was held, so a new player needs no tutorial step; a player who changed one thing never
  sees the block.
- **Track:** Casual. The Engineer campaign panel prints `judgeStage`'s sentences, and the split is not one
  of them.
- **The change:** code, because no `data/*.json` value can say which of two changes did the work.
  (1) After the verdict's own batches land, and only when the admitted move changes both selects, the
  stage runs one more batch on tuning-20260730, 50 replications on the same crowds, with three arms: the
  press, the shipped standing order with the player's parking, and the player's standing order with its
  own parking (for `zoned-uppeak`, mid-zone). Each one-change arm is admitted through `admitStageMove`
  (§ D1129). The verdict never waits for this batch, and its figures, `met`, `held`, `cleared` and CRN
  audit stay byte-identical. (2) `campaign/judge.ts` gains one builder that prints each one-change
  comparison by `comparisonSentence`'s rules, with one energy line worded as higher or lower only where
  the interval excludes zero (§ D106) and "altered no run" only where every paired difference is exactly
  zero. No line names a cause, says the parts add up to the whole, or speaks for other crowds.
  (3) `everyday/stagePlay.ts` and `stagePlayScreen.ts` draw the block under the own-crowds sentence.
  (4) A new honesty-corpus case covers the new strings under `unbacked-attribution` (§ D1011).
- **Evidence:** X1, the one clause of cycle 1's pass condition still unmet, and the X3 rankings that turn
  on which of a press's two changes did the work. Sizing on tuning-20260730 only (a forecast, not a verdict),
  which reproduces § 1's baseline and § 2's figures to the printed digit: the page admits 17 two-change
  moves at 4 u. The parking's own effect on mean wait resolves on 17 of 17, the standing order's on 11 of
  17. Of the nine that shorten mean wait as a whole, the standing order's own effect is too close to call
  on five and resolves on four. (The 17 left out zoning with cars left where they stopped; R10's
  amendment 6 replaces the count with the page's own list.) On the phone
  persona's attempt 10 the split would have said the standing order alone shortens the 95th-percentile
  wait by between 0.62 and 5.02 s with mean wait too close to call, which neither the persona nor X1 read
  in full.
- **How we'll know it worked:** decided before merge by seeded runs. (a) No verdict moves:
  `stageVerdictsHold.test.ts` holds `met`, `held` and `cleared` on every shipped stage, the engagement
  report reprints § 1, and no `data/` file is in the diff. (b) `judge.test.ts` reads every split bound
  back against the paired-t estimate of its two named arms at `BATCH_METRIC_PRESENTATION.places`, for the
  presses behind X1 and X3, and fails a tampered sentence. (c) The held-back crowds judge the split: for
  every two-change move the page admits and every row the block can print, each row's interval on
  holdout-20260731 is set against the same row on tuning-20260730, and the test passes when no row the
  tuning split prints as resolved one way resolves the other way on holdout; same-way agreement is
  reported beside it and never gated (R10 amendments 6 and 7). (d) The
  deep honesty tier at 0 failing cases. Whether people read the split correctly is a fact about people,
  so cycle 3's pass is written now: the felt-but-null count is 0; no persona says it cannot split two
  changes; and on every two-change press, any change a persona credits on a measure is one its split line
  resolves on that measure.
- **Blast radius:** no data file, census, goal bar, survivor count or published figure moves. Test strings
  and honesty seeds move, the deep tier gains a surface, and one `DECISIONS.md` entry with a `docs/39`
  § 2 row is owed.
- **Reversibility:** one revert. If cycle 3 finds `number-averse` losing the verdict among the figures,
  the fallback is the mean-wait clause alone for each change.

**Candidates considered and rejected,** in the design director's ranking:
1. **Deferred again, not rejected** (R10 amendment 9): § D372's failable building for stage 1, the one
   lever measured to move C9, and a content lane measured in days that leaves X1 and X3 standing.
2. A paired line against the player's previous press: none of the five comparisons behind X1 and X3 was
   between consecutive presses.
3. Judge each attempt on a fresh held-back batch in the game: § 2's slopes are uninformative on a stage
   cleared by the third press, and it would move every stage's judge and census.
4. Print the shipped setting's own figures beside every size (C6): two absolute figures side by side
   invite the separate-interval reading X3 found.
5. Say that `eta`, `fairness-first` and `capacity-aware` run alike here (C5): a per-stage tie line needs a
   census of ties on every stage, and the price schedule is one owner-approved table.

**Ruling R10 (GitHub issue #645, 3–0, § D1622): approved with amendments.** The owner's decision panel,
three agent seats ruling alone (product; statistics and cost; the player), approved Delta B with these
amendments, the union of the seats' own:

1. **The trigger is the admission, never the selects** (seats 1 and 3). The block draws only when the
   admitted move changes both the standing order (a profile other than the stage's own) and the parking
   (`idle.parkingStrategy` among `admission.moved`, against the shipped setting). Each one-change arm
   reverts exactly one of the two to the shipped stage's value. So `zoned-uppeak` left at "in the middle
   of its own zone" draws the block, with zoning and cars left where they stopped as its parking arm (X2,
   the curious player's attempt 7), and zoning with cars left where they stopped draws none. A test pins
   both.
2. **Each line names the change and what was kept** (seat 3), as in "Changing the standing order to
   Minimum estimated wait, with forecast parking kept: …", and never says "on its own" or "alone", because
   the player may already have pressed the order alone and seen another result. A line carries size
   clauses and the rest clause only, and no bar word ("ahead", "behind", "met", "reached"), so no line
   reads as a second verdict.
3. **One heading** (seats 1 and 3) names the stage's own crowds and the 50 runs once. Where the held-back
   batch ran, it says those crowds judged the two changes only together, and that the block does not say
   which change decided them.
4. **Drawn last** (seats 1 and 3): below the held-back sentence, never between the two crowd sentences. A
   pending line with no figures holds its place, Run is never greyed or delayed, an edit or a new press
   drops the batch, the block never draws over a stale verdict or over another press's, and a failed
   batch says so.
5. **Common random numbers are checked** (seat 2): the split's press arm must equal the verdict's tuning
   candidate arm on every replication and row, or the block is not drawn.
6. **The held-back test covers every row the block can print** (seat 2): the three waits, the observation
   rows `comparisonSentence` sizes when they resolve, and the drive-work rows, over the page's own list of
   moves through `admitStageMove`, never a fixed count. Stage 1 at 4 u is always-on; the 24 u rung and
   stages 2 to 10 run once before merge as a deep-tier test, and the block draws on no stage that test has
   not covered.
7. **A flip goes back to the panel** (seat 2): a row the tuning split prints as resolved one way whose
   holdout interval excludes zero the other way fails the gate and returns R10 to this panel with the row
   named. Nothing is changed to make it pass. Same-way agreement is printed and never gated.
8. **Cycle 3's pass gains three clauses** (seats 1, 2 and 3). Every persona states the outcome correctly
   after every two-change press, and `number-averse` and the phone persona at 390 × 844 also state the
   measure that decided it with the block drawn; a miss takes § 3's mean-wait-only fallback without
   another ruling. A persona's ranking of one press's two changes is checked against the paired interval
   of the two one-change arms, and counts as an X3 misreading where that interval contains zero. A series
   with no two-change press marks these clauses untested, never met.
9. **The record** (seat 1): § D372's building stays deferred, as R1 amendment 10 recorded it, and § 5
   carries C9 as the open design risk for a second cycle.
10. **Corrections to § 3 and § 2**, made in the record: the director's 17 moves left out `stay`, so
    zoning with cars left where they stopped was missing (amendment 6 replaces the count with the page's
    own list); "three of X3's four misreadings" overstated it, because the paired runs uphold two of X3's
    four rankings and `number-averse`'s attempt 5 compares held-back figures a tuning split cannot answer;
    the sentence setting the order's split size beside the parking's compared two separate estimates,
    X3's own inference, and is struck; and § 2's C7 named three measures where `judgeComparisonGoal`
    orders on six rows.

### 4. Handoff to build loop
Pending.

### 5. Owner note
Pending.
