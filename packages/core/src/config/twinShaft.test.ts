/**
 * **The TWIN shaft config seam** — `docs/11-twin-shaft-contract.md` § 1.2, GitHub issue #412,
 * `DECISIONS.md` § D620.
 *
 * `docs/11` § 0 fact 1 is the one this file exists to close: *"A shaft is not an object today. It
 * is a per-car value derived from the bank."* It is one now, and a building can say which of its
 * cars share a hoistway. What that costs is a new way for a configuration to be wrong, and the
 * four ways it can be are refusals rather than warnings, on `rope-travel-exceeds-class`'s
 * precedent: none of them is a building that performs badly, each is a building whose runtime
 * cannot be reasoned about.
 *
 * | block | what it pins |
 * |---|---|
 * | the default | a bank with no `shafts` block resolves to one shaft per car — every shipped building, and the reason every pinned run survives this change |
 * | the partition | a car in no shaft, a car in two, a shaft naming a car the bank does not hold |
 * | the separation | a two-car shaft with no clearance, and a safety brake weaker than its own service brake |
 * | INV-TWIN-3 | `'shaftBlocked'` is absent from the structural set, **and** a call refused for it is retried — asserted in both directions, because only the second half makes the first mean anything |
 *
 * **No shipped building declares a `shafts` block**, so every refusal below is proved by a
 * configuration that breaches it rather than by prose about one — the difference between a rule and
 * a sentence about a rule.
 */

import { describe, expect, it } from 'vitest';

import { INFEASIBILITY_REASONS } from '../model/car/types.js';
import { INELIGIBILITY_REASONS } from '../dispatch/types.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';

import { parseBuilding, resolveBuilding } from './parse.js';
import { ConfigError, ISSUE_CODES } from './schema.js';
import type { BuildingConfig, LoadedConfig, ResolvedBuilding } from './types.js';

/** A shipped building re-authored with a `shafts` block on its first bank. */
function withShafts(
  cfg: LoadedConfig,
  buildingId: string,
  shafts: readonly Record<string, unknown>[],
): ResolvedBuilding {
  const shipped = cfg.buildingsById.get(buildingId);
  if (shipped === undefined) throw new Error(`no shipped building "${buildingId}"`);
  const authored = structuredClone(shipped.config) as BuildingConfig;
  const document = {
    ...authored,
    banks: authored.banks.map((bank, index) => (index === 0 ? { ...bank, shafts } : bank)),
  };
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding(document, file), cfg.elevatorSpecs, { file });
}

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error.issues.map((issue) => issue.code).filter((code): code is string => code !== undefined);
    }
    throw error;
  }
  return [];
}

describe('a bank with no shafts block resolves exactly as it always did', () => {
  it('gives every shipped bank one single-car shaft per car, and declares no separation anywhere', async () => {
    const cfg = await load();
    let banks = 0;
    for (const id of BUILDING_IDS) {
      const building = cfg.buildingsById.get(id) as ResolvedBuilding;
      for (const bank of building.banks) {
        banks += 1;
        // The absence is handled by the loader, once, so the runtime has one representation of a
        // hoistway and no consumer needs an "if undefined" branch — docs/11 § 1.2's rule.
        expect(bank.shafts, `${id}/${bank.id}`).toHaveLength(bank.cars.length);
        expect(bank.shafts.flatMap((shaft) => shaft.carIds).sort()).toEqual(
          bank.cars.map((car) => car.id).sort(),
        );
        for (const shaft of bank.shafts) {
          expect(shaft.carIds).toHaveLength(1);
          expect(shaft.separation, `${id}/${bank.id}/${shaft.id}`).toBeUndefined();
        }
      }
    }
    // Non-vacuity: a data change that emptied `data/buildings/` would make all of that true of
    // nothing.
    expect(banks).toBeGreaterThan(0);
  }, 120_000);

  it('is what every shipped building declares: none authors a shafts block', async () => {
    const cfg = await load();
    const declaring = BUILDING_IDS.filter((id) =>
      ((cfg.buildingsById.get(id) as ResolvedBuilding).config as BuildingConfig).banks.some(
        (bank) => bank.shafts !== undefined,
      ),
    );
    // If this ever fails it is not a regression — it means a building has taken docs/11 OQ-6's
    // decision, which this lane deliberately did not. What it would mean is that every claim in
    // this file about "no shipped building" needs re-checking rather than deleting.
    expect(declaring, 'a shipped building now declares a TWIN shaft; see docs/11 OQ-6').toEqual([]);
  }, 120_000);
});

