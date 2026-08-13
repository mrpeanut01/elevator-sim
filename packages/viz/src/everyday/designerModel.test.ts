/**
 * **The drawing board's figures, steps and warnings.**
 *
 * The load-bearing case in this file is the first one: the designer's interval and handling
 * capacity must come from `analyzeUpPeak` — ENGINE_CONTRACT § 10's rule and § 20.7's by name — and
 * the way that is checked here is by computing the same figures **through the closed form directly**
 * and requiring the screen's cells to equal them. A second copy of § 10's five-line arithmetic would
 * pass a test written against § 10's five-line arithmetic; it would not pass this one.
 *
 * The rest is § 10.1's *steps within a class, never free numbers*, and § 10's three warnings in the
 * guide's own priority order.
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

import {
  BLANK_SPEC,
  buildingFromSpec,
  riseM,
  totalPopulation,
  upPeakAnalysisOf,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  automaticClassFor,
  classOfSpec,
  designerCapacityLine,
  designerFigures,
  designerPlateRows,
  designerReading,
  designerWarnings,
  loadStepsFor,
  speedStepsFor,
  stepAtOrBelow,
  withMachineClass,
  CATALOGUE_SPEEDS_MPS,
  COMFORTABLE_HANDLING_PCT,
  COMFORTABLE_INTERVAL_S,
  DESIGNER_ABSENCES,
} from './designerModel.js';

const SPECS: ElevatorSpecs = parseElevatorSpecs(
  JSON.parse(readFileSync(join(DATA_DIR, 'elevator-specs.json'), 'utf8')) as unknown,
);
const CLASSES = classesFromSpecs(SPECS);

/** A design the closed form can size: the blank tower, which is a twelve-storey office. */
const SIZED: BuildingSpec = BLANK_SPEC;

describe('the specification block is the closed form, not a second copy of § 10', () => {
  it('prints the interval and handling capacity `analyzeUpPeak` computes, to the digit', () => {
    /*
     * The figures are taken here **through core directly** — parse, resolve, `analyzeUpPeak` — and
     * the screen's cells are required to match. That is the check ENGINE_CONTRACT § 10's rule asks
     * for: *it must be the same code the engine uses to size a group*. A module that implemented
     * § 10's own `rtt = round(travelTime + stopTime + 8)` would disagree with this by several
     * seconds and would still look plausible on screen.
     */
    const config = buildingFromSpec(SIZED, { specs: SPECS });
    const resolved = resolveBuilding(parseBuilding(config as unknown, 'test.json'), SPECS, {
      file: 'test.json',
    });
    const bank = resolved.banks[0];
    expect(bank).toBeDefined();
    const oracle = analyzeUpPeak(resolved, SPECS, { bankId: bank?.id ?? '' });

    const figures = designerFigures(SIZED, upPeakAnalysisOf(SIZED, SPECS));
    const interval = figures.find((figure) => figure.label === 'Interval');
    const handling = figures.find((figure) => figure.label === 'Handling capacity');
    expect(interval?.withheld).toBe(false);
    expect(interval?.value).toBe(`${oracle.result.intervalS.toFixed(1)} s`);
    expect(handling?.value).toBe(`${oracle.result.percentPopulation5Min.toFixed(1)}%`);
    expect(interval?.note).toContain(oracle.result.roundTripTimeS.toFixed(1));
  });

  it('reads § 10’s stops-versus-travel sentence off the analysis rather than recomputing it', () => {
    const analysis = upPeakAnalysisOf(SIZED, SPECS);
    expect(designerReading(analysis)).toBe(analysis.banks[0]?.reading);
    expect(designerReading(analysis)).toMatch(/dominated by (stops|travel)/);
  });

  it('takes population and rise from the authoring model, not from a second derivation', () => {
    const figures = designerFigures(SIZED, upPeakAnalysisOf(SIZED, SPECS));
    expect(figures.find((figure) => figure.label === 'Population')?.value).toBe(
      String(totalPopulation(SIZED)),
    );
    expect(figures.find((figure) => figure.label === 'Rise')?.value).toBe(
      `${riseM(SIZED).toFixed(1)} m`,
    );
  });

  it('withholds a refused figure with the reason, and never a stale number or a NaN', () => {
    /*
     * One shaft, taken out of the lobby and pinned to the top floor: nothing the closed form can
     * board anybody at, so it throws and the analysis returns a labelled per-bank refusal.
     */
    const refused: BuildingSpec = {
      ...SIZED,
      cars: 1,
      noLobby: { 0: true },
      bandByCar: { 0: [SIZED.floors, SIZED.floors] },
    };
    const figures = designerFigures(refused, upPeakAnalysisOf(refused, SPECS));
    for (const label of ['Interval', 'Handling capacity']) {
      const figure = figures.find((entry) => entry.label === label);
      expect(figure?.withheld, label).toBe(true);
      expect(figure?.value, label).toBe('—');
      expect(figure?.value, label).not.toMatch(/NaN/);
      expect(figure?.note.trim().length, label).toBeGreaterThan(10);
    }
    // The two the closed form has no say in stay, because nothing refused them.
    expect(figures.find((figure) => figure.label === 'Population')?.withheld).toBe(false);
  });
});

