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
import { refusedLeg, servedLeg, syntheticRecording, waitingLeg } from './synthetic.test-helper.js';

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
      // The worst wait is a maximum over a growing set of non-shrinking terms: a resolved wait
      // is fixed and an unresolved one accrues, so the playhead moving forward can only raise it.
      expect(o.worstWaitSoFarS ?? 0).toBeGreaterThanOrEqual(previous.worstWaitSoFarS ?? 0);
      previous = o;
    }
  }, 300_000);

  it('bounds core’s own service-level maximum from above at the end of the run', () => {
    /*
     * The relationship `live/types.ts` states for `worstWaitSoFarS`: the fold applies
     * `diagnoseServiceLevel`'s ending rules with `censoredAtS` set to the playhead, over
     * **every** leg arrived by `t`, while `serviceLevel.longestWaitS` is the same rule over the
     * reporting window's arrivals only. The window's cohort is a subset, so at `t = endedAt`
     * the fold can never sit below the summary (no breadth run declares `sim.patience`, so the
     * one ending rule this layer cannot see is inert). Not asserted as equality, because no
     * shipped template's window spans its run — measured by this suite's own non-vacuity
     * guard, which found zero spanning windows and is kept below as documentation with teeth.
     */
    const recording = recordingOf(buildingId);
    const level = recording.summary.serviceLevel;
    if (level.longestWaitS === null) return;
    const o = observationsAt(recording, recording.endedAt);
    expect(o.worstWaitSoFarS ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(
      level.longestWaitS - 1e-6,
    );
  }, 300_000);

  it('counts every wait that crossed the horizon and no rider the door turned away', () => {
    /*
     * `abandoned`, re-derived from the legs by `core`'s own ending rule
     * (`metrics/summarize.ts#diagnoseServiceLevel`: `boardedAt ?? abandonedAt ?? refusedAt ??
     * censoredAtS`, minus the field `VizLeg` does not carry), and the two must agree — GitHub
     * issue #288, where they did not. Deriving it here rather than reading the module's own
     * constant is the point: this is a second expression of the rule, so a fold that quietly went
     * back to `boardedAt` alone fails even on a building whose refusals all land inside the
     * horizon.
     *
     * **This case alone is not enough and says so**, because the breadth fixture cannot produce
     * the state the defect needs. A 900 s run against a 900 s horizon has *no* leg that crosses at
     * all — and mutating the ending rule back to `boardedAt` leaves this green on all eight
     * buildings. The run that reaches it is Secure Tower's own authored day, in
     * *the sheet cannot contradict itself* below; the guard in the sibling describe holds the
     * fixture's own non-vacuity in the two directions it can.
     */
    const recording = recordingOf(buildingId);
    const horizonS = recording.summary.serviceLevel.horizonS;
    const t = recording.endedAt;
    const crossed = recording.legs.filter((leg) => {
      if (leg.arrivedAt > t) return false;
      const endedAt = leg.boardedAt ?? leg.refusedAt;
      const waitEndedAt = endedAt ?? Number.POSITIVE_INFINITY;
      return Math.min(waitEndedAt, t) - leg.arrivedAt > horizonS;
    });
    const o = observationsAt(recording, t);
    expect(`${buildingId}: ${String(o.abandoned)}`).toBe(
      `${buildingId}: ${String(crossed.length)}`,
    );
    expect(o.turnedAway).toBe(recording.legs.filter((leg) => leg.refusedAt !== undefined).length);
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

describe('the fold and the summary really are two cohorts on every shipped run', () => {
  it('no shipped run’s reporting window spans the run — the split the small print states', () => {
    /*
     * This began life as the opposite assertion — *at least one window spans, so the equality
     * case is checked* — and it failed 0 of 8, which is the measurement `live/types.ts` now
     * records: the goal layer's whole-shift maximum and the report's windowed WORST WAIT are
     * different stated cohorts on **every** shipped building, not an edge case. Pinned in this
     * direction so the day a template ships a spanning window, this fails and the equality
     * assertion gets written against a run that exists rather than a hypothetical one.
     */
    const spanning = BUILDING_IDS.filter((id) => {
      const recording = recordingOf(id);
      const window = recording.summary.reportWindow;
      return window.startS <= recording.startedAt && window.endS >= recording.endedAt;
    });
    expect(spanning).toEqual([]);
  }, 300_000);

  it('really does put refused legs and over-horizon legs in front of the breadth fold', () => {
    /*
     * The non-vacuity guard for *counts every wait that crossed the horizon and no rider the door
     * turned away*. Both halves of that assertion are about populations the fixture has to contain,
     * and this is where it is checked rather than hoped for: a `data/` change that badged every
     * rider correctly, or a demand rate that stopped anybody crossing the horizon, would leave that
     * case green while measuring nothing.
     *
     * Named counts rather than a bare *greater than zero*, because the identity they pin is the one
     * `observations.ts#sweepQueues` states as measured fact — `refusedAt` equals `arrivedAt` on
     * **every** refused leg — and a run where that stopped being true is a run whose stairs count
     * this suite would want to look at again.
     */
    const refusedByBuilding = Object.fromEntries(
      BUILDING_IDS.map((id) => [id, recordingOf(id).legs.filter((l) => l.refusedAt !== undefined)]),
    );
    const refusedTotal = Object.values(refusedByBuilding).reduce(
      (sum, legs) => sum + legs.length,
      0,
    );
    const refusedAtArrival = Object.values(refusedByBuilding).reduce(
      (sum, legs) => sum + legs.filter((l) => l.refusedAt === l.arrivedAt).length,
      0,
    );
    expect(refusedTotal).toBeGreaterThan(0);
    expect(refusedAtArrival).toBe(refusedTotal);

    const crossers = BUILDING_IDS.filter(
      (id) => observationsAt(recordingOf(id), recordingOf(id).endedAt).abandoned > 0,
    );
    expect(crossers.length).toBeGreaterThan(0);
  }, 300_000);
});

describe('the edges a real run will not show on demand', () => {
  it('withholds the served share rather than reporting 100 % of nobody', () => {
    const o = observationsAt(syntheticRecording({ legs: [waitingLeg('p1', 0)] }), 10);
    expect(o.servedCount).toBe(0);
    expect(o.servedUnderThresholdPct).toBeUndefined();
  });

  it('reads the worst wait as censored while its rider is standing, and exact once they board', () => {
    // p1 boards at 200 after a 200 s wait; p2 boards at 30. At t = 100 the worst wait on the
    // board is p1's 100 s so far — a lower bound, and the flag says so. At t = 300 the maximum
    // belongs to a resolved leg and is exact.
    const recording = syntheticRecording({
      legs: [servedLeg('p1', 0, 200, 260), servedLeg('p2', 10, 40, 80)],
      endedAt: 400,
    });
    const standing = observationsAt(recording, 100);
    expect(standing.worstWaitSoFarS).toBe(100);
    expect(standing.worstWaitIsCensored).toBe(true);
    const resolved = observationsAt(recording, 300);
    expect(resolved.worstWaitSoFarS).toBe(200);
    expect(resolved.worstWaitIsCensored).toBe(false);
  });

  it('reports no worst wait at all before anybody has arrived', () => {
    const o = observationsAt(syntheticRecording({ legs: [waitingLeg('p1', 50)] }), 10);
    expect(o.worstWaitSoFarS).toBeUndefined();
    expect(o.worstWaitIsCensored).toBe(false);
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

  /* ------------------------------------------------------------------------ *
   * The fourth outcome — GitHub issue #288
   * ------------------------------------------------------------------------ */

  it('does not count a rider turned away at the door as having waited past the horizon', () => {
    // The defect, in its smallest form: a refused rider never boards, so an ending rule that reads
    // `boardedAt` alone hands them `arrivedAt + horizonS` and the sheet's TOOK THE STAIRS cell —
    // captioned *waited past the 15-minute horizon* — counts somebody who waited zero seconds.
    const recording = syntheticRecording({ legs: [refusedLeg('p1', 0)], endedAt: 3000 });
    for (const t of [0, 100, 901, 1500, 3000]) {
      expect(observationsAt(recording, t).abandoned, `t=${String(t)}`).toBe(0);
    }
    // Removed from one count and reported in another. A repair that only deleted a figure would
    // have made this sheet quieter rather than truer — `CLAUDE.md`, and § D266.
    expect(observationsAt(recording, 3000).turnedAway).toBe(1);
  });

  it('still counts a refusal that came after the horizon, because that wait really did cross it', () => {
    /*
     * The negative control on the case above, and the reason `crossesHorizonAt` resolves the wait
     * at `refusedAt` rather than testing `refusedAt !== undefined`. No shipped run produces this —
     * every measured refusal is at `arrivedAt` — so a fold that special-cased *refused* instead of
     * *the wait ended here* would look identical on every building the project ships and would be
     * wrong about the one leg that mattered.
     */
    const recording = syntheticRecording({ legs: [refusedLeg('p1', 0, 950)], endedAt: 3000 });
    expect(observationsAt(recording, 899).abandoned).toBe(0);
    expect(observationsAt(recording, 901).abandoned).toBe(1);
    // Counted under both heads, and that is correct rather than double counting: this rider's wait
    // crossed the horizon *and* the building turned them away. The two cells overlap, exactly as
    // `abandonedCarried` records the overlap between TOOK THE STAIRS and CARRIED.
    expect(observationsAt(recording, 3000).turnedAway).toBe(1);
  });

  it('counts a rider turned away only from the instant the building turned them away', () => {
    const recording = syntheticRecording({ legs: [refusedLeg('p1', 100, 400)], endedAt: 3000 });
    expect(observationsAt(recording, 399).turnedAway).toBe(0);
    expect(observationsAt(recording, 400).turnedAway).toBe(1);
  });

  it('ends a refused rider’s worst wait at the refusal, which is the rule `abandoned` now shares', () => {
    /*
     * The two folds in `observationsAt` had disagreed about when a wait ends since `refusedAt`
     * arrived: the worst-wait fold resolved at `boardedAt ?? refusedAt` and the horizon crossing
     * resolved at `boardedAt`. Asserted together so they cannot drift apart again — a refused
     * rider is neither the worst wait in the building nor a stairs-taker.
     */
    const recording = syntheticRecording({
      legs: [refusedLeg('p1', 0), servedLeg('p2', 10, 40, 90)],
      endedAt: 3000,
    });
    const o = observationsAt(recording, 3000);
    expect(o.worstWaitSoFarS).toBe(30);
    expect(o.worstWaitIsCensored).toBe(false);
    expect(o.abandoned).toBe(0);
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

/* -------------------------------------------------------------------------- *
 * § 5's `trips`, at the playhead
 * -------------------------------------------------------------------------- */

describe('loaded departures are cut at the playhead like everything else here', () => {
  it('counts the loaded moves that had ended by `t`, and is non-decreasing in it', () => {
    const recording = syntheticRecording({ loadedDepartures: [30, 90, 90, 240] });
    expect(observationsAt(recording, 0).loadedDepartures).toBe(0);
    expect(observationsAt(recording, 29).loadedDepartures).toBe(0);
    // At the instant a move lands it counts — the same `<= t` rule the leg counts use.
    expect(observationsAt(recording, 30).loadedDepartures).toBe(1);
    // Two cars landing at the same second are two trips, not one.
    expect(observationsAt(recording, 90).loadedDepartures).toBe(3);
    expect(observationsAt(recording, 600).loadedDepartures).toBe(4);
  });

  it('answers the same at an instant whether the playhead arrived forwards or backwards', () => {
    // The module's own no-cursor rule: a reader drags left, and a fold carrying state answers that
    // wrongly in a way that only appears when somebody drags.
    const recording = syntheticRecording({ loadedDepartures: [30, 90, 240] });
    const forwards = [0, 60, 120, 300].map((t) => observationsAt(recording, t).loadedDepartures);
    const backwards = [300, 120, 60, 0]
      .map((t) => observationsAt(recording, t).loadedDepartures)
      .reverse();
    expect(forwards).toEqual(backwards);
  });

  it('is `undefined`, never `0`, on a recording carrying no travel record', () => {
    /*
     * The distinction the campaign's trip budget rests on: its bar is `at-most`, so *nobody wrote
     * it down* folded to a zero would grade **met**. `shift/goals.ts` refuses instead, and this is
     * the field it refuses on.
     */
    const recording = syntheticRecording({ loadedDepartures: undefined });
    expect(recording.loadedDepartures).toBeUndefined();
    expect(observationsAt(recording, 600).loadedDepartures).toBeUndefined();
    // And a fleet that genuinely made none reports a number.
    expect(observationsAt(syntheticRecording({ loadedDepartures: [] }), 600).loadedDepartures).toBe(
      0,
    );
  });

  it('is on every shipped building’s own run, and is a strict subset of the fleet’s moves', () => {
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      const times = recording.loadedDepartures;
      expect(times, `${id} recorded no trip count at all`).toBeDefined();
      if (times === undefined) continue;
      // Non-vacuity: a building whose cars never carried anybody would make every claim here empty.
      expect(times.length, `${id} made no loaded departure`).toBeGreaterThan(0);
      // Ascending, which is what lets the fold break early.
      expect([...times].sort((a, b) => a - b)).toEqual([...times]);
      // Inside the run, and no more numerous than the moves the fleet actually made.
      for (const at of times) expect(at).toBeLessThanOrEqual(recording.endedAt);
      const moves = recording.shafts.reduce((total, shaft) => total + shaft.motions.length, 0);
      expect(times.length).toBeLessThanOrEqual(moves);
      /*
       * **Checked against the motions and deliberately not against `summary.energy.starts`.** The
       * two count the same events over **different stretches**: `starts` is the *reporting window's*
       * moves and this is the *whole run's*, and every shipped template narrows its window — the
       * suite above measured 0 of 8 spanning. Measured on this loop's own recordings, `chancery-house`
       * reports **265** loaded departures against **97** windowed starts and `vertical-city` reports
       * **899** against **385**, so an ordering between them is not a property at all.
       * `GoalObservations.worstWaitS` is the same pair of cohorts and says so; the trip count has to
       * be whole-run because the fold serves a playhead, and a bar drawn against it grades the shift.
       */
      expect(recording.summary.energy.starts).not.toBeNull();
    }
  }, 300_000);

  it('exceeds the windowed start count on the two buildings the paragraph above names', () => {
    /*
     * **The published pair, run rather than transcribed.** The comment one case up cites two
     * measurements; a citation nobody re-derives is how a number in this repository goes stale, and
     * a first draft of it named the wrong building. So the direction is asserted — whole-run count
     * *above* windowed starts — on the two recordings the prose quotes.
     *
     * The direction rather than the digits: an ordering is the claim being made, and pinning 265 and
     * 97 exactly would redden this file the next time a demand template moved without telling anyone
     * anything about the cohorts.
     */
    for (const id of ['chancery-house', 'vertical-city'] as const) {
      const recording = recordingOf(id);
      const times = recording.loadedDepartures ?? [];
      const starts = recording.summary.energy.starts;
      expect(starts, id).not.toBeNull();
      expect(times.length, `${id}: whole-run trips no longer exceed the windowed starts`).toBeGreaterThan(
        starts ?? 0,
      );
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * The energy bar's observation. § D367, § D468, GitHub issue #275
 * -------------------------------------------------------------------------- */

describe('work per delivered leg arrives at the end of the run and not before', () => {
  it('is undefined at every playhead short of the end, on every shipped building', () => {
    /*
     * The gate the whole field exists for. `workPerServedLegKJ` is a **window statistic** `core`
     * computes once out of load-and-distance pairs the recording does not keep, so there is no
     * instant before the run ends at which it is honestly readable. Publishing it earlier would put
     * a figure that can only be true of a completed window onto a rail drawn at an instant, the
     * class § D307's temporal axis was built to find, and the reason `worstWaitS` is projected from
     * the fold rather than copied off the summary.
     */
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      for (const t of sampleTimes(recording)) {
        if (t >= recording.endedAt) continue;
        expect(observationsAt(recording, t).workPerServedLegKJ, `${id} at ${String(t)}`).toBeUndefined();
      }
    }
  }, 300_000);

  it('is the sheet’s own figure, to the tenth, once the run has ended', () => {
    /*
     * One rounding, not two. `shift/report.ts#energyFigures` prints this with `toFixed(1)`, so a
     * goal graded on more precision than the sheet shows could read `missed` beside a cell showing
     * exactly the bar. This is `worstWaitS`' rule against `worstWaitFigure`, on the second figure
     * that has one.
     */
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      const observed = observationsAt(recording, recording.endedAt).workPerServedLegKJ;
      const { energy } = recording.summary;
      if (!energy.measured || energy.workPerServedLegKJ === null) {
        expect(observed, id).toBeUndefined();
        continue;
      }
      expect(observed, id).toBe(Math.round(energy.workPerServedLegKJ * 10) / 10);
      expect(String(observed ?? ''), id).toBe(
        String(Number(energy.workPerServedLegKJ.toFixed(1))),
      );
    }
  }, 300_000);

  it('refuses a run that recorded no travel rather than folding it to a zero', () => {
    /*
     * The direction that must never be free. The bar is `at-most`, so a run nobody instrumented
     * folded to `0 kJ` would grade **met**, a pass awarded for a measurement that was never taken.
     * `VizEnergy.measured` false is *nobody wrote down how far the cars moved*, which is not the
     * same fact as *the cars did not move*, and only the second of those could ever pass a bar.
     */
    const recording = recordingOf('garden-apartments');
    const unmeasured: VizRecording = {
      ...recording,
      summary: {
        ...recording.summary,
        energy: {
          ...recording.summary.energy,
          measured: false,
          workKJ: null,
          workPerServedLegKJ: null,
          distanceM: null,
          starts: null,
        },
      },
    };
    expect(observationsAt(unmeasured, unmeasured.endedAt).workPerServedLegKJ).toBeUndefined();
  }, 300_000);
});
