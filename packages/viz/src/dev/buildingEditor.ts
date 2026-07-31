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
  accessZonesOf,
  banksOf,
  bandOf,
  buildingAdvice,
  buildingFromSpec,
  buildingSummary,
  canExpress,
  carLabelOf,
  credentialGroupsOf,
  escalatorSecondsFor,
  floorIdOf,
  nextTransportModeId,
  nextZoneId,
  occupancyAt,
  occupancyLine,
  personsOf,
  populationAt,
  servesLobby,
  specFromBuilding,
  specIsDirty,
  transportModesOf,
  validateSpec,
  withTransportEnd,
  withTransportSeconds,
  withZoneFloor,
  withZoneGroup,
  zoneFloorsOf,
  type BuildingSpec,
  type SpecAccessZone,
  type SpecRow,
  type SpecTransportMode,
} from '../authoring/buildingSpec.js';
import {
  CREDENTIAL_STATES,
  STATE_GLYPHS,
  STATE_WORDS,
  floorRunsOf,
  permittedGroupsByFloor,
  restrictedFloorIds,
  type CredentialState,
} from '../access/zoning.js';
import { plainDescription, specFromClass, specsWithClass, type MachineClass } from '../authoring/machineSpec.js';

import {
  nextSavedId,
  sliderHandlesOf,
  updateSliderRow,
  type SliderHandles,
} from './dispatcherEditor.js';
import {
  chip,
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
  /** Whether the express toggle is offered at all — only a band above the lobby has the question. */
  readonly canExpress: boolean;
  /** Whether it is on: the car runs non-stop to the lobby rather than staying in its band. */
  readonly expressOn: boolean;
  /** The toggle's label, which carries the state in words as well as in colour (KB-15). */
  readonly expressLabel: string;
  /** The toggle's tooltip, verbatim from the handoff at `:737`. */
  readonly expressTitle: string;
}

/**
 * The express toggle's tooltip, **verbatim** from the vendored prototype at
 * `docs/design/elevator-sim-reimagined.dc.html:737`.
 *
 * Copied rather than paraphrased because the handoff wins every disagreement about what the screen
 * says (§ D174), and because the sentence is the only place the *default* is explained: a reader who
 * has never dragged a band has no way to know that a band above the lobby already lands in it.
 *
 * Deliberately **not exported**. `honesty/derive.test-helper.ts` derives its corpus from exported
 * declarations, and a new exported string constant is a new unclassified surface that only
 * `honesty/surfaces.ts` can classify — a file this change does not own. Kept module-private, the
 * sentence reaches the corpus the way every other word in this module does: through
 * {@link elevationCarsOf}, which is already an adapter's subject.
 */
const EXPRESS_TITLE =
  'A band above the first floor still lands in the lobby and runs non-stop past the floors beneath ' +
  'it. Turn this off to keep the car entirely inside its band.';

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
    const lobby = servesLobby(spec, car);
    const bankIndex = banks.findIndex(
      (bank) => bank.band[0] === low && bank.band[1] === high && bank.lobby === lobby,
    );
    /*
     * Three roles, and the third is new. `express` is a band above the lobby that still lands in it;
     * `band only` is the same band with the toggle off, which is a different bank and a different
     * building. Calling both of them `express` would be the `serves` defect one column to the left.
     */
    const role =
      low === 0 ? (high >= spec.floors ? 'every floor' : 'low bank') : lobby ? 'express' : 'band only';
    const serves =
      low === 0
        ? `${floorIdOf(0)}–${floorIdOf(high)}`
        : lobby
          ? `G + ${floorIdOf(low)}–${floorIdOf(high)}`
          : `${floorIdOf(low)}–${floorIdOf(high)}`;
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
      canExpress: canExpress(spec, car),
      expressOn: canExpress(spec, car) && lobby,
      expressLabel: !canExpress(spec, car)
        ? ''
        : lobby
          ? `✓ express from the lobby, skipping ${floorIdOf(1)}–${floorIdOf(low - 1)}`
          : 'stays in its band — click to run express from the lobby',
      expressTitle: EXPRESS_TITLE,
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

/** Every floor id of this building, lobby first — the order every run and every legend uses. */
function floorIdsOf(spec: BuildingSpec): readonly string[] {
  const ids: string[] = [];
  for (let floor = 0; floor <= spec.floors; floor += 1) ids.push(floorIdOf(floor));
  return ids;
}

