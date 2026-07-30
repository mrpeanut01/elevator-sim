/**
 * The machine-class editor's model: the handoff's nine sliders, as a real entry in the elevator
 * class table.
 *
 * ## Why a class is worth editing at all
 *
 * Choosing a machine class is choosing the physics, not a label. `data/elevator-specs.json` gives
 * each class a rated-speed band, an acceleration, a jerk limit, a rise and floor ceiling, and the
 * rated loads it is built in. Acceleration and jerk reach the motion profile, so they change every
 * short hop; the speed band and the load range gate what a car may be configured as.
 *
 * The rise and floor ceilings are **advisories**, not refusals — `config/parse.ts` says so in its
 * own message: *"the reference envelope is application guidance, not a hard limit"*. So a 0.8 m/s
 * car serving thirty floors does run, and the honest thing for the editor to do is say the figures
 * describe a machine outside its class rather than pretend the loader stopped it.
 *
 * So the editor edits a class, saves it as a **new** one, and the building editor then fits it. The
 * handoff is explicit that editing a shipped class never overwrites it (§ 1.5 B6), which matters
 * more here than for a dispatcher: `midtown-office.json` names `geared-traction` by id, and a
 * reader who mutated that entry would silently change the project's own validation building.
 *
 * ## What the sliders are, and what they are not
 *
 * Nine controls over the fields the class record actually has. There is no slider for door times or
 * transfer time, because those are not per class — `doors` and `timing` are file-level blocks in
 * `data/elevator-specs.json` shared by every class, and a per-class door time would be a field the
 * loader does not read. A control that writes nothing is the defect this repository keeps finding;
 * the way not to ship one is to not draw it.
 */

import type { ElevatorSpecs } from '@elevator-sim/core/browser';

/** One entry of `data/elevator-specs.json`'s `classes` array, as this editor needs it. */
export interface MachineClass {
  readonly id: string;
  readonly name: string;
  readonly speedMinMps: number;
  readonly speedMaxMps: number;
  readonly speedTypicalMps: number;
  readonly maxRiseM: number;
  readonly maxFloors: number;
  readonly accelerationMps2: number;
  readonly jerkMps3: number;
  readonly loadMinLb: number;
  readonly loadMaxLb: number;
  readonly application: string;
  /** True for a class the reader saved. Shipped classes are never mutated. */
  readonly yours: boolean;
}

/** The editor's whole state. Identical in shape to {@link MachineClass} minus its identity. */
export interface MachineSpec {
  readonly name: string;
  readonly speedMinMps: number;
  readonly speedTypicalMps: number;
  readonly speedMaxMps: number;
  readonly accelerationMps2: number;
  readonly jerkMps3: number;
  readonly maxRiseM: number;
  readonly maxFloors: number;
  readonly loadMinLb: number;
  readonly loadMaxLb: number;
}

export interface MachineRow {
  readonly key: keyof MachineSpec & string;
  readonly label: string;
  readonly group: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly help: string;
}

/**
 * The nine rows, in the handoff's three groups.
 *
 * The ranges are the shipped table's own extremes, widened by nothing: the speed ceiling is
 * **20.5 m/s** because Shanghai Tower's is the fastest lift ever built and
 * `data/elevator-specs.json`'s `realWorldAnchors` says so; the rise ceiling is 700 m for the same
 * reason. Letting a slider past a number no machine has reached would be inviting a reader to
 * simulate a building nobody can commission and then read its interval as a result.
 */
