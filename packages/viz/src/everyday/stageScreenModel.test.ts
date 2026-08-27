/**
 * **The § 7 stage's pure half**, driven without a document.
 *
 * Three claims carry this suite, and each is one the stage would ship broken without it.
 *
 * 1. **§ 4.6's speed labels mean what they say, and the transport runs at what they say.** This
 *    used to be the weaker claim — *one array indexed twice*, compared cell by cell against a
 *    transcription of `ENGINE_CONTRACT.md` § 4.6's table — and the transcription was faithful to a
 *    table in which **every one of the five labels was false** (GitHub issue **#257**,
 *    [§ D344](../../../../DECISIONS.md)). A test that copies the contract cannot notice that the
 *    contract is wrong. So the pair is now checked **against itself**: the number is parsed back
 *    out of the label and required to equal the multiplier beside it, with no expected table
 *    anywhere in this file. That subsumes the old case — two parallel lists out of step produce a
 *    label whose number is not its multiplier — and it is the one property that could not be
 *    satisfied by transcribing something.
 * 2. **No figure is a whole-run fold.** § D293's rule and § D307's two findings. Checked as a
 *    property rather than by grep: every figure the header publishes is asked at a rising sequence
 *    of playheads and required to behave like a fold *at* that playhead — refusing before anybody
 *    has been served, non-decreasing in `t`, and saying `and counting` while its maximum belongs
 *    to somebody still standing.
 * 3. **The ramp is `live/bands.ts`', not a second one.** The boundaries are asserted *against*
 *    `WAIT_BANDS` rather than against 30/60/120, so this file cannot be the place a private set of
 *    boundaries comes back — and § 7.2's own 30/75/150 is asserted to be the thing deviated from,
 *    with the deviation stated in the module docstring.
 */

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { WAIT_BANDS } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { syntheticRecording, servedLeg, waitingLeg } from '../live/synthetic.test-helper.js';
import { syntheticFloor, syntheticShaft } from '../live/synthetic.test-helper.js';
import { ManualClock } from '../playback/clock.js';
import { MAX_SPEED, MIN_SPEED } from '../playback/mapping.js';
import { Playback } from '../playback/playback.js';
import { actionBarFor } from './actionBar.js';
import { EVERYDAY_COLORS } from './tokens.js';
import { RUN_CONTEXTS } from './types.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  MAX_CAR_RIDERS,
  MAX_LANDING_FIGURES,
  stageAlarmOf,
  stageBandOf,
  stageBarModelOf,
  stageCarPaintOf,
  stageCarReadoutOf,
  stageCarRestBarOf,
  stageCrowdCapOf,
  stageFilingLandsOn,
  stageGeometryOf,
  stageHeaderOf,
  stageInkFor,
  stageInterventionsOf,
  stageLegend,
  stageNextStretchOf,
  stageOpeningLineOf,
  stageSpeedAt,
  STAGE_ABSENCES,
  STAGE_ALARM_STANDING,
  STAGE_BAND_INK,
  STAGE_DAY_OVER,
  STAGE_INTERVENTIONS,
  STAGE_NO_PHASE,
  STAGE_RECOMPUTING,
  STAGE_SPEEDS,
} from './stageScreenModel.js';
import { restBarWidthPx } from '../render/carRest.js';

/* -------------------------------------------------------------------------- *
 * § 4.6 — the transport
 * -------------------------------------------------------------------------- */

