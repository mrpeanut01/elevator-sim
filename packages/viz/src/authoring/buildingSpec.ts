/**
 * The building editor's model: the handoff's sliders and elevation, as a real
 * {@link BuildingConfig} the loader will build.
 *
 * ## The two things this has to keep apart
 *
 * **Capacity is what the building was designed to hold; occupancy is how much of it is let
 * today.** Population — the number the lifts have to move — is the product. The handoff makes that
 * distinction the spine of its editor (§ 1.3 M11) and it is right to: `21 floors of 120` and
 * `21 floors, 62% let` are the same building on paper and different buildings to move people
 * through, and a simulator that collapses them cannot express a tower filling up over a week.
 *
 * `BuildingConfig` has only `population`, because a resolved building has nothing to say about a
 * lease. So {@link BuildingSpec} carries both and multiplies them on the way out, and the
 * elevation's per-floor drag writes `occ[floor]` rather than a population — which is what makes
 * *level all* a meaningful button and what makes the day-over-day growth in `shift/growth.ts`
 * compose with a reader's hand-set floors instead of overwriting them.
 *
 * ## Service zoning, and the one thing the elevation may not do
 *
 * The handoff lets a reader drag a shaft's top and bottom edge to any band of floors. A car's
 * served floors are its **bank's** `servesFloors`, and a band that is not a contiguous slice of a
 * bank is not a building this loader will build. So a drag produces a *bank split*: cars that share
 * a band share a bank, and a band that no other car matches becomes a bank of one.
 *
 * The handoff's **express toggle** (§ 1.3 M11) is the second half of the same field. A band above
 * the lobby lands in the lobby by default; turning the toggle off keeps the car inside its band,
 * and {@link BuildingSpec.noLobby} is where that lives. It is service zoning and only that — it
 * changes which floors the shaft opens onto, not who is allowed through the door (access) and not
 * which car the group offers a call to (operational). The three stay apart.
 *
 * ## Access zoning is the second kind, and it is carried here rather than inferred
 *
 * {@link BuildingSpec.accessZones} is `docs/10-experience-layer-contract.md` § 10.2's half of W8.
 * It is a **credential** fact — which groups may open which floors — and it is deliberately not
 * derived from, mixed into, or drawn as, the bands above: a floor a shaft reaches and a credential
 * does not open is a different defect with a different fix, and `access/zoning.ts` already draws
 * the two with different glyphs for exactly that reason.
 *
 * It is carried at all because leaving it out was **destructive**. Before this change
 * {@link specFromBuilding} read no zones and {@link buildingFromSpec} wrote `accessZones: []`
 * unconditionally, so a reader who opened Secure Tower here and saved it untouched got a building
 * with none of its five zones — and nothing on any surface said so. `authoring.test.ts` holds the
 * round trip to the shipped documents for all five buildings.
 *
 * Floors are held as **floor numbers**, the same vocabulary `skyFloors` and `bandByCar` use, and
 * turned into ids by {@link floorIdOf} on the way out. That is what makes the multi-select a
 * control over *this building's own floors* rather than a text box that can name a floor the
 * document does not have — § 10.2's *"the control should make it unreachable"*.
 *
 * That is not a limitation being worked around; it is service zoning being modelled correctly.
 * `CLAUDE.md` is explicit that the three zonings are distinct concepts — service (physical), access
 * (credential), operational (dispatcher strategy) — and a shaft's reachable floors is the first of
 * the three. The elevation edits the fabric, and {@link validateSpec} states at the control what the
 * loader would say on save — including, precisely, **whether it would refuse or merely warn.** The
 * rise limit is the case that matters: `config/parse.ts` raises a class's `maxRiseM` as an
 * *advisory* — "the reference envelope is application guidance, not a hard limit" — and it builds
 * the bank. Saying "the loader refuses this" would be a false claim about a mechanism, which is the
 * defect `experiments/src/validation/documentation.test.ts` exists to catch one level up.
 */

import { expandFloors } from '@elevator-sim/core/browser';
import type {
  AccessZone,
  BankConfig,
  BuildingConfig,
  BuildingType,
  ElevatorSpecs,
  FloorConfig,
} from '@elevator-sim/core/browser';

import { credentialGroupsIn } from '../access/zoning.js';

/** Rated loads and their persons, verbatim from `data/elevator-specs.json`'s capacities table. */
export const RATED_LOADS: readonly number[] = Object.freeze([1000, 1600, 2500, 3000, 3500, 4000, 5000]);

/**
 * Persons per rated load — the table, not `lb / 150`.
 *
 * The repository's own table truncates: 1 600 lb is **10** persons, not 11 (`1600 / 150 = 10.67`).
 * Rounding here rather than reading the table is how a car quietly gains a passenger, and a car
 * capacity is a denominator of the fill rule, the load factor and the round-trip time.
 */
export const PERSONS_BY_LB: Readonly<Record<number, number>> = Object.freeze({
  1000: 6,
  1600: 10,
  2500: 16,
  3000: 20,
  3500: 23,
  4000: 26,
  5000: 33,
});

export function personsOf(ratedLoadLb: number): number {
  return PERSONS_BY_LB[ratedLoadLb] ?? Math.floor(ratedLoadLb / 150);
}

/**
 * One access zone, in the editor's own vocabulary.
 *
 * `core`'s {@link AccessZone} names floors by **id**; this names them by floor number, because the
 * floor a reader clicks in the multi-select is a row of the elevation and a spec that stored ids
 * would go stale the moment the floor slider moved. {@link accessZonesOf} is the translation, and
 * it is the only place the two vocabularies meet.
 */
