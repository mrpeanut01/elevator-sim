/**
 * Validation, and the property `ED-20`/`RV-18` make load-bearing: **every issue at once**.
 *
 * The row is worded as a regression against the loader's own contract, so the tests are worded
 * that way too: they break a document in several independent places and require the count to
 * match, rather than requiring "an error" to be present. A validator that returned the first
 * issue would pass every "is it invalid?" assertion ever written.
 */

import { loadConfig, type BuildingConfig, type LoadedConfig } from '@elevator-sim/core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  issuesMayBeIncomplete,
  summariseReport,
  validateBuilding,
  validateBuildingText,
} from './editorValidate.js';

let config: LoadedConfig;
let garden: BuildingConfig;
let trafficProfileIds: ReadonlySet<string>;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  garden = JSON.parse(
    await readFile(join(DATA_DIR, 'buildings', 'garden-apartments.json'), 'utf8'),
  ) as BuildingConfig;
  trafficProfileIds = new Set(config.trafficProfilesById.keys());
}, 120_000);

function check(building: unknown) {
  return validateBuilding(building, config.elevatorSpecs, {
    file: 'edited.json',
    trafficProfileIds,
  });
}

describe('a valid document', () => {
  it('passes and carries the resolved building for the preview and the Run control', () => {
    const report = check(garden);
    expect(report.valid).toBe(true);
    expect(report.stage).toBe('resolve');
    expect(report.issues).toEqual([]);
    expect(report.resolved?.floors.length).toBe(garden.floors?.length);
    expect(summariseReport(report)).toContain('valid');
    expect(issuesMayBeIncomplete(report)).toBe(false);
  }, 120_000);
});

