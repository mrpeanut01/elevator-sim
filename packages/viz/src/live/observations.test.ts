/**
 * The stat rows and the goal inputs, against real runs of every shipped building.
 *
 * Three claims carry the file:
 *
 * 1. **The counters are counters.** `carried <= boarded <= arrived` at every instant, and all
 *    three non-decreasing in `t`. That is what makes them safe for a goal to read: a figure that
 *    can go down when the playhead moves forward is not an observation of anything.
 * 2. **The peak queue agrees with the fold.** `observationsAt` derives it from `recording.legs`;
 *    this suite derives it independently from `recording.landings`, which `foldPassengers` built
 *    by a different route. Equality is evidence, exactly as `overlay.test.ts` argues for
 *    `waitingNow`. Deriving the figure from the fold in the first place would have made this
 *    check a tautology, which is why the module does not.
 * 3. **Scrubbing backwards is free.** Every function is called at `t` ascending and again
 *    descending, and the two sequences must be identical. This is the property a cache would
 *    break, and the reason there is no cache.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { BUILDING_IDS, DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { queueAt } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';

import { observationsAt } from './observations.js';
import { servedLeg, syntheticRecording, waitingLeg } from './synthetic.test-helper.js';

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(id, recordRun(breadthConfig(config, id)).recording);
  }
}, 600_000);

function recordingOf(id: string): VizRecording {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return recording;
}

function sampleTimes(recording: VizRecording): readonly number[] {
  const span = recording.endedAt - recording.startedAt;
  return Array.from({ length: 13 }, (_unused, i) => recording.startedAt + (span * i) / 12);
}

/** Right-continuous sample of a step series — the same rule `stepValueAt` applies. */
function stepAt(series: VizRecording['landings'][number]['waiting'], t: number): number {
  let value = series.before;
  for (const [index, at] of series.times.entries()) {
    if (at > t) break;
    value = series.values[index] ?? value;
  }
  return value;
}

/**
 * The deepest single **floor** queue over `[startedAt, t]`, from the recording's landing series.
 *
 * Independent of `observationsAt`: this sums the fold's own per-`(floor, direction)` step
 * functions, evaluated at every instant either of them changes, which is every instant the sum
 * can change.
 */
function peakFromLandings(recording: VizRecording, t: number): number {
  const byFloor = new Map<string, VizRecording['landings'][number][]>();
  for (const landing of recording.landings) {
    const list = byFloor.get(landing.floorId) ?? [];
    list.push(landing);
    byFloor.set(landing.floorId, list);
  }
  let peak = 0;
  for (const series of byFloor.values()) {
    const instants = new Set<number>([recording.startedAt]);
    for (const landing of series) {
      for (const at of landing.waiting.times) if (at <= t) instants.add(at);
    }
    for (const at of instants) {
      const total = series.reduce((sum, landing) => sum + stepAt(landing.waiting, at), 0);
      if (total > peak) peak = total;
    }
  }
  return peak;
}