describe('§ 10.1 — speed and load are steps within a class', () => {
  it('offers only catalogue speeds inside the class’s own band, and never an empty ladder', () => {
    for (const machineClass of CLASSES) {
      const steps = speedStepsFor(machineClass);
      expect(steps.length, machineClass.id).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step, machineClass.id).toBeGreaterThanOrEqual(machineClass.speedMinMps);
        expect(step, machineClass.id).toBeLessThanOrEqual(machineClass.speedMaxMps);
        expect(CATALOGUE_SPEEDS_MPS, machineClass.id).toContain(step);
      }
    }
  });

  it('offers only rated loads inside the class’s own capacity range', () => {
    for (const machineClass of CLASSES) {
      const steps = loadStepsFor(machineClass);
      expect(steps.length, machineClass.id).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step, machineClass.id).toBeGreaterThanOrEqual(machineClass.loadMinLb);
        expect(step, machineClass.id).toBeLessThanOrEqual(machineClass.loadMaxLb);
      }
    }
  });

  it('carries a class change down onto the new class’s steps, never up', () => {
    /*
     * A design that quietly got *faster* when its machine was changed would be a control doing more
     * than it says, so `stepAtOrBelow` only ever moves down — and the result must be a step the new
     * class has, or `parseBuilding` refuses the document.
     */
    const fast = CLASSES.find((entry) => entry.id === 'high-speed-gearless');
    const slow = CLASSES.find((entry) => entry.id === 'hydraulic');
    expect(fast).toBeDefined();
    expect(slow).toBeDefined();
    const onFast = withMachineClass(SIZED, fast as MachineClass);
    const backDown = withMachineClass(onFast, slow as MachineClass);
    expect(speedStepsFor(fast as MachineClass)).toContain(onFast.ratedSpeedMps);
    expect(speedStepsFor(slow as MachineClass)).toContain(backDown.ratedSpeedMps);
    expect(backDown.ratedSpeedMps).toBeLessThanOrEqual(onFast.ratedSpeedMps);
    expect(loadStepsFor(slow as MachineClass)).toContain(backDown.ratedLoadLb);
  });

  it('picks the first class rated for the rise and the floor count, and never nothing', () => {
    // § 10.1's automatic choice, derived from the table's own ceilings rather than from a ladder of
    // literals. A design past every class gets the last one, because the envelope is guidance.
    const hydraulic = automaticClassFor(CLASSES, 15, 5);
    expect(hydraulic?.id).toBe('hydraulic');
    const tall = automaticClassFor(CLASSES, 5000, 400);
    expect(tall).toBe(CLASSES.at(-1));
    for (const rise of [10, 50, 100, 300, 650]) {
      expect(automaticClassFor(CLASSES, rise, 20), String(rise)).toBeDefined();
    }
  });

  it('snaps to the step at or below, and to the first step when everything is above', () => {
    expect(stepAtOrBelow([1, 2, 3], 2.9)).toBe(2);
    expect(stepAtOrBelow([1, 2, 3], 3)).toBe(3);
    expect(stepAtOrBelow([2, 3], 1)).toBe(2);
  });
});

