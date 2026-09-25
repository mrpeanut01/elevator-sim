/**
 * **The survivor census's inputs, hashed** — the swarm's Q3 ruling, clause 5 (S2), recorded in
 * [§ D1129](../../../../DECISIONS.md).
 *
 * ## Why a hash
 *
 * `data/scenario-survivors.json` is a pinned measurement, and its re-run is gated
 * (`ELEVATOR_SIM_SURVIVORS=deep`, about fifteen minutes on a quiet machine and more on a shared
 * one), so nothing always-on noticed when an input moved under it. One did: `data/campaign.json`
 * changed on 2026-09-16, a day after the table was taken on 2026-09-15, and the price schedule and
 * a stage's demand moved after that. A table whose inputs moved is a count of a game that no longer
 * ships. The hash turns that into a red on every pull request: the census stores the hash of what it
 * was taken over, and `survivorInputs.test.ts` recomputes it.
 *
 * ## What is hashed, and the bound on it
 *
 * Every document the census reads to decide what a stage is and what a move costs: the stages
 * (`campaign.json`), the price list, the dispatcher profiles, the published goal bars, the traffic
 * profiles, the elevator specs, and each stage's own building file. Each is parsed and
 * re-serialised before hashing, so a whitespace edit does not move it and any change to a value
 * does.
 *
 * **Code is not hashed**, and that is the bound: a change to the simulator, the judge or the
 * admission check moves a count without moving this hash. The deep tier's re-run
 * (`survivorSweep.test.ts`) and the survivor replay (`survivorReplay.test.ts`) are what catch
 * those.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The documents every census reads, relative to `data/`. The stage buildings are added per stage. */
export const CENSUS_INPUT_DOCUMENTS: readonly string[] = Object.freeze([
  'campaign.json',
  'price-schedule.json',
  'dispatcher-profiles.json',
  'scenario-goals.json',
  'traffic-profiles.json',
  'elevator-specs.json',
]);

/** The hash, and the files it was taken over, in the order they were fed to it. */
export interface CensusInputHash {
  readonly hash: string;
  readonly files: readonly string[];
}

/**
 * Hash the census's inputs as they stand in `dataDir`.
 *
 * The building list is read off `campaign.json` itself, so a stage moved to another building moves
 * the file set as well as the hash.
 */
export async function censusInputHashOf(dataDir: string): Promise<CensusInputHash> {
  const campaign = JSON.parse(await readFile(join(dataDir, 'campaign.json'), 'utf8')) as {
    readonly stages?: readonly { readonly building?: unknown }[];
  };
  const buildings = [
    ...new Set(
      (campaign.stages ?? [])
        .map((stage) => stage.building)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ].sort();
  const files = [...CENSUS_INPUT_DOCUMENTS, ...buildings.map((id) => `buildings/${id}.json`)];
  const hash = createHash('sha256');
  for (const file of files) {
    const canonical = JSON.stringify(JSON.parse(await readFile(join(dataDir, file), 'utf8')));
    hash.update(`${file}\n${canonical}\n`);
  }
  return { hash: hash.digest('hex'), files };
}
