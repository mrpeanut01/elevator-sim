/**
 * **The instrument behind the press ladder** — every contract's day, as built and under each of the
 * two parking presses, plus the dispatcher census that says which standing orders make it moot.
 *
 * ## Why it exists
 *
 * [§ D871](../../../../DECISIONS.md) authored **one** day whose verdict turns on a press, and an
 * assessor then found the two things that stopped it counting: the day was unreachable on purpose,
 * and its tension was conditional on leaving the standing order alone — 8 of 13 shipped dispatchers
 * cleared the same day with no press at all. Both findings are measurements, so the answer to both
 * is a measurement, and `CLAUDE.md`'s oldest lesson about published figures says where it lives: an
 * instrument that can be re-run, not a table somebody typed once.
 *
 * ## What it measures, and on which path
 *
 * Per contract, over `n` seeds of `docs/33` § 4.6's own sequence, on **day 1** under the standing
 * order:
 *
 * - **as built** — the day with no press;
 * - **spread the cars** — one `spread-cars` intervention at {@link PRESS_FRACTION} of the shift;
 * - **park the cars in the lobby** — one `park-cars-lobby` at the same instant.
 *
 * A day is **missed** when any `goalsForDay` reading is anything but `met` —
 * `shift/week.ts#outcomeOf`'s own rule, *unjudged is not passed*, which is the same predicate
 * `contractCurve.sweep.test.ts` counts with. The **verdict line** a player reads is quoted off
 * `dayReportOf` in `pressLadder.test.ts` rather than here: a sweep needs a predicate and a pin needs
 * the sheet's own words, and the two agreeing is asserted there on the pinned seeds.
 *
 * Everything is built through `dev/state.ts#shiftRunConfigOf` with the shipped
 * `data/contract-ladder.json`, so what is measured is the day a player is handed —
 * `docs/05-roadmap.md`'s standing requirement, and the reason `plan.outOfServiceCarIds` is carried
 * to `recordRun` beside the config rather than dropped.
 *
 * ## The census mode
 *
 * `PRESS_LADDER_CENSUS=1` runs each contract's **pinned** seed as built under every shipped
 * dispatcher profile and writes which of them clear it. That is the assessor's own sweep, kept as
 * an instrument, and its output is what `shift/pressLadder.ts#MOOT_UNDER` carries as data and what
 * the stage tells the player before the day starts.
 *
 * ## Why it writes a file rather than printing
 *
 * `CLAUDE.md` records the trap: vitest 4 intercepts `console.log`, so a sweep whose deliverable is a
 * table cannot hand it back on stdout. `PRESS_LADDER_OUT` names the path and an absent one is a
 * failure rather than a silent no-op.
 *
 * ## What it is not
 *
 * It compares no two dispatchers and calls neither better; every cell is a verdict on one day, with
 * its seed printed beside it, and no interval is offered because none is claimed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding, type RunInterventionConfig } from '@elevator-sim/core';

import { buildingConfigOf, shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import type { BrowserResources } from '../dev/data.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { CONTRACTS } from './contracts.js';
import { runHorizonOf } from './dayLength.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';

const SEEDS = Number(process.env['PRESS_LADDER_SEEDS'] ?? '20');
const FROM_N = Number(process.env['PRESS_LADDER_FROM'] ?? '0');

/** Where the press falls, as a fraction of the shift — after the car has gone (§ D871's 0.28). */
const PRESS_FRACTION = Number(process.env['PRESS_LADDER_PRESS_AT'] ?? '0.28');

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

function allBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))];
  const entries = ids.map((id) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')),
    );
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

interface Cell {
  readonly missed: boolean;
  readonly worstWaitS: number;
  readonly legs: string;
  readonly failing: string;
}

