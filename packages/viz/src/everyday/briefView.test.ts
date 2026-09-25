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

import { BRIEF_WAY_THROUGH_HEADING, briefScreenViewOf, lockedForScore, raceAgainstCard, RECOMMENDED_CARDS,
  SANDBOX_DOOR_LABEL,
} from './briefView.js';
import { GHOST_OPTIONS } from '../live/raceStrip.js';
import { isScreenBuilt } from './screens.js';
import type { TodayRecord } from './today.js';

const TODAY: TodayRecord = {
  day: 3,
  weekday: 'Wednesday',
  /* § D871's whole-day holds; this fixture's day holds no car. */
  heldCarIds: [],
  dayLabel: 'WEDNESDAY · DAY 3',
  towerName: 'Chancery House',
  lede: 'Fourteen floors and three lifts.',
  wrinkle: {
    id: 'move-in',
    name: 'Move-in day',
    note: 'One car is tied up for the first two thirds of the shift.',
  } as TodayRecord['wrinkle'],
  wrinkleName: 'Move-in day',
  wrinkleNote: 'One car is tied up for the first two thirds of the shift.',
  outOfService: { mootUnder: undefined, badge: 'car-c', sentence: 'Car car-c is out of service today.' },
  facts: [{ label: 'Floors', value: '14 above ground' }],
  load: { word: '590 per working car', note: '1,180 people and 2 working cars today, as the building is configured. The day shows whether that is comfortable; this plate does not grade it.' },
  asks: ['Carry 90% of the people who turn up', 'Nobody waits longer than 120 s'],
  seedLine: 'tower chancery-house · crowd 424242 · today’s date, so everyone playing today meets this crowd',
  crowdIsToday: true,
  crowdIsPinned: false,
  firstSessionLine: undefined,
  dayLength: undefined,
  driver: 'Steady hand',
  driverHeld: undefined,
  wayThrough: undefined,
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

describe('LOCKED FOR SCORE says whose crowd it is, the way the seed line does — post-AH panel D.md', () => {
  /*
   * A pinned press day plays the pin's crowd, and the card read *"The crowd is the day's"* directly
   * under a seed line reading *"a crowd of this run's own, not the day's"*. Both arms, each against
   * the seed line of the same record, so the two cannot come apart again on either kind of day.
   */
  it('names the day’s crowd on a day that has it, and does not on one that does not', () => {
    const daily = briefScreenViewOf({ today: TODAY, dispatchers: DISPATCHERS, savedIds: [], selectedId: 'collective' });
    expect(daily.seedLine).toContain('today’s date');
    expect(daily.locked.what).toMatch(/^The crowd is the day’s/u);

    const own: TodayRecord = {
      ...TODAY,
      seedLine: 'tower crown-hotel · crowd 20268743 · a crowd of this run’s own, not the day’s',
      crowdIsToday: false,
    };
    const pinned = briefScreenViewOf({ today: own, dispatchers: DISPATCHERS, savedIds: [], selectedId: 'collective' });
    expect(pinned.locked.what).not.toMatch(/crowd is the day’s/u);
    expect(pinned.locked.what).toContain('this run’s own rather than the day’s');
    /* What is locked and what changing it costs are the same sentence on both kinds of day. */
    expect(pinned.locked.what).toContain('the run just stops counting');
    expect(pinned.locked.why).toBe(daily.locked.why);
  });
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

describe('the two cards this build states rather than draws as a live control', () => {
  /**
   * **This case used to assert the refusal, and the refusal is what changed** — GitHub issue #226,
   * § D482.
   *
   * It read `expect(GHOST_REFUSAL.why).toMatch(/one run at a time/)`, which was true copy over a
   * build that ran one simulation at a time and became § D227's stale refusal the moment § 7's
   * stage grew a ghost picker. So the assertions are turned round and pinned to the **registry**,
   * the way the card beside it already is: the stage is built ⇒ the card says where the control is
   * and carries no *not built* clause. Neither half of that is a sentence compared against another
   * sentence.
   *
   * The caveat is asserted **unchanged**, and that is the substantive claim here. It was kept
   * verbatim through the refusing years for exactly this day, and CLAUDE.md's own rule is why: one
   * day each on the same crowd is n = 1, and nothing this product draws may read as a verdict about
   * a dispatcher. A race that shipped and quietly dropped its caveat would be the acceptance
   * criterion met and the discipline lost.
   */
  it('says where the race is now that there is one, and keeps § 6.2’s caveat verbatim', () => {
    const card = raceAgainstCard();
    expect(isScreenBuilt('stage')).toBe(true);
    expect(card.what).toMatch(/second dispatcher/);
    /* § D1047: the rival drives this run's crowd, which on a pinned first day is not today's. */
    expect(card.what).toContain('a second copy of this run’s crowd');
    expect(card.what).not.toMatch(/today’s crowd|today's crowd/u);
    expect(card.why).toMatch(/on the stage/);
    expect(card.why).not.toMatch(/one run at a time/);
    expect(card.why).not.toMatch(/[Nn]ot (built|here)/);
    expect(card.caveat).toBe('One day each is a race, not proof. The test bench settles it properly.');
  });

  /**
   * And the `what` names only the arms that exist — § D227 with its polarity reversed.
   *
   * The card used to offer *"the world's middle, your best, the plain baseline, or nobody"*. Two of
   * those are still not on offer (the world's middle needs a distribution nothing posts to —
   * GitHub issue #327), and a card that had started working while still promising them would be the
   * same defect this rewrite closes, pointed the other way. Pinned against `GHOST_OPTIONS` rather
   * than against a literal, so an arm that lands is an arm this case makes somebody mention.
   */
  it('promises exactly the arms the picker offers, and not the two it does not', () => {
    const card = raceAgainstCard();
    expect(card.what).toContain('plain baseline');
    expect(card.what).toContain('latest saved');
    expect(card.what).toContain('nobody');
    expect(card.what).not.toMatch(/world’s middle|world's middle/);
    for (const option of GHOST_OPTIONS) {
      const noun = option.id === 'none' ? 'nobody' : option.label.replace(/^(the|your) /u, '');
      expect(card.what.toLowerCase()).toContain(noun.toLowerCase());
    }
  });

  it('opens the sandbox rather than refusing it, because § 3.3’s tuner is built', () => {
    /*
     * **This case used to assert the opposite**, and the way it did is the finding rather than the
     * copy. It read `expect(card.why).toContain(UNBUILT_REASONS.tuner)` beside a card built with
     * `` `…${UNBUILT_REASONS.tuner ?? 'the tuner screen is not built'}` `` — so on the merge that
     * registered `everyday/tunerScreen.ts` the key vanished, the card's `??` fallback took over,
     * and this assertion would have compared a string against `undefined`. Neither half would have
     * said the true thing: the card refuses a screen a player can open (§ D227), and the test can
     * only notice by accident.
     *
     * So the pair is asserted against the **registry**, both ways, which is the thing that actually
     * decides it: built ⇒ a door and no refusal; unbuilt ⇒ the registry's own sentence and no door.
     */
    const card = lockedForScore(true);
    expect(isScreenBuilt('tuner')).toBe(true);
    expect(card.door).toEqual({ label: SANDBOX_DOOR_LABEL, screen: 'tuner' });
    expect(card.why).toContain('sandbox day');
    expect(card.why).not.toMatch(/not built/);
  });

  it('names a state rather than a destination on the door — GitHub issue #225, § D496', () => {
    /*
     * Sandbox is a week on no assignment, arrived at and never chosen: no ninth PlayMode, no toggle,
     * no screen. A door reading *Take it to the sandbox* was the one surface of five that named a
     * destination, and no honesty property can see that class, so it is held here. The label says
     * what changing does, and the card's reason names the state in the word the tuner's own strip
     * uses on the far side of the door.
     */
    const card = lockedForScore(true);
    expect(card.door?.label).toBe(SANDBOX_DOOR_LABEL);
    expect(card.door?.label).not.toMatch(/take it to|go to|open the|enter the/iu);
    expect(card.door?.label).toMatch(/stops counting/u);
    expect(card.why).toMatch(/sandbox day/u);
  });

  it('carries no refusal sentence it could not have produced — the `??` fallback is gone', () => {
    /*
     * `screens.ts` imports this screen's module, which imports this file — a module-level read
     * resolves to `undefined` on whichever file the cycle is entered second. `types.ts`'s
     * `ENGINEER_SWAP_REFUSAL` docstring is that defect's own history, one directory over, and it is
     * why `lockedForScore` is a function. The consequence is now stronger than *not `undefined`*:
     * the refusing arm calls `unbuiltReasonFor`, which **throws** on a built key, so a card that
     * refused today could not have been constructed at all.
     */
    expect(lockedForScore(true).why).not.toContain('undefined');
    expect(viewOf().locked.why).not.toContain('undefined');
    expect(viewOf().locked.door?.screen).toBe('tuner');
    /*
     * The ghost card is the other shape and stays it — a statement with nowhere to send anybody.
     * Deliberately, and not because the screen is missing: the race is on the stage, and § 3.3's
     * own primary row on this very screen already goes there. `raceAgainstCard`'s docstring is the
     * argument; this is the pin, and it is asserted beside `isScreenBuilt('stage')` so that *no
     * door* can never again be read as *no screen*.
     */
    expect(isScreenBuilt('stage')).toBe(true);
    expect(raceAgainstCard().door).toBeUndefined();
  });
});

describe('everything else on the card is the day record’s, unedited', () => {
  it('quotes the wrinkle rather than re-wording it, and says everyone gets the same one', () => {
    const view = viewOf();
    expect(view.wrinkle.title).toBe(TODAY.wrinkle.name);
    // The day record's note as the brief prints it — `wrinkleNoteOf`, § D983 — which is the event's
    // own note on a day the tower books nothing.
    expect(view.wrinkle.body).toBe(TODAY.wrinkleNote);
    expect(view.wrinkle.body).toBe(TODAY.wrinkle.note);
    expect(view.wrinkle.shared).toMatch(/same one, at the same point/);
  });

  it('carries the facts, the load reading and the strip straight through', () => {
    const view = viewOf();
    expect(view.facts).toBe(TODAY.facts);
    expect(view.load?.word).toBe('590 per working car');
    expect(view.outOfService?.badge).toBe('car-c');
    expect(view.seedLine).toBe(TODAY.seedLine);
  });

  it('draws what today asks as the day’s questions, and says nothing is graded too early', () => {
    const view = viewOf();
    expect(view.asks.rows).toEqual(TODAY.asks);
    expect(view.asks.note).toMatch(/twenty people/);
  });

  it('carries the week census’s sentence under its own heading, and nothing where the record has none (§ D1067)', () => {
    expect(viewOf().wayThrough).toBeUndefined();
    const sentence = 'No standing order or press we measured cleared this day on 20 crowds.';
    const view = briefScreenViewOf({
      today: { ...TODAY, wayThrough: sentence },
      dispatchers: DISPATCHERS,
      savedIds: [],
      selectedId: 'collective',
    });
    expect(view.wayThrough).toEqual({ heading: BRIEF_WAY_THROUGH_HEADING, sentence });
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
