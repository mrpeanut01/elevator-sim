/**
 * **The Everyday slot's four claims**: the curated six are § 15.1's, the persistence refuses in
 * both directions the way `persist/session.ts` taught, the store is the one place a name change
 * becomes visible — which is what § 20.15's no-reload rail update stands on — and, since GitHub
 * issue #224, what a player earns survives the tab and says so when it cannot.
 *
 * The progress half is asserted here rather than only in the browser tier because the two tiers
 * answer different questions. This file answers *what does the slot do with these bytes* — a
 * version-1 envelope, a corrupt one, an oversized write — which needs fabricated stores no player
 * can produce on demand. `everyday/progress.browser.test.ts` answers the one thing this file
 * structurally cannot: that solving a building and **reloading the page** brings the badge back.
 * A round trip inside one process proves serialisation and not survival.
 */

import { describe, expect, it } from 'vitest';

import { savedRatingOf, type LadderEntry } from '../gauntlet/ladder.js';
import { ratingOf, type RatedCase } from '../gauntlet/rating.js';
import { displayNameIssueOf } from '../menu/account.js';
import type { SessionStore } from '../persist/types.js';

import {
  AVATAR_SWATCHES,
  avatarInitialOf,
  createProfileStore,
  DEFAULT_EVERYDAY_PROFILE,
  EMPTY_EVERYDAY_PROGRESS,
  everydayProgressWith,
  loadProfile,
  loadProgress,
  PROGRESS_BUDGET_CHARACTERS,
  PROGRESS_REFUSALS,
  saveEveryday,
  solvedCaseSetOf,
  type EverydayProgress,
} from './profile.js';

/** A working backing slot. */
function memoryBacking(): SessionStore & { readonly slots: Map<string, string> } {
  const slots = new Map<string, string>();
  return {
    slots,
    read: (key) => slots.get(key) ?? null,
    write: (key, value) => {
      slots.set(key, value);
    },
    remove: (key) => {
      slots.delete(key);
    },
  };
}

/** A browser whose storage refuses to be touched — every method throws, as the real one may. */
const refusingBacking: SessionStore = {
  read: () => {
    throw new Error('storage denied');
  },
  write: () => {
    throw new Error('storage denied');
  },
  remove: () => {
    throw new Error('storage denied');
  },
};

describe('the curated six', () => {
  it('is § 15.1’s list — sun, terracotta, moss, sky, ochre, slate — in the prototype’s order', () => {
    expect(AVATAR_SWATCHES.map((swatch) => swatch.id)).toEqual([
      'sun',
      'terracotta',
      'moss',
      'sky',
      'ochre',
      'slate',
    ]);
    expect(AVATAR_SWATCHES.map((swatch) => swatch.color)).toEqual([
      '#F2A63B',
      '#B8462B',
      '#4F8A5B',
      '#4E9DD8',
      '#8D6A2F',
      '#5F7268',
    ]);
  });

  it('starts a player as the prototype’s own `you`, on sun', () => {
    expect(DEFAULT_EVERYDAY_PROFILE).toEqual({ name: 'you', avatarColor: '#F2A63B' });
  });
});

describe('the initial on the disc', () => {
  it('is the first alphanumeric character, uppercased — the prototype’s own derivation', () => {
    expect(avatarInitialOf('you')).toBe('Y');
    expect(avatarInitialOf('Nadia R.')).toBe('N');
    // Leading punctuation is skipped, which a bare `name[0]` would not do.
    expect(avatarInitialOf('...jo')).toBe('J');
  });

  it('falls back to Y rather than drawing an empty disc', () => {
    expect(avatarInitialOf('—')).toBe('Y');
  });
});

