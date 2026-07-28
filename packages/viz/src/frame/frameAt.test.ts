/**
 * The frame producer, against a real run.
 *
 * The claim worth testing is not that a frame has the right fields; it is that the height in
 * the frame is the car's *analytic* position. That is asserted by re-deriving it from the
 * motion profile with `positionAt` — the same call `Car.positionAt` makes — at instants chosen
 * to land inside a move, at its motor-start delay, and inside its levelling settle, which are
 * the three places a naive linear interpolation would be wrong.
 *
 * ## Why the last suite in this file exists
 *
 * The samplers above are each tested directly against the recording. **That is not the same as
 * testing that the frame uses them.** A reviewer replaced each of `frameCar`'s eight fields with
 * a constant, one at a time, and ran the whole package suite: seven of the eight mutations
 * passed. `heightM` could be pinned to `startHeightM`, `direction` to `0`, `doorPhase` to
 * `'closed'`, `occupants` to `0` — and every test in nine files still went green, because the
 * `frameAt` block asserted purity, clamping, list shape and counter consistency and never once
 * asserted a car field. A viewer that drew no car motion at all satisfied Phase 4's acceptance
 * criterion.
 *
 * `frameCar is wired to the samplers` below is written to kill exactly those mutants, and it is
 * in two halves because either half alone is killable:
 *
 * 1. **Equality** — every field of every frame car equals the sampler's own answer at that
 *    instant. This is what a constant violates.
 * 2. **Witnesses** — over the sampled instants the run must actually *exhibit* a car above its
 *    start height, off its start floor, travelling up, travelling down, with doors part-open,
 *    fully open, opening, closing, occupied and loaded. Without these, a field pinned to the
 *    value it happens to hold everywhere in a quiet run would survive half 1.
 *
 * It runs over three shipped buildings, because the fixture the file used to pin —
 * Garden Apartments — has no basement, one bank, two cars and cars that start where they end.
 */

import { loadConfig, positionAt, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, breadthConfig, fixtureConfig } from '../fixtures.test-helper.js';
import { stepValueAt } from '../contract/series.js';
import type { VizRecording, VizShaft } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import {
  carDirectionAt,
  carFloorIdAt,
  carHeightAt,
  doorFractionAt,
  doorPhaseAt,
  frameAt,
} from './frameAt.js';

let recording: VizRecording;

/**
 * The three buildings the wiring suite runs over.
 *
 * `midtown-office` because its cars start in a basement two floors below the entrance and 65 m
 * below where they end — the configuration the start-position defect was 77 m wrong on.
 * `mixed-use-high-rise` because it has sky lobbies, four banks and sixteen shafts, so a frame
 * has to keep sixteen cars distinct. `garden-apartments` stays because it is the cheap one and
 * because a regression that only shows on the small building is still a regression.
 */
const WIRING_BUILDING_IDS = ['garden-apartments', 'midtown-office', 'mixed-use-high-rise'] as const;

const wiringRecordings = new Map<string, VizRecording>();

function wiringRecording(buildingId: string): VizRecording {
  const found = wiringRecordings.get(buildingId);
  if (found === undefined) throw new Error(`no recording for "${buildingId}"`);
  return found;
}

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  recording = recordRun(fixtureConfig(config)).recording;
  for (const buildingId of WIRING_BUILDING_IDS) {
    wiringRecordings.set(buildingId, recordRun(breadthConfig(config, buildingId)).recording);
  }
}, 300_000);

/** The first shaft that actually moved. */
function movingShaft(): VizShaft {
  const shaft = recording.shafts.find((candidate) => candidate.motions.length > 0);
  if (shaft === undefined) throw new Error('no car moved in the fixture run.');
  return shaft;
}

