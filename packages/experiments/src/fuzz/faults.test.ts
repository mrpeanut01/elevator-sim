/**
 * The evidence that every property is load-bearing.
 *
 * A property that has never failed is a property that cannot fail, and a green fuzz suite that
 * has never caught anything is the failure mode of this whole track. So each of the six is
 * shown here to fire on a deliberate breakage of exactly the thing it protects, and to stay
 * quiet on the same run untouched — the second half matters as much as the first, because a
 * predicate that fires on everything is no more useful than one that fires on nothing.
 *
 * Every fault is printed, so the evidence is in the run log and not only in an assertion.
 */

import { loadConfig, runSimulation, type LoadedConfig, type SimulationResult } from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { STANDARD_CORPUS } from './campaign.js';
import {
  stallingAfter,
  starvingFloorUntil,
  withLostPassenger,
  withMisdelivery,
  withNegativeWait,
  withOverfilledCar,
} from './faults.js';
import { caseFromSeed } from './generate.js';
import {
  checkAll,
  checkCapacity,
  checkConservation,
  checkDestination,
  checkMonotonicTime,
  type PropertyContext,
} from './properties.js';
import { evaluateCase, generateOptionsFrom, fuzzSimulationConfigFor } from './run.js';
import { PROPERTY_BOUNDS, type FuzzCase, type Violation } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
/** A healthy baseline run: everybody delivered, several cars, several stops. */
let baseCase: FuzzCase;
let baseResult: SimulationResult;
let context: PropertyContext;

/** Print one line per violation, so the evidence survives in the log. */
function show(label: string, violations: readonly Violation[]): void {
  const lines = violations.slice(0, 3).map((violation) => `    [${violation.property}] ${violation.message}`);
  console.log(`  ${label}: ${String(violations.length)} violation(s)\n${lines.join('\n')}`);
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const options = generateOptionsFrom(config);

  // The first corpus case that delivered a decent population without timing out. Chosen by a
  // stated rule rather than a magic seed, so a generator change moves the fixture instead of
  // breaking it.
  for (const seed of STANDARD_CORPUS) {
    const candidate = caseFromSeed(seed, options);
    const simConfig = fuzzSimulationConfigFor(candidate, { config });
    const result = runSimulation(simConfig);
    if (result.status !== 'completed') continue;
    if (result.trace.passengerCount < 60) continue;
    if (result.record.loadSamples.length < 20) continue;
    baseCase = candidate;
    baseResult = result;
    context = {
      case: candidate,
      building: simConfig.building,
      dispatcherProfile: simConfig.dispatcherProfile,
      elevatorSpecs: config.elevatorSpecs,
      result,
      bounds: PROPERTY_BOUNDS,
    };
    break;
  }
  if (baseCase === undefined) throw new Error('no healthy baseline case in the standard corpus');
  console.log(
    `\nfault baseline: ${baseCase.caseId} (${baseCase.topology}, ${String(baseResult.trace.passengerCount)} passengers, status ${baseResult.status})`,
  );
}, 120_000);

describe('the baseline is clean', () => {
  it('violates nothing before anything is broken', () => {
    expect(checkAll(context)).toEqual([]);
  });
});

describe('each property fails when the thing it protects is broken', () => {
  it('P1 conservation — a passenger deleted, with the audit adjusted to agree', () => {
    // The audit is decremented to match, so `conservation.balanced` still says `true`. Only a
    // recount from the trace can see the missing journey; a property that echoed the audit
    // would pass this.
    const broken = { ...context, result: withLostPassenger(baseResult) };
    expect(broken.result.conservation.balanced).toBe(true);
    const violations = checkConservation(broken);
    show('P1 lost passenger', violations);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.property === 'conservation')).toBe(true);
    expect(violations.some((violation) => violation.message.includes('it vanished'))).toBe(true);
  });

  it('P2 destination — a delivered passenger put down at the wrong floor', () => {
    const wrongFloor = (baseCase.building.floors ?? []).map((floor) => floor.id);
    const target = wrongFloor[wrongFloor.length - 1];
    expect(target).toBeDefined();
    const broken = { ...context, result: withMisdelivery(baseResult, target ?? '') };
    const violations = checkDestination(broken);
    show('P2 wrong floor', violations);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.property === 'destination')).toBe(true);
  });

  it('P3 capacity — one more body in a car that was already at design load', () => {
    const broken = { ...context, result: withOverfilledCar(baseResult) };
    const violations = checkCapacity(broken);
    show('P3 over capacity', violations);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.property === 'capacity')).toBe(true);
    // Both detections fire: the boarding rule, and the disagreement with the load cell's own
    // recorded samples. Either alone would be enough; together they are a cross-check.
    expect(violations.some((violation) => violation.message.includes('design load'))).toBe(true);
    expect(violations.some((violation) => violation.message.includes('load cell recorded'))).toBe(true);
  });

  it('P4 monotonic time — a boarding timestamped before its own arrival', () => {
    const broken = { ...context, result: withNegativeWait(baseResult, 45) };
    const violations = checkMonotonicTime(broken);
    show('P4 negative wait', violations);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.property === 'monotonic-time')).toBe(true);
    expect(violations.some((violation) => violation.message.includes('a wait of -45'))).toBe(true);
  });
});

