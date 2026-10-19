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
Source: playtest-director. Each row carries its seed.

**Confirmed** (report agrees with telemetry)
- [persona] <finding> — screen/metric: <ref> — seed: <seed> — pillar severity: <1-4>

**Contradicted** (felt ≠ measured — usually a feedback/UI defect)
- [persona] <finding> — what they felt vs what telemetry shows — seed: <seed>

**Unverifiable** (taste; weight low)
- [persona] <finding> — labelled taste

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
