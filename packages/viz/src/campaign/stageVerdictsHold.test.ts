/**
 * **No shipped stage verdict moves** — the decision panel's ruling R1 on GitHub issue #645,
 * amendment 2 ([§ D1602](../../../../DECISIONS.md)).
 *
 * Delta A rewrote the words of every stage verdict: the comparison goal's sentence, the held-back
 * crowds' sentence, the headline's holdout clause and a drive-work line. A word may not move a
 * verdict, and the ruling asked for that to be held by a run on every shipped stage rather than by
 * regenerating the survivor census, which hashes no code and takes hours (`data/scenario-survivors.json`
 * would come back byte-identical whatever `judge.ts` said, because its inputs hash is of `data/`).
 *
 * ## The form, and what it costs
 *
 * One case per shipped stage, each pressed **through the player's press** —
 * `stagePress.ts#pressStage`, the admission and then the shipped two-batch sequence, so a holdout is
 * run exactly where the stage page runs one — at the stage's base rung. On every stage it presses:
 *
 * - **the first way through the census names at the base rung**, which the census published as
 *   cleared, so `met`, `held` and `cleared` must all be `true`; or, on a stage the census names none
 *   at all, **the unchanged press**, which no setting can clear, so all three must be false or unrun;
 * - on stage 1, **the six presses CYCLE-1's playtest replayed**, with all three pinned as measured on
 *   `96f83c9`, the tree before the words changed;
 * - on stages 5 and 7, **the dropdown entries registered as met on the stage's own crowds and refused
 *   on the held-back ones** (`difficultyCurve.test.ts#DROPDOWN_CLEARS_REFUSED_ON_HOLDOUT`, measured
 *   2026-09-11 and § D1426), so a `held: false` is held somewhere other than stage 1.
 *
 * Measured 2026-10-19 on a four-core box with one other suite running: 129 s over the ten cases,
 * stage 3 the dearest at 45 s and none near the 300 000 ms ceiling each is annotated with. That is
 * the price of comparing on the runs. What it does not cover, stated
 * rather than implied: every other press the census examined. The deep replay
 * (`scenario/survivorReplay.test.ts`, `ELEVATOR_SIM_SURVIVORS=deep`) presses every named way through.
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import { namedStageMoveOf, parkedMoveOf } from '../everyday/stagePlay.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { loadSurvivorFixture } from '../scenario/regenerateSurvivors.test-helper.js';
import type { PublishedGoalRates } from '../scenario/published.js';
import type { PublishedSurvivors } from '../scenario/survivors.js';

import { pressStage, stageUnitsAt, type StageMove } from './stagePress.js';
import type { CampaignStage } from './types.js';

/** The shipped stage ids, read synchronously so each is a case of its own (`judgeCleared.test.ts`'s reason). */
const STAGE_IDS: readonly string[] = (
  JSON.parse(readFileSync(join(DATA_DIR, 'campaign.json'), 'utf8')) as {
    readonly stages: readonly { readonly id: string }[];
  }
).stages.map((stage) => stage.id);

/** `met`, `held` and `cleared` as one press returns them; `held` is `null` where no holdout ran. */
type Verdict = readonly [met: boolean, held: boolean | null, cleared: boolean];

const CLEARED: Verdict = [true, true, true];
const MISSED: Verdict = [false, null, false];
const MET_NOT_HELD: Verdict = [true, false, false];

/** Stage 1's six playtest presses, through the shipped sequence, as `96f83c9` judged them. */
const STAGE_ONE_BEFORE: readonly (readonly [string, Verdict])[] = [
  ['unchanged', MISSED],
  ['collective-enroute', MISSED],
  ['lobby', MISSED],
  ['forecast', MET_NOT_HELD],
  ['mid-zone', CLEARED],
  ['nearest-car', MISSED],
];

/** Dropdown entries met on the stage's own crowds and refused on the held-back ones, as registered. */
const REGISTERED_HOLDOUT_REFUSALS: Readonly<Record<string, readonly string[]>> = {
  'stage-5-credentials': ['eta'],
  'stage-7-prove-it': ['predictive-balanced'],
};

let config: LoadedConfig;
let space: SearchSpace;
let stages: readonly CampaignStage[];
let published: PublishedGoalRates;
let census: PublishedSurvivors;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  const fixture = await loadSurvivorFixture();
  stages = fixture.campaign.stages;
  published = fixture.published;
  census = JSON.parse(await readFile(join(DATA_DIR, 'scenario-survivors.json'), 'utf8')) as PublishedSurvivors;
}, 120_000);

