/**
 * **One case's route census, measured** — the arithmetic `routeCensus.test.ts` (always-on, for the
 * rows that open a case) and `routeCensus.sweep.test.ts` (deep, for every row) share, so the two
 * cannot count differently. [§ D1120](../../../../DECISIONS.md) clause 1.
 *
 * Every role-blind route `routes.test-helper.ts#routesFor` builds is pressed through the gate the
 * product presses: the letter's as-built run once, the route's after-run, the surfaces' own crowd
 * check (GitHub issue #350; a pair it refuses is a route and not a clear), then `classifyOutcome`
 * against § 9's two bars. Only the gate — never the fifty mornings — because the gate is what the
 * census counts (`fixit/routeCensus.ts` says why).
 */

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { classifyOutcome, emptyFixitState, spendOf } from './engine.js';
import type { RouteCensusRow } from './routeCensus.js';
import { routesFor } from './routes.test-helper.js';
import { assertPairMatchesRepairs, FIXIT_RUN_SWITCHES, fixitRunPlanOf, measuredOf, type FixitResources } from './run.js';
import type { FixitCase } from './types.js';

export interface MeasuredCensus extends RouteCensusRow {
  /** The labels of the routes that cleared, in the order tried — for a failure message. */
  readonly clearingLabels: readonly string[];
}

export function measureRouteCensus(entry: FixitCase, resources: FixitResources): MeasuredCensus {
  const schedule = shippedPriceSchedule();
  const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
  const before = recordRun(asBuilt, FIXIT_RUN_SWITCHES).recording;
  const routes = routesFor(entry, asBuilt, resources);
  const clearingLabels: string[] = [];
  for (const route of routes) {
    const after = recordRun(fixitRunPlanOf(entry, route.state, resources).asRepaired, FIXIT_RUN_SWITCHES).recording;
    try {
      assertPairMatchesRepairs(entry, route.state, before, after);
    } catch {
      continue;
    }
    const gate = classifyOutcome(entry, measuredOf(entry, before, after), spendOf(entry, route.state, schedule));
    if (gate.kind === 'fixed') clearingLabels.push(route.label);
  }
  return { routes: routes.length, clearing: clearingLabels.length, clearingLabels };
}
