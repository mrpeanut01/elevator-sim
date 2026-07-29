/**
 * The campaign, checked against the measurement it is built on — `docs/10` § 5, § 1 R2–R13.
 *
 * Five separable claims, each of which fails on its own:
 *
 * 1. **The shipped campaign parses**, against the shipped goal table, the shipped buildings, the
 *    shipped dispatcher profiles and the **discovered** search space. Nothing is mocked: a campaign
 *    validated against a fixture would prove a fixture is well formed.
 * 2. **No goal was authored.** Every stage's goal list is exactly its `goals` bucket in
 *    `data/scenario-goals.json` — subset because [§ D160](../../../../DECISIONS.md) forbids inventing
 *    one, superset because a measured goal quietly dropped looks like a goal nobody measured.
 * 3. **The guard fires.** Twelve mutations, applied to the **real** parsed campaign rather than to
 *    a hand-built object, for `goalRates.test.ts`'s stated reason.
 * 4. **The honesty rules hold on the strings a player actually reads** — the authored ones *and*
 *    the generated ones, over real batches on real buildings.
 * 5. **The bar reproduces.** The shipped setting is run as an arm of every judged batch, and its
 *    count is compared with the count the published table says it scored on those very seeds. This
 *    is the clause that catches a campaign quietly running a different configuration from the one
 *    its goals were measured on.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type DispatcherProfile, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { briefingFor } from './brief.js';
import { admitProfile } from './dimensions.js';
import { evidenceFrom, failStateCounts, failStateReports } from './failStates.js';
import { judgeStage, type StageReport } from './judge.js';
import { batchRequestForStage, demonstrationConfigFor, stageReplicationSeed } from './stageRun.js';
import { editableIdsOf, parseCampaign, playerFacingStrings, validateCampaign, type CampaignContext } from './parse.js';
import { FAIL_STATES, type Campaign, type CampaignStage } from './types.js';
import { PROBABILITY_WORDS, playerSafeDescription, probabilityWordIn } from './words.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { batchReport, type BatchReport } from '../batch/report.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources, BatchResult } from '../batch/types.js';
import { recordRun } from '../record/recordRun.js';
import { GOAL_READS, isPerReplicationGoal, type GoalKind } from '../scenario/goals.js';
import {
  validatePublishedGoalRates,
  type PublishedGoalRates,
  type PublishedScenario,
} from '../scenario/published.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';

let config: LoadedConfig;
let published: PublishedGoalRates;
let raw: unknown;
let campaign: Campaign;
let space: SearchSpace;
let context: CampaignContext;
let dimensionHelp: ReadonlyMap<string, string>;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  raw = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
  space = collectSearchSpace();
  const help = new Map<string, string>();
  for (const parameter of space.parameters) {
    if (parameter.description !== undefined) help.set(parameter.id, parameter.description);
  }
  dimensionHelp = help;
  context = {
    published,
    dimensionIds: space.ids,
    profileIds: new Set(config.dispatcherProfilesById.keys()),
    restrictedFloorIdsByBuilding: new Map(
      [...config.buildingsById.values()].map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
  };
  campaign = parseCampaign(raw, context);
}, 120_000);

function clone(): Campaign {
  return JSON.parse(JSON.stringify(campaign)) as Campaign;
}

function stageAt(index: number): CampaignStage {
  const stage = clone().stages[index];
  if (stage === undefined) throw new Error(`no stage ${String(index)}`);
  return stage;
}

function mutate(change: (campaign: Campaign) => void): readonly string[] {
  const mutated = clone();
  change(mutated);
  return validateCampaign(mutated, context);
}

function publishedFor(stage: CampaignStage): PublishedScenario {
  const entry = published.scenarios.find((candidate) => candidate.id === stage.id);
  if (entry === undefined) throw new Error(`no published entry for ${stage.id}`);
  return entry;
}

function resourcesFor(stage: CampaignStage): BatchResources {
  return {
    building: requireBuilding(config, stage.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

/** The loaded `data/`, as a function so the assertion above can shadow the name `config`. */
function config_(): LoadedConfig {
  return config;
}

function requireProfile(id: string): DispatcherProfile {
  const profile = config.dispatcherProfilesById.get(id);
  if (profile === undefined) throw new Error(`no dispatcher profile "${id}"`);
  return profile;
}

/** Run a stage exactly as `dev/campaignPanel.ts` does: two arms, the stage's own seeds. */
function playStage(stage: CampaignStage, candidateProfileId: string): {
  result: BatchResult;
  report: BatchReport;
  verdict: StageReport;
} {
  /*
   * The **shipped** request constructor, not a second copy of it. A suite that assembled its own
   * would keep passing while the panel drifted.
   */
  const result = runBatch(batchRequestForStage(stage, candidateProfileId), resourcesFor(stage));
  const report = batchReport(result);
  return { result, report, verdict: judgeStage({ stage, published: publishedFor(stage), result, report }) };
}