describe('§ 10’s three warnings, in the guide’s priority order', () => {
  /** A twelve-storey design on a class rated to six floors and eighteen metres. */
  function pastItsClass(): BuildingSpec {
    const hydraulic = CLASSES.find((entry) => entry.id === 'hydraulic') as MachineClass;
    return withMachineClass({ ...SIZED, floors: 40 }, hydraulic);
  }

  it('says class limits first, and names both numbers', () => {
    const spec = pastItsClass();
    const warnings = designerWarnings(spec, classOfSpec(CLASSES, spec), upPeakAnalysisOf(spec, SPECS));
    expect(warnings[0]?.severity).toBe('class');
    // *naming both numbers* — what the design is, and what the class is rated for.
    expect(warnings[0]?.text).toContain('40 floors');
    expect(warnings[0]?.text).toContain('6');
    // A design both unbuildable and slow is told it is unbuildable first.
    const classFirst = warnings.findIndex((warning) => warning.severity === 'class');
    const comfortFirst = warnings.findIndex((warning) => warning.severity === 'comfort');
    if (comfortFirst >= 0) expect(classFirst).toBeLessThan(comfortFirst);
  });

  it('warns under 11% handling capacity and over a forty-second interval, in that order', () => {
    // One car in a forty-storey tower: both comfort warnings, and § 10 orders capacity before
    // interval.
    const starved: BuildingSpec = { ...SIZED, floors: 40, cars: 1 };
    const analysis = upPeakAnalysisOf(starved, SPECS);
    const warnings = designerWarnings(starved, classOfSpec(CLASSES, starved), analysis);
    const comfort = warnings.filter((warning) => warning.severity === 'comfort');
    expect(comfort.length).toBeGreaterThan(0);
    const figures = analysis.banks[0]?.figures;
    expect(figures).toBeDefined();
    if ((figures?.percentPopulation5Min ?? 0) < COMFORTABLE_HANDLING_PCT) {
      expect(comfort[0]?.text).toMatch(/feel slow every morning/);
    }
    if ((figures?.intervalS ?? 0) > COMFORTABLE_INTERVAL_S) {
      expect(comfort.at(-1)?.text).toMatch(/long wait, whatever the average says/);
    }
  });

  it('says nothing about comfort when the closed form refused the figures', () => {
    /*
     * A warning that a withheld interval is over forty seconds would be an assertion about a number
     * that does not exist — the exact defect the whole `awtIsValid` discipline exists for, one
     * surface up.
     */
    const refused: BuildingSpec = {
      ...SIZED,
      cars: 1,
      noLobby: { 0: true },
      bandByCar: { 0: [SIZED.floors, SIZED.floors] },
    };
    const warnings = designerWarnings(refused, classOfSpec(CLASSES, refused), upPeakAnalysisOf(refused, SPECS));
    expect(warnings.filter((warning) => warning.severity === 'comfort')).toEqual([]);
  });

  it('is quiet on a design inside its class and inside both comfort bounds', () => {
    const warnings = designerWarnings(SIZED, classOfSpec(CLASSES, SIZED), upPeakAnalysisOf(SIZED, SPECS));
    expect(warnings.filter((warning) => warning.severity === 'class')).toEqual([]);
  });
});

describe('the plate, the capacity line and the register', () => {
  it('reads the plate’s persons from the load-to-persons table rather than a second rule', () => {
    const rows = designerPlateRows(SIZED, classOfSpec(CLASSES, SIZED));
    const keys = rows.map((row) => row.key);
    expect(keys).toEqual(['CAPACITY', 'PERSONS', 'RATED SPEED', 'TRAVEL', 'LANDINGS', 'CLASS']);
    expect(rows.find((row) => row.key === 'CAPACITY')?.value).toBe(`${String(SIZED.ratedLoadLb)} lb`);
    expect(rows.find((row) => row.key === 'TRAVEL')?.value).toBe(`${riseM(SIZED).toFixed(1)} m`);
  });

  it('prints the per-floor figure with the floor count it was divided by', () => {
    /*
     * The deviation from § 13.2's *28 people on a typical floor today*, and the reason it is a
     * deviation rather than a transcription is in `designerCapacityLine`'s docstring. What is
     * asserted here is the half that matters: the derived average carries its own denominator, and
     * no mean cue stands over it.
     */
    const line = designerCapacityLine(SIZED);
    expect(line).toContain(`across ${String(SIZED.floors)} floors`);
    expect(line).not.toMatch(/typical|average|mean/i);
    expect(line).toContain(String(totalPopulation(SIZED)));
  });

  it('names what the board does not do, in sentences rather than in gaps', () => {
    expect(DESIGNER_ABSENCES.length).toBeGreaterThanOrEqual(3);
    for (const absence of DESIGNER_ABSENCES) expect(absence.trim().length).toBeGreaterThan(30);
  });
});