export interface SpecAccessZone {
  readonly id: string;
  /** Floor numbers, `0` being the lobby. Kept in the order the reader (or the document) gave. */
  readonly floors: readonly number[];
  /** Credential groups permitted on those floors. Empty is a document the loader refuses. */
  readonly credentialGroups: readonly string[];
}

/** The editor's whole state. Flat, total, slider-shaped. */
export interface BuildingSpec {
  readonly id: string;
  readonly name: string;
  readonly type: BuildingType;
  readonly trafficProfile: string;
  /** Floors above the lobby. The lobby itself is always floor 0 and is never counted here. */
  readonly floors: number;
  readonly floorHeightM: number;
  /** What each floor was designed to hold. Does not change when tenants come and go. */
  readonly capacityPerFloor: number;
  /** Building-wide let share, percent. `0..120`; above 100 is over design capacity. */
  readonly occupancyPct: number;
  /** Per-floor overrides of {@link occupancyPct}, keyed by floor number (1 = first above lobby). */
  readonly occupancyByFloor: Readonly<Record<number, number>>;
  readonly cars: number;
  readonly specClass: string;
  readonly ratedSpeedMps: number;
  readonly ratedLoadLb: number;
  /** Floor numbers that are transfer levels. An explicit list, not an *every N* rule. */
  readonly skyFloors: readonly number[];
  /** Per-car service band `[lowFloor, highFloor]` as floor numbers, when a reader pinned one. */
  readonly bandByCar: Readonly<Record<number, readonly [number, number]>>;
  /**
   * Cars whose band starts above the lobby and which have been taken **out** of the lobby.
   *
   * The handoff's express toggle, § 1.3 M11, in its *off* position. A band above the lobby lands in
   * the lobby by default and runs non-stop past the floors beneath it; setting this keeps the car
   * entirely inside its band. Keyed by car index; `false` and absent mean the same thing, and the
   * flag is inert on a car whose band already starts at the lobby.
   */
  readonly noLobby: Readonly<Record<number, boolean>>;
  /**
   * Credential zoning, in declared order. Empty means every floor is open to every credential,
   * which is `Building.isAccessPermitted`'s own semantics and what four of the five shipped
   * buildings' `accessZones: []` says.
   */
  readonly accessZones: readonly SpecAccessZone[];
}

export const BLANK_SPEC: BuildingSpec = Object.freeze({
  id: 'my-building',
  name: 'My building',
  type: 'office' as BuildingType,
  trafficProfile: 'office-standard',
  floors: 12,
  floorHeightM: 3.6,
  capacityPerFloor: 80,
  occupancyPct: 85,
  occupancyByFloor: Object.freeze({}),
  cars: 4,
  specClass: 'geared-traction',
  ratedSpeedMps: 2.5,
  ratedLoadLb: 2500,
  skyFloors: Object.freeze([]),
  bandByCar: Object.freeze({}),
  noLobby: Object.freeze({}),
  accessZones: Object.freeze([]),
});

/** One row of the spec column — the handoff's five sliders, § 1.3 M11. */
export interface SpecRow {
  readonly key: 'floors' | 'floorHeightM' | 'capacityPerFloor' | 'occupancyPct' | 'cars';
  readonly label: string;
  readonly group: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly help: string;
  /** Above this the slider is drawn over capacity — occupancy only. */
  readonly overFrom?: number | undefined;
}

export const SPEC_ROWS: readonly SpecRow[] = Object.freeze([
  {
    key: 'floors',
    label: 'Floors above the lobby',
    group: 'GEOMETRY',
    min: 3,
    max: 120,
    step: 1,
    unit: '',
    help: 'Served floors, not counting the lobby. More floors means more possible stops per trip, which costs far more time than the extra distance does.',
  },
  {
    key: 'floorHeightM',
    label: 'Floor-to-floor height',
    group: 'GEOMETRY',
    min: 2.8,
    max: 5.5,
    step: 0.1,
    unit: ' m',
    help: 'Slab-to-slab rise per floor: about 3.6 m for an office, 3.0 m for apartments. It sets total travel, so it decides whether rated speed is ever reached.',
  },
  {
    key: 'capacityPerFloor',
    label: 'Design capacity per floor',
    group: 'OCCUPANCY',
    min: 10,
    max: 200,
    step: 5,
    unit: ' people',
    help: 'How many people the floor was designed to hold — the number the lifts were sized for. This does not change when tenants come and go.',
  },
  {
    key: 'occupancyPct',
    label: 'Occupied share of that capacity',
    group: 'OCCUPANCY',
    min: 10,
    max: 120,
    step: 5,
    unit: '% let',
    overFrom: 100,
    help: 'How much of that capacity is actually let today. Population = capacity × occupancy, and population is what the lifts have to move. A building sized at 100% and let at 60% feels like a different building.',
  },
  {
    key: 'cars',
    label: 'Cars in the group',
    group: 'THE LIFTS',
    min: 1,
    max: 12,
    step: 1,
    unit: '',
    help: 'Lifts answering as one group. A shaft is the most expensive thing in the building — this is the lever you are meant to avoid pulling.',
  },
]);

/** Percent let on one floor: its override, or the building-wide slider. */
export function occupancyAt(spec: BuildingSpec, floor: number): number {
  return spec.occupancyByFloor[floor] ?? spec.occupancyPct;
}

/** People on one floor today. */
export function populationAt(spec: BuildingSpec, floor: number): number {
  return Math.max(0, Math.round(spec.capacityPerFloor * (occupancyAt(spec, floor) / 100)));
}

