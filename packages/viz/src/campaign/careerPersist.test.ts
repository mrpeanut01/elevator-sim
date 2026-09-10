/**
 * **The career survives a reload, and refuses in both directions** — GitHub issue #375.
 *
 * The unit half. The reload itself is driven in the browser tier, because the defect this closes is
 * a reload defect and a unit test cannot reload anything.
 */
import { describe, expect, it } from 'vitest';

import {
  CAREER_LOAD_NOTICES,
  CAREER_QUARANTINE_KEY,
  CAREER_SCHEMA_VERSION,
  CAREER_SCHEMA_VERSIONS_READ,
  CAREER_STORAGE_KEY,
  decodeCareer,
  encodeCareer,
} from './careerPersist.js';
import { openingCareer, type CampaignCareer } from './career.js';
import { goalsForDay, PENDING_DISPLAY, wasDisplayOf } from '../shift/goals.js';
import { createCareerStore } from '../everyday/careerStore.js';
import type { SessionStore } from '../persist/types.js';
import { SESSION_KEY } from '../persist/types.js';

describe('a career round-trips', () => {
  it('comes back as it went in — every field, not a sample', () => {
    const career = openingCareer('collective');
    const back = decodeCareer(encodeCareer(career));
    expect(back.refusal).toBeUndefined();
    expect(back.career).toEqual(career);
  });

  it('carries the fields a career is actually played with', () => {
    // Non-vacuity: `toEqual` on an opening career would pass over a codec that dropped everything
    // a *played* career accumulates. This one has been played.
    const played: CampaignCareer = {
      ...openingCareer('collective'),
      carry: 1420,
      today: 37,
      monthsWorked: 2,
      lost: 1,
      openTowerId: 'chancery-house',
      pendingBooking: { towerId: 'chancery-house', categoryId: 'machines', level: 2 },
    };
    const back = decodeCareer(encodeCareer(played));
    expect(back.career).toEqual(played);
    expect(back.career?.pendingBooking).toEqual(played.pendingBooking);
  });
});

describe('the envelope refuses in both directions', () => {
  it('refuses a version this build does not read, and says so', () => {
    const newer = JSON.stringify({
      version: CAREER_SCHEMA_VERSION + 1,
      career: openingCareer('collective'),
    });
    const back = decodeCareer(newer);
    expect(back.career).toBeUndefined();
    expect(back.refusal).toBe('version');
    expect(back.notice).toBe(CAREER_LOAD_NOTICES.version);
  });

  it('refuses a version below every one it reads', () => {
    const older = JSON.stringify({ version: 0, career: openingCareer('collective') });
    expect(decodeCareer(older).refusal).toBe('version');
  });

  it('reads every version in the read set, which is what makes the set load-bearing', () => {
    for (const version of CAREER_SCHEMA_VERSIONS_READ) {
      const raw = JSON.stringify({ version, career: openingCareer('collective') });
      expect(decodeCareer(raw).refusal, `version ${String(version)}`).toBeUndefined();
    }
  });

  it('refuses bytes that are not JSON, and bytes that are JSON but not a record', () => {
    expect(decodeCareer('{not json').refusal).toBe('unreadable');
    expect(decodeCareer('[1,2,3]').refusal).toBe('unreadable');
    expect(decodeCareer('"a string"').refusal).toBe('unreadable');
  });

  it('refuses a payload that is not the shape it claims, field by field', () => {
    const good = openingCareer('collective');
    const cases: readonly (readonly [string, unknown])[] = [
      ['carry missing', { ...good, carry: undefined }],
      ['today not a number', { ...good, today: 'seven' }],
      ['towers not an array', { ...good, towers: {} }],
      ['a tower missing its id', { ...good, towers: [{ buildingId: 'x', dispatcherId: 'y' }] }],
      ['openTowerId of the wrong type', { ...good, openTowerId: 4 }],
    ];
    for (const [label, career] of cases) {
      const raw = JSON.stringify({ version: CAREER_SCHEMA_VERSION, career });
      expect(decodeCareer(raw).refusal, label).toBe('shape');
    }
  });

  it('treats an empty slot as empty rather than as a fault, and tells the player nothing', () => {
    // A first-ever load has nothing to apologise for. A notice here would read as a failure.
    for (const empty of [null, '', '   ']) {
      const back = decodeCareer(empty);
      expect(back.refusal).toBe('empty');
      expect(back.notice).toBeUndefined();
    }
  });

  it('gives every refusal that is not `empty` a sentence naming what was kept', () => {
    // The refusal a player meets on a career must say the save was not deleted, because a blank
    // career screen reads as *your months are gone*.
    for (const [ground, notice] of Object.entries(CAREER_LOAD_NOTICES)) {
      expect(notice.trim(), ground).not.toBe('');
      /*
       * The promise the notices make is now *set aside*, not *not deleted* — because the first
       * draft's promise was false: the fallback career was saved over the refused bytes on the
       * player's next action. `careerStore.ts` moves them to the quarantine slot, which is what
       * makes this wording true.
       */
      expect(notice, ground).toMatch(/set aside rather than overwritten/iu);
    }
  });
});

