/**
 * The left rail's decisions, driven directly.
 *
 * There is no jsdom in this repository (`vitest.config.ts` is `environment: 'node'` for every
 * project), so the mount is deliberately decision-free and everything worth asserting is a pure
 * function. What is asserted here is what a reviewer would otherwise have to take on trust:
 *
 * 1. **The served caption is generated from the run's own threshold**, not from the sixty seconds
 *    every shipped building happens to report. Driven at 45 s, where a hard-coded caption would
 *    label one building with another's rule.
 * 2. **A `pending` goal never renders a number.** An empty morning is not a pass, and a `100%`
 *    over three riders is arithmetic rather than competence.
 * 3. **The share is a dash and never `100%` on an empty denominator** — R13, one type down.
 * 4. **The bar is a partition**: four widths that sum to exactly 100 whenever anybody is standing.
 * 5. **No string this rail can produce contains a figure `meansAreSuppressed` refuses.** Driven on
 *    a real, genuinely saturated Vertical City run, the same way `live/noMeans.test.ts` does it,
 *    because a renderer is the last place a suppressed mean could re-enter.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig, suppressedConfig } from '../fixtures.test-helper.js';
import { meansAreSuppressed, overlayAt, queueAt } from '../frame/overlay.js';
import { WAIT_BANDS, moodOf, waitBandsAt } from '../live/bands.js';
import { decisionRowsAt } from '../live/decisions.js';
import { honestyAt } from '../live/honesty.js';
import { observationsAt } from '../live/observations.js';
import type {
  DecisionRow,
  LiveObservations,
  WaitBandBasis,
  WaitBandCount,
  WaitBands,
} from '../live/types.js';
import { recordRun } from '../record/recordRun.js';
import { frameAt } from '../frame/frameAt.js';
import { playheadHasReachedEnd } from '../render/canvas.js';
import { buildingMood, moodObservationsOf } from '../render/mood.js';
import { CASUAL_WORDS, ENGINEER_WORDS, overlayViewOf } from '../render/overlay.js';
import { PENDING_DISPLAY, goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { DayOutcome, GoalObservations, WeekState } from '../shift/types.js';
import { openWeek, outcomeOf } from '../shift/week.js';

import {
  decisionRowViewOf,
  goalRowsOf,
  historyBarsOf,
  idleHonestyCard,
  idleStatRowsOf,
  mathsDisclosureOf,
  moodDriverRowsOf,
  moodViewOf,
  runFiguresOf,
  servedCaptionFor,
  servedTitleFor,
  shiftIsOver,
  statRowsOf,
  streakLineOf,
  todayShareFor,
  type MoodView,
} from './leftRail.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

function observations(overrides: Partial<LiveObservations> = {}): LiveObservations {
  return {
    atS: 300,
    waitingNow: 7,
    longestCurrentWaitS: 42,
    arrived: 120,
    boarded: 100,
    carried: 88,
    servedUnderThresholdCount: 80,
    servedCount: 100,
    servedUnderThresholdPct: 80,
    longWaitThresholdS: 60,
    peakQueue: { count: 9, floorId: '12', atS: 210 },
    deepestQueueNow: 4,
    deepestQueueFloorId: '12',
    abandoned: 0,
    abandonedCarried: 0,
    turnedAway: 0,
    horizonS: 900,
    worstWaitSoFarS: 42,
    worstWaitIsCensored: false,
    // § 5's `trips` at the playhead. A number rather than `undefined`, so this fixture stands for a
    // recording the current schema produced rather than for one nobody instrumented.
    loadedDepartures: 34,
    workPerServedLegKJ: 41.2,
    ...overrides,
  };
}

/** A synthetic banding, so apportionment can be driven at counts a real run rarely produces. */
function bandsOf(counts: readonly number[], basis: WaitBandBasis = 'now'): WaitBands {
  const total = counts.reduce((sum, value) => sum + value, 0);
  const entries: WaitBandCount[] = WAIT_BANDS.map((band, index) => {
    const count = counts[index] ?? 0;
    return { band, count, pct: total === 0 ? 0 : Math.round((count / total) * 100) };
  });
  let worstIndex = 0;
  for (let index = WAIT_BANDS.length - 1; index >= 0; index -= 1) {
    if ((counts[index] ?? 0) > 0) {
      worstIndex = index;
      break;
    }
  }
  return {
    atS: 300,
    basis,
    total,
    counts: entries,
    worst: WAIT_BANDS[worstIndex] as (typeof WAIT_BANDS)[number],
    worstIndex,
    longestCurrentWaitS: total === 0 ? undefined : 130,
    longestWaitIsCensored: false,
  };
}

function goalObservations(overrides: Partial<GoalObservations> = {}): GoalObservations {
  return {
    arrived: 400,
    carryPct: 90,
    minutePct: 80,
    peakQueue: 6,
    abandoned: 0,
    worstWaitS: 45,
    worstWaitIsCensored: false,
    // Under `GOAL_BARS.energyPerLegMaxKJ`, so every row this fixture drives is gradeable. The
    // energy bar reads it and an absent value grades `pending`.
    workPerServedLegKJ: 41.2,
    ...overrides,
  };
}