export function totalPopulation(spec: BuildingSpec): number {
  let total = 0;
  for (let floor = 1; floor <= spec.floors; floor += 1) total += populationAt(spec, floor);
  return total;
}

export function totalCapacity(spec: BuildingSpec): number {
  return spec.floors * spec.capacityPerFloor;
}

export function riseM(spec: BuildingSpec): number {
  return spec.floors * spec.floorHeightM;
}

/** Floor ids, lobby first, in index order. `G`, then `2`, `3`, … as the shipped buildings do. */
export function floorIdOf(floor: number): string {
  return floor === 0 ? 'G' : String(floor + 1);
}

/**
 * The default band for a car when the reader has pinned nothing.
 *
 * With no sky lobby every car serves everything, which is what a single-bank building is. With sky
 * lobbies the tower is cut at each transfer level and the cars are dealt round-robin into the
 * segments — the arrangement that makes a sky lobby worth building, and the one
 * `mixed-use-high-rise` and `vertical-city` actually ship.
 */
export function defaultBandOf(spec: BuildingSpec, car: number): readonly [number, number] {
  const skies = [...spec.skyFloors].filter((floor) => floor > 0 && floor < spec.floors).sort((a, b) => a - b);
  if (skies.length === 0) return [0, spec.floors];
  const bounds = [0, ...skies, spec.floors];
  const segments: (readonly [number, number])[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    segments.push([bounds[i] as number, bounds[i + 1] as number]);
  }
  return segments[car % segments.length] ?? [0, spec.floors];
}

export function bandOf(spec: BuildingSpec, car: number): readonly [number, number] {
  const pinned = spec.bandByCar[car];
  if (pinned === undefined) return defaultBandOf(spec, car);
  const low = Math.max(0, Math.min(spec.floors, Math.min(pinned[0], pinned[1])));
  const high = Math.max(0, Math.min(spec.floors, Math.max(pinned[0], pinned[1])));
  return low === high ? [low, Math.min(spec.floors, low + 1)] : [low, high];
}

/**
 * Whether the express toggle is offered for this car at all.
 *
 * Only a band with at least one floor *between* it and the lobby has the question to answer — the
 * handoff's own gate, `lo > 1` at `:3131`. A band starting at the lobby obviously has no choice to
 * make; a band starting at floor 1 has none either, because its express form serves `0..high`,
 * which is contiguous, and is therefore the same set of floors as a band starting at the lobby.
 * Offering the control there would be offering a choice between a building and itself, which is
 * the "control that claims a mechanism it does not have" defect at widget scale.
 */
export function canExpress(spec: BuildingSpec, car: number): boolean {
  return bandOf(spec, car)[0] > 1;
}

/** Whether this car opens at the lobby: always, unless a band above it was taken out of it. */
export function servesLobby(spec: BuildingSpec, car: number): boolean {
  return !canExpress(spec, car) || spec.noLobby[car] !== true;
}

/** Every floor this car opens onto — its band, plus the lobby when it runs express to it. */
export function servedFloorsOf(spec: BuildingSpec, car: number): readonly number[] {
  const [low, high] = bandOf(spec, car);
  const floors: number[] = [];
  if (low > 0 && servesLobby(spec, car)) floors.push(0);
  for (let floor = low; floor <= high; floor += 1) floors.push(floor);
  return floors;
}

/**
 * Floors no car reaches.
 *
 * The elevation's warning, and a genuine defect in a building rather than a display nicety: a call
 * at an unserved floor is a call nobody may answer, which looks nothing like a slow one and must
 * never be reported as one. `access/lockedOut.ts` makes the same distinction for the credential
 * case; this is the service-zoning half of it.
 *
 * Counted over {@link servedFloorsOf} rather than over the raw band, because an express car really
 * does open at the lobby and `buildingFromSpec` really does write `G` into its `servesFloors`. The
 * band alone said otherwise, which was harmless while every band above the lobby was express and is
 * not once one of them can be closed.
 */
export function orphanFloors(spec: BuildingSpec): readonly number[] {
  const served = new Set<number>();
  for (let car = 0; car < spec.cars; car += 1) {
    for (const floor of servedFloorsOf(spec, car)) served.add(floor);
  }
  const orphans: number[] = [];
  for (let floor = 0; floor <= spec.floors; floor += 1) if (!served.has(floor)) orphans.push(floor);
  return orphans;
}

/**
 * Floors a shaft serves that a passenger standing in the lobby cannot get to.
 *
 * A different defect from {@link orphanFloors} and a worse one, because nothing downstream says a
 * word about it. Measured on this branch: a single bank closed to floors `7–11` with no transfer
 * level below it **loads with no error and no warning** — `parseBuilding` and `resolveBuilding` are
 * both silent — and then `traffic/generator.ts`'s `classifyTrip` returns `unreachable` for every
 * lobby-origin trip and the run carries 8 legs where the same building carries 114. That is demand
 * disappearing into a census, which is precisely the "confident nonsense" `CLAUDE.md` names.
 *
 * The model is `traffic/route.ts`'s, narrowed to what a spec can express: a car's served floors are
 * an edge, and a journey may change cars only on a floor flagged `isTransferFloor` — which in this
 * editor is a sky floor, and nothing else. `authoring.test.ts` holds it to the real
 * {@link RoutePlanner} on the resolved building in both directions, so this cannot drift into a
 * mirror that stopped mirroring.
 */