describe('the week is authoritative for what happened on a day, and the career never fabricates one', () => {
  it('keeps its own slot — a career write cannot land in the session slot', () => {
    expect(CAREER_STORAGE_KEY).not.toBe(SESSION_KEY);
    expect(CAREER_QUARANTINE_KEY).not.toBe(CAREER_STORAGE_KEY);
    /*
     * Non-vacuity, and it is not decoration: the first draft of this case imported a constant that
     * does not exist, so it compared against `undefined` and passed over nothing. `tsc` caught it.
     */
    expect(SESSION_KEY).toBeTypeOf('string');
    expect(CAREER_STORAGE_KEY).toBeTypeOf('string');
  });

  it('withholds the `was` column when the week has no day the career is on', () => {
    /*
     * **This replaces a claim that was false.** The first draft asserted the two records "cannot
     * disagree". They can: `campaignModel.ts#campaignTestRows` joins the career's `tower.day`
     * against the week's `history` by day number, and the two slots carry independent versions and
     * independent refusals — a session-schema bump resets the week while the career restores.
     *
     * So the rule is not that they never disagree; it is what happens when they do. The week is
     * authoritative, and the career draws a withheld cell rather than inventing a reading from a
     * week that never happened.
     */
    const goal = goalsForDay(6)[0];
    expect(goal).toBeDefined();
    if (goal === undefined) return;
    // A career on contract day 6 beside a week with no history at all — the reset-week case.
    const withheld = wasDisplayOf([], 6, goal);
    expect(withheld).toBe(PENDING_DISPLAY);
    // Non-vacuity: the mark must not be a zero or a blank, which is what R3 is about.
    expect(withheld.trim()).not.toBe('');
    expect(withheld).not.toMatch(/^0/u);
  });

  it('decodes a career without consulting anything about a week', () => {
    const career = openingCareer('collective');
    expect(decodeCareer(encodeCareer(career)).career).toEqual(career);
    expect(encodeCareer(career)).not.toContain('week');
  });
});

