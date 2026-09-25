/**
 * **The Scenario hub's contract** — § D525's first tile, GitHub issue #364,
 * [§ D649](../../../../DECISIONS.md).
 *
 * The cases here are the ones that would go red if the hub stopped doing either job it exists for:
 * keeping `door` and `fixit` reachable after their own tiles retired, and — since § D649 — listing
 * the ordered path **without offering a scenario nobody has a way through**. A hub that drew
 * beautifully and pointed at nothing would satisfy every other test in this directory.
 *
 * The path cases run on the **shipped** documents rather than a fixture, for
 * `scenario/ladder.test.ts`'s stated reason: the claim is that the shipped content reaches the
 * player, and a fixture would prove that a fixture does.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { EVERYDAY_MODES } from './modes.js';
import { isScreenBuilt } from './screens.js';
import { SCENARIO_ABSENCES, SCENARIO_COPY, scenarioHubViewOf } from './scenarioModel.js';
import { EVERYDAY_SCREENS } from './types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign } from '../campaign/types.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { scenarioLadderOf, type ScenarioLadderRung } from '../scenario/ladder.js';
import type { PublishedGoalRates } from '../scenario/published.js';
import type { PublishedSurvivors } from '../scenario/survivors.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

let config: LoadedConfig;
let space: SearchSpace;
let campaign: Campaign;
let survivors: PublishedSurvivors;
let path: readonly ScenarioLadderRung[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
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
  campaign = parseCampaign(
    JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')),
    context,
  );
  survivors = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-survivors.json'), 'utf8'),
  ) as PublishedSurvivors;
  path = scenarioLadderOf({ stages: campaign.stages, survivors });
}, 300_000);

describe('the Scenario hub', () => {
  it('offers every entry as a registered screen — never an invitation to a dead end', () => {
    for (const entry of scenarioHubViewOf().entries) {
      expect(EVERYDAY_SCREENS, entry.id).toContain(entry.screen);
      expect(isScreenBuilt(entry.screen), entry.id).toBe(true);
    }
  });

  it('re-homes both retired tiles, which is the whole reason it exists', () => {
    /*
     * § D525 retires *Today's tower* and *Fix a building* as tiles. Their screens stay registered,
     * so something has to reach them or the registry carries two screens no player can open. This
     * is that assertion, stated positively rather than as the absence of a failure.
     */
    const reached = scenarioHubViewOf().entries.map((entry) => entry.screen);
    expect(reached).toEqual(['door', 'fixit']);

    // And the other half: neither screen is a tile any more, so the hub is the only way in.
    const tiles = EVERYDAY_MODES.map((mode) => mode.screen);
    expect(tiles).not.toContain('door');
    expect(tiles).not.toContain('fixit');
  });

  it('gives every entry a blurb and a session shape, like the tiles it replaces', () => {
    // § 5's shape is how a player picks by how long they have. An entry without one is a row that
    // drops the only thing distinguishing a 3-minute scenario from a 5-minute one.
    for (const entry of scenarioHubViewOf().entries) {
      expect(entry.title.trim(), entry.id).not.toBe('');
      expect(entry.blurb.trim(), entry.id).not.toBe('');
      expect(entry.shape.trim(), entry.id).not.toBe('');
    }
  });

  it('addresses entries by id, and never lets two rows share one', () => {
    const ids = scenarioHubViewOf().entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws the list’s reason, and keeps its absences a register rather than a mood', () => {
    /*
     * `docs/38` § 2.1 names four sources. A hub that listed what it has and said nothing would read
     * as finished. The note is therefore never empty, even when `SCENARIO_ABSENCES` empties — and
     * it carries **no count of sources**, because the count it used to carry went stale inside a
     * wave (see `SCENARIO_COPY`'s own comment).
     */
    const view = scenarioHubViewOf(path);
    expect(view.note.trim()).not.toBe('');
    expect(view.absences).toEqual(expect.arrayContaining([...SCENARIO_ABSENCES]));
    for (const absence of view.absences) {
      expect(absence.trim()).not.toBe('');
      // A register entry says what is missing, not that something is missing.
      expect(absence.length).toBeGreaterThan(20);
    }
  });

  it('no longer tells the player the two schemas are separate things, because they are not', () => {
    /*
     * **The correction § D649 makes, asserted so it cannot come back.** The register read *"The ten
     * campaign stages are authored to the campaign record rather than to the scenario schema, so
     * this list cannot reach them until the two are one thing."* `CampaignStage.budget` has been a
     * required field — refused rather than defaulted — since GitHub issue #365 landed, so that
     * sentence told a player the wiring was blocked on a schema that had already shipped. § D227 in
     * the polarity `CLAUDE.md` calls worse than a dead seam.
     *
     * The positive half is asserted beside it: every shipped stage really does carry a budget, so
     * the deletion is a correction rather than a convenience.
     */
    for (const absence of SCENARIO_ABSENCES) {
      expect(absence, absence).not.toMatch(/rather than to the scenario schema/iu);
      expect(absence, absence).not.toMatch(/until the two are one thing/iu);
    }
    for (const stage of campaign.stages) {
      expect(stage.budget.schema.type, stage.id).toBe('integer');
      expect(stage.budget.startingUnits, stage.id).toBeGreaterThan(0);
    }
  });

  it('keeps the half of that row which is still true, rather than emptying the register', () => {
    /*
     * § D1129 made the old half false — the stages play in the fix-it editor and a first clear pays
     * — so it went on the commit that did that, and the half that stays true stays: a clear reaches
     * no career, and nothing sells a stage a wider budget. Deleting a true refusal to empty a
     * register is § D227 pointed the other way.
     */
    const joined = SCENARIO_ABSENCES.join(' ');
    expect(joined).not.toMatch(/banks no chimes/u);
    expect(joined).not.toMatch(/stages on the path are played on the Engineer surface/u);
    expect(joined).toMatch(/pays its chimes once/u);
    expect(joined).toMatch(/does not reach a career/u);
  });

  it('lists the whole ordered path when one is provided, in the campaign’s own order', () => {
    const view = scenarioHubViewOf(path);
    expect(view.path).toBeDefined();
    expect(view.path?.rows.map((row) => row.id)).toEqual(campaign.stages.map((stage) => stage.id));
    expect(view.path?.rows.map((row) => row.position)).toEqual(
      campaign.stages.map((_stage, index) => index + 1),
    );
  });

  it('marks a row playable exactly where the measurement found a way through', () => {
    /*
     * `docs/38` § 2.1: **zero is not a scenario** unless it declares itself a diagnosis. Read off
     * the published table on every run, so a rebalance that opens a held stage moves this case
     * without an edit here — which is the property this wiring was designed for, with a rebalance
     * lane working the same data in the same wave.
     */
    const view = scenarioHubViewOf(path);
    for (const row of view.path?.rows ?? []) {
      const scenario = survivors.scenarios.find((entry) => entry.id === row.id);
      const base = scenario?.steps.find((step) => step.stepId === null);
      const shouldPlay = scenario?.diagnosis !== null || (base?.survivors ?? 0) > 0;
      expect(row.playable, `${row.id} (survivors ${String(base?.survivors)})`).toBe(shouldPlay);
    }
    // Non-vacuity in both directions: a hub where everything or nothing were playable would make
    // every clause above pass while saying nothing about the split it exists to draw.
    const rows = view.path?.rows ?? [];
    expect(rows.some((row) => row.playable)).toBe(true);
    expect(rows.some((row) => !row.playable)).toBe(true);
  });

  it('gives a held row a refusal and no invitation, and a playable row the reverse', () => {
    // GAMEPLAY § 20.12: an unavailable thing is a row with a reason, never a dead control. The two
    // fields are exclusive so the mount cannot draw a press beside a refusal by accident.
    for (const row of scenarioHubViewOf(path).path?.rows ?? []) {
      if (row.playable) {
        expect(row.note, row.id).toBeDefined();
        expect(row.refusal, row.id).toBeUndefined();
      } else {
        expect(row.refusal, row.id).toBeDefined();
        expect(row.note, row.id).toBeUndefined();
      }
    }
  });

  it('draws the measured count on every row, flattering or not', () => {
    // `docs/38` § 2.1's *"drawn on the scenario's own face in the player's words"*. A count shown
    // only where it was good news would be the one curated figure in the product.
    for (const row of scenarioHubViewOf(path).path?.rows ?? []) {
      expect(row.waysThrough.trim(), row.id).not.toBe('');
      expect(row.waysThrough, row.id).toContain('Ways through');
    }
  });

  it('counts the held stages in the register rather than writing the number down', () => {
    /*
     * The count is a measurement of `data/scenario-survivors.json`, so it is derived on every read.
     * A literal here would be a figure a regeneration cannot reach — `CLAUDE.md` records three
     * published numbers that went stale exactly that way.
     */
    const view = scenarioHubViewOf(path);
    const held = (view.path?.rows ?? []).filter((row) => !row.playable).length;
    const listed = view.path?.rows.length ?? 0;
    const line = view.absences.find((absence) => absence.includes('are listed with their'));
    expect(line, 'the held-stage register row is missing').toBeDefined();
    expect(line).toContain(`${String(held)} of the ${String(listed)} stages`);
    // …and it is absent entirely when nothing is held, which is what makes it a register row.
    const allOpen = path.map((rung) => ({ ...rung, offer: 'offered' as const, heldReason: undefined }));
    const open = scenarioHubViewOf(allOpen);
    expect(open.absences.some((absence) => absence.includes('are listed with their'))).toBe(false);
  });

  it('never calls a held stage unwinnable, because the dial half is a sample', () => {
    /*
     * `survivors.ts#dialShareInterval` puts 0 of 12 at about a quarter or fewer with 95 %
     * confidence, so *none found* is the claim the measurement supports and *none exists* is not.
     * The vocabulary is listed rather than inferred, on `refusalsAreCurrent.test.ts`'s stated
     * reason, and carries its own positive control.
     */
    const forbidden = /\bunwinnable\b|\bimpossible\b|\bcannot be (?:cleared|won|beaten)\b|\bno way through\b/iu;
    expect(forbidden.test('this one is unwinnable as configured')).toBe(true);
    expect(forbidden.test('nothing that was tried at this budget got through')).toBe(false);

    const view = scenarioHubViewOf(path);
    for (const row of view.path?.rows ?? []) {
      expect(forbidden.test(row.refusal ?? ''), row.id).toBe(false);
    }
    for (const absence of view.absences) expect(forbidden.test(absence), absence).toBe(false);
  });

  it('draws the path’s absence rather than an empty list when nothing provided one', () => {
    // `scenarioLadderPort.ts` answers `undefined` before the documents land and when they fail to.
    // A hub that drew an empty path would say the campaign has no stages, which is a lie about the
    // content rather than about the load.
    const view = scenarioHubViewOf();
    expect(view.path).toBeUndefined();
    expect(view.absences).toContain(SCENARIO_COPY.pathAbsent);
    // …and the provided case does not carry that sentence, which is what makes it a state.
    expect(scenarioHubViewOf(path).absences).not.toContain(SCENARIO_COPY.pathAbsent);
  });

  it('is pure — two calls agree, and neither reads a document', () => {
    expect(scenarioHubViewOf()).toEqual(scenarioHubViewOf());
    expect(scenarioHubViewOf(path)).toEqual(scenarioHubViewOf(path));
  });
});
