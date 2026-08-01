/**
 * **A crowded lobby loads more slowly than an empty one, and the run says so.** docs/14 § 3.2.
 *
 * Until this term existed, a stop's length depended on how many people **boarded** and on nothing
 * else. Forty people standing in a lobby loaded at the same seconds-per-passenger as four, which
 * is not how a lobby works and is why the model's failure mode under up-peak was too graceful:
 * queues grew linearly where a real one goes non-linear.
 *
 * What is asserted here, in order:
 *
 * 1. **Criterion 1** — with the term absent, the whole `SimulationResult` is unchanged, and with
 *    it declared *inert* (`maxFactor: 1`, `factorPerPerson: 0`) it is unchanged again. The second
 *    is the stronger claim: it says the wiring is real but neutral, which a `?? default` would
 *    fail and an unread field would pass.
 * 2. **Criterion 2** — each of the three knobs moves the run **on the legs**, separately. A term
 *    whose ceiling did nothing, or whose threshold did nothing, would be three-quarters of a
 *    control.
 * 3. **The loop is a loop.** The occupancy the term reads is the *whole landing*, not the
 *    boarding cohort, so a car that leaves people behind leaves a crowd that slows the next car.
 *    That is the mechanism, and it is what makes this different from raising `passengerTransferS`.
 */

import { describe, expect, it } from 'vitest';

import type { DoorCrowdingConfig } from '../physics/doors/index.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

const SEED = 20_260_731;

/** A lobby genuinely under strain, or the term has nothing to read. */
const PRESSED = { arrivalRatePctPop5min: 12 } as const;

async function run(lobbyCrowding?: DoorCrowdingConfig): Promise<SimulationResult> {
  const config = await load();
  const building = config.buildingsById.get('midtown-office');
  const dispatcherProfile = config.dispatcherProfilesById.get('eta');
  if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    demand: PRESSED,
    reportWindow: 'full-run',
    onTimeout: 'report',
    ...(lobbyCrowding === undefined ? {} : { lobbyCrowding }),
  });
}

/**
 * The legs themselves: who boarded which car, when they arrived and when they got in. Not a
 * window statistic — two configurations can agree on a mean and disagree about every passenger.
 */
const legsOf = (result: SimulationResult): string =>
  result.record.passengers
    .map(
      (leg) =>
        `${leg.passengerId}:${leg.carId ?? '-'}@${(leg.boardedAt ?? -1).toFixed(3)}/${(leg.alightedAt ?? -1).toFixed(3)}`,
    )
    .join('|');

