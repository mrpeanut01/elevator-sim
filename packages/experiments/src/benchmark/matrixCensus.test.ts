/**
 * **The opt-in tier: re-derive the matrix's budgets rather than trusting them.**
 *
 * ```
 * ELEVATOR_SIM_DEEP=1 npx vitest run --testTimeout=600000 packages/experiments/src/benchmark/matrixCensus.test.ts
 * ```
 *
 * `matrix.test.ts` verifies *the results*. This file verifies *the design that produced them*: it
 * re-runs every cell at the full 200-replication census and checks the two numbers `matrix.ts`
 * declares from it — each arm's first invalid replication index, and the binding arm's paired
 * spread, from which the budget follows arithmetically.
 *
 * ## Why this is the tier that is opt-in, and the matrix is not
 *
 * Because it is the expensive half and it is not the deliverable. The census costs 197 s against
 * the matrix's 73 s, and it re-measures inputs that move only when the simulator's behaviour moves
 * — at which point `matrix.test.ts`'s pins go red first and loudly. Putting the deliverable behind
 * an environment variable and the input check in front of it would be the wrong way round.
 *
 * ## Why the ceilings are re-measured at all rather than inherited
 *
 * `arms.ts` records `nearest-car` first losing its AWT at replication 287 on Midtown up-peak.
 * At this module's seed and operating point it is 174. Same building, same profile, different
 * number — a saturation ceiling is a property of (building, traffic, seed), and this project has
 * twice reused one across studies and had to correct it. So the census re-derives, and this suite
 * fails if a declared ceiling has drifted, in **both** directions: an arm that acquired a ceiling
 * it did not have is as much a change as one that lost the ceiling it did.
 */

import { describe, expect, it } from 'vitest';

import { cellOf, comparePaired, loadResources, runGateExperiment, samplesOf } from '../validation/harness.js';

import {
  MATRIX_ARM_PROFILES,
  MATRIX_BASELINE,
  MATRIX_CELLS,
  MATRIX_SEED,
  budgetFor,
} from './matrix.js';

const DEEP = process.env['ELEVATOR_SIM_DEEP'] === '1';

/** The census budget. The figure every ceiling and every spread in `matrix.ts` is stated at. */
const CENSUS_REPLICATIONS = 200;

/**
 * Tolerance on a re-derived paired spread.
 *
 * The census is deterministic from its seed, so the honest tolerance is zero — but the declared
 * `sdOfDifference` values are written to four decimal places, deliberately, because a `budgetBasis`
 * a reader cannot read is not a basis. `5e-5` is the width of that rounding and nothing else. What
 * is asserted exactly is the thing that matters: the **budget** the spread implies.
 */
const SD_TOLERANCE = 5e-5;

