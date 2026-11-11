/**
 * What a building may declare as a non-lift connection, and what it may not.
 *
 * The edge is data (CLAUDE.md invariant 7) and every wrong way to author it must fail at load
 * time with a located message, because the alternative is a connection somebody wrote that the
 * router silently does not have — the same class of defect as a bank serving an undeclared floor.
 */

import { describe, expect, it } from 'vitest';

import { load } from '../sim/fixtures.test-helper.js';

import { parseBuilding, resolveBuilding } from './parse.js';
import { ISSUE_CODES, WARNING_CODES } from './schema.js';
import type { BuildingConfig } from './types.js';

/** A minimal valid one-bank building, plus whatever `transportModes` the case is testing. */
function withModes(modes: unknown): BuildingConfig {
  return {
    id: 'transport-fixture',
    name: 'Transport fixture',
    type: 'office',
    trafficProfile: 'office-standard',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, isTransferFloor: true },
      { id: 'M', index: 1, heightM: 4.5, population: 0, isTransferFloor: true },
      { id: '3', index: 3, heightM: 12, population: 40 },
    ],
    banks: [
      {
        id: 'main',
        servesFloors: ['G', 'M', '3'],
        cars: [{ id: 'A', spec: 'gearless-traction', passengerTransferS: 1.2 }],
      },
    ],
    transportModes: modes,
  } as unknown as BuildingConfig;
}

describe('the schema accepts a well-formed transport mode', () => {
  it('parses id, name, connects and traversalTimeS', () => {
    const parsed = parseBuilding(
      withModes([
        { id: 'esc', name: 'Lobby escalator', connects: ['G', 'M'], traversalTimeS: 21.2 },
      ]),
      'ok.test.json',
    );
    expect(parsed.transportModes).toHaveLength(1);
    expect(parsed.transportModes?.[0]?.connects).toEqual(['G', 'M']);
  });

  it('and a building that declares none resolves to an empty list rather than an absent one', async () => {
    const config = await load();
    const resolved = resolveBuilding(
      parseBuilding(withModes(undefined), 'none.test.json'),
      config.elevatorSpecs,
    );
    expect(resolved.transportModes).toEqual([]);
  });
});

describe('the schema refuses every wrong way to author one', () => {
  const bad: readonly (readonly [string, unknown, RegExp])[] = [
    [
      'a mode joining a floor to itself',
      [{ id: 'esc', connects: ['G', 'G'], traversalTimeS: 21.2 }],
      /two different floors/,
    ],
    [
      'a mode with three landings',
      [{ id: 'esc', connects: ['G', 'M', '3'], traversalTimeS: 21.2 }],
      /connects/,
    ],
    [
      'a mode with one landing',
      [{ id: 'esc', connects: ['G'], traversalTimeS: 21.2 }],
      /connects/,
    ],
    [
      'a zero traversal time — a connection that takes no time is a teleport',
      [{ id: 'esc', connects: ['G', 'M'], traversalTimeS: 0 }],
      /traversalTimeS/,
    ],
    [
      'a negative traversal time',
      [{ id: 'esc', connects: ['G', 'M'], traversalTimeS: -1 }],
      /traversalTimeS/,
    ],
    [
      'a missing traversal time',
      [{ id: 'esc', connects: ['G', 'M'] }],
      /traversalTimeS/,
    ],
    [
      'an unknown field',
      [{ id: 'esc', connects: ['G', 'M'], traversalTimeS: 21.2, capacityPph: 9000 }],
      /capacityPph/,
    ],
    [
      'two modes sharing an id',
      [
        { id: 'esc', connects: ['G', 'M'], traversalTimeS: 21.2 },
        { id: 'esc', connects: ['M', '3'], traversalTimeS: 21.2 },
      ],
      /duplicate|esc/,
    ],
  ];

  for (const [label, modes, pattern] of bad) {
    it(`refuses ${label}`, () => {
      expect(() => parseBuilding(withModes(modes), 'bad.test.json')).toThrow(pattern);
    });
  }
});

