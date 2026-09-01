/**
 * **§ 14.1's defect condition, on the Everyday side** — GitHub issue **#182**,
 * [§ D436](../../../../DECISIONS.md).
 *
 * The section names the rule itself:
 *
 * > **No first-person copy anywhere in the mode.** Not `you`, not `your run`, not `your best`. The
 * > word `you` on a watched run is a defect.
 *
 * `watch/view.test.ts` greps that over the module the Engineer chrome draws from. This greps it over
 * the words the **Everyday** shell adds — a second screen drawing the same run through a different
 * path, which is precisely the arrangement `docs/20` defect 7 records as having passed a grep scoped
 * to the old path while a player read `you` four times on the screen.
 *
 * The matcher is imported from `watch/view.ts` rather than re-declared, and that is not tidiness:
 * `Play this crowd yourself` is § 14.1's own primary and *your* is forbidden, so the two differ by
 * one word boundary. A second matcher is a second chance to get that boundary wrong, and the wrong
 * answer fails the handoff's own copy.
 *
 * ## What this file does **not** claim to cover
 *
 * The stage's other words — the clock, the phase pill, the three live figures, the legend, the race
 * captions, the status line — are `stageScreenModel.ts`', shared with every run context, and are not
 * enumerated here. `everyday/watchStage.browser.test.ts` sweeps the rendered text of the shell's own
 * screen region and action bar instead, so a string drawn anywhere on the watching screen is inside
 * that sweep by construction. The two files are the model and the pixels, and the model alone is
 * what was being checked when defect 7 shipped.
 */

import { describe, expect, it } from 'vitest';

import { firstPersonWordsIn } from '../watch/view.js';

import { WATCHING_NOTE } from './actionBar.js';
import type { EverydayState } from './types.js';
import {
  everydayWatchingCopyOf,
  everydayWatchingStrings,
  playThisCrowdRefusalFor,
  REPLAY_NOT_ON_STAGE,
  SPECTATOR_MAKES_NO_CHANGES,
  watchStageBarOf,
  WATCH_IT_LABEL,
  WATCH_ROWS_HEADING,
  WATCH_ROWS_LEDE,
} from './watchStage.js';

const WATCHING: EverydayState = { screen: 'stage', ctx: 'watch' };

/**
 * A record's day pair, which is all {@link playThisCrowdRefusalFor} reads.
 *
 * A value rather than a cast `WatchRecord`: that function narrowed its parameter to this pair
 * precisely so a driver of the rule is a driver rather than a fixture with fourteen unused fields
 * in it, and a test written against `as unknown as WatchRecord` would keep passing over a rule that
 * had started reading a fifteenth.
 */
const recordOn = (day: number, dayIdx: number): { day: number; dayIdx: number } => ({ day, dayIdx });

/** Every state of the watched bar — the live primary, both refusals, in one list. */
const BAR_STATES = [
  { hasReplay: true, playRefusal: undefined },
  { hasReplay: false, playRefusal: undefined },
  { hasReplay: true, playRefusal: playThisCrowdRefusalFor(recordOn(4, 3), { day: 2, dayIdx: 1 }) },
  { hasReplay: true, playRefusal: playThisCrowdRefusalFor(null, { day: 2, dayIdx: 1 }) },
] as const;

describe('the Everyday watching surface', () => {
  it('says none of you, your or yours in any state it can be drawn in', () => {
    for (const input of BAR_STATES) {
      for (const text of everydayWatchingStrings(everydayWatchingCopyOf(WATCHING, input))) {
        expect(firstPersonWordsIn(text), `“${text}” is first-person on a watched run`).toEqual([]);
      }
    }
  });

  /*
   * And the two refusals that are a function of a row rather than of a state, driven over both of
   * their branches — the arrangement `watch/view.test.ts` uses for `reproductionRefusalFor`. A
   * refusal is the surface most likely to slip into *your day* without anybody noticing, because it
   * is written in a hurry and read by nobody until it fires.
   */
  it('says none of them in the refusals either', () => {
    const refusals = [
      playThisCrowdRefusalFor(null, { day: 3, dayIdx: 2 }),
      playThisCrowdRefusalFor(recordOn(1, 0), { day: 3, dayIdx: 2 }),
      REPLAY_NOT_ON_STAGE,
      SPECTATOR_MAKES_NO_CHANGES,
    ];
    for (const text of refusals) {
      expect(text ?? '', 'a refusal that never composes is a refusal nobody reads').not.toBe('');
      expect(firstPersonWordsIn(text ?? '')).toEqual([]);
    }
  });

  /*
   * The corpus-covers-the-value case, and it is what makes the two above mean something:
   * `everydayWatchingStrings` is a function of the value rather than a list maintained beside it,
   * and this settles whether it actually covers it. A field added without a line in the walker is
   * unchecked, and unchecked is how defect 7 shipped.
   */
  it('walks every string the copy carries', () => {
    const copy = everydayWatchingCopyOf(WATCHING, BAR_STATES[2]);
    const walked = new Set(everydayWatchingStrings(copy));
    const missing = Object.entries(copy)
      .filter(([, value]) => typeof value === 'string' && !walked.has(value))
      .map(([key]) => key);
    expect(missing, 'a string field of EverydayWatchingCopy the walker does not walk').toEqual([]);
  });

  /*
   * The other direction, which is what stops the grep above from being satisfiable by deleting
   * words: the sentences have to still be there and still say what they were written to say.
   */
  it('keeps the § 3.3 row a watching row, with the guide’s two controls on it', () => {
    const bar = watchStageBarOf(WATCHING, BAR_STATES[0]);
    expect(bar.leave.label).toBe('⤺ Stop watching');
    expect(bar.primary.label).toBe('Play this crowd yourself');
    expect(bar.note).toBe(WATCHING_NOTE);
    /* § 3.3: `stage · watching` has **none** in the timeline cell, and § 14.1 says no back. */
    expect(bar.timeline).toBeUndefined();
    expect(bar.back).toBeUndefined();
    /* Live, because the replay is on the stage and the record is the day standing here. */
    expect(bar.primary.inert).toBeUndefined();
  });

  it('carries the picker’s own three sentences, and none of them is empty', () => {
    for (const text of [WATCH_ROWS_HEADING, WATCH_ROWS_LEDE, WATCH_IT_LABEL]) {
      expect(text.trim()).not.toBe('');
    }
    /* § 16 rule 2: the lede states the basis, which is the substitution § D407 argues. */
    expect(WATCH_ROWS_LEDE).toContain('re-simulates');
    expect(WATCH_ROWS_LEDE).toContain('no longer reproduces');
    /* And the third source is named as absent rather than left for a reader to infer. */
    expect(WATCH_ROWS_LEDE).toContain('server');
  });
});

