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

import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import type { ViewerState } from '../dev/state.js';

import { DAY_HAS_NO_RECORD, refusalForDay } from './library.js';
import { PERIOD_BOOKS_THE_EVENT } from './record.js';
import { reproductionRefusalFor } from './reproduce.js';
import {
  PLAYER_SHELL_COPY,
  RACE_KEY_PLAYER,
  RAIL_EYEBROW_PLAYER,
  footerSeedLineOf,
  shellWatchingCopyOf,
  shellWatchingStrings,
} from './shell.js';
import type { PostedResult, WatchableRun, WatchRecord } from './types.js';
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

/**
 * States that between them fire every arm of `runIdentityIssues` a filed day can carry.
 *
 * Written as states rather than as a list of sentences so the corpus follows the module: an arm
 * added to `CARRY_CHECKS` with a first-person message is red here on the day it lands, which is the
 * only arrangement that survives somebody else maintaining the copy.
 */
const SCOPE_STATES: readonly ViewerState[] = [
  { ...baseState(), buildingId: 'nobody-ships-this' },
  { ...baseState(), dispatcherId: 'nobody-ships-this' },
  { ...baseState(), pattern: 'nobody-ships-this' },
  { ...baseState(), patience: { distribution: 'exponential', meanS: 120 } },
  { ...baseState(), levers: { ...baseState().levers, parking: !baseState().levers.parking } },
  { ...baseState(), savedClasses: [{ id: 'mine' }] as never },
  { ...baseState(), week: { ...baseState().week, day: 4 } },
  { ...baseState(), ruleRows: [{ when: 'call-waited', whenValue: 30, then: 'hold-at-lobby' }] },
];

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

  /*
   * The same grep, over the half of the screen the case above cannot see — `docs/20` defect 7.
   *
   * The three assertions above this comment were **all green** while a player watching a reference
   * run read `you` in the race key, `Your run` on the rail, their own dispatcher and their own seed
   * in the footer, and their own filed sheet on the Day report tab with nothing saying it was not
   * the run on screen. Every one of those is § 14.1's stated defect condition and every one was in
   * `dev/main.ts`, outside the module this file greps. So the corpus is widened to the value the
   * shell draws those surfaces from, and the browser tier reads the same rule off the rendered page
   * (`dev/watch.browser.test.ts`) — the model and the pixels, because the model alone is what was
   * being checked when the defect shipped.
   */
  it('says none of you, your or yours on the shell surfaces either', () => {
    for (const source of ['filed-day', 'reference'] as const) {
      const view = watchingViewOf(runOf({ source }), 'Steady hand');
      for (const text of shellWatchingStrings(shellWatchingCopyOf(view))) {
        expect(firstPersonWordsIn(text), `“${text}” is first-person on a watched shell`).toEqual([]);
      }
    }
    // Including the footer's seed line, which is the one shell string composed from a record.
    const record = { seed: '20260804', day: 3 } as unknown as WatchRecord;
    expect(firstPersonWordsIn(footerSeedLineOf(record))).toEqual([]);
    expect(footerSeedLineOf(record)).toContain('20260804');
    expect(footerSeedLineOf(null)).not.toBe('');
  });

  /*
   * And the other direction, which is what stops the case above from being satisfiable by deleting
   * words: the **player's** arm is required to still say them. A spectator arm that quietly became
   * the only arm would pass every grep in this file and would have taken `Your run` off the rail of
   * a player looking at their own week.
   */
  it('keeps the player’s own arm first-person, so the branch is a branch', () => {
    expect(PLAYER_SHELL_COPY.raceKey).toBe(RACE_KEY_PLAYER);
    expect(firstPersonWordsIn(PLAYER_SHELL_COPY.raceKey)).toEqual(['you']);
    expect(PLAYER_SHELL_COPY.railEyebrow).toBe(RAIL_EYEBROW_PLAYER);
    expect(firstPersonWordsIn(PLAYER_SHELL_COPY.railNote)).toEqual(['you']);
    // The player's own sheet carries no note at all — there is nothing to tell it apart from.
    expect(PLAYER_SHELL_COPY.reportNote).toBe('');
    expect(PLAYER_SHELL_COPY.footerNote).toBe('');
  });

  /* The corpus-covers-the-value case, for the shell's value — `walks every string the view carries`
   * at the other end of the screen. A surface added to `ShellWatchingCopy` with no line in
   * `shellWatchingStrings` is unchecked, and unchecked is how this defect shipped. */
  it('walks every string the shell copy carries', () => {
    const copy = shellWatchingCopyOf(watchingViewOf(runOf(), 'Steady hand'));
    const walked = new Set(shellWatchingStrings(copy));
    const missing = Object.entries(copy)
      .filter(([, value]) => typeof value === 'string' && !walked.has(value))
      .map(([key]) => key);
    expect(missing, 'a string field of ShellWatchingCopy that shellWatchingStrings does not walk')
      .toEqual([]);
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

  /*
   * And in the refusal that quotes somebody else's module — `docs/20` defect 1.
   *
   * `refusalForDay` prints a `ScopeIssue`'s own sentence on the picker, which puts `scope/`'s copy
   * on a watching surface. Three of those sentences said *"is yours alone"* until this landed, so
   * the rule is asserted over **every** message `runIdentityIssues` can produce rather than over the
   * wrapper: a refusal composed from a corpus somebody else maintains is only first-person-free by
   * accident unless the whole corpus is checked.
   */
  it('keeps every scope refusal it may quote free of first-person copy', () => {
    const messages = [
      ...SCOPE_STATES.flatMap((state) =>
        runIdentityIssues(state, RESOURCES, 'ranked').map((issue) => issue.message),
      ),
      PERIOD_BOOKS_THE_EVENT,
    ];
    // The corpus must not be empty, and it must contain the three sentences that made this case
    // necessary — a green run over a corpus that happened to miss them would be green about nothing.
    expect(messages.length).toBeGreaterThan(3);
    expect(messages.filter((message) => message.includes('saved on this device alone'))).toHaveLength(3);
    for (const message of messages) {
      expect(
        firstPersonWordsIn(refusalForDay(message)),
        `“${message}” would print first-person on the watch picker`,
      ).toEqual([]);
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
