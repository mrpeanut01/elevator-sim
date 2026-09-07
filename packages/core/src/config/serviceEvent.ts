/**
 * The three shapes of a service event, told apart — GitHub issue #346, § D523.
 *
 * `ServiceEventConfig` and `ResolvedServiceEvent` are structural unions: a **mode** entry carries
 * `mode`, a **range** entry carries `servesFloors`, a **derate** entry carries `ratedLoadLb` (or
 * `ratedLoadKg` once resolved), and no shape carries two of the three. These guards are the one
 * place that fact is written down as code, so a reader that needs to branch on the kind branches
 * here rather than re-deriving the discriminant from a field name.
 *
 * Kept out of `types.ts`, which holds declarations, and out of `parse.ts`, which is the loader:
 * `sim/simulation.ts` and `packages/viz` both need the guards without either of those.
 */

import type {
  ResolvedServiceDerateEvent,
  ResolvedServiceEvent,
  ResolvedServiceModeEvent,
  ResolvedServiceRangeEvent,
  ServiceDerateEventConfig,
  ServiceEventConfig,
  ServiceModeEventConfig,
  ServiceRangeEventConfig,
} from './types.js';

/** A car's service-mode change — the only shape a service event had before § D523. */
export function isServiceModeEvent(event: ServiceEventConfig): event is ServiceModeEventConfig;
export function isServiceModeEvent(event: ResolvedServiceEvent): event is ResolvedServiceModeEvent;
export function isServiceModeEvent(event: ServiceEventConfig | ResolvedServiceEvent): boolean {
  return 'mode' in event;
}

/** A bank's service-range change. */
export function isServiceRangeEvent(event: ServiceEventConfig): event is ServiceRangeEventConfig;
export function isServiceRangeEvent(event: ResolvedServiceEvent): event is ResolvedServiceRangeEvent;
export function isServiceRangeEvent(event: ServiceEventConfig | ResolvedServiceEvent): boolean {
  return 'servesFloors' in event;
}

/** A car's rated-load change. */
export function isServiceDerateEvent(event: ServiceEventConfig): event is ServiceDerateEventConfig;
export function isServiceDerateEvent(
  event: ResolvedServiceEvent,
): event is ResolvedServiceDerateEvent;
export function isServiceDerateEvent(event: ServiceEventConfig | ResolvedServiceEvent): boolean {
  return 'ratedLoadLb' in event;
}

/**
 * One clause naming what a resolved event does, for the runner's warnings — *set car "a-1" to
 * "out-of-service"*, *set bank "high" to serve G, 20, 21*, *rate car "a-1" at 900 kg*. The
 * warnings that quote it are about scheduling (past the drain deadline, before its own answer),
 * so the clause is the event and not its consequence.
 */
export function describeServiceEvent(event: ResolvedServiceEvent): string {
  if (isServiceModeEvent(event)) {
    return `set car "${event.bankId}-${event.carId}" to "${event.mode}"`;
  }
  if (isServiceRangeEvent(event)) {
    return `set bank "${event.bankId}" to serve ${event.servesFloors.join(', ')}`;
  }
  return `rate car "${event.bankId}-${event.carId}" at ${String(event.ratedLoadKg)} kg`;
}
