/**
 * **The week's tower is a control** — GitHub issue **#587**, [§ D912](../../../../DECISIONS.md).
 *
 * The pure half. What is asserted here is what the *words* promise; that pressing a row moves the
 * week is `everyday/host.ts`'s and is proved on the built bundle by
 * `everyday/towerChoice.browser.test.ts`, because a picker that renders correctly and writes
 * nothing is the defect this whole module exists to close.
 */

import { describe, expect, it } from 'vitest';

import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { CONTRACTS } from '../shift/contracts.js';
import { scenarioHorizonFor } from '../shift/dayLength.js';
import { CALENDAR_PERIODS, periodOnDays } from '../shift/calendar.js';
import { admittedPressDayIds, CONTRACT_LADDER, ladderRowFor, pressDayFor } from '../shift/ladder.js';
import { openWeek } from '../shift/week.js';
import { weekDealOf, weekOfferOf } from '../shift/weekStake.js';
import type { RunHorizon, WeekState } from '../shift/types.js';

import {
  PRESS_DAY_CHOICE_COPY,
  pressDayChoiceOf,
  pressDayLedeOf,
  TOWER_CHOICE_COPY,
  towerChoiceViewOf,
} from './towerChoice.js';

const nameOf = (buildingId: string): string | undefined => `The ${buildingId} Building`;

/**
 * The horizon each tower's pin was measured on, read off the pin itself — so these cases exercise
 * the picker's own gates (day, wrinkle, calendar, seed) with the horizon held true. The horizon's
 * own agreement with the product is `contractLadderIssues`' and `pressLadder.test.ts`'s to prove.
 */
const pinnedHorizon = (buildingId: string): RunHorizon | undefined =>
  CONTRACTS.map((contract) => (contract.buildingId === buildingId ? pressDayFor(contract.id)?.horizon : undefined)).find(
    (horizon) => horizon !== undefined,
  ) ?? 'period';

function viewOn(
  week: WeekState,
  parked: readonly WeekState[] = [],
  seed = 424_242n,
  horizonFor: (buildingId: string) => RunHorizon | undefined = pinnedHorizon,
): ReturnType<typeof towerChoiceViewOf> {
  return towerChoiceViewOf({ week, parked, nameOf, seed, calendar: null, horizonFor });
}

describe('the picker lists every shipped tower and marks the one standing', () => {
  it('draws one row per contract, in the order a player meets them', () => {
    const view = viewOn(openWeek('c1'));
    expect(view.rows.map((row) => row.contractId)).toEqual(CONTRACTS.map((c) => c.id));
  });

  it('marks exactly one row selected, and it is the week’s own', () => {
    for (const contract of CONTRACTS) {
      const view = viewOn(openWeek(contract.id));
      const selected = view.rows.filter((row) => row.selected);
      expect(selected.map((row) => row.contractId), contract.id).toEqual([contract.id]);
      expect(selected[0]?.arrival).toBe('standing');
      expect(selected[0]?.arrivalNote).toBe(TOWER_CHOICE_COPY.standing);
    }
  });

  it('selects nothing on a week the picker does not list, and still offers every tower', () => {
    /*
     * A sentinel week — the rush, a replay, free play, the sandbox. The player is somewhere this
     * control does not name, and every listed tower is somewhere they can go, so no row is
     * `standing` and none is inert.
     */
    const view = viewOn(openWeek('rush'));
    expect(view.rows.some((row) => row.selected)).toBe(false);
    expect(view.rows.every((row) => row.arrival !== 'standing')).toBe(true);
  });
});

