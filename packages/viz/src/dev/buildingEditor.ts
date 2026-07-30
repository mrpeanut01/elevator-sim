/**
 * The building editor and its elevation, mounted — `docs/12-design-handoff.md` § 1.3 **M11**,
 * under § 4.5.
 *
 * ## Capacity, occupancy and population are three things
 *
 * `authoring/buildingSpec.ts` keeps them apart and this surface is why: *21 floors of 120* and
 * *21 floors, 62 % let* are the same building on paper and different buildings to move people
 * through. The spec column edits capacity; the elevation's per-floor bar edits **occupancy**, one
 * floor at a time; population is the product and is what `floors[].population` receives.
 *
 * ## Dragging a shaft's band is service zoning, not decoration
 *
 * A car's served floors are its **bank's** `servesFloors`, so a band that is not a contiguous slice
 * of a bank is not a building this loader will build. A drag therefore produces a *bank split* —
 * cars that share a band share a bank — and the legend redraws with two banks in it.
 * `CLAUDE.md` is explicit that the three zonings are distinct concepts, and this is the first of
 * them: physical reach, not a credential and not a dispatcher strategy.
 *
 * ## The rise limit is an advisory, and this editor must not say otherwise
 *
 * `config/parse.ts` raises a class's `maxRiseM` as guidance and **builds the bank anyway**. Saying
 * *the loader refuses this* would be a false claim about a mechanism — the defect class
 * `experiments/src/validation/documentation.test.ts` exists to catch one level up — so the warning
 * comes from `validateSpec`, whose sentence says advisory, and the loader's own warnings are shown
 * beside it rather than paraphrased.
 *
 * ## Two things the lobby row deliberately cannot do
 *
 * `buildingFromSpec` writes `floors[0].population = 0` and sets `isEntrance`, and it only marks a
 * transfer floor when `floor !== 0`. So on the lobby row the occupancy bar and the sky dot would
 * write fields nothing reads. They are drawn inert, with the reason in the tooltip, rather than
 * drawn live — `docs/05-roadmap.md`'s standing requirement applied to a control.
 *
 * ## Why the rows are built once
 *
 * The same reason `dispatcherEditor.ts` gives for its sliders: a pointer drag is held by the
 * element it started on, and a mount that replaces its rows on every state change releases the
 * capture after the first pixel. So the elevation's DOM is rebuilt only when its *shape* changes —
 * the floor count or the shaft count — and every render after that writes into the nodes already
 * there. `onHorizontalDrag`/`onVerticalDrag` return a teardown and every one of them is called
 * before a rebuild, so a redraw cannot leak a listener per row.
 */

import {
  parseBuilding,
  resolveBuilding,
  type ElevatorSpecs,
} from '@elevator-sim/core/browser';

import {
  BLANK_SPEC,
  RATED_LOADS,
  SPEC_ROWS,
  banksOf,
  bandOf,
  buildingAdvice,
  buildingFromSpec,
  buildingSummary,
  carLabelOf,
  floorIdOf,
  occupancyAt,
  occupancyLine,
  personsOf,
  populationAt,
  specFromBuilding,
  specIsDirty,
  validateSpec,
  type BuildingSpec,
  type SpecRow,
} from '../authoring/buildingSpec.js';
import { plainDescription, specFromClass, specsWithClass, type MachineClass } from '../authoring/machineSpec.js';

