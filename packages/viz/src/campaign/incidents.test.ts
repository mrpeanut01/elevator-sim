/**
 * **What happens to a campaign day, and what the dock can do about it** — GitHub issues #171 and
 * #169 item 1, § D507.
 *
 * Three claims, each held by a run rather than by a sentence: the calendar wins over the draw; the
 * draw is on a named stream and lands at the rate § 8.3 publishes; and every option's effect is real
 * on the legs, through the shipped path (`shiftRunConfigOf` → `recordRun`, with the answer on the
 * intervention log).
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { BREAKDOWN_AT_FRACTION, SHIFT_EVENTS } from '../shift/events.js';

import { CONTRACT_CALENDAR, calendarDaysOf, calendarEventIdFor } from './calendar.js';
import { freshTower } from './career.js';
import { failureOddsPct } from './economy.js';
import {
  TECHNICIAN_CALLOUT_S,
  TECHNICIAN_RETURN_LOAD_FRACTION,
  TECHNICIAN_UNITS,
  answerChangeOf,
  campaignEventFor,
  campaignIncidentOf,
} from './incidents.js';

const GARDEN = RESOURCES.buildings.find((building) => building.id === 'garden-apartments')!;

function tower(overrides: Partial<ReturnType<typeof freshTower>> = {}) {
  return { ...freshTower({ contractId: 'c1', buildingId: 'garden-apartments', dispatcherId: 'collective', rate: 3 }), ...overrides };
}

describe('the contract calendar — § 8.11’s authored schedule', () => {
  it('books the coach party on Crown Hotel’s contract and on no other', () => {
    expect(Object.keys(CONTRACT_CALENDAR)).toEqual(['c7']);
    expect(calendarDaysOf('c7')).toEqual([5, 10, 15, 20]);
    expect(calendarEventIdFor('c7', 5)).toBe('coach-party');
    expect(calendarEventIdFor('c7', 6)).toBeUndefined();
    expect(calendarEventIdFor('c1', 5)).toBeUndefined();
  });

  it('wins over the draw: a calendared day is never overwritten', () => {
    const crown = { ...tower(), id: 'c7', buildingId: 'crown-hotel', day: 5, trips: 60_000 };
    for (const seed of [1n, 2n, 3n, 20260906n]) {
      expect(campaignEventFor({ tower: crown, seed }).id).toBe('coach-party');
    }
  });
});

describe('the breakdown draw — § 8.3’s odds on a named stream', () => {
  it('is a pure function of the seed, the contract and the day', () => {
    const a = campaignEventFor({ tower: tower({ trips: 60_000 }), seed: 7n });
    const b = campaignEventFor({ tower: tower({ trips: 60_000 }), seed: 7n });
    expect(a).toBe(b);
  });

  it('lands at the published rate, measured over a thousand days at each end of the wear clock', () => {
    const rateAt = (trips: number): number => {
      let breakdowns = 0;
      for (let seed = 1; seed <= 1000; seed += 1) {
        if (campaignEventFor({ tower: tower({ trips }), seed }).id === 'breakdown') breakdowns += 1;
      }
      return breakdowns / 10;
    };
    /* Fresh machines: 0.4 % a day. Past the window: wear caps at 1.3, so 0.4 + 7.5 · 1.3^2.4 ≈ 14.4 %. */
    const fresh = rateAt(0);
    const worn = rateAt(120_000);
    expect(failureOddsPct(tower({ trips: 0 }))).toBeCloseTo(0.4, 6);
    expect(failureOddsPct(tower({ trips: 120_000 }))).toBeGreaterThan(14);
    expect(fresh).toBeLessThan(2);
    expect(worn).toBeGreaterThan(10);
    expect(worn).toBeLessThan(19);
  });

  it('draws differently on two days of one contract under one seed, so a seed is not a fate', () => {
    const days = new Set<string>();
    for (let day = 1; day <= 20; day += 1) {
      days.add(campaignEventFor({ tower: tower({ day, trips: 120_000 }), seed: 11n }).id);
    }
    expect(days.size).toBe(2);
  });

  it('never reaches the week’s rota: an undrawn day is ordinary', () => {
    expect(campaignEventFor({ tower: tower({ day: 3 }), seed: 1n }).id).toBe('ordinary');
  });
});

