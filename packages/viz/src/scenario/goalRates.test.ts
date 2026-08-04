/**
 * The guard: **a goal may not ship without a measured across-seed pass rate** — `docs/10` § 1
 * **R12**.
 *
 * Three separable claims, and each one fails on its own:
 *
 * 1. **The table is well formed and self-consistent.** `validatePublishedGoalRates` over the
 *    shipped `data/scenario-goals.json`. Every goal kind is accounted for on every scenario, every
 *    record's class follows from its own counts, and every record is in the bucket its rate puts
 *    it in. This is the clause that catches a goal added without a measurement: mechanically, that
 *    is a kind in no bucket.
 * 2. **The published counts reproduce.** Every scenario is re-run, both seed sets, and the counts
 *    are compared with what is on disk. CLAUDE.md: *"If you publish a number, pin it to the run
 *    that produced it."* A pass-rate table is exactly the shape of the three published figures
 *    this repository found had gone stale with nothing noticing.
 * 3. **The negative controls fire.** Each of the mutations below is applied to the **real** loaded
 *    table — not to a fixture — because a guard checked only against a hand-built object proves
 *    that the hand-built object is well formed. Two of them exist specifically for the
 *    false-negative shape this wave has hit three times: a mutation that stays green because the
 *    value it changed has a second reader. `disposition` and `rateClass` are both **stored** and
 *    **derived**, so both are mutated on their own *and* mutated consistently with their bucket,
 *    and the derivation from the counts is what fails in every case.
 *
 * ## Regenerating
 *
 * ```
 * ELEVATOR_SIM_REGENERATE_GOAL_RATES=1 npx vitest run --project viz src/scenario/goalRates.test.ts
 * ```
 *
 * The environment flag follows `ELEVATOR_SIM_DEEP`'s precedent. It **writes** the file and skips
 * the comparison, so a regeneration cannot be mistaken for a passing guard.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { replicationSeed } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { CANDIDATE_GOALS, CANDIDATE_SCENARIOS } from './candidates.js';
import { GOAL_KINDS, GOAL_READS, isPerReplicationGoal } from './goals.js';
import { measureScenario, publishedScenarioFor } from './measure.js';
import {
  MIN_SEEDS_PER_GOAL,
  validatePublishedGoalRates,
  type PublishedGoalRates,
  type PublishedGoalRecord,
  type PublishedScenario,
} from './published.js';
import { SCENARIO_GOALS_PATH, regenerateScenarioGoals } from './regenerate.test-helper.js';
import type { BatchResources } from '../batch/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

const REGENERATE = process.env['ELEVATOR_SIM_REGENERATE_GOAL_RATES'] === '1';

let table: PublishedGoalRates;
let config: LoadedConfig;

beforeAll(async () => {
  if (REGENERATE) {
    table = await regenerateScenarioGoals();
  } else {
    table = JSON.parse(await readFile(SCENARIO_GOALS_PATH, 'utf8')) as PublishedGoalRates;
  }
  config = await loadConfig(DATA_DIR);
}, 900_000);

function clone(): PublishedGoalRates {
  return JSON.parse(JSON.stringify(table)) as PublishedGoalRates;
}

/** Every record of a cloned table, so a mutation can find the shape it needs on real data. */
function records(
  scenario: PublishedScenario,
): readonly (readonly [string, PublishedGoalRecord[]])[] {
  return [
    ['goals', scenario.goals as PublishedGoalRecord[]],
    ['configurationFacts', scenario.configurationFacts as PublishedGoalRecord[]],
    ['withheld', scenario.withheld as PublishedGoalRecord[]],
  ];
}