import {
  nextSavedId,
  sliderHandlesOf,
  updateSliderRow,
  type SliderHandles,
} from './dispatcherEditor.js';
import {
  chipRow,
  el,
  fill,
  onHorizontalDrag,
  onVerticalDrag,
  setHidden,
  setStyle,
  setText,
  slider,
} from './dom.js';
import { speedLadderOf } from './machinesEditor.js';
import type { BrowserResources } from './data.js';
import type { BuildingEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { allBuildingIds, allClasses, buildingConfigOf, classById } from './state.js';

/* -------------------------------------------------------------------------- *
 * Geometry constants
 * -------------------------------------------------------------------------- */

/** The elevation's occupancy bar runs 0–120 %. Above 100 is over design capacity. */
export const OCCUPANCY_MAX_PCT = 120;
/** The drag snaps to this, matching `SPEC_ROWS`'s own occupancy step. */
export const OCCUPANCY_STEP_PCT = 5;
/** Where design capacity sits on a 0–120 track, as a percentage of its width. */
export const CAPACITY_TICK_PCT = (100 / OCCUPANCY_MAX_PCT) * 100;

/**
 * Left edge of the shaft overlay, in pixels.
 *
 * The sum of the four fixed columns the elevation's header declares — 40 + 26 + 104 + 74 — plus the
 * 8 px row padding and the four 8 px gaps between them. A constant rather than a measurement
 * because the header's widths are in the stylesheet and the overlay has to line up with them; if
 * either moves, both move.
 */
export const SHAFT_LEFT_PX = 284;

const ROW_MIN_PX = 11;
const ROW_MAX_PX = 24;
/** How tall the scroller is allowed to get before the rows start scrolling inside it. */
const BODY_MAX_PX = 420;

/** Row height for a given floor count: as tall as fits, within the readable band. */
export function elevationRowHeightPx(rowCount: number): number {
  if (rowCount <= 0) return ROW_MAX_PX;
  return Math.min(ROW_MAX_PX, Math.max(ROW_MIN_PX, Math.floor(BODY_MAX_PX / rowCount)));
}

/**
 * Tints for the shaft bands, one per **bank**.
 *
 * Deliberately **not** the wait-age band palette (§ 1.1 S7). Those four colours are reserved for
 * every claim about how long somebody has stood, on every surface, and a shaft tinted amber here
 * would be a colour-coded assertion about a queue that does not exist. These are the transport's
 * phase hues and the accent, which carry no such meaning.
 */
export const SHAFT_TINTS: readonly string[] = Object.freeze([
  '#4f9ee8',
  '#c69ad8',
  '#9fc48a',
  '#dbb075',
  '#7fb6f0',
  '#c9a56a',
]);

export function shaftTintOf(bankIndex: number): string {
  return SHAFT_TINTS[bankIndex % SHAFT_TINTS.length] ?? '#4f9ee8';
}

/* -------------------------------------------------------------------------- *
 * The five spec rows — pure
 * -------------------------------------------------------------------------- */

/** The document field each row reaches, drawn under the slider. See `machinesEditor.ts`. */
export function specFieldOf(key: SpecRow['key']): string {
  switch (key) {
    case 'floors':
      return 'floors[] — plus the lobby, which is always floor 0';
    case 'floorHeightM':
      return 'floors[].heightM';
    case 'capacityPerFloor':
      return 'floors[].population = capacity × occupancy';
    case 'occupancyPct':
      return 'floors[].population = capacity × occupancy';
    case 'cars':
      return 'banks[].cars[]';
  }
}

export interface SpecRowView {
  readonly row: SpecRow;
  readonly heading: string;
  readonly raw: number;
  readonly value: string;
  readonly sub: string;
  readonly subColor: string;
  /** `true` for the occupancy row when the building is let past its design capacity. */
  readonly overCapacity: boolean;
  /** The CSS background for the 3 px track under the slider, or `''` when the row has none. */
  readonly track: string;
}

export function specRowsOf(spec: BuildingSpec): readonly SpecRowView[] {
  let group = '';
  return SPEC_ROWS.map((row): SpecRowView => {
    const heading = row.group === group ? '' : row.group;
    group = row.group;
    const raw = spec[row.key];
    const over = row.overFrom !== undefined && raw > row.overFrom;
    return {
      row,
      heading,
      raw,
      value: formatSpecValue(spec, row),
      sub: over ? overCapacityNote(spec) : specFieldOf(row.key),
      subColor: over ? 'var(--over)' : 'var(--faint)',
      overCapacity: over,
      track: specTrackOf(spec, row),
    };
  });
}

export function formatSpecValue(spec: BuildingSpec, row: SpecRow): string {
  const raw = spec[row.key];
  switch (row.key) {
    case 'floorHeightM':
      return `${raw.toFixed(1)}${row.unit}`;
    default:
      return `${String(Math.round(raw))}${row.unit}`;
  }
}

/** The sentence the occupancy row shows once the building is let past what it was designed for. */
export function overCapacityNote(spec: BuildingSpec): string {
  return (
    `${String(Math.round(spec.occupancyPct - 100))}% over design capacity — ` +
    `${String(populationAt(spec, 1))} people on a floor built for ${String(spec.capacityPerFloor)}. ` +
    'The lifts were sized for the smaller number, and this is the run that shows what that costs.'
  );
}

/**
 * The 3 px track under a slider: filled to the value, and red past the over-capacity threshold.
 *
 * Only the occupancy row declares an `overFrom`, so every other row returns `''` and draws no
 * track. Computed per instance, which is the one case the shared vocabulary allows an inline style.
 */
export function specTrackOf(spec: BuildingSpec, row: SpecRow): string {
  if (row.overFrom === undefined) return '';
  const span = Math.max(1e-9, row.max - row.min);
  const at = ((spec[row.key] - row.min) / span) * 100;
  const threshold = ((row.overFrom - row.min) / span) * 100;
  if (at <= threshold) {
    return `linear-gradient(90deg, var(--accent) 0 ${at.toFixed(2)}%, var(--edge) ${at.toFixed(2)}% 100%)`;
  }
  return (
    `linear-gradient(90deg, var(--accent) 0 ${threshold.toFixed(2)}%, ` +
    `var(--over) ${threshold.toFixed(2)}% ${at.toFixed(2)}%, var(--edge) ${at.toFixed(2)}% 100%)`
  );
}

/** A row's edit as a patch. Total over the five keys. */
export function specPatchFor(key: SpecRow['key'], raw: number): Partial<BuildingSpec> {
  switch (key) {
    case 'floors':
      return { floors: Math.round(raw) };
    case 'floorHeightM':
      return { floorHeightM: raw };
    case 'capacityPerFloor':
      return { capacityPerFloor: Math.round(raw) };
    case 'occupancyPct':
      return { occupancyPct: Math.round(raw) };
    case 'cars':
      return { cars: Math.round(raw) };
  }
}

/* -------------------------------------------------------------------------- *
 * The chips — pure
 * -------------------------------------------------------------------------- */

export interface LoadChipView {
  readonly ratedLoadLb: number;
  readonly persons: number;
  readonly label: string;
  readonly pressed: boolean;
}

/**
 * The rated loads this class is built in.
 *
 * Filtered to `capacityLbRange`, because a load outside it is not a car this class comes in and the
 * loader says so. The persons figure is `personsOf`, which reads the capacities table rather than
 * dividing by 150: 1 600 lb is **10** persons, not 11, and a car capacity is a denominator of the
 * fill rule, the load factor and the round-trip time.
 */
export function loadChipsOf(
  spec: BuildingSpec,
  machineClass: MachineClass | undefined,
): readonly LoadChipView[] {
  const low = machineClass?.loadMinLb ?? Number.NEGATIVE_INFINITY;
  const high = machineClass?.loadMaxLb ?? Number.POSITIVE_INFINITY;
  return RATED_LOADS.filter((lb) => lb >= low && lb <= high).map((lb) => ({
    ratedLoadLb: lb,
    persons: personsOf(lb),
    label: `${String(lb)} lb · ${String(personsOf(lb))}p`,
    pressed: spec.ratedLoadLb === lb,
  }));
}

export interface BuildingSpeedChipView {
  readonly speed: number;
  readonly label: string;
  readonly pressed: boolean;
}

/**
 * The rated speeds a car of this class may be run at — the shipped ladder, clipped to the band.
 *
 * Nothing outside `[min, max]` is offered, because `resolveBuilding` refuses a car outside its
 * class's band. The band's own ends are always offered so a narrow class still has chips, and the
 * current speed is offered when it is inside, so the pressed chip exists.
 */
export function speedChipsOf(
  spec: BuildingSpec,
  machineClass: MachineClass | undefined,
  ladder: readonly number[] = [],
): readonly BuildingSpeedChipView[] {
  if (machineClass === undefined) {
    return [{ speed: spec.ratedSpeedMps, label: `${spec.ratedSpeedMps.toFixed(2)} m/s`, pressed: true }];
  }
  const low = Math.min(machineClass.speedMinMps, machineClass.speedMaxMps);
  const high = Math.max(machineClass.speedMinMps, machineClass.speedMaxMps);
  const offered = new Set<number>([low, high, machineClass.speedTypicalMps]);
  for (const speed of ladder) if (speed >= low && speed <= high) offered.add(speed);
  if (spec.ratedSpeedMps >= low && spec.ratedSpeedMps <= high) offered.add(spec.ratedSpeedMps);
  return [...offered]
    .filter((speed) => speed >= low && speed <= high)
    .sort((a, b) => a - b)
    .map((speed) => ({
      speed,
      label: `${speed.toFixed(2)} m/s`,
      pressed: Math.abs(speed - spec.ratedSpeedMps) < 1e-9,
    }));
}

/** The *every N storeys* options the sky-lobby chips offer. `0` is none. */
export const SKY_EVERY: readonly number[] = Object.freeze([0, 10, 15, 20]);

/** The transfer floors an *every N* choice names, excluding the lobby and the roof. */
export function skyFloorsEvery(spec: BuildingSpec, every: number): readonly number[] {
  if (every <= 0) return [];
  const floors: number[] = [];
  for (let floor = every; floor < spec.floors; floor += every) floors.push(floor);
  return floors;
}

export interface SkyChipView {
  readonly every: number;
  readonly label: string;
  readonly pressed: boolean;
  readonly floors: readonly number[];
}

/**
 * The sky-lobby chips.
 *
 * § 4.5: these seed `isTransferFloor` on the floors they name, which is a real field. No chip is
 * pressed once a reader has toggled a dot by hand and the set no longer matches any *every N*
 * rule — which is the honest picture, because what is running is then not one of the four.
 *
 * **A rule that names no floor on this building is not offered.** On a twelve-storey tower
 * *every 15* and *every 20* both seed the empty set, so all three chips would light at once and
 * pressing any of them would write nothing — three inert controls and a lit state that says
 * nothing about the building. Dropping them is right here rather than drawing a refusal, because
 * the option is not being withheld: it is *none*, and *none* is already a chip.
 */
export function skyChipsOf(spec: BuildingSpec): readonly SkyChipView[] {
  const mine = [...spec.skyFloors].sort((a, b) => a - b).join(',');
  return SKY_EVERY.filter((every) => every === 0 || skyFloorsEvery(spec, every).length > 0).map(
    (every) => {
      const floors = skyFloorsEvery(spec, every);
      return {
        every,
        label: every === 0 ? 'none' : `every ${String(every)}`,
        pressed: floors.join(',') === mine,
        floors,
      };
    },
  );
}

/* -------------------------------------------------------------------------- *
 * The elevation — pure
 * -------------------------------------------------------------------------- */

export interface ElevationRow {
  /** `0` is the lobby. */
  readonly floor: number;
  /** The floor id with its badge — `⌂ G`, `⇄ 11`, `4`. */
  readonly label: string;
  /** `⌂` entrance, `⇄` transfer, `''` otherwise. */
  readonly badge: string;
  readonly labelColor: string;
  readonly labelTitle: string;
  readonly isEntrance: boolean;
  readonly isSky: boolean;
  readonly skyMark: string;
  readonly skyTitle: string;
  /** `false` on the lobby, where `buildingFromSpec` never writes `isTransferFloor`. */
  readonly skyToggles: boolean;
  readonly occupancyPct: number;
  /** Whether this floor carries an override rather than the building-wide slider. */
  readonly handSet: boolean;
  /** `false` on the lobby, whose population `buildingFromSpec` pins at zero. */
  readonly draggable: boolean;
  /** Filled length of the 0–120 track, as a percentage of its width. */
  readonly fillPct: number;
  /** The red segment past design capacity, as a percentage of the track's width. */
  readonly overPct: number;
  readonly knobPct: number;
  readonly capacityTickPct: number;
  readonly people: number;
  readonly peopleText: string;
  readonly peopleColor: string;
  readonly occTitle: string;
}

/** One row per floor, **top floor first** — the direction a building is drawn in. */
export function elevationRowsOf(spec: BuildingSpec): readonly ElevationRow[] {
  const skies = new Set(spec.skyFloors);
  const rows: ElevationRow[] = [];
  for (let floor = spec.floors; floor >= 0; floor -= 1) {
    const isEntrance = floor === 0;
    const isSky = !isEntrance && skies.has(floor);
    const badge = isEntrance ? '⌂' : isSky ? '⇄' : '';
    const occupancyPct = isEntrance ? 0 : occupancyAt(spec, floor);
    const clamped = Math.min(OCCUPANCY_MAX_PCT, Math.max(0, occupancyPct));
    const people = isEntrance ? 0 : populationAt(spec, floor);
    const handSet = !isEntrance && spec.occupancyByFloor[floor] !== undefined;
    rows.push({
      floor,
      label: badge === '' ? floorIdOf(floor) : `${badge} ${floorIdOf(floor)}`,
      badge,
      labelColor: isEntrance ? 'var(--entrance)' : isSky ? 'var(--transfer)' : 'var(--dim)',
      labelTitle: isEntrance
        ? 'The lobby. Every bank lands here, and it carries no resident population.'
        : isSky
          ? `Floor ${floorIdOf(floor)} is a transfer level — floors[].isTransferFloor.`
          : `Floor ${floorIdOf(floor)}.`,
      isEntrance,
      isSky,
      skyMark: isSky ? '⇄' : '',
      skyTitle: isEntrance
        ? 'The lobby is the entrance; buildingFromSpec never marks it a transfer level, so this dot would write nothing.'
        : `Make floor ${floorIdOf(floor)} a transfer level. Transfer levels cut the tower into segments and the cars are dealt round-robin into them, which is what makes a sky lobby worth building.`,
      skyToggles: !isEntrance,
      occupancyPct,
      handSet,
      draggable: !isEntrance,
      fillPct: isEntrance ? 0 : (clamped / OCCUPANCY_MAX_PCT) * 100,
      overPct: isEntrance ? 0 : (Math.max(0, clamped - 100) / OCCUPANCY_MAX_PCT) * 100,
      knobPct: isEntrance ? 0 : (clamped / OCCUPANCY_MAX_PCT) * 100,
      capacityTickPct: CAPACITY_TICK_PCT,
      people,
      peopleText: isEntrance ? 'entrance' : `${String(people)} / ${String(spec.capacityPerFloor)}`,
      peopleColor: occupancyPct > 100 ? 'var(--over)' : handSet ? 'var(--accent-soft)' : 'var(--dim)',
      occTitle: isEntrance
        ? 'buildingFromSpec writes floors[0].population = 0, so there is nothing here to let.'
        : `${String(Math.round(occupancyPct))}% of ${String(spec.capacityPerFloor)} — drag to let this floor alone, 0–${String(OCCUPANCY_MAX_PCT)}%. Past 100 is over design capacity.`,
    });
  }
  return rows;
}

export interface ElevationCar {
  readonly car: number;
  readonly id: string;
  readonly band: readonly [number, number];
  /** Index into `banksOf(spec)` — cars that share a band share a bank, and share a tint. */
  readonly bankIndex: number;
  readonly tint: string;
  readonly topPct: number;
  readonly heightPct: number;
  readonly role: string;
  readonly serves: string;
  readonly pinned: boolean;
  readonly legend: string;
}

/**
 * One column per car, positioned against the same row grid the floors are drawn on.
 *
 * The band comes from `bandOf`, and the bank index from `banksOf`, so the picture and the document
 * cannot disagree about which cars are in a bank — which is the thing a reader is dragging.
 */
export function elevationCarsOf(spec: BuildingSpec): readonly ElevationCar[] {
  const banks = banksOf(spec);
  const rowCount = spec.floors + 1;
  const cars: ElevationCar[] = [];
  for (let car = 0; car < spec.cars; car += 1) {
    const band = bandOf(spec, car);
    const [low, high] = band;
    const bankIndex = banks.findIndex((bank) => bank.band[0] === low && bank.band[1] === high);
    const role = low === 0 ? (high >= spec.floors ? 'every floor' : 'low bank') : 'express';
    const serves =
      low === 0
        ? `${floorIdOf(0)}–${floorIdOf(high)}`
        : `G + ${floorIdOf(low)}–${floorIdOf(high)}`;
    const id = carLabelOf(car);
    cars.push({
      car,
      id,
      band,
      bankIndex: bankIndex < 0 ? 0 : bankIndex,
      tint: shaftTintOf(bankIndex < 0 ? 0 : bankIndex),
      topPct: ((spec.floors - high) / rowCount) * 100,
      heightPct: ((high - low + 1) / rowCount) * 100,
      role,
      serves,
      pinned: spec.bandByCar[car] !== undefined,
      legend: `${id} · ${role} · ${serves}`,
    });
  }
  return cars;
}

/** The floor a vertical drag at `fraction` of the elevation's height is over. */
export function floorAtFraction(spec: BuildingSpec, fraction: number): number {
  const rowCount = spec.floors + 1;
  const index = Math.floor(Math.min(0.999999, Math.max(0, fraction)) * rowCount);
  return Math.min(spec.floors, Math.max(0, spec.floors - index));
}

/** The occupancy a horizontal drag at `fraction` of the bar's width asks for, snapped. */
export function occupancyAtFraction(fraction: number): number {
  const raw = Math.min(1, Math.max(0, fraction)) * OCCUPANCY_MAX_PCT;
  const snapped = Math.round(raw / OCCUPANCY_STEP_PCT) * OCCUPANCY_STEP_PCT;
  return Math.min(OCCUPANCY_MAX_PCT, Math.max(0, snapped));
}

/** The sentence under the legend: how many banks there are, and what a bank means. */
export function elevationNoteOf(spec: BuildingSpec): string {
  const banks = banksOf(spec);
  const express = banks.some((bank) => bank.band[0] > 0);
  const plural = banks.length === 1 ? '' : 's';
  return (
    `${String(spec.cars)} shaft${spec.cars === 1 ? '' : 's'} in ${String(banks.length)} bank${plural} — ` +
    'a bank is the set of cars that open onto the same floors, so dragging one car off the rest ' +
    'splits it.' +
    (express
      ? ' A band that starts above the lobby still lands in the lobby and runs non-stop past the floors beneath it.'
      : '')
  );
}

/* -------------------------------------------------------------------------- *
 * Live validation
 * -------------------------------------------------------------------------- */

export interface BuildingCheck {
  /** What the loader refused, or `''` when it parsed and resolved. */
  readonly error: string;
  /** What the loader warned about — advisories, which it builds anyway. */
  readonly warnings: readonly string[];
}

/**
 * Run the spec through the **real** loader on every edit.
 *
 * Deliberately not a re-implementation: `validateSpec` adds the two refusals the parser cannot make
 * because they are about a drag rather than about a document, and everything else comes from
 * `parseBuilding`/`resolveBuilding` themselves. A `ConfigError` is a fact about the document the
 * reader is holding, so it is caught and rendered; letting it escape would take the panel down over
 * a floor count somebody dragged through.
 */
export function checkBuilding(
  spec: BuildingSpec,
  specs: ElevatorSpecs,
  trafficProfileIds?: ReadonlySet<string> | undefined,
): BuildingCheck {
  try {
    const config = buildingFromSpec(spec, { specs });
    const parsed = parseBuilding(config as unknown, `${spec.id}.json`);
    const resolved = resolveBuilding(parsed, specs, {
      file: `${spec.id}.json`,
      ...(trafficProfileIds === undefined ? {} : { trafficProfileIds }),
    });
    return { error: '', warnings: resolved.warnings.map((warning) => warning.message) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), warnings: [] };
  }
}

