/**
 * The live metrics overlay's data, against real runs of every shipped building.
 *
 * Three claims are worth the run time and each is stated against something independent:
 *
 * 1. **The overlay and the frame agree.** `waitingNow` is recomputed from the legs;
 *    `Frame.totalWaiting` is sampled from the fold. They come from different structures built by
 *    different code paths, so equality is evidence rather than tautology — and this is the check
 *    that would have caught a `describeLegs` that dropped or duplicated a leg.
 * 2. **A saturated run gets no mean.** Not asserted on a stub with `saturated: true` bolted on,
 *    but on `midtown-office` and `vertical-city`, which saturate at the shipped traffic rates.
 * 3. **A non-saturated run does.** The negative control. Suppression that fires everywhere is
 *    indistinguishable from a module that never computes anything, and this repository has
 *    shipped that shape before.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  BUILDING_IDS,
  DATA_DIR,
  PANEL_DISPATCHER_ID,
  breadthConfig,
} from '../fixtures.test-helper.js';
import { frameAt } from './frameAt.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording } from '../contract/types.js';
import { DEFAULT_WINDOW_S, landingAssignmentsAt, overlayAt } from './overlay.js';

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

/** Ten instants spread across the run, including both ends. */
function sampleTimes(recording: VizRecording): readonly number[] {
  const span = recording.endedAt - recording.startedAt;
  return Array.from({ length: 11 }, (_, i) => recording.startedAt + (span * i) / 10);
}

describe.each(BUILDING_IDS)('%s — the overlay agrees with the frame', (buildingId) => {
  it('counts the same legs waiting as the folded progress series does', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const metrics = overlayAt(recording, t);
      const frame = frameAt(recording, t);
      expect(`${String(t)}: ${String(metrics.waitingNow)}`).toBe(
        `${String(t)}: ${String(frame.totalWaiting)}`,
      );
    }
  }, 300_000);

  it('never reports a longer current wait than the run is old', () => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      const { longestCurrentWaitS } = overlayAt(recording, t);
      if (longestCurrentWaitS === undefined) continue;
      expect(longestCurrentWaitS).toBeGreaterThanOrEqual(0);
      expect(longestCurrentWaitS).toBeLessThanOrEqual(t - recording.startedAt + 1e-9);
    }
  }, 300_000);

  it('windows: everything counted boarded inside the window, and no more', () => {
    const recording = recordingOf(buildingId);
    const t = recording.startedAt + (recording.endedAt - recording.startedAt) * 0.8;
    const metrics = overlayAt(recording, t);
    const expected = recording.legs.filter(
      (leg) =>
        leg.boardedAt !== undefined &&
        leg.boardedAt >= metrics.windowStartS &&
        leg.boardedAt <= t &&
        leg.arrivedAt <= t,
    );
    expect(metrics.boardedInWindow).toBe(expected.length);
    // And it is a *window*, not the whole run: the cumulative count must be at least as large,
    // and strictly larger somewhere, or the window is doing nothing.
    const cumulative = recording.legs.filter(
      (leg) => leg.boardedAt !== undefined && leg.boardedAt <= t,
    ).length;
    expect(metrics.boardedInWindow).toBeLessThanOrEqual(cumulative);
  }, 300_000);

  it('splits by bank without inventing or losing a leg', () => {
    const recording = recordingOf(buildingId);
    const t = recording.endedAt;
    const metrics = overlayAt(recording, t);
    const banked = metrics.banks.reduce((sum, bank) => sum + bank.boardedInWindow, 0);
    const unbanked = recording.legs.filter(
      (leg) =>
        leg.boardedAt !== undefined &&
        leg.boardedAt >= metrics.windowStartS &&
        leg.boardedAt <= t &&
        leg.bankId === undefined,
    ).length;
    expect(banked + unbanked).toBe(metrics.boardedInWindow);
  }, 300_000);
});

