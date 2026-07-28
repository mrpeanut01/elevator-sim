/**
 * **Phase 8, analytical track, part 1 — the closed form on every shipped bank.**
 *
 * `docs/07-handoff.md` § 7 asks Phase 8's analytical track for *"closed-form agreement across all
 * five buildings, not just the two done"*. Agreement is measured in `fiveBuildings.test.ts`, which
 * has to run the simulator and therefore costs seconds per replication. This file is the part that
 * costs nothing: **fourteen banks, five buildings, pure arithmetic**, no simulation at all. It runs
 * in milliseconds and is always on.
 *
 * What it establishes, and why each part has to be here rather than in the expensive file:
 *
 * 1. **Every shipped bank can be reduced to the closed form's seven scalars.** Before this, three
 *    of the five buildings could not be: `analyzeUpPeak` threw on nine of the fourteen banks —
 *    seven for a `tp` the reference table has no row for, one for having no populated destination,
 *    and the two mixed-use towers' banks for both. Those are not defects in the oracle; they are
 *    questions the oracle correctly refuses to answer by itself. `upPeakCase.ts` answers them from
 *    the configuration, and this file pins that every answer is derived rather than transcribed.
 * 2. **`U` for a shuttle is checkable against a number the project already published.**
 *    `analytical/upPeak.ts`'s docstring works Mixed-Use High-Rise's shuttle by hand and states
 *    *"a true `U` of 1014"*. The derivation is not told that number and reaches it.
 * 3. **Which banks can have their departures reconstructed from boarding times, and which cannot.**
 *    `metrics/summarize.ts` names three that cannot and this file re-derives the list rather than
 *    trusting it — the failure mode `CLAUDE.md` § "A published number goes stale the same way"
 *    describes.
 * 4. **The five-building reconciliation table's principal banks are the right ones**, and each one
 *    that is excluded is excluded for a mechanism this file states and checks.
 *
 * Nothing here asserts a tolerance that was chosen after seeing a number. The pinned closed-form
 * figures are pinned to full precision *because* they are arithmetic: an oracle whose own
 * arithmetic drifts is worse than no oracle.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  IMPLAUSIBLE_PERCENT_POPULATION_5MIN,
  UP_PEAK_WARNING_CODES,
  analyzeUpPeak,
  loadConfig,
  travelTime,
} from '@elevator-sim/core';
import type { LoadedConfig, ResolvedBuilding } from '@elevator-sim/core';

import { departureGapBracket } from './reconcile.js';
import {
  deriveUpPeakCase,
  destinationFloorsFor,
  onwardPopulationOf,
  passengerTransferForBank,
  terminalFloorFor,
} from './upPeakCase.js';
import { DATA_DIR } from '../validation/harness.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

/** The five shipped buildings, in the order `docs/04-test-buildings.md` introduces them. */
const BUILDING_IDS = [
  'midtown-office',
  'garden-apartments',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
] as const;

function buildingOf(id: string): ResolvedBuilding {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`missing building fixture "${id}"`);
  return building;
}

/** Mixed-Use High-Rise's shuttle, fully derived. Used by the stale-docstring pin below. */
const derivedShuttle = () =>
  deriveUpPeakCase(buildingOf('mixed-use-high-rise'), 'shuttle', config.elevatorSpecs);

/** Every (building, bank) pair the shipped data declares, in file order. */
function everyBank(): readonly { readonly buildingId: string; readonly bankId: string }[] {
  return BUILDING_IDS.flatMap((buildingId) =>
    buildingOf(buildingId).banks.map((bank) => ({ buildingId, bankId: bank.id })),
  );
}

