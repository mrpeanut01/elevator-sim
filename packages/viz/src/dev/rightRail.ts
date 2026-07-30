/**
 * The right rail — four segments over *what is running* (`docs/12-design-handoff.md` § 1.4,
 * R1–R3).
 *
 * ## What this mount is, and what the shell keeps
 *
 * `dev/surfaces.ts` owns the segmented control: which button is selected, which panel is hidden,
 * which one the arrow keys reach. This file owns **the contents of the four panels** and nothing
 * else — a list, a `SCHEDULE` plate and a link, four times over. Re-implementing the segment
 * machinery here would be a second answer to *which segment is open*, which is the failure this
 * package has a rule about.
 *
 * ## Every figure is derived, and the handoff's are not
 *
 * The handoff's plates are computed from a prototype's own re-authored buildings: its building
 * schedule contains a nominal round trip (`(rise * 2) / speed + stops * 5.4 + cap * 1.92`), an
 * interval derived from it, and a handling capacity derived from *that*. None of the three is
 * reproduced. `docs/12` § 4.2 replaces every figure with one the recording actually produced, and
 * the consequence for this file is the rule stated in one line:
 *
 * > **A plate never computes a round trip. It reads one off the run, or it says there is no run.**
 *
 * So `handling capacity` and `achieved interval` appear **if and only if** a recording exists, and
 * before the first run the plate says so in a row of its own rather than quietly filling the space
 * with arithmetic the simulator did not do. The rest — floors, rise, population, shafts, car
 * capacity — comes off the *resolved* building, which is the grown one the day is actually being
 * run against.
 *
 * The dispatcher plate is read from `resolveDispatchConfig`, not from the profile as authored:
 * every one of `load sensor`, `pooling`, `zoning` and `parking` has a default that a profile
 * declining to mention it still gets, and a plate that read only the authored object would print
 * *none* about a behaviour that is on.
 *
 * ## The two averages this rail is allowed to print, and the one it is not
 *
 * `handlingCapacity` is a rate over counts — people carried per five minutes against people
 * offered per five minutes — and is never suppressed. `achievedInterval.meanS` **is** a mean, of
 * the gaps between car departures, and § 1.5 B8 is unconditional: *nothing on the screen is
 * averaged over a queue that never settled*. So the interval row is withheld whenever
 * `meansAreSuppressed(recording)`, and says which gate withheld it. Nothing here reaches for
 * `meanWaitS`, `wait95S` or `meanTimeToDestinationS` at all.
 *
 * ## KB-15
 *
 * The rail has one colour-bearing state — which card in a list is selected — and `dom.ts`'s
 * `pick` carries it as `aria-pressed` rather than as a class, so the selection is a fact a screen
 * reader has. The machine-class advisory leads with `⚠` when it fires, and reads as an ordinary
 * sentence when it does not.
 */

import {
  DECLARED_TERM_IDS,
  DispatchError,
  resolveDispatchConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type ResolvedDispatchConfig,
} from '@elevator-sim/core/browser';

import { checkAccessCompatibility } from '../access/dispatcherCredentials.js';
import { plainDescription, type MachineClass } from '../authoring/machineSpec.js';
import {
  PEAK_ORDER_INFO,
  patternSummary,
  specFromTrafficProfile,
  type PatternSpec,
} from '../authoring/patternSpec.js';
import type { VizRecording } from '../contract/types.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { statLineOf } from '../shift/contracts.js';

