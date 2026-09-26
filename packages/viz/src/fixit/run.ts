/**
 * What running a case **is** — the two configs and the measurement.
 *
 * `campaign/stageRun.ts`'s rule, transplanted: this module is the only statement anywhere of how
 * a case's runs are built, both panels call it, and the validation suite calls it. A test that
 * assembled its own `SimulationConfig` would vouch for a reimplementation of the call site.
 *
 * ## What it no longer does: run them
 *
 * It exported `runFixitPair` — two `recordRun` calls — until GitHub issue #165 put both
 * Fix-a-building surfaces on `dev/offThreadRuns.ts`. Neither shell simulates on the thread that
 * paints any more, so nothing outside a test called that function, and a behaviour with no
 * non-test caller is the defect `docs/05-roadmap.md`'s standing requirement is about — the
 * instructive instance being the whole of `tuning/`, which said so in its own docstring while the
 * roadmap called the phase green. It is deleted rather than annotated. What must not be
 * reimplemented is {@link fixitRunPlanOf}, and every caller still goes through it.
 *
 * ## The basis
 *
 * **Two single runs sharing the traffic seed** — as-built against as-repaired. The spec's own
 * copy claims exactly that basis (§ 10.4: *"one run before, one run after — enough to see a
 * repair this size; not enough to split hairs"*), and the basis line is printed verbatim under
 * every result. It is never presented as a paired interval: one seed is one draw, and the surface
 * allowed to say *better* across seeds is the bench.
 *
 * ## How a patch becomes a run
 *
 * Fabric patches are applied to the **authored building document** and the result goes through
 * `parseBuilding` + `resolveBuilding` — the same door a shipped file enters by, so a patched
 * building the loader would refuse is refused here too (`dev/data.ts#resolveEdited`'s argument).
 * Dispatcher patches merge section-whole onto the case's named profile. The measurement then
 * reads the recording's own legs — never a summary statistic, because the complaint is scoped to
 * named floors and a window statistic has no floors in it.
 */