describe('a mode naming a floor the building does not declare is fatal, and located', () => {
  it('reports the field and the code rather than routing without the edge', async () => {
    const config = await load();
    let thrown: unknown;
    try {
      resolveBuilding(
        parseBuilding(
          withModes([{ id: 'esc', connects: ['G', '99'], traversalTimeS: 21.2 }]),
          'unknown-floor.test.json',
        ),
        config.elevatorSpecs,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeDefined();
    const issues = (thrown as { issues?: readonly { path: string; code?: string }[] }).issues ?? [];
    expect(issues.some((issue) => issue.code === ISSUE_CODES.unknownFloor)).toBe(true);
    expect(issues.some((issue) => issue.path === 'transportModes[0].connects[1]')).toBe(true);
  });
});

/**
 * `capacityPersonsPerHour` — `DECISIONS.md` § D1631. What the loader accepts, what it refuses, and
 * the one thing it only warns about.
 */
describe('an escalator may declare a carrying capacity, and a stair may not', () => {
  const escalator = (capacity: unknown): unknown[] => [
    { id: 'esc', connects: ['G', 'M'], traversalTimeS: 21.2, capacityPersonsPerHour: capacity },
  ];

  it('parses a declared capacity and leaves an undeclared one absent rather than defaulted', () => {
    const declared = parseBuilding(withModes(escalator(6000)), 'ok.test.json');
    expect(declared.transportModes?.[0]?.capacityPersonsPerHour).toBe(6000);
    const none = parseBuilding(
      withModes([{ id: 'esc', connects: ['G', 'M'], traversalTimeS: 21.2 }]),
      'ok.test.json',
    );
    expect(none.transportModes?.[0]).not.toHaveProperty('capacityPersonsPerHour');
  });

  for (const [label, capacity] of [
    ['zero', 0],
    ['a negative figure', -6000],
    ['a string', '6000'],
  ] as const) {
    it(`refuses ${label}`, () => {
      expect(() => parseBuilding(withModes(escalator(capacity)), 'bad.test.json')).toThrow(
        /capacityPersonsPerHour/,
      );
    });
  }

  it('refuses the field on a stairs mode, and says no stair figure has been cited', () => {
    const stairs = [
      {
        id: 'stair',
        kind: 'stairs',
        connects: ['G', 'M'],
        traversalTimeS: { upS: 17, downS: 11 },
        use: { up: 0.2, down: 0.4 },
        capacityPersonsPerHour: 3000,
      },
    ];
    expect(() => parseBuilding(withModes(stairs), 'bad.test.json')).toThrow(
      /capacityPersonsPerHour is an escalator field\. No stair flow capacity has been consulted or cited/,
    );
  });

  it('warns, and does not refuse, when the figure is above every row of the reference table', async () => {
    const config = await load();
    const rows = config.elevatorSpecs.escalatorCapacity?.rows ?? [];
    // The table is the shipped one and it is the nine EN 115-1 planning figures.
    expect(rows).toHaveLength(9);
    const largest = Math.max(...rows.map((row) => row.personsPerHour));
    expect(largest).toBe(8200);
    const at = resolveBuilding(parseBuilding(withModes(escalator(largest)), 'at.test.json'), config.elevatorSpecs);
    expect(at.warnings.map((warning) => warning.code)).not.toContain(WARNING_CODES.escalatorCapacityAboveReference);
    const above = resolveBuilding(
      parseBuilding(withModes(escalator(largest + 1)), 'above.test.json'),
      config.elevatorSpecs,
    );
    const warning = above.warnings.find((entry) => entry.code === WARNING_CODES.escalatorCapacityAboveReference);
    expect(warning?.path).toBe('transportModes[0].capacityPersonsPerHour');
    expect(warning?.message).toContain('8201 persons per hour');
    // Run as declared: the resolved mode carries the author's figure, not the table's.
    expect(above.transportModes[0]?.capacityPersonsPerHour).toBe(largest + 1);
  });

  it('no shipped building declares one, so no shipped run has a queue', async () => {
    const config = await load();
    for (const building of config.buildings) {
      for (const mode of building.transportModes) {
        expect(mode, `${building.id}/${mode.id}`).not.toHaveProperty('capacityPersonsPerHour');
      }
    }
  });
});