describe.skipIf(!DEEP)('the 200-replication census the matrix budgets are derived from', () => {
  it('reproduces every declared ceiling and every declared spread', async () => {
    const resources = await loadResources();
    const failures: string[] = [];
    const report: string[] = [];

    for (const cell of MATRIX_CELLS) {
      const experiment = await runGateExperiment({
        id: `matrix-census/${cell.id}`,
        seed: MATRIX_SEED,
        building: cell.building,
        dispatchers: [MATRIX_BASELINE, ...MATRIX_ARM_PROFILES],
        traffic: cell.traffic,
        replications: CENSUS_REPLICATIONS,
        resources,
      });

      /* The ceilings: the index of the first replication whose AWT was invalid, per arm. */
      const measuredCeilings = new Map<string, number>();
      for (const armId of [MATRIX_BASELINE, ...MATRIX_ARM_PROFILES]) {
        const index = cellOf(experiment, armId).replications.findIndex(
          (replication) => !replication.summary.awtIsValid,
        );
        if (index >= 0) measuredCeilings.set(armId, index);
      }

      // The baseline's own ceiling is what binds the whole table — a baseline with no quotable AWT
      // leaves no cell in its table with an interval at all. Every cell declares `undefined`, and
      // that is the entire justification for choosing `collective`.
      const baselineCeiling = measuredCeilings.get(MATRIX_BASELINE);
      if (baselineCeiling !== cell.admissibleReplications) {
        failures.push(
          `${cell.id}: baseline "${MATRIX_BASELINE}" ceiling is ${String(baselineCeiling)}, declared ${String(cell.admissibleReplications)}`,
        );
      }

      for (const [armId, index] of measuredCeilings) {
        if (armId === MATRIX_BASELINE) continue;
        const declared = cell.armCeilings[armId];
        if (declared !== index) {
          failures.push(
            `${cell.id}/${armId}: first invalid replication ${String(index)}, declared ${String(declared)}`,
          );
        }
      }
      for (const armId of Object.keys(cell.armCeilings)) {
        if (!measuredCeilings.has(armId)) {
          failures.push(
            `${cell.id}/${armId}: declared a ceiling of ${String(cell.armCeilings[armId])}, but the census found none — ` +
              'a ceiling that has healed is as much a change as one that appeared',
          );
        }
      }

      /*
       * The spread. Restricted to the arms with no invalid replication in the whole census, which
       * is what makes the budget rule non-circular: an arm that saturates at some `n` inside the
       * band makes the required `n` a function of itself.
       */
      const baseline = samplesOf(experiment, MATRIX_BASELINE, 'awtS');
      let binding: { armId: string; sd: number } | undefined;
      for (const armId of MATRIX_ARM_PROFILES) {
        if (measuredCeilings.has(armId)) continue;
        const candidate = samplesOf(experiment, armId, 'awtS');
        if (candidate.some((value) => !Number.isFinite(value))) continue;
        if (baseline.some((value) => !Number.isFinite(value))) continue;
        const sd = Math.sqrt(comparePaired('awtS', candidate, baseline).varianceOfDifference);
        if (binding === undefined || sd > binding.sd) binding = { armId, sd };
      }

      if (binding === undefined) {
        failures.push(`${cell.id}: no clean arm to derive a budget from`);
        continue;
      }
      if (binding.armId !== cell.budgetBasis.bindingArmId) {
        failures.push(
          `${cell.id}: the widest clean arm is "${binding.armId}" (sd ${binding.sd.toFixed(4)}), declared "${cell.budgetBasis.bindingArmId}"`,
        );
      }
      if (Math.abs(binding.sd - cell.budgetBasis.sdOfDifference) > SD_TOLERANCE) {
        failures.push(
          `${cell.id}: binding sd ${binding.sd.toFixed(6)}, declared ${String(cell.budgetBasis.sdOfDifference)}`,
        );
      }
      // The one that has to be exact: whatever the spread rounds to, the budget it buys must be the
      // budget the matrix actually spent.
      if (budgetFor(binding.sd) !== cell.replications) {
        failures.push(
          `${cell.id}: the measured spread buys n=${String(budgetFor(binding.sd))}, the matrix spent ${String(cell.replications)}`,
        );
      }

      report.push(
        `  ${cell.id.padEnd(24)} binding ${binding.armId.padEnd(14)} sd ${binding.sd.toFixed(4)} ` +
          `-> n=${String(budgetFor(binding.sd))} (spent ${String(cell.replications)}); ceilings ` +
          `${[...measuredCeilings].map(([armId, index]) => `${armId}@${String(index)}`).join(' ') || '(none)'}`,
      );
    }

    console.log(`matrix census at n=${String(CENSUS_REPLICATIONS)}, seed ${String(MATRIX_SEED)}:\n${report.join('\n')}`);
    expect(failures.join('\n'), failures.join('\n')).toBe('');
  }, 900_000);
});

describe('the census tier announces itself when it is not running', () => {
  it('says how to run it', () => {
    if (!DEEP) {
      console.log(
        '\nmatrix census: SKIPPED. Set ELEVATOR_SIM_DEEP=1 to re-derive every matrix budget from a ' +
          `${String(CENSUS_REPLICATIONS)}-replication census (~197 s). The matrix itself is always-on ` +
          'at its full derived budgets and is not affected by this flag.',
      );
    }
    expect(CENSUS_REPLICATIONS).toBe(200);
  });
});
