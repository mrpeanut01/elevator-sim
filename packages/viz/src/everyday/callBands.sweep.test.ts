/**
 * **The call bands' census: whether *keep* can be wrong on a dealt week, judged on the day's
 * verdict** — wave AO, lane DR-2, [§ D1441](../../../../DECISIONS.md), swarm DR's ruling Q2 items 1
 * to 3 and Q3's DC-13.
 *
 * ## What it runs
 *
 * Every week order Midtown deals from week 2 (`shift/weekOrders.ts#dealtWeekOrdersOf`), its five
 * weekdays, on the census crowds `data/call-bands.json` names, under each of the two profiles DC-11
 * shows holding that order's week most (`shift/weekDominance.ts#bandedProfilesOf`, from
 * `data/week-dominance.json`), each played by `sittingBot.test-helper.ts#playScoredDay` through the
 * shipped call session with the careful answers: *keep* who drives, *park* the cars. At every raised
 * who-drives call each offer candidate the card does not offer is run as well (a shadow), so the
 * offer list can be derived from the census rather than written.
 *
 * ## What it asserts
 *
 * That the measured rows are exactly the pinned rows (`CALL_BANDS.rows`): every raised who-drives
 * call, its pair and every answer's and candidate's day verdict. The bands and the offer list are
 * arithmetic over those rows (`shift/callBands.ts`), held on every run by `callBands.test.ts`, so a
 * band that stops holding, or starts to, and an offer candidate that crosses the floor all arrive
 * here as a row that differs. A miss is a finding for a ruling, never a reason to move a band.
 *
 * ## What it writes
 *
 * The measured rows, in the data file's own shape, then the bands' reading, to `CALL_BANDS_OUT`
 * (vitest intercepts `console.log`). Gated on `CALL_BANDS_SWEEP=1` and scheduled nightly
 * (`.github/workflows/deep-tiers.yml`'s `call-bands`). `CALL_BANDS_PROFILES`, `CALL_BANDS_CROWDS`,
 * `CALL_BANDS_DAYS` and `CALL_BANDS_CANDIDATES` narrow or widen a hand run; any of them set, nothing
 * is compared.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CALL_BANDS,
  callBandsReadingOf,
  driverOfferOf,
  type CallBandsCall,
  type CallBandsRow,
} from '../shift/callBands.js';
import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { DAY_CALL_DRIVER_OFFER } from '../shift/dayCalls.js';
import { openWeek } from '../shift/week.js';
import { bandedProfilesOf } from '../shift/weekDominance.js';
import { dealtWeekOrdersOf } from '../shift/weekOrders.js';
import { WEEK_WAY } from '../shift/weekWay.js';
import { crowdSeeds } from '../shift/weekWay.test-helper.js';

import { playScoredDay, type SittingPolicy } from './sittingBot.test-helper.js';

const list = (name: string): readonly string[] | undefined => {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value.split(',');
};
const PROFILES = list('CALL_BANDS_PROFILES');
const CROWDS = list('CALL_BANDS_CROWDS')?.map(Number);
const DAYS = list('CALL_BANDS_DAYS')?.map(Number);
const CANDIDATES = list('CALL_BANDS_CANDIDATES');
const NARROWED = [PROFILES, CROWDS, DAYS, CANDIDATES].some((value) => value !== undefined);

describe.runIf(process.env['CALL_BANDS_SWEEP'] === '1')('§ D1441: the call bands on every dealt week', () => {
  it('reproduces the pinned rows, so every band and the offer list read today’s game', () => {
    const resources = contractBuildings();
    const protocol = CALL_BANDS.protocol;
    const contractId = protocol.contractId;
    const crowds = CROWDS ?? protocol.crowds;
    const all = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, WEEK_WAY.protocol.heldOutCount);
    const candidates = CANDIDATES ?? protocol.candidates;
    const out = process.env['CALL_BANDS_OUT'];
    const measured: CallBandsRow[] = [];
    const dealt = dealtWeekOrdersOf(contractId);
    const write = (summary: readonly string[]): void => {
      if (out !== undefined) writeFileSync(out, `${JSON.stringify(measured, null, 2)}\n\n${summary.join('\n')}\n`);
    };
    for (const [index, order] of dealt.entries()) {
      if (order === undefined) continue;
      const week = index + 1;
      const profiles = PROFILES ?? bandedProfilesOf(contractId, order);
      for (const briefDriver of profiles) {
        const policy: SittingPolicy = {
          id: `bands-${briefDriver}`,
          briefDriver,
          placement: protocol.placement,
          driver: 'leave',
        };
        const calls: CallBandsCall[] = [];
        const dayMarks: string[] = [];
        const at = measured.length;
        for (const crowd of crowds) {
          const seed = all[crowd];
          if (seed === undefined) throw new Error(`no census crowd ${String(crowd)}`);
          let marks = '';
          for (const day of DAYS ?? [1, 2, 3, 4, 5]) {
            const played = playScoredDay({
              resources,
              contractId,
              week: { ...openWeek(contractId), week, day, dayIdx: day - 1 },
              seed,
              policy,
              shadowDrivers: candidates,
            });
            marks += played.cleared ? 'C' : 'm';
            for (const call of played.calls) {
              if (call.question !== 'driver' || call.pair === undefined) continue;
              const clears: Record<string, 'C' | 'm'> = {};
              const keep = call.clears.leave;
              if (keep !== undefined) clears['keep'] = keep ? 'C' : 'm';
              const [a, b] = call.pair;
              if (call.clears['driver-a'] !== undefined) clears[a] = call.clears['driver-a'] ? 'C' : 'm';
              if (call.clears['driver-b'] !== undefined) clears[b] = call.clears['driver-b'] ? 'C' : 'm';
              for (const [id, cleared] of Object.entries(call.shadow ?? {})) clears[id] = cleared ? 'C' : 'm';
              calls.push({ crowd, day, atS: Math.round(call.atS), offered: [a, b], marks: clears });
            }
            measured[at] = { orderId: order.id, week, briefDriver, days: order.days, dayMarks: [...dayMarks, marks], calls: [...calls] };
            write([`playing ${order.id} under ${briefDriver}: crowd ${String(crowd)} day ${String(day)}`]);
          }
          dayMarks.push(marks);
        }
      }
    }
    const summary = measured.map((row) => {
      const reading = callBandsReadingOf(row, protocol);
      return `${row.orderId} under ${row.briefDriver}: ${reading.lines.join('; ')}`;
    });
    const offer = driverOfferOf({ ...CALL_BANDS, rows: measured });
    summary.push(`offer list derived from these rows: ${offer.join(', ')}`);
    write(summary);
    /*
     * § D1616 holds Midtown's one dealt order, so no week from week 2 has a row to measure. That is
     * pinned here as the measured negative, against the dealt orders, rather than passed as nothing:
     * the file carries no row and the offer is the protocol's candidates in order.
     */
    if (dealt.every((order) => order === undefined)) {
      expect(measured).toEqual([]);
      expect(CALL_BANDS.rows).toEqual([]);
      expect(offer).toEqual(protocol.candidates);
      expect(DAY_CALL_DRIVER_OFFER).toEqual(offer);
      return;
    }
    expect(measured.length).toBeGreaterThan(0);
    if (NARROWED) return;
    expect(measured, summary.join('\n')).toEqual(CALL_BANDS.rows);
    expect(offer).toEqual(DAY_CALL_DRIVER_OFFER);
  });
});
