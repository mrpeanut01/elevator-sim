/**
 * **The § 7 stage's pure half**, driven without a document.
 *
 * Three claims carry this suite, and each is one the stage would ship broken without it.
 *
 * 1. **§ 4.6's speeds are one array indexed twice.** The contract says so outright and names the
 *    failure: two parallel lists let `12×` be drawn over a multiplier of 600, and nothing on
 *    screen would say so. The case below reads the label and the multiplier off the *same element*
 *    and compares the pair against § 4.6's table, so a re-ordering of either half fails.
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

import { WAIT_BANDS } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { syntheticRecording, servedLeg, waitingLeg } from '../live/synthetic.test-helper.js';
import { syntheticFloor, syntheticShaft } from '../live/synthetic.test-helper.js';
import { EVERYDAY_COLORS } from './tokens.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  MAX_CAR_RIDERS,
  MAX_LANDING_FIGURES,
  stageAlarmOf,
  stageBandOf,
  stageBarModelOf,
  stageCrowdCapOf,
  stageGeometryOf,
  stageHeaderOf,
  stageInkFor,
  stageInterventionsOf,
  stageLegend,
  stageSpeedAt,
  STAGE_ABSENCES,
  STAGE_ALARM_STANDING,
  STAGE_BAND_INK,
  STAGE_INTERVENTIONS,
  STAGE_NO_PHASE,
  STAGE_RECOMPUTING,
  STAGE_SPEEDS,
} from './stageScreenModel.js';

/* -------------------------------------------------------------------------- *
 * § 4.6 — the transport
 * -------------------------------------------------------------------------- */

describe('§ 4.6 — the speed table', () => {
  /**
   * ENGINE_CONTRACT § 4.6, transcribed a second time here and compared cell by cell — the same
   * device `actionBar.test.ts` uses for § 3.3's table. A drift in either direction fails.
   */
  const CONTRACT: readonly (readonly [string, number])[] = [
    ['½×', 8],
    ['1×', 30],
    ['4×', 90],
    ['12×', 240],
    ['30×', 600],
  ];

  it('is one array indexed twice — the label and the multiplier come off the same element', () => {
    expect(STAGE_SPEEDS).toHaveLength(CONTRACT.length);
    for (const [index, [label, simPerRealS]] of CONTRACT.entries()) {
      const speed = stageSpeedAt(index);
      /*
       * Read through the one accessor, so a screen that took its label from one place and its
       * multiplier from another could not satisfy this. That is the § 20.12 failure in a line: a
       * button reading `12×` over a clock running at 600.
       */
      expect([speed.label, speed.simPerRealS], `speed ${String(index + 1)}`).toEqual([
        label,
        simPerRealS,
      ]);
    }
  });

  it('holds every multiplier inside the transport’s own legal range', () => {
    /* `playback/mapping.ts`'s `[MIN_SPEED, MAX_SPEED]`. A speed button that threw on press would
       be a control that does nothing, loudly. */
    for (const speed of STAGE_SPEEDS) {
      expect(speed.simPerRealS).toBeGreaterThanOrEqual(0.05);
      expect(speed.simPerRealS).toBeLessThanOrEqual(1000);
    }
  });

  it('opens at 1× and answers the default for an index it does not have', () => {
    expect(stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX).label).toBe('1×');
    /* A stored index from a build with more speeds must open the day, not crash it — and it must
       open it at the *default*, because § 4.6's rule is about a day never vanishing in three
       seconds. */
    expect(stageSpeedAt(99)).toEqual(stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX));
    expect(stageSpeedAt(-1)).toEqual(stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX));
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
      /* Inert *and* explained. A disabled button with the table's note still under it would be
         telling the player it stops a clock that is not running. */
      expect(bar.primary.inert, JSON.stringify(flags)).toBe(true);
      expect(bar.note, JSON.stringify(flags)).not.toBe('Stops the clock and writes the report.');
      expect((bar.note ?? '').length).toBeGreaterThan(10);
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
    expect(joined).toMatch(/§ 7\.5/);
    expect(joined).toMatch(/§ 7\.6/);
    for (const absence of STAGE_ABSENCES) expect(absence.length).toBeGreaterThan(20);
  });
});