import {
  DISPATCH_DEFAULTS,
  expandFloors,
  parseBuilding,
  resolveBuilding,
  RoutePlanner,
  type BuildingConfig,
  type CrowdThinning,
  type DispatcherProfile,
  type DispatcherProfiles,
  type ElevatorSpecs,
  type ParkingStrategy,
  type ResolvedBuilding,
  type SimulationConfig,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import type { VizLeg, VizRecording } from '../contract/types.js';
import { assertSameCrowd, crowdAddedOf, crowdDifferencesOf, sameCrowd } from '../record/crowd.js';
import { selectionKeepsTheCrowd, type FixitMeasurement } from './engine.js';
import { applyRezone, doorDwellPatchesOf, profileWithDials, tenancyWatchedOf } from './families.js';
import type { ComplaintMeasure, ComplaintScope, FigureSpec, FixitCase, FixitPatch, FixitState } from './types.js';

/* -------------------------------------------------------------------------- *
 * Patch application
 * -------------------------------------------------------------------------- */

interface MutableCar {
  id: string;
  ratedSpeedMps?: number;
  cabinPressurised?: boolean;
  ratedLoadLb?: number;
  dwellCarCallS?: number;
  dwellHallCallS?: number;
  [key: string]: unknown;
}

interface MutableBank {
  id: string;
  cars: MutableCar[];
  [key: string]: unknown;
}

interface MutableBuildingDocument {
  floors?: { id: string; population?: number; [key: string]: unknown }[];
  banks?: MutableBank[];
  totalPopulation?: number;
  [key: string]: unknown;
}

function carsOf(doc: MutableBuildingDocument, carIds: readonly string[]): MutableCar[] {
  const all = (doc.banks ?? []).flatMap((bank) => bank.cars);
  if (carIds.length === 1 && carIds[0] === '*') return all;
  const byId = new Map(all.map((car) => [car.id, car]));
  return carIds.map((id) => {
    const car = byId.get(id);
    if (car === undefined) {
      throw new Error(`fixit: a patch names car "${id}", which this building does not have.`);
    }
    return car;
  });
}

/** The banks a patch names: every bank for `"*"`, otherwise each by id (GitHub issue #431). Throws on an id nothing matches. */
function banksOf(doc: MutableBuildingDocument, bankIds: readonly string[]): MutableBank[] {
  const all = doc.banks ?? [];
  if (bankIds.length === 1 && bankIds[0] === '*') return all;
  const byId = new Map(all.map((bank) => [bank.id, bank]));
  return bankIds.map((id) => {
    const bank = byId.get(id);
    if (bank === undefined) {
      throw new Error(`fixit: a patch names bank "${id}", which this building does not have.`);
    }
    return bank;
  });
}

/** Apply one fabric patch to a cloned authored document. Throws on a name nothing matches. */
function applyBuildingPatch(doc: MutableBuildingDocument, patch: NonNullable<FixitPatch['building']>): void {
  /*
   * **A population on a floor the document declares through `floorRanges`** — § D1001. The
   * document is expanded into explicit floors first, by `core`'s own `expandFloors`, so a population
   * can name any floor the building has rather than only the ones authored one by one. Done only
   * when a patch needs it, so a document no population touches reaches the loader exactly as
   * authored. The decision agents that measured the tenancy question had to add this to patch
   * `vertical-city` and `mixed-use-high-rise` at all; it is kept so no case authored there later
   * finds its tenancy silently unpatchable.
   */
  const named = new Set((patch.floorPopulations ?? []).flatMap((population) => population.floorIds));
  const explicit = new Set((doc.floors ?? []).map((floor) => floor.id));
  if ([...named].some((id) => !explicit.has(id)) && doc['floorRanges'] !== undefined) {
    doc.floors = expandFloors(doc as unknown as Parameters<typeof expandFloors>[0]) as unknown as NonNullable<
      MutableBuildingDocument['floors']
    >;
    delete doc['floorRanges'];
  }
  for (const population of patch.floorPopulations ?? []) {
    for (const floorId of population.floorIds) {
      const floor = (doc.floors ?? []).find((candidate) => candidate.id === floorId);
      if (floor === undefined) {
        throw new Error(`fixit: a patch sets the population of floor "${floorId}", which this building does not declare as a floor.`);
      }
      floor.population = population.population;
    }
    // The declared total no longer describes the patched floors; drop it so the loader derives
    // the sum rather than warning about a mismatch the patch itself created.
    delete doc.totalPopulation;
  }
  if (patch.banks !== undefined) {
    /*
     * **Cloned, and the clone is load-bearing.** `patch.banks` is the array `parse.ts` decoded out
     * of `data/fixit-cases.json` and handed straight through, so assigning it here would make the
     * run's document and the *loaded case file* the same object — and `addCars` below pushes into
     * `bank.cars`. A case that patches banks in its as-built and offers a new shaft (nine of the
     * eighteen do) would therefore grow a car permanently on first selection: the second run of
     * that case is refused by `parseBuilding` with `duplicate car id`, and every run after it
     * describes a building the author never wrote.
     *
     * Found by running one case at two seeds in the same process, which is what a validation sweep
     * does and what a player does by pressing `Run the day` twice.
     */
    doc.banks = structuredClone(patch.banks) as MutableBank[];
  }
  /*
   * **The elevation control — the one field that moves a floor** — GitHub issue #422. Written
   * directly onto the cloned document's `heightM`, exactly as a car's `dwellCarCallS` is written
   * above: the config must say what the building has. The strict-increasing-with-`index` rule, a
   * double-deck pair's exact separation and a rope's hard travel ceiling are not re-checked here —
   * `parseBuilding` + `resolveBuilding` re-validate the whole document below, the same door a
   * shipped file enters by, so a move that breaks one of them is refused there rather than reaching
   * a run.
   */
  for (const heightChange of patch.floors ?? []) {
    for (const floorId of heightChange.floorIds) {
      const floor = (doc.floors ?? []).find((candidate) => candidate.id === floorId);
      if (floor === undefined) {
        throw new Error(`fixit: a patch moves floor "${floorId}", which this building does not declare as a floor.`);
      }
      const currentHeightM = floor['heightM'];
      if (typeof currentHeightM !== 'number') {
        throw new Error(`fixit: floor "${floorId}" declares no heightM for an elevation delta to add to.`);
      }
      floor['heightM'] = currentHeightM + heightChange.heightDeltaM;
    }
  }
  for (const carPatch of patch.cars ?? []) {
    for (const car of carsOf(doc, carPatch.carIds)) {
      if (carPatch.set.ratedSpeedDeltaMps !== undefined) {
        if (typeof car.ratedSpeedMps !== 'number') {
          throw new Error(`fixit: car "${car.id}" declares no ratedSpeedMps for a speed delta to add to.`);
        }
        car.ratedSpeedMps += carPatch.set.ratedSpeedDeltaMps;
      }
      /*
       * **Pressurisation is written even when it changes nothing** — GitHub issue #444.
       *
       * A cabin fitted on a shaft the air-pressure cap does not reach is a real purchase with no
       * effect on the legs, and `resolveBuilding` raises `pressurisation-buys-nothing` about it.
       * Skipping the write where it would not bite would make the *config* lie about what the
       * building has, and would hide the one state this control exists to let a player be wrong
       * about. The seam earns its keep on the shafts where it does bite; it must be honest on
       * the others.
       */
      if (carPatch.set.cabinPressurised !== undefined) {
        car.cabinPressurised = carPatch.set.cabinPressurised;
      }
      if (carPatch.set.dwellCarCallS !== undefined) car.dwellCarCallS = carPatch.set.dwellCarCallS;
      if (carPatch.set.dwellHallCallS !== undefined) car.dwellHallCallS = carPatch.set.dwellHallCallS;
    }
  }
  /*
   * **Per-bank equipment: the counterweight and the drive** — GitHub issue #431, `DECISIONS.md` § D539.
   *
   * This is the scenario editor's non-test writer of `BankConfig.counterweightBalanceRatio` and
   * `BankConfig.regenerativeDrive`. Written as declared, exactly as a pressurised cabin is above: the
   * loader enforces the ratio's range and resolves the drive's recovery, and `Simulation` prices the
   * bank's moves by both. Neither reaches a dispatcher, so this is the one patch in the table that can
   * move a verdict without moving a leg — which is the owner's ruling, not an accident of the seam.
   */
  for (const equipment of patch.bankEquipment ?? []) {
    for (const bank of banksOf(doc, equipment.bankIds)) {
      if (equipment.set.counterweightBalanceRatio !== undefined) {
        bank['counterweightBalanceRatio'] = equipment.set.counterweightBalanceRatio;
      }
      if (equipment.set.regenerativeDrive !== undefined) {
        bank['regenerativeDrive'] = equipment.set.regenerativeDrive;
      }
      /*
       * **The rope** — GitHub issue #433, § D583. Written as declared, exactly as the two above are
       * and for the same reason a pressurised cabin is written where it buys nothing: the config
       * must say what the building has. A class the data directory does not carry, or one too short
       * for this shaft's travel, is refused by `parseBuilding` when the run is planned rather than
       * twice with two messages — and the second of those refusals is the only hard travel ceiling
       * in the project, so a patch that re-ropes a supertall down a tier really can make the
       * building fail to load. That is the constraint, not a defect in this seam.
       */
      if (equipment.set.ropeClass !== undefined) {
        bank['ropeClass'] = equipment.set.ropeClass;
      }
    }
  }
  for (const added of patch.addCars ?? []) {
    const bank = (doc.banks ?? []).find((candidate) => candidate.id === added.bankId);
    if (bank === undefined) {
      throw new Error(`fixit: a patch adds a car to bank "${added.bankId}", which this building does not have.`);
    }
    const copied = bank.cars.find((candidate) => candidate.id === added.copyCarId);
    if (copied === undefined) {
      throw new Error(`fixit: a patch copies car "${added.copyCarId}", which bank "${added.bankId}" does not have.`);
    }
    bank.cars.push({ ...structuredClone(copied), id: added.id });
  }
}

/** Merge dispatcher sections over the base profile — each section shallow, replace-by-key. */
function applyDispatcherPatches(
  base: DispatcherProfile,
  patches: readonly FixitPatch[],
): DispatcherProfile {
  let profile: DispatcherProfile = base;
  for (const patch of patches) {
    const dispatcher = patch.dispatcher;
    if (dispatcher === undefined) continue;
    profile = {
      ...profile,
      ...(dispatcher.idle === undefined ? {} : { idle: { ...profile.idle, ...dispatcher.idle } }),
      ...(dispatcher.dispatch === undefined ? {} : { dispatch: { ...profile.dispatch, ...dispatcher.dispatch } }),
      ...(dispatcher.answer === undefined ? {} : { answer: { ...profile.answer, ...dispatcher.answer } }),
    } as DispatcherProfile;
  }
  return profile;
}

/**
 * What the editor bought, as a patch — § 9's machinery step sizes, § 10.3's parking, and § 10.3's
 * elevation control.
 *
 * It is placed **last** in the patch list, so an editor control wins over a repair that set the
 * same field. That is the right way round: a repair is an offer the case authored and the editor is
 * the player's own hand on the same building.
 *
 * Zoning is not here, and cannot be: `building.banks[]` is a *replacement* array, so widening a
 * range needs the banks the repairs left behind and the building's own floor order. It is applied
 * in {@link configOf} against the patched document instead — {@link applyZoneOverlap}. The
 * elevation control needs no such thing — it names one floor by id and adds to it — so it travels as
 * a real `FixitPatch.building.floors` entry, merged with the speed step's `cars` under one
 * `building` key rather than losing one to the other under a naive spread.
 *
 * `topFloorId` is `undefined` for a building `fixitRunPlanOf` could not find (which `configOf`
 * refuses on its own next line anyway) — the raise is silently dropped rather than thrown here, so
 * the clearer error is the one `configOf` gives.
 */
function editorPatchOf(
  state: FixitState,
  topFloorId: string | undefined,
  tenancy: FixitCase['asBuilt']['tenancy'],
): FixitPatch {
  /*
   * The tenancy positions — § D1001 — and only ever the positions the case authors, through
   * `families.ts#tenancyWatchedOf`. A case with no tenancy contributes nothing here, whatever the
   * state carries.
   */
  const watched = tenancyWatchedOf(tenancy, state.tenancyPositions);
  /*
   * The door hold travels as ordinary car patches, after the speed step, so a car's own hold wins
   * over the every-car one — `fixit/families.ts#doorDwellPatchesOf` orders them. § D1000.
   */
  const carPatches = [
    ...(state.speedSteps === 0
      ? []
      : [{ carIds: ['*'], set: { ratedSpeedDeltaMps: 0.5 * state.speedSteps } }]),
    ...doorDwellPatchesOf(state.doorDwell),
  ];
  const buildingPatch: NonNullable<FixitPatch['building']> = {
    ...(carPatches.length === 0 ? {} : { cars: carPatches }),
    ...(watched.length === 0 ? {} : { floorPopulations: watched }),
    ...(state.topFloorRaiseM <= 0 || topFloorId === undefined
      ? {}
      : { floors: [{ floorIds: [topFloorId], heightDeltaM: state.topFloorRaiseM }] }),
  };
  const parking =
    state.parkingStrategy === null
      ? {}
      : { dispatcher: { idle: { parkingStrategy: state.parkingStrategy } } };
  return {
    ...(Object.keys(buildingPatch).length === 0 ? {} : { building: buildingPatch }),
    ...parking,
  };
}

/* -------------------------------------------------------------------------- *
 * Section 10.3's zones and service ranges — issue #422
 * -------------------------------------------------------------------------- */

/**
 * The widest overlap the editor offers. Three floors either side of every boundary is already a
 * substantial rezone on the shipped towers, and the cap is here rather than in the screen so both
 * surfaces and the pricing agree about what the control can reach.
 */
export const ZONE_OVERLAP_MAX = 3;

/** What the widening rule needs to know about a bank. Both callers map into this. */
interface ZoneBank {
  readonly servesFloors: readonly string[];
  /** Double-deck banks are left alone — see {@link widenedRangesOf}. */
  readonly paired: boolean;
}

/**
 * **The one statement of what a zoning step does**, shared by the control's ceiling and by the run.
 *
 * Each bank's served floors form one or more contiguous runs in the building's own floor order. A
 * step of `floors` grows **every** run by that many positions at each end, and keeps only floors
 * **some bank already serves**. That last clause is the whole of what makes this an *overlap* rather
 * than an invention: a bank never acquires a landing no shaft in the building opens onto, so the
 * result is a redrawn boundary between existing zones and not a claim about steel nobody cut.
 *
 * Growing every run rather than only the outermost is what makes it work on a real tower. A high
 * bank that serves the lobby and floors 12-20 spans the building end to end, so an outermost-only
 * rule would find nowhere to grow and the control would sit dead on the case section 10.3 is most
 * about. By runs, its 12-20 run reaches down into the gap the low bank is drowning in.
 *
 * **Double-deck banks are returned unchanged.** `BankConfig.servesFloorPairs` is the authored
 * geometry and `servesFloors` is documented as its flattened union, so widening one without the
 * other writes a building whose two statements disagree. Pairing floors is a decision about deck
 * separation in metres, which is a designer's, not a side effect of a step on this screen.
 */
function widenedRangesOf(
  floorOrder: readonly string[],
  banks: readonly ZoneBank[],
  floors: number,
): readonly (readonly string[])[] {
  const positionOf = new Map(floorOrder.map((id, index) => [id, index]));
  const servedSomewhere = new Set(banks.flatMap((bank) => [...bank.servesFloors]));
  return banks.map((bank) => {
    if (floors <= 0 || bank.paired) return bank.servesFloors;
    const own = new Set(bank.servesFloors);
    const positions = [...own]
      .map((id) => positionOf.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b);
    if (positions.length === 0) return bank.servesFloors;
    const grown = new Set(own);
    /* Walk the sorted positions, closing each contiguous run and growing it at both ends. */
    let runStart = positions[0]!;
    for (let i = 0; i <= positions.length; i += 1) {
      const here = positions[i];
      const previous = positions[i - 1];
      if (here !== undefined && previous !== undefined && here === previous + 1) continue;
      if (previous !== undefined) {
        for (let k = 1; k <= floors; k += 1) {
          for (const at of [runStart - k, previous + k]) {
            const id = floorOrder[at];
            if (id !== undefined && servedSomewhere.has(id)) grown.add(id);
          }
        }
      }
      if (here !== undefined) runStart = here;
    }
    /* Kept in the building's own floor order, so the same step always writes the same array. */
    return floorOrder.filter((id) => grown.has(id));
  });
}

/**
 * **How far the control can actually be stepped on this building, and 0 when it cannot be.**
 *
 * Both fix-it surfaces draw the stepper only as far as this, and do not draw it at all at 0. That is
 * the section D219 half a screen owes: eight of the eighteen shipped cases run a **single-bank**
 * building, where every floor a bank could grow into it already serves, so a zoning control there
 * would be a press that writes a field and changes nothing. A control that cannot bind is not shown
 * claiming it can.
 *
 * The ceiling is the largest step that still adds a floor **the step before it did not**, so no rung
 * of the stepper is inert either — a boundary that has already met its neighbour stops the count
 * rather than offering two more presses that redraw the same array.
 */
export function zoneOverlapCeilingOf(building: ResolvedBuilding): number {
  const floorOrder = building.floors.map((floor) => floor.id);
  const banks: readonly ZoneBank[] = building.banks.map((bank) => ({
    servesFloors: bank.servesFloors,
    paired: bank.servesFloorPairs !== undefined,
  }));
  const signature = (floors: number): string =>
    JSON.stringify(widenedRangesOf(floorOrder, banks, floors));
  let previous = signature(0);
  let ceiling = 0;
  for (let floors = 1; floors <= ZONE_OVERLAP_MAX; floors += 1) {
    const next = signature(floors);
    if (next === previous) break;
    ceiling = floors;
    previous = next;
  }
  return ceiling;
}

/* -------------------------------------------------------------------------- *
 * Section 10.3's elevation — issue #422
 * -------------------------------------------------------------------------- */

/**
 * The most the elevation control will raise the top floor by. Small next to any shipped bank's
 * travel — every bank below `data/elevator-specs.json#airPressure.appliesAboveTravelM` (300 m)
 * except `vertical-city`'s shuttle (307.5 m) and `burj-class-reference`'s (496.0 m), and every rope
 * class's `maxSingleTravelM` in the hundreds — so it is a real, measurable move without being a
 * quantity that would need its own bracketed derivation the way `rope-upgrade`'s did.
 */
export const TOP_FLOOR_RAISE_MAX_M = 5;

/**
 * The building's topmost floor id that the elevation control may actually name, or `undefined`
 * where none qualifies.
 *
 * **Not simply `building.floors.at(-1)?.id`** — GitHub issue #422, found by a real building rather
 * than reasoned about. `applyBuildingPatch` looks a floor up in the *authored document's* own
 * `floors` array, and a tall building's topmost levels are routinely declared as a compact
 * `floorRanges` entry rather than as explicit `FloorConfig`s (`config/expandFloors.ts` is the
 * expansion, and it runs after a patch would need to have already found the floor). Two of the
 * seven buildings `data/fixit-cases.json` runs — `vertical-city` and `mixed-use-high-rise` — declare
 * their topmost floor exactly that way. So the topmost floor only qualifies when it is **also** one
 * of `ResolvedBuilding.config`'s own explicit `floors` — the authored config carried on the
 * resolution, `resolveBuilding`'s own "exactly as authored" copy — which is what
 * `applyBuildingPatch` will actually find.
 */
export function topFloorIdOf(building: ResolvedBuilding): string | undefined {
  const top = building.floors.at(-1);
  if (top === undefined) return undefined;
  const authoredExplicitly = (building.config.floors ?? []).some((floor) => floor.id === top.id);
  return authoredExplicitly ? top.id : undefined;
}

/**
 * **How far the elevation control can actually be stepped on this building, and 0 when it cannot
 * be** — `zoneOverlapCeilingOf`'s own shape, pointed at the topmost floor.
 *
 * Three grounds, all about the *building* rather than about the budget, and all `0`:
 *
 * - **the topmost floor is a `floorRanges` level rather than an explicit one.** {@link topFloorIdOf}
 *   says why; a control offered there would name a floor `applyBuildingPatch` cannot find.
 * - **no bank serves the topmost floor.** A vanishingly unlikely shape on a shipped tower, but a
 *   press that writes a field and changes no leg is § D219's defect wherever it could occur.
 * - **the topmost floor is one half of a double-deck pair.** `BankConfig.servesFloorPairs` requires
 *   each pair to sit exactly `deckSeparationM` apart; raising one deck's floor alone would move it
 *   off that separation, which `parseBuilding` would refuse. Better to report `0` than to offer a
 *   stepper that throws on its own first press.
 *
 * Otherwise {@link TOP_FLOOR_RAISE_MAX_M} — flat, unlike the zoning stepper's per-building ceiling,
 * because every rung the control can reach moves a real riser: there is no "the boundary has already
 * met its neighbour" case to stop early at.
 */
export function topFloorRaiseCeilingOf(building: ResolvedBuilding): number {
  const topId = topFloorIdOf(building);
  if (topId === undefined) return 0;
  const servedByABank = building.banks.some((bank) => bank.servesFloors.includes(topId));
  if (!servedByABank) return 0;
  const partOfAPair = building.banks.some((bank) =>
    (bank.servesFloorPairs ?? []).some((pair) => pair.includes(topId)),
  );
  if (partOfAPair) return 0;
  return TOP_FLOOR_RAISE_MAX_M;
}

/**
 * **Where this case's idle cars already wait** — what `FixitState.parkingStrategy: null` means, read
 * off the run rather than guessed.
 *
 * It is a fact about the **case**, not about the profile: two shipped cases patch
 * `idle.parkingStrategy` in their as-built delta and a third parks at a fixed floor, so the standing
 * order the player is editing against is the profile *after* the as-built patch. Taking it from the
 * as-built `SimulationConfig` — the object both surfaces already build — is the only reading that
 * cannot drift from what actually runs.
 *
 * Both surfaces use it to leave that strategy **out of the select**, because offering it would be a
 * press that writes the value the run already carries. Measured: on `zoning-starves-the-top` the
 * standing order is `stay`, and selecting `stay` moves not one leg.
 */
export function standingParkingOf(asBuilt: SimulationConfig): ParkingStrategy {
  return asBuilt.dispatcherProfile.idle?.parkingStrategy ?? DISPATCH_DEFAULTS.parkingStrategy;
}

/**
 * Apply the editor's zoning step to a patched document.
 *
 * The floor order is the **authored building's resolved** one rather than the document's own array:
 * a document may write floors as ranges, and `BuildingPatch` has no floors field at all, so no patch
 * can add, remove or reorder a floor. The order is therefore invariant across every patch a case can
 * carry, and taking it from the resolution the loader already produced costs nothing.
 */
function applyZoneOverlap(
  doc: MutableBuildingDocument,
  floorOrder: readonly string[],
  floors: number,
): void {
  if (floors <= 0) return;
  const banks = doc.banks ?? [];
  if (banks.length === 0) return;
  const widened = widenedRangesOf(
    floorOrder,
    banks.map((bank) => ({
      servesFloors: (bank['servesFloors'] as string[] | undefined) ?? [],
      paired: bank['servesFloorPairs'] !== undefined,
    })),
    floors,
  );
  banks.forEach((bank, index) => {
    bank['servesFloors'] = [...(widened[index] ?? [])];
  });
}

/**
 * Capacity steps change `ratedLoadLb` directly rather than through {@link CarPatch}'s whitelist:
 * +300 lb is +2 places at the load table's own 150 lb seat, which is the contract's step.
 */
function applyCapacitySteps(doc: MutableBuildingDocument, steps: number): void {
  if (steps === 0) return;
  for (const car of carsOf(doc, ['*'])) {
    if (typeof car.ratedLoadLb !== 'number') {
      throw new Error(`fixit: car "${car.id}" declares no ratedLoadLb for a capacity step to add to.`);
    }
    car.ratedLoadLb += 300 * steps;
    if (typeof car['ratedLoadLbPerDeck'] === 'number') {
      car['ratedLoadLbPerDeck'] = (car['ratedLoadLbPerDeck'] as number) + 150 * steps;
    }
  }
}

/* -------------------------------------------------------------------------- *
 * The two configs
 * -------------------------------------------------------------------------- */

/**
 * What building a case needs from the loaded `data/` — a structural subset of
 * `dev/data.ts#BrowserResources`, declared here so this module (and its Node-side validation
 * suite) does not depend on the browser loader to describe the same five facts.
 */
export interface FixitResources {
  /** Authored document beside its resolution — `BuildingEntry`'s shape. */
  readonly entries: readonly { readonly config: BuildingConfig; readonly resolved: ResolvedBuilding }[];
  readonly elevatorSpecs: ElevatorSpecs;
  readonly trafficProfiles: TrafficProfiles;
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly trafficProfileIds: ReadonlySet<string>;
}

/** The pair of configs a case is scored on. Pure — nothing here runs anything. */
export interface FixitRunPlan {
  readonly asBuilt: SimulationConfig;
  readonly asRepaired: SimulationConfig;
}

/**
 * Build both configs. Everything the passenger trace is a function of — building id, seed,
 * horizon, demand — comes off the **case** and is identical between the two; only the patches
 * differ, which is what sharing the traffic seed buys.
 */
export function fixitRunPlanOf(
  entry: FixitCase,
  state: FixitState,
  resources: FixitResources,
): FixitRunPlan {
  const repairPatches = entry.repairs
    .filter((repair) => state.selectedRepairIds.includes(repair.id))
    .map((repair) => repair.patch);
  /*
   * The elevation control needs the topmost floor's id before `configOf` has built anything — it
   * travels as a real patch entry, unlike zoning, which is applied against the patched document
   * `configOf` builds. Looked up here rather than passed down from a caller that already resolved
   * it, on the same ground `configOf`'s own `authored` lookup rests on: the case names its building
   * and the resources carry it, or `configOf` refuses below anyway.
   */
  const authored = resources.entries.find((candidate) => candidate.resolved.id === entry.buildingId);
  const topFloorId = authored === undefined ? undefined : topFloorIdOf(authored.resolved);
  const asBuilt = configOf(entry, [entry.asBuilt.patch], NO_EDITOR, resources);
  return {
    asBuilt,
    asRepaired: configOf(
      entry,
      [entry.asBuilt.patch, ...repairPatches, editorPatchOf(state, topFloorId, entry.asBuilt.tenancy)],
      {
        capacitySteps: state.capacitySteps,
        zoneOverlapFloors: state.zoneOverlapFloors,
        carBanks: state.carBanks,
        bankFloors: state.bankFloors,
        platedBankIds: state.platedBankIds,
        dispatcherDials: state.dispatcherDials,
      },
      resources,
      asBuilt.building,
    ),
  };
}

/**
 * **Why this selection cannot run, or `undefined` when it can** — § D1000.
 *
 * The five families write a banks array, car doors and a dispatcher the loader and core then have
 * to accept: a bank left with no car, a keyed car drawn with one floor, an adaptive dwell ceiling
 * below a door hold the same order just set. Each is refused by `parseBuilding`, `resolveBuilding`
 * or `controls/editedProfile.ts` with its own message, and this is that message, taken **before**
 * anything runs, so both surfaces can hold the Run press and say why rather than throwing on it.
 */
export function fixitPlanRefusalOf(
  entry: FixitCase,
  state: FixitState,
  resources: FixitResources,
): string | undefined {
  /*
   * **Remembered for the last order asked about.** Both surfaces ask twice for one order — the
   * families card on the redraw, the Run press before it starts the pair — and planning resolves the
   * whole building each time, which on `vertical-city` is tens of milliseconds on the thread that
   * paints. Keyed on the case, its budget and the order itself, never on object identity: the
   * Everyday screen hands a fresh case object per read once a budget rung is bought.
   */
  const key = `${entry.id}|${String(entry.budgetUnits)}|${JSON.stringify(state)}`;
  if (lastRefusal !== undefined && lastRefusal.key === key && lastRefusal.resources === resources) {
    return lastRefusal.answer;
  }
  let answer: string | undefined;
  try {
    fixitRunPlanOf(entry, state, resources);
    answer = undefined;
  } catch (error) {
    answer = error instanceof Error ? error.message : String(error);
  }
  lastRefusal = { key, resources, answer };
  return answer;
}

let lastRefusal:
  | { readonly key: string; readonly resources: FixitResources; readonly answer: string | undefined }
  | undefined;

/**
 * The editor's two fabric selections — the pair that cannot travel as a {@link FixitPatch}, because
 * one edits every car's plated load and the other replaces an array it must first read.
 */
interface EditorFabric
  extends Pick<FixitState, 'carBanks' | 'bankFloors' | 'platedBankIds' | 'dispatcherDials'> {
  readonly capacitySteps: number;
  readonly zoneOverlapFloors: number;
}

/** The as-built side buys nothing, and says so by name rather than by zeroes at a call site. */
const NO_EDITOR: EditorFabric = Object.freeze({
  capacitySteps: 0,
  zoneOverlapFloors: 0,
  carBanks: {},
  bankFloors: {},
  platedBankIds: [],
  dispatcherDials: {},
});

/**
 * **A crowd change thins the as-built trace; it never re-draws it** — GitHub issue #601,
 * `DECISIONS.md` § D1076.
 *
 * The case's own as-built patch writes its populations into the document, because that is the
 * building the complaint is about. Every *later* population — a crowd-moving repair, an authored
 * tenancy position — is taken off the patches before they reach the document and returned here as
 * `core`'s `crowdThinning`: each named floor keeps `later / as-built` of the journeys its population
 * generated, on the `thinning` stream, so the people who stay are the as-built run's people leg for
 * leg. Written into the document instead, one person off one floor re-drew every interfloor weight
 * and the pair met two different crowds: after removing one floor, 0 of 214, 0 of 233 and 0 of 245
 * legs that never touched it survived (DECIDE-3's measurement, GitHub issue #601).
 *
 * `asBuilt` is `undefined` for the as-built config itself, which has no later patch to thin by. A
 * later population above the as-built one is refused, because thinning removes people and cannot add
 * any, and `fixit/parse.ts` already refuses a position that raises a headcount. Reading populations
 * off the **resolved** as-built building is also what closes the `floorRanges` gap for these
 * patches: a floor declared through a range has its population there like any other.
 */
function crowdThinningOf(
  entry: FixitCase,
  laterPatches: readonly FixitPatch[],
  asBuilt: ResolvedBuilding,
): CrowdThinning | undefined {
  const target = new Map<string, number>();
  for (const patch of laterPatches) {
    for (const population of patch.building?.floorPopulations ?? []) {
      for (const floorId of population.floorIds) target.set(floorId, population.population);
    }
  }
  if (target.size === 0) return undefined;
  const keepShareByFloor: Record<string, number> = {};
  for (const [floorId, population] of target) {
    const floor = asBuilt.floorsById.get(floorId);
    if (floor === undefined) {
      throw new Error(`fixit: case "${entry.id}" sets the population of floor "${floorId}", which this building does not declare as a floor.`);
    }
    if (population > floor.population) {
      throw new Error(
        `fixit: case "${entry.id}" raises floor "${floorId}" from ${String(floor.population)} to ${String(population)} people. A crowd change thins the as-built crowd and cannot add anybody to it.`,
      );
    }
    if (population < floor.population) keepShareByFloor[floorId] = population / floor.population;
  }
  return Object.keys(keepShareByFloor).length === 0 ? undefined : { keepShareByFloor };
}

/** The patches with their populations taken off, for {@link crowdThinningOf}'s reason. */
function withoutPopulations(patch: FixitPatch): FixitPatch {
  const building = patch.building;
  if (building?.floorPopulations === undefined) return patch;
  const { floorPopulations: _moved, ...rest } = building;
  return { ...patch, building: rest };
}

function configOf(
  entry: FixitCase,
  patches: readonly FixitPatch[],
  editor: EditorFabric,
  resources: FixitResources,
  asBuiltBuilding?: ResolvedBuilding,
): SimulationConfig {
  const authored = resources.entries.find((candidate) => candidate.resolved.id === entry.buildingId);
  if (authored === undefined) {
    throw new Error(`fixit: case "${entry.id}" names building "${entry.buildingId}", which this build does not ship.`);
  }
  const baseProfile = resources.dispatcherProfiles.profiles.find(
    (candidate) => candidate.id === entry.dispatcherProfileId,
  );
  if (baseProfile === undefined) {
    throw new Error(`fixit: case "${entry.id}" names dispatcher "${entry.dispatcherProfileId}", which this build does not ship.`);
  }

  /*
   * The first patch is always the case's as-built one (`fixitRunPlanOf` builds both lists that way);
   * on the repaired side every patch after it has its populations moved into a thinning.
   */
  const [asBuiltPatch, ...laterPatches] = patches;
  const crowdThinning =
    asBuiltBuilding === undefined ? undefined : crowdThinningOf(entry, laterPatches, asBuiltBuilding);
  const fabricPatches =
    asBuiltBuilding === undefined || asBuiltPatch === undefined
      ? patches
      : [asBuiltPatch, ...laterPatches.map(withoutPopulations)];
  const doc = structuredClone(authored.config) as unknown as MutableBuildingDocument;
  for (const patch of fabricPatches) {
    if (patch.building !== undefined) applyBuildingPatch(doc, patch.building);
  }
  /*
   * The rezone before the capacity step and the zoning overlap, so a car moved into a bank is
   * widened with it and an overlap grows from the boundaries the player drew — § D1000.
   */
  const floorOrder = authored.resolved.floors.map((floor) => floor.id);
  applyRezone(doc, editor, authored.config, floorOrder);
  applyCapacitySteps(doc, editor.capacitySteps);
  /*
   * After the repairs, deliberately: a rezone the player draws in the editor overlaps whatever
   * boundaries the selected repairs left, not the ones the case shipped with.
   */
  applyZoneOverlap(doc, floorOrder, editor.zoneOverlapFloors);
  // The same door a shipped file enters by — parse, then resolve against the loaded specs.
  const file = `${entry.buildingId}.json`;
  const building: ResolvedBuilding = resolveBuilding(
    parseBuilding(doc, file),
    resources.elevatorSpecs,
    { file, trafficProfileIds: resources.trafficProfileIds },
  );

  return {
    building,
    /*
     * The dials last and on the resolved building, because two of their dimensions are bounded by
     * a car rather than by another dial (`controls/editedProfile.ts`, issue #475) — and the car
     * they are bounded by is the one the door-hold setting above may just have changed.
     */
    dispatcherProfile: profileWithDials(applyDispatcherPatches(baseProfile, patches), editor.dispatcherDials, {
      building,
      elevatorSpecs: resources.elevatorSpecs,
    }),
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    dispatcherProfiles: resources.dispatcherProfiles,
    seed: BigInt(entry.run.seed),
    durationS: entry.run.durationS,
    // Three of the five shipped buildings routinely end a run with people still aboard;
    // under `throw` there is no recording to score. `stageRun.ts`'s reason, verbatim.
    onTimeout: 'report',
    ...(entry.run.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: entry.run.arrivalRatePctPop5min } }),
    ...(crowdThinning === undefined ? {} : { crowdThinning }),
  };
}