export function unreachableFloors(spec: BuildingSpec): readonly number[] {
  const transfers = new Set(spec.skyFloors.filter((floor) => floor > 0 && floor <= spec.floors));
  const served: readonly (readonly number[])[] = Array.from({ length: spec.cars }, (_, car) =>
    servedFloorsOf(spec, car),
  );
  const seen = new Set<number>([0]);
  let frontier: number[] = [0];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const at of frontier) {
      for (const floors of served) {
        if (!floors.includes(at)) continue;
        for (const floor of floors) {
          if (seen.has(floor)) continue;
          seen.add(floor);
          if (transfers.has(floor)) next.push(floor);
        }
      }
    }
    frontier = next;
  }
  const stranded: number[] = [];
  for (let floor = 0; floor <= spec.floors; floor += 1) if (!seen.has(floor)) stranded.push(floor);
  return stranded;
}

export interface SpecBank {
  readonly band: readonly [number, number];
  /** Whether this bank's cars open at the lobby. Always true of a band that starts there. */
  readonly lobby: boolean;
  readonly cars: readonly number[];
}

/**
 * Cars grouped into banks by the floors they open onto.
 *
 * A bank is *the set of cars that open onto the same floors*, which is what `BankConfig` means. So
 * the grouping key is the band, and a reader who drags one car's band away from the rest has split
 * the bank — correctly, and visibly, because the elevation redraws the legend with two banks in it.
 *
 * The lobby is part of that key, not a decoration on it. Two cars with the same band, one running
 * express to the lobby and one closed inside it, do **not** open onto the same floors and therefore
 * are not one bank — `BankConfig` has a single `servesFloors`, so a bank cannot hold both claims.
 * Keying on the band alone would have silently made one of the two cars serve floors it does not.
 */
export function banksOf(spec: BuildingSpec): readonly SpecBank[] {
  const byBand = new Map<string, { band: readonly [number, number]; lobby: boolean; cars: number[] }>();
  for (let car = 0; car < spec.cars; car += 1) {
    const band = bandOf(spec, car);
    const lobby = servesLobby(spec, car);
    const key = `${String(band[0])}:${String(band[1])}:${lobby ? 'L' : '-'}`;
    const found = byBand.get(key);
    if (found === undefined) byBand.set(key, { band, lobby, cars: [car] });
    else found.cars.push(car);
  }
  // Sorted by the band's low floor, so two specs that describe the same building produce the same
  // document — invariant 4's rule applied to authoring, and what makes `dirty` comparable. The
  // lobby breaks the remaining tie, for the same reason and by the same rule.
  return [...byBand.values()].sort(
    (a, b) =>
      a.band[0] - b.band[0] ||
      a.band[1] - b.band[1] ||
      Number(b.lobby) - Number(a.lobby),
  );
}

/** Car ids, `A` onward, matching what the canvas draws over each shaft. */
export function carLabelOf(car: number): string {
  return String.fromCharCode(65 + (car % 26));
}

/* -------------------------------------------------------------------------- *
 * Access zoning — pure
 * -------------------------------------------------------------------------- */

/**
 * A zone's floors, narrowed to floors this building actually has, de-duplicated, in declared order.
 *
 * The narrowing is what makes the floor slider safe to drag downward. `config/parse.ts` refuses a
 * zone naming a floor the building lacks, so a reader who shortened a 30-storey tower to ten with a
 * zone on floor 25 would otherwise be holding a document that cannot load, with the refusal
 * arriving from a control they were not touching. {@link validateSpec} says what was dropped.
 */
export function zoneFloorsOf(spec: BuildingSpec, zone: SpecAccessZone): readonly number[] {
  const kept: number[] = [];
  for (const floor of zone.floors) {
    if (floor < 0 || floor > spec.floors) continue;
    if (!kept.includes(floor)) kept.push(floor);
  }
  return kept;
}

/**
 * The zones as `core`'s own shape — floors named by id — which is what the document receives.
 *
 * A zone left naming no floor of this building is **omitted**: the schema requires at least one,
 * so writing it would produce a refusal whose message is about an array length rather than about
 * the tower having got shorter. A zone naming no credential *group* is written out as it stands,
 * because that one the reader can see and fix, and it is the state the coverage matrix exists to
 * make visible — a floor no credential opens.
 */
export function accessZonesOf(spec: BuildingSpec): readonly AccessZone[] {
  const zones: AccessZone[] = [];
  for (const zone of spec.accessZones) {
    const floors = zoneFloorsOf(spec, zone);
    if (floors.length === 0) continue;
    zones.push({
      id: zone.id,
      floors: floors.map((floor) => floorIdOf(floor)),
      credentialGroups: [...zone.credentialGroups],
    });
  }
  return zones;
}

/**
 * Every credential group this building already names, in declared order.
 *
 * The vocabulary the editor's group control offers, and § 10.2 is explicit that there is no other:
 * *"No fixed vocabulary — `core` has none and inventing one would be a second source of truth."*
 * It is `access/zoning.ts`'s own {@link credentialGroupsIn}, over the **unpruned** list, so a group
 * a reader typed does not vanish from the picker because its zone's floors went out of range.
 */
export function credentialGroupsOf(spec: BuildingSpec): readonly string[] {
  return credentialGroupsIn(
    spec.accessZones.map((zone) => ({
      id: zone.id,
      floors: [],
      credentialGroups: zone.credentialGroups,
    })),
  );
}

