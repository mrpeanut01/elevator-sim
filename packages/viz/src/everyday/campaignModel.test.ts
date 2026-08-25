/**
 * **The three campaign screens' words**, driven without a document.
 *
 * What this file is for, over and above `campaign/economy.test.ts`: the economy suite holds the
 * *formulas* against `ENGINE_CONTRACT.md` § 8's published numbers, and this one holds the
 * **screens' claims** — that every `N of M` derives both halves, that a refusal is drawn where a
 * figure has no source, that the calendar's columns and cells come from one array, and that all
 * three views read one record and cannot disagree.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CALENDAR_GLYPHS,
  CONTRACT_COPY,
  MONTH_LEGEND,
  TRIPS_REFUSAL,
  UNFINISHED,
  buildingView,
  calendarView,
  campaignTestGoals,
  campaignTestRows,
  careerStageLabel,
  contractView,
  recordLine,
  testsHeldLine,
  towersView,
  units,
  type CampaignInput,
} from './campaignModel.js';
import {
  applyCampaignAction,
  freshTower,
  openingCareer,
  type CampaignCareer,
  type CampaignTower,
} from '../campaign/career.js';
import { CONTRACT_DAYS, DIFFICULTIES, SHOP, clearedDays, purseOf } from '../campaign/economy.js';
import type { DayOutcome, GoalObservations } from '../shift/types.js';
import { outcomeOf } from '../shift/week.js';
import { readGoals } from '../shift/goals.js';
import { probabilityWordIn } from '../campaign/words.js';

const BUILDINGS = new Map([
  ['garden-apartments', { name: 'Garden Apartments', spec: '7 floors · 2 cars · 0.63 m/s · 240 people' }],
  ['chancery-house', { name: 'Chancery House', spec: '20 floors · 6 cars · 5 m/s · 612 people' }],
]);

const DISPATCHERS = [
  { id: 'eta', name: 'Minimum estimated wait', note: undefined, saved: false },
  { id: 'collective', name: 'Collective control', note: undefined, saved: false },
  { id: 'mine', name: 'Morning Shift v3', note: undefined, saved: true },
];

function inputOf(career: CampaignCareer, patch: Partial<CampaignInput> = {}): CampaignInput {
  return {
    career,
    buildings: BUILDINGS,
    dispatchers: DISPATCHERS,
    observations: undefined,
    history: [],
    ...patch,
  };
}

/** A career with two towers, so every counter has a denominator above one. */
function twoTowers(): CampaignCareer {
  const base = openingCareer('eta');
  const second: CampaignTower = {
    ...freshTower({
      contractId: 'c6',
      buildingId: 'chancery-house',
      dispatcherId: 'collective',
      rate: 4,
    }),
    day: 19,
    missed: 1,
    months: 2,
    trips: 41_000,
  };
  return { ...base, today: 24, towers: [...base.towers, second] };
}

/** Observations good enough to grade all three measurable tests. */
const GOOD: GoalObservations = Object.freeze({
  arrived: 400,
  carryPct: 98,
  minutePct: 91,
  peakQueue: 12,
  abandoned: 0,
  worstWaitS: 96,
  worstWaitIsCensored: false,
});