/* -------------------------------------------------------------------------- *
 * 1 — the shipped campaign
 * -------------------------------------------------------------------------- */

describe('the shipped campaign', () => {
  it('parses against the shipped goal table, buildings, profiles and the discovered space', () => {
    expect(validateCampaign(campaign, context)).toEqual([]);
  });

  it('is the seven stages of § 5.4, in order, one per measured scenario', () => {
    expect(campaign.stages.map((stage) => stage.id)).toEqual(
      published.scenarios.map((scenario) => scenario.id),
    );
    expect(campaign.stages).toHaveLength(7);
  });

  it('starts from a goal table that is itself valid', () => {
    /* A campaign checked against a malformed table is checked against nothing. */
    expect(validatePublishedGoalRates(published)).toEqual([]);
  });

  it('names no dimension the search space does not declare, and never writes the list down', async () => {
    const declared = new Set(space.ids);
    for (const stage of campaign.stages) {
      for (const id of editableIdsOf(stage.dispatcher.editable, space.ids)) {
        expect(declared.has(id), `${stage.id} offers ${id}`).toBe(true);
      }
    }
    /*
     * The other half of *"derive, never hard-code"*: no source file in `campaign/` may contain a
     * dimension id as a literal. `parse.ts` checks the data against the space; this checks the
     * code against the same rule, because a default written into a module would be exactly the
     * list this lane was told not to write.
     *
     * **The file list is read off the directory, not written here.** A hand-written list is the
     * shape `src/index.test.ts` had to fix in `experiments`: it covers the files that existed when
     * somebody wrote it, and the next module added to `campaign/` is the one nothing checks.
     */
    const files = (await readdir(new URL('.', import.meta.url))).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8');
      /*
       * Both comment forms are stripped, and the id is looked for **bare** rather than inside a
       * particular pair of quotes. The first draft matched `'weights.waitTime'` only, so a
       * double-quoted or backticked literal would have walked straight past a guard whose
       * assertions all still passed — § D159's fourth variant, in the guard rather than in the code.
       */
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const id of space.ids) {
        expect(code.includes(id), `${file} names the dimension ${id}`).toBe(false);
      }
    }
  });
});

