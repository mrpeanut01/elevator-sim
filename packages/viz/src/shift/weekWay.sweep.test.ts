/**
 * **The week census** — `docs/33` DC-10's instrument, [§ D1067](../../../../DECISIONS.md).
 *
 * ## What it measures
 *
 * For each (contract, day of the week), on the horizon `data/week-way.json`'s protocol names, run
 * through `dev/state.ts#shiftRunConfigOf` — the day a player is handed, rung and growth included —
 * and graded by `goalsForDay(day, horizon)`, where any goal not `met` is a miss
 * (`shift/week.ts#outcomeOf`'s rule, *unjudged is not passed*):
 *
 * 1. **Tuning.** Every configuration — each shipped dispatcher, with no press or with one of the
 *    protocol's parking presses at one of its fractions of the day — meets the first
 *    `screenCount` tuning crowds. The best `finalists` by clears (then by the lower summed worst
 *    wait, then in profile order) meet the rest. The configuration with the most tuning clears is
 *    **chosen**, on the same ordering. The standing order with no press meets every tuning crowd
 *    whether or not it survives the screen.
 * 2. **Held out.** The chosen configuration and the standing order each meet every held-out
 *    crowd, once. Those two verdict strings are the row; `shift/weekWay.ts#dc10Of` reads them.
 *
 * Every configuration in a round meets the same crowd (common random numbers), and no held-out
 * crowd is seen before the choice is made — `CLAUDE.md`'s tuning discipline, which is why the
 * choice is not simply the best of 65 on each crowd.
 *
 * ## Modes
 *
 * - `WEEK_WAY_STAGE=screen` runs the tuning half only and writes the chosen configuration's tuning
 *   clears and the standing order's. That is how a growth slope is searched **without touching a
 *   held-out crowd**: `WEEK_WAY_GROWTH` overrides the measured contracts' slope for the run, and
 *   the held-out half is run once, at the slope the search settled on.
 * - `WEEK_WAY_STAGE=full` (the default) runs both halves and writes one `data/week-way.json` row
 *   per (contract, day) as JSON lines, with the run count and seconds beside it.
 * - `WEEK_WAY_STAGE=profiles` is **the one-profile screen** (`docs/33` DC-11, wave AN lane DQ-2,
 *   § D1343): every shipped profile, nothing pressed, once on every held-out crowd of each named
 *   cell, one JSON line per cell with a verdict string per profile. With `WEEK_WAY_CELLS` naming an
 *   authored order's five days, its lines are that order's `data/week-dominance.json` row.
 *   `WEEK_WAY_PROFILES` narrows the profiles for a screen by hand.
 * - `WEEK_WAY_EVENTS=scheduled` measures each day under the wrinkle the week draws for it
 *   (`shift/calendar.ts#scheduledEventFor`) instead of the ordinary day. **That is the re-run owed
 *   once wave AJ's wrinkle episodes land**: the shipped rows are the unwrinkled weekday.
 *
 * - `WEEK_WAY_CELLS=2=goods-inward;3=evacuation-drill:all-at-once` measures named (day, wrinkle)
 *   cells instead of `WEEK_WAY_DAYS`: each day runs exactly the drawn id after its `=`. That is how
 *   an authored week order (`data/contract-ladder.json`'s `weekOrders`, lane AM-D, § D1252) is
 *   measured, one row per day of the order, before the census admits it.
 * - `WEEK_WAY_BOOKINGS='[{"kind":"maintenance","bankId":"main","carId":"C","fromFraction":0,"toFraction":0.4}]'`
 *   runs every named cell with those cars out of passenger service beside the rung's own, and writes
 *   them on each line as `bookings`: a week level's booked day (wave AO lane DS-1, § D1400, § D1401),
 *   measured for both DC-10's row and the one-profile screen before the level is dealt.
 *
 * `WEEK_WAY_CONTRACTS`, `WEEK_WAY_DAYS` and `WEEK_WAY_OUT` name the cells and the file. It writes a
 * file because vitest intercepts `console.log` (`pressLadder.sweep.test.ts` records the trap).
 *
 * ## What it is not
 *
 * It ranks no dispatcher over another and publishes no interval about one. The only proportion it
 * produces is a day's clear rate under one configuration chosen before the crowds it is measured
 * on, which is the claim DC-10 makes.
 *
 * No timeout annotation: it is run by hand with `--testTimeout`, `PRESS_LADDER_VERIFY`'s reason.
 */

import { appendFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../data/contract-ladder.json', async (importOriginal) => {
  /*
   * The growth search's override, and nothing else: with `WEEK_WAY_GROWTH` unset the ladder is the
   * shipped file untouched. Set, the measured contracts' rungs grow at that slope for this process,
   * so the search runs the product's own chain rather than a copy of the growth arithmetic.
   */
  const original = (await importOriginal()) as { default: Record<string, unknown> };
  const slope = process.env['WEEK_WAY_GROWTH'];
  if (slope === undefined) return original;
  const only = (process.env['WEEK_WAY_CONTRACTS'] ?? '').split(',');
  const doc = original.default;
  const rows = (doc['contracts'] as Record<string, unknown>[]).map((row) =>
    only.includes(String(row['contractId'])) ? { ...row, growthPerDay: Number(slope) } : row,
  );
  return { default: { ...doc, contracts: rows } };
});

import { scheduledEventFor } from './calendar.js';
import { growthPerDayOf, ladderRowFor, type ContractIncident } from './ladder.js';
import { WEEK_WAY, type WeekWayConfig } from './weekWay.js';
import { crowdSeeds, WEEK_WAY_RESOURCES as resources, weekWayCell as runCell, type WeekWayVerdict as Verdict } from './weekWay.test-helper.js';

function configsOf(): readonly WeekWayConfig[] {
  const out: WeekWayConfig[] = [];
  for (const profile of resources.dispatcherProfiles.profiles) {
    out.push({ dispatcherId: profile.id, press: '', atFraction: 0 });
    for (const press of WEEK_WAY.protocol.pressKinds) {
      for (const atFraction of WEEK_WAY.protocol.pressAtFractions) {
        out.push({ dispatcherId: profile.id, press, atFraction });
      }
    }
  }
  return out;
}

const keyOf = (config: WeekWayConfig): string =>
  `${config.dispatcherId}|${config.press}|${String(config.atFraction)}`;

