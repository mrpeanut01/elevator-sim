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
import { stageGoalNameOf } from '../campaign/judge.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import { batchRequestForStage, demonstrationConfigFor } from '../campaign/stageRun.js';
import { admitStageMove, routeRefusalsOf, routeUnitsOf, stagePathOf, stageUnitsAt } from '../campaign/stagePress.js';
import type { CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording } from '../contract/types.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S } from './stageScreenModel.js';
import { tutorialPaceOf } from './tutorialModel.js';
import { waitBandsAt } from '../live/bands.js';
import type { PublishedGoalRates } from '../scenario/published.js';
import type { PublishedSurvivors } from '../scenario/survivors.js';
import { PAR_MARK_COPY } from '../scenario/par.js';
import { SCENARIO_COPY, scenarioHubViewOf, stageParNoteOf } from './scenarioModel.js';
import {
  STAGE_PLAY_COPY,
  clearEarnsParOf,
  stageFactsOf,
  stageRungsOf,
  namedStageMoveOf,
  stageMoveOf,
  stagePageMovesOf,
  stagePlayViewOf,
  stagePracticeLineOf,
  stageWatchAfterEndOf,
  stageWatchBusy,
  stageWatchPaceOf,
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

function factsInputOf(stage: CampaignStage, choice: StagePlayChoice, held?: string) {
  return {
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
function legsOf(stage: CampaignStage, choice: StagePlayChoice, budgetUnits = stageUnitsAt(stage, null)): string {
  const move = stageMoveOf(choice, config.dispatcherProfiles.profiles, { space });
  if (move === undefined) throw new Error('no move');
  const admission = admitStageMove(admissionContextOf(stage), move, budgetUnits);
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

  /*
   * [§ D1358](../../../../DECISIONS.md): a cleared stage can be run again as practice, and its clear
   * says the par it meets or why it earns no mark, in the hub row's own words. Red before: the page
   * drew no par at all and nothing said a run of a cleared stage was practice.
   */
  it('says the par a clear meets, or why it earns none, and that a cleared stage’s run is practice', () => {
    const stage = stageAt(0);
    const choice = { profileId: 'zoned-uppeak', parking: null } as const;
    const cleared = (spent: number | undefined): StagePlayVerdictFacts => ({ ...verdict(true, 'again'), spentUnits: spent });
    const parAt = (parUnits: number | undefined, spent: number | undefined): string | undefined =>
      stagePlayViewOf(
        { ...factsOf(stage, choice), parUnits },
        { kind: 'judged', verdict: cleared(spent), stale: false },
      ).verdict?.par;
    expect(parAt(4, 4)?.startsWith(PAR_MARK_COPY.at)).toBe(true);
    expect(parAt(4, 2)?.startsWith(PAR_MARK_COPY.under)).toBe(true);
    expect(parAt(4, 6)).toBe(stageParNoteOf(4, 6));
    expect(parAt(4, 6)).toContain('Your clear cost 6 units');
    expect(parAt(0, 0)).toBe(SCENARIO_COPY.parFree);
    expect(parAt(0, 2)).toContain('Your clear cost 2 units');
    expect(parAt(undefined, 2)).toBe(SCENARIO_COPY.parNone);
    /* No par line on a run that did not clear. */
    expect(
      stagePlayViewOf({ ...factsOf(stage, choice), parUnits: 4 }, { kind: 'judged', verdict: verdict(false, undefined), stale: false })
        .verdict?.par,
    ).toBeUndefined();
    /*
     * The practice line, on a stage this device holds the clear of and on no other — and since
     * § D1376 its par clause is the stage's own: a priced par promises the mark at its price, and a
     * free par or none says the row's reason rather than promising a mark there is not.
     */
    const practiceAt = (parUnits: number | undefined): string | undefined =>
      stagePlayViewOf({ ...factsOf(stage, choice), parUnits, clearedBefore: true }, { kind: 'idle' }).practice;
    expect(practiceAt(4)).toBe(`${STAGE_PLAY_COPY.practice} A clear at or under par, 4 units, earns the mark.`);
    expect(practiceAt(0)).toBe(`${STAGE_PLAY_COPY.practice} ${SCENARIO_COPY.parFree}`);
    expect(practiceAt(undefined)).toBe(`${STAGE_PLAY_COPY.practice} ${SCENARIO_COPY.parNone}`);
    for (const par of [0, undefined]) expect(practiceAt(par)).not.toMatch(/earns the mark/u);
    expect(practiceAt(4)).toBe(stagePracticeLineOf(4));
    /*
     * Wave AP lane AP-D2, the post-AO panel's seat D (D9): once the kept clear met the par, the line
     * still promised *earns the mark*. Red before: the kept cost was not read and the promise stood.
     */
    const practiceKept = (keptSpentUnits: number): string | undefined =>
      stagePlayViewOf({ ...factsOf(stage, choice), parUnits: 4, clearedBefore: true, keptSpentUnits }, { kind: 'idle' }).practice;
    expect(practiceKept(4)).toBe(`${STAGE_PLAY_COPY.practice} This stage has its mark: your clear cost 4 units, against a par of 4 units.`);
    expect(practiceKept(3)).not.toMatch(/earns the mark/u);
    expect(practiceKept(6)).toBe(`${STAGE_PLAY_COPY.practice} A clear at or under par, 4 units, earns the mark.`);
    expect(stagePlayViewOf(factsOf(stage, choice), { kind: 'idle' }).practice).toBeUndefined();
    /* And `verdictFactsOf` carries what the pressed settings cost. */
    expect(verdictFactsOf({ headline: '', goals: [], holdout: undefined, metOnTuningSeeds: true, cleared: true } as never, 'again', 3).spentUnits).toBe(3);
  });
});

/*
 * [§ D1376](../../../../DECISIONS.md), the post-AN panel's seats C (D1) and D (D5). The stage page asked
 * the ladder for the hold and not the par, so every clear read *This stage has no par: no way through
 * … could be priced* beside a hub row reading *At par* or *Par is free here*. Both now read the path
 * through `campaign/stagePress.ts#stagePathOf`, and this holds the page's sentence to the row's on
 * every shipped stage, at a clear priced at the par.
 */
describe('the stage page and its hub row say one par — § D1376', () => {
  it('draws the same par sentence on a clear as the row does, on every shipped stage', () => {
    const resources = {
      space,
      schedule: shippedPriceSchedule(),
      profiles: config.dispatcherProfiles.profiles,
      buildings: [...config.buildingsById.keys()].map((id) => requireBuilding(config, id)),
      elevatorSpecs: config.elevatorSpecs,
      moveNamed: (name: string) => namedStageMoveOf(name, config.dispatcherProfiles.profiles, space),
    };
    const path = stagePathOf(stages, survivors, resources);
    expect(path.length).toBeGreaterThan(0);
    /* The par is priced on the path: some stage carries a priced par and some a free one (§ D1358's table). */
    expect(path.some((rung) => rung.parUnits !== undefined && rung.parUnits > 0)).toBe(true);
    expect(path.some((rung) => rung.parUnits === 0)).toBe(true);
    for (const rung of path) {
      if (rung.offer !== 'offered') continue;
      const stage = stages.find((entry) => entry.id === rung.id);
      if (stage === undefined) throw new Error(rung.id);
      const spent = rung.parUnits ?? 0;
      const page = stagePlayViewOf(
        { ...factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }), parUnits: rung.parUnits },
        {
          kind: 'judged',
          verdict: {
            headline: 'judge headline',
            goals: [],
            holdoutSentence: 'held on the held-back crowds',
            metOnTuningSeeds: true,
            cleared: true,
            paid: 'again',
            spentUnits: spent,
          },
          stale: false,
        },
      ).verdict?.par;
      const row = scenarioHubViewOf([rung], new Set([rung.id]), () => spent).path?.rows[0];
      expect(page, rung.id).toBe(row?.parMark ?? row?.parNote);
      if (rung.parUnits !== undefined) expect(page, rung.id).not.toBe(SCENARIO_COPY.parNone);
    }
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

  /* § D1234: the same check read for its price, which is what a stage's par is the minimum of. */
  it('prices a named route by the one check, and prices nothing it refuses', () => {
    const stage = stageAt(0);
    const resources = {
      space,
      schedule: shippedPriceSchedule(),
      profiles: config.dispatcherProfiles.profiles,
      buildings: [requireBuilding(config, stage.building)],
      elevatorSpecs: config.elevatorSpecs,
      moveNamed: (name: string) => namedStageMoveOf(name, config.dispatcherProfiles.profiles, space),
    };
    const unitsOf = routeUnitsOf(stages, resources);
    const refusalOf = routeRefusalsOf(stages, resources);
    expect(unitsOf(stage.id, 'destination-panel-parked-lobby')).toBeUndefined();
    const parked = `${stage.dispatcher.startingProfileId}-parked-zone-center`;
    expect(refusalOf(stage.id, parked)).toBeUndefined();
    expect(unitsOf(stage.id, parked)).toBe(0);
    expect(unitsOf(stage.id, 'edit-3')).toBeUndefined();
    const context = {
      space,
      schedule: shippedPriceSchedule(),
      baseline: config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId)!,
      building: requireBuilding(config, stage.building),
      elevatorSpecs: config.elevatorSpecs,
    };
    const eta = config.dispatcherProfilesById.get('eta')!;
    expect(unitsOf(stage.id, 'eta')).toBe(admitStageMove(context, { profile: eta }, stageUnitsAt(stage, null)).units);
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

/*
 * **A wider budget is sold only where the census says it adds a way through** — [§ D1419](../../../../DECISIONS.md),
 * swarm DS's Q3 ruling. Red on the base: the page sold no rung at all (`stageUnitsAt(stage, null)` on
 * every press), while the census pinned a count per rung and the equipment rung raised it on three
 * stages. The rule is read off the census, so these cases hold it in both directions over whatever
 * census is pinned rather than naming the stages it sells today.
 */
describe('a stage sells a rung only where the census adds a way through — § D1419', () => {
  const censusOf = (stage: CampaignStage) => survivors.scenarios.find((entry) => entry.id === stage.id);

  it('sells exactly the rungs whose pinned count exceeds the rung below, and draws every other with its reason', () => {
    let sold = 0;
    let unsold = 0;
    for (const stage of stages) {
      const census = censusOf(stage);
      for (const [index, rung] of stageRungsOf(stage, census, new Set()).entries()) {
        const below = index === 0 ? null : (stage.budget.steps[index - 1]?.id ?? null);
        const at = census?.steps.find((step) => step.stepId === rung.stepId)?.survivors;
        const under = census?.steps.find((step) => step.stepId === below)?.survivors;
        expect(rung.sold, `${stage.id} ${rung.stepId}`).toBe(at !== undefined && under !== undefined && at > under);
        const row = stagePlayViewOf(
          { ...factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }), rungs: [rung], balanceChimes: 999 },
          { kind: 'idle' },
        ).rungs[0];
        if (rung.sold) {
          sold += 1;
          expect(row?.offer, `${stage.id} ${rung.stepId}`).toBe(rung.next ? 'buy' : 'later');
          expect(row?.text).toContain(`The census found ${String(at)} ways through at ${String(rung.units)} units`);
          expect(row?.text).toContain('this device');
        } else {
          unsold += 1;
          expect(row?.offer).toBe('not-sold');
          expect(row?.text).toMatch(/Not sold\./u);
          expect(row?.buyLabel).toBeUndefined();
        }
      }
    }
    /* Non-vacuous on the shipped census: something is sold and something is refused. */
    expect(sold, 'no rung on the shipped census adds a way through').toBeGreaterThan(0);
    expect(unsold, 'every rung is sold, so the refusal arm is never drawn').toBeGreaterThan(0);
  });

  it('positive control: a count raised in a copy of the census sells that rung, and lowering it again unsells it', () => {
    const stage = stages.find((entry) => stageRungsOf(entry, censusOf(entry), new Set()).some((rung) => !rung.sold && rung.survivors !== undefined));
    if (stage === undefined) throw new Error('no unsold measured rung to move');
    const census = censusOf(stage)!;
    const rung = stageRungsOf(stage, census, new Set()).find((entry) => !entry.sold && entry.survivors !== undefined)!;
    const raised = {
      ...census,
      steps: census.steps.map((step) => (step.stepId === rung.stepId ? { ...step, survivors: (rung.survivorsBelow ?? 0) + 1 } : step)),
    };
    expect(stageRungsOf(stage, raised, new Set()).find((entry) => entry.stepId === rung.stepId)?.sold).toBe(true);
    expect(stageRungsOf(stage, census, new Set()).find((entry) => entry.stepId === rung.stepId)?.sold).toBe(false);
    /* And no census row at all sells nothing. */
    expect(stageRungsOf(stage, undefined, new Set()).some((entry) => entry.sold)).toBe(false);
  });

  it('a bought rung widens the budget the page admits at: a move the base refuses runs there and moves the legs, and the run plan carries no budget', () => {
    /*
     * Found rather than named, on two properties: a stage with a sold rung and a page choice its base
     * refuses and that rung admits, **and** whose run differs from the building as it stands. The
     * second is what makes the case about the budget: a move inert on its building (a destination
     * order on one shaft) would leave the refusal arm saying nothing about money.
     */
    let found: { stage: CampaignStage; stepId: string; choice: StagePlayChoice } | undefined;
    const tried: string[] = [];
    for (const stage of stages) {
      const rung = stageRungsOf(stage, censusOf(stage), new Set()).find((entry) => entry.next);
      if (rung === undefined) continue;
      const standingLegs = legsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null });
      for (const profile of config.dispatcherProfiles.profiles) {
        for (const parking of [null, 'lobby', 'zone-center'] as const) {
          const choice = { profileId: profile.id, parking };
          const base = stageFactsOf({ ...factsInputOf(stage, choice), census: censusOf(stage), ownedStepIds: new Set() });
          const bought = stageFactsOf({ ...factsInputOf(stage, choice), census: censusOf(stage), ownedStepIds: new Set([rung.stepId]) });
          if (base.admission.refusal !== 'over-budget' || !bought.admission.admitted || bought.admission.control) continue;
          tried.push(`${stage.id}:${profile.id}:${String(parking)}`);
          if (legsOf(stage, choice, bought.budgetUnits) === standingLegs) continue;
          found = { stage, stepId: rung.stepId, choice };
          break;
        }
        if (found !== undefined) break;
      }
      if (found !== undefined) break;
    }
    if (found === undefined) throw new Error(`no sold rung admits a move its base refuses that moves the legs (tried ${tried.join(', ')})`);
    const { stage, stepId, choice } = found;
    const base = stageFactsOf({ ...factsInputOf(stage, choice), census: censusOf(stage), ownedStepIds: new Set() });
    const bought = stageFactsOf({ ...factsInputOf(stage, choice), census: censusOf(stage), ownedStepIds: new Set([stepId]) });
    /* Arm one: the base refuses it, with the price, and nothing runs. */
    expect(base.budgetUnits).toBe(stageUnitsAt(stage, null));
    expect(stagePlayViewOf(base, { kind: 'idle' }).refusal).toMatch(/^Over budget/u);
    /* Arm two: the bought rung admits it, and the run it makes differs from the building as it stands, on the legs. */
    expect(bought.budgetUnits).toBe(stageUnitsAt(stage, stepId));
    expect(bought.boughtStepId).toBe(stepId);
    const standing = { profileId: stage.dispatcher.startingProfileId, parking: null } as const;
    expect(legsOf(stage, choice, bought.budgetUnits)).not.toEqual(legsOf(stage, standing));
    /* Arm three: what is simulated is a function of the stage and the move, never of the budget. */
    const move = stageMoveOf(choice, config.dispatcherProfiles.profiles, { space });
    expect(batchRequestForStage(stage, move?.profile.id ?? '', move?.edit)).toEqual(
      batchRequestForStage(stage, move?.profile.id ?? '', move?.edit),
    );
    expect(Object.keys(batchRequestForStage(stage, move?.profile.id ?? '', move?.edit))).not.toContain('budgetUnits');
  }, 300_000);
});

describe('a clear at or under a priced par pays once — § D1417', () => {
  const cleared = (parPaid: 'first' | 'again' | undefined, paid: 'first' | 'again'): StagePlayVerdictFacts => ({
    headline: 'h',
    goals: [],
    holdoutSentence: 'held',
    metOnTuningSeeds: true,
    cleared: true,
    paid,
    spentUnits: 4,
    parPaid,
  });

  it('earns the award by the mark’s own rule: at or under a priced par, never on a free par or none', () => {
    expect(clearEarnsParOf(4, 4)).toBe(true);
    expect(clearEarnsParOf(4, 2)).toBe(true);
    expect(clearEarnsParOf(4, 5)).toBe(false);
    expect(clearEarnsParOf(0, 0)).toBe(false);
    expect(clearEarnsParOf(undefined, 2)).toBe(false);
    expect(clearEarnsParOf(4, undefined)).toBe(false);
  });

  it('says the par award once, on the clear that banked it, beside the clear’s own pay', () => {
    const facts = { ...factsOf(stageAt(1), { profileId: 'collective', parking: null }), parUnits: 4, parAward: 3 };
    const view = (verdict: StagePlayVerdictFacts) => stagePlayViewOf(facts, { kind: 'judged', verdict, stale: false }).verdict;
    expect(view(cleared('first', 'first'))?.pay).toBe(
      'This clear pays 6 chimes, the first time only. Meeting par pays 3 chimes more, once, and this clear is that once.',
    );
    expect(view(cleared('first', 'again'))?.pay).toBe(
      `${STAGE_PLAY_COPY.paysOnce} Meeting par pays 3 chimes more, once, and this clear is that once.`,
    );
    expect(view(cleared('again', 'again'))?.pay).toBe(STAGE_PLAY_COPY.paysOnce);
    expect(view(cleared(undefined, 'first'))?.pay).toBe('This clear pays 6 chimes, the first time only.');
    /* The par line itself now says what a par pays, in the one sentence every par line ends with. */
    expect(view(cleared('first', 'first'))?.par).toContain('pays 3 chimes, once.');
  });

  it('says the budget a clear was run at where this device bought one, and nothing on the base', () => {
    const facts = factsOf(stageAt(1), { profileId: 'collective', parking: null });
    const at = (boughtUnits: number | undefined) =>
      stagePlayViewOf(facts, { kind: 'judged', verdict: { ...cleared(undefined, 'first'), boughtUnits }, stale: false }).verdict?.rung;
    expect(at(24)).toBe('Run at the 24-unit budget this device bought for this stage. A clear pays the same at any budget.');
    expect(at(undefined)).toBeUndefined();
  });
});

describe('a first-time player reads the stage before running it — GitHub issue #626', () => {
  const idleViewOf = (stage: CampaignStage) =>
    stagePlayViewOf(factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null }), { kind: 'idle' });

  it('states every goal before the first run, in the words the verdict judges by (item 1)', () => {
    for (const stage of stages) {
      const view = idleViewOf(stage);
      expect(view.goalsHeading).toBe(STAGE_PLAY_COPY.goalsHeading);
      expect(view.goals, stage.id).toEqual(stage.goals.map(stageGoalNameOf));
      expect(view.goals.length, stage.id).toBeGreaterThan(0);
    }
    expect(idleViewOf(stageAt(0)).goals).toEqual(['Measurably ahead of the shipped setting']);
  });

  it('counts a running batch in the stage’s own crowds, so the count never passes where the batch can stop (item 9)', () => {
    const stage = stageAt(0);
    const facts = factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null });
    const arms = 2;
    const total = arms * stage.replications;
    const tuning = stagePlayViewOf(facts, { kind: 'running', seedSet: 'tuning', completed: 70, total }).status;
    expect(tuning).toBe(`Running 35 of ${String(stage.replications)} of the stage’s own crowds, both settings on the same passengers.`);
    expect(tuning).not.toContain(`of ${String(total)}`);
    const last = stagePlayViewOf(facts, { kind: 'running', seedSet: 'tuning', completed: total, total }).status;
    expect(last).toContain(`${String(stage.replications)} of ${String(stage.replications)}`);
    const holdout = stagePlayViewOf(facts, { kind: 'running', seedSet: 'holdout', completed: 1, total }).status;
    expect(holdout).toContain(`Now 0 of ${String(stage.replications)} crowds`);
  });

  it('names no count of cars or shafts its building does not have (item 10)', () => {
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    let named = 0;
    for (const stage of stages) {
      const cars = requireBuilding(config, stage.building).banks.reduce((sum, bank) => sum + bank.cars.length, 0);
      for (const match of idleViewOf(stage).title.toLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten) (?:shafts?|cars?|lifts?)\b/gu)) {
        named += 1;
        expect(words.indexOf(match[1] ?? '') + 1, `${stage.id}: "${stage.name}" on ${String(cars)} cars`).toBe(cars);
      }
    }
    expect(named, 'no stage title counts its cars, so this case tests nothing').toBeGreaterThan(0);
  });
});

