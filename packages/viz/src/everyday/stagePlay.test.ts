/**
 * **A campaign stage in the fix-it editor, as words and decisions** — `everyday/stagePlay.ts`,
 * [§ D1129](../../../../DECISIONS.md).
 *
 * Four claims, each a clause of the swarm's Q3 ruling:
 *
 * 1. **The page admits what the census counted, and nothing else.** Every price and refusal on it is
 *    `campaign/stagePress.ts#admitStageMove`'s at the stage's base rung, so the named ways through the
 *    hub publishes are pressable and a setting the budget cannot pay for is refused with its price.
 * 2. **Its two controls reach the run, compared on the legs** — `CLAUDE.md`'s standing requirement.
 *    Picking a standing order and moving where idle cars wait each change the candidate arm's
 *    dispatcher, and that dispatcher's demonstration legs, on the stage's own building.
 * 3. **A clear pays once and says so, and unlocks nothing.**
 * 4. **A held stage is drawn with its reason and no press.**
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { restrictedFloorIds } from '../access/zoning.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import { batchRequestForStage, demonstrationConfigFor } from '../campaign/stageRun.js';
import { admitStageMove, routeRefusalsOf, stageUnitsAt } from '../campaign/stagePress.js';
import type { CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { PublishedGoalRates } from '../scenario/published.js';
import type { PublishedSurvivors } from '../scenario/survivors.js';
import {
  STAGE_PLAY_COPY,
  stageFactsOf,
  namedStageMoveOf,
  stageMoveOf,
  stagePageMovesOf,
  stagePlayViewOf,
  verdictFactsOf,
  type StagePlayChoice,
  type StagePlayVerdictFacts,
} from './stagePlay.js';

let config: LoadedConfig;
let space: SearchSpace;
let stages: readonly CampaignStage[];
let survivors: PublishedSurvivors;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  const published = JSON.parse(await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8')) as PublishedGoalRates;
  survivors = JSON.parse(await readFile(join(DATA_DIR, 'scenario-survivors.json'), 'utf8')) as PublishedSurvivors;
  const context: CampaignContext = {
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
    schedule: shippedPriceSchedule(),
  };
  stages = parseCampaign(JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')), context).stages;
}, 120_000);

function stageAt(index: number): CampaignStage {
  const stage = stages[index];
  if (stage === undefined) throw new Error(`no stage ${String(index)}`);
  return stage;
}

function admissionContextOf(stage: CampaignStage) {
  const baseline = config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId);
  if (baseline === undefined) throw new Error('no baseline');
  return {
    space,
    schedule: shippedPriceSchedule(),
    baseline,
    building: requireBuilding(config, stage.building),
    elevatorSpecs: config.elevatorSpecs,
  };
}

function factsOf(stage: CampaignStage, choice: StagePlayChoice, held?: string) {
  return stageFactsOf({
    stage,
    position: stages.indexOf(stage) + 1,
    total: stages.length,
    building: requireBuilding(config, stage.building),
    context: admissionContextOf(stage),
    profiles: config.dispatcherProfiles.profiles,
    schedule: shippedPriceSchedule(),
    held,
    award: 6,
    choice,
  });
}

/** The stage's own demonstration replication, folded to the legs `docs/12` § 5 clause 9 compares. */
function legsOf(stage: CampaignStage, choice: StagePlayChoice): string {
  const move = stageMoveOf(choice, config.dispatcherProfiles.profiles, { space });
  if (move === undefined) throw new Error('no move');
  const admission = admitStageMove(admissionContextOf(stage), move, stageUnitsAt(stage, null));
  if (admission.candidate === undefined) throw new Error(admission.sentence);
  const simulation = demonstrationConfigFor({
    stage,
    building: requireBuilding(config, stage.building),
    dispatcherProfile: admission.candidate,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  });
  return JSON.stringify(
    recordRun(simulation, { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
}

describe('the stage page admits what the census counted — § D1129 clause 1', () => {
  it('prices every named way through at the base rung and admits it', () => {
    let named = 0;
    for (const scenario of survivors.scenarios) {
      const stage = stages.find((entry) => entry.id === scenario.id);
      if (stage === undefined) continue;
      const base = scenario.steps.find((step) => step.stepId === null);
      const facts = factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null });
      for (const name of base?.survivorNames ?? []) {
        const offered = facts.profiles.find((profile) => profile.id === name);
        if (offered === undefined) continue;
        named += 1;
        expect(offered.admitted, `${stage.id}: the hub names ${name} and the page refuses it`).toBe(true);
        expect(offered.units).toBeLessThanOrEqual(facts.budgetUnits);
      }
    }
    expect(named, 'the census names no shipped profile, so this case tests nothing').toBeGreaterThan(0);
  });

  it('refuses a setting its budget cannot pay for, with the price, and draws the option disabled', () => {
    const stage = stageAt(0);
    const refused = factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }).profiles.find(
      (profile) => !profile.admitted,
    );
    if (refused === undefined) throw new Error('stage 1 refuses no shipped profile, so this case tests nothing');
    const facts = factsOf(stage, { profileId: refused.id, parking: null });
    const view = stagePlayViewOf(facts, { kind: 'idle' });
    expect(facts.admission.admitted).toBe(false);
    expect(view.refusal).toContain(`cost ${String(refused.units)} units`);
    expect(view.refusal).toContain(`opens on ${String(facts.budgetUnits)}`);
    const option = view.settingOptions.find((entry) => entry.value === refused.id);
    expect(option?.disabled).toBe(true);
    expect(option?.label).toContain(STAGE_PLAY_COPY.overBudget);
  });

  it('draws the building the stage runs on and the budget it opens on', () => {
    const stage = stageAt(0);
    const view = stagePlayViewOf(factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }), {
      kind: 'idle',
    });
    expect(view.buildingLine).toContain(requireBuilding(config, stage.building).name);
    expect(view.budgetLine).toContain(`${String(stageUnitsAt(stage, null))} units of change`);
    expect(view.eyebrow).toBe(`Stage 1 of ${String(stages.length)} on the path`);
  });

  it('names no engine identifier: every option is a profile’s name, never its id', () => {
    const stage = stageAt(0);
    const view = stagePlayViewOf(factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }), {
      kind: 'idle',
    });
    for (const option of view.settingOptions) {
      expect(option.label.startsWith(`${option.value} `), option.label).toBe(false);
    }
    /* `fixed-floor` needs a floor this page draws no control for, so it is not offered. */
    expect(view.parking.options.map((option) => option.value)).not.toContain('fixed-floor');
  });
});