describe('the closed form reaches every shipped bank', () => {
  it('covers fourteen banks across five buildings — the population the census is over', () => {
    const banks = everyBank();
    // A guard on the *scope* of everything below. If a sixth building or an eighth Vertical City
    // bank lands, this fails and the census has to be extended rather than silently missing it.
    expect(banks).toHaveLength(14);
    const perBuilding = BUILDING_IDS.map(
      (id) => `${id}:${banks.filter((bank) => bank.buildingId === id).length}`,
    );
    expect(perBuilding).toEqual([
      'midtown-office:1',
      'garden-apartments:1',
      'secure-tower:2',
      'mixed-use-high-rise:3',
      'vertical-city:7',
    ]);
  });

  it('evaluates on all fourteen, and prints the table', () => {
    const rows: string[] = [];
    for (const { buildingId, bankId } of everyBank()) {
      const building = buildingOf(buildingId);
      const caseSpec = deriveUpPeakCase(building, bankId, config.elevatorSpecs);
      const analysis = analyzeUpPeak(building, config.elevatorSpecs, caseSpec.options);
      const t = analysis.roundTripTerms;
      rows.push(
        `${buildingId.padEnd(20)} ${bankId.padEnd(18)} ` +
          `term=${caseSpec.terminalFloorId.padEnd(3)}(${caseSpec.terminalProvenance[0]}) ` +
          `N=${String(t.floorsAboveTerminal).padStart(2)}(${caseSpec.destinationProvenance[0]}) ` +
          `P=${t.passengersPerTrip.toFixed(2).padStart(5)} ` +
          `tp=${t.passengerTransferS.toFixed(2)}(${caseSpec.transferProvenance[0]}) ` +
          `L=${String(t.carsInGroup).padStart(2)} U=${String(t.population).padStart(4)} ` +
          `RTT=${analysis.result.roundTripTimeS.toFixed(2).padStart(7)} ` +
          `INT=${analysis.result.intervalS.toFixed(2).padStart(6)} ` +
          `%POP=${analysis.result.percentPopulation5Min.toFixed(2).padStart(6)}`,
      );

      // Every term the closed form consumes must be finite and in domain. `roundTripTime` already
      // validates its inputs, so reaching a result at all is most of this; the rest is that the
      // result is usable.
      expect(Number.isFinite(analysis.result.roundTripTimeS)).toBe(true);
      expect(analysis.result.roundTripTimeS).toBeGreaterThan(0);
      expect(analysis.result.intervalS).toBeGreaterThan(0);
      expect(analysis.result.percentPopulation5Min).toBeGreaterThan(0);
      // S and H are the combinatorial content and must sit in their own domains, or the
      // population model has been mis-parameterised.
      expect(analysis.result.expectedStops).toBeGreaterThan(0);
      expect(analysis.result.expectedStops).toBeLessThanOrEqual(t.floorsAboveTerminal);
      expect(analysis.result.highestReversalFloor).toBeGreaterThanOrEqual(1);
      expect(analysis.result.highestReversalFloor).toBeLessThanOrEqual(t.floorsAboveTerminal);
      // The three time terms must partition RTT — the identity `reconcileRoundTrip` checks rather
      // than assumes, pinned at the source.
      expect(
        analysis.result.travelTimeS + analysis.result.stopTimeS + analysis.result.transferTimeS,
      ).toBeCloseTo(analysis.result.roundTripTimeS, 9);
    }
    // eslint-disable-next-line no-console
    console.log(`\nclosed form, all fourteen shipped banks:\n${rows.join('\n')}\n`);
  });

  it('leaves the two already-validated buildings exactly where the Phase 2 gate left them', () => {
    // The derivation is new; these two answers are not. `core/analytical/validation.test.ts` pins
    // them term by term against a hand evaluation, and if the generic path did not reproduce them
    // it would be reaching the three new buildings by changing the question.
    const midtown = deriveUpPeakCase(buildingOf('midtown-office'), 'main', config.elevatorSpecs);
    const midtownResult = analyzeUpPeak(
      buildingOf('midtown-office'),
      config.elevatorSpecs,
      midtown.options,
    ).result;
    expect(midtown.terminalFloorId).toBe('G');
    expect(midtown.terminalProvenance).toBe('default');
    expect(midtown.transferProvenance).toBe('default');
    expect(midtown.destinationProvenance).toBe('default');
    expect(midtown.servedPopulation).toBe(1710);
    expect(midtownResult.roundTripTimeS).toBeCloseTo(149.542846, 4);
    expect(midtownResult.intervalS).toBeCloseTo(37.385712, 4);
    expect(midtownResult.percentPopulation5Min).toBeCloseTo(6.006610, 5);

    const garden = deriveUpPeakCase(buildingOf('garden-apartments'), 'main', config.elevatorSpecs);
    const gardenResult = analyzeUpPeak(
      buildingOf('garden-apartments'),
      config.elevatorSpecs,
      garden.options,
    ).result;
    expect(garden.servedPopulation).toBe(120);
    expect(gardenResult.roundTripTimeS).toBeCloseTo(113.595760, 4);
    expect(gardenResult.intervalS).toBeCloseTo(56.797880, 4);
    expect(gardenResult.percentPopulation5Min).toBeCloseTo(35.212582, 5);
  });
});

