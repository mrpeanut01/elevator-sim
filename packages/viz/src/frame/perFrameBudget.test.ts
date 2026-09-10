/**
 * **The budget the two per-frame folds are bounded by** — GitHub issue #410's second acceptance
 * clause, for the two surfaces the issue names that stay on the painting thread.
 *
 * `frame/overlay.ts#overlayAt` and `live/observations.ts#observationsAt` are drawn by
 * `dev/main.ts`'s loop on **every animation frame**. Neither simulates — issue #410 inherits
 * #238's phrase *"main-thread simulation surfaces"* and these two are not that; they are folds of
 * a recording that has already finished. What they are is unbounded in the recording's size, and
 * each said so in prose and nowhere else:
 *
 * - `frame/overlay.ts` § Cost — *"a single pass over the ones that had arrived, which is comfortably
 *   inside a 60 Hz frame budget"*;
 * - `live/observations.ts` § Cost — *"one pass over `recording.legs` for the counters, plus one
 *   sort-and-sweep over `2n` queue events for the peak … comfortably inside a frame budget"*.
 *
 * ## What is asserted, and why it is not milliseconds
 *
 * The claim in both sentences is a **shape** — *a pass*, *two passes*, *not the whole array every
 * frame* — dressed as a duration. This file asserts the shape, in the unit
 * `frame/perFrame.test-helper.ts` argues for: how many legs each fold reads. A budget in
 * milliseconds cannot be enforced in this suite, because `vitest.config.ts#SIMULATING_TIMEOUT_MS`
 * measured this repository amplifying wall clock about ninefold under load, and #410 names that
 * problem outright: *"a wall-clock budget on a shared runner measures the runner (#335)"*.
 *
 * A visit count is the same integer on every machine and on every run of the same seed, so this
 * gate cannot flake — and it fails on the regression that matters. A fold that stopped breaking at
 * the playhead, or that scanned the array once per bank or once per floor, reads more legs and is
 * caught here on the first shipped building. A stopwatch would not notice on `garden-apartments`
 * and would notice on `vertical-city` only after the page had already stopped painting.
 *
 * ## The wall clock is measured, and it is measured somewhere else
 *
 * `frame/measure.perFrame.test.ts` is that run — gated, so it costs the default suite nothing —
 * and its figures are what say whether these counts are cheap. Measured on this container,
 * node v26.5.0, best of twenty calls per cell, over every shipped building at 900 s plus a
 * `vertical-city` day at 7 200 s (11 436 legs arrived by the end, the heaviest recording the menu
 * can file), at five playheads each:
 *
 * | fold | worst call, 900 s population | worst call, 7 200 s ceiling | µs per arrived leg, median |
 * |---|---|---|---|
 * | `overlayAt` | **0.038 ms** — 0.2 % of a frame | **0.154 ms** — 0.9 % | 0.026 → 0.017 |
 * | `observationsAt` | **0.550 ms** — 3.3 % of a frame | **3.546 ms** — 21.3 % | 0.245 → 0.309 |
 *
 * **The sentence both docstrings assert is true, and it is now true because of a run.** The worst
 * call anywhere in the population is 21.3 % of a 16.7 ms frame, on the heaviest recording the
 * product can hand these folds. Saying that is worth as much as the figure: the claim was checked
 * on the ceiling as well as the middle, which is `dev/offThreadRuns.ts`'s finding about Watch — a
 * stated cost measured on the cheap half of its own population — declined this time.
 *
 * **One thing the measurement found that the budget below does not bound tightly, said rather than
 * left to be discovered.** `observationsAt` reads exactly three times the legs `overlayAt` does and
 * costs roughly nine times as much per leg at 900 s and eighteen times at the ceiling. Its per-leg
 * cost *rises* with the recording while `overlayAt`'s falls, which is a super-linear term the leg
 * count cannot see — the `2n` sort. The budget still bounds it, because the events sorted are
 * derived from the legs read and `n log n` over a bounded `n` is bounded; it does not bound it
 * *tightly*, and a bound that admits `n log n` while claiming to police a pass should say so. Which
 * line inside the sweep the time goes to is **unmeasured**, and no plausible sentence is offered in
 * place of a measurement ([§ D256](../../../../DECISIONS.md)).
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): the budget is over two folds in this package
 * and binds nothing outside them, so this docstring is the record the working agreement asks for.
 */

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

