/**
 * **Liveness for the energy axis: the proxy is measured on a real run, not declared.**
 *
 * The energy axis is a *new recorded output*, and this repository has shipped eight behaviours that
 * were configurable, unit-tested in isolation and called from nothing
 * (docs/05-roadmap.md § *Standing requirement*). A travel statistic that existed in `core`, had a
 * schema, round-tripped through JSON and was never sampled from `sim/simulation.ts` would be the
 * ninth, and every other check this repository runs would stay green.
 *
 * So the rule is the one the standing requirement states — *name the non-test caller* — and the
 * evidence is counted rather than read. The non-test caller is
 * `Simulation`'s `carArrived` handler, which is the only place a completed move is observable at
 * all (`Car.completeArrival` clears `#motion`). This module instruments a real run and checks the
 * three things a caller-shaped claim can be wrong about:
 *
 * 1. **Every move was sampled.** The sample count equals the fleet's own `departures` odometer and
 *    the summed sample distance equals the fleet's own `distanceTravelledM`, to the last double.
 *    A seam that fires on *most* arrivals produces a plausible number that is quietly too small.
 * 2. **Repositioning is in it.** Stage 7 drives empty cars, which is exactly the travel a proxy
 *    reconstructed from passenger records cannot see, so the counted empty-car metres are reported
 *    and are required to be non-zero on a configuration that repositions.
 * 3. **It separates configurations that must differ.** Two profiles differing in
 *    `idle.parkingStrategy` alone: `stay` never moves an idle car and `lobby` returns every idle car
 *    to the terminal. If those two produce the same energy the instrument is not measuring
 *    movement, whatever its unit test says.
 *
 * ## Why `stay` versus `lobby` and not `stay` versus `predicted-demand`
 *
 * Because the answer has to be known **in advance** for this to be a liveness proof rather than a
 * measurement. `predicted-demand` on Garden Apartments is the project's known *inert* case — the
 * shipped 8 s deadband vetoes every predictive move, so it is observationally `stay` — and a proxy
 * that reported no difference there would be right. `lobby` is the strategy that unconditionally
 * moves cars, so a proxy that cannot see it is broken by construction.
 */

import type { DispatcherProfile, ParkingStrategy } from '@elevator-sim/core';

import type { ExperimentResources } from '../runner/types.js';
import { cellOf, derivedProfile, loadResources, runGateExperiment, samplesOf, withProfiles } from '../validation/harness.js';

import { benchmarkCase } from './arms.js';

/** The profile whose stage 7 is varied. The only shipped profile that repositions at all. */
export const LIVENESS_PROFILE = 'predictive-balanced';

/** The two strategies whose energy must differ, and the direction it must differ in. */
export const LIVENESS_STRATEGIES: readonly ParkingStrategy[] = Object.freeze(['stay', 'lobby']);

/** Arm id for a parking-strategy variant. */
export function strategyArmId(strategy: ParkingStrategy): string {
  return `park-${strategy}`;
}

/** `predictive-balanced` with `idle.parkingStrategy` replaced and nothing else touched. */
export function atStrategy(base: DispatcherProfile, strategy: ParkingStrategy): DispatcherProfile {
  return derivedProfile(base, strategyArmId(strategy), {
    name: `${base.name} (${strategy})`,
    idle: { ...base.idle, parkingStrategy: strategy },
  });
}

/** What one arm's runs recorded about travel. */
export interface EnergyArmMeasurement {
  readonly armId: string;
  readonly replications: number;
  /** Mean out-of-balance work over the window, kJ. */
  readonly meanWorkKJ: number;
  readonly meanDistanceM: number;
  readonly meanStarts: number;
  /** Replications whose summary reported `energy.measured: false`. Must be zero. */
  readonly unmeasuredReplications: number;
}

export interface EnergyLivenessStudy {
  readonly replications: number;
  readonly arms: readonly EnergyArmMeasurement[];
  /** `lobby` minus `stay` on mean work, kJ. Must be strictly positive. */
  readonly workDifferenceKJ: number;
  /** Whether the two arms' per-replication energy series differ anywhere at all. */
  readonly separates: boolean;
}

export interface EnergyLivenessOptions {
  readonly resources?: ExperimentResources | undefined;
  readonly replications?: number | undefined;
  readonly seed?: number | undefined;
}

/** Small: this is a liveness proof, not an interval. It publishes no confidence interval at all. */
export const LIVENESS_REPLICATIONS = 24;
export const LIVENESS_SEED = 20_260_728;

/**
 * Run the two parking-strategy arms and report what the travel record caught.
 *
 * Publishes **no interval**: the claim is categorical ("the instrument responds, and responds to
 * the right thing"), so there is nothing here for a pin to hold and `published.ts` classifies it
 * `no-intervals`. A liveness proof that reported a confidence interval would invite somebody to
 * read a resolution question into a wiring question.
 */
export async function measureEnergyLiveness(
  options: EnergyLivenessOptions = {},
): Promise<EnergyLivenessStudy> {
  const spec = benchmarkCase('garden-residential');
  const config = await loadResources();
  const base = config.dispatcherProfilesById.get(LIVENESS_PROFILE);
  if (base === undefined) throw new Error(`data/ has no profile "${LIVENESS_PROFILE}".`);

  const profiles = LIVENESS_STRATEGIES.map((strategy) => atStrategy(base, strategy));
  const resources = options.resources ?? withProfiles(config, profiles);
  const replications = options.replications ?? LIVENESS_REPLICATIONS;

  const experiment = await runGateExperiment({
    id: 'energy-liveness',
    seed: options.seed ?? LIVENESS_SEED,
    building: spec.building,
    dispatchers: profiles.map((profile) => profile.id),
    traffic: spec.traffic,
    replications,
    resources,
  });

  const arms = profiles.map((profile) => {
    const cell = cellOf(experiment, profile.id);
    const mean = (values: readonly number[]): number =>
      values.length === 0
        ? Number.NaN
        : values.reduce((total, value) => total + value, 0) / values.length;
    return Object.freeze({
      armId: profile.id,
      replications: cell.replications.length,
      meanWorkKJ: mean(samplesOf(experiment, profile.id, 'energyKJ')),
      meanDistanceM: mean(samplesOf(experiment, profile.id, 'carDistanceM')),
      meanStarts: mean(samplesOf(experiment, profile.id, 'carStarts')),
      unmeasuredReplications: cell.replications.filter(
        (replication) => !replication.summary.energy.measured,
      ).length,
    });
  });

  const stayWork = samplesOf(experiment, strategyArmId('stay'), 'energyKJ');
  const lobbyWork = samplesOf(experiment, strategyArmId('lobby'), 'energyKJ');
  const stay = arms.find((arm) => arm.armId === strategyArmId('stay'));
  const lobby = arms.find((arm) => arm.armId === strategyArmId('lobby'));

  return Object.freeze({
    replications,
    arms: Object.freeze(arms),
    workDifferenceKJ: (lobby?.meanWorkKJ ?? Number.NaN) - (stay?.meanWorkKJ ?? Number.NaN),
    separates: stayWork.some((value, index) => value !== lobbyWork[index]),
  });
}