describe('the two controls reach the run, compared on the legs — CLAUDE.md’s standing requirement', () => {
  it('a standing order picked by name changes the candidate arm and its legs', () => {
    const stage = stageAt(0);
    const standing = { profileId: stage.dispatcher.startingProfileId, parking: null } as const;
    const picked = { profileId: 'zoned-uppeak', parking: null } as const;
    const move = stageMoveOf(picked, config.dispatcherProfiles.profiles, { space });
    expect(move?.profile.id).toBe('zoned-uppeak');
    expect(batchRequestForStage(stage, move?.profile.id ?? '', move?.edit).arms[1]?.dispatcherProfileId).toBe('zoned-uppeak');
    expect(legsOf(stage, picked)).not.toEqual(legsOf(stage, standing));
  }, 120_000);

  it('where idle cars wait writes the parking dimension, and moves the legs', () => {
    const stage = stageAt(0);
    const standing = { profileId: stage.dispatcher.startingProfileId, parking: null } as const;
    const parked = { profileId: stage.dispatcher.startingProfileId, parking: 'zone-center' } as const;
    const move = stageMoveOf(parked, config.dispatcherProfiles.profiles, { space });
    expect(move?.edit?.values).toEqual({ 'idle.parkingStrategy': 'zone-center' });
    const request = batchRequestForStage(stage, move?.profile.id ?? '', move?.edit);
    expect(request.arms[1]?.edit?.values).toEqual({ 'idle.parkingStrategy': 'zone-center' });
    expect(legsOf(stage, parked)).not.toEqual(legsOf(stage, standing));
  }, 120_000);

  it('drops an edit that writes the value the profile already holds', () => {
    const stage = stageAt(0);
    const standingValue = String(
      admissionContextOf(stage).baseline.idle?.parkingStrategy ?? 'stay',
    ) as StagePlayChoice['parking'];
    const move = stageMoveOf(
      { profileId: stage.dispatcher.startingProfileId, parking: standingValue },
      config.dispatcherProfiles.profiles,
      { space },
    );
    expect(move?.edit).toBeUndefined();
  });
});

describe('a clear pays once, flat, and unlocks nothing — § D1129 clause 4', () => {
  const verdict = (cleared: boolean, paid: StagePlayVerdictFacts['paid']): StagePlayVerdictFacts => ({
    headline: 'judge headline',
    goals: [{ label: 'Beat the baseline', met: cleared, sentence: 'judge sentence', perRun: false }],
    holdoutSentence: cleared ? 'held on the held-back crowds' : null,
    metOnTuningSeeds: cleared,
    cleared,
    paid,
  });

  it('says the award on the first clear, nothing on a second, and no unlock on either', () => {
    const stage = stageAt(0);
    const facts = factsOf(stage, { profileId: 'zoned-uppeak', parking: null });
    const first = stagePlayViewOf(facts, { kind: 'judged', verdict: verdict(true, 'first'), stale: false }).verdict;
    expect(first?.head).toBe(STAGE_PLAY_COPY.clearedHead);
    expect(first?.pay).toBe('This clear pays 6 chimes, the first time only.');
    expect(first?.unlock).toBe(STAGE_PLAY_COPY.unlocksNothing);
    const again = stagePlayViewOf(facts, { kind: 'judged', verdict: verdict(true, 'again'), stale: false }).verdict;
    expect(again?.pay).toBe(STAGE_PLAY_COPY.paysOnce);
    const missed = stagePlayViewOf(facts, { kind: 'judged', verdict: verdict(false, undefined), stale: true }).verdict;
    expect(missed?.pay).toBeUndefined();
    expect(missed?.unlock).toBeUndefined();
    expect(missed?.holdout).toBe(STAGE_PLAY_COPY.holdoutNotRun);
    expect(missed?.stale).toBe(STAGE_PLAY_COPY.stale);
    /* The judge's own sentences pass through untouched. */
    expect(first?.headline).toBe('judge headline');
    expect(first?.goals[0]?.sentence).toBe('judge sentence');
  });
});