/**
 * `recordRun`'s switches for a fixit run, settled once and passed by every caller.
 *
 * Decisions are **not** recorded: two runs' worth would be carried to no reader, and since issue
 * #165 they would be carried across a thread boundary to no reader. No car is held out of service
 * — a case's fabric patch is the whole of what it changes, and a held car would be a second,
 * unstated edit to the building the complaint is about.
 *
 * Stated here rather than defaulted on the far side, which is `dev/shiftRunner.ts`'s own rule for
 * the same two fields: *passed rather than defaulted so the far side decides nothing*. It is also
 * why `dev/offThreadRuns.ts` requires both — a default of `false` there would have silently
 * changed the Watch surface's recording, which wants them.
 */
export const FIXIT_RUN_SWITCHES = Object.freeze({
  recordDecisions: false,
  outOfServiceCarIds: Object.freeze([]) as readonly string[],
});

/* -------------------------------------------------------------------------- *
 * Measurement — the complaint and the rest, from the legs
 * -------------------------------------------------------------------------- */

function inScope(leg: VizLeg, scope: ComplaintScope): boolean {
  switch (scope.mode) {
    case 'origin':
      return scope.floorIds.includes(leg.originFloorId);
    case 'touches':
      return (
        scope.floorIds.includes(leg.originFloorId) || scope.floorIds.includes(leg.destinationFloorId)
      );
    case 'origin-to-destination':
      return (
        scope.floorIds.includes(leg.originFloorId) &&
        (scope.destinationFloorIds ?? []).includes(leg.destinationFloorId)
      );
  }
}