describe('what running a stage is, on every stage', () => {
  it('puts the shipped setting first and everything the trace depends on on the request', () => {
    for (const stage of campaign.stages) {
      const request = batchRequestForStage(stage, 'nearest-car');
      expect(request.buildingId).toBe(stage.building);
      expect(request.seed).toBe(stage.seeds.seed);
      expect(request.durationS).toBe(stage.durationS);
      expect(request.replications).toBe(stage.replications);
      expect(request.arrivalRatePctPop5min).toBe(stage.traffic.arrivalRatePctPop5min);
      expect(request.arms[0]?.dispatcherProfileId).toBe(stage.dispatcher.startingProfileId);
      expect(request.arms[1]?.dispatcherProfileId).toBe('nearest-car');
    }
  });

  it('replays replication 0 at the same seed, horizon and demand — including the override', () => {
    /*
     * The demand-override branch fires on four of the seven stages and on none of the three whose
     * demonstration runs are asserted elsewhere in this file, so without this the half of
     * `demonstrationConfigFor` that ships on stages 2, 4, 6 and 7 has no test at all. Asserted
     * over **every** stage rather than a chosen one, which is what makes that impossible again.
     */
    let withOverride = 0;
    for (const stage of campaign.stages) {
      const config = demonstrationConfigFor({
        stage,
        building: requireBuilding(config_(), stage.building),
        dispatcherProfile: requireProfile(stage.dispatcher.startingProfileId),
        trafficProfiles: config_().trafficProfiles,
        elevatorSpecs: config_().elevatorSpecs,
        dispatcherProfiles: config_().dispatcherProfiles,
      });
      expect(config.seed).toBe(stageReplicationSeed(stage, 0));
      expect(config.durationS).toBe(stage.durationS);
      expect(config.onTimeout).toBe('report');
      if (stage.traffic.arrivalRatePctPop5min === null) {
        expect(config.demand?.arrivalRatePctPop5min).toBeUndefined();
      } else {
        withOverride += 1;
        expect(config.demand?.arrivalRatePctPop5min).toBe(stage.traffic.arrivalRatePctPop5min);
      }
    }
    expect(withOverride).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — no goal was authored
 * -------------------------------------------------------------------------- */

describe('every shipped goal came from the measured table', () => {
  it('is a subset of this stage’s "goals" bucket — a goal cannot be added by hand', () => {
    for (const stage of campaign.stages) {
      const measured = new Set<GoalKind>(publishedFor(stage).goals.map((record) => record.kind));
      for (const goal of stage.goals) {
        expect(measured.has(goal.kind), `${stage.id} declares ${goal.kind}`).toBe(true);
      }
    }
  });

  it('is also a superset of it — a measured goal cannot be dropped by hand', () => {
    for (const stage of campaign.stages) {
      const measured = publishedFor(stage).goals.map((record) => record.kind).sort();
      expect([...stage.goals.map((goal) => goal.kind)].sort()).toEqual(measured);
    }
  });

  it('carries no goal whose disposition is anything but "batch" — R12 left no other category', () => {
    for (const stage of campaign.stages) {
      for (const record of publishedFor(stage).goals) {
        expect(record.disposition).toBe('batch');
      }
    }
  });

  it('reads no quantity R1 forbids a score to be computed from', () => {
    const forbidden = new Set(['awtS', 'wt95S', 'ttdMeanS']);
    for (const stage of campaign.stages) {
      for (const goal of stage.goals) {
        if (!isPerReplicationGoal(goal.kind)) continue;
        for (const metric of GOAL_READS[goal.kind]) {
          expect(forbidden.has(metric), `${stage.id}/${goal.kind} reads ${metric}`).toBe(false);
        }
      }
    }
  });

  it('states every constant in the brief instead, and withholds what cannot be judged', () => {
    for (const stage of campaign.stages) {
      const entry = publishedFor(stage);
      const briefing = briefingFor({ stage, published: entry, dimensionIds: space.ids, dimensionHelp });
      expect(briefing.facts).toHaveLength(entry.configurationFacts.length);
      expect(briefing.withheld).toHaveLength(entry.withheld.length);
      /* `everyone-can-get-there` is published as withheld and must reach the reader as withheld. */
      expect(briefing.withheld.join(' ')).toContain('everyone-can-get-there');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the guard fires
 * -------------------------------------------------------------------------- */

describe('the guard fires — negative controls, applied to the shipped campaign', () => {
  it('positive control: the unmutated campaign produces no violation at all', () => {
    expect(validateCampaign(clone(), context)).toEqual([]);
  });

  it('catches a goal invented by hand', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.goals as { kind: GoalKind; threshold: number | null }[]).push({
        kind: 'nobody-abandoned',
        threshold: null,
      });
    });
    expect(violations.join('\n')).toContain('is not in this stage\'s measured "goals" bucket');
  });

  it('catches a measured goal dropped by hand', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.goals as unknown[]).shift();
    });
    expect(violations.join('\n')).toContain('the measured table ships');
  });

  it('catches a threshold moved away from the one the rate was measured at', () => {
    const violations = mutate((mutated) => {
      for (const stage of mutated.stages) {
        for (const goal of stage.goals) {
          if (goal.kind === 'long-waits-under') (goal as { threshold: number }).threshold = 15;
        }
      }
    });
    expect(violations.join('\n')).toContain('A different threshold is a different measurement');
  });

  it('catches a stage run at a demand level its goals were not measured at', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[1];
      if (stage === undefined) return;
      (stage.traffic as { arrivalRatePctPop5min: number | null }).arrivalRatePctPop5min = 4;
    });
    expect(violations.join('\n')).toContain('and its goals were measured at');
  });

  it('catches a stage run on a different building from the one measured', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage as { building: string }).building = 'midtown-office';
    });
    expect(violations.join('\n')).toContain('A pass rate is a property of one configuration');
  });

  it('catches a stage started on a dispatcher the bar was not measured against', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.dispatcher as { startingProfileId: string }).startingProfileId = 'nearest-car';
    });
    expect(violations.join('\n')).toContain('the bar was set by a different arm');
  });

  it('catches an editable dimension the search space does not declare', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage?.dispatcher.editable.mode !== 'listed') return;
      (stage.dispatcher.editable.ids as string[]).push('weights.enthusiasm');
    });
    expect(violations.join('\n')).toContain('which the search space does not declare');
  });

  it('catches a lever pointing at a dial the stage does not open', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      const outside = space.ids.find(
        (id) => !editableIdsOf(stage.dispatcher.editable, space.ids).includes(id),
      );
      if (outside === undefined) return;
      (stage.levers as Record<string, string | null>)['overwhelmed'] = outside;
    });
    expect(violations.join('\n')).toContain('does not let the player move');
  });

  it('catches a credential hint on a building with no credentials', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage?.dispatcher.editable.mode !== 'listed') return;
      const id = stage.dispatcher.editable.ids[0];
      (stage.levers as Record<string, string | null>)['locked-out'] = id ?? null;
    });
    expect(violations.join('\n')).toContain('declares no access-controlled floor');
  });

  it('catches a missing credential hint on a building that has them', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages.find((entry) => entry.building === 'secure-tower');
      if (stage === undefined) return;
      (stage.levers as Record<string, string | null>)['locked-out'] = null;
    });
    expect(violations.join('\n')).toContain('has no suggested lever');
  });

  it('catches a probability word in an authored brief — R10, at load time', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.brief as string[])[0] = 'A faster car is very likely to help here.';
    });
    expect(violations.join('\n')).toContain('R10');
    expect(violations.join('\n')).toContain('"likely"');
  });

  it('catches a holdout set that is not disjoint from the tuning set', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.holdoutSeeds as { seed: string }).seed = stage.seeds.seed;
    });
    expect(violations.join('\n')).toContain('the holdout validates nothing');
  });

  it('catches a stage judged over fewer runs than the project budgets for', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage as { replications: number }).replications = 10;
    });
    expect(violations.join('\n')).toContain('CLAUDE.md budgets');
  });

  it('catches a stage whose goals were never measured at all', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage as { id: string }).id = 'stage-0-invented';
    });
    expect(violations.join('\n')).toContain('has no entry in the published goal table');
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — which dimensions the player may move, enforced
 * -------------------------------------------------------------------------- */

