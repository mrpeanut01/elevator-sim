/**
 * The shipped price schedule, read off disk — for tests that need real prices.
 *
 * A helper rather than a fixture, and the difference matters: a fixture would be a **seventh**
 * price list, which is the thing GitHub issue #366 exists to end. Every test that needs a price
 * gets the one the product ships.
 *
 * Its non-test caller is nothing, by construction — this file is `*.test-helper.ts` and is the
 * tier's own vocabulary. The product reaches the same document through `dev/data.ts#loadPriceSchedule`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parsePriceSchedule } from './parse.js';
import type { PriceSchedule } from './types.js';

const SCHEDULE_PATH = fileURLToPath(
  new URL('../../../../data/price-schedule.json', import.meta.url),
);

let cached: PriceSchedule | undefined;

/** `data/price-schedule.json`, parsed once per process. */
export function shippedPriceSchedule(): PriceSchedule {
  cached ??= parsePriceSchedule(JSON.parse(readFileSync(SCHEDULE_PATH, 'utf8')));
  return cached;
}