/** One run's scoped readings. Turned-away legs are outside both halves — they never waited. */
interface RunReadings {
  readonly scopeLegs: number;
  readonly scopeBoarded: number;
  readonly longWaits: number;
  readonly meanWaitS: number | null;
  readonly worstWaitS: number | null;
  readonly restBoarded: number;
  readonly restAwayPct: number | null;
}

function readingsOf(recording: VizRecording, measure: ComplaintMeasure): RunReadings {
  let scopeLegs = 0;
  let scopeBoarded = 0;
  let longWaits = 0;
  let waitSum = 0;
  let worst: number | null = null;
  let restBoarded = 0;
  let restUnder = 0;
  for (const leg of recording.legs) {
    if (leg.refusedAt !== undefined) continue;
    const wait = leg.boardedAt === undefined ? undefined : leg.boardedAt - leg.arrivedAt;
    if (inScope(leg, measure.scope)) {
      scopeLegs += 1;
      if (wait === undefined) {
        // A leg the run outlived is not a short wait: it counts against the complaint.
        longWaits += 1;
      } else {
        scopeBoarded += 1;
        waitSum += wait;
        if (wait >= measure.thresholdS) longWaits += 1;
        if (worst === null || wait > worst) worst = wait;
      }
    } else if (wait !== undefined) {
      restBoarded += 1;
      if (wait < measure.thresholdS) restUnder += 1;
    }
  }
  return {
    scopeLegs,
    scopeBoarded,
    longWaits,
    meanWaitS: scopeBoarded === 0 ? null : waitSum / scopeBoarded,
    worstWaitS: worst,
    restBoarded,
    restAwayPct: restBoarded === 0 ? null : (restUnder / restBoarded) * 100,
  };
}