/**
 * **§ 20.15's one refusal** — *"`Play this crowd yourself` must open the brief for **that day's**
 * fixture, not today's, when the row belongs to an archived day."*
 *
 * This build's conversion carries the record's selection and deliberately not its week day
 * (`dev/main.ts#playThisCrowd`: *"the day number belongs to the watched week and would grow the
 * spectator's building by somebody else's schedule"*), so on an archived row the crowd it would set
 * up is **not** the one on the stage. § D392: an instruction a control cannot carry out is withdrawn
 * rather than reworded.
 *
 * Both directions are driven, because a refusal that fires everywhere is as wrong as one that never
 * fires: a control withdrawn in every state is a control the player never gets, and § 14.1 calls
 * this primary *"the whole reason watching exists"*.
 */
describe('the archived-day withdrawal', () => {
  it('lets the press through on a record of the day standing here', () => {
    expect(playThisCrowdRefusalFor(recordOn(3, 2), { day: 3, dayIdx: 2 })).toBeUndefined();
  });

  it('withdraws it on another day of the week', () => {
    const refusal = playThisCrowdRefusalFor(recordOn(1, 0), { day: 4, dayIdx: 3 });
    expect(refusal).toBeDefined();
    /* It names both days rather than saying only no — a refusal that says no sends a reader hunting. */
    expect(refusal).toContain('day 1');
    expect(refusal).toContain('day 4');
    /* And it says what is *not* affected, because the replay itself is exact. */
    expect(refusal).toContain('runs the record exactly');
  });

  /*
   * The weekday index is load-bearing on its own: `shift/events.ts#eventFor(day, dayIdx)` derives
   * the day's event from the **pair**, so two runs agreeing on the day number and not on the weekday
   * are two different days. Driven rather than argued, because the cheap version of this check reads
   * only `day` and passes every case above.
   */
  it('withdraws it when the day matches and the weekday does not', () => {
    expect(playThisCrowdRefusalFor(recordOn(3, 5), { day: 3, dayIdx: 2 })).toBeDefined();
  });

  it('withdraws it on a row with no record at all', () => {
    expect(playThisCrowdRefusalFor(null, { day: 3, dayIdx: 2 })).toContain('no record');
  });

  /*
   * And the bar carries it — the sentence has to reach the pinned row, not only exist.
   * `shell.ts#drawBar` draws an inert primary's reason in the bar and binds it to the control with
   * `aria-describedby`, which is GitHub issue #262's second criterion: a dead button whose
   * explanation is off screen is a dead button with no reason.
   */
  it('reaches the § 3.3 row as the primary’s reason and as its note', () => {
    const refusal = playThisCrowdRefusalFor(recordOn(1, 0), { day: 4, dayIdx: 3 });
    const bar = watchStageBarOf(WATCHING, { hasReplay: true, playRefusal: refusal });
    expect(bar.primary.inert).toBe(refusal);
    expect(bar.note).toBe(refusal);
    /* The label does not change: the control still says what it would do, and says why it cannot. */
    expect(bar.primary.label).toBe('Play this crowd yourself');
  });

  it('refuses before the replay lands, and says that rather than the day', () => {
    const bar = watchStageBarOf(WATCHING, { hasReplay: false, playRefusal: undefined });
    expect(bar.primary.inert).toBe(REPLAY_NOT_ON_STAGE);
  });
});