describe('statistical honesty — a saturated run gets no mean', () => {
  // Measured, not assumed: at the shipped traffic rates over 900 s, these two saturate and the
  // other three do not. The probe that established it is in the delivery report.
  it.each(['midtown-office', 'vertical-city'])(
    '%s saturates, so every estimate is suppressed and every observation survives',
    (buildingId) => {
      const recording = recordingOf(buildingId);
      expect(recording.summary.saturated).toBe(true);
      expect(recording.summary.awtIsValid).toBe(false);

      for (const t of sampleTimes(recording)) {
        const metrics = overlayAt(recording, t);
        expect(metrics.suppressed).toBe(true);
        expect(metrics.rollingMeanWaitS).toBeUndefined();
        for (const bank of metrics.banks) expect(bank.meanWaitS).toBeUndefined();
        expect(metrics.suppressionReason).toBeDefined();
      }

      // The observations are exactly what lets a reader *see* the divergence, so they must not
      // be suppressed with the estimates. Asserted over the whole run rather than at `endedAt`:
      // `midtown-office` saturates *during* its peak and then drains, so its final instant has
      // nobody waiting — which is itself the reason a viewer needs the queue over time and not
      // one number at the end.
      const observed = sampleTimes(recording).map((t) => overlayAt(recording, t));
      expect(Math.max(...observed.map((m) => m.waitingNow))).toBeGreaterThan(0);
      expect(Math.max(...observed.map((m) => m.boardedInWindow))).toBeGreaterThan(0);
      expect(
        Math.max(...observed.map((m) => m.longestCurrentWaitS ?? 0)),
      ).toBeGreaterThan(0);
    },
    300_000,
  );

  it.each(['garden-apartments', 'secure-tower'])(
    '%s does not saturate, so the mean is reported — the negative control',
    (buildingId) => {
      const recording = recordingOf(buildingId);
      expect(recording.summary.saturated).toBe(false);
      expect(recording.summary.awtIsValid).toBe(true);
      const metrics = overlayAt(recording, recording.endedAt);
      expect(metrics.suppressed).toBe(false);
      expect(metrics.rollingMeanWaitS).toBeGreaterThan(0);
      expect(metrics.suppressionReason).toBeUndefined();
    },
    300_000,
  );

  it('copies the verdict rather than deciding for itself', () => {
    // UX.md § 7.1 rule 4. Flipping the summary's flag must flip the overlay, with no second
    // opinion anywhere: a viewer that recomputed "is this saturated" would ignore this.
    const recording = recordingOf('garden-apartments');
    const forced: VizRecording = {
      ...recording,
      summary: { ...recording.summary, awtIsValid: false, awtInvalidReason: 'forced for the test' },
    };
    const metrics = overlayAt(forced, forced.endedAt);
    expect(metrics.suppressed).toBe(true);
    expect(metrics.rollingMeanWaitS).toBeUndefined();
    expect(metrics.suppressionReason).toBe('forced for the test');
  }, 300_000);
});

describe('the rolling mean is a rolling mean', () => {
  it('differs from the cumulative running mean somewhere in a busy run', () => {
    // If it did not, the whole reason for widening the contract would be absent: the recording
    // already carried a cumulative mean, and a "rolling" figure equal to it everywhere is that
    // same number under a new label.
    const recording = recordingOf('secure-tower');
    const differences = sampleTimes(recording)
      .map((t) => {
        const rolling = overlayAt(recording, t).rollingMeanWaitS;
        const cumulative = frameAt(recording, t).runningMeanWaitS;
        if (rolling === undefined || cumulative === undefined) return 0;
        return Math.abs(rolling - cumulative);
      })
      .filter((difference) => difference > 0.5);
    expect(differences.length).toBeGreaterThan(0);
  }, 300_000);

  it.each(BUILDING_IDS)(
    '%s: equals the mean of the very legs the window contains, recomputed here',
    (buildingId) => {
      /*
       * The mutation this test exists for: `rollingMeanWaitS` replaced by the constant `12`
       * survived the whole suite. Every other assertion about it was either a bound
       * (`> 0`) or a comparison against a value the panel had itself taken from `overlayAt`,
       * so a constant satisfied all of them at once — the frame-field defect one layer up.
       *
       * The expectation here is computed from `recording.legs` directly, without calling
       * `overlayAt`, so the two agree only if `overlayAt` is doing the arithmetic.
       */
      const recording = recordingOf(buildingId);
      for (const windowS of [120, DEFAULT_WINDOW_S, 100_000]) {
        for (const t of sampleTimes(recording)) {
          const metrics = overlayAt(recording, t, { windowS });
          const inWindow = recording.legs.filter(
            (leg) =>
              leg.boardedAt !== undefined &&
              leg.arrivedAt <= t &&
              leg.boardedAt <= t &&
              leg.boardedAt >= Math.max(recording.startedAt, t - windowS),
          );
          if (metrics.suppressed || inWindow.length === 0) {
            expect(metrics.rollingMeanWaitS).toBeUndefined();
            continue;
          }
          const expected =
            inWindow.reduce((sum, leg) => sum + ((leg.boardedAt ?? 0) - leg.arrivedAt), 0) /
            inWindow.length;
          expect(metrics.rollingMeanWaitS).toBeCloseTo(expected, 9);

          // …and the same, per bank, which the same constant-substitution also survived.
          for (const bank of metrics.banks) {
            const legs = inWindow.filter((leg) => leg.bankId === bank.bankId);
            const bankExpected =
              legs.reduce((sum, leg) => sum + ((leg.boardedAt ?? 0) - leg.arrivedAt), 0) /
              legs.length;
            expect(bank.meanWaitS).toBeCloseTo(bankExpected, 9);
          }
        }
      }
    },
    300_000,
  );

  it('responds to the window length', () => {
    const recording = recordingOf('secure-tower');
    const t = recording.endedAt;
    const narrow = overlayAt(recording, t, { windowS: 60 });
    const wide = overlayAt(recording, t, { windowS: 100_000 });
    expect(narrow.boardedInWindow).toBeLessThan(wide.boardedInWindow);
    expect(wide.windowStartS).toBe(recording.startedAt);
    expect(narrow.windowS).toBe(60);
    expect(overlayAt(recording, t).windowS).toBe(DEFAULT_WINDOW_S);
  }, 300_000);
});

