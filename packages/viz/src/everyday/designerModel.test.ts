/**
 * **The drawing board's figures, steps and warnings.**
 *
 * The load-bearing case in this file is the first one: the designer's interval and handling
 * capacity must come from `analyzeUpPeak` — ENGINE_CONTRACT § 10's rule and § 20.7's by name — and
 * the way that is checked here is by computing the same figures **through the closed form directly**
 * and requiring the screen's cells to equal them. A second copy of § 10's five-line arithmetic would
 * pass a test written against § 10's five-line arithmetic; it would not pass this one.
 *
 * The rest is § 10.1's *steps within a class, never free numbers*, the warnings in priority order
 * with the fixes some of them carry, and the words the side panel says about a shaft and a floor.
 * Whether an edit reaches the **run** is `authoring/towerPlan.test.ts`'s, compared on the legs.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  analyzeUpPeak,
  parseBuilding,
  parseElevatorSpecs,
  resolveBuilding,
  type ElevatorSpecs,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import {
  PLAN_TEMPLATES,
  blankPlan,
  buildingFromPlan,
  planAnalysisOf,
  planFromBuilding,
  planRiseM,
  planTotalPopulation,
  skyLobbyPlan,
  supertallPlan,
  withCars,
  withDecks,
  withEscalatorCapacity,
  withEscalatorToggled,
  withFloors,
  withPopulation,
  withShaftAdded,
  withShafts,
  withSkyLobbyToggled,
  withStopToggled,
  zonedTowerPlan,
  type PlanShaft,
  type TowerPlan,
} from '../authoring/towerPlan.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  automaticClassFor,
  classOfMachine,
  designerCapacityChoices,
  designerEscalatorIdleNote,
  designerCapacityLine,
  designerFigures,
  designerFloorFacts,
  designerGroupRows,
  designerLossLine,
  designerPlateRows,
  designerReading,
  designerServiceLine,
  designerShaftRows,
  designerWarnings,
  loadStepsFor,
  machineSnappedTo,
  speedStepsFor,
  stepAtOrBelow,
  stopsSummary,
  withPlanMachineClass,
  withPlanMachineStep,
  CATALOGUE_SPEEDS_MPS,
  COMFORTABLE_HANDLING_PCT,
  COMFORTABLE_INTERVAL_S,
  DESIGNER_ABSENCES,
  DESIGNER_COPY,
  DESIGNER_STEPS,
  DESIGNER_TEMPLATE_COPY,
} from './designerModel.js';

const SPECS: ElevatorSpecs = parseElevatorSpecs(
  JSON.parse(readFileSync(join(DATA_DIR, 'elevator-specs.json'), 'utf8')) as unknown,
);
const CLASSES = classesFromSpecs(SPECS);
const classNamed = (id: string): MachineClass => CLASSES.find((entry) => entry.id === id) as MachineClass;
const SIZED: TowerPlan = blankPlan();
const keyAt = (plan: TowerPlan, index: number): string => (plan.shafts[index] as PlanShaft).key;
const valueOf = (plan: TowerPlan, label: string): string =>
  designerFigures(plan, planAnalysisOf(plan, SPECS), 'metric').find((figure) => figure.label === label)?.value ?? '';

describe('the figures are the closed form, not a second copy of § 10', () => {
  it('prints the interval and handling capacity `analyzeUpPeak` computes, to the digit', () => {
    const file = `${SIZED.id}.json`;
    const resolved = resolveBuilding(parseBuilding(buildingFromPlan(SIZED, SPECS) as unknown, file), SPECS, { file });
    const direct = analyzeUpPeak(resolved, SPECS, { bankId: 'main' }).result;
    expect(valueOf(SIZED, 'Interval')).toBe(`${direct.intervalS.toFixed(1)} s`);
    expect(valueOf(SIZED, 'Handling capacity')).toBe(`${direct.percentPopulation5Min.toFixed(1)}%`);
  });

  it('takes people and height from the plan, not from a second derivation', () => {
    expect(valueOf(SIZED, 'People')).toBe(String(planTotalPopulation(SIZED)));
    expect(valueOf(SIZED, 'Height')).toBe(`${planRiseM(SIZED).toFixed(1)} m`);
    /* A pair of cars in one shaft is two lifts in one shaft, and the cell says both numbers. */
    const paired = withCars(SIZED, [keyAt(SIZED, 0)], 2);
    const lifts = designerFigures(paired, planAnalysisOf(paired, SPECS), 'metric').find((figure) => figure.label === 'Lifts');
    expect(lifts?.value).toBe('5');
    expect(lifts?.note).toContain('4 shafts');
  });

  it('quotes the group that moves the smallest share of its people, and names it', () => {
    const zoned = zonedTowerPlan();
    const analysis = planAnalysisOf(zoned, SPECS);
    const shares = analysis.banks.map((bank) => bank.figures?.percentPopulation5Min ?? Infinity);
    const lowest = Math.min(...shares);
    const cell = designerFigures(zoned, analysis, 'metric').find((figure) => figure.label === 'Handling capacity');
    expect(cell?.value).toBe(`${lowest.toFixed(1)}%`);
    expect(cell?.note).toContain(`group ${String(shares.indexOf(lowest) + 1)}, the lowest of ${String(shares.length)}`);
    /* One group needs no name: there is nothing to tell it apart from. */
    expect(designerFigures(SIZED, planAnalysisOf(SIZED, SPECS), 'metric').at(-1)?.note).not.toContain('group');
  });

  it('withholds a refused figure with the reason, and never a stale number or a NaN', () => {
    const none: TowerPlan = { ...SIZED, shafts: [] };
    for (const figure of designerFigures(none, planAnalysisOf(none, SPECS), 'metric').slice(3)) {
      expect(figure.withheld).toBe(true);
      expect(figure.value).toBe(DESIGNER_COPY.withheld);
      expect(figure.note.length).toBeGreaterThan(10);
      expect(figure.note).not.toContain('NaN');
    }
  });

  it('reads § 10’s stops-versus-travel sentence off the analysis rather than recomputing it', () => {
    const analysis = planAnalysisOf(SIZED, SPECS);
    expect(designerReading(analysis)).toBe(analysis.banks[0]?.reading);
    expect(designerReading(planAnalysisOf({ ...SIZED, shafts: [] }, SPECS))).toBe('');
  });
});

