/**
 * **The one fixed rush pre-fit kit, its arithmetic and its two appliers** — GitHub issue #372,
 * § D640.
 *
 * Read against the **shipped** `data/chime-ledger.json` and `data/buildings/`, on
 * `rushPurse.test.ts`'s ground: a rule that holds of a fixture and not of the file the server boots
 * from is a rule about the fixture. The refusals are driven on edited copies of the shipped ledger,
 * one field at a time.
 *
 * What is **not** here, because it cannot be: whether this kit changes a run. That is a question
 * about legs and it is asked where legs are —
 * `packages/server/src/leaderboard/rushHoldAgreement.json`'s `prefit` cells, played by both halves
 * and each required to differ from its unfitted twin.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseChimeLedger, type ChimeLedgerTable } from './chimeLedger.js';
import { loadConfig } from './loader.js';
import {
  MIN_DOOR_S,
  RUSH_PREFIT_KIT,
  RUSH_PREFIT_SINK_ID,
  claimsRushPrefit,
  doorCycleWithSaving,
  prefittedRushBuilding,
  prefittedRushProfile,
  violationsInRushPrefit,
} from './rushPrefit.js';
import type { BuildingConfig, DispatcherProfile, ElevatorSpecs } from './types.js';

const DATA = fileURLToPath(new URL('../../../../data/', import.meta.url));
const RAW_LEDGER = JSON.parse(readFileSync(`${DATA}chime-ledger.json`, 'utf8')) as {
  readonly sinks: readonly Record<string, unknown>[];
};
const LEDGER = parseChimeLedger(RAW_LEDGER);

/** The shipped ledger with one sink replaced, so a refusal is driven on the real document. */
function ledgerWith(sinks: readonly Record<string, unknown>[]): ChimeLedgerTable {
  return parseChimeLedger({ ...RAW_LEDGER, sinks });
}

const PREFIT_RAW = RAW_LEDGER.sinks.find((sink) => sink['id'] === RUSH_PREFIT_SINK_ID);

describe('the kit’s price, which is the one figure it shares with data/', () => {
  it('is worth what the sink charges, at one chime per unit', () => {
    const summed = RUSH_PREFIT_KIT.rungs.reduce((total, rung) => total + rung.priceUnits, 0);
    expect(summed, 'the kit’s own rungs do not sum to its stated total').toBe(RUSH_PREFIT_KIT.totalUnits);
    expect(
      LEDGER.sinks.find((sink) => sink.id === RUSH_PREFIT_SINK_ID)?.priceChimes,
      'the pre-fit’s price has moved off the kit’s unit total. One chime per unit is the rate ' +
        'data/campaign.json’s scenario rungs use and the rate § D640 chose; re-derive one or the other ' +
        'rather than leaving the reasoning behind.',
    ).toBe(RUSH_PREFIT_KIT.totalUnits);
  });

  it('names three shop rows and no category the kit refuses', () => {
    expect(RUSH_PREFIT_KIT.rungs.map((rung) => rung.priceId)).toEqual([
      'faster-doors',
      'zone-the-tower',
      'queue-marshalling',
    ]);
    /*
     * The negative half, and it is the half § D640's reasoning turns on: a flat currency purchase
     * may not pre-solve the tower (no shaft, no machine, no car size) and may not pre-decide the
     * dispatcher-strategy question the player is there to make live (no destination panel). Those
     * are absences, so they are asserted rather than assumed — an absence nothing checks is how the
     * next tier copied into a kit arrives.
     */
    expect(RUSH_PREFIT_KIT).not.toHaveProperty('extraShafts');
    expect(RUSH_PREFIT_KIT).not.toHaveProperty('machineClassId');
    expect(RUSH_PREFIT_KIT).not.toHaveProperty('carPersons');
    expect(RUSH_PREFIT_KIT).not.toHaveProperty('callType');
    expect(RUSH_PREFIT_KIT).not.toHaveProperty('passengerAssignment');
    expect(RUSH_PREFIT_KIT).not.toHaveProperty('rideTimeWeightFloor');
  });

  it('carries no word a player could read, which is why it may live in core', () => {
    /*
     * § D606 § 2 declined to move `campaign/economy.ts#SHOP` into `core` because its tiers carry
     * player-facing names, subtitles and effect sentences — product copy inside the simulator and
     * outside the honesty corpus's reach. This kit is admitted on the claim that it carries none, so
     * the claim is mechanical: no string on it but the three `priceId`s, which are ids.
     */
    const strings = JSON.stringify(RUSH_PREFIT_KIT).match(/"[^"]*"/gu) ?? [];
    const prose = strings.filter((literal) => /[A-Za-z]+ [A-Za-z]+/u.test(literal));
    expect(prose, 'a prose literal on the kit is product copy in core').toEqual([]);
  });
});

