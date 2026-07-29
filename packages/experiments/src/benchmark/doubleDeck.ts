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
 * every journey into zone 4 (and into the 27-side of the upper zones) gains a leg: `G → 2` on a
 * ground-lobby local, then `2 → 27` on the shuttle. Measured at the operating points below, the
 * double-deck arm runs about a tenth more legs than the control over an identical journey set.
 *
 * That is a fact about the hardware and not an artefact: a passenger at street level bound for a
 * destination served only by the upper deck really does have to get to the upper lobby level. What
 * *is* an artefact is the **mode**: this simulator has no escalator, so the lobby-level change is
 * charged as an elevator leg on a local bank. See § 6.
 *
 * The consequence for the statistics is exact and is the reason this study is gated on TTD:
 *
 * | metric | denominator | comparable across the arms? |
 * |---|---|---|
 * | `ttdMeanS`, `ttdP95S` | **journeys** — identical set, identical count, per replication | **yes** — the gate |
 * | `awtS`, `wt95S`, `rideMeanS` | **legs** — the double-deck arm has ~10 % more of them, and the extra ones are short lobby hops | reported with a verdict, never gated on |
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
 * The rate census, both arms, n = 100 at {@link BENCHMARK_SEED} — saturated replications per cell:
 *
 * | rate | `eta` | `collective` | `nearest-car` |
 * |---|---|---|---|
 * | 0.5 % | 0 / 0 | 0 / 0 | 0 / 0 |
 * | **1 %** | **0 / 0** | **0 / 0** | 0 / **1, first invalid at 26** |
 * | **1.5 %** | **0 / 0** | **0 / 0** | **8 / 4, first invalid at 6 and 2** |
 * | 2 % | 8 / 2 | 0 / 1 | 11 / 4 |
 * | 3 % | 52 / 22 | 5 / 22 | 61 / 35 |
 * | 4 % | 90 / 77 | 29 / 77 | 95 / 82 |
 *
 * (double-deck / single-deck; a cell is quotable only at `0 / 0`.)
 *
 * **`nearest-car` is excluded by its ceiling and not by its answer** — the distinction
 * `saturationCensus.test.ts` exists to keep honest. Its first invalid replication is at index 26 at
 * 1 % and at index 6 (double-deck) and 2 (single-deck) at 1.5 %, so no budget in this project's
 * 50–200 band can be spent with it in the cell. `docs/07-handoff.md` § 4 already records it as the
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
 * | point | ceiling | n | basis |
 * |---|---|---|---|
 * | up-peak 1 % | **951** | **153** | variance-derived on the binding pair (`collective`); well under the ceiling |
 * | up-peak 1.5 % | **386** | **200** | ceiling-bound: the pilot puts the binding pair (`eta`) at n ≈ 606 against a ceiling of 386, and the measured spread at the study seed puts it at **869**, so that pair is reported **unresolved** rather than quoted |
 *
 * 1.5 % is the highest rate at which every arm in the cell keeps a quotable AWT, which is
 * `arms.ts`'s rule and not this module's. It is also the marginal one, and that is published rather
 * than smoothed: at the *pilot* seed the double-deck `eta` cell lost its AWT inside 100
 * replications, which is what a ceiling of 386 at the study seed looks like from one seed over.
 *
 * # 5. The result, and it is dispatcher-dependent
 *
 * The digits, with their intervals, are in `DECISIONS.md` § T51, are pinned in `published.ts`'s
 * `PINNED_ESTIMATES` under `'double-deck'` (see § 7) and are re-derived from the study by
 * `doubleDeck.test.ts` rather than transcribed. What belongs here is the shape of the answer:
 *
 * | pair | gate (ΔTTD) | ΔAWT | ΔWT95 | Δride | energy |
 * |---|---|---|---|---|---|
 * | `eta` @ 1 % | **WORSE** | BETTER | INDIST. | BETTER | **WORSE** on total, INDIST. per leg |
 * | `collective` @ 1 % | **BETTER** | BETTER | BETTER | BETTER | **WORSE** on both |
 * | `eta` @ 1.5 % | INDIST., and **unresolvable** — required n above the ceiling | WORSE | WORSE | BETTER | **WORSE** on both |
 * | `collective` @ 1.5 % | **BETTER** | BETTER | INDIST. | BETTER | **WORSE** on both |
 *
 * Stated plainly: **on the gate the sign depends on the dispatcher, so there is no verdict of the
 * form "double-deck is better".** It is BETTER under `collective` at both points, WORSE under `eta`
 * at 1 %, and at 1.5 % under `eta` the effect is smaller than this operating point can ever resolve.
 * T44's refusal to claim a sign from n = 1 was right, and the reason it was right is now measured:
 * the sign is real and it is not the same sign for every dispatcher.
 *
 * **Energy is an axis and never a score** (§ D106), and this is the case where that rule earns its
 * keep in the opposite direction from the usual one. Double-deck makes *fewer stops on the shuttle*
 * and is expected to drive less; measured, it drives **more** — more metres, more starts, more
 * kilojoules — in **all four** cells, and `workPerServedLegKJ` is WORSE in three of the four and
 * INDISTINGUISHABLE in the remaining one. It has therefore not saved anything by serving fewer
 * people either: the unserved fraction is exactly zero on both arms at every replication of both
 * points. The mechanism is § 2's: the extra lobby-level legs are served by the ground-lobby locals,
 * and a leg the control arm never makes is fleet distance the treatment arm pays for.
 *
 * **The resolution regime is the coarse one.** Double-deck against single-deck is a *structurally*
 * different configuration, not a near-neighbour weight vector, so `docs/07-handoff.md` § 4's ~1.9 s
 * figure is the right order of magnitude to read the wait numbers against rather than its ~0.20 s
 * one. Measured on this cell, CRN pairs the gate metric well (ρ ≈ 0.80–0.85 on ΔTTD) and the wait
 * metrics poorly (ρ ≈ 0.34–0.75 on ΔAWT and ΔWT95). Every ΔAWT and ΔWT95 effect measured here is
 * **below 1.9 s in magnitude** — they clear zero at these budgets because the budgets are 153 and
 * 200 rather than 100 and because this cell's own spread is smaller than Midtown's, and they should
 * be read as small effects on a confounded denominator rather than as the headline.
 *
 * **No cell is bit-identical except the one that has to be.** `IDENTICAL` would be a wiring bug
 * here rather than a small effect (`docs/07-handoff.md` § 4), and the exactly-zero counts are
 * carried per cell so it cannot pass unnoticed. Exactly one column comes back `IDENTICAL`:
 * `unservedFraction`, which is exactly zero on both arms at every replication of both points —
 * nobody is left behind either way, which is the half of § D106's rule that the energy row needs.
 *
 * # 6. What this module does not answer
 *
 * **The lobby-level change is charged as an elevator leg.** This simulator has no escalator and no
 * stair, so the `G → 2` hop a real two-level double-deck lobby serves with an escalator is routed
 * onto a local bank. It costs the double-deck arm legs, waiting time, in-car time and fleet
 * distance that the hardware would not really pay. This is named rather than corrected — correcting
 * it means a non-elevator transport mode in `core`, which is out of this lane's scope — and it is
 * the largest single reason to treat the WORSE-under-`eta` row as an upper bound on the cost of
 * double-deck rather than as its true cost.
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
      'first invalid replication at index 26 at up-peak 1 % (single-deck arm) and at 6 and 2 at ' +
      'up-peak 1.5 %, over n = 100 at the study seed. No budget in the 50–200 band fits under ' +
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
    ceiling: 951,
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
    ceiling: 386,
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