describe('§ 10.1 — speed and load are steps within a class', () => {
  it('offers only catalogue speeds inside the class’s own band, and never an empty ladder', () => {
    for (const machineClass of CLASSES) {
      const steps = speedStepsFor(machineClass);
      expect(steps.length, machineClass.id).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step).toBeGreaterThanOrEqual(machineClass.speedMinMps);
        expect(step).toBeLessThanOrEqual(machineClass.speedMaxMps);
        expect(CATALOGUE_SPEEDS_MPS).toContain(step);
      }
      /* A shipped building at its class's typical speed keeps it: Garden Apartments runs at 0.63. */
      expect(steps, machineClass.id).toContain(machineClass.speedTypicalMps);
    }
  });

  it('offers only rated loads inside the class’s own capacity range', () => {
    for (const machineClass of CLASSES) {
      for (const load of loadStepsFor(machineClass)) {
        expect(load).toBeGreaterThanOrEqual(machineClass.loadMinLb);
        expect(load).toBeLessThanOrEqual(machineClass.loadMaxLb);
      }
    }
  });

  it('carries a class change down onto the new class’s steps, never up', () => {
    const hydraulic = classNamed('hydraulic');
    const snapped = machineSnappedTo(hydraulic, { specClass: 'gearless-traction', ratedSpeedMps: 4, ratedLoadLb: 4000 });
    expect(snapped.specClass).toBe('hydraulic');
    expect(snapped.ratedSpeedMps).toBeLessThanOrEqual(hydraulic.speedMaxMps);
    expect(snapped.ratedLoadLb).toBeLessThanOrEqual(hydraulic.loadMaxLb);
    expect(speedStepsFor(hydraulic)).toContain(snapped.ratedSpeedMps);
  });

  it('writes the shafts it names and no other', () => {
    const second = keyAt(SIZED, 1);
    const changed = withPlanMachineClass(SIZED, [second], classNamed('hydraulic'));
    expect(changed.shafts.map((shaft) => shaft.machine.specClass)).toEqual([
      'geared-traction',
      'hydraulic',
      'geared-traction',
      'geared-traction',
    ]);
    const stepped = withPlanMachineStep(SIZED, [second], { ratedLoadLb: 4000 });
    expect(stepped.shafts.map((shaft) => shaft.machine.ratedLoadLb)).toEqual([2500, 4000, 2500, 2500]);
    expect(classOfMachine(CLASSES, (changed.shafts[1] as PlanShaft).machine)?.id).toBe('hydraulic');
  });

  it('picks the first class rated for the rise and the floor count, and never nothing', () => {
    expect(automaticClassFor(CLASSES, 12, 4)?.id).toBe('hydraulic');
    expect(automaticClassFor(CLASSES, 300, 55)?.id).toBe('gearless-traction');
    expect(automaticClassFor(CLASSES, 5000, 900)).toBe(CLASSES.at(-1));
  });

  it('snaps to the step at or below, and to the first step when everything is above', () => {
    expect(stepAtOrBelow([1, 2.5, 4], 3)).toBe(2.5);
    expect(stepAtOrBelow([1, 2.5, 4], 0.2)).toBe(1);
  });
});

