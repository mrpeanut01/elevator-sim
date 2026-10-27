# Design-cycle coordination artifact

One file per cycle, committed under `docs/design-cycles/CYCLE-*.md`. It is the shared
state the design loop passes between agents, the same role the WAVE*_PLAN.md files play
for the build loop. Every claim carries the seed or issue that grounds it, per the
repo's existing discipline (no verdict without a reproducible basis).

---

## CYCLE-3: stage 1 with the two-change split   (2026-10-27, Eastern)

**Track(s):** Casual
**Build under test:** `main` at `94e0e86` (waves AU and AV merged, with Delta B's split, § D1623), one
commit served unchanged through the whole playtest.
**Owner sign-off:** pending

**What this cycle starts from.** [`CYCLE-2.md`](CYCLE-2.md) § 5 and the decision panel's ruling R10 on
GitHub issue #645 (§ D1622), built as § D1623: after a press that changes both the standing order and the
parking, the verdict card prints each change with the other kept, on the stage's own crowds.

**The bar the playtest is judged against was written in cycle 2**, before Delta B was built
(`CYCLE-2.md` § 3, "How we'll know it worked", and R10 amendment 8):

1. the felt-but-null count is 0 (it was 1 in cycle 1 and 1 in cycle 2);
2. no persona says it cannot split two changes;
3. on every two-change press, any change a persona credits on a measure is one its split line resolves
   on that measure;
4. every persona states the outcome correctly after every two-change press, and `number-averse` and the
   phone persona at 390 × 844 also state the measure that decided it with the block drawn; a miss takes
   `CYCLE-2.md` § 3's mean-wait-only fallback without another ruling;
5. a persona's ranking of one press's two changes is checked against the paired interval of the two
   one-change arms, and counts as an X3 misreading where that interval contains zero.

A series with no two-change press marks clauses 2 to 5 untested, never met. It is persona evidence about
legibility and is weighted as such.

**Mastery is re-judged on fresh crowds again**, on batches cycle 3 declared before its playtest
(`data/mastery-seeds.json`, stream `mastery-c3`, § D1624), because cycle 2's batches have been read.

### 1. Sim-sweep summary  (fast loop, no LLM)
Source: on wave AW's tree (`main` at `94e0e86` plus this cycle's seed declaration, which the game never
reads), `elevator-sim fuzz --scenario stage-1-first-call` (standard tier), the same with `--tier deep
--cases 2000`, and the same with `--engagement`. Deterministic; every proxy is still an unmeasured premise
about people.

**Nothing in this section moved since cycle 2.** All three commands print byte for byte what they
printed for `CYCLE-2.md` § 1 on `c70dbf2`, so cycle 1's baseline tables (`CYCLE-1.md` § 1) stand again:
tension in band 1 of 50 on each seed set, AWT 16.88 s [15.73, 18.04] and WT95 29.41 s [27.18, 31.64] on
tuning-20260730, and an engine-level meaningful-choice baseline of 10 of 22 [0.269, 0.653], none of them a
player's choice. Delta B adds a batch after the verdict and changes no run the sweep makes.

| Check | Cases | Result |
|---|---|---|
| Standard tier (64 pinned seeds and 7 regressions) | 71 | all 9 properties held; 0 failures |
| Deep tier (play seeds 1000001 to 1002000) | 2 000 | all 9 properties held; 0 failures; 739 sessions refused a mean |

### 2. Playtest findings  (middle loop, LLM personas)
Source: playtest-director, three separate instances: the curious player (1280 × 800), `five-minutes-phone`
(390 × 844 with touch, also 360 × 740) and `number-averse` (1280 × 800, also 768 × 1024). Each played the
served `dist-web/` of `94e0e86` in the Casual register with only the screen's own controls, a fresh
browser context per session, and **played a blind series first**, reading no repository file until it
ended: the curious player's attempts 1 to 9, the phone persona's 1 to 8 and `number-averse`'s 1 to 8. The
harness placed `CLAUDE.md` in each director's context; none opened it, and it says nothing about stage 1's
screens or verdicts.

**How every row replays.** Every press is on `stage-1-first-call` at the base rung (4 u), judged on
tuning-20260730 (seed 20260730, 50 replications) and, when the tuning batch meets the goal, on
holdout-20260731 (seed 20260731, 50 replications). The watched crowd is tuning replication 0, seed
16878484666841983707. The page shows no seed.