describe('a held stage is drawn with its reason — § D1129 clause 3', () => {
  it('draws the held line in place of the controls', () => {
    const stage = stageAt(1);
    const view = stagePlayViewOf(
      factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }, 'the reason'),
      { kind: 'idle' },
    );
    expect(view.held).toBe(`${STAGE_PLAY_COPY.heldHead}: the reason`);
  });
});

describe('the page’s own choices, as the survivor census presses them — § D1183', () => {
  it('is every profile under every place for idle cars the page offers beneath it, and nothing a name alone makes', () => {
    const profiles = config.dispatcherProfiles.profiles;
    const moves = stagePageMovesOf(profiles, space, shippedPriceSchedule());
    const stage = stageAt(0);
    /* Read the page's own select, profile by profile, rather than restating what it offers. */
    const offered = profiles.flatMap((profile) =>
      factsOf(stage, { profileId: profile.id, parking: null })
        .parking.options.map((option) => option.value)
        .filter((value): value is NonNullable<StagePlayChoice['parking']> => value !== null)
        .map((parking) => stageMoveOf({ profileId: profile.id, parking }, profiles, { space }))
        .filter((move) => move?.edit !== undefined)
        .map((move) => move?.edit?.profileId ?? ''),
    );
    expect(moves.map((move) => move.name).sort()).toEqual([...new Set(offered)].sort());
    expect(moves.length, 'the page offers nothing past a name, so the stratum is empty').toBeGreaterThan(0);
    for (const { name, move } of moves) {
      expect(move.edit?.profileId, name).toBe(name);
      expect(Object.keys(move.edit?.values ?? {}), name).toEqual(['idle.parkingStrategy']);
      expect(move.edit?.values['idle.parkingStrategy'], name).not.toBe('fixed-floor');
    }
  });

  it('reads a published name back to the move it names, and answers nothing for a draw', () => {
    const profiles = config.dispatcherProfiles.profiles;
    for (const { name, move } of stagePageMovesOf(profiles, space, shippedPriceSchedule())) {
      expect(namedStageMoveOf(name, profiles, space), name).toEqual(move);
    }
    expect(namedStageMoveOf('zoned-uppeak', profiles, space)?.edit).toBeUndefined();
    expect(namedStageMoveOf('edit-3', profiles, space)).toBeUndefined();
    expect(namedStageMoveOf('no-such-profile-parked-lobby', profiles, space)).toBeUndefined();
  });

  it('asks the one check of a parked name, so a table naming one it now refuses is held', () => {
    const stage = stageAt(0);
    const refusalOf = routeRefusalsOf(stages, {
      space,
      schedule: shippedPriceSchedule(),
      profiles: config.dispatcherProfiles.profiles,
      buildings: [requireBuilding(config, stage.building)],
      elevatorSpecs: config.elevatorSpecs,
      moveNamed: (name) => namedStageMoveOf(name, config.dispatcherProfiles.profiles, space),
    });
    /* Stage 1 opens on 4 units; a destination panel costs 15, parked or not. */
    expect(refusalOf(stage.id, 'destination-panel-parked-lobby')).toMatch(/15 units against the 4/u);
    expect(refusalOf(stage.id, `${stage.dispatcher.startingProfileId}-parked-zone-center`)).toBeUndefined();
  });
});

describe('a per-run goal’s mark names its bar — § D1185', () => {
  const report = (kind: 'deliver-everyone' | 'beat-the-baseline', met: boolean) =>
    ({
      headline: 'h',
      cleared: met,
      metOnTuningSeeds: met,
      holdout: undefined,
      goals: [{ kind, label: 'label', met, reproduced: null, sentence: 's', note: 'n' }],
    }) as unknown as Parameters<typeof verdictFactsOf>[0];

  it('reads bar reached on a goal judged against the shipped setting’s count, never a bare met', () => {
    const facts = factsOf(stageAt(0), { profileId: 'zoned-uppeak', parking: null });
    for (const met of [true, false]) {
      const view = stagePlayViewOf(facts, { kind: 'judged', verdict: verdictFactsOf(report('deliver-everyone', met), undefined), stale: false });
      expect(view.verdict?.goals[0]?.mark).toBe(met ? STAGE_PLAY_COPY.goalBarReached : STAGE_PLAY_COPY.goalBarNotReached);
    }
    const interval = stagePlayViewOf(facts, { kind: 'judged', verdict: verdictFactsOf(report('beat-the-baseline', true), undefined), stale: false });
    expect(interval.verdict?.goals[0]?.mark).toBe(STAGE_PLAY_COPY.goalMet);
  });
});