/* -------------------------------------------------------------------------- *
 * Access zoning — pure
 * -------------------------------------------------------------------------- *
 *
 * `docs/10-experience-layer-contract.md` § 10.2's two open controls: a floor multi-select over the
 * building's own floors, and a floors × credential-groups coverage matrix.
 *
 * Everything below returns **facts and ids**, never a sentence. Two reasons, and the second is the
 * load-bearing one:
 *
 * 1. The mount is then decision-free, which is the split `dom.ts` documents.
 * 2. `honesty/derive.test-helper.ts` derives its corpus from *exported* declarations and calls any
 *    two adjacent alphabetic words prose — including `a.b` inside a template substitution. A new
 *    exported producer can only be classified in `honesty/surfaces.ts`, so a new sentence here
 *    would be an unclassifiable surface. The one sentence access zoning adds to a *driven* surface
 *    is in {@link elevationNoteOf}, which an adapter already covers, and it is there for the right
 *    reason as well as the convenient one: it is said exactly where the shaft bands are explained,
 *    which is where a reader is most likely to mistake one kind of zoning for the other.
 *
 * The words and glyphs the cells carry are `access/zoning.ts`'s own — `▩` for a floor a credential
 * does not open, never a second spelling of a fact the viewer already draws — and they are read out
 * of its tables through {@link CREDENTIAL_STATES} rather than by writing the state id here, for the
 * same derivation reason.
 */

/** *reachable* — the state of a floor this credential opens. */
const PERMITTED_STATE: CredentialState = CREDENTIAL_STATES[0];
/** *not-permitted* — a shaft reaches the floor and this credential does not open it. */
const REFUSED_STATE: CredentialState = CREDENTIAL_STATES[2];

/**
 * The third mark, for the case the credential lens has no state for: a floor in no zone.
 *
 * `access/zoning.ts` has three states and none of them is this one, because the lens looks *through*
 * a credential and an unrestricted floor is simply reachable. A matrix has to say something
 * different, because *"this group opens it"* and *"nothing restricts it"* are different facts about
 * the building and a reader deciding where to put a zone needs to tell them apart. A hollow ring
 * against a filled disc, so the two are distinguishable with the colour removed.
 */
const UNRESTRICTED_GLYPH = '○';
const UNRESTRICTED_WORD = 'unrestricted';

/** One cell of the coverage matrix: one floor under one credential group. */
export interface AccessCell {
  readonly group: string;
  readonly permitted: boolean;
  /** The floor is in no zone at all, so *every* credential opens it. */
  readonly unrestricted: boolean;
  readonly state: CredentialState;
  /** KB-15's second signal. Never the only one — {@link AccessCell.word} carries the same fact. */
  readonly glyph: string;
  readonly word: string;
}

/** One row of the coverage matrix. */
export interface AccessFloorRow {
  readonly floor: number;
  readonly floorId: string;
  /** Zones covering this floor, in declared order. Empty means unrestricted. */
  readonly zoneIds: readonly string[];
  readonly restricted: boolean;
  /**
   * No credential group in this building opens this floor.
   *
   * The state § 10.2 asks the matrix to make visible, and the one that strands demand: the trips are
   * not served slowly, they are never generated. It is reachable only by emptying a zone's group
   * list, which the schema refuses on save — so the matrix shows it and {@link validateSpec} says
   * the loader will not build it.
   */
  readonly stranded: boolean;
  readonly cells: readonly AccessCell[];
}

export interface AccessMatrix {
  /** The columns: every group this building names, in declared order. No fixed vocabulary. */
  readonly groups: readonly string[];
  /** Top floor first, the direction the elevation is drawn in. */
  readonly rows: readonly AccessFloorRow[];
  readonly restrictedIds: readonly string[];
  readonly strandedIds: readonly string[];
  /** The restricted floors as runs — `2–30`, not 29 ids. § 10.3's form. */
  readonly restrictedRuns: string;
}

/**
 * The floors × credential-groups coverage matrix, over the zones the document will actually carry.
 *
 * Computed from {@link accessZonesOf} rather than from the raw spec, so what the matrix shows and
 * what the run does cannot disagree: a zone whose floors all fell off the top of a shortened tower
 * is not written to the document and is not drawn here either.
 */
export function accessMatrixOf(spec: BuildingSpec): AccessMatrix {
  const zones = accessZonesOf(spec);
  const groups = credentialGroupsOf(spec);
  const permittedBy = permittedGroupsByFloor(zones);
  const ids = floorIdsOf(spec);
  const rows: AccessFloorRow[] = [];
  const strandedIds: string[] = [];
  for (let floor = spec.floors; floor >= 0; floor -= 1) {
    const floorId = floorIdOf(floor);
    const permitted = permittedBy.get(floorId);
    const restricted = permitted !== undefined;
    const stranded = restricted && permitted.length === 0;
    if (stranded) strandedIds.push(floorId);
    rows.push({
      floor,
      floorId,
      zoneIds: spec.accessZones
        .filter((zone) => zoneFloorsOf(spec, zone).includes(floor))
        .map((zone) => zone.id),
      restricted,
      stranded,
      cells: groups.map((group): AccessCell => {
        const free = permitted === undefined;
        const opens = free || permitted.includes(group);
        const state = opens ? PERMITTED_STATE : REFUSED_STATE;
        return {
          group,
          permitted: opens,
          unrestricted: free,
          state,
          glyph: free ? UNRESTRICTED_GLYPH : STATE_GLYPHS[state],
          word: free ? UNRESTRICTED_WORD : STATE_WORDS[state],
        };
      }),
    });
  }
  return {
    groups,
    rows,
    restrictedIds: restrictedFloorIds(ids, zones),
    strandedIds,
    restrictedRuns: floorRunsOf(ids, restrictedFloorIds(ids, zones)),
  };
}