describe('the warnings, most serious first, and the fixes some of them carry', () => {
  const warningsOf = (plan: TowerPlan): ReturnType<typeof designerWarnings> =>
    designerWarnings(plan, CLASSES, planAnalysisOf(plan, SPECS), 'metric');

  it('is quiet on a design that runs, is inside its class and inside both comfort bounds', () => {
    expect(warningsOf(SIZED)).toEqual([]);
  });

  it('says a floor with no doors before it says anything about comfort', () => {
    const tall = { ...SIZED, floors: 13 };
    const warnings = warningsOf(tall);
    expect(warnings[0]?.severity).toBe('blocker');
    expect(warnings[0]?.text).toContain('No lift stops at 13');
  });

  it('offers the one press that joins stranded floors to the lobby, and the press mends it', () => {
    const cut = withSkyLobbyToggled(skyLobbyPlan(), [30]);
    const stranded = warningsOf(cut).find((warning) => warning.text.includes('cannot be reached from the lobby'));
    expect(stranded?.severity).toBe('blocker');
    expect(stranded?.fix?.label).toBe('Make floor 30 a sky lobby');
    const mended = stranded?.fix?.apply(cut) as TowerPlan;
    expect(mended.skyLobbies).toEqual([30]);
    expect(warningsOf(mended).filter((warning) => warning.severity === 'blocker')).toEqual([]);
  });

  it('refuses a group made only of two-car shafts, and its fix leaves one ordinary shaft', () => {
    const all = withCars(SIZED, SIZED.shafts.map((shaft) => shaft.key), 2);
    const paired = warningsOf(all).find((warning) => warning.text.includes('Every shaft in group'));
    expect(paired?.severity).toBe('blocker');
    const mended = paired?.fix?.apply(all) as TowerPlan;
    expect(mended.shafts.map((shaft) => shaft.cars)).toEqual([2, 2, 2, 1]);
    expect(warningsOf(mended).some((warning) => warning.text.includes('Every shaft in group'))).toBe(false);
  });

  it('names the floor a double deck cannot pair, and its fix takes the second deck off', () => {
    const key = keyAt(SIZED, 0);
    /* Twelve floors above the lobby is thirteen landings: one is left over. */
    const decked = withDecks(SIZED, [key], 2);
    /*
     * One pair beside ordinary shafts runs sectored, so the line names the boundary the board
     * wrote and what the upper car cannot do, and no longer says the pair locks.
     */
    const one = withCars(SIZED, [keyAt(SIZED, 0)], 2);
    const locked = warningsOf(one).find((warning) => warning.text.includes('holds two cars'));
    expect(locked?.severity).toBe('comfort');
    expect(locked?.text).toContain('The lower car serves 6 and below');
    expect(locked?.text).not.toContain('locks');
    expect(warningsOf(one).some((warning) => warning.severity === 'blocker')).toBe(false);
    expect((locked?.fix?.apply(one) as TowerPlan).shafts.every((shaft) => shaft.cars === 1)).toBe(true);
    expect(warningsOf(SIZED).some((warning) => warning.text.includes('holds two cars'))).toBe(false);

    const unpaired = warningsOf(decked).find((warning) => warning.text.includes('double-deck'));
    expect(unpaired?.text).toContain('12 has no stop next to it');
    expect((unpaired?.fix?.apply(decked) as TowerPlan).shafts[0]?.decks).toBe(1);
  });

  it('says a machine is outside its class with both numbers, after what will not run', () => {
    const hydraulic = withPlanMachineClass(SIZED, SIZED.shafts.map((shaft) => shaft.key), classNamed('hydraulic'));
    const classWarning = warningsOf(hydraulic).find((warning) => warning.severity === 'class');
    expect(classWarning?.text).toContain('Shafts A B C D travel up to 12 floors and 43.2 m');
    expect(classWarning?.text).toContain('rated to 6 floors and 18 m');
    expect(warningsOf(hydraulic).map((warning) => warning.severity).indexOf('class')).toBe(0);
  });

  it('says a group mixing hydraulic and traction lifts loses the chosen rope and drive, and only then', () => {
    const mixed = withPlanMachineClass(SIZED, [keyAt(SIZED, 1)], classNamed('hydraulic'));
    const lost = (plan: TowerPlan): boolean => warningsOf(plan).some((warning) => warning.text.includes('mixes hydraulic and traction'));
    /* Nothing chosen, nothing lost. */
    expect(lost({ ...mixed, regenerativeDrive: false, ropeClass: undefined })).toBe(false);
    const fitted = { ...mixed, regenerativeDrive: true };
    expect(lost(fitted)).toBe(true);
    expect(warningsOf(fitted).find((warning) => warning.text.includes('mixes hydraulic'))?.text).toContain('change shaft B');
    /* All traction, or all hydraulic, is not a mix. */
    expect(lost({ ...SIZED, regenerativeDrive: true })).toBe(false);
    const allHydraulic = withPlanMachineClass(SIZED, SIZED.shafts.map((shaft) => shaft.key), classNamed('hydraulic'));
    expect(lost({ ...allHydraulic, regenerativeDrive: true })).toBe(false);
  });

  it('warns under 11% handling capacity and over a forty-second interval, in that order', () => {
    const crowded = { ...SIZED, peoplePerBay: 80, shafts: SIZED.shafts.slice(0, 1) };
    const comfort = warningsOf(crowded).filter((warning) => warning.severity === 'comfort');
    expect(comfort).toHaveLength(2);
    expect(comfort[0]?.text).toContain(`under ${String(COMFORTABLE_HANDLING_PCT)}%`);
    expect(comfort[1]?.text).toContain(`over ${String(COMFORTABLE_INTERVAL_S)} s`);
  });

  it('says nothing about comfort when nothing was sized', () => {
    const none: TowerPlan = { ...SIZED, shafts: [] };
    const warnings = warningsOf(none);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.severity).toBe('blocker');
  });
});

