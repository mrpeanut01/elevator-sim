/**
 * The shipped `data/`, loaded once in the shape `fixit/run.ts` wants it — the fix-it suites' own
 * fixture door.
 *
 * It was `cases.test.ts`'s private `resourcesFromDisk`, and it moved here when a second suite
 * (`theAnswerIsNotPrinted.test.ts`, GitHub issue **#566**) needed the same eight lines of loading.
 * Copying them would have been a second statement of *which parsers a fix-it run goes through*,
 * which is `campaign/stageRun.ts`'s rule one level down: a suite that assembled its own resources
 * would vouch for a reimplementation of the loader rather than for the loader.
 *
 * **Same parsers, same resolution door as the browser's.** `dev/data.ts#loadFixitCases` fetches
 * over HTTP and these suites run under Node, so the bytes arrive differently and nothing else does
 * — including `elevatorSpecs`, which the shipped loader passes and without which no shaft resolves
 * a plan-area band (GitHub issue #429 stage 2, § D631).
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { fixitContextOf, parseFixitCases } from './parse.js';
import type { FixitResources } from './run.js';
import type { FixitCases } from './types.js';

/** Every shipped building, spec, profile and traffic file, parsed and resolved. */
export async function fixitResourcesFromDisk(): Promise<FixitResources> {
  const [specsRaw, trafficRaw, dispatchersRaw] = await Promise.all([
    readFile(join(DATA_DIR, 'elevator-specs.json'), 'utf8'),
    readFile(join(DATA_DIR, 'traffic-profiles.json'), 'utf8'),
    readFile(join(DATA_DIR, 'dispatcher-profiles.json'), 'utf8'),
  ]);
  const elevatorSpecs = parseElevatorSpecs(JSON.parse(specsRaw));
  const trafficProfiles = parseTrafficProfiles(JSON.parse(trafficRaw));
  const dispatcherProfiles = parseDispatcherProfiles(JSON.parse(dispatchersRaw));
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const dir = join(DATA_DIR, 'buildings');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const entries = await Promise.all(
    names.map(async (name) => {
      const config = parseBuilding(JSON.parse(await readFile(join(dir, name), 'utf8')), name);
      return {
        config,
        resolved: resolveBuilding(config, elevatorSpecs, { file: name, trafficProfileIds }),
      };
    }),
  );
  return { entries, elevatorSpecs, trafficProfiles, dispatcherProfiles, trafficProfileIds };
}

/** `data/fixit-cases.json`, through the same context the browser builds. */
export async function shippedFixitCases(resources: FixitResources): Promise<FixitCases> {
  const raw = JSON.parse(await readFile(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as unknown;
  return parseFixitCases(
    raw,
    fixitContextOf({
      schedule: shippedPriceSchedule(),
      buildings: resources.entries.map((entry) => entry.resolved),
      trafficProfiles: resources.trafficProfiles,
      dispatcherProfiles: resources.dispatcherProfiles,
      elevatorSpecs: resources.elevatorSpecs,
    }),
  );
}
