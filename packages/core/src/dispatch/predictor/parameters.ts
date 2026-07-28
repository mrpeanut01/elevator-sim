/**
 * The predictor's self-describing parameter schema — CLAUDE.md invariant 8.
 *
 * `dispatch/parameters.ts` records why these six were not declared in Phase 2:
 *
 * > `idle.predictorHorizonS`, `idle.predictorLearningRate` — declared by **nobody, yet**.
 * > *Phase 5 owns the learned arrival model. Nothing in Phase 2 reads either, so declaring them
 * > would violate rule 2 above and send the optimizer hunting a dimension with no effect. They
 * > land with the predictor.*
 *
 * This is that landing. The same two rules apply and are asserted in both directions by
 * `parameters.test.ts`:
 *
 * 1. **Nothing hidden.** Every field of {@link ResolvedPredictorConfig} is declared. A knob the
 *    model reads but does not declare is invisible to a Phase 7 optimizer, which will then
 *    report a tuned winner that is only optimal at whatever the hidden value happened to be.
 * 2. **Nothing spurious.** Every declared parameter resolves to a field the model actually
 *    reads. Each evaluation costs 50–200 replications, and a noisy objective will happily
 *    attribute a difference to a dimension that does nothing.
 *
 * ## Why the ranges cannot be sampled into an invalid combination
 *
 * A generic optimizer samples each row independently, so any constraint *between* two rows is a
 * constraint it will violate. There is deliberately none here: `predictorBucketWidthS` need not
 * divide `predictorCycleS`, because the last bucket of a cycle is allowed to be short and is
 * priced at its own width. The alternative — rejecting an indivisible pair — would make a large
 * part of the declared box throw, and an optimizer cannot tell a throw from a bad score.
 */

import type { DispatchParameterSpec } from '../types.js';

import type { ResolvedPredictorConfig } from './types.js';

/* -------------------------------------------------------------------------- *
 * Defaults
 * -------------------------------------------------------------------------- */

/**
 * Every predictor default, in one frozen object.
 *
 * The single source of truth: {@link PREDICTOR_PARAMETERS} quotes these rather than repeating
 * the numbers, and `resolvePredictorConfig` applies them, so the declared schema and the
 * resolver cannot disagree.
 *
 * Unlike `DISPATCH_DEFAULTS`, these do **not** describe the simplest thing that works — an
 * inert predictor is not a predictor, and a model that has to be configured before it forecasts
 * anything would make `parkingStrategy: predicted-demand` report `no-forecast` by default. They
 * describe a working five-minute-resolution daily model, and the profile that wants a different
 * one says so.
 */
export const PREDICTOR_DEFAULTS = Object.freeze({
  /**
   * 300 s, the value `predictive-balanced` already authors in
   * `data/dispatcher-profiles.json → idle.predictorHorizonS`.
   *
   * Also the right order of magnitude on its own terms: a car repositioning across a 20-floor
   * shaft takes tens of seconds, so a horizon shorter than a minute forecasts demand the car
   * cannot reach in time, and one much longer than five minutes averages over a demand pattern
   * that has moved on.
   */
  predictorHorizonS: 300,
  /**
   * 0.3 — the newest completed bucket gets 30% of the weight, giving an effective memory of
   * about `1 / 0.3` ≈ 3.3 buckets.
   *
   * Deliberately fast. A `rise-and-fall` replication is 30 minutes
   * (docs/03-traffic-and-statistics.md § The independence condition), which at the default
   * bucket width is **five completed buckets**. A textbook 0.05 would leave the prior in charge
   * for the whole run, and a predictor that has not moved by the end of the measurement window
   * cannot be shown to help.
   */
  predictorLearningRate: 0.3,
  /**
   * 300 s — the five-minute interval all elevator demand figures are quoted in (CIBSE Guide D
   * up-peak percentages, `data/traffic-profiles.json`), so one bucket is one canonical demand
   * measurement.
   */
  predictorBucketWidthS: 300,
  /**
   * 86 400 s. Demand in a building repeats daily: the morning up-peak, the lunch two-way peak
   * and the evening down-peak are properties of the hour, which is what makes a *time-of-day*
   * model worth learning at all rather than a single running rate.
   */
  predictorCycleS: 86_400,
  /**
   * 0.005 arrivals/s per (floor, direction) — about 18 per hour, a plausible off-peak rate for
   * one landing.
   *
   * This comment used to say the **level** was "close to inert by construction", because a
   * uniform prior ranks no floor above another. That is true of the *argmax* and false of
   * everything else stage 7 computes. `expectedResponseSeconds` takes a **demand-weighted mean**
   * of the response time from a candidate park to every served floor, so a uniform additive term
   * changes the weights it averages over: measured on 20 floors after 1 800 s of identical
   * observations, the busiest-to-quietest forecast ratio runs 27.6 at a prior of 0, 14.6 at the
   * default and 2.3 at the top of the declared range. Through a real run on Garden Apartments at
   * the 2 s deadband where repositioning actually fires, a prior of 0.0005 changes the journeys
   * on 2 of 3 seeds and moves AWT by +0.68 s and +1.59 s. It is a live dimension.
   *
   * What it must not be is zero — a zero prior makes the cold-start forecast zero everywhere,
   * which is indistinguishable from "no demand anywhere" and would park cars by floor-id order
   * for the first minutes of every run.
   */
  predictorPriorRatePerS: 0.005,
  /**
   * 2 pseudo-observations. Two completed buckets of real evidence at a floor outweigh the prior
   * there.
   *
   * The knob that decides how fast the model is allowed to believe itself. Zero trusts the
   * first bucket completely, which on a landing that saw one passenger in five minutes is a
   * rate estimate with a 100% coefficient of variation; large numbers hold the prior past the
   * end of a 30-minute replication and make the model inert.
   */
  predictorPriorStrength: 2,
} as const);

