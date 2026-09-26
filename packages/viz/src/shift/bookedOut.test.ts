/**
 * **A car the tower books out, said where the player reads the day** — GitHub issue #596 items 2
 * and 3, [§ D983](../../../../DECISIONS.md).
 *
 * Run against `c7`, Crown Hotel, whose rung books car D out of passenger service between a quarter
 * and a half of the shift (§ D871), on its pinned day: as built, under its standing order, the day
 * misses on the worst wait. That is the day an assessor read *An ordinary day — Nothing booked*
 * beside a plate naming car D, and *Where it went wrong* over a queue that had passed its bar.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parseBuilding, resolveBuilding } from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES } from '../scope/probes.test-helper.js';

import { bookedOutCarsOf, carAbsencesOf, wrinkleNoteOf } from './bookedOut.js';
import { stageBookedOutOf } from '../everyday/stageScreenModel.js';
import { stageCallCardOf } from '../everyday/stageCall.js';
import { contractDayState } from './contractDay.test-helper.js';
import { contractById, CONTRACTS } from './contracts.js';
import { runHorizonOf } from './dayLength.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay } from './goals.js';
import { pressDayFor } from './ladder.js';
import { shiftObservationsOf } from './observations.js';
import { clockRange, dayReportOf } from './report.js';
import { openWeek } from './week.js';

function allBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))];
  const entries = ids.map((id) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')),
    );
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

const RES = allBuildings();
const CONTRACT = 'c7';
const press = pressDayFor(CONTRACT);
if (press === undefined) throw new Error('c7 pins no day');
const state = contractDayState(CONTRACT, {
  seed: BigInt(press.seedText),
  dispatcherId: press.standingOrder,
});
const plan = shiftRunConfigOf(RES, state);

describe('the tower’s own bookings, read off the run’s building', () => {
  it('names c7’s car D, when it goes and when it comes back', () => {
    const cars = bookedOutCarsOf(plan.building);
    expect(cars.map((car) => car.carId)).toEqual(['D']);
    const [car] = cars;
    // § D871's row: 450 s to 900 s of the 1 800 s day.
    expect(car?.awayAtS).toBe(shiftLengthForContract(CONTRACT) * 0.25);
    expect(car?.backAtS).toBe(shiftLengthForContract(CONTRACT) * 0.5);
  });

  it('books nothing on a tower whose rung declares no absence', () => {
    const c1 = shiftRunConfigOf(RES, contractDayState('c1', { seed: 20_260_824n, dispatcherId: 'collective' }));
    expect(bookedOutCarsOf(c1.building)).toEqual([]);
    expect(bookedOutCarsOf(undefined)).toEqual([]);
  });
});

describe('the wrinkle note stops saying *Nothing booked* on a day a car is booked', () => {
  const car = bookedOutCarsOf(plan.building);

  it('is the event’s own note, verbatim, when the tower books nothing', () => {
    expect(wrinkleNoteOf(SHIFT_EVENTS.ordinary, [])).toBe(SHIFT_EVENTS.ordinary.note);
  });

  it('replaces the ordinary day’s *Nothing booked* with the booking, and names the car', () => {
    const note = wrinkleNoteOf(SHIFT_EVENTS.ordinary, car);
    expect(SHIFT_EVENTS.ordinary.note).toContain('Nothing booked');
    expect(note).not.toContain('Nothing booked');
    expect(note).toContain('car D');
    // Drawn on the brief, before the run: no clock.
    expect(/\d/u.test(note)).toBe(false);
  });

  it('keeps another event’s note and adds the booking after it', () => {
    const other = Object.values(SHIFT_EVENTS).find((event) => event.id !== 'ordinary');
    expect(other).toBeDefined();
    if (other === undefined) return;
    const note = wrinkleNoteOf(other, car);
    expect(note.startsWith(other.note)).toBe(true);
    expect(note).toContain('car D');
  });

  it('does not say the tower *also* books the car the day itself takes — § D1038, N5', () => {
    /*
     * On a day whose wrinkle takes a window of its own, the building's windows include the day's
     * car, and the note read *the tower also books car D* about the move-in's own car — or, on a
     * tower that books nothing, about a car only the day took. Marked through the day's own choice.
     */
    const moveIn = Object.values(SHIFT_EVENTS).find(
      (event) => event.effect.derate !== null && event.effect.derate.fromFraction > 0,
    );
    if (moveIn === undefined) throw new Error('no wrinkle takes a car part-way through the day');
    const garden = contractDayState('c1', { seed: 20_260_925n });
    const run = shiftRunConfigOf(RES, { ...garden, campaignEventId: moveIn.id });
    const unmarked = bookedOutCarsOf(run.building);
    expect(unmarked.length, 'the day took no car, so this case tests nothing').toBeGreaterThan(0);
    /* Unmarked, the day's car reads as the tower's — the defect. */
    expect(wrinkleNoteOf(moveIn, unmarked)).toContain('also books');
    const marked = bookedOutCarsOf(run.building, [...run.dayCars.holds, ...run.dayCars.windows]);
    expect(marked.every((entry) => entry.ofTheDay === true)).toBe(true);
    expect(wrinkleNoteOf(moveIn, marked)).toBe(moveIn.note);
  });
});

