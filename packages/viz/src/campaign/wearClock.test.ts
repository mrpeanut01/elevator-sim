/**
 * **A filed day wears the machines down** — GitHub issue #313, end to end through the shipped press.
 *
 * `career.test.ts` holds the reducer's arithmetic and `live/observations.test.ts` holds the fold.
 * What neither can hold is the seam between them, which is where the defect actually was: § 8.3's
 * four consumers were wired, the field existed, `wearOf` and `serviceDaysLeft` read it, and **no
 * press moved it**. That is `accessZones`' polarity ([§ D265](../../../../DECISIONS.md)) — a caller
 * with no behaviour to reach — and the only assertion that closes it is one that runs a day, closes
 * it, and reads the clock back.
 *
 * So this drives `everyday/host.ts#runCampaignDay` and `#closeDay` over a **real** recording of the
 * one building `openingCareer` holds. A stub recording would grade nothing, the day would file
 * nothing, and every case here would pass on a build that still wears nothing down.
 *
 * ## What is asserted, and why it is not the field
 *
 * `tower.trips` moving is the weakest claim available and would be satisfied by a number written
 * into a record nothing reads — which is the state this issue is about. So the clock is read through
 * `economy.ts`'s own consumers as well: the wear fraction, the working days left before the window,
 * and the daily failure odds. And the figure it takes is required to be **the run's**, not merely
 * positive: it is compared against `observationsAt(recording, endedAt).loadedDepartures`, so a press
 * that filed some other day's count would fail.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ViewerState } from '../dev/state.js';
import {
  createEverydayHost,
  type EverydayHost,
  type EverydayHostBindings,
} from '../everyday/host.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import type { VizRecording } from '../contract/types.js';

import { towerById } from './career.js';
import { failureOddsPct, serviceDaysLeft, wearOf } from './economy.js';

/** The campaign's own building and hour — `c1` is the only contract `openingCareer` holds. */
const CONTRACT_LENGTH_S = 3600;

describe('the wear clock', () => {
  let recording: VizRecording;
  let loaded: LoadedConfig;

  beforeAll(async () => {
    loaded = await loadConfig(DATA_DIR);
    const config: SimulationConfig = fixtureConfig(loaded, {
      buildingId: 'garden-apartments',
      durationS: CONTRACT_LENGTH_S,
      seed: 424242n,
      onTimeout: 'report',
    });
    recording = recordRun(config, { recordDecisions: false }).recording;
  }, 300_000);

  /**
   * A host whose `closeDay` latches by `runId` exactly as `dev/main.ts` does, so the crossing
   * `everyday/host.ts#closeDay` reads back is the real one rather than a constant.
   */
  function harness(): { readonly host: EverydayHost } {
    let state: ViewerState = { ...baseState(), buildingId: 'garden-apartments', recording };
    let filed: string | undefined;
    const bindings: EverydayHostBindings = {
      resources: RESOURCES,
      state: () => state,
      playheadS: () => recording.endedAt,
      dayClosed: () => filed === recording.runId,
      runIsOwn: () => true,
      playerHasChosen: () => true,
      dayStartS: () => undefined,
      startRun: () => {},
      intervene: () => {},
      closeDay: () => {
        filed = recording.runId;
      },
      openRunTab: () => {},
      applyPatch: (patch) => {
        state = { ...state, ...patch };
      },
      /*
       * The six spectator bindings, which wave J's lane C added to this type after this fixture was
       * written. Neither of these cases drives watching, so five of them **throw**: a silent stub
       * answering `enterWatch` or `simulateRecord` would let a future change reach the spectator
       * state through a campaign test and still pass, which is the shape of defect this repository
       * keeps finding. `watching()` is the exception and returns `undefined` because that is simply
       * true here — nothing is being watched — rather than a stand-in for an answer.
       */
      loadReferenceRuns: () => {
        throw new Error('this fixture does not drive watching');
      },
      simulateRecord: () => {
        throw new Error('this fixture does not drive watching');
      },
      enterWatch: () => {
        throw new Error('this fixture does not drive watching');
      },
      stopWatching: () => {
        throw new Error('this fixture does not drive watching');
      },
      playThisCrowd: () => {
        throw new Error('this fixture does not drive watching');
      },
      watching: () => undefined,
      /* No page, so no API origin, so nothing to ask — the honest no-server arm. */
      dailyBoard: undefined,
      onChange: () => () => {},
    };
    return { host: createEverydayHost(bindings) };
  }

  it('takes the day’s own loaded departures, and § 8.3 reads them back', () => {
    const { host } = harness();
    const before = towerById(host.campaign(), 'c1');
    expect(before?.trips).toBe(0);

    host.runCampaignDay('c1');
    host.closeDay();

    const after = towerById(host.campaign(), 'c1');
    expect(after).toBeDefined();
    if (after === undefined || before === undefined) return;

    // The day filed at all — otherwise every claim below is about a press that did nothing.
    expect(after.day).toBe(before.day + 1);

    // **The run's own count**, not merely a positive number.
    const trips = observationsAt(recording, recording.endedAt).loadedDepartures;
    expect(trips).toBeDefined();
    expect(trips).toBeGreaterThan(0);
    expect(after.trips).toBe(trips);

    // And § 8.3's consumers moved with it — the half that says the seam is not decorative.
    expect(wearOf(after)).toBeGreaterThan(wearOf(before));
    expect(failureOddsPct(after)).toBeGreaterThan(failureOddsPct(before));
    /*
     * **`daysLeft` does not move on one day at this cell, and the size of the gap is the finding.**
     * § 8.3 sizes it at `round((serviceAt − trips) / 1400)` — *1 400 trips a working day* — and a
     * campaign day here is `garden-apartments` for one hour, which on this seed produces **16**
     * loaded departures over **29** arrivals. So the printed figure goes 32 → 32, and it would take
     * on the order of 45 000 / 16 ≈ **2 800** contract days to reach a service window.
     *
     * That is a fact about the shipped cell rather than about this seam, and the assertion is made in
     * the direction it is true in rather than strengthened by picking a different building. Two
     * numbers this document's own owner has to reconcile fall out of it: § 8.3's *1 400 a working
     * day* is off by roughly **ninety-fold** at the cell § 8 actually runs, and the tier bars
     * (`tests.trips`, 620 / 520 / 470 / 430) are unmissable there by a factor of thirty. Scaling the
     * count on its way in would have hidden both inside an invented constant, so it is not done.
     */
    expect(serviceDaysLeft(after)).toBeLessThanOrEqual(serviceDaysLeft(before));
  }, 300_000);

  it('takes nothing on a press that files nothing', () => {
    /*
     * `closeDay` returns early on three gates — a run nobody started, a run this shell did not
     * simulate, one already filed — and the wear clock has to be inside the same gate as the day,
     * or a second press on a written sheet would wear the tower twice.
     */
    const { host } = harness();
    host.runCampaignDay('c1');
    host.closeDay();
    const once = towerById(host.campaign(), 'c1');
    host.closeDay();
    expect(towerById(host.campaign(), 'c1')).toEqual(once);
  }, 300_000);

  it('does not move on a day this shell never armed', () => {
    // `campaignDayTowerId` is armed only by `runCampaignDay`, so a bare close is § 6's day rather
    // than § 8's and files against no contract.
    const { host } = harness();
    host.closeDay();
    expect(towerById(host.campaign(), 'c1')?.trips).toBe(0);
    expect(towerById(host.campaign(), 'c1')?.day).toBe(1);
  }, 300_000);
});
