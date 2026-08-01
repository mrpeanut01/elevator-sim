/**
 * **Inter-day variability reaches a shipped run, and it stays *inside* the CRN pairing.**
 * Step 4 of the building-behaviour program (docs/14 § 2.3).
 *
 * Two acceptance criteria are answered here, and the second is the one this step was written for.
 *
 * ## Criterion 2 — move the control and require the run to change, on the legs
 *
 * The standing requirement in `docs/05-roadmap.md`. Both knobs are moved separately, and each is
 * required to change the legs on its own: a demand factor with the peak held still, and a peak
 * shift with the factor pinned to exactly 1. A block that moved the run only when both were set
 * would be one control wearing two names.
 *
 * ## Criterion 3 — day variation is inside the CRN pairing, and half the criterion was wrong
 *
 * > A paired comparison under `dayVariation` must show variance no larger than the same comparison
 * > without it. If day variation leaks outside the shared trace, the paired standard error rises
 * > and this fails — which is the whole reason the criterion exists.
 *
 * **This is the easiest way to get the feature wrong, and it fails silently**: every other test
 * still passes while the intervals quietly widen. `CLAUDE.md` § Statistical discipline puts the
 * stake at 5–20× in required run count.
 *
 * The criterion has two halves and **they do not agree with each other**, which measurement found
 * rather than reading did. The second sentence — *a leak makes the paired SE rise* — is met, by a
 * factor of 6.6. The first sentence — *no larger than the same comparison without day variation*
 * — is **not satisfiable by any correct implementation**, because
 *
 *   Var(D | day varies) = E_day[Var(D | day)] + Var_day(E[D | day])
 *
 * and the second term is the demand-level *interaction*: how much the gap between two arms itself
 * moves with the day. Driving it to zero would mean the two arms respond to demand identically —
 * which is exactly the question docs/14 § 2.3 says day variation exists to ask. Measured at six
 * pairs on this tree the ratio `SE(shared day) / SE(no day)` was 1.35, 1.45, 1.63, 1.95, 2.44 and
 * 3.45: above one every time, and largest for the two arms that differ most.
 *
 * This is filed the way `DECISIONS.md` § D203 filed step 2's: the criterion was pre-registered, the
 * run refused half of it, and **the refusal is pinned in the direction it actually holds** rather
 * than absorbed by a tolerance. `docs/14` § 5 is left byte-identical — a criterion is not weakened
 * to make a step pass.
 *
 * So three conditions are measured, over one pair of arms and the same twenty seeds:
 *
 * | condition | what each arm sees | measured |
 * |---|---|---|
 * | **A — no day** | the run every published figure was measured under | SE 0.0740 s |
 * | **B — shared day** | both arms declare the same block, so at one seed they draw one day | SE 0.1803 s |
 * | **C — leaked day** | the arms are handed *different* days at the same seed | SE 1.1854 s |
 *
 * B is the shipped behaviour. **C is the defect the criterion exists to catch**, built rather than
 * imagined: two arms whose days disagree. Without it, B could pass because the feature does
 * nothing at all, and the criterion would be measuring an inert knob. C is also why
 * `runner/crn.ts`'s `traceKeyOf` carries `dayVariation` — the two arms of C have *different trace
 * keys*, so the runner puts them in different cohorts and never pairs them. The key is the
 * mechanism; this file is the measurement that the mechanism is needed.
 *
 * Beneath all three sits the guarantee itself, asserted **exactly** rather than statistically: at
 * every one of the twenty seeds, both arms of condition B report the identical drawn day and the
 * identical structural trace digest.
 *
 * ## Why it drives `runSimulation` rather than `generateTrace`
 *
 * A `dayVariation` that is schema-valid, unit-tested against the generator and consulted by no
 * shipped path would be the twelfth dead seam in this repository and would look exactly like the
 * eleven before it (`docs/05` § *Standing requirement*). Its non-test callers are
 * `sim/simulation.ts`'s `traceConfigFor` — reached here — and
 * `experiments/src/runner/experiment.ts`'s `DEMAND_PARSERS`, which is the JSON door.
 */

import { describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { structuralDigestOf } from '../traffic/identity.test-helper.js';
import type { DayVariationConfig } from '../traffic/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

const SEED = 20_260_731;
const BUILDING_ID = 'midtown-office';

let cached: LoadedConfig | undefined;
const fixtures = async (): Promise<LoadedConfig> => (cached ??= await load());

interface RunOptions {
  readonly seed?: number;
  readonly dispatcherId?: string;
  readonly dayVariation?: DayVariationConfig;
  readonly template?: 'rise-and-fall' | 'constant-iso' | 'lunch-two-way';
}

async function run(options: RunOptions = {}): Promise<SimulationResult> {
  const config = await fixtures();
  const building: ResolvedBuilding | undefined = config.buildingsById.get(BUILDING_ID);
  const dispatcherProfile: DispatcherProfile | undefined = config.dispatcherProfilesById.get(
    options.dispatcherId ?? 'eta',
  );
  if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: options.seed ?? SEED,
    onTimeout: 'report',
    ...(options.template === undefined ? {} : { demandTemplate: options.template }),
    ...(options.dayVariation === undefined
      ? {}
      : { demand: { dayVariation: options.dayVariation } }),
  });
}

/** The legs, exactly as `trafficSeedSeam.test.ts` and `trafficModelSeam.test.ts` compare them. */
const legsOf = (result: SimulationResult): string =>
  result.trace.passengers
    .map((p) => `${p.originFloorId}>${p.finalDestinationFloorId}@${p.arrivalTimeS.toFixed(3)}`)
    .join('|');

/* -------------------------------------------------------------------------- *
 * Criterion 1 — byte-identity when unused
 * -------------------------------------------------------------------------- */