/* -------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------- */

/**
 * The schema for every predictor tunable.
 *
 * `id` is the dotted path in `data/dispatcher-profiles.json`, so a tuned winner is written back as
 * a profile without translation — **for all six**. This paragraph used to say "for two of the six
 * today", because `idleStageSchema` rejected the other four as unrecognized keys under `idle`: an
 * optimizer could sample all six and persist two, which is invariant 8 met on 2 of 6 dimensions.
 * All six rows are in the schema, and `dispatch/parameters.test.ts` runs every declared id in every
 * dispatch schema through the real profile parser and back out of the real resolver, so the claim
 * is asserted rather than written down.
 *
 * ## None of the six rows carries an `activeWhen`, and that is the honest answer rather than an
 * omission
 *
 * This paragraph used to claim four of the six were gated on
 * `{ 'idle.parkingStrategy': ['predicted-demand'] }`. None of them is, and none of *those five*
 * should be. A forecast informs **two independent mechanisms** — where an idle car parks
 * (stage 7) and the `predictedDemand` cost term (stage 3) — so each of them is live when *either*
 * the parking strategy is `predicted-demand` *or* `weights.predictedDemand` is above zero.
 *
 * That is a **disjunction**, and `DispatchParameterSpec.activeWhen` is a conjunction of
 * conditions: every entry must hold. There is no form that expresses "either of these". Gating on
 * the parking strategy alone would be worse than not gating, because it would tell an optimizer to
 * stop tuning the forecast for a profile that scores on `predictedDemand` and parks with `stay` —
 * a live dimension declared dead, which is the failure this schema's `description` fields have
 * already had twice. So the condition is stated here and those rows stay ungated: an optimizer
 * that over-searches a dimension wastes budget, one that skips a live dimension reports a winner
 * that is only optimal at whatever the default happened to be.
 *
 * **That last sentence is why the sixth row lost its gate too**, and it is worth stating as a
 * rule rather than as an anecdote: `activeWhen` may only carry a condition it can express
 * *exactly*. An approximate gate is not a conservative simplification — it is the "skips a live
 * dimension" error with a machine-readable face on it, and it is the harder of the two to find,
 * because the region it hides is precisely the region nothing ever probes.
 *
 * ## The sixth row — and the claim above used to be **false** for it
 *
 * This paragraph asserted, in the present tense, that *"every one of these six is live"* whenever
 * either of those two conditions holds. Both hold for the shipped `predictive-balanced` profile,
 * which authors `idle.parkingStrategy: predicted-demand`, `weights.predictedDemand: 0.4` **and**
 * `idle.predictorHorizonS: 300` — and sweeping `idle.predictorHorizonS` across the whole declared
 * `[30, 3600]` log range, a factor of 120, produced exactly **one** passenger-record trajectory on
 * every shipped building. The claim was wrong, and it was wrong in the direction that costs the
 * most: an optimizer told a flat plateau is live spends 50–200 replications an evaluation on it
 * and then reports whichever value the draw held as part of a tuned winner.
 *
 * The mechanism. `forecast()` integrates `estimatedRate(floor, direction, bucket, fromT)` over
 * `[fromT, fromT + horizon]`. At a `predictorCycleS` longer than the whole span the model is
 * observed and queried over — which the 86 400 s default is for every replication this project
 * runs — no bucket-of-day recurs, `completedOccurrences` is 0 for every bucket in the window, and
 * `estimatedRate` shrinks every one of them to the same landing-level rate. The integral is then
 * exactly `rate x horizon` for every (floor, direction), and all three consumers of the forecast
 * reduce it to a **scale-invariant** statistic: `expectedResponseSeconds` and `demandMisalignmentM`
 * are demand-weighted means, and stage 7's `parkingCandidates` is an argmax. A uniform multiplier
 * cancels out of all three.
 *
 * So the horizon is live exactly when the cycle is short enough that a bucket-of-day comes round
 * inside one replication.
 *
 * ## And it was gated on an approximation of that, which was unsound
 *
 * This row shipped with `activeWhen: { 'idle.predictorCycleS': { max: 1800 } }` and a measurement
 * that does not reproduce. Re-measured at seed 20260726 over horizons {30, 120, 300, 900, 3600},
 * against `predictive-balanced` on the shipped buildings:
 *
 * ```
 *                       cycle 86 400   3 600   1 800    900    600
 * garden-apartments                1       1       1      1      1
 * secure-tower                     1       2       4      3      2
 * midtown-office                   1       1       1      1      1
 * ```
 *
 * Two things are wrong with the old note. It named **garden-apartments** as producing 2 distinct
 * trajectories at cycle 1 800; garden-apartments produces **1** at every cycle tried. The
 * building on which this dimension is live is **secure-tower**. And, the reason the gate had to
 * go: at cycle 3 600 — *outside* the gate, where a generic optimizer was told not to look — the
 * horizon still produces 2 distinct trajectories. The gate skipped a live dimension, which the
 * paragraph above calls the worse of the two errors in so many words.
 *
 * 1 800 s was neither necessary nor sufficient. The true condition is **relational** — roughly
 * `horizon >= cycle`, a bucket-of-day recurring inside the window — and it is not a comparison
 * against a constant at all, so no `activeWhen` bound is correct for more than the one cycle it
 * was fitted to (the shipped 86 400, where the row is inert).
 *
 * So the row is **ungated**, exactly like the other five, and for the same reason: the condition
 * is stated here because it cannot be stated there. Being ungated is not a claim that the
 * dimension is live at the shipped defaults — it is not — and that claim is not left to prose
 * either: `sim/searchSpaceLiveness.test.ts` carries it in `DECLARED_INERT`, whose entries must
 * **prove** the condition under which the dimension is live by executing it. That is a stronger
 * obligation than a gate, which carried none at all.
 */
