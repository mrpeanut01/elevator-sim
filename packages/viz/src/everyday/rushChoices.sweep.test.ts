/**
 * **Do Rush's in-round choices ever help?** — [§ D1588](../../../../DECISIONS.md), GitHub issue
 * #635 item 1 and the owner's decision panel on #636, which asked for this measurement before ruling
 * on the chip set (R5).
 *
 * A playtest pressed each chip once at 0:10 on Midtown under Conventional collective and saw both
 * rounds end sooner than doing nothing (24:54 and 25:36 against 27:20). One run an arm orders
 * nothing, so this file runs the comparison paired.
 *
 * ## What it runs
 *
 * `midtown-office` under `collective` (the house run), through `rushHouse.test-helper.ts`'s player
 * path: `withBuilding` → `withDispatcher` → `rush.ts#rushPatchOf` → `shiftRunConfigOf` →
 * `recordRun`. The rush ships **one** seed (`RUSH_STREAM.seed`, § D515), so a player only ever meets
 * that crowd; to ask whether a chip helps on a rush crowd rather than on that one crowd, the seed is
 * replaced by `RUSH_STREAM.seed + n` for `n` below `RUSH_CHOICES_SEEDS` (default 50). `n = 0` is
 * the shipped crowd and is reported on its own as well. Every arm of one seed meets the identical
 * crowd (common random numbers), so each difference is paired.
 *
 * Arms, each a press appended to `state.interventions` at `atS` exactly as `EverydayHost.intervene`
 * does from the stage's playhead:
 *
 * - **none**: the house run.
 * - **spread@0:10**, **park@0:10**: `spread-cars` / `park-cars-lobby` at `startedAt + 10`.
 * - **spread@late**, **park@late**: the same, pressed at the first 2 s bucket of the *do-nothing*
 *   run at which somebody standing has waited a minute or more (the moment the player can first see
 *   a rider in the third band). The prefix before a press is identical by construction, so that
 *   moment is the same in every arm.
 * - **switch→X@0:10**: `adopt-dispatcher` to every shipped profile the stage would let a collective
 *   rush hand over to (`live/interventions.ts#switchRefusalOf` passes it), at `startedAt + 10`.
 *
 * ## The outcome
 *
 * Survival is `everyday/rush.ts#rushHoldAt` minus `startedAt` (core's `rushHoldAtLegs`, the reader
 * the stage stops on), and the wave reached is `rushOutcomeOf(recording, undefined).wave`, the
 * figure the result page shows. A run that never crosses the line is **censored** at its last bucket
 * and flagged; a paired mean over a censored run is a bound, not an estimate. Every rush run is
 * saturated by design (the stream climbs until the line breaks), so `awtIsValid` is false on every
 * arm and the waiting-time mean is suppressed as the repository requires; survival is a time to an
 * event, not that mean, and is what the round is scored on.
 *
 * Paired-t 95 % on survival(arm) − survival(none), `experiments`' `pairedDifferenceEstimate`, the
 * one method `CLAUDE.md` permits for ordering two arms. BETTER / WORSE only when the interval
 * excludes zero.
 *
 * Gated on `RUSH_CHOICES_SWEEP=1` and written to `RUSH_CHOICES_OUT` (vitest swallows
 * `console.log`). Not scheduled: it is a compute job behind a decision, not a check. Run it with
 * `--testTimeout` on the command line so `testCost.test.ts`'s census does not move:
 *
 * ```
 * RUSH_CHOICES_SWEEP=1 RUSH_CHOICES_OUT=/tmp/rush-choices.json \
 *   npx vitest run --project viz --testTimeout=7200000 src/everyday/rushChoices.sweep.test.ts
 * ```
 */

import { writeFileSync } from 'node:fs';

import { rushWavesOutlasted, type RunInterventionConfig } from '@elevator-sim/core/browser';
import { pairedDifferenceEstimate } from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { initialState, profileById, shiftRunConfigOf, withBuilding, withDispatcher } from '../dev/state.js';
import { switchRefusalOf } from '../live/interventions.js';
import { recordRun } from '../record/recordRun.js';

import { RUSH_SEED, rushHoldAt, rushOutcomeOf, rushPatchOf } from './rush.js';
import { loadRushHouseResources } from './rushHouse.test-helper.js';
import { RUSH_STREAM } from './rushScreenModel.js';

const OPEN = process.env['RUSH_CHOICES_SWEEP'] === '1';
const SEEDS = Number(process.env['RUSH_CHOICES_SEEDS'] ?? '50');
const BUILDING = process.env['RUSH_CHOICES_BUILDING'] ?? 'midtown-office';
const DISPATCHER = process.env['RUSH_CHOICES_DISPATCHER'] ?? 'collective';
const EARLY_S = 10;
const LATE_WAIT_S = 60;

type Change = RunInterventionConfig['change'];

interface Reading {
  readonly survivalS: number;
  readonly censored: boolean;
  readonly wave: number;
  readonly outlasted: number;
  readonly awtIsValid: boolean;
  readonly saturation: string | null;
}

/** The first bucket at which somebody standing has waited `overS` or more. */
function firstWaitOverAt(recording: VizRecording, overS: number): number | undefined {
  for (let t = recording.startedAt; t <= recording.endedAt; t += RUSH_STREAM.bucketS) {
    for (const leg of recording.legs) {
      if (leg.arrivedAt > t || t - leg.arrivedAt < overS) continue;
      if (leg.refusedAt !== undefined && leg.refusedAt <= t) continue;
      if (leg.boardedAt !== undefined && leg.boardedAt <= t) continue;
      return t;
    }
  }
  return undefined;
}

