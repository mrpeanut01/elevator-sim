/**
 * **Design a building's words, steps and warnings, as pure decisions** — GAMEPLAY § 13 and
 * ENGINE_CONTRACT § 10, over `authoring/buildingSpec.ts`'s model, split from the DOM for the reason
 * the whole of `everyday/` is split: the words are drivable without a document.
 *
 * ## The specification block computes nothing
 *
 * ENGINE_CONTRACT § 10 sketches its own five-line round-trip arithmetic and then states the rule
 * that overrides the sketch: *"it must be the same code the engine uses to size a group."* § 20.7
 * repeats it for this screen by name. So the interval, the round trip, the handling capacity and
 * the stops-versus-travel sentence all arrive from
 * `authoring/buildingSpec.ts#upPeakAnalysisOf` — which puts the drawn spec through
 * `buildingFromSpec → parseBuilding → resolveBuilding → analyzeUpPeak`, the Barney/CIBSE closed form
 * the correctness oracle holds the simulator to. **Nothing in this module recomputes any of it**, and
 * that is the whole reason the designer's figures can be trusted beside a run's: a second copy would
 * disagree with the oracle by a term, silently, which is `docs/12` § 4's recorded defect.
 *
 * What this module *does* compute is the two figures the closed form has no opinion about —
 * population and rise — and both are `buildingSpec.ts`'s own (`totalPopulation`, `riseM`), called
 * rather than re-derived for the same reason.
 *
 * ## Speed and load are steps within a class, never free numbers
 *
 * § 10.1 is explicit. {@link speedStepsFor} and {@link loadStepsFor} answer the ladder a class is
 * built in, and both **derive it from the class record** — the shipped `ratedSpeedMps` band and
 * `capacityLbRange` out of `data/elevator-specs.json`, widened by whatever the reader saved — rather
 * than transcribing § 10.1's table. A transcribed table would be a second copy of reference data,
 * and this repository has a register of what happens to those.
 *
 * The catalogue ladder the band is cut against is § 10.1's own list of speeds, which is the one
 * thing here that is authored: a rated speed is a thing a machine is sold at, and no field of the
 * class record enumerates them.
 *
 * ## Three deviations from § 13, each with the constraint that forced it
 *
 * - **One machine class for the design, not one per shaft.** `BuildingSpec` carries a single
 *   `specClass`/`ratedSpeedMps`/`ratedLoadLb` triple, because that is what its cars are dealt from.
 *   Five selects that all wrote one field is § D219 exactly — a panel that binds nothing while
 *   looking right — so the class is drawn once, and {@link DESIGNER_ABSENCES} says so.
 * - **No escalators, no duty, no credential dots on the elevation.** `SpecTransportMode` exists and
 *   is carried, but no control here authors one; § 13.2's grid is the Engineer building editor's
 *   surface and is not re-drawn in Casual clothes on this pass.
 * - **The service column is bands, not hand-drawn cells.** § 10.2's *drawn by hand* override has no
 *   field in `BuildingSpec`; what it does have is `bandByCar` and `noLobby`, which are § 10.2's
 *   *zone's bands* and *shuttle* respectively, and those are the two this screen writes.
 *
 * ## Nothing here is scored
 *
 * § 13's first sentence and § 3.3's note for the designer row. It is why this module produces no
 * verdict word, no grade and no comparison: the four figures, three warnings and one reading are
 * predictions about a drawing, and the register that says so is drawn on the screen.
 */

import type { ElevatorSpecs } from '@elevator-sim/core/browser';