export const PREDICTOR_PARAMETERS: readonly DispatchParameterSpec[] = Object.freeze([
  {
    id: 'idle.predictorHorizonS',
    type: 'continuous',
    range: [30, 3600],
    scale: 'log',
    default: PREDICTOR_DEFAULTS.predictorHorizonS,
    unit: 's',
    description:
      'How far ahead the demand forecast looks, seconds. The forecast is an expected arrival count over this window, so the horizon sets what "likely to appear soon" means: short enough that the estimate is about the demand a repositioning car can still get in front of, long enough that a car has time to travel there. Log scale because the interesting range spans two orders of magnitude. Live exactly when a bucket-of-day recurs inside the window — roughly when the horizon reaches the cycle. While it does not, every bucket in the window shrinks to the same landing-level rate, the forecast integrates to exactly rate x horizon, and all three consumers (two demand-weighted means and an argmax) are invariant under a uniform scaling of it, so the whole declared range is one bit-identical run. That condition is relational and cannot be written as an activeWhen bound on the cycle alone: measured at seed 20260726 the horizon moves secure-tower at cycle 1800 (4 trajectories) AND at cycle 3600 (2), so a gate at max 1800 skipped a live region. Inert at the shipped cycle of 86400 and searchable below it; searching it against a fixed cycle is searching a real dimension.',
  },
  {
    id: 'idle.predictorLearningRate',
    type: 'continuous',
    range: [0.01, 1],
    scale: 'log',
    default: PREDICTOR_DEFAULTS.predictorLearningRate,
    description:
      'Weight the exponentially-weighted moving average puts on the newest completed bucket, in (0, 1]. Effective memory is about 1 / rate buckets, and it also caps how much evidence any one level of the model is allowed to accumulate, so a low rate is both slow to adapt and slow to trust itself. 1.0 keeps only the most recent bucket; 0 would be a model that can never learn and is rejected rather than accepted as an inert predictor.',
  },
  {
    id: 'idle.predictorBucketWidthS',
    type: 'continuous',
    range: [30, 1800],
    scale: 'log',
    default: PREDICTOR_DEFAULTS.predictorBucketWidthS,
    unit: 's',
    description:
      'Width of one time-of-day bucket, seconds — the resolution of the learned pattern and the exposure window a rate estimate is computed over. Narrow buckets resolve a sharper peak but each holds fewer arrivals, so the estimate is noisier: a landing seeing 18 arrivals an hour puts 1.5 in a five-minute bucket and 0.25 in a one-minute bucket. Need not divide the cycle; a short final bucket is priced at its own width.',
  },
  {
    id: 'idle.predictorCycleS',
    type: 'continuous',
    range: [600, 86_400],
    scale: 'log',
    default: PREDICTOR_DEFAULTS.predictorCycleS,
    unit: 's',
    description:
      'Period over which the time-of-day pattern is assumed to repeat, seconds. A day for an office; a shift length for a building whose demand turns over faster than that. It is what makes the model per-time-of-day rather than a single running rate. Inert only while the cycle is longer than the whole span the model is observed and queried over, which at the 86 400 s default is every replication this project runs: no bucket-of-day recurs, so the per-bucket cells never accumulate and the model leans on its per-landing estimate. Below that span it is live, and not marginally — on 30 minutes of observations a 600 s cycle and the default differ by about 30% in the same forecast, because a bucket-of-day now comes round several times inside one replication. So it is worth searching exactly when the cycle is shorter than the run, and searching it against a fixed run length is searching a real dimension rather than a plateau. activeWhen cannot express the condition, because it is the run length rather than another parameter.',
  },
  {
    id: 'idle.predictorPriorRatePerS',
    type: 'continuous',
    range: [0, 0.1],
    scale: 'linear',
    default: PREDICTOR_DEFAULTS.predictorPriorRatePerS,
    unit: 'arrivals/s',
    description:
      'Prior arrival rate per (floor, direction) before any evidence, arrivals per second. Uniform, so it never ranks one floor above another and the argmax parkingStrategy: predicted-demand picks is insensitive to it — but it is NOT inert, and the description said it was until it was measured. Stage 7 scores a park by a demand-weighted mean response time, so a uniform additive term changes the weights that mean averages over: the busiest-to-quietest forecast ratio runs 27.6 at a prior of 0, 14.6 at the 0.005 default and 2.3 at the top of this range, and through a real run on garden-apartments at a 2 s deadband a prior of 0.0005 changes the journeys on 2 of 3 seeds and moves AWT by up to 1.6 s. Search it. Its other job is to keep the cold-start forecast positive and finite rather than zero everywhere, which would be read as "no demand anywhere". An explicit per-floor prior overrides it.',
  },
  {
    id: 'idle.predictorPriorStrength',
    type: 'continuous',
    range: [0, 20],
    scale: 'linear',
    default: PREDICTOR_DEFAULTS.predictorPriorStrength,
    description:
      'Strength of the prior, in pseudo-observations of a completed bucket, and the same weight used at every level of the backoff chain. It buys the cold start: with strength 2 a floor needs two completed buckets of evidence before it outweighs the prior, and until then a single lucky passenger cannot make one landing look like the busiest in the building. 0 trusts the first bucket completely; large values hold the prior past the end of a 30-minute replication.',
  },
] as const satisfies readonly DispatchParameterSpec[]);