/** The next unused `zone-N` id, so adding a zone never collides with one the reader kept. */
export function nextZoneId(spec: BuildingSpec): string {
  const taken = new Set(spec.accessZones.map((zone) => zone.id));
  /*
   * `limit` is lifted out of the template deliberately. `honesty/derive.test-helper.ts` keeps a
   * substitution's text and calls any `a.b` inside it two adjacent words, so
   * `${String(taken.size + 1)}` made this function an unclassified **prose** surface over an id it
   * generates — a red `derive.test.ts`, measured rather than guessed. Same constraint that keeps
   * `EXPRESS_TITLE` in `dev/buildingEditor.ts` module-private.
   */
  const limit = taken.size + 1;
  for (let index = 1; index <= limit; index += 1) {
    const id = `zone-${String(index)}`;
    if (!taken.has(id)) return id;
  }
  return `zone-${String(limit)}`;
}

/**
 * One floor toggled in or out of one zone — the multi-select's edit, as a value.
 *
 * A pure function rather than a mutation inside the mount, for the reason every other decision in
 * `authoring/` is one: the test that says *the control changes the run* has to be able to make the
 * same edit the reader's click makes, and a click handler is not callable under Node.
 */
export function withZoneFloor(
  spec: BuildingSpec,
  zoneId: string,
  floor: number,
): readonly SpecAccessZone[] {
  return spec.accessZones.map((zone) => {
    if (zone.id !== zoneId) return zone;
    const held = zone.floors.includes(floor);
    const floors = held
      ? zone.floors.filter((entry) => entry !== floor)
      : [...zone.floors, floor].sort((a, b) => a - b);
    return { ...zone, floors };
  });
}

/** One credential group toggled in or out of one zone. The other half of the same control. */
export function withZoneGroup(
  spec: BuildingSpec,
  zoneId: string,
  group: string,
): readonly SpecAccessZone[] {
  const wanted = group.trim();
  if (wanted === '') return spec.accessZones;
  return spec.accessZones.map((zone) => {
    if (zone.id !== zoneId) return zone;
    const held = zone.credentialGroups.includes(wanted);
    return {
      ...zone,
      credentialGroups: held
        ? zone.credentialGroups.filter((entry) => entry !== wanted)
        : [...zone.credentialGroups, wanted],
    };
  });
}

/**
 * What a caller must supply beyond the spec for the document to load.
 *
 * Both fields exist because the loader **refuses** without them, and refusing is right:
 *
 * - `passengerTransferS` has no entry in `elevator-specs.json`'s `timing.passengerTransferS` for
 *   `mixed-use`, and the loader will not guess. Its own message says why — *"the office value on a
 *   residential car understates the round trip by about 6 %"* — so a building of that type must
 *   declare it per car. Supplying the specs lets this module ask the table and only write the field
 *   when the table has no answer, which keeps every other building's document unchanged.
 * - `dwell` is the group lever reaching the cars. See `dispatcherSpec.ts`'s {@link DwellSetting}
 *   for why it is a car field and not an `answer.maxDwellS`.
 */
export interface BuildingFromSpecOptions {
  readonly specs?: ElevatorSpecs | undefined;
  readonly dwell?:
    | { readonly dwellCarCallS: number; readonly dwellHallCallS: number }
    | undefined;
}

/**
 * Seconds per passenger per direction for a building type the reference table does not cover.
 *
 * Only `mixed-use` needs one today. The value is the mean of the office and residential figures
 * the table does carry (1.2 and 1.75), which is the least-wrong reading of a building that is both
 * — and it is written onto the car, visibly, rather than defaulted silently, so a reader who
 * disagrees can see the number and change it in the document editor.
 */
const TRANSFER_S_BY_TYPE: Readonly<Record<string, number>> = Object.freeze({
  'mixed-use': 1.5,
});

/** Turn the spec into a document the loader will parse and resolve. */
export function buildingFromSpec(
  spec: BuildingSpec,
  options: BuildingFromSpecOptions = {},
): BuildingConfig {
  const floors: FloorConfig[] = [];
  const skies = new Set(spec.skyFloors);
  for (let floor = 0; floor <= spec.floors; floor += 1) {
    const config: {
      -readonly [K in keyof FloorConfig]: FloorConfig[K];
    } = {
      id: floorIdOf(floor),
      index: floor,
      heightM: Math.round(floor * spec.floorHeightM * 100) / 100,
      population: floor === 0 ? 0 : populationAt(spec, floor),
    };
    if (floor === 0) config.isEntrance = true;
    if (floor !== 0 && skies.has(floor)) config.isTransferFloor = true;
    floors.push(config);
  }

  const groups = banksOf(spec);
  const banks: BankConfig[] = groups.map((group, index) => {
    const servesFloors: string[] = [];
    for (let floor = group.band[0]; floor <= group.band[1]; floor += 1) {
      servesFloors.push(floorIdOf(floor));
    }
    /*
     * A band that starts above the lobby still lands in the lobby — that is what a high-rise bank
     * is, and every shipped building with one says so. Adding the entrance rather than leaving the
     * band closed is the difference between an express group and a service car nobody can reach
     * from the ground.
     *
     * Which is exactly why it is a *choice* and not a rule: the handoff's express toggle (§ 1.3
     * M11) turns it off, and a bank with `lobby: false` is that self-contained service car. It is a
     * building this loader builds without complaint — measured, not assumed — and it is one a
     * reader can strand, so {@link unreachableFloors} guards it at the control.
     */
    if (group.band[0] > 0 && group.lobby && !servesFloors.includes('G')) servesFloors.unshift('G');
    return {
      /*
       * The single-bank case keeps the id every shipped building uses, so a spec that describes
       * one group produces the document a hand-authored one would — and a reader comparing the
       * downloaded JSON with `midtown-office.json` is not distracted by a gratuitous rename.
       */
      id: groups.length === 1 ? 'main' : `bank-${String(index + 1)}`,
      name:
        group.band[0] === 0
          ? 'Main bank'
          : group.lobby
            ? `Floors ${String(group.band[0])}–${String(group.band[1])}`
            : `Floors ${String(group.band[0])}–${String(group.band[1])}, no lobby`,
      servesFloors,
      cars: group.cars.map((car) => {
        const config: Record<string, unknown> = {
          id: carLabelOf(car),
          spec: spec.specClass,
          ratedSpeedMps: spec.ratedSpeedMps,
          ratedLoadLb: spec.ratedLoadLb,
          doorType: 'centerOpening',
        };
        const transfer = transferSecondsFor(spec.type, options.specs);
        if (transfer !== undefined) config['passengerTransferS'] = transfer;
        if (options.dwell !== undefined) {
          config['dwellCarCallS'] = options.dwell.dwellCarCallS;
          config['dwellHallCallS'] = options.dwell.dwellHallCallS;
        }
        return config as unknown as BankConfig['cars'][number];
      }),
    };
  });

  return {
    id: spec.id,
    name: spec.name.trim() === '' ? 'My building' : spec.name.trim(),
    type: spec.type,
    trafficProfile: spec.trafficProfile,
    floors,
    totalPopulation: totalPopulation(spec),
    banks,
    /*
     * Credential zoning, written out rather than blanked. This line read `accessZones: []` and the
     * consequence was not cosmetic: opening Secure Tower here and saving it untouched produced a
     * building whose five zones were gone, so the run it then described was a different building
     * from the one named at the top of the screen.
     */
    accessZones: accessZonesOf(spec),
  };
}

