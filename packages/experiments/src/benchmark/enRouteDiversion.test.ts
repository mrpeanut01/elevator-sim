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
  { building: 'midtown-office', rate: 2 },
  { building: 'garden-apartments', rate: 10 },
  { building: 'garden-apartments', rate: 14 },
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