export const MACHINE_ROWS: readonly MachineRow[] = Object.freeze([
  {
    key: 'speedMinMps',
    label: 'Slowest in the class',
    group: 'SPEED BAND',
    min: 0.5,
    max: 20,
    step: 0.01,
    unit: ' m/s',
    help: 'The bottom of the class’s rated-speed band — `ratedSpeedMps.min`. Nothing in the class is built slower than this, and the loader refuses a car outside the band.',
  },
  {
    key: 'speedTypicalMps',
    label: 'Typical rated speed',
    group: 'SPEED BAND',
    min: 0.5,
    max: 20.5,
    step: 0.01,
    unit: ' m/s',
    help: 'The speed a building gets when it picks this class — `ratedSpeedMps.typical`. On a short rise it is never reached, so door and stop time dominate and this control does less than it looks like it should.',
  },
  {
    key: 'speedMaxMps',
    label: 'Fastest in the class',
    group: 'SPEED BAND',
    min: 0.5,
    max: 20.5,
    step: 0.01,
    unit: ' m/s',
    help: 'The top of the band — `ratedSpeedMps.max`. Shanghai Tower’s 20.5 m/s is the fastest lift ever built, so that is the ceiling here.',
  },
  {
    key: 'accelerationMps2',
    label: 'Acceleration',
    group: 'RIDE',
    min: 0.4,
    max: 1.5,
    step: 0.05,
    unit: ' m/s²',
    help: 'How hard the car pulls away — `acceleration.typical`. This is real in the simulation: 0.6 is a hydraulic, 1.0 a traction car, and above about 1.2 riders start to complain. On a short hop it matters more than rated speed does.',
  },
  {
    key: 'jerkMps3',
    label: 'Jerk',
    group: 'RIDE',
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: ' m/s³',
    help: 'Rate of change of acceleration — the lurch — `jerk.typical`. Comfort standards keep it around 1.0–1.6; lower feels smoother and costs time on every short hop, which is most of them.',
  },
  {
    key: 'maxRiseM',
    label: 'Rated rise',
    group: 'LIMITS',
    min: 10,
    max: 700,
    step: 1,
    unit: ' m',
    help: 'How far up the class can serve — `maxRiseM`. A hydraulic runs out at 18 m; only the gearless classes reach a real tower. A building past it is an advisory rather than a refusal, so the run happens and the figures describe a machine outside its class.',
  },
  {
    key: 'maxFloors',
    label: 'Rated floors',
    group: 'LIMITS',
    min: 4,
    max: 130,
    step: 1,
    unit: '',
    help: 'Floor-count limit for the class — `maxFloors`. A building past it raises the same warning the loader does.',
  },
  {
    key: 'loadMinLb',
    label: 'Smallest car',
    group: 'LIMITS',
    min: 1000,
    max: 5000,
    step: 100,
    unit: ' lb',
    help: 'Bottom of the rated-load range the class is built in — `capacityLbRange[0]`. Loads outside the range disappear from the building editor’s chips, because they are not cars this class comes in.',
  },
  {
    key: 'loadMaxLb',
    label: 'Largest car',
    group: 'LIMITS',
    min: 1000,
    max: 5000,
    step: 100,
    unit: ' lb',
    help: 'Top of the range — `capacityLbRange[1]`. 5 000 lb is 33 persons: a service car or a supertall shuttle.',
  },
]);

/** Read `data/elevator-specs.json`'s classes into the editor's vocabulary. */
export function classesFromSpecs(specs: ElevatorSpecs): readonly MachineClass[] {
  return specs.classes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    speedMinMps: entry.ratedSpeedMps.min,
    speedMaxMps: entry.ratedSpeedMps.max,
    speedTypicalMps: entry.ratedSpeedMps.typical,
    maxRiseM: entry.maxRiseM,
    maxFloors: entry.maxFloors,
    accelerationMps2: entry.acceleration.typical,
    jerkMps3: entry.jerk.typical,
    loadMinLb: entry.capacityLbRange[0],
    loadMaxLb: entry.capacityLbRange[1],
    application: entry.application,
    yours: false,
  }));
}

export function specFromClass(machineClass: MachineClass): MachineSpec {
  return {
    name: machineClass.yours ? machineClass.name : `Copy of ${machineClass.name}`,
    speedMinMps: machineClass.speedMinMps,
    speedTypicalMps: machineClass.speedTypicalMps,
    speedMaxMps: machineClass.speedMaxMps,
    accelerationMps2: machineClass.accelerationMps2,
    jerkMps3: machineClass.jerkMps3,
    maxRiseM: machineClass.maxRiseM,
    maxFloors: machineClass.maxFloors,
    loadMinLb: machineClass.loadMinLb,
    loadMaxLb: machineClass.loadMaxLb,
  };
}

/**
 * The class a spec describes.
 *
 * The min/max pairs are sorted rather than trusted, and `typical` is clamped into the band: a class
 * whose typical speed sits outside its own band is a record the loader will reject, and letting a
 * reader save one so it can be refused later is worse UX than fixing the ordering as they drag.
 */
