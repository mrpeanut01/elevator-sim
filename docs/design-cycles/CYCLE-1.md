# Design-cycle coordination artifact

One file per cycle, committed under `docs/design-cycles/CYCLE-*.md`. It is the shared
state the design loop passes between agents, the same role the WAVE*_PLAN.md files play
for the build loop. Every claim carries the seed or issue that grounds it, per the
repo's existing discipline (no verdict without a reproducible basis).

---

## CYCLE-<n> — <short title>   (<date>, Eastern)

**Track(s):** Casual | Engineer | both
**Build under test:** <git sha of the built site>
**Owner sign-off:** pending | <date>

### 1. Sim-sweep summary  (fast loop, no LLM)
Source: `npm run sim -- tune …`, experiments output. Deterministic.

| Knob swept | Range | Metric | Best | CI excludes 0? | Seed set |
|---|---|---|---|---|---|
| e.g. patience decay | … | AWT on holdout | … | yes/no | tuning/holdout ids |

One-line read: what the numbers say about balance before any human-feel judgment.

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
