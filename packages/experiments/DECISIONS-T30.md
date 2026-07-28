# DECISIONS — T30, engine honesty

Decisions taken while closing four correctness defects in shipped engine code. Recorded here
because `DECISIONS.md` and `docs/` belong to a separate documentation task; § T30-D6 lists what that
task must record.

---

## T30-D1 — `destination-eta` weights `rideTime` at **0.5**

**The defect.** `data/dispatcher-profiles.json`'s `destination-eta` authored
`dispatch.callType: mobile-credential` and a weight vector of `{ waitTime: 1.0 }` — identical to
`eta`'s. The destination reached `estimateCost` and changed no decision. Measured through the full
experiment matrix at seed 20 260 728, the shipped Level-0 destination profile was **bit-identical to
`eta` at 8 of 8 cells**: a configured, tested, shipped behaviour with no effect on any shipped path,
which is the standing requirement's defect one level up from code into data.

**The recorded blocker was stale.** The profile's own `$comment` said the promotion was blocked by
`core/src/dispatch/policies/policies.test.ts`'s `contributionScenarios()` building calls with no
`destinationFloorId`. T16 closed that gap (`fixtures.test-helper.ts`'s `call()` now carries one) and
`policies.test.ts` carries an explicit regression pin for the promotion. Verified by measurement,
not by reading: with the weight authored, `policies.test.ts` is green on all 31 tests, including
*"has no weight that contributes nothing"* and *"lets no profile weight a term its own stage
settings make inert"*.

**Why 0.5.** Two criteria, both stated before the sweep that produced the number.

1. *A shipped default may not make a published metric significantly worse.* This rules out the top
   of the bracket. At Midtown Office interfloor-mix, n = 150, CRN, WT95 against `eta`:

   | `rideTime` | WT95 | verdict |
   |---|---|---|
   | 0.3 | `+0.369 [−0.311, +1.049]` | INDISTINGUISHABLE |
   | **0.5** | `+0.374 [−0.303, +1.051]` | INDISTINGUISHABLE |
   | 0.7 | `+0.620 [−0.033, +1.274]` | INDISTINGUISHABLE, marginally |
   | 1.0 | `+1.010 [+0.292, +1.729]` | WORSE |
   | 2.0 | `+1.331 [+0.623, +2.039]` | WORSE |

2. *A shipped default may not be observationally inert at a shipped operating point* — the whole
   reason the weight exists. This rules out the bottom. On Midtown up-peak at the matrix's own seed
   and budget, replications differing from `eta`: **0 of 81** at 0.3, **5** at 0.5, **6** at 0.7,
   **16** at 1.0. At the bracket's floor the shipped profile would still have been the baseline
   under another name at a shipped operating point.

0.5 is the smallest bracket point that clears both. What it costs against 0.3 is `+0.113 s` of AWT
for `−0.224 s` of TTD and `−0.337 s` in the car; what it costs against the unpriced profile is
`+0.295 [+0.154, +0.437] s` of AWT for `−1.217 [−1.531, −0.902] s` of TTD and
`−1.512 [−1.813, −1.211] s` in the car.

**What is deliberately *not* claimed.** 1.0 and 2.0 remain study arms; the aggressive end of an
unscalarized trade is the operator's to opt into by deriving an arm (CLAUDE.md § Tuning discipline).
Phase 6a's `−1.562 [−1.916, −1.208] s` headline at `rideTime 1` is untouched.

**One matrix cell is still bit-identical to `eta`, and it is structural.** Garden Apartments
down-peak: 0 of 51 replications differ at 0.3, at 1.0 **and** at 2.0. Every down trip ends at the
lobby, so the destination carries nothing the direction button did not. Raising the weight fourfold
does not move it, which is how a blind operating point is told from a dead seam. `destination-panel`
at `rideTime 1` lands in the same identity class there, independently.

## T30-D2 — the decomposition arms are bound to the configuration, not to the shipped id

Three studies used the shipped `destination-eta` as their *"call type disclosed, nothing pricing
it"* control, which was correct only while the shipped profile happened to be that configuration.
Each is now bound to a derived arm, `destination-eta-unpriced` (`weights.rideTime: 0`, everything
else inherited), so the measurement is unchanged and only the id moved:

| study | arm | what would have happened otherwise |
|---|---|---|
| `destinationDisclosure.ts` | `DISCLOSURE_UNPRICED_ARM` | the Phase 6a decomposition would have been deleted |
| `accessControl.ts` | `CREDENTIAL_ARM` | **H-ACCESS-2 silently redefined** — see below |
| `mixedUseHighRise.ts` | `DECOMPOSITION_ARM` | the "call type alone is worth zero" claim falsified |

`accessControl.ts` is the one worth stating in full, because it is the case where a pin regeneration
would have hidden a change of *meaning* rather than a change of value. H-ACCESS-2 is defined as
`Δ = TTD(credential + destination priced) − TTD(credential alone)`. With E bound to the shipped id,
`Δ` becomes the marginal effect from 0.5 to 1.0 rather than the effect of pricing the destination at
all. Measured: the published difference-of-differences `+0.982 [+0.584, +1.380]` falls to a mean of
`+0.208` with an interval still excluding zero on the positive side — same sign, same REFUTED
verdict, a fifth of the magnitude. With E bound to the configuration, the six access-control pins do
not move at all.

The evidence for `rideTime: 0` ≡ absent is the measurement rather than an argument about the scoring
engine: `destination-eta-unpriced` is in `eta`'s identity class at n = 150, 150 of 150 paired
differences of exactly zero on all seven identity metrics, which is what the shipped profile used to
do.

## T30-D3 — `measureEnergyLiveness` gets a driver, and the guard is derived

`measureEnergyLiveness` had no non-test caller: two barrels, a string key in `published.ts`, and its
own test. The repository's own scanner reported `measureEnergyLiveness -> []`.

It was not a one-off. `published.ts` splits `benchmark/` into studies that publish a
`PublishedStudyId` and studies classified `'no-intervals'`. Every study in the first half has a
non-test caller — `regeneratePins.ts` runs them all, because a pin table must be regenerable. The
second half had **no driver at all**, and all five of its members were dead by the same measure:
`measureAuctionAggregation`, `measureDestinationLiveness`, `measureEnergyLiveness`,
`measureMultiRoundReachability`, `measurePredictorLag`.

So the fix is symmetric rather than special-cased: `benchmark/livenessSuite.ts` is the categorical
half's `regeneratePins.ts`. It runs all five, formats their counts, and carries a command shell
(`node packages/experiments/dist/benchmark/livenessSuite.js [--fast]`). It asserts nothing — each of
the five already has a suite that asserts its own claim at its own budget, and duplicating those
thresholds would create a second place for them to drift.

**The guard is widened to be derived rather than hard-coded.** `src/index.test.ts` previously listed
five Phase-7 entry points by hand, so a study added later was invisible to it. A new block iterates
`Object.keys(STUDY_ENTRY_POINTS)` — a categorical whose totality against the `benchmark/` directory
`published.test.ts` already asserts in both directions — and requires each member to have a
non-test, non-barrel caller, or a use inside its own module beyond its declaration. The block
deliberately does **not** assert barrel re-export: six live study entry points are on no barrel, and
`measureEnergyLiveness` was on two and dead.

## T30-D4 — the core dead-code audit's two holes are closed

`packages/core/src/dispatch/deadCode.test.ts` is one of the two permanent guards and had two holes
that `packages/experiments/src/tuning/deadCode.test.ts` had already fixed in its copy. `core` may not
import from `experiments`, so the fixes are ported inline rather than shared.

1. `EXPORTED` did not match `export async function`, so asynchronous exports of an audited module
   were never scanned — neither reportable as dead nor listable in the allowlist.
2. `code()` stripped comments but not string literals, so a symbol naming itself in its own error
   message counted as self-used and was **unfalsifiably live**.

Both were watched failing before being closed (§ *Evidence* below). Closing them surfaced **no new
dead exports** — the allowlist is unchanged in both directions — but it made three existing
assertions falsifiable that previously could not fail. Three assertions were added pinning the two
fixes against synthetic input, because `dispatch/{policies,predictor}` contains no
`export async function` today and a latent scanner gap is invisible until the first symbol falls
into it.

## T30-D5 — the energy proxy's `packages/**` docstrings

The proxy's documentation in `core/src/metrics/types.ts` was found accurate and complete on the
basis, the balance ratio, the citations, the omissions and the non-configurability. One wording
error was corrected: `workPerServedLegKJ` was described as normalizing *"by work done"*, which is
what it divides, not what it divides by. It divides by legs delivered, and the sentence now says why
that matters — a saturating dispatcher drives less and therefore scores better on the fleet total,
which is exactly the arm a three-axis front must not reward.

## T30-D6 — what the documentation task must record

`DECISIONS.md` has **zero** mentions of energy. The proxy shipped with a citation in a docstring and
no recorded decision, which CLAUDE.md § Working agreements forbids. The documentation task must
record:

- **The basis.** `workJ = |loadKg − 0.5 · ratedLoadKg| · g · distanceM`, joules of out-of-balance
  mechanical work, summed per reporting window from per-move `TravelSample`s attributed at arrival.
  `g = 9.80665` (CODATA / ISO 80000-3).
- **The balance ratio, and why 0.5.** The literature range is 0.4–0.5 (Barney & Al-Sharif
  § drive sizing and counterbalancing; CIBSE Guide D § 13; ISO 25745-2, whose reference cycle is
  measured at empty, half and full load because the mid point is the balance point). 0.5 is chosen
  because it is the value at which the proxy is **symmetric** — an empty car and a full car of the
  same travel cost the same — so the number is a statement about how far cars drove out of balance
  rather than about a particular machine's counterweight order.
- **Why it is a code constant and not config.** A per-run counterweight ratio would let two arms of
  one comparison be scored on different scales, and would put a fitted per-installation constant
  inside a published Pareto axis. Invariant 7 governs *dispatch strategy*; this is reference data
  about the machine.
- **The omissions, so nobody reads the axis as kWh.** Acceleration losses (no shipped spec carries
  car and counterweight masses), drive and gearing efficiency, door-motor energy, and standby/idle
  power — ISO 25745-2's other half, which dominates on a lightly-used lift and is a property of the
  machine rather than of the dispatcher. The absolute value is the **non-regenerative** convention,
  which bounds a regenerative drive's figure from above.
- **Why `workPerServedLegKJ` exists.** *A configuration that spends less by serving fewer people has
  not saved anything.* The fleet total is gameable in the wrong direction — a dispatcher whose
  queues diverge drives less and scores better — so the per-leg figure is published beside it.
- **Why `NaN` and not `0`** when nothing was recorded: "the cars did not move" and "nobody wrote
  down how far the cars moved" are different facts, and zeroing them restores a two-axis front under
  a three-axis name.

The documentation task must also record **T30-D1** (the shipped `rideTime` weight, its value and the
two criteria that chose it), **T30-D2** (the decomposition arms and the H-ACCESS-2 near-miss), and
update any doc that states `destination-eta` is bit-identical to `eta`, weights `waitTime` only, or
that the `rideTime` promotion is blocked. `docs/09` § 8 R6-1's *"a destination profile lands in
`data/` and changes nothing"* should be recorded as **having happened**, not as a risk.

---

## Evidence

### The two dead-code holes, watched failing

| hole | how it was made to bite | unfixed audit | fixed audit |
|---|---|---|---|
| `EXPORTED` skips `export async function` | an uncalled `export async function probeUncalledAsyncExport` added to `policies/zoning.ts` | **4 passed** — never scanned | **fails**, naming `policies/probeUncalledAsyncExport` |
| `code()` keeps string literals | both real importers of `createArrivalModel` deleted (`sim/simulation.ts`, `benchmark/predictorLag.ts`) | **4 passed** — `PredictorError(\`createArrivalModel: …\`)` read as a self-use | **fails**, naming `predictor/createArrivalModel` |

Measured self-use counts under the two implementations: `createArrivalModel` 3 → 1,
`PredictorError` 2 → 1. Both were live *regardless of who imported them* before the fix.

### The widened liveness guard, watched failing

- Removing `measureEnergyLiveness` from `livenessSuite.ts` fails
  *"has at least one non-test, non-barrel caller of measureEnergyLiveness"* with the pre-fix state
  reproduced exactly.
- A synthetic `export async function measureProbeStudy` added to `benchmark/` fails
  `published.test.ts` (*"benchmark/ exports a study entry point that published.ts does not
  classify"*); classifying it then fails `index.test.ts` (*"has no caller outside its own tests"*).
  Two stages, both by machine.

### `destination-eta` liveness, counted through the shipped engine

Seed 20 260 726, through `runSimulation`, on the profile `data/` carries:

| configuration | building | `rideTime` non-zero | cross-car spread |
|---|---|---|---|
| shipped, `mobile-credential` | midtown-office | **260 / 260** | **12 / 65 decisions** |
| shipped, `up-down-buttons` (gate off) | midtown-office | 0 / 248 | 0 / 62 decisions |
| shipped, `mobile-credential` | secure-tower | 159 / 159 | 2 / 53 decisions |

Before the change the shipped profile weighted no gated term, so the count was **0 evaluations**.
The off side is flat, which is docs/09 § 8 R6-2's proof obligation.

Trajectory difference against `eta`, where the matrix previously measured bit-identity — separated
at **7 of 8** cells (midtown-up-peak, midtown-down-peak, midtown-interfloor, garden-residential,
secure-up-peak, mixed-use-up-peak, vertical-city-up-peak); still identical at **garden-down-peak**,
which is blind at every weight up to 2.0.

At the primary point the shipped profile is bit-identical to the derived study arm at its own
weight — `destination-eta ≡ destination-eta+ride0.5`, 150 of 150 — so it is not merely *somewhere*
on the published curve, it is exactly the measured point.
