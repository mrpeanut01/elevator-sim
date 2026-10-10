/**
 * The price schedule's reader, at its new address — GitHub issue #372, § D1295.
 *
 * Its rules are held where they always were, by `packages/viz/src/pricing/schedule.test.ts`,
 * `rate.test.ts` and their neighbours, which import the viewer's re-export and so run this module.
 * What this file adds is the two things the move itself owes: that the shipped schedule reads clean
 * **in `core`**, which is where the server will read it from; and that the engine still reads no
 * price, which `sim/types.ts` promises for `InterventionChange.changeId` and which an import is the
 * only way to break.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parsePriceSchedule, priceOf, purchaseUnits, violationsInPriceSchedule } from './priceSchedule.js';

const DATA = fileURLToPath(new URL('../../../../data/', import.meta.url));
const SIM = fileURLToPath(new URL('../sim/', import.meta.url));

describe('the price schedule in core — GitHub issue #372, § D1295', () => {
  it('reads the shipped schedule with no violation, and prices a row the rush menu sells', () => {
    const schedule = parsePriceSchedule(JSON.parse(readFileSync(`${DATA}price-schedule.json`, 'utf8')) as unknown);
    expect(violationsInPriceSchedule(schedule)).toEqual([]);
    expect(purchaseUnits(priceOf(schedule, 'faster-doors'))).toBeGreaterThan(0);
  });

  it('is imported by nothing under sim/, so the engine still reads no price', () => {
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.ts') && /from '[^']*priceSchedule(Types)?\.js'/u.test(readFileSync(path, 'utf8'))) {
          offenders.push(path);
        }
      }
    };
    walk(SIM);
    expect(offenders).toEqual([]);
    /* Positive control: the pattern sees an import of the module when there is one. */
    expect(/from '[^']*priceSchedule(Types)?\.js'/u.test("import { priceOf } from '../config/priceSchedule.js';")).toBe(true);
  });
});
