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
  ResolvedBank,
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

/**
 * **Whether a bank's serving range is fixed for the run** — GitHub issue #477, § D131.
 *
 * `true` for a double-deck bank, and the answer is a fact about the *hardware* rather than about
 * any one surface's willingness to offer the change. § D131's first model rule is that *a stop
 * position is the lower floor of a pair*: the decks are bolted together at a fixed separation and
 * open on one interlock, so **26 and 27 are one position** and a served-floor list is not a free
 * set of floors on such a bank — it is a set of stop positions, each dragging its partner floor
 * with it. A range event whose new list splits a pair asks for a state the model has no expression
 * for (the car at 26 with the upper deck shut), and honouring it would mean a *deck out of service*
 * — a partial stop the dwell model, the boarding loop and `estimateCost` all have no term for,
 * which is the second engine `charter` non-goal 7 forbids.
 *
 * **The subset that would be expressible is deliberately not carved out.** A new range that is a
 * union of whole declared pairs disturbs no coupling and could be carried; it is refused with the
 * rest because nothing in this build can construct one. No shipped surface offers a rezone press,
 * and no picker exists that could constrain a player's floor selection to whole pairs — so an
 * accepting path would be configurable, unit-tested and called by nothing, which is the defect
 * `CLAUDE.md` names eleven times and of which § D131 is itself instance eleven. The refusal is the
 * honest side today; the whole-pair widening is a feature that starts with a picker, not here.
 *
 * **The argument for the refusal lives here rather than in `DECISIONS.md`** (§ D405): it binds four
 * sites and no number was allocated to this work, and taking one a lane may be holding is the
 * failure § D404 exists to stop. This docstring, the two guards that read it and
 * `model/bank.ts#setServesFloors` are the record.
 *
 * **One predicate, three readers, three registers.** `config/parse.ts` refuses a building's own
 * authored entry as a located `ConfigError`; `sim/simulation.ts#carriedEffectEvents` refuses a
 * carried effect with a warning so the run survives it; `packages/viz/src/live/interventions.ts`
 * refuses the press before the money is taken, in the player's own words. The *sentences* differ
 * because the registers do (gameplay § 16 rule 11 forbids engine identifiers on a player surface);
 * the *fact* is written once, here, so the three cannot drift into disagreeing about which banks
 * they are talking about.
 */
export function bankRangeIsFixed(bank: Pick<ResolvedBank, 'cars'>): boolean {
  return bank.cars.some((car) => car.doubleDeck);
}