describe('a stage judges only the changes it offered', () => {
  it('admits a profile that stays inside the stage’s dials, and names what it moved', () => {
    const stage = stageAt(0);
    const admission = admitProfile(
      space,
      requireProfile(stage.dispatcher.startingProfileId),
      requireProfile('nearest-car'),
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible).toBe(true);
    expect(admission.withinScope.map((moved) => moved.id)).toContain('weights.waitTime');
    expect(admission.sentence).toContain('weights.waitTime');
  });

  it('refuses one that moves a dial the stage did not open, and names the dial', () => {
    const stage = stageAt(0);
    const admission = admitProfile(
      space,
      requireProfile(stage.dispatcher.startingProfileId),
      requireProfile('energy-aware'),
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible).toBe(false);
    expect(admission.outOfScope.length).toBeGreaterThan(0);
    expect(admission.sentence).toContain('this stage does not open');
  });

  it('reports an unchanged choice as the control it is', () => {
    const stage = stageAt(0);
    const profile = requireProfile(stage.dispatcher.startingProfileId);
    const admission = admitProfile(space, profile, profile, editableIdsOf(stage.dispatcher.editable, space.ids));
    expect(admission.admissible).toBe(true);
    expect(admission.withinScope).toEqual([]);
    expect(admission.sentence).toContain('the control this surface is meant to survive');
  });

  it('opens every declared dimension on the stage that says so, without listing them', () => {
    const stage = campaign.stages[6];
    expect(stage?.dispatcher.editable.mode).toBe('every-declared-dimension');
    expect(editableIdsOf(stage?.dispatcher.editable ?? { mode: 'listed', ids: [] }, space.ids)).toEqual(
      space.ids,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 5 — the honesty rules, over real batches
 * -------------------------------------------------------------------------- */

describe('stage 1, played — the bar reproduces and standing still clears nothing', () => {
  let stage: CampaignStage;
  let unchanged: ReturnType<typeof playStage>;

  beforeAll(() => {
    stage = stageAt(0);
    unchanged = playStage(stage, stage.dispatcher.startingProfileId);
  }, 120_000);

  it('reproduces the published bar by running the shipped setting as its own arm', () => {
    for (const goal of unchanged.verdict.goals) {
      if (goal.reproduced === null) continue;
      expect(goal.reproduced, goal.sentence).toBe(true);
    }
  });

  it('clears nothing when nothing was changed — W3’s liveness control, on a scoreboard', () => {
    expect(unchanged.verdict.cleared).toBe(false);
    const comparison = unchanged.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met).toBe(false);
    expect(comparison?.sentence).toContain('not ordered');
  });

  it('scores every count goal exactly level against its own bar', () => {
    for (const goal of unchanged.verdict.goals) {
      if (goal.kind === 'beat-the-baseline') continue;
      expect(goal.met).toBe(true);
      expect(goal.sentence).toMatch(/passed (\d+) of 50 runs; the shipped setting passed \1 of 50/);
    }
  });

  it('R7 — the seed is on the report and replays the whole batch', () => {
    expect(unchanged.verdict.seed).toBe(stage.seeds.seed);
    const briefing = briefingFor({
      stage,
      published: publishedFor(stage),
      dimensionIds: space.ids,
      dimensionHelp,
    });
    expect(briefing.seedNote).toContain(stage.seeds.seed);
    expect(briefing.seedNote).toContain(stage.holdoutSeeds.seed);
  });

  it('R13 — every goal sentence carries the count it was computed from', () => {
    for (const goal of unchanged.verdict.goals) {
      expect(goal.sentence, goal.sentence).toMatch(/\b50\b/);
    }
    expect(unchanged.verdict.headline).toMatch(/\b50 runs\b/);
  });

  it('R2 — no sentence claims a dispatcher is better, only what happened over runs', () => {
    const texts = [
      unchanged.verdict.headline,
      ...unchanged.verdict.goals.flatMap((goal) => [goal.sentence, goal.note]),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/\bis (?:the )?better dispatcher\b/i);
      expect(text).not.toMatch(/\bbest dispatcher\b/i);
    }
    expect(unchanged.verdict.headline).toContain('not a ranking of dispatchers');
  });

  it('R11 — no energy row can decide a goal, however its interval fell', () => {
    const rows = unchanged.report.comparisons[0]?.rows ?? [];
    const axis = rows.filter((row) => row.metricClass === 'axis');
    expect(axis.length).toBeGreaterThan(0);
    for (const row of axis) expect(row.favours).toBeNull();
    for (const goal of unchanged.verdict.goals) {
      expect(goal.sentence).not.toContain('drive work');
    }
  });

  it('refuses to judge against a bar it cannot reproduce — the clause that makes "reproduced" real', () => {
    /*
     * Without this the `reproduced` assertions above could pass because nothing can ever set the
     * flag to `false`. A stage run on a seed set the table was not measured on is exactly the
     * mistake the flag exists for, so it is made here and the refusal is asserted.
     */
    const wrongSeeds: CampaignStage = {
      ...stage,
      seeds: { ...stage.seeds, seed: '424242' },
    };
    const played = playStage(wrongSeeds, wrongSeeds.dispatcher.startingProfileId);
    const counted = played.verdict.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counted.length).toBeGreaterThan(0);
    for (const goal of counted) {
      expect(goal.reproduced).toBe(false);
      expect(goal.met).toBeNull();
      expect(goal.sentence).toContain('not judged');
      expect(goal.note).toContain('a bar that does not reproduce is not a bar');
    }
    expect(played.verdict.cleared).toBe(false);
  }, 120_000);

  it('judges a changed setting, and says what moved', () => {
    const changed = playStage(stage, 'nearest-car');
    const comparison = changed.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met === true || comparison?.met === false).toBe(true);
    expect(comparison?.sentence).toMatch(/\b50 runs\b/);
    for (const goal of changed.verdict.goals) {
      if (goal.reproduced === null) continue;
      expect(goal.reproduced).toBe(true);
    }
  });
});

describe('stage 3, played — Overwhelmed is a result, and the refusal reaches the reader', () => {
  let stage: CampaignStage;
  let played: ReturnType<typeof playStage>;

  beforeAll(() => {
    stage = stageAt(2);
    played = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  it('keeps exactly one live count goal, which is what the measurement licensed', () => {
    const counted = stage.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counted.map((goal) => goal.kind)).toEqual(['nobody-abandoned']);
  });

  it('R3 — every suppressed estimate row states its reason and shows no number', () => {
    const rows = played.report.comparisons[0]?.rows ?? [];
    const suppressed = rows.filter((row) => row.verdict === 'suppressed');
    expect(suppressed.length).toBeGreaterThan(0);
    for (const row of suppressed) {
      expect(row.estimate).toBeNull();
      expect(row.sentence).toContain('there is no');
      expect(row.note.trim()).not.toBe('');
      expect(row.sentence).not.toMatch(/\b0\.00 s\b/);
    }
  });

  it('says the suppression happened in the goal that would otherwise have used it', () => {
    const comparison = played.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.note).toContain('could not be compared at all');
  });

  it('is Overwhelmed on most of its runs, as a frequency with its denominator', () => {
    const counts = failStateCounts(played.result.arms[1]?.replications ?? []);
    const overwhelmed = counts.find((count) => count.state === 'overwhelmed');
    expect(overwhelmed?.n).toBe(50);
    expect(overwhelmed?.runs ?? 0).toBeGreaterThan(0);
  });

  it('refuses to count locked-out calls rather than reporting zero of them', () => {
    const counts = failStateCounts(played.result.arms[1]?.replications ?? []);
    const locked = counts.find((count) => count.state === 'locked-out');
    expect(locked?.runs).toBeNull();
  });

  it('diagnoses the deepest landing by name, from one replayed run', () => {
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const overwhelmed = reports.find((report) => report.state === 'overwhelmed');
    expect(overwhelmed?.occurredInDemonstration).toBe(true);
    expect(overwhelmed?.diagnosis).toMatch(/^Run 1, seed \d+: the deepest landing was \S+, with \d+ people on it \d+ s into the run/);
    expect(overwhelmed?.lever).toContain('never the answer');
  });

  it('attaches no hint to a fail state that did not arise, and does attach one where it did', () => {
    /*
     * Found by driving: a row reading *"in 50 runs, 0 ended this way"* was printing a dial to try,
     * which is furniture rather than advice. The gate is asserted in both directions here so it
     * cannot be removed silently.
     */
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const counts = failStateCounts(played.result.arms[1]?.replications ?? []);
    for (const report of reports) {
      const count = counts.find((entry) => entry.state === report.state);
      const arose = report.occurredInDemonstration || (count?.runs ?? 0) > 0;
      if (arose) expect(report.lever, report.state).not.toBe('');
      else if (stage.levers[report.state] !== null) expect(report.lever, report.state).toBe('');
    }
    expect(reports.some((report) => report.lever !== '')).toBe(true);
    expect(reports.some((report) => report.lever === '')).toBe(true);
  });

  it('suggests no credential lever on a building with no credentials', () => {
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const locked = reports.find((report) => report.state === 'locked-out');
    expect(locked?.lever).toContain('declares no access-controlled floor');
  });
});

describe('stage 5, played — the credential is named, and the lesson is that it is not congestion', () => {
  let stage: CampaignStage;
  let played: ReturnType<typeof playStage>;

  beforeAll(() => {
    stage = stageAt(4);
    played = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  it('diagnoses locked-out landings by floor and by credential', () => {
    const reports = failStatesFor(stage, played.result, stage.dispatcher.startingProfileId);
    const locked = reports.find((report) => report.state === 'locked-out');
    expect(locked?.occurredInDemonstration).toBe(true);
    expect(locked?.diagnosis).toMatch(/holding [a-z-]+/);
    expect(locked?.sentence).toContain('It is not congestion');
  });

  it('clears the lockout when the call carries the credential', () => {
    const reports = failStatesFor(stage, played.result, 'destination-eta');
    const locked = reports.find((report) => report.state === 'locked-out');
    expect(locked?.occurredInDemonstration).toBe(false);
    expect(locked?.diagnosis).toContain('could legally be answered');
  });

  it('calls a setting ahead on one measure and behind on another a move along the front', () => {
    /*
     * Measured, not constructed: on Secure Tower `destination-eta` resolves **ahead** on people
     * carried and on rides that never boarded, and **behind** on rides over the long-wait
     * threshold. It is the case R11's front is about, and it is the case that makes the
     * "and nothing resolved against it" half of `beat-the-baseline` falsifiable — without it the
     * clause could be deleted and every other assertion here would still pass.
     */
    const played = playStage(stage, 'destination-eta');
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.filter((row) => row.favours === 'candidate').length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.favours === 'baseline').length).toBeGreaterThan(0);
    const comparison = played.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met).toBe(false);
    expect(comparison?.sentence).toContain('ahead on');
    expect(comparison?.sentence).toContain('behind on');
    expect(comparison?.sentence).toContain('a move along the front rather than a win');
  }, 120_000);

  it('opens the dial the lesson needs and refuses a profile that changes anything else', () => {
    const editable = editableIdsOf(stage.dispatcher.editable, space.ids);
    expect(editable).toContain('dispatch.callType');
    expect(
      admitProfile(space, requireProfile('collective'), requireProfile('destination-eta'), editable)
        .admissible,
    ).toBe(true);
    expect(
      admitProfile(space, requireProfile('collective'), requireProfile('predictive-balanced'), editable)
        .admissible,
    ).toBe(false);
  });
});

