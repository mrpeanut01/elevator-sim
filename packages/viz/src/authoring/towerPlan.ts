/**
 * **The tower plan** — the drawing board's model, where a shaft is a thing with its own height.
 *
 * ## Why this is not `BuildingSpec`
 *
 * `buildingSpec.ts` describes a building as *N floors of C people, M cars in contiguous bands*. That
 * is the Engineer editor's model and it stays the Engineer editor's. It cannot say four things the
 * engine has run for a long time, and each of them is a thing a player draws:
 *
 * - **a shaft that stops short of the roof.** A band is what a car *calls at*; nothing in a spec says
 *   how tall the hoistway is, so a podium, a mall or a tapering core has no shape;
 * - **a stop list with a gap in it.** `vertical-city`'s shuttle serves `G, 2, 26, 27, 51, 52, 76, 77`
 *   and a band cannot hold that — `SpecCarry` exists to carry it past the sliders untouched;
 * - **two decks**, which `BankConfig.servesFloorPairs` and `CarConfig.doubleDeck` have simulated
 *   since § D131;
 * - **two cars in one hoistway**, which `BankConfig.shafts` has simulated since GitHub issue #412
 *   (`docs/11-twin-shaft-contract.md`).
 *
 * So a {@link TowerPlan} holds a list of {@link PlanShaft}s. Each has a bottom and a top, a service
 * pattern, a machine, a deck count and a car count, and {@link buildingFromPlan} writes the
 * `BuildingConfig` those describe. Nothing here is a second simulator or a second loader: the
 * document goes through `parseBuilding` and `resolveBuilding` like any file in `data/buildings/`,
 * and what they refuse is refused.
 *
 * ## The massing rule
 *
 * {@link layoutOf} turns shaft heights into a silhouette, and the rule is the product owner's:
 * **a shaft that reaches the top level is the central structure; shafts that stop lower define a
 * shorter structure, and those alternate on each side of it.** Shafts sharing a top share a
 * structure, tallest nearest the core. A floor's default population follows the plate —
 * {@link autoPopulationAt} is *people per shaft bay × the bays that floor is wide* — so a wide
 * podium floor holds more people than a floor of the bare tower above it, by construction.
 *
 * ## The three zonings stay apart
 *
 * A shaft's stops are **service** zoning and only that. Credential zoning is carried on
 * {@link TowerPlan.accessZones} exactly as `buildingSpec.ts` carries it, and no control on the
 * drawing board writes it. Operational zoning is the dispatcher's and is not here at all.
 *
 * ## What this module does not author
 *
 * It produces **no sentence a player reads** except the names it gives banks, which are document
 * fields. Every warning is returned as a fact — a list of floors, a list of shafts — and
 * `everyday/designerModel.ts` says it. That split is `everyday/`'s own, one directory down.
 *
 * No decision entry is owed for this module ([§ D405](../../../../DECISIONS.md)): it binds nothing
 * outside the drawing board and moves nothing already recorded, so this docstring is the record.
 */

