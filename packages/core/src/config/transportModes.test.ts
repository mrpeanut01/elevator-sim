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
import { ISSUE_CODES } from './schema.js';
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
