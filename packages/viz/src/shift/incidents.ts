/**
 * Time-boxed service incidents — and the caller `BuildingConfig.serviceEvents` never had.
 *
 * ## The dead seam this closes
 *
 * `serviceEvents` is a **working mid-run service-mode scheduler**: `{ atS, carId, bankId?, mode }`,
 * validated in `core/src/config/parse.ts` with four dedicated issue codes, applied by `sim/events.ts`
 * before the run reaches that instant, and seam-tested in `core/src/sim/serviceMode.test.ts`. It has
 * existed since Phase 0 and **no shipped building declares one**.
 *
 * That is the defect class `docs/05-roadmap.md`'s standing requirement is written about — configured,
 * validated, unit-tested, and called from nothing — and it is the `data/` variant of it, which
 * CLAUDE.md names as the most instructive kind: *invariant 7 makes strategy data; it does not make
 * data exempt.* `destination-eta`'s `rideTime: 0` was the same shape. This module is the non-test
 * caller, and `dev/state.ts#shiftRunConfigOf` is its non-test caller in turn.
 *
 * ## What an incident is, and why it is not `outOfServiceCarIds`
 *
 * `RecordRunOptions.outOfServiceCarIds` holds a car for the **whole run**. It is the right instrument
 * for *"this car is not in the building today"* and the wrong one for *"this car is away for twenty
 * minutes"* — and the difference is the whole of what a maintenance window, a breakdown or a
 * modernisation is. A car that leaves and comes back is a different problem to dispatch around than a
 * car that was never there: the group has to absorb a loss and then re-balance, which is the thing a
 * player is being asked to plan for.
 *
 * So an incident is **two** service events — out at one instant, back at another — and it lives on
 * the `BuildingConfig` rather than beside it, because that is where the kernel reads it from.
 *
 * ## The time box is a fraction of the shift, and that is a correction rather than a convenience
 *
 * The design's `move-in` note ends *"until 11:30"*. There is no 11:30 in this simulator: a shift is
 * 15, 30, 60 or 120 minutes from a clock that starts at 06:00 (§ D175 dropped the fire drill's
 * *"14:00"* for exactly this reason), so the longest shipped shift ends at 08:00. `events.ts` was
 * therefore right to rewrite the note to *"for the whole shift"* — a caption naming an hour the run
 * does not contain is what the honesty card exists to prevent.
 *
 * What was actually missing was the *mechanic*, not the hour. An incident declares its window as a
 * **fraction of the run**, so *"out for the first two thirds of the shift"* is true at every shift
 * length and at every playback speed, and the car genuinely returns. The note can now describe a
 * return because there is one.
 *
 * ## Determinism
 *
 * Which car goes out is a **total order**, never a draw. CLAUDE.md invariant 2 forbids a random draw
 * outside the injected `StreamSet` — a shared source desynchronises common random numbers and
 * destroys comparison power — and two shifts of the same day that held different cars would not be
 * comparable with each other either. {@link carsToDerate} is that order, and `events.ts#eventCarChoice`
 * now calls it rather than keeping a second copy of the same rule.
 *
 * ## The campaign incident's *answer* rides the intervention log, in this module's own terms
 *
 * The reconciliation decision, recorded here because this module owns the incident vocabulary
 * and would be the thing a second mechanism duplicated. An incident this module schedules is
 * known **before** the run — it is part of what the day *is*, so it lives on the
 * `BuildingConfig` and is invisible to the run record's log. The player's answer to an open
 * incident (gameplay § 7.5, `HAPPENING NOW`) is the opposite kind of fact: a decision made *at a
 * simulated instant during the run*, and § 7.5 says in as many words that it is *"mechanically
 * one instance of § 7.6"*. So the answer is an `answer-incident` entry on
 * `SimulationConfig.interventions` — `core`'s `InterventionChange` third arm — whose `atS` **is**
 * `runIncidentClock` (§ 20.16: stamped on the stage, listed on the report by
 * `live/interventions.ts#interventionLogOf` with every other entry), and whose effects are this
 * module's exact plain-data terms: a car named `(bankId, carId)` — {@link CarRef} — changing
 * `ServiceMode` at an absolute second.
 *
 * **Inside the engine the answer schedules through the *same* event kind as this module's
 * output — `serviceChange`, never a sibling.** `Simulation.#scheduleServiceEvents` holds the
 * argument where the seam is made: `#onServiceChange` is the sole authority on what a mode
 * change does to the group (re-offers, promise revocation, re-dispatch), and a sibling handler
 * applying `Car.setMode` itself would be a second copy of all of it. The answer's effects are
 * appended to the one schedule after the building's own events and fire as ordinary entries,
 * with one constraint this module's output never needed: every effect must fall at or after the
 * answer's own `atS`, because an answer that rescheduled the past would break § 1.4's
 * bit-identical prefix — `core` refuses such an entry loudly.
 *
 * No composer is exported from here yet, and that is deliberate rather than unfinished: the one
 * screen that answers an incident is the Everyday campaign dock, which does not exist, and a
 * `buildAnswer()` helper with no non-test caller would be this repository's dead-seam shape
 * manufactured on purpose. The arm, its scheduling, its refusals and its report lines are all
 * live and tested (`core/src/sim/interventions.test.ts`, `live/interventions.test.ts`); the dock
 * composes the entry from its option data on the day it lands.
 */

