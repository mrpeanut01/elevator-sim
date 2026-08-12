/**
 * **Does double-deck operation help?** The paired comparison T44 did not run.
 *
 * ```ts
 * console.log(formatDoubleDeckStudy(await runDoubleDeckStudy()));
 * ```
 *
 * T44 made double-deck operation *simulatable* — a stop at a floor pair serves both landings,
 * capacity is per deck at 80 % design load, dwell is charged to the busier deck, and a leg whose
 * origin and destination sit on different decks is refused. Its own record says what it did not do:
 * *"double-deck is simulated and unbenchmarked"*, its only figures being **n = 1** on a building
 * that saturates and publishes `awtIsValid: false`. `nearest-car` moved −45.8 s and `collective`
 * +29.6 s in the same table, and T44 correctly claimed no sign. This module is the measurement that
 * closes that gap, and it does not close it in the direction the hardware's brochure would.
 *
 * ---
 *
 * # 1. The control arm is the retired disclaimer, verbatim
 *
 * The arm double-deck has to be measured *against* is the state the runtime was in before T44:
 * each double-deck car running as a single-deck car of the same whole-car capacity. That is not
 * reconstructed here — it is a configuration the shipped runtime still produces, and it announces
 * itself. {@link singleDeckControlArm} strips `servesFloorPairs` and nothing else; `shaftForBank`
 * then declines to build a deck-aware shaft (it requires *both* a double-deck car and a pairing),
 * per-deck design load falls back to the whole car's, and `config/parse.ts` raises
 * `WARNING_CODES.missingFloorPairs`, whose text is
 *
 * > *"each runs as a single-deck car of the same whole-car capacity, and makes up to twice the
 * > stops the declared hardware would"*
 *
 * — the sentence `WARNING_CODES.doubleDeckNotSimulated` used to carry unconditionally. The control
 * is therefore the shipped meaning of the retired disclaimer rather than this module's idea of it,
 * and {@link DoubleDeckPointResult.controlDisclaimed} records that the warning fired on every
 * replication of the control arm and on none of the treatment arm.
 *
 * # 2. What is paired, and what is not — the finding that decides the gate metric
 *
 * The passenger **population** is identical between the arms and this is measured, not assumed:
 * at equal replication index the two arms see the same arrival times, origins, final destinations,
 * masses and credentials. `doubleDeck.test.ts` asserts that field by field on the generated traces.
 *
 * The **leg decomposition is not identical**, and it cannot be. `traffic/route.ts` plans routes over
 * a fabric that reads `servesFloorPairs`: on a double-deck shuttle a passenger boarding at `G` — the
 * lower floor of the pair `["G", "2"]` — may only alight on a *lower* floor of a pair, so the sky
 * lobbies reachable in one leg are 26, 51 and 76. Zone 3 is anchored to 26 and **zone 4 to 27**, so
 * every journey into zone 4 (and into the 27-side of the upper zones) has to reach the upper lobby
 * level first. It used to do that on a ground-lobby local — `G → 2` as a lift leg, then `2 → 27` on
 * the shuttle — and the double-deck arm therefore ran about a tenth more legs than the control over
 * an identical journey set.
 *
 * That was a fact about the hardware wrapped around an artefact, and **the artefact has since been
 * removed**. A passenger at street level bound for a destination served only by the upper deck
 * really does have to get to the upper lobby level; what was wrong was the **mode**, because the
 * simulator had no escalator and charged that change to a local lift bank. `vertical-city` now
 * declares its ground-lobby escalator (`transportModes`, `G ↔ 2`, 21.2 s), and **at these two
 * operating points the decompositions become identical**: over six replication seeds at up-peak
 * 1 %, both arms plan 933 legs for the same 933, and the same journeys fall in the window on both.
 *
 * The study still reports **+1.32 % / +1.70 %** more legs on the double-deck arm, and that residual
 * is a different thing that must not be mistaken for the old one. It is **window membership, not
 * decomposition**: `legsDoubleDeck` counts legs whose *own* `arrivedAt` falls in the report window,
 * and a 27-side journey's first lift leg now begins waiting 21.2 s later than the control's,
 * because it spends those seconds on the escalator. Some legs cross into the window and some cross
 * out; the net is about 300 in 23 000. The per-leg rows are therefore still reported with verdicts
 * and still never gated on — the denominators differ for a smaller and more boring reason than
 * they used to.
 *
 * The decomposition difference that used to survive under the building's own *mixed* demand — a
 * cross-lobby interfloor journey, 31 → 46 and its kind, riding all the way down to the ground lobby
 * and back — **is gone too**: `vertical-city` now declares an escalator at each of its three
 * sky-lobby pairs as well, and 31 → 46 crosses at sky lobby A in two lift legs where it took four.
 * **That changed nothing here**, and the reason is worth stating rather than assuming: this study's
 * comparable regime is incoming-only up-peak from `G`, and **not one of the building's 92 populated
 * destinations changes route** when the sky-lobby escalators are added or removed — on either arm.
 * Measured over the whole floor set, not inferred. See § 6.
 *
 * The consequence for the statistics is exact and is the reason this study is gated on TTD:
 *
 * | metric | denominator | comparable across the arms? |
 * |---|---|---|
 * | `ttdMeanS`, `ttdP95S` | **journeys** — identical set, identical count, per replication | **yes** — the gate |
 * | `awtS`, `wt95S`, `rideMeanS` | **legs** — the double-deck arm has ~1.5 % more of them (it was ~10 % before the escalator was declared) | reported with a verdict, never gated on |
 * | `energyKJ`, `carDistanceM`, `carStarts` | the fleet's own odometers | yes |
 * | `energyPerServedLegKJ` | legs again, in the denominator | reported beside `energyKJ`, and the leg counts beside both |
 *
 * `core`'s own {@link comparabilityOf} was consulted rather than assumed and it does **not** exclude
 * anything here: both arms run the conventional passenger model, so it reports all twenty-three
 * metrics comparable. The denominator shift above is a *second* hazard that it does not model —
 * it is a property of the building, not of the passenger model — which is why this module measures
 * the leg counts and publishes them beside every per-leg number instead of trusting the answer.
 *
 * # 3. Where an interval may be quoted at all — this cell's own census
 *
 * A ceiling belongs to a `(building, traffic, seed)` and this project has twice made the mistake of
 * inheriting one (`docs/07-handoff.md` § 4). Nothing below is inherited. Two censuses were run, and
 * both are reproduced by `doubleDeck.test.ts`.
 *
 * **The building's own designed scenario admits no paired comparison** — mixed 40/30/30, 1800 s,
 * full-run window, n = 30, both arms, `eta` and `collective`. Every cell of every rate comes back
 * with **no quotable AWT on any replication**, and the unserved fraction **rises as the load falls**
 * (about 5.6 % → 7.2 % → 8.8 % on the double-deck arm at 1.5 / 0.75 / 0.2 % of population per
 * 5 minutes). That is the signature of a *structural* refusal rather than an overload, and it is the
 * same mechanism § D100 part 1 measured on `mixed-use-high-rise` and `accessControl.ts` measured on
 * `secure-tower`: this building declares `accessZones` over floors 53–75 and 78–100, an
 * access-restricted **pickup** carries no credential under `up-down-buttons`, every car answers
 * `accessDenied`, and lowering the rate removes the traffic that *can* be served while leaving the
 * share that cannot. Reproduced here on a **third** building, and reported as counts.
 *
 * **Incoming-only up-peak is the one comparable regime**, and it is the only one by construction:
 * `G` is this building's only entrance and the only floor outside both access zones.
 *
 * The rate census, both arms, n = 100 at {@link BENCHMARK_SEED} — replications with no quotable
 * AWT, per cell, **re-measured on the current configuration** (`vertical-city` with its
 * ground-lobby escalator declared; the figures this table carried before that are in the row
 * beneath each one, in parentheses):
 *
 * | rate | `eta` | `collective` | `nearest-car` |
 * |---|---|---|---|
 * | 0.5 % | 0 / 0  (was 0 / 0) | 0 / 0  (was 0 / 0) | 0 / 0  (was 0 / 0) |
 * | **1 %** | **0 / 0**  (was 0 / 0) | **0 / 0**  (was 0 / 0) | 1 / 1, first invalid at 59 and 26  (was 0 / 1) |
 * | 1.5 % | **0 / 0**  (was 0 / 0) | **1 / 0, first invalid at 90**  (was 0 / 0) | 7 / 4, first invalid at 2 and 2  (was 8 / 4) |
 * | 2 % | 9 / 2  (was 8 / 2) | 1 / 1  (was 0 / 1) | 16 / 4  (was 11 / 4) |
 * | 3 % | 61 / 22  (was 52 / 22) | 4 / 22  (was 5 / 22) | 69 / 35  (was 61 / 35) |
 * | 4 % | 97 / 77  (was 90 / 77) | 28 / 77  (was 29 / 77) | 99 / 82  (was 95 / 82) |
 *
 * (double-deck / single-deck; a cell is quotable only at `0 / 0`.)
 *
 * **Both arms moved, and only one of them should surprise anyone.** The control arm has the
 * escalator too — {@link singleDeckControlArm} strips `servesFloorPairs` and nothing else — so its
 * routes changed as well; its counts moved barely at all because it never needed the lobby hop.
 * The double-deck arm's got **worse** at almost every rate, and 1.5 % stopped being a `0 / 0` rate
 * for the pair this study runs. § 5 gives the mechanism: the escalator delivers a batch to the
 * upper lobby in one lump where a lift metered it.
 *
 * **`nearest-car` is excluded by its ceiling and not by its answer** — the distinction
 * `saturationCensus.test.ts` exists to keep honest. Its first invalid replication is at index 59
 * (double-deck) and 26 (single-deck) at 1 %, and at index 2 on both arms at 1.5 %, so no budget in
 * this project's 50–200 band can be spent with it in the cell. `docs/07-handoff.md` § 4 already records it as the
 * only profile that saturates and a poor reference arm; this is that finding on a fifth building.
 * {@link CEILING_EXCLUDED_ARMS} carries it with its census rather than dropping it silently.
 *
 * # 4. The two operating points, and the budgets derived for them
 *
 * The ceiling is the first replication index at which **any** arm loses its AWT, censused over 1000
 * replications at the study seed. The budget is `ceil((z · s / h)²)` with `s` the pilot standard
 * deviation of the paired ΔTTD on the binding pair and `h = |d| / 1.5`, from a pilot at
 * {@link PILOT_SEED}, which is disjoint from the study seed.
 *
 * | point | ceiling (pre-escalator) | ceiling (pre-deck-fix) | ceiling (current) | n | basis |
 * |---|---|---|---|---|---|
 * | up-peak 1 % | 951 | 284 | **284** | **153** | variance-derived on the binding pair (`collective`); still under the ceiling |
 * | up-peak 1.5 % | 386 | 90 | **52** | **200** | ceiling-bound, and ceiling-**excluded**: the budget sits above the ceiling and the point returns UNQUOTABLE |
 *
 * **The current column is § D332's**, re-censused after the deck fix: the 1 % ceiling is unmoved at
 * 284 and the 1.5 % one falls 90 -> 52, with both double-deck cells now failing at the *same*
 * replication (DD/eta@52, DD/collective@52) and both single-deck cells unmoved at 905. A change
 * confined to deck geometry landing on both DD cells and neither SD cell is what the census should
 * show, and it is why the column is reported rather than folded into the one before it.
 *
 * **Both ceilings were re-censused when `vertical-city` declared its ground-lobby escalator, and
 * both fell.** Per cell over 1000 replications at the study seed: at 1 % the first invalid
 * replication is 284 on *both* double-deck cells and there is none at all on either single-deck
 * cell; at 1.5 % it is 90 (DD `collective`) and 104 (DD `eta`) against 905 on both single-deck
 * cells. The double-deck arm sets the ceiling in every case and the single-deck arm is far more
 * robust, which is § 5's metering mechanism showing up in the census rather than in the means.
 *
 * 1.5 % **was** the highest rate at which every arm in the cell keeps a quotable AWT —
 * `arms.ts`'s rule, not this module's — and on the current configuration it is not: the premise
 * the point was chosen on has stopped holding. The budget is left at its pre-registered 200 and
 * the point is published UNQUOTABLE, rather than lowered to something that fits under 90, because
 * a budget chosen after seeing the answer is the thing {@link PILOT_SEED} exists to prevent.
 *
 * # 5. The result — and it moved when the lobby hop stopped being a lift leg
 *
 * The digits, with their intervals, are pinned in `published.ts`'s `PINNED_ESTIMATES` under
 * `'double-deck'` (see § 7) and are re-derived from the study by `doubleDeck.test.ts` rather than
 * transcribed. What belongs here is the shape of the answer, **and the fact that it changed**.
 *
 * This study was first run against a `vertical-city` with no escalator, where the `G → 2` lobby hop
 * was charged to a local lift bank and the double-deck arm therefore carried ~10 % more legs than
 * the control over an identical journey set. That was published as `DISPATCHER-DEPENDENT`, with
 * the WORSE-under-`eta` row explicitly labelled *an upper bound on the cost of double-deck rather
 * than its true cost*. The building now declares that escalator and the study has been re-run at
 * the same seed and the same pre-registered budgets. **The verdict moved, and it moved in the
 * direction the earlier entry said it would:**
 *
 * | | before the escalator | after | after the deck fix (§ D332) |
 * |---|---|---|---|
 * | excess legs, 1 % / 1.5 % | +10.80 % / +11.56 % | +1.32 % / +1.70 % | **+1.32 % / +1.70 %** |
 * | `eta` @ 1 %, ΔTTD | **+1.950 [+0.975, +2.925] WORSE** | −2.729 [−3.550, −1.907] BETTER | **−1.493 [−2.304, −0.683] BETTER** |
 * | `collective` @ 1 %, ΔTTD | −1.408 [−2.400, −0.416] BETTER | −6.262 [−7.210, −5.315] BETTER | **−4.710 [−5.548, −3.873] BETTER** |
 * | `eta` @ 1 %, ΔcarStarts | — | +0.634 [−0.045, +1.313] INDIST. | **−1.523 [−2.258, −0.788] BETTER** |
 * | the 1.5 % point | quotable; `collective` BETTER, `eta` unresolvable | UNQUOTABLE, ceiling 90 | **UNQUOTABLE, ceiling 52 — both DD cells now fail at the same replication** |
 * | gate | `DISPATCHER-DEPENDENT` | `BETTER-EVERYWHERE` | **`BETTER-EVERYWHERE`** |
 *
 * **The third column is § D332's and it moves both ΔTTD magnitudes *towards zero* while leaving
 * every verdict alone.** Stage 6 refused a call at a car's own upper deck, which cost the
 * double-deck arm trips it should never have made; removing that removes part of the advantage the
 * previous column credited to the decks, because some of that advantage was the control arm being
 * compared against a needlessly handicapped treatment. The gate is unchanged, and the one row that
 * changes *sign* is `carStarts` under `eta` — recorded in the test rather than here, because it is
 * an axis and § D106 forbids reading it as a score.
 *
 * **Read that with two cautions, because it is the flattering direction.**
 *
 * 1. **The evidence base narrowed while the verdict widened.** `BETTER-EVERYWHERE` is now derived
 *    from **two** cells at one operating point, where `DISPATCHER-DEPENDENT` was derived from four
 *    cells at two. The 1.5 % point did not agree — it **dropped out**. Its budget was
 *    pre-registered against a ceiling of 386 and is deliberately not moved to fit the new answer;
 *    the point is published as UNQUOTABLE.
 * 2. **AWT went the other way, and for two reasons that are both real.** The first is the same
 *    denominator effect read backwards: the legs removed were the *cheap* ones — one-floor lobby
 *    hops, answered fast by a five-car local — so removing them raises the mean wait over what is
 *    left. `eta` @ 1 % ΔAWT went from −0.355 BETTER to **+0.785 WORSE**, and `collective` @ 1 %
 *    from −0.927 BETTER to +0.019 INDISTINGUISHABLE.
 *
 *    The second is a **modelling consequence worth naming**: the lift the escalator replaced was
 *    also *metering* the upper lobby. A batch bound for the 27-side used to reach floor 2 spread
 *    out, in car-loads, after a wait; now the whole batch reaches it together, exactly 21.2 s
 *    after arriving at the street. The shuttle queue at floor 2 is therefore burstier than it
 *    was, and it shows: the 1 % point's measured ceiling — the first replication at which any
 *    arm loses its AWT over 1000 — fell from **951 to 284**, and the 1.5 % point lost its AWT
 *    inside the budget altogether. An escalator really does deliver people in a lump; this is
 *    that fact arriving in the statistics, and it is why the wait rows got worse while the
 *    journey rows got better.
 *
 * **Energy is an axis and never a score** (§ D106), and this is the case where that rule earns its
 * keep in the opposite direction from the usual one. Double-deck makes *fewer stops on the shuttle*
 * and is expected to drive less; measured, it drives **more** — more metres, more starts, more
 * kilojoules — in every quotable cell, and `workPerServedLegKJ` is WORSE in both. **That sign did
 * not change when the lobby hop stopped being a lift leg**, which is what the earlier entry
 * predicted when it declined to discount the energy direction. It has not saved anything by
 * serving fewer people either: the unserved fraction is exactly zero on both arms at every
 * replication of both points.
 *
 * **The resolution regime is the coarse one.** Double-deck against single-deck is a *structurally*
 * different configuration, not a near-neighbour weight vector, so `docs/07-handoff.md` § 4's ~1.9 s
 * figure is the right order of magnitude to read the wait numbers against rather than its ~0.20 s
 * one. Every ΔAWT and ΔWT95 effect measured at the quotable point is still **below 1.9 s in
 * magnitude**; they clear zero at n = 153 and should be read as small effects on a confounded
 * denominator rather than as the headline.
 *
 * **No cell is bit-identical except the one that has to be.** `IDENTICAL` would be a wiring bug
 * here rather than a small effect (`docs/07-handoff.md` § 4), and the exactly-zero counts are
 * carried per cell so it cannot pass unnoticed. Exactly one column comes back `IDENTICAL`:
 * `unservedFraction`, which is exactly zero on both arms at every replication of both points —
 * nobody is left behind either way, which is the half of § D106's rule that the energy row needs.
 *
 * # 6. What this module does not answer
 *
 * **The sky lobbies now have escalators too, and it did not move this study.** The earlier revision
 * of this section named `26 ↔ 27`, `51 ↔ 52` and `76 ↔ 77` as the remaining limit: a cross-lobby
 * *interfloor* journey — zone 3 to zone 4, `31 → 46` and its kind — rode the shuttle 105 m down to
 * the ground lobby, crossed there, and rode back up. `vertical-city` declares all three now, and
 * that journey takes two lift legs instead of four.
 *
 * **This study's figures are unchanged by it, and that is a measurement rather than a hope.** The
 * comparable regime is incoming-only up-peak from `G`, and the sky-lobby edges are on no route out
 * of `G`: over all 92 populated destinations, on both the double-deck and the single-deck arm, the
 * planned floors are identical with and without them. Two of the three edges carry **no hops at
 * all** even under the shipped mixed demand, because `zone-5-local` and `zone-6-local` each serve
 * *both* levels of their sky lobby.
 *
 * **So the verdict did not widen, and it must not be read as if it had.** `BETTER-EVERYWHERE` still
 * rests on **two cells at one operating point**, exactly as § 5 records. A change that removed the
 * limitation this section named without touching the evidence base does not strengthen the result;
 * the 1.5 % point is still UNQUOTABLE and still dropped out.
 *
 * **The 1.5 % point has been re-censused and its budget has not been re-derived.** The budget of
 * 200 was chosen against a ceiling of 386 measured on the pre-escalator configuration; the ceiling
 * is now 90. Both double-deck cells lose their AWT inside 200, so the point is reported UNQUOTABLE
 * at its
 * pre-registered budget. Moving the budget to make it quotable would be choosing a budget after
 * seeing the answer, so it is not moved. Whether this building has a *different* second operating
 * point that is quotable on the current configuration is an open question and the next lane's
 * work — the answer is not "lower n until it fits".
 *
 * **The closed-form oracle is untouched.** `vertical-city/shuttle` remains unmeasurable by the
 * Barney/CIBSE round trip for the four reasons `docs/07-handoff.md` § 5 gives; T44 answered one of
 * them by *changing its side* and this module answers none. `analytical/upPeak.ts`'s warning stands.
 *
 * **Nothing here is a Phase 6 verdict.** The phase's criterion is about destination dispatch. This
 * study says what the double-deck bullet is now true of: configured, validated, **simulated**, and
 * **benchmarked at two operating points on the one regime this building leaves comparable** — with a
 * dispatcher-dependent sign on the gate and a uniform energy cost.
 *
 * # 7. Publication status
 *
 * {@link runDoubleDeckStudy} publishes intervals, so its non-test caller is `regeneratePins.ts`,
 * which runs it in `measureAllPublishedFigures`. Its forty estimates are pinned in
 * `published.ts`'s `PINNED_ESTIMATES` under the `'double-deck'` study id, and `doubleDeck.test.ts`
 * closes Layer A over them with `checkPinned('double-deck', doubleDeckFigures(study))` — in both
 * directions, at full precision, on the same study run the verdicts above are asserted against.
 * Registration was sequenced behind a concurrent lane that held both files; it has landed, and
 * every pin was re-derived on the tree it landed on rather than carried across from the tree that
 * generated it.
 */

