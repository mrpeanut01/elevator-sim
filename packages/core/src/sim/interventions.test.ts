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
 *
 * The same four properties are asserted per change kind — `park-cars-lobby`, then
 * `switch-dispatcher` (§ 20.12's check verbatim: switching at the stamped instant leaves every
 * figure before it identical and changes the ones after), then `answer-incident` (whose effects
 * ride the service schedule, and whose one extra refusal — an effect before its own answer — is
 * the § 1.4 prefix defended against the record itself). An unknown kind is refused with a throw,
 * which is the promise `packages/viz`'s stored-record readers quote.
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
    (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1] as const,
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

/* -------------------------------------------------------------------------- *
 * switch-dispatcher — the second arm (gameplay § 7.6, § 20.12)
 * -------------------------------------------------------------------------- */

describe('switch-dispatcher changes the future and only the future', () => {
  // The same measured instant the park tests stand on: on this building and seed, five legs
  // board before 600 s and twenty-four after, so both halves assert over something.
  const AT_S = 600;
  const SEED = 20260726;

  /**
   * The moved-control arm (§ D177, § 20.12's own check): switching at `atS` leaves every leg
   * boarded before it byte-identical and changes the legs after it. `collective` hands the rest
   * of the day to `nearest-car` — the weakest shipped dispatcher, chosen *because* its vector is
   * the furthest from collective's, so a suffix that failed to move would mean the seam is inert
   * rather than that the two agree.
   */
  it('keeps every leg boarded before atS byte-identical, and moves the run after it', () => {
    const nearestCar = config.dispatcherProfilesById.get('nearest-car');
    if (nearestCar === undefined) throw new Error('no profile "nearest-car"');
    const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
    const switched = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        interventions: [{ atS: AT_S, change: { kind: 'switch-dispatcher', profile: nearestCar } }],
      }),
    );

    // The trace is the trace: a change of driver is a change of mind, never a change of crowd.
    expect(switched.record.passengers.length).toBe(baseline.record.passengers.length);

    const prefix = (result: SimulationResult): string =>
      JSON.stringify(
        legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S),
      );
    expect(
      legsOf(baseline).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S).length,
    ).toBeGreaterThan(0);
    expect(prefix(switched)).toBe(prefix(baseline));

    // Assignment obeys the new vector from atS on: the whole projection must differ.
    expect(JSON.stringify(legsOf(switched))).not.toBe(JSON.stringify(legsOf(baseline)));
    // The record still names the profile the run *started* under; the log is the handover's account.
    expect(switched.record.dispatcherProfileId).toBe('collective');
  }, 60_000);

  it('replays the same record to the same fingerprint (invariant 5)', () => {
    const record = (): SimulationConfig => {
      const nearestCar = config.dispatcherProfilesById.get('nearest-car');
      if (nearestCar === undefined) throw new Error('no profile "nearest-car"');
      return run('garden-apartments', 'collective', SEED, {
        interventions: [{ atS: AT_S, change: { kind: 'switch-dispatcher', profile: nearestCar } }],
      });
    };
    expect(fingerprint(runSimulation(record()))).toBe(fingerprint(runSimulation(record())));
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * answer-incident — the third arm (gameplay § 7.5, § 20.16), on the same log
 * -------------------------------------------------------------------------- */

describe('answer-incident changes the future and only the future', () => {
  const AT_S = 600;
  const SEED = 20260726;
  /**
   * An answer at 600 s whose effect takes car B out at 700 s and returns it at 1200 s — the
   * two-event window `shift/incidents.ts` has always spelled, riding the intervention log and
   * scheduling through the ordinary `serviceChange` path. On a two-car building, half the fleet
   * leaving is a suffix that cannot fail to move.
   */
  const ANSWER: RunInterventionConfig = {
    atS: AT_S,
    change: {
      kind: 'answer-incident',
      option: 'take car B out for the fitter, back within the hour',
      serviceEvents: [
        { atS: 700, bankId: 'main', carId: 'B', mode: 'out-of-service' },
        { atS: 1200, bankId: 'main', carId: 'B', mode: 'in-service' },
      ],
    },
  };

  it('keeps every leg boarded before atS byte-identical, and moves the run after it', () => {
    const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
    const answered = runSimulation(
      run('garden-apartments', 'collective', SEED, { interventions: [ANSWER] }),
    );

    expect(answered.record.passengers.length).toBe(baseline.record.passengers.length);

    const prefix = (result: SimulationResult): string =>
      JSON.stringify(
        legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S),
      );
    expect(
      legsOf(baseline).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S).length,
    ).toBeGreaterThan(0);
    expect(prefix(answered)).toBe(prefix(baseline));
    expect(JSON.stringify(legsOf(answered))).not.toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);

  it('replays the same record to the same fingerprint (invariant 5)', () => {
    const record = (): SimulationConfig =>
      run('garden-apartments', 'collective', SEED, { interventions: [ANSWER] });
    expect(fingerprint(runSimulation(record()))).toBe(fingerprint(runSimulation(record())));
  }, 60_000);

  it('an answer with no service effects is the run it was — the stamp is the point', () => {
    // The reassurance option: on the record for the report's clock, changing nothing physical.
    expect(
      fingerprint(
        runSimulation(
          run('garden-apartments', 'collective', 20260810, {
            interventions: [
              { atS: AT_S, change: { kind: 'answer-incident', option: 'wait it out', serviceEvents: [] } },
            ],
          }),
        ),
      ),
    ).toBe(fingerprint(runSimulation(run('garden-apartments', 'collective', 20260810))));
  }, 60_000);

  it('refuses an effect scheduled before its own answer — the past is not reschedulable', () => {
    const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
    const rewriting = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        interventions: [
          {
            atS: AT_S,
            change: {
              kind: 'answer-incident',
              option: 'a defective entry',
              // Before the answer itself: honouring it would change legs the player already
              // watched, which is contract § 1.4's bit-identical prefix broken by the record.
              serviceEvents: [{ atS: 100, bankId: 'main', carId: 'B', mode: 'out-of-service' }],
            },
          },
        ],
      }),
    );
    expect(rewriting.warnings.some((line) => line.includes('before the answer itself'))).toBe(true);
    // The refusal is the whole effect: leg for leg, this is the baseline run.
    expect(JSON.stringify(legsOf(rewriting))).toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);
});

describe('an unknown change kind is refused before any event fires', () => {
  it('throws naming the kind and the declared vocabulary — never applies a guess', () => {
    const change = { kind: 'reverse-gravity' } as unknown as RunInterventionConfig['change'];
    expect(() =>
      runSimulation(
        run('garden-apartments', 'collective', 20260726, {
          interventions: [{ atS: 600, change }],
        }),
      ),
    ).toThrow(/reverse-gravity.*park-cars-lobby, switch-dispatcher, answer-incident/su);
  }, 60_000);
});