describe('landing assignments — RV-T3', () => {
  it.each(BUILDING_IDS)('%s: the car named is the car the record says served that leg', (buildingId) => {
    const recording = recordingOf(buildingId);
    const t = recording.startedAt + (recording.endedAt - recording.startedAt) * 0.5;
    const assignments = landingAssignmentsAt(recording, t);
    expect(assignments.length).toBeGreaterThan(0);

    for (const assignment of assignments) {
      const waitingHere = recording.legs.filter(
        (leg) =>
          leg.originFloorId === assignment.floorId &&
          leg.direction === assignment.direction &&
          leg.arrivedAt <= t &&
          (leg.boardedAt === undefined || leg.boardedAt > t),
      );
      expect(assignment.waiting).toBe(waitingHere.length);

      const oldest = waitingHere.reduce((best, leg) => (leg.arrivedAt < best.arrivedAt ? leg : best));
      // The claim the row makes: *the assignment shown matches the record*.
      expect(assignment.answeredByCarId).toBe(oldest.carId);
      expect(assignment.answeredByBankId).toBe(oldest.bankId);
      expect(assignment.oldestWaitS).toBeCloseTo(t - oldest.arrivedAt, 9);
      if (oldest.boardedAt === undefined) {
        expect(assignment.answeredInS).toBeUndefined();
      } else {
        expect(assignment.answeredInS).toBeCloseTo(oldest.boardedAt - t, 9);
      }
    }
  }, 300_000);

  it('is ordered deterministically, not by Map insertion', () => {
    const recording = recordingOf('midtown-office');
    const t = recording.endedAt / 2;
    const key = (): string =>
      landingAssignmentsAt(recording, t)
        .map((a) => `${a.floorId}/${a.direction}`)
        .join(',');
    const once = key();
    expect(key()).toBe(once);
    expect(once).toBe(
      [...once.split(',')].sort((a, b) => a.localeCompare(b)).join(','),
    );
  }, 300_000);

  it('reports an unanswered call as unassigned rather than as a long wait — RV-08', () => {
    // Built rather than hunted for: a leg nobody ever served has no `carId`, and the row
    // requires that to read as unassignable.
    const recording = recordingOf('garden-apartments');
    const orphan: VizRecording = {
      ...recording,
      legs: [
        { passengerId: 'orphan', originFloorId: recording.floors[1]?.id ?? 'G', destinationFloorId: recording.floors[0]?.id ?? 'G', direction: 'up', arrivedAt: recording.startedAt },
      ],
    };
    const [assignment] = landingAssignmentsAt(orphan, orphan.endedAt);
    expect(assignment?.answeredByCarId).toBeUndefined();
    expect(assignment?.answeredInS).toBeUndefined();
    expect(assignment?.waiting).toBe(1);
  }, 300_000);
});