describe('the rows under the drawing', () => {
  it('gives every group a row with its shafts, its pattern and where its doors open', () => {
    const zoned = zonedTowerPlan();
    const rows = designerGroupRows(zoned, planAnalysisOf(zoned, SPECS));
    expect(rows.map((row) => [row.name, row.shafts, row.stops])).toEqual([
      ['Group 1', 'A B C D', 'G–20'],
      ['Group 2', 'E F G H I', 'G, 21–40'],
    ]);
    expect(rows[0]?.pattern).toBe('Local · 4 cars');
    expect(rows[1]?.pattern).toBe('Express · 5 cars');
    for (const row of rows) expect(row.withheld).toBe(false);
  });

  it('says a group the closed form refused is not sized, rather than quoting bank ids at a player', () => {
    const sky = skyLobbyPlan();
    const analysis = planAnalysisOf(sky, SPECS);
    const shuttle = designerGroupRows(sky, analysis).find((row) => row.pattern.startsWith('Shuttle'));
    expect(shuttle?.withheld).toBe(true);
    expect(shuttle?.figure).toBe(DESIGNER_COPY.groupNotSized);
    /* The engine's own sentence still exists, for the folded document to print whole. */
    expect(analysis.banks.some((bank) => bank.refusal.length > 0)).toBe(true);
  });

  it('gives every shaft a row that says what is unusual about it', () => {
    const tall = supertallPlan();
    const rows = designerShaftRows(tall, CLASSES, 'metric');
    expect(rows).toHaveLength(tall.shafts.length);
    const shuttle = rows.find((row) => row.marks.includes('double-deck'));
    expect(shuttle?.reach).toBe('G to 68');
    expect(shuttle?.figure).toContain('persons a deck');
    const goods = designerShaftRows(
      withShafts(SIZED, [keyAt(SIZED, 0)], (shaft) => ({ ...shaft, duty: 'goods', pressurised: true })),
      CLASSES,
      'metric',
    )[0];
    expect(goods?.marks).toEqual(['goods', 'pressurised cabin']);
  });

  it('shortens a stop list without hiding its shape', () => {
    expect(stopsSummary(SIZED, [0, 1, 2, 3, 4])).toBe('G–4');
    expect(stopsSummary(SIZED, [0, 21, 22, 23])).toBe('G, 21–23');
    expect(stopsSummary(SIZED, [0, 1, 29, 30])).toBe('G, 1, 29, 30');
  });
});

