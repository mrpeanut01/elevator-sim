/**
 * **The hybrid family: fuzz cases whose landings carry their own hall fixtures** — GitHub issue
 * #534 item 1, `DECISIONS.md` § D553, § D570.
 *
 * ## The hole this closes
 *
 * § D553 gave a floor `landingCallType`, and the generator drew none. So **no fuzz case could build
 * a hybrid**, and everything that configuration reaches was unfuzzed: `costRequestFor` and
 * `batchKeyOf` asked per call rather than per run, `Simulation.#assignsAt` as anything but the
 * run-wide gate, the bare kiosk's refusal at one landing and not the next, conservation claim 5
 * counted over a proper subset of the landings, and the `hybrid` comparability object itself.
 * {@link HYBRID_CORPUS} reaches all of it, at 48 pinned seeds, with all six properties checked on
 * every case exactly as `corpus.test.ts` checks them on {@link STANDARD_CORPUS}.
 *
 * ## The two corpora that existed before are untouched, and that is asserted rather than argued
 *
 * `FuzzSpace.landingPanelProbability` is `0` on {@link STANDARD_SPACE} and {@link DEEP_SPACE}, so
 * the `fuzz.landings` stream is never touched there and no floor gains a key. That matters beyond
 * tidiness: the deep tier's two pinned reproductions are **regression records of specific runs**,
 * and a recorded case that quietly became a hybrid would reproduce a different run at the same seed
 * — `run.ts` § `CORPUS_DISPATCHER_PROFILE_IDS`, one axis over. The case below checks it on the
 * corpus rather than trusting the constant.
 *
 * ## What "the honesty properties" can and cannot mean here, stated rather than skipped
 *
 * The issue asks for *"the conservation audit and the honesty properties green"* over this family.
 * The conservation audit is checked directly: `runSimulation` throws on a failed audit, and the
 * audit's own `balanced` flag and `wrongCarBoardings` are asserted on every hybrid case.
 *
 * The ten **honesty properties** live in `packages/viz/src/honesty/` and are predicates over
 * *rendered player-facing strings*; their corpus draws shipped buildings by id and renders screens.
 * No fuzz building is ever rendered, and § D553 clause 9 makes the viewer **refuse**
 * `landingCallType` outright — `editor/editorValidate.ts` raises `landing-call-type-not-playable` at
 * every door a player's building enters by — until stage 2 teaches `frame/pinnedQueue`,
 * `render/overlay`, `mode/disclosure`, `render/describeFrame`, `shift/report` and
 * `access/dispatcherCredentials` to describe a hybrid run. So a hybrid run cannot reach an honesty
 * surface today **by design**, and driving one there would mean lifting a refusal stage 2 owns.
 *
 * What is in reach, and is asserted here, is the same question one layer down: a hybrid run must not
 * publish a claim it is not entitled to. Every hybrid case is required to raise the § D553
 * disclaimer and to mark the nine model-sensitive metrics not comparable — so no case in this family
 * offers an AWT that a reader could pair against a conventional run's.
 */

import {
  loadConfig,
  runSimulation,
  MODEL_SENSITIVE_METRIC_IDS,
  StreamSet,
  type LoadedConfig,
} from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  DEEP_HYBRID_SPACE,
  HYBRID_CORPUS,
  HYBRID_SPACE,
  STANDARD_CORPUS,
  STANDARD_SPACE,
  deepCampaignRequested,
  deepCampaignSize,
  deepHybridSeeds,
  formatStats,
  runCampaign,
} from './campaign.js';
import { callCarriesCredential, caseFromSeed, drawLandingCallTypes } from './generate.js';
import { fuzzSimulationConfigFor, generateOptionsFrom } from './run.js';
import { formatOutcome } from './shrink.js';
import type { FuzzCase } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/**
 * The census of {@link HYBRID_CORPUS}, measured on the tree this family landed on.
 *
 * Pinned rather than described, for `generate.test.ts`'s reason: a family whose landings quietly
 * stopped disagreeing would still pass every property and would no longer be the family its name
 * claims. A fourteenth dispatcher profile, a re-ordered draw or a narrowed space fails here.
 */
const CENSUS = Object.freeze({
  cases: 48,
  /** Cases that declare a fixture on every landing — the axis fired. */
  landingFixtures: 44,
  /** Cases with at least one landing carrying a destination panel. */
  landingPanels: 44,
  /** Cases whose landings **disagree**, which is the `hybrid` passenger model. */
  hybridLandings: 18,
});

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

function hybridCases(): readonly FuzzCase[] {
  const options = generateOptionsFrom(config, HYBRID_SPACE);
  return HYBRID_CORPUS.map((seed) => caseFromSeed(seed, options));
}