/** One zone, as the selector draws it. Counts, not a label — the mount composes the words. */
export interface ZoneChoice {
  readonly id: string;
  readonly floorCount: number;
  readonly groupCount: number;
  readonly selected: boolean;
  /** Floors the document will carry for this zone, as runs. */
  readonly runs: string;
}

export function zoneChoicesOf(spec: BuildingSpec, selectedId: string): readonly ZoneChoice[] {
  const ids = floorIdsOf(spec);
  return spec.accessZones.map((zone): ZoneChoice => {
    const floors = zoneFloorsOf(spec, zone);
    return {
      id: zone.id,
      floorCount: floors.length,
      groupCount: zone.credentialGroups.length,
      selected: zone.id === selectedId,
      runs: floorRunsOf(ids, floors.map((floor) => floorIdOf(floor))),
    };
  });
}

/** The zone a mount should draw as selected: the one asked for, else the first, else none. */
export function selectedZoneOf(spec: BuildingSpec, wanted: string): SpecAccessZone | undefined {
  return spec.accessZones.find((zone) => zone.id === wanted) ?? spec.accessZones[0];
}

/**
 * One entry of the floor multi-select — § 10.2's *"a floor multi-select over the building's own
 * floors"*, top floor first.
 *
 * A control over floors that exist is the whole point: `ED-14` validates an unknown floor id in the
 * document editor's free-text list, and § 10.2 asks this control to make that error **unreachable**
 * rather than catchable. There is no text box here to type `31` into.
 */
export interface ZoneFloorChoice {
  readonly floor: number;
  readonly floorId: string;
  readonly inZone: boolean;
  /** Other zones already covering this floor. Permission is the union, so a reader must see them. */
  readonly otherZoneIds: readonly string[];
  readonly isEntrance: boolean;
}

export function zoneFloorChoicesOf(spec: BuildingSpec, zoneId: string): readonly ZoneFloorChoice[] {
  const zone = spec.accessZones.find((entry) => entry.id === zoneId);
  const held = new Set(zone === undefined ? [] : zoneFloorsOf(spec, zone));
  const choices: ZoneFloorChoice[] = [];
  for (let floor = spec.floors; floor >= 0; floor -= 1) {
    choices.push({
      floor,
      floorId: floorIdOf(floor),
      inZone: held.has(floor),
      otherZoneIds: spec.accessZones
        .filter((entry) => entry.id !== zoneId && zoneFloorsOf(spec, entry).includes(floor))
        .map((entry) => entry.id),
      isEntrance: floor === 0,
    });
  }
  return choices;
}

/** One entry of the credential control: the groups the building already names, plus this zone's. */
export interface ZoneGroupChoice {
  readonly group: string;
  readonly inZone: boolean;
}

export function zoneGroupChoicesOf(spec: BuildingSpec, zoneId: string): readonly ZoneGroupChoice[] {
  const zone = spec.accessZones.find((entry) => entry.id === zoneId);
  const held = new Set(zone?.credentialGroups ?? []);
  return credentialGroupsOf(spec).map((group) => ({ group, inZone: held.has(group) }));
}

/* -------------------------------------------------------------------------- *
 * Sky lobbies — pure
 * -------------------------------------------------------------------------- */

/** One escalator, as the selector draws it. Facts, not a label — the mount composes the words. */
export interface TransportChoice {
  readonly id: string;
  readonly lowerId: string;
  readonly upperId: string;
  readonly seconds: number;
  readonly selected: boolean;
  /** Whether this machine is written to the saved document at all. */
  readonly written: boolean;
  /** Whether a journey may change onto a lift at either of its two landings. */
  readonly wayThrough: boolean;
}

export function transportChoicesOf(
  spec: BuildingSpec,
  selectedId: string,
): readonly TransportChoice[] {
  const written = new Set(transportModesOf(spec).map((mode) => mode.id));
  const skies = new Set(spec.skyFloors);
  return spec.transportModes.map((mode): TransportChoice => {
    const [low, high] = [Math.min(...mode.connects), Math.max(...mode.connects)];
    return {
      id: mode.id,
      lowerId: floorIdOf(low),
      upperId: floorIdOf(high),
      seconds: mode.traversalTimeS,
      selected: mode.id === selectedId,
      written: written.has(mode.id),
      wayThrough: mode.connects.some((floor) => skies.has(floor)),
    };
  });
}

