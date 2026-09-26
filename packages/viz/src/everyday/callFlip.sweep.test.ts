/**
 * **The flip census: how often a call's other answer flips the day's verdict on its crowd** —
 * wave AM, lane AM-F, [§ D1264](../../../../DECISIONS.md), swarm DO § 4.
 *
 * ## What it runs
 *
 * `midtown-office` (`c2`, or `CALL_FLIP_CONTRACTS`), the whole authored day, week days
 * `CALL_FLIP_DAYS` (default 1 to 5) each with the wrinkle the week deals it, over **the census
 * crowds**: `data/week-way.json`'s held-out crowds (`protocol.heldOutFrom`, `heldOutCount`, the
 * crowds § D1067's rows were admitted on), or the first `CALL_FLIP_SEEDS` of them. Each day is
 * played by `sittingBot.test-helper.ts#playScoredDay` under each fixed policy named in
 * `CALL_FLIP_POLICIES` (default `house` and `s1-fairness-keep-park`, the baseline the ruling
 * named): the shipped call session, answered by the policy.
 *
 * ## What it writes
 *
 * One `day` row per day played (its verdict, its calls, and how many of them flip, could lose or
 * could save the day) and one `call` row per raised call (its instant, question, answer, the three
 * ten-minute counts and the three runs' verdicts). Gated on `CALL_FLIP_SWEEP=1` and written to
 * `CALL_FLIP_OUT`, for `honesty/measure.corpus.test.ts`' two reasons: the suite must not pay for it,
 * and vitest intercepts `console.log`. Run it with `--testTimeout=21600000` on the command line.
 */

import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { contractBuildings } from '../shift/contractDay.test-helper.js';
import { openWeek } from '../shift/week.js';
import { WEEK_WAY } from '../shift/weekWay.js';
import { crowdSeeds } from '../shift/weekWay.test-helper.js';

import {
  callCouldLose,
  callCouldSave,
  callFlips,
  playScoredDay,
  SITTING_POLICIES,
} from './sittingBot.test-helper.js';

const CONTRACTS_RUN = (process.env['CALL_FLIP_CONTRACTS'] ?? 'c2').split(',');
const DAYS = (process.env['CALL_FLIP_DAYS'] ?? '1,2,3,4,5').split(',').map(Number);
const SEEDS = Number(process.env['CALL_FLIP_SEEDS'] ?? String(WEEK_WAY.protocol.heldOutCount));
const POLICIES = (process.env['CALL_FLIP_POLICIES'] ?? 'house,s1-fairness-keep-park').split(',');

describe.runIf(process.env['CALL_FLIP_SWEEP'] === '1')('§ D1264: the flip census', () => {
  it('plays the census crowds under each fixed policy and grades every call’s three runs', () => {
    const resources = contractBuildings();
    const seeds = crowdSeeds(WEEK_WAY.protocol.heldOutFrom, WEEK_WAY.protocol.heldOutCount).slice(0, SEEDS);
    const rows: string[] = [
      'kind\tcontract\tday\twrinkle\tn\tpolicy\tstatus\tcleared\tfailing\tcalls\tflips\tcouldLose\tcouldSave\trealS\tatS\tquestion\tanswer\tcounts\tclears',
    ];
    const out = process.env['CALL_FLIP_OUT'];
    /*
     * Crowd outermost, so a run stopped part-way covers every day on the crowds it reached rather
     * than every crowd of the first days.
     */
    for (const contractId of CONTRACTS_RUN) {
      for (const [n, seed] of seeds.entries()) {
        for (const day of DAYS) {
          for (const policyId of POLICIES) {
            const policy = SITTING_POLICIES.find((entry) => entry.id === policyId);
            if (policy === undefined) throw new Error(`no policy ${policyId}`);
            const played = playScoredDay({
              resources,
              contractId,
              week: { ...openWeek(contractId), day, dayIdx: (day - 1) % 7 },
              seed,
              policy,
            });
            const head = [contractId, String(day), played.wrinkle, String(n), policy.id, played.status];
            rows.push(
              [
                'day',
                ...head,
                played.cleared ? 'C' : 'm',
                played.failing.join(','),
                String(played.calls.length),
                String(played.calls.filter(callFlips).length),
                String(played.calls.filter(callCouldLose).length),
                String(played.calls.filter(callCouldSave).length),
                played.realS.toFixed(1),
                '',
                '',
                '',
                '',
                '',
              ].join('\t'),
            );
            for (const call of played.calls) {
              rows.push(
                [
                  'call',
                  ...head,
                  played.cleared ? 'C' : 'm',
                  '',
                  '',
                  callFlips(call) ? '1' : '0',
                  callCouldLose(call) ? '1' : '0',
                  callCouldSave(call) ? '1' : '0',
                  '',
                  String(Math.round(call.atS)),
                  call.question,
                  call.answer,
                  Object.entries(call.counts)
                    .map(([answer, count]) => `${answer}=${String(count)}`)
                    .join(','),
                  Object.entries(call.clears)
                    .map(([answer, cleared]) => `${answer}=${cleared ? 'C' : 'm'}`)
                    .join(','),
                ].join('\t'),
              );
            }
            if (out !== undefined) writeFileSync(out, `${rows.join('\n')}\n`);
          }
        }
      }
    }
    expect(rows.length).toBeGreaterThan(1);
  });
});
