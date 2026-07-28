/**
 * The building editor's operations: pure functions `BuildingConfig → BuildingConfig`.
 *
 * Pure, and returning a new document rather than mutating one, for two reasons that are both
 * user-visible rather than stylistic:
 *
 * 1. **Undo** (`ED-21`) is then a stack of documents rather than a stack of inverse operations,
 *    and an inverse operation that is subtly wrong is a class of bug an editor cannot afford.
 * 2. **The live preview** (`ED-01`) re-derives geometry from the document on every keystroke. A
 *    mutated document would make "did anything change?" undecidable without a deep compare.
 *
 * ## The three kinds of zoning are three different things
 *
 * `CLAUDE.md` forbids collapsing them and `UX.md` `ED-T4`/`ED-T5`/`ED-T6` give each its own row.
 * They are three separate concerns in this file and share no field:
 *
 * | Kind | Where it lives | Operation here |
 * |---|---|---|
 * | **Service** — which floors a shaft physically reaches | `banks[].servesFloors` | {@link setBankServedFloors} |
 * | **Access** — which credentials open which floors | `accessZones[]` | {@link upsertAccessZone}, {@link removeAccessZone} |
 * | **Operational** — how the dispatcher chooses to split the building | `data/dispatcher-profiles.json` | **none, deliberately** — see {@link OPERATIONAL_ZONING_NOTE} |
 *
 * A `servesFloors` edit changes the hardware. An `accessZones` edit changes the security policy.
 * They are routinely different sets on the same building — `secure-tower` has banks that reach
 * floors only some credential groups may select — and an editor with one "zones" control would
 * make that unrepresentable.
 */

import type {
  AccessZone,
  BankConfig,
  BuildingConfig,
  BuildingType,
  CarConfig,
  ElevatorSpecs,
  FloorConfig,
  FloorRange,
  TrafficProfiles,
} from '@elevator-sim/core';

/**
 * What the editor says where an operational-zoning control would otherwise go — `ED-T6`.
 *
 * Saying nothing is worse than saying this. A designer who has just defined service zoning and
 * access zoning reasonably expects the third kind to be here too, and the useful answer is where
 * it actually is rather than an absence they have to infer.
 */
export const OPERATIONAL_ZONING_NOTE =
  'Operational zoning — how the dispatcher splits the building at run time — is not building ' +
  'geometry and is not edited here. It is a dispatcher weight vector in ' +
  'data/dispatcher-profiles.json (CLAUDE.md invariant 7: anything tunable is data, not code).';

/** Deep clone of a plain JSON document. The configs are plain data by construction. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/* -------------------------------------------------------------------------- *
 * Floors — ED-T1, ED-T2
 * -------------------------------------------------------------------------- */

export function addFloor(building: BuildingConfig, floor: FloorConfig): BuildingConfig {
  return { ...clone(building), floors: [...(building.floors ?? []), floor] };
}

export function removeFloor(building: BuildingConfig, floorId: string): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    floors: (next.floors ?? []).filter((floor) => floor.id !== floorId),
    // A removed floor must not be left dangling in a bank's service zoning or in an access
    // zone; the loader would reject both with `unknown-floor` and the reader would have to fix
    // by hand a reference they never typed. Service and access are cleaned **separately**,
    // because they are separate concepts even when the same edit touches both.
    banks: next.banks.map((bank) => ({
      ...bank,
      servesFloors: bank.servesFloors.filter((id) => id !== floorId),
      ...(bank.servesFloorPairs === undefined
        ? {}
        : {
            servesFloorPairs: bank.servesFloorPairs.filter(
              (pair) => pair[0] !== floorId && pair[1] !== floorId,
            ),
          }),
    })),
    ...(next.accessZones === undefined
      ? {}
      : {
          accessZones: next.accessZones.map((zone) => ({
            ...zone,
            floors: zone.floors.filter((id) => id !== floorId),
          })),
        }),
  };
}

/** Change one field of one floor. `ED-01`'s "change a floor height, see the picture update". */
export function updateFloor(
  building: BuildingConfig,
  floorId: string,
  patch: Partial<FloorConfig>,
): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    floors: (next.floors ?? []).map((floor) => (floor.id === floorId ? { ...floor, ...patch } : floor)),
  };
}

