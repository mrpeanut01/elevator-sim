/**
 * The verdict on `eligibility.enRouteDiversion`, reported as an interval rather than asserted.
 *
 * This suite deliberately does **not** assert that diversion is an improvement. It asserts the
 * three things that have to be true for the number to mean anything — the arms were paired, the
 * mechanism was live, and the AWT interval is quotable — and then prints what was measured. A
 * test that demanded a win would be a test that had to be weakened when the answer came back
 * inconvenient, which is the failure mode `docs/05-roadmap.md` names in its own working
 * agreements.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import { loadResources } from '../validation/harness.js';

import {
  measureDiversionAt,
  measureShippedAt,
  type DiversionCell,
  type DiversionPoint,
} from './enRouteDiversion.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadResources();
}, 60_000);

/**
 * Two rates, both chosen so the AWT interval is quotable at all.
 *
 * **3 % is measured and deliberately not asserted on.** It is where the pass-by census was
 * taken and its paired difference is the largest of the three, but
 * at n = 50 at least one replication saturates, `awtIsValid` goes false for the cell, and
 * docs/03-traffic-and-statistics.md forbids reporting a mean for a system whose queues grow
 * without bound. Quoting the biggest number in the study from the one cell whose interval the
 * project's own rules suppress would be exactly the reasoning this repository exists to avoid.
 * The two cells below carry a valid AWT on both arms and say the same thing more quietly.
 *
 * 50 replications is the floor CLAUDE.md § Statistical discipline permits, taken because this
 * runs in the ordinary suite; a figure a decision rests on should be re-measured at 200.
 */
const POINTS: readonly DiversionPoint[] = Object.freeze([
  { building: 'midtown-office', rate: 1 },
  { building: 'garden-apartments', rate: 10 },
  { building: 'secure-tower', rate: 2, callType: 'mobile-credential' },
  { building: 'secure-tower', rate: 4, callType: 'mobile-credential' },
  { building: 'mixed-use-high-rise', rate: 2, callType: 'mobile-credential' },
]);
const REPLICATIONS = 50;

function line(cell: DiversionCell): string {
  const fmt = (comparison: DiversionCell['waiting']): string =>
    `${comparison.estimate.mean >= 0 ? '+' : ''}${comparison.estimate.mean.toFixed(3)} ` +
    `[${comparison.estimate.lower.toFixed(3)}, ${comparison.estimate.upper.toFixed(3)}]` +
    `${comparison.significant ? ' *' : ''}`;
  return (
    `  ${cell.building.padEnd(18)} ${String(cell.rate).padStart(2)}%  n=${String(cell.waiting.n)}  ` +
    `AWT ${fmt(cell.waiting).padEnd(34)}  TTD ${fmt(cell.timeToDestination).padEnd(34)}  ` +
    `live=${String(cell.live)} crn=${String(cell.commonRandomNumbers)} awtValid=${String(cell.awtIsValid)}`
  );
}

describe('en-route diversion, paired against conventional collective', () => {
  it('measures the difference under common random numbers and reports the interval', async () => {
    const cells: DiversionCell[] = [];
    for (const point of POINTS) {
      cells.push(await measureDiversionAt(point, REPLICATIONS, config));
    }

    process.stdout.write(
      `\nDown-peak. collective-enroute − collective, paired-t 95 %.\n` +
        `Negative is an improvement; * marks an interval excluding zero.\n` +
        cells.map(line).join('\n') +
        '\n\n',
    );

    for (const cell of cells) {
      // The pairing itself. Without identical traces per replication these are two independent
      // samples and the paired interval is not the interval it claims to be.
      expect(cell.commonRandomNumbers).toBe(true);

      // The mechanism fired. Under CRN two arms that behave identically are bit-identical, so
      // this is what separates "the effect is small" from "the switch does nothing" — the state
      // this fix was actually in partway through, when eligibility was repaired and the cost
      // model was not.
      expect(cell.live).toBe(true);

      // A mean this project is allowed to quote at all.
      expect(cell.awtIsValid).toBe(true);
    }
  }, 600_000);
});

/* -------------------------------------------------------------------------- *
 * The profile as shipped — the question an operator actually asks
 * -------------------------------------------------------------------------- */

describe('collective-enroute, as shipped, against collective', () => {
  it('is better or null on both metrics everywhere, and worse on neither', async () => {
    const cells: DiversionCell[] = [];
    for (const point of [...POINTS, { building: 'vertical-city', rate: 4, callType: 'mobile-credential' } as const]) {
      cells.push(await measureShippedAt(point, REPLICATIONS, config));
    }

    process.stdout.write(
      `\nShipped collective-enroute − collective, down-peak, paired-t 95 %.\n` +
        cells.map(line).join('\n') +
        '\n\n',
    );

    for (const cell of cells) {
      expect(cell.commonRandomNumbers).toBe(true);
      expect(cell.live).toBe(true);

      // **The guard on `detourPenalty`.** The weight is what turns the mechanism from a trade into
      // a dominance: without it, TTD is significantly worse at three of these cells and worse on
      // *both* metrics at vertical-city, where a diverted first leg delays a sky-lobby transfer
      // (`DECISIONS.md` § D205 — single-leg ΔTTD -0.188, transferring +6.763). Removing the weight
      // from `data/dispatcher-profiles.json` fails here rather than quietly restoring the
      // regression, which is the only reason a reader can trust the profile's own comment.
      //
      // "Not significantly worse" is `lower <= 0` — the interval reaches zero or sits below it.
      // Asserting `upper < 0` instead would demand a significant *gain* on both metrics at every
      // cell, which is a stronger claim than the measurement supports and than the profile makes.
      const label = `${cell.building}@${String(cell.rate)}%`;
      expect(cell.waiting.estimate.lower, `${label} AWT is significantly worse`).toBeLessThanOrEqual(0);
      expect(
        cell.timeToDestination.estimate.lower,
        `${label} TTD is significantly worse — has detourPenalty been dropped from collective-enroute?`,
      ).toBeLessThanOrEqual(0);
    }

    // And it is not merely "not worse": the wait gain is real somewhere, or the profile is pointless.
    expect(cells.filter((cell) => cell.waiting.significant).length).toBeGreaterThanOrEqual(4);
  }, 900_000);
});
