/**
 * **The reason *everyone can reach their floor* is not scored, checked against an access-zoned day**
 * — the swarm's AP-4 ruling, [§ D1308](../../../../DECISIONS.md).
 *
 * `GOAL_BLOCKER['everyone-can-get-there']` is a sentence a player reads on a stage brief and on the
 * Lab and Compare rows. It said *"A recording carries no credential on a leg"* for two months after
 * recording version 6 put a credential on every leg that needed one, because nothing compared the
 * sentence with a recording. This file is that comparison, on stage 5's building, the campaign's own
 * *Credentials* stage, and it checks each half of what the sentence now says:
 *
 * 1. **A run does record each rider the building turned away for want of a credential** — the
 *    recording's `refusedAt` legs, counted against `core`'s own `conservation.accessRefused`, and
 *    more than none, or the check would pass on a day nobody was refused.
 * 2. **The run totals a goal is judged on leave that count out** — the `BatchReplication` the
 *    shipped batch runner builds for the same day, whose fields are what every predicate in
 *    `scenario/goals.ts` reads. The day it gains such a field, the sentence is false and this reds.
 *
 * And the claim the sentence used to make is checked the same way, so a rewrite that put it back
 * would red too.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBatch } from '../batch/runBatch.js';
import type { BatchReplication } from '../batch/types.js';
import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, FIXTURE_SEED, fixtureConfig, requireBuilding } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { GOAL_BLOCKER, GOAL_JUDGEMENT } from './goals.js';

const BLOCKER = GOAL_BLOCKER['everyone-can-get-there'] ?? '';
const DURATION_S = 600;

let config: LoadedConfig;
let buildingId: string;
let recording: VizRecording;
let accessRefused: number;
let replication: BatchReplication;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const campaign = JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')) as {
    readonly stages: readonly { readonly id: string; readonly building: string }[];
  };
  buildingId = campaign.stages.find((stage) => stage.id === 'stage-5-credentials')?.building ?? '';
  const run = recordRun(
    fixtureConfig(config, { buildingId, dispatcherId: 'collective', durationS: DURATION_S, onTimeout: 'report' }),
  );
  recording = run.recording;
  accessRefused = run.result.conservation.accessRefused ?? 0;
  const batch = runBatch(
    {
      buildingId,
      seed: FIXTURE_SEED.toString(),
      durationS: DURATION_S,
      replications: 1,
      arrivalRatePctPop5min: null,
      arms: [{ armId: 'shipped', dispatcherProfileId: 'collective' }],
    },
    {
      building: requireBuilding(config, buildingId),
      dispatcherProfiles: config.dispatcherProfiles,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    },
  );
  const first = batch.arms[0]?.replications[0];
  if (first === undefined) throw new Error('the batch ran no replication');
  replication = first;
});

describe('the blocker on “everyone can reach their floor” is true of an access-zoned day — § D1308', () => {
  it('runs on a building whose zones a rider can actually be refused by', () => {
    expect(buildingId).toBe('secure-tower');
    expect(requireBuilding(config, buildingId).accessZones.length).toBeGreaterThan(0);
    expect(GOAL_JUDGEMENT['everyone-can-get-there']).toBe('blocked');
  });

  it('does not claim a recording carries no credential, because this day’s legs carry one', () => {
    const withCredential = recording.legs.filter((leg) => leg.credentialGroup !== undefined).length;
    expect(withCredential).toBeGreaterThan(0);
    /* The claim the sentence used to make, checked against the recording rather than against a list of words. */
    const claimsNoCredential = /no credential on a leg/u.test(BLOCKER);
    expect(claimsNoCredential && withCredential > 0, BLOCKER).toBe(false);
  });

  it('is right that a run records each rider the building turned away', () => {
    expect(BLOCKER).toContain('turned away for want of a credential');
    const refused = recording.legs.filter((leg) => leg.refusedAt !== undefined).length;
    expect(refused, 'nobody was refused, so the check would pass on nothing').toBeGreaterThan(0);
    expect(refused).toBe(accessRefused);
  });

  it('is right that the run totals a goal is judged on leave that count out', () => {
    expect(BLOCKER).toContain('the run totals a goal is judged on leave that count out');
    const fields = [...Object.keys(replication), ...Object.keys(replication.metrics)];
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.filter((field) => /refus|access|credential|turned|locked/iu.test(field))).toEqual([]);
  });

  it('speaks in a player’s words: no repository path, no work-item id, no section sign', () => {
    expect(BLOCKER).not.toMatch(/§|docs\/|\bW\d+\b|\.ts\b|BatchReplication|VizLeg/u);
  });
});