function complaintValueOf(readings: RunReadings, measure: ComplaintMeasure): number | null {
  return measure.kind === 'long-waits' ? readings.longWaits : readings.meanWaitS;
}

/** The § 10.4 measurement over the pair. The engine's `classifyOutcome` consumes this. */
export function measuredOf(
  entry: FixitCase,
  before: VizRecording,
  after: VizRecording,
): FixitMeasurement {
  const measure = entry.complaint.measure;
  const b = readingsOf(before, measure);
  const a = readingsOf(after, measure);
  const complaintBefore = complaintValueOf(b, measure);
  const complaintAfter = complaintValueOf(a, measure);
  const same = sameCrowd(before, after);
  const gone =
    complaintBefore === null || complaintBefore <= 0 || complaintAfter === null
      ? null
      : Math.max(0, ((complaintBefore - complaintAfter) / complaintBefore) * 100);
  return {
    complaintBefore: complaintBefore ?? 0,
    complaintAfter: complaintAfter ?? 0,
    scopeBoardedBefore: b.scopeBoarded,
    scopeBoardedAfter: a.scopeBoarded,
    complaintGonePct: gone,
    restAwayBeforePct: b.restAwayPct,
    restAwayAfterPct: a.restAwayPct,
    restBoardedBefore: b.restBoarded,
    restBoardedAfter: a.restBoarded,
    restDeltaPoints:
      b.restAwayPct === null || a.restAwayPct === null ? null : a.restAwayPct - b.restAwayPct,
    sameCrowd: same,
    /*
     * Read off the legs, like `sameCrowd`: a crowd the second run met people in that the first did
     * not is a re-drawn one rather than a thinned one, and only a change to the building's trips
     * can produce it (`assertPairMatchesRepairs` holds that). It picks the basis line.
     */
    crowdRedrawn: !same && crowdAddedOf(before, after).length > 0,
  };
}

