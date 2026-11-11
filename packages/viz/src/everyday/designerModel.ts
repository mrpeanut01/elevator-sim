/**
 * **Design a building's words, steps and warnings, as pure decisions** — over
 * `authoring/towerPlan.ts`'s model, split from the DOM for the reason the whole of `everyday/` is
 * split: the words are drivable without a document.
 *
 * ## What the drawing board is now
 *
 * A picture of the building with the lifts in it, and four steps a reader takes in order: **Shape**
 * (how tall, how many shafts, how far each one reaches), **Lifts** (what hangs in each shaft),
 * **Floors** (sky lobbies, escalators, who is on each floor) and **Service** (which floors each
 * shaft's doors open at). The model under it is a {@link TowerPlan}, in which a shaft has its own
 * height — which is what lets the silhouette follow the lifts, and what lets a shaft be an express,
 * a shuttle, a double-decker or a pair of cars rather than only a band of floors.
 *
 * ## The figures compute nothing
 *
 * ENGINE_CONTRACT § 10's rule stands: *"it must be the same code the engine uses to size a group."*
 * The interval, the handling capacity and the stops-versus-travel reading all arrive from
 * `towerPlan.ts#planAnalysisOf`, which puts the drawing through
 * `buildingFromPlan → parseBuilding → resolveBuilding → analyzeUpPeak` — the Barney/CIBSE closed
 * form the correctness oracle holds the simulator to. Nothing in this module recomputes any of it.
 * What it does compute is people, height and bays, and those are `towerPlan.ts`'s own.
 *
 * ## Speed and load are steps within a class, never free numbers
 *
 * § 10.1 is explicit. {@link speedStepsFor} and {@link loadStepsFor} answer the ladder a class is
 * built in, and both **derive it from the class record** — the shipped `ratedSpeedMps` band and
 * `capacityLbRange` out of `data/elevator-specs.json`, widened by whatever the reader saved — rather
 * than transcribing § 10.1's table. The catalogue ladder the band is cut against is § 10.1's own
 * list of speeds, which is the one thing here that is authored.
 *
 * ## What changed from the board this replaces, each on the commit that made the old sentence false
 *
 * - **The service column was bands; it is stop lists.** The header used to say § 10.2's *drawn by
 *   hand* override *"has no field in `BuildingSpec`"*. `PlanShaft.stops` is that field, and a floor
 *   pressed on a selected shaft opens or closes its doors there.
 * - **A duty control is drawn.** {@link automaticClassFor}'s note said what was missing was
 *   *"`BuildingSpec` carrying a duty and the control that writes it"*. `PlanShaft.duty` carries it
 *   and the Lifts step writes it, onto `CarConfig.duty`, which `core` prices (§ D549).
 * - **A sky lobby's starting floor is set here.** The copy used to send a reader to the simulator's
 *   machine editor for it; a shaft's bottom is a control on the Shape step.
 * - **Credential zoning is still not written here**, and {@link DESIGNER_COPY}'s `serviceScopeHint`
 *   still says so beside the control it qualifies. Service zoning is not access zoning.
 *
 * ## Nothing here is scored
 *
 * § 13's first sentence. This module produces no verdict word, no grade and no comparison: the
 * figures and warnings are predictions about a drawing, and the register that says so is drawn on
 * the screen.
 */

import type { ElevatorSpecs } from '@elevator-sim/core/browser';