describe('the published goal pass-rate table', () => {
  it('names every scenario the candidate set declares, and nothing else', () => {
    expect(table.scenarios.map((scenario) => scenario.id)).toEqual(
      CANDIDATE_SCENARIOS.map((scenario) => scenario.id),
    );
  });

  it('is well formed, self-consistent, and accounts for every goal kind on every scenario', () => {
    expect(validatePublishedGoalRates(table)).toEqual([]);
  });

  it('runs both seed sets at the project’s own replication budget, and they are disjoint', () => {
    for (const scenario of table.scenarios) {
      expect(scenario.tuningSeeds.replications).toBeGreaterThanOrEqual(MIN_SEEDS_PER_GOAL);
      expect(scenario.holdoutSeeds.replications).toBeGreaterThanOrEqual(MIN_SEEDS_PER_GOAL);
      /*
       * Disjointness is *derived*, not asserted about the master seeds: two different masters
       * could in principle produce a colliding replication seed, and the thing that matters is
       * the seeds the runs actually use. This is the check `runHoldoutRound` makes by refusing.
       */
      const tuning = new Set(
        Array.from({ length: scenario.tuningSeeds.replications }, (_, i) =>
          replicationSeed(scenario.tuningSeeds.seed, i).toString(),
        ),
      );
      const overlap = Array.from(
        { length: scenario.holdoutSeeds.replications },
        (_, i) => replicationSeed(scenario.holdoutSeeds.seed, i).toString(),
      ).filter((seed) => tuning.has(seed));
      expect(overlap).toEqual([]);
    }
  });

  it('ships no goal that reads a quantity R1 forbids a score to be computed from', () => {
    /*
     * R1 names three fields: `meanWaitS`, `wait95S`, `meanTimeToDestinationS` — `awtS`, `wt95S`
     * and `ttdMeanS` in the batch's projection. A goal that read one would be unjudgeable on the
     * 46 of 60 shipped cells **M1** measures as refusing a mean, and § 9.5 makes that a
     * scenario-authoring error caught at load rather than at judging time.
     */
    const forbidden = new Set(['awtS', 'wt95S', 'ttdMeanS']);
    for (const kind of GOAL_KINDS) {
      if (!isPerReplicationGoal(kind)) continue;
      for (const metric of GOAL_READS[kind]) {
        expect(forbidden.has(metric)).toBe(false);
      }
    }
  });
});

/**
 * **The prose copy of the table, held to the JSON copy of it.**
 *
 * `docs/10` § M30 reprints this table for a reader. That copy **had gone stale** — three of stage
 * 6's five cells disagreed with `data/scenario-goals.json` after `vertical-city` declared its
 * ground-lobby escalator, including a goal still printed in bold after the measurement had made it
 * *withheld*. Nothing noticed, because the regeneration path writes the JSON and no test read the
 * markdown.
 *
 * So this parses the table out of the document and compares every cell, in **both** directions:
 * a cell that moves in the JSON without moving in the prose fails, and so does a cell edited in the
 * prose to something the JSON does not say. The bold marking is compared too, because bold *means*
 * "shipping batch goal" in that table's own key, and a rate that stops shipping while staying
 * bold is the failure that actually happened.
 */
const DOCS_10_PATH = fileURLToPath(
  new URL('../../../../docs/10-experience-layer-contract.md', import.meta.url),
);

/** The five goal kinds § M30's table has a column for, in its column order. */
const M30_COLUMNS = [
  'deliver-everyone',
  'no-divergence',
  'nobody-abandoned',
  'answer-the-demand',
  'long-waits-under',
] as const;

/** `"**4/50, 9/50**"` → `{ text: '4/50, 9/50', bold: true }`; footnote marks are dropped. */
function readCell(raw: string): { readonly text: string; readonly bold: boolean } {
  const trimmed = raw.trim().replace(/[†‡]/gu, '').trim();
  const bold = trimmed.startsWith('**') && trimmed.endsWith('**');
  return { text: (bold ? trimmed.slice(2, -2) : trimmed).trim(), bold };
}