import type { BuildingConfig, ServiceEventConfig } from '@elevator-sim/core/browser';

/* -------------------------------------------------------------------------- *
 * Choosing a car
 * -------------------------------------------------------------------------- */

/** A car, named the way `serviceEvents` names one: an id within a bank, plus the bank. */
export interface CarRef {
  readonly bankId: string;
  readonly carId: string;
}

/**
 * The id `Simulation` gives a car at run time, and the one `RecordRunOptions.outOfServiceCarIds` is
 * matched on — `${bankId}-${carId}`.
 *
 * Exported, and one line of it, because there were **three** copies of this expression inside
 * `shift/` and GitHub issue #272 grew in the gap between two of them: `events.ts` mapped
 * a {@link CarRef} to it, `calendar.ts` held a private twin for the reservation, and `dev/state.ts`
 * handed the calendar a set that contained neither the day's incident cars nor the player's own
 * holds. Three sites answering *what is this car called?* is how a fourth site comes to answer
 * *which cars are taken?* wrongly and look right doing it.
 *
 * It lives here rather than in `events.ts` because {@link CarRef} does, and the name is a fact about
 * the ref rather than about a patch.
 */
export function carRuntimeId(car: CarRef): string {
  return `${car.bankId}-${car.carId}`;
}

/**
 * The minimum shape this module needs of a building.
 *
 * Structural rather than `ResolvedBuilding` or `BuildingConfig`, because it is called with **both**:
 * `events.ts` has a resolved building and `shiftRunConfigOf` has the grown config, and the rule that
 * picks a car must be the same rule in both places or two surfaces will disagree about which car went
 * out today.
 */
export interface BankedBuilding {
  readonly banks: readonly { readonly id: string; readonly cars: readonly { readonly id: string }[] }[];
}

export interface CarChoice {
  readonly held: readonly CarRef[];
  /** How many fewer cars than asked for. See {@link carsToDerate} for why this is not always zero. */
  readonly shortfall: number;
}

/**
 * Which cars stand down, deterministically, and never the last one in a bank.
 *
 * The order is total: the **last** car ids, ascending, of the bank with the most cars — ties on car
 * count broken by bank id, which is `core`'s own tie-break discipline (invariant 4) applied to a
 * display decision.
 *
 * **A bank keeps at least one car in service.** A bank with none is a set of floors nobody can reach,
 * which is a different scenario rather than a busier one, and it is not what any incident's note
 * describes. An incident that cannot be applied in full reports a {@link CarChoice.shortfall} so the
 * caller can say what it could not do, rather than silently doing less.
 */
