/**
 * **AD-S17 — what *standing still* means, and whether the mark that says it can be seen.**
 *
 * Two halves, and they fail for different reasons, which is why they are one file:
 *
 * 1. **The predicate.** A car is standing still when no move is in flight, its doors are shut, and
 *    it has been that way for thirty seconds. Every clause is asserted from both sides, because a
 *    predicate that only ever says *yes* would draw a bar over a moving car and nothing would
 *    notice — the shipped picture has no other mark in that slot to disagree with it.
 * 2. **The contrast.** [§ D336](../../../../DECISIONS.md) measured a floor on this palette and
 *    **refused a ratio of 1.83:1**; `docs/28` AD-A2 adds that the ground a mark is measured against
 *    is *the one it is actually drawn on*, which is how the wait ramp's 1.78:1 stayed invisible
 *    until somebody measured it against `cardSunk` rather than `paper`. So both inks are measured
 *    on their own composited grounds, in **both** modes, and the figures are pinned rather than
 *    eyeballed. The arithmetic is `render/theme.test.ts`'s, verbatim.
 *
 * The mark's **words** are not here, because they are not this module's: an exported declaration
 * carrying authored prose is a player-facing text producer to `honesty/derive.test.ts`, and this
 * file is a renderer's arithmetic. The duration clause is a private function in
 * `render/describeFrame.ts`, beside `directionWords` and `loadWords`, and it is asserted through
 * the paragraph it reaches in `describeFrame.test.ts`.
 *
 * ## The mark this file is about is the only one on the stage that says a lift is idle
 *
 * `docs/34-problem-per-mode.md` § 3.2 records the absence it closes and § 9 is a whole section
 * about it. Before it, an idle car was *"pixel-identical to any empty car that happens to be
 * stopped"*, and `PARK_CARS_LOBBY_LABEL` was a button with no visual consequence of its own.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, FIXTURE_DOOR_CONFIG, breadthConfig } from '../fixtures.test-helper.js';
import type { Frame, FrameCar, VizRecording, VizShaft } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';
import { WAIT_BANDS } from '../live/bands.js';
import { EVERYDAY_COLORS } from '../everyday/tokens.js';
import { DEFAULT_THEME, themeFromPalette, type Theme } from './canvas.js';
import { LIGHT_PALETTE } from './tokens.js';
import {
  CAR_REST_FULL_S,
  CAR_REST_ONSET_S,
  REST_BAR_MIN_PX,
  REST_BAR_MIN_SHARE,
  carRestAt,
  carRestsAt,
  restBarWidthPx,
} from './carRest.js';

let config: LoadedConfig;
beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

/* -------------------------------------------------------------------------- *
 * Fixtures — one shaft, one car, and nothing else
 * -------------------------------------------------------------------------- */

const EMPTY_SERIES = { times: [0], values: [0], before: 0 } as const;

function shaft(overrides: Partial<VizShaft> = {}): VizShaft {
  return {
    carId: 'main-A',
    bankId: 'main',
    label: 'A',
    startFloorId: 'G',
    startHeightM: 0,
    servedFloorIds: ['G', '2'],
    capacityPersons: 13,
    doorConfig: FIXTURE_DOOR_CONFIG,
    motions: [],
    doorMarks: [],
    occupants: EMPTY_SERIES,
    loadFactor: EMPTY_SERIES,
    ...overrides,
  };
}

function frameCar(overrides: Partial<FrameCar> = {}): FrameCar {
  return {
    carId: 'main-A',
    bankId: 'main',
    label: 'A',
    heightM: 0,
    floorId: 'G',
    direction: 0,
    doorFraction: 0,
    doorPhase: 'closed',
    occupants: 0,
    loadFactor: 0,
    ...overrides,
  };
}

/**
 * A move, with only the three times {@link carRestAt} reads filled in honestly.
 *
 * The profile and the heights are not consulted by this module at all — the whole of what it asks a
 * motion is *when were you commanded* and *when did you arrive* — so they are the shaft's own
 * geometry rather than an invented curve. Anything richer here would suggest the predicate reads
 * more than it does.
 */