describe('persistence, both directions', () => {
  it('round-trips a profile through the slot', () => {
    const backing = memoryBacking();
    const profile = { name: 'Nadia R.', avatarColor: '#4F8A5B' };
    expect(saveEveryday(backing, profile, EMPTY_EVERYDAY_PROGRESS).ok).toBe(true);
    expect(loadProfile(backing)).toEqual(profile);
  });

  it('answers undefined for an empty slot, and false for a write the store refuses', () => {
    expect(loadProfile(memoryBacking())).toBeUndefined();
    expect(loadProfile(refusingBacking)).toBeUndefined();
    expect(
      saveEveryday(refusingBacking, DEFAULT_EVERYDAY_PROFILE, EMPTY_EVERYDAY_PROGRESS).ok,
    ).toBe(false);
  });

  it('refuses bytes that do not parse, and a version this build does not know', () => {
    const backing = memoryBacking();
    backing.slots.set('elevator-sim.everyday-profile', 'not json');
    expect(loadProfile(backing)).toBeUndefined();
    /*
     * **Version 3, not version 2** — and the change is the point rather than an edit to keep a case
     * green. This assertion read `schemaVersion: 2` from the day it was written, because 2 was the
     * first unknown shape. Issue #224 made 2 the shape this build *writes*, so the unreadable one
     * moved up by one. The claim is unchanged: a version outside
     * `PROFILE_SCHEMA_VERSIONS_READ` is refused rather than guessed at.
     */
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 3, profile: DEFAULT_EVERYDAY_PROFILE }),
    );
    expect(loadProfile(backing)).toBeUndefined();
    // And in the other direction: version 0 is older than anything this build reads.
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 0, profile: DEFAULT_EVERYDAY_PROFILE }),
    );
    expect(loadProfile(backing)).toBeUndefined();
  });

  it('refuses a colour outside the curated six and a name the display-name rule refuses', () => {
    const backing = memoryBacking();
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 1, profile: { name: 'fine', avatarColor: '#000000' } }),
    );
    expect(loadProfile(backing)).toBeUndefined();
    /*
     * The gate is `menu/account.ts`'s own — asserted through it rather than through a copy of its
     * regex, so the two cannot drift: a name the account screen would refuse is a name this
     * module will not restore.
     */
    const controlName = 'a\nb';
    expect(displayNameIssueOf(controlName)).toBeDefined();
    backing.slots.set(
      'elevator-sim.everyday-profile',
      JSON.stringify({ schemaVersion: 1, profile: { name: controlName, avatarColor: '#F2A63B' } }),
    );
    expect(loadProfile(backing)).toBeUndefined();
  });

  it('does not clear a refused slot — a refusal is evidence, and the next save overwrites anyway', () => {
    const backing = memoryBacking();
    backing.slots.set('elevator-sim.everyday-profile', 'not json');
    loadProfile(backing);
    expect(backing.slots.get('elevator-sim.everyday-profile')).toBe('not json');
  });
});

describe('the live store', () => {
  it('restores from its backing at creation', () => {
    const backing = memoryBacking();
    saveEveryday(
      backing,
      { name: 'Nadia R.', avatarColor: '#5F7268' },
      EMPTY_EVERYDAY_PROGRESS,
    );
    const store = createProfileStore(backing);
    expect(store.current()).toEqual({ name: 'Nadia R.', avatarColor: '#5F7268' });
  });

  it('notifies every subscriber on set, and stops after unsubscribe', () => {
    const store = createProfileStore(memoryBacking());
    let heard = 0;
    const stop = store.subscribe(() => {
      heard += 1;
    });
    expect(store.set({ name: 'Nadia R.', avatarColor: '#F2A63B' })).toBe(true);
    expect(heard).toBe(1);
    expect(store.current()?.name).toBe('Nadia R.');
    stop();
    store.set({ name: 'Someone else', avatarColor: '#F2A63B' });
    expect(heard).toBe(1);
  });

  it('works memory-only when the browser grants no storage — and says so through set’s answer', () => {
    const store = createProfileStore(undefined);
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    // `false` is the honest answer the settings screen turns into a sentence: the profile is
    // changed everywhere in this document, and it will not survive the tab.
    expect(store.set({ name: 'Nadia R.', avatarColor: '#B8462B' })).toBe(false);
    expect(store.current()).toEqual({ name: 'Nadia R.', avatarColor: '#B8462B' });
    expect(heard).toBe(1);
  });
});