describe('the Day report of Crown Hotel’s pinned day, as built', () => {
  const { recording } = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
  const contract = contractById(CONTRACT);
  const horizon = runHorizonOf(
    RES.trafficProfiles,
    buildingConfigOf(RES, state.savedBuildings, contract?.buildingId ?? ''),
    state,
  );
  const report = dayReportOf({
    recording,
    observations: shiftObservationsOf(observationsAt(recording, recording.endedAt)),
    goals: goalsForDay(1, horizon),
    week: openWeek(CONTRACT),
    contract,
    event: SHIFT_EVENTS.ordinary,
    plan: { shiftLengthS: shiftLengthForContract(CONTRACT), windowStartS: null, patternId: 'building' },
    calendar: null,
    subject: { kind: 'week-day' },
    bookedOut: bookedOutCarsOf(plan.building),
  });

  it('puts the booked-out car on the header, with the two clock times the run had', () => {
    const [car] = bookedOutCarsOf(plan.building);
    expect(report.metaLines.join('\n')).not.toContain('Nothing booked');
    expect(report.metaLines).toContain(
      `car D · out of passenger service ${clockRange(car?.awayAtS ?? 0, car?.backAtS ?? 0)}`,
    );
  });

  it('opens *Where it went wrong* on the worst wait it missed, not on a queue that passed', () => {
    expect(report.verdict).toBe('missed');
    const queue = report.goals.find((line) => line.reading.goal.id === 'queue');
    const worst = report.goals.find((line) => line.reading.goal.id === 'worst-wait');
    // The premise, measured: the worst wait failed the day and the queue did not (§ D871's 303 s).
    expect(worst?.reading.state).toBe('missed');
    expect(queue?.reading.state).toBe('met');
    const [first] = report.diagnosis;
    expect(first?.id).toBe('missed-worst-wait');
    expect(first?.what).toContain(`${String(worst?.reading.observed)} s`);
    expect(first?.why).toContain(`inside ${String(worst?.reading.goal.bar)} s`);
    expect(first?.tone).toBe('bad');
    // And the queue row that used to head it is not drawn as the fault.
    expect(report.diagnosis.find((row) => row.id === 'peak-queue')?.tone).toBe('plain');
  });

  it('says whether car D was away for that wait, from the two intervals rather than a sentence', () => {
    const [car] = bookedOutCarsOf(plan.building);
    /*
     * The worst wait located independently of the module — the longest boarded-or-refused wait, or
     * a leg still standing at the end — and compared against the booking's own interval here, so
     * the clause is asserted present exactly when the two overlap.
     */
    let from = 0;
    let to = 0;
    for (const leg of recording.legs) {
      const end = leg.boardedAt ?? leg.refusedAt ?? recording.endedAt;
      if (end - leg.arrivedAt > to - from) {
        from = leg.arrivedAt;
        to = end;
      }
    }
    const back = car?.backAtS ?? Number.POSITIVE_INFINITY;
    const overlaps = (car?.awayAtS ?? 0) < to && back > from;
    const why = report.diagnosis[0]?.why ?? '';
    expect(why.includes('Car D was booked out of passenger service'), why).toBe(overlaps);
  });
});

/**
 * **Every car that was out is named wherever a cause is given** — § D1149, the post-AJ panel's
 * seat D (H5). On Midtown's Friday (`shaft-out:most-of-day`) the brief said car C was out of
 * passenger service from the start of the day until 16:30; the stage's pills, the report's header
 * and the worst-wait row named only car D, because all three read `bookedOutCarsOf`, which drops a
 * car out from the first instant. They read `carAbsencesOf` now.
 *
 * Friday no longer draws that window: § D1180 moved it to 0.1–0.4 of the shift, which starts after
 * the first instant. The premise is a car out from the first instant, so the day is pinned to the
 * shaft-out's `morning` value (0–0.5), which still takes one and meets the rung's car D booking.
 */