describe('the triage screen (§ 8.1)', () => {
  it('derives both halves of every counter, so a record cannot outrun its days', () => {
    const view = towersView(inputOf(twoTowers()));
    expect(view.footer).toMatch(/^\d+ of 2 buildings want a decision/);
    const dueService = view.stats.find((stat) => stat.label === 'due a service window');
    expect(dueService?.value).toBe(`1 of 2`);
    // The record line is the economy's `cleared`, so `4 of 1` is not expressible.
    const chancery = view.rows.find((row) => row.name === 'Chancery House');
    expect(chancery?.record).toBe('17 cleared · 1 missed');
    expect(chancery?.day).toBe('day 19');
  });

  it('names the fee and refuses the complexity nothing published, rather than defaulting it', () => {
    const view = towersView(inputOf(twoTowers()));
    expect(view.rows[0]?.terms).toBe('complexity 1 of 5 · 3 u a day');

    const unlisted: CampaignCareer = {
      ...openingCareer('eta'),
      towers: [
        freshTower({
          contractId: 'c3',
          buildingId: 'secure-tower',
          dispatcherId: 'eta',
          rate: 4,
        }),
      ],
    };
    expect(towersView(inputOf(unlisted)).rows[0]?.terms).toBe(`complexity ${UNFINISHED} · 4 u a day`);
  });

  it('reads a quiet building as running itself, and one with a decision by what it wants', () => {
    const view = towersView(inputOf(twoTowers()));
    expect(view.rows[0]?.status).toBe('Nothing — it is running itself');
    expect(view.rows[0]?.cta).toBe('Look in');
    expect(view.rows[0]?.needsDecision).toBe(false);
    // Day 19 is a renewal, so the row's button says the word the destination contains (§ 16 rule 4).
    expect(view.rows[1]?.cta).toBe('Renew');
    expect(view.rows[1]?.needsDecision).toBe(true);
  });

  it('offers the standing order inline, without opening the building (§ 8.1)', () => {
    const view = towersView(inputOf(twoTowers()));
    const order = view.rows[0]!.order;
    expect(order.dispatcherId).toBe('eta');
    expect(order.dispatchers.map((entry) => entry.id)).toEqual(['eta', 'collective', 'mine']);
    expect(order.builds.map((entry) => entry.id)).toContain('doors-first');
    // No trade line ships, so the picker says that rather than inventing one.
    expect(order.note).toContain('no one-line trade ships');
  });

  it('emits the calendar’s columns and its cells from one value (§ 8.7)', () => {
    const view = calendarView(inputOf(twoTowers()));
    expect(view.columns.length).toBeGreaterThan(0);
    for (const row of view.rows) expect(row.cells).toHaveLength(view.columns.length);
    // The window slides to keep today near the right edge, and the note says which days it shows.
    expect(view.note).toContain(`working days ${String(view.columns[0])}`);
    expect(view.note).toContain(String(view.columns.at(-1)));
    // Every glyph the grid can draw is in the legend's table.
    for (const row of view.rows) {
      for (const cell of row.cells) {
        expect(Object.values(CALENDAR_GLYPHS)).toContain(cell.glyph);
      }
    }
  });

  it('names both panels it cannot fill, rather than drawing them empty', () => {
    const view = towersView(inputOf(twoTowers()));
    expect(view.offers.refusal.length).toBeGreaterThan(40);
    expect(view.lately.refusal.length).toBeGreaterThan(40);
    /*
     * The campaign's register of absences is no longer on this view: GitHub issue #207 draws all
     * six registers on the build-information panel. What this screen still owes a player is the
     * per-control refusal — a panel it cannot fill says so on its own face — which is the two
     * assertions above. `CAMPAIGN_ABSENCES` itself is pinned in `career.test.ts` and its placement
     * in `buildNotes.test.ts`.
     */
    expect(view).not.toHaveProperty('absences');
  });

  it('says which career snapshot it is showing, derived from the day', () => {
    expect(careerStageLabel(1)).toBe('WEEK ONE');
    expect(careerStageLabel(CONTRACT_DAYS)).toBe('WEEK ONE');
    expect(careerStageLabel(24)).toBe('SECOND MONTH');
    expect(careerStageLabel(96)).toBe('FIFTH MONTH');
  });

  /**
   * R10, checked on the assembled view rather than only on the literals.
   *
   * `honesty/derive.test.ts` sweeps this package's authored literals for a probability word; this
   * case is the same rule applied to what the screen actually *composes*, which is where an
   * interpolated figure could reintroduce one. It uses `campaign/words.ts`'s own regex rather than
   * a substring list — the first draft used `text.includes('chance')` and was red on **Chancery
   * House**, which is exactly the false positive a word-boundary rule exists to avoid.
   *
   * It walks the **values** rather than the serialised object, which is the second thing the first
   * draft got wrong: `ENGINE_CONTRACT.md` § 8.3 calls the figure *odds* and this module's field
   * names follow the contract, so a scan over the JSON text was reading its own keys. R10 is a rule
   * about what a player reads, and a field name is not that.
   */
  it('carries no probability word in any string it draws', () => {
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) for (const entry of value) walk(entry);
      else if (value !== null && typeof value === 'object') {
        for (const entry of Object.values(value)) walk(entry);
      }
    };
    walk([
      towersView(inputOf(twoTowers())),
      buildingView(inputOf(twoTowers())),
      contractView(inputOf(twoTowers())),
    ]);
    expect(strings.length).toBeGreaterThan(100);
    for (const text of strings) expect(probabilityWordIn(text), text.slice(0, 90)).toBeNull();
  });
});