/** Every declared id, for a quick membership test. */
export const PREDICTOR_PARAMETER_IDS: ReadonlySet<string> = new Set(
  PREDICTOR_PARAMETERS.map((parameter) => parameter.id),
);

/** A declared parameter by id. */
export function predictorParameter(id: string): DispatchParameterSpec | undefined {
  return PREDICTOR_PARAMETERS.find((parameter) => parameter.id === id);
}

/* -------------------------------------------------------------------------- *
 * Reading a parameter back out of a resolved config
 * -------------------------------------------------------------------------- */

/**
 * The value a resolved config holds for a declared parameter id, or `undefined` if the id is
 * not one of the declared ones.
 *
 * What makes invariant 8 checkable rather than aspirational: an optimizer reads back what it
 * sampled, and `parameters.test.ts` proves a probe value written into an `idle` section reaches
 * the field the model reads.
 */
export function predictorParameterValue(
  config: ResolvedPredictorConfig,
  id: string,
): number | undefined {
  if (!id.startsWith('idle.')) return undefined;
  const key = id.slice('idle.'.length);
  if (!Object.hasOwn(config, key)) return undefined;
  const value = (config as unknown as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Every `idle.<key>` path the resolved config exposes as a tunable, in a stable order.
 *
 * The counterpart of {@link predictorParameterValue}: it enumerates what the model reads so a
 * test can assert {@link PREDICTOR_PARAMETERS} covers all of it and nothing else.
 */
export function tunablePredictorPathsOf(config: ResolvedPredictorConfig): readonly string[] {
  return Object.freeze(Object.keys(config).map((key) => `idle.${key}`));
}
