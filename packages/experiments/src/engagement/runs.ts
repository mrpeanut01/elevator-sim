/**
 * **The stage's own baseline arm, on either of its two seed sets.**
 *
 * The tension band is a property of a scenario's tuning, so its baseline is the stage as shipped: the
 * opening dispatcher with no verb pressed, on every replication of the tuning seed set and, separately,
 * of the holdout seed set. The two sets are disjoint samples and are never paired with each other.
 *
 * The tuning runs come from `PlaySessions#baseline`, so the meaningful-choice baseline and the tension
 * band share them run for run. The holdout runs are built by the same `stageSessionConfigFor`, with the
 * holdout set named; `packages/viz/src/campaign/stageSessionAgreement.test.ts` holds that config to the
 * game's own holdout batch, which is what makes these the runs `campaign/judge.ts` clears a stage on.
 *
 * Deterministic and clock-free; it runs simulations and reads no file. The decision binds nothing
 * outside `engagement/` (§ D405).
 */

import { runSimulation, type SimulationResult } from '@elevator-sim/core';

import type { PlaySessions } from '../fuzz/play.js';
import { playSeedSetOf, stageSessionConfigFor, type PlaySeedSet } from '../fuzz/stageSession.js';

/** Replications `0 … n − 1` of the stage's own setting on one seed set, `n` being that set's declared count. */
export function stageBaselineRuns(sessions: PlaySessions, seedSet: PlaySeedSet): readonly SimulationResult[] {
  const { stage, resources } = sessions.context;
  const { replications } = playSeedSetOf(stage, seedSet);
  return Object.freeze(
    Array.from({ length: replications }, (_, replication) =>
      seedSet === 'tuning'
        ? sessions.baseline(replication)
        : runSimulation(stageSessionConfigFor(stage, resources, replication, [], 'holdout')),
    ),
  );
}