describe('the building desk (§ 8.2)', () => {
  it('draws the quiet block on a building that wants nothing, with what is next', () => {
    const view = buildingView(inputOf(openingCareer('eta')))!;
    expect(view.need).toBeUndefined();
    expect(view.options).toBeUndefined();
    expect(view.quiet?.heading).toBe('Running itself');
    expect(view.quiet?.next).toContain('Nothing booked');
    expect(view.statePill).toBe('running itself');
  });

  it('draws the renewal with its allowance, its offer and § 8.9’s reasoning', () => {
    const career = applyCampaignAction(twoTowers(), { kind: 'open-tower', towerId: 'c6' });
    const view = buildingView(inputOf(career))!;
    expect(view.need?.allowance).toBe('1 of 3 missed days used · standard');
    // 17 of 18 cleared is 94%, which § 8.9 moves by +1: 4 u a day becomes 5.
    expect(view.need?.offer?.rate).toBe('5 u');
    expect(view.need?.offer?.why).toContain('94% of days cleared · complexity 2 of 5');
    expect(view.need?.offer?.why).toContain('moves the rate by +1');
    expect(recordLine(career.towers[1]!)).toBe('94% of days cleared · complexity 2 of 5');
  });

  it('dims an option the purse cannot reach and says what it is short by (§ 16 rule 6)', () => {
    // A worn tower five days into its first month: 23 units on hand against a 46-unit refurbishment.
    const worn: CampaignCareer = {
      ...openingCareer('eta'),
      towers: [{ ...openingCareer('eta').towers[0]!, day: 6, trips: 41_000 }],
    };
    const view = buildingView(inputOf(worn))!;
    const refurbish = view.options!.rows.find((row) => row.id === 'refurbish')!;
    const purse = purseOf(worn.towers[0]!);
    expect(purse).toBeLessThan(46);
    expect(refurbish.affordable).toBe(false);
    expect(refurbish.cost).toContain(`need ${String(46 - purse)} more`);
    // And the ones this purse can reach are offered plainly, with their nights.
    expect(view.options!.rows.find((row) => row.id === 'window')?.cost).toBe('free · 3 nights');
    expect(view.options!.rows.find((row) => row.id === 'leave')?.cost).toBe('free');

    // On a well-off tower the same option is affordable, so the dimming is about the purse.
    const rich = applyCampaignAction(twoTowers(), { kind: 'open-tower', towerId: 'c6' });
    expect(
      buildingView(inputOf(rich))!.options!.rows.find((row) => row.id === 'refurbish')?.affordable,
    ).toBe(true);
  });

  it('heads the condition card by § 8.3’s three thresholds, and says the trips behind it', () => {
    const career = applyCampaignAction(twoTowers(), { kind: 'open-tower', towerId: 'c6' });
    const view = buildingView(inputOf(career))!;
    expect(view.condition.head).toBe('Service window due');
    expect(view.condition.headId).toBe('due');
    expect(view.condition.trips).toBe('41,000 / 45,000 trips');
    expect(view.odds.now).toMatch(/^\d+\.\d% of days$/);

    const fresh = buildingView(inputOf(openingCareer('eta')))!;
    expect(fresh.condition.head).toBe('Recently serviced');
    expect(fresh.odds.now).toBe('0.4% of days');
  });

  it('lists what is fitted, what is booked and what is as built', () => {
    const bought = applyCampaignAction(
      { ...openingCareer('eta'), towers: [{ ...openingCareer('eta').towers[0]!, day: 3, carry: 60 }] },
      { kind: 'press-tier', towerId: 'c1', categoryId: 'doors', level: 1 },
    );
    const view = buildingView(inputOf(bought))!;
    const doors = view.fitted.rows.find((row) => row.categoryId === 'doors')!;
    expect(doors.state).toBe('live');
    expect(doors.label).toBe('Faster doors');
    expect(doors.level).toBe('L1');
    const shafts = view.fitted.rows.find((row) => row.categoryId === 'shafts')!;
    expect(shafts.state).toBe('as-built');
    expect(shafts.label).toBe('Shafts — as built');
    expect(shafts.level).toBe(UNFINISHED);
  });

  it('answers undefined when no building is open, rather than picking one', () => {
    const closed: CampaignCareer = { ...openingCareer('eta'), openTowerId: undefined };
    expect(buildingView(inputOf(closed))).toBeUndefined();
    expect(contractView(inputOf(closed))).toBeUndefined();
  });
});

