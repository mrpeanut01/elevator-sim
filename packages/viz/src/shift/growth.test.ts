/**
 * A grown building is a building the loader builds — on all five, at three days.
 *
 * ## What this suite is actually defending
 *
 * `docs/12` § 3.1 BE6 makes growth a **building edit**, and the failure mode of a building edit is
 * that it produces a document the loader accepts *with a new warning*. Warnings do not fail a
 * load, so a grown building whose declared `totalPopulation` no longer matched its floors would
 * run, would produce figures, and would say so only in `resolved.warnings` — where nothing in the
 * viewer looks. That is why the assertion is *no warning the shipped building did not already
 * have* rather than *it loads*.
 *
 * ## Why three days and five buildings rather than one of each
 *
 * Day 1 is the identity case and is the one that must be bit-for-bit the shipped building, because
 * every published figure in this repository was measured on it. Day 5 is a routine week. Day 20 is
 * the one that exercises rounding hardest — ×3.09 on a hundred-and-one-floor tower — and it is the
 * only day at which a per-floor rounding error becomes visible in the total. The five buildings
 * matter because two of them (`mixed-use-high-rise`, `vertical-city`) declare their floors as
 * `floorRanges`, and one of those declares **both** ranges and explicit floors, which is the
 * precedence rule a hand-rolled total would get wrong.
 */

