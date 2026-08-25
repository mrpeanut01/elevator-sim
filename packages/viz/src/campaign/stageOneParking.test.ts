/**
 * **The dial `garden-apartments` says decides it, opened on the stage that runs there** — and the
 * four things that had to be measured before it could be.
 *
 * ## What this file is, and what it deliberately is not
 *
 * It is **not** a DC-1 fix. `docs/33` § 3.3c is the sweep that went looking for a failable count
 * goal on the parking axis and did not find one, and `difficultyCurve.test.ts`'s register still
 * carries this stage with that measurement added to its reason. Nothing here moves a published
 * count, a bar or a goal.
 *
 * What it is: the stage now **opens the dimension its own clearing move lives on**. Before this,
 * stage 1 declared three weight dials and `docs/33` § 3.1's DC-3 row read *ten of ten stages with
 * no witness*. Stage 1 had one all along — park the idle cars in the middle of the building — and
 * `campaign/dimensions.ts#admitProfile` refused to run it, because the stage did not open the
 * dimension it moves. A witness a stage will not accept is not a witness, so the register was
 * right and the cause was a scope decision rather than a difficulty one (`docs/33` § 3.3's C3
 * makes exactly that distinction about a stage's `editable` list).
 *
 * ## Why three dimensions and not one
 *
 * `idle.repositionThresholdS` and `idle.repositionEnergyWeight` both declare
 * `activeWhen: { 'idle.parkingStrategy': [… everything but `stay`] }`, so moving the strategy off
 * `stay` makes two dimensions **appear**, and `dimensions.ts` says in as many words that *"a
 * dimension that appears or disappears is a move"*. Measured, before the list was widened: opening
 * the strategy alone still refused the witness with *"also moves 2 dimensions this stage does not
 * open: idle.repositionThresholdS (— → 2), idle.repositionEnergyWeight (— → 0.2)"*. The gate and
 * its dependants travel together or the gate cannot be moved at all, and {@link gatedBy} derives
 * that from the space rather than restating it, so a fourth dependant added to `core` arrives here
 * as a red rather than as a silent hole.
 *
 * ## The standing requirement, applied to all three
 *
 * `CLAUDE.md`: *"move the control and require the run to change, compared on the legs rather than
 * on a window statistic."* All three are compared on the legs of **this stage's own demonstration
 * replication** — `stageRun.ts#demonstrationConfigFor`, the run the fail-state report replays —
 * rather than on a fixture, because a dial that moves a fixture and not the stage is the defect
 * with an extra step. The two gated dials have the interpretable form of that check: turned up far
 * enough they suppress every reposition, so `zone-center` with a 30 s deadband is **byte-identical
 * on the legs to `stay`**, and different from `zone-center` with the shipped one. A dial that could
 * not do that would be a label.
 *
 * ## And the lesson is a question rather than a giveaway, which is also measured
 *
 * The brief hints the fix without naming it, and that is only honest if the obvious answer is not
 * automatically the right one. On this building it is not: parking at the lobby comes out **behind**
 * on average wait and door-to-door time, and so does parking at the top. `docs/33` § 3.3c carries
 * the whole table. The case below pins the two that lose, so a change that made the naive answer
 * win would take the brief's last sentence down with it.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { admitProfile } from './dimensions.js';
import { editableIdsOf, parseCampaign, type CampaignContext } from './parse.js';
import { runStageToVerdict } from './stageSequence.js';
import { demonstrationConfigFor } from './stageRun.js';
import type { Campaign, CampaignStage } from './types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { runBatch } from '../batch/runBatch.js';
import type { BatchResources } from '../batch/types.js';
import { resolveEditedProfile, type EditedVector } from '../controls/editedProfile.js';
import { recordRun } from '../record/recordRun.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';

/**
 * The dimension this file is about.
 *
 * A literal here and nowhere in `campaign/`'s source, which is `campaign.test.ts`'s own rule: *"no
 * source file in `campaign/` may contain a dimension id as a literal"*, checked over the files that
 * are not tests. A test naming the subject it was written about is how the subject stays findable.
 */
const PARKING_ID = 'idle.parkingStrategy';

/** The witness `docs/33` § 3.3c measures, and the two naive answers it measures beside it. */
const WITNESS: Readonly<Record<string, string | number>> = { [PARKING_ID]: 'zone-center' };
const AT_THE_LOBBY: Readonly<Record<string, string | number>> = { [PARKING_ID]: 'lobby' };
const AT_THE_TOP: Readonly<Record<string, string | number>> = {
  [PARKING_ID]: 'fixed-floor',
  'idle.parkingFloorIndex': 6,
};

