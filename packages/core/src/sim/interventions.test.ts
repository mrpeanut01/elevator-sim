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

import type { DispatcherProfile, LoadedConfig } from '../config/types.js';
import { createPolicyFor, type DispatchPolicy } from '../dispatch/index.js';

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

/*
 * The fourth kind — GitHub issue #352 — is the park arm with the opposite verb, and it is asserted
 * on the same four properties. `garden-apartments` again: `collective` authors no `idle` section,
 * so the override replaces `stay` with `zone-center` and every idle car heads for the middle of
 * its shaft instead of standing where it last stopped.
 */
describe('spread-cars changes the future and only the future', () => {
  const SPREAD: RunInterventionConfig['change'] = { kind: 'spread-cars' };
  const AT_S = 600;
  const SEED = 20260726;

  it('keeps every leg boarded before atS byte-identical, and moves the run after it', () => {
    const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
    const spread = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        interventions: [{ atS: AT_S, change: SPREAD }],
      }),
    );
    expect(spread.record.passengers.length).toBe(baseline.record.passengers.length);
    const prefix = (result: SimulationResult): string =>
      JSON.stringify(legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S));
    expect(legsOf(baseline).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S).length)
      .toBeGreaterThan(0);
    expect(prefix(spread)).toBe(prefix(baseline));
    expect(JSON.stringify(legsOf(spread))).not.toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);

  it('is the opposite verb: a spread day and a parked day move different legs', () => {
    const parked = runSimulation(
      run('garden-apartments', 'collective', SEED, { interventions: [{ atS: AT_S, change: PARK }] }),
    );
    const spread = runSimulation(
      run('garden-apartments', 'collective', SEED, { interventions: [{ atS: AT_S, change: SPREAD }] }),
    );
    expect(JSON.stringify(legsOf(spread))).not.toBe(JSON.stringify(legsOf(parked)));
  }, 60_000);

  it('the later of the two parking kinds is the one in force — one control, two settings', () => {
    // Park at 600 s then spread at 900 s must equal spread at 900 s alone from 900 s on; and the
    // whole run must differ from the park alone, or the second press was inert.
    const parkThenSpread = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        interventions: [
          { atS: AT_S, change: PARK },
          { atS: 900, change: SPREAD },
        ],
      }),
    );
    const parked = runSimulation(
      run('garden-apartments', 'collective', SEED, { interventions: [{ atS: AT_S, change: PARK }] }),
    );
    expect(JSON.stringify(legsOf(parkThenSpread))).not.toBe(JSON.stringify(legsOf(parked)));
    const prefix = (result: SimulationResult): string =>
      JSON.stringify(legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < 900));
    expect(prefix(parkThenSpread)).toBe(prefix(parked));
  }, 60_000);

  it('replays the same record to the same fingerprint (invariant 5)', () => {
    const record = (): SimulationConfig =>
      run('garden-apartments', 'collective', SEED, { interventions: [{ atS: AT_S, change: SPREAD }] });
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

describe('the switch pins its vector where a chooser is live', () => {
  const AT_S = 600;
  const SEED = 20260726;

  const nearestCar = (): DispatcherProfile => {
    const profile = config.dispatcherProfilesById.get('nearest-car');
    if (profile === undefined) throw new Error('no profile "nearest-car"');
    return profile;
  };
  const SWITCH = (): RunInterventionConfig => ({
    atS: AT_S,
    change: { kind: 'switch-dispatcher', profile: nearestCar() },
  });

  /**
   * **The pin's load-bearing case — review finding 1.** Every shipped profile runs
   * `selection.policy: 'off'`, under which `#refreshWeightSet` returns before either chooser
   * branch and an adopted vector survives with or without the pin — so a switch test on
   * `collective` alone cannot tell the pin from dead code (mutation-verified: deleting it left
   * such tests green). A **rules** profile is the exact shape every Everyday player with a rule
   * row produces (`dev/state.ts#shiftRunConfigOf` through `profileWithRules`), and on it the
   * rules branch re-imposes `arm?.weights ?? config.weights` on *every* decision — so without
   * the pin the switch is fully inert and this test's divergence assertion goes red. The pin is
   * what makes the player's hand outrank the chooser, and this is the run that says so.
   */
  it('a rules-driven profile still hands the day over — the chooser stands down (§ 7.6)', () => {
    const collective = config.dispatcherProfilesById.get('collective');
    if (collective === undefined) throw new Error('no profile "collective"');
    const withRules: DispatcherProfile = {
      ...collective,
      id: 'collective-with-rules',
      rules: { rows: [{ when: 'call-waited', whenValue: 60, then: 'jump-queue' }] },
      selection: { ...(collective.selection ?? {}), policy: 'rules' },
    };
    const baseline = runSimulation(
      run('garden-apartments', 'collective', SEED, { dispatcherProfile: withRules }),
    );
    const switched = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        dispatcherProfile: withRules,
        interventions: [SWITCH()],
      }),
    );
    const prefix = (result: SimulationResult): string =>
      JSON.stringify(
        legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S),
      );
    expect(prefix(switched)).toBe(prefix(baseline));
    expect(JSON.stringify(legsOf(switched))).not.toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);

  /**
   * The contract-net aggregation delegates `adoptWeights` whole to the engine underneath
   * (`policies/auction.ts`): the bids are priced by the inner weighted-cost policy, so pinning
   * its vector pins every bid. A switch that moved nothing on an auction profile would mean the
   * delegation is missing and the aggregation kept scoring with the opening weights.
   */
  it('an auction profile hands the day over through the delegated engine', () => {
    const baseline = runSimulation(run('garden-apartments', 'auction', SEED));
    const switched = runSimulation(
      run('garden-apartments', 'auction', SEED, { interventions: [SWITCH()] }),
    );
    const prefix = (result: SimulationResult): string =>
      JSON.stringify(
        legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S),
      );
    expect(prefix(switched)).toBe(prefix(baseline));
    expect(JSON.stringify(legsOf(switched))).not.toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);

  /**
   * A policy supplied through `config.createPolicy` that predates the optional interface member:
   * the switch is refused per bank rather than silently not happening — warned by name, and the
   * run is leg-for-leg the run without the entry, which is what "the control moved nothing, and
   * the record says so" has to mean.
   */
  it('warns and stays inert when the supplied policy implements no adoptWeights', () => {
    const withoutAdoptWeights = (policy: DispatchPolicy): DispatchPolicy => ({
      id: policy.id,
      name: policy.name,
      engine: policy.engine,
      config: policy.config,
      parameters: policy.parameters,
      get calls() {
        return policy.calls;
      },
      register: (call, at, context) => policy.register(call, at, context),
      dispatch: (callId, cars, at, context) => policy.dispatch(callId, cars, at, context),
      reconsider: (callId, cars, at, context) => policy.reconsider(callId, cars, at, context),
      answer: (car, call, at, cars) => policy.answer(car, call, at, cars),
      reposition: (car, at, context) => policy.reposition(car, at, context),
      score: (call, cars, at, context) => policy.score(call, cars, at, context),
      eligible: (call, cars, at, context) => policy.eligible(call, cars, at, context),
      lifecycle: (callId) => policy.lifecycle(callId),
      complete: (callId, at) => policy.complete(callId, at),
      cancel: (callId) => policy.cancel(callId),
      reset: () => policy.reset(),
    });
    const overrides: Partial<SimulationConfig> = {
      createPolicy: (profile, options) => withoutAdoptWeights(createPolicyFor(profile, options)),
    };
    const baseline = runSimulation(run('garden-apartments', 'collective', SEED, overrides));
    const switched = runSimulation(
      run('garden-apartments', 'collective', SEED, { ...overrides, interventions: [SWITCH()] }),
    );
    expect(switched.warnings.some((line) => line.includes('implements no adoptWeights'))).toBe(
      true,
    );
    expect(JSON.stringify(legsOf(switched))).toBe(JSON.stringify(legsOf(baseline)));
  }, 60_000);

  /**
   * A switched profile authoring the other passenger model is disclaimed by name rather than
   * half-honoured: only the vector switches (`dispatch/selector.ts` § *Why only the weights
   * switch*), and the sentence saying so is the difference between a scoped mechanism and a
   * silent one.
   */
  it('discloses that a model-changing profile switches its weights and not its model', () => {
    const panel = config.dispatcherProfilesById.get('destination-panel');
    if (panel === undefined) throw new Error('no profile "destination-panel"');
    const result = runSimulation(
      run('garden-apartments', 'collective', SEED, {
        interventions: [{ atS: AT_S, change: { kind: 'switch-dispatcher', profile: panel } }],
      }),
    );
    // Disclaimers are folded into `warnings`, first — `#finish`'s own ordering.
    expect(
      result.warnings.some(
        (line) =>
          line.includes('destination-dispatch') && line.includes('Only the weight vector'),
      ),
    ).toBe(true);
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

  it('throws on an effect naming a car this run did not build — scheduling time is its config time', () => {
    expect(() =>
      runSimulation(
        run('garden-apartments', 'collective', SEED, {
          interventions: [
            {
              atS: AT_S,
              change: {
                kind: 'answer-incident',
                option: 'a corrupt entry',
                serviceEvents: [{ atS: 700, bankId: 'main', carId: 'Z', mode: 'out-of-service' }],
              },
            },
          ],
        }),
      ),
    ).toThrow(/car "Z" in bank "main", which this run did not build/u);
  }, 60_000);

  it('throws on an effect whose mode is outside the declared vocabulary — never applied as a guess', () => {
    // `Car.setMode` stores whatever string it is handed; an out-of-vocabulary mode reaching it
    // would have every later `acceptsHallCalls` answering for a mode nobody defined — § 1.5's
    // approximate replay. Stored records carry this field through JSON, so it is checked here
    // exactly as the change kind is.
    const change = {
      kind: 'answer-incident',
      option: 'a corrupt entry',
      serviceEvents: [{ atS: 700, bankId: 'main', carId: 'B', mode: 'toast' }],
    } as unknown as RunInterventionConfig['change'];
    expect(() =>
      runSimulation(
        run('garden-apartments', 'collective', SEED, { interventions: [{ atS: AT_S, change }] }),
      ),
    ).toThrow(/mode "toast".*in-service, independent, fire-recall, out-of-service/su);
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
    ).toThrow(/reverse-gravity.*park-cars-lobby, switch-dispatcher, answer-incident, spread-cars/su);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The two bought kinds — GitHub issue #370
 * -------------------------------------------------------------------------- */

/**
 * `equipment-change` and `building-change` — the changes the player *buys* mid-run.
 *
 * The same four properties every other kind is held to, and **a fifth that is theirs alone**: the
 * crowd is held across the press. `docs/38` § 2.3's sentence is *"the crowd is the same crowd
 * either side of the press"*, and a fabric change is the one kind that could break it, because
 * fabric is an input to a building and a naive implementation would rebuild the building and
 * re-draw the trace with it. It cannot happen here by construction — the effects ride the service
 * schedule and the trace was drawn from the seed before the first event fired — and `crowdOf`
 * asserts it rather than trusting the construction, because *"a refusal is pinned by a run, never
 * by another sentence"* (§ D227) and so is a promise.
 *
 * The effects are **range** events on both arms, because a rezone is what the shipped schedule
 * prices at both tiers — `zone-the-tower` in `equipment` and `rezone-bank` in `building` — and
 * because narrowing a two-car bank's range on a residential tower is a suffix that cannot fail to
 * move. `garden-apartments`/`collective` for the reason the file's header gives.
 */
describe('the bought kinds change the future, only the future, and never the crowd', () => {
  const AT_S = 600;
  const SEED = 20260726;

  /**
   * The crowd, as the trace drew it — every journey's first leg, projected onto the five facts
   * that come from the demand streams and from nothing else: who, when, from where, to where, and
   * how heavy. A dispatcher moves none of these and neither may a fabric change; a run that
   * re-drew its trace would move all of them.
   */
  const crowdOf = (result: SimulationResult): string =>
    JSON.stringify(
      result.record.passengers
        .filter((leg) => leg.legIndex === 0)
        .map((leg) => [
          leg.journeyId,
          leg.journeyStartedAt,
          leg.originFloorId,
          leg.finalDestinationFloorId,
          leg.massKg,
        ])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    );

  /** A rezone at 700 s: the bank stops serving its top two floors for the rest of the day. */
  const rezone = { atS: 700, bankId: 'main', servesFloors: ['G', '2', '3', '4'] } as const;

  const bought = (kind: 'equipment-change' | 'building-change'): RunInterventionConfig => ({
    atS: AT_S,
    change: {
      kind,
      changeId: kind === 'equipment-change' ? 'zone-the-tower' : 'rezone-bank',
      name: kind === 'equipment-change' ? 'Zone the tower' : 'Re-zone a bank',
      serviceEvents: [rezone],
    },
  });

  for (const kind of ['equipment-change', 'building-change'] as const) {
    it(`${kind} keeps every leg boarded before atS byte-identical, and moves the run after it`, () => {
      const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
      const changed = runSimulation(
        run('garden-apartments', 'collective', SEED, { interventions: [bought(kind)] }),
      );

      const prefix = (result: SimulationResult): string =>
        JSON.stringify(
          legsOf(result).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S),
        );
      // Non-vacuity: there are legs on both sides of the press, so neither half is an empty set
      // agreeing with an empty set.
      expect(
        legsOf(baseline).filter(([, , boardedAt]) => boardedAt >= 0 && boardedAt < AT_S).length,
      ).toBeGreaterThan(0);
      expect(prefix(changed)).toBe(prefix(baseline));
      expect(JSON.stringify(legsOf(changed))).not.toBe(JSON.stringify(legsOf(baseline)));
    }, 60_000);

    it(`${kind} holds the crowd across the press — the trace is the seed's, not the fabric's`, () => {
      const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
      const changed = runSimulation(
        run('garden-apartments', 'collective', SEED, { interventions: [bought(kind)] }),
      );
      expect(crowdOf(baseline).length).toBeGreaterThan(2);
      expect(crowdOf(changed)).toBe(crowdOf(baseline));
      // …and the run really did change, so the equality above is a held crowd rather than an
      // intervention that did nothing at all.
      expect(JSON.stringify(legsOf(changed))).not.toBe(JSON.stringify(legsOf(baseline)));
    }, 60_000);

    it(`${kind} replays the same record to the same fingerprint (invariant 5)`, () => {
      const record = (): SimulationConfig =>
        run('garden-apartments', 'collective', SEED, { interventions: [bought(kind)] });
      expect(fingerprint(runSimulation(record()))).toBe(fingerprint(runSimulation(record())));
    }, 60_000);

    it(`${kind} with no effects is the run it was — the stamp is the point`, () => {
      // The purchase whose whole content is its price: on the record so the day's spend can be
      // re-derived from it, changing nothing physical. `answer-incident`'s reassurance arm, one
      // substrate over.
      expect(
        fingerprint(
          runSimulation(
            run('garden-apartments', 'collective', 20260810, {
              interventions: [
                {
                  atS: AT_S,
                  change: { kind, changeId: 'door-dwell', name: 'Re-set the doors', serviceEvents: [] },
                },
              ],
            }),
          ),
        ),
      ).toBe(fingerprint(runSimulation(run('garden-apartments', 'collective', 20260810))));
    }, 60_000);

    it(`${kind} refuses an effect scheduled before its own press, and names the kind`, () => {
      const baseline = runSimulation(run('garden-apartments', 'collective', SEED));
      const rewriting = runSimulation(
        run('garden-apartments', 'collective', SEED, {
          interventions: [
            {
              atS: AT_S,
              change: {
                kind,
                changeId: 'rezone-bank',
                name: 'a defective entry',
                serviceEvents: [{ atS: 100, bankId: 'main', servesFloors: ['G', '2'] }],
              },
            },
          ],
        }),
      );
      const noun = kind === 'equipment-change' ? 'equipment change' : 'building change';
      // The kind is named. The warning that used to stand here said *incident answer* for every
      // refused effect whatever bought it, which would send a reader hunting an incident that
      // never happened.
      expect(rewriting.warnings.some((line) => line.includes(`buys ${noun} at 600 s`))).toBe(true);
      expect(rewriting.warnings.some((line) => line.includes('before the press itself'))).toBe(true);
      // The refusal is the whole effect: leg for leg, this is the baseline run.
      expect(JSON.stringify(legsOf(rewriting))).toBe(JSON.stringify(legsOf(baseline)));
    }, 60_000);

    it(`${kind} throws on an effect naming a bank this run did not build`, () => {
      expect(() =>
        runSimulation(
          run('garden-apartments', 'collective', SEED, {
            interventions: [
              {
                atS: AT_S,
                change: {
                  kind,
                  changeId: 'rezone-bank',
                  name: 'a corrupt entry',
                  serviceEvents: [{ atS: 700, bankId: 'sky', servesFloors: ['G'] }],
                },
              },
            ],
          }),
        ),
      ).toThrow(/bank "sky", which this run did not build/u);
    }, 60_000);

    it(`${kind} throws on a derate that is not a positive load — the third effect shape, checked`, () => {
      // The derate arm of the vocabulary, reached through a bought change rather than through an
      // answer, so the generalisation is exercised on all three effect shapes rather than on the
      // one the tests above happen to use.
      const change = {
        kind,
        changeId: 'larger-cars',
        name: 'Fit larger cars',
        serviceEvents: [{ atS: 700, bankId: 'main', carId: 'B', ratedLoadLb: 0, ratedLoadKg: 0 }],
      } as unknown as RunInterventionConfig['change'];
      expect(() =>
        runSimulation(
          run('garden-apartments', 'collective', SEED, { interventions: [{ atS: AT_S, change }] }),
        ),
      ).toThrow(/at 0 kg, which is not a positive load/u);
    }, 60_000);
  }

  it('a bought change never reaches the intervention queue — its effects ride the service schedule', () => {
    /*
     * The negative control for `#onIntervention`'s new guard. A kind that carries effects is
     * skipped by `#scheduleInterventions`, so the parking walk below it can never see one; the
     * guard exists because the fall-through would otherwise have parked the fleet and called it a
     * rezone. Asserted by the *absence* of a park: a run whose only entry is a bought change with
     * no effects is byte-identical to one with no log at all, and a stray park walk would break
     * that on a building whose profile authors no idle stage.
     */
    expect(
      fingerprint(
        runSimulation(
          run('garden-apartments', 'collective', 20260811, {
            interventions: [
              {
                atS: 600,
                change: {
                  kind: 'building-change',
                  changeId: 'rezone-bank',
                  name: 'x',
                  serviceEvents: [],
                },
              },
            ],
          }),
        ),
      ),
    ).toBe(fingerprint(runSimulation(run('garden-apartments', 'collective', 20260811))));
  }, 60_000);
});