/**
 * **One morning's reading, as the replication judge pairs it** — [§ D1020](../../../../DECISIONS.md).
 *
 * The three numbers `fixit/judge.ts#judgeReplication` needs from one run and nothing else, read by
 * the same {@link readingsOf} the pair's {@link measuredOf} reads, so a morning and the letter's
 * morning cannot be measured two ways. Small on purpose: the forty-nine mornings are simulated on a
 * worker (`dev/morningWorker.ts`) and a recording is megabytes of legs, so what crosses the thread
 * boundary is this and never the run.
 *
 * `complaint` is `null` only on a `mean-wait` case whose scope boarded nobody — a mean over no
 * journeys, which the judge leaves out of its interval and counts as left out rather than reading
 * as zero.
 */
export interface MorningReading {
  readonly complaint: number | null;
  readonly restAwayPct: number | null;
  readonly restBoarded: number;
}

export function morningReadingOf(recording: VizRecording, measure: ComplaintMeasure): MorningReading {
  const readings = readingsOf(recording, measure);
  return {
    complaint: complaintValueOf(readings, measure),
    restAwayPct: readings.restAwayPct,
    restBoarded: readings.restBoarded,
  };
}

/**
 * Hold the pair's **claim** and its **legs** to each other — GitHub issue #350's fix-it site.
 *
 * The claim is the patch: a selection with no crowd-changing repair claims the same crowd on both
 * sides (§ 10.4's basis), and one carrying a demand-side repair claims a different one. The legs
 * are the fact. Asserted in **both** directions, because each is a real defect: a pair that stopped
 * sharing its crowd with no population patch means something other than population reached the
 * trace, and a population patch that left every leg in place means the repair the player bought
 * moved nobody. Called at both press sites on the commit the pair lands, before the outcome is
 * classified, so a red names the fix-it pair and the case. Since GitHub issue #601 a crowd change is
 * also held to being a **thinning**: nobody on the repaired side the as-built side did not meet.
 */