function motion(commandedAt: number, arrivesAt: number): VizShaft['motions'][number] {
  return {
    profile: { phases: [], duration: arrivesAt - commandedAt, displacement: 3 },
    fromFloorId: 'G',
    fromFloorIndex: 0,
    fromHeightM: 0,
    toFloorId: '2',
    toFloorIndex: 1,
    toHeightM: 3,
    commandedAt,
    startedAt: commandedAt,
    direction: 'up',
    arrivesAt,
  } as unknown as VizShaft['motions'][number];
}

/* -------------------------------------------------------------------------- *
 * The predicate
 * -------------------------------------------------------------------------- */

describe('carRestAt — the three grounds for *not* standing still, each from both sides', () => {
  it('is silent while a move is in flight and speaks the instant it lands', () => {
    const s = shaft({ motions: [motion(0, 40)] });
    // Mid-flight: the car is on its S-curve. Nothing may be drawn over it.
    expect(carRestAt(s, frameCar(), 20, 0)).toBeUndefined();
    // Landed, but not yet long enough — the second ground, checked below, is the one biting here.
    expect(carRestAt(s, frameCar(), 60, 0)).toBeUndefined();
    expect(carRestAt(s, frameCar(), 40 + CAR_REST_ONSET_S, 0)?.restedS).toBe(CAR_REST_ONSET_S);
  });

  it('refuses a car whose doors are doing anything, in all three of the working phases', () => {
    const s = shaft();
    for (const phase of ['open', 'opening', 'closing'] as const) {
      expect(
        carRestAt(s, frameCar({ doorPhase: phase }), 600, 0),
        `a car with doors ${phase} is transferring people, not standing still`,
      ).toBeUndefined();
    }
    expect(carRestAt(s, frameCar({ doorPhase: 'closed' }), 600, 0)).not.toBeUndefined();
  });

  it('measures from the later of the last arrival and the last door mark', () => {
    /*
     * A car that stood five minutes, let somebody out at 300 s, and settled again has been standing
     * still for the time since the *door*, not since the arrival. Taking the arrival would overstate
     * every rest that contained a boarding — the flattering direction, and therefore the wrong one.
     */
    const s = shaft({
      motions: [motion(0, 10)],
      doorMarks: [{ at: 300, state: FIXTURE_DOOR_CONFIG as never }],
    });
    expect(carRestAt(s, frameCar(), 400, 0)?.restedS).toBe(100);
    expect(carRestAt(s, frameCar(), 400, 0)?.sinceS).toBe(300);
  });

  it('measures a car that has never moved from the run’s own start, not from zero', () => {
    // The shipped tutorial building's opening state: lifts in the lobby that have not moved yet.
    const rest = carRestAt(shaft(), frameCar(), 500, 200);
    expect(rest?.sinceS).toBe(200);
    expect(rest?.restedS).toBe(300);
  });

  it('never reads a motion the playhead has not reached — the refused foreshadowing', () => {
    /*
     * `docs/28` § 4.4 refuses a renderer that reads ahead of the playhead. Two shafts, identical up
     * to `t` and differing only in what happens afterwards, must produce the same reading: knowing
     * when a rest will *end* would make the mark a prediction rather than a measurement.
     */
    const settled = shaft({ motions: [motion(0, 10)] });
    const aboutToLeave = shaft({ motions: [motion(0, 10), motion(101, 140)] });
    expect(carRestAt(aboutToLeave, frameCar(), 100, 0)).toEqual(carRestAt(settled, frameCar(), 100, 0));
  });

  it('scrubs: the reading at t is the same whichever direction the playhead arrived from', () => {
    const s = shaft({ motions: [motion(0, 10), motion(200, 240)] });
    const forward = carRestAt(s, frameCar(), 100, 0);
    const backward = carRestAt(s, frameCar(), 100, 0);
    expect(forward).toEqual(backward);
    // And after the second move it measures from the second arrival rather than the first.
    expect(carRestAt(s, frameCar(), 300, 0)?.sinceS).toBe(240);
  });
});