describe('a run that does not ask for a day is the run that predates the feature', () => {
  /**
   * The blocking criterion of docs/14 § 5, at the seam.
   *
   * If this fails, 981 pinned estimates and both identity digests are wrong and nothing else in
   * this file matters.
   */
  it('reports no dayVariation key at all when the block is absent', async () => {
    const result = await run();
    expect(result.trace.dayVariation).toBeUndefined();
    // Absent, not present-and-undefined: `structuralDigestOfResult` hashes a key's presence.
    expect('dayVariation' in result.trace).toBe(false);
  }, 300_000);

  /**
   * **The independence guarantee, measured on a whole trace rather than on a stream.**
   *
   * A degenerate block — factor pinned to 1, no shift — is a day that changes nothing, and it must
   * therefore produce the *same trace* as no block at all. That can only hold if the two draws
   * come off the `dayVariation` stream: taken from `arrivals`, they would displace every arrival
   * instant in the run and this would fail by a mile.
   *
   * Compared on the trace minus its own new key, so the assertion is about the passengers and not
   * about the report of the day.
   */
  it('draws its day from its own stream, so a no-op day is bit-identical', async () => {
    const absent = await run();
    const noop = await run({ dayVariation: { minDemandFactor: 1, maxDemandFactor: 1 } });

    expect(noop.trace.dayVariation).toEqual({ demandFactor: 1, peakShiftS: 0 });
    const { dayVariation: _drawn, ...rest } = noop.trace;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(absent.trace));
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * Criterion 2 — every control moves the run, on the legs
 * -------------------------------------------------------------------------- */

describe('each knob moves the run on its own', () => {
  /**
   * The demand factor, with the peak held exactly where the template puts it.
   *
   * Pinned to a single value (`min === max`) rather than left to a band, so the arm's demand level
   * is arithmetic rather than a draw: 1.6x `midtown-office`'s 12 %/5 min. `expectedPassengers` is
   * the analytic figure the whole plan is built from, so asserting the exact ratio there is a
   * stronger statement than counting the legs — and the legs are compared too, because a factor
   * that reached the plan and not the sampler would pass the first and fail the second.
   */
  it('a demand factor changes how many people arrive, exactly in proportion', async () => {
    const plain = await run();
    const heavy = await run({ dayVariation: { minDemandFactor: 1.6, maxDemandFactor: 1.6 } });

    expect(heavy.trace.expectedPassengers / plain.trace.expectedPassengers).toBeCloseTo(1.6, 12);
    expect(legsOf(heavy)).not.toBe(legsOf(plain));
    expect(heavy.trace.passengerCount).toBeGreaterThan(plain.trace.passengerCount);
  }, 300_000);

  /**
   * The peak shift, with the factor pinned to exactly 1 — so nothing about *how many* people
   * arrive can be doing the work.
   *
   * Two assertions, and they are the two halves of the claim `DayVariationConfig` makes:
   *
   * 1. the legs move, so the control is not inert; and
   * 2. `expectedPassengers` is **exactly** unchanged, because the up-ramp lengthens by precisely as
   *    much as the down-ramp shortens. That is the orthogonality claim, checked as arithmetic
   *    rather than trusted as algebra: this knob moves *when*, the other moves *how many*.
   *
   * The measurement window travels with the peak, which is the third assertion.
   */
  it('a peak shift changes when they arrive and not how many', async () => {
    const plain = await run();
    const shifted = await run({
      dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 200 },
    });

    expect(shifted.trace.dayVariation?.demandFactor).toBe(1);
    expect(shifted.trace.dayVariation?.peakShiftS).not.toBe(0);
    expect(legsOf(shifted)).not.toBe(legsOf(plain));
    expect(shifted.trace.expectedPassengers).toBeCloseTo(plain.trace.expectedPassengers, 9);
    expect(shifted.trace.reportWindowStartS).not.toBe(plain.trace.reportWindowStartS);
    expect(shifted.trace.reportWindowEndS - shifted.trace.reportWindowStartS).toBeCloseTo(
      plain.trace.reportWindowEndS - plain.trace.reportWindowStartS,
      9,
    );
  }, 300_000);

  /**
   * **The proof behind the `traceKeyOf` decision.**
   *
   * `runner/crn.ts` puts `dayVariation` *in* the trace key, unlike `patience`, which draws from a
   * demand-side stream and is deliberately out of it. The justification is that two cells
   * differing only in `dayVariation` see different people — and this is that claim measured, on
   * the structural trace digest, at one fixed seed. If this ever passed, the field would belong
   * out of the key and pairing those cells would be legitimate.
   */
  it('two configurations differing only in the day generate different traces', async () => {
    const monday = await run({ dayVariation: { minDemandFactor: 1.3, maxDemandFactor: 1.3 } });
    const tuesday = await run({ dayVariation: { minDemandFactor: 0.7, maxDemandFactor: 0.7 } });
    expect(structuralDigestOf(monday.trace)).not.toBe(structuralDigestOf(tuesday.trace));
    expect(structuralDigestOf(monday.trace)).not.toBe(structuralDigestOf((await run()).trace));
  }, 300_000);

  it('refuses a bound the template cannot absorb, and says how much it can', async () => {
    await expect(
      run({ dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 900 } }),
    ).rejects.toThrow(/does not fit inside demand template "rise-and-fall": its outermost phase/);
  }, 300_000);

  /**
   * The bound is checked, not the draw — so the refusal cannot depend on the seed.
   *
   * A shift bound of 900 s on the 1 800 s rise-and-fall is over its 750 s limit, but most draws
   * inside `[-900, +900]` fit anyway. An implementation that validated only the drawn value would
   * accept this configuration at some seeds and refuse it at others, which turns a configuration
   * error into a coin flip.
   */
  it('refuses that bound at every seed, not at the unlucky ones', async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      await expect(
        run({ seed, dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 900 } }),
      ).rejects.toThrow(/does not fit inside demand template/);
    }
  }, 300_000);

  /**
   * `constant-iso` is flat, so *when the peak happens* is not a question it can be asked.
   *
   * Refused rather than silently ignored: shifting only its measurement window would change which
   * passengers were counted without changing a single arrival, which is noise dressed as a model —
   * and a control that silently does nothing is exactly what criterion 2 exists to catch.
   */
  it('refuses a peak shift on a template with no peak', async () => {
    await expect(
      run({
        template: 'constant-iso',
        dayVariation: { minDemandFactor: 1, maxDemandFactor: 1, peakShiftS: 60 },
      }),
    ).rejects.toThrow(/has no interior phase boundary, so it has no peak to move/);
  }, 300_000);

  it('refuses a one-sided or inverted band', async () => {
    await expect(
      run({ dayVariation: { minDemandFactor: 1.4, maxDemandFactor: 0.8 } }),
    ).rejects.toThrow(/needs 0 < minDemandFactor <= maxDemandFactor/);
    await expect(
      run({ dayVariation: { minDemandFactor: 0, maxDemandFactor: 1 } }),
    ).rejects.toThrow(/needs 0 < minDemandFactor <= maxDemandFactor/);
    await expect(
      run({
        dayVariation: { maxDemandFactor: 1.2 } as unknown as DayVariationConfig,
      }),
    ).rejects.toThrow(/dayVariation.minDemandFactor must be a finite number/);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * Criterion 3 — day variation is inside the CRN pairing
 * -------------------------------------------------------------------------- */

/** Sample standard deviation. `n - 1`, because these are replications and not a population. */
function standardDeviation(values: readonly number[]): number {
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const ss = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(ss / (n - 1));
}

/** The standard error of the mean paired difference — the quantity criterion 3 is about. */
const pairedStandardError = (differences: readonly number[]): number =>
  standardDeviation(differences) / Math.sqrt(differences.length);

/** One arm of a paired comparison: which dispatcher, and how often its doors are obstructed. */
interface Arm {
  readonly dispatcherId: string;
  readonly doorObstructionProbability?: number | undefined;
}

/** The three standard errors one design produces, plus how many runs had a suppressed mean. */
interface Measurement {
  readonly seNoDay: number;
  readonly seSharedDay: number;
  readonly seLeakedDay: number;
  readonly suppressed: number;
}

describe('criterion 3 — day variation is inside the CRN pairing', () => {
  /**
   * Replications. Twenty is below `CLAUDE.md`'s 50–200 budget **for publishing a result**, and
   * that is deliberate: nothing here is published. What is compared are three standard errors
   * computed from the *same* twenty seeds, and the effect being detected — a leaked day against a
   * shared one — is a factor of six rather than a few tenths of a second.
   */
  const N = 20;
  const SEEDS = Array.from({ length: N }, (_, i) => 900_000 + i * 7919);

  /**
   * The band from docs/14 § 2.3's own worked question: *is this dispatcher robust to a 15 %
   * heavier Monday?*
   */
  const BAND: DayVariationConfig = { minDemandFactor: 0.85, maxDemandFactor: 1.15 };

  /**
   * `midtown-office` at 2 %/5 min rather than at its profile's 12 %.
   *
   * Chosen because **every one of the 240 runs below reports a valid mean there**, which is
   * asserted rather than assumed. At the profile's own demand this building is deeply saturated —
   * `traffic/transportIdentity.test.ts` pins `midtown-office|eta` at a mean wait of 803 s — and
   * `awtIsValid` suppresses the mean, so a paired-t taken across those runs would be arithmetic on
   * numbers the simulator itself refuses to publish. Criterion 3 is a statement about variance,
   * and it can only be measured where the statistic exists.
   */
  const RATE_PCT_POP_5MIN = 2;

  /**
   * The two days a leaked implementation would hand the two arms, one pair per replication.
   *
   * Written down as a function of the seed rather than drawn at test time, so the negative control
   * is as reproducible as the runs it drives. Two independent quasi-random walks over the same
   * band as {@link BAND}: exactly what "each arm drew its own day" produces.
   */
  const leakedPair = (seed: number): readonly [number, number] => {
    const spread = BAND.maxDemandFactor - BAND.minDemandFactor;
    return [
      BAND.minDemandFactor + spread * (((seed * 2_654_435_761) % 1000) / 1000),
      BAND.minDemandFactor + spread * (((seed * 40_503) % 997) / 997),
    ] as const;
  };

  const fixedDay = (factor: number): DayVariationConfig => ({
    minDemandFactor: factor,
    maxDemandFactor: factor,
  });

  async function runArm(
    arm: Arm,
    seed: number,
    dayVariation: DayVariationConfig | undefined,
  ): Promise<SimulationResult> {
    const config = await fixtures();
    const building = config.buildingsById.get(BUILDING_ID);
    const dispatcherProfile = config.dispatcherProfilesById.get(arm.dispatcherId);
    if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
    return runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed,
      onTimeout: 'report',
      ...(arm.doorObstructionProbability === undefined
        ? {}
        : { doorObstructionProbability: arm.doorObstructionProbability }),
      demand: {
        arrivalRatePctPop5min: RATE_PCT_POP_5MIN,
        ...(dayVariation === undefined ? {} : { dayVariation }),
      },
    });
  }

  /**
   * The three conditions, over one pair of arms and the same twenty seeds.
   *
   * | condition | what each arm sees |
   * |---|---|
   * | **A — no day** | the run every published figure was measured under |
   * | **B — shared day** | both arms declare the same block, so at one seed they draw one day |
   * | **C — leaked day** | the arms are handed *different* days at the same seed |
   *
   * B is the shipped behaviour. **C is the defect the criterion exists to catch**, built rather
   * than imagined, and it is also why `runner/crn.ts`'s `traceKeyOf` carries `dayVariation`: C's
   * two arms have *different trace keys*, so the runner puts them in different cohorts and never
   * pairs them. The key is the mechanism; this is the measurement that the mechanism is needed.
   */
  async function measure(armA: Arm, armB: Arm): Promise<Measurement> {
    const noDay: number[] = [];
    const sharedDay: number[] = [];
    const leakedDay: number[] = [];
    let suppressed = 0;

    const awtOf = (result: SimulationResult): number => {
      if (!result.summary.awtIsValid) suppressed += 1;
      return result.summary.waiting.meanS;
    };

    for (const seed of SEEDS) {
      noDay.push(
        awtOf(await runArm(armA, seed, undefined)) - awtOf(await runArm(armB, seed, undefined)),
      );

      const sharedA = await runArm(armA, seed, BAND);
      const sharedB = await runArm(armB, seed, BAND);
      // **The guarantee itself, exactly rather than statistically.** The day is a function of the
      // seed alone, taken before a car moves, so both arms of the comparison drew one Monday.
      expect(sharedA.trace.dayVariation).toEqual(sharedB.trace.dayVariation);
      expect(structuralDigestOf(sharedA.trace)).toBe(structuralDigestOf(sharedB.trace));
      sharedDay.push(awtOf(sharedA) - awtOf(sharedB));

      const [factorA, factorB] = leakedPair(seed);
      leakedDay.push(
        awtOf(await runArm(armA, seed, fixedDay(factorA))) -
          awtOf(await runArm(armB, seed, fixedDay(factorB))),
      );
    }

    return {
      seNoDay: pairedStandardError(noDay),
      seSharedDay: pairedStandardError(sharedDay),
      seLeakedDay: pairedStandardError(leakedDay),
      suppressed,
    };
  }

  /**
   * **The criterion, on the pair with the least machine-side noise of its own.**
   *
   * One dispatcher, two door-obstruction rates — *hold the crowd, change the machine*, which is
   * the comparison common random numbers exists for. The arms are close enough that the paired
   * difference is small, so the day's contribution to it is measurable rather than buried under
   * the gap between two different dispatchers. That is the design choice, and it is the reason
   * this pair is the gate and the dispatcher pair below is the context.
   */
  it(
    'a leaked day costs far more paired precision than a shared one',
    async () => {
      const measured = await measure(
        { dispatcherId: 'eta', doorObstructionProbability: 0 },
        { dispatcherId: 'eta', doorObstructionProbability: 0.02 },
      );

      // Criterion 3 is about a variance, and a suppressed mean is not one.
      expect(measured.suppressed, 'every run must report a mean the simulator will publish').toBe(0);

      /*
       * **The criterion, in the form its own gloss states**: *"if day variation leaks outside the
       * shared trace, the paired standard error rises and this fails."* Measured on this tree:
       * 0.1803 s shared against 1.1854 s leaked, a factor of 6.6. The gate is 3, which is far
       * below what was measured and far above what twenty replications can produce by chance.
       */
      expect(
        measured.seLeakedDay,
        `a leaked day (SE ${measured.seLeakedDay.toFixed(4)} s) must cost far more paired precision than a shared one (SE ${measured.seSharedDay.toFixed(4)} s), or day variation is inert and this file measures nothing`,
      ).toBeGreaterThan(measured.seSharedDay * 3);

      /*
       * **The literal reading of criterion 3 is refused, and the refusal is pinned rather than
       * tolerated.** The criterion also says the paired variance under `dayVariation` must be *no
       * larger than the same comparison without it*. That is not satisfiable by any correct
       * implementation, and the reason is the feature working exactly as designed:
       *
       *   Var(D | day varies) = E_day[Var(D | day)] + Var_day(E[D | day])
       *
       * The second term is the *interaction* — how much the gap between the two arms itself moves
       * with the demand level — and it is non-negative by construction. Making it zero would mean
       * the two arms respond to demand identically, which is precisely the thing docs/14 § 2.3
       * added day variation to find out ("is its win an artefact of one demand level?"). The first
       * term grows too, because AWT variance rises with demand faster than it falls.
       *
       * Measured at six pairs on this tree, the ratio `SE(shared) / SE(no day)` was 1.35, 1.45,
       * 1.63, 1.95, 2.44 and 3.45 — above one every time, and the two extremes are the two arms
       * being most and least alike rather than anything about the wiring.
       *
       * So it is asserted in the direction it actually holds. A future change that made the
       * shared-day SE fall to or below the no-day SE would fail here, and would mean either that
       * the interaction vanished — a finding — or that the multiplier had stopped reaching the
       * run. Both are worth being told about; neither may pass silently.
       */
      expect(
        measured.seSharedDay,
        `the paired SE under a shared day (${measured.seSharedDay.toFixed(4)} s) is expected to sit ABOVE the no-day SE (${measured.seNoDay.toFixed(4)} s) — see the note above: the rise is the demand-level interaction the feature exists to expose, not a leak, and the leak is measured separately`,
      ).toBeGreaterThan(measured.seNoDay);
    },
    900_000,
  );

  /**
   * The same three conditions on a real dispatcher pair, for context rather than as a gate.
   *
   * `eta` against `collective` is the comparison this project is actually built around, and it is
   * where the interaction term is largest: the two dispatchers diverge more as the building fills.
   * The leak is *not* separable here at n = 20 — the level effect over a ±15 % band is a fraction
   * of a second against a paired difference whose standard deviation is several seconds — which is
   * why the gate above uses the quieter pair. Saying so is the point of keeping this test: a
   * reader who tried criterion 3 on the obvious pair and saw nothing should find the reason here
   * rather than conclude the feature is broken.
   */
  it(
    'on a real dispatcher pair the interaction term dominates, and that is reported not hidden',
    async () => {
      const measured = await measure(
        { dispatcherId: 'eta' },
        { dispatcherId: 'collective' },
      );

      expect(measured.suppressed).toBe(0);
      // Measured on this tree: 0.9134 s with no day, 1.3224 s with a shared one.
      expect(measured.seSharedDay).toBeGreaterThan(measured.seNoDay);
      /*
       * And the leak is *below the resolution of this design*, stated as a measurement rather than
       * left to be discovered: 1.2253 s leaked against 1.3224 s shared, a ratio of 0.93 that is
       * noise in both directions. The bound is loose on purpose — it asserts that this pair cannot
       * see the leak, which is the claim, and not a number that happens to have come out.
       */
      expect(measured.seLeakedDay).toBeLessThan(measured.seSharedDay * 3);
    },
    900_000,
  );
});