describe('a refused load reaches the player, and keeps the bytes it promised to keep', () => {
  /**
   * A store over a memory backing, so the refusal path can be driven without a browser.
   *
   * This also gives `createEverydayHost`'s `careerStore` parameter its first non-default caller.
   * An independent review found it had none — every call site used the default — so the injection
   * seam the persistence rests on was exercised by nothing, which is this repository's own
   * standing defect (`CLAUDE.md`: name the non-test caller).
   */
  function backingWith(raw: string | null): { store: SessionStore; slots: Map<string, string> } {
    const slots = new Map<string, string>();
    if (raw !== null) slots.set(CAREER_STORAGE_KEY, raw);
    return {
      slots,
      store: {
        read: (key) => slots.get(key) ?? null,
        write: (key, value) => {
          slots.set(key, value);
        },
        remove: (key) => {
          slots.delete(key);
        },
      },
    };
  }

  it('sets the refused bytes aside instead of letting the next save eat them', () => {
    /*
     * The defect this closes, in one sentence: the notice promised the old save survived, and the
     * host's one writer saved the fallback career straight over it on the player's next action.
     */
    const original = JSON.stringify({ version: 99, career: openingCareer('collective') });
    const { store, slots } = backingWith(original);
    const career = createCareerStore(store);

    const load = career.load();
    expect(load.refusal).toBe('version');
    expect(load.notice).toBe(CAREER_LOAD_NOTICES.version);

    // The promise, kept: the bytes are somewhere a build that can read them will find them.
    expect(slots.get(CAREER_QUARANTINE_KEY)).toBe(original);

    // And now the thing that used to destroy them — the very next save.
    career.save(openingCareer('collective'));
    expect(slots.get(CAREER_STORAGE_KEY)).not.toBe(original);
    expect(slots.get(CAREER_QUARANTINE_KEY), 'the refused save was eaten').toBe(original);
  });

  it('clears both slots, and seals so the next save cannot write the career back', () => {
    /*
     * GitHub issue #229's criterion is not *removes the bytes* — it is *"Clear saved progress
     * works, **including preventing the running session from rewriting the store**"*. The host
     * holds the career in memory and saves it on the player's next action, so a `clear` that only
     * removed would be undone before the reload it is followed by.
     *
     * The quarantine slot goes with it: a refused career is still a career this device kept, and
     * the row's own words are *nothing this device kept survives*.
     */
    const original = JSON.stringify({ version: 99, career: openingCareer('collective') });
    const { store, slots } = backingWith(original);
    const career = createCareerStore(store);

    career.load(); // refused on version, so the bytes move to quarantine
    expect(slots.get(CAREER_QUARANTINE_KEY)).toBe(original);
    career.save(openingCareer('collective'));
    expect(slots.has(CAREER_STORAGE_KEY), 'nothing was saved to clear').toBe(true);

    career.clear();
    expect(slots.has(CAREER_STORAGE_KEY), 'the career survived the clear').toBe(false);
    expect(slots.has(CAREER_QUARANTINE_KEY), 'the quarantined career survived the clear').toBe(
      false,
    );

    // The seal, which is the half a removal alone does not buy.
    career.save(openingCareer('collective'));
    expect(
      slots.has(CAREER_STORAGE_KEY),
      'the running session wrote the career back after the clear — #229’s own criterion',
    ).toBe(false);
  });

  it('clears a memory-only store too, so a denied backing is not a career that outlives it', () => {
    // No backing is the storage-denied browser and every node test. `load` must read empty after.
    const career = createCareerStore(undefined);
    career.save(openingCareer('collective'));
    expect(career.load().refusal).toBeUndefined();
    career.clear();
    expect(career.load().refusal).toBe('empty');
    career.save(openingCareer('collective'));
    expect(career.load().refusal, 'the seal does not hold without a backing').toBe('empty');
  });

  it('sets nothing aside for an empty slot, which is not a refusal', () => {
    const { store, slots } = backingWith(null);
    expect(createCareerStore(store).load().refusal).toBe('empty');
    expect(slots.has(CAREER_QUARANTINE_KEY)).toBe(false);
  });

  it('survives a backing whose read throws, rather than killing the page at boot', () => {
    /*
     * `persist/types.ts` says every `SessionStore` method may throw, and a browser with site data
     * blocked throws on the *read*. The first draft guarded only the write, so this threw inside
     * `createEverydayHost` — and the page opens on Everyday Mode, so the whole shell died.
     */
    const throwing: SessionStore = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => {
        throw new Error('SecurityError');
      },
      remove: () => {
        throw new Error('SecurityError');
      },
    };
    const store = createCareerStore(throwing);
    expect(() => store.load()).not.toThrow();
    expect(store.load().refusal).toBe('empty');
    expect(() => {
      store.save(openingCareer('collective'));
    }).not.toThrow();
  });
});