describe('the clock is the people’s clock — one banding, not a second ramp', () => {
  it('takes both boundaries from live/bands.ts rather than authoring them', () => {
    /*
     * AD-S15 forbids a second ramp anywhere. This is the same rule for a *duration*: a car crosses
     * into standing still at the instant the first person waiting crosses out of `breezy`, and its
     * mark saturates at the rung where that person would be eyeing the stairs. Asserted against the
     * table rather than against `30` and `120`, so a table that moves takes the mark with it.
     */
    const tapping = WAIT_BANDS.find((band) => band.id === 'tapping-foot');
    const stairs = WAIT_BANDS.find((band) => band.id === 'taking-the-stairs');
    expect(CAR_REST_ONSET_S).toBe(tapping?.fromS);
    expect(CAR_REST_FULL_S).toBe(stairs?.fromS);
  });

  it('fills from 0 at the onset to 1 at the saturation point, and stops there', () => {
    const s = shaft();
    expect(carRestAt(s, frameCar(), CAR_REST_ONSET_S, 0)?.fill).toBe(0);
    const middle = (CAR_REST_ONSET_S + CAR_REST_FULL_S) / 2;
    expect(carRestAt(s, frameCar(), middle, 0)?.fill).toBeCloseTo(0.5, 6);
    expect(carRestAt(s, frameCar(), CAR_REST_FULL_S, 0)?.fill).toBe(1);
    expect(carRestAt(s, frameCar(), CAR_REST_FULL_S * 10, 0)?.fill).toBe(1);
  });
});

describe('restBarWidthPx — the magnitude channel, and the sizes that break it', () => {
  it('is monotone in fill and never leaves its slot', () => {
    const widths = [0, 0.25, 0.5, 0.75, 1].map((fill) => restBarWidthPx(fill, 30));
    for (const [index, width] of widths.entries()) {
      if (index === 0) continue;
      expect(width).toBeGreaterThan(widths[index - 1] ?? 0);
    }
    expect(widths.at(-1)).toBe(30);
    expect(widths[0]).toBeCloseTo(30 * REST_BAR_MIN_SHARE, 6);
  });

  it('stays a bar on the narrowest car this product draws', () => {
    /*
     * `vertical-city` puts 35 cars across a viewport and `stageCarPaintOf`'s docstring measures a
     * car at roughly 2.4 px there. A share of 2.4 px is not a mark, so the absolute floor wins —
     * and the bar overhangs a 2.4 px car rather than disappearing on it, which is the deliberate
     * direction: a mark that vanishes at the size where the picture is hardest to read is a mark
     * that is missing exactly when it is needed.
     */
    expect(restBarWidthPx(0, 2.4)).toBe(REST_BAR_MIN_PX);
    expect(restBarWidthPx(1, 2.4)).toBe(REST_BAR_MIN_PX);
  });
});

/* -------------------------------------------------------------------------- *
 * The shipped tutorial building — the mark exists to be seen on this one
 * -------------------------------------------------------------------------- */

