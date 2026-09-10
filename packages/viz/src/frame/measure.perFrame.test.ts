/**
 * **What the two per-frame folds cost a frame** — the run behind `frame/perFrameBudget.test.ts`'s
 * published table, GitHub issue #410.
 *
 * `frame/overlay.ts` and `live/observations.ts` each carry a *Cost* heading claiming the work is
 * *"comfortably inside a 60 Hz frame budget"*. Neither sentence had a run behind it, and CLAUDE.md's
 * rule is that a published number is pinned to the run that produced it. This file is that run.
 *
 * Per shipped building at 900 s — the length `dev/main.ts` actually runs — and per playhead in
 * `PLAYHEAD_FRACTIONS`, it records:
 *
 * - **wall clock per call**, the fastest of {@link REPEATS} rather than the mean. The fastest is
 *   the honest reading for a pure function on a shared runner: every other sample is this one plus
 *   an interruption, so the minimum estimates the work and the mean estimates the machine. It is
 *   still a wall-clock figure and it is still only ever *published*, never asserted — the assertion
 *   lives in `frame/perFrameBudget.test.ts` and is written in legs for that file's stated reason;
 * - **legs read**, the same counter the budget is enforced against, so the two units sit side by
 *   side and a reader can convert one into the other for this machine.
 *
 * ## The ceiling is a separate row rather than a caveat
 *
 * The 900 s sweep is the middle of the population, not its end. `dev/main.ts` draws whatever
 * recording it holds, and a filed day reaches `menu/types.ts#LONGEST_OFFERED_RUN_S` on any tower
 * the player has played — which `dev/offThreadRuns.ts` already records costing 4 351 ms to
 * *produce*. Nothing had asked what it costs to **draw**, and a cost measured on the cheap half of
 * its own population is the stale-refusal shape that same docstring is about. So `vertical-city` at
 * 7 200 s is measured as its own row.
 *
 * ## Skipped unless asked for
 *
 * Gated on `PER_FRAME_OUT`, so the default suite neither runs it nor pays for it, and the figures
 * are written to a file rather than logged because vitest 4 intercepts `console.log`:
 *
 * ```
 * PER_FRAME_OUT=/tmp/per-frame.txt \
 *   npx vitest run --project viz packages/viz/src/frame/measure.perFrame.test.ts
 * ```
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): this file measures two folds in this package
 * and binds nothing outside them, so this docstring is the record the working agreement asks for.
 */

import { writeFileSync } from "node:fs";

import { loadConfig, type LoadedConfig } from "@elevator-sim/core";
import { beforeAll, describe, expect, it } from "vitest";

import {
  BUILDING_IDS,
  DATA_DIR,
  breadthConfig,
} from "../fixtures.test-helper.js";
import { observationsAt } from "../live/observations.js";
import { recordRun } from "../record/recordRun.js";
import type { VizRecording } from "../contract/types.js";

import { overlayAt } from "./overlay.js";
import {
  PLAYHEAD_FRACTIONS,
  arrivedBy,
  countingRecording,
} from "./perFrame.test-helper.js";

const OUT = process.env["PER_FRAME_OUT"];

/** Samples per cell. Enough that one preempted call cannot be the minimum; small enough to be free. */
const REPEATS = 20;

/** A frame at 60 Hz. The budget both docstrings invoke, so the table is read against it. */
const FRAME_MS = 1000 / 60;

interface Cell {
  readonly fold: string;
  readonly building: string;
  readonly atS: number;
  readonly arrived: number;
  readonly visits: number;
  readonly bestMs: number;
}

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  if (OUT === undefined) return;
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(id, recordRun(breadthConfig(config, id)).recording);
  }
  recordings.set(
    "vertical-city@7200s",
    recordRun(breadthConfig(config, "vertical-city", { durationS: 7200 }))
      .recording,
  );
});