import type { DispatcherProfile, ResolvedBank, ResolvedBuilding } from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import { runExperiment } from '../runner/replicationRunner.js';
import type {
  CellResult,
  ExperimentResources,
  ExperimentResult,
  TrafficArmSpec,
} from '../runner/types.js';
import { loadResources, withProfiles } from '../validation/harness.js';

import { BENCHMARK_SEED } from './suite.js';
import { compareCell, type CellComparison } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The two arms
 * -------------------------------------------------------------------------- */

/** The only building in `data/` that declares a double-deck car. */
export const DOUBLE_DECK_BUILDING = 'vertical-city';

/** The control arm's building id. Registered in the resources, never written to `data/`. */
export const SINGLE_DECK_BUILDING = 'vertical-city-single-deck';

/**
 * The same building with every deck pairing stripped — **the retired disclaimer's own arm**.
 *
 * `servesFloorPairs` is removed and nothing else: the cars stay `doubleDeck: true` with their
 * `ratedLoadLbPerDeck` intact, which is what makes this the *configuration* the runtime used to run
 * rather than a different building. `shaftForBank` requires both a double-deck car and a pairing
 * before it builds a deck-aware shaft, so the result is a single-deck shaft over the same eight
 * floors at the same whole-car rated load, and `parse.ts` says so out loud through
 * `WARNING_CODES.missingFloorPairs`.
 */