/**
 * The transfer time this building type must declare, or `undefined` when the table covers it.
 *
 * Asks `elevator-specs.json` first and only fills a gap. Writing the field unconditionally would
 * override the table on every ordinary building — the reference data would still be right and the
 * run would stop using it, which is the drift `SimulationConfig.elevatorSpecs` exists to prevent.
 */
function transferSecondsFor(type: BuildingType, specs: ElevatorSpecs | undefined): number | undefined {
  if (specs === undefined) return TRANSFER_S_BY_TYPE[type];
  const table = specs.timing.passengerTransferS as unknown as Record<string, unknown>;
  const declared = table[type];
  if (typeof declared === 'number') return undefined;
  return TRANSFER_S_BY_TYPE[type] ?? 1.2;
}

/**
 * What the loader would refuse, said at the control instead of on save.
 *
 * Deliberately **not** a re-implementation of `parseBuilding`: the mount calls the real parser on
 * every edit and shows whatever it says. What this adds is the two refusals the parser cannot make
 * because they are about a *drag* rather than about a document — a band that has collapsed, and a
 * floor no car reaches — plus the class limits, which the parser does raise and which a reader
 * needs to see while dragging rather than after.
 */
export function validateSpec(
  spec: BuildingSpec,
  machineClass: { readonly maxRiseM: number; readonly maxFloors: number; readonly name: string } | undefined,
): readonly string[] {
  const problems: string[] = [];
  const orphans = orphanFloors(spec);
  const orphaned = new Set(orphans);
  /*
   * Reported before the orphans and separately from them, because they are different defects with
   * different fixes: an orphan floor needs a shaft, a stranded one already has one and needs a way
   * in. Floors that are both are counted once, as orphans, since "no shaft serves it" is the more
   * specific thing to say.
   */
  const stranded = unreachableFloors(spec).filter((floor) => !orphaned.has(floor));
  if (stranded.length > 0) {
    const named =
      stranded.length > 6
        ? `${String(stranded.length)} floors have a shaft`
        : `Floor${stranded.length === 1 ? '' : 's'} ${stranded.map((floor) => floorIdOf(floor)).join(', ')} ${stranded.length === 1 ? 'has' : 'have'} a shaft`;
    problems.push(
      `${named} nobody can board from the lobby — nothing connects ${stranded.length === 1 ? 'it' : 'them'} to the entrance, directly or through a transfer level. The loader builds this without a word; the run then generates no trip to those floors at all, so the mean it reports is over the people it could still carry.`,
    );
  }
  if (orphans.length > 0) {
    problems.push(
      orphans.length > 6
        ? `No shaft serves ${String(orphans.length)} floors — a call there is one nobody may answer, which looks nothing like a slow one.`
        : `No shaft serves floor ${orphans.map((floor) => (floor === 0 ? 'G' : String(floor))).join(', ')} — a call there is one nobody may answer, which looks nothing like a slow one.`,
    );
  }
  /*
   * The three access-zoning states, said in the editor's words before the loader says them in its
   * own — and each worded for **what actually happens**, which is the part that took care.
   *
   * Only the first is a refusal, and only for a zone that will really be written: `config/schema.ts`
   * requires `credentialGroups.min(1)`, so a zone with none does not parse — but {@link accessZonesOf}
   * omits a zone covering no floor, so the same empty group list on a zone the reader has not yet
   * given a floor to is refused by nothing. Saying *the loader refuses this* there would be a false
   * claim about a mechanism, which is the defect class
   * `experiments/src/validation/documentation.test.ts` exists to catch one level up.
   */
  const written = spec.accessZones.filter((zone) => zoneFloorsOf(spec, zone).length > 0);
  for (const zone of written) {
    if (zone.credentialGroups.length > 0) continue;
    const floors = zoneFloorsOf(spec, zone).map((floor) => floorIdOf(floor));
    problems.push(
      `Access zone ${zone.id} covers floor ${floors.join(', ')} and names no credential group, so ` +
        'no credential opens those floors at all. Those are calls no car may legally answer, and the ' +
        'trips are never generated rather than served slowly — the run would report a mean over the ' +
        'people it could still carry. The loader refuses a zone with no group, so this building will ' +
        'not build until one is named or the zone is removed.',
    );
  }
  const trimmed = spec.accessZones.filter(
    (zone) => zoneFloorsOf(spec, zone).length < new Set(zone.floors).size,
  );
  if (trimmed.length > 0) {
    problems.push(
      `Access zone ${trimmed.map((zone) => zone.id).join(', ')} name${trimmed.length === 1 ? 's' : ''} ` +
        `a floor this tower does not have — it is ${String(spec.floors + 1)} floors tall now. Those ` +
        'floors are left out of the saved document rather than refused, so the zone covers fewer ' +
        'floors than it says.',
    );
  }
  const unwritten = spec.accessZones.filter((zone) => zoneFloorsOf(spec, zone).length === 0);
  if (unwritten.length > 0) {
    problems.push(
      `Access zone ${unwritten.map((zone) => zone.id).join(', ')} covers no floor of this building, ` +
        'so it is not written to the saved document and restricts nobody. Pick its floors, or remove it.',
    );
  }
  if (machineClass !== undefined) {
    const rise = riseM(spec);
    if (rise > machineClass.maxRiseM) {
      problems.push(
        `${String(Math.round(rise))} m of rise is past the reference envelope for ` +
          `${machineClass.name.toLowerCase()} (${String(machineClass.maxRiseM)} m). The loader raises ` +
          'this as an advisory and builds the bank anyway — the envelope is application guidance, ' +
          'not a hard limit — so the run happens and its round-trip times describe a machine ' +
          'outside its class.',
      );
    }
    if (spec.floors + 1 > machineClass.maxFloors) {
      problems.push(
        `${String(spec.floors + 1)} floors is past the ${String(machineClass.maxFloors)}-floor limit for ${machineClass.name.toLowerCase()}.`,
      );
    }
  }
  return problems;
}

