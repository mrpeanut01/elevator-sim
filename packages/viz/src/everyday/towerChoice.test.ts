/**
 * **The week's tower is a control** — GitHub issue **#587**, [§ D912](../../../../DECISIONS.md).
 *
 * The pure half. What is asserted here is what the *words* promise; that pressing a row moves the
 * week is `everyday/host.ts`'s and is proved on the built bundle by
 * `everyday/towerChoice.browser.test.ts`, because a picker that renders correctly and writes
 * nothing is the defect this whole module exists to close.
 */

import { describe, expect, it } from 'vitest';

import { CONTRACTS } from '../shift/contracts.js';
import { ladderRowFor } from '../shift/ladder.js';
import { openWeek } from '../shift/week.js';
import type { WeekState } from '../shift/types.js';

import { TOWER_CHOICE_COPY, towerChoiceViewOf } from './towerChoice.js';

const nameOf = (buildingId: string): string | undefined => `The ${buildingId} Building`;

function viewOn(week: WeekState, parked: readonly WeekState[] = []): ReturnType<typeof towerChoiceViewOf> {
  return towerChoiceViewOf({ week, parked, nameOf });
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
    const parked: readonly WeekState[] = [openWeek('c2'), openWeek('c3')];
    const view = viewOn(openWeek('c1'), parked);
    const promising = view.rows.filter((row) => row.arrival === 'resume').map((r) => r.contractId);
    expect(promising).toEqual(['c2', 'c3']);
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
      ...view.rows.flatMap((row) => [row.tower, row.teaches, row.arrivalNote]),
    ];
    for (const text of drawn) expect(text, text).not.toMatch(/\d/);
  });
});