export function singleDeckControlArm(
  building: ResolvedBuilding,
  id: string = SINGLE_DECK_BUILDING,
): ResolvedBuilding {
  return Object.freeze({
    ...building,
    id,
    banks: Object.freeze(
      building.banks.map((bank) => {
        const { servesFloorPairs: _stripped, ...rest } = bank as ResolvedBank & {
          servesFloorPairs?: unknown;
        };
        return rest as ResolvedBank;
      }),
    ),
  }) as ResolvedBuilding;
}

/**
 * The fragment of the control arm's load-time warning this study keys on.
 *
 * Matched as a substring rather than by code, because the code is `config/`'s to name and the claim
 * being made here is about the *sentence a reader gets*: that the control really is the hardware
 * run as single-deck cars of the same whole-car capacity.
 */
export const CONTROL_DISCLAIMER_FRAGMENT =
  'single-deck car of the same whole-car capacity';

/* -------------------------------------------------------------------------- *
 * Dispatchers
 * -------------------------------------------------------------------------- */

/**
 * The dispatchers the comparison is run under, read out of `data/` rather than listed (invariant 7).
 *
 * The question "does double-deck operation help?" has no meaning without a dispatcher, and T44's
 * n = 1 table put the two candidate answers 75 seconds apart depending on which one was in the cell.
 * So the arm list is *every* profile carrying `role: 'baseline'` — the same set
 * `mixedUseHighRise.ts` derives — minus those this cell's own census excludes by their ceiling.
 */