export function assertPairMatchesRepairs(
  entry: FixitCase,
  state: FixitState,
  before: VizRecording,
  after: VizRecording,
  plan?: FixitRunPlan,
): void {
  const pair = `the fix-it pair on case "${entry.id}"`;
  /*
   * **A change to which trips the lifts can carry re-draws the crowd, and that is not a defect** —
   * [§ D1160](../../../../DECISIONS.md), the post-AJ panel's seat C D1. The traffic generator removes every trip no chain
   * of banks can carry and shares its demand over the trips that remain
   * (`core/traffic/generator.ts`, *Conservation, when a trip turns out to be impossible*). So on
   * `zoning-starves-the-top`, whose two banks meet only at the lobby and the car park, one floor of
   * overlap opens trips between the low floors and the high ones, the destination tables change,
   * and the repaired run meets a crowd drawn for the building as rezoned: passenger p19 on floor 2
   * went to 10 as built and to 18 after. That is the model working. The press site passes its
   * plan, and where the two buildings do not carry the same trips the pair makes no crowd claim at
   * all; the basis line is then read off the legs (`engine.ts#ROUTES_BASIS_LINE`). A caller that
   * passes no plan gets the strict check, which is every test that pairs two runs by hand.
   */
  if (plan !== undefined && tripsTheRoutesChangeOf(plan) > 0) return;
  if (selectionKeepsTheCrowd(entry, state)) {
    assertSameCrowd(before, after, pair);
    return;
  }
  if (crowdDifferencesOf(before, after).length === 0) {
    throw new Error(
      `${pair} selected a repair that patches floorPopulations, and the two runs met the same crowd anyway — the repair moved nobody, so the sentence the outcome prints about it would be false.`,
    );
  }
  /*
   * GitHub issue #601, § D1076: a crowd change thins the as-built crowd, so everyone the repaired run
   * met is somebody the as-built run met, on the same instant and floors.
   */
  const added = crowdAddedOf(before, after);
  if (added.length > 0) {
    throw new Error(
      `${pair} changes the crowd by thinning it, and the second run met people the first did not: ${added.join('; ')}. A thinned crowd is the as-built crowd less some people, never a different one.`,
    );
  }
}