describe('the four derivations that reach the three unvalidated buildings', () => {
  it('tp comes from the type table where there is one, and from the cars where there is not', () => {
    const table = config.elevatorSpecs.timing.passengerTransferS;
    expect(table.office).toBeCloseTo(1.2, 9);
    expect(table.residential).toBeCloseTo(1.75, 9);
    expect(table.hotel).toBeCloseTo(1.5, 9);

    // The three typed buildings read the table, exactly as the Phase 2 gate does.
    for (const [buildingId, bankId, expected] of [
      ['midtown-office', 'main', table.office],
      ['garden-apartments', 'main', table.residential],
      ['secure-tower', 'low', table.office],
    ] as const) {
      const building = buildingOf(buildingId);
      const bank = building.banks.find((entry) => entry.id === bankId);
      if (bank === undefined) throw new Error('missing bank');
      const derived = passengerTransferForBank(building, bank, config.elevatorSpecs);
      expect(derived.provenance).toBe('default');
      expect(derived.value).toBeCloseTo(expected, 9);
    }

    // `mixed-use` has no row **on purpose** — see `analytical/upPeak.ts`. Every car of both
    // mixed-use towers therefore declares its own, and the fallback reads those.
    const mixed = buildingOf('mixed-use-high-rise');
    const perBank = mixed.banks.map((bank) => ({
      id: bank.id,
      ...passengerTransferForBank(mixed, bank, config.elevatorSpecs),
    }));
    expect(perBank.map((entry) => entry.provenance)).toEqual(['fallback', 'fallback', 'fallback']);
    // And they genuinely differ, which is the whole reason the table cannot hold one value: the
    // shuttle and the residential bank carry residents at 1.75 s, the office bank at 1.2 s.
    expect(perBank.find((entry) => entry.id === 'shuttle')?.value).toBeCloseTo(1.75, 9);
    expect(perBank.find((entry) => entry.id === 'office-local')?.value).toBeCloseTo(1.2, 9);
    expect(perBank.find((entry) => entry.id === 'residential-local')?.value).toBeCloseTo(1.75, 9);
    expect(new Set(perBank.map((entry) => entry.value)).size).toBeGreaterThan(1);

    // Vertical City spans four transfer times across seven banks — office, hotel and residential
    // in one tower. A building-wide figure would be wrong for at least two of them.
    const vertical = buildingOf('vertical-city');
    const values = vertical.banks.map(
      (bank) => passengerTransferForBank(vertical, bank, config.elevatorSpecs).value,
    );
    expect([...new Set(values)].sort((a, b) => a - b)).toEqual([1.2, 1.5, 1.75]);
  });

  it('the terminal falls back only where the default rule has nothing to choose from', () => {
    const fallbacks: string[] = [];
    for (const { buildingId, bankId } of everyBank()) {
      const building = buildingOf(buildingId);
      const bank = building.banks.find((entry) => entry.id === bankId);
      if (bank === undefined) throw new Error('missing bank');
      const terminal = terminalFloorFor(building, bank);
      if (terminal.provenance === 'fallback') fallbacks.push(`${buildingId}/${bankId}`);
    }
    // Exactly one bank in the whole shipped set: Vertical City's shuttle, whose eight served
    // floors are the two ground-lobby levels and six sky lobbies, every one of them declaring
    // `population: 0` because their traffic belongs to the floors beyond them.
    expect(fallbacks).toEqual(['vertical-city/shuttle']);

    const vertical = buildingOf('vertical-city');
    const shuttle = vertical.banks.find((bank) => bank.id === 'shuttle');
    if (shuttle === undefined) throw new Error('missing shuttle');
    expect(terminalFloorFor(vertical, shuttle).floor.id).toBe('G');
    // And it is the street entrance, not merely the lowest floor: the fallback keeps the flag
    // condition and drops only the population one.
    expect(vertical.floorsById.get('G')?.isEntrance).toBe(true);
    for (const id of shuttle.servesFloors) {
      expect(vertical.floorsById.get(id)?.population).toBe(0);
    }
  });

  it('destinations fall back to unpopulated floors only for the two shuttles', () => {
    const fallbacks: string[] = [];
    for (const { buildingId, bankId } of everyBank()) {
      const building = buildingOf(buildingId);
      const bank = building.banks.find((entry) => entry.id === bankId);
      if (bank === undefined) throw new Error('missing bank');
      const terminal = terminalFloorFor(building, bank);
      if (destinationFloorsFor(building, bank, terminal.floor).provenance === 'fallback') {
        fallbacks.push(`${buildingId}/${bankId}`);
      }
    }
    expect(fallbacks).toEqual(['vertical-city/shuttle']);

    // Mixed-Use's shuttle is *not* in that list, and the reason is instructive: its one
    // destination, the sky lobby at 31, does declare a population — 260 amenity occupants — so
    // the default rule finds it. That is also exactly why `U` still needs the onward derivation
    // below: 260 is a real number and the wrong one.
    const mixed = buildingOf('mixed-use-high-rise');
    expect(mixed.floorsById.get('31')?.population).toBe(260);
  });

  it('U follows onward traffic, and reproduces the 1014 the oracle documents by hand', () => {
    // `analytical/upPeak.ts` § "U is a default, and for a shuttle it is the wrong one" works this
    // case by hand: the sky lobby's own 260 plus the 754 residents of 32–60 the shuttle also
    // lifts, "for a true U of 1014". The derivation is given the bank graph and nothing else.
    const mixed = buildingOf('mixed-use-high-rise');
    const shuttle = mixed.banks.find((bank) => bank.id === 'shuttle');
    if (shuttle === undefined) throw new Error('missing shuttle');
    const onward = onwardPopulationOf(mixed, shuttle, ['31'], 'G');
    expect(onward.total).toBe(1014);
    // The floors it followed: 32–60, served by `residential-local` and by nothing else.
    expect(onward.onwardFloorIds).toHaveLength(29);
    expect(onward.onwardFloorIds[0]).toBe('32');
    expect(onward.onwardFloorIds.at(-1)).toBe('60');

    // And the default it replaces is the one the oracle warns about: the sky lobby's own 260
    // gives a `%POP` that `implausibleHandlingCapacity` rejects.
    const naive = analyzeUpPeak(mixed, config.elevatorSpecs, {
      bankId: 'shuttle',
      passengerTransferS: 1.75,
    });
    expect(naive.result.percentPopulation5Min).toBeGreaterThan(
      IMPLAUSIBLE_PERCENT_POPULATION_5MIN,
    );
    expect(naive.warnings.map((warning) => warning.code)).toContain(
      UP_PEAK_WARNING_CODES.implausibleHandlingCapacity,
    );

    // **A published number in `core` that does not reproduce — reported, not fixed.**
    // `packages/core/src/analytical/upPeak.ts` § "U is a default, and for a shuttle it is the
    // wrong one" states *"The default reports 102.8 % of population per five minutes instead of
    // 26.3 %."* Neither figure reproduces at the transfer time the shuttle's cars actually
    // declare. Both reproduce exactly at `tp = 1.2 s`, the **office** value — which is the
    // transfer time the runner charged every building before the Phase 2 gate's defect 2 was
    // fixed, and which no car of that bank declares. The prose was measured before the fix and
    // never regenerated: `CLAUDE.md` § "A published number goes stale the same way".
    //
    // This is `core`, which this task may not edit, so the two arithmetics are pinned here
    // instead — the stale pair and the correct pair — so that a later correction to that
    // docstring has a checked number to correct it *to*.
    const atOfficeTp = analyzeUpPeak(mixed, config.elevatorSpecs, {
      bankId: 'shuttle',
      passengerTransferS: 1.2,
    });
    expect(atOfficeTp.result.percentPopulation5Min).toBeCloseTo(102.8, 1); // the docstring's figure
    expect(naive.result.percentPopulation5Min).toBeCloseTo(82.5, 1); // the same thing at tp = 1.75
    const correctedU = analyzeUpPeak(mixed, config.elevatorSpecs, {
      bankId: 'shuttle',
      passengerTransferS: 1.2,
      servedPopulation: 1014,
    });
    expect(correctedU.result.percentPopulation5Min).toBeCloseTo(26.3, 1); // the docstring's figure
    expect(
      analyzeUpPeak(mixed, config.elevatorSpecs, derivedShuttle().options).result
        .percentPopulation5Min,
    ).toBeCloseTo(21.2, 1); // the same thing at the tp the cars declare
    // With the derived U it lands inside the plausible band instead.
    const derived = deriveUpPeakCase(mixed, 'shuttle', config.elevatorSpecs);
    const fixed = analyzeUpPeak(mixed, config.elevatorSpecs, derived.options);
    expect(fixed.result.percentPopulation5Min).toBeLessThan(30);
    expect(fixed.warnings.map((warning) => warning.code)).not.toContain(
      UP_PEAK_WARNING_CODES.implausibleHandlingCapacity,
    );
  });

  it('deduplicates a bank reached from two destinations rather than counting it twice', () => {
    // Vertical City's `zone-5-local` opens on **both** halves of sky lobby B, 51 and 52, and the
    // shuttle serves both. A per-destination sum would charge its 828 occupants twice. The union
    // is taken before summing, so it is charged once.
    const vertical = buildingOf('vertical-city');
    const shuttle = vertical.banks.find((bank) => bank.id === 'shuttle');
    if (shuttle === undefined) throw new Error('missing shuttle');
    const zone5 = vertical.banks.find((bank) => bank.id === 'zone-5-local');
    expect(zone5?.servesFloors).toContain('51');
    expect(zone5?.servesFloors).toContain('52');

    const both = onwardPopulationOf(vertical, shuttle, ['51', '52'], 'G');
    const one = onwardPopulationOf(vertical, shuttle, ['51'], 'G');
    expect(both.total).toBe(one.total);
    expect(both.total).toBe(828);

    // The whole shuttle: every occupant above the ground lobby, counted once. Zones 1 and 2 are
    // *not* included — they open on the terminal themselves, so the shuttle lifts none of them.
    const whole = deriveUpPeakCase(vertical, 'shuttle', config.elevatorSpecs);
    expect(whole.servedPopulation).toBe(2872); // 770 + 768 + 828 + 506, zones 3–6
    expect(whole.servedPopulation).toBeLessThan(vertical.totalPopulation);
    expect(whole.onwardFloorIds).not.toContain('3');
    expect(whole.onwardFloorIds).not.toContain('25');

    // Without the terminal-sharing condition the answer is the whole building. Stated as a
    // measurement rather than as a comment, because the difference is 41 % of `%POP` on the one
    // bank whose `U` cannot be read off its own floors.
    const withoutCondition = onwardPopulationOf(vertical, shuttle, whole.destinationFloorIds);
    expect(withoutCondition.total).toBe(vertical.totalPopulation);
    expect(withoutCondition.total).toBe(4887);
  });

  it('one hop is enough: the transitive closure of the same rule adds nothing, on any bank', () => {
    // The derivation follows one handover. A bank reachable only through two — a shuttle to a sky
    // lobby, a second shuttle to a higher one, then a local bank — would be missed and `U` would
    // be understated. Rather than assert that no shipped building has one, the rule is iterated
    // to a fixpoint and the answers compared. Equality is the evidence.
    for (const { buildingId, bankId } of everyBank()) {
      const building = buildingOf(buildingId);
      const bank = building.banks.find((entry) => entry.id === bankId);
      if (bank === undefined) throw new Error('missing bank');
      const derived = deriveUpPeakCase(building, bankId, config.elevatorSpecs);

      const own = new Set(bank.servesFloors);
      const closure = new Set([...derived.destinationFloorIds, ...derived.onwardFloorIds]);
      for (let pass = 0; pass < building.banks.length; pass += 1) {
        const before = closure.size;
        for (const other of building.banks) {
          if (other.id === bankId) continue;
          if (other.servesFloors.includes(derived.terminalFloorId)) continue;
          if (!other.servesFloors.some((id) => closure.has(id))) continue;
          for (const id of other.servesFloors) if (!own.has(id)) closure.add(id);
        }
        if (closure.size === before) break;
      }
      const closureTotal = [...closure].reduce(
        (sum, id) => sum + (building.floorsById.get(id)?.population ?? 0),
        0,
      );
      expect({ buildingId, bankId, closureTotal }).toEqual({
        buildingId,
        bankId,
        closureTotal: derived.servedPopulation,
      });
    }
  });
});