import type { BrowserResources } from './data.js';
import { resolveEdited } from './data.js';
import { fill, fillPlate, pick, setHidden, setText, type PlateEntry } from './dom.js';
import type { RailElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import {
  allBuildingIds,
  allClasses,
  allDispatchers,
  buildingConfigOf,
  disclosureOf,
  profileById,
  type SavedPattern,
  type ViewerState,
} from './state.js';

/**
 * What this mount owns: `Elements['rail']` and nothing else.
 *
 * An alias rather than a fresh interface, because the manifest in `dev/elementMap.ts` is already
 * the list of what the page must contain and a second declaration of the same twenty-three fields
 * would be a copy that can drift from it.
 */
export type RightRailElements = RailElements;

/* -------------------------------------------------------------------------- *
 * Dispatcher — § 1.4 R2, R3
 * -------------------------------------------------------------------------- */

/**
 * The family word beside a profile's name.
 *
 * `role` is the file's own word for it and eight of the twelve shipped profiles carry one. The
 * other four are plain weighted-cost vectors with no role declared, and they get the engine's
 * name rather than an invented family: making one up here would be a taxonomy this repository
 * maintains in a renderer, which is where taxonomies go stale.
 */
export function dispatcherFamilyOf(profile: DispatcherProfile): string {
  return profile.role ?? profile.engine ?? 'weighted cost';
}

/**
 * The blurb under a profile's name in the list.
 *
 * The profile's own `$comment` when it has one — `data/dispatcher-profiles.json` writes a good
 * paragraph on the five that need explaining, and paraphrasing it here would be a second
 * description of the same strategy. When it has none, an honest one-liner **generated from the
 * weight vector**, because the alternative the handoff takes — an authored blurb per dispatcher —
 * is a string that goes stale the first time somebody re-weights a term.
 */
export function dispatcherBlurbOf(profile: DispatcherProfile): string {
  const comment = profile.$comment;
  if (comment !== undefined && comment.trim() !== '') return comment;
  const weighted = weightedTermsOf(profile.weights);
  if (weighted.length === 0) return 'no term weighted — every car prices the same.';
  const heaviest = weighted
    .slice(0, 3)
    .map(([id, weight]) => `${id} ${weight.toFixed(2)}`)
    .join(', ');
  return (
    `${String(weighted.length)} of ${String(DECLARED_TERM_IDS.length)} terms weighted; ` +
    `heaviest ${heaviest}.`
  );
}

/** `n of m · family` — the eyebrow note, design `:924`. */
export function dispatcherNoteOf(
  profiles: readonly DispatcherProfile[],
  currentId: string,
): string {
  const index = profiles.findIndex((profile) => profile.id === currentId);
  const position = index === -1 ? 1 : index + 1;
  const current = index === -1 ? profiles[0] : profiles[index];
  const family = current === undefined ? 'unknown' : dispatcherFamilyOf(current).toLowerCase();
  return `${String(position)} of ${String(profiles.length)} · ${family}`;
}

/**
 * The eight-row `SCHEDULE` plate — design `:2596–2612`, re-sourced.
 *
 * Every row below the second is read off the **resolved** configuration. The design reads four of
 * them off an authored `flags` object, which is the shape of defect this file's docstring names:
 * `parkingStrategy` defaults to `stay`, `assignmentMode` to `single-car` and
 * `maxLoadFactorForAssignment` to `1`, so a profile that declares none of them still *has* all
 * three, and a plate reading the authored object would print nothing about any of them.
 *
 * A profile this engine refuses — an unknown weight, an engine it does not implement — has no
 * resolved configuration to describe, and the plate says exactly that rather than falling back to
 * defaults it would not run with. `credentialCapabilityOf` takes the same line for the same reason.
 */
export function dispatcherPlateOf(profile: DispatcherProfile): readonly PlateEntry[] {
  let resolved: ResolvedDispatchConfig;
  try {
    resolved = resolveDispatchConfig(profile);
  } catch (error) {
    if (!(error instanceof DispatchError)) throw error;
    return [
      { k: 'profile', v: profile.name },
      { k: 'family', v: dispatcherFamilyOf(profile) },
      { k: 'refused', v: 'this engine will not build it', help: error.message },
    ];
  }

  const weighted = [
    ...weightedTermsOf(Object.fromEntries(resolved.weights)),
    ...weightedTermsOf(Object.fromEntries(resolved.pendingWeights)),
  ].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const heaviest = weighted
    .slice(0, 3)
    .map(([id, weight]) => `${id} ${weight.toFixed(2)}`)
    .join(' · ');

  const eligibility = resolved.eligibility;
  const dispatch = resolved.dispatch;
  const zoneAffinity = resolved.weights.get('zoneAffinity') ?? 0;

  return [
    { k: 'profile', v: resolved.name },
    { k: 'family', v: dispatcherFamilyOf(profile) },
    {
      k: 'terms weighted',
      v: `${String(weighted.length)} of ${String(DECLARED_TERM_IDS.length)}`,
      help:
        'The cost-term library declares twelve terms; this counts the ones this profile gives a ' +
        'non-zero weight. A term weighted zero reaches the scorer and changes no decision.',
    },
    {
      k: 'heaviest',
      v: heaviest === '' ? 'none' : heaviest,
      help:
        'The three largest weights, as authored. Weights are applied to normalised terms, so ' +
        'they are comparable with one another and carry no unit.',
    },
    {
      k: 'load sensor',
      v: loadSensorPhrase(
        eligibility.maxLoadFactorForAssignment,
        resolved.answer.allowBypassIfSoleEligibleCar,
      ),
      help:
        '`eligibility.maxLoadFactorForAssignment` — the group\'s own load filter, which is not ' +
        "the car's bypass threshold. At 1.0 it is inert and the car's load cell is the only filter.",
    },
    {
      k: 'pooling',
      v: poolingPhrase(dispatch.passengerAssignment, dispatch.assignmentMode, dispatch.splitThresholdPassengers),
      help:
        '`dispatch.passengerAssignment` and `dispatch.assignmentMode`. A landing panel pools by ' +
        'destination; `split-demand` sends a second car to a landing deeper than the threshold.',
    },
    {
      k: 'zoning',
      v:
        zoneAffinity > 0
          ? `zone affinity weighted ${zoneAffinity.toFixed(2)}`
          : 'none — the group is undivided',
      help:
        'Operational zoning is the `zoneAffinity` cost term, not a building fact. Service zoning ' +
        "is the bank's `servesFloors` and access zoning is the credential; the three are distinct.",
    },
    {
      k: 'parking',
      v: PARKING_WORDS[resolved.idle.parkingStrategy] ?? resolved.idle.parkingStrategy,
      help: '`idle.parkingStrategy` — where a car with nothing to do goes.',
    },
  ];
}

const PARKING_WORDS: Readonly<Record<string, string>> = Object.freeze({
  stay: 'stays where it stopped',
  lobby: 'returns to the lobby',
  'zone-center': 'centre of its zone',
  'predicted-demand': 'where demand is forecast',
});

function loadSensorPhrase(maxLoadFactor: number, soleEligibleOverride: boolean): string {
  const base =
    maxLoadFactor >= 1
      ? 'the car’s own bypass only'
      : `no car above ${(maxLoadFactor * 100).toFixed(0)}% load`;
  return soleEligibleOverride ? `${base} · sole-eligible override on` : base;
}

function poolingPhrase(
  passengerAssignment: string,
  assignmentMode: string,
  splitThreshold: number,
): string {
  if (passengerAssignment === 'panel') return 'by destination, at the panel';
  if (assignmentMode === 'split-demand') return `split above ${String(splitThreshold)} waiting`;
  return 'none';
}

/** Term ids with a non-zero weight, heaviest first, ties by id so the order is stable. */
function weightedTermsOf(
  weights: Readonly<Record<string, number>>,
): readonly (readonly [string, number])[] {
  return Object.entries(weights)
    .filter(([, weight]) => weight !== 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/* -------------------------------------------------------------------------- *
 * Traffic — § 1.4 R3
 * -------------------------------------------------------------------------- */

/**
 * The arrival pattern in the units a traffic study is written in.
 *
 * The design's plate names a first and a second peak at authored clock times. There is no
 * sixteen-hour day here to hang them on (`docs/12` § 4.1) and inventing one would be a schedule
 * the demand underneath does not have, so the rows are the engine's own parameters instead: the
 * peak rate, how long it holds, the batch mean and the interfloor share. Each carries the field
 * it is read from, so a reader can check the claim against `authoring/patternSpec.ts`.
 *
 * `population` is the **resolved** building's, which is the grown one the day is run against, and
 * is `undefined` before a building resolves rather than `0`.
 */
export function trafficPlateOf(
  spec: PatternSpec,
  population: number | undefined,
): readonly PlateEntry[] {
  const order = PEAK_ORDER_INFO[spec.order];
  return [
    { k: 'pattern', v: spec.name },
    { k: 'peak order', v: order.label, help: order.note },
    {
      k: 'peak rate',
      v: `${spec.ratePctPop5min.toFixed(1)} %pop/5 min`,
      help:
        '`demand.arrivalRatePctPop5min` — arrivals at the peak as a percentage of population ' +
        'every five minutes. The day’s event may scale it; see TODAY’S SHIFT.',
    },
    {
      k: 'peak holds',
      v: `${String(Math.round(spec.peakWindowS))} s`,
      help: '`demand.peakWindowS`, which is also the reporting window under `rise-and-fall`.',
    },
    {
      k: 'group size',
      v: `${spec.batchMean.toFixed(1)} people`,
      help:
        '`batchSize.mean`. Passengers arrive in batches, not one at a time; batch size changes ' +
        'loading and stopping more than the mean rate does.',
    },
    {
      k: 'interfloor',
      v: `${String(Math.round(spec.interfloorShare * 100))}% of trips`,
      help: 'The `interfloor` component of `demand.directionalSplit` — trips that never touch an entrance.',
    },
    {
      k: 'population',
      v: population === undefined ? 'no building resolved' : `${grouped(population)} people`,
      help: 'The resolved building’s own total, grown to today. The rate above is a share of it.',
    },
    {
      k: 'measured on',
      v: 'observed calls only',
      help:
        'Every figure this viewer reports about a run is a count of something that happened. ' +
        'Nothing on this plate is modelled from a nominal round trip.',
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Building — § 1.4 R3
 * -------------------------------------------------------------------------- */

/**
 * The consultant's traffic-analysis schedule, derived from the building and the run.
 *
 * The design's version computes a nominal round trip and derives an interval and a handling
 * capacity from it. All three are dropped: this simulator *measures* the last two, and a nominal
 * figure printed beside measured ones is an invitation to compare them, which is exactly the
 * comparison a single run cannot support.
 *
 * So the plate is in two halves. Above the line, five facts about the building as resolved — none
 * of which depends on a run. Below it, the two the run produced, and **when there is no run the
 * plate says so** rather than leaving the space or filling it.
 */
export function buildingPlateOf(
  building: ResolvedBuilding,
  recording: VizRecording | undefined,
): readonly PlateEntry[] {
  const heights = building.floors.map((floor) => floor.heightM);
  const rise = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0;
  const cars = building.banks.flatMap((bank) => bank.cars);
  const entrance = building.entranceFloors[0];
  const aboveEntrance =
    entrance === undefined
      ? undefined
      : building.floors.filter((floor) => floor.index > entrance.index).length;

  const rows: PlateEntry[] = [
    {
      k: 'floors served',
      v:
        aboveEntrance === undefined
          ? String(building.floors.length)
          : `${String(building.floors.length)} (${String(aboveEntrance)} above the entrance)`,
      help: 'Expanded floors, so a building declared with `floorRanges` counts the same as one declared floor by floor.',
    },
    { k: 'travel height', v: `${rise.toFixed(1)} m`, help: 'Highest floor to lowest, by height above datum.' },
    { k: 'population', v: `${grouped(building.totalPopulation)} people`, help: 'Sum of the expanded floors’ populations, grown to today.' },
    {
      k: 'shafts',
      v: `${String(cars.length)} cars in ${String(building.banks.length)} bank${building.banks.length === 1 ? '' : 's'}`,
      help: 'A double-deck car is one car: it occupies one shaft.',
    },
    {
      k: 'car capacity',
      v: capacityPhrase(cars),
      help: 'Persons at rated load, and at the design load a traffic study actually sizes on.',
    },
  ];

  if (recording === undefined) {
    rows.push({
      k: 'measured',
      v: 'no run yet',
      help:
        'Handling capacity and interval are measured from a run, never computed from a nominal ' +
        'round trip. Run a shift and both appear here.',
    });
    return rows;
  }

  const summary = recording.summary;
  const capacity = summary.handlingCapacity;
  rows.push({
    k: 'handling capacity',
    v:
      capacity.pctPopulationPer5Min === null
        ? `${capacity.personsPer5Min.toFixed(1)} persons / 5 min`
        : `${capacity.pctPopulationPer5Min.toFixed(1)}% of population / 5 min`,
    help:
      `Carried ${capacity.personsPer5Min.toFixed(1)} people every five minutes against ` +
      `${capacity.offeredPer5Min.toFixed(1)} arriving. A count, not an estimate.`,
  });

  const interval = summary.achievedInterval;
  if (meansAreSuppressed(recording)) {
    rows.push({
      k: 'achieved interval',
      v: 'withheld',
      help:
        'A mean gap between departures is still a mean. This run does not clear the checks an ' +
        `average has to clear: ${summary.awtInvalidReason ?? 'the queues did not reach a steady state.'}`,
    });
  } else if (interval.meanS !== null) {
    rows.push({
      k: 'achieved interval',
      v: `${interval.meanS.toFixed(1)} s over ${String(interval.count)} gaps`,
      help:
        'Mean spacing of car departures from the terminal. The gap count is carried because a ' +
        'mean over two gaps is a different claim from one over sixty.',
    });
  } else {
    rows.push({
      k: 'achieved interval',
      v: 'not reconstructed',
      help: 'Too few departures from the terminal in the window to fit a gap.',
    });
  }
  return rows;
}

type ResolvedCars = ResolvedBuilding['banks'][number]['cars'];

/**
 * `16 persons · 12 at design load`, or a range when the fleet is mixed.
 *
 * Both halves are stated because the second is the one a traffic study sizes on: cars fill to
 * 80 % of rated capacity, not 100 %, and a plate that printed only the nameplate figure would be
 * systematically optimistic in exactly the way CLAUDE.md's modelling rules name.
 */
function capacityPhrase(cars: ResolvedCars): string {
  if (cars.length === 0) return 'no cars';
  const persons = cars.map((car) => car.capacityPersons);
  const design = cars.map((car) => car.designCapacityPersons);
  const low = Math.min(...persons);
  const high = Math.max(...persons);
  const head = low === high ? `${String(low)} persons` : `${String(low)}–${String(high)} persons`;
  const designLow = Math.min(...design);
  const designHigh = Math.max(...design);
  const tail =
    designLow === designHigh
      ? `${String(designLow)} at design load`
      : `${String(designLow)}–${String(designHigh)} at design load`;
  return `${head} · ${tail}`;
}

/* -------------------------------------------------------------------------- *
 * Machines — § 1.4 R3, engineer only
 * -------------------------------------------------------------------------- */

/**
 * The `NAMEPLATE` plate. Engineer mode only — `#rail-nameplate-block` is hidden in casual (B1).
 *
 * The class record supplies the envelope; `data/elevator-specs.json`'s **file-level** `doors`,
 * `timing` and `loadSensor` blocks supply everything else, because those are shared by every
 * class and are not per-class fields — `authoring/machineSpec.ts` refuses to draw a slider for
 * them for the same reason.
 *
 * The design's footnote under this plate states the 80 % fill rule in prose. It is also a **row**
 * here, carrying `conventions.designLoadFactor` itself, because the prose is a claim about a
 * number in the data file and this repository has a documented history of prose that was wrong
 * about the code.
 */
export function nameplateOf(
  machineClass: MachineClass,
  specs: ElevatorSpecs,
): readonly PlateEntry[] {
  const doors = specs.doors;
  const timing = specs.timing;
  const sensor = specs.loadSensor;
  const fill80 = specs.conventions.designLoadFactor;
  const transfer = timing.passengerTransferS;

  return [
    { k: 'class', v: machineClass.name, help: machineClass.application },
    {
      k: 'rated speed',
      v: `${machineClass.speedMinMps.toFixed(2)}–${machineClass.speedMaxMps.toFixed(2)} m/s, typical ${machineClass.speedTypicalMps.toFixed(2)}`,
      help: 'A car outside the band is not a car of this class.',
    },
    {
      k: 'ride',
      v: `${machineClass.accelerationMps2.toFixed(2)} m/s² · ${machineClass.jerkMps3.toFixed(2)} m/s³`,
      help:
        'Acceleration and jerk are modelled, so a short hop never reaches rated speed. A ' +
        'simulator that ignored them would wrongly conclude faster lifts always help.',
    },
    {
      k: 'rated envelope',
      v: `to ${String(machineClass.maxRiseM)} m and ${String(machineClass.maxFloors)} floors`,
      help: 'Reference application guidance. `config/parse.ts` raises a warning past it and builds the bank anyway.',
    },
    {
      k: 'rated load',
      v: `${String(machineClass.loadMinLb)}–${String(machineClass.loadMaxLb)} lb`,
      help: 'The rated-load range this class is built in. Imperial, and the unit is in the name.',
    },
    {
      k: 'design load',
      v: `${(fill80 * 100).toFixed(0)}% of rated`,
      help:
        '`conventions.designLoadFactor`. Cars fill to this, never to the nameplate — using the ' +
        'nameplate is how a study ends up flattering.',
    },
    {
      k: 'doors',
      v: `centre ${doors.centerOpening.openS.toFixed(1)}/${doors.centerOpening.closeS.toFixed(1)} s · side ${doors.sideOpening.openS.toFixed(1)}/${doors.sideOpening.closeS.toFixed(1)} s`,
      help: 'Open and close times per door type, shared by every class.',
    },
    {
      k: 'dwell',
      v: `car call ${doors.dwellCarCallS.typical.toFixed(1)} s · hall call ${doors.dwellHallCallS.typical.toFixed(1)} s`,
      help: 'Hall dwell is longer: passengers have to walk to the car.',
    },
    {
      k: 'start & levelling',
      v: `${timing.motorStartDelayS.toFixed(1)} s · ${timing.levelingSettleS.typical.toFixed(1)} s`,
      help: 'Fixed costs outside the motion profile, paid on every stop.',
    },
    {
      k: 'transfer',
      v: `${transfer.office.toFixed(1)} / ${transfer.residential.toFixed(1)} / ${transfer.hotel.toFixed(1)} s`,
      help:
        'Seconds per passenger per direction, office / residential / hotel. The `2·P·tp` term of ' +
        'the round trip, and the term it is most sensitive to.',
    },
    {
      k: 'load sensor',
      v: `bypass at ${(sensor.hallCallBypassThreshold * 100).toFixed(0)}% · alarm at ${(sensor.overloadAlarmThreshold * 100).toFixed(0)}%`,
      help: 'Fractions of rated load at which the car stops answering hall calls and at which it will not start.',
    },
  ];
}

/**
 * Whether the `NAMEPLATE` block is on screen — § 1.4 R3 and § 1.5 B1.
 *
 * A function of one argument and it is still worth being one, because the alternative is a
 * comparison written inline in a DOM write, which is a decision no test in this repository can
 * reach. *Casual gets a lever, not a lecture*: a door-dwell reference value and a jerk limit are
 * a lecture.
 */
export function nameplateVisibleIn(mode: 'casual' | 'engineer'): boolean {
  return mode === 'engineer';
}

/**
 * Whether the running building's rise sits inside the class's envelope.
 *
 * **An advisory, and it says so.** `config/parse.ts` raises the same finding as a *warning* —
 * *"the reference envelope is application guidance, not a hard limit"* — and builds the bank
 * anyway, so the run happens and its figures describe a machine outside its class. A line here
 * that said the loader refuses would be describing behaviour this project does not have.
 */
export function machineWarningOf(
  machineClass: MachineClass,
  building: ResolvedBuilding | undefined,
): string {
  if (building === undefined) {
    return 'The class sets the speed band, the rise it can serve and the loads it is built in.';
  }
  const heights = building.floors.map((floor) => floor.heightM);
  const rise = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0;
  const floors = building.floors.length;
  const over: string[] = [];
  if (rise > machineClass.maxRiseM) {
    over.push(
      `${rise.toFixed(0)} m of rise against a class rated for ${String(machineClass.maxRiseM)} m`,
    );
  }
  if (floors > machineClass.maxFloors) {
    over.push(
      `${String(floors)} floors against a class rated for ${String(machineClass.maxFloors)}`,
    );
  }
  if (over.length === 0) {
    return (
      `${building.name} is inside this class's envelope. The class sets the speed band, the rise ` +
      'it can serve and the loads it is built in.'
    );
  }
  return (
    `⚠ ${over.join(', and ')}. That is an advisory rather than a refusal: the loader raises it as ` +
    'a warning and builds the bank anyway, so the run happens and the figures describe a machine ' +
    'outside its class.'
  );
}

/* -------------------------------------------------------------------------- *
 * The pattern list — § 1.4 R2
 * -------------------------------------------------------------------------- */

/** One selectable arrival pattern. `'building'` is the comparable default; see `PatternSelection`. */
export interface PatternOption {
  readonly id: string;
  readonly label: string;
  readonly tag: string;
  readonly sub: string;
  readonly help: string;
}

/**
 * `'building'`, then every shipped profile, then the reader's own.
 *
 * `'building'` is first and tagged `DEFAULT` because it is the only selection under which the
 * run's demand is the building's own `trafficProfile` — the demand every published figure in this
 * repository was measured under. Choosing anything else is choosing to leave the comparable case,
 * and the card says so rather than leaving a reader to find out from `DECISIONS.md`.
 */
export function patternOptionsOf(
  resources: BrowserResources,
  saved: readonly SavedPattern[],
  building: ResolvedBuilding | undefined,
): readonly PatternOption[] {
  const own =
    building === undefined
      ? undefined
      : resources.trafficProfiles.profiles.find(
          (profile) => profile.id === building.trafficProfile,
        );
  const options: PatternOption[] = [
    {
      id: 'building',
      label: own === undefined ? 'The building’s own profile' : own.name,
      tag: 'DEFAULT',
      sub: 'the demand every published figure in this project was measured under',
      help:
        'Runs the building’s declared `trafficProfile` with no demand override at all, rather ' +
        'than reconstructing its numbers and passing them back in.',
    },
  ];
  for (const profile of resources.trafficProfiles.profiles) {
    options.push({
      id: profile.id,
      label: profile.name,
      tag: profile.governingPeak,
      sub:
        `${profile.arrivalRatePctPop5min.typical.toFixed(1)} %pop/5 min · groups of ` +
        `${profile.batchSize.mean.toFixed(1)} · ` +
        `${String(Math.round(profile.directionalSplit.interfloor * 100))}% interfloor`,
      help: profile.$comment ?? `Sized against ${profile.governingPeak}.`,
    });
  }
  for (const entry of saved) {
    options.push({
      id: entry.id,
      label: entry.spec.name,
      tag: 'YOURS',
      sub: patternSummary(entry.spec),
      help: 'A pattern you saved. Editing a shipped one never overwrites it.',
    });
  }
  return options;
}

/** The `PatternSpec` the current selection amounts to — the plate's input. */
export function selectedPatternSpecOf(
  resources: BrowserResources,
  state: ViewerState,
  building: ResolvedBuilding | undefined,
): PatternSpec {
  if (state.pattern !== 'building') {
    const saved = state.savedPatterns.find((entry) => entry.id === state.pattern);
    if (saved !== undefined) return saved.spec;
    return specFromTrafficProfile(resources.trafficProfiles, state.pattern);
  }
  return specFromTrafficProfile(resources.trafficProfiles, building?.trafficProfile);
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/**
 * Build the right rail. Nothing is drawn until {@link Panel.render} is called.
 *
 * ## Why the lists are keyed and not simply refilled
 *
 * `render` runs on every playback frame, and `fill` replaces a container's children. A list
 * rebuilt sixty times a second would move focus off whatever the reader was tabbing through and
 * drop the pointer's hover on every card — a keyboard user could not reach the fourth dispatcher
 * at all. So each container carries the signature of what it last drew and is rebuilt only when
 * that changes. It is a correctness measure with a performance side effect, not the other way
 * round.
 */
export function mountRightRail(ui: RightRailElements, context: MountContext): Panel {
  const doc = ui.root.ownerDocument;

  /*
   * The four `Open … editor →` buttons. They move to a surface and do nothing else — in
   * particular they do not seed the editors' working copies from the rail's selection, because
   * doing so would silently discard an unsaved edit the reader left on that tab.
   */
  ui.openDispatcher.addEventListener('click', () => {
    context.openTab('dispatcher');
  });
  ui.openTraffic.addEventListener('click', () => {
    context.openTab('traffic');
  });
  ui.openBuilding.addEventListener('click', () => {
    context.openTab('building');
  });
  ui.openMachines.addEventListener('click', () => {
    context.openTab('machines');
  });

  const dispatcherList = keyedList(ui.dispatcherList);
  const trafficList = keyedList(ui.trafficList);
  const buildingList = keyedList(ui.buildingList);
  const machinesList = keyedList(ui.machinesList);
  const dispatcherPlate = keyedPlate(ui.dispatcherPlate);
  const trafficPlate = keyedPlate(ui.trafficPlate);
  const buildingPlate = keyedPlate(ui.buildingPlate);
  const machinesPlate = keyedPlate(ui.machinesPlate);

  return {
    render(view: ViewAt): void {
      const { resources, state, recording, building } = view;

      /* ---- Dispatcher ---- */
      const profiles = allDispatchers(resources, state.savedDispatchers);
      const profile = profileById(resources, state.savedDispatchers, state.dispatcherId);
      setText(ui.dispatcherNote, dispatcherNoteOf(profiles, state.dispatcherId));
      dispatcherList(
        profiles.map((entry) => `${entry.id}${entry.id === state.dispatcherId ? '*' : ''}`).join('|'),
        () =>
          profiles.map((entry) =>
            pick(doc, {
              title: entry.name,
              sub: dispatcherBlurbOf(entry),
              tag: dispatcherFamilyOf(entry).toUpperCase(),
              selected: entry.id === state.dispatcherId,
              help: `Profile id \`${entry.id}\`.`,
              onPick: () => {
                context.update({ dispatcherId: entry.id });
                context.runShift();
              },
            }),
          ),
      );
      dispatcherPlate(dispatcherPlateOf(profile));
      setText(
        ui.accessNote,
        building === undefined
          ? ''
          : (checkAccessCompatibility({
              buildingName: building.name,
              floorIds: building.floors.map((floor) => floor.id),
              accessZones: building.accessZones,
              profile,
              profiles,
            }).warning ?? ''),
      );

      /* ---- Traffic ---- */
      const patterns = patternOptionsOf(resources, state.savedPatterns, building);
      const spec = selectedPatternSpecOf(resources, state, building);
      setText(ui.trafficNote, `${spec.ratePctPop5min.toFixed(1)} %pop/5 min`);
      trafficList(
        patterns.map((entry) => `${entry.id}${entry.id === state.pattern ? '*' : ''}`).join('|'),
        () =>
          patterns.map((entry) =>
            pick(doc, {
              title: entry.label,
              sub: entry.sub,
              tag: entry.tag.toUpperCase(),
              selected: entry.id === state.pattern,
              help: entry.help,
              onPick: () => {
                context.update({ pattern: entry.id });
                context.runShift();
              },
            }),
          ),
      );
      trafficPlate(trafficPlateOf(spec, building?.totalPopulation));

      /* ---- Building ---- */
      const buildingIds = allBuildingIds(resources, state.savedBuildings);
      setText(ui.buildingNote, buildingNoteOf(building));
      buildingList(
        buildingIds.map((id) => `${id}${id === state.buildingId ? '*' : ''}`).join('|'),
        () =>
          buildingIds.map((id) => {
            const card = buildingCardOf(resources, state, id);
            return pick(doc, {
              title: card.label,
              sub: card.sub,
              selected: id === state.buildingId,
              help: `Building id \`${id}\`.`,
              onPick: () => {
                context.update({ buildingId: id });
                context.runShift();
              },
            });
          }),
      );
      if (building === undefined) {
        buildingPlate([
          {
            k: 'building',
            v: 'not resolved',
            help: 'The schedule is derived from the resolved building; nothing has resolved yet.',
          },
        ]);
      } else {
        buildingPlate(buildingPlateOf(building, recording));
      }

      /* ---- Machines ---- */
      const classes = allClasses(resources, state.savedClasses);
      const selectedClass =
        classes.find((entry) => entry.id === state.editingClassId) ?? classes[0];
      setText(ui.machinesNote, machinesNoteOf(building));
      machinesList(
        classes.map((entry) => `${entry.id}${entry.id === selectedClass?.id ? '*' : ''}`).join('|'),
        () =>
          classes.map((entry) =>
            pick(doc, {
              title: entry.name,
              sub: plainDescription(entry),
              tag: entry.yours ? 'YOURS' : entry.application,
              selected: entry.id === selectedClass?.id,
              help: entry.application,
              onPick: () => {
                context.update({ editingClassId: entry.id });
              },
            }),
          ),
      );
      // § 1.4 R3 / B1 — the nameplate is engineer-only. Casual gets a lever, not a lecture.
      const engineer = nameplateVisibleIn(disclosureOf(state.mode));
      setHidden(ui.nameplateBlock, !engineer);
      if (engineer && selectedClass !== undefined) {
        machinesPlate(nameplateOf(selectedClass, resources.elevatorSpecs));
      }
      setText(
        ui.machinesWarning,
        selectedClass === undefined
          ? 'No machine class is loaded.'
          : machineWarningOf(selectedClass, building),
      );
    },
  };
}

/* ---- helpers the mount uses and nothing else does ---- */

interface BuildingCard {
  readonly label: string;
  readonly sub: string;
}

/**
 * A building's card, with its stat line generated from the building rather than authored
 * (`docs/12` § 4.4).
 *
 * A building the reader saved is resolved through the same door a shipped one goes through, so a
 * card cannot describe a building the runner would refuse. When it *is* refused the card says so
 * and names the refusal, which is the state the building editor exists to get the reader out of.
 */
function buildingCardOf(
  resources: BrowserResources,
  state: ViewerState,
  id: string,
): BuildingCard {
  const shipped = resources.entries.find((entry) => entry.config.id === id);
  if (shipped !== undefined) {
    return { label: shipped.resolved.name, sub: statLineOf(shipped.resolved) };
  }
  const config = buildingConfigOf(resources, state.savedBuildings, id);
  if (config === undefined) return { label: id, sub: 'not loaded' };
  try {
    return { label: `${config.name} · yours`, sub: statLineOf(resolveEdited(resources, config)) };
  } catch (error) {
    return {
      label: `${config.name} · yours`,
      sub: `does not resolve — ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildingNoteOf(building: ResolvedBuilding | undefined): string {
  if (building === undefined) return 'no building resolved';
  const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
  const inService = building.banks
    .flatMap((bank) => bank.cars)
    .filter((car) => car.mode === 'in-service').length;
  return inService === cars
    ? `${String(cars)} shafts in use`
    : `${String(inService)} of ${String(cars)} shafts in use`;
}

function machinesNoteOf(building: ResolvedBuilding | undefined): string {
  if (building === undefined) return 'no run yet';
  const speeds = building.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps));
  if (speeds.length === 0) return 'no cars';
  return `running at ${Math.max(...speeds).toFixed(2)} m/s`;
}

/** Rebuild a list only when its signature changes. See {@link mountRightRail}'s docstring. */
function keyedList(host: Element): (key: string, build: () => readonly Node[]) => void {
  let last: string | undefined;
  return (key, build) => {
    if (key === last) return;
    last = key;
    fill(host, ...build());
  };
}

/** The same, for a plate, keyed on the rows it would draw. */
function keyedPlate(host: Element): (rows: readonly PlateEntry[]) => void {
  let last: string | undefined;
  return (rows) => {
    const key = rows.map((entry) => `${entry.k}\u0000${entry.v}`).join('\u0001');
    if (key === last) return;
    last = key;
    fillPlate(host, rows);
  };
}

/**
 * `1710` → `1,710`.
 *
 * Hand-rolled rather than `toLocaleString`, for the reason `shift/contracts.ts` gives about the
 * same job: a locale-dependent separator makes the string depend on the machine the browser is
 * running on and on the machine a test runs on.
 */
function grouped(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
