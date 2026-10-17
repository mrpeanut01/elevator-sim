/**
 * **The census charges a drawn dial edit what the player's press charges for it** — GitHub issue
 * **#628**.
 *
 * The survivor census draws dial edits through `survivorSpace.ts#sampleReachableConfigurations` and
 * plays them through `campaign/stagePress.ts#pressStage`. Until #628 the two priced the same vector
 * two ways: the sampler summed the changes covering the dials it drew, and the press summed the
 * changes covering every dimension on which the **resolved** dispatcher differs from the stage's
 * baseline. Buying "Destination panels" sets `dispatch.callType` to a destination call type, which
 * opens `weights.rideTime`'s gate, so the resolved dispatcher carries one more live weight and the
 * press charges "How calls are assigned" for it, 2 u the sampler never counted. Measured on the
 * shipped draws at the master seed and the published sample size: 42 of 360 draws, every one of
 * them a panels draw, and four of them above their rung.
 *
 * The fix routes the sampler's price through the press's own `admitStageMove`, the function the
 * dropdown and page strata already used, so a configuration has one price. This file checks it on
 * the shipped `data/`, at every rung of every stage, from the shipped master seed.
 *
 * Its decision binds nothing outside `scenario/` and cites [§ D405](../../../../DECISIONS.md).
 */
import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { admitStageMove } from '../campaign/stagePress.js';
import type { CampaignStage } from '../campaign/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { rungsOf } from './budget.js';
import { loadSurvivorFixture } from './regenerateSurvivors.test-helper.js';
import {
  drawDialConfigurations,
  witnessFixtureFor,
  type DialDraw,
  type WitnessFixture,
} from './witnessSearch.test-helper.js';

/**
 * Draws per rung. Above the published 12, so the check reaches past the published prefix; the draw
 * is pure and 30 rungs at this size cost a few seconds.
 */
const DRAWS_PER_RUNG = 40;

/** The change whose gate-opening the sampler used to miss, and the one the press added for it. */
const PANELS = 'destination-panels';
const CALL_RULES = 'dispatch-rules';

interface Drawn {
  readonly stage: CampaignStage;
  readonly fixture: WitnessFixture;
  readonly rungUnits: number;
  readonly stepId: string | null;
  readonly draw: DialDraw;
}

const drawn: Drawn[] = [];

beforeAll(async () => {
  const { campaign } = await loadSurvivorFixture();
  for (const stage of campaign.stages) {
    const fixture = await witnessFixtureFor(stage.id);
    for (const rung of rungsOf(stage.budget)) {
      const draws = await drawDialConfigurations({
        fixture,
        sampleSize: DRAWS_PER_RUNG,
        stepId: rung.stepId,
      });
      for (const draw of draws) drawn.push({ stage, fixture, rungUnits: rung.units, stepId: rung.stepId, draw });
    }
  }
});

function pressOf(entry: Drawn) {
  const { fixture, draw, rungUnits } = entry;
  return admitStageMove(
    {
      space: collectSearchSpace(),
      schedule: shippedPriceSchedule(),
      baseline: fixture.baseline,
      building: fixture.building,
      elevatorSpecs: fixture.elevatorSpecs,
    },
    {
      profile: fixture.baseline,
      edit: { baseProfileId: fixture.baseline.id, profileId: `edit-${String(draw.index)}`, values: draw.values },
    },
    rungUnits,
  );
}

function nameOf(entry: Drawn): string {
  return `${entry.stage.id} @ ${String(entry.stepId)} edit-${String(entry.draw.index)}`;
}

describe('one price for a drawn configuration — GitHub issue #628', () => {
  it('charges every shipped draw what the press charges, at every rung of every stage', () => {
    expect(drawn.length).toBeGreaterThan(0);
    const disagreements: string[] = [];
    for (const entry of drawn) {
      const press = pressOf(entry);
      const { draw } = entry;
      const same =
        draw.units === press.units &&
        [...draw.changeIds].sort().join() === [...press.changeIds].sort().join() &&
        draw.affordable === press.admitted &&
        draw.budgetUnits === entry.rungUnits;
      if (!same) {
        disagreements.push(
          `${nameOf(entry)}: sampler ${String(draw.units)} u [${draw.changeIds.join(', ')}] ` +
            `affordable ${String(draw.affordable)}, press ${String(press.units)} u ` +
            `[${press.changeIds.join(', ')}] admitted ${String(press.admitted)}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('prices a draw that buys destination panels for the call rule its gate opens', () => {
    const panels = drawn.filter((entry) => entry.draw.changeIds.includes(PANELS));
    expect(panels.length, 'no shipped draw bought destination panels, so this case checks nothing').toBeGreaterThan(0);
    /*
     * The regression itself: a panels draw that moved no call-rule dial is still charged for the
     * call rules, because the press sees `weights.rideTime` go live.
     */
    const opened = panels.filter(
      (entry) =>
        entry.draw.changeIds.includes(CALL_RULES) &&
        !Object.keys(entry.draw.values).some((id) => id.startsWith('weights.')),
    );
    expect(opened.length, 'no panels draw had its gate open an unbought call rule').toBeGreaterThan(0);
    for (const entry of opened) {
      const press = pressOf(entry);
      expect(entry.draw.units, nameOf(entry)).toBe(press.units);
      expect(press.moved.map((dimension) => dimension.id), nameOf(entry)).toContain('weights.rideTime');
    }
  });
});