describe('every issue at once — ED-20, RV-18', () => {
  it('reports all four cross-reference failures, not the first', () => {
    const broken: BuildingConfig = {
      ...garden,
      trafficProfile: 'no-such-profile',
      banks: [
        {
          ...(garden.banks[0] as BuildingConfig['banks'][number]),
          servesFloors: ['G', 'nope-1', 'nope-2'],
          cars: [{ id: 'A', spec: 'antigravity' }],
        },
      ],
      accessZones: [{ id: 'z', floors: ['nope-3'], credentialGroups: ['staff'] }],
    };
    const report = check(broken);
    expect(report.valid).toBe(false);
    expect(report.stage).toBe('resolve');

    // Each of the four independent faults must be represented. Counting them by the value each
    // one names, rather than by issue count alone, so that four copies of one message would not
    // satisfy this.
    const text = report.issues.map((issue) => issue.message).join('\n');
    expect(text).toContain('no-such-profile');
    expect(text).toContain('nope-1');
    expect(text).toContain('nope-2');
    expect(text).toContain('nope-3');
    expect(text).toContain('antigravity');
    expect(report.issues.length).toBeGreaterThanOrEqual(5);

    // And every issue is located, because an unlocated issue in a 60-floor document is a hunt.
    for (const issue of report.issues) {
      expect(issue.file).toBe('edited.json');
      expect(typeof issue.path).toBe('string');
      expect(issue.message.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('reports every schema failure at once too', () => {
    const broken = {
      ...garden,
      id: '',
      name: '',
      type: 'submarine',
      banks: [],
    };
    const report = check(broken);
    expect(report.valid).toBe(false);
    expect(report.stage).toBe('schema');
    expect(report.issues.length).toBeGreaterThanOrEqual(3);
    const paths = report.issues.map((issue) => issue.path);
    expect(paths).toContain('id');
    expect(paths).toContain('name');
    expect(paths).toContain('type');
  }, 120_000);

  it('says the list may be incomplete when it stopped at the schema stage', () => {
    const report = check({ ...garden, type: 'submarine' });
    expect(report.stage).toBe('schema');
    expect(issuesMayBeIncomplete(report)).toBe(true);
    expect(summariseReport(report)).toContain('more may appear');

    // …and does not say so once the cross-reference stage has actually run.
    const resolved = check({ ...garden, trafficProfile: 'no-such-profile' });
    expect(resolved.stage).toBe('resolve');
    expect(issuesMayBeIncomplete(resolved)).toBe(false);
    expect(summariseReport(resolved)).not.toContain('more may appear');
  }, 120_000);
});

describe('warnings are separate and never fatal — ED-T7, ED-12, ED-15, ED-16, ED-17', () => {
  it('a population mismatch is a warning, and the floor sum wins — ED-16', () => {
    const report = check({ ...garden, totalPopulation: 999 });
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    const warning = report.warnings.find((w) => w.code === 'population-mismatch');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('999');
    expect(report.resolved?.totalPopulation).toBe(120);
  }, 120_000);

  it('no entrance floor is a warning, not an error — ED-15', () => {
    const report = check({
      ...garden,
      floors: (garden.floors ?? []).map((floor) => ({ ...floor, isEntrance: false })),
    });
    expect(report.valid).toBe(true);
    expect(report.warnings.some((w) => w.code === 'no-entrance-floor')).toBe(true);
  }, 120_000);

  it('a car outside its class envelope is a warning naming the envelope', () => {
    const report = check({
      ...garden,
      banks: [
        {
          ...(garden.banks[0] as BuildingConfig['banks'][number]),
          cars: [{ id: 'A', spec: 'hydraulic', ratedSpeedMps: 9 }],
        },
      ],
    });
    expect(report.valid).toBe(true);
    const warning = report.warnings.find((w) => w.code === 'speed-outside-class-range');
    expect(warning?.message).toContain('9');
  }, 120_000);

  /**
   * **ED-17 changed meaning in Phase 6, and it changed because the old claim became false.**
   *
   * It used to assert `double-deck-not-simulated` on any bank declaring a double-deck car. That
   * code is retired: `core` simulates the decks from the bank's `servesFloorPairs`. What survives
   * — and what the editor still has to surface — is the *one* configuration where the hardware is
   * declared and the geometry is not, because there the car really does run as a single deck of
   * the combined capacity. Two arms, so the editor cannot go silent in either direction.
   *
   * `packages/viz/UX.md`'s ED-17 row still describes the old behaviour and is left for the lane
   * that owns that document.
   */
  const doubleDeckCar = {
    id: 'A',
    spec: 'hydraulic',
    doubleDeck: true,
    deckSeparationM: 3,
    ratedLoadLb: 3200,
    ratedLoadLbPerDeck: 1600,
  } as const;

  it('double-deck with a declared pairing is simulated, and is not disclaimed — ED-17', () => {
    const report = check({
      ...garden,
      banks: [
        {
          ...(garden.banks[0] as BuildingConfig['banks'][number]),
          servesFloorPairs: [['G', '2']],
          cars: [doubleDeckCar],
        },
      ],
    });
    expect(report.warnings.find((w) => w.code === 'double-deck-not-simulated')).toBeUndefined();
    expect(report.warnings.find((w) => w.code === 'missing-floor-pairs')).toBeUndefined();
    // A warning, so Run stays enabled — ED-12's rule applied here.
    expect(report.valid).toBe(true);
  }, 120_000);

  it('double-deck with no declared pairing is surfaced as not-simulated — ED-17', () => {
    const report = check({
      ...garden,
      banks: [
        {
          ...(garden.banks[0] as BuildingConfig['banks'][number]),
          cars: [doubleDeckCar],
        },
      ],
    });
    const warning = report.warnings.find((w) => w.code === 'missing-floor-pairs');
    expect(warning).toBeDefined();
    expect(warning?.message.toLowerCase()).toContain('cannot be simulated');
    expect(report.valid).toBe(true);
  }, 120_000);
});

describe('validateBuildingText — ED-18', () => {
  it('reports a parse error with its position and does not pretend to have a document', () => {
    const report = validateBuildingText('{ "id": "x", ', config.elevatorSpecs);
    expect(report.stage).toBe('json');
    expect(report.valid).toBe(false);
    expect(report.building).toBeUndefined();
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.code).toBe('invalid-json');
    expect(issuesMayBeIncomplete(report)).toBe(true);
    expect(summariseReport(report)).toContain('JSON');
  });

  it('accepts the text form of a shipped building', async () => {
    const text = await readFile(join(DATA_DIR, 'buildings', 'midtown-office.json'), 'utf8');
    const report = validateBuildingText(text, config.elevatorSpecs, {
      file: 'midtown-office.json',
      trafficProfileIds,
    });
    expect(report.valid).toBe(true);
    expect(report.building?.id).toBe('midtown-office');
  }, 120_000);
});

describe('a per-floor destination panel is refused until the viewer can describe a hybrid run — GitHub issue #437', () => {
  /**
   * The review of PR #532 ran exactly this document through the Engineer editor: midtown-office with
   * up/down buttons declared on every landing but G. Core accepts it — `landingCallType` is a schema
   * field since § D553 — and the viewer would run it as the `hybrid` passenger model, which its
   * disclosure, its pinned-queue overlay and its report still describe as a run whose riders take
   * whichever car answers. So the editor refuses it at every landing that declares one, and the
   * document still opens so the field can be removed here: an invalid file is precisely the one
   * somebody wants to open in an editor.
   */
  async function midtownWithButtonsExceptAt(...kept: readonly string[]): Promise<string> {
    const raw = JSON.parse(
      await readFile(join(DATA_DIR, 'buildings', 'midtown-office.json'), 'utf8'),
    ) as { floors: Record<string, unknown>[] };
    const floors = raw.floors.map((floor) =>
      kept.includes(String(floor['id'])) ? floor : { ...floor, landingCallType: 'up-down-buttons' },
    );
    return JSON.stringify({ ...raw, floors });
  }

  it('refuses the text form at every declaring landing, and still hands back the document to fix', async () => {
    const report = validateBuildingText(await midtownWithButtonsExceptAt('G'), config.elevatorSpecs, {
      file: 'midtown-office.json',
      trafficProfileIds,
    });
    expect(report.valid, 'the Run control stays disabled').toBe(false);
    expect(report.stage).toBe('resolve');
    expect(report.building?.id, 'opened, so the field can be removed here').toBe('midtown-office');
    expect(report.resolved, 'nothing for the Run control to run').toBeUndefined();

    const floors = report.building?.floors ?? [];
    const declaring = floors.flatMap((floor, index) =>
      floor.landingCallType === undefined ? [] : [`floors[${String(index)}].landingCallType`],
    );
    expect(declaring).toHaveLength(floors.length - 1);
    expect(report.issues.map((issue) => issue.path), 'one issue per declaring landing, located').toEqual(declaring);
    for (const issue of report.issues) {
      expect(issue.code).toBe('landing-call-type-not-playable');
      expect(issue.message).toContain('not playable in the viewer yet');
      expect(issue.message).toContain('GitHub issue #437');
    }
    expect(issuesMayBeIncomplete(report)).toBe(false);
    expect(summariseReport(report)).toContain(`${String(declaring.length)} problems`);
  }, 120_000);

  it('refuses a floor range that declares one, located at the range, through the form path too', async () => {
    const raw = JSON.parse(
      await readFile(join(DATA_DIR, 'buildings', 'vertical-city.json'), 'utf8'),
    ) as { floorRanges: Record<string, unknown>[] };
    const floorRanges = raw.floorRanges.map((range, index) =>
      index === 0 ? { ...range, landingCallType: 'destination-entry' } : range,
    );
    const report = check({ ...raw, floorRanges });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => [issue.path, issue.code])).toEqual([
      ['floorRanges[0].landingCallType', 'landing-call-type-not-playable'],
    ]);
  }, 120_000);

  it('still accepts the same shipped buildings with nothing declared', async () => {
    for (const id of ['midtown-office', 'vertical-city']) {
      const text = await readFile(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8');
      expect(validateBuildingText(text, config.elevatorSpecs, { trafficProfileIds }).valid, id).toBe(true);
    }
  }, 120_000);
});

describe('a duplicate id is caught — ED-09, ED-13', () => {
  it('names the other floor when two floors share an id', () => {
    const floors = garden.floors ?? [];
    const first = floors[1];
    if (first === undefined) throw new Error('fixture has no second floor');
    const report = check({ ...garden, floors: [...floors, { ...first, index: 99, heightM: 99 }] });
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.message.includes(first.id))).toBe(true);
  }, 120_000);

  it('a bank serving a floor the building does not declare is rejected — ED-13', () => {
    const report = check({
      ...garden,
      banks: [
        {
          ...(garden.banks[0] as BuildingConfig['banks'][number]),
          servesFloors: ['G', '2', 'ghost'],
        },
      ],
    });
    expect(report.valid).toBe(false);
    const issue = report.issues.find((candidate) => candidate.code === 'unknown-floor');
    expect(issue?.message).toContain('ghost');
    // Located precisely enough to act on: the path names the element, not just the bank.
    expect(issue?.path).toContain('servesFloors');
  }, 120_000);
});

describe('floor ranges — ED-07', () => {
  it('enforces MAX_FLOORS_PER_RANGE with a message naming the ceiling', () => {
    const report = check({
      ...garden,
      floorRanges: [
        {
          fromIndex: 10,
          toIndex: 10_000,
          startHeightM: 40,
          floorToFloorM: 3.2,
          populationPerFloor: 10,
        },
      ],
    });
    expect(report.valid).toBe(false);
    const issue = report.issues.find((candidate) => candidate.code === 'floor-range-too-large');
    expect(issue).toBeDefined();
    expect(issue?.message).toContain('1000');
  }, 120_000);
});