/* -------------------------------------------------------------------------- *
 * What a player earns — GitHub issue #224
 * -------------------------------------------------------------------------- */

const SLOT = 'elevator-sim.everyday-profile';

/** One rated case, with everything R13 and invariant 5 want on it. */
function ratedCase(index: number, score: number | null): RatedCase {
  return {
    caseId: `case-${String(index)}`,
    buildingId: `tower-${String(index)}`,
    crowdId: 'crowd',
    seed: `seed-${String(index)}`,
    score,
    noScoreReason: score === null ? 'nobody was carried in this case' : null,
  };
}

/** A finished ladder entry over `count` cases, all scored. */
function entry(dispatcherId: string, count: number): LadderEntry {
  const cases = Array.from({ length: count }, (_unused, index) => ratedCase(index, 90 - index));
  return {
    dispatcherId,
    dispatcherName: `${dispatcherId} by hand`,
    isReference: false,
    fingerprint: 'waitTime=1,stopCount=2',
    summary: ratingOf(cases, count),
  };
}

describe('the slot keeps what a player earns — issue #224', () => {
  it('round-trips solved buildings and ratings through the one slot', () => {
    const backing = memoryBacking();
    const progress: EverydayProgress = {
      solvedCaseIds: ['leaky-lobby', 'slow-morning'],
      ratings: [savedRatingOf(entry('mine', 40))],
    };
    expect(saveEveryday(backing, DEFAULT_EVERYDAY_PROFILE, progress)).toEqual({
      ok: true,
      notice: null,
    });
    const back = loadProgress(backing);
    expect(back.notice).toBeNull();
    expect([...solvedCaseSetOf(back.progress)].sort()).toEqual(['leaky-lobby', 'slow-morning']);
    expect(back.progress.ratings).toHaveLength(1);
    // Invariant 5 through the round trip: every stored case still names the seed it ran under.
    expect(back.progress.ratings[0]?.cases.every((one) => one.seed !== '')).toBe(true);
  });

  it('says nothing at all about a slot nobody has written — an absence is not a refusal', () => {
    const back = loadProgress(memoryBacking());
    expect(back.progress).toEqual(EMPTY_EVERYDAY_PROGRESS);
    // The one path that answers empty **and** stays silent. Everything else owes the player words.
    expect(back.notice).toBeNull();
  });

  it('holds one rating per dispatcher, replacing rather than appending', () => {
    const first = everydayProgressWith(EMPTY_EVERYDAY_PROGRESS, savedRatingOf(entry('a', 40)));
    const second = everydayProgressWith(first, savedRatingOf(entry('b', 40)));
    const again = everydayProgressWith(second, savedRatingOf(entry('a', 12)));
    expect(again.ratings.map((rating) => rating.dispatcherId).sort()).toEqual(['a', 'b']);
    // The replacement is the *new* claim, not the old one kept beside it.
    expect(again.ratings.find((rating) => rating.dispatcherId === 'a')?.casesTotal).toBe(12);
  });
});

