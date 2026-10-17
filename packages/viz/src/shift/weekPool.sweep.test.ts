/**
 * **The week pool's census: which crowds a counted day may be dealt** — wave AP, lane DT-1, swarm
 * DT's ruling Q1 and Q2 ([§ D1459](../../../../DECISIONS.md) to [§ D1462](../../../../DECISIONS.md)).
 *
 * ## What it runs
 *
 * For every cell a tower deals from week 2 (`weekPool.ts#poolCellsOf`: each weekday of each dealt
 * level, a booked and an unbooked weekday being two cells and a weekday two levels deal alike being
 * one), on each of the pool's crowds (`weekPool.ts#poolCrowdSeedOf`), the day exactly as a player is
 * dealt it (`everyday/sittingBot.test-helper.ts`'s path: Today's scenario at that week, day and
 * weekday), graded with the day's own goals:
 *
 * 1. **The two banded drivers left alone** (`weekDominance.ts#bandedProfilesOf`), nothing pressed.
 *    Either clears: the crowd is **live**.
 * 2. Otherwise **every raised call's answers under each banded driver**, played through the shipped
 *    call session on the player's line (*leave* at every call, so the line is the driver left
 *    alone): `playScoredDay` runs each answer at each raised call with every press before it and
 *    nothing after.
 * 3. Then **the other eleven drivers left alone**. Any of them or any answer clears: **need**; none:
 *    **dead**.
 * 4. Last, a second pass (`fill`) runs the eleven on every live crowd, so the brief's count of the
 *    thirteen is known on every crowd. A crowd the pass has not reached keeps `-` marks and its
 *    count is not drawn.
 *
 * ## What it writes, and how it resumes
 *
 * One JSON line per (pass, cell, crowd) to `WEEK_POOL_OUT`, appended as each finishes. That file is
 * the checkpoint: on start every line already in it is read and its (pass, cell, crowd) skipped, so
 * a killed run resumes where it stopped. `scripts/` is not where the file is assembled:
 * `WEEK_POOL_ASSEMBLE=<path>` folds the lines into `data/week-pool.json`'s shape and writes it.
 *
 * ## The nightly re-tag
 *
 * `WEEK_POOL_VERIFY=<n>` re-runs `n` pinned crowds, chosen by the run's date, through steps 1 to 3
 * (and the fill pass for live crowds) and requires every measured mark, call and tag to be the
 * pinned one. A tag that moved means the day under the pool moved, and the remedy is a census
 * re-run, never an edit to the file (`.github/workflows/deep-tiers.yml`'s `week-pool`).
 *
 * `WEEK_POOL_CELLS` (cell keys, `;`-separated), `WEEK_POOL_CROWDS` (indexes) and `WEEK_POOL_PASS`
 * (`tags` or `fill`) narrow a hand run.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { shiftGoalsOf } from '../dev/leftRail.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { failingGoalsOf, playScoredDay } from '../everyday/sittingBot.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { contractBuildings, todaysScenarioDayState } from './contractDay.test-helper.js';
import { shiftObservationsOf } from './observations.js';
import { openWeek } from './week.js';
import {
  poolCellsOf,
  poolCrowdSeedOf,
  POOL_CENSUS,
  WEEK_POOL,
  type PoolCall,
  type PoolCell,
  type PoolCrowd,
  type PoolTag,
} from './weekPool.js';

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
};

const resources = contractBuildings();

/** One driver left alone on one cell's crowd: `true` cleared, and the goals it missed. */
function aloneOf(cell: PoolCell, seed: bigint, dispatcherId: string): { readonly cleared: boolean; readonly failing: readonly string[] } {
  const { state } = todaysScenarioDayState(resources, cell.contractId, {
    seed,
    dispatcherId,
    over: { week: { ...openWeek(cell.contractId), week: cell.week, day: cell.day, dayIdx: cell.day - 1 }, campaignEventId: undefined },
  });
  const goals = shiftGoalsOf(state, resources);
  const plan = shiftRunConfigOf(resources, state);
  const recording = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
  const failing = failingGoalsOf(goals, shiftObservationsOf(observationsAt(recording, recording.endedAt)));
  return { cleared: failing.length === 0, failing };
}

/** Every raised call under one banded driver on the player's line, with the answers whose run cleared. */
function callsOf(cell: PoolCell, seed: bigint, briefDriver: string): { readonly calls: readonly PoolCall[]; readonly cleared: boolean; readonly status: string } {
  const played = playScoredDay({
    resources,
    contractId: cell.contractId,
    week: { ...openWeek(cell.contractId), week: cell.week, day: cell.day, dayIdx: cell.day - 1 },
    seed,
    policy: { id: `pool-${briefDriver}`, briefDriver, placement: 'leave', driver: 'leave' },
  });
  const calls: PoolCall[] = [];
  for (const call of played.calls) {
    if (call.question === 'pinned') continue;
    const clears: string[] = [];
    for (const [answer, cleared] of Object.entries(call.clears)) {
      if (cleared !== true || answer === 'leave') continue;
      if (answer === 'driver-a' && call.pair !== undefined) clears.push(call.pair[0]);
      else if (answer === 'driver-b' && call.pair !== undefined) clears.push(call.pair[1]);
      else clears.push(answer);
    }
    calls.push({
      by: briefDriver,
      atS: Math.round(call.atS),
      question: call.question,
      ...(call.pair === undefined ? {} : { offered: [call.pair[0], call.pair[1]] }),
      clears: clears.sort(),
    });
  }
  return { calls, cleared: played.cleared, status: played.status };
}