**What the evidence is.** Each playtester re-derived its presses with `stageSessionConfigFor`, core's
`runSimulation` and a paired t over the same 50 replications, and **every interval the page printed,
every split line included, matched to the printed digit** (the phone persona found three bounds a
hundredth apart at a half-cent rounding boundary). The integrator computed the ranking contrasts below
with the same tools on the tuning crowds. Wall-clock figures are contended and no row rests on one. Every
persona premise is unmeasured (`docs/23` § 1.5); this is agent evidence about legibility.

**Who made the two-change presses.** Ten blind two-change presses were made. The curious player made
its three itself; the phone persona and `number-averse` would each have left after their third press,
once the stage had cleared, so their seven are the director's, made blind in the persona's voice.

#### Cycle 2's pass condition, judged

Written in `CYCLE-2.md` § 3 and R10 amendment 8, before Delta B was built. **Four of its five clauses are
met; clause 5 is not, by one ranking.**

| Clause | Result | Evidence |
|---|---|---|
| 1. Felt-but-null count 0 | **Met: 0** | Cycle 2's X1 press (`eta` with forecast parking) now reads "the dispatcher helps worst waits only, no effect on average wait" (phone, attempt 7), which is what its split line resolves |
| 2. No persona says it cannot split two changes | **Met** | None did. Three asked how the lines relate to each other and to the headline (X2, X3) |
| 3. Every change credited on a measure is one its split line resolves there | **Met, 10 of 10 presses** | Every credit names a measure its line resolves |
| 4. Outcome stated correctly after every two-change press; `number-averse` and the phone persona at 390 × 844 also name the deciding measure | **Met, with one reading stated** | Outcome 10 of 10. The phone persona named the deciding measure on 4 of 4. `number-averse` named average wait on 3 of 3, which was ahead each time, but on two of them the 95th-percentile wait was ahead too and went unnamed. Either measure alone clears under the judge's rule, so this is read as incomplete and not a miss, and § 3's fallback is not taken; a stricter reading would count two misses |
| 5. A ranking of one press's two changes holds on the paired interval of the two one-change arms | **Not met: 1 misreading** | X1 below. The other rankings hold (table) |

**The rankings, against the paired contrast** (parking's effect minus the standing order's, which is the
paired difference between the two one-change arms; tuning-20260730, 50 replications, seconds):

| Press | Ranked | Average wait | 95th-percentile wait | Door-to-door | Holds? |
|---|---|---|---|---|---|
| `eta` (or `fairness-first`) with mid-zone | parking above order on wait (curious 4, 9; phone 5; `number-averse` 5, 7) | −2.430 [−3.805, −1.055] | −0.131 [−2.709, +2.446] | −4.192 [−5.617, −2.767] | yes, on average wait |
| `nearest-car` with mid-zone | parking far above order (curious 7; phone 6; `number-averse` 8) | −5.662 [−7.462, −3.862] | −9.081 [−12.958, −5.204] | −8.915 [−10.939, −6.891] | yes |
| `eta` with forecast | parking above order, "closer than before" (phone 7) | −0.907 [−2.015, +0.201] | +0.414 [−1.871, +2.699] | −2.660 [−3.988, −1.332] | **no on average wait**; yes on door-to-door only |
| `fairness-first` with lobby | no ranking (phone 8) | | | | nothing to check |

`number-averse` also ranked the standing order above the parking on energy on every press, which the
paired drive-work contrast bears out (+149.1 kJ [+120.3, +178.0] with mid-zone beside `eta`).

#### Mastery, re-judged on cycle 3's fresh crowds (§ D1624)

Each persona's blind attempt *k* was re-judged with the game's own judge on batch *k* of stream
`mastery-c3`. The harness cuts each series at its first attempt after reading the tree.

| Persona | Attempts judged | Slope on fresh batches [95 %] | Paired against the page's batch | Fresh verdict differs |
|---|---|---|---|---|
| curious player | 1 to 9 | +0.050 [−0.107, +0.207], flat | −0.050 [−0.149, +0.049], flat | 1 of 9 |
| five-minutes-phone | 1 to 8 | −0.048 [−0.260, +0.165], flat | −0.119 [−0.302, +0.064], flat | 2 of 8 |
| number-averse | 1 to 8 | +0.095 [−0.068, +0.258], flat | −0.036 [−0.175, +0.104], flat | 1 of 8 |

