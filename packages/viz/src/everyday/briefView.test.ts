/**
 * The brief's words — GAMEPLAY § 6.2.
 *
 * Two properties, and both are about controls rather than about copy. The dispatcher count is
 * **derived from the rendered list** (§ 16 rule 5, whose own example is this counter — the
 * prototype hard-codes it, and the guide's note is that every hardcoded count in the prototype
 * eventually contradicted something). And the two cards this build cannot offer say what they
 * would be and why they are not, which is § D227's rule pointed at a refusal rather than at a
 * control.
 */

import { describe, expect, it } from 'vitest';

import { briefScreenViewOf, GHOST_REFUSAL, lockedForScore, RECOMMENDED_CARDS } from './briefView.js';
import { UNBUILT_REASONS } from './screens.js';
import type { TodayRecord } from './today.js';

const TODAY: TodayRecord = {
  day: 3,
  weekday: 'Wednesday',
  dayLabel: 'WEDNESDAY · DAY 3',
  towerName: 'Chancery House',
  lede: 'Fourteen floors and three lifts.',
  wrinkle: {
    id: 'move-in',
    name: 'Move-in day',
    note: 'One car is tied up for the first two thirds of the shift.',
  } as TodayRecord['wrinkle'],
  outOfService: { badge: 'car-c', sentence: 'Car car-c is out of service today.' },
  facts: [{ label: 'Floors', value: '14 above ground' }],
  load: { word: 'Busy', note: '590 people per working car today. Comfortable is around 400.' },
  asks: ['Carry 90% of the people who turn up', 'Nobody waits longer than 120 s'],
  seedLine: 'tower chancery-house · crowd 424242 · everyone identical',
  driver: 'Steady hand',
};

const DISPATCHERS = [
  { id: 'collective', name: 'Collective', description: 'Answers the nearest call. Simple.' },
  { id: 'eta', name: 'Estimated time', description: 'Prices the wait it would add.' },
  { id: 'nearest-car', name: 'Nearest car', description: 'Sends whoever is closest.' },
  { id: 'yours:morning', name: 'Morning Shift v3', description: 'Yours, from the workshop.' },
];

const viewOf = (selectedId = 'collective'): ReturnType<typeof briefScreenViewOf> =>
  briefScreenViewOf({
    today: TODAY,
    dispatchers: DISPATCHERS,
    savedIds: ['yours:morning'],
    selectedId,
  });

describe('who drives today', () => {
  it('derives the count from the rendered list — § 16 rule 5, never a literal', () => {
    expect(viewOf().drivers.count).toBe('4 to choose from · 1 of yours');
    // Change what is rendered and the count follows, which is the whole of the rule.
    const fewer = briefScreenViewOf({
      today: TODAY,
      dispatchers: DISPATCHERS.slice(0, 2),
      savedIds: [],
      selectedId: 'collective',
    });
    expect(fewer.drivers.count).toBe('2 to choose from · 0 of yours');
  });

  it('marks exactly one option as driving, and it is the standing selection', () => {
    const view = viewOf('eta');
    expect(view.drivers.options.filter((option) => option.selected)).toHaveLength(1);
    expect(view.drivers.options.find((option) => option.selected)?.id).toBe('eta');
    expect(view.drivers.options.find((option) => option.id === 'eta')?.meta).toBe('driving today');
    expect(view.drivers.options.find((option) => option.id === 'collective')?.meta).toBe(
      'tap to choose',
    );
  });

  it('recommends the head of the same list the dropdown carries, never a second list', () => {
    const view = viewOf();
    expect(view.drivers.cards).toHaveLength(RECOMMENDED_CARDS);
    expect(view.drivers.cards).toEqual(view.drivers.options.slice(0, RECOMMENDED_CARDS));
  });

  it('marks the reader’s own, so the dropdown can say *— yours*', () => {
    const view = viewOf();
    expect(view.drivers.options.filter((option) => option.mine).map((option) => option.id)).toEqual([
      'yours:morning',
    ]);
  });

  it('takes the first sentence of a blurb, and survives a profile with none', () => {
    expect(viewOf().drivers.options[0]?.blurb).toBe('Answers the nearest call.');
    const bare = briefScreenViewOf({
      today: TODAY,
      dispatchers: [{ id: 'x', name: 'X' }],
      savedIds: [],
      selectedId: 'x',
    });
    expect(bare.drivers.options[0]?.blurb).toBe('');
  });

  it('names the driver in § 3.3’s brief note', () => {
    expect(viewOf().barNote).toBe('Running the lifts: Steady hand');
  });
});

describe('the two cards this build states rather than offers', () => {
  it('says what the ghost would be, why it is not here, and keeps § 6.2’s caveat', () => {
    expect(GHOST_REFUSAL.what).toMatch(/second dispatcher/);
    expect(GHOST_REFUSAL.why).toMatch(/one run at a time/);
    // The caveat is the sentence that makes a race honest, and it is needed unchanged the day
    // one exists — so it is kept rather than dropped with the control.
    expect(GHOST_REFUSAL.caveat).toBe('One day each is a race, not proof. The test bench settles it properly.');
  });

  it('refuses the sandbox in `screens.ts`’ own words, so the two surfaces refuse once', () => {
    const card = lockedForScore();
    expect(card.why).toContain(UNBUILT_REASONS.tuner);
  });

  it('resolves the tuner refusal at call time, so an import cycle cannot make it `undefined`', () => {
    // `screens.ts` imports this screen's module, which imports this file — a module-level read
    // resolves to `undefined` on whichever file the cycle is entered second. `types.ts`'s
    // `ENGINEER_SWAP_REFUSAL` docstring is that defect's own history, one directory over.
    expect(lockedForScore().why).not.toContain('undefined');
    expect(viewOf().locked.why).not.toContain('undefined');
  });
});

describe('everything else on the card is the day record’s, unedited', () => {
  it('quotes the wrinkle rather than re-wording it, and says everyone gets the same one', () => {
    const view = viewOf();
    expect(view.wrinkle.title).toBe(TODAY.wrinkle.name);
    expect(view.wrinkle.body).toBe(TODAY.wrinkle.note);
    expect(view.wrinkle.shared).toMatch(/same one, at the same point/);
  });

  it('carries the facts, the load reading and the strip straight through', () => {
    const view = viewOf();
    expect(view.facts).toBe(TODAY.facts);
    expect(view.load?.word).toBe('Busy');
    expect(view.outOfService?.badge).toBe('car-c');
    expect(view.seedLine).toBe(TODAY.seedLine);
  });

  it('draws what today asks as the day’s questions, and says nothing is graded too early', () => {
    const view = viewOf();
    expect(view.asks.rows).toEqual(TODAY.asks);
    expect(view.asks.note).toMatch(/twenty people/);
  });

  it('drops the load panel rather than inventing one when the day record has none', () => {
    const view = briefScreenViewOf({
      today: { ...TODAY, load: undefined, outOfService: undefined },
      dispatchers: DISPATCHERS,
      savedIds: [],
      selectedId: 'collective',
    });
    expect(view.load).toBeUndefined();
    expect(view.outOfService).toBeUndefined();
  });
});