/** The handoff's occupancy line, § 1.3 M11. */
export function occupancyLine(spec: BuildingSpec): string {
  const capacity = totalCapacity(spec);
  const population = totalPopulation(spec);
  const share = capacity === 0 ? 0 : Math.round((population / capacity) * 100);
  const handSet = Object.keys(spec.occupancyByFloor).length;
  const tail =
    handSet === 0
      ? `${String(populationAt(spec, 1))} people on every floor today`
      : `${String(handSet)} floor${handSet === 1 ? '' : 's'} let by hand`;
  return `Capacity ${String(capacity)} · occupied ${String(population)} (${String(share)}%) · ${tail}`;
}

/** The handoff's summary line, § 1.3 M11. */
export function buildingSummary(spec: BuildingSpec): string {
  return (
    `${String(spec.floors + 1)} floors · ${riseM(spec).toFixed(1)} m of travel · ` +
    `${String(totalPopulation(spec))} people · ${String(spec.cars)} cars at ` +
    `${spec.ratedSpeedMps.toFixed(2)} m/s · ${String(personsOf(spec.ratedLoadLb))} persons each`
  );
}

/** The handoff's advice line, § 1.3 M11. */
export function buildingAdvice(spec: BuildingSpec): string {
  const perShaft = totalPopulation(spec) / Math.max(1, spec.cars);
  if (perShaft > 320) {
    return 'That is a lot of people per shaft. Expect the lobby to stack up — which is a legitimate thing to build and watch.';
  }
  if (spec.ratedSpeedMps < 1.6 && spec.floors > 8) {
    return 'A hydraulic car over eight floors will feel like a very long morning. On purpose?';
  }
  /*
   * Not the handoff's "Plausible." — `honesty/` refuses a probability word in player-facing text
   * (§ D163's R10), and it is right to: *plausible* is a claim about how likely this design is to
   * work, made about a building nobody has run yet. What can honestly be said is which term will
   * dominate the round trip, which is a fact about the geometry and is true before the run.
   */
  return 'Round-trip time here will be dominated by stops and door time, not by speed.';
}

export function specIsDirty(spec: BuildingSpec, source: BuildingSpec): boolean {
  return JSON.stringify(normalize(spec)) !== JSON.stringify(normalize(source));
}

/** Key order made total, so two equal specs stringify equal. */
function normalize(spec: BuildingSpec): unknown {
  return {
    name: spec.name,
    type: spec.type,
    trafficProfile: spec.trafficProfile,
    floors: spec.floors,
    floorHeightM: spec.floorHeightM,
    capacityPerFloor: spec.capacityPerFloor,
    occupancyPct: spec.occupancyPct,
    occupancyByFloor: Object.entries(spec.occupancyByFloor).sort(([a], [b]) => a.localeCompare(b)),
    cars: spec.cars,
    specClass: spec.specClass,
    ratedSpeedMps: spec.ratedSpeedMps,
    ratedLoadLb: spec.ratedLoadLb,
    skyFloors: [...spec.skyFloors].sort((a, b) => a - b),
    bandByCar: Object.entries(spec.bandByCar).sort(([a], [b]) => a.localeCompare(b)),
    // Only the cars actually taken out of the lobby, so `{}` and `{ 0: false }` are the same
    // building rather than two — the flag's absent and false cases mean one thing.
    noLobby: Object.entries(spec.noLobby)
      .filter(([, off]) => off)
      .sort(([a], [b]) => a.localeCompare(b)),
    // The document's own zones rather than the raw list, so a floor the tower no longer has does
    // not read as an edit — `dirty` has to mean *this saves a different building*, and a zone floor
    // that is never written cannot make one.
    accessZones: accessZonesOf(spec),
  };
}

