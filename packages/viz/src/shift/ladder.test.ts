/**
 * The shipped contract ladder, checked against `docs/33`'s own rules — GitHub issue **#382**.
 *
 * Four things, and the third is the one that would catch a dead seam:
 *
 * 1. **Every rung is legal.** `contractLadderIssues` run against the real `data/`, so a rate outside
 *    its profile's declared range, a bank the building does not have, a machine at a speed its class
 *    forbids, an occupancy outside the schema's own bounds or a missing rung is a failing test rather
 *    than a live scenario nobody measured.
 * 2. **Every rung's tower resolves.** `ladderTowersOf` puts each contract's fabric through
 *    `parseBuilding` and `resolveBuilding` — the same door `shift/growth.ts` insists a grown building
 *    goes through — so a rung that produces a building the loader would refuse fails here and not on
 *    a player's screen. `ladderTowersOf` swallows that refusal by design (a scenario card is not the
 *    place to discover bad data); this is the place that does not.
 * 3. **A rung that declares something changes the legs, and one that declares nothing changes
 *    nothing.** `docs/05-roadmap.md`'s standing requirement, pointed at a data file, in both
 *    directions: a control that writes nothing must say so, and a control that says it writes
 *    something must.
 * 4. **DC-6 holds on the declaration.** The measured DC-6 is the sweep's — this is the cheap half,
 *    over the targets, and it is what stops a reorder landing without anybody re-measuring.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig, parseBuilding, resolveBuilding, type BuildingConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { mixedFleetBanks } from '../commissioning/choices.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import type { BrowserResources } from '../dev/data.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { CONTRACTS } from './contracts.js';
import {
  CONTRACT_LADDER,
  contractLadderIssues,
  ladderRowFor,
  ladderTowersOf,
  OCCUPANCY_BOUNDS,
  rungIncidents,
  type ContractIncident,
  type LadderValidationInput,
} from './ladder.js';

let config: LoadedConfig;

/** The authored config, read from disk — `LoadedConfig` carries only the resolved form. */
function authoredBuilding(id: string): BuildingConfig {
  return parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')));
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

/** The real `data/`, threaded rather than imported — `ladder.ts` may not read the filesystem. */
function validationInput(): LadderValidationInput {
  return {
    rateRangeFor: (buildingId) => {
      const building = config.buildingsById.get(buildingId);
      if (building === undefined) return undefined;
      const profile = config.trafficProfilesById.get(building.trafficProfile);
      if (profile === undefined) return undefined;
      return { min: profile.arrivalRatePctPop5min.min, max: profile.arrivalRatePctPop5min.max };
    },
    bankIdsFor: (buildingId) => config.buildingsById.get(buildingId)?.banks.map((bank) => bank.id),
    carIdsFor: (buildingId, bankId) =>
      config.buildingsById
        .get(buildingId)
        ?.banks.find((bank) => bank.id === bankId)
        ?.cars.map((car) => car.id),
    mixedBankIdsFor: (buildingId) => mixedFleetBanks(authoredBuilding(buildingId)),
    speedBandFor: (machineClassId) => {
      const entry = config.specsById.get(machineClassId);
      if (entry === undefined) return undefined;
      return { min: entry.ratedSpeedMps.min, max: entry.ratedSpeedMps.max };
    },
    floorProfilesFor: (buildingId) => {
      const authored = authoredBuilding(buildingId);
      const declared = new Set<string>();
      for (const range of authored.floorRanges ?? []) {
        if (range.trafficProfile !== undefined) declared.add(range.trafficProfile);
      }
      for (const floor of authored.floors ?? []) {
        if (floor.trafficProfile !== undefined) declared.add(floor.trafficProfile);
      }
      return [...declared];
    },
  };
}

describe('the shipped ladder is legal against the shipped data', () => {
  it('has no issue at all', () => {
    expect(contractLadderIssues(CONTRACT_LADDER, validationInput())).toEqual([]);
  });

  it('declares one rung per contract, both directions', () => {
    expect([...CONTRACT_LADDER.rows].map((row) => row.contractId).sort()).toEqual(
      [...CONTRACTS].map((contract) => contract.id).sort(),
    );
  });

  it('keeps every occupancy inside the schema’s own bounds', () => {
    for (const row of CONTRACT_LADDER.rows) {
      expect(row.fabric.occupancy, row.contractId).toBeGreaterThanOrEqual(OCCUPANCY_BOUNDS.min);
      expect(row.fabric.occupancy, row.contractId).toBeLessThanOrEqual(OCCUPANCY_BOUNDS.max);
    }
  });

  it('declares no bar, no goal and no tier — DC-R1’s substrates or nothing', () => {
    /*
     * Read off the **authored document** rather than off the parsed shape, because the parser drops
     * a key it does not know and this is the check that a content author cannot add one. `docs/33`
     * § 4.3 and `CLAUDE.md`: difficulty is never a fudge factor on a metric, and the cheapest place
     * to keep that refusal is a schema in which a bar is not expressible.
     */
    const authored = JSON.parse(
      readFileSync(join(DATA_DIR, 'contract-ladder.json'), 'utf8'),
    ) as { readonly contracts: readonly Record<string, unknown>[] };
    for (const row of authored.contracts) {
      expect(Object.keys(row).sort()).toEqual([
        'buildingId',
        'contractId',
        'demand',
        'fabric',
        'intent',
      ]);
      expect(Object.keys(row['demand'] as object).sort()).toEqual(
        Object.keys(row['demand'] as object).length === 0 ? [] : ['arrivalRatePctPop5min'],
      );
      const fabric = row['fabric'] as Record<string, unknown>;
      /*
       * `incidents` is optional and the other two are not, so the expectation is a **subset** rather
       * than a fixed list — and the point of the check survives that: the set is closed, so a key
       * this table does not name still fails. § D871 added the third; `docs/33` DC-R1's fabric
       * substrate is what admits it (*availability — a car out of service*).
       */
      expect(Object.keys(fabric).sort().filter((key) => key !== 'incidents')).toEqual([
        'banks',
        'occupancy',
      ]);
      for (const incident of (fabric['incidents'] as readonly Record<string, unknown>[] | undefined) ?? []) {
        expect(Object.keys(incident).sort()).toEqual([
          'bankId',
          'carId',
          'fromFraction',
          'kind',
          'toFraction',
        ]);
      }
    }
  });
});

describe('a rung’s booked absence reaches the run, and no other rung’s does — § D871', () => {
  /**
   * The seam is `dev/state.ts#shiftRunConfigOf` handing {@link rungIncidents} to
   * `shift/incidents.ts#withIncidents`, which is the same call a drawn wrinkle's derate goes
   * through. What this case asserts is the pair the standing requirement asks for: the declaration
   * reaches the building the kernel is handed, and a rung that declares nothing leaves that
   * building byte-identical to what it was before the field existed.
   *
   * It is **not** a leg comparison, and that is deliberate rather than a shortcut: the only rung
   * that declares an absence runs `crown-hotel`, which `scope/probes.test-helper.ts` does not load,
   * and the leg-level proof in both directions is `pressDecidesTheDay.test.ts` — which also quotes
   * the two verdicts, because a leg difference is not yet a day a player won or lost.
   */
  it('declares exactly one absence, and it is a window strictly inside the run', () => {
    const declaring = CONTRACT_LADDER.rows.filter((row) => row.fabric.incidents.length > 0);
    expect(declaring.length, 'some rung declares an absence, or this case checks nothing').toBe(1);
    for (const row of declaring) {
      for (const incident of rungIncidents(row)) {
        expect(incident.fromFraction).toBeGreaterThan(0);
        expect(incident.toFraction).toBeGreaterThan(incident.fromFraction);
      }
    }
  });

  it('leaves every other rung declaring none, which is the negative control', () => {
    for (const row of CONTRACT_LADDER.rows) {
      if (row.fabric.incidents.length > 0) continue;
      expect(rungIncidents(row), row.contractId).toEqual([]);
    }
  });

  it('refuses an absence that names a car the building does not have', () => {
    /*
     * The refusal, exercised rather than described. `contractLadderIssues` is where a content
     * author's mistake is caught, and a check nobody has seen fail is a check nobody knows works.
     */
    const broken = {
      ...CONTRACT_LADDER,
      rows: CONTRACT_LADDER.rows.map((row) =>
        row.fabric.incidents.length === 0
          ? row
          : {
              ...row,
              fabric: {
                ...row.fabric,
                incidents: [{ ...(row.fabric.incidents[0] as ContractIncident), carId: 'Z' }],
              },
            },
      ),
    };
    const issues = contractLadderIssues(broken, validationInput());
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('takes car Z out of');
  });
});

describe('every rung’s tower resolves through the loader’s own door', () => {
  it('parses and resolves each contract’s building with its rung applied, and runs a car', () => {
    for (const contract of CONTRACTS) {
      const towers = ladderTowersOf({
        entries: [{ config: authoredBuilding(contract.buildingId) }],
        elevatorSpecs: config.elevatorSpecs,
      });
      const tower = towers[0];
      expect(tower, contract.buildingId).toBeDefined();
      const cars = (tower?.banks ?? []).reduce((total, bank) => total + bank.cars.length, 0);
      expect(cars, `${contract.id} runs at least one car`).toBeGreaterThan(0);
    }
  });

  it('moves the tower on every rung that declares fabric, and on no other', () => {
    /*
     * `ladderTowersOf` returns the **as-built** resolution when a rung produces a building the
     * loader refuses, so an unmoved tower would be indistinguishable from a swallowed throw. Both
     * directions are asserted for that reason: a rung with fabric must move its tower, and a rung
     * without must leave it exactly as built.
     */
    for (const contract of CONTRACTS) {
      const rung = ladderRowFor(contract.id);
      expect(rung, contract.id).toBeDefined();
      const authored = authoredBuilding(contract.buildingId);
      const asBuilt = resolveBuilding(authored, config.elevatorSpecs);
      const tower = ladderTowersOf({
        entries: [{ config: authored }],
        elevatorSpecs: config.elevatorSpecs,
      })[0];
      const carsOf = (building: typeof asBuilt): readonly number[] =>
        building.banks.map((bank) => bank.cars.length);
      /*
       * The two fabric fields that move the **tower document**, which is what `ladderTowersOf`
       * returns. `fabric.incidents` is deliberately not one of them (§ D871): a booked absence is
       * written onto the run's building by `shiftRunConfigOf`, after the tower is handed over, so a
       * rung that declares one and nothing else hands back the tower as built — which is correct
       * and is why this predicate names the two rather than asking whether the rung declares any
       * fabric at all.
       */
      const declaresTowerFabric =
        (rung?.fabric.occupancy ?? 1) !== 1 || (rung?.fabric.banks.length ?? 0) > 0;
      const moved =
        tower?.totalPopulation !== asBuilt.totalPopulation ||
        JSON.stringify(carsOf(tower)) !== JSON.stringify(carsOf(asBuilt)) ||
        tower.banks[0]?.cars[0]?.ratedSpeedMps !== asBuilt.banks[0]?.cars[0]?.ratedSpeedMps;
      expect(moved, `${contract.id} declares tower fabric: ${String(declaresTowerFabric)}`).toBe(
        declaresTowerFabric,
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The legs — move the control and require the run to change
 * -------------------------------------------------------------------------- */

function stateOn(contractId: string, buildingId: string): ViewerState {
  const base = baseState();
  return {
    ...base,
    buildingId,
    dispatcherId: 'collective',
    seed: 20_260_824n,
    campaignEventId: 'ordinary' as const,
    week: { ...base.week, contractId, day: 1 },
  };
}

function legsOf(resources: BrowserResources, state: ViewerState): string {
  const plan = shiftRunConfigOf(resources, state);
  return JSON.stringify(
    recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

describe('a rung reaches the run, compared on the legs', () => {
  it('moves the legs where a rung declares something and leaves them where it does not', () => {
    /*
     * `docs/05-roadmap.md`'s standing requirement, pointed at a data file: move the control and
     * require the run to change, **compared on the legs** rather than on a window statistic — *"a
     * mean can be unchanged for a run that is entirely different, and a mean can move because the
     * window moved."*
     *
     * Both directions in one loop, which is the half that catches the other defect: a rung that
     * declares nothing must leave the run **byte-identical**, or the seam is perturbing every day it
     * touches. `garden-apartments` and `midtown-office` are the two buildings the shared probe
     * resources hold, and today they are one of each — Scenario 1 is handed as built and Scenario 4
     * is let at 0.395 — so the loop is not vacuous in either direction.
     */
    for (const buildingId of ['garden-apartments', 'midtown-office']) {
      const contract = CONTRACTS.find((candidate) => candidate.buildingId === buildingId);
      expect(contract, buildingId).toBeDefined();
      const rung = ladderRowFor(contract?.id);
      const declares =
        rung !== undefined &&
        ((rung.fabric.occupancy !== 1 ||
          rung.fabric.banks.length > 0 ||
          rung.arrivalRatePctPop5min !== undefined) as boolean);
      const onContract = legsOf(RESOURCES, stateOn(contract?.id ?? '', buildingId));
      /*
       * The same state under Free Play, which runs the building as authored: `playMode` is the field
       * that decides whether a rung applies at all, so this is the arm the rung has to differ from —
       * and an off-contract week id would not be, because a week on no shipped contract borrows the
       * building's own rung (see `rungFor`, and the replay it was written for).
       */
      const asAuthored = legsOf(RESOURCES, {
        ...stateOn(contract?.id ?? '', buildingId),
        playMode: 'free-play',
      });
      if (declares) {
        expect(onContract, `${buildingId}: the rung reaches the run`).not.toEqual(asAuthored);
      } else {
        expect(onContract, `${buildingId}: a rung that declares nothing changes nothing`).toEqual(
          asAuthored,
        );
      }
    }
  });
});

describe('DC-6 on the declaration', () => {
  it('never falls in the order a player meets them', () => {
    /*
     * The cheap half. The measured half is `contractCurve.sweep.test.ts`, which is a compute job;
     * this is what stops a reorder landing without anybody re-measuring, because moving a contract
     * up the array without moving its target fails here in under a second.
     */
    const targets = CONTRACTS.map(
      (contract) => ladderRowFor(contract.id)?.intent.missRateTarget ?? 0,
    );
    for (let index = 1; index < targets.length; index += 1) {
      expect(
        targets[index] ?? 0,
        `${CONTRACTS[index]?.id ?? ''} after ${CONTRACTS[index - 1]?.id ?? ''}`,
      ).toBeGreaterThanOrEqual(targets[index - 1] ?? 0);
    }
  });
});
