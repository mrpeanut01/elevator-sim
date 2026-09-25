/**
 * **One day of one contract, built so the building and the contract are the same scenario** —
 * GitHub issue #584, [§ D961](../../../../DECISIONS.md).
 *
 * ## The defect this exists to close
 *
 * `shift/legibility.test.ts`, `legibility.sweep.test.ts` and `firstSession.test.ts` each built their
 * states as `{ ...baseState(), buildingId: contract.buildingId, … }`. `baseState()`'s week stands on
 * **`c1`**, and nothing in those three files moved it — so every state carried Garden Apartments'
 * contract over some other contract's building.
 *
 * That pair is not a cosmetic disagreement. `shift/ladder.ts#rungFor` keys a rung on the contract
 * **and** the building, deliberately: a `ViewerState` carries the two independently and they
 * routinely disagree, and keyed on the contract alone *"Scenario 1's rung would have let Midtown
 * Office at Garden Apartments' occupancy"*. A mismatched pair therefore returns `undefined`, the
 * run takes no rung at all, and the sweep measures **the tower as built** rather than as its
 * contract hands it over. Measured on the shipped ladder at the moment this was written, seven of
 * the sixteen contracts declare a rung that moves the run — c2 at 0.395 occupancy, c9 at 0.6, c6 at
 * 1.06 with a five-shaft gearless bank and a declared rate of 16, c3 at 12, c7 at 11 with a
 * maintenance incident, c8 at 8.5 and c10 at 13.5 — and every one of them was being swept as built.
 *
 * It was found because a contract rung that demonstrably moves 270 of 355 legs moved **nothing** in
 * the sweep. Convenient for the sweep, wrong as a measurement: the constants derived from it
 * (`firstSession.ts#ELIGIBLE_FIRST_CONTRACT_IDS`, which decides which towers a first-time player
 * can be offered, and `FIRST_SESSION_LINE`, which is the sentence under the seed) were properties
 * of sixteen buildings nobody is handed.
 *
 * ## Why a helper rather than one more field at each site
 *
 * Three files, each building a state in a loop, is three places for the pair to come apart again —
 * and the failure is silent, because a state with a mismatched pair runs perfectly well and merely
 * answers a different question. So the pair is built in one place and {@link assertContractPair}
 * refuses a mismatched one on the way out, which turns a silent wrong answer into a thrown one.
 * `contractDay.test.ts` holds the other half of the guard: those three files may not build a state
 * of their own, so a new sweep cannot route around this function by spreading `baseState()` itself.
 *
 * A test helper rather than a production module, `probes.test-helper.ts`'s reason exactly: nothing
 * the player runs needs it — `everyday/host.ts` already moves the week and the building together
 * through `switchWeek` — so shipping it in the bundle would be a seam with no non-test caller.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, resolveBuilding } from '@elevator-sim/core';

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, shiftLengthForContract } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import type { ViewerState } from '../dev/state.js';

import { CONTRACTS, contractById } from './contracts.js';
import { wholeDayFor, wholeDayRun } from './dayLength.js';
import type { RunHorizon } from './types.js';
import { openWeek } from './week.js';

/**
 * Every building the contracts name, resolved through the loader `probes.test-helper.ts` uses for
 * its two — the derivation the three sweeps each held a copy of, kept once.
 *
 * Derived from `CONTRACTS` rather than transcribed, which is § D213's shape: a contract that moves
 * to a new building or a new contract that lands brings its building with it.
 */
export function contractBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))].sort();
  const entries = ids.map((id) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')) as unknown,
    );
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

/**
 * Throws when a state's week stands on a contract that does not name its building.
 *
 * A week on **no** shipped contract is left alone rather than refused: `rungFor` has a deliberate
 * branch for it — `WEEK_CONTRACT_SENTINELS` are slots to park in, and a replay borrows the
 * building's own rung — so a sentinel is a legitimate pair and not a mismatch.
 */
export function assertContractPair(state: {
  readonly buildingId: string;
  readonly week: { readonly contractId: string };
}): void {
  const contract = contractById(state.week.contractId);
  if (contract === undefined) return;
  if (contract.buildingId === state.buildingId) return;
  throw new Error(
    `the week stands on ${state.week.contractId}, whose building is ${contract.buildingId}, ` +
      `while the state runs ${state.buildingId} — a mismatched pair takes no rung, so the run ` +
      `would be the tower as built rather than as the contract hands it over (issue #584)`,
  );
}

/** What a caller may move about the day this builds. */
export interface ContractDayOptions {
  /** Defaults to the shipped default dispatcher, which is what every sweep here measures. */
  readonly dispatcherId?: string;
  /** Defaults to `20 260 824 + 7 919 n` — `docs/33` § 4.6's cell, passed as the seed itself. */
  readonly seed: bigint;
  /** Fields written over the day, for an arm that runs the whole authored day rather than a slice. */
  readonly over?: Partial<ViewerState>;
}

/**
 * Day 1 of `contractId`, on that contract's own building, at that contract's own shift length.
 *
 * The three fields a sweep used to set by hand — building, shift length and seed — plus the one it
 * did not: the week. `openWeek` rather than a spread of `baseState().week`, because a fresh week is
 * what a day-1 cell is and the function that builds one is the product's own.
 */
export function contractDayState(contractId: string, options: ContractDayOptions): ViewerState {
  const contract = contractById(contractId);
  if (contract === undefined) throw new Error(`no shipped contract ${contractId}`);
  const state: ViewerState = {
    ...baseState(),
    week: openWeek(contract.id),
    buildingId: contract.buildingId,
    dispatcherId: options.dispatcherId ?? 'collective',
    shiftLengthS: shiftLengthForContract(contract.id),
    windowStartS: null,
    seed: options.seed,
    campaignEventId: 'ordinary',
    ...(options.over ?? {}),
  };
  assertContractPair(state);
  return state;
}

/**
 * **Day 1 of `contractId` as Today's scenario plays it** — the whole authored day where
 * `wholeDayFor` answers for the contract's building, the slice where it does not — and which of the
 * two that is. GitHub issue #592, [§ D991](../../../../DECISIONS.md).
 *
 * `host.ts#startRun` spreads `wholeDayRun(day)` into the patch for any building with an authored
 * day, so this is the run a player's first session plays. It exists because three figures in one
 * cycle were measured on {@link contractDayState}'s **slice** and used at the whole day — the energy
 * bar (§ D962), the press pins (wave AH's lane AH-B) and § D512's legibility table (§ D991) — and a
 * sweep that means *the day a player gets* should say so in one call rather than rebuild the pair.
 */
export function todaysScenarioDayState(
  resources: BrowserResources,
  contractId: string,
  options: ContractDayOptions,
): { readonly state: ViewerState; readonly horizon: RunHorizon } {
  const probe = contractDayState(contractId, options);
  const day = wholeDayFor(
    resources.trafficProfiles,
    buildingConfigOf(resources, probe.savedBuildings, probe.buildingId),
  );
  if (day === undefined) return { state: probe, horizon: 'period' };
  return {
    state: contractDayState(contractId, { ...options, over: { ...(options.over ?? {}), ...wholeDayRun(day) } }),
    horizon: 'whole-day',
  };
}
