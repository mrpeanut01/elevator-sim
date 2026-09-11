/**
 * **The Burj-class reference, corrected against its operator** — GitHub issue **#438**,
 * `DECISIONS.md` § D545.
 *
 * `burjReference.test.ts` holds the four measurements § D527 asked of a supertall. This file holds
 * what #438's research pass found the reference got wrong about the real tower, and the owner's
 * ruling of 2026-09-10 to correct it: *"the double-deck shuttles, the use stacking and the floor
 * heights, drafted for approval. Re-run the 57-lift measurement afterwards and publish the result
 * whichever way it falls."*
 *
 * ## What each case holds, and where the figure comes from
 *
 * - **Two double-deck cars, both on the observation run.** Otis's 2024 release and Al-Kodmany 2015
 *   give the tower two double-deck cars, both serving the observation deck; no source read gives
 *   the sky lobbies a double-deck shuttle. The file had fourteen.
 * - **The uses where Emaar's fact sheet stacks them.** Hotel low, residences through the middle,
 *   the Corporate Suites at 112–121 and 125–154. The file had offices on 2–75 and residential above,
 *   which is the stacking inverted. Asserted in both directions, so a populated floor outside the
 *   operator's ranges fails as surely as an operator range left empty.
 * - **Level 124 at 452 m.** Emaar's *At the Top* page. Uniform 4.0 m floors had put it at 496 m.
 * - **The 57-lift bracket, re-measured.** The same three populations the file's `$comment` has
 *   always quoted — 3 198, 5 307 and 10 614 — at seed 376 under `collective` over 1 800 s, pinned
 *   to the run rather than to a sentence. The populations are the shipped per-floor figures scaled
 *   in proportion, so the stacking is the same at every point of the bracket.
 *
 * ## What the re-measurement is not
 *
 * One seed. It answers *does this population saturate on this arrangement at this seed*, which is
 * what the `$comment` has always published, and it is not an interval: `CLAUDE.md`'s 50–200
 * replications are the budget for a claim that one arrangement waits less than another, and this
 * file makes no such claim. The chosen figures the corrections introduce — the 3.645 m floor, the
 * per-use densities, which lobby levels the single-deck shuttle serves — are an agent's proposal
 * awaiting the owner, and the building's `$comment` says so beside each.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';

import { recordRun } from './recordRun.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const FILE = 'burj-class-reference.json';

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

interface RawBuilding {
  readonly $comment: string;
  totalPopulation: number;
  readonly floors: { population: number }[];
  readonly floorRanges: { populationPerFloor: number }[];
}

const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
const dispatcherProfiles = parseDispatcherProfiles(dataFile('dispatcher-profiles.json'));
const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));

/** The shipped building, or the shipped building with every floor's population scaled to a total. */
function buildingAt(population?: number) {
  const raw = dataFile(join('buildings', FILE)) as RawBuilding;
  if (population !== undefined) {
    const scale = population / raw.totalPopulation;
    for (const floor of raw.floors) floor.population *= scale;
    for (const range of raw.floorRanges) range.populationPerFloor *= scale;
    raw.totalPopulation = population;
  }
  return resolveBuilding(parseBuilding(raw, FILE), elevatorSpecs, { file: FILE, trafficProfileIds });
}

const floorsBetween = (spans: readonly (readonly [number, number])[]): string[] =>
  spans.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i)));

