/**
 * § 14.1's two stated **defect conditions**, driven rather than argued.
 *
 * The section names them itself:
 *
 * > **No first-person copy anywhere in the mode.** Not `you`, not `your run`, not `your best`. The
 * > word `you` on a watched run is a defect.
 *
 * and, in the table's action-bar row, *"no timeline, no back"* with exactly two controls. Both are
 * greppable, so both are grepped — over the **value the shell draws from**, not over a list of
 * strings somebody remembered to keep.
 *
 * The corpus is `watchingStrings(view)`, and the third test is what makes the first two mean
 * something: it asserts that function covers every string-valued field of `WatchingView`, in both
 * directions, so a cell added to the table without a line in the corpus is red rather than
 * unchecked. That is `scope/surface.test.ts`'s arrangement at this scale.
 */

import { describe, expect, it } from 'vitest';

import { DAY_HAS_NO_RECORD } from './library.js';
import { reproductionRefusalFor } from './reproduce.js';
import type { PostedResult, WatchableRun } from './types.js';
import {
  FILED_DAY_LINE,
  PLAY_THIS_CROWD_LABEL,
  REFERENCE_RUN_LINE,
  REPLAY_PILL_VERB,
  STOP_WATCHING_LABEL,
  firstPersonWordsIn,
  postedFiguresOf,
  watchingStrings,
  watchingViewOf,
} from './view.js';

const POSTED: PostedResult = { arrived: 300, carried: 290, minutePct: 82, worstWaitS: 94 };

function runOf(overrides: Partial<WatchableRun> = {}): WatchableRun {
  return {
    id: 'day:c1:2',
    source: 'filed-day',
    label: 'Tuesday · day 2',
    buildingName: 'Garden Apartments',
    subtitle: 'day 2 of this week',
    record: null,
    posted: POSTED,
    blocked: null,
    ...overrides,
  };
}

describe('the watching view', () => {
  it('says none of you, your or yours on any surface it draws', () => {
    for (const source of ['filed-day', 'reference'] as const) {
      const view = watchingViewOf(runOf({ source }), 'Steady hand');
      for (const text of watchingStrings(view)) {
        expect(firstPersonWordsIn(text), `“${text}” is first-person on a watched run`).toEqual([]);
      }
    }
  });

  it('lets the handoff’s own primary through, and only by its word boundary', () => {
    // `Play this crowd yourself` is § 14.1's own label and addresses the spectator about *leaving*.
    // `your run` addresses them about the run they are watching. One boundary apart, and the
    // matcher has to keep them apart or the handoff's copy fails its own rule.
    expect(firstPersonWordsIn(PLAY_THIS_CROWD_LABEL)).toEqual([]);
    expect(firstPersonWordsIn('your run')).toEqual(['your']);
    expect(firstPersonWordsIn('You posted 82%')).toEqual(['you']);
  });

  it('has no first-person copy in the refusals either', () => {
    const drifted = reproductionRefusalFor(POSTED, { ...POSTED, carried: 12 });
    expect(drifted).not.toBeNull();
    for (const text of [DAY_HAS_NO_RECORD, drifted ?? '']) {
      expect(firstPersonWordsIn(text)).toEqual([]);
    }
  });

  it('offers two actions, and neither is a timeline, a close, a post or a score', () => {
    const view = watchingViewOf(runOf(), 'Steady hand');
    expect(view.actions.map((action) => action.id)).toEqual(['stop-watching', 'play-this-crowd']);
    expect(view.actions.map((action) => action.label)).toEqual([
      STOP_WATCHING_LABEL,
      PLAY_THIS_CROWD_LABEL,
    ]);
    for (const word of ['timeline', 'close', 'post', 'score', 'bank']) {
      for (const action of view.actions) {
        expect(action.label.toLowerCase()).not.toContain(word);
      }
    }
  });

  it('inverts the header and puts a pill naming the run on the canvas', () => {
    const view = watchingViewOf(runOf({ label: 'Tuesday · day 2' }), 'Steady hand');
    expect(view.headerTone).toBe('ink');
    expect(view.pill).toBe(`REPLAY · Tuesday · day 2 · ${REPLAY_PILL_VERB}`);
    expect(view.railSubline).toBe('WATCHING · TUESDAY · DAY 2');
  });

  it('never claims a server verified anything, because none did', () => {
    const view = watchingViewOf(runOf(), 'Steady hand');
    for (const text of watchingStrings(view)) {
      expect(text.toLowerCase()).not.toContain('server');
    }
    expect(view.pill).toContain('RE-SIMULATION');
  });

  it('says reference run · not a player for a fixture, and does not for a filed day', () => {
    expect(watchingViewOf(runOf({ source: 'reference' }), 'x').sourceLine).toBe(REFERENCE_RUN_LINE);
    expect(watchingViewOf(runOf({ source: 'filed-day' }), 'x').sourceLine).toBe(FILED_DAY_LINE);
  });

  it('publishes each posted percentage with the count it was taken over', () => {
    // R13's rule, and the same one issue #137 applied to the Day report's paired means: a
    // percentage drawn without its denominator is an estimate with no `n` in its own box.
    const figures = postedFiguresOf(POSTED);
    const minute = figures.find((figure) => figure.id === 'minutePct');
    expect(minute?.label).toContain('290');
    expect(figures.some((figure) => figure.id === 'arrived')).toBe(true);
  });

  /*
   * The test that makes the three above binding. `watchingStrings` is a function of the view rather
   * than a maintained list, and this settles whether it actually covers the view.
   */
  it('walks every string the view carries', () => {
    const view = watchingViewOf(runOf(), 'Steady hand');
    const walked = new Set(watchingStrings(view));
    const missing: string[] = [];
    for (const [key, value] of Object.entries(view)) {
      if (typeof value === 'string') {
        // `headerTone` is a token the shell switches on rather than text a reader sees. It is the
        // one string field deliberately outside the corpus, and it is named rather than skipped.
        if (key === 'headerTone') continue;
        if (!walked.has(value)) missing.push(key);
      }
    }
    expect(missing, 'a string field of WatchingView that watchingStrings does not walk').toEqual([]);
    for (const figure of view.figures) {
      expect(walked.has(figure.value) && walked.has(figure.label)).toBe(true);
    }
    for (const action of view.actions) expect(walked.has(action.label)).toBe(true);
  });
});
