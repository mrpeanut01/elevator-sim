/**
 * **Move the control and require the run to change — compared on the legs.** GitHub issue #353,
 * `docs/32` GD11's first half, § D504.
 *
 * `docs/32` named the pin before the writer existed: *"A works day whose legs match an ordinary one
 * has not taken a car out."* So the same tower is run twice through the shipped path
 * (`shiftRunConfigOf` → `recordRun`), once on a day its booking occupies and once on the same day
 * with no booking, and the legs must differ. Non-vacuity first: the works day must actually hold
 * the chooser's car, or the comparison would be two ordinary days that happened to agree.
 */

import { describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { carsToDerate } from '../shift/incidents.js';

import { applyCampaignAction, openingCareer, type CampaignTower } from './career.js';
import { worksHeldCarRefsOf, worksHeldCarsOf, worksTodayOf } from './works.js';

/** A tower on its sixth day with two nights of works booked from its sixth — works are on today. */
function towerUnderWorks(): CampaignTower {
  const base = openingCareer('eta');
  const opened = { ...base, towers: [{ ...base.towers[0]!, day: 3, carry: 100 }] };
  const pressed = applyCampaignAction(opened, { kind: 'press-tier', towerId: 'c1', categoryId: 'machines', level: 1 }, shippedPriceSchedule());
  const booked = applyCampaignAction(pressed, { kind: 'pick-start', startIdx: 5 }, shippedPriceSchedule());
  const tower = booked.towers[0]!;
  return { ...tower, day: 6 };
}

function buildingOf(tower: CampaignTower) {
  const building = RESOURCES.buildings.find((entry) => entry.id === tower.buildingId);
  if (building === undefined) throw new Error(`no building ${tower.buildingId}`);
  return building;
}

describe('a works night takes a car out — GitHub issue #353, GD11', () => {
  it('holds exactly the chooser’s car on a day the works occupy, and none on any other day', () => {
    const tower = towerUnderWorks();
    const building = buildingOf(tower);
    expect(worksTodayOf(tower)).toBe(true);
    const chosen = carsToDerate(building, 1).held;
    expect(worksHeldCarRefsOf(tower, building)).toEqual(chosen);
    expect(worksHeldCarsOf(tower, building)).toEqual(chosen.map((ref) => `${ref.bankId}-${ref.carId}`));
    expect(worksHeldCarsOf(tower, building)).toHaveLength(1);

    const before = { ...tower, day: 5 };
    const after = { ...tower, day: 8 };
    expect(worksTodayOf(before)).toBe(false);
    expect(worksHeldCarsOf(before, building)).toEqual([]);
    expect(worksTodayOf(after)).toBe(false);
    expect(worksHeldCarsOf(after, building)).toEqual([]);
  });

  it('changes the day on the legs, through the shipped path', () => {
    const tower = towerUnderWorks();
    const building = buildingOf(tower);
    const held = worksHeldCarsOf(tower, building);
    expect(held.length).toBeGreaterThan(0);
    /* The campaign's own cell, as `fitOut.test.ts` measures at: `c1`'s hour, not a quarter of it. */
    const base = { ...baseState(), buildingId: tower.buildingId, dispatcherId: tower.dispatcherId, shiftLengthS: 3600 };
    const ordinary: ViewerState = { ...base, outOfServiceCarIds: [] };
    const works: ViewerState = { ...base, outOfServiceCarIds: [...held] };
    const plan = shiftRunConfigOf(RESOURCES, works);
    expect(plan.outOfServiceCarIds).toEqual(held);
    const worksRun = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
    expect(worksRun.legs.length).toBeGreaterThan(20);
    expect(worksRun.outOfServiceCarIds).toEqual(held);
    expect(legsOf(works)).not.toEqual(legsOf(ordinary));
  }, 120_000);
});
