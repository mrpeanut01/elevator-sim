# Design-cycle coordination artifact

One file per cycle, committed under `docs/design-cycles/CYCLE-*.md`. It is the shared
state the design loop passes between agents, the same role the WAVE*_PLAN.md files play
for the build loop. Every claim carries the seed or issue that grounds it, per the
repo's existing discipline (no verdict without a reproducible basis).

---

## CYCLE-1: stage 1, the first call   (2026-10-18 to 2026-10-19, Eastern)

**Track(s):** Casual
**Build under test:** `5645910` for the playtest (the site as served from `dist-web/`); the baseline
below ran on `46ecc21`, which adds the proxies and changes no simulation.
**Owner sign-off:** pending

### 1. Sim-sweep summary  (fast loop, no LLM)
Source: `elevator-sim fuzz --scenario stage-1-first-call --engagement`, which reproduces every figure
in this section. Deterministic. Every proxy is an unmeasured premise about people: no human
ground-truth set has calibrated one yet, so none is marked Measured.

**Baseline, the figures every sweep in this cycle compares against.** The arm is the stage's own
setting (`collective`, parking as it stands, no verb pressed) on `garden-apartments`, 900 s. Each seed
set has 50 replications, and the two sets are never compared with each other.

| Proxy | Seed set | Figure | Flagged by `awtIsValid` | Beside it |
|---|---|---|---|---|
| Tension band, in band | tuning-20260730 | 1 of 50 [0.004, 0.105] (flat 49, runaway 0) | 0 of 50 | AWT 16.88 s [15.73, 18.04], WT95 29.41 s [27.18, 31.64] |
| Tension band, in band | holdout-20260731 | 1 of 50 [0.004, 0.105] (flat 49, runaway 0) | 0 of 50 | AWT 15.78 s [14.71, 16.85], WT95 27.59 s [25.59, 29.59] |
| Meaningful choice, player session | n/a | 0 of 0, nothing to judge | n/a | No player presses a verb on a Scenario stage |
| Meaningful choice, engine-level baseline | tuning-20260730 | 10 of 22 [0.269, 0.653] | 0 suppressed | 22 canonical presses, none of them a player's choice |
| Mastery slope | holdout-20260731 | no attempts yet | n/a | Needs the playtesters' attempts |

Intervals on a single arm's `k of n` are Wilson score intervals at 95 %. The tension band in force is
stage 1's own override in `data/engagement-bands.json`: flat below a swing of 1.0 person, in band from
1.0 to 6.0, runaway above 0.50 persons a minute. Swing is the interquartile range of the 120 recorded
queue samples a run's own saturation test is fitted on.

The engine-level baseline judges one press of each replayable verb against the empty log, paired on
replications 0 to 49 of the tuning set. A press is meaningful when its 95 % paired interval on ΔTTD
excludes zero, in either direction.

| Verb | Meaningful | Wilson 95 % | Resolved presses (ΔTTD, seconds, 95 %) |
|---|---|---|---|
| `park-cars-lobby` | 1 of 1 | [0.207, 1.000] | +1.357 [+0.677, +2.036], worse |
| `spread-cars` | 1 of 1 | [0.207, 1.000] | −4.340 [−5.704, −2.976], better |
| `switch-dispatcher` | 1 of 12 | [0.015, 0.354] | to nearest-car +0.789 [+0.254, +1.323], worse; 9 of the 12 targets are exact ties |
| `adopt-dispatcher` | 7 of 8 | [0.529, 0.978] | to zoned-uppeak −1.554 [−3.018, −0.090], better; six targets worse, from +1.582 to +6.627 |

`answer-incident`, `equipment-change` and `building-change` are not yet replayable from a session's
verbs and seed (§ D486 rules the first permanent; the other two carry no budget), so their three
canonical presses are counted apart and enter neither side of the rate.

| Knob swept | Range | Metric | Best | CI excludes 0? | Seed set |
|---|---|---|---|---|---|
| none yet | | | | | |