let config: LoadedConfig;
let published: PublishedGoalRates;
let campaign: Campaign;
let space: SearchSpace;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
  const raw: unknown = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8'));
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
  };
  campaign = parseCampaign(raw, context);
}, 300_000);

/**
 * The stage under test: **the first one**, which is the whole of why it is this one.
 *
 * Taken by position rather than by id — `campaign.test.ts`'s own idiom — because the subject of
 * this file is *the stage a new player meets first*, and that is a property of the progression
 * rather than of a name. Its building is asserted below, so a reordering arrives as a red here
 * rather than as a case that quietly measures a different stage.
 *
 * **Three other stages already open this dial** — 4, 6 and 8 list exactly the same gate-and-
 * dependants trio, and 7 opens every declared dimension — so nothing below may be written as
 * *"the stage that opens parking"*. What is new here is the first stage doing it.
 */
function subject(): CampaignStage {
  const stage = campaign.stages[0];
  if (stage === undefined) throw new Error('the campaign ships no stages');
  expect(stage.building, 'the first stage still runs the sparse residential building').toBe(
    'garden-apartments',
  );
  return stage;
}

/** Every dimension whose `activeWhen` names `id` as its gate — derived, never listed. */
function gatedBy(id: string): readonly string[] {
  return space.parameters
    .filter((parameter) => Object.keys(parameter.activeWhen ?? {}).includes(id))
    .map((parameter) => parameter.id);
}

function editOf(values: Readonly<Record<string, string | number>>, name: string): EditedVector {
  return { baseProfileId: 'collective', profileId: name, values };
}