export function classFromSpec(spec: MachineSpec, id: string): MachineClass {
  const speedMin = Math.min(spec.speedMinMps, spec.speedMaxMps);
  const speedMax = Math.max(spec.speedMinMps, spec.speedMaxMps);
  return {
    id,
    name: spec.name.trim() === '' ? 'My machine' : spec.name.trim(),
    speedMinMps: speedMin,
    speedMaxMps: speedMax,
    speedTypicalMps: Math.min(speedMax, Math.max(speedMin, spec.speedTypicalMps)),
    accelerationMps2: spec.accelerationMps2,
    jerkMps3: spec.jerkMps3,
    maxRiseM: spec.maxRiseM,
    maxFloors: spec.maxFloors,
    loadMinLb: Math.min(spec.loadMinLb, spec.loadMaxLb),
    loadMaxLb: Math.max(spec.loadMinLb, spec.loadMaxLb),
    application: 'Your own class',
    yours: true,
  };
}

/**
 * A class the reader saved, as an `ElevatorSpecs` the simulator will resolve against.
 *
 * The whole file is returned with the new class appended, because `SimulationConfig.elevatorSpecs`
 * takes the file and not a class — and because the file's `doors`, `timing`, `loadSensor` and
 * `capacities` blocks must travel with it or the run falls back to the built-in defaults and the
 * reference data and the run drift apart, which is the exact thing that field exists to prevent.
 */
export function specsWithClass(specs: ElevatorSpecs, machineClass: MachineClass): ElevatorSpecs {
  const entry = {
    id: machineClass.id,
    name: machineClass.name,
    ratedSpeedMps: {
      min: machineClass.speedMinMps,
      max: machineClass.speedMaxMps,
      typical: machineClass.speedTypicalMps,
    },
    maxRiseM: machineClass.maxRiseM,
    maxFloors: machineClass.maxFloors,
    acceleration: { typical: machineClass.accelerationMps2, max: machineClass.accelerationMps2 * 1.2 },
    jerk: { typical: machineClass.jerkMps3, max: machineClass.jerkMps3 * 1.3 },
    capacityLbRange: [machineClass.loadMinLb, machineClass.loadMaxLb] as const,
    application: machineClass.application,
  };
  return {
    ...specs,
    classes: [...specs.classes.filter((existing) => existing.id !== machineClass.id), entry],
  } as ElevatorSpecs;
}

export function machineSummary(spec: MachineSpec): string {
  return (
    `${spec.speedMinMps.toFixed(2)}–${spec.speedMaxMps.toFixed(2)} m/s · typical ` +
    `${spec.speedTypicalMps.toFixed(2)} · ${spec.accelerationMps2.toFixed(2)} m/s² · to ` +
    `${String(spec.maxRiseM)} m / ${String(spec.maxFloors)} floors · ` +
    `${String(spec.loadMinLb)}–${String(spec.loadMaxLb)} lb`
  );
}

export function machineIsDirty(spec: MachineSpec, source: MachineClass): boolean {
  const original = specFromClass(source);
  return (
    original.speedMinMps !== spec.speedMinMps ||
    original.speedTypicalMps !== spec.speedTypicalMps ||
    original.speedMaxMps !== spec.speedMaxMps ||
    original.accelerationMps2 !== spec.accelerationMps2 ||
    original.jerkMps3 !== spec.jerkMps3 ||
    original.maxRiseM !== spec.maxRiseM ||
    original.maxFloors !== spec.maxFloors ||
    original.loadMinLb !== spec.loadMinLb ||
    original.loadMaxLb !== spec.loadMaxLb
  );
}

/** A one-line plain-English description, for the rail card and the building editor's chip note. */
export function plainDescription(machineClass: MachineClass): string {
  return (
    `${machineClass.speedMinMps.toFixed(2)}–${machineClass.speedMaxMps.toFixed(2)} m/s at ` +
    `${machineClass.accelerationMps2.toFixed(2)} m/s², rated to ${String(machineClass.maxRiseM)} m ` +
    `and ${String(machineClass.maxFloors)} floors, built in ${String(machineClass.loadMinLb)}–` +
    `${String(machineClass.loadMaxLb)} lb.`
  );
}
