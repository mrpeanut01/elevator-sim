/**
 * **The forty are real runs** — a small subset of them, actually simulated.
 *
 * Every other test in this directory drives a plan or a fold. This one runs the plan, on the
 * cheapest of the eight towers, and asks the three questions a plan cannot answer about itself:
 *
 * 1. **Does each crowd shape reach the passengers?** The standing requirement in CLAUDE.md — *move
 *    the control and require the run to change, compared on the legs rather than on a window
 *    statistic* — and `runBatch`'s `crn.traceKey` is exactly that comparison: `traceKeyOf` computes
 *    the trace-equivalence class from the fields core's generator reads, so two cells with the same
 *    key ran the same people. Five shapes that produced one key would be five labels on one run,
 *    which is the defect § D219 was found by.
 * 2. **Does a case reproduce?** § 12.3's whole premise is that two ratings a month apart are
 *    comparable, which requires the same case at the same seed to be the same run.
 * 3. **Does a rating come out?** A fold over a real `BatchResult` rather than over a fixture.
 *
 * The subset is five runs and one repeat on Garden Apartments — § 1.4 measures a full simulation
 * there at 181 ms — rather than the forty, because forty is minutes and a unit test is not where a
 * rating is measured.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import type { BatchResources } from '../batch/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

import {
  parseProofCases,
  proofCaseRequestOf,
  proofCasesOf,
  type ProofCase,
  type ProofCaseSet,
} from './proofCases.js';
import { ratedCaseOf, ratingOf } from './rating.js';

const SET: ProofCaseSet = parseProofCases(
  JSON.parse(readFileSync(join(DATA_DIR, 'proof-cases.json'), 'utf8')) as unknown,
  {
    /*
     * The parse's building check is satisfied from the file itself here rather than from a loaded
     * config, because this set is built before `beforeAll` runs. `proofCases.test.ts` is where the
     * check is asked against `data/buildings/` on disk.
     */
    buildingIds: new Set(
      (
        JSON.parse(readFileSync(join(DATA_DIR, 'proof-cases.json'), 'utf8')) as {
          towers: readonly { id: string }[];
        }
      ).towers.map((tower) => tower.id),
    ),
  },
);

/** The cheapest tower's five cases — one per crowd shape. */
const SUBSET: readonly ProofCase[] = proofCasesOf(SET).filter(
  (entry) => entry.tower.id === 'garden-apartments',
);

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

function resourcesFor(buildingId: string): BatchResources {
  return {
    building: requireBuilding(config, buildingId),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

const runCase = (proofCase: ProofCase): ReturnType<typeof runBatch> =>
  runBatch(
    proofCaseRequestOf(proofCase, [{ armId: 'candidate', dispatcherProfileId: 'collective' }], 1),
    resourcesFor(proofCase.tower.id),
  );

describe('the proof cases actually run', () => {
  it('has five cases on the tower under test — one per crowd shape', () => {
    expect(SUBSET).toHaveLength(SET.crowds.length);
  });

  it(
    'gives every crowd shape a different population — compared on the trace, not on a statistic',
    () => {
      const keys = SUBSET.map((proofCase) => runCase(proofCase).crn.traceKey);
      expect(new Set(keys).size).toBe(SUBSET.length);
    },
    120_000,
  );

  it(
    'reproduces a case exactly from its own seed — invariant 5, and § 12.3’s whole premise',
    () => {
      const proofCase = SUBSET[0];
      if (proofCase === undefined) throw new Error('no case');
      const first = runCase(proofCase);
      const second = runCase(proofCase);
      expect(second.arms[0]?.replications[0]?.metrics).toEqual(
        first.arms[0]?.replications[0]?.metrics,
      );
      expect(second.crn.traceKey).toBe(first.crn.traceKey);
    },
    120_000,
  );

  it(
    'folds into a rating whose figure came out of the runs',
    () => {
      const rated = SUBSET.map((proofCase) => ratedCaseOf(proofCase, runCase(proofCase)));
      const summary = ratingOf(rated, SUBSET.length);
      expect(summary.casesRun).toBe(SUBSET.length);
      /*
       * At least one case must have carried somebody, or this test would pass on a subset where
       * every run served nobody — which is a green test about an empty building rather than a
       * rating. The stronger `casesRated === casesRun` is deliberately not asserted: whether a
       * sparse tower's crowd shape serves anybody is a measurement, and pinning it here would pin
       * a fact about the reference data to a test.
       */
      expect(summary.casesRated).toBeGreaterThan(0);
      expect(summary.rating).not.toBeNull();
      /*
       * The rating is asserted as a share rather than as a value: pinning a number here would pin
       * a figure to a test rather than to the run that produced it, which is the published-number
       * defect. What is asserted is that a rating exists and is a percentage.
       */
      if (summary.rating !== null) {
        expect(summary.rating).toBeGreaterThanOrEqual(0);
        expect(summary.rating).toBeLessThanOrEqual(100);
      }
      for (const entry of rated) {
        expect(entry.seed).not.toBe('');
        /* R13: a case that measured nothing says why rather than scoring zero. */
        if (entry.score === null) expect(entry.noScoreReason).not.toBeNull();
      }
    },
    120_000,
  );
});