describe('each row says what the press will do before it is pressed', () => {
  it('says *resume* for a parked week and *open* for one never played', () => {
    const parked: readonly WeekState[] = [{ ...openWeek('c7'), day: 4, streak: 3 }];
    const view = viewOn(openWeek('c1'), parked);
    const resumed = view.rows.find((row) => row.contractId === 'c7');
    const fresh = view.rows.find((row) => row.contractId === 'c9');
    expect(resumed?.arrival).toBe('resume');
    expect(resumed?.arrivalNote).toBe(TOWER_CHOICE_COPY.resume);
    expect(fresh?.arrival).toBe('open');
    expect(fresh?.arrivalNote).toBe(TOWER_CHOICE_COPY.open);
  });

  it('never promises a resume the week state cannot honour', () => {
    /*
     * The two-sided half of the sentence above. `shift/week.ts#switchWeek` resumes a parked week
     * and opens a fresh one otherwise, so the row may say *resume* exactly when a parked entry
     * exists under that id — a row promising to pick a week back up that `switchWeek` would
     * restart would be a small lie on the one control whose whole job is not to lose a week.
     */
    const parked: readonly WeekState[] = [
      { ...openWeek('c2'), day: 2 },
      { ...openWeek('c3'), day: 3 },
    ];
    const view = viewOn(openWeek('c1'), parked);
    const promising = view.rows.filter((row) => row.arrival === 'resume').map((r) => r.contractId);
    expect(promising).toEqual(['c2', 'c3']);
  });

  it('says *open* for a parked week nobody played — post-AH panel B.md', () => {
    /*
     * A fresh profile read *"you have a week going here"* on Garden Apartments, because the first
     * session parks the opening week it moves off. That week is day 1 with no history, so picking
     * it back up is a fresh week in everything a player sees, and the row says so.
     */
    const view = viewOn(openWeek('c14'), [openWeek('c1')]);
    const garden = view.rows.find((row) => row.contractId === 'c1');
    expect(garden?.arrival).toBe('open');
    expect(garden?.arrivalNote).toBe(TOWER_CHOICE_COPY.open);
    /* And the same week once a day of it has been closed is one going. */
    const played = viewOn(openWeek('c14'), [{ ...openWeek('c1'), day: 2 }]);
    expect(played.rows.find((row) => row.contractId === 'c1')?.arrival).toBe('resume');
  });
});

describe('the rows that carry a day whose verdict turns on a press are findable', () => {
  it('tags exactly the contracts whose rung books a car out', () => {
    /*
     * Derived from the ladder in both directions rather than compared against a list — § D871 and
     * § D914 author the absences, and a tag written here would be a second authority on which
     * towers have one.
     */
    const view = viewOn(openWeek('c1'));
    const tagged = view.rows.filter((row) => row.booksACarOut).map((row) => row.contractId);
    const booking = CONTRACTS.filter(
      (contract) => (ladderRowFor(contract.id)?.fabric.incidents.length ?? 0) > 0,
    ).map((contract) => contract.id);
    expect(tagged).toEqual(booking);
    expect(tagged.length, 'some rung books a car out, or the tag is about nothing').toBeGreaterThan(
      0,
    );
  });
});

describe('a tower whose week counts no day holds its scenario, and stays a press — § D1179', () => {
  it('holds exactly where the week census counts no day, and says why beside the row', () => {
    const view = viewOn(openWeek('c1'), []);
    for (const row of view.rows) {
      const deal = weekDealOf(row.contractId);
      const offer = weekOfferOf(row.contractId);
      expect(row.scenario, row.contractId).toBe(offer?.offer);
      expect(row.scenarioLine, row.contractId).toBe(offer?.line);
      expect(row.scenario === 'held', row.contractId).toBe(deal !== undefined && deal.counted === 0);
      // Only the scenario's clear is held: the tower is pressable like any other row.
      expect(row.arrival, row.contractId).toBe(row.selected ? 'standing' : 'open');
    }
    expect(view.rows.filter((row) => row.scenario === 'held').map((row) => row.contractId)).toEqual(['c3']);
    const secure = view.rows.find((row) => row.contractId === 'c3');
    /*
     * The words say what pressing the row does, since the row is a press (lane AL-B, seat C D4 and
     * seat D H8). Red before the fix: the line read *"its scenario is held back"* and *"Nothing is
     * locked"*, and nothing in it said that choosing the tower plays its week.
     */
    expect(secure?.scenarioLine).not.toMatch(/held back/u);
    expect(secure?.scenarioLine).toMatch(/no scenario clear to win/u);
    expect(secure?.scenarioLine).toMatch(/not been measured as they are dealt/u);
    expect(secure?.scenarioLine).toMatch(/Choosing this tower still plays its week/u);
    // Harbour Point is offered at one of one, and its row names the day.
    const harbour = view.rows.find((row) => row.contractId === 'c9');
    expect(harbour?.scenario).toBe('offered');
    expect(harbour?.scenarioLine).toContain('Monday');
    // A tower the census does not speak for draws nothing new.
    expect(view.rows.find((row) => row.contractId === 'c1')?.scenarioLine).toBeUndefined();
  });
});

describe('the surface publishes no figure', () => {
  it('draws no digit outside the scenario labels the contracts themselves author', () => {
    /*
     * The honesty search asks whether a figure is *licensed* and nothing in this repository checks
     * whether one is **current**, so the cheapest guarantee is a surface with no figure on it. The
     * contract's own `label` (*Scenario 6*) is the one exception and it is a name rather than a
     * measurement — it is excluded by name here so that a digit arriving anywhere else fails.
     */
    const view = viewOn(openWeek('c1'), [openWeek('c2')]);
    const drawn = [
      view.heading,
      view.lede,
      view.note,
      view.incidentTag,
      ...view.rows.flatMap((row) => [row.tower, row.teaches, row.arrivalNote, row.scenarioLine ?? '']),
      view.pressDays.heading,
      view.pressDays.lede,
      view.pressDays.note,
      ...view.pressDays.rows.flatMap((row) => [row.tower, row.note]),
      ...Object.values(PRESS_DAY_CHOICE_COPY),
    ];
    for (const text of drawn) expect(text, text).not.toMatch(/\d/);
  });
});

