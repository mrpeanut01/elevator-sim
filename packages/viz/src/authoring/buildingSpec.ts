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
 * ## Floors below the lobby, and why the number is not the whole story
 *
 * The floor-number vocabulary runs **`-belowLobby.length … 0 … floors`**: the lobby is `0`, a row
 * above it is positive, and a row below it is negative with `-1` nearest the lobby. That is the
 * positional reading the paragraph above insists on, extended downward, and it is what
 * {@link BuildingSpec.belowLobby} adds.
 *
 * It is added because leaving it out was **destructive and silent**. `floorIdOf` used to be
 * `floor === 0 ? 'G' : String(floor + 1)` over a vocabulary with no room beneath the lobby, so
 * `specFromBuilding` dealt a basement the first slot *above* the lobby and every floor in the
 * building moved up one: `crown-hotel`'s `back-of-house` zone named `B1` going in and `2` coming
 * out, which put housekeeping, engineering and security on a guest bedroom floor, and
 * `st-jude-hospital`'s main stair joined `G` to `1` going in and `G` to `3` coming out. Both were
 * reached by opening the building and saving it untouched.
 *
 * **What a floor number cannot carry is the floor's name, and only below the lobby.** Above it a
 * name is arithmetic — {@link BuildingSpec.firstFloorNumber} and one per floor after it. Below it
 * the three shipped basements are `B1`, `P1` and `LG`: a car park, a plant floor and a lower
 * ground, three names for one position, so a rule that minted any of them would rename the other
 * two. So `belowLobby` holds the ids — and holds *only* those, which is the line this module keeps:
 * every **reference** to a floor is still a number ({@link SpecAccessZone.floors},
 * {@link SpecTransportMode.connects}, `skyFloors`, `bandByCar`), so nothing goes stale when the
 * floor slider moves. The list's own length is how many floors are below the lobby, so there is no
 * second count to drift against it.
 *
 * ## Sky lobbies are two mechanisms, and they are deliberately kept apart
 *
 * A sky lobby in this editor is **two** independent facts, and collapsing them would repeat the
 * mistake the paragraph above refuses:
 *
 * - {@link BuildingSpec.skyFloors} sets `FloorConfig.isTransferFloor`. That is *bank segmentation*
 *   — where the tower is cut, which cars are dealt into which segment ({@link defaultBandOf}), and
 *   the only floors at which `traffic/route.ts` lets a journey change lifts.
 * - {@link BuildingSpec.transportModes} declares an **edge outside every bank**: an escalator
 *   joining two floors at a declared cost, which the router traverses in preference to a lift leg.
 *
 * They are neither derived from one another nor cross-checked into one field. Deriving a transfer
 * flag from an escalator would silently re-deal every car's default band the moment a reader added
 * a machine, and deriving an escalator from a transfer flag would author hardware nobody asked for.
 * `data/buildings/vertical-city.json` declares both, separately, for all four of its two-level
 * lobbies — which is the shape this editor now reproduces.
 *
 * What *is* stated, at the control, is how the two interact, because it is the one thing a reader
 * cannot see: a floor reached over a transport edge only re-enters `route.ts`'s search when it is a
 * transfer floor, so an escalator between two ordinary floors carries only journeys that begin on
 * one of them and end on the other. {@link validateSpec} says so; it does not fix it, because a
 * two-level lobby whose upper level is a dead end is a building somebody may mean to build.
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
  DirectionalTraversalTime,
  ElevatorSpecs,
  FloorConfig,
  StairsUseConfig,
  TransportModeConfig,
  TransportModeKind,
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
 * would go stale the moment the floor slider moved. {@link accessZonesOf} is the translation for a
 * zone, and it is the only place a zone's two vocabularies meet — it reaches {@link floorIdOf},
 * which is the one function in this module that turns a floor number into an id and the only place
 * any arithmetic on an id happens.
 */
export interface SpecAccessZone {
  readonly id: string;
  /**
   * Floor numbers, `0` being the lobby and a negative one a floor below it. Kept in the order the
   * reader (or the document) gave.
   */
  readonly floors: readonly number[];
  /** Credential groups permitted on those floors. Empty is a document the loader refuses. */
  readonly credentialGroups: readonly string[];
}

/**
 * One non-lift connection between two floors — an escalator pair joining the two levels of a
 * lobby — in the editor's own vocabulary.
 *
 * The {@link SpecAccessZone} precedent, followed exactly: `core`'s {@link TransportModeConfig}
 * names floors by **id**, and this names them by floor number, because the floor a reader picks is
 * a row of the elevation and a spec holding ids would go stale the moment the floor slider moved.
 * {@link transportModesOf} is the translation for a machine, and it reaches the same
 * {@link floorIdOf} a zone's does.
 *
 * `connects` is a fixed pair for the reason the schema makes it one: a machine with three landings
 * is two machines.
 *
 * **Three fields carry `core`'s two kinds rather than one, and the narrowing that used to sit here
 * was a crash.** This interface declared `traversalTimeS: number` while `transportModeSchema`
 * declares a union, so `?building=st-jude-hospital` — the one shipped building with a stair —
 * reached `toFixed` on an object and took the whole viewer down before a frame was drawn
 * (issue #108). A type that is narrower than the data it is read from does not protect anything;
 * it moves the failure from the compiler to the browser. {@link kind} and {@link use} come with it
 * because a stairs mode is refused without them: emitting the pair and dropping the kind would
 * turn a crash into a document the loader will not open, which is the same defect one layer down.
 */
