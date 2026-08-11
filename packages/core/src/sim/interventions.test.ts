/**
 * The run record's interventions — Everyday Mode contract § 1.4, held by runs.
 *
 * `run = { seed, config, interventions: [{ atS, change }] }`, re-simulated whole from t = 0
 * whenever the log grows. Four properties carry the mechanism, and each is asserted here on the
 * shipped path (`runSimulation`, real `data/`) rather than on a fixture policy:
 *
 * 1. **The prefix is bit-identical.** An intervention at `atS` schedules one kernel event at
 *    `atS` and changes what stage 7 is told from that instant on; nothing earlier can observe
 *    it, so every leg boarded before `atS` is the leg it was. This is what lets the viewer
 *    resume playback at the same playhead without the picture jumping.
 * 2. **The seam is not inert.** The suffix must *differ* — a `park-cars-lobby` log entry on a
 *    sparse building must move legs, or the control is § D177's inert slider with a stage
 *    button's label on it.
 * 3. **Absent and `[]` are the same run, byte for byte** — the `#weights` identity pattern, at
 *    the config surface.
 * 4. **The same record replays exactly** (invariant 5): one seed, one config, one ordered log,
 *    one day.
 *
 * Garden Apartments because stage 7 dominates sparse traffic — `dispatch/lifecycle.ts`: *"a car
 * parked at the wrong end of a residential tower adds its whole travel time to every call"* —
 * so it is the building where lobby parking has legs to move, and the fixture the phase 5
 * pre-positioning measurements were taken on. `collective` because it is the shipped default
 * (§ D134) and authors no `idle` section at all: the override replaces `stay`, which is the
 * exact state the player's button exists for.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';

import { fingerprint, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { RunInterventionConfig, SimulationConfig, SimulationResult } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function run(
  buildingId: string,
  profileId: string,
  seed: number,
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error(`no profile "${profileId}"`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    onTimeout: 'report',
    ...overrides,
  };
}

/**
 * The legs, projected to what an intervention may and may not move.
 *
 * `[passengerId, carId, boardedAt]` — the same projection `scope/scope.test.ts` compares runs on
 * (§ D177: legs, never a window statistic), and deliberately **without** `alightedAt`: a rider
 * who boarded before the intervention is delivered by a car whose *later* pickups the override
 * may reroute, so their drop-off instant belongs to the suffix even though their boarding does
 * not.
 */
function legsOf(result: SimulationResult): readonly (readonly [string, string, number])[] {
  return result.record.passengers.map(
    (leg) => [leg.id, leg.carId ?? '', leg.boardedAt ?? -1] as const,
  );
}

const PARK: RunInterventionConfig['change'] = { kind: 'park-cars-lobby' };

describe('an intervention changes the future and only the future', () => {
  // 600 s: measured on this building and seed, five legs board before it (the first at
  // 343.2 s) and twenty-four after, so both the identity and the divergence assert over
  // something rather than over an empty set.
  const AT_S = 600;
  const SEED = 20260726;

  it('keeps every leg boarded before atS byte-identical, and moves the run after it', () => {
    const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
    const intervened = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        interventions: [{ atS: AT_S, change: PARK }],
      }),
    );

    // The trace is the trace: an intervention is a change of mind, never a change of crowd.
    expect(intervened.record.passengers.length).toBe(baseline.record.passengers.length);

    const prefix = (result: SimulationResult): string =>
      JSON.stringify(
        legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S),
      );
    // The prefix must be non-empty, or the identity below is vacuous — a run whose first
    // boarding falls after atS would pass on nothing.
    expect(legsOf(baseline).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S).length)
      .toBeGreaterThan(0);
    expect(prefix(intervened)).toBe(prefix(baseline));

    // And the whole projection must differ — the seam is live, not decorative.
    expect(JSON.stringify(legsOf(intervened))).not.toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);

  it('replays the same record to the same fingerprint (invariant 5)', () => {
    const record = (): SimulationConfig =>
      run('garden-apartments', 'collective', SEED, {
        interventions: [{ atS: AT_S, change: PARK }],
      });
    expect(fingerprint(runSimulation(record()))).toBe(fingerprint(runSimulation(record())));
  }, 60_000);
});

describe('a run that asked for nothing is the run it was', () => {
  it('is byte-identical with the field absent and with interventions: []', () => {
    // The structural identity the config docstring promises: an empty log schedules nothing,
    // builds no override, and every RepositionContext is the object it always was.
    expect(
      fingerprint(runSimulation(run('garden-apartments', 'collective', 20260810, { interventions: [] }))),
    ).toBe(fingerprint(runSimulation(run('garden-apartments', 'collective', 20260810))));
  }, 60_000);
});

describe('an intervention past the deadline is refused loudly', () => {
  it('warns, schedules nothing, and leaves the legs untouched — serviceEvents’ own behaviour', () => {
    const baseline = runSimulation(run('garden-apartments', 'collective', 20260726));
    const truncated = runSimulation(
      run('garden-apartments', 'collective', 20260726, {
        // Far past demand horizon + drain grace. An event on the queue keeps the run alive to
        // its time, so honouring this entry would extend the run to do nothing.
        interventions: [{ atS: 1_000_000, change: PARK }],
      }),
    );
    expect(truncated.warnings.some((line) => line.includes('interventions[0]'))).toBe(true);
    expect(truncated.warnings.some((line) => line.includes('drain deadline'))).toBe(true);
    // The refusal is the whole effect: the run itself is the baseline run, leg for leg.
    expect(JSON.stringify(legsOf(truncated))).toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);
});