describe.each(BUILDING_IDS)('%s — the counters are counters', (buildingId) => {
  it('never carries more than it boarded, nor boards more than arrived', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const o = observationsAt(recording, t);
      expect(o.carried).toBeLessThanOrEqual(o.boarded);
      expect(o.boarded).toBeLessThanOrEqual(o.arrived);
      expect(o.servedUnderThresholdCount).toBeLessThanOrEqual(o.servedCount);
      expect(o.servedCount).toBe(o.boarded);
    }
  }, 300_000);

  it('moves every counter in one direction only', () => {
    const recording = recordingOf(buildingId);
    let previous = observationsAt(recording, recording.startedAt);
    for (const t of sampleTimes(recording).slice(1)) {
      const o = observationsAt(recording, t);
      expect(o.arrived).toBeGreaterThanOrEqual(previous.arrived);
      expect(o.boarded).toBeGreaterThanOrEqual(previous.boarded);
      expect(o.carried).toBeGreaterThanOrEqual(previous.carried);
      expect(o.abandoned).toBeGreaterThanOrEqual(previous.abandoned);
      expect(o.peakQueue.count).toBeGreaterThanOrEqual(previous.peakQueue.count);
      previous = o;
    }
  }, 300_000);

  it('agrees with the fold about the deepest queue any floor ever held', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const o = observationsAt(recording, t);
      expect(`${String(t)}: ${String(o.peakQueue.count)}`).toBe(
        `${String(t)}: ${String(peakFromLandings(recording, t))}`,
      );
      if (o.peakQueue.count > 0) {
        expect(o.peakQueue.floorId).toBeDefined();
        expect(recording.floors.map((floor) => floor.id)).toContain(o.peakQueue.floorId);
        expect(o.peakQueue.atS ?? Number.NaN).toBeLessThanOrEqual(t);
      }
    }
  }, 300_000);

  it('agrees with `queueAt` about the deepest queue standing right now', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const o = observationsAt(recording, t);
      const deepest = queueAt(recording, t).reduce((best, queue) => Math.max(best, queue.total), 0);
      expect(`${String(t)}: ${String(o.deepestQueueNow)}`).toBe(`${String(t)}: ${String(deepest)}`);
      expect(o.deepestQueueNow).toBeLessThanOrEqual(o.peakQueue.count);
    }
  }, 300_000);

  it('takes its thresholds off the run rather than assuming 60 s and 900 s', () => {
    const recording = recordingOf(buildingId);
    const o = observationsAt(recording, recording.endedAt);
    expect(o.longWaitThresholdS).toBe(recording.summary.longWaitThresholdS);
    expect(o.horizonS).toBe(recording.summary.serviceLevel.horizonS);
  }, 300_000);

  it('gives the same answer scrubbing backwards as forwards', () => {
    const recording = recordingOf(buildingId);
    const times = sampleTimes(recording);
    const forwards = times.map((t) => JSON.stringify(observationsAt(recording, t)));
    const backwards = [...times]
      .reverse()
      .map((t) => JSON.stringify(observationsAt(recording, t)))
      .reverse();
    expect(backwards).toEqual(forwards);
  }, 300_000);
});

describe('the edges a real run will not show on demand', () => {
  it('withholds the served share rather than reporting 100 % of nobody', () => {
    const o = observationsAt(syntheticRecording({ legs: [waitingLeg('p1', 0)] }), 10);
    expect(o.servedCount).toBe(0);
    expect(o.servedUnderThresholdPct).toBeUndefined();
  });

  it('counts a leg carried only once it has alighted, not once it has boarded', () => {
    const recording = syntheticRecording({ legs: [servedLeg('p1', 0, 20, 60)] });
    expect(observationsAt(recording, 30)).toMatchObject({ boarded: 1, carried: 0 });
    expect(observationsAt(recording, 60)).toMatchObject({ boarded: 1, carried: 1 });
  });

  it('counts a long wait as abandoned from the horizon, and keeps counting it after it boards', () => {
    // Waits 950 s against a 900 s horizon, then boards. `core` counts it over-horizon; so must
    // this, and it must not stop counting it the instant the playhead passes the boarding.
    const recording = syntheticRecording({
      legs: [servedLeg('p1', 0, 950, 1000)],
      endedAt: 1200,
    });
    expect(observationsAt(recording, 899).abandoned).toBe(0);
    expect(observationsAt(recording, 900).abandoned).toBe(0); // exactly the horizon is inside it
    expect(observationsAt(recording, 901).abandoned).toBe(1);
    expect(observationsAt(recording, 1100).abandoned).toBe(1);
  });

  it('does not report a phantom peak when a landing empties and refills at the same instant', () => {
    // Two board at 100 s and three arrive at 100 s. The floor never held five.
    const recording = syntheticRecording({
      legs: [
        servedLeg('a', 0, 100, 200),
        servedLeg('b', 1, 100, 200),
        waitingLeg('c', 100),
        waitingLeg('d', 100),
        waitingLeg('e', 100),
      ],
    });
    expect(observationsAt(recording, 300).peakQueue.count).toBe(3);
  });

  it('breaks a tie for the deepest queue now in building order, not string order', () => {
    const recording = syntheticRecording({
      legs: [waitingLeg('a', 0, 'L0'), waitingLeg('b', 0, 'L2')],
    });
    expect(observationsAt(recording, 10).deepestQueueFloorId).toBe('L0');
  });
});
