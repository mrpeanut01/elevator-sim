/**
 * Patience: how long a person will stand at a landing before giving up and leaving.
 *
 * ## Why this module exists
 *
 * The 900 s abandonment horizon has been in this repository since Phase 8, and until now it
 * existed **only as a reporting concept**: `metrics/awtValidity.ts`'s fourth ground refuses a mean
 * when a leg passes it. Nobody actually left. The horizon judged the run without ever appearing in
 * it — a rider here would queue for twenty minutes without once glancing at the door, which
 * `README.md` § *What this does not claim* names as the gap this closes (docs/14 § 3.1).
 *
 * ## The measurement consequence, stated because it is not obvious
 *
 * **Abandonment improves AWT by construction.** It removes the longest waits from the sample, so a
 * configuration that abandons 30 % of its riders posts a superb average waiting time. This is the
 * same trap `EnergyStatistics.workPerServedLegKJ` exists for on a different axis (`DECISIONS.md`
 * § D106): *a configuration that spends less by serving fewer people has not saved anything.*
 *
 * Two consequences follow, and both are enforced elsewhere rather than merely written here:
 *
 * 1. The abandonment count is published **beside** AWT — `RunSummary.abandonment`, present exactly
 *    when somebody left — never folded into it.
 * 2. `awtIsValid` gains a fifth ground: an abandonment rate above a declared threshold suppresses
 *    the mean outright. See `metrics/awtValidity.ts`.
 *
 * ## Why the draw is pre-computed per planned leg, in trace order
 *
 * A patience value drawn at the moment a leg reaches a landing would be drawn in an order that
 * depends on **how the dispatcher behaved** — a sky-lobby continuation leg is admitted whenever the
 * previous leg happened to alight. Two arms of a paired comparison would then consume the
 * `patience` stream in different orders and see different people give up, which is common random
 * numbers destroyed on the demand side (CLAUDE.md invariant 2, and the tuning discipline's
 * *"feed the same passenger traces to every alternative"*).
 *
 * So {@link PatienceDraw} walks the **trace** — every journey in generated order, every planned leg
 * of it in index order — and draws one value each, before the run starts. The map it produces is a
 * pure function of `(trafficSeed, trace)`, so the same crowd is the same crowd whatever the lifts
 * do, and a leg the run never materializes simply never has its value looked up.
 *
 * Nothing here reads a clock (invariant 3) and every draw comes from the injected `patience`
 * stream (invariant 2).
 */

import type { Rng } from '../random/rng.js';
import type { SimTime } from '../kernel/types.js';

import type { SimParameterSpec } from './types.js';

/**
 * The distributions a patience curve may be declared as.
 *
 * `exponential` is the memoryless default: the hazard of leaving in the next second does not
 * depend on how long you have already stood there. It is the form the queueing literature reaches
 * for first and the one that needs a single parameter.
 *
 * `uniform` is the blunt alternative, and it is here because it is the one whose *shape* differs
 * visibly — bounded support, no tail — so a study can ask whether a result depends on the tail
 * rather than on the mean.
 */
export const PATIENCE_DISTRIBUTIONS = ['exponential', 'uniform'] as const;

export type PatienceDistribution = (typeof PATIENCE_DISTRIBUTIONS)[number];

/**
 * A declared patience curve. **Absent from a run config means nobody ever leaves**, which is
 * every run this repository produced before this type existed.
 */
export interface PatienceConfig {
  readonly distribution: PatienceDistribution;
  /**
   * Mean seconds a person will wait before abandoning.
   *
   * There is no default and there deliberately is not one: a default patience would put an
   * unstated behaviour into every run, and the whole of docs/14 § 0 is that a run which did not
   * ask for a feature must be the run it was before the feature existed.
   */
  readonly meanS: number;
  /**
   * Half-width of the `uniform` support, seconds — the draw is `meanS ± spreadS`, floored at
   * {@link minS}. Inert under `exponential`.
   */
  readonly spreadS?: number | undefined;
  /**
   * Nobody leaves before this, seconds. Default `0`.
   *
   * A floor rather than a shift: the draw is clamped up to it. Somebody who has just walked up to
   * a landing does not turn round in the first second, and an exponential draw without a floor
   * says a measurable fraction of them do.
   */
  readonly minS?: number | undefined;
}

