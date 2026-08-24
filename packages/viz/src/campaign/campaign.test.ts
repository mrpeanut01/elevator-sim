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
import { resolveEditedProfile, type EditedVector } from '../controls/editedProfile.js';
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

/**
 * Run a stage exactly as `dev/campaignPanel.ts` does: two arms, the stage's own seeds.
 *
 * `edit` is W6's player move — an **edited weight vector** instead of a dropdown choice. It goes
 * through the same `batchRequestForStage` the panel calls, so the suite cannot exercise a second
 * version of what a stage run with an edit is.
 */
function playStage(
  stage: CampaignStage,
  candidateProfileId: string,
  edit?: EditedVector,
): {
  result: BatchResult;
  report: BatchReport;
  verdict: StageReport;
} {
  /*
   * The **shipped** request constructor, not a second copy of it. A suite that assembled its own
   * would keep passing while the panel drifted.
   */
  const result = runBatch(batchRequestForStage(stage, candidateProfileId, edit), resourcesFor(stage));
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

  it('is one stage per measured scenario, in order', () => {
    // Derived from the goal table, which is the point: a stage without a measured pass rate is a
    // level shipped on a goal nobody has taken a rate of, and R12 forbids it. The length is checked
    // against the table rather than against a literal, which had been `7` and is now the campaign's
    // to grow.
    expect(campaign.stages.map((stage) => stage.id)).toEqual(
      published.scenarios.map((scenario) => scenario.id),
    );
    expect(campaign.stages).toHaveLength(published.scenarios.length);
    expect(campaign.stages.length).toBeGreaterThanOrEqual(7);
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

  /**
   * **The answer to "is this playable?", and § D265 moved it here from stage 4.**
   *
   * This was stage 4's case — *a measured clear, from a profile `data/` already ships, inside the
   * dimensions the stage opens*. It has to live somewhere, because a campaign whose every stage is
   * unwinnable from the dropdown is a product claim nobody is re-deriving; and it has to live where
   * the measurement puts it, not where it was written. Swept over the thirteen shipped profiles at
   * the stage's own seeds, stage 4 now clears on **none** and stage 5 clears on **several**, so the
   * two cases swapped buildings. § D254 is what moved them: it changed what every conventional arm
   * on every access-zoned building does, and `beat-the-baseline` is a comparison against the
   * stage's own starting profile.
   *
   * Written as a **search with a stated floor** rather than a pinned profile id: which profile
   * clears is a measurement that will move again, and a test naming one would be re-pinned every
   * time without anybody re-reading the claim. What may not move is that at least one does.
   */
  it('clears from the dropdown — the measured answer to whether a stage can be won', () => {
    const clears = [];
    for (const profile of config.dispatcherProfiles.profiles) {
      const attempt = playStage(stage, profile.id);
      const rows = attempt.report.comparisons[0]?.rows ?? [];
      if (!attempt.verdict.cleared) continue;
      clears.push(profile.id);
      // The clear is the shape `beat-the-baseline` describes and not an accident of an empty
      // comparison: something resolved ahead, and nothing resolved against.
      expect(rows.filter((row) => row.favours === 'candidate').length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.favours === 'baseline')).toEqual([]);
      for (const goal of attempt.verdict.goals) expect(goal.met, goal.sentence).toBe(true);
      /* R2 survives the good news: the headline still says what the number is about. */
      expect(attempt.verdict.headline).toContain('not a ranking of dispatchers');
    }
    expect(clears.length, 'no shipped profile clears stage 5 from the dropdown').toBeGreaterThan(0);
  }, 3_000_000);

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

describe('stage 4, played — a setting that buys one thing by spending another', () => {
  /**
   * **The other end of the `beat-the-baseline` clause, and § D265 moved it here from stage 5.**
   *
   * This describe used to be *"a stage that can actually be cleared"*. It is not one any more:
   * swept over the thirteen shipped profiles at the stage's own seeds, **not one clears stage 4** —
   * `zoned-uppeak` comes closest at 2 metrics for and 1 against — and the measured clear has moved
   * to stage 5, where it is asserted. § D254 is what moved it, by changing what every conventional
   * arm on an access-zoned building does.
   *
   * What stage 4 has instead is the **front**: a profile that resolves ahead on one measure and
   * behind on another, which is the case R11 is about and the case that makes the *"and nothing
   * resolved against it"* half of `beat-the-baseline` falsifiable. Without a witness somewhere that
   * clause could be deleted and every other assertion in this file would still pass.
   *
   * A search rather than a pinned profile id, for the reason stage 5's clear is one.
   */
  it('calls a setting ahead on one measure and behind on another a move along the front', () => {
    const stage = stageAt(3);
    let witnesses = 0;
    for (const profile of config.dispatcherProfiles.profiles) {
      const played = playStage(stage, profile.id);
      const rows = played.report.comparisons[0]?.rows ?? [];
      const ahead = rows.filter((row) => row.favours === 'candidate').length;
      const behind = rows.filter((row) => row.favours === 'baseline').length;
      // Nothing clears this stage from the dropdown any more, and that is asserted rather than
      // assumed: the day something does, this fails and the claim above gets re-read.
      expect(played.verdict.cleared, `${profile.id} clears stage 4`).toBe(false);
      if (ahead === 0 || behind === 0) continue;
      witnesses += 1;
      const comparison = played.verdict.goals.find((goal) => goal.kind === 'beat-the-baseline');
      expect(comparison?.met).toBe(false);
      expect(comparison?.sentence).toContain('ahead on');
      expect(comparison?.sentence).toContain('behind on');
      expect(comparison?.sentence).toContain('a move along the front rather than a win');
    }
    expect(witnesses, 'no shipped profile lands on the front on stage 4').toBeGreaterThan(0);
  }, 3_000_000);
});

/* -------------------------------------------------------------------------- *
 * Stage 2, played on an **edited** weight vector — W6, and § D161's known limit
 * -------------------------------------------------------------------------- */

describe('stage 2, played on an edited weight vector — the thing a dropdown could not do', () => {
  /**
   * The vector, and it is not a shipped profile.
   *
   * [§ D161](../../../../DECISIONS.md) measured that **three** of the seven stages clear from the
   * dispatcher dropdown alone — 3, 4 and 7 — and named the reason the other four do not:
   * *"the player's move is a shipped profile, not a live weight editor … so four stages need an
   * authored weight vector to clear."* Stage 2 is one of the four. This is that vector.
   *
   * Two dimensions, both inside the sixteen stage 2 declares editable. Found by sweeping
   * `weights.loadFactor` on the stage's own tuning seeds, which is exactly the thing the second
   * test below is about.
   */
  const EDIT: EditedVector = {
    baseProfileId: 'collective',
    profileId: 'collective-edited',
    values: { 'weights.waitTime': 1, 'weights.loadFactor': 2.25 },
  };

  it('clears — three goals, and the comparison resolves for the candidate on two measures', () => {
    const stage = stageAt(1);
    const played = playStage(stage, stage.dispatcher.startingProfileId, EDIT);
    expect(played.verdict.cleared).toBe(true);
    for (const goal of played.verdict.goals) {
      expect(goal.met, goal.sentence).toBe(true);
    }
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.filter((row) => row.favours === 'candidate').length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.favours === 'baseline')).toEqual([]);
    /* R2 survives the good news, as it does on stage 4. */
    expect(played.verdict.headline).toContain('not a ranking of dispatchers');
  }, 300_000);

  it('runs a profile `data/` does not contain, and the report names the thing that ran', () => {
    // The claim W6 actually makes. `data/dispatcher-profiles.json` has no `collective-edited`, so
    // a batch that resolved arms by id alone could not have run this at all — which is precisely
    // what § D161 recorded as the limitation.
    expect(config.dispatcherProfilesById.has('collective-edited')).toBe(false);
    const stage = stageAt(1);
    const played = playStage(stage, stage.dispatcher.startingProfileId, EDIT);
    /*
     * The **resolved** id on the result, and the base id on the request. Found by driving: with
     * the request's id on the result the comparison rows read *"the difference between collective
     * and collective"* on a batch whose two arms were a shipped profile and an edit of it, so the
     * one surface whose job is telling two arms apart could not.
     */
    expect(played.result.arms[0]?.dispatcherProfileId).toBe('collective');
    expect(played.result.arms[1]?.dispatcherProfileId).toBe('collective-edited');
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.some((row) => row.sentence.includes('collective-edited'))).toBe(true);
  }, 300_000);

  it('**does not survive the holdout seed set**, and the suite carries that half too', () => {
    /*
     * CLAUDE.md § Tuning discipline, arriving as a measurement rather than as a caution: *"Hold
     * out traffic seeds. Tune on one seed set, validate on a disjoint one, or you overfit the
     * weight vector to specific passenger traces and the gain vanishes on new traffic."*
     *
     * It vanished, and worse than vanished. On stage 2's declared holdout seeds the same vector is
     * beaten by the shipped setting on **three** measures, and `beat-the-baseline` resolves
     * against it. The sensitivity is visible in the sweep that found it: `2.2`, `2.25` and `2.3`
     * clear and `2.35` does not.
     *
     * This is asserted rather than mentioned because the alternative — a suite that records the
     * clear and not the failure to generalise — would be publishing the flattering half of a
     * measurement, and § 11 W6's *"a stage cleared on an edited vector"* would read as a stronger
     * result than it is. **The campaign judges on the tuning seeds, so a live weight editor makes
     * overfitting them the dominant strategy**, and nothing in the shipped surface says so. That is
     * a finding about the campaign, not about this vector.
     */
    const stage = stageAt(1);
    const onHoldout: CampaignStage = {
      ...stage,
      seeds: stage.holdoutSeeds,
      holdoutSeeds: stage.seeds,
    };
    const played = playStage(onHoldout, stage.dispatcher.startingProfileId, EDIT);
    expect(played.verdict.cleared).toBe(false);
    const rows = played.report.comparisons[0]?.rows ?? [];
    expect(rows.filter((row) => row.favours === 'baseline').length).toBeGreaterThan(0);
    /*
     * And the count goals are `null` there rather than failed, which is `judge.ts` refusing to
     * judge against a bar that does not reproduce — the published counts are the tuning set's.
     * Stated so a reader does not mistake a refusal for a defeat.
     */
    const counts = played.verdict.goals.filter((goal) => goal.kind !== 'beat-the-baseline');
    expect(counts.length).toBeGreaterThan(0);
    for (const goal of counts) expect(goal.met).toBeNull();
  }, 300_000);

  it('refuses an edited vector that leaves the dimensions this stage opened', () => {
    // `idle.parkingStrategy` is a real dimension and stage 2 does not declare it editable. The
    // refusal is `admitProfile`'s, on the **resolved** dispatcher, so an edit is held to exactly
    // the rule a shipped profile is.
    const stage = stageAt(1);
    const outOfScope = resolveEditedProfile(space, requireProfile('collective'), {
      baseProfileId: 'collective',
      profileId: 'collective-edited',
      values: { 'idle.parkingStrategy': 'lobby' },
    });
    expect(outOfScope.ok, outOfScope.ok ? '' : outOfScope.reason).toBe(true);
    if (!outOfScope.ok) return;
    const admission = admitProfile(
      space,
      requireProfile(stage.dispatcher.startingProfileId),
      outOfScope.profile,
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible).toBe(false);
    expect(admission.sentence).toContain('idle.parkingStrategy');
  });
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
describe('stage 6, played — three goals survive the escalators, and the bars still reproduce', () => {
  let stage: CampaignStage;
  let unchanged: ReturnType<typeof playStage>;

  beforeAll(() => {
    stage = stageAt(5);
    unchanged = playStage(stage, stage.dispatcher.startingProfileId);
  }, 300_000);

  /**
   * **Three, not four, and the missing one is `no-divergence`.**
   *
   * § D254 made this building serviceable and `no-divergence` went to `50/50, 50/50` — a constant,
   * which R12 makes a fact for the briefing rather than a goal, so it left the `goals` bucket and
   * issue #88 recorded the drop. § D265 puts `deliver-everyone` back: the credential gap turns a
   * declared share of in-building journeys away, so *"everybody who arrived was carried"* is a
   * question again — `40/50` on the tuning seeds and `46/50` on the holdout, published in
   * `data/scenario-goals.json` beside the goal, which is R12's whole requirement.
   *
   * So the count went 4 → 2 → 3, and each move is a measurement rather than an edit. The list is
   * asserted rather than the length, because *which* three is the part that would go stale.
   */
  it('carries three live goals — the two counts and the comparison', () => {
    expect(stage.goals.map((goal) => goal.kind)).toEqual([
      'deliver-everyone',
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
    expect(checked).toBe(2);
  });

  it('meets its two count goals at the shipped setting and clears on none of them', () => {
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
   * **Not clearable from the dropdown any more, and that is a measurement rather than a gap.**
   *
   * This case asserted that `destination-eta` clears stage 6, and it was true when it was written.
   * It is not true now, and the change is § D254's rather than § D265's: making this building
   * serviceable moved every conventional arm's numbers, and `beat-the-baseline` is a comparison
   * against the stage's own starting profile. Swept over **all thirteen shipped profiles** at the
   * stage's own seeds, not one of them resolves ahead on a metric without also resolving behind on
   * one — `zoned-uppeak` comes closest at 1 for and 4 against — so `beat-the-baseline` is met by
   * none and `cleared` is `false` for all thirteen.
   *
   * The claim is therefore **inverted rather than deleted**, which is the only honest option: a
   * case that stopped asking would leave the published *"three stages clear from the dropdown"*
   * count with nothing re-deriving it, which is the exact failure this case was added to fix. What
   * it now pins is the negative, with the witness that comes closest named — so the day a profile
   * does clear it, this fails and says so.
   *
   * **Stage 6 is still playable**, and by the mechanism § D161 already documents for the four
   * stages that never cleared from the dropdown: an edited weight vector. That is stage 2's
   * apparatus and it is not re-run here.
   */
  it('is not clearable from the dropdown by any shipped profile, and names the closest', () => {
    const outcomes = config.dispatcherProfiles.profiles.map((profile) => {
      const played = playStage(stage, profile.id);
      const rows = played.report.comparisons[0]?.rows ?? [];
      return {
        id: profile.id,
        cleared: played.verdict.cleared,
        for: rows.filter((row) => row.favours === 'candidate').length,
        against: rows.filter((row) => row.favours === 'baseline').length,
      };
    });
    for (const outcome of outcomes) {
      expect(outcome.cleared, `${outcome.id} clears stage 6 from the dropdown`).toBe(false);
    }
    // Not vacuous: somebody does resolve ahead on something, so the refusal is `beat-the-baseline`
    // asking for a dominating move rather than the comparison being dead.
    const ahead = outcomes.filter((outcome) => outcome.for > 0);
    expect(ahead.length).toBeGreaterThan(0);
    for (const outcome of ahead) expect(outcome.against).toBeGreaterThan(0);
  }, 3_000_000);
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