Every slope is flat again, on a stage each persona clears by its third press. **Every differing verdict
involves forecast parking.** Forecast parking under the shipped order clears on `mastery-c3-02` and
`-03` and not on the page's held-back batch, as it cleared on two of three fresh batches in cycle 2. The
phone persona's `eta` with forecast clears on the page's batch with a held-back bound of −0.01 s and does
not clear on `mastery-c3-07`. A held-back verdict on a move this marginal turns on which fifty crowds
judge it; that is four batches across two cycles, an observation and not an estimate.

#### Confirmed (report agrees with telemetry)
- **C1** [all three] **The split is read as the runs say.** Every credit in ten two-change presses names
  a measure its line resolves, in direction and size, energy included (the order saves drive work and the
  parking spends it). Pillar 2, positive; this is Delta B working.
- **C2** [all three] **Sizes, the null press and repeats still hold.** Every persona took a size from every
  press, the unchanged press reads "the same run every time", and repeats are identical to the digit
  across contexts and viewports. Pillar 1 and 2, positive.
- **C3** [all three] **Parking carries the clearing power.** Mid-zone parking clears under every in-budget
  standing order pressed with it, and on its own at 0 units; lobby parking clears under none. Reconfirms
  cycle 2's C4. Pillar 3, medium.
- **C4** [all three] **Differently priced standing orders produce one run.** `fairness-first` (4 u) and
  `eta` (2 u) are identical on 50 of 50 tuning replications alone, with lobby and with forecast parking,
  and on 49 of 50 with mid-zone; `capacity-aware` matches `eta` on 48 of 50. All three personas noticed.
  Reconfirms cycle 2's C5. Pillar 3, medium.
- **C5** [all three] **The stage stays calm.** The shipped setting is flat on 49 of 50 tuning runs; the
  watched crowd's queue peaks at 5 with an interquartile range of 0. Reconfirms C9 for a third cycle.
  Pillar 4, medium.