/** The machine a mount should draw as selected: the one asked for, else the first, else none. */
export function selectedTransportOf(
  spec: BuildingSpec,
  wanted: string,
): SpecTransportMode | undefined {
  return spec.transportModes.find((mode) => mode.id === wanted) ?? spec.transportModes[0];
}

/**
 * One entry of a landing picker — the same control the zone floor multi-select is, single-select.
 *
 * The floor already held by the *other* end is offered as `blocked` rather than dropped, because a
 * gap in the ladder is a control that has silently changed shape. `withTransportEnd` refuses the
 * click, so the state the loader refuses stays unreachable either way.
 */
export interface TransportFloorChoice {
  readonly floor: number;
  readonly floorId: string;
  readonly chosen: boolean;
  readonly blocked: boolean;
  readonly isTransfer: boolean;
}

export function transportFloorChoicesOf(
  spec: BuildingSpec,
  modeId: string,
  end: 0 | 1,
): readonly TransportFloorChoice[] {
  const mode = spec.transportModes.find((entry) => entry.id === modeId);
  const skies = new Set(spec.skyFloors);
  const choices: TransportFloorChoice[] = [];
  for (let floor = spec.floors; floor >= 0; floor -= 1) {
    choices.push({
      floor,
      floorId: floorIdOf(floor),
      chosen: mode?.connects[end] === floor,
      blocked: mode?.connects[1 - end] === floor,
      isTransfer: skies.has(floor),
    });
  }
  return choices;
}

/**
 * The sentence under the escalator controls, or `''` when the building declares none.
 *
 * It says the one thing the two pickers cannot: whether the machine is a *way through* or a
 * two-floor errand. `traffic/route.ts` lets a journey change onto a lift only at a transfer level,
 * so an escalator with neither landing marked carries exactly the people who start on one of its
 * floors and finish on the other. That is a building somebody may mean; it is not one anybody
 * means by accident.
 */
export function transportNoteOf(spec: BuildingSpec): string {
  const choices = transportChoicesOf(spec, '');
  if (choices.length === 0) return '';
  const written = choices.filter((choice) => choice.written);
  const through = written.filter((choice) => choice.wayThrough).length;
  const lead =
    `${String(written.length)} of ${String(choices.length)} escalator${choices.length === 1 ? '' : 's'} ` +
    'written to the document. The router rides one in preference to a lift leg, so a crossing it ' +
    'carries is a crossing the lifts are no longer charged for.';
  if (written.length === 0) return lead;
  return (
    `${lead} ${String(through)} of ${String(written.length)} touch a transfer level and are a way ` +
    'through the building; the rest carry only the people who start on one of their two floors ' +
    'and finish on the other.'
  );
}

/** The sentence under the legend: how many banks there are, and what a bank means. */
export function elevationNoteOf(spec: BuildingSpec): string {
  const banks = banksOf(spec);
  const express = banks.some((bank) => bank.band[0] > 0 && bank.lobby);
  const closed = banks.some((bank) => bank.band[0] > 0 && !bank.lobby);
  const plural = banks.length === 1 ? '' : 's';
  return (
    `${String(spec.cars)} shaft${spec.cars === 1 ? '' : 's'} in ${String(banks.length)} bank${plural} — ` +
    'a bank is the set of cars that open onto the same floors, so dragging one car off the rest ' +
    'splits it.' +
    (express
      ? ' A band that starts above the lobby still lands in the lobby and runs non-stop past the floors beneath it.'
      : '') +
    /*
     * Said only when a band is actually closed, because it is the sentence that stops the one above
     * being read as a law. Both can be true at once — a tower can have an express group and a
     * service car — and then both are said.
     */
    (closed
      ? ' A band with express turned off never calls at the lobby, so its floors are reachable only through a transfer level.'
      : '') +
    /*
     * The one access-zoning sentence on a *driven* surface, and it is said here on purpose: this
     * paragraph is where the bands are explained, so it is where a reader is most likely to read a
     * credential as a shaft. `CLAUDE.md` forbids collapsing the three zonings, and the two facts
     * that keep them apart are both stated — the floors are *served*, and the barrier is a
     * credential. Only said when the building has a zone, because a building with none has no such
     * distinction to draw and a sentence about nothing is the weakest form of a rule.
     */
    accessNoteOf(spec)
  );
}

