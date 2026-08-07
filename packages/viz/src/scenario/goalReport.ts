/**
 * A batch's goal pass rates, as sentences the Compare tab draws — **R12** reaching a screen.
 *
 * ## Why this is on the shipped surface and not only in a data file
 *
 * `data/scenario-goals.json` says what the seven candidate configurations' goals are. It cannot
 * say anything about a configuration a reader assembles in the panel, and a scenario author is
 * exactly the reader who needs to know **before** writing a level that
 * `nobody-abandoned` never fails on the building they picked. So the same instrument that
 * produced the published table runs over whatever batch the panel just ran, and prints the same
 * three answers: *a batch goal*, *a fact about this configuration*, or *no pass rate from this
 * batch* — the last being a statement about the **rate**, not about whether the goal may ship.
 *
 * ## What it refuses to say
 *
 * A verdict. There is no *"goal met"* here and there cannot be: R2 makes a score a property of a
 * run, R12 makes a goal's rate the thing that decides whether it is a goal at all, and a badge on
 * one replication of a configuration whose rate is 14 of 50 is the coin flip § 1 measured. Every
 * sentence is a **frequency over runs with its denominator** — R10 and R13 — and a batch smaller
 * than R12's floor says so rather than reporting a rate that looks like the published ones.
 */

import { CANDIDATE_GOALS } from './candidates.js';
import { asPerReplicationGoal, goalLabel, measureGoalRate, type GoalSpec } from './goals.js';
import { GOAL_BLOCKER, GOAL_JUDGEMENT, type GoalDisposition, type GoalRateClass } from './goals.js';
import { MIN_SEEDS_PER_GOAL } from './published.js';
import type { BatchResult } from '../batch/types.js';
import { glossaryFor, type GlossaryTerm } from '../mode/glossary.js';

/** One goal on one arm of the batch that just ran. */
export interface GoalReportRow {
  readonly armId: string;
  readonly dispatcherProfileId: string;
  readonly label: string;
  readonly disposition: GoalDisposition;
  readonly rateClass: GoalRateClass;
  /** A frequency over runs, with its denominator, and what R12 makes of it. */
  readonly sentence: string;
}

/**
 * A candidate kind this batch cannot take a pass rate of, and why.
 *
 * **Not the same as "may not ship"**, and the difference matters: `beat-the-baseline` has no
 * per-run pass rate because it compares two arms — which is what the comparison rows above it
 * *are* — and it ships as a batch goal regardless. `everyone-can-get-there` has none because the
 * recording cannot answer it at all. The reason says which.
 */
export interface GoalReportWithheld {
  readonly label: string;
  readonly reason: string;
}

export interface GoalReport {
  readonly rows: readonly GoalReportRow[];
  readonly withheld: readonly GoalReportWithheld[];
  /**
   * `null` when the batch has at least R12's floor of replications; a sentence when it does not.
   *
   * A rate over eight runs is not the same kind of object as a rate over fifty, and the surface
   * that prints both must say which it is looking at.
   */
  readonly floorNote: string | null;
  /**
   * The words these rows used, explained — issue #22, and this is the surface that most needs it.
   *
   * Every row is labelled with a raw kebab-case goal id: `no-divergence`, `answer-the-demand`,
   * `long-waits-under (≤ 10 %)`. A player has no way to tell what those measure, and they sit
   * next to the Simulation tab's *"Get 61 % of riders away inside a minute"*, so the plain wording
   * plainly exists somewhere and was not being used here.
   *
   * `goalLabel` is **unchanged** and still returns the id. § D240's rule 1: the id is what the
   * campaign file, the published table and every other surface call this goal, and swapping it
   * for prose here would leave a reader unable to match the row to anything else in the product.
   * The explanation goes beside it.
   */
  readonly glossary: readonly GlossaryTerm[];
}

/**
 * Take every candidate goal's pass rate over each arm of a finished batch.
 *
 * Pure: no clock, no RNG, no simulation. The batch already ran.
 */
export function goalReport(
  result: BatchResult,
  specs: readonly GoalSpec[] = CANDIDATE_GOALS,
): GoalReport {
  const rows: GoalReportRow[] = [];
  const withheld: GoalReportWithheld[] = [];

  for (const spec of specs) {
    const narrowed = asPerReplicationGoal(spec);
    if (!narrowed.judgeable) {
      withheld.push({
        label: goalLabel(spec),
        reason: narrowed.missingThreshold
          ? // Unreachable from shipped `data/` — `campaign/parse.ts` refuses an authored
            // `long-waits-under` with no threshold at load. Withheld rather than thrown because a
            // caller assembling a spec in memory never passes through that validator, and a
            // missing ceiling is a thing to report, not a reason to lose the other six goals.
            'Declares no threshold, so there is no ceiling to judge a wait against. The kind is ' +
            'judgeable on one run; this instance of it is not.'
          : (narrowed.blocker ??
            (narrowed.judgement === 'batch-only'
              ? 'Judged on the difference between two arms, which is what the comparison rows ' +
                'above are. There is no per-run predicate to take a pass rate of.'
              : 'Not judgeable from a recording as it stands.')),
      });
      continue;
    }
    for (const arm of result.arms) {
      const rate = measureGoalRate(narrowed.spec, arm.replications);
      rows.push({
        armId: arm.armId,
        dispatcherProfileId: arm.dispatcherProfileId,
        label: goalLabel(spec),
        disposition: rate.disposition,
        rateClass: rate.rateClass,
        /*
         * The profile's **name**, not its id — § D234, issue #58's second half.
         *
         * This row printed `eta:` and `collective:` where every other surface in the product prints
         * *Minimum estimated wait* and *Conventional collective*. `armId` and `dispatcherProfileId`
         * stay on the row because a caller keying off them needs them; what a player reads is the
         * name. `BatchArmResult.dispatcherProfileName` is `runBatch`'s own, copied off the profile
         * the arm actually ran, so this cannot drift from what the run used.
         */
        sentence: `${arm.dispatcherProfileName}: ${rate.sentence}`,
      });
    }
  }

  const replications = result.arms[0]?.replications.length ?? 0;
  const note = floorNote(replications);
  /*
   * The goal **labels** are in the corpus as well as the sentences, because a withheld goal has
   * no sentence at all — `everyone-can-get-there` appears on this surface only as a label beside
   * its reason, and it is the row whose name explains itself least.
   */
  const texts = [
    note ?? '',
    ...rows.flatMap((row) => [row.label, row.sentence]),
    ...withheld.flatMap((entry) => [entry.label, entry.reason]),
  ];
  return { rows, withheld, floorNote: note, glossary: glossaryFor(texts) };
}

function floorNote(replications: number): string | null {
  if (replications >= MIN_SEEDS_PER_GOAL) return null;
  return (
    `This batch ran ${String(replications)} replications. R12 asks for at least ` +
    `${String(MIN_SEEDS_PER_GOAL)} seeds before a goal's pass rate decides anything, so treat ` +
    'what follows as a look rather than a measurement — a goal that passed every run of eight ' +
    'has not been shown to be a constant.'
  );
}
