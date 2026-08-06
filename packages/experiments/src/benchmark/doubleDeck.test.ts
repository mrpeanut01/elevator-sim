/**
 * **The double-deck comparison, re-derived rather than transcribed.**
 *
 * `doubleDeck.ts` states four kinds of claim and this suite owns all four:
 *
 * 1. **The control arm is what it says it is** — the retired disclaimer's own configuration, which
 *    the runtime announces on every replication of the control and on none of the treatment.
 * 2. **The pairing is real** — the two arms see the same passenger population at equal replication
 *    index, asserted field by field on the generated traces rather than inferred from a digest
 *    (the digest hashes the building id, so it *must* differ and proves nothing).
 * 3. **The denominators differ, and by how much** — the leg set is not the journey set here, which
 *    is the measured reason the gate is TTD.
 * 4. **The verdicts** — every gate cell, every cost cell, and the census that says where an
 *    interval may be quoted at all.
 *
 * Verdicts and structural facts are asserted; the digits are reported rather than transcribed into
 * assertions here, because a hand-transcribed digit asserted to three places is the exact defect
 * `published.ts` exists to catch. The digits themselves are held by **Layer A** at the bottom of
 * this file: `checkPinned('double-deck', …)` compares every one of this study's forty estimates
 * against `PINNED_ESTIMATES`, in both directions, at full precision.
 */

import { Simulation } from '@elevator-sim/core';
import type { ResolvedBuilding } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { replicationSeed } from '../runner/crn.js';
import { loadResources, withProfiles } from '../validation/harness.js';
import { runExperiment } from '../runner/replicationRunner.js';

import {
  CEILING_EXCLUDED_ARMS,
  CONTROL_DISCLAIMER_FRAGMENT,
  DOUBLE_DECK_BUILDING,
  DOUBLE_DECK_GATE,
  DOUBLE_DECK_POINTS,
  SINGLE_DECK_BUILDING,
  doubleDeckPoint,
  doubleDeckResources,
  formatDoubleDeckStudy,
  runDoubleDeckStudy,
  singleDeckControlArm,
  studyDispatchers,
  upPeakAt,
  type DoubleDeckStudy,
} from './doubleDeck.js';
import { checkPinned, describeMismatches, doubleDeckFigures } from './published.js';
import { BENCHMARK_SEED } from './suite.js';

/** Long: two operating points at their real budgets, plus a three-rate coverage census. */
const TIMEOUT_MS = 900_000;

let cached: Promise<DoubleDeckStudy> | undefined;

/** The study, run once for the whole file. */
async function study(): Promise<DoubleDeckStudy> {
  cached ??= runDoubleDeckStudy({});
  return await cached;
}

/* -------------------------------------------------------------------------- *
 * 1. The control arm
 * -------------------------------------------------------------------------- */