describe('a declared shafts block must partition the bank’s cars', () => {
  it('refuses a car left in no hoistway', async () => {
    const cfg = await load();
    // `garden-apartments` has exactly two cars; naming one leaves the other homeless.
    expect(
      issuesOf(() => withShafts(cfg, 'garden-apartments', [{ id: 'only', carIds: ['A'] }])),
    ).toContain(ISSUE_CODES.shaftLayoutNotAPartition);
  }, 120_000);

  it('refuses a car in two hoistways, which would give it two mates', async () => {
    const cfg = await load();
    expect(
      issuesOf(() =>
        withShafts(cfg, 'garden-apartments', [
          { id: 's1', carIds: ['A'] },
          { id: 's2', carIds: ['A', 'B'] },
        ]),
      ),
    ).toContain(ISSUE_CODES.shaftLayoutNotAPartition);
  }, 120_000);

  it('refuses a shaft naming a car the bank does not declare', async () => {
    const cfg = await load();
    expect(
      issuesOf(() =>
        withShafts(cfg, 'garden-apartments', [
          { id: 's1', carIds: ['A', 'B'] },
          { id: 's2', carIds: ['Z'] },
        ]),
      ),
    ).toContain(ISSUE_CODES.shaftLayoutNotAPartition);
  }, 120_000);

  it('refuses three cars in one hoistway at the schema, not at the runtime', async () => {
    const cfg = await load();
    // docs/11 OQ-9 is decided **out**, and a config that cannot express it is a stronger guarantee
    // than one that rejects it later: three cars per shaft is a different system with a
    // collision-avoidance argument nobody has written.
    expect(() =>
      withShafts(cfg, 'midtown-office', [{ id: 's1', carIds: ['A', 'B', 'C'] }, { id: 's2', carIds: ['D'] }]),
    ).toThrow(ConfigError);
  }, 120_000);
});

describe('a two-car shaft must state what keeps its cars apart', () => {
  const PAIR = { id: 'twin', carIds: ['A', 'B'] };

  it('refuses a TWIN shaft with no clearance and no brake', async () => {
    const cfg = await load();
    // Neither figure has a default, and `BANK_SHAFT_TUNABLES` says why: docs/11 § 10 records that
    // **no source consulted publishes a separation in metres**, so this project states none and a
    // building that declares two cars in one hoistway declares its own.
    expect(issuesOf(() => withShafts(cfg, 'garden-apartments', [PAIR]))).toContain(
      ISSUE_CODES.twinSeparationUnstated,
    );
  }, 120_000);

  it('refuses a safety brake gentler than the cars’ own service brake', async () => {
    const cfg = await load();
    const codes = issuesOf(() =>
      withShafts(cfg, 'garden-apartments', [
        { ...PAIR, standingClearanceM: 3, emergencyDecelerationMps2: 0.01 },
      ]),
    );
    // The premise of the exactness lemma in `model/car/separation.ts`. A safety check that is exact
    // only under an unstated premise is worse than no check, so the premise is checked at load.
    expect(codes).toContain(ISSUE_CODES.twinSeparationUnstated);
  }, 120_000);

  it('refuses a TWIN shaft in a double-deck bank, which nobody has designed', async () => {
    const cfg = await load();
    // docs/11 § 10: *"The interaction between TWIN and double-deck is untouched … nothing here is
    // designed for it, and `carIds` being a two-tuple does not by itself forbid it."* So the config
    // layer forbids it, rather than letting two mechanisms compose in whatever way they happen to.
    // `vertical-city`'s shuttle is the shipped bank that declares floor pairs.
    const building = cfg.buildingsById.get('vertical-city') as ResolvedBuilding;
    const deckBank = building.banks.find((bank) => bank.servesFloorPairs !== undefined);
    expect(deckBank, 'no shipped bank declares floor pairs any more').toBeDefined();
    const pairIds = deckBank?.cars.slice(0, 2).map((car) => car.id) ?? [];
    const rest = deckBank?.cars.slice(2) ?? [];

    const authored = structuredClone(
      (cfg.buildingsById.get('vertical-city') as ResolvedBuilding).config,
    ) as BuildingConfig;
    const document = {
      ...authored,
      banks: authored.banks.map((bank) =>
        bank.id === deckBank?.id
          ? {
              ...bank,
              shafts: [
                {
                  id: 'twin',
                  carIds: pairIds,
                  standingClearanceM: 5,
                  emergencyDecelerationMps2: 4,
                },
                ...rest.map((car) => ({ id: `s-${car.id}`, carIds: [car.id] })),
              ],
            }
          : bank,
      ),
    };
    expect(
      issuesOf(() =>
        resolveBuilding(parseBuilding(document, 'vertical-city.json'), cfg.elevatorSpecs, {
          file: 'vertical-city.json',
        }),
      ),
    ).toContain(ISSUE_CODES.twinSeparationUnstated);
  }, 120_000);

  it('accepts a stated pair and resolves it with the buffer defaulted to zero', async () => {
    const cfg = await load();
    const building = withShafts(cfg, 'garden-apartments', [
      { ...PAIR, standingClearanceM: 3, emergencyDecelerationMps2: 4 },
    ]);
    const shaft = building.banks[0]?.shafts[0];
    expect(shaft?.carIds).toEqual(['A', 'B']);
    expect(shaft?.separation).toEqual({
      standingClearanceM: 3,
      bufferM: 0,
      emergencyDecelerationMps2: 4,
    });
  }, 120_000);
});