describe('the incident for the dock', () => {
  it('names the car the run loses, at three tenths of the day, with two honest options', () => {
    const incident = campaignIncidentOf({ event: SHIFT_EVENTS.breakdown, building: GARDEN, runLengthS: 3600, heldCars: [] });
    expect(incident?.eventId).toBe('breakdown');
    expect(incident?.atS).toBe(Math.round(BREAKDOWN_AT_FRACTION * 3600));
    expect(incident?.car).toBeDefined();
    expect(incident?.title).toContain(incident?.car?.carId);
    expect(incident?.options.map((option) => option.id)).toEqual(['technician', 'leave']);
    expect(incident?.options.find((option) => option.id === 'technician')?.units).toBe(TECHNICIAN_UNITS);
    expect(incident?.options.find((option) => option.id === 'leave')?.isDefault).toBe(true);
  });

  it('offers to bring a held car back for the coach party, and says so when there is none', () => {
    const held = { bankId: 'main', carId: 'B' };
    const withHeld = campaignIncidentOf({ event: SHIFT_EVENTS['coach-party'], building: GARDEN, runLengthS: 1800, heldCars: [held] });
    expect(withHeld?.options.map((option) => option.id)).toEqual(['bring-back', 'leave']);
    expect(withHeld?.options[0]?.returns).toEqual({ car: held, afterS: 0 });
    const alone = campaignIncidentOf({ event: SHIFT_EVENTS['coach-party'], building: GARDEN, runLengthS: 1800, heldCars: [] });
    expect(alone?.options.map((option) => option.id)).toEqual(['leave']);
    expect(alone?.note).toContain('No car is held');
    expect(alone?.atS).toBe(0);
  });

  it('is nothing on an ordinary day', () => {
    expect(campaignIncidentOf({ event: SHIFT_EVENTS.ordinary, building: GARDEN, runLengthS: 1800, heldCars: [] })).toBeUndefined();
    expect(campaignIncidentOf({ event: SHIFT_EVENTS['fire-drill'], building: GARDEN, runLengthS: 1800, heldCars: [] })).toBeUndefined();
  });
});

describe('composing the answer', () => {
  const incident = campaignIncidentOf({ event: SHIFT_EVENTS.breakdown, building: GARDEN, runLengthS: 3600, heldCars: [] })!;
  const technician = incident.options[0]!;
  const leave = incident.options[1]!;

  it('refuses before the car has gone, and refuses a return the day would end before', () => {
    expect(answerChangeOf(incident, technician, incident.atS - 1, 3600)).toMatchObject({ kind: 'refused' });
    const late = answerChangeOf(incident, technician, 3600 - TECHNICIAN_CALLOUT_S + 1, 3600);
    expect(late.kind).toBe('refused');
    if (late.kind === 'refused') expect(late.reason).toContain('the day ends before');
  });

  it('appends an in-service event and a derate for the car, after the answer, and the default appends nothing', () => {
    const answered = answerChangeOf(incident, technician, incident.atS + 60, 3600);
    const backAtS = incident.atS + 60 + TECHNICIAN_CALLOUT_S;
    const plate = GARDEN.banks
      .find((bank) => bank.id === incident.car?.bankId)
      ?.cars.find((car) => car.id === incident.car?.carId);
    expect(plate).toBeDefined();
    expect(technician.when).toContain('three quarters of its plated load');
    expect(answered).toMatchObject({
      kind: 'change',
      change: {
        kind: 'answer-incident',
        option: technician.label,
        serviceEvents: [
          { atS: backAtS, mode: 'in-service', carId: incident.car?.carId },
          {
            atS: backAtS,
            carId: incident.car?.carId,
            ratedLoadLb: Math.round((plate?.ratedLoadLb ?? 0) * TECHNICIAN_RETURN_LOAD_FRACTION),
            ratedLoadKg: Math.round((plate?.ratedLoadKg ?? 0) * TECHNICIAN_RETURN_LOAD_FRACTION),
          },
        ],
      },
    });
    expect(answerChangeOf(incident, leave, incident.atS + 60, 3600)).toEqual({
      kind: 'change',
      change: { kind: 'answer-incident', option: leave.label, serviceEvents: [] },
    });
  });
});