describe('the days a press decides are offered from the picker — issue #595, § D973', () => {
  /* § D1029: a pinned row is offered only when it is admitted; the rest are drawn refused. */
  const ADMITTED = admittedPressDayIds();
  const PINNED = CONTRACT_LADDER.rows.filter(
    (row) => row.pressDay !== undefined && ADMITTED.includes(row.contractId),
  );
  const REFUSED = CONTRACT_LADDER.rows.filter(
    (row) => row.pressDay !== undefined && !ADMITTED.includes(row.contractId),
  );

  it('lists every contract that pins a day, offers the admitted ones and refuses the rest by reason', () => {
    const view = viewOn(openWeek('c1'));
    expect(view.pressDays.rows.map((row) => row.contractId)).toEqual(
      CONTRACTS.filter((contract) => pressDayFor(contract.id) !== undefined).map((c) => c.id),
    );
    expect(PINNED.length, 'some rung pins an admitted day, or this list is about nothing').toBeGreaterThan(0);
    for (const row of view.pressDays.rows) {
      expect(row.standing, row.contractId).toBe(false);
      if (ADMITTED.includes(row.contractId)) {
        expect(row.available, row.contractId).toBe(true);
        expect(row.note).toBe(PRESS_DAY_CHOICE_COPY.available);
      } else {
        expect(row.available, row.contractId).toBe(false);
        expect(row.note).toBe(pressDayFor(row.contractId)?.refused ?? PRESS_DAY_CHOICE_COPY.notAdmitted);
      }
    }
    /* The refused arm is reached by the shipped data or by nothing — say which. */
    expect(REFUSED.length + PINNED.length).toBe(view.pressDays.rows.length);
  });

  it('marks the pinned day standing once the week is on it with the pinned crowd, and not before', () => {
    for (const row of PINNED) {
      const press = row.pressDay;
      if (press === undefined) continue;
      const week = openWeek(row.contractId);
      const on = viewOn(week, [], BigInt(press.seedText)).pressDays.rows.find(
        (entry) => entry.contractId === row.contractId,
      );
      expect(on?.standing, row.contractId).toBe(true);
      expect(on?.available, row.contractId).toBe(false);
      expect(on?.note).toBe(PRESS_DAY_CHOICE_COPY.standing);
      /* The same week on today's crowd is not the pinned day, and the row offers to set it up. */
      const off = viewOn(week).pressDays.rows.find((entry) => entry.contractId === row.contractId);
      expect(off?.standing, row.contractId).toBe(false);
      expect(off?.available, row.contractId).toBe(true);
    }
  });

  it('refuses a week there that is past its first day, and says so rather than restarting it', () => {
    const [first] = PINNED;
    if (first === undefined) throw new Error('no pinned day');
    const parked: readonly WeekState[] = [{ ...openWeek(first.contractId), day: 4, dayIdx: 3 }];
    const row = viewOn(openWeek('c1'), parked).pressDays.rows.find(
      (entry) => entry.contractId === first.contractId,
    );
    expect(row?.available).toBe(false);
    expect(row?.note).toBe(PRESS_DAY_CHOICE_COPY.pastFirstDay);
  });

  it('refuses a day the product would not run on the horizon it was measured on', () => {
    /*
     * The fourth gate, and the one #595 was about: a pin measured on one horizon offered over the
     * other would set up a day nobody measured. Asked here with every tower answering the *other*
     * horizon from its pin.
     */
    const flipped = (buildingId: string): RunHorizon =>
      pinnedHorizon(buildingId) === 'whole-day' ? 'period' : 'whole-day';
    /* The admitted rows — a refused one says its refusal first, § D1029, and is never offered. */
    const admitted = (row: { readonly contractId: string }): boolean => ADMITTED.includes(row.contractId);
    for (const row of viewOn(openWeek('c1'), [], 424_242n, flipped).pressDays.rows.filter(admitted)) {
      expect(row.available, row.contractId).toBe(false);
      expect(row.note).toBe(PRESS_DAY_CHOICE_COPY.otherHorizon);
    }
    /* And a tower this build cannot resolve a horizon for is not offered either. */
    for (const row of viewOn(openWeek('c1'), [], 424_242n, () => undefined).pressDays.rows.filter(admitted)) {
      expect(row.available, row.contractId).toBe(false);
      expect(row.note).toBe(PRESS_DAY_CHOICE_COPY.notAsMeasured);
    }
  });

  it('offers, over the shipped data, exactly the pins measured on the horizon their tower plays', () => {
    /*
     * The data-level half, asked of the real towers through the product's own horizon rule
     * (`shift/dayLength.ts#scenarioHorizonFor`) rather than of the pin. Whatever the ladder carries,
     * a row is offered exactly when its pin and its tower agree — which is the whole of #595's
     * second finding, stated so it holds before and after the pins are re-measured.
     */
    const resources = contractBuildings();
    const horizonFor = (buildingId: string): RunHorizon | undefined =>
      scenarioHorizonFor(
        resources.trafficProfiles,
        resources.entries.find((entry) => entry.config.id === buildingId)?.config,
      );
    const view = towerChoiceViewOf({
      week: openWeek('c1'),
      parked: [],
      nameOf,
      seed: 424_242n,
      calendar: null,
      horizonFor,
    });
    const offered = view.pressDays.rows.filter((row) => row.available).map((row) => row.contractId);
    /* `PINNED` here is the admitted rows — § D1029 — so a refused row is not expected offered. */
    const agreeing = PINNED.filter((row) => {
      const contract = CONTRACTS.find((candidate) => candidate.id === row.contractId);
      return row.pressDay?.horizon === horizonFor(contract?.buildingId ?? '');
    }).map((row) => row.contractId);
    expect([...offered].sort()).toEqual([...agreeing].sort());
    expect(offered.length, 'some pinned day is reachable from the door').toBeGreaterThan(0);
  });

  it('refuses under a calendar period, which the measurement ran without', () => {
    const [first] = PINNED;
    if (first === undefined) throw new Error('no pinned day');
    const period = Object.values(CALENDAR_PERIODS)[0];
    if (period === undefined) throw new Error('no calendar period ships');
    const choice = pressDayChoiceOf(
      {
        week: openWeek('c1'),
        parked: [],
        seed: 424_242n,
        calendar: periodOnDays(period, 1, 7),
        horizonFor: pinnedHorizon,
      },
      first.contractId,
    );
    expect(choice?.available).toBe(false);
  });

  it('answers nothing for a contract that pins no day', () => {
    const quiet = CONTRACTS.find((contract) => pressDayFor(contract.id) === undefined);
    expect(quiet).toBeDefined();
    expect(
      pressDayChoiceOf(
        { week: openWeek('c1'), parked: [], seed: 1n, calendar: null, horizonFor: pinnedHorizon },
        quiet?.id ?? '',
      ),
    ).toBeUndefined();
  });
});

