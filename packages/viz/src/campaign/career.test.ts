/**
 * **The career record and its reducer**, with GAMEPLAY § 8.12's three snapshots as the fixtures the
 * design asks to be kept.
 *
 * § 8.12: *"Authored states … Keep them in the real build as fixtures; they are the best regression
 * test the campaign has."* {@link SECOND_MONTH} and {@link FIFTH_MONTH} are those two states,
 * carried here rather than shipped as an opening career — `career.ts`'s docstring holds the § 20.11
 * argument for why a player is not greeted with somebody else's record — and they are what every
 * multi-tower case below is driven over. The first snapshot is the product's own
 * {@link openingCareer}, moved to day one for the same reason.
 *
 * Every case asserts a **transition**: the record before, the action, the record after. Nothing here
 * re-implements a § 8 formula; where a figure is checked it is checked through
 * `campaign/economy.ts`, which is what `economy.test.ts` holds against the contract's own numbers.
 */

import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN_ABSENCES,
  LOST_CONTRACTS_MAX,
  SERVICE_AT_TRIPS,
  type CampaignCareer,
  type CampaignTower,
  applyCampaignAction,
  careerIsOver,
  freshTower,
  needOf,
  nextLineOf,
  openTowerOf,
  openingCareer,
  quirkOf,
  towerById,
} from './career.js';
import {
  CONTRACT_DAYS,
  DIFFICULTIES,
  REFURBISHMENT,
  calendarRow,
  clearedDays,
  committedUnits,
  contractIsLost,
  fittedLevel,
  purseOf,
  rateOnDay,
  renewalOffer,
  standingOf,
  wearHeadOf,
  wearOf,
} from './economy.js';

/** § 8.12's second-month snapshot — three buildings, one of them a hotel, one contract already lost. */
const SECOND_MONTH: CampaignCareer = Object.freeze({
  carry: 0,
  today: 24,
  monthsWorked: 5,
  lost: 1,
  openTowerId: 'c1',
  pendingBooking: undefined,
  towers: Object.freeze([
    {
      ...freshTower({ contractId: 'c1', buildingId: 'garden-apartments', dispatcherId: 'eta', rate: 3 }),
      day: 19,
      missed: 0,
      months: 3,
      trips: 41_200,
      refit: 0.86,
    },
    {
      ...freshTower({ contractId: 'c6', buildingId: 'chancery-house', dispatcherId: 'eta', rate: 4 }),
      day: 8,
      missed: 2,
      months: 1,
      trips: 28_400,
      refit: 0.41,
    },
    {
      ...freshTower({ contractId: 'c7', buildingId: 'crown-hotel', dispatcherId: 'eta', rate: 3 }),
      day: 3,
      missed: 2,
      months: 1,
      trips: 9_800,
      refit: 0.12,
    },
  ]) as readonly CampaignTower[],
});

/** § 8.12's fifth-month snapshot — five held buildings, 148 standing carried, two contracts lost. */
const FIFTH_MONTH: CampaignCareer = Object.freeze({
  carry: 148,
  today: 96,
  monthsWorked: 17,
  lost: 2,
  openTowerId: 'c2',
  pendingBooking: undefined,
  towers: Object.freeze([
    {
      ...freshTower({ contractId: 'c1', buildingId: 'garden-apartments', dispatcherId: 'eta', rate: 5 }),
      day: 11,
      missed: 0,
      months: 8,
      trips: 6_100,
      refit: 0.04,
    },
    {
      ...freshTower({ contractId: 'c6', buildingId: 'chancery-house', dispatcherId: 'eta', rate: 6 }),
      day: 17,
      missed: 1,
      months: 5,
      trips: 39_400,
      refit: 0.62,
    },
    {
      ...freshTower({ contractId: 'c7', buildingId: 'crown-hotel', dispatcherId: 'eta', rate: 4 }),
      day: 6,
      missed: 1,
      months: 4,
      trips: 43_900,
      refit: 0.71,
    },
    {
      ...freshTower({ contractId: 'c2', buildingId: 'midtown-office', dispatcherId: 'eta', rate: 7 }),
      day: 14,
      missed: 0,
      months: 2,
      trips: 51_200,
      serviceAt: 60_000,
      refit: 0.55,
    },
    {
      ...freshTower({ contractId: 'c8', buildingId: 'st-jude-hospital', dispatcherId: 'eta', rate: 9 }),
      day: 9,
      missed: 3,
      months: 1,
      trips: 22_100,
      refit: 0.3,
    },
  ]) as readonly CampaignTower[],
});