import {
  RATED_LOADS,
  personsOf,
  type BuildingSpec,
  type SpecBankAnalysis,
  type SpecMachine,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import {
  autoPopulationAt,
  baysAt,
  deckPairingOf,
  escalatorAbove,
  groupsOf,
  layoutOf,
  orphanFloorsOf,
  pairedOnlyGroupsOf,
  planFloorId,
  planLowestFloor,
  planPopulationAt,
  planRiseM,
  planTotalPopulation,
  rescueLobbyFor,
  shaftLabelOf,
  shaftRiseM,
  stopsOf,
  strandedFloorsOf,
  unpairedDeckStopsOf,
  withCars,
  withShafts,
  withSkyLobbyToggled,
  writtenStopsOf,
  type PlanAnalysis,
  type PlanDuty,
  type PlanGroup,
  type PlanLoss,
  type PlanServiceKind,
  type PlanShaft,
  type TowerPlan,
} from '../authoring/towerPlan.js';
import { lengthFigure, speedFigure, type EverydayUnits } from './units.js';

/* -------------------------------------------------------------------------- *
 * The copy
 * -------------------------------------------------------------------------- */

/** Every authored sentence the screen draws that is not about one particular drawing. */
export const DESIGNER_COPY = Object.freeze({
  title: 'Design a building',
  lede:
    'Draw a tower, hang lifts in it, and see what it would feel like to stand in the lobby. ' +
    'Nothing here is scored.',
  saveLabel: 'Save as a new building',
  nameLabel: 'What it is called',
  templatesEyebrow: 'START FROM',
  groupsEyebrow: 'LIFT GROUPS — SHAFTS THAT ANSWER THE SAME BUTTONS',
  /**
   * What a group's figure is a figure *of*. The closed form sizes a group against the people on the
   * floors that group itself opens at — so a shuttle, which opens only at lobbies, is sized against
   * almost nobody and its share reads enormous. That is the calculation's own answer and is printed
   * as it is; this line is what stops it being read as the shuttle's share of the building.
   */
  groupsHint:
    'Each figure is about the people on the floors that group’s own doors open at. A shuttle opens only at lobbies, so its share is of almost nobody and says little.',
  /**
   * Drawn for a group the closed form refused. The refusal itself is the engine's sentence — it
   * names bank ids and option names — so it is printed whole in the folded document, where an
   * engineer's vocabulary belongs, and this says where to find it.
   */
  groupNotSized: 'Not sized. The calculation’s own reason is in the document below.',
  checkEyebrow: 'BEFORE YOU RUN IT',
  specEyebrow: 'THE SPECIFICATION',
  /**
   * The framing line beside the specification block. It is the closed form's own limit, said to the
   * reader: it predicts an interval and a handling capacity under pure up-peak, has no queueing
   * model, and therefore cannot say anything about waiting.
   */
  specNote:
    'A pure up-peak sizing calculation, not a simulation. It predicts an interval and a handling ' +
    'capacity; it has no queue in it, so it cannot tell you what anybody waited.',
  /** § 13's own sentence, and § 3.3's note for this row. Drawn where the figures are. */
  notScored: 'Nothing here is scored. It is a drawing board.',
  savedNothing: 'Not saved yet.',
  /** Drawn for a figure the closed form refused. Never a stale number, never NaN. */
  withheld: '—',
  machineStepsHint: 'Rated speed and rated load are steps within the class, not free numbers.',
  /** The massing rule, said where the shafts are drawn. */
  massingHint:
    'The shafts that reach highest are the middle of the building. Shafts that stop lower make a ' +
    'shorter block beside it, and those alternate left and right. A wider floor holds more people.',
  shapeNoSelection: 'Pick a shaft in the drawing to change how far it reaches, or add one.',
  liftsNoSelection: 'Pick one or more shafts in the drawing to choose what hangs in them.',
  serviceNoSelection: 'Pick one or more shafts in the drawing to choose where their doors open.',
  floorsNoSelection: 'Pick a floor in the drawing. Hold shift and pick another to take every floor between.',
  dragHint: 'Drag the top or the bottom of a picked shaft to make it taller or shorter.',
  stopHint: 'Press a floor on a picked shaft to open or close its doors there.',
  addFullShaft: '+ shaft to the roof',
  addShortShaft: '+ shorter shaft',
  wingApart: 'Stand apart, as a block on the other side',
  wingRejoin: 'Rejoin the first block',
  wingHint:
    'Shafts that stop at the same floor make one block. Stood apart they are a second block across the building, with call buttons of their own.',
  copyShaft: 'Copy',
  removeShaft: 'Remove',
  selectAll: 'Pick every shaft',
  selectGroup: 'Pick its whole group',
  selectNone: 'Pick none',
  decksLabel: 'Decks',
  decksHint:
    'A double-deck car is two cabins, one above the other, that open at two floors at once. It moves twice the people through one shaft and stops at floors in pairs.',
  carsLabel: 'Cars in the shaft',
  carsHint:
    'Two cars can share one shaft, one above the other. They can never pass, so the lower never reaches the top floor and the upper never reaches the bottom.',
  dutyLabel: 'What it is for',
  pressureLabel: 'Cabin',
  pressureHint:
    'Above a long travel a car may not come down faster than ears allow. A cabin that holds its pressure is let off that limit.',
  ropeLabel: 'Rope, every shaft',
  ropeUnmodelled: 'Not modelled',
  driveLabel: 'Drives, every shaft',
  skyLobbyLabel: 'Sky lobby',
  skyLobbyHint:
    'A sky lobby is a floor where people change lifts. Lifts that start there can only be reached by somebody who rode to it first.',
  peopleLabel: 'People',
  peopleFollow: 'Follow the floor’s width',
  useLabel: 'Who is on it',
  escalatorLabel: 'Escalator up one floor',
  escalatorHint:
    'An escalator joins two floors and takes the seconds it takes. A rider whose whole journey is those two floors rides it instead of calling a lift.',
  zoneLabel: 'First floor of its zone',
  autoZoneLabel: 'Zone the tallest shafts for me',
  autoZoneHint:
    'Splits the shafts that reach the roof into zones. The lowest zone stops at every floor; each one above runs non-stop from the lobby to its own floors.',
  /*
   * Service zoning is not access zoning, and the board that sets one does not set the other. This
   * stands beside the control a reader would otherwise mistake for it — GitHub issue #283.
   */
  serviceScopeHint:
    'This board sets which floors each lift physically serves. Who is allowed where is saved with the design as well, and is written in the simulator’s building editor.',
  documentFold: 'The document, as an engineer would write it',
  plateEyebrow: 'RATING PLATE',
  /* The key under the drawing. Colour is never the only signal: each mark is also a shape. */
  legendLobby: 'the lobby',
  legendSky: 'a sky lobby',
  legendStop: 'doors open here',
  legendEscalator: 'an escalator',
  legendPeople: 'people on the floor',
} as const);

/** One of the board's four steps, in the order a reader takes them. */
export interface DesignerStep {
  readonly id: 'shape' | 'lifts' | 'floors' | 'service';
  readonly label: string;
  readonly hint: string;
}

export const DESIGNER_STEPS: readonly DesignerStep[] = Object.freeze([
  { id: 'shape', label: '1 · Shape', hint: 'How tall it is, how many shafts, and how far each one reaches.' },
  { id: 'lifts', label: '2 · Lifts', hint: 'What hangs in each shaft: the machine, its size and its speed.' },
  { id: 'floors', label: '3 · Floors', hint: 'Sky lobbies, escalators and who is on each floor.' },
  { id: 'service', label: '4 · Service', hint: 'Which floors each shaft’s doors open at.' },
]);

/** What each starting point is called and what it is, keyed by `PLAN_TEMPLATES`' ids. */
export const DESIGNER_TEMPLATE_COPY: Readonly<Record<string, { readonly name: string; readonly blurb: string }>> =
  Object.freeze({
    blank: { name: 'Small block', blurb: 'Twelve floors and four lifts that stop everywhere.' },
    zoned: { name: 'Zoned tower', blurb: 'Forty floors: a low set of lifts, and a high set that runs express.' },
    'sky-lobby': { name: 'Sky lobby', blurb: 'Sixty floors, shuttles to a lobby half way up, and more lifts from there.' },
    podium: {
      name: 'Wide podium',
      blurb: 'Low, wide and stepped, with escalators and a goods lift. Its crowd is an office crowd; no shopping crowd ships.',
    },
    supertall: { name: 'Supertall', blurb: 'A hundred floors, two two-level sky lobbies and double-deck shuttles.' },
  });

/** What each service pattern is called and what it does. */
export const DESIGNER_SERVICE_COPY: Readonly<Record<PlanServiceKind, { readonly name: string; readonly blurb: string }>> =
  Object.freeze({
    local: { name: 'Local', blurb: 'Stops at every floor it passes.' },
    express: { name: 'Express', blurb: 'Boards at the bottom, runs non-stop, then stops at every floor of its zone.' },
    shuttle: { name: 'Shuttle', blurb: 'Stops only at its two ends and at any sky lobby between them.' },
    custom: { name: 'Hand-picked', blurb: 'Stops only where you open its doors.' },
  });

/** What each duty is called. `passenger` is what a car is when nobody says otherwise. */
export const DESIGNER_DUTY_COPY: Readonly<Record<PlanDuty, string>> = Object.freeze({
  passenger: 'Passengers',
  goods: 'Goods',
  bed: 'Beds',
  service: 'Service',
});

/** What a building kind is called on the Shape step, in `core`'s own order. */
export const DESIGNER_KIND_COPY: Readonly<Record<string, string>> = Object.freeze({
  office: 'Office',
  residential: 'Residential',
  hotel: 'Hotel',
  hospital: 'Hospital',
  'mixed-use': 'Mixed use',
});

/**
 * The crowd a building kind is given when a reader picks it — a traffic-profile id out of
 * `data/traffic-profiles.json`. `mixed-use` takes the office crowd for the building and expects its
 * floors to be given their own on the Floors step, which is what a mixed building is.
 */
export const DESIGNER_PROFILE_BY_KIND: Readonly<Record<string, string>> = Object.freeze({
  office: 'office-standard',
  residential: 'residential',
  hotel: 'hotel',
  hospital: 'hospital',
  'mixed-use': 'office-standard',
});

/**
 * What § 13 asks for that this build does not draw, in the order a reader would miss them.
 *
 * On screen — on the build-information panel (`everyday/buildNotes.ts`) with the other five
 * registers — so a player can see the shape of the missing half rather than infer it from a gap.
 * Each entry names the thing that is missing rather than the feeling of missing it.
 *
 * **This was the one register in the tree with no plain-English row in it**: every entry used to
 * open with a section number of the design document and one named a type by its identifier. What
 * each row claims is unchanged; GitHub issue #207 is why they say it in the screen's vocabulary.
 *
 * **Two entries left this register rather than being built, and the distinction is the point.**
 * They said where a capability is *authored* — access credentials, and a sky lobby's starting floor
 * — which is an ownership boundary between two surfaces and not a thing this build cannot do. A
 * register of what is missing was the wrong home for a sentence whose subject exists, so they are
 * now what they always were: hints standing beside the controls they qualify
 * ({@link DESIGNER_COPY}'s `serviceScopeHint`; the second, about a sky lobby's starting floor, left
 * when the Shape step gained the control). Deleting them without
 * moving the words would have cost a reader the one sentence that tells service zoning and access
 * zoning apart, which `CLAUDE.md` names outright as a thing never to collapse. GitHub issue #283.
 */
export const DESIGNER_ABSENCES: readonly string[] = Object.freeze([
  /*
   * Two rows left on the commit that built them — GitHub issue #177 item 5, § D518: the escalator
   * rows (the Floors step writes `transportModes`, and `authoring/towerPlan.test.ts` holds that an
   * escalator changes the run on the legs) and the folded document (the
   * specification block is now the § 13.3 disclosure, collapsed). § D227: a refusal leaves on the
   * commit that makes it false.
   */
  /*
   * **And the last one left on the commit that built it** — GitHub issue #420. It read
   * *"a machine class per shaft — a design carries one class, one rated speed and one rated load
   * for the whole building, so a picker on each shaft would be five controls writing the same
   * setting"*, and the second half of that sentence is why it was a refusal rather than a queue
   * item: the control it described would have been § D219's defect, so the issue said to build the
   * **field** first. `BuildingSpec.machineByCar` was that field; on this board it is
   * `PlanShaft.machine` now, {@link designerShaftRows} and the Lifts step are the pickers over it,
   * and `authoring/towerPlan.test.ts` holds that moving one changes the run on the legs. Its
   * triage row in `buildNotes.test.ts` went in the same edit, which is that file's second
   * assertion working in the direction that bites after a lane lands.
   *
   * **The register is empty, and that is a state that keeps being checked rather than a rule that
   * can be deleted.** `buildNotes.ts#REGISTER_EMPTY_LINE` is what this section draws now, on the
   * precedent the shell's and the stage's registers set; this array stays exactly where it is,
   * because a screen that grows an absence owes its sentence back.
   */
]);

/* -------------------------------------------------------------------------- *
 * § 10.1 — the class table, and the steps within a class
 * -------------------------------------------------------------------------- */

/**
 * The rated speeds a lift is sold at, in m/s — the ladder a class's own band is cut against.
 *
 * This is the one authored list in the module and it is § 10.1's own: `0.5 · 0.75` for hydraulics,
 * `1 · 1.6` for MRL, `2.5` for geared, `3.5 · 5 · 7` for gearless, `8 · 10` above it, plus the two
 * intermediate values `data/elevator-specs.json`'s bands name as typical (`1.75`, `4`) so that
 * every shipped class has its own typical speed on the ladder. Nothing derives it because no field
 * of the class record enumerates catalogue speeds — a class declares a band, and the band is
 * continuous.
 */
export const CATALOGUE_SPEEDS_MPS: readonly number[] = Object.freeze([
  0.5, 0.75, 1, 1.6, 1.75, 2.5, 3.5, 4, 5, 7, 8, 10, 12.5, 16, 20.5,
]);

/**
 * The speeds this class is built in — {@link CATALOGUE_SPEEDS_MPS} inside the class's own band.
 *
 * Never empty: a class whose band contains no catalogue speed answers its typical, because a
 * stepper with nothing in it is a control that cannot act and § 13 has no such control.
 */
export function speedStepsFor(machineClass: MachineClass): readonly number[] {
  const inside = CATALOGUE_SPEEDS_MPS.filter(
    (speed) => speed >= machineClass.speedMinMps && speed <= machineClass.speedMaxMps,
  );
  return inside.length > 0 ? inside : [machineClass.speedTypicalMps];
}

/**
 * The rated loads this class is built in — `buildingSpec.ts`'s own {@link RATED_LOADS} chips inside
 * the class's `capacityLbRange`.
 *
 * In **pounds**, which is the unit `BuildingSpec.ratedLoadLb` and `data/elevator-specs.json` both
 * speak. § 10.1's table is in kilograms; the conventions rule is that imperial values appear with
 * the unit in the identifier, and this is one of the places reference data is imperial. Converting
 * to § 10.1's kilogram ladder would produce loads no shipped class declares.
 */
export function loadStepsFor(machineClass: MachineClass): readonly number[] {
  const inside = RATED_LOADS.filter(
    (load) => load >= machineClass.loadMinLb && load <= machineClass.loadMaxLb,
  );
  return inside.length > 0 ? inside : [machineClass.loadMinLb];
}

/** The nearest step at or below `value`, or the first step. Used when a class change narrows a band. */
export function stepAtOrBelow(steps: readonly number[], value: number): number {
  let best = steps[0] ?? value;
  for (const step of steps) if (step <= value) best = step;
  return best;
}

/**
 * The class a design of this rise and floor count would ordinarily be built with — § 10.1's
 * *automatic class choice*, derived from the class table rather than from its ladder of literals.
 *
 * § 10.1 writes the rule as five `travel ≤ N m` arms whose bounds are the same numbers the class
 * records already carry as `maxRiseM`. So this asks the table: the first class, in declared order,
 * that is rated for both the rise and the floor count. A design past every class's ceiling gets the
 * last one, which is the honest answer — the loader treats the envelope as *application guidance,
 * not a hard limit*, so there is always a machine, and {@link designerWarnings} says it is outside
 * its class.
 *
 * Duty is § 10.1's other input (*a goods lift is geared or hydraulic*) and is still not an arm of
 * this function: the suggestion is made about a shaft's travel, and a reader who hangs a goods lift
 * picks its class themselves. **The duty itself is drawn now** — `PlanShaft.duty`, written by the
 * Lifts step onto `CarConfig.duty` — so the sentence that stood here, that a duty control was
 * missing, left on the commit that built it (§ D227). `data/buildings/README.md` § *Duty* is the
 * contract: a duty filters nothing and is priced by the `dutyMismatch` cost term (§ D549).
 */
export function automaticClassFor(
  classes: readonly MachineClass[],
  rise: number,
  floors: number,
): MachineClass | undefined {
  const fits = classes.find((entry) => entry.maxRiseM >= rise && entry.maxFloors >= floors);
  return fits ?? classes.at(-1);
}

/** The class table a design may be built from — the shipped file widened by the reader's own. */
export function designerClasses(specs: ElevatorSpecs): readonly MachineClass[] {
  return classesFromSpecs(specs);
}

/** The class a spec names, or `undefined` when it names one this build does not have. */
export function classOfSpec(
  classes: readonly MachineClass[],
  spec: BuildingSpec,
): MachineClass | undefined {
  return classes.find((entry) => entry.id === spec.specClass);
}


/* -------------------------------------------------------------------------- *
 * Machines, per shaft
 * -------------------------------------------------------------------------- */

/** The class a machine names, or `undefined` when it names one this build does not have. */
export function classOfMachine(
  classes: readonly MachineClass[],
  machine: SpecMachine,
): MachineClass | undefined {
  return classes.find((entry) => entry.id === machine.specClass);
}

/**
 * A machine moved onto another class, with its speed and load brought onto that class's own steps.
 *
 * A shaft handed a class while holding its old speed would hold a speed outside its new band, and
 * that is a document `parseBuilding` warns about and a rating no such machine is sold at. Both come
 * **down** to the nearest rung the new class has rather than up, because a shaft that quietly got
 * faster when its machine was changed would be a control doing more than it says.
 */
export function machineSnappedTo(machineClass: MachineClass, from: SpecMachine): SpecMachine {
  return {
    specClass: machineClass.id,
    ratedSpeedMps: stepAtOrBelow(speedStepsFor(machineClass), from.ratedSpeedMps),
    ratedLoadLb: stepAtOrBelow(loadStepsFor(machineClass), from.ratedLoadLb),
  };
}

/** Hang one class in every named shaft. */
export function withPlanMachineClass(
  plan: TowerPlan,
  keys: readonly string[],
  machineClass: MachineClass,
): TowerPlan {
  return withShafts(plan, keys, (shaft) => ({ ...shaft, machine: machineSnappedTo(machineClass, shaft.machine) }));
}

/** Move every named shaft's speed or load onto another rung. */
export function withPlanMachineStep(
  plan: TowerPlan,
  keys: readonly string[],
  step: { readonly ratedSpeedMps: number } | { readonly ratedLoadLb: number },
): TowerPlan {
  return withShafts(plan, keys, (shaft) => ({ ...shaft, machine: { ...shaft.machine, ...step } }));
}

/* -------------------------------------------------------------------------- *
 * Names — how a floor, a stop list and a group are said
 * -------------------------------------------------------------------------- */

/**
 * A stop list, short enough to read: runs of three or more floors as `a–b`, everything else named.
 *
 * `G, 21–40` is an express; `G, 1, 29, 30` is a double-deck shuttle; `G–12` is a local. The shape of
 * the string is the shape of the service, which is why it is not abbreviated further.
 */
export function stopsSummary(plan: TowerPlan, stops: readonly number[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < stops.length) {
    let end = index;
    while (end + 1 < stops.length && stops[end + 1] === (stops[end] as number) + 1) end += 1;
    const first = planFloorId(plan, stops[index] as number);
    const last = planFloorId(plan, stops[end] as number);
    if (end - index >= 2) parts.push(`${first}–${last}`);
    else for (let each = index; each <= end; each += 1) parts.push(planFloorId(plan, stops[each] as number));
    index = end + 1;
  }
  return parts.join(', ');
}

/** The letters of the shafts in one group — `A B C D`. */
function groupLettersOf(group: PlanGroup): string {
  return group.shafts.map((index) => shaftLabelOf(index)).join(' ');
}

/* -------------------------------------------------------------------------- *
 * The figures
 * -------------------------------------------------------------------------- */

/** One of the live figures across the top. `note` is the smaller line under it. */
export interface DesignerFigure {
  readonly label: string;
  /** {@link DESIGNER_COPY.withheld} where the closed form refused — never a stale number. */
  readonly value: string;
  readonly note: string;
  /** True where the value is a refusal, so the frame can draw it as one. */
  readonly withheld: boolean;
}

/**
 * The group whose figures the header quotes: **the one that moves the smallest share of its own
 * people in five minutes.**
 *
 * `analyzeUpPeak` refuses to average across banks (*"an interval is a property of one group
 * controller"*), and the header has one interval cell. So it quotes one group and names it. The
 * board this replaces quoted the first; on a building with a shuttle and three sets of locals the
 * first is an accident of order, and the group a reader needs to hear about is the one that will
 * queue. Every group is printed in full in the list under the drawing.
 */
function headlineOf(analysis: PlanAnalysis): { readonly bank: SpecBankAnalysis; readonly index: number } | undefined {
  let best: { bank: SpecBankAnalysis; index: number } | undefined;
  analysis.banks.forEach((bank, index) => {
    if (bank.figures === undefined) return;
    if (best === undefined || bank.figures.percentPopulation5Min < (best.bank.figures?.percentPopulation5Min ?? Infinity)) {
      best = { bank, index };
    }
  });
  if (best !== undefined) return best;
  const first = analysis.banks[0];
  return first === undefined ? undefined : { bank: first, index: 0 };
}

/**
 * People, height, lifts, interval and handling capacity.
 *
 * The first three are the plan's own. The last two are the closed form's, read straight off the
 * analysis — including their refusals, which arrive as `—` with the reason in the note rather than
 * as a number the run would not agree with.
 */
export function designerFigures(
  plan: TowerPlan,
  analysis: PlanAnalysis,
  units: EverydayUnits,
): readonly DesignerFigure[] {
  const headline = headlineOf(analysis);
  const figures = headline?.bank.figures;
  const groups = groupsOf(plan);
  const named =
    analysis.banks.length > 1 && headline !== undefined
      ? ` — group ${String(headline.index + 1)}, the lowest of ${String(analysis.banks.length)}`
      : '';
  const refusal = analysis.refusals[0] ?? headline?.bank.refusal ?? 'There is no shaft in the drawing yet.';
  const layout = layoutOf(plan);
  let lived = 0;
  for (let floor = planLowestFloor(plan); floor <= plan.floors; floor += 1) {
    if (planPopulationAt(plan, layout, floor) > 0) lived += 1;
  }
  const below = plan.belowLobby.length;
  const carCount = headline?.bank.carCount ?? 0;
  const cars = plan.shafts.reduce((total, shaft) => total + shaft.cars, 0);
  const shafts = plan.shafts.length;
  return [
    {
      label: 'People',
      value: String(planTotalPopulation(plan)),
      note: `on ${String(lived)} floor${lived === 1 ? '' : 's'}, ${String(plan.occupancyPct)}% let`,
      withheld: false,
    },
    {
      label: 'Height',
      value: lengthFigure(planRiseM(plan), units),
      note:
        `${String(plan.floors)} floors above the lobby` +
        (below === 0 ? '' : ` and ${String(below)} below`) +
        ` at ${lengthFigure(plan.floorHeightM, units)}`,
      withheld: false,
    },
    {
      label: 'Lifts',
      value: String(cars),
      note: `in ${String(shafts)} shaft${shafts === 1 ? '' : 's'}, ${String(groups.length)} group${groups.length === 1 ? '' : 's'}`,
      withheld: false,
    },
    {
      label: 'Interval',
      value: figures === undefined ? DESIGNER_COPY.withheld : `${figures.intervalS.toFixed(1)} s`,
      note:
        figures === undefined
          ? refusal
          : `round trip ${figures.roundTripTimeS.toFixed(1)} s over ${String(carCount)} car${carCount === 1 ? '' : 's'}${named}`,
      withheld: figures === undefined,
    },
    {
      label: 'Handling capacity',
      value: figures === undefined ? DESIGNER_COPY.withheld : `${figures.percentPopulation5Min.toFixed(1)}%`,
      note:
        figures === undefined
          ? refusal
          : `${figures.handlingCapacity5Min.toFixed(0)} people in five minutes, of ${String(figures.servedPopulation)} served${named}`,
      withheld: figures === undefined,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * The warnings, in priority order, and the fixes some of them carry
 * -------------------------------------------------------------------------- */

/** § 10's handling-capacity floor: below this *an office building will feel slow every morning*. */
export const COMFORTABLE_HANDLING_PCT = 11;
/** § 10's interval ceiling: above this it *reads as a long wait, whatever the average says*. */
export const COMFORTABLE_INTERVAL_S = 40;

/** One press that mends what a warning names. `apply` is a pure step from a plan to a plan. */
export interface DesignerFix {
  readonly label: string;
  readonly apply: (plan: TowerPlan) => TowerPlan;
}

/**
 * One warning line. `severity` splits three things a reader answers differently: `blocker` is a
 * building that will not run as drawn, `class` is a machine outside what it is built for, and
 * `comfort` is a building that runs and will feel slow.
 */
export interface DesignerWarning {
  readonly severity: 'blocker' | 'class' | 'comfort';
  readonly text: string;
  readonly fix?: DesignerFix | undefined;
}

function floorListOf(plan: TowerPlan, floors: readonly number[]): string {
  return stopsSummary(plan, floors);
}

/**
 * Everything worth saying about a drawing before it is run, **most serious first**: what will not
 * run, then what is outside its class, then what will feel slow. A design that is both unbuildable
 * and slow is told it is unbuildable first, because the second is a consequence of the first.
 *
 * Every number in every sentence is read from the argument it describes. A refused analysis
 * produces no comfort warning at all, which is the point: a warning that a withheld interval is
 * over forty seconds would be an assertion about a number that does not exist.
 *
 * **Some warnings carry a fix, and a fix is the same edit the controls make.** *Make floor 30 a sky
 * lobby* is `withSkyLobbyToggled`; nothing here reaches the plan by a second path.
 */
export function designerWarnings(
  plan: TowerPlan,
  classes: readonly MachineClass[],
  analysis: PlanAnalysis,
  units: EverydayUnits,
): readonly DesignerWarning[] {
  const warnings: DesignerWarning[] = [];
  if (plan.shafts.length === 0) {
    warnings.push({ severity: 'blocker', text: 'There is no shaft in the drawing. Nobody can leave the lobby.' });
    return warnings;
  }

  const orphans = orphanFloorsOf(plan);
  if (orphans.length > 0) {
    const list = floorListOf(plan, orphans);
    warnings.push({
      severity: 'blocker',
      text:
        orphans.length === 1
          ? `No lift opens at ${list}. A call there is a call nobody may answer.`
          : `No lift opens at ${String(orphans.length)} floors (${list}). A call there is a call nobody may answer.`,
    });
  }

  const stranded = strandedFloorsOf(plan);
  if (stranded.length > 0) {
    const list = floorListOf(plan, stranded);
    const rescue = rescueLobbyFor(plan, stranded[0] as number);
    /* A rescue floor is always above the lobby — `rescueLobbyFor` skips the lobby itself. */
    const rescueId = rescue === undefined ? '' : planFloorId(plan, rescue);
    warnings.push({
      severity: 'blocker',
      text:
        `${String(stranded.length)} floor${stranded.length === 1 ? ' has' : 's have'} a lift nobody can board from the street (${list}). ` +
        'Nothing joins them to the lobby, directly or through a sky lobby, so the run sends nobody there.',
      fix:
        rescue === undefined
          ? undefined
          : { label: `Make floor ${rescueId} a sky lobby`, apply: (current) => withSkyLobbyToggled(current, [rescue]) },
    });
  }

  for (const found of unpairedDeckStopsOf(plan)) {
    const label = shaftLabelOf(found.shaft);
    const list = floorListOf(plan, found.floors);
    const key = plan.shafts[found.shaft]?.key ?? '';
    warnings.push({
      severity: 'blocker',
      text: `Shaft ${label} is double-deck, and a double-deck car opens at two floors at once. ${list} has no floor beside it to pair with, so its doors stay shut there.`,
      fix: {
        label: `Make shaft ${label} single-deck`,
        apply: (current) => withShafts(current, [key], (shaft) => ({ ...shaft, decks: 1 })),
      },
    });
  }

  for (const group of pairedOnlyGroupsOf(plan)) {
    const letters = groupLettersOf(group);
    const lastKey = plan.shafts[group.shafts.at(-1) ?? 0]?.key ?? '';
    const lastLabel = shaftLabelOf(group.shafts.at(-1) ?? 0);
    warnings.push({
      severity: 'blocker',
      text:
        `Every shaft of group ${letters} holds two cars. The lower car can never reach the top floor and the upper can never reach the bottom, ` +
        'so nobody can ride the whole way. One ordinary shaft in the group fixes it.',
      fix: { label: `Leave one car in shaft ${lastLabel}`, apply: (current) => withCars(current, [lastKey], 1) },
    });
  }

  for (const refusal of analysis.refusals) {
    warnings.push({ severity: 'blocker', text: `The engine will not build this: ${refusal}` });
  }

  /* Class limits, one line per class that some shaft is outside, naming the shafts and both numbers. */
  for (const machineClass of classes) {
    const over: string[] = [];
    let worstFloors = 0;
    let worstRise = 0;
    plan.shafts.forEach((shaft, index) => {
      if (shaft.machine.specClass !== machineClass.id) return;
      const floors = shaft.top - shaft.bottom;
      const rise = shaftRiseM(plan, shaft);
      if (floors <= machineClass.maxFloors && rise <= machineClass.maxRiseM) return;
      over.push(shaftLabelOf(index));
      worstFloors = Math.max(worstFloors, floors);
      worstRise = Math.max(worstRise, rise);
    });
    if (over.length === 0) continue;
    const who = over.length === 1 ? `Shaft ${over[0] ?? ''} travels` : `Shafts ${over.join(' ')} travel`;
    const travel = lengthFigure(worstRise, units);
    const limit = lengthFigure(machineClass.maxRiseM, units, 0);
    warnings.push({
      severity: 'class',
      text: `${who} up to ${String(worstFloors)} floors and ${travel}, past what ${machineClass.name} is built for — the class is rated to ${String(machineClass.maxFloors)} floors and ${limit}.`,
    });
  }

  const headline = headlineOf(analysis);
  const figures = headline?.bank.figures;
  if (figures !== undefined && headline !== undefined) {
    const which = analysis.banks.length > 1 ? ` in group ${String(headline.index + 1)}` : '';
    if (figures.percentPopulation5Min < COMFORTABLE_HANDLING_PCT) {
      warnings.push({
        severity: 'comfort',
        text: `Handling capacity${which} is ${figures.percentPopulation5Min.toFixed(1)}% of its people in five minutes, under ${String(COMFORTABLE_HANDLING_PCT)}% — an office building will feel slow every morning.`,
      });
    }
    let longest: { intervalS: number; index: number } | undefined;
    analysis.banks.forEach((bank, index) => {
      if (bank.figures === undefined) return;
      if (longest === undefined || bank.figures.intervalS > longest.intervalS) longest = { intervalS: bank.figures.intervalS, index };
    });
    const slow = longest as { intervalS: number; index: number } | undefined;
    if (slow !== undefined && slow.intervalS > COMFORTABLE_INTERVAL_S) {
      const where = analysis.banks.length > 1 ? ` in group ${String(slow.index + 1)}` : '';
      warnings.push({
        severity: 'comfort',
        text: `An interval of ${slow.intervalS.toFixed(1)} s${where} is over ${String(COMFORTABLE_INTERVAL_S)} s — that reads as a long wait, whatever the average says.`,
      });
    }
  }
  return warnings;
}

/* -------------------------------------------------------------------------- *
 * The rows under the drawing
 * -------------------------------------------------------------------------- */

/** One group in the list under the drawing. */
export interface DesignerGroupRow {
  /** Its place in `groupsOf`, which is also its colour on the drawing. */
  readonly index: number;
  readonly name: string;
  /** `A B C D`. */
  readonly shafts: string;
  /** The pattern's name, with *double-deck* in front where the cars have two decks. */
  readonly pattern: string;
  /** Where its doors open, as {@link stopsSummary} says it. */
  readonly stops: string;
  /**
   * The closed form's figures for the group; {@link DESIGNER_COPY.groupNotSized} where it refused
   * this group alone; `—` when the loader refused the whole building.
   */
  readonly figure: string;
  readonly withheld: boolean;
}

/**
 * Every group, and what the closed form makes of it.
 *
 * The rows are the plan's groups and the figures are the analysis's banks, matched by position:
 * `buildingFromPlan` writes one bank per group in `groupsOf`'s order and the loader keeps it.
 */
export function designerGroupRows(plan: TowerPlan, analysis: PlanAnalysis): readonly DesignerGroupRow[] {
  return groupsOf(plan).map((group, index) => {
    const bank = analysis.banks[index];
    const kind = DESIGNER_SERVICE_COPY[group.service].name;
    const cars = group.shafts.reduce((total, shaft) => total + (plan.shafts[shaft]?.cars ?? 1), 0);
    const figures = bank?.figures;
    return {
      index,
      name: `Group ${String(index + 1)}`,
      shafts: groupLettersOf(group),
      pattern: `${group.decks === 2 ? 'Double-deck ' : ''}${group.decks === 2 ? kind.toLowerCase() : kind} · ${String(cars)} car${cars === 1 ? '' : 's'}`,
      stops: stopsSummary(plan, group.stops),
      figure:
        figures === undefined
          ? bank === undefined || bank.refusal === ''
            ? DESIGNER_COPY.withheld
            : DESIGNER_COPY.groupNotSized
          : `${figures.intervalS.toFixed(1)} s interval · ${figures.percentPopulation5Min.toFixed(1)}% of ${String(figures.servedPopulation)} people in five minutes`,
      withheld: figures === undefined,
    };
  });
}

/** One shaft, as the chips over the drawing and the Lifts step describe it. */
export interface DesignerShaftRow {
  readonly key: string;
  /** `A` onward — the letter drawn over the shaft. */
  readonly label: string;
  readonly className: string;
  /** Rated speed, load and persons, in the reader's own units. */
  readonly figure: string;
  /** Where it reaches — `G to 40`. */
  readonly reach: string;
  /** What is unusual about it, in words: `double-deck`, `two cars`, `goods`, `pressurised cabin`. */
  readonly marks: readonly string[];
}

export function designerShaftRows(
  plan: TowerPlan,
  classes: readonly MachineClass[],
  units: EverydayUnits,
): readonly DesignerShaftRow[] {
  return plan.shafts.map((shaft, index) => {
    const named = classOfMachine(classes, shaft.machine);
    const persons = shaft.decks === 2 ? personsOf(shaft.machine.ratedLoadLb / 2) : personsOf(shaft.machine.ratedLoadLb);
    const marks: string[] = [];
    if (shaft.decks === 2) marks.push('double-deck');
    if (shaft.cars === 2) marks.push('two cars');
    if (shaft.duty !== 'passenger') marks.push(DESIGNER_DUTY_COPY[shaft.duty].toLowerCase());
    if (shaft.pressurised) marks.push('pressurised cabin');
    const bottom = planFloorId(plan, shaft.bottom);
    const top = planFloorId(plan, shaft.top);
    return {
      key: shaft.key,
      label: shaftLabelOf(index),
      className: named?.name ?? shaft.machine.specClass,
      figure:
        `${speedFigure(shaft.machine.ratedSpeedMps, units)} · ${String(shaft.machine.ratedLoadLb)} lb · ` +
        `${String(persons)} persons${shaft.decks === 2 ? ' a deck' : ''}`,
      reach: `${bottom} to ${top}`,
      marks,
    };
  });
}

/** One cell of § 13.2's brushed-metal rating plate. */
export interface DesignerPlateRow {
  readonly key: string;
  readonly value: string;
}

/**
 * § 13.2's rating plate, **for one shaft**: capacity in pounds and persons, rated speed, travel,
 * landings, class.
 *
 * A plate names one lift. The board this replaces hung one plate for the design and a sentence
 * under it counting the shafts it did not describe; here every shaft has its own machine by
 * construction, so the plate is the picked shaft's and says whose it is.
 *
 * `RATED SPEED` and `TRAVEL` go through `everyday/units.ts`, on ENGINE_CONTRACT § 13's *convert,
 * not relabel*. `CAPACITY` does not: `ratedLoadLb` is reference data with the unit in the
 * identifier, and a rating plate is where a machine's imperial rated load belongs
 * ([§ D448](../../../../DECISIONS.md)). `units` is required, because an optional preference would
 * let a caller silently keep drawing metres.
 */
export function designerPlateRows(
  plan: TowerPlan,
  shaft: PlanShaft,
  machineClass: MachineClass | undefined,
  units: EverydayUnits,
): readonly DesignerPlateRow[] {
  const persons = shaft.decks === 2 ? personsOf(shaft.machine.ratedLoadLb / 2) : personsOf(shaft.machine.ratedLoadLb);
  return [
    { key: 'CAPACITY', value: `${String(shaft.machine.ratedLoadLb)} lb` },
    { key: 'PERSONS', value: shaft.decks === 2 ? `${String(persons)} a deck` : String(persons) },
    { key: 'RATED SPEED', value: speedFigure(shaft.machine.ratedSpeedMps, units) },
    { key: 'TRAVEL', value: lengthFigure(shaftRiseM(plan, shaft), units) },
    { key: 'LANDINGS', value: String(writtenStopsOf(plan, shaft).length) },
    { key: 'CLASS', value: machineClass?.name ?? shaft.machine.specClass },
  ];
}

/**
 * The people line: how many, and how the plate spreads them.
 *
 * It prints the two ends of the distribution rather than a figure for a *typical* floor, for the
 * reason the board this replaces gave when it dropped that word: this is the one screen that lets a
 * reader make the floors uneven, so a single per-floor figure would be a mean presented as a fact
 * about a floor. The widest and the narrowest floor are both floors a reader can point at.
 */
export function designerCapacityLine(plan: TowerPlan): string {
  const layout = layoutOf(plan);
  let widest = 1;
  let narrowest = 1;
  for (let floor = 1; floor <= plan.floors; floor += 1) {
    if (baysAt(plan, layout, floor) > baysAt(plan, layout, widest)) widest = floor;
    if (baysAt(plan, layout, floor) < baysAt(plan, layout, narrowest)) narrowest = floor;
  }
  const people = planTotalPopulation(plan);
  const wideBays = baysAt(plan, layout, widest);
  const narrowBays = baysAt(plan, layout, narrowest);
  const wideHolds = autoPopulationAt({ ...plan, skyLobbies: [] }, layout, widest);
  const narrowHolds = autoPopulationAt({ ...plan, skyLobbies: [] }, layout, narrowest);
  const density = `${String(plan.peoplePerBay)} people a shaft bay at ${String(plan.occupancyPct)}% let`;
  if (wideBays === narrowBays) {
    return `${String(people)} people · ${density} · every floor is ${String(wideBays)} bays wide and holds ${String(wideHolds)}`;
  }
  return (
    `${String(people)} people · ${density} · the widest floor is ${String(wideBays)} bays and holds ${String(wideHolds)}, ` +
    `the narrowest is ${String(narrowBays)} and holds ${String(narrowHolds)}`
  );
}

/**
 * § 10's stops-versus-travel sentence for the headline group, read off the analysis rather than
 * recomputed. `''` when nothing was sized, because there is no round trip to read.
 */
export function designerReading(analysis: PlanAnalysis): string {
  return headlineOf(analysis)?.bank.reading ?? '';
}

/* -------------------------------------------------------------------------- *
 * One floor, and one shaft's service, as the side panel says them
 * -------------------------------------------------------------------------- */

/** What the Floors step says about the floors a reader picked. */
export interface DesignerFloorFacts {
  /** *The lobby*, *Floor 12*, *Floors 12–20*. */
  readonly title: string;
  /** People on the picked floors, summed. */
  readonly people: number;
  /** Where that number comes from: the floor's width, or a hand. */
  readonly peopleNote: string;
  /** True where every picked floor is a sky lobby. */
  readonly skyLobby: boolean;
  /** False for the lobby, the roof and anything below ground, which cannot be one. */
  readonly canBeSkyLobby: boolean;
  /** True where an escalator joins the (single) picked floor to the one above. */
  readonly escalator: boolean;
  /** False for a range, and for the top floor. */
  readonly canHaveEscalator: boolean;
  /** The crowd every picked floor shares, as a profile id, or `undefined` where they differ. */
  readonly use: string | undefined;
}

export function designerFloorFacts(plan: TowerPlan, range: readonly [number, number]): DesignerFloorFacts {
  const low = Math.min(range[0], range[1]);
  const high = Math.max(range[0], range[1]);
  const layout = layoutOf(plan);
  const floors: number[] = [];
  for (let floor = low; floor <= high; floor += 1) floors.push(floor);
  const people = floors.reduce((total, floor) => total + planPopulationAt(plan, layout, floor), 0);
  const handSet = floors.filter((floor) => plan.populationByFloor[floor] !== undefined).length;
  const bays = baysAt(plan, layout, low);
  const uses = new Set(floors.map((floor) => plan.useByFloor[floor] ?? plan.trafficProfile));
  const lowId = planFloorId(plan, low);
  const highId = planFloorId(plan, high);
  const single = low === high;
  const lobbyable = floors.filter((floor) => floor > 0 && floor < plan.floors);
  return {
    title: single ? (low === 0 ? 'The lobby' : `Floor ${lowId}`) : `Floors ${lowId}–${highId}`,
    people,
    peopleNote:
      handSet === floors.length
        ? 'set by hand'
        : handSet > 0
          ? `${String(handSet)} of ${String(floors.length)} floors set by hand`
          : single
            ? low <= 0
              ? 'an entrance or a floor below ground holds nobody until you say so'
              : plan.skyLobbies.includes(low)
                ? 'a sky lobby holds nobody until you say so'
                : `from its width: ${String(bays)} shaft bay${bays === 1 ? '' : 's'}`
            : 'from each floor’s width',
    skyLobby: lobbyable.length > 0 && lobbyable.every((floor) => plan.skyLobbies.includes(floor)),
    canBeSkyLobby: lobbyable.length > 0,
    escalator: single && escalatorAbove(plan, low) !== undefined,
    canHaveEscalator: single && low < plan.floors,
    use: uses.size === 1 ? ([...uses][0] as string) : undefined,
  };
}

/**
 * What the Service step says about one shaft: its pattern, and its doors in words.
 *
 * For a double-deck shaft the pairs are said as pairs, because *G, 1, 29, 30* does not tell a
 * reader which floors open together and *G with 1, 29 with 30* does.
 */
export function designerServiceLine(plan: TowerPlan, shaft: PlanShaft): string {
  const kind = DESIGNER_SERVICE_COPY[shaft.service].name;
  const stops = stopsOf(plan, shaft);
  if (shaft.decks !== 2) return `${kind} — doors open at ${stopsSummary(plan, stops)}.`;
  const pairs = deckPairingOf(stops)
    .pairs.map(([lower, upper]) => `${planFloorId(plan, lower)} with ${planFloorId(plan, upper)}`)
    .join(', ');
  return pairs === ''
    ? `${kind}, double-deck — no two of its floors are next to each other, so no doors open.`
    : `${kind}, double-deck — doors open at ${pairs}.`;
}

/* -------------------------------------------------------------------------- *
 * What an opened building carried that the board cannot hold
 * -------------------------------------------------------------------------- */

const LOSS_COPY: Readonly<Record<PlanLoss, string>> = Object.freeze({
  'uneven-floor-heights': 'its floors were not all the same height, and here every floor is',
  'floor-labels': 'the names its floors were given',
  'floor-areas': 'the floor areas it declared',
  'landing-call-types': 'the call panels set floor by floor',
  'car-timings': 'door, transfer and ride timings set on single cars',
  'service-events': 'cars scheduled to leave and return during a run',
  notes: 'the notes written on it',
  'mixed-bank-equipment': 'ropes and drives that differed from group to group',
});

/**
 * The sentence drawn when the board opens on a building that already exists and cannot hold all of
 * it. `''` when it holds everything, because a sentence about a loss that did not happen is one a
 * reader learns to skip.
 *
 * It says the saved building is a **new** one, because that is why none of this is dangerous: the
 * board saves under a fresh id and the building it opened is untouched.
 */
export function designerLossLine(name: string, losses: readonly PlanLoss[]): string {
  if (losses.length === 0) return '';
  const list = losses.map((loss) => LOSS_COPY[loss]).join('; ');
  return `Opened from ${name}. This board does not carry over: ${list}. Saving makes a new building and leaves ${name} as it was.`;
}