import {
  ConfigError,
  RoutePlanner,
  TRAFFIC_DEFAULTS,
  WARNING_CODES,
  parseBuilding,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import type {
  CallType,
  BankConfig,
  BuildingConfig,
  BuildingType,
  CarConfig,
  ElevatorSpecs,
  FloorConfig,
  ResolvedBuilding,
} from '@elevator-sim/core/browser';

import {
  BLANK_SPEC,
  accessZonesOf,
  escalatorSecondsFor,
  nextZoneId,
  floorIdOf,
  machineAt,
  nextTransportModeId,
  specFromBuilding,
  transferSecondsFor,
  transportModesOf,
  withTransportSeconds,
  withTransportCapacity,
  upPeakBanksOf,
  type BuildingSpec,
  type SpecAccessZone,
  type SpecBankAnalysis,
  type SpecBelowLobbyFloor,
  type SpecMachine,
  type SpecTransportMode,
} from './buildingSpec.js';

/** What a car is for. `core`'s own closed list, read off the car record so a rename fails here. */
export type PlanDuty = NonNullable<CarConfig['duty']>;

/** `core`'s four duties, in the order a picker offers them. */
export const PLAN_DUTIES = ['passenger', 'goods', 'bed', 'service'] as const satisfies readonly PlanDuty[];

/**
 * How a shaft's doors are dealt over its own height.
 *
 * - `local` — every floor from the bottom of the hoistway to the top.
 * - `express` — boards at the bottom landing, runs non-stop, then every floor of its zone.
 * - `shuttle` — the two ends, and any sky lobby between them. Nothing else.
 * - `custom` — a hand-picked stop list.
 */
export type PlanServiceKind = 'local' | 'express' | 'shuttle' | 'custom';

export const PLAN_SERVICE_KINDS: readonly PlanServiceKind[] = Object.freeze([
  'local',
  'express',
  'shuttle',
  'custom',
]);

/** One hoistway, and what hangs in it. */
export interface PlanShaft {
  /** Stable identity, so a selection survives a shaft being added beside it. Never shown. */
  readonly key: string;
  /** The lowest floor the hoistway reaches. `0` is the lobby; negative is below it. */
  readonly bottom: number;
  /** The highest floor the hoistway reaches. This is what the massing rule reads. */
  readonly top: number;
  readonly service: PlanServiceKind;
  /** The first floor of an express zone. Kept valid on every shaft so a kind change needs no guess. */
  readonly zoneLow: number;
  /** A custom stop list, as floor numbers. Read only when {@link service} is `custom`. */
  readonly stops: readonly number[];
  readonly machine: SpecMachine;
  /** Two decks one floor apart that open together — `CarConfig.doubleDeck`. */
  readonly decks: 1 | 2;
  /** Two cars in this one hoistway, lower and upper — `BankConfig.shafts`, `docs/11`. */
  readonly cars: 1 | 2;
  readonly duty: PlanDuty;
  /** A cabin that holds pressure, so the air-pressure descent cap does not bind it. */
  readonly pressurised: boolean;
  /**
   * A top speed downwards lower than the rated speed. No control here writes one; it is carried so
   * that opening `ctf-class-reference` and saving it does not make its shuttle symmetric.
   */
  readonly descentSpeedMps?: number | undefined;
  /**
   * **Which block of its height the shaft stands in**, for shafts that stop below the roof.
   *
   * Absent or `0` is the first block. Shafts that share a top *and* a block number are one wing
   * and one group; a different number is a wing of its own on the far side, with its own calls —
   * the two arms of a mall. It is part of {@link groupsOf}'s key, so two blocks whose doors open
   * on the same floors are written as two banks and read back as two blocks. On a shaft that
   * reaches the roof it changes the grouping and not the drawing: the core is one structure.
   */
  readonly wing?: number | undefined;
}

/** The drawing board's whole state. */
export interface TowerPlan {
  readonly id: string;
  readonly name: string;
  readonly type: BuildingType;
  readonly trafficProfile: string;
  /** Floors above the lobby. The lobby is floor 0 and is not counted. */
  readonly floors: number;
  /** Floors below the lobby, nearest first — `buildingSpec.ts`'s own vocabulary. */
  readonly belowLobby: readonly SpecBelowLobbyFloor[];
  readonly firstFloorNumber: number;
  readonly floorHeightM: number;
  /** Design capacity of one shaft bay of floor plate, in people. */
  readonly peoplePerBay: number;
  /** Building-wide let share, percent. */
  readonly occupancyPct: number;
  /** People on a floor where a reader set the number by hand. Absent means {@link autoPopulationAt}. */
  readonly populationByFloor: Readonly<Record<number, number>>;
  /** A floor's own crowd, as a traffic-profile id. Absent means the building's. */
  readonly useByFloor: Readonly<Record<number, string>>;
  /**
   * What the call fixture on a landing is, where it is not the dispatcher's own — `core`'s
   * `FloorConfig.landingCallType`. A floor with no entry writes nothing, which is every floor of
   * every shipped building. It decides what a call registered there discloses and restricts no
   * car and no rider.
   */
  readonly panelByFloor: Readonly<Record<number, CallType>>;
  /** Floors above the lobby where a journey may change lifts. */
  readonly skyLobbies: readonly number[];
  readonly shafts: readonly PlanShaft[];
  /** Escalators and stairs, in `buildingSpec.ts`'s own type so its citation writer is reused. */
  readonly transportModes: readonly SpecTransportMode[];
  /** Credential zoning, carried. No control on the drawing board writes it. */
  readonly accessZones: readonly SpecAccessZone[];
  /** Every bank fits a regenerative drive — `BankConfig.regenerativeDrive`. */
  readonly regenerativeDrive: boolean;
  /** Every bank is roped in this class — `BankConfig.ropeClass`. Absent means the rope is not modelled. */
  readonly ropeClass?: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * Floors
 * -------------------------------------------------------------------------- */

/** The bottom of the building as a floor number. `0 - n`, never `-n`: see `lowestFloorOf`. */
export function planLowestFloor(plan: TowerPlan): number {
  return 0 - plan.belowLobby.length;
}

/**
 * The plan's floor vocabulary as a `BuildingSpec`, for the helpers that are written over one.
 *
 * `buildingSpec.ts` owns the one translation from a floor number to a floor id, the access-zone
 * writer and the escalator citation. Calling them is the alternative to a second copy of each, and
 * a second copy of the citation writer is the stale-provenance defect `CLAUDE.md` opens on. Only
 * the fields those helpers read are meaningful on the result; it is never saved or drawn.
 */
export function planFrame(plan: TowerPlan): BuildingSpec {
  return {
    ...BLANK_SPEC,
    id: plan.id,
    name: plan.name,
    type: plan.type,
    trafficProfile: plan.trafficProfile,
    floors: plan.floors,
    belowLobby: plan.belowLobby,
    firstFloorNumber: plan.firstFloorNumber,
    floorHeightM: plan.floorHeightM,
    skyFloors: plan.skyLobbies,
    accessZones: plan.accessZones,
    transportModes: plan.transportModes,
  };
}

/** A floor number as this building's floor id. `buildingSpec.ts#floorIdOf`, through the frame. */
export function planFloorId(plan: TowerPlan, floor: number): string {
  return floorIdOf(planFrame(plan), floor);
}

/** Whether this floor is a way in from the street: the lobby, or a basement the document said was. */
export function planIsEntrance(plan: TowerPlan, floor: number): boolean {
  if (floor === 0) return true;
  if (floor > 0) return false;
  return plan.belowLobby[-floor - 1]?.isEntrance === true;
}

/** Total travel of the building, bottom floor to top, in metres. */
export function planRiseM(plan: TowerPlan): number {
  return (plan.floors - planLowestFloor(plan)) * plan.floorHeightM;
}

/** One shaft's own travel, in metres — what a machine class's rise limit is a claim about. */
export function shaftRiseM(plan: TowerPlan, shaft: PlanShaft): number {
  return (shaft.top - shaft.bottom) * plan.floorHeightM;
}

/* -------------------------------------------------------------------------- *
 * The massing rule
 * -------------------------------------------------------------------------- */

/** One block of the silhouette: the core, or a shorter wing beside it. */
export interface TowerStructure {
  readonly side: 'core' | 'left' | 'right';
  /** The highest floor this block stands to. */
  readonly top: number;
  /** The shafts in it, left to right. */
  readonly shaftKeys: readonly string[];
  /** Its left edge, in bay units from the left edge of the whole building. */
  readonly x: number;
  /** Its width in bay units: one per shaft and half a bay of floor plate at each side. */
  readonly width: number;
}

export interface TowerLayout {
  readonly structures: readonly TowerStructure[];
  /** The whole building's width in bay units. */
  readonly width: number;
  /** Each shaft's left edge, in bay units. */
  readonly columnByShaft: Readonly<Record<string, number>>;
}

/** The fewest bays a structure is drawn with, so an empty core is still a tower. */
const MIN_STRUCTURE_SHAFT_BAYS = 2;

/**
 * **The silhouette, from the shaft heights** — the product owner's massing rule.
 *
 * The shafts that reach highest are the core, and the core stands to the building's full height
 * whether or not they do: a floor above every shaft is still a floor, and
 * {@link orphanFloorsOf} is what says nobody can reach it. Every other shaft joins a wing with the
 * shafts that share its top and its block number ({@link PlanShaft.wing}), so two blocks of one
 * height stand on opposite sides rather than as one. Wings are placed tallest first and **alternate sides**, left then
 * right, each one outboard of the last on its side — so the tallest wings sit against the core and
 * the building steps down outward, which is the shape a podium and a mall both are.
 */
export function layoutOf(plan: TowerPlan): TowerLayout {
  const tallest = plan.shafts.reduce((best, shaft) => Math.max(best, shaft.top), Number.NEGATIVE_INFINITY);
  const core = plan.shafts.filter((shaft) => shaft.top === tallest);
  /* A wing is a top and a block number: tallest first, and at one height the lower number first. */
  const wingKeys = new Map<string, { top: number; wing: number; keys: string[] }>();
  for (const shaft of plan.shafts) {
    if (shaft.top === tallest) continue;
    const wing = shaft.wing ?? 0;
    const key = [shaft.top, wing].map(String).join('|');
    const found = wingKeys.get(key);
    if (found === undefined) wingKeys.set(key, { top: shaft.top, wing, keys: [shaft.key] });
    else found.keys.push(shaft.key);
  }
  const wings = [...wingKeys.values()].sort((a, b) => b.top - a.top || a.wing - b.wing);
  const left: { top: number; keys: string[] }[] = [];
  const right: { top: number; keys: string[] }[] = [];
  wings.forEach((wing, index) => {
    (index % 2 === 0 ? left : right).push({ top: wing.top, keys: wing.keys });
  });
  const widthOf = (count: number): number => Math.max(MIN_STRUCTURE_SHAFT_BAYS, count) + 1;

  const structures: TowerStructure[] = [];
  const columnByShaft: Record<string, number> = {};
  let x = 0;
  const place = (side: TowerStructure['side'], top: number, keys: readonly string[]): void => {
    const width = widthOf(keys.length);
    const inset = (width - keys.length) / 2;
    keys.forEach((key, index) => {
      columnByShaft[key] = x + inset + index;
    });
    structures.push({ side, top, shaftKeys: keys, x, width });
    x += width;
  };
  // Outermost first on the left, so the tallest left wing ends up against the core.
  for (const wing of [...left].reverse()) place('left', wing.top, wing.keys);
  place('core', plan.floors, core.map((shaft) => shaft.key));
  for (const wing of right) place('right', wing.top, wing.keys);
  return { structures, width: x, columnByShaft };
}

/**
 * How many shaft bays wide the building is at one floor.
 *
 * Counted over the structures that stand that high, not over the shafts that pass through: a wing
 * whose only shaft starts on its third floor still has two floors of plate under it. Below the
 * lobby the whole footprint is dug, so every structure counts. Never zero — a floor of a tower
 * with no shaft drawn yet is one bay wide rather than a floor nobody could stand on.
 */
export function baysAt(plan: TowerPlan, layout: TowerLayout, floor: number): number {
  let bays = 0;
  for (const structure of layout.structures) {
    if (floor <= structure.top) bays += structure.shaftKeys.length;
  }
  void plan;
  return Math.max(1, bays);
}

/* -------------------------------------------------------------------------- *
 * People
 * -------------------------------------------------------------------------- */

/**
 * The people a floor holds when nobody has set the number: its width times the density, let.
 *
 * Three floors hold nobody by default and each for a reason a reader can check. An **entrance** has
 * no resident population — `buildingSpec.ts` writes the same zero. A floor **below the lobby** is
 * plant or parking until somebody says otherwise. And a **sky lobby** is a lobby: `vertical-city`
 * declares all eight of its lobby levels at zero. Each can be overridden by hand.
 */
export function autoPopulationAt(plan: TowerPlan, layout: TowerLayout, floor: number): number {
  if (floor <= 0) return 0;
  if (plan.skyLobbies.includes(floor)) return 0;
  return Math.max(0, Math.round(plan.peoplePerBay * baysAt(plan, layout, floor) * (plan.occupancyPct / 100)));
}

/** People on one floor: the hand-set number, or the plate's. An entrance holds nobody. */
export function planPopulationAt(plan: TowerPlan, layout: TowerLayout, floor: number): number {
  if (planIsEntrance(plan, floor)) return 0;
  const set = plan.populationByFloor[floor];
  return set === undefined ? autoPopulationAt(plan, layout, floor) : Math.max(0, Math.round(set));
}

export function planTotalPopulation(plan: TowerPlan): number {
  const layout = layoutOf(plan);
  let total = 0;
  for (let floor = planLowestFloor(plan); floor <= plan.floors; floor += 1) {
    total += planPopulationAt(plan, layout, floor);
  }
  return total;
}

/* -------------------------------------------------------------------------- *
 * Service — which floors a shaft's doors open at
 * -------------------------------------------------------------------------- */

/** A shaft clamped into the building it is in, with its express zone and stop list kept legal. */
export function fittedShaft(plan: TowerPlan, shaft: PlanShaft): PlanShaft {
  const lowest = planLowestFloor(plan);
  const top = Math.max(lowest + 1, Math.min(plan.floors, Math.round(shaft.top)));
  const bottom = Math.max(lowest, Math.min(top - 1, Math.round(shaft.bottom)));
  const zoneLow = Math.max(bottom + 1, Math.min(top, Math.round(shaft.zoneLow)));
  const stops = [...new Set(shaft.stops.map((floor) => Math.round(floor)))]
    .filter((floor) => floor >= bottom && floor <= top)
    .sort((a, b) => a - b);
  return { ...shaft, bottom, top, zoneLow, stops };
}

/**
 * **The floors one shaft's doors open at**, ascending.
 *
 * A double-deck car opens two floors at once, so every landing a pattern names by one floor is
 * widened to the pair: the floor and the one above it, or the one below at the very top of the
 * hoistway. That is what makes a double-deck shuttle of `G ↔ 30` serve `G, 1, 29, 30` — the shape
 * `vertical-city` ships — rather than a stop list the loader cannot pair.
 */
export function stopsOf(plan: TowerPlan, shaft: PlanShaft): readonly number[] {
  const { bottom, top } = shaft;
  const stops = new Set<number>();
  const decked = shaft.decks === 2;
  const land = (floor: number): void => {
    if (stops.has(floor)) return;
    stops.add(floor);
    if (!decked) return;
    stops.add(floor + 1 <= top ? floor + 1 : floor - 1);
  };
  if (shaft.service === 'local') {
    for (let floor = bottom; floor <= top; floor += 1) stops.add(floor);
  } else if (shaft.service === 'express') {
    const zoneLow = Math.max(bottom + 1, Math.min(top, shaft.zoneLow));
    for (let floor = zoneLow; floor <= top; floor += 1) stops.add(floor);
    land(bottom);
  } else if (shaft.service === 'shuttle') {
    land(bottom);
    for (const lobby of [...plan.skyLobbies].sort((a, b) => a - b)) {
      if (lobby > bottom && lobby < top) land(lobby);
    }
    land(top);
  } else {
    for (const floor of shaft.stops) if (floor >= bottom && floor <= top) stops.add(floor);
  }
  return [...stops].filter((floor) => floor >= bottom && floor <= top).sort((a, b) => a - b);
}

/** A double-deck stop list, paired, and the stops that found no partner. */
export interface DeckPairing {
  readonly pairs: readonly (readonly [number, number])[];
  readonly unpaired: readonly number[];
}

/**
 * Pair a stop list for a double-deck car: adjacent floors, lower deck first, taken greedily upward.
 *
 * A stop with no neighbour is a floor only one deck could open at, and the loader pairs every floor
 * a double-deck bank serves — so it is returned rather than dropped in silence, and the drawing
 * board says which floor it is.
 */
export function deckPairingOf(stops: readonly number[]): DeckPairing {
  const pairs: (readonly [number, number])[] = [];
  const unpaired: number[] = [];
  for (let index = 0; index < stops.length; index += 1) {
    const floor = stops[index] as number;
    if (stops[index + 1] === floor + 1) {
      pairs.push([floor, floor + 1]);
      index += 1;
    } else {
      unpaired.push(floor);
    }
  }
  return { pairs, unpaired };
}

/** The floors a shaft is actually written with: its stops, less any a double deck cannot pair. */
export function writtenStopsOf(plan: TowerPlan, shaft: PlanShaft): readonly number[] {
  const stops = stopsOf(plan, shaft);
  if (shaft.decks !== 2) return stops;
  return deckPairingOf(stops).pairs.flat();
}

/** `A` to `Z`, then `AA` onward — a shaft's name on every surface, from its place in the plan. */
export function shaftLabelOf(index: number): string {
  let label = '';
  let rest = index;
  do {
    label = String.fromCharCode(65 + (rest % 26)) + label;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return label;
}

/* -------------------------------------------------------------------------- *
 * Groups — shafts that open onto the same floors answer one set of buttons
 * -------------------------------------------------------------------------- */

/** One group of shafts: a bank, in the document's vocabulary. */
export interface PlanGroup {
  /** Indexes into {@link TowerPlan.shafts}, ascending. */
  readonly shafts: readonly number[];
  readonly stops: readonly number[];
  readonly decks: 1 | 2;
  /** The pattern every shaft of the group shares, or `custom` where they differ in kind only. */
  readonly service: PlanServiceKind;
}

/**
 * Shafts grouped by the floors they open onto, by their deck count and by their block.
 *
 * *The set of cars that open onto the same floors* is what `BankConfig` means, so that is the key.
 * The deck count is part of it because a bank has one `servesFloorPairs`: a single-deck car in a
 * paired bank would be a car the loader runs as if it had two decks. The block number
 * ({@link PlanShaft.wing}) is part of it because two wings are two lobbies' worth of call buttons:
 * a rider at one arm of a mall is not answered by a car in the other.
 *
 * Ordered by lowest stop, then highest, then the key itself — invariant 4's rule applied to
 * authoring, so two plans that describe one building write one document.
 */
export function groupsOf(plan: TowerPlan): readonly PlanGroup[] {
  const byKey = new Map<string, { shafts: number[]; stops: readonly number[]; decks: 1 | 2; kinds: Set<PlanServiceKind> }>();
  plan.shafts.forEach((shaft, index) => {
    const stops = writtenStopsOf(plan, shaft);
    /* Joined rather than interpolated: this is a map key, and nothing here is a sentence. */
    const key = [shaft.wing ?? 0, shaft.decks, ...stops].map(String).join('|');
    const found = byKey.get(key);
    if (found === undefined) {
      byKey.set(key, { shafts: [index], stops, decks: shaft.decks, kinds: new Set([shaft.service]) });
    } else {
      found.shafts.push(index);
      found.kinds.add(shaft.service);
    }
  });
  return [...byKey.entries()]
    .sort(([leftKey, left], [rightKey, right]) => {
      const low = (left.stops[0] ?? 0) - (right.stops[0] ?? 0);
      if (low !== 0) return low;
      const high = (left.stops.at(-1) ?? 0) - (right.stops.at(-1) ?? 0);
      if (high !== 0) return high;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .map(([, group]) => ({
      shafts: group.shafts,
      stops: group.stops,
      decks: group.decks,
      service: group.kinds.size === 1 ? ([...group.kinds][0] as PlanServiceKind) : 'custom',
    }));
}

/** Which group each shaft is in, by shaft index. */
export function groupIndexByShaft(plan: TowerPlan): readonly number[] {
  const byShaft: number[] = plan.shafts.map(() => 0);
  groupsOf(plan).forEach((group, index) => {
    for (const shaft of group.shafts) byShaft[shaft] = index;
  });
  return byShaft;
}

/* -------------------------------------------------------------------------- *
 * What is wrong with a drawing — facts, not sentences
 * -------------------------------------------------------------------------- */

/** Floors no shaft opens at. A call there is a call nobody may answer. */
export function orphanFloorsOf(plan: TowerPlan): readonly number[] {
  const served = new Set<number>();
  for (const shaft of plan.shafts) for (const floor of writtenStopsOf(plan, shaft)) served.add(floor);
  /* An escalator serves its two landings: a mezzanine reached only by one is not an orphan. */
  for (const mode of plan.transportModes) for (const floor of mode.connects) served.add(floor);
  const orphans: number[] = [];
  for (let floor = planLowestFloor(plan); floor <= plan.floors; floor += 1) {
    if (!served.has(floor)) orphans.push(floor);
  }
  return orphans;
}

/** Whether the lobby is somewhere a journey can change lifts: two or more groups open there. */
export function lobbyIsInterchange(plan: TowerPlan): boolean {
  return groupsOf(plan).filter((group) => group.stops.includes(0)).length > 1;
}

/**
 * Floors a shaft serves that nobody can reach from a way in.
 *
 * `traffic/route.ts`'s model narrowed to what a plan can express, on
 * `buildingSpec.ts#unreachableFloors`' own shape: a group's stops are an edge, an escalator is an
 * edge, and a journey changes lifts only at an entrance or on a transfer floor. `towerPlan.test.ts`
 * holds the answer to the loader's own connectivity verdict on every template, so this cannot
 * drift into a mirror that stopped mirroring.
 */
export function strandedFloorsOf(plan: TowerPlan): readonly number[] {
  const transfers = new Set(plan.skyLobbies);
  const served = groupsOf(plan).map((group) => group.stops);
  const lowest = planLowestFloor(plan);
  const roots: number[] = [];
  for (let floor = lowest; floor <= plan.floors; floor += 1) {
    if (planIsEntrance(plan, floor)) roots.push(floor);
  }
  const seen = new Set<number>(roots);
  let frontier = [...roots];
  while (frontier.length > 0) {
    const next: number[] = [];
    const reach = (floor: number): void => {
      if (seen.has(floor)) return;
      seen.add(floor);
      if (transfers.has(floor)) next.push(floor);
    };
    for (const at of frontier) {
      for (const mode of plan.transportModes) {
        if (mode.connects[0] === at) reach(mode.connects[1]);
        if (mode.connects[1] === at) reach(mode.connects[0]);
      }
      for (const stops of served) {
        if (!stops.includes(at)) continue;
        for (const floor of stops) reach(floor);
      }
    }
    frontier = next;
  }
  const orphans = new Set(orphanFloorsOf(plan));
  const stranded: number[] = [];
  for (let floor = lowest; floor <= plan.floors; floor += 1) {
    if (!seen.has(floor) && !orphans.has(floor)) stranded.push(floor);
  }
  return stranded;
}

/**
 * The floor that would join a stranded floor to the rest of the building if it were a sky lobby:
 * the lowest floor a reachable group and the stranded floor's own group both open at.
 */
export function rescueLobbyFor(plan: TowerPlan, stranded: number): number | undefined {
  const unreachable = new Set(strandedFloorsOf(plan));
  const groups = groupsOf(plan);
  const carrying = groups.filter((group) => group.stops.includes(stranded));
  for (const group of carrying) {
    for (const floor of group.stops) {
      if (floor <= 0 || unreachable.has(floor) || plan.skyLobbies.includes(floor)) continue;
      return floor;
    }
  }
  return undefined;
}

/** Shafts whose double deck leaves a stop with no partner floor, and which floors. */
export function unpairedDeckStopsOf(plan: TowerPlan): readonly { readonly shaft: number; readonly floors: readonly number[] }[] {
  const found: { shaft: number; floors: readonly number[] }[] = [];
  plan.shafts.forEach((shaft, index) => {
    if (shaft.decks !== 2) return;
    const { unpaired } = deckPairingOf(stopsOf(plan, shaft));
    if (unpaired.length > 0) found.push({ shaft: index, floors: unpaired });
  });
  return found;
}

/**
 * Groups in which **every** hoistway holds two cars.
 *
 * `sim/twinShaft.test.ts` states the arithmetic: a lower car can never reach the top landing, since
 * its mate would have to be above the roof to let it, and an upper car can never reach the bottom.
 * So a group made only of pairs cannot carry anybody its full height, and a run on one is a run on
 * a building some of whose journeys no car may take. One ordinary shaft in the group is the fix.
 */
export function pairedOnlyGroupsOf(plan: TowerPlan): readonly PlanGroup[] {
  return groupsOf(plan).filter((group) =>
    group.shafts.every((index) => (plan.shafts[index] as PlanShaft).cars === 2),
  );
}

/* -------------------------------------------------------------------------- *
 * The document
 * -------------------------------------------------------------------------- */

/** How a group is named in the document — a bank's `name`, which the stage draws. */
function groupNameOf(plan: TowerPlan, group: PlanGroup): string {
  const low = group.stops[0] ?? 0;
  const high = group.stops.at(-1) ?? 0;
  const lowId = planFloorId(plan, low);
  const highId = planFloorId(plan, high);
  const decks = group.decks === 2 ? 'Double-deck ' : '';
  if (group.service === 'shuttle') return `${decks}shuttle ${lowId} to ${highId}`.replace(/^s/, 'S');
  if (group.service === 'express') return `${decks}express ${lowId} to ${highId}`.replace(/^e/, 'E');
  if (group.service === 'local') return `${decks}local ${lowId} to ${highId}`.replace(/^l/, 'L');
  return `${decks}floors ${lowId} to ${highId}`.replace(/^f/, 'F');
}

/**
 * **Where a two-car shaft is divided**: the middle stop of its group, or nothing for a group too
 * short to divide.
 *
 * `docs/11` § 3.2's regime R1. The lower car answers the floors at or below this one and the upper
 * car the floors one required gap above it, so neither boards a rider bound past its mate — the
 * defect a pair has without a boundary, where `sim/twinShaftSector.test.ts` shows riders left in
 * the cars. The board writes a clearance of one floor pitch and no buffer, so the gap is one floor
 * and any stop above the boundary gives the upper car a floor; `(n − 1) / 2` rounded down is below
 * the top stop for every group of two stops or more, which is what the loader requires.
 *
 * The middle is **chosen, not tuned**: no run here compares one boundary with another. And the
 * upper half holds no entrance in a group that starts at the lobby, so the upper car carries only
 * trips inside its own half — a property of R1, stated on the board by `designerModel.ts`.
 */
export function sectorBoundaryOf(group: PlanGroup): number | undefined {
  if (group.stops.length < 2) return undefined;
  return group.stops[Math.floor((group.stops.length - 1) / 2)];
}

/** The cars one shaft writes: one, or a lower and an upper. */
function carIdsOf(index: number, shaft: PlanShaft): readonly string[] {
  const label = shaftLabelOf(index);
  return shaft.cars === 2 ? [`${label}1`, `${label}2`] : [label];
}

/**
 * **Turn the plan into a document the loader will parse and resolve.**
 *
 * Every field written here is one a control on the drawing board set, with three exceptions that
 * are arithmetic a reader cannot be expected to do, each stated where it is written:
 *
 * - a **double-deck** car's `deckSeparationM` is the floor pitch and its `ratedLoadLbPerDeck` is
 *   half the car's rating, because the loader refuses a pair that is not one separation apart and
 *   warns on a whole that is not twice its half;
 * - a **two-car shaft**'s `standingClearanceM` is one floor pitch and its
 *   `emergencyDecelerationMps2` is twice the class's comfort deceleration. Both are **chosen, not
 *   cited** — `docs/11` § 10 records that no source consulted publishes a separation in metres —
 *   and they are `sim/twinShaft.test.ts`'s own fixture values, written with a `$comment` that says so.
 *   Its `sectorBoundaryFloorId` is the group's middle stop ({@link sectorBoundaryOf});
 * - the **lobby** is flagged a transfer floor when more than one group opens there, because two
 *   banks sharing a lobby is somewhere people change lifts whether or not anybody drew a dot on it.
 */
export function buildingFromPlan(plan: TowerPlan, specs: ElevatorSpecs): BuildingConfig {
  const frame = planFrame(plan);
  const layout = layoutOf(plan);
  const groups = groupsOf(plan);
  const skies = new Set(plan.skyLobbies);
  const lobbyTransfers = lobbyIsInterchange(plan);

  const floors: FloorConfig[] = [];
  for (let floor = planLowestFloor(plan); floor <= plan.floors; floor += 1) {
    const entrance = planIsEntrance(plan, floor);
    const config: { -readonly [K in keyof FloorConfig]: FloorConfig[K] } = {
      id: floorIdOf(frame, floor),
      index: floor,
      heightM: Math.round(floor * plan.floorHeightM * 100) / 100,
      population: planPopulationAt(plan, layout, floor),
    };
    if (entrance) config.isEntrance = true;
    if ((floor > 0 && skies.has(floor)) || (floor === 0 && lobbyTransfers)) config.isTransferFloor = true;
    const use = plan.useByFloor[floor];
    if (use !== undefined && use !== plan.trafficProfile) config.trafficProfile = use;
    const panel = plan.panelByFloor[floor];
    if (panel !== undefined) config.landingCallType = panel;
    floors.push(config);
  }

  const transfer = transferSecondsFor(plan.type, specs);
  const accelerationOf = (classId: string): number =>
    specs.classes.find((entry) => entry.id === classId)?.acceleration.typical ?? 1;

  const banks: BankConfig[] = groups.map((group, groupIndex) => {
    const cars: Record<string, unknown>[] = [];
    const shafts: Record<string, unknown>[] = [];
    for (const index of group.shafts) {
      const shaft = plan.shafts[index] as PlanShaft;
      const ids = carIdsOf(index, shaft);
      for (const id of ids) {
        const car: Record<string, unknown> = {
          id,
          spec: shaft.machine.specClass,
          ratedSpeedMps: shaft.machine.ratedSpeedMps,
          ratedLoadLb: shaft.machine.ratedLoadLb,
          doorType: 'centerOpening',
        };
        if (shaft.duty !== 'passenger') car['duty'] = shaft.duty;
        if (shaft.pressurised) car['cabinPressurised'] = true;
        if (shaft.descentSpeedMps !== undefined) car['descentSpeedMps'] = shaft.descentSpeedMps;
        if (transfer !== undefined) car['passengerTransferS'] = transfer;
        if (group.decks === 2) {
          car['doubleDeck'] = true;
          car['deckSeparationM'] = Math.round(plan.floorHeightM * 1000) / 1000;
          car['ratedLoadLbPerDeck'] = shaft.machine.ratedLoadLb / 2;
        }
        cars.push(car);
      }
      const label = shaftLabelOf(index);
      if (shaft.cars === 2) {
        const boundary = sectorBoundaryOf(group);
        shafts.push({
          $comment:
            'Two cars in one hoistway. standingClearanceM is one floor pitch and ' +
            'emergencyDecelerationMps2 is twice the class comfort deceleration: both CHOSEN by the ' +
            'building designer, not cited. docs/11 § 10 records that no source consulted publishes ' +
            'a separation in metres. sectorBoundaryFloorId is the middle stop, also CHOSEN: the ' +
            'lower car keeps to the floors at or below it and the upper car to the floors above.',
          id: `shaft-${label}`,
          carIds: ids,
          standingClearanceM: Math.round(plan.floorHeightM * 1000) / 1000,
          emergencyDecelerationMps2: 2 * accelerationOf(shaft.machine.specClass),
          ...(boundary === undefined ? {} : { sectorBoundaryFloorId: floorIdOf(frame, boundary) }),
        });
      } else {
        shafts.push({ id: `shaft-${label}`, carIds: ids });
      }
    }
    const bank: Record<string, unknown> = {
      id: groups.length === 1 ? 'main' : `bank-${String(groupIndex + 1)}`,
      name: groupNameOf(plan, group),
      servesFloors: group.stops.map((floor) => floorIdOf(frame, floor)),
    };
    if (group.decks === 2) {
      bank['servesFloorPairs'] = deckPairingOf(group.stops).pairs.map(([lower, upper]) => [
        floorIdOf(frame, lower),
        floorIdOf(frame, upper),
      ]);
    }
    /* A shafts block only where some hoistway holds two cars: absent means one shaft per car, which
       is what every shipped building says by declaring none. */
    if (group.shafts.some((index) => (plan.shafts[index] as PlanShaft).cars === 2)) bank['shafts'] = shafts;
    if (plan.regenerativeDrive) bank['regenerativeDrive'] = true;
    if (plan.ropeClass !== undefined) bank['ropeClass'] = plan.ropeClass;
    bank['cars'] = cars;
    return bank as unknown as BankConfig;
  });

  const transportModes = transportModesOf(frame, specs.escalatorCapacity);
  return {
    id: plan.id,
    name: plan.name.trim() === '' ? 'My building' : plan.name.trim(),
    type: plan.type,
    trafficProfile: plan.trafficProfile,
    floors,
    totalPopulation: floors.reduce((total, floor) => total + floor.population, 0),
    banks,
    ...(transportModes.length === 0 ? {} : { transportModes }),
    accessZones: accessZonesOf(frame),
  };
}

/** What the loader and the closed form make of a plan. */
export interface PlanAnalysis {
  /** The loader's own refusals, one per issue. Empty when the building loads. */
  readonly refusals: readonly string[];
  /**
   * The loader's advisories about a building it did build — less the ones about connectivity,
   * which {@link orphanFloorsOf} and {@link strandedFloorsOf} already find and the board says in
   * its own words with a fix beside them. See {@link SAID_BY_THE_BOARD}.
   */
  readonly advisories: readonly string[];
  /** One entry per group, through the Barney/CIBSE closed form. Empty when the loader refused. */
  readonly banks: readonly SpecBankAnalysis[];
  /** The building as resolved, for a caller that draws it. `undefined` when the loader refused. */
  readonly resolved: ResolvedBuilding | undefined;
}

/**
 * The loader advisories the drawing board does **not** repeat, because it states the same defect
 * itself: a floor nobody can reach from an entrance, a pair of floors with no route between them,
 * and a journey that needs too many changes. Each is a consequence of where the shafts stop and
 * where the sky lobbies are, which is what {@link strandedFloorsOf} reads off the plan and what the
 * board offers a one-press fix for. Printing the loader's sentence as well would say one thing
 * twice, the second time in the document's vocabulary — bank ids and floor ids — on a player's
 * screen. `towerPlan.test.ts` holds the two answers to each other, so leaving it out hides nothing.
 */
const SAID_BY_THE_BOARD: ReadonlySet<string> = new Set([
  WARNING_CODES.unreachableFromEntrance,
  WARNING_CODES.unroutableInterfloor,
  WARNING_CODES.excessiveTransferChain,
]);

/**
 * **Why a group with two cars in one hoistway has no interval and no handling figure.**
 *
 * The closed form counts cars: `analyzeUpPeak` divides one round trip by `cars.length`, and every
 * one of those cars is assumed to leave the main lobby and reach the top. Two cars in one shaft do
 * neither — the upper never reaches the bottom landing and the lower never reaches the top
 * (`sim/twinShaft.test.ts`) — and the expression has no term for it, exactly as it has none for a
 * second deck. `oracle/upPeakCase.ts#isolateBank` drops the `shafts` block, so no residual is
 * published for such a bank either.
 *
 * It was measured before it was withheld (2026-11-11, `zonedTowerPlan`, 20 seeds × 1 800 s, the
 * low group's first shaft given a second car): the closed form moved the group's interval from
 * 40.1 s to 32.1 s, while the pair together carried fewer riders in every profile tried than the
 * one car it replaced. A figure that improves when the run does not is the one this screen may
 * not draw, so the group's row says why and the run is where the reader finds out. That run was
 * of a pair with no sector boundary; the board writes one now ({@link sectorBoundaryOf}), the
 * comparison has not been repeated on it, and the closed form has no term for a sector either.
 */
export const TWO_CAR_FIGURES_WITHHELD =
  'Not worked out for a group with two cars in one shaft: the round-trip sum counts every car as ' +
  'free to reach the lobby and the top, and a pair cannot pass each other. Run it to measure it.';

/**
 * **The plan through the real loader and the real closed form.**
 *
 * `buildingFromPlan → parseBuilding → resolveBuilding → analyzeUpPeak`, which is the chain
 * `buildingSpec.ts#upPeakAnalysisOf` runs and the one the correctness oracle holds the simulator
 * to. Nothing here computes an interval. A refusal comes back as the loader's own sentences, one
 * per issue, rather than as a summary of them — the reader is told what the engine said.
 */
export function planAnalysisOf(plan: TowerPlan, specs: ElevatorSpecs): PlanAnalysis {
  const file = `${plan.id}.json`;
  try {
    const config = buildingFromPlan(plan, specs);
    const resolved = resolveBuilding(parseBuilding(config as unknown, file), specs, { file });
    return {
      refusals: [],
      advisories: resolved.warnings
        .filter((warning) => !SAID_BY_THE_BOARD.has(warning.code))
        .map((warning) => warning.message),
      banks: upPeakBanksOf(resolved, specs).map((bank, index) =>
        resolved.banks[index]?.shafts.some((shaft) => shaft.carIds.length === 2) === true
          ? { ...bank, figures: undefined, refusal: TWO_CAR_FIGURES_WITHHELD, line: '', reading: '', warnings: [] }
          : bank,
      ),
      resolved,
    };
  } catch (error) {
    const refusals =
      error instanceof ConfigError
        ? error.issues.map((issue) => issue.message)
        : [error instanceof Error ? error.message : String(error)];
    return { refusals, advisories: [], banks: [], resolved: undefined };
  }
}

/* -------------------------------------------------------------------------- *
 * Edits — each one a pure step from a plan to a plan
 * -------------------------------------------------------------------------- */

/** The next unused shaft key. */
function nextShaftKey(plan: TowerPlan): string {
  const used = new Set(plan.shafts.map((shaft) => shaft.key));
  for (let n = plan.shafts.length + 1; ; n += 1) {
    const key = `s${String(n)}`;
    if (!used.has(key)) return key;
  }
}

/** Every shaft re-fitted to the building, and every per-floor fact that names a floor it has. */
export function fittedPlan(plan: TowerPlan): TowerPlan {
  const lowest = planLowestFloor(plan);
  const inside = (floor: number): boolean => floor >= lowest && floor <= plan.floors;
  const keep = <T>(record: Readonly<Record<number, T>>): Record<number, T> => {
    const kept: Record<number, T> = {};
    for (const [key, value] of Object.entries(record)) if (inside(Number(key))) kept[Number(key)] = value;
    return kept;
  };
  return {
    ...plan,
    shafts: plan.shafts.map((shaft) => fittedShaft(plan, shaft)),
    skyLobbies: [...new Set(plan.skyLobbies)].filter((floor) => floor > 0 && floor < plan.floors).sort((a, b) => a - b),
    populationByFloor: keep(plan.populationByFloor),
    useByFloor: keep(plan.useByFloor),
    panelByFloor: keep(plan.panelByFloor),
    accessZones: plan.accessZones
      .map((zone) => ({ ...zone, floors: zone.floors.filter(inside) }))
      .filter((zone) => zone.floors.length > 0),
    transportModes: plan.transportModes.filter((mode) => mode.connects.every(inside)),
  };
}

/**
 * Change how many floors stand above the lobby.
 *
 * **A shaft that reached the roof follows it.** The core is the shafts that reach highest, so a
 * tower made taller with its core left behind would stop being that tower: every shaft would
 * become a wing and the top floors would be orphans. A shaft that stopped short stays where it was
 * drawn, clamped only if the roof came down past it.
 */
export function withFloors(plan: TowerPlan, floors: number): TowerPlan {
  const next = Math.max(2, Math.round(floors));
  return fittedPlan({
    ...plan,
    floors: next,
    shafts: plan.shafts.map((shaft) => (shaft.top === plan.floors ? { ...shaft, top: next } : shaft)),
  });
}

/** Dig or fill floors below the lobby. A new one is `B1`, `B2`, … and is not an entrance. */
export function withBasements(plan: TowerPlan, count: number): TowerPlan {
  const next = Math.max(0, Math.round(count));
  const belowLobby: SpecBelowLobbyFloor[] = [];
  for (let index = 0; index < next; index += 1) {
    belowLobby.push(plan.belowLobby[index] ?? { id: `B${String(index + 1)}` });
  }
  return fittedPlan({ ...plan, belowLobby });
}

/** A new shaft beside the last one, copying its machine, standing `bottom` to `top`. */
export function withShaftAdded(plan: TowerPlan, bottom: number, top: number): TowerPlan {
  const last = plan.shafts.at(-1);
  const shaft: PlanShaft = {
    key: nextShaftKey(plan),
    bottom,
    top,
    service: 'local',
    zoneLow: Math.round((bottom + top) / 2),
    stops: [bottom, top],
    machine: last?.machine ?? {
      specClass: BLANK_SPEC.specClass,
      ratedSpeedMps: BLANK_SPEC.ratedSpeedMps,
      ratedLoadLb: BLANK_SPEC.ratedLoadLb,
    },
    decks: 1,
    cars: 1,
    duty: 'passenger',
    pressurised: false,
  };
  return fittedPlan({ ...plan, shafts: [...plan.shafts, shaft] });
}

/** A copy of one shaft, placed straight after it. */
export function withShaftCopied(plan: TowerPlan, key: string): TowerPlan {
  const index = plan.shafts.findIndex((shaft) => shaft.key === key);
  const source = plan.shafts[index];
  if (source === undefined) return plan;
  const copy: PlanShaft = { ...source, key: nextShaftKey(plan) };
  return { ...plan, shafts: [...plan.shafts.slice(0, index + 1), copy, ...plan.shafts.slice(index + 1)] };
}

export function withShaftsRemoved(plan: TowerPlan, keys: readonly string[]): TowerPlan {
  return { ...plan, shafts: plan.shafts.filter((shaft) => !keys.includes(shaft.key)) };
}

/** Apply one change to every named shaft, re-fitting each. */
export function withShafts(
  plan: TowerPlan,
  keys: readonly string[],
  change: (shaft: PlanShaft) => PlanShaft,
): TowerPlan {
  return {
    ...plan,
    shafts: plan.shafts.map((shaft) => (keys.includes(shaft.key) ? fittedShaft(plan, change(shaft)) : shaft)),
  };
}

/**
 * Give shafts two decks, or one — and take the second car out of any that had one.
 *
 * The loader refuses a two-car shaft in a double-deck bank in as many words (*"physically built and
 * nothing in this simulator is designed for it"*, `docs/11` § 10), so the two are exclusive at the
 * control rather than left for the loader to refuse on save.
 */
export function withDecks(plan: TowerPlan, keys: readonly string[], decks: 1 | 2): TowerPlan {
  return withShafts(plan, keys, (shaft) => ({ ...shaft, decks, cars: decks === 2 ? 1 : shaft.cars }));
}

/** Hang two cars in shafts, or one — and take the second deck off any that had one. See {@link withDecks}. */
export function withCars(plan: TowerPlan, keys: readonly string[], cars: 1 | 2): TowerPlan {
  return withShafts(plan, keys, (shaft) => ({ ...shaft, cars, decks: cars === 2 ? 1 : shaft.decks }));
}

/** Stand shafts in a block of their own (`1`), or put them back in the first (`0`). */
export function withWing(plan: TowerPlan, keys: readonly string[], wing: number): TowerPlan {
  return withShafts(plan, keys, (shaft) => {
    const { wing: _dropped, ...rest } = shaft;
    void _dropped;
    return wing === 0 ? rest : { ...rest, wing };
  });
}

/**
 * Open or close one shaft's doors at one floor, by hand.
 *
 * The shaft becomes `custom` on the first press, starting from the stops its pattern already had —
 * so a reader who closes floor 7 of a local shaft gets that local shaft less floor 7, not an empty
 * list they must rebuild.
 */
export function withStopToggled(plan: TowerPlan, key: string, floor: number): TowerPlan {
  return withShafts(plan, [key], (shaft) => {
    if (floor < shaft.bottom || floor > shaft.top) return shaft;
    const current = new Set(shaft.service === 'custom' ? shaft.stops : stopsOf(plan, shaft));
    if (current.has(floor)) current.delete(floor);
    else current.add(floor);
    return { ...shaft, service: 'custom', stops: [...current].sort((a, b) => a - b) };
  });
}

/** Make a floor a sky lobby, or stop it being one. Only a floor strictly inside the tower can be. */
export function withSkyLobbyToggled(plan: TowerPlan, floors: readonly number[]): TowerPlan {
  const targets = floors.filter((floor) => floor > 0 && floor < plan.floors);
  if (targets.length === 0) return plan;
  const all = targets.every((floor) => plan.skyLobbies.includes(floor));
  const next = all
    ? plan.skyLobbies.filter((floor) => !targets.includes(floor))
    : [...new Set([...plan.skyLobbies, ...targets])];
  return { ...plan, skyLobbies: next.sort((a, b) => a - b) };
}

/** Set the people on floors by hand, or hand them back to the plate with `undefined`. */
export function withPopulation(plan: TowerPlan, floors: readonly number[], people: number | undefined): TowerPlan {
  const populationByFloor = { ...plan.populationByFloor };
  for (const floor of floors) {
    if (people === undefined) delete populationByFloor[floor];
    else populationByFloor[floor] = Math.max(0, Math.round(people));
  }
  return { ...plan, populationByFloor };
}

/** Give floors a crowd of their own, or the building's with `undefined`. */
export function withUse(plan: TowerPlan, floors: readonly number[], profileId: string | undefined): TowerPlan {
  const useByFloor = { ...plan.useByFloor };
  for (const floor of floors) {
    if (profileId === undefined || profileId === plan.trafficProfile) delete useByFloor[floor];
    else useByFloor[floor] = profileId;
  }
  return { ...plan, useByFloor };
}

/** The escalator joining `floor` to the one above it, if the plan has one. */
export function escalatorAbove(plan: TowerPlan, floor: number): SpecTransportMode | undefined {
  return plan.transportModes.find(
    (mode) => mode.kind !== 'stairs' && Math.min(...mode.connects) === floor && Math.max(...mode.connects) === floor + 1,
  );
}

/** The stair joining `floor` to the one above it, if the plan has one. */
export function stairsAbove(plan: TowerPlan, floor: number): SpecTransportMode | undefined {
  return plan.transportModes.find(
    (mode) => mode.kind === 'stairs' && Math.min(...mode.connects) === floor && Math.max(...mode.connects) === floor + 1,
  );
}

/** The four numbers a stair is, all of them the reader's. See {@link withStairsAdded}. */
export interface PlanStairs {
  /** Seconds to climb one flight, landing to landing. */
  readonly upS: number;
  /** Seconds to walk down it. Never more than {@link upS}. */
  readonly downS: number;
  /** The share of riders going up one floor who walk, 0 to 1. */
  readonly up: number;
  /** The share going down who walk, 0 to 1. */
  readonly down: number;
}

/** Whether four numbers make a stair the loader will take: a climb no faster than the descent. */
export function stairsAreValid(stairs: PlanStairs): boolean {
  const share = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;
  return (
    Number.isFinite(stairs.upS) &&
    Number.isFinite(stairs.downS) &&
    stairs.downS > 0 &&
    stairs.upS >= stairs.downS &&
    share(stairs.up) &&
    share(stairs.down)
  );
}

/**
 * Add a stair from a floor to the one above it.
 *
 * **Every number is the caller's and none is seeded**, which is the whole difference from
 * {@link withEscalatorToggled}. `docs/02` § *Stairs* carries no calibrated figure and says none has
 * been invented, and `core`'s `StairsUseConfig` has no default in code on purpose: who walks is a
 * claim about this building's people. So the board asks for all four, and
 * `buildingSpec.ts#transportModesOf` writes them into the document as set by hand and not cited.
 * A stair that is not {@link stairsAreValid} changes nothing.
 */
export function withStairsAdded(plan: TowerPlan, floor: number, stairs: PlanStairs): TowerPlan {
  if (!stairsAreValid(stairs)) return plan;
  if (stairsAbove(plan, floor) !== undefined) return plan;
  if (floor < planLowestFloor(plan) || floor + 1 > plan.floors) return plan;
  const mode: SpecTransportMode = {
    id: nextTransportModeId(planFrame(plan)),
    connects: [floor, floor + 1],
    kind: 'stairs',
    traversalTimeS: { upS: stairs.upS, downS: stairs.downS },
    use: { up: stairs.up, down: stairs.down },
  };
  return { ...plan, transportModes: [...plan.transportModes, mode] };
}

/** Take one escalator or stair away, by its id. */
export function withTransportModeRemoved(plan: TowerPlan, id: string): TowerPlan {
  return { ...plan, transportModes: plan.transportModes.filter((mode) => mode.id !== id) };
}

/**
 * Set how long one escalator takes, landing to landing.
 *
 * `buildingSpec.ts#withTransportSeconds` does the clamping and refuses a stair, whose time is a
 * pair; this is its door from the drawing board.
 */
export function withEscalatorSeconds(plan: TowerPlan, floor: number, seconds: number): TowerPlan {
  const escalator = escalatorAbove(plan, floor);
  if (escalator === undefined) return plan;
  return { ...plan, transportModes: withTransportSeconds(planFrame(plan), escalator.id, seconds) };
}

/** Set the fixture on floors' landings, or hand them back to the dispatcher with `undefined`. */
export function withPanel(plan: TowerPlan, floors: readonly number[], panel: CallType | undefined): TowerPlan {
  const panelByFloor = { ...plan.panelByFloor };
  for (const floor of floors) {
    if (panel === undefined) delete panelByFloor[floor];
    else panelByFloor[floor] = panel;
  }
  return { ...plan, panelByFloor };
}

/**
 * Set how fast shafts' cars may come down, or let them descend at rated speed with `undefined`.
 *
 * Never above the rated speed: a descent limit is a limit, and `core` reads one above the rated
 * speed as a document error.
 */
export function withDescentSpeed(plan: TowerPlan, keys: readonly string[], mps: number | undefined): TowerPlan {
  return withShafts(plan, keys, (shaft) => {
    const { descentSpeedMps: _dropped, ...rest } = shaft;
    void _dropped;
    return mps === undefined || mps >= shaft.machine.ratedSpeedMps ? rest : { ...rest, descentSpeedMps: mps };
  });
}

/**
 * Keep floors for one group of people: a new access zone over them.
 *
 * Access zoning is the credential kind and none of the other two — it decides who may travel to a
 * floor, and moves no shaft's doors. `traffic/generator.ts` draws each rider's credential from the
 * zones, so the control needs nothing else declared. A blank name, or no floor, changes nothing.
 */
export function withAccessZoneAdded(plan: TowerPlan, floors: readonly number[], group: string): TowerPlan {
  const wanted = group.trim();
  const lowest = planLowestFloor(plan);
  const inside = [...new Set(floors)].filter((floor) => floor >= lowest && floor <= plan.floors).sort((a, b) => a - b);
  if (wanted === '' || inside.length === 0) return plan;
  const zone: SpecAccessZone = { id: nextZoneId(planFrame(plan)), floors: inside, credentialGroups: [wanted] };
  return { ...plan, accessZones: [...plan.accessZones, zone] };
}

/** Lift one access zone, by its id. */
export function withAccessZoneRemoved(plan: TowerPlan, id: string): TowerPlan {
  return { ...plan, accessZones: plan.accessZones.filter((zone) => zone.id !== id) };
}

/**
 * Add an escalator from a floor to the one above it, or take it away.
 *
 * Seeded at EN 115-1's seconds for the rise — `buildingSpec.ts#escalatorSecondsFor`, the figure the
 * Engineer editor seeds and the one whose derivation the document's `$comment` then writes out.
 */
export function withEscalatorToggled(plan: TowerPlan, floor: number): TowerPlan {
  const existing = escalatorAbove(plan, floor);
  if (existing !== undefined) {
    return { ...plan, transportModes: plan.transportModes.filter((mode) => mode.id !== existing.id) };
  }
  if (floor < planLowestFloor(plan) || floor + 1 > plan.floors) return plan;
  const frame = planFrame(plan);
  const connects: readonly [number, number] = [floor, floor + 1];
  const mode: SpecTransportMode = {
    id: nextTransportModeId(frame),
    connects,
    traversalTimeS: escalatorSecondsFor(frame, connects),
  };
  return { ...plan, transportModes: [...plan.transportModes, mode] };
}

/**
 * Say how many people an hour the escalator above a floor carries in each direction, or lift the
 * limit again with `undefined` — § D1631.
 *
 * `buildingSpec.ts#withTransportCapacity` does the write, so the Engineer editor's rule and this
 * board's are one rule. A floor with no escalator above it returns the plan unchanged.
 */
export function withEscalatorCapacity(
  plan: TowerPlan,
  floor: number,
  capacityPersonsPerHour: number | undefined,
): TowerPlan {
  const escalator = escalatorAbove(plan, floor);
  if (escalator === undefined) return plan;
  return {
    ...plan,
    transportModes: withTransportCapacity(planFrame(plan), escalator.id, capacityPersonsPerHour),
  };
}

/**
 * Whether any journey that rides a lift is routed over the escalator `modeId` — § D1631.
 *
 * **The question the capacity control has to ask before it offers anything.** `traffic/route.ts`
 * plans a journey over an escalator only where that gives the fewest segments, and a journey that
 * is the escalator and nothing else is not lift demand and is never generated. So an escalator
 * joining two floors the same lifts already join is ridden by nobody in a run, and a limit on it
 * moves no leg — a control that writes nothing, which must say so rather than look live.
 *
 * Asked of the resolved building, with `core`'s own planner, over the floors a journey can start
 * or end on (an entrance, or a floor with people) and within the generator's own limit on lift
 * legs — so *false* means no journey the trace generator can produce touches this machine.
 */
export function escalatorCarriesLiftJourneys(resolved: ResolvedBuilding, modeId: string): boolean {
  const planner = RoutePlanner.forBuilding(resolved);
  const ends = resolved.floors.filter((floor) => floor.population > 0 || floor.isEntrance === true);
  for (const from of ends) {
    for (const to of ends) {
      if (from.id === to.id) continue;
      const route = planner.plan(from.id, to.id);
      if (route === undefined || route.elevatorLegCount === 0) continue;
      if (route.elevatorLegCount > TRAFFIC_DEFAULTS.maxLegs) continue;
      if (route.segments.some((segment) => segment.kind === 'transport' && segment.modeId === modeId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * **Zone the tallest shafts for me** — split them into `zones` groups, each with its own floors.
 *
 * The lowest zone runs local from the lobby; every zone above it runs express from the lobby to its
 * own floors. Shafts are dealt in drawn order, as evenly as the count allows, and the floors are cut
 * as evenly as the height allows. It writes only {@link PlanShaft.service} and
 * {@link PlanShaft.zoneLow} and a new top for the lower zones — so the lower zones stop short of
 * the roof and, by the massing rule, become wings: the building tapers because the lifts do.
 */
export function withAutoZones(plan: TowerPlan, zones: number): TowerPlan {
  const tallest = plan.shafts.reduce((best, shaft) => Math.max(best, shaft.top), Number.NEGATIVE_INFINITY);
  const core = plan.shafts.filter((shaft) => shaft.top === tallest && shaft.bottom <= 0);
  const count = Math.max(1, Math.min(Math.round(zones), core.length, Math.floor(tallest / 2)));
  if (count < 2) return plan;
  const perZone = tallest / count;
  const zoneOf = new Map<string, number>();
  core.forEach((shaft, index) => {
    zoneOf.set(shaft.key, Math.min(count - 1, Math.floor((index * count) / core.length)));
  });
  return fittedPlan({
    ...plan,
    shafts: plan.shafts.map((shaft) => {
      const zone = zoneOf.get(shaft.key);
      if (zone === undefined) return shaft;
      const low = Math.round(zone * perZone) + 1;
      const high = zone === count - 1 ? tallest : Math.round((zone + 1) * perZone);
      return zone === 0
        ? { ...shaft, bottom: 0, top: high, service: 'local' as const }
        : { ...shaft, bottom: 0, top: high, service: 'express' as const, zoneLow: low };
    }),
  });
}

/* -------------------------------------------------------------------------- *
 * Templates
 * -------------------------------------------------------------------------- */

function shaftOf(
  key: string,
  bottom: number,
  top: number,
  machine: SpecMachine,
  rest: Partial<PlanShaft> = {},
): PlanShaft {
  return {
    key,
    bottom,
    top,
    service: 'local',
    zoneLow: Math.round((bottom + top) / 2),
    stops: [bottom, top],
    machine,
    decks: 1,
    cars: 1,
    duty: 'passenger',
    pressurised: false,
    ...rest,
  };
}

const PLAN_BASE = Object.freeze({
  type: 'office' as BuildingType,
  trafficProfile: 'office-standard',
  belowLobby: Object.freeze([]) as readonly SpecBelowLobbyFloor[],
  firstFloorNumber: 1,
  occupancyPct: 85,
  populationByFloor: Object.freeze({}),
  useByFloor: Object.freeze({}),
  panelByFloor: Object.freeze({}),
  skyLobbies: Object.freeze([]) as readonly number[],
  transportModes: Object.freeze([]) as readonly SpecTransportMode[],
  accessZones: Object.freeze([]) as readonly SpecAccessZone[],
  regenerativeDrive: false,
});

const GEARED: SpecMachine = { specClass: 'geared-traction', ratedSpeedMps: 2.5, ratedLoadLb: 2500 };
const GEARLESS: SpecMachine = { specClass: 'gearless-traction', ratedSpeedMps: 4, ratedLoadLb: 3500 };
const GEARLESS_FAST: SpecMachine = { specClass: 'gearless-traction', ratedSpeedMps: 5, ratedLoadLb: 3500 };
const HIGH_SPEED: SpecMachine = { specClass: 'high-speed-gearless', ratedSpeedMps: 8, ratedLoadLb: 4000 };
const ULTRA: SpecMachine = { specClass: 'ultra-high-speed', ratedSpeedMps: 10, ratedLoadLb: 4000 };
const LOW_RISE: SpecMachine = { specClass: 'mrl-gearless-low', ratedSpeedMps: 1.6, ratedLoadLb: 3500 };

/** Twelve floors and four lifts that stop everywhere: the simplest building that is a building. */
export function blankPlan(): TowerPlan {
  return {
    ...PLAN_BASE,
    id: 'my-building',
    name: 'My building',
    floors: 12,
    floorHeightM: 3.6,
    peoplePerBay: 20,
    shafts: ['s1', 's2', 's3', 's4'].map((key) => shaftOf(key, 0, 12, GEARED)),
  };
}

/** Forty floors cut in two at the lobby: a low zone that stops short, a high zone that runs express. */
export function zonedTowerPlan(): TowerPlan {
  return {
    ...PLAN_BASE,
    id: 'zoned-tower',
    name: 'Zoned tower',
    floors: 40,
    floorHeightM: 3.8,
    peoplePerBay: 8,
    shafts: [
      ...['s1', 's2', 's3', 's4'].map((key) => shaftOf(key, 0, 20, GEARLESS)),
      ...['s5', 's6', 's7', 's8', 's9'].map((key) =>
        shaftOf(key, 0, 40, GEARLESS_FAST, { service: 'express', zoneLow: 21 }),
      ),
    ],
  };
}

/** Sixty floors with a sky lobby at thirty: shuttles to it, and a second set of locals above it. */
export function skyLobbyPlan(): TowerPlan {
  return {
    ...PLAN_BASE,
    id: 'sky-lobby-tower',
    name: 'Sky lobby tower',
    floors: 60,
    floorHeightM: 3.8,
    peoplePerBay: 5,
    skyLobbies: [30],
    shafts: [
      ...['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((key) => shaftOf(key, 0, 30, GEARLESS)),
      ...['s8', 's9', 's10'].map((key) => shaftOf(key, 0, 30, HIGH_SPEED, { service: 'shuttle' })),
      ...['s11', 's12', 's13', 's14', 's15'].map((key) => shaftOf(key, 30, 60, GEARLESS)),
    ],
  };
}

/**
 * A wide, low building that steps down on both sides — the shape of a shopping podium.
 *
 * Escalators join its lower floors and one lift is a goods lift. **Its crowd is an office crowd**:
 * no shopping demand profile ships in `data/traffic-profiles.json`, and a template that named one
 * would be naming a crowd the engine cannot generate.
 */
export function podiumPlan(): TowerPlan {
  const base: TowerPlan = {
    ...PLAN_BASE,
    id: 'wide-podium',
    name: 'Wide podium',
    floors: 5,
    belowLobby: [{ id: 'B1' }],
    floorHeightM: 4.5,
    peoplePerBay: 40,
    shafts: [
      shaftOf('s1', -1, 5, LOW_RISE),
      shaftOf('s2', -1, 5, LOW_RISE),
      shaftOf('s3', -1, 5, LOW_RISE, { duty: 'goods' }),
      shaftOf('s4', 0, 3, LOW_RISE),
      shaftOf('s5', 0, 3, LOW_RISE),
      shaftOf('s9', 0, 3, LOW_RISE),
      shaftOf('s6', 0, 2, LOW_RISE),
      shaftOf('s7', 0, 2, LOW_RISE),
      shaftOf('s8', 0, 2, LOW_RISE),
    ],
  };
  return [0, 1, 2].reduce((plan, floor) => withEscalatorToggled(plan, floor), base);
}

/**
 * A hundred floors with two two-level sky lobbies, double-deck shuttles between them, and three
 * stacked sets of locals — the arrangement `vertical-city` ships, drawn from nothing.
 */
export function supertallPlan(): TowerPlan {
  const base: TowerPlan = {
    ...PLAN_BASE,
    id: 'supertall',
    name: 'Supertall',
    floors: 100,
    floorHeightM: 4,
    peoplePerBay: 3,
    skyLobbies: [34, 35, 67, 68],
    shafts: [
      ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((key) => shaftOf(key, 0, 33, GEARLESS)),
      ...['s9', 's10', 's11', 's12', 's13', 's14'].map((key) => shaftOf(key, 34, 66, GEARLESS)),
      ...['s15', 's16', 's17', 's18'].map((key) =>
        shaftOf(key, 0, 68, ULTRA, { service: 'shuttle', decks: 2 }),
      ),
      ...['s19', 's20', 's21', 's22', 's23'].map((key) => shaftOf(key, 67, 100, GEARLESS)),
    ],
  };
  return [0, 34, 67].reduce((plan, floor) => withEscalatorToggled(plan, floor), base);
}

/** One starting point the drawing board offers. `name` is what its button reads. */
export interface PlanTemplate {
  readonly id: string;
  readonly make: () => TowerPlan;
}

/** Every template, in the order they are offered: simplest first. */
export const PLAN_TEMPLATES: readonly PlanTemplate[] = Object.freeze([
  { id: 'blank', make: blankPlan },
  { id: 'zoned', make: zonedTowerPlan },
  { id: 'sky-lobby', make: skyLobbyPlan },
  { id: 'podium', make: podiumPlan },
  { id: 'supertall', make: supertallPlan },
]);

/* -------------------------------------------------------------------------- *
 * Reading a building that already exists
 * -------------------------------------------------------------------------- */

/** A building read into a plan, and the kinds of thing the plan could not hold. */
export interface PlanReading {
  readonly plan: TowerPlan;
  /**
   * What the document carried that a plan has no field for — closed codes, so the screen that says
   * them is the only place a sentence about them is written.
   */
  readonly notCarried: readonly PlanLoss[];
}

/** One kind of authored fact a plan cannot hold. */
export type PlanLoss =
  | 'uneven-floor-heights'
  | 'floor-labels'
  | 'floor-areas'
  | 'car-timings'
  | 'service-events'
  | 'notes'
  | 'mixed-bank-equipment';

/** Which pattern reproduces a stop list on this shaft, or `custom` when none does. */
function classifiedShaft(plan: TowerPlan, shaft: PlanShaft, stops: readonly number[]): PlanShaft {
  const wanted = stops.join(',');
  const candidates: PlanShaft[] = [{ ...shaft, service: 'local' }, { ...shaft, service: 'shuttle' }];
  for (const floor of stops) {
    if (floor > shaft.bottom) candidates.push({ ...shaft, service: 'express', zoneLow: floor });
  }
  for (const candidate of candidates) {
    if (stopsOf(plan, candidate).join(',') === wanted) return candidate;
  }
  return { ...shaft, service: 'custom', stops };
}

/**
 * **Open a building that already exists on the drawing board.**
 *
 * The floor vocabulary, the machines, the access zones and the escalators are read by
 * `buildingSpec.ts#specFromBuilding`, so the two drawing boards cannot disagree about which floor
 * is which. The banks are then read **as authored** — every stop list, deck pair and two-car shaft
 * becomes a {@link PlanShaft} that reproduces it, which is the part a `BuildingSpec` can only carry
 * past its sliders.
 *
 * People are read back exactly: the density is fitted to the document's median floor and any floor
 * the plate would not reproduce is set by hand, so opening a building never moves a person.
 *
 * **What a plan cannot hold is returned, never dropped in silence** — {@link PlanReading.notCarried}.
 * Nothing on disk is at risk either way: the drawing board saves under a new id.
 */
export function planFromBuilding(config: BuildingConfig, id: string): PlanReading {
  const spec = specFromBuilding(config, id);
  const carried = spec.carried;
  const numberById = new Map<string, number>();
  for (const [number, floor] of Object.entries(carried?.floors ?? {})) numberById.set(floor.id, Number(number));

  const shell: TowerPlan = {
    ...PLAN_BASE,
    id,
    name: config.name,
    type: config.type,
    trafficProfile: config.trafficProfile,
    floors: spec.floors,
    belowLobby: spec.belowLobby,
    firstFloorNumber: spec.firstFloorNumber,
    floorHeightM: spec.floorHeightM,
    peoplePerBay: 20,
    occupancyPct: 100,
    skyLobbies: spec.skyFloors.filter((floor) => floor > 0 && floor < spec.floors),
    shafts: [],
    transportModes: spec.transportModes,
    accessZones: spec.accessZones,
    regenerativeDrive: (carried?.banks ?? []).some((bank) => bank.regenerativeDrive === true),
    ropeClass: (carried?.banks ?? []).find((bank) => bank.ropeClass !== undefined)?.ropeClass,
  };

  const shafts: PlanShaft[] = [];
  let carIndex = 0;
  /* Banks whose doors open on exactly the same floors are separate blocks, numbered as they come. */
  const blocksSeen = new Map<string, number>();
  for (const bank of carried?.banks ?? []) {
    const blockKey = [bank.cars[0]?.doubleDeck === true ? 2 : 1, ...bank.servesFloors].join('|');
    const wing = blocksSeen.get(blockKey) ?? 0;
    blocksSeen.set(blockKey, wing + 1);
    const stops = bank.servesFloors
      .map((floorId) => numberById.get(floorId))
      .filter((floor): floor is number => floor !== undefined)
      .sort((a, b) => a - b);
    const bottom = stops[0] ?? 0;
    const top = stops.at(-1) ?? spec.floors;
    const upperCars = new Set<string>();
    const lowerCars = new Set<string>();
    for (const shaft of bank.shafts ?? []) {
      if (shaft.carIds.length < 2) continue;
      lowerCars.add(shaft.carIds[0] as string);
      upperCars.add(shaft.carIds[1] as string);
    }
    for (const car of bank.cars) {
      const index = carIndex;
      carIndex += 1;
      /* The upper car of a pair is the second car of a shaft already read from its lower one. */
      if (upperCars.has(car.id)) continue;
      const drawn: PlanShaft = {
        key: `s${String(shafts.length + 1)}`,
        bottom,
        top,
        service: 'local',
        zoneLow: Math.round((bottom + top) / 2),
        stops,
        machine: machineAt(spec, index),
        decks: car.doubleDeck === true ? 2 : 1,
        cars: lowerCars.has(car.id) ? 2 : 1,
        duty: car.duty ?? 'passenger',
        pressurised: car.cabinPressurised === true,
        ...(car.descentSpeedMps === undefined ? {} : { descentSpeedMps: car.descentSpeedMps }),
        ...(wing === 0 ? {} : { wing }),
      };
      shafts.push(classifiedShaft(shell, drawn, stops));
    }
  }

  /*
   * People. The density and the let share are fitted together to the median of *people per bay*
   * over the floors that hold anybody: the density is that median rounded up to a whole person, and
   * the share is what brings it back down. A uniformly let tower then needs no hand-set floor at
   * all, and every floor the plate still gets wrong is pinned to what the document said.
   */
  const withShaftsDrawn: TowerPlan = { ...shell, shafts };
  const layout = layoutOf(withShaftsDrawn);
  const densities: number[] = [];
  for (let floor = 1; floor <= spec.floors; floor += 1) {
    const people = carried?.floors[floor]?.population ?? 0;
    if (people > 0) densities.push(people / baysAt(withShaftsDrawn, layout, floor));
  }
  densities.sort((a, b) => a - b);
  const median = densities[Math.floor(densities.length / 2)] ?? 20;
  const peoplePerBay = Math.max(1, Math.ceil(median));
  const occupancyPct = Math.max(1, Math.min(120, Math.round((median / peoplePerBay) * 100)));
  const dense: TowerPlan = { ...withShaftsDrawn, peoplePerBay, occupancyPct };
  const populationByFloor: Record<number, number> = {};
  const useByFloor: Record<number, string> = {};
  const panelByFloor: Record<number, CallType> = {};
  for (const authored of config.floors ?? []) {
    const number = numberById.get(authored.id);
    if (number !== undefined && authored.landingCallType !== undefined) panelByFloor[number] = authored.landingCallType;
  }
  for (let floor = planLowestFloor(dense); floor <= dense.floors; floor += 1) {
    const authored = carried?.floors[floor];
    if (authored === undefined) continue;
    if (!planIsEntrance(dense, floor) && authored.population !== autoPopulationAt(dense, layout, floor)) {
      populationByFloor[floor] = authored.population;
    }
    if (authored.trafficProfile !== undefined && authored.trafficProfile !== config.trafficProfile) {
      useByFloor[floor] = authored.trafficProfile;
    }
  }

  const authoredFloors = Object.values(carried?.floors ?? {});
  const cars = (carried?.banks ?? []).flatMap((bank) => bank.cars);
  const notCarried: PlanLoss[] = [];
  const evenlyPitched = Object.entries(carried?.floors ?? {}).every(
    ([number, floor]) => Math.abs(floor.heightM - Number(number) * spec.floorHeightM) < 0.005,
  );
  if (!evenlyPitched) notCarried.push('uneven-floor-heights');
  if (authoredFloors.some((floor) => floor.label !== undefined)) notCarried.push('floor-labels');
  if (authoredFloors.some((floor) => floor.grossAreaM2 !== undefined) || config.grossAreaPerFloorM2 !== undefined) {
    notCarried.push('floor-areas');
  }
  if (
    cars.some(
      (car) =>
        car.passengerTransferS !== undefined ||
        car.acceleration !== undefined ||
        car.jerk !== undefined ||
        car.doorOpenS !== undefined ||
        car.doorCloseS !== undefined ||
        (car.doorType !== undefined && car.doorType !== 'centerOpening') ||
        car.mode !== undefined,
    )
  ) {
    notCarried.push('car-timings');
  }
  if ((config.serviceEvents ?? []).length > 0) notCarried.push('service-events');
  if ((config.notes ?? []).length > 0) notCarried.push('notes');
  const ropes = new Set((carried?.banks ?? []).map((bank) => bank.ropeClass ?? ''));
  const drives = new Set((carried?.banks ?? []).map((bank) => bank.regenerativeDrive === true));
  if (ropes.size > 1 || drives.size > 1) notCarried.push('mixed-bank-equipment');

  return { plan: fittedPlan({ ...dense, populationByFloor, useByFloor, panelByFloor }), notCarried };
}