describe('the plate and the people line', () => {
  const shaft = SIZED.shafts[0] as PlanShaft;
  const plate = (units: 'metric' | 'imperial', of: PlanShaft = shaft, plan: TowerPlan = SIZED): Record<string, string> =>
    Object.fromEntries(
      designerPlateRows(plan, of, classOfMachine(CLASSES, of.machine), units).map((row) => [row.key, row.value]),
    );

  it('reads the plate’s persons from the load-to-persons table, and per deck on a double deck', () => {
    expect(plate('metric')['PERSONS']).toBe('16');
    expect(plate('metric')['LANDINGS']).toBe('13');
    const tall = supertallPlan();
    const shuttle = tall.shafts.find((entry) => entry.decks === 2) as PlanShaft;
    expect(plate('metric', shuttle, tall)['PERSONS']).toBe('13 a deck');
    expect(plate('metric', shuttle, tall)['LANDINGS']).toBe('6');
  });

  it('converts the plate’s two metre-denominated rows to feet, and leaves the load alone', () => {
    const metric = plate('metric');
    const imperial = plate('imperial');
    expect(metric['RATED SPEED']).toContain('m/s');
    expect(imperial['RATED SPEED']).toContain('ft/s');
    expect(metric['TRAVEL']).toBe('43.2 m');
    expect(imperial['TRAVEL']).toContain('ft');
    for (const key of ['CAPACITY', 'PERSONS', 'LANDINGS', 'CLASS']) expect(imperial[key]).toBe(metric[key]);
  });

  it('prints both ends of how the plate spreads people, never one floor standing for all', () => {
    expect(designerCapacityLine(SIZED)).toBe(
      '816 people · 20 people a shaft bay at 85% let · every floor is 4 bays wide and holds 68',
    );
    const stepped = withShaftAdded(withShaftAdded(SIZED, 0, 4), 0, 4);
    expect(designerCapacityLine(stepped)).toContain('the widest floor is 6 bays and holds 102, the narrowest is 4 and holds 68');
  });

  it('names what the board does not do, in sentences rather than in gaps', () => {
    expect(DESIGNER_ABSENCES).toEqual([]);
    expect(DESIGNER_COPY.serviceScopeHint).toContain('Who is allowed where');
  });
});