describe('the version 1 → 2 migration', () => {
  /** What the build before issue #224 wrote: a version, and a profile, and no third key. */
  function versionOneSlot(): SessionStore & { readonly slots: Map<string, string> } {
    const backing = memoryBacking();
    backing.slots.set(
      SLOT,
      JSON.stringify({ schemaVersion: 1, profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' } }),
    );
    return backing;
  }

  it('keeps the name and picture a previous build saved', () => {
    // The whole cost of the migration to a player who had one: nothing.
    expect(loadProfile(versionOneSlot())).toEqual({ name: 'Nadia R.', avatarColor: '#4F8A5B' });
  });

  it('reads a version 1 envelope as a player who had earned nothing, and says nothing about it', () => {
    /*
     * The absence **determines** the value rather than leaving it open — `persist/session.ts`'s
     * test for whether an older envelope may be read at all. Under version 1 the solved set lived
     * in `fixitScreen.ts`'s module scope and the ratings in `boardScreen.ts`'s, and both ended with
     * the tab, so at the instant those bytes were written there was no progress to record.
     *
     * And the notice is `null`: a migrated envelope is not a refusal, and telling that player their
     * progress could not be read would be a false statement about a build that kept none.
     */
    const back = loadProgress(versionOneSlot());
    expect(back.progress).toEqual(EMPTY_EVERYDAY_PROGRESS);
    expect(back.notice).toBeNull();
  });

  it('leaves the version 1 bytes alone until something is written', () => {
    const backing = versionOneSlot();
    const before = backing.slots.get(SLOT);
    loadProgress(backing);
    loadProfile(backing);
    expect(backing.slots.get(SLOT)).toBe(before);
  });

  it('carries the migrated profile into the version 2 envelope the next write produces', () => {
    /*
     * The half a migration usually gets wrong: reading the old shape is not the same as *keeping*
     * what it held. A player who saved a name under version 1 and then solves a building must have
     * both afterwards, and the write that stores the building is the one that could lose the name.
     */
    const backing = versionOneSlot();
    const store = createProfileStore(backing);
    expect(store.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] })).toBe(true);
    expect(JSON.parse(backing.slots.get(SLOT) ?? '{}')).toEqual({
      schemaVersion: 2,
      profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' },
      progress: { solvedCaseIds: ['leaky-lobby'], ratings: [] },
    });
    expect(loadProfile(backing)).toEqual({ name: 'Nadia R.', avatarColor: '#4F8A5B' });
  });
});

describe('a store this build cannot read degrades to a labelled refusal', () => {
  /** Every corrupting shape, and the sentence a player meets for it. */
  const CORRUPTIONS: readonly (readonly [string, string, string])[] = [
    ['bytes that are not JSON at all', 'not json', PROGRESS_REFUSALS.parse],
    [
      'a version this build does not read',
      JSON.stringify({ schemaVersion: 3, profile: DEFAULT_EVERYDAY_PROFILE, progress: {} }),
      PROGRESS_REFUSALS.version,
    ],
    [
      'an envelope with no progress key at version 2',
      JSON.stringify({ schemaVersion: 2, profile: DEFAULT_EVERYDAY_PROFILE }),
      PROGRESS_REFUSALS.shape,
    ],
    [
      'a solved list that is not a list of ids',
      JSON.stringify({
        schemaVersion: 2,
        profile: DEFAULT_EVERYDAY_PROFILE,
        progress: { solvedCaseIds: [7], ratings: [] },
      }),
      PROGRESS_REFUSALS.shape,
    ],
    [
      'a rating whose cases lost their seeds — invariant 5',
      JSON.stringify({
        schemaVersion: 2,
        profile: DEFAULT_EVERYDAY_PROFILE,
        progress: {
          solvedCaseIds: [],
          ratings: [
            {
              ...savedRatingOf(entry('mine', 2)),
              cases: [{ ...ratedCase(0, 90), seed: '' }],
            },
          ],
        },
      }),
      PROGRESS_REFUSALS.shape,
    ],
  ];

  for (const [what, bytes, sentence] of CORRUPTIONS) {
    it(`answers empty **and** says so for ${what}`, () => {
      const backing = memoryBacking();
      backing.slots.set(SLOT, bytes);
      const back = loadProgress(backing);
      // The half that is not enough on its own. An empty progress is exactly what a player who
      // has done nothing sees, so the assertion below is the one that matters.
      expect(back.progress).toEqual(EMPTY_EVERYDAY_PROGRESS);
      expect(back.notice).toBe(sentence);
      // A refusal is evidence — the bytes are still there for a build that can read them.
      expect(backing.slots.get(SLOT)).toBe(bytes);
    });
  }

  it('refuses whole rather than salvaging the half it can read', () => {
    /*
     * The solved ids in these bytes are perfectly readable. Restoring them beside an unreadable
     * ratings list would show the player a part of a career with nothing saying a part is missing —
     * which is the quiet-repair defect the whole-envelope rule exists to refuse.
     */
    const backing = memoryBacking();
    backing.slots.set(
      SLOT,
      JSON.stringify({
        schemaVersion: 2,
        profile: DEFAULT_EVERYDAY_PROFILE,
        progress: { solvedCaseIds: ['leaky-lobby'], ratings: ['not a rating'] },
      }),
    );
    const back = loadProgress(backing);
    expect(back.progress.solvedCaseIds).toEqual([]);
    expect(back.notice).toBe(PROGRESS_REFUSALS.shape);
  });

  it('says so when the browser will not let it read at all', () => {
    const back = loadProgress(refusingBacking);
    expect(back.progress).toEqual(EMPTY_EVERYDAY_PROGRESS);
    expect(back.notice).toBe(PROGRESS_REFUSALS.unavailable);
  });

  it('keeps a solved id for a case this build no longer ships, and does not refuse over it', () => {
    /*
     * The one thing that is **not** refused, and the reason is `fixitCaseRailModel`: every row and
     * the `{fixed}/{total}` count are derived from the loaded case file, so an id with no case
     * matches nothing and inflates nothing. Refusing the set over a catalogue edit would lose a
     * player's afternoon to a data change they did not make.
     */
    const backing = memoryBacking();
    expect(
      saveEveryday(backing, DEFAULT_EVERYDAY_PROFILE, {
        solvedCaseIds: ['a-case-no-build-ships'],
        ratings: [],
      }).ok,
    ).toBe(true);
    const back = loadProgress(backing);
    expect(back.notice).toBeNull();
    expect(back.progress.solvedCaseIds).toEqual(['a-case-no-build-ships']);
  });
});

