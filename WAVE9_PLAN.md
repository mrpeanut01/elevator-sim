# Wave 9 — drive the debt that touches simulation or play to zero

**Opened:** 2026-07-29 · **Base:** `3fec814` · **Suite at open:** 209 files, 3903 passed, 9 skipped

## 0. The filter, and what it excludes

The instruction is *"bring the debt down near zero, with the goal of no debt impacting game play or
simulation."* That filter is doing real work — it is not "close every row." Applied to
[`docs/07`](docs/07-handoff.md) § 8 it sorts about twenty live items into three piles, and **only
the first two are this wave's**.

**Pile A — changes what the simulation computes.** A wrong number here propagates into every
published result.

**Pile B — changes what the player sees or can do.** A defect here is visible, and several are
visible *precisely when the picture matters most*.

**Pile C — internal hygiene.** Real debt, correctly recorded, and **out of scope by the
instruction**: the liveness sweep's unprobed `selection.*` rows, `published.test.ts`'s categorical
class, `C5`'s `'z'` label, `estimateMean`'s zero-variance half-width, `prepositionPlan`,
`stats/` consolidation. None of them can produce a wrong simulation result or a wrong screen. They
stay in § 8, and this document says so rather than letting them look forgotten.

Two rows are **not debt at all** and are deliberately left: *the Level-1 panel does not clear the
Phase 6 gate on `mixed-use-high-rise`* and *the mixed-use replication margin is tight* are
**measured results and standing constraints**. Deleting them would delete evidence.

## 1. Pile A — simulation

| ID | Item | Why it is Pile A |
|---|---|---|
| **T70** | **`DemandPhase` cannot vary the directional split within a run** | The single item that can move a **phase verdict**. [§ D156](DECISIONS.md) measured that the condition learned selection exists to exploit does not occur at any shipped operating point; this is the capability that creates it. [§ D151](DECISIONS.md) § 7 already fixed three constraints on it **in advance**. |
| **T71** | **The `G → 2` lobby leg is charged as an elevator leg** | The **largest modelling debt in the repository**. `core` has no escalator and no stair, so on `vertical-city` **110 of 593 journeys gain a leg** the hardware would not pay for. It is why the double-deck WORSE-under-`eta` row reads as an **upper bound on the cost** rather than the cost. |
| **T72** | **A zone cannot be changed mid-run** | The dispatcher half closed in [§ D141](DECISIONS.md); **zoning still has no mechanism**. Operational zoning is a shipped concept the simulation cannot exercise over time. |
| **T73** | **`nearest-car` is a default in places and is unusable on a fifth building** | The only profile that saturates, the binding ceiling at five cells — and still the first thing a newcomer runs in places. A default that saturates teaches the wrong lesson on contact. |

## 2. Pile B — play

| ID | Item | Why it is Pile B |
|---|---|---|
| **T74** | **`✗` vs `✖` collide, and co-occur systematically** | Near-identical at 12 px on the same landing row. **A call nobody answers is exactly a call whose riders pass the abandonment horizon** — so they appear together *when the building is in trouble*, which is when the picture is the whole point. Latent, not observed ([§ D159](DECISIONS.md)). |
| **T74** | **The mood headline overprints bank labels by 10 px** | Every multi-bank building. Confirmed arithmetically *and* visually. The fix is `headerPx` and the layout under it. |
| **T74** | **Three panels compete for one column** | The stage fell to **149 px for a 30-floor building** before W7b shortened its note. Measured, not estimated. |
| **T75** | **The viewer cannot enable a selector** | `viz/dev/data.ts` bundles only the profile array, never the file-level block, so a selecting profile is refused **by name** in the viewer while `run`/`compare`/`tune` can run it ([§ D153](DECISIONS.md)). |
| **T75** | **W4's U7 half is blocked on a `core` fix** | Two of ten discovered schemas do not collect: `traffic.arrivalRatePctPop5min` declares a `null` default and `sim.drainGraceS` a **log** scale over a range starting at 0. The form **draws the refusal**; the fix is in `core`'s declarations ([§ D134](DECISIONS.md)). |
| **T76** | **Phase 9's U2 mode split, and the live weight editor** | Only one mode exists, so § 4's **mode-parity criterion is untested rather than met**; and a campaign stage's player-move is a *shipped profile*, which is why **four of seven stages need an authored weight vector to clear** ([§ D161](DECISIONS.md)). |
| **T76** | **The structural-refusal reason is prose** | Computed and correct, keyed on a call id `VizLeg` does not carry, so it **cannot be joined to a leg** ([§ D134](DECISIONS.md)). |

## 3. The decision that must be dated before T70's measurement

[§ D151](DECISIONS.md) § 7 constrained the phase-varying template in advance and then **deliberately
left one question open**:

> Whether such a cell may accept Phase 6c at all is deliberately left **open** here and must be
> decided in its own entry, dated before that measurement.

**That entry is § D162, and it is written before T70 lands.** The question is real: a template
authored to contain the thing selection exploits is, on its face, a test constructed to pass. The
answer must not be settled by whoever likes the result.

## 4. Parallelism and conflict surface

Pile A's T70/T71/T72 all touch `core`, and T70 and T71 both touch `traffic/`. **They do not run
concurrently.** T73 is `data/` plus call sites. Pile B is `viz`, disjoint from Pile A.

**Round 1 (parallel):** T71 (`core` transport mode) · T73 (`nearest-car` defaults) · T74 (the three
viz defects) · T75 (viewer selector + the `core` schema declarations).
**Round 2 (after T71):** T70 (phase-varying split) · T76 (U2 mode split + weight editor).
**Round 3 (after T70):** T77 — re-measure Phase 6c under § D162, at a mix-varying cell.

T70 goes in round 2 rather than round 1 **only** because it shares `traffic/` with T71, and T71's
change is the one that alters published numbers.

## 5. The thing this wave must not do

**T71 will move published figures**, because it changes what the simulation computes. That is
legitimate and it is not a licence: every moved figure is **re-derived from the run that produced
it**, the move is stated with its cause, and no verdict is re-read in the direction that flatters
it. `CLAUDE.md` § *A published number goes stale the same way* is the rule, and a model change is
exactly the case it was written for.

## 6. Definition of done

- [ ] Every Pile A and Pile B row closed, or left open **with a measurement and a stated reason**.
- [ ] Pile C untouched and still listed — not silently dropped.
- [ ] § D162 dated **before** T77's first measurement.
- [ ] Every moved published figure re-derived and its cause stated.
- [ ] `tsc -b` clean; full suite green; the viewer **driven**, not read.
- [ ] `docs/07` § 8 agrees with the code, checked rather than assumed.
