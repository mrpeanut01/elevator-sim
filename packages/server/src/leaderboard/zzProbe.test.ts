/**
 * **Measurement scaffolding for FIX-267, committed as evidence and deleted in the next commit.**
 *
 * `RISKS.md` R41: the scaffolding lands before the figure it produced is quoted, because the figure
 * is the thing a report is built on and the run is the only reason to believe it.
 *
 * The question: now that `ACCEPTED_DURATIONS_S` carries a whole authored day, *which* office tower
 * can actually land a whole day on a board — and how expensive is the server's replay of one? Both
 * halves matter. A duration the shape gate accepts still has to survive `verifySubmission`'s
 * quotability check, and the cooldown is now derived from the length, so the replay's real cost is
 * what says whether the derivation is sized right.
 *
 * Measured on this tree, seed 20260804, `office-day` whole (`windowStartS: 0`, `durationS: 36 000`):
 *
 * | building | dispatcher | replay | `awtIsValid` | AWT |
 * |---|---|---|---|---|
 * | `midtown-office` | `collective` | 1 349 ms | **false** | 291.28 |
 * | `midtown-office` | `eta` | 827 ms | **false** | 285.50 |
 * | `chancery-house` | `collective` | 421 ms | true | 11.89 |
 * | `chancery-house` | `eta` | 407 ms | true | 10.48 |
 * | `secure-tower` | `collective` | 456 ms | true | 18.52 |
 * | `secure-tower` | `eta` | 387 ms | true | 15.93 |
 * | `mixed-use-high-rise` | `collective` | 1 273 ms | true | 13.86 |
 * | `mixed-use-high-rise` | `eta` | 1 237 ms | true | 12.73 |
 *
 * **The row to read is `midtown-office`.** Its whole day is not quotable, so widening the duration
 * gate makes a whole day *postable* without making it *rankable* there — the run gets a 422
 * `awt-not-quotable` rather than a 400, which is the correct answer and a different one. That is a
 * limitation of the fix and is reported as one rather than glossed.
 */

import { describe, expect, it } from 'vitest';
import { runSimulation, loadConfig } from '@elevator-sim/core';
import { configFor, metricsOf } from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;

describe('probe: which office tower runs a whole day fastest and quotably', () => {
  it('measures', async () => {
    const config0 = await loadConfig(DATA_DIR);
    for (const id of ['midtown-office', 'chancery-house', 'secure-tower', 'mixed-use-high-rise']) {
      for (const dispatcherProfileId of ['collective', 'eta']) {
        const run = {
          buildingId: id,
          dispatcherProfileId,
          demandTemplateId: 'office-day',
          arrivalRatePctPop5min: null,
          durationS: 36_000,
          windowStartS: 0,
          seed: '20260804',
        };
        const config = configFor(run as never, {
          buildingsById: config0.buildingsById,
          dispatcherProfilesById: config0.dispatcherProfilesById,
          trafficProfiles: config0.trafficProfiles,
          elevatorSpecs: config0.elevatorSpecs,
          dispatcherProfiles: config0.dispatcherProfiles,
        });
        if (typeof config === 'string') {
          console.log(id, dispatcherProfileId, 'DOES NOT RESOLVE:', config);
          continue;
        }
        const t0 = Date.now();
        try {
          const m = metricsOf(runSimulation(config).summary);
          console.log(
            id,
            dispatcherProfileId,
            `${String(Date.now() - t0)} ms`,
            'awtIsValid=',
            m.awtIsValid,
            'awt=',
            m.awtS.toFixed(2),
          );
        } catch (error) {
          console.log(id, dispatcherProfileId, 'THREW:', (error as Error).message);
        }
      }
    }
    expect(true).toBe(true);
  }, 900_000);
});