function stageNamed(id: string): CampaignStage {
  const stage = stages.find((entry) => entry.id === id);
  if (stage === undefined) throw new Error(`the campaign ships no stage ${id}`);
  return stage;
}

/** Press one move on a stage at its base rung, the way the stage page does, and read the three. */
async function press(stage: CampaignStage, move: StageMove): Promise<Verdict> {
  const scenario = published.scenarios.find((entry) => entry.id === stage.id);
  if (scenario === undefined) throw new Error(`${stage.id}: no published goal row`);
  const building = requireBuilding(config, stage.building);
  const pressed = await pressStage({
    stage,
    published: scenario,
    context: {
      space,
      schedule: shippedPriceSchedule(),
      baseline: requireDispatcher(config, stage.dispatcher.startingProfileId),
      building,
      elevatorSpecs: config.elevatorSpecs,
    },
    move,
    budgetUnits: stageUnitsAt(stage, null),
    run: (request) =>
      runBatch(request, {
        building,
        dispatcherProfiles: config.dispatcherProfiles,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
      }),
  });
  if (pressed.kind === 'refused') throw new Error(`${stage.id}: refused, ${pressed.admission.sentence}`);
  const { verdict } = pressed.outcome;
  return [verdict.metOnTuningSeeds, verdict.holdout?.held ?? null, verdict.cleared];
}

/** The presses held on one stage, each with the verdict it must return. */
function pressesOf(stage: CampaignStage): readonly (readonly [string, StageMove, Verdict])[] {
  const out: (readonly [string, StageMove, Verdict])[] = [];
  const profiles = config.dispatcherProfiles.profiles;
  const own = requireDispatcher(config, stage.dispatcher.startingProfileId);
  const base = census.scenarios.find((row) => row.id === stage.id)?.steps.find((step) => step.stepId === null);
  const witness = base?.survivorNames[0];
  if (witness !== undefined) {
    const move = namedStageMoveOf(witness, profiles, space);
    if (move === undefined) throw new Error(`${stage.id}: the census names "${witness}", which no press makes`);
    out.push([`the census's way through, ${witness}`, move, CLEARED]);
  } else {
    out.push(['unchanged, on a stage the census names no way through', { profile: own }, MISSED]);
  }
  for (const id of REGISTERED_HOLDOUT_REFUSALS[stage.id] ?? []) {
    out.push([`${id}, registered as refused on the held-back crowds`, { profile: requireDispatcher(config, id) }, MET_NOT_HELD]);
  }
  if (stage === stages[0]) {
    const collective = requireDispatcher(config, 'collective');
    const moves: Readonly<Record<string, StageMove>> = {
      unchanged: { profile: collective },
      'collective-enroute': { profile: requireDispatcher(config, 'collective-enroute') },
      lobby: parkedMoveOf(collective, 'lobby', space),
      forecast: parkedMoveOf(collective, 'predicted-demand', space),
      'mid-zone': parkedMoveOf(collective, 'zone-center', space),
      'nearest-car': { profile: requireDispatcher(config, 'nearest-car') },
    };
    for (const [name, verdict] of STAGE_ONE_BEFORE) {
      const move = moves[name];
      if (move === undefined) throw new Error(`no move for ${name}`);
      out.push([name, move, verdict]);
    }
  }
  return out;
}

describe('no shipped stage verdict moves when its words do — ruling R1, § D1602', () => {
  it('sweeps every stage the campaign ships, and stage 1 is the one the playtest played', () => {
    expect([...STAGE_IDS].sort()).toEqual(stages.map((stage) => stage.id).sort());
    expect(stages[0]?.building).toBe('garden-apartments');
    /* Non-vacuity: the census names a way through somewhere, and the met-not-held entries are on stages it ships. */
    expect(census.scenarios.some((row) => (row.steps[0]?.survivorNames.length ?? 0) > 0)).toBe(true);
    for (const id of Object.keys(REGISTERED_HOLDOUT_REFUSALS)) expect(STAGE_IDS).toContain(id);
  });

  for (const id of STAGE_IDS) {
    it(`${id}: met, held and cleared are what the census and the record say`, async () => {
      const stage = stageNamed(id);
      const presses = pressesOf(stage);
      expect(presses.length).toBeGreaterThan(0);
      for (const [name, move, expected] of presses) {
        expect(await press(stage, move), `${id}, ${name}`).toEqual(expected);
      }
    }, 300_000);
  }
});
