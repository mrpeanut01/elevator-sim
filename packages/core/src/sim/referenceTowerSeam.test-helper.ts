/**
 * **The shared rig for the three 2026-09-15 reference towers' seam tests** — GitHub issues #428,
 * #427 and #426; [`DECISIONS.md` § D594](../../../../DECISIONS.md), § D596 and § D598.
 *
 * Every arm in those three files re-reads the authored document, edits **one field**, and puts it
 * through the shipped `parseBuilding` → `resolveBuilding` path, so no code exists in them that the
 * loader does not already have. This file is the part all three share; it is deliberately a
 * `test-helper` rather than a fourth `*.test.ts`, because importing a `*.test.ts` from another
 * collects its cases into the importer.
 *
 * The pairing rule is `sim/directionalSpeedSeam.test.ts`'s and is kept word for word: the
 * **journeys must be identical on both arms** — same origins, same final destinations, same arrival
 * instants — and that is asserted before any leg difference is read, because a difference in the
 * demand would make every leg difference mean nothing.
 *
 * ## This docstring is the record
 *
 * No `DECISIONS.md` heading is taken for the rig itself, per [§ D405](../../../../DECISIONS.md): it
 * moves nothing already recorded and binds no module that has not agreed to it. The three buildings'
 * own entries carry the decisions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';
import type { PassengerRecord } from '../metrics/types.js';

import { DATA_DIR } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

/**
 * Three seeds, and three rather than one because a single seed cannot tell a binding control from a
 * lucky trace. Not a replication budget — nothing in these files is a mean — the same claim asked
 * three times. The same three `directionalSpeedSeam.test.ts` and `serviceZoneSeam.test.ts` use, so
 * the instruments are comparable.
 */
export const SEEDS: readonly number[] = Object.freeze([20_260_824, 20_268_743, 20_276_662]);

/** The shipped horizon of `rise-and-fall`, stated so every run below is reproducible from here. */
export const DURATION_S = 1_800;

/** A car as the document holds it, with the fields these files delete. */
export interface AuthoredCar {
  readonly id: string;
  doubleDeck?: boolean;
  deckSeparationM?: number;
  ratedLoadLbPerDeck?: number;
  cabinPressurised?: boolean;
  descentSpeedMps?: number;
}

export interface AuthoredBank {
  readonly id: string;
  servesFloors: string[];
  servesFloorPairs?: [string, string][];
  cars: AuthoredCar[];
}

export interface AuthoredFloor {
  readonly id: string;
  landingCallType?: string;
}

export interface AuthoredRange {
  landingCallType?: string;
}

/** The authored document, as JSON, ready to be edited in exactly one place. */
export interface AuthoredBuilding {
  banks: AuthoredBank[];
  floors?: AuthoredFloor[];
  floorRanges?: AuthoredRange[];
  transportModes?: unknown[];
}

export function authored(buildingId: string): AuthoredBuilding {
  return JSON.parse(
    readFileSync(join(DATA_DIR, 'buildings', `${buildingId}.json`), 'utf8'),
  ) as AuthoredBuilding;
}

export function resolveAuthored(
  config: LoadedConfig,
  buildingId: string,
  document: AuthoredBuilding,
): ResolvedBuilding {
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding(document, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

export function bankOf(document: AuthoredBuilding, bankId: string): AuthoredBank {
  const bank = document.banks.find((candidate) => candidate.id === bankId);
  if (bank === undefined) throw new Error(`no bank "${bankId}" in this document`);
  return bank;
}

/** One run, at the shipped default dispatcher unless a case names another. */
export function run(
  config: LoadedConfig,
  building: ResolvedBuilding,
  seed: number,
  dispatcherProfileId = 'collective',
): SimulationResult {
  const profile = config.dispatcherProfilesById.get(dispatcherProfileId);
  if (profile === undefined) throw new Error(`missing dispatcher fixture "${dispatcherProfileId}"`);
  return runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    durationS: DURATION_S,
    onTimeout: 'report',
  });
}

/** Legs grouped by journey, ascending by `legIndex`. */
export function journeys(result: SimulationResult): Map<string, readonly PassengerRecord[]> {
  const byJourney = new Map<string, PassengerRecord[]>();
  for (const leg of result.record.passengers) {
    const legs = byJourney.get(leg.journeyId) ?? [];
    legs.push(leg);
    byJourney.set(leg.journeyId, legs);
  }
  for (const legs of byJourney.values()) legs.sort((a, b) => a.legIndex - b.legIndex);
  return byJourney;
}

/**
 * What a journey *is*, independent of how it was carried — the pairing every case rests on.
 *
 * Origin, final destination and the instant it was offered. If two arms agree here they were handed
 * the same demand, and any leg difference is the control.
 */
export function offeredDemand(result: SimulationResult): string {
  return JSON.stringify(
    [...journeys(result).values()]
      .map((legs) => {
        const first = legs[0] as PassengerRecord;
        return [
          first.journeyId,
          first.originFloorId,
          first.finalDestinationFloorId,
          first.journeyStartedAt,
        ];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/**
 * Each journey's first recorded leg, keyed by journey id — its final destination and the instant the
 * journey began.
 *
 * The pairing primitive for a control that may change *which* journeys the generator can offer:
 * `traffic/generator.ts` rejects a route with no lift leg, so a building edit that changes routing
 * can change a destination draw. A case that needs to say *how far* the demand moved needs the two
 * sides rather than one digest of each, which is what {@link offeredDemand} gives.
 */
export function firstLegs(
  result: SimulationResult,
): Map<string, { readonly destination: string; readonly startedAt: number }> {
  const byJourney = new Map<string, { destination: string; startedAt: number }>();
  for (const leg of result.record.passengers) {
    if (leg.legIndex !== 0) continue;
    byJourney.set(leg.journeyId, {
      destination: leg.finalDestinationFloorId,
      startedAt: leg.journeyStartedAt,
    });
  }
  return byJourney;
}

/**
 * The offered demand for a building that declares a `transportModes` block.
 *
 * {@link offeredDemand} reads the **first recorded leg's** origin, and on a building with a
 * transport mode that is not the journey's origin: a hop leaves no leg record, so a journey that
 * escalates before its first lift ride is recorded as starting where it boarded. Comparing two arms
 * that differ in whether the hop happens would then fail on the pairing rather than on the control,
 * which is exactly the wrong place for it to fail.
 *
 * So the pairing here is the journey's **identity, final destination and arrival instant**, and the
 * case that uses it asserts the journey count too. Under common random numbers the same seed offers
 * the same demand; what a mode changes is how it is carried.
 */
export function offeredJourneys(result: SimulationResult): string {
  return JSON.stringify(
    [...journeys(result).values()]
      .map((legs) => {
        const first = legs[0] as PassengerRecord;
        return [first.journeyId, first.finalDestinationFloorId, first.journeyStartedAt];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/** Every leg's identity — which ride, in which car, boarded and alighted when. */
export function legIdentities(result: SimulationResult): string {
  return JSON.stringify(
    result.record.passengers
      .map((leg) => [
        leg.journeyId,
        leg.legIndex,
        leg.originFloorId,
        leg.destinationFloorId,
        leg.boardedAt ?? null,
        leg.alightedAt ?? null,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

/** Hops taken on a declared non-lift connection, off the run's own conservation audit. */
export function transportHops(result: SimulationResult): number {
  return result.conservation.transportHops;
}

/** Journeys that needed at least `n` lift legs. */
export function journeysNeedingLegs(result: SimulationResult, n: number): number {
  let count = 0;
  for (const legs of journeys(result).values()) if (legs.length >= n) count += 1;
  return count;
}