/**
 * Move a floor up or down the *declaration* list — `ED-T1`'s reorder.
 *
 * It deliberately does **not** renumber `index` or recompute `heightM`. `index` is the shaft
 * order the dispatcher travels in and `heightM` is the distance it travels; the loader checks
 * that the two agree and rejects a building where they do not (`floor-height-order`). An editor
 * that silently rewrote either to keep a drag-and-drop consistent would be resolving that
 * disagreement by fiat, on the reader's behalf, in the one place the project treats it as a
 * modelling error worth failing over.
 */
export function moveFloor(building: BuildingConfig, floorId: string, delta: number): BuildingConfig {
  const next = clone(building);
  const floors = [...(next.floors ?? [])];
  const from = floors.findIndex((floor) => floor.id === floorId);
  if (from < 0) return next;
  const to = Math.max(0, Math.min(floors.length - 1, from + delta));
  const [moved] = floors.splice(from, 1);
  if (moved === undefined) return next;
  floors.splice(to, 0, moved);
  return { ...next, floors };
}

export function addFloorRange(building: BuildingConfig, range: FloorRange): BuildingConfig {
  const next = clone(building);
  return { ...next, floorRanges: [...(next.floorRanges ?? []), range] };
}

export function removeFloorRange(building: BuildingConfig, at: number): BuildingConfig {
  const next = clone(building);
  return { ...next, floorRanges: (next.floorRanges ?? []).filter((_, index) => index !== at) };
}

/* -------------------------------------------------------------------------- *
 * Banks and cars — ED-T3, ED-02, ED-03
 * -------------------------------------------------------------------------- */

export function addBank(building: BuildingConfig, bank: BankConfig): BuildingConfig {
  const next = clone(building);
  return { ...next, banks: [...next.banks, bank] };
}

export function removeBank(building: BuildingConfig, bankId: string): BuildingConfig {
  const next = clone(building);
  return { ...next, banks: next.banks.filter((bank) => bank.id !== bankId) };
}

/** `ED-02` — a new shaft appears in the preview immediately, with no run. */
export function addCar(building: BuildingConfig, bankId: string, car: CarConfig): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    banks: next.banks.map((bank) =>
      bank.id === bankId ? { ...bank, cars: [...bank.cars, car] } : bank,
    ),
  };
}

export function removeCar(building: BuildingConfig, bankId: string, carId: string): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    banks: next.banks.map((bank) =>
      bank.id === bankId ? { ...bank, cars: bank.cars.filter((car) => car.id !== carId) } : bank,
    ),
  };
}

/**
 * `ED-03` — change a car's elevator class.
 *
 * The class supplies acceleration, jerk, door timings and the reference envelopes; `resolveCar`
 * applies them. The editor therefore writes **only** `spec`, and clears any per-car overrides
 * the reader had left from the previous class, because a 0.63 m/s override carried over onto a
 * gearless-traction class is a car nobody configured and the reference envelope warning is the
 * only thing that would say so.
 */
export function setCarSpec(
  building: BuildingConfig,
  bankId: string,
  carId: string,
  spec: string,
): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    banks: next.banks.map((bank) => {
      if (bank.id !== bankId) return bank;
      return {
        ...bank,
        cars: bank.cars.map((car) => {
          if (car.id !== carId) return car;
          const { ratedSpeedMps, ratedLoadLb, acceleration, jerk, ...rest } = car;
          void ratedSpeedMps;
          void ratedLoadLb;
          void acceleration;
          void jerk;
          return { ...rest, spec };
        }),
      };
    }),
  };
}

/** Any per-car override. `ED-T3` shows class values; this is how a reader deviates from them. */
export function updateCar(
  building: BuildingConfig,
  bankId: string,
  carId: string,
  patch: Partial<CarConfig>,
): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    banks: next.banks.map((bank) =>
      bank.id === bankId
        ? { ...bank, cars: bank.cars.map((car) => (car.id === carId ? { ...car, ...patch } : car)) }
        : bank,
    ),
  };
}

/* -------------------------------------------------------------------------- *
 * Service zoning — ED-T4
 * -------------------------------------------------------------------------- */

/**
 * Which floors a bank's shafts physically reach.
 *
 * **Service zoning, and nothing else.** Two banks may serve overlapping floors and that is legal
 * (`ED-08`); the loader does not flag it and neither does this.
 */
export function setBankServedFloors(
  building: BuildingConfig,
  bankId: string,
  floorIds: readonly string[],
): BuildingConfig {
  const next = clone(building);
  return {
    ...next,
    banks: next.banks.map((bank) =>
      bank.id === bankId ? { ...bank, servesFloors: [...floorIds] } : bank,
    ),
  };
}