interface Line {
  readonly pass: 'tags' | 'fill';
  readonly cell: string;
  readonly crowd: number;
  readonly seed: string;
  readonly alone: Readonly<Record<string, 'C' | 'm'>>;
  readonly failing?: Readonly<Record<string, string>>;
  readonly calls?: readonly PoolCall[];
  readonly status?: Readonly<Record<string, string>>;
  readonly tag?: PoolTag;
  readonly seconds: number;
}

/** Steps 1 to 3 on one crowd. */
function tagLine(cell: PoolCell, crowd: number): Line {
  const started = performance.now();
  const seed = poolCrowdSeedOf(cell, crowd);
  const alone: Record<string, 'C' | 'm'> = {};
  const failing: Record<string, string> = {};
  const status: Record<string, string> = {};
  const banded = cell.banded;
  for (const id of banded) {
    const verdict = aloneOf(cell, seed, id);
    alone[id] = verdict.cleared ? 'C' : 'm';
    failing[id] = verdict.failing.join('+');
  }
  let tag: PoolTag = 'live';
  let calls: PoolCall[] | undefined;
  if (banded.every((id) => alone[id] === 'm')) {
    calls = [];
    for (const id of banded) {
      const played = callsOf(cell, seed, id);
      status[id] = played.status;
      if (played.cleared) throw new Error(`${cell.key} crowd ${String(crowd)}: ${id} left alone missed and its line cleared`);
      calls.push(...played.calls);
    }
    for (const id of WEEK_POOL.protocol.profiles) {
      if (banded.includes(id)) continue;
      const verdict = aloneOf(cell, seed, id);
      alone[id] = verdict.cleared ? 'C' : 'm';
      failing[id] = verdict.failing.join('+');
    }
    const anyDriver = Object.values(alone).includes('C');
    const anyAnswer = calls.some((call) => call.clears.length > 0);
    tag = anyDriver || anyAnswer ? 'need' : 'dead';
  }
  return {
    pass: 'tags',
    cell: cell.key,
    crowd,
    seed: seed.toString(),
    alone,
    failing,
    ...(calls === undefined ? {} : { calls, status }),
    tag,
    seconds: (performance.now() - started) / 1000,
  };
}

/** Step 4 on one live crowd: the drivers the tag pass did not run. */
function fillLine(cell: PoolCell, crowd: number, done: Readonly<Record<string, 'C' | 'm'>>): Line {
  const started = performance.now();
  const seed = poolCrowdSeedOf(cell, crowd);
  const alone: Record<string, 'C' | 'm'> = {};
  const failing: Record<string, string> = {};
  for (const id of WEEK_POOL.protocol.profiles) {
    if (done[id] !== undefined) continue;
    const verdict = aloneOf(cell, seed, id);
    alone[id] = verdict.cleared ? 'C' : 'm';
    failing[id] = verdict.failing.join('+');
  }
  return { pass: 'fill', cell: cell.key, crowd, seed: seed.toString(), alone, failing, seconds: (performance.now() - started) / 1000 };
}

function readLines(path: string): Line[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((text) => text.trim() !== '')
    .map((text) => JSON.parse(text) as Line);
}

/** The lines folded into one crowd each, in the pool file's shape. */
function crowdsOf(cell: PoolCell, lines: readonly Line[]): (PoolCrowd | undefined)[] {
  const profiles = WEEK_POOL.protocol.profiles;
  return Array.from({ length: WEEK_POOL.protocol.crowdCount }, (_, crowd) => {
    const tagged = lines.find((line) => line.pass === 'tags' && line.cell === cell.key && line.crowd === crowd);
    if (tagged?.tag === undefined) return undefined;
    const filled = lines.find((line) => line.pass === 'fill' && line.cell === cell.key && line.crowd === crowd);
    const marks = { ...tagged.alone, ...(filled?.alone ?? {}) };
    return {
      seed: tagged.seed,
      tag: tagged.tag,
      alone: profiles.map((id) => marks[id] ?? '-').join(''),
      calls: tagged.calls ?? [],
    };
  });
}

/** The crowds up to the first one not yet measured. */
function measuredPrefixOf(crowds: readonly (PoolCrowd | undefined)[]): readonly PoolCrowd[] {
  const out: PoolCrowd[] = [];
  for (const crowd of crowds) {
    if (crowd === undefined) break;
    out.push(crowd);
  }
  return out;
}