describe('a store past its budget refuses before it writes', () => {
  /** Progress deliberately over {@link PROGRESS_BUDGET_CHARACTERS}, built from real ratings. */
  function oversized(): EverydayProgress {
    let progress = EMPTY_EVERYDAY_PROGRESS;
    for (let index = 0; JSON.stringify(progress).length <= PROGRESS_BUDGET_CHARACTERS; index += 1) {
      progress = everydayProgressWith(progress, savedRatingOf(entry(`d-${String(index)}`, 40)));
    }
    return progress;
  }

  it('leaves the previous save exactly where it was, and names what was too big', () => {
    const backing = memoryBacking();
    const kept: EverydayProgress = { solvedCaseIds: ['leaky-lobby'], ratings: [] };
    expect(saveEveryday(backing, DEFAULT_EVERYDAY_PROFILE, kept).ok).toBe(true);
    const before = backing.slots.get(SLOT);

    const refused = saveEveryday(backing, DEFAULT_EVERYDAY_PROFILE, oversized());
    expect(refused.ok).toBe(false);
    /*
     * The ordering is the whole value of the budget: one slot, and `write` replaces it whole, so a
     * refusal that came *after* the write would have deleted the save it was declining to add to.
     */
    expect(backing.slots.get(SLOT)).toBe(before);
    expect(loadProgress(backing).progress.solvedCaseIds).toEqual(['leaky-lobby']);
  });

  it('says the two counts, the size and the ceiling, so the sentence can be acted on', () => {
    const progress = oversized();
    const refused = saveEveryday(memoryBacking(), DEFAULT_EVERYDAY_PROFILE, progress);
    const notice = refused.notice ?? '';
    expect(notice).toContain(`${String(progress.ratings.length)} ratings`);
    expect(notice).toContain(`${String(PROGRESS_BUDGET_CHARACTERS)}`);
    expect(notice).toContain('What was saved before is untouched');
    // Never a bare `undefined` on screen, and never a refusal with no number in it.
    expect(notice).toMatch(/\d/);
  });

  it('accepts a payload one character under the ceiling — the gate is the size, not the shape', () => {
    /*
     * The positive control. Without it the two cases above would pass against a `saveEveryday`
     * that refused everything, which is a budget with the limit set to zero.
     */
    const backing = memoryBacking();
    const under: EverydayProgress = {
      solvedCaseIds: ['x'.repeat(PROGRESS_BUDGET_CHARACTERS - 100)],
      ratings: [],
    };
    expect(JSON.stringify(under).length).toBeLessThan(PROGRESS_BUDGET_CHARACTERS);
    expect(saveEveryday(backing, DEFAULT_EVERYDAY_PROFILE, under).ok).toBe(true);
  });
});