describe('INV-TWIN-3: a shaft-blocked passenger is servable, in both directions', () => {
  it('declares the reason on both the car’s and the dispatcher’s vocabularies', () => {
    expect(INFEASIBILITY_REASONS).toContain('shaftBlocked');
    expect(INELIGIBILITY_REASONS).toContain('shaftBlocked');
  });

  /**
   * **The first direction: it is not in the structural set.**
   *
   * `docs/11` § 3.5 names this as the way the whole thing quietly goes blind. `shaftBlocked` must
   * follow `serviceMode`, which `simulation.ts` records as *"deliberately absent"* so a returning
   * car is found again — and **not** `accessDenied`, which is a fact about the fabric and the
   * credential. Filing a transient reason as structural stops the retry timer and strands a queue
   * nobody could serve, which is the `C35` failure with a new label.
   *
   * Read out of the source rather than imported, because the set is module-private in
   * `simulation.ts` and making it public to test it would be the test changing the product's shape
   * to suit itself. The regex is anchored on the declaration so a rename fails loudly here rather
   * than silently passing.
   */
  it('keeps shaftBlocked out of STRUCTURAL_INELIGIBILITY, read off the source', async () => {
    const source = await readSimulationSource();
    const match = /const STRUCTURAL_INELIGIBILITY: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/.exec(
      source,
    );
    expect(match, 'STRUCTURAL_INELIGIBILITY has been renamed or reshaped').not.toBeNull();
    const members = match?.[1] ?? '';
    expect(members).toContain("'serviceZone'");
    expect(
      members,
      'shaftBlocked has been filed as structural: a servable passenger will now be abandoned by the retry machinery (docs/11 § 3.5, INV-TWIN-3)',
    ).not.toContain('shaftBlocked');
  });

  /**
   * **The second direction, and it is the half that makes the first mean anything.** A reason
   * absent from the structural set only helps if the *transient* machinery then picks it up —
   * otherwise the call is neither retried nor declared unservable, which is the worst of both.
   */
  it('files shaftBlocked with the transient reasons the incumbent may surrender a call over', async () => {
    const source = await readPolicySource();
    const match = /const TRANSIENT_INELIGIBILITY: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/.exec(
      source,
    );
    expect(match, 'TRANSIENT_INELIGIBILITY has been renamed or reshaped').not.toBeNull();
    expect(match?.[1] ?? '').toContain('shaftBlocked');
  });
});

async function readSimulationSource(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  return readFile(fileURLToPath(new URL('../sim/simulation.ts', import.meta.url)), 'utf8');
}

async function readPolicySource(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  return readFile(fileURLToPath(new URL('../dispatch/policy.ts', import.meta.url)), 'utf8');
}