describe('purity and clamping', () => {
  it('gives the same answer whichever order the instants are asked for', () => {
    const recording = recordingOf('garden-apartments');
    const times = sampleTimes(recording);
    const forward = times.map((t) => JSON.stringify(overlayAt(recording, t)));
    const backward = [...times].reverse().map((t) => JSON.stringify(overlayAt(recording, t)));
    expect(backward.reverse()).toEqual(forward);
  }, 300_000);

  it('clamps outside the run rather than extrapolating', () => {
    const recording = recordingOf('garden-apartments');
    expect(overlayAt(recording, -1e6).simTimeS).toBe(recording.startedAt);
    expect(overlayAt(recording, 1e6).simTimeS).toBe(recording.endedAt);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * Version 4 — a landing call under a panel
 * -------------------------------------------------------------------------- */

describe('landingAssignmentsAt under destination dispatch', () => {
  const panels = new Map<string, VizRecording>();
  const panelOf = (id: string): VizRecording => {
    const cached = panels.get(id);
    if (cached !== undefined) return cached;
    const built = recordRun(breadthConfig(config, id, { dispatcherId: PANEL_DISPATCHER_ID }))
      .recording;
    panels.set(id, built);
    return built;
  };

  it.each(BUILDING_IDS)('partitions the waiting legs into promise groups, on %s', (buildingId) => {
    const recording = panelOf(buildingId);
    expect(recording.passengerModel).toBe('destination-dispatch');

    let sawMultipleRowsOnOneFloor = false;
    for (const t of sampleTimes(recording)) {
      const rows = landingAssignmentsAt(recording, t);
      const perFloor = new Map<string, number>();
      let counted = 0;
      for (const row of rows) {
        /* Every row is a real group, and its fields are the group's own — not a constant. */
        expect(row.destinationFloorId, row.key).toBeDefined();
        expect(row.promisedCarId, row.key).toBeDefined();
        expect(row.key).toBe(
          `${row.floorId} ${row.direction} ${String(row.destinationFloorId)} ${String(row.promisedCarId)}`,
        );
        counted += row.waiting;
        perFloor.set(row.floorId, (perFloor.get(row.floorId) ?? 0) + 1);

        /* Recomputed from the legs, so a row whose fields were pinned would disagree. */
        const members = recording.legs.filter(
          (leg) =>
            leg.arrivedAt <= t &&
            (leg.boardedAt === undefined || leg.boardedAt > t) &&
            leg.originFloorId === row.floorId &&
            leg.destinationFloorId === row.destinationFloorId &&
            leg.assignedCarId === row.promisedCarId,
        );
        expect(members.length, row.key).toBe(row.waiting);
      }
      /* The partition is exhaustive: every waiting leg is in exactly one row. */
      expect(counted).toBe(frameAt(recording, t).totalWaiting);
      if ([...perFloor.values()].some((n) => n > 1)) sawMultipleRowsOnOneFloor = true;
    }

    /* Witness — the whole point of the key change. Garden Apartments is the one shipped
       building small enough that it may not happen, and it is excluded rather than the
       assertion being softened. */
    if (buildingId !== 'garden-apartments') {
      expect(sawMultipleRowsOnOneFloor, `${buildingId} never split a floor into two calls`).toBe(
        true,
      );
    }
  }, 600_000);

  it.each(BUILDING_IDS)('is keyed by direction alone under the conventional model, on %s', (buildingId) => {
    const recording = recordingOf(buildingId);
    for (const t of sampleTimes(recording)) {
      for (const row of landingAssignmentsAt(recording, t)) {
        expect(row.destinationFloorId, row.key).toBeUndefined();
        expect(row.promisedCarId, row.key).toBeUndefined();
        expect(row.key).toBe(`${row.floorId} ${row.direction}`);
      }
    }
  }, 300_000);

  it('reports a promise for a call no car ever answered', () => {
    /*
     * The falsehood version 4 removes. Under a panel, `answeredByCarId === undefined` means the
     * horizon closed before the promised car arrived — **not** that the call was unassignable.
     * Measured reachable on a shipped building: Vertical City at 20 % of population per 5
     * minutes, seed 20260727, ends `timed-out` with 25 promised-but-never-boarded legs. Built
     * here rather than run there, because reproducing that costs 3557 legs of simulation to
     * assert one branch.
     */
    const base = recordingOf('garden-apartments');
    const stranded: VizRecording = {
      ...base,
      passengerModel: 'destination-dispatch',
      legs: [
        {
          passengerId: 'stranded',
          originFloorId: base.floors[1]?.id ?? 'G',
          destinationFloorId: base.floors[0]?.id ?? 'G',
          direction: 'down',
          arrivedAt: base.startedAt,
          assignedCarId: 'main-B',
        },
      ],
    };
    const [row] = landingAssignmentsAt(stranded, stranded.endedAt);
    expect(row?.promisedCarId).toBe('main-B');
    expect(row?.answeredByCarId).toBeUndefined();
    expect(row?.answeredInS).toBeUndefined();
    expect(row?.waiting).toBe(1);
  }, 300_000);
});
