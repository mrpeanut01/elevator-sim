/**
 * **The configuration space a budget rung reaches, and how it is sampled** — the half of GitHub
 * issue **#367** that runs nothing.
 *
 * [§ D525](../../../../DECISIONS.md) clause 3 is the owner's definition of difficulty, and it is
 * two operations rather than one:
 *
 * > *"take every configuration the budget can reach on the schedule, judge each on the scenario's
 * > seeds under common random numbers against the scenario's goals, and count the ones that clear."*
 *
 * This module is *take every configuration the budget can reach on the schedule*. `measureSurvivors.ts`
 * is the judging, and `survivors.ts` is the table the count is published in. The split is
 * `scenario/`'s own — `candidates.ts` says what is measured, `measure.ts` measures it, `published.ts`
 * holds the shape — and it exists so that the expensive half can be re-derived against a pin while
 * the cheap half is asserted on every pull request.
 *
 * ## What a *configuration* is, and the one exclusion that makes the count mean what § D525 says
 *
 * A configuration is a **non-empty bundle of priced changes the rung can pay for, with a value drawn
 * for every dimension those changes cover.** Three decisions are folded into that sentence and each
 * is stated rather than assumed:
 *
 * 1. **Only dimensions the schedule prices are varied.** § D525 says *the budget can reach on the
 *    schedule*, and `budget.ts#admitPurchase` already records that a dimension the schedule prices
 *    nothing for costs nothing and is reported rather than charged. A configuration that differs
 *    only on an unpriced dimension is reachable at **every** rung including the base, so counting
 *    those would make every rung's survivor count identical and the budget — the whole subject of
 *    this issue — inert. **The excluded set is published rather than hidden**:
 *    {@link unpricedDimensionIds} names it and `survivors.ts` carries its count on every record, so
 *    a reader meets the exclusion beside the number it shaped. It held 35 of the 59 declared
 *    dimensions until GitHub issue #467 priced twenty-two of them and **withheld** the other
 *    thirteen, and a withheld dimension is excluded for the opposite reason — no rung reaches it at
 *    all, because no scenario sells it ([§ D535](../../../../DECISIONS.md)). {@link withheldDimensionIds}
 *    names those, and the record counts them apart from the unpriced ones rather than folding one
 *    exclusion into the other.
 * 2. **Only changes that can reach a scenario run are counted as reachable.** A campaign scenario
 *    runs through `campaign/stageRun.ts#batchRequestForStage`, whose two knobs are a dispatcher
 *    profile and an edited weight vector. A priced change whose `covers` list names only
 *    `shop.*`, `building.*` or `editor.*` paths prices something no scenario run can apply, so it
 *    is **not** reachable here — {@link unreachableChangeIdsOf} names them, and `survivors.ts`
 *    publishes the list on the table's header. That is a bound on this measurement rather than a
 *    claim about the schedule, and
 *    saying so is the difference between a count that is small and a count that is wrong.
 * 3. **The empty bundle is excluded.** Buying nothing is the scenario as it was handed over, not a
 *    way through it — and it is measured in every cell anyway, because it is arm 0 of every batch
 *    `batchRequestForStage` builds. Including it would spend a replication budget re-deriving the
 *    baseline and would add a configuration that can never clear `beat-the-baseline`, which would
 *    depress every count by one for a reason that has nothing to do with the scenario.
 *
 * ## The space is **never** exhaustively enumerable, and that is measured rather than assumed
 *
 * Issue #367 expects a sample *"where the space is too large to enumerate — the building tier"*.
 * Measured, the sample is needed at **every** rung including the cheapest, and
 * {@link bundleSpaceOf} reports it as a fact about the rung rather than as a policy: the cheapest
 * priced change on the ladder is `idle-parking` at 0 units, and two of the four dimensions it
 * covers — `idle.repositionThresholdS` and `idle.repositionEnergyWeight` — are **continuous**. A
 * continuous dimension has no finite value set to enumerate, so a rung that can afford anything at
 * all already reaches an uncountable space.
 *
 * {@link BundleSpace.enumerable} is therefore computed rather than declared, and `survivors.ts`
 * refuses a record that claims an exhaustive count over a space this function calls uncountable.
 * The day somebody prices a change covering only categorical dials, a rung becomes enumerable and
 * the field says so without an edit here.
 *
 * ## How it is sampled: propose a bundle, and keep what the player could actually have moved
 *
 * Uniform over the affordable bundles, then {@link sampleValue} for each dimension the bundle
 * covers — the search space's **own** draw, honouring each dimension's declared type, bounds and
 * scale, rather than a second sampler this module would have to keep in step with it. The stream is
 * `policyNoiseStream`, which is the stream a search draws from, seeded from a pinned integer.
 * `CLAUDE.md` invariant 2 forbids a global RNG anywhere, and a sampler whose seed is not published
 * is a measurement nobody can reproduce.
 *
 * **A drawn dial is dropped when the player could not have moved it, and that is the definition
 * rather than a repair.** Measured on the shipped ladder, 85 % of naive draws are refused outright,
 * and not one of those refusals is an infeasible dispatcher — every one is a **gate**:
 * `weights.rideTime` needs `dispatch.callType` to be a destination call type,
 * `idle.parkingFloorIndex` needs `idle.parkingStrategy` to be `fixed-floor`,
 * `answer.dwellAdaptationGain` needs `answer.dwellPolicy` to be `adaptive`. A dial whose gate is
 * shut is a **disabled control**: the player sees it and cannot move it, so a configuration in
 * which it is moved is not one the budget reaches. Rejecting those draws would have thrown away the
 * feasible configuration underneath each of them and left the sample uniform over nothing in
 * particular.
 *
 * So the draw is applied **one dial at a time in the space's declaration order** — the order gates
 * are written in, which is why `applyEdit` walks a record in insertion order — and a dial the
 * partially-built vector will not accept is left out. `weights.rideTime` therefore appears in a
 * configuration exactly when destination panels were also bought and the drawn call type opened the
 * gate, which is § D112's finding as a property of the sample rather than as a sentence about it.
 *
 * Two further draws are discarded rather than kept, and both are counted:
 *
 * - **A draw that moves nothing** — every dial dead, or every drawn value equal to the one the
 *   baseline already holds. That configuration *is* the baseline, which is arm 0 of every batch.
 * - **A draw the whole-candidate check refuses** — `admitEditedVector` speaks about a dispatcher
 *   *on this building* rather than about a dial, so a vector every step accepted can still be one
 *   `core` will not build. Those are rejected and redrawn, which keeps the sample uniform over the
 *   feasible set. **Both halves of that check matter and only one of them used to run here**
 *   (GitHub issue **#475**): `SearchSpace.validate` asks whether a group controller can be built,
 *   which is building-independent, and it cannot see that `answer.maxDwellS` under an adaptive
 *   dwell policy is bounded by a **car's** own door timings. Four vectors across the shipped
 *   ladder were drawn, admitted, and then thrown on at run time. The building is now an argument
 *   of {@link SampleRequest}, so the refusal happens where the draw does.
 *
 * A draw budget bounds the loop, so a rung whose feasible space is smaller than the sample asked
 * for reports a short sample rather than hanging.
 *
 * ## Two strata, and only one of them is sampled
 *
 * The reachable space has a countable corner and an uncountable one, and folding them into a single
 * uniform draw would spend most of a replication budget on the uncountable half while leaving the
 * one a player actually meets first to chance.
 *
 * - **The dropdown** — {@link dropdownConfigurationsOf}. Every shipped profile in
 *   `data/dispatcher-profiles.json`, priced by the changes covering the dimensions on which it
 *   differs from the scenario's baseline, and **taken exhaustively**: thirteen profiles is a
 *   population, not a sample. This is the stratum DC-2 was about — *no stage clears from the
 *   dispatcher dropdown alone* — and issue #365's comment makes the count its replacement.
 * - **The dials** — {@link sampleReachableConfigurations}. Everything a player can reach by moving
 *   controls rather than by picking a name, which is uncountable at every rung and is therefore
 *   sampled.
 *
 * `measureSurvivors.ts` publishes the two counts separately as well as together, so *"the count is
 * a sample"* is true of the half that is one and is not claimed of the half that is not.
 *
 * ## A configuration is what moved, not what was proposed
 *
 * After the drop, {@link DrawnConfiguration.changeIds} names only the changes that still move a
 * dial, and {@link DrawnConfiguration.units} sums only those. A bundle whose dear change ended up
 * moving nothing is not a dear configuration wearing a cheap one's clothes — it is the cheap one,
 * and pricing it at the dear tier would put survivors in the `equipment` column that a
 * dispatcher-tier budget reaches. That distinction is the whole of issue #367's *"reportable per
 * price tier"* clause, which is DC-2's replacement.
 *
 * The decision this module took is recorded in this docstring and cites
 * [§ D405](../../../../DECISIONS.md): it binds nothing outside `scenario/` and the data file that
 * directory publishes, so no `DECISIONS.md` number is owed for it.
 */