export interface SpecTransportMode {
  readonly id: string;
  /**
   * The two floor numbers it joins, `0` being the lobby and a negative one a floor below it. The
   * two must differ.
   */
  readonly connects: readonly [number, number];
  /**
   * Landing-to-landing seconds, **including** stepping on and stepping off.
   *
   * A scalar for an escalator, `{ upS, downS }` for stairs — `core`'s union verbatim, and the two
   * arms are not interchangeable in either direction: `transportModeSchema` refuses a scalar on a
   * stairs mode because a symmetric stair is a stair with its modelling content deleted, and
   * refuses a pair on an escalator because one belt runs at one speed.
   *
   * Carried rather than derived, and that is a decision with a cost either way. Deriving it from
   * the building's own floor height ({@link escalatorSecondsFor}) would keep it honest when the
   * height slider moves — but it would also make {@link specFromBuilding} lossy on every document
   * whose floors are not evenly pitched, and `vertical-city` is exactly that document: its four
   * escalators all declare 21.2 s over a real 4.5 m rise that no single floor pitch reproduces. A
   * round trip that quietly rewrites an authored, cited reference value is worse than a seeded one
   * a reader can see and change, so the derivation seeds a *new* machine and never overwrites a
   * loaded one.
   *
   * The derivation is an **escalator** one — EN 115-1, a 30° incline at 0.5 m/s — so it seeds only
   * the scalar arm. A stair's two numbers come from a climbing and a descending speed and this
   * editor has no control that authors one; see {@link withTransportSeconds} for the refusal.
   */
  readonly traversalTimeS: number | DirectionalTraversalTime;
  /**
   * What the machine is. Absent means `escalator`, which is what every machine this editor
   * *authors* is — {@link withTransportSeconds} and the *+ escalator* button write nothing else.
   *
   * It is carried anyway, because a loaded document may declare `stairs` and dropping the field on
   * the way back out would hand `parseBuilding` a directional traversal time on an escalator, which
   * it refuses in as many words.
   */
  readonly kind?: TransportModeKind | undefined;
  /**
   * The propensity pair a stairs mode is refused without — who actually walks, by the *sign* of the
   * floor delta.
   *
   * Carried for {@link kind}'s reason and no other: nothing in this editor writes it, and a stair
   * with no `use` is a mode the loader will not accept, so dropping it would make the round trip
   * destructive on the one building that has one.
   */
  readonly use?: StairsUseConfig | undefined;
}

/**
 * One machine's traversal time as a reader sees it — `21.2 s`, or `26.0 s up / 19.0 s down`.
 *
 * **Both directions are named, and the compact `26.0 / 19.0 s` the issue suggested is deliberately
 * not what this returns.** The asymmetry *is* the modelling content of a stair — `core`'s schema
 * refuses a scalar on one for exactly that reason — so a label that prints two numbers without
 * saying which is the climb re-symmetrises them in the reader's head, which is the defect the union
 * exists to prevent wearing a different hat. The words are `up` and `down` because that is what the
 * document's own fields are called (`upS`, `downS`, and `use.up` / `use.down` beside them), so a
 * reader moving between the screen and the JSON is reading one vocabulary.
 */
export function traversalTimeLabel(traversalTimeS: number | DirectionalTraversalTime): string {
  /*
   * Every number is a local before it reaches a template — `transportCommentFor`'s constraint, and
   * it bit here too. `honesty/derive.test-helper.ts` reads a dotted member expression inside a
   * substitution as prose, so `${traversalTimeS.toFixed(1)} s` made this an unclassified
   * **player-facing text** surface and `derive.test.ts` went red naming it. Measured, not guessed.
   */
  if (typeof traversalTimeS === 'number') {
    const seconds = traversalTimeS.toFixed(1);
    return `${seconds} s`;
  }
  const up = traversalTimeS.upS.toFixed(1);
  const down = traversalTimeS.downS.toFixed(1);
  return `${up} s up / ${down} s down`;
}

/**
 * One floor below the lobby, in the editor's own vocabulary.
 *
 * Two fields, and both are here because a floor number cannot carry them. The **id** is not
 * derivable from the position — see {@link floorIdOf} — and the **entrance** flag is a modelled
 * fact rather than a label: `midtown-office` declares its car park `isEntrance`, so arrivals reach
 * the building through it and it carries no resident population. Dropping the flag would move a
 * street door and put people in a car park; the editor authors neither, and carries both.
 */
export interface SpecBelowLobbyFloor {
  /** The id the document gave it — `B1`, `P1`, `LG`. */
  readonly id: string;
  /** Whether the document declares it an entrance: a second street door, at the back or below. */
  readonly isEntrance?: boolean | undefined;
}

/** The editor's whole state. Flat, total, slider-shaped. */
export interface BuildingSpec {
  readonly id: string;
  readonly name: string;
  readonly type: BuildingType;
  readonly trafficProfile: string;
  /** Floors above the lobby. The lobby itself is always floor 0 and is never counted here. */
  readonly floors: number;
  /**
   * Floors below the lobby, **nearest the lobby first** — floor `-1`, then `-2`, and so on. Its
   * length is how many there are, so nothing can disagree with it about the count.
   *
   * Empty on five of the eight shipped buildings, and on everything this editor authors: there is
   * no control that digs a basement, and {@link specFromBuilding} is the only thing that fills this.
   * A loaded one is carried rather than dropped, for {@link SpecTransportMode.kind}'s reason and no
   * other — dropping it renumbered every floor above it.
   */
  readonly belowLobby: readonly SpecBelowLobbyFloor[];
  /**
   * The number the first floor above the lobby carries — `2` in a building with no floor `1`.
   *
   * A convention, not an id: it is one integer, it survives the floor slider, and it is what makes
   * `floor 1` mean *the first row above the lobby* while still printing what the document printed.
   * Seven of the eight shipped buildings say `2` (there is no first floor; the lobby is the ground
   * floor and the next one up is the second) and `st-jude-hospital` says `1`. Carried rather than
   * assumed because assuming it renamed every floor of that hospital, including the two its
   * `clinical` access zone names.
   */
  readonly firstFloorNumber: number;
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
  /**
   * Non-lift connections, in declared order. Empty is a building whose every floor-to-floor move
   * is charged to a lift, which is what four of the five shipped buildings say by declaring none.
   */
  readonly transportModes: readonly SpecTransportMode[];
}