export function studyDispatchers(
  profiles: ReadonlyMap<string, DispatcherProfile>,
): readonly string[] {
  const found = [...profiles.values()]
    .filter((profile) => profile.role === 'baseline')
    .map((profile) => profile.id)
    .filter((id) => !CEILING_EXCLUDED_ARMS.some((entry) => entry.armId === id));
  if (found.length === 0) {
    throw new Error(
      'data/dispatcher-profiles.json declares no usable profile with role "baseline", so the ' +
        'double-deck comparison has no dispatcher to hold fixed.',
    );
  }
  return Object.freeze(found);
}

/** A dispatcher this cell's census excludes, and the census row that excludes it. */
export interface CeilingExclusion {
  readonly armId: string;
  readonly reason: string;
}

/**
 * Excluded by ceiling, never by answer.
 *
 * Recorded here so the exclusion is visible in the same object the results are, following
 * `saturationCensus.test.ts`: *"we dropped the arm that did not suit us"* and *"we dropped the arm
 * whose ceiling is 6"* look identical in a results table.
 */
export const CEILING_EXCLUDED_ARMS: readonly CeilingExclusion[] = Object.freeze([
  Object.freeze({
    armId: 'nearest-car',
    reason:
      'first invalid replication at index 59 (double-deck) and 26 (single-deck) at up-peak 1 %, ' +
      'and at index 2 on both arms at up-peak 1.5 %, over n = 100 at the study seed. No budget ' +
      'in the 50–200 band fits under ' +
      'that, so both operating points would be UNQUOTABLE with it in the cell. docs/07 § 4 ' +
      'records it as the only profile that saturates and a poor reference arm; this is that ' +
      'finding on a fifth building.',
  }),
]);

/* -------------------------------------------------------------------------- *
 * Metrics
 * -------------------------------------------------------------------------- */

/**
 * The gate: **time to destination**, per journey.
 *
 * Chosen for the reason § 2 measures rather than by analogy with Phase 6: the journey set is
 * identical across the arms and the *leg* set is not, so TTD is the metric whose denominator does
 * not move when the decks are paired.
 */
export const DOUBLE_DECK_GATE: ReplicationMetric = 'ttdMeanS';