describe('lobby crowding reaches a shipped run', () => {
  it('changes nothing at all when it is absent', async () => {
    expect(JSON.stringify(await run())).toBe(JSON.stringify(await run(undefined)));
  }, 300_000);

  /**
   * **Declared and inert is not the same as absent, and it must produce the same run.**
   *
   * This is the assertion a `?? default` cannot pass and an unread field passes for the wrong
   * reason. Both arms below reach `resolveDoorConfig`, build a `DoorConfig` that carries the
   * term, and evaluate `crowdingFactorFor` at every stop — and the factor is 1 every time.
   */
  it('is inert when declared with a ceiling of 1 or a gain of 0', async () => {
    const control = legsOf(await run());
    expect(
      legsOf(await run({ thresholdPersons: 0, factorPerPerson: 0.05, maxFactor: 1 })),
    ).toBe(control);
    expect(
      legsOf(await run({ thresholdPersons: 0, factorPerPerson: 0, maxFactor: 3 })),
    ).toBe(control);
  }, 300_000);

  /* ---- criterion 2: three knobs, three separate proofs, on the legs ---- */

  it('slows boarding when the gain rises', async () => {
    const control = legsOf(await run());
    const crowded = legsOf(await run({ thresholdPersons: 4, factorPerPerson: 0.08, maxFactor: 3 }));
    expect(crowded).not.toBe(control);
  }, 300_000);

  it('slows boarding less when the threshold rises', async () => {
    const low = legsOf(await run({ thresholdPersons: 2, factorPerPerson: 0.08, maxFactor: 3 }));
    const high = legsOf(await run({ thresholdPersons: 25, factorPerPerson: 0.08, maxFactor: 3 }));
    expect(low).not.toBe(high);
  }, 300_000);

  it('slows boarding less when the ceiling falls', async () => {
    const tall = legsOf(await run({ thresholdPersons: 2, factorPerPerson: 0.08, maxFactor: 3 }));
    const short = legsOf(await run({ thresholdPersons: 2, factorPerPerson: 0.08, maxFactor: 1.2 }));
    expect(tall).not.toBe(short);
  }, 300_000);

  /* ---- the direction of the effect, which a "did it change?" test cannot see ---- */

  /**
   * A term that moved the run in the *wrong* direction would satisfy every assertion above.
   * Crowding is friction: at a fixed crowd it can only ever make a stop longer, so the fleet
   * spends more time at landings and the average wait cannot improve.
   */
  it('makes waiting worse, not better — it is friction', async () => {
    const control = await run();
    const crowded = await run({ thresholdPersons: 4, factorPerPerson: 0.08, maxFactor: 3 });
    expect(crowded.summary.waiting.meanS).toBeGreaterThan(control.summary.waiting.meanS);
  }, 300_000);

  /**
   * **The occupancy read is the landing, not the boarding cohort — proved by a threshold no
   * cohort can reach.**
   *
   * This is what makes the term a feedback loop rather than a second `passengerTransferS`: a car
   * that fills up and leaves twenty people behind leaves twenty people *in the way* of the next
   * car's boarders. If the term read `hallQueueLength` — the cohort this car is taking — crowding
   * would be a monotone function of what the car could already carry, and there would be no
   * feedback at all.
   *
   * **The first version of this test could not fail on that.** It compared two *arrival rates*
   * and asserted the crowded-versus-control gap was larger where queues are deeper, which is true
   * of the boarding cohort as well — mutating `lobbyOccupancy` to the cohort left it green. A test
   * written so it cannot fail on the loss it exists to prevent is worse than no test
   * (`DECISIONS.md` § D204).
   *
   * What replaces it is arithmetic rather than correlation. Midtown Office's cars hold **16**
   * persons at a design load of **12**, so a boarding cohort can never exceed 16 and a threshold
   * of **30** is unreachable by any cohort on any stop of any run. Under the cohort reading the
   * factor would therefore be exactly 1 everywhere and the run would be bit-identical to its
   * control. It is not — so the number being read is the landing.
   */
  it('bites at a threshold no boarding cohort can reach', async () => {
    const config = await load();
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('fixtures');
    // Not an assumption: read off the resolved fleet, so a re-specced car fails this rather than
    // silently making the threshold reachable and the proof vacuous.
    const largestCar = Math.max(
      ...building.banks.flatMap((bank) => bank.cars.map((car) => car.capacityPersons)),
    );
    expect(largestCar).toBeLessThan(30);

    const control = legsOf(await run());
    const crowded = legsOf(
      await run({ thresholdPersons: 30, factorPerPerson: 0.05, maxFactor: 3 }),
    );
    expect(crowded).not.toBe(control);
  }, 300_000);

  /**
   * **The loop destabilises a run that was stable — and the detector catches it.**
   *
   * docs/14 § 3.2 predicts this in advance and calls it a *finding, not a bug*: slow boarding
   * lengthens the queue, a longer queue slows boarding, and a configuration that was coping stops
   * coping. Without the term the model's failure mode is too graceful — queues grow linearly
   * where a real lobby goes non-linear.
   *
   * Measured on `midtown-office` under `eta` at seed 20260731 with
   * `{ thresholdPersons: 4, factorPerPerson: 0.08, maxFactor: 3 }`, sweeping the arrival rate in
   * steps of 0.1 % across the band where the building is near its limit: **four of the nine cells
   * in [6.1, 6.9] flip from `stable` to `diverging-queue`**. 6.1 % is the cleanest — the control
   * is comfortably stable with a quotable 55.3 s mean, and the crowded arm diverges and has its
   * mean suppressed.
   *
   * **What is asserted is the verdict, not the mean.** The crowded arm's AWT is refused by the
   * run's own gate, so quoting it would be quoting a number the run says is not quotable — which
   * is the discipline this whole project is built on, applied to its own new feature.
   */
  it('can push a stable configuration into saturation, and the run says so', async () => {
    const config = await load();
    const building = config.buildingsById.get('midtown-office');
    const dispatcherProfile = config.dispatcherProfilesById.get('eta');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
    const at = (lobbyCrowding?: DoorCrowdingConfig): SimulationResult =>
      runSimulation({
        building,
        dispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        demand: { arrivalRatePctPop5min: 6.1 },
        reportWindow: 'full-run',
        onTimeout: 'report',
        ...(lobbyCrowding === undefined ? {} : { lobbyCrowding }),
      });

    const control = at();
    expect(control.summary.saturation.verdict).toBe('stable');
    expect(control.summary.awtIsValid).toBe(true);

    const crowded = at({ thresholdPersons: 4, factorPerPerson: 0.08, maxFactor: 3 });
    expect(crowded.summary.saturation.verdict).toBe('diverging-queue');
    expect(crowded.summary.awtIsValid).toBe(false);
    expect(crowded.summary.awtInvalidGround).toBe('saturated');
  }, 300_000);

  /* ---- invariant 8, and the one configuration that would invert the loop ---- */

  it('refuses a ceiling below 1, which would make a crowd board faster', async () => {
    await expect(
      run({ thresholdPersons: 0, factorPerPerson: 0.1, maxFactor: 0.5 }),
    ).rejects.toThrow(/crowding\.maxFactor/);
  }, 300_000);
});
