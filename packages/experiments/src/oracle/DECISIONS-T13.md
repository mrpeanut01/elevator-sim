# T13 — decisions taken while closing the correctness oracle across all five buildings

Phase 8, analytical cross-validation and physics-verification tracks. Every decision here is one
the existing docs did not cover; `CLAUDE.md` § Working agreements asks for those to be written down
rather than left in a commit message, and this task may not edit `docs/`.

---

## D1 — The simulated side runs **one bank at a time**, as an isolated building

**Decision.** `upPeakCase.ts`'s `isolateBank` rebuilds a bank as a building of its own — its served
floors at their authored heights and populations, its cars verbatim, its terminal flagged
`isEntrance` with its population zeroed — through `parseBuilding`/`resolveBuilding`. The
reconciliation simulates that.

**Why not simulate the whole tower.** The closed form describes *one group, one zone, every
passenger boarding at one terminal*. On Midtown Office and Garden Apartments the building is the
bank and the question does not arise. On the three new buildings it does, and on one of them there
is no answer:

- **Measured**: Vertical City, whole building, pure up-peak, offered at the rate that saturates
  `zone-1-local` (≈23 % of population per 5 min) — `SimulationError: did not deliver everybody:
  55 of 4907 journeys were still in the system` at the drain deadline. The shuttle saturates far
  harder than the local banks, so there is **no rate** at which the whole tower reproduces the
  closed form's operating point for any one of its banks.
- Mixed-Use High-Rise has the same shape one degree less severely: a residential journey is two
  legs through a sky lobby, and the shuttle is the binding constraint on both.

**Why it is not a fudge.** Three checks:

1. It is a **no-op on the two buildings whose answers are known**. Midtown's isolated closed form
   is bit-for-bit the whole building's: RTT 149.543 s, INT 37.386 s, %POP 6.007.
2. It uses **no code path the shipped loader does not have**. Same technique as the Phase 2 gate's
   knock-out arms, which impose the closed form's simplifications through per-car config.
3. The reconciliation **reproduces the two published residuals** (D8 below). If isolation had
   changed the question, those would have moved.

**Cost, stated.** The isolated building has no inter-bank contention, so the measurement is of the
group rather than of the tower. That is the closed form's own scope, and the tower-level question
— what a sky-lobby transfer costs end to end — is a Phase 6 destination-dispatch question that no
round-trip formula answers.

---

## D2 — `tp` for a `mixed-use` bank is the mean of that bank's own cars

`elevator-specs.json → timing.passengerTransferS` has office, residential and hotel rows and
deliberately **no** `mixed-use` row; `analytical/upPeak.ts` explains why. Every car of both
mixed-use towers declares `passengerTransferS` for exactly this reason, and `resolveCar` refuses to
default it. So the fallback reads the answer the reference data gives rather than inventing one.

Measured: Mixed-Use High-Rise runs 1.75 / 1.20 / 1.75 s across its three banks; Vertical City spans
{1.2, 1.5, 1.75} across seven. A building-wide figure would be wrong on most of them, which is the
defect the Phase 2 gate found on Garden Apartments — reported there as *systematically optimistic*.

---

## D3 — `U` follows onward traffic, but **not** through a bank that also serves the terminal

A shuttle's destinations are handovers: the people it lifts live beyond them. `onwardPopulationOf`
therefore adds the population of every other bank reachable through a destination floor.

The condition that is **not** obvious, and that this task added: a bank which also serves *this
bank's terminal* is skipped. Sharing a destination is not enough to make one group feed another.

- Vertical City's `zone-1-local` opens on the upper ground lobby (floor 2), which is also a shuttle
  stop — but its passengers board at G alongside everyone else and the shuttle lifts none of them.
  Without the condition the shuttle's `U` comes out **4887** (the whole building) instead of
  **2872** (zones 3–6): a 41 % understatement of `%POP`.
- The same condition keeps Secure Tower's two lobby banks independent of each other.

**Validation that this is a derivation and not a transcription:** `analytical/upPeak.ts` works
Mixed-Use High-Rise's shuttle by hand and states *"a true `U` of 1014"*. The rule is not told that
number and reaches it (260 at the sky lobby + 754 on floors 32–60). Pinned in
`bankCensus.test.ts`.