describe('the table printed in docs/10 § M30 is the table in data/scenario-goals.json', () => {
  it('reproduces every cell and every bold mark, in both directions', async () => {
    const markdown = await readFile(DOCS_10_PATH, 'utf8');
    const rows = markdown
      .split('\n')
      // Any stage number, not `[1-7]`. The bound was the stage count at the time of writing, so
      // stages 8, 9 and 10 were silently skipped and the length check below was the only thing that
      // noticed — the same "a list that should track the data" shape this file's own § M30 note is
      // about.
      .filter((line) => /^\| \*\*\d+ /u.test(line))
      .map((line) => line.split('|').slice(1, -1));
    // Non-vacuous: a table that stopped matching the row pattern would otherwise pass silently.
    expect(rows).toHaveLength(table.scenarios.length);

    let compared = 0;
    rows.forEach((cells, index) => {
      const scenario = table.scenarios[index];
      expect(scenario, `no scenario for documented row ${index}`).toBeDefined();
      if (scenario === undefined) return;
      const shipped = new Map(
        [...scenario.goals, ...scenario.configurationFacts, ...scenario.withheld].map((record) => [
          record.kind,
          record,
        ]),
      );
      const shipsAsGoal = new Set(scenario.goals.map((record) => record.kind));

      M30_COLUMNS.forEach((kind, column) => {
        const documented = readCell(cells[column + 2] ?? '');
        const record = shipped.get(kind);
        expect(record, `${scenario.id}: ${kind} is in no bucket`).toBeDefined();
        if (record?.tuning == null || record.holdout == null) return;
        const expected =
          `${String(record.tuning.passes)}/${String(record.tuning.n)}, ` +
          `${String(record.holdout.passes)}/${String(record.holdout.n)}`;
        compared += 1;
        expect(documented.text, `${scenario.id} / ${kind}`).toBe(expected);
        // Bold is the table's own key for "shipping batch goal", so it is data, not decoration.
        expect(documented.bold, `${scenario.id} / ${kind}: bold mark`).toBe(shipsAsGoal.has(kind));
      });
    });

    /*
     * **The early-return guard**, which is the third false-negative shape in this repository's
     * list: every clause above sits behind a `return` that a missing record or a null rate would
     * take, so a table whose cells all fell through would report no failure at all. Seven stages
     * times five columns, and no cell in this table is unmeasured.
     */
    expect(compared).toBe(table.scenarios.length * M30_COLUMNS.length);
  });
});

describe('the published counts reproduce from the code that produced them', () => {
  it.skipIf(REGENERATE)(
    're-runs every scenario and gets the same passes and the same n',
    async () => {
      for (const scenario of CANDIDATE_SCENARIOS) {
        const resources: BatchResources = {
          building: requireBuilding(config, scenario.buildingId),
          dispatcherProfiles: config.dispatcherProfiles,
          trafficProfiles: config.trafficProfiles,
          elevatorSpecs: config.elevatorSpecs,
        };
        const remeasured = publishedScenarioFor(measureScenario(scenario, resources));
        const published = table.scenarios.find((entry) => entry.id === scenario.id);
        expect(published, `${scenario.id} is not in the published table`).toBeDefined();
        expect(remeasured).toEqual(published);
      }
    },
    900_000,
  );
});