describe('garden-apartments — the building the parking lesson is set on', () => {
  it('has cars standing still for most of the hour, and says so at the playhead', () => {
    /*
     * `docs/34` § 9.3 measured the other half of this picture: landings are empty about **91 %** of
     * the hour on this building, and on 16 of 20 seeds nobody ever waits sixty seconds. The
     * consequence for a renderer is the point of this case — if the crowd is absent for nine tenths
     * of the run, the *cars* are what a player is looking at for nine tenths of the run, and until
     * this mark existed there was nothing about them to look at.
     *
     * Asserted as a property of the run rather than as a number: at least one car is standing still
     * at more than half the sampled instants. A count would pin this case to a seed.
     */
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const span = recording.endedAt - recording.startedAt;
    let instantsWithARestingCar = 0;
    const samples = 41;
    for (let index = 0; index < samples; index += 1) {
      const frame: Frame = frameAt(recording, recording.startedAt + (span * index) / (samples - 1));
      if (carRestsAt(recording, frame).length > 0) instantsWithARestingCar += 1;
    }
    expect(instantsWithARestingCar).toBeGreaterThan(samples / 2);
  }, 300_000);

  it('never marks a car the frame says is moving', () => {
    /*
     * The one assertion that would catch a sign error, and it is checked over a real run rather
     * than over a fixture: `direction !== 0` and *standing still* are mutually exclusive states of
     * one slot, and the renderer relies on that to decide which of the two to draw. If they could
     * both be true the picture would carry an arrow and a bar over the same car and mean neither.
     */
    const { recording } = recordRun(breadthConfig(config, 'garden-apartments'));
    const span = recording.endedAt - recording.startedAt;
    for (let index = 0; index <= 60; index += 1) {
      const frame: Frame = frameAt(recording, recording.startedAt + (span * index) / 60);
      const resting = new Set(carRestsAt(recording, frame).map((rest) => rest.carId));
      for (const car of frame.cars) {
        if (car.direction === 0) continue;
        expect(resting.has(car.carId), `${car.carId} is both travelling and at rest`).toBe(false);
      }
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * Contrast — arithmetic, in the shape § D336 used
 * -------------------------------------------------------------------------- */

/** WCAG relative luminance of a `#rrggbb`. `render/theme.test.ts`'s, verbatim. */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function rgbOf(colour: string): readonly [number, number, number, number] {
  const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(colour);
  if (rgba !== null) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] === undefined ? 1 : Number(rgba[4]),
    ];
  }
  return [
    parseInt(colour.slice(1, 3), 16),
    parseInt(colour.slice(3, 5), 16),
    parseInt(colour.slice(5, 7), 16),
    1,
  ];
}

/** `foreground` painted over `background`, as the hex the reader's eye actually receives. */
function over(foreground: string, background: string): string {
  const [fr, fg, fb, alpha] = rgbOf(foreground);
  const [br, bg, bb] = rgbOf(background);
  const mix = (f: number, b: number): string =>
    Math.round(f * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(fr, br)}${mix(fg, bg)}${mix(fb, bb)}`;
}

/**
 * Every ground the Engineer stage can put behind the rest bar, in one theme.
 *
 * The bar is drawn in `drawCars`, which runs after `drawSky`, `drawBuildingMass`, `drawFloors` and
 * `drawShafts` — so what is under it is the shaft recess, over a floor slab where a slab happens to
 * be, over the mass, over whichever of the four skies the hour picked. Both stops of all four ramps
 * are taken, and the slab is included and excluded, because the worst ground is the one closest in
 * luminance to the mark and there is no way to know in advance which of the sixteen that is.
 */
function engineerGrounds(theme: Theme): readonly string[] {
  const grounds: string[] = [];
  for (const ramp of Object.values(theme.sky)) {
    for (const stop of ramp) {
      const mass = over(theme.mass, stop);
      grounds.push(over(theme.shaftRecess, mass));
      grounds.push(over(theme.shaftRecess, over(theme.floorSlab, mass)));
    }
  }
  return grounds;
}

/**
 * The floor. `docs/28` AD-A2's *non-text floor*, which is the conventional 3:1 for a graphical
 * object a reader must distinguish. Not 4.5:1 — the bar carries no text and is not text.
 *
 * Stated as a constant rather than inline so that a lane which decides the mark should be held to a
 * higher bar moves one number and finds out immediately whether the ink still clears it.
 */
const NON_TEXT_FLOOR = 3;

describe('AD-A2 — the rest bar is measured on the ground it is actually drawn on', () => {
  it('clears the non-text floor on the Casual cutaway’s well, and pins the ratio', () => {
    /*
     * The Casual bar is `inkSoft` on the well, which is `paper` — `drawCutaway` fills every
     * in-service column with it before anything else lands there. **8.36:1.**
     *
     * `inkSoft` rather than `ink`: the car body is `ink`, and a mark in the body's own colour reads
     * as part of the car rather than as a statement about it. Rather than `terracotta` or `sun`
     * because those are the alarm and the door, and a stage that painted *standing still* in an
     * alarm colour would be asserting that standing still is wrong — which is the player's
     * conclusion to reach and the renderer's job to make reachable, not to make for them.
     */
    const ratio = contrast(EVERYDAY_COLORS.inkSoft, EVERYDAY_COLORS.paper);
    expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    expect(Number(ratio.toFixed(2))).toBe(8.36);
  });

  it('clears it on every ground the Engineer stage can put behind it, in both modes', () => {
    for (const [name, theme] of [
      ['dark', DEFAULT_THEME],
      ['light', themeFromPalette(LIGHT_PALETTE)],
    ] as const) {
      for (const ground of engineerGrounds(theme)) {
        expect(
          contrast(theme.textDim, ground),
          `${name}: the rest bar on ${ground}`,
        ).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      }
    }
  });

  it('pins the worst ground in each mode, so a repalette cannot quietly erode it', () => {
    /*
     * The bound rather than the sixteen readings: a floor that is only ever asserted as an
     * inequality goes on passing while the headroom disappears, which is the *published number that
     * does not reproduce* failure one directory over. If either figure moves, the palette moved.
     */
    const worst = (theme: Theme): number =>
      engineerGrounds(theme).reduce(
        (least, ground) => Math.min(least, contrast(theme.textDim, ground)),
        Number.POSITIVE_INFINITY,
      );
    expect(Number(worst(DEFAULT_THEME).toFixed(2))).toBe(6.39);
    expect(Number(worst(themeFromPalette(LIGHT_PALETTE)).toFixed(2))).toBe(4.4);
  });

  it('is not the ink of any other mark in the cutaway — AD-A1’s second channel is not enough on its own', () => {
    /*
     * Two channels carry this mark: it is a **bar** where a triangle would be, and its **length** is
     * the duration. Neither is colour, which is AD-A1 satisfied. But the ink still has to be
     * *unshared* on this surface, for a reason that is about tests rather than about readers: the
     * driven case in `stageScreen.browser.test.ts` counts pixels by exact colour, and a bar painted
     * in an ink the crowd or the doors also use could not be counted at all.
     */
    const drawnByTheCutaway = [
      EVERYDAY_COLORS.cardSunk,
      EVERYDAY_COLORS.ruleMid,
      EVERYDAY_COLORS.ruleLight,
      EVERYDAY_COLORS.ink,
      EVERYDAY_COLORS.warmGrey,
      EVERYDAY_COLORS.faint,
      EVERYDAY_COLORS.paper,
      EVERYDAY_COLORS.sun,
      EVERYDAY_COLORS.terracotta,
      ...WAIT_BANDS.map((band) => band.color),
    ];
    expect(drawnByTheCutaway).not.toContain(EVERYDAY_COLORS.inkSoft);
  });
});

/* -------------------------------------------------------------------------- *
 * The recording-level entry point
 * -------------------------------------------------------------------------- */

describe('carRestsAt — the shape both renderers call', () => {
  it('skips a car with no shaft rather than guessing at one', () => {
    const recording = { startedAt: 0, shafts: [shaft()] } as unknown as VizRecording;
    const frame = { simTimeS: 600, cars: [frameCar(), frameCar({ carId: 'ghost' })] } as unknown as Frame;
    expect(carRestsAt(recording, frame).map((rest) => rest.carId)).toEqual(['main-A']);
  });

  it('hands each car its own shaft rather than its neighbour’s', () => {
    /*
     * Keyed on `carId`, not on index. A frame whose cars came back in a different order from the
     * record's shafts would otherwise give every car somebody else's history — silently, and only
     * on the buildings with more than one lift, which is all of them.
     */
    const recording = {
      startedAt: 0,
      shafts: [shaft({ carId: 'A' }), shaft({ carId: 'B', motions: [motion(0, 500)] })],
    } as unknown as VizRecording;
    const frame = {
      simTimeS: 600,
      cars: [frameCar({ carId: 'B' }), frameCar({ carId: 'A' })],
    } as unknown as Frame;
    const byId = new Map(carRestsAt(recording, frame).map((rest) => [rest.carId, rest.restedS]));
    expect(byId.get('A')).toBe(600);
    expect(byId.get('B')).toBe(100);
  });
});