describe('the control arm is the retired disclaimer’s own configuration', () => {
  it('strips the pairing and nothing else, and the runtime says what that means', async () => {
    const config = await loadResources();
    const treatment = config.buildingsById.get(DOUBLE_DECK_BUILDING) as ResolvedBuilding;
    const control = singleDeckControlArm(treatment);

    expect(control.id).toBe(SINGLE_DECK_BUILDING);
    expect(treatment.banks.some((bank) => bank.servesFloorPairs !== undefined)).toBe(true);
    expect(control.banks.every((bank) => bank.servesFloorPairs === undefined)).toBe(true);
    // Everything else is the same building: same floors, same banks, same cars, same ratings.
    expect(control.banks.map((bank) => bank.id)).toEqual(treatment.banks.map((bank) => bank.id));
    for (const [index, bank] of control.banks.entries()) {
      const original = treatment.banks[index];
      expect(bank.servesFloors).toEqual(original?.servesFloors);
      expect(bank.cars.map((car) => car.ratedLoadLb)).toEqual(
        original?.cars.map((car) => car.ratedLoadLb),
      );
      // The cars are still double-deck *hardware*. Only the geometry is gone, which is precisely
      // the state `WARNING_CODES.missingFloorPairs` describes.
      expect(bank.cars.map((car) => car.doubleDeck)).toEqual(
        original?.cars.map((car) => car.doubleDeck),
      );
    }
  });

  it('raises the single-deck disclaimer on every control replication and on no treatment one', async () => {
    const result = await study();
    for (const point of result.points) {
      const expected = point.replications * result.dispatchers.length;
      expect(point.controlDisclaimed, `${point.id}: control arm did not disclaim`).toBe(expected);
      expect(point.treatmentDisclaimed, `${point.id}: treatment arm disclaimed`).toBe(0);
    }
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * 2. The pairing, and 3. the denominators
 * -------------------------------------------------------------------------- */

describe('the two arms share a passenger population and do not share a leg decomposition', () => {
  /**
   * Field by field on the generated trace, at six replication seeds.
   *
   * `ReplicationRecord.traceDigest` cannot answer this: it hashes `trace.buildingId`, which differs
   * between the arms by construction, so a mismatch there is guaranteed and carries no information.
   * What CRN requires is that the *demand* be identical, and that is what is compared here — arrival
   * instant, origin, final destination, mass, category, profile and credential — with the leg
   * decomposition compared separately because it is expected to differ.
   */
  it('generates identical demand and a different leg decomposition, and counts both', async () => {
    const config = await loadResources();
    const treatment = config.buildingsById.get(DOUBLE_DECK_BUILDING) as ResolvedBuilding;
    const control = singleDeckControlArm(treatment);
    const profile = config.dispatcherProfilesById.get('eta');
    if (profile === undefined) throw new Error('data/dispatcher-profiles.json must ship eta');

    const traffic = upPeakAt(1);
    const traceFor = (building: ResolvedBuilding, seed: bigint) =>
      new Simulation({
        building,
        dispatcherProfile: profile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed,
        durationS: traffic.durationS as number,
        demand: traffic.demand,
        onTimeout: 'report',
      }).trace;

    const demandLine = (passenger: {
      readonly id: string;
      readonly arrivalTimeS: number;
      readonly originFloorId: string;
      readonly finalDestinationFloorId: string;
      readonly massKg: number;
      readonly category: string;
      readonly profileId: string;
      readonly credentialGroup?: string | undefined;
    }): string =>
      [
        passenger.id,
        passenger.arrivalTimeS,
        passenger.originFloorId,
        passenger.finalDestinationFloorId,
        passenger.massKg,
        passenger.category,
        passenger.profileId,
        passenger.credentialGroup ?? '-',
      ].join(';');

    let compared = 0;
    let demandMismatches = 0;
    let legMismatches = 0;
    let legsTreatment = 0;
    let legsControl = 0;
    for (let index = 0; index < 6; index += 1) {
      const seed = replicationSeed(BENCHMARK_SEED, index);
      const a = traceFor(treatment, seed);
      const b = traceFor(control, seed);
      expect(a.passengerCount).toBe(b.passengerCount);
      for (const [position, passenger] of a.passengers.entries()) {
        const other = b.passengers[position];
        if (other === undefined) throw new Error('trace lengths disagree');
        compared += 1;
        if (demandLine(passenger) !== demandLine(other)) demandMismatches += 1;
        const legsA = passenger.legs.map((leg) => `${leg.originFloorId}->${leg.destinationFloorId}`);
        const legsB = other.legs.map((leg) => `${leg.originFloorId}->${leg.destinationFloorId}`);
        if (legsA.join(',') !== legsB.join(',')) legMismatches += 1;
        legsTreatment += legsA.length;
        legsControl += legsB.length;
      }
    }

    console.log(
      `[double-deck] ${compared} journeys over 6 replication seeds: ` +
        `${demandMismatches} demand mismatches, ${legMismatches} leg-decomposition mismatches, ` +
        `legs ${legsTreatment} (double-deck) vs ${legsControl} (single-deck)`,
    );

    expect(compared).toBeGreaterThan(100);
    // The pairing: identical demand. This is what makes a paired-t interval legitimate here.
    expect(demandMismatches).toBe(0);
    // The hazard `comparabilityOf` does not model: the same journeys, decomposed differently.
    // Non-vacuous in both directions — some journeys change and most do not.
    // **The decompositions still differ in content and no longer differ in count**, which is the
    // whole of what the escalator changed here. The same 110 journeys of 593 are routed over
    // different floors — the double-deck passenger rides `2 -> 27` after crossing the lobby on the
    // escalator, the single-deck one rides `G -> 27` on the unpaired shuttle — and both then take
    // one local. Measured at these six seeds: 110 journeys decomposed differently, and 961 legs on
    // each arm. It was 961 against a larger number before, and that difference was the artefact.
    expect(legMismatches).toBeGreaterThan(0);
    expect(legMismatches).toBeLessThan(compared);
    expect(legsTreatment).toBe(legsControl);
  }, TIMEOUT_MS);

  it('carries the denominator shift into the study, journeys equal and legs not', async () => {
    const result = await study();
    for (const point of result.points) {
      expect(point.populationAligned, `${point.id}: populations diverged`).toBe(true);
      expect(point.journeysDoubleDeck).toBe(point.journeysSingleDeck);
      expect(point.legsDoubleDeck).toBeGreaterThan(point.legsSingleDeck);
      const excess = point.legsDoubleDeck / point.legsSingleDeck - 1;
      console.log(
        `[double-deck] ${point.id}: ${(excess * 100).toFixed(2)} % more legs on the double-deck arm ` +
          `over an identical journey set (${point.journeysDoubleDeck} journeys)`,
      );
      // It was a tenth more legs, and the escalator `vertical-city` now declares at `G <-> 2`
      // took that away: the test above shows the *decompositions* are now identical at this
      // regime, journey for journey. What is left — +1.32 % and +1.70 %, down from +10.80 % and
      // +11.56 % — is **window membership**: this counter takes legs whose own `arrivedAt` falls
      // in the report window, and a 27-side journey's first lift leg begins 21.2 s later than the
      // control's because it spends those seconds on the escalator. Still strictly positive,
      // still not a rounding difference, and an order of magnitude smaller.
      expect(excess).toBeGreaterThan(0.005);
      expect(excess).toBeLessThan(0.05);
    }
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * 4. The census
 * -------------------------------------------------------------------------- */

describe('where an interval may be quoted at all, censused on this cell and not inherited', () => {
  /**
   * **The third building on which this claim was the § D254 defect, and the third refutation.**
   *
   * This case asserted `vertical-city`'s own mixed scenario *structurally closed* — no cell of
   * either arm quotable at any of three rates, with the unserved fraction rising as the load fell.
   * `accessControl.ts` § H-ACCESS-1 made the same claim on Secure Tower and `mixedUseHighRise.ts`
   * § 1 on Mixed-Use High-Rise; all three were measuring one modelling error, that `estimateCost`
   * asked the access question about a hall call's **pickup** floor (§ D254, § D256).
   *
   * Re-measured at the same rates, seed and budget (§ D279): every rate quotable on both decks and
   * both dispatchers at 1.5 % and 0.75 %, nobody undelivered anywhere, and the unserved share
   * 0.92 → 0.99 → 0.73 % — § D265's credential gap, flat in the load rather than climbing.
   *
   * **The census is kept and re-pointed rather than deleted**, because what it exists to decide is
   * still live: whether this building's own scenario can carry an operating point. It now can, and
   * whether it *should* is a re-design of the point list, which § D256 requires a criterion for
   * before any number is read. The double-deck verdict below is unaffected — it is measured at the
   * up-peak points, which never ran this scenario.
   */
  it('finds the building’s own mixed scenario open to a paired comparison after all', async () => {
    const result = await study();
    expect(result.coverage.noneQuotable).toBe(false);
    expect(result.coverage.unservedRisesAsLoadFalls).toBe(false);
    expect(result.coverage.verdict).toBe('SERVABLE');

    // Nobody stranded on any arm at any rate — the clause the structural reading had inverted.
    for (const row of result.coverage.rows) {
      expect(
        row.meanUndelivered,
        `${row.buildingId}/${row.armId} at ${String(row.rate)} % leaves journeys undelivered`,
      ).toBe(0);
    }

    // And the double-deck and single-deck arms agree, which is what says the remaining unserved
    // share is a property of the traffic rather than of the pairing this study is about.
    for (const rate of [...new Set(result.coverage.rows.map((row) => row.rate))]) {
      const at = result.coverage.rows.filter((row) => row.rate === rate);
      expect(at.length, `no coverage rows at ${String(rate)} %`).toBeGreaterThan(1);
      for (const row of at) {
        expect(row.withoutQuotableAwt, `${row.buildingId}/${row.armId} at ${String(rate)} %`).toBe(
          at[0]?.withoutQuotableAwt,
        );
        expect(row.meanUnservedFraction).toBeCloseTo(at[0]?.meanUnservedFraction ?? -1, 12);
      }
    }
    console.log(`[double-deck] coverage: ${result.coverage.verdictReason}`);
  }, TIMEOUT_MS);

  it('excludes nearest-car by its ceiling and not by its answer', async () => {
    const config = await loadResources();
    expect(CEILING_EXCLUDED_ARMS.map((entry) => entry.armId)).toEqual(['nearest-car']);
    // The exclusion is of a profile that exists and is a declared baseline, not of a typo.
    expect(config.dispatcherProfilesById.get('nearest-car')?.role).toBe('baseline');
    expect(studyDispatchers(config.dispatcherProfilesById)).not.toContain('nearest-car');
    // And the set it leaves is not empty and is derived from the data.
    expect(studyDispatchers(config.dispatcherProfilesById).length).toBeGreaterThan(1);

    const resources = doubleDeckResources(withProfiles(config, []));
    const experiment = await runExperiment(
      {
        id: 'double-deck/census/nearest-car-1.5',
        seed: BENCHMARK_SEED,
        buildings: [DOUBLE_DECK_BUILDING, SINGLE_DECK_BUILDING],
        dispatchers: ['nearest-car'],
        traffic: [upPeakAt(1.5)],
        replication: { minReplications: 100, maxReplications: 100, checkEvery: 8 },
        parallel: { mode: 'serial' },
      },
      resources,
      { keepRecords: false },
    );
    for (const cell of experiment.cells) {
      const first = cell.replications.findIndex((record) => !record.awtIsValid);
      console.log(
        `[double-deck] nearest-car on ${cell.buildingId} at up-peak 1.5 %: first invalid replication ${first}`,
      );
      // Inside any budget this project would spend, on both arms.
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(50);
    }
  }, TIMEOUT_MS);

  it('records each point’s ceiling as the measured first invalid replication over 1000', async () => {
    const config = await loadResources();
    const resources = doubleDeckResources(withProfiles(config, []));
    const dispatchers = studyDispatchers(config.dispatcherProfilesById);
    for (const point of DOUBLE_DECK_POINTS) {
      const experiment = await runExperiment(
        {
          id: `double-deck/ceiling/${point.id}`,
          seed: BENCHMARK_SEED,
          buildings: [DOUBLE_DECK_BUILDING, SINGLE_DECK_BUILDING],
          dispatchers: [...dispatchers],
          traffic: [point.traffic],
          replication: { minReplications: 1000, maxReplications: 1000, checkEvery: 8 },
          parallel: { mode: 'serial' },
        },
        resources,
        { keepRecords: false },
      );
      const firsts = experiment.cells
        .map((cell) => ({
          id: `${cell.buildingId === DOUBLE_DECK_BUILDING ? 'DD' : 'SD'}/${cell.dispatcherArmId}`,
          index: cell.replications.findIndex((record) => !record.awtIsValid),
        }))
        .filter((entry) => entry.index >= 0);
      const measured = firsts.length === 0 ? undefined : Math.min(...firsts.map((e) => e.index));
      console.log(
        `[double-deck] ${point.id}: first invalid by cell over 1000 — ` +
          (firsts.length === 0
            ? 'none, on any cell'
            : firsts.map((entry) => `${entry.id}@${entry.index}`).join(', ')),
      );
      expect(measured, `${point.id}: the recorded ceiling is not the measured one`).toBe(
        point.ceiling,
      );
      // …and whether the budget sits under it, which is what a ceiling is for. **One point no
      // longer does.** Since `vertical-city` declared its ground-lobby escalator the 1.5 % point's
      // ceiling is 90 against a pre-registered budget of 200, so that budget cannot be spent and
      // the point returns UNQUOTABLE. That is asserted here rather than fixed by lowering the
      // budget: a budget chosen after seeing the answer is what `PILOT_SEED` exists to prevent,
      // and a point whose premise has stopped holding is a finding.
      if (point.ceiling !== undefined) {
        if (point.id === 'up-peak-1.5pct') {
          expect(point.replications).toBeGreaterThan(point.ceiling);
        } else {
          expect(point.replications).toBeLessThan(point.ceiling);
        }
      }
    }
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * 5. The result
 * -------------------------------------------------------------------------- */

describe('the double-deck verdict', () => {
  it('is quotable at the 1 % point and no longer at the 1.5 % one, with nothing bit-identical', async () => {
    const result = await study();
    console.log(formatDoubleDeckStudy(result));

    // **The 1.5 % point dropped out when the lobby hop stopped being a lift leg**, and it is
    // reported that way rather than rescued by a larger budget. Its n = 200 was pre-registered
    // against a ceiling measured on the pre-escalator configuration; both double-deck cells now
    // lose their AWT inside it. Moving the budget to make the point quotable again would be
    // choosing a budget after seeing the answer.
    const first = doubleDeckPoint(result, 'up-peak-1pct');
    const second = doubleDeckPoint(result, 'up-peak-1.5pct');
    expect(first?.quotable, `up-peak-1pct: ${first?.unquotableCells.join(', ') ?? ''}`).toBe(true);
    expect(second?.quotable).toBe(false);
    expect([...(second?.unquotableCells ?? [])].sort()).toEqual(['DD/collective', 'DD/eta']);

    for (const point of result.points) {
      if (!point.quotable) continue;
      for (const cell of point.cells) {
        // An interval of exactly [0, 0] with rho = 1 is a wiring bug, not a small effect
        // (docs/07-handoff.md § 4). `unservedFraction` is the one legitimate all-zero column:
        // nobody is left behind on either arm, which is itself part of the energy argument.
        if (cell.metric === 'unservedFraction') continue;
        expect(
          cell.verdict,
          `${point.id}/${cell.armId}/${cell.metric} is bit-identical across the arms`,
        ).not.toBe('IDENTICAL');
      }
    }
  }, TIMEOUT_MS);

  it('answers BETTER-EVERYWHERE on the gate — on a narrower base than the answer it replaced', async () => {
    const result = await study();
    const first = doubleDeckPoint(result, 'up-peak-1pct');
    expect(first).toBeDefined();
    if (first === undefined) return;

    // **The sign under `eta` flipped** when the `G -> 2` lobby hop stopped being charged to a
    // local lift bank: it was WORSE and it is BETTER. That is the correction the earlier revision
    // predicted when it published the WORSE row as *an upper bound on the cost of double-deck*.
    // The two intervals themselves live in `doubleDeck.ts` section 5 and in the pin table; this
    // asserts the verdicts, so a future change that reverted the sign would be visible here
    // whatever the digits did.
    expect(first.cell('eta', DOUBLE_DECK_GATE).verdict).toBe('BETTER');
    expect(first.cell('collective', DOUBLE_DECK_GATE).verdict).toBe('BETTER');

    expect(result.verdict.gate).toBe('BETTER-EVERYWHERE');

    // The base narrowed while the verdict widened, and that is the caution the aggregate word
    // hides: two cells at one operating point, where the previous answer had four at two.
    expect(result.verdict.byCell).toHaveLength(2);
    expect([...result.verdict.byCell].sort()).toEqual([
      'collective@up-peak-1pct:BETTER',
      'eta@up-peak-1pct:BETTER',
    ]);
    console.log(`[double-deck] GATE ${result.verdict.gate} — ${result.verdict.byCell.join(', ')}`);
  }, TIMEOUT_MS);

  it('costs energy in every quotable cell, and does not pay for it by serving fewer people', async () => {
    const result = await study();
    expect(result.verdict.costsEnergyEverywhere).toBe(true);
    for (const point of result.points) {
      if (!point.quotable) continue;
      for (const dispatcher of result.dispatchers) {
        // The axis, never a score (DECISIONS.md § D106): total work, the thing that dominates it,
        // and the per-served-leg figure beside the raw one.
        expect(point.cell(dispatcher, 'energyKJ').verdict).toBe('WORSE');
        expect(point.cell(dispatcher, 'carDistanceM').verdict).toBe('WORSE');
        // `carStarts` used to be WORSE in every cell too and is now INDISTINGUISHABLE under `eta`
        // at 1 % (+0.634 [-0.045, +1.313]), because the extra lobby-level leg the treatment arm
        // used to make was a *start* the control never made and it is gone. The axis has not
        // changed sign — energy and distance are still WORSE everywhere — so this is bounded
        // rather than dropped: a start count that came back BETTER would be a different finding
        // and must not pass silently.
        expect(['WORSE', 'INDISTINGUISHABLE']).toContain(
          point.cell(dispatcher, 'carStarts').verdict,
        );
        // "A configuration that spends less by serving fewer people has not saved anything" — the
        // converse also has to be checked: this one spends more and serves exactly as many.
        const unserved = point.cell(dispatcher, 'unservedFraction');
        expect(unserved.comparison.candidateMean).toBe(0);
        expect(unserved.comparison.baselineMean).toBe(0);
        const perLeg = point.cell(dispatcher, 'energyPerServedLegKJ');
        console.log(
          `[double-deck] ${point.id}/${dispatcher}: energy/leg ${perLeg.estimate.mean.toFixed(3)} kJ ` +
            `(${perLeg.estimate.lower.toFixed(3)} … ${perLeg.estimate.upper.toFixed(3)}) ${perLeg.verdict}`,
        );
        expect(['WORSE', 'INDISTINGUISHABLE']).toContain(perLeg.verdict);
      }
    }
  }, TIMEOUT_MS);

  it('keeps every wait effect below the structural resolution limit, and says so', async () => {
    const result = await study();
    // docs/07-handoff.md § 4: a structurally different pair resolves ~1.9 s at n = 100 on Midtown.
    // Every ΔAWT and ΔWT95 here is smaller than that in magnitude, which is why the gate is TTD and
    // why these rows are reported as costs rather than as the headline.
    for (const point of result.points) {
      if (!point.quotable) continue;
      for (const dispatcher of result.dispatchers) {
        for (const metric of ['awtS', 'wt95S'] as const) {
          const cell = point.cell(dispatcher, metric);
          expect(Math.abs(cell.estimate.mean)).toBeLessThan(1.9);
        }
      }
    }
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * Layer A of the publication guard
 * -------------------------------------------------------------------------- */

describe('the published figures still reproduce', () => {
  it('matches every pinned estimate, in both directions', async () => {
    const mismatches = checkPinned('double-deck', doubleDeckFigures(await study()));
    expect(
      describeMismatches('double-deck', mismatches),
      describeMismatches('double-deck', mismatches),
    ).toBe('');
  }, TIMEOUT_MS);
});