/** Every knob {@link PatienceConfig} owns (CLAUDE.md invariant 8). */
export const PATIENCE_PARAMETERS: readonly SimParameterSpec[] = Object.freeze([
  {
    id: 'sim.patience.distribution',
    type: 'categorical',
    values: ['none', ...PATIENCE_DISTRIBUTIONS],
    default: 'none',
    description:
      'Which patience curve riders are drawn against. "none" is the absent block and the default: nobody abandons, and the run is byte-identical to one produced before patience existed. Abandonment improves AWT by construction, so a run with this set must be read through summary.abandonment.',
  },
  {
    id: 'sim.patience.meanS',
    type: 'continuous',
    range: [1, 3600],
    scale: 'log',
    default: 300,
    unit: 's',
    description:
      'Mean seconds a rider stands at a landing before leaving. No effect unless sim.patience.distribution names a curve; the default here is a declaration for an optimizer, not a value any run takes on its own.',
    activeWhen: { 'sim.patience.distribution': [...PATIENCE_DISTRIBUTIONS] },
  },
  {
    id: 'sim.patience.spreadS',
    type: 'continuous',
    range: [0, 3600],
    scale: 'linear',
    default: 0,
    unit: 's',
    description:
      'Half-width of the uniform patience support, seconds: the draw is meanS ± spreadS, floored at sim.patience.minS. Inert under the exponential curve, which takes its spread from its own tail.',
    activeWhen: { 'sim.patience.distribution': ['uniform'] },
  },
  {
    id: 'sim.patience.minS',
    type: 'continuous',
    range: [0, 3600],
    scale: 'linear',
    default: 0,
    unit: 's',
    description:
      'Seconds before which nobody leaves. A clamp on the draw, not a shift of it: a rider who has just reached a landing does not turn round in the first second, and an unfloored exponential says a measurable fraction of them do.',
    activeWhen: { 'sim.patience.distribution': [...PATIENCE_DISTRIBUTIONS] },
  },
]);

/**
 * Validate a declared curve, loudly.
 *
 * @throws RangeError with the field named. A patience of zero would abandon everybody at the
 *   instant they arrived and report a flawless AWT over an empty cohort, which is precisely the
 *   confident nonsense this project's statistical discipline exists to refuse.
 */
export function requireValidPatience(config: PatienceConfig): PatienceConfig {
  if (!Number.isFinite(config.meanS) || config.meanS <= 0) {
    throw new RangeError(
      `sim.patience.meanS must be a finite number > 0; received ${config.meanS}. A mean patience of zero abandons every rider at the instant they arrive and reports an AWT over nobody.`,
    );
  }
  const minS = config.minS ?? 0;
  if (!Number.isFinite(minS) || minS < 0) {
    throw new RangeError(`sim.patience.minS must be a finite number >= 0; received ${minS}`);
  }
  if (config.distribution === 'uniform') {
    const spreadS = config.spreadS ?? 0;
    if (!Number.isFinite(spreadS) || spreadS < 0) {
      throw new RangeError(
        `sim.patience.spreadS must be a finite number >= 0; received ${spreadS}`,
      );
    }
    if (spreadS > config.meanS) {
      throw new RangeError(
        `sim.patience.spreadS (${spreadS} s) exceeds sim.patience.meanS (${config.meanS} s), so the uniform support would start below zero and the floor at sim.patience.minS would be doing all the work. Lower the spread or raise the mean.`,
      );
    }
  }
  return config;
}

/**
 * One patience draw, in seconds. Pure in the sense that matters: it consumes exactly one draw
 * from `rng` per call, for every distribution and every parameter value.
 *
 * That fixed draw count is deliberate and is the same property `drawGeometricBatchSize` states
 * about itself: it means changing `meanS` cannot change how many numbers the stream yields, so a
 * sensitivity sweep over the mean is a sweep over one thing.
 */
export function drawPatienceSeconds(rng: Rng, config: PatienceConfig): number {
  const minS = config.minS ?? 0;
  if (config.distribution === 'uniform') {
    const spreadS = config.spreadS ?? 0;
    const draw = config.meanS - spreadS + rng.nextFloat() * 2 * spreadS;
    return Math.max(minS, draw);
  }
  return Math.max(minS, rng.exponential(1 / config.meanS));
}

/** Key a planned leg by its journey and its index within that journey. */
export function patienceKeyOf(journeyId: string, legIndex: number): string {
  return `${journeyId}#${String(legIndex)}`;
}

/**
 * The trace-ordered patience table: one draw per planned leg, keyed by
 * {@link patienceKeyOf}.
 *
 * `journeys` is the trace's own passenger list — each entry a journey with its planned legs — and
 * it is walked in order. See this module's header for why the order is the trace's and not the
 * run's.
 */
export function drawPatienceTable(
  rng: Rng,
  config: PatienceConfig,
  journeys: readonly { readonly journeyId: string; readonly legs: readonly unknown[] }[],
): ReadonlyMap<string, SimTime> {
  const table = new Map<string, SimTime>();
  for (const journey of journeys) {
    for (let legIndex = 0; legIndex < journey.legs.length; legIndex += 1) {
      table.set(patienceKeyOf(journey.journeyId, legIndex), drawPatienceSeconds(rng, config));
    }
  }
  return table;
}