/** The `ElevatorSpecs` a run would resolve against: the file, widened by whatever was saved. */
export function specsWithSaved(
  resources: BrowserResources,
  saved: readonly MachineClass[],
): ElevatorSpecs {
  let specs = resources.elevatorSpecs;
  for (const machineClass of saved) specs = specsWithClass(specs, machineClass);
  return specs;
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

interface FloorHandles {
  readonly root: HTMLElement;
  readonly label: HTMLElement;
  readonly sky: HTMLElement;
  readonly skyMark: HTMLElement;
  readonly occ: HTMLElement;
  readonly fill: HTMLElement;
  readonly over: HTMLElement;
  readonly knob: HTMLElement;
  readonly people: HTMLElement;
}

interface CarHandles {
  readonly band: HTMLElement;
  readonly label: HTMLElement;
  readonly gripTop: HTMLElement;
  readonly gripBottom: HTMLElement;
}

export function mountBuildingEditor(
  elements: BuildingEditorElements,
  context: MountContext,
): Panel {
  const doc = elements.rows.ownerDocument;
  let view: ViewAt | undefined;

  let builtRowKeys = '';
  const rowNodes = new Map<string, SliderHandles>();
  const rowTracks = new Map<string, HTMLElement>();

  let builtShape = '';
  const floorNodes = new Map<number, FloorHandles>();
  const carNodes = new Map<number, CarHandles>();
  /** Every drag listener the current elevation owns. Run before it is rebuilt. */
  let dragTeardowns: (() => void)[] = [];

  const spec = (): BuildingSpec | undefined => view?.state.buildingSpec;

  function patch(next: Partial<BuildingSpec>): void {
    const current = spec();
    if (current === undefined) return;
    context.update({ buildingSpec: { ...current, ...next } });
  }

  function setOccupancy(floor: number, pct: number): void {
    const current = spec();
    if (current === undefined) return;
    patch({ occupancyByFloor: { ...current.occupancyByFloor, [floor]: pct } });
  }

  function setBand(car: number, edge: 'top' | 'bottom', floor: number): void {
    const current = spec();
    if (current === undefined) return;
    const [low, high] = bandOf(current, car);
    const next: readonly [number, number] =
      edge === 'top' ? [low, Math.max(floor, low)] : [Math.min(floor, high), high];
    patch({ bandByCar: { ...current.bandByCar, [car]: next } });
  }

  /* --- static wiring, once ------------------------------------------------ */

  elements.name.addEventListener('input', () => {
    patch({ name: elements.name.value });
  });

  elements.blank.addEventListener('click', () => {
    context.update({ buildingSpec: BLANK_SPEC, editingBuildingId: BLANK_SPEC.id });
  });

  elements.openMachines.addEventListener('click', () => {
    const at = view;
    const current = spec();
    if (at !== undefined && current !== undefined) {
      const machineClass = classById(at.resources, at.state.savedClasses, current.specClass);
      if (machineClass !== undefined) {
        context.update({
          editingClassId: machineClass.id,
          machineSpec: specFromClass(machineClass),
        });
      }
    }
    context.openTab('machines');
  });

  elements.close.addEventListener('click', () => {
    context.openTab('run');
  });

  elements.addShaft.addEventListener('click', () => {
    const current = spec();
    if (current !== undefined) patch({ cars: Math.min(12, current.cars + 1) });
  });

  elements.removeShaft.addEventListener('click', () => {
    const current = spec();
    if (current === undefined) return;
    const cars = Math.max(1, current.cars - 1);
    // The band of a shaft that no longer exists would otherwise sit in `bandByCar` and come back
    // the moment the reader added one, which is a pin they did not place.
    const bands: Record<number, readonly [number, number]> = {};
    for (const [key, band] of Object.entries(current.bandByCar)) {
      if (Number(key) < cars) bands[Number(key)] = band;
    }
    patch({ cars, bandByCar: bands });
  });

  elements.elevationLevelOcc.addEventListener('click', () => {
    patch({ occupancyByFloor: {} });
  });

  elements.elevationClearRanges.addEventListener('click', () => {
    patch({ bandByCar: {} });
  });

  elements.save.addEventListener('click', () => {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return;
    try {
      const id = nextSavedId('bld', allBuildingIds(at.resources, at.state.savedBuildings));
      const named: BuildingSpec = { ...current, id };
      const specs = specsWithSaved(at.resources, at.state.savedClasses);
      const config = parseBuilding(
        buildingFromSpec(named, { specs }) as unknown,
        `${id}.json`,
      );
      context.update({
        savedBuildings: [...at.state.savedBuildings, { id, config }],
        editingBuildingId: id,
        buildingSpec: named,
      });
      setText(elements.error, '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setText(elements.error, message);
      context.fail(message);
    }
  });

  /* --- the spec sliders --------------------------------------------------- */

  function drawSpecRows(rows: readonly SpecRowView[]): void {
    const keys = rows.map((entry) => entry.row.key).join('|');
    if (keys !== builtRowKeys) {
      rowNodes.clear();
      rowTracks.clear();
      fill(
        elements.rows,
        ...rows.map((entry) => {
          const node = slider(doc, {
            label: entry.row.label,
            value: entry.value,
            raw: entry.raw,
            min: entry.row.min,
            max: entry.row.max,
            step: entry.row.step,
            heading: entry.heading,
            sub: entry.sub,
            help: entry.row.help,
            onInput: (raw) => {
              patch(specPatchFor(entry.row.key, raw));
            },
          });
          const handles = sliderHandlesOf(node);
          if (handles !== undefined) rowNodes.set(entry.row.key, handles);
          if (entry.track !== '') {
            /*
             * The over-capacity track. Inserted before the sub-line so the note reads as a caption
             * of the bar rather than of the slider, which is the order the handoff draws.
             */
            const track = el(doc, 'div', {
              style: {
                height: '3px',
                'border-radius': '2px',
                margin: '1px 2px 0',
                background: entry.track,
              },
            });
            if (handles !== undefined) node.insertBefore(track, handles.sub);
            else node.append(track);
            rowTracks.set(entry.row.key, track);
          }
          return node;
        }),
      );
      builtRowKeys = keys;
    }
    for (const entry of rows) {
      const handles = rowNodes.get(entry.row.key);
      if (handles !== undefined) {
        updateSliderRow(handles, {
          raw: entry.raw,
          value: entry.value,
          sub: entry.sub,
          subColor: entry.subColor,
          labelColor: entry.overCapacity ? 'var(--over)' : 'var(--text)',
        });
      }
      const track = rowTracks.get(entry.row.key);
      if (track !== undefined) setStyle(track, 'background', entry.track);
    }
  }

  /* --- the elevation ------------------------------------------------------ */

  function buildElevation(current: BuildingSpec): void {
    for (const teardown of dragTeardowns) teardown();
    dragTeardowns = [];
    floorNodes.clear();
    carNodes.clear();

    const rows = elevationRowsOf(current);
    const cars = elevationCarsOf(current);
    const rowHeight = elevationRowHeightPx(rows.length);

    /*
     * Built before its children because the grips measure against it.
     *
     * `onVerticalDrag` divides by `within.getBoundingClientRect().height`, which for a **scroller**
     * is the height of the window rather than of the content — so passing `elevationBody` would map
     * a whole drag onto the top 420 px of a hundred-storey tower. The stage is the content box: it
     * is as tall as the rows, it scrolls with them, and its `scrollTop` is zero, so the fraction the
     * helper computes is the fraction of the building.
     */
    const stage = el(doc, 'div', {
      style: {
        position: 'relative',
        height: `${String(rows.length * rowHeight)}px`,
        'min-height': '160px',
        'min-width': '400px',
      },
    });

    const column = el(doc, 'div', {
      style: { position: 'absolute', inset: '0', display: 'flex', 'flex-direction': 'column' },
      children: rows.map((row) => buildFloorRow(row, rowHeight)),
    });

    const shafts = el(doc, 'div', {
      className: 'elev-shafts',
      style: { left: `${String(SHAFT_LEFT_PX)}px` },
      children: cars.map((car) => buildShaft(car, stage)),
    });

    stage.append(column, shafts);
    setStyle(elements.elevationBody, 'max-height', `${String(BODY_MAX_PX)}px`);
    fill(elements.elevationBody, stage);
  }

  function buildFloorRow(row: ElevationRow, rowHeight: number): HTMLElement {
    const label = el(doc, 'button', {
      className: 'elev-floor',
      attrs: { type: 'button' },
    });
    const skyMark = el(doc, 'span', {});
    const sky = el(doc, 'button', {
      className: 'elev-sky',
      attrs: { type: 'button' },
      children: [skyMark],
    });
    const toggleSky = (): void => {
      const current = spec();
      if (current === undefined || row.isEntrance) return;
      const skies = new Set(current.skyFloors);
      if (skies.has(row.floor)) skies.delete(row.floor);
      else skies.add(row.floor);
      patch({ skyFloors: [...skies].sort((a, b) => a - b) });
    };
    label.addEventListener('click', toggleSky);
    sky.addEventListener('click', toggleSky);

    const barFill = el(doc, 'span', {
      style: { position: 'absolute', left: '0', top: '0', bottom: '0', opacity: '0.85' },
    });
    const over = el(doc, 'span', {
      style: {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `${CAPACITY_TICK_PCT.toFixed(4)}%`,
        background: 'var(--over)',
      },
    });
    const tick = el(doc, 'span', {
      style: {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `${CAPACITY_TICK_PCT.toFixed(4)}%`,
        width: '1px',
        background: 'rgb(255 255 255 / 0.28)',
      },
    });
    const knob = el(doc, 'span', {
      style: {
        position: 'absolute',
        top: '-2px',
        bottom: '-2px',
        width: '2px',
        'margin-left': '-1px',
        'border-radius': '1px',
      },
    });
    const track = el(doc, 'span', {
      className: 'elev-occ-track',
      children: [barFill, over, tick, knob],
    });
    const occ = el(doc, 'button', {
      className: 'elev-occ',
      attrs: { type: 'button' },
      children: [track],
    });

    if (row.draggable) {
      dragTeardowns.push(
        onHorizontalDrag(occ, (fraction) => {
          setOccupancy(row.floor, occupancyAtFraction(fraction));
        }),
      );
      /*
       * KB-02 and KB-15: a bar that can only be dragged is a control a keyboard cannot reach. The
       * arrows move it by the same 5 % the drag snaps to, so the two agree about what a step is.
       */
      occ.addEventListener('keydown', (event) => {
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? OCCUPANCY_STEP_PCT
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
              ? -OCCUPANCY_STEP_PCT
              : 0;
        if (step === 0) return;
        event.preventDefault();
        const current = spec();
        if (current === undefined) return;
        const next = Math.min(
          OCCUPANCY_MAX_PCT,
          Math.max(0, occupancyAt(current, row.floor) + step),
        );
        setOccupancy(row.floor, next);
      });
    } else {
      occ.disabled = true;
    }

    const people = el(doc, 'span', { className: 'elev-people' });
    const root = el(doc, 'div', {
      className: 'elev-row',
      style: {
        height: `${String(rowHeight)}px`,
        background: row.isEntrance ? '#141c28' : 'transparent',
        'border-bottom': '1px solid var(--hairline)',
      },
      children: [label, sky, occ, people, el(doc, 'span', { style: { flex: '1' } })],
    });

    floorNodes.set(row.floor, {
      root,
      label,
      sky,
      skyMark,
      occ,
      fill: barFill,
      over,
      knob,
      people,
    });
    return root;
  }

  function buildShaft(car: ElevationCar, within: HTMLElement): HTMLElement {
    const gripTop = el(doc, 'button', {
      className: 'elev-grip',
      title: 'Drag down, or press the arrow keys, to lower the highest floor this shaft serves.',
      attrs: { type: 'button', 'aria-label': `Highest floor shaft ${car.id} serves` },
    });
    const gripBottom = el(doc, 'button', {
      className: 'elev-grip',
      title: 'Drag up, or press the arrow keys, to raise the lowest floor this shaft serves.',
      attrs: { type: 'button', 'aria-label': `Lowest floor shaft ${car.id} serves` },
    });
    const label = el(doc, 'span', {
      style: {
        'text-align': 'center',
        font: '600 10px var(--mono)',
        'pointer-events': 'none',
        overflow: 'hidden',
        'white-space': 'nowrap',
        padding: '0 3px',
      },
    });
    const band = el(doc, 'div', {
      className: 'elev-band',
      children: [gripTop, label, gripBottom],
    });

    for (const [grip, edge] of [
      [gripTop, 'top'],
      [gripBottom, 'bottom'],
    ] as const) {
      dragTeardowns.push(
        onVerticalDrag(grip, within, (fraction) => {
          const current = spec();
          if (current === undefined) return;
          setBand(car.car, edge, floorAtFraction(current, fraction));
        }),
      );
      grip.addEventListener('keydown', (event) => {
        const step =
          event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const current = spec();
        if (current === undefined) return;
        const [low, high] = bandOf(current, car.car);
        const from = edge === 'top' ? high : low;
        setBand(car.car, edge, Math.min(current.floors, Math.max(0, from + step)));
      });
    }

    carNodes.set(car.car, { band, label, gripTop, gripBottom });
    return el(doc, 'div', { className: 'elev-shaft', children: [band] });
  }

  function drawElevation(current: BuildingSpec): void {
    const shape = `${String(current.floors)}:${String(current.cars)}`;
    if (shape !== builtShape) {
      buildElevation(current);
      builtShape = shape;
    }

    for (const row of elevationRowsOf(current)) {
      const handles = floorNodes.get(row.floor);
      if (handles === undefined) continue;
      // A transfer level is tinted as well as badged, so the segments a sky lobby cuts the tower
      // into are legible at a glance — and badged as well as tinted, which is KB-15.
      setStyle(
        handles.root,
        'background',
        row.isEntrance ? '#141c28' : row.isSky ? 'rgb(198 154 216 / 0.07)' : 'transparent',
      );
      setText(handles.label, row.label);
      setStyle(handles.label, 'color', row.labelColor);
      handles.label.title = row.labelTitle;
      setText(handles.skyMark, row.skyMark);
      setStyle(handles.skyMark, 'background', row.isSky ? 'var(--transfer)' : 'transparent');
      setStyle(handles.skyMark, 'color', row.isSky ? 'var(--bg)' : 'var(--faint)');
      handles.sky.title = row.skyTitle;
      handles.sky.setAttribute('aria-pressed', row.isSky ? 'true' : 'false');
      handles.occ.title = row.occTitle;
      handles.occ.setAttribute('aria-label', `${row.label} occupancy, ${row.occTitle}`);
      setStyle(handles.fill, 'width', `${row.fillPct.toFixed(2)}%`);
      setStyle(handles.fill, 'background', row.handSet ? 'var(--accent-soft)' : 'var(--accent)');
      setStyle(handles.over, 'width', `${row.overPct.toFixed(2)}%`);
      setStyle(handles.knob, 'left', `${row.knobPct.toFixed(2)}%`);
      setStyle(handles.knob, 'background', row.overPct > 0 ? 'var(--over)' : 'var(--text)');
      setText(handles.people, row.peopleText);
      setStyle(handles.people, 'color', row.peopleColor);
    }

    const cars = elevationCarsOf(current);
    for (const car of cars) {
      const handles = carNodes.get(car.car);
      if (handles === undefined) continue;
      setStyle(handles.band, 'top', `${car.topPct.toFixed(2)}%`);
      setStyle(handles.band, 'height', `${car.heightPct.toFixed(2)}%`);
      setStyle(handles.band, 'border-color', car.tint);
      setStyle(handles.gripTop, 'background', car.tint);
      setStyle(handles.gripBottom, 'background', car.tint);
      setText(handles.label, car.id);
      setStyle(handles.label, 'color', car.tint);
    }

    fill(
      elements.elevationLegend,
      ...cars.map((car) =>
        el(doc, 'div', {
          className: 'elev-legend-row',
          children: [
            el(doc, 'span', {
              style: {
                width: '7px',
                height: '7px',
                'border-radius': '2px',
                background: car.tint,
                flex: 'none',
              },
            }),
            el(doc, 'span', {
              text: car.id,
              style: { width: '16px', flex: 'none', color: 'var(--text)', 'font-weight': '600' },
            }),
            el(doc, 'span', { text: car.role, style: { width: '78px', flex: 'none' } }),
            el(doc, 'span', {
              text: car.serves,
              style: { width: '90px', flex: 'none', color: '#c6d0dc' },
            }),
            el(doc, 'span', {
              text: car.pinned ? 'pinned' : '',
              style: { flex: '1', color: 'var(--faint)' },
            }),
          ],
        }),
      ),
    );
  }

  /* --- render ------------------------------------------------------------- */

  function render(at: ViewAt): void {
    view = at;
    const state = at.state;
    const current = state.buildingSpec;
    const specs = specsWithSaved(at.resources, state.savedClasses);
    const machineClass = classById(at.resources, state.savedClasses, current.specClass);

    setText(elements.editing, `Editing — ${current.name}`);
    if (elements.name.value !== current.name) elements.name.value = current.name;

    drawSpecRows(specRowsOf(current));
    setText(elements.occupancy, occupancyLine(current));

    /* Machine class. */
    fill(
      elements.classChips,
      chipRow(
        doc,
        allClasses(at.resources, state.savedClasses).map((entry) => ({
          label: entry.yours ? `${entry.name} · YOURS` : entry.name,
          selected: entry.id === current.specClass,
          title: entry.application,
          onPick: () => {
            /*
             * Choosing a class re-fits the car to it. A speed or a load left outside the new
             * class's band is a car `resolveBuilding` refuses, and letting a reader carry one over
             * so it can be refused on save is worse than fitting it here and saying so in the
             * summary.
             */
            const load = Math.min(entry.loadMaxLb, Math.max(entry.loadMinLb, current.ratedLoadLb));
            const nearest = RATED_LOADS.filter(
              (lb) => lb >= entry.loadMinLb && lb <= entry.loadMaxLb,
            );
            patch({
              specClass: entry.id,
              ratedSpeedMps: entry.speedTypicalMps,
              ratedLoadLb: nearest.includes(load) ? load : (nearest[0] ?? load),
            });
          },
        })),
      ),
    );
    setText(
      elements.classPlain,
      machineClass === undefined
        ? `No class "${current.specClass}" — the loader will refuse this building until one is chosen.`
        : plainDescription(machineClass),
    );
    setText(
      elements.classLimits,
      machineClass === undefined
        ? ''
        : `${machineClass.application} · rated to ${String(machineClass.maxRiseM)} m and ${String(machineClass.maxFloors)} floors`,
    );

    /* Load, speed and sky chips. */
    fill(
      elements.loadChips,
      chipRow(
        doc,
        loadChipsOf(current, machineClass).map((entry) => ({
          label: entry.label,
          selected: entry.pressed,
          title: `${String(entry.ratedLoadLb)} lb is ${String(entry.persons)} persons in the capacities table — not lb ÷ 150, which would quietly add a passenger.`,
          onPick: () => {
            patch({ ratedLoadLb: entry.ratedLoadLb });
          },
        })),
      ),
    );
    fill(
      elements.speedChips,
      chipRow(
        doc,
        speedChipsOf(current, machineClass, speedLadderOf(at.resources.elevatorSpecs)).map(
          (entry) => ({
            label: entry.label,
            selected: entry.pressed,
            title:
              'Contract speed. On a short rise it is never reached, so door and stop time dominate ' +
              'and this does less than it looks like it should.',
            onPick: () => {
              patch({ ratedSpeedMps: entry.speed });
            },
          }),
        ),
      ),
    );
    fill(
      elements.skyChips,
      chipRow(
        doc,
        skyChipsOf(current).map((entry) => ({
          label: entry.label,
          selected: entry.pressed,
          title:
            entry.every === 0
              ? 'No transfer levels: one bank serves the whole tower.'
              : `Transfer levels at ${entry.floors.map((floor) => floorIdOf(floor)).join(', ')} — floors[].isTransferFloor. The cars are dealt round-robin into the segments those levels cut.`,
          onPick: () => {
            patch({ skyFloors: entry.floors, bandByCar: {} });
          },
        })),
      ),
    );

    setText(elements.summary, buildingSummary(current));
    setText(elements.advice, buildingAdvice(current));

    /* The elevation. */
    drawElevation(current);

    const handSet = Object.keys(current.occupancyByFloor).length;
    const pinned = Object.keys(current.bandByCar).length;
    setText(
      elements.elevationOccNote,
      handSet === 0
        ? ''
        : `${String(handSet)} floor${handSet === 1 ? '' : 's'} let by hand`,
    );
    setHidden(elements.elevationLevelOcc, handSet === 0);
    setHidden(elements.elevationClearRanges, pinned === 0);
    setText(elements.elevationNote, elevationNoteOf(current));
    setText(elements.elevationWarning, validateSpec(current, machineClass).join(' '));

    /* Validate live, against the real loader. */
    const check = checkBuilding(current, specs, at.resources.trafficProfileIds);
    setText(elements.error, check.error);
    setText(elements.classWarning, check.warnings.join(' · '));
    setStyle(
      elements.classWarning,
      'color',
      check.warnings.length === 0 ? 'var(--faint)' : 'var(--warn)',
    );

    setHidden(elements.dirty, !specIsDirty(current, sourceBuildingOf(at)));
  }

  return { render };
}

/**
 * The spec the editor was opened from, so *edited — not saved* means something.
 *
 * A building the reader has never opened — the blank tower — has no source, and `BLANK_SPEC` is the
 * honest one: it is what the *blank tower* button produced.
 */
function sourceBuildingOf(at: ViewAt): BuildingSpec {
  const config = buildingConfigOf(at.resources, at.state.savedBuildings, at.state.editingBuildingId);
  if (config === undefined) return { ...BLANK_SPEC, id: at.state.editingBuildingId };
  return specFromBuilding(config, at.state.editingBuildingId);
}
