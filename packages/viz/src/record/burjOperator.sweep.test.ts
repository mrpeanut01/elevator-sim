/**
 * **The Burj-class reference's 57-lift bracket over fifty seeds** — GitHub issue **#438**,
 * `DECISIONS.md` § D545. Gated: `BURJ_BRACKET_SWEEP=1`.
 *
 * `burjOperator.test.ts` pins the bracket at seed 376, on every run, because seed 376 is what the
 * building's `$comment` has always quoted. One seed answers *did this population saturate at this
 * seed* and nothing wider, and #438's re-measurement found that the answer the file had published
 * for its own population was a one-seed answer: on the arrangement as first authored, 3 198 people
 * gave a valid AWT at seed 376 and **saturated on 16 of these 50 seeds**. That count came from this
 * file's logic, run as an uncommitted probe against the building as it stood at the parent of the
 * correcting commit, and it is why the counts below are published beside the seed-376 figures rather than instead of them.
 *
 * What is counted is verdicts, not means: a configuration that saturates on any seed has its AWT
 * interval suppressed (`CLAUDE.md` § Statistical discipline), so no interval is formed here, and
 * `awtInvalidGround` is counted by ground because saturation is one of five and a second ground
 * would be a second finding. The populations are the shipped per-floor figures scaled in
 * proportion, as in `burjOperator.test.ts`.
 *
 * Not scheduled, and `deepTiers.test.ts` records why: the seed-376 slice is pinned on every run,
 * and a nightly re-derivation would write counts nothing reads. It is re-run by hand when the
 * building moves — about two minutes on an Apple M1 Max, each case well inside the project's own
 * 300 s timeout, so it carries no annotation of its own (`testCost.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';

import { recordRun } from './recordRun.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const FILE = 'burj-class-reference.json';
const SEEDS = Array.from({ length: 50 }, (_, i) => BigInt(376 + i));

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

interface RawBuilding {
  totalPopulation: number;
  readonly floors: { population: number }[];
  readonly floorRanges: { populationPerFloor: number }[];
}

describe.runIf(process.env['BURJ_BRACKET_SWEEP'] === '1')(
  'the Burj-class reference’s 57-lift bracket over seeds 376–425 — issue #438',
  () => {
    const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
    const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
    const dispatcherProfiles = parseDispatcherProfiles(dataFile('dispatcher-profiles.json'));
    const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
    const collective = dispatcherProfiles.profiles.find((one) => one.id === 'collective');

    it.each([
      { population: 3198, valid: 49, grounds: { saturated: 1 }, seedsUndelivered: 0, undelivered: 0, generated: 51393 },
      { population: 5307, valid: 13, grounds: { saturated: 37 }, seedsUndelivered: 0, undelivered: 0, generated: 85173 },
      { population: 10614, valid: 0, grounds: { saturated: 50 }, seedsUndelivered: 32, undelivered: 724, generated: 171445 },
    ])(
      'counts the verdicts at $population people',
      (expected) => {
        expect(collective).toBeDefined();
        const raw = dataFile(join('buildings', FILE)) as RawBuilding;
        const scale = expected.population / raw.totalPopulation;
        for (const floor of raw.floors) floor.population *= scale;
        for (const range of raw.floorRanges) range.populationPerFloor *= scale;
        raw.totalPopulation = expected.population;
        const building = resolveBuilding(parseBuilding(raw, FILE), elevatorSpecs, {
          file: FILE,
          trafficProfileIds,
        });

        const counted = {
          population: expected.population,
          valid: 0,
          grounds: {} as Record<string, number>,
          seedsUndelivered: 0,
          undelivered: 0,
          generated: 0,
        };
        for (const seed of SEEDS) {
          const { summary } = recordRun(
            {
              building,
              dispatcherProfile: collective!,
              trafficProfiles,
              elevatorSpecs,
              seed,
              durationS: 1800,
              onTimeout: 'report',
              runId: `burj-438-sweep-${String(expected.population)}-${String(seed)}`,
            } as never,
            { recordDecisions: false },
          ).recording;
          if (summary.awtIsValid) counted.valid += 1;
          else {
            const ground = summary.awtInvalidGround ?? '(none)';
            counted.grounds[ground] = (counted.grounds[ground] ?? 0) + 1;
          }
          if (summary.undelivered > 0) counted.seedsUndelivered += 1;
          counted.undelivered += summary.undelivered;
          counted.generated += summary.generated;
        }
        expect(counted).toEqual(expected);
      },
    );
  },
);