function decisionRow(overrides: Partial<DecisionRow> = {}): DecisionRow {
  return {
    key: '120-c1',
    t: '06:02',
    head: 'A → Level 12',
    why: 'waitTime 12.4 s carried it · 0.42 clear of the next car',
    title: 'waitTime — estimated wait for the new passenger (serves AWT): 12.4 s.',
    color: 'var(--band-0)',
    outcome: 'assigned',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- *
 * L3 — the four stat rows
 * -------------------------------------------------------------------------- */

describe('statRowsOf — the four rows the design draws', () => {
  it('draws them in the design’s order, with its tooltips verbatim', () => {
    const rows = statRowsOf(observations());
    expect(rows.map((row) => row.label)).toEqual([
      'standing right now',
      'longest wait',
      'carried today',
      'served under 60 s',
    ]);
    expect(rows[0]?.title).toBe(
      'People at a landing with their call registered and no car yet. Instantaneous, not an average.',
    );
    expect(rows[1]?.title).toBe(
      'The worst wait currently on the board. This is the number tenants complain about — averages hide it.',
    );
    expect(rows[2]?.title).toBe('Passengers delivered to their destination floor since 06:00.');
  });

  it('reads its values off the observations and nowhere else', () => {
    const rows = statRowsOf(observations({ waitingNow: 13, carried: 501 }));
    expect(rows[0]?.value).toBe('13');
    expect(rows[2]?.value).toBe('501');
  });

  /* --- the caption is generated. This is the assertion the row exists for. --- */

  it('generates the served caption from the run’s own long-wait threshold', () => {
    expect(servedCaptionFor(60)).toBe('served under 60 s');
    expect(servedCaptionFor(45)).toBe('served under 45 s');

    const odd = statRowsOf(observations({ longWaitThresholdS: 45 }));
    expect(odd[3]?.label).toBe('served under 45 s');
    // A hard-coded caption would still say sixty about a building that counts a long wait at 45.
    expect(odd[3]?.label).not.toContain('60');
  });

  it('keeps the handoff’s tooltip at 60 s and replaces it when the threshold is not 60', () => {
    expect(servedTitleFor(60, 100)).toContain('under a minute');
    expect(servedTitleFor(45, 100)).not.toContain('under a minute');
    expect(servedTitleFor(45, 100)).toContain('45 s');
  });

  it('carries the denominator into the tooltip — R13’s `n` for the share', () => {
    expect(servedTitleFor(60, 137)).toContain('Over 137 served legs.');
    // And in the singular when the sample really is one — docs/19 defect 8's `over 1 legs`.
    expect(servedTitleFor(60, 1)).toContain('Over 1 served leg.');
  });

  /* --- the empty denominator --- */

  it('shows a dash and never 100% when nothing has been served', () => {
    const rows = statRowsOf(
      observations({
        servedUnderThresholdPct: undefined,
        servedCount: 0,
        servedUnderThresholdCount: 0,
        boarded: 0,
      }),
    );
    expect(rows[3]?.value).toBe(PENDING_DISPLAY);
    expect(rows[3]?.value).not.toBe('100%');
    expect(rows[3]?.tone).toBe('unknown');
  });

  it('says nobody is waiting rather than printing a zero-second longest wait', () => {
    const rows = statRowsOf(observations({ longestCurrentWaitS: undefined, waitingNow: 0 }));
    expect(rows[1]?.value).toBe('nobody waiting');
    expect(rows[1]?.tone).toBe('plain');
  });

  /* --- the two colour ladders, keyed on the band boundaries --- */

  it('colours the longest wait at the wait bands’ own boundaries, not at literals', () => {
    const amberFrom = WAIT_BANDS[2]?.fromS ?? 60;
    const redFrom = WAIT_BANDS[3]?.fromS ?? 120;
    const toneAt = (waited: number): string =>
      statRowsOf(observations({ longestCurrentWaitS: waited }))[1]?.tone ?? '';
    expect(toneAt(amberFrom - 1)).toBe('plain');
    expect(toneAt(amberFrom)).toBe('caution');
    expect(toneAt(redFrom - 1)).toBe('caution');
    expect(toneAt(redFrom)).toBe('hot');
  });

  it('colours the served share on the design’s 75/50 ladder', () => {
    const toneAt = (pct: number): string =>
      statRowsOf(observations({ servedUnderThresholdPct: pct }))[3]?.tone ?? '';
    expect(toneAt(75)).toBe('good');
    expect(toneAt(74)).toBe('caution');
    expect(toneAt(50)).toBe('caution');
    expect(toneAt(49)).toBe('hot');
  });

  it('KB-15: every coloured row states its value as text too', () => {
    for (const row of statRowsOf(observations())) {
      expect(row.value.length).toBeGreaterThan(0);
    }
  });
});

describe('idleStatRowsOf — before the first run', () => {
  it('claims nothing, and names no threshold it has not measured', () => {
    const rows = idleStatRowsOf();
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.value === PENDING_DISPLAY)).toBe(true);
    // The one place a hard-coded `60` would be provably wrong: there is no run to have measured it.
    expect(rows[3]?.label).toBe('served promptly');
    expect(rows[3]?.label).not.toMatch(/\d/);
  });
});

/* -------------------------------------------------------------------------- *
 * L1 / L2 — the mood card
 * -------------------------------------------------------------------------- */

describe('moodViewOf — the face, the bar and the legend', () => {
  it('takes the face, headline and sub-line from the mood, unchanged', () => {
    const bands = bandsOf([3, 0, 0, 0]);
    const mood = moodOf(bands);
    const view = moodViewOf(bands, mood);
    expect(view.face).toBe(mood.face);
    expect(view.headline).toBe(mood.headline);
    expect(view.sub).toBe(mood.sub);
    expect(view.faceEdge).toBe(mood.edge);
    expect(view.faceBg).toBe(mood.bg);
  });

  it('draws a partition: the four widths sum to exactly 100 whenever anybody is waiting', () => {
    const awkward: readonly (readonly number[])[] = [
      [1, 1, 1, 0], // 33.33 each — the case plain rounding sums to 99
      [1, 1, 1, 1],
      [1, 0, 0, 0],
      [7, 3, 0, 1],
      [1, 2, 3, 0],
      [17, 5, 3, 2],
      [0, 0, 0, 5],
    ];
    for (const counts of awkward) {
      const view = moodViewOf(bandsOf(counts), moodOf(bandsOf(counts)));
      const total = view.segments.reduce((sum, segment) => sum + segment.widthPct, 0);
      expect(total, `counts ${counts.join(',')}`).toBe(100);
      expect(view.anybodyWaiting).toBe(true);
    }
  });

  it('draws four zeroes on an empty lobby rather than a full green bar', () => {
    const bands = bandsOf([0, 0, 0, 0]);
    const view = moodViewOf(bands, moodOf(bands));
    expect(view.segments.map((segment) => segment.widthPct)).toEqual([0, 0, 0, 0]);
    expect(view.anybodyWaiting).toBe(false);
  });

  it('legends the four bands by their own names, with the raw head count beside each', () => {
    const view = moodViewOf(bandsOf([5, 4, 3, 2]), moodOf(bandsOf([5, 4, 3, 2])));
    // Three of the design's, and the fourth the simulator's — `docs/20` defect 4, `docs/12`
    // § 4.11. `live/bands.test.ts` is where that split is argued and pinned.
    expect(view.legend.map((entry) => entry.label)).toEqual([
      'breezy',
      'tapping foot',
      'checking watch',
      'eyeing the stairs',
    ]);
    expect(view.legend.map((entry) => entry.count)).toEqual([5, 4, 3, 2]);
    expect(view.legend.map((entry) => entry.color)).toEqual(WAIT_BANDS.map((band) => band.color));
  });

  it('KB-15: the bar carries the same partition in words', () => {
    const view = moodViewOf(bandsOf([5, 4, 3, 2]), moodOf(bandsOf([5, 4, 3, 2])));
    expect(view.barLabel).toContain('14 waiting');
    for (const band of WAIT_BANDS) expect(view.barLabel).toContain(band.label);
  });

  it('rounds the calm way: a fractional unit never widens the worst band past its share', () => {
    // 1/1/1/0: exact shares are 33.33 each, so one unit is spare. It goes to the calmest.
    const view = moodViewOf(bandsOf([1, 1, 1, 0]), moodOf(bandsOf([1, 1, 1, 0])));
    expect(view.segments.map((segment) => segment.widthPct)).toEqual([34, 33, 33, 0]);
  });
});