describe('the opening career', () => {
  it('is a first day rather than a fixture of somebody else’s month (§ 20.11)', () => {
    const career = openingCareer('eta');
    expect(career.today).toBe(1);
    expect(career.carry).toBe(0);
    expect(career.lost).toBe(0);
    expect(career.monthsWorked).toBe(0);
    expect(career.towers).toHaveLength(1);
    const tower = career.towers[0]!;
    expect(tower.day).toBe(1);
    expect(tower.missed).toBe(0);
    expect(tower.trips).toBe(0);
    expect(clearedDays(tower)).toBe(0);
    // Nothing is claimed about a record the player has not made.
    expect(standingOf(career.carry, career.towers)).toBe(0);
  });

  it('opens on the forgiving building § 8.12’s arc names, driven by whatever drives today', () => {
    const career = openingCareer('collective');
    expect(career.towers[0]!.buildingId).toBe('garden-apartments');
    expect(career.towers[0]!.dispatcherId).toBe('collective');
    expect(career.openTowerId).toBe('c1');
    expect(career.towers[0]!.serviceAt).toBe(SERVICE_AT_TRIPS);
  });

  it('gives every campaign building a quirk, and none to one it does not offer', () => {
    for (const id of ['garden-apartments', 'chancery-house', 'crown-hotel', 'midtown-office']) {
      expect(quirkOf(id), id).toBeTruthy();
    }
    expect(quirkOf('secure-tower')).toBeUndefined();
  });

  it('says out loud what this build does not do', () => {
    expect(CAMPAIGN_ABSENCES.length).toBeGreaterThan(2);
    for (const entry of CAMPAIGN_ABSENCES) expect(entry.length).toBeGreaterThan(40);
  });
});

describe('a building is a commitment, not a setting (§ 8.1)', () => {
  it('opening one disturbs no other and resumes rather than resets', () => {
    const opened = applyCampaignAction(SECOND_MONTH, { kind: 'open-tower', towerId: 'c7' });
    expect(opened.openTowerId).toBe('c7');
    // Every tower's own day, record and clock is exactly what it was.
    expect(opened.towers).toEqual(SECOND_MONTH.towers);
    const back = applyCampaignAction(opened, { kind: 'open-tower', towerId: 'c1' });
    expect(back.towers).toEqual(SECOND_MONTH.towers);
    expect(openTowerOf(back)?.day).toBe(19);
  });

  it('refuses to open a building the career does not hold', () => {
    expect(applyCampaignAction(SECOND_MONTH, { kind: 'open-tower', towerId: 'c5' })).toBe(
      SECOND_MONTH,
    );
  });

  it('writes a standing order onto one tower and no other', () => {
    const next = applyCampaignAction(SECOND_MONTH, {
      kind: 'set-dispatcher',
      towerId: 'c6',
      dispatcherId: 'collective',
    });
    expect(towerById(next, 'c6')?.dispatcherId).toBe('collective');
    expect(towerById(next, 'c1')?.dispatcherId).toBe('eta');
    const built = applyCampaignAction(next, {
      kind: 'set-build',
      towerId: 'c6',
      buildId: 'doors-first',
    });
    expect(towerById(built, 'c6')?.buildId).toBe('doors-first');
    expect(towerById(built, 'c1')?.buildId).toBe('as-built');
  });

  it('starts a fresh month when the difficulty moves, and says so in the footer’s own terms', () => {
    const next = applyCampaignAction(SECOND_MONTH, {
      kind: 'set-difficulty',
      towerId: 'c6',
      difficultyId: 'hard',
    });
    const tower = towerById(next, 'c6')!;
    expect(tower.difficultyId).toBe('hard');
    expect(tower.day).toBe(1);
    expect(tower.missed).toBe(0);
    expect(tower.bookings).toEqual([]);
    // And it is that tower's month, not the career's.
    expect(towerById(next, 'c1')?.day).toBe(19);
  });
});