describe('the shipped ledger, held to the id both ends ask by', () => {
  it('agrees with this kit', () => {
    expect(violationsInRushPrefit(LEDGER)).toEqual([]);
  });

  it('is refused when the pre-fit is missing', () => {
    const without = ledgerWith(RAW_LEDGER.sinks.filter((sink) => sink['id'] !== RUSH_PREFIT_SINK_ID));
    expect(violationsInRushPrefit(without).join(' ')).toMatch(/does not sell "rush-prefit"/u);
  });

  it('is refused when the pre-fit is renamed, because the id is the contract', () => {
    if (PREFIT_RAW === undefined) throw new Error('the shipped ledger sells no pre-fit to rename');
    const renamed = ledgerWith(
      RAW_LEDGER.sinks.map((sink) => (sink['id'] === RUSH_PREFIT_SINK_ID ? { ...sink, id: 'rush-prefit-2' } : sink)),
    );
    const issues = violationsInRushPrefit(renamed).join(' ');
    expect(issues).toMatch(/does not sell "rush-prefit"/u);
    expect(issues, 'a renamed pre-fit is also a pre-fit this build cannot build').toMatch(/rush-prefit-2/u);
  });

  it('is refused when a second pre-fit is sold, which would be a kit nothing defines', () => {
    if (PREFIT_RAW === undefined) throw new Error('the shipped ledger sells no pre-fit to copy');
    const two = ledgerWith([...RAW_LEDGER.sinks, { ...PREFIT_RAW, id: 'rush-prefit-deluxe' }]);
    expect(violationsInRushPrefit(two).join(' ')).toMatch(/rush-prefit-deluxe/u);
  });
});

describe('what a sitting’s modifiers say', () => {
  it('is false for no claim, an empty claim and a purse top-up', () => {
    expect(claimsRushPrefit(undefined)).toBe(false);
    expect(claimsRushPrefit([])).toBe(false);
    expect(claimsRushPrefit([{ sinkId: 'rush-purse-top-up', steps: 3 }])).toBe(false);
  });

  it('is true for the pre-fit, beside anything else', () => {
    expect(claimsRushPrefit([{ sinkId: RUSH_PREFIT_SINK_ID, steps: 1 }])).toBe(true);
    expect(
      claimsRushPrefit([
        { sinkId: 'rush-purse-top-up', steps: 2 },
        { sinkId: RUSH_PREFIT_SINK_ID, steps: 1 },
      ]),
    ).toBe(true);
  });

  it('is false at zero steps, which is a claim of nothing', () => {
    expect(claimsRushPrefit([{ sinkId: RUSH_PREFIT_SINK_ID, steps: 0 }])).toBe(false);
  });
});

describe('the door arithmetic, which moved here so there is one of it', () => {
  it('takes the close first and leaves the open alone while the close can pay', () => {
    expect(doorCycleWithSaving(2.5, 2.5, 1)).toEqual({ openS: 2.5, closeS: 1.5 });
  });

  it('reaches the open half only once the close is at the floor', () => {
    /* The close pays 1.7 of the three, down to the floor; the open pays the remaining 1.3. */
    expect(doorCycleWithSaving(2.5, 2.5, 3)).toEqual({ openS: 1.2, closeS: MIN_DOOR_S });
  });

  it('lands on the floor exactly rather than near it', () => {
    /*
     * The whole reason each half clamps rather than subtracting a computed saving: a floor that is
     * only approximately the floor is a floor a test cannot state, and `0.7999999999999998` is what
     * `2.5 - 1.7` gives.
     */
    const cycle = doorCycleWithSaving(2.5, 1.7, 10);
    expect(cycle.closeS).toBe(MIN_DOOR_S);
    expect(cycle.openS).toBe(MIN_DOOR_S);
  });
});

