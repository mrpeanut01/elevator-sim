/**
 * The replay layer: what `watch` samples between kernel events.
 *
 * The interesting property is that {@link heightAt} is the *same* arithmetic `Car.positionAt`
 * performs, so the picture cannot disagree with the statistics. That is asserted directly here:
 * a real run is instrumented, and every recorded move is re-evaluated against the profile.
 */

import {
  Simulation,
  loadConfig,
  positionAt as profilePositionAt,
  type LoadedConfig,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { nearestFloorId, rowFor } from './commands/watch.js';
import { DEFAULT_DATA_DIR } from './data.js';
import {
  QueueClock,
  buildLoadTracks,
  captureTimeline,
  directionAt,
  doorFractionAt,
  doorPhaseAt,
  heightAt,
  loadAt,
  shortCarLabel,
  type CarTracks,
} from './timeline.js';

const FLOORS = [
  { id: 'G', heightM: 0 },
  { id: '2', heightM: 3 },
  { id: '3', heightM: 6 },
];

describe('rowFor', () => {
  it('puts the lowest floor at the bottom row and the highest at the top', () => {
    expect(rowFor(FLOORS, 0, 1)).toBe(2);
    expect(rowFor(FLOORS, 6, 1)).toBe(0);
  });

  it('clamps outside the shaft rather than producing a negative row', () => {
    expect(rowFor(FLOORS, -10, 1)).toBe(2);
    expect(rowFor(FLOORS, 99, 1)).toBe(0);
  });

  it('resolves sub-floor positions when there are two rows per floor', () => {
    expect(rowFor(FLOORS, 0, 2)).toBe(4);
    expect(rowFor(FLOORS, 1.5, 2)).toBe(3);
    expect(rowFor(FLOORS, 3, 2)).toBe(2);
    expect(rowFor(FLOORS, 4.5, 2)).toBe(1);
    expect(rowFor(FLOORS, 6, 2)).toBe(0);
  });
});

describe('nearestFloorId', () => {
  it('names the floor a moving car is passing', () => {
    expect(nearestFloorId(FLOORS, 0.2)).toBe('G');
    expect(nearestFloorId(FLOORS, 2.6)).toBe('2');
    expect(nearestFloorId(FLOORS, 5.9)).toBe('3');
  });
});

describe('shortCarLabel', () => {
  it('drops the redundant bank prefix', () => {
    expect(shortCarLabel('main-A', 'main')).toBe('A');
    expect(shortCarLabel('A', 'main')).toBe('A');
  });
});

describe('a captured run', () => {
  let config: LoadedConfig;
  let tracks: CarTracks;
  let record: ReturnType<Simulation['run']>;

  beforeAll(async () => {
    config = await loadConfig(DEFAULT_DATA_DIR);
    const building = config.buildingsById.get('garden-apartments');
    const profile = config.dispatcherProfilesById.get('eta');
    if (building === undefined || profile === undefined) throw new Error('fixture missing');
    const simulation = new Simulation({
      building,
      dispatcherProfile: profile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 42,
      durationS: 600,
      onTimeout: 'report',
    });
    tracks = captureTimeline(simulation.building, building);
    record = simulation.run();
  });

  it('records at least one move per car that worked, and does not disturb the run', () => {
    expect(record.status).toBe('completed');
    expect(record.conservation.balanced).toBe(true);
    const moved = [...tracks.values()].filter((track) => track.motions.length > 0);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('heightAt is the analytic position, not an interpolation between stops', () => {
    for (const track of tracks.values()) {
      for (const motion of track.motions) {
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          const t = motion.startedAt + fraction * (motion.arrivesAt - motion.startedAt);
          expect(heightAt(track, t)).toBeCloseTo(
            motion.fromHeightM + profilePositionAt(motion.profile, t - motion.startedAt),
            9,
          );
        }
      }
    }
  });

  it('is continuous at the ends of a move: the car is exactly at each floor', () => {
    for (const track of tracks.values()) {
      for (const motion of track.motions) {
        expect(heightAt(track, motion.commandedAt)).toBeCloseTo(motion.fromHeightM, 9);
        expect(heightAt(track, motion.arrivesAt)).toBeCloseTo(motion.toHeightM, 9);
      }
    }
  });

  it('stands still before the first move and after the last', () => {
    for (const track of tracks.values()) {
      expect(heightAt(track, -5)).toBe(track.startHeightM);
      expect(directionAt(track, -5)).toBe(0);
      const last = track.motions.at(-1);
      if (last !== undefined) {
        expect(heightAt(track, last.arrivesAt + 1000)).toBeCloseTo(last.toHeightM, 9);
        expect(directionAt(track, last.arrivesAt + 1000)).toBe(0);
      }
    }
  });

  it('opens and closes the doors, including the automatic close nobody commands', () => {
    const phases = new Set<string>();
    for (const track of tracks.values()) {
      for (let t = 0; t <= record.endedAt; t += 1) phases.add(doorPhaseAt(track, t));
    }
    expect(phases.has('open')).toBe(true);
    expect(phases.has('closed')).toBe(true);
    for (const track of tracks.values()) {
      for (let t = 0; t <= record.endedAt; t += 7) {
        const fraction = doorFractionAt(track, t);
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reads occupancy from the load samples as a step function', () => {
    const loads = buildLoadTracks(record.record);
    expect(loads.size).toBeGreaterThan(0);
    for (const [carId, track] of loads) {
      expect(loadAt(track, -1)).toEqual({ occupants: 0, loadFactor: 0 });
      const first = track.times[0] ?? 0;
      expect(loadAt(track, first).occupants).toBe(track.occupants[0]);
      expect(carId.length).toBeGreaterThan(0);
    }
  });

  it('QueueClock ends with an empty building and the run’s own service count', () => {
    const queues = new QueueClock(record.record);
    queues.advanceTo(0);
    expect(queues.served).toBe(0);
    expect(Number.isNaN(queues.runningMeanWaitS)).toBe(true);

    queues.advanceTo(record.endedAt);
    expect(queues.totalWaiting).toBe(0);
    expect(queues.served).toBe(
      record.record.passengers.filter((passenger) => passenger.boardedAt !== undefined).length,
    );
    expect(queues.runningMeanWaitS).toBeGreaterThan(0);
  });

  it('never reports a negative queue at any instant', () => {
    const queues = new QueueClock(record.record);
    for (let t = 0; t <= record.endedAt; t += 5) {
      queues.advanceTo(t);
      expect(queues.totalWaiting).toBeGreaterThanOrEqual(0);
      for (const floor of record.record.passengers) {
        expect(queues.waitingUp(floor.originFloorId)).toBeGreaterThanOrEqual(0);
        expect(queues.waitingDown(floor.originFloorId)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