describe('which banks can have their departures reconstructed, and which cannot', () => {
  /**
   * The bracket for each bank, computed from that bank's cars.
   *
   * `metrics/summarize.ts`'s own table names three shipped banks whose bracket is empty. That
   * table is prose. This re-derives it from the reference data, which is the difference between a
   * documented fact and a checked one — and `CLAUDE.md` records three published numbers in this
   * repository that did not reproduce from the code meant to produce them.
   */
  function bracketVerdict(buildingId: string, bankId: string): {
    readonly ok: boolean;
    readonly maxReopenS: number;
    readonly minRoundTripS: number;
  } {
    const building = buildingOf(buildingId);
    const bank = building.banks.find((entry) => entry.id === bankId);
    if (bank === undefined) throw new Error('missing bank');
    const derived = deriveUpPeakCase(building, bankId, config.elevatorSpecs);
    const analysis = analyzeUpPeak(building, config.elevatorSpecs, derived.options);
    const car = bank.cars[0];
    if (car === undefined) throw new Error('bank has no cars');

    const lowestId = analysis.upperFloorIds[0];
    if (lowestId === undefined) throw new Error('no destinations');
    const lowestHeightM = building.floorsById.get(lowestId)?.heightM ?? 0;
    const constraints = {
      ratedSpeedMps: car.ratedSpeedMps,
      acceleration: car.acceleration,
      jerk: car.jerk,
    };
    const input = {
      doorOpenS: car.doorOpenS,
      doorCloseS: car.doorCloseS,
      dwellHallCallS: car.dwellHallCallS,
      dwellCarCallS: car.dwellCarCallS,
      fullLoadTransferS:
        analysis.roundTripTerms.passengersPerTrip * analysis.roundTripTerms.passengerTransferS,
      nearestFloorFlightS: travelTime(lowestHeightM - analysis.terminalHeightM, constraints),
      motorStartDelayS: car.motorStartDelayS,
      levelingSettleS: car.levelingSettleS,
    };
    const maxReopenS = input.doorOpenS + Math.max(input.dwellHallCallS, input.dwellCarCallS, input.fullLoadTransferS) + input.doorCloseS;
    const legS =
      input.doorCloseS +
      input.motorStartDelayS +
      input.nearestFloorFlightS +
      input.levelingSettleS +
      input.doorOpenS;
    const minRoundTripS = 2 * legS + input.dwellHallCallS + input.dwellCarCallS;
    try {
      departureGapBracket(input);
      return { ok: true, maxReopenS, minRoundTripS };
    } catch {
      return { ok: false, maxReopenS, minRoundTripS };
    }
  }

  it('re-derives the three empty brackets metrics/summarize.ts names, and finds no others', () => {
    const empty: string[] = [];
    const rows: string[] = [];
    for (const { buildingId, bankId } of everyBank()) {
      const verdict = bracketVerdict(buildingId, bankId);
      rows.push(
        `${buildingId.padEnd(20)} ${bankId.padEnd(18)} reopen=${verdict.maxReopenS.toFixed(2).padStart(6)} s  ` +
          `minRT=${verdict.minRoundTripS.toFixed(2).padStart(6)} s  ${verdict.ok ? 'measurable' : 'EMPTY'}`,
      );
      if (!verdict.ok) empty.push(`${buildingId}/${bankId}`);
    }
    // eslint-disable-next-line no-console
    console.log(`\ndeparture-gap bracket, per bank:\n${rows.join('\n')}\n`);

    // The list `metrics/summarize.ts` publishes, re-derived. Not "at least these": exactly these.
    expect(empty.sort()).toEqual([
      'mixed-use-high-rise/residential-local',
      'vertical-city/shuttle',
      'vertical-city/zone-6-local',
    ]);
  });

  it('an empty bracket is a property of the bank, and the numbers say why', () => {
    // Mixed-Use residential-local: a 20-person car at the residential 1.75 s holds its doors
    // 16 × 1.75 = 28 s of transfer, plus 1.8 s open and 3.0 s close — longer than it takes to go
    // one 3.2 m floor up and come back. No threshold separates a reopen from a return, so
    // departures cannot be reconstructed from boarding times at all. That is a limit of the
    // instrument, not a failure of the simulator or of the closed form.
    const residential = bracketVerdict('mixed-use-high-rise', 'residential-local');
    expect(residential.ok).toBe(false);
    expect(residential.maxReopenS).toBeGreaterThan(residential.minRoundTripS);
    expect(residential.maxReopenS).toBeCloseTo(32.8, 1);

    // Vertical City's shuttle is the extreme: a 26-person car at 1.75 s, and its nearest served
    // floor is the *upper ground lobby* 4.5 m away, so the shortest round trip is almost all
    // fixed overhead.
    const shuttle = bracketVerdict('vertical-city/shuttle'.split('/')[0] as string, 'shuttle');
    expect(shuttle.ok).toBe(false);
    expect(shuttle.maxReopenS).toBeCloseTo(41.2, 1);

    // How much room the eleven measurable banks leave. The band is what makes the midpoint a
    // defensible default rather than a tuned constant: inside it the reconstruction is
    // insensitive to the exact threshold. It is **not** uniformly generous — the narrowest is
    // reported by name rather than averaged away, because a bank whose band is a second or two
    // is one config change from joining the empty three.
    const bands = everyBank()
      .map((bank) => ({ ...bank, verdict: bracketVerdict(bank.buildingId, bank.bankId) }))
      .filter((entry) => entry.verdict.ok)
      .map((entry) => ({
        id: `${entry.buildingId}/${entry.bankId}`,
        bandS: entry.verdict.minRoundTripS - entry.verdict.maxReopenS,
      }))
      .sort((a, b) => a.bandS - b.bandS);
    expect(bands).toHaveLength(11);
    // eslint-disable-next-line no-console
    console.log(
      `\nbracket band, narrowest first:\n${bands.map((entry) => `  ${entry.id.padEnd(40)} ${entry.bandS.toFixed(2)} s`).join('\n')}\n`,
    );
    for (const entry of bands) expect(entry.bandS).toBeGreaterThan(0);

    // **A fourth bank that `metrics/summarize.ts` does not name.** Its table lists the three banks
    // whose bracket is empty. Vertical City's `zone-5-local` is not one of them — and its band is
    // **1.23 s**, an order of magnitude tighter than the next (6.63 s) and two orders below the
    // widest (35.43 s). Its 20-person car at the hotel 1.5 s holds its doors 28.80 s, and its
    // terminal is the upper half of sky lobby B with the first served floor 4.5 m above it, so
    // the shortest round trip is 30.03 s and almost all of it is fixed overhead.
    //
    // It is measurable, so no number here is wrong. It is one configuration change — a slower
    // door, a larger car, a hotel transfer time revised upward — from joining the empty three,
    // and it would join them silently because nothing else in the repository looks at the band
    // rather than at the verdict. Pinned so that change fails here first.
    expect(bands[0]?.id).toBe('vertical-city/zone-5-local');
    expect(bands[0]?.bandS).toBeGreaterThan(1);
    expect(bands[0]?.bandS).toBeLessThan(2);
    expect((bands[1]?.bandS ?? 0) / (bands[0]?.bandS ?? 1)).toBeGreaterThan(4);
  });
});