describe('the four daily tests (§ 7, § 8.6)', () => {
  const tower = (): CampaignTower => openingCareer('eta').towers[0]!;

  it('sets three bars from the difficulty and grades them from the run', () => {
    const rows = campaignTestRows(DIFFICULTIES.standard, tower(), GOOD, []);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.target)).toEqual(['75%', '180 s', '25', '520']);
    expect(rows.slice(0, 3).map((row) => row.reading?.state)).toEqual(['met', 'met', 'met']);
    /*
     * Move the difficulty and the **bars** move with it rather than the copy — and the same run
     * changes verdict, which is the half worth asserting: 80% away holds a standard month's 75 and
     * misses a hard one's 82.
     */
    const marginal = { ...GOOD, minutePct: 80 };
    expect(campaignTestRows(DIFFICULTIES.standard, tower(), marginal, [])[0]?.reading?.state).toBe(
      'met',
    );
    const hard = campaignTestRows(DIFFICULTIES.hard, tower(), marginal, []);
    expect(hard.map((row) => row.target)).toEqual(['82%', '150 s', '18', '470']);
    expect(hard[0]?.reading?.state).toBe('missed');
  });

  it('refuses the trip budget rather than inventing a figure for it', () => {
    const rows = campaignTestRows(DIFFICULTIES.standard, tower(), GOOD, []);
    const trips = rows.at(-1)!;
    expect(trips.reading).toBeUndefined();
    expect(trips.was).toBe(UNFINISHED);
    expect(trips.refusal).toBe(TRIPS_REFUSAL);
    // And the three that do grade carry no refusal.
    for (const row of rows.slice(0, 3)) expect(row.refusal).toBeUndefined();
  });

  it('reads the “was” column off the previous day, or `—` when there is none', () => {
    const goals = campaignTestGoals(DIFFICULTIES.standard);
    const yesterday: DayOutcome = outcomeOf({
      day: 1,
      dayIdx: 0,
      eventId: 'ordinary',
      arrived: 380,
      carried: 370,
      minutePct: 88,
      readings: readGoals(goals, { ...GOOD, minutePct: 88, worstWaitS: 141, peakQueue: 19 }),
      record: null,
      recordRefusal: 'no record kept in this fixture',
    });
    const onDayTwo = { ...tower(), day: 2 };
    const rows = campaignTestRows(DIFFICULTIES.standard, onDayTwo, GOOD, [yesterday]);
    expect(rows[0]?.was).toBe('88%');
    expect(rows[1]?.was).toBe('141 s');
    expect(rows[2]?.was).toBe('19');
    // With no previous day at all, every one of them is `—`.
    const noHistory = campaignTestRows(DIFFICULTIES.standard, tower(), GOOD, []);
    expect(noHistory.map((row) => row.was)).toEqual([UNFINISHED, UNFINISHED, UNFINISHED, UNFINISHED]);
  });

  it('counts what is holding out of what it can grade, both halves derived', () => {
    expect(testsHeldLine(campaignTestRows(DIFFICULTIES.standard, tower(), GOOD, []))).toBe(
      '3 of 3 holding',
    );
    expect(testsHeldLine(campaignTestRows(DIFFICULTIES.standard, tower(), undefined, []))).toBe(
      'nothing run yet today',
    );
  });
});