function cellsFor(
  name: string,
  fold: (recording: VizRecording, t: number) => unknown,
  building: string,
  recording: VizRecording,
): readonly Cell[] {
  const counted = countingRecording(recording);
  return PLAYHEAD_FRACTIONS.map((fraction) => {
    const atS =
      recording.startedAt +
      (recording.endedAt - recording.startedAt) * fraction;
    counted.reset();
    fold(counted.recording, atS);
    const visits = counted.visits();

    let bestMs = Number.POSITIVE_INFINITY;
    for (let i = 0; i < REPEATS; i += 1) {
      const started = performance.now();
      fold(recording, atS);
      bestMs = Math.min(bestMs, performance.now() - started);
    }
    return {
      fold: name,
      building,
      atS,
      arrived: arrivedBy(recording, atS),
      visits,
      bestMs,
    };
  });
}

function summary(name: string, cells: readonly Cell[]): string {
  if (cells.length === 0) return `${name}: no cells\n`;
  const worst = cells.reduce((a, b) => (b.bestMs > a.bestMs ? b : a));
  const perLeg = cells
    .filter((cell) => cell.arrived > 0)
    .map((cell) => (1000 * cell.bestMs) / cell.arrived)
    .sort((a, b) => a - b);
  return (
    `${name}: n=${String(cells.length)} ` +
    `worst=${worst.bestMs.toFixed(3)}ms (${worst.building} @ ${worst.atS.toFixed(0)}s, ` +
    `${String(worst.arrived)} arrived) = ${((100 * worst.bestMs) / FRAME_MS).toFixed(1)}% of a 60 Hz frame | ` +
    `median µs per arrived leg=${(perLeg[perLeg.length >> 1] ?? 0).toFixed(3)}\n`
  );
}

describe.skipIf(OUT === undefined)(
  "what a per-frame fold costs a frame",
  () => {
    it("measures overlayAt and observationsAt over the shipped population and its ceiling", () => {
      const cells: Cell[] = [];
      for (const [building, recording] of recordings) {
        cells.push(...cellsFor("overlayAt", overlayAt, building, recording));
        cells.push(
          ...cellsFor("observationsAt", observationsAt, building, recording),
        );
      }

      // The floor, and the only assertion — `dev/measure.surfaceRuns.test.ts`'s rule: a measurement
      // over an empty set publishes zeros that read like a fast surface.
      expect(cells.filter((cell) => cell.arrived > 0).length).toBeGreaterThan(
        0,
      );

      const ceiling = (cell: Cell): boolean =>
        cell.building === "vertical-city@7200s";
      const body = [
        "per-frame folds — best-of-20 wall clock against legs read",
        `node ${process.version}, one frame at 60 Hz = ${FRAME_MS.toFixed(3)} ms`,
        "",
        ...cells.map((cell) =>
          [
            cell.fold.padEnd(16),
            cell.building.padEnd(22),
            `at=${cell.atS.toFixed(0)}s`.padEnd(12),
            `arrived=${String(cell.arrived)}`.padEnd(15),
            `visits=${String(cell.visits)}`.padEnd(15),
            `best=${cell.bestMs.toFixed(3)}ms`,
          ].join(" "),
        ),
        "",
        summary(
          "overlayAt (900 s population)",
          cells.filter((cell) => cell.fold === "overlayAt" && !ceiling(cell)),
        ),
        summary(
          "observationsAt (900 s population)",
          cells.filter(
            (cell) => cell.fold === "observationsAt" && !ceiling(cell),
          ),
        ),
        summary(
          "overlayAt (7 200 s ceiling)",
          cells.filter((cell) => cell.fold === "overlayAt" && ceiling(cell)),
        ),
        summary(
          "observationsAt (7 200 s ceiling)",
          cells.filter(
            (cell) => cell.fold === "observationsAt" && ceiling(cell),
          ),
        ),
      ].join("\n");
      writeFileSync(OUT ?? "", body, "utf8");
    });
  },
);