/** Everything reported, gate first. Nothing is scalarized and nothing is hidden. */
export const DOUBLE_DECK_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'ttdMeanS',
  'ttdP95S',
  'awtS',
  'wt95S',
  'rideMeanS',
  'energyKJ',
  'energyPerServedLegKJ',
  'carDistanceM',
  'carStarts',
  'unservedFraction',
]);

/** Human labels for the printed report only. Feeds no decision. */
export const DOUBLE_DECK_METRIC_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ttdMeanS: 'TTD (s)',
  ttdP95S: 'TTD95 (s)',
  awtS: 'AWT (s)',
  wt95S: 'WT95 (s)',
  rideMeanS: 'ride (s)',
  energyKJ: 'energy (kJ)',
  energyPerServedLegKJ: 'energy/leg (kJ)',
  carDistanceM: 'distance (m)',
  carStarts: 'starts',
  unservedFraction: 'unserved',
});

/* -------------------------------------------------------------------------- *
 * The operating points
 * -------------------------------------------------------------------------- */

/** Incoming-only up-peak at one rate — the one regime § 3 leaves comparable on this building. */
export function upPeakAt(rate: number): TrafficArmSpec {
  return Object.freeze({
    id: `up-peak-${String(rate)}pct`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
      arrivalRatePctPop5min: rate,
      peakWindowS: 300,
    }),
  });
}

/** Mixed 40/30/30 over the full run — the building's own designed scenario, for § 3's counts. */
export function mixedAt(rate: number): TrafficArmSpec {
  return Object.freeze({
    id: `interfloor-mix-${String(rate)}pct`,
    durationS: 1800,
    reportWindow: 'full-run',
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
      arrivalRatePctPop5min: rate,
      peakWindowS: 300,
    }),
  });
}

/**
 * The seed the budgets were piloted at.
 *
 * **Disjoint from {@link BENCHMARK_SEED} on purpose.** A budget derived from the spread of the very
 * replications it then reports is a budget chosen after seeing the answer; `mixedUseHighRise.ts`
 * takes the same care and for the same reason.
 */
export const PILOT_SEED = 51_202_607;

/** One (operating point, budget) both arms are measured at. */
export interface DoubleDeckPoint {
  readonly id: string;
  readonly label: string;
  readonly traffic: TrafficArmSpec;
  readonly replications: number;
  /** First replication index at which some arm lost its AWT, over 1000 at {@link BENCHMARK_SEED}. */
  readonly ceiling: number | undefined;
  /** Where `replications` came from. Never another study's `n`. */
  readonly budgetBasis: string;
  /** Stated before the run, so it cannot be adopted afterwards. */
  readonly prediction: string;
}

export const DOUBLE_DECK_POINTS: readonly DoubleDeckPoint[] = Object.freeze([
  Object.freeze({
    id: 'up-peak-1pct',
    label: 'Vertical City, incoming-only up-peak 1 % — variance-derived budget',
    traffic: upPeakAt(1),
    replications: 153,
    // **Re-censused after `vertical-city` declared its ground-lobby escalator**, and it moved a
    // long way: 951 -> 284, set by both double-deck cells at replication index 284 while neither
    // single-deck cell loses its AWT anywhere in 1000. The escalator delivers a whole batch to the
    // upper lobby at once where a lift metered it, so the shuttle queue at floor 2 is burstier.
    // The pre-registered budget of 153 is unchanged and still sits under it.
    ceiling: 284,
    budgetBasis:
      'ceil((z95 · s / h)²) with s = 6.609 s, the pilot standard deviation of ΔTTD on the binding ' +
      'pair (collective) at PILOT_SEED, and h = |d| / 1.5 = 1.048 s. That is 153, far under the ' +
      'measured ceiling of 951 (the double-deck eta arm’s first invalid replication over 1000 at ' +
      'the study seed).',
    prediction:
      'The gate is genuinely uncertain and is stated so rather than predicted: T44’s n = 1 table ' +
      'disagreed about the sign by dispatcher, which is the hypothesis this point tests. The ' +
      'energy axis is predicted WORSE for the double-deck arm despite its fewer shuttle stops, ' +
      'because the deck binding pushes zone-4 journeys onto a lobby-level local leg the control ' +
      'arm never makes.',
  }),
  Object.freeze({
    id: 'up-peak-1.5pct',
    label: 'Vertical City, incoming-only up-peak 1.5 % — ceiling-bound budget',
    traffic: upPeakAt(1.5),
    replications: 200,
    // **Re-censused, and this is the one that broke the point**: 386 -> 90, set by DD/collective
    // at 90 and DD/eta at 104, against SD cells that hold to 905. The pre-registered budget of 200
    // is now *above* the ceiling, so no budget in this project's 50-200 band fits under it and the
    // point is UNQUOTABLE by construction rather than by luck of the seed — the same category
    // `nearest-car` is in, and reported the same way. The budget is deliberately NOT lowered:
    // choosing one after seeing the answer is the thing `PILOT_SEED` exists to prevent.
    //
    // **Re-censused again for § D332, and it fell further: 90 -> 52.** Both double-deck cells now
    // lose their AWT at the *same* replication — DD/eta@52 and DD/collective@52, where they used to
    // part at 90 and 104 — while both single-deck cells are unmoved at 905. The conclusion is
    // unchanged and strengthened rather than reversed: 200 is further above 52 than it was above
    // 90, so the point stays UNQUOTABLE by construction, and the budget is still not lowered.
    //
    // That the two arms now fail together is the interesting half. The deck fix removes a refusal
    // that only ever applied to a paired car, so it lands on both double-deck cells identically and
    // on neither single-deck cell at all — which is what a change confined to the deck geometry
    // should look like in a census, and is the same shape as the twelve unmoved identity digests.
    ceiling: 52,
    budgetBasis:
      'Ceiling-bound rather than variance-derived: the pilot’s requirement for the binding pair ' +
      '(eta, s = 6.439 s against a 0.770 s effect, h = |d| / 1.5) is 606 against a measured ' +
      'ceiling of 386, so no budget this project would spend resolves it. 200 is the top of the ' +
      '50–200 band and leaves 186 replications of margin under the ceiling; the eta pair is ' +
      'reported unresolved — its required n at the study seed’s own spread is 869 — rather than ' +
      'quoted.',
    prediction:
      'The highest rate at which every arm keeps a quotable AWT, and the marginal one: at the ' +
      'pilot seed the double-deck eta cell lost its AWT inside 100 replications. Predicted to ' +
      'sharpen whatever the 1 % point says rather than to reverse it.',
  }),
]);

/** The three rates § 3's coverage census is measured at, **descending**. */
export const COVERAGE_RATES: readonly number[] = Object.freeze([1.5, 0.75, 0.2]);