export function carsToDerate(building: BankedBuilding, wanted: number): CarChoice {
  const banks = [...building.banks].sort((a, b) =>
    b.cars.length - a.cars.length !== 0 ? b.cars.length - a.cars.length : a.id.localeCompare(b.id),
  );
  const held: CarRef[] = [];
  for (const bank of banks) {
    if (held.length >= wanted) break;
    const ids = bank.cars.map((car) => car.id).sort((a, b) => a.localeCompare(b));
    // One car stays. See the docstring.
    for (const carId of ids.slice(1).reverse()) {
      if (held.length >= wanted) break;
      held.push({ bankId: bank.id, carId });
    }
  }
  held.sort((a, b) => (a.bankId === b.bankId ? a.carId.localeCompare(b.carId) : a.bankId.localeCompare(b.bankId)));
  return { held: Object.freeze(held), shortfall: Math.max(0, wanted - held.length) };
}

/* -------------------------------------------------------------------------- *
 * Incidents
 * -------------------------------------------------------------------------- */

export const INCIDENT_KINDS = ['breakdown', 'maintenance', 'modernisation'] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

/**
 * One car, away for part of a run.
 *
 * {@link fromFraction} and {@link toFraction} are fractions of the run's own length, `0`–`1`. Not
 * seconds, and not a clock time — see the module docstring: a shift is 15 to 120 minutes long and an
 * absolute hour would be false at most of them.
 *
 * {@link toFraction} at or beyond `1` means *it does not come back*, which is legal and is how a
 * modernisation spanning a whole shift is expressed. {@link serviceEventsFor} then emits one event
 * rather than two, because a return scheduled past the horizon is a promise the run cannot keep and
 * `core` would carry it as a resolved event that never fires.
 */
export interface Incident {
  readonly kind: IncidentKind;
  readonly car: CarRef;
  readonly fromFraction: number;
  readonly toFraction: number;
}

/**
 * The two service events an incident is made of, or one when it does not return.
 *
 * `out-of-service` rather than `independent`: `passenger.ts` refuses to board a car in either, and
 * `estimateCost` refuses both with `infeasibleReason: 'serviceMode'`, but *independent* means a car
 * under attendant control — which is a different fiction and would be a caption that does not
 * describe the picture under it.
 *
 * Sorted by `(atS, bankId, carId)` so the emitted list is byte-identical for the same input. The
 * kernel breaks event ties by `(time, sequenceNumber)` (invariant 4) and is not relying on this, but
 * a configuration whose *serialisation* wobbled would make two identical runs produce different
 * building documents, and the building document is hashed into a leaderboard board.
 */
export function serviceEventsFor(
  incidents: readonly Incident[],
  runLengthS: number,
): readonly ServiceEventConfig[] {
  const events: ServiceEventConfig[] = [];
  for (const incident of incidents) {
    const fromS = Math.round(clamp01(incident.fromFraction) * runLengthS);
    events.push({ atS: fromS, carId: incident.car.carId, bankId: incident.car.bankId, mode: 'out-of-service' });
    if (incident.toFraction >= 1) continue;
    const toS = Math.round(clamp01(incident.toFraction) * runLengthS);
    // A return at or before the departure is not a window; it is an incident that never happened,
    // and emitting both would leave the car in whichever mode the tie-break happened to apply last.
    if (toS <= fromS) continue;
    events.push({ atS: toS, carId: incident.car.carId, bankId: incident.car.bankId, mode: 'in-service' });
  }
  events.sort(
    (a, b) =>
      a.atS - b.atS ||
      (a.bankId ?? '').localeCompare(b.bankId ?? '') ||
      a.carId.localeCompare(b.carId),
  );
  return Object.freeze(events);
}

/**
 * Put the incidents onto the building the runner will be handed.
 *
 * **Appended to whatever the building already declares**, never replacing it. No shipped building
 * declares a service event today, but one that did would be describing its own hardware — a car
 * that is genuinely away for a fortnight — and a shift's incidents are a thing that happens *to* that
 * building rather than instead of it.
 *
 * Returns the same object when there is nothing to add, so a run with no incident is byte-identical
 * to one built before this module existed. That is the negative control every field added to a run
 * config owes, and `incidents.test.ts` asserts it on the legs.
 */
export function withIncidents(
  config: BuildingConfig,
  incidents: readonly Incident[],
  runLengthS: number,
): BuildingConfig {
  const events = serviceEventsFor(incidents, runLengthS);
  if (events.length === 0) return config;
  return { ...config, serviceEvents: [...(config.serviceEvents ?? []), ...events] };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