describe('the contract sheet (§ 8.3, § 8.4)', () => {
  const openMonth = (patch: Partial<CampaignTower> = {}): CampaignCareer => {
    const base = openingCareer('eta');
    return { ...base, towers: [{ ...base.towers[0]!, ...patch }] };
  };

  it('quotes the month against the shop, and both figures are the tables’ own', () => {
    const view = contractView(inputOf(openMonth()))!;
    expect(view.purse.totalNote).toContain('A perfect month pays 98 units');
    expect(view.purse.totalNote).toContain('worth 324');
    expect(view.lede).toContain('about a third of the shop');
  });

  it('lays the month out as four weeks of five, with today marked NOW', () => {
    const view = contractView(inputOf(openMonth({ day: 7, missed: 1 })))!;
    expect(view.month.weeks).toHaveLength(4);
    const cells = view.month.weeks.flatMap((week) => week.cells);
    expect(cells).toHaveLength(CONTRACT_DAYS);
    expect(cells[6]?.mark).toBe('NOW');
    // Six days played with one missed: five cleared, and the miss is the most recent.
    expect(cells.filter((cell) => cell.mark === '✓')).toHaveLength(5);
    expect(cells[5]?.mark).toBe('×');
  });

  it('shows every § 8.2 tier state, and refuses the presses each one refuses', () => {
    const rich = openMonth({ day: 3, carry: 100 });
    const view = contractView(inputOf(rich))!;
    const doors = view.shop.categories.find((category) => category.id === 'doors')!;
    expect(doors.rows[0]?.state).toBe('working tomorrow');
    expect(doors.rows[0]?.pressable).toBe(true);
    expect(doors.rows[1]?.state).toBe('needs level 1 first');
    expect(doors.rows[1]?.pressable).toBe(false);
    expect(doors.owned).toBe('nothing yet');

    const poor = contractView(inputOf(openMonth({ day: 3 })))!;
    const shafts = poor.shop.categories.find((category) => category.id === 'shafts')!;
    expect(shafts.rows[0]?.state).toMatch(/^need \d+ more$/);
    expect(shafts.rows[0]?.pressable).toBe(false);

    const late = contractView(inputOf(openMonth({ day: 18, carry: 200 })))!;
    const lateShafts = late.shop.categories.find((category) => category.id === 'shafts')!;
    expect(lateShafts.rows[0]?.state).toBe('works run past the contract');
    expect(lateShafts.rows[0]?.pressable).toBe(false);
  });

  it('lights the legal start days once a tier is pressed, and prints the works line once booked', () => {
    const pressed = applyCampaignAction(openMonth({ day: 3, carry: 100 }), {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'machines',
      level: 1,
    });
    const prompting = contractView(inputOf(pressed))!;
    expect(prompting.month.prompt).toContain('Pick the night 4.0 m/s goes in');
    expect(prompting.month.prompt).toContain('2 nights of works');
    const bookable = prompting.month.weeks
      .flatMap((week) => week.cells)
      .filter((cell) => cell.mark === '+');
    expect(bookable.length).toBeGreaterThan(0);
    /*
     * § 8.2's `s ≥ dayIdx`: nothing before today is offered, and **tonight is** — the cell that
     * would read `NOW` lights with `+` while a buy is pending, which is the one start a player
     * most often wants.
     */
    expect(Math.min(...bookable.map((cell) => cell.dayIdx))).toBe(2);
    expect(prompting.month.weeks.flatMap((week) => week.cells).filter((cell) => cell.mark === 'NOW')).toEqual(
      [],
    );

    const booked = applyCampaignAction(pressed, { kind: 'pick-start', startIdx: 11 });
    const view = contractView(inputOf(booked))!;
    expect(view.month.prompt).toBeUndefined();
    const machines = view.shop.categories.find((category) => category.id === 'machines')!;
    expect(machines.rows[0]?.state).toBe('works day 12–13 · live on day 14');
    expect(view.month.booked[0]).toEqual({ name: '4.0 m/s', when: 'days 12–13' });
    expect(view.month.worksCost).toContain('14 units of kit that stays with the building');
  });

  it('ledgers the purse against § 8.1’s four terms', () => {
    const view = contractView(inputOf(openMonth({ day: 7 })))!;
    expect(view.purse.onHand).toBe(units(purseOf(openMonth({ day: 7 }).towers[0]!)));
    expect(view.purse.note).toContain('8 carried in from earlier months');
    expect(view.purse.note).toContain('19 earned this one');
    expect(view.purse.note).toContain('0 committed');
    expect(view.purse.weeks.map((week) => week.value)).toEqual(['3 u', '4 u', '5 u', '6 u']);
    expect(view.purse.weeks.filter((week) => week.current)).toHaveLength(1);
  });

  it('states the terms with both halves of each count derived', () => {
    const career = openMonth({ day: 7, missed: 1 });
    const view = contractView(inputOf(career))!;
    expect(view.terms.rows[0]).toEqual({
      label: 'Days cleared so far',
      got: `${String(clearedDays(career.towers[0]!))} of 6`,
    });
    expect(view.terms.rows[1]?.got).toBe('14');
    expect(view.terms.rows[2]?.got).toBe('1 of 3 used');
    // Nothing has run, so the fourth term is withheld rather than zeroed.
    expect(view.terms.rows[3]?.got).toBe(UNFINISHED);
  });

  it('offers the four difficulties and says that picking one starts a fresh month', () => {
    const view = contractView(inputOf(openMonth()))!;
    expect(view.difficulty.buttons.map((entry) => entry.id)).toEqual([
      'easy',
      'standard',
      'hard',
      'impossible',
    ]);
    expect(view.difficulty.picked).toBe('standard');
    expect(view.difficulty.note).toBe(DIFFICULTIES.standard.note);
    expect(view.difficulty.footer).toContain('fresh month');
  });
});