/**
 * Every floor a document declares, ranges expanded, sorted ascending by index.
 *
 * `parseBuilding` returns the document as authored, and two of the five shipped buildings declare
 * almost all of their floors as `floorRanges` — `mixed-use-high-rise` has **two** explicit floors
 * and 59 in ranges. Reading `config.floors` alone therefore read Mixed-Use High-Rise back as a
 * *three-storey* building, which is a second way the same round trip was destructive, and the one
 * that made access zoning impossible to carry: a zone naming floor `32` cannot survive into a
 * building that has three.
 *
 * `expandFloors` is `core`'s own expansion and it throws on a malformed range. Caught rather than
 * propagated, because this function runs while a reader is typing — the same requirement
 * `editorPreview.ts` was written for — and the authored floors are the honest fallback.
 */
function declaredFloorsOf(config: BuildingConfig): readonly FloorConfig[] {
  try {
    return expandFloors(config);
  } catch {
    return [...(config.floors ?? [])].sort((left, right) => left.index - right.index);
  }
}

/**
 * Read a shipped building back into the editor's shape.
 *
 * Lossy in one direction and honest about it: a shipped building's floors have ids and per-floor
 * traffic profiles that a `floors × capacity × occupancy` model cannot express. What comes back is
 * the *shape* — how tall, how many people, how many cars, how fast — so a reader can start from
 * Midtown Office and change one thing. The document editor beneath the elevation is where the parts
 * this drops are edited, which is why it is still there (§ 4.5).
 *
 * **Access zoning is no longer one of the parts it drops.** Zone floors are matched by their
 * **position** in the building's own non-entrance floor order — the same convention `skyFloors`
 * below already uses — never by arithmetic on the id, because a floor id is a string and
 * `mixed-use-high-rise` has no floor at index 1 at all. On all five shipped buildings the ids come
 * back identical, which `authoring.test.ts` asserts against the documents rather than asserting the
 * mapping.
 */
export function specFromBuilding(config: BuildingConfig, id: string): BuildingSpec {
  const declared = declaredFloorsOf(config);
  const floors = declared.filter((floor) => floor.isEntrance !== true);
  /*
   * Floor id to the spec's own floor number. Position `i` in the non-entrance list is spec floor
   * `i + 1`; every entrance is spec floor 0, which is what `buildingFromSpec` writes back — and
   * Midtown Office really does declare two of them.
   */
  const floorNumberById = new Map<string, number>();
  for (const floor of declared) if (floor.isEntrance === true) floorNumberById.set(floor.id, 0);
  floors.forEach((floor, index) => {
    floorNumberById.set(floor.id, index + 1);
  });
  const populations = floors.map((floor) => floor.population);
  const peak = Math.max(1, ...populations);
  const mean = populations.reduce((total, value) => total + value, 0) / Math.max(1, populations.length);
  const heights = floors.map((floor) => floor.heightM).sort((a, b) => a - b);
  const pitch =
    heights.length > 1 ? (heights[heights.length - 1] as number) - (heights[0] as number) : 3.6;
  const cars = config.banks.flatMap((bank) => bank.cars);
  const first = cars[0];
  // Design capacity is not recorded on a shipped building — it only has today's population. Taking
  // the tallest floor as ~90% let is the least-wrong inversion, and it is stated rather than hidden.
  const capacity = Math.max(10, Math.round(peak / 0.9 / 5) * 5);
  return {
    id,
    name: config.name,
    type: config.type,
    trafficProfile: config.trafficProfile,
    floors: Math.max(3, floors.length),
    floorHeightM: Math.max(2.8, Math.round((pitch / Math.max(1, floors.length - 1)) * 10) / 10),
    capacityPerFloor: capacity,
    occupancyPct: Math.max(10, Math.min(120, Math.round((mean / capacity) * 100 / 5) * 5)),
    occupancyByFloor: {},
    cars: Math.max(1, Math.min(12, cars.length)),
    specClass: first?.spec ?? 'geared-traction',
    ratedSpeedMps: first?.ratedSpeedMps ?? 2.5,
    ratedLoadLb: first?.ratedLoadLb ?? 2500,
    skyFloors: floors
      .map((floor, index) => (floor.isTransferFloor === true ? index + 1 : 0))
      .filter((floor) => floor > 0),
    // Both empty for the same documented reason: a shipped building's zoning is not a set of
    // per-car bands, so reading one back gives the *shape* and not the banks (§ 4.5). `noLobby` is
    // meaningless without a band to hang it on, so it comes back empty with `bandByCar` rather than
    // being inferred from a `servesFloors` this model did not produce.
    bandByCar: {},
    noLobby: {},
    /*
     * Access zoning, in declared order, with each zone's floors in the order the document gave
     * them. A floor id the expansion does not know is dropped rather than guessed — it cannot occur
     * on a document `parseBuilding` accepted, since `config/parse.ts` cross-references every one,
     * and dropping it is still the right answer for a document this function was handed directly.
     */
    accessZones: (config.accessZones ?? []).map((zone) => ({
      id: zone.id,
      floors: zone.floors
        .map((floorId) => floorNumberById.get(floorId))
        .filter((floor): floor is number => floor !== undefined),
      credentialGroups: [...zone.credentialGroups],
    })),
  };
}