/* -------------------------------------------------------------------------- *
 * Access zoning — ED-T5
 * -------------------------------------------------------------------------- */

/**
 * Credential-based zoning. A **separate** array, edited by a separate control.
 *
 * An access zone names floors and the credential groups that may select them. It says nothing
 * about which shafts reach those floors — that is {@link setBankServedFloors} — and the editor
 * never derives one from the other.
 */
export function upsertAccessZone(building: BuildingConfig, zone: AccessZone): BuildingConfig {
  const next = clone(building);
  const zones = [...(next.accessZones ?? [])];
  const at = zones.findIndex((candidate) => candidate.id === zone.id);
  if (at < 0) zones.push(zone);
  else zones[at] = zone;
  return { ...next, accessZones: zones };
}

export function removeAccessZone(building: BuildingConfig, zoneId: string): BuildingConfig {
  const next = clone(building);
  return { ...next, accessZones: (next.accessZones ?? []).filter((zone) => zone.id !== zoneId) };
}

/* -------------------------------------------------------------------------- *
 * A blank building — ED-05
 * -------------------------------------------------------------------------- */

/**
 * The smallest building the loader accepts: two floors, one bank, one car.
 *
 * Not one floor and not zero cars, because `bankConfigSchema` requires at least two served
 * floors and at least one car. `ED-05` asks for "a minimum viable building"; the minimum is set
 * by the schema, so it is read off the schema rather than chosen.
 *
 * Both the elevator class **and the traffic profile** are read off the data the caller loaded
 * rather than written here. The first draft wrote `trafficProfile: type`, which reads plausibly
 * and is wrong: building types are `office`/`residential`/…, and the declared profile ids are
 * `office-standard`, `office-prestige`, `residential`, `hotel`. A blank building therefore
 * arrived with an `unknown-traffic-profile` error against a field the reader never touched. The
 * test that caught it is `edits.test.ts` § *a blank building*, and it caught it because it runs
 * the same cross-check `loadConfig` does rather than only the schema.
 */
export function blankBuilding(
  specs: ElevatorSpecs,
  trafficProfiles?: TrafficProfiles,
  type: BuildingType = 'office',
): BuildingConfig {
  const spec = specs.classes[0];
  if (spec === undefined) {
    throw new Error('blankBuilding: elevator-specs.json declares no classes.');
  }
  const declared = trafficProfiles?.profiles ?? [];
  // Prefer a profile that mentions the building type; otherwise the first declared one. Never a
  // literal, because a literal is right until somebody renames a profile.
  const trafficProfile =
    declared.find((profile) => profile.id === type)?.id ??
    declared.find((profile) => profile.id.startsWith(`${type}-`))?.id ??
    declared[0]?.id ??
    type;
  return {
    id: 'new-building',
    name: 'New building',
    type,
    trafficProfile,
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, label: 'Lobby' },
      { id: '2', index: 1, heightM: 3.5, population: 20 },
    ],
    banks: [
      {
        id: 'main',
        name: 'Main bank',
        servesFloors: ['G', '2'],
        cars: [{ id: 'A', spec: spec.id }],
      },
    ],
    accessZones: [],
  };
}

/* -------------------------------------------------------------------------- *
 * Serialisation — ED-T9
 * -------------------------------------------------------------------------- */

/**
 * Field order for the serialised document.
 *
 * Not cosmetic: `ED-T9` requires a round trip through *the same JSON `loadConfig` reads*, and a
 * hand-edited file that comes back with its keys shuffled produces a diff nobody can review,
 * which is how a round trip stops being verifiable in practice. This is the order
 * `data/buildings/*.json` are authored in.
 */
const BUILDING_KEY_ORDER: readonly (keyof BuildingConfig)[] = [
  '$comment',
  'id',
  'name',
  'type',
  'trafficProfile',
  'floors',
  'floorRanges',
  'totalPopulation',
  'banks',
  'accessZones',
  'notes',
];

/** Serialise a document in the shipped field order, two-space indented, newline-terminated. */
export function serializeBuilding(building: BuildingConfig): string {
  const ordered: Record<string, unknown> = {};
  for (const key of BUILDING_KEY_ORDER) {
    const value = building[key];
    if (value !== undefined) ordered[key] = value;
  }
  // Anything the order list does not know about is kept rather than dropped: a field added to
  // the schema after this list was written must survive an edit, not vanish through it.
  for (const [key, value] of Object.entries(building)) {
    if (!(key in ordered) && value !== undefined) ordered[key] = value;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
