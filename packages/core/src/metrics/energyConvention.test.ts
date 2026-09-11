/**
 * **The counterweight and the drive are per-bank equipment, and they move energy and never a leg**
 * — GitHub issue **#431**, under the owner's ruling of 2026-09-10 and `DECISIONS.md` § D539.
 *
 * > *"An energy-only machine choice. The balance ratio and the regenerative drive are per-bank
 * > equipment settings. They move `energyKJ`, `workPerServedLegKJ` and the 80 kJ goal's verdict,
 * > and never a leg."*
 *
 * This file is the `core` half of that sentence. The viz half — the goal's verdict — is
 * `packages/viz/src/pricing/bankEquipmentReachesTheGoal.test.ts`.
 *
 * ## What each block pins
 *
 * | block | acceptance criterion |
 * |---|---|
 * | the default convention is today's arithmetic, bit for bit | AC1 — every pin byte-identical when unused |
 * | a ratio moves the work, a drive returns part of the overhauling moves only | AC2 — the regenerative option changes the proxy |
 * | per-bank data with a declared range and default | AC1 — schema, range, default |
 * | declared comparability-sensitive | AC2 |
 * | the runs | AC1 (byte-identity) and AC3 as restated — energy moves, the legs do not |
 */

import { describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import { BANK_ENERGY_TUNABLES, WARNING_CODES } from '../config/schema.js';
import type { BuildingConfig, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { fingerprint, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import {
  COMPARABLE_METRIC_IDS,
  ENERGY_CONVENTION_SENSITIVE_METRICS,
  energyConventionDisclaimer,
} from './comparability.js';
import {
  COUNTERWEIGHT_BALANCE_RATIO,
  DEFAULT_ENERGY_CONVENTION,
  STANDARD_GRAVITY_MPS2,
  outOfBalanceWorkJ,
  type TravelReading,
} from './types.js';

const SEED = 20_260_911;

/** Today's expression, written out longhand so the comparison cannot share code with the subject. */
const beforeD539 = (reading: TravelReading): number =>
  Math.abs(reading.loadKg - 0.5 * reading.ratedLoadKg) *
  STANDARD_GRAVITY_MPS2 *
  Math.abs(reading.distanceM);

/** A grid of readings over both directions, both sides of the balance point, and odd floats. */
function readings(): TravelReading[] {
  const out: TravelReading[] = [];
  for (const ratedLoadKg of [454, 1134, 1587.573, 2000]) {
    for (const share of [0, 0.1, 0.3333, 0.4, 0.45, 0.5, 0.55, 0.8, 1, 1.1]) {
      for (const distanceM of [0.3, 3.2, 4.1, 76.9, 307.5]) {
        for (const direction of ['up', 'down'] as const) {
          out.push({ loadKg: share * ratedLoadKg + 0.07, ratedLoadKg, distanceM, direction });
        }
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Arithmetic
 * -------------------------------------------------------------------------- */

describe('the default convention is today’s arithmetic, bit for bit', () => {
  it('declares the default as the old constant and no regeneration', () => {
    expect(COUNTERWEIGHT_BALANCE_RATIO).toBe(0.5);
    expect(DEFAULT_ENERGY_CONVENTION).toEqual({
      counterweightBalanceRatio: 0.5,
      regenerativeRecoveryFraction: 0,
    });
  });

  it('returns the identical float, with and without the convention argument', () => {
    for (const reading of readings()) {
      const expected = beforeD539(reading);
      expect(Object.is(outOfBalanceWorkJ(reading), expected)).toBe(true);
      expect(Object.is(outOfBalanceWorkJ(reading, DEFAULT_ENERGY_CONVENTION), expected)).toBe(true);
    }
  });
});

describe('a ratio moves the work, and a drive returns part of the overhauling moves only', () => {
  const rated = 1000;
  const at = (loadKg: number, direction: 'up' | 'down'): TravelReading => ({
    loadKg,
    ratedLoadKg: rated,
    distanceM: 10,
    direction,
  });

  it('balances at the declared ratio rather than at one half', () => {
    const lighter = { counterweightBalanceRatio: 0.4, regenerativeRecoveryFraction: 0 };
    expect(outOfBalanceWorkJ(at(400, 'up'), lighter)).toBe(0);
    expect(outOfBalanceWorkJ(at(400, 'up'))).toBeGreaterThan(0);
    expect(outOfBalanceWorkJ(at(500, 'up'), lighter)).toBeGreaterThan(0);
  });

  it('charges a motoring move whole and an overhauling move at one minus the recovery', () => {
    const regen = { counterweightBalanceRatio: 0.5, regenerativeRecoveryFraction: 0.6 };
    // Motoring: a heavy car climbing, and a light car descending (the counterweight is lifted).
    for (const reading of [at(900, 'up'), at(100, 'down')]) {
      expect(outOfBalanceWorkJ(reading, regen)).toBe(outOfBalanceWorkJ(reading));
    }
    // Overhauling: a light car climbing, and a heavy car descending.
    for (const reading of [at(100, 'up'), at(900, 'down')]) {
      expect(outOfBalanceWorkJ(reading, regen)).toBeCloseTo(0.4 * outOfBalanceWorkJ(reading), 9);
    }
  });

  it('is continuous at zero recovery, never negative, and bounded above by the old figure', () => {
    const none = { counterweightBalanceRatio: 0.5, regenerativeRecoveryFraction: 0 };
    const most = { counterweightBalanceRatio: 0.5, regenerativeRecoveryFraction: 0.95 };
    for (const reading of readings()) {
      expect(Object.is(outOfBalanceWorkJ(reading, none), beforeD539(reading))).toBe(true);
      const recovered = outOfBalanceWorkJ(reading, most);
      expect(recovered).toBeGreaterThanOrEqual(0);
      expect(recovered).toBeLessThanOrEqual(beforeD539(reading));
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Configuration
 * -------------------------------------------------------------------------- */

/** A shipped building with every bank's authored document extended by `fields`. */
function variant(
  cfg: LoadedConfig,
  buildingId: string,
  fields: Readonly<Record<string, unknown>>,
  specs = cfg.elevatorSpecs,
): ResolvedBuilding {
  const shipped = cfg.buildingsById.get(buildingId);
  if (shipped === undefined) throw new Error(`no shipped building "${buildingId}"`);
  const authored = structuredClone(shipped.config) as BuildingConfig;
  const document = { ...authored, banks: authored.banks.map((bank) => ({ ...bank, ...fields })) };
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding(document, file), specs, { file });
}

describe('per-bank data with a declared range and default', () => {
  it('declares type, range and default in one place, and the default is the old constant', () => {
    const ratio = BANK_ENERGY_TUNABLES.counterweightBalanceRatio;
    expect(ratio.type).toBe('number');
    expect([ratio.min, ratio.max]).toEqual([0.4, 0.5]);
    expect(ratio.default).toBe(COUNTERWEIGHT_BALANCE_RATIO);
    expect(ratio.default).toBeGreaterThanOrEqual(ratio.min);
    expect(ratio.default).toBeLessThanOrEqual(ratio.max);
    expect(BANK_ENERGY_TUNABLES.regenerativeDrive).toMatchObject({ type: 'boolean', default: false });
  });

  it('carries a declared ratio and drive onto the resolved bank', async () => {
    const cfg = await load();
    const fitted = variant(cfg, 'midtown-office', {
      counterweightBalanceRatio: 0.45,
      regenerativeDrive: true,
    });
    const bank = fitted.banks[0];
    expect(bank?.counterweightBalanceRatio).toBe(0.45);
    expect(bank?.regenerativeRecoveryFraction).toBe(cfg.elevatorSpecs.regenerativeDrive?.recoveryFraction);
    expect(bank?.regenerativeRecoveryFraction).toBeGreaterThan(0);
  });

  it('accepts the cited range at both ends and refuses a ratio outside it', async () => {
    const cfg = await load();
    for (const ratio of [0.4, 0.5]) {
      expect(() => variant(cfg, 'midtown-office', { counterweightBalanceRatio: ratio })).not.toThrow();
    }
    for (const ratio of [0.39, 0.51, 0, 1]) {
      expect(() => variant(cfg, 'midtown-office', { counterweightBalanceRatio: ratio })).toThrow();
    }
  });

  it('puts neither field on any bank of any shipped building, so the default is what runs', async () => {
    const cfg = await load();
    let banks = 0;
    for (const building of cfg.buildingsById.values()) {
      for (const bank of building.banks) {
        banks += 1;
        expect('counterweightBalanceRatio' in bank, `${building.id}/${bank.id}`).toBe(false);
        expect('regenerativeRecoveryFraction' in bank, `${building.id}/${bank.id}`).toBe(false);
      }
    }
    expect(banks).toBeGreaterThan(0);
  });

  it('says so when a drive is fitted and the data directory declares no recovery fraction', async () => {
    const cfg = await load();
    const without = { ...cfg.elevatorSpecs, regenerativeDrive: undefined };
    const idle = variant(cfg, 'midtown-office', { regenerativeDrive: true }, without);
    expect(idle.warnings.map((w) => w.code)).toContain(WARNING_CODES.regenerativeDriveBuysNothing);
    expect(idle.banks[0]?.regenerativeRecoveryFraction).toBeUndefined();
    const working = variant(cfg, 'midtown-office', { regenerativeDrive: true });
    expect(working.warnings.map((w) => w.code)).not.toContain(
      WARNING_CODES.regenerativeDriveBuysNothing,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Comparability
 * -------------------------------------------------------------------------- */

describe('declared comparability-sensitive', () => {
  it('names the two energy figures a convention changes, and not the odometer', () => {
    const ids = ENERGY_CONVENTION_SENSITIVE_METRICS.map((metric) => metric.id);
    expect(ids).toEqual(['energyKJ', 'energyPerServedLegKJ']);
    for (const id of ids) expect(COMPARABLE_METRIC_IDS).toContain(id);
    expect(ids).not.toContain('carDistanceM');
    expect(ids).not.toContain('carStarts');
    for (const metric of ENERGY_CONVENTION_SENSITIVE_METRICS) {
      expect(metric.reason.length).toBeGreaterThan(20);
    }
  });

  it('writes no disclaimer for a building at the default, and one for a fitted bank', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('midtown-office');
    expect(shipped && energyConventionDisclaimer(shipped)).toBeUndefined();
    const fitted = variant(cfg, 'midtown-office', { regenerativeDrive: true });
    const disclaimer = energyConventionDisclaimer(fitted);
    expect(disclaimer).toContain('main');
    expect(disclaimer).toContain('energyPerServedLegKJ');
  });
});

/* -------------------------------------------------------------------------- *
 * The runs
 * -------------------------------------------------------------------------- */

describe('the runs: energy moves, the legs never do', () => {
  const run = (cfg: LoadedConfig, building: ResolvedBuilding) =>
    runSimulation({
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
    });
  /** Every leg whole, and every move's geometry and load — everything but the joules. */
  const legs = (result: ReturnType<typeof run>): string =>
    JSON.stringify({
      passengers: result.record.passengers,
      moves: (result.record.travelSamples ?? []).map((move) => [
        move.at,
        move.carId,
        move.distanceM,
        move.direction,
        move.loadKg,
      ]),
    });

  it('runs byte-identically when the defaults are declared explicitly', async () => {
    const cfg = await load();
    const shipped = cfg.buildingsById.get('midtown-office') as ResolvedBuilding;
    const explicit = variant(cfg, 'midtown-office', {
      counterweightBalanceRatio: 0.5,
      regenerativeDrive: false,
    });
    expect(fingerprint(run(cfg, explicit))).toBe(fingerprint(run(cfg, shipped)));
  }, 120_000);

  it('moves energyKJ and workPerServedLegKJ under a drive or a ratio, and moves no leg', async () => {
    const cfg = await load();
    const shipped = run(cfg, cfg.buildingsById.get('midtown-office') as ResolvedBuilding);
    const regen = run(cfg, variant(cfg, 'midtown-office', { regenerativeDrive: true }));
    const lighter = run(cfg, variant(cfg, 'midtown-office', { counterweightBalanceRatio: 0.4 }));

    expect(legs(regen)).toBe(legs(shipped));
    expect(legs(lighter)).toBe(legs(shipped));

    expect(regen.summary.energy.workKJ).toBeLessThan(shipped.summary.energy.workKJ);
    expect(regen.summary.energy.workPerServedLegKJ).toBeLessThan(
      shipped.summary.energy.workPerServedLegKJ,
    );
    expect(lighter.summary.energy.workKJ).not.toBe(shipped.summary.energy.workKJ);
    expect(regen.summary.energy.distanceM).toBe(shipped.summary.energy.distanceM);
    expect(regen.summary.energy.starts).toBe(shipped.summary.energy.starts);

    // The record says which convention priced a move, so a reader can redo the sum.
    const fittedMove = regen.record.travelSamples?.[0];
    expect(fittedMove?.regenerativeRecoveryFraction).toBeGreaterThan(0);
    expect(shipped.record.travelSamples?.[0]).not.toHaveProperty('regenerativeRecoveryFraction');
    expect(regen.warnings.some((warning) => warning.includes('energyPerServedLegKJ'))).toBe(true);
    expect(shipped.warnings.some((warning) => warning.includes('energyPerServedLegKJ'))).toBe(false);
  }, 180_000);
});