describe.skipIf(!OPEN)('Rush’s in-round choices against doing nothing — § D1588', () => {
  it('measures every arm paired on one crowd per seed', async () => {
    const resources = await loadRushHouseResources();
    const standing = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, BUILDING), resources, DISPATCHER);
    const patch = rushPatchOf(resources, standing);
    if (patch === undefined) throw new Error(`no shipped building "${BUILDING}"`);
    const driving = profileById(resources, [], DISPATCHER);
    const switchTargets = resources.dispatcherProfiles.profiles.filter(
      (target) => target.id !== DISPATCHER && switchRefusalOf(target, driving) === undefined,
    );

    const run = (seed: bigint, interventions: readonly RunInterventionConfig[]): { recording: VizRecording; reading: Reading } => {
      const state = { ...standing, ...patch, seed, interventions };
      const plan = shiftRunConfigOf(resources, state);
      const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
      const holdAt = rushHoldAt(recording);
      const outcome = rushOutcomeOf(recording, undefined);
      return {
        recording,
        reading: {
          survivalS: (holdAt ?? recording.endedAt) - recording.startedAt,
          censored: holdAt === undefined,
          wave: outcome.wave,
          outlasted: rushWavesOutlasted(holdAt, recording.startedAt),
          awtIsValid: recording.summary.awtIsValid,
          saturation: recording.summary.saturation?.verdict ?? null,
        },
      };
    };

    const arms: { id: string; at: 'early' | 'late'; change: Change }[] = [
      { id: 'spread@0:10', at: 'early', change: { kind: 'spread-cars' } },
      { id: 'park@0:10', at: 'early', change: { kind: 'park-cars-lobby' } },
      { id: 'spread@late', at: 'late', change: { kind: 'spread-cars' } },
      { id: 'park@late', at: 'late', change: { kind: 'park-cars-lobby' } },
      ...switchTargets.map((target) => ({
        id: `switch→${target.id}@0:10`,
        at: 'early' as const,
        change: { kind: 'adopt-dispatcher' as const, profile: target },
      })),
    ];

    const seeds = Array.from({ length: SEEDS }, (_, n) => BigInt(RUSH_STREAM.seed) + BigInt(n));
    const none: Reading[] = [];
    const lateAt: (number | null)[] = [];
    const byArm = new Map<string, Reading[]>(arms.map((arm) => [arm.id, []]));
    const started = Date.now();

    for (const seed of seeds) {
      const base = run(seed, []);
      none.push(base.reading);
      const late = firstWaitOverAt(base.recording, LATE_WAIT_S);
      lateAt.push(late === undefined ? null : late - base.recording.startedAt);
      for (const arm of arms) {
        const atS = arm.at === 'early' ? base.recording.startedAt + EARLY_S : (late ?? base.recording.startedAt + EARLY_S);
        byArm.get(arm.id)?.push(run(seed, [{ atS, change: arm.change }]).reading);
      }
      process.stderr.write(`seed ${String(seed)}: none ${String(base.reading.survivalS)} s, late press at ${String(lateAt.at(-1))} s\n`);
    }

    const baseline = none.map((reading) => reading.survivalS);
    const rows = arms.map((arm) => {
      const readings = byArm.get(arm.id) ?? [];
      const values = readings.map((reading) => reading.survivalS);
      const estimate = pairedDifferenceEstimate(values, baseline, { confidence: 0.95 });
      const waves = pairedDifferenceEstimate(
        readings.map((reading) => reading.wave),
        none.map((reading) => reading.wave),
        { confidence: 0.95 },
      );
      const verdict = estimate.lower > 0 ? 'BETTER' : estimate.upper < 0 ? 'WORSE' : 'INDISTINGUISHABLE';
      return {
        arm: arm.id,
        n: values.length,
        meanSurvivalS: values.reduce((a, b) => a + b, 0) / values.length,
        deltaSurvivalS: { mean: estimate.mean, lower: estimate.lower, upper: estimate.upper },
        deltaWave: { mean: waves.mean, lower: waves.lower, upper: waves.upper },
        verdict,
        better: values.filter((value, i) => value > (baseline[i] as number)).length,
        same: values.filter((value, i) => value === baseline[i]).length,
        worse: values.filter((value, i) => value < (baseline[i] as number)).length,
        censored: readings.filter((reading) => reading.censored).length,
        awtValid: readings.filter((reading) => reading.awtIsValid).length,
        shippedSeed: readings[0],
      };
    });

    const out = {
      building: BUILDING,
      dispatcher: DISPATCHER,
      seeds: { first: String(seeds[0]), count: seeds.length, rule: 'RUSH_STREAM.seed + n, n = 0 … count − 1' },
      seconds: (Date.now() - started) / 1000,
      none: {
        meanSurvivalS: baseline.reduce((a, b) => a + b, 0) / baseline.length,
        censored: none.filter((reading) => reading.censored).length,
        awtValid: none.filter((reading) => reading.awtIsValid).length,
        shippedSeed: none[0],
      },
      latePressAtS: lateAt,
      rows,
      perSeed: seeds.map((seed, i) => ({
        seed: String(seed),
        none: none[i]?.survivalS,
        ...Object.fromEntries(arms.map((arm) => [arm.id, byArm.get(arm.id)?.[i]?.survivalS])),
      })),
    };
    const path = process.env['RUSH_CHOICES_OUT'];
    if (path !== undefined) writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);

    /* Non-vacuity: every arm ran on every seed, and the parking presses moved somebody's run. */
    for (const row of rows) expect(row.n).toBe(SEEDS);
    expect(rows.some((row) => row.same < row.n)).toBe(true);
  });
});