**Named gap for the mastery slope.** The spec asks for attempts on fresh, disjoint holdout seeds in
order, and the game judges every attempt at a stage on the same fixed holdout batch
(holdout-20260731). A slope over real attempts could therefore be a player slowly learning that one
batch. No seed scheme has been invented to close this; it is a design question for this cycle.

One-line read: stage 1 is calm by authoring, with the queue empty most of the time and no rider over a
minute at baseline, so the tension band reads flat on 49 of 50 runs in both sets, and an interquartile
swing barely separates runs on a trickle stage at all.

### 2. Playtest findings  (middle loop, LLM personas)
Source: playtest-director, run as three separate instances so no persona borrowed another's context:
the curious player (7 sessions, 1280 × 800), `five-minutes-phone` (13 sessions, 390 × 844, also 360
and 320 wide, clicks only) and `number-averse` (14 sessions, 1280 × 800). Each played the served
`dist-web/` of `5645910` in the Casual register, using only the screen's own controls, in a fresh
browser context per session. The integrator merged findings that more than one persona reached and
spot-checked the ones marked as such.

**How every row replays.** Every press is on `stage-1-first-call` at the 4 u rung, judged on
tuning-20260730 (seed 20260730, 50 replications) and, when the tuning batch meets the goal, on
holdout-20260731 (seed 20260731, 50 replications). A press replays from stage id, move and rung; the
page itself shows no seed. The watched crowd is tuning replication 0, seed 16878484666841983707. Moves
are named by what changed: *unchanged* (`collective`, parking as it stands), *lobby*, *forecast*
(`predicted-demand`) and *mid-zone* (`zone-center`) parking, and the standing orders by their ids.

**What the evidence is.** Each playtester re-derived its verdicts with `stageSessionConfigFor` and
`core`, and every comparison agreed with the page on direction and on which measures resolved (the
curious player on every verdict it compared, `number-averse` on 10 of 10 presses, the phone on 8 of
8). Wall-clock figures came from a contended container and no row rests on one. Every persona premise
is unmeasured (`docs/23-audiences-and-core-loop.md` § 1.5). The phone persona read a test naming the
clearing move before its third session, so its later picks were not blind.

**Confirmed** (report agrees with telemetry)
- **C1** [all three] **No verdict says how much.** "Behind" and "ahead" carry no size, and no wait appears in
  seconds anywhere on the Casual stage screen. Lobby parking (+1.49 s on a 16.88 s mean wait) and
  `nearest-car` (+2.95 s, and +7.11 s at the 95th percentile) get the same sentence shape, and
  "Cleared." reads the same for mid-zone parking (holdout upper bound −1.94 s) as for a marginal clear
  (−0.01 s). Read against `docs/23` § 1.4, where a figure may be reworded and may not be lost. Seed:
  both sets. Pillar 2, medium.
- **C2** [all three] **An unchanged press cannot be told from a change that did nothing.** It prints "no
  measure separated the two settings", while both arms are the same run (every difference exactly
  0.000). `collective-enroute` prints the same sentence, and an unchanged re-run returns a
  byte-identical verdict with no notice. The on-arrival primary, "Run the stage", makes this the
  likeliest first press (phone). Seed: tuning. Pillar 2, medium to high.
- **C3** [all three] **The consent card covers the game until it is answered.** At 1280 × 800 it pushes the
  parking select, the control the brief points to, behind the run bar. At 390 × 844 it is 40 % of the
  screen, and at 360 × 740 it is 50 % with its own third paragraph clipped. That is a launch layout
  commitment at phone width (`docs/31-support-matrix.md` § 2). Every control stays reachable by
  scrolling. Pillar 1 and 2, medium.
- **C4** [all three] **The retry loop runs through a long scroll.** After a press the page jumps to the verdict,
  and the dials sit about 670 px above on a desktop and 1 200 to 1 500 px above on a phone, with only
  the verdict's heading above the bar on arrival. Pillar 4, medium.
- **C5** [all three] **One parking choice dominates, and most standing orders are inert or worse.** Mid-zone
  parking clears under 7 of 7 in-budget standing orders and lobby parking under 0 of 7 (the curious
  player's census, which reproduces the page's "12 ways through at 4 u"). `zoned-uppeak` at 2 u beats
  every other in-budget dispatcher on both sets, under a label that gives no hint. `eta` and
  `fairness-first` are bit-identical on tuning, so the extra 2 u buy nothing; § 1's engine baseline
  shows the same tie. `nearest-car`, the plainest name on the list, loses on all three measures.
  Pillar 3, medium.