describe('§ 8.4’s two-step buy', () => {
  const rich = (): CampaignCareer => ({
    ...openingCareer('eta'),
    towers: [{ ...openingCareer('eta').towers[0]!, day: 3, carry: 100 }],
  });

  it('fits a zero-night tier at once, and the money leaves the purse with it', () => {
    const before = rich();
    const purseBefore = purseOf(before.towers[0]!);
    const after = applyCampaignAction(before, {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'doors',
      level: 1,
    });
    const tower = after.towers[0]!;
    expect(after.pendingBooking).toBeUndefined();
    expect(fittedLevel(tower, 'doors')).toBe(1);
    expect(committedUnits(tower)).toBe(4);
    expect(purseOf(tower)).toBe(purseBefore - 4);
  });

  it('parks a tier that needs nights until a start day is picked, spending nothing meanwhile', () => {
    const pressed = applyCampaignAction(rich(), {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'machines',
      level: 1,
    });
    expect(pressed.pendingBooking).toEqual({ towerId: 'c1', categoryId: 'machines', level: 1 });
    expect(committedUnits(pressed.towers[0]!)).toBe(0);

    const booked = applyCampaignAction(pressed, { kind: 'pick-start', startIdx: 5 });
    expect(booked.pendingBooking).toBeUndefined();
    expect(committedUnits(booked.towers[0]!)).toBe(14);
    expect(booked.towers[0]!.bookings[0]).toMatchObject({ startIdx: 5, nights: 2 });
  });

  it('cancels a pending buy and spends nothing — § 8.4’s own sentence', () => {
    const pressed = applyCampaignAction(rich(), {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'machines',
      level: 1,
    });
    const cancelled = applyCampaignAction(pressed, { kind: 'cancel-booking' });
    expect(cancelled.pendingBooking).toBeUndefined();
    expect(committedUnits(cancelled.towers[0]!)).toBe(0);
  });

  it('refuses an illegal start, and an unaffordable tier, and moves nothing', () => {
    const pressed = applyCampaignAction(rich(), {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'machines',
      level: 1,
    });
    // Yesterday is not a legal start (§ 8.2: `s ≥ dayIdx`).
    expect(applyCampaignAction(pressed, { kind: 'pick-start', startIdx: 0 })).toBe(pressed);
    // And a tier the purse cannot reach is refused at the press.
    const poor = openingCareer('eta');
    expect(
      applyCampaignAction(poor, {
        kind: 'press-tier',
        towerId: 'c1',
        categoryId: 'shafts',
        level: 1,
      }),
    ).toBe(poor);
  });
});

describe('what a building wants from you (§ 8.9, § 8.3)', () => {
  it('is nothing on a fresh, freshly serviced tower — and says what is next instead', () => {
    const career = openingCareer('eta');
    expect(needOf(career.towers[0]!)).toBeUndefined();
    expect(nextLineOf(career.towers[0]!)).toContain('Nothing booked');
  });

  it('is a renewal in the contract’s last days', () => {
    const tower = towerById(SECOND_MONTH, 'c1')!;
    expect(tower.day).toBe(19);
    const need = needOf(tower);
    expect(need?.kind).toBe('renewal');
    expect(need?.options.map((option) => option.id)).toEqual([
      'sign',
      'push',
      'refurbish',
      'hand-back',
    ]);
  });

  it('is a service window once the wear clock reaches its head', () => {
    const worn = { ...openingCareer('eta').towers[0]!, day: 6, trips: 41_000 };
    expect(wearHeadOf(worn)).toBe('due');
    const need = needOf(worn);
    expect(need?.kind).toBe('service');
    // § 8.11: the default is *leave it to maintenance*, with a stated survivable consequence.
    const fallback = need?.options.find((option) => option.isDefault === true);
    expect(fallback?.label).toContain('maintenance');
    expect(fallback?.effect).toContain('still there next week');
  });

  it('prices a renewal from the record, and § 8.9’s worked example holds on the snapshot', () => {
    const tower = towerById(SECOND_MONTH, 'c1')!;
    // Eighteen of eighteen cleared: a clean month, +2, and 3 u a day becomes 5.
    expect(renewalOffer(tower)).toMatchObject({ bonus: 2, offered: 5, wasRate: 3 });
  });
});

