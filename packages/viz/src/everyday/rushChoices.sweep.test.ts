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
 * - **switch→X@0:10**: one representative handover, `adopt-dispatcher` at `startedAt + 10` to the
 *   target the stage permits (`live/interventions.ts#switchRefusalOf`) whose published house row on
 *   this building holds longest (`data/rush-house-runs.json`), so the arm is fixed before this sweep
 *   reads anything. `RUSH_CHOICES_SWITCHES=all` runs every permitted target instead.
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
 *   npx vitest run --project viz --testTimeout=14400000 packages/viz/src/everyday/rushChoices.sweep.test.ts
 * ```
 *
 * `RUSH_CHOICES_TIMES` (seconds after the open, comma-separated) replaces the arms with every chip
 * and the handover pressed at each of those times, which is how § D1588 reads the press time on the
 * shipped crowd alone (`RUSH_CHOICES_SEEDS=1`).
 *
 * It shards by seed (`RUSH_CHOICES_SEED_FROM`, `RUSH_CHOICES_SEEDS`), and `RUSH_CHOICES_MERGE` (a
 * comma list of shard outputs) runs nothing and writes the paired summary over their union.
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  rushWavesOutlasted,
  type DispatcherProfile,
  type RunInterventionConfig,
} from "@elevator-sim/core/browser";
import { pairedDifferenceEstimate } from "@elevator-sim/experiments/browser";
import { describe, expect, it } from "vitest";

import houseRuns from "../../../../data/rush-house-runs.json" with { type: "json" };

import type { VizRecording } from "../contract/types.js";
import {
  initialState,
  profileById,
  shiftRunConfigOf,
  withBuilding,
  withDispatcher,
} from "../dev/state.js";
import { switchRefusalOf } from "../live/interventions.js";
import { recordRun } from "../record/recordRun.js";

import { RUSH_SEED, rushHoldAt, rushOutcomeOf, rushPatchOf } from "./rush.js";
import { loadRushHouseResources } from "./rushHouse.test-helper.js";
import { RUSH_STREAM } from "./rushScreenModel.js";

const OPEN = process.env["RUSH_CHOICES_SWEEP"] === "1";
const SEEDS = Number(process.env["RUSH_CHOICES_SEEDS"] ?? "50");
const SEED_FROM = Number(process.env["RUSH_CHOICES_SEED_FROM"] ?? "0");
const MERGE = process.env["RUSH_CHOICES_MERGE"];
const BUILDING = process.env["RUSH_CHOICES_BUILDING"] ?? "midtown-office";
const DISPATCHER = process.env["RUSH_CHOICES_DISPATCHER"] ?? "collective";
const EARLY_S = 10;
const LATE_WAIT_S = 60;

type Change = RunInterventionConfig["change"];

interface Reading {
  readonly survivalS: number;
  readonly censored: boolean;
  readonly wave: number;
  readonly outlasted: number;
  readonly awtIsValid: boolean;
  readonly saturation: string | null;
}

interface SeedReadings {
  readonly seed: string;
  readonly latePressAtS: number | null;
  readonly none: Reading;
  readonly arms: Readonly<Record<string, Reading>>;
}

/** The first bucket at which somebody standing has waited `overS` or more. */
function firstWaitOverAt(
  recording: VizRecording,
  overS: number,
): number | undefined {
  for (
    let t = recording.startedAt;
    t <= recording.endedAt;
    t += RUSH_STREAM.bucketS
  ) {
    for (const leg of recording.legs) {
      if (leg.arrivedAt > t || t - leg.arrivedAt < overS) continue;
      if (leg.refusedAt !== undefined && leg.refusedAt <= t) continue;
      if (leg.boardedAt !== undefined && leg.boardedAt <= t) continue;
      return t;
    }
  }
  return undefined;
}

const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

/** Every arm's paired interval against doing nothing, over seeds that each carry every arm. */
function summarise(perSeed: readonly SeedReadings[]): unknown {
  const armIds = Object.keys(perSeed[0]?.arms ?? {});
  const baseline = perSeed.map((seed) => seed.none.survivalS);
  const rows = armIds.map((arm) => {
    const readings = perSeed.map((seed) => {
      const reading = seed.arms[arm];
      if (reading === undefined)
        throw new Error(`seed ${seed.seed} has no ${arm}`);
      return reading;
    });
    const values = readings.map((reading) => reading.survivalS);
    const survival = pairedDifferenceEstimate(values, baseline, {
      confidence: 0.95,
    });
    const waves = pairedDifferenceEstimate(
      readings.map((reading) => reading.wave),
      perSeed.map((seed) => seed.none.wave),
      { confidence: 0.95 },
    );
    return {
      arm,
      n: values.length,
      meanSurvivalS: mean(values),
      deltaSurvivalS: {
        mean: survival.mean,
        lower: survival.lower,
        upper: survival.upper,
      },
      deltaWave: { mean: waves.mean, lower: waves.lower, upper: waves.upper },
      verdict:
        survival.lower > 0
          ? "BETTER"
          : survival.upper < 0
            ? "WORSE"
            : "INDISTINGUISHABLE",
      better: values.filter((value, i) => value > (baseline[i] as number))
        .length,
      same: values.filter((value, i) => value === baseline[i]).length,
      worse: values.filter((value, i) => value < (baseline[i] as number))
        .length,
      censored: readings.filter((reading) => reading.censored).length,
      awtValid: readings.filter((reading) => reading.awtIsValid).length,
    };
  });
  return {
    n: perSeed.length,
    seeds: perSeed.map((seed) => seed.seed),
    none: {
      meanSurvivalS: mean(baseline),
      meanWave: mean(perSeed.map((seed) => seed.none.wave)),
      censored: perSeed.filter((seed) => seed.none.censored).length,
      awtValid: perSeed.filter((seed) => seed.none.awtIsValid).length,
    },
    latePressAtS: {
      mean: mean(perSeed.map((seed) => seed.latePressAtS ?? Number.NaN)),
      min: Math.min(...perSeed.map((seed) => seed.latePressAtS ?? Number.NaN)),
      max: Math.max(...perSeed.map((seed) => seed.latePressAtS ?? Number.NaN)),
    },
    rows,
    shippedSeed: perSeed.find((seed) => seed.seed === String(RUSH_STREAM.seed)),
  };
}

/**
 * The one handover arm: the permitted target whose house row on this building holds longest, read
 * from `data/rush-house-runs.json` (the shipped crowd's published figure), so the arm is chosen by
 * a figure published before this sweep rather than by its own result. `RUSH_CHOICES_SWITCHES`
 * (comma-separated ids, or `all`) overrides it.
 */
function switchTargetsOf(
  permitted: readonly DispatcherProfile[],
): readonly DispatcherProfile[] {
  const asked = process.env["RUSH_CHOICES_SWITCHES"];
  if (asked === "all") return permitted;
  if (asked !== undefined)
    return permitted.filter((target) => asked.split(",").includes(target.id));
  const house = (
    houseRuns as {
      runs: {
        buildingId: string;
        dispatcherId: string;
        brokeAtS: number | null;
      }[];
    }
  ).runs;
  const held = (id: string): number =>
    house.find((run) => run.buildingId === BUILDING && run.dispatcherId === id)
      ?.brokeAtS ?? Infinity;
  const best = [...permitted].sort(
    (a, b) => held(b.id) - held(a.id) || a.id.localeCompare(b.id),
  )[0];
  return best === undefined ? [] : [best];
}

describe.skipIf(!OPEN)(
  "Rush’s in-round choices against doing nothing — § D1588",
  () => {
    it("measures every arm paired on one crowd per seed", async () => {
      const out = process.env["RUSH_CHOICES_OUT"];
      if (MERGE !== undefined) {
        const perSeed = MERGE.split(",").flatMap(
          (file) =>
            (
              JSON.parse(readFileSync(file, "utf8")) as {
                perSeed: SeedReadings[];
              }
            ).perSeed,
        );
        if (out !== undefined)
          writeFileSync(
            out,
            `${JSON.stringify(summarise(perSeed), null, 2)}\n`,
          );
        expect(perSeed.length).toBeGreaterThan(1);
        return;
      }

      const resources = await loadRushHouseResources();
      const standing = withDispatcher(
        withBuilding(initialState(resources, RUSH_SEED), resources, BUILDING),
        resources,
        DISPATCHER,
      );
      const patch = rushPatchOf(resources, standing);
      if (patch === undefined)
        throw new Error(`no shipped building "${BUILDING}"`);
      const driving = profileById(resources, [], DISPATCHER);
      const switchTargets = switchTargetsOf(
        resources.dispatcherProfiles.profiles.filter(
          (target) =>
            target.id !== DISPATCHER &&
            switchRefusalOf(target, driving) === undefined,
        ),
      );

      const run = (
        seed: bigint,
        interventions: readonly RunInterventionConfig[],
      ): { recording: VizRecording; reading: Reading } => {
        const state = { ...standing, ...patch, seed, interventions };
        const plan = shiftRunConfigOf(resources, state);
        const { recording } = recordRun(plan.config, {
          recordDecisions: false,
          outOfServiceCarIds: plan.outOfServiceCarIds,
        });
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

      const times = process.env["RUSH_CHOICES_TIMES"]?.split(",").map(Number);
      const arms: {
        id: string;
        at: "early" | "late" | number;
        change: Change;
      }[] =
        times !== undefined
          ? times.flatMap((at) => [
              {
                id: `spread@${String(at)}s`,
                at,
                change: { kind: "spread-cars" as const },
              },
              {
                id: `park@${String(at)}s`,
                at,
                change: { kind: "park-cars-lobby" as const },
              },
              ...switchTargets.map((target) => ({
                id: `switch→${target.id}@${String(at)}s`,
                at,
                change: { kind: "adopt-dispatcher" as const, profile: target },
              })),
            ])
          : [
              {
                id: "spread@0:10",
                at: "early",
                change: { kind: "spread-cars" },
              },
              {
                id: "park@0:10",
                at: "early",
                change: { kind: "park-cars-lobby" },
              },
              {
                id: "spread@late",
                at: "late",
                change: { kind: "spread-cars" },
              },
              {
                id: "park@late",
                at: "late",
                change: { kind: "park-cars-lobby" },
              },
              ...switchTargets.map((target) => ({
                id: `switch→${target.id}@0:10`,
                at: "early" as const,
                change: { kind: "adopt-dispatcher" as const, profile: target },
              })),
            ];

      const perSeed: SeedReadings[] = [];
      for (let n = SEED_FROM; n < SEED_FROM + SEEDS; n += 1) {
        const seed = BigInt(RUSH_STREAM.seed) + BigInt(n);
        const base = run(seed, []);
        const late = firstWaitOverAt(base.recording, LATE_WAIT_S);
        const readings: Record<string, Reading> = {};
        for (const arm of arms) {
          const atS =
            typeof arm.at === "number"
              ? base.recording.startedAt + arm.at
              : arm.at === "early"
                ? base.recording.startedAt + EARLY_S
                : (late ?? base.recording.startedAt + EARLY_S);
          readings[arm.id] = run(seed, [{ atS, change: arm.change }]).reading;
        }
        perSeed.push({
          seed: String(seed),
          latePressAtS:
            late === undefined ? null : late - base.recording.startedAt,
          none: base.reading,
          arms: readings,
        });
        process.stderr.write(
          `seed ${String(seed)}: none ${String(base.reading.survivalS)} s, late press at ${String(perSeed.at(-1)?.latePressAtS)} s\n`,
        );
      }

      if (out !== undefined) {
        writeFileSync(
          out,
          `${JSON.stringify({ building: BUILDING, dispatcher: DISPATCHER, seedRule: "RUSH_STREAM.seed + n", perSeed, summary: perSeed.length > 1 ? summarise(perSeed) : undefined }, null, 2)}\n`,
        );
      }

      /* Non-vacuity: every arm ran on every seed, and some press moved somebody's run. */
      expect(perSeed.length).toBe(SEEDS);
      expect(
        perSeed.some((seed) =>
          Object.values(seed.arms).some(
            (reading) => reading.survivalS !== seed.none.survivalS,
          ),
        ),
      ).toBe(true);
    });
  },
);