describe('stage 4, played — a stage that can actually be cleared', () => {
  it('clears when a setting resolves ahead and nothing resolves against it', () => {
    /*
     * The other end of the `beat-the-baseline` clause, and the answer to *"is this playable?"* in
     * the only form worth having: a **measured** clear, from a profile `data/` already ships,
     * inside the dimensions stage 4 opens.
     */
    const stage = stageAt(3);
    const played = playStage(stage, 'destination-eta');
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.filter((row) => row.favours === 'candidate').length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.favours === 'baseline')).toEqual([]);
    const comparison = played.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met).toBe(true);
    expect(played.verdict.cleared).toBe(true);
    expect(played.verdict.headline).toContain('all 3 goals reached over 50 runs');
    /* R2 survives the good news: the headline still says what the number is about. */
    expect(played.verdict.headline).toContain('not a ranking of dispatchers');
  }, 300_000);
});

/**
 * **Stage 6, after `vertical-city` declared an escalator at every one of its two-level lobbies.**
 *
 * The building's numbers moved twice: once when it declared the ground-lobby escalator — which took
 * `long-waits-under` out of this stage's `goals` bucket, because 49/50 tuning against 50/50 holdout
 * is a classification that does not survive the holdout — and again when it declared the three
 * sky-lobby ones. The second move was smaller: **one cell**, `answer-the-demand` from 7 of 50 to 6
 * of 50 on the holdout set, still a variable and still a batch goal. **No goal returned**, and none
 * was authored to replace the one that left; § D160 selects goals from the measured table and this
 * lane did not touch that rule.
 *
 * So the question *"is stage 6 still playable?"* is answered here the way stage 4's is: by playing
 * it. Four live goals, three of them counts whose bar is the shipped setting's own count, and the
 * comparison goal that no stage clears by standing still.
 */