describe('answering the decision', () => {
  const renewing = (): CampaignCareer => ({
    ...SECOND_MONTH,
    openTowerId: 'c1',
    towers: SECOND_MONTH.towers.map((tower) =>
      tower.id !== 'c1'
        ? tower
        : {
            ...tower,
            bookings: [
              { categoryId: 'doors' as const, level: 1, startIdx: 2, nights: 0, units: 4 },
            ],
          },
    ),
  });

  it('signs a renewal into a fresh month that carries the purse and keeps the kit', () => {
    const before = renewing();
    const tower = towerById(before, 'c1')!;
    const purseBefore = purseOf(tower);
    const after = applyCampaignAction(before, {
      kind: 'answer-need',
      towerId: 'c1',
      optionId: 'sign',
    });
    const renewed = towerById(after, 'c1')!;
    expect(renewed.day).toBe(1);
    expect(renewed.missed).toBe(0);
    expect(renewed.months).toBe(tower.months + 1);
    expect(renewed.rate).toBe(5);
    // The kit stayed with the building, and it is not committed against the new month's purse.
    expect(renewed.fitted.doors).toBe(1);
    expect(renewed.bookings).toEqual([]);
    expect(committedUnits(renewed)).toBe(0);
    expect(fittedLevel(renewed, 'doors')).toBe(1);
    expect(purseOf(renewed)).toBe(purseBefore);
    // What the finished contract earned is banked as standing.
    expect(after.carry).toBe(before.carry + clearedDays(tower) * 2 - tower.missed * 3);
  });

  it('asks for one more unit a day, on top of what the record already earned', () => {
    const after = applyCampaignAction(renewing(), {
      kind: 'answer-need',
      towerId: 'c1',
      optionId: 'push',
    });
    expect(towerById(after, 'c1')?.rate).toBe(6);
  });

  it('renews and refurbishes: § 8.7’s ten nights are booked and both clocks reset', () => {
    const after = applyCampaignAction(renewing(), {
      kind: 'answer-need',
      towerId: 'c1',
      optionId: 'refurbish',
    });
    const renewed = towerById(after, 'c1')!;
    expect(renewed.trips).toBe(0);
    expect(renewed.refit).toBe(0);
    expect(renewed.bookings[0]).toMatchObject({
      startIdx: 0,
      nights: REFURBISHMENT.nights,
      units: REFURBISHMENT.units,
    });
  });

  it('hands a building back, frees the slot and keeps what the record earned', () => {
    const before = renewing();
    const tower = towerById(before, 'c1')!;
    const after = applyCampaignAction(before, {
      kind: 'answer-need',
      towerId: 'c1',
      optionId: 'hand-back',
    });
    expect(towerById(after, 'c1')).toBeUndefined();
    expect(after.towers).toHaveLength(before.towers.length - 1);
    expect(after.openTowerId).toBeUndefined();
    expect(after.carry).toBe(before.carry + clearedDays(tower) * 2 - tower.missed * 3);
  });

  it('books the service window against the machines and resets the wear clock', () => {
    const worn: CampaignCareer = {
      ...openingCareer('eta'),
      towers: [{ ...openingCareer('eta').towers[0]!, day: 6, trips: 41_000 }],
    };
    const after = applyCampaignAction(worn, {
      kind: 'answer-need',
      towerId: 'c1',
      optionId: 'window',
    });
    const tower = towerById(after, 'c1')!;
    expect(tower.trips).toBe(0);
    expect(tower.bookings[0]).toMatchObject({ categoryId: 'machines', nights: 3, units: 0 });
    // The window is nights, not units — the purse is untouched.
    expect(committedUnits(tower)).toBe(0);
  });

  it('leaves it to maintenance, which moves nothing at all', () => {
    const worn: CampaignCareer = {
      ...openingCareer('eta'),
      towers: [{ ...openingCareer('eta').towers[0]!, day: 6, trips: 41_000 }],
    };
    expect(applyCampaignAction(worn, { kind: 'answer-need', towerId: 'c1', optionId: 'leave' })).toBe(
      worn,
    );
  });

  it('refuses an option the purse cannot reach, rather than going negative', () => {
    // A worn tower five days into its first month: the window is free and the refurbishment is 46.
    const before: CampaignCareer = {
      ...openingCareer('eta'),
      towers: [{ ...openingCareer('eta').towers[0]!, day: 6, trips: 41_000 }],
    };
    expect(needOf(before.towers[0]!)?.kind).toBe('service');
    expect(purseOf(before.towers[0]!)).toBeLessThan(REFURBISHMENT.units);
    expect(
      applyCampaignAction(before, { kind: 'answer-need', towerId: 'c1', optionId: 'refurbish' }),
    ).toBe(before);
    // And the free one is taken, so the refusal is about the price rather than about the option.
    expect(
      applyCampaignAction(before, { kind: 'answer-need', towerId: 'c1', optionId: 'window' }),
    ).not.toBe(before);
  });
});