/** A categorical outcome needs far fewer replications than an interval. */
export const COVERAGE_REPLICATIONS = 30;

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

/** What one arm did at one rate of the building's own scenario. Counts only, never an interval. */
export interface CoverageCount {
  readonly rate: number;
  readonly buildingId: string;
  readonly armId: string;
  readonly replications: number;
  readonly withoutQuotableAwt: number;
  readonly meanUndelivered: number;
  readonly meanUnservedFraction: number;
  readonly quotable: boolean;
}

export interface CoverageResult {
  readonly rows: readonly CoverageCount[];
  /** `true` when no cell of any rate has a quotable AWT. */
  readonly noneQuotable: boolean;
  /** `true` when the unserved fraction is higher at every lower rate. */
  readonly unservedRisesAsLoadFalls: boolean;
  readonly verdict: 'STRUCTURAL' | 'LOAD-DRIVEN' | 'SERVABLE';
  readonly verdictReason: string;
}

/** One operating point's answer. */
export interface DoubleDeckPointResult {
  readonly id: string;
  readonly label: string;
  readonly replications: number;
  readonly ceiling: number | undefined;
  readonly budgetBasis: string;
  readonly prediction: string;
  /** `false` when any cell of the point lost its AWT. Every comparison is then `UNQUOTABLE`. */
  readonly quotable: boolean;
  readonly unquotableCells: readonly string[];
  /** `double-deck − single-deck`, one per (dispatcher, metric). */
  readonly cells: readonly CellComparison[];
  /** Whether both arms saw the same passenger population at every replication index. */
  readonly populationAligned: boolean;
  /** Legs in the report window, summed over replications, per arm. § 2's denominator. */
  readonly legsDoubleDeck: number;
  readonly legsSingleDeck: number;
  /** Journeys started in the window, per arm. Equal by construction, and checked. */
  readonly journeysDoubleDeck: number;
  readonly journeysSingleDeck: number;
  /** Replications on which the control arm raised the single-deck disclaimer, and the treatment did not. */
  readonly controlDisclaimed: number;
  readonly treatmentDisclaimed: number;
  readonly experiment: ExperimentResult;
  /** One cell. @throws Error when it was not measured. */
  readonly cell: (dispatcher: string, metric: ReplicationMetric) => CellComparison;
}

export interface DoubleDeckStudy {
  readonly seed: number | string;
  readonly treatmentBuilding: string;
  readonly controlBuilding: string;
  readonly gateMetric: ReplicationMetric;
  readonly dispatchers: readonly string[];
  readonly excluded: readonly CeilingExclusion[];
  readonly coverage: CoverageResult;
  readonly points: readonly DoubleDeckPointResult[];
  readonly verdict: DoubleDeckVerdict;
}

/**
 * Whether double-deck operation helps — derived from the cells, never written.
 *
 * Three states rather than two, because "it depends on the dispatcher" is the answer here and a
 * boolean would have to round it to one of the other two.
 */
export interface DoubleDeckVerdict {
  readonly gate: 'BETTER-EVERYWHERE' | 'WORSE-EVERYWHERE' | 'DISPATCHER-DEPENDENT' | 'UNRESOLVED';
  /** `dispatcher@point` for every quotable gate cell, with its verdict. */
  readonly byCell: readonly string[];
  /** `true` when the double-deck arm costs more energy in every quotable cell. */
  readonly costsEnergyEverywhere: boolean;
  readonly reason: string;
}