import { loadConfig, parseBuilding, resolveBuilding, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { BUILDING_IDS, DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { grownBuilding, growthFactor } from './growth.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

const DAYS = [1, 5, 20] as const;

/** Warning codes, sorted — the comparison unit. A code is stable; a message is prose. */
function warningCodes(warnings: readonly { readonly code: string }[]): readonly string[] {
  return [...warnings.map((warning) => warning.code)].sort((a, b) => a.localeCompare(b));
}

describe('growthFactor', () => {
  it('is exactly 1 on day 1, so a day-1 shift is the shipped building', () => {
    expect(growthFactor(1)).toBe(1);
  });

  it('is linear, not compounding', () => {
    // 1 + 0.11 × (day − 1). The compounding form would be ×7.26 at day 20 and would put 35 000
    // people in Vertical City. See `types.ts` on GROWTH_PER_DAY.
    expect(growthFactor(20)).toBeCloseTo(3.09, 10);
    expect(growthFactor(20)).toBeLessThan(1.11 ** 19);
  });

  it('never shrinks a building, whatever day it is handed', () => {
    expect(growthFactor(0)).toBe(1);
    expect(growthFactor(-4)).toBe(1);
  });
});

describe('a grown building still loads, on every shipped building', () => {
  it.each(BUILDING_IDS)('%s parses and resolves at days 1, 5 and 20', (buildingId) => {
    const shipped = requireBuilding(config, buildingId);
    const before = warningCodes(shipped.warnings);

    for (const day of DAYS) {
      const grown = grownBuilding(shipped.config, day);
      const parsed = parseBuilding(grown, `${buildingId}@day${String(day)}`);
      const resolved = resolveBuilding(parsed, config.elevatorSpecs, {
        file: `${buildingId}@day${String(day)}`,
        trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
      });
      expect(warningCodes(resolved.warnings), `${buildingId} day ${String(day)}`).toEqual(before);
    }
  });

  it.each(BUILDING_IDS)('%s grows strictly with the day', (buildingId) => {
    const shipped = requireBuilding(config, buildingId);
    const totals = DAYS.map((day) => {
      const grown = grownBuilding(shipped.config, day);
      const parsed = parseBuilding(grown, buildingId);
      return resolveBuilding(parsed, config.elevatorSpecs, { file: buildingId }).totalPopulation;
    });
    expect(totals[0]).toBe(shipped.totalPopulation);
    expect(totals[1]).toBeGreaterThan(totals[0] ?? 0);
    expect(totals[2]).toBeGreaterThan(totals[1] ?? 0);
  });

  it('leaves day 1 structurally identical to the shipped document', () => {
    // Not "close enough": the factor is exactly 1 and `Math.round` is the identity on the
    // integers `data/` declares, so a day-1 shift is comparable with every published figure.
    for (const buildingId of BUILDING_IDS) {
      const shipped = requireBuilding(config, buildingId);
      expect(grownBuilding(shipped.config, 1), buildingId).toEqual(shipped.config);
    }
  });

  it('does not mutate the config it was given', () => {
    const shipped = requireBuilding(config, 'vertical-city');
    const snapshot = JSON.stringify(shipped.config);
    grownBuilding(shipped.config, 20);
    expect(JSON.stringify(shipped.config)).toBe(snapshot);
  });
});

describe('the declared total is the sum of the floors it declares', () => {
  it.each(BUILDING_IDS)('%s: totalPopulation matches the expansion at every day', (buildingId) => {
    // This is the assertion that would fail if the total were re-derived here instead of taken
    // from `core`'s own `expandFloors` — the two would agree until somebody changed one, and
    // `mixed-use-high-rise` (ranges *and* explicit floors) is where they would first diverge.
    const shipped = requireBuilding(config, buildingId);
    for (const day of DAYS) {
      const grown = grownBuilding(shipped.config, day);
      const parsed = parseBuilding(grown, buildingId);
      const resolved = resolveBuilding(parsed, config.elevatorSpecs, { file: buildingId });
      expect(grown.totalPopulation, `${buildingId} day ${String(day)}`).toBe(
        resolved.totalPopulation,
      );
    }
  });

  it('leaves an undeclared total undeclared rather than inventing the check', () => {
    const shipped = requireBuilding(config, 'garden-apartments');
    const { totalPopulation: _dropped, ...withoutTotal } = shipped.config;
    expect(grownBuilding(withoutTotal, 7).totalPopulation).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * How far a week can actually run — measured, not asserted
 * -------------------------------------------------------------------------- */

/**
 * `docs/17` § 5 listed *"whether that is playable or just a wall is unmeasured"* as an open question
 * about endless play. This is the measurement.
 *
 * ## Why it matters, and why the answer is reassuring rather than alarming
 *
 * Growth is `1 + 0.11 × (day − 1)`, linear rather than compounding — the design's own arithmetic,
 * and `GROWTH_PER_DAY`'s docstring already records why the distinction is not pedantry (at day 20
 * the linear form is ×3.09 and the geometric one is ×7.26, and Vertical City compounded would be
 * carrying 35 000 people).
 *
 * The question endless play raises is what happens at day 40 or 60. The answer this measures is that
 * **nothing new has to be built to make that honest**: the building saturates, and the product
 * already refuses to publish a mean for a saturated run and prints the reason instead. Endless play
 * needs no invented horizon and no difficulty fudge — `awtIsValid` is the horizon, it is measured
 * per run rather than declared, and it was there before endless play was a question.
 *
 * That is the argument for *not* adding a day cap. A cap would be a number somebody chose; the
 * suppression is a fact about the run.
 *
 * ## Cost
 *
 * One building at three days, 900 s, no decision log. § D216 § 5 bounds this deliberately: the suite
 * is already long and a measurement that is interesting once does not earn a minute on every run.
 *
 * **Day 60 was in this list and was removed, and that is a finding rather than a trim.** Midtown
 * Office at ×7.5 population did not complete a 900-second run inside vitest's five-second default,
 * so the first wall endless play meets is a **compute** wall and not a gameplay one — a browser tab
 * is asked to simulate a building nobody built. That is worth knowing before an endless mode invites
 * a player to walk into it, and it is the reason the explicit timeout below is generous rather than
 * the reason the day was dropped.
 */
describe('a week can run until the building is genuinely overrun', () => {
  const DAYS = [1, 20, 40] as const;

  it('grows the population by the factor it claims, at every day measured', () => {
    // The arithmetic first, so a saturation result below can be attributed to demand rather than to
    // a growth function that had quietly started compounding.
    for (const day of DAYS) {
      expect(growthFactor(day)).toBeCloseTo(1 + 0.11 * (day - 1), 10);
    }
  });

  it('saturates rather than breaking, and says so through the existing gate', () => {
    /*
     * The load-bearing assertion for endless play. At day 1 a shipped building is quotable; deep
     * into a week it is not — and the product does not need to be told when to stop, because
     * `awtIsValid` already refuses the mean and `awtInvalidReason` already says why.
     *
     * Asserted as a *transition* rather than at a fixed day: pinning "day 40 saturates" would be a
     * published number that stops reproducing the moment a building's population changes, which is
     * the defect this repository has three of on record.
     */
    const state = { ...baseState(), buildingId: 'midtown-office', shiftLengthS: 900 };
    const validity = DAYS.map((day) => {
      const plan = shiftRunConfigOf(RESOURCES, { ...state, week: { ...state.week, day, dayIdx: 0 } });
      const { recording } = recordRun(plan.config, {
        recordDecisions: false,
        outOfServiceCarIds: plan.outOfServiceCarIds,
      });
      return { day, valid: recording.summary.awtIsValid, reason: recording.summary.awtInvalidReason };
    });

    // The run still completes at every day — growth does not throw, and the kernel does not hang.
    expect(validity.length).toBe(DAYS.length);

    // And the refusal, when it comes, comes with words rather than a blank.
    for (const entry of validity) {
      if (entry.valid) continue;
      expect(entry.reason ?? '', `day ${String(entry.day)} refused the mean and said nothing`).not.toBe('');
    }

    // The measurement that answers the open question: a deep day is not quotable on this building.
    // If this ever flips to `true`, endless play has become a flat line and the sheet's own
    // suppression is no longer doing the work this test says it does.
    expect(validity[validity.length - 1]?.valid, 'day 40 on Midtown Office is still quotable').toBe(false);
  }, 60_000);
});