**Scope limit, checked rather than assumed:** the rule follows **one** handover.
`bankCensus.test.ts` iterates it to a fixpoint on every bank and asserts the answer does not
change, so a two-transfer building would fail there rather than be silently understated.

---

## D4 — The departure-gap bracket is computed **per bank**, not per terminal

`metrics/summarize.ts` derives one threshold across every bank serving the terminal, because it
publishes one achieved interval for the building. That is why both mixed-use towers report their
terminals `unmeasurable`: at Mixed-Use's ground lobby a shuttle can hold its doors 41.2 s while an
office-local car completes a whole round trip in 31.3 s.

A per-bank reconciliation does not need one threshold for both. Both bounds are properties of the
bank being measured, and trips are reconstructed per car anyway. So `bankDepartureBracket` uses the
bank's own cars, and a building whose *terminal* is unmeasurable is not thereby unmeasurable bank
by bank. **This is what makes Mixed-Use High-Rise reconcilable at all.**

It does not rescue the three banks whose own bracket is empty. Those stay unmeasurable, and the
mechanism is recorded rather than worked around — see D6.

---

## D5 — Every run in the oracle saturates on purpose, and no waiting time is published

Demand is offered at **1.3 × the closed form's own `%POP`**, the factor the Phase 2 gate settled on
after sweeping 1.0–2.0×. The closed form describes a group that is the constraint; below capacity
the achieved interval is set by the arrival rate and agreement would be an artefact of the demand
knob.

Consequence: replications come back `saturated`, and that is **asserted** rather than tolerated — a
replication that did not saturate would be measuring the wrong thing. `CLAUDE.md` § Statistical
discipline forbids publishing a mean waiting time for a system whose queues grow without bound, so
`UpPeakMeasurement` carries none. Round-trip time, achieved interval and handling capacity are
exactly the quantities that stay well-defined when the queue does not.

**Saturation is a count, not a flag, and 1.3× does not guarantee 100 %.** Measured: the always-on
seed set (810 000 + i, n = 64) gives 64/64 on all five buildings, and that is asserted exactly. The
deep campaign's seed set (820 000 + i, n = 128) gives 128/128 on ten of eleven banks and **127/128
on Garden Apartments**. 1.3× is a mean over a Poisson arrival process, so one 1800 s window in a
hundred happens not to diverge; that is sampling, not a drift in the operating point. The deep
campaign therefore bounds the *fraction* at 95 % and prints the counts, and the always-on file
still asserts its exact 64/64. Neither is a loosened tolerance: the round trip is measured over
departures that left **full**, and a car that left full completed a full round trip whether or not
the building-wide queue diverged in that particular window.

---

## D6 — Three banks are recorded as unmeasurable, with mechanisms, rather than reconciled

Re-derived from the reference data in `bankCensus.test.ts` rather than taken from
`metrics/summarize.ts`'s prose:

| bank | max reopen | min round trip | mechanism |
|---|---|---|---|
| `mixed-use-high-rise/residential-local` | 32.80 s | 31.33 s | 20-person car at the residential 1.75 s; first served floor 3.2 m up |
| `vertical-city/shuttle` | 41.20 s | 30.03 s | 26-person car at 1.75 s; first served floor 4.5 m up |
| `vertical-city/zone-6-local` | 32.80 s | 30.03 s | as the first, at a 3.4 m pitch |

An empty bracket means **no** threshold separates a door reopen from a car that left and came back.
It is a limit of reconstructing departures from boarding times, not a tolerance and not a defect in
the simulator; the fix is a car-position series, which no run record carries.

**Vertical City's shuttle is blocked three further ways**, and any figure published for it must
carry all four:

1. **Double-deck hardware the runtime does not model.** `loadConfig` raises
   `double-deck-not-simulated`; the disclaimer travels in `RunRecord.warnings`. Every round-trip,
   interval and handling-capacity figure for that bank — including the closed form printed in
   `bankCensus.test.ts` — is a **single-deck figure for double-deck hardware**.