describe.runIf(process.env['WEEK_WAY_SWEEP'] === '1')('the week census', () => {
  it('writes each (contract, day) cell of DC-10', () => {
    const out = process.env['WEEK_WAY_OUT'];
    expect(out, 'WEEK_WAY_OUT names the file the rows are appended to').toBeTypeOf('string');
    const stageEnv = process.env['WEEK_WAY_STAGE'];
    const stage = stageEnv === 'screen' ? 'screen' : stageEnv === 'profiles' ? 'profiles' : 'full';
    const scheduled = process.env['WEEK_WAY_EVENTS'] === 'scheduled';
    const contracts = (process.env['WEEK_WAY_CONTRACTS'] ?? 'c2').split(',');
    /* `[day, drawn id or undefined]`: a named wrinkle from `WEEK_WAY_CELLS`, or the day as dealt. */
    const named = process.env['WEEK_WAY_CELLS'];
    const cells: readonly (readonly [number, string | undefined])[] =
      named === undefined
        ? (process.env['WEEK_WAY_DAYS'] ?? '1,2,3,4,5').split(',').map((day) => [Number(day), undefined] as const)
        : named.split(';').map((entry) => {
            const [day = '', eventId = ''] = entry.split('=');
            return [Number(day), eventId] as const;
          });
    /*
     * The protocol is the data file's; the four counts may be narrowed for a smoke run or a growth
     * screen, and a row taken that way fails `weekWayIssues`' count check, so it cannot be shipped.
     */
    const env = (name: string, fallback: number): number => Number(process.env[name] ?? String(fallback));
    const p = {
      ...WEEK_WAY.protocol,
      tuningCount: env('WEEK_WAY_TUNING_COUNT', WEEK_WAY.protocol.tuningCount),
      screenCount: env('WEEK_WAY_SCREEN_COUNT', WEEK_WAY.protocol.screenCount),
      finalists: env('WEEK_WAY_FINALISTS', WEEK_WAY.protocol.finalists),
      heldOutCount: env('WEEK_WAY_HELDOUT_COUNT', WEEK_WAY.protocol.heldOutCount),
    };
    const tuningSeeds = crowdSeeds(p.tuningFrom, p.tuningCount);
    const heldOutSeeds = crowdSeeds(p.heldOutFrom, p.heldOutCount);
    const configs = configsOf();
    const standing: WeekWayConfig = { dispatcherId: p.standingOrder, press: '', atFraction: 0 };
    /*
     * **A candidate week level's bookings** — wave AO, lane DS-1 (`shift/weekLevels.ts`, § D1400).
     * `WEEK_WAY_BOOKINGS` is a JSON list of `data/contract-ladder.json` incidents (kind, bankId,
     * carId, fromFraction, toFraction): every named cell runs with those cars out beside the rung's
     * own, through `shiftRunConfigOf`'s week-bookings argument, and each line carries the list as
     * `bookings` so the copied row is matched only to a week that deals exactly them.
     */
    const bookings: readonly ContractIncident[] = JSON.parse(process.env['WEEK_WAY_BOOKINGS'] ?? '[]') as ContractIncident[];
    const runDay = (contractId: string, day: number, seed: bigint, config: WeekWayConfig, scheduledDay: boolean, eventId: string | undefined): Verdict =>
      runCell(contractId, day, seed, config, scheduledDay, eventId, bookings);

    if (stage === 'profiles') {
      /*
       * **The one-profile screen** — wave AN, lane DQ-2 (`shift/weekDominance.ts`): every shipped
       * profile, nothing pressed, once on every held-out crowd of each named cell. No tuning half,
       * because nothing is chosen: the rule reads every profile. `WEEK_WAY_PROFILES` narrows the
       * profiles for a screen by hand, and a line taken that way cannot be shipped, because
       * `weekDominanceIssues` requires every profile.
       */
      const only = process.env['WEEK_WAY_PROFILES']?.split(',');
      const profiles = resources.dispatcherProfiles.profiles
        .map((profile) => profile.id)
        .filter((id) => only === undefined || only.includes(id));
      for (const contractId of contracts) {
        for (const [day, eventId] of cells) {
          const started = performance.now();
          const verdicts: Record<string, string> = {};
          const failing: Record<string, string[]> = {};
          for (const dispatcherId of profiles) {
            let marks = '';
            const reasons: string[] = [];
            for (const seed of heldOutSeeds) {
              const verdict = runDay(contractId, day, seed, { dispatcherId, press: '', atFraction: 0 }, scheduled, eventId);
              marks += verdict.cleared ? 'C' : 'm';
              reasons.push(verdict.failing.join('+'));
            }
            verdicts[dispatcherId] = marks;
            failing[dispatcherId] = reasons;
          }
          appendFileSync(
            String(out),
            `${JSON.stringify({
              stage,
              contractId,
              day,
              eventId: eventId ?? 'ordinary',
              ...(bookings.length === 0 ? {} : { bookings }),
              heldOutFrom: p.heldOutFrom,
              heldOutCount: p.heldOutCount,
              verdicts,
              failing,
              runs: profiles.length * heldOutSeeds.length,
              seconds: (performance.now() - started) / 1000,
            })}\n`,
          );
        }
      }
      return;
    }

    for (const contractId of contracts) {
      const slope = growthPerDayOf(ladderRowFor(contractId));
      for (const [day, eventId] of cells) {
        const started = performance.now();
        let runs = 0;
        const tally = new Map<string, { clears: number; worst: number; n: number }>();
        const cell = (config: WeekWayConfig, seed: bigint): Verdict => {
          runs += 1;
          const verdict = runDay(contractId, day, seed, config, scheduled, eventId);
          const entry = tally.get(keyOf(config)) ?? { clears: 0, worst: 0, n: 0 };
          tally.set(keyOf(config), {
            clears: entry.clears + (verdict.cleared ? 1 : 0),
            worst: entry.worst + verdict.worstWaitS,
            n: entry.n + 1,
          });
          return verdict;
        };
        const rank = (list: readonly WeekWayConfig[]): WeekWayConfig[] =>
          [...list].sort((a, b) => {
            const ta = tally.get(keyOf(a));
            const tb = tally.get(keyOf(b));
            const clears = (tb?.clears ?? 0) - (ta?.clears ?? 0);
            if (clears !== 0) return clears;
            const worst = (ta?.worst ?? 0) - (tb?.worst ?? 0);
            if (worst !== 0) return worst;
            return configs.indexOf(a) - configs.indexOf(b);
          });

        // Tuning: screen every configuration, then the finalists on the rest.
        let queueOnly = 0;
        let screened = 0;
        let lowestPeakQueue = Number.POSITIVE_INFINITY;
        for (const seed of tuningSeeds.slice(0, p.screenCount)) {
          for (const config of configs) {
            const verdict = cell(config, seed);
            screened += 1;
            if (verdict.failing.length === 1 && verdict.failing[0] === 'queue') queueOnly += 1;
            lowestPeakQueue = Math.min(lowestPeakQueue, verdict.peakQueue);
          }
        }
        const finalists = rank(configs).slice(0, p.finalists);
        const rest = [
          ...finalists,
          ...(finalists.some((config) => keyOf(config) === keyOf(standing)) ? [] : [standing]),
        ];
        for (const seed of tuningSeeds.slice(p.screenCount)) {
          for (const config of rest) cell(config, seed);
        }
        const chosen = rank(finalists)[0] ?? standing;
        const chosenTuning = tally.get(keyOf(chosen));
        const standingTuning = tally.get(keyOf(standing));
        const head = {
          contractId,
          day,
          eventId:
            eventId ??
            (scheduled ? scheduledEventFor(null, day, (day - 1) % 7, WEEK_WAY.protocol.horizon).id : 'ordinary'),
          growthPerDay: slope,
          ...(bookings.length === 0 ? {} : { bookings }),
          chosen,
          tuningClears: chosenTuning?.clears ?? 0,
          tuningN: chosenTuning?.n ?? 0,
          standingTuningClears: standingTuning?.clears ?? 0,
          screenQueueOnlyMisses: queueOnly,
          screenRuns: screened,
          screenLowestPeakQueue: lowestPeakQueue,
          finalists: finalists.map((config) => ({ ...config, ...tally.get(keyOf(config)) })),
        };
        if (stage === 'screen') {
          appendFileSync(
            String(out),
            `${JSON.stringify({ stage, ...head, runs, seconds: (performance.now() - started) / 1000 })}\n`,
          );
          continue;
        }

        // Held out: the chosen configuration and the standing order, once each per crowd.
        let chosenVerdicts = '';
        let standingVerdicts = '';
        let queueOnlyMisses = 0;
        const heldOutFailing: string[] = [];
        for (const seed of heldOutSeeds) {
          runs += 1;
          const mine = runDay(contractId, day, seed, chosen, scheduled, eventId);
          chosenVerdicts += mine.cleared ? 'C' : 'm';
          if (mine.failing.length === 1 && mine.failing[0] === 'queue') queueOnlyMisses += 1;
          heldOutFailing.push(mine.failing.join('+'));
          if (keyOf(chosen) === keyOf(standing)) {
            standingVerdicts += mine.cleared ? 'C' : 'm';
          } else {
            runs += 1;
            standingVerdicts += runDay(contractId, day, seed, standing, scheduled, eventId).cleared ? 'C' : 'm';
          }
        }
        appendFileSync(
          String(out),
          `${JSON.stringify({
            stage,
            ...head,
            chosenVerdicts,
            standingVerdicts,
            queueOnlyMisses,
            heldOutFailing,
            runs,
            seconds: (performance.now() - started) / 1000,
          })}\n`,
        );
      }
    }
  });
});