describe('one record, three screens (§ 16 rule 14)', () => {
  it('has all three agree about the day, the record and the purse', () => {
    const career = applyCampaignAction(twoTowers(), { kind: 'open-tower', towerId: 'c6' });
    const input = inputOf(career);
    const towers = towersView(input);
    const desk = buildingView(input)!;
    const contract = contractView(input)!;
    const tower = career.towers[1]!;

    const row = towers.rows.find((entry) => entry.towerId === 'c6')!;
    expect(row.day).toBe(`day ${String(tower.day)}`);
    expect(desk.month.day).toBe(row.day);
    expect(contract.meta).toContain(`day ${String(tower.day)} of twenty`);

    expect(desk.month.cleared).toBe(String(clearedDays(tower)));
    expect(row.record).toContain(`${String(clearedDays(tower))} cleared`);
    expect(contract.terms.rows[0]?.got).toContain(String(clearedDays(tower)));

    expect(desk.purse.onHand).toBe(`${units(purseOf(tower))} on hand`);
    expect(contract.purse.onHand).toBe(units(purseOf(tower)));
  });

  it('moves all three when one of them writes the record', () => {
    const before = applyCampaignAction(twoTowers(), { kind: 'open-tower', towerId: 'c1' });
    const after = applyCampaignAction(before, {
      kind: 'set-dispatcher',
      towerId: 'c1',
      dispatcherId: 'mine',
    });
    expect(towersView(inputOf(after)).rows[0]?.order.dispatcherId).toBe('mine');
    expect(buildingView(inputOf(after))?.order.view.dispatcherId).toBe('mine');
    // A saved dispatcher gets the prototype's own line for one of yours.
    expect(buildingView(inputOf(after))?.order.view.note).toContain('one of yours');
  });
});

/* -------------------------------------------------------------------------- *
 * The works day takes no car out — GitHub issue #264
 * -------------------------------------------------------------------------- */

/**
 * **A campaign works day takes no car out of service, and the screens no longer say it does.**
 *
 * `RecordRunOptions.outOfServiceCarIds` is this repository's one instrument for *this car is not in
 * the building today*, and it has **no writer anywhere on the path a campaign day runs**: nothing
 * under `campaign/` names it, no `everyday/campaign*` module names it, and
 * `everyday/host.ts#runCampaignDay` — the only function that turns a tower into a run — patches
 * `buildingId` and `dispatcherId` and nothing else. A booking moves the purse and the month grid,
 * and the day the player then watches has its full complement of lifts.
 *
 * Seven player-facing sentences said otherwise, and this is the **dangerous** direction of § D227's
 * class rather than the familiar one. A stale refusal tells a reader not to touch a control; a stale
 * *assertion* changes how they read every figure that follows. A worse day gets attributed to a
 * missing car rather than to the dispatcher, which is the one diagnosis this game exists to teach —
 * and § 8.4's whole shaft decision is priced off it, so a player reasoning correctly from *"you hand
 * back two cars for eight days"* declines the purchase the month is built around.
 *
 * **Withdrawn rather than qualified.** A caption saying a car *may* be out on a run where none ever
 * is has the same defect with more words. What replaces each sentence is the part that is true and
 * asserted elsewhere in this suite: the money leaves the purse, the nights are spoken for, and the
 * kit is live the day after the last of them.
 *
 * The tests below are the register the issue asks for. The first two hold the words; the third holds
 * the **absence of the writer**, from disk, so the day a works day genuinely takes a car out it turns
 * red and the sentence is owed back rather than quietly missing.
 */
