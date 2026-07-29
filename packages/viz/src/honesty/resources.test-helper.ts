/**
 * The real `data/` directory, assembled into {@link HonestyResources}.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`.
 *
 * Everything here is loaded rather than mocked, for `fixtures.test-helper.ts`'s stated reason.
 * The claim under search is that the **shipped** experience layer prints honest strings on the
 * **shipped** configurations; a fixture building would prove that a fixture building renders.
 *
 * This is also the file that keeps `boundaries.test.ts` satisfied. `honesty/` proper is
 * browser-facing — no `node:` import, no bare `@elevator-sim/core` specifier — so the filesystem
 * and `loadConfig` live here, which is a test helper and is exempt for exactly this purpose.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';

import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign } from '../campaign/types.js';
import { restrictedFloorIds } from '../access/zoning.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import type { HonestyResources } from './run.js';

export { DATA_DIR };

export interface LoadedHonestyResources {
  readonly resources: HonestyResources;
  readonly config: LoadedConfig;
  readonly campaign: Campaign;
  readonly published: PublishedGoalRates;
}

/**
 * Load `data/` once and shape it into what a case needs.
 *
 * The building **documents** are read from disk rather than reconstructed from
 * `LoadedConfig.buildingsById`, because `editor/editorValidate.ts` validates the authored form —
 * `floorRanges` and all — and a resolved building has already had that expanded away. The editor
 * surface is only worth searching on the document a reader would actually paste.
 */
export async function loadHonestyResources(
  dataDir: string = DATA_DIR,
): Promise<LoadedHonestyResources> {
  const config = await loadConfig(dataDir);
  const published = JSON.parse(
    await readFile(join(dataDir, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const rawCampaign: unknown = JSON.parse(await readFile(join(dataDir, 'campaign.json'), 'utf8'));
  const space = collectSearchSpace();

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
  const campaign = parseCampaign(rawCampaign, context);

  const publishedById = new Map<string, PublishedScenario>(
    published.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const stagesById = new Map<string, { stage: Campaign['stages'][number]; published: PublishedScenario }>();
  for (const stage of campaign.stages) {
    const row = publishedById.get(stage.id);
    if (row === undefined) continue;
    stagesById.set(stage.id, { stage, published: row });
  }

  const buildingDocumentsById = new Map<string, unknown>();
  for (const id of config.buildingsById.keys()) {
    buildingDocumentsById.set(
      id,
      JSON.parse(await readFile(join(dataDir, 'buildings', `${id}.json`), 'utf8')) as unknown,
    );
  }

  const dimensionHelp = new Map<string, string>();
  for (const parameter of space.parameters) {
    if (parameter.description !== undefined) dimensionHelp.set(parameter.id, parameter.description);
  }

  const resources: HonestyResources = {
    buildingsById: config.buildingsById,
    buildingDocumentsById,
    dispatcherProfiles: config.dispatcherProfiles,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    space,
    stagesById,
    dimensionHelp,
  };

  return { resources, config, campaign, published };
}