describe.runIf(env('WEEK_POOL_SWEEP') === '1')('the week pool’s census', () => {
  /* Every cell at its authored week, whatever the pool admits today (`weekPool.ts#POOL_CENSUS`). */
  beforeAll(() => {
    POOL_CENSUS.measuring = true;
  });
  afterAll(() => {
    POOL_CENSUS.measuring = false;
  });
  it('tags every crowd of every cell dealt from week 2, resuming from its own lines', () => {
    const cells = poolCellsOf(WEEK_POOL.protocol.contractId).filter(
      (cell) => env('WEEK_POOL_CELLS') === undefined || env('WEEK_POOL_CELLS')!.split(';').includes(cell.key),
    );
    const crowds = env('WEEK_POOL_CROWDS')?.split(',').map(Number) ?? Array.from({ length: WEEK_POOL.protocol.crowdCount }, (_, i) => i);

    const assemble = env('WEEK_POOL_ASSEMBLE');
    const out = env('WEEK_POOL_OUT');
    const verify = env('WEEK_POOL_VERIFY');

    if (verify !== undefined) {
      /* The nightly sample: crowds rotate with the date, so every pinned crowd is re-run in turn. */
      const n = Number(verify);
      const day = Math.floor(Date.now() / 86_400_000);
      const all = WEEK_POOL.cells.flatMap((stored) => stored.crowds.map((_, crowd) => ({ stored, crowd })));
      const sample = Array.from({ length: Math.min(n, all.length) }, (_, i) => all[(day * 7919 + i * 104_729) % all.length]!);
      const moved: string[] = [];
      for (const { stored, crowd } of sample) {
        const cell = poolCellsOf(WEEK_POOL.protocol.contractId).find((entry) => entry.key === stored.key);
        const pinned = stored.crowds[crowd];
        if (cell === undefined || pinned === undefined) {
          moved.push(`${stored.key} is no longer a cell the tower deals`);
          continue;
        }
        const tagged = tagLine(cell, crowd);
        const filled = pinned.tag === 'live' && pinned.alone.includes('-') === false ? fillLine(cell, crowd, tagged.alone) : undefined;
        const [measured] = crowdsOf(cell, [tagged, ...(filled === undefined ? [] : [filled])]).slice(crowd, crowd + 1);
        const want = pinned.tag === 'live' && measured !== undefined
          ? { ...measured, alone: [...measured.alone].map((mark, i) => (pinned.alone[i] === '-' ? '-' : mark)).join('') }
          : measured;
        if (JSON.stringify(want) !== JSON.stringify(pinned)) {
          moved.push(`${stored.key} crowd ${String(crowd)}: pinned ${JSON.stringify(pinned)}, measured ${JSON.stringify(want)}`);
        }
      }
      if (out !== undefined) writeFileSync(out, `${sample.length} crowds re-run\n${moved.join('\n')}\n`);
      expect(moved, moved.join('\n')).toEqual([]);
      return;
    }

    expect(out, 'WEEK_POOL_OUT names the checkpoint file the lines are appended to').toBeTypeOf('string');
    const path = String(out);
    const done = new Set(readLines(path).map((line) => `${line.pass}|${line.cell}|${String(line.crowd)}`));
    const pass = env('WEEK_POOL_PASS');
    if (pass === undefined || pass === 'tags') {
      for (const cell of cells) {
        for (const crowd of crowds) {
          if (done.has(`tags|${cell.key}|${String(crowd)}`)) continue;
          appendFileSync(path, `${JSON.stringify(tagLine(cell, crowd))}\n`);
        }
      }
    }
    if (pass === undefined || pass === 'fill') {
      const lines = readLines(path);
      for (const cell of cells) {
        for (const crowd of crowds) {
          if (done.has(`fill|${cell.key}|${String(crowd)}`)) continue;
          const tagged = lines.find((line) => line.pass === 'tags' && line.cell === cell.key && line.crowd === crowd);
          if (tagged?.tag !== 'live') continue;
          appendFileSync(path, `${JSON.stringify(fillLine(cell, crowd, tagged.alone))}\n`);
        }
      }
    }
    if (assemble !== undefined) {
      const lines = readLines(path);
      const document = {
        version: 1,
        protocol: WEEK_POOL.protocol,
        cells: poolCellsOf(WEEK_POOL.protocol.contractId).map((cell) => ({
          key: cell.key,
          orderId: cell.orderId,
          day: cell.day,
          eventId: cell.eventId,
          bookings: cell.bookings,
          banded: cell.banded,
          /* The measured prefix only, so a crowd's place in the list is its index. */
          crowds: measuredPrefixOf(crowdsOf(cell, lines)),
        })),
      };
      writeFileSync(assemble, `${JSON.stringify(document, null, 2)}\n`);
    }
    expect(true).toBe(true);
  });
});