describe('§ 8.10’s ceiling', () => {
  it('counts contracts already over toward the three, rather than latching a flag', () => {
    expect(careerIsOver(SECOND_MONTH)).toBe(false);
    // Two lost already, and one tower past a standard month's three missed days.
    const failing: CampaignCareer = {
      ...FIFTH_MONTH,
      towers: FIFTH_MONTH.towers.map((tower) =>
        tower.id === 'c8' ? { ...tower, missed: 4 } : tower,
      ),
    };
    expect(failing.lost).toBe(LOST_CONTRACTS_MAX - 1);
    expect(careerIsOver(failing)).toBe(true);
  });
});

describe('§ 8.12’s snapshots, as the regression fixtures the design asks for', () => {
  it('reads the second month the way § 8.12 describes it', () => {
    expect(SECOND_MONTH.towers).toHaveLength(3);
    expect(SECOND_MONTH.lost).toBe(1);
    // "a red-tagged lift, coaches booked, a renewal due" — the renewal is the one this build derives.
    expect(SECOND_MONTH.towers.filter((tower) => needOf(tower)?.kind === 'renewal')).toHaveLength(1);
  });

  it('reads the fifth month the way § 8.12 describes it, and its standing is derived', () => {
    expect(FIFTH_MONTH.carry).toBe(148);
    expect(FIFTH_MONTH.lost).toBe(2);
    // Standing is the carry plus every tower's own record, and nothing else.
    const byHand = FIFTH_MONTH.towers.reduce(
      (total, tower) => total + clearedDays(tower) * 2 - tower.missed * 3,
      FIFTH_MONTH.carry,
    );
    expect(standingOf(FIFTH_MONTH.carry, FIFTH_MONTH.towers)).toBe(byHand);
  });

  it('has a veteran whose service interval is its own, not a constant', () => {
    /*
     * § 8.12's fifth-month Midtown has run past forty-five thousand trips on a longer interval, and
     * that is the case for `serviceAt` being a field: read against the shipped 45 000 its wear would
     * be past 1, and read against its own 60 000 it is not.
     */
    const midtown = towerById(FIFTH_MONTH, 'c2')!;
    expect(midtown.serviceAt).toBe(60_000);
    expect(midtown.trips).toBeGreaterThan(SERVICE_AT_TRIPS);
    expect(wearOf(midtown)).toBeLessThan(1);
    expect(wearOf({ ...midtown, serviceAt: SERVICE_AT_TRIPS })).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- *
 * § 6.4 step 4 — the day is filed. GitHub issue #223.
 * -------------------------------------------------------------------------- */

/**
 * What `everyday/host.ts`'s *Close the day* does to the record, as transitions.
 *
 * The verdict itself is not decided here — `everyday/campaignModel.ts#campaignDayVerdict` folds
 * § 8.6's tests and its own suite holds it. What these cases hold is the half § 8.1 makes
 * expensive to get wrong: two fields move and **every** other figure is derived from them, so a
 * day filed here has to be visible in the purse, the grid, the allowance and the renewal without
 * anything else being written.
 */
describe('filing a campaign day', () => {
  const first = (career: CampaignCareer): CampaignTower => towerById(career, 'c1')!;

  it('advances the contract day and the career day together, and marks the day cleared', () => {
    const before = openingCareer('eta');
    const after = applyCampaignAction(before, {
      kind: 'file-day',
      towerId: 'c1',
      verdict: 'cleared',
    });

    expect(first(after).day).toBe(first(before).day + 1);
    expect(first(after).missed).toBe(0);
    expect(clearedDays(first(after))).toBe(1);
    /*
     * Together, and that is § 8.6's arithmetic rather than tidiness: a contract's own start is
     * derived as `careerToday − (day − 1)`, so a day filed on one and not the other would slide the
     * whole contract under the grid instead of filling one cell of it.
     */
    expect(after.today).toBe(before.today + 1);
    expect(calendarRow(after.today, first(after)).find((cell) => cell.towerDay === 1)?.mark).toBe(
      'cleared',
    );
  });

  it('marks a missed day, which the grid draws and the allowance counts', () => {
    const after = applyCampaignAction(openingCareer('eta'), {
      kind: 'file-day',
      towerId: 'c1',
      verdict: 'missed',
    });

    expect(first(after).missed).toBe(1);
    expect(clearedDays(first(after))).toBe(0);
    expect(calendarRow(after.today, first(after)).find((cell) => cell.towerDay === 1)?.mark).toBe(
      'missed',
    );
  });

  it('pays the purse for a cleared day and nothing for a missed one — derived, never latched', () => {
    const before = openingCareer('eta');
    const rate = rateOnDay(DIFFICULTIES[first(before).difficultyId], 0);
    expect(rate).toBeGreaterThan(0);

    const cleared = applyCampaignAction(before, {
      kind: 'file-day',
      towerId: 'c1',
      verdict: 'cleared',
    });
    const missed = applyCampaignAction(before, {
      kind: 'file-day',
      towerId: 'c1',
      verdict: 'missed',
    });

    expect(purseOf(first(cleared))).toBe(purseOf(first(before)) + rate);
    expect(purseOf(first(missed))).toBe(purseOf(first(before)));
  });

  it('ends the contract once the allowance is used, without latching a flag', () => {
    const allowance = DIFFICULTIES[first(openingCareer('eta')).difficultyId].miss;
    let career = openingCareer('eta');
    for (let day = 0; day <= allowance; day += 1) {
      career = applyCampaignAction(career, { kind: 'file-day', towerId: 'c1', verdict: 'missed' });
    }
    expect(first(career).missed).toBe(allowance + 1);
    expect(contractIsLost(first(career))).toBe(true);
  });

  it('files the month’s last day and then refuses, because day twenty-one has no fee and no cell', () => {
    let career = openingCareer('eta');
    for (let day = 0; day < CONTRACT_DAYS; day += 1) {
      career = applyCampaignAction(career, { kind: 'file-day', towerId: 'c1', verdict: 'cleared' });
    }
    expect(first(career).day).toBe(CONTRACT_DAYS + 1);
    expect(clearedDays(first(career))).toBe(CONTRACT_DAYS);
    // The month is over; § 8.9's renewal is the next press, not a twenty-first day.
    expect(needOf(first(career))?.kind).toBe('renewal');
    expect(applyCampaignAction(career, { kind: 'file-day', towerId: 'c1', verdict: 'cleared' })).toBe(
      career,
    );
  });

  it('refuses a tower the career does not hold, and moves nothing', () => {
    const before = openingCareer('eta');
    expect(
      applyCampaignAction(before, { kind: 'file-day', towerId: 'c6', verdict: 'cleared' }),
    ).toBe(before);
  });

  it('moves the tower it was told about and no other', () => {
    const before = SECOND_MONTH;
    const after = applyCampaignAction(before, {
      kind: 'file-day',
      towerId: 'c6',
      verdict: 'cleared',
    });
    expect(towerById(after, 'c6')!.day).toBe(towerById(before, 'c6')!.day + 1);
    expect(towerById(after, 'c1')).toEqual(towerById(before, 'c1'));
    expect(towerById(after, 'c7')).toEqual(towerById(before, 'c7'));
  });

  it('carries a filed record into § 8.9’s renewal offer and into the standing it banks', () => {
    let career = openingCareer('eta');
    for (const verdict of ['cleared', 'cleared', 'missed'] as const) {
      career = applyCampaignAction(career, { kind: 'file-day', towerId: 'c1', verdict });
    }
    const tower = first(career);
    // Two of the three days held, which is what the agent prices the renewal from.
    expect(renewalOffer(tower).clearRate).toBeCloseTo(2 / 3, 10);
    expect(standingOf(career.carry, career.towers)).toBe(2 * 2 - 3);
  });
});
