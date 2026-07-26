/**
 * Expansion of the compact `floorRanges` form into explicit floors.
 *
 * A building may declare `floors`, `floorRanges`, or both. Documented precedence:
 * **explicit entries win on index collision** — a range paints the bulk of a tower and
 * individual `floors` entries override the exceptions (a sky lobby, a plant floor with no
 * population).
 *
 * A range's `label`, `isEntrance`, `isTransferFloor` and `trafficProfile` apply to every
 * floor it expands to. `{index}` is substituted in both `idPattern` and `label`.
 */

import { ConfigError, ISSUE_CODES } from './schema.js';
import type { ConfigIssue, FloorConfig, FloorRange } from './types.js';

/** Guard against a typo (`toIndex: 10000`) turning into a gigabyte of floors. */
export const MAX_FLOORS_PER_RANGE = 1000;

/** Default id pattern for a generated floor. */
export const DEFAULT_ID_PATTERN = '{index}';

/** Just the two floor-declaring fields of a building config. */
export interface FloorSource {
  readonly floors?: readonly FloorConfig[] | undefined;
  readonly floorRanges?: readonly FloorRange[] | undefined;
}

export interface ExpandFloorsOptions {
  /** File name used in error messages. */
  readonly file?: string | undefined;
  /** Path prefix used in error messages, e.g. `buildings[2]`. */
  readonly pathPrefix?: string | undefined;
}

/** Heights are accumulated by multiplication, so round off binary-float dust. */
const HEIGHT_PRECISION = 1e6;

function roundHeight(metres: number): number {
  return Math.round(metres * HEIGHT_PRECISION) / HEIGHT_PRECISION;
}

function applyPattern(pattern: string, index: number): string {
  return pattern.replaceAll('{index}', String(index));
}

/**
 * Expand `floorRanges` and merge them with explicit `floors`.
 *
 * - Explicit floors override range-generated floors that share an `index`.
 * - Two ranges may not cover the same index — that is a config error, not a precedence
 *   question: ranges are bulk declarations and overlap is always a mistake.
 * - Floor ids must be unique across the merged result; every other part of a building
 *   config (`servesFloors`, `accessZones`) references floors by id.
 * - Output is sorted ascending by `index`.
 *
 * Pure: no wall-clock, no RNG, no mutation of the input.
 *
 * @throws ConfigError listing every problem found.
 */
export function expandFloors(source: FloorSource, options: ExpandFloorsOptions = {}): FloorConfig[] {
  const file = options.file ?? '<building config>';
  const prefix = options.pathPrefix === undefined ? '' : `${options.pathPrefix}.`;
  const issues: ConfigIssue[] = [];
  const issue = (path: string, message: string, code: string): void => {
    issues.push({ file, path: `${prefix}${path}`, message, code });
  };

  const byIndex = new Map<number, FloorConfig>();
  /** Which range produced the floor at an index, for a precise overlap message. */
  const rangeOfIndex = new Map<number, number>();

  (source.floorRanges ?? []).forEach((range, rangeIndex) => {
    const at = `floorRanges[${rangeIndex}]`;
    if (!Number.isInteger(range.fromIndex) || !Number.isInteger(range.toIndex)) {
      issue(
        `${at}.fromIndex`,
        `expected integer floor indices, received fromIndex=${range.fromIndex}, toIndex=${range.toIndex}`,
        ISSUE_CODES.invalidFloorRange,
      );
      return;
    }
    if (range.fromIndex > range.toIndex) {
      issue(
        `${at}.toIndex`,
        `expected fromIndex <= toIndex, received fromIndex=${range.fromIndex}, toIndex=${range.toIndex}`,
        ISSUE_CODES.invalidFloorRange,
      );
      return;
    }
    if (!(range.floorToFloorM > 0) || !Number.isFinite(range.floorToFloorM)) {
      issue(
        `${at}.floorToFloorM`,
        `expected a positive floor-to-floor height in metres, received ${range.floorToFloorM}`,
        ISSUE_CODES.invalidFloorRange,
      );
      return;
    }
    const count = range.toIndex - range.fromIndex + 1;
    if (count > MAX_FLOORS_PER_RANGE) {
      issue(
        `${at}.toIndex`,
        `range covers ${count} floors, above the ${MAX_FLOORS_PER_RANGE} limit. Check fromIndex/toIndex; split the range if this is deliberate.`,
        ISSUE_CODES.floorRangeTooLarge,
      );
      return;
    }

    const idPattern = range.idPattern ?? DEFAULT_ID_PATTERN;
    for (let index = range.fromIndex; index <= range.toIndex; index += 1) {
      const previousRange = rangeOfIndex.get(index);
      if (previousRange !== undefined) {
        issue(
          `${at}.fromIndex`,
          `floor index ${index} is already produced by floorRanges[${previousRange}]. Ranges may not overlap; use an explicit "floors" entry to override a single floor.`,
          ISSUE_CODES.floorRangeOverlap,
        );
        break;
      }
      const label = range.label === undefined ? undefined : applyPattern(range.label, index);
      byIndex.set(index, {
        id: applyPattern(idPattern, index),
        index,
        heightM: roundHeight(range.startHeightM + (index - range.fromIndex) * range.floorToFloorM),
        population: range.populationPerFloor,
        ...(range.isEntrance === true ? { isEntrance: true } : {}),
        ...(range.isTransferFloor === true ? { isTransferFloor: true } : {}),
        ...(range.trafficProfile === undefined ? {} : { trafficProfile: range.trafficProfile }),
        ...(label === undefined ? {} : { label }),
      });
      rangeOfIndex.set(index, rangeIndex);
    }
  });

  const explicitIndices = new Map<number, number>();
  (source.floors ?? []).forEach((floor, floorIndex) => {
    const at = `floors[${floorIndex}]`;
    if (!Number.isInteger(floor.index)) {
      issue(
        `${at}.index`,
        `expected an integer floor index, received ${floor.index}`,
        ISSUE_CODES.invalidFloorRange,
      );
      return;
    }
    const first = explicitIndices.get(floor.index);
    if (first !== undefined) {
      issue(
        `${at}.index`,
        `duplicate floor index ${floor.index}; already declared at floors[${first}]. Floor indices must be unique.`,
        ISSUE_CODES.duplicateId,
      );
      return;
    }
    explicitIndices.set(floor.index, floorIndex);
    // Documented precedence: an explicit floor overrides whatever a range produced.
    byIndex.set(floor.index, floor);
  });

  const floors = [...byIndex.values()].sort((a, b) => a.index - b.index);

  const byId = new Map<string, FloorConfig>();
  for (const floor of floors) {
    const clash = byId.get(floor.id);
    if (clash !== undefined) {
      issue(
        `floors`,
        `duplicate floor id "${floor.id}" at index ${floor.index}; index ${clash.index} already uses it. Floor ids are the key that servesFloors and accessZones reference, so they must be unique.`,
        ISSUE_CODES.duplicateId,
      );
      continue;
    }
    byId.set(floor.id, floor);
  }

  if (floors.length === 0 && issues.length === 0) {
    issue(
      'floors',
      'no floors declared. Provide "floors" (explicit form), "floorRanges" (compact form), or both. See data/buildings/README.md.',
      ISSUE_CODES.noFloors,
    );
  }

  if (issues.length > 0) {
    throw new ConfigError(issues, {
      summary: `Cannot expand floors: ${issues.length} problem${issues.length === 1 ? '' : 's'}`,
      hint: 'See data/buildings/README.md for the floor schema.',
    });
  }

  return floors;
}
