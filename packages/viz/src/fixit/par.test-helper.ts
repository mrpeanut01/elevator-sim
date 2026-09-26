/**
 * **One fix case's par, measured** — the cheapest change the route census tried whose order is
 * *fixed* on the forty-nine derived mornings, not only on the letter's morning.
 * [§ D1184](../../../../DECISIONS.md); pinned as `fixit/par.ts#FIXIT_PAR`.
 *
 * The census (`routeCensus.test-helper.ts`) finds the routes that clear the gate and prices each at
 * the schedule's own figures (`engine.ts#spendOf`, the figure the spent row charges). This takes
 * them cheapest first and puts each through the judge a press goes through — the forty-nine derived
 * mornings against the shipped as-built forty-nine, with the same futility looks
 * (`judge.ts#futileAt` at `FUTILITY_LOOKS`, then `judgeReplication`) — and stops at the first that
 * holds. Its price is the par: nothing cheaper among the routes tried holds, and a route at that
 * price does. A case where no clearing route holds has a par of `null`, and the screen draws none.
 *
 * It is a minimum over a **sample** of what a player can do, which is why the screen says *the
 * cheapest change we tried* and never *the cheapest change*.
 */

import { recordRun } from '../record/recordRun.js';

import { shippedAsBuiltMorningsOf } from './asBuiltMornings.js';
import { emptyFixitState } from './engine.js';
import { FUTILITY_LOOKS, futileAt, judgeReplication, morningConfigsOf, replicationSeedsOf } from './judge.js';
import type { ClearingRoute } from './routeCensus.test-helper.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf, morningReadingOf, type FixitResources, type MorningReading } from './run.js';
import type { FixitCase } from './types.js';

export interface MeasuredPar {
  /** The par in units, or `null` where no clearing route held on the forty-nine mornings. */
  readonly units: number | null;
  /** The route that set it — for a failure message and the pinned table's comment. */
  readonly label: string | null;
  /** How many clearing routes were judged on the forty-nine mornings before one held. */
  readonly judged: number;
}

function morningsOf(entry: FixitCase, config: ReturnType<typeof fixitRunPlanOf>['asBuilt'], seeds: readonly bigint[]): MorningReading[] {
  return morningConfigsOf(config, seeds).map((morning) =>
    morningReadingOf(recordRun(morning, FIXIT_RUN_SWITCHES).recording, entry.complaint.measure),
  );
}

export function measureFixitPar(entry: FixitCase, resources: FixitResources, clearing: readonly ClearingRoute[]): MeasuredPar {
  const seeds = replicationSeedsOf(entry);
  const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
  const before = shippedAsBuiltMorningsOf(entry, asBuilt) ?? morningsOf(entry, asBuilt, seeds);
  /* Cheapest first; the census's own order breaks a tie, so the route named is reproducible. */
  const ordered = clearing.map((route, index) => ({ route, index })).sort((a, b) => a.route.units - b.route.units || a.index - b.index);
  let judged = 0;
  for (const { route } of ordered) {
    judged += 1;
    const repaired = fixitRunPlanOf(entry, route.state, resources).asRepaired;
    /* Morning by morning, taking the futility looks where the judge takes them. */
    const after: MorningReading[] = [];
    let stopped = false;
    for (const [index, config] of morningConfigsOf(repaired, seeds).entries()) {
      after.push(morningReadingOf(recordRun(config, FIXIT_RUN_SWITCHES).recording, entry.complaint.measure));
      const look = index + 1;
      if (FUTILITY_LOOKS.includes(look) && look < seeds.length && futileAt(before, after, look)) {
        stopped = true;
        break;
      }
    }
    if (stopped) continue;
    if (judgeReplication(before, after).holds) return { units: route.units, label: route.label, judged };
  }
  return { units: null, label: null, judged };
}