describe('carHeightAt', () => {
  it('stands at the start height before the first move', () => {
    const shaft = movingShaft();
    expect(carHeightAt(shaft, recording.startedAt)).toBe(shaft.startHeightM);
  });

  it('is the analytic S-curve position, not an interpolation between stops', () => {
    const shaft = movingShaft();
    let checked = 0;
    for (const motion of shaft.motions.slice(0, 20)) {
      const span = motion.arrivesAt - motion.startedAt;
      for (const fraction of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
        const t = motion.startedAt + span * fraction;
        const expected = motion.fromHeightM + positionAt(motion.profile, t - motion.startedAt);
        expect(carHeightAt(shaft, t)).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is flat through the motor-start delay and settled by the arrival', () => {
    const shaft = movingShaft();
    const motion = shaft.motions[0];
    if (motion === undefined) throw new Error('no motion');
    // `commandedAt <= t <= startedAt` is the motor-start delay: commanded, not yet moving.
    expect(carHeightAt(shaft, motion.commandedAt)).toBe(motion.fromHeightM);
    expect(carHeightAt(shaft, motion.startedAt)).toBe(motion.fromHeightM);
    // And by `arrivesAt` the car is levelled at the destination, settle included, and stays
    // there until the *next* move is commanded — which is why the upper probe stops short of it.
    expect(carHeightAt(shaft, motion.arrivesAt)).toBeCloseTo(motion.toHeightM, 9);
    const next = shaft.motions[1];
    const standing = next === undefined ? motion.arrivesAt + 60 : (motion.arrivesAt + next.commandedAt) / 2;
    expect(carHeightAt(shaft, standing)).toBeCloseTo(motion.toHeightM, 9);
  });

  it('never leaves the shaft', () => {
    const shaft = movingShaft();
    const heights = recording.floors.map((floor) => floor.heightM);
    const lowest = Math.min(...heights);
    const highest = Math.max(...heights);
    for (let t = recording.startedAt; t <= recording.endedAt; t += 0.37) {
      const h = carHeightAt(shaft, t);
      expect(h).toBeGreaterThanOrEqual(lowest - 1e-6);
      expect(h).toBeLessThanOrEqual(highest + 1e-6);
    }
  });
});

describe('carDirectionAt and carFloorIdAt', () => {
  it('report standing before the first move and at the floor the car started on', () => {
    const shaft = movingShaft();
    expect(carDirectionAt(shaft, recording.startedAt)).toBe(0);
    expect(carFloorIdAt(shaft, recording.startedAt)).toBe(shaft.startFloorId);
  });

  it('report the travel direction only while the car is between its endpoints', () => {
    const shaft = movingShaft();
    const motion = shaft.motions[0];
    if (motion === undefined) throw new Error('no motion');
    const mid = (motion.startedAt + motion.arrivesAt) / 2;
    expect(carDirectionAt(shaft, motion.startedAt)).toBe(0);
    expect(carDirectionAt(shaft, motion.arrivesAt)).toBe(0);
    expect(carDirectionAt(shaft, mid)).toBe(motion.toHeightM > motion.fromHeightM ? 1 : -1);
    // A moving car reports the floor it left; an arrived one reports the floor it reached.
    expect(carFloorIdAt(shaft, mid)).toBe(motion.fromFloorId);
    expect(carFloorIdAt(shaft, motion.arrivesAt)).toBe(motion.toFloorId);
  });
});

describe('doorFractionAt', () => {
  it('stays within [0, 1] across the whole run', () => {
    for (const shaft of recording.shafts) {
      for (let t = recording.startedAt; t <= recording.endedAt; t += 0.53) {
        const fraction = doorFractionAt(shaft, t);
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is shut before the first door command', () => {
    for (const shaft of recording.shafts) {
      expect(doorFractionAt(shaft, recording.startedAt - 1)).toBe(0);
    }
  });
});

describe('frameAt', () => {
  it('is pure: the same instant gives an identical frame however it is reached', () => {
    const at = (fraction: number): string => {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      return JSON.stringify(frameAt(recording, t));
    };
    // Reached going forwards…
    at(0);
    at(0.25);
    const forwards = at(0.42);
    // …and reached going backwards, after the producer has seen a much later instant.
    at(0.9);
    const backwards = at(0.42);
    expect(backwards).toBe(forwards);
    expect(at(0.42)).toBe(forwards);
    expect(forwards.length).toBeGreaterThan(0);
  });

  it('clamps outside the run rather than extrapolating', () => {
    const before = frameAt(recording, recording.startedAt - 10_000);
    const after = frameAt(recording, recording.endedAt + 10_000);
    expect(before.simTimeS).toBe(recording.startedAt);
    expect(after.simTimeS).toBe(recording.endedAt);
    expect(JSON.stringify(before)).toBe(JSON.stringify(frameAt(recording, recording.startedAt)));
  });

  it('emits one landing per floor, in the building’s floor order, whether or not anybody waits', () => {
    // A renderer lays out one row per floor. Landings must not appear and vanish under it as
    // queues form and clear, so the list is the building's floors, not the busy ones.
    for (const fraction of [0, 0.5, 1]) {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      const frame = frameAt(recording, t);
      expect(frame.landings.map((l) => l.floorId)).toEqual(recording.floors.map((f) => f.id));
      expect(frame.landings.every((l) => l.waitingUp >= 0 && l.waitingDown >= 0)).toBe(true);
    }
  });

  it('emits one car per shaft, in shaft order', () => {
    const frame = frameAt(recording, recording.endedAt);
    expect(frame.cars.map((c) => c.carId)).toEqual(recording.shafts.map((s) => s.carId));
  });

  it('reports no mean wait until somebody has boarded, and a real one afterwards', () => {
    expect(frameAt(recording, recording.startedAt).runningMeanWaitS).toBeUndefined();
    const end = frameAt(recording, recording.endedAt);
    expect(end.boardedLegs).toBeGreaterThan(0);
    expect(end.runningMeanWaitS).toBeGreaterThan(0);
  });

  it('keeps the headline counters consistent with the landings it drew', () => {
    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const t = recording.startedAt + (recording.endedAt - recording.startedAt) * fraction;
      const frame = frameAt(recording, t);
      const summed = frame.landings.reduce((n, l) => n + l.waitingUp + l.waitingDown, 0);
      expect(summed).toBe(frame.totalWaiting);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * frameCar — the wiring, killed mutant by mutant
 * -------------------------------------------------------------------------- */

/**
 * Instants chosen so the run cannot hide.
 *
 * A uniform grid alone is a coin flip: a 120-point grid over 900 s lands inside a 6 s move about
 * as often as it does not, and a suite that only sometimes observes a moving car only sometimes
 * kills the `direction → 0` mutant. So the grid is supplemented with instants taken **from the
 * recording itself** — the middle of each of the first moves, and a moment just after each of
 * the first door commands — which are where the interesting states provably are.
 */
function probeTimes(r: VizRecording): readonly number[] {
  const times: number[] = [];
  const span = r.endedAt - r.startedAt;
  for (let k = 0; k < 120; k += 1) times.push(r.startedAt + (span * k) / 120);
  for (const shaft of r.shafts) {
    for (const motion of shaft.motions.slice(0, 6)) {
      times.push((motion.startedAt + motion.arrivesAt) / 2);
      times.push(motion.arrivesAt + 0.25);
    }
    for (const mark of shaft.doorMarks.slice(0, 12)) {
      times.push(mark.at + 0.1);
      times.push(mark.at + 0.75);
      times.push(mark.at + 1.5);
    }
  }
  return times.filter((t) => t >= r.startedAt && t <= r.endedAt).sort((a, b) => a - b);
}

interface Witnesses {
  aboveStartHeight: boolean;
  offStartFloor: boolean;
  travellingUp: boolean;
  travellingDown: boolean;
  doorsPartOpen: boolean;
  doorsFullyOpen: boolean;
  phaseOpening: boolean;
  phaseClosing: boolean;
  phaseOpen: boolean;
  occupied: boolean;
  loaded: boolean;
}

describe.each(WIRING_BUILDING_IDS)('%s — frameCar is wired to the samplers', (buildingId) => {
  it('gives every field the sampler’s own answer, and the run exhibits every state', () => {
    const r = wiringRecording(buildingId);
    const witness: Witnesses = {
      aboveStartHeight: false,
      offStartFloor: false,
      travellingUp: false,
      travellingDown: false,
      doorsPartOpen: false,
      doorsFullyOpen: false,
      phaseOpening: false,
      phaseClosing: false,
      phaseOpen: false,
      occupied: false,
      loaded: false,
    };

    for (const t of probeTimes(r)) {
      const frame = frameAt(r, t);
      expect(frame.cars).toHaveLength(r.shafts.length);
      for (const [index, shaft] of r.shafts.entries()) {
        const car = frame.cars[index];
        if (car === undefined) throw new Error(`frame has no car at index ${String(index)}`);

        /* Half 1: identity and every sampled field, against the sampler. */
        expect(car.carId).toBe(shaft.carId);
        expect(car.bankId).toBe(shaft.bankId);
        expect(car.label).toBe(shaft.label);
        expect(car.heightM).toBe(carHeightAt(shaft, t));
        expect(car.floorId).toBe(carFloorIdAt(shaft, t));
        expect(car.direction).toBe(carDirectionAt(shaft, t));
        expect(car.doorFraction).toBe(doorFractionAt(shaft, t));
        expect(car.doorPhase).toBe(doorPhaseAt(shaft, t));
        expect(car.occupants).toBe(stepValueAt(shaft.occupants, t));
        expect(car.loadFactor).toBe(stepValueAt(shaft.loadFactor, t));

        /* Half 2: what the run was seen to do. */
        if (car.heightM !== shaft.startHeightM) witness.aboveStartHeight = true;
        if (car.floorId !== shaft.startFloorId) witness.offStartFloor = true;
        if (car.direction === 1) witness.travellingUp = true;
        if (car.direction === -1) witness.travellingDown = true;
        if (car.doorFraction > 0 && car.doorFraction < 1) witness.doorsPartOpen = true;
        if (car.doorFraction >= 1) witness.doorsFullyOpen = true;
        if (car.doorPhase === 'opening') witness.phaseOpening = true;
        if (car.doorPhase === 'closing') witness.phaseClosing = true;
        if (car.doorPhase === 'open') witness.phaseOpen = true;
        if (car.occupants > 0) witness.occupied = true;
        if (car.loadFactor > 0) witness.loaded = true;
      }

      /* The three headline counters are frame fields too, and the same mutation argument
         applies to them. */
      expect(frame.totalWaiting).toBe(stepValueAt(r.progress.waiting, t));
      expect(frame.boardedLegs).toBe(stepValueAt(r.progress.boardedLegs, t));
      expect(frame.runningMeanWaitS).toBe(
        frame.boardedLegs === 0 ? undefined : stepValueAt(r.progress.meanWaitS, t),
      );
    }

    expect(witness).toEqual({
      aboveStartHeight: true,
      offStartFloor: true,
      travellingUp: true,
      travellingDown: true,
      doorsPartOpen: true,
      doorsFullyOpen: true,
      phaseOpening: true,
      phaseClosing: true,
      phaseOpen: true,
      occupied: true,
      loaded: true,
    });
  }, 300_000);

  it('draws a car at its start height and start floor before its first commanded move', () => {
    // UX.md RV-13. The recorder's start-position defect made this false on every building whose
    // cars do not start where they end, and nothing in the suite noticed; the assertion is
    // stated here as well as in `recordRun.test.ts` because this is the surface a renderer sees.
    const r = wiringRecording(buildingId);
    const frame = frameAt(r, r.startedAt);
    for (const [index, shaft] of r.shafts.entries()) {
      const car = frame.cars[index];
      if (car === undefined) throw new Error('missing car');
      expect(car.heightM).toBe(shaft.startHeightM);
      expect(car.floorId).toBe(shaft.startFloorId);
      expect(car.direction).toBe(0);
    }
    /* And the start is a real floor of the building at that floor's height, so a self-consistent
       but wrong pair cannot pass. */
    const heightByFloor = new Map(r.floors.map((floor) => [floor.id, floor.heightM]));
    for (const shaft of r.shafts) {
      expect(heightByFloor.get(shaft.startFloorId)).toBe(shaft.startHeightM);
    }
  }, 300_000);
});