/**
 * **How many trips one building can carry and the other cannot** — the ordered floor pairs whose
 * route exists on one side of the plan and not on the other, or whose route has a lift leg on one
 * side and none on the other. `0` when the order leaves the building's routes alone, which is every
 * order that touches no bank's floors.
 *
 * Read with `core`'s own `RoutePlanner`, the one the traffic generator asks, so *"the lifts can
 * carry this trip"* means here exactly what it means when the crowd is drawn. Feasibility only, and
 * deliberately: on `vertical-city` a zoning step turns an escalator-then-lift journey into a lift
 * journey, which moves a route and moves nobody (§ D1075), and a count over route *shapes* would
 * have given up the crowd check on the one tower where it has already caught a defect.
 */
export function tripsTheRoutesChangeOf(plan: FixitRunPlan): number {
  const asBuilt = plan.asBuilt.building;
  const asRepaired = plan.asRepaired.building;
  if (asBuilt === asRepaired) return 0;
  const floors = asBuilt.floors.map((floor) => floor.id);
  const repairedFloors = new Set(asRepaired.floors.map((floor) => floor.id));
  const before = RoutePlanner.forBuilding(asBuilt);
  const after = RoutePlanner.forBuilding(asRepaired);
  /* 0: no route; 1: a route with no lift leg, which is not lift demand; 2: a lift trip. */
  const carried = (planner: RoutePlanner, from: string, to: string): number => {
    const route = planner.plan(from, to);
    return route === undefined ? 0 : route.elevatorLegCount === 0 ? 1 : 2;
  };
  let changed = 0;
  for (const from of floors) {
    for (const to of floors) {
      if (from === to) continue;
      if (!repairedFloors.has(from) || !repairedFloors.has(to)) {
        changed += 1;
        continue;
      }
      if (carried(before, from, to) !== carried(after, from, to)) changed += 1;
    }
  }
  return changed;
}

/* -------------------------------------------------------------------------- *
 * The four figures — computed from the as-built run, never authored
 * -------------------------------------------------------------------------- */

export interface FigureValue {
  readonly label: string;
  readonly text: string;
  readonly reading: FigureSpec['reading'];
}

/** § 10.1 item 3's four figures, each a measurement of the as-built run with its denominator. */
export function figureValuesOf(entry: FixitCase, asBuilt: VizRecording): readonly FigureValue[] {
  const readings = readingsOf(asBuilt, entry.complaint.measure);
  return entry.figures.map((figure) => ({
    label: figure.label,
    reading: figure.reading,
    text: figureText(figure, entry, readings),
  }));
}

function figureText(figure: FigureSpec, entry: FixitCase, readings: RunReadings): string {
  const measure = entry.complaint.measure;
  switch (figure.kind) {
    case 'complaint':
      return measure.kind === 'long-waits'
        ? `${String(readings.longWaits)} of ${String(readings.scopeLegs)} journeys`
        : meanText(readings);
    case 'scope-long-waits':
      return `${String(readings.longWaits)} of ${String(readings.scopeLegs)} journeys`;
    case 'scope-mean-wait':
      return meanText(readings);
    case 'scope-worst-wait':
      return readings.worstWaitS === null ? 'nobody boarded' : `${readings.worstWaitS.toFixed(0)} s`;
    case 'rest-away-pct':
      return readings.restAwayPct === null
        ? 'nobody else rode'
        : `${readings.restAwayPct.toFixed(1)} % of ${String(readings.restBoarded)} journeys`;
  }
}

function meanText(readings: RunReadings): string {
  return readings.meanWaitS === null
    ? 'nobody boarded'
    : `${readings.meanWaitS.toFixed(1)} s over ${String(readings.scopeBoarded)} boarded journeys`;
}