describe('the Burj-class reference against its operator — issue #438', () => {
  it('carries the tower’s two double-deck cars on the observation run, and a single-deck shuttle', () => {
    const building = buildingAt();
    const doubleDeck = building.banks.flatMap((bank) =>
      bank.cars.filter((car) => car.doubleDeck).map((car) => `${bank.id}/${car.id}`),
    );
    expect(doubleDeck, 'every source read gives the tower two double-deck cars').toEqual([
      'observation/OB-1',
      'observation/OB-2',
    ]);

    const observation = building.banks.find((bank) => bank.id === 'observation');
    expect(observation?.servesFloorPairs).toEqual([
      ['G', '1'],
      ['123', '124'],
    ]);
    const shuttle = building.banks.find((bank) => bank.id === 'shuttle');
    expect(shuttle?.servesFloors).toEqual(['G', '43', '76', '123']);
    expect(shuttle?.servesFloorPairs ?? []).toEqual([]);

    /* § D527's shape is not what #438 corrects: still 57 lifts, and still no loader warning. */
    expect(building.banks.reduce((n, bank) => n + bank.cars.length, 0)).toBe(57);
    expect(building.warnings ?? []).toEqual([]);
  });

  it('stacks its uses where Emaar’s fact sheet puts them, in both directions', () => {
    const building = buildingAt();
    expect(building.trafficProfile).toBe('office-standard');
    const uses = [
      { use: 'Armani Hotel', profile: 'hotel', floors: floorsBetween([[2, 8], [38, 39]]) },
      { use: 'Armani Residences', profile: 'residential', floors: floorsBetween([[9, 16]]) },
      {
        use: 'The Residence',
        profile: 'residential',
        floors: floorsBetween([[19, 37], [45, 72], [78, 108]]),
      },
      {
        use: 'The Corporate Suites',
        profile: 'office-standard',
        floors: floorsBetween([[112, 121], [125, 154]]),
      },
    ];
    const byId = new Map(building.floors.map((floor) => [floor.id, floor]));
    const operatorFloors = new Set(uses.flatMap((one) => one.floors));

    for (const one of uses) {
      for (const id of one.floors) {
        const floor = byId.get(id);
        expect(floor?.population ?? 0, `${one.use} on ${id} carries nobody`).toBeGreaterThan(0);
        expect(floor?.trafficProfile ?? building.trafficProfile, `${one.use} on ${id}`).toBe(
          one.profile,
        );
      }
    }
    const outside = building.floors
      .filter((floor) => floor.population > 0 && !operatorFloors.has(floor.id))
      .map((floor) => floor.id);
    expect(outside, 'populated floors the operator gives no use').toEqual([]);
    expect(building.floors.reduce((sum, floor) => sum + floor.population, 0)).toBe(3198);
  });

  it('puts level 124 at the operator’s 452 m, on one floor-to-floor height', () => {
    const building = buildingAt();
    const floors = [...building.floors].sort((a, b) => a.index - b.index);
    const at = (id: string) => floors.find((floor) => floor.id === id)?.heightM ?? Number.NaN;

    expect(Math.abs(at('124') - 452)).toBeLessThan(0.05);
    expect(at('G')).toBe(0);
    for (let i = 1; i < floors.length; i += 1) {
      expect(floors[i]!.heightM - floors[i - 1]!.heightM, `${floors[i]!.id}`).toBeCloseTo(3.645, 6);
    }
    const observation = building.banks.find((bank) => bank.id === 'observation');
    for (const car of observation?.cars ?? []) {
      expect(car.deckSeparationM).toBeCloseTo(at('1') - at('G'), 9);
    }
  });

  /**
   * **The 57-lift measurement, re-run on the corrected arrangement and pinned to the run.**
   *
   * Seed 376, `collective`, 1 800 s, `onTimeout: 'report'` so an undelivered journey is counted
   * rather than thrown. `awtInvalidGround` is pinned beside the verdict because saturation is one of
   * five grounds and a different ground would be a different finding. The legs by bank at 3 198 are
   * pinned too: they are what the restacking moves, and a stacking that changed the labels and
   * moved no leg would pass every other case in this file.
   */
  const BRACKET = [
    {
      population: 3198,
      generated: 989,
      undelivered: 0,
      awtIsValid: true,
      awtInvalidGround: undefined,
      meanWaitS: 11.36,
      wait95S: 32.87,
    },
    {
      population: 5307,
      generated: 1646,
      undelivered: 0,
      awtIsValid: false,
      awtInvalidGround: 'saturated',
      meanWaitS: 40.48,
      wait95S: 183.15,
    },
    {
      population: 10614,
      generated: 3473,
      undelivered: 30,
      awtIsValid: false,
      awtInvalidGround: 'saturated',
      meanWaitS: 225.87,
      wait95S: 540.6,
    },
  ] as const;

  it.each(BRACKET)(
    're-measures the 57-lift bracket at $population people, seed 376',
    (expected) => {
      const profile = dispatcherProfiles.profiles.find((one) => one.id === 'collective');
      expect(profile).toBeDefined();
      const { recording } = recordRun(
        {
          building: buildingAt(expected.population),
          dispatcherProfile: profile!,
          trafficProfiles,
          elevatorSpecs,
          seed: 376n,
          durationS: 1800,
          onTimeout: 'report',
          runId: `burj-438-${String(expected.population)}`,
        } as never,
        { recordDecisions: false },
      );
      const summary = recording.summary;
      expect({
        generated: summary.generated,
        undelivered: summary.undelivered,
        awtIsValid: summary.awtIsValid,
        awtInvalidGround: summary.awtInvalidGround,
      }).toEqual({
        generated: expected.generated,
        undelivered: expected.undelivered,
        awtIsValid: expected.awtIsValid,
        awtInvalidGround: expected.awtInvalidGround,
      });
      expect(summary.meanWaitS).toBeCloseTo(expected.meanWaitS, 1);
      expect(summary.wait95S).toBeCloseTo(expected.wait95S, 1);

      if (expected.population === 3198) {
        const legsByBank: Record<string, number> = {};
        for (const leg of recording.legs) {
          const bank = leg.bankId ?? '(none)';
          legsByBank[bank] = (legsByBank[bank] ?? 0) + 1;
        }
        expect(legsByBank).toEqual({
          'local-lower': 154,
          'local-zone1': 81,
          'local-zone2': 276,
          'local-zone3': 549,
          observation: 83,
          shuttle: 749,
        });
      }
    },
  );

  it('keeps its assumption paragraph and the four checks #438 recorded, word for word', () => {
    const { $comment } = dataFile(join('buildings', FILE)) as RawBuilding;
    const kept = [
      'POPULATION AND MIX ARE AN ASSUMPTION, NOT A CITATION, which § D527 leaves to this file: the per-floor figures fall from 29 in the lower office zone to 12 in the upper residential one, summing to 3198, and no published occupancy for the reference tower was available to the author.',
      'THE FIGURE IS MEASURED RATHER THAN GUESSED: it is what this 57-lift arrangement serves at `office-standard` with a valid AWT.',
      "So a published occupancy higher than this does not merely change a field — it says the reference tower's real lift count is not 57 on this arrangement, which is the kind of thing this building exists to expose.",
      'Declared as an assumption so a later citation replaces a stated one rather than a silent one.',
      'OCCUPANCY, CHECKED AND NOT ADMITTED',
      'DECK LOAD, CHECKED AND NOT ADMITTED',
      'THE 504 m RECORD, CHECKED',
      '57 LIFTS AND 60 SECONDS, CHECKED',
    ];
    for (const sentence of kept) expect($comment, sentence.slice(0, 60)).toContain(sentence);
  });
});
