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
Pending.

### 3. Design deltas  (outer loop, design-director)
Pending.

### 4. Handoff to build loop
Pending.

### 5. Owner note
Pending.
