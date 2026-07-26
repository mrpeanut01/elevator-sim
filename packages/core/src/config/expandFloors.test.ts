// `structuredClone` is a Node global, not part of lib ES2022, so this file needs the
// ambient Node types even though it imports nothing from `node:`.
/// <reference types="node" />

import { describe, expect, it } from 'vitest';

import { DEFAULT_ID_PATTERN, MAX_FLOORS_PER_RANGE, expandFloors } from './expandFloors.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type { FloorConfig, FloorRange } from './types.js';

function expectConfigError(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected the call to throw a ConfigError');
}

const codes = (error: ConfigError): string[] => error.issues.map((issue) => issue.code ?? '');

describe('expandFloors', () => {
  describe('explicit form', () => {
    it('passes explicit floors through, sorted ascending by index', () => {
      const floors: FloorConfig[] = [
        { id: '3', index: 3, heightM: 8.8, population: 90 },
        { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true, label: 'Lobby' },
        { id: 'P1', index: -1, heightM: -3.5, population: 0, isEntrance: true },
        { id: '2', index: 2, heightM: 5, population: 90 },
      ];

      const expanded = expandFloors({ floors });

      expect(expanded.map((floor) => floor.index)).toEqual([-1, 0, 2, 3]);
      expect(expanded.map((floor) => floor.id)).toEqual(['P1', 'G', '2', '3']);
      expect(expanded[1]).toEqual(floors[1]);
    });

    it('rejects duplicate floor indices', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floors: [
            { id: 'a', index: 4, heightM: 12, population: 10 },
            { id: 'b', index: 4, heightM: 15, population: 10 },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.duplicateId]);
      expect(error.issues[0]?.path).toBe('floors[1].index');
      expect(error.message).toContain('duplicate floor index 4');
    });

    it('rejects duplicate floor ids, because every reference is by id', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floors: [
            { id: 'M', index: 1, heightM: 3, population: 10 },
            { id: 'M', index: 2, heightM: 6, population: 10 },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.duplicateId]);
      expect(error.message).toContain('duplicate floor id "M"');
      expect(error.message).toContain('servesFloors');
    });

    it('rejects a non-integer floor index', () => {
      const error = expectConfigError(() =>
        expandFloors({ floors: [{ id: 'x', index: 1.5, heightM: 3, population: 0 }] }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.invalidFloorRange]);
      expect(error.issues[0]?.path).toBe('floors[0].index');
    });
  });

  describe('range form', () => {
    const towerRange: FloorRange = {
      fromIndex: 32,
      toIndex: 60,
      startHeightM: 124.0,
      floorToFloorM: 3.2,
      populationPerFloor: 40,
      idPattern: '{index}',
    };

    it('expands a range into one floor per index', () => {
      const expanded = expandFloors({ floorRanges: [towerRange] });

      expect(expanded).toHaveLength(29);
      expect(expanded[0]).toEqual({ id: '32', index: 32, heightM: 124.0, population: 40 });
      expect(expanded.at(-1)).toEqual({ id: '60', index: 60, heightM: 213.6, population: 40 });
    });

    it('accumulates height without binary-float dust', () => {
      const expanded = expandFloors({ floorRanges: [towerRange] });

      // 124 + 28 * 3.2 evaluates to 213.60000000000002 in IEEE-754.
      expect(124 + 28 * 3.2).not.toBe(213.6);
      expect(expanded.at(-1)?.heightM).toBe(213.6);
      // Every height is exact to the one decimal place the range declares.
      for (const floor of expanded) {
        expect(floor.heightM).toBe(Math.round(floor.heightM * 10) / 10);
      }
    });

    it(`defaults idPattern to ${DEFAULT_ID_PATTERN}`, () => {
      const expanded = expandFloors({
        floorRanges: [
          {
            fromIndex: 1,
            toIndex: 3,
            startHeightM: 0,
            floorToFloorM: 3,
            populationPerFloor: 5,
          },
        ],
      });

      expect(expanded.map((floor) => floor.id)).toEqual(['1', '2', '3']);
    });

    it('substitutes {index} in the id and label patterns and applies isEntrance', () => {
      const expanded = expandFloors({
        floorRanges: [
          {
            fromIndex: 1,
            toIndex: 2,
            startHeightM: 0,
            floorToFloorM: 4,
            populationPerFloor: 0,
            idPattern: 'L{index}',
            label: 'Level {index}',
            isEntrance: true,
          },
        ],
      });

      expect(expanded).toEqual([
        { id: 'L1', index: 1, heightM: 0, population: 0, isEntrance: true, label: 'Level 1' },
        { id: 'L2', index: 2, heightM: 4, population: 0, isEntrance: true, label: 'Level 2' },
      ]);
    });

    it('applies a constant label, isTransferFloor and trafficProfile to every floor', () => {
      const expanded = expandFloors({
        floorRanges: [
          {
            fromIndex: 78,
            toIndex: 80,
            startHeightM: 312.0,
            floorToFloorM: 3.4,
            populationPerFloor: 22,
            label: 'Zone 6 residential',
            trafficProfile: 'residential',
            isTransferFloor: true,
          },
        ],
      });

      expect(expanded).toHaveLength(3);
      for (const floor of expanded) {
        expect(floor.label).toBe('Zone 6 residential');
        expect(floor.trafficProfile).toBe('residential');
        expect(floor.isTransferFloor).toBe(true);
      }
      expect(expanded.map((floor) => floor.heightM)).toEqual([312, 315.4, 318.8]);
    });

    it('handles negative indices for basements', () => {
      const expanded = expandFloors({
        floorRanges: [
          {
            fromIndex: -3,
            toIndex: -1,
            startHeightM: -10.5,
            floorToFloorM: 3.5,
            populationPerFloor: 0,
            idPattern: 'P{index}',
          },
        ],
      });

      expect(expanded.map((floor) => [floor.id, floor.index, floor.heightM])).toEqual([
        ['P-3', -3, -10.5],
        ['P-2', -2, -7],
        ['P-1', -1, -3.5],
      ]);
    });

    it('rejects fromIndex greater than toIndex', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floorRanges: [
            {
              fromIndex: 10,
              toIndex: 4,
              startHeightM: 0,
              floorToFloorM: 3,
              populationPerFloor: 1,
            },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.invalidFloorRange]);
      expect(error.issues[0]?.path).toBe('floorRanges[0].toIndex');
      expect(error.message).toContain('expected fromIndex <= toIndex');
    });

    it('rejects a non-positive floor-to-floor height', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floorRanges: [
            { fromIndex: 1, toIndex: 4, startHeightM: 0, floorToFloorM: 0, populationPerFloor: 1 },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.invalidFloorRange]);
      expect(error.issues[0]?.path).toBe('floorRanges[0].floorToFloorM');
    });

    it('rejects a range larger than the guard limit', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floorRanges: [
            {
              fromIndex: 1,
              toIndex: MAX_FLOORS_PER_RANGE + 1,
              startHeightM: 0,
              floorToFloorM: 3,
              populationPerFloor: 1,
            },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.floorRangeTooLarge]);
      expect(error.message).toContain(String(MAX_FLOORS_PER_RANGE));
    });

    it('rejects two ranges covering the same index', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floorRanges: [
            { fromIndex: 1, toIndex: 10, startHeightM: 0, floorToFloorM: 3, populationPerFloor: 1 },
            { fromIndex: 8, toIndex: 20, startHeightM: 24, floorToFloorM: 3, populationPerFloor: 1 },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.floorRangeOverlap]);
      expect(error.message).toContain('floor index 8 is already produced by floorRanges[0]');
      expect(error.message).toContain('explicit "floors" entry');
    });
  });

  describe('both forms together', () => {
    it('lets an explicit floor win on index collision', () => {
      const expanded = expandFloors({
        floors: [
          { id: 'SKY', index: 31, heightM: 120.5, population: 0, label: 'Sky lobby' },
          { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
        ],
        floorRanges: [
          {
            fromIndex: 30,
            toIndex: 32,
            startHeightM: 117.0,
            floorToFloorM: 3.5,
            populationPerFloor: 40,
          },
        ],
      });

      expect(expanded.map((floor) => floor.id)).toEqual(['G', '30', 'SKY', '32']);
      expect(expanded[2]).toEqual({
        id: 'SKY',
        index: 31,
        heightM: 120.5,
        population: 0,
        label: 'Sky lobby',
      });
      // The range still governs its other indices.
      expect(expanded[1]).toEqual({ id: '30', index: 30, heightM: 117, population: 40 });
      expect(expanded[3]).toEqual({ id: '32', index: 32, heightM: 124, population: 40 });
    });

    it('still rejects an id collision introduced by an override', () => {
      const error = expectConfigError(() =>
        expandFloors({
          floors: [{ id: '2', index: 5, heightM: 15, population: 0 }],
          floorRanges: [
            { fromIndex: 1, toIndex: 5, startHeightM: 0, floorToFloorM: 3, populationPerFloor: 1 },
          ],
        }),
      );

      expect(codes(error)).toEqual([ISSUE_CODES.duplicateId]);
      expect(error.message).toContain('duplicate floor id "2"');
    });
  });

  describe('diagnostics', () => {
    it('reports every problem at once, located by file and path', () => {
      const error = expectConfigError(() =>
        expandFloors(
          {
            floors: [
              { id: 'a', index: 1, heightM: 0, population: 0 },
              { id: 'b', index: 1, heightM: 3, population: 0 },
            ],
            floorRanges: [
              { fromIndex: 9, toIndex: 4, startHeightM: 0, floorToFloorM: 3, populationPerFloor: 0 },
            ],
          },
          { file: '/data/buildings/tower.json', pathPrefix: 'building' },
        ),
      );

      expect(error.issues).toHaveLength(2);
      expect(error.issues.map((issue) => issue.path)).toEqual([
        'building.floorRanges[0].toIndex',
        'building.floors[1].index',
      ]);
      for (const issue of error.issues) {
        expect(issue.file).toBe('/data/buildings/tower.json');
      }
      expect(error.message).toContain('/data/buildings/tower.json');
      expect(error.message).toContain('data/buildings/README.md');
    });

    it('rejects a building that declares no floors at all', () => {
      const error = expectConfigError(() => expandFloors({}));

      expect(codes(error)).toEqual([ISSUE_CODES.noFloors]);
      expect(error.message).toContain('floorRanges');
    });
  });

  it('does not mutate its input', () => {
    const source = {
      floors: [{ id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true }],
      floorRanges: [
        { fromIndex: 1, toIndex: 3, startHeightM: 3, floorToFloorM: 3, populationPerFloor: 10 },
      ],
    };
    const snapshot = structuredClone(source);

    expandFloors(source);

    expect(source).toEqual(snapshot);
  });
});