describe('a Midtown Friday whose shaft-out takes a car from the first instant', () => {
  const friday = contractDayState('c2', { seed: 20_260_925n, over: { campaignEventId: 'shaft-out:morning' } });
  const run = shiftRunConfigOf(RES, friday);
  const dayCarIds = [...run.dayCars.holds, ...run.dayCars.windows];
  const out = carAbsencesOf(run.building, dayCarIds);
  const fromStart = out.filter((car) => car.awayAtS <= 0);

  it('has a car out from the first instant, which the part-way reader drops — the premise', () => {
    expect(fromStart.length, 'the shaft-out day took no car from the start').toBeGreaterThan(0);
    const partWay = bookedOutCarsOf(run.building).map((car) => car.carId);
    for (const car of fromStart) expect(partWay).not.toContain(car.carId);
  });

  it('draws a pill for it on the stage', () => {
    const pills = stageBookedOutOf({ bookedOut: out, simTimeS: 60, dayStartS: 8 * 3600 });
    for (const car of fromStart) {
      const pill = pills.find((line) => line.startsWith(`Car ${car.carId} `));
      expect(pill, pills.join(' | ')).toBeDefined();
      expect(pill).toContain('out now');
      expect(pill).not.toContain('booked out 08:00');
    }
  });

  it('names it on the call card at a call while it is out', () => {
    const [car] = fromStart;
    if (car === undefined) throw new Error('no car out from the start');
    const card = stageCallCardOf(
      { atS: 600, rule: 'first-minute-wait', carId: car.carId, awayAtS: car.awayAtS, backAtS: car.backAtS, act: undefined, carAway: true },
      8 * 3600,
      out,
    );
    expect(card.facts.join(' ')).toMatch(new RegExp(`Cars? (?:[A-Z], )*(?:[A-Z] and )?${car.carId}\\b|Cars? ${car.carId}\\b`, 'u'));
  });

  it('names it on the report’s header, and on the worst-wait row when it was out for that wait', () => {
    const { recording } = recordRun(run.config, { recordDecisions: false, outOfServiceCarIds: run.outOfServiceCarIds });
    const report = dayReportOf({
      recording,
      observations: shiftObservationsOf(observationsAt(recording, recording.endedAt)),
      goals: goalsForDay(5),
      week: { ...openWeek('c2'), day: 5, dayIdx: 4 },
      contract: contractById('c2'),
      event: run.event,
      plan: { shiftLengthS: shiftLengthForContract('c2'), windowStartS: null, patternId: 'building' },
      calendar: null,
      subject: { kind: 'week-day' },
      bookedOut: out,
    });
    const header = report.metaLines.join('\n');
    for (const car of fromStart) {
      expect(header).toContain(`car ${car.carId} · out of passenger service from the start of the day`);
    }
    /* The wrinkle's sentence does not call the day's own car the tower's. */
    for (const car of fromStart) expect(header).not.toMatch(new RegExp(`also books[^.]*\\b${car.carId}\\b`, 'u'));
    /*
     * The row, asked exactly where the car was out for the worst wait — the interval located here
     * off the legs, as the c7 case above locates it. On this seed the slice's worst wait comes
     * after the car is back, so the clause is asserted absent; the report fixture below asserts
     * the present arm on a car out from the first instant.
     */
    const worst = report.diagnosis.find((row) => row.id === 'missed-worst-wait');
    let from = 0;
    let to = 0;
    for (const leg of recording.legs) {
      const end = leg.boardedAt ?? leg.refusedAt ?? recording.endedAt;
      if (end - leg.arrivedAt > to - from) {
        from = leg.arrivedAt;
        to = end;
      }
    }
    if (worst !== undefined && worst.when !== '—') {
      for (const car of fromStart) {
        const overlaps = car.awayAtS < to && (car.backAtS ?? Number.POSITIVE_INFINITY) > from;
        expect(worst.why.includes(`Car ${car.carId} was booked out of passenger service`), worst.why).toBe(overlaps);
      }
    }
    /* And the present arm, on the same sheet's inputs with the car out for the whole run. */
    const wholeRun = out.map((car) => (fromStart.includes(car) ? { ...car, backAtS: null } : car));
    const held = dayReportOf({
      recording,
      observations: shiftObservationsOf(observationsAt(recording, recording.endedAt)),
      goals: goalsForDay(5),
      week: { ...openWeek('c2'), day: 5, dayIdx: 4 },
      contract: contractById('c2'),
      event: run.event,
      plan: { shiftLengthS: shiftLengthForContract('c2'), windowStartS: null, patternId: 'building' },
      calendar: null,
      subject: { kind: 'week-day' },
      bookedOut: wholeRun,
    });
    const heldRow = held.diagnosis.find((row) => row.id === 'missed-worst-wait');
    if (heldRow !== undefined && heldRow.when !== '—') {
      for (const car of fromStart) expect(heldRow.why).toContain(`Car ${car.carId} was booked out of passenger service for all of that wait`);
    }
  });

  it('is read by every shell that gives a cause — none of them reads the part-way reader', () => {
    const read = (file: string): string => readFileSync(join(DATA_DIR, '..', 'packages', 'viz', 'src', file), 'utf8');
    const main = read('dev/main.ts');
    expect(main).not.toMatch(/bookedOut: bookedOutCarsOf\(/u);
    expect(read('everyday/stageScreen.ts')).not.toContain('bookedOutCarsOf(');
    const facts = /export function dayCallFactsOf[\s\S]*?\n\}\n/u.exec(read('dev/state.ts'))?.[0] ?? '';
    expect(facts).toContain('carAbsencesOf(');
    expect(facts).not.toContain('bookedOutCarsOf(');
  });
});