import type {
  DispatcherProfile,
  ElevatorSpecs,
  ResolvedBuilding,
} from '@elevator-sim/core/browser';
import {
  policyNoiseStream,
  sampleValue,
  type ParameterValue,
  type SearchParameter,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';

import { movedDimensions } from '../campaign/dimensions.js';
import { admitEditedVector, applyEdit, valuesFromProfile } from '../controls/editedProfile.js';
import { purchaseUnits } from '../pricing/parse.js';
import type { PriceSchedule, PricedChange } from '../pricing/types.js';

import { admitPurchase, withholdingDimension } from './budget.js';

/* -------------------------------------------------------------------------- *
 * What the schedule prices that a scenario run can actually reach
 * -------------------------------------------------------------------------- */

/** A priced change, resolved to the search-space dimensions it lets a player move. */
export interface ReachableChange {
  readonly changeId: string;
  readonly tier: string;
  readonly priceUnits: number;
  /** In the search space's own declaration order, which is the order gates are written in. */
  readonly dimensionIds: readonly string[];
}

/**
 * The dimension ids one priced change covers, in the space's declaration order.
 *
 * The match is `budget.ts#changePricingDimension`'s, read the other way round: that function walks
 * a dimension's dotted prefixes to find the change, and this one walks a change's `covers` paths to
 * find the dimensions. Both consult the schedule's own grouping rather than a second table, so a
 * re-grouped schedule moves both without an edit.
 *
 * The order is the space's rather than this module's, and it is load-bearing:
 * `controls/editedProfile.ts#applyEdit` walks an edit in insertion order precisely so that *"writing
 * the gate first is what lets the dependant become live in the same pass"*, and the space declares
 * `dispatch.callType` before `dispatch.passengerAssignment`.
 */
export function dimensionsCoveredBy(space: SearchSpace, change: PricedChange): readonly string[] {
  return space.parameters
    .filter((parameter) =>
      change.covers.some(
        (path) =>
          `dispatcher.${parameter.id}` === path || `dispatcher.${parameter.id}`.startsWith(`${path}.`),
      ),
    )
    .map((parameter) => parameter.id);
}

/**
 * Every priced change a scenario run can apply, with the dimensions it buys.
 *
 * Derived from the schedule and the discovered space in both directions rather than written down —
 * a change added to `data/price-schedule.json` covering a declared dimension arrives here with no
 * edit, and a change that stops covering one leaves.
 */
export function reachableChangesOf(
  space: SearchSpace,
  schedule: PriceSchedule,
): readonly ReachableChange[] {
  const out: ReachableChange[] = [];
  for (const change of schedule.changes) {
    const dimensionIds = dimensionsCoveredBy(space, change);
    if (dimensionIds.length === 0) continue;
    out.push({
      changeId: change.id,
      tier: change.tier,
      priceUnits: purchaseUnits(change),
      dimensionIds,
    });
  }
  return out;
}

/**
 * The priced changes a scenario run **cannot** apply, named rather than dropped.
 *
 * A count of survivors taken over a few of the schedule's priced changes is a different claim from one
 * taken over all of them, and a reader who is not told which is which will read the first as the
 * second. `survivors.ts` publishes this list on the table's header for that reason.
 */
export function unreachableChangeIdsOf(
  space: SearchSpace,
  schedule: PriceSchedule,
): readonly string[] {
  return schedule.changes
    .filter((change) => dimensionsCoveredBy(space, change).length === 0)
    .map((change) => change.id);
}

/**
 * Dimensions the schedule prices nothing for — the exclusion decision 1 of the module docstring
 * takes, as a list a reader can check.
 *
 * **Not the withheld ones**, which are {@link withheldDimensionIds}: a dimension nothing prices is
 * free and reachable at every rung, and a dimension the schedule withholds is reachable at none. The
 * two are excluded from the sample for opposite reasons, so they are two lists.
 */
export function unpricedDimensionIds(
  space: SearchSpace,
  schedule: PriceSchedule,
): readonly string[] {
  const priced = new Set(reachableChangesOf(space, schedule).flatMap((change) => change.dimensionIds));
  return space.parameters
    .map((parameter) => parameter.id)
    .filter((id) => !priced.has(id) && withholdingDimension(schedule, id) === undefined);
}

/**
 * Dimensions `data/price-schedule.json` withholds from every scenario — GitHub issue **#467**,
 * [§ D535](../../../../DECISIONS.md). No configuration varies one and no dropdown entry may move
 * one, so a survivor count is a count over a space these are not in, and the table says how many.
 */
export function withheldDimensionIds(
  space: SearchSpace,
  schedule: PriceSchedule,
): readonly string[] {
  return space.parameters
    .map((parameter) => parameter.id)
    .filter((id) => withholdingDimension(schedule, id) !== undefined);
}

/* -------------------------------------------------------------------------- *
 * The bundles a rung can pay for
 * -------------------------------------------------------------------------- */

/** What a rung of `units` can buy, as a countable set of bundles over an uncountable value space. */
export interface BundleSpace {
  /** Every non-empty bundle of reachable changes whose prices sum to at most the rung's units. */
  readonly bundles: readonly (readonly ReachableChange[])[];
  /**
   * Whether the whole configuration space is finite and could therefore be enumerated exactly.
   *
   * Measured, never declared: `false` as soon as any affordable bundle covers a `continuous`
   * dimension, because a continuous dimension has no value set to walk. See the module docstring —
   * on the shipped ladder this is `false` at every rung, which is a stronger statement than
   * issue #367 expected and is the reason every published record says *sampled*.
   */
  readonly enumerable: boolean;
  /** The exact number of distinct configurations, or `null` when {@link enumerable} is `false`. */
  readonly size: number | null;
}

/**
 * The bundles a rung can pay for, and whether the space they open is finite.
 *
 * Distinct changes are summed once, for `budget.ts#admitPurchase`'s stated reason: a player who
 * moves two weights has re-tuned the dispatcher **once**, and charging twice would invent a price
 * the ladder does not hold. A bundle is a *set* of changes, so the same arithmetic applies here by
 * construction.
 */
export function bundleSpaceOf(
  space: SearchSpace,
  reachable: readonly ReachableChange[],
  units: number,
): BundleSpace {
  const bundles: (readonly ReachableChange[])[] = [];
  const total = 1 << reachable.length;
  for (let mask = 1; mask < total; mask += 1) {
    const bundle = reachable.filter((_, index) => (mask & (1 << index)) !== 0);
    if (bundle.reduce((sum, change) => sum + change.priceUnits, 0) <= units) bundles.push(bundle);
  }

  let enumerable = true;
  let size = 0;
  for (const bundle of bundles) {
    let combinations = 1;
    for (const id of bundle.flatMap((change) => change.dimensionIds)) {
      const cardinality = valueCountOf(parameterOf(space, id));
      if (cardinality === null) {
        enumerable = false;
        break;
      }
      combinations *= cardinality;
    }
    if (!enumerable) break;
    size += combinations;
  }

  return { bundles, enumerable, size: enumerable ? size : null };
}

/** How many declared values a dimension has, or `null` where it has uncountably many. */
function valueCountOf(parameter: SearchParameter): number | null {
  switch (parameter.type) {
    case 'categorical':
      return parameter.values.length;
    case 'boolean':
      return 2;
    case 'integer':
      return parameter.max - parameter.min + 1;
    case 'continuous':
      return null;
  }
}

function parameterOf(space: SearchSpace, id: string): SearchParameter {
  const found = space.parameters.find((parameter) => parameter.id === id);
  if (found === undefined) throw new Error(`the search space does not declare "${id}"`);
  return found;
}

/* -------------------------------------------------------------------------- *
 * The countable stratum: the dropdown
 * -------------------------------------------------------------------------- */

/** One shipped dispatcher profile, priced as a purchase against a scenario's baseline. */
export interface DropdownConfiguration {
  readonly profileId: string;
  /** Price-schedule change ids the switch buys, in schedule order. */
  readonly changeIds: readonly string[];
  /** The dearest tier those changes reach, by `PriceTier.order`. */
  readonly tier: string;
  /** What the switch costs, distinct changes summed once. */
  readonly units: number;
  /** Dimensions it moves that the schedule prices nothing for — reported, never charged. */
  readonly unpricedDimensionIds: readonly string[];
}

/**
 * Every shipped profile a player could pick, priced against `baseline`.
 *
 * The baseline itself is excluded and so is any profile that runs the same system on every declared
 * dimension: `dimensions.ts#admitProfile` already calls that *"the control this surface is meant to
 * survive"*, and a configuration identical to the baseline is the baseline, which is arm 0 of every
 * batch. It is not a way through the scenario.
 *
 * **`admitProfile`'s `editable` filter is deliberately not applied, and that is a ruling rather
 * than a shortcut.** `difficultyCurve.test.ts`'s DC-2 sweep admits a profile only if every
 * dimension it moves is in the stage's own `editable` list, which is why its register names three
 * stages and not ten. [§ D525](../../../../DECISIONS.md) clause 2 **retires per-scenario control
 * lists** — *"the whole editor is open in every scenario … what varies between scenarios is the
 * budget and the building, never which controls are offered"* — so what bounds the space here is
 * the **price**, and only the price. The two populations therefore differ on purpose, and the
 * difference is visible in the counts: `zoned-uppeak` clears `stage-1-first-call` and appears in no
 * DC-2 register, because that stage's legacy `editable` list does not open the dials it moves.
 * Re-authoring those lists is GitHub issue #233's.
 *
 * The price is `budget.ts#admitPurchase`'s, so the dropdown and the dials are charged by one
 * function: a player who switches to a profile whose weights differ has re-tuned the dispatcher
 * once, whatever the profile is called, and a profile that moves only dimensions the schedule
 * prices nothing for costs nothing and says so.
 *
 * **A profile that moves a dimension the schedule withholds is not in the population** — GitHub
 * issue **#467**, [§ D535](../../../../DECISIONS.md). Picking it by name would set a dial no
 * scenario sells, so it is no more a way through than the baseline is, and `admitPurchase` refuses
 * it at any budget. That is the ruling applied to the countable stratum, and on the shipped profiles
 * it excludes nothing: read off `data/dispatcher-profiles.json`, no profile authors a `selection`
 * dial, and the one that authors a predictor dial, `predictive-balanced`, sets
 * `idle.predictorHorizonS` to 300, which is the declared default — so against a baseline that holds
 * the default it moves nothing withheld. Both halves are held in `survivors.test.ts`: *leaves out a
 * profile that moves a withheld dial, and keeps one that moves only priced dials* holds the drop,
 * and *offers every shipped profile that runs a different system, and never the baseline itself*
 * holds that no shipped profile is dropped against `collective`.
 */
export function dropdownConfigurationsOf(
  space: SearchSpace,
  schedule: PriceSchedule,
  baseline: DispatcherProfile,
  profiles: readonly DispatcherProfile[],
): readonly DropdownConfiguration[] {
  const order = tierOrderOf(schedule);
  const byId = new Map(schedule.changes.map((change) => [change.id, change]));
  const out: DropdownConfiguration[] = [];
  for (const candidate of profiles) {
    if (candidate.id === baseline.id) continue;
    const moved = movedDimensions(space, baseline, candidate).map((dimension) => dimension.id);
    if (moved.length === 0) continue;
    const admission = admitPurchase(schedule, Number.MAX_SAFE_INTEGER, moved);
    if (admission.withheld.length > 0) continue;
    const bought = admission.changeIds
      .map((id) => byId.get(id))
      .filter((change): change is PricedChange => change !== undefined);
    out.push({
      profileId: candidate.id,
      changeIds: admission.changeIds,
      tier: dearestTierOf(
        bought.map((change) => ({
          changeId: change.id,
          tier: change.tier,
          priceUnits: purchaseUnits(change),
          dimensionIds: [],
        })),
        order,
      ),
      units: admission.units,
      unpricedDimensionIds: admission.unpriced,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * The uncountable stratum: the dials
 * -------------------------------------------------------------------------- */

/** One configuration a rung reaches: what was bought, what it cost, and where the dials went. */
export interface DrawnConfiguration {
  /** Price-schedule change ids, in schedule order. What the player bought. */
  readonly changeIds: readonly string[];
  /** The dearest tier in the bundle, by `PriceTier.order` — the tier the player had to reach. */
  readonly tier: string;
  /** What the bundle cost, distinct changes summed once. */
  readonly units: number;
  /** Dimension id → drawn value, the shape `controls/editedProfile.ts#EditedVector` carries. */
  readonly values: Readonly<Record<string, ParameterValue>>;
}

/** A drawn sample, with everything a reader needs to redo the draw and to judge how it went. */
export interface SampledSpace {
  readonly configurations: readonly DrawnConfiguration[];
  /** Draws attempted, including every one discarded below. */
  readonly draws: number;
  /**
   * Draws the **whole-candidate** check refused — a dispatcher `core` will not build *here*.
   *
   * Published rather than swallowed, and it is a narrower quantity than it looks: a dial whose gate
   * is shut is dropped rather than counted here, so this is `admitEditedVector` speaking about the
   * assembled dispatcher. See the module docstring on why the two are not the same refusal.
   *
   * **Two checks since GitHub issue #475, and the second is why the word *here* is in the sentence
   * above**: `SearchSpace.validate` asks whether a group controller can be built at all, and
   * `buildingFeasibility` asks whether {@link SampleRequest.building}'s own cars will take it.
   * A count that moved when a scenario changed building would be this second half doing its job.
   */
  readonly refusedDraws: number;
  /** Draws that moved nothing — every dial dead, or every drawn value the one already held. */
  readonly inertDraws: number;
  /** Draws discarded because an identical configuration had already been drawn. */
  readonly duplicateDraws: number;
  /**
   * Dimension ids dropped at least once because their gate was shut, with how often.
   *
   * A diagnostic rather than a result, and it is the one that says whether a rung's sample is
   * exploring the space or grinding against a gate. `weights.rideTime` dominating it at a rung that
   * cannot afford destination panels is § D112's finding, measured here rather than asserted.
   */
  readonly droppedDimensions: Readonly<Record<string, number>>;
}

export interface SampleRequest {
  readonly space: SearchSpace;
  readonly schedule: PriceSchedule;
  /** The profile a configuration is an edit of — the scenario's own baseline. */
  readonly baseline: DispatcherProfile;
  /**
   * The building the scenario runs on — GitHub issue **#475**.
   *
   * A drawn vector is admissible **on a building**, never in the abstract: `answer.maxDwellS`
   * under an adaptive dwell policy is bounded by a car's own door timings, so the same draw is a
   * configuration at one tower and a crash at the next. Before this field existed, this sampler
   * asked `admitEditedVector` a building-independent question, kept **four** vectors across the
   * shipped ladder that `core` then threw on, and `measureSurvivors.ts` had to count them out of
   * `examined` — which put a product defect inside a difficulty measurement.
   *
   * Required rather than optional, and that is the whole of the fix: an optional building is a
   * sampler that will be called without one.
   */
  readonly building: ResolvedBuilding;
  /** The shipped sensor defaults the building's cars resolve against. See {@link building}. */
  readonly elevatorSpecs: ElevatorSpecs | undefined;
  /** The rung's units. */
  readonly units: number;
  /** How many distinct feasible configurations to draw. */
  readonly sampleSize: number;
  /** The sampler's seed. Pinned in `data/scenario-survivors.json`; see {@link samplerSeedFor}. */
  readonly seed: number;
  /**
   * How many draws to attempt before giving up, as a multiple of {@link sampleSize}.
   *
   * A bound rather than a `while (true)`: a rung whose feasible space is smaller than the sample
   * asked for must report a short sample, not hang. The shortfall is visible in
   * `configurations.length`, which `survivors.ts` checks against the record's own declared size.
   */
  readonly drawBudgetMultiple?: number | undefined;
}

/** The default draw budget — twenty attempts per configuration wanted. */
export const DEFAULT_DRAW_BUDGET_MULTIPLE = 20;

/**
 * Draw `sampleSize` distinct feasible configurations the rung can pay for.
 *
 * Uniform over the affordable bundles and then over each covered dimension's declared domain; a
 * draw the space refuses is rejected and redrawn. See the module docstring for why rejection rather
 * than repair, and why the seed is a published field rather than a constant.
 */
export function sampleReachableConfigurations(request: SampleRequest): SampledSpace {
  const { space, schedule, baseline, building, elevatorSpecs, units, sampleSize, seed } = request;
  const reachable = reachableChangesOf(space, schedule);
  const { bundles } = bundleSpaceOf(space, reachable, units);
  const order = tierOrderOf(schedule);
  const rng = policyNoiseStream(seed);
  const held = valuesFromProfile(space, baseline);

  const configurations: DrawnConfiguration[] = [];
  const seen = new Set<string>();
  const dropped: Record<string, number> = {};
  const budget = sampleSize * (request.drawBudgetMultiple ?? DEFAULT_DRAW_BUDGET_MULTIPLE);
  let draws = 0;
  let refusedDraws = 0;
  let inertDraws = 0;
  let duplicateDraws = 0;

  while (configurations.length < sampleSize && draws < budget && bundles.length > 0) {
    draws += 1;
    const bundle = bundles[rng.nextInt(0, bundles.length)];
    if (bundle === undefined) continue;

    /*
     * One dial at a time, in the space's declaration order, so a gate written earlier in the draw
     * can open a dependant later in it. A dial the partly-built vector will not take is left out —
     * see the module docstring: that is a disabled control, not a rejected configuration.
     */
    let values = held;
    const moved: Record<string, ParameterValue> = {};
    for (const id of bundle.flatMap((change) => change.dimensionIds)) {
      const drawn = sampleValue(parameterOf(space, id), rng);
      if (values.get(id) === drawn) continue;
      const step = applyEdit(space, values, { [id]: drawn });
      if (!step.ok) {
        dropped[id] = (dropped[id] ?? 0) + 1;
        continue;
      }
      values = step.values;
      moved[id] = drawn;
    }

    const movedIds = Object.keys(moved);
    if (movedIds.length === 0) {
      inertDraws += 1;
      continue;
    }
    if (!admitEditedVector(space, baseline, moved, { building, elevatorSpecs }).admissible) {
      refusedDraws += 1;
      continue;
    }

    const bought = bundle.filter((change) =>
      change.dimensionIds.some((id) => movedIds.includes(id)),
    );
    const key = JSON.stringify([bought.map((change) => change.changeId), moved]);
    if (seen.has(key)) {
      duplicateDraws += 1;
      continue;
    }
    seen.add(key);
    configurations.push({
      changeIds: bought.map((change) => change.changeId),
      tier: dearestTierOf(bought, order),
      units: bought.reduce((sum, change) => sum + change.priceUnits, 0),
      values: moved,
    });
  }

  return {
    configurations,
    draws,
    refusedDraws,
    inertDraws,
    duplicateDraws,
    droppedDimensions: dropped,
  };
}

/**
 * The sampler's seed for one cell, derived from the ids rather than authored per row.
 *
 * A seed table with thirty hand-written integers is thirty chances to paste the same one twice, and
 * two cells sharing a seed would draw the same bundle sequence — which looks like a coincidence and
 * is a defect. Derived from `(scenarioId, stepId)` and a master seed, so the pin carries the master
 * and every cell's seed is re-derivable from the two ids the record already names.
 *
 * `stepId` is the base rung's `null` written as the empty string, which is what makes the base rung
 * a keyed row like any other rather than a special case.
 */
export function samplerSeedFor(master: number, scenarioId: string, stepId: string | null): number {
  const key = `${scenarioId}#${stepId ?? ''}`;
  /* FNV-1a over the key, mixed with the master. A hash, not a random number: it must reproduce. */
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (master + hash) % 0x7fffffff;
}

/** Tier id → `PriceTier.order`, so nothing below branches on the word *dispatcher*. */
function tierOrderOf(schedule: PriceSchedule): ReadonlyMap<string, number> {
  return new Map(schedule.tiers.map((tier) => [tier.id, tier.order]));
}

/**
 * The dearest tier a bundle reaches, which is the tier the player had to climb to.
 *
 * `pricing/types.ts` makes `PriceTier.order` the ladder as data precisely so that nothing
 * downstream needs an `if` on a name, and this is the one place issue #367's *"reportable per price
 * tier"* clause needs the ladder rather than the set: a bundle spanning two tiers is not two
 * configurations, it is one that a dispatcher-tier budget could not have bought.
 */
export function dearestTierOf(
  bundle: readonly ReachableChange[],
  order: ReadonlyMap<string, number>,
): string {
  let best = bundle[0]?.tier ?? UNPRICED_TIER;
  for (const change of bundle) {
    if ((order.get(change.tier) ?? 0) > (order.get(best) ?? 0)) best = change.tier;
  }
  return best;
}

/**
 * The tier a configuration that buys **nothing priced** sits on.
 *
 * Not a rung of `data/price-schedule.json` and deliberately named rather than left as an empty
 * string: a shipped profile can differ from a scenario's baseline only on dimensions the schedule
 * prices nothing for — `budget.ts#admitPurchase` charges those nothing and reports them — so a
 * dropdown switch can cost zero units and be reachable at every rung. That is a real column in the
 * per-tier table and it is a fact about the **schedule**, not about the configuration: it says the
 * ladder has nothing to say about this change. An empty label would have read as a missing tier.
 */
export const UNPRICED_TIER = 'unpriced';