export const BLANK_SPEC: BuildingSpec = Object.freeze({
  id: 'my-building',
  name: 'My building',
  type: 'office' as BuildingType,
  trafficProfile: 'office-standard',
  floors: 12,
  belowLobby: Object.freeze([]),
  firstFloorNumber: 2,
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
  transportModes: Object.freeze([]),
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

/**
 * The bottom of the building, as a floor number: `0` with no basement, `-1` with one, and so on.
 *
 * Every loop over the building's floors starts here rather than at `0`. It is the negated length of
 * {@link BuildingSpec.belowLobby}, which is held *nearest the lobby first*, so its last element is
 * the deepest floor and the one this names.
 */
export function lowestFloorOf(spec: BuildingSpec): number {
  // `0 - n` rather than `-n`, because unary minus on zero is **negative** zero and negative zero is
  // not `0` to `toStrictEqual`, `Object.is` or a `Map` key. A building with no basement must return
  // the same `0` the lobby is, or it starts failing comparisons for a reason that has nothing to do
  // with floors. `0 - 0` is `+0`; `-0` is not.
  return 0 - spec.belowLobby.length;
}

/** How many floors this building has in total — the elevation's row count. */
export function floorCountOf(spec: BuildingSpec): number {
  return spec.floors - lowestFloorOf(spec) + 1;
}

/**
 * Whether this floor is a way in from the street.
 *
 * The lobby always is. A floor below it is one only when the document said so — `midtown-office`'s
 * `P1` does, and it is the reason this is a question rather than `floor === 0`: an entrance carries
 * no resident population, so getting it wrong either invents people in a car park or takes a door
 * away from a building that has one.
 */
export function isEntranceFloor(spec: BuildingSpec, floor: number): boolean {
  if (floor === 0) return true;
  if (floor >= 0) return false;
  return spec.belowLobby[-floor - 1]?.isEntrance === true;
}

/** Every floor that can hold people: the whole building, less its entrances. Bottom floor first. */
function occupiableFloorsOf(spec: BuildingSpec): readonly number[] {
  const floors: number[] = [];
  for (let floor = lowestFloorOf(spec); floor <= spec.floors; floor += 1) {
    if (!isEntranceFloor(spec, floor)) floors.push(floor);
  }
  return floors;
}

export function totalPopulation(spec: BuildingSpec): number {
  let total = 0;
  for (const floor of occupiableFloorsOf(spec)) total += populationAt(spec, floor);
  return total;
}

export function totalCapacity(spec: BuildingSpec): number {
  return occupiableFloorsOf(spec).length * spec.capacityPerFloor;
}

/**
 * Total travel, bottom floor to top.
 *
 * Measured over the whole shaft rather than over the floors above the lobby, because a bank that
 * opens onto a basement really does travel that far and `maxRiseM` is a claim about the machine.
 */
export function riseM(spec: BuildingSpec): number {
  return (spec.floors - lowestFloorOf(spec)) * spec.floorHeightM;
}

/**
 * A floor number as this building's own floor id — the **one** translation between the two
 * vocabularies, and the only place in this module where any arithmetic on an id happens.
 *
 * Three cases, and the first is why this takes a spec at all:
 *
 * - **Below the lobby** (`-1` nearest it): whatever the document called that floor, held on
 *   {@link BuildingSpec.belowLobby}. It is not derivable, and that is measured rather than assumed
 *   — the three shipped buildings with a basement call the same position `B1`, `P1` and `LG`, so
 *   any rule that minted one of them would rename the other two.
 * - **The lobby** (`0`): `G`. All eight shipped buildings agree, so there is nothing here to carry;
 *   a field nothing varies is a control that changes nothing.
 * - **Above the lobby**: {@link BuildingSpec.firstFloorNumber} at floor 1, one per floor after it.
 *
 * The fallback below the list is a floor no building has — a mode end left pointing under a tower
 * whose basement was removed. It is named `B2`-style rather than left `undefined` because the only
 * callers for it are {@link validateSpec}'s messages, and a warning that says *floor undefined* is
 * a warning about the formatter rather than about the building.
 */
export function floorIdOf(spec: BuildingSpec, floor: number): string {
  if (floor === 0) return 'G';
  if (floor < 0) return spec.belowLobby[-floor - 1]?.id ?? `B${String(-floor)}`;
  return String(floor + spec.firstFloorNumber - 1);
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
  const lowest = lowestFloorOf(spec);
  const skies = [...spec.skyFloors].filter((floor) => floor > 0 && floor < spec.floors).sort((a, b) => a - b);
  if (skies.length === 0) return [lowest, spec.floors];
  const bounds = [lowest, ...skies, spec.floors];
  const segments: (readonly [number, number])[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    segments.push([bounds[i] as number, bounds[i + 1] as number]);
  }
  return segments[car % segments.length] ?? [lowest, spec.floors];
}

export function bandOf(spec: BuildingSpec, car: number): readonly [number, number] {
  const pinned = spec.bandByCar[car];
  if (pinned === undefined) return defaultBandOf(spec, car);
  const lowest = lowestFloorOf(spec);
  const low = Math.max(lowest, Math.min(spec.floors, Math.min(pinned[0], pinned[1])));
  const high = Math.max(lowest, Math.min(spec.floors, Math.max(pinned[0], pinned[1])));
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
  for (let floor = lowestFloorOf(spec); floor <= spec.floors; floor += 1) {
    if (!served.has(floor)) orphans.push(floor);
  }
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
 * an edge, **a transport mode is a second kind of edge**, and a journey may change cars only on a
 * floor flagged `isTransferFloor` — which in this editor is a sky floor, and nothing else.
 * `authoring.test.ts` holds it to the real {@link RoutePlanner} on the resolved building in both
 * directions, so this cannot drift into a mirror that stopped mirroring.
 *
 * The transport edges are counted here rather than left out because leaving them out would have
 * been a *false refusal*: a two-level lobby whose upper level is reached only by escalator is a
 * building the loader builds and the router routes, and an editor calling those floors stranded
 * would be arguing with the run it is about to produce.
 */
export function unreachableFloors(spec: BuildingSpec): readonly number[] {
  const transfers = new Set(spec.skyFloors.filter((floor) => floor > 0 && floor <= spec.floors));
  const served: readonly (readonly number[])[] = Array.from({ length: spec.cars }, (_, car) =>
    servedFloorsOf(spec, car),
  );
  const edges = writtenTransportModes(spec);
  const seen = new Set<number>([0]);
  let frontier: number[] = [0];
  while (frontier.length > 0) {
    const next: number[] = [];
    const reach = (floor: number): void => {
      if (seen.has(floor)) return;
      seen.add(floor);
      if (transfers.has(floor)) next.push(floor);
    };
    for (const at of frontier) {
      for (const edge of edges) {
        if (edge.connects[0] === at) reach(edge.connects[1]);
        if (edge.connects[1] === at) reach(edge.connects[0]);
      }
      for (const floors of served) {
        if (!floors.includes(at)) continue;
        for (const floor of floors) reach(floor);
      }
    }
    frontier = next;
  }
  const stranded: number[] = [];
  for (let floor = lowestFloorOf(spec); floor <= spec.floors; floor += 1) {
    if (!seen.has(floor)) stranded.push(floor);
  }
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
  const lowest = lowestFloorOf(spec);
  for (const floor of zone.floors) {
    if (floor < lowest || floor > spec.floors) continue;
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
      floors: floors.map((floor) => floorIdOf(spec, floor)),
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

/* -------------------------------------------------------------------------- *
 * Transport modes — pure
 * -------------------------------------------------------------------------- */

/**
 * Escalator inclination, nominal speed and landing run — the EN 115-1 derivation
 * `data/buildings/vertical-city.json` performs by hand in each of its four `$comment`s, moved
 * here so a machine a reader adds carries the same arithmetic rather than a guessed constant.
 *
 * 30° is the only angle BS EN 115-1 permits above a 6 m rise and the common commercial compromise
 * below it; 0.5 m/s is the common commercial nominal speed (EN 115-1 permits up to 0.75 m/s at
 * 30°); the standard step depth is 0.40 m and EN 115-1 requires at least two flat steps at each
 * landing for a rise of 6 m or less. See `docs/02-elevator-reference.md`.
 */
const ESCALATOR_SPEED_MPS = 0.5;
const ESCALATOR_SIN_INCLINATION = 0.5;
const ESCALATOR_FLAT_RUN_M = 2 * 2 * 0.4;

/**
 * The traversal time a newly added escalator is seeded with, in seconds, one decimal place.
 *
 * Incline length is `rise / sin 30°`, ridden at nominal speed, plus the flat run at each landing.
 * On a 4.5 m rise that is `18.0 + 3.2 = 21.2 s`, which is `vertical-city`'s figure to the digit —
 * asserted in `authoring.test.ts` rather than claimed here.
 *
 * **Its one stated limit.** The two-flat-step allowance holds for a rise of 6 m or less, which
 * covers every adjacent floor pair this editor can produce (the height slider stops at 5.5 m). A
 * machine spanning more than one floor is extrapolating past that clause, and the number it seeds
 * is a starting point the reader can change rather than a cited figure.
 */
export function escalatorSecondsFor(spec: BuildingSpec, connects: readonly [number, number]): number {
  const riseM = Math.abs(connects[1] - connects[0]) * spec.floorHeightM;
  const inclineM = riseM / ESCALATOR_SIN_INCLINATION;
  const seconds = (inclineM + ESCALATOR_FLAT_RUN_M) / ESCALATOR_SPEED_MPS;
  return Math.max(0.1, Math.round(seconds * 10) / 10);
}

/** The next unused `escalator-N` id, minted exactly as {@link nextZoneId} mints a zone's. */
export function nextTransportModeId(spec: BuildingSpec): string {
  const taken = new Set(spec.transportModes.map((mode) => mode.id));
  // Lifted out of the template for the reason `nextZoneId` lifts it: a `${a.b}` inside a string
  // literal makes this an unclassified prose surface over an id it generates.
  const limit = taken.size + 1;
  for (let index = 1; index <= limit; index += 1) {
    const id = `escalator-${String(index)}`;
    if (!taken.has(id)) return id;
  }
  return `escalator-${String(limit)}`;
}

/**
 * One end of one machine moved to a floor — the landing picker's edit, as a value.
 *
 * Pure for the reason every edit in this module is: the test that says *the control changes the
 * run* has to make the same edit the reader's click makes, and a click handler is not callable
 * under Node.
 *
 * Setting an end onto the floor the other end already holds is **refused rather than applied**.
 * The schema will not accept a machine that starts and ends on the same floor, and § 10.2's rule
 * for a control is to make the unloadable state unreachable rather than catchable.
 */
export function withTransportEnd(
  spec: BuildingSpec,
  modeId: string,
  end: 0 | 1,
  floor: number,
): readonly SpecTransportMode[] {
  return spec.transportModes.map((mode) => {
    if (mode.id !== modeId) return mode;
    if (mode.connects[1 - end] === floor) return mode;
    const connects: readonly [number, number] =
      end === 0 ? [floor, mode.connects[1]] : [mode.connects[0], floor];
    return { ...mode, connects };
  });
}

/**
 * One machine's traversal time set — the seconds control's edit.
 *
 * Clamped to a positive value, because `transportModeSchema` requires one and this is the only
 * control that could write otherwise. {@link validateSpec} still carries the refusal, for a spec
 * that reached a non-positive time by some route this function did not author.
 *
 * **A directional time is left exactly as it was, and the refusal is the point.** The control that
 * calls this is one `<input type="number">`; a stairs mode is two numbers whose *difference* is the
 * whole reason `core` declares the union at all. Writing the typed figure over the pair would keep
 * the climb and throw the descent away — a control that silently deletes the field it was pointed
 * at — and `transportModeSchema` would then refuse the document for symmetrising a stair, which is
 * a refusal about a tuple rather than about the control the reader touched. So the pair is carried
 * through untouched and the editor **says** it cannot write it (`dev/buildingEditor.ts`'s
 * `transportNoteOf`, and the disabled input beside it). § D227: a control that cannot write
 * something must say so, and the sentence that says so is pinned by a test rather than by this
 * comment.
 */
export function withTransportSeconds(
  spec: BuildingSpec,
  modeId: string,
  seconds: number,
): readonly SpecTransportMode[] {
  const wanted = Number.isFinite(seconds) ? Math.round(seconds * 10) / 10 : 0;
  return spec.transportModes.map((mode) => {
    if (mode.id !== modeId) return mode;
    if (typeof mode.traversalTimeS !== 'number') return mode;
    return { ...mode, traversalTimeS: Math.min(600, Math.max(0.1, wanted)) };
  });
}

/**
 * The machines this spec will actually write, in declared order.
 *
 * Two are dropped, and both follow {@link accessZonesOf}'s narrow-and-omit rule rather than
 * deviating from it:
 *
 * - **An end this tower no longer has.** `config/parse.ts` refuses a mode naming an unknown floor,
 *   so a reader who shortened a thirty-storey tower to ten would otherwise be holding a document
 *   that cannot load, with the refusal arriving from a control they were not touching. Unlike a
 *   zone's floor list there is nothing to *narrow* — `connects` is a pair, and a pair with one end
 *   removed is not a connection — so the omission is of the whole machine.
 * - **Both ends on one floor.** The schema refuses it in as many words; writing it would produce a
 *   refusal about a tuple rather than about the two pickers that produced it.
 *
 * A non-positive `traversalTimeS` is **not** dropped, and the asymmetry is deliberate: that one a
 * reader can see and fix on the control that set it, so it is written out and {@link validateSpec}
 * says the loader will refuse the building — the same split {@link accessZonesOf} draws between a
 * zone covering no floor and a zone naming no credential group.
 *
 * `kind` and `use` are written **only when the mode carries them**, which on everything this editor
 * authors means never: an absent `kind` is `escalator` to the schema, and emitting `"escalator"` on
 * all four of Vertical City's machines would add a key to a document that never had one. They exist
 * so a *loaded* stair survives the round trip — see {@link SpecTransportMode.kind}.
 */
export function transportModesOf(spec: BuildingSpec): readonly TransportModeConfig[] {
  return writtenTransportModes(spec).map((mode) => ({
    $comment: transportCommentFor(spec, mode),
    id: mode.id,
    connects: [floorIdOf(spec, mode.connects[0]), floorIdOf(spec, mode.connects[1])] as readonly [
      string,
      string,
    ],
    ...(mode.kind === undefined ? {} : { kind: mode.kind }),
    traversalTimeS: mode.traversalTimeS,
    ...(mode.use === undefined ? {} : { use: mode.use }),
  }));
}

/**
 * The citation `TransportModeConfig.traversalTimeS` requires, written on every machine this
 * editor emits.
 *
 * The field's own contract is explicit — *"Reference value, so it must be cited in the declaring
 * building's `$comment`"* — and a designer that emitted the number without it would put *a guess
 * wearing a number* into `data/buildings/` with nothing to notice. `vertical-city` writes this
 * derivation by hand four times; here it is computed, so it cannot go stale: it is re-derived from
 * the current spec on every emit rather than carried from whatever the geometry used to be.
 *
 * **Three branches, and the second is the one that keeps the first honest.** A value still equal to
 * {@link escalatorSecondsFor} is derived, and the derivation is written out with this building's
 * own numbers. A value that is not — a reader's edit, or a figure that came back through
 * {@link specFromBuilding} off a document whose floors are not evenly pitched — is labelled as the
 * author's and is **not** claimed to be cited. Writing the derivation beside a number it does not
 * produce would be the stale-citation defect this function exists to avoid.
 *
 * **The third is a stairs mode, and it prints no derivation at all.** The EN 115-1 arithmetic below
 * is about a *belt on a 30° incline at 0.5 m/s*; a stair's two numbers come from a climbing and a
 * descending speed over the same rise, and `st-jude-hospital` cites Fruin for exactly that. Running
 * the escalator method beside a stair's pair and calling the difference "not the figure this
 * building's geometry gives" would be a **stated mechanism that is false** — the defect
 * `CLAUDE.md` opens on, in the one place this editor writes provenance. So the stairs branch says
 * what the numbers are, says they came in on the loaded document and are not this editor's to
 * derive, and stops.
 */
function transportCommentFor(spec: BuildingSpec, mode: SpecTransportMode): string {
  const [low, high] = [Math.min(...mode.connects), Math.max(...mode.connects)];
  const heightOf = (floor: number): string =>
    (Math.round(floor * spec.floorHeightM * 100) / 100).toFixed(2);
  const riseM = (high - low) * spec.floorHeightM;
  const inclineM = riseM / ESCALATOR_SIN_INCLINATION;
  const derivedS = escalatorSecondsFor(spec, mode.connects);
  /*
   * Every number is a local before it reaches a template, which is the constraint `nextZoneId`
   * states for its own `limit`: `honesty/derive.test-helper.ts` reads a dotted member expression
   * inside a substitution as prose, and that would make this function — and everything that calls
   * it, up to `specIsDirty` — an unclassified **player-facing text** surface. It is not one. It is
   * a document field, on the same footing as the `$comment` `vertical-city` writes by hand in
   * `data/`, and classifying it as player copy would put JSON provenance under the rules written
   * for what a reader is shown on screen. Measured, not guessed: `derive.test.ts` went red on
   * exactly this and named the substitution.
   */
  const rise = riseM.toFixed(2);
  const incline = inclineM.toFixed(2);
  const inclineS = (inclineM / ESCALATOR_SPEED_MPS).toFixed(1);
  const derived = derivedS.toFixed(1);
  const pitch = spec.floorHeightM.toFixed(2);
  const lowId = floorIdOf(spec, low);
  const highId = floorIdOf(spec, high);
  const lowAt = heightOf(low);
  const highAt = heightOf(high);
  const where = `${lowId} at ${lowAt} m, ${highId} at ${highAt} m, ${pitch} m floor to floor`;
  /*
   * The stairs branch, taken before a single word of the escalator derivation is assembled. Every
   * local below this point describes a belt on an incline, and none of them is true of a stair, so
   * the early return is what stops an escalator's provenance being printed beside a stair's pair.
   */
  if (typeof mode.traversalTimeS !== 'number') {
    const pair = traversalTimeLabel(mode.traversalTimeS);
    return (
      `Traversal time SET BY HAND and NOT cited: ${pair}, landing to landing. This is a stairs ` +
      `mode, and the EN 115-1 escalator derivation this editor performs for an escalator is ` +
      `deliberately NOT printed beside it: a stair's two times come from a climbing and a ` +
      `descending speed over the rise, not from a belt on a 30 degree incline at 0.5 m/s, so ` +
      `quoting that method here would be a citation for a machine this is not. The pair arrived ` +
      `on the document this spec was read from and no control in this editor authors one, so it ` +
      `is carried through unchanged and the document's own comment — which carried whatever ` +
      `citation it had — does not survive the round trip. See the declaring building in ` +
      `data/buildings/ for it. This spec's own rise between these two landings is ${rise} m ` +
      `(${where}), stated as geometry and NOT as the rise the pair was measured over: the round ` +
      `trip cannot preserve an uneven floor pitch, so the two need not agree and the numbers ` +
      `above are not re-derived from this one.`
    );
  }
  const declared = mode.traversalTimeS.toFixed(1);
  const method =
    'inclination 30 degrees, which BS EN 115-1 makes the only permitted angle above a 6 m rise ' +
    'and which is the common commercial compromise below it; nominal speed 0.5 m/s, the common ' +
    'commercial nominal speed (EN 115-1 permits up to 0.75 m/s at 30 degrees); 2 flat steps at ' +
    'each landing at the standard 0.40 m step depth, so 2 x 2 x 0.40 = 1.60 m of horizontal run ' +
    'adds 3.2 s';
  /*
   * The one clause that does not travel. EN 115-1's two-flat-step allowance is stated for a rise
   * of 6 m or less; above that the arithmetic below is an extrapolation, and saying so is cheaper
   * than a number that quietly stops being a citation.
   */
  const beyond =
    riseM > 6
      ? ' This rise is above 6 m, where the two-flat-step clause does not hold, so the flat run is ' +
        'extrapolated rather than derived.'
      : '';
  const source =
    ' No CIBSE Guide D lumped escalator traversal figure was available to check this against; see ' +
    'docs/02-elevator-reference.md.';
  if (mode.traversalTimeS === derivedS) {
    return (
      `Traversal time DERIVED by the building designer from this building's own geometry, not ` +
      `quoted: rise ${rise} m (${where}); ${method}. Incline length = ${rise} / sin 30 = ` +
      `${incline} m at 0.5 m/s = ${inclineS} s, plus 3.2 s of landing run. Total landing to ` +
      `landing ${derived} s.${beyond}${source}`
    );
  }
  return (
    `Traversal time SET BY HAND and NOT cited: ${declared} s landing to landing, which is not the ` +
    `figure this building's own geometry gives. A rise of ${rise} m (${where}) derives ` +
    `${derived} s by the EN 115-1 method — ${method}. The declared value is the author's and this ` +
    `comment is not a citation for it.${beyond}${source}`
  );
}

/**
 * What to call these machines in a warning — `Escalator`, `Stair`, or `Machine` for a mixed set.
 *
 * A noun, not a cosmetic. Every one of {@link validateSpec}'s transport warnings said *Escalator*
 * unconditionally, and `st-jude-hospital`'s `main-stair` is a stair; a warning that misnames the
 * thing it is about sends a reader looking for a machine the building does not have. The mixed case
 * falls back rather than guessing, because the warning that takes a list is one sentence about
 * several machines and picking either noun would be wrong about some of them.
 */
function machineNoun(modes: readonly SpecTransportMode[]): string {
  const kinds = new Set(modes.map((mode) => mode.kind ?? 'escalator'));
  if (kinds.size !== 1) return 'Machine';
  return kinds.has('stairs') ? 'Stair' : 'Escalator';
}

/** {@link transportModesOf} in the spec's own floor-number vocabulary. */
function writtenTransportModes(spec: BuildingSpec): readonly SpecTransportMode[] {
  const lowest = lowestFloorOf(spec);
  return spec.transportModes.filter(
    (mode) =>
      mode.connects[0] !== mode.connects[1] &&
      mode.connects.every((floor) => floor >= lowest && floor <= spec.floors),
  );
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
  /*
   * Bottom floor first, which for a building with a basement is a negative index — `config/schema.ts`
   * says so in as many words (*"floor index must be an integer (negative for basements)"*), and all
   * three shipped basements are at `-1`. Height follows the same sign, so a basement lands below
   * datum rather than above it.
   */
  for (let floor = lowestFloorOf(spec); floor <= spec.floors; floor += 1) {
    const entrance = isEntranceFloor(spec, floor);
    const config: {
      -readonly [K in keyof FloorConfig]: FloorConfig[K];
    } = {
      id: floorIdOf(spec, floor),
      index: floor,
      heightM: Math.round(floor * spec.floorHeightM * 100) / 100,
      population: entrance ? 0 : populationAt(spec, floor),
    };
    if (entrance) config.isEntrance = true;
    if (!entrance && skies.has(floor)) config.isTransferFloor = true;
    floors.push(config);
  }

  const groups = banksOf(spec);
  const banks: BankConfig[] = groups.map((group, index) => {
    const servesFloors: string[] = [];
    for (let floor = group.band[0]; floor <= group.band[1]; floor += 1) {
      servesFloors.push(floorIdOf(spec, floor));
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
    // Through {@link floorIdOf} like every other crossing, rather than the literal `'G'` this line
    // used to hold. The two agree today and the rule is what matters: one function turns a floor
    // number into an id, so a building that renamed its lobby could not rename it here only.
    const lobbyId = floorIdOf(spec, 0);
    if (group.band[0] > 0 && group.lobby && !servesFloors.includes(lobbyId)) {
      servesFloors.unshift(lobbyId);
    }
    return {
      /*
       * The single-bank case keeps the id every shipped building uses, so a spec that describes
       * one group produces the document a hand-authored one would — and a reader comparing the
       * downloaded JSON with `midtown-office.json` is not distracted by a gratuitous rename.
       */
      id: groups.length === 1 ? 'main' : `bank-${String(index + 1)}`,
      name:
        // `<= 0` rather than `=== 0`: a band that reaches the lobby *or below it* is the main bank.
        // On a building with a basement the default band starts at `-1`, and `=== 0` named it
        // `Floors -1–23`.
        group.band[0] <= 0
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

  /*
   * Written only when there is one, unlike `accessZones` below. `transportModes` is optional on
   * `BuildingConfig` and four of the five shipped buildings carry no such key at all, so emitting
   * `transportModes: []` on every download would put a field in the reader's JSON that says
   * nothing — the same argument that keeps the single-bank id `main` rather than `bank-1`.
   */
  const transportModes = transportModesOf(spec);

  return {
    id: spec.id,
    name: spec.name.trim() === '' ? 'My building' : spec.name.trim(),
    type: spec.type,
    trafficProfile: spec.trafficProfile,
    floors,
    totalPopulation: totalPopulation(spec),
    banks,
    ...(transportModes.length === 0 ? {} : { transportModes }),
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
        : `Floor${stranded.length === 1 ? '' : 's'} ${stranded.map((floor) => floorIdOf(spec, floor)).join(', ')} ${stranded.length === 1 ? 'has' : 'have'} a shaft`;
    problems.push(
      `${named} nobody can board from the lobby — nothing connects ${stranded.length === 1 ? 'it' : 'them'} to the entrance, directly or through a transfer level. The loader builds this without a word; the run then generates no trip to those floors at all, so the mean it reports is over the people it could still carry.`,
    );
  }
  if (orphans.length > 0) {
    problems.push(
      orphans.length > 6
        ? `No shaft serves ${String(orphans.length)} floors — a call there is one nobody may answer, which looks nothing like a slow one.`
        /*
         * Through {@link floorIdOf} like every other crossing. This branch minted its own id —
         * `floor === 0 ? 'G' : String(floor)` — which is neither the id the document carries nor
         * the one the warning two lines above prints for the same floor: it named floor 6 `6`
         * where the building calls it `7`. A second rule for turning a number into an id is the
         * same defect as a second floor vocabulary, at the width of one message.
         */
        : `No shaft serves floor ${orphans.map((floor) => floorIdOf(spec, floor)).join(', ')} — a call there is one nobody may answer, which looks nothing like a slow one.`,
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
    const floors = zoneFloorsOf(spec, zone).map((floor) => floorIdOf(spec, floor));
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
        `a floor this tower does not have — it is ${String(floorCountOf(spec))} floors tall now. Those ` +
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
  /*
   * The transport modes, in the same order the loader would meet them: the two states it refuses,
   * then the state it builds without a word and a reader cannot see.
   */
  const offTower = spec.transportModes.filter((mode) =>
    mode.connects.some((floor) => floor < lowestFloorOf(spec) || floor > spec.floors),
  );
  if (offTower.length > 0) {
    problems.push(
      `${machineNoun(offTower)} ${offTower.map((mode) => mode.id).join(', ')} connect${offTower.length === 1 ? 's' : ''} ` +
        `a floor this tower does not have — it is ${String(floorCountOf(spec))} floors tall now. ` +
        'A connection is a pair of floors, so there is nothing to shorten the way a zone shortens ' +
        'its floor list: the whole machine is left out of the saved document rather than refused, ' +
        'and the run routes as though it had never been there.',
    );
  }
  const selfJoined = spec.transportModes.filter((mode) => mode.connects[0] === mode.connects[1]);
  for (const mode of selfJoined) {
    problems.push(
      `${machineNoun([mode])} ${mode.id} starts and ends on floor ${floorIdOf(spec, mode.connects[0])}. The loader ` +
        'refuses a connection whose two ends name one floor — a machine that starts and ends on ' +
        'the same floor moves nobody — so it is left out of the saved document instead of being ' +
        'written and refused.',
    );
  }
  for (const mode of writtenTransportModes(spec)) {
    /*
     * **Both arms, and the union is why this loop had to move.** `{ upS, downS } > 0` is `NaN > 0`
     * — `false` — so the directional arm fell straight through to the message and printed
     * `[object Object] s` about a stair whose two times are perfectly good. A guard that fires on
     * the shape it cannot read is worse than one that does not fire at all: it sends a reader to
     * fix a number that is not wrong. Every declared time must clear zero, whichever arm it is on.
     */
    const times =
      typeof mode.traversalTimeS === 'number'
        ? [mode.traversalTimeS]
        : [mode.traversalTimeS.upS, mode.traversalTimeS.downS];
    if (times.every((seconds) => seconds > 0)) continue;
    problems.push(
      `${machineNoun([mode])} ${mode.id} takes ${traversalTimeLabel(mode.traversalTimeS)} to ride. The loader refuses a ` +
        'traversal time that is not greater than zero, so this building will not build until it ' +
        'is raised. Unlike a floor this tower no longer has, it is written to the document as it ' +
        'stands, because it is a number on a control the reader can see.',
    );
  }
  /*
   * A stairs mode with no propensity pair. Unreachable through the two doors this module owns —
   * `transportModeSchema` refuses the document, and no control here authors `kind: 'stairs'` — and
   * stated anyway, on {@link withTransportSeconds}'s grounds: `validateSpec` exists for the spec
   * that arrived by a route this file did not author, and a stair nobody would ever climb is the
   * inert-by-construction shape `CLAUDE.md` names eleven times.
   */
  for (const mode of writtenTransportModes(spec)) {
    if ((mode.kind ?? 'escalator') !== 'stairs' || mode.use !== undefined) continue;
    problems.push(
      `Stair ${mode.id} declares no use pair. Stairs are chosen rather than structural — the ` +
        'router never plans a journey over one — so without a propensity for each direction ' +
        'nobody would ever take it, and the loader refuses the building rather than shipping a ' +
        'machine that moves no one.',
    );
  }
  const skies = new Set(spec.skyFloors);
  const deadEnds = writtenTransportModes(spec).filter(
    /*
     * **Stairs are exempt, because the sentence below is about the router and the router never
     * sees one.** `traffic/route.ts#routeTopologyOf` filters `kind: 'stairs'` out of its edge set:
     * a stair is offered to a rider whose journey already begins and ends on its two floors, and a
     * transfer level neither adds to that nor takes from it. Raising *"neither is a transfer
     * level"* against a stair would be a true observation about the floors attached to a false
     * claim about what it costs the building — the stale-mechanism defect, in a warning.
     */
    (mode) =>
      (mode.kind ?? 'escalator') !== 'stairs' &&
      !mode.connects.some((floor) => skies.has(floor)),
  );
  for (const mode of deadEnds) {
    problems.push(
      `Escalator ${mode.id} joins floor ${floorIdOf(spec, mode.connects[0])} and floor ` +
        `${floorIdOf(spec, mode.connects[1])}, and neither is a transfer level. A journey may only ` +
        'change onto a lift at a transfer level, so this machine carries the people who start on ' +
        'one of those two floors and finish on the other, and nobody else — it is not a way ' +
        'through. The loader builds it without a word. Mark one of the two a sky lobby if it was ' +
        'meant to be one.',
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
    if (floorCountOf(spec) > machineClass.maxFloors) {
      problems.push(
        `${String(floorCountOf(spec))} floors is past the ${String(machineClass.maxFloors)}-floor limit for ${machineClass.name.toLowerCase()}.`,
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
    `${String(floorCountOf(spec))} floors · ${riseM(spec).toFixed(1)} m of travel · ` +
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
    // Both halves of the below-lobby vocabulary, so a spec that lost a basement — or renamed the
    // first floor above the lobby — reads as the different building it saves as.
    belowLobby: spec.belowLobby.map((floor) => [floor.id, floor.isEntrance === true]),
    firstFloorNumber: spec.firstFloorNumber,
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
    // The document's own machines, for the same reason: a machine that is never written cannot
    // make a building that saves differently.
    transportModes: transportModesOf(spec),
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
 * Which declared floor the spec calls floor `0`.
 *
 * The lowest entrance **at or above datum**, because that is the one a reader means by *the lobby*:
 * `midtown-office` flags both `G` and its car park `P1`, and calling `P1` the lobby would put the
 * building's ground floor one storey up and leave the tower numbered from a basement.
 *
 * The three fallbacks are for documents this function may be handed directly rather than through
 * `parseBuilding` — the lowest entrance wherever it is, then index `0`, then the bottom floor — so
 * a building with no entrance at all still reads rather than throwing.
 */
function lobbyIndexOf(declared: readonly FloorConfig[]): number {
  const entrances = declared.filter((floor) => floor.isEntrance === true);
  const chosen =
    entrances.find((floor) => floor.index >= 0) ??
    entrances[0] ??
    declared.find((floor) => floor.index === 0) ??
    declared[0];
  return chosen?.index ?? 0;
}

/**
 * The number the document prints on the first floor above the lobby.
 *
 * Read off that floor's own id, which is the only place it is written. Seven of the eight shipped
 * buildings say `2` — there is no floor `1`, the lobby *is* the ground floor — and
 * `st-jude-hospital` says `1`. A non-numeric id (a `floorRanges` pattern like `L{index}`) falls
 * back to the common case and the ids do not survive the round trip; see {@link specFromBuilding}.
 */
function firstFloorNumberOf(above: readonly FloorConfig[]): number {
  const first = above[0];
  if (first === undefined) return 2;
  const declared = Number(first.id);
  return Number.isInteger(declared) && declared > 0 ? declared : 2;
}

/**
 * Read a shipped building back into the editor's shape.
 *
 * Lossy in one direction and honest about it: a shipped building's floors have labels and per-floor
 * traffic profiles and per-floor populations that a `floors × capacity × occupancy` model cannot
 * express. What comes back is the *shape* — how tall, how many people, how many cars, how fast — so
 * a reader can start from Midtown Office and change one thing. The document editor beneath the
 * elevation is where the parts this drops are edited, which is why it is still there (§ 4.5).
 *
 * **Access zoning is no longer one of the parts it drops.** Zone floors are matched by their
 * **position** relative to the lobby — the same convention `skyFloors` below already uses — never
 * by arithmetic on the id, because a floor id is a string and `mixed-use-high-rise` has no floor at
 * index 1 at all. On all eight shipped buildings the ids come back identical, which
 * `authoring.test.ts` and `shippedBuildings.test.ts` assert against the documents rather than
 * asserting the mapping.
 *
 * **Floor ids are no longer one of them either, and that is what {@link BuildingSpec.belowLobby}
 * and {@link BuildingSpec.firstFloorNumber} are for.** Every floor id of every shipped building
 * survives exactly. What still does not survive is a building whose floor numbers are **not a
 * contiguous run** above the lobby — a tower with no thirteenth floor comes back with every floor
 * above the gap renumbered down one — because the spec holds a count of floors and the number the
 * first of them carries, and a gap is neither. No shipped building has one; a test pins the
 * behaviour on a synthetic one so this paragraph is a measurement rather than a claim.
 *
 * `index` is the other thing that moves, and it always did: the spec numbers floors by position, so
 * a rebuilt `midtown-office` writes floor `2` at index 1 where the document wrote it at index 2.
 * The id is what every other part of a document names a floor by — `servesFloors`, `accessZones`,
 * `transportModes.connects` — and it is what is held exact.
 */
export function specFromBuilding(config: BuildingConfig, id: string): BuildingSpec {
  const declared = declaredFloorsOf(config);
  const lobbyIndex = lobbyIndexOf(declared);
  /*
   * Three groups by position rather than by flag, which is the change that closed the basement
   * defect. This used to split on `isEntrance`, which put a basement in the first slot *above* the
   * lobby and moved every floor in the building up one — `crown-hotel`'s `back-of-house` zone came
   * back naming a guest bedroom floor. A floor below the lobby is below it whether or not it is
   * also a way in.
   */
  const below = declared.filter((floor) => floor.index < lobbyIndex).reverse();
  const floors = declared.filter((floor) => floor.index > lobbyIndex);
  /*
   * Floor id to the spec's own floor number. Position `i` above the lobby is spec floor `i + 1`;
   * position `i` below it is spec floor `-(i + 1)`; the lobby is 0. That is exactly what
   * {@link buildingFromSpec} writes back.
   */
  const floorNumberById = new Map<string, number>();
  below.forEach((floor, index) => {
    floorNumberById.set(floor.id, -(index + 1));
  });
  for (const floor of declared) if (floor.index === lobbyIndex) floorNumberById.set(floor.id, 0);
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
    /*
     * The ids, and the entrance flag beside each — the two things a floor number cannot carry.
     * Nearest the lobby first, so element `i` is spec floor `-(i + 1)`.
     */
    belowLobby: below.map((floor) => ({
      id: floor.id,
      ...(floor.isEntrance === true ? { isEntrance: true } : {}),
    })),
    firstFloorNumber: firstFloorNumberOf(floors),
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
    /*
     * The machines, by the same floor-id-to-number map and for the same reason access zoning is
     * carried: leaving them out was **destructive**. Before this line `specFromBuilding` never
     * looked at `transportModes`, so opening Vertical City here and saving it untouched produced a
     * building with none of its four escalators — a tower whose two-level lobbies had lost their
     * escalators and charged every lobby-level crossing back to a lift, with nothing on any
     * surface saying so.
     *
     * **The claim is exactly five fields, and it is narrower than "lossless".** `id`, `connects`,
     * `traversalTimeS`, `kind` and `use` survive; `name` and `$comment` do not, and both losses are
     * deliberate rather than overlooked:
     *
     * - `name` is a label naming floors — *"Ground lobby escalator pair (G <-> 2)"* — and there is
     *   no control here to edit one. Carrying it would mean a reader who moved a landing kept a
     *   name that now says the wrong floors, with no way to fix it.
     * - `$comment` carries the traversal time's citation, and a citation is only worth having
     *   while it is true of the building it sits in. `specFromBuilding` cannot preserve an uneven
     *   floor pitch, so `vertical-city`'s *"rise 4.5 m"* is false of the spec the moment it is
     *   read back. {@link transportModesOf} writes a fresh one derived from the spec's own
     *   geometry instead, and labels the value uncited when it is not the figure that geometry
     *   gives — which is what `vertical-city`'s four machines come back as.
     *
     * **It was three, and the two that joined them are not an enhancement — they are the other half
     * of issue #108.** `kind` and `use` are the fields that make a `{ upS, downS }` traversal time
     * *legal*: drop them and `st-jude-hospital`'s stair comes back out as a directional time on an
     * escalator, which `transportModeSchema` refuses in as many words. Carrying the pair and
     * dropping the kind would have turned a crash into a document that will not open, which is the
     * same defect with a longer fuse.
     *
     * `authoring.test.ts` asserts the surviving key set exactly, so a field that starts or stops
     * surviving turns that test red and this paragraph has to be rewritten with it.
     *
     * A machine either of whose ends the expansion does not know is dropped whole rather than
     * half-read. It cannot occur on a document `parseBuilding` accepted — `config/parse.ts`
     * cross-references both ends — and dropping it is still the right answer for a document this
     * function was handed directly.
     */
    transportModes: (config.transportModes ?? [])
      .map((mode) => ({
        id: mode.id,
        connects: mode.connects.map((floorId) => floorNumberById.get(floorId)),
        traversalTimeS: mode.traversalTimeS,
        ...(mode.kind === undefined ? {} : { kind: mode.kind }),
        ...(mode.use === undefined ? {} : { use: mode.use }),
      }))
      .filter(
        (
          mode,
        ): mode is {
          id: string;
          connects: [number, number];
          traversalTimeS: number | DirectionalTraversalTime;
          kind?: TransportModeKind;
          use?: StairsUseConfig;
        } => mode.connects.every((floor) => floor !== undefined),
      ),
  };
}
