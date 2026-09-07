/**
 * **The career survives a reload, and refuses in both directions** — GitHub issue #375.
 *
 * The unit half. The reload itself is driven in the browser tier, because the defect this closes is
 * a reload defect and a unit test cannot reload anything.
 */
import { describe, expect, it } from 'vitest';

import {
  CAREER_LOAD_NOTICES,
  CAREER_SCHEMA_VERSION,
  CAREER_SCHEMA_VERSIONS_READ,
  CAREER_STORAGE_KEY,
  decodeCareer,
  encodeCareer,
} from './careerPersist.js';
import { openingCareer, type CampaignCareer } from './career.js';
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
      expect(notice, ground).toMatch(/nothing was deleted/iu);
    }
  });
});

describe('the career and the week are different records, and neither reconciles the other', () => {
  it('keeps its own slot — a career write cannot land in the session slot', () => {
    /*
     * `everyday/host.ts` states the rule where the career is declared: *"The week and the campaign
     * career are different records with different lifetimes, and conflating them here is what made
     * the old wording plausible."* Asserted rather than left to the fact that nobody has written
     * the coupling yet — the next lane to add one fails here.
     */
    expect(CAREER_STORAGE_KEY).not.toBe(SESSION_KEY);
    // Non-vacuity, and it is not decoration: the first draft of this case imported a constant that
    // does not exist, so it compared against `undefined` and passed over nothing. `tsc` caught it.
    expect(SESSION_KEY).toBeTypeOf('string');
    expect(CAREER_STORAGE_KEY).toBeTypeOf('string');
  });

  it('decodes a career without consulting anything about a week', () => {
    // The codec takes a string and returns a career. There is no week-shaped input to disagree
    // with, which is what "they cannot disagree" means operationally.
    const career = openingCareer('collective');
    expect(decodeCareer(encodeCareer(career)).career).toEqual(career);
    expect(encodeCareer(career)).not.toContain('week');
  });
});