2. **No population of its own.** All eight served floors declare `population: 0`; its `U` is
   entirely onward. Isolated, it is a building with nobody in it, and the measurement refuses
   rather than computing `%POP` against zero.
3. **`N` is not the number of destination floors the model means.** Its eight floors are four
   *pairs* 4.5 m apart, and deck assignment at sky lobby A is binding (zone 3 boards only at 26,
   zone 4 only at 27). A single-deck round trip over seven destinations is not the trip that bank
   makes, whatever the timings say.

---

## D7 — The principal bank per building, and why the table has one row per building

The reconciliation table reports the group that carries the building's up-peak from its street
entrance — the bank a reader means when they ask whether the building agrees with the closed form.

| building | principal bank | why |
|---|---|---|
| Midtown Office | `main` | the only bank |
| Garden Apartments | `main` | the only bank |
| Secure Tower | `low` | the larger of two lobby banks by served population (546 vs 446) |
| Mixed-Use High-Rise | `office-local` | the only one of three that both starts at the street entrance and has a measurable bracket |
| Vertical City | `zone-1-local` | the lowest bank starting at the street entrance; the shuttle is blocked four ways |

The other nine banks are enumerated by name in `fiveBuildings.test.ts` — six measurable and covered
by the deep campaign, three unmeasurable — so the gap is stated rather than implied.

---

## D8 — The residual tolerance is unchanged at 4 %, and the two known answers are the check

`DEFAULT_RESIDUAL_TOLERANCE` stays 4 %. It was not widened for the three new buildings and did not
need to be: the worst residual across the five is **1.02 %**.

The load-bearing check is that Midtown Office and Garden Apartments come back where
`docs/07-handoff.md` § 5 left them, measured through the new generic apparatus at a different `n`:

| | handoff § 5 (n=128, whole building) | T13 (n=64, isolated bank, per-bank bracket) |
|---|---|---|
| Midtown Office | +27.5 % INT / −23.2 % %POP → 0.001 % | **+27.6 % / −24.2 % → −0.195 %** |
| Garden Apartments | +7.5 % / −7.1 % → 0.69 % | **+7.3 % / −7.8 % → +1.021 %** |

If the three new buildings had agreed and these two had not, the agreement would have been an
artefact of the new apparatus rather than evidence about the simulator.

---

## D9 — The always-on budget is n = 64; the full budget is moved, not reduced

`docs/03-traffic-and-statistics.md` budgets 50–200 replications. The always-on oracle runs the five
principal banks at **n = 64** — inside that band, at its economical end — for a measured **≈24 s**.
`deepCampaign.test.ts` runs **all eleven measurable banks at n = 128** behind
`ELEVATOR_SIM_DEEP=1`, measured at **111.8 s**. All eleven reconcile; the worst residual in the
whole shipped set is **−1.42 %** (Secure Tower's `high` bank, the one with a 54.7 m express run
below its served zone) and the median is 0.14 %.

The split is deliberate and the reason is `CLAUDE.md` § Working agreements: a budget quietly cut to
fit a CI window is a criterion weakened to make a phase pass, and the number would still be
published, just measured worse. So the budget is *moved* rather than reduced, both files state
their own `n` in a named constant, and the skipped campaign prints that it was skipped.

---

## D10 — `v²/a` understates the acceleration distance; the honest figure is `dRated`

`docs/07-handoff.md` § 5 uses `v²/a` for "the distance needed to reach rated speed" — 6.25 m for
Midtown, 0.66 m for Garden. That expression ignores the jerk ramps. The distance the seven-phase
profile actually consumes is

```text
dRated = v · (2·Tj* + Ta*)     Tj* = a/j, Ta* = v/a − a/j   (when v ≥ a²/j)
```

which is **8.04 m** for Midtown and **1.13 m** for Garden. Both conclusions in the handoff survive
and one gets stronger: Midtown's car misses rated speed by a wider margin than stated (8.04 m
against a 3.8 m pitch, not 6.25 m), and Garden's still reaches it comfortably (1.13 m against
3.0 m). Recorded here because the doc's figure is a lower bound on the real one, so anyone using it
to argue *for* reaching rated speed would be arguing from the wrong side.

---

## Defects found in code this task may not edit