- **C6** [curious player, five-minutes-phone] **The stage is calm before anything changes, and reads that
  way.** "Nothing looks wrong" and "mostly empty, nothing builds" agree with the tension band: the
  watched crowd's queue has an interquartile swing of 0 (flat, below the 1.0 edge), and the baseline is
  flat on 49 of 50 runs in both sets (§ 1). No boarded rider waited over a minute at baseline (0 of 665
  tuning, 0 of 619 holdout), and a run carries about 13 riders against the "120 people" the page lists.
  The building is not drawn at all before the first press. Seed: both sets, watched crowd as above.
  Pillar 4, medium.
- **C7** [number-averse, confirmed in source] **Two screens disagree about buying a wider budget, and the
  purchase is out of reach.** The stage page sells the 24 u rung for 20 chimes ("Short by 14 chimes"
  after a clear) while the hub's footnote says "Nothing here sells a stage a wider budget yet"
  (`packages/viz/src/everyday/scenarioModel.ts:335`). One clear pays 6 chimes, and the stage needs no
  wider rung, since 12 ways through exist at 4 u. Pillar 1 for the unreachable verb, pillar 2 for the
  contradiction.
- **C8** [curious player, five-minutes-phone] **The watched demonstration carries no clock and no wait
  readout.** On a phone the two panes stack into an 887 px block, so both are never on screen at once.
  Pillar 4 and 2, medium.
- **C9** [five-minutes-phone] **"Start playing" does not start playing.** It opens a walkthrough, then a mode
  list: four screens and five taps, against one tap on the lobby's "Main menu", a 68 × 26 px text link.
  Pillar 2, medium.
- **C10** [five-minutes-phone] **On the lobby's CALL route the door sequence is most of the way to a first
  verdict**: a countdown, a floor panel and an extra "Step out" tap, seven inputs against six by the
  menu link. Pillar 4 and 1, medium.
- **C11** [five-minutes-phone] **The selects' current values are clipped** at 360 and 390 wide ("Conventional
  collective, as the buildi…"). A layout commitment. Pillar 2, low.
- **C12** [all three] **What holds.** Every verdict is true by its own rule. Both running totals reach their
  batch's 50 (the holdout line is replaced by the verdict at 46 to 49). The over-budget refusal reads
  clearly, and a free clear exists. No internal identifier reaches the player's text. Nothing overflows
  horizontally at 320, 360 or 390 wide, and no session logged a page error. Pillar 1, 2 and 4, positive.

**Contradicted** (felt ≠ measured, usually a feedback or UI defect)
- **X1** [all three] **The mixed verdict reads as a contradiction while the engine is consistent.** For forecast
  parking, "Every goal met on the stage's own crowds, and not on the ones held back." sits above "Not
  cleared", and one paragraph is printed twice; while the holdout batch runs, the status line already
  says "Every goal met". The persona felt a win, then "nearly there". The numbers: better on tuning (mean
  wait −1.187 s [−2.034, −0.339]), the same direction but unresolved on holdout (−0.499 s [−1.198,
  0.199]). It is the verdict for the most natural first pick. Seed: both sets. Pillar 2, high.
- **X2** [curious player, number-averse] **"Cleared" hides what the clear cost.** Mid-zone parking spends
  +142.6 kJ [+113.8, +171.4] more energy on tuning (+43 %), and `zoned-uppeak` +99.7 kJ (+30 %). The tail
  also lengthens: riders over a minute go from 0 to 2 on tuning and 0 to 1 on holdout, and the longest
  wait from 58.3 to 67.4 s. None of this is on the Casual page. The engine's own intervals do not
  resolve against the move, so the verdict is true by its rule, and energy stays an axis. Pillar 2,
  medium.