/* -------------------------------------------------------------------------- *
 * L5 — the goal rows
 * -------------------------------------------------------------------------- */

describe('goalRowsOf — met, missed and pending', () => {
  it('never renders a number for a pending goal', () => {
    const rows = goalRowsOf(readGoals(goalsForDay(1), goalObservations({ arrived: 3 })), [], 1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.state).toBe('pending');
      expect(row.value).toBe(PENDING_DISPLAY);
      expect(row.value).not.toMatch(/\d/);
      expect(row.barPct).toBe(0);
      expect(row.glyph).toBe('·');
    }
    // A flat grey track, not an amber sliver: nothing has been graded.
    expect(new Set(rows.map((row) => row.fill)).size).toBe(1);
  });

  it('marks a met goal with the tick and the band green', () => {
    const rows = goalRowsOf(
      readGoals(goalsForDay(1), goalObservations({ carryPct: 99, minutePct: 99, abandoned: 0 })),
      [],
      1,
    );
    for (const row of rows) {
      expect(row.state).toBe('met');
      expect(row.glyph).toBe('✓');
      expect(row.fill).toBe(WAIT_BANDS[0]?.color);
      expect(row.value).toMatch(/\d/);
    }
  });

  it('gives a missed goal the empty track when nothing has been observed on it', () => {
    const readings = readGoals(goalsForDay(1), goalObservations({ carryPct: 0, minutePct: 0 }));
    const rows = goalRowsOf(readings, [], 1);
    const zeroObserved = rows.filter((row) => row.state === 'missed' && row.value.startsWith('0'));
    expect(zeroObserved.length).toBeGreaterThan(0);
    for (const row of zeroObserved) expect(row.fill).not.toBe(WAIT_BANDS[1]?.color);
  });

  it('gives a missed goal with progress the band amber, and the handoff’s cross', () => {
    const rows = goalRowsOf(readGoals(goalsForDay(1), goalObservations({ minutePct: 40 })), [], 1);
    const minute = rows.find((row) => row.label.includes('inside a minute'));
    expect(minute?.state).toBe('missed');
    expect(minute?.fill).toBe(WAIT_BANDS[1]?.color);
    // § 20.6: missed draws an ×, not the old prototype's ring.
    expect(minute?.glyph).toBe('×');
  });

  it('passes the goal’s own sentence through rather than composing a second one', () => {
    const readings = readGoals(goalsForDay(4), goalObservations());
    expect(goalRowsOf(readings, [], 4).map((row) => row.label)).toEqual(
      readings.map((reading) => reading.goal.label),
    );
  });

  it('shows the bare dash for the "was" slot when the building has no previous day', () => {
    // `was —` would dress an absence as a measurement; the dash alone is the honest slot.
    for (const row of goalRowsOf(readGoals(goalsForDay(1), goalObservations()), [], 1)) {
      expect(row.was).toBe(PENDING_DISPLAY);
      expect(row.was).not.toContain('was');
    }
  });

  it('shows last night’s figure, worded as a "was", once a previous day is in the history', () => {
    const yesterdayReadings = readGoals(goalsForDay(3), goalObservations({ carryPct: 91 }));
    const yesterday = outcomeOf({
      record: null,
      recordRefusal: null,
      day: 3,
      dayIdx: 2,
      eventId: 'ordinary',
      arrived: 400,
      carried: 364,
      minutePct: 80,
      readings: yesterdayReadings,
    });
    const rows = goalRowsOf(readGoals(goalsForDay(4), goalObservations()), [yesterday], 4);
    const carry = rows.find((row) => row.label.startsWith('Carry'));
    expect(carry?.was).toBe('was 91%');
  });
});

/* -------------------------------------------------------------------------- *
 * L4 — YOUR RUN
 * -------------------------------------------------------------------------- */