### F1 — `packages/core/src/analytical/upPeak.ts`, two published figures that do not reproduce

In the docstring of `deriveUpPeakTerms`, § *"`U` is a default, and for a shuttle it is the wrong
one"*:

> The default reports 102.8 % of population per five minutes instead of 26.3 %.

Neither figure reproduces at the transfer time Mixed-Use High-Rise's shuttle cars actually declare
(1.75 s). Both reproduce **exactly** at `tp = 1.2 s`, the office value — the transfer time the
runner charged every building before the Phase 2 gate's defect 2 was fixed, and which no car of
that bank declares.

| | at `tp = 1.2 s` (stale) | at `tp = 1.75 s` (declared) |
|---|---|---|
| `%POP` against the sky lobby's own `U = 260` | **102.8 %** | 82.5 % |
| `%POP` against the true `U = 1014` | **26.3 %** | 21.2 % |

The prose was measured before the fix and never regenerated — `CLAUDE.md` § *"A published number
goes stale the same way"*. The 1014 in the same paragraph is correct and is the number D3's
derivation reproduces.

**Not fixed here** (this task may not edit `core`). All four arithmetics are pinned in
`bankCensus.test.ts` § "U follows onward traffic", so a later correction has a checked number to
correct *to*.

### F2 — `packages/core/src/metrics/summarize.ts`, an incomplete bracket census

The `DepartureGapBracket` docstring lists the three banks whose bracket is empty. It does not
mention that a **fourth** is within 1.23 s of joining them: `vertical-city/zone-5-local`, whose
20-person car at the hotel 1.5 s holds its doors 28.80 s against a 30.03 s shortest round trip. The
next-narrowest band is 6.63 s and the widest is 35.43 s, so it is an order of magnitude tighter than
anything else in the set.

Not a wrong number — the bank *is* measurable — but a fragility nothing in the repository watches:
one slower door, one larger car or one upward revision of the hotel transfer time and it becomes
unmeasurable silently. Pinned in `bankCensus.test.ts`; a suggested docstring line is the fix.

### F3 — `docs/07-handoff.md` § 4, the replication-budget table uses the removed quantile family

The table *"Replication budget by target precision"* is stated as being at 90 % confidence on
`s = 3.60 s`. Solved with the **normal** quantile `z(0.95) = 1.6449` it reproduces five of its six
rows exactly and the sixth to within one. Solved with `t[n−1]` — the family every published
interval in this project now uses, after review finding #14 removed the crossover
(`DECISIONS.md` § D7) — it does not:

| target | published | z | `t[n−1]` |
|---|---|---|---|
| ±2 s | 9 | 9 | **11** |
| ±1 s | 36 | 36 | **37** |
| ±0.8 s | 55 | 55 | **57** |
| ±0.5 s | 141 | 141 | **143** |
| ±0.4 s | 220 | 220 | **222** |
| ±0.25 s | 563 | 562 | 563 |

The magnitude is 0–2 replications and no conclusion in the repository changes; the doc's own
reading of the table ("50–200 corresponds to ±0.5–0.8 s") survives, because 57 and 143 are both
inside the band. The **direction** is the finding: the table understates the budget at every rung,
so a reader planning from it publishes a half-width slightly wider than claimed.

It survived because the relative error is largest where precision matters least — +22 % at ±2 s,
+0.2 % at ±0.25 s — so a spot check on the row anybody actually plans from is off by 2 in 143 and
reads as rounding.

**Not fixed here** (`docs/` is outside this task's ownership). Both derivations are pinned in
`validation/publishedFigures.test.ts`, along with the corrected column.

### F4 — Phase 3's published magnitudes were printed but not asserted

`docs/07-handoff.md` § 4 publishes ρ = 0.997 / 0.903 / 0.608 and variance reductions of 99.69 % /
89.77 % / 43.75 %. `crnVarianceReduction.test.ts` measured all six and asserted only that the
reduction was **positive** and that the correlation exceeded **0.3**. A change moving ρ from 0.608
to 0.31 would have passed while the handoff table rotted — the same failure that left the tail study
stale for three phases.

**Fixed in this task**, at zero marginal runtime: the magnitudes are now asserted in the suites
that already compute them.