describe('a works day takes no car out of service (issue #264)', () => {
  /**
   * A car-availability **claim**: a lift named in the same sentence as it going away, un-negated.
   *
   * Deliberately not a list of the seven withdrawn strings. A list would pass the moment somebody
   * rephrased one of them, which is how the claim survived this long — it is § 8.4's design copy,
   * and design copy gets rewritten.
   *
   * The `no ` lookbehind is what lets the withdrawal be **stated in the player's own words** rather
   * than in a euphemism: § D227's first direction requires a control that writes nothing to say so,
   * and *"the works take no car out of service"* is a denial rather than an assertion. It is held
   * accountable below — the exemption cannot be used to smuggle the claim back, because the denial
   * itself is asserted present.
   */
  const CAR_IS_AWAY = /(?<!\bno )\b(?:car|cars|lift|lifts)\b[^.]*\b(?:out|short|down)\b|\bhand back\b/i;

  /**
   * A tower on its third day with two nights of works booked from its sixth.
   *
   * **The start day is chosen so the works land inside *both* grids**, and that is not a detail: the
   * career calendar shows `careerToday − 23 … careerToday + 6` (§ 8.6's `CAL_FROM`, `CALENDAR_SPAN`),
   * so a booking eleven days out — the natural fixture, and the one this file's booking test uses —
   * is drawn only by § 8.4's month. A first draft used it and the sweep below passed with
   * `tipSuffix`'s works arm reverted to the false sentence, because no cell it authored was ever
   * read. The count assertions in the test are what keep that honest.
   */
  function withWorksBooked(): CampaignCareer {
    const base = openingCareer('eta');
    const opened = { ...base, towers: [{ ...base.towers[0]!, day: 3, carry: 100 }] };
    const pressed = applyCampaignAction(opened, {
      kind: 'press-tier',
      towerId: 'c1',
      categoryId: 'machines',
      level: 1,
    });
    return applyCampaignAction(pressed, { kind: 'pick-start', startIdx: 5 });
  }

  it('says nothing about a car being out on any surface a booked works day reaches', () => {
    const booked = withWorksBooked();
    const contract = contractView(inputOf(booked))!;
    const calendar = calendarView(inputOf(booked));

    /*
     * Both grids are swept, because the claim was in both and they are different functions:
     * `tipSuffix` for § 8.6's career calendar and `contractView`'s own `cellFor` for § 8.4's month.
     * A fix applied to one of them is a fix applied to neither.
     */
    const careerTips = calendar.rows
      .flatMap((row) => row.cells.filter((cell) => cell.glyph === CALENDAR_GLYPHS.works))
      .map((cell) => cell.tip);
    const monthTips = contract.month.weeks
      .flatMap((week) => week.cells.filter((cell) => cell.state === 'works'))
      .map((cell) => cell.tip);
    // Both counts, separately: one of them being zero is a whole grid this sweep never read.
    expect(careerTips, 'the career calendar drew no works cell').toHaveLength(2);
    expect(monthTips, 'the month grid drew no works cell').toHaveLength(2);
    const worksTips = [...careerTips, ...monthTips];

    const words = [
      ...worksTips,
      ...MONTH_LEGEND,
      contract.month.worksCost ?? '',
      CONTRACT_COPY.shopSub,
      CONTRACT_COPY.shaftBody,
    ];
    for (const line of words) expect(line, line).not.toMatch(CAR_IS_AWAY);

    /*
     * And the absence is **stated where the player meets the cost**, rather than left as a silence
     * a reader would fill in themselves. This is the other half of the lookbehind above: without
     * it the exemption would be a hole, and without the exemption this sentence could not be
     * written in the words a player would use.
     */
    expect(contract.month.worksCost).toContain('take no car out of service');
  });

  it('says nothing about a car being out while the night is still being picked', () => {
    // The moment of the purchase, which is the moment the claim is acted on. `pick-start` has not
    // happened, so this is the prompt and the `+` tips rather than the booked ones.
    const base = openingCareer('eta');
    const pressed = applyCampaignAction(
      { ...base, towers: [{ ...base.towers[0]!, day: 3, carry: 100 }] },
      { kind: 'press-tier', towerId: 'c1', categoryId: 'shafts', level: 1 },
    );
    const view = contractView(inputOf(pressed))!;
    const offers = view.month.weeks.flatMap((week) => week.cells).filter((cell) => cell.mark === '+');
    expect(offers.length).toBeGreaterThan(0);
    for (const line of [view.month.prompt ?? '', ...offers.map((cell) => cell.tip)]) {
      expect(line, line).not.toMatch(CAR_IS_AWAY);
    }
  });

  it('has no writer for outOfServiceCarIds on the path a campaign day runs, and owes the sentence back when it gets one', () => {
    /*
     * The register the issue asks for, derived from disk rather than listed. When a works day
     * genuinely holds a car this turns red, and the message is the instruction: the sentences
     * withdrawn above are owed back, pinned by a legs comparison rather than by prose.
     */
    const here = fileURLToPath(new URL('./', import.meta.url));
    const campaignDir = fileURLToPath(new URL('../campaign/', import.meta.url));
    const files = [
      ...readdirSync(campaignDir)
        .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
        .map((name) => join(campaignDir, name)),
      ...readdirSync(here)
        .filter((name) => /^campaign.*\.ts$/.test(name) && !name.includes('.test'))
        .map((name) => join(here, name)),
      join(here, 'host.ts'),
    ];
    expect(files.length, 'the campaign directory was not read').toBeGreaterThan(5);

    /*
     * Comments are stripped before the scan, because the withdrawal itself has to be able to name
     * the field it is about: `campaignModel.ts`'s own docstrings say *"`outOfServiceCarIds` has no
     * writer here"*, and a scan that read those as writers would make the register unwritable. It
     * errs toward a **false red** rather than a false green — a `//` inside a string literal would
     * truncate a line and could only ever hide code from a check that wants to find none.
     */
    const withoutComments = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

    for (const file of files) {
      expect(
        withoutComments(readFileSync(file, 'utf8')).includes('outOfServiceCarIds'),
        `${file} names outOfServiceCarIds in code — if a works day now takes a car out, the sentences issue #264 withdrew from campaignModel.ts are owed back, pinned by a legs comparison`,
      ).toBe(false);
    }
  });

  it('registers the one sibling sentence this lane does not own', () => {
    /*
     * `campaign/economy.ts`'s shop tier prose makes the same claim — *"Eight nights with two cars
     * out."* on `shafts` level 1 — and lives one directory over, in the package this lane owns only
     * if the works day needs a **writer** there. It does not; it needs the same withdrawal.
     *
     * A ghost check in both directions, `honesty.test.ts`'s `OUTSTANDING` shape: it fails when the
     * sentence is fixed, because a registered finding that has been fixed must stop being
     * registered or the register becomes decoration — and it fails if a second tier acquires the
     * claim, because a register that only knows about the instance it was written for is a list.
     *
     * **The sentence is matched exactly rather than by {@link CAR_IS_AWAY}, and that is a finding
     * rather than a preference.** A first draft used the pattern and stayed green with *"Eight
     * nights with two cars out."* deleted, because the tier's **other** sentence — *"The tower
     * stops being one car short."* — matches it too. That one is a different claim about a
     * different moment (what the building is like once the kit is in, GitHub issue #181's subject,
     * not this one's), and a register that cannot tell them apart cannot be closed by fixing
     * either.
     */
    const shafts = SHOP.find((category) => category.id === 'shafts')!;
    const fourth = shafts.tiers.find((tier) => tier.name === 'A fourth car')!;
    expect(
      fourth.effect,
      'campaign/economy.ts no longer claims a works day takes a car out — delete this register entry',
    ).toContain('Eight nights with two cars out.');
    expect(
      shafts.tiers.filter((tier) => tier.effect.includes('cars out')).map((tier) => tier.name),
      'a second shop tier has acquired the works-day claim — register it or withdraw it',
    ).toEqual(['A fourth car']);
  });
});

