# Wave 13 — the building-behaviour program

**Opened 2026-07-31.** The board for `docs/14-building-behaviour-contract.md`, steps 0–6.

Wave 13 is different in kind from waves 1–12. Those closed findings, built a design handoff, and
audited what was already there. This one **adds behaviour to the simulator**, and behaviour is the
thing this repository is worst at adding safely — its signature defect has landed eleven times in
code and once in `data/`, and every instance was a behaviour that was configurable, unit-tested in
isolation, and called from nothing shipped.

So the wave's own rule is `docs/14 § 5` criterion 2, which is the roadmap's standing requirement
pointed at a knob:

> **Move the control and require the run to change** — compared on the legs, not on a window
> statistic. A control that fails this is deleted, not documented.

## 1. What governs the whole wave

`docs/14 § 0`, quoting [§ D151](DECISIONS.md) § 7, written before the last traffic-model change
landed:

> It must be opt-in and byte-identical when unused. Every existing published number must reproduce
> exactly; a traffic-model change that moves a shipped figure invalidates far more than this phase.

The blast radius is **981 pinned estimates** in `benchmark/published.ts`, plus the trace and result
identity guards in `core/src/traffic/mixIdentity.test.ts` and `transportIdentity.test.ts`.

**This is the blocking criterion. It is not weakened, and a pin is never edited to fit a changed
tree.** That is precisely what [§ D196](DECISIONS.md)/[§ D201](DECISIONS.md) cost a wave to unpick:
a pin correct on one tree and wrong on another, with no way to tell which was right.

## 2. The task tree

| ID | Task | Branch | Depends on | State |
|---|---|---|---|---|
| **T1** | Traffic seed separation (§ 1.1) | — | — | ✅ **landed** `d52f347` |
| **T0** | Sky-lobby / escalator authoring (§ 5a) | `feat/w13-sky-lobby-authoring` | — | 🔄 in progress |
| **T2** | `trafficModel: 'v2'` + `batchSize` stream (§ 1.3) | `feat/w13-traffic-model-v2` | — | 🔄 in progress |
| **T3** | Mass control, group-size curve (§ 2.1–2.2) | `feat/w13-traffic-variance` | T2 | ⬜ blocked |
| **T4** | Day variation (§ 2.3) | `feat/w13-day-variation` | T3 | ⬜ blocked |
| **T5** | Patience, lobby crowding, stairs (§ 3) | `feat/w13-passenger-behaviour` | T2 | ⬜ blocked |
| **T6** | Teaching surface (§ 4) | `feat/w13-teaching-surface` | T3, T4 | ⬜ blocked |

### Dependency map

```
T1 ✅ ──────────────────────────────────────┐
                                            │
T0 ──── (independent: viz only, no draw) ───┤
                                            ├──► integration/wave-13 ──► main
T2 ──┬── T3 ──── T4 ──── T6 ────────────────┤
     └── T5 ─────────────────────────────────┘
```

**T0 ∥ T2 is the only genuinely safe parallel pair at open.** T0 is `packages/viz` and moves no
draw; T2 is `packages/core` and moves every draw it is allowed to. They are file-disjoint. Nothing
else may run beside T2, because T2 is the one change that can move a published number and there is
no value in discovering that alongside a feature.

### Merge order

`T0` and `T2` merge in either order — disjoint files. **T2 merges alone and the full suite runs
before anything else is merged on top of it.** T3–T6 merge in dependency order, full suite after
each.

## 3. Why the sequence is forced

From `docs/14 § 6`, restated with the reason rather than the order:

- **T2 before T3** because a group-size curve is *unimplementable* while group size draws from
  `arrivals`. Any change to the curve — even one preserving the mean — consumes a different number
  of draws and shifts every subsequent arrival instant. Not a little: completely.
- **T4 after T3** because day variation's failure mode is statistical, not functional, and it can
  only be measured once there is variance to measure it against.
- **T6 last**, and this is the one sequencing decision with a measurement behind it.
  [§ D156](DECISIONS.md) found that what the learned policy learned was a *busy/idle schedule*
  rather than a traffic-pattern selection — because the shipped demand template varied the **level**
  and never the **directional split**. The policy had nothing to discriminate on, so it learned the
  only signal present. **T3 and T4 are what supply the signal.** Building the teaching surface
  before them would earn a fourth refusal for the same reason as the first three.

## 4. Definition of done

A step is done when its criterion passes, not when its code exists.

1. **Byte-identity when unused** — all 981 pins, both identity digests, on both CI platforms.
   Blocking.
2. **Every control moves the run**, on the legs.
3. **Day variation is inside the CRN pairing** — paired variance no larger than without it.
4. **Abandonment and stairs are reported beside AWT, never folded into it** — the [§ D106](DECISIONS.md)
   energy rule, applied to a second axis. A configuration whose AWT improves while its served-leg
   count falls must be *shown* doing so.
5. **The learned dispatcher clears the standard bar or is refused.** A fourth refusal is a permitted
   outcome and is published like the first three.
6. **No new dead seam** — every unit names its non-test caller, mechanically.

## 5. Risks specific to this wave

| # | Risk | Mitigation | Escalation trigger |
|---|---|---|---|
| **W13-R1** | **A pin moves under T2 and is edited to fit.** The § D196 failure, repeated. | Lane agents are forbidden `published.ts`; a moved pin is a finding, never a value. | Any diff touching a pinned estimate in a lane branch. |
| **W13-R2** | **A new tunable is authored, schema-valid, tested in isolation and consulted by nothing.** The eleven-times defect, and §§ 2–3 are almost entirely new tunables. | Criterion 2 per knob, on the legs; the `core` dead-code audit now covers all fourteen directories. | A control whose test asserts on emitted config rather than on a run. |
| **W13-R3** | **Abandonment flatters AWT by construction** — it removes the longest waits from the sample. A config abandoning 30 % of riders posts a superb AWT. | Criterion 4; `awtIsValid` gains a fifth ground. | Any AWT improvement co-occurring with a served-leg fall, unreported. |
| **W13-R4** | **Day variation leaks outside the shared trace**, inflating paired variance and destroying the power CRN buys. | Criterion 3 measures exactly this. | Paired SE rising when day variation is enabled. |
| **W13-R5** | **Two traffic models is a fork that never converges.** `v1` outlives its reason and every later feature is written twice. | `v1` is deleted when the last figure depending on it is re-derived under `v2` **and the re-derivation is published as a comparison** — not before. | A third model version, or a `v1`-only feature. |
| **W13-R6** | **Lobby crowding is a feedback loop and can destabilise a run that was stable.** | This is a *finding*, not a bug; the saturation detector exists to catch and report it. | A run that saturates under crowding and reports a mean anyway. |

`RISKS.md` R24 (a search tool that fails silently), R25 (lane ownership partitions editing, not
committing) and R26 (a fixture-only suite cannot prove a mechanism is reached) are live and carried
into this wave. **R25 is answered by the worktree-per-lane policy actually being followed this
time** — one worktree, one branch, one agent.

## 6. Status

Live board is [`AGENT_STATUS.md`](AGENT_STATUS.md) § Wave 13. Decisions land in
[`DECISIONS.md`](DECISIONS.md) as they are made. Coverage lands in
[`TEST_MATRIX.md`](TEST_MATRIX.md) § Wave 13.