describe('on the legs, through the shipped path', () => {
  /** The campaign's own cell: `c1`'s hour on Garden Apartments (`fitOut.test.ts`, `works.test.ts`). */
  const base = { ...baseState(), buildingId: 'garden-apartments', dispatcherId: 'collective', shiftLengthS: 3600 };

  it('a breakdown day differs from an ordinary one, and the technician’s answer differs from leaving it', () => {
    const ordinary = shiftRunConfigOf(RESOURCES, { ...base, campaignEventId: 'ordinary' });
    const broken = shiftRunConfigOf(RESOURCES, { ...base, campaignEventId: 'breakdown' });
    expect(broken.config.building.serviceEvents?.length ?? 0).toBeGreaterThan(0);
    const ordinaryLegs = recordRun(ordinary.config, { recordDecisions: false }).recording.legs;
    const brokenLegs = recordRun(broken.config, { recordDecisions: false }).recording.legs;
    expect(brokenLegs).not.toEqual(ordinaryLegs);

    const incident = campaignIncidentOf({ event: SHIFT_EVENTS.breakdown, building: GARDEN, runLengthS: 3600, heldCars: [] })!;
    const answerAtS = incident.atS + 120;
    const technician = answerChangeOf(incident, incident.options[0]!, answerAtS, 3600);
    const leave = answerChangeOf(incident, incident.options[1]!, answerAtS, 3600);
    if (technician.kind !== 'change' || leave.kind !== 'change') throw new Error('both answers compose');
    /* § 1.4: the log is part of the config the day is re-simulated from, not an option beside it. */
    const called = recordRun(
      { ...broken.config, interventions: [{ atS: answerAtS, change: technician.change }] },
      { recordDecisions: false },
    ).recording;
    const left = recordRun(
      { ...broken.config, interventions: [{ atS: answerAtS, change: leave.change }] },
      { recordDecisions: false },
    ).recording;
    /* The prefix is § 1.4's: identical up to the answer, because the answer is the only difference. */
    const before = (legs: typeof called.legs) => legs.filter((leg) => leg.arrivedAt < answerAtS && (leg.boardedAt ?? Infinity) < answerAtS);
    expect(before(called.legs)).toEqual(before(left.legs));
    expect(called.legs).not.toEqual(left.legs);

  }, 300_000);

  it('the technician’s derate moves the run where the car fills: the same answer at the plate is a different day', () => {
    /*
     * **The derate is a control, so it must move the run** (§ D524, CLAUDE.md's standing shape),
     * and it must be shown where it can bite. Garden Apartments at `c1`'s hour never fills a car to
     * three quarters of its plate, so the cell is Midtown Office, whose lobby does. The same answer
     * with the derate struck out — the car back at its plate — is a different day from the instant
     * the car returns, and the car carries fewer people at its peak once rated down.
     */
    const midtown = RESOURCES.buildings.find((building) => building.id === 'midtown-office')!;
    const cell = { ...base, buildingId: 'midtown-office', shiftLengthS: 3600, campaignEventId: 'breakdown' as const };
    const broken = shiftRunConfigOf(RESOURCES, cell);
    const incident = campaignIncidentOf({ event: SHIFT_EVENTS.breakdown, building: midtown, runLengthS: 3600, heldCars: [] })!;
    const answerAtS = incident.atS;
    const technician = answerChangeOf(incident, incident.options[0]!, answerAtS, 3600);
    if (technician.kind !== 'change') throw new Error(`the answer composes: ${technician.reason}`);
    if (technician.change.kind !== 'answer-incident') throw new Error('the answer is an incident answer');
    const modeOnly = {
      ...technician.change,
      serviceEvents: technician.change.serviceEvents.filter((event) => 'mode' in event),
    };
    expect(modeOnly.serviceEvents.length).toBe(technician.change.serviceEvents.length - 1);
    const derated = recordRun(
      { ...broken.config, interventions: [{ atS: answerAtS, change: technician.change }] },
      { recordDecisions: false },
    ).recording;
    const atPlate = recordRun(
      { ...broken.config, interventions: [{ atS: answerAtS, change: modeOnly }] },
      { recordDecisions: false },
    ).recording;
    expect(derated.legs).not.toEqual(atPlate.legs);

    const backAtS = answerAtS + TECHNICIAN_CALLOUT_S;
    const carId = `${incident.car?.bankId ?? ''}-${incident.car?.carId ?? ''}`;
    /** The most people aboard the returned car at once, from its return on. */
    const peakAboardAfter = (legs: typeof derated.legs): number => {
      const events: { at: number; delta: number }[] = [];
      for (const leg of legs) {
        if (leg.carId !== carId || leg.boardedAt === undefined) continue;
        events.push({ at: leg.boardedAt, delta: 1 });
        if (leg.alightedAt !== undefined) events.push({ at: leg.alightedAt, delta: -1 });
      }
      events.sort((a, b) => a.at - b.at || a.delta - b.delta);
      let aboard = 0;
      let peak = 0;
      for (const event of events) {
        aboard += event.delta;
        if (event.at >= backAtS && aboard > peak) peak = aboard;
      }
      return peak;
    };
    expect(peakAboardAfter(derated.legs)).toBeGreaterThan(0);
    expect(peakAboardAfter(derated.legs)).toBeLessThan(peakAboardAfter(atPlate.legs));
  }, 300_000);
});