describe('§ 4.6 — the speed table', () => {
  /**
   * **The label is a claim, and this is the parser that holds it to account** — GitHub issue #257's
   * AC2, *"every speed label equals its actual ratio, asserted by a test over `STAGE_SPEEDS` rather
   * than by review"*.
   *
   * A label is a decimal numeral followed by `×`, and nothing else. That is narrower than the table
   * this replaced, which shipped `½×` over a multiplier of 8, and the narrowness is the point: a
   * parser that understood `½` would need a glyph table, and a glyph table is a second place where a
   * name and a number are kept — which is the defect #257 is about. A half-speed rung is spelled
   * `0.5×` here, and it parses.
   *
   * `null` for anything that does not parse, so an unreadable label **fails** rather than being
   * quietly skipped. A test that skips what it cannot read is how `½×` would survive this file.
   */
  const ratioClaimedBy = (label: string): number | null => {
    const match = /^(\d+(?:\.\d+)?)×$/u.exec(label);
    if (match === null) return null;
    const claimed = Number(match[1]);
    return Number.isFinite(claimed) ? claimed : null;
  };

  it('states a ratio in every label, in the one form this file can read back', () => {
    expect(STAGE_SPEEDS.length, 'the ladder is empty — nothing below asserts anything').toBeGreaterThan(
      1,
    );
    for (const speed of STAGE_SPEEDS) {
      expect(ratioClaimedBy(speed.label), `label ${speed.label} is not a readable ratio`).not.toBeNull();
    }
  });

  it('runs at exactly the ratio its label claims — derived from the row, never from a table', () => {
    /*
     * No expected table anywhere in this case. The old one transcribed `ENGINE_CONTRACT.md` § 4.6
     * and passed for as long as the contract's own five labels were wrong, which is the failure
     * mode a transcription has by construction: it can only ever be as true as what it copies.
     */
    for (const [index, speed] of STAGE_SPEEDS.entries()) {
      const row = stageSpeedAt(index);
      /* Read through the one accessor, so a screen that took its label from one place and its
         multiplier from another could not satisfy this — the § 20.12 failure in a line. */
      expect([row.label, row.simPerRealS], `rung ${String(index + 1)}`).toEqual([
        speed.label,
        speed.simPerRealS,
      ]);
      expect(
        ratioClaimedBy(row.label),
        `${row.label} runs at ${String(row.simPerRealS)} sim s per real s`,
      ).toBe(row.simPerRealS);
    }
  });

  it('offers a true 1:1 rung, which is the whole of #257’s first acceptance criterion', () => {
    const oneToOne = STAGE_SPEEDS.filter((speed) => speed.simPerRealS === 1);
    expect(oneToOne.map((speed) => speed.label), 'no rung runs the day at real time').toEqual(['1×']);
  });

  it('keeps a rung the § D344 audio budget can play discrete cues at, besides 1:1', () => {
    /*
     * § D344's determination, and the reason this ladder is what stands between the build and 1:1
     * audio: a 9.8 s hall-call door cycle against a 250 ms floor on an identifiable cue gives
     * `S ≤ 39` sim-seconds per real second. A ladder with 1:1 and nothing else under the bound
     * would meet #257's letter and leave the discrete tier with one place to stand.
     */
    const discrete = STAGE_SPEEDS.filter((speed) => speed.simPerRealS <= 39);
    expect(discrete.length, 'nothing between 1:1 and the bed').toBeGreaterThanOrEqual(2);
  });

  it('removed no rung — every multiplier that shipped before #257 still does', () => {
    /*
     * #257's own scope: *"this is about adding the low end and correcting the labels, not removing
     * speed"*. These five are the multipliers of the table it refutes, so a lane that later drops
     * one has to say so here rather than in passing. A ten-hour day at 1:1 is ten hours; the fast
     * rungs are why the continuous bed exists.
     */
    const before = [8, 30, 90, 240, 600];
    const shipped = STAGE_SPEEDS.map((speed) => speed.simPerRealS);
    expect(shipped).toEqual(expect.arrayContaining(before));
  });

  it('is strictly ascending, with no two rungs saying the same thing', () => {
    const multipliers = STAGE_SPEEDS.map((speed) => speed.simPerRealS);
    expect(multipliers).toEqual([...multipliers].sort((a, b) => a - b));
    expect(new Set(multipliers).size, 'two rungs run at one speed').toBe(multipliers.length);
    expect(new Set(STAGE_SPEEDS.map((speed) => speed.label)).size).toBe(STAGE_SPEEDS.length);
  });

  it('holds every multiplier inside the transport’s own legal range', () => {
    /* `playback/mapping.ts`'s `[MIN_SPEED, MAX_SPEED]`. A speed button that threw on press would
       be a control that does nothing, loudly. */
    for (const speed of STAGE_SPEEDS) {
      expect(speed.simPerRealS).toBeGreaterThanOrEqual(MIN_SPEED);
      expect(speed.simPerRealS).toBeLessThanOrEqual(MAX_SPEED);
    }
  });

  it('opens at a rung that exists, and answers the default for an index it does not have', () => {
    expect(DEFAULT_STAGE_SPEED_INDEX, 'the declared default names no rung').toBeGreaterThanOrEqual(
      0,
    );
    expect(DEFAULT_STAGE_SPEED_INDEX).toBeLessThan(STAGE_SPEEDS.length);
    /* A stored index from a build with more speeds must open the day, not crash it — and it must
       open it at the *default*, because § 4.6's rule is about a day never vanishing in three
       seconds. */
    expect(stageSpeedAt(99)).toEqual(stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX));
    expect(stageSpeedAt(-1)).toEqual(stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX));
    expect(stageSpeedAt(1.5)).toEqual(stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX));
  });

  /**
   * **#257's AC3 — the default is a decision, and these are the three reasons it gives.**
   *
   * Asserted as properties rather than as the number 30, so the case says *why* rather than *what*:
   * a lane that moves the default has to break one of these three arguments, not edit a literal.
   */
  it('opens at the fastest rung inside the § D344 budget, and not at 1:1', () => {
    const opening = stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX);
    const discrete = STAGE_SPEEDS.filter((speed) => speed.simPerRealS <= 39);
    /* Inside the budget, so the discrete-cue tier is what a player meets rather than something
       they have to go looking for. */
    expect(opening.simPerRealS).toBeLessThanOrEqual(39);
    /* The fastest such rung — the most day per minute that still clears the bound. */
    expect(opening.simPerRealS).toBe(Math.max(...discrete.map((speed) => speed.simPerRealS)));
    /*
     * And not the honest 1×. `rise-and-fall` is thirty simulated minutes, so 1:1 opens a
     * half-hour sitting; `office-day` is ten simulated hours. § 4.6's rule is that a day must
     * never vanish in three seconds, and a day that never ends is that rule from the other side.
     */
    expect(opening.simPerRealS).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- *
 * § 4.6 — the transport actually runs at these numbers
 * -------------------------------------------------------------------------- */

/**
 * **Move the control and require the run to change** — `CLAUDE.md`'s standing requirement, pointed
 * at a speed rung instead of a slider.
 *
 * A ladder whose labels are internally consistent is still worth nothing if the number never
 * reaches the clock. That is this repository's eleven-times-shipped defect: a value that is
 * authored, validated, carried and consulted by nothing. So every rung is driven through the object
 * the mount drives — `Playback`, over a {@link ManualClock} so there is no timer and no flake — and
 * required to move the playhead by exactly what its label promises.
 *
 * The hop this cannot see is named rather than implied: `stageScreen.ts`'s
 * `playback?.setSpeed(stageSpeedAt(index).simPerRealS)` needs a document, so the *button* to
 * `setSpeed` link is the browser tier's, not this file's. What is proved here is everything from
 * `STAGE_SPEEDS` to the playhead.
 */
describe('§ 4.6 — every rung reaches the transport', () => {
  /* Long enough that the fastest rung cannot clamp against `endedAt` inside the interval below. */
  const longDay = (): VizRecording => syntheticRecording({ startedAt: 0, endedAt: 100_000 });
  const REAL_MS = 2_000;

  it('advances the playhead by exactly the ratio each label claims', () => {
    for (const speed of STAGE_SPEEDS) {
      const clock = new ManualClock(0);
      const playback = new Playback(longDay(), clock, { speed: speed.simPerRealS });
      playback.play();
      clock.advance(REAL_MS);
      expect(playback.simTimeS, `${speed.label} over ${String(REAL_MS)} ms`).toBeCloseTo(
        (REAL_MS / 1000) * speed.simPerRealS,
        9,
      );
    }
  });

  it('runs the day at real time on the 1× rung — one real second, one simulated second', () => {
    const oneToOne = STAGE_SPEEDS.find((speed) => speed.label === '1×');
    expect(oneToOne, 'no 1× rung to drive').toBeDefined();
    const clock = new ManualClock(0);
    const playback = new Playback(longDay(), clock, { speed: oneToOne?.simPerRealS ?? 0 });
    playback.play();
    clock.advance(1_000);
    expect(playback.simTimeS).toBeCloseTo(1, 9);
    clock.advance(9_000);
    expect(playback.simTimeS).toBeCloseTo(10, 9);
  });

  it('changes the playback rate when the control moves — through setSpeed, which is what the button calls', () => {
    /*
     * The button's own path: the transport already exists at the default and `setSpeed` re-anchors
     * it. Every rung is pressed in turn from the same playhead, and each must produce a *different*
     * amount of day per second — an inert rung would show up here as two rungs that agree.
     */
    const clock = new ManualClock(0);
    const playback = new Playback(longDay(), clock, {
      speed: stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX).simPerRealS,
    });
    playback.play();
    const advanced: number[] = [];
    for (const [index, speed] of STAGE_SPEEDS.entries()) {
      playback.setSpeed(stageSpeedAt(index).simPerRealS);
      const before = playback.simTimeS;
      clock.advance(REAL_MS);
      const moved = playback.simTimeS - before;
      expect(moved, `${speed.label} moved the day`).toBeCloseTo(
        (REAL_MS / 1000) * speed.simPerRealS,
        6,
      );
      advanced.push(moved);
    }
    expect(new Set(advanced).size, 'two rungs played the day at the same rate').toBe(
      STAGE_SPEEDS.length,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * § 7.2 — the wait ramp
 * -------------------------------------------------------------------------- */

describe('§ 7.2 — the wait ramp is live/bands.ts’, not a second one', () => {
  it('bands a wait at exactly WAIT_BANDS’ own boundaries', () => {
    for (const band of WAIT_BANDS) {
      /* Asserted against the shared table rather than against 30/60/120: this file must not be
         where a private set of boundaries comes back. */
      expect(stageBandOf(band.fromS), `at ${String(band.fromS)}s`).toBe(band.id);
      if (band.toS !== undefined) {
        expect(stageBandOf(band.toS - 0.001), `just under ${String(band.toS)}s`).toBe(band.id);
      }
    }
  });

  it('deviates from § 7.2’s 75 s and 150 s, deliberately and in one direction', () => {
    /*
     * § 7.2 writes the ramp as 30 / 75 / 150. `WAIT_BANDS` is 30 / 60 / 120 and this screen follows
     * it — the module docstring carries the argument (the simulator wins what a number means, and
     * the band members carry fixed prose about *a minute*). Pinned here so the deviation is a
     * decision on record rather than a transcription slip somebody later "fixes".
     */
    expect(stageBandOf(75)).toBe('checking-watch');
    expect(stageBandOf(150)).toBe('taking-the-stairs');
  });

  it('gives each band a distinct § 19 ink, and never a CSS custom property', () => {
    const inks = Object.values(STAGE_BAND_INK);
    expect(new Set(inks).size).toBe(WAIT_BANDS.length);
    for (const ink of inks) {
      /* `live/bands.ts`' own rule: *"Nothing here may be handed to a canvas"* — its `color` is
         `var(--band-N)`, which a 2D context cannot resolve. These are § 19's literals. */
      expect(ink).toMatch(/^#[0-9A-F]{6}$/i);
      expect(Object.values(EVERYDAY_COLORS)).toContain(ink);
    }
    expect(stageInkFor(0)).toBe(EVERYDAY_COLORS.moss);
    expect(stageInkFor(1000)).toBe(EVERYDAY_COLORS.warmGrey);
  });

  it('names the four colours in plain words, in the bands’ own order', () => {
    const legend = stageLegend();
    expect(legend.map((rung) => rung.id)).toEqual(WAIT_BANDS.map((band) => band.id));
    /* The stage legend's own label, not the mood card's: *under 30 s*, not *breezy*. */
    expect(legend.map((rung) => rung.label)).toEqual(WAIT_BANDS.map((band) => band.legendLabel));
  });
});

/* -------------------------------------------------------------------------- *
 * § 7.1 — the header, and § D293
 * -------------------------------------------------------------------------- */

/** A day where one rider is served early and one stands to the end — both header arms, in one run. */
function aDay() {
  return syntheticRecording({
    startedAt: 0,
    endedAt: 600,
    legs: [servedLeg('p1', 10, 40, 70), servedLeg('p2', 20, 130, 160), waitingLeg('p3', 100)],
  });
}

describe('§ 7.1 — the three header figures', () => {
  it('refuses the ratio before anybody has boarded, rather than reporting 100 %', () => {
    const recording = aDay();
    const head = stageHeaderOf({
      simTimeS: 0,
      recording,
      observations: observationsAt(recording, 0),
      driverName: 'the plain baseline',
    });
    const away = head.figures[0];
    /*
     * R13, one type down: the design's prototype returns 100 % on an empty denominator, which reads
     * as *everybody was served promptly* about a building where nobody has been served at all.
     */
    expect(away?.value).toBe('—');
    expect(away?.refusal).toMatch(/nobody has boarded/);
    expect(away?.count).toBeUndefined();
  });

  it('carries the ratio’s own n once it can answer, and no n on the counts', () => {
    const recording = aDay();
    const head = stageHeaderOf({
      simTimeS: 200,
      recording,
      observations: observationsAt(recording, 200),
      driverName: 'the plain baseline',
    });
    const [away, standing, longest] = head.figures;
    expect(away?.value).toMatch(/^\d+%$/);
    expect(away?.count).toMatch(/^of \d+ away$/);
    /* A count is its own `n` — a denominator under it would be the same number twice. */
    expect(standing?.count).toBeUndefined();
    expect(longest?.count).toBeUndefined();
    expect(standing?.value).toBe('1');
  });

  it('says `and counting` while the longest wait belongs to somebody still standing', () => {
    const recording = aDay();
    const head = stageHeaderOf({
      simTimeS: 400,
      recording,
      observations: observationsAt(recording, 400),
      driverName: 'the plain baseline',
    });
    /*
     * `p3` arrived at 100 and never boards, so at t = 400 the maximum is a **lower bound**. Drawing
     * `300 s` flat would be the same class of false statement as a whole-run figure at a part-way
     * playhead: a bound presented as a realised wait.
     */
    expect(head.figures[2]?.value).toBe('300 s and counting');
  });

  it('is a fold at the playhead — every figure moves with t and none is the whole run', () => {
    const recording = aDay();
    const at = (t: number) =>
      stageHeaderOf({
        simTimeS: t,
        recording,
        observations: observationsAt(recording, t),
        driverName: 'the plain baseline',
      });
    const longestAt = (t: number): number =>
      Number.parseFloat(at(t).figures[2]?.value.replace(/[^0-9.]/gu, '') || '0');

    /*
     * § D293 as a property rather than a grep. The longest-so-far is non-decreasing in `t` and is
     * *strictly* smaller early than late — a screen that published `summary.serviceLevel.longestWaitS`
     * would be flat across all four samples, which is exactly what § D307 caught on the stage banner
     * (*127 undelivered at 00:00 and still 127 at 704 s*).
     */
    const samples = [50, 150, 300, 600];
    let previous = -1;
    for (const t of samples) {
      const value = longestAt(t);
      expect(value, `longest at ${String(t)}s`).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(longestAt(50)).toBeLessThan(longestAt(600));
  });

  it('names the run’s own threshold in the ratio’s caption rather than assuming 60 s', () => {
    const recording = syntheticRecording({ summary: { longWaitThresholdS: 45 } });
    const head = stageHeaderOf({
      simTimeS: 0,
      recording,
      observations: observationsAt(recording, 0),
      driverName: 'x',
    });
    expect(head.figures[0]?.label).toBe('away inside 45 s');
    const sixty = syntheticRecording({ summary: { longWaitThresholdS: 60 } });
    expect(
      stageHeaderOf({
        simTimeS: 0,
        recording: sixty,
        observations: observationsAt(sixty, 0),
        driverName: 'x',
      }).figures[0]?.label,
    ).toBe('away inside a minute');
  });

  it('says the recording has no named phase rather than inventing one from the clock', () => {
    /* `demandPhases` is legally empty — a pre-version-7 record, or a template that would not
       resolve. `Morning rush` derived from the hour would be a claim about demand nobody measured. */
    const recording = syntheticRecording({ demandPhases: [] });
    const head = stageHeaderOf({
      simTimeS: 100,
      recording,
      observations: observationsAt(recording, 100),
      driverName: 'x',
    });
    expect(head.phase).toBe(STAGE_NO_PHASE);
  });

  it('reads the clock through live/timeline.ts, so 06:00 is the start of the day', () => {
    const recording = syntheticRecording();
    const head = stageHeaderOf({
      simTimeS: 0,
      recording,
      observations: observationsAt(recording, 0),
      driverName: 'x',
    });
    /* § 7.3: *the stage always enters paused, at 06:00*. That is `DAY_START_S`, not a literal here. */
    expect(head.clock).toBe('06:00');
    expect(
      stageHeaderOf({
        simTimeS: 0,
        recording,
        observations: observationsAt(recording, 0),
        dayStartS: 9 * 3600,
        driverName: 'x',
      }).clock,
    ).toBe('09:00');
  });
});

/* -------------------------------------------------------------------------- *
 * § 7.2's alarm strip
 * -------------------------------------------------------------------------- */

describe('§ 7.2 — the alarm strip', () => {
  const crowdOf = (size: number) =>
    syntheticRecording({
      endedAt: 600,
      legs: Array.from({ length: size }, (_unused, index) => waitingLeg(`p${String(index)}`, 1)),
    });

  it('appears above forty standing and not at forty', () => {
    /* § 7.2's own wording is *more than forty*, so the boundary is exclusive. */
    const at = (size: number): string | undefined =>
      stageAlarmOf(observationsAt(crowdOf(size), 100), (id) => id);
    expect(at(STAGE_ALARM_STANDING)).toBeUndefined();
    expect(at(STAGE_ALARM_STANDING + 1)).toMatch(/41 people waiting/);
  });

  it('names the floor the stack is actually on rather than assuming the lobby', () => {
    const line = stageAlarmOf(observationsAt(crowdOf(60), 100), () => 'Level 12');
    expect(line).toMatch(/deepest at Level 12/);
  });
});

/* -------------------------------------------------------------------------- *
 * § 7.6 — the intervention control
 * -------------------------------------------------------------------------- */

describe('§ 7.6 — the intervention control', () => {
  it('ships one arm per InterventionChange kind this build has', () => {
    /*
     * The claim the docstring makes, checked: a row carries the whole `change`, so an arm is
     * buildable here exactly when this screen holds everything that change needs. The kind union
     * has three members and this table has one — the other two need a chosen profile (§ 11's
     * workshop) and an answered incident (§ 7.5's dock), neither of which this screen holds.
     */
    expect(STAGE_INTERVENTIONS.map((arm) => arm.change.kind)).toEqual(['park-cars-lobby']);
    for (const arm of STAGE_INTERVENTIONS) {
      expect(arm.label.length).toBeGreaterThan(4);
      expect(arm.explains).toMatch(/re-simulates/);
    }
  });

  it('stamps the latest change at or before the playhead, and nothing later', () => {
    const view = (t: number) =>
      stageInterventionsOf({
        interventions: [{ atS: 300, change: { kind: 'park-cars-lobby' } }],
        simTimeS: t,
        hasRun: true,
        dayClosed: false,
        recomputing: false,
      });
    /* A player who scrubs back past their own intervention sees the stamp disappear — at that
       instant on the stage it has not happened yet. */
    expect(view(299).stamp).toBe('');
    expect(view(300).stamp).toMatch(/^06:05 · parked the cars in the lobby$/);
  });

  it('refuses in words on each ground, and never with a bare disabled button', () => {
    const refusalOf = (flags: {
      hasRun: boolean;
      dayClosed: boolean;
      recomputing: boolean;
    }): string | undefined =>
      stageInterventionsOf({ interventions: [], simTimeS: 0, ...flags }).refusal;

    expect(refusalOf({ hasRun: false, dayClosed: false, recomputing: false })).toMatch(
      /no day is running/,
    );
    expect(refusalOf({ hasRun: true, dayClosed: true, recomputing: false })).toMatch(/filed/);
    expect(refusalOf({ hasRun: true, dayClosed: false, recomputing: true })).toBe(
      STAGE_RECOMPUTING,
    );
    expect(refusalOf({ hasRun: true, dayClosed: false, recomputing: false })).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * § 3.3's row
 * -------------------------------------------------------------------------- */

describe('§ 3.3 — the stage row, refined', () => {
  const state = { screen: 'stage', ctx: 'daily' } as const;

  it('is the table’s own row on a running day', () => {
    const bar = stageBarModelOf(state, { hasRun: true, dayClosed: false, recomputing: false });
    expect(bar.primary.label).toBe('Close the day');
    expect(bar.primary.inert).toBeUndefined();
    expect(bar.note).toBe('Stops the clock and writes the report.');
  });

  it('resolves the primary inert with a reason on every state the table cannot know', () => {
    for (const flags of [
      { hasRun: false, dayClosed: false, recomputing: false },
      { hasRun: true, dayClosed: false, recomputing: true },
      { hasRun: true, dayClosed: true, recomputing: false },
    ]) {
      const bar = stageBarModelOf(state, flags);
      /* Inert *and* explained — and the explanation is on the primary itself, which is the cell
         the shell draws and binds to the button. A disabled button with the table's note still
         under it would be telling the player it stops a clock that is not running. */
      expect(bar.primary.inert, JSON.stringify(flags)).toBe(bar.note);
      expect(bar.note, JSON.stringify(flags)).not.toBe('Stops the clock and writes the report.');
      expect((bar.note ?? '').length).toBeGreaterThan(10);
    }
  });

  /**
   * The fourth state — GitHub issue **#287**'s fourth criterion, and the one that goes the other
   * way from the three above.
   *
   * A day that has run out and not been filed is the state in which the primary is *most* worth
   * pressing, so the row explains and does not refuse. Asserted as a pair, because half of it —
   * a note that changed — would pass just as well against a build that had also disabled the
   * button, which is the thing this state must not do.
   */
  it('says the day has run out, and leaves the primary pressable', () => {
    const bar = stageBarModelOf(state, {
      hasRun: true,
      dayClosed: false,
      recomputing: false,
      dayEnded: true,
    });
    expect(bar.note).toBe(STAGE_DAY_OVER);
    expect(bar.primary.inert).toBeUndefined();
    expect(bar.primary.label).toBe('Close the day');
  });

  /**
   * And the ordering, asserted rather than left to the reading order of a ternary.
   *
   * A filed day's transport is also sitting at the end of the run, so both facts are true at once
   * and only one sentence can be on the row. *Filed* wins: the newer fact would otherwise shout
   * over the older one and point a player at a button that is already inert. The `recomputing` and
   * *no run yet* arms are checked in the same breath — the first because a re-simulation replaces
   * the transport, the second because `dayEnded` cannot be true without a run and a caller that
   * passed both anyway must not get a sentence about closing a day that does not exist.
   */
  it('lets each refusal outrank it, so the row never points at an inert button', () => {
    for (const flags of [
      { hasRun: true, dayClosed: true, recomputing: false, dayEnded: true },
      { hasRun: true, dayClosed: false, recomputing: true, dayEnded: true },
      { hasRun: false, dayClosed: false, recomputing: false, dayEnded: true },
    ]) {
      const bar = stageBarModelOf(state, flags);
      expect(bar.note, JSON.stringify(flags)).not.toBe(STAGE_DAY_OVER);
      expect(bar.primary.inert, JSON.stringify(flags)).toBe(bar.note);
    }
  });

  /**
   * And the sentence itself, checked against **every** run context this one screen serves.
   *
   * The first draft instructed — *"close it and its report is written"* — and § 3.3 gives the stage
   * primary a different verb in each context: *Close the day*, *End the rush*, and on `watch`
   * *Play this crowd yourself*, where § 14.1 forbids closing the day at all. So the assertion is
   * two-sided: the note is the **same** sentence everywhere (a per-context note would be four
   * sentences to keep true instead of one), and it contains **none** of the primaries' verbs, which
   * is what stops it from ever contradicting the button beside it.
   *
   * Derived from `RUN_CONTEXTS` rather than from a list here, so a fifth context arrives in this
   * assertion instead of quietly skipping it.
   */
  it('says the same thing in every run context, and instructs in none of them', () => {
    const ended = { hasRun: true, dayClosed: false, recomputing: false, dayEnded: true } as const;
    for (const ctx of RUN_CONTEXTS) {
      const bar = stageBarModelOf({ screen: 'stage', ctx }, ended);
      expect(bar.note, ctx).toBe(STAGE_DAY_OVER);
      /*
       * The button's own words, whatever they are in this context, must not appear in the note.
       * Compared in lower case on the whole label: `Play this crowd yourself` inside a sentence
       * would be as wrong as `Close the day` is, and neither is a thing a caveat should be saying.
       */
      expect(STAGE_DAY_OVER.toLowerCase(), ctx).not.toContain(bar.primary.label.toLowerCase());
    }
  });

  /**
   * The default, which is every caller written before the field existed.
   *
   * `dayEnded` is optional, so `honesty/surfaces.ts` and `everyday/stageScreen.ts`'s three older
   * states compile untouched. An optional flag whose absent arm was never asserted is how a
   * default quietly becomes the wrong one.
   */
  it('is the table’s own row again when nobody says whether the day ended', () => {
    const bar = stageBarModelOf(state, { hasRun: true, dayClosed: false, recomputing: false });
    expect(bar.note).toBe('Stops the clock and writes the report.');
    expect(stageBarModelOf(state, { ...{ hasRun: true, dayClosed: false, recomputing: false }, dayEnded: false }).note).toBe(
      'Stops the clock and writes the report.',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * § 6.4 / issue #206 — where the press lands
 * -------------------------------------------------------------------------- */

describe('§ 6.4 — where *Close the day* leaves the player', () => {
  const filed = { dayClosed: true, hasReport: true } as const;

  it('opens the report in the two flows whose report § 3.3 numbers, and in no other', () => {
    /*
     * Every context the product has, from the value the tree derives its sweeps from — a fifth
     * added to `RUN_CONTEXTS` arrives here rather than being quietly omitted. `rush` presses this
     * same primary under the label *End the rush* and § 3.3 gives its report no timeline; a watched
     * day is somebody else's and § 14.1 forbids closing it at all.
     */
    const landing = Object.fromEntries(
      RUN_CONTEXTS.map((ctx) => [ctx, stageFilingLandsOn(ctx, filed)]),
    );
    expect(landing).toEqual({
      daily: 'report',
      campaign: 'report',
      rush: undefined,
      watch: undefined,
    });
  });

  it('stays put on every outcome that is not a filed day with a sheet behind it', () => {
    /*
     * `closeShift`'s three silent early returns — a run nobody started, a run this shell did not
     * simulate, an already-filed one — all return normally having written nothing, so a press that
     * navigated on *having been pressed* would send the player to an empty sheet. These are the
     * outcomes those returns leave on the host.
     */
    for (const outcome of [
      { dayClosed: false, hasReport: false },
      { dayClosed: false, hasReport: true },
      { dayClosed: true, hasReport: false },
    ]) {
      for (const ctx of RUN_CONTEXTS) {
        expect(stageFilingLandsOn(ctx, outcome), `${ctx} ${JSON.stringify(outcome)}`).toBeUndefined();
      }
    }
  });

  it('asks § 3.3’s table rather than a list of context names kept beside it', () => {
    /*
     * The derivation, asserted rather than described: the answer is exactly *does this context's
     * report row carry a timeline*. If the two ever disagree, the copy that is wrong is this one.
     */
    for (const ctx of RUN_CONTEXTS) {
      const numbered = actionBarFor({ screen: 'report', ctx }).timeline !== undefined;
      expect(stageFilingLandsOn(ctx, filed) === 'report', ctx).toBe(numbered);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * § 14 — the caps, and the cutaway's arithmetic
 * -------------------------------------------------------------------------- */

describe('§ 14 — a crowd of 400 must not cost a frame', () => {
  it('caps a landing at 26 figures and says how many it did not draw', () => {
    expect(stageCrowdCapOf(26)).toEqual({ drawn: 26, overflow: undefined });
    expect(stageCrowdCapOf(400)).toEqual({ drawn: MAX_LANDING_FIGURES, overflow: '+374' });
    expect(stageCrowdCapOf(0)).toEqual({ drawn: 0, overflow: undefined });
  });

  it('holds the guide’s two numbers', () => {
    expect(MAX_LANDING_FIGURES).toBe(26);
    expect(MAX_CAR_RIDERS).toBe(9);
  });
});

describe('the cutaway’s geometry', () => {
  const floors = [
    /* An 8 m lobby under 3.5 m upper floors — the case `render/layout.ts` exists to get right. */
    { ...syntheticFloor('L0', 0, 'Lobby'), heightM: 0 },
    { ...syntheticFloor('L1', 1), heightM: 8 },
    { ...syntheticFloor('L2', 2, 'Level 2'), heightM: 11.5 },
    { ...syntheticFloor('L3', 3), heightM: 15 },
  ];
  const shafts = [syntheticShaft('main-A', 'A'), syntheticShaft('main-B', 'B')];
  const geometry = () =>
    stageGeometryOf({ width: 800, height: 340, floors, shafts, outOfServiceCarIds: ['main-B'] });

  it('maps height continuously and linearly, so an S-curve stays an S-curve', () => {
    const g = geometry();
    /*
     * The claim `render/layout.ts` makes and this renderer must keep: a car's y is a function of its
     * height in metres, not a lookup of the floor it is nearest. Quantising it would put the
     * jerk-limited profile `frameAt` evaluates back into a jump at the last moment.
     */
    const a = g.yForHeight(0);
    const b = g.yForHeight(7.5);
    const c = g.yForHeight(15);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(b - c).toBeCloseTo(a - b, 6);
    /* And a floor's own row sits exactly on that function — one calculation, not two agreeing. */
    for (const row of g.rows) expect(row.y).toBeCloseTo(g.yForHeight(row.heightM), 9);
  });

  it('keeps every row and thins only labels, never the entrance', () => {
    const tall = Array.from({ length: 60 }, (_unused, index) => ({
      ...syntheticFloor(`L${String(index)}`, index),
      heightM: index * 3.2,
    }));
    const g = stageGeometryOf({ width: 800, height: 340, floors: tall, shafts });
    expect(g.rows).toHaveLength(60);
    expect(g.rows.filter((row) => row.labelled).length).toBeLessThan(60);
    /* The row a reader orients by is never thinned out — `RV-09`'s rule, kept. */
    expect(g.rows.find((row) => row.isEntrance)?.labelled).toBe(true);
  });

  it('lays the wells out inside the plot, without overlap, and flags the withdrawn car', () => {
    const g = geometry();
    expect(g.columns.map((column) => column.carId)).toEqual(['main-A', 'main-B']);
    expect(g.columns[1]?.outOfService).toBe(true);
    expect(g.columns[0]?.outOfService).toBe(false);
    for (const column of g.columns) {
      expect(column.x).toBeGreaterThanOrEqual(g.landing.x + g.landing.width - 0.001);
      expect(column.x + column.width).toBeLessThanOrEqual(g.plot.x + g.plot.width + 0.001);
    }
    const first = g.columns[0];
    const second = g.columns[1];
    if (first === undefined || second === undefined) throw new Error('two columns expected');
    expect(first.x + first.width).toBeLessThanOrEqual(second.x);
  });

  it('draws a one-floor building rather than dividing by a zero span', () => {
    const g = stageGeometryOf({
      width: 400,
      height: 200,
      floors: [{ ...syntheticFloor('L0', 0, 'Lobby'), heightM: 4 }],
      shafts,
    });
    expect(Number.isFinite(g.yForHeight(4))).toBe(true);
    expect(Number.isFinite(g.rows[0]?.y ?? Number.NaN)).toBe(true);
  });

  it('refuses to produce a negative box for a viewport smaller than its own padding', () => {
    /* A canvas is measured from a bounding rect, and a rect can be small while a panel animates.
       Geometry that went negative would draw a building inside out. */
    const g = stageGeometryOf({ width: 10, height: 10, floors, shafts });
    expect(g.plot.width).toBeGreaterThan(0);
    expect(g.plot.height).toBeGreaterThan(0);
    expect(g.landing.width).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The register
 * -------------------------------------------------------------------------- */

describe('the stage’s own register of absences', () => {
  it('names the ghost lane, the campaign dock and the two unbuilt intervention arms', () => {
    const joined = STAGE_ABSENCES.join('\n');
    expect(joined).toMatch(/ghost/);
    /*
     * **Keyed on subjects rather than on section numbers** — GitHub issue #207 took the numbers off
     * every player-facing string, so `/§ 7\.5/` and `/§ 7\.6/` had nothing left to match. The two
     * rows they identified are the campaign dock and the two unbuilt intervention arms, which is
     * what this case's own name has always said it was checking.
     */
    expect(joined).toMatch(/no campaign dock/);
    expect(joined).toMatch(/no decisions during a run/);
    for (const absence of STAGE_ABSENCES) expect(absence.length).toBeGreaterThan(20);
  });
});

/* -------------------------------------------------------------------------- *
 * § 7.2 — the car, and the door that reads as a seam rather than a wash
 * -------------------------------------------------------------------------- */

/**
 * **GitHub issue #212's first defect, as three properties** — `docs/28-art-direction.md` AD-S1 to
 * AD-S3, which is where they are stated and where the acceptance is written:
 *
 * > `stageScreenModel.ts` gains the doorway arithmetic — a pure function from
 * > `(bodyWidth, carHeight, doorFraction)` to the leaf rectangles — so all three rules are
 * > checkable without a canvas: assert that the ink margin is non-zero at `doorFraction` 0, 0.5 and
 * > 1; assert that the leaf rectangles at 0 and at 1 differ in shape and not only in area; assert
 * > that the mark grid and the doorway do not intersect.
 *
 * The sizes below are **measured**, not invented: they are what `stageGeometryOf` produces for the
 * shipped buildings at the stage's own 340 px canvas across the viewport range the shell allows.
 * `garden-apartments` is the widest car (222 px), `secure-tower` the shortest (9 px), and
 * `vertical-city` — 35 cars across seven banks — is the only shipped building that reaches the two
 * hairline branches. A rule that held at 222 px and failed at 5 px would be a rule that held on the
 * building nobody has trouble reading.
 */
describe('§ 7.2 — a car with shut doors reads as a car', () => {
  /** `[bodyWidth, carHeight]` — see the suite docstring for where each pair comes from. */
  const SHIPPED_SIZES: readonly (readonly [number, number])[] = [
    [222, 20], // garden-apartments, wide viewport
    [109.6, 12.2], // midtown-office
    [72.1, 13.4], // chancery-house
    [47, 9], // secure-tower, narrow viewport — the shortest car that ships
    [25.2, 20], // mixed-use-high-rise
    [9.9, 20], // vertical-city, wide viewport — the narrowest car with a doorway
    [5.6, 20], // vertical-city, mid viewport — the seam branch
    [2.4, 20], // vertical-city, narrow viewport — no amber at all
  ];
  const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

  const paintAt = (bodyWidth: number, carHeight: number, doorFraction: number, occupants = 9) =>
    stageCarPaintOf({ bodyWidth, carHeight, doorFraction, occupants });

  /**
   * **The defect itself, as a number.**
   *
   * The old arithmetic was `leaf = ((width − 3) / 2) × (1 − doorFraction)` from each outer edge, so
   * at `doorFraction = 0` the two leaves covered the whole body: the amber share was **100 %** of
   * the car, less the 1.5 px inset — and a car is shut for most of a run. Anything that leaves the
   * car mostly amber is that defect back, so the assertion is on the share rather than on the
   * geometry that produces it.
   */
  it('paints at most a fifth of a shut car amber, at every size that ships', () => {
    for (const [bodyWidth, carHeight] of SHIPPED_SIZES) {
      const paint = paintAt(bodyWidth, carHeight, 0);
      const share = paint.amberAreaPx / (bodyWidth * carHeight);
      expect(share, `${String(bodyWidth)}×${String(carHeight)} shut`).toBeLessThan(0.25);
      /* And the old formula's own answer, so the case cannot pass by drawing nothing anywhere. */
      const wasAmber = ((bodyWidth / 2) * 1) * 2 * (carHeight - 3);
      expect(paint.amberAreaPx).toBeLessThan(wasAmber / 3);
    }
  });

  /** AD-S1 — *the car's identity is its body, never its door.* Amber is a doorway, never a face. */
  it('keeps an ink margin on all four sides of the amber at every door fraction', () => {
    for (const [bodyWidth, carHeight] of SHIPPED_SIZES) {
      for (const fraction of FRACTIONS) {
        const paint = paintAt(bodyWidth, carHeight, fraction);
        if (paint.leaves.length === 0) continue;
        expect(
          paint.inkMarginPx,
          `${String(bodyWidth)}×${String(carHeight)} at ${String(fraction)}`,
        ).toBeGreaterThanOrEqual(1);
        /* And the margin is a fact about the rectangles, not a number the plan asserts of itself. */
        for (const leaf of paint.leaves) {
          expect(leaf.x).toBeGreaterThanOrEqual(paint.inkMarginPx - 1e-9);
          expect(leaf.y).toBeGreaterThanOrEqual(paint.inkMarginPx - 1e-9);
          expect(bodyWidth - (leaf.x + leaf.width)).toBeGreaterThanOrEqual(paint.inkMarginPx - 1e-9);
          expect(carHeight - (leaf.y + leaf.height)).toBeGreaterThanOrEqual(
            paint.inkMarginPx - 1e-9,
          );
        }
      }
    }
  });

  /**
   * AD-S2 — *shut is a seam; open is a gap*, and the difference is **shape**.
   *
   * The rule names its own reason: `vertical-city` draws a car roughly nine times narrower than
   * `midtown-office` does, and at that end an area-only difference is a difference nobody can see.
   * So the measured quantity is the width of the **ink channel between the leaves** — one pixel
   * when the doors are shut, the whole doorway when they are open.
   */
  it('changes the shape of the gap between the leaves, not only the amber area', () => {
    for (const [bodyWidth, carHeight] of SHIPPED_SIZES) {
      const shut = paintAt(bodyWidth, carHeight, 0);
      const open = paintAt(bodyWidth, carHeight, 1);
      const doorway = shut.doorway;
      if (doorway === undefined) {
        /* The hairline branches: the seam is drawn shut and omitted open, which is the shape. */
        expect(open.leaves).toHaveLength(0);
        continue;
      }
      expect(shut.leaves).toHaveLength(2);
      const [left, right] = shut.leaves;
      if (left === undefined || right === undefined) throw new Error('two leaves expected');
      const shutGap = right.x - (left.x + left.width);
      expect(shutGap).toBeCloseTo(1, 6);
      /* Wide open, the interior is the whole doorway: nothing of it is amber. */
      expect(open.leaves).toHaveLength(0);
      expect(shutGap).toBeLessThan(doorway.width / 2);
    }
  });

  /** AD-S3 — *nothing that must be counted sits on amber.* Met by the band split, not by a clamp. */
  it('never lets an occupancy mark overlap a door leaf, at any fraction or size', () => {
    for (const [bodyWidth, carHeight] of SHIPPED_SIZES) {
      for (const fraction of FRACTIONS) {
        const paint = paintAt(bodyWidth, carHeight, fraction);
        for (const mark of paint.marks) {
          for (const leaf of [...paint.leaves, ...(paint.doorway === undefined ? [] : [paint.doorway])]) {
            const overlaps =
              mark.x < leaf.x + leaf.width - 1e-9 &&
              leaf.x < mark.x + mark.width - 1e-9 &&
              mark.y < leaf.y + leaf.height - 1e-9 &&
              leaf.y < mark.y + mark.height - 1e-9;
            expect(
              overlaps,
              `${String(bodyWidth)}×${String(carHeight)} at ${String(fraction)}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('draws every mark inside the car, and never more than the guide’s nine', () => {
    for (const [bodyWidth, carHeight] of SHIPPED_SIZES) {
      const paint = paintAt(bodyWidth, carHeight, 0, 40);
      expect(paint.marks.length).toBeLessThanOrEqual(MAX_CAR_RIDERS);
      for (const mark of paint.marks) {
        expect(mark.x).toBeGreaterThanOrEqual(0);
        expect(mark.y).toBeGreaterThanOrEqual(0);
        expect(mark.x + mark.width).toBeLessThanOrEqual(bodyWidth + 1e-9);
        expect(mark.y + mark.height).toBeLessThanOrEqual(carHeight + 1e-9);
      }
      expect(paintAt(bodyWidth, carHeight, 0, 0).marks).toHaveLength(0);
      /*
       * One mark per rider, up to the cap — **on every car that can hold a mark at all**. The
       * 2.4 px car cannot: a mark that fitted inside it would be under a pixel wide, so the plan
       * draws none rather than one nobody can see hanging over the body's edge. Asserted as its own
       * branch below rather than excused by a loosened bound here.
       */
      if (paint.marks.length > 0) {
        expect(paintAt(bodyWidth, carHeight, 0, 4).marks).toHaveLength(4);
      }
    }
  });

  it('drops the marks rather than hanging them off a car too narrow to hold one', () => {
    /* `vertical-city` on a narrow viewport: 35 cars across seven banks, 2.4 px of body each. */
    expect(paintAt(2.4, 20, 0, 9).marks).toHaveLength(0);
    expect(paintAt(2.4, 20, 0, 9).leaves).toHaveLength(0);
    /* And the size directly above it still draws all nine — the cliff is where it says it is. */
    expect(paintAt(5.6, 20, 0, 9).marks).toHaveLength(MAX_CAR_RIDERS);
  });

  /**
   * **Move the control and require the drawing to change** — the standing requirement, pointed at
   * the one input this function exists to be a function of.
   *
   * Compared on the rectangles rather than on a summary of them: a plan that answered the same
   * rectangles at 0 and at 1 would satisfy every area assertion above by drawing the same thing
   * twice.
   */
  it('answers a different plan at every door fraction a car passes through', () => {
    const plans = FRACTIONS.map((fraction) => JSON.stringify(paintAt(72.1, 13.4, fraction).leaves));
    expect(new Set(plans).size).toBe(FRACTIONS.length);
  });

  it('never produces a rectangle with a negative or infinite side', () => {
    for (const [bodyWidth, carHeight] of [...SHIPPED_SIZES, [0, 0], [3, 3], [-4, 12]] as const) {
      for (const fraction of [-1, 0, 0.5, 1, 2]) {
        const paint = paintAt(bodyWidth, carHeight, fraction);
        for (const rect of [...paint.leaves, ...paint.marks, paint.body]) {
          expect(Number.isFinite(rect.x + rect.y + rect.width + rect.height)).toBe(true);
          expect(rect.width).toBeGreaterThanOrEqual(0);
          expect(rect.height).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The three strings the mount used to compose — § D347
 * -------------------------------------------------------------------------- */

describe('the words the cutaway says about a car', () => {
  it('publishes the head count over the shaft’s own capacity', () => {
    expect(stageCarReadoutOf({ occupants: 4, capacityPersons: 10, direction: 0 })).toEqual({
      occupancy: '4/10',
      direction: undefined,
    });
  });

  /* A ratio with half a denominator is worse than a count: `4/` says the capacity is unknown by
     looking like a typo. `VizShaft.capacityPersons` is legally absent on a restored recording. */
  it('falls back to the bare count when the record carries no capacity', () => {
    expect(stageCarReadoutOf({ occupants: 4, direction: 0 }).occupancy).toBe('4');
  });

  it('shows an arrow only while the car is travelling', () => {
    expect(stageCarReadoutOf({ occupants: 0, direction: 1 }).direction).toBe('▲');
    expect(stageCarReadoutOf({ occupants: 0, direction: -1 }).direction).toBe('▼');
    expect(stageCarReadoutOf({ occupants: 0, direction: 0 }).direction).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * AD-S4 / AD-S5 — what the opening frame says, and where it gets it
 * -------------------------------------------------------------------------- */

describe('what the stage says the day is about to do', () => {
  const scheduled = (): VizRecording =>
    syntheticRecording({
      startedAt: 0,
      endedAt: 1800,
      demandPhases: [
        {
          id: '0-flat',
          kind: 'flat',
          label: 'QUIET',
          startS: 0,
          endS: 300,
          startIntensity: 0,
          endIntensity: 0,
          ratePctPop5min: null,
          inReportWindow: false,
        },
        {
          id: '1-ramp-up',
          kind: 'ramp-up',
          label: 'FILLING',
          startS: 300,
          endS: 1800,
          startIntensity: 0,
          endIntensity: 1,
          ratePctPop5min: 8.2,
          inReportWindow: true,
        },
      ],
    });

  /**
   * AD-S4, and the half of #212 that survived its own rewrite.
   *
   * The playhead does not move; what the header gains is the **schedule's** next move. It is an
   * input to the run — the resolved template's own phases, on the record before a passenger was
   * generated — so it is not R6's *outcome evaluated early*.
   */
  it('names the next stretch of the schedule and the hour it starts', () => {
    /* 08:30 is `rise-and-fall`'s declared hour, and the shipped default's. */
    expect(stageNextStretchOf(scheduled(), 0, 8.5 * 3600)).toBe('FILLING from 08:35');
  });

  it('says nothing once the playhead is inside the last stretch', () => {
    expect(stageNextStretchOf(scheduled(), 1200, 8.5 * 3600)).toBeUndefined();
  });

  /* A record with no schedule draws one unlabelled band, so there is no next stretch to name.
     Inventing one from the clock is the claim `STAGE_NO_PHASE` exists to refuse, one segment on. */
  it('says nothing at all about a record that carries no schedule', () => {
    expect(stageNextStretchOf(syntheticRecording({}), 0)).toBeUndefined();
  });

  /** AD-S5 — the difference between an empty screen and an empty screen that says it is early. */
  it('opens on the run’s own hour and what happens next, never on a constant', () => {
    const line = stageOpeningLineOf({ recording: scheduled(), simTimeS: 0, dayStartS: 8.5 * 3600 });
    expect(line).toBe(
      'Paused at 08:30, the start of the day. Nothing has happened yet — FILLING from 08:35.',
    );
    /* The stale claim this screen carried for two waves: `06:00` is the fallback, not the hour. */
    expect(line).not.toContain('06:00');
  });

  it('still says where the playhead is when the schedule has nothing after it', () => {
    expect(stageOpeningLineOf({ recording: syntheticRecording({}), simTimeS: 0 })).toBe(
      'Paused at 06:00, the start of the day. Nothing has happened yet.',
    );
  });

  it('is the same fact the header pill draws, not a second derivation', () => {
    const recording = scheduled();
    const head = stageHeaderOf({
      simTimeS: 0,
      recording,
      observations: observationsAt(recording, 0),
      dayStartS: 8.5 * 3600,
      driverName: 'the plain baseline',
    });
    expect(head.next).toBe(stageNextStretchOf(recording, 0, 8.5 * 3600));
    expect(stageOpeningLineOf({ recording, simTimeS: 0, dayStartS: 8.5 * 3600 })).toContain(
      head.next ?? 'nothing',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * AD-S17 — the rest bar's geometry
 * -------------------------------------------------------------------------- */

/**
 * **The plan, not the paint** — `stageCarPaintOf`'s split, applied to the mark beside it.
 *
 * GitHub issue #212's lesson is why this is a function with a test rather than four numbers in the
 * mount: the door-fill inversion was arithmetic nothing could check without a canvas and it shipped
 * for a wave. A bar whose whole magnitude channel is its *length* is that shape of claim exactly —
 * a sign error would put the longest mark on the car that has just stopped, and the picture would
 * still look plausible.
 */
describe('stageCarRestBarOf — where the mark lands and how big it gets', () => {
  it('centres on the car and never spills past its body', () => {
    for (const fill of [0, 0.5, 1]) {
      const bar = stageCarRestBarOf({ bodyWidth: 30, fill });
      expect(bar.x + bar.width / 2, `fill ${String(fill)} is centred`).toBeCloseTo(15, 6);
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(30);
    }
  });

  it('sits above the roof, clear of the riders/capacity readout', () => {
    /*
     * Body coordinates, so `(0, 0)` is the car's top-left and a negative `y` is above it. The
     * readout is drawn at `y − 1.5` with a bottom baseline, so an 8.5 px face occupies roughly
     * `y − 10` to `y − 1.5`; the bar's underside is at `y − 10`. A mark that overlapped a live
     * figure would make the figure the thing that got harder to read.
     */
    const bar = stageCarRestBarOf({ bodyWidth: 30, fill: 1 });
    expect(bar.y).toBeLessThan(0);
    expect(bar.y + bar.height).toBeLessThanOrEqual(-10);
  });

  it('is longer the longer the car has stood, on every car width the product draws', () => {
    // 2.4 px is `vertical-city`'s narrowest car; 222 px is `garden-apartments` on a wide viewport.
    for (const bodyWidth of [2.4, 8, 30, 222]) {
      const shortest = stageCarRestBarOf({ bodyWidth, fill: 0 }).width;
      const longest = stageCarRestBarOf({ bodyWidth, fill: 1 }).width;
      expect(longest, `body ${String(bodyWidth)} px`).toBeGreaterThanOrEqual(shortest);
      // And it is a bar rather than a speck even where the car is a hairline.
      expect(shortest).toBeGreaterThanOrEqual(3);
    }
  });

  it('takes its length from render/carRest.ts rather than deciding one here', () => {
    /*
     * The two stages must not disagree about what the mark *means*. The Engineer bar and this one
     * are two paints of one rule, exactly as a rider capsule here and the Engineer mood card are
     * two paints of one banding — so the length is asserted against the shared function rather than
     * against a literal.
     */
    for (const fill of [0, 0.25, 1]) {
      expect(stageCarRestBarOf({ bodyWidth: 44, fill }).width).toBe(restBarWidthPx(fill, 44));
    }
  });
});
