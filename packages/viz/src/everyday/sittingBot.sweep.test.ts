/**
 * **The sitting bot: whole sittings played with one fixed policy** — wave AM, lane AM-F,
 * [§ D1267](../../../../DECISIONS.md), swarm DO § 4 and its score-8 test.
 *
 * ## What it runs
 *
 * A **sitting** is one date: `SITTING_BOT_SITTINGS` dates from `SITTING_BOT_FROM` (default 8 from
 * 2026-11-02, a stretch no census or published sweep uses), each played for `SITTING_BOT_WEEKS`
 * weeks (default 3) on `midtown-office` (`SITTING_BOT_CONTRACT`), under each fixed policy in
 * `SITTING_BOT_POLICIES` (default `house`, `s1-fairness-keep-park` and `fairness-keep-spread`,
 * `sittingBot.test-helper.ts#SITTING_POLICIES`). Every day is `playScoredDay`: the shipped call
 * session answered by the policy, graded by the rail's goals.
 *
 * **It plays the week the product deals.** The week opens with `shift/week.ts#openWeek` and moves
 * on by `nextDay`, which rolls a week the census speaks for into the next (§ D1177), so whatever a
 * week carries from one to the next reaches the bot through the product's own roll. The crowd is the
 * one `shift/weekRecord.ts#dealtCrowdOf` deals on one device in one sitting: the date's crowd for
 * the first scored day, and `derivedCrowdOf(date, day, weeksClosed)` for every day after it. Only
 * the **counted** days are played (`shift/weekStake.ts#weekDealOf`), because the weekend is off the
 * path (swarm DO § 1) and counts for nothing; the week's target is the deal's.
 *
 * ## What it writes
 *
 * One `day` row per day (verdict, calls, how many flip the day, real seconds at the default rung
 * with § D1266's skip) and one `week` row per week (clean counted days against the target, and
 * whether the target was met). Gated on `SITTING_BOT_SWEEP=1` and written to `SITTING_BOT_OUT`,
 * for `honesty/measure.corpus.test.ts`' two reasons. Run it with `--testTimeout=21600000` on the
 * command line.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { dailySeedFor } from '../shift/dailySeed.js';
import { nextDay, openWeek } from '../shift/week.js';
import { derivedCrowdOf } from '../shift/weekRecord.js';
import { weekDealOf } from '../shift/weekStake.js';
import { crowdDates } from '../shift/weekWay.js';

import { callFlips, playScoredDay, SITTING_POLICIES } from './sittingBot.test-helper.js';

const CONTRACT = process.env['SITTING_BOT_CONTRACT'] ?? 'c2';
const FROM = process.env['SITTING_BOT_FROM'] ?? '2026-11-02';
const SITTINGS = Number(process.env['SITTING_BOT_SITTINGS'] ?? '8');
const WEEKS = Number(process.env['SITTING_BOT_WEEKS'] ?? '3');
const POLICIES = (process.env['SITTING_BOT_POLICIES'] ?? 'house,s1-fairness-keep-park,fairness-keep-spread').split(',');

describe.runIf(process.env['SITTING_BOT_SWEEP'] === '1')('§ D1267: the sitting bot', () => {
  it('plays whole sittings with each fixed policy', () => {
    const resources = contractBuildings();
    const deal = weekDealOf(CONTRACT);
    if (deal === undefined) throw new Error(`the week census does not speak for ${CONTRACT}`);
    const rows: string[] = [
      'kind\tsitting\tpolicy\tweek\tday\twrinkle\tseed\tcleared\tfailing\tcalls\tflips\trealS\tclean\ttarget\tmet',
    ];
    const out = process.env['SITTING_BOT_OUT'];
    for (const [s, date] of crowdDates(FROM, SITTINGS).entries()) {
      const dateSeed = dailySeedFor(date);
      for (const policyId of POLICIES) {
        const policy = SITTING_POLICIES.find((entry) => entry.id === policyId);
        if (policy === undefined) throw new Error(`no policy ${policyId}`);
        let week = openWeek(CONTRACT);
        let firstDay = true;
        for (let w = 0; w < WEEKS; w += 1) {
          let clean = 0;
          for (;;) {
            const dealt = weekDealOf(CONTRACT)?.days[week.day - 1];
            if (dealt?.counts === true) {
              const seed = firstDay ? dateSeed : derivedCrowdOf(dateSeed, week.day, w);
              firstDay = false;
              const played = playScoredDay({ resources, contractId: CONTRACT, week, seed, policy });
              if (played.cleared) clean += 1;
              rows.push(
                [
                  'day',
                  String(s),
                  policy.id,
                  String(w + 1),
                  String(week.day),
                  played.wrinkle,
                  seed.toString(),
                  played.cleared ? 'C' : 'm',
                  played.failing.join(','),
                  String(played.calls.length),
                  String(played.calls.filter(callFlips).length),
                  played.realS.toFixed(1),
                  '',
                  '',
                  '',
                ].join('\t'),
              );
              if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
            }
            const before = week.day;
            week = nextDay(week);
            if (week.day <= before) break;
          }
          rows.push(
            [
              'week',
              String(s),
              policy.id,
              String(w + 1),
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              String(clean),
              String(deal.target),
              clean >= deal.target ? '1' : '0',
            ].join('\t'),
          );
          if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
        }
      }
    }
    expect(rows.length).toBeGreaterThan(1);
  });
});