describe('the two behavioural properties fail on a real run with a faulty controller', () => {
  it('P5 termination — the group stops allocating and the building goes idle', () => {
    // A real run of the real simulator, with stages 2-5 refusing every call from t=60. Nothing
    // else is touched: the physics, the doors, the trace and the recorder are the shipped ones.
    const outcome = evaluateCase(baseCase, { config, createPolicy: stallingAfter(60) });
    show('P5 deadlock', outcome.violations);
    const deadlocks = outcome.violations.filter((violation) => violation.property === 'termination');
    expect(deadlocks.length).toBeGreaterThan(0);
    expect(deadlocks[0]?.message).toContain('deadlock');
    // And nobody was lost while it stalled — the run is broken, not incoherent.
    expect(outcome.violations.some((violation) => violation.property === 'conservation')).toBe(false);
  }, 60_000);

  /**
   * **This demonstration moved a layer down in T21, and the move is the finding.**
   *
   * The fault is unchanged: one floor's calls are refused until well past the end of demand, then
   * released, so everybody is eventually collected. The run stays uncensored and its queue never
   * diverges — which used to mean `awtIsValid` stayed `true`, and P6 was the only thing in the
   * project that noticed the fifteen-minute wait.
   *
   * `RunSummary.awtIsValid` now has a fourth gate (`core/src/metrics/summarize.ts` §
   * `diagnoseServiceLevel`, and `packages/core/DECISIONS-T21.md`), so **the model catches this
   * fault itself** and P6's escape clause — *"a fifteen-minute wait is legitimate in a run that
   * says so"* — is satisfied. A version of this test that still demanded a P6 violation would be
   * demanding that the simulator go back to publishing a mean beside an abandoned passenger.
   *
   * So both halves are asserted, on the same faulted run, and the second is what keeps P6
   * load-bearing rather than merely satisfied:
   *
   * 1. with the model's gate **on**, the run refuses to publish and names the passenger, and P6
   *    is correctly silent;
   * 2. with the model's gate **off** — `maxWaitHorizonS` past anything the run can reach, which is
   *    the gate's own off switch — the original condition returns exactly, and `checkStarvation`
   *    fires on it. `checkStarvation` itself is unchanged, line for line.
   */
  it('P6 starvation — one landing left unallocated long enough to blow the bound', () => {
    // The (case, floor) pair is **searched for** in a fixed order rather than pinned to a magic
    // seed, and the search is the interesting half of the demonstration: on a case that is
    // already near capacity, starving a whole landing makes the queue diverge and the simulator
    // *correctly* flags the run on the trend gate — so the property does not fire, and should
    // not. Only on a case the fault leaves otherwise healthy is a long wait a defect rather than
    // a disclosure. The search runs with the fourth gate off, so it looks for the same shape of
    // case it always looked for.
    const GATE_OFF = { maxWaitHorizonS: Number.MAX_SAFE_INTEGER } as const;
    let ungated: Violation[] = [];
    let gated: Violation[] = [];
    let gatedResult: SimulationResult | undefined;
    let starved = '';

    search: for (const seed of STANDARD_CORPUS) {
      const candidate = caseFromSeed(seed, generateOptionsFrom(config));
      const releaseAtS = candidate.durationS + PROPERTY_BOUNDS.starvationBoundS + 120;
      const relaxed: FuzzCase = { ...candidate, drainGraceS: releaseAtS + 1200 };
      for (const floor of (candidate.building.floors ?? []).filter((entry) => entry.population > 0)) {
        const createPolicy = starvingFloorUntil(floor.id, releaseAtS);
        const simConfig = fuzzSimulationConfigFor(relaxed, { config, createPolicy });
        const contextFor = (result: SimulationResult): PropertyContext => ({
          case: relaxed,
          building: simConfig.building,
          dispatcherProfile: simConfig.dispatcherProfile,
          elevatorSpecs: config.elevatorSpecs,
          result,
          bounds: PROPERTY_BOUNDS,
        });

        const off = runSimulation({ ...simConfig, summarize: GATE_OFF });
        const offViolations = checkAll(contextFor(off));
        if (!offViolations.some((violation) => violation.property === 'starvation')) continue;

        ungated = offViolations;
        gatedResult = runSimulation(simConfig);
        gated = checkAll(contextFor(gatedResult));
        starved = `${candidate.caseId} floor ${floor.id}, released at t=${String(releaseAtS)}`;
        break search;
      }
    }

    show(`P6 starvation, model gate OFF (${starved})`, ungated);
    show('P6 starvation, model gate ON', gated);

    // 1. The property fires on the fault, on a real run of the real simulator.
    expect(ungated.some((violation) => violation.property === 'starvation')).toBe(true);
    // Not merely a restatement of "the run went badly": nobody was lost and nobody was
    // misdelivered, so P1-P4 stay quiet and only the bound fires.
    for (const quiet of ['conservation', 'destination', 'capacity', 'monotonic-time'] as const) {
      expect(ungated.some((violation) => violation.property === quiet)).toBe(false);
    }

    // 2. With the gate on, the same run discloses the same passenger and P6 stands down.
    expect(gatedResult).toBeDefined();
    const summary = (gatedResult as SimulationResult).summary;
    console.log(
      `  model gate ON: verdict=${summary.serviceLevel.verdict}, awtIsValid=${String(summary.awtIsValid)}, ` +
        `longest ${summary.serviceLevel.longestWaitS.toFixed(1)} s (leg ${String(summary.serviceLevel.longestWaitLegId)})`,
    );
    expect(summary.saturation.verdict).toBe('stable');
    expect(summary.serviceLevel.verdict).toBe('starved');
    expect(summary.serviceLevel.longestWaitS).toBeGreaterThan(PROPERTY_BOUNDS.starvationBoundS);
    expect(summary.awtIsValid).toBe(false);
    expect(gated).toEqual([]);
  }, 120_000);
});
