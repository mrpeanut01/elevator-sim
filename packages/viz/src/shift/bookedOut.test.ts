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

import { bookedOutCarsOf, wrinkleNoteOf } from './bookedOut.js';
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