describe('the guard fires — negative controls, applied to the shipped table', () => {
  it('catches a goal kind that ships with no measured rate at all', () => {
    const mutated = clone();
    const scenario = mutated.scenarios[0];
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    /* The literal shape of the defect: somebody adds a kind and never measures it. */
    const dropped = 'no-divergence';
    for (const [, bucket] of records(scenario)) {
      const index = bucket.findIndex((record) => record.kind === dropped);
      if (index >= 0) bucket.splice(index, 1);
    }
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      `goal kind "${dropped}" has no measured pass rate here and is in no bucket`,
    );
  });

  it('catches a constant promoted to a goal — even when its disposition is moved to match', () => {
    /*
     * **The false-negative shape.** `disposition` has two readers: it is stored on the record and
     * it is derived from the counts. A mutation that changes only the stored value is the easy
     * catch; this one changes the stored value *and* the bucket, consistently, so the only thing
     * left that can disagree is the derivation from the published counts. It must still fire.
     */
    const mutated = clone();
    let moved = false;
    for (const scenario of mutated.scenarios) {
      const facts = scenario.configurationFacts as PublishedGoalRecord[];
      const fact = facts.shift();
      if (fact === undefined) continue;
      (scenario.goals as PublishedGoalRecord[]).push({ ...fact, disposition: 'batch' });
      moved = true;
      break;
    }
    expect(moved, 'the shipped table has no configuration fact to promote').toBe(true);
    const violations = validatePublishedGoalRates(mutated).join('\n');
    expect(violations).toContain('does not follow from its own rates');
    expect(violations).toContain('A constant is not a goal');
  });

  it('catches a rate class hand-edited away from its own counts', () => {
    const mutated = clone();
    const record = firstMeasured(mutated);
    expect(record).toBeDefined();
    if (record?.tuning == null) return;
    (record.tuning as { rateClass: string }).rateClass =
      record.tuning.rateClass === 'variable' ? 'constant-pass' : 'variable';
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      'the tuning class is published as',
    );
  });

  it('catches counts that do not add up to their own n', () => {
    const mutated = clone();
    const record = firstMeasured(mutated);
    if (record?.tuning == null) return;
    (record.tuning as { passes: number }).passes = record.tuning.passes + 1;
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain('do not add up');
  });

  it('catches a seed set below R12’s floor', () => {
    const mutated = clone();
    const scenario = mutated.scenarios[0];
    if (scenario === undefined) return;
    (scenario.tuningSeeds as { replications: number }).replications = MIN_SEEDS_PER_GOAL - 1;
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      `R12 requires at least ${String(MIN_SEEDS_PER_GOAL)}`,
    );
  });

  it('catches a holdout set that is not disjoint from the tuning set', () => {
    const mutated = clone();
    const scenario = mutated.scenarios[0];
    if (scenario === undefined) return;
    (scenario.holdoutSeeds as { seed: string }).seed = scenario.tuningSeeds.seed;
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      'so the holdout validates nothing',
    );
  });

  it('catches a holdoutAgrees flag that contradicts the two published classes', () => {
    const mutated = clone();
    const record = firstMeasured(mutated);
    if (record === undefined) return;
    (record as { holdoutAgrees: boolean }).holdoutAgrees = !(record.holdoutAgrees ?? false);
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      'and the two published classes say otherwise',
    );
  });

  it('catches a blocked kind promoted into the shippable goals', () => {
    /*
     * `everyone-can-get-there`, not `beat-the-baseline`. The second **does** ship — § 5.2 already
     * makes it a batch goal because R2 says a comparison needs a batch, and R12 governs goals
     * judged on one run. The first cannot be answered by the recording at all.
     */
    const mutated = clone();
    const scenario = mutated.scenarios[0];
    if (scenario === undefined) return;
    const withheld = scenario.withheld as PublishedGoalRecord[];
    const index = withheld.findIndex((record) => record.kind === 'everyone-can-get-there');
    const record = withheld[index];
    if (record === undefined) return;
    withheld.splice(index, 1);
    (scenario.goals as PublishedGoalRecord[]).push({ ...record, disposition: 'batch' });
    const violations = validatePublishedGoalRates(mutated).join('\n');
    expect(violations).toContain('has no per-replication predicate and is "blocked"');
    expect(violations).toContain('it is "not-shippable"');
  });

  it('catches the comparison goal demoted out of the shippable goals', () => {
    /* The mirror of the clause above, so the routing is pinned in both directions. */
    const mutated = clone();
    const scenario = mutated.scenarios[0];
    if (scenario === undefined) return;
    const goals = scenario.goals as PublishedGoalRecord[];
    const index = goals.findIndex((record) => record.kind === 'beat-the-baseline');
    const record = goals[index];
    if (record === undefined) return;
    goals.splice(index, 1);
    (scenario.withheld as PublishedGoalRecord[]).push({ ...record, disposition: 'not-shippable' });
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      'has no per-replication predicate and is "batch-only"',
    );
  });

  it('catches a threshold dropped from the one kind that takes one', () => {
    const mutated = clone();
    for (const scenario of mutated.scenarios) {
      for (const [, bucket] of records(scenario)) {
        for (const record of bucket) {
          if (record.kind === 'long-waits-under') {
            (record as { threshold: number | null }).threshold = null;
          }
        }
      }
    }
    expect(validatePublishedGoalRates(mutated).join('\n')).toContain(
      'takes a threshold and declares none',
    );
  });

  it('positive control: the unmutated table produces no violation at all', () => {
    /*
     * Without this, every assertion above could be passing because the validator returns a
     * violation for everything. It is the same shape `boundaries.test.ts` uses for its greps.
     */
    expect(validatePublishedGoalRates(clone())).toEqual([]);
  });

  it('positive control: every candidate kind really is present in the shipped table', () => {
    /*
     * The completeness clause is satisfied vacuously by a table with no scenarios, and the
     * "no bucket" mutation above would then also be vacuous. This pins the other side.
     */
    expect(CANDIDATE_GOALS.map((spec) => spec.kind).sort()).toEqual([...GOAL_KINDS].sort());
    for (const scenario of table.scenarios) {
      const present = new Set(
        records(scenario).flatMap(([, bucket]) => bucket.map((record) => record.kind)),
      );
      expect([...present].sort()).toEqual([...GOAL_KINDS].sort());
    }
  });
});

function firstMeasured(mutated: PublishedGoalRates): PublishedGoalRecord | undefined {
  for (const scenario of mutated.scenarios) {
    for (const [, bucket] of records(scenario)) {
      for (const record of bucket) {
        if (record.tuning !== null && record.holdout !== null) return record;
      }
    }
  }
  return undefined;
}