describe('stage 6, played — four goals survive the escalators, and the bars still reproduce', () => {
  let stage: CampaignStage;
  let unchanged: ReturnType<typeof playStage>;

  beforeAll(() => {
    stage = stageAt(5);
    unchanged = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  it('carries four live goals — the three counts and the comparison', () => {
    expect(stage.goals.map((goal) => goal.kind)).toEqual([
      'deliver-everyone',
      'no-divergence',
      'answer-the-demand',
      'beat-the-baseline',
    ]);
  });

  it('reproduces every published bar on the changed building', () => {
    /*
     * The clause that would have caught the goal table going stale against the escalators: the
     * bars in `data/scenario-goals.json` are re-derived by running the stage, and a bar that no
     * longer reproduces is refused rather than judged.
     */
    let checked = 0;
    for (const goal of unchanged.verdict.goals) {
      if (goal.reproduced === null) continue;
      checked += 1;
      expect(goal.reproduced, goal.sentence).toBe(true);
    }
    expect(checked).toBe(3);
  });

  it('meets its three count goals at the shipped setting and clears on none of them', () => {
    // Standing still scores every count goal exactly level against its own bar — so the low
    // absolute rates (4 of 50 on `deliver-everyone`) are a **bar**, not a difficulty. What is
    // not cleared is the comparison, which is the whole of what this stage asks a player for.
    for (const goal of unchanged.verdict.goals) {
      if (goal.kind === 'beat-the-baseline') continue;
      expect(goal.met, goal.sentence).toBe(true);
    }
    const comparison = unchanged.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
    expect(comparison?.met).toBe(false);
    expect(unchanged.verdict.cleared).toBe(false);
  });

  /**
   * **The answer to "is it playable?", in stage 4's form: a measured clear.**
   *
   * `docs/10` § 5.4 and § 11 both said **three** stages clear from the dispatcher dropdown alone —
   * 3, 4 and 7 — and named stage 6 among the four that do not. That was measured while stage 6
   * carried five count goals; `long-waits-under` has since left its `goals` bucket, which is one
   * fewer bar a candidate has to match, and nothing re-measured the claim. It is four.
   *
   * Re-measured on the **pre-escalator** configuration it clears there too, so this is not a thing
   * the sky-lobby escalators did — it is a published claim that went stale with no tool re-deriving
   * it, which is what this test now is.
   */
  it('is clearable from the dropdown — the published count of three stages was four', () => {
    const played = playStage(stage, 'destination-eta');
    for (const goal of played.verdict.goals) {
      expect(goal.met, goal.sentence).toBe(true);
      if (goal.reproduced !== null) expect(goal.reproduced).toBe(true);
    }
    expect(played.verdict.cleared).toBe(true);
    expect(played.verdict.headline).toContain('all 4 goals reached over 50 runs');
    /* R2 survives the good news here as it does on stage 4. */
    expect(played.verdict.headline).toContain('not a ranking of dispatchers');
  }, 300_000);
});

describe('the decoder refuses rather than dropping', () => {
  it('throws on a structurally broken stage instead of quietly shipping six', () => {
    /*
     * `decodeStage` returns `undefined` for a stage it cannot read, and a dropped stage would
     * validate perfectly — the campaign would simply be one shorter, which is the silent shape
     * this repository keeps finding. `parseCampaign` composes the two passes so it cannot happen;
     * this is the assertion that composition is what ships.
     */
    const broken = JSON.parse(JSON.stringify(raw)) as { stages: Record<string, unknown>[] };
    delete broken.stages[0]?.['seeds'];
    expect(() => parseCampaign(broken, context)).toThrow(/seeds/);
  });
});

/* -------------------------------------------------------------------------- *
 * R10 over every string a player can read
 * -------------------------------------------------------------------------- */

describe('R10 — no probability word reaches a player-facing string', () => {
  it('holds over every authored string in data/campaign.json', () => {
    for (const stage of campaign.stages) {
      for (const [label, text] of playerFacingStrings(stage)) {
        expect(probabilityWordIn(text), `${stage.id} ${label}: ${text}`).toBeNull();
      }
    }
  });

  it('holds over every generated briefing sentence', () => {
    for (const stage of campaign.stages) {
      const briefing = briefingFor({
        stage,
        published: publishedFor(stage),
        dimensionIds: space.ids,
        dimensionHelp,
      });
      const texts = [
        briefing.configuration,
        briefing.seedNote,
        ...briefing.sentences,
        ...briefing.facts,
        ...briefing.withheld,
        ...briefing.goals,
        ...briefing.editable.map((dimension) => dimension.help ?? ''),
      ];
      for (const text of texts) expect(probabilityWordIn(text), text).toBeNull();
    }
  });

  it('holds over every verdict and every fail-state sentence a played stage produces', () => {
    const stage = stageAt(0);
    const played = playStage(stage, 'nearest-car');
    const reports = failStatesFor(stage, played.result, 'nearest-car');
    const texts = [
      played.verdict.headline,
      ...played.verdict.goals.flatMap((goal) => [goal.sentence, goal.note]),
      ...reports.flatMap((report) => [report.frequency, report.sentence, report.diagnosis, report.lever]),
    ];
    for (const text of texts) expect(probabilityWordIn(text), text).toBeNull();
  }, 120_000);

  it('replaces a schema description that carries one, and passes a clean one through', () => {
    /*
     * Independent of whether `core`'s prose still contains the word: this pins the *filter*, so
     * the rule survives somebody rewriting `idle.predictorHorizonS`'s description, and it fails if
     * the filter is turned into an identity function.
     */
    expect(playerSafeDescription('Seconds a chosen weight set must be held.')).toBe(
      'Seconds a chosen weight set must be held.',
    );
    expect(playerSafeDescription(undefined)).toBeNull();
    const refused = playerSafeDescription('the horizon sets what "likely to appear soon" means');
    expect(refused).not.toBeNull();
    expect(refused).toContain('is not reproduced here');
    expect(probabilityWordIn(refused ?? '')).toBeNull();
  });

  it('positive control: the word list catches the sentences R10 names', () => {
    for (const banned of [
      'your setting is probably a bit better',
      'the new weights are very likely faster',
      'there is a 95 % chance the difference is real',
      'that outcome is unlikely on this building',
    ]) {
      expect(PROBABILITY_WORDS.test(banned), banned).toBe(true);
    }
  });

  it('is at least as strict as the two suites that already hold a copy of this rule', () => {
    /*
     * `batch/report.test.ts` and `scenario/goals.test.ts` each declare their own pattern. Rewriting
     * theirs to import this one would edit a landed lane's guard, which is how a guard's meaning
     * erodes without its assertions changing (§ D159). This pins the divergence instead: every
     * word those suites name must trip this list too.
     */
    for (const word of [
      'likely',
      'unlikely',
      'probably',
      'probability',
      'chance',
      'chances',
      'odds',
      'certainly',
      'certain',
      'maybe',
      'perhaps',
      'presumably',
      'plausible',
      'good bet',
      'fifty-fifty',
    ]) {
      expect(PROBABILITY_WORDS.test(`it is ${word} so`), word).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Shared: the fail-state path, exactly as the panel runs it
 * -------------------------------------------------------------------------- */

function failStatesFor(stage: CampaignStage, result: BatchResult, candidateProfileId: string) {
  const building = requireBuilding(config, stage.building);
  const profile = requireProfile(candidateProfileId);
  const replication = result.arms[1]?.replications ?? [];
  const seed = stageReplicationSeed(stage, 0).toString();
  /* The batch's own replication-0 seed, asserted rather than assumed to be the same number. */
  expect(replication[0]?.seed).toBe(seed);
  const { recording } = recordRun(
    demonstrationConfigFor({
      stage,
      building,
      dispatcherProfile: profile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
    }),
  );
  return failStateReports({
    stage,
    counts: failStateCounts(replication),
    evidence: evidenceFrom({
      recording,
      replication: 0,
      seed,
      restrictedFloorIds: restrictedFloorIds(
        building.floors.map((floor) => floor.id),
        building.accessZones,
      ),
      carriesCredential: credentialCapabilityOf(profile).carriesCredential,
    }),
    dimensionHelp,
  });
}

/* -------------------------------------------------------------------------- *
 * The four fail states are all four, always
 * -------------------------------------------------------------------------- */

describe('the fail states', () => {
  it('are R4’s four, in R4’s order of preference, on every stage', () => {
    expect([...FAIL_STATES]).toEqual(['overwhelmed', 'abandoned', 'stranded', 'locked-out']);
    for (const stage of campaign.stages) {
      expect(Object.keys(stage.levers).sort()).toEqual([...FAIL_STATES].sort());
    }
  });
});