describe('what the side panel says about a floor and about a shaft’s doors', () => {
  it('says where a floor’s people come from, and stops saying it once a hand has set them', () => {
    const facts = designerFloorFacts(SIZED, [5, 5]);
    expect(facts.title).toBe('Floor 5');
    expect(facts.people).toBe(68);
    expect(facts.peopleNote).toBe('from its width: 4 shaft bays');
    expect(designerFloorFacts(withPopulation(SIZED, [5], 200), [5, 5]).peopleNote).toBe('set by hand');
    expect(designerFloorFacts(SIZED, [0, 0]).title).toBe('The lobby');
    expect(designerFloorFacts(SIZED, [0, 0]).canBeSkyLobby).toBe(false);
  });

  it('offers an escalator the reference table’s capacities and nothing it cannot cite', () => {
    const drawn = withEscalatorToggled(SIZED, 5);
    expect(designerFloorFacts(drawn, [5, 5]).escalatorCapacity).toBeUndefined();
    expect(designerCapacityChoices(SPECS, undefined)).toEqual([
      { value: 0, label: 'No limit' },
      { value: 3600, label: '0.6 m steps · 3,600 an hour' },
      { value: 4800, label: '0.8 m steps · 4,800 an hour' },
      { value: 6000, label: '1.0 m steps · 6,000 an hour' },
    ]);
    const capped = withEscalatorCapacity(drawn, 5, 4800);
    expect(designerFloorFacts(capped, [5, 5]).escalatorCapacity).toBe(4800);
    // A range has no single escalator, so it reports none.
    expect(designerFloorFacts(capped, [4, 6]).escalatorCapacity).toBeUndefined();
    // A figure that came in on an opened building is shown as what it is, not hidden.
    expect(designerCapacityChoices(SPECS, 2500).at(-1)).toEqual({ value: 2500, label: '2,500 an hour, as opened' });
    expect(designerCapacityChoices(SPECS, 4800)).toHaveLength(4);
    // On this plan the same lifts join floors 5 and 6, so the board says a limit changes nothing…
    expect(designerEscalatorIdleNote(drawn, planAnalysisOf(drawn, SPECS), 5)).toBe(DESIGNER_COPY.escalatorCapacityIdle);
    // …and says nothing where riders really are routed over one — a two-level lobby whose lifts
    // start at the upper level — or where there is no escalator at all.
    const closed = SIZED.shafts.reduce((plan, shaft) => withStopToggled(plan, shaft.key, 0), SIZED);
    const mezzanine = withEscalatorToggled(withSkyLobbyToggled(closed, [1]), 0);
    expect(designerEscalatorIdleNote(mezzanine, planAnalysisOf(mezzanine, SPECS), 0)).toBe('');
    expect(designerEscalatorIdleNote(SIZED, planAnalysisOf(SIZED, SPECS), 5)).toBe('');
  });

  it('takes a range of floors as one thing', () => {
    const facts = designerFloorFacts(SIZED, [8, 3]);
    expect(facts.title).toBe('Floors 3–8');
    expect(facts.people).toBe(68 * 6);
    expect(facts.canHaveEscalator).toBe(false);
    expect(facts.use).toBe(SIZED.trafficProfile);
  });

  it('says a shaft’s doors in words, and a double deck’s as pairs', () => {
    expect(designerServiceLine(SIZED, SIZED.shafts[0] as PlanShaft)).toBe('Local. Doors open at G–12.');
    const closed = withStopToggled(SIZED, keyAt(SIZED, 0), 7);
    expect(designerServiceLine(closed, closed.shafts[0] as PlanShaft)).toBe('Hand-picked. Doors open at G–6, 8–12.');
    const tall = supertallPlan();
    const shuttle = tall.shafts.find((entry) => entry.decks === 2) as PlanShaft;
    expect(designerServiceLine(tall, shuttle)).toBe(
      'Shuttle, double-deck. Doors open at G with 1, 34 with 35, 67 with 68.',
    );
  });
});

describe('the steps, the templates and an opened building', () => {
  it('names four steps in the order a reader takes them, and every template', () => {
    expect(DESIGNER_STEPS.map((step) => step.id)).toEqual(['shape', 'lifts', 'floors', 'service']);
    for (const template of PLAN_TEMPLATES) {
      expect(DESIGNER_TEMPLATE_COPY[template.id]?.name.length, template.id).toBeGreaterThan(3);
    }
  });

  it('keeps the core at the roof through the height control, so no template grows an orphan', () => {
    for (const template of PLAN_TEMPLATES) {
      const taller = withFloors(template.make(), template.make().floors + 9);
      const blockers = designerWarnings(taller, CLASSES, planAnalysisOf(taller, SPECS), 'metric').filter(
        (warning) => warning.text.startsWith('No lift stops'),
      );
      expect(blockers, template.id).toEqual([]);
    }
  });

  it('says what an opened building carried that the board cannot hold, and nothing when it holds all', () => {
    const midtown = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings/midtown-office.json'), 'utf8')) as unknown,
    );
    const reading = planFromBuilding(midtown, 'midtown-office');
    const line = designerLossLine(reading.plan.name, reading.notCarried);
    expect(line).toContain('Opened from Midtown Office.');
    expect(line).toContain('Saving makes a new building; Midtown Office is unchanged.');
    expect(designerLossLine('Anything', [])).toBe('');
  });
});