describe('the lede is derived from the admitted windows — § D1029', () => {
  it('is the derivation, and never carries the clause it replaced', () => {
    const view = viewOn(openWeek('c1'));
    expect(view.pressDays.lede).toBe(pressDayLedeOf());
    /*
     * G6: *while the car is away* was measured false on four of seven rows and went on the commit
     * that derived this; no span-shaped phrase may come back unless the derivation writes it.
     */
    for (const phrase of ['while the car is away', 'any time', 'during']) {
      expect(view.pressDays.lede.includes(phrase), phrase).toBe(false);
    }
  });

  it('names the shortest admitted window in words, and moves when a window does', () => {
    const windows = CONTRACT_LADDER.rows
      .filter((row) => admittedPressDayIds().includes(row.contractId))
      .map((row) => row.pressDay?.call?.windowS ?? 0);
    const minutes = Math.floor(Math.min(...windows) / 60);
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    expect(pressDayLedeOf()).toContain(minutes === 1 ? 'the minute after' : `the ${String(words[minutes])} minutes after`);
    /* Edge: a ladder whose shortest admitted window is exactly the floor says two minutes. */
    const narrowed = {
      ...CONTRACT_LADDER,
      rows: CONTRACT_LADDER.rows.map((row) =>
        row.pressDay?.call === undefined
          ? row
          : { ...row, pressDay: { ...row.pressDay, call: { ...row.pressDay.call, windowS: 120, holes: [130] } } },
      ),
    };
    expect(pressDayLedeOf(narrowed)).toContain('the two minutes after');
    /* And a ladder with nothing admitted says so rather than promising a window. */
    const none = { ...CONTRACT_LADDER, rows: CONTRACT_LADDER.rows.map((row) => ({ ...row, pressDay: undefined })) };
    expect(pressDayLedeOf(none)).toBe(PRESS_DAY_CHOICE_COPY.ledeNone);
  });
});