describe('a press plays one of the stage’s crowds, and the words over it carry no figure — issue #626 item 4, § D1496', () => {
  it('offers the pair while the stage runs and after its verdict, never before a press or on a held stage', () => {
    const stage = stageAt(0);
    const choice = { profileId: stage.dispatcher.startingProfileId, parking: null };
    const facts = factsOf(stage, choice);
    const verdict: StagePlayVerdictFacts = {
      headline: 'judge headline',
      goals: [],
      holdoutSentence: null,
      metOnTuningSeeds: false,
      cleared: false,
      paid: undefined,
    };
    expect(stagePlayViewOf(facts, { kind: 'idle' }).watch).toBeUndefined();
    expect(stagePlayViewOf(facts, { kind: 'failed' }).watch).toBeUndefined();
    const running = stagePlayViewOf(facts, { kind: 'running', seedSet: 'tuning', completed: 3, total: 100 });
    const judged = stagePlayViewOf(facts, { kind: 'judged', verdict, stale: false });
    for (const view of [running, judged]) {
      expect(view.watch).toEqual({
        eyebrow: 'One of the stage’s crowds, watched',
        note: 'The verdict is all of them, both settings on the same passengers.',
        skip: STAGE_PLAY_COPY.watchSkip,
        baselineCaption: STAGE_PLAY_COPY.watchBaselineCaption,
        candidateCaption: STAGE_PLAY_COPY.watchCandidateCaption,
      });
      expect(Object.values(view.watch ?? {}).join(' ')).not.toMatch(/\d/u);
    }
    /* The verdict is drawn beside a pair still playing: the view holds both at once. */
    expect(judged.verdict).toBeDefined();
    const held = stagePlayViewOf(factsOf(stage, choice, 'held for a reason'), { kind: 'running', seedSet: 'tuning', completed: 0, total: 100 });
    expect(held.watch).toBeUndefined();
  });
});