/** The access-zoning half of {@link elevationNoteOf}, or `''` when the building has no zone. */
function accessNoteOf(spec: BuildingSpec): string {
  const matrix = accessMatrixOf(spec);
  const restricted = matrix.restrictedIds.length;
  if (restricted === 0) return '';
  const total = spec.floors + 1;
  const groups = matrix.groups.length;
  const runs = matrix.restrictedRuns;
  const stranded = matrix.strandedIds.length;
  return (
    ` ${String(restricted)} of ${String(total)} floors sit in an access zone (${runs}) and ` +
    `${String(groups)} credential group${groups === 1 ? '' : 's'} ` +
    `${groups === 1 ? 'is' : 'are'} named. That is a credential and not a shaft: every one of those ` +
    'floors is physically served, and a rider whose credential does not open one is not waiting — ' +
    'the trip is never generated. A floor in no zone is unrestricted.' +
    (stranded === 0
      ? ''
      : ` ${String(stranded)} of them ${stranded === 1 ? 'is' : 'are'} open to no group at all.`)
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

/* -------------------------------------------------------------------------- *
 * The access block's copy
 * -------------------------------------------------------------------------- *
 *
 * Module-private, for `EXPRESS_TITLE`'s reason and with the same consequence: a new **exported**
 * prose declaration is a surface only `honesty/surfaces.ts` can classify, and this change does not
 * own that file. These reach the corpus through `mountBuildingEditor`, which `derive.test.ts`
 * excludes as DOM-bound and whose literals its static R10 sweep still reads — weaker than being
 * driven, and stated as a limitation rather than presented as coverage. The one access sentence on a
 * *driven* surface is `elevationNoteOf`'s.
 */

const ZONE_FLOOR_TITLE =
  'Click to put this floor in the selected zone, or take it out. The options are this building’s own ' +
  'floors, so a zone can never name one the document does not have.';

const ZONE_LOBBY_TITLE =
  'The lobby. Restricting it is a building where nobody may enter from the ground — a legitimate ' +
  'thing to draw and watch, and not usually what is meant: every shipped building leaves it open.';

const ZONE_GROUP_TITLE =
  'Click to admit this credential group to the selected zone, or withdraw it. Permission on a floor ' +
  'is the union over every zone covering it.';

/*
 * Module-private, like `EXPRESS_TITLE` above and for the constraint stated there: a string literal
 * carrying an `a.b` inside a template becomes an unclassified prose surface in `honesty/derive`.
 */
const TRANSPORT_LANDING_TITLE =
  'One of the escalator’s two landings. The picker offers this building’s own floors, so a connection can never name a floor the document does not have.';

const TRANSPORT_TRANSFER_TITLE =
  'A transfer level: a journey may change onto a lift here, so an escalator landing here is a way through the building rather than a trip between two floors.';

const TRANSPORT_BLOCKED_TITLE =
  'The other landing already stands here. The loader refuses a connection whose two ends name one floor — a machine that starts and ends on the same floor moves nobody.';

const MATRIX_EMPTY =
  'No access zone, so every floor is open to every credential — core’s own semantics for a floor no ' +
  'zone covers, and what four of the five shipped buildings declare. Add a zone to restrict the ' +
  'floors it names; every floor outside it stays unrestricted.';

const MATRIX_LEGEND =
  'A row is a floor, a column is a credential group. ● this group opens the floor · ▩ it does not · ' +
  '○ the floor is in no zone, so every credential opens it. Service zoning is a different question ' +
  'and is drawn in the elevation above: a floor no shaft reaches is ⊘ there, never ▩ here.';

const MATRIX_DISPATCHER_NOTE =
  'Which dispatchers can read a credential at all is a third question again — the note beside the ' +
  'dispatcher list answers it for the pairing you have selected.';

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

  /**
   * Take one car out of the lobby, or put it back — the handoff's express toggle, § 1.3 M11.
   *
   * Writes the flag rather than rewriting the band, because the two are different facts: the band is
   * where the reader dragged the grips, and this is whether the car stops at the ground on its way
   * there. Folding the lobby into the band would make *release every shaft* silently forget which of
   * the two the reader had chosen.
   */
  function setNoLobby(car: number, off: boolean): void {
    const current = spec();
    if (current === undefined) return;
    patch({ noLobby: { ...current.noLobby, [car]: off } });
  }

  /*
   * Which zone the controls are pointed at.
   *
   * Mount-local rather than a `ViewerState` field, and that is the honest place for it: it is not a
   * fact about the building, nothing downstream reads it, and a run replays identically whichever
   * zone was selected when it started. `selectedZoneOf` falls back to the first zone, so a stale id
   * after a removal draws the surviving zone rather than an empty form.
   */
  let selectedZoneId = '';

  function zoneOf(current: BuildingSpec): SpecAccessZone | undefined {
    const zone = selectedZoneOf(current, selectedZoneId);
    if (zone !== undefined) selectedZoneId = zone.id;
    return zone;
  }

  /** Which escalator the landing pickers are pointed at. Mount-local, for `selectedZoneId`'s reason. */
  let selectedTransportId = '';

  function transportOf(current: BuildingSpec): SpecTransportMode | undefined {
    const mode = selectedTransportOf(current, selectedTransportId);
    if (mode !== undefined) selectedTransportId = mode.id;
    return mode;
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

  elements.addZone.addEventListener('click', () => {
    const current = spec();
    if (current === undefined) return;
    const id = nextZoneId(current);
    /*
     * A new zone starts on **no** floor, and with the building's first credential group when it has
     * one. Both halves matter: a zone covering no floor is not written to the document at all
     * (`accessZonesOf`), so adding one cannot break a building that was loading a moment ago, and
     * seeding the group means the reader's next action is a floor click rather than a text box. On a
     * building with no group yet the list is empty and `validateSpec` says what is missing.
     */
    const first = credentialGroupsOf(current)[0];
    const zone: SpecAccessZone = {
      id,
      floors: [],
      credentialGroups: first === undefined ? [] : [first],
    };
    selectedZoneId = id;
    patch({ accessZones: [...current.accessZones, zone] });
  });

  elements.removeZone.addEventListener('click', () => {
    const current = spec();
    if (current === undefined) return;
    const zone = zoneOf(current);
    if (zone === undefined) return;
    selectedZoneId = '';
    patch({ accessZones: current.accessZones.filter((entry) => entry.id !== zone.id) });
  });

  function addTypedGroup(): void {
    const current = spec();
    if (current === undefined) return;
    const zone = zoneOf(current);
    const typed = elements.groupName.value.trim();
    if (zone === undefined || typed === '') return;
    // Free entry retained, which § 10.2 asks for explicitly: the chips offer the groups the building
    // already uses and this is how the first one, and any new one, gets named.
    elements.groupName.value = '';
    if (zone.credentialGroups.includes(typed)) return;
    patch({ accessZones: withZoneGroup(current, zone.id, typed) });
  }

  elements.addTransport.addEventListener('click', () => {
    const current = spec();
    if (current === undefined) return;
    const id = nextTransportModeId(current);
    /*
     * A new machine starts on the two-level lobby every building already has the floors for: the
     * lowest sky floor and the level above it, or the ground lobby and floor 1 when the reader has
     * marked none. Adjacent by construction, which is the case the EN 115-1 seed is derived for.
     */
    const lower = [...current.skyFloors]
      .filter((floor) => floor > 0 && floor < current.floors)
      .sort((a, b) => a - b)[0];
    const connects: readonly [number, number] = lower === undefined ? [0, 1] : [lower, lower + 1];
    const mode: SpecTransportMode = {
      id,
      connects,
      traversalTimeS: escalatorSecondsFor(current, connects),
    };
    selectedTransportId = id;
    patch({ transportModes: [...current.transportModes, mode] });
  });

  elements.removeTransport.addEventListener('click', () => {
    const current = spec();
    if (current === undefined) return;
    const mode = transportOf(current);
    if (mode === undefined) return;
    selectedTransportId = '';
    patch({ transportModes: current.transportModes.filter((entry) => entry.id !== mode.id) });
  });

  elements.transportSeconds.addEventListener('change', () => {
    const current = spec();
    if (current === undefined) return;
    const mode = transportOf(current);
    if (mode === undefined) return;
    patch({
      transportModes: withTransportSeconds(current, mode.id, Number(elements.transportSeconds.value)),
    });
  });

  elements.groupAdd.addEventListener('click', addTypedGroup);
  elements.groupName.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addTypedGroup();
  });

  elements.elevationLevelOcc.addEventListener('click', () => {
    patch({ occupancyByFloor: {} });
  });

  elements.elevationClearRanges.addEventListener('click', () => {
    // The lobby flag goes with the bands, as it does in the handoff at `:3187`. It is only ever
    // meaningful on a band above the lobby, so leaving it behind would leave a flag on cars that no
    // longer have the band it described, waiting to change a building the next time one is dragged.
    patch({ bandByCar: {}, noLobby: {} });
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
              style: { width: '46px', flex: 'none', color: 'var(--faint)' },
            }),
            /*
             * The handoff's express toggle, `:736–738`, in the handoff's own trailing flex cell.
             *
             * A `chip` rather than a bare button so the state is on `aria-pressed` and not only in
             * the colour (KB-15) — and the label says it in words as well, because a reader
             * scanning this row should not have to hover to learn which way the switch is thrown.
             *
             * The two inline styles are the exception the module docstring allows only grudgingly,
             * and they are here because the stylesheet is not this change's to edit: `.chip` is
             * `white-space: nowrap`, the handoff's label is a whole clause, and the legend is a
             * narrow column. Ellipsis rather than overflow, with the full sentence in the tooltip.
             * They belong in an `.elev-legend-row .chip` rule in `index.html` when that file is free.
             */
            el(doc, 'span', {
              style: {
                flex: '1',
                'min-width': '0',
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
              },
              children: [
                car.canExpress
                  ? (() => {
                      const toggle = chip(doc, {
                        label: car.expressLabel,
                        selected: car.expressOn,
                        title: car.expressTitle,
                        onPick: () => {
                          setNoLobby(car.car, car.expressOn);
                        },
                      });
                      toggle.style.setProperty('overflow', 'hidden');
                      toggle.style.setProperty('text-overflow', 'ellipsis');
                      return toggle;
                    })()
                  : null,
              ],
            }),
          ],
        }),
      ),
    );
  }

  /* --- access zoning ------------------------------------------------------ */

  function drawAccess(current: BuildingSpec): void {
    const zone = zoneOf(current);
    const matrix = accessMatrixOf(current);

    fill(
      elements.zoneChips,
      chipRow(
        doc,
        zoneChoicesOf(current, selectedZoneId).map((choice) => {
          const id = choice.id;
          const floors = choice.floorCount;
          const groups = choice.groupCount;
          const runs = choice.runs;
          return {
            label: `${id} · ${String(floors)}f · ${String(groups)}g`,
            selected: choice.selected,
            title:
              floors === 0
                ? `${id} covers no floor yet, so it is not written to the document.`
                : `${id} covers ${runs} and admits ${String(groups)} credential group${groups === 1 ? '' : 's'}.`,
            onPick: () => {
              selectedZoneId = id;
              // A selection is not a document edit, so it re-renders through the shell rather than
              // through `patch` — which would mark the building dirty for a click that changed nothing.
              drawAccess(current);
            },
          };
        }),
      ),
    );
    elements.removeZone.disabled = zone === undefined;

    fill(
      elements.zoneFloors,
      ...(zone === undefined
        ? []
        : zoneFloorChoicesOf(current, zone.id).map((choice) => {
            const shared = choice.otherZoneIds;
            const node = el(doc, 'button', {
              className: 'zone-floor',
              text: choice.floorId,
              title:
                (choice.isEntrance ? `${ZONE_LOBBY_TITLE} ` : '') +
                ZONE_FLOOR_TITLE +
                (shared.length === 0
                  ? ''
                  : ` Also covered by ${shared.join(', ')} — permission is the union of every zone on a floor.`),
              attrs: {
                type: 'button',
                'aria-pressed': choice.inZone ? 'true' : 'false',
                'data-shared': shared.length > 0 ? 'true' : 'false',
              },
            });
            node.addEventListener('click', () => {
              patch({ accessZones: withZoneFloor(current, zone.id, choice.floor) });
            });
            return node;
          })),
    );

    fill(
      elements.zoneGroups,
      zone === undefined
        ? null
        : chipRow(
            doc,
            zoneGroupChoicesOf(current, zone.id).map((choice) => ({
              label: choice.group,
              selected: choice.inZone,
              title: ZONE_GROUP_TITLE,
              onPick: () => {
                patch({ accessZones: withZoneGroup(current, zone.id, choice.group) });
              },
            })),
          ),
    );
    elements.groupAdd.disabled = zone === undefined;
    elements.groupName.disabled = zone === undefined;

    /* The coverage matrix. A table, because it is one — rows are floors, columns are groups. */
    if (matrix.groups.length === 0) {
      fill(
        elements.accessMatrix,
        el(doc, 'div', {
          text: MATRIX_EMPTY,
          style: { font: '500 11px var(--mono)', color: 'var(--faint)', 'line-height': '1.6' },
        }),
      );
      setText(elements.accessLegend, '');
    } else {
      const head = el(doc, 'tr', {
        children: [
          el(doc, 'th', { text: 'FLOOR' }),
          ...matrix.groups.map((group) => el(doc, 'th', { text: group })),
          el(doc, 'th', { text: 'ZONE' }),
        ],
      });
      const body = matrix.rows.map((row) =>
        el(doc, 'tr', {
          attrs: { 'data-stranded': row.stranded ? 'true' : 'false' },
          children: [
            el(doc, 'th', { text: row.floorId }),
            ...row.cells.map((cell) =>
              el(doc, 'td', {
                /*
                 * The glyph *and* the word, in every cell, which is KB-15 rather than a preference:
                 * the three states differ by a green, a red and a grey, and a colour is the second
                 * signal here and never the only one. The class carries the colour; the text
                 * carries the fact.
                 */
                text: `${cell.glyph} ${cell.word}`,
                className: cell.unrestricted ? 'zcell-free' : cell.permitted ? 'zcell-open' : 'zcell-closed',
              }),
            ),
            el(doc, 'td', {
              text: row.zoneIds.join(', '),
              style: { color: 'var(--faint)' },
            }),
          ],
        }),
      );
      fill(
        elements.accessMatrix,
        el(doc, 'table', {
          children: [
            el(doc, 'thead', { children: [head] }),
            el(doc, 'tbody', { children: body }),
          ],
        }),
      );
      setText(elements.accessLegend, MATRIX_LEGEND);
    }

    /*
     * The state that strands demand, named rather than left to the colour of a row. It is reachable
     * only by emptying a zone's group list, and `validateSpec` says beside the elevation that the
     * loader will refuse it — this says which floors, at the control that produced them.
     */
    const stranded = matrix.strandedIds;
    setText(
      elements.accessWarning,
      stranded.length === 0
        ? ''
        : `No credential opens floor ${stranded.join(', ')} — every group has been withdrawn from ` +
            `the zone covering ${stranded.length === 1 ? 'it' : 'them'}, so the trips to ` +
            `${stranded.length === 1 ? 'that floor' : 'those floors'} are never generated at all ` +
            'and the run would report a mean over the people it could still carry.',
    );

    const restricted = matrix.restrictedIds.length;
    const zones = accessZonesOf(current).length;
    const groupCount = matrix.groups.length;
    setText(
      elements.accessNote,
      zones === 0
        ? ''
        : `${String(zones)} zone${zones === 1 ? '' : 's'} · ${String(restricted)} of ` +
            `${String(current.floors + 1)} floors restricted (${matrix.restrictedRuns}) · ` +
            `${String(groupCount)} credential group${groupCount === 1 ? '' : 's'}. ` +
            MATRIX_DISPATCHER_NOTE,
    );
  }

  /* --- sky lobbies -------------------------------------------------------- */

  function drawTransport(current: BuildingSpec): void {
    const mode = transportOf(current);

    fill(
      elements.transportChips,
      chipRow(
        doc,
        transportChoicesOf(current, selectedTransportId).map((choice) => ({
          label: `${choice.lowerId}↔${choice.upperId} · ${choice.seconds.toFixed(1)} s`,
          selected: choice.selected,
          title: choice.written
            ? choice.wayThrough
              ? `${choice.id} joins ${choice.lowerId} and ${choice.upperId} in ${choice.seconds.toFixed(1)} s, and one of the two is a transfer level, so a journey can change onto a lift there.`
              : `${choice.id} joins ${choice.lowerId} and ${choice.upperId} in ${choice.seconds.toFixed(1)} s. Neither is a transfer level, so it carries only the people who start on one of those floors and finish on the other.`
            : `${choice.id} is not written to the saved document — the elevation's warnings say why.`,
          onPick: () => {
            selectedTransportId = choice.id;
            // A selection is not a document edit, so it redraws rather than going through `patch`.
            drawTransport(current);
          },
        })),
      ),
    );
    elements.removeTransport.disabled = mode === undefined;
    elements.transportSeconds.disabled = mode === undefined;
    const seconds = mode === undefined ? '' : mode.traversalTimeS.toFixed(1);
    if (elements.transportSeconds.value !== seconds) elements.transportSeconds.value = seconds;

    for (const [end, node] of [
      [0, elements.transportLower],
      [1, elements.transportUpper],
    ] as const) {
      fill(
        node,
        ...(mode === undefined
          ? []
          : transportFloorChoicesOf(current, mode.id, end).map((choice) => {
              const button = el(doc, 'button', {
                className: 'zone-floor',
                text: choice.floorId,
                title: choice.blocked
                  ? TRANSPORT_BLOCKED_TITLE
                  : choice.isTransfer
                    ? `${TRANSPORT_TRANSFER_TITLE} ${TRANSPORT_LANDING_TITLE}`
                    : TRANSPORT_LANDING_TITLE,
                attrs: {
                  type: 'button',
                  'aria-pressed': choice.chosen ? 'true' : 'false',
                  'data-shared': choice.isTransfer ? 'true' : 'false',
                },
              });
              button.disabled = choice.blocked;
              button.addEventListener('click', () => {
                patch({ transportModes: withTransportEnd(current, mode.id, end, choice.floor) });
              });
              return button;
            })),
      );
    }

    setText(elements.transportNote, transportNoteOf(current));
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

    /* The elevation, then access zoning — the second kind, in its own block — then the machines
     * that are not lifts, which are neither. */
    drawElevation(current);
    drawAccess(current);
    drawTransport(current);

    const handSet = Object.keys(current.occupancyByFloor).length;
    // *Release every shaft* now clears the lobby flag too, so it has to appear when only that was
    // set — a reader who has turned express off on a default sky-lobby band has something to release
    // even though they have pinned nothing.
    const pinned =
      Object.keys(current.bandByCar).length +
      Object.values(current.noLobby).filter((off) => off).length;
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