/** The stage's own demonstration replication, folded to the legs `docs/12` § 5 clause 9 compares. */
function legsOf(stage: CampaignStage, edit: EditedVector | null): string {
  const base = requireDispatcher(config, stage.dispatcher.startingProfileId);
  let profile = base;
  if (edit !== null) {
    const resolved = resolveEditedProfile(space, base, edit);
    if (!resolved.ok) throw new Error(resolved.reason);
    profile = resolved.profile;
  }
  const simulation = demonstrationConfigFor({
    stage,
    building: requireBuilding(config, stage.building),
    dispatcherProfile: profile,
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

function resourcesFor(stage: CampaignStage): BatchResources {
  return {
    building: requireBuilding(config, stage.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

function scenarioOf(stage: CampaignStage): PublishedScenario {
  const found = published.scenarios.find((entry) => entry.id === stage.id);
  if (found === undefined) throw new Error(`no published row for ${stage.id}`);
  return found;
}

/** Play the stage with an edited vector, through the shipped sequence. Both batches, or one. */
async function play(stage: CampaignStage, edit: EditedVector) {
  const resources = resourcesFor(stage);
  return runStageToVerdict({
    stage,
    published: scenarioOf(stage),
    candidateProfileId: stage.dispatcher.startingProfileId,
    edit,
    run: (request) => runBatch(request, resources),
  });
}

describe('the stage opens the dial its building says decides it', () => {
  it('offers where idle cars wait, and the two dimensions moving it brings to life', () => {
    const stage = subject();
    const editable = editableIdsOf(stage.dispatcher.editable, space.ids);
    const dependants = gatedBy(PARKING_ID).filter(
      (id) => id !== 'idle.parkingFloorIndex',
    );
    expect(dependants.length, 'the parking gate has dependants to open').toBeGreaterThan(0);
    /*
     * The gate and every dimension it brings to life, together. A stage that opened the gate alone
     * would refuse every move of it — measured, and quoted in this file's docstring.
     */
    for (const id of [PARKING_ID, ...dependants]) {
      expect(editable, `${stage.id} opens ${id}`).toContain(id);
    }
  });

  it('did not widen what the dropdown offers, so DC-2 and DC-2b are where they were', () => {
    const stage = subject();
    const baseline = requireDispatcher(config, stage.dispatcher.startingProfileId);
    const editable = editableIdsOf(stage.dispatcher.editable, space.ids);
    const withoutIdle = editable.filter((id) => !id.startsWith('idle.'));
    const admittedUnder = (ids: readonly string[]): readonly string[] =>
      [...config.dispatcherProfilesById.values()]
        .filter((profile) => admitProfile(space, baseline, profile, ids).admissible)
        .map((profile) => profile.id);

    /*
     * The claim `docs/33` § 3.3c publishes: opening the idle dimensions changed which *edits* a
     * player may make and changed nothing about which shipped profiles the stage admits. DC-2 is a
     * statement about that set and DC-2b is a statement about its size, so both are untouched by
     * this lane and neither needed re-measuring.
     */
    expect(admittedUnder(editable)).toEqual(admittedUnder(withoutIdle));
    expect(
      admittedUnder(editable).filter((id) => id !== stage.dispatcher.startingProfileId).length,
      'DC-2b: two admitted profiles other than the control',
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('moving the dial changes the run, compared on the legs', () => {
  it('parks the cars somewhere else, on this stage’s own replication', () => {
    const stage = subject();
    const parked = legsOf(stage, null);
    expect(parked.length, 'the demonstration replication carried legs').toBeGreaterThan(2);
    for (const [name, values] of [
      ['at the lobby', AT_THE_LOBBY],
      ['in the middle', WITNESS],
      ['at the top', AT_THE_TOP],
      ['where the crowd is forecast', { [PARKING_ID]: 'predicted-demand' } as const],
    ] as const) {
      expect(legsOf(stage, editOf(values, `park-${name}`)), name).not.toEqual(parked);
    }
  }, 300_000);

  it('lets the deadband and the energy price switch parking back off', () => {
    const stage = subject();
    const stay = legsOf(stage, null);
    const moved = legsOf(stage, editOf(WITNESS, 'witness'));
    /*
     * Both gated dials, on the legs and in the direction that says what they *are*: a deadband wide
     * enough, or an energy price high enough, makes every repositioning trip not worth taking, and
     * the run collapses onto the one where the cars never move. Identical to `stay` **and**
     * different from the same park with the shipped settings is the pair of facts that separates a
     * live dial from a label — one alone would be satisfied by a dial that does nothing.
     */
    for (const [id, value] of [
      ['idle.repositionThresholdS', 30],
      ['idle.repositionEnergyWeight', 2],
    ] as const) {
      const suppressed = legsOf(stage, editOf({ ...WITNESS, [id]: value }, `off-${id}`));
      expect(suppressed, `${id} at ${String(value)} suppresses every reposition`).toEqual(stay);
      expect(suppressed, `${id} at ${String(value)} is not the shipped park`).not.toEqual(moved);
    }
  }, 300_000);
});

describe('the stage has a witness, and it is admissible here', () => {
  it('clears on the tuning seeds and again on the holdout', async () => {
    const stage = subject();
    const edit = editOf(WITNESS, 'witness-middle-of-the-building');
    const baseline = requireDispatcher(config, stage.dispatcher.startingProfileId);
    const resolved = resolveEditedProfile(space, baseline, edit);
    expect(resolved.ok, 'the witness is a point of the declared space').toBe(true);
    if (!resolved.ok) return;

    /*
     * DC-3's first half is that the stage would *accept* the move. This is the clause that was red
     * before the editable list was widened, and it is checked before the batches because a witness
     * the panel refuses is not a witness however it scores.
     */
    const admission = admitProfile(
      space,
      baseline,
      resolved.profile,
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible, admission.sentence).toBe(true);

    const outcome = await play(stage, edit);
    expect(outcome.verdict.metOnTuningSeeds, outcome.verdict.headline).toBe(true);
    /* DC-3b: the holdout batch ran and held. `cleared` is `false` while it is `null`. */
    expect(outcome.verdict.holdout?.held ?? false, outcome.verdict.headline).toBe(true);
    expect(outcome.verdict.cleared, outcome.verdict.headline).toBe(true);
  }, 300_000);
});

describe('the answer the brief hints at is not the obvious one', () => {
  it('leaves the lobby and the top floor behind the setting they replaced', async () => {
    const stage = subject();
    for (const [name, values] of [
      ['at the lobby', AT_THE_LOBBY],
      ['at the top', AT_THE_TOP],
    ] as const) {
      const outcome = await play(stage, editOf(values, `naive-${name}`));
      expect(outcome.verdict.metOnTuningSeeds, `${name}: ${outcome.verdict.headline}`).toBe(false);
      /*
       * *Behind*, not merely *unresolved* — the brief's last sentence says the obvious guess is not
       * automatically the right one, and a run that simply failed to separate would not support it.
       */
      expect(
        outcome.verdict.goals.some((goal) => goal.sentence.includes('came out behind')),
        `${name}: ${outcome.verdict.goals.map((goal) => goal.sentence).join(' ')}`,
      ).toBe(true);
    }
  }, 600_000);
});