describe('the appliers, over the shipped buildings', () => {
  let buildings: readonly { readonly id: string; readonly config: BuildingConfig }[];
  let specs: ElevatorSpecs;

  it('load', async () => {
    const config = await loadConfig(DATA);
    buildings = config.buildings.map((entry) => ({ id: entry.id, config: entry.config }));
    specs = config.elevatorSpecs;
    expect(buildings.length).toBeGreaterThan(0);
  });

  it('take a second off every car’s door cycle, on every tower', () => {
    for (const building of buildings) {
      const fitted = prefittedRushBuilding(building.config, specs);
      for (const [b, bank] of fitted.banks.entries()) {
        for (const [c, car] of bank.cars.entries()) {
          const before = building.config.banks[b]?.cars[c];
          if (before === undefined) throw new Error(`${building.id}: the fitted tower grew a car`);
          const doorType = before.doorType ?? 'centerOpening';
          const openS = before.doorOpenS ?? specs.doors[doorType]?.openS ?? 0;
          const closeS = before.doorCloseS ?? specs.doors[doorType]?.closeS ?? 0;
          expect({ openS: car.doorOpenS, closeS: car.doorCloseS }, `${building.id}/${car.id}`).toEqual(
            doorCycleWithSaving(openS, closeS, RUSH_PREFIT_KIT.doorSecondsSaved),
          );
        }
      }
    }
  });

  it('ceil the transfer time and never raise one, on every tower', () => {
    for (const building of buildings) {
      const fitted = prefittedRushBuilding(building.config, specs);
      const authored: unknown = specs.timing.passengerTransferS[building.config.type];
      const fallback = typeof authored === 'number' ? authored : undefined;
      for (const [b, bank] of fitted.banks.entries()) {
        for (const [c, car] of bank.cars.entries()) {
          const before = building.config.banks[b]?.cars[c];
          const was = before?.passengerTransferS ?? fallback;
          if (was === undefined) {
            /* A ceiling over an unknown value is not a ceiling — the car is left exactly as it was. */
            expect(car.passengerTransferS, `${building.id}/${car.id}`).toBe(before?.passengerTransferS);
            continue;
          }
          expect(car.passengerTransferS, `${building.id}/${car.id}`).toBe(
            Math.min(was, RUSH_PREFIT_KIT.transferCeilingS),
          );
          expect(car.passengerTransferS ?? 0).toBeLessThanOrEqual(was);
        }
      }
    }
  });

  it('move no floor’s population, which is why the stream’s rate is unmoved', () => {
    for (const building of buildings) {
      const fitted = prefittedRushBuilding(building.config, specs);
      expect(fitted.floors, building.id).toEqual(building.config.floors);
      expect(fitted.totalPopulation, building.id).toBe(building.config.totalPopulation);
    }
  });

  it('add no shaft and rebuild no car to another class', () => {
    for (const building of buildings) {
      const fitted = prefittedRushBuilding(building.config, specs);
      expect(
        fitted.banks.map((bank) => bank.cars.map((car) => [car.id, car.spec, car.ratedLoadLb])),
        building.id,
      ).toEqual(building.config.banks.map((bank) => bank.cars.map((car) => [car.id, car.spec, car.ratedLoadLb])));
    }
  });
});

describe('the dispatcher, worked as zones', () => {
  const plain: DispatcherProfile = { id: 'p', name: 'P', weights: { waitTime: 1 } } as DispatcherProfile;

  it('writes the three fields the express lever concludes', () => {
    const zoned = prefittedRushProfile(plain);
    expect(zoned.dispatch?.assignmentMode).toBe('split-demand');
    expect(zoned.dispatch?.splitThresholdPassengers).toBe(10);
    expect(zoned.idle?.parkingStrategy).toBe('zone-center');
  });

  it('keeps a threshold the profile declares, which is the lever’s own `??`', () => {
    const declaring = { ...plain, dispatch: { splitThresholdPassengers: 4 } } as DispatcherProfile;
    expect(prefittedRushProfile(declaring).dispatch?.splitThresholdPassengers).toBe(4);
  });

  it('overrides a parking strategy the profile declares, which is the lever’s own order', () => {
    const parking = { ...plain, idle: { parkingStrategy: 'lobby' } } as DispatcherProfile;
    expect(prefittedRushProfile(parking).idle?.parkingStrategy).toBe('zone-center');
  });

  it('moves no weight, no selection and no rule — a kit is hardware, not a preference', () => {
    const rich = {
      ...plain,
      weights: { waitTime: 1, rideTime: 0.5 },
      selection: { policy: 'off' },
      rules: [],
    } as unknown as DispatcherProfile;
    const zoned = prefittedRushProfile(rich);
    expect(zoned.weights).toBe(rich.weights);
    expect(zoned.selection).toBe(rich.selection);
    expect(zoned.rules).toBe(rich.rules);
  });
});