/**
 * Play a pair the way `caseStage.ts` does, at 60 frames a real second, with `speedAt` read off each
 * frame, and say how many real seconds passed before anything moved and how many showed something.
 */
function playedSeconds(
  panes: readonly VizRecording[],
  speedAt: (simTimeS: number) => number,
): { readonly toFirstMotionS: number | undefined; readonly busyS: number; readonly totalS: number } {
  const step = 1 / 60;
  const end = Math.max(...panes.map((pane) => pane.endedAt));
  let sim = Math.min(...panes.map((pane) => pane.startedAt));
  let real = 0;
  let busy = 0;
  let first: number | undefined;
  while (sim < end) {
    const frames = panes.map((pane) => frameAt(pane, sim));
    if (stageWatchBusy(frames)) {
      busy += step;
      first ??= real;
    }
    sim += speedAt(sim) * step;
    real += step;
  }
  return { toFirstMotionS: first, busyS: busy, totalS: real };
}

describe('the pair crosses its quiet fast and plays what moves at the player’s speed — wave AQ lane AQ-1', () => {
  it('shows movement on stage 1 within the first second and plays its rides long enough to see', () => {
    const stage = stageAt(0);
    const baseline = config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId);
    if (baseline === undefined) throw new Error('no baseline');
    const recording = recordRun(
      demonstrationConfigFor({
        stage,
        building: requireBuilding(config, stage.building),
        dispatcherProfile: baseline,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        dispatcherProfiles: config.dispatcherProfiles,
      }),
      { recordDecisions: false },
    ).recording;
    const panes = [recording, recording];
    const watching = DEFAULT_STAGE_SIM_PER_REAL_S;
    const now = playedSeconds(panes, (simTimeS) =>
      stageWatchPaceOf({ frames: panes.map((pane) => frameAt(pane, simTimeS)), watchingSimPerRealS: watching }),
    );
    /* The defect, measured: the tutorial's rule crossed the whole morning in about ten seconds of quiet. */
    const before = playedSeconds(panes, (simTimeS) =>
      tutorialPaceOf({ longestStandingS: waitBandsAt(recording, simTimeS).longestCurrentWaitS, watchingSimPerRealS: watching }),
    );
    expect(before.busyS, 'the old rule already showed the rides; this case tests nothing').toBeLessThan(5);
    expect(now.toFirstMotionS).toBeDefined();
    expect(now.toFirstMotionS ?? Infinity).toBeLessThan(1);
    expect(now.busyS).toBeGreaterThan(20);
    /* Most of what the pair plays is something happening, not two cars standing still. */
    expect(now.busyS / now.totalS).toBeGreaterThan(0.7);
  }, 60_000);

  it('never moves the playhead: a quiet frame and a busy one differ only in speed', () => {
    const quiet = stageWatchPaceOf({ frames: [], watchingSimPerRealS: 4 });
    expect(quiet).toBeGreaterThan(4);
    expect(stageWatchPaceOf({ frames: [], watchingSimPerRealS: 200 })).toBe(200);
  });

  it('plays the pair again at its end, after the verdict as during the batch, and only a skip ends it', () => {
    expect(stageWatchAfterEndOf('ended')).toBe('replay');
    expect(stageWatchAfterEndOf('skipped')).toBe('drop');
  });

  it('takes the pair away once the verdict is stale, because it was of the settings before the move', () => {
    const stage = stageAt(0);
    const facts = factsOf(stage, { profileId: stage.dispatcher.startingProfileId, parking: null });
    const verdict: StagePlayVerdictFacts = {
      headline: 'h', goals: [], holdoutSentence: null, metOnTuningSeeds: false, cleared: false, paid: undefined,
    };
    expect(stagePlayViewOf(facts, { kind: 'judged', verdict, stale: false }).watch).toBeDefined();
    expect(stagePlayViewOf(facts, { kind: 'judged', verdict, stale: true }).watch).toBeUndefined();
  });
});