function tally(cases: readonly FuzzCase[], tag: string): number {
  return cases.filter((fuzzCase) => fuzzCase.tags.includes(tag)).length;
}

/* -------------------------------------------------------------------------- *
 * The family is the family it says it is
 * -------------------------------------------------------------------------- */

describe('the hybrid family draws landing call types', () => {
  it('holds its pinned census, so a narrowed draw fails here rather than passing quietly', () => {
    const cases = hybridCases();
    expect(cases).toHaveLength(CENSUS.cases);
    expect(tally(cases, 'landing-fixtures')).toBe(CENSUS.landingFixtures);
    expect(tally(cases, 'landing-panels')).toBe(CENSUS.landingPanels);
    expect(tally(cases, 'hybrid-landings')).toBe(CENSUS.hybridLandings);
  });

  it('puts a fixture on every landing of a case the axis fired on, and none on one it did not', () => {
    for (const fuzzCase of hybridCases()) {
      const floors = fuzzCase.building.floors ?? [];
      const declared = floors.filter((floor) => floor.landingCallType !== undefined);
      // All or nothing per case: the draw decodes the whole space, so a partly-declared building
      // would mean a floor fell out of the space between the draw and the authoring.
      expect(declared.length, fuzzCase.caseId).toBe(
        fuzzCase.tags.includes('landing-fixtures') ? floors.length : 0,
      );
    }
  });

  it('never draws an uncredentialed destination landing beside access zones, which is C35 unfixed', () => {
    /*
     * `tuning/space/landings.ts#panelCallTypeFor` clause 3, checked on the corpus.
     *
     * A destination call carrying **no credential**, whose head of queue is bound for a restricted
     * floor, strands everybody behind them — `DECISIONS.md` § D128 (`C35`), measured at 32 failures
     * in 2 000 deep cases and **open**. A family that drew it would report a known `core` defect as
     * its own finding, which is the mistake the `unroutable` skip exists to keep out of the
     * campaign.
     *
     * The rule is about the **credential and not the fixture**: a `destination-entry` landing is
     * fine beside a panel dispatcher, because `Simulation.#callValue` stamps `panelAuthorized` at
     * every assigning landing and `#bankCanCarry` — the access check itself — has already run. So
     * the assertion asks `callCarriesCredential`, the generator's own predicate, rather than
     * banning a call type outright; `fuzz-2000028` is a case that legitimately carries seven of
     * them.
     */
    let checked = 0;
    for (const fuzzCase of hybridCases()) {
      if (!fuzzCase.tags.includes('access-zones')) continue;
      const kiosks = (fuzzCase.building.floors ?? []).filter(
        (floor) => floor.landingCallType === 'destination-entry',
      );
      if (kiosks.length === 0) continue;
      const profile = config.dispatcherProfilesById.get(fuzzCase.dispatcherProfileId);
      expect(profile, fuzzCase.dispatcherProfileId).toBeDefined();
      if (profile === undefined) continue;
      expect(
        callCarriesCredential(profile, 'destination-entry'),
        `${fuzzCase.caseId} puts a kiosk on ${kiosks.map((floor) => floor.id).join(', ')} beside access zones, and its calls carry no credential`,
      ).toBe(true);
      checked += 1;
    }
    // Not vacuous: at least one access-zoned case in this family does declare kiosks.
    expect(checked).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The gate: all six properties, and the conservation audit
 * -------------------------------------------------------------------------- */

describe('the hybrid family holds all six properties on every pinned case', () => {
  it('finds no counterexample and skips nothing', () => {
    const campaign = runCampaign({ config, seeds: HYBRID_CORPUS, space: HYBRID_SPACE });

    if (campaign.failures.length > 0) {
      const report = campaign.failures
        .map(
          (failure) =>
            `original:\n${formatOutcome(failure.original)}\n\nshrunk in ${String(failure.steps)} steps (${String(failure.evaluations)} evaluations):\n${formatOutcome(failure.minimal)}`,
        )
        .join('\n\n========\n\n');
      throw new Error(
        `hybrid fuzz family found ${String(campaign.failures.length)} counterexample(s)\n\n${report}`,
      );
    }

    // Not a silent cap: what this gate actually ran, on the record.
    console.log(`\nfuzz hybrid family\n${formatStats(campaign.stats)}\n`);

    expect(campaign.stats.failures).toBe(0);
    expect(campaign.stats.skipped).toBe(0);
    // A family that generated nobody would pass every property vacuously.
    expect(campaign.stats.generatedPassengers).toBeGreaterThan(2000);
  }, 300_000);

  it('balances the conservation audit on every hybrid case, and boards nobody on an unnamed car', () => {
    let hybrid = 0;
    for (const fuzzCase of hybridCases()) {
      if (!fuzzCase.tags.includes('hybrid-landings')) continue;
      const result = runSimulation(fuzzSimulationConfigFor(fuzzCase, { config }));
      hybrid += 1;

      // The run is the configuration the tag claims, read off `core` rather than off the tag.
      expect(result.comparability.passengerModel, fuzzCase.caseId).toBe('hybrid');
      const assigning = result.comparability.assigningFloorIds ?? [];
      expect(assigning.length, fuzzCase.caseId).toBeGreaterThan(0);
      expect(assigning.length, fuzzCase.caseId).toBeLessThan(
        (fuzzCase.building.floors ?? []).length,
      );

      // The audit. `runSimulation` throws on a failed one, so reaching here is most of the claim;
      // `balanced` and `wrongCarBoardings` are the two halves a hybrid could break that a uniform
      // run could not — claim 5 counts promisable legs at the landings that assign.
      expect(result.conservation.balanced, fuzzCase.caseId).toBe(true);
      expect(result.conservation.wrongCarBoardings, fuzzCase.caseId).toBe(0);
      expect(result.conservation.legsRecorded, fuzzCase.caseId).toBe(
        result.conservation.legsCreated,
      );
    }
    expect(hybrid).toBe(CENSUS.hybridLandings);
  }, 300_000);

  it('publishes no pairing a hybrid run is not entitled to', () => {
    for (const fuzzCase of hybridCases()) {
      if (!fuzzCase.tags.includes('hybrid-landings')) continue;
      const result = runSimulation(fuzzSimulationConfigFor(fuzzCase, { config }));
      // The nine change construct under a panel, so a hybrid may be paired on the fourteen alone.
      expect(result.comparability.notComparableMetrics, fuzzCase.caseId).toEqual(
        MODEL_SENSITIVE_METRIC_IDS,
      );
      // …and the run says so out loud, naming the landings that made it hybrid.
      expect(
        result.warnings.some((warning) => warning.includes('§ D553')),
        fuzzCase.caseId,
      ).toBe(true);
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * The two corpora that existed before
 * -------------------------------------------------------------------------- */

describe('the axis is off in the two spaces that had pinned corpora', () => {
  it('spends no draw at all when the probability is zero, rather than drawing and discarding', () => {
    // The stream is not touched, which is what makes every case those corpora ever generated
    // byte-identical to what it was: a draw-and-discard would advance `fuzz.landings` and change
    // nothing today, but it would make the axis's own arithmetic depend on the order of this file.
    const profile = config.dispatcherProfilesById.get('eta');
    expect(profile).toBeDefined();
    if (profile === undefined) return;
    const stream = new StreamSet(1).derive('fuzz.landings');
    const before = stream.nextFloat();
    const after = new StreamSet(1).derive('fuzz.landings');
    const draw = drawLandingCallTypes(after, STANDARD_SPACE, ['G', '2'], profile, 'up-down-buttons', false);
    expect(draw.declared).toEqual({});
    expect(draw.panels).toBe(0);
    expect(draw.hybrid).toBe(false);
    expect(after.nextFloat()).toBe(before);
  });

  it('declares no landing call type anywhere in the always-on corpus', () => {
    expect(STANDARD_SPACE.landingPanelProbability).toBe(0);
    const options = generateOptionsFrom(config, STANDARD_SPACE);
    for (const seed of STANDARD_CORPUS) {
      const fuzzCase = caseFromSeed(seed, options);
      expect(
        (fuzzCase.building.floors ?? []).filter((floor) => floor.landingCallType !== undefined),
        fuzzCase.caseId,
      ).toEqual([]);
      for (const tag of ['landing-fixtures', 'landing-panels', 'hybrid-landings']) {
        expect(fuzzCase.tags, fuzzCase.caseId).not.toContain(tag);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The deep arm
 * -------------------------------------------------------------------------- */

describe.skipIf(!deepCampaignRequested())('the deep hybrid campaign', () => {
  it('holds all six properties over a contiguous seed range in the wider space', () => {
    const seeds = deepHybridSeeds(deepCampaignSize());
    const campaign = runCampaign({ config, seeds, space: DEEP_HYBRID_SPACE });

    if (campaign.failures.length > 0) {
      const report = campaign.failures
        .map((failure) => formatOutcome(failure.minimal))
        .join('\n\n========\n\n');
      throw new Error(
        `deep hybrid campaign found ${String(campaign.failures.length)} counterexample(s)\n\n${report}`,
      );
    }
    console.log(`\nfuzz hybrid family (deep)\n${formatStats(campaign.stats)}\n`);
    expect(campaign.stats.failures).toBe(0);
    expect(campaign.stats.skipped).toBe(0);
  }, 3_600_000);
});