- **C6** [all three] **The goal line names no measure, and the vocabulary goes undefined** ("shipped
  setting", "drive work (proxy)", "95th-percentile wait", "par", "census", "held-back crowds").
  Reconfirms cycle 2's C7. Pillar 2, low to medium.
- **C7** [five-minutes-phone, number-averse] **A thin clear reads as certain.** The phone persona's `eta`
  with forecast clears with a held-back bound of −0.01 s under the same "Cleared." as a 4 s win, and fails
  on a fresh batch (above). Reconfirms cycle 2's X7. Pillar 2, medium.
- **C8** [five-minutes-phone, number-averse] **Layout.** No horizontal overflow at 390, 360, 768 or 1280
  wide. The goal line sits at the fold at 390 × 844 and below it at 360 × 740; the split block is the last
  item on a page three to four and a half phone screens long. Pillar 1 and 2, low.

#### Contradicted (felt ≠ measured, usually a feedback or UI defect)
- **X1** [five-minutes-phone, attempt 7] **A ranking the paired runs do not support.** The persona ranked
  forecast parking above `eta` on the wait ("parking above dispatcher, but closer than before"), from the
  two split lines side by side: parking's line resolves on average wait and the order's does not. The
  paired contrast between the two changes is −0.907 s [−2.015, +0.201] on average wait, so the ranking is
  an X3-class misreading under clause 5; it holds on door-to-door time only. Nothing on the page compares
  the two lines with each other. Pillar 2, medium.
- **X2** [all three] **The lines and the headline measure against different arms, and the page does not
  say so.** The curious player asked whether the two lines should add up (press 4's means are −3.82 s
  whole, −1.11 and −3.54 split). The phone persona read "one part worth more than the whole" on
  `nearest-car` with mid-zone (parking line −7.35 to −3.76 s beside the whole move's −4.13 to −1.08).
  `number-averse` read "Nothing came out against your setting" beside the order line's longer door-to-door
  time as a contradiction. Each is true against its own arm. Pillar 2, medium.
- **X3** [all three] **A standing order's credit depends on the parking beside it, and nothing says so.**
  `eta` alone is too close to call on average wait, shorter by 0.34 to 1.89 s with mid-zone kept, and too
  close to call with forecast kept; `nearest-car` alone is longer by 1.71 to 4.20 s and too close to call
  with mid-zone kept. Two personas read the change between presses as the same order doing different
  things. Pillar 2, medium.
- **X4** [five-minutes-phone, attempt 9, after reading the tree] **"Your two changes" after one change.**
  The persona moved only the standing order, to Operational zoning; the parking menu read "as it stands —
  in the middle of its own zone" (the persona misquoted it as "where each one last stopped"; the
  screenshot shows the correct label). The block counted the order's own parking as a second change, as
  R10 amendment 1 rules. Pillar 2, medium.
- **X5** [number-averse] **The left rail says "scenario cleared, 6 chimes" beside a "Not cleared."
  verdict** after a later press. Reconfirms cycle 2's X4. Pillar 2, low.
- **X6** [five-minutes-phone, curious player] **"Behind and ahead on nothing" was read as "behind on
  nothing".** Pillar 2, low to medium.

#### Unverifiable (taste, weight low)
- **U1** [all three] Why a second set of crowds gets a say; the verdict body is all figures, and Casual
  has no "fewer numbers" setting (`number-averse`).
- **U2** [five-minutes-phone, number-averse] Both would have left after their first clear; "a clear
  unlocks nothing" took the reason to go on.
- **U3** [five-minutes-phone] Seven taps and about twenty contended seconds before the first stage text.
- **U4** [number-averse] At 768 × 1024 the Settings report counted one page fault on the route in, a
  `ResizeObserver` loop warning, and none at 1280 × 800. Reported, not traced.

**For the meaningful-choice proxy.** The felt-but-null count is 0. No persona pressed a verb, so § 1's
player-session rate stays 0 of 0.

### 3. Design deltas  (outer loop, design-director)
One delta this cycle. The design-director subagent sized its candidates on tuning-20260730 and two fresh
seed sets of its own (fresh-77031027, fresh-88041138), and never ran holdout-20260731. The decision is
GitHub issue #645, ruling R11; R12 asks what § D372's building needs before a later cycle.

#### Delta C: set a two-change press's changes against each other on the same crowds, and say where each split line starts
- **Pillar served and how a player notices:** pillar 2, Understandable. After a press that changes both
  the standing order and the parking, the split block gains one line comparing the two changes with each
  other on the same 50 crowds (worded as R11 amendment 1 rules, a swap between the two changes with the
  verdict's own measure words, average wait first), and its heading gains a clause saying each line starts from the press
  with that one change undone, so the lines need not add up to the result above.
- **Simplicity budget:** (1) pillar 2, as above; X1's ranking meets a paired line saying the average-wait
  comparison is too close to call. (2) It adds one line and one heading clause to Delta B's block, only
  where that block already draws, and adds no verb, control, rule, screen or simulation; it removes the
  one place the page invites comparing two separate intervals. (3) It uses the verdict's sentence shape
  and formatter, and a player who changed one thing never sees it.
- **Track:** Casual.
- **The change:** code. `campaign/judge.ts#stageSplitOf` gains a builder over the split batch's two
  one-change arms, which already ran on the press's 50 tuning crowds, so the contrast is their paired t on
  common random numbers and costs no run. It words the line by `comparisonSentence`'s rules (average wait
  first, every other resolved wait or observation row with its size, the unresolved rest in one clause),
  with no bar word, no "alone" or "on its own", and no cause; "the same run" only where every paired
  difference is exactly zero. Drive work stays out of this line, because `CLAUDE.md` forbids ordering two
  arms on energy; each change's own energy line stays. The heading of R10 amendment 3 gains its clause.
  `everyday/stagePlay.ts` and `stagePlayScreen.ts` draw the line last, in the block's existing states, and
  the honesty corpus covers the new strings.
- **Evidence:** X1 (clause 5 unmet by one ranking, −0.907 s [−2.015, +0.201]); X2 in all three personas;
  personas ranked the two changes on 9 of 10 two-change presses, and cycle 2's X3 was the same inference.
  Sizing (a forecast): the contrast reproduces § 2's table to the printed digit; on the page's own 18 two-change
  moves and six wait and observation rows, 34 of 108 contrast rows resolve on tuning, 32 of them the same
  way on both fresh sets and none the other way (corrected by R11 amendment 6 from a sizing over a
  different list).
- **How we'll know it worked:** (a) nothing judged moves: `stageVerdictsHold.test.ts` unchanged, the split's
  two existing lines byte-identical on every covered move, the engagement report reprints § 1, no `data/`
  file in the diff. (b) `judge.test.ts` reads every contrast bound back against the two one-change arms'
  paired-t estimate at `BATCH_METRIC_PRESENTATION.places` for the three pressed pairs in § 2's table, and
  fails a tampered sentence and "more" over an interval containing zero. (c) The held-back gate of R10
  amendments 6 and 7 extends to the contrast rows on every stage and budget in `STAGE_SPLIT_COVERAGE`:
  no contrast row resolved one way on tuning-20260730 may resolve the other way on holdout-20260731; stage
  1 at 4 u always-on, the rest once on the deep `stage-split` tier before merge; a flip goes back to the
  panel. (d) The deep honesty tier at 0 failing cases. (e) Cycle 4's pass, written now: clause 5 is met
  (every ranking of a press's two changes agrees with its contrast line, and a ranking where the line is
  too close to call is a misreading); no persona asks whether the lines should add up; the felt-but-null
  count stays 0; `number-averse` states the outcome after every two-change press, and a miss takes the
  fallback (the contrast line on average wait only) without another ruling.
- **Blast radius:** no data file, census, goal bar, survivor count or published figure moves. Test strings
  and honesty seeds move; the always-on corpus is re-measured and the `stage-split` deep tier runs once.
  One `DECISIONS.md` entry and a `docs/39` § 2 row are owed, because it amends R10 amendment 3's heading.
- **Reversibility:** one revert. Fallbacks: average wait only in the contrast line; drop the heading clause
  alone if it goes unread.

**Candidates considered and rejected,** in the design director's ranking:
1. **§ D372's failable building, deferred a third time, now for a measured reason** (question R12). On
   busier two-car candidates sized on tuning and fresh crowds, tension moved robustly (in band on 41 of 50
   crowds against 1 at 336 residents, Δ +0.80 [+0.69, +0.92] on tuning), but the base-rung survivor share
   fell below the owner-approved 0.25 floor on 5 of 10 fresh-set censuses, and a building outside
   `MATRIX_CELLS` needs a change to `benchmark/matrixCells.ts#reportWindowForBuilding`, which the
   leaderboard replay shares. The lane cannot be bounded until stage 1's floor or replication count is
   ruled.
2. Name the judged measures on the goal line (C6): cheap, low to medium, and no seeded run judges it.
3. Mark a thin clear in the headline (C7): the remedies move the judge rule or quadruple each press.
4. Fix "your two changes" after one change (X4): the trigger is R10 amendment 1's ruling, met by one
   persona after reading the tree.
5. Say that differently priced orders run alike (C4): the price schedule is owner-approved, and the ties
   disappear on a busier building.

**Rulings R11 and R12** (GitHub issue #645, § D1625). The owner's decision panel, three agent seats ruling
alone (product; statistics and cost; the player).

**R11 (3–0): Delta C approved with amendments**, the union of the seats' own:

1. **The line compares the two runs and credits neither change with "more"** (seats 1, 2 and 3). The
   seats wrote the wording three ways, and all three refuse a clause saying one change "shortened … more
   than" the other where the other change's own line does not resolve that measure the same way: on
   `nearest-car` with lobby parking both changes lengthen average wait, and on `nearest-car` with mid-zone
   the order's own line lengthens door-to-door time. The ruling takes the form all three accept, seat 3's
   swap: "Making the change to mid-zone parking instead of the change to Nearest car, on the same 50
   crowds:" followed by `measureWordsOf` unchanged over the contrast's own report, average wait first with
   its range. No "more than", no "which … more", no bar word, no "alone" or "on its own", no cause.
   `judge.test.ts` pins both `nearest-car` presses above and fails any "more than" form.
2. **One clause says drive work is left out** (seat 3), because two arms are never ordered on energy and
   "the remaining measures" would otherwise read as covering it.
3. **The heading is rewritten in the page's own words** (seats 1 and 3). It names two differences from the
   building's own setting instead of "your two changes" (which X4 met after one change of order), it drops
   "each with the other kept" because each line's lead already says what was kept, and it says the lines
   need not add up to the result above; the contrast line is outside "each line". No player-facing string
   says "press".
4. **The contrast carries its own `BatchReport`**, built from the split batch's two one-change arms, and the
   held-back gate reads its rows from that report rather than from a difference it works out again
   (seat 2). The gate stays a sign-flip gate over every stage and budget in `STAGE_SPLIT_COVERAGE`; a flip
   returns R11 to this panel with the row named. Under the all-null ceiling about 2.4 flips are possible
   over the coverage table's 1 944 contrast rows, so a lone flip is read against that.
5. **Cycle 4's pass condition** (seats 1, 2 and 3): cycle 3's clauses 1 to 4 carry over unchanged,
   including the deciding measure for `number-averse` and the phone persona at 390 × 844. A named measure
   that was ahead and suffices under the judge's rule counts as correct, and a second measure that was also
   ahead and went unnamed is reported beside it (this settles § 2's reading in advance). Clause 5 is judged
   per measure on the six rows the contrast covers: a ranking that names no measure is read against average
   wait, and a ranking where the contrast is too close to call is a misreading. A ranking on drive work is
   checked off the page against the paired drive-work contrast, reported, and never counted. No persona asks
   whether the lines should add up; the felt-but-null count stays 0. Persona-made and director-made
   two-change presses are reported separately.
6. **Corrections, made in the record** (seats 1, 2 and 3): the sizing's 18 moves counted `energy-aware`,
   which is not admitted at 4 u, in place of `zoned-uppeak`'s three, R10 amendment 10's error again; on the
   page's own list 34 of 108 contrast rows resolve on tuning, 32 of them the same way on both fresh sets and
   none the other way. § 3's example put door-to-door before average wait. The drive-work lines still sit
   side by side, so the page does not lose every invitation to compare two intervals. X1 and seven of the
   ten two-change presses were the director's, made blind after the persona would have left.

**R12 (3–0): option (b), a pre-registered search under the floor and replications as they stand.** Nothing
is built for it in this wave. The conditions, the union of the seats' own:

1. **Pre-register before any run** (seats 1 and 2): every candidate, its id, its report window, the seed
   plan and one rule that picks exactly one candidate; every result is published.
2. **Select on tuning-20260730 and at least four fresh sets declared in advance** (seat 2). A candidate
   passes only if, on every one of those sets, its tension Δ excludes zero, its base-rung survivor share is
   at least § D537's 0.25 read at § D736's approved prefix (seats 2 and 3), at least one press made with the
   two selects alone clears at the base rung (seat 3), and every stage-1 control stays live (seat 1);
   § D512's legibility, the instrument `docs/38` § 2.1 names, is measured and reported (seat 1). The floor
   and the 50 replications stay as they are (seat 3).
3. **The held-back set is read once**, by the chosen candidate's survivor regeneration (seats 1 and 2). A
   miss leaves stage 1 as it is, tries no second candidate, and returns to this panel; only then is a
   change to the floor or replications put to the owner in person, with the measured trade-off (seat 2).
4. **One declared report window for the new building** (seats 1, 2 and 3), fixed before the search, read
   through `benchmark/matrixCells.ts#reportWindowForBuilding` by both `stageRun.ts` call sites and
   `server/leaderboard/verify.ts#configFor`, with a test that every `MATRIX_CELLS` building's answer,
   `garden-apartments`' included (§ D372), and the leaderboard and challenge replays are unchanged. No
   `MATRIX_CELLS` row is added and no pin moves. The director's sizing borrowed `garden-apartments`' window,
   so its figures are not the new building's (seat 2).
5. **It merges after cycle 4's playtest** (seat 1), so no cycle tests two changes at once, as R2 ruled.
6. **Corrections** (seats 1 and 2): "cannot be bounded" overstated it, because the 336- and 360-resident
   candidates held the floor on both fresh sets (12, 10, 10 and 10 of 39 against 10); the five censuses
   below the floor came from three other candidates.

### 4. Handoff to build loop
Pending.

### 5. Owner note
Pending.