/**
 * Legs `overlayAt` may read, as a multiple of the legs that had arrived.
 *
 * **One**, because the fold's own sentence is *a single pass over the ones that had arrived*, and a
 * budget loose enough to admit two passes would not be a budget on that sentence. The `+ 1` the
 * assertion adds is not slack: `for (const leg of recording.legs)` reads the leg it breaks on, so
 * an exact one-pass scan that stops at the playhead reads `arrived + 1`.
 */
const OVERLAY_PASSES = 1;

/**
 * Legs `observationsAt` may read, as the same multiple. **Three**, and the three are named.
 *
 * The fold's docstring accounts for two — *"one pass over `recording.legs` for the counters, plus
 * one sort-and-sweep over `2n` queue events"* — and the third is the one the sentence does not
 * mention: its first statement calls `overlayAt` on the same recording, deliberately, so that
 * *"two answers to who is waiting"* cannot exist. That call is a pass over the same legs. So the
 * honest bound is three rather than the two a reader of that paragraph would write down, and this
 * constant exists to say which three.
 */
const OBSERVATIONS_PASSES = 3;

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(id, recordRun(breadthConfig(config, id)).recording);
  }
});

/** Every shipped building at every sampled playhead — one case per building, not one per sample. */
function sweep(
  fold: (recording: VizRecording, t: number) => unknown,
  passes: number,
  buildingId: string,
): void {
  const recording = recordings.get(buildingId);
  if (recording === undefined)
    throw new Error(`no recording for ${buildingId}`);
  const counted = countingRecording(recording);
  let sawAnyLeg = false;

  for (const fraction of PLAYHEAD_FRACTIONS) {
    const t =
      recording.startedAt +
      (recording.endedAt - recording.startedAt) * fraction;
    const arrived = arrivedBy(recording, t);
    counted.reset();
    fold(counted.recording, t);
    const visits = counted.visits();

    expect(
      visits,
      `${buildingId} at ${t.toFixed(1)}s: ${String(visits)} leg reads against ` +
        `${String(arrived)} arrived — the budget is ${String(passes)} pass(es)`,
    ).toBeLessThanOrEqual(passes * (arrived + 1));
    if (arrived > 0) sawAnyLeg = true;
  }

  /*
   * The floor, and it is the assertion that keeps the rest honest. A `≤` gate over a recording with
   * no legs passes at zero, so a fixture that silently stopped producing arrivals — or a proxy that
   * stopped counting — would turn this whole file green while measuring nothing. This is
   * `dev/measure.surfaceRuns.test.ts`'s own rule about an empty population, one file over.
   */
  expect(
    sawAnyLeg,
    `${buildingId} produced no legs, so the budget above bounded nothing`,
  ).toBe(true);
}

describe("the per-frame folds stay inside their budget", () => {
  describe("overlayAt reads each arrived leg once", () => {
    for (const id of BUILDING_IDS) {
      it(id, () => {
        sweep(overlayAt, OVERLAY_PASSES, id);
      });
    }
  });

  describe("observationsAt reads each arrived leg three times", () => {
    for (const id of BUILDING_IDS) {
      it(id, () => {
        sweep(observationsAt, OBSERVATIONS_PASSES, id);
      });
    }
  });

  /**
   * The negative control — without it the two suites above are consistent with a bound that could
   * never fail.
   *
   * A fold that reads the whole array on every frame is exactly the regression the budget exists to
   * catch, and it is the one a stopwatch on a small building would miss. Run against the same
   * counting recording at a playhead a quarter of the way in, it must exceed the `overlayAt` budget
   * — and it is asserted to exceed it rather than merely to differ, because a control that came out
   * *under* the bound would mean the bound admits the defect.
   */
  it("a fold that ignored the playhead would fail this budget", () => {
    const recording = recordings.get("midtown-office");
    if (recording === undefined)
      throw new Error("no recording for midtown-office");
    const t =
      recording.startedAt + (recording.endedAt - recording.startedAt) * 0.25;
    const arrived = arrivedBy(recording, t);
    const counted = countingRecording(recording);

    let seen = 0;
    for (const leg of counted.recording.legs) if (leg.arrivedAt >= 0) seen += 1;

    expect(seen).toBeGreaterThan(arrived);
    expect(counted.visits()).toBeGreaterThan(OVERLAY_PASSES * (arrived + 1));
  });
});