export interface DoubleDeckOptions {
  readonly seed?: number | string | undefined;
  /** Overrides every point's own budget. For a cheap smoke run only. */
  readonly replications?: number | undefined;
  readonly points?: readonly DoubleDeckPoint[] | undefined;
  readonly dispatchers?: readonly string[] | undefined;
  readonly coverageRates?: readonly number[] | undefined;
  readonly coverageReplications?: number | undefined;
  readonly resources?: ExperimentResources | undefined;
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

/** Register the control arm's building beside the shipped one. */
export function doubleDeckResources(base: ExperimentResources): ExperimentResources {
  const treatment = base.buildingsById.get(DOUBLE_DECK_BUILDING);
  if (treatment === undefined) {
    throw new Error(`data/buildings/ has no building "${DOUBLE_DECK_BUILDING}".`);
  }
  const buildingsById = new Map(base.buildingsById);
  buildingsById.set(SINGLE_DECK_BUILDING, singleDeckControlArm(treatment));
  return Object.freeze({ ...base, buildingsById });
}

/**
 * Run both halves, under common random numbers.
 *
 * One experiment per point with **both** buildings and every dispatcher in it. The two buildings sit
 * in different CRN cohorts by `traceKeyOf`'s definition — it keys on the building *id* — so the
 * pairing is verified here directly, against the population each replication actually generated,
 * rather than taken from the runner's cohort audit. That is the stronger check and § 2 is why it is
 * needed: the arms must share a population and are known not to share a leg decomposition.
 */
export async function runDoubleDeckStudy(
  options: DoubleDeckOptions = {},
): Promise<DoubleDeckStudy> {
  const seed = options.seed ?? BENCHMARK_SEED;
  const base = options.resources ?? withProfiles(await loadResources(), []);
  const resources = doubleDeckResources(base);
  const dispatchers = options.dispatchers ?? studyDispatchers(base.dispatcherProfilesById);

  const coverage = await measureCoverage({
    seed,
    dispatchers,
    rates: options.coverageRates ?? COVERAGE_RATES,
    replications: options.coverageReplications ?? COVERAGE_REPLICATIONS,
    resources,
  });

  const points: DoubleDeckPointResult[] = [];
  for (const point of options.points ?? DOUBLE_DECK_POINTS) {
    const replications = options.replications ?? point.replications;
    const experiment = await runExperiment(
      {
        id: `double-deck/${point.id}`,
        seed,
        buildings: [DOUBLE_DECK_BUILDING, SINGLE_DECK_BUILDING],
        dispatchers: [...dispatchers],
        traffic: [point.traffic],
        replication: {
          minReplications: replications,
          maxReplications: replications,
          checkEvery: Math.max(1, Math.min(8, replications)),
        },
        parallel: { mode: 'serial' },
      },
      resources,
      { keepRecords: false },
    );

    const unquotableCells = experiment.cells
      .filter((cell) => !cell.aggregate.awtIsValid)
      .map((cell) => `${deckOf(cell)}/${cell.dispatcherArmId}`);
    const quotable = unquotableCells.length === 0;

    const cells: CellComparison[] = [];
    let populationAligned = true;
    let legsDoubleDeck = 0;
    let legsSingleDeck = 0;
    let journeysDoubleDeck = 0;
    let journeysSingleDeck = 0;
    let controlDisclaimed = 0;
    let treatmentDisclaimed = 0;

    for (const dispatcher of dispatchers) {
      const treatment = cellOfArm(experiment, DOUBLE_DECK_BUILDING, dispatcher);
      const control = cellOfArm(experiment, SINGLE_DECK_BUILDING, dispatcher);

      for (const metric of DOUBLE_DECK_METRICS) {
        cells.push(
          compareCell({
            metric,
            armId: dispatcher,
            baselineId: `${dispatcher}@single-deck`,
            candidate: treatment.aggregate.metrics[metric].samples,
            baseline: control.aggregate.metrics[metric].samples,
            quotable,
            admissibleReplications: point.ceiling,
          }),
        );
      }

      for (const [index, record] of treatment.replications.entries()) {
        const other = control.replications[index];
        if (other === undefined) {
          populationAligned = false;
          continue;
        }
        if (
          record.tracePassengers !== other.tracePassengers ||
          record.summary.counts.journeysStarted !== other.summary.counts.journeysStarted
        ) {
          populationAligned = false;
        }
        legsDoubleDeck += record.summary.counts.arrivals;
        legsSingleDeck += other.summary.counts.arrivals;
        journeysDoubleDeck += record.summary.counts.journeysStarted;
        journeysSingleDeck += other.summary.counts.journeysStarted;
        if (record.warnings.some((text) => text.includes(CONTROL_DISCLAIMER_FRAGMENT))) {
          treatmentDisclaimed += 1;
        }
        if (other.warnings.some((text) => text.includes(CONTROL_DISCLAIMER_FRAGMENT))) {
          controlDisclaimed += 1;
        }
      }
    }

    points.push(
      Object.freeze({
        id: point.id,
        label: point.label,
        replications,
        ceiling: point.ceiling,
        budgetBasis: point.budgetBasis,
        prediction: point.prediction,
        quotable,
        unquotableCells: Object.freeze(unquotableCells),
        cells: Object.freeze(cells),
        populationAligned,
        legsDoubleDeck,
        legsSingleDeck,
        journeysDoubleDeck,
        journeysSingleDeck,
        controlDisclaimed,
        treatmentDisclaimed,
        experiment,
        cell: (dispatcher: string, metric: ReplicationMetric) => {
          const found = cells.find(
            (entry) => entry.armId === dispatcher && entry.metric === metric,
          );
          if (found === undefined) {
            throw new Error(`No cell for ${dispatcher} on "${metric}" at "${point.id}".`);
          }
          return found;
        },
      }),
    );
  }

  return Object.freeze({
    seed,
    treatmentBuilding: DOUBLE_DECK_BUILDING,
    controlBuilding: SINGLE_DECK_BUILDING,
    gateMetric: DOUBLE_DECK_GATE,
    dispatchers: Object.freeze([...dispatchers]),
    excluded: CEILING_EXCLUDED_ARMS,
    coverage,
    points: Object.freeze(points),
    verdict: verdictOf(points, dispatchers),
  });
}

/** `DD` or `SD`, for a label. */
function deckOf(cell: CellResult): string {
  return cell.buildingId === DOUBLE_DECK_BUILDING ? 'DD' : 'SD';
}

function cellOfArm(
  result: ExperimentResult,
  buildingId: string,
  dispatcherArmId: string,
): CellResult {
  const found = result.cells.find(
    (cell) => cell.buildingId === buildingId && cell.dispatcherArmId === dispatcherArmId,
  );
  if (found === undefined) {
    throw new Error(
      `Experiment "${result.experimentId}" has no cell for ${buildingId} × ${dispatcherArmId}.`,
    );
  }
  return found;
}

/** The gate verdict, derived from the quotable gate cells. */
export function verdictOf(
  points: readonly DoubleDeckPointResult[],
  dispatchers: readonly string[],
): DoubleDeckVerdict {
  const byCell: string[] = [];
  let better = 0;
  let worse = 0;
  let energyCells = 0;
  let energyWorse = 0;
  for (const point of points) {
    if (!point.quotable) continue;
    for (const dispatcher of dispatchers) {
      const gate = point.cell(dispatcher, DOUBLE_DECK_GATE);
      byCell.push(`${dispatcher}@${point.id}:${gate.verdict}`);
      if (gate.verdict === 'BETTER') better += 1;
      if (gate.verdict === 'WORSE') worse += 1;
      const energy = point.cell(dispatcher, 'energyKJ');
      energyCells += 1;
      if (energy.verdict === 'WORSE') energyWorse += 1;
    }
  }
  const gate =
    better > 0 && worse > 0
      ? 'DISPATCHER-DEPENDENT'
      : better > 0 && worse === 0
        ? 'BETTER-EVERYWHERE'
        : worse > 0 && better === 0
          ? 'WORSE-EVERYWHERE'
          : 'UNRESOLVED';
  const costsEnergyEverywhere = energyCells > 0 && energyWorse === energyCells;
  return Object.freeze({
    gate,
    byCell: Object.freeze(byCell),
    costsEnergyEverywhere,
    reason:
      gate === 'DISPATCHER-DEPENDENT'
        ? `the double-deck arm beats the single-deck control on ${DOUBLE_DECK_GATE} in ${String(better)} quotable cell(s) and loses in ${String(worse)}, so no verdict of the form "double-deck is better" is available on this building; the sign is a property of the dispatcher held fixed, which is what T44's n = 1 table hinted at and could not establish`
        : gate === 'BETTER-EVERYWHERE'
          ? `the double-deck arm beats the single-deck control on ${DOUBLE_DECK_GATE} in every quotable cell`
          : gate === 'WORSE-EVERYWHERE'
            ? `the double-deck arm loses to the single-deck control on ${DOUBLE_DECK_GATE} in every quotable cell`
            : `no quotable gate cell excluded zero, so the comparison is unresolved at these budgets rather than answered`,
  });
}

/* -------------------------------------------------------------------------- *
 * § 3's coverage census
 * -------------------------------------------------------------------------- */

interface CoverageInput {
  readonly seed: number | string;
  readonly dispatchers: readonly string[];
  readonly rates: readonly number[];
  readonly replications: number;
  readonly resources: ExperimentResources;
}

async function measureCoverage(input: CoverageInput): Promise<CoverageResult> {
  const rows: CoverageCount[] = [];
  for (const rate of input.rates) {
    const experiment = await runExperiment(
      {
        id: `double-deck/coverage-${String(rate)}`,
        seed: input.seed,
        buildings: [DOUBLE_DECK_BUILDING, SINGLE_DECK_BUILDING],
        dispatchers: [...input.dispatchers],
        traffic: [mixedAt(rate)],
        replication: {
          minReplications: input.replications,
          maxReplications: input.replications,
          checkEvery: Math.max(1, Math.min(8, input.replications)),
        },
        parallel: { mode: 'serial' },
      },
      input.resources,
      { keepRecords: false },
    );
    for (const cell of experiment.cells) {
      const records = cell.replications;
      const unserved = records
        .map((record) =>
          record.summary.counts.arrivals === 0
            ? Number.NaN
            : record.summary.counts.unserved / record.summary.counts.arrivals,
        )
        .filter((value) => Number.isFinite(value));
      rows.push(
        Object.freeze({
          rate,
          buildingId: cell.buildingId,
          armId: cell.dispatcherArmId,
          replications: records.length,
          withoutQuotableAwt: records.filter((record) => !record.awtIsValid).length,
          meanUndelivered:
            records.length === 0
              ? Number.NaN
              : records.reduce((total, record) => total + record.undeliveredCount, 0) /
                records.length,
          meanUnservedFraction:
            unserved.length === 0
              ? Number.NaN
              : unserved.reduce((total, value) => total + value, 0) / unserved.length,
          quotable: cell.aggregate.awtIsValid,
        }),
      );
    }
  }

  const noneQuotable = rows.every((row) => !row.quotable);
  const meanAt = (rate: number): number => {
    const at = rows.filter((row) => row.rate === rate);
    return at.reduce((total, row) => total + row.meanUnservedFraction, 0) / Math.max(1, at.length);
  };
  const rates = [...input.rates];
  let unservedRisesAsLoadFalls = rates.length > 1;
  for (let index = 1; index < rates.length; index += 1) {
    if (!(meanAt(rates[index] as number) > meanAt(rates[index - 1] as number))) {
      unservedRisesAsLoadFalls = false;
    }
  }

  const verdict = !noneQuotable ? 'SERVABLE' : unservedRisesAsLoadFalls ? 'STRUCTURAL' : 'LOAD-DRIVEN';
  const worst = rates[rates.length - 1] as number;
  return Object.freeze({
    rows: Object.freeze(rows),
    noneQuotable,
    unservedRisesAsLoadFalls,
    verdict,
    verdictReason:
      verdict === 'STRUCTURAL'
        ? `no cell of either arm has a quotable AWT at any of ${String(rates.length)} rates, and the unserved fraction RISES as the load falls — ${(meanAt(worst) * 100).toFixed(2)} % at ${String(worst)} % of population per 5 minutes against ${(meanAt(rates[0] as number) * 100).toFixed(2)} % at ${String(rates[0])} %. Lowering the rate removes the traffic that can be served and leaves the share that cannot, so this building's own designed scenario admits no paired comparison at any rate`
        : verdict === 'LOAD-DRIVEN'
          ? 'no cell has a quotable AWT, but the unserved fraction falls with the load, so a lower rate would rescue the scenario and it is not structurally closed'
          : 'at least one cell has a quotable AWT here, so the building’s own scenario admits a paired comparison after all',
  });
}

/* -------------------------------------------------------------------------- *
 * Reading a study
 * -------------------------------------------------------------------------- */

/** One point's row, or `undefined`. */
export function doubleDeckPoint(
  study: DoubleDeckStudy,
  id: string,
): DoubleDeckPointResult | undefined {
  return study.points.find((point) => point.id === id);
}

/** The study as the console report its suite prints. Feeds no decision. */
export function formatDoubleDeckStudy(study: DoubleDeckStudy): string {
  const lines: string[] = [
    `Double-deck operation on ${study.treatmentBuilding}, seed ${String(study.seed)}, gate ${study.gateMetric}`,
    `  candidate = double-deck (the shipped pairing), baseline = ${study.controlBuilding} (the retired disclaimer's arm)`,
    `  dispatchers held fixed: ${study.dispatchers.join(', ')}`,
    `  excluded by ceiling: ${study.excluded.map((entry) => entry.armId).join(', ') || '(none)'}`,
    '',
    `§ coverage — the building's own mixed scenario, counts only, n = ${String(COVERAGE_REPLICATIONS)}`,
  ];
  for (const row of study.coverage.rows) {
    lines.push(
      `    ${String(row.rate).padStart(5)} %  ${(row.buildingId === DOUBLE_DECK_BUILDING ? 'DD' : 'SD').padEnd(3)}${row.armId.padEnd(14)} ` +
        `no-quotable-AWT ${String(row.withoutQuotableAwt).padStart(3)}/${row.replications}  ` +
        `undelivered/run ${row.meanUndelivered.toFixed(1).padStart(6)}  ` +
        `unserved ${(row.meanUnservedFraction * 100).toFixed(2)} %`,
    );
  }
  lines.push(`  VERDICT ${study.coverage.verdict} — ${study.coverage.verdictReason}`);

  for (const point of study.points) {
    lines.push('');
    lines.push(
      `§ ${point.label}  n=${String(point.replications)}  ` +
        `ceiling ${point.ceiling === undefined ? 'none in 1000' : String(point.ceiling)}  ` +
        `population ${point.populationAligned ? 'aligned' : 'MISALIGNED'}  ` +
        `legs DD ${String(point.legsDoubleDeck)} vs SD ${String(point.legsSingleDeck)}  ` +
        `journeys DD ${String(point.journeysDoubleDeck)} vs SD ${String(point.journeysSingleDeck)}  ` +
        `disclaimer DD ${String(point.treatmentDisclaimed)} SD ${String(point.controlDisclaimed)}` +
        (point.quotable ? '' : `  UNQUOTABLE: ${point.unquotableCells.join(', ')}`),
    );
    for (const cell of point.cells) {
      const { estimate } = cell;
      lines.push(
        `    ${cell.armId.padEnd(12)} ${(DOUBLE_DECK_METRIC_LABELS[cell.metric] ?? cell.metric).padEnd(16)} ` +
          `${estimate.mean.toFixed(3)} [${estimate.lower.toFixed(3)}, ${estimate.upper.toFixed(3)}]  ` +
          `${cell.verdict.padEnd(18)} sd=${cell.sdOfDifference.toFixed(3)} ` +
          `rho=${cell.comparison.correlation.toFixed(3)} zeros=${cell.comparison.exactZeroCount} ` +
          `req n=${cell.requiredReplications === undefined ? '—' : String(cell.requiredReplications)}`,
      );
    }
  }

  lines.push('');
  lines.push(`GATE ${study.verdict.gate} — ${study.verdict.reason}`);
  lines.push(
    `ENERGY ${study.verdict.costsEnergyEverywhere ? 'WORSE in every quotable cell' : 'not uniformly worse'} — reported beside the wait figures and never folded into them (DECISIONS.md § D106)`,
  );
  return lines.join('\n');
}