import {
  RATED_LOADS,
  personsOf,
  riseM,
  totalCapacity,
  totalPopulation,
  type BuildingSpec,
  type SpecBankAnalysis,
  type SpecUpPeakAnalysis,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';

/* -------------------------------------------------------------------------- *
 * The copy — § 13's, and the prototype's
 * -------------------------------------------------------------------------- */

/** Every authored sentence the screen draws. Sources are named per line. */
export const DESIGNER_COPY = Object.freeze({
  /** The prototype's own header pair. */
  title: 'Design a building',
  lede:
    'Draw a tower, hang lifts in it, and see what it would feel like to stand in the lobby. ' +
    'Nothing here is scored.',
  blankLabel: 'blank tower',
  saveLabel: 'Save as a new building',
  nameLabel: 'What it is called',
  /** § 13.3's panel headings, uppercased to the eyebrow register. */
  buildingEyebrow: 'THE BUILDING',
  machinesEyebrow: 'MACHINE CLASS',
  zonesEyebrow: 'SERVICE — WHAT EACH SHAFT CALLS AT',
  specEyebrow: 'THE SPECIFICATION',
  /**
   * The framing line beside the specification block. It is `upPeakAnalysisOf`'s own limit, said to
   * the reader: the closed form predicts a mean interval and a handling capacity under pure
   * up-peak, has no queueing model, and therefore cannot say anything about waiting.
   */
  specNote:
    'A pure up-peak sizing calculation, not a simulation. It predicts an interval and a handling ' +
    'capacity; it has no queue in it, so it cannot tell you what anybody waited.',
  /*
   * **`absencesEyebrow` left this table with GitHub issue #207**, for the reason its sibling in
   * `rushScreenModel.ts` did: {@link DESIGNER_ABSENCES} is drawn on the build-information panel,
   * which writes its own section heading, and a heading no renderer touches is the shape the
   * dead-code audit exists to find.
   */
  /** § 13's own sentence, and § 3.3's note for this row. Drawn where the figures are. */
  notScored: 'Nothing here is scored. It is a drawing board.',
  savedNothing: 'Not saved yet.',
  /** Drawn for a figure the closed form refused. Never a stale number, never NaN. */
  withheld: '—',
  machineStepsHint: 'Rated speed and rated load are steps within the class, not free numbers.',
} as const);

/**
 * What § 13 asks for that this build does not draw, in the order a reader would miss them.
 *
 * On screen — on the build-information panel (`everyday/buildNotes.ts`) with the other five
 * registers — so a player can see the shape of the missing half rather than infer it from a gap.
 * Each entry names the thing that is missing rather than the feeling of missing it.
 *
 * **This was the one register in the tree with no plain-English row in it**: all five entries used
 * to open with a section number of the design document and one named a type by its identifier.
 * They say the same five things; GitHub issue #207 is why they say them in the screen's vocabulary.
 */
export const DESIGNER_ABSENCES: readonly string[] = Object.freeze([
  'a machine class per shaft — a design carries one class, one rated speed and one rated load for the whole building, so a picker on each shaft would be five controls writing the same setting',
  'the access panel and its credential dots — who is allowed where is saved with a design and is written in the simulator’s building editor, not here. What this board sets is which floors a lift physically serves, which is a different thing.',
  'escalator rows — a design can carry escalators through a save, and nothing on this board writes them',
  'the sky-lobby starter and the five ride characteristics it would let you edit — the machine editor on the simulator side owns those',
  'the folded-up specification — the block below is what it would print, without the fold',
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
 * Duty is § 10.1's other input (*a goods lift is geared or hydraulic*) and is not one here: no
 * field of `BuildingSpec` carries a shaft's duty, so a duty control would be the third thing in
 * {@link DESIGNER_ABSENCES} rather than an arm of this function.
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

/**
 * Move a design onto another class, carrying speed and load onto that class's own steps.
 *
 * A class change narrows or widens both ladders, and a spec left holding a speed outside its new
 * class's band is a document `parseBuilding` refuses. So both are snapped down to the nearest step
 * the new class has — down rather than up, because a design that quietly got *faster* when its
 * machine was changed would be a control doing more than it says.
 */
export function withMachineClass(spec: BuildingSpec, machineClass: MachineClass): BuildingSpec {
  return {
    ...spec,
    specClass: machineClass.id,
    ratedSpeedMps: stepAtOrBelow(speedStepsFor(machineClass), spec.ratedSpeedMps),
    ratedLoadLb: stepAtOrBelow(loadStepsFor(machineClass), spec.ratedLoadLb),
  };
}

/* -------------------------------------------------------------------------- *
 * § 13.1 — the four figures
 * -------------------------------------------------------------------------- */

/** One of § 13.1's four live figures. `note` is the smaller line under it. */
export interface DesignerFigure {
  readonly label: string;
  /** {@link DESIGNER_COPY.withheld} where the closed form refused — never a stale number. */
  readonly value: string;
  readonly note: string;
  /** True where the value is a refusal, so the frame can draw it as one. */
  readonly withheld: boolean;
}

/**
 * The bank whose figures the header quotes — the first the analysis returned.
 *
 * `analyzeUpPeak` refuses to average across banks (*"an interval is a property of one group
 * controller"*), and § 13.1 has one interval cell. So the header quotes one bank and names it, and
 * the specification block below prints every bank in full. Naming it is what stops the header from
 * being a claim about the building.
 */
function headlineBank(analysis: SpecUpPeakAnalysis): SpecBankAnalysis | undefined {
  return analysis.banks.find((bank) => bank.figures !== undefined) ?? analysis.banks[0];
}

/**
 * § 13.1's four figures: population, rise, interval, handling capacity.
 *
 * Population and rise are the authoring model's own (`totalPopulation`, `riseM`). Interval and
 * handling capacity are the closed form's, read straight off the analysis — including their
 * refusals, which arrive as `—` with the reason in the note rather than as a number the run would
 * not agree with.
 */
export function designerFigures(
  spec: BuildingSpec,
  analysis: SpecUpPeakAnalysis,
): readonly DesignerFigure[] {
  const bank = headlineBank(analysis);
  const figures = bank?.figures;
  const named = analysis.banks.length > 1 && bank !== undefined ? ` (bank ${bank.bankId})` : '';
  const refusal =
    analysis.refusal !== '' ? analysis.refusal : (bank?.refusal ?? 'no bank resolved');
  return [
    {
      label: 'Population',
      value: String(totalPopulation(spec)),
      note: `${String(totalCapacity(spec))} at design capacity, ${String(spec.occupancyPct)}% let`,
      withheld: false,
    },
    {
      label: 'Rise',
      value: `${riseM(spec).toFixed(1)} m`,
      note: `${String(spec.floors)} floors above the lobby at ${spec.floorHeightM.toFixed(1)} m`,
      withheld: false,
    },
    {
      label: 'Interval',
      value: figures === undefined ? DESIGNER_COPY.withheld : `${figures.intervalS.toFixed(1)} s`,
      note:
        figures === undefined
          ? refusal
          : `round trip ${figures.roundTripTimeS.toFixed(1)} s over ${String(bank?.carCount ?? 0)} cars${named}`,
      withheld: figures === undefined,
    },
    {
      label: 'Handling capacity',
      value:
        figures === undefined
          ? DESIGNER_COPY.withheld
          : `${figures.percentPopulation5Min.toFixed(1)}%`,
      note:
        figures === undefined
          ? refusal
          : `${figures.handlingCapacity5Min.toFixed(0)} people in five minutes, of ${String(figures.servedPopulation)} served${named}`,
      withheld: figures === undefined,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * § 10's three warnings, in priority order
 * -------------------------------------------------------------------------- */

/** § 10's handling-capacity floor: below this *an office building will feel slow every morning*. */
export const COMFORTABLE_HANDLING_PCT = 11;
/** § 10's interval ceiling: above this it *reads as a long wait, whatever the average says*. */
export const COMFORTABLE_INTERVAL_S = 40;

/** One warning-card line. `severity` splits § 10's *not buildable* from its *not comfortable*. */
export interface DesignerWarning {
  readonly severity: 'class' | 'comfort';
  readonly text: string;
}

/**
 * § 10's three warnings, **in its own priority order**: class limits, then handling capacity, then
 * interval. The order is the guide's and is asserted rather than incidental — a design that is
 * both unbuildable and slow should be told it is unbuildable first, because the second is a
 * consequence of the first.
 *
 * Every number in every sentence is read from the argument it describes. The two class limits name
 * **both** figures the guide asks for (*naming both numbers*): what the design is, and what the
 * class is rated for.
 *
 * A refused analysis produces no comfort warnings at all, which is the point: a warning that a
 * withheld interval is over forty seconds would be an assertion about a number that does not exist.
 */
export function designerWarnings(
  spec: BuildingSpec,
  machineClass: MachineClass | undefined,
  analysis: SpecUpPeakAnalysis,
): readonly DesignerWarning[] {
  const warnings: DesignerWarning[] = [];
  const rise = riseM(spec);
  if (machineClass !== undefined) {
    if (spec.floors > machineClass.maxFloors) {
      warnings.push({
        severity: 'class',
        text: `${String(spec.floors)} floors is past what ${machineClass.name} is built for — the class is rated to ${String(machineClass.maxFloors)}.`,
      });
    }
    if (rise > machineClass.maxRiseM) {
      warnings.push({
        severity: 'class',
        text: `${rise.toFixed(1)} m of rise is past what ${machineClass.name} is built for — the class is rated to ${String(machineClass.maxRiseM)} m.`,
      });
    }
  }
  const figures = headlineBank(analysis)?.figures;
  if (figures !== undefined) {
    if (figures.percentPopulation5Min < COMFORTABLE_HANDLING_PCT) {
      warnings.push({
        severity: 'comfort',
        text: `Handling capacity is ${figures.percentPopulation5Min.toFixed(1)}% of the population in five minutes, under ${String(COMFORTABLE_HANDLING_PCT)}% — an office building will feel slow every morning.`,
      });
    }
    if (figures.intervalS > COMFORTABLE_INTERVAL_S) {
      warnings.push({
        severity: 'comfort',
        text: `An interval of ${figures.intervalS.toFixed(1)} s is over ${String(COMFORTABLE_INTERVAL_S)} s — that reads as a long wait, whatever the average says.`,
      });
    }
  }
  return warnings;
}

/* -------------------------------------------------------------------------- *
 * The plate, the capacity line and the reading
 * -------------------------------------------------------------------------- */

/** One cell of § 13.2's brushed-metal rating plate. */
export interface DesignerPlateRow {
  readonly key: string;
  readonly value: string;
}

/**
 * § 13.2's rating plate: capacity in pounds and persons, rated speed, travel, landings, class.
 *
 * `personsOf` is `buildingSpec.ts`'s own reading of the load-to-persons table, so the plate and the
 * building editor's chips cannot disagree about how many people a 2 500 lb car holds. Landings is
 * the floor count the shaft opens onto, which for the whole design is every floor it has.
 */
export function designerPlateRows(
  spec: BuildingSpec,
  machineClass: MachineClass | undefined,
): readonly DesignerPlateRow[] {
  return [
    { key: 'CAPACITY', value: `${String(spec.ratedLoadLb)} lb` },
    { key: 'PERSONS', value: String(personsOf(spec.ratedLoadLb)) },
    { key: 'RATED SPEED', value: `${spec.ratedSpeedMps.toFixed(2)} m/s` },
    { key: 'TRAVEL', value: `${riseM(spec).toFixed(1)} m` },
    { key: 'LANDINGS', value: String(spec.floors + spec.belowLobby.length + 1) },
    { key: 'CLASS', value: machineClass?.name ?? spec.specClass },
  ];
}

/**
 * § 13.2's capacity line — the guide writes it
 * *Capacity 800 · occupied 560 (70%) · 28 people on a typical floor today*.
 *
 * **The third clause deviates, and the deviation is the board's own doing.** *A typical floor* is a
 * mean over floors, drawn on a screen whose § 13.2 elevation gives every floor its own occupancy
 * slider — so it is a claim about a distribution this very surface exists to let a reader make
 * lumpy, and the word *typical* is a mean cue over a figure with no sample behind it. What is
 * printed instead is the same arithmetic with **its denominator on the face of it**: the per-floor
 * figure and the floor count it was divided by. A reader learns what one floor holds and can see
 * what that average is over, which is what the clause was for.
 *
 * The honesty search found this before the deviation was written — R3 flagged the guide's own
 * wording on a run whose mean wait happened to be the same integer — and the collision is not why
 * it changed: a coincidence would have been registered, not fixed. It changed because the sentence
 * was a mean presented as a fact about a typical case, on the one screen that can prove there is no
 * typical case.
 */
export function designerCapacityLine(spec: BuildingSpec): string {
  const capacity = totalCapacity(spec);
  const occupied = totalPopulation(spec);
  const pct = capacity === 0 ? 0 : Math.round((occupied / capacity) * 100);
  const floors = Math.max(1, spec.floors);
  const perFloor = Math.round(occupied / floors);
  return (
    `Capacity ${String(capacity)} · occupied ${String(occupied)} (${String(pct)}%) · ` +
    `${String(perFloor)} people a floor across ${String(floors)} floors`
  );
}

/**
 * § 10's stops-versus-travel sentence, read off the analysis rather than recomputed.
 *
 * `SpecBankAnalysis.reading` is `buildingSpec.ts`'s own arm of exactly this branch, taken against
 * the closed form's `stopTimeS + transferTimeS` versus its `travelTimeS`. Recomputing it here from
 * the same three fields would be a second copy of a one-line comparison — cheap to write and the
 * exact shape of thing that goes stale when the closed form learns a fourth term.
 *
 * `''` when the bank refused, because there is no round trip to read.
 */
export function designerReading(analysis: SpecUpPeakAnalysis): string {
  return headlineBank(analysis)?.reading ?? '';
}