- **X3** [curious player, number-averse] **The watched crowd misleads in both directions.** For
  `fairness-first` the two panes were identical in 146 of 146 samples, because replication 0 comes out
  the same in both arms, while over 50 crowds door-to-door is +1.90 s [+0.82, +2.99]. For the clearing
  moves replication 0 is the 5th most favourable of 50 (−9.12 s of mean wait against a mean of −2.71 s).
  For forecast parking the 95th-percentile wait is 29.31 s in both panes. Seed: tuning replication 0.
  Pillar 2 and 4, medium.
- **X4** [five-minutes-phone] **"No sign of progress" while the progress line exists.** "Running k of 50" is in
  the page throughout the run, but on a phone its top is at 951 px against a visible window of 50 to
  689 px. Pillar 4 and 2, medium.
- **X5** [five-minutes-phone] **The persona credited the standing-order switch for a clear the switch did not
  make.** `eta` alone is not ahead on mean wait (−0.28 s [−0.96, +0.40]) and is behind on door-to-door
  time. With parking held at forecast, the switch's own effect on mean wait is unresolved on both sets
  (−0.58 s [−1.24, +0.09] tuning, −0.26 s [−0.54, +0.02] holdout), and on holdout it is behind on
  door-to-door time (+1.34 s). The page offers no per-dial attribution. Rests on the persona's reasoning. Pillar 2, medium.
- **X6** [curious player] **"A fit to fifty crowds" states a mechanism nobody measured.** The holdout rule
  stands; the sentence explaining a holdout miss does not. Pooled over both sets (post hoc, not the
  page's rule, no verdict drawn), forecast parking's mean-wait gain is −0.843 s [−1.387, −0.299].
  Pillar 2, medium.
- **X7** [curious player, five-minutes-phone] **Time labels read as the player's time.** "13-23 min a case" and
  "2-4 min a day" sit on the Scenario floor and hub, while a stage-1 press answers in seconds.
  Premise-dependent. Pillar 1 and 4, low.

**Unverifiable** (taste; weight low)
- **U1** [all three] The vocabulary load: "shipped setting", "census", "par", "held-back crowds",
  "95th-percentile wait", "the interval on the difference excludes zero". The curious player's scan
  found fourteen such terms on the pre-run page. The plain spine phrases `docs/23` § 1.4 names ("away
  inside a minute", "the longest anybody stood") appear on no stage-1 screen.
- **U2** [all three] The lift lobby as the front door: charming to two personas, in the way of the phone.
- **U3** [curious player, number-averse] "6 chimes" and "It unlocks nothing" gave no felt reward.
- **U4** [number-averse] The stage page reads like a form, with nothing that feels like a game before Run.
- **U5** [curious player] The tutorial teaches "spread the cars out" and the stage calls the same change "in
  the middle of its own zone"; whether a real player links them is untested.
- **U6** [curious player] "Most of the wait is decided before anyone presses a button" is a mechanism
  sentence nobody measured.
- **U7** [five-minutes-phone] The hub says "read the letter", and stage 1 has no letter.
- **U8** [five-minutes-phone] Touch targets of 27 to 35 px tall, untested, because touch is out of scope.

**For the meaningful-choice proxy.** One persona belief is on record: the phone persona believed the
standing-order switch mattered, and it did not resolve. That is one *felt but null* entry. No persona
pressed a verb, so § 1's player-session rate stays 0 of 0.

### 3. Design deltas  (outer loop, design-director)
One or two only. Each is issue-shaped and ready for implementation subagents.

#### Delta A — <imperative title>
- Pillar served + how a player notices:
- Simplicity budget (3 answers):
- Track:
- The change (prefer a `data/*.json` move; name any `packages/` module if code):
- Evidence (finding id / sweep metric):
- How we'll know it worked (metric + seeded comparison, verdict must carry a CI that excludes 0):
- Reversibility:

### 4. Handoff to build loop
- Branch / worktree: <name>
- GitHub issue opened: #<n>
- Required CI gates: <the binding checks>; long sim/experiment jobs: optional
- DECISIONS.md entry needed on merge: yes/no — <D-id if known>

### 5. Owner note
What changed, what was deliberately left alone, the single biggest open design risk.