function runOne(
  resources: BrowserResources,
  contractId: string,
  buildingId: string,
  dispatcherId: string,
  seed: bigint,
  interventions: readonly RunInterventionConfig[],
): Cell {
  const base = baseState();
  const state = {
    ...base,
    buildingId,
    dispatcherId,
    shiftLengthS: shiftLengthForContract(contractId),
    seed,
    campaignEventId: 'ordinary' as const,
    week: { ...base.week, contractId, day: 1 },
  };
  const plan = shiftRunConfigOf(resources, state);
  const { recording } = recordRun(
    { ...plan.config, interventions },
    { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
  );
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(
    resources.trafficProfiles,
    buildingConfigOf(resources, state.savedBuildings, buildingId),
    state,
  );
  const readings = readGoals(goalsForDay(1, horizon), observations);
  const failing = readings.filter((r) => r.state !== 'met').map((r) => r.goal.id);
  return {
    missed: failing.length > 0,
    worstWaitS: observations.worstWaitS,
    legs: JSON.stringify(
      recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
    ),
    failing: failing.join('+'),
  };
}

describe.runIf(process.env['PRESS_LADDER_SWEEP'] === '1')('the press ladder sweep', () => {
  it('writes each contract’s day as built and under each parking press', () => {
    const out = process.env['PRESS_LADDER_OUT'];
    expect(out, 'PRESS_LADDER_OUT names the file the table is written to').toBeTypeOf('string');
    const resources = allBuildings();
    const only = process.env['PRESS_LADDER_ONLY'];
    const wanted =
      only === undefined ? CONTRACTS : CONTRACTS.filter((c) => only.split(',').includes(c.id));
    const dispatcherId = process.env['PRESS_LADDER_DISPATCHER'] ?? 'collective';
    const lines: string[] = ['contract\tn\tseed\tbuilt\tspread\tpark\tw_built\tw_spread\tw_park\tlegs_spread\tlegs_park\tfail_built'];
    for (const contract of wanted) {
      const lengthS = shiftLengthForContract(contract.id);
      const at = lengthS * PRESS_FRACTION;
      const spread: RunInterventionConfig = { atS: at, change: { kind: 'spread-cars' } };
      const park: RunInterventionConfig = { atS: at, change: { kind: 'park-cars-lobby' } };
      for (let n = FROM_N; n < FROM_N + SEEDS; n += 1) {
        const seed = seedAt(n);
        const a = runOne(resources, contract.id, contract.buildingId, dispatcherId, seed, []);
        const s = runOne(resources, contract.id, contract.buildingId, dispatcherId, seed, [spread]);
        const p = runOne(resources, contract.id, contract.buildingId, dispatcherId, seed, [park]);
        lines.push(
          [
            contract.id,
            String(n),
            String(seed),
            a.missed ? 'missed' : 'cleared',
            s.missed ? 'missed' : 'cleared',
            p.missed ? 'missed' : 'cleared',
            a.worstWaitS.toFixed(1),
            s.worstWaitS.toFixed(1),
            p.worstWaitS.toFixed(1),
            s.legs === a.legs ? 'same' : 'moved',
            p.legs === a.legs ? 'same' : 'moved',
            a.failing,
          ].join('\t'),
        );
        writeFileSync(String(out), `${lines.join('\n')}\n`);
      }
    }
  }, 14_400_000);
});

describe.runIf(process.env['PRESS_LADDER_CENSUS'] === '1')('the dispatcher census', () => {
  it('writes which standing orders clear each pinned day with no press', () => {
    const out = process.env['PRESS_LADDER_OUT'];
    expect(out, 'PRESS_LADDER_OUT names the file').toBeTypeOf('string');
    const pinned = JSON.parse(process.env['PRESS_LADDER_PINNED'] ?? '{}') as Record<string, string>;
    const resources = allBuildings();
    const lines: string[] = ['contract\tseed\tdispatcher\tbuilt\tworst'];
    for (const [contractId, seedText] of Object.entries(pinned)) {
      const contract = CONTRACTS.find((c) => c.id === contractId);
      if (contract === undefined) continue;
      for (const profile of resources.dispatcherProfiles.profiles) {
        const cell = runOne(
          resources,
          contract.id,
          contract.buildingId,
          profile.id,
          BigInt(seedText),
          [],
        );
        lines.push(
          [contract.id, seedText, profile.id, cell.missed ? 'missed' : 'cleared', cell.worstWaitS.toFixed(1)].join('\t'),
        );
        writeFileSync(String(out), `${lines.join('\n')}\n`);
      }
    }
  }, 14_400_000);
});
