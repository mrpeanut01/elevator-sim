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
 * - **A machine class per shaft, over a design-wide default.** It read
 *   *"One machine class for the design, not one per shaft"* — and that **stopped being true** with
 *   GitHub issue #420 (§ D227). The argument under it was sound about the model it described:
 *   `BuildingSpec` carried one `specClass`/`ratedSpeedMps`/`ratedLoadLb` triple, so five selects
 *   over it would have been § D219 exactly. The issue's answer was to build the **field** first and
 *   the pickers second, in that order and deliberately. `BuildingSpec.machineByCar` is a sparse
 *   per-shaft machine, `buildingFromSpec` deals every car from {@link machineAt},
 *   {@link designerShaftRows} is what the panel draws over it, and `authoring.test.ts` requires a
 *   shaft's own machine to change the run **on the legs**. The design's three controls are still
 *   there and are still what an unpinned shaft follows — a default rather than the only answer.
 * - **No duty, no credential dots on the elevation.** § 13.2's grid is the Engineer building
 *   editor's surface and is not re-drawn in Casual clothes on this pass. **The credential half of
 *   that is now said on the screen's own face** rather than only here — {@link DESIGNER_COPY}'s
 *   `serviceScopeHint` — because a boundary a player cannot see reads to them as a capability the
 *   product lacks.
 *
 *   **This bullet said *no escalators* and named it a genuine absence for two weeks after it
 *   stopped being one** — GitHub issue #423. It read: *"nothing authors an escalator on either
 *   surface, so it is a genuine absence and stays a row in {@link DESIGNER_ABSENCES}"*, while
 *   {@link DESIGNER_ABSENCES} eleven lines below carried a comment saying the escalator rows had
 *   left on § D518 and `designerScreen.ts#drawEscalatorPanel` was writing `spec.transportModes`.
 *   A file contradicting itself at 110 lines' distance is what this class of defect looks like
 *   from inside, and `everyday/staleRefusals.test.ts` is what now reads both ends.
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
  carLabelOf,
  machineAt,
  machineIsPinned,
  personsOf,
  riseM,
  shaftsUnlikeDesign,
  totalCapacity,
  totalPopulation,
  type BuildingSpec,
  type SpecBankAnalysis,
  type SpecUpPeakAnalysis,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import { lengthFigure, speedFigure, type EverydayUnits } from './units.js';

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
  /*
   * § 13.3 per shaft — GitHub issue #420. The heading, the *follow the design* option and the hint
   * that says what the whole block means. Written as *hang a different machine* rather than *pin*
   * or *override* because a shaft is a hole with a lift in it, and the reader is choosing the lift.
   */
  shaftsEyebrow: 'EACH SHAFT',
  shaftsFollowLabel: 'Same as the design',
  shaftsHint:
    'Every shaft carries the design’s machine unless you give it one of its own. A shaft with its own machine keeps it when you change the design above.',
  /*
   * The two hints below carry what left {@link DESIGNER_ABSENCES} under GitHub issue #283. Each
   * says where a capability is authored rather than that it is missing, and each stands beside the
   * control a reader would otherwise mistake for it — which is why they are hints and not rows in
   * a register of absences.
   */
  serviceScopeHint:
    'This board sets which floors each lift physically serves. Who is allowed where is saved with the design as well, and is written in the simulator’s building editor.',
  machineOwnershipHint:
    'A sky lobby’s starting floor, and the finer ride characteristics behind a class, are set in the simulator’s machine editor.',
  /*
   * § 13.3's escalator rows and its folded document — GitHub issue #177 item 5, § D518. Both were
   * rows in {@link DESIGNER_ABSENCES} until this board wrote them.
   */
  escalatorsEyebrow: 'ESCALATORS',
  escalatorsHint:
    'A two-level lobby is joined by an escalator, not by a shaft. One joins two floors and takes the seconds it takes; a rider whose whole journey is those two floors rides it instead of calling a lift.',
  escalatorsNone: 'No escalators. Every journey between floors here calls a lift.',
  addEscalator: '+ escalator',
  removeEscalator: 'remove',
  escalatorSecondsLabel: 'seconds a landing',
  escalatorStairsNote: 'a stair this board cannot write — its climb and its descent are two numbers, and there is one box',
  documentFold: 'The document, as an engineer would write it',
} as const);

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
 * ({@link DESIGNER_COPY}'s `serviceScopeHint` and `machineOwnershipHint`). Deleting them without
 * moving the words would have cost a reader the one sentence that tells service zoning and access
 * zoning apart, which `CLAUDE.md` names outright as a thing never to collapse. GitHub issue #283.
 */
export const DESIGNER_ABSENCES: readonly string[] = Object.freeze([
  /*
   * Two rows left on the commit that built them — GitHub issue #177 item 5, § D518: the escalator
   * rows (`designerScreen.ts#drawEscalatorPanel` writes `transportModes`, and `authoring.test.ts`
   * holds that an escalator changes the run on the legs) and the folded document (the
   * specification block is now the § 13.3 disclosure, collapsed). § D227: a refusal leaves on the
   * commit that makes it false.
   */
  /*
   * **And the last one left on the commit that built it** — GitHub issue #420. It read
   * *"a machine class per shaft — a design carries one class, one rated speed and one rated load
   * for the whole building, so a picker on each shaft would be five controls writing the same
   * setting"*, and the second half of that sentence is why it was a refusal rather than a queue
   * item: the control it described would have been § D219's defect, so the issue said to build the
   * **field** first. `BuildingSpec.machineByCar` is the field, {@link designerShaftRows} and
   * `designerScreen.ts#drawMachinePanel` are the pickers over it, and `authoring.test.ts`'s *the
   * machines editor is not decoration* holds that moving one changes the run on the legs. Its
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
 * § 10.1 per shaft — GitHub issue #420
 * -------------------------------------------------------------------------- */

/**
 * **Hang a machine in one shaft, or take it down again.**
 *
 * {@link withMachineClass}'s twin, and the same snapping rule for the same reason: a shaft handed a
 * class while holding the design's speed would hold a speed outside its own band, and that is a
 * document `parseBuilding` refuses. Both steps come down to the nearest rung the new class has —
 * *down* rather than up, because a shaft that quietly got faster when its machine was changed would
 * be a control doing more than it says.
 *
 * `undefined` **clears** the pin rather than writing a machine that happens to equal the design's,
 * and the difference is the whole of what {@link BuildingSpec.machineByCar} is sparse for: a
 * cleared shaft follows the design's own controls from then on, and a shaft pinned to the design's
 * current machine stops following them the moment the design chip moves.
 */
export function withShaftMachine(
  spec: BuildingSpec,
  car: number,
  machineClass: MachineClass | undefined,
): BuildingSpec {
  const machineByCar = { ...spec.machineByCar };
  if (machineClass === undefined) {
    delete machineByCar[car];
    return { ...spec, machineByCar };
  }
  const from = machineAt(spec, car);
  machineByCar[car] = {
    specClass: machineClass.id,
    ratedSpeedMps: stepAtOrBelow(speedStepsFor(machineClass), from.ratedSpeedMps),
    ratedLoadLb: stepAtOrBelow(loadStepsFor(machineClass), from.ratedLoadLb),
  };
  return { ...spec, machineByCar };
}

/**
 * **What one shaft picker's value means** — the three answers, told apart before the model is asked.
 *
 * The picker's options are *Same as the design* at `''`, one per entry of `classes`, and — on a
 * shaft whose own class this build does not have — a last one carrying that class's raw id, so the
 * select does not silently read *Same as the design* while the figure beneath it says otherwise.
 *
 * That last option is why this is a function rather than a `classes.find(…)` at the call site.
 * `find` answers `undefined` for two different questions — *the reader chose to follow the design*
 * and *the reader chose the machine this shaft already has, under a name this build cannot resolve*
 * — and {@link withShaftMachine} reads `undefined` as **clear the pin**. So the handler said the
 * opposite of what the option means: the one control drawn to preserve an unresolvable pin is the
 * one that would have thrown it away.
 *
 * **Would have — and that is the whole claim, because the branch is not reachable from the shipped
 * screen and this docstring is not going to say it was.** An independent review raised it from
 * reading and marked it *plausible, not driven*; driving it is impossible, and the construction
 * says why rather than a plausibility argument. `designerScreen.ts` appends that option with
 * `selected = true` unconditionally, and `drawMachinePanel` opens with `replaceChildren()` and ends
 * with `drawShaftMachines()`, so the `<select>` is rebuilt whole on every redraw and its value **is**
 * the unresolvable id at every moment the option exists. A `change` event carries a value the
 * select did not already hold, and every other value it can hold is a member of `classes` or `''`.
 * There is no input that reaches the wrong branch — and none a fixture can manufacture either,
 * which is why no test here drives the screen for it.
 *
 * What is left after that is worth fixing anyway, and is the reason this function exists rather
 * than a comment: a handler that contradicted the option above it, held apart by nothing but which
 * option happened to be pre-selected. The sentence this paragraph replaced — *selecting the shaft's
 * own machine set the shaft to Same as the design* — was a mechanism nobody measured, which is the
 * thing [§ D256](../../../../DECISIONS.md) refuses, and it would have been the second false
 * sentence this seam shipped.
 *
 * `keep` is the honest third answer: the shaft already carries that machine, so there is nothing to
 * write. Extracted from the listener rather than guarded inside it because a source grep is not a
 * test — the only thing holding this seam was `staleRefusals.test.ts` asserting the screen's source
 * *contains* `withShaftMachine`, which passes just as well when the listener writes the wrong car.
 */
export type ShaftPick =
  | { readonly kind: 'follow' }
  | { readonly kind: 'class'; readonly machineClass: MachineClass }
  | { readonly kind: 'keep' };

export function shaftPickOf(classes: readonly MachineClass[], value: string): ShaftPick {
  if (value === '') return { kind: 'follow' };
  const machineClass = classes.find((entry) => entry.id === value);
  return machineClass === undefined ? { kind: 'keep' } : { kind: 'class', machineClass };
}

/** Move one pinned shaft's speed or load onto another rung. A no-op on a shaft with no pin. */
export function withShaftStep(
  spec: BuildingSpec,
  car: number,
  step: { readonly ratedSpeedMps: number } | { readonly ratedLoadLb: number },
): BuildingSpec {
  const pinned = spec.machineByCar[car];
  if (pinned === undefined) return spec;
  return { ...spec, machineByCar: { ...spec.machineByCar, [car]: { ...pinned, ...step } } };
}

/** One shaft's row in § 13.3's machine panel — what it carries, and whether that is its own. */
export interface DesignerShaftRow {
  /** The car index the row writes, so a caller never re-derives it from the label. */
  readonly car: number;
  /** `A` onward, the label the elevation draws over the shaft. */
  readonly label: string;
  /** The class this shaft carries, named as a player reads it. */
  readonly className: string;
  /** Its rated speed and load, in the reader's own units. */
  readonly figure: string;
  /** True where this shaft carries a machine of its own rather than the design's. */
  readonly pinned: boolean;
}

/**
 * **Every shaft, and the machine in it** — § 13.3's machine panel, one row per shaft.
 *
 * This is the model half of GitHub issue #420. `DESIGNER_ABSENCES` refused a per-shaft picker on
 * the grounds that *"a design carries one class, one rated speed and one rated load for the whole
 * building, so a picker on each shaft would be five controls writing the same setting"* — which was
 * a correct reading of a model that had one machine in it, and § D219's defect said in advance.
 * `BuildingSpec.machineByCar` is that model changed; this function is what the screen draws over
 * it, and `authoring.test.ts` is what holds the pair to the legs.
 *
 * **The rows are the shafts, not the pins.** A shaft following the design gets a row saying what it
 * carries, because a panel that listed only the pinned ones would be asking a reader to infer the
 * default from a gap — and the design's own class chips sit directly above, so the whole panel
 * reads as one statement about the fleet.
 *
 * `pinned` is a fact rather than a formatting hint: it is what the *clear* control is gated on, and
 * it is the difference {@link withShaftMachine} refuses to blur.
 */
export function designerShaftRows(
  spec: BuildingSpec,
  classes: readonly MachineClass[],
  units: EverydayUnits,
): readonly DesignerShaftRow[] {
  const rows: DesignerShaftRow[] = [];
  for (let car = 0; car < spec.cars; car += 1) {
    const machine = machineAt(spec, car);
    const named = classes.find((entry) => entry.id === machine.specClass);
    rows.push({
      car,
      label: carLabelOf(car),
      className: named?.name ?? machine.specClass,
      figure: `${speedFigure(machine.ratedSpeedMps, units)} · ${String(machine.ratedLoadLb)} lb · ${String(personsOf(machine.ratedLoadLb))} persons`,
      pinned: machineIsPinned(spec, car),
    });
  }
  return rows;
}

/**
 * The one sentence the specification block owes a design whose shafts differ.
 *
 * § 13.2's rating plate quotes **one** machine, which was the whole building until a shaft could
 * carry its own. Leaving the plate to speak for a fleet with two machines in it would be `CLAUDE.md`'s
 * *a published number goes stale* at rating-plate scale: every figure on it would still be true of
 * some shaft and none of them true of the building. So the plate keeps quoting the design's machine
 * — which is what a plate is — and this line says whose figures those are and how many shafts do
 * not carry them. `''` where every shaft carries the design's machine, because a sentence about an
 * exception that does not exist is one a reader learns to skip.
 *
 * **Counted by {@link shaftsUnlikeDesign}, which is a comparison and not a count of pins, and the
 * choice between those two readings is what this sentence is.** It shipped counting the keys of
 * `machineByCar`, and that is a different question: {@link withShaftMachine} snaps a shaft's steps
 * into the class it is handed, so handing it the design's **own** class writes a pin byte-equal to
 * the design. Two clicks from the shipped `blank tower` button the note read *1 of 4 shafts carries
 * a different one* while `buildingSummary` read *4 cars at 2.50 m/s · 16 persons each* about the
 * same spec — two surfaces disagreeing about one design, which is what the `surfaces-disagree`
 * honesty property exists for and cannot see here, because the two sit on different adapters.
 *
 * Rewording to *“carries a machine of its own”* would have been true of the keys and would have
 * been the wrong sentence, because this line's whole job is the one its paragraph above states:
 * to say when the plate stops describing the building. A shaft holding the design's own machine is
 * a shaft the plate describes exactly, so there is nothing to say and it says nothing.
 *
 * The **row** above keeps saying `pinned`, and that divergence is deliberate rather than an
 * oversight to tidy up: {@link DesignerShaftRow.pinned} is what the clear control is gated on and
 * what {@link withShaftMachine} refuses to blur, while this line is about the plate.
 */
export function designerShaftNote(spec: BuildingSpec): string {
  const unlike = shaftsUnlikeDesign(spec);
  if (unlike === 0) return '';
  return (
    `This plate is the design’s machine. ${String(unlike)} of ${String(spec.cars)} shaft${spec.cars === 1 ? '' : 's'} ` +
    `carr${unlike === 1 ? 'ies' : 'y'} a different one, listed with the machines above.`
  );
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
 *
 * ## The two rows the `Units` preference reaches, and the one it does not
 *
 * ENGINE_CONTRACT § 13 — *metres by default; the `Units` setting switches machine specs to feet and
 * must convert, not relabel* — and this plate is § 13.2's, so `RATED SPEED` and `TRAVEL` are drawn
 * through `everyday/units.ts` rather than formatted here. **`CAPACITY` is not**, and the exception
 * is `CLAUDE.md`'s own worked example rather than an oversight: `ratedLoadLb` is reference data
 * with the unit in the identifier, § 13's clause is about metres and feet, and a rating plate is
 * exactly where a machine's imperial rated load belongs. See
 * [§ D448](../../../../DECISIONS.md).
 *
 * `units` is **required**, for the reason `menu/screens.ts#applyIntent` gives about its catalogue:
 * an optional preference would let a caller silently opt out of the conversion and keep drawing
 * metres, which is the defect this parameter exists to close, wearing a default.
 */
export function designerPlateRows(
  spec: BuildingSpec,
  machineClass: MachineClass | undefined,
  units: EverydayUnits,
): readonly DesignerPlateRow[] {
  return [
    { key: 'CAPACITY', value: `${String(spec.ratedLoadLb)} lb` },
    { key: 'PERSONS', value: String(personsOf(spec.ratedLoadLb)) },
    { key: 'RATED SPEED', value: speedFigure(spec.ratedSpeedMps, units) },
    { key: 'TRAVEL', value: lengthFigure(riseM(spec), units) },
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