describe('the live store’s progress half', () => {
  it('restores at creation and hands both writers one slot', () => {
    const backing = memoryBacking();
    const first = createProfileStore(backing);
    first.set({ name: 'Nadia R.', avatarColor: '#4F8A5B' });
    first.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] });

    // A second store over the same backing is what the next page load is.
    const next = createProfileStore(backing);
    expect(next.current()).toEqual({ name: 'Nadia R.', avatarColor: '#4F8A5B' });
    expect(next.progress().solvedCaseIds).toEqual(['leaky-lobby']);
    expect(next.progressNotice()).toBeNull();
  });

  it('does not let a name change delete progress, or a solved building delete a name', () => {
    /*
     * The failure a two-payload slot invites: one writer holds the value it is changing and
     * re-supplies the other from nothing. Asserted in **both** directions, because the two writers
     * are different functions and only one of them can be wrong at a time.
     */
    const backing = memoryBacking();
    const store = createProfileStore(backing);
    store.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] });
    store.set({ name: 'Nadia R.', avatarColor: '#B8462B' });
    expect(loadProgress(backing).progress.solvedCaseIds).toEqual(['leaky-lobby']);

    store.setProgress({ solvedCaseIds: ['leaky-lobby', 'slow-morning'], ratings: [] });
    expect(loadProfile(backing)).toEqual({ name: 'Nadia R.', avatarColor: '#B8462B' });
  });

  it('notifies subscribers on setProgress, as it does on set', () => {
    const store = createProfileStore(memoryBacking());
    let heard = 0;
    store.subscribe(() => {
      heard += 1;
    });
    store.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] });
    expect(heard).toBe(1);
  });

  it('carries the restore’s refusal until a write replaces it, then says nothing', () => {
    const backing = memoryBacking();
    backing.slots.set(SLOT, 'not json');
    const store = createProfileStore(backing);
    expect(store.progressNotice()).toBe(PROGRESS_REFUSALS.parse);
    // The successful write really has replaced the unreadable bytes, so there is nothing left to
    // say — a notice that outlived its cause would be the stale refusal § D227 is about.
    expect(store.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] })).toBe(true);
    expect(store.progressNotice()).toBeNull();
    expect(loadProgress(backing).progress.solvedCaseIds).toEqual(['leaky-lobby']);
  });

  it('answers false and says why on a store that refuses writes', () => {
    const store = createProfileStore(refusingBacking);
    expect(store.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] })).toBe(false);
    expect(store.progressNotice()).toContain('until this tab closes');
    // Changed in memory all the same: the screen must show the badge it has just earned.
    expect(store.progress().solvedCaseIds).toEqual(['leaky-lobby']);
  });

  it('tells a page with no storage at all that nothing is being kept', () => {
    const store = createProfileStore(undefined);
    expect(store.progress()).toEqual(EMPTY_EVERYDAY_PROGRESS);
    expect(store.progressNotice()).toContain('until this tab closes');
    expect(store.setProgress({ solvedCaseIds: ['leaky-lobby'], ratings: [] })).toBe(false);
  });
});