describe('runFiguresOf and the sparkline', () => {
  const week = (overrides: Partial<WeekState> = {}): WeekState => ({
    ...openWeek('c1'),
    ...overrides,
  });

  it('draws the three figures the design draws, in its order', () => {
    expect(runFiguresOf(week()).map((figure) => figure.label)).toEqual([
      'clean days running',
      'best day so far',
      'banked this scenario',
    ]);
  });

  it('counts one clean day in the singular — docs/19’s copy nit', () => {
    // `1 clean days running` shipped; the label follows the value's number.
    expect(runFiguresOf(week({ streak: 1 }))[0]?.label).toBe('clean day running');
    expect(runFiguresOf(week({ streak: 2 }))[0]?.label).toBe('clean days running');
  });

  it('banks against the contract’s own needClean', () => {
    const figures = runFiguresOf(week({ cleanRun: 1 }));
    expect(figures[2]?.value).toBe('1/1');
  });

  it('shows a dash rather than a denominator it does not have', () => {
    // A building the reader built has no scenario behind it, so there is nothing to bank against.
    const figures = runFiguresOf(week({ contractId: 'not-a-contract' }));
    expect(figures[2]?.value).toBe(PENDING_DISPLAY);
  });

  it('withholds the best day until a day has closed, rather than publishing 0%', () => {
    /*
     * ENGINE_CONTRACT § 12.2's *never a zero*, found by the withheld-matrix sweep on the state a
     * new player is in for their whole first shift: `openWeek` seeds `bestMinutePct: 0`, and the
     * card published **0%** under *best day so far* until the first day filed. A best over an empty
     * sample is not a bad best.
     */
    expect(runFiguresOf(week())[1]?.value).toBe(PENDING_DISPLAY);

    // And a real 0 % day is a measurement, so it is published — the gate is the history, not the mark.
    const zeroDay: DayOutcome = {
      record: null,
      recordRefusal: null,
      day: 1,
      dayIdx: 0,
      weekday: 'Monday',
      eventId: 'ordinary',
      arrived: 120,
      carried: 4,
      minutePct: 0,
      readings: [],
      allMet: false,
    };
    expect(runFiguresOf(week({ history: [zeroDay], bestMinutePct: 0 }))[1]?.value).toBe('0%');
    expect(runFiguresOf(week({ history: [zeroDay], bestMinutePct: 74 }))[1]?.value).toBe('74%');
  });

  it('draws no today figure while the run on the stage is somebody else’s', () => {
    /*
     * § 12.2's *never a stale figure*, and the sharpest form of it this tree had: while watching,
     * `watch/session.ts#watchingStateOf` puts a stranger's recording on the state and leaves the
     * week alone, so the empty-history arm of the sparkline drew **their** share as the player's own
     * *today, so far*. The decision is `todayShareFor`; the bar is what it protects.
     */
    expect(todayShareFor(true, 66)).toBeUndefined();
    expect(todayShareFor(false, 66)).toBe(66);
    // `undefined` is *nobody has said*, which is not watching — the state every caller with no shell is in.
    expect(todayShareFor(undefined, 66)).toBe(66);

    const watchingBar = historyBarsOf([], todayShareFor(true, 66), 0);
    expect(watchingBar[0]?.title).toContain('nothing banked yet');
    expect(watchingBar[0]?.title).not.toContain('66');
  });

  it('reports the streak in words as well as in a colour', () => {
    expect(streakLineOf(week({ streak: 0 })).text).toBe('no streak yet');
    expect(streakLineOf(week({ streak: 3 })).text).toBe('on a roll');
    expect(streakLineOf(week({ streak: 3 })).color).not.toBe(streakLineOf(week()).color);
  });

  it('draws one bar per closed day, each with its own tooltip', () => {
    const days: readonly DayOutcome[] = [
      {
        record: null,
        recordRefusal: null,
        day: 1,
        dayIdx: 0,
        weekday: 'Monday',
        eventId: 'ordinary',
        arrived: 300,
        carried: 290,
        minutePct: 82,
        readings: [],
        allMet: true,
      },
      {
        record: null,
        recordRefusal: null,
        day: 2,
        dayIdx: 1,
        weekday: 'Tuesday',
        eventId: 'move-in',
        arrived: 340,
        carried: 200,
        minutePct: 41,
        readings: [],
        allMet: false,
      },
    ];
    const bars = historyBarsOf(days, undefined, 2);
    expect(bars.map((bar) => bar.short)).toEqual(['Mo', 'Tu']);
    expect(bars[0]?.title).toContain('82% away inside a minute');
    expect(bars[0]?.title).toContain('290 carried');
    expect(bars[1]?.title).toContain('Tuesday');
    expect(bars[0]?.color).not.toBe(bars[1]?.color);
  });

  it('draws one provisional bar for a day still running, and a flat one before any run', () => {
    const running = historyBarsOf([], 66, 0);
    expect(running).toHaveLength(1);
    expect(running[0]?.title).toContain('so far');

    const idle = historyBarsOf([], undefined, 0);
    expect(idle).toHaveLength(1);
    expect(idle[0]?.title).toContain('nothing banked yet');
    // Floored, so an empty sparkline is still a sparkline rather than a blank strip.
    expect(idle[0]?.heightPct).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * L6 — the honesty disclosure
 * -------------------------------------------------------------------------- */

describe('mathsDisclosureOf', () => {
  it('hides the toggle and the maths in casual mode — a lever, not a lecture', () => {
    const card = { ...idleHonestyCard(), hasMaths: false };
    const disclosure = mathsDisclosureOf(card, true, 'casual');
    expect(disclosure.toggleHidden).toBe(true);
    expect(disclosure.mathsHidden).toBe(true);
    expect(disclosure.maths).toBe('');
  });

  it('is a toggle that toggles — the prototype’s own rule made it inert', () => {
    /*
     * The design computes `hasMaths = engineer` and `showMaths = st.showMaths || engineer`, and
     * those two together make the button do nothing: it is visible exactly when the paragraph is
     * already open. A control that changes nothing is the defect this wave has a rule about, so the
     * rule is `hasMaths && showMaths` and `ViewerState.showMaths` starts `true` — the mockup's own
     * rendered state. See `mathsDisclosureOf` and `docs/12` § 4.
     */
    const card = { ...idleHonestyCard(), hasMaths: true, maths: 'the rule' };

    const open = mathsDisclosureOf(card, true, 'engineer');
    expect(open.toggleHidden).toBe(false);
    expect(open.mathsHidden).toBe(false);
    expect(open.toggleLabel).toBe('hide the maths');
    expect(open.maths).toBe('the rule');

    const shut = mathsDisclosureOf(card, false, 'engineer');
    expect(shut.toggleHidden).toBe(false);
    expect(shut.mathsHidden).toBe(true);
    expect(shut.toggleLabel).toBe('show me the maths');

    // The two states differ in what is on screen. That is the whole assertion.
    expect(open.mathsHidden).not.toBe(shut.mathsHidden);
  });

  it('draws neither the toggle nor the paragraph in casual mode, whatever the reader last chose', () => {
    const card = { ...idleHonestyCard(), hasMaths: false, maths: 'the rule' };
    for (const showMaths of [true, false]) {
      const disclosure = mathsDisclosureOf(card, showMaths, 'casual');
      expect(disclosure.toggleHidden).toBe(true);
      expect(disclosure.mathsHidden).toBe(true);
    }
  });

  it('before the first run says nothing has been measured, and does not tick', () => {
    const card = idleHonestyCard();
    expect(card.glyph).not.toBe('✓');
    expect(card.suppressed).toBe(false);
    expect(card.hasMaths).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * L7 — the decision log
 * -------------------------------------------------------------------------- */

describe('decisionRowViewOf', () => {
  it('passes the recorded sentence through without composing a second one', () => {
    const row = decisionRow();
    const view = decisionRowViewOf(row);
    expect(view.why).toBe(row.why);
    expect(view.head).toBe(row.head);
    expect(view.title).toBe(row.title);
    expect(view.time).toBe(row.t);
    expect(view.empty).toBe(false);
  });

  it('draws the standing-by row as a state, with no clock time it did not have', () => {
    const view = decisionRowViewOf(
      decisionRow({ outcome: 'empty', head: 'standing by', key: 'standing-by' }),
    );
    expect(view.empty).toBe(true);
    expect(view.time).toBe('—');
  });

  it('KB-15: the three outcomes read differently in words, not only in colour', () => {
    const heads = new Set(
      [
        decisionRow({ outcome: 'assigned', head: 'A → Level 12' }),
        decisionRow({ outcome: 'reassigned', head: 'A ⇄ Level 12' }),
        decisionRow({ outcome: 'unassigned', head: 'no car for Level 12' }),
      ].map((row) => decisionRowViewOf(row).head),
    );
    expect(heads.size).toBe(3);
  });
});

/* -------------------------------------------------------------------------- *
 * The rule that outranks the design
 * -------------------------------------------------------------------------- */

describe('a suppressed run yields no mean anywhere in the left rail', () => {
  /**
   * The refused run — `live/noMeans.test.ts`'s choice, and `DECISIONS.md` § D260's rate.
   *
   * This read *"the one that saturates hardest at the shipped rates"*. It did, and it did because of
   * § D254's pickup access check rather than because of its traffic; served properly the building
   * completes at 100 % delivery and quotes its mean. `suppressedConfig` states the rate instead.
   */
  let config: LoadedConfig;
  let recording: VizRecording;

  beforeAll(async () => {
    config = await loadConfig(DATA_DIR);
    recording = recordRun(suppressedConfig(config)).recording;
  }, 600_000);

  it('really is suppressed, or the rest of this proves nothing', () => {
    expect(meansAreSuppressed(recording)).toBe(true);
    expect(Number.isFinite(recording.summary.meanWaitS)).toBe(true);
  });

  it('never prints the withheld figure, as a number or inside a sentence', () => {
    const withheld = [
      recording.summary.meanWaitS,
      recording.summary.wait95S,
      recording.summary.meanTimeToDestinationS,
    ].filter((value) => Number.isFinite(value) && value !== 0);
    expect(withheld.length).toBeGreaterThan(0);

    const span = recording.endedAt - recording.startedAt;
    const outputs: unknown[] = [];
    for (let step = 0; step <= 6; step += 1) {
      const t = recording.startedAt + (span * step) / 6;
      const bands = waitBandsAt(recording, t);
      const live = observationsAt(recording, t);
      outputs.push(
        statRowsOf(live),
        moodViewOf(bands, moodOf(bands)),
        goalRowsOf(readGoals(goalsForDay(3), shiftObservationsOf(live)), [], 3),
        decisionRowsAt(recording, t, 6).map(decisionRowViewOf),
        mathsDisclosureOf(honestyAt(recording, t, 'engineer'), true, 'engineer'),
        mathsDisclosureOf(honestyAt(recording, t, 'casual'), true, 'casual'),
      );
    }

    const found: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        for (const target of withheld) {
          if (Math.abs(value - target) < 1e-6) found.push(`${path} = ${String(value)}`);
        }
        return;
      }
      if (typeof value === 'string') {
        for (const target of withheld) {
          for (const digits of [1, 2]) {
            if (value.includes(target.toFixed(digits))) {
              found.push(`${path} ⊃ "${target.toFixed(digits)}"`);
            }
          }
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) walk(item, `${path}[${String(index)}]`);
        return;
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      }
    };
    for (const [index, output] of outputs.entries()) walk(output, `#${String(index)}`);
    expect(found).toEqual([]);
  }, 600_000);

  it('still fills every row on the run whose mean is refused — the reason the rail is counts', () => {
    const live = observationsAt(recording, recording.endedAt);
    const rows = statRowsOf(live);
    expect(rows).toHaveLength(4);
    // Not one of the four is blank: every figure on this card is a head count.
    for (const row of rows) expect(row.value).not.toBe('');
    expect(rows[3]?.label).toBe(servedCaptionFor(live.longWaitThresholdS));
  });
});

/* -------------------------------------------------------------------------- *
 * Issue #35 — the rail at the terminal playhead
 * -------------------------------------------------------------------------- */

describe('the rail does not congratulate a shift that collapsed', () => {
  /**
   * `midtown-office` under `collective` over an hour of demand — the reporter's own selection, and
   * the shape the live card cannot see: it **fails and then drains**, so its final frame is an
   * empty lobby by construction.
   *
   * Driven through the rail's own decision (`shiftIsOver`) rather than through a recomputed
   * `t >= endedAt`, for the reason `summaryFigureIds` states about itself: a probe that recomputes
   * a decision asserts its own arithmetic, and the control could be disconnected entirely with the
   * assertion still passing.
   */
  let config: LoadedConfig;
  let recording: VizRecording;

  beforeAll(async () => {
    config = await loadConfig(DATA_DIR);
    recording = recordRun(
      fixtureConfig(config, {
        buildingId: 'midtown-office',
        dispatcherId: 'collective',
        durationS: 3600,
        onTimeout: 'report',
      }),
    ).recording;
  }, 600_000);

  it('really collapsed and really drained, or the rest of this proves nothing', () => {
    const live = observationsAt(recording, recording.endedAt);
    expect(recording.summary.saturated).toBe(true);
    expect(meansAreSuppressed(recording)).toBe(true);
    expect(live.waitingNow).toBe(0);
    expect(live.abandoned).toBeGreaterThan(100);
    expect(live.servedUnderThresholdPct ?? 100).toBeLessThan(50);
  }, 600_000);

  it('calls the shift over exactly at the end of it, and not before', () => {
    expect(shiftIsOver(recording, recording.endedAt)).toBe(true);
    expect(shiftIsOver(recording, recording.endedAt - 1)).toBe(false);
    expect(shiftIsOver(recording, recording.startedAt)).toBe(false);
  });

  it('draws a face and a headline that match the shift, not its last empty second', () => {
    const view = railMoodAt(recording, recording.endedAt);
    expect(view.headline).not.toBe('Everyone is getting on with their day.');
    expect(view.headline).not.toBe('Nobody stood for long today.');
    expect(view.face).toBe(WAIT_BANDS[3]?.face);
    expect(view.sub).toContain('across the whole shift');
    // The stacked bar is a partition of the shift, not four zeroes over an empty lobby.
    expect(view.legend.reduce((sum, entry) => sum + entry.count, 0)).toBeGreaterThan(0);
    expect(view.segments.reduce((sum, entry) => sum + entry.widthPct, 0)).toBe(100);
    // KB-15: the bar's second signal names the basis in words, for a reader who has no face glyph.
    expect(view.barLabel).toContain('Across the whole shift');
  }, 600_000);

  it('keeps the live card exactly as it was while the shift is running', () => {
    // Mid-run the rail must still be the design's instantaneous instrument.
    const during = railMoodAt(recording, recording.endedAt / 2);
    expect(during.barLabel).not.toContain('Across the whole shift');
    expect(during.sub).not.toContain('across the whole shift');
  }, 600_000);

  it('does not leave the casual honesty card saying the building is fine', () => {
    // The defect in its second place: at the terminal playhead nobody is behind, so the casual
    // card read ✓ *Comfortably keeping up* over a shift whose average the run itself refuses.
    const live = honestyAt(recording, recording.endedAt, 'casual');
    expect(live.title).toBe('Comfortably keeping up');

    const closed = honestyAt(recording, recording.endedAt, 'casual', 'whole-run');
    expect(closed.title).not.toBe('Comfortably keeping up');
    expect(closed.glyph).toBe('⚠');
    expect(closed.warning).toBe(true);
    // § 4: Basic may hide complexity, never a failure. The refusal is now in casual words, and the
    // rule behind it is still one control away rather than gone.
    expect(closed.suppressed).toBe(true);
    expect(closed.hasMaths).toBe(false);
    expect(closed.plain.toLowerCase()).toContain('average');
  }, 600_000);

  it('draws the mood card and the honesty card on the same basis', () => {
    for (const t of [recording.startedAt, recording.endedAt / 2, recording.endedAt]) {
      const over = shiftIsOver(recording, t);
      const card = honestyAt(recording, t, 'casual', over ? 'whole-run' : 'now');
      const view = railMoodAt(recording, t);
      expect(`${String(t)}: ${card.basis}`).toBe(`${String(t)}: ${over ? 'whole-run' : 'now'}`);
      expect(`${String(t)}: ${String(view.sub.includes('across the whole shift'))}`).toBe(
        `${String(t)}: ${String(over)}`,
      );
    }
  }, 600_000);
});

/** The mood card exactly as `drawMood` composes it — the rail's own basis, not a recomputed one. */
function railMoodAt(recording: VizRecording, t: number): MoodView {
  const bands = waitBandsAt(recording, t, shiftIsOver(recording, t) ? 'whole-run' : 'now');
  return moodViewOf(bands, moodOf(bands));
}

/* -------------------------------------------------------------------------- *
 * Issue #109 — the driver block at a playhead short of the end
 * -------------------------------------------------------------------------- */

describe('the mood card publishes no whole-day reading at a part-day playhead — issue #109', () => {
  /*
   * Modelled on `reportPanel.test.ts`'s § D223 block, deliberately and clause for clause, because
   * it is the same defect on a different card and the Day report is the surface that already got it
   * right: *no figure the chrome's own clock contradicts*, asserted by requiring the whole-day
   * figure to appear in **no** string rather than by checking one field.
   *
   * The premise is what makes it a defect rather than a stale cache, and it is asserted below
   * rather than assumed. `record/recordRun.ts` is *"the only place in the package that runs a
   * simulation"* and it simulates the whole day up front; `dev/main.ts` runs one on a cold load
   * with zero clicks. So at the first paint the recording is finished, the playhead is at
   * `startedAt`, and four of the five drivers were already reporting the end of the day.
   */
  let config: LoadedConfig;
  let recording: VizRecording;

  beforeAll(async () => {
    config = await loadConfig(DATA_DIR);
    // `secure-tower` on purpose: it declares `accessZones`, so it is a building on which the
    // `All N` sentence this change also removed could have been false. One run serves both.
    recording = recordRun(
      fixtureConfig(config, {
        buildingId: 'secure-tower',
        dispatcherId: 'collective',
        durationS: 900,
        onTimeout: 'report',
      }),
    ).recording;
  }, 600_000);

  /** The card's rows at `t`, through the rail's own gate rather than a recomputed one. */
  const rowsAt = (t: number): readonly { readonly label: string; readonly text: string }[] =>
    moodDriverRowsOf(buildingMood(moodObservationsOf(recording, queueAt(recording, t), t)));

  const said = (t: number): string =>
    rowsAt(t)
      .map((row) => `${row.label}: ${row.text}`)
      .join('\n');

  it('the premise: the whole day is already simulated while the playhead is at the start', () => {
    expect(recording.endedAt).toBeGreaterThan(recording.startedAt);
    // Nothing has been played, and the run-level counts are nevertheless final.
    expect(recording.summary.generated).toBeGreaterThan(0);
    const atStart = buildingMood(
      moodObservationsOf(recording, queueAt(recording, recording.startedAt), recording.startedAt),
    );
    const atEnd = buildingMood(
      moodObservationsOf(recording, queueAt(recording, recording.endedAt), recording.endedAt),
    );
    // The four whole-run drivers say the same thing at both ends of the run. That is the defect:
    // not a figure that drifts, a figure that was never about the playhead at all.
    for (const id of ['overwhelmed', 'abandoned', 'stranded', 'demand']) {
      const early = atStart.drivers.find((driver) => driver.id === id);
      const late = atEnd.drivers.find((driver) => driver.id === id);
      expect(early?.basis, id).toBe('whole-run');
      expect(`${id}: ${String(early?.text)}`).toBe(`${id}: ${String(late?.text)}`);
    }
    expect(atStart.drivers.find((driver) => driver.id === 'standing')?.basis).toBe('now');
  }, 600_000);

  it('the stage reads the same clock — `render/canvas.ts#playheadHasReachedEnd` agrees', () => {
    /*
     * § D293 gated this card. The stage banner and the canvas's text alternative are gated by
     * `render/canvas.ts#playheadHasReachedEnd`, which **cannot** call {@link shiftIsOver}: `dev/`
     * may depend on `render/` and not the reverse, and `dev/leftRail.ts` already imports
     * `render/mood.js`. So there are two copies of one comparison, and this is where they are held
     * equal — the same thing `moodDriverRowsOf` does for `mood.provisional`, and the reason
     * `shiftIsOver`'s own docstring gives for being exported at all: two copies of this decision is
     * how the rail and the stage come to disagree about which shift a reader is looking at.
     */
    for (const t of [
      recording.startedAt,
      1,
      recording.endedAt / 2,
      recording.endedAt - 1,
      recording.endedAt,
    ]) {
      expect(playheadHasReachedEnd(recording, frameAt(recording, t)), String(t)).toBe(
        shiftIsOver(recording, t),
      );
    }
  }, 600_000);

  it('draws no row a whole-day reading came out of, until the playhead reaches the end', () => {
    for (const t of [recording.startedAt, recording.endedAt / 2, recording.endedAt - 1]) {
      const labels = rowsAt(t).map((row) => row.label);
      expect(`${String(t)}: ${labels.join(',')}`).toBe(
        `${String(t)}: standing right now,the whole shift`,
      );
    }
  }, 600_000);

  it('puts no count on the card that the chrome’s own clock contradicts', () => {
    // The four numbers the withheld rows carry, each folded over the whole day. Not one of them
    // may appear anywhere in the block while the day is unfinished — the shape
    // `reportPanel.test.ts` uses on `carried`, applied to every figure this card can reach.
    const early = said(recording.startedAt);
    const { generated, delivered, undelivered } = recording.summary;
    for (const figure of [
      generated,
      delivered,
      undelivered,
      recording.summary.serviceLevel.arrivalCount,
      recording.summary.serviceLevel.overHorizonCount,
    ]) {
      if (figure === 0) continue;
      expect(early, `whole-day figure ${String(figure)} is on a part-day card`).not.toMatch(
        new RegExp(`\\b${String(figure)}\\b`),
      );
    }
    // …and the assertion is not passing because the block is empty.
    expect(rowsAt(recording.startedAt).length).toBeGreaterThan(1);
  }, 600_000);

  it('keeps the one driver that really is about the instant on screen', () => {
    // The gate is by `basis`, never by level: a card that dropped its bad news mid-run would be
    // the same defect with the polarity reversed.
    const standing = buildingMood(
      moodObservationsOf(
        recording,
        queueAt(recording, recording.endedAt / 2),
        recording.endedAt / 2,
      ),
    ).drivers.find((driver) => driver.id === 'standing');
    expect(said(recording.endedAt / 2)).toContain(String(standing?.text));
  }, 600_000);

  it('says what it is withholding, in words, and names every row it took away', () => {
    // KB-15, and `mood.test.ts`'s own claim that *"a flag no renderer is obliged to read is not a
    // retraction"*. Until this change the rail's entire retraction was an italic font style: it
    // draws `drivers`, `caveat` and `provisional`, and never `headline`.
    const retraction = rowsAt(recording.startedAt).at(-1);
    expect(retraction?.label).toBe('the whole shift');
    expect(retraction?.text).toContain('The run has not finished');
    expect(retraction?.text).toContain('two answers to one question');
    for (const label of ['queues', 'the unluckiest rider', 'delivered', 'demand answered']) {
      expect(retraction?.text, `the retraction must name "${label}"`).toContain(label);
    }
    // It is a retraction, not a refusal to ever say: it names both ways back.
    expect(retraction?.text).toContain('Play the shift through');
    expect(retraction?.text).toContain('timeline');
  }, 600_000);

  it('draws the whole card, unchanged, once the playhead reaches the end', () => {
    const done = rowsAt(recording.endedAt);
    expect(done.map((row) => row.label)).toEqual([
      'queues',
      'the unluckiest rider',
      'delivered',
      'standing right now',
      'demand answered',
    ]);
    // No retraction row, and the whole-day counts are back.
    expect(said(recording.endedAt)).toMatch(
      new RegExp(`\\b${String(recording.summary.generated)}\\b`),
    );
    expect(said(recording.endedAt)).not.toContain('The run has not finished');
  }, 600_000);

  it('answers the gate the same way through both of its doors', () => {
    /*
     * `drawDrivers` feeds `shiftIsOver(recording, t)`; `moodDriverRowsOf` feeds
     * `!mood.provisional`, because the honesty sweep calls it holding a mood and no clock. The two
     * are computed from the same pair of numbers and this is the assertion that keeps them that
     * way — without it the corpus could enumerate a set of rows the screen never draws.
     */
    for (const t of [
      recording.startedAt,
      recording.startedAt + (recording.endedAt - recording.startedAt) * 0.25,
      recording.endedAt / 2,
      recording.endedAt - 1,
      recording.endedAt,
      recording.endedAt + 60,
    ]) {
      const mood = buildingMood(moodObservationsOf(recording, queueAt(recording, t), t));
      expect(`${String(t)}: ${String(shiftIsOver(recording, t))}`).toBe(
        `${String(t)}: ${String(!mood.provisional)}`,
      );
    }
  }, 600_000);

  it('never prints “All N” over a building that turns riders away at the door', () => {
    /*
     * Issue #105/#109's third half. `core`'s identity is
     * `generated === delivered + undelivered + abandoned + accessRefused`, and an `accessRefused`
     * rider is in neither bucket this card could see — so `undelivered === 0` was never the same
     * question as *did everybody arrive*. `secure-tower` declares `accessZones`; seven of the eight
     * shipped buildings do.
     */
    const { generated, delivered, undelivered } = recording.summary;
    /*
     * The premise, measured on this run rather than argued: four riders are in **neither** bucket.
     * `undelivered` is 0, so the old branch fired and printed *All 196 people got where they were
     * going* over a building that turned four of two hundred away at the door. This assertion is
     * what makes the sentence below a fix instead of a rewording — delete the access gate and it
     * goes red first.
     */
    expect(undelivered).toBe(0);
    expect(delivered + undelivered).toBeLessThan(generated);

    const stranded = buildingMood(
      moodObservationsOf(recording, queueAt(recording, recording.endedAt), recording.endedAt),
    ).drivers.find((driver) => driver.id === 'stranded');
    expect(stranded?.text).not.toContain('All ');
    expect(stranded?.text).toBe(
      `${String(delivered)} of ${String(generated)} people got where they were going.`,
    );
  }, 600_000);
});

/* -------------------------------------------------------------------------- *
 * The rail and the panel, about one run, at one playhead — GitHub issue #297
 * -------------------------------------------------------------------------- */

/**
 * **Two surfaces on one screen may not contradict each other about the same run.**
 *
 * `statRowsOf` draws `carried today N` — *passengers delivered to their destination floor since
 * 06:00*, run-scoped. `render/overlay.ts#overlayViewOf` draws the LIVE METRICS bank list, and when
 * no bank answered anything inside the rolling five minutes it draws a sentence in place of the
 * list. That sentence used to read `nothing served yet` / `nobody carried yet`, and *yet* is a
 * claim about the run: the panel denied, in words, the people the rail was counting two inches
 * away.
 *
 * ## Why this case is here rather than in the panel's own file
 *
 * It is not a fact about either surface. `render/overlayRender.test.ts` asserts the panel's
 * vocabulary and can see that the sentence names a window; it cannot see the rail, so it cannot
 * see the contradiction. The nine single-surface honesty properties could not see it either — each
 * screen was internally coherent, which is the blindness `CLAUDE.md` records for wave B's horizon
 * defect, and `honesty/agreement.ts` excludes it by its own docstring, since this is *a
 * disagreement in a figure no side can reach without a run*. So the case drives a run and asks
 * **both** surfaces, which is the only way the claim is a claim.
 *
 * ## The condition is asserted before it is used
 *
 * A sweep that found no such playhead would pass while measuring nothing. So the first assertion is
 * that the state exists on this run, at the count the issue measured, and only then is the pair
 * checked at every one of them.
 *
 * The run is the issue's own: `garden-apartments`, 3 600 s, seed 20 260 827, sampled every 10 s.
 * The building is the sparse one — 26 legs over an hour — so the window empties repeatedly while
 * the day's total keeps climbing, which is a state a busy building never sits in and the reason the
 * 900 s breadth fixtures never produced one. Swept at their own rates and durations, **all eight**
 * shipped buildings report zero such playheads; this run reports 44.
 */
describe('the rail’s counter and the LIVE METRICS panel agree about one run — issue #297', () => {
  /** A word that dates a claim to the run rather than to the window. */
  const RUN_SCOPED = /\byet\b|\bso far\b|\btoday\b|\bever\b|\bnot once\b/i;
  /** The issue's sweep spacing. */
  const STEP_S = 10;

  let config: LoadedConfig;
  let recording: VizRecording;
  /** The playheads where the window is empty **and** the run has carried somebody. */
  let contested: readonly number[] = [];

  beforeAll(async () => {
    config = await loadConfig(DATA_DIR);
    recording = recordRun(
      fixtureConfig(config, {
        buildingId: 'garden-apartments',
        durationS: 3600,
        seed: 20_260_827n,
        onTimeout: 'report',
      }),
    ).recording;
    const found: number[] = [];
    for (let t = recording.startedAt; t <= recording.endedAt; t += STEP_S) {
      const view = overlayViewOf(overlayAt(recording, t), frameAt(recording, t));
      if (view.banksEmpty !== undefined && observationsAt(recording, t).carried > 0) found.push(t);
    }
    contested = found;
  }, 600_000);

  it('really reaches that state, or the rest of this proves nothing', () => {
    /*
     * The issue's measurement, re-derived rather than quoted: 44 of a 361-sample sweep, 12 % of the
     * run. Pinned to the run that produced it, so a change that stops reaching the state fails here
     * rather than passing an unmeasured sweep — and the two playheads the issue printed are named,
     * because they are what a reader will check by hand.
     */
    expect(contested).toHaveLength(44);
    expect(contested).toContain(1030);
    expect(contested).toContain(1760);
  });

  it('never says the run has carried nobody while the rail is counting people', () => {
    for (const t of contested) {
      const observed = observationsAt(recording, t);
      /*
       * Asked of the rail rather than recomputed: a probe that formatted its own count would
       * assert its own arithmetic and say nothing about the row a reader is looking at. That is
       * `railBasisAt`'s rule in `honesty/surfaces.ts`, applied one surface over.
       */
      const rail = statRowsOf(observed).find((row) => row.label === 'carried today');
      expect(rail?.value, `the rail lost its counter at ${String(t)} s`).toBe(
        String(observed.carried),
      );
      expect(observed.carried).toBeGreaterThan(0);

      for (const mode of ['basic', 'advanced'] as const) {
        const view = overlayViewOf(overlayAt(recording, t), frameAt(recording, t), mode);
        const sentence = view.banksEmpty;
        if (sentence === undefined) throw new Error(`no empty-bank sentence at ${String(t)} s`);
        expect(
          RUN_SCOPED.test(sentence),
          `at ${String(t)} s the ${mode} panel said “${sentence}” while the rail said ` +
            `carried today ${String(observed.carried)}`,
        ).toBe(false);
      }
    }
  }, 600_000);

  it('names the window it is actually about, in both registers', () => {
    /*
     * The other half of AC1, and the half a cue list alone would not give: dropping *yet* would
     * satisfy the check above with a sentence that named no basis at all, which is the third kind
     * of absence `docs/21` L-5 refuses. Both registers carry the span — Casual the way
     * `got a car (5min)` carries it, the engineer's the way `boarded (window)` does.
     */
    const t = contested[0];
    if (t === undefined) throw new Error('no contested playhead to read');
    const casual = overlayViewOf(overlayAt(recording, t), frameAt(recording, t), 'basic');
    const engineer = overlayViewOf(overlayAt(recording, t), frameAt(recording, t), 'advanced');
    expect(casual.banksEmpty).toBe(CASUAL_WORDS.noneInWindow);
    expect(engineer.banksEmpty).toBe(ENGINEER_WORDS.noneInWindow);
    expect(CASUAL_WORDS.noneInWindow).toMatch(/5 min/);
    expect(ENGINEER_WORDS.noneInWindow).toMatch(/window/);
  });
});
